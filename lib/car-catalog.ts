import { isReferralReward, referralRequirement, referralRewardUnlocked } from "./referral-rewards";

export const CAR_MODEL_IDS = ["neo-falcon", "luna-gt", "phantom-x"] as const;
export type CarModelId = (typeof CAR_MODEL_IDS)[number];

/**
 * Mobil hadiah ajakan (`REFERRAL_MILESTONES`): tidak muncul di layar pemilihan
 * mobil pertama dan tidak bisa dibeli. Satu-satunya jalan masuknya adalah
 * `select-car` setelah ambang teman tercapai, lihat `lib/game-server.ts`.
 */
export const isReferralCar = (id: CarModelId) => isReferralReward("car", id);
export const carReferralRequirement = (id: CarModelId) => referralRequirement("car", id);
/** Mobil yang boleh dipilih saat onboarding -- tanpa hadiah ajakan. */
export const STARTER_CAR_IDS = CAR_MODEL_IDS.filter((id) => !isReferralCar(id));

/**
 * Mobil yang boleh dipakai pemain: mobil starter pilihannya sendiri plus setiap
 * hadiah ajakan yang ambangnya sudah tercapai. `starter` `null` berarti belum
 * pernah memilih, jadi semua starter masih terbuka. Murni supaya server, mode
 * preview, dan garasi membaca aturan yang sama.
 */
export function switchableCars(starter: CarModelId | null, friendsCompleted: number): CarModelId[] {
  const unlocked = CAR_MODEL_IDS.filter((id) => referralRewardUnlocked("car", id, friendsCompleted));
  return starter === null ? [...STARTER_CAR_IDS, ...unlocked] : [starter, ...unlocked];
}

/** True kalau `to` sah dipakai pemain dengan starter dan jumlah ajakan itu. */
export const canSwitchCar = (to: CarModelId, starter: CarModelId | null, friendsCompleted: number) =>
  switchableCars(starter, friendsCompleted).includes(to);

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
  "phantom-x": {
    name: "Phantom X",
    description: "Prototipe Fable dengan kanopi ungu, aero bertingkat, dan aksen emas. Bukan untuk dibeli. Untuk diraih.",
    chassis: "Fable · X-Spec · Mini 4WD",
    defaultColor: "#14161f",
    colors: [
      { color: "#14161f", name: "Phantom Black" },
      { color: "#7a3cff", name: "Ultraviolet" },
      { color: "#ffce00", name: "Racely Gold" },
    ],
  },
} as const;

export type CarColor = (typeof CAR_CATALOG)[CarModelId]["colors"][number]["color"];

export function isCarColor(model: CarModelId, color: string): color is CarColor {
  return CAR_CATALOG[model].colors.some((choice) => choice.color === color);
}
