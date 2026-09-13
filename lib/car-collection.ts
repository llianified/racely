import { CAR_CATALOG, isPremiumCar, type CarModelId } from "./car-catalog";
import { carPriceAt, type EconomyConfig } from "./economy-config";

export type CarCommand = { type: "buy-car" | "equip-car"; model: CarModelId };

type CarInventory = {
  balance: number;
  ownedCars?: CarModelId[];
  carModel: CarModelId | null;
  color: string;
};

export class CarRuleError extends Error {}

export function ownedCarIds(owned: CarModelId[] | undefined, current: CarModelId | null): CarModelId[] {
  return [...new Set([...(owned ?? []), ...(current ? [current] : [])])];
}

export function applyCarCommand(state: CarInventory, action: CarCommand, economy: EconomyConfig): CarInventory {
  if (!state.carModel) throw new CarRuleError("Pilih mobilmu sebelum mulai bermain.");
  const ownedCars = ownedCarIds(state.ownedCars, state.carModel);
  const owned = ownedCars.includes(action.model);
  if (action.type === "buy-car") {
    if (!isPremiumCar(action.model)) throw new CarRuleError("Mobil starter tidak dijual.");
    // Kepemilikan, bukan requestId saja, mencegah pembelian ganda pada retry baru.
    if (owned) return { ...state, ownedCars };
    const price = carPriceAt(economy, action.model);
    if (state.balance < price) throw new CarRuleError("Koin belum cukup untuk mobil ini.");
    return {
      balance: state.balance - price,
      ownedCars: [...ownedCars, action.model],
      carModel: action.model,
      color: CAR_CATALOG[action.model].defaultColor,
    };
  }
  if (!owned) throw new CarRuleError("Beli mobil ini terlebih dahulu.");
  return {
    ...state,
    ownedCars,
    carModel: action.model,
    color: state.carModel === action.model ? state.color : CAR_CATALOG[action.model].defaultColor,
  };
}
