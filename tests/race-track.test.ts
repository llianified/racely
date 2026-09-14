import { describe, expect, it } from 'vitest'
import { PLAYER_RADIUS, TRACK_HALF, TRACK_LAYOUTS, advanceTrackPose, buildTrackLayout } from '../lib/track-layout'
import { RACE_TRACK_OFFSETS, createRaceTrack, raceTrackAt } from '../lib/race-track'
import { createTrackPath } from '../lib/track-path'

function legacyTrackPoint(t: number, radius: number) {
  const straight = TRACK_HALF * 2
  const arc = Math.PI * radius
  let d = (((t % 1) + 1) % 1) * (straight * 2 + arc * 2)
  if (d < straight) return { x: -TRACK_HALF + d, z: -radius, angle: Math.PI / 2 }
  d -= straight
  if (d < arc) { const a = d / radius; return { x: TRACK_HALF + radius * Math.sin(a), z: -radius * Math.cos(a), angle: Math.PI / 2 - a } }
  d -= arc
  if (d < straight) return { x: TRACK_HALF - d, z: radius, angle: -Math.PI / 2 }
  d -= straight
  const a = d / radius
  return { x: -TRACK_HALF - radius * Math.sin(a), z: radius * Math.cos(a), angle: -Math.PI / 2 - a }
}

const radii = [...new Set([
  PLAYER_RADIUS, PLAYER_RADIUS + .68, PLAYER_RADIUS + 1.36,
  1.7, 4.1, 1.85, 3.96, 4.12, 5.25, 4.035, 1.765,
  ...[0, 1, 2].flatMap(i => [1.9 + i * .68, 2.57 + i * .68]),
  ...[1.88, 2.56, 3.24, 3.92].flatMap(r => [r, r + .035]),
  ...[1.88, 3.92].map(r => r + .045),
])]

describe('arena oval regression fence', () => {
  it.each([0, 1])('matches the old capsule across every lane, ribbon and curb in circuit %i', circuit => {
    const track = raceTrackAt(circuit)
    let maxError = 0
    for (const radius of radii) {
      const offset = radius - PLAYER_RADIUS
      const length = TRACK_HALF * 4 + Math.PI * 2 * radius
      expect(track.laneLength(offset)).toBeCloseTo(length, 12)
      const straightEnd = TRACK_HALF * 2 / length
      const boundaries = [0, straightEnd, .5, .5 + straightEnd, 1]
      const progress = [
        ...Array.from({ length: 2001 }, (_, i) => i / 2000),
        ...boundaries.flatMap(t => [t - 1e-10, t, t + 1e-10]),
        -2.35, -1, -.01, 1.35, 7.85,
      ]
      for (const t of progress) {
        const actual = track.point(t, offset), expected = legacyTrackPoint(t, radius)
        maxError = Math.max(maxError, Math.abs(actual.x - expected.x), Math.abs(actual.z - expected.z), Math.abs(actual.angle - expected.angle))
      }
    }
    expect(maxError).toBeLessThan(1e-12)
  })

  it('keeps grid, gantry, stands, buildings, brand and framing at the old poses', () => {
    for (const circuit of [0, 1]) {
      const track = raceTrackAt(circuit)
      expect(track.gantry.x).toBeCloseTo(-1.55, 12)
      expect(track.gantry.z).toBeCloseTo(-2.95, 12)
      expect(track.gantry.heading).toBe(0)
      expect(track.grid.x).toBeCloseTo(-2.55, 12)
      expect(track.grid.z).toBeCloseTo(-2.92, 12)
      for (const [i, p] of track.stands.entries()) {
        expect(p.x).toBeCloseTo(-5 + i * 2, 12)
        expect(p.z).toBeCloseTo(5.5, 12)
      }
      for (const [i, p] of track.buildings.entries()) {
        expect(p.x).toBeCloseTo(i ? 2.7 : -2.7, 12)
        expect(p.z).toBeCloseTo(0, 12)
      }
      expect(track.brand.x).toBeCloseTo(0, 12)
      expect(track.brand.z).toBeCloseTo(0, 12)
      expect(track.center.x).toBeCloseTo(0, 12)
      expect(track.center.z).toBeCloseTo(0, 12)
      expect(track.bounds.maxX - track.bounds.minX + 1.3).toBeCloseTo(18.5, 12)
      expect(track.bounds.maxZ - track.bounds.minZ + 1).toBeCloseTo(11.5, 12)
    }
  })
})

