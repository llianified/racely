export const CAR_MODEL_IDS = ["neo-falcon", "luna-gt"] as const;
export type CarModelId = (typeof CAR_MODEL_IDS)[number];

export const CAR_CATALOG = {
  "neo-falcon": {
    name: "Neo Falcon",
    description: "Bodi hitam bersudut, hidung tajam, dan roller bertingkat. Dibangun untuk lintasan.",
    chassis: "Super-II · Mini 4WD",
    defaultColor: "#e32636",
    colors: [
      { color: "#e32636", name: "Crimson Red" },
      { color: "#4275ff", name: "Electric Blue" },
      { color: "#f4b65b", name: "Champagne Gold" },
      { color: "#e9eef7", name: "Arctic White" },
    ],
  },
  "luna-gt": {
    name: "Luna GT",
    description: "Siluet GT lebar, kap grafit, dan sayap belakang. Elegan dengan karakter balap.",
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
