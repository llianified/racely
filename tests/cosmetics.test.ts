import { describe, expect, it } from "vitest";
import { CAR_MODEL_IDS } from "../lib/car-catalog";
import { COSMETICS, COSMETIC_SLOTS, availableCosmetics, buyCosmetic, compatibleCosmetics, equipCosmetic, visibleCosmetics } from "../lib/cosmetics";
import { INITIAL_GAME, lapReward, lapSeconds } from "../lib/game";

describe("Permanent cosmetics", () => {
  it("has unique IDs, positive integer prices and coverage for every model and slot", () => {
    expect(new Set(COSMETICS.map(item => item.id)).size).toBe(COSMETICS.length);
    for (const item of COSMETICS) {
      expect(Number.isSafeInteger(item.price) && item.price > 0).toBe(true);
      expect(item.model === "all" || CAR_MODEL_IDS.includes(item.model)).toBe(true);
    }
    for (const model of CAR_MODEL_IDS) {
      for (const slot of COSMETIC_SLOTS) expect(compatibleCosmetics(model).some(item => item.slot === slot)).toBe(true);
    }
  });

  it("deducts catalog prices, removes purchased items from the shop and never automatically equips", () => {
    const purchase = buyCosmetic(100, [], "neo-falcon", "gold-line");
    expect(purchase).toEqual({ balance: 75, ownedCosmetics: ["gold-line"] });
    expect(availableCosmetics("neo-falcon", purchase.ownedCosmetics).some(item => item.id === "gold-line")).toBe(false);
    expect(availableCosmetics("neo-falcon", []).some(item => item.id === "luna-aurora")).toBe(false);
    expect(availableCosmetics("neo-falcon", COSMETICS.map(item => item.id))).toEqual([]);
  });

  it("rejects insufficient funds, duplicate, invalid and incompatible purchases", () => {
    expect(() => buyCosmetic(24, [], "neo-falcon", "gold-line")).toThrow("Koin belum cukup");
    expect(() => buyCosmetic(1000, ["gold-line"], "neo-falcon", "gold-line")).toThrow("sudah dimiliki");
    expect(() => buyCosmetic(1000, [], "neo-falcon", "unknown")).toThrow("tidak ditemukan");
    expect(() => buyCosmetic(1000, [], "neo-falcon", "luna-aurora")).toThrow("tidak cocok");
  });

  it("requires compatible ownership and the correct slot, allows free replacement and removal", () => {
    const owned = ["gold-line", "falcon-ember", "gold-forged", "luna-aurora"];
    const initial = { livery: "gold-line", wheel: "gold-forged" };
    const equipped = equipCosmetic(owned, initial, "neo-falcon", "livery", "falcon-ember");
    expect(equipped).toEqual({ livery: "falcon-ember", wheel: "gold-forged" });
    expect(initial.livery).toBe("gold-line");
    expect(equipCosmetic(owned, equipped, "neo-falcon", "livery", null)).toEqual({ wheel: "gold-forged" });
    expect(() => equipCosmetic([], {}, "neo-falcon", "livery", "gold-line")).toThrow("Beli kosmetik");
    expect(() => equipCosmetic(owned, {}, "neo-falcon", "wheel", "gold-line")).toThrow("slot");
    expect(() => equipCosmetic(owned, {}, "neo-falcon", "livery", "luna-aurora")).toThrow("tidak cocok");
  });

  it("renders only compatible slot assignments and never changes performance or rewards", () => {
    expect(visibleCosmetics("neo-falcon", { livery: "luna-aurora", wheel: "gold-line", spoiler: "gt-wing" })).toEqual({ spoiler: "gt-wing" });
    for (const model of CAR_MODEL_IDS) {
      for (const item of compatibleCosmetics(model)) {
        const dressed = { ...INITIAL_GAME, equippedCosmetics: { [item.slot]: item.id } };
        expect(lapSeconds(dressed)).toBe(lapSeconds(INITIAL_GAME));
        expect(lapReward(dressed)).toBe(lapReward(INITIAL_GAME));
      }
    }
  });
});
