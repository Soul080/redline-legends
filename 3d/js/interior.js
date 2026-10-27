/* interior.js — Top-down walkable rooms in the 3D city.
   Layouts come from window.RLInteriorData (classic script, loaded before the bundle).
   The city stays hidden until the south door is used. */

import * as THREE from 'three';
import { gfx } from './renderer.js';
import { ui } from './ui.js';
import { makePerson, disposePerson } from './foot.js';
import { makeNameSprite } from './textures.js';
import { isShop, promptLine, rob } from './robbery.js';

const REACH = 1.35;
const RADIUS = 0.32;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const interior = {
  active: false,
  prompt: '',
  hooks: {},
  room: null,
  id: '',
  x: 0,
  y: 0,
  lock: 0,
  group: null,
  player: null,
  npcs: [],

  bind(hooks) { this.hooks = hooks || {}; },

  enter(id) {
    const lib = window.RLInteriorData;
    if (!lib || !gfx.world) return false;
    const room = lib.resolve(id);
    if (!room) return false;
    if (this.active) this.leave({ silent: true });
    this.id = id;
    this.room = room;
    this.x = room.w / 2;
    this.y = room.h - 1.65;
    this.lock = 0.4;
    this.prompt = 'Walk up to someone · E to talk · south door leaves';
    this._build(room);
    this.active = true;
    document.body.classList.add('indoors');
    if (this.hooks.onEnter) this.hooks.onEnter(room);
    return true;
  },

  leave(opts) {
    if (!this.active && !this.group) return false;
    this._dispose();
    this.active = false;
    this.room = null;
    this.prompt = '';
    this.player = null;
    this.npcs = [];
    document.body.classList.remove('indoors');
    if (this.hooks.onLeave) this.hooks.onLeave(opts || {});
    return true;
  },

  npcByService(service) {
    if (!this.room) return null;
    for (let i = 0; i < this.room.npcs.length; i++) {
      if (this.room.npcs[i].service === service) return this.room.npcs[i];
    }
    return null;
  },

  standAt(n) {
    if (!this.room || !n) return;
    this.x = n.x;
    this.y = Math.min(this.room.h - 1.7, n.y + 0.95);
    this.lock = 0;
    if (this.player) this.player.position.set(this.x, 0, this.y);
  },

  update(dt, input) {
    if (!this.active || !this.room) return;
    this.lock = Math.max(0, this.lock - dt);
    if (ui.isOpen()) {
      this.prompt = '';
      return;
    }
    let mx = 0, my = 0;
    if (input.down('left')) mx -= 1;
    if (input.down('right')) mx += 1;
    if (input.down('up')) my -= 1;
    if (input.down('down')) my += 1;
    if (mx || my) {
      const len = Math.hypot(mx, my);
      const sp = 4.6 * dt;
      const nx = this.x + (mx / len) * sp;
      const ny = this.y + (my / len) * sp;
      if (!this._blocked(nx, this.y)) this.x = nx;
      if (!this._blocked(this.x, ny)) this.y = ny;
      if (this.player) this.player.rotation.y = Math.atan2(mx, my);
    }
    if (this.player) {
      this.player.position.set(this.x, Math.sin(performance.now() / 160) * 0.03, this.y);
    }
    const npc = this._nearest();
    const exit = this._atExit();
    const till = npc && isShop(this.id) ? this.id : null;
    if (npc && till) this.prompt = promptLine(till).replace('  [E]', '  [E] ' + npc.name);
    else if (npc) this.prompt = 'E: ' + npc.name + (npc.title ? ' · ' + npc.title : '');
    else if (exit) this.prompt = 'E: exit door';
    else this.prompt = 'Walk up to someone · E to talk · south door leaves';
    if (this.lock <= 0 && npc && till && input.hit('steal')) {
      const res = rob(till);
      if (res.text) ui.toast(res.text, '#fff');
      return;
    }
    if (this.lock > 0 || !input.hit('action')) return;
    if (npc) this._talk(npc);
    else if (exit) this.leave();
  },

  aim() {
    const cam = gfx.camera;
    cam.up.set(0, 0, -1);
    cam.position.set(this.x, 15.5, this.y);
    cam.lookAt(this.x, 0, this.y);
  },

  _talk(npc) {
    const self = this;
    const till = isShop(this.id) ? this.id : null;
    ui.open({
      title: npc.name,
      render: () => '<p class="speaker" style="color:#fff"><b>' + esc(npc.name) + '</b>' + (npc.title ? ' · ' + esc(npc.title) : '') + '</p>' +
        '<p style="color:#fff">' + esc(npc.line) + '</p>' +
        (till ? '<div class="row"><button data-act="rob">Rob the register</button></div>' : '') +
        '<div class="row">' +
        '<button class="primary" data-act="go">' + esc(npc.verb || 'Talk') + '</button>' +
        (npc.alt ? '<button data-act="alt">' + esc(npc.alt) + '</button>' : '') +
        '<button data-act="bye">Later</button></div>',
      acts: {
        go: () => { if (self.hooks.run) self.hooks.run(npc.service, self.id); },
        alt: () => { if (self.hooks.run) self.hooks.run(npc.altService || npc.service, self.id); },
        rob: () => {
          const res = till ? rob(till) : { text: '' };
          if (res.text) ui.toast(res.text, '#fff');
          ui.back();
        },
        bye: () => ui.back()
      }
    });
  },

  _nearest() {
    let best = null, bd = REACH;
    const list = this.room.npcs;
    for (let i = 0; i < list.length; i++) {
      const d = Math.hypot(this.x - list[i].x, this.y - list[i].y);
      if (d < bd) { bd = d; best = list[i]; }
    }
    return best;
  },

  _atExit() {
    return this.y > this.room.h - 1.2 && Math.abs(this.x - this.room.w / 2) < 0.95;
  },

  _blocked(x, y) {
    const room = this.room, r = RADIUS;
    if (x < 0.55 + r || x > room.w - 0.55 - r) return true;
    const door = Math.abs(x - room.w / 2) < 0.78;
    if (y < 0.55 + r) return true;
    if (y > room.h - 0.42 - r && !(door && y < room.h - 0.08)) return true;
    if (y > room.h - 0.08) return true;
    for (let i = 0; i < room.props.length; i++) {
      const p = room.props[i];
      if (x > p.x - r && x < p.x + p.w + r && y > p.y - r && y < p.y + p.h + r) return true;
    }
    for (let i = 0; i < room.npcs.length; i++) {
      const n = room.npcs[i];
      if (Math.hypot(x - n.x, y - n.y) < 0.52) return true;
    }
    return false;
  },

  _build(room) {
    const g = new THREE.Group();
    g.name = 'interior';
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(room.w, 0.2, room.h),
      new THREE.MeshStandardMaterial({ color: room.floor, roughness: 0.9, metalness: 0, emissive: room.floor, emissiveIntensity: 0.28 })
    );
    floor.position.set(room.w / 2, -0.1, room.h / 2);
    g.add(floor);
    const tileMat = new THREE.MeshStandardMaterial({ color: room.alt, roughness: 0.92, emissive: room.alt, emissiveIntensity: 0.18 });
    for (let ty = 0; ty < room.h; ty += 2) {
      for (let tx = (ty / 2) % 2; tx < room.w; tx += 2) {
        const tile = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 1), tileMat);
        tile.position.set(tx + 0.5, 0.02, ty + 0.5);
        g.add(tile);
      }
    }
    const wallMat = new THREE.MeshStandardMaterial({ color: room.wall, roughness: 0.8, emissive: room.trim, emissiveIntensity: 0.12 });
    const wall = (x, z, w, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2.5, d), wallMat);
      m.position.set(x, 1.25, z);
      g.add(m);
    };
    wall(room.w / 2, 0.25, room.w, 0.5);
    wall(0.25, room.h / 2, 0.5, room.h);
    wall(room.w - 0.25, room.h / 2, 0.5, room.h);
    const side = room.w / 2 - 0.85;
    wall(side / 2, room.h - 0.25, side, 0.5);
    wall(room.w - side / 2, room.h - 0.25, side, 0.5);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.08, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x7dff5a, emissive: 0x7dff5a, emissiveIntensity: 0.6, roughness: 0.4 })
    );
    door.position.set(room.w / 2, 0.05, room.h - 0.25);
    g.add(door);
    const exit = makeNameSprite('EXIT', '#ffffff');
    exit.position.set(room.w / 2, 1.6, room.h - 0.25);
    g.add(exit);
    for (let i = 0; i < room.props.length; i++) {
      const p = room.props[i];
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(p.w, 0.9, p.h),
        new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.7, emissive: p.color, emissiveIntensity: 0.18 })
      );
      box.position.set(p.x + p.w / 2, 0.45, p.y + p.h / 2);
      g.add(box);
      if (p.label) {
        const tag = makeNameSprite(p.label, '#ffffff');
        tag.position.set(p.x + p.w / 2, 1.55, p.y + p.h / 2);
        g.add(tag);
      }
    }
    this.npcs = [];
    for (let i = 0; i < room.npcs.length; i++) {
      const n = room.npcs[i];
      const person = makePerson(n.color || '#ffffff', false);
      person.position.set(n.x, 0, n.y);
      const tag = makeNameSprite(n.name, '#ffffff');
      person.add(tag);
      g.add(person);
      this.npcs.push(person);
    }
    this.player = makePerson('#ff3b6b', false);
    this.player.position.set(this.x, 0, this.y);
    g.add(this.player);
    const light = new THREE.PointLight(room.trim || 0xffffff, 6, 28, 1.4);
    light.position.set(room.w / 2, 4.2, room.h / 2);
    g.add(light);
    const fill = new THREE.PointLight(0xffffff, 3, 24, 1.6);
    fill.position.set(room.w / 2, 3.2, room.h - 2);
    g.add(fill);
    this.group = g;
    gfx.world.add(g);
  },

  _dispose() {
    const g = this.group;
    if (!g) return;
    gfx.world.remove(g);
    const people = [];
    g.traverse((obj) => { if (obj.userData && obj.userData.person) people.push(obj); });
    people.forEach((p) => {
      p.traverse((obj) => {
        if (obj.isSprite && obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
      disposePerson(p);
    });
    const seen = new Set();
    const dropMat = (m) => {
      if (!m || seen.has(m)) return;
      seen.add(m);
      if (m.map) m.map.dispose();
      m.dispose();
    };
    g.traverse((obj) => {
      if (obj.userData && obj.userData.person) return;
      if (obj.parent && obj.parent.userData && obj.parent.userData.person) return;
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(dropMat);
      }
    });
    this.group = null;
  }
};
