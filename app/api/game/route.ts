import { NextResponse } from "next/server";
import { getGameState } from "@/lib/game-server";
import {
  authenticateTelegramRequest,
  getOrCreatePreviewIdentity,
  PREVIEW_SESSION_COOKIE,
  TelegramAuthError,
} from "@/lib/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const preview = getOrCreatePreviewIdentity(request);
    const identity = preview?.identity ?? authenticateTelegramRequest(request);
    const game = await getGameState(identity);
    const response = NextResponse.json(game, {
      headers: { "Cache-Control": "no-store" },
    });

    if (preview?.isNew) {
      response.cookies.set(PREVIEW_SESSION_COOKIE, preview.sessionId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
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
