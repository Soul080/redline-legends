/* foot.js — officers and armed crew step out of their cars.
   They only do it when you are stopped, wrecked, or already on foot.
   Swings and shots are telegraphed and short-range. Getting back in a car
   and driving off puts them back in their vehicles. Nothing here is gory:
   a flash, a miss, or a respawn line. */

import * as THREE from 'three';
import { career } from './state.js';
import { gfx } from './renderer.js';
import { buildCar, disposeCar } from './cars.js';
import { resolveCity, lotAt } from './city.js';
import { SIGHT, sightResult } from './sight.js';

export const FEE_CAP = 380;
const CHAIN = 12;
const WINDUP = 0.62;
const AIM = 0.78;
const MELEE = 2.15;
const SHOT_MIN = 5.5;
const SHOT_MAX = 14.5;
const DODGE = 2.35;
const RUN = 6.3;

const _capGeo = new THREE.CapsuleGeometry(0.28, 0.62, 3, 6);
const _headGeo = new THREE.SphereGeometry(0.2, 8, 8);
const _armGeo = new THREE.CapsuleGeometry(0.08, 0.34, 2, 4);
const _gunGeo = new THREE.BoxGeometry(0.08, 0.08, 0.36);

export function footCap(stars) {
  if (stars <= 2) return 1;
  if (stars === 3) return 2;
  if (stars === 4) return 3;
  return 4;
}

export function thugCap(stars) {
  if (stars < 3) return 0;
  if (stars === 3) return 1;
  return 2;
}

export function makePerson(color, gun) {
  const g = new THREE.Group();
  g.userData.person = true;
  const cloth = new THREE.MeshStandardMaterial({
    color, roughness: 0.72, metalness: 0.04, emissive: color, emissiveIntensity: 0
  });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd7b294, roughness: 0.82 });
  const body = new THREE.Mesh(_capGeo, cloth);
  body.position.y = 0.78;
  const head = new THREE.Mesh(_headGeo, skin);
  head.position.y = 1.42;
  const arm = new THREE.Mesh(_armGeo, cloth);
  arm.position.set(0.32, 1.02, 0.12);
  arm.rotation.z = 0.35;
  g.add(body, head, arm);
  if (gun) {
    const barrel = new THREE.Mesh(
      _gunGeo,
      new THREE.MeshStandardMaterial({ color: 0x241c18, metalness: 0.55, roughness: 0.4 })
    );
    barrel.position.set(0.36, 0.98, 0.36);
    g.add(barrel);
    g.userData.gunMesh = barrel;
  }
  g.userData.bodyMat = cloth;
  g.userData.skinMat = skin;
  g.userData.arm = arm;
  return g;
}

export function disposePerson(mesh) {
  if (!mesh) return;
  const ud = mesh.userData || {};
  if (ud.bodyMat) ud.bodyMat.dispose();
  if (ud.skinMat) ud.skinMat.dispose();
  if (ud.gunMesh && ud.gunMesh.material) ud.gunMesh.material.dispose();
}

function officerAt(unit, x, z, h, color, gun, from) {
  const mesh = makePerson(color, gun);
  gfx.world.add(mesh);
  mesh.position.set(x, 0, z);
  unit.dismounted = true;
  unit.vx = unit.vz = 0;
  unit.speed = 0;
  unit.officer = {
    mesh, x, z, h, gun: !!gun, from, state: 'chase', timer: 0, cd: 0.35,
    aimX: x, aimZ: z
  };
}

function placeNear(player, dist, ang) {
  return {
    x: player.x + Math.cos(ang) * dist,
    z: player.z + Math.sin(ang) * dist
  };
}

export function clearSight(wanted) {
  for (const b of wanted.beats || []) releaseBeat(b);
  wanted.beats = [];
  wanted.sightTold = false;
}

function releaseBeat(b) {
  if (!b || !b.officer) return;
  gfx.world.remove(b.officer.mesh);
  disposePerson(b.officer.mesh);
  b.officer = null;
}

