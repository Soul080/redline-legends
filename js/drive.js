/* drive.js - Hub driving on the city road network: current car, traffic lanes,
   traffic lights, parking stalls, and getting out on foot to enter buildings. */
RL.Drive = (function () {
  const T = 40;
  const KMH = 0.72;
  let traffic = [], stalls = [], props = [], t = 0, sparks = [], hitCd = 0;
  const P = () => RL.Hub.player;
  const PROP_KINDS = [
    { id: 'hydrant', hp: 34, color: '#e23b3b' },
    { id: 'sign', hp: 22, color: '#ffe03b' },
    { id: 'fence', hp: 40, color: '#c5cad3' },
    { id: 'barrier', hp: 55, color: '#ff8a2e' }
  ];

  function kmh(speed) { return Math.abs(speed) * KMH; }
  function limitAt(x, y) {
    const m = RL.CityMap, tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (!m || tx < 0 || ty < 0 || tx >= m.cols || ty >= m.rows) return 0;
    return m.mask[ty * m.cols + tx] || 0;
  }
  function headingAxis(h) { return Math.abs(Math.cos(h)) >= Math.abs(Math.sin(h)) ? 'ew' : 'ns'; }
  function lightAt(x, y, time) {
    const m = RL.CityMap; if (!m) return null;
    const tx = x / T, ty = y / T;
    for (let i = 0; i < m.lights.length; i++) {
      const L = m.lights[i];
      if (tx >= L.x && tx <= L.x + L.w && ty >= L.y && ty <= L.y + L.h) return { light: L, phase: m.lightPhase(L, time) };
    }
    return null;
  }
  /* True when `h` is facing a red (not yellow) at this intersection. */
  function crossingRed(h, phase) {
    if (!phase) return false;
    const axis = headingAxis(h);
    return phase[axis] === 'red';
  }
  function blocked(x, y, rad) { return RL.Hub.blocked(x, y, rad == null ? 15 : rad); }

  function makeStalls() {
    stalls = [];
    const list = (RL.Hub.BUILDINGS || []).concat((RL.CityMap && RL.CityMap.buildings) || []);
    list.forEach((b) => {
      if (!b.door) return;
      stalls.push({ id: b.id, name: b.name, x: b.door.x, y: b.door.y + 36, w: 56, h: 40, door: b.door, color: b.color });
    });
  }
  function inStall(s, x, y) { return Math.abs(x - s.x) < s.w / 2 && Math.abs(y - s.y) < s.h / 2; }
  function nearDoor(x, y) {
    let best = null, bestD = 52;
    const list = (RL.Hub.BUILDINGS || []).concat((RL.CityMap && RL.CityMap.buildings) || []);
    for (let i = 0; i < list.length; i++) {
      const b = list[i]; if (!b.door) continue;
      const d = Math.hypot(x - b.door.x, y - (b.door.y + 16));
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  function spawnTraffic() {
    traffic = [];
    const lanes = (RL.CityMap && RL.CityMap.lanes) || [];
    const p = P();
    let n = 0;
    for (let i = 0; i < lanes.length && n < 14; i += 2) {
      const lane = lanes[i];
      const along = 0.15 + (i % 5) * 0.15;
      const x = lane.x1 + (lane.x2 - lane.x1) * along;
      const y = lane.y1 + (lane.y2 - lane.y1) * along;
      if (p && Math.hypot(x - p.x, y - p.y) < 240) continue;
      const tier = RL.Traffic ? RL.Traffic.roll(i + 3) : { id: 'commuter', name: 'Commuter', color: '#d5dbe3', hp: 82, heat: 12 };
      traffic.push({
        lane: i, along, speed: 62 + (i % 4) * 14, color: tier.color, w: 30, h: 16, vx: 0, vy: 0,
        tier: tier.id, tierName: tier.name, hp: tier.hp, dmg: 0
      });
      n++;
    }
  }
  function spawnProps() {
    props = [];
    const m = RL.CityMap;
    if (!m || !m.mask) return;
    let n = 0;
    for (let ty = 2; ty < m.rows - 1 && n < 42; ty += 3) {
      for (let tx = 2; tx < m.cols - 1 && n < 42; tx += 5) {
        const road = m.mask[ty * m.cols + tx];
        const above = m.mask[(ty - 1) * m.cols + tx];
        if (!road || above) continue;
        if (RL.Hub.blocked(tx * T + 20, ty * T - 18, 14)) continue;
        const kind = PROP_KINDS[n % PROP_KINDS.length];
        props.push({ kind: kind.id, color: kind.color, x: tx * T + 20, y: ty * T - 18, hp: kind.hp, max: kind.hp, alive: true, cd: 0 });
        n++;
      }
    }
  }
  function lanePos(lane, along) {
    return { x: lane.x1 + (lane.x2 - lane.x1) * along, y: lane.y1 + (lane.y2 - lane.y1) * along, h: Math.atan2(lane.y2 - lane.y1, lane.x2 - lane.x1) };
  }
  function updateTraffic(dt) {
    const lanes = RL.CityMap.lanes, p = P();
    const siren = p && p.siren && p.inCar !== false;
    for (let i = 0; i < traffic.length; i++) {
      const c = traffic[i], lane = lanes[c.lane];
      if (c.wrecked) {
        c.wreckT -= dt;
        if (c.wreckT <= 0) {
          c.wrecked = false; c.dmg = 0;
          c.along = (c.along + 0.42) % 1;
          if (c.along < 0) c.along += 1;
        }
      }
      const pos = lanePos(lane, c.along);
      c.x = pos.x; c.y = pos.y; c.h = pos.h;
      if (c.wrecked) continue;
      let cap = (lane.limit / KMH) * 0.82;
      const ahead = lightAt(pos.x + Math.cos(pos.h) * 36, pos.y + Math.sin(pos.h) * 36, t);
      if (ahead && crossingRed(pos.h, ahead.phase)) cap = 0;
      if (siren && Math.hypot(pos.x - p.x, pos.y - p.y) < 240) cap = Math.min(cap, 30);
      const len = Math.hypot(lane.x2 - lane.x1, lane.y2 - lane.y1) || 1;
      for (let j = 0; j < traffic.length; j++) if (j !== i && traffic[j].lane === c.lane) {
        let gap = traffic[j].along - c.along; if (gap < -0.5) gap += 1; if (gap > 0.5) gap -= 1;
        if (gap > 0 && gap * len < 56) cap = Math.min(cap, traffic[j].speed * 0.9);
      }
      c.speed += ((cap - c.speed) * 1.8) * dt;
      if (c.speed < 0) c.speed = 0;
      c.along += (c.speed * dt) / len;
      if (c.along > 1) c.along -= 1;
      if (c.along < 0) c.along += 1;
    }
  }

  function carPower() {
    const car = RL.Game.currentCar(), st = RL.Game.carStats(car);
    const ride = P() && P().joyride;
    const mul = ride && RL.Traffic ? RL.Traffic.tier(ride.tier) : null;
    const dmg = ride ? (ride.damage || 0) : (car.damage || 0);
    const wear = 1 - Math.min(100, dmg) * 0.0025;
    return {
      accel: (220 + st.accel * 1.5) * (mul ? mul.acc : 1),
      max: (200 + st.topSpeed * 1.35) * wear * (mul ? mul.top : 1),
      turn: (2.15 + st.handling * 0.012) * (mul ? mul.turn : 1),
      grip: 1 + st.grip * 0.004
    };
  }
  function saveJoyride() {
    const s = RL.Game.state, p = P();
    if (!s) return;
    if (!s.hub || typeof s.hub !== 'object') s.hub = {};
    if (!p || !p.joyride) { s.hub.joyride = null; return; }
    const j = p.joyride;
    s.hub.joyride = { tier: j.tier, name: j.name, color: j.color, cls: j.cls, damage: RL.clamp(j.damage || 0, 0, 100) };
  }
  function applyDamage(p, dmg) {
    if (!p || p.wrecked || p.invuln > 0 || !(dmg > 0)) return;
    if (p.joyride) {
      const tier = RL.Traffic && RL.Traffic.tier(p.joyride.tier);
      const scale = tier ? 100 / tier.hp : 1;
      p.joyride.damage = RL.clamp((p.joyride.damage || 0) + dmg * scale, 0, 100);
      saveJoyride();
      if (p.joyride.damage >= 100 && RL.Explode) RL.Explode.joyride(p);
      return;
    }
    const car = RL.Game.currentCar();
    if (!car) return;
    car.damage = RL.clamp((car.damage || 0) + dmg, 0, 100);
    if (car.damage >= 100 && RL.Explode) RL.Explode.cityCar(p);
  }

  function enter() {
    const p = P();
    if (!p) return;
    if (p.h == null) p.h = 0;
    if (p.speed == null) p.speed = 0;
    if (p.inCar == null) p.inCar = true;
    p._lx = null;
    makeStalls();
    if (!traffic.length) spawnTraffic();
    if (!props.length) spawnProps();
    const s = RL.Game.state;
    if (s && s.hub) {
      if (s.hub.h != null) p.h = s.hub.h;
      if (s.hub.speed != null) p.speed = s.hub.speed;
      if (s.hub.inCar != null) p.inCar = s.hub.inCar;
      p.hp = Number(s.hub.hp) > 0 ? RL.clamp(Number(s.hub.hp), 1, 100) : 100;
      if (s.hub.parked) p.parked = s.hub.parked;
      const j = s.hub.joyride;
      const tier = j && RL.Traffic && RL.Traffic.tier(j.tier);
      if (tier) {
        p.joyride = { tier: tier.id, name: tier.name, color: j.color || tier.color, cls: j.cls || tier.cls, damage: RL.clamp(j.damage || 0, 0, 99) };
        if (!p.ownPark) p.ownPark = { x: p.x, y: p.y, h: p.h || 0 };
      } else if (j) {
        s.hub.joyride = null;
        p.joyride = null;
      }
    }
  }

  function footUpdate(dt, p) {
    const I = RL.Input, sp = 190;
    let dx = (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0);
    let dy = (I.down('down') ? 1 : 0) - (I.down('up') ? 1 : 0);
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }
    if (dx || dy) {
      p.dir = Math.atan2(dy, dx); p.walk = (p.walk || 0) + dt * 10;
      const nx = p.x + dx * sp * dt, ny = p.y + dy * sp * dt;
      if (!blocked(nx, p.y, 12)) p.x = nx;
      if (!blocked(p.x, ny, 12)) p.y = ny;
    }
    p.speed = 0;
  }

  function driveUpdate(dt, p) {
    const I = RL.Input, pow = carPower(), sens = (RL.settings && RL.settings.sensitivity) || 1;
    const steer = ((I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0)) * sens;
    const throttle = I.down('up'), brake = I.down('down'), drift = I.down('drift');
    let max = pow.max, acc = pow.accel;
    const lim = limitAt(p.x, p.y);
    p.onRoad = lim > 0;
    if (!p.onRoad) { max *= 0.38; acc *= 0.55; }
    if (RL.Wanted && RL.Wanted.tireCut && RL.Wanted.tireCut() > 0) max = Math.min(max, 70);
    if (p.boostT > 0) { p.boostT -= dt; max *= 1.18; acc *= 1.35; }
    const rate = 7 + (RL.Game.state.stats.reflexes || 1) * 0.4;
    p.steer = (p.steer || 0) + (steer - (p.steer || 0)) * Math.min(1, rate * dt);
    const sp = Math.abs(p.speed);
    const turnF = RL.clamp(sp / 80, 0.15, 1) * (1 - RL.clamp((sp - max) / 500, 0, 0.35));
    p.h += p.steer * pow.turn * turnF * (drift ? 1.45 : 1) * (p.speed < 0 ? -1 : 1) * dt;
    if (throttle) p.speed += acc * dt * (p.speed < max ? 1 : 0.25);
    if (brake) p.speed -= (sp > 20 ? 420 : 260) * dt;
    if (!throttle && !brake) p.speed -= Math.sign(p.speed) * Math.min(Math.abs(p.speed), (drift ? 90 : 50) * dt);
    if (p.speed > max) p.speed -= (p.speed - max) * 2 * dt;
    if (p.speed < -90) p.speed = -90;
    if (drift && sp > 80) p.speed *= (1 - 0.35 * dt);
    const nx = p.x + Math.cos(p.h) * p.speed * dt;
    const ny = p.y + Math.sin(p.h) * p.speed * dt;
    const hitX = blocked(nx, p.y, 15), hitY = blocked(p.x, ny, 15);
    if (!hitX) p.x = nx; else if (Math.abs(p.speed) > 80) addWear(p, 'wall');
    if (!hitY) p.y = ny; else if (Math.abs(p.speed) > 80) addWear(p, 'wall');
    if (hitX || hitY) p.speed *= 0.45;
    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      if (prop.cd > 0) prop.cd -= dt;
      if (!prop.alive) continue;
      const d = Math.hypot(p.x - prop.x, p.y - prop.y);
      if (d > 22 || prop.cd > 0) continue;
      const sp = Math.abs(p.speed);
      if (sp < 50) continue;
      prop.cd = 0.45;
      prop.hp -= RL.clamp((sp - 30) / 8, 6, 30);
      if (sp > 110) addWear(p, 'prop', prop);
      const destroyed = prop.hp <= 0;
      if (destroyed) prop.alive = false;
      if (RL.Wanted) RL.Wanted.report('prop', { speed: sp, destroyed: destroyed, kind: prop.kind });
    }
    // traffic bumps
    for (let i = 0; i < traffic.length; i++) {
      const c = traffic[i];
      if (c.wrecked) continue;
      const dx = p.x - c.x, dy = p.y - c.y, dist = Math.hypot(dx, dy);
      if (dist < 28 && dist > 0.1) {
        const push = (28 - dist) / dist;
        const ox = p.x, oy = p.y;
        if (!blocked(p.x + dx * push, p.y, 15)) p.x += dx * push;
        if (!blocked(p.x, p.y + dy * push, 15)) p.y += dy * push;
        if (Math.abs(p.speed) > 50) {
          addWear(p, 'traffic', c);
          p.speed *= 0.55;
        }
        if (p.x === ox && p.y === oy) p.speed *= 0.5;
      }
    }
    if (lim > 0 && RL.Wanted) RL.Wanted.reportSpeed(kmh(p.speed), lim, dt);
    lightsCheck(p);
  }

  let overT = 0, lastLight = null;
  function lightsCheck(p) {
    const here = lightAt(p.x, p.y, t);
    const id = here ? here.light.x + ',' + here.light.y : null;
    if (here && id !== lastLight && crossingRed(p.h, here.phase) && Math.abs(p.speed) > 60) {
      const legal = p.siren && RL.Roles && RL.Roles.current() === 'police';
      if (!legal && RL.Wanted) RL.Wanted.report('redlight', {});
    }
    lastLight = id;
  }
  function addWear(p, kind, other) {
    if (!p || p.wrecked || p.invuln > 0 || hitCd > 0) return;
    const sp = Math.abs(p.speed);
    let dmg = 0;
    if (kind === 'wall' && sp > 90) dmg = RL.clamp((sp - 70) / 28, 2, 16);
    else if (kind === 'traffic' && sp > 55) dmg = RL.clamp((sp - 40) / 22, 3, 18);
    else if (kind === 'prop' && sp > 120) dmg = RL.clamp((sp - 100) / 40, 1, 5);
    else return;
    hitCd = 0.55;
    sparks.push({ x: p.x, y: p.y, t: 0.3 });
    applyDamage(p, dmg);
    let destroyed = false;
    if (other && kind === 'traffic') {
      other.dmg = (other.dmg || 0) + dmg * 1.4;
      if (other.dmg >= (other.hp || 100) && !other.wrecked && RL.Explode && RL.Explode.enabled()) {
        other.wrecked = true; other.wreckT = RL.Explode.DELAY || 2.7; other.dmg = other.hp || 100;
        destroyed = true;
        RL.Explode.boom(other.x, other.y, {});
      }
    }
    if (kind === 'traffic' && RL.Wanted) RL.Wanted.report('traffic', { speed: sp, suspect: false, destroyed: destroyed });
    try { RL.Audio.play(dmg > 8 ? 'crash' : 'bump', dmg / 20); } catch (e) { }
  }

  function update(dt) {
    const p = P(); if (!p) return;
    t += dt;
    if (hitCd > 0) hitCd -= dt;
    if (p.wrecked) p.speed = 0;
    else {
      if (p._lx != null && Math.hypot(p.x - p._lx, p.y - p._ly) > 48) p.speed = 0;
      if (p.inCar === false) footUpdate(dt, p);
      else driveUpdate(dt, p);
    }
    updateTraffic(dt);
    p._lx = p.x; p._ly = p.y;
    const s = RL.Game.state;
    if (s && s.hub) { s.hub.x = p.x; s.hub.y = p.y; s.hub.h = p.h || 0; s.hub.speed = p.speed || 0; s.hub.inCar = p.inCar !== false; s.hub.parked = p.parked || null; s.hub.hp = p.hp == null ? 100 : RL.clamp(p.hp, 0, 100); }
    sparks = sparks.filter((sp) => (sp.t -= dt) > 0);
    // distance for dailies / achievements, ignore teleports
    if (p._px != null) {
      const step = Math.hypot(p.x - p._px, p.y - p._py);
      if (step < 40 && step > 0 && s) {
        s.totals.driveDist = (s.totals.driveDist || 0) + step;
        if (RL.Daily) RL.Daily.progress('distance', step);
        if (s.totals.driveDist > 500 && RL.Game.unlockAch) RL.Game.unlockAch('sp_wheels');
      }
    }
    p._px = p.x; p._py = p.y;
  }

  let sirenEdge = false;
  function pollSiren() {
    const down = (RL.Input.keys && RL.Input.keys.KeyL) || RL.Input.down('siren');
    const p = P(); if (!p) return;
    if (down && !sirenEdge && RL.Roles && RL.Roles.current() === 'police') {
      p.siren = !p.siren;
      try { RL.Audio.play(p.siren ? 'confirm' : 'click'); } catch (e) { }
    }
    sirenEdge = down;
  }

  function tryAction(nearBuilding) {
    const p = P(); if (!p) return false;
    const slow = Math.abs(p.speed || 0) < 90;
    if (p.inCar !== false && slow && nearBuilding) {
      p.parked = { x: p.x, y: p.y, h: p.h || 0 };
      p.inCar = false; p.speed = 0;
      return false; // caller still opens the building (one press)
    }
    if (p.inCar === false && p.ownPark && p.joyride && Math.hypot(p.x - p.ownPark.x, p.y - p.ownPark.y) < 46 && !nearBuilding) {
      p.x = p.ownPark.x; p.y = p.ownPark.y; p.h = p.ownPark.h; p.inCar = true; p.speed = 0;
      dropJoyride();
      try { RL.Audio.play('confirm'); } catch (e) { }
      return true;
    }
    if (p.inCar === false && p.parked && Math.hypot(p.x - p.parked.x, p.y - p.parked.y) < 46 && !nearBuilding) {
      p.x = p.parked.x; p.y = p.parked.y; p.h = p.parked.h; p.inCar = true; p.speed = 0;
      try { RL.Audio.play('confirm'); } catch (e) { }
      return true;
    }
    if (p.inCar !== false && slow && !nearBuilding) {
      const stall = stalls.find((s) => inStall(s, p.x, p.y));
      p.parked = { x: p.x, y: p.y, h: p.h || 0 };
      p.inCar = false; p.speed = 0;
      if (stall) return false;
      try { RL.Audio.play('click'); } catch (e) { }
      return true;
    }
    return false;
  }

  function nearestTraffic(p, maxDist) {
    let best = null, bestD = maxDist;
    for (let i = 0; i < traffic.length; i++) {
      const c = traffic[i];
      if (!c || c.wrecked) continue;
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }
  function trySteal() {
    const p = P();
    if (!p || p.inCar === false || p.wrecked) return false;
    if (Math.abs(p.speed || 0) > 48) return false;
    if (nearDoor(p.x, p.y)) return false;
    const c = nearestTraffic(p, 46);
    if (!c) return false;
    const tier = (RL.Traffic && RL.Traffic.tier(c.tier)) || { id: c.tier || 'commuter', name: c.tierName || 'Commuter', color: c.color, cls: 'Coupe', hp: c.hp || 82, heat: 12 };
    const s = RL.Game.state;
    const beforeCars = s && s.cars ? s.cars.length : 0;
    const beforeMoney = s ? s.money : 0;
    const beforeId = s ? s.currentCar : null;
    if (!p.joyride) p.ownPark = { x: p.x, y: p.y, h: p.h || 0 };
    p.joyride = { tier: tier.id, name: tier.name, color: c.color || tier.color, cls: tier.cls, damage: 0 };
    const idx = traffic.indexOf(c);
    if (idx >= 0) traffic.splice(idx, 1);
    saveJoyride();
    if (RL.Wanted) RL.Wanted.report('steal', { amount: tier.heat || 12 });
    if (s && (s.cars.length !== beforeCars || s.currentCar !== beforeId || s.money !== beforeMoney)) {
      s.money = beforeMoney;
      s.currentCar = beforeId;
    }
    try { RL.Audio.play('confirm'); } catch (e) { }
    return true;
  }
  function dropJoyride(opts) {
    const p = P();
    opts = opts || {};
    if (p) p.joyride = null;
    const s = RL.Game.state;
    if (s && s.hub) s.hub.joyride = null;
    if (s && !opts.quiet) {
      /* The stolen car is abandoned. It is never written into the garage. */
    }
    return true;
  }
  function prompt() {
    const p = P(); if (!p) return null;
    if (p.inCar === false && p.ownPark && p.joyride && Math.hypot(p.x - p.ownPark.x, p.y - p.ownPark.y) < 56) return { text: 'E: back to your car', color: '#7dff5a' };
    if (p.inCar === false && p.parked && Math.hypot(p.x - p.parked.x, p.y - p.parked.y) < 56) return { text: 'E: get in car', color: '#ffe03b' };
    if (p.inCar !== false && Math.abs(p.speed) < 90) {
      const stall = stalls.find((s) => inStall(s, p.x, p.y));
      if (stall) return { text: 'E: park & enter ' + stall.name, color: stall.color || '#2ee6ff' };
      const near = !nearDoor(p.x, p.y) && nearestTraffic(p, 46);
      if (near && Math.abs(p.speed) < 48) {
        const name = near.tierName || 'car';
        return { text: 'C / STEAL: take the ' + name, color: near.color || '#ff3b6b' };
      }
    }
    return null;
  }

  function drawCar(g, c, opts) {
    opts = opts || {};
    g.save(); g.translate(c.x, c.y); g.rotate(c.h || 0);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-16, -9, 36, 20);
    if (opts.night) {
      g.globalCompositeOperation = 'lighter';
      const grd = g.createLinearGradient(16, 0, 120, 0);
      grd.addColorStop(0, 'rgba(255,240,180,0.28)'); grd.addColorStop(1, 'rgba(255,240,180,0)');
      g.fillStyle = grd; g.beginPath(); g.moveTo(14, -6); g.lineTo(120, -36); g.lineTo(120, 36); g.lineTo(14, 6); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    if (opts.underglow) {
      g.globalCompositeOperation = 'lighter'; g.fillStyle = opts.underglow;
      g.globalAlpha = 0.35; g.beginPath(); g.ellipse(0, 0, 28, 16, 0, 0, 7); g.fill(); g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    g.fillStyle = c.color || '#ff3b6b';
    if (g.roundRect) { g.beginPath(); g.roundRect(-16, -8, 34, 16, 4); g.fill(); }
    else g.fillRect(-16, -8, 34, 16);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(-2, -6, 8, 12); g.fillRect(-13, -5, 4, 10);
    g.fillStyle = '#fff8c0'; g.fillRect(14, -6, 3, 3); g.fillRect(14, 3, 3, 3);
    g.fillStyle = '#ff2030'; g.fillRect(-16, -6, 2, 3); g.fillRect(-16, 3, 2, 3);
    if (opts.decal && RL.Look) RL.Look.paintDecal(g, opts.decal, opts.decalColor);
    if (opts.livery && RL.Roles) RL.Roles.paintLivery(g, !!opts.siren);
    g.restore();
  }

  function draw(ctx) {
    pollSiren();
    const p = P(); if (!p) return;
    const night = RL.City && RL.City.dark() > 0.25;
    traffic.forEach((c) => { if (!c.wrecked) drawCar(ctx, c, { night: false }); });
    props.forEach((prop) => { if (prop.alive) drawProp(ctx, prop); });
    if (p.joyride && p.ownPark && (p.inCar === false || Math.hypot(p.x - p.ownPark.x, p.y - p.ownPark.y) > 30)) {
      drawCar(ctx, { x: p.ownPark.x, y: p.ownPark.y, h: p.ownPark.h, color: RL.Game.carColor(RL.Game.currentCar()) }, { night: night });
    }
    if (p.inCar === false && p.parked) {
      const col = p.joyride ? p.joyride.color : RL.Game.carColor(RL.Game.currentCar());
      drawCar(ctx, { x: p.parked.x, y: p.parked.y, h: p.parked.h, color: col }, { night: night });
    }
    sparks.forEach((s) => { ctx.fillStyle = 'rgba(255,220,90,' + (s.t * 3) + ')'; ctx.fillRect(s.x - 2, s.y - 2, 4, 4); });
  }
  function drawPlayerCar(ctx) {
    const p = P(); if (!p || p.inCar === false || p.wrecked) return false;
    const car = RL.Game.currentCar();
    const look = car.look || {};
    const role = RL.Roles && RL.Roles.current();
    const color = p.joyride ? p.joyride.color : RL.Game.carColor(car);
    drawCar(ctx, { x: p.x, y: p.y, h: p.h, color: color }, {
      night: RL.City && RL.City.dark() > 0.2,
      decal: look.decal, decalColor: look.decalColor,
      livery: role === 'police',
      siren: !!p.siren,
      underglow: role === 'criminal' && RL.Roles.hasPerk('underglow') ? '#ff2ef0' : null
    });
    return true;
  }

  function drawProp(ctx, prop) {
    ctx.save();
    ctx.translate(prop.x, prop.y);
    ctx.fillStyle = prop.color || '#ccc';
    if (prop.kind === 'fence') ctx.fillRect(-16, -3, 32, 6);
    else if (prop.kind === 'barrier') ctx.fillRect(-12, -5, 24, 10);
    else if (prop.kind === 'sign') { ctx.fillRect(-2, -14, 4, 18); ctx.fillRect(-8, -18, 16, 8); }
    else { ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill(); }
    ctx.restore();
  }

  return {
    enter, update, draw, drawPlayerCar, drawCar, tryAction, trySteal, dropJoyride, applyDamage, prompt, nearDoor, kmh, limitAt, lightAt, crossingRed, headingAxis,
    stalls: () => stalls, traffic: () => traffic, props: () => props, get time() { return t; }, makeStalls, inStall
  };
})();
