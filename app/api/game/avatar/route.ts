import { NextResponse } from "next/server";
import { verifiedAvatarUrl } from "@/lib/telegram-avatar";

/**
 * Menyajikan ulang foto profil Telegram dari origin Racely. Lihat
 * `lib/telegram-avatar.ts` untuk alasannya.
 *
 * Sengaja TIDAK memakai `authenticateTelegramRequest`: sebuah <img> tidak bisa
 * mengirim header Authorization, jadi tidak ada initData yang bisa dibawa ke
 * sini. Yang menggantikannya adalah tanda tangan pada URL-nya -- hanya URL yang
 * diterbitkan server ini, dari initData yang sudah terverifikasi, yang akan
 * diambil. Isinya pun bukan rahasia: foto profil publik dari t.me.
 *
 * Tidak ada consumeRateLimit di sini karena tidak ada identitas pemain untuk
 * dijadikan kunci dan endpoint ini tidak menyentuh saldo. Yang membatasinya
 * adalah tanda tangan itu sendiri berikut timeout dan batas ukuran di bawah.
 */

const FETCH_TIMEOUT_MS = 5000;
/** Avatar Telegram jauh di bawah ini; yang lebih besar bukan avatar. */
const MAX_IMAGE_BYTES = 512 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];

/**
 * Telegram menyajikan sebagian avatar sebagai SVG, dan SVG bisa membawa
 * <script>. Byte-nya sekarang keluar dari origin KAMI, jadi seseorang yang
 * membuka URL ini langsung -- bukan lewat <img>, yang memang tidak pernah
 * menjalankan script -- akan menjalankannya sebagai racely.fun.
 *
 * Policy per-respons ini mematikan kemungkinan itu: tidak ada yang boleh dimuat
 * atau dijalankan, dan `sandbox` melepas dokumennya dari origin kami. Jangan
 * hapus baris ini selama image/svg+xml masih ada di ALLOWED_TYPES.
 */
const IMAGE_SANDBOX_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function blank(status: number) {
  return new NextResponse(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const target = verifiedAvatarUrl(params.get("u"), params.get("s"));
  if (!target) return blank(400);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: ALLOWED_TYPES.join(", ") },
      cache: "no-store",
    });
  } catch {
    return blank(502);
  }

  const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!upstream.ok || !ALLOWED_TYPES.includes(contentType)) {
    return blank(502);
  }

  const declaredLength = Number(upstream.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    return blank(502);
  }

  // Dibaca ke buffer, bukan dialirkan: hanya dengan begitu batas ukurannya
  // benar-benar ditegakkan pada respons yang tidak menyebutkan panjangnya.
  const body = await upstream.arrayBuffer().catch(() => null);
  if (!body || body.byteLength > MAX_IMAGE_BYTES) return blank(502);

  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      // Milik satu pemain, jadi private. Sehari cukup: URL-nya ikut berubah
      // ketika Telegram menerbitkan foto baru, jadi cache lama tidak nyangkut.
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": IMAGE_SANDBOX_POLICY,
    },
  });
}
