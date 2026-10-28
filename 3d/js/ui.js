/* ui.js — DOM menus over the 3D view. Keyboard (arrows + Enter + Esc),
   mouse and touch all hit the same data-act buttons. Panels sit on the right
   so the car stays visible while you paint it. */

import { RL } from './data.js';
import { career } from './state.js';
import { settings } from './settings.js';
import { audio } from './audio.js';
import { input, ACTION_NAMES, DEFAULT_KEYS } from './input.js';
import { escapeHtml, fmtMoney, fmtTime } from './util.js';
import { list as listTracks } from './tracks.js';
import { roles, ROLE_INFO, ROLE_ORDER, rankName, rankIndex, switchWait, formatLock } from './roles.js';
import { wanted } from './wanted.js';
import { hideSeconds, formatCooldown } from './heat.js';
import { isShop, card as robCard, rob as robShop } from './robbery.js';

const $ = (id) => document.getElementById(id);
export const actions = {};

let stack = [];
let panel;
let pendingStory = null;
let mode = 'title';

export const ui = {
  init() {
    panel = $('panel');
    panel.addEventListener('click', onClick);
    panel.addEventListener('input', onInput);
    panel.addEventListener('change', onInput);
    document.addEventListener('keydown', onKey);
    $('btn-new').onclick = () => { audio.init(); audio.play('confirm'); newGameFlow(); };
    $('btn-continue').onclick = () => { audio.init(); audio.play('confirm'); continueGame(); };
    $('btn-settings').onclick = () => { audio.init(); showSettings(); };
    $('btn-help').onclick = () => { audio.init(); showHelp(); };
    const viewBtn = $('btn-view');
    if (viewBtn) viewBtn.onclick = () => { audio.init(); window.__RL3_requestView && window.__RL3_requestView(); };
    const camBtn = $('btn-cam');
    if (camBtn) camBtn.onclick = () => { audio.init(); actions.cycleCam && actions.cycleCam(); };
    const viewTouch = $('btn-view-touch');
    if (viewTouch) viewTouch.onclick = () => { audio.init(); window.__RL3_requestView && window.__RL3_requestView(); };
    const ver = $('game-version');
    if (ver && window.RL_VERSION) ver.textContent = 'v' + window.RL_VERSION;
    document.querySelectorAll('#hud [data-open]').forEach((b) => {
      b.onclick = () => {
        audio.init();
        const map = { inv: showInventory, skills: showSkills, quests: showQuests, ach: showAchievements, settings: showSettings, menu: showMenu, photo: () => actions.photo && actions.photo() };
        if (map[b.dataset.open]) map[b.dataset.open]();
      };
    });
    $('title').addEventListener('keydown', (e) => {
      const btns = Array.from(document.querySelectorAll('#title button:not([disabled])'));
      const d = { ArrowDown: 1, ArrowUp: -1, KeyS: 1, KeyW: -1 }[e.code];
      if (!d) return;
      e.preventDefault();
      const i = btns.indexOf(document.activeElement);
      btns[(i + d + btns.length) % btns.length].focus();
    });
    document.querySelectorAll('#photo-ui [data-photo]').forEach((b) => {
      b.onclick = () => actions.photoUi && actions.photoUi(b.dataset.photo, b.dataset.arg);
    });
  },
  isOpen() { return stack.length > 0; },
  refresh() { if (stack.length) render(false); },
  topLocked() {
    const v = stack[stack.length - 1];
    return !!(v && v.noClose);
  },
  setMode(m) {
    mode = m;
    document.body.classList.remove('mode-title', 'mode-hub', 'mode-race', 'mode-drag', 'mode-street', 'mode-editor');
    document.body.classList.add('mode-' + (m === 'street' ? 'hub' : m));
    applyTouch();
    if (m === 'title') {
      $('btn-continue').disabled = !career.hasSave();
      if (career.hasSave()) $('btn-continue').focus();
      else $('btn-new').focus();
    }
    this.updateHud();
  },
  toast(text, color) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    t.style.color = '#fff';
    t.style.borderColor = color || '#2ee6ff';
    $('toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3800);
  },
  updateHud() {
    const s = career.state;
    if (!s || (mode !== 'hub' && mode !== 'street')) return;
    const need = RL.xpForLevel(s.level);
    $('hud-name').textContent = s.name + '  ·  Lv ' + s.level;
    $('hud-xp').style.width = (100 * s.xp / need) + '%';
    $('hud-xptext').textContent = s.xp + ' / ' + need + ' XP';
    $('hud-money').textContent = fmtMoney(s.money);
    $('hud-league').textContent = 'League ' + s.league + ' · ' + career.leagueData(s.league).name;
    $('hud-respect').textContent = '★ ' + s.respect;
    $('hud-points').textContent = (s.skillPoints || s.statPoints) ? (s.skillPoints + ' SP · ' + s.statPoints + ' stat') : '';
    const car = career.currentCar();
    $('hud-car').textContent = career.carDef(car.id).name + ' · ' + Math.round(car.damage) + '% dmg';
  },
  closeAll() {
    const had = stack.length;
    stack = [];
    panel.className = 'panel';
    panel.innerHTML = '';
    input.clear();
    this.updateHud();
    if (had && actions.closed) actions.closed();
    if ((mode === 'hub' || mode === 'street') && pendingStory) {
      const k = pendingStory;
      pendingStory = null;
      setTimeout(() => showStory(k), 40);
    }
  },
  back() {
    const v = stack.pop();
    if (v && v.onClose) v.onClose();
    if (stack.length) render(true);
    else this.closeAll();
  },
  queueStory(k) { pendingStory = k; },
  showResults, showPause, showMenu, showGarage, showOffice, showShop, showBar, showTraining,
  showInventory, showSkills, showQuests, showAchievements, showSettings, showHelp,
  showHQ, showJobs, showCustom, showHospital, showGas, showPlace, open
};

function open(view) { stack.push(view); render(true); }
function replace(view) { stack.pop(); stack.push(view); render(true); }
function render(focusFirst) {
  const v = stack[stack.length - 1];
  if (!v) { panel.className = 'panel'; panel.innerHTML = ''; return; }
  const prev = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;
  panel.className = 'panel open ' + (v.cls || '');
  panel.innerHTML = (v.noHead ? '' : '<div class="panel-head"><h2>' + v.title + '</h2>' + (v.noClose ? '' : '<button class="x" data-act="back">✕</button>') + '</div>') +
    '<div class="panel-body">' + v.render() + '</div>';
  panel.querySelectorAll('[data-act]').forEach((el, i) => { el.dataset.key = el.dataset.act + ':' + (el.dataset.arg || '') + ':' + i; });
  const again = prev && panel.querySelector('[data-key="' + prev + '"]');
  if (again && !focusFirst) again.focus();
  else {
    const f = panel.querySelector('.primary:not([disabled])') || panel.querySelector('[data-act]:not([disabled])');
    if (f) f.focus({ preventScroll: true });
  }
  ui.updateHud();
  if (actions.preview) actions.preview(v.preview || null);
}
function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  audio.init();
  const v = stack[stack.length - 1];
  const act = el.dataset.act;
  const arg = el.dataset.arg;
  if (act === 'back') { audio.play('click'); ui.back(); return; }
  if (v && v.acts && v.acts[act]) {
    audio.play('click');
    v.acts[act](arg, el);
    if (stack[stack.length - 1] === v) render(false);
  }
}
function onInput(e) {
  const t = e.target;
  if (t.dataset.set) {
    settings.data[t.dataset.set] = Number(t.value);
    if (t.nextElementSibling) t.nextElementSibling.textContent = Math.round(settings.data[t.dataset.set] * 100) + '%';
    audio.init(); audio.apply(); settings.save();
  }
  if (t.dataset.color) {
    actions.paint && actions.paint(t.value);
  }
  if (t.dataset.time) {
    actions.setTime && actions.setTime(Number(t.value));
  }
  if (t.dataset.field) {
    const v = stack[stack.length - 1];
    if (v && v.form) v.form[t.dataset.field] = t.value;
  }
}
function onKey(e) {
  if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text') {
    if (e.code === 'Enter') { const b = panel.querySelector('.primary'); if (b) b.click(); }
    return;
  }
  if (stack.length) {
    const nav = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, KeyS: 1, KeyD: 1, KeyW: -1, KeyA: -1 }[e.code];
    if (nav && !(document.activeElement && document.activeElement.type === 'range')) {
      e.preventDefault();
      const items = Array.from(panel.querySelectorAll('button[data-act]:not([disabled]), input, select'));
      if (!items.length) return;
      let i = items.indexOf(document.activeElement);
      i = i < 0 ? 0 : (i + nav + items.length) % items.length;
      items[i].focus();
    }
    // Escape is the pause binding. The game loop consumes it once per frame
    // so a menu and the sim don't both step backward on the same key.
    return;
  }
  if (mode === 'hub' || mode === 'street') {
    const k = { KeyI: showInventory, KeyK: showSkills, KeyJ: showQuests, KeyG: () => showGarage() }[e.code];
    if (k && !e.repeat) { e.preventDefault(); audio.init(); k(); }
  }
}
function applyTouch() {
  const t = settings.data.touch;
  const auto = ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer:coarse)').matches);
  document.body.classList.toggle('touch', t === 'on' || (t === 'auto' && auto));
}
function needSave() { career.save(); ui.updateHud(); if (actions.restyle) actions.restyle(); }

