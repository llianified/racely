import { z } from "zod";
import type { CarModelId } from "./car-catalog";
import type { MissionDefinition } from "./missions";

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
  dailyMissionCount: number;
  dailyMissionPool: MissionDefinition[];
  weeklyMissionPool: MissionDefinition[];

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

  /**
   * Seberapa dekat lawan mengikuti level pemain. 0 mengembalikan lawan statis
   * seperti sebelumnya -- dipakai test kompatibilitas, dan jalan keluar kalau
   * rival adaptif ternyata terasa menghukum.
   */
  rivalTrackingStrength: number;
  /** Goyangan level lawan per hari, supaya balapan tidak terasa sama tiap hari. */
  rivalDailyJitter: number;
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
  dailyMissionCount: 2,
  dailyMissionPool: [
    { id: "daily-laps-10", kind: "laps", target: 10, reward: 3 },
    { id: "daily-laps-25", kind: "laps", target: 25, reward: 7 },
    { id: "daily-boosts-2", kind: "boosts", target: 2, reward: 4 },
    { id: "daily-boosts-5", kind: "boosts", target: 5, reward: 8 },
  ],
  weeklyMissionPool: [
    { id: "weekly-laps-150", kind: "laps", target: 150, reward: 35 },
    { id: "weekly-laps-300", kind: "laps", target: 300, reward: 65 },
    { id: "weekly-boosts-20", kind: "boosts", target: 20, reward: 40 },
  ],

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

  rivalTrackingStrength: 0.9,
  rivalDailyJitter: 2,
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

const missionDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,39})$/),
  kind: z.enum(["laps", "boosts"]),
  target: z.number().int().min(1).max(1_000_000),
  reward: z.number().int().min(1).max(1_000_000),
}).strict();

const missionPoolSchema = z
  .array(missionDefinitionSchema)
  .min(1)
  .max(50)
  .superRefine((pool, context) => {
    const seen = new Set<string>();
    for (const [index, mission] of pool.entries()) {
      if (seen.has(mission.id)) {
        context.addIssue({
          code: "custom",
          message: "ID misi harus unik dalam satu pool.",
          path: [index, "id"],
        });
      }
      seen.add(mission.id);
    }
  });

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
    dailyMissionCount: z.number().int().min(1).max(10),
    dailyMissionPool: missionPoolSchema,
    weeklyMissionPool: missionPoolSchema,

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

    rivalTrackingStrength: rate,
    rivalDailyJitter: z.number().int().min(0).max(30),
  })
  .strict()
  .refine((value) => value.dailyMissionCount <= value.dailyMissionPool.length, {
    message: "Jumlah misi harian tidak boleh melebihi isi pool.",
    path: ["dailyMissionCount"],
  })
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

/**
 * Rem emisi global. Anggaran yang terlampaui menurunkan bayaran koin bertahap
 * sampai hari berganti, bukan memutusnya: pemain yang sedang menonton layar
 * tidak boleh tiba-tiba mendapat nol tanpa sebab yang terlihat.
 *
 * Anggaran 0 berarti tanpa anggaran dan tanpa rem -- itu sebabnya tidak ada
 * knob boolean terpisah untuk menyalakannya.
 */
