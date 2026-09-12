import { describe, expect, it } from 'vitest';
import { courseOutPose, createDrivingState, gripTuning, isTrackCorner, powertrainTuning, RECOVERY_SECONDS, resetGripChallenge, stepDriving, stepPowertrain, type DrivingState } from '../lib/race-dynamics';

describe('course-out choreography', () => {
  it('launches from rest, lands upside down, and bounces before recovery', () => {
    expect(courseOutPose(0)).toMatchObject({ lift: 0, roll: 0, outward: 0, forward: 0, rejoin: 0, impacts: 0 });
    expect(courseOutPose(.32).lift).toBeGreaterThan(.7);
    expect(courseOutPose(.64)).toMatchObject({ lift: 0, roll: Math.PI, impacts: 1 });
    expect(courseOutPose(.77).lift).toBeGreaterThan(.1);
    expect(courseOutPose(.9).impacts).toBe(2);
    expect(courseOutPose(1.2).roll).toBeCloseTo(Math.PI);
    expect(courseOutPose(1.2).rejoin).toBe(0);
  });
  it('rights the chassis and returns exactly to the racing line', () => {
    const end = courseOutPose(RECOVERY_SECONDS);
    expect(end).toMatchObject({ lift: 0, pitch: 0, yaw: 0, rejoin: 1 });
    expect(end.roll).toBeCloseTo(Math.PI * 2);
    expect(courseOutPose(100)).toEqual(end);
    expect(courseOutPose(-1)).toEqual(courseOutPose(0));
    expect(courseOutPose(NaN)).toEqual(courseOutPose(0));
  });
  it('keeps motion continuous at launch, impacts, righting, and rejoin', () => {
    for (const time of [.64, .9, 1.06, 1.35, 1.7, 1.8, RECOVERY_SECONDS]) {
      const before = courseOutPose(time - .00001);
      const after = courseOutPose(time + .00001);
      for (const key of ['lift', 'roll', 'pitch', 'yaw', 'outward', 'forward', 'groundDrop', 'rejoin'] as const) {
        expect(Math.abs(before[key] - after[key])).toBeLessThan(.001);
      }
    }
  });
  it('disables tumbling, bounce, and impact bursts for reduced motion', () => {
    for (let frame = 0; frame <= 132; frame++) {
      const pose = courseOutPose(frame / 60, true);
      expect(pose).toMatchObject({ lift: 0, roll: 0, pitch: 0, yaw: 0, impacts: 0 });
    }
  });
});