function statBars(st, base) {
  return '<div class="stats">' + RL.STAT_ORDER.map((k) => {
    const v = st[k], b = base ? base[k] : v;
    return '<div class="stat"><span>' + RL.STAT_NAMES[k] + '</span><div class="bar"><i style="width:' + Math.min(100, b / 1.3) + '%"></i>' +
      (v > b ? '<b style="left:' + (b / 1.3) + '%;width:' + Math.min(100 - b / 1.3, (v - b) / 1.3) + '%"></b>' : '') +
      '</div><em>' + v + '</em></div>';
  }).join('') + '</div>';
}
function partCard(p, buttons) {
  const r = RL.RARITIES[p.rarity];
  const st = Object.keys(p.stats).map((k) => '+' + p.stats[k] + ' ' + RL.STAT_NAMES[k]).join(', ');
  return '<div class="card" style="border-color:' + r.color + '"><div><span class="rar" style="color:' + r.color + '">' + r.name + '</span> ' +
    RL.SLOTS[p.slot].icon + ' <b>' + escapeHtml(p.name) + '</b>' + (p.color ? ' <i class="swatch" style="background:' + p.color + '"></i>' : '') +
    '<div class="small">' + st + (career.isEquipped(p.uid) ? ' · <span class="eq">EQUIPPED</span>' : '') + '</div></div><div class="btns">' + (buttons || '') + '</div></div>';
}
const tabs = (v, list) => '<div class="tabs">' + list.map(([id, name]) => '<button data-act="tab" data-arg="' + id + '" class="' + (v.tab === id ? 'on' : '') + '">' + name + '</button>').join('') + '</div>';

function newGameFlow() {
  const go = () => replaceOrOpen({
    title: 'New Game',
    render: () => '<p>Every legend starts as a nobody. What do they call you on the street?</p><input id="nameInput" maxlength="14" value="Rookie"><div class="row"><button class="primary" data-act="start">Start Career</button></div>',
    acts: { start: () => {
      const n = ($('nameInput').value || 'Rookie').trim().slice(0, 14) || 'Rookie';
      ui.closeAll();
      actions.newGame && actions.newGame(n);
    } }
  });
  if (career.hasSave()) open({ title: 'Start Over?', render: () => '<p>A new career overwrites the 3D save. The 2D game keeps its own save.</p><div class="row"><button class="primary" data-act="yes">New career</button><button data-act="back">Cancel</button></div>', acts: { yes: go } });
  else go();
  setTimeout(() => { const i = $('nameInput'); if (i) { i.focus(); i.select(); } }, 30);
}
function replaceOrOpen(v) { if (stack.length) replace(v); else open(v); }
function continueGame() { if (actions.continue) actions.continue(); }

function showMenu() {
  open({ title: 'Menu', render: () => '<div class="grid2">' +
    '<button data-act="inv">Inventory <kbd>I</kbd></button><button data-act="skills">Skills <kbd>K</kbd></button>' +
    '<button data-act="quests">Quests <kbd>J</kbd></button><button data-act="ach">Achievements</button>' +
    '<button data-act="garage">Garage <kbd>G</kbd></button><button data-act="photo">Photo mode <kbd>F</kbd></button>' +
    '<button data-act="settings">Settings</button><button data-act="help">How to Play</button>' +
    '<button data-act="title">Save & Title</button></div>',
    acts: {
      inv: showInventory, skills: showSkills, quests: showQuests, ach: showAchievements,
      garage: () => showGarage(), photo: () => { ui.closeAll(); actions.photo && actions.photo(); },
      settings: showSettings, help: showHelp,
      title: () => { career.save(); ui.closeAll(); actions.toTitle && actions.toTitle(); }
    } });
}
function showHelp() {
  const clock = (n) => formatCooldown(hideSeconds(n));
  open({ title: 'How to Play', cls: 'help-panel', render: () => '<ul class="help">' +
    '<li><b>City:</b> you drive the road grid. Traffic stops for lights. Pull into a building\'s lot and press <kbd>E</kbd> to walk inside. The avenue itself is not a door. Talk to the person at the counter. The south door leaves. Downtown has the garage, race office, shop, dealership, and the bar. Harbor loads smugglers. Neon Mile has the bank and the arch. Industrial is the police station and the mart. Old Town has the hospital and the clock. The Heights has fuel, the park, and the vista. The dragway building is east. The tower outside it is the same room.</li>' +
    '<li><b>Heat:</b> stars do not stop at five. The board shows up to five star icons, then a count such as ★ x12. A nudge or a cone barely counts. Red lights, wrecks, smashed props, and holding a high speed do count. Stars do not fall while the police can see you. Break line of sight and stay hidden. The HUD shows a white cooldown: ' +
    clock(1) + ' at one star, ' + clock(5) + ' at five, and ' + clock(8) + ' at eight. Past five, every extra star waits longer. Spotting you resets that clock. When it hits zero, one star drops. Kingpin trims the wait a little. Each new star adds bounty, and a higher star adds more. Running someone over, ramming a car, or wrecking one adds bounty too. Losing the police pays nothing and does not wipe it. The bounty stays until you are busted. In a city server, a cop can bust you and claim it. Cruisers start off screen, on a road, and drive to you. A stuck cruiser reverses. It does not pop in beside you. Past five stars the squad stays small enough to dodge.</li>' +
    '<li><b>Traffic:</b> pull alongside a slow car and press <kbd>E</kbd> or <kbd>C</kbd> to steal it. The STEAL button does the same. Tiers have different speed and health. Circuit races and the drag strip always use the car you own. At a shop door, or at the counter inside, <kbd>C</kbd> robs the till instead.</li>' +
    '<li><b>Roles:</b> HQ (police lot) switches Neutral, Criminal, or Police on a cooldown. Criminals take heists at the bar. Police ram or box suspects for bounties. If a cop picks up a wanted star, they become Neutral immediately and cannot change roles for 5 minutes. The timer shows on screen and is stored in the save. Each role has its own rank. A criminal is a known face: shops, repairs, fuel, and the hospital cost 12% more, sales pay less, and heat falls slower. Kingpin waives that street tax.</li>' +
    '<li><b>On sight:</b> with no wanted stars, an officer outside the police station still shoots a criminal in view. The shot flashes, then fires at the spot you were standing. Move more than a step, take the far lane, break the line with a building, or pull into the station lot. The lot is a ceasefire so you can still change roles. The shot spends health. It does not add a star. Driving off refills that health.</li>' +
    '<li><b>Shops:</b> Walk into the parts shop, Quick Mart, the dealership, or Nitro Fuel. On foot, the lot is the door. Inside, walk up to the counter. <kbd>E</kbd> talks to the clerk. <kbd>C</kbd> at that counter, or at the door, takes the cash. Rob the register does the same. Away from a till, <kbd>C</kbd> still steals a car. Wanted stars go up, and the bounty under them goes up with the heat. The till stays empty for about a minute. <kbd>Q</kbd> gets you back in the car.</li>' +
    '<li><b>On foot:</b> tap <kbd>Q</kbd> when you are almost stopped to step out. Officers get out if you sit still, wreck, or walk. Their swing and their shot both flash before they land, and they cannot reach you from down the block. One star is a single officer. Armed crew only show up at three stars. Get back in the car and drive to drop them. At 0 health you are Busted (garage) or Wasted (hospital). The bill is capped and dying never pays you.</li>' +
    '<li><b>Camera:</b> <kbd>V</kbd>, the Cam button, or the touch CAM button cycles chase, cockpit, a front camera (the road ahead stays in the corner), and top-down. A label such as Camera: Chase [V] shows the one you just picked. Top-down follows you from above and stays above the roofs. Settings chooses north-up or car-up. Left and right steer the car, including on foot and on the touch pad. The front camera looks back at you, so the car can move the other way on the screen. <kbd>F3</kbd> switches to the 2D city without starting a second career.</li>' +
    '<li><b>Wreck:</b> at 100% damage the car explodes. In a race you restart at the last checkpoint and take 8 seconds (5 on the strip). In the city a tow truck drops you at the garage for $260, or a bit more if you are a known criminal. Blowing up during a chase counts as a bust.</li>' +
    '<li><b>Race:</b> gas, brake, steer. <kbd>Space</kbd> drifts and fills nitro. <kbd>Shift</kbd> or <kbd>N</kbd> fires it. Walls hurt. Grass is slow.</li>' +
    '<li><b>Drag:</b> walk into the drag building or the tower and talk to the starter. A drag is a normal race on a flat straight: the same car, the same physics, the same HUD, and one opponent. Quarter mile is about 400 m. Half mile is about 800 m. The finish line is the far end. Gas, brake, and steer are unchanged. The strip apron stages the same race.</li>' +
    '<li><b>Custom:</b> the Race Office opens a custom grid and the track editor. Export a share code to pass a layout around.</li>' +
    '<li><b>Streets:</b> parked rivals with a gold glow will race you point to point. Police players can intercept them instead.</li>' +
    '<li>Top 3 in all three league races unlocks the boss. Beat the boss to get promoted.</li>' +
    '<li><kbd>F</kbd> photo mode. <kbd>R</kbd> resets you to the road if you get stuck. <kbd>Esc</kbd> pauses.</li></ul>' });
}

