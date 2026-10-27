/* drag.js - Drag strip. Launch control, a shift-light minigame, nitro,
   wheelspin and wheelies, quarter and half mile. RL.DragSim is headless.
   Stakes and pink slips go through RL.DragRules so a payout can happen once. */
RL.DragSim = (function () {
  const QUARTER = 402.336, HALF = 804.672, RED = 7600, SWEET = [5000, 6500];
  function defaultSetup() { return { final: 3.55, gears: [3.6, 2.55, 1.9, 1.45, 1.08] }; }
  function powerOf(st) { return 0.92 + (st.accel || 30) / 125 + (st.topSpeed || 30) / 210; }
  function rpmFrom(v) {
    const ratio = v.gears[v.gear] * v.final;
    return Math.max(700, v.speed * ratio * 29.2);
  }
  function finishLine(v) { return v.finishDist > 0 ? v.finishDist : QUARTER; }
  function step(v, throttle, dt, power) {
    if (!v.launched) return;
    v.rpm = rpmFrom(v);
    const rpm = v.rpm;
    let curve;
    if (rpm >= RED) curve = 0.2;
    else if (rpm < 2500) curve = 0.4;
    else if (rpm < 5200) curve = 0.55 + 0.45 * ((rpm - 2500) / 2700);
    else curve = 1 - 0.22 * ((rpm - 5200) / (RED - 5200));
    const ratio = v.gears[v.gear] * v.final;
    if (v.shiftT > 0) {
      v.shiftT -= dt;
      v.speed = Math.max(0, v.speed - 1.1 * dt);
    } else if (throttle) {
      const pull = power * curve * (5.4 + ratio * 1.05);
      const cap = power * curve * 72 / Math.max(5, v.speed);
      let a = Math.min(pull, cap + 4.5) - v.speed * 0.04 - v.speed * v.speed * 0.0018;
      if (v.spin > 0) { v.spin -= dt; a *= 0.55; }
      if (v.bog > 0) { v.bog -= dt; a *= 0.5; }
      if (v.boost > 0) { v.boost -= dt; a *= 1.14; }
      if (v.wheelie > 0) { v.wheelie -= dt; a *= 1.05; }
      if (v.nitroOn && (v.nitro || 0) > 0) {
        v.nitro -= dt * 34;
        if (v.nitro < 0) v.nitro = 0;
        v.nitroT = 0.12;
        a *= 1.2;
      } else v.nitroOn = false;
      if (v.nitroT > 0) v.nitroT -= dt;
      if (rpm >= RED + 150) a = Math.min(a, -0.5);
      else if (rpm >= RED) a = Math.min(a, 0.05);
      v.speed = Math.max(0, v.speed + a * dt);
    } else v.speed = Math.max(0, v.speed - 6 * dt);
    v.dist += v.speed * dt;
    if (v.ft60 == null && v.dist >= 18.288) v.ft60 = v.t;
    const line = finishLine(v);
    if (!v.done && v.dist >= line) { v.done = true; v.et = v.t; v.trapSpeed = v.speed; }
    v.t += dt;
    v.roll = (v.roll || 0) + v.speed * dt * 0.42;
  }
  function shiftQuality(rpm) {
    if (rpm >= 6900 && rpm <= RED + 80) return 'perfect';
    if (rpm >= 6200 && rpm < 6900) return 'good';
    if (rpm > RED + 80) return 'late';
    return 'early';
  }
  function shift(v) {
    if (!v.launched || v.done || v.gear >= v.gears.length - 1 || v.shiftT > 0) return false;
    const q = shiftQuality(v.rpm);
    const prev = v.gears[v.gear] * v.final;
    v.gear++;
    const next = v.gears[v.gear] * v.final;
    v.rpm = Math.max(700, v.rpm * (next / prev));
    v.lastShift = q;
    if (q === 'perfect') {
      v.shiftT = 0.055; v.boost = 0.26; v.perfect++;
      v.nitro = Math.min(100, (v.nitro || 0) + 14);
    } else if (q === 'good') {
      v.shiftT = 0.11; v.boost = 0.1; v.good = (v.good || 0) + 1;
    } else if (q === 'late') {
      v.shiftT = 0.22; v.late = (v.late || 0) + 1;
    } else {
      v.shiftT = 0.2; v.early++; v.bog = Math.max(v.bog || 0, 0.28);
    }
    return q === 'perfect';
  }
  function launchQuality(rpm) {
    if (rpm >= SWEET[0] && rpm <= SWEET[1]) return 'perfect';
    if (rpm > 6900) return 'spin';
    if (rpm < 4200) return 'bog';
    return 'ok';
  }
  function applyLaunch(v, rpm, grip) {
    const q = launchQuality(rpm);
    v.launchQ = q; v.launched = true; v.t = 0; v.speed = 0.3;
    if (q === 'perfect') v.boost = 0.5;
    if (q === 'spin') {
      const g = Number(grip);
      const scale = Number.isFinite(g) ? Math.max(0.45, Math.min(1.15, 1.15 - g / 140)) : 1;
      v.spin = 0.85 * scale;
    }
    if (q === 'bog') v.bog = 0.75;
    v.rpm = rpm;
  }
  function blank(setup, power) {
    return {
      gears: setup.gears.slice(), final: setup.final, power, gear: 0, rpm: 900, speed: 0, dist: 0, t: 0,
      shiftT: 0, boost: 0, spin: 0, bog: 0, wheelie: 0, perfect: 0, early: 0, good: 0, late: 0,
      launched: false, done: false, et: null, foul: false, rt: null, launchQ: null, lastShift: null,
      nitro: 0, nitroOn: false, nitroT: 0, finishDist: QUARTER, trapSpeed: 0, ft60: null, roll: 0, lc: false
    };
  }
  /* Headless run. driver: perfect | bad | foul | long. distance defaults to the quarter. */
  function race(opts) {
    const setup = opts.setup || defaultSetup();
    const power = powerOf(opts.stats || { accel: 35, topSpeed: 30 });
    const skill = opts.skill == null ? 0.9 : opts.skill;
    const dist = opts.distance > 0 ? opts.distance : QUARTER;
    const me = blank(setup, power), opp = blank(defaultSetup(), power * skill);
    me.finishDist = dist; opp.finishDist = dist;
    const kind = opts.driver || 'perfect';
    const myRpm = kind === 'bad' ? 3200 : 5800;
    const myShift = kind === 'bad' ? 4700 : 7200;
    const myReact = kind === 'foul' ? -0.08 : kind === 'bad' ? 0.32 : 0.055;
    const oppRpm = 5600, oppShift = 7050, oppReact = 0.11 + (1 - Math.min(1.2, skill)) * 0.12;
    let tree = 0, launchedMe = false, launchedOpp = false;
    if (kind === 'foul') { me.foul = true; me.rt = myReact; applyLaunch(me, myRpm); launchedMe = true; }
    for (let i = 0; i < 60 * 40; i++) {
      const dt = 1 / 60;
      tree += dt;
      if (!launchedMe && tree >= myReact) { me.rt = myReact; applyLaunch(me, myRpm); launchedMe = true; }
      if (!launchedOpp && tree >= oppReact) { opp.rt = oppReact; applyLaunch(opp, oppRpm); launchedOpp = true; }
      if (launchedOpp && opp.rpm >= oppShift) shift(opp);
      if (launchedMe && me.rpm >= myShift) shift(me);
      step(me, true, dt, me.power);
      step(opp, true, dt, opp.power);
      if (me.done && opp.done) break;
    }
    const total = (v) => (v.rt == null || v.et == null) ? 99 : Math.max(0, v.rt) + v.et;
    let win = false;
    if (me.foul) win = false;
    else if (me.done && (!opp.done || total(me) < total(opp))) win = true;
    const trap = me.trapSpeed || me.speed || 0;
    return {
      win, foul: me.foul, et: me.et, rt: me.rt, total: total(me), oppTotal: total(opp),
      perfectLaunch: me.launchQ === 'perfect', perfectShifts: me.perfect, trap: Math.round(trap * 3.6),
      dist: me.dist, gear: me.gear, ft60: me.ft60, distance: dist
    };
  }
  return {
    QUARTER, HALF, RED, SWEET, defaultSetup, powerOf, step, shift, shiftQuality, launchQuality,
    applyLaunch, blank, race, rpmFrom, finishLine
  };
})();

