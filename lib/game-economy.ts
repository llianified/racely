import {
  advanceRaceProgress,
  lapReward,
  lapSeconds,
  roundCoins,
  type DailyCheckIn,
  type GameState,
  type OfflineEarnings,
} from "./game";
import {
  coinCapRemaining,
  lapScrapAt,
  racingDayKey,
  type EconomyConfig,
} from "./economy-config";

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
  /** Hari balapan yang sedang dihitung untuk batas koin; null berarti belum ada. */
  dayKey?: string | null;
  dayCoins?: number;
  /**
   * Rem emisi global: 1 berarti tidak direm. Dihitung di luar sini karena
   * butuh membaca ringkasan emisi hari ini -- fungsi ini tetap murni.
   */
  rewardMultiplier?: number;
};

export type RaceSettlement = {
  completedLaps: number;
  /** Koin yang benar-benar dicetak, sudah lewat batas harian dan rem emisi. */
  income: number;
  /** Koin yang tertahan batas harian. Untuk HUD dan telemetri, bukan utang. */
  withheld: number;
  /** Sparepart tidak pernah dibatasi: ia tidak bernilai rupiah. */
  scrap: number;
  progress: number;
  creditedSeconds: number;
  /** Hari balapan milik `now`, dan koin yang sudah tercetak untuk hari itu. */
  dayKey: string;
  dayCoins: number;
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

  // Batas koin berlaku per hari balapan: hari yang berganti mengosongkan
  // hitungannya, jadi tidak ada sisa jatah yang menyeberang tengah malam.
  const dayKey = racingDayKey(now);
  const coinsToday = state.dayKey === dayKey ? (state.dayCoins ?? 0) : 0;

  if (onlineMs + offlineMs === 0) {
    return {
      completedLaps: 0,
      income: 0,
      withheld: 0,
      scrap: 0,
      progress: state.progress,
      creditedSeconds: 0,
      dayKey,
      dayCoins: coinsToday,
      offline: null,
    };
  }

  const onlineEnd = intervalStart + onlineMs;
  const boostEnd = state.boostEndsAt?.getTime() ?? intervalStart;
  // Boost jauh lebih pendek dari jendela heartbeat, jadi hanya bisa bertumpang
  // dengan jendela itu.
  const boostedMs = Math.max(0, Math.min(onlineEnd, boostEnd) - intervalStart);
  const normalMs = onlineMs - boostedMs;
  const normalState = { ...state, boostLeft: 0 };
  const boostedState = { ...state, boostLeft: 1 };

  const boosted = advanceRaceProgress(
    state.progress,
    boostedMs / 1000,
    lapSeconds(boostedState),
  );
  const normal = advanceRaceProgress(
    boosted.progress,
    normalMs / 1000,
    lapSeconds(normalState),
  );
  const onlineCompletedLaps = boosted.completedLaps + normal.completedLaps;
  const offline = advanceRaceProgress(
    normal.progress,
    (offlineMs / 1000) * economy.offlineRate,
    lapSeconds(normalState),
  );
  const completedLaps = onlineCompletedLaps + offline.completedLaps;
  // Attribute to the away window only the laps the heartbeat would not have
  // closed on its own, so the summary matches what the balance actually gained.
  const offlineLaps = offline.completedLaps;
  const boostedIncome = roundCoins(
    boosted.completedLaps * lapReward(boostedState),
  );
  const normalIncome = roundCoins(
    normal.completedLaps * lapReward(normalState),
  );
  const offlineIncome = roundCoins(offlineLaps * lapReward(normalState));

  // Rem emisi menekan bayaran koin sebelum batas harian dihitung, supaya
  // keduanya bertumpuk, bukan saling menutupi.
  const brake = state.rewardMultiplier ?? 1;
  const rawIncome = roundCoins(
    (boostedIncome + normalIncome + offlineIncome) * brake,
  );
  const income = Math.min(rawIncome, coinCapRemaining(economy, coinsToday));
  // Ringkasan offline harus menyebut koin yang benar-benar masuk, bukan yang
  // seharusnya: pemain membaca angka itu sebagai isi saldonya.
  const credited = rawIncome > 0 ? income / rawIncome : 0;

  return {
    completedLaps,
    income,
    withheld: roundCoins(rawIncome - income),
    scrap: roundCoins(
      completedLaps * lapScrapAt(economy, state.levels, state.circuit),
    ),
    progress: offline.progress,
    creditedSeconds: (onlineMs + offlineMs) / 1000,
    dayKey,
    dayCoins: roundCoins(coinsToday + income),
    offline:
      offlineMs > 0
        ? {
            awaySeconds: awayMs / 1000,
            creditedSeconds: offlineMs / 1000,
            capped: awayMs - onlineMs > economy.offlineCapSeconds * 1000,
            laps: offlineLaps,
            coins: roundCoins(offlineIncome * brake * credited),
          }
        : null,
  };
}

