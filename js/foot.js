/* foot.js - Officers (and, at high stars, a few armed rivals) hop out when you
   stop, wreck, leave the car, or get boxed in. Swings and shots are telegraphed
   and miss if you leave range. Driving off sends them back to their cars.
   Player HP is separate from car damage. At 0 you are Busted or Wasted, then
   you wake up at the nearest garage or hospital and pay a capped fee. */
RL.Foot = (function () {
  const FOOT = [0, 1, 1, 2, 3, 4];
  const THUG = [0, 0, 0, 0, 1, 2];
  const FEE_CAP = 280;
  const MELEE_RANGE = 28;
  const SHOT_RANGE = 118;
  const WINDUP_MELEE = 0.62;
  const WINDUP_SHOT = 0.78;
  const COOL_MELEE = 1.05;
  const COOL_SHOT = 1.35;
  const FACE = 0.6;
  /* On-sight fire for a clean criminal. Short, telegraphed, and aimed at the
     spot you were standing. Walking speed is 190 px/s, so the dodge gap is
     a step, not a sprint. Officers hold a post and do not chase. */
  const SIGHT_RANGE = 100;
  const SIGHT_WIND = 0.96;
  const SIGHT_COOL = 2.2;
  const SIGHT_DMG = 4;
  const SIGHT_FACE = 0.42;
  const SIGHT_DODGE = 22;
  const SIGHT_POCKET = 64;

  let units = [];
  let beats = [];
  let puffs = [];
  let sightTold = false;

  function clamp(v, a, b) {
    v = Number(v);
    if (!Number.isFinite(v)) return a;
    return v < a ? a : v > b ? b : v;
  }
  function starIndex(n) {
    n = n | 0;
    if (n < 0) return 0;
    return n > 5 ? 5 : n;
  }
  function starN(n) {
    n = starIndex(n);
    return n < 1 ? 1 : n;
  }
  function countFor(n) { return FOOT[starIndex(n)]; }
  function thugCount(n) { return THUG[starIndex(n)]; }
  function reactDelay(n) {
    const s = starN(n);
    return 0.48 - (s - 1) * 0.07;
  }
  function footSpeed(n) { return 108 + starN(n) * 12; }
  function meleeDamage(n) { return 6 + starN(n); }
  function shotDamage() { return 5; }

  function shouldDismount(stars, p, close) {
    if (!(stars >= 1) || !p) return false;
    if (p.wrecked) return true;
    if (p.inCar === false) return true;
    if (Math.abs(p.speed || 0) < 22) return true;
    if (stars >= 4 && (close || 0) >= 2 && Math.abs(p.speed || 0) < 34) return true;
    return false;
  }
  function drivingOff(p) {
    return !!(p && p.inCar !== false && !p.wrecked && Math.abs(p.speed || 0) >= 48);
  }
  function feeFor(stars, money) {
    const raw = 90 + starIndex(stars) * 50;
    const cap = raw > FEE_CAP ? FEE_CAP : raw;
    let m = Number(money);
    if (!Number.isFinite(m) || m < 0) m = 0;
    return Math.min(m, cap);
  }
  function downLabel(kind) { return kind === 'police' ? 'Busted' : 'Wasted'; }
  function normalizeHp(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 100;
    return n > 100 ? 100 : n;
  }
  function playerHp() {
    const p = RL.Hub && RL.Hub.player;
    if (p && Number.isFinite(Number(p.hp))) return clamp(p.hp, 0, 100);
    const s = RL.Game && RL.Game.state;
    if (s && s.hub && Number.isFinite(Number(s.hub.hp))) return clamp(s.hub.hp, 0, 100);
    return 100;
  }
  function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function strikeHits(u, target, range) {
    const dist = Math.hypot(target.x - u.x, target.y - u.y);
    if (dist > range) return false;
    return Math.abs(angleDiff(angleTo(u.x, u.y, target.x, target.y), u.h || 0)) < FACE;
  }
  function sightActive(role, stars) {
    return role === 'criminal' && (stars | 0) <= 0;
  }
  function sightClear(u, target, blocked) {
    if (!blocked) return true;
    const dist = Math.hypot(target.x - u.x, target.y - u.y);
    const steps = Math.max(2, Math.floor(dist / 22));
    for (let i = 1; i < steps; i++) {
      const x = u.x + (target.x - u.x) * (i / steps);
      const y = u.y + (target.y - u.y) * (i / steps);
      if (blocked(x, y)) return false;
    }
    return true;
  }
  /* One beat-officer step. Heading locks when the flash starts. A hit needs
     the player still near the aim point, still in the cone, still in range,
     and still in line of sight. ceasefire (the station door) never connects. */
  function stepSight(u, target, dt, blocked) {
    const out = { hit: false, missed: false, dmg: 0, aiming: false };
    if (!u || !target) return out;
    if (u.cool > 0) u.cool -= dt;
    const dist = Math.hypot(target.x - u.x, target.y - u.y);
    const aim = angleTo(u.x, u.y, target.x, target.y);
    if (!(u.wind > 0)) {
      const dh = angleDiff(aim, u.h || 0);
      u.h = (u.h || 0) + clamp(dh, -2.4 * dt, 2.4 * dt);
    }
    if (u.wind > 0) {
      u.wind -= dt;
      out.aiming = true;
      if (u.wind <= 0) {
        u.wind = 0;
        u.mode = null;
        u.cool = SIGHT_COOL;
        const moved = Math.hypot(target.x - (u.aimX || 0), target.y - (u.aimY || 0));
        const now = Math.hypot(target.x - u.x, target.y - u.y);
        const facing = Math.abs(angleDiff(angleTo(u.x, u.y, target.x, target.y), u.h || 0)) < SIGHT_FACE;
        const losOk = sightClear(u, target, blocked);
        if (!target.ceasefire && now <= SIGHT_RANGE && facing && moved <= SIGHT_DODGE && losOk) {
          out.hit = true;
          out.dmg = SIGHT_DMG;
        } else out.missed = true;
      }
      return out;
    }
    if (u.cool > 0 || target.ceasefire || dist > SIGHT_RANGE) return out;
    if (!sightClear(u, target, blocked)) return out;
    if (Math.abs(angleDiff(aim, u.h || 0)) > 0.35) return out;
    u.mode = 'shot';
    u.wind = SIGHT_WIND;
    u.h = aim;
    u.aimX = target.x;
    u.aimY = target.y;
    out.aiming = true;
    return out;
  }
  function policePosts() {
    const list = (RL.CityMap && RL.CityMap.buildings) || [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b || b.legend !== 'police' || !b.door) continue;
      let x = b.door.x - 78, y = b.door.y + 42;
      if (RL.Hub && RL.Hub.blocked && RL.Hub.blocked(x, y, 10)) x = b.door.x + 78;
      if (RL.Hub && RL.Hub.blocked && RL.Hub.blocked(x, y, 10)) continue;
      out.push({ id: b.id, x: x, y: y });
    }
    return out;
  }
  function ensureBeats() {
    const posts = policePosts();
    const keep = [];
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      let u = null;
      for (let k = 0; k < beats.length; k++) if (beats[k].id === post.id) u = beats[k];
      if (!u) {
        u = {
          id: post.id, kind: 'beat', x: post.x, y: post.y, h: -Math.PI / 2,
          wind: 0, cool: 0.45, mode: null, aimX: post.x, aimY: post.y, flash: 0
        };
      } else {
        u.x = post.x; u.y = post.y;
      }
      keep.push(u);
    }
    beats = keep;
  }
  function nearPoliceDoor(x, y) {
    const list = (RL.CityMap && RL.CityMap.buildings) || [];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b || b.legend !== 'police' || !b.door) continue;
      if (Math.hypot(b.door.x - x, b.door.y - y) < SIGHT_POCKET) return true;
    }
    return false;
  }
  function updateSight(dt, p) {
    if (!p || p.downed) return;
    ensureBeats();
    const ceasefire = nearPoliceDoor(p.x, p.y);
    const blocked = (RL.Hub && RL.Hub.blocked) ? (x, y) => RL.Hub.blocked(x, y, 4) : null;
    for (let i = 0; i < beats.length; i++) {
      const u = beats[i];
      if (u.flash > 0) u.flash -= dt;
      const res = stepSight(u, { x: p.x, y: p.y, ceasefire: ceasefire || p.invuln > 0 }, dt, blocked);
      if (res.aiming && !sightTold) {
        sightTold = true;
        try { RL.UI.toast('Police have a shot. Move.', '#fff'); } catch (e) { }
      }
      if (res.hit) {
        u.flash = 0.25;
        puffs.push({ x: p.x, y: p.y - 16, life: 0.32 });
        try { RL.Audio.play('bump', 0.2); } catch (e) { }
        hurt(p, res.dmg, 'police');
      }
    }
    if (p.downed) p.downed = false;
  }

  /* One chase step. While react or a windup is running the officer does not
     move and does not damage you. A swing connects only if you are still in
     range and still in front of them when the windup ends. */
  function stepUnit(u, target, dt, stars, blocked) {
    const out = { hit: false, missed: false, dmg: 0 };
    if (!u || !target) return out;
    if (u.react > 0) {
      u.react = Math.max(0, u.react - dt);
      return out;
    }
    if (u.cool > 0) u.cool -= dt;
    const dist = Math.hypot(target.x - u.x, target.y - u.y);
    const aim = angleTo(u.x, u.y, target.x, target.y);
    if (!(u.wind > 0)) {
      const dh = angleDiff(aim, u.h || 0);
      const maxTurn = 2.2 * dt;
      u.h = (u.h || 0) + clamp(dh, -maxTurn, maxTurn);
    }
    if (u.wind > 0) {
      u.wind -= dt;
      if (u.wind <= 0) {
        u.wind = 0;
        const shot = u.mode === 'shot';
        const range = shot ? SHOT_RANGE : MELEE_RANGE;
        if (strikeHits(u, target, range)) {
          out.hit = true;
          out.dmg = shot ? shotDamage() : meleeDamage(stars);
        } else out.missed = true;
        u.cool = shot ? COOL_SHOT : COOL_MELEE;
        u.mode = null;
      }
      return out;
    }
    if (dist > 18) {
      const spd = footSpeed(stars);
      const nx = u.x + Math.cos(u.h || 0) * spd * dt;
      const ny = u.y + Math.sin(u.h || 0) * spd * dt;
      if (!blocked || !blocked(nx, u.y)) u.x = nx;
      if (!blocked || !blocked(u.x, ny)) u.y = ny;
    }
    if (!(u.cool > 0)) {
      const canShoot = !!u.shoots && starIndex(stars) >= 4 && (u.kind !== 'thug' || starIndex(stars) >= 5);
      if (dist <= MELEE_RANGE) { u.mode = 'melee'; u.wind = WINDUP_MELEE; }
      else if (canShoot && dist <= SHOT_RANGE) { u.mode = 'shot'; u.wind = WINDUP_SHOT; }
    }
    return out;
  }

  function reset(cops) {
    units = [];
    puffs = [];
    if (cops && cops.length) cops.forEach((c) => { c.onFoot = false; });
  }
  function active() { return units.length > 0; }

  function openSpot(x, y, ang, dist) {
    let px = x + Math.cos(ang) * dist, py = y + Math.sin(ang) * dist;
    const blocked = RL.Hub && RL.Hub.blocked;
    if (blocked && blocked(px, py, 10)) {
      px = x + Math.cos(ang + 1.4) * dist;
      py = y + Math.sin(ang + 1.4) * dist;
    }
    if (blocked && blocked(px, py, 10)) return null;
    if (Math.hypot(px - x, py - y) < dist * 0.85) return null;
    return { x: px, y: py };
  }

  function ensureUnits(p, cops, stars) {
    const need = countFor(stars);
    const alive = (cops || []).filter((c) => c && !c.wrecked);
    alive.forEach((c) => { c.onFoot = false; });
    const ranked = alive.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const chosen = ranked.slice(0, need);
    chosen.forEach((c) => {
      c.onFoot = true;
      c.speed = 0; c.vx = 0; c.vy = 0;
      let u = null;
      for (let i = 0; i < units.length; i++) if (units[i].cop === c) { u = units[i]; break; }
      const idx = (cops || []).indexOf(c);
      if (!u) {
        const spot = openSpot(c.x, c.y, angleTo(c.x, c.y, p.x, p.y), 22) || { x: c.x, y: c.y };
        units.push({
          cop: c, kind: 'cop', copIndex: idx, x: spot.x, y: spot.y,
          h: angleTo(spot.x, spot.y, p.x, p.y), react: reactDelay(stars),
          wind: 0, cool: 0, mode: null, shoots: idx % 2 === 0, flash: 0
        });
      } else {
        u.copIndex = idx;
        u.shoots = idx % 2 === 0;
      }
    });
    units = units.filter((u) => u.kind !== 'cop' || (u.cop && u.cop.onFoot && !u.cop.wrecked));
    const wantThugs = thugCount(stars);
    let thugs = units.filter((u) => u.kind === 'thug');
    while (thugs.length < wantThugs) {
      const ang = thugs.length * 2.2 + 0.4;
      const spot = openSpot(p.x, p.y, ang, 1400);
      if (!spot) break;
      units.push({
        kind: 'thug', x: spot.x, y: spot.y, h: angleTo(spot.x, spot.y, p.x, p.y),
        react: reactDelay(stars), wind: 0, cool: 0, mode: null, shoots: stars >= 5, flash: 0
      });
      thugs = units.filter((u) => u.kind === 'thug');
    }
    while (units.filter((u) => u.kind === 'thug').length > wantThugs) {
      const i = units.findIndex((u) => u.kind === 'thug');
      if (i < 0) break;
      units.splice(i, 1);
    }
    units.forEach((u) => {
      if (u.kind === 'thug') u.shoots = starIndex(stars) >= 5;
    });
  }

  function beds() {
    const list = [];
    const push = (b) => { if (b && b.door && (b.id === 'garage' || b.id === 'hospital')) list.push(b.door); };
    if (RL.Hub && RL.Hub.BUILDINGS) RL.Hub.BUILDINGS.forEach(push);
    if (RL.CityMap && RL.CityMap.buildings) RL.CityMap.buildings.forEach(push);
    return list;
  }
  function nearestBed(x, y) {
    const list = beds();
    if (!list.length) return { x: 15.5 * 40, y: 9.5 * 40, pad: 0 };
    let best = list[0], bestD = Infinity;
    for (let i = 0; i < list.length; i++) {
      const d = Math.hypot(list[i].x - x, list[i].y - y);
      if (d < bestD) { bestD = d; best = list[i]; }
    }
    return { x: best.x, y: best.y, pad: 28 };
  }

  function goDown(p, kind) {
    if (!p || p.downed) return null;
    p.downed = true;
    const label = downLabel(kind);
    if (!RL.Game || !RL.Game.state) {
      p.hp = 100;
      return { label: label, fee: 0 };
    }
    const s = RL.Game.state;
    const n = (s.wanted && s.wanted.stars) || 0;
    let fee = feeFor(n, s.money);
    const mod = RL.Roles && RL.Roles.fineMod ? RL.Roles.fineMod() : 1;
    if (mod !== 1) fee = Math.min(s.money, FEE_CAP, Math.round(feeFor(n, 1e15) * mod));
    if (RL.Drive && RL.Drive.dropJoyride) RL.Drive.dropJoyride({ quiet: true });
    RL.Game.addMoney(-fee);
    if (s.job && (s.job.type === 'heist' || s.job.type === 'smuggle')) s.job = null;
    if (RL.Wanted && RL.Wanted.clearHeat) RL.Wanted.clearHeat();
    if (kind === 'police' && RL.Wanted && RL.Wanted.clearBounty) RL.Wanted.clearBounty();
    const bed = nearestBed(p.x, p.y);
    let x = bed.x, y = bed.y + (bed.pad || 0);
    if (RL.Hub && RL.Hub.blocked && RL.Hub.blocked(x, y, 15)) y += 20;
    p.x = x; p.y = y; p.h = Math.PI / 2; p.speed = 0; p.inCar = true;
    p.wrecked = false; p.wreckT = 0; p.joyride = null; p.invuln = 2.4; p.hp = 100; p._pin = 0;
    if (s.hub) {
      s.hub.hp = 100; s.hub.x = p.x; s.hub.y = p.y; s.hub.h = p.h; s.hub.speed = 0;
      s.hub.inCar = true; s.hub.joyride = null;
    }
    try {
      const paid = fee > 0 ? ' — ' + RL.fmtMoney(fee) : '';
      RL.UI.toast(label + paid, label === 'Busted' ? '#7aa2ff' : '#ff8a2e');
    } catch (e) { }
    try { RL.Audio.play(label === 'Busted' ? 'error' : 'crash'); } catch (e) { }
    if (kind === 'police') p.bustLock = 6;
    try { RL.Game.save(); } catch (e) { }
    return { label: label, fee: fee };
  }

  function hurt(p, dmg, kind) {
    if (!p || p.downed || p.invuln > 0 || !(dmg > 0)) return null;
    if (!Number.isFinite(Number(p.hp))) p.hp = 100;
    p.hp = clamp(p.hp - dmg, 0, 100);
    const who = kind === 'police' ? 'police' : 'thug';
    p.lastHit = who;
    if (RL.Game && RL.Game.state && RL.Game.state.hub) RL.Game.state.hub.hp = p.hp;
    if (p.hp <= 0) return goDown(p, who);
    return null;
  }

  function update(dt, p, cops, stars) {
    if (!p) return;
    puffs = puffs.filter((f) => (f.life -= dt) > 0);
    const role = (RL.Roles && RL.Roles.current) ? RL.Roles.current() : 'neutral';
    if (sightActive(role, stars)) {
      if (units.length) {
        units = [];
        (cops || []).forEach((c) => { if (c) c.onFoot = false; });
      }
      updateSight(dt, p);
      return;
    }
    if (beats.length) beats = [];
    if (!(stars > 0) || drivingOff(p)) {
      if (drivingOff(p)) p._pin = 0;
      reset(cops);
      return;
    }
    const close = (cops || []).filter((c) => c && !c.wrecked && Math.hypot(c.x - p.x, c.y - p.y) < 30).length;
    if (!shouldDismount(stars, p, close) && units.length === 0) return;
    ensureUnits(p, cops, stars);
    const blocked = (RL.Hub && RL.Hub.blocked) ? (x, y) => RL.Hub.blocked(x, y, 10) : null;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.flash > 0) u.flash -= dt;
      const res = stepUnit(u, p, dt, stars, blocked);
      if (res.hit) {
        u.flash = 0.25;
        puffs.push({ x: p.x, y: p.y - 16, life: 0.32 });
        try { RL.Audio.play('bump', 0.2); } catch (e) { }
        hurt(p, res.dmg, u.kind === 'thug' ? 'thug' : 'police');
      }
    }
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i], b = units[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < 16) {
          const push = (16 - d) / d * 0.5;
          a.x -= dx * push; b.x += dx * push;
          a.y -= dy * push; b.y += dy * push;
        }
      }
    }
    if (p.downed) p.downed = false;
  }

  function drawStar(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 4;
      const rad = i % 2 === 0 ? r : r * 0.4;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  function draw(ctx) {
    units.concat(beats).forEach((u) => {
      const bob = Math.sin((u.x + u.y) * 0.08) * 1.4;
      ctx.save();
      ctx.translate(u.x, u.y);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(0, 12, 11, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = u.kind === 'thug' ? '#ff8a2e' : '#3a4a88';
      ctx.beginPath(); ctx.arc(0, bob, 10, 0, 7); ctx.fill();
      ctx.fillStyle = '#f2c9a0';
      ctx.beginPath(); ctx.arc(0, -11 + bob, 6, 0, 7); ctx.fill();
      if (u.kind === 'thug') {
        ctx.fillStyle = '#ff3b6b';
        ctx.fillRect(-6, -16 + bob, 12, 4);
      } else {
        ctx.fillStyle = '#1a2744';
        ctx.fillRect(-7, -18 + bob, 14, 4);
        ctx.fillStyle = '#2ee6ff';
        ctx.fillRect(-4, -21 + bob, 8, 4);
      }
      if (u.wind > 0) {
        ctx.font = 'bold 16px Trebuchet MS, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        ctx.strokeText('!', 0, -30);
        ctx.fillStyle = '#fff';
        ctx.fillText('!', 0, -30);
        ctx.strokeStyle = 'rgba(255,224,59,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (u.mode === 'shot') ctx.arc(0, 0, 28, (u.h || 0) - 0.45, (u.h || 0) + 0.45);
        else ctx.arc(Math.cos(u.h || 0) * 16, Math.sin(u.h || 0) * 16, 8, 0, 6.3);
        ctx.stroke();
      }
      ctx.restore();
    });
    puffs.forEach((f) => {
      ctx.save();
      ctx.fillStyle = '#ffe03b';
      ctx.globalAlpha = clamp(f.life / 0.32, 0, 1);
      drawStar(ctx, f.x, f.y, 10);
      ctx.restore();
    });
  }

  function debugDown(kind) {
    const p = RL.Hub && RL.Hub.player;
    if (!p || !RL.Game || !RL.Game.state) return null;
    p.downed = false;
    p.invuln = 0;
    p.hp = 5;
    const before = RL.Game.state.money;
    const who = kind || 'police';
    hurt(p, 40, who);
    p.downed = false;
    return {
      label: downLabel(who),
      fee: before - RL.Game.state.money,
      hp: p.hp,
      money: RL.Game.state.money,
      x: p.x,
      y: p.y
    };
  }

  return {
    countFor, thugCount, shouldDismount, drivingOff, reactDelay, footSpeed,
    stepUnit, stepSight, sightActive, feeFor, downLabel, normalizeHp, playerHp, FEE_CAP,
    SIGHT_RANGE, SIGHT_WIND, SIGHT_COOL, SIGHT_DMG, SIGHT_DODGE, SIGHT_POCKET,
    update, draw, reset, active, hurt, goDown, debugDown, nearestBed,
    units: () => units.slice()
  };
})();
