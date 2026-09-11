import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;
const MAX_INIT_DATA_LENGTH = 8192;

const telegramUserSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().url().optional(),
});

export type PlayerIdentity = {
  userId: string;
  username: string | null;
  displayName: string;
  photoUrl: string | null;
};

export const PREVIEW_SESSION_COOKIE = "racely-preview-session";

// The dev server is reachable through the v0 preview proxy under a hostname we
// cannot enumerate ahead of time, so development trusts any host. A production
// build never sets NODE_ENV to development, so the deployed app stays gated.
export function isPreviewBypassAllowed(_request: Request) {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.RACELY_ENABLE_PREVIEW !== "false"
  );
}

function getPreviewSessionId(request: Request) {
  if (
    !isPreviewBypassAllowed(request) ||
    request.headers.has("authorization")
  ) {
    return null;
  }

  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PREVIEW_SESSION_COOKIE}=`));
  const sessionId = cookie
    ? decodeURIComponent(cookie.slice(PREVIEW_SESSION_COOKIE.length + 1))
    : "";

  return z.string().uuid().safeParse(sessionId).success ? sessionId : null;
}

function createPreviewIdentity(sessionId: string): PlayerIdentity {
  return {
    userId: `preview:${sessionId}`,
    username: "preview",
    displayName: "Preview Racer",
    photoUrl: null,
  };
}

export function getOrCreatePreviewIdentity(request: Request) {
  if (
    !isPreviewBypassAllowed(request) ||
    request.headers.has("authorization")
  ) {
    return null;
  }

  const existingSessionId = getPreviewSessionId(request);
  const sessionId = existingSessionId ?? randomUUID();
  return {
    identity: createPreviewIdentity(sessionId),
    sessionId,
    isNew: !existingSessionId,
  };
}

export class TelegramAuthError extends Error {
  constructor(message = "Buka Racely melalui @RacelyBot untuk bermain.") {
    super(message);
    this.name = "TelegramAuthError";
  }
}

export function authenticateTelegramRequest(request: Request): PlayerIdentity {
  const authorization = request.headers.get("authorization");
  const initData = authorization?.startsWith("tma ")
    ? authorization.slice(4)
    : "";

  if (!initData) {
    const previewSessionId = getPreviewSessionId(request);
    if (previewSessionId) return createPreviewIdentity(previewSessionId);
    throw new TelegramAuthError();
  }
  if (initData.length > MAX_INIT_DATA_LENGTH) {
    throw new TelegramAuthError("Sesi Telegram tidak valid.");
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new TelegramAuthError("Autentikasi Racely belum dikonfigurasi.");
  }

  const params = new URLSearchParams(initData);
  const seenKeys = new Set<string>();
  for (const [key] of params) {
    if (seenKeys.has(key)) {
      throw new TelegramAuthError("Sesi Telegram tidak valid.");
    }
    seenKeys.add(key);
  }

  const receivedHash = params.get("hash");
  if (!receivedHash || !/^[a-f\d]{64}$/i.test(receivedHash)) {
    throw new TelegramAuthError("Sesi Telegram tidak valid.");
  }

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const expectedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest();
  const receivedHashBuffer = Buffer.from(receivedHash, "hex");

  if (
    receivedHashBuffer.length !== expectedHash.length ||
    !timingSafeEqual(receivedHashBuffer, expectedHash)
  ) {
    throw new TelegramAuthError("Sesi Telegram tidak valid.");
  }

  const authDate = Number(params.get("auth_date"));
  const now = Math.floor(Date.now() / 1000);
  if (
    !Number.isInteger(authDate) ||
    authDate > now + 60 ||
    now - authDate > MAX_AUTH_AGE_SECONDS
  ) {
    throw new TelegramAuthError(
      "Sesi Telegram sudah kedaluwarsa. Buka ulang Racely dari @RacelyBot.",
    );
  }

  const rawUser = params.get("user");
  if (!rawUser) {
    throw new TelegramAuthError("Data pemain Telegram tidak ditemukan.");
  }

  let decodedUser: unknown;
  try {
    decodedUser = JSON.parse(rawUser);
  } catch {
    throw new TelegramAuthError("Data pemain Telegram tidak valid.");
  }

  const user = telegramUserSchema.safeParse(decodedUser);
  if (!user.success) {
    throw new TelegramAuthError("Data pemain Telegram tidak valid.");
  }

  return {
    userId: String(user.data.id),
    username: user.data.username ?? null,
    displayName: [user.data.first_name, user.data.last_name]
      .filter(Boolean)
      .join(" "),
    photoUrl: user.data.photo_url ?? null,
  };
}
