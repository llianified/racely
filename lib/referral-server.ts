import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import type { EconomyConfig } from "@/lib/economy-config";
import type { ReferralGreeting } from "@/lib/telegram-bot";

/**
 * Konteks sosial untuk balasan `/start ref_<id>`. Null kalau pengajaknya tidak
 * dikenal atau orang itu sendiri -- bot lalu membalas dengan sapaan biasa,
 * dan `bindReferrer` di sisi game tetap menolak kasus yang sama.
 */
export async function readReferralGreeting(
  inviterId: string,
  chatId: number,
  economy: EconomyConfig,
): Promise<ReferralGreeting | null> {
  if (!db || inviterId === String(chatId)) return null;
  const [inviter] = await db
    .select({ displayName: players.displayName })
    .from(players)
    .where(eq(players.userId, inviterId))
    .limit(1)
    .catch(() => []);
  if (!inviter) return null;
  return {
    inviterId,
    inviterName: inviter.displayName.trim() || "temanmu",
    inviteeBonus: economy.referralRewardInvitee,
    milestoneLaps: economy.referralMilestoneLaps,
  };
}
