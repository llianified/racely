import "server-only";

import { and, desc, eq, gte, lt } from "drizzle-orm";
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
import {
  calculateRaceSettlement,
  DAILY_CLAIM_END,
  DAILY_CLAIM_PREFIX,
  DAILY_HISTORY_DAYS,
  dailyCheckIn,
  racingDayKey,
} from "@/lib/game-economy";
import { CAR_MODEL_IDS, isCarColor } from "@/lib/car-catalog";
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
  type DailyCheckIn,
  type GameState,
  type OfflineEarnings,
  type Upgrade,
  type WithdrawalRecord,
  type WithdrawMethod,
  type WithdrawStatus,
} from "@/lib/game";
import type { PlayerIdentity } from "@/lib/telegram-auth";

const carColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
const METHOD_IDS = WITHDRAW_METHODS.map((method) => method.id) as [
  WithdrawMethod,
  ...WithdrawMethod[],
];
const HISTORY_LIMIT = 8;
/**
 * Receipts only have to outlive a client retry, which happens within seconds.
 * Keep a generous window and prune probabilistically, like the Telegram update
 * table, so the row count stays bounded without a scheduled job.
 */
const RECEIPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RECEIPT_PRUNE_PROBABILITY = 0.02;

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
  z.object({ type: z.literal("daily") }).strict(),
  z
    .object({
      type: z.literal("mission"),
      id: z.enum(["laps", "upgrade", "earn"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("select-car"),
      model: z.enum(CAR_MODEL_IDS),
      color: carColorSchema,
    })
    .strict(),
  z
    .object({ type: z.literal("color"), color: carColorSchema })
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

function hasExistingProgress(row: PlayerRow, history: WithdrawalRow[]) {
  return (
    row.balance !== 10 ||
    row.pending > 0 ||
    row.earned > 0 ||
    row.laps > 0 ||
    row.engineLevel > 1 ||
    row.tiresLevel > 1 ||
    row.batteryLevel > 1 ||
    row.rewardClaimed ||
    row.missionsClaimed.length > 0 ||
    history.length > 0
  );
}

function stateFromRow(
  row: PlayerRow,
  now: Date,
  history: WithdrawalRow[] = [],
  offlineEarnings: OfflineEarnings | null = null,
  daily: DailyCheckIn = dailyCheckIn([], now),
): GameState {
  return {
    developmentPreview: false,
    // Left off the payload entirely when there is nothing to report, so the
    // client can treat its presence as "show the welcome-back dialog".
    offlineEarnings: offlineEarnings ?? undefined,
    carSelection: {
      model: row.carModel,
      returningPlayer:
        row.carModel === null && hasExistingProgress(row, history),
    },
    withdrawals: history.map(withdrawalRecord),
    daily,
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

/**
 * Riwayat check-in dibaca sebanyak DAILY_HISTORY_DAYS hari; streak yang lebih
 * panjang dari itu berhenti bertambah di tampilan, tapi hadiahnya sudah mentok
 * jauh sebelumnya jadi tidak ada koin yang hilang.
 */
type Transaction = Parameters<
  Parameters<NonNullable<typeof db>["transaction"]>[0]
>[0];

async function readDailyClaims(tx: Transaction, userId: string) {
  const rows = await tx
    .select({ rewardKey: rewardClaims.rewardKey })
    .from(rewardClaims)
    .where(
      and(
        eq(rewardClaims.userId, userId),
        gte(rewardClaims.rewardKey, DAILY_CLAIM_PREFIX),
        lt(rewardClaims.rewardKey, DAILY_CLAIM_END),
      ),
    )
    .orderBy(desc(rewardClaims.rewardKey))
    .limit(DAILY_HISTORY_DAYS);
  return rows.map((row) => row.rewardKey.slice(DAILY_CLAIM_PREFIX.length));
}

export type SettledPlayer = {
  row: PlayerRow;
  offline: OfflineEarnings | null;
};

export function settlePlayerRow(row: PlayerRow, now: Date): SettledPlayer {
  if (row.carModel === null) {
    return {
      row: { ...row, lastSettledAt: now, updatedAt: now },
      offline: null,
    };
  }

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
    row: {
      ...row,
      pending: roundCoins(row.pending + settlement.income),
      earned: roundCoins(row.earned + settlement.income),
      laps: row.laps + settlement.completedLaps,
      progress: settlement.progress,
      lastSettledAt: now,
      updatedAt: now,
    },
    offline: settlement.offline,
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

    const settled = settlePlayerRow(locked, now);
    const [saved] = await tx
      .update(players)
      .set({
        pending: settled.row.pending,
        earned: settled.row.earned,
        laps: settled.row.laps,
        progress: settled.row.progress,
        lastSettledAt: settled.row.lastSettledAt,
        updatedAt: now,
      })
      .where(eq(players.userId, locked.userId))
      .returning();

    const history = await tx
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.userId, identity.userId))
      .orderBy(desc(withdrawals.createdAt))
      .limit(HISTORY_LIMIT);
    const daily = dailyCheckIn(
      await readDailyClaims(tx, identity.userId),
      now,
    );

    return stateFromRow(saved, now, history, settled.offline, daily);
  });
}

