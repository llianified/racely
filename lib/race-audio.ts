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
  // Perceptual pitch compression, not a change to the simulated powertrain.
  const rpm = clamp(state.rpm, 0, 14000) / 14000;
  const motorSpeed = clamp(state.visualSpeed, 0, 2) / 2;
  const acceleration = clamp(state.acceleration, -6, 6) / 6;
  const recovering = clamp(state.recovery, 0, 3) > 0;
  const motorLevel = recovering ? .32 : 1;
  return {
    motorHz: 170 + Math.sqrt(rpm) * 420,
    motor: (.016 + rpm * .06 + motorSpeed * .015 + acceleration * .009) * motorLevel,
    motorCutoff: (1300 + rpm * 1100) * (recovering ? .85 : 1),
    brushHz: (620 + rpm * 780) * (frame.offRoad ? .8 : 1),
    brush: (.006 + rpm * .016 + contact * load * slip * .008) * motorLevel,
    scrubHz: frame.offRoad ? 500 : 650 + slip * 250,
    scrub: contact * (frame.offRoad ? .018 : load * (.008 + slip * .03)),
    roller: !frame.offRoad ? contact * load * .012 : 0,
    pan: clamp(frame.pan, -.85, .85),
    attenuation: 1 / (1 + Math.max(0, clamp(frame.distance, 0, 100) - 3) * .065),
  };
}

type NoiseLayer = { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode };

export class RaceAudioEngine {
  private readonly master: GainNode;
  private readonly spatial: StereoPannerNode;
  private readonly motor: OscillatorNode;
  private readonly motorGain: GainNode;
  private readonly motorFilter: BiquadFilterNode;
  private readonly brush: NoiseLayer;
  private readonly scrub: NoiseLayer;
  private readonly roller: NoiseLayer;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private active = false;
  private unlocked = false;
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
    const trebleFilter = context.createBiquadFilter();
    trebleFilter.type = 'lowpass';
    trebleFilter.frequency.value = 3000;
    trebleFilter.Q.value = .5;
    this.spatial = context.createStereoPanner();
    this.spatial.connect(trebleFilter).connect(this.master).connect(limiter).connect(context.destination);
    this.nodes.push(this.master, limiter, this.spatial, trebleFilter);

    this.motorFilter = context.createBiquadFilter();
    this.motorFilter.type = 'lowpass';
    this.motorFilter.frequency.value = 1300;
    this.motorFilter.Q.value = .5;
    this.motorFilter.connect(this.spatial);
    this.motor = context.createOscillator();
    // A bounded harmonic rotor/commutator tone: body below 1kHz, little upper treble.
    this.motor.setPeriodicWave(context.createPeriodicWave(
      new Float32Array(7),
      new Float32Array([0, .72, .48, .23, .1, .035, .012]),
    ));
    this.motor.frequency.value = 170;
    this.motorGain = context.createGain();
    this.motorGain.gain.value = 0;
    this.motor.connect(this.motorGain).connect(this.motorFilter);
    this.sources.push(this.motor);
    this.nodes.push(this.motor, this.motorGain, this.motorFilter);

    const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    this.brush = this.noiseLayer(noise, 620, .55, this.motorFilter);
    this.scrub = this.noiseLayer(noise, 650, .6);
    this.roller = this.noiseLayer(noise, 750, .5);
    const start = context.currentTime;
    this.sources.forEach(source => source.start(start));
  }

  private noiseLayer(buffer: AudioBuffer, frequency: number, q: number, destination: AudioNode = this.spatial): NoiseLayer {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(destination);
    this.sources.push(source);
    this.nodes.push(source, filter, gain);
    return { source, filter, gain };
  }

  async unlock() {
    if (this.disposed) throw new Error('Audio engine disposed');
    // Called directly by the existing sound button for iOS/Telegram gesture activation.
    await this.context.resume();
    if (this.disposed || this.context.state !== 'running') throw new Error('Audio playback blocked');
    this.unlocked = true;
  }

  setVolume(value: number) { this.volume = clamp(value); }

  setActive(active: boolean) {
    if (this.disposed || (active && !this.unlocked)) return;
    if (active && this.active && this.context.state === 'running') return;
    this.active = active;
    clearTimeout(this.suspendTimer);
    if (active) {
      this.lastUpdate = -Infinity;
      void this.context.resume().then(() => {
        if (this.disposed) return;
        if (!this.active) void this.context.suspend().catch(() => {});
        else if (this.context.state !== 'running') this.onBlocked();
      }).catch(() => { if (!this.disposed && this.active) this.onBlocked(); });
    } else {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(0, this.context.currentTime, .04);
      this.suspendTimer = setTimeout(() => {
        if (!this.disposed && !this.active) void this.context.suspend().catch(() => {});
      }, 250);
    }
  }

  update(frame: RaceAudioFrame) {
    if (this.disposed || !this.active || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    // The sources stay phase-continuous; only smoothed AudioParams update at 30Hz.
    if (now - this.lastUpdate < 1 / 30) return;
    this.lastUpdate = now;
    const mix = raceAudioMix(frame);
    const target = (param: AudioParam, value: number, smoothing = .065) => param.setTargetAtTime(value, now, smoothing);
    target(this.master.gain, this.volume * mix.attenuation);
    target(this.spatial.pan, mix.pan, .08);
    target(this.motor.frequency, mix.motorHz, .09);
    target(this.motorGain.gain, mix.motor);
    target(this.motorFilter.frequency, mix.motorCutoff, .1);
    target(this.brush.filter.frequency, mix.brushHz, .1);
    target(this.brush.gain.gain, mix.brush);
    target(this.scrub.filter.frequency, mix.scrubHz);
    target(this.scrub.gain.gain, mix.scrub, .035);
    target(this.roller.gain.gain, mix.roller, .035);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    clearTimeout(this.suspendTimer);
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.value = 0;
    this.sources.forEach(source => source.stop());
    this.nodes.forEach(node => node.disconnect());
    for (const layer of [this.brush, this.scrub, this.roller]) layer.source.buffer = null;
    void this.context.close().catch(() => {});
  }
}
