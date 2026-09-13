import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAR_CATALOG, CAR_MODEL_IDS, isCarColor } from "../lib/car-catalog";
import { gameReducer, INITIAL_GAME, lapReward, lapSeconds } from "../lib/game";
import { DEFAULT_ECONOMY } from "../lib/economy-config";

vi.mock("server-only", () => ({}));
import { getPreviewGameState, performPreviewGameAction, PREVIEW_GAME_COOKIE, previewCarActionSchema } from "../lib/preview-game";

/** Mode preview memakai config yang sama dengan server; di sini yang bawaan. */
const E = DEFAULT_ECONOMY;
const now = new Date("2026-09-12T00:00:00Z");
const identity = { userId: `preview:${randomUUID()}`, displayName: "Preview Racer", username: "preview", photoUrl: null, startParam: null };
const request = (cookie?: string) => new Request("http://localhost/api/game", { headers: cookie ? { cookie: `${PREVIEW_GAME_COOKIE}=${cookie}` } : {} });
const action = (cookie: string, command: Parameters<typeof performPreviewGameAction>[3], id = randomUUID()) => performPreviewGameAction(request(cookie), identity, id, command, E);
const selectLuna = { type: "select-car", model: "luna-gt", color: "#b9a1ed" } as const;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());

/**
 * Penyerap koin sukarela. Satu arah, dan itu bukan detail: Sparepart yang bisa
 * kembali jadi koin akan mengubah setiap hadiah Sparepart -- misi harian, kotak
 * bonus, duel, leaderboard -- menjadi kewajiban rupiah.
 */
describe("Tukar koin jadi Sparepart", () => {
  const berjalan = () => {
    const fresh = getPreviewGameState(request(), identity, E);
    return action(fresh.cookieValue, selectLuna).cookieValue;
  };

  it("memotong koin dan menambah Sparepart sesuai rate", () => {
    const cookie = berjalan();
    const awal = getPreviewGameState(request(cookie), identity, E).state;
    const hasil = action(cookie, { type: "convert-scrap", coins: 5 });

    expect(hasil.state.balance).toBe(awal.balance - 5);
    expect(hasil.state.scrap).toBe(awal.scrap + 5 * E.coinToScrapRate);
    expect(hasil.state.scrapEarned).toBe(awal.scrapEarned + 5 * E.coinToScrapRate);
  });

  it("menolak jumlah di atas saldo, tanpa menyentuh apa pun", () => {
    const cookie = berjalan();
    const awal = getPreviewGameState(request(cookie), identity, E).state;
    const hasil = action(cookie, { type: "convert-scrap", coins: awal.balance + 1 });

    expect(hasil.state.balance).toBe(awal.balance);
    expect(hasil.state.scrap).toBe(awal.scrap);
  });

  it("tidak punya jalur balik", () => {
    // Skema server adalah tempat jalur itu harus ditolak, bukan UI.
    const source = readFileSync("lib/game-server.ts", "utf8");
    expect(source).toContain('z.literal("convert-scrap")');
    for (const terlarang of ["convert-coins", "scrap-to-coin", "sell-scrap"]) {
      expect(source).not.toContain(terlarang);
    }
  });
});

describe("Workshop installation", () => {
  it("installs a part once, deducts its cost, and preserves it on reload", () => {
    const fresh = getPreviewGameState(request(), identity, E);
    const selected = action(fresh.cookieValue, selectLuna);
    const funded = action(selected.cookieValue, { type: "gift" });
    const id = randomUUID();
    const installed = action(funded.cookieValue, { type: "upgrade", key: "engine" }, id);
    expect(installed.state.balance).toBe(0);
    expect(installed.state.levels).toEqual({ engine: 2, tires: 1, battery: 1 });
    expect(installed.state.color).toBe(selectLuna.color);
    expect(action(installed.cookieValue, { type: "upgrade", key: "engine" }, id).state).toEqual(installed.state);
    expect(getPreviewGameState(request(installed.cookieValue), identity, E).state.levels).toEqual(installed.state.levels);
    expect(() => action(installed.cookieValue, { type: "upgrade", key: "tires" })).toThrow("Koin belum cukup");
  });
});

