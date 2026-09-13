import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COIN_FAUCET_FIELDS,
  DEFAULT_ECONOMY,
  UPGRADE_LEVEL_CEILING,
  boostCooldownSeconds,
  coinCapRemaining,
  economyConfigSchema,
  economyFieldKeys,
  lapRewardAt,
  lapScrapAt,
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

  it("memakai satu rumus untuk laju, hadiah, dan biaya", () => {
    const levels = { engine: 1, tires: 1, battery: 1 };
    expect(lapSecondsAt(E, levels, false)).toBe(8);
    expect(lapSecondsAt(E, levels, true)).toBe(8 / E.boostMultiplier);
    expect(lapRewardAt(E, 1, 0)).toBe(0.05);
    expect(lapRewardAt(E, 10, 1)).toBe(0.16);
    expect(upgradeCostAt(E, "engine", 1)).toBe(25);
  });
});

/**
 * Proyeksi adalah alasan panel ekonomi bisa dipakai tanpa menghitung di kepala.
 * Yang dijaga di sini adalah arahnya, bukan angka persisnya: menaikkan nilai
 * koin harus menaikkan rupiah, dan memperlambat putaran harus menurunkannya.
 */
/**
 * Aturan emas: koin adalah kewajiban rupiah, Sparepart tidak. Keran koin dikunci
 * pada daftar yang sudah ada. Dua test di bawah bekerja berpasangan:
 *
 *  - yang pertama memaksa setiap knob digolongkan, jadi knob BARU apa pun
 *    memerahkan suite sampai seseorang memutuskan ia mencetak koin atau tidak;
 *  - yang kedua membekukan daftar keran koin, jadi menggolongkan knob baru
 *    sebagai keran koin tidak bisa terjadi diam-diam.
 *
 * Keduanya sengaja menuntut suntingan manual. Itu memang gunanya.
 */
const NON_COIN_FIELDS = [
  // Nilai tukar dan pagar penarikan: mengatur koin yang sudah ada, tidak mencetak.
  "coinToIdr", "minWithdrawCoins", "maxWithdrawCoins",
  "withdrawFeePct", "withdrawCooldownDays", "withdrawMinLaps",
  "withdrawMinAccountAgeDays",
  // Laju dan waktu: mengubah berapa cepat putaran selesai, bukan bayarannya.
  "lapBaseSeconds", "lapEnginePerLevel", "lapTiresPerLevel",
  "boostDurationSeconds", "batteryRechargeSeconds", "boostMultiplier",
  "heartbeatCapSeconds", "offlineCapSeconds", "offlineRate",
  // Penyerap koin.
  "upgradeCostEngine", "upgradeCostTires", "upgradeCostBattery",
  "upgradeCostGrowth", "maxUpgradeLevel",
  "carPriceBebek", "carPriceBurger", "carPriceUfo",
  "coinToScrapRate",
  // Syarat, bukan hadiah.
  "referralMilestoneLaps", "missionLapsTarget", "missionUpgradeTarget",
  "missionEarnTarget", "circuitUnlockLaps",
  // Sparepart: tidak bisa ditarik, jadi bukan kewajiban rupiah.
  "lapScrapBase", "lapScrapPerLevel", "lapScrapPerCircuit", "startingScrap",
  // Pagar emisi.
  "dailyCoinCapPerPlayer", "dailyEmissionBudgetIdr",
] as const satisfies readonly (keyof typeof DEFAULT_ECONOMY)[];

describe("Aturan emas: keran koin tidak boleh bertambah diam-diam", () => {
  it("menggolongkan setiap knob ekonomi sebagai keran koin atau bukan", () => {
    const classified = [...COIN_FAUCET_FIELDS, ...NON_COIN_FIELDS];
    expect(new Set(classified).size, "ada knob yang digolongkan dua kali").toBe(
      classified.length,
    );
    expect([...classified].sort()).toEqual([...economyFieldKeys].sort());
  });

  it("membekukan daftar keran koin", () => {
    expect([...COIN_FAUCET_FIELDS].sort()).toEqual([
      "dailyRewards",
      "lapRewardBase",
      "lapRewardPerBattery",
      "lapRewardPerCircuit",
      "missionEarnReward",
      "missionLapsReward",
      "missionUpgradeReward",
      "racePositionRewardStep",
      "referralRewardInvitee",
      "referralRewardInviter",
      "starterGift",
      "startingBalance",
    ]);
  });

  it("membayar Sparepart tanpa menyentuh koin", () => {
    const levels = { engine: 1, tires: 1, battery: 1 };
    expect(lapScrapAt(E, levels, 0)).toBeGreaterThan(0);
    // Sirkuit kedua menambah Sparepart, bukan lewat jalur koin mana pun.
    expect(lapScrapAt(E, levels, 1)).toBeGreaterThan(lapScrapAt(E, levels, 0));
    expect(lapScrapAt(E, { engine: 5, tires: 5, battery: 5 }, 0)).toBeGreaterThan(
      lapScrapAt(E, levels, 0),
    );
  });

  it("menghitung sisa jatah koin harian dan tidak pernah negatif", () => {
    expect(coinCapRemaining(E, 0)).toBe(E.dailyCoinCapPerPlayer);
    expect(coinCapRemaining(E, E.dailyCoinCapPerPlayer)).toBe(0);
    expect(coinCapRemaining(E, E.dailyCoinCapPerPlayer + 99)).toBe(0);
  });
});

describe("Proyeksi ekonomi", () => {
  it("menerjemahkan config bawaan jadi rupiah per jam", () => {
    const { rows } = projectEconomy(E);
    expect(rows).toHaveLength(2);
    // Level 1 finishes P3: 0,04 koin tiap 8 detik = 18 koin/jam = Rp1.800.
    expect(rows[0].coinsPerHour).toBeCloseTo(18);
    expect(rows[0].idrPerHour).toBeCloseTo(1800);
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
    expect(lambat.rows[0].coinsPerHour).toBeCloseTo(18 / 4);
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

  it("mendaftarkan setiap field EconomyConfig", () => {
    const expected = economyFieldKeys
      .filter((key) => !OUTSIDE_GROUPS.has(key))
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
