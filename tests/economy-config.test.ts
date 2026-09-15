import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ECONOMY,
  UPGRADE_LEVEL_CEILING,
  boostCooldownSeconds,
  boostDurationFor,
  coinsToIdr,
  economyConfigSchema,
  economyFieldKeys,
  lapRewardAt,
  lapSecondsAt,
  resolveEconomyConfig,
  upgradeCostAt,
} from "../lib/economy-config";
import { projectEconomy } from "../lib/economy-projection";

const E = DEFAULT_ECONOMY;

describe("Config ekonomi", () => {
  it("menerima nilai bawaannya sendiri", () => {
    expect(economyConfigSchema.safeParse(E).success).toBe(true);
  });

  it("mengisi syarat aktivitas baru tanpa mengubah hadiah atau config lama", () => {
    const { referralActiveDays: _days, referralUpgradeTarget: _upgrades, ...legacy } = E;
    const resolved = resolveEconomyConfig({ ...legacy, referralMilestoneLaps: 120, referralRewardInviter: 1234 });
    expect(resolved.referralActiveDays).toBe(3);
    expect(resolved.referralUpgradeTarget).toBe(3);
    expect(resolved.referralRewardInviter).toBe(1234);
    expect(resolved.referralMilestoneLaps).toBe(120);
  });

  it("membatasi aktivitas referral pada riwayat dan level yang tersedia", () => {
    for (const value of [0, 1, 2.5, 31]) {
      expect(economyConfigSchema.safeParse({ ...E, referralActiveDays: value }).success).toBe(false);
    }
    for (const value of [0, 1.5, 28]) {
      expect(economyConfigSchema.safeParse({ ...E, referralUpgradeTarget: value }).success).toBe(false);
    }
    expect(economyConfigSchema.safeParse({ ...E, referralActiveDays: 30, referralUpgradeTarget: 27 }).success).toBe(true);
  });

  it("menolak field asing, supaya salah tulis tidak lolos diam-diam", () => {
    const parsed = economyConfigSchema.safeParse({ ...E, coinToIdrr: 100 });
    expect(parsed.success).toBe(false);
  });

  it("menolak penarikan maksimum di bawah minimum", () => {
    const parsed = economyConfigSchema.safeParse({
      ...E,
      minWithdrawCoins: 500,
      maxWithdrawCoins: 100,
    });
    expect(parsed.success).toBe(false);
  });

  /**
   * `CHECK (engine_level BETWEEN 1 AND 10)` di migrasi 0001 adalah batas
   * sebenarnya. Config yang mengizinkan level 11 akan membuat upgrade ke-11
   * ditolak database, bukan ditolak aturan permainan -- 500, bukan 409.
   */
  it("mengunci level maksimum pada batas yang dijaga database", () => {
    expect(UPGRADE_LEVEL_CEILING).toBe(10);
    expect(
      economyConfigSchema.safeParse({ ...E, maxUpgradeLevel: 11 }).success,
    ).toBe(false);
    expect(
      economyConfigSchema.safeParse({ ...E, maxUpgradeLevel: 10 }).success,
    ).toBe(true);
  });

  /**
   * Setiap hadiah di bawah ini dibayar lewat sebuah baris
   * `racely_reward_claims`, yang kolomnya `bigint NOT NULL CHECK (amount > 0)`.
   * Nol dan pecahan DITOLAK Postgres, bukan dibulatkan -- dan insert-nya ada di
   * dalam transaksi aksi pemain, jadi kegagalannya ikut me-rollback hasil
   * balapan yang baru diselesaikan. Pemain hanya melihat 500, setiap kali,
   * selamanya, sampai ada yang menyetel ulang config dari panel.
   *
   * Satu-satunya tempat yang bisa mencegahnya adalah di sini, sebelum angkanya
   * pernah tersimpan.
   */
  const rewardFields = [
    "starterGift",
    "referralRewardInviter",
    "referralRewardInvitee",
    "missionLapsReward",
    "missionUpgradeReward",
    "missionEarnReward",
  ] as const;

  it.each(rewardFields)(
    "menolak %s yang nol atau pecahan -- kolomnya bigint CHECK (amount > 0)",
    (field) => {
      expect(economyConfigSchema.safeParse({ ...E, [field]: 0 }).success).toBe(
        false,
      );
      expect(
        economyConfigSchema.safeParse({ ...E, [field]: 15.5 }).success,
      ).toBe(false);
      expect(economyConfigSchema.safeParse({ ...E, [field]: 1 }).success).toBe(
        true,
      );
    },
  );

  it("menolak rung check-in harian yang nol atau pecahan", () => {
    expect(
      economyConfigSchema.safeParse({ ...E, dailyRewards: [0, 2, 3] }).success,
    ).toBe(false);
    expect(
      economyConfigSchema.safeParse({ ...E, dailyRewards: [1, 2.5] }).success,
    ).toBe(false);
    expect(
      economyConfigSchema.safeParse({ ...E, dailyRewards: [1, 2, 3] }).success,
    ).toBe(true);
  });

  /**
   * Angka per-putaran justru HARUS boleh pecahan: muaranya `pending`/`earned`
   * yang `double precision`, dan nilai bawaannya sendiri 0,05. Pagar hadiah di
   * atas tidak boleh ikut mengeraskannya.
   */
  it("tetap mengizinkan angka per-putaran yang pecahan", () => {
    expect(
      economyConfigSchema.safeParse({ ...E, lapRewardBase: 0.05 }).success,
    ).toBe(true);
    expect(
      economyConfigSchema.safeParse({ ...E, lapRewardPerBattery: 0.01 }).success,
    ).toBe(true);
    expect(
      economyConfigSchema.safeParse({ ...E, missionEarnTarget: 25.5 }).success,
    ).toBe(true);
  });

  /**
   * `calculateRaceSettlement` hanya menghitung boost di dalam jendela
   * heartbeat. Boost yang lebih panjang membuat ekornya dibayar tarif offline:
   * pemain menekan Gaspol, tidak mendapat Gaspol, tanpa satu pun error.
   */
  it("menolak durasi boost yang melebihi jendela heartbeat", () => {
    expect(
      economyConfigSchema.safeParse({
        ...E,
        boostDurationSeconds: 600,
        heartbeatCapSeconds: 120,
      }).success,
    ).toBe(false);
    expect(
      economyConfigSchema.safeParse({
        ...E,
        boostDurationSeconds: 120,
        heartbeatCapSeconds: 120,
      }).success,
    ).toBe(true);
  });

  /**
   * `amount_idr` dihitung di JavaScript sebelum masuk kolom bigint. Batas
   * per-field saja masih mengizinkan hasil kali di atas 2^53, tempat rupiah
   * mulai kehilangan presisi tanpa error apa pun.
   */
  it("menolak kombinasi nilai koin dan batas penarikan yang melampaui presisi", () => {
    expect(
      economyConfigSchema.safeParse({
        ...E,
        coinToIdr: 10_000_000,
        maxWithdrawCoins: 1_000_000_000,
      }).success,
    ).toBe(false);
    // Kombinasi yang masih aman tetap diterima.
    expect(
      economyConfigSchema.safeParse({
        ...E,
        coinToIdr: 1_000,
        maxWithdrawCoins: 1_000_000,
      }).success,
    ).toBe(true);
  });

  it("menolak angka yang membuat putaran tidak pernah selesai", () => {
    expect(
      economyConfigSchema.safeParse({ ...E, lapBaseSeconds: 0 }).success,
    ).toBe(false);
    expect(
      economyConfigSchema.safeParse({ ...E, offlineRate: 1.5 }).success,
    ).toBe(false);
    expect(
      economyConfigSchema.safeParse({ ...E, racePositionRewardStep: 1.5 }).success,
    ).toBe(false);
    expect(
      economyConfigSchema.safeParse({ ...E, dailyRewards: [] }).success,
    ).toBe(false);
  });

  describe("resolveEconomyConfig", () => {
    it("mengisi field yang hilang dari baris lama dengan bawaannya", () => {
      const resolved = resolveEconomyConfig({ coinToIdr: 250 });
      expect(resolved.coinToIdr).toBe(250);
      expect(resolved.starterGift).toBe(E.starterGift);
      expect(Object.keys(resolved).sort()).toEqual(
        [...economyFieldKeys].sort(),
      );
    });

    it("jatuh ke bawaan untuk baris yang rusak, bukan melempar", () => {
      // Satu baris config yang tidak terbaca tidak boleh mematikan permainan.
      expect(resolveEconomyConfig(null)).toEqual(E);
      expect(resolveEconomyConfig("bukan objek")).toEqual(E);
      expect(resolveEconomyConfig([1, 2, 3])).toEqual(E);
      expect(resolveEconomyConfig({ coinToIdr: -5 })).toEqual(E);
    });
  });

  it("menurunkan cooldown boost, bukan menyimpannya sebagai angka ketiga", () => {
    expect(boostCooldownSeconds(E)).toBe(
      E.boostDurationSeconds + E.batteryRechargeSeconds,
    );
    const cepat = { ...E, boostDurationSeconds: 4, batteryRechargeSeconds: 6 };
    expect(boostCooldownSeconds(cepat)).toBe(10);
  });

  it("memotong durasi Gaspol yang ditekan di tikungan, bukan cooldown-nya", () => {
    expect(boostDurationFor(E, true)).toBe(E.boostDurationSeconds);
    expect(boostDurationFor(E, false)).toBe(
      E.boostDurationSeconds * (1 - E.boostCornerPenalty),
    );
    expect(boostDurationFor(E, false)).toBeLessThan(boostDurationFor(E, true));
    // Cooldown tidak menerima `clean` sama sekali: salah tekan membayar waktu
    // tunggu yang sama untuk Gaspol yang lebih pendek.
    expect(boostCooldownSeconds(E)).toBe(
      E.boostDurationSeconds + E.batteryRechargeSeconds,
    );
  });

  it("mengembalikan Gaspol ke durasi penuh saat potongannya dimatikan", () => {
    // 0 adalah cara operator mematikan mekaniknya dari panel tanpa deploy.
    const mati = { ...E, boostCornerPenalty: 0 };
    expect(boostDurationFor(mati, false)).toBe(mati.boostDurationSeconds);
    expect(boostDurationFor(mati, true)).toBe(mati.boostDurationSeconds);
  });

  it("menolak potongan dan toleransi di luar rentang 0..1", () => {
    for (const key of ["boostCornerPenalty", "boostLaunchGraceLap"] as const) {
      expect(economyConfigSchema.safeParse({ ...E, [key]: 1.5 }).success).toBe(
        false,
      );
      expect(economyConfigSchema.safeParse({ ...E, [key]: -0.1 }).success).toBe(
        false,
      );
      expect(economyConfigSchema.safeParse({ ...E, [key]: 0 }).success).toBe(
        true,
      );
    }
  });

  it("memakai satu rumus untuk laju, hadiah, dan biaya", () => {
    const levels = { engine: 1, tires: 1, battery: 1 };
    expect(lapSecondsAt(E, levels, false)).toBe(8);
    expect(lapSecondsAt(E, levels, true)).toBe(8);
    expect(lapRewardAt(E, 1, 0)).toBe(5);
    expect(lapRewardAt(E, 10, 1)).toBe(17);
    expect(upgradeCostAt(E, "engine", 1)).toBe(5_000);
  });

  /**
   * Denominasi bawaan: 10 koin = Rp1. Hasil kali pecahan biner bisa meleset
   * sepersekian triliun ke bawah, dan `Math.floor` polos akan memangkas satu
   * rupiah penuh dari penarikan seorang pemain.
   */
  describe("coinsToIdr", () => {
    it("membulatkan ke bawah tanpa termakan artefak floating point", () => {
      expect(E.coinToIdr).toBe(0.1);
      expect(coinsToIdr(200_000, E)).toBe(20_000);
      expect(coinsToIdr(1_234_567, E)).toBe(123_456);
      expect(coinsToIdr(9, E)).toBe(0);
      expect(coinsToIdr(0, E)).toBe(0);
    });

    it("tetap bilangan bulat rupiah pada kurs berapa pun", () => {
      for (const coinToIdr of [0.01, 0.1, 0.3, 1, 2.5, 100]) {
        const e = { ...E, coinToIdr };
        for (const coins of [1, 7, 199_999, 200_000, 3_333_333]) {
          const value = coinsToIdr(coins, e);
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeLessThanOrEqual(coins * coinToIdr + 1e-6);
        }
      }
    });
  });

  /** `amount_idr` punya CHECK `> 0`: minimum tarik tidak boleh bernilai Rp0. */
  it("menolak minimum tarik yang bernilai di bawah Rp1 pada kurs pecahan", () => {
    expect(
      economyConfigSchema.safeParse({ ...E, minWithdrawCoins: 9 }).success,
    ).toBe(false);
    expect(
      economyConfigSchema.safeParse({ ...E, minWithdrawCoins: 10 }).success,
    ).toBe(true);
    expect(
      economyConfigSchema.safeParse({ ...E, coinToIdr: 100, minWithdrawCoins: 1 })
        .success,
    ).toBe(true);
  });
});

