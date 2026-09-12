import { z } from "zod";

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
};

/** Batas maksimum level upgrade yang boleh dipilih tanpa migrasi baru. */
export const UPGRADE_LEVEL_CEILING = 10;

const coin = z.number().finite().min(0).max(1_000_000);
const rate = z.number().finite().min(0).max(1);
const positive = z.number().finite().gt(0).max(1_000_000);
const lapCount = z.number().int().min(0).max(10_000_000);

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
