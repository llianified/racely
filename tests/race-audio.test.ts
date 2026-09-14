import { describe, expect, it } from 'vitest';
import { raceAudioMix, type RaceAudioFrame } from '../lib/race-audio';
import { createDrivingState } from '../lib/race-dynamics';

function frame(overrides: Partial<RaceAudioFrame> = {}): RaceAudioFrame {
  return { driving: createDrivingState(), grounded: true, offRoad: false, movement: 1, impact: 0, pan: 0, distance: 3, ...overrides };
}

const cornerState = { ...createDrivingState(), corner: true, cornerProgress: .5, grip: 25 };

describe('friction-only race audio', () => {
  it('is silent on straights regardless of RPM, low grip, or impact count', () => {
    for (const rpm of [0, 900, 7200, 14000, 30000]) {
      const input = frame({ impact: 5, driving: { ...createDrivingState(), rpm, grip: 0, corner: false } });
      const before = structuredClone(input);
      const mix = raceAudioMix(input);
      expect(mix).toMatchObject({ scrub: 0, roller: 0 });
      for (const removed of ['motor', 'motorHz', 'motorCutoff', 'gear', 'road', 'air']) {
        expect(mix).not.toHaveProperty(removed);
      }
      expect(input).toEqual(before);
    }
  });

  it('only adds tire and roller friction during moving ground contact', () => {
    const corner = frame({ driving: cornerState });
    expect(raceAudioMix(corner).scrub).toBeGreaterThan(0);
    expect(raceAudioMix(corner).roller).toBeGreaterThan(0);
    for (const stopped of [{ ...corner, grounded: false }, { ...corner, movement: 0 }]) {
      expect(raceAudioMix(stopped)).toMatchObject({ scrub: 0, roller: 0 });
    }
  });

  it('fades contact with corner load and increases scrub when grip slips', () => {
    const steady = raceAudioMix(frame({ driving: { ...cornerState, grip: 100 } }));
    const sliding = raceAudioMix(frame({ driving: cornerState }));
    expect(sliding.scrub).toBeGreaterThan(steady.scrub);
    expect(raceAudioMix(frame({ driving: { ...cornerState, cornerProgress: 0 } })))
      .toMatchObject({ scrub: 0, roller: 0 });
  });

  it('uses softer friction off-road with no roller contact', () => {
    const offRoad = raceAudioMix(frame({ offRoad: true, driving: cornerState }));
    expect(offRoad.scrub).toBeGreaterThan(0);
    expect(offRoad.scrubHz).toBeLessThan(raceAudioMix(frame({ driving: cornerState })).scrubHz);
    expect(offRoad.roller).toBe(0);
    expect(raceAudioMix(frame({ offRoad: true, movement: 0 }))).toMatchObject({ scrub: 0, roller: 0 });
  });

  it('attenuates distance and bounds stereo pan and invalid telemetry', () => {
    expect(raceAudioMix(frame({ distance: 24 })).attenuation).toBeLessThan(raceAudioMix(frame()).attenuation);
    expect(raceAudioMix(frame({ pan: 8 })).pan).toBe(.85);
    expect(raceAudioMix(frame({ pan: -8 })).pan).toBe(-.85);
    const invalid = raceAudioMix(frame({ movement: NaN, distance: Infinity, pan: NaN, driving: { ...cornerState, grip: NaN, cornerProgress: NaN } }));
    expect(Object.values(invalid).every(Number.isFinite)).toBe(true);
  });
});
