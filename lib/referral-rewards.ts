/**
 * Milestone ajak teman dengan hadiah non-rupiah. Tidak ada koin di sini dan
 * tidak ada angka ekonomi yang bisa disetel dari /admin: hadiahnya adalah
 * item kosmetik yang TIDAK dijual, jadi kewajiban rupiahnya nol.
 *
 * "Teman" dihitung dari ajakan yang tuntas (`referral_paid_at` terisi), metrik
 * yang sama dengan leaderboard ajakan -- bukan dari `referred_by` mentah, supaya
 * akun yang sekadar membuka link tidak membuka hadiah.
 *
 * Aturannya murni dan tanpa I/O supaya server, mode preview, dan UI membaca
 * satu sumber. Item eksklusif tidak pernah masuk `ownedPaints`/`bodyParts.owned`
 * lewat pembelian; ia masuk saat pertama kali dipasang setelah ambangnya
 * tercapai, dan ambangnya tidak bisa turun karena ajakan tuntas tidak pernah
 * dibatalkan.
 */
export type ReferralRewardKind = "paint" | "part" | "car";

export type ReferralMilestone = {
  friends: number;
  kind: ReferralRewardKind;
  /** Id di katalog masing-masing: `PaintId`, `PartId`, atau `CarModelId`. */
  id: string;
  title: string;
  note: string;
};

export const REFERRAL_MILESTONES: readonly ReferralMilestone[] = [
  { friends: 1, kind: "paint", id: "ember", title: "Cat Ember Rush", note: "Oranye membara yang tidak ada di toko cat." },
  { friends: 3, kind: "part", id: "neon-fin", title: "Neon Fin Splitter", note: "Splitter depan bersirip emas, khusus pengajak." },
  { friends: 5, kind: "paint", id: "aurora", title: "Cat Aurora Prism", note: "Hijau-biru aurora. Terlihat dari tribun mana pun." },
  { friends: 10, kind: "part", id: "crown-wing", title: "Crown Wing", note: "Sayap GT berlapis emas. Tidak dijual, hanya diberikan." },
  { friends: 25, kind: "car", id: "phantom-x", title: "Phantom X", note: "Prototipe Fable. Kanopi ungu, aero bertingkat, dan detail emas yang tidak dimiliki mobil starter." },
];

export const REFERRAL_MAX_FRIENDS = REFERRAL_MILESTONES[REFERRAL_MILESTONES.length - 1].friends;

/** Ambang teman untuk item eksklusif; `null` kalau item itu bukan hadiah ajakan. */
export function referralRequirement(kind: ReferralRewardKind, id: string): number | null {
  return REFERRAL_MILESTONES.find((m) => m.kind === kind && m.id === id)?.friends ?? null;
}

export const isReferralReward = (kind: ReferralRewardKind, id: string) =>
  referralRequirement(kind, id) !== null;

/** True kalau item itu hadiah ajakan DAN pemain sudah memenuhi ambangnya. */
export function referralRewardUnlocked(kind: ReferralRewardKind, id: string, friendsCompleted: number) {
  const needed = referralRequirement(kind, id);
  return needed !== null && friendsCompleted >= needed;
}

/** Milestone berikutnya yang belum tercapai; `null` kalau semuanya sudah terbuka. */
export function nextReferralMilestone(friendsCompleted: number) {
  return REFERRAL_MILESTONES.find((m) => m.friends > friendsCompleted) ?? null;
}
