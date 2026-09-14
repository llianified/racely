import { z } from "zod";
import { RECOVERY_SECONDS } from "./race-dynamics";
import { trackLayoutAt } from "./track-layout";

/**
 * Setup mobil: gear ratio dan roller. Murni, tanpa I/O -- sama seperti
 * `lib/economy-config.ts` dan `lib/game-economy.ts`.
 *
 * Ini BUKAN upgrade. Upgrade hanya bisa naik dan selalu lebih baik; setup
 * gratis diubah kapan saja dan tidak ada satu pilihan pun yang menang di semua
 * keadaan. Itu seluruh gunanya: memaksa pemain membaca treknya, bukan membaca
 * angka paling besar.
 *
 * ## Kenapa dipecah per bagian lintasan
 *
 * Kalau setup cuma jadi satu pengali untuk seluruh putaran
 * (`lapSeconds * pengali`), pemain tidak perlu paham trek sama sekali -- cukup
 * pilih pengali terbesar, dan mekaniknya balik jadi slider upgrade dengan nama
 * baru. Maka waktu per putaran dipecah memakai geometri trek yang sungguhan:
 *
 * - **Trek lurus** (48,8% putaran): laju bekerja penuh. Gear tinggi murni
 *   untung, stabilitas tidak relevan.
 * - **Tikungan** (51,2% putaran): laju justru bekerja MELAWAN pemain. Makin
 *   cepat mobil masuk tikungan, makin besar beban yang harus ditahan grip.
 *   Kelebihan bebannya dibayar dua kali: mobil melambat di tikungan, dan
 *   sebagian tikungan berakhir dengan keluar lintasan.
 *
 * Pecahan lurus-vs-tikungan dan ketatan tiap tikungan datang dari
 * `lib/track-layout.ts`, yang memegang bentuk trek sebagai data dan dibaca
 * bersama oleh mesh 3D -- jadi bagian yang dihukum server persis bagian yang
 * terlihat sebagai tikungan di layar. Trek dengan S-curve atau hairpin cukup
 * menambah layout baru; berkas ini tidak perlu tahu bentuknya.
 *
 * ## Angka di bawah adalah hipotesis, bukan angka suci
 *
 * Seluruh modifier hidup di dua tabel di bawah dan tidak diulang di mana pun.
 * Menyetel keseimbangan berarti mengubah tabel itu saja, lalu menjalankan
 * `tests/car-setup.test.ts` yang mencetak matriks setup x trek x level dan
 * menolak kalau ada satu setup yang menang di semua keadaan.
 */

export const GEAR_IDS = ["3.5:1", "4:1", "5:1"] as const;
export type GearId = (typeof GEAR_IDS)[number];

export const ROLLER_IDS = ["light", "standard", "heavy"] as const;
export type RollerId = (typeof ROLLER_IDS)[number];

export type CarSetup = { gear: GearId; roller: RollerId };

/**
 * Setup bawaan, dan satu-satunya yang dijamin menghasilkan angka yang sama
 * persis dengan perilaku sebelum setup ada: laju x1 dan stabilitas +0 membuat
 * setiap suku di `setupLapSeconds` menyusut kembali ke `baseSeconds`.
 *
 * Migrasi memberi nilai ini ke seluruh pemain yang sudah berjalan, jadi tidak
 * ada satu pemain pun kehilangan koin hanya karena sistemnya dipasang.
 */
export const NEUTRAL_SETUP: CarSetup = { gear: "4:1", roller: "standard" };

export const carSetupSchema = z
  .object({ gear: z.enum(GEAR_IDS), roller: z.enum(ROLLER_IDS) })
  .strict();

type SetupModifier = {
  name: string;
  description: string;
  /** Pengali laju di trek lurus. >1 lebih cepat. */
  speed: number;
  /** Tambahan anggaran grip di tikungan. Negatif berarti lebih gampang lepas. */
  stability: number;
  /**
   * Pengali akselerasi keluar tikungan. Hanya gear yang punya ini -- roller
   * mengubah gigitan, bukan tenaga.
   *
   * Tanpa suku ini gear pendek tidak punya alasan hidup sama sekali: ia cuma
   * membayar laju untuk membeli stabilitas yang, pada setup netral, tidak ada
   * gunanya. Di Mini 4WD sungguhan justru inilah gunanya rasio pendek -- keluar
   * tikungan lebih galak -- dan di trek yang banyak tikungan itu menang
   * melawan laju puncak.
   */
  accel: number;
};

