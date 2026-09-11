import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  accountPattern,
  COIN_TO_IDR,
  MIN_WITHDRAW_COINS,
  WITHDRAW_METHODS,
  WITHDRAW_STATUS_LABEL,
} from "../lib/game";
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
};
const request = (cookie?: string) =>
  new Request("http://localhost/api/game", {
    headers: cookie ? { cookie: `${PREVIEW_GAME_COOKIE}=${cookie}` } : {},
  });

function fundedCookie(balance: number) {
  const fresh = getPreviewGameState(request(), identity);
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
  coins: 150,
} as const;

describe("Withdrawals stay a manual, pending-only queue", () => {
  it("records a request as pending and debits the balance immediately", () => {
    const result = performPreviewGameAction(
      request(fundedCookie(500)),
      identity,
      randomUUID(),
      withdraw,
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
    let cookie = fundedCookie(1000);
    for (let index = 0; index < 3; index += 1) {
      const step = performPreviewGameAction(
        request(cookie),
        identity,
        randomUUID(),
        withdraw,
      );
      cookie = step.cookieValue;
      expect(step.state.withdrawals.every((row) => row.status === "pending")).toBe(
        true,
      );
    }
    const later = getPreviewGameState(request(cookie), identity);
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

    expect(gameServerSource).not.toMatch(/update\(withdrawals\)/);
    expect(gameServerSource).not.toMatch(/delete\(withdrawals\)/);
    expect(gameServerSource).not.toMatch(/disburse|payout|transfer/i);
  });

  it("rejects a withdrawal that exceeds the balance", () => {
    expect(() =>
      performPreviewGameAction(
        request(fundedCookie(100)),
        identity,
        randomUUID(),
        withdraw,
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
      ),
    ).toThrow("Nomor tujuan tidak valid");
  });

  it("enforces the minimum payout and the method allow list at the API edge", () => {
    const base = { requestId: randomUUID(), action: withdraw };
    expect(gameActionSchema.safeParse(base).success).toBe(true);
    expect(
      gameActionSchema.safeParse({
        ...base,
        action: { ...withdraw, coins: MIN_WITHDRAW_COINS - 1 },
      }).success,
    ).toBe(false);
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
  });

  it("exposes only operator-driven statuses and a fixed conversion rate", () => {
    expect(Object.keys(WITHDRAW_STATUS_LABEL)).toEqual([
      "pending",
      "processing",
      "paid",
      "rejected",
    ]);
    expect(COIN_TO_IDR).toBe(100);
    expect(WITHDRAW_METHODS).toHaveLength(8);
  });
});
