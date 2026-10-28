/* wanted.js — 1 to 5 star heat, in the spirit of a street-crime chase.
   Neutral drivers are left alone until the offense is loud. Criminals
   climb faster. A cop who earns a star loses the badge on that same tick.
   Stars bring more cars, then a roadblock, spike strips, and a helicopter
   that only loses you once you are off the street and sitting still.
   A star falls only after a long hide. The HUD counts that cooldown down.
   Being seen resets it. */

import * as THREE from 'three';
import { career } from './state.js';
import { gfx } from './renderer.js';
import { buildCar, updateCarVisual, disposeCar } from './cars.js';
import { blankVehicle, stepVehicle, physFromStats } from './drive.js';
import { seekInput } from './ai.js';
import { lightIsRed, intersectionAt, lotAt } from './city.js';
import { resolveCity } from './city.js';
import { wrecks } from './wrecks.js';
import { hideSeconds, formatCooldown, crimePay, BOUNTY_CAP, starsOf, starThreshold, starPay, HEAT_MAX } from './heat.js';
import { updateFoot, clearFoot, presentFoot, footMeshes, forceFoot, plant, strike, disposePerson, updateSight, clearSight, presentSight, sightMeshes } from './foot.js';

/* 1 star is one cruiser, or two once the bar is well filled. Never more than the 5-star squad. */
function copTarget(stars, heat) {
  if (stars <= 0) return 0;
  if (stars === 1) {
    const span = Math.max(1, starThreshold(2) - starThreshold(1));
    return heat >= starThreshold(1) + span * 0.55 ? 2 : 1;
  }
  return Math.min(5, stars);
}
/* m/s. A stock Pip is about 38 and a league-1 coupe about 44. Every star stays under that so a hard turn still opens a gap. */
const COP_CAP = [0, 22, 28, 33, 37, 41];

function rankOf(role) {
  const xp = career.state && career.state.roleXp ? career.state.roleXp[role] || 0 : 0;
  const steps = [0, 40, 110, 200, 320];
  let i = 0;
  for (let k = 0; k < steps.length; k++) if (xp >= steps[k]) i = k;
  return i;
}

function losClear(city, x0, z0, x1, z1) {
  const steps = 7;
  for (let i = 1; i < steps; i++) {
    const x = x0 + (x1 - x0) * (i / steps);
    const z = z0 + (z1 - z0) * (i / steps);
    const boxes = city.query(x, z, 0.5);
    for (const b of boxes) {
      if (b.kind === 'prop') continue;
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return false;
    }
  }
  return true;
}

