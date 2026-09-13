import { hashSeed, racingDayKey } from "@/lib/economy-config";

export const MISSION_SCOPES = ["daily", "weekly"] as const;
export const MISSION_KINDS = ["laps", "boosts"] as const;
export const MISSION_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,39})$/;

export type MissionScope = (typeof MISSION_SCOPES)[number];
export type MissionKind = (typeof MISSION_KINDS)[number];

export type MissionDefinition = {
  id: string;
  kind: MissionKind;
  target: number;
  reward: number;
};

export type MissionCounters = {
  dayKey: string | null;
  dayLaps: number;
  dayBoosts: number;
  weekKey: string | null;
  weekLaps: number;
  weekBoosts: number;
};

export type ActiveMission = MissionDefinition & {
  scope: MissionScope;
  title: string;
  description: string;
  progress: number;
  claimed: boolean;
};

export type MissionBoard = {
  daily: ActiveMission[];
  weekly: ActiveMission[];
};

type MissionEconomy = {
  dailyMissionCount: number;
  dailyMissionPool: MissionDefinition[];
  weeklyMissionPool: MissionDefinition[];
};

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CLAIM_RETENTION_DAYS = 60;
const CLAIM_PREFIX = { daily: "dm", weekly: "wm" } as const;

function shiftedWibDate(now: Date) {
  return new Date(now.getTime() + WIB_OFFSET_MS);
}

export function racingWeekKey(now = new Date()) {
  const local = shiftedWibDate(now);
  const date = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function missionPeriodKeys(now = new Date()) {
  return { dayKey: racingDayKey(now), weekKey: racingWeekKey(now) };
}

export function millisecondsUntilMissionReset(
  scope: MissionScope,
  now = new Date(),
) {
  const local = shiftedWibDate(now);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const date = local.getUTCDate();
  const daysAhead =
    scope === "daily" ? 1 : 8 - (local.getUTCDay() || 7);
  const resetAt = Date.UTC(year, month, date + daysAhead) - WIB_OFFSET_MS;
  return Math.max(0, resetAt - now.getTime());
}

export function normalizeMissionCounters(
  counters: MissionCounters,
  dayKey: string,
  now = new Date(),
): MissionCounters {
  const weekKey = racingWeekKey(now);
  return {
    dayKey,
    dayLaps: counters.dayKey === dayKey ? counters.dayLaps : 0,
    dayBoosts: counters.dayKey === dayKey ? counters.dayBoosts : 0,
    weekKey,
    weekLaps: counters.weekKey === weekKey ? counters.weekLaps : 0,
    weekBoosts: counters.weekKey === weekKey ? counters.weekBoosts : 0,
  };
}

export function missionClaimKey(
  scope: MissionScope,
  periodKey: string,
  missionId: string,
) {
  return `${CLAIM_PREFIX[scope]}:${periodKey}:${missionId}`;
}

export function parseMissionClaimKey(key: string) {
  const match = /^(dm|wm):([^:]+):(.+)$/.exec(key);
  if (!match) return null;
  return {
    scope: match[1] === "dm" ? ("daily" as const) : ("weekly" as const),
    periodKey: match[2],
    missionId: match[3],
  };
}

function missionPeriodKey(scope: MissionScope, counters: MissionCounters) {
  return scope === "daily" ? counters.dayKey : counters.weekKey;
}

function deterministicSelection(
  pool: MissionDefinition[],
  count: number,
  seed: string,
) {
  return [...pool]
    .sort((left, right) => {
      const score =
        hashSeed(`${seed}:${left.id}`) - hashSeed(`${seed}:${right.id}`);
      return score || left.id.localeCompare(right.id);
    })
    .slice(0, Math.min(Math.max(0, count), pool.length));
}

export function activeMissionDefinitions(
  scope: MissionScope,
  economy: MissionEconomy,
  userId: string,
  counters: MissionCounters,
) {
  const periodKey = missionPeriodKey(scope, counters);
  if (!periodKey) return [];
  const pool =
    scope === "daily" ? economy.dailyMissionPool : economy.weeklyMissionPool;
  const count = scope === "daily" ? economy.dailyMissionCount : 1;
  return deterministicSelection(pool, count, `${scope}:${periodKey}:${userId}`);
}

export function missionProgress(
  mission: MissionDefinition,
  scope: MissionScope,
  counters: MissionCounters,
) {
  if (scope === "daily") {
    return mission.kind === "laps" ? counters.dayLaps : counters.dayBoosts;
  }
  return mission.kind === "laps" ? counters.weekLaps : counters.weekBoosts;
}

function missionCopy(mission: MissionDefinition) {
  if (mission.kind === "boosts") {
    return {
      title: `Gaspol ${mission.target} kali`,
      description: "Aktifkan Gaspol selama periode misi ini.",
    };
  }
  return {
    title: `Tuntaskan ${mission.target} putaran`,
    description: "Selesaikan putaran selama periode misi ini.",
  };
}

export function buildMissionBoard(
  economy: MissionEconomy,
  userId: string,
  counters: MissionCounters,
  claimedKeys: readonly string[],
): MissionBoard {
  const build = (scope: MissionScope) => {
    const periodKey = missionPeriodKey(scope, counters);
    if (!periodKey) return [];
    return activeMissionDefinitions(scope, economy, userId, counters).map(
      (mission) => {
        const copy = missionCopy(mission);
        return {
          ...mission,
          ...copy,
          scope,
          progress: Math.min(
            mission.target,
            Math.max(0, missionProgress(mission, scope, counters)),
          ),
          claimed: claimedKeys.includes(
            missionClaimKey(scope, periodKey, mission.id),
          ),
        };
      },
    );
  };
  return { daily: build("daily"), weekly: build("weekly") };
}

export function findActiveMission(
  scope: MissionScope,
  missionId: string,
  economy: MissionEconomy,
  userId: string,
  counters: MissionCounters,
) {
  return activeMissionDefinitions(scope, economy, userId, counters).find(
    (mission) => mission.id === missionId,
  );
}

function isoWeekStart(periodKey: string) {
  const match = /^(\d{4})-W(\d{2})$/.exec(periodKey);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const januaryFourthDay = januaryFourth.getUTCDay() || 7;
  return Date.UTC(year, 0, 4 - januaryFourthDay + 1 + (week - 1) * 7);
}

function claimPeriodTimestamp(key: string) {
  const daily = /^dm:(\d{4}-\d{2}-\d{2}):/.exec(key);
  if (daily) {
    const timestamp = Date.parse(`${daily[1]}T00:00:00.000Z`);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  const weekly = /^wm:(\d{4}-W\d{2}):/.exec(key);
  return weekly ? isoWeekStart(weekly[1]) : null;
}

export function pruneMissionClaims(
  keys: readonly string[],
  now = new Date(),
  retentionDays = CLAIM_RETENTION_DAYS,
) {
  const local = shiftedWibDate(now);
  const currentDay = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  const cutoff = currentDay - retentionDays * DAY_MS;
  return keys.filter((key) => {
    const timestamp = claimPeriodTimestamp(key);
    return timestamp === null || timestamp >= cutoff;
  });
}
