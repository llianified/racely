import { describe, expect, it } from 'vitest';
import { RaceImpactTracker, raceAudioMix, type RaceAudioFrame } from '../lib/race-audio';
import { courseOutPose, createDrivingState } from '../lib/race-dynamics';

function frame(overrides: Partial<RaceAudioFrame> = {}): RaceAudioFrame {
  return { driving: createDrivingState(), grounded: true, offRoad: false, movement: 1, impact: 0, pan: 0, distance: 3, ...overrides };
}

describe('race audio mix', () => {
  it('follows motor RPM and acceleration without mutating telemetry', () => {
    const slow = frame();
    const fast = frame({ driving: { ...slow.driving, rpm: 12000, acceleration: 1 } });
    const before = structuredClone(fast);
    expect(raceAudioMix(fast).motorHz).toBeGreaterThan(raceAudioMix(slow).motorHz);
    expect(raceAudioMix(fast).motorCutoff).toBeGreaterThan(raceAudioMix(slow).motorCutoff);
    expect(raceAudioMix(fast).motor).toBeGreaterThan(raceAudioMix(slow).motor);
    expect(fast).toEqual(before);
  });

  it('keeps motor texture low and removes the sustained gear whistle at every RPM', () => {
    for (const rpm of [0, 900, 7200, 12000, 14000, 30000]) {
      const mix = raceAudioMix(frame({ driving: { ...createDrivingState(), rpm, grip: 0 } }));
      expect(mix.motorHz).toBeGreaterThanOrEqual(26);
      expect(mix.motorHz).toBeLessThanOrEqual(62);
      expect(mix.motorCutoff).toBeLessThanOrEqual(500);
      expect(mix.scrubHz).toBeLessThanOrEqual(1400);
      expect(mix).not.toHaveProperty('gearHz');
      expect(mix).not.toHaveProperty('gear');
    }
  });

  it('adds rubber scrub and roller contact only with visible ground movement', () => {
    const corner = frame({ driving: { ...createDrivingState(), corner: true, cornerProgress: .5, grip: 25 } });
    const mix = raceAudioMix(corner);
    expect(mix.scrub).toBeGreaterThan(raceAudioMix(frame()).scrub);
    expect(mix.roller).toBeGreaterThan(0);
    for (const stopped of [{ ...corner, grounded: false }, { ...corner, movement: 0 }]) {
      expect(raceAudioMix(stopped)).toMatchObject({ road: 0, scrub: 0, roller: 0 });
    }
  });

  it('changes surface texture off-road and winds down during recovery', () => {
    const normal = raceAudioMix(frame());
    const recovery = raceAudioMix(frame({ offRoad: true, driving: { ...createDrivingState(), recovery: 1, rpm: 900 } }));
    expect(recovery.road).toBeGreaterThan(normal.road);
    expect(recovery.roadHz).toBeLessThan(normal.roadHz);
    expect(recovery.motor).toBeLessThan(normal.motor);
    expect(recovery.roller).toBe(0);
    expect(raceAudioMix(frame({ driving: { ...createDrivingState(), rpm: 0 } })).motor).toBe(0);
  });

  it('attenuates overview distance and bounds stereo pan and invalid telemetry', () => {
    expect(raceAudioMix(frame({ distance: 24 })).attenuation).toBeLessThan(raceAudioMix(frame()).attenuation);
    expect(raceAudioMix(frame({ pan: 8 })).pan).toBe(.85);
    expect(raceAudioMix(frame({ pan: -8 })).pan).toBe(-.85);
    const invalid = raceAudioMix(frame({ movement: NaN, distance: Infinity, pan: NaN, driving: { ...createDrivingState(), rpm: NaN, acceleration: NaN, grip: NaN, corner: true, cornerProgress: NaN } }));
    expect(Object.values(invalid).every(Number.isFinite)).toBe(true);
  });
});

describe('visual impact synchronization', () => {
  it('plays once per visible landing and bounce, never at takeoff', () => {
    const tracker = new RaceImpactTracker();
    const hits: number[] = [];
    for (let i = 0; i <= 132; i++) {
      if (tracker.sample(courseOutPose(i / 60).impacts)) hits.push(i / 60);
    }
    expect(hits).toHaveLength(2);
    expect(hits[0]).toBeCloseTo(.65);
    expect(hits[1]).toBe(.9);
  });

  it('does not replay historical impacts after mute, hidden tab, or circuit reset', () => {
    const tracker = new RaceImpactTracker();
    expect(tracker.sample(4)).toBe(false);
    expect(tracker.sample(5)).toBe(true);
    expect(tracker.sample(5)).toBe(false);
    tracker.reset();
    expect(tracker.sample(9)).toBe(false);
    expect(tracker.sample(0)).toBe(false);
    expect(tracker.sample(1)).toBe(true);
  });

  it('does not invent impacts when reduced motion suppresses visible bounces', () => {
    const tracker = new RaceImpactTracker();
    for (let i = 0; i <= 132; i++) expect(tracker.sample(courseOutPose(i / 60, true).impacts)).toBe(false);
  });
});
