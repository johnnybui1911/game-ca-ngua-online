/**
 * All game audio, synthesised with the Web Audio API (no audio files): two looping music tracks
 * and a few effects. Browsers start audio only after a user gesture, so the context is created on
 * the first tap or key press; a track asked for earlier starts then.
 */
import { parsePattern, type NoteEvent } from './pattern';

export type Track = 'lobby' | 'game';

export interface SoundSettings {
  music: boolean;
  effects: boolean;
}

const STORAGE_KEY = 'ca-ngua:sound';
const LOOKAHEAD_S = 0.15;
const TICK_MS = 30;
const DEFAULT_FADE_IN_S = 1;

interface Voice {
  wave: OscillatorType | 'noise' | 'kick';
  gain: number;
  /** Centre frequency of a `noise` hit in Hz (default 7000: a hi-hat; low values sound like a wood block). */
  freq?: number;
  events: NoteEvent[];
}

interface Song {
  bpm: number;
  /** Loop length in sixteenth notes. */
  steps: number;
  voices: Voice[];
}

const bars = (...b: string[]): string => b.join(' ');

/** Folk-flavoured C pentatonic tune with wood-block knocks for the entry, lobby and waiting screens. */
const LOBBY: Song = {
  bpm: 116,
  steps: 64,
  voices: [
    {
      wave: 'triangle',
      gain: 0.15,
      events: parsePattern(
        bars(
          'E5 . E5 G5 . A5 . G5 E5 . D5 . C5 . . .',
          'D5 . D5 E5 . G5 . E5 D5 . C5 . A4 . . .',
          'E5 . E5 G5 . A5 . C6 A5 . G5 . E5 . . .',
          'G5 . E5 D5 . E5 . D5 C5 . A4 . C5 - - -',
        ),
      ),
    },
    {
      wave: 'sine',
      gain: 0.2,
      events: parsePattern(
        bars(
          'C3 . . . . . . . G2 . . . . . . .',
          'C3 . . . . . . . G2 . . . . . . .',
          'A2 . . . . . . . E3 . . . . . . .',
          'G2 . . . . . . . C3 . . . . . . .',
        ),
      ),
    },
    {
      wave: 'noise',
      gain: 0.22,
      freq: 1400,
      events: parsePattern(
        bars(
          '. . . . X . . . . . . . X . . .',
          '. . . . X . . . . . . . X . . .',
          '. . . . X . . . . . . . X . . .',
          '. . . . X . . . . . . . X . . .',
        ),
      ),
    },
    {
      wave: 'noise',
      gain: 0.05,
      freq: 3200,
      events: parsePattern(
        bars(
          '. . X . . . X . . . X . . . X .',
          '. . X . . . X . . . X . . . X .',
          '. . X . . . X . . . X . . . X .',
          '. . X . . . X . . . X . . . X .',
        ),
      ),
    },
  ],
};

/** Brisker tune with bass and drums while a match runs. */
const GAME: Song = {
  bpm: 128,
  steps: 64,
  voices: [
    {
      wave: 'square',
      gain: 0.05,
      events: parsePattern(
        'A4 . C5 . D5 . E5 - G5 . E5 . D5 . C5 . ' +
          'D5 . E5 . A4 - - - C5 . D5 . A4 - . . ' +
          'E5 . G5 . A5 . G5 - E5 . D5 . E5 . G5 . ' +
          'A5 - G5 . E5 . D5 . C5 . D5 . A4 - - -',
      ),
    },
    {
      wave: 'triangle',
      gain: 0.2,
      events: parsePattern(
        'A2 . A3 . A2 . A3 . A2 . A3 . A2 . A3 . ' +
          'D3 . D2 . D3 . D2 . D3 . D2 . E3 . E2 . ' +
          'C3 . C2 . C3 . C2 . G2 . G3 . G2 . G3 . ' +
          'A2 . A3 . A2 . A3 . E2 . E3 . E2 . E3 .',
      ),
    },
    { wave: 'kick', gain: 0.35, events: parsePattern('X . . . . . . . X . . . . . . . '.repeat(4)) },
    { wave: 'noise', gain: 0.05, events: parsePattern('. . X . . . X . . . X . . . X X '.repeat(4)) },
  ],
};


const SONGS: Record<Track, Song> = { lobby: LOBBY, game: GAME };

function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function loadSettings(): SoundSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<SoundSettings>;
    return { music: raw.music !== false, effects: raw.effects !== false };
  } catch {
    return { music: true, effects: true };
  }
}