describe("Preview car collection", () => {
  it("rejects premium onboarding and purchase before selecting a starter", () => {
    const fresh = getPreviewGameState(request(), identity, E);
    expect(() => action(fresh.cookieValue, { type: "select-car", model: "bebek-sultan", color: "#ffd45c" })).toThrow();
    expect(() => action(fresh.cookieValue, { type: "buy-car", model: "bebek-sultan" })).toThrow("Pilih mobilmu");
    const selected = action(fresh.cookieValue, selectLuna);
    expect(() => action(selected.cookieValue, { type: "buy-car", model: "bebek-sultan" })).toThrow("Koin belum cukup");
    expect(() => action(selected.cookieValue, { type: "equip-car", model: "bebek-sultan" })).toThrow("Beli mobil");
  });

  it("persists the collection, charges once, equips for free, and preserves progress", () => {
    const selected = action(getPreviewGameState(request(), identity, E).cookieValue, selectLuna);
    const cookie = JSON.parse(Buffer.from(selected.cookieValue, "base64url").toString("utf8"));
    cookie.state.balance = 200;
    const funded = Buffer.from(JSON.stringify(cookie)).toString("base64url");
    const requestId = randomUUID();
    const bought = action(funded, { type: "buy-car", model: "bebek-sultan" }, requestId);
    expect(bought.state.balance).toBe(200 - E.carPriceBebek);
    expect(bought.state.ownedCars).toEqual(["luna-gt", "bebek-sultan"]);
    expect(bought.state.carSelection?.model).toBe("bebek-sultan");
    expect(bought.state.color).toBe(CAR_CATALOG["bebek-sultan"].defaultColor);
    expect(bought.state.levels).toEqual(selected.state.levels);
    expect(bought.state.laps).toBe(selected.state.laps);
    expect(action(bought.cookieValue, { type: "buy-car", model: "bebek-sultan" }, requestId).state).toEqual(bought.state);
    expect(action(bought.cookieValue, { type: "buy-car", model: "bebek-sultan" }).state).toEqual(bought.state);
    const switched = action(bought.cookieValue, { type: "equip-car", model: "luna-gt" });
    expect(switched.state.balance).toBe(bought.state.balance);
    expect(switched.state.ownedCars).toEqual(bought.state.ownedCars);
    expect(switched.state.carSelection?.model).toBe("luna-gt");
    expect(getPreviewGameState(request(switched.cookieValue), identity, E).state).toEqual(switched.state);
    expect(action(switched.cookieValue, { type: "buy-car", model: "bebek-sultan" }, requestId).state).toEqual(switched.state);
  });
});

