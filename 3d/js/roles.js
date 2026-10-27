/* roles.js — Neutral, Criminal, Police.
   Switch at the HQ lot (the police station) on a cooldown, and only with
   a clean plate. Each role keeps its own rank, missions, and payout rules.
   Criminal jobs are heists and smuggling runs. Police work is ram-or-box
   pursuits against AI criminals and the parked street racers. */

import { career } from './state.js';
import { wanted } from './wanted.js';
import { gfx } from './renderer.js';
import { buildCar, updateCarVisual, disposeCar } from './cars.js';
import { blankVehicle, stepVehicle, physFromStats } from './drive.js';
import { seekInput } from './ai.js';
import { resolveCity, lotAt } from './city.js';
import { rand, pick } from './util.js';

export const ROLE_ORDER = ['neutral', 'criminal', 'police'];
const XP_STEPS = [0, 40, 110, 200, 320];
const COOLDOWN = 60000;

export const ROLE_INFO = {
  neutral: {
    name: 'Neutral',
    ranks: ['Unknown', 'Regular', 'Name on the list', 'Contender', 'City Legend'],
    perks: ['Race purse as posted', 'Wins pay +5%', 'Wins pay +10%', 'Wins pay +15%', 'Wins pay +20%'],
    blurb: 'You are a racer. Police ignore a lively pace. They show up for red lights, wrecks, street races, and triple-digit runs.'
  },
  criminal: {
    name: 'Criminal',
    ranks: ['Associate', 'Runner', 'Thief', 'Smuggler', 'Kingpin'],
    perks: ['Heat climbs 65% faster', 'Job pay +15%', 'Underglow kit', 'Spike strips hurt half as much', 'Heat −15% and job pay +35%'],
    blurb: 'Heists and smuggling pay big. Every noisy minute puts stars on the board faster than a civilian would earn them.'
  },
  police: {
    name: 'Police',
    ranks: ['Cadet', 'Officer', 'Sergeant', 'Lieutenant', 'Chief'],
    perks: ['Bounties as posted', 'Wider bust window', 'Bounty +20%', 'Siren slows a runner', 'Bounty +50%'],
    blurb: 'The livery is yours. Ram a runner or sit on their nose until they box themselves. Street racers are fair game. You do not take heat.'
  }
};

export function rankIndex(xp) {
  let i = 0;
  for (let k = 0; k < XP_STEPS.length; k++) if ((xp || 0) >= XP_STEPS[k]) i = k;
  return i;
}

export function rankName(role) {
  const info = ROLE_INFO[role] || ROLE_INFO.neutral;
  const xp = career.state && career.state.roleXp ? career.state.roleXp[role] || 0 : 0;
  return info.ranks[rankIndex(xp)];
}

export function switchWait() {
  if (!career.state) return 0;
  return Math.max(0, (career.state.roleSwitchAt || 0) + COOLDOWN - Date.now());
}

