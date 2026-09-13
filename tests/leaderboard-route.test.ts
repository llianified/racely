import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/game/leaderboard/route";
import {
  getLeaderboard,
  getReferralLeaderboard,
} from "@/lib/leaderboard-server";
import { getPreviewGameState } from "@/lib/preview-game";
import { INITIAL_GAME } from "@/lib/game";
import { DEFAULT_ECONOMY } from "@/lib/economy-config";
import { resetRateLimits } from "@/lib/rate-limit";

vi.mock("@/lib/leaderboard-server", () => ({
  getLeaderboard: vi.fn(),
  getReferralLeaderboard: vi.fn(),
}));
vi.mock("@/lib/preview-game", () => ({ getPreviewGameState: vi.fn() }));
vi.mock("@/lib/economy-store", () => ({ readEconomyConfig: async () => DEFAULT_ECONOMY }));

const token = "leaderboard-test-only";
function signedRequest(metric?: string, ageSeconds = 0) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000) - ageSeconds),
    user: JSON.stringify({ id: 12345, first_name: "Racer" }),
  });
  const check = [...params].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  const url = new URL("http://localhost/api/game/leaderboard");
  url.searchParams.set("userId", "999");
  if (metric) url.searchParams.set("metric", metric);
  return new Request(url, { headers: { Authorization: `tma ${params}` } });
}
function previewRequest(metric?: string) {
  const url = new URL("http://localhost/api/game/leaderboard");
  if (metric) url.searchParams.set("metric", metric);
  return new Request(url, { headers: { Cookie: `racely-preview-session=${randomUUID()}` } });
}

const emptyLeaderboard = (metric: "laps" | "referrals") => ({
  metric,
  entries: [],
  currentPlayer: null,
  nextRival: null,
  totalPlayers: 0,
  developmentPreview: false,
  updatedAt: new Date().toISOString(),
});

beforeEach(() => {
  vi.resetAllMocks();
  resetRateLimits();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", token);
  vi.stubEnv("RACELY_ENABLE_PREVIEW", "true");
  vi.mocked(getLeaderboard).mockResolvedValue(emptyLeaderboard("laps"));
  vi.mocked(getReferralLeaderboard).mockResolvedValue(emptyLeaderboard("referrals"));
});
afterEach(() => { vi.unstubAllEnvs(); resetRateLimits(); });

describe("Leaderboard endpoint", () => {
  it("requires Telegram authentication in production, even with preview cookies", async () => {
    const response = await GET(previewRequest());
    expect(response.status).toBe(401);
    expect(getLeaderboard).not.toHaveBeenCalled();
    expect(getReferralLeaderboard).not.toHaveBeenCalled();
    expect(getPreviewGameState).not.toHaveBeenCalled();
  });

  it("rejects expired or tampered initData", async () => {
    expect((await GET(signedRequest(undefined, 86_401))).status).toBe(401);
    const request = signedRequest();
    request.headers.set("Authorization", `${request.headers.get("Authorization")}broken`);
    expect((await GET(request)).status).toBe(401);
    expect(getLeaderboard).not.toHaveBeenCalled();
  });

  it("uses the signed player, defaults to laps, and prevents shared caching", async () => {
    const response = await GET(signedRequest());
    expect(response.status).toBe(200);
    expect(getLeaderboard).toHaveBeenCalledWith("12345");
    expect(getReferralLeaderboard).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Authorization, Cookie");
    expect(response.headers.has("Set-Cookie")).toBe(false);
  });

  it("selects the referral leaderboard with a validated metric", async () => {
    const response = await GET(signedRequest("referrals"));
    expect(response.status).toBe(200);
    expect(getReferralLeaderboard).toHaveBeenCalledWith("12345");
    expect(getLeaderboard).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ metric: "referrals" });
  });

  it("rejects unknown metrics without querying a leaderboard", async () => {
    const response = await GET(signedRequest("coins"));
    expect(response.status).toBe(400);
    expect(getLeaderboard).not.toHaveBeenCalled();
    expect(getReferralLeaderboard).not.toHaveBeenCalled();
  });

  it("throttles repeated reads per authenticated player", async () => {
    for (let i = 0; i < 5; i++) expect((await GET(signedRequest())).status).toBe(200);
    const response = await GET(signedRequest());
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(getLeaderboard).toHaveBeenCalledTimes(5);
  });

  it("returns a safe retryable error without database details", async () => {
    vi.mocked(getReferralLeaderboard).mockRejectedValue(new Error("private database diagnostic"));
    const response = await GET(signedRequest("referrals"));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(await response.text()).not.toContain("private database diagnostic");
  });

  it("keeps preview metrics local and never overwrites a concurrent action's cookie", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.mocked(getPreviewGameState).mockReturnValue({
      state: {
        ...INITIAL_GAME,
        laps: 12,
        referral: { ...INITIAL_GAME.referral, earned: 50 },
      },
      cookieValue: "unused",
    });
    const lapsResponse = await GET(previewRequest());
    expect(lapsResponse.status).toBe(200);
    expect(await lapsResponse.json()).toMatchObject({ metric: "laps", totalPlayers: 1, currentPlayer: { score: 12 } });

    resetRateLimits();
    const referralResponse = await GET(previewRequest("referrals"));
    expect(referralResponse.status).toBe(200);
    expect(await referralResponse.json()).toMatchObject({ metric: "referrals", totalPlayers: 1, currentPlayer: { score: 2 } });
    expect(referralResponse.headers.has("Set-Cookie")).toBe(false);
    expect(getLeaderboard).not.toHaveBeenCalled();
    expect(getReferralLeaderboard).not.toHaveBeenCalled();
  });

  it("requires explicit preview opt-in", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RACELY_ENABLE_PREVIEW", "");
    expect((await GET(previewRequest())).status).toBe(401);
    expect(getLeaderboard).not.toHaveBeenCalled();
    expect(getReferralLeaderboard).not.toHaveBeenCalled();
    expect(getPreviewGameState).not.toHaveBeenCalled();
  });
});
