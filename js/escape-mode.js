/* escape-mode.js — Endless wanted chase. Original maps, cars, and pursuit.
   Registers as RL.Modes 'escape'. Career cars, drag, and story are not used.
   Escape coins buy the cars below. Career cash is only the capped daily bonus. */
(function () {
  const TILE = 64;
  const N = 36;
  const WORLD = TILE * N;
  const RULES = {
    COIN_CAP: 20,
    COIN_TIME: 25,
    DAILY_CAP: 180,
    COIN_CASH: 6,
    SCORE_TIME: 12,
    SCORE_NEAR: 40,
    SCORE_DOWN: 160,
    SCORE_CASH: 25
  };
  const MAPS = {
    city: {
      id: 'city', name: 'Glassline', blurb: 'Blocks, alleys, and ramp cuts between the towers.',
      bg: '#121722', road: '#30384a', alley: '#222838', line: '#e4c56a',
      block: '#1a2433', blockAlt: '#243044', wall: '#0e141e',
      offGrip: 0.45, roadGrip: 1, cutGrip: 1, iceGrip: 1,
      blockOff: true, night: 0.28, prop: 'city'
    },
    desert: {
      id: 'desert', name: 'Salt Span', blurb: 'Open sand, rocks, and a highway you can leave.',
      bg: '#e4c48a', road: '#c9a56a', alley: '#b68b52', line: '#f4e2bc',
      block: '#c4a06a', blockAlt: '#d8b27a', wall: '#8a623c',
      offGrip: 0.62, roadGrip: 0.96, cutGrip: 0.9, iceGrip: 0.96,
      blockOff: false, night: 0, prop: 'desert'
    },
    ice: {
      id: 'ice', name: 'Whiteout', blurb: 'Low grip. Turn early or slide into the banks.',
      bg: '#b7cddd', road: '#f7fbfe', alley: '#8eacc0', line: '#3e627c',
      block: '#d5e4ee', blockAlt: '#c5d7e4', wall: '#6e8fa6',
      offGrip: 0.4, roadGrip: 0.55, cutGrip: 0.48, iceGrip: 0.28,
      blockOff: false, night: 0.08, prop: 'ice'
    },
    forest: {
      id: 'forest', name: 'Pine Mile', blurb: 'Trees, dirt shortcuts, and ramps through the pines.',
      bg: '#1c3b28', road: '#6d5b46', alley: '#3e6a40', line: '#e4d2ae',
      block: '#163222', blockAlt: '#1d4630', wall: '#102418',
      offGrip: 0.58, roadGrip: 0.98, cutGrip: 0.84, iceGrip: 0.98,
      blockOff: false, night: 0.22, prop: 'forest'
    }
  };
  const MAP_ORDER = ['city', 'desert', 'ice', 'forest'];
  const CARS = {
    alley: { id: 'alley', name: 'Alley Coupe', cost: 0, blurb: 'Balanced. Faster than a cruiser, and it turns harder.', top: 270, accel: 240, brake: 360, grip: 1, turn: 2.35, hp: 100, mass: 1, nitro: 18, wall: 1, prop: 1, spike: 1, color: '#3ec6ff', w: 34, h: 16, r: 14 },
    taxi: { id: 'taxi', name: 'Hackney Cab', cost: 12, blurb: 'Heavy doors and more health. Slower to launch.', top: 228, accel: 190, brake: 320, grip: 0.96, turn: 2.05, hp: 150, mass: 1.35, nitro: 14, wall: 0.8, prop: 1.1, spike: 0.85, color: '#f0c84a', w: 36, h: 18, r: 15 },
    scoop: { id: 'scoop', name: 'Scoop Wagon', cost: 18, blurb: 'Wide and clumsy. The cone stays on.', top: 198, accel: 165, brake: 280, grip: 0.9, turn: 1.65, hp: 185, mass: 1.6, nitro: 12, wall: 0.7, prop: 1.25, spike: 0.7, color: '#ff8ec8', w: 42, h: 20, r: 16 },
    prowl: { id: 'prowl', name: 'Night Prowl', cost: 28, blurb: 'Quick unmarked cruiser with a light bar.', top: 292, accel: 255, brake: 370, grip: 1.04, turn: 2.45, hp: 112, mass: 1.05, nitro: 20, wall: 1, prop: 1, spike: 1, color: '#1d4e9a', w: 34, h: 16, r: 14, lights: true },
    stomper: { id: 'stomper', name: 'Mud Stomper', cost: 48, blurb: 'Monster tires. Crushes props and shrugs off stingers.', top: 214, accel: 175, brake: 260, grip: 1.12, turn: 1.42, hp: 250, mass: 2.2, nitro: 12, wall: 0.5, prop: 1.85, spike: 0.32, color: '#6b4423', w: 46, h: 24, r: 17 },
    gt: { id: 'gt', name: 'Apex GT', cost: 80, blurb: 'Fragile, and much faster than the pursuit.', top: 390, accel: 340, brake: 420, grip: 1.08, turn: 2.65, hp: 72, mass: 0.82, nitro: 26, wall: 1.25, prop: 0.9, spike: 1.15, color: '#ff2d4a', w: 36, h: 14, r: 13 }
  };
  const CAR_ORDER = ['alley', 'taxi', 'scoop', 'prowl', 'stomper', 'gt'];
  const COPS = {
    cruiser: { kind: 'cruiser', name: 'Cruiser', top: 196, accel: 150, brake: 260, grip: 0.92, turn: 1.02, hp: 42, mass: 1.15, r: 16, color: '#163a86', lights: true, w: 34, h: 16, wall: 1, prop: 0.6, spike: 1 },
    suv: { kind: 'suv', name: 'SUV', top: 184, accel: 130, brake: 240, grip: 0.88, turn: 0.76, hp: 78, mass: 1.75, r: 18, color: '#14302c', lights: true, w: 38, h: 20, wall: 1, prop: 0.8, spike: 1 },
    interceptor: { kind: 'interceptor', name: 'Interceptor', top: 308, accel: 230, brake: 340, grip: 1, turn: 1.42, hp: 36, mass: 0.95, r: 15, color: '#141414', lights: true, w: 34, h: 14, wall: 1, prop: 0.55, spike: 1 },
    armored: { kind: 'armored', name: 'Armored Truck', top: 152, accel: 95, brake: 200, grip: 0.8, turn: 0.58, hp: 150, mass: 2.7, r: 21, color: '#3d4338', lights: true, w: 48, h: 22, wall: 0.7, prop: 1.4, spike: 0.6 },
    heavy: { kind: 'heavy', name: 'Iron Hull', top: 124, accel: 78, brake: 180, grip: 0.74, turn: 0.4, hp: 230, mass: 3.5, r: 24, color: '#4a4634', lights: false, w: 58, h: 30, wall: 0.45, prop: 1.7, spike: 0.4 }
  };
  const PROP_KINDS = {
    city: [
      { kind: 'lamp', r: 8, hp: 28, road: true },
      { kind: 'box', r: 12, hp: 40, road: true },
      { kind: 'cone', r: 7, hp: 16, road: true }
    ],
    desert: [
      { kind: 'rock', r: 16, hp: 170, off: true },
      { kind: 'cactus', r: 10, hp: 22, off: true },
      { kind: 'rock', r: 12, hp: 90, road: true }
    ],
    ice: [
      { kind: 'bank', r: 18, hp: 70, road: true },
      { kind: 'pine', r: 14, hp: 48, off: true }
    ],
    forest: [
      { kind: 'tree', r: 15, hp: 64, off: true },
      { kind: 'fence', r: 11, hp: 24, road: true }
    ]
  };

  let world = null;
  let restartHeld = false;
  const lobby = { map: 'city' };

  function clamp(v, a, b) { return RL.clamp(v, a, b); }
  function wrap(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mixSeed(seed, map) {
    let h = (seed >>> 0) || 1;
    const s = String(map);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    return h >>> 0;
  }
  function today() {
    if (RL.Escape && RL.Escape._today) return RL.Escape._today;
    const d = new Date();
    const p = (n) => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function money(n) { return RL.fmtMoney ? RL.fmtMoney(n) : ('$' + Math.round(n)); }
  function clock(t) {
    t = Math.max(0, Number(t) || 0);
    if (RL.fmtTime) return RL.fmtTime(t);
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  }
  function sfx(name, v) { try { if (RL.Audio && RL.Audio.play) RL.Audio.play(name, v); } catch (e) { /* audio is best-effort */ } }
  function uiOpen() { return !!(RL.UI && RL.UI.isOpen && RL.UI.isOpen()); }

  function blankEscape() {
    return { coins: 0, owned: ['alley'], selected: 'alley', best: {}, daily: { date: '', paid: 0 } };
  }
  function ensureSave(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return s;
    if (!s.escape || typeof s.escape !== 'object' || Array.isArray(s.escape)) {
      s.escape = blankEscape();
      return s;
    }
    const e = s.escape;
    const n = Number(e.coins);
    e.coins = Math.round(clamp(Number.isFinite(n) ? n : 0, 0, 10000000));
    if (!Array.isArray(e.owned)) e.owned = ['alley'];
    e.owned = e.owned.filter((id, i) => typeof id === 'string' && id && e.owned.indexOf(id) === i);
    if (e.owned.indexOf('alley') < 0) e.owned.unshift('alley');
    if (typeof e.selected !== 'string' || e.owned.indexOf(e.selected) < 0) e.selected = 'alley';
    if (!e.best || typeof e.best !== 'object' || Array.isArray(e.best)) e.best = {};
    else {
      Object.keys(e.best).forEach((k) => {
        const v = Number(e.best[k]);
        if (!Number.isFinite(v) || v < 0) delete e.best[k];
        else e.best[k] = Math.round(v);
      });
    }
    if (!e.daily || typeof e.daily !== 'object' || Array.isArray(e.daily)) e.daily = { date: '', paid: 0 };
    else {
      if (typeof e.daily.date !== 'string') e.daily.date = '';
      const p = Number(e.daily.paid);
      e.daily.paid = Math.round(clamp(Number.isFinite(p) ? p : 0, 0, 10000000));
    }
    return s;
  }
  function profile() {
    if (!RL.Game || !RL.Game.state) return null;
    ensureSave(RL.Game.state);
    return RL.Game.state.escape;
  }
  function persist() { try { if (RL.Game && RL.Game.save) RL.Game.save(); } catch (e) { /* keep the in-memory career */ } }
  function bankRun(e, earned) {
    const add = Math.max(0, Math.min(RULES.COIN_CAP, Math.round(Number(earned) || 0)));
    e.coins = Math.min(10000000, e.coins + add);
    return add;
  }
  function applyDailyBonus(e, coinsEarned) {
    const day = today();
    if (e.daily.date !== day) { e.daily.date = day; e.daily.paid = 0; }
    const room = Math.max(0, RULES.DAILY_CAP - e.daily.paid);
    const grant = Math.min(room, Math.max(0, Math.round(Number(coinsEarned) || 0)) * RULES.COIN_CASH);
    e.daily.paid += grant;
    if (grant > 0 && RL.Game && RL.Game.addMoney) RL.Game.addMoney(grant);
    return grant;
  }
  function noteBest(e, map, score) {
    const prev = Number(e.best[map]) || 0;
    const s = Math.round(score);
    if (s > prev) { e.best[map] = s; return true; }
    return false;
  }
  function tryBuy(id) {
    const wallet = profile();
    const c = CARS[id];
    if (!wallet || !c) return { ok: false, reason: 'bad' };
    if (wallet.owned.indexOf(id) >= 0) return { ok: false, reason: 'owned' };
    if (wallet.coins < c.cost) return { ok: false, reason: 'poor' };
    wallet.coins -= c.cost;
    wallet.owned.push(id);
    wallet.selected = id;
    persist();
    return { ok: true };
  }
  function carFor(e) {
    const id = e && CARS[e.selected] ? e.selected : 'alley';
    return CARS[id];
  }

  function roster(t) {
    if (t >= 180) return ['cruiser', 'interceptor', 'suv', 'interceptor', 'armored', 'heavy', 'cruiser'];
    if (t >= 140) return ['cruiser', 'cruiser', 'suv', 'interceptor', 'suv', 'armored', 'interceptor'];
    if (t >= 75) return ['cruiser', 'cruiser', 'suv', 'interceptor', 'suv', 'interceptor'];
    if (t >= 50) return ['cruiser', 'cruiser', 'suv', 'interceptor'];
    if (t >= 32) return ['cruiser', 'cruiser', 'cruiser', 'suv'];
    if (t >= 16) return ['cruiser', 'cruiser', 'cruiser'];
    return ['cruiser', 'cruiser'];
  }
  function threatName(t) {
    if (t >= 180) return 'IRON HULL';
    if (t >= 140) return 'ARMORED';
    if (t >= 120) return 'SPOTLIGHT';
    if (t >= 95) return 'STINGERS';
    if (t >= 72) return 'BARRICADES';
    if (t >= 50) return 'INTERCEPTORS';
    if (t >= 32) return 'SUVs';
    return 'CRUISERS';
  }
  function starCount(t) {
    if (t >= 150) return 5;
    if (t >= 100) return 4;
    if (t >= 60) return 3;
    if (t >= 25) return 2;
    return 1;
  }

  function setTile(tiles, x, y, v) {
    if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) return;
    tiles[y * N + x] = v;
  }
  function tileAt(tiles, x, y) {
    if (x < 0 || y < 0 || x >= N || y >= N) return 9;
    return tiles[y * N + x];
  }
  function solidTile(w, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return true;
    if (tx === 0 || ty === 0 || tx === N - 1 || ty === N - 1) return true;
    const t = w.tiles[ty * N + tx];
    return t === 0 && w.biome.blockOff;
  }
  function buildMap(biome, rng) {
    const tiles = new Uint8Array(N * N);
    for (let i = 2; i < N - 2; i++) {
      setTile(tiles, i, 2, 1); setTile(tiles, i, 3, 1);
      setTile(tiles, i, N - 3, 1); setTile(tiles, i, N - 4, 1);
      setTile(tiles, 2, i, 1); setTile(tiles, 3, i, 1);
      setTile(tiles, N - 3, i, 1); setTile(tiles, N - 4, i, 1);
    }
    for (let g = 8; g < N - 8; g += 7) {
      const j = clamp(g + Math.floor(rng() * 3) - 1, 6, N - 8);
      for (let i = 3; i < N - 3; i++) {
        setTile(tiles, i, j, 1); setTile(tiles, i, j + 1, 1);
        setTile(tiles, j, i, 1); setTile(tiles, j + 1, i, 1);
      }
    }
    for (let k = 0; k < 16; k++) {
      const horiz = rng() < 0.5;
      const a = 4 + Math.floor(rng() * (N - 8));
      const b0 = 4 + Math.floor(rng() * (N - 12));
      const len = 4 + Math.floor(rng() * 6);
      for (let s = 0; s < len; s++) {
        const x = horiz ? b0 + s : a;
        const y = horiz ? a : b0 + s;
        if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
        if (tiles[y * N + x] === 0) tiles[y * N + x] = 2;
      }
    }
    let ramps = 0;
    for (let i = 0; i < 500 && ramps < 8; i++) {
      const x = 4 + Math.floor(rng() * (N - 8));
      const y = 4 + Math.floor(rng() * (N - 8));
      if (tiles[y * N + x] === 1) { tiles[y * N + x] = 3; ramps++; }
    }
    if (biome.id === 'ice') {
      for (let i = 0; i < 18; i++) {
        const x = 3 + Math.floor(rng() * (N - 8));
        const y = 3 + Math.floor(rng() * (N - 8));
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) {
          const ti = (y + dy) * N + (x + dx);
          if (tiles[ti] === 1) tiles[ti] = 4;
        }
      }
    }
    const props = [];
    const kinds = PROP_KINDS[biome.prop] || PROP_KINDS.city;
    const mid = WORLD / 2;
    for (let n = 0, guard = 0; n < 48 && guard < 600; guard++) {
      const tx = 1 + Math.floor(rng() * (N - 2));
      const ty = 1 + Math.floor(rng() * (N - 2));
      const t = tiles[ty * N + tx];
      const spec = kinds[Math.floor(rng() * kinds.length)];
      const onRoad = t === 1 || t === 2 || t === 3 || t === 4;
      if (spec.road && !onRoad) continue;
      if (spec.off && onRoad) continue;
      const x = tx * TILE + 10 + rng() * (TILE - 20);
      const y = ty * TILE + 10 + rng() * (TILE - 20);
      if (Math.hypot(x - mid, y - mid) < 110) continue;
      props.push({ x: x, y: y, r: spec.r, hp: spec.hp, max: spec.hp, kind: spec.kind, solid: true, dead: false });
      n++;
    }
    return { tiles: tiles, props: props };
  }
  function surfaceAt(w, x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return { grip: 0.3, ramp: false };
    const t = w.tiles[ty * N + tx];
    const b = w.biome;
    if (t === 4) return { grip: b.iceGrip, ramp: false };
    if (t === 0) return { grip: b.offGrip, ramp: false };
    if (t === 2) return { grip: b.cutGrip, ramp: false };
    if (t === 3) return { grip: b.roadGrip, ramp: true };
    return { grip: b.roadGrip, ramp: false };
  }
  function findRoad(tiles, x, y) {
    let best = null, bestD = 1e12;
    for (let ty = 1; ty < N - 1; ty++) for (let tx = 1; tx < N - 1; tx++) {
      const t = tiles[ty * N + tx];
      if (t !== 1 && t !== 3 && t !== 2 && t !== 4) continue;
      const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
      const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      if (d < bestD) { bestD = d; best = { x: cx, y: cy }; }
    }
    return best || { x: TILE * 4, y: TILE * 4 };
  }
  function makeBody(x, y, spec, isPlayer) {
    return {
      x: x, y: y, h: -Math.PI / 2, vx: 0, vy: 0, r: spec.r, hp: spec.hp, maxHp: spec.hp,
      inv: isPlayer ? 0.35 : 0.8, spec: spec, isPlayer: !!isPlayer, carId: spec.id || spec.kind,
      nitro: 100, rampCd: 0, hop: 0, dead: false, ttl: 0, nearCd: 0, avoid: 1, kind: spec.kind || spec.id
    };
  }
  function makeCop(kind, x, y) {
    const spec = COPS[kind] || COPS.cruiser;
    const c = makeBody(x, y, spec, false);
    c.kind = spec.kind;
    c.avoid = Math.random() < 0.5 ? -1 : 1;
    return c;
  }
  function pointBlocked(w, x, y, rad) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!solidTile(w, tx + ox, ty + oy)) continue;
      const L = (tx + ox) * TILE, T = (ty + oy) * TILE;
      const cx = clamp(x, L, L + TILE), cy = clamp(y, T, T + TILE);
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy < rad * rad) return true;
    }
    for (let i = 0; i < w.props.length; i++) {
      const p = w.props[i];
      if (!p.solid || p.dead) continue;
      const dx = x - p.x, dy = y - p.y;
      if (dx * dx + dy * dy < (rad + p.r) * (rad + p.r)) return true;
    }
    return false;
  }
  function spawnCop(w, kind, minDist, reuse) {
    const from = w.player;
    let spot = null;
    for (let i = 0; i < 40; i++) {
      const tx = 2 + Math.floor(w.rng() * (N - 4));
      const ty = 2 + Math.floor(w.rng() * (N - 4));
      if (w.tiles[ty * N + tx] !== 1 && w.tiles[ty * N + tx] !== 4) continue;
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
      const d = Math.hypot(x - from.x, y - from.y);
      if (d >= minDist && d <= minDist + 420) { spot = { x: x, y: y }; break; }
    }
    if (!spot) {
      const tryX = clamp(from.x - Math.cos(from.h || 0) * minDist, TILE * 3, WORLD - TILE * 3);
      const tryY = clamp(from.y - Math.sin(from.h || 0) * minDist, TILE * 3, WORLD - TILE * 3);
      if (Math.hypot(tryX - from.x, tryY - from.y) >= minDist) spot = { x: tryX, y: tryY };
    }
    if (!spot || Math.hypot(spot.x - from.x, spot.y - from.y) < minDist) return null;
    const c = reuse || makeCop(kind, spot.x, spot.y);
    const spec = COPS[kind] || COPS.cruiser;
    c.x = spot.x; c.y = spot.y; c.vx = 0; c.vy = 0; c.dead = false; c.ttl = 0;
    c.hp = spec.hp; c.maxHp = spec.hp; c.spec = spec; c.kind = spec.kind; c.r = spec.r;
    c.inv = 0.9; c.nearCd = 0; c.h = Math.atan2(from.y - spot.y, from.x - spot.x);
    if (!reuse) w.cops.push(c);
    return c;
  }
  function scatterCash(w, n) {
    let guard = 0;
    while (w.cash.length < n && guard++ < 400) {
      const tx = 2 + Math.floor(w.rng() * (N - 4));
      const ty = 2 + Math.floor(w.rng() * (N - 4));
      const t = w.tiles[ty * N + tx];
      if (t !== 1 && t !== 2 && t !== 3 && t !== 4) continue;
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
      if (Math.hypot(x - w.player.x, y - w.player.y) < 140) continue;
      w.cash.push({ x: x, y: y, taken: false, t: 0 });
    }
  }
  function create(opts) {
    opts = opts || {};
    const mapId = MAPS[opts.map] ? opts.map : 'city';
    const biome = MAPS[mapId];
    const seed = opts.seed == null ? (Date.now() % 1000003) : (Number(opts.seed) >>> 0);
    const mixed = mixSeed(seed, mapId);
    const rng = mulberry32(mixed);
    const built = buildMap(biome, rng);
    const car = CARS[opts.car] || CARS.alley;
    const spot = findRoad(built.tiles, WORLD / 2, WORLD / 2);
    const player = makeBody(spot.x, spot.y, car, true);
    player.carId = car.id;
    const w = {
      mapId: mapId, biome: biome, seed: seed, mixed: mixed, rng: rng,
      tiles: built.tiles, props: built.props, cash: [],
      player: player, cops: [], particles: [], floaters: [],
      t: 0, score: 0, near: 0, downs: 0, cashN: 0, coins: 0, coinMeter: 0,
      shake: 0, phase: 'run', settled: false, summary: null,
      heli: { x: spot.x, y: spot.y - 180, on: false, heat: 0 },
      blockIn: 8, spikeIn: 10, camX: spot.x, camY: spot.y,
      holdRoster: !!opts.holdRoster, canvas: null, mini: null, wantRestart: false
    };
    scatterCash(w, 12);
    if (!opts.noCops) {
      const want = roster(0);
      for (let i = 0; i < want.length; i++) spawnCop(w, want[i], 1100);
    }
    return w;
  }

  function integrate(body, dt, inp, gripMul) {
    const spec = body.spec;
    const steer = clamp(inp.steer || 0, -1, 1);
    const speedNow = Math.hypot(body.vx, body.vy);
    const rate = spec.turn * (inp.drift ? 1.34 : 1) * (0.58 + 0.42 * clamp(speedNow / Math.max(1, spec.top), 0, 1));
    body.h += steer * rate * dt;
    const fx = Math.cos(body.h), fy = Math.sin(body.h);
    let forward = body.vx * fx + body.vy * fy;
    let side = body.vx * -fy + body.vy * fx;
    const accel = spec.accel * (inp.nitro ? 1.55 : 1);
    if (inp.throttle) forward += accel * dt;
    if (inp.brake) forward -= spec.brake * dt;
    const drag = 0.42 + (1 - gripMul) * 0.85;
    forward -= forward * drag * dt;
    const cap = spec.top * (0.55 + 0.45 * clamp(gripMul, 0, 1));
    if (forward > cap) forward = cap;
    if (forward < -spec.top * 0.32) forward = -spec.top * 0.32;
    const stick = clamp(gripMul * spec.grip * (inp.drift ? 0.2 : 1), 0.04, 2.2);
    side *= Math.max(0, 1 - stick * 7.2 * dt);
    body.vx = fx * forward - fy * side;
    body.vy = fy * forward + fx * side;
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    return rate;
  }

  function circleRect(body, L, T, W, H) {
    const cx = clamp(body.x, L, L + W), cy = clamp(body.y, T, T + H);
    let dx = body.x - cx, dy = body.y - cy;
    let d2 = dx * dx + dy * dy;
    if (d2 > body.r * body.r) return null;
    if (d2 < 1e-8) {
      dx = body.x - (L + W / 2); dy = body.y - (T + H / 2);
      if (Math.abs(dx) < Math.abs(dy)) dx = 0; else dy = 0;
      if (dx === 0 && dy === 0) dx = 1;
      d2 = dx * dx + dy * dy || 1;
    }
    const d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, pen: body.r - d };
  }
  function resolveTiles(w, body) {
    let impact = 0;
    for (let pass = 0; pass < 2; pass++) {
      const tx = Math.floor(body.x / TILE), ty = Math.floor(body.y / TILE);
      for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) {
        if (!solidTile(w, x, y)) continue;
        const hit = circleRect(body, x * TILE, y * TILE, TILE, TILE);
        if (!hit) continue;
        body.x += hit.nx * hit.pen;
        body.y += hit.ny * hit.pen;
        const vn = body.vx * hit.nx + body.vy * hit.ny;
        if (vn < 0) {
          body.vx -= vn * hit.nx;
          body.vy -= vn * hit.ny;
          impact = Math.max(impact, -vn);
        }
      }
    }
    return impact;
  }
  function separateCircle(body, x, y, rad) {
    let dx = body.x - x, dy = body.y - y;
    const min = body.r + rad;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) return null;
    let d = Math.sqrt(d2);
    if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
    const nx = dx / d, ny = dy / d;
    return { nx: nx, ny: ny, pen: min - d };
  }
  function burst(w, x, y, color, n, speed) {
    for (let i = 0; i < n && w.particles.length < 400; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random());
      w.particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.28 + Math.random() * 0.25, max: 0.5, size: 2 + Math.random() * 2, color: color, kind: 'spark' });
    }
  }
  function puff(w, x, y, color) {
    if (w.particles.length > 400) return;
    w.particles.push({ x: x, y: y, vx: (Math.random() - 0.5) * 36, vy: (Math.random() - 0.5) * 36, life: 0.7, max: 0.7, size: 8, color: color, kind: 'smoke' });
  }
  function floater(w, x, y, text, color) {
    w.floaters.push({ x: x, y: y, text: text, color: color || '#fff', life: 0.85 });
    if (w.floaters.length > 14) w.floaters.shift();
  }
  function hurt(w, body, amount) {
    if (amount <= 0 || !body || body.dead || body.inv > 0) return;
    body.hp -= amount;
    body.inv = body.isPlayer ? 0.42 : 0.18;
    w.shake = Math.min(18, (w.shake || 0) + Math.min(8, amount * 0.18));
    if (body.hp <= 0) {
      body.hp = 0;
      if (!body.isPlayer) wreck(w, body);
    }
  }
  function wreck(w, c) {
    if (!c || c.dead) return;
    c.dead = true;
    c.hp = 0;
    c.vx *= 0.15;
    c.vy *= 0.15;
    c.ttl = 4.2;
    w.downs += 1;
    w.score += RULES.SCORE_DOWN;
    w.shake = Math.min(18, w.shake + 7);
    floater(w, c.x, c.y - 22, 'TAKEDOWN', '#ffb15a');
    burst(w, c.x, c.y, '255,190,80', 14, 180);
    puff(w, c.x, c.y, '80,80,80');
    sfx('crash', 0.65);
  }
  function giveCash(w) {
    w.cashN += 1;
    w.score += RULES.SCORE_CASH;
    if (w.coins < RULES.COIN_CAP) w.coins += 1;
    floater(w, w.player.x, w.player.y - 18, w.coins >= RULES.COIN_CAP && w.cashN > RULES.COIN_CAP ? '+SCORE' : '+COIN', '#ffe03b');
    sfx('coin');
  }
  function copSteer(w, c, dt) {
    const p = w.player;
    const pred = w.heli.on && w.heli.heat > 0.4 ? 0.62 : 0.3;
    let tx = p.x + p.vx * pred, ty = p.y + p.vy * pred;
    const fx = Math.cos(c.h), fy = Math.sin(c.h);
    if (pointBlocked(w, c.x + fx * 46, c.y + fy * 46, c.r * 0.7)) {
      tx += -fy * c.avoid * 80;
      ty += fx * c.avoid * 80;
    }
    const target = Math.atan2(ty - c.y, tx - c.x);
    const diff = wrap(target - c.h);
    const maxTurn = Math.max(0.001, c.spec.turn * dt);
    const steer = clamp(diff / maxTurn, -1, 1);
    const throttle = Math.abs(diff) < 1.05 ? 1 : 0.15;
    const brake = Math.abs(diff) > 1.5 ? 1 : 0;
    return { steer: steer, throttle: throttle, brake: brake, drift: false, nitro: false };
  }
  function hitProps(w, body) {
    let impact = 0;
    const spec = body.spec || {};
    for (let i = 0; i < w.props.length; i++) {
      const p = w.props[i];
      if (p.dead && p.kind !== 'spike') continue;
      if (p.kind === 'spike') {
        const d = Math.hypot(body.x - p.x, body.y - p.y);
        if (d < body.r + p.r && Math.hypot(body.vx, body.vy) > 50) {
          hurt(w, body, 18 * (spec.spike == null ? 1 : spec.spike));
          body.vx *= 0.62;
          body.vy *= 0.62;
          if (body.isPlayer) burst(w, body.x, body.y, '200,210,220', 6, 120);
        }
        continue;
      }
      if (!p.solid) continue;
      const hit = separateCircle(body, p.x, p.y, p.r);
      if (!hit) continue;
      body.x += hit.nx * hit.pen;
      body.y += hit.ny * hit.pen;
      const vn = body.vx * hit.nx + body.vy * hit.ny;
      if (vn < 0) {
        body.vx -= vn * hit.nx;
        body.vy -= vn * hit.ny;
        impact = Math.max(impact, -vn);
        const ram = Math.max(0, -vn - 48) * 0.11 * (spec.prop == null ? 1 : spec.prop);
        p.hp -= ram;
        if (p.hp <= 0) {
          p.hp = 0; p.dead = true; p.solid = false;
          burst(w, p.x, p.y, '255,220,140', 8, 140);
          sfx('bump');
        }
      }
    }
    return impact;
  }
  function syncRoster(w) {
    if (w.holdRoster) return;
    const want = roster(w.t);
    let guard = 0;
    while (w.cops.length < want.length && guard++ < 8) {
      if (!spawnCop(w, want[w.cops.length], 1100)) break;
    }
    for (let i = 0; i < w.cops.length; i++) {
      const c = w.cops[i];
      if (c.dead && c.ttl <= 0) spawnCop(w, want[Math.min(i, want.length - 1)], 1100, c);
    }
  }
  function spawnHazard(w, kind) {
    const p = w.player;
    const fx = Math.cos(p.h), fy = Math.sin(p.h);
    const sx = -fy, sy = fx;
    const dist = kind === 'block' ? 1200 : 1100;
    const x = clamp(p.x + fx * dist, TILE * 2, WORLD - TILE * 2);
    const y = clamp(p.y + fy * dist, TILE * 2, WORLD - TILE * 2);
    if (kind === 'block') {
      for (let i = -1; i <= 1; i++) {
        w.props.push({ x: x + sx * i * 28, y: y + sy * i * 28, r: 14, hp: 90, max: 90, kind: 'block', solid: true, dead: false });
      }
      floater(w, p.x, p.y - 36, 'BARRICADE', '#ff8a8a');
    } else {
      for (let i = -2; i <= 2; i++) {
        w.props.push({ x: x + sx * i * 16, y: y + sy * i * 16, r: 11, hp: 1, max: 1, kind: 'spike', solid: false, dead: false });
      }
      floater(w, p.x, p.y - 36, 'STINGERS', '#d0d6de');
    }
    if (w.props.length > 90) w.props.splice(0, w.props.length - 90);
  }
  function step(w, dt, inp) {
    if (!w || w.phase !== 'run') return w;
    dt = Math.min(0.05, dt || 0);
    if (w.player.hp <= 0) { finish(w); return w; }
    inp = inp || {};
    w.t += dt;
    w.score += dt * RULES.SCORE_TIME;
    w.coinMeter += dt;
    while (w.coinMeter >= RULES.COIN_TIME && w.coins < RULES.COIN_CAP) {
      w.coinMeter -= RULES.COIN_TIME;
      w.coins += 1;
    }
    w.heli.on = w.t >= 120;
    if (w.heli.on) {
      w.heli.x += (w.player.x - w.heli.x) * Math.min(1, dt * 0.85);
      w.heli.y += ((w.player.y - 70) - w.heli.y) * Math.min(1, dt * 0.85);
      const beamX = w.heli.x + Math.cos(w.t * 0.7) * 18;
      const beamY = w.heli.y + 70 + Math.sin(w.t * 0.9) * 18;
      w.heli.bx = beamX; w.heli.by = beamY;
      const lit = Math.hypot(w.player.x - beamX, w.player.y - beamY) < 78;
      w.heli.heat = lit ? Math.min(2.5, w.heli.heat + dt) : Math.max(0, w.heli.heat - dt * 0.8);
      if (w.heli.heat > 0.85) hurt(w, w.player, 7 * dt);
    }
    if (w.t >= 72) {
      w.blockIn -= dt;
      if (w.blockIn <= 0) { spawnHazard(w, 'block'); w.blockIn = 16; }
    }
    if (w.t >= 95) {
      w.spikeIn -= dt;
      if (w.spikeIn <= 0) { spawnHazard(w, 'spike'); w.spikeIn = 12; }
    }
    syncRoster(w);
    const player = w.player;
    if (player.inv > 0) player.inv -= dt;
    if (player.rampCd > 0) player.rampCd -= dt;
    if (player.hop > 0) player.hop -= dt;
    let nitroOn = false;
    if (inp.nitro && player.nitro > 0 && Math.hypot(player.vx, player.vy) > 40) {
      player.nitro = Math.max(0, player.nitro - 36 * dt);
      nitroOn = true;
    } else player.nitro = Math.min(100, player.nitro + player.spec.nitro * dt);
    const surf = surfaceAt(w, player.x, player.y);
    integrate(player, dt, { throttle: inp.throttle, brake: inp.brake, steer: inp.steer, drift: inp.drift, nitro: nitroOn }, surf.grip);
    if (surf.ramp && player.rampCd <= 0 && Math.hypot(player.vx, player.vy) > 80) {
      player.vx += Math.cos(player.h) * 110;
      player.vy += Math.sin(player.h) * 110;
      player.rampCd = 0.9;
      player.hop = 0.32;
      floater(w, player.x, player.y - 16, 'RAMP', '#7dffb2');
    }
    const wallImp = resolveTiles(w, player);
    const propImp = hitProps(w, player);
    const pImp = Math.max(wallImp, propImp);
    if (pImp > 95) {
      hurt(w, player, (pImp - 95) * 0.055 * (player.spec.wall || 1));
      burst(w, player.x, player.y, '255,220,120', 8, 160);
      if (pImp > 140) sfx('bump');
    }
    if (inp.drift && Math.hypot(player.vx, player.vy) > 70 && Math.random() < 0.45) puff(w, player.x, player.y, '210,210,220');
    if (player.hp < player.maxHp * 0.4 && Math.random() < 0.5) puff(w, player.x - Math.cos(player.h) * 16, player.y - Math.sin(player.h) * 16, '90,90,90');
    if (nitroOn) puff(w, player.x - Math.cos(player.h) * 18, player.y - Math.sin(player.h) * 18, '80,170,255');

    for (let i = 0; i < w.cops.length; i++) {
      const c = w.cops[i];
      if (c.inv > 0) c.inv -= dt;
      if (c.nearCd > 0) c.nearCd -= dt;
      if (c.dead) { c.ttl -= dt; continue; }
      const cs = surfaceAt(w, c.x, c.y);
      integrate(c, dt, copSteer(w, c, dt), cs.grip * 0.96);
      const cWall = resolveTiles(w, c);
      const cProp = hitProps(w, c);
      const cImp = Math.max(cWall, cProp);
      if (cImp > 130) {
        hurt(w, c, (cImp - 90) * 0.42);
        burst(w, c.x, c.y, '255,160,90', 8, 150);
      }
    }
    for (let i = 0; i < w.cops.length; i++) for (let j = i + 1; j < w.cops.length; j++) {
      const a = w.cops[i], b = w.cops[j];
      const hit = separateCircle(a, b.x, b.y, b.r);
      if (!hit) continue;
      if (!a.dead) { a.x += hit.nx * hit.pen * 0.5; a.y += hit.ny * hit.pen * 0.5; }
      if (!b.dead) { b.x -= hit.nx * hit.pen * 0.5; b.y -= hit.ny * hit.pen * 0.5; }
      const rel = (a.vx - b.vx) * hit.nx + (a.vy - b.vy) * hit.ny;
      const approach = -rel;
      if (approach < 85) continue;
      const dmg = (approach - 60) * 0.22;
      if (!a.dead) hurt(w, a, dmg * (b.spec ? b.spec.mass : 1));
      if (!b.dead) hurt(w, b, dmg * (a.spec ? a.spec.mass : 1));
      burst(w, (a.x + b.x) / 2, (a.y + b.y) / 2, '255,200,90', 10, 170);
    }
    for (let i = 0; i < w.cops.length; i++) {
      const c = w.cops[i];
      if (c.dead) continue;
      const hit = separateCircle(player, c.x, c.y, c.r);
      if (!hit) {
        const gap = Math.hypot(player.x - c.x, player.y - c.y) - player.r - c.r;
        const rel = Math.hypot(player.vx - c.vx, player.vy - c.vy);
        if (gap > 0 && gap < 26 && rel > 75 && c.nearCd <= 0) {
          c.nearCd = 1.45;
          w.near += 1;
          w.score += RULES.SCORE_NEAR;
          w.shake = Math.min(12, w.shake + 3);
          floater(w, player.x, player.y - 26, 'NEAR MISS', '#7dfff0');
        }
        continue;
      }
      player.x += hit.nx * hit.pen * 0.55;
      player.y += hit.ny * hit.pen * 0.55;
      c.x -= hit.nx * hit.pen * 0.45;
      c.y -= hit.ny * hit.pen * 0.45;
      const relv = (player.vx - c.vx) * hit.nx + (player.vy - c.vy) * hit.ny;
      const approach = Math.abs(relv);
      if (approach > 45) {
        hurt(w, player, approach * 0.045 * c.spec.mass / Math.max(0.4, player.spec.mass));
        hurt(w, c, approach * 0.07 * player.spec.mass / Math.max(0.4, c.spec.mass));
        player.vx -= hit.nx * relv * 0.45;
        player.vy -= hit.ny * relv * 0.45;
        burst(w, (player.x + c.x) / 2, (player.y + c.y) / 2, '255,230,160', 8, 140);
        sfx('bump');
      }
    }
    for (let i = 0; i < w.cash.length; i++) {
      const cash = w.cash[i];
      if (cash.taken) {
        cash.t -= dt;
        if (cash.t <= 0) {
          const spot = findRoad(w.tiles, w.rng() * WORLD, w.rng() * WORLD);
          cash.x = spot.x; cash.y = spot.y; cash.taken = false;
        }
        continue;
      }
      if (Math.hypot(player.x - cash.x, player.y - cash.y) < player.r + 12) {
        cash.taken = true;
        cash.t = 9;
        giveCash(w);
      }
    }
    for (let i = w.particles.length - 1; i >= 0; i--) {
      const p = w.particles[i];
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'smoke') { p.vx *= 0.98; p.vy *= 0.98; }
      if (p.life <= 0) w.particles.splice(i, 1);
    }
    for (let i = w.floaters.length - 1; i >= 0; i--) {
      w.floaters[i].life -= dt;
      w.floaters[i].y -= 28 * dt;
      if (w.floaters[i].life <= 0) w.floaters.splice(i, 1);
    }
    const look = 56;
    const tx = player.x + Math.cos(player.h) * look;
    const ty = player.y + Math.sin(player.h) * look;
    w.camX += (tx - w.camX) * Math.min(1, dt * 4);
    w.camY += (ty - w.camY) * Math.min(1, dt * 4);
    w.shake = Math.max(0, w.shake - dt * 22);
    if (player.hp <= 0) finish(w);
    return w;
  }

  function settle(w) {
    if (!w) return null;
    if (w.settled) return w.summary;
    w.settled = true;
    w.phase = 'over';
    const e = profile();
    const score = Math.round(w.score);
    let isBest = false, coins = 0, bonus = 0, best = score;
    /* Only the live run pays the career. Headless worlds stay isolated. */
    if (e && w === world) {
      isBest = noteBest(e, w.mapId, score);
      coins = bankRun(e, w.coins);
      bonus = applyDailyBonus(e, w.coins);
      best = e.best[w.mapId] || score;
      persist();
    }
    w.summary = {
      time: w.t, downs: w.downs, near: w.near, cash: w.cashN, score: score,
      best: best, isBest: isBest, coins: coins, bonus: bonus, map: w.mapId
    };
    return w.summary;
  }
  function finish(w) {
    const sum = settle(w);
    if (w === world && RL.UI && RL.UI.open) showResults(sum);
    return sum;
  }

  function hexRgb(h) {
    const n = parseInt(String(h).slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function bake(w) {
    if (w.canvas || typeof document === 'undefined') return;
    const c = document.createElement('canvas');
    c.width = WORLD; c.height = WORLD;
    const g = c.getContext('2d');
    const b = w.biome;
    g.fillStyle = b.bg;
    g.fillRect(0, 0, WORLD, WORLD);
    for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
      const t = w.tiles[ty * N + tx];
      const x = tx * TILE, y = ty * TILE;
      if (tx === 0 || ty === 0 || tx === N - 1 || ty === N - 1) {
        g.fillStyle = b.wall; g.fillRect(x, y, TILE, TILE); continue;
      }
      if (t === 0 && b.blockOff) {
        g.fillStyle = ((tx + ty) & 1) ? b.blockAlt : b.block;
        g.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
        g.fillStyle = 'rgba(180,220,255,0.18)';
        g.fillRect(x + 8, y + 8, 8, 6); g.fillRect(x + 22, y + 8, 8, 6);
        g.fillRect(x + 8, y + 22, 8, 6); g.fillRect(x + 22, y + 22, 8, 6);
        continue;
      }
      if (t === 0) {
        if (b.id === 'desert' && ((tx * 3 + ty) % 5) === 0) {
          g.fillStyle = 'rgba(140,90,40,0.25)';
          g.beginPath(); g.arc(x + 20, y + 24, 6, 0, 7); g.fill();
        }
        if (b.id === 'forest' && ((tx + ty * 2) % 4) === 0) {
          g.fillStyle = 'rgba(20,50,24,0.45)';
          g.fillRect(x + 8, y + 10, 18, 14);
        }
        continue;
      }
      g.fillStyle = t === 2 ? b.alley : b.road;
      if (t === 2) g.fillRect(x + 10, y + 10, TILE - 20, TILE - 20);
      else g.fillRect(x, y, TILE, TILE);
      g.strokeStyle = b.id === 'ice' ? '#6d8eaa' : 'rgba(0,0,0,0.28)';
      g.lineWidth = b.id === 'ice' ? 3 : 2;
      g.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
      if (t === 4) { g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x, y, TILE, TILE); }
      if (t === 1 || t === 4) {
        g.strokeStyle = b.line; g.globalAlpha = 0.55; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x + 8, y + TILE / 2); g.lineTo(x + TILE - 8, y + TILE / 2); g.stroke();
        g.globalAlpha = 1;
      }
      if (t === 3) {
        g.fillStyle = '#7dffb2';
        g.beginPath(); g.moveTo(x + 18, y + 46); g.lineTo(x + 32, y + 18); g.lineTo(x + 46, y + 46); g.fill();
      }
    }
    w.canvas = c;
    const m = document.createElement('canvas');
    m.width = N; m.height = N;
    const mg = m.getContext('2d');
    const img = mg.createImageData(N, N);
    const road = hexRgb(b.road), ground = hexRgb(b.bg), wall = hexRgb(b.wall), alley = hexRgb(b.alley);
    for (let i = 0; i < N * N; i++) {
      const t = w.tiles[i];
      const tx = i % N, ty = (i / N) | 0;
      let col = ground;
      if (tx === 0 || ty === 0 || tx === N - 1 || ty === N - 1) col = wall;
      else if (t === 1 || t === 3 || t === 4) col = road;
      else if (t === 2) col = alley;
      else if (t === 0 && b.blockOff) col = wall;
      const o = i * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    mg.putImageData(img, 0, 0);
    w.mini = m;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, r);
    else g.rect(x, y, w, h);
  }
  function paintCar(g, body, t) {
    const spec = body.spec;
    const w = spec.w, h = spec.h;
    g.save();
    g.translate(body.x, body.y);
    g.rotate(body.h);
    const hop = body.hop > 0 ? 1 + body.hop : 1;
    g.scale(hop, hop);
    if (body.dead) {
      g.fillStyle = '#1a120e';
      g.fillRect(-w / 2, -h / 2, w, h * 0.7);
      g.restore();
      return;
    }
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
    if (body.kind === 'stomper' || body.carId === 'stomper' || body.kind === 'heavy') {
      g.fillStyle = '#1a1a1a';
      g.fillRect(-w / 2 - 2, -h / 2 - 3, 8, h + 6);
      g.fillRect(w / 2 - 6, -h / 2 - 3, 8, h + 6);
    }
      g.fillStyle = spec.color;
    roundRect(g, -w / 2, -h / 2, w, h, 4);
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = '#12141a';
    g.stroke();
    g.fillStyle = 'rgba(180,230,255,0.55)';
    g.fillRect(2, -h / 2 + 3, w * 0.28, h - 6);
    g.fillStyle = '#fff4c4';
    g.fillRect(w / 2 - 3, -h / 2 + 2, 3, 4);
    g.fillRect(w / 2 - 3, h / 2 - 6, 3, 4);
    const lights = spec.lights || body.kind === 'cruiser' || body.kind === 'suv' || body.kind === 'interceptor' || body.kind === 'armored' || body.carId === 'prowl';
    if (lights) {
      const blink = Math.sin((t || 0) * 16 + body.x) > 0;
      g.fillStyle = blink ? '#ff2a2a' : '#3d6bff';
      g.fillRect(-5, -h / 2 - 3, 5, 3);
      g.fillStyle = blink ? '#3d6bff' : '#ff2a2a';
      g.fillRect(1, -h / 2 - 3, 5, 3);
    }
    if (body.carId === 'taxi') {
      g.fillStyle = '#222'; g.fillRect(-5, -h / 2 - 5, 10, 4);
      g.fillStyle = '#ffe03b'; g.fillRect(-3, -h / 2 - 4, 6, 2);
    }
    if (body.carId === 'scoop') {
      g.fillStyle = '#fff'; g.fillRect(-9, -h / 2 - 8, 18, 8);
      g.fillStyle = '#ff8ec8'; g.beginPath(); g.arc(0, -h / 2 - 8, 5, Math.PI, 0); g.fill();
      g.fillStyle = '#7dfff0'; g.beginPath(); g.arc(-4, -h / 2 - 9, 3, Math.PI, 0); g.fill();
    }
    if (body.kind === 'heavy') {
      g.fillStyle = '#2c2a22';
      g.fillRect(-2, -6, 18, 12);
      g.fillRect(12, -2, 16, 4);
    }
    if (body.kind === 'armored') {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(-w / 2 + 4, -3, w - 8, 6);
    }
    g.restore();
    if (lights) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      const blink = Math.sin((t || 0) * 16 + body.x) > 0;
      g.fillStyle = blink ? 'rgba(255,40,40,0.28)' : 'rgba(50,90,255,0.28)';
      g.beginPath(); g.arc(body.x, body.y, body.r + 16, 0, 7); g.fill();
      g.restore();
    }
  }
  function drawProp(g, p) {
    if (p.dead && p.kind !== 'spike') {
      g.fillStyle = 'rgba(80,70,60,0.7)';
      g.beginPath(); g.arc(p.x, p.y, 4, 0, 7); g.fill();
      return;
    }
    g.save();
    if (p.kind === 'spike') {
      g.fillStyle = '#c5ccd4';
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(p.x + i * 5, p.y + 6);
        g.lineTo(p.x + i * 5 + 3, p.y - 7);
        g.lineTo(p.x + i * 5 + 6, p.y + 6);
        g.fill();
      }
    } else if (p.kind === 'lamp') {
      g.fillStyle = '#9aa4b2'; g.fillRect(p.x - 2, p.y - 12, 3, 16);
      g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(p.x, p.y - 14, 4, 0, 7); g.fill();
    } else if (p.kind === 'box' || p.kind === 'block') {
      g.fillStyle = p.kind === 'block' ? '#8a3a3a' : '#c47a3a';
      g.fillRect(p.x - p.r, p.y - p.r * 0.7, p.r * 2, p.r * 1.4);
    } else if (p.kind === 'cone') {
      g.fillStyle = '#ff7a1a'; g.beginPath(); g.moveTo(p.x, p.y - p.r); g.lineTo(p.x - p.r, p.y + p.r); g.lineTo(p.x + p.r, p.y + p.r); g.fill();
    } else if (p.kind === 'cactus') {
      g.fillStyle = '#2f8a45'; g.fillRect(p.x - 3, p.y - p.r, 6, p.r * 2);
      g.fillRect(p.x - 8, p.y - 2, 6, 3);
    } else if (p.kind === 'rock' || p.kind === 'bank') {
      g.fillStyle = p.kind === 'bank' ? '#f7fbff' : '#8d6a45';
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
    } else if (p.kind === 'tree' || p.kind === 'pine') {
      g.fillStyle = '#6b3f22'; g.fillRect(p.x - 2, p.y, 4, p.r);
      g.fillStyle = p.kind === 'pine' ? '#d9ece4' : '#1f6b34';
      g.beginPath(); g.arc(p.x, p.y - 4, p.r * 0.75, 0, 7); g.fill();
    } else if (p.kind === 'fence') {
      g.fillStyle = '#cbb48a'; g.fillRect(p.x - p.r, p.y - 2, p.r * 2, 4);
    } else {
      g.fillStyle = '#888'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
    }
    g.restore();
  }
  function draw(ctx) {
    if (!world || !ctx) return;
    bake(world);
    const view = RL.Game && RL.Game.view ? RL.Game.view(ctx) : { W: ctx.canvas.width, H: ctx.canvas.height };
    const W = view.W, H = view.H;
    const zoom = clamp(Math.min(W, H) / 980, 0.7, 1.45);
    const shakeOn = !(RL.settings && RL.settings.shake === false);
    const mag = shakeOn ? world.shake : 0;
    const sx = (Math.random() - 0.5) * mag, sy = (Math.random() - 0.5) * mag;
    ctx.fillStyle = world.biome.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(zoom, zoom);
    ctx.translate(-world.camX, -world.camY);
    if (world.canvas) ctx.drawImage(world.canvas, 0, 0);
    for (let i = 0; i < world.cash.length; i++) {
      const c = world.cash[i];
      if (c.taken) continue;
      ctx.fillStyle = '#ffe03b';
      ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#7a5a10';
      ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('$', c.x, c.y + 3);
    }
    for (let i = 0; i < world.props.length; i++) drawProp(ctx, world.props[i]);
    for (let i = 0; i < world.particles.length; i++) {
      const p = world.particles[i];
      const a = Math.max(0, p.life / p.max);
      ctx.fillStyle = 'rgba(' + p.color + ',' + (p.kind === 'smoke' ? 0.35 * a : a) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'smoke' ? p.size * (1.4 - a) : p.size, 0, 7); ctx.fill();
    }
    const cops = world.cops.slice().sort((a, b) => (a.dead ? 0 : 1) - (b.dead ? 0 : 1));
    for (let i = 0; i < cops.length; i++) paintCar(ctx, cops[i], world.t);
    paintCar(ctx, world.player, world.t);
    if (world.heli.on) {
      ctx.save();
      ctx.translate(world.heli.x, world.heli.y);
      ctx.fillStyle = 'rgba(20,24,28,0.85)';
      roundRect(ctx, -22, -8, 44, 16, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(20,24,28,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(26, 0); ctx.stroke();
      ctx.restore();
      const bx = world.heli.bx == null ? world.heli.x : world.heli.bx;
      const by = world.heli.by == null ? world.heli.y + 70 : world.heli.by;
      const grd = ctx.createRadialGradient(bx, by, 8, bx, by, 90);
      grd.addColorStop(0, 'rgba(255,236,170,0.28)');
      grd.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(bx, by, 90, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < world.floaters.length; i++) {
      const f = world.floaters[i];
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    const night = world.biome.night || 0;
    const px = W / 2 + (world.player.x - world.camX) * zoom;
    const py = H / 2 + (world.player.y - world.camY) * zoom;
    if (world.heli.on) {
      const bx = world.heli.bx == null ? world.player.x : world.heli.bx;
      const by = world.heli.by == null ? world.player.y : world.heli.by;
      const lx = W / 2 + (bx - world.camX) * zoom;
      const ly = H / 2 + (by - world.camY) * zoom;
      const dark = ctx.createRadialGradient(lx, ly, 50 * zoom, lx, ly, Math.max(W, H) * 0.72);
      dark.addColorStop(0, 'rgba(255,230,150,0.08)');
      dark.addColorStop(0.25, 'rgba(4,6,12,0.08)');
      dark.addColorStop(1, 'rgba(4,6,12,0.72)');
      ctx.fillStyle = dark;
      ctx.fillRect(0, 0, W, H);
    } else if (night > 0) {
      const dark = ctx.createRadialGradient(px, py, 70 * zoom, px, py, 520 * zoom);
      dark.addColorStop(0, 'rgba(8,10,20,' + (night * 0.15) + ')');
      dark.addColorStop(1, 'rgba(8,10,20,' + night + ')');
      ctx.fillStyle = dark;
      ctx.fillRect(0, 0, W, H);
    }
    drawHud(ctx, W, H);
  }
  function drawHud(ctx, W, H) {
    const p = world.player;
    const frac = clamp(p.hp / p.maxHp, 0, 1);
    ctx.textAlign = 'left';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = 'rgba(6,8,16,0.62)';
    roundRect(ctx, 12, 12, 230, 108, 8); ctx.fill();
    ctx.fillStyle = '#ff5a6a';
    ctx.font = 'bold 12px sans-serif';
    let stars = '';
    const n = starCount(world.t);
    for (let i = 0; i < 5; i++) stars += i < n ? '★' : '☆';
    ctx.fillText('WANTED  ' + stars, 22, 32);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(clock(world.t), 22, 54);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#ffe03b';
    ctx.fillText('SCORE ' + Math.round(world.score), 110, 54);
    ctx.fillStyle = '#2a2038';
    ctx.fillRect(22, 64, 200, 8);
    ctx.fillStyle = frac > 0.35 ? '#7dff5a' : '#ff5a6a';
    ctx.fillRect(22, 64, 200 * frac, 8);
    ctx.fillStyle = '#d5deea';
    ctx.font = '12px sans-serif';
    ctx.fillText('Downs ' + world.downs + '   Near ' + world.near + '   Cash ' + world.cashN, 22, 90);
    ctx.fillText('Coins ' + world.coins + '/' + RULES.COIN_CAP + '   ' + (world.player.carId || ''), 22, 108);

    const mw = 132, mh = 132;
    const mx = W - mw - 14, my = 14;
    ctx.fillStyle = 'rgba(6,8,16,0.7)';
    ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 28);
    if (world.mini) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(world.mini, mx, my, mw, mh);
      ctx.imageSmoothingEnabled = true;
    }
    const dot = (x, y, color, rad) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx + (x / WORLD) * mw, my + (y / WORLD) * mh, rad, 0, 7);
      ctx.fill();
    };
    for (let i = 0; i < world.cash.length; i++) if (!world.cash[i].taken) dot(world.cash[i].x, world.cash[i].y, '#ffe03b', 1.6);
    for (let i = 0; i < world.cops.length; i++) if (!world.cops[i].dead) dot(world.cops[i].x, world.cops[i].y, '#ff4055', 2.2);
    if (world.heli.on) dot(world.heli.bx || world.heli.x, world.heli.by || world.heli.y, '#fff1b0', 2.4);
    dot(p.x, p.y, '#7dfff0', 2.6);
    ctx.fillStyle = '#ffb15a';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(threatName(world.t), W - 18, my + mh + 16);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '12px sans-serif';
    ctx.fillText(world.biome.name + '  ·  R restart  ·  Esc pause', 16, H - 16);
  }

  function readInput() {
    const I = RL.Input;
    if (!I) return { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false };
    const sens = (RL.settings && RL.settings.sensitivity) || 1;
    const steer = (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0);
    return {
      throttle: I.down('up') ? 1 : 0,
      brake: I.down('down') ? 1 : 0,
      steer: clamp(steer * sens, -1, 1),
      drift: !!I.down('drift'),
      nitro: !!I.down('nitro')
    };
  }
  function edgeRestart() {
    const down = !!(RL.Input && RL.Input.keys && RL.Input.keys.KeyR);
    const edge = down && !restartHeld;
    restartHeld = down;
    return edge;
  }
  function engine(speed, drift, nitro) {
    try {
      if (RL.Audio && RL.Audio.updateEngine) RL.Audio.updateEngine(clamp(speed, 0, 1), !!drift, !!nitro);
    } catch (e) { /* audio is best-effort */ }
  }
  function update(dt) {
    if (!world) return;
    const restart = edgeRestart() || world.wantRestart;
    world.wantRestart = false;
    if (restart && (world.phase === 'over' || !uiOpen())) {
      quickRestart();
      return;
    }
    if (world.phase === 'run' && RL.Input && RL.Input.hit('pause')) {
      if (uiOpen()) { if (RL.UI.back) RL.UI.back(); }
      else openPause();
    }
    if (world.phase !== 'run' || uiOpen()) { engine(0, false, false); return; }
    const before = world.player.nitro;
    step(world, dt, readInput());
    if (!world || world.phase !== 'run') { engine(0, false, false); return; }
    const sp = Math.hypot(world.player.vx, world.player.vy) / Math.max(1, world.player.spec.top);
    engine(sp, RL.Input && RL.Input.down('drift'), world.player.nitro < before);
  }
  function begin(cfg) {
    cfg = cfg || {};
    const e = profile();
    const carId = cfg.car || (e && CARS[e.selected] ? e.selected : 'alley');
    const map = cfg.map || (e && MAPS[e.lastMap] ? e.lastMap : 'city');
    world = create({ map: map, seed: cfg.seed, car: carId, holdRoster: cfg.holdRoster, noCops: cfg.noCops });
    try { if (RL.Audio && RL.Audio.startEngine) RL.Audio.startEngine(); } catch (err) { /* audio is best-effort */ }
  }
  function start(cfg) { begin(cfg || {}); }
  function stop() {
    world = null;
    try { if (RL.Audio && RL.Audio.stopEngine) RL.Audio.stopEngine(); } catch (e) { /* audio is best-effort */ }
  }
  function quickRestart() {
    if (!world) return;
    const map = world.mapId;
    const seed = (world.seed + 997) >>> 0;
    if (world.phase === 'run' && !world.settled) settle(world);
    try { if (RL.UI && RL.UI.closeAll) RL.UI.closeAll(); } catch (e) { /* panel already gone */ }
    begin({ map: map, seed: seed });
  }
  function openPause() {
    if (!RL.UI || !RL.UI.open) return;
    RL.UI.open({
      title: 'Paused',
      render: () => '<p>' + esc(world.biome.name) + ' · ' + esc(threatName(world.t)) + '</p><div class="grid2"><button class="primary" data-act="resume">Resume</button><button data-act="restart">Quick restart</button><button data-act="end">End run</button><button data-act="city">Back to city</button></div>',
      acts: {
        resume: () => RL.UI.closeAll(),
        restart: () => quickRestart(),
        end: () => { const sum = world.settled ? world.summary : settle(world); showResults(sum); },
        city: () => {
          if (world && !world.settled) settle(world);
          RL.UI.closeAll();
          if (RL.Game && RL.Game.toHub) RL.Game.toHub();
        }
      }
    });
  }
  function showResults(sum) {
    if (!sum || !RL.UI || !RL.UI.open) return;
    const map = MAPS[sum.map] || MAPS.city;
    RL.UI.open({
      title: 'Escape',
      noClose: true,
      cls: 'results',
      render: () => '<div class="headline">' + (sum.isBest ? 'NEW BEST' : 'WRECKED') + '</div>' +
        '<p>' + esc(map.name) + '</p>' +
        '<div class="rewards">' +
        '<div>Time <b>' + clock(sum.time) + '</b></div>' +
        '<div>Takedowns <b>' + sum.downs + '</b></div>' +
        '<div>Cash <b>' + sum.cash + '</b></div>' +
        '<div>Near misses <b>' + sum.near + '</b></div>' +
        '<div>Score <b>' + sum.score + '</b></div>' +
        '<div>Best <b>' + sum.best + '</b></div>' +
        '<div>Coins <b>+' + sum.coins + '</b></div>' +
        '<div>Daily bonus <b>' + money(sum.bonus) + '</b></div></div>' +
        '<p class="small">Escape coins stay in this mode. Career cash from Escape is capped at ' + money(RULES.DAILY_CAP) + ' a day.</p>' +
        '<div class="row"><button class="primary" data-act="again">Quick restart</button><button data-act="maps">Maps</button><button data-act="city">Back to city</button></div>',
      acts: {
        again: () => quickRestart(),
        maps: () => { RL.UI.closeAll(); openLobby(); },
        city: () => { RL.UI.closeAll(); if (RL.Game && RL.Game.toHub) RL.Game.toHub(); }
      }
    });
  }
  function openLobby() {
    const e = profile();
    if (!e || !RL.UI || !RL.UI.open) {
      if (RL.UI && RL.UI.toast) RL.UI.toast('Start a career first. Escape coins live on your save.');
      return;
    }
    if (!MAPS[lobby.map]) lobby.map = MAPS[e.lastMap] ? e.lastMap : 'city';
    RL.UI.open({
      title: 'Escape',
      cls: 'wide',
      render: () => {
        const wallet = profile();
        const dayRoom = Math.max(0, RULES.DAILY_CAP - ((wallet.daily.date === today()) ? wallet.daily.paid : 0));
        let h = '<p>You start wanted. Survive as long as you can. Pursuit cars carry momentum and turn wider than you do, so a late cut makes them miss. Health at zero ends the run.</p>';
        h += '<p class="small">Score is time, near misses, takedowns, and cash. Up to <b>' + RULES.COIN_CAP + '</b> Escape coins a run. Career bonus left today: <b>' + money(dayRoom) + '</b> of ' + money(RULES.DAILY_CAP) + '. Wallet: <b>' + wallet.coins + '</b> coins.</p>';
        h += '<h3>Maps</h3><div class="fp-tracks">';
        MAP_ORDER.forEach((id) => {
          const m = MAPS[id];
          const best = wallet.best[id] ? (' · best ' + wallet.best[id]) : '';
          h += '<button type="button" data-act="map" data-arg="' + id + '"' + (lobby.map === id ? ' class="on"' : '') + '>' + esc(m.name) + best + '</button>';
        });
        h += '</div><p class="small">' + esc(MAPS[lobby.map].blurb) + '</p>';
        h += '<h3>Cars</h3>';
        CAR_ORDER.forEach((id) => {
          const c = CARS[id];
          const owned = wallet.owned.indexOf(id) >= 0;
          const on = wallet.selected === id;
          h += '<div class="card"><div><span class="swatch" style="background:' + c.color + '"></span> <b>' + esc(c.name) + '</b>';
          h += '<div class="small">' + esc(c.blurb) + ' · top ' + c.top + ' · grip ' + c.grip + ' · hp ' + c.hp + '</div></div><div class="btns">';
          if (owned) h += '<button type="button" data-act="pick" data-arg="' + id + '"' + (on ? ' class="primary"' : '') + '>' + (on ? 'Driving' : 'Drive') + '</button>';
          else h += '<button type="button" data-act="buy" data-arg="' + id + '"' + (wallet.coins < c.cost ? ' disabled' : '') + '>Buy ' + c.cost + '</button>';
          h += '</div></div>';
        });
        h += '<div class="row"><button type="button" class="primary" data-act="start">Start run</button></div>';
        return h;
      },
      acts: {
        map: (id) => { if (MAPS[id]) lobby.map = id; },
        pick: (id) => {
          const wallet = profile();
          if (wallet && wallet.owned.indexOf(id) >= 0 && CARS[id]) { wallet.selected = id; persist(); }
        },
        buy: (id) => { if (!tryBuy(id).ok) sfx('error'); else sfx('coin'); },
        start: () => {
          const wallet = profile();
          if (!wallet || !RL.Game || !RL.Game.startRace) return;
          wallet.lastMap = lobby.map;
          persist();
          RL.Game.startRace({ kind: 'escape', map: lobby.map });
        }
      }
    });
  }
  function bindKeys() {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', (e) => {
      if (!world || e.code !== 'KeyR' || e.repeat) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      world.wantRestart = true;
    });
  }
  function bindTouch() {
    if (typeof document === 'undefined') return;
    const acts = document.querySelector('#touch .acts');
    if (!acts || document.getElementById('btn-escape-restart')) return;
    const b = document.createElement('button');
    b.id = 'btn-escape-restart';
    b.className = 't-escape';
    b.type = 'button';
    b.textContent = '↻';
    b.title = 'Restart';
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { if (RL.Audio && RL.Audio.init) RL.Audio.init(); } catch (err) { /* ignore */ }
      if (world) world.wantRestart = true;
    });
    acts.appendChild(b);
  }

  RL.EscapeSim = {
    create: create, step: step, integrate: integrate, makeCop: makeCop,
    MAPS: MAPS, CARS: CARS, COPS: COPS, RULES: RULES, roster: roster,
    TILE: TILE, N: N, solidTile: solidTile
  };
  RL.Escape = {
    ensureSave: ensureSave, openLobby: openLobby, start: start, update: update, draw: draw, stop: stop,
    bankRun: bankRun, applyDailyBonus: applyDailyBonus, noteBest: noteBest, tryBuy: tryBuy, profile: profile,
    quickRestart: quickRestart, RULES: RULES, CARS: CARS, MAPS: MAPS, CAR_ORDER: CAR_ORDER,
    _today: null,
    debug: {
      world: function () { return world; },
      kill: function () { if (world) world.player.hp = 0; },
      create: create,
      step: step
    }
  };
  if (RL.Modes && RL.Modes.register) RL.Modes.register('escape', RL.Escape);
  if (typeof document !== 'undefined') {
    bindKeys();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindTouch);
    else bindTouch();
  }
})();
