/* ui.js - DOM-based menus layered over the canvas: title screen, hub HUD,
   Garage, Race Office, Shop, Bar dialogue, Training, Inventory, Skill Tree,
   Quest Log, Achievements, Settings, pause & results. Every menu is usable with
   mouse/touch and keyboard (arrows move focus, Enter selects, Esc goes back). */
RL.UI = (function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let stack = [], panel, mode = 'title', storyFlushTimer = false;
  const G = () => RL.Game, S = () => RL.Game.state;

  /* ---------------- Panel stack ---------------- */
  // view = { title, render():html, acts:{name:fn(arg)}, cls, tab, onClose }
  function open(view) { stack.push(view); render(true); }
  function replace(view) { stack.pop(); stack.push(view); render(true); }
  function render(focusFirst) {
    const v = stack[stack.length - 1];
    if (!v) { panel.className = 'panel'; panel.innerHTML = ''; return; }
    const prevFocus = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;
    panel.className = 'panel open ' + (v.cls || '');
    panel.innerHTML = (v.noHead ? '' : '<div class="panel-head"><h2>' + v.title + '</h2>' + (v.noClose ? '' : '<button class="x" data-act="back" title="Back (Esc)">✕</button>') + '</div>') +
      '<div class="panel-body">' + v.render() + '</div>';
    // give every actionable element a stable key so focus survives re-renders
    panel.querySelectorAll('[data-act]').forEach((el, i) => (el.dataset.key = el.dataset.act + ':' + (el.dataset.arg || '') + ':' + i));
    const again = prevFocus && panel.querySelector('[data-key="' + prevFocus + '"]');
    if (again && !focusFirst) again.focus();
    else if (v.focus && panel.querySelector(v.focus)) panel.querySelector(v.focus).focus({ preventScroll: true });
    else { const f = panel.querySelector('.primary:not([disabled])') || panel.querySelector('.panel-body [data-act]:not([disabled])') || panel.querySelector('[data-act]'); if (f) f.focus({ preventScroll: true }); }
    updateHud();
  }
  function back() {
    const v = stack.pop();
    if (v && v.onClose) v.onClose();
    if (stack.length) render(true); else closeAll();
  }
  function closeAll() {
    const had = stack.length; stack = []; panel.className = 'panel'; panel.innerHTML = '';
    if (had && RL.Race.state && RL.Race.state.paused) RL.Race.resume();
    RL.Input.clear(); updateHud();
    flushStories();
  }
  function isOpen() { return stack.length > 0; }
  function refresh() { if (stack.length) render(false); }

  function onPanelClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    RL.Audio.init();
    const v = stack[stack.length - 1], act = el.dataset.act, arg = el.dataset.arg;
    if (act === 'back') { RL.Audio.play('click'); back(); return; }
    if (v && v.acts && v.acts[act]) { RL.Audio.play('click'); v.acts[act](arg, el); if (stack[stack.length - 1] === v) refresh(); }
  }
  /* Keyboard navigation inside menus */
  function onKey(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'TEXTAREA') { if (e.code === 'Escape' && stack.length) { e.preventDefault(); back(); } return; }
    if (tag === 'INPUT' && e.target.type === 'text') {
      if (e.code === 'Enter') {
        const b = (e.target.id === 'room-code-input' && panel.querySelector('[data-act="join"]')) || panel.querySelector('.primary');
        if (b) b.click();
      }
      return;
    }
    if (stack.length) {
      const nav = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, KeyS: 1, KeyD: 1, KeyW: -1, KeyA: -1, Tab: e.shiftKey ? -1 : 1 }[e.code];
      if (nav && !(document.activeElement && document.activeElement.type === 'range' && /Left|Right|KeyA|KeyD/.test(e.code))) {
        e.preventDefault();
        const items = Array.from(panel.querySelectorAll('[data-act]:not([disabled]), input[type=range]'));
        if (!items.length) return;
        let i = items.indexOf(document.activeElement);
        i = i < 0 ? 0 : (i + nav + items.length) % items.length;
        items[i].focus(); items[i].scrollIntoView({ block: 'nearest' });
      }
      return;
    }
    if (mode === 'hub') {
      const k = { KeyI: showInventory, KeyK: showSkills, KeyJ: showQuests, KeyG: () => showGarage() }[e.code];
      if (k) { e.preventDefault(); RL.Audio.init(); k(); }
    }
  }

  /* ---------------- Toasts & HUD ---------------- */
  function toast(text, color) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; t.style.borderColor = color || '#2ee6ff';
    $('toasts').appendChild(t); setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 3800);
  }
  function updateHud() {
    const s = S(); if (!s || mode !== 'hub') return;
    const need = RL.xpForLevel(s.level);
    $('hud-name').textContent = s.name + ' · Lv ' + s.level;
    $('hud-xp').style.width = (100 * s.xp / need) + '%';
    $('hud-xptext').textContent = s.xp + ' / ' + need + ' XP';
    $('hud-money').textContent = RL.fmtMoney(s.money);
    $('hud-league').textContent = 'League ' + s.league + ': ' + G().leagueData(s.league).name;
    $('hud-respect').textContent = '★ ' + s.respect;
    $('hud-points').textContent = (s.skillPoints || s.statPoints) ? (s.skillPoints + ' SP · ' + s.statPoints + ' stat pts') : '';
    const car = G().currentCar();
    $('hud-car').textContent = G().carDef(car.id).name + ' · dmg ' + Math.round(car.damage) + '%';
  }
  function setMode(m) {
    mode = m;
    document.body.classList.remove('mode-title', 'mode-hub', 'mode-race', 'mode-editor');
    document.body.classList.add('mode-' + m);
    applyTouch();
    if (m === 'title') {
      $('btn-continue').disabled = !G().hasSave();
      const cont = $('btn-continue'); if (G().hasSave()) cont.focus(); else $('btn-new').focus();
    }
    updateHud();
  }
  function applyTouch() {
    const t = RL.settings.touch, auto = ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer:coarse)').matches);
    document.body.classList.toggle('touch', t === 'on' || (t === 'auto' && auto));
  }

  /* ---------------- Shared widgets ---------------- */
  function statBars(st, base) {
    return '<div class="stats">' + RL.STAT_ORDER.map((k) => {
      const v = st[k], b = base ? base[k] : v;
      return '<div class="stat"><span>' + RL.STAT_NAMES[k] + '</span><div class="bar"><i style="width:' + Math.min(100, b / 1.3) + '%"></i>' +
        (v > b ? '<b style="left:' + (b / 1.3) + '%;width:' + Math.min(100 - b / 1.3, (v - b) / 1.3) + '%"></b>' : '') + '</div><em>' + v + '</em></div>';
    }).join('') + '</div>';
  }
  function partCard(p, buttons) {
    const r = RL.RARITIES[p.rarity];
    const st = Object.keys(p.stats).map((k) => '+' + p.stats[k] + ' ' + RL.STAT_NAMES[k]).join(', ');
    return '<div class="card part" style="border-color:' + r.color + '"><div><span class="rar" style="color:' + r.color + '">' + r.name + '</span> ' +
      RL.SLOTS[p.slot].icon + ' <b>' + esc(p.name) + '</b>' + (p.color ? ' <span class="swatch" style="background:' + p.color + '"></span>' : '') +
      '<div class="small">' + st + (G().isEquipped(p.uid) ? ' · <span class="eq">EQUIPPED</span>' : '') + '</div></div><div class="btns">' + (buttons || '') + '</div></div>';
  }
  const tabs = (v, list) => '<div class="tabs">' + list.map(([id, name]) => '<button data-act="tab" data-arg="' + id + '" class="' + (v.tab === id ? 'on' : '') + '">' + name + '</button>').join('') + '</div>';
  function needSave() { G().save(); updateHud(); }

  /* ---------------- Title & new game ---------------- */
  function newGameFlow() {
    const go = () => replaceOrOpen({ title: 'New Game', render: () => '<p>Every legend starts as a nobody. What do they call you on the street?</p>' +
      '<input id="nameInput" type="text" maxlength="14" value="Rookie" autocomplete="off"><div class="row"><button class="primary" data-act="start">Start Career ▶</button></div>',
      acts: { start: () => {
        const n = ($('nameInput').value || 'Rookie').trim().slice(0, 14) || 'Rookie';
        G().newState(n); closeAll(); G().toHub(); showStory('intro');
      } } });
    if (G().hasSave()) open({ title: 'Start Over?', render: () => '<p>Starting a new game will overwrite your current save.</p><div class="row"><button class="primary" data-act="yes">Yes, new career</button><button data-act="back">Cancel</button></div>', acts: { yes: go } });
    else go();
    setTimeout(() => { const i = $('nameInput'); if (i) { i.focus(); i.select(); } }, 30);
  }
  function replaceOrOpen(v) { if (stack.length) replace(v); else open(v); }
  function continueGame() { if (G().load()) { closeAll(); G().toHub(); toast('Welcome back, ' + S().name + '!'); } }

  /* ---------------- Hub menu (Esc) ---------------- */
  function showMenu() {
    open({ title: 'Menu', render: () => '<div class="grid2">' +
      '<button data-act="inv">🎒 Inventory <kbd>I</kbd></button><button data-act="skills">✦ Skills & Stats <kbd>K</kbd></button>' +
      '<button data-act="quests">📜 Quest Log <kbd>J</kbd></button><button data-act="ach">🏆 Achievements</button>' +
      '<button data-act="garage">🔧 Garage <kbd>G</kbd></button><button data-act="settings">⚙ Settings</button>' +
      '<button data-act="help">❓ How to Play</button><button data-act="freeplay">🏁 Free Play</button>' +
      '<button data-act="editor">✎ Track Editor</button><button data-act="community">🌐 Community Tracks</button>' +
      '<button data-act="online">🌐 Multiplayer</button><button data-act="phone">📱 Phone</button>' +
      '<button data-act="title">⏏ Save & Quit to Title</button></div>',
      acts: { inv: showInventory, skills: showSkills, quests: showQuests, ach: showAchievements, garage: () => showGarage(), settings: showSettings, help: showHelp,
        freeplay: () => RL.FreePlay && RL.FreePlay.open(),
        editor: () => { if (RL.Editor) { closeAll(); RL.Editor.open(); } },
        community: () => RL.Community && RL.Community.open(),
        online: () => RL.Net && RL.Net.openMenu(),
        title: () => { G().save(); closeAll(); G().toTitle(); },
        phone: () => { closeAll(); if (RL.Phone) RL.Phone.open(); } } });
  }
  function showHelp() {
    open({ title: 'How to Play', render: () => '<ul class="help">' +
      '<li><b>City:</b> drive with <kbd>↑/W</kbd> gas, <kbd>↓/S</kbd> brake, <kbd>←→/AD</kbd> steer. <kbd>E</kbd> parks at a door or talks. <kbd>M</kbd> opens the city map. <kbd>C</kbd> or STEAL takes a stopped traffic car (free roam only). <kbd>L</kbd> siren when you are police. <kbd>F</kbd> photo, <kbd>H</kbd> dailies.</li>' +
      '<li><b>Heat:</b> one star is a couple of real offenses, not a nudge. Clipping a sign or a slow bump adds nothing. Wrecking cars, destroying a cruiser, and a long speeder add heat. Four and five stars take a sustained spree. Heat falls when you drive clean, and a star only drops once the police lose sight of you. The green <b>bounty</b> next to the stars is what a clean escape pays. It follows your peak stars.</li>' +
      '<li><b>Police:</b> one star is one cruiser, slower than a decent car and slow to turn. More stars bring more units, then a roadblock, spikes, and a helicopter. A hard turn or handbrake can open a gap. They box you in only at high stars, and a bust takes a while if you keep moving. Stop, wreck, hop out, or get boxed in and officers jump out on foot. At four and five stars a few armed rivals pile out too. Their swings and shots flash a yellow warning first, and you can step out of range. The HP bar follows you on foot and in the car. At zero you go down: <b>Busted</b> if the police landed it, <b>Wasted</b> otherwise. You respawn at the nearest garage or hospital and pay a capped fee. Get back in a car and drive to shake the foot chase.</li>' +
      '<li><b>Stolen cars:</b> traffic comes in tiers. Beaters are common and slow. Sports and the rare exotic are quicker and tougher. Stealing adds heat and does not pay. The car is not added to your garage. Races and the drag strip always use the car you own. At 100% damage a stolen car still explodes. You end up back in your own car, or on foot if it is parked nearby.</li>' +
      '<li><b>Race:</b> <kbd>↑/W</kbd> gas, <kbd>↓/S</kbd> brake/reverse, <kbd>←→/AD</kbd> steer, <kbd>Space</kbd> drift, <kbd>Shift/N</kbd> nitro, <kbd>Esc/P</kbd> pause. A blown engine respawns at the last checkpoint with a time penalty.</li>' +
      '<li><b>Drag:</b> at the dragway, pick 1/4 or 1/2 mile. Hold gas and brake for launch control, release the brake on green. The shift light is green (good), a flash (perfect), or red (late). <kbd>Q</kbd>, <kbd>E</kbd>, or Space shifts. <kbd>N</kbd> or Shift is nitro. Stakes pay double if you win and are lost if you quit. A pink slip adds that rival\'s car once and will not take your last car or copy one you own.</li>' +
      '<li><b>Phone:</b> <kbd>B</kbd> or the TXT button. Threads stay in the save. UNKNOWN will text at story beats and can be answered freely. The reply uses the same in-browser model as bar chat, or a scripted fallback when WebGPU is off. Chat does not pay. The strip job pays once from the quest log.</li>' +
      '<li><b>Call car:</b> <kbd>V</kbd>, the CAR button, or Call car on the phone. Your selected garage car parks beside you. It does not copy a car into the garage. It waits a few seconds between calls, and it will not come during a 3-star chase or while you are busted.</li>' +
      '<li>Hold drift while turning to slide. Drifting fills the nitro bar; fire nitro on straights.</li>' +
      '<li>Tuck in behind a rival for a <b>slipstream</b> speed boost. Grass slows you, walls damage you.</li>' +
      '<li>Finish top 3 in all three league races to unlock the <b>boss race</b>. Win it to get promoted.</li>' +
      '<li>Story scenes play between races. Dialogue choices stick: money, respect, and who still rides with you.</li>' +
      '<li><b>Multiplayer:</b> from the title screen, the city menu, or the Race Office, host a room and share the 4-character code. Friends join on the same code. Unlocked circuits, saved tracks, and community tracks you have open are on the list. AI fills empty spots. League progress is not affected.</li>' +
      '<li>Level up for skill points (perks) and stat points (Reflexes, Control, Nerve, Tactics).</li>' +
      '<li>Equip parts and tune in the Garage. Repair damage there too, because damage slows you down.</li>' +
      '<li><b>Bar:</b> scripted talk always works. Chat freely (Settings) runs a small model in your browser. No account or API key.</li>' +
      '<li><b>AI difficulty</b> (Settings): Easy, Normal, Hard, or Legend. It scales league races, bosses, and Free Play. Free Play also has its own field ladder.</li>' +
      '<li><b>Free Play</b> (Race Office or Esc menu): any circuit, 1–10 laps, 0–11 AI, weather, damage, nitro, catch-up, classes, reverse, and collisions. Saved and community tracks are on that list.</li>' +
      '<li><b>Track Editor:</b> place and drag waypoints (mouse or touch). Pinch or scroll to zoom. Save on this device, or share a short code / JSON file.</li>' +
      '<li><b>Community Tracks:</b> publish a circuit from the editor, or browse newest, top rated, and most played. Share codes still work if the community list is offline.</li></ul>' });
  }

  /* ---------------- Garage ---------------- */
  function showGarage(tab) {
    const v = { title: '🔧 Garage', tab: tab || 'car', render: () => {
      const s = S(), car = G().currentCar(), def = G().carDef(car.id), st = G().carStats(car);
      let h = tabs(v, [['car', 'Car'], ['parts', 'Parts'], ['tune', 'Tuning'], ['cars', 'My Cars'], ['driver', 'Driver']]);
      if (v.tab === 'car') {
        const cost = G().repairCost(car);
        h += '<div class="carhead"><span class="carchip" style="background:' + G().carColor(car) + '"></span><div><h3>' + def.name + '</h3><div class="small">' + def.cls + ' · damage ' + Math.round(car.damage) + '% (−' + Math.round(car.damage * 0.25) + '% top speed)</div></div></div>' +
          statBars(st, def.s) + '<div class="row"><button class="primary" data-act="repair" ' + (car.damage < 1 || s.money < cost ? 'disabled' : '') + '>Repair (' + RL.fmtMoney(cost) + ')</button>' +
          '<button data-act="tab" data-arg="parts">Upgrade parts ▸</button><button data-act="skills">Skill tree ▸</button></div>';
      } else if (v.tab === 'parts') {
        h += RL.SLOT_ORDER.map((slot) => {
          const cur = car.parts[slot] && G().findPart(car.parts[slot]);
          const avail = s.inventory.filter((p) => p.slot === slot && !G().isEquipped(p.uid));
          return '<div class="slot"><h4>' + RL.SLOTS[slot].icon + ' ' + RL.SLOTS[slot].name + '</h4>' +
            (cur ? partCard(cur, '<button data-act="unequip" data-arg="' + slot + '">Remove</button>') : '<div class="small dim">Stock part</div>') +
            avail.map((p) => partCard(p, '<button data-act="equip" data-arg="' + p.uid + '">Equip</button>')).join('') + '</div>';
        }).join('') + '<p class="small dim">Get more parts as race rewards or in the Shop.</p>';
      } else if (v.tab === 'tune') {
        const t = car.tune;
        h += '<p>Tuning trades one stat for another. Changes apply instantly.</p>' +
          '<div class="tune"><span>Gear Ratio</span><button data-act="tune" data-arg="gear,-1">◀ Accel</button><b>' + t.gear + '</b><button data-act="tune" data-arg="gear,1">Speed ▶</button></div>' +
          '<div class="small dim">+1 = +2 Top Speed, −2 Acceleration</div>' +
          '<div class="tune"><span>Downforce</span><button data-act="tune" data-arg="aero,-1">◀ Speed</button><b>' + t.aero + '</b><button data-act="tune" data-arg="aero,1">Grip ▶</button></div>' +
          '<div class="small dim">+1 = +2 Grip, −1.5 Top Speed (great for rain & snow)</div>' +
          (RL.Drag ? '<div class="row"><button data-act="draggears">Drag gear ratios</button></div>' : '') + statBars(st, def.s);
      } else if (v.tab === 'cars') {
        h += s.cars.map((c) => { const d = G().carDef(c.id); return '<div class="card"><div><span class="carchip" style="background:' + G().carColor(c) + '"></span> <b>' + d.name + '</b> <span class="small">' + d.cls + ' · dmg ' + Math.round(c.damage) + '%</span></div><div class="btns">' +
          (c.uid === s.currentCar ? '<span class="eq">DRIVING</span>' : '<button data-act="drive" data-arg="' + c.uid + '">Drive</button>') + '</div></div>'; }).join('');
      } else h += driverHtml();
      return h;
    }, acts: {
      tab: (a) => { v.tab = a; }, skills: showSkills,
      repair: () => {
        const paid = G().repair();
        if (paid > 0) { RL.Audio.play('coin'); toast('Car repaired'); needSave(); }
        else if (paid === 0) needSave();
        else RL.Audio.play('error');
      },
      equip: (uid) => { if (!G().equipPart(uid)) { RL.Audio.play('error'); return; } RL.Audio.play('confirm'); needSave(); },
      unequip: (slot) => { delete G().currentCar().parts[slot]; needSave(); },
      tune: (a) => { const [k, d] = a.split(','), t = G().currentCar().tune; t[k] = RL.clamp(t[k] + Number(d), -3, 3); needSave(); },
      draggears: () => { if (RL.Drag) RL.Drag.showGears(); },
      drive: (uid) => { S().currentCar = uid; needSave(); toast('Switched car'); },
      stat: (k) => { if (G().raiseStat(k)) RL.Audio.play('confirm'); else RL.Audio.play('error'); }
    } };
    open(v);
  }
  function driverHtml() {
    const s = S();
    return '<p>Stat points: <b class="hl">' + s.statPoints + '</b> (2 per level, max 20 each)</p>' + Object.keys(RL.DRIVER_STATS).map((k) =>
      '<div class="card"><div><b>' + RL.DRIVER_STATS[k].name + ' ' + s.stats[k] + '</b><div class="small">' + RL.DRIVER_STATS[k].desc + '</div></div><div class="btns"><button data-act="stat" data-arg="' + k + '" ' + (s.statPoints < 1 || s.stats[k] >= 20 ? 'disabled' : '') + '>+1</button></div></div>').join('');
  }

  /* ---------------- Skill tree ---------------- */
  function showSkills() {
    open({ title: '✦ Skills & Driver Stats', cls: 'wide', render: () => {
      const s = S();
      let h = driverHtml() + '<h3>Perk Tree · Skill points: <span class="hl">' + s.skillPoints + '</span></h3><div class="tree">';
      for (const br of ['reflexes', 'control', 'nerve', 'tactics']) {
        h += '<div class="branch"><h4>' + RL.DRIVER_STATS[br].name + '</h4>' + RL.PERKS.filter((p) => p.branch === br).map(perkBtn).join('') + '</div>';
      }
      return h + '</div><div class="cap">' + RL.PERKS.filter((p) => p.branch === 'capstone').map(perkBtn).join('') + '</div>';
    }, acts: {
      perk: (id) => { if (G().unlockPerk(id)) toast('Perk unlocked: ' + RL.PERKS.find((p) => p.id === id).name, '#c86bff'); else RL.Audio.play('error'); updateHud(); },
      stat: (k) => { if (G().raiseStat(k)) RL.Audio.play('confirm'); else RL.Audio.play('error'); }
    } });
  }
  function perkBtn(p) {
    const owned = S().perks.includes(p.id), can = G().canUnlockPerk(p);
    return '<button class="perk ' + (owned ? 'owned' : can ? 'can' : 'locked') + '" data-act="perk" data-arg="' + p.id + '" title="' + esc(p.desc) + '"><b>' + p.name + '</b><span>' + p.desc + '</span></button>';
  }

  /* ---------------- Inventory ---------------- */
  function showInventory() {
    open({ title: '🎒 Inventory', render: () => {
      const s = S();
      if (!s.inventory.length) return '<p class="dim">No parts yet. Win races or visit the Shop.</p>';
      const sorted = s.inventory.slice().sort((a, b) => RL.RARITY_ORDER.indexOf(b.rarity) - RL.RARITY_ORDER.indexOf(a.rarity));
      return '<p class="small">' + s.inventory.length + ' parts. Equip onto your current car or sell spares.</p>' + sorted.map((p) => partCard(p,
        (G().isEquipped(p.uid) ? '' : '<button data-act="equip" data-arg="' + p.uid + '">Equip</button><button data-act="sell" data-arg="' + p.uid + '">Sell ' + RL.fmtMoney(sellPrice(p)) + '</button>'))).join('');
    }, acts: {
      equip: (uid) => { if (!G().equipPart(uid)) { RL.Audio.play('error'); return; } RL.Audio.play('confirm'); needSave(); },
      sell: (uid) => { const price = G().sellPart(uid); if (price == null) { RL.Audio.play('error'); return; } RL.Audio.play('coin'); needSave(); }
    } });
  }
  function sellPrice(p) { return G().sellPrice(p); }

  /* ---------------- Shop ---------------- */
  function showShop(tab) {
    const shopTab = (tab === 'parts' || tab === 'sell' || tab === 'cars') ? tab : 'cars';
    const v = { title: '🛒 Shop', tab: shopTab, render: () => {
      const s = S(), pm = G().priceMult();
      let h = tabs(v, [['cars', 'Cars'], ['parts', 'Parts'], ['sell', 'Sell']]) + '<p class="small">Cash: <b class="hl">' + RL.fmtMoney(s.money) + '</b>' + (pm < 1 ? ' · discount ' + Math.round((1 - pm) * 100) + '% (respect/perks)' : '') + '</p>';
      if (v.tab === 'cars') {
        h += RL.CARS.map((c) => {
          const owned = s.cars.some((x) => x.id === c.id), locked = c.league > s.league, price = c.price > 0 ? G().buyPrice(c.price) : 0;
          return '<div class="card car"><div><span class="carchip" style="background:' + c.color + '"></span> <b>' + c.name + '</b> <span class="small">' + c.cls + ' · League ' + c.league + '</span>' +
            '<div class="mini">' + RL.STAT_ORDER.map((k) => '<span title="' + RL.STAT_NAMES[k] + '">' + RL.STAT_NAMES[k].slice(0, 3) + ' ' + c.s[k] + '</span>').join('') + '</div></div><div class="btns">' +
            (owned ? '<span class="eq">OWNED</span>' : locked ? '<span class="dim">🔒 League ' + c.league + '</span>' : '<button data-act="buycar" data-arg="' + c.id + '" ' + (s.money < price ? 'disabled' : '') + '>' + RL.fmtMoney(price) + '</button>') + '</div></div>';
        }).join('');
      } else if (v.tab === 'parts') {
        const maxR = Math.min(3, s.league - 1);
        h += RL.SLOT_ORDER.map((slot) => '<div class="slot"><h4>' + RL.SLOTS[slot].icon + ' ' + RL.SLOTS[slot].name + '</h4>' + RL.RARITY_ORDER.map((r, i) => {
          if (i > maxR) return '';
          const proto = G().makePart(slot, r, false), price = G().buyPrice(G().partValue(proto));
          return partCard(proto, '<button data-act="buypart" data-arg="' + slot + ',' + r + '" ' + (s.money < price ? 'disabled' : '') + '>' + RL.fmtMoney(price) + '</button>');
        }).join('') + '</div>').join('') + '<p class="small dim">Higher rarities unlock as you climb leagues.</p>';
      } else {
        const spare = s.inventory.filter((p) => !G().isEquipped(p.uid));
        h += spare.length ? spare.map((p) => partCard(p, '<button data-act="sell" data-arg="' + p.uid + '">Sell ' + RL.fmtMoney(sellPrice(p)) + '</button>')).join('') : '<p class="dim">Nothing to sell (equipped parts are hidden).</p>';
      }
      return h;
    }, acts: {
      tab: (a) => { v.tab = a; },
      buycar: (id) => {
        const c = G().carDef(id);
        if (!c || S().cars.some((x) => x.id === id) || c.league > S().league) return RL.Audio.play('error');
        const price = c.price > 0 ? G().buyPrice(c.price) : 0;
        if (!Number.isFinite(price) || price < 0 || S().money < price) return RL.Audio.play('error');
        if (price > 0) G().addMoney(-price);
        const inst = { uid: RL.uid(), id, damage: 0, parts: {}, tune: { gear: 0, aero: 0 } };
        S().cars.push(inst); S().currentCar = inst.uid; RL.Audio.play('coin'); toast('Bought ' + c.name + '! Now driving it.', '#7dff5a'); G().checkAchievements(); needSave();
      },
      buypart: (a) => {
        const [slot, r] = a.split(',');
        if (!RL.SLOTS[slot] || !RL.RARITIES[r]) return RL.Audio.play('error');
        const p = G().makePart(slot, r, false), price = G().buyPrice(G().partValue(p));
        if (!(price > 0) || S().money < price) return RL.Audio.play('error');
        G().addMoney(-price); S().inventory.push(p); RL.Audio.play('coin'); toast('Bought ' + p.name + ' - equip it in the Garage'); G().checkAchievements(); needSave();
      },
      sell: (uid) => { const price = G().sellPart(uid); if (price == null) { RL.Audio.play('error'); return; } RL.Audio.play('coin'); needSave(); }
    } };
    open(v);
  }

  /* ---------------- Race Office ---------------- */
  function rollConditions(trackKey, league) {
    const t = RL.TRACKS[trackKey];
    // early leagues mostly clear; later leagues lean towards harsh weather
    const harsh = t.weather.find((x) => x !== 'clear') || 'clear';
    const w = Math.random() < 0.15 + league * 0.15 ? harsh : t.weather[0];
    return { weather: league === 1 && Math.random() < 0.7 ? 'clear' : w, time: RL.pick(t.times) };
  }
  function condText(c) { return RL.WEATHER[c.weather].icon + ' ' + RL.WEATHER[c.weather].name + ' · ' + RL.TIMES[c.time].name; }
  function showOffice() {
    const s = S(), conds = {};
    const v = { title: '🏁 Race Office', tab: 'L' + s.league, sideTrack: 0, render: () => {
      const leagues = []; for (let i = 1; i <= s.league; i++) leagues.push(['L' + i, 'League ' + i]);
      leagues.push(['side', 'Side Events']);
      leagues.push(['free', 'Free Play']);
      let h = '<div class="card"><div><b>🌐 Online race</b><div class="small">Host a room or join with a 4-character code. 2–6 racers, AI fills the rest. Custom and community tracks are on the host list.</div></div><div class="btns"><button data-act="online">Multiplayer</button></div></div>';
      h += tabs(v, leagues);
      if (v.tab === 'free') {
        const nCustom = RL.Tracks ? RL.Tracks.allCustom().length : 0;
        h += '<p>Race any circuit with your own rules, or build one in the Track Editor. <b>' + nCustom + '</b> custom track' + (nCustom === 1 ? '' : 's') + ' saved on this device.</p>';
        h += '<div class="row"><button class="primary" data-act="freeplay">Custom Race ▶</button><button data-act="editor">Track Editor ✎</button><button data-act="community">Community Tracks</button></div>';
        h += '<p class="small">Laps, AI count and difficulty, weather, time of day, damage, nitro, catch-up, car class, reverse, and collisions. The Settings difficulty scales this field. Custom tracks can be shared with a short code or a JSON file, and show up in multiplayer lobbies.</p>';
        return h;
      }
      if (v.tab === 'side') {
        const tracks = sideTracks(), tk = tracks[v.sideTrack % tracks.length];
        const key = 'side_' + tk; if (!conds[key]) conds[key] = rollConditions(tk, s.league);
        h += '<div class="card"><div>Track: <b>' + RL.TRACKS[tk].name + '</b> <span class="small">(' + RL.THEMES[RL.TRACKS[tk].theme].name + ') · ' + condText(conds[key]) + '</span></div><div class="btns"><button data-act="nexttrack">Change track ▸</button></div></div>';
        h += RL.SIDE_EVENTS.map((e) => '<div class="card"><div><b>' + e.icon + ' ' + e.name + '</b><div class="small">' + e.desc + '</div></div><div class="btns"><button data-act="side" data-arg="' + e.type + '">Start</button></div></div>').join('');
        return h;
      }
      const n = Number(v.tab.slice(1)), L = G().leagueData(n), lp = G().leagueProgress(n);
      h += '<h3 style="color:' + L.color + '">' + L.name + '</h3><p class="small">Top-3 finish clears a race. Prize pool ' + RL.fmtMoney(L.prize) + ' per race. AI difficulty: <b class="hl">' + RL.difficulty().name + '</b> (Settings).</p>';
      h += L.races.map((r, i) => {
        const key = n + '_' + i; if (!conds[key]) conds[key] = rollConditions(r.track, n);
        const tr = RL.TRACKS[r.track];
        return '<div class="card"><div><b>' + (lp.races[i] ? '✅ ' : '') + r.name + '</b><div class="small">' + tr.name + (r.reverse ? ' (reverse)' : '') + ' · ' + RL.THEMES[tr.theme].name + ' · 3 laps · 6 cars · ' + condText(conds[key]) + '</div></div>' +
          '<div class="btns"><button ' + (i === lp.races.findIndex((x) => !x) ? 'class="primary" ' : '') + 'data-act="race" data-arg="' + n + ',' + i + '">Race</button></div></div>';
      }).join('');
      const unlocked = G().bossUnlocked(n), b = L.boss, bkey = n + '_boss';
      if (!conds[bkey]) conds[bkey] = rollConditions(b.track, n);
      h += '<div class="card boss" style="border-color:' + b.color + '"><div><b>' + (lp.boss ? '👑 ' : '☠ ') + 'BOSS: ' + b.name + '</b><div class="small">' + b.desc + ' · ' + RL.TRACKS[b.track].name + ' · ' + condText(conds[bkey]) + '</div></div><div class="btns">' +
        (unlocked ? '<button class="' + (lp.boss ? '' : 'primary') + '" data-act="boss" data-arg="' + n + '">Challenge</button>' : '<span class="dim">🔒 Clear all 3 races</span>') + '</div></div>';
      return h;
    }, acts: {
      tab: (a) => { v.tab = a; },
      online: () => RL.Net && RL.Net.openMenu(),
      nexttrack: () => { v.sideTrack++; },
      race: (a) => { const [n, i] = a.split(',').map(Number), r = G().leagueData(n).races[i], c = conds[n + '_' + i];
        G().startRace({ kind: 'race', track: r.track, reverse: !!r.reverse, league: n, raceIndex: i, weather: c.weather, time: c.time, title: r.name }); },
      boss: (a) => {
        const n = Number(a), b = G().leagueData(n).boss, c = conds[n + '_boss'];
        const go = () => G().startRace({ kind: 'boss', track: b.track, league: n, weather: c.weather, time: c.time, title: 'BOSS: ' + b.name });
        const key = 'preboss' + n;
        if (RL.STORY && RL.STORY[key] && !(S().flags && S().flags['seen_' + key])) { closeAll(); showStory(key, go); }
        else go();
      },
      side: (type) => { const tracks = sideTracks(), tk = tracks[v.sideTrack % tracks.length], c = conds['side_' + tk];
        G().startRace({ kind: type, track: tk, league: S().league, weather: c.weather, time: c.time, title: RL.SIDE_EVENTS.find((e) => e.type === type).name }); },
      freeplay: () => RL.FreePlay && RL.FreePlay.open(),
      editor: () => { if (RL.Editor) { closeAll(); RL.Editor.open(); } },
      community: () => RL.Community && RL.Community.open()
    } };
    open(v);
  }
  function sideTracks() { const out = []; for (let i = 1; i <= S().league; i++) G().leagueData(i).races.forEach((r) => { if (!out.includes(r.track)) out.push(r.track); }); return out; }
  function showTraining() {
    open({ title: '🏟 Training Track', render: () => '<p>Practice on the Training Oval. Solo, 3 laps, clear skies. Earn XP for every lap without hitting a wall, plus drift XP.</p>' +
      '<p class="small">Sessions completed: <b class="hl">' + S().totals.training + '</b></p><div class="row"><button class="primary" data-act="go">Start Practice ▶</button><button data-act="back">Leave</button></div>',
      acts: { go: () => G().startRace({ kind: 'training', track: 'oval', league: S().league, weather: 'clear', time: 'day', title: 'Training Session' }) } });
  }

  /* ---------------- Bar & dialogue ---------------- */
  function fillName(text) {
    return esc(text == null ? '' : text).replace(/\{name\}/g, esc(S().name));
  }
  function showBar() {
    open({ title: '🍸 Neon Bar', render: () => {
      const s = S();
      const ids = (RL.NPC_ORDER || Object.keys(RL.NPCS)).filter((id) => RL.npcAvailable ? RL.npcAvailable(id, s) : (!RL.NPCS[id].requires || s.flags[RL.NPCS[id].requires]));
      const rumors = RL.rumorsFor ? RL.rumorsFor(s) : ['Nobody has seen the Phantom\'s face.'];
      /* Chat freely sits beside Talk. It does not mark the NPC talked or fire quest effects. */
      return '<p class="small rumor">💬 Rumor: ' + esc(RL.pick(rumors)) + '</p>' + (RL.AiNpc ? RL.AiNpc.statusHtml() : '') + ids.map((id) => {
        const n = RL.NPCS[id];
        const fresh = RL.npcFresh ? RL.npcFresh(id, s) : !s.talked[id];
        return '<div class="card"><div><span class="carchip" style="background:' + n.color + '"></span> <b>' + esc(n.name) + '</b>' +
          (fresh ? ' <span class="new">NEW</span>' : '') +
          (n.bio ? '<div class="small">' + esc(n.bio) + '</div>' : '') +
          '</div><div class="btns"><button data-act="talk" data-arg="' + id + '">Talk</button>' + (RL.AiNpc ? RL.AiNpc.chatButtonHtml(id) : '') + '</div></div>';
      }).join('');
    }, acts: { talk: (id) => dialogue(id), chat: (id) => { if (RL.AiNpc) RL.AiNpc.openChat(id); } } });
  }
  /* Branching dialogue: choices apply effects (money, respect, quests, flags) */
  function dialogue(npcId, nodeId) {
    const start = nodeId || (RL.npcStart ? RL.npcStart(npcId, S()) : RL.NPCS[npcId].start);
    open(dialogueView(npcId, start));
  }
  function dialogueView(npcId, nid) {
    const npc = RL.NPCS[npcId];
    const node = (npc && npc.nodes && (npc.nodes[nid] || npc.nodes[npc.start])) || { text: '...', choices: [] };
    const stage = RL.npcStart ? RL.npcStart(npcId, S()) : npc.start;
    return { title: npc.name, cls: 'dialog', render: () => {
      const choices = (node.choices || []).map((c, i) => ({ c: c, i: i })).filter((x) => !x.c.when || x.c.when(S()));
      const buttons = choices.length
        ? choices.map((x) => '<button data-act="choose" data-arg="' + x.i + '">▸ ' + esc(x.c.t) + '</button>').join('')
        : '<button data-act="choose" data-arg="-1">Leave</button>';
      /* Off-script chat. Not a choice, so it does not apply this node's effects. data-arg stays the original choice index. */
      return '<div class="speaker" style="color:' + npc.color + '">' + esc(npc.name) + '</div><p class="typed">' + fillName(node.text) + '</p><div class="choices">' + buttons + '</div>' +
        (RL.AiNpc ? '<div class="ai-extra">' + RL.AiNpc.chatButtonHtml(npcId) + '</div>' : '');
    }, acts: { choose: (i) => {
      if (String(i) === '-1') { back(); return; }
      const c = node.choices[Number(i)];
      if (!c) return;
      if (c.effects) {
        const r = applyEffects(c.effects, G().choiceClaimKey(npcId, nid, Number(i)));
        if (r && r.broke) return;
      }
      S().talked[npcId] = stage;
      G().event('talk', { npc: npcId });
      if (c.next && npc.nodes[c.next]) replace(dialogueView(npcId, c.next));
      else back();
      needSave();
    }, chat: (id) => { if (RL.AiNpc) RL.AiNpc.openChat(id || npcId); } } };
  }
  function applyEffects(e, claimKey) {
    if (!e) return { granted: false };
    const r = G().applyChoiceEffects(e, claimKey);
    if (!r || !r.granted) {
      if (r && r.already) toast('Already settled.', '#9fb3c8');
      else if (r && r.broke) { toast('Not enough cash.', '#ff3b6b'); RL.Audio.play('error'); }
      G().event('choice', {});
      return r;
    }
    if (r.money) { toast((r.money > 0 ? '+' : '−') + RL.fmtMoney(Math.abs(r.money)), r.money > 0 ? '#7dff5a' : '#ff3b6b'); RL.Audio.play('coin'); }
    if (r.respect) toast('Respect ' + (r.respect > 0 ? '+' : '') + r.respect, '#ffe03b');
    G().event('choice', {});
    return r;
  }
  /* Story scenes live in story.js (RL.STORY). Lines may be strings or
     {who, color, text, when, else}. Choices may include when(state). */
  function resolveStory(st, s) {
    const lines = [];
    (st.lines || []).forEach((line) => {
      if (typeof line === 'string') { lines.push({ who: st.who, color: st.color, text: line }); return; }
      const pass = !line.when || line.when(s);
      const text = pass ? line.text : line.else;
      if (!text) return;
      lines.push({ who: line.who || st.who, color: line.color || st.color, text: text });
    });
    if (!lines.length) lines.push({ who: st.who, color: st.color, text: '...' });
    const choices = (st.choices || []).map((c, i) => ({ c: c, i: i })).filter((x) => !x.c.when || x.c.when(s));
    return { lines: lines, choices: choices };
  }
  function showStory(key, onDone) {
    const st = RL.STORY && RL.STORY[key];
    if (!st || !S()) { if (onDone) onDone(); return; }
    const resolved = resolveStory(st, S());
    if (!S().flags) S().flags = {};
    S().flags['seen_' + key] = true;
    if (st.startQuest) G().startQuest(st.startQuest);
    G().event('storyEnd', { key: key });
    G().save();
    let i = 0;
    const finish = () => {
      G().save();
      const done = onDone;
      back();
      if (done) done();
    };
    const v = { title: st.who, cls: 'dialog', noClose: true, render: () => {
      const line = resolved.lines[Math.min(i, resolved.lines.length - 1)];
      const last = i >= resolved.lines.length - 1;
      let buttons;
      if (last && resolved.choices.length) {
        buttons = resolved.choices.map((x) => '<button data-act="choose" data-arg="' + x.i + '">▸ ' + esc(x.c.t) + '</button>').join('');
      } else {
        const label = last ? ((onDone && st.goLabel) ? st.goLabel + ' ▸' : 'Close') : 'Next ▸';
        buttons = '<button class="primary" data-act="next">' + label + '</button>';
      }
      return '<div class="speaker" style="color:' + (line.color || st.color) + '">' + esc(line.who || st.who) + '</div><p class="typed">' + fillName(line.text) + '</p><div class="choices">' + buttons + '</div>';
    }, acts: {
      next: () => { if (i < resolved.lines.length - 1) i++; else finish(); },
      choose: (k) => {
        const found = resolved.choices.filter((x) => String(x.i) === String(k))[0];
        const c = found ? found.c : (st.choices && st.choices[Number(k)]);
        if (c && c.effects) {
          const r = applyEffects(c.effects, G().choiceClaimKey('story', key, Number(k)));
          if (r && r.broke) return;
        } else G().event('choice', {});
        finish();
      }
    } };
    open(v);
  }
  function storyList() {
    const s = S();
    if (!s) return [];
    if (!Array.isArray(s.storyQueue)) s.storyQueue = [];
    return s.storyQueue;
  }
  function queueStory(k) {
    if (!k || !RL.STORY || !RL.STORY[k]) return;
    const s = S();
    if (!s || (s.flags && s.flags['seen_' + k])) return;
    const q = storyList();
    if (q.indexOf(k) < 0) q.push(k);
  }
  function flushStories() {
    if (storyFlushTimer || mode !== 'hub' || isOpen()) return;
    const q = storyList();
    if (!q.length) return;
    storyFlushTimer = true;
    setTimeout(() => {
      storyFlushTimer = false;
      if (mode !== 'hub' || isOpen()) return;
      const k = q.shift();
      if (k) showStory(k);
    }, 50);
  }

  /* ---------------- Quests & achievements ---------------- */
  function showQuests() {
    open({ title: '📜 Quest Log', render: () => {
      const q = S().quests, item = (id, done) => {
        const d = RL.QUESTS[id];
        if (!d) return '';
        return '<div class="card quest ' + (done ? 'done' : '') + '"><div><b>' + (d.main ? '★ ' : '') + esc(d.title) + '</b><div class="small">' + esc(d.desc) + '</div></div><div class="small">' + (done ? '✅' : rewardTxt(d.reward)) + '</div></div>';
      };
      let h = '<h3>Active</h3>' + (q.active.length ? q.active.map((id) => item(id, false)).join('') : '<p class="dim">No active quests. Visit the Bar for work.</p>');
      if (RL.moralScore) {
        const m = RL.moralScore(S());
        h += '<p class="small">Ledger · respect ' + S().respect + ' · honors ' + m.honor + ' · deals ' + m.dirty + '. Deals pay. Honors change who still rides with you.</p>';
      }
      h += '<h3>League progress</h3>';
      for (let n = 1; n <= S().league; n++) { const lp = G().leagueProgress(n); h += '<div class="small">League ' + n + ': races ' + lp.races.filter(Boolean).length + '/3 · boss ' + (lp.boss ? 'beaten 👑' : 'not beaten') + '</div>'; }
      if (RL.STORY_LOG) {
        const seen = RL.STORY_LOG.filter((e) => S().flags && S().flags[e.flag]);
        if (seen.length) h += '<h3>Story so far</h3>' + seen.map((e) => '<div class="card quest done"><div><b>' + esc(e.title) + '</b><div class="small">' + esc(e.text) + '</div></div></div>').join('');
      }
      if (q.done.length) h += '<h3>Completed</h3>' + q.done.map((id) => item(id, true)).join('');
      return h;
    } });
  }
  function rewardTxt(r) {
    if (!r) return '';
    return [r.money ? RL.fmtMoney(r.money) : '', r.xp ? r.xp + ' XP' : '', r.respect ? ((r.respect > 0 ? '+' : '') + r.respect + ' respect') : '', r.part && RL.RARITIES[r.part] ? RL.RARITIES[r.part].name + ' part' : ''].filter(Boolean).join(' · ');
  }
  function showAchievements() {
    open({ title: '🏆 Achievements', render: () => {
      const a = S().achievements;
      return '<p class="small">' + Object.keys(a).length + ' / ' + RL.ACHIEVEMENTS.length + ' unlocked</p><div class="achs">' + RL.ACHIEVEMENTS.map((x) => '<div class="ach ' + (a[x.id] ? 'got' : '') + '"><b>' + (a[x.id] ? '🏆 ' : '🔒 ') + x.name + '</b><span>' + x.desc + '</span></div>').join('') + '</div>';
    } });
  }

  /* ---------------- Settings ---------------- */
  function showSettings() {
    const st = RL.settings;
    const v = { title: '⚙ Settings', importDraft: '', render: () => {
      const sl = (k, label) => '<div class="setting"><span>' + label + '</span><input type="range" min="0" max="1" step="0.05" value="' + st[k] + '" data-set="' + k + '"><em>' + Math.round(st[k] * 100) + '%</em></div>';
      let h = '<h3>Audio</h3>' + sl('master', 'Master volume') + sl('sfx', 'Sound effects') + sl('music', 'Music');
      h += '<h3>Race</h3><div class="setting"><span>AI difficulty</span><button data-act="diff" data-arg="-1">−</button><b>' + RL.difficulty().name + '</b><button data-act="diff" data-arg="1">+</button></div>' +
        '<p class="small">Easy, Normal, Hard, or Legend. Changes rival pace, mistakes, and boss pressure. Applies on the next race. Normal is the standard climb.</p>';
      h += '<h3>Controls</h3><div class="setting"><span>Touch controls</span><button data-act="touch">' + st.touch.toUpperCase() + '</button></div>' +
        '<div class="setting"><span>Steering sensitivity</span><button data-act="sens" data-arg="-1">−</button><b>' + st.sensitivity.toFixed(1) + '</b><button data-act="sens" data-arg="1">+</button></div>' +
        '<div class="setting"><span>Screen shake</span><button data-act="shake">' + (st.shake ? 'ON' : 'OFF') + '</button></div>' +
        '<div class="setting"><span>Car explosions</span><button data-act="boom">' + (st.explosions !== false ? 'ON' : 'OFF') + '</button></div>';
      h += '<h3>Free-form NPC chat</h3><div class="setting"><span>Chat freely</span><button data-act="aichat">' + (st.aiChat ? 'ON' : 'OFF') + '</button></div>';
      h += '<p class="small">' + (RL.AiNpc ? esc(RL.AiNpc.settingsHint()) : '') + '</p>';
      h += '<h3>Save</h3><p class="small">Stored under <b>' + esc(RL.SAVE_KEY) + '</b>. Updates migrate this career in place. One backup slot is kept if the main save cannot be read.</p>' +
        '<div class="row"><button data-act="exportfile">Export file</button><button data-act="copycode">Copy code</button></div>' +
        '<textarea id="saveExport" class="save-code" readonly rows="3">' + esc(G().exportCode()) + '</textarea>' +
        '<p class="small">Import a file or paste a code. Importing replaces the career on this device.</p>' +
        '<textarea id="saveImport" class="save-code" rows="3" placeholder="Paste a save code or JSON">' + esc(v.importDraft || '') + '</textarea>' +
        '<div class="row"><button data-act="importfile">Import file</button><button data-act="importcode">Import pasted code</button></div>';
      h += '<h3>Key bindings</h3>' + Object.keys(RL.ACTION_NAMES).map((a) => '<div class="setting"><span>' + RL.ACTION_NAMES[a] + '</span><span class="keys">' + (st.keys[a] || []).map((c) => '<kbd>' + RL.Input.keyName(c) + '</kbd>').join(' ') + '</span><button data-act="rebind" data-arg="' + a + '">' + (v.waiting === a ? 'Press a key…' : 'Rebind') + '</button></div>').join('') +
        '<div class="row"><button data-act="resetkeys">Reset to defaults</button><button class="primary" data-act="back">Done</button></div>';
      return h;
    }, acts: {
      diff: (d) => {
        const order = RL.DIFFICULTY_ORDER;
        let i = order.indexOf(st.difficulty || 'normal'); if (i < 0) i = 1;
        st.difficulty = order[(i + Number(d) + order.length) % order.length];
        RL.saveSettings();
      },
      touch: () => { st.touch = { auto: 'on', on: 'off', off: 'auto' }[st.touch]; applyTouch(); RL.saveSettings(); },
      aichat: () => { if (RL.AiNpc) RL.AiNpc.toggle(); },
      sens: (d) => { st.sensitivity = RL.clamp(Math.round((st.sensitivity + Number(d) * 0.1) * 10) / 10, 0.5, 1.5); RL.saveSettings(); },
      shake: () => { st.shake = !st.shake; RL.saveSettings(); },
      boom: () => { st.explosions = st.explosions === false; RL.saveSettings(); },
      rebind: (a) => { v.waiting = a; RL.Input.rebind((code) => { if (code !== 'Escape') st.keys[a] = [code].concat(a === 'pause' ? ['Escape'] : []); v.waiting = null; RL.saveSettings(); refresh(); }); },
      resetkeys: () => { st.keys = JSON.parse(JSON.stringify(RL.DEFAULT_KEYS)); RL.saveSettings(); },
      exportfile: () => {
        const text = G().exportFileText();
        if (!text) { toast('No career to export'); RL.Audio.play('error'); return; }
        const blob = new Blob([text], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'redline-legends-save.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1500);
        toast('Save file downloaded');
      },
      copycode: () => {
        const ta = $('saveExport');
        if (!ta || !ta.value) { toast('No career to export'); return; }
        ta.focus(); ta.select();
        let copied = false;
        try { copied = document.execCommand('copy'); } catch (err) { copied = false; }
        if (copied) { toast('Save code copied'); return; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(ta.value).then(() => toast('Save code copied')).catch(() => toast('Select the code and copy it'));
          return;
        }
        toast('Select the code and copy it');
      },
      importfile: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.txt,application/json,text/plain';
        input.onchange = () => {
          const file = input.files && input.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => confirmImport(String(reader.result || ''));
          reader.onerror = () => { toast('Could not read that file'); RL.Audio.play('error'); };
          reader.readAsText(file);
        };
        input.click();
      },
      importcode: () => {
        const ta = $('saveImport');
        v.importDraft = ta ? ta.value : v.importDraft;
        confirmImport(v.importDraft);
      }
    } };
    open(v);
  }
  function confirmImport(text) {
    const preview = G().parseSaveText(text);
    if (!preview.ok) { toast(preview.error || 'That is not a career save'); RL.Audio.play('error'); return; }
    open({ title: 'Import Save', render: () => '<p>Replace the career on this device with <b>' + esc(preview.name) + '</b> · ' + RL.fmtMoney(preview.money) + ' · league ' + preview.league + '?</p><p class="small">The current career is kept in the backup slot.</p><div class="row"><button class="primary" data-act="yes">Replace career</button><button data-act="back">Cancel</button></div>',
      acts: { yes: () => {
        const r = G().applyImport(text);
        if (!r.ok) { toast(r.error || 'Import failed'); RL.Audio.play('error'); return; }
        toast('Career imported: ' + r.name);
        if (mode === 'title') { const b = $('btn-continue'); if (b) b.disabled = !G().hasSave(); }
        else updateHud();
        back();
      } } });
  }
  function onRange(e) {
    if (e.target && e.target.id === 'saveImport') {
      const v = stack[stack.length - 1];
      if (v) v.importDraft = e.target.value;
      return;
    }
    const k = e.target.dataset.set; if (!k) return;
    RL.settings[k] = Number(e.target.value); e.target.nextElementSibling.textContent = Math.round(RL.settings[k] * 100) + '%';
    RL.Audio.init(); RL.Audio.applyVolumes(); RL.saveSettings();
  }

  /* ---------------- Race pause & results ---------------- */
  function showPause() {
    if (RL.Race.state && RL.Race.state.cfg.multiplayer) {
      open({ title: '🌐 Online race', render: () => '<p>This race stays live for everyone. Leaving forfeits the result.</p><div class="grid2"><button class="primary" data-act="resume">▶ Back to race</button><button data-act="quit">⏏ Leave race</button></div>',
        acts: { resume: () => closeAll(), quit: () => { closeAll(); RL.Race.quit(); } } });
      return;
    }
    open({ title: '⏸ Paused', onClose: () => RL.Race.resume(), render: () => '<div class="grid2"><button class="primary" data-act="resume">▶ Resume</button><button data-act="restart">↻ Restart</button><button data-act="settings">⚙ Settings</button><button data-act="help">❓ Controls</button><button data-act="quit">⏏ Quit race (no reward)</button></div>',
      acts: { resume: () => closeAll(), restart: () => { const cfg = Object.assign({}, RL.Race.state.cfg); closeAll(); RL.Race.stop(); G().startRace(cfg); },
        settings: showSettings, help: showHelp, quit: () => { closeAll(); RL.Race.quit(); } } });
  }
  function showResults(sum) {
    const r = sum.res, cfg = r.cfg, solo = ['timetrial', 'drift', 'training', 'ghost'].includes(cfg.kind) || (cfg.kind === 'custom' && r.cars <= 1);
    let headline;
    if (cfg.kind === 'timetrial') headline = r.position === 1 ? 'PAR BEATEN!' : 'Missed par';
    else if (cfg.kind === 'drift') headline = r.position === 1 ? 'DRIFT TARGET SMASHED!' : 'Drift target missed';
    else if (cfg.kind === 'training') headline = 'Training complete';
    else if (cfg.kind === 'ghost') headline = r.position === 1 ? 'GHOST BEATEN!' : 'The ghost wins';
    else if (cfg.kind === 'custom' && r.cars <= 1) headline = 'FREE PLAY COMPLETE';
    else headline = ['', '🥇 1st PLACE!', '🥈 2nd place', '🥉 3rd place', '4th place', '5th place', '6th place'][r.position] || (r.position + 'th');
    open({ title: 'Race Results', noClose: true, cls: 'results', render: () => {
      let h = '<div class="headline">' + headline + '</div>';
      if (cfg.kind === 'timetrial') h += '<p>Your time ' + RL.fmtTime(r.totalTime || Infinity) + ' · par ' + RL.fmtTime(r.par) + '</p>';
      if (cfg.kind === 'drift') h += '<p>Drift score ' + r.drift + ' / ' + r.driftTarget + '</p>';
      if (cfg.kind === 'drag' && r.et) h += '<p>ET ' + r.et.toFixed(3) + 's' + (r.rt != null ? ' · RT ' + Number(r.rt).toFixed(3) + 's' : '') + (r.foul ? ' · REDLIGHT' : '') + '</p>';
      if (!solo && cfg.kind !== 'training') h += '<table class="standings">' + r.standings.map((s, i) => '<tr class="' + (s.isPlayer ? 'me' : '') + '"><td>' + (i + 1) + '</td><td>' + esc(s.name) + '</td><td>' + (s.out ? 'OUT' : s.time ? RL.fmtTime(s.time) : '—') + '</td></tr>').join('') + '</table>';
      h += '<div class="rewards"><div>💰 <b>+' + RL.fmtMoney(sum.money) + '</b></div><div>⭐ <b>+' + sum.xp + ' XP</b></div><div>〰 Drift ' + r.drift + '</div><div>🏎 Top ' + r.topSpeed + ' km/h</div><div>💥 Damage ' + Math.round(r.damageEnd) + '%</div>' + (r.bestLap ? '<div>⏱ Best lap ' + RL.fmtTime(r.bestLap) + '</div>' : '') + '</div>';
      if (sum.drop) h += '<p>Part reward:</p>' + partCard(sum.drop);
      h += sum.notes.map((n) => '<p class="note">' + n + '</p>').join('');
      if (sum.repair > 0) h += '<p class="small">Repair cost in Garage: ' + RL.fmtMoney(sum.repair) + '</p>';
      return h + '<div class="row"><button class="primary" data-act="cont">Continue ▶</button><button data-act="again">Race again</button></div>';
    }, acts: {
      cont: () => { if (cfg.kind === 'multiplayer' && RL.Net) RL.Net.disconnect(); closeAll(); G().toHub(); },
      again: () => {
        if (cfg.kind === 'multiplayer') {
          if (RL.Net && RL.Net.rematch()) return;
          closeAll(); if (RL.Net) RL.Net.disconnect(); G().toHub(); return;
        }
        const c = Object.assign({}, cfg); closeAll(); G().startRace(c);
      }
    } });
  }

  /* ---------------- Animated title background ---------------- */
  function drawTitleBg(ctx, t) {
    const view = RL.Game.view(ctx), W = view.W, H = view.H;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#12002e'); g.addColorStop(0.55, '#3a0a4a'); g.addColorStop(1, '#0b0618');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ff8a2e'; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(W / 2, H * 0.55, Math.min(W, H) * 0.22, Math.PI, 0); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ff2ef0'; ctx.lineWidth = 1.5;
    const hz = H * 0.55;
    for (let i = 0; i < 18; i++) { const y = hz + Math.pow(((i + (t * 0.8) % 1) / 18), 2) * (H - hz); ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let i = -20; i <= 20; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 20, hz); ctx.lineTo(W / 2 + i * 160, H); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  function init() {
    panel = $('panel');
    panel.addEventListener('click', onPanelClick);
    panel.addEventListener('input', onRange);
    document.addEventListener('keydown', onKey);
    $('btn-new').onclick = () => { RL.Audio.init(); RL.Audio.play('confirm'); newGameFlow(); };
    $('btn-continue').onclick = () => { RL.Audio.init(); RL.Audio.play('confirm'); continueGame(); };
    $('btn-multi').onclick = () => { RL.Audio.init(); RL.Net.openFromTitle(); };
    $('btn-settings').onclick = () => { RL.Audio.init(); showSettings(); };
    $('btn-help').onclick = () => { RL.Audio.init(); showHelp(); };
    const ver = $('game-version');
    if (ver && RL.VERSION) ver.textContent = 'v' + RL.VERSION;
    document.querySelectorAll('#hud [data-open]').forEach((b) => (b.onclick = () => { RL.Audio.init(); if (isOpen()) closeAll(); ({ inv: showInventory, skills: showSkills, quests: showQuests, ach: showAchievements, settings: showSettings, menu: showMenu })[b.dataset.open](); }));
    // title-screen keyboard: arrows move between the big buttons
    $('title').addEventListener('keydown', (e) => {
      const btns = Array.from(document.querySelectorAll('#title button:not([disabled])'));
      const d = { ArrowDown: 1, ArrowUp: -1, KeyS: 1, KeyW: -1 }[e.code];
      if (d) { e.preventDefault(); const i = btns.indexOf(document.activeElement); btns[(i + d + btns.length) % btns.length].focus(); }
    });
  }

  return { init, setMode, toast, open, back, closeAll, isOpen, refresh, updateHud, showMenu, showGarage, showOffice, showShop, showBar, showTraining,
    showInventory, showSkills, showQuests, showAchievements, showSettings, showHelp, showPause, showResults, showStory, queueStory, flushStories, dialogue, drawTitleBg };
})();
