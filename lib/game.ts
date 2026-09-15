import { raceOrder, type RaceRivals } from './race-opponents';
import type { CarColor, CarModelId } from "./car-catalog";
import type { DailyMissions, DailyMissionKind } from "./daily-missions";
import type { PaintId, PaintCommand } from "./car-paints";
import type { BodyParts, PartCommand } from "./car-parts";
import { NEUTRAL_SETUP, type CarSetup, type SetupCommand } from "./car-setup";
import {
  DEFAULT_ECONOMY,
  boostCooldownSeconds,
  boostDurationFor,
  coinsToIdr,
  effectiveLapSecondsAt,
  raceRewardAt,
  upgradeCostAt,
  type EconomyConfig,
  type RacePosition,
  type UpgradeKey,
} from "./economy-config";

export type { EconomyConfig, RacePosition };
/** Alias; definisinya hidup di `lib/economy-config.ts` bersama rumusnya. */
export type Upgrade = UpgradeKey;
export type PlayerProfile = {
  name: string;
  username: string | null;
  photoUrl: string | null;
};

/**
 * Angka ekonomi -- nilai koin, hadiah, biaya, batas idle -- dulu berupa
 * konstanta modul di sini dan diimpor langsung oleh UI. Sekarang semuanya hidup
 * di `EconomyConfig` dan ikut di `GameState.economy`, jadi panel admin bisa
 * menyetelnya tanpa deploy dan tampilan tidak bisa menyimpang dari server.
 * Lihat `lib/economy-config.ts`.
 *
 * `REFERRAL_PARAM_PREFIX` tetap konstanta: itu bentuk deep link Telegram, bukan
 * angka ekonomi.
 */
/** Awalan payload referral Telegram: `?start=ref_<userId>` dan `?startapp=ref_<userId>`. */
export const REFERRAL_PARAM_PREFIX = "ref_";

export const WITHDRAW_METHODS = [
  { id: "dana", label: "DANA", kind: "ewallet" },
  { id: "gopay", label: "GoPay", kind: "ewallet" },
  { id: "ovo", label: "OVO", kind: "ewallet" },
  { id: "shopeepay", label: "ShopeePay", kind: "ewallet" },
  { id: "bca", label: "Bank BCA", kind: "bank" },
  { id: "bri", label: "Bank BRI", kind: "bank" },
  { id: "bni", label: "Bank BNI", kind: "bank" },
  { id: "mandiri", label: "Bank Mandiri", kind: "bank" },
] as const;

export type WithdrawMethod = (typeof WITHDRAW_METHODS)[number]["id"];
export type WithdrawStatus = "pending" | "processing" | "paid" | "rejected";
export type WithdrawalRecord = {
  id: string;
  coins: number;
  method: WithdrawMethod;
  account: string;
  accountName: string;
  status: WithdrawStatus;
  createdAt: string;
};

export const WITHDRAW_STATUS_LABEL: Record<WithdrawStatus, string> = {
  pending: "Menunggu diproses",
  processing: "Sedang diproses",
  paid: "Dana terkirim",
  rejected: "Ditolak",
};

export const methodLabel = (id: WithdrawMethod) =>
  WITHDRAW_METHODS.find((method) => method.id === id)?.label ?? id;

export const accountPattern = (id: WithdrawMethod) =>
  WITHDRAW_METHODS.find((method) => method.id === id)?.kind === "bank"
    ? /^\d{8,18}$/
    : /^08\d{8,12}$/;

/**
 * What the race earned while the player was away, summarised for the
 * welcome-back dialog. Transient: the server recomputes it per response and it
 * is never persisted, so it appears on exactly the one state that credited it.
 */
export type OfflineEarnings = {
  /** Real time since the last settlement, before any cap. */
  awaySeconds: number;
  /** Offline seconds that actually paid out, after the cap. */
  creditedSeconds: number;
  /** True when the absence outran the cap and the tail was dropped. */
  capped: boolean;
  laps: number;
  coins: number;
};

