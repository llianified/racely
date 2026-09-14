import { z } from "zod";
import type { EconomyConfig } from "./economy-config";
import { calculateRaceSettlement, racingDayKey, type RaceSettlementInput } from "./game-economy";

export const DAILY_MISSION_KINDS = ["laps", "earn", "boosts", "clean"] as const;
export type DailyMissionKind = (typeof DAILY_MISSION_KINDS)[number];
export const dailyMissionsSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  values: z.object({ laps: z.number().nonnegative(), earn: z.number().nonnegative(), boosts: z.number().nonnegative(), clean: z.number().nonnegative() }),
  items: z.array(z.object({ kind: z.enum(DAILY_MISSION_KINDS), target: z.number().positive(), reward: z.number().int().nonnegative(), claimed: z.boolean() })).min(1).max(3),
});
export type DailyMissions = z.infer<typeof dailyMissionsSchema>;

export function dailyMissionsFor(stored: DailyMissions | null | undefined, now: Date, e: EconomyConfig): DailyMissions {
  const day = racingDayKey(now);
  if (stored?.day === day) return { ...stored, items: stored.items.filter(item => item.kind === 'laps' || item.kind === 'earn') };
  const kinds = ['laps', 'earn'] as const;
  const targets = { laps: e.dailyMissionLapsTarget, earn: e.dailyMissionEarnTarget };
  return {
    day,
    values: { laps: 0, earn: 0, boosts: 0, clean: 0 },
    items: kinds.map((kind, index) => ({
      kind,
      target: targets[kind],
      reward: Math.floor(e.dailyMissionRewardCap / 2) + (index < e.dailyMissionRewardCap % 2 ? 1 : 0),
      claimed: false,
    })),
  };
}

export function settleDailyMissions(stored: DailyMissions | null | undefined, input: RaceSettlementInput, now: Date): DailyMissions {
  const daily = dailyMissionsFor(stored, now, input.economy);
  // No retrospective credit for accounts created before this feature. Subtract
  // yesterday using the original interval so midnight never restarts idle caps.
  if (!stored || now <= input.lastSettledAt) return daily;
  const start = new Date(`${daily.day}T00:00:00+07:00`);
  const total = calculateRaceSettlement(input, now);
  const before = start > input.lastSettledAt ? calculateRaceSettlement(input, start) : { completedLaps: 0, income: 0 };
  return { ...daily, values: { ...daily.values,
    laps: daily.values.laps + Math.max(0, total.completedLaps - before.completedLaps),
    earn: Math.round((daily.values.earn + Math.max(0, total.income - before.income)) * 100) / 100,
  } };
}

export function recordDailyBoost(daily: DailyMissions, clean: boolean): DailyMissions {
  return { ...daily, values: { ...daily.values, boosts: daily.values.boosts + 1, clean: daily.values.clean + Number(clean) } };
}

export function claimDailyMission(daily: DailyMissions, day: string, kind: DailyMissionKind) {
  if (day !== daily.day) throw new Error("Misi sudah berganti. Muat ulang hadiah hari ini.");
  const item = daily.items.find(item => item.kind === kind);
  if (!item) throw new Error("Misi tidak tersedia hari ini.");
  if (item.claimed) return { dailyMissions: daily, reward: 0 };
  if (daily.values[kind] < item.target) throw new Error("Target misi harian belum tercapai.");
  return { dailyMissions: { ...daily, items: daily.items.map(item => item.kind === kind ? { ...item, claimed: true } : item) }, reward: item.reward };
}

export const DAILY_MISSION_COPY: Record<DailyMissionKind, { title: string; unit: string }> = {
  laps: { title: "Putaran hari ini", unit: "putaran" },
  earn: { title: "Panen dari lintasan", unit: "koin balapan" },
  boosts: { title: "Gaspol rutin", unit: "kali Gaspol" },
  clean: { title: "Timing yang pas", unit: "Gaspol bersih di trek lurus" },
};

export function dailyMissionClaimable(daily?: DailyMissions) {
  return daily?.items.filter(item => !item.claimed && daily.values[item.kind] >= item.target).reduce((sum, item) => sum + item.reward, 0) ?? 0;
}
