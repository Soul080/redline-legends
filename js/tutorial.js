/* tutorial.js - First-run street lesson. Steps advance only when the
   matching thing has actually happened. The payout is claimed once. */
RL.Tutorial = (function () {
  const REWARD = 200;
  const CLAIM = 'tutorial:street';
  const BLOCK = /menu|how to play|settings|import save|paused|street tutorial|inventory|skills|quest|achievement|new game|start over|online race|race results|dialog/i;
  const STEPS = [
    { id: 'drive', title: 'Drive', text: 'Hold gas and get the car moving. Arrows or WASD. On a touch screen, hold ▲.', target: '#touch .t-up',
      test: (c) => c.mode === 'hub' && c.inCar && c.speed > 80 },
    { id: 'drift', title: 'Drift', text: 'Start a race if you are not in one, then hold the handbrake while you turn. Space, or DRIFT.', target: '#touch .t-drift',
      test: (c) => c.mode === 'race' && (c.drifting || c.driftCur > 15) },
    { id: 'nitro', title: 'Nitro', text: 'Still in the race, fire nitro. Shift, N, or NITRO. A drift fills the tank if it is empty.', target: '#touch .t-nitro',
      test: (c) => c.mode === 'race' && (c.nitroOn || c.nitroTime > 0.05) },
    { id: 'map', title: 'Map', text: 'Back in the city, press M or tap the map button. The legend names every district.', target: '#btn-map',
      test: (c) => c.mapOpen },
    { id: 'building', title: 'A door', text: 'Drive to a marked door, stop, and press E or ACT. The garage, shop, office, bar, and training track all count.', target: '',
      test: (c) => c.building },
    { id: 'race', title: 'A race', text: 'Start any race. Training Track is the short one. Race Office and Free Play count too.', target: '',
      test: (c) => c.sawRace },
    { id: 'star', title: 'Wanted', text: 'Get at least one wanted star. Hold a speed well over the limit, or stack real hits. A nudge will not do it.', target: '',
      test: (c) => c.stars >= 1 },
    { id: 'escape', title: 'Escape', text: 'Lose the police. Break line of sight and drive clean until the star drops and the bounty pays. A bust does not count.', target: '',
      test: (c) => c.evasions > c.evadeAt },
    { id: 'steal', title: 'Steal', text: 'Walk up to a traffic car or a parked one. Traffic stops for you. Press F, E, or C, or the big ENTER button. [F] Steal floats on it. A parked break-in is quieter, and only if someone sees you.', target: '#touch .t-enter',
      test: (c) => c.joyride },
    { id: 'owncar', title: 'Your car', text: 'Get back into the car you own. [F] Enter floats on it. F, E, C, or ENTER. Call Car (V) parks it beside you if you cannot find it.', target: '#touch .t-enter',
      test: (c) => c.hadRide && !c.joyride && c.inCar }
  ];

  let root = null, arrow = null, buildingArmed = false, lastStep = -1;

  function save() { return RL.Game && RL.Game.state; }
  function bag() {
    const s = save();
    if (!s) return null;
    if (!s.tutorial || typeof s.tutorial !== 'object') s.tutorial = { on: false, step: 0, proof: 0, done: false };
    if (!s.flags) s.flags = {};
    if (!s.claimed) s.claimed = {};
    return s.tutorial;
  }
  function active() {
    const t = bag();
    return !!(t && t.on && !t.done);
  }
  function stepIndex() {
    const t = bag();
    return t ? RL.clamp(t.step | 0, 0, STEPS.length) : 0;
  }
  function snapshot() {
    const s = save();
    const p = RL.Hub && RL.Hub.player;
    const race = RL.Race && RL.Race.state;
    const pl = race && race.player;
    const mode = RL.Game ? RL.Game.mode : '';
    let building = false;
    if (mode === 'hub' && RL.UI && RL.UI.isOpen() && RL.UI.panelTitle) {
      const title = RL.UI.panelTitle();
      building = !!title && !BLOCK.test(title);
    }
    const joy = !!(p && p.joyride) || !!(s && s.hub && s.hub.joyride);
    return {
      mode: mode,
      inCar: !p || p.inCar !== false,
      speed: p ? Math.abs(p.speed || 0) : 0,
      mapOpen: !!(RL.City && RL.City.mapOpen && RL.City.mapOpen()),
      building: building,
      drifting: !!(pl && pl.drifting),
      driftCur: pl ? pl.driftCur || 0 : 0,
      nitroOn: !!(pl && pl.nitroOn),
      nitroTime: race && race.stats ? race.stats.nitroTime || 0 : 0,
      stars: RL.Wanted && RL.Wanted.stars ? RL.Wanted.stars() : 0,
      evasions: s && s.totals ? (s.totals.evasions || 0) : 0,
      evadeAt: (bag() && bag().evadeAt) || 0,
      joyride: joy,
      hadRide: !!(bag() && bag().hadRide),
      sawRace: !!(bag() && bag().sawRace) || mode === 'race'
    };
  }
  function persist() {
    try { if (RL.Game && RL.Game.save) RL.Game.save(); } catch (e) { /* a full disk should not kill the coach */ }
  }
  function ensure() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'coach';
    root.innerHTML = '<div class="coach-card"><p class="coach-kicker"></p><p class="coach-text"></p><div class="coach-row"><button type="button" class="coach-skip">Skip tutorial</button></div></div>';
    arrow = document.createElement('div');
    arrow.id = 'coach-arrow';
    document.body.appendChild(root);
    document.body.appendChild(arrow);
    root.querySelector('.coach-skip').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); skip(); });
  }
  function hide() {
    if (root) root.hidden = true;
    if (arrow) arrow.hidden = true;
  }
  function placeArrow(sel) {
    if (!arrow) return;
    if (!sel) { arrow.hidden = true; return; }
    const el = document.querySelector(sel);
    if (!el) { arrow.hidden = true; return; }
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) { arrow.hidden = true; return; }
    arrow.hidden = false;
    arrow.style.left = Math.round(r.left + r.width / 2 - 14) + 'px';
    arrow.style.top = Math.round(r.top - 36) + 'px';
  }
  function render() {
    ensure();
    const mapUp = RL.City && RL.City.mapOpen && RL.City.mapOpen();
    if (!active() || (RL.UI && RL.UI.isOpen()) || mapUp) {
      hide();
      return;
    }
    const i = stepIndex();
    if (i >= STEPS.length) { hide(); return; }
    const step = STEPS[i];
    root.hidden = false;
    root.querySelector('.coach-kicker').textContent = 'Tutorial ' + (i + 1) + ' / ' + STEPS.length + ' · ' + step.title;
    root.querySelector('.coach-text').textContent = step.text;
    placeArrow(step.target);
  }
  function advance() {
    const t = bag(); if (!t) return;
    t.proof = (t.proof | 0) | (1 << t.step);
    t.step = (t.step | 0) + 1;
    buildingArmed = false;
    if (STEPS[t.step] && STEPS[t.step].id === 'escape') t.evadeAt = (save().totals && save().totals.evasions) || 0;
    if (STEPS[t.step] && STEPS[t.step].id === 'owncar') t.hadRide = true;
    if (t.step >= STEPS.length) finish();
    else persist();
  }
  function tick() {
    if (typeof document !== 'undefined' && document.body && document.body.classList.contains('view-3d')) { hide(); return; }
    const t = bag();
    if (!t || !t.on || t.done) { hide(); return; }
    const i = stepIndex();
    if (i >= STEPS.length) { finish(); return; }
    if (i !== lastStep) {
      lastStep = i;
      if (STEPS[i].id === 'building') buildingArmed = !(RL.UI && RL.UI.isOpen());
      if (STEPS[i].id === 'escape' && !t.evadeAt) t.evadeAt = (save().totals && save().totals.evasions) || 0;
    }
    const ctx = snapshot();
    if (ctx.mode === 'race') t.sawRace = true;
    if (ctx.joyride) t.hadRide = true;
    if (STEPS[i].id === 'building' && !buildingArmed) {
      if (!(RL.UI && RL.UI.isOpen())) buildingArmed = true;
    } else if (!(STEPS[i].id === 'building' && !buildingArmed) && STEPS[i].test(ctx)) advance();
    render();
  }
  function finish() {
    const s = save(); const t = bag(); if (!s || !t || t.done) return;
    const need = (1 << STEPS.length) - 1;
    t.on = false;
    t.done = true;
    s.flags.tutorialDone = true;
    s.flags.tutorialOffered = true;
    hide();
    if ((t.proof | 0) !== need) { persist(); return; }
    const r = RL.Game.applyChoiceEffects({ money: REWARD, xp: 25, flag: 'tutorialPaid', claim: CLAIM }, CLAIM);
    persist();
    if (r && r.granted && RL.UI) RL.UI.toast('Tutorial complete +' + RL.fmtMoney(REWARD), '#7dff5a');
    else if (RL.UI) RL.UI.toast('Tutorial complete', '#fff');
  }
  function skip() {
    const s = save(); const t = bag(); if (!s || !t) return;
    t.on = false;
    t.done = true;
    s.flags.tutorialOffered = true;
    s.flags.tutorialSkipped = true;
    hide();
    persist();
    if (RL.UI) RL.UI.toast('Tutorial skipped. Replay it from How to Play.', '#fff');
  }
  function startFresh() {
    const s = save(); if (!s) { if (RL.UI) RL.UI.toast('Start a career first'); return; }
    const t = bag();
    t.on = true;
    t.done = false;
    t.step = 0;
    t.proof = 0;
    s.flags.tutorialOffered = true;
    t.hadRide = false;
    t.sawRace = false;
    t.evadeAt = (s.totals && s.totals.evasions) || 0;
    lastStep = -1;
    buildingArmed = false;
    if (RL.Game.mode === 'title') RL.Game.toHub();
    if (RL.UI && RL.UI.isOpen()) RL.UI.closeAll();
    persist();
    render();
  }
  function offerExisting() {
    const s = save(); if (!s || !RL.UI) return;
    const t = bag();
    if (t.on) return;
    if (t.done || s.flags.tutorialDone || s.flags.tutorialOffered || s.flags.tutorialSkipped) return;
    s.flags.tutorialOffered = true;
    persist();
    RL.UI.open({
      title: 'Street tutorial',
      cls: 'help-panel',
      render: () => '<p>A short lesson covers driving, a race, the police, and getting your own car back. It pays once. You can skip it and replay it later from How to Play.</p><div class="row"><button class="primary" data-act="go">Start tutorial</button><button data-act="no">Not now</button></div>',
      acts: {
        go: () => { RL.UI.closeAll(); startFresh(); },
        no: () => { const b = bag(); if (b) { b.done = true; b.on = false; } s.flags.tutorialSkipped = true; RL.Game.save(); RL.UI.back(); }
      }
    });
  }
  function onContinue() {
    const t = bag();
    if (t && t.on && !t.done) { render(); return; }
    offerExisting();
  }
  function loop() { tick(); requestAnimationFrame(loop); }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(loop);

  return {
    startFresh, offerExisting, onContinue, skip, tick, active,
    steps: STEPS.map((s) => s.id),
    reward: REWARD,
    claim: CLAIM,
    index: stepIndex
  };
})();
