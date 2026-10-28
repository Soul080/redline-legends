/* tracks.js - Custom circuits: spline sampling shared with the race, validation,
   localStorage, share codes, and JSON import/export.
   Multiplayer lobbies (when that code is present) should call RL.Tracks.lobbyChoices()
   or assign RL.Multiplayer.refreshTracks / RL.Lobby.refreshTracks — both are invoked
   after every save, delete, and import. Mirrored ids also appear on RL.TRACKS as ct_*. */
window.RL = window.RL || {};

RL.Tracks = (function () {
  const KEY = 'redline_legends_custom_tracks_v1';
  const SAMPLE = 12; // keep in sync with race.js SAMPLE
  const THEME_IDS = ['city', 'desert', 'snow', 'neon'];
  const DECO_IDS = ['building', 'cactus', 'pine', 'neon', 'lamp', 'rock'];
  const THEME_DECO = {
    city: ['building', 'lamp', 'rock'],
    desert: ['cactus', 'rock'],
    snow: ['pine', 'rock', 'lamp'],
    neon: ['neon', 'lamp', 'building']
  };
  const BUILTIN_IDS = Object.keys(RL.TRACKS || {});
  const BUILTIN_SET = {};
  BUILTIN_IDS.forEach((id) => { BUILTIN_SET[id] = true; });

  let cache = null;
  const listeners = [];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function normalize(input) {
    input = input || {};
    const theme = RL.THEMES[input.theme] ? input.theme : 'city';
    const pts = (input.pts || []).map((p) => {
      if (Array.isArray(p)) return [Math.round(Number(p[0])), Math.round(Number(p[1]))];
      return [Math.round(Number(p && p.x)), Math.round(Number(p && p.y))];
    });
    const decorations = [];
    (input.decorations || []).forEach((d) => {
      if (!d) return;
      const t = DECO_IDS.indexOf(d.t) >= 0 ? d.t : (DECO_IDS.indexOf(d.type) >= 0 ? d.type : null);
      const x = Math.round(Number(d.x)), y = Math.round(Number(d.y));
      if (!t || !isFinite(x) || !isFinite(y)) return;
      decorations.push({ t: t, x: x, y: y });
    });
    let name = String(input.name == null ? 'Custom Circuit' : input.name).replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!name) name = 'Custom Circuit';
    const width = Math.round(Number(input.width));
    const grass = Math.round(Number(input.grass));
    return {
      id: typeof input.id === 'string' ? input.id : null,
      name: name,
      theme: theme,
      width: isFinite(width) ? width : 140,
      grass: isFinite(grass) ? grass : 48,
      walls: input.walls !== false && input.walls !== 0,
      pts: pts,
      decorations: decorations.slice(0, 80),
      created: input.created || null,
      updated: input.updated || null
    };
  }

  function blank(name) {
    return normalize({
      name: name || 'New Circuit',
      theme: 'city',
      width: 140,
      grass: 48,
      walls: true,
      pts: [[480, 420], [1280, 420], [1620, 700], [1280, 980], [480, 980], [140, 700]],
      decorations: []
    });
  }

  /* Same Catmull-Rom closed loop the race used to build inline. */
  function sampleLoop(rawPts, reverse) {
    if (!rawPts || rawPts.length < 3) {
      return { pts: [], N: 0, len: 0, cps: [0, 0, 0, 0], minX: 0, minY: 0, maxX: 1, maxY: 1 };
    }
    let cp = rawPts.map((p) => Array.isArray(p) ? { x: +p[0], y: +p[1] } : { x: +p.x, y: +p.y });
    if (reverse) cp = cp.slice().reverse();
    const n = cp.length, pts = [];
    for (let i = 0; i < n; i++) {
      const p0 = cp[(i - 1 + n) % n], p1 = cp[i], p2 = cp[(i + 1) % n], p3 = cp[(i + 2) % n];
      const steps = Math.max(4, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / SAMPLE));
      for (let s = 0; s < steps; s++) {
        const t = s / steps, t2 = t * t, t3 = t2 * t;
        pts.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    const N = pts.length;
    let len = 0, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[(i + 1) % N];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      a.tx = dx / l; a.ty = dy / l; a.nx = -a.ty; a.ny = a.tx; a.seg = l; len += l;
      if (a.x < minX) minX = a.x; if (a.y < minY) minY = a.y; if (a.x > maxX) maxX = a.x; if (a.y > maxY) maxY = a.y;
    }
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[(i + 6) % N];
      let d = Math.atan2(b.ty, b.tx) - Math.atan2(a.ty, a.tx);
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      a.curv = d;
    }
    return { pts: pts, N: N, len: len, minX: minX, minY: minY, maxX: maxX, maxY: maxY, cps: [0, Math.floor(N * 0.25), Math.floor(N * 0.5), Math.floor(N * 0.75)] };
  }

  /* Open polyline. The last sample is the finish line. The path does not loop. */
  function sampleOpen(rawPts) {
    if (!rawPts || rawPts.length < 2) {
      return { pts: [], N: 0, len: 0, cps: [0, 0], minX: 0, minY: 0, maxX: 1, maxY: 1, open: true, finishAt: 0 };
    }
    const body = rawPts.map((p) => Array.isArray(p) ? { x: +p[0], y: +p[1] } : { x: +p.x, y: +p.y });
    const first = body[0], second = body[1], last = body[body.length - 1], prev = body[body.length - 2];
    const cp = [
      { x: first.x * 2 - second.x, y: first.y * 2 - second.y },
      ...body,
      { x: last.x * 2 - prev.x, y: last.y * 2 - prev.y }
    ];
    const pts = [];
    for (let i = 1; i < cp.length - 2; i++) {
      const p0 = cp[i - 1], p1 = cp[i], p2 = cp[i + 1], p3 = cp[i + 2];
      const steps = Math.max(4, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / SAMPLE));
      for (let s = 0; s < steps; s++) {
        const t = s / steps, t2 = t * t, t3 = t2 * t;
        pts.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    const N = pts.length;
    let len = 0, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[Math.min(N - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      if (i === N - 1 && N > 1) {
        const p = pts[N - 2];
        a.tx = p.tx; a.ty = p.ty; a.nx = p.nx; a.ny = p.ny; a.seg = 0.001; a.curv = 0;
      } else {
        a.tx = dx / l; a.ty = dy / l; a.nx = -a.ty; a.ny = a.tx; a.seg = l; len += l;
      }
      if (a.x < minX) minX = a.x; if (a.y < minY) minY = a.y; if (a.x > maxX) maxX = a.x; if (a.y > maxY) maxY = a.y;
    }
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[Math.min(N - 1, i + 6)];
      let d = Math.atan2(b.ty, b.tx) - Math.atan2(a.ty, a.tx);
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      a.curv = d;
    }
    const finishAt = Math.max(1, N - 3);
    return { pts: pts, N: N, len: len, minX: minX, minY: minY, maxX: maxX, maxY: maxY, cps: [0, finishAt], open: true, finishAt: finishAt };
  }

  /* Same slot math as RL.Race placeOnGrid (pole is slot 0). */
  function gridSlots(geom, width, count) {
    const slots = [];
    if (!geom || !geom.N) return slots;
    const N = geom.N;
    for (let slot = 0; slot < count; slot++) {
      const row = Math.floor(slot / 2), col = slot % 2;
      let i = (N - 4 - row * 6 + N) % N;
      if (i < 0) i += N;
      const p = geom.pts[i];
      const side = (col ? 1 : -1) * width * 0.22;
      slots.push({ x: p.x + p.nx * side, y: p.y + p.ny * side, h: Math.atan2(p.ty, p.tx), i: i, slot: slot });
    }
    return slots;
  }

  function orient(ax, ay, bx, by, cx, cy) {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  }
  function segCross(a, b, c, d) {
    if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x)) return false;
    if (Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.max(c.y, d.y) < Math.min(a.y, b.y)) return false;
    const o1 = orient(a.x, a.y, b.x, b.y, c.x, c.y);
    const o2 = orient(a.x, a.y, b.x, b.y, d.x, d.y);
    const o3 = orient(c.x, c.y, d.x, d.y, a.x, a.y);
    const o4 = orient(c.x, c.y, d.x, d.y, b.x, b.y);
    return o1 * o2 < 0 && o3 * o4 < 0;
  }
  function loopDist(i, j, n) {
    const d = Math.abs(i - j);
    return d < n - d ? d : n - d;
  }

  function splineCrossings(pts) {
    const found = [];
    const n = pts.length;
    if (n < 8) return found;
    const cell = 140;
    const grid = new Map();
    const put = (i, a, b) => {
      const x0 = Math.floor(Math.min(a.x, b.x) / cell), x1 = Math.floor(Math.max(a.x, b.x) / cell);
      const y0 = Math.floor(Math.min(a.y, b.y) / cell), y1 = Math.floor(Math.max(a.y, b.y) / cell);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = x + ',' + y;
        let arr = grid.get(k);
        if (!arr) { arr = []; grid.set(k, arr); }
        arr.push(i);
      }
    };
    for (let i = 0; i < n; i++) put(i, pts[i], pts[(i + 1) % n]);
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const x0 = Math.floor(Math.min(a.x, b.x) / cell), x1 = Math.floor(Math.max(a.x, b.x) / cell);
      const y0 = Math.floor(Math.min(a.y, b.y) / cell), y1 = Math.floor(Math.max(a.y, b.y) / cell);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const arr = grid.get(x + ',' + y);
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const j = arr[k];
          if (j <= i) continue;
          if (loopDist(i, j, n) < 8) continue;
          const id = i + ':' + j;
          if (seen.has(id)) continue;
          seen.add(id);
          const c = pts[j], d = pts[(j + 1) % n];
          if (segCross(a, b, c, d)) {
            found.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
            if (found.length > 8) return found;
          }
        }
      }
    }
    return found;
  }

  function polygonCrossings(pts) {
    const found = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const a = { x: pts[i][0], y: pts[i][1] };
        const b = { x: pts[(i + 1) % n][0], y: pts[(i + 1) % n][1] };
        const c = { x: pts[j][0], y: pts[j][1] };
        const d = { x: pts[(j + 1) % n][0], y: pts[(j + 1) % n][1] };
        if (segCross(a, b, c, d)) found.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
    }
    return found;
  }

  function validate(input) {
    const def = (input && input.pts && input.theme && input.name) ? input : normalize(input);
    const errors = [];
    const warnings = [];
    let crossings = [];
    if (!RL.THEMES[def.theme]) errors.push('Pick a theme');
    if (!(def.width >= 90 && def.width <= 210)) errors.push('Road width must be between 90 and 210');
    if (!(def.grass >= 0 && def.grass <= 140)) errors.push('Grass must be between 0 and 140');
    const pts = def.pts || [];
    if (pts.length < 4) errors.push('A closed circuit needs at least 4 waypoints');
    if (pts.length > 40) errors.push('Too many waypoints (40 max)');
    let bad = false;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) bad = true;
    }
    if (bad) errors.push('A waypoint has invalid coordinates');
    if (def.open && !bad && pts.length >= 2) {
      const geom = sampleOpen(pts);
      return { ok: true, errors: [], warnings: [], length: geom.len, crossings: [], checkpoints: 2 };
    }
    if (!bad && pts.length >= 2) {
      let close = 0, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, long = false;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (dist < 48) close++;
        else if (dist > 2200) long = true;
        else if (dist > 1500) warnings.push('A very long straight — add a kink if it feels empty');
        if (a[0] < minX) minX = a[0]; if (a[1] < minY) minY = a[1];
        if (a[0] > maxX) maxX = a[0]; if (a[1] > maxY) maxY = a[1];
      }
      if (close) errors.push(close + ' waypoint gap' + (close > 1 ? 's are' : ' is') + ' under 48px');
      if (long) errors.push('A straight is too long — add a waypoint');
      if (maxX - minX > 4200 || maxY - minY > 4200) errors.push('The circuit is too large to drive');
      if (minX < -400 || minY < -400 || maxX > 5600 || maxY > 5600) errors.push('Waypoints are outside the map');
    }
    let length = 0;
    if (!bad && pts.length >= 4) {
      const geom = sampleLoop(pts, false);
      length = geom.len;
      if (geom.N >= 4 && geom.len < 700) errors.push('Track is too short to race');
      crossings = polygonCrossings(pts).concat(geom.N ? splineCrossings(geom.pts) : []);
      if (crossings.length) errors.push('The road crosses itself — keep one closed loop');
      let sharp = 0;
      for (let i = 0; i < geom.N; i++) if (Math.abs(geom.pts[i].curv) > 1.35) sharp++;
      if (sharp > 6) warnings.push('Some corners are very tight for this width');
    }
    const uniq = [], wuniq = [];
    errors.forEach((e) => { if (uniq.indexOf(e) < 0) uniq.push(e); });
    warnings.forEach((e) => { if (wuniq.indexOf(e) < 0 && wuniq.length < 3) wuniq.push(e); });
    return {
      ok: uniq.length === 0,
      errors: uniq.slice(0, 6),
      warnings: wuniq,
      length: length,
      crossings: crossings.slice(0, 10),
      checkpoints: pts.length >= 4 ? 4 : 0
    };
  }

  function formatLength(px) {
    const m = (px || 0) * 0.55 / 3.6;
    if (m >= 1000) return (m / 1000).toFixed(2) + ' km';
    return Math.round(m) + ' m';
  }

  function mulberry32(seed) {
    let a = seed | 0;
    return function () {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function scatter(def, count, seed) {
    const geom = sampleLoop(def.pts, false);
    if (!geom.N) return [];
    const rng = mulberry32(seed == null ? 1 : seed);
    const types = THEME_DECO[def.theme] || THEME_DECO.city;
    const limit = (Number(def.width) || 140) / 2 + (Number(def.grass) || 0) + 36;
    const out = [];
    const spanX = Math.max(200, geom.maxX - geom.minX);
    const spanY = Math.max(200, geom.maxY - geom.minY);
    const want = clamp(count || 26, 0, 60);
    let tries = 0;
    while (out.length < want && tries < want * 30) {
      tries++;
      const x = geom.minX - 60 + rng() * (spanX + 120);
      const y = geom.minY - 60 + rng() * (spanY + 120);
      let ok = true;
      for (let j = 0; j < geom.N; j += 2) {
        const p = geom.pts[j];
        if ((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) < limit * limit) { ok = false; break; }
      }
      if (!ok) continue;
      for (let k = 0; k < out.length; k++) {
        if ((out[k].x - x) * (out[k].x - x) + (out[k].y - y) * (out[k].y - y) < 3600) { ok = false; break; }
      }
      if (ok) out.push({ t: types[Math.floor(rng() * types.length)], x: Math.round(x), y: Math.round(y) });
    }
    return out;
  }

  function bytesToB64(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  function b64ToBytes(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    let bin;
    try { bin = atob(s); } catch (e) { throw new Error('Share code is damaged'); }
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 255;
    return out;
  }

  function toShareCode(def) {
    const n = normalize(def);
    const enc = new TextEncoder();
    let name = n.name;
    let nameBytes = enc.encode(name);
    while (nameBytes.length > 72 && name.length) { name = name.slice(0, -1); nameBytes = enc.encode(name); }
    const pts = n.pts.slice(0, 40);
    const decos = n.decorations.slice(0, 80);
    const size = 6 + nameBytes.length + 1 + pts.length * 4 + 1 + decos.length * 5 + 1;
    const buf = new Uint8Array(size);
    const view = new DataView(buf.buffer);
    let o = 0;
    buf[o++] = 1;
    buf[o++] = Math.max(0, THEME_IDS.indexOf(n.theme));
    buf[o++] = clamp(n.width, 90, 210);
    buf[o++] = clamp(n.grass, 0, 140);
    buf[o++] = n.walls ? 1 : 0;
    buf[o++] = nameBytes.length;
    buf.set(nameBytes, o); o += nameBytes.length;
    buf[o++] = pts.length;
    for (let i = 0; i < pts.length; i++) {
      view.setInt16(o, clamp(pts[i][0], -32000, 32000), true); o += 2;
      view.setInt16(o, clamp(pts[i][1], -32000, 32000), true); o += 2;
    }
    buf[o++] = decos.length;
    for (let i = 0; i < decos.length; i++) {
      const di = DECO_IDS.indexOf(decos[i].t);
      buf[o++] = di < 0 ? 4 : di;
      view.setInt16(o, clamp(decos[i].x, -32000, 32000), true); o += 2;
      view.setInt16(o, clamp(decos[i].y, -32000, 32000), true); o += 2;
    }
    let x = 0;
    for (let i = 0; i < o; i++) x ^= buf[i];
    buf[o++] = x;
    return 'RL1.' + bytesToB64(buf.subarray(0, o));
  }

  function fromShareCode(code) {
    if (typeof code !== 'string') throw new Error('Share code must be text');
    const trimmed = code.trim().replace(/\s+/g, '');
    const m = trimmed.match(/^RL1\.(.+)$/i);
    if (!m) throw new Error('Share code should start with RL1.');
    const bytes = b64ToBytes(m[1]);
    if (bytes.length < 8) throw new Error('Share code is too short');
    let sum = 0;
    for (let i = 0; i < bytes.length - 1; i++) sum ^= bytes[i];
    if (sum !== bytes[bytes.length - 1]) throw new Error('Share code is damaged');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let o = 0;
    const ver = bytes[o++];
    if (ver !== 1) throw new Error('Unsupported share code');
    const theme = THEME_IDS[bytes[o++]] || 'city';
    const width = bytes[o++];
    const grass = bytes[o++];
    const walls = bytes[o++] !== 0;
    const nameLen = bytes[o++];
    if (o + nameLen + 2 > bytes.length) throw new Error('Share code is damaged');
    const name = new TextDecoder().decode(bytes.subarray(o, o + nameLen));
    o += nameLen;
    const pc = bytes[o++];
    if (o + pc * 4 + 1 > bytes.length) throw new Error('Share code is damaged');
    const pts = [];
    for (let i = 0; i < pc; i++) {
      pts.push([view.getInt16(o, true), view.getInt16(o + 2, true)]);
      o += 4;
    }
    const dc = bytes[o++];
    if (o + dc * 5 + 1 !== bytes.length) throw new Error('Share code is damaged');
    const decorations = [];
    for (let i = 0; i < dc; i++) {
      const t = DECO_IDS[bytes[o++]] || 'lamp';
      const x = view.getInt16(o, true); o += 2;
      const y = view.getInt16(o, true); o += 2;
      decorations.push({ t: t, x: x, y: y });
    }
    return normalize({ name: name, theme: theme, width: width, grass: grass, walls: walls, pts: pts, decorations: decorations });
  }

  function toJSON(def) {
    const n = normalize(def);
    return {
      format: 'redline-legends-track',
      version: 1,
      track: { name: n.name, theme: n.theme, width: n.width, grass: n.grass, walls: n.walls, pts: n.pts, decorations: n.decorations }
    };
  }
  function fromJSON(input) {
    let obj = input;
    if (typeof input === 'string') {
      const t = input.trim();
      if (/^RL1\./i.test(t)) return fromShareCode(t);
      try { obj = JSON.parse(t); } catch (e) { throw new Error('That file is not valid JSON'); }
    }
    if (!obj || typeof obj !== 'object') throw new Error('Empty track file');
    const track = obj.track && obj.track.pts ? obj.track : obj;
    if (!track.pts) throw new Error('Track file is missing waypoints');
    return normalize(track);
  }
  function importText(text) {
    const t = String(text || '').trim();
    if (!t) throw new Error('Nothing to import');
    if (/^RL1\./i.test(t)) return fromShareCode(t);
    return fromJSON(t);
  }

  function download(def) {
    const data = toJSON(def);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const slug = (data.track.name || 'track').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'track';
    a.href = URL.createObjectURL(blob);
    a.download = slug + '.track.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function allCustom() {
    if (!cache) {
      try {
        const raw = JSON.parse(localStorage.getItem(KEY) || '{"tracks":[]}');
        const list = Array.isArray(raw.tracks) ? raw.tracks : [];
        cache = list.map(sanitize).filter(Boolean);
      } catch (e) { cache = []; }
    }
    return cache;
  }
  function sanitize(t) {
    if (!t || !Array.isArray(t.pts)) return null;
    const n = normalize(t);
    if (!n.id || !/^ct_[a-z0-9]+$/i.test(n.id) || BUILTIN_SET[n.id]) return null;
    n.created = t.created || Date.now();
    n.updated = t.updated || n.created;
    return n;
  }

  function asRaceDef(t) {
    const n = normalize(t);
    return {
      id: n.id,
      name: n.name,
      theme: n.theme,
      width: n.width,
      grass: n.grass,
      walls: n.walls,
      pts: n.pts.map((p) => [p[0], p[1]]),
      decorations: n.decorations.map((d) => ({ t: d.t, x: d.x, y: d.y })),
      weather: ['clear', 'rain', 'snow', 'dust'],
      times: ['day', 'dusk', 'night'],
      custom: true
    };
  }

  function remirror(list) {
    Object.keys(RL.TRACKS).forEach((k) => {
      if (!BUILTIN_SET[k] && String(k).indexOf('ct_') === 0) delete RL.TRACKS[k];
    });
    list.forEach((t) => { if (!BUILTIN_SET[t.id]) RL.TRACKS[t.id] = asRaceDef(t); });
  }

  function lobbyChoices() {
    const out = [];
    BUILTIN_IDS.forEach((id) => {
      const t = RL.TRACKS[id];
      if (!t || !t.pts || String(id).indexOf('ct_') === 0) return;
      out.push({ id: id, name: t.name, theme: t.theme, custom: false, raceable: true, width: t.width, grass: t.grass, walls: t.walls !== false });
    });
    allCustom().forEach((t) => {
      const report = validate(t);
      out.push({ id: t.id, name: t.name, theme: t.theme, custom: true, raceable: report.ok, width: t.width, grass: t.grass, walls: t.walls !== false });
    });
    return out;
  }

  function notify() {
    const choices = lobbyChoices();
    if (RL.Multiplayer && typeof RL.Multiplayer.refreshTracks === 'function') {
      try { RL.Multiplayer.refreshTracks(choices); } catch (e) { /* hook is best-effort */ }
    }
    if (RL.Lobby && typeof RL.Lobby.refreshTracks === 'function') {
      try { RL.Lobby.refreshTracks(choices); } catch (e) { /* hook is best-effort */ }
    }
    listeners.slice().forEach((fn) => { try { fn(choices); } catch (e) { /* listener */ } });
  }

  function write(list) {
    cache = list;
    try { localStorage.setItem(KEY, JSON.stringify({ version: 1, tracks: list })); }
    catch (e) { throw new Error('Could not save tracks — storage is full'); }
    remirror(list);
    notify();
  }

  function newId() {
    return 'ct_' + Math.random().toString(36).slice(2, 10);
  }

  function save(def) {
    const n = normalize(def);
    const list = allCustom().slice();
    let id = n.id;
    const updating = id && /^ct_[a-z0-9]+$/i.test(id) && !BUILTIN_SET[id] && list.some((t) => t.id === id);
    if (!updating) {
      id = newId();
      while (list.some((t) => t.id === id) || BUILTIN_SET[id]) id = newId();
    }
    n.id = id;
    n.updated = Date.now();
    const idx = list.findIndex((t) => t.id === id);
    if (idx >= 0) { n.created = list[idx].created || n.updated; list[idx] = n; }
    else {
      if (list.length >= 40) throw new Error('You can save up to 40 custom tracks');
      n.created = n.updated;
      list.push(n);
    }
    write(list);
    return n;
  }

  function remove(id) { write(allCustom().filter((t) => t.id !== id)); }
  function get(id) { return allCustom().find((t) => t.id === id) || null; }

  function resolve(id) {
    if (BUILTIN_SET[id]) return RL.TRACKS[id];
    const c = get(id);
    return c ? asRaceDef(c) : null;
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function carClasses() {
    const seen = [];
    (RL.CARS || []).forEach((c) => { if (c.cls && seen.indexOf(c.cls) < 0) seen.push(c.cls); });
    return seen;
  }
  function classPool(classes) {
    const allow = Array.isArray(classes) && classes.length ? classes : null;
    let cars = (RL.CARS || []).filter((c) => !allow || allow.indexOf(c.cls) >= 0);
    if (!cars.length) cars = (RL.CARS || []).slice();
    return cars.map((c) => c.id);
  }

  remirror(allCustom());

  return {
    KEY: KEY, SAMPLE: SAMPLE, DECO_IDS: DECO_IDS, THEME_DECO: THEME_DECO,
    blank: blank, normalize: normalize, validate: validate, sampleLoop: sampleLoop, sampleOpen: sampleOpen, gridSlots: gridSlots,
    scatter: scatter, formatLength: formatLength,
    allCustom: allCustom, get: get, save: save, remove: remove, resolve: resolve, asRaceDef: asRaceDef,
    lobbyChoices: lobbyChoices, onChange: onChange,
    toShareCode: toShareCode, fromShareCode: fromShareCode, toJSON: toJSON, fromJSON: fromJSON,
    importText: importText, download: download, carClasses: carClasses, classPool: classPool
  };
})();

/* Alias other lobby code can call without knowing the module layout. */
RL.customTracksForLobby = function () { return RL.Tracks.lobbyChoices().filter((t) => t.custom); };
RL.getTrack = function (id) { return RL.Tracks.resolve(id); };
