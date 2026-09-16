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

  it("serializes duplicate paint purchases and daily mission claims, persisting ownership and reward receipts", async () => {
    const { cosmeticPriceAt } = await import("../lib/economy-config");
    const { PAINT_CATALOG } = await import("../lib/car-paints");
    const racer = { ...identity, userId: `test:${randomUUID()}` };
    extraUserIds.push(racer.userId);
    const selected = await gameServer.performGameAction(racer, randomUUID(), { type: "select-car", model: "luna-gt", color: "#b9a1ed" });
    const daily = selected.dailyMissions!;
    const mission = daily.items[0];
    // Harga cat diturunkan dari config ekonomi, bukan angka tetap: mendanai
    // dengan literal membuat test ini gagal setiap kali knob ekonomi bergeser.
    const paintPrice = cosmeticPriceAt(selected.economy, PAINT_CATALOG.jade.tier);
    const funded = paintPrice * 2;
    await db!.update(schema.players).set({
      balance: funded,
      dailyMissions: { ...daily, values: { ...daily.values, [mission.kind]: mission.target } },
    }).where(drizzle.eq(schema.players.userId, racer.userId));
    await Promise.all([1, 2].map(() => gameServer.performGameAction(racer, randomUUID(), { type: "buy-paint", paintId: "jade" })));
    await Promise.all([1, 2].map(() => gameServer.performGameAction(racer, randomUUID(), { type: "daily-mission", day: daily.day, kind: mission.kind })));
    const equipId = randomUUID();
    await gameServer.performGameAction(racer, equipId, { type: "equip-paint", paintId: "jade" });
    await gameServer.performGameAction(racer, equipId, { type: "equip-paint", paintId: "jade" });
    const saved = await gameServer.getGameState(racer);
    expect(saved.balance).toBe(funded - paintPrice + mission.reward);
    expect(saved.ownedPaints).toEqual(["jade"]);
    expect(saved.color).toBe(PAINT_CATALOG.jade.color);
    expect(saved.dailyMissions?.items.find(item => item.kind === mission.kind)?.claimed).toBe(true);
    const claims = await db!.select().from(schema.rewardClaims).where(drizzle.and(
      drizzle.eq(schema.rewardClaims.userId, racer.userId),
      drizzle.eq(schema.rewardClaims.rewardKey, `daily-mission:${daily.day}:${mission.kind}`),
    ));
    expect(claims).toHaveLength(mission.reward > 0 ? 1 : 0);
  });

  it("ranks settled laps with ties, a private self rank beyond Top 50, and no preview racers", async () => {
    const { pool } = await import("@/lib/db");
    const { getLeaderboard, getReferralLeaderboard } = await import("@/lib/leaderboard-server");
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      // A transaction-local shadow table keeps fixture scores out of the real
      // leaderboard, even when this suite runs alongside a development server.
      await client.query(`CREATE TEMPORARY TABLE racely_players (
        user_id text PRIMARY KEY, display_name text NOT NULL,
        laps integer NOT NULL, created_at timestamptz NOT NULL,
        car_model text, color text DEFAULT '#4275ff',
        engine_level integer DEFAULT 1, tires_level integer DEFAULT 1, battery_level integer DEFAULT 1,
        setup jsonb DEFAULT '{"gear":"4:1","roller":"standard"}',
        body_parts jsonb DEFAULT '{"owned":[],"equipped":{}}',
        referred_by text, referral_paid_at timestamptz
      ) ON COMMIT DROP`);
      expect(await getLeaderboard("999", client)).toMatchObject({ entries: [], currentPlayer: null, totalPlayers: 0, nextRival: null });
      await client.query(`INSERT INTO racely_players
        (user_id, display_name, laps, created_at, car_model) VALUES
        ('10', 'First', 1000, '2026-01-01', 'luna-gt'),
        ('20', 'Tied', 1000, '2026-01-02', 'phantom-x'),
        ('30', 'Chaser', 900, '2026-01-03', NULL),
        ('40', 'No laps', 0, '2026-01-01', 'luna-gt'),
        ('preview:fake', 'Preview', 9999, '2026-01-01', 'luna-gt'),
        ('test:fake', 'Test', 9999, '2026-01-01', 'luna-gt')`);
      await client.query(`UPDATE racely_players SET color = '#ff3366',
        engine_level = 8, tires_level = 5, battery_level = 3,
        setup = '{"gear":"5:1","roller":"heavy"}',
        body_parts = '{"owned":["gt-wing","ram-hood"],"equipped":{"spoiler":"gt-wing"}}'
        WHERE user_id = '20'`);
      const appearance = { color: "#ff3366", levels: { engine: 8, tires: 5, battery: 3 }, roller: "heavy", equipped: { spoiler: "gt-wing" } };
      const tied = await getLeaderboard("20", client);
      expect(tied.entries[1]).toMatchObject({ carModel: "phantom-x", carAppearance: appearance });
      expect(tied.currentPlayer?.carAppearance).toEqual(appearance);
      expect(tied.entries[0].carAppearance?.color).toBe("#4275ff");
      // Inventaris dan part yang tidak terpasang tidak boleh ikut keluar.
      expect(JSON.stringify(tied)).not.toMatch(/owned|ram-hood/);
      // `carModel` ikut dipetakan apa adanya -- klasemen memakainya untuk
      // menandai mobil hadiah ajakan, dan pemain tanpa mobil tetap `null`.
      expect(tied.entries.map(({ rank, name, carModel, isCurrentPlayer }) => ({ rank, name, carModel, isCurrentPlayer }))).toEqual([
        { rank: 1, name: "First", carModel: "luna-gt", isCurrentPlayer: false },
        { rank: 1, name: "Tied", carModel: "phantom-x", isCurrentPlayer: true },
        { rank: 3, name: "Chaser", carModel: null, isCurrentPlayer: false },
      ]);
      expect(tied.currentPlayer?.rank).toBe(1);
      expect(tied.nextRival).toBeNull();
      expect(tied.totalPlayers).toBe(3);
      const unranked = await getLeaderboard("40", client);
      expect(unranked.currentPlayer).toBeNull();
      expect(unranked.nextRival).toBeNull();
      expect((await getLeaderboard("preview:fake", client)).currentPlayer).toBeNull();
      expect((await getLeaderboard("30", client)).nextRival).toEqual({ name: "First", score: 1000, laps: 1000 });

      await client.query(`INSERT INTO racely_players
        (user_id, display_name, laps, created_at, car_model)
        SELECT (100 + n)::text, 'Racer ' || n, 800 - n, '2026-02-01'::timestamptz, 'luna-gt'
        FROM generate_series(1, 60) n`);
      const outside = await getLeaderboard("160", client);
      expect(outside.entries).toHaveLength(50);
      expect(outside.entries.some((entry) => entry.isCurrentPlayer)).toBe(false);
      expect(outside.currentPlayer).toMatchObject({ rank: 63, name: "Racer 60", score: 740, laps: 740, carModel: "luna-gt", isCurrentPlayer: true });
      expect(outside.nextRival).toEqual({ name: "Racer 59", score: 741, laps: 741 });
      expect(outside.totalPlayers).toBe(63);
      expect(JSON.stringify(outside)).not.toMatch(/user_id|userId|created_at|balance|username|photo/);
      expect((await getLeaderboard("'; DROP TABLE racely_players; --", client)).currentPlayer).toBeNull();
      await client.query(`UPDATE racely_players SET referred_by = '20', referral_paid_at = NOW() WHERE user_id IN ('30', '40')`);
      const referrals = await getReferralLeaderboard("20", client);
      expect(referrals.entries[0]).toMatchObject({ rank: 1, score: 2, carModel: "phantom-x", carAppearance: appearance });
      expect(referrals.currentPlayer?.carAppearance).toEqual(appearance);
      expect(JSON.stringify(referrals)).not.toMatch(/owned|ram-hood|user_id|balance/);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("picks the nearest real racer on each side and never a bot", async () => {
    // Satu-satunya test yang benar-benar MENJALANKAN query tetangga. Unit test
    // di tests/race-opponents.test.ts memalsukan barisnya, jadi CTE, tuple
    // comparison, dan filter kelayakannya hanya terbukti di sini.
    const { pool } = await import("@/lib/db");
    const { DEFAULT_ECONOMY: E } = await import("@/lib/economy-config");
    const { getRaceOpponents } = await import("@/lib/race-opponents-server");
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      // Pola yang sama dengan test leaderboard: tabel bayangan yang hidup di
      // dalam transaksi supaya fixture tidak pernah menyentuh arena sungguhan.
      await client.query(`CREATE TEMPORARY TABLE racely_players (
        user_id text PRIMARY KEY, display_name text NOT NULL,
        laps integer NOT NULL, progress double precision NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL, car_model text, color text NOT NULL DEFAULT '#4275ff',
        engine_level integer NOT NULL DEFAULT 1, tires_level integer NOT NULL DEFAULT 1,
        battery_level integer NOT NULL DEFAULT 1, setup jsonb, body_parts jsonb,
        circuit integer NOT NULL DEFAULT 0, last_settled_at timestamptz NOT NULL
      ) ON COMMIT DROP`);
      const insert = `INSERT INTO racely_players
        (user_id, display_name, laps, created_at, car_model, last_settled_at) VALUES
        ('10', 'Jauh di atas', 120, '2026-01-01', 'luna-gt', now()),
        ('20', 'Tepat di atas', 110, '2026-01-02', 'luna-gt', now()),
        ('30', 'Aku',          100, '2026-01-03', 'luna-gt', now()),
        ('40', 'Tepat di bawah', 90, '2026-01-04', 'luna-gt', now()),
        ('50', 'Jauh di bawah', 80, '2026-01-05', 'luna-gt', now()),
        ('60', 'Belum balapan',  0, '2026-01-06', 'luna-gt', now()),
        ('70', 'Tanpa mobil',   95, '2026-01-07', NULL,      now()),
        ('preview:fake', 'Preview', 105, '2026-01-08', 'luna-gt', now())`;
      await client.query(insert);

      const rivals = await getRaceOpponents("30", E, client);
      expect(rivals.status).toBe("ready");
      // 120 dan 110 ada di atas, jadi pemain berada di peringkat 3.
      expect(rivals.rank).toBe(3);
      // Peringkat memakai definisi yang sama dengan papan peringkat -- SEMUA
      // pemain ber-lap ikut dihitung, termasuk yang belum punya mobil (95 lap).
      // Yang disaring katalog mobil hanyalah siapa yang boleh muncul di arena,
      // jadi 'Tepat di bawah' ada di peringkat 5 meski lawan di layar cuma dua.
      expect(rivals.opponents.map(({ name, side, rank }) => ({ name, side, rank }))).toEqual([
        { name: "Tepat di atas", side: "above", rank: 2 },
        { name: "Tepat di bawah", side: "below", rank: 5 },
      ]);
      // Nol lap, mobil kosong, dan sesi preview tidak pernah ikut turun balap.
      expect(JSON.stringify(rivals)).not.toMatch(/Belum balapan|Tanpa mobil|Preview/);

      // Pemuncak klasemen tidak punya tetangga di atas, jadi KEDUA lawannya
      // diambil dari bawah -- terdekat lebih dulu. Itu yang dijanjikan FAQ
      // ("di ujung klasemen, keduanya bisa berada di sisi yang sama") dan yang
      // membuat `below` mengambil LIMIT 2: sisi yang kosong dipenuhi pemain
      // ASLI berikutnya, bukan bot. Assertion ini sempat menuntut satu lawan
      // saja, dan query-nya memang tidak pernah bisa memenuhinya.
      const leader = await getRaceOpponents("10", E, client);
      expect(leader.rank).toBe(1);
      expect(leader.opponents.map(({ name, side }) => ({ name, side }))).toEqual([
        { name: "Tepat di atas", side: "below" },
        { name: "Aku", side: "below" },
      ]);
      // Yang menggenapi arena tetap harus pemain sungguhan.
      expect(JSON.stringify(leader)).not.toMatch(/Belum balapan|Tanpa mobil|Preview/);

      // Lap yang seri diputus created_at, bukan dibiarkan memilih dirinya sendiri.
      await client.query(`UPDATE racely_players SET laps = 100 WHERE user_id IN ('20', '40')`);
      const tied = await getRaceOpponents("30", E, client);
      expect(tied.opponents.map(({ name, side }) => ({ name, side }))).toEqual([
        { name: "Tepat di atas", side: "above" },
        { name: "Tepat di bawah", side: "below" },
      ]);
      expect(tied.opponents.some((opponent) => opponent.name === "Aku")).toBe(false);

      const injected = await getRaceOpponents("'; DROP TABLE racely_players; --", E, client);
      expect(injected.rank).toBeNull();
      expect(injected.opponents).toEqual([]);
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
      .set({ balance: 1_000_000 })
      .where(drizzle.eq(schema.players.userId, identity.userId));

    const result = await gameServer.performGameAction(identity, randomUUID(), {
      type: "withdraw",
      method: "dana",
      account: "081234567890",
      accountName: "Integration Racer",
      coins: 300_000,
    });

    expect(result.balance).toBe(700_000);
    expect(result.withdrawals[0]).toMatchObject({
      status: "pending",
      coins: 300_000,
      method: "dana",
    });

    const [row] = await db!
      .select()
      .from(schema.withdrawals)
      .where(drizzle.eq(schema.withdrawals.userId, identity.userId));
    expect(row.status).toBe("pending");
    expect(row.processedAt).toBeNull();
    expect(row.amountIdr).toBe(30_000);
  });

  it("keeps withdrawal account data out of the action receipt table", async () => {
    await db!
      .update(schema.players)
      .set({ balance: 1_600_000 })
      .where(drizzle.eq(schema.players.userId, identity.userId));
    await gameServer.performGameAction(identity, randomUUID(), {
      type: "withdraw",
      method: "bca",
      account: "1234509876",
      accountName: "Integration Racer",
      coins: 400_000,
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
    const { PART_CATALOG } = await import("../lib/car-parts");
    const hoodPrice = PART_CATALOG["vented-hood"].price;
    await db!
      .update(schema.players)
      .set({ balance: hoodPrice + 500 })
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
    expect(bought.balance).toBe(claimed.balance - hoodPrice);

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
      .set({ balance: 1_000_000 })
      .where(drizzle.eq(schema.players.userId, identity.userId));

    await gameServer.performGameAction(identity, randomUUID(), {
      type: "withdraw",
      method: "dana",
      account: "081234567890",
      accountName: "Integration Racer",
      coins: 240_000,
    });
    expect((await gameServer.getGameState(identity)).balance).toBe(760_000);

    // An operator rejecting the request is the only way this status moves.
    await db!
      .update(schema.withdrawals)
      .set({ status: "rejected" })
      .where(
        drizzle.and(
          drizzle.eq(schema.withdrawals.userId, identity.userId),
          drizzle.eq(schema.withdrawals.coins, 240_000),
        ),
      );

    const refunded = await gameServer.getGameState(identity);
    expect(refunded.balance).toBe(1_000_000);
    expect(refunded.withdrawals[0]).toMatchObject({
      status: "rejected",
      coins: 240_000,
    });

    // Without the refunded_at guard every later sync would pay it again.
    expect((await gameServer.getGameState(identity)).balance).toBe(1_000_000);
    const synced = await gameServer.performGameAction(identity, randomUUID(), {
      type: "sync",
    });
    expect(synced.balance).toBe(1_000_000);

    const [row] = await db!
      .select()
      .from(schema.withdrawals)
      .where(
        drizzle.and(
          drizzle.eq(schema.withdrawals.userId, identity.userId),
          drizzle.eq(schema.withdrawals.coins, 240_000),
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
    // Belum ada aktivitas nyata -> belum ada yang dibayar.
    expect(bound.referral.earned).toBe(0);
    expect((await balanceOf(inviter.userId))!.balance).toBe(inviterStart);

    const inviteeStart = (await balanceOf(invitee.userId))!.balance;
    await db!
      .update(schema.players)
      .set({ laps: 10_000 })
      .where(drizzle.eq(schema.players.userId, invitee.userId));

    await gameServer.getGameState(invitee);
    expect((await balanceOf(invitee.userId))!.balance).toBe(inviteeStart);
    expect((await balanceOf(inviter.userId))!.balance).toBe(inviterStart);
    expect((await gameServer.getGameState(inviter)).referral.completed).toBe(0);

    await db!.insert(schema.rewardClaims).values(
      ["2026-01-01", "2026-01-03", "2026-01-05"].map((day) => ({
        userId: invitee.userId, rewardKey: `daily:${day}`, amount: 1,
      })),
    );
    await gameServer.getGameState(invitee);
    expect((await balanceOf(invitee.userId))!.balance).toBe(inviteeStart);
    expect((await balanceOf(inviter.userId))!.balance).toBe(inviterStart);

    await db!.update(schema.players)
      .set({ engineLevel: 2, tiresLevel: 2, batteryLevel: 2 })
      .where(drizzle.eq(schema.players.userId, invitee.userId));
    await Promise.all([gameServer.getGameState(invitee), gameServer.getGameState(invitee)]);
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
      completed: 1,
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

  it.each(["daily", "upgrade"] as const)("membayar langsung saat %s menuntaskan aktivitas, tanpa pembayaran ulang", async (actionType) => {
    const { DEFAULT_ECONOMY: E, upgradeCostAt } = await import("@/lib/economy-config");
    const { racingDayKey } = await import("@/lib/game-economy");
    const inviter = { userId: `test-ref-inviter-${randomUUID()}`, displayName: "Inviter", username: null, photoUrl: null, startParam: null };
    const invitee = { ...inviter, userId: `test-ref-invitee-${randomUUID()}`, startParam: `ref_${inviter.userId}` };
    extraUserIds.push(inviter.userId, invitee.userId);
    await gameServer.getGameState(inviter);
    await gameServer.getGameState(invitee);
    await db!.update(schema.players).set({
      carModel: "luna-gt", balance: 50_000,
      engineLevel: 2, tiresLevel: 2, batteryLevel: actionType === "daily" ? 2 : 1,
    }).where(drizzle.eq(schema.players.userId, invitee.userId));
    const count = actionType === "daily" ? E.referralActiveDays - 1 : E.referralActiveDays;
    const today = Date.now();
    await db!.insert(schema.rewardClaims).values(Array.from({ length: count }, (_, i) => ({
      userId: invitee.userId,
      rewardKey: `daily:${racingDayKey(new Date(today - (i + 1) * 86_400_000))}`,
      amount: 1,
    })));
    const before = await gameServer.getGameState(invitee);
    expect(before.balance).toBe(50_000);
    expect((await gameServer.getGameState(inviter)).referral.completed).toBe(0);
    const requestId = randomUUID();
    const action = actionType === "daily" ? { type: "daily" as const } : { type: "upgrade" as const, key: "battery" as const };
    const expectedBalance = before.balance + E.referralRewardInvitee +
      (actionType === "daily" ? before.daily.reward : -upgradeCostAt(E, "battery", 1));
    const result = await gameServer.performGameAction(invitee, requestId, action);
    expect(result.balance).toBe(expectedBalance);
    expect((await gameServer.getGameState(inviter)).referral).toMatchObject({ completed: 1, earned: E.referralRewardInviter });
    const replay = await gameServer.performGameAction(invitee, requestId, action);
    expect(replay.balance).toBe(expectedBalance);
    expect((await gameServer.getGameState(inviter)).referral.earned).toBe(E.referralRewardInviter);
  });

  it("menyelesaikan pembayaran pengajak lama tanpa mencabut atau menggandakan hadiah", async () => {
    const { DEFAULT_ECONOMY: E } = await import("@/lib/economy-config");
    const inviter = { userId: `test-ref-legacy-${randomUUID()}`, displayName: "Legacy", username: null, photoUrl: null, startParam: null };
    const invitee = { ...inviter, userId: `test-ref-legacy-${randomUUID()}`, startParam: `ref_${inviter.userId}` };
    extraUserIds.push(inviter.userId, invitee.userId);
    await gameServer.getGameState(inviter);
    await gameServer.getGameState(invitee);
    await db!.insert(schema.rewardClaims).values({
      userId: invitee.userId, rewardKey: `ref-referee:${invitee.userId}`, amount: E.referralRewardInvitee,
    });
    await db!.update(schema.players).set({ balance: E.startingBalance + E.referralRewardInvitee })
      .where(drizzle.eq(schema.players.userId, invitee.userId));
    await gameServer.getGameState(invitee);
    const [paid] = await db!.select().from(schema.players).where(drizzle.eq(schema.players.userId, invitee.userId));
    expect(paid.referralPaidAt).not.toBeNull();
    expect((await gameServer.getGameState(inviter)).referral).toMatchObject({ completed: 1, earned: E.referralRewardInviter });
    expect((await gameServer.getGameState(invitee)).balance).toBe(E.startingBalance + E.referralRewardInvitee);
    const [replayed] = await db!.select().from(schema.players).where(drizzle.eq(schema.players.userId, invitee.userId));
    expect(replayed.referralPaidAt).toEqual(paid.referralPaidAt);
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
      .set({ balance: 800_000 })
      .where(drizzle.eq(schema.players.userId, userId));
    await gameServer.performGameAction(operator, randomUUID(), {
      type: "withdraw",
      method: "dana",
      account: "081234567890",
      accountName: "Ops Racer",
      coins: 300_000,
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
    expect((await gameServer.getGameState(operator)).balance).toBe(500_000);

    const audit = await ops.readAuditTrail(10);
    expect(audit.some((row) => row.action === "withdrawal:paid")).toBe(true);
  });

  it("mencari user dan mengubah saldo tanpa menimpa perubahan bersamaan", async () => {
    const ops = await import("@/lib/admin-ops");
    const userId = `test-balance-${randomUUID()}`;
    extraUserIds.push(userId);
    const player = {
      userId,
      displayName: "Balance Racer",
      username: "balance_racer",
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
      .set({ balance: 123_000 })
      .where(drizzle.eq(schema.players.userId, userId));

    const page = await ops.readPlayerBalances({ query: "balance_racer" });
    expect(page.rows).toContainEqual(
      expect.objectContaining({ userId, balance: 123_000 }),
    );

    const changed = await ops.setPlayerBalance({
      userId,
      expectedBalance: 123_000,
      balance: 456_000,
      actor: "test",
    });
    expect(changed).toEqual({
      userId,
      previousBalance: 123_000,
      balance: 456_000,
    });
    expect((await gameServer.getGameState(player)).balance).toBe(456_000);

    await expect(
      ops.setPlayerBalance({
        userId,
        expectedBalance: 123_000,
        balance: 999_000,
        actor: "stale-test",
      }),
    ).rejects.toThrow("sudah berubah");
    expect((await gameServer.getGameState(player)).balance).toBe(456_000);

    const audit = await ops.readAuditTrail(100);
    expect(audit).toContainEqual(
      expect.objectContaining({
        action: "player:balance",
        target: userId,
        detail: {
          previousBalance: 123_000,
          balance: 456_000,
          delta: 333_000,
        },
      }),
    );
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
      .set({ balance: 600_000 })
      .where(drizzle.eq(schema.players.userId, userId));
    await gameServer.performGameAction(player, randomUUID(), {
      type: "withdraw",
      method: "dana",
      account: "081234567890",
      accountName: "Refund Racer",
      coins: 220_000,
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
        starterModel: null,
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
        starterModel: null,
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
        starterModel: null,
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