describe("Preview body parts", () => {
  it("persists purchases and equipped slots across reload, without double charging retries", () => {
    const fresh = getPreviewGameState(request(), identity, E);
    const selected = action(fresh.cookieValue, selectLuna);
    const requestId = randomUUID();
    const purchased = action(selected.cookieValue, { type: "buy-part", partId: "vented-hood" }, requestId);
    expect(purchased.state.balance).toBe(selected.state.balance - 8);
    expect(purchased.state.bodyParts).toEqual({ owned: ["vented-hood"], equipped: {} });
    expect(action(purchased.cookieValue, { type: "buy-part", partId: "vented-hood" }, requestId).state).toEqual(purchased.state);
    expect(action(purchased.cookieValue, { type: "buy-part", partId: "vented-hood" }).state).toEqual(purchased.state);
    const equipped = action(purchased.cookieValue, { type: "equip-part", partId: "vented-hood" });
    expect(equipped.state.bodyParts?.equipped).toEqual({ hood: "vented-hood" });
    expect(getPreviewGameState(request(equipped.cookieValue), identity, E).state.bodyParts).toEqual(equipped.state.bodyParts);
    const removed = action(equipped.cookieValue, { type: "unequip-part", slot: "hood" });
    expect(removed.state.bodyParts).toEqual({ owned: ["vented-hood"], equipped: {} });
    expect(removed.state.balance).toBe(purchased.state.balance);
    expect(removed.state.color).toBe(selected.state.color);
    expect(removed.state.levels).toEqual(selected.state.levels);
  });

  it("requires onboarding, sufficient coins, and ownership", () => {
    const fresh = getPreviewGameState(request(), identity, E);
    expect(() => action(fresh.cookieValue, { type: "buy-part", partId: "vented-hood" })).toThrow("Pilih mobilmu");
    const selected = action(fresh.cookieValue, selectLuna);
    expect(() => action(selected.cookieValue, { type: "buy-part", partId: "gt-wing" })).toThrow("Koin belum cukup");
    expect(() => action(selected.cookieValue, { type: "equip-part", partId: "vented-hood" })).toThrow("Beli part");
    expect(getPreviewGameState(request(selected.cookieValue), identity, E).state).toEqual(selected.state);
  });
});

describe("Preview check-in harian", () => {
  const racing = () => {
    const fresh = getPreviewGameState(request(), identity, E);
    return action(fresh.cookieValue, selectLuna).cookieValue;
  };

  it("membayar sekali per hari dan menyambung streak besoknya", () => {
    const cookie = racing();
    const awal = getPreviewGameState(request(cookie), identity, E).state;
    expect(awal.daily).toMatchObject({ streak: 0, claimedToday: false, reward: 1 });

    const hari1 = action(cookie, { type: "daily" });
    expect(hari1.state.balance).toBe(awal.balance + 1);
    expect(hari1.state.daily).toMatchObject({ streak: 1, claimedToday: true, nextReward: 2 });

    // Klaim kedua di hari yang sama tidak menambah koin.
    const lagi = action(hari1.cookieValue, { type: "daily" });
    expect(lagi.state.balance).toBe(hari1.state.balance);
    expect(lagi.state.daily.streak).toBe(1);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    const hari2 = action(lagi.cookieValue, { type: "daily" });
    expect(hari2.state.daily).toMatchObject({ streak: 2, claimedToday: true, nextReward: 3 });
    expect(hari2.state.balance).toBe(hari1.state.balance + 2);
  });

  it("mereset streak setelah satu hari terlewat", () => {
    const hari1 = action(racing(), { type: "daily" });
    vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);
    const setelahBolong = action(hari1.cookieValue, { type: "daily" });
    expect(setelahBolong.state.daily).toMatchObject({ streak: 1, claimedToday: true });
  });

  it("tidak menyimpan riwayat klaim ke dalam state yang dikirim ke client", () => {
    const klaim = action(racing(), { type: "daily" });
    expect("dailyClaims" in klaim.state).toBe(false);
  });
});

