/**
 * Bentuk lintasan sebagai DATA, dibaca bersama oleh model server dan mesh 3D.
 *
 * Sebelum berkas ini, bentuk trek tertanam sebagai rumus di tiga tempat yang
 * semuanya mengasumsikan oval: `STRAIGHT_LAP_FRACTION`, `trackCornerProgress`,
 * dan satu angka ketatan tikungan per sirkuit. Selama asumsi itu berlaku,
 * sirkuit hanya bisa berbeda warna -- dan trek dengan S-curve atau hairpin akan
 * membuat server menghukum bagian lintasan yang di layar tampak lurus. Untuk
 * Gaspol itu berarti koin sungguhan.
 *
 * Primitifnya sengaja sama dengan `lib/technical-track.ts` milik prototipe
 * visual: `line` dan `arc` dengan `turn` bertanda. Bentuk itu bisa dikomposisi,
 * jadi S-curve cukup dua arc berlawanan tanpa field tambahan, dan sebuah loop
 * bisa diperiksa benar-benar tertutup.
 *
 * Murni, tanpa I/O.
 */

/** Setengah panjang trek lurus oval, dan radius racing line pemain. */
export const TRACK_HALF = 3.35;
export const PLAYER_RADIUS = 2.24;

export type TrackPrimitive =
  | { readonly kind: "line"; readonly length: number }
  | { readonly kind: "arc"; readonly radius: number; readonly turn: number };

export type TrackSectionKind = "straight" | "corner" | "s-curve" | "hairpin";

export type TrackSectionInput = {
  readonly id: string;
  readonly kind: TrackSectionKind;
  readonly geometry: readonly TrackPrimitive[];
};

export type TrackSection = TrackSectionInput & {
  /** Porsi satu putaran; seluruh section dalam satu layout berjumlah 1. */
  readonly lengthFraction: number;
  /**
   * Beban yang diminta section ini dari grip. 0 untuk trek lurus.
   *
   * DITURUNKAN dari geometri, bukan angka yang disetel tangan: tikungan yang
   * lebih ketat otomatis lebih menuntut. Itu yang membuat hairpin tidak perlu
   * dikalibrasi ulang setiap kali radiusnya diubah.
   */
  readonly severity: number;
};

export type TrackLayout = {
  readonly id: string;
  readonly sections: readonly TrackSection[];
  readonly totalLength: number;
  /** Porsi putaran yang severity-nya nol. Menggantikan STRAIGHT_LAP_FRACTION. */
  readonly straightFraction: number;
  /** Banyaknya section menikung -- menentukan berapa kali mobil keluar tikungan. */
  readonly cornerCount: number;
};

export const primitiveLength = (primitive: TrackPrimitive) =>
  primitive.kind === "line"
    ? primitive.length
    : primitive.radius * Math.abs(primitive.turn);

/**
 * Kelengkungan rata-rata sebuah section, ditimbang panjang, lalu dinormalkan
 * terhadap radius tikungan oval. Oval menghasilkan tepat 1, jadi skala sirkuit
 * yang berlaku sekarang (Jakarta 1,00 dan Midnight 0,70) terbaca apa adanya.
 */
function meanCurvature(geometry: readonly TrackPrimitive[]) {
  let length = 0;
  let curvature = 0;
  for (const primitive of geometry) {
    const span = primitiveLength(primitive);
    length += span;
    if (primitive.kind === "arc" && primitive.radius > 0) {
      curvature += span / primitive.radius;
    }
  }
  return length > 0 ? (curvature / length) * PLAYER_RADIUS : 0;
}

export function buildTrackLayout(
  id: string,
  sections: readonly TrackSectionInput[],
  severityScale: number,
): TrackLayout {
  const lengths = sections.map((section) =>
    section.geometry.reduce((sum, primitive) => sum + primitiveLength(primitive), 0),
  );
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  const built = sections.map((section, index): TrackSection => {
    const severity = severityScale * meanCurvature(section.geometry);
    return {
      ...section,
      lengthFraction: totalLength > 0 ? lengths[index] / totalLength : 0,
      severity,
    };
  });
  return {
    id,
    sections: built,
    totalLength,
    straightFraction: built.reduce(
      (sum, section) => sum + (section.severity > 0 ? 0 : section.lengthFraction),
      0,
    ),
    cornerCount: built.filter((section) => section.severity > 0).length,
  };
}

