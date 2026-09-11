import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeRateLimit,
  GAME_ACTION_RULE,
  resetRateLimits,
} from "../lib/rate-limit";

const routeSource = readFileSync("app/api/game/action/route.ts", "utf8");

describe("Balance-changing actions are rate limited per player", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("allows a burst up to the bucket capacity and then rejects", () => {
    const now = Date.now();
    for (let index = 0; index < GAME_ACTION_RULE.capacity; index += 1) {
      expect(consumeRateLimit("user:a", GAME_ACTION_RULE, now).allowed).toBe(
        true,
      );
    }
    const blocked = consumeRateLimit("user:a", GAME_ACTION_RULE, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("refills over time", () => {
    const now = Date.now();
    for (let index = 0; index < GAME_ACTION_RULE.capacity; index += 1) {
      consumeRateLimit("user:b", GAME_ACTION_RULE, now);
    }
    expect(consumeRateLimit("user:b", GAME_ACTION_RULE, now).allowed).toBe(
      false,
    );
    expect(
      consumeRateLimit("user:b", GAME_ACTION_RULE, now + 1_000).allowed,
    ).toBe(true);
  });

  it("keeps buckets isolated per player", () => {
    const now = Date.now();
    for (let index = 0; index < GAME_ACTION_RULE.capacity; index += 1) {
      consumeRateLimit("user:c", GAME_ACTION_RULE, now);
    }
    expect(consumeRateLimit("user:c", GAME_ACTION_RULE, now).allowed).toBe(
      false,
    );
    expect(consumeRateLimit("user:d", GAME_ACTION_RULE, now).allowed).toBe(
      true,
    );
  });

  it("is wired into the action route before any state mutation", () => {
    expect(routeSource).toContain("consumeRateLimit(identity.userId)");
    expect(routeSource).toContain("status: 429");
    expect(routeSource).toContain("Retry-After");
    expect(routeSource.indexOf("consumeRateLimit")).toBeLessThan(
      routeSource.indexOf("performGameAction("),
    );
  });
});
