import { PLAYER_RADIUS, TRACK_HALF, trackLayoutAt, type TrackLayout } from './track-layout'
import { createTrackPath } from './track-path'

// Existing oval dimensions become lateral offsets from the player's racing line.
export const RACE_TRACK_OFFSETS = {
  inner: 1.7 - PLAYER_RADIUS,
  apron: 5.25 - PLAYER_RADIUS,
  outerCurb: 4.035 - PLAYER_RADIUS,
  innerCurb: 1.765 - PLAYER_RADIUS,
} as const

type Point = { x: number; z: number }

function rectangleFits(polygon: readonly Point[], center: Point, width: number, depth: number) {
  const minX = center.x - width / 2 - .04
  const maxX = center.x + width / 2 + .04
  const minZ = center.z - depth / 2 - .04
  const maxZ = center.z + depth / 2 + .04
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i]
    if ((a.z > center.z) !== (b.z > center.z) && center.x < (b.x - a.x) * (center.z - a.z) / (b.z - a.z) + a.x) inside = !inside
    // Any polygon edge crossing the footprint makes the placement unsafe, including concave notches.
    let enter = 0, exit = 1
    for (const [origin, delta, min, max] of [[a.x, b.x - a.x, minX, maxX], [a.z, b.z - a.z, minZ, maxZ]]) {
      if (Math.abs(delta) < 1e-12) {
        if (origin < min || origin > max) { enter = 1; exit = 0; break }
      } else {
        const t1 = (min - origin) / delta, t2 = (max - origin) / delta
        enter = Math.max(enter, Math.min(t1, t2))
        exit = Math.min(exit, Math.max(t1, t2))
      }
    }
    if (enter <= exit) return false
  }
  return inside
}

export function createRaceTrack(layout: TrackLayout) {
  // Preserve the arena's original world origin, independent of the layout's shape.
  const path = createTrackPath(layout.sections, { x: -TRACK_HALF, z: -PLAYER_RADIUS, heading: 0 })
  const bounds = path.bounds(RACE_TRACK_OFFSETS.apron)
  const center = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 }
  const hole = Array.from({ length: 800 }, (_, i) => path.point(i / 800, RACE_TRACK_OFFSETS.inner))
  const buildings = [-2.7, 2.7].map(x => {
    const preferred = { x: center.x + x, z: center.z }
    return rectangleFits(hole, preferred, .64, 1.32) ? preferred : { x: preferred.x, z: bounds.maxZ + 1.2 }
  })
  const brand = rectangleFits(hole, center, 5.6, 1.4) ? center : { x: center.x, z: bounds.minZ - 1.2 }
  const startPose = (forward: number, offset: number) => path.point(forward / path.totalLength, offset, 'centerline', false)
  return {
    ...path, bounds, center, buildings, brand,
    gantry: startPose(1.8, 2.95 - PLAYER_RADIUS),
    grid: startPose(.8, .68),
    stands: [-5, -3, -1, 1, 3, 5].map(x => ({ x: center.x + x, z: bounds.maxZ + .25 })),
  }
}

const tracks = new WeakMap<TrackLayout, ReturnType<typeof createRaceTrack>>()
export function raceTrackAt(circuit: number) {
  const layout = trackLayoutAt(circuit)
  let track = tracks.get(layout)
  if (!track) { track = createRaceTrack(layout); tracks.set(layout, track) }
  return track
}
