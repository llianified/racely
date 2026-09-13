import { z } from "zod";
import type { CarModelId } from "./car-catalog";

/**
 * Seluruh angka ekonomi Racely dalam satu objek. Dulu tersebar sebagai
 * konstanta modul di `lib/game.ts`, yang berarti menyetel ekonomi selalu butuh
 * deploy -- dan lebih buruk: UI mengimpor konstanta itu langsung, jadi server
 * dan tampilan bisa menyimpang tanpa satu error pun.
 *
 * Sekarang config ini yang jadi satu-satunya sumber, dikirim ke client lewat
 * `GameState.economy`, jadi panel admin bisa menyetelnya tanpa deploy dan
 * angka di UI tidak bisa lagi berbohong.
 *
 * Murni, tanpa I/O -- persis seperti `lib/game-economy.ts`. Pembacaan dari
 * database ada di `lib/economy-store.ts`.
 *
 * ── ATURAN EMAS: koin adalah kewajiban rupiah, Sparepart tidak ─────────────
 *
 * Tidak ada sumber pendapatan di kode ini. Setiap koin yang dicetak adalah
 * utang rupiah yang suatu saat ditagih lewat antrean penarikan, sementara
 * Sparepart tidak pernah bisa ditukar uang. Karena itu keran koin dikunci
 * pada daftar yang sudah ada dan tidak boleh bertambah:
 *
 *   lap reward · dailyRewards rung 1-7 · referral · bonus starter & saldo awal
 *   · hadiah tiga misi lama (kompatibilitas pemain yang sudah mengklaimnya)
 *
 * Seluruh hadiah BARU -- misi harian/mingguan, streak rung 8 ke atas, kotak
 * bonus, duel, leaderboard -- dibayar Sparepart. Daftarnya hidup di
 * `COIN_FAUCET_FIELDS` di bawah dan dijaga `tests/economy-config.test.ts`:
 * knob baru apa pun memerahkan test sampai ia digolongkan, dan menggolongkannya
 * sebagai keran koin memerahkan test kedua sampai keputusan itu disengaja.
 */
export type EconomyConfig = {
  /** Rupiah per koin saat penarikan. */
  coinToIdr: number;
  minWithdrawCoins: number;
  maxWithdrawCoins: number;

  /** Saldo bawaan pemain baru. Juga dipakai mendeteksi pemain yang sudah jalan. */
  startingBalance: number;
  starterGift: number;

  lapBaseSeconds: number;
  lapEnginePerLevel: number;
  lapTiresPerLevel: number;
  lapRewardBase: number;
  lapRewardPerBattery: number;
  lapRewardPerCircuit: number;
  /** Selisih pengali hadiah: P1 +nilai, P2 netral, P3 -nilai. */
  racePositionRewardStep: number;

  upgradeCostEngine: number;
  upgradeCostTires: number;
  upgradeCostBattery: number;
  upgradeCostGrowth: number;
  /**
   * Dibatasi 10 oleh `CHECK (engine_level BETWEEN 1 AND 10)` di migrasi 0001.
   * Menaikkannya di atas 10 butuh migrasi maju baru lebih dulu, jadi skema di
   * bawah ikut mengunci batas itu.
   */
  maxUpgradeLevel: number;

  boostDurationSeconds: number;
  batteryRechargeSeconds: number;
  /** Pengali laju saat boost menyala. Dulu literal `2` di tiga tempat. */
  boostMultiplier: number;

  heartbeatCapSeconds: number;
  offlineCapSeconds: number;
  offlineRate: number;

  /** Hadiah check-in per hari streak (1-based), mentok di rung terakhir. */
  dailyRewards: number[];

  referralMilestoneLaps: number;
  referralRewardInviter: number;
  referralRewardInvitee: number;

  missionLapsTarget: number;
  missionLapsReward: number;
  missionUpgradeTarget: number;
  missionUpgradeReward: number;
  missionEarnTarget: number;
  missionEarnReward: number;

  circuitUnlockLaps: number;
  carPriceBebek: number;
  carPriceBurger: number;
  carPriceUfo: number;

  /**
   * Sparepart: mata uang progres. Tidak bisa ditarik, jadi tidak menambah
   * kewajiban rupiah sepeser pun. Jatuh per putaran bersama koin.
   */
  lapScrapBase: number;
  lapScrapPerLevel: number;
  /** Pengali sirkuit: hasil = dasar x (1 + circuit * nilai ini). */
  lapScrapPerCircuit: number;
  /** Bekal Sparepart pemain lama saat migrasi, supaya tidak terasa dirugikan. */
  startingScrap: number;
  /** Penyerap koin sukarela. Satu arah; tidak ada jalur Sparepart -> koin. */
  coinToScrapRate: number;

  /**
   * Batas koin yang bisa dicetak seorang pemain dalam satu hari balapan.
   * Setelah tercapai, putaran tetap membayar Sparepart penuh tapi koin = 0.
   */
  dailyCoinCapPerPlayer: number;

  /** Pagar penarikan. Semuanya ditegakkan server saat baris `pending` dibuat. */
  withdrawFeePct: number;
  withdrawCooldownDays: number;
  withdrawMinLaps: number;
  withdrawMinAccountAgeDays: number;

  /**
   * Anggaran emisi harian dalam rupiah. 0 berarti tanpa anggaran dan tanpa
   * rem -- itu sebabnya tidak ada knob boolean terpisah: satu angka sudah
   * menyatakan "mati" maupun "sebesar ini".
   */
  dailyEmissionBudgetIdr: number;
};

