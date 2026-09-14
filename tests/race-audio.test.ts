import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RaceAudioEngine, raceAudioMix, type RaceAudioFrame } from '../lib/race-audio';
import { createDrivingState } from '../lib/race-dynamics';

function frame(overrides: Partial<RaceAudioFrame> = {}): RaceAudioFrame {
  return { driving: createDrivingState(), grounded: true, offRoad: false, movement: 1, impact: 0, pan: 0, distance: 3, ...overrides };
}

const cornerState = { ...createDrivingState(), corner: true, cornerProgress: .5, grip: 25 };

function motorFrame(rpm: number, visualSpeed: number, acceleration = 0) {
  return frame({ movement: visualSpeed, driving: { ...createDrivingState(), rpm, visualSpeed, acceleration } });
}

describe('Mini 4WD race audio mix', () => {
  it('keeps a restrained idle and increases pitch and body with actual RPM and speed', () => {
    const idle = raceAudioMix(motorFrame(0, 0));
    const cruise = raceAudioMix(motorFrame(7200, 1));
    const fast = raceAudioMix(motorFrame(14000, 2));
    expect(idle.motor).toBeGreaterThan(0);
    expect(idle.motor).toBeLessThan(cruise.motor / 2);
    expect(idle.motorHz).toBeLessThan(cruise.motorHz);
    expect(cruise.motorHz).toBeLessThan(fast.motorHz);
    expect(cruise.motor).toBeLessThan(fast.motor);
    expect(idle).toMatchObject({ scrub: 0, roller: 0 });
    expect(cruise).toMatchObject({ scrub: 0, roller: 0 });
    expect(cruise.brush).toBeGreaterThan(idle.brush);
  });

  it('compresses even extreme RPM into a non-piercing pitch and treble range', () => {
    for (const rpm of [-100, 0, 900, 7200, 14000, 30000, 1e9]) {
      const mix = raceAudioMix(motorFrame(rpm, 2));
      expect(mix.motorHz).toBeGreaterThanOrEqual(170);
      expect(mix.motorHz).toBeLessThanOrEqual(590);
      expect(mix.motorCutoff).toBeLessThanOrEqual(2400);
      expect(mix.motor).toBeLessThanOrEqual(.1);
    }
  });

  it('responds to acceleration and braking without inventing pitch changes', () => {
    const accelerating = raceAudioMix(motorFrame(7200, 1, 6));
    const cruise = raceAudioMix(motorFrame(7200, 1));
    const braking = raceAudioMix(motorFrame(7200, 1, -6));
    expect(accelerating.motor).toBeGreaterThan(cruise.motor);
    expect(braking.motor).toBeLessThan(cruise.motor);
    expect(accelerating.motorHz).toBe(cruise.motorHz);
    expect(braking.motorHz).toBe(cruise.motorHz);
  });

  it('softens course-out/recovery while leaving pitch tied to RPM', () => {
    const normal = raceAudioMix(frame());
    const recovering = raceAudioMix(frame({ offRoad: true, driving: { ...createDrivingState(), recovery: 1 } }));
    expect(recovering.motorHz).toBe(normal.motorHz);
    expect(recovering.motor).toBeLessThan(normal.motor);
    expect(recovering.motorCutoff).toBeLessThan(normal.motorCutoff);
    expect(recovering.brush).toBeLessThan(normal.brush);
    expect(raceAudioMix(frame({ driving: { ...createDrivingState(), recovery: 0 } }))).toEqual(normal);
  });

  it('only adds tire and roller friction during moving ground contact, not motor cutouts', () => {
    const corner = frame({ driving: cornerState });
    const mix = raceAudioMix(corner);
    expect(mix.scrub).toBeGreaterThan(0);
    expect(mix.roller).toBeGreaterThan(0);
    for (const stopped of [{ ...corner, grounded: false }, { ...corner, movement: 0 }]) {
      expect(raceAudioMix(stopped)).toMatchObject({ scrub: 0, roller: 0, motorHz: mix.motorHz, motor: mix.motor });
    }
  });

  it('follows corner load and grip without random revs or impact-count retriggers', () => {
    const steady = raceAudioMix(frame({ driving: { ...cornerState, grip: 100 } }));
    const sliding = raceAudioMix(frame({ driving: cornerState }));
    expect(sliding.scrub).toBeGreaterThan(steady.scrub);
    expect(sliding.brush).toBeGreaterThan(steady.brush);
    expect(sliding.motorHz).toBe(steady.motorHz);
    expect(raceAudioMix(frame({ driving: { ...cornerState, cornerProgress: 0 } })))
      .toMatchObject({ scrub: 0, roller: 0 });
    expect(raceAudioMix(frame({ driving: cornerState, impact: 5 }))).toEqual(sliding);
  });

  it('uses softer friction off-road with no roller contact', () => {
    const offRoad = raceAudioMix(frame({ offRoad: true, driving: cornerState }));
    expect(offRoad.scrub).toBeGreaterThan(0);
    expect(offRoad.scrubHz).toBeLessThan(raceAudioMix(frame({ driving: cornerState })).scrubHz);
    expect(offRoad.roller).toBe(0);
    expect(raceAudioMix(frame({ offRoad: true, movement: 0 }))).toMatchObject({ scrub: 0, roller: 0 });
  });

  it('does not mutate telemetry and bounds invalid values, distance and stereo pan', () => {
    const input = frame({ driving: cornerState });
    const before = structuredClone(input);
    expect(raceAudioMix(input)).toEqual(raceAudioMix(input));
    expect(input).toEqual(before);
    expect(raceAudioMix(frame({ distance: 24 })).attenuation).toBeLessThan(raceAudioMix(frame()).attenuation);
    expect(raceAudioMix(frame({ pan: 8 })).pan).toBe(.85);
    expect(raceAudioMix(frame({ pan: -8 })).pan).toBe(-.85);
    const invalid = raceAudioMix(frame({ movement: NaN, distance: Infinity, pan: NaN, driving: { ...cornerState, rpm: Infinity, visualSpeed: NaN, acceleration: -Infinity, recovery: NaN, grip: NaN, cornerProgress: NaN } }));
    expect(Object.values(invalid).every(Number.isFinite)).toBe(true);
    expect(invalid.motor).toBeGreaterThanOrEqual(0);
  });
});

