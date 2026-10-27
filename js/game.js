/* game.js - Core game state, save/load (localStorage), progression (XP, levels,
   money, parts, perks), quests & achievements, and the main loop / mode switching. */
/* Storage keys are a public contract. The "_v1" suffix is the slot name, not the
   schema version (that lives on the save as state.version). Do not rename these
   keys when the game updates.
   localStorage is partitioned by origin. Desktop builds must keep serving the
   game from app://redline (desktop/main.js APP_HOST) so a new app version finds
   the same saves. itch.io HTML5 builds must keep index.html at the zip root so
   the project embed origin does not move between uploads. */
RL.DESKTOP_ORIGIN = 'app://redline';
RL.SAVE_KEY = 'redline_legends_save_v1';
RL.SAVE_BACKUP_KEY = 'redline_legends_save_v1_backup';
RL.SAVE_VERSION = 9;
RL.GAME_VERSION = '1.1.3';
RL.VERSION = RL.GAME_VERSION;
RL.SETTINGS_KEY = 'redline_legends_settings_v1';
RL.GHOST_KEY = 'redline_legends_ghosts_v1';

/* ---------- Settings ---------- */
RL.loadSettings = function () {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(RL.SETTINGS_KEY) || '{}'); } catch (e) { s = {}; }
  /* aiChat / aiChatDeclined: free-form NPC chat opt-in, owned by js/ai-npc.js.
     difficulty: rival AI pace (Easy / Normal / Hard / Legend).
     explosions: 100% damage detonates the car (city tow / race checkpoint). */
  RL.settings = Object.assign({ master: 0.7, sfx: 0.8, music: 0.4, touch: 'auto', shake: true, sensitivity: 1, aiChat: false, aiChatDeclined: false, difficulty: 'normal', explosions: true, keys: JSON.parse(JSON.stringify(RL.DEFAULT_KEYS)) }, s);
  RL.settings.keys = Object.assign({}, RL.DEFAULT_KEYS, (s && s.keys) || {});
  if (!RL.DIFFICULTIES || !RL.DIFFICULTIES[RL.settings.difficulty]) RL.settings.difficulty = 'normal';
};
RL.saveSettings = function () { try { localStorage.setItem(RL.SETTINGS_KEY, JSON.stringify(RL.settings)); } catch (e) { } };

let _uid = Date.now() % 100000;
RL.uid = function () { return 'u' + (_uid++).toString(36) + Math.floor(Math.random() * 1000).toString(36); };
RL.clamp = (v, a, b) => {
  v = Number(v);
  if (!Number.isFinite(v)) return a;
  return v < a ? a : v > b ? b : v;
};
RL.rand = (a, b) => a + Math.random() * (b - a);
RL.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
RL.fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');
RL.fmtTime = (t) => { if (!isFinite(t)) return '--:--'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); };
RL.hasPerk = (id) => !!(RL.Game.state && RL.Game.state.perks.includes(id));

