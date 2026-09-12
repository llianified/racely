import type { CarColor, CarModelId } from "./car-catalog";
import type { CosmeticSlot, EquippedCosmetics } from "./cosmetics";

export type Upgrade = "engine" | "tires" | "battery";
export type PlayerProfile = {
  name: string;
  username: string | null;
  photoUrl: string | null;
};

/** One coin is worth this many rupiah when a player withdraws. */
export const COIN_TO_IDR = 100;
export const MIN_WITHDRAW_COINS = 100;
export const STARTER_GIFT = 15;

/**
 * Hadiah check-in harian per hari streak (1-based), menaik lalu mentok di rung
 * terakhir. Batas atas itu disengaja: setiap koin adalah kewajiban rupiah, jadi
 * hadiah harian harus terhitung berapa pun panjang streak pemain.
 */
export const DAILY_REWARDS = [1, 2, 3, 4, 5, 6, 10] as const;

/**
 * Referral dibayar pada capaian, bukan saat mendaftar. Mendaftar itu gratis;
 * 100 putaran butuh belasan menit bermain sungguhan, dan itulah yang membuat
 * membuat akun palsu tidak sepadan.
 */
export const REFERRAL_MILESTONE_LAPS = 100;
export const REFERRAL_REWARD_INVITER = 25;
export const REFERRAL_REWARD_INVITEE = 10;
/** Awalan `start_param` pada deep link Telegram: `?startapp=ref_<userId>`. */
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

/** Ringkasan ajakan untuk UI; link dibangun server dari username bot. */
export type ReferralSummary = {
  link: string;
  invited: number;
  /** Koin yang sudah benar-benar dibayarkan dari ajakan yang tuntas. */
  earned: number;
};

export type GameState = {
  // Optional only so legacy preview cookies can be upgraded without losing progress.
  carSelection?: { model: CarModelId | null; returningPlayer: boolean };
  developmentPreview: boolean;
  ownedCosmetics: string[];
  equippedCosmetics: EquippedCosmetics;
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
  referral: ReferralSummary;
  offlineEarnings?: OfflineEarnings;
};

export const INITIAL_GAME: GameState = {
  developmentPreview: false,
  ownedCosmetics: [],
  equippedCosmetics: {},
  balance: 10,
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
  // Nilai streak-nol; server dan mode preview selalu menimpanya.
  daily: {
    streak: 0,
    claimedToday: false,
    reward: DAILY_REWARDS[0],
    nextReward: DAILY_REWARDS[1],
  },
  referral: { link: "", invited: 0, earned: 0 },
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
export const idr = (value: number) =>
  `Rp${Math.round(value * COIN_TO_IDR).toLocaleString("id-ID")}`;

export const upgradeCost = (key: Upgrade, level: number) =>
  Math.round(
    { engine: 25, tires: 15, battery: 20 }[key] * Math.pow(1.65, level - 1),
  );
export const lapReward = (s: Pick<GameState, "levels" | "circuit">) =>
  roundCoins(0.05 + (s.levels.battery - 1) * 0.01 + s.circuit * 0.02);
export const lapSeconds = (s: Pick<GameState, "levels" | "boostLeft">) =>
  8 /
  (1 + (s.levels.engine - 1) * 0.15 + (s.levels.tires - 1) * 0.1) /
  (s.boostLeft > 0 ? 2 : 1);
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
  const level = game.levels[key];
  const maxed = level >= 10;
  const nextLevel = Math.min(10, level + 1);
  const before = { ...game, boostLeft: 0 };
  const after = { ...before, levels: { ...game.levels, [key]: nextLevel } };
  const cost = maxed ? 0 : upgradeCost(key, level);
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

export const BOOST_DURATION_SECONDS = 10;
export const BATTERY_RECHARGE_SECONDS = 25;

// Derive reserve from the authoritative boost timers, so reloads cannot refill it.
export function batteryTelemetry(s: Pick<GameState, "boostLeft" | "cooldown">) {
  const discharging = s.boostLeft > 0;
  const charging = !discharging && s.cooldown > 0;
  const charge = Math.max(0, Math.min(1, discharging
    ? s.boostLeft / BOOST_DURATION_SECONDS
    : 1 - s.cooldown / BATTERY_RECHARGE_SECONDS));
  return {
    charge,
    percent: Math.round(charge * 100),
    phase: discharging ? "discharging" as const : charging ? "charging" as const : "ready" as const,
    readyIn: Math.max(0, Math.ceil(s.cooldown)),
    canBoost: !discharging && !charging,
  };
}

export const totalLevel = (s: Pick<GameState, "levels">) =>
  Object.values(s.levels).reduce((a, b) => a + b, 0) - 2;

export const MISSIONS = [
  {
    id: "laps",
    title: "Pemanasan dulu, bos",
    description: "Selesaikan 10 putaran",
    target: 10,
    reward: 5,
  },
  {
    id: "upgrade",
    title: "Bukan mobil standar",
    description: "Lakukan 3 upgrade",
    target: 3,
    reward: 10,
  },
  {
    id: "earn",
    title: "Pelan-pelan jadi sultan",
    description: "Kumpulkan 25 koin dari balapan",
    target: 25,
    reward: 15,
  },
];
export const missionValue = (
  s: Pick<GameState, "laps" | "levels" | "earned">,
  id: string,
) =>
  id === "laps" ? s.laps : id === "upgrade" ? totalLevel(s) - 1 : s.earned;

export type GameCommand =
  | { type: "sync" }
  | { type: "upgrade"; key: Upgrade }
  | { type: "claim" | "boost" | "gift" | "daily" }
  | { type: "mission"; id: string }
  | { type: "select-car"; model: CarModelId; color: CarColor }
  | { type: "color"; color: CarColor }
  | { type: "buy-cosmetic"; id: string }
  | { type: "equip-cosmetic"; slot: CosmeticSlot; id: string | null }
  | { type: "circuit"; circuit: 0 | 1 }
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

export function gameReducer(s: GameState, action: GameAction): GameState {
  if (action.type === "hydrate") return action.state;
  if (s.carSelection?.model === null) return s;
  const delta = Math.max(0, Math.min(action.delta, 0.5));
  const boostedSeconds = Math.min(delta, Math.max(0, s.boostLeft));
  const normalSeconds = delta - boostedSeconds;
  const normalLapSeconds = lapSeconds({ ...s, boostLeft: 0 });
  const progress = s.progress + (boostedSeconds * 2 + normalSeconds) / normalLapSeconds;
  const completed = Math.floor(progress);
  const income = completed * lapReward(s);
  return {
    ...s,
    progress: progress % 1,
    laps: s.laps + completed,
    pending: roundCoins(s.pending + income),
    earned: roundCoins(s.earned + income),
    boostLeft: Math.max(0, s.boostLeft - delta),
    cooldown: Math.max(0, s.cooldown - delta),
  };
}
