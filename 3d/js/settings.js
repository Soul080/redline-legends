/* settings.js — persisted options (audio, controls, quality, weather lock).
   Quality presets are consumed by the renderer and the particle budgets. */

import { DEFAULT_KEYS } from './input_defaults.js';

export const SETTINGS_KEY = 'redline_legends_3d_settings_v1';

export const QUALITY = {
  low: {
    id: 'low', shadows: false, shadowSize: 0, bloom: false, motionBlur: false,
    pixelRatio: 0.8, particles: 120, weather: 160, traffic: 4, lamps: 0, buildingShadows: false
  },
  med: {
    id: 'med', shadows: true, shadowSize: 1024, bloom: true, motionBlur: true,
    pixelRatio: 1, particles: 280, weather: 320, traffic: 8, lamps: 4, buildingShadows: false
  },
  high: {
    id: 'high', shadows: true, shadowSize: 2048, bloom: true, motionBlur: true,
    pixelRatio: 1.5, particles: 420, weather: 480, traffic: 12, lamps: 6, buildingShadows: true
  }
};

const BASE = {
  master: 0.7,
  sfx: 0.8,
  music: 0.4,
  touch: 'auto',
  shake: true,
  sensitivity: 1,
  quality: 'med',
  motionBlur: true,
  weatherLock: 'auto'
};

export const settings = {
  data: null,
  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { saved = {}; }
    const keys = Object.assign({}, DEFAULT_KEYS, saved.keys || {});
    this.data = Object.assign({}, BASE, saved, { keys });
    if (!QUALITY[this.data.quality]) this.data.quality = 'med';
    return this.data;
  },
  save() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.data)); } catch (e) { /* private mode */ }
  },
  quality() {
    return QUALITY[this.data.quality] || QUALITY.med;
  }
};
