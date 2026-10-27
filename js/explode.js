/* explode.js - Cars at 100% damage detonate: fireball, sparks, smoke, debris,
   shake and sound. Races respawn at the last checkpoint after a time penalty.
   The city tows you to the garage (or busts you mid-chase). A setting turns it off. */
RL.Explode = (function () {
  const DELAY = 2.7, PENALTY = 5;
  let parts = [], shake = 0;

  function enabled() { return !RL.settings || RL.settings.explosions !== false; }
  function boom(x, y, opts) {
    opts = opts || {};
    if (!enabled()) return;
    const n = opts.player ? 1 : 0.65;
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 280 * n;
      parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.4, max: 0.7, size: 2 + Math.random() * 2, color: Math.random() < 0.5 ? '255,220,80' : '255,120,30' });
    }
    for (let i = 0; i < 18; i++) {
      parts.push({ kind: 'smoke', x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 16, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 50, life: 0.9 + Math.random() * 0.7, max: 1.6, size: 12 + Math.random() * 10, color: '80,80,90' });
    }
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 160;
      parts.push({ kind: 'debris', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.7 + Math.random() * 0.4, max: 1.1, size: 3 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8, color: Math.random() < 0.5 ? '#2a2a2a' : '#ff8a2e' });
    }
    parts.push({ kind: 'fire', x, y, vx: 0, vy: 0, life: 0.55, max: 0.55, size: 16, color: '255,170,40' });
    const racing = RL.Game && RL.Game.mode === 'race';
    const hear = opts.player || racing || (RL.Hub && RL.Hub.player && Math.hypot(RL.Hub.player.x - x, RL.Hub.player.y - y) < 520);
    if (hear) {
      try { RL.Audio.play('explosion'); } catch (e) { }
      if (!RL.settings || RL.settings.shake !== false) {
        const mag = opts.player ? 24 : 12;
        shake = Math.min(30, shake + mag);
        if (RL.Race && RL.Race.state) RL.Race.state.shake = Math.min(30, (RL.Race.state.shake || 0) + mag);
      }
    }
    if (opts.player && RL.Game && RL.Game.state) {
      RL.Game.state.totals.explosions = (RL.Game.state.totals.explosions || 0) + 1;
      if (RL.Game.unlockAch) RL.Game.unlockAch('sp_totaled');
    }
  }

  function respawnRace(c) {
    const R = RL.Race.state; if (!R) return;
    const tr = R.track, i = (c.cpIdx != null ? c.cpIdx : tr.cps[0]) % tr.N, p = tr.pts[i];
    const side = c.isPlayer ? 0 : ((c._slot || 1) * 16);
    c.x = p.x + p.nx * side; c.y = p.y + p.ny * side;
    c.h = Math.atan2(p.ty, p.tx); c.vx = 0; c.vy = 0; c.speed = 0;
    c.idx = i; c.damage = 28; c.wrecked = false; c.invuln = 1.6;
    c.timePen = (c.timePen || 0) + PENALTY;
    if (R.msgs) R.msgs.push({ text: (c.isPlayer ? 'ENGINE BLEW — +' : c.name + ' exploded — +') + PENALTY + 's', t: 2.4, color: '#ff8a2e' });
  }
  function inspectRace(c) {
    if (!enabled() || !c || c.wrecked || c.ghost || c.finished || c.eliminated) return;
    if (c.invuln > 0) { if (c.damage > 28) c.damage = 28; return; }
    if (c.damage >= 100) {
      c.wrecked = true; c.wreckT = DELAY; c.vx = c.vy = c.speed = 0;
      boom(c.x, c.y, { player: !!c.isPlayer });
    }
  }
  function tickRace(dt) {
    const R = RL.Race && RL.Race.state; if (!R) return;
    R.cars.forEach((c) => {
      if (c.invuln > 0) { c.invuln -= dt; if (c.damage > 28) c.damage = 28; }
      if (!c.wrecked) return;
      c.vx = c.vy = c.speed = 0;
      c.wreckT -= dt;
      if (c.wreckT <= 0) respawnRace(c);
    });
  }

  function joyride(p) {
    if (!enabled() || !p || p.wrecked || !p.joyride) return;
    const chase = RL.Wanted && RL.Wanted.stars() > 0;
    p.wrecked = true; p.wreckT = DELAY; p.speed = 0; p.wreckMode = 'joyride'; p._joyrideChase = chase;
    p.joyride = null;
    if (RL.Drive && RL.Drive.dropJoyride) RL.Drive.dropJoyride({ quiet: true });
    boom(p.x, p.y, { player: true });
    try { RL.UI.toast(chase ? 'Stolen car detonates — you\'re busted' : 'Stolen car detonates', '#ff3b6b'); } catch (e) { }
  }
  function cityCar(p) {
    if (!enabled() || !p || p.wrecked) return;
    if (p.invuln > 0) return;
    const car = RL.Game.currentCar();
    if (!car || car.damage < 100) return;
    const chase = RL.Wanted && RL.Wanted.stars() > 0;
    p.wrecked = true; p.wreckT = DELAY; p.speed = 0; p.wreckMode = chase ? 'bust' : 'tow';
    boom(p.x, p.y, { player: true });
    try { RL.UI.toast(chase ? 'Your car detonates — you\'re busted' : 'Your car detonates — tow truck en route', '#ff3b6b'); } catch (e) { }
  }
  function resolveCity(p) {
    const car = RL.Game.currentCar();
    const mode = p.wreckMode;
    p.wrecked = false; p.invuln = 2.2; p.speed = 0;
    if (mode === 'joyride') {
      const chase = p._joyrideChase;
      p._joyrideChase = false;
      const park = p.ownPark;
      if (chase && RL.Wanted) {
        RL.Wanted.bust();
        return;
      }
      const near = park && Math.hypot(p.x - park.x, p.y - park.y) < 280;
      if (near) {
        p.inCar = false; p.speed = 0;
        p.parked = { x: park.x, y: park.y, h: park.h || 0 };
        try { RL.UI.toast('You bail out. Your car is parked nearby.', '#ffe03b'); } catch (e) { }
      } else if (park) {
        p.x = park.x; p.y = park.y; p.h = park.h || 0; p.inCar = true; p.speed = 0;
        try { RL.UI.toast('Back in your own car', '#7dff5a'); } catch (e) { }
      } else {
        p.inCar = true; p.speed = 0;
        try { RL.UI.toast('Back in your own car', '#7dff5a'); } catch (e) { }
      }
      if (car) { /* garage damage is left as it was */ }
      RL.Game.save();
      return;
    }
    if (mode === 'bust' && RL.Wanted) {
      if (car) car.damage = 0;
      RL.Wanted.bust();
      return;
    }
    const fee = (car ? RL.Game.repairCost(car) : 0) + 350;
    const paid = Math.min(RL.Game.state.money, fee);
    RL.Game.addMoney(-paid);
    if (car) car.damage = 0;
    RL.Game.state.totals.tows = (RL.Game.state.totals.tows || 0) + 1;
    const g = RL.Hub.BUILDINGS.find((b) => b.id === 'garage');
    if (g) { p.x = g.door.x; p.y = g.door.y + 46; p.h = Math.PI / 2; p.inCar = true; }
    try { RL.UI.toast('Towed to the garage (' + RL.fmtMoney(paid) + ')', '#ffe03b'); } catch (e) { }
    RL.Game.save();
  }

  function update(dt) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'debris') { p.vy += 80 * dt; p.rot += p.vr * dt; }
      if (p.kind === 'smoke') { p.size += 18 * dt; p.vx *= 0.98; }
      if (p.kind === 'fire') p.size += 140 * dt;
      if (p.kind === 'spark') { p.vx *= 0.96; p.vy *= 0.96; }
    }
    parts = parts.filter((p) => p.life > 0);
    if (parts.length > 240) parts.splice(0, parts.length - 240);
    shake *= Math.pow(0.02, dt);
    if (RL.Game && RL.Game.mode === 'race') tickRace(dt);
    const pl = RL.Hub && RL.Hub.player;
    if (pl && pl.invuln > 0 && RL.Game.mode === 'hub') pl.invuln -= dt;
    if (pl && pl.wrecked && RL.Game.mode === 'hub') {
      pl.speed = 0; pl.wreckT -= dt;
      if (pl.wreckT <= 0) resolveCity(pl);
    }
  }
  function draw(ctx) {
    parts.forEach((p) => {
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'fire') {
        ctx.fillStyle = 'rgba(255,90,20,' + (a * 0.35) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 1.4, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,210,60,' + a + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.55, 0, 7); ctx.fill();
      } else if (p.kind === 'smoke') {
        ctx.fillStyle = 'rgba(' + p.color + ',' + (a * 0.35) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
      } else if (p.kind === 'debris') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0); ctx.fillStyle = p.color; ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8); ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(' + p.color + ',' + a + ')'; ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    });
  }
  function shakeOffset() {
    if (!shake) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * shake, y: (Math.random() - 0.5) * shake };
  }

  if (RL.ACHIEVEMENTS && !RL.ACHIEVEMENTS.some((a) => a.id === 'sp_totaled')) {
    RL.ACHIEVEMENTS.push({ id: 'sp_totaled', name: 'Totaled', desc: 'Explode your car.' });
  }
  return { enabled, boom, inspectRace, cityCar, joyride, update, draw, shakeOffset, DELAY, PENALTY };
})();