RL.Game = {
  state: null,
  mode: 'title', // title | hub | race | editor

  /* ---------- Save data ---------- */
  newState(name) {
    const starter = { uid: RL.uid(), id: 'pip', damage: 0, parts: {}, tune: { gear: 0, aero: 0 }, paint: null };
    this.state = {
      version: RL.SAVE_VERSION, name: name || 'Rookie', money: 600, xp: 0, level: 1, skillPoints: 0, statPoints: 0,
      stats: { reflexes: 1, control: 1, nerve: 1, tactics: 1 }, perks: [], respect: 0,
      cars: [starter], currentCar: starter.uid, inventory: [],
      league: 1, progress: { 1: { races: [false, false, false], boss: false } },
      quests: { active: ['m1'], done: [] }, questCounters: {}, flags: {}, talked: {}, claimed: {}, storyQueue: [],
      roles: {}, role: 'neutral', roleXp: { neutral: 0, criminal: 0, police: 0 }, roleCooldownUntil: 0, iaStrikes: 0,
      wanted: { heat: 0, stars: 0, peak: 0 }, found: {}, visited: { downtown: true }, clock: 10 * 60,
      customTracks: [], multiplayer: { name: '', room: '', status: 'offline' }, difficulty: 'normal',
      achievements: {}, records: {}, totals: {
        races: 0, wins: 0, crashes: 0, nitro: 0, draft: 0, training: 0,
        drags: 0, dragWins: 0, evasions: 0, busts: 0, heists: 0, smuggles: 0, photos: 0, tags: 0,
        streets: 0, bustsAi: 0, explosions: 0, tows: 0, driveDist: 0, tuned: 0
      },
      hub: { x: 15.5 * 40, y: 9.5 * 40, h: 0, speed: 0, inCar: true, joyride: null, hp: 100 }, playTime: 0, created: Date.now()
    };
    // a Common tire part to show off the inventory from the start
    this.state.inventory.push(this.makePart('tires', 'common', false));
    this.save();
  },
  /* A slot is usable when it parses and still has a career. Corrupt JSON is not usable. */
  readSlot(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { ok: false };
      const save = JSON.parse(raw);
      if (!save || typeof save !== 'object' || Array.isArray(save)) return { ok: false };
      if (!Array.isArray(save.cars) || !save.cars.length) return { ok: false };
      return { ok: true, save: save, raw: raw };
    } catch (e) { return { ok: false }; }
  },
  save() {
    if (!this.state) return;
    try {
      const next = JSON.stringify(this.state);
      const prev = localStorage.getItem(RL.SAVE_KEY);
      /* Roll the previous good career into the single backup slot before replacing it. */
      if (prev && prev !== next) {
        const prior = this.readSlot(RL.SAVE_KEY);
        if (prior.ok) localStorage.setItem(RL.SAVE_BACKUP_KEY, prev);
      }
      localStorage.setItem(RL.SAVE_KEY, next);
    } catch (e) { console.warn('Save failed', e); }
  },
  hasSave() {
    try { return this.readSlot(RL.SAVE_KEY).ok || this.readSlot(RL.SAVE_BACKUP_KEY).ok; }
    catch (e) { return false; }
  },
  load() {
    let slot = this.readSlot(RL.SAVE_KEY);
    let restored = false;
    if (!slot.ok) {
      slot = this.readSlot(RL.SAVE_BACKUP_KEY);
      if (!slot.ok) return false;
      restored = true;
    }
    const incomingVersion = Number(slot.save.version);
    this.state = slot.save;
    this.migrateSave(this.state);
    this.ensureSaveShape();
    if (restored || incomingVersion !== this.state.version) {
      try { localStorage.setItem(RL.SAVE_KEY, JSON.stringify(this.state)); } catch (e) { /* keep the in-memory career */ }
    }
    return true;
  },
  /* Ordered upgrades. Each step only fills fields that are missing.
     Unknown keys, future versions, and extra values on known objects stay put.
       v1 original career
       v2 claimed reward map
       v3 story flags (flags, talked, storyQueue)
       v4 roles and wanted, plus the city life (role, heat, tags, drag, hub)
       v5 custom tracks
       v6 multiplayer
       v7 difficulty
       v8 free-roam joyride (never a garage car)
       v9 phone threads, summon cooldown, drag stakes
     Quest ids and story keys this build does not know are kept, so a newer
     career is not stripped when an older page reads it. */
  _migrateSteps: {
    1(s) { if (s.claimed == null || typeof s.claimed !== 'object' || Array.isArray(s.claimed)) s.claimed = {}; },
    2(s) {
      if (s.flags == null || typeof s.flags !== 'object' || Array.isArray(s.flags)) s.flags = {};
      if (s.talked == null || typeof s.talked !== 'object' || Array.isArray(s.talked)) s.talked = {};
      if (!Array.isArray(s.storyQueue)) s.storyQueue = [];
    },
    3(s) {
      if (s.roles == null || typeof s.roles !== 'object' || Array.isArray(s.roles)) s.roles = {};
      if (s.wanted == null || typeof s.wanted !== 'object' || Array.isArray(s.wanted)) s.wanted = { heat: 0, stars: 0, peak: 0 };
      else {
        if (s.wanted.heat === undefined) s.wanted.heat = 0;
        if (s.wanted.stars === undefined) s.wanted.stars = 0;
        if (s.wanted.peak === undefined) s.wanted.peak = 0;
      }
      if (!s.role) s.role = 'neutral';
      if (!s.roleXp || typeof s.roleXp !== 'object' || Array.isArray(s.roleXp)) s.roleXp = { neutral: 0, criminal: 0, police: 0 };
      else {
        if (s.roleXp.neutral == null) s.roleXp.neutral = 0;
        if (s.roleXp.criminal == null) s.roleXp.criminal = 0;
        if (s.roleXp.police == null) s.roleXp.police = 0;
      }
      if (s.roleCooldownUntil == null) s.roleCooldownUntil = 0;
      if (s.iaStrikes == null) s.iaStrikes = 0;
      if (!s.found || typeof s.found !== 'object' || Array.isArray(s.found)) s.found = {};
      if (!s.visited || typeof s.visited !== 'object' || Array.isArray(s.visited)) s.visited = { downtown: true };
      if (s.clock == null) s.clock = 10 * 60;
      if (!s.totals || typeof s.totals !== 'object' || Array.isArray(s.totals)) s.totals = {};
      ['races', 'wins', 'crashes', 'nitro', 'draft', 'training', 'drags', 'dragWins', 'evasions', 'busts', 'heists', 'smuggles', 'photos', 'tags', 'streets', 'bustsAi', 'explosions', 'tows', 'driveDist', 'tuned'].forEach((k) => {
        if (s.totals[k] == null) s.totals[k] = 0;
      });
      if (!s.hub || typeof s.hub !== 'object' || Array.isArray(s.hub)) s.hub = { x: 15.5 * 40, y: 9.5 * 40, h: 0, speed: 0, inCar: true, hp: 100 };
      else {
        if (s.hub.h == null) s.hub.h = 0;
        if (s.hub.speed == null) s.hub.speed = 0;
        if (s.hub.inCar == null) s.hub.inCar = true;
        if (!(Number(s.hub.hp) > 0)) s.hub.hp = 100;
        else s.hub.hp = Math.round(RL.clamp(Number(s.hub.hp), 1, 100));
      }
      if (Array.isArray(s.cars)) s.cars.forEach((c) => {
        if (!c || typeof c !== 'object') return;
        if (!c.tune || typeof c.tune !== 'object') c.tune = { gear: 0, aero: 0 };
        if (c.tune.gear == null) c.tune.gear = 0;
        if (c.tune.aero == null) c.tune.aero = 0;
        if (!c.drag && RL.DragSim && RL.DragSim.defaultSetup) c.drag = RL.DragSim.defaultSetup();
        if (!c.look) c.look = { paint: null, decal: 'none', decalColor: '#ffffff' };
      });
    },
    4(s) { if (s.customTracks == null) s.customTracks = []; },
    5(s) {
      if (s.multiplayer == null || typeof s.multiplayer !== 'object' || Array.isArray(s.multiplayer)) s.multiplayer = { name: '', room: '', status: 'offline' };
      else {
        if (s.multiplayer.name === undefined) s.multiplayer.name = '';
        if (s.multiplayer.room === undefined) s.multiplayer.room = '';
        if (s.multiplayer.status === undefined) s.multiplayer.status = 'offline';
      }
    },
    6(s) { if (s.difficulty == null) s.difficulty = 'normal'; },
    7(s) {
      if (!s.hub || typeof s.hub !== 'object' || Array.isArray(s.hub)) return;
      const known = { beater: 1, commuter: 1, sport: 1, exotic: 1 };
      if (!('joyride' in s.hub) || s.hub.joyride == null) { s.hub.joyride = null; return; }
      const j = s.hub.joyride;
      if (typeof j !== 'object' || Array.isArray(j) || !known[j.tier]) s.hub.joyride = null;
      else j.damage = RL.clamp(Number(j.damage) || 0, 0, 99);
    },
    8(s) {
      if (!s.phone || typeof s.phone !== 'object' || Array.isArray(s.phone)) s.phone = { threads: {}, seen: {}, memory: {}, open: 'unknown' };
      else {
        if (!s.phone.threads || typeof s.phone.threads !== 'object' || Array.isArray(s.phone.threads)) s.phone.threads = {};
        if (!s.phone.seen || typeof s.phone.seen !== 'object' || Array.isArray(s.phone.seen)) s.phone.seen = {};
        if (!s.phone.memory || typeof s.phone.memory !== 'object' || Array.isArray(s.phone.memory)) s.phone.memory = {};
      }
      if (!s.dragPrefs || typeof s.dragPrefs !== 'object' || Array.isArray(s.dragPrefs)) s.dragPrefs = { half: false, stake: true, pink: false };
      else {
        if (s.dragPrefs.half == null) s.dragPrefs.half = false;
        if (s.dragPrefs.stake == null) s.dragPrefs.stake = true;
        if (s.dragPrefs.pink == null) s.dragPrefs.pink = false;
      }
      if (!('dragStake' in s)) s.dragStake = null;
      if (s.hub && typeof s.hub === 'object' && !Array.isArray(s.hub)) {
        if (!(Number(s.hub.summonCd) >= 0)) s.hub.summonCd = 0;
        else s.hub.summonCd = RL.clamp(Number(s.hub.summonCd), 0, 60);
      }
    }
  },
  migrateSave(save) {
    if (!save || typeof save !== 'object' || Array.isArray(save)) return save;
    let v = Number(save.version);
    const incoming = v;
    if (!Number.isFinite(v) || v < 1) v = 1;
    while (v < RL.SAVE_VERSION) {
      const step = this._migrateSteps[v];
      if (step) step(save);
      v += 1;
      save.version = v;
    }
    if (Number.isFinite(incoming) && incoming > save.version) save.version = incoming;
    for (const key of Object.keys(this._migrateSteps)) this._migrateSteps[key](save);
    return save;
  },
  exportPayload() {
    const slot = this.state ? { ok: true, save: this.state } : this.readSlot(RL.SAVE_KEY);
    const src = slot.ok ? slot.save : this.readSlot(RL.SAVE_BACKUP_KEY).save;
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src));
    this.migrateSave(copy);
    return { format: 'redline-legends-save', version: copy.version, storageOrigin: (typeof location !== 'undefined' && location.origin) || '', save: copy };
  },
  exportFileText() {
    const payload = this.exportPayload();
    return payload ? JSON.stringify(payload, null, 2) : '';
  },
  exportCode() {
    const payload = this.exportPayload();
    if (!payload) return '';
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return 'RL1.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  },
  parseSaveText(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return { ok: false, error: 'Paste a save code or choose a file.' };
    let data;
    try {
      const compact = trimmed.replace(/\s+/g, '');
      if (compact.slice(0, 4).toUpperCase() === 'RL1.') {
        let b64 = compact.slice(4).replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        data = JSON.parse(new TextDecoder().decode(bytes));
      } else data = JSON.parse(trimmed);
    } catch (e) { return { ok: false, error: 'That save could not be read.' }; }
    let save = data;
    if (data && typeof data === 'object' && !Array.isArray(data) && data.save && typeof data.save === 'object' &&
        (data.format === 'redline-legends-save' || data.kind === 'redline-legends-save')) save = data.save;
    if (!save || typeof save !== 'object' || Array.isArray(save) || !Array.isArray(save.cars) || !save.cars.length) {
      return { ok: false, error: 'That file is not a Redline Legends career.' };
    }
    return { ok: true, save: save, name: typeof save.name === 'string' && save.name ? save.name : 'Rookie', money: Number(save.money) || 0, league: Number(save.league) || 1 };
  },
  /* Replace the career on this device. The previous good career rolls into the backup slot. */
  applyImport(text) {
    const parsed = this.parseSaveText(text);
    if (!parsed.ok) return parsed;
    const next = JSON.parse(JSON.stringify(parsed.save));
    if (this.state) this.save();
    this.migrateSave(next);
    this.state = next;
    this.ensureSaveShape();
    this.save();
    return { ok: true, name: this.state.name || 'Rookie' };
  },
  /* Fill fields added after the first release so older saves still load.
     Unknown quest ids and story keys stay. Seen story scenes leave the queue. */
  ensureSaveShape() {
    const s = this.state;
    if (!s) return;
    this.migrateSave(s);
    if (!s.quests || typeof s.quests !== 'object') s.quests = { active: [], done: [] };
    if (!Array.isArray(s.quests.active)) s.quests.active = [];
    if (!Array.isArray(s.quests.done)) s.quests.done = [];
    s.quests.done = [...new Set(s.quests.done.filter((id) => typeof id === 'string'))];
    s.quests.active = [...new Set(s.quests.active.filter((id) => typeof id === 'string' && !s.quests.done.includes(id)))];
    if (!s.questCounters || typeof s.questCounters !== 'object' || Array.isArray(s.questCounters)) s.questCounters = {};
    if (!s.achievements || typeof s.achievements !== 'object' || Array.isArray(s.achievements)) s.achievements = {};
    if (!s.records || typeof s.records !== 'object' || Array.isArray(s.records)) s.records = {};
    if (!s.progress || typeof s.progress !== 'object') s.progress = {};
    if (!Array.isArray(s.perks)) s.perks = [];
    s.perks = [...new Set(s.perks.filter((id) => typeof id === 'string'))];
    if (!s.stats || typeof s.stats !== 'object') s.stats = { reflexes: 1, control: 1, nerve: 1, tactics: 1 };
    for (const k of Object.keys(RL.DRIVER_STATS)) s.stats[k] = Math.round(RL.clamp(s.stats[k] == null ? 1 : s.stats[k], 1, 20));
    s.money = Math.round(RL.clamp(s.money, 0, 1e9));
    s.respect = Math.round(RL.clamp(s.respect, -10000, 10000));
    s.xp = Math.round(RL.clamp(s.xp, 0, 1e9));
    s.level = Math.round(RL.clamp(s.level == null ? 1 : s.level, 1, 200));
    s.skillPoints = Math.round(RL.clamp(s.skillPoints, 0, 500));
    s.statPoints = Math.round(RL.clamp(s.statPoints, 0, 500));
    if (!Array.isArray(s.inventory)) s.inventory = [];
    const seen = new Set();
    s.inventory = s.inventory.filter((p) => {
      if (!p || typeof p !== 'object' || typeof p.uid !== 'string' || seen.has(p.uid)) return false;
      seen.add(p.uid);
      return true;
    });
    const owned = new Set(s.inventory.map((p) => p.uid));
    const used = new Set();
    for (const c of s.cars) {
      if (!c || typeof c !== 'object') continue;
      if (!c.parts || typeof c.parts !== 'object' || Array.isArray(c.parts)) c.parts = {};
      for (const slot of Object.keys(c.parts)) {
        const uid = c.parts[slot];
        if (typeof uid !== 'string' || used.has(uid) || !owned.has(uid)) delete c.parts[slot];
        else used.add(uid);
      }
      c.damage = RL.clamp(c.damage, 0, 100);
      if (!c.tune || typeof c.tune !== 'object') c.tune = { gear: 0, aero: 0 };
      c.tune.gear = Math.round(RL.clamp(c.tune.gear, -3, 3));
      c.tune.aero = Math.round(RL.clamp(c.tune.aero, -3, 3));
    }
    if (!s.cars.some((c) => c && c.uid === s.currentCar)) s.currentCar = s.cars[0].uid;
    if (Array.isArray(s.storyQueue)) {
      s.storyQueue = s.storyQueue.filter((k) => {
        if (typeof k !== 'string') return false;
        if (RL.STORY && RL.STORY[k] && s.flags && s.flags['seen_' + k]) return false;
        return true;
      });
    }
    if (s.flags && s.flags.champion && RL.STORY) {
      if (!s.flags.seen_boss4 && s.storyQueue.indexOf('boss4') < 0) s.storyQueue.push('boss4');
      if (!s.flags.seen_epilogue && s.storyQueue.indexOf('epilogue') < 0) s.storyQueue.push('epilogue');
    }
    this.lockRewardClaims();
  },
  /* "scope:node:choiceIndex" so each dialogue or story choice is its own one-time payout. */
  choiceClaimKey(scope, nodeId, choiceIndex) {
    return String(scope) + ':' + String(nodeId) + ':' + String(choiceIndex);
  },
  indexRewardChoices() {
    const stamp = (scope, nodeId, choices) => {
      (choices || []).forEach((c, i) => {
        if (!c || !c.effects || typeof c.effects !== 'object') return;
        if (!c.effects.claim) c.effects.claim = this.choiceClaimKey(scope, nodeId, i);
      });
    };
    const npcs = RL.NPCS || {};
    for (const id in npcs) {
      const nodes = npcs[id] && npcs[id].nodes;
      if (!nodes) continue;
      for (const nid in nodes) stamp(id, nid, nodes[nid] && nodes[nid].choices);
    }
    const stories = RL.STORY || {};
    for (const id in stories) stamp('story', id, stories[id] && stories[id].choices);
  },
  /* Old saves have no claimed map. A reward flag already on the save means that choice was paid.
     Completed quests, including heist and role quests, are locked the same way. */
  lockRewardClaims() {
    const s = this.state;
    if (!s || !s.claimed) return;
    this.indexRewardChoices();
    const note = (effects) => {
      if (!effects) return;
      const rewarded = !!(effects.money || effects.respect || effects.xp || effects.part);
      if (!rewarded) return;
      const flags = [effects.flag].concat(effects.flags || []).filter((f) => typeof f === 'string');
      if (!flags.some((f) => s.flags[f])) return;
      if (effects.claim) s.claimed[effects.claim] = true;
      flags.forEach((f) => { if (s.flags[f]) s.claimed['flag:' + f] = true; });
    };
    const npcs = RL.NPCS || {};
    for (const id in npcs) {
      const nodes = npcs[id] && npcs[id].nodes;
      if (!nodes) continue;
      for (const nid in nodes) (nodes[nid].choices || []).forEach((c) => note(c && c.effects));
    }
    const stories = RL.STORY || {};
    for (const id in stories) (stories[id].choices || []).forEach((c) => note(c && c.effects));
    for (const id of s.quests.done) s.claimed['quest:' + id] = true;
  },

  /* ---------- Cars & parts ---------- */
  carDef(id) { return RL.CARS.find((c) => c.id === id); },
  currentCar() { const s = this.state; return s.cars.find((c) => c.uid === s.currentCar) || s.cars[0]; },
  findPart(uid) { return this.state.inventory.find((p) => p.uid === uid); },
  makePart(slot, rarity, randomize) {
    const r = RL.RARITIES[rarity], base = RL.SLOTS[slot].base, stats = {};
    for (const k in base) stats[k] = Math.max(1, Math.round(base[k] * r.mult * (randomize ? RL.rand(0.85, 1.2) : 1)));
    const ri = RL.RARITY_ORDER.indexOf(rarity);
    const p = { uid: RL.uid(), slot, rarity, name: RL.PART_NAMES[slot][ri] + ' ' + RL.SLOTS[slot].name, stats };
    if (slot === 'paint') p.color = RL.pick(RL.PAINT_COLORS);
    return p;
  },
  partValue(p) {
    if (!p) return 0;
    const slot = RL.SLOTS[p.slot], rar = RL.RARITIES[p.rarity];
    if (!slot || !rar) return 0;
    return Math.max(0, Math.round(slot.price * rar.price));
  },
  /* Buy multiplier stays inside (0.5, 1] so a huge respect stat can never make prices negative or free. */
  priceMult() {
    const respect = RL.clamp(this.state && this.state.respect, 0, 30);
    const m = (RL.hasPerk('haggler') ? 0.85 : 1) * (1 - respect * 0.003);
    return RL.clamp(m, 0.5, 1);
  },
  /* Sell stays strictly below the current buy price so parts cannot be flipped for profit. */
  sellPrice(p) {
    const value = this.partValue(p);
    if (!(value > 0)) return 0;
    let sell = Math.round(value * 0.45 * (RL.hasPerk('haggler') ? 1.25 : 1));
    const buy = Math.round(value * this.priceMult());
    if (buy > 0) sell = Math.min(sell, buy - 1);
    return Math.max(0, sell);
  },
  buyPrice(base) {
    const n = Number(base);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.max(0, Math.round(n * this.priceMult()));
  },
  /* Effective car stats = base + equipped parts + tuning + perks (0..130 scale) */
  carStats(car) {
    const def = this.carDef(car.id), out = Object.assign({}, def.s);
    for (const slot in car.parts) {
      const p = this.findPart(car.parts[slot]);
      if (p) for (const k in p.stats) out[k] += p.stats[k];
    }
    const t = car.tune || { gear: 0, aero: 0 };
    out.topSpeed += t.gear * 2; out.accel -= t.gear * 2;
    out.grip += t.aero * 2; out.topSpeed -= t.aero * 1.5;
    if (RL.hasPerk('legend')) for (const k in out) out[k] *= 1.05;
    for (const k in out) out[k] = RL.clamp(Math.round(out[k]), 1, 130);
    return out;
  },
  carColor(car) {
    const p = car.parts && car.parts.paint && this.findPart(car.parts.paint);
    return (p && p.color) || this.carDef(car.id).color;
  },
  repairCost(car) {
    if (!car) return 0;
    const dmg = RL.clamp(car.damage, 0, 100);
    const def = this.carDef(car.id);
    const price = def && Number.isFinite(def.price) ? Math.max(0, def.price) : 0;
    const cost = Math.round(dmg * (8 + price / 1500) * (RL.hasPerk('mechanic') ? 0.65 : 1));
    return Number.isFinite(cost) ? Math.max(0, cost) : 0;
  },
  /* Repair only ever spends cash. Negative or non-finite damage is wiped for free. */
  repair(car) {
    this.ensureSaveShape();
    car = car || this.currentCar();
    if (!car) return 0;
    car.damage = RL.clamp(car.damage, 0, 100);
    const cost = this.repairCost(car);
    if (!(car.damage >= 1) || cost <= 0) { car.damage = 0; return 0; }
    if (!(this.state.money >= cost)) return -1;
    const before = this.state.money;
    this.addMoney(-cost);
    if (this.state.money > before) this.state.money = before;
    car.damage = 0;
    return cost;
  },
  isEquipped(uid) { return this.state.cars.some((c) => c.parts && Object.values(c.parts).includes(uid)); },
  equipPart(uid) {
    const p = this.findPart(uid);
    if (!p || this.isEquipped(uid)) return false;
    const car = this.currentCar();
    if (!car.parts || typeof car.parts !== 'object') car.parts = {};
    car.parts[p.slot] = uid;
    return true;
  },
  /* Returns the cash paid, or null if the part cannot be sold (missing or equipped). */
  sellPart(uid) {
    this.ensureSaveShape();
    const p = this.findPart(uid);
    if (!p || this.isEquipped(uid)) return null;
    const price = this.sellPrice(p);
    const before = this.state.inventory.length;
    this.state.inventory = this.state.inventory.filter((x) => x.uid !== uid);
    if (this.state.inventory.length === before) return null;
    if (price > 0) this.addMoney(price);
    return price;
  },

  /* ---------- Progression ---------- */
  addMoney(n) {
    if (!Number.isFinite(n)) return;
    this.ensureSaveShape();
    const next = Math.round(this.state.money + n);
    this.state.money = Math.round(RL.clamp(Number.isFinite(next) ? next : this.state.money, 0, 1e9));
    this.checkAchievements();
  },
  addXP(n) {
    if (!Number.isFinite(n) || n <= 0) return;
    this.ensureSaveShape();
    const s = this.state;
    s.xp += Math.round(n * (1 + RL.clamp(s.respect, 0, 50) * 0.004));
    let leveled = false, guard = 0;
    while (guard++ < 60 && s.xp >= RL.xpForLevel(s.level)) {
      const need = RL.xpForLevel(s.level);
      if (!(need > 0)) break;
      s.xp -= need;
      if (s.level >= 200) { s.xp = 0; break; }
      s.level++;
      s.skillPoints = Math.min(500, s.skillPoints + 1);
      s.statPoints = Math.min(500, s.statPoints + 2);
      leveled = true;
    }
    s.xp = Math.round(RL.clamp(s.xp, 0, 1e9));
    if (leveled) {
      RL.Audio.play('levelup');
      RL.UI.toast('LEVEL UP! Level ' + s.level + ' (+1 skill point, +2 stat points)', '#ffe03b');
    }
    this.checkAchievements();
  },
  canUnlockPerk(p) {
    const s = this.state;
    if (s.perks.includes(p.id) || s.skillPoints < 1) return false;
    if (p.req && !s.perks.includes(p.req)) return false;
    if (p.reqAll && !p.reqAll.every((r) => s.perks.includes(r))) return false;
    return true;
  },
  unlockPerk(id) {
    const p = RL.PERKS.find((x) => x.id === id);
    if (!p || !this.canUnlockPerk(p)) return false;
    this.state.skillPoints--; this.state.perks.push(id);
    RL.Audio.play('confirm'); this.checkAchievements(); this.save(); return true;
  },
  raiseStat(k) {
    const s = this.state;
    if (s.statPoints < 1 || s.stats[k] >= 20) return false;
    s.statPoints--; s.stats[k]++; this.save(); return true;
  },
  leagueData(n) { return RL.LEAGUES[n - 1]; },
  leagueProgress(n) {
    const p = this.state.progress;
    if (!p[n]) p[n] = { races: [false, false, false], boss: false };
    return p[n];
  },
  bossUnlocked(n) { return this.leagueProgress(n).races.every(Boolean); },

  /* ---------- Quests ---------- */
  startQuest(id) {
    this.ensureSaveShape();
    const q = this.state.quests;
    if (!RL.QUESTS[id] || q.active.includes(id) || q.done.includes(id) || this.state.claimed['quest:' + id]) return;
    q.active.push(id); RL.UI.toast('New quest: ' + RL.QUESTS[id].title, '#2ee6ff');
    this.event('questStart', { id: id });
  },
  grantBundle(r) {
    if (!r) return null;
    if (Number.isFinite(r.money) && r.money > 0) this.addMoney(r.money);
    if (Number.isFinite(r.xp) && r.xp > 0) this.addXP(r.xp);
    if (Number.isFinite(r.respect) && r.respect !== 0) {
      this.state.respect = Math.round(RL.clamp((this.state.respect || 0) + r.respect, -10000, 10000));
    }
    if (r.part && RL.RARITIES[r.part]) {
      const p = this.makePart(RL.pick(RL.SLOT_ORDER), r.part, true);
      this.state.inventory.push(p);
      return p;
    }
    return null;
  },
  completeQuest(id) {
    this.ensureSaveShape();
    const q = this.state.quests, def = RL.QUESTS[id];
    q.active = q.active.filter((x) => x !== id);
    if (!def) return;
    const key = 'quest:' + id;
    if (q.done.includes(id) || this.state.claimed[key]) {
      if (!q.done.includes(id)) q.done.push(id);
      this.state.claimed[key] = true;
      return;
    }
    q.done.push(id);
    this.state.claimed[key] = true;
    const r = def.reward || {};
    const part = this.grantBundle(r);
    const partTxt = part ? ' + ' + part.name : '';
    RL.UI.toast('Quest complete: ' + def.title + (r.money ? ' +' + RL.fmtMoney(r.money) : '') + partTxt, '#7dff5a');
    RL.Audio.play('coin');
    if (def.next) this.startQuest(def.next);
  },
  /* One-time dialogue, story, and quest-choice payouts.
     claimKey is "scope:node:choiceIndex". Money, respect, xp, and parts pay once.
     A negative money cost that the player cannot afford refuses the choice:
     nothing is claimed and no flag is set. Flags, quests, and talk still apply
     when the payout is new or was already settled. Race purses and repeatable
     city jobs (heist, smuggle, street, dispatch) are not choices and stay repeatable.
     Their quest rewards (sp_heist and the other sp_* quests) go through completeQuest. */
  applyChoiceEffects(e, claimKey) {
    if (!e) return { granted: false };
    this.ensureSaveShape();
    const s = this.state;
    const flags = [e.flag].concat(e.flags || []).filter((f) => typeof f === 'string');
    const quests = [e.quest].concat(e.quests || []).filter((id) => typeof id === 'string');
    const hasReward = !!(e.money || e.respect || e.xp || e.part);
    const locks = [];
    if (e.claim) locks.push(e.claim);
    if (claimKey && claimKey !== e.claim) locks.push(claimKey);
    flags.forEach((f) => locks.push('flag:' + f));
    const already = hasReward && locks.some((k) => s.claimed[k]);
    const progress = () => {
      flags.forEach((f) => { s.flags[f] = true; });
      quests.forEach((id) => this.startQuest(id));
      if (e.talk) this.event('talk', { npc: e.talk });
      if (!already && e.story && RL.UI && RL.UI.queueStory) RL.UI.queueStory(e.story);
    };
    if (already) { progress(); return { granted: false, already: true }; }
    if (Number.isFinite(e.money) && e.money < 0 && s.money + e.money < 0) return { granted: false, broke: true };
    if (hasReward) locks.forEach((k) => { s.claimed[k] = true; });
    const out = { granted: true, money: 0, respect: 0 };
    if (Number.isFinite(e.money) && e.money !== 0) {
      const before = s.money;
      this.addMoney(e.money);
      out.money = s.money - before;
    }
    if (Number.isFinite(e.respect) && e.respect !== 0) {
      const before = s.respect;
      s.respect = Math.round(RL.clamp(s.respect + e.respect, -10000, 10000));
      out.respect = s.respect - before;
    }
    if (Number.isFinite(e.xp) && e.xp > 0) this.addXP(e.xp);
    if (e.part && RL.RARITIES[e.part]) {
      out.part = this.makePart(RL.pick(RL.SLOT_ORDER), e.part, true);
      s.inventory.push(out.part);
    }
    progress();
    return out;
  },
  /* Central event hook: quests/achievements react to gameplay events */
  event(type, d) {
    const s = this.state; d = d || {};
    if (!s.quests || !Array.isArray(s.quests.active)) return;
    for (const id of s.quests.active.slice()) {
      const q = RL.QUESTS[id]; if (!q) continue;
      let done = false;
      switch (q.type) {
        case 'podium': done = type === 'raceEnd' && d.kind === 'race' && d.league === q.league && d.position <= 3; break;
        case 'boss': done = type === 'raceEnd' && d.kind === 'boss' && d.league === q.league && d.position === 1; break;
        case 'talk': done = type === 'talk' && d.npc === q.npc; break;
        case 'driftScore': done = type === 'raceEnd' && d.kind === 'drift' && d.drift >= q.target; break;
        case 'cleanPodium': done = type === 'raceEnd' && (d.kind === 'race' || d.kind === 'boss') && d.position <= 3 && d.damageTaken < 10; break;
        case 'ghostWin': done = type === 'raceEnd' && d.kind === 'ghost' && d.position === 1; break;
        case 'elimWin': done = type === 'raceEnd' && d.kind === 'elimination' && d.position === 1; break;
        case 'training': done = type === 'raceEnd' && d.kind === 'training' && s.totals.training >= q.target; break;
        case 'speed': done = type === 'raceEnd' && d.topSpeed >= q.target; break;
        case 'flag': done = !!(q.flag && s.flags && s.flags[q.flag]); break;
        case 'flagAny': done = !!(q.flags && s.flags && q.flags.some((f) => s.flags[f])); break;
        case 'story': done = type === 'storyEnd' && d.key === q.key; break;
        case 'raceClear': done = type === 'raceEnd' && d.kind === 'race' && d.league === q.league && d.raceIndex === q.raceIndex && d.position <= (q.place || 3); break;
      }
      if (done) this.completeQuest(id);
    }
    this.checkAchievements(d);
  },
  unlockAch(id) {
    const s = this.state;
    if (!s) return false;
    this.ensureSaveShape();
    if (s.achievements[id]) return false;
    const a = RL.ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return false;
    s.achievements[id] = Date.now();
    if (a.reward) this.grantBundle(a.reward);
    RL.UI.toast('🏆 Achievement: ' + a.name, '#ffb02e'); RL.Audio.play('coin');
    return true;
  },
  checkAchievements(d) {
    const s = this.state; if (!s) return; d = d || {};
    const t = s.totals;
    if (t.races >= 1) this.unlockAch('first_race');
    if (t.wins >= 1) this.unlockAch('first_win');
    if (t.nitro >= 60) this.unlockAch('nitro_60');
    if (t.draft >= 30) this.unlockAch('draft_30');
    if (t.crashes >= 50) this.unlockAch('crash_50');
    if (s.cars.length >= 4) this.unlockAch('cars_4');
    if (s.inventory.some((p) => p.rarity === 'legendary')) this.unlockAch('legendary');
    if (s.level >= 10) this.unlockAch('level_10');
    if (s.perks.length >= 5) this.unlockAch('perks_5');
    if (s.money >= 50000) this.unlockAch('rich');
    if (s.league >= 2) this.unlockAch('league_2');
    if (s.league >= 3) this.unlockAch('league_3');
    if (s.league >= 4) this.unlockAch('league_4');
    if (d.drift >= 2000) this.unlockAch('drift_2000');
    if (d.position === 1 && d.wallHits === 0 && d.kind === 'race' || d.position === 1 && d.wallHits === 0 && d.kind === 'boss') this.unlockAch('clean_win');
    if (d.position === 1 && d.wasLast && d.cars > 1) this.unlockAch('comeback');
    if (d.kind === 'ghost' && d.position === 1) this.unlockAch('ghostbuster');
    if (d.kind === 'elimination' && d.position === 1) this.unlockAch('survivor');
    if (s.flags.champion) this.unlockAch('legend');
  },

  /* Offer the rival chain for each league the player has actually reached. */
  syncStory() {
    const s = this.state;
    if (!s || !s.quests || !s.flags || s.flags.champion) return;
    const f = s.flags;
    if (!f.leagueBoss1) this.startQuest('q1');
    if (f.leagueBoss1) this.startQuest('q4');
    if (f.leagueBoss2) this.startQuest('q7');
    if (f.leagueBoss3 || s.league >= 4) this.startQuest('q10');
  },
  /* ---------- Race flow ---------- */
  startRace(cfg) {
    RL.UI.closeAll();
    try { RL.Race.start(cfg); }
    catch (e) {
      RL.UI.toast((e && e.message) || 'Could not start that race');
      if (this.mode === 'editor') RL.UI.setMode('editor');
      return;
    }
    this.mode = 'race';
    RL.UI.setMode('race');
    RL.Audio.startMusic('race');
  },
  /* Apply race results to the save, then show the results screen */
  finishRace(res) {
    if (!res || res.rewardsApplied || !res.cfg) return;
    const cfg = res.cfg;
    if (cfg.kind === 'testdrive') {
      res.rewardsApplied = true;
      RL.Race.stop();
      this.mode = 'editor';
      RL.UI.setMode('editor');
      if (RL.Editor) RL.Editor.resumeAfterTest(res);
      return;
    }
    res.rewardsApplied = true;
    this.ensureSaveShape();
    const s = this.state, car = this.currentCar();
    if (cfg.damage !== false && car) car.damage = RL.clamp(res.damageEnd, 0, 100);
    s.totals.races++; s.totals.crashes += res.wallHits + res.carHits; s.totals.nitro += res.nitroTime; s.totals.draft += res.draftTime;
    if (cfg.kind === 'training') s.totals.training++;
    const L = this.leagueData(cfg.league || s.league);
    let money = 0, xp = 0, drop = null, notes = [];
    const pos = res.position, n = res.cars;
    const mult = L.prize;
    if (cfg.kind === 'race' || cfg.kind === 'boss' || cfg.kind === 'elimination') {
      const share = [1, 0.6, 0.4, 0.25, 0.15, 0.1][pos - 1] || 0.1;
      money = mult * share * (cfg.kind === 'boss' ? 2.5 : cfg.kind === 'elimination' ? 1.2 : 1);
      xp = (60 + L.id * 40) * (1.3 - pos * 0.15) * (cfg.kind === 'boss' ? 2 : 1);
    } else if (cfg.kind === 'training') {
      xp = 40 + res.cleanLaps * 25 + Math.min(150, res.drift / 40); money = 0;
    } else if (cfg.kind === 'custom') {
      const share = [1, 0.55, 0.35, 0.22, 0.14, 0.1, 0.08, 0.06][pos - 1] || 0.05;
      money = res.cars <= 1 ? 0 : mult * 0.25 * share;
      xp = res.cars <= 1 ? (30 + res.cleanLaps * 12) : (36 + L.id * 12) * Math.max(0.35, 1.15 - pos * 0.06);
    } else if (cfg.kind === 'multiplayer') {
      const share = [1, 0.6, 0.4, 0.25, 0.15, 0.1][pos - 1] || 0.1;
      money = 350 * share;
      xp = 70 * (1.25 - pos * 0.12);
      notes.push('Online race — league progress is unchanged');
    } else { // solo side events
      const won = pos === 1;
      money = mult * (won ? 0.7 : 0.15); xp = (50 + L.id * 30) * (won ? 1.4 : 0.5);
    }
    xp += Math.min(200, res.drift / (RL.hasPerk('zen_drift') ? 15 : 25));
    if (pos === 1 && cfg.kind !== 'training') s.totals.wins++;
    // part drops: better finish & higher league => better chance & rarity
    if (cfg.kind !== 'training' && cfg.kind !== 'custom' && cfg.kind !== 'multiplayer' && cfg.kind !== 'testdrive' && Math.random() < (pos === 1 ? 0.85 : pos <= 3 ? 0.45 : 0.15)) {
      const roll = Math.random() + (L.id - 1) * 0.22 + (cfg.kind === 'boss' ? 0.35 : 0);
      const rar = roll > 1.45 ? 'legendary' : roll > 1.05 ? 'epic' : roll > 0.7 ? 'rare' : 'common';
      drop = this.makePart(RL.pick(RL.SLOT_ORDER), rar, true); s.inventory.push(drop);
    }
    // league progression
    if (cfg.kind === 'race' && pos <= 3) {
      const lp = this.leagueProgress(cfg.league);
      const firstClear = !lp.races[cfg.raceIndex];
      if (firstClear) notes.push('Race cleared! (top 3 required)');
      lp.races[cfg.raceIndex] = true;
      if (this.bossUnlocked(cfg.league) && !lp.boss) notes.push('BOSS RACE UNLOCKED: ' + L.boss.name);
      if (firstClear) {
        notes.push('Someone wants a word back in the city.');
        RL.UI.queueStory('race_' + cfg.league + '_' + cfg.raceIndex);
      }
    }
    if (cfg.kind === 'boss' && pos === 1) {
      const lp = this.leagueProgress(cfg.league);
      const firstBoss = !lp.boss;
      lp.boss = true; s.flags['leagueBoss' + cfg.league] = true;
      if (cfg.league < 4 && s.league === cfg.league) {
        s.league = cfg.league + 1; this.leagueProgress(s.league);
        notes.push('PROMOTED to League ' + s.league + ': ' + this.leagueData(s.league).name + '!');
      }
      if (cfg.league === 4) { s.flags.champion = true; notes.push('YOU ARE THE REDLINE LEGEND!'); }
      if (firstBoss) {
        RL.UI.queueStory('boss' + cfg.league);
        if (cfg.league === 1) RL.UI.queueStory('unknown_dock');
        else if (cfg.league === 2) RL.UI.queueStory('unknown_dunes');
        else if (cfg.league === 3) RL.UI.queueStory('unknown_reveal');
        if (cfg.league === 4) RL.UI.queueStory('epilogue');
      }
    }
    // record keeping
    const rk = cfg.track;
    if (rk) {
      if (!s.records[rk]) s.records[rk] = {};
      if (res.bestLap && (!s.records[rk].lap || res.bestLap < s.records[rk].lap)) { s.records[rk].lap = res.bestLap; notes.push('New lap record!'); }
      if (res.finished && res.totalTime && (!s.records[rk].total || res.totalTime < s.records[rk].total)) s.records[rk].total = res.totalTime;
    }
    if (res.extraNotes) res.extraNotes.forEach((n) => notes.push(n));
    money = Math.round(money); xp = Math.round(xp);
    this.addMoney(money); this.addXP(xp);
    const evt = { kind: cfg.kind, league: cfg.league, raceIndex: cfg.raceIndex, position: pos, drift: res.drift, damageTaken: res.damageTaken, topSpeed: res.topSpeed, wallHits: res.wallHits, wasLast: res.wasLast, cars: n };
    this.event('raceEnd', evt);
    this.save();
    const summary = { res, money, xp, drop, notes, repair: this.repairCost(car) };
    RL.UI.showResults(summary);
  },
  toHub() {
    RL.Race.stop();
    this.mode = 'hub';
    RL.Hub.enter();
    RL.UI.setMode('hub');
    RL.Audio.startMusic('hub');
    this.syncStory();
    this.save();
    if (RL.UI.flushStories) RL.UI.flushStories();
  },
  toTitle() {
    RL.Race.stop(); this.mode = 'title'; RL.UI.setMode('title'); RL.Audio.stopMusic();
  },

  /* ---------- Main loop ---------- */
  /* CSS-pixel size of the canvas. The bitmap is sharper on high-DPI screens. */
  view(ctx) {
    const dpr = this.dpr || 1;
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = (ctx && ctx.canvas) || this.canvas;
    return { W: c.width / dpr, H: c.height / dpr, dpr: dpr };
  },
  boot() {
    RL.loadSettings();
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      this.canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
      this.canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    window.addEventListener('resize', resize); resize();
    RL.Input.setupTouch();
    RL.UI.init();
    RL.UI.setMode('title');
    let last = performance.now(), acc = 0, saveTimer = 0;
    const STEP = 1 / 60;
    const frame = (now) => {
      let dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
      try {
        while (acc >= STEP) {
          acc -= STEP;
          if (this.mode === 'hub') RL.Hub.update(STEP);
          else if (this.mode === 'race') RL.Race.update(STEP);
          else if (this.mode === 'editor' && RL.Editor) RL.Editor.update(STEP);
          else if (RL.Modes && RL.Modes.has(this.mode)) RL.Modes.update(this.mode, STEP);
          RL.Input.endFrame();
        }
        if (this.mode === 'hub') { RL.Hub.draw(this.ctx); saveTimer += dt; if (saveTimer > 10) { saveTimer = 0; this.state.playTime += 10; this.save(); } }
        else if (this.mode === 'race') RL.Race.draw(this.ctx);
        else if (this.mode === 'editor' && RL.Editor) RL.Editor.draw(this.ctx);
        else if (RL.Modes && RL.Modes.has(this.mode)) RL.Modes.draw(this.mode, this.ctx);
        else RL.UI.drawTitleBg(this.ctx, now / 1000);
      } catch (e) { console.error(e); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
};
window.addEventListener('load', () => RL.Game.boot());
