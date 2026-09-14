import { describe, expect, it } from 'vitest'
import { raceTrackAt } from '../lib/race-track'
import { LANE_WIDTH } from '../lib/tamiya-route'
import { isClosedLoop, trackLayoutAt } from '../lib/track-layout'

describe('Tamiya multi-lane routing', () => {
  it.each([0, 1, 2])('cycles every racer through all three shared lanes on circuit %i', circuit => {
    const { route } = raceTrackAt(circuit)
    expect(route.changers.length).toBeGreaterThan(0)
    for (let racer = 0; racer < 3; racer++) {
      const visited = new Set<number>()
      for (let lap = 0; lap < 3; lap++) {
        route.changers.forEach((gate, index) => {
          const lane = route.profile(lap + gate.end + 1e-8, racer).lane
          expect(lane).toBe((racer + lap * route.changers.length + index + 1) % 3)
          visited.add(lane)
        })
      }
      expect(visited.size).toBe(3)
      expect(route.point(3, racer).offset).toBeCloseTo(racer * LANE_WIDTH, 10)
    }
  })

  it.each([0, 1, 2])('has continuous positions and slopes across gates, obstacles and lap seams on circuit %i', circuit => {
    const { route } = raceTrackAt(circuit)
    const boundaries = [0, 1, 2, 3, ...route.obstacles.flatMap(o => [o.start, o.end])]
    for (const boundary of boundaries) for (let lane = 0; lane < 3; lane++) {
      const before = route.point(boundary - 1e-8, lane)
      const after = route.point(boundary + 1e-8, lane)
      expect(Math.hypot(after.x - before.x, after.z - before.z, after.height - before.height)).toBeLessThan(1e-4)
      expect(Math.sin(after.angle)).toBeCloseTo(Math.sin(before.angle), 4)
      expect(Math.cos(after.angle)).toBeCloseTo(Math.cos(before.angle), 4)
      expect(after.pitch).toBeCloseTo(before.pitch, 4)
    }
  })

  it.each([0, 1, 2])('lifts the returning lane above both opposing lanes, never through them, on circuit %i', circuit => {
    const { route } = raceTrackAt(circuit)
    for (const gate of route.changers) {
      for (let step = 0; step <= 200; step++) {
        const phase = gate.start + (gate.end - gate.start) * step / 200
        const cars = [0, 1, 2].map(lane => route.point(phase, lane))
        for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
          if (Math.hypot(cars[a].x - cars[b].x, cars[a].z - cars[b].z) < .5) {
            expect(Math.abs(cars[a].height - cars[b].height)).toBeGreaterThan(.7)
          }
        }
      }
    }
  })

  it.each([0, 1, 2])('puts obstacles on actual straights and makes cars climb them on circuit %i', circuit => {
    const track = raceTrackAt(circuit)
    let previousEnd = 0
    for (const obstacle of track.route.obstacles) {
      expect(obstacle.start).toBeGreaterThanOrEqual(previousEnd)
      expect(obstacle.end).toBeLessThan(1)
      const midpoint = (obstacle.start + obstacle.end) / 2
      const section = track.point(midpoint, 0, 'centerline').sectionId
      expect(track.spans.find(span => span.sectionId === section)?.primitive.kind).toBe('line')
      if (obstacle.kind !== 'lane-changer') {
        for (let lane = 0; lane < 3; lane++) {
          expect(track.route.point(midpoint, lane).height).toBeGreaterThan(.05)
          const uphill = track.route.point(obstacle.start + (obstacle.end - obstacle.start) * .1, lane)
          expect(uphill.pitch).toBeLessThan(0)
        }
      }
      previousEnd = obstacle.end
    }
  })

  it('makes Apex a longer technical course with multiple obstacle zones', () => {
    const apex = trackLayoutAt(2)
    expect(isClosedLoop(apex)).toBe(true)
    expect(apex.totalLength).toBeGreaterThan(trackLayoutAt(0).totalLength * 2)
    expect(apex.sections.filter(section => section.kind === 's-curve')).toHaveLength(2)
    expect(raceTrackAt(2).route.changers).toHaveLength(2)
    expect(raceTrackAt(2).route.obstacles.length).toBeGreaterThanOrEqual(5)
  })

  it('keeps continuous-offset sampling safe without requiring cached lane lengths', () => {
    const track = raceTrackAt(2)
    expect(() => track.point(.1, 4, 'centerline')).toThrow(RangeError)
    expect(() => track.point(.1, NaN, 'centerline')).toThrow(RangeError)
    for (const progress of [NaN, Infinity, -Infinity, -2.5, 10000.2]) {
      const pose = track.route.point(progress, 0)
      for (const value of [pose.x, pose.z, pose.angle, pose.pitch, pose.height]) expect(Number.isFinite(value)).toBe(true)
    }
  })
})
