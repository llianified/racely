import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/leaderboard-server";
import { previewLeaderboard } from "@/lib/leaderboard";
import { getPreviewGameState } from "@/lib/preview-game";
import { readEconomyConfig } from "@/lib/economy-store";
import {
  authenticateTelegramRequest,
  isPreviewBypassAllowed,
  TelegramAuthError,
} from "@/lib/telegram-auth";
import { consumeRateLimit, type RateLimitRule } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEADERBOARD_RULE: RateLimitRule = { capacity: 5, refillPerSecond: 1 / 10 };
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" };

export async function GET(request: Request) {
  try {
    const identity = authenticateTelegramRequest(request);
    const limit = consumeRateLimit(`leaderboard:${identity.userId}`, LEADERBOARD_RULE);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Terlalu sering memperbarui peringkat. Tunggu sebentar." },
        { status: 429, headers: { ...privateHeaders, "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    if (identity.userId.startsWith("preview:")) {
      // Gerbangnya dibaca dari lib/telegram-auth.ts, bukan ditulis ulang di
      // sini: dua salinan syarat yang sama pernah memberi dua jawaban berbeda.
      if (!isPreviewBypassAllowed(request)) {
        throw new TelegramAuthError();
      }
      // Never write the preview cookie here: a leaderboard read must not
      // overwrite a concurrent game action. Preview racers never enter SQL.
      const { state } = getPreviewGameState(request, identity, await readEconomyConfig());
      return NextResponse.json(previewLeaderboard(state), { headers: privateHeaders });
    }

    return NextResponse.json(await getLeaderboard(identity.userId), { headers: privateHeaders });
  } catch (error) {
    if (error instanceof TelegramAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401, headers: privateHeaders });
    }
    return NextResponse.json(
      { error: "Leaderboard belum bisa dimuat. Progres balapanmu tetap aman. Coba lagi sebentar." },
      { status: 503, headers: { ...privateHeaders, "Retry-After": "30" } },
    );
  }
}
