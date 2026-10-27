/* hub.js - The top-down city hub. Drive the current car on the road network
   (arrows/WASD or the touch pad). Park at a glowing door and press E / Enter / ACT
   to get out and open the building. On foot, the same keys walk. */
RL.Hub = (function () {
  const T = 40;
  const COLS = (RL.CityMap && RL.CityMap.cols) || 32;
  const ROWS = (RL.CityMap && RL.CityMap.rows) || 24;
  const BUILDINGS = [
    { id: 'garage', name: 'GARAGE', x: 2, y: 2, w: 7, h: 5, color: '#2ee6ff', roof: '#24304a' },
    { id: 'office', name: 'RACE OFFICE', x: 12, y: 2, w: 8, h: 5, color: '#ffe03b', roof: '#3a2f4a' },
    { id: 'shop', name: 'SHOP', x: 23, y: 2, w: 7, h: 5, color: '#7dff5a', roof: '#2a3f35' },
    { id: 'bar', name: 'NEON BAR', x: 2, y: 14, w: 7, h: 5, color: '#ff2ef0', roof: '#40203f' },
    { id: 'training', name: 'TRAINING TRACK', x: 21, y: 13, w: 9, h: 7, color: '#ff8a2e', roof: null }
  ];
  const SOLIDS = [{ x: 14, y: 14, w: 3, h: 3 }]; // fountain
  let bg = null, P = { x: 0, y: 0, dir: 0, walk: 0, h: 0, speed: 0, inCar: true }, cam = { x: 0, y: 0 }, near = null, peds = [];

  BUILDINGS.forEach((b) => { b.door = { x: (b.x + b.w / 2) * T, y: (b.y + b.h) * T + 4 }; });

  function worldSolids() {
    return BUILDINGS.concat(SOLIDS).concat((RL.CityMap && RL.CityMap.buildings) || []).concat((RL.CityMap && RL.CityMap.solids) || []);
  }
  function blocked(x, y, rad) {
    const r = rad == null ? 12 : rad;
    if (x - r < T || y - r < T || x + r > (COLS - 1) * T || y + r > (ROWS - 1) * T) return true;
    const list = worldSolids();
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (x + r > b.x * T && x - r < (b.x + b.w) * T && y + r > b.y * T && y - r < (b.y + b.h) * T) return true;
    }
    return false;
  }
  function allBuildings() { return BUILDINGS.concat((RL.CityMap && RL.CityMap.buildings) || []); }

  /* Pre-render static city ground, roads, buildings */
  function build() {
    bg = document.createElement('canvas'); bg.width = COLS * T; bg.height = ROWS * T;
    const g = bg.getContext('2d');
    g.fillStyle = '#1b2a22'; g.fillRect(0, 0, bg.width, bg.height);
    const dw = 32 * T, dh = 24 * T;
    for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.5 ? '#21342a' : '#17241d'; g.fillRect(Math.random() * dw, Math.random() * dh, 4, 4); }
    const road = (x, y, w, h) => { g.fillStyle = '#5a6070'; g.fillRect(x * T - 6, y * T - 6, w * T + 12, h * T + 12); g.fillStyle = '#2c303b'; g.fillRect(x * T, y * T, w * T, h * T); };
    road(1, 8, 30, 3); road(1, 20, 30, 2); road(10, 1, 2, 22); road(20, 8, 2, 13);
    g.strokeStyle = '#ffe03b'; g.setLineDash([16, 16]); g.lineWidth = 3;
    g.beginPath(); g.moveTo(T, 9.5 * T); g.lineTo(31 * T, 9.5 * T); g.moveTo(11 * T, T); g.lineTo(11 * T, 23 * T); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#4a5160'; g.fillRect(12.5 * T, 12.5 * T, 6 * T, 6 * T);
    g.fillStyle = '#2b3b55'; g.beginPath(); g.arc(15.5 * T, 15.5 * T, 1.5 * T, 0, 7); g.fill();
    g.fillStyle = '#2ee6ff'; g.globalAlpha = 0.6; g.beginPath(); g.arc(15.5 * T, 15.5 * T, 1.1 * T, 0, 7); g.fill(); g.globalAlpha = 1;
    for (let i = 0; i < 40; i++) {
      const x = (1.5 + Math.random() * 29) * T, y = (Math.random() < 0.5 ? 0.6 : 22.6) * T;
      g.fillStyle = '#0f3a24'; g.beginPath(); g.arc(x, y, 18, 0, 7); g.fill(); g.fillStyle = '#1e6a3d'; g.beginPath(); g.arc(x - 4, y - 4, 10, 0, 7); g.fill();
    }
    for (const b of BUILDINGS) {
      const x = b.x * T, y = b.y * T, w = b.w * T, h = b.h * T;
      if (b.id === 'training') {
        g.fillStyle = '#2f6b3a'; g.fillRect(x, y, w, h);
        g.strokeStyle = '#3a3f4b'; g.lineWidth = 34; g.strokeRect(x + 40, y + 40, w - 80, h - 80);
        g.strokeStyle = '#fff'; g.lineWidth = 2; g.setLineDash([10, 10]); g.strokeRect(x + 40, y + 40, w - 80, h - 80); g.setLineDash([]);
        g.strokeStyle = b.color; g.lineWidth = 4; g.strokeRect(x, y, w, h);
      } else {
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + 10, y + 10, w, h);
        g.fillStyle = b.roof; g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < w; i += 20) g.fillRect(x + i, y, 10, h);
        g.strokeStyle = b.color; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
      }
      g.fillStyle = '#111'; g.fillRect(b.door.x - 22, b.door.y - 14, 44, 10);
      g.fillStyle = b.color; g.fillRect(b.door.x - 22, b.door.y - 6, 44, 4);
    }
    if (RL.CityMap && RL.CityMap.paint) RL.CityMap.paint(g);
  }
  function enter() {
    if (!bg) build();
    const s = RL.Game.state;
    P.x = s.hub.x; P.y = s.hub.y;
    P.h = s.hub.h || 0; P.speed = s.hub.speed || 0;
    P.inCar = s.hub.inCar !== false;
    if (blocked(P.x, P.y, P.inCar ? 15 : 12)) { P.x = 15.5 * T; P.y = 9.5 * T; P.h = 0; P.speed = 0; }
    cam.x = P.x; cam.y = P.y;
    if (!peds.length) {
      for (let i = 0; i < 7; i++) peds.push({ x: (3 + i * 3.5) * T, y: (i % 2 ? 7.35 : 11.55) * T, vx: (i % 2 ? -1 : 1) * 28, color: RL.pick(RL.PAINT_COLORS) });
    }
    if (RL.Drive) RL.Drive.enter();
    if (RL.City) RL.City.syncFromSave();
  }
  function update(dt) {
    if (RL.Summon) RL.Summon.poll(dt);
    if (RL.Phone) RL.Phone.poll(dt);
    if (RL.Photo && RL.Photo.active) { RL.Photo.update(dt); return; }
    if (RL.UI.isOpen()) { if (RL.Input.hit('pause')) RL.UI.back(); return; }
    if (RL.Input.hit('pause')) { if (RL.City && RL.City.closeMap()) return; RL.UI.showMenu(); return; }
    if (RL.City && RL.City.mapOpen()) return;
    if (RL.Drive) RL.Drive.update(dt);
    else {
      const I = RL.Input, sp = 190;
      let dx = (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0), dy = (I.down('down') ? 1 : 0) - (I.down('up') ? 1 : 0);
      if (dx && dy) { dx *= 0.707; dy *= 0.707; }
      if (dx || dy) {
        P.dir = Math.atan2(dy, dx); P.walk += dt * 10;
        const nx = P.x + dx * sp * dt, ny = P.y + dy * sp * dt;
        if (!blocked(nx, P.y, 12)) P.x = nx;
        if (!blocked(P.x, ny, 12)) P.y = ny;
      }
      const s = RL.Game.state; s.hub.x = P.x; s.hub.y = P.y;
    }
    for (const p of peds) { p.x += p.vx * dt; if (p.x < 2 * T || p.x > 30 * T) p.vx *= -1; }
    if (RL.Jobs) RL.Jobs.update(dt);
    if (RL.Wanted) RL.Wanted.update(dt, P);
    if (RL.Roles) RL.Roles.update(dt);
    if (RL.City) RL.City.tick(dt);
    if (RL.Explode) RL.Explode.update(dt);
    near = RL.Drive ? RL.Drive.nearDoor(P.x, P.y) : null;
    if (!RL.Drive) {
      near = null;
      for (const b of BUILDINGS) if (Math.hypot(P.x - b.door.x, P.y - (b.door.y + 16)) < 52) near = b;
    }
    if (!P.wrecked && (RL.Input.hit('enter') || RL.Input.hit('steal')) && RL.Drive && RL.Drive.tryEnter) RL.Drive.tryEnter();
    if (!P.wrecked && RL.Input.hit('action')) {
      const slow = Math.abs(P.speed || 0) < 90;
      if (RL.Jobs && RL.Jobs.tryAction()) { /* delivery / bust pin */ }
      else if (near && slow) {
        if (RL.Drive) RL.Drive.tryAction(near);
        openBuilding(near.id);
      } else if (RL.City && RL.City.tryAction()) { /* npc or landmark */ }
      else if (RL.Drive && RL.Drive.tryEnter && RL.Drive.tryEnter()) { /* own car or a nearby one */ }
      else if (RL.Drive) RL.Drive.tryAction(null);
    }
    const lead = P.inCar === false ? 0 : 80;
    const gx = P.x + Math.cos(P.h || 0) * lead, gy = P.y + Math.sin(P.h || 0) * lead;
    cam.x += (gx - cam.x) * Math.min(1, 6 * dt);
    cam.y += (gy - cam.y) * Math.min(1, 6 * dt);
  }
  function openBuilding(id) {
    RL.Audio.play('confirm');
    const map = { garage: RL.UI.showGarage, office: RL.UI.showOffice, shop: RL.UI.showShop, bar: RL.UI.showBar, training: RL.UI.showTraining };
    if (map[id]) map[id]();
    else if (RL.City) RL.City.open(id);
  }
  function hasNews(id) {
    const G = RL.Game, s = G.state;
    if (id === 'office') return G.bossUnlocked(s.league) && !G.leagueProgress(s.league).boss;
    if (id === 'bar') return RL.barHasNews ? RL.barHasNews(s) : false;
    if (id === 'garage') return s.statPoints > 0 || s.skillPoints > 0 || G.currentCar().damage > 30;
    if (RL.City && RL.City.hasNews(id)) return true;
    return false;
  }
  function drawWalker(ctx) {
    const bob = Math.sin(P.walk || 0) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(P.x, P.y + 12, 12, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff3b6b'; ctx.beginPath(); ctx.arc(P.x, P.y + bob, 11, 0, 7); ctx.fill();
    ctx.fillStyle = '#f2c9a0'; ctx.beginPath(); ctx.arc(P.x, P.y - 12 + bob, 7, 0, 7); ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillRect(P.x - 7, P.y - 20 + bob, 14, 4);
    ctx.fillStyle = '#ffe03b'; ctx.beginPath(); ctx.arc(P.x + Math.cos(P.dir || 0) * 9, P.y + Math.sin(P.dir || 0) * 9 + bob, 3, 0, 7); ctx.fill();
  }
  function draw(ctx) {
    const view = RL.Game.view(ctx), W = view.W, H = view.H, t = performance.now() / 1000;
    const photo = RL.Photo && RL.Photo.override ? RL.Photo.override() : null;
    let zoom = RL.clamp(Math.min(W, H) / 640, 0.6, 1.5);
    if (photo && photo.zoom) zoom *= photo.zoom;
    const sh = RL.Explode ? RL.Explode.shakeOffset() : { x: 0, y: 0 };
    ctx.fillStyle = '#0b0618'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2 + sh.x, H / 2 + sh.y); ctx.scale(zoom, zoom);
    const focusX = photo ? photo.x : cam.x, focusY = photo ? photo.y : cam.y;
    const cx = RL.clamp(focusX, W / 2 / zoom, COLS * T - W / 2 / zoom), cy = RL.clamp(focusY, H / 2 / zoom, ROWS * T - H / 2 / zoom);
    const ox = COLS * T * zoom < W ? COLS * T / 2 : cx, oy = ROWS * T * zoom < H ? ROWS * T / 2 : cy;
    ctx.translate(-Math.round(ox * zoom) / zoom, -Math.round(oy * zoom) / zoom);
    if (bg) ctx.drawImage(bg, 0, 0);
    if (RL.City) RL.City.drawWorld(ctx, t);
    if (RL.Drive) {
      ctx.save(); ctx.strokeStyle = 'rgba(215,222,234,0.55)'; ctx.lineWidth = 2;
      RL.Drive.stalls().forEach((s) => ctx.strokeRect(s.x - 26, s.y - 18, 52, 36));
      ctx.restore();
      RL.Drive.draw(ctx);
    }
    if (RL.Wanted) RL.Wanted.draw(ctx);
    if (RL.Jobs) RL.Jobs.draw(ctx);
    if (RL.Roles) RL.Roles.draw(ctx);
    if (RL.Explode) RL.Explode.draw(ctx);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of allBuildings()) {
      if (b.scenic) continue;
      const bx = (b.x + b.w / 2) * T, by = (b.y + b.h / 2) * T;
      if (Math.abs(bx - ox) > (W / zoom) * 0.62 || Math.abs(by - oy) > (H / zoom) * 0.62) continue;
      const flick = 0.75 + 0.25 * Math.sin(t * 3 + b.x);
      let size = 22;
      ctx.font = 'bold ' + size + 'px Trebuchet MS, sans-serif';
      const maxW = b.w * T - 10;
      while (size > 10 && ctx.measureText(b.name).width > maxW) { size -= 1; ctx.font = 'bold ' + size + 'px Trebuchet MS, sans-serif'; }
      ctx.shadowColor = b.color; ctx.shadowBlur = 8 * flick; ctx.fillStyle = b.color;
      ctx.fillText(b.name, bx, by);
      ctx.shadowBlur = 0;
      if (hasNews(b.id)) {
        const by = b.y * T - 10 + Math.sin(t * 5) * 5;
        ctx.fillStyle = '#ffe03b'; ctx.beginPath(); ctx.arc((b.x + b.w / 2) * T, by, 13, 0, 7); ctx.fill();
        ctx.fillStyle = '#111'; ctx.font = 'bold 18px sans-serif'; ctx.fillText('!', (b.x + b.w / 2) * T, by + 1);
      }
    }
    for (const p of peds) { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, 7); ctx.fill(); ctx.fillStyle = '#f2c9a0'; ctx.beginPath(); ctx.arc(p.x, p.y - 9, 5, 0, 7); ctx.fill(); }
    const drewCar = RL.Drive && RL.Drive.drawPlayerCar(ctx);
    if (!drewCar && P.inCar === false) drawWalker(ctx);
    if (!photo && RL.Drive && RL.Drive.drawCue) RL.Drive.drawCue(ctx);
    if (near && !photo) {
      ctx.font = 'bold 15px sans-serif'; const txt = 'E / Enter: ' + near.name;
      const w = ctx.measureText(txt).width + 20;
      ctx.fillStyle = 'rgba(8,6,24,0.85)'; ctx.fillRect(P.x - w / 2, P.y - 56, w, 26);
      ctx.strokeStyle = near.color; ctx.strokeRect(P.x - w / 2, P.y - 56, w, 26);
      ctx.fillStyle = '#fff'; ctx.fillText(txt, P.x, P.y - 43);
    } else if (RL.City && !photo) RL.City.drawPrompt(ctx, P);
    ctx.restore();
    const px = W / 2 + sh.x + (P.x - ox) * zoom, py = H / 2 + sh.y + (P.y - oy) * zoom;
    if (RL.City) RL.City.drawOverlay(ctx, W, H, { px: px, py: py });
    else {
      const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      grd.addColorStop(0, 'rgba(10,0,40,0)'); grd.addColorStop(1, 'rgba(10,0,40,0.55)');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    }
    if (RL.Wanted && !(RL.City && RL.City.mapOpen && RL.City.mapOpen())) RL.Wanted.drawHud(ctx, W, H);
    if (RL.Photo) RL.Photo.draw(ctx, W, H);
  }
  return { enter, update, draw, openBuilding, blocked, get near() { return near; }, player: P, BUILDINGS, T, get cols() { return COLS; }, get rows() { return ROWS; } };
})();
