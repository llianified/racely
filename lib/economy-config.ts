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
  /**
   * Rupiah per koin saat penarikan. Boleh pecahan: bawaannya 0,1, yaitu
   * 10 koin = Rp1, supaya angka koin di layar terlihat besar sementara
   * kewajiban rupiahnya tetap kecil. Rupiahnya dihitung lewat `coinsToIdr`.
   */
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
  /**
   * Knob PENSIUN. Hadiah per putaran tidak pernah lagi bergantung posisi --
   * `raceRewardAt` mengabaikannya sepenuhnya. Tetap di tipe untuk alasan yang
   * sama dengan knob Gaspol di bawah: baris config lama harus tetap lolos
   * skema yang `.strict()`.
   */
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

  /**
   * Lima knob berikut -- termasuk `boostCornerPenalty` dan
   * `boostLaunchGraceLap` -- adalah knob PENSIUN. Gaspol sudah dihapus dari
   * permainan, panel admin tidak mendaftarkannya lagi
   * (`tests/economy-config.test.ts` mengunci daftar itu), dan tidak ada
   * settlement yang membacanya. Semuanya tetap di tipe supaya baris config lama
   * yang sudah tersimpan sebagai jsonb tetap lolos `economyConfigSchema` yang
   * `.strict()`.
   */
  boostDurationSeconds: number;
  batteryRechargeSeconds: number;
  boostMultiplier: number;
  /** Pensiun bersama Gaspol; lihat catatan di `boostDurationSeconds`. */
  boostCornerPenalty: number;
  /** Pensiun bersama Gaspol; lihat catatan di `boostDurationSeconds`. */
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
  /**
   * Knob PENSIUN bersama Gaspol: `dailyMissionsFor` hanya membuat misi `laps`
   * dan `earn`. Tetap di tipe supaya baris config lama tetap lolos skema.
   */
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
/**
 * Denominasi bawaan: 10 koin = Rp1. Semua angka koin di bawah ini dibaca
 * dengan kurs itu -- 5 koin per putaran adalah Rp0,5, hadiah starter 20.000
 * koin adalah Rp2.000, dan ambang tarik 200.000 koin adalah Rp20.000.
 *
 * Kenapa bukan 1 koin = Rp1: satu putaran hanya boleh bernilai sepersekian
 * rupiah supaya pembayaran per pemain tetap wajar, tapi koin pecahan
 * ("+0,05") terasa murah dan tidak memotivasi. Denominasi yang lebih halus
 * membuat setiap hadiah bulat dan berdigit banyak tanpa menaikkan kewajiban.
 *
 * Kewajiban pada bawaan ini (putaran 8 detik, 450 putaran/jam di level 1):
 * aktif level 1 ~Rp225/jam; idle penuh 3x sehari ~Rp1.350/hari; pemain
 * yang sudah maksimal (mesin/ban/baterai 10, sirkuit 3) ~Rp2.900/jam aktif.
 */
export const DEFAULT_ECONOMY: EconomyConfig = {
  coinToIdr: 0.1,
  minWithdrawCoins: 200_000,
  maxWithdrawCoins: 5_000_000,

  startingBalance: 5_000,
  starterGift: 20_000,

  lapBaseSeconds: 8,
  lapEnginePerLevel: 0.15,
  lapTiresPerLevel: 0.1,
  lapRewardBase: 5,
  lapRewardPerBattery: 1,
  lapRewardPerCircuit: 3,
  racePositionRewardStep: 0.2,

  // Saldo + hadiah starter (25.000) persis cukup untuk level 2 ketiga
  // komponen (12.000) plus sisa yang memancing upgrade berikutnya.
  upgradeCostEngine: 5_000,
  upgradeCostTires: 3_000,
  upgradeCostBattery: 4_000,
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

  dailyRewards: [500, 750, 1_000, 1_500, 2_000, 3_000, 5_000],

  referralMilestoneLaps: 100,
  referralRewardInviter: 10_000,
  referralRewardInvitee: 5_000,

  missionLapsTarget: 10,
  missionLapsReward: 2_500,
  missionUpgradeTarget: 3,
  missionUpgradeReward: 5_000,
  missionEarnTarget: 2_500,
  missionEarnReward: 7_500,

  dailyMissionLapsTarget: 60,
  dailyMissionEarnTarget: 500,
  dailyMissionBoostTarget: 3,
  dailyMissionCleanTarget: 2,
  dailyMissionRewardCap: 2_000,
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

/**
 * Rupiah yang dicatat untuk sejumlah koin. `coinToIdr` boleh pecahan, dan
 * hasil kali pecahan biner (200.000 x 0,1) bisa meleset sepersekian triliun
 * ke bawah -- `Math.floor` polos akan memangkasnya satu rupiah penuh. Jadi
 * dibulatkan dulu ke mikro-rupiah, baru dibulatkan ke bawah: pemain tidak
 * pernah dibayar lebih dari nilai koinnya, dan tidak kehilangan rupiah
 * karena artefak floating point.
 */
export function coinsToIdr(coins: number, economy: EconomyConfig) {
  return Math.floor(Math.round(coins * economy.coinToIdr * 1_000_000) / 1_000_000);
}

export const economyConfigSchema = z
  .object({
    coinToIdr: z.number().finite().gt(0).max(10_000_000),
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
   * `amount_idr` punya CHECK `> 0`. Dengan kurs pecahan, minimum tarik yang
   * bernilai di bawah Rp1 akan lolos skema lalu meledak sebagai 500 di
   * transaksi penarikan -- ditolak di sini, dengan pesan yang bisa dibaca.
   */
  .refine((value) => coinsToIdr(value.minWithdrawCoins, value) >= 1, {
    message: "Penarikan minimum harus bernilai setidaknya Rp1 pada kurs ini.",
    path: ["minWithdrawCoins"],
  })
  /**
   * `amount_idr` dihitung lewat `coinsToIdr` dan dibawa sebagai number
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
   * Sisa dari masa Gaspol. Knob boost sudah pensiun -- tidak ada lagi jendela
   * boost yang dihitung settlement -- tapi batas ini tetap ditegakkan supaya
   * baris config lama yang masih menyimpan `boostDurationSeconds` tidak bisa
   * dihidupkan kembali dalam bentuk yang tidak masuk akal. Ia tidak
   * memengaruhi satu koin pun hari ini.
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

/**
 * Turunan dari knob Gaspol yang sudah pensiun. Tidak ada pemanggil di jalur
 * permainan; keduanya tinggal untuk menjaga bentuk knob lama tetap teruji.
 */
export const boostCooldownSeconds = (e: EconomyConfig) =>
  e.boostDurationSeconds + e.batteryRechargeSeconds;

/** Sama pensiunnya dengan `boostCooldownSeconds`: hanya dipanggil test. */
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
  _boosted: boolean,
) =>
  e.lapBaseSeconds /
  (1 +
    (levels.engine - 1) * e.lapEnginePerLevel +
    (levels.tires - 1) * e.lapTiresPerLevel);

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

export const raceRewardAt = (
  e: EconomyConfig,
  levels: Record<UpgradeKey, number>,
  circuit: number,
  _boosted: boolean,
  _setup: CarSetup = NEUTRAL_SETUP,
) => lapRewardAt(e, levels.battery, circuit);
