/* tracks.js — custom circuits in localStorage, plus a share code.
   A code is "RL3:" and a base64 JSON blob so it can be pasted in chat.
   Points are meters: {x, z, y, bank} with bank in degrees. */

const KEY = 'redline_legends_3d_tracks_v1';
const THEMES = ['city', 'desert', 'snow', 'neon'];

function ls() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch (e) {
    return null;
  }
}

export function sanitize(raw) {
  const src = raw || {};
  const pts = (Array.isArray(src.pts) ? src.pts : []).slice(0, 64).map((p) => ({
    x: clampNum(p.x, -4000, 4000),
    z: clampNum(p.z, -4000, 4000),
    y: clampNum(p.y, -8, 48),
    bank: clampNum(p.bank, -28, 28)
  })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
  const theme = THEMES.includes(src.theme) ? src.theme : 'city';
  return {
    id: typeof src.id === 'string' && src.id ? src.id.slice(0, 40) : '',
    name: String(src.name || 'Custom').slice(0, 28),
    theme,
    width: clampNum(src.width == null ? 14 : src.width, 8, 28),
    grass: clampNum(src.grass == null ? 6 : src.grass, 0, 20),
    walls: src.walls !== false,
    pts
  };
}

function clampNum(v, a, b) {
  const n = Number(v);
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}

export function list() {
  const store = ls();
  if (!store) return [];
  try {
    const arr = JSON.parse(store.getItem(KEY) || '[]');
    return Array.isArray(arr) ? arr.map(sanitize).filter((t) => t.pts.length >= 3) : [];
  } catch (e) {
    return [];
  }
}

export function get(id) {
  return list().find((t) => t.id === id) || null;
}

export function save(raw) {
  const def = sanitize(raw);
  if (def.pts.length < 3) throw new Error('A track needs at least 3 points');
  if (!def.id) def.id = 't' + Date.now().toString(36);
  const all = list().filter((t) => t.id !== def.id);
  all.unshift(def);
  const store = ls();
  if (store) store.setItem(KEY, JSON.stringify(all.slice(0, 24)));
  return def;
}

export function remove(id) {
  const store = ls();
  if (!store) return;
  store.setItem(KEY, JSON.stringify(list().filter((t) => t.id !== id)));
}

export function encode(raw) {
  const def = sanitize(raw);
  const json = JSON.stringify({
    name: def.name, theme: def.theme, width: def.width, grass: def.grass, walls: def.walls, pts: def.pts
  });
  return 'RL3:' + btoa(unescape(encodeURIComponent(json)));
}

export function decode(code) {
  let s = String(code || '').trim();
  if (s.startsWith('RL3:')) s = s.slice(4);
  const json = decodeURIComponent(escape(atob(s)));
  const def = sanitize(JSON.parse(json));
  if (def.pts.length < 3) throw new Error('Share code needs at least 3 points');
  return def;
}
