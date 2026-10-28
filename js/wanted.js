/* wanted.js - wanted heat with no star cap. Cops scale with the star, but low stars are
   few, slow, and easy to juke. Crashes and wrecks add heat. Minor bumps do
   not. A star falls only after you stay hidden through a long cooldown.
   Each new star adds bounty, and a higher star adds more. Running someone
   over or wrecking a car adds bounty too. Losing the police pays nothing. Only a bust clears it.
   Cruisers spawn off screen and drive in. */
RL.Wanted = (function () {
  let cops = [], blocks = [], spikes = [], heli = null, search = 0, hiddenFor = 0, peak = 0, seen = false, pop = 0, cleanFor = 0, coolFrom = null;
  const VIS = [0, 280, 340, 420, 500, 600];

  function S() { return RL.Game.state; }
  function W() {
    const s = S(); if (!s) return null;
    if (!s.wanted) s.wanted = { stars: 0, heat: 0, peak: 0, bounty: 0 };
    if (!Number.isFinite(Number(s.wanted.bounty)) || Number(s.wanted.bounty) < 0) s.wanted.bounty = 0;
    s.wanted.bounty = Math.min(RL.Heat.BOUNTY_CAP, Math.round(Number(s.wanted.bounty)));
    return s.wanted;
  }
  function bountyOf(w) {
    if (!w) return 0;
    const n = Math.round(Number(w.bounty) || 0);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(RL.Heat.BOUNTY_CAP, n);
  }
  let bountyAt = 0;
  function raiseTo(amount) {
    const w = W(); if (!w) return 0;
    const n = Math.min(RL.Heat.BOUNTY_CAP, Math.max(0, Math.round(Number(amount) || 0)));
    if (n > bountyOf(w)) w.bounty = n;
    return bountyOf(w);
  }
  function grantStarBounty(w, from, to) {
    if (!w) return 0;
    const role = RL.Roles ? RL.Roles.current() : 'neutral';
    if (role === 'police') return 0;
    let add = 0;
    for (let k = (from | 0) + 1; k <= (to | 0); k++) add += RL.Heat.starPay(k, role);
    if (!(add > 0)) return 0;
    const before = bountyOf(w);
    w.bounty = Math.min(RL.Heat.BOUNTY_CAP, before + add);
    const gained = w.bounty - before;
    if (gained > 0) {
      try { RL.UI.toast((to > 1 ? to + ' stars' : '1 star') + ' — bounty +' + RL.fmtMoney(gained), '#fff'); } catch (e) { }
    }
    return gained;
  }
  function clearBounty() {
    const w = W(); if (!w) return;
    w.bounty = 0;
  }
  function addBounty(kind) {
    const w = W(); if (!w) return 0;
    const role = RL.Roles ? RL.Roles.current() : 'neutral';
    if (role === 'police') return 0;
    const amt = RL.Heat.crimePay(kind);
    if (!(amt > 0)) return 0;
    const now = Date.now();
    if (now - bountyAt < 1000) return 0;
    bountyAt = now;
    const before = bountyOf(w);
    w.bounty = Math.min(RL.Heat.BOUNTY_CAP, before + amt);
    const gained = w.bounty - before;
    if (gained > 0) {
      const label = kind === 'pedestrian' ? 'Pedestrian' : kind === 'wreck' ? 'Wreck' : 'Ram';
      try { RL.UI.toast(label + ' — bounty +' + RL.fmtMoney(gained), '#fff'); } catch (e) { }
      try { if (RL.Servers && RL.Servers.noteCrime) RL.Servers.noteCrime(kind); } catch (e2) { }
    }
    return gained;
  }
  function stars() { const w = W(); return w ? w.stars : 0; }
  function tireCut() { return pop; }
  function syncStars(w) {
    const n = RL.Heat.starsOf(w.heat);
    if (n > w.stars) {
      const prev = w.stars | 0;
      w.stars = n; w.peak = Math.max(w.peak || 0, n); peak = Math.max(peak, n);
      grantStarBounty(w, prev, n);
      try { if (RL.Servers && RL.Servers.noteStars) RL.Servers.noteStars(n, RL.Roles ? RL.Roles.current() : 'neutral'); } catch (e0) { }
      try { RL.Audio.play(n >= 4 ? 'error' : 'beep'); } catch (e) { }
      RL.UI.toast(n + ' STAR' + (n > 1 ? 'S' : '') + ' — police are on you', n >= 4 ? '#ff3b6b' : '#ffe03b');
      if (RL.Game.unlockAch) { if (n >= 1) RL.Game.unlockAch('sp_star1'); if (n >= 5) RL.Game.unlockAch('sp_star5'); }
      if (RL.Daily) RL.Daily.progress('stars', 0);
    } else w.stars = n;
  }
  function policeTicket(type, info) {
    if (!RL.Roles || RL.Roles.current() !== 'police') return;
    if (type === 'ped' || (type === 'traffic' && !info.suspect)) RL.Roles.infraction('traffic');
    else if (type === 'redlight') RL.Roles.infraction('redlight');
    else if (type === 'street' || type === 'heist' || type === 'smuggle' || type === 'robbery') RL.Roles.infraction(type);
  }
  function report(type, info) {
    const w = W(); if (!w) return;
    info = info || {};
    const role = RL.Roles ? RL.Roles.current() : 'neutral';
    if (role === 'police') {
      if (type === 'traffic' && info.suspect) return;
      const siren = !!(RL.Hub && RL.Hub.player && RL.Hub.player.siren);
      if (siren && (type === 'speeding' || type === 'redlight')) return;
    }
    const major = type !== 'speeding' || info.major;
    if ((role === 'neutral' || role === 'police') && type === 'speeding' && !major) return;
    let amt = RL.Heat.amount(type, info);
    if (role === 'criminal') amt *= 1.5;
    if (RL.Roles && RL.Roles.hasPerk('plates')) amt *= 0.72;
    if (amt < 0.5) { if (role === 'police') policeTicket(type, info); return; }
    cleanFor = 0;
    if (coolFrom != null && w.heat < coolFrom) w.heat = coolFrom;
    hiddenFor = 0;
    if (type === 'robbery') w.heat = RL.Heat.raiseForRobbery(w.heat, amt);
    else {
      w.heat = RL.clamp(w.heat + amt, 0, RL.Heat.MAX);
      if (type === 'street') w.heat = Math.max(w.heat, 48);
      if (type === 'heist') w.heat = Math.max(w.heat, 60);
    }
    coolFrom = w.heat;
    syncStars(w);
    if (type === 'copkill') RL.UI.toast('Cruiser destroyed', '#ff3b6b');
    else if (type === 'steal') RL.UI.toast(info.parked ? 'Someone saw the break-in' : 'Stolen car — the police noticed', '#ff8a2e');
    else if (type === 'prop' && info.destroyed) RL.UI.toast('Smashed a ' + (info.kind || 'prop'), '#ff8a2e');
    else if (type === 'ped') RL.UI.toast('Hit a pedestrian', '#fff');
    else if (type === 'traffic' && (info.destroyed || amt >= 8)) RL.UI.toast(info.destroyed ? 'Wrecked a car' : 'Hit traffic', '#ff8a2e');
    else if (type === 'redlight' || type === 'cop' || type === 'street' || type === 'heist' || type === 'smuggle') {
      RL.UI.toast(({ redlight: 'Ran a red light', cop: 'Hit a cop', street: 'Illegal street race', heist: 'Alarm tripped', smuggle: 'Hot cargo' })[type] || 'Heat', '#ff8a2e');
    }
    if (type === 'redlight' && RL.Game.unlockAch) RL.Game.unlockAch('sp_red');
    if (role === 'police' && w.stars > 0 && RL.Roles && RL.Roles.revokeForWanted) {
      RL.Roles.revokeForWanted();
      return;
    }
    if (role === 'police') policeTicket(type, info);
  }
  let speedAcc = 0;
  function reportSpeed(kmh, limit, dt) {
    if (!limit || kmh < limit + 18) { speedAcc = Math.max(0, speedAcc - dt); return; }
    speedAcc += dt;
    const major = kmh > limit * 1.55;
    const need = major ? 2.2 : 3.6;
    if (speedAcc >= need) { speedAcc = 0; report('speeding', { major: major }); }
  }

  function los(ax, ay, bx, by) {
    const dist = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(2, Math.floor(dist / 22));
    for (let i = 1; i < steps; i++) {
      const x = ax + (bx - ax) * (i / steps), y = ay + (by - ay) * (i / steps);
      if (RL.Hub.blocked(x, y, 4)) return false;
    }
    return true;
  }
  function roadNear(x, y, h, back) {
    const m = RL.CityMap; if (!m) return { x, y };
    const dir = back ? Math.PI : 0;
    for (let d = 80; d <= 520; d += 40) {
      const px = x - Math.cos(h + dir) * d, py = y - Math.sin(h + dir) * d;
      if (RL.Drive.limitAt(px, py) && !RL.Hub.blocked(px, py, 16)) return { x: px, y: py };
    }
    return { x, y };
  }
  function aimPoint(i, p, n, canSee, cop) {
    if (!canSee) return { x: cop.lastX, y: cop.lastY, vx: 0, vy: 0 };
    const h = p.h || 0;
    const fx = Math.cos(h), fy = Math.sin(h);
    const nx = -fy, ny = fx;
    const slot = i % 3;
    let ax, ay;
    if (slot === 0) {
      ax = p.x + fx * 18;
      ay = p.y + fy * 18;
    } else if (slot === 1) {
      ax = p.x + fx * (70 + n * 8);
      ay = p.y + fy * (70 + n * 8);
    } else {
      const side = (i % 2 ? 1 : -1) * (32 + n * 3);
      ax = p.x + nx * side + fx * 36;
      ay = p.y + ny * side + fy * 36;
    }
    return { x: ax, y: ay, vx: 0, vy: 0 };
  }
  /* Far enough to start outside a desktop view at the widest zoom. */
  const SPAWN_MIN = 1400;
  function farSpawn(p, index) {
    const m = RL.CityMap;
    const T = 40;
    let best = null, bestScore = -1;
    if (m && m.mask) {
      for (let ty = 1; ty < m.rows - 1; ty++) {
        for (let tx = 1; tx < m.cols - 1; tx++) {
          if (!m.mask[ty * m.cols + tx]) continue;
          const x = (tx + 0.5) * T, y = (ty + 0.5) * T;
          if (RL.Hub.blocked(x, y, 16)) continue;
          const d = Math.hypot(x - p.x, y - p.y);
          if (d < SPAWN_MIN) continue;
          const score = d + ((tx * 3 + ty * 5 + index * 11) % 17) * 8;
          if (score > bestScore) { bestScore = score; best = { x: x, y: y, d: d }; }
        }
      }
    }
    if (best) return best;
    let far = null, farD = -1;
    if (m && m.mask) {
      for (let ty = 1; ty < m.rows - 1; ty++) {
        for (let tx = 1; tx < m.cols - 1; tx++) {
          if (!m.mask[ty * m.cols + tx]) continue;
          const x = (tx + 0.5) * T, y = (ty + 0.5) * T;
          if (RL.Hub.blocked(x, y, 16)) continue;
          const d = Math.hypot(x - p.x, y - p.y);
          if (d > farD) { farD = d; far = { x: x, y: y, d: d }; }
        }
      }
    }
    return far && far.d >= SPAWN_MIN ? far : null;
  }
  function ensureCops(p) {
    const n = stars();
    const need = RL.Pursuit.countFor(n);
    while (cops.length < need) {
      const spot = farSpawn(p, cops.length);
      if (!spot) break;
      const face = Math.atan2(p.y - spot.y, p.x - spot.x);
      cops.push({
        x: spot.x, y: spot.y, h: face, speed: 40,
        vx: Math.cos(face) * 40, vy: Math.sin(face) * 40,
        color: '#f4f7ff', seen: false, stuck: 0, lastX: spot.x, lastY: spot.y,
        way: null, unstuck: 0
      });
    }
    while (cops.length > need) cops.pop();
    if (n >= 4) {
      if (!blocks.length || passed(p, blocks[0])) placeBlock(p);
    } else blocks = [];
    if (n >= 5) {
      if (!spikes.length || passed(p, spikes[0])) placeSpikes(p);
      if (!heli) {
        const hdg = p.h || 0;
        heli = { x: p.x - Math.cos(hdg) * 1600, y: p.y - Math.sin(hdg) * 1600 };
      }
    } else { spikes = []; heli = null; }
  }
  function passed(p, obj) {
    if (!obj) return true;
    const dx = obj.x - p.x, dy = obj.y - p.y;
    const forward = dx * Math.cos(p.h || 0) + dy * Math.sin(p.h || 0);
    return forward < -80;
  }
  function roadAhead(p, minD) {
    const h = p.h || 0;
    for (let d = minD; d <= minD + 700; d += 40) {
      const x = p.x + Math.cos(h) * d, y = p.y + Math.sin(h) * d;
      if (RL.Drive && RL.Drive.limitAt(x, y) && !RL.Hub.blocked(x, y, 16) && Math.hypot(x - p.x, y - p.y) >= minD) return { x: x, y: y };
    }
    return null;
  }
  function placeBlock(p) {
    const h = p.h || 0;
    const spot = roadAhead(p, 1500);
    if (!spot) return;
    const nx = -Math.sin(h), ny = Math.cos(h);
    blocks = [
      { x: spot.x + nx * 18, y: spot.y + ny * 18, h: h + Math.PI / 2 },
      { x: spot.x - nx * 18, y: spot.y - ny * 18, h: h + Math.PI / 2 }
    ];
  }
  function placeSpikes(p) {
    const h = p.h || 0;
    const spot = roadAhead(p, 1500);
    if (!spot) return;
    spikes = [{ x: spot.x, y: spot.y, h: h + Math.PI / 2, w: 70 }];
  }
  function hurtPlayer(p, dmg) {
    if (RL.Drive && RL.Drive.applyDamage) RL.Drive.applyDamage(p, dmg);
    else {
      const car = RL.Game.currentCar();
      if (car && !(p.invuln > 0)) {
        car.damage = RL.clamp((car.damage || 0) + dmg, 0, 100);
        if (car.damage >= 100 && RL.Explode) RL.Explode.cityCar(p);
      }
    }
  }

  function update(dt, p) {
    const w = W(); if (!w || !p) return;
    if (pop > 0) pop -= dt;
    if (RL.Roles && RL.Roles.current() === 'police' && w.stars > 0) RL.Roles.revokeForWanted();
    if (RL.Roles && RL.Roles.current() === 'police') {
      cops = []; blocks = []; spikes = []; heli = null; search = 0; hiddenFor = 0; seen = false;
      const lim = p.onRoad && RL.Drive ? RL.Drive.limitAt(p.x, p.y) : 0;
      const legal = !lim || (RL.Drive && RL.Drive.kmh(p.speed) <= lim + 8);
      if (legal) cleanFor += dt; else cleanFor = 0;
      if (w.heat > 0) {
        w.heat = RL.Heat.decay(w.heat, 0, dt, false, cleanFor);
        syncStars(w);
      }
      if (w.stars > 0) RL.Roles.revokeForWanted();
      if (RL.Roles.current() === 'police') return;
    }
    const n = w.stars;
    if (n <= 0) {
      cops = []; blocks = []; spikes = []; heli = null; search = 0; hiddenFor = 0; seen = false;
      if (peak > 0 && w.heat <= 0) peak = 0;
    } else ensureCops(p);
    let visible = false;
    const vis = (VIS[Math.min(5, n)] || 0) * ((RL.City && RL.City.dark() > 0.45) ? 0.8 : 1);
    if (n > 0) cops.forEach((c, i) => {
      if (c.hitCd > 0) c.hitCd -= dt;
      if (c.onFoot && !c.wrecked) {
        c.speed = 0; c.vx = 0; c.vy = 0;
        const canSee = Math.hypot(c.x - p.x, c.y - p.y) < vis && los(c.x, c.y, p.x, p.y);
        c.seen = canSee;
        if (canSee) { visible = true; c.lastX = p.x; c.lastY = p.y; search = 3.2; }
        return;
      }
      if (c.wrecked) {
        c.wreckT -= dt; c.speed = 0; c.vx = 0; c.vy = 0;
        if (c.wreckT <= 0) c.despawn = true;
        return;
      }
      const canSee = Math.hypot(c.x - p.x, c.y - p.y) < vis && los(c.x, c.y, p.x, p.y);
      c.seen = canSee;
      if (canSee) { visible = true; c.lastX = p.x; c.lastY = p.y; search = 3.2; }
      let aim = aimPoint(i, p, Math.min(5, n), canSee, c);
      if (c.way) {
        aim = { x: c.way.x, y: c.way.y, vx: 0, vy: 0 };
        c.wayT = (c.wayT || 0) + dt;
        if (Math.hypot(c.x - c.way.x, c.y - c.way.y) < 36 || c.wayT > 3.4) c.way = null;
      }
      const ox = c.x, oy = c.y;
      RL.Pursuit.stepCop(c, aim, dt, n);
      if (RL.Hub.blocked(c.x, oy, 14)) { c.x = ox; c.vx *= -0.15; c.speed *= 0.65; }
      if (RL.Hub.blocked(c.x, c.y, 14)) { c.y = oy; c.vy *= -0.15; c.speed *= 0.65; }
      if (c.speed < 22) c.stuck += dt; else c.stuck = Math.max(0, c.stuck - dt * 0.5);
      if (c.stuck > 0.85 && !c.way) {
        const spin = ((c.unstuck || 0) % 4) * (Math.PI / 2);
        const ang = (c.h || 0) + Math.PI + spin;
        let picked = null;
        for (let dist = 70; dist <= 180; dist += 36) {
          const x = c.x + Math.cos(ang) * dist, y = c.y + Math.sin(ang) * dist;
          if (RL.Drive && RL.Drive.limitAt(x, y) && !RL.Hub.blocked(x, y, 16)) { picked = { x: x, y: y }; break; }
        }
        if (picked) { c.way = picked; c.wayT = 0; c.aimX = null; c.aimY = null; }
        c.unstuck = (c.unstuck || 0) + 1;
        c.stuck = 0.2;
      }
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < 26 && d > 0.1 && p.inCar !== false && !p.wrecked) {
        const push = (26 - d) / d;
        if (!RL.Hub.blocked(p.x + (p.x - c.x) * push, p.y, 15)) p.x += (p.x - c.x) * push * 0.22;
        if (!RL.Hub.blocked(p.x, p.y + (p.y - c.y) * push, 15)) p.y += (p.y - c.y) * push * 0.22;
        p.speed *= 0.978;
        if (Math.abs(p.speed) > 70 && !(c.hitCd > 0)) {
          c.hitCd = 1.05;
          report('cop', { speed: Math.abs(p.speed) });
          if (!(p.invuln > 0)) hurtPlayer(p, RL.Pursuit.ramDamage(n));
          c.dmg = (c.dmg || 0) + 14 + Math.abs(p.speed) * 0.04;
          if (c.dmg >= 100 && !c.wrecked && RL.Explode && RL.Explode.enabled()) {
            c.wrecked = true; c.wreckT = RL.Explode.DELAY || 2.7; c.dmg = 100; c.speed = 0; c.vx = 0; c.vy = 0;
            RL.Explode.boom(c.x, c.y, {});
            report('copkill', {});
          }
          try { RL.Audio.play('crash', 0.25); } catch (e) { }
        }
      }
    });
    if (cops.some((c) => c.despawn)) {
      cops = cops.filter((c) => !c.despawn);
      if (n > 0) ensureCops(p);
    }
    if (RL.Roles && RL.Roles.peers) RL.Roles.peers().forEach((peer) => {
      if (peer.role === 'police' && Math.hypot(peer.x - p.x, peer.y - p.y) < vis && los(peer.x, peer.y, p.x, p.y)) visible = true;
    });
    if (heli && n >= 5) {
      heli.x += (p.x - heli.x) * Math.min(1, dt * 0.55);
      heli.y += (p.y - 30 - heli.y) * Math.min(1, dt * 0.55);
      if (Math.hypot(heli.x - p.x, heli.y - p.y) < 130) { visible = true; }
    }
    if (p._blockCd > 0) p._blockCd -= dt;
    blocks.forEach((b) => {
      if (Math.hypot(b.x - p.x, b.y - p.y) < 26 && p.inCar !== false && !(p._blockCd > 0)) {
        p._blockCd = 0.85; p.speed *= 0.62;
        report('cop', { speed: Math.abs(p.speed) });
        if (!p.wrecked && !(p.invuln > 0)) hurtPlayer(p, 2);
      }
    });
    spikes.forEach((s) => {
      if (Math.hypot(s.x - p.x, s.y - p.y) < 28 && pop <= 0 && p.inCar !== false && Math.abs(p.speed) > 40) {
        pop = 6; p.speed *= 0.28;
        RL.UI.toast('Spike strip — tires are shredded', '#ff3b6b');
        try { RL.Audio.play('crash', 0.4); } catch (e) { }
      }
    });
    const role = RL.Roles ? RL.Roles.current() : 'neutral';
    if (visible) {
      seen = true; hiddenFor = 0; search = Math.max(search, 2.2);
      if (coolFrom != null && w.heat < coolFrom) w.heat = coolFrom;
      coolFrom = w.heat;
    } else {
      search -= dt;
      if (search <= 0 && n > 0) {
        if (hiddenFor <= 0) coolFrom = w.heat;
        const slow = (role === 'criminal' && RL.Roles && RL.Roles.decayMod) ? RL.Roles.decayMod() : 1;
        hiddenFor += dt * slow;
        const need = RL.Heat.hideSeconds(n);
        const floor = RL.Heat.starThreshold(n);
        if (hiddenFor >= need) {
          w.heat = Math.max(0, floor - 0.01);
          hiddenFor = 0;
          coolFrom = w.heat;
          syncStars(w);
          if (w.stars <= 0 && (peak > 0 || (w.peak || 0) > 0)) evade();
          else if (w.stars > 0) RL.UI.toast('Star dropped — stay hidden', '#fff');
        } else if (coolFrom != null && coolFrom > floor) {
          const t = hiddenFor / need;
          w.heat = Math.max(floor, coolFrom + (floor - coolFrom) * t);
          syncStars(w);
        }
      }
    }
    const lim = p.onRoad && RL.Drive ? RL.Drive.limitAt(p.x, p.y) : 0;
    const legal = !lim || (RL.Drive && RL.Drive.kmh(p.speed) <= lim + 8);
    if (legal) cleanFor += dt;
    else cleanFor = 0;
    const decayMul = (role === 'criminal' && RL.Roles && RL.Roles.decayMod) ? RL.Roles.decayMod() : 1;
    if (w.stars <= 0 && w.heat > 0) {
      let cooled = RL.Heat.decay(w.heat, 0, dt, false, cleanFor, 0);
      if (cooled < w.heat) cooled = w.heat - (w.heat - cooled) * decayMul;
      if (cooled !== w.heat) { w.heat = cooled; syncStars(w); }
    }
    if (!p._skipFoot && RL.Foot) RL.Foot.update(dt, p, cops, w.stars);
    if (!p._skipFoot && RL.Foot && RL.Foot.active()) p._pin = 0;
    else if (w.stars > 0 && p.inCar !== false && !p.wrecked) {
      const close = cops.filter((c) => !c.wrecked && Math.hypot(c.x - p.x, c.y - p.y) < 30).length;
      const near = cops.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 110);
      const slow = Math.abs(p.speed) < 16 + Math.min(5, n) * 2;
      const boxed = n >= 4 && close >= 2 && Math.abs(p.speed) < 34;
      const spiked = pop > 4.2 && near && Math.abs(p.speed) < 36;
      if ((close >= 1 && slow) || boxed || spiked) {
        p._pin = (p._pin || 0) + dt;
        if (p._pin > RL.Pursuit.bustSeconds(n)) bust();
      } else p._pin = Math.max(0, (p._pin || 0) - dt * 0.55);
    }
  }
  function liveBounty() {
    const w = W();
    if (!w) return 0;
    const role = RL.Roles ? RL.Roles.current() : 'neutral';
    if (role === 'police') return 0;
    return bountyOf(w);
  }
  function evade() {
    const w = W(); if (!w) return;
    const gained = Math.max(peak, w.peak || 0, 1);
    const role = RL.Roles ? RL.Roles.current() : 'neutral';
    const kept = bountyOf(w);
    S().respect += gained;
    S().totals.evasions = (S().totals.evasions || 0) + 1;
    if (gained >= 5) S().totals.evade5 = (S().totals.evade5 || 0) + 1;
    if (RL.Roles) RL.Roles.addXp(role === 'criminal' ? 'criminal' : 'neutral', 12 + gained * 6);
    RL.UI.toast(kept > 0 ? 'Evaded. Bounty stays ' + RL.fmtMoney(kept) : 'Evaded', '#fff');
    try { RL.Audio.play('coin'); } catch (e) { }
    if (RL.Game.unlockAch) { RL.Game.unlockAch('sp_evade'); if (gained >= 5) RL.Game.unlockAch('sp_evade5'); }
    if (RL.Daily) RL.Daily.progress('evade', 1);
    RL.Game.event('evade', { stars: gained });
    peak = 0; w.peak = 0; w.heat = 0; w.stars = 0; seen = false; cleanFor = 0; hiddenFor = 0; coolFrom = null;
    if (RL.Foot) RL.Foot.reset();
    RL.Game.save();
  }
  function bust() {
    const w = W(); if (!w || (w.stars <= 0 && bountyOf(w) <= 0)) return;
    const s = S(), car = RL.Game.currentCar();
    const starsN = Math.max(w.stars || 0, 1);
    if (RL.Drive && RL.Drive.dropJoyride) RL.Drive.dropJoyride({ quiet: true });
    const fee = Math.round((180 * starsN + (car ? RL.Game.carDef(car.id).price * 0.015 : 0) + 100) * (RL.Roles && RL.Roles.fineMod ? RL.Roles.fineMod() : 1));
    const paid = Math.min(s.money, fee);
    RL.Game.addMoney(-paid);
    s.totals.busts = (s.totals.busts || 0) + 1;
    s.respect = Math.max(-20, s.respect - starsN);
    if (s.job && (s.job.type === 'heist' || s.job.type === 'smuggle')) s.job = null;
    w.heat = 0; w.stars = 0; w.peak = 0; w.bounty = 0; peak = 0; pop = 0; cleanFor = 0; hiddenFor = 0; coolFrom = null;
    cops = []; blocks = []; spikes = []; heli = null;
    if (RL.Foot) RL.Foot.reset();
    const hq = (RL.CityMap.buildings || []).find((b) => b.id === 'hq');
    const p = RL.Hub.player;
    if (p && hq) { p.x = hq.door.x; p.y = hq.door.y + 48; p.speed = 0; p.h = Math.PI / 2; p.inCar = true; p._pin = 0; }
    RL.UI.toast('BUSTED. Impound fee ' + RL.fmtMoney(paid), '#ff3b6b');
    try { RL.Audio.play('error'); } catch (e) { }
    if (RL.Game.unlockAch) RL.Game.unlockAch('sp_busted');
    RL.Game.event('busted', { fee: paid });
    RL.Game.save();
  }
  function clearHeat() {
    const w = W(); if (!w) return;
    w.heat = 0; w.stars = 0; w.peak = 0; peak = 0; cleanFor = 0; hiddenFor = 0; coolFrom = null;
    cops = []; blocks = []; spikes = []; heli = null;
    if (RL.Foot) RL.Foot.reset();
  }

  function draw(ctx) {
    const flash = 0.5 + 0.5 * Math.sin(performance.now() / 120);
    cops.forEach((c) => { if (!c.wrecked) RL.Drive.drawCar(ctx, c, { livery: true, siren: true }); });
    if (RL.Foot) RL.Foot.draw(ctx);
    blocks.forEach((b) => RL.Drive.drawCar(ctx, { x: b.x, y: b.y, h: b.h, color: '#f4f7ff' }, { livery: true, siren: true }));
    spikes.forEach((s) => {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.h);
      ctx.fillStyle = '#222'; ctx.fillRect(-s.w, -8, s.w * 2, 16);
      ctx.fillStyle = '#ddd';
      for (let i = -s.w; i < s.w; i += 10) { ctx.beginPath(); ctx.moveTo(i, -6); ctx.lineTo(i + 5, 0); ctx.lineTo(i, 6); ctx.fill(); }
      ctx.restore();
    });
    if (heli) {
      ctx.save(); ctx.translate(heli.x, heli.y);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(18, 22, 34, 16, 0, 0, 7); ctx.fill();
      const g = ctx.createRadialGradient(0, 40, 10, 0, 40, 150);
      g.addColorStop(0, 'rgba(255,255,210,0.28)'); g.addColorStop(1, 'rgba(255,255,210,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 40, 150, 0, 7); ctx.fill();
      ctx.strokeStyle = '#9fb3c8'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(26, 0); ctx.stroke();
      ctx.fillStyle = flash > 0.5 ? '#ff3b6b' : '#3fa9ff'; ctx.fillRect(-8, -6, 16, 12);
      ctx.restore();
    }
  }
  function drawHud(ctx, Wd, Hd) {
    const w = W(); if (!w) return;
    ctx.save(); ctx.textBaseline = 'top';
    const y = 8;
    ctx.font = 'bold 22px Trebuchet MS, sans-serif';
    const label = RL.Heat.starLabel(w.stars);
    const bounty = liveBounty();
    const bountyText = bounty > 0 ? '  $' + bounty : '';
    ctx.font = 'bold 22px Trebuchet MS, sans-serif';
    const starsW = ctx.measureText(label).width;
    ctx.font = 'bold 16px Trebuchet MS, sans-serif';
    const bountyW = bountyText ? ctx.measureText(bountyText).width : 0;
    const total = starsW + bountyW;
    const x0 = Wd / 2 - total / 2;
    ctx.textAlign = 'left';
    ctx.font = 'bold 22px Trebuchet MS, sans-serif';
    ctx.fillStyle = w.stars >= 4 ? '#ff3b6b' : w.stars ? '#ffe03b' : '#fff';
    ctx.fillText(label, x0, y);
    if (bountyText) {
      ctx.font = 'bold 16px Trebuchet MS, sans-serif';
      const bx = x0 + starsW;
      const bw = bountyW + 8;
      ctx.fillStyle = '#0c0816';
      ctx.fillRect(bx - 2, y + 2, bw, 18);
      ctx.fillStyle = '#fff';
      ctx.fillText(bountyText, bx, y + 4);
    }
    const hp = RL.Foot ? RL.Foot.playerHp() : 100;
    const hw = 120, hx = Wd / 2 - hw / 2, hy = y + 28;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(hx, hy, hw, 10);
    ctx.fillStyle = hp > 55 ? '#7dff5a' : hp > 28 ? '#ffe03b' : '#ff5a7a';
    ctx.fillRect(hx, hy, hw * RL.clamp(hp / 100, 0, 1), 10);
    ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    ctx.fillText('HP', hx - 22, hy - 1);
    if (w.stars > 0) {
      const bw = 140, bx = Wd / 2 - bw / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(bx, y + 44, bw, 8);
      const floor = RL.Heat.starThreshold(w.stars);
      const ceil = RL.Heat.starThreshold(w.stars + 1);
      ctx.fillStyle = '#ff3b6b'; ctx.fillRect(bx, y + 44, bw * RL.clamp((w.heat - floor) / Math.max(1, ceil - floor), 0, 1), 8);
      const hiding = search <= 0 && hiddenFor > 0;
      const clock = RL.Heat.formatCooldown(hiding ? RL.Heat.cooldownLeft(w.stars, hiddenFor) : RL.Heat.hideSeconds(w.stars));
      const status = hiding ? ('HIDDEN  ' + clock) : (heli ? 'HELICOPTER SPOTLIGHT' : (search > 0 ? 'SEARCHING' : 'WANTED'));
      const line = hiding ? status : (status + '   COOLDOWN  ' + clock);
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(line).width;
      const ty = y + 56;
      ctx.fillStyle = 'rgba(12,8,22,0.92)';
      ctx.fillRect(Wd / 2 - tw / 2 - 8, ty - 2, tw + 16, 18);
      ctx.fillStyle = '#fff';
      ctx.fillText(line, Wd / 2, ty);
    }
    const role = RL.Roles ? RL.Roles.hud() : null;
    if (role) { ctx.textAlign = 'left'; ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = role.color; ctx.fillText(role.label, 12, Hd - (document.body.classList.contains('touch') ? 168 : 78)); }
    ctx.restore();
  }

  return {
    report, reportSpeed, update, draw, drawHud, stars, tireCut, bust, evade, clearHeat, clearBounty, W, liveBounty, addBounty, raiseTo,
    debugReady() { bountyAt = 0; },
    cops: () => cops, heli: () => heli, blocks: () => blocks, spikes: () => spikes,
    debugHidden(dt) { const p = RL.Hub.player; cops.forEach((c) => { c.x = p.x + 2000; c.y = p.y; c.seen = false; }); search = 0; hiddenFor = 3; cleanFor = 6; if (heli) heli.x = p.x + 2000; update(dt || 0.5, p); },
    debugPin() { const p = RL.Hub.player; if (RL.Foot) RL.Foot.reset(cops); if (!cops.length && stars() > 0) ensureCops(p); if (cops[0]) { cops[0].x = p.x + 10; cops[0].y = p.y; } p.speed = 0; p._pin = 20; p._skipFoot = true; update(0.2, p); p._skipFoot = false; }
  };
})();
