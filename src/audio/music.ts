/**
 * "Zero Kelvin" — the procedural run soundtrack (cold electro / minimal IDM, D Dorian, 116 BPM base).
 * Chosen by the owner from the T035 music lab (brand/music-lab). Pure WebAudio, no audio files.
 * Tempo follows the live wheel: a lookahead scheduler changes the step length (never the playback rate),
 * so the music speeds up and slows down without changing pitch. Presentation only: never touches the sim.
 */

export const MUSIC = {
  baseBpm: 116,
  /** RPM → tempo factor: 0 RPM plays at 0.85×, the observed peak (≈98.3 RPM) at 1.25×. */
  minFactor: 0.85,
  maxFactor: 1.25,
  peakRpm: 98.316,
  /** Per-tick (25 ms) smoothing toward the target tempo, ≈1 s to settle. */
  smoothing: 0.045,
  lookaheadMs: 25,
  scheduleAhead: 0.12,
  /** Track level before the shared master gain (sound effects stay on top). */
  level: 0.4,
} as const;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
const midiToFreq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

export function rpmToTempoFactor(rpm: number): number {
  const r = Number.isFinite(rpm) ? clamp(rpm, 0, MUSIC.peakRpm) : 0;
  return MUSIC.minFactor + (r / MUSIC.peakRpm) * (MUSIC.maxFactor - MUSIC.minFactor);
}

/** Pattern data (16 steps per bar, 32-bar loop). null = rest. */
const BASS_P1 = [38, null, null, 38, null, null, 41, null, null, 38, null, 43, null, 38, 48, null];
const BASS_P2 = [38, null, 50, null, null, 38, null, 41, null, 43, null, 38, null, 45, 41, null];
const ARP_NOTES = [62, 65, 69, 72, 76, 72, 69, 65, 62, 69, 74, 76, 72, 69, 65, 60];
export const LOOP_STEPS = 512;

/** Which voices sound on a given step. Pure (except the ghost-hat coin flip), so it is unit-testable. */
export interface StepPlan {
  kick: boolean; snare: boolean; clap: boolean;
  hat: 'open' | 'closed' | 'accent' | null;
  bass: number | null; bassCutoff: number;
  arp: number | null; arpFilter: number; arpDetune: number;
  spoke: number | null;
}

