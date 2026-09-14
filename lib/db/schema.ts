import { desc, sql } from "drizzle-orm";
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
import type { BodyParts } from "@/lib/car-parts";
import type { CarSetup } from "@/lib/car-setup";
import type { DailyMissions } from "@/lib/daily-missions";
import type { PaintId } from "@/lib/car-paints";

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
  dailyMissions: jsonb("daily_missions").$type<DailyMissions>(),
  ownedPaints: jsonb("owned_paints").$type<PaintId[]>().notNull().default([]),
  bodyParts: jsonb("body_parts").$type<BodyParts>().notNull().default({ owned: [], equipped: {} }),
  setup: jsonb("setup").$type<CarSetup>().notNull().default({ gear: "4:1", roller: "standard" }),
  carModel: text("car_model").$type<CarModelId>(),
  color: text("color").notNull().default("#4275ff"),
  circuit: integer("circuit").notNull().default(0),
  lastSettledAt: timestamp("last_settled_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  idleNotifiedAt: timestamp("idle_notified_at", { withTimezone: true }),
  referredBy: text("referred_by"),
  referralPaidAt: timestamp("referral_paid_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  index("racely_players_leaderboard_idx")
    .on(desc(table.laps), table.createdAt, table.userId)
    .where(sql`${table.laps} > 0 AND ${table.userId} ~ '^[0-9]+$'`),
]);

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
    /**
     * Diisi saat koin sebuah penarikan 'rejected' dikembalikan ke saldo.
     * `IS NULL` adalah penjaga sekali-jalan-nya; lihat 0008 dan
     * `refundRejectedWithdrawals` di lib/game-server.ts.
     */
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
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

/**
 * Satu baris (`id = 'default'`) berisi seluruh `EconomyConfig` sebagai jsonb.
 * Tabel kosong berarti "pakai DEFAULT_ECONOMY" -- lihat migrasi 0009 dan
 * `lib/economy-store.ts`.
 */
export const economyConfig = pgTable("racely_economy_config", {
  id: text("id").primaryKey(),
  config: jsonb("config").notNull().$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: text("updated_by"),
});

/** Jejak setiap perubahan admin yang menyentuh uang. Hanya ditulis, tidak diubah. */
export const adminAudit = pgTable(
  "racely_admin_audit",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("racely_admin_audit_recent_idx").on(desc(table.createdAt))],
);

export type EconomyConfigRow = typeof economyConfig.$inferSelect;
export type AdminAuditRow = typeof adminAudit.$inferSelect;
