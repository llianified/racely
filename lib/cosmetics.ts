import type { CarModelId } from "./car-catalog";

export const COSMETIC_SLOTS = ["livery", "wheel", "spoiler"] as const;
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];
export type EquippedCosmetics = Partial<Record<CosmeticSlot, string>>;
export type CosmeticItem = {
  id: string;
  slot: CosmeticSlot;
  name: string;
  description: string;
  price: number;
  model: CarModelId | "all";
};

export const COSMETICS = [
  { id: "gold-line", slot: "livery", name: "Gold Line", description: "Aksen grafis emas pada bodi dan sayap bawaan.", price: 25, model: "all" },
  { id: "falcon-ember", slot: "livery", name: "Falcon Ember", description: "Grafis merah menyala khusus Neo Falcon.", price: 750, model: "neo-falcon" },
  { id: "luna-aurora", slot: "livery", name: "Luna Aurora", description: "Aksen mint berkilau khusus Luna GT.", price: 750, model: "luna-gt" },
  { id: "gold-forged", slot: "wheel", name: "Gold Forged", description: "Velg palang emas dengan cincin tepi mengilap.", price: 1250, model: "all" },
  { id: "chrome-disc", slot: "wheel", name: "Chrome Disc", description: "Penutup velg solid berlapis krom perak.", price: 2000, model: "all" },
  { id: "gt-wing", slot: "spoiler", name: "GT Wing", description: "Sayap lebar hitam dengan endplate emas.", price: 2500, model: "all" },
  { id: "falcon-twin", slot: "spoiler", name: "Falcon Twin", description: "Sayap dua tingkat dengan endplate merah.", price: 3500, model: "neo-falcon" },
  { id: "luna-ducktail", slot: "spoiler", name: "Luna Ducktail", description: "Sayap rendah melengkung dengan aksen mint.", price: 3500, model: "luna-gt" },
] as const satisfies readonly CosmeticItem[];

export const COSMETIC_SLOT_LABELS: Record<CosmeticSlot, string> = {
  livery: "Livery", wheel: "Velg", spoiler: "Spoiler",
};

export const getCosmetic = (id: string) => COSMETICS.find(item => item.id === id);
export const isCosmeticCompatible = (item: CosmeticItem, model: CarModelId) => item.model === "all" || item.model === model;
export const compatibleCosmetics = (model: CarModelId) => COSMETICS.filter(item => isCosmeticCompatible(item, model));
export const availableCosmetics = (model: CarModelId, owned: readonly string[]) => compatibleCosmetics(model).filter(item => !owned.includes(item.id));

export class CosmeticRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CosmeticRuleError";
  }
}

function requireCompatibleItem(id: string, model: CarModelId) {
  const item = getCosmetic(id);
  if (!item) throw new CosmeticRuleError("Kosmetik tidak ditemukan.");
  if (!isCosmeticCompatible(item, model)) throw new CosmeticRuleError("Kosmetik ini tidak cocok dengan mobilmu.");
  return item;
}

export function buyCosmetic(balance: number, owned: readonly string[], model: CarModelId, id: string) {
  const item = requireCompatibleItem(id, model);
  if (owned.includes(id)) throw new CosmeticRuleError("Kosmetik ini sudah dimiliki.");
  if (balance < item.price) throw new CosmeticRuleError("Koin belum cukup untuk kosmetik ini.");
  return { balance: balance - item.price, ownedCosmetics: [...owned, id] };
}

export function equipCosmetic(owned: readonly string[], equipped: EquippedCosmetics, model: CarModelId, slot: CosmeticSlot, id: string | null): EquippedCosmetics {
  if (!COSMETIC_SLOTS.includes(slot)) throw new CosmeticRuleError("Slot kosmetik tidak valid.");
  const next = { ...equipped };
  if (id === null) {
    delete next[slot];
    return next;
  }
  const item = requireCompatibleItem(id, model);
  if (item.slot !== slot) throw new CosmeticRuleError("Kosmetik tidak sesuai dengan slot ini.");
  if (!owned.includes(id)) throw new CosmeticRuleError("Beli kosmetik ini sebelum memasangnya.");
  return { ...next, [slot]: id };
}

export function visibleCosmetics(model: CarModelId, equipped: EquippedCosmetics): EquippedCosmetics {
  return Object.fromEntries(COSMETIC_SLOTS.flatMap(slot => {
    const id = equipped[slot];
    const item = id ? getCosmetic(id) : undefined;
    return item && item.slot === slot && isCosmeticCompatible(item, model) ? [[slot, id]] : [];
  }));
}