interface Playing {
  track: Track;
  bus: GainNode;
  timer: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private wanted: Track | null = null;
  private fadeIn = DEFAULT_FADE_IN_S;
  private playing: Playing | null = null;
  private settings: SoundSettings = loadSettings();
  private boardMuted = false;
  private readonly listeners = new Set<() => void>();

  getSettings = (): SoundSettings => this.settings;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setSettings(next: SoundSettings): void {
    this.settings = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // private mode: the choice lasts for this page only
    }
    for (const l of this.listeners) l();
    this.syncMusic();
  }

  /**
   * Track to loop from now on; switching fades the previous one out. `fadeInSeconds` is how
   * gently it comes in when it starts (also when it can only start later, on the first gesture);
   * asking again for the track already wanted keeps the fade it was asked with.
   */
  setTrack(track: Track | null, fadeInSeconds?: number): void {
    if (track !== this.wanted || fadeInSeconds !== undefined) this.fadeIn = fadeInSeconds ?? DEFAULT_FADE_IN_S;
    this.wanted = track;
    this.syncMusic();
  }

  /**
   * Attaches the gesture listeners that create and resume the audio context. A finger's
   * `pointerdown` is not a user activation, so touch devices unlock on `pointerup`/`touchend`/`click`;
   * the listeners stay until the context is actually running.
   */
  install(): void {
    const events = ['pointerup', 'touchend', 'click', 'keydown'] as const;
    const unlock = () => {
      void this.unlock().then((running) => {
        if (running) for (const e of events) window.removeEventListener(e, unlock, true);
      });
    };
    for (const e of events) window.addEventListener(e, unlock, true);
    // Try at once: a browser that already trusts the site (installed app, high media engagement)
    // lets the context run without a tap. Otherwise it stays suspended and the first tap starts it.
    unlock();
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  /** Dice rattling on the board, then settling. */
  playDice(): void {
    const ctx = this.effectsContext();
    if (!ctx) return;
    let t = ctx.currentTime;
    let gap = 0.035;
    for (let i = 0; i < 9; i++) {
      this.click(t, 1400 + Math.random() * 2400, 0.5 - i * 0.04, 0.03);
      t += gap;
      gap *= 1.22;
    }
    this.click(t, 700, 0.45, 0.07);
  }

  /** Two rising bell notes: it is your turn. */
  playTurn(): void {
    const ctx = this.effectsContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.bell(t, midiToHz(88), 0.28);
    this.bell(t + 0.16, midiToHz(93), 0.28);
  }

  /** A soft two-note pop for another player's emote; silent when effects are off. */
  playEmote(): void {
    const ctx = this.effectsContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.bell(t, midiToHz(84), 0.1, 0.1);
    this.bell(t + 0.07, midiToHz(88), 0.1, 0.1);
  }

  /** Three quick high beeps: your turn is running out. */
  playReminder(): void {
    const ctx = this.effectsContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) this.bell(t + i * 0.14, midiToHz(96), 0.18, 0.18);
  }

  /**
   * Holds back the effects the board plays by itself (hooves, kicks) while `muted`: the home page's
   * demo game must not be heard under a panel the player is reading. Music and every other effect
   * are not affected.
   */
  setBoardEffectsMuted(muted: boolean): void {
    this.boardMuted = muted;
  }

  /**
   * Hoof beats for a horse moving `hops` cells, one "clip-clop" per hop, spaced like the board
   * animation; with `kickAt` (seconds from now) a heavy knock where it kicks an opponent home. A slow-motion
   * kick gives `flight`: a whoosh over the victim's fling, starting `after` seconds from now.
   */
  playHooves(hops: number, hopSeconds: number, kickAt: number | null, flight: { after: number; seconds: number } | null = null): void {
    const ctx = this.boardMuted ? null : this.effectsContext();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const gap = Math.max(0.05, hopSeconds);
    for (let i = 0; i < hops; i++) {
      const t = t0 + i * gap;
      this.hoof(t, 1.0 + (i % 2) * 0.12, 0.55);
      this.hoof(t + Math.min(0.06, gap * 0.4), 0.88 + (i % 2) * 0.1, 0.35);
    }
    if (kickAt !== null) this.knock(t0 + kickAt);
    if (flight) this.whoosh(t0 + flight.after, flight.seconds);
  }

  // ----------------------------------------------------------------- internals

  /** Creates the context on first call and resumes it; resolves whether it is running. */
  private async unlock(): Promise<boolean> {
    if (typeof AudioContext === 'undefined') return false;
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(ctx.destination);
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
      this.syncMusic();
    }
    try {
      await this.ctx.resume();
    } catch {
      // not a user activation yet; a later gesture retries
    }
    return this.ctx.state === 'running';
  }

  private effectsContext(): AudioContext | null {
    if (!this.settings.effects || !this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  private syncMusic(): void {
    const want = this.settings.music ? this.wanted : null;
    if (this.playing?.track === want) return;
    this.stopMusic();
    if (want && this.ctx && this.master) this.startMusic(want, this.ctx, this.master);
  }

  private stopMusic(): void {
    const p = this.playing;
    const ctx = this.ctx;
    if (!p || !ctx) return;
    this.playing = null;
    window.clearInterval(p.timer);
    const t = ctx.currentTime;
    p.bus.gain.setValueAtTime(p.bus.gain.value, t);
    p.bus.gain.linearRampToValueAtTime(0, t + 0.6);
    setTimeout(() => p.bus.disconnect(), 800);
  }

  private startMusic(track: Track, ctx: AudioContext, master: GainNode): void {
    const song = SONGS[track];
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(1, ctx.currentTime + this.fadeIn);
    // The gentle entry belongs to the request that asked for it; later starts (unmuting) use the default.
    this.fadeIn = DEFAULT_FADE_IN_S;
    bus.connect(master);
    const stepS = 60 / song.bpm / 4;
    let step = 0;
    let next = ctx.currentTime + 0.05;
    const tick = () => {
      while (next < ctx.currentTime + LOOKAHEAD_S) {
        for (const voice of song.voices) {
          for (const ev of voice.events) if (ev.step === step) this.note(voice, ev, next, stepS, bus);
        }
        step = (step + 1) % song.steps;
        next += stepS;
      }
    };
    tick();
    this.playing = { track, bus, timer: window.setInterval(tick, TICK_MS) };
  }

  private note(voice: Voice, ev: NoteEvent, t: number, stepS: number, out: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const env = ctx.createGain();
    env.connect(out);
    if (voice.wave === 'noise') {
      this.noiseBurst(t, voice.freq ?? 7000, voice.gain, 0.04, env);
      return;
    }
    if (voice.wave === 'kick') {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      env.gain.setValueAtTime(voice.gain, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(env);
      osc.start(t);
      osc.stop(t + 0.2);
      return;
    }
    if (ev.midi === null) return;
    const dur = ev.length * stepS;
    const osc = ctx.createOscillator();
    osc.type = voice.wave;
    osc.frequency.setValueAtTime(midiToHz(ev.midi), t);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(voice.gain, t + 0.02);
    env.gain.setValueAtTime(voice.gain, t + Math.max(0.02, dur - 0.08));
    env.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.12);
    osc.connect(env);
    osc.start(t);
    osc.stop(t + dur + 0.15);
  }

  private noiseBurst(t: number, freq: number, gain: number, dur: number, out: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 1.5;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(env).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private click(t: number, freq: number, gain: number, dur: number): void {
    if (this.master) this.noiseBurst(t, freq, gain, dur, this.master);
  }

  private bell(t: number, hz: number, gain: number, dur = 0.9): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    for (const [mult, g] of [
      [1, 1],
      [2.01, 0.35],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz * mult;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(gain * g, t + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(env).connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }

  /** One hoof on wood: a short pitched knock plus a tick of filtered noise. */
  private hoof(t: number, pitch: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(160 * pitch, t + 0.05);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.08);
    this.noiseBurst(t, 2500 * pitch, gain * 0.5, 0.025, this.master);
  }

  /** A horse kicked back to its stable: a low thump with a rattle. */
  private knock(t: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.25);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.7, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.32);
    this.noiseBurst(t, 900, 0.5, 0.12, this.master);
  }

  /** The victim flung across the board: filtered noise that swells and sweeps up, then falls away as it comes down. */
  private whoosh(t: number, seconds: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.2;
    filter.frequency.setValueAtTime(350, t);
    filter.frequency.exponentialRampToValueAtTime(2200, t + seconds * 0.35);
    filter.frequency.exponentialRampToValueAtTime(450, t + seconds);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, t);
    env.gain.exponentialRampToValueAtTime(0.5, t + seconds * 0.3);
    env.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + seconds + 0.05);
  }
}

export const sound = new SoundEngine();
