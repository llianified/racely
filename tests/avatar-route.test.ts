import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/game/avatar/route";
import { proxiedAvatarPath } from "@/lib/telegram-avatar";

const BOT_TOKEN = "123456789:TESTTOKENabcdefghijklmnopqrstuvwx";
const PHOTO = "https://t.me/i/userpic/320/abcdefghijklmnop.jpg";
const PIXEL = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

/** Request ke path bertanda tangan yang sama dengan yang diterbitkan server. */
function signedRequest() {
  return new Request(`http://localhost${proxiedAvatarPath(PHOTO)}`);
}

function upstream(
  body: BodyInit | null,
  init: { status?: number; type?: string; length?: string } = {},
) {
  const headers = new Headers();
  if (init.type) headers.set("content-type", init.type);
  if (init.length) headers.set("content-length", init.length);
  return new Response(body, { status: init.status ?? 200, headers });
}

beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/game/avatar", () => {
  it("mengalirkan foto Telegram dari origin sendiri", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(upstream(PIXEL, { type: "image/jpeg" }));

    const response = await GET(signedRequest());

    // Inti perbaikannya: redirect t.me -> CDN diikuti DI SINI, di luar CSP.
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(PHOTO);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ redirect: "follow" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PIXEL);
  });

  /**
   * SVG dari origin sendiri bisa membawa <script>. Header ini yang menahannya
   * kalau seseorang membuka URL-nya langsung, bukan lewat <img>.
   */
  it("menyandbox avatar SVG yang disajikannya", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      upstream("<svg xmlns='http://www.w3.org/2000/svg' />", {
        type: "image/svg+xml",
      }),
    );

    const response = await GET(signedRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("menolak permintaan tanpa tanda tangan tanpa menyentuh jaringan", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await GET(
      new Request("http://localhost/api/game/avatar?u=aHR0cHM6Ly90Lm1l&s=palsu"),
    );

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["balasan bukan gambar", upstream("<html>", { type: "text/html" })],
    ["balasan gagal", upstream(null, { status: 404, type: "image/jpeg" })],
    [
      "gambar di atas batas ukuran",
      upstream(PIXEL, { type: "image/png", length: String(2 * 1024 * 1024) }),
    ],
  ])("menolak %s", async (_label, response) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    expect((await GET(signedRequest())).status).toBe(502);
  });

  it("menjawab 502 ketika upstream tidak bisa dijangkau", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    expect((await GET(signedRequest())).status).toBe(502);
  });
});