export const roles = {
  hub: null,
  job: null,
  suspect: null,
  suspectCd: 2,
  boxT: 0,
  onChange: null,

  bind(hub) { this.hub = hub; },

  note(text, color) {
    if (this.hub && this.hub.msgs) this.hub.msgs.push({ text, t: 2.6, color: color || '#ffe03b' });
  },

  switchTo(id, opt) {
    const s = career.state;
    if (!s || !ROLE_INFO[id]) return { ok: false, reason: 'bad' };
    if (s.role === id) return { ok: false, reason: 'same' };
    const force = opt && opt.force;
    if (!force) {
      if (wanted.stars > 0) return { ok: false, reason: 'heat' };
      const wait = switchWait();
      if (wait > 0) return { ok: false, reason: 'cooldown', wait };
    }
    s.role = id;
    s.roleSwitchAt = Date.now();
    s.roleCooldownUntil = s.roleSwitchAt + 60000;
    s.totals.roleSwitches = (s.totals.roleSwitches || 0) + 1;
    this._applyLook();
    if (id === 'police') wanted.pardon();
    this.clearDuty();
    career.checkAchievements();
    career.save();
    if (this.onChange) this.onChange();
    this.note('Now ' + ROLE_INFO[id].name, '#2ee6ff');
    return { ok: true };
  },

  _applyLook() {
    const s = career.state;
    const car = career.currentCar();
    if (!car.style) car.style = { color: null, rims: 0, decal: 'none', underglow: false };
    if (s.role === 'police') {
      if (!s.lookBackup) {
        s.lookBackup = { color: car.style.color, rims: car.style.rims, decal: car.style.decal, underglow: !!car.style.underglow };
      }
      car.style.color = '#1a3a7a';
      car.style.decal = 'stripes';
      car.style.underglow = false;
    } else if (s.lookBackup) {
      Object.assign(car.style, s.lookBackup);
      s.lookBackup = null;
    }
    car.style.siren = s.role === 'police';
    const ri = rankIndex(s.roleXp.criminal || 0);
    if (s.role === 'criminal' && ri >= 2 && !s.flags.crimeLook) {
      s.flags.crimeLook = true;
      car.style.underglow = true;
      if (!car.style.color) car.style.color = '#ff2a4a';
      this.note('Underglow kit unlocked', '#ff2ef0');
    }
  },

  refreshLook() { if (career.state) this._applyLook(); },

  clearDuty() {
    this.job = null;
    this._dropSuspect();
    this.boxT = 0;
    this.suspectCd = 3;
  },

  failJob(why) {
    if (!this.job && why !== 'busted') return;
    this.job = null;
    if (why === 'busted') this.note('Job burned. They have the car.', '#ff3b6b');
    else this.note(why || 'Job failed', '#ff3b6b');
  },

  startHeist(preferId) {
    if (!this.hub || this.job) return;
    const lots = this.hub.city.pois.filter((p) => p.id !== 'bar' && p.id !== 'police' && p.id !== 'hospital');
    const prefer = preferId && lots.find((p) => p.id === preferId);
    const scored = lots.filter((p) => p.id === 'bank' || p.id === 'mart');
    const site = prefer || pick(scored.length ? scored : lots);
    let drop = pick(lots.filter((p) => p !== site)) || site;
    this.job = { type: 'heist', phase: 'site', site, drop, hold: 0, t: 0 };
    wanted.offense('job', 28);
    this.note('Heist: hold still in the ' + site.name + ' lot', '#ff2ef0');
  },

  startSmuggle() {
    if (!this.hub || this.job) return;
    const shop = this.hub.city.pois.find((p) => p.id === 'warehouse') || this.hub.city.pois.find((p) => p.id === 'shop') || this.hub.city.pois[0];
    const drop = this.hub.city.pois.find((p) => p.id === 'dealer') || this.hub.city.pois.find((p) => p.id === 'bank') || this.hub.city.pois[1];
    this.job = { type: 'smuggle', phase: 'pickup', site: shop, drop, t: 0, limit: 80 };
    this.note('Pickup at ' + shop.name + ', drop at ' + drop.name, '#ff8a2e');
  },

  startPursuit() {
    if (!this.hub || (career.state.role !== 'police')) return;
    this._dropSuspect();
    this._spawnSuspect(true);
    this.job = { type: 'pursuit', t: 0, limit: 70 };
    this.note('Pursuit authorized. Ram them or box the nose.', '#3fa9ff');
  },

  beginIntercept(rival) {
    if (!rival || !this.hub) return;
    this._dropSuspect();
    const car = rival.car;
    car.p = physFromStats(car.def.s);
    car.p.maxSpeed *= 0.9 + 0.05 * (rival.def.league || 1);
    this.suspect = car;
    this.suspectOwned = false;
    this.suspectLeague = rival.def.league || 1;
    this.boxT = 0;
    this.job = { type: 'intercept', t: 0, limit: 60, name: rival.def.name };
    this.note('Intercept ' + rival.def.name, '#3fa9ff');
  },

  update(dt) {
    const hub = this.hub;
    if (!hub || !hub.player || !career.state) return;
    if (career.state.role === 'police') this._police(dt);
    else this._jobs(dt);
  },

  _jobs(dt) {
    const job = this.job;
    if (!job || !this.hub) return;
    const p = this.hub.player;
    job.t += dt;
    if (job.type === 'heist') {
      const lot = job.phase === 'site' ? job.site : job.drop;
      const there = lotAt(this.hub.city, p.x, p.z) === lot || (lot && Math.hypot(p.x - lot.x, p.z - lot.z) < Math.max(lot.hx, lot.hz));
      if (job.phase === 'site' && there && p.speed < 2.2) {
        job.hold += dt;
        if (job.hold > 4) {
          job.phase = 'drop';
          job.hold = 0;
          wanted.offense('job', 18);
          this.note('Got it. Dump the take at ' + job.drop.name, '#ff2ef0');
        }
      }
      if (job.phase === 'drop' && there && p.speed < 3) this._payJob('heist', 900 + rankIndex(career.state.roleXp.criminal) * 180, 22);
    } else if (job.type === 'smuggle') {
      const here = lotAt(this.hub.city, p.x, p.z);
      if (job.phase === 'pickup' && here && here.id === job.site.id && p.speed < 3) {
        job.phase = 'drop';
        this.note('Package aboard. Don\'t get busted.', '#ff8a2e');
        wanted.offense('job', 12);
      } else if (job.phase === 'drop' && here && here.id === job.drop.id && p.speed < 3) {
        this._payJob('smuggle', 520 + rankIndex(career.state.roleXp.criminal) * 90, 14);
      }
      if (job.t > job.limit) this.failJob('The buyer left.');
    }
  },

  _payJob(kind, money, xp) {
    let mult = 1;
    const ri = rankIndex(career.state.roleXp.criminal || 0);
    if (ri >= 1) mult += 0.15;
    if (ri >= 4) mult += 0.35;
    const pay = Math.round(money * mult);
    career.addMoney(pay);
    career.state.roleXp.criminal = (career.state.roleXp.criminal || 0) + xp;
    if (kind === 'heist') career.state.totals.heists = (career.state.totals.heists || 0) + 1;
    else career.state.totals.deliveries = (career.state.totals.deliveries || 0) + 1;
    career.state.respect += 2;
    career.checkAchievements();
    career.save();
    this.job = null;
    this.note((kind === 'heist' ? 'Heist paid' : 'Delivery paid') + ' +$' + pay, '#7dff5a');
    this._rankNote('criminal');
  },

  _police(dt) {
    if (this.job && this.job.t != null) {
      this.job.t += dt;
      if (this.job.limit && this.job.t > this.job.limit) {
        this.note('They made the city limits.', '#ff8a2e');
        this.job = null;
        if (this.suspectOwned) this._dropSuspect();
        else this.suspect = null;
      }
    }
    if (!this.suspect && !this.job) {
      this.suspectCd -= dt;
      if (this.suspectCd <= 0) this._spawnSuspect(false);
    }
    const s = this.suspect;
    const p = this.hub.player;
    if (!s || !s.mesh) return;
    const flee = s.x + Math.sin(s.h) * 30 + (p.x - s.x) * -0.4;
    const fleeZ = s.z + Math.cos(s.h) * 30 + (p.z - s.z) * -0.4;
    let cap = s.p.maxSpeed;
    if (rankIndex(career.state.roleXp.police || 0) >= 3 && Math.hypot(p.x - s.x, p.z - s.z) < 30) cap *= 0.84;
    const inp = seekInput(s, flee, fleeZ, cap);
    s.offroad = !this.hub.city.isRoad(s.x, s.z);
    stepVehicle(s, inp, dt, { weatherGrip: 1, mods: { steerResp: 8, driftGrip: 1.5, driftCharge: 6, nitroBurn: 20, draft: 1 }, hasPerk: () => false });
    const hit = resolveCity(this.hub.city, s.x, s.z, s.vx, s.vz, 1.15);
    s.x = hit.x; s.z = hit.z; s.vx = hit.vx; s.vz = hit.vz;
    this._tryBust(dt, p, s);
  },

  _tryBust(dt, player, suspect) {
    const dx = player.x - suspect.x, dz = player.z - suspect.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const fx = Math.sin(suspect.h), fz = Math.cos(suspect.h);
    const ahead = dx * fx + dz * fz;
    const closing = -((player.vx - suspect.vx) * dx + (player.vz - suspect.vz) * dz) / dist;
    const ri = rankIndex(career.state.roleXp.police || 0);
    const ramDist = ri >= 1 ? 3.6 : 3.1;
    const ram = dist < ramDist && closing > 4 && player.speed > 8;
    if (ahead > 1 && ahead < (ri >= 1 ? 9 : 7.5) && dist < 8 && player.speed > 7 && suspect.speed > 6) this.boxT += dt;
    else this.boxT = Math.max(0, this.boxT - dt);
    if (ram || this.boxT > 2.3) this._bustSuspect(ram ? 'ram' : 'box');
  },

  _bustSuspect(how) {
    let mult = 1;
    const ri = rankIndex(career.state.roleXp.police || 0);
    if (ri >= 2) mult += 0.2;
    if (ri >= 4) mult += 0.5;
    const base = 180 + (this.suspectLeague || 1) * 80 + (this.job && this.job.type === 'pursuit' ? 200 : 0);
    const pay = Math.round(base * mult);
    career.addMoney(pay);
    career.state.respect += 1;
    career.state.roleXp.police = (career.state.roleXp.police || 0) + (this.job ? 16 : 10);
    career.state.totals.arrests = (career.state.totals.arrests || 0) + 1;
    career.checkAchievements();
    career.save();
    this.note((how === 'box' ? 'Boxed in' : 'Takedown') + ' +$' + pay, '#7dff5a');
    this._rankNote('police');
    this.boxT = 0;
    const owned = this.suspectOwned;
    this.job = null;
    if (owned) this._dropSuspect();
    else {
      const spot = this.hub.rivals && this.hub.rivals.find((r) => r.car === this.suspect);
      if (spot) {
        this.suspect.x = spot.def.x + 3.2;
        this.suspect.z = spot.def.z;
        this.suspect.vx = this.suspect.vz = 0;
        this.suspect.h = spot.def.h;
      }
      this.suspect = null;
    }
    this.suspectCd = 12;
  },

  _spawnSuspect(tough) {
    const defs = ['kei', 'coupe', 'dragon', 'brute'];
    const id = defs[Math.floor(rand(0, defs.length))] || 'coupe';
    const def = career.carDef(id);
    const mesh = buildCar(def.cls, { color: '#ff3b6b', rims: 1, decal: 'lightning', underglow: true }, { glow: '#ff3b6b' });
    gfx.world.add(mesh);
    const p = this.hub.player;
    const ang = rand(0, Math.PI * 2);
    const dist = rand(28, 48);
    const car = blankVehicle({
      mesh, def, name: 'Suspect',
      p: physFromStats(def.s),
      x: p.x + Math.sin(ang) * dist,
      z: p.z + Math.cos(ang) * dist,
      h: ang + Math.PI,
      nitro: 40
    });
    car.p.maxSpeed *= tough ? 1.05 : 0.92;
    this.suspect = car;
    this.suspectOwned = true;
    this.suspectLeague = tough ? 2 : 1;
    this.boxT = 0;
  },

  _dropSuspect() {
    if (this.suspect && this.suspectOwned && this.suspect.mesh) {
      gfx.world.remove(this.suspect.mesh);
      disposeCar(this.suspect.mesh);
    }
    this.suspect = null;
    this.suspectOwned = false;
  },

  present(dt) {
    const s = this.suspect;
    if (!s || !s.mesh || !this.suspectOwned) return;
    updateCarVisual(s.mesh, dt, { x: s.x, z: s.z, h: s.h, speed: s.speed, steer: s.steer, night: gfx.night });
  },

  meshes() {
    if (this.suspect && this.suspectOwned && this.suspect.mesh) return [this.suspect.mesh];
    return [];
  },

  _rankNote(role) {
    const xp = career.state.roleXp[role] || 0;
    const name = ROLE_INFO[role].ranks[rankIndex(xp)];
    if (xp === XP_STEPS[rankIndex(xp)]) this.note(ROLE_INFO[role].name + ' rank: ' + name, '#ffe03b');
  },

  promptExtra() {
    if (!career.state || !this.hub) return null;
    const p = this.hub.player;
    const lot = lotAt(this.hub.city, p.x, p.z);
    if (!lot || p.speed > 7) return null;
    if (this.job && this.job.type === 'heist') {
      const want = this.job.phase === 'site' ? this.job.site : this.job.drop;
      if (lot.id === want.id) return this.job.phase === 'site' ? 'Hold still — cracking the till' : 'Hold still — drop the take';
    }
    if (this.job && this.job.type === 'smuggle') {
      if (this.job.phase === 'pickup' && lot.id === this.job.site.id) return 'Hold still — load the package';
      if (this.job.phase === 'drop' && lot.id === this.job.drop.id) return 'Hold still — hand it off';
    }
    return null;
  }
};
