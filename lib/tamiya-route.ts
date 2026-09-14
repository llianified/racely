import type { createTrackPath } from './track-path'

export const LANE_WIDTH = .68
export const LANE_COUNT = 3
export type TrackObstacle = { kind: 'lane-changer' | 'tabletop' | 'waves'; start: number; end: number }
type TrackPath = ReturnType<typeof createTrackPath>
const wrapLane = (lane: number) => ((lane % LANE_COUNT) + LANE_COUNT) % LANE_COUNT
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

export function createTamiyaRoute(path: TrackPath) {
  const obstacles: TrackObstacle[] = []
  let straightIndex = 0
  for (const span of path.spans) {
    if (span.primitive.kind !== 'line' || span.length < 5) continue
    const start = span.distance / path.totalLength
    const add = (kind: TrackObstacle['kind'], from: number, to: number) => obstacles.push({
      kind, start: start + from / path.totalLength, end: start + to / path.totalLength,
    })
    if (straightIndex === 0 || span.sectionId === 'bridge-straight') {
      add('lane-changer', straightIndex === 0 ? 2.1 : .5, span.length - .4)
    } else {
      const count = Math.max(2, Math.floor(span.length / 5))
      const spacing = (span.length - .8) / count
      for (let i = 0; i < count; i++) add(i % 2 ? 'waves' : 'tabletop', .4 + i * spacing, .4 + (i + 1) * spacing - .25)
    }
    straightIndex++
  }
  const changers = obstacles.filter(obstacle => obstacle.kind === 'lane-changer')

  function profile(progress: number, startingLane: number) {
    const value = Number.isFinite(progress) ? progress : 0
    const lap = Math.floor(value)
    const phase = value - lap
    let lane = wrapLane(startingLane + lap * changers.length)
    let offset = lane * LANE_WIDTH
    let height = 0
    let feature: TrackObstacle['kind'] | null = null
    for (const obstacle of obstacles) {
      if (phase >= obstacle.end) {
        if (obstacle.kind === 'lane-changer') {
          lane = wrapLane(lane + 1)
          offset = lane * LANE_WIDTH
        }
        continue
      }
      if (phase < obstacle.start) break
      const t = (phase - obstacle.start) / (obstacle.end - obstacle.start)
      feature = obstacle.kind
      if (obstacle.kind === 'lane-changer') {
        const next = wrapLane(lane + 1)
        offset = (lane + (next - lane) * smooth((t - .25) * 2)) * LANE_WIDTH
        // The outside lane climbs before crossing and descends only after clearing both lanes.
        if (lane === LANE_COUNT - 1) height = .95 * smooth(t * 4) * smooth((1 - t) * 4)
      } else if (obstacle.kind === 'tabletop') {
        height = .34 * smooth(t * 3) * smooth((1 - t) * 3)
      } else {
        height = .12 * Math.sin(t * Math.PI * 3) ** 2 * smooth(t * 8) * smooth((1 - t) * 8)
      }
      break
    }
    return { lane, offset, height, feature }
  }

  function point(progress: number, startingLane: number) {
    const current = profile(progress, startingLane)
    const center = path.point(progress, current.offset, 'centerline')
    const epsilon = .002 / path.totalLength
    const beforeProfile = profile(progress - epsilon, startingLane)
    const afterProfile = profile(progress + epsilon, startingLane)
    const before = path.point(progress - epsilon, beforeProfile.offset, 'centerline')
    const after = path.point(progress + epsilon, afterProfile.offset, 'centerline')
    const dx = after.x - before.x, dz = after.z - before.z
    return {
      ...center, ...current,
      angle: Math.atan2(dx, dz),
      pitch: -Math.atan2(afterProfile.height - beforeProfile.height, Math.hypot(dx, dz)),
    }
  }

  return { obstacles, changers, profile, point }
}
