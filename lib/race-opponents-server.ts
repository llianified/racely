import 'server-only'
import { createHash } from 'node:crypto'
import type { Pool } from 'pg'
import { pool } from './db'
import type { GameState } from './game'
import { CAR_MODEL_IDS, type CarModelId } from './car-catalog'
import { knownCarSetup } from './car-setup'
import { bodyPartsSchema } from './car-parts'
import { effectiveLapSecondsAt, type EconomyConfig } from './economy-config'
import type { RaceOpponent, RaceRivals } from './race-opponents'

const neighborsQuery = `
  WITH eligible AS NOT MATERIALIZED (
    SELECT user_id, display_name, laps, progress, created_at, car_model, color,
      engine_level, tires_level, battery_level, setup, body_parts, circuit, last_settled_at
    FROM racely_players WHERE laps > 0 AND user_id ~ '^[0-9]+$'
  ), mine AS (
    SELECT p.*, CASE WHEN p.laps > 0 THEN
      (SELECT COUNT(*) + 1 FROM eligible e WHERE e.laps > p.laps)
    END AS place
    FROM racely_players p WHERE user_id = $1 AND user_id ~ '^[0-9]+$'
  ), above AS (
    SELECT e.*, 'above' AS side FROM eligible e, mine m
    WHERE e.car_model = ANY($2::text[]) AND (
      e.laps > m.laps OR (e.laps = m.laps AND (e.created_at, e.user_id) < (m.created_at, m.user_id))
    )
    ORDER BY e.laps ASC, e.created_at DESC, e.user_id DESC LIMIT 2
  ), below AS (
    SELECT e.*, 'below' AS side FROM eligible e, mine m
    WHERE e.car_model = ANY($2::text[]) AND (
      e.laps < m.laps OR (e.laps = m.laps AND (e.created_at, e.user_id) > (m.created_at, m.user_id))
    )
    ORDER BY e.laps DESC, e.created_at ASC, e.user_id ASC LIMIT 2
  ), candidates AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY laps ASC, created_at DESC, user_id DESC) AS proximity FROM above
    UNION ALL
    SELECT *, ROW_NUMBER() OVER (ORDER BY laps DESC, created_at ASC, user_id ASC) AS proximity FROM below
  ), neighbors AS (
    SELECT * FROM candidates ORDER BY proximity, side LIMIT 2
  )
  SELECT (SELECT place::integer FROM mine) AS rank,
    COALESCE((SELECT jsonb_agg(to_jsonb(n) || jsonb_build_object(
      'rank', (SELECT COUNT(*) + 1 FROM eligible e WHERE e.laps > n.laps)
    ) ORDER BY n.laps DESC, n.created_at ASC, n.user_id ASC) FROM neighbors n), '[]'::jsonb) AS opponents,
    statement_timestamp() AS captured_at
`

type NeighborRow = {
  user_id: string; display_name: string; laps: number; progress: number;
  car_model: CarModelId; color: string; engine_level: number; tires_level: number;
  battery_level: number; setup: unknown; body_parts: unknown; circuit: number;
  last_settled_at: string; rank: number; side: RaceOpponent['side'];
}

export async function getRaceOpponents(userId: string, economy: EconomyConfig, database: Pick<Pool, 'query'> | null = pool): Promise<RaceRivals> {
  if (!database) throw new Error('Race database unavailable')
  const result = await database.query<{ rank: number | null; opponents: NeighborRow[]; captured_at: Date }>(neighborsQuery, [userId, CAR_MODEL_IDS])
  const row = result.rows[0]
  if (!row) throw new Error('Race snapshot unavailable')
  return {
    status: 'ready', rank: row.rank,
    opponents: row.opponents.map(opponent => {
      const levels = { engine: opponent.engine_level, tires: opponent.tires_level, battery: opponent.battery_level }
      const setup = knownCarSetup(opponent.setup)
      const parts = bodyPartsSchema.safeParse(opponent.body_parts)
      return {
        id: createHash('sha256').update(`race:${opponent.user_id}`).digest('hex').slice(0, 24),
        name: opponent.display_name, rank: Number(opponent.rank), side: opponent.side,
        model: opponent.car_model, color: /^#[0-9a-f]{6}$/i.test(opponent.color) ? opponent.color : '#4275ff',
        levels, setup, equipped: parts.success ? parts.data.equipped : {},
        laps: opponent.laps, progress: opponent.progress,
        seconds: effectiveLapSecondsAt(economy, levels, false, setup, opponent.circuit),
        elapsedSeconds: Math.max(0, (row.captured_at.getTime() - new Date(opponent.last_settled_at).getTime()) / 1000),
      }
    }),
  }
}

export async function withRaceOpponents(userId: string, game: GameState): Promise<GameState> {
  if (game.developmentPreview || userId.startsWith('preview:')) return { ...game, rivals: { status: 'preview', rank: null, opponents: [] } }
  try {
    return { ...game, rivals: await getRaceOpponents(userId, game.economy) }
  } catch {
    // A standings failure must not turn an already-committed claim into a failed action.
    return { ...game, rivals: { status: 'unavailable', rank: null, opponents: [] } }
  }
}
