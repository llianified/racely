import { describe, expect, it } from "vitest";
import {
  GEAR_CATALOG,
  GEAR_IDS,
  NEUTRAL_SETUP,
  ROLLER_CATALOG,
  ROLLER_IDS,
  carSetupSchema,
  isNeutralSetup,
  knownCarSetup,
  setupLapSeconds,
  setupPerformance,
  type CarSetup,
} from "../lib/car-setup";
import { DEFAULT_ECONOMY, lapSecondsAt } from "../lib/economy-config";
import { calculateRaceSettlement } from "../lib/game-economy";
import { trackLayoutAt } from "../lib/track-layout";

const E = DEFAULT_ECONOMY;
const CIRCUITS = [0, 1] as const;
const ALL_SETUPS: CarSetup[] = GEAR_IDS.flatMap((gear) =>
  ROLLER_IDS.map((roller) => ({ gear, roller })),
);
const levelsAt = (level: number) => ({
  engine: level,
  tires: level,
  battery: level,
});

describe("katalog setup", () => {
  it("menerima hanya gear dan roller yang dikenal", () => {
    expect(carSetupSchema.safeParse(NEUTRAL_SETUP).success).toBe(true);
    expect(carSetupSchema.safeParse({ gear: "9:1", roller: "heavy" }).success).toBe(false);
    expect(carSetupSchema.safeParse({ gear: "4:1", roller: "titanium" }).success).toBe(false);
    // `.strict()` menolak field selundupan seperti stabilitas karangan client.
    expect(
      carSetupSchema.safeParse({ ...NEUTRAL_SETUP, stability: 999 }).success,
    ).toBe(false);
  });

  it("mengembalikan setup netral untuk bentuk tersimpan yang rusak", () => {
    for (const broken of [null, undefined, 42, "4:1", {}, { gear: "4:1" }, []]) {
      expect(knownCarSetup(broken)).toEqual(NEUTRAL_SETUP);
    }
    expect(isNeutralSetup(knownCarSetup(null))).toBe(true);
  });

  it("memberi gear bawaan pengali yang benar-benar netral", () => {
    const gear = GEAR_CATALOG[NEUTRAL_SETUP.gear];
    const roller = ROLLER_CATALOG[NEUTRAL_SETUP.roller];
    for (const part of [gear, roller]) {
      expect(part.speed).toBe(1);
      expect(part.stability).toBe(0);
      expect(part.accel).toBe(1);
    }
  });

  it("tidak pernah menaikkan ketatan tikungan di atas ambang setup netral", () => {
    // Kalau ada sirkuit yang melewati 1, setup netral ikut kena hukuman di sana
    // dan pemain lama kehilangan penghasilan hanya karena sistem ini dipasang.
    // Dibaca per section, bukan per sirkuit: satu hairpin ketat di tengah trek
    // yang selebihnya lapang tetap harus tertangkap.
    for (const circuit of CIRCUITS) {
      for (const section of trackLayoutAt(circuit).sections) {
        expect(section.severity).toBeLessThanOrEqual(1);
      }
    }
  });
});

/**
 * Pagar paling penting di berkas ini. Racely sudah punya pemain berjalan, dan
 * pembaruan gameplay tidak boleh memotong penghasilan mereka. Setup netral
 * harus menghasilkan waktu per putaran yang IDENTIK -- bukan mendekati --
 * dengan `lapSecondsAt` sebelum setup ada.
 */
describe("invarian setup netral", () => {
  it("identik dengan waktu per putaran lama di setiap level, sirkuit, dan boost", () => {
    let compared = 0;
    for (let engine = 1; engine <= E.maxUpgradeLevel; engine += 1) {
      for (let tires = 1; tires <= E.maxUpgradeLevel; tires += 1) {
        for (const circuit of CIRCUITS) {
          for (const boosted of [false, true]) {
            const levels = { engine, tires, battery: 1 };
            const base = lapSecondsAt(E, levels, boosted);
            expect(setupLapSeconds(base, NEUTRAL_SETUP, tires, circuit)).toBe(base);
            compared += 1;
          }
        }
      }
    }
    expect(compared).toBe(E.maxUpgradeLevel * E.maxUpgradeLevel * 2 * 2);
  });

  it("tidak pernah mengeluarkan mobil dari lintasan pada setup netral", () => {
    for (let tires = 1; tires <= E.maxUpgradeLevel; tires += 1) {
      for (const circuit of CIRCUITS) {
        expect(
          setupPerformance(NEUTRAL_SETUP, tires, circuit).courseOutsPerLap,
        ).toBe(0);
      }
    }
  });
});

