import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { botChats } from "@/lib/db/schema";
import {
  buildWithdrawalStatusReply,
  parsePublicAppUrl,
  sendTelegramReply,
  type TelegramReply,
} from "@/lib/telegram-bot";

type TerminalWithdrawalStatus = "paid" | "rejected";

type WithdrawalStatusNotification = {
  userId: string;
  status: TerminalWithdrawalStatus;
  coins: number;
  amountIdr: number;
};

type NotificationDependencies = {
  findChatId?: (userId: string) => Promise<number | null>;
  send?: (reply: TelegramReply) => Promise<void>;
  appUrl?: string;
};

async function findBotChatId(userId: string) {
  if (!db) return null;
  const [chat] = await db
    .select({ userId: botChats.userId })
    .from(botChats)
    .where(eq(botChats.userId, userId))
    .limit(1);
  if (!chat) return null;

  const chatId = Number(chat.userId);
  return Number.isSafeInteger(chatId) && chatId > 0 ? chatId : null;
}

/**
 * Status sudah commit sebelum fungsi ini dipanggil. Telegram bersifat best
 * effort: bot hanya boleh menghubungi pemain yang pernah membuka chat, dan
 * kegagalan Bot API tidak boleh membatalkan keputusan manual operator.
 */
export async function notifyWithdrawalStatus(
  notification: WithdrawalStatusNotification,
  dependencies: NotificationDependencies = {},
) {
  try {
    const chatId = await (dependencies.findChatId ?? findBotChatId)(
      notification.userId,
    );
    if (!chatId) return false;

    const appUrl = dependencies.appUrl ?? parsePublicAppUrl();
    await (dependencies.send ?? sendTelegramReply)(
      buildWithdrawalStatusReply({
        chatId,
        status: notification.status,
        coinAmount: notification.coins,
        amountIdr: notification.amountIdr,
        publicAppUrl: appUrl,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
