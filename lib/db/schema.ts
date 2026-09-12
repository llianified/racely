import { desc } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { CarModelId } from "@/lib/car-catalog";

export const players = pgTable("racely_players", {
  userId: text("user_id").primaryKey(),
  telegramUsername: text("telegram_username"),
  displayName: text("display_name").notNull(),
  photoUrl: text("photo_url"),
  balance: bigint("balance", { mode: "number" }).notNull().default(10),
  pending: doublePrecision("pending").notNull().default(0),
  earned: doublePrecision("earned").notNull().default(0),
  laps: integer("laps").notNull().default(0),
  progress: doublePrecision("progress").notNull().default(0),
  engineLevel: integer("engine_level").notNull().default(1),
  tiresLevel: integer("tires_level").notNull().default(1),
  batteryLevel: integer("battery_level").notNull().default(1),
  boostEndsAt: timestamp("boost_ends_at", { withTimezone: true }),
  cooldownEndsAt: timestamp("cooldown_ends_at", { withTimezone: true }),
  rewardClaimed: boolean("reward_claimed").notNull().default(false),
  missionsClaimed: jsonb("missions_claimed")
    .$type<string[]>()
    .notNull()
    .default([]),
  carModel: text("car_model").$type<CarModelId>(),
  color: text("color").notNull().default("#4275ff"),
  circuit: integer("circuit").notNull().default(0),
  lastSettledAt: timestamp("last_settled_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  idleNotifiedAt: timestamp("idle_notified_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Pemain yang sudah membuka percakapan dengan bot. Tanpa foreign key ke
 * players: /start biasanya terjadi sebelum baris pemain ada.
 */
export const botChats = pgTable("racely_bot_chats", {
  userId: text("user_id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const actionReceipts = pgTable(
  "racely_action_receipts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => players.userId, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    actionType: text("action_type").notNull(),
    /**
     * Legacy column, kept nullable so a rollback to older code still inserts.
     * Nothing writes or reads it now: replay recomputes the state instead, and
     * the snapshot used to duplicate withdrawal account numbers into this table.
     */
    response: jsonb("response"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // (user_id, request_id) is the idempotency key; its primary-key index already
  // covers every user_id lookup, so no separate user index is needed.
  (table) => [
    primaryKey({ columns: [table.userId, table.requestId] }),
    index("racely_action_receipts_created_idx").on(table.createdAt),
  ],
);

export const rewardClaims = pgTable(
  "racely_reward_claims",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => players.userId, { onDelete: "cascade" }),
    rewardKey: text("reward_key").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // The unique (user_id, reward_key) index also serves user_id lookups.
  (table) => [
    uniqueIndex("racely_reward_claims_key_unique").on(
      table.userId,
      table.rewardKey,
    ),
  ],
);

export const withdrawals = pgTable(
  "racely_withdrawals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => players.userId, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    coins: bigint("coins", { mode: "number" }).notNull(),
    amountIdr: bigint("amount_idr", { mode: "number" }).notNull(),
    method: text("method").notNull(),
    account: text("account").notNull(),
    accountName: text("account_name").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    // Matches the history query: filter on user_id, newest first.
    index("racely_withdrawals_user_recent_idx").on(
      table.userId,
      desc(table.createdAt),
    ),
    uniqueIndex("racely_withdrawals_request_unique").on(
      table.userId,
      table.requestId,
    ),
  ],
);

export const telegramUpdates = pgTable(
  "racely_telegram_updates",
  {
    updateId: bigint("update_id", { mode: "number" }).primaryKey(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("racely_telegram_updates_received_idx").on(table.receivedAt),
  ],
);

export type PlayerRow = typeof players.$inferSelect;
export type WithdrawalRow = typeof withdrawals.$inferSelect;
