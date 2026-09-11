export const CAR_MODEL_IDS = ["neo-falcon", "luna-gt"] as const;
export type CarModelId = (typeof CAR_MODEL_IDS)[number];

export const CAR_CATALOG = {
  "neo-falcon": {
    name: "Neo Falcon",
    description: "Garis tegas, sayap lebar. Siap melesat di setiap tikungan.",
    chassis: "Super-II · Mini 4WD",
    defaultColor: "#4275ff",
    colors: [
      { color: "#4275ff", name: "Electric Blue" },
      { color: "#f4b65b", name: "Champagne Gold" },
      { color: "#e9eef7", name: "Arctic White" },
    ],
  },
  "luna-gt": {
    name: "Luna GT",
    description: "Bodi membulat, siluet elegan. Tetap sporty di lintasan.",
    chassis: "GT · Mini 4WD",
    defaultColor: "#b9a1ed",
    colors: [
      { color: "#b9a1ed", name: "Lavender" },
      { color: "#e9eef7", name: "Pearl" },
      { color: "#e6a4ba", name: "Rose" },
    ],
  },
} as const;

export type CarColor = (typeof CAR_CATALOG)[CarModelId]["colors"][number]["color"];

export function isCarColor(model: CarModelId, color: string): color is CarColor {
  return CAR_CATALOG[model].colors.some((choice) => choice.color === color);
}
