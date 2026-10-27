/* interior.js — Walkable top-down rooms. Entering a door loads the room
   instead of a text menu. Talk to the person at the counter, then leave
   by the south door. Services call the same panels the doors used to open. */
RL.Interior = (function () {
  const REACH = 1.35;
  const RADIUS = 0.32;
  let state = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function data() { return window.RLInteriorData || null; }
  function active() { return !!state; }

  function enter(id) {
    const lib = data();
    if (!lib || !RL.Game) return false;
    const room = lib.resolve(id);
    if (!room || !room.npcs) return false;
    state = {
      id: id,
      room: room,
      x: room.w / 2,
      y: room.h - 1.65,
      dir: -Math.PI / 2,
      walk: 0,
      lock: 0.35,
      prompt: ''
    };
    if (RL.UI) RL.UI.closeAll();
    RL.Game.mode = 'interior';
    if (RL.UI) RL.UI.setMode('hub');
    document.body.classList.add('indoors');
    return true;
  }
  function leave(opts) {
    if (!state) return false;
    state = null;
    document.body.classList.remove('indoors');
    if (!(opts && opts.silent) && RL.Game && RL.Game.mode === 'interior') {
      RL.Game.mode = 'hub';
      if (RL.UI) RL.UI.setMode('hub');
    }
    return true;
  }
  function blocked(x, y) {
    const room = state.room, r = RADIUS;
    if (x < 0.55 + r || x > room.w - 0.55 - r) return true;
    const door = Math.abs(x - room.w / 2) < 0.78;
    if (y < 0.55 + r) return true;
    if (y > room.h - 0.42 - r && !(door && y < room.h - 0.08)) return true;
    if (y > room.h - 0.08) return true;
    for (let i = 0; i < room.props.length; i++) {
      const p = room.props[i];
      if (x > p.x - r && x < p.x + p.w + r && y > p.y - r && y < p.y + p.h + r) return true;
    }
    for (let i = 0; i < room.npcs.length; i++) {
      const n = room.npcs[i];
      if (Math.hypot(x - n.x, y - n.y) < 0.52) return true;
    }
    return false;
  }
  function nearestNpc() {
    if (!state) return null;
    let best = null, bd = REACH;
    const list = state.room.npcs;
    for (let i = 0; i < list.length; i++) {
      const d = Math.hypot(state.x - list[i].x, state.y - list[i].y);
      if (d < bd) { bd = d; best = list[i]; }
    }
    return best;
  }
  function atExit() {
    if (!state) return false;
    return state.y > state.room.h - 1.2 && Math.abs(state.x - state.room.w / 2) < 0.95;
  }
  function npcByService(service) {
    if (!state) return null;
    const list = state.room.npcs;
    for (let i = 0; i < list.length; i++) if (list[i].service === service) return list[i];
    return null;
  }
  function tillId() {
    return (state && RL.Jobs && RL.Jobs.isShop(state.id)) ? state.id : null;
  }
  function standAt(n) {
    if (!state || !n) return;
    const x = n.x;
    const y = Math.min(state.room.h - 1.7, n.y + 0.95);
    state.x = blocked(x, y) ? n.x + 0.85 : x;
    state.y = blocked(state.x, y) ? n.y : y;
    state.lock = 0;
  }
  function run(service) {
    const id = state ? state.id : service;
    const outside = { street: 1, vista: 1, warehouse: 1, bank: 1, mart: 1, chop: 1, safehouse: 1, meetup: 1, club: 1, pitmeet: 1, precinct: 1 };
    if (RL.UI) RL.UI.closeAll();
    if (outside[service]) leave();
    const panels = {
      garage: () => RL.UI.showGarage(),
      office: () => RL.UI.showOffice(),
      shop: () => RL.UI.showShop('parts', tillId() || 'shop'),
      cars: () => RL.UI.showShop('cars', tillId() || 'dealer'),
      sell: () => RL.UI.showShop('sell', tillId() || 'scrap'),
      bar: () => RL.UI.showBar(),
      training: () => RL.UI.showTraining(),
      hq: () => { if (RL.Roles) RL.Roles.showHQ(); },
      customs: () => { if (RL.Extras) RL.Extras.showCustoms(); },
      drag: () => { if (RL.Drag && RL.Drag.quickStage) RL.Drag.quickStage(); },
      booth: () => { if (RL.Drag) RL.Drag.showMenu(); },
      gears: () => { if (RL.Drag) RL.Drag.showGears(); },
      street: () => { if (RL.Jobs) RL.Jobs.startStreet(); },
      vista: () => { if (RL.Photo) RL.Photo.enter(); }
    };
    if (panels[service]) { panels[service](); return; }
    if (RL.City && RL.City.open(service)) return;
    if (service !== id && RL.City && RL.City.open(id)) return;
    if (RL.UI) RL.UI.toast('The counter is closed.');
  }
  function talk(npc) {
    if (!RL.UI || !npc) return;
    const till = tillId();
    RL.UI.open({
      title: npc.name,
      cls: 'dialog',
      render: () => '<div class="speaker" style="color:#fff">' + esc(npc.name) + (npc.title ? ' · ' + esc(npc.title) : '') + '</div>' +
        '<p style="color:#fff">' + esc(npc.line) + '</p>' +
        (till && RL.Jobs ? RL.Jobs.card(till) : '') +
        '<div class="choices">' +
        '<button class="primary" data-act="go">' + esc(npc.verb || 'Talk') + '</button>' +
        (npc.alt ? '<button data-act="alt">' + esc(npc.alt) + '</button>' : '') +
        '<button data-act="bye">Later</button></div>',
      acts: {
        go: () => run(npc.service),
        alt: () => run(npc.altService || npc.service),
        robbery: () => { if (till && RL.Jobs) RL.Jobs.rob(till); },
        bye: () => RL.UI.back()
      }
    });
  }
  function update(dt) {
    if (!state || !RL.Game || RL.Game.mode !== 'interior') return;
    state.lock = Math.max(0, state.lock - dt);
    if (RL.UI && RL.UI.isOpen()) {
      if (RL.Input.hit('pause')) RL.UI.back();
      state.prompt = '';
      return;
    }
    if (RL.Input.hit('pause')) { RL.UI.showMenu(); return; }
    let mx = 0, my = 0;
    if (RL.Input.down('left')) mx -= 1;
    if (RL.Input.down('right')) mx += 1;
    if (RL.Input.down('up')) my -= 1;
    if (RL.Input.down('down')) my += 1;
    if (mx || my) {
      const len = Math.hypot(mx, my);
      const sp = 4.6 * dt;
      const nx = state.x + (mx / len) * sp;
      const ny = state.y + (my / len) * sp;
      if (!blocked(nx, state.y)) state.x = nx;
      if (!blocked(state.x, ny)) state.y = ny;
      state.dir = Math.atan2(my, mx);
      state.walk += dt * 10;
    }
    const npc = nearestNpc();
    const exit = atExit();
    const till = npc ? tillId() : null;
    if (npc && till && RL.Jobs) state.prompt = RL.Jobs.promptLine(till, false).replace(/^E:\s*/, 'E: ' + npc.name + ' · ');
    else if (npc) state.prompt = 'E: ' + npc.name + (npc.title ? ' · ' + npc.title : '');
    else if (exit) state.prompt = 'E: exit door';
    else state.prompt = 'Walk up to someone · E to talk · south door leaves';
    if (state.lock <= 0 && npc && till && RL.Input.hit('steal')) {
      RL.Jobs.rob(till);
      return;
    }
    if (state.lock > 0 || !RL.Input.hit('action')) return;
    if (npc) talk(npc);
    else if (exit) leave();
  }
  function roundRect(ctx, x, y, w, h) {
    ctx.beginPath();
    const r = Math.min(0.15, w / 4, h / 4);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function label(ctx, text, x, y, size) {
    ctx.font = 'bold ' + size + 'px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = size * 0.18;
    ctx.strokeStyle = '#000';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x, y);
  }
  function draw(ctx) {
    if (!state) return;
    const view = RL.Game.view ? RL.Game.view(ctx) : { W: ctx.canvas.width, H: ctx.canvas.height };
    const W = view.W, H = view.H;
    const room = state.room;
    ctx.fillStyle = '#07060f';
    ctx.fillRect(0, 0, W, H);
    const scale = Math.max(36, Math.min(78, Math.min(W / (room.w + 3), H / (room.h + 3.2))));
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.translate(-state.x, -state.y);
    for (let ty = 0; ty < room.h; ty++) {
      for (let tx = 0; tx < room.w; tx++) {
        ctx.fillStyle = ((tx + ty) & 1) ? room.alt : room.floor;
        ctx.fillRect(tx, ty, 1.02, 1.02);
      }
    }
    ctx.fillStyle = room.trim;
    ctx.fillRect(0.35, 0.35, room.w - 0.7, 0.12);
    const wall = (x, y, w, h) => { ctx.fillStyle = room.wall; ctx.fillRect(x, y, w, h); ctx.fillStyle = room.trim; ctx.fillRect(x, y, w, 0.08); };
    wall(0, 0, room.w, 0.5);
    wall(0, 0, 0.5, room.h);
    wall(room.w - 0.5, 0, 0.5, room.h);
    wall(0, room.h - 0.5, room.w / 2 - 0.85, 0.5);
    wall(room.w / 2 + 0.85, room.h - 0.5, room.w / 2 - 0.85, 0.5);
    ctx.fillStyle = '#7dff5a';
    ctx.fillRect(room.w / 2 - 0.8, room.h - 0.55, 1.6, 0.5);
    label(ctx, 'EXIT', room.w / 2, room.h - 0.28, 0.28);
    for (let i = 0; i < room.props.length; i++) {
      const p = room.props[i];
      ctx.fillStyle = p.color;
      roundRect(ctx, p.x, p.y, p.w, p.h);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 0.04;
      ctx.stroke();
      if (p.label) label(ctx, p.label, p.x + p.w / 2, p.y + p.h / 2, Math.min(0.32, p.h * 0.45));
    }
    for (let i = 0; i < room.npcs.length; i++) {
      const n = room.npcs[i];
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(n.x, n.y + 0.28, 0.32, 0.12, 0, 0, 7); ctx.fill();
      ctx.fillStyle = n.color || '#fff';
      ctx.beginPath(); ctx.arc(n.x, n.y, 0.34, 0, 7); ctx.fill();
      ctx.fillStyle = '#f2c9a0';
      ctx.beginPath(); ctx.arc(n.x, n.y - 0.28, 0.16, 0, 7); ctx.fill();
      label(ctx, n.name, n.x, n.y - 0.72, 0.28);
    }
    const bob = Math.sin(state.walk) * 0.04;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(state.x, state.y + 0.28, 0.34, 0.12, 0, 0, 7); ctx.fill();
    ctx.save();
    ctx.translate(state.x, state.y + bob);
    ctx.rotate(state.dir);
    ctx.fillStyle = '#ff3b6b';
    ctx.beginPath(); ctx.arc(0, 0, 0.32, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0.12, -0.06, 0.22, 0.12);
    ctx.restore();
    label(ctx, room.name, room.w / 2, 0.85, 0.42);
    ctx.restore();
    if (state.prompt) {
      ctx.font = 'bold 16px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = Math.min(W - 24, ctx.measureText(state.prompt).width + 28);
      ctx.fillStyle = 'rgba(8,6,16,0.92)';
      ctx.fillRect((W - w) / 2, H - 54, w, 32);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect((W - w) / 2, H - 54, w, 32);
      ctx.fillStyle = '#fff';
      ctx.fillText(state.prompt, W / 2, H - 38);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  if (RL.Modes && RL.Modes.register) {
    RL.Modes.register('interior', { update: update, draw: draw, stop: function () { leave({ silent: true }); } });
  }
  if (RL.Game && RL.Game.startRace) {
    const origStart = RL.Game.startRace;
    RL.Game.startRace = function (cfg) {
      const was = active();
      const id = state ? state.id : '';
      leave({ silent: true });
      const result = origStart.call(this, cfg);
      if (was && RL.Game.mode === 'interior') enter(id);
      return result;
    };
  }
  if (RL.Game && RL.Game.toTitle) {
    const origTitle = RL.Game.toTitle;
    RL.Game.toTitle = function () {
      leave({ silent: true });
      return origTitle.call(this);
    };
  }

  return {
    enter: enter,
    leave: leave,
    update: update,
    draw: draw,
    active: active,
    roomName: function () { return state ? state.room.name : ''; },
    npcByService: npcByService,
    nearestNpc: nearestNpc,
    standAt: standAt,
    run: run
  };
})();
