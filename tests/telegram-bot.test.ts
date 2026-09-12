import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTelegramReply,
  isValidWebhookSecret,
  MAX_TELEGRAM_UPDATE_BYTES,
  parsePublicAppUrl,
  sendTelegramReply,
  telegramUpdateSchema,
} from "../lib/telegram-bot";

// Exercises the in-process fallback in isolation; the Postgres claim is covered by
// tests/database.test.ts, which only runs when DATABASE_URL is present.
vi.mock("@/lib/db", () => ({ db: null, pool: null }));

import {
  claimTelegramUpdate,
  releaseTelegramUpdate,
  resetTelegramUpdateMemory,
} from "../lib/telegram-updates";

const APP_URL = "https://racely.example.com";
const SECRET = "s".repeat(48);

const message = (text: string | undefined, overrides: object = {}) => ({
  update_id: 1,
  message: {
    message_id: 10,
    chat: { id: 4242, type: "private" },
    text,
    ...overrides,
  },
});

beforeEach(() => resetTelegramUpdateMemory());
afterEach(() => vi.unstubAllEnvs());

describe("Webhook secret verification", () => {
  it("accepts only the exact configured secret", () => {
    expect(isValidWebhookSecret(SECRET, SECRET)).toBe(true);
    expect(isValidWebhookSecret(`${SECRET}x`, SECRET)).toBe(false);
    expect(isValidWebhookSecret(SECRET.slice(0, -1), SECRET)).toBe(false);
    expect(isValidWebhookSecret(`${"s".repeat(47)}t`, SECRET)).toBe(false);
  });

  it("fails closed when either side is absent", () => {
    expect(isValidWebhookSecret(null, SECRET)).toBe(false);
    expect(isValidWebhookSecret("", SECRET)).toBe(false);
    expect(isValidWebhookSecret(SECRET, undefined)).toBe(false);
    expect(isValidWebhookSecret(SECRET, "")).toBe(false);
    expect(isValidWebhookSecret(null, undefined)).toBe(false);
  });
});

describe("Public app URL parsing", () => {
  it("normalizes an https origin and strips query, hash and trailing slash", () => {
    expect(parsePublicAppUrl(`${APP_URL}/`)).toBe(APP_URL);
    expect(parsePublicAppUrl(`${APP_URL}/?a=1#frag`)).toBe(APP_URL);
  });

  it("refuses insecure, credentialed or malformed values", () => {
    expect(() => parsePublicAppUrl("http://racely.example.com")).toThrow();
    expect(() => parsePublicAppUrl("https://user:pw@racely.example.com")).toThrow();
    expect(() => parsePublicAppUrl("racely.example.com")).toThrow();
  });

  it("refuses a missing value regardless of the ambient environment", () => {
    // parsePublicAppUrl() defaults to process.env.PUBLIC_APP_URL, so passing
    // undefined reads whatever the shell exports. Both CI and the deploy
    // runbook source the env file before running this suite, so the variable is
    // set there -- pin it instead of depending on the caller's shell.
    vi.stubEnv("PUBLIC_APP_URL", "");
    try {
      expect(() => parsePublicAppUrl(undefined)).toThrow();
      expect(() => parsePublicAppUrl()).toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("Bot command replies", () => {
  it("launches the Mini App for /start and /play, including @mention suffixes", () => {
    for (const text of ["/start", "/play", "/start@RacelyBot", "/play  ref123"]) {
      const reply = buildTelegramReply(message(text), APP_URL);
      expect(reply?.chat_id).toBe(4242);
      expect(reply?.text).toContain("Mesin siap");
      expect(reply?.reply_markup.inline_keyboard[0][0].web_app.url).toBe(APP_URL);
    }
  });

  it("nudges unknown text toward /play but still offers the button", () => {
    const reply = buildTelegramReply(message("halo bot"), APP_URL);
    expect(reply?.text).toContain("/play");
    expect(reply?.reply_markup.inline_keyboard[0][0].web_app.url).toBe(APP_URL);
  });

  it("ignores non-private chats, textless messages and unrelated updates", () => {
    expect(
      buildTelegramReply(
        message("/start", { chat: { id: -100, type: "supergroup" } }),
        APP_URL,
      ),
    ).toBeNull();
    expect(buildTelegramReply(message(undefined), APP_URL)).toBeNull();
    expect(buildTelegramReply({ update_id: 2 }, APP_URL)).toBeNull();
    expect(buildTelegramReply({ nope: true }, APP_URL)).toBeNull();
  });

  it("validates the update envelope before anything else runs", () => {
    expect(telegramUpdateSchema.safeParse(message("/start")).success).toBe(true);
    expect(telegramUpdateSchema.safeParse({ update_id: -1 }).success).toBe(false);
    expect(telegramUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      telegramUpdateSchema.safeParse(message("x".repeat(5000))).success,
    ).toBe(false);
    expect(MAX_TELEGRAM_UPDATE_BYTES).toBe(65536);
  });
});

describe("Duplicate update handling", () => {
  it("claims an update_id once and rejects the retry", async () => {
    expect(await claimTelegramUpdate(9001)).toBe(true);
    expect(await claimTelegramUpdate(9001)).toBe(false);
    expect(await claimTelegramUpdate(9001)).toBe(false);
    expect(await claimTelegramUpdate(9002)).toBe(true);
  });

  it("rejects invalid update ids", async () => {
    expect(await claimTelegramUpdate(-1)).toBe(false);
    expect(await claimTelegramUpdate(1.5)).toBe(false);
    expect(await claimTelegramUpdate(Number.NaN)).toBe(false);
  });

  it("lets Telegram retry after a transient delivery failure", async () => {
    expect(await claimTelegramUpdate(9100)).toBe(true);
    await releaseTelegramUpdate(9100);
    expect(await claimTelegramUpdate(9100)).toBe(true);
  });

  it("expires memory entries so long-running processes do not grow forever", async () => {
    const start = Date.now();
    expect(await claimTelegramUpdate(9200, start)).toBe(true);
    expect(await claimTelegramUpdate(9200, start + 60_000)).toBe(false);
    expect(await claimTelegramUpdate(9200, start + 20 * 60 * 1000)).toBe(true);
  });
});

describe("Outbound bot messages", () => {
  const reply = buildTelegramReply(message("/start"), APP_URL)!;

  it("refuses to send without a well formed bot token", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    await expect(sendTelegramReply(reply)).rejects.toThrow("not configured");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "not-a-token");
    await expect(sendTelegramReply(reply)).rejects.toThrow("not configured");
  });

  it("posts to the sendMessage endpoint and surfaces Telegram rejections", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456789:TESTTOKENabcdefghijklmnopqrst");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await sendTelegramReply(reply);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/sendMessage");
    expect(JSON.parse(String(init.body))).toEqual(reply);

    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(sendTelegramReply(reply)).rejects.toThrow("Telegram rejected");
    fetchMock.mockRestore();
  });
});