describe("Preview offline earnings", () => {
  const racing = () => {
    const fresh = getPreviewGameState(request(), identity, E);
    return action(fresh.cookieValue, selectLuna).cookieValue;
  };

  it("credits ten minutes away at half rate and reports it once", () => {
    const cookie = racing();
    vi.advanceTimersByTime(10 * 60 * 1000);
    const back = action(cookie, { type: "sync" });

    // Same split the database path uses: 120s online (15 laps) + 480s at
    // half speed (30 laps), all landing straight in pending.
    expect(back.state.offlineEarnings).toEqual({
      awaySeconds: 600,
      creditedSeconds: 480,
      capped: false,
      laps: 30,
      coins: 1.5,
    });
    expect(back.state.laps).toBe(45);
    expect(back.state.pending).toBe(2.25);

    // The summary rides the response, never the cookie, so it is not replayed.
    expect(
      getPreviewGameState(request(back.cookieValue), identity, E).state
        .offlineEarnings,
    ).toBeUndefined();
  });

  it("caps a ten hour absence at four hours, like the database path", () => {
    const cookie = racing();
    vi.advanceTimersByTime(10 * 60 * 60 * 1000);
    const back = action(cookie, { type: "sync" });

    // Putarannya tetap 900 -- yang dibatasi jendela offline adalah waktu, bukan
    // bayaran. Koinnya kini juga kena batas harian Fase 0, jadi yang dikunci di
    // sini adalah batas itu, bukan angka yang berubah setiap knob disetel.
    expect(back.state.offlineEarnings).toMatchObject({
      awaySeconds: 36000,
      creditedSeconds: 4 * 60 * 60,
      capped: true,
      laps: 900,
    });
    expect(back.state.pending).toBe(E.dailyCoinCapPerPlayer);
    expect(back.state.offlineEarnings?.coins).toBeLessThanOrEqual(
      E.dailyCoinCapPerPlayer,
    );
    expect(back.state.dayCoins).toBe(E.dailyCoinCapPerPlayer);
    // Sparepart tidak ikut dibatasi: ia tidak bernilai rupiah.
    expect(back.state.scrap).toBeGreaterThan(0);
  });

  it("says nothing about an absence a heartbeat could have covered", () => {
    const cookie = racing();
    vi.advanceTimersByTime(8000);
    expect(action(cookie, { type: "sync" }).state.offlineEarnings).toBeUndefined();
  });
});

