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
  startParam: null,
};

describeDatabase("Neon Postgres persistence", () => {
  let db: typeof import("@/lib/db")["db"];
  let schema: typeof import("@/lib/db/schema");
  let gameServer: typeof import("@/lib/game-server");
  let updates: typeof import("@/lib/telegram-updates");
  let drizzle: typeof import("drizzle-orm");
  const claimedUpdateIds: number[] = [];
  const extraUserIds: string[] = [];

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
    for (const userId of extraUserIds) {
      await db
        .delete(schema.players)
        .where(drizzle.eq(schema.players.userId, userId));
      await db
        .delete(schema.botChats)
        .where(drizzle.eq(schema.botChats.userId, userId));
    }
    // Config ekonomi bersifat global: satu baris yang tertinggal akan mengubah
    // permainan untuk semua orang, bukan hanya test berikutnya.
    await db.delete(schema.economyConfig);
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

  it("ranks settled laps with ties, a private self rank beyond Top 50, and no preview racers", async () => {
    const { pool } = await import("@/lib/db");
    const { getLeaderboard } = await import("@/lib/leaderboard-server");
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      // A transaction-local shadow table keeps fixture scores out of the real
      // leaderboard, even when this suite runs alongside a development server.
      await client.query(`CREATE TEMPORARY TABLE racely_players (
        user_id text PRIMARY KEY, display_name text NOT NULL,
        laps integer NOT NULL, created_at timestamptz NOT NULL
      ) ON COMMIT DROP`);
      expect(await getLeaderboard("999", client)).toMatchObject({ entries: [], currentPlayer: null, totalPlayers: 0, nextRival: null });
      await client.query(`INSERT INTO racely_players VALUES
        ('10', 'First', 1000, '2026-01-01'),
        ('20', 'Tied', 1000, '2026-01-02'),
        ('30', 'Chaser', 900, '2026-01-03'),
        ('40', 'No laps', 0, '2026-01-01'),
        ('preview:fake', 'Preview', 9999, '2026-01-01'),
        ('test:fake', 'Test', 9999, '2026-01-01')`);
      const tied = await getLeaderboard("20", client);
      expect(tied.entries.map(({ rank, name, isCurrentPlayer }) => ({ rank, name, isCurrentPlayer }))).toEqual([
        { rank: 1, name: "First", isCurrentPlayer: false },
        { rank: 1, name: "Tied", isCurrentPlayer: true },
        { rank: 3, name: "Chaser", isCurrentPlayer: false },
      ]);
      expect(tied.currentPlayer?.rank).toBe(1);
      expect(tied.nextRival).toBeNull();
      expect(tied.totalPlayers).toBe(3);
      const unranked = await getLeaderboard("40", client);
      expect(unranked.currentPlayer).toBeNull();
      expect(unranked.nextRival).toBeNull();
      expect((await getLeaderboard("preview:fake", client)).currentPlayer).toBeNull();
      expect((await getLeaderboard("30", client)).nextRival).toEqual({ name: "First", laps: 1000 });

      await client.query(`INSERT INTO racely_players
        SELECT (100 + n)::text, 'Racer ' || n, 800 - n, '2026-02-01'::timestamptz
        FROM generate_series(1, 60) n`);
      const outside = await getLeaderboard("160", client);
      expect(outside.entries).toHaveLength(50);
      expect(outside.entries.some((entry) => entry.isCurrentPlayer)).toBe(false);
      expect(outside.currentPlayer).toEqual({ rank: 63, name: "Racer 60", laps: 740, isCurrentPlayer: true });
      expect(outside.nextRival).toEqual({ name: "Racer 59", laps: 741 });
      expect(outside.totalPlayers).toBe(63);
      expect(JSON.stringify(outside)).not.toMatch(/user_id|userId|created_at|balance|username|photo/);
      expect((await getLeaderboard("'; DROP TABLE racely_players; --", client)).currentPlayer).toBeNull();
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
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

  it("commits the actions 0001 could not record: daily check-in and aero kit", async () => {
    // The CHECK on action_type shipped in 0001 with nine values and never grew.
    // Every one of these four aborted its own transaction in production -- the
    // reward credit, the purchase and the race settlement rolled back together
    // -- until migration 0007 widened the list.
    await db!
      .update(schema.players)
      .set({ balance: 500 })
      .where(drizzle.eq(schema.players.userId, identity.userId));

    const before = await gameServer.performGameAction(identity, randomUUID(), {
      type: "sync",
    });
    const claimed = await gameServer.performGameAction(identity, randomUUID(), {
      type: "daily",
    });
    expect(claimed.daily.claimedToday).toBe(true);
    expect(claimed.balance).toBeGreaterThan(before.balance);

    const bought = await gameServer.performGameAction(identity, randomUUID(), {
      type: "buy-part",
      partId: "vented-hood",
    });
    expect(bought.bodyParts?.owned).toContain("vented-hood");
    expect(bought.balance).toBe(claimed.balance - 8);

    const fitted = await gameServer.performGameAction(identity, randomUUID(), {
      type: "equip-part",
      partId: "vented-hood",
    });
    expect(fitted.bodyParts?.equipped.hood).toBe("vented-hood");

    const bare = await gameServer.performGameAction(identity, randomUUID(), {
      type: "unequip-part",
      slot: "hood",
    });
    expect(bare.bodyParts?.equipped.hood).toBeUndefined();
    // Unequipping returns the part to the collection, it never refunds or deletes.
    expect(bare.bodyParts?.owned).toContain("vented-hood");

    const recorded = await db!
      .select({ actionType: schema.actionReceipts.actionType })
      .from(schema.actionReceipts)
      .where(drizzle.eq(schema.actionReceipts.userId, identity.userId));
    const types = new Set(recorded.map((row) => row.actionType));
    for (const type of ["daily", "buy-part", "equip-part", "unequip-part"]) {
      expect(types.has(type)).toBe(true);
    }
  });

  it("refunds a rejected withdrawal exactly once", async () => {
    await db!
      .update(schema.players)
      .set({ balance: 500 })
      .where(drizzle.eq(schema.players.userId, identity.userId));

    await gameServer.performGameAction(identity, randomUUID(), {
      type: "withdraw",
      method: "dana",
      account: "081234567890",
      accountName: "Integration Racer",
      coins: 120,
    });
    expect((await gameServer.getGameState(identity)).balance).toBe(380);

    // An operator rejecting the request is the only way this status moves.
    await db!
      .update(schema.withdrawals)
      .set({ status: "rejected" })
      .where(
        drizzle.and(
          drizzle.eq(schema.withdrawals.userId, identity.userId),
          drizzle.eq(schema.withdrawals.coins, 120),
        ),
      );

    const refunded = await gameServer.getGameState(identity);
    expect(refunded.balance).toBe(500);
    expect(refunded.withdrawals[0]).toMatchObject({
      status: "rejected",
      coins: 120,
    });

    // Without the refunded_at guard every later sync would pay it again.
    expect((await gameServer.getGameState(identity)).balance).toBe(500);
    const synced = await gameServer.performGameAction(identity, randomUUID(), {
      type: "sync",
    });
    expect(synced.balance).toBe(500);

    const [row] = await db!
      .select()
      .from(schema.withdrawals)
      .where(
        drizzle.and(
          drizzle.eq(schema.withdrawals.userId, identity.userId),
          drizzle.eq(schema.withdrawals.coins, 120),
        ),
      );
    expect(row.refundedAt).not.toBeNull();
    // The refund never advances the queue or touches the operator's columns.
    expect(row.status).toBe("rejected");
    expect(row.processedAt).toBeNull();
  });

  it("accepts re-confirming the same car, still refuses a different one", async () => {
    // A network drop after the server saved makes the client retry with a new
    // requestId, which the receipt cannot recognise. The server used to answer
    // that retry with a 409 while preview mode let it through -- production and
    // `pnpm dev` disagreeing about the same request.
    const before = await gameServer.getGameState(identity);
    const again = await gameServer.performGameAction(identity, randomUUID(), {
      type: "select-car",
      model: "luna-gt",
      color: "#b9a1ed",
    });
    expect(again.carSelection?.model).toBe("luna-gt");
    // A colour chosen later in the garage must survive the retry.
    expect(again.color).toBe(before.color);

    await expect(
      gameServer.performGameAction(identity, randomUUID(), {
        type: "select-car",
        model: "neo-falcon",
        color: "#4275ff",
      }),
    ).rejects.toThrow("Model sudah dikonfirmasi");
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

  it("mengikat pengajak sekali, membayar keduanya sekali, di capaian", async () => {
    const { DEFAULT_ECONOMY: E } = await import("@/lib/economy-config");
    const player = (suffix: string, startParam: string | null = null) => {
      const userId = `test-ref-${suffix}-${randomUUID()}`;
      extraUserIds.push(userId);
      return { userId, displayName: `Ref ${suffix}`, username: null, photoUrl: null, startParam };
    };
    const balanceOf = async (userId: string) => {
      const [row] = await db!
        .select({ balance: schema.players.balance, referredBy: schema.players.referredBy })
        .from(schema.players)
        .where(drizzle.eq(schema.players.userId, userId));
      return row;
    };

    const inviter = player("inviter");
    await gameServer.getGameState(inviter);
    const inviterStart = (await balanceOf(inviter.userId))!.balance;

    // Diri sendiri tidak bisa jadi pengajak.
    const selfie = player("self");
    await gameServer.getGameState({ ...selfie, startParam: `ref_${selfie.userId}` });
    expect((await balanceOf(selfie.userId))!.referredBy).toBeNull();

    // Pengajak yang tidak ada diabaikan, bukan bikin baris menggantung.
    const orphan = player("orphan", "ref_test-ref-tidak-ada");
    await gameServer.getGameState(orphan);
    expect((await balanceOf(orphan.userId))!.referredBy).toBeNull();

    const invitee = player("invitee", `ref_${inviter.userId}`);
    const bound = await gameServer.getGameState(invitee);
    expect((await balanceOf(invitee.userId))!.referredBy).toBe(inviter.userId);
    // Belum mencapai 100 putaran -> belum ada yang dibayar.
    expect(bound.referral.earned).toBe(0);
    expect((await balanceOf(inviter.userId))!.balance).toBe(inviterStart);

    const inviteeStart = (await balanceOf(invitee.userId))!.balance;
    await db!
      .update(schema.players)
      .set({ laps: E.referralMilestoneLaps })
      .where(drizzle.eq(schema.players.userId, invitee.userId));

    await gameServer.getGameState(invitee);
    expect((await balanceOf(invitee.userId))!.balance).toBe(
      inviteeStart + E.referralRewardInvitee,
    );
    expect((await balanceOf(inviter.userId))!.balance).toBe(
      inviterStart + E.referralRewardInviter,
    );

    // Sync berikutnya tidak boleh membayar lagi.
    await gameServer.getGameState(invitee);
    await gameServer.getGameState(invitee);
    expect((await balanceOf(inviter.userId))!.balance).toBe(
      inviterStart + E.referralRewardInviter,
    );

    const inviterState = await gameServer.getGameState(inviter);
    expect(inviterState.referral).toMatchObject({
      invited: 1,
      earned: E.referralRewardInviter,
    });
    expect(inviterState.referral.link).toContain(`ref_${inviter.userId}`);

    // Sudah pernah balapan -> tidak bisa diikat belakangan.
    const veteran = player("veteran");
    await gameServer.getGameState(veteran);
    await db!
      .update(schema.players)
      .set({ laps: 5 })
      .where(drizzle.eq(schema.players.userId, veteran.userId));
    await gameServer.getGameState({ ...veteran, startParam: `ref_${inviter.userId}` });
    expect((await balanceOf(veteran.userId))!.referredBy).toBeNull();
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
    const { idleNotifyAfterSeconds } = await import("@/lib/idle-notify");
    const { DEFAULT_ECONOMY: E } = await import("@/lib/economy-config");
    const IDLE_NOTIFY_AFTER_SECONDS = idleNotifyAfterSeconds(E);
    const chats = await import("@/lib/bot-chats");
    process.env.PUBLIC_APP_URL ??= "https://racely.fun";

    const now = new Date();
    const idleSince = new Date(
      now.getTime() - (IDLE_NOTIFY_AFTER_SECONDS + 60) * 1000,
    );
    const chatId = 900000000 + (Date.now() % 10000);
    const userId = String(chatId);
    extraUserIds.push(userId);

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

  /**
   * Panel admin memindahkan penarikan lewat `transitionWithdrawal`, yang
   * menggantikan `UPDATE ... SET status` manual lewat psql. Dua penjaganya ada
   * di SQL, jadi hanya bisa diuji terhadap Postgres sungguhan: klausa
   * `WHERE status = <yang dibaca operator>` untuk konkurensi, dan
   * `refunded_at IS NULL` untuk baris yang koinnya sudah dipulangkan.
   */
  it("memindahkan penarikan hanya lewat jalur yang diizinkan", async () => {
    const ops = await import("@/lib/admin-ops");
    const userId = `test-ops-${randomUUID()}`;
    extraUserIds.push(userId);
    const operator = {
      userId,
      displayName: "Ops Racer",
      username: null,
      photoUrl: null,
      startParam: null,
    };

    await gameServer.performGameAction(operator, randomUUID(), {
      type: "select-car",
      model: "luna-gt",
      color: "#b9a1ed",
    });
    await db!
      .update(schema.players)
      .set({ balance: 400 })
      .where(drizzle.eq(schema.players.userId, userId));
    await gameServer.performGameAction(operator, randomUUID(), {
      type: "withdraw",
      method: "dana",
      account: "081234567890",
      accountName: "Ops Racer",
      coins: 150,
    });

    const [pending] = await db!
      .select()
      .from(schema.withdrawals)
      .where(drizzle.eq(schema.withdrawals.userId, userId));
    expect(pending.status).toBe("pending");
    const id = String(pending.id);

    const processing = await ops.transitionWithdrawal({
      id,
      expectedStatus: "pending",
      nextStatus: "processing",
      actor: "test",
    });
    expect(processing.to).toBe("processing");

    // Tab kedua yang masih melihat 'pending' tidak boleh menerapkan apa pun.
    await expect(
      ops.transitionWithdrawal({
        id,
        expectedStatus: "pending",
        nextStatus: "rejected",
        actor: "test",
      }),
    ).rejects.toThrow("sudah berubah statusnya");

    const paid = await ops.transitionWithdrawal({
      id,
      expectedStatus: "processing",
      nextStatus: "paid",
      actor: "test",
    });
    expect(paid.amountIdr).toBe(pending.amountIdr);

    const [afterPaid] = await db!
      .select()
      .from(schema.withdrawals)
      .where(drizzle.eq(schema.withdrawals.id, pending.id));
    expect(afterPaid.status).toBe("paid");
    expect(afterPaid.processedAt).not.toBeNull();

    // 'paid' adalah akhir: menolaknya akan memulangkan koin yang uangnya sudah
    // keluar dari rekening -- lihat catatan operasional di migrasi 0008.
    await expect(
      ops.transitionWithdrawal({
        id,
        expectedStatus: "paid",
        nextStatus: "rejected",
        actor: "test",
      }),
    ).rejects.toThrow("tidak diizinkan");

    // Saldo pemain tidak boleh bergerak sedikit pun karena panel: uangnya
    // berpindah di luar Racely, panel hanya mencatat keputusannya.
    expect((await gameServer.getGameState(operator)).balance).toBe(250);

    const audit = await ops.readAuditTrail(10);
    expect(audit.some((row) => row.action === "withdrawal:paid")).toBe(true);
  });

  it("menolak memindahkan penarikan yang koinnya sudah dikembalikan", async () => {
    const ops = await import("@/lib/admin-ops");
    const userId = `test-refunded-${randomUUID()}`;
    extraUserIds.push(userId);
    const player = {
      userId,
      displayName: "Refund Racer",
      username: null,
      photoUrl: null,
      startParam: null,
    };

    await gameServer.performGameAction(player, randomUUID(), {
      type: "select-car",
      model: "luna-gt",
      color: "#b9a1ed",
    });
    await db!
      .update(schema.players)
      .set({ balance: 300 })
      .where(drizzle.eq(schema.players.userId, userId));
    await gameServer.performGameAction(player, randomUUID(), {
      type: "withdraw",
      method: "dana",
      account: "081234567890",
      accountName: "Refund Racer",
      coins: 110,
    });

    const [row] = await db!
      .select()
      .from(schema.withdrawals)
      .where(drizzle.eq(schema.withdrawals.userId, userId));
    await db!
      .update(schema.withdrawals)
      .set({ status: "rejected" })
      .where(drizzle.eq(schema.withdrawals.id, row.id));
    // Sync pemain yang mengembalikan koinnya dan menstempel refunded_at.
    await gameServer.getGameState(player);

    await expect(
      ops.transitionWithdrawal({
        id: String(row.id),
        expectedStatus: "rejected",
        nextStatus: "paid",
        actor: "test",
      }),
    ).rejects.toThrow("tidak diizinkan");
  });

  /**
   * Bukti ujung-ke-ujung bahwa config ekonomi benar-benar menggerakkan
   * permainan, bukan hanya tersimpan: satu baris di racely_economy_config harus
   * mengubah hasil aksi pemain berikutnya.
   *
   * Baris config bersifat global, jadi seluruh test yang menyentuh database ada
   * di berkas ini -- yang dijalankan vitest secara berurutan -- dan `finally`
   * di bawah memulangkan keadaannya.
   */
  it("menyimpan config ekonomi dan memakainya di aksi pemain berikutnya", async () => {
    const store = await import("@/lib/economy-store");
    const { DEFAULT_ECONOMY } = await import("@/lib/economy-config");
    const userId = `test-eco-${randomUUID()}`;
    extraUserIds.push(userId);
    const player = {
      userId,
      displayName: "Economy Racer",
      username: null,
      photoUrl: null,
      startParam: null,
    };

    try {
      const saved = await store.writeEconomyConfig(
        { ...DEFAULT_ECONOMY, starterGift: 77 },
        "test",
      );
      expect(saved.starterGift).toBe(77);

      const snapshot = await store.readEconomyConfigSnapshot();
      expect(snapshot.usingDefaults).toBe(false);
      expect(snapshot.updatedBy).toBe("test");
      expect((await store.readEconomyConfig()).starterGift).toBe(77);

      await gameServer.performGameAction(player, randomUUID(), {
        type: "select-car",
        model: "luna-gt",
        color: "#b9a1ed",
      });
      const gifted = await gameServer.performGameAction(player, randomUUID(), {
        type: "gift",
      });
      // Saldo awal bawaan + bonus starter yang baru disetel.
      expect(gifted.balance).toBe(DEFAULT_ECONOMY.startingBalance + 77);
      // Config ikut di payload, jadi client menghitung dengan angka yang sama.
      expect(gifted.economy.starterGift).toBe(77);
    } finally {
      await db!.delete(schema.economyConfig);
      store.resetEconomyCache();
    }

    // Tabel kosong berarti kembali ke bawaan, bukan nol.
    const restored = await store.readEconomyConfigSnapshot();
    expect(restored.usingDefaults).toBe(true);
    expect(restored.config).toEqual(DEFAULT_ECONOMY);
  });

  /**
   * `returningPlayer` menentukan kalimat mana yang dilihat pemain di layar
   * pemilihan mobil: sambutan pemain baru, atau penawaran untuk pemain yang
   * progresnya sudah ada sebelum pemilihan mobil diperkenalkan. Penandanya
   * dulu `balance !== startingBalance`, yang ikut berubah begitu saldo awal
   * disetel dari panel -- setiap pemain baru lalu disapa sebagai pemain lama.
   */
  it("mengenali pemain lama dari riwayat aksinya, bukan dari saldo awal", async () => {
    const store = await import("@/lib/economy-store");
    const { DEFAULT_ECONOMY } = await import("@/lib/economy-config");
    const fresh = `test-fresh-${randomUUID()}`;
    const legacy = `test-legacy-${randomUUID()}`;
    extraUserIds.push(fresh, legacy);
    const identityFor = (userId: string) => ({
      userId,
      displayName: "Onboarding Racer",
      username: null,
      photoUrl: null,
      startParam: null,
    });

    try {
      // Saldo awal dinaikkan SETELAH pemain ini dibuat, jadi saldonya sekarang
      // tidak sama dengan `startingBalance` yang berlaku -- justru kondisi yang
      // dulu membuatnya salah ditandai.
      const before = await gameServer.getGameState(identityFor(fresh));
      expect(before.carSelection).toEqual({
        model: null,
        returningPlayer: false,
      });

      await store.writeEconomyConfig(
        { ...DEFAULT_ECONOMY, startingBalance: DEFAULT_ECONOMY.startingBalance + 40 },
        "test",
      );
      const after = await gameServer.getGameState(identityFor(fresh));
      expect(after.balance).toBe(DEFAULT_ECONOMY.startingBalance);
      expect(after.carSelection).toEqual({
        model: null,
        returningPlayer: false,
      });

      // Pemain yang benar-benar sudah pernah beraksi: version naik pada setiap
      // aksi non-sync, dan itulah penandanya sekarang.
      await gameServer.getGameState(identityFor(legacy));
      await db!
        .update(schema.players)
        .set({ version: 3 })
        .where(drizzle.eq(schema.players.userId, legacy));
      const returning = await gameServer.getGameState(identityFor(legacy));
      expect(returning.carSelection).toEqual({
        model: null,
        returningPlayer: true,
      });
    } finally {
      await db!.delete(schema.economyConfig);
      store.resetEconomyCache();
    }
  });
});

describe.skipIf(hasDatabase)("Neon Postgres persistence", () => {
  it("is skipped without DATABASE_URL", () => {
    expect(hasDatabase).toBe(false);
  });
});
