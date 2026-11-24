// Renders the game's lobby track (same song data and note synthesis as web/src/audio/sound.ts) offline to a WAV.
import { chromium } from '/Users/johnny.bui/orca/projects/game-ca-ngua-online/node_modules/@playwright/test/index.mjs';
import { writeFileSync } from 'node:fs';
const seconds = Number(process.argv[2] || 48);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');
const b64 = await page.evaluate(async (seconds) => {
  const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function parsePattern(text) {
    const events = []; let held = null;
    text.trim().split(/\s+/).forEach((token, step) => {
      if (token === '-') { if (held) held.length += 1; return; }
      held = null;
      if (token === '.') return;
      if (token === 'X') { events.push({ step, midi: null, length: 1 }); return; }
      const m = /^([A-G])(#?)(-?\d)$/.exec(token);
      held = { step, midi: SEMITONE[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12, length: 1 };
      events.push(held);
    });
    return events;
  }
  const bars = (...b) => b.join(' ');
  const LOBBY = { bpm: 116, steps: 64, voices: [
    { wave: 'triangle', gain: 0.15, events: parsePattern(bars('E5 . E5 G5 . A5 . G5 E5 . D5 . C5 . . .','D5 . D5 E5 . G5 . E5 D5 . C5 . A4 . . .','E5 . E5 G5 . A5 . C6 A5 . G5 . E5 . . .','G5 . E5 D5 . E5 . D5 C5 . A4 . C5 - - -')) },
    { wave: 'sine', gain: 0.2, events: parsePattern(bars('C3 . . . . . . . G2 . . . . . . .','C3 . . . . . . . G2 . . . . . . .','A2 . . . . . . . E3 . . . . . . .','G2 . . . . . . . C3 . . . . . . .')) },
    { wave: 'noise', gain: 0.22, freq: 1400, events: parsePattern(bars('. . . . X . . . . . . . X . . .','. . . . X . . . . . . . X . . .','. . . . X . . . . . . . X . . .','. . . . X . . . . . . . X . . .')) },
    { wave: 'noise', gain: 0.05, freq: 3200, events: parsePattern(bars('. . X . . . X . . . X . . . X .','. . X . . . X . . . X . . . X .','. . X . . . X . . . X . . . X .','. . X . . . X . . . X . . . X .')) },
  ] };
  const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);
  const rate = 48000;
  const ctx = new OfflineAudioContext(2, rate * seconds, rate);
  const master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  const noise = ctx.createBuffer(1, rate, rate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0, 0); bus.gain.linearRampToValueAtTime(1, 1); bus.connect(master);
  const noiseBurst = (t, freq, gain, dur, out) => {
    const src = ctx.createBufferSource(); src.buffer = noise;
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = 1.5;
    const env = ctx.createGain(); env.gain.setValueAtTime(gain, t); env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(env).connect(out); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  };
  const note = (voice, ev, t, stepS, out) => {
    const env = ctx.createGain(); env.connect(out);
    if (voice.wave === 'noise') { noiseBurst(t, voice.freq ?? 7000, voice.gain, 0.04, env); return; }
    if (ev.midi === null) return;
    const dur = ev.length * stepS;
    const osc = ctx.createOscillator(); osc.type = voice.wave; osc.frequency.setValueAtTime(midiToHz(ev.midi), t);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(voice.gain, t + 0.02);
    env.gain.setValueAtTime(voice.gain, t + Math.max(0.02, dur - 0.08));
    env.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.12);
    osc.connect(env); osc.start(t); osc.stop(t + dur + 0.15);
  };
  const stepS = 60 / LOBBY.bpm / 4;
  let step = 0; let next = 0.05;
  while (next < seconds) {
    for (const v of LOBBY.voices) for (const ev of v.events) if (ev.step === step) note(v, ev, next, stepS, bus);
    step = (step + 1) % LOBBY.steps; next += stepS;
  }
  const buf = await ctx.startRendering();
  const l = buf.getChannelData(0), r = buf.getChannelData(1);
  const n = buf.length; const out = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i])) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[i])) * 32767, true); }
  const bytes = new Uint8Array(out.buffer); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}, seconds);
writeFileSync('/tmp/lobby-music-offline.wav', Buffer.from(b64, 'base64'));
console.log('wav bytes', Buffer.from(b64, 'base64').length);
await browser.close();
