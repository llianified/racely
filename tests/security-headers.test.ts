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

describe("Content-Security-Policy", () => {
  it("memasang policy penuh di app pemain", async () => {
    const policy = await cspFor("/");
    expect(policy).not.toBeNull();
    for (const directive of BASE_DIRECTIVES) {
      expect(policy).toContain(directive);
    }
  });

  it.each(["/admin", "/admin/", "/admin/apa-saja"])(
    "menahan %s dari iframe TANPA kehilangan policy dasarnya",
    async (pathname) => {
      const policy = await cspFor(pathname);
      expect(policy).toContain("frame-ancestors 'none'");
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
});
