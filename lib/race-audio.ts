function clamp(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

type LapChime = { source: OscillatorNode; gain: GainNode };

export class RaceAudioEngine {
  private readonly master: GainNode;
  private readonly chimes = new Set<LapChime>();
  private active = false;
  private unlocked = false;
  private disposed = false;
  private volume = .5;
  private previousLaps: number | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly context: AudioContext, private readonly onBlocked: () => void) {
    this.master = context.createGain();
    this.master.gain.value = 0;
    this.master.connect(context.destination);
  }

  async unlock() {
    if (this.disposed) throw new Error('Audio engine disposed');
    // Called directly by the existing sound button for iOS/Telegram gesture activation.
    await this.context.resume();
    if (this.disposed || this.context.state !== 'running') throw new Error('Audio playback blocked');
    this.unlocked = true;
  }

  setVolume(value: number) {
    if (this.disposed) return;
    this.volume = clamp(value);
    if (this.active) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, .01);
  }

  setActive(active: boolean) {
    if (this.disposed || (active && !this.unlocked)) return;
    if (active && this.active && this.context.state === 'running') return;
    if (!active || !this.active) this.previousLaps = null;
    this.active = active;
    clearTimeout(this.suspendTimer);
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(active ? this.volume : 0, now, .01);
    if (active) {
      void this.context.resume().then(() => {
        if (this.disposed) return;
        if (!this.active) void this.context.suspend().catch(() => {});
        else if (this.context.state !== 'running') this.onBlocked();
      }).catch(() => { if (!this.disposed && this.active) this.onBlocked(); });
    } else {
      this.suspendTimer = setTimeout(() => {
        if (this.disposed || this.active) return;
        this.clearChimes();
        void this.context.suspend().catch(() => {});
      }, 100);
    }
  }

  updateLaps(laps: number) {
    if (this.disposed || !Number.isSafeInteger(laps) || laps < 0) return;
    const previous = this.previousLaps;
    // Seed silently on entry; ignore duplicate ticks and backward server corrections.
    this.previousLaps = Math.max(previous ?? laps, laps);
    if (previous === null || laps <= previous || !this.active || this.volume === 0 || this.context.state !== 'running') return;
    this.playLapChime();
  }

  private playLapChime() {
    const now = this.context.currentTime;
    const source = this.context.createOscillator();
    source.type = 'sine';
    source.frequency.value = 880;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(.16, now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .22);
    gain.gain.linearRampToValueAtTime(0, now + .24);
    source.connect(gain).connect(this.master);
    const chime = { source, gain };
    this.chimes.add(chime);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.chimes.delete(chime);
    };
    source.start(now);
    source.stop(now + .25);
  }

  private clearChimes() {
    for (const { source, gain } of this.chimes) {
      source.onended = null;
      source.stop();
      source.disconnect();
      gain.disconnect();
    }
    this.chimes.clear();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    clearTimeout(this.suspendTimer);
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.value = 0;
    this.clearChimes();
    this.master.disconnect();
    void this.context.close().catch(() => {});
  }
}
