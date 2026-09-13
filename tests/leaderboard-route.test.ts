import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/game/leaderboard/route";
import { getLeaderboard } from "@/lib/leaderboard-server";
import { getPreviewGameState } from "@/lib/preview-game";
import { INITIAL_GAME } from "@/lib/game";
import { DEFAULT_ECONOMY } from "@/lib/economy-config";
import { resetRateLimits } from "@/lib/rate-limit";

vi.mock("@/lib/leaderboard-server", () => ({ getLeaderboard: vi.fn() }));
vi.mock("@/lib/preview-game", () => ({ getPreviewGameState: vi.fn() }));
vi.mock("@/lib/economy-store", () => ({ readEconomyConfig: async () => DEFAULT_ECONOMY }));

const token = "leaderboard-test-only";
function signedRequest(ageSeconds = 0) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000) - ageSeconds),
    user: JSON.stringify({ id: 12345, first_name: "Racer" }),
  });
  const check = [...params].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return new Request("http://localhost/api/game/leaderboard?userId=999", { headers: { Authorization: `tma ${params}` } });
}
function previewRequest() {
  return new Request("http://localhost/api/game/leaderboard", { headers: { Cookie: `racely-preview-session=${randomUUID()}` } });
}

beforeEach(() => {
  vi.resetAllMocks();
  resetRateLimits();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", token);
  vi.stubEnv("RACELY_ENABLE_PREVIEW", "true");
  vi.mocked(getLeaderboard).mockResolvedValue({ entries: [], currentPlayer: null, nextRival: null, totalPlayers: 0, developmentPreview: false, updatedAt: new Date().toISOString() });
});
afterEach(() => { vi.unstubAllEnvs(); resetRateLimits(); });

describe("Leaderboard endpoint", () => {
  it("requires Telegram authentication in production, even with preview cookies", async () => {
    const response = await GET(previewRequest());
    expect(response.status).toBe(401);
    expect(getLeaderboard).not.toHaveBeenCalled();
    expect(getPreviewGameState).not.toHaveBeenCalled();
  });

  it("rejects expired or tampered initData", async () => {
    expect((await GET(signedRequest(86_401))).status).toBe(401);
    const request = signedRequest();
    request.headers.set("Authorization", `${request.headers.get("Authorization")}broken`);
    expect((await GET(request)).status).toBe(401);
    expect(getLeaderboard).not.toHaveBeenCalled();
  });

  it("uses the signed player, not a query parameter, and prevents shared caching", async () => {
    const response = await GET(signedRequest());
    expect(response.status).toBe(200);
    expect(getLeaderboard).toHaveBeenCalledWith("12345");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Authorization, Cookie");
    expect(response.headers.has("Set-Cookie")).toBe(false);
  });

  it("throttles repeated reads per authenticated player", async () => {
    for (let i = 0; i < 5; i++) expect((await GET(signedRequest())).status).toBe(200);
    const response = await GET(signedRequest());
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(getLeaderboard).toHaveBeenCalledTimes(5);
  });

  it("returns a safe retryable error without database details", async () => {
    vi.mocked(getLeaderboard).mockRejectedValue(new Error("private database diagnostic"));
    const response = await GET(signedRequest());
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(await response.text()).not.toContain("private database diagnostic");
  });

  it("keeps preview local and never overwrites a concurrent action's cookie", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.mocked(getPreviewGameState).mockReturnValue({ state: { ...INITIAL_GAME, laps: 12 }, cookieValue: "unused" });
    const response = await GET(previewRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ developmentPreview: true, totalPlayers: 1, currentPlayer: { laps: 12 } });
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(getLeaderboard).not.toHaveBeenCalled();
  });

  it("requires explicit preview opt-in", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RACELY_ENABLE_PREVIEW", "");
    expect((await GET(previewRequest())).status).toBe(401);
    expect(getLeaderboard).not.toHaveBeenCalled();
    expect(getPreviewGameState).not.toHaveBeenCalled();
  });
});
