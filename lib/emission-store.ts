import "server-only";

import { desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { emissionDaily } from "@/lib/db/schema";
import { emissionBrakeAt, type EconomyConfig } from "@/lib/economy-config";
import { racingDayKey } from "@/lib/game-economy";

/**
 * Ringkasan koin yang dicetak per hari balapan. Ini satu-satunya angka yang
 * menjawab "berapa kewajiban rupiah yang lahir hari ini" tanpa memindai seluruh
 * riwayat pemain.
 *
 * Cache-nya di dalam proses, alasan yang sama persis dengan `economy-store.ts`:
 * PM2 mengunci Racely ke `instances: 1, exec_mode: "fork"`. Rem emisi membaca
 * angka ini pada setiap settlement, jadi tanpa cache ia menambah satu query ke
 * setiap aksi pemain. Basi 30 detik dapat diterima -- rem ini menurunkan laju
 * bertahap, bukan memutus aliran pada detik tertentu.
 */
const CACHE_TTL_MS = 30_000;

const globalForEmission = globalThis as unknown as {
  racelyEmissionCache?: { day: string; coins: number; readAt: number };
};

/** Dipakai test; membuat pembacaan berikutnya menembus cache. */
export function resetEmissionCache() {
  globalForEmission.racelyEmissionCache = undefined;
}

/** Koin yang sudah dicetak seluruh pemain pada hari balapan berjalan. */
export async function readMintedToday(now = new Date()): Promise<number> {
  const day = racingDayKey(now);
  const cached = globalForEmission.racelyEmissionCache;
  if (cached && cached.day === day && now.getTime() - cached.readAt < CACHE_TTL_MS) {
    return cached.coins;
  }
  if (!db) return 0;
  try {
    const [row] = await db
      .select({ coins: emissionDaily.coins })
      .from(emissionDaily)
      .where(eq(emissionDaily.day, day))
      .limit(1);
    const coins = Number(row?.coins ?? 0);
    globalForEmission.racelyEmissionCache = { day, coins, readAt: now.getTime() };
    return coins;
  } catch {
    // Gagal membaca berarti rem tidak menyala. Itu disengaja: ekonomi yang
    // berjalan penuh jauh lebih baik daripada permainan yang membayar setengah
    // karena satu query gagal.
    return cached?.day === day ? cached.coins : 0;
  }
}

/**
 * Pengali lap reward yang berlaku sekarang. 1 berarti tidak direm.
 * Anggaran 0 mematikan rem sepenuhnya -- lihat `dailyEmissionBudgetIdr`.
 */
export async function emissionBrake(
  economy: EconomyConfig,
  now = new Date(),
): Promise<number> {
  if (economy.dailyEmissionBudgetIdr <= 0) return 1;
  return emissionBrakeAt(economy, await readMintedToday(now));
}

/**
 * Mencatat koin yang baru dicetak ke hari yang bersangkutan. Nilai rupiahnya
 * dihitung dengan `coinToIdr` yang berlaku saat pencetakan, jadi menyetel nilai
 * koin di kemudian hari tidak menulis ulang sejarah kewajiban.
 */
export async function recordMinted(
  tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> },
  day: string,
  coins: number,
  economy: EconomyConfig,
) {
  if (coins <= 0) return;
  const amountIdr = Math.round(coins * economy.coinToIdr);
  await tx.execute(sql`
    insert into racely_emission_daily (day, coins, amount_idr, updated_at)
    values (${day}, ${coins}, ${amountIdr}, now())
    on conflict (day) do update set
      coins = racely_emission_daily.coins + ${coins},
      amount_idr = racely_emission_daily.amount_idr + ${amountIdr},
      updated_at = now()
  `);
  resetEmissionCache();
}

/** Ringkasan untuk tab Kewajiban: hari ini, 7 hari, 30 hari. */
export async function readEmissionSummary(now = new Date()) {
  const empty = { today: 0, week: 0, month: 0, todayIdr: 0, weekIdr: 0, monthIdr: 0 };
  if (!db) return empty;
  const since = (days: number) => {
    const day = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return racingDayKey(day);
  };
  try {
    const rows = await db
      .select()
      .from(emissionDaily)
      .where(gte(emissionDaily.day, since(30)))
      .orderBy(desc(emissionDaily.day));
    const today = racingDayKey(now);
    const weekStart = since(7);
    const sum = (keep: (day: string) => boolean) =>
      rows.filter((row) => keep(row.day)).reduce(
        (acc, row) => ({
          coins: acc.coins + Number(row.coins),
          idr: acc.idr + Number(row.amountIdr),
        }),
        { coins: 0, idr: 0 },
      );
    const day = sum((value) => value === today);
    const week = sum((value) => value >= weekStart);
    const month = sum(() => true);
    return {
      today: day.coins,
      todayIdr: day.idr,
      week: week.coins,
      weekIdr: week.idr,
      month: month.coins,
      monthIdr: month.idr,
    };
  } catch {
    return empty;
  }
}
