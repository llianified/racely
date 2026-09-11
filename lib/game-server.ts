import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  actionReceipts,
  players,
  rewardClaims,
  withdrawals,
  type PlayerRow,
  type WithdrawalRow,
} from "@/lib/db/schema";
import { calculateRaceSettlement } from "@/lib/game-economy";
import {
  accountPattern,
  COIN_TO_IDR,
  MIN_WITHDRAW_COINS,
  MISSIONS,
  missionValue,
  roundCoins,
  STARTER_GIFT,
  upgradeCost,
  WITHDRAW_METHODS,
  type GameState,
  type Upgrade,
  type WithdrawalRecord,
  type WithdrawMethod,
  type WithdrawStatus,
} from "@/lib/game";
import type { PlayerIdentity } from "@/lib/telegram-auth";

const ALLOWED_COLORS = ["#4275ff", "#f4b65b", "#e9eef7"] as const;
const METHOD_IDS = WITHDRAW_METHODS.map((method) => method.id) as [
  WithdrawMethod,
  ...WithdrawMethod[],
];
const HISTORY_LIMIT = 8;

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
  z
    .object({
      type: z.literal("withdraw"),
      method: z.enum(METHOD_IDS),
      account: z.string().trim().regex(/^\d{8,18}$/),
      accountName: z.string().trim().min(2).max(60),
      coins: z.number().int().min(MIN_WITHDRAW_COINS).max(1_000_000),
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

function withdrawalRecord(row: WithdrawalRow): WithdrawalRecord {
  return {
    id: String(row.id),
    coins: row.coins,
    method: row.method as WithdrawMethod,
    account: row.account,
    accountName: row.accountName,
    status: row.status as WithdrawStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

function stateFromRow(
  row: PlayerRow,
  now: Date,
  history: WithdrawalRow[] = [],
): GameState {
  return {
    withdrawals: history.map(withdrawalRecord),
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
    pending: roundCoins(row.pending + settlement.income),
    earned: roundCoins(row.earned + settlement.income),
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
    throw new GameRuleError("Koin belum cukup untuk upgrade ini.");
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

    const history = await tx
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.userId, identity.userId))
      .orderBy(desc(withdrawals.createdAt))
      .limit(HISTORY_LIMIT);

    return stateFromRow(saved, now, history);
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
        const replayHistory = await tx
          .select()
          .from(withdrawals)
          .where(eq(withdrawals.userId, identity.userId))
          .orderBy(desc(withdrawals.createdAt))
          .limit(HISTORY_LIMIT);
        return stateFromRow(saved, now, replayHistory);
      }
    }

    if (action.type === "upgrade") {
      next = applyUpgrade(next, action.key);
    } else if (action.type === "claim") {
      // Only whole coins move into the withdrawable balance; the remainder keeps accruing.
      const settled = Math.floor(next.pending);
      if (settled > 0) {
        next = {
          ...next,
          balance: next.balance + settled,
          pending: roundCoins(next.pending - settled),
        };
      }
    } else if (action.type === "withdraw") {
      if (next.balance < action.coins) {
        throw new GameRuleError("Saldo koin tidak cukup untuk penarikan ini.");
      }
      if (!accountPattern(action.method).test(action.account)) {
        throw new GameRuleError("Nomor tujuan tidak valid untuk metode ini.");
      }
      await tx.insert(withdrawals).values({
        userId: identity.userId,
        requestId,
        coins: action.coins,
        amountIdr: action.coins * COIN_TO_IDR,
        method: action.method,
        account: action.account,
        accountName: action.accountName,
      });
      next = { ...next, balance: next.balance - action.coins };
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

    const history = await tx
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.userId, identity.userId))
      .orderBy(desc(withdrawals.createdAt))
      .limit(HISTORY_LIMIT);
    const response = stateFromRow(saved, now, history);
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
