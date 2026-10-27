/* audio.js — small WebAudio synth. No sample files, so the game stays a
   static folder and still has an engine, UI ticks, and a two-chord bed.
   The context is created on the first gesture (autoplay policy). */

import { settings } from './settings.js';

let ctx = null;
let master = null;
let sfxGain = null;
let musicGain = null;
let engine = null;
let music = null;

function ac() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  sfxGain = ctx.createGain();
  musicGain = ctx.createGain();
  sfxGain.connect(master);
  musicGain.connect(master);
  master.connect(ctx.destination);
  apply();
  return ctx;
}

function apply() {
  if (!master || !settings.data) return;
  const s = settings.data;
  master.gain.value = s.master;
  sfxGain.gain.value = s.sfx;
  musicGain.gain.value = s.music;
}

function tone(freq, dur, type, gain, slide) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(sfxGain);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SFX = {
  click: () => tone(520, 0.05, 'square', 0.04),
  confirm: () => { tone(660, 0.08, 'square', 0.05); setTimeout(() => tone(880, 0.1, 'square', 0.05), 70); },
  error: () => tone(140, 0.18, 'sawtooth', 0.05, 0.5),
  coin: () => { tone(880, 0.08, 'square', 0.05); setTimeout(() => tone(1320, 0.12, 'square', 0.05), 80); },
  beep: () => tone(740, 0.12, 'square', 0.06),
  go: () => tone(1180, 0.2, 'square', 0.07),
  crash: () => tone(90, 0.28, 'sawtooth', 0.08, 0.4),
  bump: () => tone(180, 0.09, 'square', 0.05, 0.6),
  nitro: () => tone(220, 0.25, 'sawtooth', 0.04, 1.8),
  levelup: () => { tone(523, 0.1, 'square', 0.05); setTimeout(() => tone(659, 0.1, 'square', 0.05), 90); setTimeout(() => tone(784, 0.18, 'square', 0.06), 180); },
  shift: () => tone(360, 0.06, 'square', 0.05, 1.4),
  photo: () => tone(1600, 0.04, 'square', 0.04),
  boom: () => {
    const a = ac();
    if (!a) return;
    const dur = 0.72;
    const frames = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, frames, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      const env = Math.pow(1 - i / frames, 1.55);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const t = a.currentTime;
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(70, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.42, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(sfxGain);
    src.start(t);
    tone(62, 0.48, 'sawtooth', 0.14, 0.22);
    setTimeout(() => tone(180, 0.12, 'square', 0.04, 0.4), 40);
  }
};

export const audio = {
  init() {
    const a = ac();
    if (a && a.state === 'suspended') a.resume();
  },
  apply,
  play(name) {
    const fn = SFX[name];
    if (fn) fn();
  },
  startMusic(mode) {
    const a = ac();
    if (!a) return;
    this.stopMusic();
    const base = mode === 'race' ? 55 : mode === 'drag' ? 49 : 73;
    const o1 = a.createOscillator();
    const o2 = a.createOscillator();
    const f = a.createBiquadFilter();
    const g = a.createGain();
    o1.type = 'sawtooth';
    o2.type = 'triangle';
    o1.frequency.value = base;
    o2.frequency.value = base * 1.5;
    f.type = 'lowpass';
    f.frequency.value = mode === 'race' ? 420 : 280;
    g.gain.value = 0.18;
    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(musicGain);
    o1.start();
    o2.start();
    music = { o1, o2, f, g, mode, t: 0 };
  },
  updateMusic(dt, intensity) {
    if (!music || !ctx) return;
    music.t += dt;
    const wob = 0.5 + 0.5 * Math.sin(music.t * (music.mode === 'race' ? 8 : 0.6));
    const cutoff = (music.mode === 'race' ? 300 : 220) + (intensity || 0) * 900 + wob * 80;
    music.f.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.1);
  },
  stopMusic() {
    if (!music) return;
    try { music.o1.stop(); music.o2.stop(); } catch (e) { /* already stopped */ }
    music = null;
  },
  startEngine() {
    const a = ac();
    if (!a || engine) return;
    const o = a.createOscillator();
    const g = a.createGain();
    const f = a.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.value = 50;
    f.type = 'lowpass';
    f.frequency.value = 240;
    g.gain.value = 0.0;
    o.connect(f);
    f.connect(g);
    g.connect(sfxGain);
    o.start();
    engine = { o, g, f };
  },
  updateEngine(speed01, nitro) {
    if (!engine || !ctx) return;
    const s = Math.max(0, Math.min(1, speed01));
    engine.o.frequency.setTargetAtTime(48 + s * 140 + (nitro ? 30 : 0), ctx.currentTime, 0.08);
    engine.f.frequency.setTargetAtTime(180 + s * 1400, ctx.currentTime, 0.08);
    engine.g.gain.setTargetAtTime(0.03 + s * 0.05, ctx.currentTime, 0.1);
  },
  stopEngine() {
    if (!engine) return;
    try { engine.o.stop(); } catch (e) { /* already stopped */ }
    engine = null;
  }
};
