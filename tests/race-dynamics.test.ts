import { describe, expect, it } from 'vitest';
import { createDrivingState, isTrackCorner, RECOVERY_SECONDS, stabilizeCar, stepDriving } from '../lib/race-dynamics';

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
  it('uses tire upgrades to improve grip', () => {
    const starter = createDrivingState();
    const upgraded = createDrivingState();
    stepDriving(starter, .1, .35, true, 1);
    stepDriving(upgraded, .1, .35, true, 10);
    expect(upgraded.grip).toBeGreaterThan(starter.grip);
  });
});
