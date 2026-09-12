import {
  lapSecondsAt,
  raceRewardAt,
  upgradeCostAt,
  UPGRADE_KEYS,
  type EconomyConfig,
} from "./economy-config";

/**
 * Config ekonomi tidak memberi tahu apa pun soal biayanya. `lapRewardBase: 0.05`
 * terlihat kecil sampai dikalikan 3.600 detik, jumlah pemain, dan
 * `coinToIdr` -- dan setiap koin yang dicetak adalah kewajiban rupiah yang
 * nyata.
 *
 * Modul ini menerjemahkan satu set config jadi angka rupiah yang bisa dibaca,
 * dipakai panel admin untuk memperlihatkan dampak sebuah perubahan SEBELUM
 * disimpan. Murni, jadi ikut jalan di client sambil form diisi.
 */
export type PayoutRow = {
  label: string;
  secondsPerLap: number;
  coinsPerLap: number;
  coinsPerHour: number;
  idrPerHour: number;
  /** Rupiah per absen sepanjang jendela offline, dibayar setengah laju. */
  idrPerIdleWindow: number;
  /** Proyeksi kalau pemain hanya membuka aplikasi tiap jendela offline penuh. */
  idrPerDayIdle: number;
  idrPerMonthIdle: number;
  hoursToMinWithdraw: number;
};

function rowFor(
  e: EconomyConfig,
  label: string,
  levels: Record<(typeof UPGRADE_KEYS)[number], number>,
  circuit: number,
): PayoutRow {
  const secondsPerLap = lapSecondsAt(e, levels, false);
  const coinsPerLap = raceRewardAt(e, levels, circuit, false);
  const coinsPerHour =
    secondsPerLap > 0 ? (3600 / secondsPerLap) * coinsPerLap : 0;
  const idleHours = e.offlineCapSeconds / 3600;
  const idrPerIdleWindow =
    coinsPerHour * idleHours * e.offlineRate * e.coinToIdr;
  const windowsPerDay = idleHours > 0 ? 24 / idleHours : 0;

  return {
    label,
    secondsPerLap,
    coinsPerLap,
    coinsPerHour,
    idrPerHour: coinsPerHour * e.coinToIdr,
    idrPerIdleWindow,
    idrPerDayIdle: idrPerIdleWindow * windowsPerDay,
    idrPerMonthIdle: idrPerIdleWindow * windowsPerDay * 30,
    hoursToMinWithdraw:
      coinsPerHour > 0 ? e.minWithdrawCoins / coinsPerHour : Infinity,
  };
}

export type EconomyProjection = {
  rows: PayoutRow[];
  /** Koin untuk menaikkan semua upgrade dari level 1 ke level maksimum. */
  maxOutCost: number;
  maxOutIdr: number;
  /** Jam idle di level 1 untuk membiayai max-out itu. */
  maxOutHoursAtBase: number;
  /** Nilai rupiah sebuah akun baru sebelum bermain sedetik pun. */
  freshAccountIdr: number;
  /** Rupiah yang dibayarkan sepasang pengajak + yang diajak saat capaian. */
  referralPairIdr: number;
  minWithdrawIdr: number;
};

export function projectEconomy(e: EconomyConfig): EconomyProjection {
  const base = { engine: 1, tires: 1, battery: 1 };
  const max = {
    engine: e.maxUpgradeLevel,
    tires: e.maxUpgradeLevel,
    battery: e.maxUpgradeLevel,
  };
  const rows = [
    rowFor(e, "Level 1, sirkuit 1", base, 0),
    rowFor(e, "Upgrade maksimum, sirkuit 2", max, 1),
  ];

  let maxOutCost = 0;
  for (const key of UPGRADE_KEYS) {
    for (let level = 1; level < e.maxUpgradeLevel; level += 1) {
      maxOutCost += upgradeCostAt(e, key, level);
    }
  }

  const basePerHour = rows[0].coinsPerHour;
  return {
    rows,
    maxOutCost,
    maxOutIdr: maxOutCost * e.coinToIdr,
    maxOutHoursAtBase: basePerHour > 0 ? maxOutCost / basePerHour : Infinity,
    freshAccountIdr: (e.startingBalance + e.starterGift) * e.coinToIdr,
    referralPairIdr:
      (e.referralRewardInviter + e.referralRewardInvitee) * e.coinToIdr,
    minWithdrawIdr: e.minWithdrawCoins * e.coinToIdr,
  };
}