/* Cash stakes and pink slips. begin() refuses more than the tier cap or the
   cash on hand. settle() pays a win once, grants a prize car once per event,
   and will not delete the last car in the garage. */
RL.DragRules = (function () {
  const STAKE = { 1: 200, 2: 450, 3: 900, 4: 1600 };
  const PINK = { street: 'kei', outlaw: 'coupe', pro: 'dragon', legend: 'euro' };
  const PINK_CASH = 800;
  function stakeFor(league) {
    const n = STAKE[league] || STAKE[1];
    return n;
  }
  function prizeFor(id) { return PINK[id] || null; }
  function canPink(s, eventId) {
    if (!s || !prizeFor(eventId)) return false;
    if (!Array.isArray(s.cars) || s.cars.length < 2) return false;
    const f = s.flags || {};
    if (f['pink_' + eventId] || f['pinkLost_' + eventId]) return false;
    return true;
  }
  function begin(s, opts) {
    opts = opts || {};
    if (!s || typeof s !== 'object') return { ok: false, reason: 'save' };
    if (s.dragStake) return { ok: false, reason: 'pending' };
    const cap = stakeFor(opts.league || 1);
    let amt = Math.round(Number(opts.stake) || 0);
    if (!Number.isFinite(amt) || amt < 0) amt = 0;
    if (amt > cap) amt = cap;
    const money = Number(s.money) || 0;
    if (amt > money) return { ok: false, reason: 'broke' };
    const eventId = String(opts.eventId || '');
    const pink = !!opts.pink && canPink(s, eventId);
    if (amt === 0 && !pink) return { ok: true, amount: 0, pink: false };
    s.money = Math.round(money - amt);
    s.dragStake = {
      amount: amt, pink: pink, eventId: eventId, prizeId: prizeFor(eventId),
      carUid: opts.carUid || null, settled: false
    };
    return { ok: true, amount: amt, pink: pink };
  }
  function settle(s, outcome, makeCar) {
    if (!s || !s.dragStake || s.dragStake.settled) return { ok: false, already: true, paid: 0, car: null, lost: null };
    const stake = s.dragStake;
    stake.settled = true;
    const win = !!(outcome && outcome.win && !outcome.foul);
    const out = { ok: true, already: false, paid: 0, car: null, lost: null, cashInstead: false, win: win };
    if (!s.flags || typeof s.flags !== 'object') s.flags = {};
    if (!s.claimed || typeof s.claimed !== 'object') s.claimed = {};
    if (win) {
      const pay = Math.round((Number(stake.amount) || 0) * 2);
      s.money = Math.round(Math.min(1e9, (Number(s.money) || 0) + pay));
      out.paid = pay;
      if (stake.pink && stake.prizeId && !s.flags['pink_' + stake.eventId]) {
        s.flags['pink_' + stake.eventId] = true;
        s.claimed['pink:' + stake.eventId] = true;
        const owned = Array.isArray(s.cars) && s.cars.some((c) => c && c.id === stake.prizeId);
        if (!owned && typeof makeCar === 'function' && Array.isArray(s.cars)) {
          s.cars.push(makeCar(stake.prizeId));
          out.car = stake.prizeId;
        } else if (owned) {
          s.money = Math.round(Math.min(1e9, s.money + PINK_CASH));
          out.paid += PINK_CASH;
          out.cashInstead = true;
        }
      }
    } else if (stake.pink && Array.isArray(s.cars) && s.cars.length > 1 && !s.flags['pinkLost_' + stake.eventId]) {
      const idx = s.cars.findIndex((c) => c && c.uid === stake.carUid);
      if (idx >= 0 && s.cars.length > 1) {
        out.lost = s.cars[idx].id;
        s.cars.splice(idx, 1);
        if (s.currentCar === stake.carUid && s.cars[0]) s.currentCar = s.cars[0].uid;
        s.flags['pinkLost_' + stake.eventId] = true;
      }
    }
    s.dragStake = null;
    return out;
  }
  function forfeit(s) {
    if (!s || !s.dragStake) return false;
    s.dragStake = null;
    return true;
  }
  return { STAKE, PINK, PINK_CASH, stakeFor, prizeFor, canPink, begin, settle, forfeit };
})();

