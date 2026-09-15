import { z } from "zod";
import { isReferralReward, referralRequirement, referralRewardUnlocked } from "./referral-rewards";

export const PART_SLOTS = ["hood", "spoiler", "splitter", "skirts"] as const;
export type PartSlot = (typeof PART_SLOTS)[number];
export const PART_IDS = ["vented-hood", "ram-hood", "ducktail", "gt-wing", "front-splitter", "side-skirts", "neon-fin", "crown-wing"] as const;
export type PartId = (typeof PART_IDS)[number];
export const SLOT_LABELS: Record<PartSlot, string> = { hood: "Kap mesin", spoiler: "Spoiler", splitter: "Splitter", skirts: "Side skirt" };
/**
 * Harga dalam koin pada denominasi bawaan (10 koin = Rp1), lihat `DEFAULT_ECONOMY`.
 * Part hadiah ajakan (`REFERRAL_MILESTONES`) berharga 0 dan ditolak oleh
 * `buy-part`; ia masuk koleksi saat pertama dipasang setelah ambang tercapai.
 */
export const PART_CATALOG: Record<PartId, { name: string; slot: PartSlot; price: number; description: string; finish: string }> = {
  "vented-hood": { name: "Vortex Hood", slot: "hood", price: 8_000, description: "Kap graphite dengan dua jalur louver dan profil rendah mengikuti hidung mobil.", finish: "Graphite satin" },
  "ram-hood": { name: "Ram Air Hood", slot: "hood", price: 16_000, description: "Kap dengan intake tengah, mulut udara gelap, dan tepian metalik.", finish: "Graphite / alloy" },
  "ducktail": { name: "Aero Ducktail", slot: "spoiler", price: 12_000, description: "Spoiler rendah dengan ujung melengkung. Menggantikan spoiler bawaan, bukan ditumpuk.", finish: "Warna bodi" },
  "gt-wing": { name: "GT Swan Wing", slot: "spoiler", price: 24_000, description: "Sayap lebar, dua dudukan swan-neck, dan endplate tegak bergaya time attack.", finish: "Graphite / gold" },
  "front-splitter": { name: "Blade Splitter", slot: "splitter", price: 6_000, description: "Bibir depan menyapu ke samping dengan dua batang penyangga alloy.", finish: "Graphite satin" },
  "side-skirts": { name: "Flow Side Skirts", slot: "skirts", price: 10_000, description: "Sepasang bilah bawah bodi dengan sirip belakang, dipasang di antara kedua as roda.", finish: "Graphite / gold" },
  "neon-fin": { name: "Neon Fin Splitter", slot: "splitter", price: 0, description: "Splitter depan berlapis emas dengan sirip tegak di kedua ujung. Hadiah 3 teman, tidak dijual.", finish: "Gold / warna bodi" },
  "crown-wing": { name: "Crown Wing", slot: "spoiler", price: 0, description: "Sayap GT dengan bilah dan endplate emas penuh. Hadiah 10 teman, tidak dijual.", finish: "Gold penuh" },
};
export const isReferralPart = (id: PartId) => isReferralReward("part", id);
export const partReferralRequirement = (id: PartId) => referralRequirement("part", id);

export type BodyParts = { owned: PartId[]; equipped: Partial<Record<PartSlot, PartId>> };
export const emptyBodyParts = (): BodyParts => ({ owned: [], equipped: {} });
export const bodyPartsSchema = z.object({
  owned: z.array(z.enum(PART_IDS)).max(PART_IDS.length),
  equipped: z.object({
    hood: z.enum(PART_IDS).optional(),
    spoiler: z.enum(PART_IDS).optional(),
    splitter: z.enum(PART_IDS).optional(),
    skirts: z.enum(PART_IDS).optional(),
  }).strict(),
}).refine(parts => new Set(parts.owned).size === parts.owned.length && Object.entries(parts.equipped).every(([slot, id]) => parts.owned.includes(id) && PART_CATALOG[id].slot === slot));

export type PartCommand =
  | { type: "buy-part"; partId: PartId }
  | { type: "equip-part"; partId: PartId }
  | { type: "unequip-part"; slot: PartSlot };

export class PartRuleError extends Error {}

/** Shared economy rule; callers persist this result inside their existing action transaction. */
export function applyPartCommand(state: { balance: number; bodyParts?: BodyParts }, action: PartCommand, friendsCompleted = 0) {
  const parts = state.bodyParts ?? emptyBodyParts();
  if (action.type === "unequip-part") {
    if (!PART_SLOTS.includes(action.slot)) throw new PartRuleError("Slot part tidak valid.");
    const equipped = { ...parts.equipped };
    delete equipped[action.slot];
    return { balance: state.balance, bodyParts: { owned: [...parts.owned], equipped } };
  }
  if (!PART_IDS.includes(action.partId)) throw new PartRuleError("Part tidak tersedia.");
  const part = PART_CATALOG[action.partId];
  const owned = parts.owned.includes(action.partId);
  const exclusive = isReferralPart(action.partId);
  if (action.type === "buy-part") {
    if (exclusive) throw new PartRuleError("Part ini hadiah ajak teman, tidak dijual.");
    // A second request with a new receipt must not debit the same item again.
    if (owned) return { balance: state.balance, bodyParts: parts };
    if (state.balance < part.price) throw new PartRuleError("Koin belum cukup untuk part ini.");
    return { balance: state.balance - part.price, bodyParts: { owned: [...parts.owned, action.partId], equipped: { ...parts.equipped } } };
  }
  if (!owned && exclusive) {
    if (!referralRewardUnlocked("part", action.partId, friendsCompleted)) {
      throw new PartRuleError(`Ajak ${partReferralRequirement(action.partId)} teman untuk membuka part ini.`);
    }
    return { balance: state.balance, bodyParts: { owned: [...parts.owned, action.partId], equipped: { ...parts.equipped, [part.slot]: action.partId } } };
  }
  if (!owned) throw new PartRuleError("Beli part ini sebelum memasangnya.");
  return { balance: state.balance, bodyParts: { owned: [...parts.owned], equipped: { ...parts.equipped, [part.slot]: action.partId } } };
}
