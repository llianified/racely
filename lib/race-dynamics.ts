export const TRACK_HALF = 3.35;
export const PLAYER_RADIUS = 2.24;
export const RECOVERY_SECONDS = 2.2;
const ROAD_EDGE = 3.96 - PLAYER_RADIUS;

export function gripTuning(tires = 1) {
  const level = Number.isFinite(tires) ? Math.max(1, Math.min(10, Math.floor(tires))) : 1;
  const upgrades = level - 1;
  const drainReductionPercent = upgrades * 6;
  const drainMultiplier = 1 - drainReductionPercent / 100;
  return {
    level,
    drainReductionPercent,
    cornerDrain: 14 * drainMultiplier,
    boostedCornerDrain: 84 * drainMultiplier,
    straightRecovery: 28 + upgrades * 2,
  };
}

export type DrivingState = {
  grip: number;
  recovery: number;
  shield: number;
  cleanCorners: number;
  courseOuts: number;
  corner: boolean;
  cornerFailed: boolean;
  enabled: boolean;
  cornerProgress: number;
  offset: number;
  lateralVelocity: number;
  offRoad: boolean;
  speedMultiplier: number;
};

export function createDrivingState(): DrivingState {
  return { grip: 100, recovery: 0, shield: 0, cleanCorners: 0, courseOuts: 0, corner: false, cornerFailed: false, enabled: true, cornerProgress: -1, offset: 0, lateralVelocity: 0, offRoad: false, speedMultiplier: 1 };
}

export function trackCornerProgress(progress: number) {
  const straight = TRACK_HALF * 2;
  const arc = Math.PI * PLAYER_RADIUS;
  const halfLap = straight + arc;
  const distance = (((progress % 1) + 1) % 1) * halfLap * 2 % halfLap;
  return distance >= straight ? (distance - straight) / arc : -1;
}

export function isTrackCorner(progress: number) {
  return trackCornerProgress(progress) >= 0;
}

// Session-only driving challenge; never changes authoritative laps, rewards, or boost timers.
export function stepDriving(state: DrivingState, delta: number, progress: number, boosted: boolean, tires = 1) {
  const dt = Math.max(0, Math.min(delta, .1));
  const cornerProgress = trackCornerProgress(progress);
  const corner = cornerProgress >= 0;
  state.shield = Math.max(0, state.shield - dt);
  if (!state.enabled) {
    Object.assign(state, { grip: 100, recovery: 0, corner, cornerProgress, cornerFailed: false, offset: 0, lateralVelocity: 0, offRoad: false, speedMultiplier: 1 });
    return;
  }
  if (!state.corner && corner) {
    state.cornerFailed = state.recovery > 0 || state.offRoad;
  }
  if (state.recovery > 0) {
    state.recovery = Math.max(0, state.recovery - dt);
    state.grip = Math.min(75, state.grip + dt * (state.offRoad ? 8 : 45));
    state.cornerFailed = true;
    if (state.recovery === 0) state.shield = 1.5;
  } else {
    const tuning = gripTuning(tires);
    const drain = boosted ? tuning.boostedCornerDrain : tuning.cornerDrain;
    state.grip = Math.max(0, Math.min(100, state.grip + dt * (state.offRoad ? -18 : state.shield > 0 ? 40 : corner ? -drain : tuning.straightRecovery)));
    if (state.grip === 0) {
      state.recovery = RECOVERY_SECONDS;
      state.courseOuts += 1;
      state.cleanCorners = 0;
      state.cornerFailed = true;
    }
  }
  if (state.corner && !corner) {
    if (!state.cornerFailed && !state.offRoad) {
      state.cleanCorners += 1;
    }
    state.cornerFailed = state.recovery > 0 || state.offRoad;
  }
  state.corner = corner;
  state.cornerProgress = cornerProgress;

  const slip = Math.max(0, (65 - state.grip) / 65);
  const idealLine = corner ? -.08 * Math.sin(cornerProgress * Math.PI) : 0;
  const targetOffset = state.recovery > 1.05 ? 2.55 : state.recovery > 0 ? 0 : idealLine + (corner ? slip * slip * 1.5 : 0);
  // A damped lateral spring preserves momentum on the shoulder, without teleporting home.
  const stiffness = state.offRoad ? 28 : 40;
  state.lateralVelocity += ((targetOffset - state.offset) * stiffness - state.lateralVelocity * 10) * dt;
  state.offset += state.lateralVelocity * dt;
  state.offRoad = state.offset > ROAD_EDGE;
  const targetSpeed = state.offRoad ? .38 : state.recovery > 0 ? .58 : 1 - slip * .18;
  state.speedMultiplier += (targetSpeed - state.speedMultiplier) * (1 - Math.exp(-4 * dt));
}