function audioHarness() {
  const node = () => ({ connect: vi.fn((destination: unknown) => destination), disconnect: vi.fn() });
  const param = () => ({ value: 0, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  const source = () => ({ ...node(), start: vi.fn(), stop: vi.fn() });
  const raw = {
    currentTime: 0,
    sampleRate: 8000,
    state: 'suspended',
    destination: node(),
    createGain: vi.fn(() => ({ ...node(), gain: param() })),
    createDynamicsCompressor: vi.fn(() => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() })),
    createStereoPanner: vi.fn(() => ({ ...node(), pan: param() })),
    createBiquadFilter: vi.fn(() => ({ ...node(), type: '', frequency: param(), Q: param() })),
    createBuffer: vi.fn((_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) })),
    createBufferSource: vi.fn(() => ({ ...source(), buffer: null, loop: false })),
    createOscillator: vi.fn(() => ({ ...source(), frequency: param(), setPeriodicWave: vi.fn() })),
    createPeriodicWave: vi.fn(() => ({})),
    resume: vi.fn(async () => { raw.state = 'running'; }),
    suspend: vi.fn(async () => { raw.state = 'suspended'; }),
    close: vi.fn(async () => { raw.state = 'closed'; }),
  };
  const blocked = vi.fn();
  const engine = new RaceAudioEngine(raw as unknown as AudioContext, blocked);
  const master = raw.createGain.mock.results[0].value;
  const oscillator = raw.createOscillator.mock.results[0].value;
  const sources = [oscillator, ...raw.createBufferSource.mock.results.map(result => result.value)];
  return { engine, raw, blocked, master, oscillator, sources };
}

