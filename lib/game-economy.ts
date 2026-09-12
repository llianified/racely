import {
  lapReward,
  lapSeconds,
  roundCoins,
  type DailyCheckIn,
  type GameState,
  type OfflineEarnings,
} from "./game";
import type { EconomyConfig } from "./economy-config";

/**
 * Tiga batas yang dulu jadi konstanta di sini -- jendela heartbeat, jendela
 * offline, dan laju offline -- sekarang datang dari `EconomyConfig`:
 *
 * - `heartbeatCapSeconds`: client yang terbuka menyinkron tiap beberapa detik,
 *   jadi apa pun di dalam jendela ini masih dihitung "ada yang menonton".
 * - `offlineCapSeconds`: waktu di luar jendela itu tetap dibayar -- itulah
 *   hadiah idle-nya -- tapi hanya sampai sejauh ini, supaya seminggu offline
 *   bukan jackpot.
 * - `offlineRate`: laju bayaran di luar jendela heartbeat, di bawah 1 supaya
 *   bermain aktif selalu lebih menguntungkan.
 */
export type RaceSettlementInput = Pick<
  GameState,
  "progress" | "levels" | "circuit" | "economy"
> & {
  lastSettledAt: Date;
  boostEndsAt: Date | null;
};

export type RaceSettlement = {
  completedLaps: number;
  income: number;
  progress: number;
  creditedSeconds: number;
  /** Only set when part of the interval fell outside the heartbeat window. */
  offline: OfflineEarnings | null;
};

export function calculateRaceSettlement(
  state: RaceSettlementInput,
  now: Date,
): RaceSettlement {
  const economy = state.economy;
  const intervalStart = state.lastSettledAt.getTime();
  const awayMs = Math.max(0, now.getTime() - intervalStart);
  // Splitting instead of choosing one cap keeps the payout continuous: time
  // inside the heartbeat window pays in full, then only the remainder pays at
  // the offline rate.
  const onlineMs = Math.min(awayMs, economy.heartbeatCapSeconds * 1000);
  const offlineMs = Math.min(
    awayMs - onlineMs,
    economy.offlineCapSeconds * 1000,
  );

  if (onlineMs + offlineMs === 0) {
    return {
      completedLaps: 0,
      income: 0,
      progress: state.progress,
      creditedSeconds: 0,
      offline: null,
    };
  }

  const onlineEnd = intervalStart + onlineMs;
  const boostEnd = state.boostEndsAt?.getTime() ?? intervalStart;
  // Boost jauh lebih pendek dari jendela heartbeat, jadi hanya bisa bertumpang
  // dengan jendela itu.
  const boostedMs = Math.max(0, Math.min(onlineEnd, boostEnd) - intervalStart);
  const normalMs = onlineMs - boostedMs;
  // lapSeconds dan lapReward hanya membaca levels, circuit dan boostLeft.
  // Sebelumnya di sini dirakit GameState utuh yang harus ditambal tiap kali ada
  // field baru; sekarang cukup yang dipakai.
  const economyState = { ...state, boostLeft: 0 };
  const lapDurationMs = lapSeconds(economyState) * 1000;
  const reward = lapReward(economyState);

  const onlineLaps =
    state.progress +
    normalMs / lapDurationMs +
    boostedMs / (lapDurationMs / economy.boostMultiplier);
  const accumulatedLaps =
    onlineLaps + (offlineMs / lapDurationMs) * economy.offlineRate;
  const completedLaps = Math.floor(accumulatedLaps);
  // Attribute to the away window only the laps the heartbeat would not have
  // closed on its own, so the summary matches what the balance actually gained.
  const offlineLaps = completedLaps - Math.floor(onlineLaps);
  const offlineIncome = roundCoins(offlineLaps * reward);

  return {
    completedLaps,
    income: roundCoins(
      roundCoins((completedLaps - offlineLaps) * reward) + offlineIncome,
    ),
    progress: accumulatedLaps % 1,
    creditedSeconds: (onlineMs + offlineMs) / 1000,
    offline:
      offlineMs > 0
        ? {
            awaySeconds: awayMs / 1000,
            creditedSeconds: offlineMs / 1000,
            capped: awayMs - onlineMs > economy.offlineCapSeconds * 1000,
            laps: offlineLaps,
            coins: offlineIncome,
          }
        : null,
  };
}

/**
 * Hari balapan berganti tengah malam WIB, bukan UTC. Tanpa ini pemain Indonesia
 * kehilangan atau mendapat satu hari ekstra tiap kali melewati jam 07:00 pagi.
 */
export const RACING_DAY_OFFSET_MINUTES = 7 * 60;

/** Berapa hari ke belakang yang dibaca untuk menghitung streak. */
export const DAILY_HISTORY_DAYS = 30;

export const DAILY_CLAIM_PREFIX = "daily:";
/**
 * Batas atas eksklusif untuk memindai kunci `daily:*` sebagai rentang. Dipakai
 * ganti `LIKE 'daily:%'` karena btree hanya melayani prefix LIKE pada collation
 * tertentu, sedangkan perbandingan rentang selalu memakai indeks.
 */
export const DAILY_CLAIM_END = "daily;";

/** Kunci hari balapan, "YYYY-MM-DD" menurut WIB. */
export function racingDayKey(now: Date) {
  return new Date(now.getTime() + RACING_DAY_OFFSET_MINUTES * 60_000)
    .toISOString()
    .slice(0, 10);
}

function previousDay(key: string) {
  const day = new Date(`${key}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

/** Hadiah untuk hari ke-`day` dalam sebuah streak (1-based), mentok di rung terakhir. */
export function dailyRewardFor(day: number, e: EconomyConfig) {
  const rungs = e.dailyRewards;
  const rung = Math.min(Math.max(1, Math.floor(day)), rungs.length);
  return rungs[rung - 1];
}

/**
 * `claimedDays` adalah kunci hari yang sudah diklaim, urutan bebas. Streak
 * dihitung mundur dari hari ini kalau sudah diklaim, atau dari kemarin kalau
 * belum -- supaya klaim hari ini menyambung, bukan memulai ulang.
 */
export function dailyCheckIn(
  claimedDays: readonly string[],
  now: Date,
  e: EconomyConfig,
): DailyCheckIn {
  const today = racingDayKey(now);
  const claimed = new Set(claimedDays);
  const claimedToday = claimed.has(today);

  let streak = 0;
  let cursor = claimedToday ? today : previousDay(today);
  // Dibatasi DAILY_HISTORY_DAYS karena hanya sebanyak itu riwayat yang dibaca.
  while (claimed.has(cursor) && streak < DAILY_HISTORY_DAYS) {
    streak += 1;
    cursor = previousDay(cursor);
  }

  return {
    streak,
    claimedToday,
    reward: claimedToday ? 0 : dailyRewardFor(streak + 1, e),
    nextReward: dailyRewardFor(streak + (claimedToday ? 1 : 2), e),
  };
}
