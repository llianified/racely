import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChannelMembershipError,
  requireRacelyChannelMembership,
  resetChannelMembershipCache,
} from "../lib/channel-membership";

const BOT_TOKEN = "123456789:TESTTOKENabcdefghijklmnopqrstuvwx";
const USER_ID = "987654321";

function mockTelegramMember(
  result: Record<string, unknown>,
  options: { ok?: boolean; status?: number } = {},
) {
  const transport = vi.fn<typeof fetch>().mockImplementation(async () =>
    Response.json(
      { ok: options.ok ?? true, result },
      { status: options.status ?? 200 },
    ),
  );
  vi.stubGlobal("fetch", transport);
  return transport;
}

afterEach(() => {
  resetChannelMembershipCache();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Racely channel membership", () => {
  it.each([
    { status: "creator" },
    { status: "administrator" },
    { status: "member" },
    { status: "restricted", is_member: true },
  ])("accepts Telegram member status $status", async (member) => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
    const transport = mockTelegramMember(member);

    await expect(
      requireRacelyChannelMembership(USER_ID),
    ).resolves.toBeUndefined();
    expect(transport).toHaveBeenCalledWith(
      `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`,
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        body: JSON.stringify({ chat_id: "@RacelyApp", user_id: USER_ID }),
      }),
    );
  });

  it.each([
    { status: "left" },
    { status: "kicked" },
    { status: "restricted", is_member: false },
  ])("rejects Telegram member status $status", async (member) => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
    mockTelegramMember(member);

    await expect(requireRacelyChannelMembership(USER_ID)).rejects.toMatchObject({
      status: 403,
      code: "CHANNEL_MEMBERSHIP_REQUIRED",
    } satisfies Partial<ChannelMembershipError>);
  });

  it("caches only a successful membership check", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
    const transport = mockTelegramMember({ status: "member" });

    await requireRacelyChannelMembership(USER_ID, 1_000);
    await requireRacelyChannelMembership(USER_ID, 20_000);
    expect(transport).toHaveBeenCalledTimes(1);

    await requireRacelyChannelMembership(USER_ID, 62_000);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("does not cache a rejected membership", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
    const transport = mockTelegramMember({ status: "left" });

    await expect(requireRacelyChannelMembership(USER_ID)).rejects.toThrow();
    await expect(requireRacelyChannelMembership(USER_ID)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      "missing bot token",
      async () => {
        vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
      },
    ],
    [
      "Telegram API rejection",
      async () => {
        vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
        vi.stubGlobal(
          "fetch",
          vi
            .fn<typeof fetch>()
            .mockResolvedValue(Response.json({ ok: false }, { status: 400 })),
        );
      },
    ],
    [
      "malformed Telegram response",
      async () => {
        vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
        vi.stubGlobal(
          "fetch",
          vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true })),
        );
      },
    ],
  ] as const)("fails closed on %s", async (_, setup) => {
    await setup();
    await expect(requireRacelyChannelMembership(USER_ID)).rejects.toMatchObject({
      status: 503,
      code: "CHANNEL_MEMBERSHIP_UNAVAILABLE",
    } satisfies Partial<ChannelMembershipError>);
  });
});
