import { describe, expect, it } from "vitest";
import { applyPartCommand, bodyPartsSchema, emptyBodyParts, isReferralPart, PART_CATALOG, PART_IDS, PART_SLOTS, type PartId } from "../lib/car-parts";
import { INITIAL_GAME, lapReward, lapSeconds } from "../lib/game";

const SHOP_PARTS = PART_IDS.filter((id) => !isReferralPart(id));
const REWARD_PARTS = PART_IDS.filter(isReferralPart);

 describe("Body parts", () => {
  it("uses positive, whole-coin prices and valid slots throughout the catalog", () => {
    expect(Object.keys(PART_CATALOG)).toEqual([...PART_IDS]);
    for (const id of PART_IDS) {
      expect(PART_SLOTS).toContain(PART_CATALOG[id].slot);
      expect(Number.isInteger(PART_CATALOG[id].price)).toBe(true);
    }
    for (const id of SHOP_PARTS) expect(PART_CATALOG[id].price).toBeGreaterThan(0);
    // Hadiah ajakan: kewajiban rupiah nol, jadi tidak pernah berharga.
    for (const id of REWARD_PARTS) expect(PART_CATALOG[id].price).toBe(0);
    expect(REWARD_PARTS.length).toBeGreaterThan(0);
  });

  it("never sells referral parts, and only equips them once the threshold is met", () => {
    const state = { balance: 100_000, bodyParts: emptyBodyParts() };
    for (const partId of REWARD_PARTS) {
      expect(() => applyPartCommand(state, { type: "buy-part", partId })).toThrow("tidak dijual");
      expect(() => applyPartCommand(state, { type: "equip-part", partId }, 0)).toThrow("Ajak");
      const unlocked = applyPartCommand(state, { type: "equip-part", partId }, 25);
      expect(unlocked.balance).toBe(100_000);
      expect(unlocked.bodyParts.owned).toContain(partId);
      expect(unlocked.bodyParts.equipped[PART_CATALOG[partId].slot]).toBe(partId);
      // Sekali masuk koleksi, lepas-pasang tidak lagi bergantung pada hitungan teman.
      const removed = applyPartCommand(unlocked, { type: "unequip-part", slot: PART_CATALOG[partId].slot });
      expect(applyPartCommand(removed, { type: "equip-part", partId }, 0).bodyParts.equipped[PART_CATALOG[partId].slot]).toBe(partId);
    }
  });

  it("charges the catalog price once without automatically equipping", () => {
    const original = { balance: 30_000, bodyParts: emptyBodyParts() };
    const purchased = applyPartCommand(original, { type: "buy-part", partId: "vented-hood" });
    expect(purchased).toEqual({ balance: 22_000, bodyParts: { owned: ["vented-hood"], equipped: {} } });
    expect(original).toEqual({ balance: 30_000, bodyParts: emptyBodyParts() });
    expect(applyPartCommand(purchased, { type: "buy-part", partId: "vented-hood" })).toEqual(purchased);
  });

  it("rejects unaffordable and unknown parts, or equipping before buying", () => {
    expect(() => applyPartCommand({ balance: 7_000 }, { type: "buy-part", partId: "vented-hood" })).toThrow("Koin belum cukup");
    expect(() => applyPartCommand({ balance: 100_000 }, { type: "buy-part", partId: "unknown" as PartId })).toThrow("tidak tersedia");
    expect(() => applyPartCommand({ balance: 100_000 }, { type: "equip-part", partId: "gt-wing" })).toThrow("Beli part");
    expect(applyPartCommand({ balance: 8_000 }, { type: "buy-part", partId: "vented-hood" }).balance).toBe(0);
  });

  it("replaces only the matching slot, keeps ownership, and removes for free", () => {
    let state = { balance: 100_000, bodyParts: emptyBodyParts() };
    for (const partId of ["ducktail", "gt-wing", "vented-hood"] as const) {
      state = applyPartCommand(state, { type: "buy-part", partId });
      state = applyPartCommand(state, { type: "equip-part", partId });
    }
    expect(state.bodyParts.equipped).toEqual({ spoiler: "gt-wing", hood: "vented-hood" });
    expect(state.balance).toBe(56_000);
    const removed = applyPartCommand(state, { type: "unequip-part", slot: "spoiler" });
    expect(removed).toEqual({ ...state, bodyParts: { owned: state.bodyParts.owned, equipped: { hood: "vented-hood" } } });
    expect(state.bodyParts.equipped.spoiler).toBe("gt-wing");
    expect(applyPartCommand(removed, { type: "equip-part", partId: "ducktail" }).balance).toBe(56_000);
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
    let state = { ...INITIAL_GAME, balance: 100_000, bodyParts: emptyBodyParts() };
    for (const partId of SHOP_PARTS) {
      state = { ...state, ...applyPartCommand(state, { type: "buy-part", partId }) };
      state = { ...state, ...applyPartCommand(state, { type: "equip-part", partId }) };
    }
    for (const partId of REWARD_PARTS) {
      state = { ...state, ...applyPartCommand(state, { type: "equip-part", partId }, 25) };
    }
    expect(lapSeconds(state)).toBe(lapSeconds(INITIAL_GAME));
    expect(lapReward(state)).toBe(lapReward(INITIAL_GAME));
  });
});
