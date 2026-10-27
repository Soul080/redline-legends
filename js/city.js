/* city.js - Hub world layer: day/night clock, districts, hidden tags, street NPCs,
   minimap and the prompts that sit on top of driving. */
RL.City = (function () {
  let clock = 10 * 60, prompt = null;

  function dark() {
    const h = ((clock % 1440) + 1440) % 1440 / 60;
    if (h >= 20 || h < 5) return 0.62;
    if (h >= 17) return 0.28 + (h - 17) / 3 * 0.3;
    if (h < 7) return 0.45 * (1 - (h - 5) / 2);
    return 0;
  }
  function phaseName() {
    const h = ((clock % 1440) + 1440) % 1440 / 60;
    if (h >= 20 || h < 5) return 'Night';
    if (h >= 17) return 'Dusk';
    if (h < 7) return 'Dawn';
    return 'Day';
  }
  function fmt() {
    const m = Math.floor(((clock % 1440) + 1440) % 1440);
    const hh = Math.floor(m / 60), mm = m % 60;
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }
  function setClock(mins) { clock = mins; const s = RL.Game.state; if (s) s.clock = mins; }
  function syncFromSave() { const s = RL.Game.state; if (s && s.clock != null) clock = s.clock; }

  function districtAt(x, y) {
    const tx = x / 40, ty = y / 40, list = RL.CityMap.districts;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (tx >= d.x && ty >= d.y && tx < d.x + d.w && ty < d.y + d.h) return d;
    }
    return null;
  }
  function tick(dt) {
    bindUi();
    const s = RL.Game.state, p = RL.Hub.player; if (!s || !p) return;
    if (RL.UI.isOpen() || (RL.Photo && RL.Photo.active)) return;
    clock += dt * 10; if (clock >= 1440) clock -= 1440; s.clock = clock;
    const d = districtAt(p.x, p.y);
    if (d) {
      if (!s.visited) s.visited = {};
      if (!s.visited[d.id]) {
        s.visited[d.id] = true;
        RL.UI.toast('Entered ' + d.name + (d.purpose ? ' · ' + d.purpose : ''), d.color);
        if (RL.Roles) RL.Roles.addXp('neutral', 8);
        if (RL.Daily) RL.Daily.progress('district', 1);
        RL.Game.event('district', { id: d.id, n: Object.keys(s.visited).length });
        if (Object.keys(s.visited).length >= RL.CityMap.districts.length && RL.Game.unlockAch) RL.Game.unlockAch('sp_tourist');
      }
    }
    if (!s.found) s.found = {};
    RL.CityMap.collectibles.forEach((c) => {
      if (s.found[c.id]) return;
      if (Math.hypot(p.x - c.x, p.y - c.y) < 28) {
        s.found[c.id] = true;
        s.totals.tags = Object.keys(s.found).length;
        RL.Game.addMoney(120); RL.Game.addXP(20);
        RL.UI.toast('Neon tag ' + s.totals.tags + '/' + RL.CityMap.collectibles.length, '#c86bff');
        if (RL.Daily) RL.Daily.progress('tag', 1);
        RL.Game.event('tag', { n: s.totals.tags });
        if (s.totals.tags >= RL.CityMap.collectibles.length && RL.Game.unlockAch) RL.Game.unlockAch('sp_tags');
        RL.Game.save();
      }
    });
    const el = document.getElementById('hud-clock');
    if (el) el.textContent = fmt() + ' ' + phaseName();
  }
  function nearestNpc() {
    const p = RL.Hub.player; if (!p) return null;
    let best = null, bd = 78;
    RL.CityMap.npcs.forEach((n) => { const d = Math.hypot(p.x - n.x, p.y - n.y); if (d < bd) { bd = d; best = n; } });
    return best;
  }
  function nearestMark() {
    const p = RL.Hub.player; if (!p) return null;
    let best = null, bd = 74;
    RL.CityMap.landmarks.forEach((n) => { const d = Math.hypot(p.x - n.x, p.y - n.y); if (d < bd) { bd = d; best = n; } });
    return best;
  }
  function tryAction() {
    const npc = nearestNpc();
    if (npc && Math.abs(RL.Hub.player.speed || 0) < 110) { talk(npc); return true; }
    const mk = nearestMark();
    if (mk && Math.abs(RL.Hub.player.speed || 0) < 80) {
      RL.UI.open({ title: mk.name, render: () => '<p>' + mk.text + '</p><div class="row"><button data-act="back">Close</button></div>', acts: {} });
      return true;
    }
    return false;
  }
  function talk(npc) {
    const lines = npc.lines.join(' ');
    RL.UI.open({
      title: npc.name, cls: 'dialog',
      render: () => '<div class="speaker" style="color:' + npc.color + '">' + npc.name + '</div><p>' + lines + '</p><div class="choices">' +
        '<button data-act="work">▸ What\'s the job?</button><button data-act="bye">▸ Later</button></div>',
      acts: {
        bye: () => RL.UI.back(),
        work: () => {
          const map = { rex: 'sp_drag', patch: 'sp_tags', jo: 'sp_photo', kane: 'sp_heat', mira: 'sp_street', vick: 'sp_heist' };
          if (npc.id === 'mira' && RL.Jobs) { RL.Jobs.startStreet(); return; }
          if (npc.id === 'vick' && RL.Roles.current() !== 'criminal') { RL.UI.toast('Vick wants a criminal, not a tourist.', '#ff8a2e'); return; }
          if (map[npc.id]) RL.Game.startQuest(map[npc.id]);
          RL.UI.back();
        }
      }
    });
  }
  function open(id) {
    if (id === 'customs' && RL.Extras) { RL.Extras.showCustoms(); return true; }
    if (id === 'hq' && RL.Roles) { RL.Roles.showHQ(); return true; }
    if (id === 'dragway' && RL.Drag) { RL.Drag.showMenu(); return true; }
    if ((id === 'bank' || id === 'mart') && RL.Jobs) { RL.Jobs.showRobbery(id); return true; }
    if (id === 'warehouse' && RL.Jobs) { RL.Jobs.showSmuggle(); return true; }
    if (id === 'vista' && RL.Photo) { RL.Photo.enter(); return true; }
    if (id === 'hospital') {
      const hp = RL.Foot ? Math.round(RL.Foot.playerHp()) : 100;
      RL.UI.open({ title: 'City Hospital', render: () => '<p>A bright cartoon clinic. Bandages, stickers, and a lollipop. $40 tops your HP back up.</p><p class="small">HP ' + hp + '</p><div class="row"><button class="primary" data-act="heal"' + (RL.Game.state.money < 40 || hp >= 100 ? ' disabled' : '') + '>Heal ($40)</button></div>', acts: { heal: () => {
        const s = RL.Game.state;
        const cur = RL.Foot ? RL.Foot.playerHp() : 100;
        if (s.money < 40 || cur >= 100) return;
        RL.Game.addMoney(-40);
        if (RL.Hub && RL.Hub.player) RL.Hub.player.hp = 100;
        if (s.hub) s.hub.hp = 100;
        RL.Game.save();
        RL.UI.toast('All patched up', '#7dff5a');
        RL.UI.back();
      } } });
      return true;
    }
    if (id === 'gas') {
      RL.UI.open({ title: '⛽ Nitro Fuel', render: () => '<p>High-test and a hose. Patch 15% damage for $120.</p><div class="row"><button data-act="fix">Patch</button></div>', acts: { fix: () => {
        const car = RL.Game.currentCar(); if (RL.Game.state.money < 120 || car.damage < 1) return;
        RL.Game.addMoney(-120); car.damage = RL.clamp(car.damage - 15, 0, 100); RL.Game.save(); RL.UI.toast('Patched', '#7dff5a');
      } } });
      return true;
    }
    if (id === 'dealer') { RL.UI.showShop('cars'); return true; }
    if (id === 'chandler') { RL.UI.showShop('parts'); return true; }
    if (id === 'scrap') { RL.UI.showShop('sell'); return true; }
    if (id === 'precinct') { showPrecinct(); return true; }
    if (id === 'chop' || id === 'safehouse') { showHideout(id); return true; }
    if (id === 'clinic') { showClinic(); return true; }
    if (id === 'diner') { showDiner(); return true; }
    if (id === 'meetup' || id === 'club' || id === 'pitmeet') { showMeetup(id); return true; }
    if (id === 'lockup') { showLockup(); return true; }
    if (id === 'hall') { showHall(); return true; }
    if (id === 'impound') { showImpound(); return true; }
    return false;
  }
  function showPrecinct() {
    const police = RL.Roles && RL.Roles.current() === 'police';
    RL.UI.open({
      title: '🚓 4th Precinct',
      render: () => police
        ? '<p>Sergeant\'s desk. A getaway is eastbound on King Blvd. Box them in and the city pays the collar. This is where police-role calls start. Role HQ, west of here, is where the badge is issued.</p><div class="row"><button class="primary" data-act="go">Take the call</button></div>'
        : '<p>Dispatch is for badges. Role HQ swears you in. Until then the desk will take a stolen-car report and nothing else.</p>',
      acts: { go: () => { if (RL.Jobs) RL.Jobs.startDispatch(); } }
    });
  }
  function showHideout(id) {
    const criminal = RL.Roles && RL.Roles.current() === 'criminal';
    const title = id === 'chop' ? '🔧 Chop Shop' : '🚪 Safehouse';
    RL.UI.open({
      title: title,
      render: () => criminal
        ? '<p>' + (id === 'chop'
          ? 'A quiet bay and a car that will not be missed. Strip it and run. Heat spikes. Harbor Co. still launders a bigger score.'
          : 'Blackout curtains and a back door onto the avenue. The job is the same as the mart: take it and disappear. Stars do not care about curtains.') + '</p><div class="row"><button class="primary" data-act="go">Take the job</button></div>'
        : '<p>The shutter stays down unless Role HQ lists you as criminal. Vick at the harbor will not talk to a tourist either.</p>',
      acts: { go: () => { if (RL.Jobs) RL.Jobs.startHeist(id === 'chop' ? 'chop' : 'mart'); } }
    });
  }
  function showClinic() {
    RL.UI.open({
      title: '✚ Redline General',
      render: () => {
        const car = RL.Game.currentCar();
        const cost = RL.Game.repairCost(car);
        return '<p>Uptown wrecks get hauled here. It is the same bill as the downtown garage: this desk just puts the car back on its wheels. If you eat a wall in the Heights, this is the door.</p>' +
          '<p class="small">Damage ' + Math.round(car.damage) + '% · ' + (cost > 0 ? RL.fmtMoney(cost) : 'nothing to fix') + '</p>' +
          '<div class="row"><button class="primary" data-act="fix"' + (car.damage < 1 || RL.Game.state.money < cost ? ' disabled' : '') + '>Full repair</button></div>';
      },
      acts: { fix: () => {
        const paid = RL.Game.repair();
        if (paid > 0) { RL.UI.toast('Rolled out repaired', '#7dff5a'); RL.Game.save(); }
        else RL.Audio.play('error');
      } }
    });
  }
  function showDiner() {
    RL.UI.open({
      title: '☕ Mile Diner',
      render: () => {
        const car = RL.Game.currentCar();
        const pts = Math.min(10, car.damage || 0);
        const full = RL.Game.repairCost(car);
        const cost = pts > 0 ? Math.max(25, Math.round(full * (pts / Math.max(1, car.damage)))) : 0;
        return '<p>Coffee, a rumor, and a wrench that is not a garage. They will knock ' + (pts || 0) + ' points of damage off at the same rate the garage charges.</p>' +
          '<p class="small">The arch crew still swears the Phantom ate here the night the clock stopped.</p>' +
          '<div class="row"><button data-act="fix"' + (pts < 1 || RL.Game.state.money < cost ? ' disabled' : '') + '>Patch (' + RL.fmtMoney(cost) + ')</button></div>';
      },
      acts: { fix: () => {
        const car = RL.Game.currentCar();
        const pts = Math.min(10, car.damage || 0);
        const full = RL.Game.repairCost(car);
        const cost = pts > 0 ? Math.max(25, Math.round(full * (pts / Math.max(1, car.damage)))) : 0;
        if (pts < 1 || RL.Game.state.money < cost) { RL.Audio.play('error'); return; }
        RL.Game.addMoney(-cost);
        car.damage = RL.clamp(car.damage - pts, 0, 100);
        RL.Game.save();
        RL.UI.toast('Diner patch', '#7dff5a');
      } }
    });
  }
  function showMeetup(id) {
    const titles = { meetup: '🏁 Neon Meetup', club: '🎧 Club Voltage', pitmeet: '🔧 Pit Lane' };
    const blurb = id === 'pitmeet'
      ? 'The strip is the long building south of here. Gear ratios live in that booth. This lot is the street meet when the Christmas tree is booked.'
      : 'Mira\'s people line cars under the arch. Cops listen. Win the gates and the purse is real.';
    RL.UI.open({
      title: titles[id] || 'Meetup',
      render: () => '<p>' + blurb + '</p><div class="row"><button class="primary" data-act="go">Line up</button></div>',
      acts: { go: () => { if (RL.Jobs) RL.Jobs.startStreet(); } }
    });
  }
  function showLockup() {
    const s = RL.Game.state;
    const taken = s.flags && s.flags.lockupStash;
    RL.UI.open({
      title: '🔐 Old Lockup',
      render: () => taken
        ? '<p>The floor cache is empty. The Phantom\'s crew cleaned the rest out years ago. City Hall still will not say their names.</p>'
        : '<p>A cash box under the boards. One time. The note inside just says the clock stays at 11:07 until someone earns the spiral.</p><div class="row"><button class="primary" data-act="take">Take the box</button></div>',
      acts: { take: () => {
        const st = RL.Game.state;
        if (!st.flags || typeof st.flags !== 'object') st.flags = {};
        if (st.flags.lockupStash) return;
        st.flags.lockupStash = true;
        RL.Game.addMoney(400);
        RL.Game.save();
        RL.UI.toast('Stash +' + RL.fmtMoney(400), '#7dff5a');
        RL.UI.back();
      } }
    });
  }
  function showHall() {
    const rows = RL.CityMap.districts.map((d) => '<div class="card"><div><b style="color:' + d.color + '">' + d.name + '</b><div class="small">' + (d.purpose || '') + '</div><div class="small">' + d.blurb + '</div></div></div>').join('');
    RL.UI.open({
      title: '🏛 City Hall',
      render: () => '<p>Redline City keeps a file on every district. The clock in the square is still stopped. The plaque says the city started when someone refused to lift.</p>' + rows
    });
  }
  function showImpound() {
    RL.UI.open({
      title: '🚓 Impound',
      render: () => {
        const w = RL.Wanted && RL.Wanted.W();
        const stars = w ? w.stars : 0;
        const heat = w ? w.heat : 0;
        if (stars > 0) return '<p>The lot is closed while you are lit up. Lose the cars, then the clerk will talk about paperwork.</p>';
        if (heat > 0) return '<p>Leftover heat with no units on you. The clerk will stamp it dead for $200. A live chase is not for sale.</p><div class="row"><button class="primary" data-act="pay"' + (RL.Game.state.money < 200 ? ' disabled' : '') + '>Pay $200</button></div>';
        return '<p>Your sheet is clean. The rows outside are other people\'s mistakes.</p>';
      },
      acts: { pay: () => {
        const w = RL.Wanted && RL.Wanted.W();
        if (!w || w.stars > 0 || w.heat <= 0 || RL.Game.state.money < 200) { RL.Audio.play('error'); return; }
        RL.Game.addMoney(-200);
        if (RL.Wanted.clearHeat) RL.Wanted.clearHeat();
        RL.Game.save();
        RL.UI.toast('Paperwork filed', '#7dff5a');
        RL.UI.back();
      } }
    });
  }
  function hasNews(id) {
    const s = RL.Game.state; if (!s) return false;
    if (id === 'hq') return (s.roleCooldownUntil || 0) <= Date.now() && !(RL.Wanted && RL.Wanted.stars());
    if (id === 'dragway') return !(s.totals && s.totals.dragWins);
    if (id === 'precinct') return RL.Roles && RL.Roles.current() === 'police' && !(s.job && s.job.type === 'dispatch');
    if (id === 'clinic') return RL.Game.currentCar() && RL.Game.currentCar().damage >= 25;
    if (id === 'meetup' || id === 'club' || id === 'pitmeet') return !(s.totals && s.totals.streets);
    if (id === 'lockup') return !(s.flags && s.flags.lockupStash);
    if (id === 'impound') return !!(RL.Wanted && RL.Wanted.W() && RL.Wanted.W().heat > 0 && !RL.Wanted.stars());
    return false;
  }
  function drawWorld(ctx, t) {
    const s = RL.Game.state;
    const night = dark() > 0.25;
    if (night) {
      RL.CityMap.roads.forEach((r) => {
        if (r.axis !== 'h') return;
        for (let x = r.x; x < r.x + r.w; x += 8) {
          const lx = (x + 0.2) * 40, ly = r.y * 40 - 8;
          ctx.fillStyle = 'rgba(255,214,120,0.9)'; ctx.fillRect(lx, ly, 3, 8);
          ctx.fillStyle = 'rgba(255,200,80,0.08)'; ctx.beginPath(); ctx.arc(lx + 1, ly + 10, 18, 0, 7); ctx.fill();
        }
      });
    }
    RL.CityMap.collectibles.forEach((c) => {
      if (s && s.found && s.found[c.id]) return;
      const p = 0.5 + 0.5 * Math.sin(t * 4 + c.x);
      ctx.fillStyle = 'rgba(200,80,255,' + (0.35 + p * 0.5) + ')'; ctx.beginPath(); ctx.arc(c.x, c.y, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('N', c.x, c.y + 3);
    });
    RL.CityMap.npcs.forEach((n) => {
      const bob = Math.sin(t * 3 + n.x) * 2;
      ctx.fillStyle = n.color; ctx.beginPath(); ctx.arc(n.x, n.y + bob, 8, 0, 7); ctx.fill();
      ctx.fillStyle = '#f2c9a0'; ctx.beginPath(); ctx.arc(n.x, n.y - 10 + bob, 5, 0, 7); ctx.fill();
    });
    // traffic lights along the near edge of each intersection
    if (RL.CityMap.lights && RL.Drive) {
      RL.CityMap.lights.forEach((L) => {
        const ph = RL.CityMap.lightPhase(L, RL.Drive.time);
        ctx.fillStyle = ph.ew === 'green' ? '#7dff5a' : ph.ew === 'yellow' ? '#ffe03b' : '#ff3b6b';
        ctx.fillRect(L.x * 40 + 4, L.y * 40 + 4, 6, 6);
      });
    }
  }
  function currentPrompt() {
    if (RL.Jobs && RL.Jobs.prompt && RL.Jobs.prompt()) return RL.Jobs.prompt();
    if (RL.Drive && RL.Drive.prompt()) return RL.Drive.prompt();
    const npc = nearestNpc();
    if (npc) return { text: 'E: talk to ' + npc.name, color: npc.color };
    const mk = nearestMark();
    if (mk) return { text: mk.name, color: '#ffe03b' };
    return null;
  }
  function drawPrompt(ctx, p) {
    const pr = currentPrompt(); if (!pr || !p) return;
    ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
    const w = ctx.measureText(pr.text).width + 18;
    ctx.fillStyle = 'rgba(8,6,24,0.85)'; ctx.fillRect(p.x - w / 2, p.y - 52, w, 22);
    ctx.strokeStyle = pr.color; ctx.strokeRect(p.x - w / 2, p.y - 52, w, 22);
    ctx.textBaseline = 'middle';
    ctx.fillText(pr.text, p.x, p.y - 41);
  }
  const HUB_LEGEND = { garage: 'shop', office: 'race', shop: 'shop', bar: 'story', training: 'race' };
  let mapOpen = false, mapCanvas = null, lastMini = null, lastFull = null, uiBound = false;
  function pinColor(b) {
    const key = b.legend || HUB_LEGEND[b.id] || 'story';
    const table = RL.CityMap.legend || {};
    return table[key] || b.color || '#ffe03b';
  }
  function legendItems() {
    return [
      { color: '#ffe03b', label: 'You' },
      { color: '#3a4154', label: 'Road' },
      { color: '#1e6a3d', label: 'Park' },
      { color: '#7dff5a', label: 'Shop' },
      { color: '#7aa2ff', label: 'Police' },
      { color: '#ff3b6b', label: 'Crime' },
      { color: '#ff2ef0', label: 'Race' },
      { color: '#ff8ad0', label: 'Hospital' },
      { color: '#ffd27a', label: 'Story' },
      { color: '#c86bff', label: 'Tag' }
    ];
  }
  function staticMap() {
    if (mapCanvas) return mapCanvas;
    const map = RL.CityMap, sc = 8;
    const c = document.createElement('canvas');
    c.width = map.cols * sc; c.height = map.rows * sc;
    const g = c.getContext('2d');
    g.fillStyle = '#12101c';
    g.fillRect(0, 0, c.width, c.height);
    map.districts.forEach((d) => { g.fillStyle = d.color; g.globalAlpha = 0.18; g.fillRect(d.x * sc, d.y * sc, d.w * sc, d.h * sc); g.globalAlpha = 1; });
    (map.parks || []).forEach((p) => { g.fillStyle = '#1e6a3d'; g.fillRect(p.x * sc, p.y * sc, p.w * sc, p.h * sc); });
    g.fillStyle = '#3a4154';
    map.roads.forEach((r) => g.fillRect(r.x * sc, r.y * sc, Math.max(1, r.w * sc), Math.max(1, r.h * sc)));
    (map.scenery || []).forEach((b) => { g.fillStyle = '#2c3344'; g.fillRect(b.x * sc + 0.4, b.y * sc + 0.4, Math.max(1, b.w * sc - 0.8), Math.max(1, b.h * sc - 0.8)); });
    (map.solids || []).forEach((s) => {
      if (s.kind === 'water') { g.fillStyle = '#14324a'; g.fillRect(s.x * sc, s.y * sc, s.w * sc, s.h * sc); }
    });
    const pins = ((RL.Hub && RL.Hub.BUILDINGS) || []).concat(map.buildings || []);
    pins.forEach((b) => { g.fillStyle = pinColor(b); g.fillRect(b.x * sc, b.y * sc, b.w * sc, b.h * sc); });
    mapCanvas = c;
    return c;
  }
  function wrapLines(ctx, text, maxW) {
    const words = String(text || '').split(' ');
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width > maxW && line) { lines.push(line); line = word; }
      else line = next;
    });
    if (line) lines.push(line);
    return lines;
  }
  function toggleMap() {
    mapOpen = !mapOpen;
    document.body.classList.toggle('map-open', mapOpen);
  }
  function closeMap() {
    if (!mapOpen) return false;
    mapOpen = false;
    document.body.classList.remove('map-open');
    return true;
  }
  function bindUi() {
    if (uiBound) return;
    uiBound = true;
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyM' && e.code !== 'KeyM'.toLowerCase()) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!RL.Game || RL.Game.mode !== 'hub') return;
      if (RL.UI && RL.UI.isOpen()) return;
      e.preventDefault();
      toggleMap();
    });
    const canvas = document.getElementById('game');
    if (canvas) canvas.addEventListener('pointerdown', onMapPointer);
    const btn = document.getElementById('btn-map');
    if (btn) btn.addEventListener('click', () => {
      if (!RL.Game || RL.Game.mode !== 'hub') return;
      if (RL.UI && RL.UI.isOpen()) return;
      toggleMap();
    });
  }
  function onMapPointer(e) {
    if (!RL.Game || RL.Game.mode !== 'hub' || (RL.UI && RL.UI.isOpen())) return;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (mapOpen && lastFull) {
      const tx = (x - lastFull.mx) / lastFull.sc / 40;
      const ty = (y - lastFull.my) / lastFull.sc / 40;
      const d = RL.CityMap.districts.find((dist) => tx >= dist.x && ty >= dist.y && tx < dist.x + dist.w && ty < dist.y + dist.h);
      if (d && RL.UI) RL.UI.toast(d.name + ' · ' + (d.purpose || d.blurb), d.color);
      return;
    }
    if (lastMini && x >= lastMini.x && y >= lastMini.y && x <= lastMini.x + lastMini.w && y <= lastMini.y + lastMini.h) toggleMap();
  }
  function legendHeight(ctx, items, maxW) {
    ctx.font = '11px Trebuchet MS, sans-serif';
    let lx = 0, rows = 1;
    items.forEach((it) => {
      const w = 16 + ctx.measureText(it.label).width + 10;
      if (lx > 0 && lx + w > maxW) { lx = 0; rows++; }
      lx += w;
    });
    return rows * 16;
  }
  function drawLegendRow(ctx, items, x, y, maxW) {
    ctx.font = '11px Trebuchet MS, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let lx = x, ly = y, rowH = 16;
    items.forEach((it) => {
      const w = 16 + ctx.measureText(it.label).width + 10;
      if (lx + w > x + maxW) { lx = x; ly += rowH; }
      ctx.fillStyle = it.color;
      ctx.fillRect(lx, ly - 5, 10, 10);
      ctx.fillStyle = '#e9eef7';
      ctx.fillText(it.label, lx + 14, ly);
      lx += w;
    });
    return ly - y + rowH;
  }
  function drawFullMap(ctx, W, H) {
    ctx.fillStyle = 'rgba(8,6,20,0.96)';
    ctx.fillRect(0, 0, W, H);
    const map = RL.CityMap;
    const narrow = W < 820;
    const legendW = narrow ? 0 : Math.min(300, Math.floor(W * 0.3));
    const top = 28;
    const src = staticMap();
    const availW = Math.max(120, W - legendW - 28);
    const availH = Math.max(120, H - top - (narrow ? 150 : 36));
    const sc = Math.min(availW / (map.cols * 40), availH / (map.rows * 40));
    const mw = map.cols * 40 * sc, mh = map.rows * 40 * sc;
    const mx = narrow ? (W - mw) / 2 : 16;
    const my = top;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, mx, my, mw, mh);
    ctx.imageSmoothingEnabled = true;
    ctx.strokeStyle = 'rgba(46,230,255,0.75)';
    ctx.strokeRect(mx, my, mw, mh);
    const p = RL.Hub.player;
    if (p) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(mx + p.x * sc, my + p.y * sc, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe03b';
      ctx.beginPath(); ctx.arc(mx + p.x * sc, my + p.y * sc, 3.5, 0, 7); ctx.fill();
    }
    const st = RL.Game.state;
    map.collectibles.forEach((c) => {
      if (st && st.found && st.found[c.id]) return;
      ctx.fillStyle = '#c86bff';
      ctx.fillRect(mx + c.x * sc - 2, my + c.y * sc - 2, 4, 4);
    });
    if (RL.Wanted) RL.Wanted.cops().forEach((c) => { ctx.fillStyle = '#ff3b6b'; ctx.fillRect(mx + c.x * sc - 2, my + c.y * sc - 2, 4, 4); });
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = 'bold ' + (mw < 420 ? 11 : 13) + 'px Trebuchet MS, sans-serif';
    map.districts.forEach((d) => {
      ctx.fillStyle = d.color;
      ctx.fillText(d.name, mx + (d.x + d.w / 2) * 40 * sc, my + d.y * 40 * sc + 3);
    });
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (!narrow) {
      let ly = top;
      const lx = mx + mw + 14;
      const colW = Math.max(80, W - lx - 12);
      ctx.fillStyle = '#2ee6ff';
      ctx.font = 'bold 16px Trebuchet MS, sans-serif';
      ctx.fillText('Redline City', lx, ly);
      ly += 22;
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#9fb3c8';
      ctx.fillText('Click a district. M or Esc closes.', lx, ly);
      ly += 18;
      ly += drawLegendRow(ctx, legendItems(), lx, ly, colW);
      ly += 8;
      ctx.font = 'bold 13px Trebuchet MS, sans-serif';
      ctx.fillStyle = '#ffe03b';
      ctx.fillText('Districts', lx, ly);
      ly += 16;
      map.districts.forEach((d) => {
        if (ly > H - 36) return;
        ctx.font = 'bold 12px Trebuchet MS, sans-serif';
        ctx.fillStyle = d.color;
        ctx.fillText(d.name, lx, ly);
        ly += 14;
        ctx.font = '11px Trebuchet MS, sans-serif';
        ctx.fillStyle = '#c5d0de';
        wrapLines(ctx, d.purpose || d.blurb, colW).forEach((line) => {
          if (ly > H - 36) return;
          ctx.fillText(line, lx, ly); ly += 13;
        });
        ly += 6;
      });
    } else {
      const ly = my + mh + 10;
      drawLegendRow(ctx, legendItems(), 12, ly, W - 24);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#9fb3c8';
      ctx.textAlign = 'left';
      map.districts.forEach((d, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 12 + col * ((W - 24) / 2);
        const y = ly + 40 + row * 28;
        ctx.fillStyle = d.color;
        ctx.font = 'bold 11px Trebuchet MS, sans-serif';
        ctx.fillText(d.name, x, y);
        ctx.fillStyle = '#9fb3c8';
        ctx.font = '10px sans-serif';
        let purpose = d.purpose || '';
        const max = Math.max(40, (W - 24) / 2 - 8);
        if (ctx.measureText(purpose).width > max) {
          while (purpose.length > 3 && ctx.measureText(purpose + '…').width > max) purpose = purpose.slice(0, -1);
          purpose += '…';
        }
        ctx.fillText(purpose, x, y + 12);
      });
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#9fb3c8';
    ctx.font = '12px sans-serif';
    ctx.fillText('M or Esc to close', W / 2, H - 14);
    lastFull = { mx: mx, my: my, mw: mw, mh: mh, sc: sc };
  }
  function drawOverlay(ctx, W, H, cam) {
    bindUi();
    if (mapOpen) { drawFullMap(ctx, W, H); return; }
    const dk = dark();
    const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
    grd.addColorStop(0, 'rgba(10,0,40,0)'); grd.addColorStop(1, 'rgba(10,0,40,0.55)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    if (dk > 0.05 && cam) {
      const g2 = ctx.createRadialGradient(cam.px, cam.py, 70, cam.px, cam.py, 460);
      g2.addColorStop(0, 'rgba(5,0,20,' + (dk * 0.15) + ')'); g2.addColorStop(1, 'rgba(5,0,20,' + dk + ')');
      ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
    }
    const map = RL.CityMap, sc = 168 / (map.cols * 40), mw = map.cols * 40 * sc, mh = map.rows * 40 * sc;
    const touch = document.body.classList.contains('touch');
    const margin = touch ? 196 : 104;
    const items = legendItems();
    const legendH = legendHeight(ctx, items, mw);
    const mx = 12, my = Math.max(72, H - mh - legendH - margin);
    ctx.fillStyle = 'rgba(8,6,24,0.82)';
    ctx.fillRect(mx - 4, my - 4, mw + 8, mh + legendH + 10);
    ctx.strokeStyle = 'rgba(46,230,255,0.45)';
    ctx.strokeRect(mx - 4, my - 4, mw + 8, mh + legendH + 10);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(staticMap(), mx, my, mw, mh);
    ctx.imageSmoothingEnabled = true;
    const p = RL.Hub.player;
    if (p) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(mx + p.x * sc, my + p.y * sc, 4.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe03b';
      ctx.beginPath(); ctx.arc(mx + p.x * sc, my + p.y * sc, 2.6, 0, 7); ctx.fill();
    }
    if (RL.Wanted) RL.Wanted.cops().forEach((c) => { ctx.fillStyle = '#ff3b6b'; ctx.fillRect(mx + c.x * sc, my + c.y * sc, 3, 3); });
    drawLegendRow(ctx, items, mx, my + mh + 10, mw);
    lastMini = { x: mx - 4, y: my - 4, w: mw + 8, h: mh + legendH + 10 };
    if (p && p.inCar !== false && RL.Drive) {
      const kmh = Math.round(RL.Drive.kmh(p.speed || 0));
      const lim = RL.Drive.limitAt(p.x, p.y) || 0;
      const sy = H - (touch ? 158 : 48);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = 'bold 32px Trebuchet MS, sans-serif';
      ctx.fillStyle = lim && kmh > lim + 8 ? '#ff3b6b' : '#fff';
      ctx.fillText(kmh, W / 2, sy);
      ctx.font = '12px sans-serif'; ctx.fillStyle = '#9fb3c8';
      ctx.fillText('km/h' + (lim ? '  lim ' + lim : '  off road'), W / 2, sy + 34);
    }
    const el = document.getElementById('hud-clock');
    if (el && RL.Game.mode === 'hub') el.textContent = fmt() + ' · ' + phaseName();
  }
  return { tick, tryAction, open, hasNews, drawWorld, drawPrompt, drawOverlay, dark, phaseName, fmt, setClock, syncFromSave, districtAt, nearestNpc, closeMap, toggleMap, mapOpen: () => mapOpen, get clock() { return clock; } };
})();