/**
 * Runs outside the player's transaction on purpose: that transaction holds a
 * `FOR UPDATE` lock on their row, and a sweep across every player's old receipts
 * has no business extending it. A failed prune must never fail the action.
 */
async function pruneActionReceipts(now: Date) {
  await getDatabase()
    .delete(actionReceipts)
    .where(
      lt(
        actionReceipts.createdAt,
        new Date(now.getTime() - RECEIPT_RETENTION_MS),
      ),
    )
    .catch(() => undefined);
}

export async function performGameAction(
  identity: PlayerIdentity,
  requestId: string,
  action: GameCommand,
): Promise<GameState> {
  const now = new Date();

  const result = await getDatabase().transaction(async (tx) => {
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

    const settled = settlePlayerRow(locked, now);
    let next = settled.row;
    let dailyClaims = await readDailyClaims(tx, identity.userId);

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
        return stateFromRow(
          saved,
          now,
          replayHistory,
          settled.offline,
          dailyCheckIn(dailyClaims, now),
        );
      }
    }

    if (
      next.carModel === null &&
      action.type !== "sync" &&
      action.type !== "select-car"
    ) {
      throw new GameRuleError("Pilih mobilmu sebelum mulai bermain.");
    }

    if (action.type === "select-car") {
      if (next.carModel !== null) {
        throw new GameRuleError(
          "Model sudah dikonfirmasi dan tidak dapat diganti.",
        );
      }
      if (!isCarColor(action.model, action.color)) {
        throw new GameRuleError("Model atau warna mobil tidak valid.", 400);
      }
      next = { ...next, carModel: action.model, color: action.color };
    } else if (action.type === "upgrade") {
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
    } else if (action.type === "daily") {
      const status = dailyCheckIn(dailyClaims, now);
      if (!status.claimedToday) {
        const today = racingDayKey(now);
        // The unique (user_id, reward_key) index is the whole guard: a double
        // tap on the same racing day inserts nothing and pays nothing.
        const inserted = await tx
          .insert(rewardClaims)
          .values({
            userId: identity.userId,
            rewardKey: `${DAILY_CLAIM_PREFIX}${today}`,
            amount: status.reward,
          })
          .onConflictDoNothing()
          .returning({ id: rewardClaims.id });
        if (inserted.length > 0) {
          next = { ...next, balance: next.balance + status.reward };
          dailyClaims = [today, ...dailyClaims];
        }
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
      if (!next.carModel || !isCarColor(next.carModel, action.color)) {
        throw new GameRuleError("Warna ini tidak tersedia untuk mobilmu.", 400);
      }
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
        carModel: next.carModel,
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
    const response = stateFromRow(
      saved,
      now,
      history,
      settled.offline,
      dailyCheckIn(dailyClaims, now),
    );
    if (action.type !== "sync") {
      // Deliberately no response snapshot: (userId, requestId) is the whole
      // idempotency key, and a stored GameState would copy the player's
      // withdrawal account numbers into this table on every later action.
      await tx.insert(actionReceipts).values({
        userId: identity.userId,
        requestId,
        actionType: action.type,
      });
    }

    return response;
  });

  if (action.type !== "sync" && Math.random() < RECEIPT_PRUNE_PROBABILITY) {
    await pruneActionReceipts(now);
  }

  return result;
}