/**
 * Bentuk payload Gaspol yang sudah pensiun. Tidak ada lagi yang mengisinya --
 * `boost` ditolak 410 di server maupun mode preview -- jadi field ini SELALU
 * absen pada respons. Dipertahankan sebagai kontrak yang dijaga
 * `tests/server-preview-parity.test.ts`: klien lama yang masih membacanya harus
 * melihat `undefined`, bukan durasi karangan.
 */
export type BoostLaunch = {
  /** True kalau tombolnya ditekan di trek lurus. */
  clean: boolean;
  /** Detik Gaspol yang benar-benar diberikan, sesudah potongan. */
  seconds: number;
};

/** Ringkasan check-in harian untuk UI; dihitung ulang tiap respons. */
export type DailyCheckIn = {
  /** Hari berturut-turut, sudah termasuk hari ini kalau `claimedToday`. */
  streak: number;
  claimedToday: boolean;
  /** Koin kalau klaim sekarang; 0 kalau hari ini sudah diklaim. */
  reward: number;
  /** Koin untuk klaim berikutnya -- dipakai memotivasi lanjut besok. */
  nextReward: number;
};

/**
 * Ringkasan bonus iklan rewarded untuk UI; dihitung ulang tiap respons dari
 * jumlah klaim `ad:<hari>:<n>` yang sudah tercatat hari ini.
 */
export type AdReward = {
  watchedToday: number;
  dailyCap: number;
  /** Koin untuk satu tontonan berikutnya; 0 kalau jatah habis atau fitur mati. */
  reward: number;
  available: boolean;
};

/** Ringkasan ajakan untuk UI; link dibangun server dari username bot. */
export type ReferralSummary = {
  link: string;
  invited: number;
  /**
   * Ajakan yang tuntas (`referral_paid_at` terisi). Ini yang membuka hadiah
   * milestone di `lib/referral-rewards.ts`; `invited` hanya untuk tampilan.
   */
  completed: number;
  /** Koin yang sudah benar-benar dibayarkan dari ajakan yang tuntas. */
  earned: number;
};

export type GameState = {
  rivals?: RaceRivals;
  dailyMissions?: DailyMissions;
  /**
   * Gear ratio dan roller. Gratis diubah, tidak pernah memberi koin, dan ikut
   * menentukan waktu per putaran -- jadi ia state otoritatif milik server,
   * bukan preferensi tampilan. Opsional hanya supaya cookie preview lama bisa
   * naik versi tanpa kehilangan progres; pembacanya memakai `NEUTRAL_SETUP`.
   */
  setup?: CarSetup;
  ownedPaints?: PaintId[];
  bodyParts?: BodyParts;
  // Optional only so legacy preview cookies can be upgraded without losing progress.
  carSelection?: { model: CarModelId | null; returningPlayer: boolean; starterModel?: CarModelId | null };
  developmentPreview: boolean;
  /**
   * Config ekonomi yang dipakai respons ini. Ikut di setiap payload supaya
   * client menghitung dengan angka yang sama persis dengan server -- bukan
   * dengan konstanta yang dibekukan saat build.
   */
  economy: EconomyConfig;
  balance: number;
  pending: number;
  earned: number;
  laps: number;
  progress: number;
  levels: Record<Upgrade, number>;
  boostLeft: number;
  cooldown: number;
  rewardClaimed: boolean;
  missionsClaimed: string[];
  color: string;
  circuit: number;
  player: PlayerProfile;
  withdrawals: WithdrawalRecord[];
  daily: DailyCheckIn;
  adReward: AdReward;
  referral: ReferralSummary;
  offlineEarnings?: OfflineEarnings;
  boostLaunch?: BoostLaunch;
};

