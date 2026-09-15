import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";

/**
 * Next menerapkan header custom dengan `resHeaders[key] = value` -- kunci yang
 * sama DITIMPA, bukan ditumpuk (hanya `set-cookie` yang di-push). Lihat
 * `next/dist/server/lib/router-utils/resolve-routes.js`.
 *
 * Karena itu /admin pernah kehilangan SELURUH policy-nya: ia mencocokkan dua
 * aturan, dan aturan kedua yang hanya berisi `frame-ancestors 'none'` membuang
 * default-src, object-src, base-uri, dan form-action dari satu-satunya halaman
 * yang menyetujui pembayaran rupiah. Tidak ada typecheck, lint, atau test yang
 * bisa melihatnya -- header itu baru terbentuk saat runtime.
 */
async function cspFor(pathname: string) {
  const routes = await nextConfig.headers!();
  let policy: string | null = null;
  for (const route of routes) {
    if (!matches(route.source, pathname)) continue;
    for (const header of route.headers) {
      // Sengaja menimpa, meniru perilaku Next yang sebenarnya.
      if (header.key === "Content-Security-Policy") policy = header.value;
    }
  }
  return policy;
}

/** Cukup untuk pola yang dipakai config ini: `/(.*)`, `/admin`, `/admin/:path*`. */
function matches(source: string, pathname: string) {
  if (source === "/(.*)") return true;
  if (source.endsWith("/:path*")) {
    const base = source.slice(0, -"/:path*".length);
    return pathname === base || pathname.startsWith(`${base}/`);
  }
  return source === pathname;
}

const BASE_DIRECTIVES = [
  "default-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

function directiveFor(policy: string | null, name: string) {
  return policy
    ?.split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith(`${name} `));
}

describe("Content-Security-Policy", () => {
  it("memasang policy penuh di app pemain", async () => {
    const policy = await cspFor("/");
    expect(policy).not.toBeNull();
    for (const directive of BASE_DIRECTIVES) {
      expect(policy).toContain(directive);
    }
  });

  it("mengizinkan endpoint HTTPS dinamis Monetag tanpa membuka semua script", async () => {
    const policy = await cspFor("/");
    const connectSrc = directiveFor(policy, "connect-src");
    const scriptSrc = directiveFor(policy, "script-src");

    expect(connectSrc?.split(/\s+/)).toContain("https:");
    expect(scriptSrc).toContain("https://libtl.com");
    expect(scriptSrc?.split(/\s+/)).not.toContain("https:");
  });

  it.each(["/admin", "/admin/", "/admin/apa-saja"])(
    "mengisolasi %s dari iframe dan jaringan iklan tanpa kehilangan policy dasar",
    async (pathname) => {
      const policy = await cspFor(pathname);
      expect(policy).toContain("frame-ancestors 'none'");
      expect(directiveFor(policy, "frame-src")).toBe("frame-src 'none'");
      expect(directiveFor(policy, "connect-src")).toBe("connect-src 'self'");
      expect(policy).not.toContain("libtl.com");
      expect(policy).not.toContain("mc.yandex.ru");
      // Inti regresinya: dulu baris-baris ini hilang di /admin.
      for (const directive of BASE_DIRECTIVES) {
        expect(policy).toContain(directive);
      }
    },
  );

  /**
   * App pemain berjalan di dalam iframe Telegram, jadi ia justru TIDAK boleh
   * memasang frame-ancestors -- itu akan memutus Telegram Web.
   */
  it("tidak pernah membatasi frame-ancestors di app pemain", async () => {
    expect(await cspFor("/")).not.toContain("frame-ancestors");
  });

  /**
   * Avatar pemain pernah mati dua kali di produksi karena hal yang sama:
   * `photo_url` menunjuk ke t.me, t.me membalas 302 ke CDN-nya, dan CSP ikut
   * memeriksa host target redirect itu. Tebakan pertama (t.me saja) gagal;
   * tebakan kedua (+ *.cdn-telegram.org) juga gagal.
   *
   * Karena itu daftar host Telegram DIBUANG dari img-src dan avatar disajikan
   * ulang lewat /api/game/avatar di origin sendiri. Test ini menjaga arah itu:
   * host pihak ketiga yang kembali ke img-src berarti seseorang sedang menebak
   * lagi alih-alih memakai proxy-nya.
   */
  it("menyajikan foto profil dari origin sendiri, bukan dari host Telegram", async () => {
    const policy = await cspFor("/");
    const imgSrc = policy
      ?.split(";")
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith("img-src "));

    expect(imgSrc).toBeDefined();
    expect(imgSrc).toContain("'self'");
    expect(imgSrc).not.toContain("t.me");
    expect(imgSrc).not.toContain("telegram");
  });
});
