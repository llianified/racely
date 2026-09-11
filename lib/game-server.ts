import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  actionReceipts,
  players,
  rewardClaims,
  type PlayerRow,
} from "@/lib/db/schema";
import { calculateRaceSettlement } from "@/lib/game-economy";
import {
  MISSIONS,
  missionValue,
  upgradeCost,
  type GameState,
  type Upgrade,
} from "@/lib/game";
import type { PlayerIdentity } from "@/lib/telegram-auth";

const STARTER_GIFT = 5000;
const ALLOWED_COLORS = ["#4275ff", "#f4b65b", "#e9eef7"] as const;

const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sync") }).strict(),
  z
    .object({
      type: z.literal("upgrade"),
      key: z.enum(["engine", "tires", "battery"]),
    })
    .strict(),
  z.object({ type: z.literal("claim") }).strict(),
  z.object({ type: z.literal("boost") }).strict(),
  z.object({ type: z.literal("gift") }).strict(),
  z
    .object({
      type: z.literal("mission"),
      id: z.enum(["laps", "upgrade", "earn"]),
    })
    .strict(),
  z
    .object({ type: z.literal("color"), color: z.enum(ALLOWED_COLORS) })
    .strict(),
  z
    .object({
      type: z.literal("circuit"),
      circuit: z.union([z.literal(0), z.literal(1)]),
    })
    .strict(),
]);

export const gameActionSchema = z
  .object({
    requestId: z.string().uuid(),
    action: commandSchema,
  })
  .strict();

export type GameCommand = z.infer<typeof commandSchema>;

export class GameRuleError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
    this.name = "GameRuleError";
  }
}

function getDatabase() {
  if (!db) throw new Error("DATABASE_URL is not configured");
  return db;
}

function stateFromRow(row: PlayerRow, now: Date): GameState {
  return {
    balance: row.balance,
    pending: row.pending,
    earned: row.earned,
    laps: row.laps,
    progress: row.progress,
    levels: {
      engine: row.engineLevel,
      tires: row.tiresLevel,
      battery: row.batteryLevel,
    },
    boostLeft: Math.max(
      0,
      ((row.boostEndsAt?.getTime() ?? 0) - now.getTime()) / 1000,
    ),
    cooldown: Math.max(
      0,
      ((row.cooldownEndsAt?.getTime() ?? 0) - now.getTime()) / 1000,
    ),
    rewardClaimed: row.rewardClaimed,
    missionsClaimed: row.missionsClaimed,
    color: row.color,
    circuit: row.circuit,
    player: {
      name: row.displayName,
      username: row.telegramUsername,
      photoUrl: row.photoUrl,
    },
  };
}

export function settlePlayerRow(row: PlayerRow, now: Date): PlayerRow {
  const settlement = calculateRaceSettlement(
    {
      progress: row.progress,
      levels: {
        engine: row.engineLevel,
        tires: row.tiresLevel,
        battery: row.batteryLevel,
      },
      circuit: row.circuit,
      lastSettledAt: row.lastSettledAt,
      boostEndsAt: row.boostEndsAt,
    },
    now,
  );

  return {
    ...row,
    pending: row.pending + settlement.income,
    earned: row.earned + settlement.income,
    laps: row.laps + settlement.completedLaps,
    progress: settlement.progress,
    lastSettledAt: now,
    updatedAt: now,
  };
}

function playerValues(identity: PlayerIdentity) {
  return {
    userId: identity.userId,
    telegramUsername: identity.username,
    displayName: identity.displayName,
    photoUrl: identity.photoUrl,
  };
}

function levelFor(row: PlayerRow, key: Upgrade) {
  if (key === "engine") return row.engineLevel;
  if (key === "tires") return row.tiresLevel;
  return row.batteryLevel;
}

function applyUpgrade(row: PlayerRow, key: Upgrade) {
  const level = levelFor(row, key);
  if (level >= 10) {
    throw new GameRuleError("Upgrade ini sudah mencapai level maksimal.");
  }

  const cost = upgradeCost(key, level);
  if (row.balance < cost) {
    throw new GameRuleError("Koin virtual belum cukup untuk upgrade ini.");
  }

  return {
    ...row,
    balance: row.balance - cost,
    engineLevel: key === "engine" ? level + 1 : row.engineLevel,
    tiresLevel: key === "tires" ? level + 1 : row.tiresLevel,
    batteryLevel: key === "battery" ? level + 1 : row.batteryLevel,
  };
}

export async function getGameState(
  identity: PlayerIdentity,
): Promise<GameState> {
  const now = new Date();

  return getDatabase().transaction(async (tx) => {
    await tx
      .insert(players)
      .values(playerValues(identity))
      .onConflictDoUpdate({
        target: players.userId,
        set: {
          telegramUsername: identity.username,
          displayName: identity.displayName,
          photoUrl: identity.photoUrl,
          updatedAt: now,
        },
      });

    const [locked] = await tx
      .select()
      .from(players)
      .where(eq(players.userId, identity.userId))
      .for("update");

    const [saved] = await tx
      .update(players)
      .set({ lastSettledAt: now, updatedAt: now })
      .where(eq(players.userId, locked.userId))
      .returning();

    return stateFromRow(saved, now);
  });
}

