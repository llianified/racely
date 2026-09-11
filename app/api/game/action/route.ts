import { NextResponse } from "next/server";
import {
  GameRuleError,
  gameActionSchema,
  performGameAction,
} from "@/lib/game-server";
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
    const body = gameActionSchema.safeParse(await request.json());
    if (!body.success)
      return NextResponse.json(
        { error: "Aksi game tidak valid." },
        { status: 400 },
      );

    const game = await performGameAction(
      identity,
      body.data.requestId,
      body.data.action,
    );
    return NextResponse.json(game, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TelegramAuthError)
      return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof GameRuleError)
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
