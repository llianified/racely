export const TRACK_HALF = 3.35;
export const PLAYER_RADIUS = 2.24;
export const RECOVERY_SECONDS = 2.2;

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
};

export function createDrivingState(): DrivingState {
  return { grip: 100, recovery: 0, shield: 0, cooldown: 0, cleanCorners: 0, courseOuts: 0, corner: false, cornerFailed: false, enabled: true };
}

export function isTrackCorner(progress: number) {
  const straight = TRACK_HALF * 2;
  const arc = Math.PI * PLAYER_RADIUS;
  const distance = ((progress % 1 + 1) % 1) * (straight * 2 + arc * 2);
  return (distance >= straight && distance < straight + arc) || distance >= straight * 2 + arc;
}

export function stabilizeCar(state: DrivingState) {
  if (!state.enabled || state.cooldown > 0 || state.recovery > 0) return false;
  state.grip = Math.min(100, state.grip + 48);
  state.shield = 1.4;
  state.cooldown = 3.5;
  return true;
}

// Session-only driving challenge; never changes authoritative laps, rewards, or boost timers.
export function stepDriving(state: DrivingState, delta: number, progress: number, boosted: boolean, tires = 1) {
  const dt = Math.max(0, Math.min(delta, .1));
  const corner = isTrackCorner(progress);
  state.cooldown = Math.max(0, state.cooldown - dt);
  state.shield = Math.max(0, state.shield - dt);
  if (!state.enabled) {
    state.grip = 100;
    state.recovery = 0;
    state.corner = corner;
    state.cornerFailed = false;
    return;
  }
  if (state.recovery > 0) {
    state.recovery = Math.max(0, state.recovery - dt);
    state.grip = 100;
    state.cornerFailed = true;
    if (state.recovery === 0) state.shield = 1.5;
  } else {
    const tireAssist = Math.min(12, Math.max(0, tires - 1) * 1.3);
    const drain = boosted ? 84 - tireAssist : 14 - tireAssist * .5;
    state.grip = Math.max(0, Math.min(100, state.grip + dt * (state.shield > 0 ? 40 : corner ? -drain : 28)));
    if (state.grip === 0) {
      state.recovery = RECOVERY_SECONDS;
      state.courseOuts += 1;
      state.cleanCorners = 0;
      state.cornerFailed = true;
    }
  }
  if (state.corner && !corner) {
    if (!state.cornerFailed) state.cleanCorners += 1;
    state.cornerFailed = state.recovery > 0;
  }
  state.corner = corner;
}
