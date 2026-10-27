/* hub.js — free roam. You drive the career car through the city, walk up to
   a door by stopping on the road in front of it, and get pulled into races,
   the garage, or a street challenge. Police spawn when you hold a high speed;
   losing them is a timed gap, not a scripted cutscene. */

import { RL } from './data.js';
import { career } from './state.js';
import { settings } from './settings.js';
import { blankVehicle, stepVehicle, physFromStats, driverMods } from './drive.js';
import { seekInput } from './ai.js';
import { buildCar, updateCarVisual, carClass, disposeCar } from './cars.js';
import { resolveCity, lotAt, lightIsRed, nearestLandmark } from './city.js';
import { gfx } from './renderer.js';
import { clamp, rand, pick, angNorm, forwardXZ } from './util.js';
import { makeNameSprite } from './textures.js';
import { wanted } from './wanted.js';
import { makePerson, disposePerson } from './foot.js';
import { roles } from './roles.js';
import { wrecks } from './wrecks.js';

export const hub = {
  active: false,
  player: null,
  traffic: [],
  police: null,
  street: null,
  rivals: [],
  prompt: null,
  msgs: [],
  challenge: null,

  enter(city, fx) {
    this.city = city;
    this.fx = fx;
    this.active = true;
    this.prompt = null;
    wanted.bind(this);
    roles.bind(this);
    wanted.onBust = () => roles.failJob('busted');
    if (!this.player) this._spawnPlayer();
    else if (!this.player.stolen) this._restylePlayer();
    if (!this.traffic.length) this._spawnTraffic();
    if (!this.rivals.length) this._spawnRivals();
    this.cooldown = Math.max(this.cooldown, 4);
  },

  leave() {
    this.active = false;
  },

  dispose() {
    if (this.player && this.player.onFoot && this.player.mesh) {
      gfx.world.remove(this.player.mesh);
      disposePerson(this.player.mesh);
      this.player.mesh = null;
    }
    if (this.mount && this.mount.mesh) {
      gfx.world.remove(this.mount.mesh);
      disposeCar(this.mount.mesh);
      this.mount = null;
    }
    const all = [this.player, ...this.traffic, ...this.rivals.map((r) => r.car)];
    for (const c of all) if (c && c.mesh) { gfx.world.remove(c.mesh); disposeCar(c.mesh); }
    if (this.parked && this.parked.mesh) { gfx.world.remove(this.parked.mesh); disposeCar(this.parked.mesh); }
    wanted.reset();
    roles.clearDuty();
    this.player = null;
    this.parked = null;
    this.traffic = [];
    this.rivals = [];
    this.police = null;
  },

  _ownedStyle() {
    const car = career.currentCar();
    const def = career.carDef(car.id);
    return {
      def,
      cls: carClass(def),
      style: Object.assign({ color: career.carColor(car) }, car.style, { siren: career.state.role === 'police' })
    };
  },

  _buildOwnedMesh() {
    const o = this._ownedStyle();
    return buildCar(o.cls, o.style, { lights: true });
  },

  _spawnPlayer() {
    const car = career.currentCar();
    const def = career.carDef(car.id);
    const s = career.state;
    const spawn = (s.hub3d && s.hub3d.x != null && s.hub3d.z != null) ? s.hub3d : this.city.spawn;
    const stolen = s.hub3d && s.hub3d.stolen;
    const stolenDef = stolen && stolen.id ? career.carDef(stolen.id) : null;
    let mesh;
    let phys;
    let damage;
    let stolenInfo = null;
    if (stolenDef) {
      mesh = buildCar(stolenDef.cls, { color: stolenDef.color, rims: 1, decal: 'none' }, { lights: true });
      phys = physFromStats(stolenDef.s);
      damage = stolen.damage || 0;
      stolenInfo = { id: stolenDef.id, name: stolenDef.name, tier: stolenDef.league, maxHp: stolen.maxHp || (40 + stolenDef.s.durability) };
      const parkAt = (s.hub3d && s.hub3d.parked) || { x: spawn.x + 5, z: spawn.z, h: spawn.h || 0 };
      const owned = this._buildOwnedMesh();
      gfx.world.add(owned);
      this.parked = { mesh: owned, x: parkAt.x, z: parkAt.z, h: parkAt.h || 0 };
    } else {
      mesh = this._buildOwnedMesh();
      phys = physFromStats(career.carStats(car));
      damage = car.damage;
    }
    gfx.world.add(mesh);
    this.player = blankVehicle({
      isPlayer: true, name: s.name, mesh, def: stolenDef || def,
      p: phys,
      damage,
      stolen: stolenInfo,
      x: spawn.x, z: spawn.z, h: spawn.h || 0,
      nitro: career.hasPerk('double_tank') ? 100 : 40,
      hp: 100, onFoot: false
    });
    gfx.camera.position.set(spawn.x - 6, 4, spawn.z - 8);
  },

  _restylePlayer() {
    const car = career.currentCar();
    const def = career.carDef(car.id);
    if (this.player.mesh) { gfx.world.remove(this.player.mesh); disposeCar(this.player.mesh); }
    this.player.mesh = buildCar(carClass(def), Object.assign({ color: career.carColor(car) }, car.style, { siren: career.state.role === 'police' }), { lights: true });
    gfx.world.add(this.player.mesh);
    this.player.p = physFromStats(career.carStats(car));
    this.player.def = def;
    this.player.damage = car.damage;
  },

  refreshCar() {
    if (this.player && this.player.onFoot) return;
    if (this.player && this.player.stolen && this.parked) {
      if (this.parked.mesh) { gfx.world.remove(this.parked.mesh); disposeCar(this.parked.mesh); }
      this.parked.mesh = this._buildOwnedMesh();
      gfx.world.add(this.parked.mesh);
      return;
    }
    if (this.player) this._restylePlayer();
  },

  _writeDamage(p, value) {
    p.damage = value;
    if (!p.stolen && career.currentCar()) career.currentCar().damage = value;
  },

  _spawnTraffic() {
    const n = settings.quality().traffic;
    const pitch = 86;
    const pool = RL.CARS.filter((c) => c.league <= Math.max(2, career.state.league));
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < n; i++) {
      const def = pool[i % pool.length];
      const mesh = buildCar(def.cls, { color: def.color, rims: i % 3, decal: 'none' }, {});
      gfx.world.add(mesh);
      const ni = -2 + (i % 5);
      const nj = -2 + ((i * 2) % 5);
      const d = dirs[i % 4];
      const maxHp = Math.round(36 + def.s.durability * 0.9);
      this.traffic.push(blankVehicle({
        mesh, def, name: def.name,
        tier: def.league,
        maxHp,
        p: physFromStats(def.s),
        damage: (i % 5) * 6,
        x: ni * pitch, z: nj * pitch,
        h: Math.atan2(d[0], d[1]),
        cruise: 9 + (i % 4) * 1.4,
        ni, nj, di: d[0], dj: d[1], bumped: 0
      }));
    }
  },

  _spawnRivals() {
    for (const ch of this.city.streets) {
      const names = RL.RIVAL_NAMES;
      const def = pick(RL.CARS.filter((c) => c.league === Math.min(4, ch.league)));
      const mesh = buildCar(def.cls, { color: def.color, rims: 1, decal: 'stripes', underglow: true }, { glow: '#ffe03b' });
      const tag = makeNameSprite(ch.name, '#ffe03b');
      mesh.add(tag);
      gfx.world.add(mesh);
      const car = blankVehicle({
        mesh, def, name: names[ch.league] || 'Rival',
        p: physFromStats(def.s),
        x: ch.x + 3.2, z: ch.z, h: ch.h
      });
      this.rivals.push({ def: ch, car, beaten: false });
    }
  },

  update(dt, input) {
    if (!this.active || !this.player) return;
    const S = career.state;
    const p = this.player;
    p.invuln = Math.max(0, (p.invuln || 0) - dt);
    p.hitHeatCd = Math.max(0, (p.hitHeatCd || 0) - dt);
    if (p.wreckHold > 0) {
      p.wreckHold -= dt;
      p.vx = p.vz = 0;
      p.speed = 0;
      wanted.update(dt, p, this.city);
      if (p.skipWreck) {
        p.skipWreck = false;
        p.wreckHold = 0;
      } else if (p.wreckHold <= 0) this._finishWreck(p);
      this.msgs.forEach((m) => (m.t -= dt));
      this.msgs = this.msgs.filter((m) => m.t > 0);
      return;
    }
    if (p.hp == null) p.hp = 100;
    if (!p.stolen) p.damage = career.currentCar().damage;
    p.offroad = !this.city.isRoad(p.x, p.z);
    const mods = driverMods(S, (id) => career.hasPerk(id));
    if (input.hit && input.hit('reset')) this._reset(p);
    if (!this.challenge && input.hit('exit')) {
      if (p.onFoot) this.enterCar();
      else this.exitCar();
    }
    const inp = {
      throttle: input.down('up'),
      brake: input.down('down'),
      steer: ((input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0)) * (settings.data.sensitivity || 1),
      drift: input.down('drift'),
      nitro: input.down('nitro')
    };
    if (this.challenge) this._updateChallenge(dt, inp, mods);
    else if (p.onFoot) this._stepOnFoot(p, inp, dt);
    else stepVehicle(p, inp, dt, {
      weatherGrip: this._grip(), mods, hasPerk: (id) => career.hasPerk(id),
      onDriftEnd: (car) => { if (car.driftT > 0.8 && career.hasPerk('counter_steer')) car.boostT = 0.5; }
    });
    const hit = resolveCity(this.city, p.x, p.z, p.vx, p.vz, p.onFoot ? 0.45 : 1.25);
    p.x = hit.x; p.z = hit.z; p.vx = hit.vx; p.vz = hit.vz;
    if (hit.impact > 8 && !(p.invuln > 0)) {
      const modsD = mods.dmgTake;
      const keep = career.hasPerk('iron_will') ? 0.45 : 1;
      this._writeDamage(p, clamp(p.damage + hit.impact * 0.35 * p.p.dmgMult * modsD * keep, 0, 100));
      S.totals.crashes++;
      if (this.fx) this.fx.sparks(p.x, 0.4, p.z, hit.impact);
      if (settings.data.shake) gfx.shake = Math.min(0.4, hit.impact / 36);
      if (p.hitHeatCd <= 0) {
        p.hitHeatCd = 0.75;
        const amt = hit.impact < 11 ? 0.35 : hit.impact < 18 ? 2.4 : 7;
        wanted.offense('crash', amt, { quiet: amt < 1 });
      }
    }
    if (hit.props && hit.props.length) {
      for (const prop of hit.props) {
        prop.heatCd = Math.max(0, (prop.heatCd || 0) - dt);
        const res = this.city.strikeProp(prop, Math.max(hit.impact, p.speed * 0.35));
        if (!res) continue;
        if (res.destroyed) {
          if (res.kind === 'bin') wrecks.boom(prop.mesh.position.x, 0.4, prop.mesh.position.z, this.fx);
          else if (this.fx) this.fx.sparks(prop.mesh.position.x, 0.4, prop.mesh.position.z, 8);
          wanted.offense('prop', res.kind === 'bin' ? 5.5 : 2.6);
          this.msgs.push({ text: res.kind === 'bin' ? 'Bin destroyed' : 'Cone smashed', t: 1.1, color: '#ff8a2e' });
        } else if (hit.impact > 3 && prop.heatCd <= 0) {
          prop.heatCd = 0.9;
          wanted.offense('prop', 0.4, { quiet: true });
        }
      }
    }
    if (p.nitroOn && this.fx && Math.random() < 0.5) {
      this.fx.flame(p.x - Math.sin(p.h) * 2.2, 0.35, p.z - Math.cos(p.h) * 2.2, -Math.sin(p.h), -Math.cos(p.h));
    }
    if (p.drifting && this.fx && Math.random() < 0.5) this.fx.smoke(p.x, 0.25, p.z);
    S.hub3d = {
      x: p.x, z: p.z, h: p.h,
      stolen: p.stolen ? { id: p.stolen.id, damage: p.damage, tier: p.stolen.tier, name: p.stolen.name, maxHp: p.stolen.maxHp } : null,
      parked: this.parked ? { x: this.parked.x, z: this.parked.z, h: this.parked.h } : null
    };
    const hour = ((S.worldTime % 1) + 1) % 1 * 24;
    if (hour < 4 && p.speed > 8) {
      S.nightDrive += dt;
      career.checkAchievements();
    }
    this._traffic(dt);
    if (!this.challenge) {
      wanted.update(dt, p, this.city);
      roles.update(dt);
      this.police = wanted.cops[0] || null;
    }
    this._prompt(input);
    this._maybeWreck(p);
    this.msgs.forEach((m) => (m.t -= dt));
    this.msgs = this.msgs.filter((m) => m.t > 0);
  },

  _maybeWreck(p) {
    if (p.damage >= 100 && !(p.invuln > 0) && !(p.wreckHold > 0)) this._beginWreck(p);
  },

  _beginWreck(p) {
    wrecks.boom(p.x, p.y || 0, p.z, this.fx);
    if (p.mesh) p.mesh.visible = false;
    p.vx = p.vz = 0;
    p.speed = 0;
    p.wreckHold = 0.8;
    p.invuln = 3.4;
    career.noteWreck();
    if (p.stolen) {
      p.towKind = 'stolen';
      p.damage = 100;
      wanted.offense('wreck', 8);
      this.msgs.unshift({ text: 'Stolen car detonates', t: 2.2, color: '#ff3b6b' });
      return;
    }
    p.damage = 20;
    career.currentCar().damage = 20;
    if (this.challenge) {
      const ch = this.challenge;
      p.towKind = 'gate';
      ch.t += 8;
      const gates = ch.def.cps;
      if (ch.cp > 0) {
        const g = gates[ch.cp - 1];
        p.respawn = { x: g[0], z: g[1], h: p.h };
      } else if (ch.origin) {
        p.respawn = { x: ch.origin.x, z: ch.origin.z, h: ch.origin.h };
      } else {
        p.respawn = { x: p.x, z: p.z, h: p.h };
      }
      this.msgs.unshift({ text: 'WRECK  +8.0s', t: 2.4, color: '#ff3b6b' });
    } else if (wanted.stars > 0) {
      p.towKind = 'bust';
      this.msgs.unshift({ text: 'Car exploded. That is a bust.', t: 2.4, color: '#ff3b6b' });
    } else {
      p.towKind = 'tow';
      this.msgs.unshift({ text: 'Totaled. Tow truck is on the way.', t: 2.2, color: '#ff8a2e' });
    }
  },

  _finishWreck(p) {
    p.wreckHold = 0;
    const kind = p.towKind;
    p.towKind = null;
    if (kind === 'stolen') {
      this._reclaim();
      this.msgs.unshift({ text: 'Back in your own car', t: 2.2, color: '#ffe03b' });
      return;
    }
    if (p.mesh) p.mesh.visible = true;
    if (kind === 'gate') {
      const r = p.respawn || { x: p.x, z: p.z, h: p.h };
      p.x = r.x; p.z = r.z; p.h = r.h;
      p.vx = p.vz = 0; p.speed = 0;
      p.damage = 22;
      career.currentCar().damage = 22;
      p.invuln = 2.6;
      return;
    }
    if (kind === 'bust') {
      p.damage = 22;
      career.currentCar().damage = 22;
      wanted._bust(p, this.city);
      p.damage = Math.min(60, p.damage);
      career.currentCar().damage = p.damage;
      p.invuln = 3;
      if (p.mesh) p.mesh.visible = true;
      return;
    }
    const fee = 260;
    const paid = Math.min(career.state.money, fee);
    career.addMoney(-paid);
    const s = this.city.spawn;
    p.x = s.x; p.z = s.z; p.h = s.h || 0;
    p.vx = p.vz = 0; p.speed = 0;
    p.damage = 28;
    career.currentCar().damage = 28;
    p.invuln = 2.6;
    career.save();
    this.msgs.unshift({ text: 'Towed to the garage · $' + paid, t: 2.6, color: '#ffb02e' });
  },

  _grip() {
    const w = this.weather || 'clear';
    const g = (RL.WEATHER[w] || RL.WEATHER.clear).grip;
    return g;
  },

  _reset(p) {
    const n = this.city.nearestRoad(p.x, p.z);
    p.x = n.x; p.z = n.z; p.h = n.h; p.vx = p.vz = 0; p.speed = 0;
  },

  _traffic(dt) {
    const pitch = 86;
    const half = 3;
    const p = this.player;
    const clock = this.city.signalT || 0;
    for (const c of this.traffic) {
      c.bumped = Math.max(0, (c.bumped || 0) - dt);
      const tx = c.ni * pitch, tz = c.nj * pitch;
      const dx = tx - c.x, dz = tz - c.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3.5) {
        const options = [];
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (di === -c.di && dj === -c.dj) continue;
          const ni = c.ni + di, nj = c.nj + dj;
          if (ni < -half || ni > half || nj < -half || nj > half) continue;
          options.push([di, dj]);
        }
        const turn = options.length ? options[Math.floor(Math.random() * options.length)] : [-c.di, -c.dj];
        c.di = turn[0]; c.dj = turn[1];
        c.ni += c.di; c.nj += c.dj;
      }
      const want = Math.atan2(dx, dz);
      c.h = angNorm(c.h + clamp(angNorm(want - c.h), -2.4 * dt, 2.4 * dt));
      let sp = c.cruise;
      if (dist < 16 && dist > 5 && lightIsRed(clock, Math.atan2(c.di, c.dj))) sp = 0;
      const ahead = Math.hypot(p.x - c.x, p.z - c.z);
      if (ahead < 8) sp *= 0.35;
      if (career.state.role === 'police' && ahead < 14) sp *= 0.55;
      c.x += Math.sin(c.h) * sp * dt;
      c.z += Math.cos(c.h) * sp * dt;
      c.speed = sp;
      if (ahead < 2.35 && p.speed > 5 && c.bumped <= 0 && !p.wreckHold) {
        c.bumped = 1.3;
        const nx = (p.x - c.x) / Math.max(0.2, ahead), nz = (p.z - c.z) / Math.max(0.2, ahead);
        p.vx += nx * 4; p.vz += nz * 4;
        if (!(p.invuln > 0)) {
          this._writeDamage(p, clamp(p.damage + (p.speed < 10 ? 1.2 : 3), 0, 100));
        }
        c.damage = Math.min(100, (c.damage || 0) + 10 + p.speed * 0.55);
        if (this.fx) this.fx.sparks((p.x + c.x) / 2, 0.4, (p.z + c.z) / 2, 6);
        const bump = p.speed < 8 ? 0.4 : p.speed < 14 ? 2 : 8;
        wanted.offense('traffic', bump, { quiet: bump < 1 });
        if (bump >= 1) this.msgs.push({ text: 'Hit traffic', t: 1.2, color: '#ff8a2e' });
        if (c.damage >= 100) this._scrapTraffic(c);
      }
    }
    this.traffic = this.traffic.filter((c) => !c.dead);
  },

  _scrapTraffic(c) {
    if (c.dead) return;
    c.dead = true;
    wrecks.boom(c.x, 0.4, c.z, this.fx);
    wanted.offense('wreck', c.tier >= 3 ? 7 : 4.5);
    if (c.mesh) {
      gfx.world.remove(c.mesh);
      disposeCar(c.mesh);
      c.mesh = null;
    }
  },

  _prompt(input) {
    if (this.challenge) { this.prompt = null; return; }
    const p = this.player;
    if (p.onFoot && this.mount) {
      const d = Math.hypot(p.x - this.mount.x, p.z - this.mount.z);
      if (d < 4.6) {
        this.prompt = { kind: 'enter', text: 'Get in the car  [Q]' };
        if (input.hit('action')) this.enterCar();
      } else this.prompt = { kind: 'foot', text: 'On foot. Get back to the car.' };
      return;
    }
    const extra = roles.promptExtra();
    if (extra) { this.prompt = { kind: 'job', text: extra }; return; }
    let rival = null;
    for (const r of this.rivals) {
      if (Math.hypot(r.car.x - p.x, r.car.z - p.z) < 8) rival = r;
    }
    if (rival) {
      if ((career.state.role || 'neutral') === 'police') {
        this.prompt = { kind: 'bust', text: 'Intercept ' + rival.def.name + '  [E]' };
        if (input.hit('action')) roles.beginIntercept(rival);
        return;
      }
      const beaten = career.state.flags['street_' + rival.def.id];
      this.prompt = { kind: 'street', id: rival.def.id, text: (beaten ? 'Rematch' : 'Street race') + ': ' + rival.def.name + '  [E]' };
      if (input.hit('action')) this.startChallenge(rival.def.id);
      return;
    }
    const strip = this.city.strip;
    if (Math.abs(p.x - strip.x) < 8 && p.z < strip.z0 + 20 && p.z > strip.z0) {
      this.prompt = { kind: 'drag', text: 'Quarter mile — stage a race  [E]' };
      if (input.hit('action') && this.onDrag) this.onDrag();
      return;
    }
    const lot = lotAt(this.city, p.x, p.z);
    if (lot && p.speed <= 7) {
      if (lot.id === 'garage' && career.state.impound > 0) {
        this.prompt = { kind: 'impound', text: 'Pay impound ' + career.state.impound + '  [E]' };
        if (input.hit('action')) this._payImpound();
        return;
      }
      if (lot.id === 'police') {
        if (wanted.stars > 0 && career.state.role !== 'police') {
          this.prompt = { kind: 'hq', text: 'HQ is shut. Lose the heat first.' };
          return;
        }
        this.prompt = { kind: 'hq', text: 'HQ — role, rank, duty  [E]' };
        if (input.hit('action') && this.onPoi) this.onPoi('hq');
        return;
      }
      if (lot.id === 'bar' && career.state.role === 'criminal') {
        this.prompt = { kind: 'jobs', text: 'Hideout — crew jobs  [E]' };
        if (input.hit('action') && this.onPoi) this.onPoi('jobs');
        return;
      }
      if (lot.id === 'warehouse') {
        if (career.state.role === 'criminal') {
          this.prompt = { kind: 'jobs', text: 'Harbor hideout — load a run  [E]' };
          if (input.hit('action') && this.onPoi) this.onPoi('jobs');
        } else {
          this.prompt = { kind: 'warehouse', text: 'Harbor Co. — criminals load after midnight' };
          if (input.hit('action') && this.onMark) this.onMark(lot);
        }
        return;
      }
      if (lot.id === 'bank') {
        if (career.state.role === 'criminal') {
          this.prompt = { kind: 'bank', text: 'Heist the bank  [E]' };
          if (input.hit('action') && this.onPoi) this.onPoi('bank');
        } else {
          this.prompt = { kind: 'bank', text: 'Neon Bank — the vault stays shut' };
          if (input.hit('action') && this.onMark) this.onMark(lot);
        }
        return;
      }
      if (lot.id === 'vista') {
        this.prompt = { kind: 'vista', text: 'Vista — photograph the city  [E]' };
        if (input.hit('action') && this.onPoi) this.onPoi('vista');
        return;
      }
      this.prompt = { kind: lot.id, text: lot.name + '  [E]' };
      if (input.hit('action') && this.onPoi) this.onPoi(lot.id);
      return;
    }
    if (lot) { this.prompt = { kind: lot.id, text: 'Slow down to pull into ' + lot.name }; return; }
    const mark = nearestLandmark(this.city, p.x, p.z, 12);
    if (mark && p.speed < 8) {
      this.prompt = { kind: 'mark', text: mark.name + '  [E]' };
      if (input.hit('action') && this.onMark) this.onMark(mark);
      return;
    }
    if (this.parked && Math.hypot(p.x - this.parked.x, p.z - this.parked.z) < 5.5 && p.speed < 8) {
      this.prompt = { kind: 'reclaim', text: 'Get back in your car  [E]' };
      if (input.hit('action')) this._reclaim();
      return;
    }
    let jack = null;
    let jackD = 4.4;
    for (const c of this.traffic) {
      if (c.dead) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < jackD && p.speed < 11 && Math.abs(p.speed - c.speed) < 8) { jack = c; jackD = d; }
    }
    if (jack) {
      const hp = Math.max(0, Math.round(100 - (jack.damage || 0)));
      this.prompt = { kind: 'steal', text: 'Steal tier ' + jack.tier + ' ' + jack.def.name + ' · ' + hp + '%  [E]' };
      if (input.hit('action')) this._steal(jack);
      return;
    }
    this.prompt = null;
  },

  _steal(car) {
    const p = this.player;
    if (!p || !car || car.dead || !car.mesh) return;
    if (!p.stolen) {
      const owned = p.mesh;
      this.parked = { mesh: owned, x: p.x, z: p.z, h: p.h };
    } else if (p.mesh) {
      gfx.world.remove(p.mesh);
      disposeCar(p.mesh);
    }
    this.traffic = this.traffic.filter((c) => c !== car);
    p.mesh = car.mesh;
    p.def = car.def;
    p.p = physFromStats(car.def.s);
    p.damage = car.damage || 0;
    p.stolen = { id: car.def.id, name: car.def.name, tier: car.tier || car.def.league, maxHp: car.maxHp };
    p.x = car.x; p.z = car.z; p.h = car.h;
    p.vx = p.vz = 0;
    p.speed = car.speed || 0;
    wanted.offense('steal', 11);
    this.msgs.push({ text: 'Stole a tier ' + p.stolen.tier + ' ' + p.stolen.name, t: 2.2, color: '#ff2ef0' });
  },

  _reclaim() {
    const p = this.player;
    const park = this.parked;
    if (!p || !park || !park.mesh) return;
    if (p.mesh && p.mesh !== park.mesh) {
      gfx.world.remove(p.mesh);
      disposeCar(p.mesh);
    }
    const car = career.currentCar();
    p.mesh = park.mesh;
    p.mesh.visible = true;
    p.def = career.carDef(car.id);
    p.p = physFromStats(career.carStats(car));
    p.damage = car.damage || 0;
    p.stolen = null;
    p.x = park.x; p.z = park.z; p.h = park.h;
    p.vx = p.vz = 0; p.speed = 0;
    p.invuln = Math.max(p.invuln || 0, 1.2);
    this.parked = null;
    if (career.state && career.state.hub3d) career.state.hub3d.stolen = null;
  },

  _payImpound() {
    const fee = career.state.impound || 0;
    if (career.state.money < fee) { this.msgs.push({ text: 'Not enough to release the car', t: 2, color: '#ff3b6b' }); return; }
    career.addMoney(-fee);
    career.state.impound = 0;
    career.save();
    this.msgs.push({ text: 'Car released', t: 2, color: '#7dff5a' });
  },

  startChallenge(id) {
    const rival = this.rivals.find((r) => r.def.id === id);
    if (!rival) return;
    const league = Math.max(career.state.league, rival.def.league);
    const L = career.leagueData(Math.min(4, league));
    const skill = 0.78 + 0.07 * league;
    const st = {};
    const base = rival.car.def.s;
    for (const k in base) st[k] = base[k] + L.aiBonus * 0.5;
    rival.car.p = physFromStats(st);
    rival.car.p.maxSpeed *= skill;
    rival.car.p.accel *= skill;
    rival.car.nitro = 70;
    rival.car.finished = false;
    this.challenge = {
      def: rival.def, rival: rival.car, cp: 0, aiCp: 0, t: 0,
      playerDone: false, aiDone: false,
      origin: { x: this.player.x, z: this.player.z, h: this.player.h }
    };
    this.msgs.push({ text: rival.def.name + ' — first through every gate', t: 2.6, color: '#ffe03b' });
    wanted.offense('race', 26);
  },

  _updateChallenge(dt, inp, mods) {
    const ch = this.challenge;
    const p = this.player;
    ch.t += dt;
    stepVehicle(p, inp, dt, { weatherGrip: this._grip(), mods, hasPerk: (id) => career.hasPerk(id) });
    const gates = ch.def.cps;
    const g = gates[ch.cp];
    if (g && Math.hypot(p.x - g[0], p.z - g[1]) < 8) {
      ch.cp++;
      this.msgs.push({ text: 'Gate ' + ch.cp + '/' + gates.length, t: 1, color: '#2ee6ff' });
      if (ch.cp >= gates.length) ch.playerDone = true;
    }
    const ai = ch.rival;
    if (ai.exploded) {
      if (ch.playerDone || ch.t > 100) this._closeChallenge(ch, !!ch.playerDone);
      return;
    }
    const ag = gates[Math.min(ch.aiCp, gates.length - 1)];
    const sin = seekInput(ai, ag[0], ag[1], ai.p.maxSpeed);
    ai.offroad = !this.city.isRoad(ai.x, ai.z);
    stepVehicle(ai, sin, dt, { weatherGrip: this._grip(), mods: { steerResp: 9, driftGrip: 1.6, driftCharge: 10, nitroBurn: 18, draft: 1 }, hasPerk: () => false });
    const hit = resolveCity(this.city, ai.x, ai.z, ai.vx, ai.vz, 1.2);
    ai.x = hit.x; ai.z = hit.z; ai.vx = hit.vx; ai.vz = hit.vz;
    ai.hitCd = Math.max(0, (ai.hitCd || 0) - dt);
    if (hit.impact > 10 && ai.hitCd <= 0) {
      ai.hitCd = 0.35;
      ai.damage = Math.min(100, (ai.damage || 0) + hit.impact * 0.45);
    }
    if (Math.hypot(ai.x - p.x, ai.z - p.z) < 2.45 && p.speed > 6 && ai.hitCd <= 0) {
      ai.hitCd = 0.4;
      ai.damage = Math.min(100, (ai.damage || 0) + 16);
      if (!(p.invuln > 0)) this._writeDamage(p, clamp(p.damage + 4, 0, 100));
    }
    if (ai.damage >= 100) {
      wrecks.boom(ai.x, ai.y || 0, ai.z, this.fx);
      ai.exploded = true;
      ai.damage = 100;
      if (ai.mesh) ai.mesh.visible = false;
      this.msgs.unshift({ text: ai.name + ' exploded', t: 1.8, color: '#ff8a2e' });
      return;
    }
    if (Math.hypot(ai.x - ag[0], ai.z - ag[1]) < 8) {
      ch.aiCp++;
      if (ch.aiCp >= gates.length) ch.aiDone = true;
    }
    if (ch.playerDone || ch.aiDone || ch.t > 100) {
      const win = ch.playerDone && !ch.aiDone;
      this._closeChallenge(ch, win);
    }
  },

  _closeChallenge(ch, win) {
    const p = this.player;
    const ai = ch.rival;
    const res = {
      cfg: { kind: 'street', league: career.state.league, streetId: ch.def.id, reward: ch.def.reward, title: ch.def.name, laps: 1 },
      position: win ? 1 : 2,
      cars: 2, finished: true, totalTime: ch.t, drift: 0,
      damageEnd: p.damage, damageTaken: 0, wallHits: 0, carHits: 0,
      nitroTime: 0, draftTime: 0, topSpeed: Math.round(p.speed * 3.6),
      standings: [
        { name: career.state.name, isPlayer: true, time: ch.playerDone ? ch.t : null },
        { name: ai.name, isPlayer: false, time: ch.aiDone ? ch.t : null, out: !!ai.exploded }
      ]
    };
    this.challenge = null;
    const spot = this.rivals.find((r) => r.def.id === ch.def.id);
    if (spot) {
      ai.x = spot.def.x + 3.2;
      ai.z = spot.def.z;
      ai.vx = ai.vz = 0;
      ai.h = spot.def.h;
      ai.exploded = false;
      ai.damage = 0;
      if (ai.mesh) ai.mesh.visible = true;
    }
    if (this.onStreetFinish) this.onStreetFinish(res);
  },

  exitCar() {
    const p = this.player;
    if (!p || p.onFoot || this.challenge || p.wreckHold > 0) return false;
    if (p.speed > 4) return false;
    if (p.hp == null) p.hp = 100;
    this.mount = {
      mesh: p.mesh, x: p.x, z: p.z, h: p.h,
      def: p.def, pstats: p.p, damage: p.damage, stolen: p.stolen, nitro: p.nitro
    };
    const person = makePerson('#c9a27a', false);
    gfx.world.add(person);
    p.mesh = person;
    p.onFoot = true;
    p.x += Math.cos(p.h) * 2.2;
    p.z -= Math.sin(p.h) * 2.2;
    p.vx = p.vz = 0;
    p.speed = 0;
    p.nitroOn = false;
    return true;
  },

  enterCar() {
    const p = this.player;
    const m = this.mount;
    if (!p || !p.onFoot || !m || !m.mesh) return false;
    if (Math.hypot(p.x - m.x, p.z - m.z) > 4.6) return false;
    return this._forceEnter();
  },

  _forceEnter() {
    const p = this.player;
    const m = this.mount;
    if (!p || !m || !m.mesh) return false;
    if (p.mesh && p.onFoot) {
      gfx.world.remove(p.mesh);
      disposePerson(p.mesh);
    }
    p.mesh = m.mesh;
    p.mesh.visible = true;
    p.x = m.x; p.z = m.z; p.h = m.h;
    p.def = m.def; p.p = m.pstats; p.damage = m.damage; p.stolen = m.stolen; p.nitro = m.nitro;
    p.onFoot = false;
    p.vx = p.vz = 0;
    p.speed = 0;
    this.mount = null;
    return true;
  },

  /** Drop the player back in the car at a garage or hospital curb. */
  recover(spot) {
    const p = this.player;
    if (!p || !spot) return;
    if (p.onFoot) this._forceEnter();
    p.x = spot.x; p.z = spot.z; p.h = spot.h || 0;
    p.vx = p.vz = 0; p.speed = 0;
    p.hp = 100;
    p.invuln = 6;
    p.hurtT = 0;
    p.wreckHold = 0;
    p.damage = Math.min(p.damage || 0, 35);
    if (!p.stolen && career.currentCar()) career.currentCar().damage = p.damage;
    if (p.mesh) p.mesh.visible = true;
  },

  _stepOnFoot(p, inp, dt) {
    if (inp.nitro && (p.sprintCd || 0) <= 0) p.sprint = Math.min(1.4, (p.sprint || 0) + dt);
    else p.sprint = Math.max(0, (p.sprint || 0) - dt);
    if ((p.sprint || 0) <= 0 && inp.nitro) p.sprintCd = Math.min(2, (p.sprintCd || 0) + dt);
    else p.sprintCd = Math.max(0, (p.sprintCd || 0) - dt);
    const sprinting = inp.nitro && p.sprint > 0.05;
    p.h = angNorm(p.h + (inp.steer || 0) * 2.6 * dt);
    let sp = 0;
    if (inp.throttle) sp = sprinting ? 7.4 : 5.4;
    else if (inp.brake) sp = -3.4;
    const f = forwardXZ(p.h);
    p.vx = f.x * sp;
    p.vz = f.z * sp;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    const hit = resolveCity(this.city, p.x, p.z, p.vx, p.vz, 0.45);
    p.x = hit.x; p.z = hit.z; p.vx = hit.vx; p.vz = hit.vz;
    p.speed = Math.hypot(p.vx, p.vz);
    p.vf = sp;
  },

  present(dt) {
    if (!this.player) return;
    const night = gfx.night;
    const p = this.player;
    if (p.onFoot && p.mesh) {
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.h;
      if (p.hurtT > 0 && p.mesh.userData.bodyMat) p.mesh.userData.bodyMat.emissiveIntensity = 0.6;
      else if (p.mesh.userData.bodyMat) p.mesh.userData.bodyMat.emissiveIntensity = 0;
      if (this.mount && this.mount.mesh) {
        updateCarVisual(this.mount.mesh, dt, {
          x: this.mount.x, z: this.mount.z, h: this.mount.h, speed: 0, night
        });
      }
    } else {
      updateCarVisual(p.mesh, dt, {
        x: p.x, z: p.z, h: p.h, speed: p.speed, steer: p.steer,
        nitro: p.nitroOn, brake: p.vf < -0.4, night, latVel: p.vl, reverse: p.vf < 0
      });
    }
    if (this.parked && this.parked.mesh) {
      updateCarVisual(this.parked.mesh, dt, {
        x: this.parked.x, z: this.parked.z, h: this.parked.h, speed: 0, night
      });
    }
    for (const c of this.traffic) {
      updateCarVisual(c.mesh, dt, { x: c.x, z: c.z, h: c.h, speed: c.speed, night });
    }
    for (const r of this.rivals) {
      const c = r.car;
      const racing = this.challenge && this.challenge.rival === c;
      updateCarVisual(c.mesh, dt, { x: c.x, z: c.z, h: c.h, speed: c.speed, steer: c.steer, nitro: racing && c.nitroOn, night });
    }
    wanted.present(dt);
    roles.present(dt);
    gfx.frame(p, dt, 6.2, this.city.query);
    gfx.follow({ x: p.x, y: 0, z: p.z }, night, this.city.lamps);
  }
};