export const INITIAL_GAME: GameState = {
  developmentPreview: false,
  setup: NEUTRAL_SETUP,
  balance: DEFAULT_ECONOMY.startingBalance,
  pending: 0,
  earned: 0,
  laps: 0,
  progress: 0,
  levels: { engine: 1, tires: 1, battery: 1 },
  boostLeft: 0,
  cooldown: 0,
  rewardClaimed: false,
  missionsClaimed: [],
  color: "#4275ff",
  circuit: 0,
  player: { name: "Rookie racer", username: null, photoUrl: null },
  withdrawals: [],
  economy: DEFAULT_ECONOMY,
  // Nilai streak-nol; server dan mode preview selalu menimpanya.
  daily: {
    streak: 0,
    claimedToday: false,
    reward: DEFAULT_ECONOMY.dailyRewards[0],
    nextReward: DEFAULT_ECONOMY.dailyRewards[1] ?? DEFAULT_ECONOMY.dailyRewards[0],
  },
  adReward: {
    watchedToday: 0,
    dailyCap: DEFAULT_ECONOMY.adRewardDailyCap,
    reward: DEFAULT_ECONOMY.adRewardCoins,
    available: DEFAULT_ECONOMY.adRewardDailyCap > 0,
  },
  referral: { link: "", invited: 0, completed: 0, earned: 0 },
};

/** Coin amounts are kept to two decimals so partial laps still count. */
export const roundCoins = (value: number) => Math.round(value * 100) / 100;
export const formatCoins = (value: number) => {
  const amount = roundCoins(value);
  return Number.isInteger(amount)
    ? amount.toLocaleString("id-ID")
    : amount.toLocaleString("id-ID", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
};
export const coins = (value: number) => `${formatCoins(value)} koin`;

export function referralShareText(inviterName: string, inviteeReward: number) {
  const name = inviterName.trim().replace(/\s+/g, " ").slice(0, 64) || "Temanmu";
  return `${name} mengajakmu balapan di Racely! Main lewat link ini dan penuhi syarat ajakan untuk mendapatkan ${coins(Math.max(0, inviteeReward))}.`;
}

/** Rough, human duration for offline summaries: "4 jam", "12 menit", "45 detik". */
export const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0)
    return minutes > 0 ? `${hours} jam ${minutes} menit` : `${hours} jam`;
  if (minutes > 0) return `${minutes} menit`;
  return `${total} detik`;
};
/** Rupiah yang benar-benar dicatat untuk `value` koin -- rumus yang sama dengan penarikan. */
export const idr = (value: number, e: EconomyConfig) =>
  `Rp${coinsToIdr(value, e).toLocaleString("id-ID")}`;
/**
 * Kurs dalam satu kalimat pendek: "10 koin = Rp1" saat satu rupiah bernilai
 * bilangan bulat koin, "1 koin = Rp100" saat koinnya lebih mahal dari rupiah,
 * dan "1.000 koin = Rp250" untuk kurs pecahan yang tidak rapi. `idr(1, e)`
 * tidak bisa dipakai di sini: pada kurs 0,1 ia membaca "Rp0".
 */
export const coinRate = (e: EconomyConfig) => {
  if (e.coinToIdr >= 1) return `1 koin = ${idr(1, e)}`;
  const perRupiah = 1 / e.coinToIdr;
  const whole = Math.round(perRupiah);
  return Math.abs(perRupiah - whole) < 1e-9
    ? `${formatCoins(whole)} koin = Rp1`
    : `${formatCoins(1_000)} koin = ${idr(1_000, e)}`;
};

/**
 * Pembungkus yang menerima state, dipakai UI. Rumusnya sendiri ada di
 * `lib/economy-config.ts` supaya proyeksi panel admin memakai rumus yang sama
 * dan tidak ada salinan kedua yang bisa menyimpang.
 */
export const upgradeCost = (
  s: Pick<GameState, "economy" | "levels">,
  key: Upgrade,
) => upgradeCostAt(s.economy, key, s.levels[key]);
export const carSetup = (s: Pick<GameState, "setup">) => s.setup ?? NEUTRAL_SETUP;
export const lapReward = (
  s: Pick<GameState, "levels" | "circuit" | "boostLeft" | "economy" | "setup">,
) =>
  raceRewardAt(
    s.economy,
    s.levels,
    s.circuit,
    s.boostLeft > 0,
    carSetup(s),
  );
export const lapSeconds = (
  s: Pick<GameState, "levels" | "boostLeft" | "economy" | "setup" | "circuit">,
) =>
  effectiveLapSecondsAt(
    s.economy,
    s.levels,
    s.boostLeft > 0,
    carSetup(s),
    s.circuit,
  );
