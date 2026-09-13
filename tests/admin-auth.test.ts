import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_COOKIE,
  adminCookieOptions,
  clientAddress,
  createAdminSession,
  hasSameOrigin,
  isAdminConfigured,
  isAuthenticatedAdmin,
  trustedProxyHops,
  verifyAdminPassword,
  verifyAdminSession,
} from "../lib/admin-auth";

const PASSWORD = "rahasia-operator-yang-panjang";
const previous = process.env.RACELY_ADMIN_PASSWORD;
const previousPublicAppUrl = process.env.PUBLIC_APP_URL;

beforeEach(() => {
  process.env.RACELY_ADMIN_PASSWORD = PASSWORD;
  process.env.PUBLIC_APP_URL = "https://racely.fun";
});
afterEach(() => {
  if (previous === undefined) delete process.env.RACELY_ADMIN_PASSWORD;
  else process.env.RACELY_ADMIN_PASSWORD = previous;
  if (previousPublicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
  else process.env.PUBLIC_APP_URL = previousPublicAppUrl;
});

const request = (init?: { cookie?: string; origin?: string; url?: string }) =>
  new Request(init?.url ?? "https://racely.fun/api/admin/overview", {
    headers: {
      ...(init?.cookie ? { cookie: init.cookie } : {}),
      ...(init?.origin ? { origin: init.origin } : {}),
    },
  });

describe("Konfigurasi panel admin", () => {
  it("mati total tanpa password", () => {
    delete process.env.RACELY_ADMIN_PASSWORD;
    expect(isAdminConfigured()).toBe(false);
    expect(verifyAdminPassword("apa pun")).toBe(false);
  });

  /**
   * Panel ini menyetujui pembayaran rupiah. Password pendek diperlakukan sebagai
   * "belum dikonfigurasi" -- lebih baik panelnya tidak menyala daripada dijaga
   * enam karakter yang bisa ditebak.
   */
  it("menolak password yang terlalu pendek sebagai belum dikonfigurasi", () => {
    process.env.RACELY_ADMIN_PASSWORD = "pendek";
    expect(isAdminConfigured()).toBe(false);
    expect(verifyAdminPassword("pendek")).toBe(false);
  });

  it("menerima password yang benar dan menolak yang lain", () => {
    expect(verifyAdminPassword(PASSWORD)).toBe(true);
    expect(verifyAdminPassword(`${PASSWORD}x`)).toBe(false);
    expect(verifyAdminPassword("")).toBe(false);
    // Panjang yang berbeda tidak boleh melempar; hanya mengembalikan false.
    expect(verifyAdminPassword("a")).toBe(false);
  });
});

describe("Sesi admin", () => {
  it("menandatangani sesi yang bisa diverifikasi kembali", () => {
    const session = createAdminSession();
    expect(verifyAdminSession(session.value)).toBe(true);
    expect(
      isAuthenticatedAdmin(
        request({ cookie: `${ADMIN_SESSION_COOKIE}=${session.value}` }),
      ),
    ).toBe(true);
  });

  it("menolak tanda tangan yang diubah", () => {
    const session = createAdminSession();
    const [payload, signature] = session.value.split(".");
    // Karakter terakhir ditukar ke nilai yang pasti berbeda: menambahkan "0"
    // begitu saja tidak mengubah apa pun satu dari enam belas kali.
    const last = signature.slice(-1);
    const tampered = `${signature.slice(0, -1)}${last === "0" ? "1" : "0"}`;
    expect(verifyAdminSession(`${payload}.${tampered}`)).toBe(false);
    expect(verifyAdminSession(`${payload}.bukan-hex`)).toBe(false);
    expect(verifyAdminSession(payload)).toBe(false);
    expect(verifyAdminSession("")).toBe(false);
  });

  it("menolak muatan yang ditukar meski panjangnya sama", () => {
    const session = createAdminSession();
    const [, signature] = session.value.split(".");
    const palsu = Buffer.from(
      JSON.stringify({ v: 1, iat: 1, exp: 9_999_999_999 }),
      "utf8",
    ).toString("base64url");
    expect(verifyAdminSession(`${palsu}.${signature}`)).toBe(false);
  });

  it("kedaluwarsa setelah jendelanya lewat", () => {
    const now = Date.UTC(2026, 8, 12, 12, 0, 0);
    const session = createAdminSession(now);
    expect(verifyAdminSession(session.value, now + 1000)).toBe(true);
    expect(
      verifyAdminSession(session.value, now + (session.maxAge - 1) * 1000),
    ).toBe(true);
    expect(
      verifyAdminSession(session.value, now + (session.maxAge + 1) * 1000),
    ).toBe(false);
  });

  /**
   * Kunci penanda tangan diturunkan dari password, bukan rahasia kedua. Itu yang
   * membuat mengganti password otomatis memutus seluruh sesi yang berjalan.
   */
  it("membatalkan sesi lama saat password diganti", () => {
    const session = createAdminSession();
    process.env.RACELY_ADMIN_PASSWORD = `${PASSWORD}-sudah-dirotasi`;
    expect(verifyAdminSession(session.value)).toBe(false);
  });

  it("menolak sesi apa pun setelah password dihapus", () => {
    const session = createAdminSession();
    delete process.env.RACELY_ADMIN_PASSWORD;
    expect(verifyAdminSession(session.value)).toBe(false);
  });
});

describe("Cookie dan asal permintaan", () => {
  /**
   * Berbeda dari cookie pemain: app pemain selalu di dalam iframe Telegram dan
   * karenanya butuh SameSite=None. Panel tidak pernah di-iframe, jadi Lax --
   * yang sekaligus menahan POST lintas situs.
   */
  it("memakai SameSite=Lax dan Secure di atas HTTPS", () => {
    const options = adminCookieOptions(request(), 3600);
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 3600,
    });
  });

  it("melepas Secure di HTTP lokal supaya pnpm dev tetap bisa masuk", () => {
    const options = adminCookieOptions(
      request({ url: "http://localhost:3000/api/admin/session" }),
      3600,
    );
    expect(options.secure).toBe(false);
  });

  it("menerima Origin publik saat URL request memakai alamat internal proxy", () => {
    expect(
      hasSameOrigin(
        request({
          origin: "https://racely.fun",
          url: "http://localhost:3000/api/admin/session",
        }),
      ),
    ).toBe(true);
  });

  it("menolak Origin lintas situs, protokol berbeda, dan konfigurasi rusak", () => {
    expect(hasSameOrigin(request({ origin: "https://racely.fun" }))).toBe(true);
    expect(hasSameOrigin(request({ origin: "http://racely.fun" }))).toBe(false);
    expect(hasSameOrigin(request({ origin: "https://penyerang.test" }))).toBe(
      false,
    );
    expect(hasSameOrigin(request({ origin: "bukan-url" }))).toBe(false);

    process.env.PUBLIC_APP_URL = "bukan-url";
    expect(
      hasSameOrigin(
        request({
          origin: "https://racely.fun",
          url: "http://localhost:3000/api/admin/session",
        }),
      ),
    ).toBe(false);

    // Tanpa header Origin sama sekali (curl, klien lama) tetap diterima.
    expect(hasSameOrigin(request())).toBe(true);
  });

  it("membaca alamat klien dari hop yang ditulis proxy sendiri, bukan dari klien", () => {
    const forwarded = (chain: string) =>
      new Request("https://racely.fun/api/admin/session", {
        headers: { "x-forwarded-for": chain },
      });

    // Satu proxy (ALB) meng-APPEND alamat peer TCP-nya, jadi hop terakhir itu
    // milik kita. Entri di depannya dikirim klien dan tidak boleh dipercaya --
    // kalau dibaca, satu penyerang bisa mencetak ember rate limit tak terbatas.
    expect(clientAddress(forwarded("203.0.113.7"))).toBe("203.0.113.7");
    expect(clientAddress(forwarded("9.9.9.9, 203.0.113.7"))).toBe("203.0.113.7");
    expect(clientAddress(forwarded("palsu, juga-palsu, 203.0.113.7"))).toBe(
      "203.0.113.7",
    );

    // Dua proxy terpercaya (CDN -> ALB): hop kedua dari kanan yang asli.
    expect(clientAddress(forwarded("palsu, 203.0.113.7, 10.0.0.1"), 2)).toBe(
      "203.0.113.7",
    );
    // Rantai lebih pendek dari jumlah hop: pakai yang terkiri, jangan membaca
    // indeks negatif yang justru memulangkan entri karangan klien.
    expect(clientAddress(forwarded("203.0.113.7"), 2)).toBe("203.0.113.7");

    expect(clientAddress(request())).toBe("unknown");
  });

  it("memakai satu proxy sebagai bawaan dan menolak hop count yang tidak masuk akal", () => {
    expect(trustedProxyHops(undefined)).toBe(1);
    expect(trustedProxyHops("2")).toBe(2);
    for (const nonsense of ["0", "-3", "9", "dua", "1.5", ""]) {
      expect(trustedProxyHops(nonsense)).toBe(1);
    }
  });
});
