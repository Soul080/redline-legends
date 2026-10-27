/* jobs.js - Criminal heists and smuggling, street races, and police dispatches.
   These are discovered from city buildings and street NPCs and pay into role XP. */
RL.Jobs = (function () {
  let rival = null, suspect = null;

  function S() { return RL.Game.state; }
  function showRobbery(which) {
    const role = RL.Roles.current();
    const name = which === 'bank' ? 'Neon Bank' : 'Quick Mart';
    RL.UI.open({
      title: which === 'bank' ? '🏦 Neon Bank' : '🏪 Quick Mart',
      render: () => {
        if (role === 'police') return '<p>The branch is quiet. You can stake it out, not stick it up — Internal Affairs is watching.</p><div class="row"><button data-act="back">Leave</button></div>';
        if (role !== 'criminal') return '<p>' + name + ' keeps its shutters polite for civilians. Vick at the harbor hires people who have already chosen a side.</p>';
        const pay = which === 'bank' ? 1600 : 520;
        return '<p>Crack the register and run. Heat will spike. Launder at Harbor Co. or just lose the tail — the fence pays more.</p><p class="small">Take about ' + RL.fmtMoney(pay) + (RL.Roles.hasPerk('fence') ? ' · fence bonus armed' : '') + '.</p><div class="row"><button class="primary" data-act="rob">Rob it</button></div>';
      },
      acts: { rob: () => startHeist(which) }
    });
  }
  function startHeist(which) {
    if (RL.Roles.current() !== 'criminal') { RL.UI.toast('Criminals only.', '#ff8a2e'); return; }
    const base = which === 'bank' ? 1600 : 520;
    const loot = Math.round(base * (RL.Roles.hasPerk('fence') ? 1.3 : 1));
    S().job = { type: 'heist', which, loot, phase: 'escape', until: Date.now() + 1000 * 100, laundered: false };
    RL.UI.closeAll();
    if (RL.Wanted) RL.Wanted.report('heist', {});
    RL.UI.toast('Alarm! Get out of sight or reach Harbor Co.', '#ff3b6b');
    RL.Game.event('heistStart', { which });
  }
  function showSmuggle() {
    const role = RL.Roles.current();
    RL.UI.open({
      title: '📦 Harbor Co.',
      render: () => {
        const job = S().job;
        if (job && job.type === 'heist' && job.phase === 'escape') return '<p>Vick will wash the take for the full amount.</p><div class="row"><button class="primary" data-act="wash">Launder ' + RL.fmtMoney(job.loot) + '</button></div>';
        if (role !== 'criminal') return '<p>Crates, cranes, and nothing for a clean license. Come back when Role HQ lists you as criminal.</p>';
        return '<p>A sealed crate needs to be in the Neon Mile in 80 seconds. Don\'t get busted.</p><div class="row"><button class="primary" data-act="load">Load cargo</button></div>';
      },
      acts: {
        wash: () => finishHeist(true),
        load: () => startSmuggle()
      }
    });
  }
  function startSmuggle() {
    if (RL.Roles.current() !== 'criminal') return;
    S().job = { type: 'smuggle', phase: 'deliver', until: Date.now() + 80000, drop: { x: 3000, y: 340 } };
    RL.UI.closeAll();
    if (RL.Wanted) RL.Wanted.report('smuggle', {});
    RL.UI.toast('Cargo loaded. Neon Mile drop is marked.', '#2ee6ff');
  }
  function finishHeist(washed) {
    const job = S().job; if (!job || job.type !== 'heist') return;
    const pay = washed ? job.loot : Math.round(job.loot * 0.7);
    RL.Game.addMoney(pay);
    RL.Roles.addXp('criminal', whichXp(job.which));
    S().totals.heists = (S().totals.heists || 0) + 1;
    S().job = null;
    RL.UI.toast('Score ' + RL.fmtMoney(pay), '#7dff5a');
    if (RL.Game.unlockAch) RL.Game.unlockAch('sp_heist');
    RL.Game.event('heist', { washed: !!washed });
    if (RL.Daily) RL.Daily.progress('heist', 1);
    RL.Game.save();
  }
  function whichXp(which) { return which === 'bank' ? 55 : 30; }
  function startStreet() {
    const role = RL.Roles.current();
    if (role === 'police') {
      RL.Roles.infraction('street');
      RL.UI.toast('You ran a street race in uniform.', '#ff8a2e');
    } else if (RL.Wanted) RL.Wanted.report('street', {});
    const p = RL.Hub.player;
    rival = { x: p.x - 40, y: p.y + 36, h: 0, speed: 160, color: '#ff2ef0', name: 'Mira', cp: 0, done: false };
    S().job = { type: 'street', cp: 0, cps: [{ x: 2500, y: 380 }, { x: 1640, y: 1460 }, { x: 620, y: 860 }], until: Date.now() + 70000 };
    RL.UI.closeAll();
    RL.UI.toast('Street race — hit the gates. Cops are listening.', '#ff2ef0');
    RL.Game.startQuest && RL.Game.startQuest('sp_street');
  }
  function startDispatch() {
    if (RL.Roles.current() !== 'police') { RL.UI.toast('Badge required.', '#ff8a2e'); return; }
    suspect = { x: 1800, y: 380, h: 0, speed: 140, color: '#ff3b6b', name: 'Getaway', hp: 40, pin: 0, alive: true };
    S().job = { type: 'dispatch', until: Date.now() + 90000 };
    RL.UI.closeAll();
    if (RL.Hub.player) RL.Hub.player.siren = true;
    RL.UI.toast('Suspect eastbound on King Blvd. Box them in.', '#7aa2ff');
  }
  function update(dt) {
    const s = S(); if (!s || !s.job) { rival = null; return; }
    const job = s.job, p = RL.Hub.player; if (!p) return;
    if (job.until && Date.now() > job.until) {
      RL.UI.toast(job.type === 'dispatch' ? 'Suspect escaped' : 'Job failed', '#ff8a2e');
      s.job = null; rival = null; suspect = null; return;
    }
    if (job.type === 'heist' && job.phase === 'escape' && RL.Wanted && RL.Wanted.stars() === 0 && (s.totals.evasions || 0) >= 0 && job.sawStars) {
      finishHeist(false);
    }
    if (job.type === 'heist' && RL.Wanted && RL.Wanted.stars() > 0) job.sawStars = true;
    if (job.type === 'street' && rival) {
      const cps = job.cps;
      const target = cps[Math.min(rival.cp, cps.length - 1)];
      const dh = Math.atan2(target.y - rival.y, target.x - rival.x);
      rival.h = dh; rival.x += Math.cos(dh) * rival.speed * dt; rival.y += Math.sin(dh) * rival.speed * dt;
      if (Math.hypot(rival.x - target.x, rival.y - target.y) < 50) rival.cp++;
      if (rival.cp >= cps.length && !rival.done) { rival.done = true; RL.UI.toast('Mira beat you to the last gate', '#ff3b6b'); s.job = null; rival = null; return; }
      const gate = cps[job.cp];
      if (gate && Math.hypot(p.x - gate.x, p.y - gate.y) < 56) {
        job.cp++;
        if (job.cp >= cps.length) {
          RL.Game.addMoney(700); RL.Roles.addXp(RL.Roles.current() === 'criminal' ? 'criminal' : 'neutral', 25);
          s.totals.streets = (s.totals.streets || 0) + 1;
          RL.UI.toast('You took the street race +' + RL.fmtMoney(700), '#7dff5a');
          if (RL.Game.unlockAch) RL.Game.unlockAch('sp_street');
          RL.Game.event('streetWin', {});
          if (RL.Daily) RL.Daily.progress('street', 1);
          s.job = null; rival = null; RL.Game.save();
        }
      }
    }
    if (job.type === 'dispatch' && suspect && suspect.alive) {
      suspect.x += 150 * dt;
      if (suspect.x > 3200) suspect.x = 900;
      const d = Math.hypot(suspect.x - p.x, suspect.y - p.y);
      if (d < 30 && Math.abs(p.speed) < 120) suspect.pin += dt; else suspect.pin = Math.max(0, suspect.pin - dt);
      if (suspect.pin > 1 || (d < 24 && Math.abs(p.speed) > 150)) {
        suspect.alive = false;
        const pay = 650;
        RL.Game.addMoney(pay); RL.Roles.addXp('police', 40);
        s.totals.bustsAi = (s.totals.bustsAi || 0) + 1;
        RL.UI.toast('Suspect boxed +' + RL.fmtMoney(pay), '#7dff5a');
        if (RL.Game.unlockAch) RL.Game.unlockAch('sp_bust');
        RL.Game.event('bust', {});
        if (RL.Daily) RL.Daily.progress('bust', 1);
        s.job = null; suspect = null; RL.Game.save();
      }
    }
  }
  function tryAction() {
    const s = S(), p = RL.Hub.player; if (!s || !s.job || !p) return false;
    const job = s.job;
    if (job.type === 'smuggle' && Math.hypot(p.x - job.drop.x, p.y - job.drop.y) < 70 && Math.abs(p.speed) < 100) {
      RL.Game.addMoney(900); RL.Roles.addXp('criminal', 35);
      s.totals.smuggles = (s.totals.smuggles || 0) + 1;
      s.job = null;
      RL.UI.toast('Delivery paid +' + RL.fmtMoney(900), '#7dff5a');
      if (RL.Game.unlockAch) RL.Game.unlockAch('sp_smuggle');
      RL.Game.event('smuggle', {});
      if (RL.Daily) RL.Daily.progress('smuggle', 1);
      RL.Game.save();
      return true;
    }
    return false;
  }
  function prompt() {
    const s = S(), p = RL.Hub.player; if (!s || !s.job || !p) return null;
    if (s.job.type === 'smuggle' && Math.hypot(p.x - s.job.drop.x, p.y - s.job.drop.y) < 80) return { text: 'E: drop the cargo', color: '#ffb02e' };
    if (s.job.type === 'street') return { text: 'Gate ' + (s.job.cp + 1) + '/' + s.job.cps.length, color: '#ff2ef0' };
    if (s.job.type === 'dispatch') return { text: 'Box the suspect', color: '#7aa2ff' };
    if (s.job.type === 'heist') return { text: 'Escape or launder at Harbor Co.', color: '#ff3b6b' };
    return null;
  }
  function draw(ctx) {
    const s = S(); if (!s || !s.job) return;
    const job = s.job;
    if (job.type === 'street') {
      const g = job.cps[job.cp];
      if (g) { ctx.strokeStyle = '#ff2ef0'; ctx.lineWidth = 3; ctx.strokeRect(g.x - 24, g.y - 24, 48, 48); }
      if (rival) RL.Drive.drawCar(ctx, rival, {});
    }
    if (job.type === 'smuggle') {
      ctx.fillStyle = '#ffb02e'; ctx.fillRect(job.drop.x - 8, job.drop.y - 8, 16, 16);
    }
    if (suspect && suspect.alive) {
      RL.Drive.drawCar(ctx, suspect, {});
      ctx.fillStyle = '#ff3b6b'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('SUSPECT', suspect.x, suspect.y - 16);
    }
  }
  return { showRobbery, showSmuggle, startHeist, startSmuggle, startStreet, startDispatch, update, tryAction, prompt, draw, get rival() { return rival; }, get suspect() { return suspect; } };
})();
