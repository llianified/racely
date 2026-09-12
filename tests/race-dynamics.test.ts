import { describe, expect, it } from 'vitest';
import { createDrivingState, isTrackCorner, perfectLineAvailable, PERFECT_BOOST_SECONDS, RECOVERY_SECONDS, stabilizeCar, stepDriving } from '../lib/race-dynamics';

describe('session grip challenge', () => {
  it('identifies both curves and handles wrapped progress', () => {
    expect(isTrackCorner(.1)).toBe(false);
    expect(isTrackCorner(.35)).toBe(true);
    expect(isTrackCorner(.6)).toBe(false);
    expect(isTrackCorner(.85)).toBe(true);
    expect(isTrackCorner(1.35)).toBe(true);
  });
  it('drains faster under boost and restores grip on straights', () => {
    const normal = createDrivingState();
    const boosted = createDrivingState();
    stepDriving(normal, .1, .35, false);
    stepDriving(boosted, .1, .35, true);
    expect(boosted.grip).toBeLessThan(normal.grip);
    const before = boosted.grip;
    stepDriving(boosted, .1, .1, true);
    expect(boosted.grip).toBeGreaterThan(before);
  });
  it('stabilizes with a cooldown and protects from course out', () => {
    const state = createDrivingState();
    state.grip = 1;
    expect(stabilizeCar(state)).toBe(true);
    expect(stabilizeCar(state)).toBe(false);
    for (let i = 0; i < 10; i++) stepDriving(state, .1, .35, true);
    expect(state.courseOuts).toBe(0);
    expect(state.grip).toBeGreaterThan(49);
  });
  it('recovers automatically and resets the clean-corner streak', () => {
    const state = createDrivingState();
    state.grip = 1;
    state.cleanCorners = 5;
    stepDriving(state, .1, .35, true);
    expect(state.recovery).toBe(RECOVERY_SECONDS);
    expect(state.courseOuts).toBe(1);
    expect(state.cleanCorners).toBe(0);
    expect(stabilizeCar(state)).toBe(false);
    for (let i = 0; i < 23; i++) stepDriving(state, .1, .35, true);
    expect(state.recovery).toBe(0);
    expect(state.shield).toBeGreaterThan(0);
    expect(state.courseOuts).toBe(1);
    stepDriving(state, .1, .6, false);
    expect(state.cleanCorners).toBe(0);
  });
  it('counts a clean corner only once on exit', () => {
    const state = createDrivingState();
    stepDriving(state, .1, .35, false);
    stepDriving(state, .1, .6, false);
    stepDriving(state, .1, .6, false);
    expect(state.cleanCorners).toBe(1);
  });
  it('supports autopilot and caps hidden-tab time jumps', () => {
    const state = createDrivingState();
    stepDriving(state, 100, .35, true);
    expect(state.grip).toBeCloseTo(91.6);
    state.enabled = false;
    stepDriving(state, .1, .35, true);
    expect(state.grip).toBe(100);
    expect(stabilizeCar(state)).toBe(false);
  });
  it('leaves the road smoothly, slows down, and recovers without resetting grip', () => {
    const state = createDrivingState();
    state.grip = 1;
    let sawOffRoad = false;
    let minimumSpeed = 1;
    let previousOffset = 0;
    for (let i = 0; i < 145; i++) {
      stepDriving(state, 1 / 60, .35, true);
      sawOffRoad ||= state.offRoad;
      minimumSpeed = Math.min(minimumSpeed, state.speedMultiplier);
      expect(Math.abs(state.offset - previousOffset)).toBeLessThan(.2);
      previousOffset = state.offset;
    }
    expect(sawOffRoad).toBe(true);
    expect(minimumSpeed).toBeLessThan(.6);
    expect(state.offRoad).toBe(false);
    expect(state.recovery).toBe(0);
    expect(state.offset).toBeLessThan(.25);
    expect(state.grip).toBeGreaterThan(30);
    expect(state.grip).toBeLessThan(100);
    expect(state.courseOuts).toBe(1);
  });
  it('locks the apex and grants acceleration only on a successful exit', () => {
    const state = createDrivingState();
    stepDriving(state, .1, .35, false);
    expect(perfectLineAvailable(state)).toBe(true);
    expect(stabilizeCar(state)).toBe(true);
    expect(state.lineLocked).toBe(true);
    expect(state.perfectBoost).toBe(0);
    stepDriving(state, .1, .6, false);
    expect(state.perfectBoost).toBe(PERFECT_BOOST_SECONDS);
    expect(state.perfectCorners).toBe(1);
    expect(state.speedMultiplier).toBeGreaterThan(1);
    for (let i = 0; i < 15; i++) stepDriving(state, .1, .6, false);
    expect(state.perfectBoost).toBe(0);
    expect(state.perfectCorners).toBe(1);
  });
  it('does not award perfect line for early, late, or failed stabilizations', () => {
    for (const progress of [.1, .25, .49]) {
      const state = createDrivingState();
      stepDriving(state, .1, progress, false);
      expect(perfectLineAvailable(state)).toBe(false);
      stabilizeCar(state);
      stepDriving(state, .1, .6, false);
      expect(state.perfectBoost).toBe(0);
    }
    const failed = createDrivingState();
    stepDriving(failed, .1, .35, false);
    stabilizeCar(failed);
    failed.shield = 0;
    failed.grip = 1;
    stepDriving(failed, .1, .4, true);
    stepDriving(failed, .1, .6, true);
    expect(failed.perfectCorners).toBe(0);
    expect(failed.perfectBoost).toBe(0);
    expect(failed.lineLocked).toBe(false);
  });
  it('preserves smooth dynamics across common frame rates', () => {
    const states = [30, 60, 120].map(fps => {
      const state = createDrivingState();
      state.grip = 1;
      for (let i = 0; i < fps; i++) stepDriving(state, 1 / fps, .35, true);
      return state;
    });
    expect(states.every(state => state.offRoad && state.courseOuts === 1)).toBe(true);
    expect(Math.max(...states.map(s => s.offset)) - Math.min(...states.map(s => s.offset))).toBeLessThan(.15);
    expect(Math.max(...states.map(s => s.speedMultiplier)) - Math.min(...states.map(s => s.speedMultiplier))).toBeLessThan(.08);
  });
  it('clears all handling effects when autopilot is enabled', () => {
    const state = createDrivingState();
    Object.assign(state, { enabled: false, offset: 2, lateralVelocity: 3, offRoad: true, speedMultiplier: .4, perfectBoost: 1, lineLocked: true });
    stepDriving(state, .1, .35, true);
    expect(state.offset).toBe(0);
    expect(state.lateralVelocity).toBe(0);
    expect(state.offRoad).toBe(false);
    expect(state.speedMultiplier).toBe(1);
    expect(state.perfectBoost).toBe(0);
    expect(state.lineLocked).toBe(false);
  });
  it('uses tire upgrades to improve grip', () => {
    const starter = createDrivingState();
    const upgraded = createDrivingState();
    stepDriving(starter, .1, .35, true, 1);
    stepDriving(upgraded, .1, .35, true, 10);
    expect(upgraded.grip).toBeGreaterThan(starter.grip);
  });
});
