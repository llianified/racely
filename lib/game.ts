export type Upgrade = "engine" | "tires" | "battery";
export type PlayerProfile = {
  name: string;
  username: string | null;
  photoUrl: string | null;
};
export type GameState = {
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
};
export const INITIAL_GAME: GameState = {
  balance: 12500,
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
};
export const rupiah = (value: number) =>
  `Rp${Math.floor(value).toLocaleString("id-ID")}`;
export const upgradeCost = (key: Upgrade, level: number) =>
  Math.round(
    { engine: 2500, tires: 1500, battery: 2000 }[key] *
      Math.pow(1.65, level - 1),
  );
export const lapReward = (s: GameState) =>
  250 + (s.levels.battery - 1) * 100 + s.circuit * 150;
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
    reward: 1500,
  },
  {
    id: "upgrade",
    title: "Bukan mobil standar",
    description: "Lakukan 3 upgrade",
    target: 3,
    reward: 2000,
  },
  {
    id: "earn",
    title: "Pelan-pelan jadi sultan",
    description: "Hasilkan Rp5.000 virtual",
    target: 5000,
    reward: 3000,
  },
];
export const missionValue = (s: GameState, id: string) =>
  id === "laps" ? s.laps : id === "upgrade" ? totalLevel(s) - 1 : s.earned;
export type GameCommand =
  | { type: "sync" }
  | { type: "upgrade"; key: Upgrade }
  | { type: "claim" | "boost" | "gift" }
  | { type: "mission"; id: string }
  | { type: "color"; color: "#4275ff" | "#f4b65b" | "#e9eef7" }
  | { type: "circuit"; circuit: 0 | 1 };
export type GameAction =
  | { type: "tick"; delta: number }
  | { type: "hydrate"; state: GameState };
export function gameReducer(s: GameState, action: GameAction): GameState {
  if (action.type === "hydrate") return action.state;
  const delta = Math.max(0, Math.min(action.delta, 0.5));
  const progress = s.progress + delta / lapSeconds(s);
  const completed = Math.floor(progress);
  const income = completed * lapReward(s);
  return {
    ...s,
    progress: progress % 1,
    laps: s.laps + completed,
    pending: s.pending + income,
    earned: s.earned + income,
    boostLeft: Math.max(0, s.boostLeft - delta),
    cooldown: Math.max(0, s.cooldown - delta),
  };
}
