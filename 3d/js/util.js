/* util.js — tiny shared helpers. No DOM, no Three.js. */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Framerate-independent smoothing. lambda is the approach rate (higher = snappier). */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function angNorm(d) {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

let _uid = (Date.now() % 100000) | 0;
export function uid() {
  _uid += 1;
  return 'u' + _uid.toString(36) + Math.floor(Math.random() * 1296).toString(36);
}

export const fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');

export function fmtTime(t) {
  if (!isFinite(t) || t < 0) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
}

/** worldTime 0 = midnight, 0.5 = noon. */
export function clockString(t) {
  const mins = Math.floor((((t % 1) + 1) % 1) * 24 * 60) % (24 * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToInt(hex) {
  return parseInt(String(hex).replace('#', ''), 16) || 0xffffff;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Car heading: 0 faces +Z, positive turns toward +X. */
export function forwardXZ(h) {
  return { x: Math.sin(h), z: Math.cos(h) };
}
export function rightXZ(h) {
  return { x: Math.cos(h), z: -Math.sin(h) };
}
