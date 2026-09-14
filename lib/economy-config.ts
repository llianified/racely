import { z } from "zod";
import {
  NEUTRAL_SETUP,
  setupLapSeconds,
  type CarSetup,
} from "./car-setup";

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
  /**
   * Bagian durasi Gaspol yang hangus kalau tombolnya ditekan saat mobil sedang
   * di tikungan. 0 mematikan mekaniknya -- Gaspol kembali selalu penuh.
   *
   * Cooldown-nya TIDAK ikut dipotong: itu yang membuat salah tekan berbiaya.
   * Lihat `boostDurationFor`.
   */
  boostCornerPenalty: number;
  /**
   * Panjang lintasan -- dalam pecahan satu putaran -- sesudah mulut tikungan
   * yang masih dihitung sebagai tekan bersih. Ini toleransi latensi: pemain
   * menekan di trek lurus, permintaannya tiba saat mobil sudah masuk tikungan.
   *
   * Sengaja diukur dalam posisi lintasan, bukan detik. Mobil cepat memang
   * mendapat jendela waktu nyata yang lebih sempit -- itu kurva kesulitannya --
   * sedangkan toleransi berbasis detik akan melahap sebagian besar tikungan
   * begitu level upgrade naik dan mekaniknya jadi tidak ada artinya.
   */
  boostLaunchGraceLap: number;

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

  dailyMissionLapsTarget: number;
  dailyMissionEarnTarget: number;
  dailyMissionBoostTarget: number;
  dailyMissionCleanTarget: number;
  /** Budget is snapshotted when today's missions are created; edits apply next day. */
  dailyMissionRewardCap: number;
  cosmeticBaseHours: number;
  circuitUnlockLaps: number;
  /** Putaran untuk membuka sirkuit ketiga (Apex). */
  technicalUnlockLaps: number;
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
  boostCornerPenalty: 0.4,
  boostLaunchGraceLap: 0.05,

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

  dailyMissionLapsTarget: 60,
  dailyMissionEarnTarget: 5,
  dailyMissionBoostTarget: 3,
  dailyMissionCleanTarget: 2,
  dailyMissionRewardCap: 6,
  cosmeticBaseHours: 6,
  circuitUnlockLaps: 25,
  technicalUnlockLaps: 150,
};

/**
 * Putaran yang dibutuhkan untuk membuka sebuah sirkuit. Sirkuit 0 selalu
 * terbuka; ambang sirkuit lain datang dari config supaya bisa disetel dari
 * /admin tanpa deploy, sama seperti angka ekonomi lainnya.
 */
export const circuitUnlockLaps = (e: EconomyConfig, circuit: number) =>
  circuit <= 0 ? 0 : circuit === 1 ? e.circuitUnlockLaps : e.technicalUnlockLaps;

/** Batas maksimum level upgrade yang boleh dipilih tanpa migrasi baru. */
export const UPGRADE_LEVEL_CEILING = 10;

const coin = z.number().finite().min(0).max(1_000_000);
const rate = z.number().finite().min(0).max(1);
const positive = z.number().finite().gt(0).max(1_000_000);
const lapCount = z.number().int().min(0).max(10_000_000);

/**
 * Hadiah yang dibayar lewat sebuah baris `racely_reward_claims`: hadiah starter,
 * check-in harian, misi, dan kedua sisi ajakan.
 *
 * Bentuknya lebih ketat daripada `coin` karena kolom tujuannya lebih ketat.
 * `racely_reward_claims.amount` adalah `bigint NOT NULL CHECK (amount > 0)` dan
 * saldo pemain juga `bigint`, jadi nilai pecahan maupun nol DITOLAK Postgres --
 * bukan dibulatkan diam-diam. Insert itu berjalan di dalam transaksi aksi
 * pemain, jadi kegagalannya tidak berhenti pada hadiah yang batal: hasil
 * balapan yang baru diselesaikan di transaksi yang sama ikut ter-rollback, dan
 * pemain hanya melihat 500 setiap kali mencoba lagi.
 *
 * `coin` tetap dipakai untuk angka yang memang pecahan dan bermuara di kolom
 * `double precision` (`lapRewardBase`, `pending`, `earned`) -- yang itu tidak
 * boleh ikut dijadikan bilangan bulat.
 */
const rewardCoin = z.number().int().min(1).max(1_000_000);

