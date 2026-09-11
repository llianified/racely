import { NextResponse } from "next/server";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const preview = getOrCreatePreviewIdentity(request);
    const identity = preview?.identity ?? authenticateTelegramRequest(request);
    const previewGame = preview
      ? getPreviewGameState(request, identity)
      : null;
    const game = previewGame?.state ?? (await getGameState(identity));
    const response = NextResponse.json(game, {
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
