import { NextResponse } from "next/server";
import { withRaceOpponents } from '@/lib/race-opponents-server';
import { getGameState } from "@/lib/game-server";
import {
  getPreviewGameState,
  PREVIEW_GAME_COOKIE,
} from "@/lib/preview-game";
import {
  authenticateTelegramRequest,
  getOrCreatePreviewIdentity,
  PREVIEW_SESSION_COOKIE,
  sessionCookieOptions,
  TelegramAuthError,
} from "@/lib/telegram-auth";
import { consumeRateLimit, GAME_STATE_RULE } from "@/lib/rate-limit";
import { readEconomyConfig } from "@/lib/economy-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const preview = getOrCreatePreviewIdentity(request);
    const identity = preview?.identity ?? authenticateTelegramRequest(request);

    // Reading state still costs a locked row and a pool connection, so throttle
    // it per player the same way the mutating route does.
    const limit = consumeRateLimit(
      `state:${identity.userId}`,
      GAME_STATE_RULE,
    );
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Terlalu banyak permintaan. Tunggu sebentar." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(limit.retryAfterSeconds),
          },
        },
      );
    }

    const previewGame = preview
      ? getPreviewGameState(request, identity, await readEconomyConfig())
      : null;
    const game = previewGame?.state ?? (await getGameState(identity));
    const response = NextResponse.json(await withRaceOpponents(identity.userId, game), {
      headers: { "Cache-Control": "no-store" },
    });
    const cookieOptions = sessionCookieOptions(request);

    if (preview?.isNew) {
      response.cookies.set(
        PREVIEW_SESSION_COOKIE,
        preview.sessionId,
        cookieOptions,
      );
    }
    if (previewGame) {
      response.cookies.set(
        PREVIEW_GAME_COOKIE,
        previewGame.cookieValue,
        cookieOptions,
      );
    }

    return response;
  } catch (error) {
    if (error instanceof TelegramAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "Racely belum bisa memuat progresmu. Coba lagi." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