describe("model stabilitas", () => {
  it("deterministik: masukan sama selalu memberi hasil sama", () => {
    for (const setup of ALL_SETUPS) {
      const first = setupPerformance(setup, 5, 0);
      for (let repeat = 0; repeat < 5; repeat += 1) {
        expect(setupPerformance(setup, 5, 0)).toEqual(first);
      }
    }
  });

  it("roller berat tidak pernah kurang stabil daripada roller ringan", () => {
    for (const gear of GEAR_IDS) {
      for (let tires = 1; tires <= E.maxUpgradeLevel; tires += 1) {
        for (const circuit of CIRCUITS) {
          const light = setupPerformance({ gear, roller: "light" }, tires, circuit);
          const heavy = setupPerformance({ gear, roller: "heavy" }, tires, circuit);
          expect(heavy.courseOutsPerLap).toBeLessThanOrEqual(light.courseOutsPerLap);
        }
      }
    }
  });

  it("ban yang lebih tinggi tidak pernah memperburuk stabilitas", () => {
    for (const setup of ALL_SETUPS) {
      for (const circuit of CIRCUITS) {
        for (let tires = 2; tires <= E.maxUpgradeLevel; tires += 1) {
          expect(
            setupPerformance(setup, tires, circuit).courseOutsPerLap,
          ).toBeLessThanOrEqual(
            setupPerformance(setup, tires - 1, circuit).courseOutsPerLap,
          );
        }
      }
    }
  });

  it("membatasi level ban ngaco tanpa melahirkan NaN", () => {
    for (const tires of [Number.NaN, Infinity, -5, 0, 2.7]) {
      const performance = setupPerformance(NEUTRAL_SETUP, tires, 0);
      expect(Number.isFinite(performance.courseOutsPerLap)).toBe(true);
      expect(Number.isFinite(setupLapSeconds(8, NEUTRAL_SETUP, tires, 0))).toBe(true);
    }
    // Sirkuit di luar daftar jatuh ke karakter sirkuit pertama, bukan undefined.
    expect(Number.isFinite(setupLapSeconds(8, NEUTRAL_SETUP, 1, 99))).toBe(true);
  });

  it("membayar keluar lintasan dengan detik, bukan dengan koin", () => {
    // Satu-satunya jalan keluar dari berkas ini adalah waktu per putaran.
    const reckless = setupLapSeconds(8, { gear: "3.5:1", roller: "light" }, 1, 0);
    const neutral = setupLapSeconds(8, NEUTRAL_SETUP, 1, 0);
    expect(reckless).toBeGreaterThan(neutral);
  });
});

/**
 * Guardrail keseimbangan. Sebuah setup yang menang di semua keadaan berarti
 * tidak ada yang perlu dipilih, dan mekaniknya cuma slider upgrade dengan nama
 * baru. Percobaan pertama benar-benar gagal di sini -- `3.5:1` menang di enam
 * dari enam skenario -- jadi test ini menangkap kegagalan yang sungguhan.
 */