/**
 * Proyeksi adalah alasan panel ekonomi bisa dipakai tanpa menghitung di kepala.
 * Yang dijaga di sini adalah arahnya, bukan angka persisnya: menaikkan nilai
 * koin harus menaikkan rupiah, dan memperlambat putaran harus menurunkannya.
 */
describe("Proyeksi ekonomi", () => {
  it("menerjemahkan config bawaan jadi rupiah per jam", () => {
    const { rows } = projectEconomy(E);
    expect(rows).toHaveLength(2);
    // No synthetic position multiplier: 5 coins per 8 seconds, 10 coins = Rp1.
    expect(rows[0].coinsPerHour).toBeCloseTo(2_250);
    expect(rows[0].idrPerHour).toBeCloseTo(225);
    // Upgrade maksimum jauh lebih cepat DAN lebih mahal per putaran.
    expect(rows[1].coinsPerHour).toBeGreaterThan(rows[0].coinsPerHour);
  });

  it("ikut naik saat nilai koin dinaikkan", () => {
    const mahal = projectEconomy({ ...E, coinToIdr: E.coinToIdr * 2 });
    const dasar = projectEconomy(E);
    expect(mahal.rows[0].idrPerHour).toBeCloseTo(dasar.rows[0].idrPerHour * 2);
    expect(mahal.minWithdrawIdr).toBe(dasar.minWithdrawIdr * 2);
  });

  it("turun saat putaran diperlambat", () => {
    const lambat = projectEconomy({ ...E, lapBaseSeconds: E.lapBaseSeconds * 4 });
    expect(lambat.rows[0].coinsPerHour).toBeCloseTo(2_250 / 4);
  });

  it("menghitung nilai akun baru dan biaya max-out", () => {
    const projection = projectEconomy(E);
    expect(projection.freshAccountIdr).toBe(
      (E.startingBalance + E.starterGift) * E.coinToIdr,
    );
    // Tiga jalur upgrade, sembilan langkah masing-masing.
    let expected = 0;
    for (const key of ["engine", "tires", "battery"] as const) {
      for (let level = 1; level < E.maxUpgradeLevel; level += 1) {
        expected += upgradeCostAt(E, key, level);
      }
    }
    expect(projection.maxOutCost).toBe(expected);
    expect(projection.maxOutIdr).toBe(expected * E.coinToIdr);
  });

  it("tidak pernah membagi nol saat laju disetel ke tak berbayar", () => {
    const gratis = projectEconomy({ ...E, lapRewardBase: 0, lapRewardPerBattery: 0, lapRewardPerCircuit: 0 });
    expect(gratis.rows[0].coinsPerHour).toBe(0);
    expect(gratis.rows[0].hoursToMinWithdraw).toBe(Infinity);
    expect(Number.isNaN(gratis.maxOutHoursAtBase)).toBe(false);
  });
});

