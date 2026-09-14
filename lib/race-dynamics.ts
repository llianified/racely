export const TRACK_HALF = 3.35;
export const PLAYER_RADIUS = 2.24;
export const RECOVERY_SECONDS = 2.2;
const ROAD_EDGE = 3.96 - PLAYER_RADIUS;

/**
 * Bagian satu putaran yang berupa trek lurus, diturunkan dari geometri yang
 * sama persis dengan `trackCornerProgress` di bawah -- bukan angka yang ditulis
 * lepas.
 *
 * Dipakai `lib/car-setup.ts` untuk memecah waktu per putaran jadi bagian lurus
 * dan bagian tikungan, supaya setup bisa berdampak berbeda di keduanya. Kalau
 * geometri treknya berubah, pecahan ini ikut berubah sendiri dan penilaian
 * server tetap sepakat dengan tikungan yang dilihat pemain di layar.
 */
export const STRAIGHT_LAP_FRACTION =
  (TRACK_HALF * 2) / (TRACK_HALF * 2 + Math.PI * PLAYER_RADIUS);

function smoothRange(value: number, start: number, end: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

// Choreography is sampled from the recovery clock, not integrated per frame.
// It never writes to the authoritative progress, lap count, or economy.
export function courseOutPose(elapsed: number, reducedMotion = false) {
  const t = Number.isFinite(elapsed) ? Math.max(0, Math.min(RECOVERY_SECONDS, elapsed)) : 0;
  const flight = Math.min(1, t / .64);
  const bounce = Math.max(0, Math.min(1, (t - .64) / .26));
  const settle = Math.max(0, Math.min(1, (t - .9) / .16));
  const righting = smoothRange(t, 1.35, 1.8);
  const rejoin = smoothRange(t, 1.7, RECOVERY_SECONDS);
  const travel = 1 - Math.exp(-3.8 * t);
  return {
    outward: 1.9 * travel,
    forward: 1.3 * travel,
    groundDrop: -.22 * smoothRange(t, 0, .64),
    lift: reducedMotion ? 0 : 3 * flight * (1 - flight) + .56 * bounce * (1 - bounce) + .18 * settle * (1 - settle),
    roll: reducedMotion ? 0 : Math.PI * smoothRange(t, 0, .64) + .12 * Math.sin(bounce * Math.PI * 2) * (1 - bounce) + Math.PI * righting,
    pitch: reducedMotion ? 0 : (flight < 1 ? -.24 * Math.sin(flight * Math.PI) : 0) + .06 * Math.sin(bounce * Math.PI * 2) * (1 - bounce),
    yaw: reducedMotion ? 0 : .65 * travel * (1 - rejoin),
    rejoin,
    impacts: reducedMotion ? 0 : t >= .9 ? 2 : t >= .64 ? 1 : 0,
  };
}

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

function upgradeLevel(value: number) {
  return Number.isFinite(value) ? Math.max(1, Math.min(10, Math.floor(value))) : 1;
}

export function powertrainTuning(engine = 1, battery = 1) {
  return {
    accelerationRate: 1.8 + (upgradeLevel(engine) - 1) * .35,
    boostCapacitySeconds: 4 + (upgradeLevel(battery) - 1) * .5,
    rechargeSeconds: 12,
    maxRpm: 14000,
  };
}

// Local arena telemetry only: server boost duration and earnings are untouched.
export function stepPowertrain(state: DrivingState, delta: number, boosted: boolean, engine = 1, battery = 1, setupVisual?: { cornerMultiplier: number; accelerationMultiplier: number }) {
  const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, .1)) : 0;
  if (dt === 0) return;
  const tuning = powertrainTuning(engine, battery);
  const available = boosted && state.recovery === 0 && !state.offRoad;
  if (!boosted) state.boostExhausted = false;
  state.boostPower = available && !state.boostExhausted ? Math.min(1, state.boostEnergy * tuning.boostCapacitySeconds) : 0;
  if (available && !state.boostExhausted) {
    const remaining = state.boostEnergy - dt / tuning.boostCapacitySeconds;
    state.boostEnergy = remaining > 1e-9 ? remaining : 0;
    if (state.boostEnergy === 0) {
      state.boostExhausted = true;
      state.boostPower = 0;
    }
  } else if (!boosted) {
    state.boostEnergy = Math.min(1, state.boostEnergy + dt / tuning.rechargeSeconds);
  }
  const previousSpeed = state.visualSpeed;
  const target = state.recovery > 0 ? 0 : state.speedMultiplier * (state.corner ? setupVisual?.cornerMultiplier ?? .82 : 1) * (1 + state.boostPower);
  const response = target > previousSpeed ? tuning.accelerationRate * (setupVisual?.accelerationMultiplier ?? 1) : 6;
  state.visualSpeed += (target - previousSpeed) * (1 - Math.exp(-response * dt));
  state.acceleration = (state.visualSpeed - previousSpeed) / dt;
  const targetRpm = state.recovery > 0 ? 0 : Math.min(tuning.maxRpm, 2200 + state.visualSpeed * 5000 + state.boostPower * 1600);
  state.rpm += (targetRpm - state.rpm) * (1 - Math.exp(-8 * dt));
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
  visualSpeed: number;
  acceleration: number;
  rpm: number;
  boostEnergy: number;
  boostPower: number;
  boostExhausted: boolean;
};

export function createDrivingState(): DrivingState {
  return { grip: 100, recovery: 0, shield: 0, cleanCorners: 0, courseOuts: 0, corner: false, cornerFailed: false, enabled: true, cornerProgress: -1, offset: 0, lateralVelocity: 0, offRoad: false, speedMultiplier: 1, visualSpeed: 1, acceleration: 0, rpm: 7200, boostEnergy: 1, boostPower: 0, boostExhausted: false };
}

export function resetGripChallenge(state: DrivingState, enabled: boolean) {
  Object.assign(state, {
    enabled, grip: 100, recovery: 0, shield: 0, cleanCorners: 0, courseOuts: 0,
    cornerFailed: false, offset: 0, lateralVelocity: 0, offRoad: false, speedMultiplier: 1,
  });
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

/**
 * Apakah Gaspol yang ditekan pada posisi lintasan ini dihitung bersih.
 *
 * Berbeda dari sisa berkas ini, fungsi ini OTORITATIF: server memanggilnya
 * dengan `progress` miliknya sendiri -- yang baru saja disetel ke `now` -- jadi
 * hasilnya tidak bisa dipengaruhi telemetri client. Yang dipakai bersama hanya
 * geometri treknya, dan justru itu yang harus sama persis: penilaian server
 * tidak boleh menyimpang dari tikungan yang dilihat pemain di layar.
 *
 * `graceLap` memaafkan tekanan yang telat sepersekian lintasan -- latensi
 * jaringan, bukan kesalahan pemain -- dengan ikut memeriksa posisi sejauh itu
 * di belakang. Tekanan yang memang di tengah tikungan tetap kotor.
 */
export function isCleanBoostLaunch(progress: number, graceLap = 0) {
  if (!Number.isFinite(progress)) return true;
  const grace = Number.isFinite(graceLap) ? Math.max(0, graceLap) : 0;
  return !isTrackCorner(progress) || !isTrackCorner(progress - grace);
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