export const GEAR_CATALOG: Record<GearId, SetupModifier> = {
  "3.5:1": {
    name: "3.5:1 Speed",
    description:
      "Rasio panjang. Laju puncak tertinggi di trek lurus, tapi mobil masuk tikungan jauh lebih kencang.",
    speed: 1.12,
    stability: -0.35,
    accel: 0.92,
  },
  "4:1": {
    name: "4:1 Balance",
    description:
      "Rasio bawaan. Tidak unggul di mana pun, tidak kalah di mana pun.",
    speed: 1,
    stability: 0,
    accel: 1,
  },
  "5:1": {
    name: "5:1 Torque",
    description:
      "Rasio pendek. Laju puncak turun, tapi mobil jauh lebih tenang di tikungan.",
    speed: 0.92,
    stability: 0.25,
    accel: 1.25,
  },
};

export const ROLLER_CATALOG: Record<RollerId, SetupModifier> = {
  light: {
    name: "Light",
    description:
      "Roller plastik ringan. Gesekan kecil di trek lurus, gigitan paling sedikit di tikungan.",
    speed: 1.04,
    stability: -0.32,
    accel: 1,
  },
  standard: {
    name: "Standard",
    description: "Roller bawaan. Titik tengah antara Light dan Heavy.",
    speed: 1,
    stability: 0,
    accel: 1,
  },
  heavy: {
    name: "Heavy",
    description:
      "Roller bearing berat. Menahan mobil tetap di lintasan, dibayar sedikit laju.",
    speed: 0.96,
    stability: 0.3,
    accel: 1,
  },
};

/**
 * Ketatan tikungan sekarang DITURUNKAN dari geometri di `lib/track-layout.ts`,
 * bukan lagi ditulis sebagai angka per sirkuit di sini. Oval menghasilkan
 * kelengkungan 1, jadi skala layout (Jakarta 1,00 dan Midnight 0,70)
 * menghasilkan severity yang sama persis dengan daftar yang dulu ada di baris
 * ini -- dikunci `tests/track-layout.test.ts`.
 *
 * Bobot di bawah dijumlahkan supaya tepat 1: suku terakhir diambil sebagai sisa
 * alih-alih dihitung ulang, sehingga penjumlahan pecahan tidak pernah
 * menggeser hasil di digit terakhir. Invarian setup netral memakai perbandingan
 * PERSIS, jadi drift sekecil apa pun akan merahkan test -- dan memotong koin
 * pemain yang sudah berjalan.
 */
type CornerWeight = { severity: number; weight: number };
const CORNER_WEIGHT_CACHE = new Map<number, readonly CornerWeight[]>();

function cornerWeights(circuit: number): readonly CornerWeight[] {
  const cached = CORNER_WEIGHT_CACHE.get(circuit);
  if (cached) return cached;
  const layout = trackLayoutAt(circuit);
  const corners = layout.sections.filter((section) => section.severity > 0);
  const total = corners.reduce((sum, section) => sum + section.lengthFraction, 0);
  let remaining = 1;
  const weights = corners.map((section, index) => {
    const weight =
      index === corners.length - 1 ? remaining : section.lengthFraction / total;
    remaining -= weight;
    return { severity: section.severity, weight };
  });
  CORNER_WEIGHT_CACHE.set(circuit, weights);
  return weights;
}

/**
 * Grip tambahan per level ban di atas level 1.
 *
 * Sengaja KECIL. Percobaan pertama memakai 0,06 dan hasilnya mekaniknya mati:
 * di level 10 bonusnya jadi +0,54, lebih besar daripada seluruh rentang
 * stabilitas setup (-0,55 sampai +0,55), sehingga semua setup menjadi aman dan
 * pemain tinggal memilih yang paling kencang. Persis slider upgrade dengan nama
 * baru -- yang justru ingin dihindari.
 *
 * Pada 0,01 ban memberi kelonggaran yang terasa (+0,09 di level 10) tanpa
 * pernah menghapus keputusannya.
 */
export const TIRES_STABILITY_PER_LEVEL = 0.01;

