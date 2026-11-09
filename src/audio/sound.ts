/**
 * Procedural WebAudio sound effects for SqueekRunner.
 * Synthesizes retro-modern arcade sounds using oscillators and noise generators.
 * Respects autoplay policies and stores mute preference in localStorage.
 */

import { RunMusic } from './music';
import { CometSound } from './comet';

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'squeekrunner.audio.muted';
/** Overall game volume (music + effects). Was 0.22; raised to 0.62 at the owner's request. */
export const MASTER_VOLUME = 0.62;

function defaultStorage(): StoragePort | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private noiseBuffer: AudioBuffer | null = null;
  private unlocked = false;
  private music: RunMusic | null = null;
  private comet: CometSound | null = null;
  private readonly storageProvider: () => StoragePort | null;

  constructor(storageProvider: () => StoragePort | null = defaultStorage) {
    this.storageProvider = storageProvider;
    this.muted = this.readMutePreference();
  }

  private readMutePreference(): boolean {
    try {
      const storage = this.storageProvider();
      return storage ? storage.getItem(STORAGE_KEY) === 'true' : false;
    } catch {
      return false;
    }
  }

  private saveMutePreference(muted: boolean): void {
    try {
      const storage = this.storageProvider();
      if (storage) {
        storage.setItem(STORAGE_KEY, muted ? 'true' : 'false');
      }
    } catch {
      // In restricted or quota-exceeded environments, in-memory state is retained.
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.unlocked) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : MASTER_VOLUME, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      } catch {
        this.dispose();
        return null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /** Call on user gestures (click, tap, keydown) to unlock browser audio. */
  unlock(): void {
    this.unlocked = true;
    this.ensureContext();
  }

  /** One shared context across scenes; release it when its game is destroyed. */
  dispose(): void {
    this.music?.stop(0.02);
    this.music = null;
    this.comet?.stop(0.02);
    this.comet = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.masterGain = null;
    this.noiseBuffer = null;
    this.unlocked = false;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.saveMutePreference(muted);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : MASTER_VOLUME, this.ctx.currentTime);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Run soundtrack ("Zero Kelvin"): starts with the run, tempo follows the wheel RPM, respects M. */
  startMusic(rpm: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    try {
      this.music ??= new RunMusic(ctx, this.masterGain);
      this.music.start(rpm);
    } catch { /* Audio is optional. */ }
  }

  stopMusic(fadeSeconds = 0.25): void { this.music?.stop(fadeSeconds); }

  setMusicRpm(rpm: number): void { this.music?.setRpm(rpm); }

  /** UNSTOPPABLE flying-comet loop (roar + whoosh + rumble + crackle). Follows M like everything else. */
  startComet(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    try { (this.comet ??= new CometSound(ctx, this.masterGain)).start(); } catch { /* Audio is optional. */ }
  }

  stopComet(fadeSeconds?: number): void { this.comet?.stop(fadeSeconds); }

  /** Short optional haptics share the M preference; unsupported/blocked devices are harmless. */
  vibrate(milliseconds: number): void {
    if (this.muted || typeof navigator === 'undefined') return;
    try { navigator.vibrate?.(milliseconds); } catch { /* Browser policy can deny vibration. */ }
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer || this.noiseBuffer.sampleRate !== ctx.sampleRate) {
      const bufferSize = ctx.sampleRate * 0.3; // 300ms of noise
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  }

  /** Crisp, bouncy upward pitch sweep for grounded jump. */
  playJump(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(560, now + 0.11);

    gain.gain.setValueAtTime(0.455, now); // +30% (owner request)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    osc.start(now);
    osc.stop(now + 0.14);
  }

  /** Higher, chirp-like sweep for aerial double jump. */
  playDoubleJump(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.12);

    gain.gain.setValueAtTime(0.364, now); // +30% (owner request)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /** Bright, cheerful three-note arpeggio when catching the golden nut. */
  playCollectNut(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    // Notes: E5 (659Hz), G#5 (830Hz), B5 (987Hz), E6 (1318Hz)
    const pitches = [659.25, 830.61, 987.77, 1318.51];

    pitches.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteTime = now + idx * 0.045;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.3, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.16);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      osc.start(noteTime);
      osc.stop(noteTime + 0.18);
    });
  }

  /** Resonant energy zap when shield absorbs an obstacle impact. */
  playShieldHit(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(750, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.18);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(4, now);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    osc.start(now);
    osc.stop(now + 0.24);
  }

  /** Punchy impact crunch with low-end drop on game-over collision. */
  playHit(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer(ctx);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(1400, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(200, now + 0.2);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.65, now); // +30% (owner request)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noise.onended = () => { noise.disconnect(); noiseFilter.disconnect(); noiseGain.disconnect(); };
    noise.start(now);
    noise.stop(now + 0.24);

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.25);

    oscGain.gain.setValueAtTime(0.78, now); // +30% (owner request)
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    osc.onended = () => { osc.disconnect(); oscGain.disconnect(); };
    osc.start(now);
    osc.stop(now + 0.3);
  }

  /** Triumphant golden fanfare when a confirmed Squeek block is mined! */
  playNewBlock(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteTime = now + idx * 0.08;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.32, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.26);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      osc.start(noteTime);
      osc.stop(noteTime + 0.28);
    });
  }

  /** Subtle wooden blip for UI button clicks. */
  playUiClick(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.04);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    osc.start(now);
    osc.stop(now + 0.06);
  }
}

/** Global singleton sound instance for easy scene sharing. */
export const sound = new SoundManager();
