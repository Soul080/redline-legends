/* state.js — career: money, XP, cars, parts, perks, quests, achievements.
   Rules match the 2D game (same prices, same quest checks, same boss
   promotion). The 3D modes call finishEvent() with a result object. */

import { RL } from './data.js';
import { clamp, rand, pick, uid, fmtMoney } from './util.js';

/* Same slot as the 2D city. The "_v1" suffix is the slot name, not the schema
   version. A career started in either view is the only career. */
export const SAVE_KEY = 'redline_legends_save_v1';
export const SAVE_BACKUP_KEY = 'redline_legends_save_v1_backup';
export const LEGACY_3D_KEY = 'redline_legends_3d_save_v1';
export const GHOST_KEY = 'redline_legends_3d_ghosts_v1';

const hooks = { toast() {}, play() {} };
let beforeSave = function () {};
export function setStateHooks(h) { Object.assign(hooks, h); }
export function setBeforeSave(fn) { beforeSave = fn || function () {}; }

export const career = {
  state: null,

  newState(name) {
    const starter = {
      uid: uid(), id: 'pip', damage: 0, parts: {}, tune: { gear: 0, aero: 0 },
      paint: null, look: { paint: null, decal: 'none', decalColor: '#ffffff' },
      style: { color: null, rims: 0, decal: 'none', underglow: false }
    };
    this.state = {
      version: 10, name: name || 'Rookie', money: 600, xp: 0, level: 1,
      skillPoints: 0, statPoints: 0,
      stats: { reflexes: 1, control: 1, nerve: 1, tactics: 1 },
      perks: [], respect: 0,
      cars: [starter], currentCar: starter.uid,
      inventory: [this.makePart('tires', 'common', false)],
      league: 1, progress: { 1: { races: [false, false, false], boss: false } },
      quests: { active: ['m1'], done: [] }, questCounters: {}, flags: {}, talked: {}, claimed: {}, storyQueue: [],
      achievements: {}, records: {},
      totals: { races: 0, wins: 0, crashes: 0, nitro: 0, draft: 0, training: 0, drags: 0, dragWins: 0, escapes: 0, photos: 0, heists: 0, deliveries: 0, arrests: 0, busts: 0, roleSwitches: 0, peakStars: 0, evadesHigh: 0, impounds: 0, customWins: 0, redLights: 0, wrecks: 0, evasions: 0, smuggles: 0, tags: 0, streets: 0, bustsAi: 0, explosions: 0, tows: 0, driveDist: 0, tuned: 0 },
      worldTime: 0.78, nightDrive: 0, playTime: 0, created: Date.now(),
      role: 'neutral', roleXp: { neutral: 0, criminal: 0, police: 0 }, roleSwitchAt: 0, roleCooldownUntil: 0, iaStrikes: 0, impound: 0, lookBackup: null,
      roles: {}, found: {}, visited: { downtown: true }, clock: 10 * 60,
      customTracks: [], multiplayer: { name: '', room: '', status: 'offline' }, difficulty: 'normal',
      wanted: { heat: 0, stars: 0, peak: 0, bounty: 0 },
      phone: { threads: {}, seen: {}, memory: {}, open: 'unknown' },
      dragPrefs: { half: false, stake: true, pink: false }, dragStake: null,
      escape: { coins: 0, owned: ['alley'], selected: 'alley', best: {}, daily: { date: '', paid: 0 } },
      hub: { x: 15.5 * 40, y: 9.5 * 40, h: 0, speed: 0, inCar: true, joyride: null, hp: 100, summonCd: 0 },
      hub3d: null, joyride: null
    };
    this.save();
    try { localStorage.removeItem(LEGACY_3D_KEY); } catch (e) { /* ignore */ }
  },

  /* Fold a pre-unification 3D career in once. If the shared career already
     exists, money, cars, and quests stay put — the old key cannot pay twice.
     A missing, empty, or corrupt old key is ignored. The old key is removed
     only after the shared slot is written, or when the old payload cannot be used. */
  adoptLegacy() {
    let raw = null;
    try { raw = localStorage.getItem(LEGACY_3D_KEY); } catch (e) { return; }
    if (raw == null || raw === '') return;
    let legacy = null;
    try { legacy = JSON.parse(raw); } catch (e) { legacy = null; }
    const usable = !!(legacy && typeof legacy === 'object' && !Array.isArray(legacy) && Array.isArray(legacy.cars) && legacy.cars.length);
    if (!usable) {
      try { localStorage.removeItem(LEGACY_3D_KEY); } catch (e) { /* a bad key must not block the next boot */ }
      return;
    }
    let wrote = false;
    try {
      const main = this.readSlot(SAVE_KEY);
      if (main.ok) {
        const s = main.save;
        if (s.hub3d == null && legacy.hub && legacy.hub.z != null && legacy.hub.y == null) {
          s.hub3d = { x: legacy.hub.x, z: legacy.hub.z, h: legacy.hub.h || 0, stolen: legacy.hub.stolen || null, parked: legacy.hub.parked || null };
        }
        if (s.joyride == null && legacy.joyride) s.joyride = legacy.joyride;
        if (s.worldTime == null && legacy.worldTime != null) s.worldTime = legacy.worldTime;
        for (const lc of legacy.cars) {
          if (!lc || typeof lc !== 'object') continue;
          const mc = s.cars.find((c) => c && c.uid === lc.uid);
          if (mc && !mc.style && lc.style) mc.style = lc.style;
        }
        localStorage.setItem(SAVE_KEY, JSON.stringify(s));
      } else {
        if (legacy.hub && legacy.hub.z != null && legacy.hub.y == null) {
          legacy.hub3d = { x: legacy.hub.x, z: legacy.hub.z, h: legacy.hub.h || 0, stolen: legacy.hub.stolen || null, parked: legacy.hub.parked || null };
          legacy.hub = { x: 15.5 * 40, y: 9.5 * 40, h: 0, speed: 0, inCar: true };
        }
        localStorage.setItem(SAVE_KEY, JSON.stringify(legacy));
      }
      wrote = true;
    } catch (e) { wrote = false; }
    if (!wrote) return;
    try { localStorage.removeItem(LEGACY_3D_KEY); } catch (e) { /* the shared slot already has the career */ }
  },

  readSlot(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { ok: false };
      const save = JSON.parse(raw);
      if (!save || typeof save !== 'object' || Array.isArray(save)) return { ok: false };
      if (!Array.isArray(save.cars) || !save.cars.length) return { ok: false };
      return { ok: true, save };
    } catch (e) { return { ok: false }; }
  },

  save() {
    if (!this.state) return;
    try { beforeSave(); } catch (e) { /* heat snapshot is optional */ }
    this._ensure(this.state);
    try {
      const next = JSON.stringify(this.state);
      const prev = localStorage.getItem(SAVE_KEY);
      if (prev && prev !== next) {
        const prior = this.readSlot(SAVE_KEY);
        if (prior.ok) localStorage.setItem(SAVE_BACKUP_KEY, prev);
      }
      localStorage.setItem(SAVE_KEY, next);
    } catch (e) { /* ignore */ }
  },
  hasSave() {
    try {
      this.adoptLegacy();
      return this.readSlot(SAVE_KEY).ok || this.readSlot(SAVE_BACKUP_KEY).ok;
    } catch (e) { return false; }
  },
  load() {
    try {
      this.adoptLegacy();
      let slot = this.readSlot(SAVE_KEY);
      if (!slot.ok) slot = this.readSlot(SAVE_BACKUP_KEY);
      if (!slot.ok) return false;
      this.state = slot.save;
      this._ensure(this.state);
      return true;
    } catch (e) { return false; }
  },
  _ensure(s) {
    s.totals = Object.assign({ races: 0, wins: 0, crashes: 0, nitro: 0, draft: 0, training: 0, drags: 0, escapes: 0, photos: 0, heists: 0, deliveries: 0, arrests: 0, busts: 0, roleSwitches: 0, peakStars: 0, evadesHigh: 0, impounds: 0, customWins: 0, redLights: 0, wrecks: 0 }, s.totals || {});
    if (s.worldTime == null) s.worldTime = 0.78;
    if (!s.role) s.role = 'neutral';
    if (!s.roleXp) s.roleXp = { neutral: 0, criminal: 0, police: 0 };
    if (s.impound == null) s.impound = 0;
    if (!s.flags) s.flags = {};
    if (!s.achievements) s.achievements = {};
    if (!s.records) s.records = {};
    const cars = s.cars.filter((c) => c && typeof c === 'object');
    if (cars.length) s.cars = cars;
    for (const c of s.cars) {
      if (!c || typeof c !== 'object') continue;
      if (!c.tune) c.tune = { gear: 0, aero: 0 };
      if (!c.style) c.style = { color: null, rims: 0, decal: 'none', underglow: false };
      if (!c.parts || typeof c.parts !== 'object' || Array.isArray(c.parts)) c.parts = {};
      if (!Number.isFinite(Number(c.damage))) c.damage = 0;
    }
    if (!s.cars.some((c) => c && c.uid === s.currentCar)) s.currentCar = s.cars[0] && s.cars[0].uid;
    if (!Array.isArray(s.perks)) s.perks = [];
    if (!Array.isArray(s.inventory)) s.inventory = [];
    s.inventory = s.inventory.filter((p) => p && typeof p === 'object');
    if (!s.stats || typeof s.stats !== 'object' || Array.isArray(s.stats)) s.stats = { reflexes: 1, control: 1, nerve: 1, tactics: 1 };
    if (!Number.isFinite(Number(s.money))) s.money = 0;
    if (!Number.isFinite(Number(s.xp))) s.xp = 0;
    if (!Number.isFinite(Number(s.level)) || Number(s.level) < 1) s.level = 1;
    if (!Number.isFinite(Number(s.skillPoints))) s.skillPoints = 0;
    if (!Number.isFinite(Number(s.statPoints))) s.statPoints = 0;
    if (!Number.isFinite(Number(s.respect))) s.respect = 0;
    const joyTiers = { beater: 1, commuter: 1, sport: 1, exotic: 1 };
    const j = s.joyride;
    if (!j || typeof j !== 'object' || Array.isArray(j) || !joyTiers[j.tier]) s.joyride = null;
    else {
      j.damage = Math.max(0, Math.min(99, Number(j.damage) || 0));
      if (!j.cls) j.cls = 'Coupe';
      if (!j.name) j.name = j.tier;
      if (!j.color) j.color = '#d5dbe3';
    }
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
    if (!s.escape || typeof s.escape !== 'object' || Array.isArray(s.escape)) s.escape = { coins: 0, owned: ['alley'], selected: 'alley', best: {}, daily: { date: '', paid: 0 } };
    else {
      if (!Array.isArray(s.escape.owned)) s.escape.owned = ['alley'];
      if (s.escape.owned.indexOf('alley') < 0) s.escape.owned.unshift('alley');
      if (typeof s.escape.selected !== 'string') s.escape.selected = 'alley';
      if (!s.escape.best || typeof s.escape.best !== 'object' || Array.isArray(s.escape.best)) s.escape.best = {};
      if (!s.escape.daily || typeof s.escape.daily !== 'object' || Array.isArray(s.escape.daily)) s.escape.daily = { date: '', paid: 0 };
      if (!Number.isFinite(Number(s.escape.coins))) s.escape.coins = 0;
    }
    if (!Number.isFinite(Number(s.version)) || Number(s.version) < 10) s.version = 10;
    if (!s.claimed || typeof s.claimed !== 'object' || Array.isArray(s.claimed)) s.claimed = {};
    if (!s.talked || typeof s.talked !== 'object' || Array.isArray(s.talked)) s.talked = {};
    if (!Array.isArray(s.storyQueue)) s.storyQueue = [];
    if (!Array.isArray(s.customTracks)) s.customTracks = [];
    if (!s.multiplayer || typeof s.multiplayer !== 'object' || Array.isArray(s.multiplayer)) s.multiplayer = { name: '', room: '', status: 'offline' };
    if (!s.difficulty) s.difficulty = 'normal';
    if (!s.league) s.league = 1;
    if (!s.name) s.name = 'Rookie';
    if (!s.progress || typeof s.progress !== 'object' || Array.isArray(s.progress)) s.progress = {};
    if (!s.progress[s.league]) s.progress[s.league] = { races: [false, false, false], boss: false };
    if (!s.quests || typeof s.quests !== 'object') s.quests = { active: ['m1'], done: [] };
    if (!s.wanted || typeof s.wanted !== 'object' || Array.isArray(s.wanted)) s.wanted = { heat: 0, stars: 0, peak: 0, bounty: 0 };
    else {
      if (s.wanted.heat == null) s.wanted.heat = 0;
      if (s.wanted.stars == null) s.wanted.stars = 0;
      if (s.wanted.peak == null) s.wanted.peak = 0;
      if (!Number.isFinite(Number(s.wanted.bounty)) || Number(s.wanted.bounty) < 0) s.wanted.bounty = 0;
      else s.wanted.bounty = Math.min(5000, Math.round(Number(s.wanted.bounty)));
    }
    if (!s.found || typeof s.found !== 'object' || Array.isArray(s.found)) s.found = {};
    if (!s.visited || typeof s.visited !== 'object' || Array.isArray(s.visited)) s.visited = { downtown: true };
    if (s.clock == null) s.clock = 10 * 60;
    if (s.roleCooldownUntil == null) s.roleCooldownUntil = 0;
    if (s.roleSwitchAt == null) s.roleSwitchAt = 0;
    if (s.iaStrikes == null) s.iaStrikes = 0;
    if (s.roles == null || typeof s.roles !== 'object' || Array.isArray(s.roles)) s.roles = {};
    if (s.hub && s.hub.z != null && s.hub.y == null) {
      if (!s.hub3d) s.hub3d = { x: s.hub.x, z: s.hub.z, h: s.hub.h || 0, stolen: s.hub.stolen || null, parked: s.hub.parked || null };
      s.hub = { x: 15.5 * 40, y: 9.5 * 40, h: 0, speed: 0, inCar: true, joyride: null, hp: 100, summonCd: 0 };
    }
    if (!s.hub || typeof s.hub !== 'object' || s.hub.y == null) s.hub = { x: 15.5 * 40, y: 9.5 * 40, h: 0, speed: 0, inCar: true, joyride: null, hp: 100, summonCd: 0 };
    else {
      if (!(Number(s.hub.hp) > 0)) s.hub.hp = 100;
      if (!(Number(s.hub.summonCd) >= 0)) s.hub.summonCd = 0;
      if (!('joyride' in s.hub)) s.hub.joyride = null;
    }
    this._syncLook(s);
    this._reconcileRole(s);
  },

  _syncLook(s) {
    if (!s || !Array.isArray(s.cars)) return;
    for (const c of s.cars) {
      if (!c || typeof c !== 'object') continue;
      if (!c.tune || typeof c.tune !== 'object') c.tune = { gear: 0, aero: 0 };
      if (!c.parts || typeof c.parts !== 'object') c.parts = {};
      if (!c.style || typeof c.style !== 'object') {
        c.style = {
          color: c.paint || (c.look && c.look.paint) || null,
          rims: 0,
          decal: (c.look && c.look.decal) || 'none',
          underglow: false
        };
      }
      if (!c.style.color) c.style.color = c.paint || (c.look && c.look.paint) || null;
      if (c.style.color) c.paint = c.style.color;
      if (!c.look || typeof c.look !== 'object') c.look = { paint: c.style.color || c.paint || null, decal: c.style.decal || 'none', decalColor: '#ffffff' };
      else if (c.style.color) c.look.paint = c.style.color;
    }
  },

  /* roleCooldownUntil is the real end, including a 5 minute badge lock.
     roleSwitchAt stays 60s earlier so the 3D anchor matches that end. */
  _reconcileRole(s) {
    const now = Date.now();
    const until = Number(s.roleCooldownUntil) || 0;
    const from3 = (Number(s.roleSwitchAt) || 0) + 60000;
    const live = (t) => (t > now ? t : 0);
    const end = Math.max(live(until), live(from3));
    s.roleCooldownUntil = end;
    if (end) s.roleSwitchAt = end - 60000;
  },

  carDef(id) { return RL.CARS.find((c) => c.id === id); },
  currentCar() {
    const s = this.state;
    return s.cars.find((c) => c.uid === s.currentCar) || s.cars[0];
  },
  findPart(id) { return this.state.inventory.find((p) => p.uid === id); },
  hasPerk(id) { return !!(this.state && Array.isArray(this.state.perks) && this.state.perks.includes(id)); },

  makePart(slot, rarity, randomize) {
    const r = RL.RARITIES[rarity];
    const base = RL.SLOTS[slot].base;
    const stats = {};
    for (const k in base) stats[k] = Math.max(1, Math.round(base[k] * r.mult * (randomize ? rand(0.85, 1.2) : 1)));
    const ri = RL.RARITY_ORDER.indexOf(rarity);
    const p = { uid: uid(), slot, rarity, name: RL.PART_NAMES[slot][ri] + ' ' + RL.SLOTS[slot].name, stats };
    if (slot === 'paint') p.color = pick(RL.PAINT_COLORS);
    return p;
  },
  partValue(p) { return Math.round(RL.SLOTS[p.slot].price * RL.RARITIES[p.rarity].price); },
  priceMult() {
    return (this.hasPerk('haggler') ? 0.85 : 1) * (1 - clamp(this.state.respect, 0, 30) * 0.003);
  },
  /* Known-face tax. Kingpin rank (320 criminal XP) launders it off. */
  crimeTax() {
    if (!this.state || this.state.role !== 'criminal') return 1;
    const xp = this.state.roleXp && this.state.roleXp.criminal || 0;
    return xp >= 320 ? 1 : 1.12;
  },
  crimeCut() {
    if (!this.state || this.state.role !== 'criminal') return 1;
    const xp = this.state.roleXp && this.state.roleXp.criminal || 0;
    return xp >= 320 ? 1 : 0.85;
  },
  bill(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return Math.max(0, Math.round(v * this.crimeTax()));
  },
  streetPrice(base) {
    const n = Number(base);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.max(0, Math.round(n * this.priceMult() * this.crimeTax()));
  },
  carStats(car) {
    const def = this.carDef(car.id);
    const out = Object.assign({}, def.s);
    for (const slot in car.parts) {
      const p = this.findPart(car.parts[slot]);
      if (p) for (const k in p.stats) out[k] = (out[k] || 0) + p.stats[k];
    }
    const t = car.tune || { gear: 0, aero: 0 };
    out.topSpeed += t.gear * 2; out.accel -= t.gear * 2;
    out.grip += t.aero * 2; out.topSpeed -= t.aero * 1.5;
    if (this.hasPerk('legend')) for (const k in out) out[k] *= 1.05;
    for (const k in out) out[k] = clamp(Math.round(out[k]), 1, 130);
    return out;
  },
  carColor(car) {
    if (car.style && car.style.color) return car.style.color;
    if (car.paint) return car.paint;
    if (car.look && car.look.paint) return car.look.paint;
    const p = car.parts && car.parts.paint && this.findPart(car.parts.paint);
    return (p && p.color) || this.carDef(car.id).color;
  },
  repairCost(car) {
    return Math.round(car.damage * (8 + this.carDef(car.id).price / 1500) * (this.hasPerk('mechanic') ? 0.65 : 1) * this.crimeTax());
  },
  isEquipped(id) { return this.state.cars.some((c) => Object.values(c.parts).includes(id)); },
  sellPrice(p) { return Math.round(this.partValue(p) * 0.45 * (this.hasPerk('haggler') ? 1.25 : 1) * this.crimeCut()); },

  addMoney(n) {
    this.state.money = Math.max(0, Math.round(this.state.money + n));
    this.checkAchievements();
  },
  addXP(n) {
    const s = this.state;
    s.xp += Math.round(n * (1 + clamp(s.respect, 0, 50) * 0.004));
    let leveled = false;
    while (s.xp >= RL.xpForLevel(s.level)) {
      s.xp -= RL.xpForLevel(s.level);
      s.level++;
      s.skillPoints++;
      s.statPoints += 2;
      leveled = true;
    }
    if (leveled) {
      hooks.play('levelup');
      hooks.toast('LEVEL UP! Level ' + s.level + ' (+1 skill point, +2 stat points)', '#ffe03b');
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
    this.state.skillPoints--;
    this.state.perks.push(id);
    hooks.play('confirm');
    this.checkAchievements();
    this.save();
    return true;
  },
  raiseStat(k) {
    const s = this.state;
    if (s.statPoints < 1 || s.stats[k] >= 20) return false;
    s.statPoints--;
    s.stats[k]++;
    this.save();
    return true;
  },
  leagueData(n) { return RL.LEAGUES[n - 1]; },
  leagueProgress(n) {
    const p = this.state.progress;
    if (!p[n]) p[n] = { races: [false, false, false], boss: false };
    return p[n];
  },
  bossUnlocked(n) { return this.leagueProgress(n).races.every(Boolean); },

  startQuest(id) {
    const q = this.state.quests;
    if (!RL.QUESTS[id] || q.active.includes(id) || q.done.includes(id)) return;
    q.active.push(id);
    hooks.toast('New quest: ' + RL.QUESTS[id].title, '#2ee6ff');
  },
  completeQuest(id) {
    const q = this.state.quests, def = RL.QUESTS[id];
    q.active = q.active.filter((x) => x !== id);
    if (!q.done.includes(id)) q.done.push(id);
    const r = def.reward || {};
    if (r.money) this.addMoney(r.money);
    if (r.xp) this.addXP(r.xp);
    let partTxt = '';
    if (r.part) {
      const p = this.makePart(pick(RL.SLOT_ORDER), r.part, true);
      this.state.inventory.push(p);
      partTxt = ' + ' + p.name;
    }
    hooks.toast('Quest complete: ' + def.title + (r.money ? ' +' + fmtMoney(r.money) : '') + partTxt, '#7dff5a');
    hooks.play('coin');
    if (def.next) this.startQuest(def.next);
  },
  event(type, d) {
    const s = this.state;
    d = d || {};
    for (const id of s.quests.active.slice()) {
      const q = RL.QUESTS[id];
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
        default: break;
      }
      if (done) this.completeQuest(id);
    }
    this.checkAchievements(d);
  },
  unlockAch(id) {
    const s = this.state;
    if (s.achievements[id]) return;
    s.achievements[id] = Date.now();
    const a = RL.ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    hooks.toast('Achievement: ' + a.name, '#ffb02e');
    hooks.play('coin');
  },
  checkAchievements(d) {
    const s = this.state;
    if (!s) return;
    d = d || {};
    const t = s.totals;
    if (t.races >= 1) this.unlockAch('first_race');
    if (t.wins >= 1) this.unlockAch('first_win');
    if (t.nitro >= 60) this.unlockAch('nitro_60');
    if (t.draft >= 30) this.unlockAch('draft_30');
    if (t.crashes >= 50) this.unlockAch('crash_50');
    if (s.cars.length >= 4) this.unlockAch('cars_4');
    if (Array.isArray(s.inventory) && s.inventory.some((p) => p && p.rarity === 'legendary')) this.unlockAch('legendary');
    if (s.level >= 10) this.unlockAch('level_10');
    if (Array.isArray(s.perks) && s.perks.length >= 5) this.unlockAch('perks_5');
    if (s.money >= 50000) this.unlockAch('rich');
    if (s.league >= 2) this.unlockAch('league_2');
    if (s.league >= 3) this.unlockAch('league_3');
    if (s.league >= 4) this.unlockAch('league_4');
    if (d.drift >= 2000) this.unlockAch('drift_2000');
    if (d.position === 1 && d.wallHits === 0 && (d.kind === 'race' || d.kind === 'boss')) this.unlockAch('clean_win');
    if (d.position === 1 && d.wasLast && d.cars > 1) this.unlockAch('comeback');
    if (d.kind === 'ghost' && d.position === 1) this.unlockAch('ghostbuster');
    if (d.kind === 'elimination' && d.position === 1) this.unlockAch('survivor');
    if (s.flags.champion) this.unlockAch('legend');
    if (d.kind === 'drag' && d.position === 1 && !d.foul) this.unlockAch('quarter_king');
    if (d.kind === 'drag' && d.perfectShifts >= 3) this.unlockAch('perfect_shift');
    if (t.escapes >= 1) this.unlockAch('escape');
    if (t.photos >= 1) this.unlockAch('shutter');
    if (d.kind === 'street' && d.position === 1) this.unlockAch('street_king');
    if (s.nightDrive >= 15) this.unlockAch('night_owl');
    if ((t.peakStars || 0) >= 5) this.unlockAch('heat_5');
    if ((t.evadesHigh || 0) >= 1) this.unlockAch('clean_getaway');
    if ((t.impounds || 0) >= 1) this.unlockAch('impounded');
    if ((t.heists || 0) >= 1) this.unlockAch('heist_done');
    if ((t.deliveries || 0) >= 1) this.unlockAch('mule');
    if ((t.arrests || 0) >= 3) this.unlockAch('badge');
    if ((t.roleSwitches || 0) >= 1) this.unlockAch('turncoat');
    if ((s.roleXp.criminal || 0) >= 320) this.unlockAch('kingpin');
    if ((s.roleXp.police || 0) >= 110) this.unlockAch('sergeant');
    if ((t.customWins || 0) >= 1) this.unlockAch('custom_win');
    if (s.flags.trackSaved) this.unlockAch('track_builder');
    if ((t.wrecks || 0) >= 1) this.unlockAch('writeoff');
  },

  /** Player car hit 100% and went up. Once is enough for the achievement. */
  noteWreck() {
    if (!this.state) return;
    this.state.totals.wrecks = (this.state.totals.wrecks || 0) + 1;
    this.checkAchievements();
  },

  /**
   * Apply a finished circuit, drag or street event. `res` uses the same shape
   * as the 2D race result, plus optional perfectShifts / foul / streetId.
   */
  finishEvent(res) {
    const s = this.state;
    const car = this.currentCar();
    const cfg = res.cfg;
    car.damage = clamp(res.damageEnd || 0, 0, 100);
    s.totals.races++;
    s.totals.crashes += (res.wallHits || 0) + (res.carHits || 0);
    s.totals.nitro += res.nitroTime || 0;
    s.totals.draft += res.draftTime || 0;
    if (cfg.kind === 'training') s.totals.training++;
    if (cfg.kind === 'drag') s.totals.drags++;
    const L = this.leagueData(cfg.league || s.league);
    let money = 0, xp = 0, drop = null;
    const notes = [];
    const pos = res.position, n = res.cars || 1;
    const mult = L.prize;
    if (cfg.kind === 'race' || cfg.kind === 'boss' || cfg.kind === 'elimination') {
      const share = [1, 0.6, 0.4, 0.25, 0.15, 0.1][pos - 1] || 0.1;
      money = mult * share * (cfg.kind === 'boss' ? 2.5 : cfg.kind === 'elimination' ? 1.2 : 1);
      xp = (60 + L.id * 40) * (1.3 - pos * 0.15) * (cfg.kind === 'boss' ? 2 : 1);
    } else if (cfg.kind === 'training') {
      xp = 40 + (res.cleanLaps || 0) * 25 + Math.min(150, (res.drift || 0) / 40);
    } else if (cfg.kind === 'drag') {
      const won = pos === 1 && !res.foul;
      money = mult * (won ? 0.35 : 0.08);
      xp = (70 + L.id * 35) * (won ? 1.35 : 0.4);
      const stake = s.dragStake;
      if (stake && !stake.settled) {
        stake.settled = true;
        if (won && stake.amount) {
          const pay = Math.round(stake.amount * 2);
          this.addMoney(pay);
          notes.push('Stake paid $' + pay);
        } else if (stake.amount) notes.push('Stake lost');
        s.dragStake = null;
      }
    } else if (cfg.kind === 'custom') {
      const diff = cfg.aiDiff || 1;
      const won = pos === 1;
      money = (90 + (cfg.aiCount || 0) * 45) * diff * (won ? 1 : 0.22);
      xp = (36 + (cfg.laps || 1) * 14) * (won ? 1.25 : 0.4);
      if (won) {
        s.totals.customWins = (s.totals.customWins || 0) + 1;
        notes.push('Custom grid cleared');
      }
    } else if (cfg.kind === 'street') {
      const won = pos === 1;
      money = 220 * L.id * (cfg.reward || 1) * (won ? 1 : 0.25);
      xp = (55 + L.id * 24) * (won ? 1.25 : 0.4);
      if (won) {
        s.respect += 2;
        notes.push('Street respect +2');
        s.flags['street_' + cfg.streetId] = true;
      }
    } else {
      const won = pos === 1;
      money = mult * (won ? 0.7 : 0.15);
      xp = (50 + L.id * 30) * (won ? 1.4 : 0.5);
    }
    xp += Math.min(200, (res.drift || 0) / (this.hasPerk('zen_drift') ? 15 : 25));
    if (pos === 1 && cfg.kind !== 'training' && !(cfg.kind === 'drag' && res.foul)) s.totals.wins++;
    if (cfg.kind !== 'training') {
      s.roleXp.neutral = (s.roleXp.neutral || 0) + (pos === 1 ? 12 : 4);
      if ((s.role || 'neutral') === 'neutral' && pos === 1) {
        const steps = [0, 40, 110, 200, 320];
        let ri = 0;
        for (let k = 0; k < steps.length; k++) if (s.roleXp.neutral >= steps[k]) ri = k;
        money *= 1 + ri * 0.05;
      }
    }
    if (cfg.kind !== 'training' && Math.random() < (pos === 1 ? 0.85 : pos <= 3 ? 0.45 : 0.15)) {
      const roll = Math.random() + (L.id - 1) * 0.22 + (cfg.kind === 'boss' ? 0.35 : 0);
      const rar = roll > 1.45 ? 'legendary' : roll > 1.05 ? 'epic' : roll > 0.7 ? 'rare' : 'common';
      drop = this.makePart(pick(RL.SLOT_ORDER), rar, true);
      s.inventory.push(drop);
    }
    if (cfg.kind === 'race' && pos <= 3) {
      const lp = this.leagueProgress(cfg.league);
      if (!lp.races[cfg.raceIndex]) notes.push('Race cleared (top 3 required).');
      lp.races[cfg.raceIndex] = true;
      if (this.bossUnlocked(cfg.league) && !lp.boss) notes.push('BOSS UNLOCKED: ' + L.boss.name);
    }
    if (cfg.kind === 'boss' && pos === 1) {
      const lp = this.leagueProgress(cfg.league);
      lp.boss = true;
      s.flags['leagueBoss' + cfg.league] = true;
      if (cfg.league < 4 && s.league === cfg.league) {
        s.league = cfg.league + 1;
        this.leagueProgress(s.league);
        notes.push('PROMOTED to League ' + s.league + ': ' + this.leagueData(s.league).name + '!');
      }
      if (cfg.league === 4) { s.flags.champion = true; notes.push('YOU ARE THE REDLINE LEGEND.'); }
    }
    const rk = cfg.track || cfg.kind;
    if (!s.records[rk]) s.records[rk] = {};
    if (res.bestLap && (!s.records[rk].lap || res.bestLap < s.records[rk].lap)) {
      s.records[rk].lap = res.bestLap;
      notes.push('New lap record.');
    }
    if (res.finished && res.totalTime && (!s.records[rk].total || res.totalTime < s.records[rk].total)) s.records[rk].total = res.totalTime;
    if (cfg.kind === 'drag' && res.totalTime && (!s.records.drag || res.totalTime < s.records.drag)) {
      s.records.drag = res.totalTime;
      notes.push('New quarter-mile ET.');
    }
    money = Math.round(money);
    xp = Math.round(Math.max(0, xp));
    this.addMoney(money);
    this.addXP(xp);
    this.event('raceEnd', {
      kind: cfg.kind, league: cfg.league, position: pos, drift: res.drift || 0,
      damageTaken: res.damageTaken || 0, topSpeed: res.topSpeed || 0,
      wallHits: res.wallHits || 0, wasLast: res.wasLast, cars: n,
      foul: !!res.foul, perfectShifts: res.perfectShifts || 0
    });
    this.save();
    return { res, money, xp, drop, notes, repair: this.repairCost(car) };
  },

  loadGhost(cfg) {
    try {
      const all = JSON.parse(localStorage.getItem(GHOST_KEY) || '{}');
      return all[this._ghostKey(cfg)] || null;
    } catch (e) { return null; }
  },
  saveGhost(cfg, frames, total) {
    try {
      const all = JSON.parse(localStorage.getItem(GHOST_KEY) || '{}');
      const k = this._ghostKey(cfg);
      if (!all[k] || total < all[k].total) {
        all[k] = { total, frames };
        localStorage.setItem(GHOST_KEY, JSON.stringify(all));
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  },
  _ghostKey(cfg) { return (cfg.track || 'x') + (cfg.reverse ? '_r' : ''); }
};