RL.Drag = (function () {
  const EVENTS = [
    { id: 'street', league: 1, name: 'Friday Night Test', opp: 'Nash', color: '#ffe03b', skill: 0.9 },
    { id: 'outlaw', league: 2, name: 'Harbor Grudge', opp: 'Quick Lila', color: '#ff3b6b', skill: 1.0 },
    { id: 'pro', league: 3, name: 'Pro Tree', opp: 'Boom', color: '#3fa9ff', skill: 1.08 },
    { id: 'legend', league: 4, name: 'Legend Strip', opp: 'Ivy Cross', color: '#ff2ef0', skill: 1.16 }
  ];
  const PX = 12;
  let S = null;

  function setupOf(car) {
    if (!car.drag) car.drag = RL.DragSim.defaultSetup();
    return car.drag;
  }
  function prefs() {
    const s = RL.Game.state;
    if (!s.dragPrefs || typeof s.dragPrefs !== 'object') s.dragPrefs = { half: false, stake: true, pink: false };
    return s.dragPrefs;
  }
  function liveSkill(base) {
    let skill = base || 1;
    try {
      const d = RL.difficulty && RL.difficulty();
      if (d && d.pace) skill *= d.pace;
    } catch (e) { /* settings are optional in a headless race */ }
    return skill;
  }
  function aiMind(skill) {
    const s = Math.max(0.75, Math.min(1.4, skill));
    return {
      react: Math.max(0.04, 0.2 - (s - 0.75) * 0.2),
      launchRpm: 5300 + (s - 0.75) * 1700,
      shiftAt: 6400 + (s - 0.75) * 1200,
      nitro: s >= 1.04
    };
  }
  function showMenu() {
    const G = RL.Game, s = G.state, p = prefs();
    RL.UI.open({
      title: '⏱ Redline Dragway',
      render: () => {
        const car = G.currentCar(), st = G.carStats(car), def = G.carDef(car.id);
        const dist = p.half ? RL.DragSim.HALF : RL.DragSim.QUARTER;
        const est = RL.DragSim.race({ stats: st, setup: setupOf(car), driver: 'perfect', skill: 0.9, distance: dist });
        const stake = p.stake ? RL.DragRules.stakeFor(Math.max(s.league, 1)) : 0;
        let h = '<p>Hold <b>gas and brake</b> together for launch control. Release the brake to start the tree, then stay in the throttle. Shift on the light: green is good, the flash is perfect, red is late. <b>N</b> or Shift is nitro. <b>Q</b>, <b>E</b>, or Space shifts.</p>';
        h += '<p class="small">' + def.name + ' · accel ' + st.accel + ' · top ' + st.topSpeed + ' · grip ' + st.grip + ' · nitro ' + st.nitro + '</p>';
        h += '<p class="small">Perfect-launch window ' + RL.DragSim.SWEET[0] + '–' + RL.DragSim.SWEET[1] + ' rpm. Estimated perfect ET <b class="hl">' + (est.et ? est.et.toFixed(2) + 's' : '--') + '</b> · trap ' + est.trap + ' km/h · ' + (p.half ? '1/2 mile' : '1/4 mile') + '</p>';
        h += '<div class="row">';
        h += '<button data-act="dist" data-arg="0" class="' + (p.half ? '' : 'on') + '">1/4 mile</button>';
        h += '<button data-act="dist" data-arg="1" class="' + (p.half ? 'on' : '') + '">1/2 mile</button>';
        h += '<button data-act="stake">' + (p.stake ? 'Stake on' : 'Stake off') + '</button>';
        h += '<button data-act="pink">' + (p.pink ? 'Pink slip on' : 'Pink slip off') + '</button>';
        h += '<button data-act="gears">Gear ratios</button></div>';
        h += '<p class="small">A stake is deducted when you stage and paid double if you win. Quitting keeps the stake and voids the pink slip. A pink slip adds that rival\'s car once, and only if you still have another car to drive. It never copies a car you already own. Enter stages the first open race. The distance buttons only change the length.</p>';
        let staged = false;
        h += EVENTS.map((e) => {
          const locked = s.league < e.league;
          const buy = p.stake ? RL.DragRules.stakeFor(e.league) : 0;
          const pinkOk = p.pink && RL.DragRules.canPink(s, e.id);
          const afford = s.money >= buy;
          const primary = !locked && afford && !staged;
          if (primary) staged = true;
          return '<div class="card"><div><b>' + e.name + '</b><div class="small">vs ' + e.opp + ' · tier ' + e.league + (buy ? ' · stake ' + RL.fmtMoney(buy) : ' · exhibition') + (pinkOk ? ' · pink ' + (RL.DragRules.prizeFor(e.id)) : '') + '</div></div><div class="btns">' +
            (locked ? '<span class="dim">🔒 League ' + e.league + '</span>' : '<button data-act="go" data-arg="' + e.id + '" class="' + (primary ? 'primary' : '') + '"' + (afford ? '' : ' disabled') + '>Stage</button>') + '</div></div>';
        }).join('');
        return h;
      },
      acts: {
        dist: (a) => { prefs().half = a === '1'; RL.Game.save(); },
        stake: () => { prefs().stake = !prefs().stake; RL.Game.save(); },
        pink: () => { prefs().pink = !prefs().pink; RL.Game.save(); },
        gears: () => showGears(),
        go: (id) => stage(id)
      }
    });
  }
  function stage(id) {
    const e = EVENTS.find((x) => x.id === id);
    if (!e) return;
    const s = RL.Game.state, p = prefs(), car = RL.Game.currentCar();
    if (s.league < e.league) return;
    const stake = p.stake ? RL.DragRules.stakeFor(e.league) : 0;
    const begun = RL.DragRules.begin(s, {
      league: e.league, stake: stake, pink: !!p.pink, eventId: e.id, carUid: car.uid
    });
    if (!begun.ok) {
      RL.UI.toast(begun.reason === 'broke' ? 'Not enough cash for that stake' : 'Finish the open bet first', '#ff8a2e');
      return false;
    }
    RL.Game.save();
    RL.Game.startRace({
      kind: 'drag', league: e.league, title: e.name, dragId: e.id, opp: e.opp, color: e.color,
      skill: e.skill, half: !!p.half, stake: begun.amount, pink: begun.pink
    });
    return true;
  }
  function affordableEvent() {
    const s = RL.Game.state;
    if (!s) return null;
    const p = prefs();
    for (let i = 0; i < EVENTS.length; i++) {
      const e = EVENTS[i];
      if (s.league < e.league) continue;
      const buy = p.stake ? RL.DragRules.stakeFor(e.league) : 0;
      if (s.money >= buy) return e;
    }
    return null;
  }
  function quickStage() {
    const e = affordableEvent();
    if (!e) { showMenu(); return false; }
    const ok = stage(e.id);
    if (!ok) showMenu();
    return !!ok;
  }
  function showGears() {
    const car = RL.Game.currentCar();
    RL.UI.open({
      title: 'Gear Ratios',
      render: () => {
        const d = setupOf(car);
        const est = RL.DragSim.race({ stats: RL.Game.carStats(car), setup: d, driver: 'perfect', skill: 0.9 });
        let h = '<p class="small">Higher numbers multiply torque and spin the tach faster. Final drive moves every gear. These ratios are the ones the strip uses.</p>';
        h += '<div class="tune"><span>Final ' + d.final.toFixed(2) + '</span><button data-act="f" data-arg="-1">−</button><button data-act="f" data-arg="1">+</button></div>';
        d.gears.forEach((g, i) => {
          h += '<div class="tune"><span>' + (i + 1) + ' · ' + g.toFixed(2) + '</span><button data-act="g" data-arg="' + i + ',-1">−</button><button data-act="g" data-arg="' + i + ',1">+</button></div>';
        });
        h += '<p class="small">Perfect ET ' + (est.et ? est.et.toFixed(2) + 's' : '--') + ' · trap ' + est.trap + ' km/h · ' + (est.win ? 'beats Nash' : 'loses to Nash') + '</p>';
        return h;
      },
      acts: {
        f: (a) => { const d = setupOf(car); d.final = RL.clamp(Math.round((d.final + Number(a) * 0.1) * 100) / 100, 2.6, 4.8); RL.Game.state.totals.tuned = (RL.Game.state.totals.tuned || 0) + 1; if (RL.Game.unlockAch) RL.Game.unlockAch('sp_tuner'); RL.Game.save(); },
        g: (a) => {
          const [i, dir] = a.split(',').map(Number), d = setupOf(car);
          d.gears[i] = RL.clamp(Math.round((d.gears[i] + dir * 0.05) * 100) / 100, 0.7, 4.2);
          RL.Game.state.totals.tuned = (RL.Game.state.totals.tuned || 0) + 1;
          if (RL.Game.unlockAch) RL.Game.unlockAch('sp_tuner');
          RL.Game.save();
        }
      }
    });
  }
  function start(cfg) {
    const G = RL.Game, car = G.currentCar(), st = G.carStats(car);
    const dist = cfg.half ? RL.DragSim.HALF : RL.DragSim.QUARTER;
    const me = RL.DragSim.blank(setupOf(car), RL.DragSim.powerOf(st));
    me.finishDist = dist;
    me.grip = st.grip || 40;
    me.nitro = Math.min(100, 28 + (st.nitro || 30) * 0.55);
    if (RL.hasPerk && RL.hasPerk('double_tank')) me.nitro = 100;
    const skill = liveSkill(cfg.skill || 1);
    const opp = RL.DragSim.blank(RL.DragSim.defaultSetup(), me.power * skill);
    opp.finishDist = dist;
    opp.nitro = skill >= 1.04 ? 70 : 30;
    S = {
      cfg, me, opp, skill, mind: aiMind(skill), phase: 'stage', phaseT: 0, treeT: 0, t: 0, paused: false,
      msgs: [{ text: 'STAGE', t: 1.4, color: '#ffe03b' }], playerName: G.state.name, oppName: cfg.opp || 'Rival',
      oppColor: cfg.color || '#ff3b6b', lockedRpm: 900, resultSent: false, camX: 0, shake: 0, smoke: [],
      flashes: [], deal: null, half: !!cfg.half, body: G.carDef(car.id).cls || 'Coupe',
      playerColor: G.carColor(car),       lcHold: 0, shiftCount: 0, transbrake: false
    };
    try { RL.Audio.startEngine(); } catch (e) { }
  }
  function stop() { if (S) { try { RL.Audio.stopEngine(); } catch (e) { } } S = null; }
  function input() {
    const I = RL.Input;
    const shift = I.hit('shift') || I.hit('action') || I.hit('drift');
    const nitro = I.hit('nitro') || I.down('nitro');
    return { gas: I.down('up'), brake: I.down('down'), shift, nitro };
  }
  function puff(x, y, n) {
    if (!S) return;
    for (let i = 0; i < n; i++) S.smoke.push({ x: x + Math.random() * 10, y: y + (Math.random() - 0.5) * 10, life: 0.5 + Math.random() * 0.4, s: 6 + Math.random() * 10 });
    if (S.smoke.length > 80) S.smoke.splice(0, S.smoke.length - 80);
  }
  function say(text, color, t) { if (S) S.msgs.push({ text: text, t: t || 1, color: color || '#fff' }); }
  function update(dt) {
    if (!S || S.paused) return;
    if (RL.Input.hit('pause') && S.phase !== 'done') {
      S.paused = true;
      RL.UI.open({ title: 'Paused', onClose: () => { if (S) S.paused = false; }, render: () => '<p class="small">Quitting forfeits the stake. The pink slip is void. Your garage stays as it is.</p><div class="row"><button class="primary" data-act="resume">Resume</button><button data-act="quit">Quit</button></div>', acts: { resume: () => RL.UI.closeAll(), quit: () => { RL.UI.closeAll(); RL.Game.toHub(); } } });
      return;
    }
    if (RL.UI.isOpen()) return;
    const inp = input();
    S.phaseT += dt; S.t += dt;
    const me = S.me, opp = S.opp, mind = S.mind;
    if (S.phase === 'stage') {
      if (S.phaseT > 1.05) { S.phase = 'rev'; S.phaseT = 0; say('HOLD GAS + BRAKE — launch control', '#2ee6ff', 2.2); }
    } else if (S.phase === 'rev') {
      const sweet = (RL.DragSim.SWEET[0] + RL.DragSim.SWEET[1]) / 2;
      if (inp.gas && inp.brake) {
        S.lcHold += dt;
        me.rpm += (sweet - me.rpm) * Math.min(1, 8 * dt);
        me.lc = S.lcHold > 0.28;
        if (me.lc && S.lcHold > 0.42) {
          S.lockedRpm = sweet;
          S.phase = 'tree'; S.treeT = 0; S.phaseT = 0; S.transbrake = true;
          say('LAUNCH CONTROL — release brake on green', '#7dff5a', 1.5);
        }
      } else if (inp.gas) {
        S.lcHold = 0; me.lc = false;
        me.rpm = Math.min(8200, me.rpm + (1400 + me.power * 900) * dt);
      } else {
        S.lcHold = 0; me.lc = false;
        me.rpm = Math.max(900, me.rpm - 1100 * dt);
      }
      if (S.phase === 'rev' && ((inp.brake && !inp.gas && S.phaseT > 0.2) || S.phaseT > 6)) {
        S.lockedRpm = me.rpm;
        S.phase = 'tree'; S.treeT = 0; S.phaseT = 0; S.transbrake = false;
      }
    } else if (S.phase === 'tree') {
      S.treeT += dt;
      me.rpm = S.lockedRpm;
      const greenAt = 2;
      const dropped = S.transbrake ? !inp.brake : inp.gas;
      if (dropped && !me.launched) {
        me.rt = S.treeT - greenAt;
        if (me.rt < -0.02) me.foul = true;
        RL.DragSim.applyLaunch(me, S.lockedRpm, me.grip);
        if (me.launchQ === 'perfect' && me.power > 1.02) me.wheelie = 0.72;
        S.shake = Math.max(S.shake, me.launchQ === 'perfect' ? 10 : 6);
        if (me.launchQ === 'spin' || me.wheelie > 0) puff(8, 36, 8);
        if (me.launchQ === 'perfect') say(me.wheelie > 0 ? 'PERFECT LAUNCH — WHEELIE' : 'PERFECT LAUNCH', '#7dff5a', 1.2);
        else if (me.foul) say('REDLIGHT', '#ff3b6b', 1.4);
        else if (me.launchQ === 'spin') say('WHEELSPIN', '#ff8a2e', 1);
        else if (me.launchQ === 'bog') say('BOGGED', '#ff8a2e', 1);
        else say('GOOD LIGHT', '#ffe03b', 0.8);
      }
      if (!opp.launched && S.treeT >= 2 + mind.react) {
        opp.rt = mind.react;
        RL.DragSim.applyLaunch(opp, mind.launchRpm);
      }
      if (me.launched || opp.launched) S.phase = 'run';
    } else if (S.phase === 'run') {
      if (!opp.launched && S.treeT >= 2 + mind.react) {
        opp.rt = mind.react;
        RL.DragSim.applyLaunch(opp, mind.launchRpm);
      }
      S.treeT += dt;
      if (inp.shift) {
        const was = me.perfect + me.good + me.late + me.early;
        RL.DragSim.shift(me);
        const now = me.perfect + me.good + me.late + me.early;
        if (now > was && me.lastShift) {
          S.shake = Math.max(S.shake, me.lastShift === 'perfect' ? 7 : 3);
          const label = { perfect: 'PERFECT SHIFT', good: 'GOOD SHIFT', late: 'LATE', early: 'EARLY' }[me.lastShift];
          const col = { perfect: '#ffe03b', good: '#7dff5a', late: '#ff3b6b', early: '#ff8a2e' }[me.lastShift];
          if (label) say(label, col, 0.7);
          if (me.perfect > S.shiftCount) S.flashes.push({ t: 0.25 });
          S.shiftCount = me.perfect;
        }
      }
      if (inp.nitro && me.launched && (me.nitro || 0) > 1 && !me.nitroOn) {
        me.nitroOn = true;
        say('NITRO', '#3fa9ff', 0.6);
        S.shake = Math.max(S.shake, 5);
      }
      if (!inp.nitro) me.nitroOn = false;
      if (opp.launched && opp.rpm >= mind.shiftAt) RL.DragSim.shift(opp);
      if (mind.nitro && opp.launched && opp.dist > opp.finishDist * 0.35 && (opp.nitro || 0) > 0) opp.nitroOn = true;
      RL.DragSim.step(me, !!(inp.gas || (me.launched && me.t < 0.08)), dt, me.power);
      RL.DragSim.step(opp, true, dt, opp.power);
      if (me.spin > 0 || (me.wheelie > 0 && me.speed > 8)) puff(me.dist * PX, 40, 1);
      if ((me.done && opp.done) || S.t > (S.half ? 36 : 26)) finish();
    }
    S.msgs.forEach((m) => (m.t -= dt)); S.msgs = S.msgs.filter((m) => m.t > 0);
    S.smoke.forEach((p) => { p.life -= dt; p.x -= me.speed * dt * 0.15; p.s += dt * 18; });
    S.smoke = S.smoke.filter((p) => p.life > 0);
    S.shake = Math.max(0, S.shake - dt * 18);
    const focus = me.launched ? me.dist * PX : 0;
    S.camX += (focus - S.camX) * Math.min(1, (8 + me.speed * 0.08) * dt);
    try { RL.Audio.updateEngine(RL.clamp((me.rpm || 0) / 8000, 0, 1), !!me.nitroOn, false); } catch (e) { }
  }
  function finish() {
    if (!S || S.resultSent) return;
    S.resultSent = true; S.phase = 'done';
    const me = S.me, opp = S.opp;
    const myTotal = (me.et == null) ? 99 : Math.max(0, me.rt || 0) + me.et;
    const oppTotal = (opp.et == null) ? 98 : Math.max(0, opp.rt || 0) + opp.et;
    const win = !me.foul && me.done && myTotal < oppTotal;
    const trap = Math.round((me.trapSpeed || me.speed || 0) * 3.6);
    const notes = [];
    if (me.foul) notes.push('REDLIGHT — automatic loss');
    if (me.et) notes.push('ET ' + me.et.toFixed(3) + 's · RT ' + (me.rt != null ? (me.rt >= 0 ? '+' : '') + me.rt.toFixed(3) : '--') + 's · trap ' + trap + ' km/h');
    if (me.ft60 != null) notes.push('60 ft ' + me.ft60.toFixed(3) + 's');
    const bits = [];
    if (me.perfect) bits.push(me.perfect + ' perfect');
    if (me.good) bits.push(me.good + ' good');
    if (me.late) bits.push(me.late + ' late');
    if (me.early) bits.push(me.early + ' early');
    if (bits.length) notes.push('Shifts: ' + bits.join(', '));
    notes.push(S.half ? 'Half mile' : 'Quarter mile');
    let deal = { paid: 0, car: null, lost: null };
    try {
      deal = RL.DragRules.settle(RL.Game.state, { win: win, foul: !!me.foul }, (id) => ({
        uid: RL.uid(), id: id, damage: 0, parts: {}, tune: { gear: 0, aero: 0 }, drag: RL.DragSim.defaultSetup()
      })) || deal;
    } catch (e) { deal = { paid: 0 }; }
    if (deal.paid) notes.push('Stake paid ' + RL.fmtMoney(deal.paid));
    else if (RL.Game.state && S.cfg && S.cfg.stake) notes.push('Stake lost');
    if (deal.car) {
      const def = RL.Game.carDef(deal.car);
      notes.push('Pink slip: ' + (def ? def.name : deal.car));
    } else if (deal.cashInstead) notes.push('You already own that car. Pink slip paid cash once.');
    if (deal.lost) {
      const def = RL.Game.carDef(deal.lost);
      notes.push('They took your ' + (def ? def.name : 'car'));
    }
    RL.Game.finishRace({
      cfg: S.cfg, position: win ? 1 : 2, cars: 2, finished: !!me.done, totalTime: myTotal, bestLap: null,
      drift: 0, damageEnd: RL.Game.currentCar().damage, damageTaken: 0, wallHits: 0, carHits: 0,
      nitroTime: me.nitroT || 0, draftTime: 0, topSpeed: trap, cleanLaps: 0, wasLast: false,
      et: me.et, rt: me.rt, trap: trap, foul: me.foul, perfectLaunch: me.launchQ === 'perfect', perfectShifts: me.perfect,
      extraNotes: notes,
      standings: [
        { name: S.playerName, isPlayer: true, time: me.et, out: false },
        { name: S.oppName, isPlayer: false, time: opp.et, out: false }
      ]
    });
  }
  function forceFinish() {
    if (!S) return;
    S.me.done = true; S.me.et = S.me.et || 14; S.me.dist = S.me.finishDist || RL.DragSim.QUARTER;
    S.opp.done = true; S.opp.et = 15; S.me.foul = false;
    finish();
  }
  function shade(hex, m) {
    const n = parseInt(String(hex || '#ffffff').replace('#', ''), 16);
    if (!Number.isFinite(n)) return '#ffffff';
    const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * m));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * m));
    const b = Math.max(0, Math.min(255, (n & 255) * m));
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  function drawWheel(ctx, x, y, roll, smoke) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#0c0c0c';
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.fill();
    ctx.strokeStyle = smoke ? '#8d8d8d' : '#3a3a3a';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.stroke();
    ctx.fillStyle = smoke ? '#6a6a6a' : '#1c1c1c';
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill();
    ctx.rotate(roll || 0);
    ctx.strokeStyle = '#e7eef8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = i * (Math.PI * 2 / 5);
      ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
      ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
    }
    ctx.stroke();
    ctx.fillStyle = '#c5ccd6';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffe03b';
    ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawFlame(ctx, x, y, t, hot) {
    const flick = 8 + Math.sin(t * 40) * 4;
    ctx.fillStyle = hot ? '#7af0ff' : '#ff8a2e';
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x - flick - 6, y);
    ctx.lineTo(x, y + 3);
    ctx.fill();
    ctx.fillStyle = hot ? '#ffffff' : '#ffe03b';
    ctx.beginPath();
    ctx.moveTo(x, y - 1.5);
    ctx.lineTo(x - flick, y);
    ctx.lineTo(x, y + 1.5);
    ctx.fill();
  }
  function drawStripCar(ctx, v, y, color, opts) {
    const x = Math.max(0, v.dist) * PX;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(2.15, 2.15);
    const tilt = (v.wheelie || 0) > 0 ? -0.32 * Math.min(1, v.wheelie / 0.45) : 0;
    ctx.rotate(tilt);
    if (v.speed > 18) {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = color;
      ctx.fillRect(-58, -8, 16, 14);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(6, 16, 36, 4, 0, 0, 7); ctx.fill();
    const roll = v.roll || 0;
    const lifted = tilt < -0.08;
    drawWheel(ctx, 26, 8, roll, v.spin > 0);
    if (!lifted) drawWheel(ctx, -22, 8, roll, v.spin > 0);
    const g = ctx.createLinearGradient(-46, -20, 40, 12);
    g.addColorStop(0, shade(color, 0.45));
    g.addColorStop(0.22, shade(color, 0.85));
    g.addColorStop(0.48, color);
    g.addColorStop(0.62, shade(color, 1.45));
    g.addColorStop(1, shade(color, 0.35));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-44, 8);
    ctx.quadraticCurveTo(-46, 2, -38, -1);
    ctx.lineTo(-20, -3);
    ctx.lineTo(-10, -16);
    ctx.quadraticCurveTo(2, -20, 16, -16);
    ctx.lineTo(28, -4);
    ctx.lineTo(46, -2);
    ctx.lineTo(48, 4);
    ctx.lineTo(44, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-30, -1); ctx.lineTo(20, -2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(-28, 1, 24, 2);
    ctx.fillStyle = '#b9f3ff';
    ctx.beginPath();
    ctx.moveTo(-8, -15);
    ctx.lineTo(14, -15);
    ctx.lineTo(22, -5);
    ctx.lineTo(-2, -5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(180,240,255,0.45)';
    ctx.beginPath();
    ctx.moveTo(-4, -14); ctx.lineTo(6, -14); ctx.lineTo(4, -8); ctx.lineTo(-5, -8); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(8,16,28,0.45)';
    ctx.fillRect(2, -13, 7, 6);
    ctx.strokeStyle = shade(color, 0.3);
    ctx.beginPath(); ctx.moveTo(8, -4); ctx.lineTo(8, 7); ctx.stroke();
    if (opts.spoiler) {
      ctx.fillStyle = shade(color, 0.3);
      ctx.fillRect(-42, -8, 3, 12);
      ctx.fillRect(-50, -11, 14, 3);
    }
    ctx.fillStyle = '#fff6c2';
    ctx.fillRect(44, -1, 6, 2.5);
    ctx.fillRect(44, 3, 6, 2.5);
    ctx.fillStyle = 'rgba(255,246,194,0.35)';
    ctx.fillRect(50, -2, 10, 9);
    ctx.fillStyle = v.nitroOn ? '#7af0ff' : '#ff3b6b';
    ctx.fillRect(-44, 0, 5, 2.4);
    ctx.fillRect(-44, 4, 5, 2.4);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-48, 1, 5, 2);
    ctx.fillRect(-48, 5, 5, 2);
    if (opts.flame || v.nitroOn || (v.boost || 0) > 0) {
      drawFlame(ctx, -48, 2, S.t, !!v.nitroOn);
      drawFlame(ctx, -48, 6, S.t + 0.4, !!v.nitroOn);
    }
    if (lifted) drawWheel(ctx, -22, 8, roll, v.spin > 0);
    if (v.nitroOn || (v.nitroT || 0) > 0) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      const glow = ctx.createRadialGradient(-24, 2, 2, -16, 2, 36);
      glow.addColorStop(0, '#e8ffff');
      glow.addColorStop(0.35, '#7af0ff');
      glow.addColorStop(1, 'rgba(122,240,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(-70, -24, 60, 44);
      ctx.restore();
    }
    ctx.restore();
  }
  function draw(ctx) {
    if (!S) return;
    const view = RL.Game.view(ctx), W = view.W, H = view.H, me = S.me, opp = S.opp;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2a1450');
    sky.addColorStop(0.42, '#4a2068');
    sky.addColorStop(0.72, '#1a2048');
    sky.addColorStop(1, '#101018');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const sh = S.shake || 0;
    const jx = (Math.random() - 0.5) * sh, jy = (Math.random() - 0.5) * sh * 0.6;
    ctx.save();
    ctx.translate(jx, jy);
    const speed = me.speed || 0;
    const blur = Math.min(1, speed / 80);
    ctx.save();
    ctx.translate(W * 0.3 - S.camX, H * 0.58);
    const line = me.finishDist || RL.DragSim.QUARTER;
    /* Stands and skyline sit in the world so they streak backward. */
    for (let i = -2; i < 28; i++) {
      const bx = i * 220;
      ctx.fillStyle = i % 2 ? '#3a1860' : '#4a2078';
      ctx.fillRect(bx, -250, 200, 100);
      ctx.fillStyle = '#ffd23b';
      ctx.fillRect(bx, -252, 200, 6);
      ctx.fillStyle = '#ff7ad9';
      for (let w = 0; w < 8; w++) {
        ctx.fillStyle = ['#ffe03b', '#2ee6ff', '#ff7ad9'][w % 3];
        ctx.fillRect(bx + 14 + w * 22, -236 + ((i + w) % 3) * 10, 10, 16);
      }
    }
    ctx.fillStyle = '#5a4568';
    ctx.fillRect(-400, -148, line * PX + 900, 48);
    ctx.fillRect(-400, 86, line * PX + 900, 48);
    for (let i = 0; i < 48; i++) {
      const sx = i * 140 - 80;
      ctx.fillStyle = i % 2 ? '#2a1848' : '#3a2060';
      ctx.fillRect(sx, -168, 128, 36);
      ctx.fillRect(sx, 100, 128, 36);
      ctx.fillStyle = '#ffd23b';
      ctx.fillRect(sx, -170, 128, 4);
      ctx.fillRect(sx, 98, 128, 4);
      for (let p = 0; p < 7; p++) {
        ctx.fillStyle = ['#ff3b6b', '#ffe03b', '#2ee6ff', '#7dff5a', '#ff8a2e', '#ffffff'][(i + p) % 6];
        const bob = Math.sin(S.t * 4 + p + i) * 2;
        ctx.fillRect(sx + 8 + p * 16, -158 + bob, 8, 12);
        ctx.fillRect(sx + 8 + p * 16, 108 + bob, 8, 12);
      }
    }
    ctx.fillStyle = '#6a7388';
    ctx.fillRect(-240, -92, line * PX + 700, 176);
    ctx.fillStyle = '#3e465c';
    ctx.fillRect(-220, -82, line * PX + 660, 156);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(-220, -72, line * PX + 660, 3);
    ctx.fillRect(-220, 62, line * PX + 660, 3);
    ctx.fillStyle = '#ffe03b';
    ctx.fillRect(-220, -4, line * PX + 660, 3);
    const dash = 26 - blur * 10;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + blur * 0.4) + ')';
    for (let x = -((S.camX * 0.2) % 80); x < line * PX + 200; x += 70) {
      ctx.fillRect(x, -40, dash, 3);
      ctx.fillRect(x, 34, dash, 3);
    }
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 10; i++) ctx.fillRect(-6 + (i % 2) * 8, -70 + i * 14, 8, 14);
    ctx.fillStyle = '#ff3b6b';
    ctx.fillRect(line * PX, -78, 8, 150);
    ctx.fillStyle = '#ffe03b';
    ctx.font = 'bold 14px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(S.half ? '1/2 MILE' : '1/4 MILE', line * PX, -88);
    [[18.3, '60'], [201, '1/8'], [402.3, '1320']].forEach((m) => {
      if (m[0] > line + 5) return;
      ctx.fillStyle = '#9fb3c8';
      ctx.fillRect(m[0] * PX, -78, 2, 12);
      ctx.font = '11px sans-serif';
      ctx.fillText(m[1], m[0] * PX, -84);
    });
    S.smoke.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = '#d5dbe3';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    });
    const spoiler = S.body !== 'Hatchback' && S.body !== 'Kei';
    drawStripCar(ctx, opp, -36, S.oppColor, { spoiler: true, flame: opp.launched && opp.shiftT <= 0 });
    drawStripCar(ctx, me, 34, S.playerColor, { spoiler: spoiler, flame: me.launched && me.shiftT <= 0 && (me.rpm > 4000) });
    ctx.restore();

    if (blur > 0.08) {
      ctx.save();
      ctx.globalAlpha = 0.25 + blur * 0.55;
      ctx.strokeStyle = '#f4fbff';
      ctx.lineWidth = 3;
      for (let i = 0; i < 22; i++) {
        const y = (i * 73 + S.t * (180 + speed * 8)) % H;
        const len = 70 + blur * 280;
        const x0 = (i % 2 ? W - 10 : 30);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 - len * (i % 2 ? 1 : -1), y);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 42px Trebuchet MS, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round((me.speed || 0) * 3.6) + '', W - 28, 118);
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('KM/H', W - 28, 138);

    drawTree(ctx, 28, H * 0.28);
    drawTach(ctx, W, H, me);
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px Trebuchet MS, sans-serif';
    S.msgs.forEach((m, i) => { ctx.fillStyle = m.color; ctx.fillText(m.text, W / 2, H * 0.16 + i * 26); });
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    const lineM = Math.round(me.finishDist || RL.DragSim.QUARTER);
    ctx.fillText((me.dist || 0).toFixed(0) + ' / ' + lineM + ' m', W / 2, 32);
    if (me.launched) ctx.fillText((me.t || 0).toFixed(2) + 's', W / 2, 54);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#9fb3c8';
    ctx.fillText(S.playerName + '  vs  ' + S.oppName + '   ·   Q/E/Space shift   ·   N nitro', W / 2, 76);
    ctx.restore();
  }
  function drawTree(ctx, x, y) {
    ctx.fillStyle = '#1a1028';
    ctx.fillRect(x, y, 70, 250);
    ctx.strokeStyle = '#ff2ef0';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, 67, 247);
    ctx.lineWidth = 1;
    const ambers = S.phase === 'tree' || S.phase === 'run' ? Math.min(3, Math.floor(S.treeT / 0.5)) : 0;
    const green = S.treeT >= 2 && (S.phase === 'tree' || S.phase === 'run');
    const bulbs = [
      S.phase !== 'stage',
      S.phase === 'tree' || S.phase === 'run',
      ambers > 0 && !green, ambers > 1 && !green, ambers > 2 && !green,
      green && !S.me.foul
    ];
    const cols = ['#f4f4f4', '#f4f4f4', '#ffe03b', '#ffe03b', '#ffe03b', S.me.foul ? '#ff3b6b' : '#7dff5a'];
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = bulbs[i] ? cols[i] : '#241c30';
      ctx.beginPath(); ctx.arc(x + 18, y + 22 + i * 30, 8, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 36, y + 22 + i * 30, 8, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#9fb3c8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TREE', x + 27, y + 202);
  }
  function drawTach(ctx, W, H, me) {
    ctx.fillStyle = 'rgba(8,6,24,0.82)';
    ctx.fillRect(16, H - 132, 340, 112);
    ctx.strokeStyle = '#2ee6ff';
    ctx.strokeRect(16.5, H - 131.5, 339, 111);
    const rpm = me.rpm || 0;
    const q = me.launched ? RL.DragSim.shiftQuality(rpm) : '';
    ctx.fillStyle = 'rgba(125,255,90,0.22)';
    ctx.fillRect(24 + (6200 / 8200) * 230, H - 70, ((6900 - 6200) / 8200) * 230, 18);
    ctx.fillStyle = 'rgba(255,224,59,0.35)';
    ctx.fillRect(24 + (6900 / 8200) * 230, H - 70, ((RL.DragSim.RED - 6900) / 8200) * 230, 18);
    if (!me.launched) {
      ctx.fillStyle = 'rgba(125,255,90,0.28)';
      ctx.fillRect(24 + (RL.DragSim.SWEET[0] / 8200) * 230, H - 70, ((RL.DragSim.SWEET[1] - RL.DragSim.SWEET[0]) / 8200) * 230, 18);
    }
    ctx.fillStyle = rpm > RL.DragSim.RED ? '#ff3b6b' : '#ffe03b';
    ctx.fillRect(24, H - 70, Math.min(230, (rpm / 8200) * 230), 18);
    const light = !me.launched ? (me.lc ? '#7dff5a' : '#3a3050') : ({ perfect: '#ffe03b', good: '#7dff5a', late: '#ff3b6b', early: '#ff8a2e' }[q] || '#3a3050');
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.arc(300, H - 78, 22, 0, 7); ctx.fill();
    ctx.fillStyle = '#120c18';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(me.launched ? (q || '').toUpperCase() : (me.lc ? 'LC' : 'REV'), 300, H - 75);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px Trebuchet MS, sans-serif';
    ctx.fillText((me.gear + 1) + ' GEAR', 24, H - 100);
    ctx.font = '14px sans-serif';
    ctx.fillText(Math.round(rpm) + ' rpm', 150, H - 96);
    ctx.fillStyle = '#3fa9ff';
    ctx.fillRect(24, H - 42, Math.max(0, Math.min(200, (me.nitro || 0) * 2)), 8);
    ctx.strokeStyle = '#3fa9ff';
    ctx.strokeRect(24, H - 42, 200, 8);
    ctx.fillStyle = '#9fb3c8';
    ctx.font = '11px sans-serif';
    ctx.fillText('NITRO', 230, H - 35);
  }
  return {
    start, update, draw, stop, forceFinish, showMenu, showGears, quickStage,
    get state() { return S; }, EVENTS
  };
})();