export function planStep(step: number, random: () => number = Math.random): StepPlan {
  const total = ((step % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
  const bar = Math.floor(total / 16), s = total % 16;
  const kick = s === 0 || s === 7 || s === 10 || (bar % 4 === 3 && s === 14);
  const snare = bar >= 4 && (s === 4 || s === 12);
  const clap = bar >= 16 && (s === 11 || (bar % 4 === 3 && s === 15));
  let hat: StepPlan['hat'] = null;
  if (bar >= 2) {
    const open = s === 2 || s === 6 || s === 10 || s === 14;
    if (open && bar % 2 === 1) hat = 'open';
    else if (s % 2 === 0 || (bar >= 12 && random() > 0.4)) hat = s % 4 === 0 ? 'accent' : 'closed';
  }
  const bass = (bar % 2 === 0 ? BASS_P1 : BASS_P2)[s];
  const arpOn = bar >= 8 && bar < 28 && (s % 2 === 0 || bar >= 16);
  return {
    kick, snare, clap, hat,
    bass, bassCutoff: 350 + (bar % 8) * 80,
    arp: arpOn ? ARP_NOTES[(s + bar * 2) % ARP_NOTES.length] : null,
    arpFilter: 1800 + (bar % 4) * 300, arpDetune: s % 3 === 0 ? 5 : -4,
    spoke: bar % 8 === 7 && s >= 12 ? 1200 + s * 140 : null,
  };
}

/** Plays Zero Kelvin into `destination`. One instance per AudioContext. */
export class RunMusic {
  private readonly out: GainNode;
  private readonly delayIn: GainNode;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private step = 0;
  private nextTime = 0;
  private factor = 1;
  private target = 1;

  constructor(private readonly ctx: AudioContext, destination: AudioNode) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.0001;
    const limiter = ctx.createDynamicsCompressor();
    this.out.connect(limiter).connect(destination);
    // Dotted feedback delay for the icy arpeggio (bandpassed so it stays airy).
    this.delayIn = ctx.createGain();
    const delay = ctx.createDelay(), feedback = ctx.createGain(), filter = ctx.createBiquadFilter();
    delay.delayTime.value = 0.26; feedback.gain.value = 0.35;
    filter.type = 'bandpass'; filter.frequency.value = 2400; filter.Q.value = 1.2;
    this.delayIn.connect(delay); delay.connect(filter); filter.connect(feedback); feedback.connect(delay); filter.connect(this.out);
  }

  get playing(): boolean { return this.running; }

  /** Starts from bar 1 with a short fade-in. Safe to call while playing (no-op). */
  start(rpm = 0): void {
    if (this.running) return;
    this.running = true;
    this.factor = this.target = rpmToTempoFactor(rpm);
    this.step = 0;
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(0.0001, now);
    this.out.gain.exponentialRampToValueAtTime(MUSIC.level, now + 0.4);
    this.nextTime = now + 0.05;
    this.loop();
  }

  /** Fades out quickly and stops scheduling. */
  stop(fadeSeconds = 0.25): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), now);
    this.out.gain.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);
  }

  setRpm(rpm: number): void { this.target = rpmToTempoFactor(rpm); }

  private loop = (): void => {
    if (!this.running) return;
    this.factor += (this.target - this.factor) * MUSIC.smoothing;
    const stepDur = 60 / (MUSIC.baseBpm * this.factor) / 4;
    const now = this.ctx.currentTime;
    // After a stalled tab, skip missed steps instead of firing a burst of notes.
    if (this.nextTime < now - 0.25) this.nextTime = now + 0.02;
    while (this.nextTime < now + MUSIC.scheduleAhead) {
      this.play(planStep(this.step), this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % LOOP_STEPS;
    }
    this.timer = setTimeout(this.loop, MUSIC.lookaheadMs);
  };

  private play(p: StepPlan, t: number, stepDur: number): void {
    const out = this.out;
    if (p.kick) this.kick(t);
    if (p.snare) this.snare(t);
    if (p.clap) this.clap(t);
    if (p.hat) this.hat(t, p.hat === 'open', p.hat === 'open' ? 0.19 : p.hat === 'accent' ? 0.22 : 0.12);
    if (p.bass !== null) this.bass(t, stepDur * 1.6, midiToFreq(p.bass), p.bassCutoff);
    if (p.arp !== null) {
      const f = midiToFreq(p.arp);
      this.arp(out, t, stepDur * 0.9, f, 0.13, p.arpDetune, p.arpFilter);
      this.arp(this.delayIn, t, stepDur * 0.9, f, 0.1, 0, 2400);
    }
    if (p.spoke !== null) this.spoke(t, p.spoke);
  }

  private noiseBuffer(): AudioBuffer {
    if (!this.noise || this.noise.sampleRate !== this.ctx.sampleRate) {
      const length = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate), data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) { // pink-ish noise
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179; b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852; b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522; b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
      this.noise = buffer;
    }
    return this.noise;
  }

  private env(t: number, peak: number, end: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, end);
    g.connect(this.out);
    return g;
  }

  private kick(t: number): void {
    const osc = this.ctx.createOscillator(), decay = 0.22;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + decay * 0.7);
    osc.connect(this.env(t, 0.52, t + decay));
    osc.start(t); osc.stop(t + decay + 0.02);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, q: number, gain: GainNode, length: number): void {
    const src = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter();
    src.buffer = this.noiseBuffer();
    filter.type = type; filter.frequency.setValueAtTime(freq, t); filter.Q.setValueAtTime(q, t);
    src.connect(filter).connect(gain);
    src.start(t); src.stop(t + length);
  }

  private snare(t: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(195, t);
    osc.frequency.exponentialRampToValueAtTime(195 * 0.45, t + 0.09);
    osc.connect(this.env(t, 0.36 * 0.75, t + 0.09));
    osc.start(t); osc.stop(t + 0.11);
    this.noiseHit(t, 'bandpass', 1800, 2.2, this.env(t, 0.36 * 0.85, t + 0.14), 0.16);
  }

  private clap(t: number): void {
    const g = this.ctx.createGain(), peak = 0.22;
    g.gain.setValueAtTime(peak * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.01);
    g.gain.setValueAtTime(peak * 0.7, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.022);
    g.gain.setValueAtTime(peak, t + 0.024);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    g.connect(this.out);
    this.noiseHit(t, 'bandpass', 1400, 2, g, 0.18);
  }

  private hat(t: number, open: boolean, gain: number): void {
    const decay = open ? 0.2 : 0.045;
    this.noiseHit(t, 'highpass', open ? 6800 : 8200, 1, this.env(t, gain, t + decay), decay + 0.02);
  }

  private bass(t: number, duration: number, freq: number, cutoff: number): void {
    const osc = this.ctx.createOscillator(), filter = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(180, t + duration);
    filter.Q.setValueAtTime(4.5, t);
    g.gain.setValueAtTime(0.38, t);
    g.gain.setValueAtTime(0.38 * 0.85, t + duration * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration + 0.02);
    osc.connect(filter).connect(g).connect(this.out);
    osc.start(t); osc.stop(t + duration + 0.03);
  }

  private arp(dest: AudioNode, t: number, duration: number, freq: number, gain: number, detune: number, filterFreq: number): void {
    const osc = this.ctx.createOscillator(), filter = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    osc.detune.setValueAtTime(detune, t);
    filter.type = 'bandpass'; filter.frequency.setValueAtTime(filterFreq, t); filter.Q.setValueAtTime(1.8, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(filter).connect(g).connect(dest);
    osc.start(t); osc.stop(t + duration + 0.02);
  }

  private spoke(t: number, freq: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.02);
    osc.connect(this.env(t, 0.15, t + 0.02));
    osc.start(t); osc.stop(t + 0.03);
  }
}