function policePost(city) {
  const poi = city && city.pois && city.pois.find((p) => p.id === 'police');
  if (!poi) return null;
  return {
    x: poi.x - 5,
    z: poi.z - (poi.hz || 5) - 0.6
  };
}

export function updateSight(wanted, dt, player, city) {
  if (!wanted || !player || !city) return;
  const role = (career.state && career.state.role) || 'neutral';
  const stars = wanted.stars || 0;
  if (role !== 'criminal' || stars > 0 || player.invuln > 0) {
    if (player.invuln > 0 && role === 'criminal' && stars <= 0) holdSight(wanted);
    else clearSight(wanted);
    regenSight(player, dt);
    return;
  }
  ensureSight(wanted, city);
  const cease = !!(lotAt(city, player.x, player.z) && lotAt(city, player.x, player.z).id === 'police');
  for (const b of wanted.beats || []) tickSight(wanted, b, dt, player, city, cease);
  if (wanted.pendingDown) {
    const from = wanted.pendingDown;
    wanted.pendingDown = null;
    settle(wanted, player, city, from);
  }
  regenSight(player, dt);
}

function holdSight(wanted) {
  for (const b of wanted.beats || []) {
    if (!b.officer) continue;
    b.officer.state = 'hold';
    b.officer.cd = Math.max(b.officer.cd || 0, 0.35);
  }
}

function ensureSight(wanted, city) {
  wanted.beats = wanted.beats || [];
  if (wanted.beats.length) return;
  const post = policePost(city);
  if (!post) return;
  const mesh = makePerson(0x1c3f86, true);
  gfx.world.add(mesh);
  mesh.position.set(post.x, 0, post.z);
  wanted.beats.push({
    officer: {
      mesh, x: post.x, z: post.z, h: 0, gun: true, from: 'cop',
      state: 'hold', timer: 0, cd: 0.5, aimX: post.x, aimZ: post.z
    }
  });
}

function tickSight(wanted, beat, dt, player, city, cease) {
  const o = beat.officer;
  if (!o) return;
  o.cd = Math.max(0, (o.cd || 0) - dt);
  const dx = player.x - o.x, dz = player.z - o.z;
  const dist = Math.hypot(dx, dz) || 0.0001;
  if (o.state === 'aim') {
    o.timer -= dt;
    if (o.timer <= 0) {
      const moved = Math.hypot(player.x - o.aimX, player.z - o.aimZ);
      const res = sightResult(moved, dist, clearLos(city, o, player), cease);
      if (res === 'hit') {
        hurt(wanted, player, SIGHT.dmg, 'cop');
        if (player.hp > 0) player.hurtT = 1.3;
      }
      o.state = 'hold';
      o.cd = SIGHT.cool;
    }
    return;
  }
  o.h = Math.atan2(dx, dz);
  if (o.cd > 0 || cease || dist > SIGHT.range || !clearLos(city, o, player)) return;
  o.state = 'aim';
  o.timer = SIGHT.wind;
  o.aimX = player.x;
  o.aimZ = player.z;
  if (!wanted.sightTold) {
    wanted.sightTold = true;
    wanted.msg('Police have a shot. Move.', '#fff');
  }
}

function regenSight(player, dt) {
  const role = (career.state && career.state.role) || 'neutral';
  if (role !== 'criminal') return;
  if (!player || player.onFoot || player.hp == null || player.hp >= 100) return;
  if ((player.hurtT || 0) > 0 || player.speed <= 6) return;
  player.hp = Math.min(100, player.hp + 3.2 * dt);
}

export function presentSight(wanted) {
  const beats = wanted.beats || [];
  const pulse = 0.35 + Math.abs(Math.sin(performance.now() / 90));
  for (const b of beats) {
    const o = b.officer;
    if (!o || !o.mesh) continue;
    o.mesh.position.set(o.x, 0, o.z);
    o.mesh.rotation.y = o.h;
    const wind = o.state === 'aim';
    if (o.mesh.userData.bodyMat) o.mesh.userData.bodyMat.emissiveIntensity = wind ? pulse : 0;
    if (o.mesh.userData.arm) o.mesh.userData.arm.rotation.z = wind ? -1.15 : 0.35;
  }
}