/**
 * Nilai yang dipakai Racely sebelum ekonomi bisa disetel. Tetap jadi cadangan
 * saat tabel config kosong atau `DATABASE_URL` tidak ada, sehingga `pnpm dev`
 * dan test berjalan tanpa database.
 */
export const DEFAULT_ECONOMY: EconomyConfig = {
  coinToIdr: 100,
  minWithdrawCoins: 100,
  maxWithdrawCoins: 1_000_000,

  startingBalance: 10,
  starterGift: 15,

  lapBaseSeconds: 8,
  lapEnginePerLevel: 0.15,
  lapTiresPerLevel: 0.1,
  lapRewardBase: 0.05,
  lapRewardPerBattery: 0.01,
  lapRewardPerCircuit: 0.02,
  racePositionRewardStep: 0.2,

  upgradeCostEngine: 25,
  upgradeCostTires: 15,
  upgradeCostBattery: 20,
  upgradeCostGrowth: 1.65,
  maxUpgradeLevel: 10,

  boostDurationSeconds: 10,
  batteryRechargeSeconds: 25,
  boostMultiplier: 2,

  heartbeatCapSeconds: 2 * 60,
  offlineCapSeconds: 4 * 60 * 60,
  offlineRate: 0.5,

  dailyRewards: [1, 2, 3, 4, 5, 6, 10],

  referralMilestoneLaps: 100,
  referralRewardInviter: 25,
  referralRewardInvitee: 10,

  missionLapsTarget: 10,
  missionLapsReward: 5,
  missionUpgradeTarget: 3,
  missionUpgradeReward: 10,
  missionEarnTarget: 25,
  missionEarnReward: 15,

  circuitUnlockLaps: 25,
  carPriceBebek: 35,
  carPriceBurger: 60,
  carPriceUfo: 90,

  lapScrapBase: 0.5,
  lapScrapPerLevel: 0.05,
  lapScrapPerCircuit: 0.25,
  startingScrap: 150,
  coinToScrapRate: 3,

  dailyCoinCapPerPlayer: 30,

  withdrawFeePct: 5,
  withdrawCooldownDays: 7,
  withdrawMinLaps: 1000,
  withdrawMinAccountAgeDays: 7,

  dailyEmissionBudgetIdr: 500_000,
};

/** Batas maksimum level upgrade yang boleh dipilih tanpa migrasi baru. */
export const UPGRADE_LEVEL_CEILING = 10;

export const carPriceAt = (e: EconomyConfig, model: CarModelId) =>
  model === "bebek-sultan" ? e.carPriceBebek
    : model === "burger-oleng" ? e.carPriceBurger
      : model === "ufo-gabut" ? e.carPriceUfo : 0;

const coin = z.number().finite().min(0).max(1_000_000);
const rate = z.number().finite().min(0).max(1);
const positive = z.number().finite().gt(0).max(1_000_000);
const lapCount = z.number().int().min(0).max(10_000_000);
/** Sparepart tidak bernilai rupiah, jadi batasnya soal kewarasan angka saja. */
const scrap = z.number().finite().min(0).max(1_000_000);
const percent = z.number().finite().min(0).max(100);
const days = z.number().int().min(0).max(365);

