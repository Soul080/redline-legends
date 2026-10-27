/* editor.js — lay a closed circuit on a grid.
   Click drops a spline point. The selected point takes elevation and bank.
   Width, theme and walls are per track. Test-drive hands the same def to
   the race module. Save writes localStorage; export/import is a share code. */

import * as THREE from 'three';
import { gfx } from './renderer.js';
import { buildCustomTrack, buildTrackMesh, disposeGroup } from './track.js';
import { encode, decode, save, sanitize } from './tracks.js';

const THEMES = ['city', 'desert', 'snow', 'neon'];

export const editor = {
  active: false,
  pts: [],
  sel: -1,
  name: 'Custom',
  theme: 'city',
  width: 14,
  walls: true,
  focus: new THREE.Vector3(0, 0, 0),
  dist: 42,
  yaw: 0.7,
  pitch: 0.7,
  dragging: false,
  markers: null,
  preview: null,
  grid: null,
  group: null,
  onTest: null,
  onExit: null,
  onSaved: null,

  install() {
    if (document.getElementById('editor-ui')) return;
    const bar = document.createElement('div');
    bar.id = 'editor-ui';
    bar.innerHTML = [
      '<div class="ed-top"><strong>Track editor</strong> <span id="ed-count">0 points</span></div>',
      '<label>Name <input id="ed-name" maxlength="28" value="Custom"></label>',
      '<div class="ed-row">',
      '<button data-ed="width" data-arg="-2">Width −</button><button data-ed="width" data-arg="2">Width +</button>',
      '<button data-ed="elev" data-arg="-1">Elev −</button><button data-ed="elev" data-arg="1">Elev +</button>',
      '<button data-ed="bank" data-arg="-3">Bank −</button><button data-ed="bank" data-arg="3">Bank +</button>',
      '</div>',
      '<div class="ed-row">',
      '<button data-ed="theme">Theme</button><button data-ed="walls">Walls</button>',
      '<button data-ed="del">Delete point</button><button data-ed="undo">Undo</button>',
      '</div>',
      '<div class="ed-row">',
      '<button data-ed="test" class="primary">Test drive</button>',
      '<button data-ed="save">Save</button><button data-ed="export">Export</button>',
      '<button data-ed="import">Import</button><button data-ed="exit">Exit</button>',
      '</div>',
      '<textarea id="ed-code" rows="3" placeholder="Share code (RL3:…)"></textarea>',
      '<p id="ed-help" class="small">Click the grid to place a closed loop. Select a point, then elevation and bank. Arrows pan, wheel zooms.</p>'
    ].join('');
    document.body.appendChild(bar);
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ed]');
      if (!b) return;
      this._act(b.dataset.ed, b.dataset.arg);
    });
    const canvas = gfx.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => this._down(e));
    window.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', () => { this.dragging = false; });
    canvas.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.dist = Math.max(12, Math.min(120, this.dist + Math.sign(e.deltaY) * 2));
    }, { passive: false });
  },

  enter(def) {
    this.install();
    this.active = true;
    const src = def ? sanitize(def) : null;
    this.pts = src ? src.pts.map((p) => ({ x: p.x, z: p.z, y: p.y, bank: p.bank })) : [];
    this.name = src ? src.name : 'Custom';
    this.theme = src ? src.theme : 'city';
    this.width = src ? src.width : 14;
    this.walls = src ? src.walls : true;
    this.sel = this.pts.length ? this.pts.length - 1 : -1;
    this.group = new THREE.Group();
    gfx.world.add(this.group);
    this.grid = new THREE.GridHelper(600, 60, 0x2ee6ff, 0x2a2340);
    this.grid.position.y = 0.01;
    this.group.add(this.grid);
    const name = document.getElementById('ed-name');
    if (name) name.value = this.name;
    this._rebuild();
    this._label();
  },

  leave() {
    this.active = false;
    this.dragging = false;
    if (this.preview) disposeGroup(this.preview);
    if (this.group) {
      gfx.world.remove(this.group);
      this.group.traverse((o) => { if (o.geometry && o !== this.grid) o.geometry.dispose(); });
    }
    this.group = null;
    this.preview = null;
    this.markers = null;
    this.grid = null;
  },

  def() {
    const nameEl = document.getElementById('ed-name');
    return sanitize({
      name: nameEl ? nameEl.value : this.name,
      theme: this.theme,
      width: this.width,
      walls: this.walls,
      grass: Math.max(4, this.width * 0.4),
      pts: this.pts
    });
  },

  update(dt, input) {
    if (!this.active) return;
    const pan = 28 * dt;
    if (input.down('left')) this.focus.x -= pan;
    if (input.down('right')) this.focus.x += pan;
    if (input.down('up')) this.focus.z -= pan;
    if (input.down('down')) this.focus.z += pan;
    if (input.hit('reset')) this._act('undo');
  },

  present() {
    if (!this.active) return;
    const cam = gfx.camera;
    const cp = Math.cos(this.pitch);
    cam.position.set(
      this.focus.x + Math.sin(this.yaw) * this.dist * cp,
      8 + Math.sin(this.pitch) * this.dist,
      this.focus.z + Math.cos(this.yaw) * this.dist * cp
    );
    cam.lookAt(this.focus.x, 0, this.focus.z);
    cam.fov = 55;
    cam.updateProjectionMatrix();
    gfx.setBlur(0);
    gfx.follow({ x: this.focus.x, y: 0, z: this.focus.z }, 0.2, null);
  },

  _act(cmd, arg) {
    if (cmd === 'width') this.width = Math.max(8, Math.min(28, this.width + Number(arg)));
    else if (cmd === 'elev' || cmd === 'bank') {
      const p = this.pts[this.sel];
      if (!p) return;
      if (cmd === 'elev') p.y = Math.max(-8, Math.min(40, (p.y || 0) + Number(arg)));
      else p.bank = Math.max(-28, Math.min(28, (p.bank || 0) + Number(arg)));
    } else if (cmd === 'theme') this.theme = THEMES[(THEMES.indexOf(this.theme) + 1) % THEMES.length];
    else if (cmd === 'walls') this.walls = !this.walls;
    else if (cmd === 'del') { if (this.sel >= 0) { this.pts.splice(this.sel, 1); this.sel = this.pts.length - 1; } }
    else if (cmd === 'undo') { this.pts.pop(); this.sel = this.pts.length - 1; }
    else if (cmd === 'test') {
      if (this.pts.length < 3) { this._help('Need 3 points before a test drive.'); return; }
      if (this.onTest) this.onTest(this.def());
      return;
    } else if (cmd === 'save') {
      if (this.pts.length < 3) { this._help('Need 3 points to save.'); return; }
      const def = save(this.def());
      this._help('Saved “' + def.name + '”. It shows up in Custom Race.');
      if (this.onSaved) this.onSaved(def);
      this._label();
      return;
    } else if (cmd === 'export') {
      if (this.pts.length < 3) { this._help('Need 3 points to export.'); return; }
      const code = encode(this.def());
      const box = document.getElementById('ed-code');
      if (box) { box.value = code; box.focus(); box.select(); }
      this._help('Share code copied into the box. Select it and copy.');
      return;
    } else if (cmd === 'import') {
      const box = document.getElementById('ed-code');
      try {
        const def = decode(box ? box.value : '');
        this.pts = def.pts.map((p) => ({ x: p.x, z: p.z, y: p.y, bank: p.bank }));
        this.name = def.name;
        this.theme = def.theme;
        this.width = def.width;
        this.walls = def.walls;
        this.sel = this.pts.length - 1;
        const name = document.getElementById('ed-name');
        if (name) name.value = def.name;
        let cx = 0, cz = 0;
        for (const p of this.pts) { cx += p.x; cz += p.z; }
        this.focus.set(cx / this.pts.length, 0, cz / this.pts.length);
        this._help('Imported ' + def.name + '. Save it if you want it in the Custom Race list.');
      } catch (err) {
        this._help('Could not read that code.');
      }
    } else if (cmd === 'exit') {
      if (this.onExit) this.onExit();
      return;
    }
    this._rebuild();
    this._label();
  },

  _down(e) {
    if (!this.active || e.button !== 0) return;
    const hit = this._ground(e);
    if (!hit) return;
    let best = -1, bd = 4;
    this.pts.forEach((p, i) => {
      const d = Math.hypot(p.x - hit.x, p.z - hit.z);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) { this.sel = best; this.dragging = true; }
    else {
      this.pts.push({ x: hit.x, z: hit.z, y: 0, bank: 0 });
      this.sel = this.pts.length - 1;
      this.dragging = true;
    }
    this._rebuild();
    this._label();
  },

  _move(e) {
    if (!this.active || !this.dragging || this.sel < 0) return;
    const hit = this._ground(e);
    if (!hit) return;
    const p = this.pts[this.sel];
    p.x = hit.x;
    p.z = hit.z;
    this._moveMarkers();
  },

  _ground(e) {
    const rect = gfx.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, gfx.camera);
    const point = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point)) return null;
    return point;
  },

  _rebuild() {
    if (!this.group) return;
    if (this.preview) {
      this.group.remove(this.preview);
      disposeGroup(this.preview);
      this.preview = null;
    }
    if (this.markers) {
      this.group.remove(this.markers);
      this.markers = null;
    }
    this.markers = new THREE.Group();
    this.pts.forEach((p, i) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.6, 1.1),
        new THREE.MeshStandardMaterial({ color: i === this.sel ? 0xffe03b : 0x2ee6ff, emissive: i === this.sel ? 0xffe03b : 0x000000, emissiveIntensity: 0.4 })
      );
      m.position.set(p.x, 0.8 + (p.y || 0), p.z);
      this.markers.add(m);
    });
    this.group.add(this.markers);
    if (this.pts.length >= 3) {
      try {
        const track = buildCustomTrack(this.def());
        this.preview = buildTrackMesh(track);
        this.group.add(this.preview);
      } catch (err) { /* degenerate spline, keep the markers */ }
    }
  },

  _moveMarkers() {
    if (!this.markers) return;
    this.pts.forEach((p, i) => {
      const m = this.markers.children[i];
      if (m) m.position.set(p.x, 0.8 + (p.y || 0), p.z);
    });
  },

  _label() {
    const n = document.getElementById('ed-count');
    const p = this.pts[this.sel];
    if (n) {
      n.textContent = this.pts.length + ' pts · ' + this.theme + ' · ' + this.width.toFixed(0) + 'm · walls ' + (this.walls ? 'on' : 'off') +
        (p ? ' · y ' + (p.y || 0).toFixed(0) + ' bank ' + (p.bank || 0).toFixed(0) + '°' : '');
    }
  },

  _help(text) {
    const h = document.getElementById('ed-help');
    if (h) h.textContent = text;
  }
};
