import { coins, lapReward, MISSIONS, missionValue, roundCoins, STARTER_GIFT, upgradeCost, type GameState, type Upgrade } from "./game";

export const STINT_LAPS = 5;
export const UPGRADE_LABELS: Record<Upgrade, string> = { engine: "Mesin", tires: "Ban & roller", battery: "Baterai" };

type RaceSnapshot = Pick<GameState, "laps" | "earned">;
export type RaceStint = {
  start: RaceSnapshot;
  number: number;
  result: { laps: number; coins: number } | null;
};

export function createRaceStint(confirmed: RaceSnapshot): RaceStint {
  return { start: { laps: confirmed.laps, earned: confirmed.earned }, number: 1, result: null };
}

// Etapes group existing server-confirmed laps; they never award additional coins.
export function raceStintReducer(state: RaceStint, action: { type: "confirm" | "continue"; confirmed: RaceSnapshot }): RaceStint {
  if (action.type === "continue") {
    if (!state.result) return state;
    return { ...createRaceStint(action.confirmed), number: state.number + 1 };
  }
  if (state.result || action.confirmed.laps < state.start.laps + STINT_LAPS) return state;
  return { ...state, result: {
    laps: action.confirmed.laps - state.start.laps,
    coins: roundCoins(Math.max(0, action.confirmed.earned - state.start.earned)),
  } };
}

export type RaceNextAction =
  | { type: "gift" }
  | { type: "mission"; id: string }
  | { type: "circuit" }
  | { type: "workshop" }
  | { type: "claim" };

export type RaceGoal = {
  title: string;
  detail: string;
  progress?: { value: number; target: number };
  action?: RaceNextAction;
  label?: string;
};

export function nextRaceGoal(game: GameState): RaceGoal {
  const ready = MISSIONS.find(item => !game.missionsClaimed.includes(item.id) && missionValue(game, item.id) >= item.target);
  if (ready) return { title: "Misi tuntas!", detail: `${ready.title} · +${coins(ready.reward)}`, action: { type: "mission", id: ready.id }, label: `Klaim bonus ${coins(ready.reward)}` };
  if (game.laps >= 25 && game.circuit === 0) return { title: "Midnight terbuka!", detail: "+0,02 koin setiap putaran. Pindah tanpa biaya.", action: { type: "circuit" }, label: "Balapan di Midnight" };
  if (!game.rewardClaimed) return { title: "Modal upgrade pertamamu", detail: `Bonus starter ${coins(STARTER_GIFT)} siap masuk saldo.`, action: { type: "gift" }, label: `Ambil ${coins(STARTER_GIFT)} gratis` };

  const upgrades = (Object.keys(UPGRADE_LABELS) as Upgrade[])
    .filter(key => game.levels[key] < 10)
    .map(key => ({ key, cost: upgradeCost(key, game.levels[key]) }))
    .sort((a, b) => a.cost - b.cost);
  const upgrade = upgrades[0];
  if (upgrade && game.balance >= upgrade.cost) return {
    title: `${UPGRADE_LABELS[upgrade.key]} Lv. ${game.levels[upgrade.key] + 1} siap dipasang`,
    detail: `${coins(upgrade.cost)} · ${upgrade.key === "battery" ? "Hasil tiap putaran naik" : "Putaran lebih cepat"}.`,
    action: { type: "workshop" }, label: "Lihat upgrade di bengkel",
  };
  if (upgrade && game.balance + Math.floor(game.pending) >= upgrade.cost) return {
    title: "Hasil balapan cukup untuk upgrade",
    detail: `Klaim dulu, lalu pasang ${UPGRADE_LABELS[upgrade.key].toLowerCase()} Lv. ${game.levels[upgrade.key] + 1}.`,
    action: { type: "claim" }, label: `Klaim ${coins(Math.floor(game.pending))}`,
  };
  const lapsMission = MISSIONS.find(item => item.id === "laps")!;
  if (!game.missionsClaimed.includes(lapsMission.id) && game.laps < lapsMission.target) return {
    title: `${lapsMission.target - game.laps} putaran lagi → bonus ${coins(lapsMission.reward)}`,
    detail: "Target pertama: selesaikan 10 putaran.", progress: { value: game.laps, target: lapsMission.target },
  };
  if (game.laps < 25) return { title: `${25 - game.laps} putaran lagi → Midnight`, detail: "Buka sirkuit dengan hasil lebih besar di 25 putaran.", progress: { value: game.laps, target: 25 } };
  if (upgrade) {
    const shortfall = roundCoins(Math.max(0, Math.ceil(upgrade.cost - game.balance) - game.pending));
    return {
      title: `Target: ${UPGRADE_LABELS[upgrade.key]} Lv. ${game.levels[upgrade.key] + 1}`,
      detail: `Kurang ${coins(shortfall)} · sekitar ${Math.ceil(shortfall / lapReward(game))} putaran lagi. Klaim koin penuh untuk belanja.`,
      progress: { value: Math.min(upgrade.cost, game.balance + Math.floor(game.pending)), target: upgrade.cost },
      action: { type: "workshop" }, label: "Cek performa upgrade",
    };
  }
  const earnMission = MISSIONS.find(item => item.id === "earn")!;
  if (!game.missionsClaimed.includes(earnMission.id)) return { title: `Target hasil balapan: ${coins(earnMission.target)}`, detail: `Bonus misi +${coins(earnMission.reward)}.`, progress: { value: Math.min(game.earned, earnMission.target), target: earnMission.target } };
  return { title: "Mobilmu sudah maksimal", detail: "Semua misi tuntas. Nikmati balapan dan kumpulkan hasil tiap putaran." };
}

export function claimProgress(game: Pick<GameState, "pending" | "levels" | "circuit">) {
  const claimable = Math.floor(game.pending);
  const fraction = roundCoins(game.pending - claimable);
  return { claimable, remainder: fraction, lapsToCoin: Math.max(1, Math.ceil(roundCoins(1 - fraction) / lapReward(game))) };
}