/**
 * Seberapa besar kelebihan beban memperlambat tikungan, dan seberapa sering ia
 * berakhir dengan keluar lintasan. Keduanya linier terhadap kelebihan beban --
 * bukan acak -- supaya pemain bisa memperkirakan hasilnya sebelum menekan
 * apa pun.
 */
export const CORNER_OVERLOAD_SLOWDOWN = 1.6;
export const COURSE_OUT_PER_OVERLOAD = 1.4;

/**
 * Bagian waktu satu putaran yang dihabiskan menarik mobil kembali ke laju
 * penuh sesudah dua tikungan. Di situlah akselerasi gear dibayar atau dituai.
 */
export const CORNER_EXIT_SHARE = 0.3;

/** Ketatan tikungan efektif satu sirkuit, dibobot panjang. Dipakai panel & test. */
export const cornerSeverityAt = (circuit: number) =>
  cornerWeights(circuit).reduce((sum, corner) => sum + corner.severity * corner.weight, 0);

const gearOf = (setup: CarSetup) => GEAR_CATALOG[setup.gear] ?? GEAR_CATALOG["4:1"];
const rollerOf = (setup: CarSetup) =>
  ROLLER_CATALOG[setup.roller] ?? ROLLER_CATALOG.standard;

export type SetupPerformance = {
  /** Pengali laju gabungan di trek lurus. */
  speed: number;
  /** Anggaran grip total, termasuk sumbangan level ban. */
  grip: number;
  /** Beban yang diminta tikungan pada grip. */
  cornerLoad: number;
  /** Kelebihan beban di atas grip; 0 berarti setup sanggup. */
  overload: number;
  /** Pengali laju efektif di tikungan, sesudah melambat karena kelebihan beban. */
  cornerSpeed: number;
  /** Berapa kali keluar lintasan per putaran. Pecahan, deterministik. */
  courseOutsPerLap: number;
  /** Pengali akselerasi keluar tikungan; 1 berarti sama dengan bawaan. */
  accel: number;
};

/**
 * Menerjemahkan setup + level ban + sirkuit jadi angka performa, tanpa
 * menyentuh waktu maupun koin.
 *
 * Deterministik dan berbentuk tertutup -- tidak ada dadu dan tidak ada integrasi
 * per-frame. Itu bukan sekadar selera: `calculateRaceSettlement` membayar
 * sampai empat jam ketidakhadiran dalam SATU perhitungan, jadi model yang butuh
 * loop frame tidak akan pernah bisa diselesaikan server. Efek sampingnya justru
 * yang paling diinginkan: pemain bisa memprediksi hasilnya, bukan menebak.
 *
 * Level ban ikut menaikkan grip, jadi setup agresif yang tadinya mustahil
 * perlahan menjadi terjangkau -- dan `tires` akhirnya punya alasan hidup selain
 * "angkanya naik".
 */
export function setupPerformance(
  setup: CarSetup,
  tiresLevel: number,
  circuit: number,
): SetupPerformance {
  const gear = gearOf(setup);
  const roller = rollerOf(setup);
  const level = Number.isFinite(tiresLevel)
    ? Math.max(1, Math.floor(tiresLevel))
    : 1;

  const speed = gear.speed * roller.speed;
  const accel = gear.accel * roller.accel;
  const grip =
    1 +
    gear.stability +
    roller.stability +
    (level - 1) * TIRES_STABILITY_PER_LEVEL;

  // Tiap tikungan dihitung sendiri memakai ketatannya masing-masing, lalu
  // digabung dengan bobot panjangnya. Di oval kedua tikungan identik sehingga
  // hasilnya menyusut kembali ke rumus satu-tikungan yang lama -- itulah yang
  // membuat Jakarta dan Midnight tidak bergeser sedikit pun.
  const corners = cornerWeights(circuit);
  let cornerLoad = 0;
  let overload = 0;
  let cornerSpeedFactor = 0;
  let courseOutsPerLap = 0;
  for (const { severity, weight } of corners) {
    // Kuadrat, bukan linier: gaya yang harus ditahan saat menikung tumbuh
    // dengan kuadrat laju. Percobaan pertama memakai bentuk linier dan hasilnya
    // gear terpanjang menang di SEMUA keadaan -- untung di trek lurus lebih
    // besar daripada biayanya di tikungan, jadi tidak ada yang perlu dipilih.
    const load = speed * speed * severity;
    const excess = Math.max(0, load - grip);
    cornerLoad += load * weight;
    overload += excess * weight;
    // Dibobot sebagai waktu, bukan sebagai laju: bagian yang lambat memakan
    // porsi putaran yang lebih besar, dan penjumlahan kebalikannyalah yang
    // benar secara fisika.
    cornerSpeedFactor += (weight * (1 + excess * CORNER_OVERLOAD_SLOWDOWN)) / speed;
    courseOutsPerLap += excess * COURSE_OUT_PER_OVERLOAD * weight;
  }

  return {
    speed,
    grip,
    cornerLoad,
    overload,
    accel,
    cornerSpeed: cornerSpeedFactor > 0 ? 1 / cornerSpeedFactor : speed,
    courseOutsPerLap,
  };
}

