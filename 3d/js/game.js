/* game.js — mode switch, fixed-step sim, and the per-frame presentation
   (chase cam, atmosphere, HUD). Race, drag and the city all render through
   the same WebGL context; this file decides which one is awake. */

import { RL } from './data.js';
import { career, setStateHooks, setBeforeSave } from './state.js';
import { settings } from './settings.js';
import { audio } from './audio.js';
import { input } from './input.js';
import { gfx } from './renderer.js';
import { createFx } from './particles.js';
import { buildCity } from './city.js';
import { applyRoadWeather } from './track.js';
import { hub } from './hub.js';
import { race } from './race.js';
import { drag } from './drag.js';
import { photo } from './photo.js';
import { ui, actions } from './ui.js';
import { clockString, fmtTime } from './util.js';
import * as THREE from 'three';
import { wanted } from './wanted.js';
import { starLabel } from './heat.js';
import { roles, rankName } from './roles.js';
import { editor } from './editor.js';
import { get as getTrack } from './tracks.js';
import { wrecks } from './wrecks.js';

const $ = (id) => document.getElementById(id);
const STEP = 1 / 60;
function escapeHud(s) {
  return String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

export const game = {
  mode: 'title',
  city: null,
  fx: null,
  weather: 'clear',
  weatherT: 20,
  running: false,
  lastCfg: null,

  boot() {
    settings.load();
    input.setup();
    setStateHooks({ toast: (t, c) => ui.toast(t, c), play: (n) => audio.play(n) });
    setBeforeSave(() => wanted.capture());
    ui.init();
    gfx.init($('view'));
    photo.install();
    this.fx = createFx(gfx.scene);
    this.fx.setBudget(settings.quality().particles, settings.quality().weather);
    this.city = buildCity();
    gfx.world.add(this.city.group);
    this.city.setBuildingShadows(settings.quality().buildingShadows);
    const savedCam = settings.data && settings.data.camera;
    if (savedCam === 'first' || savedCam === 'second' || savedCam === 'third' || savedCam === 'top') {
      gfx.view = savedCam;
      gfx.pip = savedCam === 'second';
    }
    this._bindActions();
    hub.onPoi = (id) => this._poi(id);
    hub.onMark = (mark) => ui.showPlace(mark.name, mark.blurb || mark.text || '');
    actions.playerHp = () => (hub.player && hub.player.hp != null ? hub.player.hp : 100);
    actions.healPlayer = () => { if (hub.player) hub.player.hp = 100; };
    actions.syncDamage = () => {
      const car = career.currentCar();
      if (hub.player && car && !hub.player.stolen) hub.player.damage = car.damage;
    };
    hub.onDrag = () => this.startDrag();
    hub.onStreetFinish = (res) => this._finished(res);
    race.onFinish = (res) => this._finished(res);
    drag.onFinish = (res) => this._finished(res);
    editor.onTest = (def) => {
      this._editorDraft = def;
      this.returnTo = 'editor';
      this.startRace({
        kind: 'custom', customDef: def, title: def.name || 'Test', laps: 2, aiCount: 1, aiDiff: 0.85,
        weather: 'clear', time: 'day', damage: true, nitro: true, traffic: false, collisions: true,
        carClass: 'current', league: career.state ? career.state.league : 1, ignoreImpound: true
      });
    };
    editor.onExit = () => this.closeEditor();
    editor.onSaved = () => {
      if (career.state) { career.state.flags.trackSaved = true; career.checkAchievements(); career.save(); }
    };
    ui.setMode('title');
    this.running = true;
    gfx.setAtmosphere({ time: 0.72, weather: 'clear', theme: 'city' });
  },

  _bindActions() {
    actions.newGame = (name, opt) => {
      wanted.reset();
      career.newState(name);
      if (hub.player) hub.dispose();
      hub.enter(this.city, this.fx);
      this.mode = 'hub';
      this._showCity(true);
      ui.setMode('hub');
      ui.closeAll();
      audio.startMusic('hub');
      audio.startEngine();
      if (!opt || opt.story !== false) importStory();
    };
    actions.continue = () => {
      if (!career.load()) return;
      if (hub.player) hub.dispose();
      hub.enter(this.city, this.fx);
      wanted.restore();
      this.mode = 'hub';
      this._showCity(true);
      ui.setMode('hub');
      ui.closeAll();
      ui.toast('Welcome back, ' + career.state.name);
      audio.startMusic('hub');
      audio.startEngine();
    };
    actions.resumeShared = () => {
      if (!career.load()) return false;
      if (hub.player) hub.dispose();
      hub.enter(this.city, this.fx);
      wanted.restore();
      this.mode = 'hub';
      this._showCity(true);
      ui.setMode('hub');
      ui.closeAll();
      audio.startMusic('hub');
      audio.startEngine();
      return true;
    };
    actions.cycleCam = () => this._cycleCam();
    actions.setCamera = (id) => this.setCamera(id);
    actions.setTopNorth = (on) => this.setTopNorth(on);
    actions.toTitle = () => {
      this._leavePlay();
      this.mode = 'title';
      ui.setMode('title');
      audio.stopMusic();
      audio.stopEngine();
    };
    actions.toHub = () => {
      if (this.returnTo === 'editor') {
        this.returnTo = null;
        const draft = this._editorDraft;
        race.stop();
        drag.stop();
        this.openEditor(draft);
        return;
      }
      this.toHub();
    };
    actions.editor = (def) => this.openEditor(def);
    actions.startRace = (cfg) => this.startRace(cfg);
    actions.startDrag = () => this.startDrag();
    actions.photo = () => this.togglePhoto();
    actions.photoUi = (cmd, arg) => this._photoUi(cmd, arg);
    actions.quality = () => {
      gfx.applyQuality(settings.data.quality);
      this.fx.setBudget(settings.quality().particles, settings.quality().weather);
      this.city.setBuildingShadows(settings.quality().buildingShadows);
    };
    actions.weather = (w) => { if (w !== 'auto') this.weather = w; };
    actions.restyle = () => { if (hub.player && (this.mode === 'hub' || this.mode === 'street')) hub.refreshCar(); };
    roles.onChange = () => {
      if (ui.refresh) ui.refresh();
      if (hub.player && (this.mode === 'hub' || this.mode === 'street')) hub.refreshCar();
    };
    actions.preview = () => {};
    actions.paint = (color) => {
      if (!career.state) return;
      career.currentCar().style.color = color;
      career.save();
      if (hub.player) hub.refreshCar();
    };
    actions.setTime = (t) => { if (career.state) career.state.worldTime = t; else this._titleTime = t; };
    actions.resume = () => { race.paused = false; drag.paused = false; };
    actions.restart = () => { const c = this.lastCfg; ui.closeAll(); if (c) this._again(c); };
    actions.quit = () => { ui.closeAll(); this.toHub(); };
    actions.again = (cfg) => this._again(cfg);
    actions.closed = () => { race.paused = false; drag.paused = false; };
  },

  startRace(cfg) {
    if (career.state && career.state.impound > 0 && !cfg.ignoreImpound) {
      ui.toast('Car is impounded. Pay the release in the garage lot.');
      return;
    }
    if (cfg.customId && !cfg.customDef) {
      cfg.customDef = getTrack(cfg.customId);
      if (!cfg.customDef) { ui.toast('That custom track is missing.'); return; }
    }
    ui.closeAll();
    if (editor.active) editor.leave();
    this.lastCfg = Object.assign({}, cfg);
    this._hideFreeRoam();
    this.city.group.visible = false;
    try {
      // League, boss, drag and custom grids always build the owned career car.
      // A stolen traffic car stays parked in the city.
      this.lastError = '';
      race.start(cfg, this.fx);
    } catch (err) {
      this.lastError = (err && (err.stack || err.message)) || String(err);
      console.error(err);
      this.city.group.visible = true;
      this._showCity(true);
      if (!hub.active) hub.enter(this.city, this.fx);
      this.mode = 'hub';
      ui.setMode('hub');
      ui.toast('That race could not start.');
      return;
    }
    this.mode = 'race';
    ui.setMode('race');
    audio.startMusic('race');
    audio.startEngine();
    this.weather = cfg.weather || 'clear';
  },

  startDrag() {
    ui.closeAll();
    const strip = this.city.strip;
    this._hideFreeRoam();
    this.city.group.visible = true;
    const tree = ensureTree(strip);
    const cfg = { kind: 'drag', league: career.state.league, title: 'Quarter Mile', strip, tree, laps: 1 };
    this.lastCfg = cfg;
    drag.start(cfg, this.fx);
    this.mode = 'drag';
    ui.setMode('drag');
    this.weather = gfx.night > 0.4 ? 'clear' : this.weather;
    audio.startMusic('drag');
    audio.startEngine();
  },

  _again(cfg) {
    if (cfg.kind === 'drag') this.startDrag();
    else if (cfg.kind === 'street') hub.startChallenge(cfg.streetId);
    else this.startRace(cfg);
  },

  _finished(res) {
    audio.stopEngine();
    const sum = career.finishEvent(res);
    if (res.cfg.kind === 'boss' && res.position === 1) ui.queueStory('boss' + res.cfg.league);
    ui.showResults(sum);
  },

  toHub() {
    race.stop();
    drag.stop();
    if (photo.active) photo.exit();
    this.city.group.visible = true;
    this._showCity(true);
    if (!hub.player) hub.enter(this.city, this.fx);
    else hub.enter(this.city, this.fx);
    // Drop the player at the garage road if a race hid them across the map.
    if (this.mode === 'race' || this.mode === 'drag') {
      const s = this.city.spawn;
      hub.player.x = this.mode === 'drag' ? this.city.strip.x : s.x;
      hub.player.z = this.mode === 'drag' ? this.city.strip.z0 + 6 : s.z;
      hub.player.h = this.mode === 'drag' ? 0 : (s.h || 0);
      hub.player.vx = hub.player.vz = 0;
    }
    this.mode = 'hub';
    ui.setMode('hub');
    audio.startMusic('hub');
    audio.stopEngine();
    career.save();
    this._showCam(gfx.view);
  },

  _leavePlay() {
    race.stop();
    drag.stop();
    if (photo.active) photo.exit();
    hub.leave();
  },

  openEditor(def) {
    ui.closeAll();
    this._hideFreeRoam();
    this.city.group.visible = false;
    if (editor.active) editor.leave();
    editor.enter(def || this._editorDraft || null);
    this._editorDraft = editor.def();
    this.mode = 'editor';
    ui.setMode('editor');
    audio.startMusic('hub');
  },

  closeEditor() {
    const draft = editor.def();
    this._editorDraft = draft;
    editor.leave();
    this.city.group.visible = true;
    if (!hub.player) hub.enter(this.city, this.fx);
    else { hub.enter(this.city, this.fx); this._showCity(true); }
    this.mode = 'hub';
    ui.setMode('hub');
  },

  _roamMeshes() {
    const out = [];
    for (const m of wanted.meshes()) out.push(m);
    for (const m of roles.meshes()) out.push(m);
    return out;
  },

  _hideFreeRoam() {
    hub.leave();
    if (hub.player) hub.player.mesh.visible = false;
    for (const t of hub.traffic) t.mesh.visible = false;
    for (const r of hub.rivals) r.car.mesh.visible = false;
    for (const m of this._roamMeshes()) m.visible = false;
    if (hub.parked && hub.parked.mesh) hub.parked.mesh.visible = false;
  },
  _showCity(on) {
    this.city.group.visible = on;
    if (hub.player && hub.player.mesh) hub.player.mesh.visible = on;
    for (const t of hub.traffic) if (t.mesh) t.mesh.visible = on;
    for (const r of hub.rivals) if (r.car.mesh) r.car.mesh.visible = on;
    for (const m of this._roamMeshes()) m.visible = on;
    if (hub.parked && hub.parked.mesh) hub.parked.mesh.visible = on;
  },

  _poi(id) {
    audio.play('confirm');
    const map = {
      garage: ui.showGarage, office: ui.showOffice, shop: () => ui.showShop('parts', 'shop'),
      dealer: () => ui.showShop('cars', 'dealer'), mart: () => ui.showShop('parts', 'mart'),
      bar: ui.showBar, training: ui.showTraining, police: ui.showHQ, hq: ui.showHQ,
      jobs: ui.showJobs, hospital: ui.showHospital, gas: ui.showGas,
      drag: () => this.startDrag(), vista: () => this.togglePhoto(),
      bank: () => roles.startHeist('bank')
    };
    const fn = map[id];
    if (fn) fn();
  },

  togglePhoto() {
    if (!career.state || this.mode === 'title') return;
    if (photo.active) { photo.exit(); document.getElementById('photo-ui').hidden = true; return; }
    const target = this._focusCar();
    if (!target) return;
    photo.enter({ x: target.x, y: 0.8, z: target.z });
    document.getElementById('photo-ui').hidden = false;
    if (this.mode === 'race') race.paused = true;
    if (this.mode === 'drag') drag.paused = true;
  },
  _focusCar() {
    if (this.mode === 'race' && race.player) return race.player;
    if (this.mode === 'drag' && drag.player) return drag.player;
    if (hub.player) return hub.player;
    return null;
  },
  _photoUi(cmd, arg) {
    if (cmd === 'exit') this.togglePhoto();
    else if (cmd === 'shot') {
      photo.capture();
      audio.play('photo');
      if (career.state) { career.state.totals.photos++; career.checkAchievements(); career.save(); ui.toast('Photo saved'); }
    } else if (cmd === 'filter') photo.setFilter(arg);
    else if (cmd === 'weather') {
      const o = ['clear', 'rain', 'snow', 'dust'];
      this.weather = o[(o.indexOf(this.weather) + 1) % o.length];
    } else if (cmd === 'hud') {
      photo.hideHud = !photo.hideHud;
      document.body.classList.toggle('hide-hud', photo.hideHud);
    }
  },

  setCamera(id) {
    const order = ['third', 'first', 'second', 'top'];
    if (order.indexOf(id) < 0) return gfx.view;
    gfx.view = id;
    gfx.pip = id === 'second';
    if (gfx._pipQuad && id !== 'second') gfx._pipQuad.visible = false;
    if (settings.data) settings.data.camera = id;
    settings.save();
    this._showCam(id);
    return id;
  },

  setTopNorth(on) {
    if (settings.data) settings.data.topNorth = !!on;
    settings.save();
    if (gfx.view === 'top') this._showCam('top');
    return !!(settings.data && settings.data.topNorth);
  },

  _cycleCam() {
    const name = gfx.cycle();
    if (settings.data) settings.data.camera = name;
    settings.save();
    this._showCam(name);
    return name;
  },

  _showCam(name) {
    const labels = { third: 'Chase', first: 'Cockpit', second: 'Front', top: 'Top' };
    const el = document.getElementById('cam-name');
    if (el) {
      el.hidden = false;
      el.classList.add('on');
      el.textContent = 'Camera: ' + (labels[name] || 'Chase') + ' [V]';
    }
    this._camLabel = 2.6;
    return name;
  },

  update(dt) {
    if (ui.isOpen()) {
      if (input.hit('pause') && !ui.topLocked()) ui.back();
      return;
    }
    if (input.hit('camera') && this.mode !== 'title' && !photo.active) this._cycleCam();
    if (input.hit('pause')) {
      if (photo.active) { this.togglePhoto(); return; }
      if (this.mode === 'race' || this.mode === 'drag') {
        race.paused = true; drag.paused = true; ui.showPause(); return;
      }
      if (this.mode === 'hub' || this.mode === 'street') { ui.showMenu(); return; }
    }
    if (input.hit('photo') && this.mode !== 'title') { this.togglePhoto(); return; }

    if (photo.active) {
      photo.nudge(dt, input);
      if (input.down('left') || input.down('right')) { /* orbit */ }
      const car = this._focusCar();
      if (car) photo.target = { x: car.x, y: 0.8, z: car.z };
      if (career.state && (input.hit('action'))) { /* ignore */ }
      return;
    }

    if (this.mode === 'hub' || this.mode === 'street') {
      this._advanceWorld(dt);
      hub.weather = this.weather;
      hub.update(dt, input);
      if (hub.challenge) this.mode = 'street';
      else if (this.mode === 'street') this.mode = 'hub';
      if (hub.player && hub.player.speed > 1) audio.startEngine();
    } else if (this.mode === 'race') {
      race.update(dt, input, null);
    } else if (this.mode === 'editor') {
      editor.update(dt, input);
    } else if (this.mode === 'drag') {
      if (input.hit('drift') || input.hit('nitro')) {
        const kind = drag.shift();
        if (kind) { audio.play('shift'); drag.msgs.push({ text: kind + ' SHIFT', t: 0.7, color: kind === 'PERFECT' ? '#7dff5a' : '#ffe03b' }); }
      }
      drag.update(dt, input);
    } else {
      this._titleTime = (this._titleTime == null ? 0.72 : this._titleTime + dt * 0.004);
    }
  },

  _advanceWorld(dt) {
    const lock = settings.data.weatherLock;
    if (lock && lock !== 'auto') this.weather = lock;
    else {
      this.weatherT -= dt;
      if (this.weatherT <= 0) {
        this.weatherT = 70 + Math.random() * 40;
        const roll = Math.random();
        this.weather = roll < 0.55 ? 'clear' : roll < 0.8 ? 'rain' : roll < 0.92 ? 'snow' : 'dust';
      }
    }
    if (career.state) career.state.worldTime = (career.state.worldTime + dt * 0.004) % 1;
  },

  present(dt) {
    if (this._camLabel > 0) {
      this._camLabel -= dt;
      if (this._camLabel <= 0) {
        const el = document.getElementById('cam-name');
        if (el) { el.hidden = true; el.classList.remove('on'); }
      }
    }
    const time = career.state ? career.state.worldTime : (this._titleTime == null ? 0.72 : this._titleTime);
    let theme = 'city';
    let atmoTime = time;
    let weather = this.weather;
    if (this.mode === 'race' && race.active) {
      theme = race.theme;
      atmoTime = race.timeOfDay;
      weather = race.cfg.weather || weather;
    }
    if (this.mode === 'drag') atmoTime = 0.06;
    gfx.setAtmosphere({ time: atmoTime, weather, theme });
    applyRoadWeather(this.city.roadMat, weather);
    if (race.mesh && race.mesh.userData.roadMat) applyRoadWeather(race.mesh.userData.roadMat, weather);
    this.city.update(dt, gfx.night);

    if (photo.active) photo.apply();
    else if (this.mode === 'title') {
      gfx.camera.up.set(0, 1, 0);
      const t = performance.now() / 1000;
      const r = 120 + Math.sin(t * 0.15) * 18;
      gfx.camera.position.set(Math.cos(t * 0.08) * r, 34 + Math.sin(t * 0.2) * 6, Math.sin(t * 0.08) * r);
      gfx.camera.lookAt(0, 5, 0);
      gfx.follow({ x: 0, y: 0, z: 0 }, gfx.night, this.city.lamps);
      gfx.setBlur(0);
    }     else if (this.mode === 'race') race.present(dt);
    else if (this.mode === 'drag') drag.present(dt);
    else if (this.mode === 'editor') editor.present();
    else hub.present(dt);

    const speed = this._focusCar() ? this._focusCar().speed : 0;
    wrecks.update(dt);
    this.fx.update(dt);
    this.fx.updateWeather(dt, gfx.camera, weather, speed * 0.15);
    audio.updateEngine(Math.min(1, speed / 70), !!(this._focusCar() && this._focusCar().nitroOn));
    audio.updateMusic(dt, Math.min(1, speed / 60));
    this._hud();
    gfx.render();
  },

  _hud() {
    const clock = $('hud-clock');
    const weather = $('hud-weather');
    if (clock) clock.textContent = clockString(career.state ? career.state.worldTime : 0.72);
    if (weather) weather.textContent = (RL.WEATHER[this.weather] || RL.WEATHER.clear).name;
    const prompt = $('prompt');
    if (prompt) {
      const text = (this.mode === 'hub' || this.mode === 'street') && hub.prompt ? hub.prompt.text : '';
      prompt.hidden = !text;
      prompt.textContent = text;
    }
    const call = $('callout');
    const msgs = this.mode === 'race' ? race.msgs : this.mode === 'drag' ? drag.msgs : hub.msgs;
    if (call) {
      const m = msgs && msgs[0];
      call.hidden = !m;
      if (m) { call.textContent = m.text; call.style.color = m.color || '#fff'; }
    }
    const cd = $('countdown');
    if (cd) {
      if (this.mode === 'race' && race.t < 0) {
        const n = Math.ceil(-race.t);
        cd.hidden = false;
        cd.textContent = n > 0 && n <= 3 ? String(n) : '';
      } else cd.hidden = true;
    }
    if (roles.paintLock) roles.paintLock();
    this._raceHud();
    this._dragHud();
    this._minimap();
    const wantedEl = $('wanted');
    if (wantedEl) {
      const role = career.state && career.state.role;
      const stars = wanted.stars || 0;
      const bounty = wanted.bounty();
      const show = (this.mode === 'hub' || this.mode === 'street') && (stars > 0 || bounty > 0 || role === 'police' || role === 'criminal');
      wantedEl.hidden = !show;
      if (show) {
        const starsTxt = role === 'police' && stars <= 0 ? 'POLICE' : starLabel(stars);
        const rank = role ? rankName(role) : '';
        const purse = bounty > 0 ? '   BOUNTY $' + bounty.toLocaleString('en-US') : '';
        const cd = stars > 0 ? wanted.cooldownLabel() : '';
        const main = starsTxt + (rank ? '  ' + rank : '');
        wantedEl.innerHTML = escapeHud(main) + (bounty > 0 ? '<span class="bounty">' + escapeHud(purse) + '</span>' : '') + (cd ? '<span class="cool">' + escapeHud(cd) + '</span>' : '');
        wantedEl.className = 'stars-' + (stars > 5 ? 'high' : stars) + (role ? ' role-' + role : '');
      }
    }
    if ((this.mode === 'hub' || this.mode === 'street') && hub.player && $('hud-car')) {
      if (hub.player.stolen) {
        const s = hub.player.stolen;
        const hp = Math.max(0, Math.round(100 - (hub.player.damage || 0)));
        $('hud-car').textContent = 'Stolen T' + s.tier + ' ' + s.name + ' · ' + hp + '% hp';
      }
    }
    const speedo = $('speedo');
    const car = this._focusCar();
    if (speedo) {
      speedo.hidden = this.mode === 'title' || !car;
      if (car) {
        $('speed-num').textContent = String(Math.round(car.speed * 3.6));
        const nitro = $('nitro-fill');
        const dmg = $('dmg-fill');
        if (nitro) nitro.style.width = (car.nitro || 0) + '%';
        if (dmg) dmg.style.width = (car.damage || 0) + '%';
        const hp = $('hp-fill');
        if (hp) {
          const n = car.hp == null ? 100 : car.hp;
          hp.style.width = n + '%';
          hp.parentElement.classList.toggle('low', n < 35);
        }
      }
    }
  },

  _raceHud() {
    const el = $('race-hud');
    if (!el) return;
    const on = this.mode === 'race' && race.active;
    el.hidden = !on;
    if (!on) return;
    const solo = ['timetrial', 'drift', 'training'].includes(race.cfg.kind);
    $('race-pos').textContent = solo ? (race.cfg.kind === 'drift' ? 'DRIFT' : 'SOLO') : (race.playerPos + '/' + race.standings().filter((c) => !c.eliminated).length);
    $('race-lap').textContent = 'LAP ' + Math.max(1, Math.min(race.cfg.laps, race.player.lapsDone + 1)) + '/' + race.cfg.laps + '  ' + fmtTime(Math.max(0, race.t) + (race.penalty || 0));
    let obj = '';
    if (race.cfg.kind === 'timetrial') obj = 'Par ' + fmtTime(race.par);
    if (race.cfg.kind === 'drift') obj = 'Drift ' + Math.round(race.stats.drift + (race.player.drifting ? race.player.driftCur : 0)) + ' / ' + race.driftTarget;
    if (race.cfg.kind === 'ghost') obj = 'Beat the ghost';
    if (race.cfg.kind === 'elimination') obj = 'Don\'t be last';
    $('race-obj').textContent = obj;
    const rows = race.standings().map((c, i) => (i + 1) + '. ' + c.name).join('\n');
    $('race-order').textContent = solo ? '' : rows;
  },

  _dragHud() {
    const el = $('drag-hud');
    if (!el) return;
    const on = this.mode === 'drag' && drag.active;
    el.hidden = !on;
    if (!on) return;
    const rpm = drag.rpm01();
    $('drag-gear').textContent = 'GEAR ' + ((drag.player.gear || 0) + 1);
    $('drag-rpm').style.width = Math.min(100, rpm * 100) + '%';
    $('drag-rpm').style.background = rpm > 0.9 && rpm < 0.99 ? '#7dff5a' : rpm >= 1 ? '#ff3b6b' : '#2ee6ff';
    const dist = drag.player.z - (drag.cfg.strip.z0 + 8);
    $('drag-dist').textContent = Math.max(0, dist).toFixed(0) + ' / 402 m';
    $('drag-et').textContent = drag.t >= drag.greenAt ? fmtTime(drag.player.finishT || (drag.t - drag.greenAt)) : 'STAGED';
    const flash = drag.player.shiftFlash;
    $('drag-shift').textContent = flash ? flash.kind : (drag.player.launched ? 'SHIFT' : 'HOLD BRAKE + GAS');
  },

  _minimap() {
    const c = $('minimap');
    if (!c) return;
    const show = this.mode === 'hub' || this.mode === 'street' || this.mode === 'race';
    c.hidden = !show;
    if (!show) return;
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8,6,20,0.55)';
    ctx.fillRect(0, 0, w, h);
    if (this.mode === 'race' && race.track) {
      const tr = race.track;
      const s = Math.min(w / (tr.maxX - tr.minX + 40), h / (tr.maxZ - tr.minZ + 40));
      ctx.strokeStyle = '#ffe03b';
      ctx.beginPath();
      tr.pts.forEach((p, i) => {
        const x = (p.x - tr.minX + 20) * s;
        const y = (p.z - tr.minZ + 20) * s;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.stroke();
      for (const car of race.cars) {
        ctx.fillStyle = car.isPlayer ? '#ffe03b' : car.color || '#fff';
        ctx.beginPath();
        ctx.arc((car.x - tr.minX + 20) * s, (car.z - tr.minZ + 20) * s, car.isPlayer ? 4 : 2.5, 0, 7);
        ctx.fill();
      }
    } else if (hub.player) {
      const scale = 0.22;
      const px = hub.player.x, pz = hub.player.z;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo((-400 - px) * scale, (i * 86 - pz) * scale);
        ctx.lineTo((400 - px) * scale, (i * 86 - pz) * scale);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo((i * 86 - px) * scale, (-400 - pz) * scale);
        ctx.lineTo((i * 86 - px) * scale, (400 - pz) * scale);
        ctx.stroke();
      }
      if (this.city && this.city.pois) {
        for (const lot of this.city.pois) {
          ctx.fillStyle = lot.color || '#fff';
          ctx.fillRect((lot.x - px) * scale - 2, (lot.z - pz) * scale - 2, 4, 4);
        }
      }
      ctx.fillStyle = '#ffe03b';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#3fa9ff';
      for (const cop of wanted.cops) {
        ctx.fillRect((cop.x - px) * scale - 2, (cop.z - pz) * scale - 2, 4, 4);
      }
      if (roles.suspect) {
        ctx.fillStyle = '#ff3b6b';
        ctx.fillRect((roles.suspect.x - px) * scale - 2, (roles.suspect.z - pz) * scale - 2, 4, 4);
      }
      ctx.restore();
    }
  }
};

function importStory() {
  ui.queueStory('intro');
  setTimeout(() => {
    if (ui.isOpen()) return;
    if (ui.openStory) ui.openStory('intro');
  }, 60);
}

let treeGroup = null;
function ensureTree(strip) {
  if (treeGroup) return treeGroup.userData.lights;
  const g = new THREE.Group();
  const pole = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.6 });
  // The tree stands ahead of the staged cars (they face +Z) so the chase cam sees it.
  const treeZ = strip.z0 + 18;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.5, 0.4), pole);
  post.position.set(strip.x + 1.4, 2.7, treeZ);
  g.add(post);
  const lights = [];
  const cols = [0xffffff, 0xffc83a, 0xffc83a, 0xffc83a, 0x3dff6a, 0xff2a2a];
  cols.forEach((c, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.1 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mat);
    bulb.position.set(strip.x + 1.4, 4.6 - i * 0.55, treeZ);
    g.add(bulb);
    lights.push(mat);
  });
  // Finish gantry
  const fin = new THREE.Mesh(new THREE.BoxGeometry(20, 0.4, 0.4), pole);
  fin.position.set(strip.x, 4.5, strip.z0 + 8 + RL.DRAG.distance);
  g.add(fin);
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(18, 1.2, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2ef0, emissiveIntensity: 1.2 })
  );
  banner.position.set(strip.x, 5.4, strip.z0 + 8 + RL.DRAG.distance);
  g.add(banner);
  gfx.world.add(g);
  g.userData.lights = lights;
  treeGroup = g;
  return lights;
}