function showGarage(tab) {
  const v = {
    title: 'Garage', tab: tab || 'look', preview: 'car',
    render: () => {
      const s = career.state, car = career.currentCar(), def = career.carDef(car.id), st = career.carStats(car);
      let h = tabs(v, [['look', 'Look'], ['car', 'Car'], ['parts', 'Parts'], ['tune', 'Tune'], ['cars', 'Cars'], ['driver', 'Driver']]);
      if (v.tab === 'look') {
        const col = career.carColor(car);
        h += '<p>Paint, rims and decals update on the car behind this panel.</p>';
        h += '<div class="swatches">' + RL.PAINT_COLORS.map((c) => '<button data-act="color" data-arg="' + c + '" class="swatch big" style="background:' + c + '"></button>').join('') +
          '<input type="color" data-color="1" value="' + col + '"></div>';
        h += '<div class="row"><button data-act="rim" data-arg="0">Rims · Stock</button><button data-act="rim" data-arg="1">Sport</button><button data-act="rim" data-arg="2">Deep dish</button></div>';
        h += '<div class="row"><button data-act="decal" data-arg="none">No decal</button><button data-act="decal" data-arg="stripes">Stripes</button><button data-act="decal" data-arg="number">Number</button><button data-act="decal" data-arg="lightning">Bolt</button><button data-act="decal" data-arg="chevron">Chevron</button></div>';
        h += '<div class="row"><button data-act="glow">' + (car.style.underglow ? 'Underglow ON' : 'Underglow OFF') + '</button></div>';
        h += '<p class="small">Current rims ' + (car.style.rims || 0) + ' · decal ' + (car.style.decal || 'none') + '</p>';
      } else if (v.tab === 'car') {
        const cost = career.repairCost(car);
        h += '<div class="carhead"><i class="swatch big" style="background:' + career.carColor(car) + '"></i><div><h3>' + def.name + '</h3><div class="small">' + def.cls + ' · damage ' + Math.round(car.damage) + '%</div></div></div>' +
          statBars(st, def.s) + '<div class="row"><button class="primary" data-act="repair" ' + (car.damage < 1 || s.money < cost ? 'disabled' : '') + '>Repair (' + fmtMoney(cost) + ')</button></div>';
      } else if (v.tab === 'parts') {
        h += RL.SLOT_ORDER.map((slot) => {
          const cur = car.parts[slot] && career.findPart(car.parts[slot]);
          const avail = s.inventory.filter((p) => p.slot === slot && !career.isEquipped(p.uid));
          return '<div class="slot"><h4>' + RL.SLOTS[slot].icon + ' ' + RL.SLOTS[slot].name + '</h4>' +
            (cur ? partCard(cur, '<button data-act="unequip" data-arg="' + slot + '">Remove</button>') : '<div class="small dim">Stock</div>') +
            avail.map((p) => partCard(p, '<button data-act="equip" data-arg="' + p.uid + '">Equip</button>')).join('') + '</div>';
        }).join('');
      } else if (v.tab === 'tune') {
        const t = car.tune;
        h += '<p>Tuning trades one stat for another.</p>' +
          '<div class="tune"><span>Gear ratio</span><button data-act="tune" data-arg="gear,-1">Accel</button><b>' + t.gear + '</b><button data-act="tune" data-arg="gear,1">Speed</button></div>' +
          '<div class="tune"><span>Downforce</span><button data-act="tune" data-arg="aero,-1">Speed</button><b>' + t.aero + '</b><button data-act="tune" data-arg="aero,1">Grip</button></div>' + statBars(st, def.s);
      } else if (v.tab === 'cars') {
        h += s.cars.map((c) => {
          const d = career.carDef(c.id);
          return '<div class="card"><div><i class="swatch" style="background:' + career.carColor(c) + '"></i> <b>' + d.name + '</b> <span class="small">' + d.cls + '</span></div><div class="btns">' +
            (c.uid === s.currentCar ? '<span class="eq">DRIVING</span>' : '<button data-act="drive" data-arg="' + c.uid + '">Drive</button>') + '</div></div>';
        }).join('');
      } else h += driverHtml();
      return h;
    },
    acts: {
      tab: (a) => { v.tab = a; v.preview = 'car'; },
      color: (c) => { career.currentCar().style.color = c; needSave(); },
      rim: (n) => { career.currentCar().style.rims = Number(n); needSave(); },
      decal: (d) => { career.currentCar().style.decal = d; needSave(); },
      glow: () => { const s = career.currentCar().style; s.underglow = !s.underglow; needSave(); },
      repair: () => {
        const car = career.currentCar(), c = career.repairCost(car);
        if (career.state.money >= c && car.damage >= 1) { career.addMoney(-c); car.damage = 0; audio.play('coin'); ui.toast('Repaired'); needSave(); }
      },
      equip: (id) => {
        const p = career.findPart(id), car = career.currentCar();
        car.parts[p.slot] = id;
        if (p.slot === 'paint' && p.color) car.style.color = p.color;
        audio.play('confirm'); needSave();
      },
      unequip: (slot) => { delete career.currentCar().parts[slot]; needSave(); },
      tune: (a) => { const [k, d] = a.split(','); const t = career.currentCar().tune; t[k] = Math.max(-3, Math.min(3, t[k] + Number(d))); needSave(); },
      drive: (id) => { career.state.currentCar = id; ui.toast('Switched car'); needSave(); },
      stat: (k) => { if (career.raiseStat(k)) audio.play('confirm'); else audio.play('error'); }
    }
  };
  open(v);
}
function driverHtml() {
  const s = career.state;
  return '<p>Stat points: <b class="hl">' + s.statPoints + '</b></p>' + Object.keys(RL.DRIVER_STATS).map((k) =>
    '<div class="card"><div><b>' + RL.DRIVER_STATS[k].name + ' ' + s.stats[k] + '</b><div class="small">' + RL.DRIVER_STATS[k].desc + '</div></div><div class="btns"><button data-act="stat" data-arg="' + k + '" ' + (s.statPoints < 1 || s.stats[k] >= 20 ? 'disabled' : '') + '>+1</button></div></div>').join('');
}
function showSkills() {
  open({ title: 'Skills', cls: 'wide', render: () => {
    let h = driverHtml() + '<h3>Perk tree · <span class="hl">' + career.state.skillPoints + '</span> SP</h3><div class="tree">';
    for (const br of ['reflexes', 'control', 'nerve', 'tactics']) {
      h += '<div class="branch"><h4>' + RL.DRIVER_STATS[br].name + '</h4>' + RL.PERKS.filter((p) => p.branch === br).map(perkBtn).join('') + '</div>';
    }
    return h + '</div><div class="cap">' + RL.PERKS.filter((p) => p.branch === 'capstone').map(perkBtn).join('') + '</div>';
  }, acts: {
    perk: (id) => { if (career.unlockPerk(id)) ui.toast('Perk: ' + RL.PERKS.find((p) => p.id === id).name, '#c86bff'); else audio.play('error'); },
    stat: (k) => { if (career.raiseStat(k)) audio.play('confirm'); else audio.play('error'); }
  } });
}
function perkBtn(p) {
  const owned = career.state.perks.includes(p.id);
  const can = career.canUnlockPerk(p);
  return '<button class="perk ' + (owned ? 'owned' : can ? 'can' : 'locked') + '" data-act="perk" data-arg="' + p.id + '"><b>' + p.name + '</b><span>' + p.desc + '</span></button>';
}
function showInventory() {
  open({ title: 'Inventory', render: () => {
    const s = career.state;
    if (!s.inventory.length) return '<p class="dim">No parts yet.</p>';
    const sorted = s.inventory.slice().sort((a, b) => RL.RARITY_ORDER.indexOf(b.rarity) - RL.RARITY_ORDER.indexOf(a.rarity));
    return sorted.map((p) => partCard(p, career.isEquipped(p.uid) ? '' : '<button data-act="equip" data-arg="' + p.uid + '">Equip</button><button data-act="sell" data-arg="' + p.uid + '">Sell ' + fmtMoney(career.sellPrice(p)) + '</button>')).join('');
  }, acts: {
    equip: (id) => { const p = career.findPart(id); career.currentCar().parts[p.slot] = id; if (p.color) career.currentCar().style.color = p.color; needSave(); },
    sell: (id) => { const p = career.findPart(id); career.state.inventory = career.state.inventory.filter((x) => x.uid !== id); career.addMoney(career.sellPrice(p)); audio.play('coin'); needSave(); }
  } });
}
function showHospital() {
  open({ title: 'City Hospital', render: () => {
    const hp = actions.playerHp ? actions.playerHp() : 100;
    const cost = career.bill(40);
    return '<p>A bright clinic off the avenue. $' + cost + ' puts you back to full. Wasted drivers already wake up here.</p><p class="small">HP ' + Math.round(hp) + '</p><div class="row"><button class="primary" data-act="heal"' + (career.state.money < cost || hp >= 100 ? ' disabled' : '') + '>Heal ($' + cost + ')</button></div>';
  }, acts: { heal: () => {
    const cost = career.bill(40);
    if (career.state.money < cost || (actions.playerHp && actions.playerHp() >= 100)) return;
    career.addMoney(-cost);
    if (actions.healPlayer) actions.healPlayer();
    audio.play('coin');
    ui.toast('All patched up', '#7dff5a');
    career.save();
    ui.back();
  } } });
}
function showGas(place) {
  const id = isShop(place) ? place : 'gas';
  const title = id === 'diner' ? 'Mile Diner' : 'Nitro Fuel';
  open({ title: title, render: () => {
    const car = career.currentCar();
    const cost = career.bill(120);
    const blurb = id === 'diner'
      ? 'Coffee and a wrench. Patch 15% damage for $' + cost + '.'
      : 'High-test and a hose. Patch 15% damage for $' + cost + '.';
    return robCard(id) + '<p class="rob-line">' + blurb + '</p><p class="rob-line">Damage ' + Math.round(car.damage) + '%</p><div class="row"><button class="primary" data-act="fix"' + (career.state.money < cost || car.damage < 1 ? ' disabled' : '') + '>Patch</button></div>';
  }, acts: {
    robbery: () => finishRob(robShop(id)),
    fix: () => {
    const car = career.currentCar();
    const cost = career.bill(120);
    if (career.state.money < cost || car.damage < 1) return;
    career.addMoney(-cost);
    car.damage = Math.max(0, car.damage - 15);
    if (actions.syncDamage) actions.syncDamage();
    audio.play('coin');
    ui.toast('Patched', '#7dff5a');
    needSave();
  } } });
}
function showPlace(name, text) {
  open({ title: name || 'Landmark', render: () => '<p>' + escapeHtml(text || '') + '</p>', acts: {} });
}
function finishRob(res) {
  if (res && res.text) ui.toast(res.text, '#fff');
  if (res && res.ok) audio.play('coin');
}
function showShop(tab, place) {
  const placeId = (place && isShop(place)) ? place : null;
  const v = { title: tab === 'cars' ? 'Dealership' : 'Shop', tab: tab || 'parts', render: () => {
    const s = career.state, pm = career.priceMult(), tax = career.crimeTax();
    let h = (placeId ? robCard(placeId) : '') + tabs(v, [['cars', 'Cars'], ['parts', 'Parts'], ['sell', 'Sell']]) + '<p class="rob-line">Cash <b class="hl">' + fmtMoney(s.money) + '</b>' + (pm < 0.999 ? ' · ' + Math.round((1 - pm) * 100) + '% off' : '') + (tax > 1 ? ' · street tax 12%' : '') + '</p>';
    if (v.tab === 'cars') {
      h += RL.CARS.map((c) => {
        const owned = s.cars.some((x) => x.id === c.id);
        const locked = c.league > s.league;
        const price = career.streetPrice(c.price);
        return '<div class="card"><div><i class="swatch" style="background:' + c.color + '"></i> <b>' + c.name + '</b> <span class="small">' + c.cls + ' · L' + c.league + '</span><div class="mini">' +
          RL.STAT_ORDER.map((k) => '<span>' + RL.STAT_NAMES[k].slice(0, 3) + ' ' + c.s[k] + '</span>').join('') + '</div></div><div class="btns">' +
          (owned ? '<span class="eq">OWNED</span>' : locked ? '<span class="dim">League ' + c.league + '</span>' : '<button data-act="buycar" data-arg="' + c.id + '" ' + (s.money < price ? 'disabled' : '') + '>' + fmtMoney(price) + '</button>') + '</div></div>';
      }).join('');
    } else if (v.tab === 'parts') {
      const maxR = Math.min(3, s.league - 1);
      h += RL.SLOT_ORDER.map((slot) => '<div class="slot"><h4>' + RL.SLOTS[slot].icon + ' ' + RL.SLOTS[slot].name + '</h4>' + RL.RARITY_ORDER.map((r, i) => {
        if (i > maxR) return '';
        const proto = career.makePart(slot, r, false);
        const price = career.streetPrice(career.partValue(proto));
        return partCard(proto, '<button data-act="buypart" data-arg="' + slot + ',' + r + '" ' + (s.money < price ? 'disabled' : '') + '>' + fmtMoney(price) + '</button>');
      }).join('') + '</div>').join('');
    } else {
      const spare = s.inventory.filter((p) => !career.isEquipped(p.uid));
      h += spare.length ? spare.map((p) => partCard(p, '<button data-act="sell" data-arg="' + p.uid + '">Sell ' + fmtMoney(career.sellPrice(p)) + '</button>')).join('') : '<p class="dim">Nothing spare.</p>';
    }
    return h;
  }, acts: {
    tab: (a) => { v.tab = a; },
    buycar: (id) => {
      const c = career.carDef(id), price = career.streetPrice(c.price);
      if (career.state.money < price) return audio.play('error');
      career.addMoney(-price);
      const inst = { uid: career.makePart('paint', 'common', false).uid, id, damage: 0, parts: {}, tune: { gear: 0, aero: 0 }, style: { color: c.color, rims: 1, decal: 'none', underglow: false } };
      career.state.cars.push(inst);
      career.state.currentCar = inst.uid;
      audio.play('coin');
      ui.toast('Bought ' + c.name, '#7dff5a');
      career.checkAchievements();
      needSave();
    },
    buypart: (a) => {
      const [slot, r] = a.split(',');
      const p = career.makePart(slot, r, false);
      const price = career.streetPrice(career.partValue(p));
      if (career.state.money < price) return audio.play('error');
      career.addMoney(-price);
      career.state.inventory.push(p);
      audio.play('coin');
      ui.toast('Bought ' + p.name);
      career.checkAchievements();
      needSave();
    },
    sell: (id) => { const p = career.findPart(id); career.state.inventory = career.state.inventory.filter((x) => x.uid !== id); career.addMoney(career.sellPrice(p)); audio.play('coin'); needSave(); },
    robbery: () => { if (placeId) finishRob(robShop(placeId)); }
  } };
  open(v);
}

