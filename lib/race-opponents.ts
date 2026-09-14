import type { CarModelId } from './car-catalog'
import type { BodyParts } from './car-parts'
import type { CarSetup } from './car-setup'
import type { EconomyConfig } from './economy-config'

export type RaceOpponent = {
  id: string
  name: string
  rank: number
  side: 'above' | 'below'
  model: CarModelId
  color: string
  levels: { engine: number; tires: number; battery: number }
  setup: CarSetup
  equipped: BodyParts['equipped']
  laps: number
  progress: number
  seconds: number
  elapsedSeconds: number
}

export type RaceRivals = {
  status: 'ready' | 'preview' | 'unavailable'
  rank: number | null
  elapsedSeconds?: number
  opponents: RaceOpponent[]
}

export function opponentDistance(opponent: RaceOpponent, economy: EconomyConfig, sinceSnapshot = 0) {
  const elapsed = Math.max(0, opponent.elapsedSeconds + sinceSnapshot)
  const online = Math.min(elapsed, economy.heartbeatCapSeconds)
  const offline = Math.min(Math.max(0, elapsed - online), economy.offlineCapSeconds)
  return opponent.laps + opponent.progress + (online + offline * economy.offlineRate) / opponent.seconds
}

export function raceOrder(distance: number, rivals: RaceRivals | undefined, economy: EconomyConfig) {
  const entries: { opponent: RaceOpponent | null; distance: number; tieOrder: number }[] = [
    { opponent: null, distance, tieOrder: 1 },
    ...(rivals?.opponents ?? []).map(opponent => ({
      opponent,
      distance: opponentDistance(opponent, economy, rivals?.elapsedSeconds),
      tieOrder: opponent.side === 'above' ? 0 : 2,
    })),
  ]
  return entries.sort((a, b) => Math.abs(b.distance - a.distance) > 1e-8
    ? b.distance - a.distance
    : a.tieOrder - b.tieOrder || (a.opponent?.rank ?? 0) - (b.opponent?.rank ?? 0)
      || (a.opponent?.id ?? '').localeCompare(b.opponent?.id ?? ''))
}

export function reconcileRaceDistance(current: number, target: number, delta: number) {
  if (Math.abs(target - current) > 1) return target
  return current + (target - current) * (1 - Math.exp(-12 * Math.max(0, delta)))
}
