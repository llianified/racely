import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  accountPattern,
  WITHDRAW_METHODS,
  WITHDRAW_STATUS_LABEL,
} from "../lib/game";
import { DEFAULT_ECONOMY } from "../lib/economy-config";

/** Kebijakan penarikan kini bersumber config; di sini yang bawaan. */
const E = DEFAULT_ECONOMY;
import { gameActionSchema } from "../lib/game-server";
import {
  getPreviewGameState,
  performPreviewGameAction,
  PREVIEW_GAME_COOKIE,
} from "../lib/preview-game";
import {
  withdrawAmountIdr,
  withdrawBlocker,
  withdrawBlockerMessage,
} from "../lib/game-economy";

const gameServerSource = readFileSync("lib/game-server.ts", "utf8");
const identity = {
  userId: `preview:${randomUUID()}`,
  displayName: "Preview Racer",
  username: "preview",
  photoUrl: null,
  startParam: null,
};
const request = (cookie?: string) =>
  new Request("http://localhost/api/game", {
    headers: cookie ? { cookie: `${PREVIEW_GAME_COOKIE}=${cookie}` } : {},
  });

/**
 * Akun yang sudah memenuhi pagar Fase 0: cukup putaran dan cukup tua. Blok di
 * bawah menguji mekanika antreannya, bukan pagarnya -- pagar punya blok sendiri
 * di "Pagar penarikan", dan di sana justru akun mentah yang dipakai.
 */
function fundedCookie(balance: number, overrides: Record<string, unknown> = {}) {
  const fresh = getPreviewGameState(request(), identity, E);
  const decoded = JSON.parse(
    Buffer.from(fresh.cookieValue, "base64url").toString("utf8"),
  );
  decoded.state.balance = balance;
  decoded.state.laps = E.withdrawMinLaps;
  decoded.state.carSelection = { model: "luna-gt", returningPlayer: false };
  decoded.state.color = "#b9a1ed";
  decoded.createdAt =
    Date.now() - (E.withdrawMinAccountAgeDays + 1) * 24 * 60 * 60 * 1000;
  Object.assign(decoded, overrides);
  return Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
}

const rawCookie = (balance: number) => {
  const fresh = getPreviewGameState(request(), identity, E);
  const decoded = JSON.parse(
    Buffer.from(fresh.cookieValue, "base64url").toString("utf8"),
  );
  decoded.state.balance = balance;
  decoded.state.carSelection = { model: "luna-gt", returningPlayer: false };
  decoded.state.color = "#b9a1ed";
  decoded.createdAt = Date.now();
  return Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
};

const withdraw = {
  type: "withdraw",
  method: "dana",
  account: "081234567890",
  accountName: "Rizky Pratama",
  coins: 150,
} as const;

/**
 * Pagar Fase 0. Keluar-masuk antreannya tidak berubah sedikit pun: yang dijaga
 * di sini hanya siapa yang boleh ikut antre, dan berapa rupiah yang tercatat.
 */
describe("Pagar penarikan", () => {
  const ask = (cookie: string, economy = E) =>
    performPreviewGameAction(request(cookie), identity, randomUUID(), withdraw, economy);

  it("menahan akun yang belum cukup putaran", () => {
    expect(() => ask(rawCookie(500))).toThrow(/putaran/i);
  });

  it("menahan akun yang belum cukup umur", () => {
    // Putarannya sudah cukup, jadi yang tersisa hanya umur akun.
    const muda = fundedCookie(500, { createdAt: Date.now() });
    expect(() => ask(muda)).toThrow(/umur|hari/i);
  });

  it("menahan permintaan kedua selama jeda belum lewat", () => {
    const first = ask(fundedCookie(1000));
    expect(first.state.withdrawals).toHaveLength(1);
    expect(() => ask(first.cookieValue)).toThrow(/berikutnya/i);
  });

  it("melepas permintaan setelah jeda lewat", () => {
    const lewat = { ...E, withdrawCooldownDays: 0 };
    const first = ask(fundedCookie(1000), lewat);
    expect(() => ask(first.cookieValue, lewat)).not.toThrow();
  });

  it("memotong biaya dari rupiah yang dicatat, bukan dari koin", () => {
    const coins = 1000;
    expect(withdrawAmountIdr(E, coins)).toBe(
      Math.floor(coins * E.coinToIdr * (1 - E.withdrawFeePct / 100)),
    );
    // Tanpa biaya, angkanya kembali persis ke nilai koin apa adanya.
    expect(withdrawAmountIdr({ ...E, withdrawFeePct: 0 }, coins)).toBe(
      coins * E.coinToIdr,
    );
    // Saldo tetap dipotong sebesar koin yang diminta, bukan dikurangi biaya.
    const after = ask(fundedCookie(1000));
    expect(after.state.balance).toBe(1000 - withdraw.coins);
  });

  it("menyebut penghalang dengan kalimat yang sama seperti yang dibaca pemain", () => {
    const now = new Date("2026-09-13T00:00:00.000Z");
    const blocker = withdrawBlocker(
      E,
      { laps: 0, createdAt: now, lastWithdrawalAt: null },
      now,
    );
    expect(blocker).toMatchObject({ kind: "laps", need: E.withdrawMinLaps });
    expect(withdrawBlockerMessage(blocker!)).toContain("putaran");
  });

  it("melepas akun yang sudah memenuhi semuanya", () => {
    expect(
      withdrawBlocker(
        E,
        {
          laps: E.withdrawMinLaps,
          createdAt: new Date(Date.now() - (E.withdrawMinAccountAgeDays + 1) * 86_400_000),
          lastWithdrawalAt: null,
        },
        new Date(),
      ),
    ).toBeNull();
  });
});

