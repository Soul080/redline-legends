/* main.js — boots the career and runs a fixed 60Hz sim under a variable
   display rate. The harness (window.__RL3) can freeze the loop and step
   frames itself so screenshots don't depend on requestAnimationFrame. */

import { game } from './game.js';
import { input } from './input.js';
import { career } from './state.js';
import { settings } from './settings.js';
import { gfx } from './renderer.js';
import { hub } from './hub.js';
import { race } from './race.js';
import { drag } from './drag.js';
import { photo } from './photo.js';
import { ui, actions, bootError } from './ui.js';
import { audio } from './audio.js';
import { wanted } from './wanted.js';
import { roles } from './roles.js';
import { editor } from './editor.js';
import { wrecks } from './wrecks.js';
import { save as saveTrack, encode, decode, list as listTracks } from './tracks.js';

const STEP = 1 / 60;
// A software GL frame can take several hundred milliseconds. Simulate the
// time that actually passed, but never more than a quarter second, so a
// stalled tab cannot tunnel the car through a block.
const MAX_FRAME = 0.25;
const MAX_STEPS = 15;
let acc = 0;
let last = performance.now();
let frozen = false;

let loopError = null;
function frame(now) {
  // Schedule the next frame first so a thrown update cannot kill the loop.
  requestAnimationFrame(frame);
  if (frozen) { last = now; return; }
  const raw = Math.max(0, (now - last) / 1000);
  const dt = Math.min(MAX_FRAME, raw);
  last = now;
  acc += dt;
  let steps = 0;
  try {
    gfx.noteFrame(raw);
    while (acc >= STEP && steps < MAX_STEPS) {
      game.update(STEP);
      acc -= STEP;
      steps++;
    }
    // Drop leftover debt once the cap is hit so a slow GPU cannot spiral.
    if (steps >= MAX_STEPS) acc = 0;
    game.present(dt);
    loopError = null;
  } catch (err) {
    acc = 0;
    if (!loopError) {
      loopError = err;
      console.error(err);
      bootError(err);
    }
  } finally {
    input.endFrame();
  }
}

function step(n) {
  const count = Math.max(1, n | 0);
  for (let i = 0; i < count; i++) {
    game.update(STEP);
    input.endFrame();
    game.present(STEP);
  }
}

function sim(n) {
  const count = Math.max(1, n | 0);
  for (let i = 0; i < count; i++) {
    game.update(STEP);
    input.endFrame();
  }
}

try {
  game.boot();
  requestAnimationFrame(frame);
} catch (err) {
  console.error(err);
  bootError(err);
}

window.addEventListener('error', (e) => {
  if (e.error) console.error(e.error);
});

window.__RL3_requestView = function () {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'rl-toggle-view' }, '*');
    return;
  }
  try {
    const raw = JSON.parse(localStorage.getItem('redline_legends_settings_v1') || '{}');
    raw.view = '2d';
    localStorage.setItem('redline_legends_settings_v1', JSON.stringify(raw));
  } catch (e) { /* ignore */ }
  location.href = '../index.html';
};

window.addEventListener('keydown', (e) => {
  if (e.code !== 'F3') return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  e.preventDefault();
  window.__RL3_requestView();
});

window.__RL3 = {
  game, career, settings, gfx, hub, race, drag, photoMode: photo, ui, input, actions, audio, editor, wrecks, wanted,
  newGame(name) { actions.newGame(name || 'Rookie', { story: false }); },
  setTime(t) { actions.setTime(t); },
  setWeather(w) { game.weather = w; },
  quality(q) { settings.data.quality = q; settings.save(); actions.quality(); },
  hold(action, on) { input.holdVirtual(action, on); },
  startRace(cfg) { game.startRace(cfg); },
  startDrag() { game.startDrag(); },
  openGarage() { ui.showGarage('look'); },
  paint(color) { actions.paint(color); },
  style(patch) {
    const car = career.currentCar();
    Object.assign(car.style, patch);
    career.save();
    if (hub.player) hub.refreshCar();
  },
  photo() { game.togglePhoto(); },
  freeze(on) { frozen = !!on; if (!on) last = performance.now(); },
  step,
  sim,
  closeUi() { ui.closeAll(); },
  setRole(id, force) {
    const res = roles.switchTo(id, { force: !!force });
    if (res.ok && hub.player) hub.refreshCar();
    return res;
  },
  stars() { return wanted.stars; },
  heatNow() { return wanted.heat; },
  cops() { return wanted.cops.length; },
  offense(kind, info) {
    if (info && typeof info === 'object') wanted.offense(kind, 0, info);
    else wanted.offense(kind, info == null ? {} : info);
    return wanted.heat;
  },
  heat(kind, n) { wanted.offense(kind || 'race', n == null ? 30 : n); },
  bounty() { return wanted.bounty(); },
  flush() { wanted.capture(); career.save(); },
  resumeShared() { return actions.resumeShared ? actions.resumeShared() : false; },
  playing() { return game.mode === 'hub' || game.mode === 'street' || game.mode === 'race' || game.mode === 'drag'; },
  camera() { return gfx.view; },
  pip() { return !!gfx.pip; },
  cycleCam() { return game._cycleCam(); },
  setCamera(id) { return game.setCamera(id); },
  setTopNorth(on) { return game.setTopNorth(on); },
  copCount() { return wanted.cops.length; },
  copSpeeds() { return wanted.cops.map((c) => c.p.maxSpeed); },
  pardon() { wanted.pardon(); },
  health() { return hub.player && hub.player.hp != null ? hub.player.hp : 100; },
  exitCar() { return hub.exitCar(); },
  enterCar() { return hub.enterCar(); },
  onFoot() { return !!(hub.player && hub.player.onFoot); },
  footCops() { return wanted.cops.filter((c) => c.dismounted).length; },
  footThugs() { return (wanted.thugs || []).filter((t) => t.dismounted).length; },
  footGuns() {
    return {
      cop: wanted.cops.some((c) => c.officer && c.officer.gun),
      thug: (wanted.thugs || []).some((t) => t.officer && t.officer.gun)
    };
  },
  forceFoot() { return wanted.forceFoot(); },
  plant(opts) { return wanted.plant(opts); },
  hurt(amount, from) { return wanted.hurtPlayer(amount, from); },
  skipChain() { wanted.downClock = (wanted.downClock || 0) + 13; },
  saveTrack(def) { return saveTrack(def); },
  share(def) { return encode(def); },
  importTrack(code) { return decode(code); },
  tracks() { return listTracks(); },
  startCustom(cfg) {
    game.startRace(Object.assign({ kind: 'custom', league: career.state ? career.state.league : 1 }, cfg));
  },
  openEditor(def) { game.openEditor(def); },
  /** Force the focused car to 100% so the next step detonates it. */
  wreck() {
    if (race.active && race.player) {
      race.player.damage = 100;
      race.player.invuln = 0;
      race.player.exploded = false;
      return 'race';
    }
    if (drag.active && drag.player) {
      drag.player.damage = 100;
      drag.player.invuln = 0;
      return 'drag';
    }
    if (hub.player) {
      hub.player.damage = 100;
      hub.player.invuln = 0;
      hub.player.wreckHold = 0;
      const car = career.currentCar();
      if (car) car.damage = 100;
      return 'city';
    }
    return null;
  }
};
