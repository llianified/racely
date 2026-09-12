import "server-only";

import { db } from "@/lib/db";
import { botChats } from "@/lib/db/schema";

/**
 * Telegram melarang bot memulai percakapan: pemain harus mengirim pesan lebih
 * dulu. Webhook memanggil ini pada setiap pesan privat supaya penyapu
 * pemberitahuan idle tahu siapa yang boleh dihubungi.
 *
 * Untuk chat privat, `chat.id` sama dengan id pengguna Telegram, yang juga
 * dipakai sebagai `players.user_id`.
 */
export async function recordBotChat(chatId: number) {
  if (!db || !Number.isSafeInteger(chatId) || chatId <= 0) return;

  // Kegagalan di sini tidak boleh menjatuhkan webhook: Telegram akan mengirim
  // ulang update-nya, dan pemain paling banter kehilangan satu pengingat.
  await db
    .insert(botChats)
    .values({ userId: String(chatId) })
    .onConflictDoNothing()
    .catch(() => undefined);
}
