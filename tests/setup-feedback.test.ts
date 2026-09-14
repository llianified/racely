import { describe, expect, it } from 'vitest'
import { NEUTRAL_SETUP, setupPerformance, type CarSetup } from '../lib/car-setup'
import { createDrivingState, RECOVERY_SECONDS, stepPowertrain, STRAIGHT_LAP_FRACTION } from '../lib/race-dynamics'
import { createSetupFeedback, stepSetupFeedback } from '../components/game/scene/setup-feedback'

const aggressive: CarSetup = { gear: '3.5:1', roller: 'light' }
const stable: CarSetup = { gear: '5:1', roller: 'heavy' }
const cornerAt = (fraction: number, half = 0) => half * .5 + STRAIGHT_LAP_FRACTION / 2 + (1 - STRAIGHT_LAP_FRACTION) / 2 * fraction

function runCorners(setup: CarSetup, laps: number, fps: number, circuit = 0) {
  const state = createDrivingState()
  const feedback = createSetupFeedback()
  const performance = setupPerformance(setup, 1, circuit)
  for (let corner = 0; corner < laps * 2; corner++) {
    stepSetupFeedback(state, feedback, 1 / fps, 0, performance)
    for (let frame = 0; frame < fps; frame++) {
      const phase = cornerAt((frame + 1) / (fps + 1), corner % 2)
      stepSetupFeedback(state, feedback, 1 / fps, phase, performance)
      while (state.recovery > 0) stepSetupFeedback(state, feedback, 1 / fps, phase, performance)
    }
  }
  return { state, feedback, performance }
}

describe('setup-driven visual feedback', () => {
  it.each([30, 60, 120])('illustrates the shared fractional rate without RNG at %i fps', fps => {
    const { state, feedback, performance } = runCorners(aggressive, 50, fps)
    expect(state.courseOuts).toBe(Math.floor(50 * performance.courseOutsPerLap))
    expect(state.courseOuts + feedback.courseOutBudget).toBeCloseTo(50 * performance.courseOutsPerLap, 8)
  })

  it.each([NEUTRAL_SETUP, stable])('does not invent crashes for safe setups: %o', setup => {
    const { state, feedback } = runCorners(setup, 20, 60)
    expect(state.courseOuts).toBe(0)
    expect(feedback.courseOutBudget).toBe(0)
    expect(state.grip).toBe(100)
  })

  it('uses circuit severity from setupPerformance rather than a client risk table', () => {
    const tight = runCorners(aggressive, 50, 60, 0)
    const fast = runCorners(aggressive, 50, 60, 1)
    expect(tight.state.courseOuts).toBeGreaterThan(fast.state.courseOuts)
    expect(fast.state.courseOuts).toBe(Math.floor(fast.performance.courseOutsPerLap * 50))
  })

  it('shows load and outward movement before launching, then rejoins continuously', () => {
    const state = createDrivingState()
    const feedback = createSetupFeedback()
    const performance = setupPerformance(aggressive, 1, 0)
    // A previous corner has contributed its fractional expected event.
    feedback.courseOutBudget = performance.courseOutsPerLap / 2
    for (let frame = 0; frame < 60; frame++) stepSetupFeedback(state, feedback, 1 / 60, cornerAt(.5), performance)
    expect(state.recovery).toBe(0)
    expect(state.grip).toBeLessThan(40)
    expect(state.offset).toBeGreaterThan(.08)
    stepSetupFeedback(state, feedback, 1 / 60, cornerAt(.63), performance)
    expect(state.recovery).toBe(RECOVERY_SECONDS)
    expect(state.courseOuts).toBe(1)
    for (let frame = 0; frame < 134; frame++) stepSetupFeedback(state, feedback, 1 / 60, cornerAt(.63), performance)
    expect(state.recovery).toBe(0)
    expect(state.offRoad).toBe(false)
    expect(state.offset).toBeLessThan(.05)
    expect(state.courseOuts).toBe(1)
  })

  it('never launches on a straight and ignores invalid frame deltas', () => {
    const state = createDrivingState()
    const feedback = createSetupFeedback()
    const performance = setupPerformance(aggressive, 1, 0)
    feedback.courseOutBudget = 2
    for (let frame = 0; frame < 120; frame++) stepSetupFeedback(state, feedback, 1 / 60, .1, performance)
    expect(state.courseOuts).toBe(0)
    const before = { ...state }
    for (const dt of [NaN, Infinity, -1, 0]) stepSetupFeedback(state, feedback, dt, cornerAt(.7), performance)
    expect(state).toEqual(before)
  })

  it('uses setup speed per section and setup acceleration only on the opt-in path', () => {
    for (const setup of [aggressive, NEUTRAL_SETUP, stable]) {
      const performance = setupPerformance(setup, 1, 0)
      const visual = { cornerMultiplier: performance.cornerSpeed / performance.speed, accelerationMultiplier: performance.accel }
      const state = createDrivingState()
      state.speedMultiplier = performance.speed
      for (let frame = 0; frame < 600; frame++) stepPowertrain(state, 1 / 60, false, 1, 1, visual)
      expect(state.visualSpeed).toBeCloseTo(performance.speed, 5)
      state.corner = true
      for (let frame = 0; frame < 600; frame++) stepPowertrain(state, 1 / 60, false, 1, 1, visual)
      expect(state.visualSpeed).toBeCloseTo(performance.cornerSpeed, 5)
      state.corner = false
      state.visualSpeed = 0
      stepPowertrain(state, .1, false, 1, 1, visual)
      expect(state.visualSpeed).toBeCloseTo(performance.speed * (1 - Math.exp(-1.8 * performance.accel * .1)), 8)
    }
  })
})
