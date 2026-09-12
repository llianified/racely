import { describe, expect, it } from "vitest";
import { applyPartCommand, bodyPartsSchema, emptyBodyParts, PART_CATALOG, PART_IDS, PART_SLOTS, type PartId } from "../lib/car-parts";
import { INITIAL_GAME, lapReward, lapSeconds } from "../lib/game";

 describe("Body parts", () => {
  it("uses positive, whole-coin prices and valid slots throughout the catalog", () => {
    expect(Object.keys(PART_CATALOG)).toEqual([...PART_IDS]);
    for (const id of PART_IDS) {
      expect(PART_SLOTS).toContain(PART_CATALOG[id].slot);
      expect(PART_CATALOG[id].price).toBeGreaterThan(0);
      expect(Number.isInteger(PART_CATALOG[id].price)).toBe(true);
    }
  });

  it("charges the catalog price once without automatically equipping", () => {
    const original = { balance: 30, bodyParts: emptyBodyParts() };
    const purchased = applyPartCommand(original, { type: "buy-part", partId: "vented-hood" });
    expect(purchased).toEqual({ balance: 22, bodyParts: { owned: ["vented-hood"], equipped: {} } });
    expect(original).toEqual({ balance: 30, bodyParts: emptyBodyParts() });
    expect(applyPartCommand(purchased, { type: "buy-part", partId: "vented-hood" })).toEqual(purchased);
  });

  it("rejects unaffordable and unknown parts, or equipping before buying", () => {
    expect(() => applyPartCommand({ balance: 7 }, { type: "buy-part", partId: "vented-hood" })).toThrow("Koin belum cukup");
    expect(() => applyPartCommand({ balance: 100 }, { type: "buy-part", partId: "unknown" as PartId })).toThrow("tidak tersedia");
    expect(() => applyPartCommand({ balance: 100 }, { type: "equip-part", partId: "gt-wing" })).toThrow("Beli part");
    expect(applyPartCommand({ balance: 8 }, { type: "buy-part", partId: "vented-hood" }).balance).toBe(0);
  });

  it("replaces only the matching slot, keeps ownership, and removes for free", () => {
    let state = { balance: 100, bodyParts: emptyBodyParts() };
    for (const partId of ["ducktail", "gt-wing", "vented-hood"] as const) {
      state = applyPartCommand(state, { type: "buy-part", partId });
      state = applyPartCommand(state, { type: "equip-part", partId });
    }
    expect(state.bodyParts.equipped).toEqual({ spoiler: "gt-wing", hood: "vented-hood" });
    expect(state.balance).toBe(56);
    const removed = applyPartCommand(state, { type: "unequip-part", slot: "spoiler" });
    expect(removed).toEqual({ ...state, bodyParts: { owned: state.bodyParts.owned, equipped: { hood: "vented-hood" } } });
    expect(state.bodyParts.equipped.spoiler).toBe("gt-wing");
    expect(applyPartCommand(removed, { type: "equip-part", partId: "ducktail" }).balance).toBe(56);
  });

  it("rejects duplicate ownership, wrong slots and unowned equipped parts", () => {
    expect(bodyPartsSchema.safeParse(emptyBodyParts()).success).toBe(true);
    for (const invalid of [
      { owned: ["ducktail", "ducktail"], equipped: {} },
      { owned: ["ducktail"], equipped: { hood: "ducktail" } },
      { owned: [], equipped: { spoiler: "ducktail" } },
      { owned: ["unknown"], equipped: {} },
      { owned: ["ducktail"], equipped: { other: "ducktail" } },
    ]) expect(bodyPartsSchema.safeParse(invalid).success).toBe(false);
  });

  it("keeps aero parts cosmetic, independent of rewards and speed", () => {
    let state = { ...INITIAL_GAME, balance: 100, bodyParts: emptyBodyParts() };
    for (const partId of PART_IDS) {
      state = { ...state, ...applyPartCommand(state, { type: "buy-part", partId }) };
      state = { ...state, ...applyPartCommand(state, { type: "equip-part", partId }) };
    }
    expect(lapSeconds(state)).toBe(lapSeconds(INITIAL_GAME));
    expect(lapReward(state)).toBe(lapReward(INITIAL_GAME));
  });
});