export function sightMeshes(wanted) {
  const out = [];
  for (const b of wanted.beats || []) if (b.officer && b.officer.mesh) out.push(b.officer.mesh);
  return out;
}

export function clearFoot(wanted) {
  for (const cop of wanted.cops || []) releaseOfficer(cop);
  for (const t of wanted.thugs || []) releaseThug(t);
  wanted.thugs = [];
}

function releaseOfficer(cop) {
  if (cop.officer) {
    gfx.world.remove(cop.officer.mesh);
    disposePerson(cop.officer.mesh);
    cop.officer = null;
  }
  cop.dismounted = false;
}

function releaseThug(t) {
  releaseOfficer(t);
  if (t.mesh) {
    gfx.world.remove(t.mesh);
    disposeCar(t.mesh);
    t.mesh = null;
  }
}

function recallOfficer(cop) {
  if (!cop.dismounted && !cop.officer) return;
  releaseOfficer(cop);
}

export function updateFoot(wanted, dt, player, city) {
  if (!player || !city) return;
  if (player.hp == null) player.hp = 100;
  wanted.downClock = (wanted.downClock || 0) + dt;
  wanted.thugs = wanted.thugs || [];
  const role = (career.state && career.state.role) || 'neutral';
  const stars = wanted.stars || 0;
  if (role === 'police' || stars <= 0 || player.invuln > 0) {
    for (const cop of wanted.cops || []) recallOfficer(cop);
    clearThugs(wanted);
    return;
  }

  const sitting = !player.onFoot && player.speed < 2.2 && !(player.wreckHold > 0);
  wanted.stopT = sitting ? (wanted.stopT || 0) + dt : 0;
  const vulnerable = !!(player.onFoot || player.wreckHold > 0 || player.damage >= 100 || wanted.stopT > 1.05);
  const fleeing = !player.onFoot && player.speed > 5 && !(player.wreckHold > 0);

  ensureThugs(wanted, player, stars);
  let used = 0;
  const cap = footCap(stars);
  for (const cop of wanted.cops) {
    if (fleeing) { recallOfficer(cop); continue; }
    const dist = Math.hypot(cop.x - player.x, cop.z - player.z);
    if (!cop.dismounted && vulnerable && dist < 26 && used < cap) {
      const side = used % 2 === 0 ? 1 : -1;
      officerAt(cop, cop.x + side * 1.7, cop.z + 1.2, cop.h, '#1c3f86', stars >= 4, 'cop');
      used++;
    } else if (cop.dismounted) used++;
    if (cop.dismounted && cop.officer) tick(wanted, cop, dt, player, city, stars >= 4);
  }
  while (used > cap) {
    const extra = wanted.cops.filter((c) => c.dismounted).pop();
    if (!extra) break;
    recallOfficer(extra);
    used--;
  }

  let thugsOut = 0;
  const tCap = thugCap(stars);
  for (const t of wanted.thugs) {
    if (fleeing) { recallOfficer(t); continue; }
    if (!t.dismounted) creep(t, player, dt);
    if (!t.dismounted && vulnerable && thugsOut < tCap) {
      officerAt(t, t.x + 1.6, t.z, t.h, '#6a2430', true, 'thug');
    }
    if (t.dismounted && t.officer) {
      thugsOut++;
      tick(wanted, t, dt, player, city, true);
    }
  }
  while (wanted.thugs.length > tCap) releaseThug(wanted.thugs.pop());

  if (player.hurtT > 0) player.hurtT -= dt;
  else if (!player.onFoot && player.hp < 100) player.hp = Math.min(100, player.hp + 5 * dt);

  if (wanted.pendingDown) {
    const from = wanted.pendingDown;
    wanted.pendingDown = null;
    settle(wanted, player, city, from);
  }
}

