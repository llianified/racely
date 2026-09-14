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
    motorHz: Math.max(25, rpm / 60),
    motor: clamp(rpm / 2200) * (state.recovery > 0 ? .025 : .075 + clamp(state.acceleration, 0, 2) * .015),
    gearHz: 420 + rpm / 60 * 5.7,
    gear: clamp(rpm / 7200) * .025,
    roadHz: frame.offRoad ? 700 : 1600 + speed * 650,
    road: contact * (frame.offRoad ? .12 : .045),
    scrubHz: 1800 + slip * 1200,
    scrub: contact * (frame.offRoad ? .025 : slip * .13 + load * .012),
    roller: !frame.offRoad ? contact * load * .04 : 0,
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
  private readonly motor: OscillatorNode;
  private readonly motorGain: GainNode;
  private readonly gear: OscillatorNode;
  private readonly gearGain: GainNode;
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

    // Mini 4WD: rotor harmonics + commutator/gear whine, not a combustion-engine loop.
    this.motor = context.createOscillator();
    this.motor.setPeriodicWave(context.createPeriodicWave(
      new Float32Array(9), new Float32Array([0, 1, .38, .22, .12, .08, .05, .03, .02]),
    ));
    this.motorGain = context.createGain();
    this.motorGain.gain.value = 0;
    this.motor.connect(this.motorGain).connect(this.spatial);
    this.gear = context.createOscillator();
    this.gear.type = 'triangle';
    this.gearGain = context.createGain();
    this.gearGain.gain.value = 0;
    this.gear.connect(this.gearGain).connect(this.spatial);
    this.nodes.push(this.motor, this.motorGain, this.gear, this.gearGain);
    this.sources.push(this.motor, this.gear);

    const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    this.road = this.noiseLayer(noise, 'bandpass', 1800, .65);
    this.scrub = this.noiseLayer(noise, 'bandpass', 2300, 2.5);
    this.roller = this.noiseLayer(noise, 'bandpass', 3800, 3);
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
    target(this.motor.frequency, mix.motorHz);
    target(this.motorGain.gain, mix.motor);
    target(this.gear.frequency, mix.gearHz);
    target(this.gearGain.gain, mix.gear);
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
