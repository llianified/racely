import type { DrivingState } from './race-dynamics';

export type RaceAudioFrame = {
  driving: DrivingState;
  grounded: boolean;
  offRoad: boolean;
  movement: number;
  impact: number;
  pan: number;
  distance: number;
};

function clamp(value: number, min = 0, max = 1) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

export function raceAudioMix(frame: RaceAudioFrame) {
  const state = frame.driving;
  const speed = clamp(frame.movement, 0, 2);
  const contact = frame.grounded ? Math.min(1, speed) : 0;
  const slip = state.enabled ? clamp((65 - state.grip) / 65) : 0;
  const load = state.corner ? clamp(Math.sin(Math.PI * state.cornerProgress)) : 0;
  return {
    scrubHz: frame.offRoad ? 650 : 850 + slip * 400,
    scrub: contact * (frame.offRoad ? .025 : load * (.012 + slip * .065)),
    roller: !frame.offRoad ? contact * load * .02 : 0,
    pan: clamp(frame.pan, -.85, .85),
    attenuation: 1 / (1 + Math.max(0, clamp(frame.distance, 0, 100) - 3) * .065),
  };
}

type NoiseLayer = { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode };

export class RaceAudioEngine {
  private readonly master: GainNode;
  private readonly spatial: StereoPannerNode;
  private readonly scrub: NoiseLayer;
  private readonly roller: NoiseLayer;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private active = false;
  private disposed = false;
  private volume = .5;
  private suspendTimer: ReturnType<typeof setTimeout> | undefined;
  private lastUpdate = -Infinity;

  constructor(private readonly context: AudioContext, private readonly onBlocked: () => void) {
    this.master = context.createGain();
    this.master.gain.value = 0;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 12;
    limiter.ratio.value = 5;
    limiter.attack.value = .003;
    limiter.release.value = .15;
    this.spatial = context.createStereoPanner();
    this.spatial.connect(this.master).connect(limiter).connect(context.destination);
    this.nodes.push(this.master, limiter, this.spatial);

    const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    this.scrub = this.noiseLayer(noise, 1100, .7);
    this.roller = this.noiseLayer(noise, 950, .6);
    this.sources.forEach(source => source.start());
  }

  private noiseLayer(buffer: AudioBuffer, frequency: number, q: number): NoiseLayer {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.spatial);
    this.sources.push(source);
    this.nodes.push(source, filter, gain);
    return { source, filter, gain };
  }

  async unlock() {
    // Called directly by the sound button so iOS/Telegram recognizes the gesture.
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Audio playback blocked');
  }

  setVolume(value: number) { this.volume = clamp(value); }

  setActive(active: boolean) {
    if (this.disposed) return;
    this.active = active;
    clearTimeout(this.suspendTimer);
    if (active) {
      void this.context.resume().catch(() => { if (!this.disposed) this.onBlocked(); });
    } else {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(0, this.context.currentTime, .015);
      this.suspendTimer = setTimeout(() => {
        if (!this.disposed && !this.active) void this.context.suspend().catch(() => {});
      }, 90);
    }
  }

  update(frame: RaceAudioFrame) {
    if (this.disposed || !this.active || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    // Smooth AudioParams at 30Hz without introducing an ambient noise bed.
    if (now - this.lastUpdate < 1 / 30) return;
    this.lastUpdate = now;
    const mix = raceAudioMix(frame);
    const target = (param: AudioParam, value: number, smoothing = .045) => param.setTargetAtTime(value, now, smoothing);
    target(this.master.gain, this.volume * mix.attenuation);
    target(this.spatial.pan, mix.pan, .08);
    target(this.scrub.filter.frequency, mix.scrubHz);
    target(this.scrub.gain.gain, mix.scrub, .02);
    target(this.roller.gain.gain, mix.roller * (.75 + .25 * Math.sin(now * 91)), .02);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.suspendTimer);
    this.master.gain.value = 0;
    this.sources.forEach(source => source.stop());
    this.nodes.forEach(node => node.disconnect());
    void this.context.close().catch(() => {});
  }
}
