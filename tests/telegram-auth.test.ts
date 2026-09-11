import { createHmac, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticateTelegramRequest,
  getOrCreatePreviewIdentity,
  isPreviewBypassAllowed,
  PREVIEW_SESSION_COOKIE,
  TelegramAuthError,
} from "../lib/telegram-auth";

const BOT_TOKEN = "123456789:TESTTOKENabcdefghijklmnopqrstuvwx";
const USER = {
  id: 987654321,
  first_name: "Rizky",
  last_name: "Pratama",
  username: "rizky",
};

function signInitData(
  fields: Record<string, string>,
  token = BOT_TOKEN,
): string {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  params.set(
    "hash",
    createHmac("sha256", secretKey).update(dataCheckString).digest("hex"),
  );
  return params.toString();
}

function initData(
  overrides: Partial<{ authDate: number; user: unknown; token: string }> = {},
) {
  const authDate = overrides.authDate ?? Math.floor(Date.now() / 1000);
  return signInitData(
    {
      query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
      auth_date: String(authDate),
      user: JSON.stringify(overrides.user ?? USER),
    },
    overrides.token ?? BOT_TOKEN,
  );
}

const authed = (value: string) =>
  new Request("http://localhost/api/game", {
    headers: { authorization: `tma ${value}` },
  });

afterEach(() => vi.unstubAllEnvs());

describe("Telegram initData authentication", () => {
  it("accepts a correctly signed, fresh payload", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
    expect(authenticateTelegramRequest(authed(initData()))).toEqual({
      userId: "987654321",
      username: "rizky",
      displayName: "Rizky Pratama",
      photoUrl: null,
    });
  });

  it("rejects a payload signed with a different bot token", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
    const forged = initData({ token: "111111111:OTHERTOKENabcdefghijklmnopqr" });
    expect(() => authenticateTelegramRequest(authed(forged))).toThrow(
      TelegramAuthError,
    );
  });

  it("rejects a payload whose user field was tampered with after signing", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
    const params = new URLSearchParams(initData());
    params.set("user", JSON.stringify({ ...USER, id: 1 }));
    expect(() => authenticateTelegramRequest(authed(params.toString()))).toThrow(
      "Sesi Telegram tidak valid.",
    );
  });

  it("rejects a malformed or missing hash", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
    const params = new URLSearchParams(initData());
    params.set("hash", "notahash");
    expect(() => authenticateTelegramRequest(authed(params.toString()))).toThrow(
      "Sesi Telegram tidak valid.",
    );
    params.delete("hash");
    expect(() => authenticateTelegramRequest(authed(params.toString()))).toThrow(
      "Sesi Telegram tidak valid.",
    );
  });

  it("rejects duplicated keys used to smuggle a second value", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
    expect(() =>
      authenticateTelegramRequest(authed(`${initData()}&user=%7B%7D`)),
    ).toThrow("Sesi Telegram tidak valid.");
  });

  it("rejects an expired auth_date and a clock-skewed future one", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(() =>
      authenticateTelegramRequest(
        authed(initData({ authDate: nowSeconds - 24 * 60 * 60 - 30 })),
      ),
    ).toThrow("kedaluwarsa");
    expect(() =>
      authenticateTelegramRequest(
        authed(initData({ authDate: nowSeconds + 600 })),
      ),
    ).toThrow("kedaluwarsa");
  });

  it("accepts a session that is old but still inside the 24 hour window", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
    const authDate = Math.floor(Date.now() / 1000) - 23 * 60 * 60;
    expect(
      authenticateTelegramRequest(authed(initData({ authDate }))).userId,
    ).toBe("987654321");
  });

  it("rejects oversized payloads and unparsable user data", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
    expect(() => authenticateTelegramRequest(authed("a".repeat(9000)))).toThrow(
      "Sesi Telegram tidak valid.",
    );
    const broken = signInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: "{not json",
    });
    expect(() => authenticateTelegramRequest(authed(broken))).toThrow(
      "Data pemain Telegram tidak valid.",
    );
  });

  it("fails closed when the bot token is not configured", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    expect(() => authenticateTelegramRequest(authed(initData()))).toThrow(
      "Autentikasi Racely belum dikonfigurasi.",
    );
  });

  it("rejects a request with no Telegram credentials at all", () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
    expect(() =>
      authenticateTelegramRequest(new Request("http://localhost/api/game")),
    ).toThrow(TelegramAuthError);
  });
});

