import {
  advanceRaceProgress,
  lapReward,
  lapSeconds,
  roundCoins,
  type AdReward,
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
  "progress" | "levels" | "circuit" | "economy" | "setup"
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

  const normalState = { ...state, boostLeft: 0 };
  const normal = advanceRaceProgress(
    state.progress,
    onlineMs / 1000,
    lapSeconds(normalState),
  );
  const onlineCompletedLaps = normal.completedLaps;
  const offline = advanceRaceProgress(
    normal.progress,
    (offlineMs / 1000) * economy.offlineRate,
    lapSeconds(normalState),
  );
  const completedLaps = onlineCompletedLaps + offline.completedLaps;
  // Attribute to the away window only the laps the heartbeat would not have
  // closed on its own, so the summary matches what the balance actually gained.
  const offlineLaps = offline.completedLaps;
  const normalIncome = roundCoins(
    normal.completedLaps * lapReward(normalState),
  );
  const offlineIncome = roundCoins(offlineLaps * lapReward(normalState));

  return {
    completedLaps,
    income: roundCoins(normalIncome + offlineIncome),
    progress: offline.progress,
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

/**
 * Kunci klaim bonus iklan: `ad:<hari>:<urutan>`. Satu baris `reward_claims`
 * per tontonan, dan indeks unik (user_id, reward_key) yang menahan permintaan
 * ganda -- jadi tidak perlu kolom hitungan baru di baris pemain.
 */
export const AD_CLAIM_PREFIX = "ad:";

export function adClaimKey(day: string, ordinal: number) {
  return `${AD_CLAIM_PREFIX}${day}:${ordinal}`;
}

/** Rentang [start, end) untuk memindai semua klaim iklan pada satu hari balapan. */
export function adClaimRange(day: string) {
  return { start: `${AD_CLAIM_PREFIX}${day}:`, end: `${AD_CLAIM_PREFIX}${day};` };
}

export function adRewardStatus(watchedToday: number, e: EconomyConfig): AdReward {
  const dailyCap = e.adRewardDailyCap;
  const watched = Math.min(Math.max(0, Math.floor(watchedToday)), dailyCap);
  const available = dailyCap > 0 && watched < dailyCap;
  return {
    watchedToday: watched,
    dailyCap,
    reward: available ? e.adRewardCoins : 0,
    available,
  };
}
