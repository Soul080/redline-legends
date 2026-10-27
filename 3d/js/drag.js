/* drag.js — quarter mile on the city strip.
   Staging: hold brake + gas to build launch RPM. Release the brake as the
   tree goes green. Jumping the light is a foul. After launch, Shift / Space / N
   shifts up; the perfect window is a narrow band under redline and pays a
   real speed bonus, so league 4 is a timing fight and not just a stat check. */

import { RL } from './data.js';
import { career } from './state.js';
import { blankVehicle, physFromStats } from './drive.js';
import { buildCar, updateCarVisual, carClass, disposeCar } from './cars.js';
import { gfx } from './renderer.js';
import { clamp, rand, pick } from './util.js';
import { wrecks } from './wrecks.js';

const GEAR_TOP = [0.2, 0.37, 0.55, 0.74, 1];
const PERFECT = [0.9, 0.985];

export const drag = {
  active: false,
  t: 0,
  greenAt: 3.2,
  player: null,
  ai: null,
  cfg: null,
  msgs: [],
  ended: false,
  done: false,
  paused: false,
  fouls: { player: false, ai: false },

  start(cfg, fx) {
    this.stop();
    this.fx = fx;
    const S = career.state;
    const league = cfg.league || S.league;
    const L = career.leagueData(league);
    cfg.league = league;
    cfg.kind = 'drag';
    cfg.laps = 1;
    this.cfg = cfg;
    const pc = career.currentCar();
    const player = this._car({
      isPlayer: true, name: S.name, color: career.carColor(pc),
      p: physFromStats(career.carStats(pc)),
      def: career.carDef(pc.id), style: pc.style, lights: true,
      lane: cfg.strip.laneL
    });
    const defId = pick(L.cars);
    const def = career.carDef(defId);
    const st = {};
    for (const k in def.s) st[k] = def.s[k] + L.aiBonus * 0.85;
    const skill = L.ai * rand(0.98, 1.03);
    const p = physFromStats(st);
    p.maxSpeed *= skill;
    p.accel *= skill * 0.96;
    const rival = this._car({
      name: pick(RL.RIVAL_NAMES), color: def.color, p, skill, def,
      lane: cfg.strip.laneR
    });
    rival.shiftAt = clamp(0.9 + (skill - 0.8) * 0.2, 0.88, 0.97);
    rival.react = clamp(0.34 - league * 0.045 + rand(-0.02, 0.03), 0.1, 0.4);
    this.player = player;
    this.ai = rival;
    this.t = 0;
    this.greenAt = 3.2;
    this.ended = false;
    this.done = false;
    this.paused = false;
    this.fouls = { player: false, ai: false };
    this.penalty = 0;
    player.damage = career.currentCar().damage || 0;
    this.msgs = [{ text: 'Stage: hold BRAKE + GAS. Release brake on green.', t: 3.2, color: '#ffe03b' }];
    this.active = true;
    this._tree = cfg.tree || null;
    gfx.camera.position.set(player.x - 8, 3.2, player.z - 7);
  },

  _car(o) {
    const mesh = buildCar(carClass(o.def), {
      color: o.color,
      rims: (o.style && o.style.rims) || (o.isPlayer ? 0 : 1),
      decal: (o.style && o.style.decal) || 'none',
      underglow: !!(o.style && o.style.underglow)
    }, { lights: !!o.lights });
    gfx.world.add(mesh);
    const car = blankVehicle(o);
    car.mesh = mesh;
    car.x = o.lane;
    car.z = this.cfg.strip.z0 + 8;
    car.h = 0;
    car.gear = 0;
    car.stage = 0;
    car.launched = false;
    car.launchBoost = 0;
    car.wheelspin = 0;
    car.perfects = 0;
    car.shiftFlash = null;
    car.finishT = null;
    car.reaction = null;
    return car;
  },

  stop() {
    for (const c of [this.player, this.ai]) {
      if (c && c.mesh) { gfx.world.remove(c.mesh); disposeCar(c.mesh); }
    }
    this.player = null;
    this.ai = null;
    this.active = false;
  },

  /** Called once per frame, not per physics substep. */
  shift(who) {
    const c = who || this.player;
    if (!c || !c.launched || c.finishT != null) return;
    if (c.gear >= GEAR_TOP.length - 1) return;
    const rpm = this._rpm(c);
    let kind = 'EARLY';
    if (rpm >= PERFECT[0] && rpm <= PERFECT[1]) {
      kind = 'PERFECT';
      c.launchBoost = Math.max(c.launchBoost, 0.45);
      c.perfects++;
    } else if (rpm >= 0.82 && rpm < 1.05) kind = 'GOOD';
    else if (rpm >= 1.05) kind = 'LATE';
    c.gear++;
    c.shiftFlash = { kind, t: 0.7 };
    if (c.isPlayer && this.fx) { /* audio from the shell */ }
    return kind;
  },

  update(dt, input) {
    if (!this.active || this.paused) return;
    this.t += dt;
    const green = this.t >= this.greenAt;
    const gas = input.down('up');
    const brake = input.down('down');
    const p = this.player;
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    if (p.wreckHold > 0) {
      p.wreckHold -= dt;
      p.speed = 0;
      if (p.wreckHold <= 0) this._dropPlayer(p);
    } else {
      this._step(p, dt, { gas, brake, steer: (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0), green, human: true });
      if (p.damage >= 100 && !(p.invuln > 0)) this._detonatePlayer(p);
    }
    if (this.ai && this.ai.exploded) {
      /* rival is out; the player's ET is the only one that matters */
    } else this._stepAI(dt, green);
    this.msgs.forEach((m) => (m.t -= dt));
    this.msgs = this.msgs.filter((m) => m.t > 0);
    if (this.player.shiftFlash) { this.player.shiftFlash.t -= dt; if (this.player.shiftFlash.t <= 0) this.player.shiftFlash = null; }
    const bothDone = this.player.finishT != null && this.ai.finishT != null;
    const tooLong = this.t > this.greenAt + 40;
    if (!this.ended && (bothDone || tooLong) && this.t > this.greenAt) {
      this.ended = true;
      this.endTimer = 1.3;
    }
    if (this.ended) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this._finish();
    }
  },

  _rpm(c) {
    const cap = c.p.maxSpeed * (1 - c.damage * 0.002) * GEAR_TOP[c.gear];
    return c.speed / Math.max(0.5, cap);
  },

  _step(c, dt, inp) {
    const strip = this.cfg.strip;
    if (c.finishT != null) {
      c.speed = Math.max(0, c.speed - 8 * dt);
      c.z += c.speed * dt;
      return;
    }
    if (!inp.green) {
      if (inp.human) {
        if (inp.gas && inp.brake) c.stage = clamp(c.stage + dt * 0.55, 0, 1);
        else c.stage = clamp(c.stage - dt * 0.35, 0, 1);
        if (inp.gas && !inp.brake && this.t > 0.4) this.fouls.player = true;
      }
      c.speed = 0;
      c.z = strip.z0 + 8;
      return;
    }
    if (!c.launched) {
      c.launched = true;
      c.reaction = Math.max(0, this.t - this.greenAt);
      const goodRpm = c.stage > 0.62 && c.stage < 0.96;
      if (c.isPlayer && this.fouls.player) {
        c.wheelspin = 0.8;
        this.msgs.push({ text: 'RED LIGHT', t: 1.6, color: '#ff3b6b' });
      } else if (goodRpm && c.reaction < 0.12) {
        c.launchBoost = 0.7;
        c.speed = 7;
        if (c.isPlayer) this.msgs.push({ text: 'PERFECT LAUNCH', t: 1.3, color: '#7dff5a' });
      } else if (c.stage > 0.97) {
        c.wheelspin = 0.55;
        if (c.isPlayer) this.msgs.push({ text: 'WHEELSPIN', t: 1.1, color: '#ff8a2e' });
      } else {
        c.speed = 2 + c.stage * 4;
      }
    }
    const cap = c.p.maxSpeed * (1 - c.damage * 0.002) * GEAR_TOP[c.gear];
    let rpm = c.speed / Math.max(0.5, cap);
    let accel = c.p.accel * (1.25 - rpm * 0.45);
    if (c.launchBoost > 0) { accel *= 1.38; c.launchBoost -= dt; }
    if (c.wheelspin > 0) { accel *= 0.5; c.wheelspin -= dt; }
    if (rpm >= 1) { accel = -6; c.speed = Math.min(c.speed, cap); }
    if (inp.gas || !inp.human) c.speed += accel * dt;
    else c.speed = Math.max(0, c.speed - 7 * dt);
    c.speed = Math.max(0, c.speed);
    // Tiny lane correction. The walls do the rest.
    const steer = clamp(inp.steer || 0, -1, 1);
    c.h = clamp(c.h + steer * 0.35 * dt, -0.15, 0.15);
    c.x += Math.sin(c.h) * c.speed * dt * 0.15;
    c.x = clamp(c.x, strip.laneL - 1.5, strip.laneR + 1.5);
    c.z += c.speed * dt;
    if (c.z >= strip.z0 + 8 + RL.DRAG.distance && c.finishT == null) {
      c.finishT = this.t - this.greenAt + (c.isPlayer ? (this.penalty || 0) : 0);
    }
    if (rpm > 0.98 && this.fx && Math.random() < 0.4) this.fx.flame(c.x, 0.35, c.z - 2.2, 0, -1);
  },

  _stepAI(dt, green) {
    const c = this.ai;
    if (!green) {
      c.stage = clamp(c.stage + dt * 0.5, 0, 0.9);
      c.speed = 0;
      c.z = this.cfg.strip.z0 + 8;
      return;
    }
    if (!c.launched && this.t < this.greenAt + c.react) {
      c.stage = 0.88;
      return;
    }
    const rpm = c.launched ? this._rpm(c) : 0;
    if (c.launched && rpm >= c.shiftAt) this.shift(c);
    this._step(c, dt, { gas: true, brake: false, steer: (c.lane - c.x) * 0.8, green: true, human: false });
  },

  present(dt) {
    if (!this.active) return;
    const night = Math.max(gfx.night, 0.55);
    for (const c of [this.player, this.ai]) {
      if (!c || !c.mesh) continue;
      updateCarVisual(c.mesh, dt, {
        x: c.x, z: c.z, h: c.h, speed: c.speed, steer: 0,
        nitro: c.launched && this._rpm(c) > 0.75, brake: !c.launched, night
      });
    }
    gfx.frame(this.player, dt, 7.2);
    gfx.follow({ x: this.player.x, y: 0, z: this.player.z }, night, null);
    this._paintTree();
  },

  _paintTree() {
    const lights = this._tree;
    if (!lights) return;
    const t = this.t;
    const g = this.greenAt;
    // bulbs: 0 pre, 1-3 amber, 4 green, 5 red foul
    const phase = t >= g ? 'green' : t > g - 0.55 ? 3 : t > g - 1.1 ? 2 : t > g - 1.65 ? 1 : 0;
    lights.forEach((m, i) => {
      let on = false;
      if (this.fouls.player && i === 5) on = true;
      else if (phase === 'green' && i === 4) on = true;
      else if (phase === 1 && i === 1) on = true;
      else if (phase === 2 && i === 2) on = true;
      else if (phase === 3 && i === 3) on = true;
      else if (phase === 0 && i === 0 && Math.sin(t * 10) > 0) on = true;
      m.emissiveIntensity = on ? 4 : 0.08;
    });
  },

  rpm01() { return this.player ? clamp(this._rpm(this.player), 0, 1.15) : 0; },

  _detonatePlayer(c) {
    const strip = this.cfg.strip;
    wrecks.boom(c.x, 0.4, c.z, this.fx);
    if (c.mesh) c.mesh.visible = false;
    c.speed = 0;
    c.wreckHold = 0.7;
    c.damage = 20;
    c.invuln = 2.4;
    this.penalty = (this.penalty || 0) + 5;
    career.currentCar().damage = 20;
    career.noteWreck();
    this.msgs.unshift({ text: 'WRECK  +5.0s', t: 2.2, color: '#ff3b6b' });
    c._stageZ = strip.z0 + 8;
    c._stageX = c.lane;
  },

  _dropPlayer(c) {
    c.wreckHold = 0;
    c.z = c._stageZ;
    c.x = c._stageX;
    c.h = 0;
    c.speed = 0;
    c.gear = 0;
    c.launched = false;
    c.finishT = null;
    c.stage = 0.7;
    c.damage = 18;
    c.invuln = 2.2;
    career.currentCar().damage = 18;
    if (c.mesh) c.mesh.visible = true;
  },

  _finish() {
    if (this.done) return;
    this.done = true;
    const p = this.player, a = this.ai;
    const pTime = p.finishT == null ? Infinity : p.finishT + (this.fouls.player ? 0.8 : 0);
    const aTime = a.finishT == null ? Infinity : a.finishT;
    let position = 1;
    if (this.fouls.player && !this.fouls.ai) position = 2;
    else if (pTime > aTime) position = 2;
    const res = {
      cfg: this.cfg,
      position,
      cars: 2,
      finished: p.finishT != null,
      totalTime: p.finishT || 0,
      bestLap: null,
      drift: 0,
      damageEnd: career.currentCar().damage,
      damageTaken: 0,
      wallHits: 0,
      carHits: 0,
      nitroTime: 0,
      draftTime: 0,
      topSpeed: Math.round(Math.max(p.speed, 0) * 3.6),
      cleanLaps: 0,
      wasLast: false,
      foul: this.fouls.player,
      perfectShifts: p.perfects,
      reaction: p.reaction,
      standings: [
        { name: position === 1 ? p.name : a.name, isPlayer: position === 1, time: position === 1 ? p.finishT : a.finishT, out: false },
        { name: position === 1 ? a.name : p.name, isPlayer: position !== 1, time: position === 1 ? a.finishT : p.finishT, out: false }
      ]
    };
    // Standings should list the winner first but also keep the player's row marked.
    res.standings = [
      { name: p.name, isPlayer: true, time: p.finishT, out: false },
      { name: a.name, isPlayer: false, time: a.finishT, out: false }
    ].sort((u, v) => (u.time == null ? 1e9 : u.time) - (v.time == null ? 1e9 : v.time));
    if (this.fouls.player) {
      const me = res.standings.find((s) => s.isPlayer);
      if (me) me.time = pTime;
      res.standings.sort((u, v) => (u.time == null ? 1e9 : u.time) - (v.time == null ? 1e9 : v.time));
    }
    if (this.onFinish) this.onFinish(res);
  }
};
