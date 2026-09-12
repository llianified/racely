import { describe, expect, it } from 'vitest';
import { createDrivingState, isTrackCorner, RECOVERY_SECONDS, stepDriving } from '../lib/race-dynamics';

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
  it('recovers automatically and resets the clean-corner streak', () => {
    const state = createDrivingState();
    state.grip = 1;
    state.cleanCorners = 5;
    stepDriving(state, .1, .35, true);
    expect(state.recovery).toBe(RECOVERY_SECONDS);
    expect(state.courseOuts).toBe(1);
    expect(state.cleanCorners).toBe(0);
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
  it('exits corners without an extra acceleration bonus', () => {
    for (const boosted of [false, true]) {
      const state = createDrivingState();
      for (const progress of [.1, .25, .35, .49, .6, .85, .99, .1]) {
        stepDriving(state, .1, progress, boosted);
        expect(state.speedMultiplier).toBeLessThanOrEqual(1);
        expect(state.shield).toBe(0);
      }
      expect(state.cleanCorners).toBe(2);
    }
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
    Object.assign(state, { enabled: false, offset: 2, lateralVelocity: 3, offRoad: true, speedMultiplier: .4 });
    stepDriving(state, .1, .35, true);
    expect(state.offset).toBe(0);
    expect(state.lateralVelocity).toBe(0);
    expect(state.offRoad).toBe(false);
    expect(state.speedMultiplier).toBe(1);
  });
  it('uses tire upgrades to improve grip', () => {
    const starter = createDrivingState();
    const upgraded = createDrivingState();
    stepDriving(starter, .1, .35, true, 1);
    stepDriving(upgraded, .1, .35, true, 10);
    expect(upgraded.grip).toBeGreaterThan(starter.grip);
  });
});
