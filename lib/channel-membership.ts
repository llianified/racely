import "server-only";
import { z } from "zod";
import {
  RACELY_CHANNEL_USERNAME,
  type RacelyChannelErrorCode,
} from "@/lib/racely-channel";

export class ChannelMembershipError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 503,
    readonly code: RacelyChannelErrorCode,
  ) {
    super(message);
    this.name = "ChannelMembershipError";
  }
}

const telegramMemberSchema = z.object({
  status: z.enum([
    "creator",
    "administrator",
    "member",
    "restricted",
    "left",
    "kicked",
  ]),
  is_member: z.boolean().optional(),
});

const telegramResponseSchema = z.object({
  ok: z.boolean(),
  result: telegramMemberSchema.optional(),
});

const MEMBER_CACHE_TTL_MS = 60_000;
const MEMBER_CACHE_LIMIT = 10_000;
type CachedMembership = { checkedAt: number };

const globalForMembership = globalThis as unknown as {
  racelyChannelMembers?: Map<string, CachedMembership>;
};
const memberCache = (globalForMembership.racelyChannelMembers ??= new Map<
  string,
  CachedMembership
>());

export function resetChannelMembershipCache() {
  memberCache.clear();
}

function sweepMemberCache(now: number) {
  for (const [userId, membership] of memberCache) {
    if (now - membership.checkedAt <= MEMBER_CACHE_TTL_MS) break;
    memberCache.delete(userId);
  }
  while (memberCache.size > MEMBER_CACHE_LIMIT) {
    const oldest = memberCache.keys().next();
    if (oldest.done) break;
    memberCache.delete(oldest.value);
  }
}

function membershipUnavailable() {
  return new ChannelMembershipError(
    "Status keanggotaan channel belum bisa diperiksa. Coba lagi.",
    503,
    "CHANNEL_MEMBERSHIP_UNAVAILABLE",
  );
}

function isActiveMember(member: z.infer<typeof telegramMemberSchema>) {
  if (
    member.status === "creator" ||
    member.status === "administrator" ||
    member.status === "member"
  ) {
    return true;
  }
  return member.status === "restricted" && member.is_member === true;
}

/**
 * Telegram hanya menjamin hasil getChatMember untuk pengguna lain saat bot
 * menjadi administrator channel. Kegagalan API harus tetap tertutup agar
 * gangguan konfigurasi tidak diam-diam melewati gerbang wajib ini.
 */
export async function requireRacelyChannelMembership(
  userId: string,
  now = Date.now(),
) {
  sweepMemberCache(now);
  const cached = memberCache.get(userId);
  if (cached && now - cached.checkedAt <= MEMBER_CACHE_TTL_MS) return;

  if (!/^[1-9]\d{0,15}$/.test(userId)) throw membershipUnavailable();
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw membershipUnavailable();

  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/bot${botToken}/getChatMember`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: RACELY_CHANNEL_USERNAME,
          user_id: userId,
        }),
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      },
    );
  } catch {
    throw membershipUnavailable();
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw membershipUnavailable();
  }
  const parsed = telegramResponseSchema.safeParse(body);
  if (
    !response.ok ||
    !parsed.success ||
    !parsed.data.ok ||
    !parsed.data.result
  ) {
    throw membershipUnavailable();
  }

  if (!isActiveMember(parsed.data.result)) {
    throw new ChannelMembershipError(
      `Gabung ${RACELY_CHANNEL_USERNAME} dulu untuk membuka Racely.`,
      403,
      "CHANNEL_MEMBERSHIP_REQUIRED",
    );
  }

  memberCache.delete(userId);
  memberCache.set(userId, { checkedAt: now });
}
