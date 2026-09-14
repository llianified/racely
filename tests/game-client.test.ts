import { afterEach, describe, expect, it, vi } from "vitest";
import { createGameActionSender } from "../components/game/game-client";
import { INITIAL_GAME, type GameCommand } from "../lib/game";

const withdraw = {
  type: "withdraw",
  coins: 100,
  method: "dana",
  account: "081234567890",
  accountName: "Test Racer",
} as const satisfies GameCommand;

function mockTransport() {
  const transport = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", transport);
  const bodyAt = (index: number) => JSON.parse(String(transport.mock.calls[index][1]?.body));
  return { transport, bodyAt, send: createGameActionSender() };
}

const success = () => Response.json(INITIAL_GAME);
const rejected = (status: number) => Response.json({ error: "Aksi ditolak" }, { status });

afterEach(() => vi.unstubAllGlobals());

describe("game action retry identity", () => {
  it.each([
    ["timeout", () => Promise.reject(new DOMException("Timed out", "TimeoutError"))],
    ["network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["server error", () => Promise.resolve(rejected(500))],
    ["request timeout", () => Promise.resolve(rejected(408))],
    ["broken success response", () => Promise.resolve(new Response("{", { status: 200 }))],
  ] as const)("reuses the exact withdrawal body after %s", async (_, fail) => {
    const { transport, bodyAt, send } = mockTransport();
    transport.mockImplementationOnce(fail).mockResolvedValueOnce(success()).mockResolvedValueOnce(success());
    await expect(send(withdraw, "signed-session")).rejects.toThrow();
    await expect(send(withdraw, "signed-session")).resolves.toEqual(INITIAL_GAME);
    expect(bodyAt(1)).toEqual(bodyAt(0));
    expect(transport.mock.calls[1][1]).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      headers: { Authorization: "tma signed-session" },
      signal: expect.any(AbortSignal),
    });
    await send(withdraw, "signed-session");
    expect(bodyAt(2).requestId).not.toBe(bodyAt(0).requestId);
  });

  it.each([400, 401, 409, 429])("creates a new request after a definite first rejection (%i)", async status => {
    const { transport, bodyAt, send } = mockTransport();
    transport.mockResolvedValueOnce(rejected(status)).mockResolvedValueOnce(success());
    await expect(send(withdraw, "session")).rejects.toMatchObject({ status });
    await send(withdraw, "session");
    expect(bodyAt(1).requestId).not.toBe(bodyAt(0).requestId);
  });

  it.each([401, 409, 429])("does not erase an uncertain request when a later retry returns %i", async status => {
    const { transport, bodyAt, send } = mockTransport();
    transport.mockRejectedValueOnce(new TypeError("Lost response"))
      .mockResolvedValueOnce(rejected(status)).mockResolvedValueOnce(success());
    await expect(send(withdraw, "session")).rejects.toThrow();
    await expect(send(withdraw, "session")).rejects.toMatchObject({ status });
    await send(withdraw, "session");
    expect(bodyAt(1)).toEqual(bodyAt(0));
    expect(bodyAt(2)).toEqual(bodyAt(0));
  });

  it("blocks a changed withdrawal until the original result is confirmed", async () => {
    const { transport, bodyAt, send } = mockTransport();
    transport.mockRejectedValueOnce(new TypeError("Lost response"))
      .mockResolvedValueOnce(success()).mockResolvedValueOnce(success());
    await expect(send(withdraw, "session")).rejects.toThrow();
    await expect(send({ ...withdraw, coins: 200 }, "session")).rejects.toMatchObject({ status: 409 });
    expect(transport).toHaveBeenCalledTimes(1);
    await send({ accountName: withdraw.accountName, account: withdraw.account, method: withdraw.method, coins: withdraw.coins, type: withdraw.type }, "session");
    expect(bodyAt(1)).toEqual(bodyAt(0));
    await send({ ...withdraw, coins: 200 }, "session");
    expect(bodyAt(2).action.coins).toBe(200);
    expect(bodyAt(2).requestId).not.toBe(bodyAt(0).requestId);
  });

  it("keeps the pending withdrawal across unrelated actions", async () => {
    const { transport, bodyAt, send } = mockTransport();
    transport.mockRejectedValueOnce(new TypeError("Lost response"))
      .mockResolvedValueOnce(success()).mockResolvedValueOnce(success());
    await expect(send(withdraw, "session")).rejects.toThrow();
    await send({ type: "sync" }, "session");
    await send(withdraw, "session");
    expect(bodyAt(2)).toEqual(bodyAt(0));
    expect(bodyAt(1).requestId).not.toBe(bodyAt(0).requestId);
  });
});
