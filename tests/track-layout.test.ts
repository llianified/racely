import { describe, expect, it } from "vitest";
import {
  PLAYER_RADIUS,
  TRACK_HALF,
  TRACK_LAYOUTS,
  buildTrackLayout,
  isClosedLoop,
  layoutCornerProgress,
  primitiveLength,
  trackLayoutAt,
  trackPositionAt,
} from "../lib/track-layout";
import {
  STRAIGHT_LAP_FRACTION,
  isCleanBoostLaunch,
  isTrackCorner,
  trackCornerProgress,
} from "../lib/race-dynamics";

const CIRCUITS = [0, 1] as const;

/**
 * Pagar utama berkas ini. Selama Jakarta dan Midnight masih oval, layout
 * WAJIB menghasilkan angka yang sama persis dengan rumus lama -- kalau tidak,
 * memindahkan model server ke layout akan menggeser penghasilan pemain yang
 * sudah berjalan.
 */
describe("layout oval identik dengan rumus lama", () => {
  it("menghasilkan STRAIGHT_LAP_FRACTION yang sama persis", () => {
    for (const circuit of CIRCUITS) {
      expect(trackLayoutAt(circuit).straightFraction).toBe(STRAIGHT_LAP_FRACTION);
    }
  });

  it("menempatkan tikungan di posisi lintasan yang sama dengan trackCornerProgress", () => {
    // Disapu rapat, bukan dicek di beberapa titik pilihan: pergeseran sekecil
    // apa pun pada mulut tikungan mengubah penilaian Gaspol.
    for (let step = 0; step < 2000; step += 1) {
      const progress = step / 2000;
      const layout = layoutCornerProgress(progress, trackLayoutAt(0));
      expect(layout >= 0).toBe(isTrackCorner(progress));
      if (layout >= 0) {
        expect(layout).toBeCloseTo(trackCornerProgress(progress), 12);
      }
    }
  });

  it("membungkus posisi di luar 0..1 seperti rumus lama", () => {
    for (const progress of [-0.35, 1.35, 2.1, 7.85]) {
      expect(layoutCornerProgress(progress, trackLayoutAt(0)) >= 0).toBe(
        isTrackCorner(progress),
      );
    }
  });

  it("mereproduksi ketatan tikungan yang berlaku sekarang", () => {
    // Jakarta 1,00 dan Midnight 0,70 -- dulu ditulis tangan sebagai
    // CIRCUIT_CORNER_SEVERITY, sekarang turunan dari radius.
    const corners = (circuit: number) =>
      trackLayoutAt(circuit).sections.filter((section) => section.severity > 0);
    for (const section of corners(0)) expect(section.severity).toBeCloseTo(1, 12);
    for (const section of corners(1)) expect(section.severity).toBeCloseTo(0.7, 12);
  });

  it("punya dua tikungan dan panjang total yang benar", () => {
    const layout = trackLayoutAt(0);
    expect(layout.cornerCount).toBe(2);
    expect(layout.totalLength).toBeCloseTo(
      TRACK_HALF * 4 + Math.PI * PLAYER_RADIUS * 2,
      12,
    );
  });
});

describe("bentuk layout", () => {
  it("menjumlahkan lengthFraction tepat 1 di setiap sirkuit", () => {
    for (const layout of TRACK_LAYOUTS) {
      const total = layout.sections.reduce((sum, section) => sum + section.lengthFraction, 0);
      expect(total).toBeCloseTo(1, 12);
    }
  });

  it("menutup loop pada setiap sirkuit", () => {
    for (const layout of TRACK_LAYOUTS) expect(isClosedLoop(layout)).toBe(true);
  });

  it("menolak loop yang tidak tertutup", () => {
    const open = buildTrackLayout(
      "open",
      [
        { id: "a", kind: "straight", geometry: [{ kind: "line", length: 4 }] },
        { id: "b", kind: "corner", geometry: [{ kind: "arc", radius: 2, turn: Math.PI / 2 }] },
      ],
      1,
    );
    expect(isClosedLoop(open)).toBe(false);
  });

  it("jatuh ke sirkuit pertama untuk indeks yang tidak dikenal", () => {
    for (const circuit of [-1, 2, 99, Number.NaN]) {
      expect(trackLayoutAt(circuit)).toBe(TRACK_LAYOUTS[0]);
    }
  });

  it("mengukur panjang primitif garis dan busur", () => {
    expect(primitiveLength({ kind: "line", length: 3 })).toBe(3);
    expect(primitiveLength({ kind: "arc", radius: 2, turn: Math.PI })).toBeCloseTo(2 * Math.PI, 12);
    // Arah belok tidak mengubah panjang.
    expect(primitiveLength({ kind: "arc", radius: 2, turn: -Math.PI })).toBeCloseTo(2 * Math.PI, 12);
  });
});

