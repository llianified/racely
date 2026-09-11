import { NextResponse } from "next/server";
import {
  buildTelegramReply,
  isValidWebhookSecret,
  MAX_TELEGRAM_UPDATE_BYTES,
  parsePublicAppUrl,
  sendTelegramReply,
  telegramUpdateSchema,
} from "@/lib/telegram-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Webhook belum dikonfigurasi." },
      { status: 503, headers: noStoreHeaders },
    );
  }

  if (
    !isValidWebhookSecret(
      request.headers.get("x-telegram-bot-api-secret-token"),
      expectedSecret,
    )
  ) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_TELEGRAM_UPDATE_BYTES) {
    return NextResponse.json(
      { error: "Payload terlalu besar." },
      { status: 413, headers: noStoreHeaders },
    );
  }

  const source = await request.text();
  if (Buffer.byteLength(source, "utf8") > MAX_TELEGRAM_UPDATE_BYTES) {
    return NextResponse.json(
      { error: "Payload terlalu besar." },
      { status: 413, headers: noStoreHeaders },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(source);
  } catch {
    return NextResponse.json(
      { error: "Payload tidak valid." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  if (!telegramUpdateSchema.safeParse(payload).success) {
    return NextResponse.json(
      { error: "Update tidak valid." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    const reply = buildTelegramReply(payload, parsePublicAppUrl());
    if (reply) await sendTelegramReply(reply);
    return NextResponse.json(
      { ok: true },
      { headers: noStoreHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "Bot belum bisa memproses update." },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
