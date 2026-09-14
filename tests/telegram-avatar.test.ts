import { afterEach, describe, expect, it, vi } from "vitest";
import { proxiedAvatarPath, verifiedAvatarUrl } from "../lib/telegram-avatar";

const BOT_TOKEN = "123456789:TESTTOKENabcdefghijklmnopqrstuvwx";
const PHOTO = "https://t.me/i/userpic/320/abcdefghijklmnop.jpg";

function withToken(token = BOT_TOKEN) {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", token);
}

/**
 * `vi.stubEnv` menyetel nilai; ia tidak bisa menghilangkan kunci yang sudah ada
 * di lingkungan. EC2 dan `.env.*.local` memang menyediakan TELEGRAM_BOT_TOKEN,
 * jadi tanpa penghapusan eksplisit kasus "token tidak ada" diam-diam berjalan
 * dengan token asli dan lulus tanpa menguji apa pun.
 */
function withoutToken() {
  const previous = process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  return () => {
    if (previous !== undefined) process.env.TELEGRAM_BOT_TOKEN = previous;
  };
}

/** `/api/game/avatar?u=..&s=..` -> kedua parameternya. */
function parts(path: string) {
  const params = new URL(path, "https://racely.fun").searchParams;
  return { u: params.get("u"), s: params.get("s") };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxiedAvatarPath", () => {
  it("menerjemahkan foto Telegram ke path di origin sendiri", () => {
    withToken();
    const path = proxiedAvatarPath(PHOTO);
    expect(path).toMatch(/^\/api\/game\/avatar\?u=[\w-]+&s=[\w-]+$/);
  });

  it("memutar balik ke URL yang sama lewat verifiedAvatarUrl", () => {
    withToken();
    const { u, s } = parts(proxiedAvatarPath(PHOTO)!);
    expect(verifiedAvatarUrl(u, s)).toBe(PHOTO);
  });

  it("mengembalikan null untuk pemain tanpa foto", () => {
    withToken();
    expect(proxiedAvatarPath(null)).toBeNull();
  });

  /**
   * Route-nya akan MENGAMBIL URL ini dari server. Host di luar Telegram tidak
   * boleh pernah sampai ke sana, bahkan kalau suatu saat ada jalur lain yang
   * memasukkan URL ke fungsi ini.
   */
  it.each([
    "https://contoh.test/avatar.jpg",
    "http://t.me/i/userpic/320/x.jpg",
    "https://t.me.penyerang.test/x.jpg",
    "bukan-url",
  ])("menolak %s", (url) => {
    withToken();
    expect(proxiedAvatarPath(url)).toBeNull();
  });

  it("mengembalikan null tanpa TELEGRAM_BOT_TOKEN, bukan URL mentah", () => {
    const restore = withoutToken();
    try {
      expect(proxiedAvatarPath(PHOTO)).toBeNull();
    } finally {
      restore();
    }
  });
});

describe("verifiedAvatarUrl", () => {
  it("menolak URL yang tidak kami tandatangani", () => {
    withToken();
    const encoded = Buffer.from("https://t.me/i/userpic/320/lain.jpg").toString(
      "base64url",
    );
    expect(verifiedAvatarUrl(encoded, "tandatanganpalsu")).toBeNull();
  });

  /** Inti dari tanda tangannya: route ini tidak boleh jadi proxy terbuka. */
  it("menolak payload yang ditukar setelah ditandatangani", () => {
    withToken();
    const { s } = parts(proxiedAvatarPath(PHOTO)!);
    const swapped = Buffer.from("https://t.me/i/userpic/320/lain.jpg").toString(
      "base64url",
    );
    expect(verifiedAvatarUrl(swapped, s)).toBeNull();
  });

  it("menolak tanda tangan dari bot token yang berbeda", () => {
    withToken();
    const { u, s } = parts(proxiedAvatarPath(PHOTO)!);
    withToken("987654321:TOKENLAINabcdefghijklmnopqrstuv");
    expect(verifiedAvatarUrl(u, s)).toBeNull();
  });

  it("menolak parameter yang hilang", () => {
    withToken();
    expect(verifiedAvatarUrl(null, null)).toBeNull();
  });
});