describe("Preview car selection", () => {
  it("accepts all catalog colors only for their models", () => {
    for (const model of CAR_MODEL_IDS) {
      for (const choice of CAR_CATALOG[model].colors) expect(isCarColor(model, choice.color)).toBe(true);
      expect(isCarColor(model, "#000000")).toBe(false);
    }
    expect(isCarColor("neo-falcon", "#b9a1ed")).toBe(false);
    expect(isCarColor("luna-gt", "#4275ff")).toBe(false);
    expect(previewCarActionSchema.safeParse({ requestId: randomUUID(), action: { ...selectLuna, model: "unknown" } }).success).toBe(false);
  });

  it("requires onboarding for a new cookie, but not legacy database state", () => {
    const fresh = getPreviewGameState(request(), identity, E);
    expect(fresh.state.carSelection).toEqual({ model: null, returningPlayer: false });
    expect(INITIAL_GAME.carSelection).toBeUndefined();
    expect(gameReducer(INITIAL_GAME, { type: "tick", delta: .5 }).progress).toBeGreaterThan(0);
  });

  it("freezes both server and client accrual while awaiting a choice", () => {
    const fresh = getPreviewGameState(request(), identity, E);
    vi.advanceTimersByTime(60 * 60 * 1000);
    const synced = action(fresh.cookieValue, { type: "sync" });
    expect(synced.state).toEqual(fresh.state);
    expect(gameReducer(fresh.state, { type: "tick", delta: 60 })).toEqual(fresh.state);
    expect(() => action(synced.cookieValue, { type: "gift" })).toThrow("Pilih mobilmu");
    expect(() => action(synced.cookieValue, { type: "color", color: "#4275ff" })).toThrow("Pilih mobilmu");
  });

  it("confirms for free, survives reload and starts time only after confirmation", () => {
    const fresh = getPreviewGameState(request(), identity, E);
    vi.advanceTimersByTime(120000);
    const selected = action(fresh.cookieValue, selectLuna);
    expect(selected.state).toEqual({ ...fresh.state, ownedCars: ["luna-gt"], color: selectLuna.color, carSelection: { model: "luna-gt", returningPlayer: false } });
    expect(getPreviewGameState(request(selected.cookieValue), identity, E).state).toEqual(selected.state);
    vi.advanceTimersByTime(8000);
    expect(action(selected.cookieValue, { type: "sync" }).state.laps).toBe(1);
  });

  it("handles duplicate confirmations without resetting a later color", () => {
    const fresh = getPreviewGameState(request(), identity, E);
    const requestId = randomUUID();
    const selected = action(fresh.cookieValue, selectLuna, requestId);
    expect(action(selected.cookieValue, selectLuna, requestId).state).toEqual(selected.state);
    const repainted = action(selected.cookieValue, { type: "color", color: "#e6a4ba" });
    expect(action(repainted.cookieValue, selectLuna, requestId).state).toEqual(repainted.state);
    expect(action(repainted.cookieValue, selectLuna).state).toEqual(repainted.state);
  });

  it("rejects another model after confirmation and rejects incompatible colors", () => {
    const fresh = getPreviewGameState(request(), identity, E);
    expect(() => action(fresh.cookieValue, { ...selectLuna, color: "#4275ff" })).toThrow("tidak valid");
    const selected = action(fresh.cookieValue, selectLuna);
    expect(() => action(selected.cookieValue, { type: "select-car", model: "neo-falcon", color: "#4275ff" })).toThrow("tidak dapat diganti");
    expect(() => action(selected.cookieValue, { type: "color", color: "#4275ff" })).toThrow("tidak tersedia");
    expect(() => action(selected.cookieValue, { type: "color", color: "#000000" })).toThrow("tidak tersedia");
  });

  it("offers a legacy cookie one choice without discarding any progress", () => {
    const { missions: _missions, ...legacyInitial } = INITIAL_GAME;
    const state = { ...legacyInitial, balance: 250, pending: 3.25, earned: 29.25, laps: 80, progress: .4, levels: { engine: 3, tires: 2, battery: 4 }, rewardClaimed: true, missionsClaimed: ["laps"], color: "#f4b65b", withdrawals: [{ id: randomUUID(), coins: 100, method: "dana" as const, account: "081234567890", accountName: "Preview Racer", status: "pending" as const, createdAt: now.toISOString() }] };
    const cookie = Buffer.from(JSON.stringify({ version: 1, userId: identity.userId, updatedAt: now.getTime(), receipts: [], state })).toString("base64url");
    const offered = getPreviewGameState(request(cookie), identity, E);
    const { missionsClaimed: _claims, ...publicState } = state;
    expect(offered.state).toEqual({
      ...publicState,
      missions: offered.state.missions,
      carSelection: { model: null, returningPlayer: true },
      ownedCars: [],
      referral: offered.state.referral,
    });
    // Mode preview cuma punya satu pemain, jadi tidak ada ajakan yang terhitung.
    expect(offered.state.referral).toMatchObject({ invited: 0, earned: 0 });
    expect(offered.state.referral.link).toContain("startapp=ref_");
    vi.advanceTimersByTime(3600000);
    const selected = action(offered.cookieValue, selectLuna);
    expect(selected.state).toEqual({
      ...publicState,
      missions: selected.state.missions,
      color: selectLuna.color,
      carSelection: { model: "luna-gt", returningPlayer: true },
      ownedCars: ["luna-gt"],
      referral: selected.state.referral,
    });
  });

  it("credits time owed before the legacy offer, then pauses", () => {
    const cookie = Buffer.from(JSON.stringify({ version: 1, userId: identity.userId, updatedAt: now.getTime() - 16000, receipts: [], state: INITIAL_GAME })).toString("base64url");
    const offered = getPreviewGameState(request(cookie), identity, E);
    expect(offered.state.laps).toBe(2);
    expect(offered.state.pending).toBe(.1);
    vi.advanceTimersByTime(16000);
    expect(getPreviewGameState(request(offered.cookieValue), identity, E).state).toEqual(offered.state);
  });

  it("keeps performance and rewards equal for both models", () => {
    const states = CAR_MODEL_IDS.map((model) => ({ ...INITIAL_GAME, levels: { engine: 4, tires: 3, battery: 5 }, carSelection: { model, returningPlayer: false } }));
    expect(lapSeconds(states[0])).toBe(lapSeconds(states[1]));
    expect(lapReward(states[0])).toBe(lapReward(states[1]));
  });
});