export const wanted = {
  stars: 0,
  heat: 0,
  peak: 0,
  cops: [],
  heli: null,
  heliSearch: 0,
  propGroup: null,
  blocks: [],
  spikes: [],
  seen: false,
  bustT: 0,
  blockCd: 12,
  spikeCd: 10,
  redLatch: null,
  copHit: 0,
  speedT: 0,
  cleanT: 0,
  overSpeed: false,
  hiddenFor: 0,
  coolFrom: 0,
  shownBounty: 0,
  purse: 0,
  crimeAt: 0,
  respawnIn: 2,
  hub: null,
  onBust: null,
  onEvade: null,
  onPoliceWanted: null,

  bind(hub) { this.hub = hub; },

  pullBadge() {
    if (!career.state || career.state.role !== 'police' || this.stars <= 0 || !this.onPoliceWanted) return;
    this.onPoliceWanted();
  },

  msg(text, color) {
    if (this.hub && this.hub.msgs) this.hub.msgs.push({ text, t: 2.4, color: color || '#ff3b6b' });
  },

  reset() {
    this.clearUnits();
    this.stars = 0;
    this.heat = 0;
    this.peak = 0;
    this.seen = false;
    this.bustT = 0;
    this.redLatch = null;
    this.heliSearch = 0;
    this.speedT = 0;
    this.cleanT = 0;
    this.overSpeed = false;
    this.hiddenFor = 0;
    this.coolFrom = 0;
    this.purse = 0;
    this.shownBounty = 0;
    this.respawnIn = 2;
  },

  pardon() {
    this.peak = 0;
    this.heat = 0;
    this.stars = 0;
    this.hiddenFor = 0;
    this.coolFrom = 0;
    this.purse = 0;
    this.shownBounty = 0;
    if (career.state && career.state.wanted) career.state.wanted.bounty = 0;
    this.clearUnits();
  },

  /* The shared career stores heat. Switching views must not pay the bounty. */
  capture() {
    if (!career.state) return;
    const prev = (career.state.wanted && typeof career.state.wanted === 'object') ? career.state.wanted : {};
    const bounty = Math.max(0, Math.min(BOUNTY_CAP, Math.round(this.purse || Number(prev.bounty) || 0)));
    career.state.wanted = Object.assign({}, prev, {
      heat: this.heat || 0,
      stars: this.stars || 0,
      peak: Math.max(Number(prev.peak) || 0, this.peak || 0, this.stars || 0),
      bounty: bounty
    });
  },
  restore() {
    this.clearUnits();
    const w = career.state && career.state.wanted;
    this.heat = Math.max(0, Number(w && w.heat) || 0);
    this.stars = starsOf(this.heat);
    this.peak = Math.max(Number(w && w.peak) || 0, this.stars);
    this.purse = Math.max(0, Math.min(BOUNTY_CAP, Math.round(Number(w && w.bounty) || 0)));
    this.seen = false;
    this.bustT = 0;
    this.hiddenFor = 0;
    this.coolFrom = this.heat;
    this.shownBounty = this.bounty();
    if (this.stars > 0) {
      this.pullBadge();
      this._ensureCops();
    }
  },

  _addStarBounty(from, to) {
    if (!career.state) return;
    const role = career.state.role || 'neutral';
    if (role === 'police') return;
    let add = 0;
    for (let k = (from | 0) + 1; k <= (to | 0); k++) add += starPay(k, role);
    if (!(add > 0)) return;
    const cur = Math.max(0, Math.round(this.purse || 0));
    const next = Math.min(BOUNTY_CAP, cur + add);
    if (next === cur) return;
    this.purse = next;
    this.shownBounty = next;
    if (!career.state.wanted || typeof career.state.wanted !== 'object') career.state.wanted = {};
    career.state.wanted.bounty = next;
    this.msg((to > 1 ? to + ' stars' : '1 star') + ' — bounty +$' + (next - cur), '#fff');
    if (window.parent && window.parent !== window) {
      try { window.parent.postMessage({ type: 'rl-stars', stars: to, role: role }, '*'); } catch (e) { /* parent owns the server call */ }
    }
  },

  addCrime(kind) {
    if (!career.state) return 0;
    const role = career.state.role || 'neutral';
    if (role === 'police') return 0;
    const amt = crimePay(kind);
    if (!(amt > 0)) return 0;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - (this.crimeAt || 0) < 1000) return 0;
    this.crimeAt = now;
    const cur = Math.max(0, Math.round(this.purse || 0));
    const next = Math.min(BOUNTY_CAP, cur + amt);
    const gained = next - cur;
    if (!(gained > 0)) return 0;
    this.purse = next;
    this.shownBounty = next;
    if (!career.state.wanted || typeof career.state.wanted !== 'object') career.state.wanted = {};
    career.state.wanted.bounty = next;
    const label = kind === 'pedestrian' ? 'Pedestrian' : kind === 'wreck' ? 'Wreck' : 'Ram';
    this.msg(label + ' — bounty +$' + gained, '#fff');
    if (window.parent && window.parent !== window) {
      try { window.parent.postMessage({ type: 'rl-crime', kind: kind }, '*'); } catch (e) { /* parent owns the server call */ }
    }
    return gained;
  },

  /** One-shot offenses. Speeding is metered in update so a short burst barely counts. */
  offense(kind, amount, opt) {
    if (!career.state) return;
    const role = career.state.role || 'neutral';
    opt = opt || {};
    if (role === 'police' && opt.duty) return;
    let a = amount;
    if (!(a > 0)) return;
    if (role === 'criminal') {
      a *= 1.45;
      if (rankOf('criminal') >= 4) a *= 0.85;
    }
    // A nudge is not a felony. Grazes contribute a fraction of a point.
    if (a < 1) a *= 0.45;
    if (this.coolFrom > this.heat) this.heat = this.coolFrom;
    this.hiddenFor = 0;
    const beforeStars = this.stars;
    this.heat = Math.min(HEAT_MAX, this.heat + a);
    if (kind === 'robbery') {
      const need = starThreshold(beforeStars + 1);
      if (this.heat < need) this.heat = Math.min(HEAT_MAX, need);
    }
    this.coolFrom = this.heat;
    this.cleanT = 0;
    if (kind === 'red' && career.state.totals) career.state.totals.redLights = (career.state.totals.redLights || 0) + 1;
    if (!opt.quiet && a >= 2) {
      const label = {
        red: 'Ran the red', traffic: 'Hit traffic', cop: 'You hit a cruiser',
        race: 'Illegal street race', prop: 'Property damage', wreck: 'Wreck',
        steal: 'Grand theft auto', crash: 'Crash', speeding: 'Speeding'
      }[kind];
      if (label && kind !== 'red' && kind !== 'traffic' && kind !== 'cop') this.msg(label, '#ff8a2e');
    }
    this._sync();
    if (role === 'police' && this.stars > 0) this.pullBadge();
  },

  /** Standing bounty. Heat can fall. This number does not, until a bust. */
  bounty() {
    if (!career.state) return 0;
    if ((career.state.role || 'neutral') === 'police') return 0;
    return Math.max(0, Math.min(BOUNTY_CAP, Math.round(this.purse || 0)));
  },

  update(dt, player, city) {
    if (!player || !city || !career.state) return;
    this.pullBadge();
    let role = career.state.role || 'neutral';
    const lot = lotAt(city, player.x, player.z);
    if (role !== 'police') {
      const limitKmh = role === 'criminal' ? 80 : 118;
      const kmh = player.speed * 3.6;
      const over = !lot && city.isRoad(player.x, player.z) && kmh > limitKmh + 8;
      this.overSpeed = over;
      if (over) {
        this.speedT += dt;
        this.cleanT = 0;
        const major = kmh > limitKmh * 1.55;
        if (this.speedT >= (major ? 1.5 : 2.8)) {
          this.speedT = 0;
          this.offense('speeding', major ? 6 : 2.2, { quiet: !major });
        }
      } else this.speedT = Math.max(0, this.speedT - dt);
      const node = intersectionAt(player.x, player.z);
      if (node && lightIsRed(city.signalT || 0, player.h) && player.speed > 9) {
        if (this.redLatch !== node.key) {
          this.redLatch = node.key;
          this.offense('red', role === 'criminal' ? 16 : 12);
          this.msg('Ran the red', '#ff8a2e');
        }
      } else if (!node) this.redLatch = null;
    } else this.overSpeed = false;

    if (!this.overSpeed) this.cleanT += dt;
    // Stars do not cool while they are on the board. Only the hide cooldown drops one.
    if (this.stars <= 0 && this.heat > 0 && this.cleanT > 1.15 && !this.overSpeed) {
      const king = role === 'criminal' && rankOf('criminal') >= 4;
      let rate = 2;
      if (role === 'criminal' && !king) rate *= 0.78;
      this.heat = Math.max(0, this.heat - rate * dt);
    }
    this._sync();
    this.pullBadge();
    this.shownBounty = this.bounty();
    if (this.stars <= 0) {
      this.seen = false;
      this.hiddenFor = 0;
      if (this.cops.length) this._ensureCops();
      clearFoot(this);
      updateSight(this, dt, player, city);
      return;
    }
    if (this.beats && this.beats.length) clearSight(this);

    this._driveCops(dt, player, city);
    this._hazards(dt, player, city);
    this._heliLogic(dt, player, lot);

    let seen = false;
    for (const cop of this.cops) {
      const dist = Math.hypot(player.x - cop.x, player.z - cop.z);
      if (dist < 90 && losClear(city, cop.x, cop.z, player.x, player.z)) seen = true;
      if (!cop.dismounted && dist < 3.1 && player.speed > 6) {
        this.copHit -= dt;
        if (this.copHit <= 0) {
          this.copHit = 2;
          this.offense('cop', 30);
          this.msg('You hit a cruiser', '#ff3b6b');
        }
      }
    }
    if (this.stars >= 5 && this.heli && this.heliSearch < 2.4) seen = true;
    this.seen = seen;
    if (seen) {
      if (this.coolFrom > this.heat) this.heat = this.coolFrom;
      this.hiddenFor = 0;
    } else if (this.stars > 0) {
      if (this.hiddenFor <= 0) this.coolFrom = this.heat;
      const king = role === 'criminal' && rankOf('criminal') >= 4;
      const slow = (role === 'criminal' && !king) ? 0.78 : 1;
      this.hiddenFor += dt * slow;
      const need = this._hideNeed();
      const floor = this._bandFloor(this.stars);
      if (need > 0 && this.hiddenFor >= need) {
        this.heat = Math.max(0, floor - 0.02);
        this.hiddenFor = 0;
        this.coolFrom = this.heat;
      } else if (need > 0 && this.coolFrom > floor) {
        const t = this.hiddenFor / need;
        this.heat = Math.max(floor, this.coolFrom + (floor - this.coolFrom) * t);
      }
    }
    const want = copTarget(this.stars, this.heat);
    if (this.cops.length < want) {
      this.respawnIn -= dt;
      if (this.respawnIn <= 0) {
        this._ensureCops();
        this.respawnIn = 5.5;
      }
    } else this.respawnIn = 3.5;

    const touch = this.cops.some((c) => !c.dismounted && Math.hypot(player.x - c.x, player.z - c.z) < 4.7);
    if (touch && !player.onFoot) this.bustT += dt;
    else this.bustT = Math.max(0, this.bustT - dt * 0.6);
    const starsBefore = this.stars;
    if (this.bustT > 1.25) this._bust(player, city);
    else this._sync();
    if (this.stars > 0 && this.stars < starsBefore) this.msg('Star dropped — stay hidden', '#fff');
    updateFoot(this, dt, player, city);
  },

  _bandFloor(stars) {
    return starThreshold(Math.max(0, stars | 0));
  },

  _hideNeed() {
    const base = hideSeconds(this.stars);
    const role = (career.state && career.state.role) || 'neutral';
    const ghost = role === 'criminal' && rankOf('criminal') >= 4;
    return ghost ? base * 0.85 : base;
  },

  /** White HUD line. HIDDEN counts down. COOLDOWN is the full wait while they can see you. */
  cooldownLabel() {
    if (this.stars <= 0) return '';
    const need = this._hideNeed();
    const hiding = !this.seen;
    const left = hiding ? Math.max(0, need - this.hiddenFor) : need;
    const clock = formatCooldown(left);
    return hiding ? ('HIDDEN ' + clock) : ('COOLDOWN ' + clock);
  },

  present(dt) {
    presentFoot(this);
    presentSight(this);
    const night = 1;
    for (const c of this.cops) {
      if (!c.mesh) continue;
      updateCarVisual(c.mesh, dt, {
        x: c.x, z: c.z, h: c.h, speed: c.speed, steer: c.steer, nitro: c.nitroOn, night, latVel: c.vl
      });
    }
    if (this.heli) {
      this.heli.userData.rotor.rotation.y += dt * 28;
      const target = this.heli.userData.focus;
      const k = 1 - Math.exp(-1.6 * dt);
      this.heli.position.x += (target.x - this.heli.position.x) * k;
      this.heli.position.z += (target.z - this.heli.position.z) * k;
      this.heli.position.y = 26;
      this.heli.userData.aim.position.set(target.x, 0, target.z);
    }
  },

  _sync() {
    const next = starsOf(this.heat);
    if (next === this.stars) return;
    if (next > this.stars) {
      const prev = this.stars | 0;
      this.stars = next;
      this.peak = Math.max(this.peak, next);
      this._addStarBounty(prev, next);
      if (career.state) {
        career.state.totals.peakStars = Math.max(career.state.totals.peakStars || 0, next);
        career.checkAchievements();
      }
      this.msg(next + (next === 1 ? ' STAR' : ' STARS'), '#ff3b6b');
      this._ensureCops();
      if (next >= 3) this._dropBlock(true);
      if (next >= 4) this._dropSpike(true);
      if (next >= 5) this._ensureHeli();
    } else {
      this.stars = next;
      this._ensureCops();
      if (next < 5) this._removeHeli();
      if (next < 3) this._clearProps();
      if (next === 0 && this.peak > 0) this._evade();
    }
  },

  _ensureCops() {
    const n = copTarget(this.stars, this.heat);
    const player = this.hub && this.hub.player;
    while (this.cops.length < n && player) {
      if (!this._spawnCop(player, this.cops.length)) break;
    }
    while (this.cops.length > n) {
      const c = this.cops.pop();
      if (c.officer && c.officer.mesh) {
        gfx.world.remove(c.officer.mesh);
        disposePerson(c.officer.mesh);
        c.officer = null;
      }
      if (c.mesh) { gfx.world.remove(c.mesh); disposeCar(c.mesh); }
    }
  },

  _farSpot(player, index) {
    const city = this.hub && this.hub.city;
    const pitch = 86, half = 3, extent = half * pitch;
    const minD = 120;
    const fx = Math.sin(player.h || 0), fz = Math.cos(player.h || 0);
    let best = null;
    const consider = (x, z) => {
      if (!city || !city.isRoad(x, z)) return;
      const dx = x - player.x, dz = z - player.z;
      const d = Math.hypot(dx, dz);
      if (d < minD) return;
      /* Chase cameras look forward. A spawn has to be behind the car. */
      if (dx * fx + dz * fz > -30) return;
      const score = d + ((index * 13 + Math.round(x / 10) + Math.round(z / 7)) % 9) * 4;
      if (!best || score > best.score) best = { x: x, z: z, d: d, score: score };
    };
    if (city) {
      for (let i = -half; i <= half; i++) {
        for (let t = -extent; t <= extent; t += 28) {
          consider(t, i * pitch);
          consider(i * pitch, t);
        }
      }
    }
    return best && best.d >= minD ? best : null;
  },

  _spawnCop(player, index) {
    const spot = this._farSpot(player, index);
    if (!spot) return false;
    const mesh = buildCar('Coupe', { color: '#16315f', rims: 0, decal: 'stripes', siren: true }, { lights: true });
    gfx.world.add(mesh);
    const stars = Math.max(1, Math.min(5, this.stars));
    const face = Math.atan2(player.x - spot.x, player.z - spot.z);
    const cop = blankVehicle({
      mesh, name: 'Police',
      p: physFromStats({
        topSpeed: 12 + stars * 5,
        accel: 40 + stars * 2,
        handling: 52,
        grip: 64,
        nitro: 18,
        durability: 70
      }),
      x: spot.x,
      z: spot.z,
      h: face,
      nitro: 40
    });
    this.cops.push(cop);
    return true;
  },

  _driveCops(dt, player, city) {
    const lead = 12 + this.stars * 2;
    const n = this.cops.length;
    this.cops.forEach((cop, i) => {
      if (cop.dismounted) return;
      const fx = Math.sin(player.h), fz = Math.cos(player.h);
      const rx = Math.cos(player.h), rz = -Math.sin(player.h);
      const slot = i % 3;
      let tx, tz;
      if (slot === 0) {
        tx = player.x + fx * 4;
        tz = player.z + fz * 4;
      } else if (slot === 1) {
        tx = player.x + fx * Math.min(22, lead);
        tz = player.z + fz * Math.min(22, lead);
      } else {
        const side = (i % 2 ? 1 : -1) * 6;
        tx = player.x + fx * 10 + rx * side;
        tz = player.z + fz * 10 + rz * side;
      }
      const cap = COP_CAP[Math.min(5, Math.max(1, this.stars))] || COP_CAP[1];
      const x0 = cop.x, z0 = cop.z;
      if (cop.stuckT > 1.05 && !cop.way) {
        const spin = ((cop.unstuck || 0) % 4) * (Math.PI / 2);
        const ang = (cop.h || 0) + Math.PI + spin;
        const reach = 18 + ((cop.unstuck || 0) % 3) * 8;
        const road = city.nearestRoad(cop.x + Math.sin(ang) * reach, cop.z + Math.cos(ang) * reach);
        cop.way = { x: road.x, z: road.z };
        cop.wayT = 0;
        cop.unstuck = (cop.unstuck || 0) + 1;
      }
      if (cop.way) {
        tx = cop.way.x;
        tz = cop.way.z;
        cop.wayT = (cop.wayT || 0) + dt;
        if (Math.hypot(cop.x - tx, cop.z - tz) < 4 || cop.wayT > 3.2) {
          cop.way = null;
          cop.stuckT = 0;
        }
      }
      const inp = seekInput(cop, tx, tz, cap);
      inp.nitro = this.stars >= 4 && cop.nitro > 12 && Math.hypot(tx - cop.x, tz - cop.z) > 24;
      cop.offroad = !city.isRoad(cop.x, cop.z);
      stepVehicle(cop, inp, dt, {
        weatherGrip: 1, mods: { steerResp: 10, driftGrip: 1.8, driftCharge: 8, nitroBurn: 16, draft: 1 }, hasPerk: () => false
      });
      const hit = resolveCity(city, cop.x, cop.z, cop.vx, cop.vz, 1.15);
      const maxStep = Math.max(cap, cop.p && cop.p.maxSpeed || cap) * dt + 0.08;
      let dx = hit.x - x0, dz = hit.z - z0;
      const moved = Math.hypot(dx, dz);
      if (moved > maxStep && moved > 0) {
        cop.x = x0 + dx / moved * maxStep;
        cop.z = z0 + dz / moved * maxStep;
      } else {
        cop.x = hit.x; cop.z = hit.z;
      }
      cop.vx = hit.vx; cop.vz = hit.vz;
      cop.stuckT = cop.speed < 2 ? (cop.stuckT || 0) + dt : 0;
      cop.hitCd = Math.max(0, (cop.hitCd || 0) - dt);
      const gap = Math.hypot(cop.x - player.x, cop.z - player.z);
      if (gap < 2.6 && cop.hitCd <= 0 && player.speed > 8 && !(player.invuln > 0)) {
        cop.hitCd = 0.45;
        cop.damage = Math.min(100, (cop.damage || 0) + 22 + player.speed * 0.35);
        if (cop.damage >= 100 && !cop.exploded) {
          cop.exploded = true;
          wrecks.boom(cop.x, 0.5, cop.z, this.hub && this.hub.fx);
        }
      }
      /* Stuck cruisers reverse toward a road point. They are never moved by hand. */
    });
    if (this.cops.some((c) => c.exploded)) {
      const gone = this.cops.filter((c) => c.exploded);
      this.cops = this.cops.filter((c) => !c.exploded);
      for (const c of gone) {
        if (c.mesh) { gfx.world.remove(c.mesh); disposeCar(c.mesh); }
      }
      this.msg('Cruiser destroyed', '#ff8a2e');
    }
  },

  _heliLogic(dt, player, lot) {
    if (this.stars >= 5) this._ensureHeli();
    if (!this.heli) return;
    const cover = lot && player.speed < 6;
    this.heliSearch = cover ? this.heliSearch + dt : Math.max(0, this.heliSearch - dt);
    const aim = this.heli.userData.focus;
    if (this.heliSearch > 2.4) {
      aim.x += Math.sin(performance.now() / 700) * 20 * dt;
      aim.z += Math.cos(performance.now() / 700) * 20 * dt;
    } else {
      aim.x = player.x;
      aim.z = player.z;
    }
    this.heli.userData.light.intensity = this.heliSearch > 2.4 ? 8 : 90;
  },

  _ensureHeli() {
    if (this.heli) return;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x202833, metalness: 0.5, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.05, 3.4), mat);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 2.2), mat);
    tail.position.set(0, 0.2, -2.4);
    const rotor = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 0.06, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.3 })
    );
    rotor.position.y = 0.7;
    const light = new THREE.SpotLight(0xddeeff, 90, 70, 0.45, 0.35, 1.2);
    light.position.set(0, -0.4, 0.4);
    const aim = new THREE.Object3D();
    g.add(body, tail, rotor, light, aim);
    light.target = aim;
    g.userData = { rotor, light, aim, focus: { x: 0, z: 0 } };
    const player = this.hub && this.hub.player;
    const hx = player ? player.x - Math.sin(player.h || 0) * 160 : 0;
    const hz = player ? player.z - Math.cos(player.h || 0) * 160 : 0;
    g.position.set(hx, 26, hz);
    gfx.scene.add(g);
    this.heli = g;
    this.heliSearch = 0;
    this.msg('Air unit has you', '#d0e6ff');
  },

  _removeHeli() {
    if (!this.heli) return;
    gfx.scene.remove(this.heli);
    this.heli.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.heli = null;
    this.heliSearch = 0;
  },

  _group() {
    if (this.propGroup) return this.propGroup;
    const g = new THREE.Group();
    gfx.world.add(g);
    this.propGroup = g;
    return g;
  },

  _dropBlock(force) {
    if (this.stars < 3) return;
    this.blockCd -= force ? 99 : 0;
    if (this.blockCd > 0 && !force) return;
    this.blockCd = 22;
    const player = this.hub.player;
    const city = this.hub.city;
    const road = city.nearestRoad(player.x + Math.sin(player.h) * 180, player.z + Math.cos(player.h) * 180);
    if (Math.hypot(road.x - player.x, road.z - player.z) < 140) return;
    const rx = Math.cos(road.h), rz = -Math.sin(road.h);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1c4e9a, roughness: 0.5, metalness: 0.2 });
    const spots = [];
    for (const o of [-5, 0, 5]) {
      const x = road.x + rx * o, z = road.z + rz * o;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.1), mat);
      mesh.position.set(x, 0.55, z);
      mesh.rotation.y = road.h;
      this._group().add(mesh);
      spots.push({ x, z, mesh });
    }
    this.blocks.push({ spots });
    this.msg('Roadblock ahead', '#3fa9ff');
  },

  _dropSpike(force) {
    if (this.stars < 4) return;
    this.spikeCd -= force ? 99 : 0;
    if (this.spikeCd > 0 && !force) return;
    this.spikeCd = 18;
    const player = this.hub.player;
    const city = this.hub.city;
    const road = city.nearestRoad(player.x + Math.sin(player.h) * 160, player.z + Math.cos(player.h) * 160);
    if (Math.hypot(road.x - player.x, road.z - player.z) < 120) return;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.08, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xe8c14a, emissive: 0x8a6a10, emissiveIntensity: 0.4, roughness: 0.45 })
    );
    mesh.position.set(road.x, 0.08, road.z);
    mesh.rotation.y = road.h;
    this._group().add(mesh);
    this.spikes.push({ x: road.x, z: road.z, mesh, used: false });
    this.msg('Spike strip', '#ffe03b');
  },

  _hazards(dt, player) {
    this.blockCd -= dt;
    this.spikeCd -= dt;
    if (this.blockCd <= 0) this._dropBlock(false);
    if (this.spikeCd <= 0) this._dropSpike(false);
    for (const b of this.blocks) {
      for (const s of b.spots) {
        const dx = player.x - s.x, dz = player.z - s.z;
        const d = Math.hypot(dx, dz);
        if (d < 2.1 && d > 0.01) {
          player.x += (dx / d) * (2.1 - d);
          player.z += (dz / d) * (2.1 - d);
          const vn = player.vx * dx / d + player.vz * dz / d;
          if (vn < 0) { player.vx -= (dx / d) * vn; player.vz -= (dz / d) * vn; }
          if (!(player.invuln > 0)) player.damage = Math.min(100, player.damage + 0.4);
        }
      }
    }
    for (const s of this.spikes) {
      if (s.used) continue;
      if (Math.hypot(player.x - s.x, player.z - s.z) < 2.3 && player.speed > 8) {
        s.used = true;
        const soft = rankOf('criminal') >= 3 && (career.state.role === 'criminal');
        player.vx *= soft ? 0.45 : 0.22;
        player.vz *= soft ? 0.45 : 0.22;
        if (!(player.invuln > 0)) {
          player.damage = Math.min(100, player.damage + (soft ? 4 : 11));
          if (career.currentCar()) career.currentCar().damage = player.damage;
        }
        this.msg(soft ? 'Spikes — you rode them out' : 'Spikes blew the tires', '#ffe03b');
        s.mesh.visible = false;
      }
    }
  },

  _bust(player, city) {
    const stars = Math.max(1, this.stars);
    const fine = Math.round((140 + stars * 160) * ((career.state.role === 'criminal') ? 1.35 : 1));
    career.addMoney(-fine);
    career.state.respect = Math.max(-40, career.state.respect - stars);
    career.state.totals.busts = (career.state.totals.busts || 0) + 1;
    let impound = 0;
    if (stars >= 3) {
      impound = Math.round(fine * 0.8);
      career.state.impound = (career.state.impound || 0) + impound;
      career.state.totals.impounds = (career.state.totals.impounds || 0) + 1;
      player.damage = Math.min(100, player.damage + 18);
      if (career.currentCar()) career.currentCar().damage = player.damage;
    }
    const spawn = city.spawn;
    player.x = spawn.x; player.z = spawn.z; player.h = spawn.h || 0;
    player.vx = player.vz = 0; player.speed = 0;
    this.heat = 0;
    this.peak = 0;
    this.stars = 0;
    this.hiddenFor = 0;
    this.coolFrom = 0;
    this.purse = 0;
    this.shownBounty = 0;
    if (career.state && career.state.wanted) career.state.wanted.bounty = 0;
    this.bustT = 0;
    this.clearUnits();
    career.checkAchievements();
    career.save();
    this.msg('Busted. Fine $' + fine + (impound ? ' · impound $' + impound : ''), '#ff3b6b');
    if (this.onBust) this.onBust();
  },

  _evade() {
    const peak = this.peak;
    this.peak = 0;
    this.heat = 0;
    this.stars = 0;
    this.hiddenFor = 0;
    this.coolFrom = 0;
    this.clearUnits();
    const role = career.state.role || 'neutral';
    const kept = this.bounty();
    career.state.respect += peak;
    career.state.totals.escapes = (career.state.totals.escapes || 0) + 1;
    if (peak >= 4) career.state.totals.evadesHigh = (career.state.totals.evadesHigh || 0) + 1;
    if (role === 'criminal') career.state.roleXp.criminal = (career.state.roleXp.criminal || 0) + 8 + peak * 2;
    career.checkAchievements();
    career.save();
    this.msg(kept > 0 ? 'Lost them. Bounty stays $' + kept : 'Lost them. +' + peak + ' rep', '#fff');
    if (this.onEvade) this.onEvade(peak);
  },

  clearUnits() {
    clearFoot(this);
    clearSight(this);
    for (const c of this.cops) if (c.mesh) { gfx.world.remove(c.mesh); disposeCar(c.mesh); }
    this.cops = [];
    this._removeHeli();
    this._clearProps();
    this.bustT = 0;
  },

  _clearProps() {
    this.blocks = [];
    this.spikes = [];
    if (this.propGroup) {
      gfx.world.remove(this.propGroup);
      this.propGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      this.propGroup = null;
    }
    this.blockCd = 12;
    this.spikeCd = 8;
  },

  meshes() {
    const out = this.cops.map((c) => c.mesh).filter(Boolean);
    for (const m of footMeshes(this)) out.push(m);
    for (const m of sightMeshes(this)) out.push(m);
    if (this.heli) out.push(this.heli);
    if (this.propGroup) out.push(this.propGroup);
    return out;
  },

  forceFoot() { return forceFoot(this, this.hub && this.hub.player); },
  plant(opts) { return plant(this, this.hub && this.hub.player, opts); },
  hurtPlayer(amount, from) {
    const player = this.hub && this.hub.player;
    const city = this.hub && this.hub.city;
    return strike(this, player, city, amount, from);
  }
};
