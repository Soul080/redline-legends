/* extras.js - Save migration, photo mode, paint/decals, daily board, and the
   quest / achievement hooks for the city, drag strip, wanted level and roles.
   Old saves gain the new fields and keep their cars, money and story. */
(function () {
  const QUESTS = {
    sp_city: { title: 'Learn the Streets', desc: 'Drive through 3 districts of Redline City.', type: 'visit', target: 3, reward: { money: 250, xp: 80 } },
    sp_drag: { title: 'Tree Green', desc: 'Win a quarter-mile at the dragway.', type: 'dragWin', reward: { money: 400, xp: 120 } },
    unk_strip: { title: 'Minutes on the Stripe', desc: 'UNKNOWN asked for one clean drag win. It pays once.', type: 'dragWin', reward: { money: 450, xp: 100 } },
    sp_heat: { title: 'Lose the Tail', desc: 'Escape a wanted level.', type: 'evade', reward: { money: 350, xp: 90 } },
    sp_tags: { title: 'Neon Scavenger', desc: 'Find 5 hidden neon tags.', type: 'tags', target: 5, reward: { money: 500, xp: 100 } },
    sp_heist: { title: 'Quiet Money', desc: 'Complete a robbery as a criminal.', type: 'heist', reward: { money: 300, xp: 80 } },
    sp_street: { title: 'Pink Slips', desc: 'Win a street race in the city.', type: 'streetWin', reward: { money: 400, xp: 100 } },
    sp_photo: { title: 'After Hours', desc: 'Take a photo at night.', type: 'nightPhoto', reward: { money: 200, xp: 60 } },
    sp_badge: { title: 'Collar', desc: 'Bust a suspect as police.', type: 'bust', reward: { money: 400, xp: 100 } },
    sp_daily: { title: 'Clocked In', desc: 'Clear a full set of daily challenges.', type: 'dailyClear', reward: { money: 500, xp: 120 } }
  };
  const ACH = [
    { id: 'sp_wheels', name: 'On the Road', desc: 'Drive the city.' },
    { id: 'sp_red', name: 'Red Means Go', desc: 'Run a red light.' },
    { id: 'sp_star1', name: 'Lit Up', desc: 'Reach 1 star wanted.' },
    { id: 'sp_star5', name: 'Most Wanted', desc: 'Reach 5 stars.' },
    { id: 'sp_evade', name: 'Clean Getaway', desc: 'Escape the police.' },
    { id: 'sp_evade5', name: 'Ghost', desc: 'Escape a 5-star wanted level.' },
    { id: 'sp_busted', name: 'Cuffed', desc: 'Get busted.' },
    { id: 'sp_recruit', name: 'Sworn', desc: 'Join the police.' },
    { id: 'sp_dirty', name: 'Other Side', desc: 'Become a criminal.' },
    { id: 'sp_bust', name: 'Booked', desc: 'Bust a suspect.' },
    { id: 'sp_heist', name: 'Score', desc: 'Finish a heist.' },
    { id: 'sp_smuggle', name: 'Mule', desc: 'Finish a smuggling run.' },
    { id: 'sp_street', name: 'Street King', desc: 'Win a street race.' },
    { id: 'sp_bigshot', name: 'Big Shot', desc: 'Max a role rank.' },
    { id: 'sp_ia', name: 'Paperwork', desc: 'Get suspended by Internal Affairs.' },
    { id: 'sp_tuner', name: 'Ratio', desc: 'Adjust a drag gear ratio.' },
    { id: 'sp_drag', name: 'Holeshot', desc: 'Win a drag race.' },
    { id: 'sp_perfect', name: 'Christmas Tree', desc: 'Nail a perfect drag launch.' },
    { id: 'sp_shifts', name: 'Powershift', desc: 'Land 3 perfect shifts in one drag.' },
    { id: 'sp_tags', name: 'Tagged', desc: 'Find every hidden neon tag.' },
    { id: 'sp_tourist', name: 'All Districts', desc: 'Visit every district.' },
    { id: 'sp_nightowl', name: 'Night Owl', desc: 'Take a photo at night.' },
    { id: 'sp_custom', name: 'Fresh Paint', desc: 'Apply a paint or decal.' },
    { id: 'sp_daily', name: 'Daily Driver', desc: 'Clear a daily challenge set.' },
    { id: 'sp_photo', name: 'Shutter', desc: 'Take a photo.' }
  ];
  Object.keys(QUESTS).forEach((id) => { if (!RL.QUESTS[id]) RL.QUESTS[id] = QUESTS[id]; });
  ACH.forEach((a) => { if (!RL.ACHIEVEMENTS.some((x) => x.id === a.id)) RL.ACHIEVEMENTS.push(a); });

  const DECALS = ['none', 'stripes', 'flames', 'lightning', 'checker', 'number'];
  RL.Look = {
    paintDecal(g, decal, color) {
      if (!decal || decal === 'none') return;
      g.save();
      g.fillStyle = color || '#ffffff';
      g.strokeStyle = color || '#ffffff';
      if (decal === 'stripes') { g.fillRect(-16, -2, 34, 2); g.fillRect(-16, 2, 34, 2); }
      else if (decal === 'flames') { g.fillStyle = '#ff8a2e'; g.beginPath(); g.moveTo(-16, 0); g.lineTo(-4, -6); g.lineTo(-8, 0); g.lineTo(-4, 6); g.fill(); }
      else if (decal === 'lightning') { g.lineWidth = 2; g.beginPath(); g.moveTo(8, -6); g.lineTo(0, 0); g.lineTo(6, 0); g.lineTo(-2, 6); g.stroke(); }
      else if (decal === 'checker') { for (let i = 0; i < 4; i++) g.fillRect(8 + (i % 2) * 4, -6 + Math.floor(i / 2) * 6, 4, 6); }
      else if (decal === 'number') { g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.fillText('01', 4, 3); }
      g.restore();
    }
  };

  function migrate(s) {
    if (!s || !s.cars) return;
    if (!s.found) s.found = {};
    if (!s.visited) s.visited = { downtown: true };
    if (s.clock == null) s.clock = 10 * 60;
    if (!s.wanted || typeof s.wanted !== 'object') s.wanted = { stars: 0, heat: 0, peak: 0 };
    if (s.wanted.stars == null) s.wanted.stars = 0;
    if (s.wanted.heat == null) s.wanted.heat = 0;
    if (!s.role) s.role = 'neutral';
    if (!s.roleXp) s.roleXp = { neutral: 0, criminal: 0, police: 0 };
    if (s.roleCooldownUntil == null) s.roleCooldownUntil = 0;
    if (s.iaStrikes == null) s.iaStrikes = 0;
    if (!s.flags) s.flags = {};
    if (!s.totals) s.totals = { races: 0, wins: 0, crashes: 0, nitro: 0, draft: 0, training: 0 };
    ['drags', 'dragWins', 'evasions', 'busts', 'heists', 'smuggles', 'photos', 'tags', 'streets', 'bustsAi', 'explosions', 'tows', 'driveDist', 'tuned'].forEach((k) => { if (s.totals[k] == null) s.totals[k] = 0; });
    if (!s.hub) s.hub = { x: 15.5 * 40, y: 9.5 * 40 };
    if (s.hub.h == null) s.hub.h = 0;
    if (s.hub.speed == null) s.hub.speed = 0;
    if (s.hub.inCar == null) s.hub.inCar = true;
    if (!('joyride' in s.hub)) s.hub.joyride = null;
    if (!(Number(s.hub.hp) > 0)) s.hub.hp = 100;
    else s.hub.hp = Math.round(RL.clamp(Number(s.hub.hp), 1, 100));
    s.cars.forEach((c) => {
      if (!c.tune) c.tune = { gear: 0, aero: 0 };
      if (c.tune.gear == null) c.tune.gear = 0;
      if (c.tune.aero == null) c.tune.aero = 0;
      if (!c.drag) c.drag = RL.DragSim.defaultSetup();
      if (!c.look) c.look = { paint: null, decal: 'none', decalColor: '#ffffff' };
      if (c.damage >= 100) c.damage = 99;
    });
    if (!s.flags.spSeeded && s.quests && s.quests.active && s.quests.active.indexOf('m1') >= 0 && (s.totals.races || 0) === 0 && (s.playTime || 0) < 1) {
      s.flags.spSeeded = true;
      if (s.quests.active.indexOf('sp_city') < 0) s.quests.active.push('sp_city');
    }
    if (RL.City) RL.City.syncFromSave();
  }

  function questTick(type, d) {
    const s = RL.Game.state; if (!s) return;
    d = d || {};
    s.quests.active.slice().forEach((id) => {
      const q = RL.QUESTS[id]; if (!q) return;
      let done = false;
      if (q.type === 'visit' && type === 'district' && d.n >= (q.target || 3)) done = true;
      if (q.type === 'dragWin' && type === 'raceEnd' && d.kind === 'drag' && d.position === 1) done = true;
      if (q.type === 'evade' && type === 'evade') done = true;
      if (q.type === 'tags' && type === 'tag' && d.n >= (q.target || 5)) done = true;
      if (q.type === 'heist' && type === 'heist') done = true;
      if (q.type === 'streetWin' && type === 'streetWin') done = true;
      if (q.type === 'nightPhoto' && type === 'photo' && d.night) done = true;
      if (q.type === 'bust' && type === 'bust') done = true;
      if (q.type === 'dailyClear' && type === 'dailyClear') done = true;
      if (done) RL.Game.completeQuest(id);
    });
  }

  const DAILY_POOL = [
    { id: 'dist', name: 'Tourist', desc: 'Visit a new district', type: 'district', goal: 1, reward: { money: 200, xp: 40 } },
    { id: 'drive', name: 'Cruise', desc: 'Drive 1500m around the city', type: 'distance', goal: 1500, reward: { money: 180, xp: 40 } },
    { id: 'photo', name: 'Postcard', desc: 'Take a photo', type: 'photo', goal: 1, reward: { money: 150, xp: 30 } },
    { id: 'drag', name: 'Strip', desc: 'Win a drag race', type: 'drag', goal: 1, reward: { money: 300, xp: 60 } },
    { id: 'podium', name: 'Podium', desc: 'Finish a circuit race in the top 3', type: 'podium', goal: 1, reward: { money: 250, xp: 50 } },
    { id: 'tag', name: 'Tag', desc: 'Find a hidden neon tag', type: 'tag', goal: 1, reward: { money: 160, xp: 30 } },
    { id: 'evade', name: 'Slip', desc: 'Escape a wanted level', type: 'evade', goal: 1, reward: { money: 280, xp: 50 } },
    { id: 'custom', name: 'Respray', desc: 'Change paint or a decal', type: 'custom', goal: 1, reward: { money: 120, xp: 20 } }
  ];
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; }
  RL.Daily = {
    current() {
      const s = RL.Game.state; if (!s) return null;
      const date = new Date().toISOString().slice(0, 10);
      if (!s.daily || s.daily.date !== date || !s.daily.tasks || s.daily.tasks.length !== 3) {
        const tasks = []; let h = hash(date);
        const pool = DAILY_POOL.slice();
        while (tasks.length < 3 && pool.length) {
          h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
          const i = h % pool.length;
          const src = pool.splice(i, 1)[0];
          tasks.push({ id: src.id, name: src.name, desc: src.desc, type: src.type, goal: src.goal, progress: 0, done: false, reward: src.reward });
        }
        s.daily = { date, tasks, bonus: false };
      }
      return s.daily;
    },
    progress(type, n) {
      const d = this.current(); if (!d) return;
      let changed = false;
      d.tasks.forEach((t) => {
        if (t.type !== type || t.done) return;
        t.progress = Math.min(t.goal, t.progress + (n || 1));
        if (t.progress >= t.goal) {
          t.done = true; changed = true;
          if (t.reward.money) RL.Game.addMoney(t.reward.money);
          if (t.reward.xp) RL.Game.addXP(t.reward.xp);
          RL.UI.toast('Daily: ' + t.name, '#7dff5a');
        }
      });
      if (changed && d.tasks.every((t) => t.done) && !d.bonus) {
        d.bonus = true; RL.Game.addMoney(400); RL.Game.addXP(80);
        RL.UI.toast('Daily set cleared +$400', '#ffe03b');
        if (RL.Game.unlockAch) RL.Game.unlockAch('sp_daily');
        RL.Game.event('dailyClear', {});
      }
      if (changed) RL.Game.save();
    },
    show() {
      const d = this.current();
      RL.UI.open({ title: '📅 Daily Challenges', render: () => '<p class="small">' + d.date + '</p>' + d.tasks.map((t) => '<div class="card"><div><b>' + (t.done ? '✅ ' : '') + t.name + '</b><div class="small">' + t.desc + ' · ' + Math.round(t.progress) + '/' + t.goal + '</div></div><div class="small">' + RL.fmtMoney(t.reward.money) + '</div></div>').join('') });
    }
  };

  const FILTERS = ['none', 'grayscale(0.85) contrast(1.1)', 'sepia(0.55) saturate(1.3)', 'saturate(1.7) hue-rotate(18deg)'];
  RL.Photo = {
    active: false, x: 0, y: 0, zoom: 1, filter: 0,
    enter() {
      const p = RL.Hub.player; if (!p || RL.Game.mode !== 'hub') return;
      this.active = true; this.x = p.x; this.y = p.y; this.zoom = 1;
      document.body.classList.add('photo');
      RL.UI.toast('Photo mode — arrows pan, C filter, Enter snap, Esc exit', '#ffe03b');
    },
    exit() { this.active = false; document.body.classList.remove('photo'); const c = document.getElementById('game'); if (c) c.style.filter = ''; },
    override() { return this.active ? { x: this.x, y: this.y, zoom: this.zoom } : null; },
    snap() {
      const s = RL.Game.state; if (!s) return;
      s.totals.photos = (s.totals.photos || 0) + 1;
      const night = RL.City && RL.City.dark() > 0.4;
      RL.UI.toast(night ? 'Night photo saved' : 'Photo saved', '#ffe03b');
      if (RL.Game.unlockAch) { RL.Game.unlockAch('sp_photo'); if (night) RL.Game.unlockAch('sp_nightowl'); }
      RL.Game.event('photo', { night: !!night });
      if (RL.Daily) RL.Daily.progress('photo', 1);
      RL.Game.save();
    },
    update(dt) {
      if (RL.Input.hit('pause')) { this.exit(); return; }
      const sp = 320 / this.zoom;
      if (RL.Input.down('left')) this.x -= sp * dt;
      if (RL.Input.down('right')) this.x += sp * dt;
      if (RL.Input.down('up')) this.y -= sp * dt;
      if (RL.Input.down('down')) this.y += sp * dt;
      if (RL.Input.hit('action')) this.snap();
    },
    draw(ctx, W, H) {
      if (!this.active) return;
      ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(W * 0.12, H * 0.1, W * 0.76, H * 0.72);
      ctx.font = '14px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText((RL.City ? RL.City.fmt() + ' · ' + RL.City.phaseName() : '') + '   ' + FILTERS[this.filter], W / 2, H * 0.86);
      ctx.restore();
    }
  };
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (!RL.Game || RL.Game.mode !== 'hub') return;
    if (e.code === 'KeyC' && RL.Photo.active) {
      RL.Photo.filter = (RL.Photo.filter + 1) % FILTERS.length;
      document.getElementById('game').style.filter = FILTERS[RL.Photo.filter] === 'none' ? '' : FILTERS[RL.Photo.filter];
    }
    if (e.code === 'KeyF' && !RL.UI.isOpen()) {
      if (RL.Drive && RL.Drive.enterTarget && RL.Drive.enterTarget()) return;
      if (RL.Photo.active) RL.Photo.snap(); else RL.Photo.enter();
    }
    if (e.code === 'KeyH' && !RL.UI.isOpen() && !RL.Photo.active) RL.Daily.show();
  });

  function showCustoms() {
    const car = RL.Game.currentCar();
    if (!car.look) car.look = { paint: null, decal: 'none', decalColor: '#ffffff' };
    RL.UI.open({
      title: '🎨 Customs',
      render: () => {
        const look = car.look, col = look.paint || RL.Game.carColor(car);
        const skullOk = RL.Roles && RL.Roles.rankIndex && RL.Roles.current() === 'criminal' && RL.Roles.rankIndex() >= 3;
        let svg = '<svg class="carprev" viewBox="0 0 220 110"><rect width="220" height="110" fill="#0b0618"/>';
        svg += '<rect x="40" y="42" width="140" height="28" rx="6" fill="' + col + '" stroke="#fff" stroke-opacity="0.3"/>';
        if (look.decal === 'stripes') svg += '<rect x="40" y="52" width="140" height="3" fill="' + look.decalColor + '"/><rect x="40" y="58" width="140" height="3" fill="' + look.decalColor + '"/>';
        if (look.decal === 'flames') svg += '<path d="M40 56 L70 46 L60 56 L78 66 Z" fill="#ff8a2e"/>';
        if (look.decal === 'lightning') svg += '<path d="M120 46 L100 58 L112 58 L96 70" stroke="' + look.decalColor + '" fill="none" stroke-width="3"/>';
        if (look.decal === 'checker') svg += '<rect x="150" y="46" width="8" height="8" fill="#fff"/><rect x="158" y="54" width="8" height="8" fill="#fff"/>';
        if (look.decal === 'number') svg += '<text x="110" y="62" fill="' + look.decalColor + '" font-size="16" text-anchor="middle">01</text>';
        if (RL.Roles && RL.Roles.current() === 'police') svg += '<rect x="40" y="42" width="140" height="6" fill="#1d4e9a"/><text x="110" y="64" fill="#fff" font-size="10" text-anchor="middle">POLICE</text>';
        svg += '</svg>';
        let h = (RL.Jobs ? RL.Jobs.card('customs') : '') + svg + '<div class="row">';
        RL.PAINT_COLORS.forEach((c) => { h += '<button data-act="paint" data-arg="' + c + '" style="background:' + c + ';width:28px;height:28px"></button>'; });
        h += '<button data-act="paint" data-arg="">Stock</button></div><div class="row">';
        DECALS.forEach((d) => { h += '<button data-act="decal" data-arg="' + d + '"' + (look.decal === d ? ' class="primary"' : '') + '>' + d + '</button>'; });
        if (skullOk) h += '<button data-act="decal" data-arg="flames">Skull rank: flames glow</button>';
        h += '</div>';
        return h;
      },
      acts: {
        paint: (c) => { car.look.paint = c || null; touchCustom(); },
        decal: (d) => { car.look.decal = d; touchCustom(); },
        robbery: () => { if (RL.Jobs) RL.Jobs.rob('customs'); }
      }
    });
  }
  function touchCustom() {
    RL.Game.save();
    if (RL.Game.unlockAch) RL.Game.unlockAch('sp_custom');
    if (RL.Daily) RL.Daily.progress('custom', 1);
    RL.Game.event('custom', {});
  }

  RL.Modes = {
    handlers: {},
    register(kind, h) { this.handlers[kind] = h; },
    has(mode) { return !!this.handlers[mode]; },
    claim(cfg) {
      const h = this.handlers[cfg.kind]; if (!h) return false;
      RL.UI.closeAll();
      RL.Game.mode = cfg.kind;
      h.start(cfg);
      RL.UI.setMode('race');
      document.body.classList.add('mode-' + cfg.kind);
      try { RL.Audio.startMusic('race'); } catch (e) { }
      return true;
    },
    update(mode, dt) { const h = this.handlers[mode]; if (h && h.update) h.update(dt); },
    draw(mode, ctx) { const h = this.handlers[mode]; if (h && h.draw) h.draw(ctx); },
    stop() {
      Object.keys(this.handlers).forEach((k) => { if (this.handlers[k].stop) this.handlers[k].stop(); document.body.classList.remove('mode-' + k); });
    }
  };
  RL.Modes.register('drag', RL.Drag);

  const origColor = RL.Game.carColor;
  RL.Game.carColor = function (car) { if (car && car.look && car.look.paint) return car.look.paint; return origColor.call(this, car); };
  const origNew = RL.Game.newState;
  RL.Game.newState = function (name) { origNew.call(this, name); migrate(this.state); this.save(); };
  const origLoad = RL.Game.load;
  RL.Game.load = function () { const ok = origLoad.call(this); if (ok) { migrate(this.state); this.save(); } return ok; };
  const origEvent = RL.Game.event;
  RL.Game.event = function (type, d) { const r = origEvent.call(this, type, d); questTick(type, d); return r; };
  const origStart = RL.Game.startRace;
  RL.Game.startRace = function (cfg) {
    if (RL.Hub && RL.Hub.player) RL.Hub.player.siren = false;
    if (RL.Drive && RL.Drive.dropJoyride) RL.Drive.dropJoyride({ quiet: true });
    if (RL.Modes && RL.Modes.claim(cfg)) return;
    return origStart.call(this, cfg);
  };
  const origToHub = RL.Game.toHub;
  RL.Game.toHub = function () {
    if (RL.Modes) RL.Modes.stop();
    if (RL.DragRules && this.state && this.state.dragStake) RL.DragRules.forfeit(this.state);
    return origToHub.call(this);
  };
  const origFinish = RL.Game.finishRace;
  RL.Game.finishRace = function (res) {
    const s = this.state;
    if (res && res.cfg && res.cfg.kind === 'drag') {
      s.totals.drags = (s.totals.drags || 0) + 1;
      if (res.position === 1) { s.totals.dragWins = (s.totals.dragWins || 0) + 1; if (RL.Game.unlockAch) RL.Game.unlockAch('sp_drag'); if (RL.Daily) RL.Daily.progress('drag', 1); }
      if (res.perfectLaunch && RL.Game.unlockAch) RL.Game.unlockAch('sp_perfect');
      if ((res.perfectShifts || 0) >= 3 && RL.Game.unlockAch) RL.Game.unlockAch('sp_shifts');
    }
    if (res && res.position && res.position <= 3 && res.cfg && (res.cfg.kind === 'race' || res.cfg.kind === 'boss')) {
      if (RL.Daily) RL.Daily.progress('podium', 1);
      if (RL.Roles) RL.Roles.addXp('neutral', 8);
    }
    return origFinish.call(this, res);
  };

  function bindHud() {
    const d = document.getElementById('btn-daily'), p = document.getElementById('btn-photo');
    if (d) d.onclick = () => { RL.Audio.init(); if (RL.UI.isOpen()) RL.UI.closeAll(); RL.Daily.show(); };
    if (p) p.onclick = () => { RL.Audio.init(); if (RL.Photo.active) RL.Photo.exit(); else RL.Photo.enter(); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindHud); else bindHud();

  RL.Extras = { migrate, showCustoms, QUESTS };
})();