export async function performGameAction(
  identity: PlayerIdentity,
  requestId: string,
  action: GameCommand,
): Promise<GameState> {
  const now = new Date();

  return getDatabase().transaction(async (tx) => {
    await tx
      .insert(players)
      .values(playerValues(identity))
      .onConflictDoUpdate({
        target: players.userId,
        set: {
          telegramUsername: identity.username,
          displayName: identity.displayName,
          photoUrl: identity.photoUrl,
          updatedAt: now,
        },
      });

    const [locked] = await tx
      .select()
      .from(players)
      .where(eq(players.userId, identity.userId))
      .for("update");

    let next = settlePlayerRow(locked, now);

    if (action.type !== "sync") {
      const [receipt] = await tx
        .select({ requestId: actionReceipts.requestId })
        .from(actionReceipts)
        .where(
          and(
            eq(actionReceipts.userId, identity.userId),
            eq(actionReceipts.requestId, requestId),
          ),
        )
        .limit(1);

      if (receipt) {
        const [saved] = await tx
          .update(players)
          .set({
            pending: next.pending,
            earned: next.earned,
            laps: next.laps,
            progress: next.progress,
            lastSettledAt: next.lastSettledAt,
            updatedAt: now,
          })
          .where(eq(players.userId, identity.userId))
          .returning();
        return stateFromRow(saved, now);
      }
    }

    if (action.type === "upgrade") {
      next = applyUpgrade(next, action.key);
    } else if (action.type === "claim") {
      if (next.pending > 0) {
        next = { ...next, balance: next.balance + next.pending, pending: 0 };
      }
    } else if (action.type === "boost") {
      if ((next.cooldownEndsAt?.getTime() ?? 0) > now.getTime()) {
        throw new GameRuleError("Boost masih mengisi ulang.");
      }
      next = {
        ...next,
        boostEndsAt: new Date(now.getTime() + 10_000),
        cooldownEndsAt: new Date(now.getTime() + 35_000),
      };
    } else if (action.type === "gift") {
      if (!next.rewardClaimed) {
        const inserted = await tx
          .insert(rewardClaims)
          .values({
            userId: identity.userId,
            rewardKey: "starter-gift",
            amount: STARTER_GIFT,
          })
          .onConflictDoNothing()
          .returning({ id: rewardClaims.id });
        next = {
          ...next,
          rewardClaimed: true,
          balance: next.balance + (inserted.length > 0 ? STARTER_GIFT : 0),
        };
      }
    } else if (action.type === "mission") {
      const mission = MISSIONS.find((item) => item.id === action.id);
      const alreadyClaimed = next.missionsClaimed.includes(action.id);
      if (!alreadyClaimed) {
        if (
          !mission ||
          missionValue(stateFromRow(next, now), mission.id) < mission.target
        ) {
          throw new GameRuleError("Target misi belum tercapai.");
        }
        const inserted = await tx
          .insert(rewardClaims)
          .values({
            userId: identity.userId,
            rewardKey: `mission:${mission.id}`,
            amount: mission.reward,
          })
          .onConflictDoNothing()
          .returning({ id: rewardClaims.id });
        next = {
          ...next,
          balance: next.balance + (inserted.length > 0 ? mission.reward : 0),
          missionsClaimed: [...next.missionsClaimed, mission.id],
        };
      }
    } else if (action.type === "color") {
      next = { ...next, color: action.color };
    } else if (action.type === "circuit") {
      if (action.circuit === 1 && next.laps < 25) {
        throw new GameRuleError(
          "Selesaikan 25 putaran untuk membuka sirkuit ini.",
        );
      }
      next = { ...next, circuit: action.circuit };
    }

    const [saved] = await tx
      .update(players)
      .set({
        balance: next.balance,
        pending: next.pending,
        earned: next.earned,
        laps: next.laps,
        progress: next.progress,
        engineLevel: next.engineLevel,
        tiresLevel: next.tiresLevel,
        batteryLevel: next.batteryLevel,
        boostEndsAt: next.boostEndsAt,
        cooldownEndsAt: next.cooldownEndsAt,
        rewardClaimed: next.rewardClaimed,
        missionsClaimed: next.missionsClaimed,
        color: next.color,
        circuit: next.circuit,
        lastSettledAt: next.lastSettledAt,
        version: next.version + (action.type === "sync" ? 0 : 1),
        updatedAt: now,
      })
      .where(eq(players.userId, identity.userId))
      .returning();

    const response = stateFromRow(saved, now);
    if (action.type !== "sync") {
      await tx.insert(actionReceipts).values({
        userId: identity.userId,
        requestId,
        actionType: action.type,
        response,
      });
    }

    return response;
  });
}