/**
 * Panel admin adalah satu-satunya jalan menyetel ekonomi, dan `toConfig()` di
 * `app/admin/admin-economy.tsx` membangun payload-nya HANYA dari `GROUPS`.
 * Karena `economyConfigSchema` itu `.strict()` dengan semua field wajib, satu
 * knob yang lupa didaftarkan tidak cuma "tidak bisa disetel" -- payload-nya jadi
 * kurang satu field dan SELURUH form berhenti bisa disimpan (422). Dibaca dari
 * source, sama seperti tests/action-receipt-types.test.ts terhadap SQL, supaya
 * test lingkungan node tidak perlu mengimpor komponen React.
 */
describe("Panel admin mencakup seluruh knob ekonomi", () => {
  const panelSource = readFileSync("app/admin/admin-economy.tsx", "utf8");
  const groupKeys = [
    ...new Set(
      [...panelSource.matchAll(/\{\s*key:\s*"([A-Za-z]+)"/g)].map(
        ([, key]) => key,
      ),
    ),
  ];
  /** Bukan angka tunggal, jadi ia punya field teksnya sendiri di luar GROUPS. */
  const OUTSIDE_GROUPS = new Set(["dailyRewards"]);

  const retired = new Set(['referralMilestoneLaps', 'dailyMissionBoostTarget', 'dailyMissionCleanTarget', 'racePositionRewardStep', 'boostDurationSeconds', 'batteryRechargeSeconds', 'boostMultiplier', 'boostCornerPenalty', 'boostLaunchGraceLap']);

  it("mendaftarkan hanya field aktif dan tetap menyerialisasikan legacy config", () => {
    expect(panelSource).toContain('Object.keys(DEFAULT_ECONOMY)');
    expect(panelSource).toContain('draft[key] = value');
    const expected = economyFieldKeys
      .filter((key) => !OUTSIDE_GROUPS.has(key) && !retired.has(key))
      .sort();
    expect([...groupKeys].sort()).toEqual(expected);
  });

  it("tetap menyediakan kontrol untuk tangga hadiah harian", () => {
    for (const key of OUTSIDE_GROUPS) {
      expect(panelSource).toContain(`set("${key}"`);
    }
  });

  it("tidak mendaftarkan field yang bukan milik EconomyConfig", () => {
    const known = new Set<string>(economyFieldKeys);
    for (const key of groupKeys) expect(known.has(key)).toBe(true);
  });
});

/**
 * Ambang buka sirkuit 2 disebut di tiga permukaan UI, dan ketiganya sempat
 * menyimpang: panel sirkuit dan handler di dashboard memakai literal 25 sementara
 * dialog sudah membaca config. Akibatnya nyata -- dengan ambang 10 dari panel
 * admin, dialog menawarkan tombol yang handler-nya menolak tanpa pesan apa pun;
 * dengan ambang 50, panel bilang "Terbuka" lalu server menolak aksinya.
 *
 * Dijaga dari source, bukan dari render: suite ini berjalan di lingkungan node,
 * dan yang perlu dikunci memang bentuk kodenya -- bukan pikselnya.
 */
describe("Ambang sirkuit dibaca dari config di setiap permukaan", () => {
  const WRITERS = [
    "components/game/race/circuit-panel.tsx",
    "components/game/game-dashboard.tsx",
    "components/game/shell/game-dialog.tsx",
  ];

  it("membaca circuitUnlockLaps, bukan angka yang ditulis lepas", () => {
    for (const file of WRITERS) {
      expect(readFileSync(file, "utf8")).toContain("circuitUnlockLaps");
    }
  });

  it("tidak membandingkan laps dengan literal di mana pun", () => {
    for (const file of WRITERS) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/laps\s*[<>]=?\s*\d/);
    }
  });
});