describe('data-driven visual paths', () => {
  it('follows every Apex primitive including the reverse S and hairpin', () => {
    const layout = TRACK_LAYOUTS[2], track = raceTrackAt(2)
    let expected = { x: -TRACK_HALF, z: -PLAYER_RADIUS, heading: 0 }
    let distance = 0
    for (const section of layout.sections) for (const primitive of section.geometry) {
      expected = advanceTrackPose(expected, primitive, 1)
      distance += primitive.kind === 'line' ? primitive.length : primitive.radius * Math.abs(primitive.turn)
      const actual = track.point(distance / track.totalLength, 0, 'centerline', false)
      expect(actual.x).toBeCloseTo(expected.x, 11)
      expect(actual.z).toBeCloseTo(expected.z, 11)
      expect(actual.heading).toBeCloseTo(expected.heading, 11)
    }
    expect(track.point(.3).x).not.toBeCloseTo(raceTrackAt(0).point(.3).x, 4)
  })

  it('keeps offsets perpendicular, with signed effective radii and true lane lengths', () => {
    const path = createTrackPath([{ id: 's', geometry: [
      { kind: 'arc', radius: 4, turn: Math.PI / 3 },
      { kind: 'arc', radius: 3, turn: -Math.PI / 3 },
    ] }])
    for (const offset of [-.5, 0, .68, 1.36]) {
      expect(path.laneLength(offset)).toBeCloseTo((4 + offset) * Math.PI / 3 + (3 - offset) * Math.PI / 3, 12)
      for (let i = 0; i <= 100; i++) {
        const center = path.point(i / 100, 0, 'centerline', false)
        const lane = path.point(i / 100, offset, 'centerline', false)
        expect(lane.x - center.x).toBeCloseTo(Math.sin(center.heading) * offset, 12)
        expect(lane.z - center.z).toBeCloseTo(-Math.cos(center.heading) * offset, 12)
      }
    }
    expect(() => path.point(.1, 3)).toThrow(RangeError)
    expect(() => path.point(.1, -4)).toThrow(RangeError)
  })

  it('samples constant lane speed and stays continuous at joins and lap seams', () => {
    for (const layout of TRACK_LAYOUTS) {
      const track = createRaceTrack(layout)
      for (const offset of radii.map(radius => radius - PLAYER_RADIUS)) {
        const total = track.laneLength(offset)
        let distance = 0
        for (const span of track.spans) {
          distance += span.primitive.kind === 'line' ? span.length : (span.primitive.radius + Math.sign(span.primitive.turn) * offset) * Math.abs(span.primitive.turn)
          const t = distance / total
          const before = track.point(t - 1e-8, offset), after = track.point(t + 1e-8, offset)
          expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(2e-6)
        }
        for (let i = 0; i < 100; i++) {
          const before = track.point(i / 100, offset), after = track.point(i / 100 + 1e-6, offset)
          expect(Math.hypot(after.x - before.x, after.z - before.z) / 1e-6).toBeCloseTo(total, 4)
        }
      }
    }
  })

  it('derives gantry and grid orientation even when the first primitive is an arc', () => {
    const layout = buildTrackLayout('circle', [{ id: 'loop', kind: 'corner', geometry: [{ kind: 'arc', radius: 3, turn: Math.PI * 2 }] }], 1)
    const track = createRaceTrack(layout)
    expect(track.gantry.heading).toBeCloseTo(1.8 / 3, 12)
    expect(track.grid.heading).toBeCloseTo(.8 / 3, 12)
  })

  it('keeps Apex decorations off the track and bounds every sampled apron point', () => {
    const track = raceTrackAt(2)
    const decorations = [
      ...track.buildings.map(p => ({ ...p, width: .64, depth: 1.32 })),
      ...track.stands.map(p => ({ ...p, width: 1.65, depth: .4 })),
      { ...track.brand, width: 5.6, depth: 1.4 },
    ]
    for (let i = 0; i < 1000; i++) {
      for (let band = 0; band <= 20; band++) {
        const offset = RACE_TRACK_OFFSETS.inner + (RACE_TRACK_OFFSETS.apron - RACE_TRACK_OFFSETS.inner) * band / 20
        const p = track.point(i / 1000, offset, 'centerline')
        for (const d of decorations) expect(Math.abs(p.x - d.x) > d.width / 2 || Math.abs(p.z - d.z) > d.depth / 2).toBe(true)
      }
      const p = track.point(i / 1000, RACE_TRACK_OFFSETS.apron)
      expect(p.x).toBeGreaterThanOrEqual(track.bounds.minX - 1e-12)
      expect(p.x).toBeLessThanOrEqual(track.bounds.maxX + 1e-12)
      expect(p.z).toBeGreaterThanOrEqual(track.bounds.minZ - 1e-12)
      expect(p.z).toBeLessThanOrEqual(track.bounds.maxZ + 1e-12)
    }
  })

  it('uses layout fallback and finite progress without changing gameplay layouts', () => {
    expect(raceTrackAt(99)).toBe(raceTrackAt(0))
    for (const value of [NaN, Infinity, -Infinity]) expect(raceTrackAt(0).point(value)).toEqual(raceTrackAt(0).point(0))
  })
})