describe("Preview bypass gating", () => {
  const localRequest = () => new Request("http://localhost/api/game");

  it("stays off unless NODE_ENV is development and the flag is exactly true", () => {
    for (const [nodeEnv, flag] of [
      ["production", "true"],
      ["test", "true"],
      ["development", "false"],
      ["development", "1"],
      ["development", ""],
    ] as const) {
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("RACELY_ENABLE_PREVIEW", flag);
      expect(isPreviewBypassAllowed(localRequest())).toBe(false);
    }
  });

  it("is allowed for localhost in explicit development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RACELY_ENABLE_PREVIEW", "true");
    expect(isPreviewBypassAllowed(localRequest())).toBe(true);
    expect(
      isPreviewBypassAllowed(new Request("http://127.0.0.1:3000/api/game")),
    ).toBe(true);
  });

  it("refuses hosts that are not localhost or a known v0 sandbox origin", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RACELY_ENABLE_PREVIEW", "true");
    vi.stubEnv("V0_RUNTIME_URL", "");
    vi.stubEnv("V0_DEV_APP_URL", "");
    vi.stubEnv("V0_BUILD_URL", "");
    vi.stubEnv("V0_SANDBOX_URL", "");
    expect(
      isPreviewBypassAllowed(new Request("https://racely.example.com/api/game")),
    ).toBe(false);
    expect(
      isPreviewBypassAllowed(new Request("https://localhost.evil.com/api/game")),
    ).toBe(false);
  });

  it("never shadows a real Telegram session, even in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RACELY_ENABLE_PREVIEW", "true");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
    expect(getOrCreatePreviewIdentity(authed(initData()))).toBeNull();
    expect(authenticateTelegramRequest(authed(initData())).userId).toBe(
      "987654321",
    );
  });

  it("mints then reuses a namespaced preview identity", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RACELY_ENABLE_PREVIEW", "true");
    const created = getOrCreatePreviewIdentity(localRequest());
    expect(created?.isNew).toBe(true);
    expect(created?.identity.userId).toBe(`preview:${created?.sessionId}`);

    const withCookie = new Request("http://localhost/api/game", {
      headers: { cookie: `${PREVIEW_SESSION_COOKIE}=${created?.sessionId}` },
    });
    const reused = getOrCreatePreviewIdentity(withCookie);
    expect(reused?.isNew).toBe(false);
    expect(reused?.identity.userId).toBe(created?.identity.userId);
    expect(authenticateTelegramRequest(withCookie).userId).toBe(
      created?.identity.userId,
    );
  });

  it("ignores a preview cookie once the bypass is disabled", () => {
    const sessionId = randomUUID();
    const withCookie = () =>
      new Request("http://localhost/api/game", {
        headers: { cookie: `${PREVIEW_SESSION_COOKIE}=${sessionId}` },
      });
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RACELY_ENABLE_PREVIEW", "true");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
    expect(getOrCreatePreviewIdentity(withCookie())).toBeNull();
    expect(() => authenticateTelegramRequest(withCookie())).toThrow(
      TelegramAuthError,
    );
  });

  it("rejects a forged, non-uuid preview cookie", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RACELY_ENABLE_PREVIEW", "true");
    const forged = new Request("http://localhost/api/game", {
      headers: { cookie: `${PREVIEW_SESSION_COOKIE}=admin` },
    });
    expect(getOrCreatePreviewIdentity(forged)?.isNew).toBe(true);
    expect(getOrCreatePreviewIdentity(forged)?.identity.userId).not.toBe(
      "preview:admin",
    );
  });
});
