import { describe, expect, it } from "vitest";
import { CAR_CATALOG, CAR_MODEL_IDS, PREMIUM_CAR_IDS, STARTER_CAR_IDS, type CarModelId } from "../lib/car-catalog";
import { applyCarCommand, ownedCarIds } from "../lib/car-collection";
import { carPriceAt, DEFAULT_ECONOMY, economyConfigSchema, resolveEconomyConfig } from "../lib/economy-config";
import { INITIAL_GAME, lapReward, lapSeconds } from "../lib/game";

const original = { balance: 200, carModel: "neo-falcon" as CarModelId, color: "#4275ff" };

describe("Playful car collection", () => {
  it("offers exactly three paid models and preserves both legacy starter IDs", () => {
    expect(STARTER_CAR_IDS).toEqual(["neo-falcon", "luna-gt"]);
    expect(PREMIUM_CAR_IDS).toHaveLength(3);
    expect(CAR_MODEL_IDS).toEqual([...STARTER_CAR_IDS, ...PREMIUM_CAR_IDS]);
    expect(PREMIUM_CAR_IDS.map(id => carPriceAt(DEFAULT_ECONOMY, id))).toEqual([35, 60, 90]);
  });

  it.each(PREMIUM_CAR_IDS)("buys %s once, equips it, and preserves the starter", model => {
    const bought = applyCarCommand(original, { type: "buy-car", model }, DEFAULT_ECONOMY);
    expect(bought.balance).toBe(original.balance - carPriceAt(DEFAULT_ECONOMY, model));
    expect(bought.ownedCars).toEqual([original.carModel, model]);
    expect(bought.carModel).toBe(model);
    expect(bought.color).toBe(CAR_CATALOG[model].defaultColor);
    expect(applyCarCommand(bought, { type: "buy-car", model }, DEFAULT_ECONOMY)).toEqual(bought);
    expect(original.balance).toBe(200);
  });

  it("does not change the equipped car or paint when retrying an old purchase", () => {
    const bought = applyCarCommand(original, { type: "buy-car", model: "bebek-sultan" }, DEFAULT_ECONOMY);
    const switched = applyCarCommand(bought, { type: "equip-car", model: "neo-falcon" }, DEFAULT_ECONOMY);
    expect(applyCarCommand(switched, { type: "buy-car", model: "bebek-sultan" }, DEFAULT_ECONOMY)).toEqual(switched);
    expect(applyCarCommand(switched, { type: "equip-car", model: "neo-falcon" }, DEFAULT_ECONOMY)).toEqual(switched);
  });

  it("rejects insufficient funds, unowned cars, unknown cars, and starter purchases", () => {
    expect(() => applyCarCommand({ ...original, balance: 34 }, { type: "buy-car", model: "bebek-sultan" }, DEFAULT_ECONOMY)).toThrow("Koin belum cukup");
    expect(() => applyCarCommand(original, { type: "equip-car", model: "ufo-gabut" }, DEFAULT_ECONOMY)).toThrow("Beli mobil");
    expect(() => applyCarCommand(original, { type: "equip-car", model: "luna-gt" }, DEFAULT_ECONOMY)).toThrow("Beli mobil");
    expect(() => applyCarCommand(original, { type: "buy-car", model: "unknown" as CarModelId }, DEFAULT_ECONOMY)).toThrow();
    expect(() => applyCarCommand(original, { type: "buy-car", model: "neo-falcon" }, DEFAULT_ECONOMY)).toThrow("tidak dijual");
    expect(() => applyCarCommand({ ...original, carModel: null }, { type: "buy-car", model: "ufo-gabut" }, DEFAULT_ECONOMY)).toThrow("Pilih mobil");
  });

  it("uses current admin prices and accepts the exact required balance", () => {
    const economy = { ...DEFAULT_ECONOMY, carPriceBebek: 41 };
    const state = applyCarCommand({ ...original, balance: 41 }, { type: "buy-car", model: "bebek-sultan" }, economy);
    expect(state.balance).toBe(0);
    for (const price of [0, -1, 2.5, Infinity, 1_000_001]) expect(economyConfigSchema.safeParse({ ...economy, carPriceBebek: price }).success).toBe(false);
    expect(resolveEconomyConfig({ startingBalance: 27 }).carPriceBebek).toBe(35);
    expect(resolveEconomyConfig({ startingBalance: 27 }).startingBalance).toBe(27);
  });

  it("upgrades legacy inventories without granting unowned premium cars", () => {
    expect(ownedCarIds(undefined, "luna-gt")).toEqual(["luna-gt"]);
    expect(ownedCarIds(["neo-falcon", "neo-falcon"], "bebek-sultan")).toEqual(["neo-falcon", "bebek-sultan"]);
    expect(ownedCarIds(undefined, null)).toEqual([]);
  });

  it("keeps all premium cars cosmetic", () => {
    for (const model of PREMIUM_CAR_IDS) {
      const game = { ...INITIAL_GAME, carSelection: { model, returningPlayer: false }, ownedCars: [model] };
      expect(lapSeconds(game)).toBe(lapSeconds(INITIAL_GAME));
      expect(lapReward(game)).toBe(lapReward(INITIAL_GAME));
    }
  });
});
