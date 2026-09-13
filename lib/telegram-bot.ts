import "server-only";

import { timingSafeEqual } from "node:crypto";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { readEconomyConfig } from "@/lib/economy-store";
import { coins, REFERRAL_PARAM_PREFIX } from "./game";

export const MAX_TELEGRAM_UPDATE_BYTES = 64 * 1024;

const DEFAULT_BOT_USERNAME = "RacelyBot";

/** Username bot untuk membangun deep link. Staging cukup override lewat env. */
export function botUsername() {
  const raw = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  return raw && /^[A-Za-z0-9_]{5,32}$/.test(raw) ? raw : DEFAULT_BOT_USERNAME;
}

/** Membuka chat bot agar pemain baru melihat konteks ajakan sebelum bermain. */
export function referralLink(userId: string) {
  return `https://t.me/${botUsername()}?start=${REFERRAL_PARAM_PREFIX}${userId}`;
}

/** Dibuka dari tombol balasan bot agar `start_param` ikut masuk ke Mini App. */
function referralMiniAppLink(userId: string) {
  return `https://t.me/${botUsername()}?startapp=${REFERRAL_PARAM_PREFIX}${userId}`;
}

const telegramMessageSchema = z
  .object({
    message_id: z.number().int().nonnegative(),
    chat: z.object({
      id: z.number().int(),
      type: z.enum(["private", "group", "supergroup", "channel"]),
    }),
    from: z.object({ id: z.number().int().positive() }).passthrough().optional(),
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

type TelegramReplyButton =
  | { text: string; web_app: { url: string } }
  | { text: string; url: string };

export type TelegramReply = {
  chat_id: number;
  text: string;
  reply_markup: {
    inline_keyboard: TelegramReplyButton[][];
  };
};

export type ReferralStartContext = {
  inviterId: string;
  inviterName: string;
  milestoneLaps: number;
  inviterReward: number;
  inviteeReward: number;
};

type ReferralStartParticipants = {
  inviterName: string;
  invitee: { referredBy: string | null; laps: number } | null;
};

export type ReferralStartLookup = (
  inviterId: string,
  inviteeId: string,
) => Promise<ReferralStartParticipants | null>;

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

export function parseReferralStart(update: unknown) {
  const parsed = telegramUpdateSchema.safeParse(update);
  if (!parsed.success) return null;
  const message = parsed.data.message;
  if (!message?.text || message.chat.type !== "private") return null;

  const match = message.text
    .trim()
    .match(/^\/start(?:@[A-Za-z0-9_]{5,32})?\s+ref_([1-9]\d{0,19})$/i);
  if (!match) return null;

  const inviterId = match[1];
  const inviteeId = String(message.from?.id ?? message.chat.id);
  if (inviterId === inviteeId) return null;
  return { inviterId, inviteeId };
}

async function lookupReferralStart(
  inviterId: string,
  inviteeId: string,
): Promise<ReferralStartParticipants | null> {
  if (!db) return null;
  const rows = await db
    .select({
      userId: players.userId,
      displayName: players.displayName,
      referredBy: players.referredBy,
      laps: players.laps,
    })
    .from(players)
    .where(inArray(players.userId, [inviterId, inviteeId]));
  const inviter = rows.find((row) => row.userId === inviterId);
  if (!inviter) return null;
  const invitee = rows.find((row) => row.userId === inviteeId);
  return {
    inviterName: inviter.displayName,
    invitee: invitee
      ? { referredBy: invitee.referredBy, laps: invitee.laps }
      : null,
  };
}

export async function resolveReferralStartContext(
  update: unknown,
  lookup: ReferralStartLookup = lookupReferralStart,
  loadEconomy = readEconomyConfig,
): Promise<ReferralStartContext | null> {
  const request = parseReferralStart(update);
  if (!request) return null;

  const participants = await lookup(request.inviterId, request.inviteeId);
  if (!participants) return null;
  const invitee = participants.invitee;
  if (invitee && (invitee.referredBy !== null || invitee.laps > 0)) {
    return null;
  }

  const economy = await loadEconomy();
  return {
    inviterId: request.inviterId,
    inviterName: participants.inviterName.trim() || "Seorang teman",
    milestoneLaps: economy.referralMilestoneLaps,
    inviterReward: economy.referralRewardInviter,
    inviteeReward: economy.referralRewardInvitee,
  };
}

export function buildTelegramReply(
  update: unknown,
  publicAppUrl: string,
  referral: ReferralStartContext | null = null,
): TelegramReply | null {
  const parsed = telegramUpdateSchema.safeParse(update);
  if (!parsed.success) return null;
  const message = parsed.data.message;
  if (!message?.text || message.chat.type !== "private") return null;

  const commandToken = message.text.trim().split(/\s+/, 1)[0]?.toLowerCase();
  const command = commandToken?.split("@", 1)[0];
  const isLaunchCommand = command === "/start" || command === "/play";
  const isReferralStart = command === "/start" && referral !== null;

  return {
    chat_id: message.chat.id,
    text: isReferralStart
      ? `${referral.inviterName} mengajakmu balapan di Racely. Selesaikan ${referral.milestoneLaps.toLocaleString("id-ID")} putaran untuk mendapat ${coins(referral.inviteeReward)}; pengajakmu mendapat ${coins(referral.inviterReward)}.`
      : isLaunchCommand
        ? "Mesin siap. Buka Racely untuk memilih mobil dan mulai balapan."
        : "Gunakan /play atau tombol di bawah untuk membuka Racely.",
    reply_markup: {
      inline_keyboard: [
        [
          isReferralStart
            ? {
                text: "Main dan ambil bonus",
                url: referralMiniAppLink(referral.inviterId),
              }
            : {
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
