import { NextResponse } from "next/server";
import {
  buildTelegramReply,
  isValidWebhookSecret,
  MAX_TELEGRAM_UPDATE_BYTES,
  parsePublicAppUrl,
  parseStartReferral,
  sendTelegramReply,
  telegramUpdateSchema,
} from "@/lib/telegram-bot";
import {
  claimTelegramUpdate,
  releaseTelegramUpdate,
} from "@/lib/telegram-updates";
import { recordBotChat } from "@/lib/bot-chats";
import { readReferralGreeting } from "@/lib/referral-server";
import { readEconomyConfig } from "@/lib/economy-store";
import { readTextBody, RequestBodyTooLargeError } from "@/lib/http-body";

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

  let payload: unknown;
  try {
    payload = JSON.parse(
      await readTextBody(request, MAX_TELEGRAM_UPDATE_BYTES),
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "Payload terlalu besar." },
        { status: 413, headers: noStoreHeaders },
      );
    }
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
    // Pesan privat ini adalah satu-satunya izin yang Telegram berikan untuk
    // menghubungi pemain nanti; catat sebelum membalas.
    const chat = update.data.message?.chat;
    if (chat?.type === "private") await recordBotChat(chat.id);

    // `/start ref_<id>`: sebutkan siapa yang mengajak dan bonusnya. Gagal
    // membaca konteksnya tidak boleh menahan sapaan biasa.
    const inviterId = parseStartReferral(update.data.message?.text);
    const greeting =
      inviterId && chat?.type === "private"
        ? await readReferralGreeting(
            inviterId,
            chat.id,
            await readEconomyConfig(),
          ).catch(() => null)
        : null;

    const reply = buildTelegramReply(update.data, publicAppUrl, greeting);
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