describe("keseimbangan setup", () => {
  const bestFor = (circuit: number, level: number) =>
    ALL_SETUPS.map((setup) => ({
      setup,
      seconds: setupLapSeconds(
        lapSecondsAt(E, levelsAt(level), false),
        setup,
        level,
        circuit,
      ),
    })).sort((a, b) => a.seconds - b.seconds)[0].setup;

  it("tidak punya satu pun setup yang menang di semua trek dan level", () => {
    const winners = new Set<string>();
    for (const circuit of CIRCUITS) {
      for (const level of [1, 5, 10]) {
        const best = bestFor(circuit, level);
        winners.add(`${best.gear}|${best.roller}`);
      }
    }
    expect(winners.size).toBeGreaterThan(1);
  });

  it("memberi trek teknikal dan trek cepat jawaban gear yang berbeda", () => {
    // Inti seluruh mekaniknya: pemain harus membaca treknya, bukan membaca
    // angka laju paling besar.
    for (const level of [1, 5, 10]) {
      expect(bestFor(0, level).gear).not.toBe(bestFor(1, level).gear);
    }
  });

  it("menghukum berat setup yang salah dibanding setup yang benar", () => {
    const base = lapSecondsAt(E, levelsAt(1), false);
    const best = setupLapSeconds(base, bestFor(0, 1), 1, 0);
    const worst = setupLapSeconds(base, { gear: "3.5:1", roller: "light" }, 1, 0);
    // Salah membaca trek harus terasa, bukan sekadar selisih beberapa persen.
    expect(worst).toBeGreaterThan(best * 1.5);
  });

  it("membuat setiap gear jadi pilihan terbaik di suatu keadaan", () => {
    const gearsThatWin = new Set(
      CIRCUITS.flatMap((circuit) =>
        [1, 5, 10].map((level) => bestFor(circuit, level).gear),
      ),
    );
    expect(gearsThatWin.size).toBeGreaterThanOrEqual(2);
  });
});

/**
 * Hukuman berbentuk waktu per putaran, bukan kejadian sesaat. Konsekuensinya
 * ia berlaku sama persis saat pemain menonton maupun saat aplikasinya tertutup
 * -- kalau tidak, cara terbaik menghindari keluar lintasan adalah menutup
 * aplikasi, dan mekaniknya mati dalam seminggu.
 */
describe("settlement memakai hasil otoritatif", () => {
  const settleWith = (setup: CarSetup, seconds: number) =>
    calculateRaceSettlement(
      {
        progress: 0,
        levels: levelsAt(1),
        circuit: 0,
        economy: E,
        setup,
        lastSettledAt: new Date(0),
        boostEndsAt: null,
      },
      new Date(seconds * 1000),
    );

  it("mengurangi putaran untuk setup yang tidak sanggup, secara online", () => {
    const online = E.heartbeatCapSeconds;
    const neutral = settleWith(NEUTRAL_SETUP, online);
    const reckless = settleWith({ gear: "3.5:1", roller: "light" }, online);
    expect(reckless.completedLaps).toBeLessThan(neutral.completedLaps);
    expect(reckless.income).toBeLessThan(neutral.income);
  });

  it("menerapkan hukuman yang sama pada jendela offline", () => {
    // Satu jam penuh: jauh melewati jendela heartbeat, jadi sebagian besarnya
    // dibayar dengan tarif offline.
    const away = 3600;
    const neutral = settleWith(NEUTRAL_SETUP, away);
    const reckless = settleWith({ gear: "3.5:1", roller: "light" }, away);
    expect(neutral.offline).not.toBeNull();
    expect(reckless.offline).not.toBeNull();
    expect(reckless.offline!.laps).toBeLessThan(neutral.offline!.laps);
  });

  it("membayar setup netral persis seperti sebelum setup ada", () => {
    // `setup` opsional di `RaceSettlementInput`; menghilangkannya harus sama
    // dengan mengirim setup netral, supaya baris dan cookie lama tidak berubah.
    const withNeutral = settleWith(NEUTRAL_SETUP, 3600);
    const withoutSetup = calculateRaceSettlement(
      {
        progress: 0,
        levels: levelsAt(1),
        circuit: 0,
        economy: E,
        lastSettledAt: new Date(0),
        boostEndsAt: null,
      },
      new Date(3600 * 1000),
    );
    expect(withoutSetup.completedLaps).toBe(withNeutral.completedLaps);
    expect(withoutSetup.income).toBe(withNeutral.income);
  });
});
