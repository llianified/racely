import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { INITIAL_GAME } from "@/lib/game";
import {
  previewLeaderboard,
  scoreToOvertake,
} from "@/lib/leaderboard";
import {
  getLeaderboard,
  getReferralLeaderboard,
} from "@/lib/leaderboard-server";

vi.mock("@/lib/db", () => ({ pool: null }));

describe("Leaderboard", () => {
  it("requires one more point, not just tying the rival", () => {
    expect(scoreToOvertake(80, 100)).toBe(21);
    expect(scoreToOvertake(100, 100)).toBe(1);
  });

  it("keeps zero-score preview players unranked without invented rivals", () => {
    const laps = previewLeaderboard(INITIAL_GAME);
    const referrals = previewLeaderboard(INITIAL_GAME, "referrals");
    expect(laps).toMatchObject({ metric: "laps", entries: [], totalPlayers: 0, currentPlayer: null, nextRival: null, developmentPreview: true });
    expect(referrals).toMatchObject({ metric: "referrals", entries: [], totalPlayers: 0, currentPlayer: null });
  });

  it("uses only the current preview session's real progress", () => {
    const result = previewLeaderboard(
      { ...INITIAL_GAME, laps: 42 },
      "laps",
      new Date("2026-09-13T00:00:00Z"),
    );
    expect(result.entries).toEqual([{ rank: 1, name: INITIAL_GAME.player.name, score: 42, laps: 42, isCurrentPlayer: true }]);
    expect(result.currentPlayer).toEqual(result.entries[0]);
    expect(result.totalPlayers).toBe(1);
    expect(result.updatedAt).toBe("2026-09-13T00:00:00.000Z");
    expect(JSON.stringify(result)).not.toMatch(/balance|withdrawals|photoUrl|username|userId/);
  });

  it("derives successful preview referrals from the existing paid summary", () => {
    const result = previewLeaderboard({
      ...INITIAL_GAME,
      referral: { ...INITIAL_GAME.referral, earned: 50 },
    }, "referrals");
    expect(result).toMatchObject({
      metric: "referrals",
      currentPlayer: { score: 2, isCurrentPlayer: true },
      totalPlayers: 1,
    });
  });

  it("does not replace a missing production database with preview data", async () => {
    await expect(getLeaderboard("123", null)).rejects.toThrow("unavailable");
    await expect(getReferralLeaderboard("123", null)).rejects.toThrow("unavailable");
  });

  it("parameterizes the authenticated identity and reads one lap snapshot", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      entries: [{ rank: 1, name: "Racer", score: 100, isCurrentPlayer: false }],
      current_player: { rank: 52, name: "Me", score: 5, isCurrentPlayer: true },
      next_rival: { name: "Next", score: 6 },
      total_players: 52,
      updated_at: new Date("2026-09-13T00:00:00Z"),
    }] });
    const userId = "1'; DROP TABLE racely_players; --";
    const result = await getLeaderboard(userId, { query } as unknown as Pick<Pool, "query">);
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][1]).toEqual([userId, 50]);
    expect(query.mock.calls[0][0]).not.toContain(userId);
    expect(result).toMatchObject({ metric: "laps", currentPlayer: { rank: 52 }, totalPlayers: 52, developmentPreview: false, nextRival: { score: 6 } });
    expect(result.updatedAt).toBe("2026-09-13T00:00:00.000Z");
  });

  it("counts only paid referrals and parameterizes the referral query", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      entries: [{ rank: 1, name: "Nadia", score: 9, isCurrentPlayer: false }],
      current_player: { rank: 3, name: "Me", score: 4, isCurrentPlayer: true },
      next_rival: { name: "Rival", score: 5 },
      total_players: 12,
      updated_at: new Date("2026-09-13T00:00:00Z"),
    }] });
    const userId = "12345";
    const result = await getReferralLeaderboard(
      userId,
      { query } as unknown as Pick<Pool, "query">,
    );
    const [sql, parameters] = query.mock.calls[0];
    expect(parameters).toEqual([userId, 50]);
    expect(sql).not.toContain(userId);
    expect(sql).toMatch(/referral_paid_at IS NOT NULL/i);
    expect(sql).toMatch(/COUNT\(invitee\.user_id\)/i);
    expect(result).toMatchObject({
      metric: "referrals",
      currentPlayer: { rank: 3, score: 4 },
      nextRival: { score: 5 },
      totalPlayers: 12,
    });
  });
});
