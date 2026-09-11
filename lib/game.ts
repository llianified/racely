import type { CarColor, CarModelId } from "./car-catalog";

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

export type GameState = {
  // Optional only so legacy preview cookies can be upgraded without losing progress.
  carSelection?: { model: CarModelId | null; returningPlayer: boolean };
  developmentPreview: boolean;
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
};

export const INITIAL_GAME: GameState = {
  developmentPreview: false,
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
export const idr = (value: number) =>
  `Rp${Math.round(value * COIN_TO_IDR).toLocaleString("id-ID")}`;

export const upgradeCost = (key: Upgrade, level: number) =>
  Math.round(
    { engine: 25, tires: 15, battery: 20 }[key] * Math.pow(1.65, level - 1),
  );
export const lapReward = (s: GameState) =>
  roundCoins(0.05 + (s.levels.battery - 1) * 0.01 + s.circuit * 0.02);
export const lapSeconds = (s: GameState) =>
  8 /
  (1 + (s.levels.engine - 1) * 0.15 + (s.levels.tires - 1) * 0.1) /
  (s.boostLeft > 0 ? 2 : 1);
export const totalLevel = (s: GameState) =>
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
export const missionValue = (s: GameState, id: string) =>
  id === "laps" ? s.laps : id === "upgrade" ? totalLevel(s) - 1 : s.earned;

export type GameCommand =
  | { type: "sync" }
  | { type: "upgrade"; key: Upgrade }
  | { type: "claim" | "boost" | "gift" }
  | { type: "mission"; id: string }
  | { type: "select-car"; model: CarModelId; color: CarColor }
  | { type: "color"; color: CarColor }
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
  const progress = s.progress + delta / lapSeconds(s);
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
