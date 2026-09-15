import { z } from "zod";
import { CAR_MODEL_IDS, type CarModelId } from "./car-catalog";
import { PART_CATALOG, bodyPartsSchema } from "./car-parts";
import { NEUTRAL_SETUP, ROLLER_IDS } from "./car-setup";
import type { GameState } from "./game";

const carAppearanceSchema = z.object({
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  levels: z.object({
    engine: z.number().int().positive(),
    tires: z.number().int().positive(),
    battery: z.number().int().positive(),
  }),
  roller: z.enum(ROLLER_IDS),
  equipped: bodyPartsSchema.shape.equipped.refine(parts =>
    Object.entries(parts).every(([slot, id]) => !id || PART_CATALOG[id].slot === slot),
  ),
});

export type LeaderboardCarAppearance = z.infer<typeof carAppearanceSchema>;

export function leaderboardCar(entry: LeaderboardEntry) {
  const model = z.enum(CAR_MODEL_IDS).safeParse(entry.carModel);
  const appearance = carAppearanceSchema.safeParse(entry.carAppearance);
  return model.success && appearance.success
    ? { model: model.data, ...appearance.data }
    : null;
}

export const LEADERBOARD_LIMIT = 50;
export const LEADERBOARD_REFRESH_MS = 30_000;
export const LEADERBOARD_METRICS = ["laps", "referrals"] as const;

export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number];

export type LeaderboardEntry = {
  rank: number;
  name: string;
  score: number;
  /** Kept on lap responses for existing leaderboard consumers. */
  laps?: number;
  /**
   * Mobil yang dipakai untuk podium dan penanda mobil hadiah ajakan.
   * Bisa `null` untuk pemain yang belum memilih dan
   * hilang pada respons dari server yang lebih lama.
   */
  carModel?: CarModelId | null;
  /** Hanya tampilan terpasang, tanpa inventaris atau data pribadi pemain. */
  carAppearance?: LeaderboardCarAppearance | null;
  isCurrentPlayer: boolean;
};

export type Leaderboard = {
  metric: LeaderboardMetric;
  entries: LeaderboardEntry[];
  currentPlayer: LeaderboardEntry | null;
  nextRival: { name: string; score: number; laps?: number } | null;
  totalPlayers: number;
  updatedAt: string;
  developmentPreview: boolean;
};

export function scoreToOvertake(score: number, rivalScore: number) {
  return Math.max(1, rivalScore - score + 1);
}

export const lapsToOvertake = scoreToOvertake;

export function previewLeaderboard(
  game: Pick<GameState, "laps" | "player" | "referral" | "economy" | "color" | "levels" | "carSelection" | "setup" | "bodyParts">,
  metric: LeaderboardMetric = "laps",
  now = new Date(),
): Leaderboard {
  const score = metric === "laps"
    ? game.laps
    : Math.floor(
        game.referral.earned / game.economy.referralRewardInviter,
      );
  const currentPlayer: LeaderboardEntry | null = score > 0
    ? {
        rank: 1,
        name: game.player.name,
        score,
        ...(metric === "laps" ? { laps: score } : {}),
        carModel: game.carSelection?.model ?? null,
        carAppearance: game.carSelection?.model ? {
          color: game.color,
          levels: { ...game.levels },
          roller: game.setup?.roller ?? NEUTRAL_SETUP.roller,
          equipped: { ...game.bodyParts?.equipped },
        } : null,
        isCurrentPlayer: true,
      }
    : null;
  return {
    metric,
    entries: currentPlayer ? [currentPlayer] : [],
    currentPlayer,
    nextRival: null,
    totalPlayers: currentPlayer ? 1 : 0,
    updatedAt: now.toISOString(),
    developmentPreview: true,
  };
}