export const economyConfigSchema = z
  .object({
    coinToIdr: z.number().int().min(1).max(10_000_000),
    minWithdrawCoins: z.number().int().min(1).max(1_000_000),
    maxWithdrawCoins: z.number().int().min(1).max(1_000_000_000),

    startingBalance: z.number().int().min(0).max(1_000_000),
    starterGift: rewardCoin,

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
    boostCornerPenalty: rate,
    boostLaunchGraceLap: rate,

    heartbeatCapSeconds: z.number().finite().min(0).max(86_400),
    offlineCapSeconds: z.number().finite().min(0).max(30 * 86_400),
    offlineRate: rate,

    dailyRewards: z.array(rewardCoin).min(1).max(31),

    referralMilestoneLaps: lapCount,
    referralRewardInviter: rewardCoin,
    referralRewardInvitee: rewardCoin,

    missionLapsTarget: lapCount,
    missionLapsReward: rewardCoin,
    missionUpgradeTarget: z.number().int().min(0).max(100),
    missionUpgradeReward: rewardCoin,
    missionEarnTarget: coin,
    missionEarnReward: rewardCoin,

    dailyMissionLapsTarget: z.number().int().min(1).max(10_000_000),
    dailyMissionEarnTarget: positive,
    dailyMissionBoostTarget: z.number().int().min(1).max(10_000),
    dailyMissionCleanTarget: z.number().int().min(1).max(10_000),
    dailyMissionRewardCap: z.number().int().min(0).max(1_000_000),
    cosmeticBaseHours: z.number().finite().min(1).max(1_000),
    circuitUnlockLaps: lapCount,
    technicalUnlockLaps: lapCount,
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
  )
  /**
   * `calculateRaceSettlement` membagi waktu jadi dua: jendela heartbeat dibayar
   * penuh, sisanya dibayar `offlineRate`. Boost hanya dihitung di dalam jendela
   * heartbeat -- itu asumsi yang tertulis di `lib/game-economy.ts`, dan selama
   * dua angka ini bisa disetel terpisah dari panel, asumsi itu tidak dijaga apa
   * pun.
   *
   * Boost yang lebih panjang dari jendela heartbeat membuat ekornya dibayar
   * dengan tarif normal kali `offlineRate`: pemain menekan Gaspol, tidak
   * mendapat Gaspol, dan tidak ada satu pun error yang memberitahukannya. Tolak
   * di sini, tempat operator masih bisa membacanya.
   */
  .refine(
    (value) => value.boostDurationSeconds <= value.heartbeatCapSeconds,
    {
      message:
        "Durasi boost tidak boleh melebihi jendela heartbeat -- kelebihannya akan dibayar dengan tarif offline.",
      path: ["boostDurationSeconds"],
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

/** Baseline level-one racing income, without boost; identical prices for all players. */
export function cosmeticPriceAt(e: EconomyConfig, tier: number) {
  const levels = { engine: 1, tires: 1, battery: 1 };
  const hourly = 3600 / lapSecondsAt(e, levels, false) * raceRewardAt(e, levels, 0, false);
  return Math.max(1, Math.min(1_000_000_000, Math.ceil(hourly * e.cosmeticBaseHours * 2 ** (tier - 1))));
}

/** Jeda sampai Gaspol berikutnya, diukur dari saat tombol ditekan. Turunan. */
export const boostCooldownSeconds = (e: EconomyConfig) =>
  e.boostDurationSeconds + e.batteryRechargeSeconds;

/**
 * Durasi Gaspol yang benar-benar diberikan, tergantung tekanannya bersih atau
 * tidak. Menekan di tikungan memotong durasinya sebesar `boostCornerPenalty`.
 *
 * Cooldown-nya sengaja tetap `boostCooldownSeconds` yang penuh. Kalau
 * keduanya ikut memendek, salah tekan justru mempercepat Gaspol berikutnya dan
 * tidak ada yang perlu dipikirkan pemain; dengan cooldown tetap, tekanan yang
 * meleset membayar dengan waktu tunggu yang sama untuk hasil yang lebih
 * sedikit. Itu biayanya, dan tidak ada satu koin pun yang ditambahkan ke
 * ekonomi untuk membayarnya.
 */
export const boostDurationFor = (e: EconomyConfig, clean: boolean) =>
  clean
    ? e.boostDurationSeconds
    : e.boostDurationSeconds * (1 - e.boostCornerPenalty);

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

/**
 * Waktu per putaran sesudah setup ikut diperhitungkan -- inilah angka yang
 * benar-benar menentukan penghasilan, dan satu-satunya yang boleh dipakai
 * settlement maupun HUD.
 *
 * `lapSecondsAt` di atas sengaja dibiarkan "mentah": proyeksi panel admin dan
 * harga kosmetik memakainya sebagai garis dasar yang tidak boleh bergeser
 * hanya karena seorang pemain mengganti gearnya.
 *
 * `setup` opsional dan jatuh ke netral. Netral menghasilkan angka yang sama
 * persis dengan `lapSecondsAt`, jadi pemanggil lama tidak berubah perilakunya.
 */
export const effectiveLapSecondsAt = (
  e: EconomyConfig,
  levels: Record<UpgradeKey, number>,
  boosted: boolean,
  setup: CarSetup = NEUTRAL_SETUP,
  circuit = 0,
) =>
  setupLapSeconds(
    lapSecondsAt(e, levels, boosted),
    setup,
    levels.tires,
    circuit,
  );

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
  setup: CarSetup = NEUTRAL_SETUP,
): RacePosition => {
  const playerSeconds = effectiveLapSecondsAt(e, levels, boosted, setup, circuit);
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
  setup: CarSetup = NEUTRAL_SETUP,
) => {
  const position = racePositionAt(e, levels, circuit, boosted, setup);
  const multiplier = 1 + (2 - position) * e.racePositionRewardStep;
  return (
    Math.round(lapRewardAt(e, levels.battery, circuit) * multiplier * 100) /
    100
  );
};