function rollConditions(trackKey, league) {
  const t = RL.TRACKS[trackKey];
  const harsh = t.weather.find((x) => x !== 'clear') || 'clear';
  const w = Math.random() < 0.15 + league * 0.12 ? harsh : t.weather[0];
  return { weather: league === 1 && Math.random() < 0.65 ? 'clear' : w, time: RL.TIMES[t.times[Math.floor(Math.random() * t.times.length)]].name ? pickTime(t) : 'day' };
}
function pickTime(t) { return t.times[Math.floor(Math.random() * t.times.length)]; }
function condText(c) { return (RL.WEATHER[c.weather] || RL.WEATHER.clear).name + ' · ' + (RL.TIMES[c.time] || RL.TIMES.day).name; }

function showOffice() {
  const s = career.state;
  const conds = {};
  const v = { title: 'Race Office', tab: 'L' + s.league, sideTrack: 0, render: () => {
    const leagues = [];
    for (let i = 1; i <= s.league; i++) leagues.push(['L' + i, 'League ' + i]);
    leagues.push(['side', 'Side']);
    leagues.push(['drag', 'Drag']);
    let h = '<div class="row"><button data-act="custom">Custom Race</button><button data-act="editor">Track Editor</button></div>' + tabs(v, leagues);
    if (v.tab === 'drag') {
      h += '<p>Quarter mile on the east strip. Staged launch, five gears, perfect-shift bonus. The rival scales with your league.</p>';
      h += '<div class="row"><button class="primary" data-act="drag">Stage a race</button></div>';
      if (s.records && s.records.drag) h += '<p class="small">Best ET ' + fmtTime(s.records.drag) + '</p>';
      return h;
    }
    if (v.tab === 'side') {
      const tracks = sideTracks();
      const tk = tracks[v.sideTrack % tracks.length];
      const key = 'side_' + tk;
      if (!conds[key]) conds[key] = { weather: rollWeather(tk, s.league), time: pickTime(RL.TRACKS[tk]) };
      h += '<div class="card"><div>Track <b>' + RL.TRACKS[tk].name + '</b> <span class="small">' + condText(conds[key]) + '</span></div><div class="btns"><button data-act="nexttrack">Change track</button></div></div>';
      h += RL.SIDE_EVENTS.map((e) => '<div class="card"><div><b>' + e.icon + ' ' + e.name + '</b><div class="small">' + e.desc + '</div></div><div class="btns"><button data-act="side" data-arg="' + e.type + '">Start</button></div></div>').join('');
      h += '<p class="small dim">Street challenges are parked around the city. Look for the gold glow.</p>';
      return h;
    }
    const n = Number(v.tab.slice(1));
    const L = career.leagueData(n);
    const lp = career.leagueProgress(n);
    h += '<h3 style="color:' + L.color + '">' + L.name + '</h3><p class="small">Top 3 clears a race. Purse ' + fmtMoney(L.prize) + '.</p>';
    h += L.races.map((r, i) => {
      const key = n + '_' + i;
      if (!conds[key]) conds[key] = { weather: rollWeather(r.track, n), time: pickTime(RL.TRACKS[r.track]) };
      const tr = RL.TRACKS[r.track];
      return '<div class="card"><div><b>' + (lp.races[i] ? '✔ ' : '') + r.name + '</b><div class="small">' + tr.name + (r.reverse ? ' (reverse)' : '') + ' · ' + condText(conds[key]) + '</div></div><div class="btns"><button data-act="race" data-arg="' + n + ',' + i + '">Race</button></div></div>';
    }).join('');
    const b = L.boss;
    const bkey = n + '_b';
    if (!conds[bkey]) conds[bkey] = { weather: rollWeather(b.track, n), time: pickTime(RL.TRACKS[b.track]) };
    h += '<div class="card boss" style="border-color:' + b.color + '"><div><b>' + (lp.boss ? 'Boss down · ' : 'Boss · ') + b.name + '</b><div class="small">' + b.desc + '</div></div><div class="btns">' +
      (career.bossUnlocked(n) ? '<button class="primary" data-act="boss" data-arg="' + n + '">Challenge</button>' : '<span class="dim">Clear all 3 races</span>') + '</div></div>';
    return h;
  }, acts: {
    tab: (a) => { v.tab = a; },
    custom: () => showCustom(),
    editor: () => { ui.closeAll(); actions.editor && actions.editor(); },
    nexttrack: () => { v.sideTrack++; },
    race: (a) => {
      const [n, i] = a.split(',').map(Number);
      const r = career.leagueData(n).races[i];
      const c = conds[n + '_' + i];
      actions.startRace && actions.startRace({ kind: 'race', track: r.track, reverse: !!r.reverse, league: n, raceIndex: i, weather: c.weather, time: c.time, title: r.name, laps: 3 });
    },
    boss: (a) => {
      const n = Number(a), b = career.leagueData(n).boss, c = conds[n + '_b'];
      actions.startRace && actions.startRace({ kind: 'boss', track: b.track, league: n, weather: c.weather, time: c.time, title: 'BOSS: ' + b.name, laps: 3 });
    },
    side: (type) => {
      const tracks = sideTracks();
      const tk = tracks[v.sideTrack % tracks.length];
      const c = conds['side_' + tk];
      actions.startRace && actions.startRace({ kind: type, track: tk, league: career.state.league, weather: c.weather, time: c.time, title: RL.SIDE_EVENTS.find((e) => e.type === type).name, laps: 3 });
    },
    drag: () => { ui.closeAll(); actions.startDrag && actions.startDrag(); }
  } };
  open(v);
}
function rollWeather(trackKey, league) {
  const t = RL.TRACKS[trackKey];
  const harsh = t.weather.find((x) => x !== 'clear') || 'clear';
  if (league === 1 && Math.random() < 0.65) return 'clear';
  return Math.random() < 0.15 + league * 0.12 ? harsh : t.weather[0];
}
function sideTracks() {
  const out = [];
  for (let i = 1; i <= career.state.league; i++) career.leagueData(i).races.forEach((r) => { if (!out.includes(r.track)) out.push(r.track); });
  return out.length ? out : ['oval'];
}
function showHQ() {
  const v = { title: 'HQ', render: () => {
    const s = career.state;
    const role = s.role || 'neutral';
    const wait = switchWait();
    const locked = wait > 0 || wanted.stars > 0;
    let h = '<p>' + ROLE_INFO[role].blurb + '</p>';
    h += '<p class="role-lock-copy">Current <b>' + ROLE_INFO[role].name + '</b> · ' + rankName(role) + ' · ' + (wanted.stars ? wanted.stars + ' stars' : 'clean') + '</p>';
    if (wait > 0) h += '<p class="role-lock-copy">Role change locked <b id="role-lock-inline">' + formatLock(wait) + '</b></p>';
    h += '<div class="row">' + ROLE_ORDER.map((id) => '<button data-act="role" data-arg="' + id + '"' + (id === role || locked ? ' disabled' : '') + '>' + ROLE_INFO[id].name + (id !== role && locked ? ' · Locked' : '') + '</button>').join('') + '</div>';
    h += ROLE_ORDER.map((id) => {
      const info = ROLE_INFO[id];
      const ri = rankIndex(s.roleXp[id] || 0);
      return '<h3 style="color:#fff">' + info.name + '</h3><p class="role-lock-copy">' + info.ranks[ri] + ' — ' + info.perks[ri] + '</p>';
    }).join('');
    if (role === 'police') h += '<div class="row"><button class="primary" data-act="pursuit">Start a pursuit</button></div>';
    if (role === 'criminal') h += '<div class="row"><button data-act="jobs">Criminal jobs</button></div>';
    return h;
  }, acts: {
    role: (id) => {
      const res = roles.switchTo(id);
      if (!res.ok && res.reason === 'cooldown') ui.toast('Role lock ' + formatLock(res.wait));
      else if (!res.ok && res.reason === 'heat') ui.toast('Lose the heat first');
      else if (res.ok) { ui.toast('Role: ' + ROLE_INFO[id].name); if (actions.restyle) actions.restyle(); }
    },
    pursuit: () => { ui.closeAll(); roles.startPursuit(); },
    jobs: () => showJobs()
  } };
  open(v);
}