export const economyConfigSchema = z
  .object({
    coinToIdr: z.number().int().min(1).max(10_000_000),
    minWithdrawCoins: z.number().int().min(1).max(1_000_000),
    maxWithdrawCoins: z.number().int().min(1).max(1_000_000_000),

    startingBalance: z.number().int().min(0).max(1_000_000),
    starterGift: coin,

    lapBaseSeconds: positive,
    lapEnginePerLevel: z.number().finite().min(0).max(100),
    lapTiresPerLevel: z.number().finite().min(0).max(100),
    lapRewardBase: coin,
    lapRewardPerBattery: coin,
    lapRewardPerCircuit: coin,
    racePositionRewardStep: rate,

    upgradeCostEngine: coin,
    upgradeCostTires: coin,
    upgradeCostBattery: coin,
    upgradeCostGrowth: z.number().finite().min(1).max(100),
    maxUpgradeLevel: z.number().int().min(1).max(UPGRADE_LEVEL_CEILING),

    boostDurationSeconds: z.number().finite().min(0).max(86_400),
    batteryRechargeSeconds: z.number().finite().min(0).max(86_400),
    boostMultiplier: z.number().finite().min(1).max(100),

    heartbeatCapSeconds: z.number().finite().min(0).max(86_400),
    offlineCapSeconds: z.number().finite().min(0).max(30 * 86_400),
    offlineRate: rate,

    dailyRewards: z.array(coin).min(1).max(31),

    referralMilestoneLaps: lapCount,
    referralRewardInviter: coin,
    referralRewardInvitee: coin,

    missionLapsTarget: lapCount,
    missionLapsReward: coin,
    missionUpgradeTarget: z.number().int().min(0).max(100),
    missionUpgradeReward: coin,
    missionEarnTarget: coin,
    missionEarnReward: coin,

    circuitUnlockLaps: lapCount,
    carPriceBebek: z.number().int().min(1).max(1_000_000),
    carPriceBurger: z.number().int().min(1).max(1_000_000),
    carPriceUfo: z.number().int().min(1).max(1_000_000),

    lapScrapBase: scrap,
    lapScrapPerLevel: scrap,
    lapScrapPerCircuit: z.number().finite().min(0).max(100),
    startingScrap: scrap,
    coinToScrapRate: z.number().finite().gt(0).max(1_000),

    dailyCoinCapPerPlayer: coin,

    withdrawFeePct: percent,
    withdrawCooldownDays: days,
    withdrawMinLaps: lapCount,
    withdrawMinAccountAgeDays: days,

    dailyEmissionBudgetIdr: z.number().int().min(0).max(1_000_000_000_000),
  })
  .strict()
  .refine((value) => value.maxWithdrawCoins >= value.minWithdrawCoins, {
    message: "Penarikan maksimum tidak boleh di bawah minimum.",
    path: ["maxWithdrawCoins"],
  })
  /**
   * `amount_idr` dihitung sebagai `coins * coinToIdr` dan dibawa sebagai number
   * JavaScript sebelum masuk kolom bigint. Batas per-field saja masih
   * mengizinkan hasil kali di atas 2^53, tempat penjumlahan rupiah mulai
   * kehilangan presisi diam-diam -- pada uang sungguhan, bukan skor.
   */
  .refine(
    (value) => value.maxWithdrawCoins * value.coinToIdr <= Number.MAX_SAFE_INTEGER,
    {
      message:
        "Penarikan maksimum dikali nilai koin melampaui batas presisi bilangan bulat.",
      path: ["maxWithdrawCoins"],
    },
  );

/**
 * Config tersimpan sebagai jsonb, jadi baris lama bisa kehilangan field yang
 * ditambahkan belakangan. Field yang hilang diisi dari default, lalu hasilnya
 * divalidasi utuh -- satu baris rusak tidak boleh menjatuhkan permainan.
 */
export function resolveEconomyConfig(stored: unknown): EconomyConfig {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return DEFAULT_ECONOMY;
  }
  const merged = { ...DEFAULT_ECONOMY, ...(stored as Record<string, unknown>) };
  const parsed = economyConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_ECONOMY;
}

/** Jeda sampai Gaspol berikutnya, diukur dari saat tombol ditekan. Turunan. */
export const boostCooldownSeconds = (e: EconomyConfig) =>
  e.boostDurationSeconds + e.batteryRechargeSeconds;

export const economyFieldKeys = Object.keys(
  DEFAULT_ECONOMY,
) as (keyof EconomyConfig)[];

/**
 * Knob yang mencetak koin, dan karena itu menambah kewajiban rupiah. Daftar ini
 * disengaja pendek dan disengaja sulit bertambah: lihat aturan emas di atas
 * `EconomyConfig`. `tests/economy-config.test.ts` menggolongkan setiap knob dan
 * akan merah untuk knob baru mana pun sampai keputusannya dibuat sadar.
 *
 * `dailyRewards` masuk di sini apa adanya; membatasi rung 8 ke atas supaya
 * dibayar Sparepart adalah pekerjaan Fase 1, bukan janji yang ditulis di sini.
 */
export const COIN_FAUCET_FIELDS = [
  "startingBalance",
  "starterGift",
  "lapRewardBase",
  "lapRewardPerBattery",
  "lapRewardPerCircuit",
  "racePositionRewardStep",
  "dailyRewards",
  "referralRewardInviter",
  "referralRewardInvitee",
  "missionLapsReward",
  "missionUpgradeReward",
  "missionEarnReward",
] as const satisfies readonly (keyof EconomyConfig)[];

