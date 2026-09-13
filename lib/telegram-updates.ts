import "server-only";

import { eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { telegramUpdates } from "@/lib/db/schema";

/** Telegram retries an update until it gets a 2xx, so every update_id is processed once. */
const MEMORY_TTL_MS = 15 * 60 * 1000;
const MEMORY_LIMIT = 2000;
const RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
const PRUNE_PROBABILITY = 0.02;

const globalForUpdates = globalThis as unknown as {
  racelySeenUpdates?: Map<number, number>;
};
const seen = (globalForUpdates.racelySeenUpdates ??= new Map<number, number>());

export function resetTelegramUpdateMemory() {
  seen.clear();
}

/** Returns false when this update_id was already accepted by this process. */
function claimInMemory(updateId: number, now: number) {
  for (const [id, at] of seen) {
    if (now - at <= MEMORY_TTL_MS) break;
    seen.delete(id);
  }
  if (seen.has(updateId)) return false;
  seen.set(updateId, now);
  while (seen.size > MEMORY_LIMIT) {
    const oldest = seen.keys().next();
    if (oldest.done) break;
    seen.delete(oldest.value);
  }
  return true;
}

/**
 * Claims a Telegram update exactly once. The Postgres table is authoritative across
 * PM2 restarts and instances; the in-memory set only short-circuits rapid retries and
 * keeps the webhook idempotent when the database is unreachable.
 */
export async function claimTelegramUpdate(updateId: number, now = Date.now()) {
  if (!Number.isSafeInteger(updateId) || updateId < 0) return false;
  if (!claimInMemory(updateId, now)) return false;
  if (!db) return true;

  try {
    const inserted = await db
      .insert(telegramUpdates)
      .values({ updateId, receivedAt: new Date(now) })
      .onConflictDoNothing()
      .returning({ updateId: telegramUpdates.updateId });

    if (inserted.length > 0 && Math.random() < PRUNE_PROBABILITY) {
      // Sapuan retensi tidak boleh menjatuhkan klaim yang sudah tertulis.
      await db
        .delete(telegramUpdates)
        .where(lt(telegramUpdates.receivedAt, new Date(now - RETENTION_MS)))
        .catch(() => undefined);
    }

    return inserted.length > 0;
  } catch {
    // Postgres tak terjangkau. Sebelum ini, exception-nya keluar dari route dan
    // membalas 500 -- padahal klaim di memori SUDAH tercatat, jadi retry
    // Telegram dijawab "duplicate" dan update itu hilang selamanya. Perlakukan
    // sama dengan `!db` di atas: klaim memori adalah dedupe cadangannya, jadi
    // update-nya diproses, bukan dibuang.
    return true;
  }
}

/** Gives the claim back so Telegram's retry can be processed after a transient failure. */
export async function releaseTelegramUpdate(updateId: number) {
  seen.delete(updateId);
  if (!db) return;
  await db
    .delete(telegramUpdates)
    .where(eq(telegramUpdates.updateId, updateId))
    .catch(() => undefined);
}
