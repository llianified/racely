import "server-only";

import { and, asc, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { botChats, players } from "@/lib/db/schema";
import {
  IDLE_NOTIFY_AFTER_SECONDS,
  idleNotificationText,
  idleSecondsOf,
} from "@/lib/idle-notify";
import { parsePublicAppUrl, sendTelegramReply } from "@/lib/telegram-bot";

/** Sesapuan dibatasi supaya satu tick tidak pernah membanjiri Bot API. */
const BATCH = 50;
const INTERVAL_MS = 5 * 60 * 1000;

const globalForNotifier = globalThis as unknown as {
  racelyIdleNotifier?: NodeJS.Timeout;
};

/**
 * Satu sapuan: cari pemain yang jendela offline-nya hampir penuh, kirim satu
 * pengingat, tandai. Mengembalikan jumlah yang dikirim supaya bisa dites dan
 * dilihat di log.
 */
export async function runIdleNotifierPass(now = new Date()) {
  if (!db) return { sent: 0, skipped: 0 };

  let appUrl: string;
  try {
    appUrl = parsePublicAppUrl();
  } catch {
    return { sent: 0, skipped: 0 };
  }

  const cutoff = new Date(now.getTime() - IDLE_NOTIFY_AFTER_SECONDS * 1000);
  const candidates = await db
    .select({
      userId: players.userId,
      carModel: players.carModel,
      lastSettledAt: players.lastSettledAt,
      idleNotifiedAt: players.idleNotifiedAt,
    })
    .from(players)
    .innerJoin(botChats, eq(botChats.userId, players.userId))
    .where(
      and(
        isNotNull(players.carModel),
        lt(players.lastSettledAt, cutoff),
        // Satu pesan per periode menganggur: begitu pemain kembali,
        // last_settled_at melewati tanda ini dan periode berikutnya layak lagi.
        or(
          sql`${players.idleNotifiedAt} IS NULL`,
          sql`${players.idleNotifiedAt} < ${players.lastSettledAt}`,
        ),
      ),
    )
    .orderBy(asc(players.lastSettledAt))
    .limit(BATCH);

  let sent = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    const chatId = Number(candidate.userId);
    if (!Number.isSafeInteger(chatId) || chatId <= 0) {
      skipped += 1;
      continue;
    }

    try {
      await sendTelegramReply({
        chat_id: chatId,
        text: idleNotificationText(idleSecondsOf(candidate, now)),
        reply_markup: {
          inline_keyboard: [
            [{ text: "Buka Racely", web_app: { url: appUrl } }],
          ],
        },
      });
      sent += 1;
    } catch {
      skipped += 1;
    }

    // Ditandai baik berhasil maupun gagal. Pemain yang memblokir bot akan
    // selalu menolak, dan tanpa tanda ini mereka akan dicoba ulang setiap lima
    // menit selamanya. Harganya: satu pengingat hilang saat Telegram sedang
    // bermasalah -- jauh lebih murah daripada sapuan yang macet.
    await db
      .update(players)
      .set({ idleNotifiedAt: now })
      .where(eq(players.userId, candidate.userId))
      .catch(() => undefined);
  }

  return { sent, skipped };
}

/**
 * Penjadwal berjalan di dalam proses. Itu aman justru karena PM2 mengunci
 * Racely ke `instances: 1, exec_mode: "fork"` -- alasan yang sama dengan rate
 * limiter dan dedupe webhook. Kalau instance ditambah, pindahkan ini ke satu
 * pekerja terpisah lebih dulu, atau setiap pemain dapat pesan ganda.
 */
export function startIdleNotifier() {
  if (globalForNotifier.racelyIdleNotifier) return;
  if (!db) return;
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.RACELY_IDLE_NOTIFY !== "true"
  ) {
    return;
  }

  let inFlight = false;
  // Satu baris di log PM2: tanpa ini, penyapu yang gagal menyala tidak
  // meninggalkan jejak apa pun dan notifikasi mati diam-diam.
  console.info(
    `[racely] penyapu pemberitahuan idle aktif, sapuan tiap ${INTERVAL_MS / 60_000} menit`,
  );
  globalForNotifier.racelyIdleNotifier = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    void runIdleNotifierPass()
      .catch(() => undefined)
      .finally(() => {
        inFlight = false;
      });
  }, INTERVAL_MS);
}
