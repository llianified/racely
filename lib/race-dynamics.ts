export const TRACK_HALF = 3.35;
export const PLAYER_RADIUS = 2.24;
export const RECOVERY_SECONDS = 2.2;
export const PERFECT_BOOST_SECONDS = 1.2;
const ROAD_EDGE = 3.96 - PLAYER_RADIUS;

export type DrivingState = {
  grip: number;
  recovery: number;
  shield: number;
  cooldown: number;
  cleanCorners: number;
  courseOuts: number;
  corner: boolean;
  cornerFailed: boolean;
  enabled: boolean;
  cornerProgress: number;
  lineLocked: boolean;
  perfectCorners: number;
  perfectBoost: number;
  offset: number;
  lateralVelocity: number;
  offRoad: boolean;
  speedMultiplier: number;
};

export function createDrivingState(): DrivingState {
  return { grip: 100, recovery: 0, shield: 0, cooldown: 0, cleanCorners: 0, courseOuts: 0, corner: false, cornerFailed: false, enabled: true, cornerProgress: -1, lineLocked: false, perfectCorners: 0, perfectBoost: 0, offset: 0, lateralVelocity: 0, offRoad: false, speedMultiplier: 1 };
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

export function perfectLineAvailable(state: DrivingState) {
  return state.enabled && state.recovery === 0 && !state.offRoad && !state.cornerFailed && !state.lineLocked && state.grip >= 40 && state.cornerProgress >= .12 && state.cornerProgress <= .68;
}

export function stabilizeCar(state: DrivingState) {
  if (!state.enabled || state.cooldown > 0 || state.recovery > 0 || state.offRoad) return false;
  if (perfectLineAvailable(state)) state.lineLocked = true;
  state.grip = Math.min(100, state.grip + 48);
  state.shield = 1.4;
  state.cooldown = 3.5;
  return true;
}

// Session-only driving challenge; never changes authoritative laps, rewards, or boost timers.
export function stepDriving(state: DrivingState, delta: number, progress: number, boosted: boolean, tires = 1) {
  const dt = Math.max(0, Math.min(delta, .1));
  const cornerProgress = trackCornerProgress(progress);
  const corner = cornerProgress >= 0;
  state.cooldown = Math.max(0, state.cooldown - dt);
  state.shield = Math.max(0, state.shield - dt);
  state.perfectBoost = Math.max(0, state.perfectBoost - dt);
  if (!state.enabled) {
    Object.assign(state, { grip: 100, recovery: 0, corner, cornerProgress, cornerFailed: false, lineLocked: false, perfectBoost: 0, offset: 0, lateralVelocity: 0, offRoad: false, speedMultiplier: 1 });
    return;
  }
  if (!state.corner && corner) {
    state.cornerFailed = state.recovery > 0 || state.offRoad;
    state.lineLocked = false;
  }
  if (state.recovery > 0) {
    state.recovery = Math.max(0, state.recovery - dt);
    state.grip = Math.min(75, state.grip + dt * (state.offRoad ? 8 : 45));
    state.cornerFailed = true;
    if (state.recovery === 0) state.shield = 1.5;
  } else {
    const tireAssist = Math.min(12, Math.max(0, tires - 1) * 1.3);
    const drain = boosted ? 84 - tireAssist : 14 - tireAssist * .5;
    state.grip = Math.max(0, Math.min(100, state.grip + dt * (state.offRoad ? -18 : state.shield > 0 ? 40 : corner ? -drain : 28)));
    if (state.grip === 0) {
      state.recovery = RECOVERY_SECONDS;
      state.courseOuts += 1;
      state.cleanCorners = 0;
      state.cornerFailed = true;
      state.lineLocked = false;
      state.perfectBoost = 0;
    }
  }
  if (state.corner && !corner) {
    if (!state.cornerFailed && !state.offRoad) {
      state.cleanCorners += 1;
      if (state.lineLocked) {
        state.perfectCorners += 1;
        state.perfectBoost = PERFECT_BOOST_SECONDS;
      }
    }
    state.lineLocked = false;
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
  const targetSpeed = state.offRoad ? .38 : state.recovery > 0 ? .58 : state.perfectBoost > 0 ? 1.22 : 1 - slip * .18;
  state.speedMultiplier += (targetSpeed - state.speedMultiplier) * (1 - Math.exp(-4 * dt));
}
