import type { SetupPerformance } from '@/lib/car-setup'
import { RECOVERY_SECONDS, type DrivingState } from '@/lib/race-dynamics'
import { trackLayoutAt, trackPositionAt, type TrackLayout } from '@/lib/track-layout'

export function createSetupFeedback() {
  return { courseOutBudget: 0, scheduled: false, sectionId: '' }
}

export type SetupFeedback = ReturnType<typeof createSetupFeedback>

// The server exposes an expected rate, not timestamped crash events. Distribute
// that SAME rate over its two corners for presentation only; never settle laps.
export function stepSetupFeedback(state: DrivingState, feedback: SetupFeedback, delta: number, progress: number, performance: SetupPerformance) {
  const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, .1)) : 0
  if (!dt) return
  const cornerProgress = trackCornerProgress(progress)
  const corner = cornerProgress >= 0
  const entered = corner && !state.corner
  const exited = !corner && state.corner
  if (entered) {
    feedback.courseOutBudget += performance.courseOutsPerLap / 2
    feedback.scheduled = feedback.courseOutBudget >= 1 - 1e-9
    state.cornerFailed = false
  }
  if (exited) {
    if (!state.cornerFailed) state.cleanCorners += 1
    feedback.scheduled = false
  }
  state.corner = corner
  state.cornerProgress = cornerProgress
  state.shield = 0
  state.speedMultiplier = performance.speed
  if (state.recovery > 0) {
    state.recovery = Math.max(0, state.recovery - dt)
    state.grip += (100 - state.grip) * (1 - Math.exp(-3 * dt))
    state.offset *= Math.exp(-8 * dt)
    state.lateralVelocity *= Math.exp(-8 * dt)
    state.offRoad = state.recovery > 0
    return
  }
  state.offRoad = false
  // Grip here is a visual load meter, not a second drain or failure formula.
  const load = corner ? Math.sin(Math.PI * Math.min(1, cornerProgress / .55) / 2) : 0
  const overloadShare = performance.overload / Math.max(performance.cornerLoad, .001)
  const risk = Math.min(1, overloadShare * load)
  const targetGrip = 100 * (1 - risk)
  state.grip += (targetGrip - state.grip) * (1 - Math.exp(-9 * dt))
  const sway = Math.sin(cornerProgress * Math.PI * 10) * risk * risk * .024
  const targetOffset = corner ? -.018 * load + risk * .18 + sway : 0
  const previousOffset = state.offset
  state.offset += (targetOffset - state.offset) * (1 - Math.exp(-10 * dt))
  state.lateralVelocity = (state.offset - previousOffset) / dt
  if (feedback.scheduled && cornerProgress >= .62 && !state.cornerFailed) {
    feedback.courseOutBudget = Math.max(0, feedback.courseOutBudget - 1)
    feedback.scheduled = false
    state.recovery = RECOVERY_SECONDS
    state.courseOuts += 1
    state.cleanCorners = 0
    state.cornerFailed = true
    state.offRoad = true
  }
}