/**
 * Pagar regresi untuk angka ekonomi yang sempat ditulis lepas di teks UI. Tiap
 * pola di bawah pernah benar-benar ada di kode: semuanya lolos typecheck, lint,
 * dan test, lalu berbohong kepada pemain begitu knob-nya disetel dari panel.
 * Daftar ini sengaja berupa literal yang dilarang, bukan aturan umum -- yang
 * dijaga memang kalimat tertentu, dan "Respons 90%" atau "butuh 1 koin penuh"
 * adalah sifat rumusnya, bukan knob.
 */
describe("Teks UI tidak menulis ulang angka ekonomi", () => {
  const FORBIDDEN: { pattern: RegExp; field: string }[] = [
    { pattern: /Gaspol \d/, field: "boostMultiplier" },
    { pattern: /setengah kecepatan/, field: "offlineRate" },
    // Pola yang sama, ditulis sebagai simbol -- persis bentuk yang lolos pagar
    // di atas dan berbohong di dialog "selamat datang kembali".
    { pattern: /½\s*kecepatan/, field: "offlineRate (simbol pecahan)" },
    { pattern: /maksimal level \d/, field: "maxUpgradeLevel" },
    { pattern: /dari 10`/, field: "maxUpgradeLevel (aria-label segmen)" },
    { pattern: /length: 10 \}/, field: "maxUpgradeLevel (jumlah segmen)" },
    { pattern: /hari ketujuh/, field: "dailyRewards" },
    { pattern: /\+\d+% tenaga/, field: "lapEnginePerLevel / lapTiresPerLevel" },
    { pattern: /\+0,\d+ koin/, field: "lapRewardPerBattery / lapRewardPerCircuit" },
  ];

  const files = readdirSync("components/game", { recursive: true })
    .map(String)
    .filter((name) => name.endsWith(".tsx"))
    // scene/ adalah geometri dan shader, bukan teks ekonomi.
    .filter((name) => !name.startsWith("scene/"))
    .map((name) => `components/game/${name}`);

  it("memeriksa seluruh komponen non-3D, bukan cuma beberapa", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const { pattern, field } of FORBIDDEN) {
    it(`tidak menulis ${field} sebagai literal`, () => {
      const offenders = files.filter((file) =>
        pattern.test(readFileSync(file, "utf8")),
      );
      expect(offenders).toEqual([]);
    });
  }
});