function clearThugs(wanted) {
  for (const t of wanted.thugs || []) releaseThug(t);
  wanted.thugs = [];
}

function ensureThugs(wanted, player, stars) {
  const n = thugCap(stars);
  while (wanted.thugs.length < n) {
    const mesh = buildCar('Coupe', { color: '#3a1420', rims: 0, decal: 'none' }, {});
    gfx.world.add(mesh);
    const h = player.h || 0;
    const side = wanted.thugs.length === 0 ? 14 : -14;
    const x = player.x - Math.sin(h) * 140 + Math.cos(h) * side;
    const z = player.z - Math.cos(h) * 140 - Math.sin(h) * side;
    wanted.thugs.push({
      mesh, x, z, h: h, vx: 0, vz: 0, speed: 0,
      dismounted: false, officer: null, from: 'thug'
    });
  }
}

function creep(t, player, dt) {
  const dx = player.x - t.x, dz = player.z - t.z;
  const dist = Math.hypot(dx, dz) || 1;
  t.h = Math.atan2(dx, dz);
  if (dist > 11) {
    const sp = 11;
    t.x += (dx / dist) * sp * dt;
    t.z += (dz / dist) * sp * dt;
    t.speed = sp;
  } else t.speed = 0;
}

function clearLos(city, o, player) {
  const steps = 4;
  for (let i = 1; i < steps; i++) {
    const x = o.x + (player.x - o.x) * (i / steps);
    const z = o.z + (player.z - o.z) * (i / steps);
    const boxes = city.query(x, z, 0.4);
    for (const b of boxes) {
      if (b.prop || b.dead) continue;
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return false;
    }
  }
  return true;
}

function tick(wanted, unit, dt, player, city, allowGun) {
  const o = unit.officer;
  if (!o) return;
  o.cd = Math.max(0, (o.cd || 0) - dt);
  const dx = player.x - o.x, dz = player.z - o.z;
  const dist = Math.hypot(dx, dz) || 0.0001;
  o.h = Math.atan2(dx, dz);
  if (o.state === 'windup') {
    o.timer -= dt;
    if (o.timer <= 0) {
      if (dist <= 2.7) hurt(wanted, player, 8, o.from);
      o.state = 'chase';
      o.cd = 1.2;
    }
    return;
  }
  if (o.state === 'aim') {
    o.timer -= dt;
    if (o.timer <= 0) {
      const moved = Math.hypot(player.x - o.aimX, player.z - o.aimZ);
      if (moved <= DODGE && dist <= SHOT_MAX && dist >= 3 && clearLos(city, o, player)) hurt(wanted, player, 14, o.from);
      o.state = 'chase';
      o.cd = 1.75;
    }
    return;
  }
  if (o.cd <= 0 && dist < MELEE) {
    o.state = 'windup';
    o.timer = WINDUP;
    return;
  }
  if (o.cd <= 0 && allowGun && o.gun && dist > SHOT_MIN && dist < SHOT_MAX && clearLos(city, o, player)) {
    o.state = 'aim';
    o.timer = AIM;
    o.aimX = player.x;
    o.aimZ = player.z;
    return;
  }
  if (dist > 1.35) {
    o.x += (dx / dist) * RUN * dt;
    o.z += (dz / dist) * RUN * dt;
    const hit = resolveCity(city, o.x, o.z, 0, 0, 0.4);
    o.x = hit.x;
    o.z = hit.z;
  }
}

function hurt(wanted, player, amount, from) {
  if (!player || player.invuln > 0 || wanted.pendingDown || wanted.downLock) return;
  player.hp = Math.max(0, (player.hp == null ? 100 : player.hp) - amount);
  player.hurtT = 3.2;
  if (player.hp <= 0) wanted.pendingDown = from || 'cop';
}