function showJobs() {
  open({ title: 'Crew', render: () => '<p>Big scores. They also put stars on the car.</p>' +
    '<div class="card"><div><b>Heist</b><div class="small">Hold still in a lot, then drop the take across town.</div></div><div class="btns"><button data-act="heist">Take it</button></div></div>' +
    '<div class="card"><div><b>Smuggle</b><div class="small">Pickup and delivery. The clock is meaner than the cops.</div></div><div class="btns"><button data-act="run">Run it</button></div></div>',
  acts: {
    heist: () => { ui.closeAll(); roles.startHeist(); },
    run: () => { ui.closeAll(); roles.startSmuggle(); }
  } });
}

function showCustom() {
  const saved = listTracks();
  const classes = ['current'].concat(RL.CARS.map((c) => c.cls).filter((c, i, a) => a.indexOf(c) === i));
  const v = {
    title: 'Custom Race',
    form: { track: 'oval', laps: 3, ai: 5, diff: 1, weather: 'clear', time: 'day', damage: true, nitro: true, traffic: false, collisions: true, cls: 'current' },
    render: () => {
      const f = v.form;
      const tracks = Object.keys(RL.TRACKS).map((k) => '<option value="' + k + '"' + (f.track === k ? ' selected' : '') + '>' + RL.TRACKS[k].name + '</option>').join('') +
        saved.map((t) => '<option value="custom:' + t.id + '"' + (f.track === 'custom:' + t.id ? ' selected' : '') + '>Custom · ' + escapeHtml(t.name) + '</option>').join('');
      const opt = (arr, cur) => arr.map((x) => '<option value="' + x + '"' + (String(cur) === String(x) ? ' selected' : '') + '>' + x + '</option>').join('');
      return '<div class="setting"><span>Track</span><select data-field="track">' + tracks + '</select></div>' +
        '<div class="setting"><span>Laps</span><button data-act="n" data-arg="laps,-1">−</button><b>' + f.laps + '</b><button data-act="n" data-arg="laps,1">+</button></div>' +
        '<div class="setting"><span>AI cars</span><button data-act="n" data-arg="ai,-1">−</button><b>' + f.ai + '</b><button data-act="n" data-arg="ai,1">+</button></div>' +
        '<div class="setting"><span>AI skill</span><button data-act="diff" data-arg="-1">−</button><b>' + f.diff.toFixed(2) + '</b><button data-act="diff" data-arg="1">+</button></div>' +
        '<div class="setting"><span>Weather</span><select data-field="weather">' + opt(['clear', 'rain', 'snow', 'dust'], f.weather) + '</select></div>' +
        '<div class="setting"><span>Time</span><select data-field="time">' + opt(['day', 'dusk', 'night'], f.time) + '</select></div>' +
        '<div class="setting"><span>Class</span><select data-field="cls">' + classes.map((c) => '<option value="' + c + '"' + (f.cls === c ? ' selected' : '') + '>' + (c === 'current' ? 'Your car' : c) + '</option>').join('') + '</select></div>' +
        '<div class="setting"><span>Damage</span><button data-act="tog" data-arg="damage">' + (f.damage ? 'ON' : 'OFF') + '</button></div>' +
        '<div class="setting"><span>Nitro</span><button data-act="tog" data-arg="nitro">' + (f.nitro ? 'ON' : 'OFF') + '</button></div>' +
        '<div class="setting"><span>Traffic</span><button data-act="tog" data-arg="traffic">' + (f.traffic ? 'ON' : 'OFF') + '</button></div>' +
        '<div class="setting"><span>Collisions</span><button data-act="tog" data-arg="collisions">' + (f.collisions ? 'ON' : 'OFF') + '</button></div>' +
        '<div class="row"><button class="primary" data-act="go">Grid up</button><button data-act="editor">Open editor</button></div>';
    },
    acts: {
      n: (arg) => {
        const [k, d] = arg.split(',');
        const lim = { laps: [1, 10], ai: [0, 8] }[k];
        v.form[k] = Math.max(lim[0], Math.min(lim[1], v.form[k] + Number(d)));
      },
      diff: (d) => { v.form.diff = Math.max(0.6, Math.min(1.35, Math.round((v.form.diff + Number(d) * 0.05) * 100) / 100)); },
      tog: (k) => { v.form[k] = !v.form[k]; },
      editor: () => { ui.closeAll(); actions.editor && actions.editor(); },
      go: () => {
        const f = v.form;
        const cfg = {
          kind: 'custom', laps: f.laps, aiCount: f.ai, aiDiff: f.diff, weather: f.weather, time: f.time,
          damage: f.damage, nitro: f.nitro, traffic: f.traffic, collisions: f.collisions, carClass: f.cls,
          league: career.state.league, title: 'Custom Race'
        };
        if (String(f.track).startsWith('custom:')) {
          cfg.customId = String(f.track).slice(7);
          const found = saved.find((t) => t.id === cfg.customId);
          cfg.title = found ? found.name : 'Custom';
        } else {
          cfg.track = f.track;
          cfg.title = (RL.TRACKS[f.track] && RL.TRACKS[f.track].name) || 'Custom Race';
        }
        ui.closeAll();
        actions.startRace && actions.startRace(cfg);
      }
    }
  };
  open(v);
}