/**
 * Sparepart per putaran. Sengaja tidak mengenal posisi balapan maupun boost:
 * yang dipercepat boost adalah jumlah putaran, bukan hasil tiap putaran.
 */
export const lapScrapAt = (
  e: EconomyConfig,
  levels: Record<UpgradeKey, number>,
  circuit: number,
) => {
  const upgrades = levels.engine + levels.tires + levels.battery - 3;
  return (
    Math.round(
      (e.lapScrapBase + upgrades * e.lapScrapPerLevel) *
        (1 + circuit * e.lapScrapPerCircuit) *
        100,
    ) / 100
  );
};

/** Koin yang masih boleh dicetak untuk pemain ini hari ini. */
export const coinCapRemaining = (e: EconomyConfig, coinsToday: number) =>
  Math.max(0, e.dailyCoinCapPerPlayer - Math.max(0, coinsToday));

/**
 * Kunci upgrade didefinisikan di sini, bukan di `lib/game.ts`, supaya formula
 * dasar di bawah tidak perlu mengimpor apa pun dari lapisan atas. `Upgrade` di
 * `lib/game.ts` sekarang hanya alias dari tipe ini.
 */
export type UpgradeKey = "engine" | "tires" | "battery";

export const UPGRADE_KEYS: readonly UpgradeKey[] = ["engine", "tires", "battery"];

const upgradeBaseCost = (e: EconomyConfig, key: UpgradeKey) =>
  key === "engine"
    ? e.upgradeCostEngine
    : key === "tires"
      ? e.upgradeCostTires
      : e.upgradeCostBattery;

/**
 * Formula ekonomi dalam bentuk paling mentah: hanya config dan angka, tanpa
 * GameState. `lib/game.ts` membungkusnya jadi fungsi yang menerima state, dan
 * proyeksi di `lib/economy-projection.ts` memakainya langsung -- jadi tidak ada
 * dua salinan rumus yang bisa menyimpang.
 */
export const upgradeCostAt = (
  e: EconomyConfig,
  key: UpgradeKey,
  level: number,
) => Math.round(upgradeBaseCost(e, key) * Math.pow(e.upgradeCostGrowth, level - 1));

export const lapSecondsAt = (
  e: EconomyConfig,
  levels: Record<UpgradeKey, number>,
  boosted: boolean,
) =>
  e.lapBaseSeconds /
  (1 +
    (levels.engine - 1) * e.lapEnginePerLevel +
    (levels.tires - 1) * e.lapTiresPerLevel) /
  (boosted ? e.boostMultiplier : 1);

export const lapRewardAt = (
  e: EconomyConfig,
  batteryLevel: number,
  circuit: number,
) =>
  Math.round(
    (e.lapRewardBase +
      (batteryLevel - 1) * e.lapRewardPerBattery +
      circuit * e.lapRewardPerCircuit) *
      100,
  ) / 100;

export type RacePosition = 1 | 2 | 3;

const rivalLevelsAt = (e: EconomyConfig, circuit: number) => {
  const tier = circuit > 0 ? 1 : 0;
  const level = (value: number) => Math.min(e.maxUpgradeLevel, value);
  return [
    { engine: level(3 + tier), tires: level(1 + tier), battery: 1 },
    { engine: level(1 + tier), tires: level(2 + tier), battery: 1 },
  ] as const;
};

/** Waktu lawan tetap server-derived; model atau input client tidak memengaruhinya. */
export const raceOpponentLapSecondsAt = (
  e: EconomyConfig,
  circuit: number,
): readonly [number, number] => {
  const [leader, chaser] = rivalLevelsAt(e, circuit);
  return [
    lapSecondsAt(e, leader, false),
    lapSecondsAt(e, chaser, false),
  ];
};

export const racePositionAt = (
  e: EconomyConfig,
  levels: Record<UpgradeKey, number>,
  circuit: number,
  boosted: boolean,
): RacePosition => {
  const playerSeconds = lapSecondsAt(e, levels, boosted);
  const losses = raceOpponentLapSecondsAt(e, circuit).filter(
    (opponentSeconds) => opponentSeconds < playerSeconds,
  ).length;
  return (losses + 1) as RacePosition;
};

export const raceRewardAt = (
  e: EconomyConfig,
  levels: Record<UpgradeKey, number>,
  circuit: number,
  boosted: boolean,
) => {
  const position = racePositionAt(e, levels, circuit, boosted);
  const multiplier = 1 + (2 - position) * e.racePositionRewardStep;
  return (
    Math.round(lapRewardAt(e, levels.battery, circuit) * multiplier * 100) /
    100
  );
};
