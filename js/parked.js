/* parked.js - Cars left at curbs, lots, and driveways. Same tiers as traffic.
   They are not garage cars. Breaking in is quieter than a carjack, and only
   if a witness can see it. Spots stay off roads and doorways. */
RL.Parked = (function () {
  const T = 40;
  const PAINTS = {
    beater: ['#8b919a', '#6e5b4a', '#4d5a48', '#7a6a62'],
    commuter: ['#d5dbe3', '#b9c4ce', '#9aa7b5', '#cfd6cf'],
    sport: ['#ff3b6b', '#ff5a2e', '#e23bff', '#ff2e2e'],
    exotic: ['#ffe03b', '#7dfff0', '#f2f2f2', '#c86bff']
  };
  const BIAS = {
    industrial: [72, 22, 5, 1],
    downtown: [6, 18, 46, 30],
    neon: [4, 14, 40, 42],
    heights: [3, 12, 32, 53],
    harbor: [16, 34, 34, 16],
    oldtown: [36, 38, 18, 8],
    dragway: [10, 24, 46, 20]
  };
  const HIDDEN_BIAS = [6, 14, 30, 50];
  const IDS = ['beater', 'commuter', 'sport', 'exotic'];
  let cars = [];

  function map() { return RL.CityMap; }
  function cols() { const m = map(); return m ? m.cols : 96; }
  function rows() { const m = map(); return m ? m.rows : 68; }
  function road(tx, ty) {
    const m = map();
    if (!m || tx < 0 || ty < 0 || tx >= m.cols || ty >= m.rows) return false;
    return !!m.mask[ty * m.cols + tx];
  }
  function districtAt(tx, ty) {
    const list = (map() && map().districts) || [];
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (tx >= d.x && ty >= d.y && tx < d.x + d.w && ty < d.y + d.h) return d.id;
    }
    return 'downtown';
  }
  function doors() {
    const out = [];
    const hub = (RL.Hub && RL.Hub.BUILDINGS) || [];
    const city = (map() && map().buildings) || [];
    hub.concat(city).forEach((b) => { if (b.door) out.push(b.door); });
    return out;
  }
  function blocksDoor(x, y) {
    const list = doors();
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (Math.abs(x - d.x) < 50 && y > d.y - 18 && y < d.y + 86) return true;
    }
    return false;
  }
  function nearPoint(list, x, y, r) {
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const nx = n.x > 200 ? n.x : n.x * T + T / 2;
      const ny = n.y > 200 ? n.y : n.y * T + T / 2;
      if (Math.hypot(x - nx, y - ny) < r) return true;
    }
    return false;
  }
  function bodyHits(x, y, h) {
    const c = Math.cos(h), s = Math.sin(h);
    const pts = [[18, 10], [18, -10], [-16, 10], [-16, -10], [0, 0]];
    for (let i = 0; i < pts.length; i++) {
      const px = x + c * pts[i][0] - s * pts[i][1];
      const py = y + s * pts[i][0] + c * pts[i][1];
      const tx = Math.floor(px / T), ty = Math.floor(py / T);
      if (road(tx, ty)) return 'road';
      if (RL.Hub && RL.Hub.blocked(px, py, 2)) return 'solid';
    }
    if (blocksDoor(x, y)) return 'door';
    const m = map();
    if (m && (nearPoint(m.npcs, x, y, 36) || nearPoint(m.collectibles, x, y, 28))) return 'npc';
    if (Math.hypot(x - 15.5 * T, y - 9.5 * T) < 110) return 'spawn';
    return '';
  }
  function pickTier(district, hidden, n) {
    const w = hidden ? HIDDEN_BIAS : (BIAS[district] || [40, 30, 20, 10]);
    const sum = w[0] + w[1] + w[2] + w[3];
    let r = Math.abs((n * 47 + district.length * 13) % sum);
    for (let i = 0; i < 4; i++) {
      r -= w[i];
      if (r < 0) return RL.Traffic ? RL.Traffic.tier(IDS[i]) : { id: IDS[i], name: IDS[i], heat: 12, hp: 80, color: '#ccc' };
    }
    return RL.Traffic.tier('beater');
  }
  function paintOf(id, n) {
    const list = PAINTS[id] || PAINTS.commuter;
    return list[Math.abs(n) % list.length];
  }
  function crowded(x, y, list) {
    for (let i = 0; i < list.length; i++) if (Math.hypot(x - list[i].x, y - list[i].y) < 38) return true;
    return false;
  }
  function headingFor(tx, ty, perp) {
    const n = road(tx, ty - 1), s = road(tx, ty + 1), e = road(tx + 1, ty), w = road(tx - 1, ty);
    if (n || s) return perp ? (n ? -Math.PI / 2 : Math.PI / 2) : 0;
    if (e || w) return perp ? (w ? Math.PI : 0) : Math.PI / 2;
    return 0;
  }
  function nudge(tx, ty, h) {
    let ax = 0, ay = 0;
    if (road(tx, ty - 1)) ay = 1;
    else if (road(tx, ty + 1)) ay = -1;
    else if (road(tx - 1, ty)) ax = 1;
    else if (road(tx + 1, ty)) ax = -1;
    const deep = Math.abs(Math.cos(h)) < 0.5 ? 8 : 4;
    return { x: (tx + 0.5) * T + ax * deep, y: (ty + 0.5) * T + ay * deep, h: h };
  }
  function consider(out, tx, ty, spot, perp) {
    if (tx < 1 || ty < 1 || tx >= cols() - 1 || ty >= rows() - 1) return;
    if (road(tx, ty)) return;
    if (RL.Hub && RL.Hub.blocked((tx + 0.5) * T, (ty + 0.5) * T, 8)) return;
    const h = headingFor(tx, ty, perp);
    const p = nudge(tx, ty, h);
    if (bodyHits(p.x, p.y, p.h)) return;
    out.push({ x: p.x, y: p.y, h: p.h, spot: spot, district: districtAt(tx, ty), tx: tx, ty: ty, n: out.length + tx * 3 + ty });
  }
  function build() {
    const found = [];
    const W = cols(), H = rows();
    for (let ty = 1; ty < H - 1; ty++) for (let tx = 1; tx < W - 1; tx++) {
      if (road(tx, ty)) continue;
      if (RL.Hub && RL.Hub.blocked((tx + 0.5) * T, (ty + 0.5) * T, 6)) continue;
      const rn = (road(tx, ty - 1) ? 1 : 0) + (road(tx, ty + 1) ? 1 : 0) + (road(tx + 1, ty) ? 1 : 0) + (road(tx - 1, ty) ? 1 : 0);
      if (rn === 1) {
        const alongX = road(tx, ty - 1) || road(tx, ty + 1);
        const a = alongX ? road(tx - 1, ty) || !RL.Hub.blocked((tx - 0.5) * T, (ty + 0.5) * T, 4) : false;
        const b = alongX ? road(tx + 1, ty) || !RL.Hub.blocked((tx + 1.5) * T, (ty + 0.5) * T, 4) : false;
        const left = alongX ? !road(tx - 1, ty) : !road(tx, ty - 1);
        const right = alongX ? !road(tx + 1, ty) : !road(tx, ty + 1);
        const lot = left && right && (tx + ty) % 2 === 0;
        if (lot) consider(found, tx, ty, 'lot', true);
        else if ((tx * 2 + ty) % 3 === 0) consider(found, tx, ty, 'curb', false);
        void a; void b;
      } else if (rn === 0) {
        let nearRoad = false, solids = 0;
        for (let y = ty - 2; y <= ty + 2 && !nearRoad; y++) for (let x = tx - 2; x <= tx + 2; x++) if (road(x, y)) nearRoad = true;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach((d) => { if (RL.Hub && RL.Hub.blocked((tx + d[0] + 0.5) * T, (ty + d[1] + 0.5) * T, 4)) solids++; });
        if (nearRoad && solids >= 2 && (tx + ty * 3) % 4 === 0) consider(found, tx, ty, 'hidden', false);
      }
    }
    const buildings = ((RL.Hub && RL.Hub.BUILDINGS) || []).concat((map() && map().buildings) || []);
    buildings.forEach((b) => {
      if (!b.door) return;
      const cx = Math.round((b.x + b.w / 2));
      let row = b.y + b.h;
      for (let i = 0; i < 3 && road(cx, row); i++) row++;
      [[cx - 2, row], [cx + 2, row], [b.x - 1, b.y + b.h - 1], [b.x + b.w, b.y + b.h - 1], [cx - 2, b.y - 1], [cx + 2, b.y - 1]].forEach((spot) => {
        consider(found, spot[0], spot[1], 'driveway', false);
      });
    });
    const buckets = {};
    found.forEach((c) => { (buckets[c.district] = buckets[c.district] || []).push(c); });
    const picked = [];
    const want = { driveway: 2, hidden: 2, lot: 3, curb: 6 };
    ['driveway', 'hidden', 'lot', 'curb'].forEach((kind) => {
      Object.keys(buckets).forEach((id) => {
        let n = 0;
        buckets[id].forEach((c) => {
          if (c.spot !== kind || n >= want[kind]) return;
          if (crowded(c.x, c.y, picked)) return;
          picked.push(c);
          n++;
        });
      });
    });
    cars = picked.map((c, i) => {
      const tier = pickTier(c.district, c.spot === 'hidden', c.n + i * 9) || { id: 'commuter', name: 'Commuter', heat: 12, hp: 82 };
      return {
        x: c.x, y: c.y, h: c.h, homeX: c.x, homeY: c.y, homeH: c.h,
        spot: c.spot, district: c.district, tier: tier.id, name: tier.name,
        color: paintOf(tier.id, c.n), hp: tier.hp || 80, dmg: 0,
        vx: 0, vy: 0, alive: true, respawn: 0, hitCd: 0, n: c.n
      };
    });
  }
  function ensure() { if (!cars.length) build(); }
  function revive(c) {
    const p = RL.Hub && RL.Hub.player;
    if (p && Math.hypot(p.x - c.homeX, p.y - c.homeY) < 46) { c.respawn = 2; return; }
    c.alive = true;
    c.x = c.homeX; c.y = c.homeY; c.h = c.homeH;
    c.dmg = 0; c.vx = 0; c.vy = 0;
  }
  function update(dt) {
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c.alive) {
        c.respawn -= dt;
        if (c.respawn <= 0) revive(c);
        continue;
      }
      if (c.hitCd > 0) c.hitCd -= dt;
      const px = c.x, py = c.y;
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.vx *= Math.max(0, 1 - 3 * dt);
      c.vy *= Math.max(0, 1 - 3 * dt);
      if (Math.hypot(c.vx, c.vy) < 10) { c.vx = 0; c.vy = 0; }
      if (RL.Hub && RL.Hub.blocked(c.x, c.y, 12)) { c.x = px; c.y = py; c.vx = 0; c.vy = 0; }
    }
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (!a.alive || !b.alive) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      if (d >= 32) continue;
      dx /= d; dy /= d;
      const push = (32 - d) * 0.5;
      const ax = a.x, ay = a.y, bx = b.x, by = b.y;
      a.x -= dx * push; a.y -= dy * push;
      b.x += dx * push; b.y += dy * push;
      if (RL.Hub && RL.Hub.blocked(a.x, a.y, 12)) { a.x = ax; a.y = ay; }
      if (RL.Hub && RL.Hub.blocked(b.x, b.y, 12)) { b.x = bx; b.y = by; }
    }
  }
  function hitBy(p) {
    if (!p || p.inCar === false) return;
    const sp = Math.abs(p.speed || 0);
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c.alive) continue;
      const dx = c.x - p.x, dy = c.y - p.y;
      const d = Math.hypot(dx, dy) || 0.01;
      if (d > 28) continue;
      const nx = dx / d, ny = dy / d;
      c.x += nx * (28 - d);
      c.y += ny * (28 - d);
      c.vx += nx * Math.min(240, sp * 0.85);
      c.vy += ny * Math.min(240, sp * 0.85);
      if (RL.Hub && RL.Hub.blocked(c.x, c.y, 12)) { c.x -= nx * (28 - d); c.y -= ny * (28 - d); }
      if (sp > 55 && c.hitCd <= 0) {
        c.hitCd = 0.45;
        const dmg = RL.clamp((sp - 40) / 22, 3, 18);
        c.dmg += dmg * 1.4;
        if (RL.Drive && RL.Drive.applyDamage) RL.Drive.applyDamage(p, dmg);
        const destroyed = c.dmg >= c.hp;
        if (RL.Wanted) {
          RL.Wanted.report('traffic', { speed: sp, suspect: false, destroyed: destroyed });
          if (destroyed) RL.Wanted.addBounty('wreck');
          else if (sp >= 90) RL.Wanted.addBounty('ram');
        }
        if (destroyed) wreck(c);
      }
    }
  }
  function wreck(c) {
    c.alive = false;
    c.respawn = 58;
    c.vx = 0; c.vy = 0;
    if (RL.Explode && RL.Explode.boom) RL.Explode.boom(c.x, c.y, {});
    c.x = c.homeX; c.y = c.homeY; c.h = c.homeH;
  }
  function blockFoot(p) {
    if (!p || p.inCar !== false) return;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c.alive) continue;
      const dx = p.x - c.x, dy = p.y - c.y;
      const d = Math.hypot(dx, dy) || 0.001;
      if (d >= 22) continue;
      const nx = dx / d, ny = dy / d;
      const tx = c.x + nx * 22, ty = c.y + ny * 22;
      if (!RL.Hub || !RL.Hub.blocked(tx, ty, 10)) { p.x = tx; p.y = ty; }
    }
  }
  function los(ax, ay, bx, by) {
    const dist = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(2, Math.floor(dist / 24));
    for (let i = 1; i < steps; i++) {
      const x = ax + (bx - ax) * (i / steps), y = ay + (by - ay) * (i / steps);
      if (RL.Hub && RL.Hub.blocked(x, y, 4)) return false;
    }
    return true;
  }
  function seen(c) {
    if (!c) return false;
    const r = c.spot === 'hidden' ? 84 : 150;
    const m = map();
    const npcs = (m && m.npcs) || [];
    for (let i = 0; i < npcs.length; i++) {
      if (Math.hypot(npcs[i].x - c.x, npcs[i].y - c.y) < r && los(c.x, c.y, npcs[i].x, npcs[i].y)) return true;
    }
    const traffic = RL.Drive && RL.Drive.traffic ? RL.Drive.traffic() : [];
    const tr = c.spot === 'hidden' ? 72 : 120;
    for (let i = 0; i < traffic.length; i++) {
      const t = traffic[i];
      if (!t || t.wrecked) continue;
      if (Math.hypot(t.x - c.x, t.y - c.y) < tr) return true;
    }
    const cops = RL.Wanted && RL.Wanted.cops ? RL.Wanted.cops() : [];
    for (let i = 0; i < cops.length; i++) {
      if (Math.hypot(cops[i].x - c.x, cops[i].y - c.y) < 220 && los(c.x, c.y, cops[i].x, cops[i].y)) return true;
    }
    return false;
  }
  function breakHeat(tier) {
    const full = (tier && tier.heat) || 12;
    return Math.max(2, Math.round(full * 0.35));
  }
  function nearest(x, y, maxDist) {
    let best = null, bestD = maxDist;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c.alive) continue;
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best ? { car: best, d: bestD } : null;
  }
  function remove(c) {
    c.alive = false;
    c.respawn = 50 + (Math.abs(c.n) % 18);
    c.vx = 0; c.vy = 0;
    c.x = c.homeX; c.y = c.homeY; c.h = c.homeH; c.dmg = 0;
  }
  function draw(ctx) {
    cars.forEach((c) => {
      if (c.spot === 'lot' || c.spot === 'driveway') {
        ctx.save();
        ctx.translate(c.homeX, c.homeY);
        ctx.rotate(c.homeH || 0);
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-18, -12, 36, 24);
        ctx.restore();
      }
      if (!c.alive || !RL.Drive || !RL.Drive.drawCar) return;
      RL.Drive.drawCar(ctx, c, {});
    });
  }
  function audit() {
    const notes = [];
    const kinds = { curb: 0, lot: 0, driveway: 0, hidden: 0 };
    const dist = {};
    cars.forEach((c) => {
      kinds[c.spot] = (kinds[c.spot] || 0) + 1;
      dist[c.district] = (dist[c.district] || 0) + 1;
      const why = bodyHits(c.homeX, c.homeY, c.homeH);
      if (why) notes.push(c.spot + ' ' + c.district + ' ' + why + ' @' + Math.round(c.homeX) + ',' + Math.round(c.homeY));
    });
    ['curb', 'lot', 'driveway', 'hidden'].forEach((k) => { if (!kinds[k]) notes.push('no ' + k); });
    const districts = (map() && map().districts) || [];
    districts.forEach((d) => { if (!dist[d.id]) notes.push('empty ' + d.id); });
    if (cars.length < 24) notes.push('count ' + cars.length);
    return notes;
  }
  return { ensure, update, draw, hitBy, blockFoot, seen, breakHeat, nearest, remove, cars: () => cars, audit, build };
})();
