import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Foto profil pemain disajikan ULANG dari origin Racely, bukan ditautkan
 * langsung ke Telegram.
 *
 * Kenapa: `photo_url` di initData menunjuk ke t.me, dan t.me membalas 302 ke
 * CDN-nya. CSP memeriksa ulang host target redirect, jadi `img-src` harus
 * menyebut host CDN itu -- host yang tidak diumumkan Telegram di mana pun dan
 * sudah sekali berubah di bawah kaki kami. Menebaknya berarti avatar yang mati
 * diam-diam lagi pada tebakan berikutnya.
 *
 * Server tidak terikat CSP: ia mengikuti redirect itu sendiri lalu mengalirkan
 * byte-nya dari origin kami. `img-src 'self'` cukup, dan host CDN Telegram
 * boleh berubah sesukanya.
 *
 * URL-nya DITANDATANGANI supaya route-nya tidak menjadi proxy terbuka. Tanpa
 * tanda tangan, siapa pun bisa menyuruh server ini mengambil URL pilihannya.
 * Hanya URL yang kami terbitkan sendiri -- dari initData yang sudah lolos HMAC
 * Telegram -- yang akan diambil.
 */

const SIGNATURE_CONTEXT = "racely-avatar-v1";
/** Tanda tangan dipotong: 128 bit sudah jauh di luar jangkauan tebakan. */
const SIGNATURE_BYTES = 16;

/**
 * Host tempat Telegram menerbitkan `photo_url`. Hanya titik AWAL yang dibatasi;
 * redirect di baliknya diikuti apa adanya, dan itulah inti perbaikannya.
 */
function isTelegramPhotoHost(host: string) {
  return host === "t.me" || host === "telegram.org" || host.endsWith(".telegram.org");
}

function signingKey() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return null;
  // Dipisahkan konteksnya dari HMAC initData: kunci yang sama, tujuan berbeda,
  // jadi tanda tangan yang satu tidak pernah bisa dipakai di tempat yang lain.
  return createHmac("sha256", botToken).update(SIGNATURE_CONTEXT).digest();
}

function sign(key: Buffer, value: string) {
  return createHmac("sha256", key)
    .update(value)
    .digest()
    .subarray(0, SIGNATURE_BYTES)
    .toString("base64url");
}

/**
 * Menerjemahkan `photo_url` Telegram menjadi path di origin sendiri.
 * Mengembalikan null kalau URL-nya tidak ada, bukan milik Telegram, atau
 * tanda tangannya tidak bisa dibuat -- pemanggil menampilkan inisial nama.
 */
export function proxiedAvatarPath(photoUrl: string | null): string | null {
  if (!photoUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(photoUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !isTelegramPhotoHost(parsed.hostname)) {
    return null;
  }

  const key = signingKey();
  if (!key) return null;

  const encoded = Buffer.from(parsed.toString(), "utf8").toString("base64url");
  return `/api/game/avatar?u=${encoded}&s=${sign(key, encoded)}`;
}

/**
 * Kebalikannya, dipakai route: mengembalikan URL asli hanya kalau tanda
 * tangannya cocok dan host-nya masih milik Telegram.
 */
export function verifiedAvatarUrl(
  encoded: string | null,
  signature: string | null,
): string | null {
  if (!encoded || !signature) return null;

  const key = signingKey();
  if (!key) return null;

  const expected = Buffer.from(sign(key, encoded), "utf8");
  const received = Buffer.from(signature, "utf8");
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  // Diperiksa lagi setelah decode: tanda tangan membuktikan kami yang
  // menerbitkannya, bukan bahwa daftar host hari ini masih menerimanya.
  if (parsed.protocol !== "https:" || !isTelegramPhotoHost(parsed.hostname)) {
    return null;
  }
  return parsed.toString();
}