/**
 * Oval Racely, dinyatakan dalam primitif yang sama.
 *
 * Urutannya -- lurus, tikungan, lurus, tikungan, dimulai dari posisi 0 --
 * sengaja mengikuti `trackCornerProgress` di `lib/race-dynamics.ts` persis,
 * supaya kedua pembaca sepakat di mana tikungannya berada. `straightFraction`
 * yang keluar dari sini identik dengan `STRAIGHT_LAP_FRACTION`; itu dikunci
 * `tests/track-layout.test.ts`.
 */
const OVAL_SECTIONS: readonly TrackSectionInput[] = [
  { id: "back-straight", kind: "straight", geometry: [{ kind: "line", length: TRACK_HALF * 2 }] },
  { id: "turn-1", kind: "corner", geometry: [{ kind: "arc", radius: PLAYER_RADIUS, turn: Math.PI }] },
  { id: "front-straight", kind: "straight", geometry: [{ kind: "line", length: TRACK_HALF * 2 }] },
  { id: "turn-2", kind: "corner", geometry: [{ kind: "arc", radius: PLAYER_RADIUS, turn: Math.PI }] },
];

/**
 * Midnight berbentuk segitiga membulat: tiga sisi sama panjang dan tiga busur
 * 120 derajat menutup posisi sekaligus arah. Radius tetap selebar oval supaya
 * karakter tikungannya tetap ramah, tetapi jendela Gaspol mengikuti tiga lurus.
 */
const MIDNIGHT_SECTIONS: readonly TrackSectionInput[] = [
  { id: "start-straight", kind: "straight", geometry: [{ kind: "line", length: TRACK_HALF * 2 }] },
  { id: "turn-1", kind: "corner", geometry: [{ kind: "arc", radius: PLAYER_RADIUS, turn: Math.PI * 2 / 3 }] },
  { id: "skyline-straight", kind: "straight", geometry: [{ kind: "line", length: TRACK_HALF * 2 }] },
  { id: "turn-2", kind: "corner", geometry: [{ kind: "arc", radius: PLAYER_RADIUS, turn: Math.PI * 2 / 3 }] },
  { id: "return-straight", kind: "straight", geometry: [{ kind: "line", length: TRACK_HALF * 2 }] },
  { id: "turn-3", kind: "corner", geometry: [{ kind: "arc", radius: PLAYER_RADIUS, turn: Math.PI * 2 / 3 }] },
];
/**
 * Sirkuit ketiga: trek teknikal yang benar-benar berbentuk lain.
 *
 * Geometrinya diambil dari prototipe visual di `lib/technical-track.ts` supaya
 * arena dan model server menggambarkan lintasan yang sama. Jumlah beloknya
 * 180 + 60 - 60 + 180 = 360 derajat, dan trek lurus terakhir menutup posisinya
 * -- `isClosedLoop` menguji keduanya.
 *
 * Di sinilah hairpin beradius 1,4 memberi severity 1,60. Di atas 1 berarti
 * setup NETRAL pun kelebihan beban: hal yang terlarang di Jakarta dan Midnight
 * karena akan memotong penghasilan pemain yang sudah berjalan, tapi sah di
 * sirkuit baru yang belum dihuni siapa pun. Justru itu gunanya -- di trek ini
 * stabilitas akhirnya bernilai dengan sendirinya, bukan sekadar pemungkin gear
 * panjang.
 */
const TECHNICAL_SECTIONS: readonly TrackSectionInput[] = [
  { id: "launch", kind: "straight", geometry: [{ kind: "line", length: 8 }] },
  {
    id: "double-chicane",
    kind: "s-curve",
    geometry: [
      { kind: "arc", radius: 4, turn: Math.PI / 6 },
      { kind: "arc", radius: 4, turn: -Math.PI / 6 },
      { kind: "arc", radius: 4, turn: -Math.PI / 6 },
      { kind: "arc", radius: 4, turn: Math.PI / 6 },
    ],
  },
  { id: "bridge-straight", kind: "straight", geometry: [{ kind: "line", length: 8 }] },
  { id: "technical", kind: "corner", geometry: [{ kind: "arc", radius: 3.4, turn: Math.PI }] },
  {
    id: "s-curve",
    kind: "s-curve",
    geometry: [
      { kind: "arc", radius: 4, turn: Math.PI / 3 },
      { kind: "arc", radius: 4, turn: -Math.PI / 3 },
    ],
  },
  { id: "obstacle-straight", kind: "straight", geometry: [{ kind: "line", length: 19 }] },
  { id: "hairpin", kind: "hairpin", geometry: [{ kind: "arc", radius: 1.4, turn: Math.PI }] },
  // S-curve menggeser X sebesar 8 sin(60 derajat); lurus ini menutup posisi DAN arah.
  // Tambahan 19 unit di launch diimbangi obstacle-straight sebelum hairpin.
  { id: "return", kind: "straight", geometry: [{ kind: "line", length: 8 * Math.sin(Math.PI / 3) - 5 }] },
];