describe("tikungan yang lebih ketat menuntut lebih banyak", () => {
  it("menaikkan severity saat radius mengecil", () => {
    const severityFor = (radius: number) =>
      buildTrackLayout(
        "probe",
        [
          { id: "s", kind: "straight", geometry: [{ kind: "line", length: 5 }] },
          { id: "c", kind: "hairpin", geometry: [{ kind: "arc", radius, turn: Math.PI }] },
        ],
        1,
      ).sections[1].severity;
    expect(severityFor(PLAYER_RADIUS)).toBeCloseTo(1, 12);
    expect(severityFor(1.4)).toBeGreaterThan(1);
    expect(severityFor(4)).toBeLessThan(1);
  });

  it("memberi S-curve severity dari kelengkungan rata-rata, bukan dari arah beloknya", () => {
    // Dua busur berlawanan arah dengan radius sama harus senilai satu busur
    // beradius sama -- tandanya menentukan bentuk, bukan tuntutan grip.
    const sCurve = buildTrackLayout(
      "s",
      [
        {
          id: "s-curve",
          kind: "s-curve",
          geometry: [
            { kind: "arc", radius: 3, turn: Math.PI / 3 },
            { kind: "arc", radius: 3, turn: -Math.PI / 3 },
          ],
        },
      ],
      1,
    ).sections[0].severity;
    expect(sCurve).toBeCloseTo(PLAYER_RADIUS / 3, 12);
  });
});

describe("trackPositionAt", () => {
  it("melaporkan section dan posisi di dalamnya", () => {
    const layout = trackLayoutAt(0);
    const start = trackPositionAt(0, layout);
    expect(start.section.id).toBe("back-straight");
    expect(start.sectionProgress).toBeCloseTo(0, 12);

    const corner = trackPositionAt(0.5 - 1e-9, layout);
    expect(corner.section.id).toBe("turn-1");
    expect(corner.sectionProgress).toBeGreaterThan(0.99);
  });

  it("tidak pernah melahirkan NaN untuk masukan rusak", () => {
    for (const progress of [Number.NaN, Infinity, -Infinity]) {
      const position = trackPositionAt(progress, trackLayoutAt(0));
      expect(Number.isFinite(position.sectionProgress)).toBe(true);
    }
  });
});

/**
 * Penilaian Gaspol adalah satu-satunya pemakai geometri trek yang membayar
 * dengan koin sungguhan: menekan di tikungan memotong durasi Gaspol. Sekarang
 * ia bisa membaca layout, dan selama Jakarta maupun Midnight masih oval,
 * jawabannya WAJIB sama persis dengan jalur lama.
 */
describe("penilaian Gaspol mengikuti layout", () => {
  it("memberi jawaban identik dengan jalur oval lama di kedua sirkuit", () => {
    for (const grace of [0, 0.05, 0.2]) {
      for (let step = 0; step < 1000; step += 1) {
        const progress = step / 1000;
        const legacy = isCleanBoostLaunch(progress, grace);
        for (const circuit of CIRCUITS) {
          expect(isCleanBoostLaunch(progress, grace, trackLayoutAt(circuit))).toBe(legacy);
        }
      }
    }
  });

  it("menilai dengan tikungan milik layout, bukan oval yang dibekukan", () => {
    // Layout yang tikungannya berada di tempat berbeda harus memberi jawaban
    // berbeda -- itulah gunanya melewatkan layout. Kalau test ini hijau padahal
    // jawabannya sama, berarti layoutnya diabaikan diam-diam.
    const flipped = buildTrackLayout(
      "flipped",
      [
        { id: "turn", kind: "corner", geometry: [{ kind: "arc", radius: PLAYER_RADIUS, turn: Math.PI }] },
        { id: "straight-a", kind: "straight", geometry: [{ kind: "line", length: TRACK_HALF * 2 }] },
        { id: "turn-2", kind: "corner", geometry: [{ kind: "arc", radius: PLAYER_RADIUS, turn: Math.PI }] },
        { id: "straight-b", kind: "straight", geometry: [{ kind: "line", length: TRACK_HALF * 2 }] },
      ],
      1,
    );
    // Posisi 0 adalah trek lurus di oval, tapi mulut tikungan di layout ini.
    expect(isCleanBoostLaunch(0.05, 0)).toBe(true);
    expect(isCleanBoostLaunch(0.05, 0, flipped)).toBe(false);
  });

  it("tetap memaafkan tekanan telat lewat toleransi yang sama", () => {
    const layout = trackLayoutAt(0);
    const mouth = STRAIGHT_LAP_FRACTION / 2 + 1e-6;
    expect(isCleanBoostLaunch(mouth, 0, layout)).toBe(false);
    expect(isCleanBoostLaunch(mouth, 0.05, layout)).toBe(true);
  });
});
