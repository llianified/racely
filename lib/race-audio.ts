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
  const rpm = clamp(state.rpm, 0, 14000);
  const speed = clamp(frame.movement, 0, 2);
  const contact = frame.grounded ? Math.min(1, speed) : 0;
  const slip = state.enabled ? clamp((65 - state.grip) / 65) : 0;
  const load = state.corner ? clamp(Math.sin(Math.PI * state.cornerProgress)) : 0;
  return {
    motorHz: 26 + rpm / 14000 * 36,
    motorCutoff: 220 + rpm / 14000 * 280,
    motor: clamp(rpm / 2200) * (state.recovery > 0 ? .04 : .22 + clamp(state.acceleration, 0, 2) * .025),
    roadHz: frame.offRoad ? 500 : 850 + speed * 250,
    road: contact * (frame.offRoad ? .10 : .04),
    scrubHz: 850 + slip * 550,
    scrub: contact * (frame.offRoad ? .02 : slip * .08 + load * .01),
    roller: !frame.offRoad ? contact * load * .025 : 0,
    air: frame.grounded ? speed * .012 : 0,
    pan: clamp(frame.pan, -.85, .85),
    attenuation: 1 / (1 + Math.max(0, clamp(frame.distance, 0, 100) - 3) * .065),
  };
}

export class RaceImpactTracker {
  private previous: number | null = null;

  sample(impact: number) {
    const hit = this.previous !== null && impact > this.previous;
    this.previous = impact;
    return hit;
  }

  reset() { this.previous = null; }
}

type NoiseLayer = { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode };

export class RaceAudioEngine {
  private readonly master: GainNode;
  private readonly spatial: StereoPannerNode;
  private readonly motor: NoiseLayer;
  private readonly motorPulse: OscillatorNode;
  private readonly road: NoiseLayer;
  private readonly scrub: NoiseLayer;
  private readonly roller: NoiseLayer;
  private readonly air: NoiseLayer;
  private readonly impactBuffer: AudioBuffer;
  private readonly impacts = new RaceImpactTracker();
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private readonly transients = new Map<AudioBufferSourceNode, AudioNode[]>();
  private active = false;
  private disposed = false;
  private volume = .5;
  private suspendTimer: ReturnType<typeof setTimeout> | undefined;
  private lastUpdate = -Infinity;
  private lastImpact = -Infinity;

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

    // Modulate filtered noise, not the audible output: no sustained oscillator whistle.
    this.motor = this.noiseLayer(noise, 'lowpass', 360, .5);
    const motorEnvelope = context.createGain();
    motorEnvelope.gain.value = .8;
    this.motor.filter.disconnect();
    this.motor.filter.connect(motorEnvelope).connect(this.motor.gain);
    this.motorPulse = context.createOscillator();
    this.motorPulse.type = 'sine';
    this.motorPulse.frequency.value = 26;
    const pulseDepth = context.createGain();
    pulseDepth.gain.value = .18;
    this.motorPulse.connect(pulseDepth).connect(motorEnvelope.gain);
    this.nodes.push(motorEnvelope, this.motorPulse, pulseDepth);
    this.sources.push(this.motorPulse);

    this.road = this.noiseLayer(noise, 'bandpass', 1000, .65);
    this.scrub = this.noiseLayer(noise, 'bandpass', 1100, .7);
    this.roller = this.noiseLayer(noise, 'bandpass', 950, .6);
    this.air = this.noiseLayer(noise, 'lowpass', 850, .5);
    this.impactBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * .22), context.sampleRate);
    const impact = this.impactBuffer.getChannelData(0);
    for (let i = 0; i < impact.length; i++) {
      const t = i / context.sampleRate;
      impact[i] = Math.random() * 2 - 1;
      impact[i] = impact[i] * Math.exp(-t * 32) * .6 + Math.sin(t * Math.PI * 2 * 230) * Math.exp(-t * 40) * .4;
    }
    this.sources.forEach(source => source.start());
  }

  private noiseLayer(buffer: AudioBuffer, type: BiquadFilterType, frequency: number, q: number): NoiseLayer {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = type;
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
    this.impacts.reset();
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
    if (this.impacts.sample(frame.impact) && now - this.lastImpact > .08) {
      this.playImpact(now);
      this.lastImpact = now;
    }
    // Smooth AudioParams at 30Hz; event detection still runs on every visual frame.
    if (now - this.lastUpdate < 1 / 30) return;
    this.lastUpdate = now;
    const mix = raceAudioMix(frame);
    const target = (param: AudioParam, value: number, smoothing = .045) => param.setTargetAtTime(value, now, smoothing);
    target(this.master.gain, this.volume * mix.attenuation);
    target(this.spatial.pan, mix.pan, .08);
    target(this.motorPulse.frequency, mix.motorHz);
    target(this.motor.filter.frequency, mix.motorCutoff);
    target(this.motor.gain.gain, mix.motor);
    target(this.road.filter.frequency, mix.roadHz);
    target(this.road.gain.gain, mix.road);
    target(this.road.source.playbackRate, .7 + clamp(frame.movement, 0, 2) * .4);
    target(this.scrub.filter.frequency, mix.scrubHz);
    target(this.scrub.gain.gain, mix.scrub);
    target(this.roller.gain.gain, mix.roller * (.75 + .25 * Math.sin(now * 91)));
    target(this.air.gain.gain, mix.air);
  }

  private playImpact(now: number) {
    const source = this.context.createBufferSource();
    source.buffer = this.impactBuffer;
    source.playbackRate.value = .9 + Math.random() * .2;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 4200;
    const gain = this.context.createGain();
    gain.gain.value = .32;
    source.connect(filter).connect(gain).connect(this.spatial);
    this.transients.set(source, [filter, gain]);
    source.onended = () => {
      source.disconnect(); filter.disconnect(); gain.disconnect();
      this.transients.delete(source);
    };
    source.start(now);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.suspendTimer);
    this.master.gain.value = 0;
    this.sources.forEach(source => source.stop());
    for (const [source, nodes] of this.transients) {
      source.onended = null;
      source.stop(); source.disconnect();
      nodes.forEach(node => node.disconnect());
    }
    this.transients.clear();
    this.nodes.forEach(node => node.disconnect());
    void this.context.close().catch(() => {});
  }
}
