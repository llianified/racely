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

function fundedCookie(balance: number) {
  const fresh = getPreviewGameState(request(), identity, E);
  const decoded = JSON.parse(
    Buffer.from(fresh.cookieValue, "base64url").toString("utf8"),
  );
  decoded.state.balance = balance;
  decoded.state.carSelection = { model: "luna-gt", returningPlayer: false };
  decoded.state.color = "#b9a1ed";
  return Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
}

const withdraw = {
  type: "withdraw",
  method: "dana",
  account: "081234567890",
  accountName: "Rizky Pratama",
  // Di atas `minWithdrawCoins` bawaan (200.000), di bawah maksimumnya.
  coins: 300_000,
} as const;

describe("Withdrawals stay a manual, pending-only queue", () => {
  it("records a request as pending and debits the balance immediately", () => {
    const result = performPreviewGameAction(
      request(fundedCookie(500_000)),
      identity,
      randomUUID(),
      withdraw,
      E,
    );
    expect(result.state.balance).toBe(200_000);
    expect(result.state.withdrawals).toHaveLength(1);
    expect(result.state.withdrawals[0]).toMatchObject({
      status: "pending",
      coins: 300_000,
      method: "dana",
      account: "081234567890",
      accountName: "Rizky Pratama",
    });
  });

  it("never auto-advances a withdrawal past pending", () => {
    let cookie = fundedCookie(1_000_000);
    for (let index = 0; index < 3; index += 1) {
      const step = performPreviewGameAction(
        request(cookie),
        identity,
        randomUUID(),
        withdraw,
        E,
      );
      cookie = step.cookieValue;
      expect(step.state.withdrawals.every((row) => row.status === "pending")).toBe(
        true,
      );
    }
    const later = getPreviewGameState(request(cookie), identity, E);
    expect(later.state.withdrawals.every((row) => row.status === "pending")).toBe(
      true,
    );
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
        request(fundedCookie(100_000)),
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
        request(fundedCookie(500_000)),
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
        request(fundedCookie(500_000)),
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
    // 10 koin = Rp1: kurs pecahan, dibulatkan ke bawah oleh `coinsToIdr`.
    expect(E.coinToIdr).toBe(0.1);
    expect(WITHDRAW_METHODS).toHaveLength(8);
  });
});