export function strike(wanted, player, city, amount, from) {
  if (!player) return null;
  player.invuln = 0;
  wanted.pendingDown = null;
  wanted.downLock = false;
  hurt(wanted, player, amount, from);
  if (wanted.pendingDown) {
    const why = wanted.pendingDown;
    wanted.pendingDown = null;
    return settle(wanted, player, city, why);
  }
  return { ok: true, hp: player.hp, kind: null, fee: 0 };
}

function settle(wanted, player, city, from) {
  if (wanted.downLock) return wanted.lastSettle || null;
  wanted.downLock = true;
  const stars = Math.max(0, wanted.stars || 0);
  const copClose = (wanted.cops || []).some((c) => c.officer && Math.hypot(c.officer.x - player.x, c.officer.z - player.z) < 7);
  const kind = from === 'thug' && !copClose ? 'wasted' : 'busted';
  const since = (wanted.downClock || 0) - (wanted.lastDownAt == null ? -999 : wanted.lastDownAt);
  let raw = kind === 'busted' ? 120 + stars * 40 : 80 + stars * 20;
  if (stars <= 0 && kind === 'busted' && career.state && career.state.role === 'criminal') raw = Math.round(raw * 1.25);
  const money = career.state ? career.state.money : 0;
  const fee = since < CHAIN ? 0 : Math.min(FEE_CAP, raw, money);
  if (fee > 0) career.addMoney(-fee);
  const spot = kind === 'wasted' && city.hospital ? city.hospital : city.spawn;
  // Drop the chase without paying the escape bounty. Dying is not a payday.
  wanted.peak = 0;
  if (kind === 'busted') {
    wanted.purse = 0;
    wanted.shownBounty = 0;
    if (career.state && career.state.wanted) career.state.wanted.bounty = 0;
  } else wanted.shownBounty = wanted.bounty ? wanted.bounty() : 0;
  wanted.heat = 0;
  wanted.stars = 0;
  wanted.bustT = 0;
  wanted.stopT = 0;
  clearFoot(wanted);
  wanted.cops = wanted.cops || [];
  for (const c of wanted.cops) {
    if (c.mesh) { gfx.world.remove(c.mesh); disposeCar(c.mesh); }
  }
  wanted.cops = [];
  if (wanted._removeHeli) wanted._removeHeli();
  if (wanted._clearProps) wanted._clearProps();
  if (kind === 'busted' && career.state) {
    career.state.totals.busts = (career.state.totals.busts || 0) + 1;
    career.state.respect = Math.max(-40, (career.state.respect || 0) - Math.max(1, stars));
  }
  if (wanted.hub && wanted.hub.recover) wanted.hub.recover(spot);
  else {
    player.x = spot.x; player.z = spot.z; player.h = spot.h || 0;
    player.vx = player.vz = 0; player.speed = 0;
    player.hp = 100;
    player.invuln = 6;
  }
  player.skipWreck = true;
  player.wreckHold = 0;
  wanted.lastDownAt = wanted.downClock || 0;
  wanted.downLock = false;
  const text = kind === 'wasted' ? 'Wasted' : 'Busted';
  const bill = fee > 0 ? ' · $' + fee : '';
  wanted.msg(text + bill, kind === 'wasted' ? '#d7dee8' : '#ff3b6b');
  if (kind === 'busted' && wanted.onBust) wanted.onBust();
  if (career.state) career.save();
  const result = {
    ok: true, kind, fee, hp: player.hp,
    x: player.x, z: player.z,
    money: career.state ? career.state.money : 0
  };
  wanted.lastSettle = result;
  return result;
}