export const emissionBrakeAt = (e: EconomyConfig, coinsMintedToday: number) => {
  if (e.dailyEmissionBudgetIdr <= 0) return 1;
  const spent = coinsMintedToday * e.coinToIdr;
  const share = spent / e.dailyEmissionBudgetIdr;
  if (share < 1) return 1;
  return share < 1.5 ? 0.75 : 0.5;
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

/**
 * Hari balapan berganti tengah malam WIB, bukan UTC. Tanpa ini pemain Indonesia
 * kehilangan atau mendapat satu hari ekstra tiap kali melewati jam 07:00 pagi.
 *
 * Tinggal di berkas ini, bukan di `game-economy.ts`, karena rival harian butuh
 * seed yang diturunkan darinya sementara `game-economy.ts` mengimpor
 * `game.ts` -- menaruhnya di sana membuat lingkarannya tertutup.
 */
export const RACING_DAY_OFFSET_MINUTES = 7 * 60;

/** Kunci hari balapan, "YYYY-MM-DD" menurut WIB. */
export function racingDayKey(now: Date) {
  return new Date(now.getTime() + RACING_DAY_OFFSET_MINUTES * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** Seed harian yang dihitung identik di server dan client. */
export const racingDaySeed = (now: Date) => hashSeed(racingDayKey(now));

export type RacePosition = 1 | 2 | 3;

/**
 * Hash 32-bit deterministik untuk seed harian. Bukan kriptografi -- yang
 * dibutuhkan hanya "sama untuk hari yang sama, berbeda untuk hari berbeda",
 * dan itu harus dihitung ulang identik di server maupun client.
 */
export function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Angka 0..1 dari sebuah seed; langkah berbeda memberi arus yang berbeda. */
const seededUnit = (seed: number, step: number) => {
  let value = (seed + step * 0x9e3779b9) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x2c1b3c6d);
  value ^= value >>> 12;
  value = Math.imul(value, 0x297a2d39);
  value ^= value >>> 15;
  return (value >>> 0) / 0x100000000;
};

/** Jumlah mentah ketiga level; 3 saat semuanya level 1. */
export const levelSum = (levels: Record<UpgradeKey, number>) =>
  levels.engine + levels.tires + levels.battery;

/** Membagi total level ke tiga komponen, masing-masing dibatasi maxUpgradeLevel. */
function splitLevels(e: EconomyConfig, total: number) {
  const levels = { engine: 1, tires: 1, battery: 1 };
  const order: UpgradeKey[] = ["engine", "tires", "battery"];
  let sisa = Math.max(0, total - 3);
  // Berputar supaya kelebihan tidak menumpuk di satu komponen saat salah satu
  // sudah mentok di batas level.
  for (let putaran = 0; putaran < e.maxUpgradeLevel * 3 && sisa > 0; putaran += 1) {
    const key = order[putaran % 3];
    if (levels[key] >= e.maxUpgradeLevel) continue;
    levels[key] += 1;
    sisa -= 1;
  }
  return levels;
}

/**
 * Level lawan. Dengan `rivalTrackingStrength` 0 hasilnya persis tangga tetap
 * yang lama -- itu yang dikunci test kompatibilitas. Di atas 0, lawan mengikuti
 * level pemain sehingga upgrade terasa seperti menyalip, bukan seperti
 * meninggalkan lawan yang sudah lama tertinggal.
 */
export const rivalLevelsAt = (
  e: EconomyConfig,
  circuit: number,
  /** Jumlah mentah ketiga level pemain (3 saat semuanya level 1), bukan totalLevel(). */
  playerTotalLevel = 0,
  daySeed = 0,
) => {
  const tier = circuit > 0 ? 1 : 0;
  const level = (value: number) => Math.min(e.maxUpgradeLevel, value);
  const statis = [
    { engine: level(3 + tier), tires: level(1 + tier), battery: 1 },
    { engine: level(1 + tier), tires: level(2 + tier), battery: 1 },
  ] as const;
  if (e.rivalTrackingStrength <= 0) return statis;

  const atap = e.maxUpgradeLevel * 3;
  return [0, 1].map((index) => {
    const goyang =
      e.rivalDailyJitter > 0
        ? Math.round((seededUnit(daySeed, index + 1) * 2 - 1) * e.rivalDailyJitter)
        : 0;
    // Yang memimpin sedikit di atas pemain, yang mengejar sedikit di bawah:
    // tanpa itu, posisi P1 dan P3 tidak pernah berganti sepanjang hari.
    const condong = index === 0 ? 1 : -1;
    const target = Math.round(
      playerTotalLevel * e.rivalTrackingStrength + goyang + condong,
    );
    return splitLevels(e, Math.min(atap, Math.max(3, target)));
  }) as unknown as readonly [
    Record<UpgradeKey, number>,
    Record<UpgradeKey, number>,
  ];
};

/** Waktu lawan tetap server-derived; model atau input client tidak memengaruhinya. */
export const raceOpponentLapSecondsAt = (
  e: EconomyConfig,
  circuit: number,
  playerTotalLevel = 0,
  daySeed = 0,
): readonly [number, number] => {
  const [leader, chaser] = rivalLevelsAt(e, circuit, playerTotalLevel, daySeed);
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
  playerTotalLevel = 0,
  daySeed = 0,
): RacePosition => {
  const playerSeconds = lapSecondsAt(e, levels, boosted);
  const losses = raceOpponentLapSecondsAt(
    e,
    circuit,
    playerTotalLevel,
    daySeed,
  ).filter((opponentSeconds) => opponentSeconds < playerSeconds).length;
  return (losses + 1) as RacePosition;
};

export const raceRewardAt = (
  e: EconomyConfig,
  levels: Record<UpgradeKey, number>,
  circuit: number,
  boosted: boolean,
  playerTotalLevel = 0,
  daySeed = 0,
) => {
  const position = racePositionAt(
    e,
    levels,
    circuit,
    boosted,
    playerTotalLevel,
    daySeed,
  );
  const multiplier = 1 + (2 - position) * e.racePositionRewardStep;
  return (
    Math.round(lapRewardAt(e, levels.battery, circuit) * multiplier * 100) /
    100
  );
};
