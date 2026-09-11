import { NextResponse } from "next/server";
import {
  GameRuleError,
  gameActionSchema,
  performGameAction,
} from "@/lib/game-server";
import {
  performPreviewGameAction,
  PREVIEW_GAME_COOKIE,
  PreviewGameRuleError,
} from "@/lib/preview-game";
import {
  authenticateTelegramRequest,
  TelegramAuthError,
} from "@/lib/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 2048)
      return NextResponse.json(
        { error: "Permintaan terlalu besar." },
        { status: 413 },
      );

    const identity = authenticateTelegramRequest(request);
    const payload: unknown = await request.json();
    const isCookiePreview = identity.userId.startsWith("preview:");
    const body = gameActionSchema.safeParse(payload);
    if (!body.success)
      return NextResponse.json(
        { error: "Aksi game tidak valid." },
        { status: 400 },
      );

    const previewGame =
      isCookiePreview
        ? performPreviewGameAction(
            request,
            identity,
            body.data.requestId,
            body.data.action,
          )
        : null;
    const game =
      previewGame?.state ??
      (await performGameAction(
        identity,
        body.data.requestId,
        body.data.action,
      ));
    const response = NextResponse.json(game, {
      headers: { "Cache-Control": "no-store" },
    });
    if (previewGame) {
      response.cookies.set(PREVIEW_GAME_COOKIE, previewGame.cookieValue, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof TelegramAuthError)
      return NextResponse.json({ error: error.message }, { status: 401 });
    if (
      error instanceof GameRuleError ||
      error instanceof PreviewGameRuleError
    )
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json(
        { error: "Isi permintaan tidak valid." },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "Aksi belum bisa diproses. Coba lagi." },
      { status: 500 },
    );
  }
}