function showTraining() {
  open({ title: 'Training Track', render: () => '<p>Three solo laps on the oval. Clean laps and drift both pay XP. No purse.</p><p class="small">Sessions <b class="hl">' + career.state.totals.training + '</b></p><div class="row"><button class="primary" data-act="go">Start</button></div>',
    acts: { go: () => actions.startRace && actions.startRace({ kind: 'training', track: 'oval', league: career.state.league, weather: 'clear', time: 'day', title: 'Training', laps: 3 }) } });
}
function showBar() {
  open({ title: 'Neon Bar', render: () => {
    const s = career.state;
    const npcs = Object.keys(RL.NPCS).filter((id) => !RL.NPCS[id].requires || s.flags[RL.NPCS[id].requires]);
    return npcs.map((id) => {
      const n = RL.NPCS[id];
      return '<div class="card"><div><i class="swatch" style="background:' + n.color + '"></i> <b>' + n.name + '</b>' + (!s.talked[id] ? ' <span class="new">NEW</span>' : '') + '</div><div class="btns"><button data-act="talk" data-arg="' + id + '">Talk</button></div></div>';
    }).join('');
  }, acts: { talk: (id) => dialogue(id) } });
}
function dialogue(npcId, nodeId) { open(dialogueView(npcId, nodeId || RL.NPCS[npcId].start)); }
function dialogueView(npcId, nid) {
  const npc = RL.NPCS[npcId], node = npc.nodes[nid];
  return { title: npc.name, cls: 'dialog', render: () => '<div class="speaker" style="color:' + npc.color + '">' + npc.name + '</div><p>' + escapeHtml(node.text) + '</p><div class="choices">' +
    node.choices.map((c, i) => '<button data-act="choose" data-arg="' + i + '">' + escapeHtml(c.t) + '</button>').join('') + '</div>',
    acts: { choose: (i) => {
      const c = node.choices[Number(i)];
      career.state.talked[npcId] = true;
      applyEffects(c.effects);
      if (c.next) replace(dialogueView(npcId, c.next));
      else ui.back();
      needSave();
    } } };
}
function applyEffects(e) {
  if (!e) return;
  const s = career.state;
  if (e.money) { career.addMoney(e.money); ui.toast((e.money > 0 ? '+' : '') + fmtMoney(e.money), '#7dff5a'); audio.play('coin'); }
  if (e.respect) { s.respect += e.respect; ui.toast('Respect ' + (e.respect > 0 ? '+' : '') + e.respect, '#ffe03b'); }
  if (e.xp) career.addXP(e.xp);
  if (e.flag) s.flags[e.flag] = true;
  if (e.quest) career.startQuest(e.quest);
  if (e.talk) career.event('talk', { npc: e.talk });
}
const STORY = {
  intro: { who: 'Mags (Mechanic)', color: '#ffe03b', lines: ['Welcome to Redline City, {name}. Nobody knows your name. Yet.', 'Four leagues sit between you and the Phantom. Your Pip Hatch is ugly and it is yours.', 'The signs are drivable. Race Office when you want a grid. Or just see where the streets go.'],
    choices: [{ t: 'I race for the money. (+$200)', effects: { money: 200 } }, { t: 'I race for respect. (+5)', effects: { respect: 5 } }] },
  boss1: { who: 'Brick Malone', color: '#ff8a2e', lines: ['Nobody gets past the Brick. Except you, apparently.', 'The Vipers saw that. Vex will want a word. Try the bar.'] },
  boss2: { who: 'Sidewinder Sal', color: '#ffe03b', lines: ['The desert respects you now.', 'Up in the mountains the ice is cruel, and Vex is crueler. Bring tires.'] },
  boss3: { who: 'Vex (Vipers Crew)', color: '#7dff5a', lines: ['You beat me. On my own ice.', 'The Phantom has noticed. That is worse.'],
    choices: [{ t: 'Offer a handshake. (+10 respect)', effects: { respect: 10 } }, { t: 'Take the bet. (+$3000)', effects: { money: 3000 } }] },
  boss4: { who: 'The Phantom', color: '#ffffff', lines: ['The helmet comes off. It is Mags.', 'I was the last legend. I needed to know someone could take it.', 'Redline City has a new one: {name}. The streets are still open.'] }
};
function showStory(key) {
  const st = STORY[key];
  if (!st) return;
  let i = 0;
  const v = { title: st.who, cls: 'dialog', noClose: true, render: () => {
    const line = st.lines[i].replace(/\{name\}/g, escapeHtml(career.state.name));
    const last = i === st.lines.length - 1;
    return '<div class="speaker" style="color:' + st.color + '">' + st.who + '</div><p>' + line + '</p><div class="choices">' +
      (last && st.choices ? st.choices.map((c, k) => '<button data-act="choose" data-arg="' + k + '">' + escapeHtml(c.t) + '</button>').join('') : '<button class="primary" data-act="next">' + (last ? 'Close' : 'Next') + '</button>') + '</div>';
  }, acts: {
    next: () => { if (i < st.lines.length - 1) i++; else ui.back(); },
    choose: (k) => { applyEffects(st.choices[Number(k)].effects); needSave(); ui.back(); }
  } };
  open(v);
}
ui.openStory = showStory;

