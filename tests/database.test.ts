import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integration coverage against a real Postgres. It auto-skips when DATABASE_URL is
 * absent (v0 sandbox, CI without a database) so `pnpm test` stays green everywhere.
 * Run `pnpm db:migrate` first: these tests assume migrations 0001 and 0002 are applied.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDatabase = hasDatabase ? describe : describe.skip;

// Skipping is the right default locally, but in CI it would turn the coverage
// that matters most -- balances, withdrawals, idempotency, retention -- into a
// silent no-op while the run still reports green. The workflow provisions a
// Postgres service, so a missing DATABASE_URL there is a broken workflow.
describe("Database coverage", () => {
  it("is not silently skipped in CI", () => {
    if (process.env.CI) expect(hasDatabase).toBe(true);
  });
});

const identity = {
  userId: `test:${randomUUID()}`,
  displayName: "Integration Racer",
  username: "integration_racer",
  photoUrl: null,
};

describeDatabase("Neon Postgres persistence", () => {
  let db: typeof import("@/lib/db")["db"];
  let schema: typeof import("@/lib/db/schema");
  let gameServer: typeof import("@/lib/game-server");
  let updates: typeof import("@/lib/telegram-updates");
  let drizzle: typeof import("drizzle-orm");
  const claimedUpdateIds: number[] = [];
  const botChatUserIds: string[] = [];

  beforeAll(async () => {
    [db, schema, gameServer, updates, drizzle] = await Promise.all([
      import("@/lib/db").then((mod) => mod.db),
      import("@/lib/db/schema"),
      import("@/lib/game-server"),
      import("@/lib/telegram-updates"),
      import("drizzle-orm"),
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    // players cascades to receipts, reward claims and withdrawals.
    await db
      .delete(schema.players)
      .where(drizzle.eq(schema.players.userId, identity.userId));
    for (const userId of botChatUserIds) {
      await db
        .delete(schema.players)
        .where(drizzle.eq(schema.players.userId, userId));
      await db
        .delete(schema.botChats)
        .where(drizzle.eq(schema.botChats.userId, userId));
    }
    for (const updateId of claimedUpdateIds) {
      await updates.releaseTelegramUpdate(updateId);
    }
    const { pool } = await import("@/lib/db");
    await pool?.end();
  });

  it("exposes the expected tables, car_model column and CHECK constraint", async () => {
    const tables = await db!.execute<{ table_name: string }>(drizzle.sql`
      select table_name from information_schema.tables
      where table_schema = current_schema()
        and table_name in (
          'racely_players',
          'racely_withdrawals',
          'racely_telegram_updates',
          'racely_action_receipts',
          'racely_reward_claims',
          'racely_bot_chats'
        )
    `);
    expect(tables.rows.map((row) => row.table_name).sort()).toEqual([
      "racely_action_receipts",
      "racely_bot_chats",
      "racely_players",
      "racely_reward_claims",
      "racely_telegram_updates",
      "racely_withdrawals",
    ]);

    const column = await db!.execute<{ is_nullable: string }>(drizzle.sql`
      select is_nullable from information_schema.columns
      where table_schema = current_schema()
        and table_name = 'racely_players'
        and column_name = 'car_model'
    `);
    expect(column.rows[0]?.is_nullable).toBe("YES");

    const constraint = await db!.execute<{ conname: string }>(drizzle.sql`
      select conname from pg_constraint
      where conname = 'racely_players_car_model_check'
    `);
    expect(constraint.rows).toHaveLength(1);
  });

  it("persists onboarding and keeps the chosen car across requests", async () => {
    const fresh = await gameServer.getGameState(identity);
    expect(fresh.carSelection?.model).toBeNull();
    expect(fresh.developmentPreview).toBe(false);

    const selected = await gameServer.performGameAction(
      identity,
      randomUUID(),
      { type: "select-car", model: "luna-gt", color: "#b9a1ed" },
    );
    expect(selected.carSelection?.model).toBe("luna-gt");

    const reloaded = await gameServer.getGameState(identity);
    expect(reloaded.carSelection?.model).toBe("luna-gt");
    expect(reloaded.color).toBe("#b9a1ed");
    expect(reloaded.player.name).toBe(identity.displayName);
  });

  it("rejects a car model outside the catalog at the database level", async () => {
    await expect(
      db!.execute(drizzle.sql`
        update racely_players set car_model = 'not-a-car'
        where user_id = ${identity.userId}
      `),
    ).rejects.toThrow();
  });

  it("stores a withdrawal as pending and debits the balance", async () => {
    await db!
      .update(schema.players)
      .set({ balance: 500 })
      .where(drizzle.eq(schema.players.userId, identity.userId));

    const result = await gameServer.performGameAction(identity, randomUUID(), {
      type: "withdraw",
      method: "dana",
      account: "081234567890",
      accountName: "Integration Racer",
      coins: 150,
    });

    expect(result.balance).toBe(350);
    expect(result.withdrawals[0]).toMatchObject({
      status: "pending",
      coins: 150,
      method: "dana",
    });

    const [row] = await db!
      .select()
      .from(schema.withdrawals)
      .where(drizzle.eq(schema.withdrawals.userId, identity.userId));
    expect(row.status).toBe("pending");
    expect(row.processedAt).toBeNull();
    expect(row.amountIdr).toBe(150 * 100);
  });

  it("keeps withdrawal account data out of the action receipt table", async () => {
    await db!
      .update(schema.players)
      .set({ balance: 800 })
      .where(drizzle.eq(schema.players.userId, identity.userId));
    await gameServer.performGameAction(identity, randomUUID(), {
      type: "withdraw",
      method: "bca",
      account: "1234509876",
      accountName: "Integration Racer",
      coins: 200,
    });
    // Any later action used to re-copy the withdrawal history -- account number
    // and holder name included -- into a table nothing ever reads back.
    const after = await gameServer.performGameAction(identity, randomUUID(), {
      type: "color",
      color: "#e9eef7",
    });
    expect(after.withdrawals[0]).toMatchObject({ account: "1234509876" });

    const receipts = await db!
      .select()
      .from(schema.actionReceipts)
      .where(drizzle.eq(schema.actionReceipts.userId, identity.userId));
    expect(receipts.length).toBeGreaterThan(0);
    expect(receipts.every((row) => row.response === null)).toBe(true);
    expect(JSON.stringify(receipts)).not.toContain("1234509876");
  });

  it("replays a repeated requestId without granting the reward twice", async () => {
    const requestId = randomUUID();
    const first = await gameServer.performGameAction(identity, requestId, {
      type: "gift",
    });
    const replay = await gameServer.performGameAction(identity, requestId, {
      type: "gift",
    });
    expect(replay.rewardClaimed).toBe(true);
    expect(replay.balance).toBe(first.balance);
  });

  it("prunes action receipts past the retention window", async () => {
    const stale = randomUUID();
    await db!.execute(drizzle.sql`
      insert into racely_action_receipts (user_id, request_id, action_type, created_at)
      values (${identity.userId}, ${stale}, 'boost', now() - interval '30 days')
    `);

    // Force the probabilistic prune instead of waiting for a 2% roll.
    const random = Math.random;
    Math.random = () => 0;
    try {
      // Rose is in the Luna GT palette this identity confirmed above.
      await gameServer.performGameAction(identity, randomUUID(), {
        type: "color",
        color: "#e6a4ba",
      });
    } finally {
      Math.random = random;
    }

    const [survivor] = await db!
      .select()
      .from(schema.actionReceipts)
      .where(drizzle.eq(schema.actionReceipts.requestId, stale));
    expect(survivor).toBeUndefined();
  });

  it("claims a Telegram update exactly once, even across processes", async () => {
    const updateId = Date.now();
    claimedUpdateIds.push(updateId);

    expect(await updates.claimTelegramUpdate(updateId)).toBe(true);

    // A different process would not have the in-memory guard, so clear it and
    // prove the Postgres row is what makes the second claim fail.
    updates.resetTelegramUpdateMemory();
    expect(await updates.claimTelegramUpdate(updateId)).toBe(false);

    await updates.releaseTelegramUpdate(updateId);
    expect(await updates.claimTelegramUpdate(updateId)).toBe(true);
  });

  /**
   * Sapuan pemberitahuan idle: bagian yang tidak bisa dicakup unit test adalah
   * query-nya sendiri -- join ke racely_bot_chats, predikat "satu pesan per
   * periode menganggur", dan penandaannya. Pengiriman ke Telegram sengaja
   * dibiarkan gagal (tanpa TELEGRAM_BOT_TOKEN) supaya tidak ada panggilan
   * jaringan; yang diuji di sini adalah pemilihan baris dan efeknya.
   */
  it("memilih dan menandai pemain yang jendela offline-nya hampir penuh", async () => {
    const notifier = await import("@/lib/idle-notifier");
    const { IDLE_NOTIFY_AFTER_SECONDS } = await import("@/lib/idle-notify");
    const chats = await import("@/lib/bot-chats");
    process.env.PUBLIC_APP_URL ??= "https://racely.fun";

    const now = new Date();
    const idleSince = new Date(
      now.getTime() - (IDLE_NOTIFY_AFTER_SECONDS + 60) * 1000,
    );
    const chatId = 900000000 + (Date.now() % 10000);
    const userId = String(chatId);
    botChatUserIds.push(userId);

    await db!
      .insert(schema.players)
      .values({
        userId,
        displayName: "Idle Racer",
        carModel: "luna-gt",
        lastSettledAt: idleSince,
      })
      .onConflictDoNothing();

    const eligible = async () => {
      const rows = await db!
        .select({ notified: schema.players.idleNotifiedAt })
        .from(schema.players)
        .where(drizzle.eq(schema.players.userId, userId));
      return rows[0]?.notified ?? null;
    };

    // Belum pernah menyapa bot -> Telegram melarang kita menghubunginya.
    await notifier.runIdleNotifierPass(now);
    expect(await eligible()).toBeNull();

    await chats.recordBotChat(chatId);
    const firstPass = await notifier.runIdleNotifierPass(now);
    expect(firstPass.sent + firstPass.skipped).toBeGreaterThan(0);
    const markedAt = await eligible();
    expect(markedAt).not.toBeNull();

    // Sapuan kedua tanpa pemain kembali tidak boleh mengirim ulang.
    await notifier.runIdleNotifierPass(now);
    expect((await eligible())?.getTime()).toBe(markedAt?.getTime());

    // Pemain kembali: last_settled_at melompat ke depan, melewati tanda
    // notifikasi. Baru kembali berarti belum menganggur -- tidak boleh dikirimi
    // apa pun, dan tandanya tidak boleh bergerak.
    const returnedAt = new Date(now.getTime() + 60 * 1000);
    await db!
      .update(schema.players)
      .set({ lastSettledAt: returnedAt })
      .where(drizzle.eq(schema.players.userId, userId));
    await notifier.runIdleNotifierPass(returnedAt);
    expect((await eligible())?.getTime()).toBe(markedAt?.getTime());

    // Menganggur lagi setelah kembali -> layak dinotifikasi sekali lagi.
    const laterNow = new Date(
      returnedAt.getTime() + (IDLE_NOTIFY_AFTER_SECONDS + 60) * 1000,
    );
    await notifier.runIdleNotifierPass(laterNow);
    expect((await eligible())?.getTime()).toBe(laterNow.getTime());
  });
});

describe.skipIf(hasDatabase)("Neon Postgres persistence", () => {
  it("is skipped without DATABASE_URL", () => {
    expect(hasDatabase).toBe(false);
  });
});
