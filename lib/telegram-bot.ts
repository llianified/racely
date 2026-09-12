import "server-only";

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { REFERRAL_PARAM_PREFIX } from "./game";

export const MAX_TELEGRAM_UPDATE_BYTES = 64 * 1024;

const DEFAULT_BOT_USERNAME = "RacelyBot";

/** Username bot untuk membangun deep link. Staging cukup override lewat env. */
export function botUsername() {
  const raw = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  return raw && /^[A-Za-z0-9_]{5,32}$/.test(raw) ? raw : DEFAULT_BOT_USERNAME;
}

/** `startapp` membuka Mini App langsung, bukan cuma chat botnya. */
export function referralLink(userId: string) {
  return `https://t.me/${botUsername()}?startapp=${REFERRAL_PARAM_PREFIX}${userId}`;
}

const telegramMessageSchema = z
  .object({
    message_id: z.number().int().nonnegative(),
    chat: z.object({
      id: z.number().int(),
      type: z.enum(["private", "group", "supergroup", "channel"]),
    }),
    text: z.string().max(4096).optional(),
  })
  .passthrough();

export const telegramUpdateSchema = z
  .object({
    update_id: z.number().int().nonnegative(),
    message: telegramMessageSchema.optional(),
  })
  .passthrough();

const botTokenSchema = z
  .string()
  .min(20)
  .regex(/^\d+:[A-Za-z0-9_-]+$/);

export type TelegramReply = {
  chat_id: number;
  text: string;
  reply_markup: {
    inline_keyboard: Array<
      Array<{ text: string; web_app: { url: string } }>
    >;
  };
};

export function isValidWebhookSecret(
  received: string | null,
  expected: string | undefined,
) {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export function parsePublicAppUrl(value = process.env.PUBLIC_APP_URL) {
  if (!value) throw new Error("PUBLIC_APP_URL is not configured.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PUBLIC_APP_URL is invalid.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("PUBLIC_APP_URL must be a public HTTPS URL.");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

export function buildTelegramReply(
  update: unknown,
  publicAppUrl: string,
): TelegramReply | null {
  const parsed = telegramUpdateSchema.safeParse(update);
  if (!parsed.success) return null;
  const message = parsed.data.message;
  if (!message?.text || message.chat.type !== "private") return null;

  const commandToken = message.text.trim().split(/\s+/, 1)[0]?.toLowerCase();
  const command = commandToken?.split("@", 1)[0];
  const isLaunchCommand = command === "/start" || command === "/play";

  return {
    chat_id: message.chat.id,
    text: isLaunchCommand
      ? "Mesin siap. Buka Racely untuk memilih mobil dan mulai balapan."
      : "Gunakan /play atau tombol di bawah untuk membuka Racely.",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Main Racely",
            web_app: { url: publicAppUrl },
          },
        ],
      ],
    },
  };
}

export async function sendTelegramReply(reply: TelegramReply) {
  const token = botTokenSchema.safeParse(process.env.TELEGRAM_BOT_TOKEN);
  if (!token.success) throw new Error("TELEGRAM_BOT_TOKEN is not configured.");

  const response = await fetch(
    `https://api.telegram.org/bot${token.data}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reply),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) throw new Error("Telegram rejected the bot response.");
}