describe('single race audio engine lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('cannot activate before explicit unlock and reports rejected autoplay', async () => {
    const { engine, raw, master } = audioHarness();
    engine.setActive(true);
    engine.update(frame());
    expect(raw.resume).not.toHaveBeenCalled();
    expect(master.gain.value).toBe(0);
    expect(master.gain.setTargetAtTime).not.toHaveBeenCalled();
    raw.resume.mockRejectedValueOnce(new Error('NotAllowedError'));
    await expect(engine.unlock()).rejects.toThrow('NotAllowedError');
    engine.setActive(true);
    expect(raw.resume).toHaveBeenCalledTimes(1);
    engine.dispose();
  });

  it('treats a resolved-but-still-suspended WebView resume as blocked', async () => {
    const { engine, raw } = audioHarness();
    raw.resume.mockImplementationOnce(async () => {});
    await expect(engine.unlock()).rejects.toThrow('Audio playback blocked');
    engine.dispose();
  });

  it('builds one harmonic motor and one shared noise buffer, never restarting sources', async () => {
    const { engine, raw, sources } = audioHarness();
    await engine.unlock();
    for (let i = 0; i < 4; i++) {
      engine.setActive(true);
      raw.currentTime += .1;
      engine.update(frame());
      engine.setActive(false);
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(raw.createOscillator).toHaveBeenCalledTimes(1);
    expect(raw.createBuffer).toHaveBeenCalledTimes(1);
    expect(raw.createBufferSource).toHaveBeenCalledTimes(3);
    expect(new Set(raw.createBufferSource.mock.results.map(result => result.value.buffer)).size).toBe(1);
    const harmonics = raw.createPeriodicWave.mock.calls[0] as unknown as [Float32Array, Float32Array];
    expect(harmonics[1].slice(1).filter(value => value > 0).length).toBe(6);
    sources.forEach(source => expect(source.start).toHaveBeenCalledTimes(1));
    engine.dispose();
  });

  it('smooths pitch and gain at no more than 30Hz, including recovery transitions', async () => {
    const { engine, raw, oscillator, master } = audioHarness();
    await engine.unlock();
    engine.setActive(true);
    for (let i = 0; i < 120; i++) {
      raw.currentTime = i / 120;
      engine.update(motorFrame(i * 120, i / 60));
    }
    expect(oscillator.frequency.setTargetAtTime.mock.calls.length).toBeGreaterThan(20);
    expect(oscillator.frequency.setTargetAtTime.mock.calls.length).toBeLessThanOrEqual(30);
    expect(oscillator.frequency.setTargetAtTime.mock.calls.every((call: number[]) => call[2] === .09)).toBe(true);
    expect(master.gain.setTargetAtTime.mock.calls.every((call: number[]) => call[2] > 0)).toBe(true);
    raw.currentTime = 2;
    engine.update(frame({ driving: { ...createDrivingState(), recovery: 1 } }));
    expect(raw.createGain.mock.results[1].value.gain.setTargetAtTime).toHaveBeenLastCalledWith(raceAudioMix(frame({ driving: { ...createDrivingState(), recovery: 1 } })).motor, 2, .065);
    engine.dispose();
  });

  it('fades out before suspension and cancels stale suspension on quick re-entry', async () => {
    const { engine, raw, master } = audioHarness();
    await engine.unlock();
    engine.setActive(true);
    await Promise.resolve();
    engine.update(frame());
    engine.setActive(false);
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, .04);
    await vi.advanceTimersByTimeAsync(100);
    expect(raw.suspend).not.toHaveBeenCalled();
    engine.setActive(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(raw.suspend).not.toHaveBeenCalled();
    engine.setActive(false);
    await vi.advanceTimersByTimeAsync(250);
    expect(raw.state).toBe('suspended');
    engine.dispose();
  });

  it('does not leave a late resume running after the scene deactivates', async () => {
    const { engine, raw } = audioHarness();
    await engine.unlock();
    let resume: () => void = () => {};
    raw.resume.mockImplementationOnce(() => new Promise<void>(resolve => {
      resume = () => { raw.state = 'running'; resolve(); };
    }));
    engine.setActive(true);
    engine.setActive(false);
    await vi.advanceTimersByTimeAsync(300);
    resume();
    await Promise.resolve();
    expect(raw.state).toBe('suspended');
    engine.dispose();
  });

  it('requests another gesture when a previously unlocked context cannot resume', async () => {
    const { engine, raw, blocked } = audioHarness();
    await engine.unlock();
    raw.resume.mockRejectedValueOnce(new Error('NotAllowedError'));
    engine.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(blocked).toHaveBeenCalledTimes(1);
    engine.dispose();
  });

  it('bounds volume and disposes all sources, nodes, buffers and timers exactly once', async () => {
    const { engine, raw, sources, master } = audioHarness();
    await engine.unlock();
    engine.setActive(true);
    await Promise.resolve();
    engine.setVolume(2);
    engine.update(frame());
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, .065);
    raw.currentTime = 1;
    engine.setVolume(NaN);
    engine.update(frame());
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, .065);
    engine.setActive(false);
    engine.dispose();
    engine.dispose();
    engine.setActive(true);
    engine.update(frame());
    await vi.advanceTimersByTimeAsync(500);
    sources.forEach(source => {
      expect(source.stop).toHaveBeenCalledTimes(1);
      expect(source.disconnect).toHaveBeenCalledTimes(1);
    });
    for (const factory of [raw.createGain, raw.createDynamicsCompressor, raw.createStereoPanner, raw.createBiquadFilter]) {
      factory.mock.results.forEach(result => expect(result.value.disconnect).toHaveBeenCalledTimes(1));
    }
    raw.createBufferSource.mock.results.forEach(result => expect(result.value.buffer).toBeNull());
    expect(master.gain.value).toBe(0);
    expect(raw.close).toHaveBeenCalledTimes(1);
    expect(raw.suspend).not.toHaveBeenCalled();
    expect(raw.state).toBe('closed');
    await expect(engine.unlock()).rejects.toThrow('Audio engine disposed');
  });
});
