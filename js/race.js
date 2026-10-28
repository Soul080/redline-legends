/* race.js - Top-down racing: track building (Catmull-Rom splines), car physics
   with drifting/nitro/slipstream, AI with personalities & boss gimmicks,
   collisions, checkpoints/laps, side-event rules, particles, HUD and minimap. */
RL.Race = (function () {
  let R = null;              // current race state (null when not racing)
  const SAMPLE = 12;         // spline sample spacing in px
  const KMH = 0.55;          // px/s -> displayed km/h

  /* ================= TRACK ================= */
  function resolveDef(key) {
    if (key && typeof key === 'object' && key.pts) return key;
    if (typeof key === 'string') {
      if (RL.Tracks && RL.Tracks.resolve) {
        const d = RL.Tracks.resolve(key);
        if (d) return d;
      }
      if (RL.TRACKS[key]) return RL.TRACKS[key];
    }
    return null;
  }
  /* Closed Catmull-Rom loop. Sampling lives in RL.Tracks.sampleLoop so the editor,
     the validator, and the race share one spline (SAMPLE stays 12). */
  function buildTrack(key, reverse) {
    const def = resolveDef(key);
    if (!def || !def.pts || def.pts.length < 3) throw new Error('Unknown track: ' + (typeof key === 'string' ? key : (key && key.name) || '?'));
    if (!RL.Tracks || !RL.Tracks.sampleLoop) throw new Error('Track library failed to load');
    const sampled = def.open && RL.Tracks.sampleOpen ? RL.Tracks.sampleOpen(def.pts) : RL.Tracks.sampleLoop(def.pts, reverse);
    const pad = 320;
    const id = (typeof key === 'string' && key) || def.id || 'custom';
    const tr = {
      key: id, def, theme: RL.THEMES[def.theme] || RL.THEMES.city,
      pts: sampled.pts, N: sampled.N, len: sampled.len,
      width: def.width, grass: def.grass != null ? def.grass : 50,
      minX: sampled.minX - pad, minY: sampled.minY - pad,
      w: (sampled.maxX - sampled.minX) + pad * 2, h: (sampled.maxY - sampled.minY) + pad * 2,
      cps: sampled.cps, open: !!def.open, finishAt: sampled.finishAt || Math.max(1, sampled.N - 3)
    };
    prerender(tr);
    return tr;
  }

  /* Draw the static track once into an offscreen canvas */
  function prerender(tr) {
    const c = document.createElement('canvas'); c.width = Math.ceil(tr.w); c.height = Math.ceil(tr.h);
    const g = c.getContext('2d'), th = tr.theme;
    g.translate(-tr.minX, -tr.minY);
    g.fillStyle = th.bg; g.fillRect(tr.minX, tr.minY, tr.w, tr.h);
    // ground texture speckles
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
      g.fillRect(tr.minX + Math.random() * tr.w, tr.minY + Math.random() * tr.h, 3 + Math.random() * 6, 3 + Math.random() * 6);
    }
    const path = () => {
      g.beginPath(); tr.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      if (!tr.open) g.closePath();
    };
    g.lineJoin = 'round'; g.lineCap = 'round';
    const outer = tr.width + tr.grass * 2;
    const wallsOn = !tr.def || tr.def.walls !== false;
    if (wallsOn) {
      if (th.deco === 'neon') { g.shadowColor = th.wall; g.shadowBlur = 25; }
      path(); g.strokeStyle = th.wall; g.lineWidth = outer + 26; g.stroke();
      g.shadowBlur = 0;
    }
    if (tr.grass > 0) { path(); g.strokeStyle = th.off; g.lineWidth = outer; g.stroke(); }
    // curbs
    path(); g.strokeStyle = '#e8e8e8'; g.lineWidth = tr.width + 16; g.stroke();
    path(); g.strokeStyle = th.deco === 'neon' ? '#2ee6ff' : '#e0303a'; g.setLineDash([22, 22]); g.stroke(); g.setLineDash([]);
    path(); g.strokeStyle = th.road; g.lineWidth = tr.width; g.stroke();
    // centre line
    path(); g.strokeStyle = th.line; g.globalAlpha = 0.55; g.lineWidth = 4; g.setLineDash([30, 30]); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    // checkpoint markers (faint) + checkered start/finish line
    tr.cps.forEach((ci, k) => {
      const p = tr.pts[ci], hw = tr.width / 2;
      if (k === 0) {
        for (let j = -hw; j < hw; j += 10) for (let r = 0; r < 2; r++) {
          g.fillStyle = ((j / 10 + r) & 1) ? '#fff' : '#111';
          g.fillRect(p.x + p.nx * j + p.tx * r * 10 - 5, p.y + p.ny * j + p.ty * r * 10 - 5, 10, 10);
        }
      } else {
        g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(p.x + p.nx * hw, p.y + p.ny * hw); g.lineTo(p.x - p.nx * hw, p.y - p.ny * hw); g.stroke();
      }
    });
    // placed props on custom tracks; built-in circuits scatter scenery once per race
    if (Array.isArray(tr.def && tr.def.decorations)) {
      tr.def.decorations.forEach((d) => drawDeco(g, th, d.x, d.y, d.t));
    } else {
      const limit = outer / 2 + 45;
      for (let i = 0; i < 260; i++) {
        const x = tr.minX + Math.random() * tr.w, y = tr.minY + Math.random() * tr.h;
        let ok = true;
        for (let j = 0; j < tr.N; j += 2) { const p = tr.pts[j]; if ((p.x - x) ** 2 + (p.y - y) ** 2 < limit * limit) { ok = false; break; } }
        if (ok) drawDeco(g, th, x, y);
      }
    }
    tr.canvas = c; tr.g = g;
  }
  function drawDeco(g, th, x, y, kind) {
    const deco = kind || th.deco;
    const s = 0.7 + Math.random() * 0.8;
    if (deco === 'building') {
      const w = 40 * s + 20, h = 40 * s + 20;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 6, y + 6, w, h);
      g.fillStyle = RL.pick(['#3b4458', '#4a3b58', '#2f4a4f', '#585040']); g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,230,120,0.5)';
      for (let i = 6; i < w - 6; i += 10) for (let j = 6; j < h - 6; j += 10) if (Math.random() < 0.4) g.fillRect(x + i, y + j, 4, 4);
    } else if (deco === 'cactus') {
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(x + 6, y + 6, 14 * s, 10 * s, 0, 0, 7); g.fill();
      g.fillStyle = Math.random() < 0.5 ? '#3f8a3a' : '#8a6a45';
      g.beginPath(); g.arc(x, y, 10 * s, 0, 7); g.fill();
      g.fillStyle = '#5fb04f'; g.beginPath(); g.arc(x - 2, y - 2, 4 * s, 0, 7); g.fill();
    } else if (deco === 'pine') {
      g.fillStyle = 'rgba(0,0,0,0.15)'; g.beginPath(); g.arc(x + 6, y + 6, 18 * s, 0, 7); g.fill();
      g.fillStyle = '#2c5a45'; g.beginPath(); g.arc(x, y, 18 * s, 0, 7); g.fill();
      g.fillStyle = '#f2f7ff'; g.beginPath(); g.arc(x - 4, y - 4, 8 * s, 0, 7); g.fill();
    } else if (deco === 'rock') {
      g.fillStyle = '#6d6258'; g.beginPath(); g.ellipse(x, y, 16 * s, 10 * s, 0, 0, 7); g.fill();
    } else if (deco === 'lamp') {
      g.strokeStyle = '#ffe03b'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 28 * s); g.stroke();
      g.fillStyle = '#ffe03b'; g.beginPath(); g.arc(x, y - 32 * s, 6 * s, 0, 7); g.fill();
    } else {
      g.shadowColor = RL.pick(['#ff2ef0', '#2ee6ff', '#ffe03b']); g.shadowBlur = 18;
      g.fillStyle = g.shadowColor; g.fillRect(x, y, 30 * s, 6); g.fillRect(x, y + 14, 18 * s, 4);
      g.shadowBlur = 0;
    }
  }

  /* ================= CARS ================= */
  function physFromStats(st) {
    return {
      maxSpeed: 230 + st.topSpeed * 3.4, accel: 160 + st.accel * 2.8, turn: 2.3 + st.handling * 0.02,
      grip: 4.5 + st.grip * 0.06, nitroPower: 1.28 + st.nitro * 0.0035, dmgMult: Math.max(0.35, 1.5 - st.durability * 0.009)
    };
  }
  function makeCar(o) {
    return Object.assign({
      x: 0, y: 0, h: 0, vx: 0, vy: 0, idx: 0, lapsDone: -1, nextCp: 0, finished: false, finishTime: 0,
      lapStart: 0, bestLap: 0, nitro: 30, nitroOn: false, drifting: false, driftCur: 0, driftT: 0, damage: 0,
      steer: 0, boostT: 0, lat: 0, offroad: false, drafting: false, stuckT: 0, eliminated: false, ghost: false, speed: 0,
      cpIdx: 0, timePen: 0, wrecked: false, invuln: 0
    }, o);
  }
  function aheadPt(tr, idx, k) {
    const N = tr.N;
    const i = tr.open ? Math.max(0, Math.min(N - 1, (idx || 0) + k)) : (((idx || 0) + k) % N + N) % N;
    return tr.pts[i];
  }
  function placeOnGrid(car, slot) {
    const tr = R.track, row = Math.floor(slot / 2), col = slot % 2;
    const side = (col ? 1 : -1) * tr.width * 0.22;
    if (tr.open) {
      const p = tr.pts[0];
      const back = 28 + row * 36;
      car.x = p.x - p.tx * back + p.nx * side;
      car.y = p.y - p.ty * back + p.ny * side;
      car.h = Math.atan2(p.ty, p.tx);
      car.idx = 0;
      return;
    }
    let i = (tr.N - 4 - row * 6 + tr.N) % tr.N;
    if (i < 0) i += tr.N;
    const p = tr.pts[i];
    car.x = p.x + p.nx * side; car.y = p.y + p.ny * side; car.h = Math.atan2(p.ty, p.tx); car.idx = i;
  }

  /* ================= START ================= */
  function start(cfg) {
    const G = RL.Game, S = G.state;
    cfg.laps = cfg.laps || 3;
    cfg.league = cfg.league || S.league;
    const L = G.leagueData(cfg.league);
    const track = buildTrack(cfg.trackDef || cfg.track, cfg.reverse);
    const weather = RL.WEATHER[cfg.weather || 'clear'], time = RL.TIMES[cfg.time || 'day'];
    R = { cfg, track, L, weather, time, t: -3.5, cars: [], particles: [], fx: [], shake: 0, msgs: [], paused: false,
      ended: false, endTimer: 0, finishOrder: [], elimCount: 0, ghostRec: [], recT: 0, startBoostChecked: false,
      stats: { wallHits: 0, carHits: 0, nitroTime: 0, draftTime: 0, topSpeed: 0, drift: 0, cleanLaps: 0, lapHit: false, wasLast: false } };
    // player
    const pc = G.currentCar(), pst = G.carStats(pc);
    const player = makeCar({ isPlayer: true, name: S.name, color: G.carColor(pc), p: physFromStats(pst), damage: RL.clamp(pc.damage, 0, 100), startDamage: RL.clamp(pc.damage, 0, 100), carId: pc.id, cls: G.carDef(pc.id).cls });
    if (cfg.kind === 'testdrive') player.damage = 0;
    if (cfg.nitro === false) player.nitro = 0;
    else if (RL.hasPerk('double_tank')) player.nitro = 100;
    R.player = player;
    const customAI = cfg.kind === 'custom' ? RL.clamp(cfg.aiCount | 0, 0, 11) : (cfg.kind === 'drag' ? 1 : null);
    const solo = ['timetrial', 'drift', 'training', 'ghost', 'testdrive'].includes(cfg.kind) || customAI === 0;
    R.cars.push(player);
    R.tauntCount = 0; R.tauntLock = 0; R.banterOpen = false; R.finalBanter = false;
    const diff = RL.difficulty();
    R.difficulty = diff.id;
    if (cfg.multiplayer && cfg.roster && RL.Net) {
      RL.Net.fillField(R, player, { makeCar: makeCar, placeOnGrid: placeOnGrid });
    } else if (!solo) {
      /* League and boss grids use the story crew as competitive rivals.
         Free Play uses the same driving AI, scaled by its own ladder AND the
         Settings difficulty (Easy / Normal / Hard / Legend). */
      const count = customAI == null ? 5 : customAI;
      const fp = cfg.kind === 'custom';
      const useDiff = fp ? freePlayScale(cfg.difficulty) : diff;
      /* League and boss grids use pickRivals so the difficulty curve stays the
         competitive one. Free Play prefers the story crew, still on that AI. */
      const roster = fp
        ? crewRoster(L.id, cfg.league, Math.max(count, 5))
        : (RL.pickRivals ? RL.pickRivals(L.id, count) : crewRoster(L.id, cfg.league, count));
      let pool = null;
      if (fp) {
        pool = (RL.Tracks && RL.Tracks.classPool ? RL.Tracks.classPool(cfg.classes) : RL.CARS.map((c) => c.id)).slice();
        pool.sort(() => Math.random() - 0.5);
      }
      for (let i = 0; i < count; i++) {
        const isBoss = cfg.kind === 'boss' && i === 0;
        const rival = roster[i % roster.length];
        const bossAi = isBoss ? L.boss.ai : null;
        const pers = isBoss ? (bossAi.pers || 'aggressive') : rival.pers;
        const defId = isBoss ? L.boss.car : (pool ? pool[i % pool.length] : pickAiCar(L.cars, pers));
        const def = G.carDef(defId), st = {};
        const bonus = isBoss ? bossAi.bonus : (fp ? useDiff.bonus : L.aiBonus);
        for (const k in def.s) st[k] = def.s[k] + bonus + (isBoss || fp ? 0 : Math.round(RL.rand(-1, 1)));
        const profile = rollProfile(isBoss ? bossAi : rival, isBoss ? 0.03 : (fp ? 0.05 : 0.08));
        /* Free Play stores the ladder skill (Elite ≈ 1.05) times Settings difficulty.
           League races stay on the 0–1 driving scale. */
        const drive = fp
          ? RL.clamp(useDiff.skill * RL.rand(0.97, 1.02), 0.4, 1.45)
          : RL.clamp((isBoss ? bossAi.skill : L.ai + (rival.skill || 0)) * useDiff.skill, 0.32, 1);
        const pace = (isBoss ? bossAi.pace : (fp ? 1 : L.pace)) * useDiff.pace * (isBoss ? RL.rand(0.995, 1.008) : RL.rand(0.985, 1.015));
        const p = physFromStats(st);
        p.maxSpeed *= pace; p.accel *= 0.9 + pace * 0.12;
        p.turn *= 0.96 + drive * 0.08;
        const lines = isBoss ? L.boss.taunts : rival.taunts;
        R.cars.push(makeCar({
          name: isBoss ? L.boss.name : rival.name, color: isBoss ? L.boss.color : def.color, p,
          skill: drive, drive, mistakeScale: useDiff.mistake * (isBoss ? 0.65 : 1), rubber: useDiff.rubber, pace,
          carId: defId, cls: def.cls,
          ai: makeAiState(pers, profile, lines), boss: isBoss ? L.boss.gimmick : null,
          nitro: cfg.nitro === false ? 0 : (isBoss ? 70 : 46)
        }));
      }
      if (fp) R.cars.forEach((c, i) => placeOnGrid(c, i));
      else {
        const order = R.cars.slice(1);
        order.splice(cfg.kind === 'elimination' ? 2 : Math.min(5, order.length), 0, player);
        if (cfg.kind === 'boss' && R.cars[1]) { order.splice(order.indexOf(R.cars[1]), 1); order.unshift(R.cars[1]); }
        order.forEach((c, i) => placeOnGrid(c, i));
      }
    } else placeOnGrid(player, 0);
    if (cfg.kind === 'ghost') {
      const gh = loadGhost(cfg);
      const gst = { topSpeed: 58 + L.aiBonus, accel: 58 + L.aiBonus, handling: 66, grip: 64, nitro: 50, durability: 60 };
      const gp = physFromStats(gst); gp.maxSpeed *= L.pace * diff.pace; gp.accel *= L.pace * diff.pace;
      const ghost = makeCar({ name: gh ? 'Your Ghost' : 'Pro Ghost', color: '#bfe9ff', ghost: true, replay: gh ? gh.frames : null, replayTime: gh ? gh.total : 0, p: gp, skill: L.ai, drive: RL.clamp(L.ai * diff.skill + 0.04, 0.4, 1), mistakeScale: diff.mistake, rubber: diff.rubber, ai: makeAiState('clean', rollProfile(RL.PERSONALITIES.clean, 0.02), null) });
      placeOnGrid(ghost, 1); R.cars.push(ghost);
    }
    R.cars.forEach((c) => { c.cpIdx = track.cps[0]; });
    if (cfg.kind === 'timetrial') R.par = (track.len * cfg.laps) / (220 + cfg.league * 30);
    if (cfg.kind === 'drift') R.driftTarget = 2000 + cfg.league * 1000;
    // minimap transform
    const mm = 170; R.mmScale = Math.min(mm / track.w, (mm * 0.8) / track.h);
    // weather particles (screen space)
    R.weatherP = [];
    if (cfg.weather === 'rain' || cfg.weather === 'snow' || cfg.weather === 'dust') for (let i = 0; i < 160; i++) R.weatherP.push({ x: Math.random(), y: Math.random(), s: Math.random() });
    R.cam = { x: player.x, y: player.y };
    RL.Audio.startEngine();
    msg(cfg.title || track.def.name, 2.5, '#2ee6ff');
    if (cfg.kind === 'boss') msg('BOSS: ' + L.boss.name + ' - ' + L.boss.desc, 4, L.boss.color);
    if (weather.grip < 1) msg(weather.name + ': reduced grip!', 3, '#3fa9ff');
    if (cfg.kind === 'custom' || cfg.kind === 'testdrive') {
      const bits = [];
      if (cfg.reverse) bits.push('reverse');
      if (cfg.damage === false) bits.push('no damage');
      if (cfg.nitro === false) bits.push('no nitro');
      if (cfg.collision === false) bits.push('no collision');
      if (cfg.kind === 'custom' && cfg.catchup === false) bits.push('no catch-up');
      if (cfg.kind === 'custom' && cfg.classes && cfg.classes.length) bits.push(cfg.classes.join(' / '));
      if (bits.length) msg(bits.join(' · '), 3.2, '#ffe03b');
    }
  }
  function stop() { if (R) RL.Audio.stopEngine(); R = null; }
  function msg(text, dur, color) { if (R) R.msgs.push({ text, t: dur || 2, color: color || '#fff' }); }

  /* ================= GHOSTS ================= */
  function ghostKey(cfg) { return cfg.track + (cfg.reverse ? '_r' : ''); }
  function loadGhost(cfg) {
    try { const all = JSON.parse(localStorage.getItem(RL.GHOST_KEY) || '{}'); return all[ghostKey(cfg)] || null; } catch (e) { return null; }
  }
  function saveGhost(cfg, frames, total) {
    try {
      const all = JSON.parse(localStorage.getItem(RL.GHOST_KEY) || '{}'), k = ghostKey(cfg);
      if (!all[k] || total < all[k].total) { all[k] = { total, frames }; localStorage.setItem(RL.GHOST_KEY, JSON.stringify(all)); return true; }
    } catch (e) { }
    return false;
  }

  /* ================= TRACK QUERIES ================= */
  function updateTrackPos(c) {
    const tr = R.track, N = tr.N;
    let best = 1e18, bi = c.idx || 0;
    if (tr.open) {
      const from = Math.max(0, bi - 10), to = Math.min(N - 1, bi + 28);
      for (let i = from; i <= to; i++) {
        const p = tr.pts[i], d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
        if (d < best) { best = d; bi = i; }
      }
    } else {
      for (let k = -12; k <= 30; k++) {
        const i = (c.idx + k + N) % N, p = tr.pts[i], d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
        if (d < best) { best = d; bi = i; }
      }
    }
    c.idx = bi;
    const p = tr.pts[bi];
    c.lat = (c.x - p.x) * p.nx + (c.y - p.y) * p.ny;
    if (tr.open) {
      if (bi >= (tr.finishAt || N - 3) && (c.lapsDone || 0) < (R.cfg.laps || 1)) {
        c.lapsDone = R.cfg.laps || 1;
        lapCompleted(c);
      }
      c.progress = c.finished ? 1e9 - c.finishTime : bi;
      return;
    }
    // checkpoint / lap logic
    const win = Math.floor(N * 0.12);
    if (c.nextCp === 0) {
      if (bi < win) {
        c.cpIdx = tr.cps[0];
        c.lapsDone++; c.nextCp = 1;
        if (c.lapsDone > 0) lapCompleted(c);
      }
    } else {
      const cpi = tr.cps[c.nextCp];
      if (bi >= cpi && bi < cpi + win) { c.cpIdx = cpi; c.nextCp = (c.nextCp + 1) % 4; }
    }
    let rel = bi;
    if (c.nextCp === 1 && bi > N / 2) rel -= N;
    c.progress = c.finished ? 1e9 - c.finishTime : c.lapsDone * N + rel;
  }
  function lapCompleted(c) {
    const lapTime = R.t - c.lapStart; c.lapStart = R.t;
    if (!c.bestLap || lapTime < c.bestLap) c.bestLap = lapTime;
    if (c.isPlayer) {
      if (!R.stats.lapHit) R.stats.cleanLaps++;
      R.stats.lapHit = false;
      if (c.lapsDone < R.cfg.laps) msg(c.lapsDone === R.cfg.laps - 1 ? 'FINAL LAP!' : 'Lap ' + (c.lapsDone + 1), 1.6, '#ffe03b');
    }
    if (c.lapsDone >= R.cfg.laps && !c.finished) {
      c.finished = true; c.finishTime = R.t; R.finishOrder.push(c);
      if (c.isPlayer) {
        msg('FINISH!', 3, '#7dff5a');
        // Online results are shared, so wait for the host instead of ending locally.
        if (R.cfg.multiplayer && RL.Net) RL.Net.onLocalFinish(c);
        else { R.ended = true; R.endTimer = 2.2; }
      }
    }
    // elimination: when the leader completes a lap, drop last place
    if (R.cfg.kind === 'elimination') {
      const leaderLaps = Math.max(...R.cars.filter((x) => !x.eliminated).map((x) => x.lapsDone));
      if (leaderLaps === c.lapsDone && c.lapsDone > R.elimCount && c.lapsDone < R.cfg.laps) {
        R.elimCount = c.lapsDone;
        const alive = standings().filter((x) => !x.eliminated);
        const last = alive[alive.length - 1];
        if (last && alive.length > 1) {
          last.eliminated = true; last.elimPos = alive.length;
          msg(last.name + ' ELIMINATED!', 2.5, '#ff3b6b');
          if (last.isPlayer) { R.ended = true; R.endTimer = 2; }
        }
      }
    }
  }
  function standings() {
    return R.cars.filter((c) => !c.ghost || R.cfg.kind === 'ghost').slice().sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      if (a.eliminated && b.eliminated) return a.elimPos - b.elimPos;
      return b.progress - a.progress;
    });
  }

  /* ================= PHYSICS ================= */
  function driverMods() {
    const st = RL.Game.state.stats;
    return {
      steerResp: 6 + st.reflexes * 0.6 * (RL.hasPerk('quick_hands') ? 1.12 : 1),
      startWindow: 0.25 + st.reflexes * 0.02,
      driftGrip: 1.4 + st.control * 0.09,
      driftCharge: (16 + st.control * 1.5) * (RL.hasPerk('drift_king') ? 1.3 : 1),
      crashKeep: 0.45 + st.nerve * 0.022,
      dmgTake: Math.max(0.15, (1 - RL.clamp(st.nerve, 1, 20) * 0.02) * (RL.hasPerk('thick_skin') ? 0.7 : 1)),
      nitroBurn: 34 * (1 - st.tactics * 0.02) * (RL.hasPerk('nitro_saver') ? 0.8 : 1),
      draft: (1 + st.tactics * 0.03) * (RL.hasPerk('draft_master') ? 1.6 : 1)
    };
  }
  const AI_MODS = { steerResp: 9, driftGrip: 2.5, driftCharge: 15, crashKeep: 0.6, dmgTake: 0.5, nitroBurn: 30, draft: 1 };
  function aiMods(c) {
    const s = c.drive != null ? c.drive : 0.75;
    const drift = (c.ai && c.ai.profile && c.ai.profile.drift) || 0.3;
    return {
      steerResp: 5.5 + s * 7,
      driftGrip: 1.5 + s * 1.55,
      driftCharge: (8 + s * 12) * (0.6 + drift),
      crashKeep: 0.5 + s * 0.2,
      dmgTake: 0.48,
      nitroBurn: 34 - s * 6,
      draft: 1.1
    };
  }

  function stepCar(c, inp, dt) {
    const tr = R.track, M = c.isPlayer ? R.mods : aiMods(c), P = c.p;
    const fx = Math.cos(c.h), fy = Math.sin(c.h), rx = -fy, ry = fx;
    let vf = c.vx * fx + c.vy * fy, vl = c.vx * rx + c.vy * ry;
    // speed limit modifiers
    const dmgOn = R.cfg.damage !== false;
    const nitroOnAllowed = R.cfg.nitro !== false;
    let maxS = P.maxSpeed * (1 - (dmgOn ? c.damage * 0.0025 : 0)) * (c.speedMult || 1), acc = P.accel;
    if (c.isPlayer) {
      if (RL.hasPerk('gear_master')) maxS *= 1.04;
      if (RL.hasPerk('reflex_god')) acc *= 1.06;
      if (RL.hasPerk('comeback_king') && R.playerPos > R.cars.length / 2) maxS *= 1.07;
    }
    if (c.drafting) maxS *= 1 + 0.06 * M.draft;
    if (c.offroad) { const k = c.isPlayer && RL.hasPerk('smooth_operator') ? 0.73 : 0.55; maxS *= k; vf -= vf * 0.6 * dt * (1 - k); }
    if (c.boostT > 0) { c.boostT -= dt; maxS *= 1.12; acc *= 1.8; }
    // nitro
    const wantN = nitroOnAllowed && inp.nitro && c.nitro > 1;
    if (wantN && !c.nitroOn && c.isPlayer) RL.Audio.play('nitro');
    c.nitroOn = wantN;
    if (c.nitroOn) { maxS *= P.nitroPower; acc *= 1.9; c.nitro -= M.nitroBurn * dt; if (c.isPlayer) R.stats.nitroTime += dt; }
    // throttle / brake
    if (inp.throttle) { if (vf < maxS) vf = Math.min(maxS, vf + acc * dt * (1.15 - Math.max(0, vf) / maxS)); }
    if (vf > maxS) vf -= (vf - maxS) * 1.8 * dt;
    if (inp.brake) {
      const bp = 520 * (c.isPlayer && RL.hasPerk('late_braker') ? 1.35 : 1);
      if (vf > 15) vf -= bp * dt; else vf = Math.max(-130, vf - 220 * dt);
    }
    if (!inp.throttle && !inp.brake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 70 * dt);
    vf -= vf * 0.04 * dt;
    // steering (smoothed by Reflexes)
    c.steer += (inp.steer - c.steer) * Math.min(1, M.steerResp * dt);
    const av = Math.abs(vf);
    const speedF = RL.clamp(av / 110, 0, 1) * (1 - RL.clamp((av - 380) / 700, 0, 0.3));
    c.h += c.steer * P.turn * speedF * (vf < 0 ? -1 : 1) * (c.drifting ? 1.3 : 1) * dt;
    // grip: weather + handbrake drift
    let wg = R.weather.grip; if (c.isPlayer && RL.hasPerk('grip_lord')) wg = 1 - (1 - wg) / 2;
    let g = P.grip * wg;
    if (inp.drift && av > 90) { g = M.driftGrip * (0.6 + wg * 0.4); vf -= 35 * dt * Math.sign(vf); }
    vl -= vl * Math.min(1, g * dt);
    const wasDrift = c.drifting;
    c.drifting = Math.abs(vl) > 55 && av > 110;
    if (c.drifting) {
      c.driftT += dt;
      if (nitroOnAllowed) c.nitro = Math.min(100, c.nitro + M.driftCharge * dt);
      const pts = Math.abs(vl) * dt * 0.6 * (c.isPlayer && RL.hasPerk('zen_drift') ? 1.5 : 1);
      c.driftCur += pts;
      if (Math.random() < 0.7) smoke(c);
      if (Math.random() < 0.5) skid(c);
    } else if (wasDrift) {
      if (c.isPlayer) {
        if (c.driftCur > 30) { R.stats.drift += c.driftCur; R.fx.push({ text: '+' + Math.round(c.driftCur) + ' DRIFT', t: 1.2, color: '#ff2ef0' }); }
        if (c.driftT > 1 && RL.hasPerk('counter_steer')) c.boostT = 0.7;
      }
      c.driftCur = 0; c.driftT = 0;
    }
    c.vx = fx * vf + rx * vl; c.vy = fy * vf + ry * vl;
    c.x += c.vx * dt; c.y += c.vy * dt;
    c.speed = Math.hypot(c.vx, c.vy);
    if (c.nitroOn) flame(c);
    // track boundaries
    updateTrackPos(c);
    const hw = tr.width / 2, lim = hw + tr.grass;
    const wallsOn = !tr.def || tr.def.walls !== false;
    c.offroad = Math.abs(c.lat) > hw;
    if (c.offroad && c.speed > 80 && Math.random() < 0.3) dust(c);
    if (wallsOn && Math.abs(c.lat) > lim) {
      const p = tr.pts[c.idx], s = Math.sign(c.lat), over = Math.abs(c.lat) - lim;
      c.x -= p.nx * s * over; c.y -= p.ny * s * over;
      const vn = (c.vx * p.nx + c.vy * p.ny) * s;
      if (vn > 0) {
        c.vx -= p.nx * s * vn * 1.35; c.vy -= p.ny * s * vn * 1.35;
        const keep = c.isPlayer && RL.hasPerk('iron_will') ? (1 + M.crashKeep) / 2 + 0.2 : M.crashKeep;
        const loss = RL.clamp(vn / 400, 0, 1) * (1 - keep);
        c.vx *= 1 - loss; c.vy *= 1 - loss;
        if (vn > 90) {
          if (dmgOn) c.damage = Math.min(100, c.damage + vn * 0.03 * P.dmgMult * M.dmgTake);
          sparks(c.x + p.nx * s * 12, c.y + p.ny * s * 12, vn);
          if (c.isPlayer) {
            R.stats.wallHits++; R.stats.lapHit = true;
            if (RL.settings.shake) R.shake = Math.min(18, R.shake + vn / 30);
            RL.Audio.play('crash', vn / 500);
          }
        }
      }
    }
  }

  /* ================= AI =================
     Racing line (outside-inside-outside), distance-based braking, drift to rotate
     and fill nitro, then tactical passes: draft → slingshot, dive-bombs, blocks.
     Personalities change the numbers; each rival is jittered once per race.
     Rubber-banding is a small catch-up only — leaders are never slowed. */
  function angDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }
  /* Free Play ladder times the Settings difficulty, so both controls change the field. */
  function freePlayScale(index) {
    const settings = RL.difficulty();
    const ladder = [
      { pace: 0.90, skill: 0.82, mistake: 1.55, rubber: 1.2, bonus: -6 },
      { pace: 0.97, skill: 0.94, mistake: 1.1, rubber: 1.05, bonus: 0 },
      { pace: 1.02, skill: 1.02, mistake: 0.85, rubber: 0.9, bonus: 6 },
      { pace: 1.08, skill: 1.05, mistake: 0.55, rubber: 0.7, bonus: 12 },
      { pace: 1.13, skill: 1.16, mistake: 0.32, rubber: 0.45, bonus: 18 }
    ];
    const step = ladder[RL.clamp(index | 0, 0, ladder.length - 1)] || ladder[2];
    return {
      id: settings.id,
      pace: step.pace * settings.pace,
      skill: step.skill * settings.skill,
      mistake: step.mistake * settings.mistake,
      rubber: step.rubber * settings.rubber,
      bonus: step.bonus
    };
  }
  /* Story crew first (the people you meet at the bar), then other named rivals. */
  function crewRoster(leagueId, storyLeague, n) {
    const byName = {};
    (RL.RIVALS || []).forEach((r) => { byName[r.name] = r; });
    const out = [];
    const crew = (RL.CREW && RL.CREW[storyLeague]) || [];
    crew.forEach((name) => {
      if (out.length >= n) return;
      if (byName[name] && !out.some((r) => r.name === name)) out.push(byName[name]);
    });
    if (out.length < n && RL.pickRivals) {
      RL.pickRivals(leagueId, n).forEach((r) => {
        if (out.length < n && r && !out.some((x) => x.name === r.name)) out.push(r);
      });
    }
    return out.length ? out : (RL.pickRivals ? RL.pickRivals(leagueId, n) : []);
  }
  function pickAiCar(ids, pers) {
    let total = 0;
    const weights = ids.map((id) => {
      const s = RL.Game.carDef(id).s;
      let w = 1;
      if (pers === 'nitro') w += s.nitro / 80;
      else if (pers === 'aggressive') w += s.durability / 90;
      else w += s.handling / 80;
      total += w; return w;
    });
    let r = RL.rand(0, total);
    for (let i = 0; i < ids.length; i++) { r -= weights[i]; if (r <= 0) return ids[i]; }
    return ids[ids.length - 1];
  }
  function rollProfile(src, amt) {
    const a = amt == null ? 0.08 : amt;
    const base = src || RL.PERSONALITIES.clean;
    const j = (v, lo, hi) => RL.clamp((v == null ? 0.4 : v) + (a ? RL.rand(-a, a) : 0), lo, hi);
    return {
      skill: base.skill || 0,
      aggression: j(base.aggression, 0, 1),
      risk: j(base.risk, 0, 1),
      drift: j(base.drift, 0, 1),
      nitro: j(base.nitro != null ? base.nitro : base.nitroUse, 0, 1),
      pride: j(base.pride, 0, 1),
      mistake: j(base.mistake == null ? 0.2 : base.mistake, 0.02, 1),
      line: RL.clamp((base.line || 0) + (a ? RL.rand(-a * 1.5, a * 1.5) : 0), -1, 1),
      nitroSave: RL.clamp((base.nitroSave != null ? base.nitroSave : 0.4) + (a ? RL.rand(-a, a) : 0), 0, 1)
    };
  }
  function makeAiState(pers, profile, lines) {
    const p = profile || rollProfile(RL.PERSONALITIES[pers] || RL.PERSONALITIES.clean, 0);
    return {
      pers: pers || 'clean', profile: p, lines: lines || null,
      off: 0, bossOff: 0, plan: 'race', planT: 0, cool: 0, prideT: 0,
      mistakeT: 0, mistake: null, mistakeSide: RL.rand(0, 1) < 0.5 ? -1 : 1,
      tauntAt: 0, draftT: 0, forceNitro: 0, brakeHold: 0, inited: false, playerAhead: false,
      side: RL.rand(0, 1) < 0.5 ? -1 : 1
    };
  }
  function taunt(c, key) {
    if (!c.ai || !c.ai.lines || !c.ai.lines[key] || c.ghost || R.t < 0) return false;
    if (R.tauntLock > R.t || c.ai.tauntAt > R.t) return false;
    const lines = c.ai.lines[key];
    const line = lines[Math.floor(RL.rand(0, lines.length))];
    msg(c.name.split('(')[0].trim() + ': ' + line, 2.15, c.color || '#fff');
    R.tauntLock = R.t + 6.2;
    c.ai.tauntAt = R.t + 13;
    R.tauntCount = (R.tauntCount || 0) + 1;
    return true;
  }
  function scanTrack(c) {
    const tr = R.track, N = tr.N, seg = tr.len / N;
    const look = RL.clamp(Math.round(7 + (Math.max(100, c.speed) / seg) * 0.5), 8, 40);
    const horizon = Math.min(N - 2, Math.round(look * 1.7));
    let peak = 0, peakSign = 0, peakAt = look;
    for (let k = 2; k <= horizon; k += 2) {
      const q = aheadPt(tr, c.idx, k), a = Math.abs(q.curv);
      if (a > peak) { peak = a; peakSign = Math.sign(q.curv) || peakSign; peakAt = k; }
    }
    const here = Math.abs(tr.pts[c.idx].curv);
    let phase = 'straight';
    if (peak >= 0.11) {
      if (peakAt > look * 0.62) phase = 'entry';
      else if (peakAt > 5) phase = 'apex';
      else phase = 'exit';
    }
    return { seg, look, peak, peakSign: peakSign || 1, peakAt, here, phase };
  }
  function cornerTarget(c, curv) {
    const sev = RL.clamp(curv / 0.8, 0, 1);
    const keep = 0.48 + c.drive * 0.28;
    let safe = c.p.maxSpeed * (1 - sev * (1 - keep));
    safe *= 0.6 + R.weather.grip * 0.4;
    safe *= RL.clamp(0.94 + (c.p.grip - 6) * 0.02, 0.9, 1.06);
    return safe;
  }
  function openSide(c, other, scan) {
    const tr = R.track;
    let side = other ? -Math.sign(other.lat || c.ai.side || 1) : (c.ai.profile.line >= 0 ? 1 : -1);
    if (!side) side = 1;
    if (c.lat * side > tr.width * 0.22) side = -side;
    if (scan && scan.peak > 0.22 && scan.phase !== 'exit' && c.ai.profile.risk > 0.55) side = scan.peakSign;
    return side || 1;
  }
  function nearestCars(c) {
    let ahead = null, behind = null, ag = 1e9, bg = 1e9;
    for (let i = 0; i < R.cars.length; i++) {
      const o = R.cars[i];
      if (o === c || o.eliminated || o.ghost) continue;
      const gap = o.progress - c.progress;
      if (gap > 0.5 && gap < ag && gap < 46) { ag = gap; ahead = o; }
      if (gap < -0.5 && -gap < bg && -gap < 34) { bg = -gap; behind = o; }
    }
    return { ahead, behind, ag, bg };
  }
  function considerPlan(c, dt, scan, near) {
    const ai = c.ai, p = ai.profile, tr = R.track;
    if (ai.planT > 0) ai.planT -= dt;
    if (ai.cool > 0) ai.cool -= dt;
    if (ai.prideT > 0) ai.prideT -= dt;
    if (c.drafting && near.ahead && near.ag < 18) ai.draftT += dt; else ai.draftT = Math.max(0, ai.draftT - dt * 2);
    if (ai.plan !== 'race' && ai.planT > 0) return;
    ai.plan = 'race';
    if (ai.cool > 0 || R.t < 2) return;
    if (ai.prideT > 1 && p.pride > 0.55 && near.ahead && near.ag < 20) {
      ai.plan = p.aggression > 0.65 ? 'bump' : (p.nitro > 0.7 ? 'sling' : 'pass');
      ai.planT = 1.15; ai.side = openSide(c, near.ahead, scan); ai.cool = 1.3; return;
    }
    if (ai.draftT > 0.6 && c.nitro > 32 && scan.peak < 0.18 && p.risk > 0.22) {
      ai.plan = 'sling'; ai.planT = 1.2; ai.cool = 2.4; ai.side = openSide(c, near.ahead, scan); return;
    }
    if (near.ahead && near.ag < 13 && near.ag > 1.2 && scan.peak > 0.24 && scan.phase !== 'exit' && p.risk > 0.58 && RL.rand(0, 1) < 0.004 + p.risk * 0.004) {
      ai.plan = 'dive'; ai.planT = 1.25; ai.cool = 2.6; ai.side = scan.peakSign; return;
    }
    if (near.ahead && near.ag < 20 && scan.phase === 'straight' && scan.peak < 0.15 && c.speed + 10 > near.ahead.speed * 0.92) {
      ai.plan = 'pass'; ai.planT = 1.5; ai.cool = 1.1; ai.side = openSide(c, near.ahead, scan); return;
    }
    if (near.behind && near.bg < 13 && scan.phase !== 'apex' && (p.aggression > 0.62 || c.boss === 'blocker' || c.boss === 'phantom')) {
      const alongside = near.bg < 5 && Math.abs((near.behind.lat || 0) - c.lat) < tr.width * 0.35;
      ai.plan = alongside && p.aggression > 0.7 ? 'bump' : 'block';
      ai.planT = 0.85 + p.aggression * 0.45; ai.cool = 1.5;
      if (near.behind.isPlayer && ai.plan === 'block' && RL.rand(0, 1) < 0.2) taunt(c, 'block');
    }
  }
  function aiInput(c, dt) {
    if (!c.ai || !c.ai.profile) c.ai = makeAiState(c.ai && c.ai.pers, null, null);
    if (c.drive == null) c.drive = RL.clamp(c.skill || 0.75, 0.3, 1);
    if (c.finished) return { throttle: true, brake: false, steer: 0, drift: false, nitro: false };
    const tr = R.track, N = tr.N, ai = c.ai, p = ai.profile, pl = R.player;
    const scan = scanTrack(c);
    const near = nearestCars(c);
    const playerAhead = pl.progress > c.progress + 1;
    if (!ai.inited) { ai.inited = true; ai.playerAhead = playerAhead; }
    else if (playerAhead !== ai.playerAhead) {
      taunt(c, playerAhead ? 'overtaken' : 'overtake');
      if (playerAhead) ai.prideT = 1.6 + p.pride * 2.2;
      ai.playerAhead = playerAhead;
    }
    if (!R.banterOpen && R.t > 0.4 && R.t < 2.4 && (c.boss || !R.cars.some((o) => o !== c && o.boss && o.ai && o.ai.lines))) {
      if (taunt(c, 'start')) R.banterOpen = true;
    }
    if (!R.finalBanter && c.lapsDone >= R.cfg.laps - 1 && c.lapsDone > 0 && !(R.tauntLock > R.t)) {
      if (taunt(c, 'final')) R.finalBanter = true;
    }
    considerPlan(c, dt, scan, near);
    // boss pace gimmicks — magnet/phantom speed up when you are close; Vex refills nitro
    c.speedMult = 1;
    if ((c.boss === 'magnet' || c.boss === 'phantom') && !pl.finished && !pl.eliminated) {
      const dist = Math.hypot(pl.x - c.x, pl.y - c.y);
      if (dist < 300) c.speedMult *= 1 + (c.boss === 'phantom' ? 0.075 : 0.11) * (1 - dist / 300);
    }
    if (c.boss === 'nitro') {
      c.bossT = (c.bossT || 0) + dt;
      if (c.bossT > 4.5) { c.bossT = 0; c.nitro = 100; ai.forceNitro = 1.7; }
    }
    // light catch-up only, and never for bosses. A huge lead is not given back.
    if (!c.boss && !c.ghost && R.cfg.catchup !== false) {
      const gapPx = (pl.progress - c.progress) * scan.seg;
      const rubber = c.rubber == null ? 1 : c.rubber;
      if (gapPx > 650) c.speedMult *= 1 + RL.clamp((gapPx - 650) / 18000, 0, 0.048) * rubber;
    }
    let late = 0.6 + c.drive * 0.4;
    let lift = false, panic = false, wide = 0;
    if (ai.mistakeT > 0) {
      ai.mistakeT -= dt;
      if (ai.mistake === 'late') late += 0.32;
      else if (ai.mistake === 'wide') wide = ai.mistakeSide * tr.width * 0.15;
      else if (ai.mistake === 'lift') lift = true;
      else if (ai.mistake === 'panic') panic = true;
    } else if (R.t > 2.4) {
      const rate = (0.12 + (1 - c.drive) * 0.7) * p.mistake * (c.mistakeScale || 1);
      if (RL.rand(0, 1) < rate * dt) {
        const kinds = p.risk > 0.65 ? ['late', 'wide', 'lift', 'panic'] : ['late', 'wide', 'lift'];
        ai.mistake = kinds[Math.floor(RL.rand(0, kinds.length))];
        ai.mistakeT = RL.rand(0.32, 0.85);
        ai.mistakeSide = RL.rand(0, 1) < 0.5 ? -1 : 1;
      }
    }
    const aheadCurv = Math.max(scan.peak, scan.here);
    let target = cornerTarget(c, aheadCurv);
    if (scan.phase === 'straight') target = Math.max(target, c.p.maxSpeed * c.speedMult * (0.97 + c.drive * 0.03));
    else if (scan.phase === 'exit') target = Math.max(target, c.p.maxSpeed * (0.88 + c.drive * 0.1));
    if (ai.plan === 'dive') late += 0.12 + p.risk * 0.1;
    const dist = Math.max(scan.seg * 3, scan.peakAt * scan.seg);
    const brakeDist = c.speed > target ? (c.speed * c.speed - target * target) / (2 * 540) : 0;
    let brake = panic || (brakeDist > dist * late && c.speed > target + 22);
    const limit = tr.width * 0.4;
    let off = (p.line || 0) * tr.width * 0.1;
    const side = scan.peakSign, w = tr.width;
    if (scan.phase === 'entry') off = -side * w * (0.2 + c.drive * 0.1) + off * 0.35;
    else if (scan.phase === 'apex') off = side * w * (0.18 + c.drive * 0.14);
    else if (scan.phase === 'exit') off = -side * w * (0.1 + c.drive * 0.1);
    if (ai.plan === 'pass' || ai.plan === 'sling') off = ai.side * w * 0.3;
    else if (ai.plan === 'dive') off = side * w * (0.28 + c.drive * 0.06);
    else if ((ai.plan === 'draft' || (c.drafting && ai.plan === 'race')) && near.ahead) off = near.ahead.lat * 0.72;
    else if ((ai.plan === 'block' || ai.plan === 'bump') && near.behind && ai.prideT <= 0) off = near.behind.lat;
    else if (ai.plan === 'bump' && near.ahead) off = near.ahead.lat;
    if (p.aggression < 0.22 && !c.boss && near.behind && near.bg < 5 && ai.prideT <= 0) {
      off -= Math.sign((near.behind.lat - c.lat) || 1) * w * 0.1;
    }
    off = RL.clamp(off + wide, -limit, limit);
    const react = (2.4 + c.drive * 8) * (ai.plan === 'bump' || ai.plan === 'block' ? 1.3 : 1);
    ai.off += (off - ai.off) * Math.min(1, react * dt);
    let used = ai.off;
    // Brick / Phantom cover the player's lane, with a human reaction delay so a fake still works.
    if ((c.boss === 'blocker' || c.boss === 'phantom') && pl.progress < c.progress && c.progress - pl.progress < 36 && !pl.finished) {
      const follow = c.boss === 'phantom' ? 8 : 5.5;
      ai.bossOff += (pl.lat - ai.bossOff) * Math.min(1, follow * dt);
      used = RL.clamp(ai.bossOff, -limit, limit);
    }
    const lookUse = Math.max(6, Math.round(scan.look * (0.4 + c.drive * 0.24)));
    const tp = aheadPt(tr, c.idx, lookUse);
    const tx = tp.x + tp.nx * used, ty = tp.y + tp.ny * used;
    let d = angDiff(Math.atan2(ty - c.y, tx - c.x), c.h);
    if (Math.abs(d) > 0.6) target *= RL.clamp(1 - (Math.abs(d) - 0.6) * 0.5, 0.5, 1);
    let steer = d * (1.9 + c.drive * 1.5);
    const fx = Math.cos(c.h), fy = Math.sin(c.h);
    const vf = c.vx * fx + c.vy * fy, vl = c.vx * -fy + c.vy * fx;
    let drift = false;
    const charging = c.nitro < 30 && p.drift > 0.65;
    if ((scan.phase === 'entry' || scan.phase === 'apex') && scan.peak > (charging ? 0.22 : 0.34) && c.speed > 190 && p.drift > 0.38 && Math.abs(d) > 0.08) drift = true;
    if (p.drift > 0.82 && scan.phase === 'apex' && scan.peak > 0.26 && c.speed > 180) drift = true;
    if (c.drifting || drift) {
      const slide = vl / Math.max(90, Math.abs(vf));
      if (Math.abs(slide) > 0.32) steer -= Math.sign(slide) * RL.clamp(Math.abs(slide), 0, 1) * 0.75;
    }
    if (Math.abs(c.lat) > tr.width * 0.33) {
      const urg = RL.clamp((Math.abs(c.lat) - tr.width * 0.33) / (tr.width * 0.14), 0, 1);
      steer += -Math.sign(c.lat) * urg * 1.55;
      if (urg > 0.6 && c.speed > 210) brake = true;
      drift = false;
    }
    const headErr = Math.abs(angDiff(Math.atan2(tr.pts[c.idx].ty, tr.pts[c.idx].tx), c.h));
    if (headErr > 1.15) { drift = false; if (headErr > 1.5 || c.speed > 200) brake = true; }
    let throttle = c.speed < target * 0.992 && !brake;
    if (brake) throttle = false;
    else if (c.speed > target + 36 && scan.phase !== 'straight') throttle = false;
    if (lift && c.speed > 140) throttle = false;
    if (brake) ai.brakeHold = 0.08;
    else if (ai.brakeHold > 0) { ai.brakeHold -= dt; if (c.speed > target + 60) brake = true; }
    if (brake) throttle = false;
    let nitro = false;
    const finalLap = c.lapsDone >= R.cfg.laps - 1 && c.lapsDone >= 0;
    const straightish = scan.peak < 0.16 && scan.phase !== 'apex';
    const exiting = scan.phase === 'exit';
    const saving = p.nitroSave > 0.62 && !finalLap && c.nitro < 90 && ai.plan !== 'sling' && ai.prideT <= 0;
    if (ai.forceNitro > 0) { ai.forceNitro -= dt; nitro = !brake; }
    if (!saving && !brake && c.speed > 150 && (straightish || exiting)) {
      if (p.nitro > 0.85) nitro = c.nitro > 20;
      else if (p.nitro > 0.55) nitro = c.nitro > 50 || finalLap || ai.plan === 'sling';
      else nitro = c.nitro > 80 || (finalLap && c.nitro > 36) || ai.plan === 'sling';
    }
    if (ai.plan === 'sling' && !brake) nitro = c.nitro > 8;
    if (ai.prideT > 0 && p.nitro > 0.6 && straightish && !brake) nitro = c.nitro > 18;
    if (scan.phase === 'apex' && scan.peak > 0.3) nitro = false;
    // drifting is how the field earns nitro; a small trickle keeps a cautious driver from going dry
    if (R.cfg.nitro !== false) c.nitro = Math.min(100, c.nitro + (1.1 + p.drift * 1.3 + (p.nitro > 0.85 ? 1.8 : 0)) * dt);
    else nitro = false;
    if (R.t >= 0 && R.t < 1.2) { throttle = true; brake = false; drift = false; if (p.nitro > 0.82) nitro = c.nitro > 10; }
    if (c.speed < 30 && R.t > 3.2) c.stuckT += dt; else c.stuckT = Math.max(0, c.stuckT - dt * 0.5);
    if (c.stuckT > 2.1) {
      const pt = tr.pts[c.idx];
      const lat = RL.clamp(c.lat, -tr.width * 0.15, tr.width * 0.15);
      c.x = pt.x + pt.nx * lat; c.y = pt.y + pt.ny * lat;
      c.h = Math.atan2(pt.ty, pt.tx); c.vx = pt.tx * 90; c.vy = pt.ty * 90; c.stuckT = 0;
    }
    return { throttle, brake, steer: RL.clamp(steer, -1, 1), drift, nitro };  }

  /* ================= COLLISIONS & SLIPSTREAM ================= */
  function interactions(dt) {
    const cars = R.cars.filter((c) => !c.ghost && !c.eliminated && !c.wrecked);
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i]; a.drafting = false;
      for (let j = 0; j < cars.length; j++) {
        if (i === j) continue;
        const b = cars[j], dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
        // slipstream: b ahead of a within a narrow cone
        if (dist < 170 && dist > 30 && a.speed > 150) {
          const fa = (dx * Math.cos(a.h) + dy * Math.sin(a.h)) / dist;
          if (fa > 0.95) a.drafting = true;
        }
        if (R.cfg.collision !== false && j > i && dist < 26 && dist > 0.01) {
          const nx = dx / dist, ny = dy / dist, ov = (26 - dist) / 2;
          a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) {
            let ja = -rv * 0.6, jb = -rv * 0.6;
            if (a.isPlayer && RL.hasPerk('bumper_cars')) jb *= 1.5;
            if (b.isPlayer && RL.hasPerk('bumper_cars')) ja *= 1.5;
            a.vx -= nx * ja; a.vy -= ny * ja; b.vx += nx * jb; b.vy += ny * jb;
            const imp = -rv;
            if (imp > 40) {
              if (R.cfg.damage !== false) {
                const dm = imp * 0.012;
                a.damage = Math.min(100, a.damage + dm * a.p.dmgMult * (a.isPlayer ? R.mods.dmgTake : 0.5));
                b.damage = Math.min(100, b.damage + dm * b.p.dmgMult * (b.isPlayer ? R.mods.dmgTake : 0.5));
              }
              if (a.isPlayer || b.isPlayer) {
                R.stats.carHits++; RL.Audio.play('bump');
                if (RL.settings.shake) R.shake = Math.min(14, R.shake + imp / 40);
              }
              sparks((a.x + b.x) / 2, (a.y + b.y) / 2, imp);
            }
          }
        }
      }
      // Adrenaline perk: nitro charge when close to rivals
      if (a.isPlayer && RL.hasPerk('adrenaline') && cars.some((o) => o !== a && Math.hypot(o.x - a.x, o.y - a.y) < 80)) a.nitro = Math.min(100, a.nitro + 6 * dt);
      if (a.isPlayer && a.drafting) { R.stats.draftTime += dt; a.nitro = Math.min(100, a.nitro + 3 * dt); }
    }
  }

  /* ================= PARTICLES ================= */
  function add(p) { if (R.particles.length < 700) R.particles.push(p); }
  function smoke(c) { add({ x: c.x - Math.cos(c.h) * 14 + RL.rand(-6, 6), y: c.y - Math.sin(c.h) * 14 + RL.rand(-6, 6), vx: RL.rand(-20, 20), vy: RL.rand(-20, 20), life: 0.9, max: 0.9, size: 8, grow: 22, color: '220,220,230', type: 'smoke' }); }
  function dust(c) { add({ x: c.x, y: c.y, vx: RL.rand(-30, 30), vy: RL.rand(-30, 30), life: 0.6, max: 0.6, size: 6, grow: 14, color: R.track.theme.deco === 'snow' ? '255,255,255' : '160,130,90', type: 'smoke' }); }
  function sparks(x, y, v) { for (let i = 0; i < Math.min(18, v / 15); i++) add({ x, y, vx: RL.rand(-250, 250), vy: RL.rand(-250, 250), life: 0.4, max: 0.4, size: 2.5, grow: 0, color: '255,220,90', type: 'spark' }); }
  function flame(c) {
    const bx = c.x - Math.cos(c.h) * 18, by = c.y - Math.sin(c.h) * 18;
    add({ x: bx, y: by, vx: -Math.cos(c.h) * 160 + RL.rand(-30, 30), vy: -Math.sin(c.h) * 160 + RL.rand(-30, 30), life: 0.25, max: 0.25, size: 7, grow: -18, color: Math.random() < 0.5 ? '255,140,40' : '80,180,255', type: 'flame' });
  }
  function skid(c) {
    const g = R.track.g; g.fillStyle = 'rgba(10,10,10,0.18)';
    const s = Math.sin(c.h), co = Math.cos(c.h);
    for (const side of [-7, 7]) g.fillRect(c.x - co * 12 - s * side - 2, c.y - s * 12 + co * side - 2, 4, 4);
  }

  /* ================= UPDATE ================= */
  function playerInput() {
    const I = RL.Input, sens = RL.settings.sensitivity || 1;
    let steer = (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0);
    return { throttle: I.down('up'), brake: I.down('down'), steer: RL.clamp(steer * sens, -1, 1), drift: I.down('drift'), nitro: I.down('nitro') };
  }
  function update(dt) {
    if (!R) return;
    if (RL.Input.hit('pause') && !R.ended) {
      // Online races stay in sync for everyone; Esc only offers a way to leave.
      if (R.cfg.multiplayer) { if (RL.UI.isOpen()) RL.UI.back(); else RL.UI.showPause(); }
      else { R.paused = !R.paused; if (R.paused) RL.UI.showPause(); else RL.UI.closeAll(); }
    }
    if (R.paused) return;
    R.mods = driverMods();
    const prevT = R.t; R.t += dt;
    if (R.cfg.multiplayer && RL.Net) RL.Net.syncClock(R);
    // countdown beeps
    for (const b of [-3, -2, -1]) if (prevT < b && R.t >= b) RL.Audio.play('beep');
    if (prevT < 0 && R.t >= 0) { RL.Audio.play('go'); msg('GO!', 1, '#7dff5a'); R.cars.forEach((c) => (c.lapStart = 0)); }
    const pl = R.player;
    let inp = playerInput();
    if (R.t < 0 || R.ended || pl.eliminated || pl.finished) {
      // perfect start: hold gas right as the light goes green
      if (R.t < 0) inp = { throttle: false, brake: false, steer: 0, drift: false, nitro: false };
      else inp = { throttle: false, brake: true, steer: 0, drift: false, nitro: false };
    } else if (!R.startBoostChecked && R.t < R.mods.startWindow) {
      if (inp.throttle) { R.startBoostChecked = true; if (RL.hasPerk('perfect_start')) { pl.boostT = 1.6; msg('PERFECT START!', 1.5, '#ffe03b'); } }
    }
    for (const c of R.cars) {
      if (c.eliminated) continue;
      if (c.ghost && c.replay) { replayGhost(c); continue; }
      if (c.wrecked) { c.vx = c.vy = c.speed = 0; continue; }
      // Other players, and AI on a guest, are drawn from the net interpolation buffer.
      if (c.remote && RL.Net) {
        RL.Net.integrateRemote(c, dt);
        if (c.progress == null) updateTrackPos(c);
        continue;
      }
      let ci = c.isPlayer ? inp : (R.t < 0 ? { throttle: false, steer: 0 } : aiInput(c, dt));
      if (!c.isPlayer && (c.finished || R.t < 0)) ci = c.finished ? Object.assign(ci, { throttle: true, nitro: false }) : ci;
      stepCar(c, ci, dt);
      if (c.nitro < 0) c.nitro = 0;
      if (RL.Explode) RL.Explode.inspectRace(c);
    }
    interactions(dt);
    if (RL.Explode) RL.Explode.update(dt);
    // Put remote cars back on the interpolated pose (the local car keeps the bump) and exchange snapshots.
    if (R.cfg.multiplayer && RL.Net) RL.Net.afterPhysics(R, dt);
    // positions
    const st = standings();
    R.playerPos = st.indexOf(pl) + 1;
    if (R.t > 3 && R.playerPos === st.length && st.length > 1) R.stats.wasLast = true;
    R.stats.topSpeed = Math.max(R.stats.topSpeed, pl.speed * KMH);
    if (pl.drifting) R.driftLive = pl.driftCur;
    // ghost recording (10 Hz)
    R.recT += dt;
    if (R.t >= 0 && !pl.finished && R.recT >= 0.1) { R.recT = 0; R.ghostRec.push([Math.round(pl.x), Math.round(pl.y), Math.round(pl.h * 100) / 100]); }
    // particles
    for (const p of R.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; p.size = Math.max(0.5, p.size + p.grow * dt); }
    R.particles = R.particles.filter((p) => p.life > 0);
    R.msgs.forEach((m) => (m.t -= dt)); R.msgs = R.msgs.filter((m) => m.t > 0);
    R.fx.forEach((m) => (m.t -= dt)); R.fx = R.fx.filter((m) => m.t > 0);
    R.shake *= Math.pow(0.02, dt);
    RL.Audio.updateEngine(RL.clamp(pl.speed / 600, 0, 1), pl.drifting, pl.nitroOn);
    // camera
    const lead = 0.28;
    R.cam.x += (pl.x + pl.vx * lead - R.cam.x) * Math.min(1, 6 * dt);
    R.cam.y += (pl.y + pl.vy * lead - R.cam.y) * Math.min(1, 6 * dt);
    // solo time-out safety: end drift/timetrial after a generous limit
    if (!R.cfg.multiplayer && R.t > 420 && !R.ended) { R.ended = true; R.endTimer = 0.5; }
    if (R.ended) { R.endTimer -= dt; if (R.endTimer <= 0) end(); }
  }
  function replayGhost(c) {
    const f = c.replay, ft = R.t * 10, i = Math.floor(ft);
    if (R.t < 0) return;
    if (i >= f.length - 1) { if (!c.finished) { c.finished = true; c.finishTime = c.replayTime; R.finishOrder.push(c); } const l = f[f.length - 1]; c.x = l[0]; c.y = l[1]; c.progress = 1e9 - c.finishTime; return; }
    const a = f[i], b = f[i + 1], k = ft - i;
    c.x = a[0] + (b[0] - a[0]) * k; c.y = a[1] + (b[1] - a[1]) * k; c.h = a[2] + (b[2] - a[2]) * k;
    updateTrackPos(c);
  }

  /* ================= END ================= */
  function end() {
    if (!R || R.done) return;
    R.done = true;
    const pl = R.player, cfg = R.cfg;
    const st = standings();
    let position = st.indexOf(pl) + 1, cars = st.length;
    const total = pl.finished ? pl.finishTime + (pl.timePen || 0) : 0;
    let standingsList;
    if (cfg.multiplayer && R.netResult && R.netResult.standings) {
      const ns = R.netResult.standings;
      cars = ns.length || cars;
      const idx = ns.findIndex((s) => s.id === pl.netId);
      position = idx >= 0 ? idx + 1 : Math.max(1, position);
      standingsList = ns.map((s) => ({ name: s.name, isPlayer: s.id === pl.netId, time: s.time, out: !!s.out }));
    } else {
      if (cfg.kind === 'timetrial') { position = pl.finished && total <= R.par ? 1 : 2; cars = 1; }
      if (cfg.kind === 'drift') { position = R.stats.drift >= R.driftTarget ? 1 : 2; cars = 1; }
      if (cfg.kind === 'training') { position = 1; cars = 1; }
      if (cfg.kind === 'ghost') { const gh = R.cars.find((c) => c.ghost); position = pl.finished && (!gh.finished || total <= gh.finishTime) ? 1 : 2; cars = 2; }
      if (!pl.finished && !pl.eliminated && cfg.kind !== 'drift' && cfg.kind !== 'training' && cfg.kind !== 'testdrive') position = Math.max(position, cars);
      standingsList = st.map((c) => ({ name: c.name, isPlayer: !!c.isPlayer, time: c.finished ? c.finishTime + (c.timePen || 0) : null, out: c.eliminated || c.wrecked }));
    }
    if (!cfg.multiplayer && pl.finished && R.ghostRec.length > 10) saveGhost(cfg, R.ghostRec, total);
    const res = {
      cfg, position, cars, finished: pl.finished, totalTime: total, bestLap: pl.bestLap, drift: Math.round(R.stats.drift),
      damageEnd: pl.damage, damageTaken: pl.damage - pl.startDamage, wallHits: R.stats.wallHits, carHits: R.stats.carHits,
      nitroTime: R.stats.nitroTime, draftTime: R.stats.draftTime, topSpeed: Math.round(R.stats.topSpeed), cleanLaps: R.stats.cleanLaps,
      wasLast: R.stats.wasLast, par: R.par, driftTarget: R.driftTarget,
      standings: standingsList
    };
    RL.Audio.stopEngine();
    RL.Game.finishRace(res);
  }
  /* Test/debug hook: instantly finish the race for the player in the current position */
  function forceFinish() {
    if (!R) return;
    const pl = R.player;
    if (!pl.finished) { pl.finished = true; pl.finishTime = Math.max(1, R.t); pl.bestLap = pl.bestLap || pl.finishTime / 3; }
    end();
  }
  function quit() {
    if (!R) return;
    const cfg = R.cfg || {};
    if (cfg.kind === 'testdrive') {
      RL.Audio.stopEngine();
      R = null;
      RL.Game.mode = 'editor';
      RL.UI.setMode('editor');
      if (RL.Editor) RL.Editor.resumeAfterTest(null);
      return;
    }
    if (cfg.damage !== false && RL.Game.currentCar()) RL.Game.currentCar().damage = RL.clamp(R.player.damage, 0, 100);
    if (cfg.multiplayer && RL.Net) RL.Net.disconnect();
    RL.Game.toHub();
  }
  function resume() { if (R) R.paused = false; }

  /* ================= DRAW ================= */
  function drawCar(g, c) {
    if (c.wrecked) {
      g.save(); g.translate(c.x, c.y); g.rotate(c.h);
      g.fillStyle = '#1a120e'; g.fillRect(-17, -9, 34, 18);
      g.restore();
      return;
    }
    g.save(); g.translate(c.x, c.y); g.rotate(c.h);
    if (c.ghost) g.globalAlpha = 0.45;
    if (c.eliminated) g.globalAlpha = 0.25;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-15, -8, 34, 20);
    if (R.time.dark > 0.2) { // headlights
      g.globalCompositeOperation = 'lighter';
      const grd = g.createLinearGradient(18, 0, 150, 0); grd.addColorStop(0, 'rgba(255,240,180,0.35)'); grd.addColorStop(1, 'rgba(255,240,180,0)');
      g.fillStyle = grd; g.beginPath(); g.moveTo(16, -6); g.lineTo(150, -45); g.lineTo(150, 45); g.lineTo(16, 6); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    g.fillStyle = c.color; g.beginPath();
    if (g.roundRect) g.roundRect(-17, -9, 34, 18, 5); else g.rect(-17, -9, 34, 18);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(-3, -7, 9, 14); g.fillRect(-14, -6, 5, 12);
    g.fillStyle = '#fff8c0'; g.fillRect(14, -7, 3, 4); g.fillRect(14, 3, 3, 4);
    g.fillStyle = c.nitroOn ? '#3fa9ff' : '#ff2030'; g.fillRect(-17, -7, 2, 4); g.fillRect(-17, 3, 2, 4);
    if (c.boss) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(-19, -11, 38, 22); }
    if (c.isPlayer && RL.Game) {
      const look = (RL.Game.currentCar().look) || {};
      if (RL.Look) RL.Look.paintDecal(g, look.decal, look.decalColor);
      if (RL.Roles && RL.Roles.current() === 'police') RL.Roles.paintLivery(g, false);
    }
    g.restore();
    if (!c.isPlayer && !c.eliminated) {
      g.fillStyle = c.boss ? c.color : 'rgba(255,255,255,0.75)'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center';
      g.fillText(c.name, c.x, c.y - 22);
    }
  }
  function draw(ctx) {
    if (!R) return;
    const view = RL.Game.view(ctx), W = view.W, H = view.H, tr = R.track, pl = R.player;
    const zoom = RL.clamp(Math.min(W, H) / 720, 0.55, 1.4) * (1 - RL.clamp(pl.speed / 3000, 0, 0.15));
    ctx.fillStyle = tr.theme.bg; ctx.fillRect(0, 0, W, H);
    ctx.save();
    const sx = (Math.random() - 0.5) * R.shake, sy = (Math.random() - 0.5) * R.shake;
    ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(zoom, zoom); ctx.translate(-Math.round(R.cam.x * zoom) / zoom, -Math.round(R.cam.y * zoom) / zoom);
    ctx.drawImage(tr.canvas, tr.minX, tr.minY);
    for (const p of R.particles) {
      if (p.type === 'smoke') ctx.fillStyle = 'rgba(' + p.color + ',' + (0.35 * p.life / p.max) + ')';
      else ctx.fillStyle = 'rgba(' + p.color + ',' + (p.life / p.max) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
    }
    R.cars.slice().sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0)).forEach((c) => drawCar(ctx, c));
    if (RL.Explode) RL.Explode.draw(ctx);
    ctx.restore();
    // night / dusk darkness with a pool of light around the player
    if (R.time.dark > 0) {
      const px = W / 2 + (pl.x - R.cam.x) * zoom, py = H / 2 + (pl.y - R.cam.y) * zoom;
      const grd = ctx.createRadialGradient(px, py, 60 * zoom, px, py, 520 * zoom);
      grd.addColorStop(0, 'rgba(5,0,25,' + R.time.dark * 0.3 + ')'); grd.addColorStop(1, 'rgba(5,0,25,' + R.time.dark + ')');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    }
    drawWeather(ctx, W, H);
    if (pl.nitroOn || pl.boostT > 0) drawSpeedLines(ctx, W, H);
    drawHUD(ctx, W, H);
  }
  function drawWeather(ctx, W, H) {
    const w = R.cfg.weather; if (!R.weatherP.length) return;
    const pl = R.player;
    ctx.save();
    for (const d of R.weatherP) {
      if (!R.paused) {
        if (w === 'rain') { d.y += 0.03 + d.s * 0.02; d.x -= 0.004 + pl.vx / 60000; }
        else if (w === 'snow') { d.y += 0.004 + d.s * 0.004; d.x += Math.sin(R.t + d.s * 9) * 0.001 - pl.vx / 90000; }
        else { d.x += 0.01 + d.s * 0.01; d.y += Math.sin(R.t * 2 + d.s * 9) * 0.002; }
        d.y -= pl.vy / 90000;
        if (d.y > 1) d.y -= 1; if (d.y < 0) d.y += 1; if (d.x < 0) d.x += 1; if (d.x > 1) d.x -= 1;
      }
      const x = d.x * W, y = d.y * H;
      if (w === 'rain') { ctx.strokeStyle = 'rgba(170,200,255,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 16); ctx.stroke(); }
      else if (w === 'snow') { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(x, y, 1.5 + d.s * 2.5, 0, 7); ctx.fill(); }
      else { ctx.fillStyle = 'rgba(220,170,110,0.35)'; ctx.fillRect(x, y, 18 + d.s * 30, 2); }
    }
    if (w === 'dust') { ctx.fillStyle = 'rgba(210,160,100,0.15)'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }
  /* Motion-blur streaks while boosting */
  function drawSpeedLines(ctx, W, H) {
    const pl = R.player, a = Math.atan2(pl.vy, pl.vx);
    ctx.save(); ctx.strokeStyle = 'rgba(180,230,255,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const r = 180 + Math.random() * Math.max(W, H) * 0.6, t = Math.random() * Math.PI * 2;
      const x = W / 2 + Math.cos(t) * r, y = H / 2 + Math.sin(t) * r, l = 40 + Math.random() * 80;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(a) * l, y - Math.sin(a) * l); ctx.stroke();
    }
    ctx.restore();
  }
  function ord(n) { return n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th'); }
  function drawHUD(ctx, W, H) {
    const pl = R.player, cfg = R.cfg, small = W < 700;
    ctx.save(); ctx.textBaseline = 'top';
    const panel = (x, y, w, h) => { ctx.fillStyle = 'rgba(8,6,24,0.65)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = 'rgba(46,230,255,0.5)'; ctx.strokeRect(x + 0.5, y + 0.5, w, h); };
    // position & lap
    panel(10, 10, 190, 92);
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffe03b'; ctx.font = 'bold 34px Trebuchet MS, sans-serif';
    const solo = ['timetrial', 'drift', 'training'].includes(cfg.kind);
    ctx.fillText(solo ? cfg.kind === 'drift' ? 'DRIFT' : 'SOLO' : ord(R.playerPos) + '/' + standings().filter((c) => !c.eliminated).length, 20, 16);
    ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText('LAP ' + RL.clamp(pl.lapsDone + 1, 1, cfg.laps) + '/' + cfg.laps + '   ' + RL.fmtTime(Math.max(0, R.t) + (pl.timePen || 0)), 20, 56);
    ctx.fillStyle = '#9fb3c8';
    let meta = R.weather.icon + ' ' + R.weather.name + ' · ' + R.time.name + (pl.bestLap ? ' · best ' + RL.fmtTime(pl.bestLap) : '');
    let msize = 12;
    ctx.font = msize + 'px sans-serif';
    while (msize > 9 && ctx.measureText(meta).width > 170) { msize -= 1; ctx.font = msize + 'px sans-serif'; }
    if (ctx.measureText(meta).width > 170) meta = R.weather.icon + ' ' + R.weather.name + ' · ' + R.time.name;
    ctx.fillText(meta, 20, 80);
    // objective line for side events
    let obj = '';
    if (cfg.kind === 'timetrial') obj = 'Par time: ' + RL.fmtTime(R.par);
    if (cfg.kind === 'drift') obj = 'Drift: ' + Math.round(R.stats.drift + (pl.drifting ? pl.driftCur : 0)) + ' / ' + R.driftTarget;
    if (cfg.kind === 'ghost') obj = 'Beat the ghost!';
    if (cfg.kind === 'elimination') obj = 'Don\'t be last when the leader laps!';
    if (cfg.kind === 'training') obj = 'Clean laps: ' + R.stats.cleanLaps + ' (no wall hits)';
    if (obj) {
      let size = 13;
      ctx.font = 'bold ' + size + 'px sans-serif';
      const maxObj = Math.max(120, Math.min(W * 0.46, 360));
      while (size > 9 && ctx.measureText(obj).width > maxObj - 16) { size -= 1; ctx.font = 'bold ' + size + 'px sans-serif'; }
      const ow = Math.min(maxObj, ctx.measureText(obj).width + 16);
      panel(10, 108, ow, 26);
      ctx.fillStyle = '#2ee6ff';
      ctx.fillText(obj, 18, 114);
    }
    // speed, nitro, damage (bottom-left; raised on touch layouts)
    const by = H - (document.body.classList.contains('touch') ? 230 : 110);
    panel(10, by, 220, 96);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 32px Trebuchet MS, sans-serif';
    ctx.fillText(Math.round(pl.speed * KMH), 18, by + 4);
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#9fb3c8'; ctx.fillText('km/h', 18, by + 38);
    if (pl.drafting) { ctx.fillStyle = '#7dff5a'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('SLIPSTREAM', 88, by + 38); }
    const bar = (y, frac, col, label) => {
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(20, y, 200, 12);
      ctx.fillStyle = col; ctx.fillRect(20, y, 200 * RL.clamp(frac, 0, 1), 12);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.fillText(label, 24, y + 1);
    };
    const nitroAllowed = cfg.nitro !== false, dmgAllowed = cfg.damage !== false;
    bar(by + 54, nitroAllowed ? pl.nitro / 100 : 0, pl.nitroOn ? '#3fa9ff' : '#2ee6ff', nitroAllowed ? 'NITRO' : 'NITRO OFF');
    bar(by + 74, dmgAllowed ? pl.damage / 100 : 0, pl.damage > 60 ? '#ff3b6b' : '#ff8a2e', dmgAllowed ? ('DAMAGE ' + Math.round(pl.damage) + '%') : 'DAMAGE OFF');
    // minimap (top-right)
    const tr = R.track, s = R.mmScale * (small ? 0.75 : 1), mw = tr.w * s, mh = tr.h * s, mx = W - mw - 12, my = 10;
    panel(mx - 4, my - 2, mw + 8, mh + 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.beginPath();
    for (let i = 0; i < tr.N; i += 3) { const p = tr.pts[i], x = mx + (p.x - tr.minX) * s, y = my + (p.y - tr.minY) * s; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath(); ctx.stroke();
    for (const c of R.cars) {
      if (c.eliminated) continue;
      ctx.fillStyle = c.isPlayer ? '#ffe03b' : c.ghost ? 'rgba(190,233,255,0.6)' : c.color;
      ctx.beginPath(); ctx.arc(mx + (c.x - tr.minX) * s, my + (c.y - tr.minY) * s, c.isPlayer ? 5 : 3.5, 0, 7); ctx.fill();
    }
    // live standings list
    if (!solo) {
      const st = standings(); let y = my + mh + 10;
      ctx.font = '12px sans-serif'; ctx.textAlign = 'right';
      st.forEach((c, i) => { ctx.fillStyle = c.isPlayer ? '#ffe03b' : c.eliminated ? '#666' : '#cfd8e3'; ctx.fillText((i + 1) + '. ' + c.name + (c.eliminated ? ' (out)' : ''), W - 14, y); y += 15; });
    }
    // countdown & messages
    ctx.textAlign = 'center';
    if (R.t < 0) {
      const n = Math.ceil(-R.t);
      if (n <= 3) { ctx.font = 'bold 110px Trebuchet MS, sans-serif'; ctx.fillStyle = ['#7dff5a', '#ffe03b', '#ff8a2e', '#ff3b6b'][n]; ctx.fillText(n, W / 2, H / 2 - 90); }
      const hint = RL.hasPerk('perfect_start') ? 'Press GAS right as GO appears for a Perfect Start!' : 'Get ready...';
      let hs = 14;
      ctx.font = hs + 'px sans-serif'; ctx.fillStyle = '#fff';
      while (hs > 10 && ctx.measureText(hint).width > W - 24) { hs -= 1; ctx.font = hs + 'px sans-serif'; }
      ctx.fillText(hint, W / 2, H / 2 + 40);
    }
    let my2 = H * 0.28;
    for (const m of R.msgs) { ctx.globalAlpha = Math.min(1, m.t * 2); ctx.font = 'bold ' + (m.text.length > 30 ? 18 : 30) + 'px Trebuchet MS, sans-serif'; ctx.fillStyle = m.color; ctx.fillText(m.text, W / 2, my2); my2 += 40; }
    ctx.globalAlpha = 1;
    if (pl.drifting && pl.driftCur > 20) { ctx.font = 'bold 22px Trebuchet MS'; ctx.fillStyle = '#ff2ef0'; ctx.fillText('DRIFT ' + Math.round(pl.driftCur), W / 2, H * 0.68); }
    R.fx.forEach((f, i) => { ctx.globalAlpha = Math.min(1, f.t); ctx.font = 'bold 20px Trebuchet MS'; ctx.fillStyle = f.color; ctx.fillText(f.text, W / 2, H * 0.62 - (1.2 - f.t) * 40 - i * 22); });
    ctx.restore();
  }

  return { start, update, draw, stop, forceFinish, quit, resume, get state() { return R; }, buildTrack, physFromStats };
})();