function showQuests() {
  open({ title: 'Quest Log', render: () => {
    const q = career.state.quests;
    const item = (id, done) => { const d = RL.QUESTS[id]; return '<div class="card ' + (done ? 'done' : '') + '"><div><b>' + (d.main ? '★ ' : '') + d.title + '</b><div class="small">' + d.desc + '</div></div></div>'; };
    let h = '<h3>Active</h3>' + (q.active.length ? q.active.map((id) => item(id, false)).join('') : '<p class="dim">Nothing active. The bar has work.</p>');
    for (let n = 1; n <= career.state.league; n++) {
      const lp = career.leagueProgress(n);
      h += '<div class="small">League ' + n + ': ' + lp.races.filter(Boolean).length + '/3 · boss ' + (lp.boss ? 'beaten' : 'waiting') + '</div>';
    }
    if (q.done.length) h += '<h3>Done</h3>' + q.done.map((id) => item(id, true)).join('');
    return h;
  } });
}
function showAchievements() {
  open({ title: 'Achievements', render: () => {
    const a = career.state.achievements;
    return '<p class="small">' + Object.keys(a).length + ' / ' + RL.ACHIEVEMENTS.length + '</p><div class="achs">' + RL.ACHIEVEMENTS.map((x) =>
      '<div class="ach ' + (a[x.id] ? 'got' : '') + '"><b>' + (a[x.id] ? '' : '· ') + x.name + '</b><span>' + x.desc + '</span></div>').join('') + '</div>';
  } });
}
function showSettings() {
  const st = settings.data;
  const v = { title: 'Settings', render: () => {
    const sl = (k, label) => '<div class="setting"><span>' + label + '</span><input type="range" min="0" max="1" step="0.05" value="' + st[k] + '" data-set="' + k + '"><em>' + Math.round(st[k] * 100) + '%</em></div>';
    let h = '<h3>Audio</h3>' + sl('master', 'Master') + sl('sfx', 'Effects') + sl('music', 'Music');
    h += '<h3>Picture</h3><div class="setting"><span>Quality</span><button data-act="q" data-arg="low">Low</button><button data-act="q" data-arg="med">Med</button><button data-act="q" data-arg="high">High</button><b>' + st.quality + '</b></div>';
    h += '<p class="small dim">Low drops shadows, bloom and most particles. High uses a 2048 shadow map and a denser city.</p>';
    h += '<div class="setting"><span>Motion blur</span><button data-act="blur">' + (st.motionBlur ? 'ON' : 'OFF') + '</button></div>';
    h += '<div class="setting"><span>City weather</span><button data-act="wx">' + st.weatherLock.toUpperCase() + '</button></div>';
    h += '<h3>City view</h3><div class="setting"><span>Graphics</span><button data-act="viewmode">Switch to 2D</button></div>';
    h += '<p class="small dim">F3 switches between this 3D city and the 2D city. Money, cars, parts, story, roles, and heat stay on one save. V cycles the camera.</p>';
    h += '<h3>Camera</h3><div class="setting"><span>View</span>' +
      [['third', 'Chase'], ['first', 'Cockpit'], ['second', 'Front'], ['top', 'Top']].map(([id, name]) =>
        '<button data-act="cam" data-arg="' + id + '"' + (st.camera === id ? ' class="on"' : '') + '>' + name + '</button>').join('') + '</div>';
    h += '<div class="setting"><span>Top-down</span><button data-act="topnorth">' + (st.topNorth === false ? 'CAR-UP' : 'NORTH-UP') + '</button></div>';
    h += '<p class="small dim">V or CAM cycles these. Left turns the car left in every view, including the front camera that looks back at you. Top-down is north-up or car-up, and it stays above the roofs.</p>';
    h += '<h3>Controls</h3><div class="setting"><span>Touch</span><button data-act="touch">' + st.touch.toUpperCase() + '</button></div>';
    h += '<div class="setting"><span>Steer</span><button data-act="sens" data-arg="-1">−</button><b>' + st.sensitivity.toFixed(1) + '</b><button data-act="sens" data-arg="1">+</button></div>';
    h += '<div class="setting"><span>Shake</span><button data-act="shake">' + (st.shake ? 'ON' : 'OFF') + '</button></div>';
    h += '<h3>Keys</h3>' + Object.keys(ACTION_NAMES).map((a) => '<div class="setting"><span>' + ACTION_NAMES[a] + '</span><span class="keys">' + (st.keys[a] || []).map((c) => '<kbd>' + input.keyName(c) + '</kbd>').join(' ') + '</span><button data-act="rebind" data-arg="' + a + '">' + (v.waiting === a ? 'Press a key…' : 'Rebind') + '</button></div>').join('');
    h += '<div class="row"><button data-act="resetkeys">Reset keys</button></div>';
    return h;
  }, acts: {
    viewmode: () => { window.__RL3_requestView && window.__RL3_requestView(); },
    cam: (id) => { if (actions.setCamera) actions.setCamera(id); },
    topnorth: () => { if (actions.setTopNorth) actions.setTopNorth(st.topNorth === false); },
    q: (q) => { st.quality = q; settings.save(); actions.quality && actions.quality(q); },
    blur: () => { st.motionBlur = !st.motionBlur; settings.save(); actions.quality && actions.quality(st.quality); },
    wx: () => { const o = ['auto', 'clear', 'rain', 'snow', 'dust']; st.weatherLock = o[(o.indexOf(st.weatherLock) + 1) % o.length]; settings.save(); actions.weather && actions.weather(st.weatherLock); },
    touch: () => { st.touch = { auto: 'on', on: 'off', off: 'auto' }[st.touch]; applyTouch(); settings.save(); },
    sens: (d) => { st.sensitivity = Math.max(0.5, Math.min(1.6, Math.round((st.sensitivity + Number(d) * 0.1) * 10) / 10)); settings.save(); },
    shake: () => { st.shake = !st.shake; settings.save(); },
    rebind: (a) => { v.waiting = a; input.rebind((code) => { if (code !== 'Escape') st.keys[a] = [code]; v.waiting = null; settings.save(); render(false); }); },
    resetkeys: () => { st.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS)); settings.save(); }
  } };
  open(v);
}
function showPause() {
  open({ title: 'Paused', onClose: () => actions.resume && actions.resume(), render: () => '<div class="grid2"><button class="primary" data-act="resume">Resume</button><button data-act="restart">Restart</button><button data-act="photo">Photo</button><button data-act="settings">Settings</button><button data-act="quit">Quit (no reward)</button></div>',
    acts: {
      resume: () => ui.closeAll(),
      restart: () => actions.restart && actions.restart(),
      photo: () => { ui.closeAll(); actions.photo && actions.photo(); },
      settings: showSettings,
      quit: () => { ui.closeAll(); actions.quit && actions.quit(); }
    } });
}
function showResults(sum) {
  const r = sum.res, cfg = r.cfg;
  let headline = 'Finished';
  if (cfg.kind === 'timetrial') headline = r.position === 1 ? 'Par beaten' : 'Missed par';
  else if (cfg.kind === 'drift') headline = r.position === 1 ? 'Drift target smashed' : 'Drift target missed';
  else if (cfg.kind === 'training') headline = 'Training complete';
  else if (cfg.kind === 'ghost') headline = r.position === 1 ? 'Ghost beaten' : 'The ghost wins';
  else if (cfg.kind === 'drag') headline = r.foul ? 'Foul' : (r.position === 1 ? 'Quarter won' : 'Quarter lost');
  else if (cfg.kind === 'street') headline = r.position === 1 ? 'Streets won' : 'They got there first';
  else headline = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'][r.position] || (r.position + 'th');
  open({ title: 'Results', noClose: true, cls: 'results', render: () => {
    let h = '<div class="headline">' + headline + '</div>';
    if (cfg.kind === 'drag') h += '<p>ET ' + fmtTime(r.totalTime || 0) + (r.reaction != null ? ' · reaction ' + r.reaction.toFixed(3) + 's' : '') + ' · perfect shifts ' + (r.perfectShifts || 0) + '</p>';
    if (cfg.kind === 'timetrial') h += '<p>Your time ' + fmtTime(r.totalTime || Infinity) + ' · par ' + fmtTime(r.par) + '</p>';
    if (cfg.kind === 'drift') h += '<p>Drift ' + r.drift + ' / ' + r.driftTarget + '</p>';
    if (r.standings && r.standings.length > 1 && cfg.kind !== 'training') {
      h += '<table class="standings">' + r.standings.map((s, i) => '<tr class="' + (s.isPlayer ? 'me' : '') + '"><td>' + (i + 1) + '</td><td>' + escapeHtml(s.name) + '</td><td>' + (s.out ? 'OUT' : s.time ? fmtTime(s.time) : '—') + '</td></tr>').join('') + '</table>';
    }
    h += '<div class="rewards"><div>+' + fmtMoney(sum.money) + '</div><div>+' + sum.xp + ' XP</div><div>' + (r.topSpeed || 0) + ' km/h</div></div>';
    if (sum.drop) h += partCard(sum.drop, '');
    h += (sum.notes || []).map((n) => '<p class="note">' + escapeHtml(n) + '</p>').join('');
    return h + '<div class="row"><button class="primary" data-act="cont">Continue</button><button data-act="again">Again</button></div>';
  }, acts: {
    cont: () => { ui.closeAll(); actions.toHub && actions.toHub(); },
    again: () => { const c = Object.assign({}, cfg); ui.closeAll(); actions.again && actions.again(c); }
  } });
}

export function bootError(err) {
  const el = $('boot-error');
  if (!el) return;
  el.hidden = false;
  el.textContent = 'Redline Legends 3D failed to start: ' + (err && err.message ? err.message : err);
}
