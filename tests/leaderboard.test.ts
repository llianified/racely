import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { INITIAL_GAME } from "@/lib/game";
import { lapsToOvertake, previewLeaderboard } from "@/lib/leaderboard";
import { getLeaderboard } from "@/lib/leaderboard-server";

vi.mock("@/lib/db", () => ({ pool: null }));

describe("Leaderboard", () => {
  it("requires one more completed lap, not just tying the rival", () => {
    expect(lapsToOvertake(80, 100)).toBe(21);
    expect(lapsToOvertake(100, 100)).toBe(1);
  });

  it("keeps zero-lap preview players unranked without invented rivals", () => {
    const result = previewLeaderboard(INITIAL_GAME);
    expect(result).toMatchObject({ entries: [], totalPlayers: 0, currentPlayer: null, nextRival: null, developmentPreview: true });
  });

  it("uses only the current preview session's real progress", () => {
    const result = previewLeaderboard({ ...INITIAL_GAME, laps: 42 }, new Date("2026-09-13T00:00:00Z"));
    expect(result.entries).toEqual([{ rank: 1, name: INITIAL_GAME.player.name, laps: 42, isCurrentPlayer: true }]);
    expect(result.currentPlayer).toEqual(result.entries[0]);
    expect(result.totalPlayers).toBe(1);
    expect(result.updatedAt).toBe("2026-09-13T00:00:00.000Z");
    expect(JSON.stringify(result)).not.toMatch(/balance|withdrawals|photoUrl|username|userId/);
  });

  it("does not replace a missing production database with preview data", async () => {
    await expect(getLeaderboard("123", null)).rejects.toThrow("unavailable");
  });

  it("parameterizes the authenticated identity and reads one consistent snapshot", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      entries: [{ rank: 1, name: "Racer", laps: 100, isCurrentPlayer: false }],
      current_player: { rank: 52, name: "Me", laps: 5, isCurrentPlayer: true },
      next_rival: { name: "Next", laps: 6 },
      total_players: 52,
      updated_at: new Date("2026-09-13T00:00:00Z"),
    }] });
    const userId = "1'; DROP TABLE racely_players; --";
    const result = await getLeaderboard(userId, { query } as unknown as Pick<Pool, "query">);
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][1]).toEqual([userId, 50]);
    expect(query.mock.calls[0][0]).not.toContain(userId);
    expect(result).toMatchObject({ currentPlayer: { rank: 52 }, totalPlayers: 52, developmentPreview: false, nextRival: { laps: 6 } });
    expect(result.updatedAt).toBe("2026-09-13T00:00:00.000Z");
  });
});
