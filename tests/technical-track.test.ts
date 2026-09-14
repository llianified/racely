import { describe, expect, it } from 'vitest'
import { advanceTrackPose, primitiveLength, TECHNICAL_TRACK, TECHNICAL_TRACK_SAMPLES, technicalTrackPoint, type TrackPose } from '../lib/technical-track'

const track = TECHNICAL_TRACK

describe('visual-only technical track contract', () => {
  it('stays a candidate with uncalibrated severity, not a numeric gameplay circuit', () => {
    expect(track.status).toBe('visual-only')
    expect(track.id).toBe('technical-prototype')
    expect(track.sections.every(section => section.severity === null)).toBe(true)
    expect(track.sections.map(section => section.kind)).toEqual(['straight', 'corner', 's-curve', 'hairpin', 'straight'])
  })

  it('derives centerline fractions from exact geometry, not oval constants', () => {
    expect(track.sections.reduce((sum, section) => sum + section.lengthFraction, 0)).toBeCloseTo(1, 12)
    for (const section of track.sections) {
      const length = section.geometry.reduce((sum, primitive) => sum + primitiveLength(primitive), 0)
      expect(section.lengthFraction).toBeCloseTo(length / track.totalLength, 12)
      expect(section.lengthFraction).toBeGreaterThan(0)
    }
  })

  it('closes position and tangent analytically without a hidden connector', () => {
    let pose: TrackPose = track.start
    for (const section of track.sections) for (const primitive of section.geometry) pose = advanceTrackPose(pose, primitive, 1)
    expect(pose.x).toBeCloseTo(track.start.x, 12)
    expect(pose.z).toBeCloseTo(track.start.z, 12)
    expect(pose.heading).toBeCloseTo(2 * Math.PI, 12)
  })

  it('keeps all three lanes continuous at every primitive join and the finish seam', () => {
    let boundary = 0
    for (const section of track.sections) for (const primitive of section.geometry) {
      boundary += primitiveLength(primitive) / track.totalLength
      expect(TECHNICAL_TRACK_SAMPLES.some(sample => Math.abs(sample - boundary) < 1e-12)).toBe(true)
      for (const offset of track.laneOffsets) {
        const before = technicalTrackPoint(boundary - 1e-8, offset)
        const after = technicalTrackPoint(boundary + 1e-8, offset)
        expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(1e-5)
        expect(Math.abs(after.heading - before.heading)).toBeLessThan(1e-5)
        const start = technicalTrackPoint(0, offset)
        const finish = technicalTrackPoint(1, offset)
        expect(finish.x).toBeCloseTo(start.x, 12)
        expect(finish.z).toBeCloseTo(start.z, 12)
      }
    }
  })

  it('has a genuine direction reversal and a substantially tighter hairpin', () => {
    const s = track.sections[2].geometry
    expect(s[0].kind).toBe('arc')
    expect(s[1].kind).toBe('arc')
    if (s[0].kind !== 'arc' || s[1].kind !== 'arc') throw new Error('S must contain arcs')
    expect(s[0].turn * s[1].turn).toBeLessThan(0)
    const corner = track.sections[1].geometry[0]
    const hairpin = track.sections[3].geometry[0]
    if (corner.kind !== 'arc' || hairpin.kind !== 'arc') throw new Error('Corners must contain arcs')
    expect(hairpin.radius).toBeLessThan(corner.radius / 2)
    expect(hairpin.turn).toBe(Math.PI)
    for (const section of track.sections) for (const primitive of section.geometry) {
      if (primitive.kind === 'arc') expect(primitive.radius).toBeGreaterThan(track.laneWidth * 1.5 + .08)
    }
  })

  it('offsets lane samples normally and keeps straights straight', () => {
    for (let i = 0; i <= 100; i++) {
      const center = technicalTrackPoint(i / 100)
      const lane = technicalTrackPoint(i / 100, .46)
      expect(Math.hypot(lane.x - center.x, lane.z - center.z)).toBeCloseTo(.46, 12)
    }
    const straight = technicalTrackPoint(track.sections[0].lengthFraction / 2)
    expect(straight.x).toBeCloseTo(2.5, 12)
    expect(straight.z).toBe(0)
    expect(straight.heading).toBe(0)
    expect(technicalTrackPoint(NaN)).toEqual(technicalTrackPoint(0))
    expect(technicalTrackPoint(-1)).toEqual(technicalTrackPoint(0))
    expect(technicalTrackPoint(2)).toEqual(technicalTrackPoint(1))
  })
})
