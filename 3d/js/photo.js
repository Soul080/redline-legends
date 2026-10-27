/* photo.js — orbit the car, scrub the time of day, and save a PNG.
   Filters are CSS on the WebGL canvas so they don't need another render pass. */

import { gfx } from './renderer.js';
import { clamp } from './util.js';

export const photo = {
  active: false,
  yaw: 0.9,
  pitch: 0.28,
  dist: 7.2,
  filter: 'normal',
  hideHud: false,
  dragging: false,
  lx: 0,
  ly: 0,
  target: { x: 0, y: 0.8, z: 0 },

  install() {
    const el = gfx.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      this.dragging = true;
      this.lx = e.clientX;
      this.ly = e.clientY;
    });
    window.addEventListener('pointerup', () => { this.dragging = false; });
    window.addEventListener('pointermove', (e) => {
      if (!this.active || !this.dragging) return;
      this.yaw -= (e.clientX - this.lx) * 0.008;
      this.pitch = clamp(this.pitch + (e.clientY - this.ly) * 0.005, -0.15, 1.15);
      this.lx = e.clientX;
      this.ly = e.clientY;
    });
    el.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.dist = clamp(this.dist + Math.sign(e.deltaY) * 0.4, 2.4, 22);
    }, { passive: false });
  },

  enter(target) {
    this.active = true;
    this.target = target;
    document.body.classList.add('photo');
    this.applyFilter();
  },
  exit() {
    this.active = false;
    document.body.classList.remove('photo');
    gfx.camera.fov = 60;
    gfx.camera.updateProjectionMatrix();
    this.setFilter('normal');
  },
  nudge(dt, input) {
    if (input.down('left')) this.yaw -= dt * 0.9;
    if (input.down('right')) this.yaw += dt * 0.9;
    if (input.down('up')) this.pitch = clamp(this.pitch + dt * 0.5, -0.15, 1.15);
    if (input.down('down')) this.pitch = clamp(this.pitch - dt * 0.5, -0.15, 1.15);
  },
  apply() {
    const t = this.target;
    const cp = Math.cos(this.pitch);
    const dist = this.dist;
    gfx.camera.position.set(
      t.x + Math.sin(this.yaw) * dist * cp,
      0.9 + Math.sin(this.pitch) * dist,
      t.z + Math.cos(this.yaw) * dist * cp
    );
    gfx.camera.lookAt(t.x, 0.85, t.z);
    gfx.camera.fov = 48;
    gfx.camera.updateProjectionMatrix();
    gfx.setBlur(0);
    gfx.follow({ x: t.x, y: 0, z: t.z }, gfx.night, null);
  },
  setFilter(name) {
    this.filter = name;
    this.applyFilter();
  },
  applyFilter() {
    const view = document.getElementById('view');
    if (!view) return;
    view.classList.remove('filter-noir', 'filter-sunset', 'filter-neon');
    if (this.filter !== 'normal') view.classList.add('filter-' + this.filter);
  },
  capture() {
    const canvas = gfx.renderer.domElement;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'redline-legends-' + Date.now() + '.png';
    a.click();
  }
};