export const racePosition = (
  s: Pick<GameState, "laps" | "progress" | "rivals" | "economy">,
) => raceOrder(s.laps + s.progress, s.rivals, s.economy).findIndex(entry => entry.opponent === null) + 1;
export const MODIFICATION_PARTS: Record<Upgrade, readonly string[]> = {
  engine: ["Motor standar", "Motor sport", "Motor racing", "Motor pro"],
  tires: ["Ban & roller standar", "Ban low-friction", "Roller bearing", "Ban & roller pro"],
  battery: ["Baterai standar", "Sel sport", "Sel racing", "Sel pro"],
};

export function modificationPartName(key: Upgrade, level: number) {
  const tier = level <= 1 ? 0 : level <= 4 ? 1 : level <= 7 ? 2 : 3;
  return MODIFICATION_PARTS[key][tier];
}

export function modificationPreview(game: GameState, key: Upgrade) {
  const ceiling = game.economy.maxUpgradeLevel;
  const level = game.levels[key];
  const maxed = level >= ceiling;
  const nextLevel = Math.min(ceiling, level + 1);
  const before = { ...game, boostLeft: 0 };
  const after = { ...before, levels: { ...game.levels, [key]: nextLevel } };
  const cost = maxed ? 0 : upgradeCost(game, key);
  return {
    level,
    nextLevel,
    maxed,
    cost,
    shortfall: roundCoins(Math.max(0, cost - game.balance)),
    currentPart: modificationPartName(key, level),
    nextPart: modificationPartName(key, nextLevel),
    beforeSeconds: lapSeconds(before),
    afterSeconds: lapSeconds(after),
    beforeReward: lapReward(before),
    afterReward: lapReward(after),
  };
}

/**
 * Kecepatan yang ditampilkan diturunkan dari waktu per putaran, satu-satunya
 * besaran yang benar-benar menentukan penghasilan. Faktornya memetakan "satu
 * putaran per detik" ke angka km/j yang masuk akal untuk mobil seukuran mini
 * 4WD.
 *
 * Angka ini sengaja tidak menerima faktor apa pun dari simulasi grip: grip
 * menggerakkan racing line, bukan laju putaran, jadi mengalikannya ke sini akan
 * membuat panel kecepatan membantah waktu/putaran dan koin/putaran di sebelahnya.
 */
const KMH_PER_LAP_PER_SECOND = 192;
export const displaySpeedKmh = (secondsPerLap: number) =>
  KMH_PER_LAP_PER_SECOND / secondsPerLap;

/**
 * Satu format untuk laju, dipakai HUD balapan dan statistik garasi.
 *
 * Desimalnya dilepas mulai 100 km/j -- lima karakter, dan kolom HUD tidak muat
 * selebar itu di lebar HP mana pun (tumpah 18px di 320, masih 6px di 390). Di
 * angka segitu presisi 0,1 km/j juga tidak memberi tahu pemain apa pun.
 *
 * Pada `DEFAULT_ECONOMY` ambang itu tidak pernah tercapai: level maksimum di
 * setup tercepat berhenti di ~82 km/j sejak Gaspol dihapus. Cabangnya tetap
 * ada karena `lapBaseSeconds` dan laju per level disetel dari /admin, dan
 * menaikkannya sedikit saja sudah melewati 100.
 *
 * Pembulatan dilakukan sebelum ambangnya diuji, supaya 99,96 jadi "100" dan
 * bukan "100,0" yang justru lima karakter lagi.
 *
 * Locale id-ID dipakai supaya laju tidak tampil "19.7" di HUD tapi "19,7" di
 * garasi -- dan supaya titik tidak berarti desimal di kolom laju sekaligus
 * ribuan di kolom RPM tepat sebelahnya.
 */
