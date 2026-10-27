/* wrecks.js — the 100% damage explosion shared by races and the city.
   A short light, a burst of fire and smoke (via the particle pools), and
   debris meshes that tumble under gravity. The caller decides what happens
   to the car afterwards: checkpoint, tow, or a wreck that stays down. */

import * as THREE from 'three';
import { gfx } from './renderer.js';
import { audio } from './audio.js';
import { settings } from './settings.js';

export const wrecks = {
  bits: [],
  lights: [],

  boom(x, y, z, fx) {
    const gy = y || 0;
    audio.play('boom');
    if (settings.data && settings.data.shake) gfx.shake = Math.max(gfx.shake || 0, 2.1);
    const q = settings.quality().id;
    const debrisN = q === 'low' ? 8 : q === 'high' ? 20 : 14;
    const fireN = q === 'low' ? 16 : q === 'high' ? 40 : 26;
    if (fx) {
      fx.fireball(x, gy + 0.4, z, fireN);
      fx.sparks(x, gy + 0.5, z, 16);
    }
    const light = new THREE.PointLight(0xff6a1a, 260, 42, 2);
    light.position.set(x, gy + 1.6, z);
    gfx.scene.add(light);
    this.lights.push({ light, life: 0.38, max: 0.38 });
    for (let i = 0; i < debrisN; i++) {
      const geo = new THREE.BoxGeometry(
        0.22 + Math.random() * 0.5,
        0.1 + Math.random() * 0.28,
        0.18 + Math.random() * 0.55
      );
      const hot = i % 4 === 0;
      const mat = new THREE.MeshStandardMaterial({
        color: hot ? 0xff4a12 : (i % 2 ? 0x1c2128 : 0x8a929c),
        metalness: hot ? 0.15 : 0.55,
        roughness: hot ? 0.4 : 0.48,
        emissive: hot ? 0xff3a00 : 0x000000,
        emissiveIntensity: hot ? 1.4 : 0
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x + (Math.random() - 0.5) * 0.6, gy + 0.7, z + (Math.random() - 0.5) * 0.6);
      m.castShadow = false;
      gfx.scene.add(m);
      const sp = 5 + Math.random() * 13;
      const ang = Math.random() * Math.PI * 2;
      const lift = Math.random() * 0.6;
      this.bits.push({
        m, life: 1.45 + Math.random() * 0.85,
        vx: Math.cos(ang) * sp * (1 - lift * 0.3),
        vy: 5 + Math.random() * 9,
        vz: Math.sin(ang) * sp * (1 - lift * 0.3),
        rx: (Math.random() - 0.5) * 10,
        ry: (Math.random() - 0.5) * 10,
        rz: (Math.random() - 0.5) * 10
      });
    }
  },

  update(dt) {
    for (const L of this.lights) {
      L.life -= dt;
      const k = Math.max(0, L.life / L.max);
      L.light.intensity = 260 * k * k;
      if (L.life <= 0) gfx.scene.remove(L.light);
    }
    this.lights = this.lights.filter((L) => L.life > 0);
    const ground = 0.12;
    for (const b of this.bits) {
      b.life -= dt;
      b.vy -= 20 * dt;
      b.m.position.x += b.vx * dt;
      b.m.position.y += b.vy * dt;
      b.m.position.z += b.vz * dt;
      if (b.m.position.y < ground) {
        b.m.position.y = ground;
        if (b.vy < 0) b.vy = -b.vy * 0.32;
        b.vx *= 0.72;
        b.vz *= 0.72;
        b.rx *= 0.8;
        b.rz *= 0.8;
      }
      b.m.rotation.x += b.rx * dt;
      b.m.rotation.y += b.ry * dt;
      b.m.rotation.z += b.rz * dt;
      if (b.life <= 0) {
        gfx.scene.remove(b.m);
        b.m.geometry.dispose();
        b.m.material.dispose();
      }
    }
    this.bits = this.bits.filter((b) => b.life > 0);
  },

  clear() {
    for (const L of this.lights) gfx.scene.remove(L.light);
    for (const b of this.bits) {
      gfx.scene.remove(b.m);
      b.m.geometry.dispose();
      b.m.material.dispose();
    }
    this.lights = [];
    this.bits = [];
  }
};
