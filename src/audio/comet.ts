/**
 * Flying-comet loop for UNSTOPPABLE (80+ RPM): a fiery roar (low-passed noise with a slow wobble),
 * an air-tearing whoosh (band-passed noise whose centre sweeps up and down), a deep rumble and a
 * sparse crackle. Procedural WebAudio only; fades in and out. Presentation only.
 */
export const COMET = {
  level: 0.3,          // was 0.5; -40% at the owner's request
  /** Linear fade so it is audible at once; ranked runs pre-roll it ~1 s before the mode starts. */
  fadeIn: 0.9,
  quickFadeIn: 0.2,
  fadeOut: 0.6,
  roar: { cutoff: 900, wobbleHz: 3.1, wobble2Hz: 1.27, wobble: 260, gain: 0.55 },
  whoosh: { centre: 1500, sweepHz: 0.55, sweep2Hz: 0.213, sweep: 700, q: 1.3, gain: 0.32 },
  /** Random swells every 1.2-3.5 s so the loop never sounds like a loop. */
  swells: { min: 1.2, max: 3.5, depth: 0.35 },
  rumble: { freq: 52, cutoff: 170, gain: 0.3, tremoloHz: 7 },
  crackle: { perSecond: 14, gain: 0.22 },
} as const;

export class CometSound {
  private readonly out: GainNode;
  private nodes: AudioScheduledSourceNode[] = [];
  private crackleTimer: ReturnType<typeof setInterval> | null = null;
  private noise: AudioBuffer | null = null;
  private running = false;

  constructor(private readonly ctx: AudioContext, private readonly destination: AudioNode) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.0001;
    this.out.connect(destination);
  }

  get playing(): boolean { return this.running; }

  start(quick = false): void {
    if (this.running) return;
    this.running = true;
    const ctx = this.ctx, now = ctx.currentTime, c = COMET;

    // Roar: low-passed noise, its cutoff wobbling like flames.
    const roar = this.noiseSource();
    const roarFilter = ctx.createBiquadFilter(); roarFilter.type = 'lowpass'; roarFilter.frequency.value = c.roar.cutoff;
    const roarGain = ctx.createGain(); roarGain.gain.value = c.roar.gain;
    roar.connect(roarFilter).connect(roarGain).connect(this.out);
    this.lfo(c.roar.wobbleHz * (0.9 + Math.random() * 0.2), c.roar.wobble, roarFilter.frequency);
    this.lfo(c.roar.wobble2Hz * (0.9 + Math.random() * 0.2), c.roar.wobble * 0.7, roarFilter.frequency);

    // Whoosh: band-passed noise sweeping up and down - air being torn apart.
    const whoosh = this.noiseSource();
    const whooshFilter = ctx.createBiquadFilter(); whooshFilter.type = 'bandpass';
    whooshFilter.frequency.value = c.whoosh.centre; whooshFilter.Q.value = c.whoosh.q;
    const whooshGain = ctx.createGain(); whooshGain.gain.value = c.whoosh.gain;
    whoosh.connect(whooshFilter).connect(whooshGain).connect(this.out);
    this.lfo(c.whoosh.sweepHz * (0.85 + Math.random() * 0.3), c.whoosh.sweep, whooshFilter.frequency);
    this.lfo(c.whoosh.sweep2Hz * (0.85 + Math.random() * 0.3), c.whoosh.sweep * 0.6, whooshFilter.frequency);

    // Rumble: a low saw through a low-pass with a fast tremolo.
    const rumble = ctx.createOscillator(); rumble.type = 'sawtooth'; rumble.frequency.value = c.rumble.freq;
    const rumbleFilter = ctx.createBiquadFilter(); rumbleFilter.type = 'lowpass'; rumbleFilter.frequency.value = c.rumble.cutoff;
    const rumbleGain = ctx.createGain(); rumbleGain.gain.value = c.rumble.gain;
    rumble.connect(rumbleFilter).connect(rumbleGain).connect(this.out);
    this.lfo(c.rumble.tremoloHz, c.rumble.gain * 0.4, rumbleGain.gain);
    rumble.start(now); this.nodes.push(rumble);

    // Crackle: short random sparks.
    this.crackleTimer = setInterval(() => this.crackle(), 1000 / c.crackle.perSecond);

    // Swells: a separate gain stage that slowly breathes at random intervals.
    this.swell = ctx.createGain(); this.swell.gain.value = 1;
    this.out.disconnect(); this.out.connect(this.swell).connect(this.destination);
    this.scheduleSwell();

    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(0, now);
    this.out.gain.linearRampToValueAtTime(c.level, now + (quick ? c.quickFadeIn : c.fadeIn));
  }

  private swell: GainNode | null = null;
  private swellTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduleSwell(): void {
    const c = COMET.swells, wait = c.min + Math.random() * (c.max - c.min);
    this.swellTimer = setTimeout(() => {
      if (!this.running || !this.swell) return;
      const t = this.ctx.currentTime, up = 0.4 + Math.random() * 0.6, peak = 1 + (Math.random() * 2 - 1) * c.depth;
      this.swell.gain.cancelScheduledValues(t);
      this.swell.gain.setValueAtTime(this.swell.gain.value, t);
      this.swell.gain.linearRampToValueAtTime(peak, t + up);
      this.swell.gain.linearRampToValueAtTime(1, t + up * 2.2);
      this.scheduleSwell();
    }, wait * 1000);
  }

  stop(fadeSeconds: number = COMET.fadeOut): void {
    if (!this.running) return;
    this.running = false;
    if (this.crackleTimer) clearInterval(this.crackleTimer);
    this.crackleTimer = null;
    if (this.swellTimer) clearTimeout(this.swellTimer);
    this.swellTimer = null;
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), now);
    this.out.gain.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);
    const end = now + fadeSeconds + 0.05;
    for (const node of this.nodes) { try { node.stop(end); } catch { /* already stopped */ } }
    this.nodes = [];
  }

  private noiseBuffer(): AudioBuffer {
    if (!this.noise || this.noise.sampleRate !== this.ctx.sampleRate) {
      const length = this.ctx.sampleRate * 9; // long buffer: the repeat is not noticeable
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate), data = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < length; i++) { // brown-ish noise: deep, fiery
        brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        data[i] = brown * 3.5 + (Math.random() * 2 - 1) * 0.15;
      }
      this.noise = buffer;
    }
    return this.noise;
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(); src.loop = true;
    src.start(this.ctx.currentTime, Math.random() * 8); // different offsets decorrelate the layers
    this.nodes.push(src);
    return src;
  }

  private lfo(hz: number, depth: number, target: AudioParam): void {
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.frequency.value = hz; gain.gain.value = depth;
    osc.connect(gain).connect(target);
    osc.start(); this.nodes.push(osc);
  }

  private crackle(): void {
    if (!this.running || Math.random() < 0.35) return;
    const ctx = this.ctx, t = ctx.currentTime + Math.random() * 0.05;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer();
    const filter = ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 2500 + Math.random() * 3000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(COMET.crackle.gain * (0.4 + Math.random() * 0.6), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03 + Math.random() * 0.04);
    src.connect(filter).connect(g).connect(this.out);
    src.start(t, Math.random() * 8.5); src.stop(t + 0.09);
  }
}
