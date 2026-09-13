import {
  lapScrapAt,
  levelSum,
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
 *
 * Dua field bisa bernilai `Infinity` ketika ekonomi disetel jadi tidak berbayar
 * (`hoursToMinWithdraw`, `maxOutHoursAtBase`) -- itu jawaban yang benar, bukan
 * bug. Lewat JSON `Infinity` berubah jadi `null`, dan `decimal()`/`rupiah()` di
 * `app/admin/admin-client.ts` menampilkan "—" untuk keduanya. Jangan menambah
 * pemakai baru yang berhitung langsung di atas angka ini tanpa `Number.isFinite`.
 */
export type PayoutRow = {
  label: string;
  secondsPerLap: number;
  coinsPerLap: number;
  coinsPerHour: number;
  /**
   * Sparepart tidak punya kolom rupiah, dan itu memang intinya: ia mata uang
   * progres yang tidak pernah bisa ditarik. Ditampilkan berdampingan supaya
   * terlihat berapa banyak kemajuan yang dibeli tanpa menambah kewajiban.
   */
  scrapPerLap: number;
  scrapPerHour: number;
  idrPerHour: number;
  /** Rupiah per absen sepanjang jendela offline, dibayar setengah laju. */
  idrPerIdleWindow: number;
  /**
   * Proyeksi kalau pemain hanya membuka aplikasi tiap jendela offline penuh.
   * Sudah dibatasi `dailyCoinCapPerPlayer`: tanpa itu angkanya menjanjikan
   * kewajiban yang tidak akan pernah benar-benar dicetak.
   */
  idrPerDayIdle: number;
  idrPerMonthIdle: number;
  /** Angka yang sama tanpa batas harian, untuk melihat seberapa keras batas itu menggigit. */
  idrPerDayUncapped: number;
  hoursToMinWithdraw: number;
};

function rowFor(
  e: EconomyConfig,
  label: string,
  levels: Record<(typeof UPGRADE_KEYS)[number], number>,
  circuit: number,
): PayoutRow {
  const secondsPerLap = lapSecondsAt(e, levels, false);
  // Level pemain wajib diteruskan: tanpa itu lawan mengecil ke batas bawah dan
  // proyeksi memakai hadiah P1 untuk semua orang. Goyangan harian dimatikan --
  // proyeksi harus menjawab "berapa biasanya", bukan "berapa hari ini".
  const coinsPerLap = raceRewardAt(
    { ...e, rivalDailyJitter: 0 },
    levels,
    circuit,
    false,
    levelSum(levels),
  );
  const lapsPerHour = secondsPerLap > 0 ? 3600 / secondsPerLap : 0;
  const coinsPerHour = lapsPerHour * coinsPerLap;
  const scrapPerLap = lapScrapAt(e, levels, circuit);
  const idleHours = e.offlineCapSeconds / 3600;
  const idrPerIdleWindow =
    coinsPerHour * idleHours * e.offlineRate * e.coinToIdr;
  const windowsPerDay = idleHours > 0 ? 24 / idleHours : 0;
  const idrPerDayUncapped = idrPerIdleWindow * windowsPerDay;
  // Batas harian berlaku per pemain per hari balapan, jadi ia memotong proyeksi
  // harian di sini -- bukan proyeksi per jam, yang masih boleh melampauinya
  // selama sisa jatah hari itu belum habis.
  const dailyCapIdr = e.dailyCoinCapPerPlayer * e.coinToIdr;
  const idrPerDayIdle = Math.min(idrPerDayUncapped, dailyCapIdr);

  return {
    label,
    secondsPerLap,
    coinsPerLap,
    coinsPerHour,
    scrapPerLap,
    scrapPerHour: lapsPerHour * scrapPerLap,
    idrPerHour: coinsPerHour * e.coinToIdr,
    idrPerIdleWindow,
    idrPerDayIdle,
    idrPerDayUncapped,
    idrPerMonthIdle: idrPerDayIdle * 30,
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
  /**
   * Atap kewajiban seorang pemain dalam sehari. Inilah angka yang membuat
   * seluruh proyeksi di atas bisa dipercaya: berapa pun laju putarannya,
   * seorang pemain tidak bisa mencetak lebih dari ini.
   */
  dailyCapIdrPerPlayer: number;
  /** Anggaran harian dibagi atap di atas: berapa pemain aktif yang muat. */
  playersWithinBudget: number;
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
  const dailyCapIdr = e.dailyCoinCapPerPlayer * e.coinToIdr;
  return {
    rows,
    maxOutCost,
    maxOutIdr: maxOutCost * e.coinToIdr,
    maxOutHoursAtBase: basePerHour > 0 ? maxOutCost / basePerHour : Infinity,
    freshAccountIdr: (e.startingBalance + e.starterGift) * e.coinToIdr,
    referralPairIdr:
      (e.referralRewardInviter + e.referralRewardInvitee) * e.coinToIdr,
    minWithdrawIdr: e.minWithdrawCoins * e.coinToIdr,
    dailyCapIdrPerPlayer: dailyCapIdr,
    playersWithinBudget:
      dailyCapIdr > 0 ? e.dailyEmissionBudgetIdr / dailyCapIdr : Infinity,
  };
}