/**
 * Waktu per putaran sesudah setup, dihitung per bagian lintasan.
 *
 * ```
 * lurus    = baseSeconds * F        / speed
 * tikungan = baseSeconds * (1 - F)  / cornerSpeed
 * hukuman  = courseOutsPerLap * RECOVERY_SECONDS
 * ```
 *
 * `F` adalah porsi lurus milik layout sirkuit. Keluar lintasan dibayar dengan DETIK --
 * `RECOVERY_SECONDS` yang sama dengan animasi pemulihan di arena -- dan tidak
 * pernah dengan potongan koin. Tidak ada satu koin pun yang ditambahkan maupun
 * dipotong langsung oleh berkas ini.
 *
 * Pada setup netral `speed` dan `cornerSpeed` keduanya tepat 1 dan
 * `courseOutsPerLap` tepat 0, sehingga suku lurus dan suku tikungan menjumlah
 * kembali menjadi `baseSeconds` secara persis -- bukan mendekati. Itu jaminan
 * yang membuat pemain lama tidak kehilangan apa pun, dan `tests/car-setup.test.ts`
 * menguncinya.
 */
export function setupLapSeconds(
  baseSeconds: number,
  setup: CarSetup,
  tiresLevel: number,
  circuit: number,
): number {
  const performance = setupPerformance(setup, tiresLevel, circuit);
  const layout = trackLayoutAt(circuit);
  const straightSeconds = baseSeconds * layout.straightFraction;
  // Diambil sebagai sisa, bukan dihitung ulang dari pecahan tikungan: itu yang
  // menjamin kedua suku menjumlah kembali ke `baseSeconds` secara PERSIS pada
  // setup netral.
  const cornerSeconds = baseSeconds - straightSeconds;
  // Suku keluar-tikungan: negatif untuk gear pendek (lebih galak menarik lagi),
  // positif untuk gear panjang, dan tepat nol untuk gear bawaan. Sudut belok
  // dibobot ketajamannya: membagi satu tikungan menjadi beberapa section tidak
  // boleh melipatgandakan bonus Torque. Oval menjadi patokan satu putaran penuh.
  const cornerExitDemand = layout.sections.reduce((sum, section) =>
    sum + section.severity * section.geometry.reduce((turn, primitive) =>
      turn + (primitive.kind === "arc" ? Math.abs(primitive.turn) : 0), 0), 0) / (2 * Math.PI);
  const cornerExitSeconds =
    baseSeconds *
    CORNER_EXIT_SHARE *
    cornerExitDemand *
    (1 / performance.accel - 1);
  return (
    straightSeconds / performance.speed +
    cornerSeconds / performance.cornerSpeed +
    cornerExitSeconds +
    performance.courseOutsPerLap * RECOVERY_SECONDS
  );
}

/** Bentuk tersimpan bisa berasal dari baris lama atau cookie lama; jatuh ke netral. */
export function knownCarSetup(stored: unknown): CarSetup {
  const parsed = carSetupSchema.safeParse(stored);
  return parsed.success ? parsed.data : NEUTRAL_SETUP;
}

export const isNeutralSetup = (setup: CarSetup) =>
  setup.gear === NEUTRAL_SETUP.gear && setup.roller === NEUTRAL_SETUP.roller;

export type SetupCommand = { type: "set-setup"; gear: GearId; roller: RollerId };
