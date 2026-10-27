/* race.js — circuit racing. One module covers league races, bosses, time
   trial, drift, elimination, ghost and training. The physics step is shared
   with the city (drive.js); this file owns laps, the grid, weather grip and
   the result handed back to the career. */

import { RL } from './data.js';
import { career } from './state.js';
import { settings } from './settings.js';
import { buildTrack, buildCustomTrack, buildTrackMesh, updateTrackPos, sampleAtDist, applyRoadWeather, disposeGroup } from './track.js';
import { blankVehicle, stepVehicle, physFromStats, driverMods, AI_MODS, playerSteer } from './drive.js';
import { aiInput } from './ai.js';
import { buildCar, updateCarVisual, carClass, disposeCar } from './cars.js';
import { gfx } from './renderer.js';
import { clamp, rand, pick } from './util.js';
import { wrecks } from './wrecks.js';

export const race = {
  active: false,
  track: null,
  mesh: null,
  cars: [],
  player: null,
  cfg: null,
  t: 0,
  paused: false,
  ended: false,
  endTimer: 0,
  done: false,
  weather: null,
  timeOfDay: 0.5,
  theme: 'city',
  mods: null,
  stats: null,
  msgs: [],
  fxText: [],
  playerPos: 1,
  finishOrder: [],
  elimCount: 0,
  ghostRec: [],
  recT: 0,
  startBoostChecked: false,
  par: 0,
  driftTarget: 0,
  shake: 0,

  start(cfg, fx) {
    this.stop();
    this.fx = fx;
    const S = career.state;
    cfg.laps = cfg.laps || 3;
    cfg.league = cfg.league || S.league;
    const L = career.leagueData(cfg.league);
    const track = cfg.customDef ? buildCustomTrack(cfg.customDef) : buildTrack(cfg.track, cfg.reverse);
    const mesh = buildTrackMesh(track);
    gfx.world.add(mesh);
    const weather = RL.WEATHER[cfg.weather || 'clear'];
    applyRoadWeather(mesh.userData.roadMat, cfg.weather || 'clear');
    this.track = track;
    this.mesh = mesh;
    this.cfg = cfg;
    this.weather = weather;
    this.timeOfDay = cfg.time === 'night' ? 0.04 : cfg.time === 'dusk' ? 0.78 : 0.48;
    this.theme = track.def.theme;
    this.t = -3.4;
    this.paused = false;
    this.ended = false;
    this.endTimer = 0;
    this.done = false;
    this.cars = [];
    this.finishOrder = [];
    this.elimCount = 0;
    this.ghostRec = [];
    this.recT = 0;
    this.startBoostChecked = false;
    this.msgs = [];
    this.fxText = [];
    this.stats = { wallHits: 0, carHits: 0, nitroTime: 0, draftTime: 0, topSpeed: 0, drift: 0, cleanLaps: 0, lapHit: false, wasLast: false };
    this.penalty = 0;
    this.active = true;

    const pc = career.currentCar();
    let playerDef = career.carDef(pc.id);
    let playerStats = career.carStats(pc);
    let playerStyle = pc.style;
    let playerColor = career.carColor(pc);
    if (cfg.carClass && cfg.carClass !== 'current') {
      playerDef = RL.CARS.find((c) => c.cls === cfg.carClass) || playerDef;
      playerStats = Object.assign({}, playerDef.s);
      playerStyle = { color: playerDef.color, rims: 1, decal: 'none', underglow: false, siren: S.role === 'police' };
      playerColor = playerDef.color;
    }
    const player = this._make({
      isPlayer: true, name: S.name, color: playerColor,
      p: physFromStats(playerStats), damage: cfg.damage === false ? 0 : pc.damage, startDamage: pc.damage,
      style: playerStyle, def: playerDef, lights: true
    });
    if (career.hasPerk('double_tank')) player.nitro = 100;
    if (cfg.nitro === false) player.nitro = 0;
    this.player = player;
    const solo = ['timetrial', 'drift', 'training', 'ghost'].includes(cfg.kind);
    const aiN = cfg.kind === 'custom' ? Math.max(0, Math.min(8, cfg.aiCount == null ? 5 : (cfg.aiCount | 0))) : (solo ? 0 : 5);
    this.cars.push(player);
    if (!solo && aiN > 0) {
      const pers = ['clean', 'aggressive', 'nitro', 'clean', 'aggressive'];
      const names = RL.RIVAL_NAMES.slice().sort(() => Math.random() - 0.5);
      for (let i = 0; i < aiN; i++) {
        const isBoss = cfg.kind === 'boss' && i === 0;
        const pool = (cfg.carClass && cfg.carClass !== 'current') ? RL.CARS.filter((c) => c.cls === cfg.carClass) : null;
        const defId = isBoss ? L.boss.car : (pool && pool.length ? pick(pool).id : pick(L.cars));
        const def = career.carDef(defId);
        const st = {};
        for (const k in def.s) st[k] = def.s[k] + L.aiBonus * (cfg.kind === 'custom' ? (cfg.aiDiff || 1) : 1) + (isBoss ? 12 : 0);
        const skill = (cfg.aiDiff != null ? cfg.aiDiff : L.ai) * (isBoss ? 1.06 : rand(0.96, 1.04));
        const p = physFromStats(st);
        p.maxSpeed *= skill;
        p.accel *= skill;
        this.cars.push(this._make({
          name: isBoss ? L.boss.name : (names[i % names.length] || 'Rival'),
          color: isBoss ? L.boss.color : def.color,
          p, skill,
          ai: { pers: isBoss ? 'aggressive' : pers[i % pers.length], lane: rand(-0.4, 0.4), laneT: 0 },
          boss: isBoss ? L.boss.gimmick : null,
          nitro: cfg.nitro === false ? 0 : 55,
          def, glow: isBoss ? L.boss.color : null
        }));
      }
      const order = this.cars.slice(1);
      order.splice(cfg.kind === 'elimination' ? 2 : order.length, 0, player);
      if (cfg.kind === 'boss') {
        const boss = this.cars[1];
        order.splice(order.indexOf(boss), 1);
        order.unshift(boss);
      }
      order.forEach((c, i) => this._place(c, i));
    } else this._place(player, 0);

    if (cfg.kind === 'ghost') {
      const gh = career.loadGhost(cfg);
      const ghost = this._make({
        name: gh ? 'Your Ghost' : 'Pro Ghost', color: '#bfe9ff', ghost: true,
        replay: gh ? gh.frames : null, replayTime: gh ? gh.total : null,
        p: physFromStats({ topSpeed: 55 + L.aiBonus, accel: 55 + L.aiBonus, handling: 62, grip: 62, nitro: 40, durability: 60 }),
        skill: L.ai, ai: { pers: 'clean', lane: 0, laneT: 0 }, def: career.carDef('coupe')
      });
      this._place(ghost, 1);
      this.cars.push(ghost);
    }
    const pace = 34 + cfg.league * 5.5;
    this.par = (track.len * cfg.laps) / pace;
    this.driftTarget = 1800 + cfg.league * 1100;
    this.traffic = [];
    if (cfg.traffic) {
      for (let i = 0; i < 4; i++) {
        const def = pick(RL.CARS.filter((c) => c.league <= 2));
        const mesh = buildCar(def.cls, { color: def.color, rims: 0, decal: 'none' }, {});
        gfx.world.add(mesh);
        this.traffic.push({ mesh, dist: track.len * (i + 0.5) / 4, h: 0, x: 0, z: 0, y: 0, speed: 15 });
      }
    }
    this.msg(cfg.title || track.def.name, 2.4, '#2ee6ff');
    if (cfg.kind === 'boss') this.msg('BOSS: ' + L.boss.name + ' — ' + L.boss.desc, 4, L.boss.color);
    if (weather.grip < 1) this.msg(weather.name + ': grip is down.', 2.6, '#3fa9ff');
    gfx.camera.position.set(player.x - 8, 5, player.z - 8);
  },

  _make(o) {
    const mesh = buildCar(carClass(o.def), { color: o.color, rims: (o.style && o.style.rims) || 0, decal: (o.style && o.style.decal) || 'none', underglow: !!(o.style && o.style.underglow), siren: !!(o.style && o.style.siren) }, {
      lights: !!o.lights, ghost: !!o.ghost, glow: o.glow
    });
    gfx.world.add(mesh);
    if (!o.ghost && o.name && !o.isPlayer) {
      /* name sprite added by cars? we add a simple one here to avoid a cycle */
    }
    const car = blankVehicle(o);
    car.mesh = mesh;
    car._armed = false;
    return car;
  },

  _place(car, slot) {
    const tr = this.track;
    const row = Math.floor(slot / 2);
    const col = slot % 2;
    const i = (tr.N - 8 - row * 5 + tr.N) % tr.N;
    const p = tr.pts[i];
    const side = (col ? 1 : -1) * Math.min(tr.halfW * 0.42, 2.3);
    car.x = p.x + p.nx * side - p.tx * 1.5;
    car.z = p.z + p.nz * side - p.tz * 1.5;
    car.h = Math.atan2(p.tx, p.tz);
    car.y = p.y || 0;
    car.idx = i;
    car.lat = side;
  },

  stop() {
    if (this.mesh) {
      gfx.world.remove(this.mesh);
      disposeGroup(this.mesh);
      this.mesh = null;
    }
    for (const c of this.cars) {
      if (c.mesh) { gfx.world.remove(c.mesh); disposeCar(c.mesh); }
    }
    for (const t of this.traffic || []) if (t.mesh) { gfx.world.remove(t.mesh); disposeCar(t.mesh); }
    this.traffic = [];
    this.cars = [];
    this.active = false;
    this.player = null;
  },

  msg(text, dur, color) { this.msgs.push({ text, t: dur || 2, color: color || '#fff' }); },

  update(dt, input, edges) {
    if (!this.active || this.paused) return;
    const prev = this.t;
    this.t += dt;
    if (prev < -2 && this.t >= -2) this._beep = 1;
    this.mods = this.player.isPlayer ? driverMods(career.state, (id) => career.hasPerk(id)) : AI_MODS;
    const grip = this.weather.grip;
    const racing = this.t >= 0 && !this.ended && !this.player.eliminated;
    let inp = {
      throttle: input.down('up'),
      brake: input.down('down'),
      steer: playerSteer(input),
      drift: input.down('drift'),
      nitro: this.cfg.nitro === false ? false : input.down('nitro')
    };
    if (!racing) {
      if (this.t < 0) inp = { throttle: false, brake: false, steer: 0, drift: false, nitro: false };
      else inp = { throttle: false, brake: true, steer: 0, drift: false, nitro: false };
    } else if (!this.startBoostChecked && this.t < this.mods.startWindow) {
      // Only consume the window when the gas is actually down. Checking it
      // on the first frame would throw the bonus away before the player reacts.
      if (inp.throttle) {
        if (career.hasPerk('perfect_start')) {
          this.player.boostT = 1.5;
          this.msg('PERFECT START', 1.4, '#ffe03b');
        }
        this.startBoostChecked = true;
      }
    } else if (this.t >= this.mods.startWindow) this.startBoostChecked = true;

    const ctxBase = {
      weatherGrip: grip,
      hasPerk: (id) => career.hasPerk(id),
      onDriftEnd: (car) => {
        if (car.driftCur > 40) {
          this.stats.drift += car.driftCur;
          this.fxText.push({ text: '+' + Math.round(car.driftCur) + ' DRIFT', t: 1.1, color: '#ff2ef0' });
        }
        if (car.driftT > 0.9 && career.hasPerk('counter_steer')) car.boostT = Math.max(car.boostT, 0.6);
      }
    };

    for (const c of this.cars) {
      if (c.invuln > 0) c.invuln -= dt;
      if (c.wreckHold > 0) {
        c.wreckHold -= dt;
        c.vx = c.vz = 0;
        c.speed = 0;
        if (c.wreckHold <= 0 && c.respawn) this._dropAt(c, c.respawn);
        continue;
      }
      if (c.eliminated) continue;
      if (c.ghost && c.replay) { this._replay(c); continue; }
      let ci;
      if (c.isPlayer) ci = inp;
      else if (this.t < 0) ci = { throttle: false, brake: false, steer: 0, drift: false, nitro: false };
      else if (c.ghost && !c.replay) ci = aiInput(c, this.track, dt, this.player, this.cfg.league, grip, this.t);
      else ci = aiInput(c, this.track, dt, this.player, this.cfg.league, grip, this.t);
      if (c.finished) ci = { throttle: true, brake: false, steer: ci.steer * 0.2, drift: false, nitro: false };
      if (this.cfg.nitro === false) ci.nitro = false;
      c.speedMult = c.speedMult || 1;
      const ctx = Object.assign({}, ctxBase, {
        mods: c.isPlayer ? this.mods : AI_MODS,
        stats: c.isPlayer ? this.stats : null,
        comeback: c.isPlayer && this.playerPos > this.cars.length / 2
      });
      stepVehicle(c, ci, dt, ctx);
      const ev = updateTrackPos(this.track, c);
      const sp = this.track.pts[c.idx];
      if (sp) {
        c.y = sp.y || 0;
        c.bank = sp.bank || 0;
        if (sp.bank) {
          c.vx += sp.nx * Math.sin(sp.bank) * 14 * dt;
          c.vz += sp.nz * Math.sin(sp.bank) * 14 * dt;
        }
      }
      if (ev === 'lap') this._lap(c);
      this._walls(c);
      if (c.nitroOn && this.fx && Math.random() < 0.7) {
        const fx = Math.sin(c.h), fz = Math.cos(c.h);
        this.fx.flame(c.x - fx * 2.2, 0.4, c.z - fz * 2.2, -fx, -fz);
      }
      if (c.drifting && this.fx && Math.random() < 0.65) this.fx.smoke(c.x, 0.3, c.z, { spread: 1.4 });
      if (c.offroad && c.speed > 8 && this.fx && Math.random() < 0.3) {
        const snow = this.theme === 'snow';
        this.fx.smoke(c.x, 0.25, c.z, { r: snow ? 0.95 : 0.7, g: snow ? 0.95 : 0.55, b: snow ? 1 : 0.35, life: 0.5, size: 0.4 });
      }
    }
    this._roadTraffic(dt);
    this._bumps(dt);
    if (this.cfg.damage !== false) {
      for (const c of this.cars) {
        if (c.ghost || c.exploded || c.eliminated || c.invuln > 0) continue;
        if (c.damage >= 100) this._detonate(c);
      }
    }
    const st = this.standings();
    this.playerPos = st.indexOf(this.player) + 1;
    if (this.t > 2 && this.playerPos === st.filter((c) => !c.eliminated).length && st.length > 1) this.stats.wasLast = true;
    this.stats.topSpeed = Math.max(this.stats.topSpeed, this.player.speed * 3.6);
    this.recT += dt;
    if (this.t >= 0 && !this.player.finished && this.recT >= 0.1) {
      this.recT = 0;
      this.ghostRec.push([Math.round(this.player.x * 10) / 10, Math.round(this.player.z * 10) / 10, Math.round(this.player.h * 100) / 100]);
    }
    this.msgs.forEach((m) => (m.t -= dt));
    this.msgs = this.msgs.filter((m) => m.t > 0);
    this.fxText.forEach((m) => (m.t -= dt));
    this.fxText = this.fxText.filter((m) => m.t > 0);
    if (this.t > 420 && !this.ended) { this.ended = true; this.endTimer = 0.4; }
    if (this.ended) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this._end();
    }
    // edges reserved for future (photo is handled by the shell)
    void edges;
  },

  _lap(c) {
    const lapTime = this.t - c.lapStart;
    c.lapStart = this.t;
    if (c.lapsDone > 0 && (!c.bestLap || lapTime < c.bestLap)) c.bestLap = lapTime;
    if (c.isPlayer && c.lapsDone > 0) {
      if (!this.stats.lapHit) this.stats.cleanLaps++;
      this.stats.lapHit = false;
      if (c.lapsDone < this.cfg.laps) this.msg(c.lapsDone === this.cfg.laps - 1 ? 'FINAL LAP' : 'Lap ' + (c.lapsDone + 1), 1.4, '#ffe03b');
    }
    if (c.lapsDone >= this.cfg.laps && !c.finished) {
      c.finished = true;
      c.finishTime = Math.max(0, this.t) + (c.isPlayer ? (this.penalty || 0) : 0);
      this.finishOrder.push(c);
      if (c.isPlayer) { this.msg('FINISH', 2.2, '#7dff5a'); this.ended = true; this.endTimer = 1.6; }
    }
    if (this.cfg.kind === 'elimination' && c.lapsDone > 0) {
      const alive = this.cars.filter((x) => !x.eliminated);
      const leaderLaps = Math.max(...alive.map((x) => x.lapsDone));
      if (leaderLaps === c.lapsDone && c.lapsDone > this.elimCount && c.lapsDone < this.cfg.laps) {
        this.elimCount = c.lapsDone;
        const order = this.standings().filter((x) => !x.eliminated);
        const last = order[order.length - 1];
        if (last && order.length > 1) {
          last.eliminated = true;
          last.elimPos = order.length;
          this.msg(last.name + ' ELIMINATED', 2, '#ff3b6b');
          if (last.isPlayer) { this.ended = true; this.endTimer = 1.4; }
        }
      }
    }
  },

  _roadTraffic(dt) {
    if (!this.traffic || !this.traffic.length) return;
    for (const t of this.traffic) {
      t.dist = (t.dist + 15 * dt) % this.track.len;
      const s = sampleAtDist(this.track, t.dist);
      t.x = s.x; t.z = s.z; t.y = s.y || 0; t.h = Math.atan2(s.tx, s.tz); t.speed = 15;
      t.vx = Math.sin(t.h) * 15; t.vz = Math.cos(t.h) * 15;
    }
  },

  _walls(c) {
    const tr = this.track;
    const p = tr.pts[c.idx];
    const lim = tr.halfW + tr.grass;
    c.offroad = Math.abs(c.lat) > tr.halfW * 0.98;
    if (tr.walls === false) return;
    if (Math.abs(c.lat) <= lim) return;
    const s = Math.sign(c.lat);
    const over = Math.abs(c.lat) - lim;
    c.x -= p.nx * s * over;
    c.z -= p.nz * s * over;
    const vn = (c.vx * p.nx + c.vz * p.nz) * s;
    if (vn <= 0) return;
    c.vx -= p.nx * s * vn * 1.2;
    c.vz -= p.nz * s * vn * 1.2;
    const mods = c.isPlayer ? this.mods : AI_MODS;
    const keep = c.isPlayer && career.hasPerk('iron_will') ? Math.min(0.86, mods.crashKeep + 0.3) : mods.crashKeep;
      if (vn > 7) {
      const loss = clamp(vn / 28, 0, 0.85) * (1 - keep);
      c.vx *= 1 - loss;
      c.vz *= 1 - loss;
      if (this.cfg.damage !== false && !(c.invuln > 0)) c.damage = Math.min(100, c.damage + vn * 0.45 * c.p.dmgMult * mods.dmgTake);
      if (this.fx) this.fx.sparks(c.x, 0.4, c.z, vn);
      if (c.isPlayer) {
        this.stats.wallHits++;
        this.stats.lapHit = true;
        if (settings.data.shake) gfx.shake = Math.min(0.45, vn / 40);
      }
    }
  },

  _bumps(dt) {
    if (this.cfg.collisions === false) return;
    const list = this.cars.filter((c) => !c.ghost && !c.eliminated);
    for (const t of this.traffic || []) list.push(t);
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      a.drafting = false;
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const b = list[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const dist = Math.hypot(dx, dz) || 0.0001;
        if (dist < 18 && dist > 2.4 && a.speed > 16) {
          const fa = (dx * Math.sin(a.h) + dz * Math.cos(a.h)) / dist;
          if (fa > 0.9) a.drafting = true;
        }
        if (j > i && dist < 2.45) {
          const nx = dx / dist, nz = dz / dist, ov = (2.45 - dist) / 2;
          a.x -= nx * ov; a.z -= nz * ov;
          b.x += nx * ov; b.z += nz * ov;
          const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
          if (rv < 0) {
            let ja = -rv * 0.55, jb = -rv * 0.55;
            if (a.isPlayer && career.hasPerk('bumper_cars')) jb *= 1.5;
            if (b.isPlayer && career.hasPerk('bumper_cars')) ja *= 1.5;
            a.vx -= nx * ja; a.vz -= nz * ja;
            b.vx += nx * jb; b.vz += nz * jb;
            const imp = -rv;
            if (imp > 3) {
              const dm = imp * 0.18;
              if (this.cfg.damage !== false) {
                if (a.p && !(a.invuln > 0)) a.damage = Math.min(100, a.damage + dm * a.p.dmgMult * (a.isPlayer ? this.mods.dmgTake : 0.5));
                if (b.p && !(b.invuln > 0)) b.damage = Math.min(100, b.damage + dm * b.p.dmgMult * (b.isPlayer ? this.mods.dmgTake : 0.5));
              }
              if ((a.isPlayer || b.isPlayer) && this.fx) {
                this.stats.carHits++;
                this.fx.sparks((a.x + b.x) / 2, 0.5, (a.z + b.z) / 2, imp);
                if (settings.data.shake) gfx.shake = Math.min(0.35, imp / 30);
              }
            }
          }
        }
      }
      if (a.isPlayer && career.hasPerk('adrenaline') && list.some((o) => o !== a && Math.hypot(o.x - a.x, o.z - a.z) < 6)) {
        a.nitro = Math.min(100, a.nitro + 7 * dt);
      }
      if (a.isPlayer && a.drafting) {
        this.stats.draftTime += dt;
        a.nitro = Math.min(100, a.nitro + 4 * dt);
      }
    }
  },

  _replay(c) {
    const f = c.replay;
    if (this.t < 0 || !f || !f.length) return;
    const ft = this.t * 10;
    const i = Math.floor(ft);
    if (i >= f.length - 1) {
      if (!c.finished) { c.finished = true; c.finishTime = c.replayTime || this.t; this.finishOrder.push(c); }
      const l = f[f.length - 1];
      c.x = l[0]; c.z = l[1]; c.h = l[2];
      updateTrackPos(this.track, c);
      return;
    }
    const a = f[i], b = f[i + 1], k = ft - i;
    c.x = a[0] + (b[0] - a[0]) * k;
    c.z = a[1] + (b[1] - a[1]) * k;
    c.h = a[2] + (b[2] - a[2]) * k;
    updateTrackPos(this.track, c);
  },

  /** Last gate the car has already passed. The grid counts as the start line. */
  _checkpointPose(c) {
    const tr = this.track;
    const cps = tr.cps;
    let i = cps[0];
    if (c.nextCp > 0) i = cps[c.nextCp - 1];
    else if (c._armed || c.lapsDone > 0) i = cps[cps.length - 1];
    const p = tr.pts[i];
    return { x: p.x, z: p.z, y: p.y || 0, h: Math.atan2(p.tx, p.tz), idx: i };
  },

  _detonate(c) {
    if (c.exploded || c.ghost) return;
    c.exploded = true;
    wrecks.boom(c.x, c.y || 0, c.z, this.fx);
    if (c.mesh) c.mesh.visible = false;
    c.vx = c.vz = 0;
    c.speed = 0;
    if (c.isPlayer) career.noteWreck();
    if (c.isPlayer && !c.eliminated) {
      this.penalty = (this.penalty || 0) + 8;
      c.wreckHold = 0.75;
      c.respawn = this._checkpointPose(c);
      c.damage = 20;
      c.invuln = 3.2;
      this.msgs.unshift({ text: 'WRECK  +8.0s', t: 2.4, color: '#ff3b6b' });
    } else {
      c.eliminated = true;
      c.elimPos = c.elimPos || 90;
      c.wreckHold = 0;
      this.msgs.unshift({ text: c.name + ' exploded', t: 1.8, color: '#ff8a2e' });
    }
  },

  _dropAt(c, pose) {
    c.x = pose.x;
    c.z = pose.z;
    c.y = pose.y || 0;
    c.h = pose.h;
    c.vx = c.vz = 0;
    c.speed = 0;
    c.vf = c.vl = 0;
    c.idx = pose.idx;
    c.lat = 0;
    c.damage = 18;
    c.exploded = false;
    c.respawn = null;
    c.invuln = 2.6;
    if (c.mesh) c.mesh.visible = true;
  },

  standings() {
    return this.cars.filter((c) => !c.ghost || this.cfg.kind === 'ghost').slice().sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      if (a.eliminated && b.eliminated) return a.elimPos - b.elimPos;
      return b.progress - a.progress;
    });
  },

  present(dt) {
    if (!this.active) return;
    const night = gfx.night;
    for (const c of this.cars) {
      if (!c.mesh) continue;
      updateCarVisual(c.mesh, dt, {
        x: c.x, z: c.z, y: c.y || 0, h: c.h, speed: c.speed, steer: c.steer, bank: c.bank || 0,
        nitro: c.nitroOn, brake: c.vf < -0.5, night, latVel: c.vl, reverse: c.vf < 0
      });
    }
    for (const t of this.traffic || []) {
      if (t.mesh) updateCarVisual(t.mesh, dt, { x: t.x, z: t.z, y: t.y || 0, h: t.h, speed: t.speed, night });
    }
    gfx.frame(this.player, dt, 6.6);
    gfx.follow(new gfx_focus(this.player), night, null);
    const lights = this.mesh && this.mesh.userData.lights;
    if (lights) {
      const n = this.t < 0 ? Math.ceil(-this.t) : 0;
      lights.forEach((m, i) => {
        const on = this.t >= 0 ? i === 3 : i === 3 - n || (n <= 1 && i === 3);
        m.emissiveIntensity = on ? 3.2 : 0.12;
      });
    }
  },

  _end() {
    if (this.done || !this.active) return;
    this.done = true;
    const pl = this.player, cfg = this.cfg;
    const st = this.standings();
    let position = st.indexOf(pl) + 1;
    let cars = st.length;
    const total = pl.finished ? pl.finishTime : 0;
    if (cfg.kind === 'timetrial') { position = pl.finished && total <= this.par ? 1 : 2; cars = 1; }
    if (cfg.kind === 'drift') { position = this.stats.drift >= this.driftTarget ? 1 : 2; cars = 1; }
    if (cfg.kind === 'training') { position = 1; cars = 1; }
    if (cfg.kind === 'ghost') {
      const gh = this.cars.find((c) => c.ghost);
      position = pl.finished && (!gh.finished || pl.finishTime <= (gh.finishTime || Infinity)) ? 1 : 2;
      cars = 2;
    }
    if (!pl.finished && !pl.eliminated && cfg.kind !== 'drift' && cfg.kind !== 'training') position = Math.max(position, cars);
    if (pl.finished && this.ghostRec.length > 8 && cfg.kind !== 'ghost') career.saveGhost(cfg, this.ghostRec, total);
    const res = {
      cfg, position, cars, finished: pl.finished, totalTime: total, bestLap: pl.bestLap,
      drift: Math.round(this.stats.drift), damageEnd: pl.damage,
      damageTaken: pl.damage - (pl.startDamage || 0),
      wallHits: this.stats.wallHits, carHits: this.stats.carHits,
      nitroTime: this.stats.nitroTime, draftTime: this.stats.draftTime,
      topSpeed: Math.round(this.stats.topSpeed), cleanLaps: this.stats.cleanLaps,
      wasLast: this.stats.wasLast, par: this.par, driftTarget: this.driftTarget,
      standings: st.map((c) => ({ name: c.name, isPlayer: !!c.isPlayer, time: c.finished ? c.finishTime : null, out: !!c.eliminated }))
    };
    if (this.onFinish) this.onFinish(res);
  }
};

function gfx_focus(car) {
  return { x: car.x, y: 0, z: car.z };
}
