import { z } from "zod";
import { cosmeticPriceAt, type EconomyConfig } from "./economy-config";
import { isReferralReward, referralRequirement, referralRewardUnlocked } from "./referral-rewards";

export const PAINT_IDS = ["jade", "pearl", "champagne", "ember", "aurora"] as const;
export type PaintId = (typeof PAINT_IDS)[number];
/**
 * `tier` menentukan harga lewat `cosmeticPriceAt`. Cat hadiah ajakan (lihat
 * `REFERRAL_MILESTONES`) tetap punya tier untuk urutan tampilan, tapi tidak
 * pernah dijual: `applyPaintCommand` menolak `buy-paint` untuknya.
 */
export const PAINT_CATALOG = {
  jade: { name: "Jade Circuit", color: "#368c76", tier: 1 },
  pearl: { name: "Pearl Legend", color: "#e7e1d5", tier: 2 },
  champagne: { name: "Champagne Champion", color: "#c8a45c", tier: 3 },
  ember: { name: "Ember Rush", color: "#ff6a2b", tier: 4 },
  aurora: { name: "Aurora Prism", color: "#3fd8c2", tier: 5 },
} as const;
export const isReferralPaint = (id: PaintId) => isReferralReward("paint", id);
export const paintReferralRequirement = (id: PaintId) => referralRequirement("paint", id);
export const ownedPaintsSchema = z.array(z.enum(PAINT_IDS)).max(PAINT_IDS.length).refine(items => new Set(items).size === items.length);
export type PaintCommand = { type: "buy-paint"; paintId: PaintId } | { type: "equip-paint"; paintId: PaintId };
export function applyPaintCommand(
  state: { balance: number; color: string; ownedPaints?: PaintId[] },
  action: PaintCommand,
  economy: EconomyConfig,
  friendsCompleted = 0,
) {
  if (!PAINT_IDS.includes(action.paintId)) throw new Error("Cat tidak tersedia.");
  const ownedPaints = state.ownedPaints ?? [];
  const paint = PAINT_CATALOG[action.paintId];
  const owned = ownedPaints.includes(action.paintId);
  const exclusive = isReferralPaint(action.paintId);
  if (action.type === "equip-paint") {
    if (!owned && exclusive) {
      if (!referralRewardUnlocked("paint", action.paintId, friendsCompleted)) {
        throw new Error(`Ajak ${paintReferralRequirement(action.paintId)} teman untuk membuka cat ini.`);
      }
      // Hadiah masuk koleksi saat pertama dipasang, gratis, tanpa menyentuh saldo.
      return { balance: state.balance, ownedPaints: [...ownedPaints, action.paintId], color: paint.color };
    }
    if (!owned) throw new Error("Beli cat ini sebelum memasangnya.");
    return { balance: state.balance, ownedPaints, color: paint.color };
  }
  if (exclusive) throw new Error("Cat ini hadiah ajak teman, tidak dijual.");
  if (owned) return { balance: state.balance, ownedPaints, color: state.color };
  const price = cosmeticPriceAt(economy, paint.tier);
  if (state.balance < price) throw new Error("Koin belum cukup untuk cat ini.");
  return { balance: state.balance - price, ownedPaints: [...ownedPaints, action.paintId], color: state.color };
}
