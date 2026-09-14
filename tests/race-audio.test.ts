import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RaceAudioEngine } from '../lib/race-audio';

function audioHarness() {
  const node = () => ({ connect: vi.fn((destination: unknown) => destination), disconnect: vi.fn() });
  const param = () => ({ value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  const raw = {
    currentTime: 0,
    state: 'suspended',
    destination: node(),
    createGain: vi.fn(() => ({ ...node(), gain: param() })),
    createOscillator: vi.fn(() => ({ ...node(), type: '', frequency: param(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null })),
    createBufferSource: vi.fn(),
    resume: vi.fn(async () => { raw.state = 'running'; }),
    suspend: vi.fn(async () => { raw.state = 'suspended'; }),
    close: vi.fn(async () => { raw.state = 'closed'; }),
  };
  const blocked = vi.fn();
  const engine = new RaceAudioEngine(raw as unknown as AudioContext, blocked);
  const master = raw.createGain.mock.results[0].value;
  return { engine, raw, blocked, master };
}

async function enabledHarness() {
  const harness = audioHarness();
  await harness.engine.unlock();
  harness.engine.setActive(true);
  await Promise.resolve();
  return harness;
}

describe('lap-only race audio', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('creates no continuous car or noise sources, even after enabling', async () => {
    const { engine, raw } = await enabledHarness();
    engine.updateLaps(12);
    for (let i = 0; i < 100; i++) engine.updateLaps(12);
    expect(raw.createOscillator).not.toHaveBeenCalled();
    expect(raw.createBufferSource).not.toHaveBeenCalled();
    engine.dispose();
  });

  it('plays one short ding per lap increase, not per tick or caught-up lap', async () => {
    const { engine, raw } = await enabledHarness();
    engine.updateLaps(12);
    engine.updateLaps(13);
    engine.updateLaps(13);
    expect(raw.createOscillator).toHaveBeenCalledTimes(1);
    engine.updateLaps(20);
    expect(raw.createOscillator).toHaveBeenCalledTimes(2);
    const source = raw.createOscillator.mock.results[0].value;
    const envelope = raw.createGain.mock.results[1].value.gain;
    expect(source.type).toBe('sine');
    expect(source.frequency.value).toBe(880);
    expect(source.start).toHaveBeenCalledWith(0);
    expect(source.stop).toHaveBeenCalledWith(.25);
    expect(envelope.setValueAtTime).toHaveBeenCalledWith(0, 0);
    expect(envelope.linearRampToValueAtTime).toHaveBeenCalledWith(.16, .008);
    expect(envelope.exponentialRampToValueAtTime).toHaveBeenCalledWith(.0001, .22);
    expect(envelope.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, .24);
    engine.dispose();
  });

  it('ignores invalid counts and backward corrections without replaying old laps', async () => {
    const { engine, raw } = await enabledHarness();
    engine.updateLaps(10);
    for (const laps of [NaN, Infinity, -1, 10.5, 9, 10]) engine.updateLaps(laps);
    expect(raw.createOscillator).not.toHaveBeenCalled();
    engine.updateLaps(11);
    engine.updateLaps(10);
    engine.updateLaps(11);
    expect(raw.createOscillator).toHaveBeenCalledTimes(1);
    engine.dispose();
  });

  it('does not replay laps earned while muted, hidden, or outside the race tab', async () => {
    const { engine, raw } = await enabledHarness();
    engine.updateLaps(10);
    engine.setActive(false);
    engine.updateLaps(11);
    await vi.advanceTimersByTimeAsync(100);
    engine.setActive(true);
    engine.updateLaps(20);
    expect(raw.createOscillator).not.toHaveBeenCalled();
    engine.updateLaps(21);
    expect(raw.createOscillator).toHaveBeenCalledTimes(1);
    engine.dispose();
  });

  it('honors zero volume without queuing a later ding', async () => {
    const { engine, raw, master } = await enabledHarness();
    engine.updateLaps(0);
    engine.setVolume(0);
    engine.updateLaps(1);
    expect(raw.createOscillator).not.toHaveBeenCalled();
    engine.setVolume(.25);
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(.25, 0, .01);
    engine.updateLaps(1);
    expect(raw.createOscillator).not.toHaveBeenCalled();
    engine.updateLaps(2);
    expect(raw.createOscillator).toHaveBeenCalledTimes(1);
    engine.setVolume(2);
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, .01);
    engine.setVolume(NaN);
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, .01);
    engine.dispose();
  });

  it('disconnects each completed one-shot and does not stop it again on disposal', async () => {
    const { engine, raw } = await enabledHarness();
    engine.updateLaps(0);
    engine.updateLaps(1);
    const source = raw.createOscillator.mock.results[0].value;
    const gain = raw.createGain.mock.results[1].value;
    source.onended?.();
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(gain.disconnect).toHaveBeenCalledTimes(1);
    engine.dispose();
    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
  });

  it('requires an explicit gesture and handles blocked WebView playback', async () => {
    const { engine, raw } = audioHarness();
    engine.setActive(true);
    engine.updateLaps(0);
    engine.updateLaps(1);
    expect(raw.resume).not.toHaveBeenCalled();
    expect(raw.createOscillator).not.toHaveBeenCalled();
    raw.resume.mockRejectedValueOnce(new Error('NotAllowedError'));
    await expect(engine.unlock()).rejects.toThrow('NotAllowedError');
    raw.resume.mockImplementationOnce(async () => {});
    await expect(engine.unlock()).rejects.toThrow('Audio playback blocked');
    engine.dispose();
  });

  it('drops laps during an interrupted context instead of queuing sounds', async () => {
    const { engine, raw } = await enabledHarness();
    engine.updateLaps(0);
    raw.state = 'suspended';
    engine.updateLaps(1);
    expect(raw.createOscillator).not.toHaveBeenCalled();
    raw.state = 'running';
    engine.updateLaps(1);
    expect(raw.createOscillator).not.toHaveBeenCalled();
    engine.updateLaps(2);
    expect(raw.createOscillator).toHaveBeenCalledTimes(1);
    engine.dispose();
  });

  it('fades and clears an in-flight ding before suspending', async () => {
    const { engine, raw, master } = await enabledHarness();
    engine.updateLaps(0);
    engine.updateLaps(1);
    engine.setActive(false);
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, .01);
    expect(raw.suspend).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    const source = raw.createOscillator.mock.results[0].value;
    expect(source.onended).toBeNull();
    expect(source.stop).toHaveBeenLastCalledWith();
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(raw.state).toBe('suspended');
    engine.dispose();
  });

  it('cancels stale suspension on quick re-entry', async () => {
    const { engine, raw } = await enabledHarness();
    engine.setActive(false);
    await vi.advanceTimersByTimeAsync(50);
    engine.setActive(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(raw.suspend).not.toHaveBeenCalled();
    engine.dispose();
  });

  it('does not leave a late resume running after deactivation', async () => {
    const { engine, raw } = await enabledHarness();
    engine.setActive(false);
    await vi.advanceTimersByTimeAsync(100);
    let resume: () => void = () => {};
    raw.resume.mockImplementationOnce(() => new Promise<void>(resolve => {
      resume = () => { raw.state = 'running'; resolve(); };
    }));
    engine.setActive(true);
    engine.setActive(false);
    await vi.advanceTimersByTimeAsync(100);
    resume();
    await Promise.resolve();
    expect(raw.state).toBe('suspended');
    engine.dispose();
  });

  it('requests another gesture when an unlocked context cannot resume', async () => {
    const { engine, raw, blocked } = await enabledHarness();
    engine.setActive(false);
    await vi.advanceTimersByTimeAsync(100);
    raw.resume.mockRejectedValueOnce(new Error('NotAllowedError'));
    engine.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(blocked).toHaveBeenCalledTimes(1);
    engine.dispose();
  });

  it('disposes nodes, context and timers once, including an in-flight ding', async () => {
    const { engine, raw, master } = await enabledHarness();
    engine.updateLaps(0);
    engine.updateLaps(1);
    engine.setActive(false);
    engine.dispose();
    engine.dispose();
    engine.setActive(true);
    engine.setVolume(1);
    engine.updateLaps(2);
    await vi.advanceTimersByTimeAsync(500);
    const source = raw.createOscillator.mock.results[0].value;
    expect(source.onended).toBeNull();
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    raw.createGain.mock.results.forEach(result => expect(result.value.disconnect).toHaveBeenCalledTimes(1));
    expect(master.gain.value).toBe(0);
    expect(raw.close).toHaveBeenCalledTimes(1);
    expect(raw.suspend).not.toHaveBeenCalled();
    expect(raw.state).toBe('closed');
    await expect(engine.unlock()).rejects.toThrow('Audio engine disposed');
  });
});
