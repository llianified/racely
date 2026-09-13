import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Autentikasi panel admin. Terpisah total dari `lib/telegram-auth.ts`: panel ini
 * dibuka di browser desktop untuk kerja operasional (membaca nomor rekening,
 * menyetel ekonomi), bukan di dalam Telegram.
 *
 * Satu operator, satu rahasia: `RACELY_ADMIN_PASSWORD`. Kunci penanda tangan
 * sesi DITURUNKAN dari password itu, bukan env kedua -- jadi mengganti password
 * otomatis membatalkan seluruh sesi yang masih berjalan, dan tidak ada rahasia
 * kedua yang bisa lupa dirotasi.
 *
 * Tidak ada bypass development di sini. Mode preview melonggarkan gate pemain
 * supaya UI bisa dilihat tanpa Telegram; panel ini memindahkan uang, jadi
 * `pnpm dev` pun tetap meminta password.
 */
export const ADMIN_SESSION_COOKIE = "racely-admin-session";

/** Sesi kerja operator; cukup panjang untuk satu giliran memproses antrean. */
const SESSION_TTL_SECONDS = 8 * 60 * 60;

/**
 * Panel ini menyetujui pembayaran rupiah, jadi password pendek ditolak sebagai
 * "belum dikonfigurasi" -- bukan diterima diam-diam. Lebih baik panelnya mati
 * daripada dijaga enam karakter.
 */
const MIN_PASSWORD_LENGTH = 16;

const sessionPayloadSchema = z
  .object({
    v: z.literal(1),
    iat: z.number().int().positive(),
    exp: z.number().int().positive(),
  })
  .strict();

export function adminPassword() {
  const password = process.env.RACELY_ADMIN_PASSWORD ?? "";
  return password.length >= MIN_PASSWORD_LENGTH ? password : null;
}

/** False berarti panel dimatikan: env belum diisi, atau passwordnya terlalu pendek. */
export function isAdminConfigured() {
  return adminPassword() !== null;
}

function signingKey(password: string) {
  return createHmac("sha256", "racely-admin-session-v1")
    .update(password)
    .digest();
}

function sign(payload: string, password: string) {
  return createHmac("sha256", signingKey(password))
    .update(payload)
    .digest("hex");
}

function safeEqualHex(left: string, right: string) {
  if (left.length !== right.length || !/^[a-f\d]+$/i.test(left)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

/** Perbandingan password tanpa membocorkan panjang lewat waktu eksekusi. */
export function verifyAdminPassword(candidate: string) {
  const password = adminPassword();
  if (!password) return false;
  const expected = createHmac("sha256", "racely-admin-password-v1")
    .update(password)
    .digest();
  const received = createHmac("sha256", "racely-admin-password-v1")
    .update(candidate)
    .digest();
  return timingSafeEqual(received, expected);
}

export function createAdminSession(now = Date.now()) {
  const password = adminPassword();
  if (!password) throw new Error("Admin panel is not configured.");
  const issuedAt = Math.floor(now / 1000);
  const payload = Buffer.from(
    JSON.stringify({ v: 1, iat: issuedAt, exp: issuedAt + SESSION_TTL_SECONDS }),
    "utf8",
  ).toString("base64url");
  return {
    value: `${payload}.${sign(payload, password)}`,
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function verifyAdminSession(token: string, now = Date.now()) {
  const password = adminPassword();
  if (!password || !token) return false;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!safeEqualHex(signature, sign(payload, password))) return false;

  try {
    const parsed = sessionPayloadSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (!parsed.success) return false;
    return parsed.data.exp * 1000 > now;
  } catch {
    return false;
  }
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : "";
}

export function isAuthenticatedAdmin(request: Request, now = Date.now()) {
  return verifyAdminSession(readCookie(request, ADMIN_SESSION_COOKIE), now);
}

/**
 * Panel tidak pernah berada di dalam iframe, jadi `SameSite=Lax` bisa dipakai --
 * berbeda dari cookie pemain yang butuh `None` karena Telegram meng-iframe app.
 * Lax sudah menahan POST lintas situs, yang merupakan seluruh permukaan CSRF di
 * sini; pemeriksaan Origin di bawah adalah lapis keduanya.
 */
export function adminCookieOptions(request: Request, maxAge: number) {
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const isHttps =
    (forwardedProto ?? new URL(request.url).protocol.replace(":", "")) ===
    "https";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isHttps,
    path: "/",
    maxAge,
  };
}

/**
 * Setiap permintaan yang mengubah sesuatu harus datang dari asal yang sama.
 * Permintaan tanpa header Origin (curl, beberapa klien lama) tetap diterima:
 * yang ditolak hanya Origin yang ADA dan berbeda -- pola browser inilah yang
 * dipakai CSRF.
 */
export function hasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/**
 * Berapa proxy yang benar-benar ada di depan Racely. Dipakai memilih hop mana di
 * `X-Forwarded-For` yang boleh dipercaya; lihat `clientAddress`.
 */
export function trustedProxyHops(
  value = process.env.RACELY_TRUSTED_PROXY_HOPS,
) {
  const parsed = Number(value ?? 1);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 8 ? parsed : 1;
}

/**
 * Kunci rate limit login: satu ember per alamat, bukan per sesi.
 *
 * Dibaca dari KANAN, bukan kiri. `X-Forwarded-For` itu daftar yang di-APPEND
 * setiap hop -- ALB menambahkan alamat peer TCP-nya ke apa pun yang sudah
 * dikirim klien. Jadi entri pertama sepenuhnya milik klien: mengambilnya berarti
 * penyerang bisa memberi dirinya ember rate limit baru untuk setiap tebakan
 * password, dan menuliskan alamat palsu ke `racely_admin_audit`. Entri ke-N dari
 * kanan (N = jumlah proxy terpercaya) adalah yang ditulis proxy kita sendiri,
 * satu-satunya bagian daftar yang tidak bisa dikarang klien.
 */
export function clientAddress(request: Request, hops = trustedProxyHops()) {
  const chain = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  // Rantai yang lebih pendek dari jumlah hop berarti permintaan tidak lewat
  // seluruh proxy itu; pakai entri terkiri yang ada, bukan indeks negatif.
  const trusted = chain.length > 0 ? chain[Math.max(0, chain.length - hops)] : "";
  return trusted || request.headers.get("x-real-ip") || "unknown";
}
