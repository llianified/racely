import { z } from "zod";
import { cosmeticPriceAt, type EconomyConfig } from "./economy-config";

export const PAINT_IDS = ["jade", "pearl", "champagne"] as const;
export type PaintId = (typeof PAINT_IDS)[number];
export const PAINT_CATALOG = {
  jade: { name: "Jade Circuit", color: "#368c76", tier: 1 },
  pearl: { name: "Pearl Legend", color: "#e7e1d5", tier: 2 },
  champagne: { name: "Champagne Champion", color: "#c8a45c", tier: 3 },
} as const;
export const ownedPaintsSchema = z.array(z.enum(PAINT_IDS)).max(PAINT_IDS.length).refine(items => new Set(items).size === items.length);
export type PaintCommand = { type: "buy-paint"; paintId: PaintId } | { type: "equip-paint"; paintId: PaintId };
export function applyPaintCommand(state: { balance: number; color: string; ownedPaints?: PaintId[] }, action: PaintCommand, economy: EconomyConfig) {
  if (!PAINT_IDS.includes(action.paintId)) throw new Error("Cat tidak tersedia.");
  const ownedPaints = state.ownedPaints ?? [];
  const paint = PAINT_CATALOG[action.paintId];
  const owned = ownedPaints.includes(action.paintId);
  if (action.type === "equip-paint") {
    if (!owned) throw new Error("Beli cat ini sebelum memasangnya.");
    return { balance: state.balance, ownedPaints, color: paint.color };
  }
  if (owned) return { balance: state.balance, ownedPaints, color: state.color };
  const price = cosmeticPriceAt(economy, paint.tier);
  if (state.balance < price) throw new Error("Koin belum cukup untuk cat ini.");
  return { balance: state.balance - price, ownedPaints: [...ownedPaints, action.paintId], color: state.color };
}