/** Test and debug hook. Puts the star-appropriate number of people on the pavement. */
export function forceFoot(wanted, player) {
  if (!player) return { cops: 0, thugs: 0 };
  wanted.thugs = wanted.thugs || [];
  const stars = wanted.stars || 0;
  const cap = footCap(stars);
  let n = 0;
  for (const cop of wanted.cops || []) {
    if (n >= cap) {
      recallOfficer(cop);
      const far = placeNear(player, 70, 2.6 + n);
      cop.x = far.x;
      cop.z = far.z;
      cop.vx = cop.vz = 0;
      cop.speed = 0;
      continue;
    }
    const spot = placeNear(player, 8, n * 1.2 + 0.4);
    if (cop.officer) releaseOfficer(cop);
    officerAt(cop, spot.x, spot.z, 0, '#1c3f86', stars >= 4, 'cop');
    n++;
  }
  ensureThugs(wanted, player, stars);
  let t = 0;
  const tCap = thugCap(stars);
  for (const thug of wanted.thugs) {
    if (t >= tCap) break;
    const spot = placeNear(player, 8, Math.PI + t);
    if (thug.officer) releaseOfficer(thug);
    officerAt(thug, spot.x, spot.z, 0, '#6a2430', true, 'thug');
    t++;
  }
  return { cops: n, thugs: t };
}

/** Pin one officer in a windup or aim so a test can prove the telegraph. */
export function plant(wanted, player, opts) {
  opts = opts || {};
  const from = opts.from || 'cop';
  const list = from === 'thug' ? (wanted.thugs || []) : (wanted.cops || []);
  let unit = list.find((u) => u.dismounted && u.officer);
  if (!unit && list[0]) {
    unit = list[0];
    const spot = placeNear(player, opts.dist == null ? 1.6 : opts.dist, opts.ang || 0);
    officerAt(unit, spot.x, spot.z, 0, from === 'thug' ? '#6a2430' : '#1c3f86', !!opts.gun, from);
  }
  if (!unit || !unit.officer) return null;
  const o = unit.officer;
  const dist = opts.dist == null ? 1.6 : opts.dist;
  const ang = opts.ang || 0;
  o.x = player.x + Math.cos(ang) * dist;
  o.z = player.z + Math.sin(ang) * dist;
  o.h = Math.atan2(player.x - o.x, player.z - o.z);
  o.state = opts.state || 'windup';
  o.timer = opts.timer == null ? WINDUP : opts.timer;
  o.cd = 0;
  o.gun = !!opts.gun;
  o.aimX = player.x;
  o.aimZ = player.z;
  o.mesh.position.set(o.x, 0, o.z);
  for (const other of (wanted.cops || []).concat(wanted.thugs || [])) {
    if (!other.officer || other.officer === o) continue;
    const far = placeNear(player, 36, 2.2);
    other.officer.x = far.x;
    other.officer.z = far.z;
    other.officer.state = 'chase';
    other.officer.cd = 9;
  }
  return { state: o.state, gun: o.gun, dist: Math.hypot(o.x - player.x, o.z - player.z), from: o.from };
}

export function presentFoot(wanted) {
  const units = [];
  for (const c of wanted.cops || []) if (c.officer) units.push(c.officer);
  for (const t of wanted.thugs || []) {
    if (t.mesh) {
      t.mesh.position.set(t.x, 0, t.z);
      t.mesh.rotation.y = t.h;
    }
    if (t.officer) units.push(t.officer);
  }
  const pulse = 0.35 + Math.abs(Math.sin(performance.now() / 90));
  for (const o of units) {
    o.mesh.position.set(o.x, 0, o.z);
    o.mesh.rotation.y = o.h;
    const wind = o.state === 'windup' || o.state === 'aim';
    if (o.mesh.userData.bodyMat) o.mesh.userData.bodyMat.emissiveIntensity = wind ? pulse : 0;
    if (o.mesh.userData.arm) o.mesh.userData.arm.rotation.z = wind ? -1.15 : 0.35;
  }
}

export function footMeshes(wanted) {
  const out = [];
  for (const c of wanted.cops || []) if (c.officer) out.push(c.officer.mesh);
  for (const t of wanted.thugs || []) {
    if (t.mesh) out.push(t.mesh);
    if (t.officer) out.push(t.officer.mesh);
  }
  return out;
}