/**
 * ── Pagar penarikan ────────────────────────────────────────────────────────
 *
 * Koin adalah satu-satunya hal di Racely yang bernilai rupiah, jadi jalur
 * keluarnya diberi syarat. Semuanya murni di sini supaya server dan UI membaca
 * aturan yang sama persis: pemain harus bisa melihat apa yang menghalanginya
 * sebelum menekan tombol, bukan setelah ditolak.
 */
export type WithdrawBlocker =
  | { kind: "laps"; need: number; have: number }
  | { kind: "accountAge"; needDays: number; haveDays: number }
  | { kind: "cooldown"; readyAt: Date };

export type WithdrawContext = {
  laps: number;
  createdAt: Date;
  /** Penarikan terakhir kapan pun statusnya; jeda dihitung sejak diminta. */
  lastWithdrawalAt: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const wholeDaysBetween = (from: Date, to: Date) =>
  Math.floor((to.getTime() - from.getTime()) / DAY_MS);

/**
 * Nilai untuk kolom `amount_idr`: rupiah yang tercatat setelah biaya. Koin yang
 * dipotong dari saldo tetap utuh -- biayanya mengurangi rupiah yang dicatat,
 * bukan menambah koin yang hangus, supaya panel Kewajiban tidak perlu
 * membedakan keduanya.
 *
 * Namanya sengaja menjauhi kosakata pembayaran: `tests/withdrawal-policy.test.ts`
 * melarang kata itu muncul di jalur server justru supaya tidak ada yang pernah
 * menulis jalur pembayaran otomatis di sana.
 */
export const withdrawAmountIdr = (e: EconomyConfig, coins: number) =>
  Math.floor(coins * e.coinToIdr * (1 - e.withdrawFeePct / 100));

/**
 * Satu kalimat untuk setiap penghalang, dipakai server saat menolak DAN panel
 * dompet saat menjelaskan -- jadi pemain membaca alasan yang sama persis di
 * kedua tempat, bukan dua versi yang bisa menyimpang.
 */
export function withdrawBlockerMessage(blocker: WithdrawBlocker) {
  if (blocker.kind === "laps") {
    return `Butuh ${blocker.need.toLocaleString("id-ID")} putaran sebelum bisa menarik; kamu di ${blocker.have.toLocaleString("id-ID")}.`;
  }
  if (blocker.kind === "accountAge") {
    return `Akun harus berumur ${blocker.needDays} hari sebelum bisa menarik; baru ${blocker.haveDays} hari.`;
  }
  return `Penarikan berikutnya bisa diminta ${blocker.readyAt.toLocaleDateString("id-ID", { day: "numeric", month: "long" })}.`;
}

/** Penghalang pertama yang berlaku, atau null kalau penarikan boleh jalan. */
export function withdrawBlocker(
  e: EconomyConfig,
  ctx: WithdrawContext,
  now: Date,
): WithdrawBlocker | null {
  if (ctx.laps < e.withdrawMinLaps) {
    return { kind: "laps", need: e.withdrawMinLaps, have: ctx.laps };
  }
  const ageDays = wholeDaysBetween(ctx.createdAt, now);
  if (ageDays < e.withdrawMinAccountAgeDays) {
    return {
      kind: "accountAge",
      needDays: e.withdrawMinAccountAgeDays,
      haveDays: Math.max(0, ageDays),
    };
  }
  if (ctx.lastWithdrawalAt && e.withdrawCooldownDays > 0) {
    const readyAt = new Date(
      ctx.lastWithdrawalAt.getTime() + e.withdrawCooldownDays * DAY_MS,
    );
    if (readyAt.getTime() > now.getTime()) return { kind: "cooldown", readyAt };
  }
  return null;
}

/**
 * Hari balapan kini tinggal di `economy-config.ts` -- lapisan rival butuh seed
 * harian dan tidak bisa mengimpor berkas ini. Diekspor ulang supaya seluruh
 * pemanggil yang sudah ada tidak perlu berpindah.
 */
export { RACING_DAY_OFFSET_MINUTES, racingDayKey } from "./economy-config";

/** Berapa hari ke belakang yang dibaca untuk menghitung streak. */
export const DAILY_HISTORY_DAYS = 30;

export const DAILY_CLAIM_PREFIX = "daily:";
/**
 * Batas atas eksklusif untuk memindai kunci `daily:*` sebagai rentang. Dipakai
 * ganti `LIKE 'daily:%'` karena btree hanya melayani prefix LIKE pada collation
 * tertentu, sedangkan perbandingan rentang selalu memakai indeks.
 */
export const DAILY_CLAIM_END = "daily;";

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
