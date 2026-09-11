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
  getOrCreatePreviewIdentity,
  PREVIEW_SESSION_COOKIE,
  sessionCookieOptions,
  TelegramAuthError,
} from "@/lib/telegram-auth";
import { consumeRateLimit } from "@/lib/rate-limit";

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

    // Mirrors GET /api/game: a preview visitor may not have a session cookie yet
    // (first mutation of the session), so mint one instead of failing auth.
    const preview = getOrCreatePreviewIdentity(request);
    const identity = preview?.identity ?? authenticateTelegramRequest(request);

    // This endpoint mutates balances, so throttle per authenticated player.
    const limit = consumeRateLimit(identity.userId);
    if (!limit.allowed)
      return NextResponse.json(
        { error: "Terlalu banyak aksi. Tunggu sebentar." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(limit.retryAfterSeconds),
          },
        },
      );

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
    if (preview?.isNew) {
      response.cookies.set(
        PREVIEW_SESSION_COOKIE,
        preview.sessionId,
        sessionCookieOptions(request),
      );
    }
    if (previewGame) {
      response.cookies.set(
        PREVIEW_GAME_COOKIE,
        previewGame.cookieValue,
        sessionCookieOptions(request),
      );
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