describe('arena powertrain', () => {
  function advance(state: DrivingState, seconds: number, boosted: boolean, engine = 1, battery = 1, fps = 60) {
    for (let frame = 0; frame < Math.round(seconds * fps); frame++) stepPowertrain(state, 1 / fps, boosted, engine, battery);
  }

  it('improves acceleration and capacity at every upgrade without changing top speed', () => {
    for (let level = 1; level < 10; level++) {
      const current = createDrivingState();
      const upgraded = createDrivingState();
      current.visualSpeed = upgraded.visualSpeed = .3;
      advance(current, .5, false, level);
      advance(upgraded, .5, false, level + 1);
      expect(upgraded.visualSpeed).toBeGreaterThan(current.visualSpeed);
      expect(upgraded.visualSpeed).toBeLessThan(1);
      expect(powertrainTuning(1, level + 1).boostCapacitySeconds).toBeGreaterThan(powertrainTuning(1, level).boostCapacitySeconds);
      advance(current, 12, false, level);
      advance(upgraded, 12, false, level + 1);
      expect(current.visualSpeed).toBeCloseTo(upgraded.visualSpeed, 5);
    }
  });

  it('matches the 90 percent response time shown in the upgrade sheet', () => {
    for (let level = 1; level <= 10; level++) {
      const state = createDrivingState();
      state.visualSpeed = 0;
      const time = Math.log(10) / powertrainTuning(level).accelerationRate;
      const frames = 100;
      for (let frame = 0; frame < frames; frame++) stepPowertrain(state, time / frames, false, level);
      expect(state.visualSpeed).toBeCloseTo(.9, 6);
    }
  });

  it('slows for corners and accelerates back out with engine-dependent response', () => {
    const stock = createDrivingState();
    stock.corner = true;
    advance(stock, 2, false);
    expect(stock.visualSpeed).toBeCloseTo(.82, 4);
    stock.corner = false;
    const upgraded = { ...stock };
    advance(stock, .4, false, 1);
    advance(upgraded, .4, false, 10);
    expect(upgraded.visualSpeed).toBeGreaterThan(stock.visualSpeed);
  });

  it('boosts speed and RPM using actual drive power, then fades before depletion', () => {
    const state = createDrivingState();
    advance(state, 2, true);
    expect(state.visualSpeed).toBeGreaterThan(1.9);
    expect(state.rpm).toBeGreaterThan(12000);
    expect(state.rpm).toBeLessThanOrEqual(powertrainTuning().maxRpm);
    advance(state, 1.5, true);
    expect(state.boostPower).toBeGreaterThan(0);
    expect(state.boostPower).toBeLessThan(1);
    advance(state, 1, true);
    expect(state.boostPower).toBe(0);
    expect(state.visualSpeed).toBeLessThan(1.1);
    expect(state.rpm).toBeLessThan(9000);
  });

  it('exhausts exactly the displayed capacity at every battery level and frame rate', () => {
    for (const fps of [30, 60, 120]) {
      for (let level = 1; level <= 10; level++) {
        const state = createDrivingState();
        advance(state, powertrainTuning(1, level).boostCapacitySeconds, true, 1, level, fps);
        expect(state.boostEnergy).toBe(0);
        expect(state.boostExhausted).toBe(true);
        expect(state.boostPower).toBe(0);
      }
    }
  });

  it('recharges only without Gaspol and never pulses boost after exhaustion', () => {
    const state = createDrivingState();
    advance(state, 4, true);
    advance(state, 5, true);
    expect(state.boostEnergy).toBe(0);
    expect(state.boostPower).toBe(0);
    advance(state, 6, false);
    expect(state.boostEnergy).toBeCloseTo(.5);
    expect(state.boostExhausted).toBe(false);
    advance(state, 7, false);
    expect(state.boostEnergy).toBe(1);
    advance(state, .1, true);
    expect(state.boostPower).toBeGreaterThan(0);
    expect(state.boostEnergy).toBeLessThan(1);
  });

  it('withholds boost during recovery or off-road travel without refilling energy', () => {
    for (const interruption of [{ recovery: RECOVERY_SECONDS }, { offRoad: true }]) {
      const state: DrivingState = { ...createDrivingState(), ...interruption, boostEnergy: .4 };
      advance(state, 1, true);
      expect(state.boostEnergy).toBe(.4);
      expect(state.boostPower).toBe(0);
      if (state.recovery > 0) {
        expect(state.visualSpeed).toBeLessThan(.01);
        expect(state.rpm).toBeLessThan(10);
      }
      state.recovery = 0;
      state.offRoad = false;
      advance(state, .5, true, 10);
      expect(state.boostPower).toBeGreaterThan(0);
      expect(state.visualSpeed).toBeGreaterThan(1);
    }
  });

  it('does not reset the powertrain when the grip challenge is toggled', () => {
    const state = createDrivingState();
    advance(state, 4, true);
    const before = { ...state };
    resetGripChallenge(state, false);
    expect(state.enabled).toBe(false);
    resetGripChallenge(state, true);
    for (const key of ['boostEnergy', 'boostPower', 'boostExhausted', 'visualSpeed', 'acceleration', 'rpm'] as const) {
      expect(state[key]).toBe(before[key]);
    }
  });

  it('applies upgrades mid-run without resetting energy or handling counters', () => {
    const state = createDrivingState();
    Object.assign(state, { boostEnergy: .4, grip: 55, cleanCorners: 3, courseOuts: 2 });
    stepPowertrain(state, .1, true, 10, 10);
    expect(state.boostEnergy).toBeCloseTo(.4 - .1 / 8.5);
    expect(state).toMatchObject({ grip: 55, cleanCorners: 3, courseOuts: 2 });
  });

  it('bounds invalid levels and time jumps without introducing NaN', () => {
    for (const level of [-1, 0, NaN, Infinity, -Infinity]) expect(powertrainTuning(level, level)).toEqual(powertrainTuning(1, 1));
    expect(powertrainTuning(100, 100)).toEqual(powertrainTuning(10, 10));
    expect(powertrainTuning(3.9, 3.9)).toEqual(powertrainTuning(3, 3));
    for (const dt of [0, -1, NaN, Infinity, -Infinity]) {
      const state = createDrivingState();
      stepPowertrain(state, dt, true);
      expect(state).toEqual(createDrivingState());
    }
    const state = createDrivingState();
    stepPowertrain(state, 100, true);
    expect(state.boostEnergy).toBeCloseTo(.975);
  });

  it('keeps acceleration and charge consistent across frame rates', () => {
    const states = [30, 60, 120].map(fps => {
      const state = createDrivingState();
      advance(state, 2, true, 4, 4, fps);
      return state;
    });
    for (const state of states) {
      expect(state.visualSpeed).toBeCloseTo(states[0].visualSpeed, 5);
      expect(state.boostEnergy).toBeCloseTo(states[0].boostEnergy, 5);
      expect(Math.abs(state.rpm - states[0].rpm)).toBeLessThan(20);
    }
  });
});

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
  it('improves corner grip and straight recovery at every tire level', () => {
    for (let level = 1; level < 10; level++) {
      for (const boosted of [false, true]) {
        const current = createDrivingState();
        const upgraded = createDrivingState();
        stepDriving(current, .1, .35, boosted, level);
        stepDriving(upgraded, .1, .35, boosted, level + 1);
        expect(upgraded.grip).toBeGreaterThan(current.grip);
        current.grip = upgraded.grip = 50;
        stepDriving(current, .1, .1, boosted, level);
        stepDriving(upgraded, .1, .1, boosted, level + 1);
        expect(upgraded.grip).toBeGreaterThan(current.grip);
      }
    }
  });
  it('uses the same rates shown by the upgrade preview', () => {
    for (let level = 1; level <= 10; level++) {
      const tuning = gripTuning(level);
      for (const boosted of [false, true]) {
        const state = createDrivingState();
        stepDriving(state, .1, .35, boosted, level);
        expect(state.grip).toBeCloseTo(100 - .1 * (boosted ? tuning.boostedCornerDrain : tuning.cornerDrain));
        state.grip = 50;
        stepDriving(state, .1, .1, boosted, level);
        expect(state.grip).toBeCloseTo(50 + .1 * tuning.straightRecovery);
      }
    }
    expect(gripTuning(1).drainReductionPercent).toBe(0);
    expect(gripTuning(10).drainReductionPercent).toBe(54);
    expect(gripTuning(10).straightRecovery).toBe(46);
  });
  it('bounds invalid and out-of-range tire levels', () => {
    for (const level of [-1, 0, NaN, Infinity, -Infinity]) {
      expect(gripTuning(level)).toEqual(gripTuning(1));
    }
    expect(gripTuning(100)).toEqual(gripTuning(10));
    expect(gripTuning(3.9)).toEqual(gripTuning(3));
  });
  it('delays course outs without granting immunity at maximum grip', () => {
    const framesUntilCourseOut = (level: number) => {
      const state = createDrivingState();
      let frames = 0;
      while (state.courseOuts === 0 && frames < 600) {
        stepDriving(state, 1 / 60, .35, true, level);
        frames++;
      }
      expect(state.courseOuts).toBe(1);
      return frames;
    };
    expect(framesUntilCourseOut(10)).toBeGreaterThan(framesUntilCourseOut(1) * 2);
  });
  it('applies upgrades to an ongoing run without refilling grip or resetting counters', () => {
    const state = createDrivingState();
    state.grip = 50;
    state.cleanCorners = 3;
    state.courseOuts = 2;
    stepDriving(state, .1, .35, true, 10);
    expect(state.grip).toBeCloseTo(50 - gripTuning(10).boostedCornerDrain * .1);
    expect(state.cleanCorners).toBe(3);
    expect(state.courseOuts).toBe(2);
  });
  it('keeps grip bounded and autopilot unaffected at every level', () => {
    for (let level = 1; level <= 10; level++) {
      const state = createDrivingState();
      state.grip = 99;
      stepDriving(state, .1, .1, false, level);
      expect(state.grip).toBe(100);
      state.enabled = false;
      for (let frame = 0; frame < 60; frame++) stepDriving(state, 1 / 60, .35, true, level);
      expect(state.grip).toBe(100);
      expect(state.courseOuts).toBe(0);
      expect(state.speedMultiplier).toBe(1);
    }
  });
});