describe("Withdrawals stay a manual, pending-only queue", () => {
  it("records a request as pending and debits the balance immediately", () => {
    const result = performPreviewGameAction(
      request(fundedCookie(500)),
      identity,
      randomUUID(),
      withdraw,
      E,
    );
    expect(result.state.balance).toBe(350);
    expect(result.state.withdrawals).toHaveLength(1);
    expect(result.state.withdrawals[0]).toMatchObject({
      status: "pending",
      coins: 150,
      method: "dana",
      account: "081234567890",
      accountName: "Rizky Pratama",
    });
  });

  it("never auto-advances a withdrawal past pending", () => {
    // Jeda antar penarikan dimatikan di sini: yang diuji adalah apakah status
    // pernah bergerak sendiri dari `pending`, dan itu butuh permintaan berulang.
    // Jeda itu diuji tersendiri di blok "Pagar penarikan".
    const noCooldown = { ...E, withdrawCooldownDays: 0 };
    let cookie = fundedCookie(1000);
    for (let index = 0; index < 3; index += 1) {
      const step = performPreviewGameAction(
        request(cookie),
        identity,
        randomUUID(),
        withdraw,
        noCooldown,
      );
      cookie = step.cookieValue;
      expect(step.state.withdrawals.every((row) => row.status === "pending")).toBe(
        true,
      );
    }
    const later = getPreviewGameState(request(cookie), identity, noCooldown);
    expect(later.state.withdrawals.every((row) => row.status === "pending")).toBe(
      true,
    );
  });

  it("menyimpan setiap kolom settlement lewat satu helper, di semua penulis", () => {
    // Ada beberapa tempat yang menulis ke tabel players; hanya sebagian yang
    // menyimpan hasil settlement (sisanya menyentuh referral dan refund).
    // Sebelum helper ini setiap penulis mengetik daftar kolomnya sendiri, jadi
    // kolom baru bisa tersimpan di satu jalur dan hilang di jalur lain tanpa
    // error apa pun. Penjaganya: payload mana pun yang menyebut kolom milik
    // settlement harus menyebutnya lewat spread, bukan satu per satu.
    const OWNED = [
      "pending", "earned", "scrap", "scrapEarned", "starterScrapAt",
      "dayKey", "dayCoins", "laps", "progress", "lastSettledAt",
    ];

    const payloads: string[] = [];
    for (const match of gameServerSource.matchAll(/\.update\(players\)\s*\n\s*\.set\(\{/g)) {
      let depth = 1;
      let index = match.index! + match[0].length;
      while (index < gameServerSource.length && depth > 0) {
        if (gameServerSource[index] === "{") depth += 1;
        if (gameServerSource[index] === "}") depth -= 1;
        index += 1;
      }
      payloads.push(gameServerSource.slice(match.index!, index));
    }
    expect(payloads.length).toBeGreaterThanOrEqual(3);

    for (const payload of payloads) {
      const named = OWNED.filter((column) =>
        new RegExp(`\\n\\s*${column}:`).test(payload),
      );
      if (named.length > 0) {
        expect(payload, `kolom settlement ditulis satu per satu: ${named.join(", ")}`)
          .toContain("...settledColumns(");
      }
    }

    // Dan helper itu sendiri harus menyebut seluruh kolomnya.
    const helper = gameServerSource.slice(
      gameServerSource.indexOf("function settledColumns"),
      gameServerSource.indexOf("export type SettledPlayer"),
    );
    for (const column of OWNED) expect(helper).toContain(`${column}:`);
  });

  it("keeps the server writer free of any payout or status mutation", () => {
    expect(gameServerSource).toContain("insert(withdrawals)");

    // The insert payload must never carry a status or a processed timestamp:
    // the column default (`pending`) is the only value the app is allowed to write.
    const insertStart = gameServerSource.indexOf("insert(withdrawals).values({");
    expect(insertStart).toBeGreaterThan(-1);
    const insertPayload = gameServerSource.slice(
      insertStart,
      gameServerSource.indexOf("});", insertStart),
    );
    expect(insertPayload).not.toMatch(/status\s*:/);
    expect(insertPayload).not.toMatch(/processedAt/);

    expect(gameServerSource).not.toMatch(/delete\(withdrawals\)/);
    expect(gameServerSource).not.toMatch(/disburse|payout|transfer/i);
  });

  it("writes nothing back to a withdrawal except the refund stamp", () => {
    // Dulu larangannya mutlak: tidak boleh ada `update(withdrawals)` sama
    // sekali. Pengembalian koin untuk penarikan yang ditolak memerlukan satu --
    // dan hanya satu -- tulisan balik, jadi larangannya dipersempit, bukan
    // dicabut. Status dan processed_at tetap milik operator; tidak ada
    // penarikan yang boleh maju menuju 'paid' dari dalam app.
    const writes = [
      ...gameServerSource.matchAll(/update\(withdrawals\)\s*\.set\(\{([^}]*)\}\)/g),
    ].map(([, body]) => body);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("refundedAt");
    expect(writes[0]).not.toMatch(/status\s*:/);
    expect(writes[0]).not.toMatch(/processedAt/);
    expect(writes[0]).not.toMatch(/coins\s*:/);
    expect(writes[0]).not.toMatch(/account/i);
  });

  it("only ever refunds a rejected withdrawal once", () => {
    // `IS NULL` pada klausa WHERE adalah seluruh penjaganya: tanpa itu setiap
    // sync akan mengembalikan koin yang sama berulang kali.
    const guard = gameServerSource.slice(
      gameServerSource.indexOf("async function refundRejectedWithdrawals"),
      gameServerSource.indexOf("returning({ coins: withdrawals.coins })"),
    );
    expect(guard).toContain('eq(withdrawals.status, "rejected")');
    expect(guard).toContain("isNull(withdrawals.refundedAt)");
  });

  it("rejects a withdrawal that exceeds the balance", () => {
    expect(() =>
      performPreviewGameAction(
        request(fundedCookie(100)),
        identity,
        randomUUID(),
        withdraw,
        E,
      ),
    ).toThrow("Saldo koin tidak cukup");
  });

  it("validates the destination account per method", () => {
    expect(accountPattern("dana").test("081234567890")).toBe(true);
    expect(accountPattern("dana").test("1234567890")).toBe(false);
    expect(accountPattern("bca").test("1234567890")).toBe(true);
    expect(() =>
      performPreviewGameAction(
        request(fundedCookie(500)),
        identity,
        randomUUID(),
        { ...withdraw, account: "1234567890" },
        E,
      ),
    ).toThrow("Nomor tujuan tidak valid");
  });

  it("enforces the method allow list and the payload shape at the API edge", () => {
    const base = { requestId: randomUUID(), action: withdraw };
    expect(gameActionSchema.safeParse(base).success).toBe(true);
    expect(
      gameActionSchema.safeParse({
        ...base,
        action: { ...withdraw, method: "paypal" },
      }).success,
    ).toBe(false);
    expect(
      gameActionSchema.safeParse({
        ...base,
        action: { ...withdraw, status: "paid" },
      }).success,
    ).toBe(false);
    // Angka yang tidak masuk akal bagi kolomnya tetap ditolak di tepi.
    expect(
      gameActionSchema.safeParse({
        ...base,
        action: { ...withdraw, coins: 0 },
      }).success,
    ).toBe(false);
    expect(
      gameActionSchema.safeParse({
        ...base,
        action: { ...withdraw, coins: 1.5 },
      }).success,
    ).toBe(false);
  });

  /**
   * Batas minimum dan maksimum pindah dari skema zod ke writer saat ekonomi
   * jadi config: skema dibangun sekali ketika modul dimuat, jadi ia tidak bisa
   * tahu batas yang baru disimpan dari panel admin. Yang dijaga di sini adalah
   * batasnya tetap ditegakkan -- sekarang di lapisan yang benar-benar membaca
   * config -- dan kedua penulis menegakkannya.
   */
  it("enforces the configured payout window in the writer, not the schema", () => {
    const belowMinimum = {
      ...withdraw,
      coins: E.minWithdrawCoins - 1,
    };
    // Tepi membiarkannya lewat: batas ini bukan lagi urusan skema.
    expect(
      gameActionSchema.safeParse({ requestId: randomUUID(), action: belowMinimum })
        .success,
    ).toBe(true);
    expect(() =>
      performPreviewGameAction(
        request(fundedCookie(500)),
        identity,
        randomUUID(),
        belowMinimum,
        E,
      ),
    ).toThrow("Penarikan minimal");

    expect(() =>
      performPreviewGameAction(
        request(fundedCookie(E.maxWithdrawCoins + 10)),
        identity,
        randomUUID(),
        { ...withdraw, coins: E.maxWithdrawCoins + 1 },
        E,
      ),
    ).toThrow("Penarikan maksimal");

    // Server ditulis manual dan terpisah dari preview -- lihat AGENTS.md.
    expect(gameServerSource).toContain("economy.minWithdrawCoins");
    expect(gameServerSource).toContain("economy.maxWithdrawCoins");
  });

  it("exposes only operator-driven statuses and a fixed conversion rate", () => {
    expect(Object.keys(WITHDRAW_STATUS_LABEL)).toEqual([
      "pending",
      "processing",
      "paid",
      "rejected",
    ]);
    expect(E.coinToIdr).toBe(100);
    expect(WITHDRAW_METHODS).toHaveLength(8);
  });
});