export const formatSpeedKmh = (kmh: number) => {
  const digits = Math.round(kmh * 10) / 10 >= 100 ? 0 : 1;
  return kmh.toLocaleString("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

// Keep the legacy payload shape for old clients; automatic racing has no boost reserve.
export function batteryTelemetry(
  _s: Pick<GameState, "boostLeft" | "cooldown" | "economy">,
) {
  return { charge: 1, percent: 100, phase: "ready" as const, readyIn: 0, canBoost: false };
}

export const totalLevel = (s: Pick<GameState, "levels">) =>
  Object.values(s.levels).reduce((a, b) => a + b, 0) - 2;

export const MISSION_IDS = ["laps", "upgrade", "earn"] as const;
export type MissionId = (typeof MISSION_IDS)[number];

/**
 * Judul dan kalimatnya tetap di kode, bukan di config: itu teks UI, bukan angka
 * ekonomi. Yang datang dari config hanya target dan hadiahnya -- dan kalimatnya
 * dibangun dari target itu, supaya menaikkan target lewat panel admin tidak
 * meninggalkan kalimat yang menyebut angka lama.
 */
const MISSION_COPY: Record<
  MissionId,
  { title: string; description: (target: number) => string }
> = {
  laps: {
    title: "Pemanasan dulu, bos",
    description: (target) => `Selesaikan ${target} putaran`,
  },
  upgrade: {
    title: "Bukan mobil standar",
    description: (target) => `Lakukan ${target} upgrade`,
  },
  earn: {
    title: "Pelan-pelan jadi sultan",
    description: (target) => `Kumpulkan ${formatCoins(target)} koin dari balapan`,
  },
};

export type Mission = {
  id: MissionId;
  title: string;
  description: string;
  target: number;
  reward: number;
};

export function missions(e: EconomyConfig): Mission[] {
  const tuned: { id: MissionId; target: number; reward: number }[] = [
    { id: "laps", target: e.missionLapsTarget, reward: e.missionLapsReward },
    {
      id: "upgrade",
      target: e.missionUpgradeTarget,
      reward: e.missionUpgradeReward,
    },
    { id: "earn", target: e.missionEarnTarget, reward: e.missionEarnReward },
  ];
  return tuned.map(({ id, target, reward }) => ({
    id,
    target,
    reward,
    title: MISSION_COPY[id].title,
    description: MISSION_COPY[id].description(target),
  }));
}

export const missionValue = (
  s: Pick<GameState, "laps" | "levels" | "earned">,
  id: MissionId,
) =>
  id === "laps" ? s.laps : id === "upgrade" ? totalLevel(s) - 1 : s.earned;

export type GameCommand =
  | SetupCommand
  | PaintCommand
  | { type: "daily-mission"; day: string; kind: DailyMissionKind }
  | PartCommand
  | { type: "sync" }
  | { type: "upgrade"; key: Upgrade }
  | { type: "claim" | "boost" | "gift" | "daily" | "watch-ad" }
  | { type: "mission"; id: MissionId }
  | { type: "select-car"; model: CarModelId; color: CarColor }
  | { type: "color"; color: CarColor }
  | { type: "circuit"; circuit: number }
  | {
      type: "withdraw";
      method: WithdrawMethod;
      account: string;
      accountName: string;
      coins: number;
    };
export type GameAction =
  | { type: "tick"; delta: number }
  | { type: "hydrate"; state: GameState };

export function advanceRaceProgress(
  progress: number,
  elapsedSeconds: number,
  lapDurationSeconds: number,
) {
  const accumulated = progress + elapsedSeconds / lapDurationSeconds;
  return {
    completedLaps: Math.floor(accumulated),
    progress: accumulated % 1,
  };
}

export function gameReducer(s: GameState, action: GameAction): GameState {
  if (action.type === "hydrate") return action.state;
  if (s.carSelection?.model === null) return s;
  const delta = Math.max(0, Math.min(action.delta, 0.5));
  const { progress, completedLaps: completed } = advanceRaceProgress(s.progress, delta, lapSeconds(s));
  const income = completed * lapReward(s);
  return {
    ...s,
    progress,
    laps: s.laps + completed,
    pending: roundCoins(s.pending + income),
    earned: roundCoins(s.earned + income),
    boostLeft: 0,
    cooldown: 0,
    rivals: s.rivals ? { ...s.rivals, elapsedSeconds: (s.rivals.elapsedSeconds ?? 0) + delta } : undefined,
  };
}

/** Re-export supaya konsumen `lib/game.ts` tidak perlu mengimpor dua modul. */
export { boostCooldownSeconds, boostDurationFor };
