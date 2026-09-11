import { NextResponse } from "next/server";
import {
  buildTelegramReply,
  isValidWebhookSecret,
  MAX_TELEGRAM_UPDATE_BYTES,
  parsePublicAppUrl,
  sendTelegramReply,
  telegramUpdateSchema,
} from "@/lib/telegram-bot";
import {
  claimTelegramUpdate,
  releaseTelegramUpdate,
} from "@/lib/telegram-updates";

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

  const update = telegramUpdateSchema.safeParse(payload);
  if (!update.success) {
    return NextResponse.json(
      { error: "Update tidak valid." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  let publicAppUrl: string;
  try {
    publicAppUrl = parsePublicAppUrl();
  } catch {
    return NextResponse.json(
      { error: "Webhook belum dikonfigurasi." },
      { status: 503, headers: noStoreHeaders },
    );
  }

  const updateId = update.data.update_id;
  if (!(await claimTelegramUpdate(updateId))) {
    return NextResponse.json(
      { ok: true, duplicate: true },
      { headers: noStoreHeaders },
    );
  }

  try {
    const reply = buildTelegramReply(update.data, publicAppUrl);
    if (reply) await sendTelegramReply(reply);
    return NextResponse.json({ ok: true }, { headers: noStoreHeaders });
  } catch {
    // Hand the claim back so Telegram's retry is not silently swallowed.
    await releaseTelegramUpdate(updateId);
    return NextResponse.json(
      { error: "Bot belum bisa memproses update." },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
