export const STARTER_CAR_IDS = ["neo-falcon", "luna-gt"] as const;
export const PREMIUM_CAR_IDS = ["bebek-sultan", "burger-oleng", "ufo-gabut"] as const;
export const CAR_MODEL_IDS = [...STARTER_CAR_IDS, ...PREMIUM_CAR_IDS] as const;
export type CarModelId = (typeof CAR_MODEL_IDS)[number];
export type PremiumCarId = (typeof PREMIUM_CAR_IDS)[number];

export const CAR_CATALOG = {
  "neo-falcon": {
    name: "Mochi Meong",
    description: "Pipi gembul, muka polos. Nyalip dulu, meong kemudian.",
    chassis: "Geng starter · Si paling meong",
    detail: "Telinga kucing & pipi mochi",
    defaultColor: "#4275ff",
    colors: [
      { color: "#4275ff", name: "Blueberry" },
      { color: "#f4b65b", name: "Kucing Oyen" },
      { color: "#e9eef7", name: "Susu Mochi" },
    ],
  },
  "luna-gt": {
    name: "Puding Oleng",
    description: "Manis di luar, ugal-ugalan di tikungan. Jangan disendok!",
    chassis: "Geng starter · Si paling manis",
    detail: "Puding montok & topping ceri",
    defaultColor: "#b9a1ed",
    colors: [
      { color: "#b9a1ed", name: "Taro" },
      { color: "#e9eef7", name: "Vanila" },
      { color: "#e6a4ba", name: "Stroberi" },
    ],
  },
  "bebek-sultan": {
    name: "Bebek Sultan",
    description: "Bukan bebek kaleng. Ini sultan yang nyasar ke lintasan.",
    chassis: "Koleksi spesial · Raja kwek",
    tagline: "Si paling sultan",
    detail: "Mahkota emas, paruh manyun & pelampung",
    defaultColor: "#ffcf48",
    colors: [
      { color: "#ffcf48", name: "Kuning Kwek" },
      { color: "#fff0cf", name: "Vanila Sultan" },
      { color: "#a5e5ce", name: "Pandan" },
    ],
  },
  "burger-oleng": {
    name: "Burger Oleng",
    description: "Double patty, zero rem. Pesananmu sedang menyalip!",
    chassis: "Koleksi spesial · Extra ngaco",
    tagline: "Si paling lapar",
    detail: "Roti wijen, double patty & keju meleleh",
    defaultColor: "#eaae64",
    colors: [
      { color: "#eaae64", name: "Original" },
      { color: "#e6a4ba", name: "Roti Pink" },
      { color: "#b9a1ed", name: "Roti Taro" },
    ],
  },
  "ufo-gabut": {
    name: "UFO Gabut",
    description: "Jauh-jauh dari galaksi lain, cuma mau ikut balapan.",
    chassis: "Koleksi spesial · Alien magang",
    tagline: "Si paling gabut",
    detail: "Pilot alien, kubah kristal & cincin orbit",
    defaultColor: "#a5e5ce",
    colors: [
      { color: "#a5e5ce", name: "Mint Orbit" },
      { color: "#b9a1ed", name: "Lilac Kosmik" },
      { color: "#8db5ff", name: "Biru Galaksi" },
    ],
  },
} as const;

export type CarColor = (typeof CAR_CATALOG)[CarModelId]["colors"][number]["color"];

export function isPremiumCar(model: CarModelId): model is PremiumCarId {
  return (PREMIUM_CAR_IDS as readonly string[]).includes(model);
}

export function isCarColor(model: CarModelId, color: string): color is CarColor {
  return CAR_CATALOG[model].colors.some((choice) => choice.color === color);
}
