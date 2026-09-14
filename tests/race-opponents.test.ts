import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { INITIAL_GAME } from "@/lib/game";
import { CAR_MODEL_IDS } from "@/lib/car-catalog";
import { NEUTRAL_SETUP } from "@/lib/car-setup";
import { DEFAULT_ECONOMY as E } from "@/lib/economy-config";
import { opponentDistance, raceOrder, type RaceOpponent } from "@/lib/race-opponents";
import { getRaceOpponents, withRaceOpponents } from "@/lib/race-opponents-server";

vi.mock("@/lib/db", () => ({ pool: null }));

/**
 * Lawan di arena adalah pemain sungguhan dari peringkat lap terdekat -- tidak
 * ada satu pun bot pengganti. Karena itu barisnya datang dari tabel pemain
 * lain, dan dua hal harus dijaga sekaligus: identitas mereka tidak boleh bocor
 * ke klien, dan kegagalan membaca standings tidak boleh menggagalkan aksi yang
 * koinnya sudah terlanjur tercatat.
 */
const capturedAt = new Date("2026-09-13T00:00:00Z");
const neighbor = (over: Partial<Record<string, unknown>> = {}) => ({
  user_id: "777000111",
  display_name: "Nadia",
  laps: 40,
  progress: 0.25,
  car_model: CAR_MODEL_IDS[0],
  color: "#a1e6c4",
  engine_level: 3,
  tires_level: 2,
  battery_level: 1,
  setup: NEUTRAL_SETUP,
  body_parts: { owned: [], equipped: {} },
  circuit: 0,
  last_settled_at: new Date(capturedAt.getTime() - 30_000).toISOString(),
  rank: 7,
  side: "above" as const,
  ...over,
});

const stub = (opponents: unknown[], rank: number | null = 8) =>
  vi.fn().mockResolvedValue({ rows: [{ rank, opponents, captured_at: capturedAt }] });

describe("Race opponents come from the standings, never from bots", () => {
  it("parameterizes the identity and restricts neighbours to shipped car models", async () => {
    const query = stub([]);
    const userId = "1'; DROP TABLE racely_players; --";
    await getRaceOpponents(userId, E, { query } as unknown as Pick<Pool, "query">);
    expect(query).toHaveBeenCalledOnce();
    const [sql, parameters] = query.mock.calls[0];
    expect(parameters).toEqual([userId, CAR_MODEL_IDS]);
    expect(sql).not.toContain(userId);
  });

  it("maps a neighbour without ever exposing their Telegram id", async () => {
    const row = neighbor();
    const query = stub([row]);
    const rivals = await getRaceOpponents("123", E, { query } as unknown as Pick<Pool, "query">);
    expect(rivals).toMatchObject({ status: "ready", rank: 8 });
    expect(rivals.opponents).toHaveLength(1);
    const [opponent] = rivals.opponents;
    expect(opponent).toMatchObject({
      name: "Nadia", rank: 7, side: "above", laps: 40, progress: 0.25, color: "#a1e6c4",
      levels: { engine: 3, tires: 2, battery: 1 }, setup: NEUTRAL_SETUP, equipped: {},
    });
    // Umur snapshot diukur dari jam server yang sama, bukan dari jam klien.
    expect(opponent.elapsedSeconds).toBe(30);
    expect(opponent.seconds).toBeGreaterThan(0);
    expect(opponent.id).toBe(createHash("sha256").update(`race:${row.user_id}`).digest("hex").slice(0, 24));
    expect(JSON.stringify(rivals)).not.toContain(row.user_id);
  });

  it("falls back on stored shapes that a client must never be able to poison", async () => {
    const query = stub([neighbor({
      color: "javascript:alert(1)",
      setup: { gear: "9:1", roller: "titanium" },
      body_parts: { equipped: { hood: "not-a-part" } },
      last_settled_at: new Date(capturedAt.getTime() + 60_000).toISOString(),
    })]);
    const [opponent] = (await getRaceOpponents("123", E, { query } as unknown as Pick<Pool, "query">)).opponents;
    expect(opponent.color).toBe("#4275ff");
    expect(opponent.setup).toEqual(NEUTRAL_SETUP);
    expect(opponent.equipped).toEqual({});
    // Jam baris yang mendahului snapshot tidak boleh memundurkan lawan.
    expect(opponent.elapsedSeconds).toBe(0);
  });

  it("refuses to invent a field when the database or the snapshot is missing", async () => {
    await expect(getRaceOpponents("123", E, null)).rejects.toThrow("unavailable");
    const empty = vi.fn().mockResolvedValue({ rows: [] });
    await expect(getRaceOpponents("123", E, { query: empty } as unknown as Pick<Pool, "query">)).rejects.toThrow("unavailable");
  });
});

describe("Standings never break an already-committed action", () => {
  const game = { ...INITIAL_GAME, economy: E };

  it("marks preview sessions instead of filling them with fake racers", async () => {
    for (const [userId, state] of [["preview:abc", game], ["123", { ...game, developmentPreview: true }]] as const) {
      const result = await withRaceOpponents(userId, state);
      expect(result.rivals).toEqual({ status: "preview", rank: null, opponents: [] });
    }
  });

  it("degrades to an empty field when the standings read fails", async () => {
    // pool di-mock null, jadi getRaceOpponents melempar di dalam withRaceOpponents.
    const result = await withRaceOpponents("123", game);
    expect(result.rivals).toEqual({ status: "unavailable", rank: null, opponents: [] });
    expect(result.balance).toBe(game.balance);
  });
});

describe("Projected rival distance", () => {
  const rival = (over: Partial<RaceOpponent> = {}): RaceOpponent => ({
    id: "a", name: "Rival", rank: 2, side: "above", model: CAR_MODEL_IDS[0], color: "#ffffff",
    levels: { engine: 1, tires: 1, battery: 1 }, setup: NEUTRAL_SETUP, equipped: {},
    laps: 10, progress: 0, seconds: 10, elapsedSeconds: 0, ...over,
  });

  it("pays idle rivals at the offline rate and stops at the offline cap", () => {
    const idle = E.heartbeatCapSeconds + E.offlineCapSeconds * 5;
    const expected = 10 + (E.heartbeatCapSeconds + E.offlineCapSeconds * E.offlineRate) / 10;
    expect(opponentDistance(rival({ elapsedSeconds: idle }), E)).toBeCloseTo(expected, 8);
    // Detik sejak snapshot menumpuk pada umur baris, dan ikut kena cap yang sama.
    expect(opponentDistance(rival({ elapsedSeconds: 0 }), E, idle)).toBeCloseTo(expected, 8);
    expect(opponentDistance(rival({ elapsedSeconds: idle / 2 }), E, idle / 2)).toBeCloseTo(expected, 8);
  });

  it("places the player against real rivals and breaks exact ties by side", () => {
    const rivals = { status: "ready" as const, rank: 2, opponents: [
      rival({ id: "above", side: "above" }),
      rival({ id: "below", side: "below" }),
    ] };
    const order = raceOrder(10, rivals, E);
    expect(order.map(entry => entry.opponent?.id ?? "player")).toEqual(["above", "player", "below"]);
    expect(raceOrder(11, rivals, E)[0].opponent).toBeNull();
  });

  it("leaves the player alone in first when nobody is nearby", () => {
    expect(raceOrder(3, undefined, E)).toEqual([{ opponent: null, distance: 3, tieOrder: 1 }]);
  });
});
