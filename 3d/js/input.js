/* input.js — keyboard + on-screen touch, plus a virtual layer the headless
   screenshot harness can drive. Actions are read with down() (held) and hit()
   (pressed since the previous endFrame). */

import { settings } from './settings.js';
import { DEFAULT_KEYS, ACTION_NAMES } from './input_defaults.js';

const keys = Object.create(null);
const pressed = Object.create(null);
const touch = Object.create(null);
const virtual = Object.create(null);
let rebindCb = null;

function bindings() {
  return (settings.data && settings.data.keys) || DEFAULT_KEYS;
}

export const input = {
  virtual,
  setup() {
    window.addEventListener('keydown', (e) => {
      if (rebindCb) {
        e.preventDefault();
        const cb = rebindCb;
        rebindCb = null;
        cb(e.code);
        return;
      }
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!keys[e.code]) pressed[e.code] = true;
      keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
    document.querySelectorAll('[data-touch]').forEach((el) => {
      const a = el.dataset.touch;
      const on = (e) => {
        e.preventDefault();
        if (!touch[a]) touch['_hit_' + a] = true;
        touch[a] = true;
        el.classList.add('on');
      };
      const off = (e) => {
        e.preventDefault();
        touch[a] = false;
        el.classList.remove('on');
      };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointerleave', off);
      el.addEventListener('pointercancel', off);
    });
  },
  down(action) {
    if (virtual[action] || touch[action]) return true;
    const b = bindings()[action] || [];
    for (const c of b) if (keys[c]) return true;
    return false;
  },
  hit(action) {
    if (touch['_hit_' + action]) { touch['_hit_' + action] = false; return true; }
    if (virtual['_hit_' + action]) { virtual['_hit_' + action] = false; return true; }
    const b = bindings()[action] || [];
    for (const c of b) if (pressed[c]) {
      // One edge per press, even when the sim substeps several times a frame.
      delete pressed[c];
      return true;
    }
    return false;
  },
  endFrame() {
    for (const k in pressed) delete pressed[k];
  },
  clear() {
    for (const k in keys) keys[k] = false;
    for (const k in touch) touch[k] = false;
    this.endFrame();
  },
  rebind(cb) { rebindCb = cb; },
  keyName(code) {
    const ar = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space' };
    if (ar[code]) return ar[code];
    return String(code).replace('Key', '').replace('Digit', '').replace('Left', ' L').replace('Right', ' R');
  },
  holdVirtual(action, on) {
    if (on && !virtual[action]) virtual['_hit_' + action] = true;
    virtual[action] = !!on;
  }
};

export { ACTION_NAMES, DEFAULT_KEYS };