export const TRACK_LAYOUTS: readonly TrackLayout[] = [
  buildTrackLayout("jakarta", OVAL_SECTIONS, 1),
  buildTrackLayout("midnight", MIDNIGHT_SECTIONS, 0.7),
  buildTrackLayout("apex", TECHNICAL_SECTIONS, 1),
];

/** Nama tampilan per sirkuit. Bukan angka ekonomi, jadi tetap di kode. */
export const CIRCUIT_NAMES = ["Jakarta Raceway", "Midnight Speedway", "Apex Circuit"] as const;
export const LAST_CIRCUIT = TRACK_LAYOUTS.length - 1;
export const circuitName = (circuit: number) => CIRCUIT_NAMES[circuit] ?? CIRCUIT_NAMES[0];

export const trackLayoutAt = (circuit: number) =>
  TRACK_LAYOUTS[circuit] ?? TRACK_LAYOUTS[0];

export type TrackPose = { x: number; z: number; heading: number };

/** Maju sepanjang satu primitif. Heading 0 menghadap +X; turn positif ke +Z. */
export function advanceTrackPose(
  start: TrackPose,
  primitive: TrackPrimitive,
  fraction: number,
): TrackPose {
  const t = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  if (primitive.kind === "line") {
    return {
      x: start.x + Math.cos(start.heading) * primitive.length * t,
      z: start.z + Math.sin(start.heading) * primitive.length * t,
      heading: start.heading,
    };
  }
  const heading = start.heading + primitive.turn * t;
  const signed = Math.sign(primitive.turn) * primitive.radius;
  return {
    x: start.x + signed * (Math.sin(heading) - Math.sin(start.heading)),
    z: start.z - signed * (Math.cos(heading) - Math.cos(start.heading)),
    heading,
  };
}

/**
 * Apakah sebuah layout benar-benar kembali ke titik dan arah awalnya. Layout
 * yang tidak tertutup berarti mesh dan model server akan mulai menyimpang
 * sedikit demi sedikit setiap putaran.
 */
export function isClosedLoop(layout: TrackLayout, tolerance = 1e-9) {
  let pose: TrackPose = { x: 0, z: 0, heading: 0 };
  for (const section of layout.sections) {
    for (const primitive of section.geometry) pose = advanceTrackPose(pose, primitive, 1);
  }
  const turns = pose.heading / (Math.PI * 2);
  return (
    Math.abs(pose.x) <= tolerance &&
    Math.abs(pose.z) <= tolerance &&
    Math.abs(turns - Math.round(turns)) <= tolerance &&
    Math.round(turns) !== 0
  );
}

export type TrackPosition = {
  section: TrackSection;
  /** Posisi di dalam section, 0 di mulutnya dan 1 di ujungnya. */
  sectionProgress: number;
};

/** Section yang sedang ditempati pada posisi lintasan ini. Membungkus otomatis. */
export function trackPositionAt(progress: number, layout: TrackLayout): TrackPosition {
  const wrapped = Number.isFinite(progress) ? ((progress % 1) + 1) % 1 : 0;
  let travelled = 0;
  for (const section of layout.sections) {
    const next = travelled + section.lengthFraction;
    if (wrapped < next || section === layout.sections[layout.sections.length - 1]) {
      return {
        section,
        sectionProgress:
          section.lengthFraction > 0 ? (wrapped - travelled) / section.lengthFraction : 0,
      };
    }
    travelled = next;
  }
  return { section: layout.sections[0], sectionProgress: 0 };
}

/** Seperti `trackCornerProgress`, tapi sadar layout: -1 kalau sedang di trek lurus. */
export function layoutCornerProgress(progress: number, layout: TrackLayout) {
  const { section, sectionProgress } = trackPositionAt(progress, layout);
  return section.severity > 0 ? sectionProgress : -1;
}
