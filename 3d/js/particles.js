/* particles.js — pooled tire smoke, sparks and nitro flames, plus a camera-box
   weather field (rain / snow / dust). Budgets come from the quality preset. */

import * as THREE from 'three';
import { makeSoftDot, makeStreak } from './textures.js';

const VERT = `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (280.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
    if (a < 0.04) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

function makeCloud(scene, max, map, blending) {
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  const size = new Float32Array(max);
  const alpha = new Float32Array(max);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const slots = new Array(max);
  return { max, pos, col, size, alpha, geo, points, slots, alive: 0 };
}

function push(cloud, p) {
  let i = -1;
  for (let k = 0; k < cloud.max; k++) if (!cloud.slots[k] || cloud.slots[k].life <= 0) { i = k; break; }
  if (i < 0) i = (cloud.alive++) % cloud.max;
  cloud.slots[i] = p;
}

function updateCloud(cloud, dt) {
  let n = 0;
  for (let i = 0; i < cloud.max; i++) {
    const p = cloud.slots[i];
    if (!p || p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) continue;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.vx *= p.drag; p.vy *= p.drag; p.vz *= p.drag;
    p.vy += (p.grav || 0) * dt;
    p.size = Math.max(0.05, p.size + p.grow * dt);
    const o = n;
    cloud.pos[o * 3] = p.x; cloud.pos[o * 3 + 1] = p.y; cloud.pos[o * 3 + 2] = p.z;
    cloud.col[o * 3] = p.r; cloud.col[o * 3 + 1] = p.g; cloud.col[o * 3 + 2] = p.b;
    cloud.size[o] = p.size;
    cloud.alpha[o] = Math.max(0, p.life / p.max) * (p.alphaMul || 1);
    n++;
  }
  // Compact was written in order 0..n-1 but slots aren't compacted — we wrote
  // sequentially into the front of the buffers, so draw that range.
  cloud.geo.setDrawRange(0, n);
  cloud.geo.attributes.position.needsUpdate = true;
  cloud.geo.attributes.aColor.needsUpdate = true;
  cloud.geo.attributes.aSize.needsUpdate = true;
  cloud.geo.attributes.aAlpha.needsUpdate = true;
  cloud.points.visible = n > 0;
}

export function createFx(scene) {
  const soft = makeSoftDot();
  const streak = makeStreak();
  const smoke = makeCloud(scene, 500, soft, THREE.NormalBlending);
  const sparks = makeCloud(scene, 400, soft, THREE.AdditiveBlending);
  let smokeBudget = 280;
  let weatherBudget = 320;

  const weatherPos = new Float32Array(600 * 3);
  const weatherGeo = new THREE.BufferGeometry();
  weatherGeo.setAttribute('position', new THREE.BufferAttribute(weatherPos, 3));
  const weatherMat = new THREE.PointsMaterial({
    map: streak, color: 0xd0e4ff, size: 1.1, transparent: true,
    depthWrite: false, opacity: 0.55, sizeAttenuation: true
  });
  const weather = new THREE.Points(weatherGeo, weatherMat);
  weather.frustumCulled = false;
  weather.visible = false;
  scene.add(weather);
  const drops = [];
  for (let i = 0; i < 600; i++) drops.push({ x: 0, y: 0, z: 0 });

  function countAlive(cloud) {
    let n = 0;
    for (let i = 0; i < cloud.max; i++) if (cloud.slots[i] && cloud.slots[i].life > 0) n++;
    return n;
  }

  return {
    setBudget(particles, weatherN) {
      smokeBudget = particles;
      weatherBudget = Math.min(600, weatherN);
    },
    smoke(x, y, z, opt) {
      if (countAlive(smoke) > smokeBudget) return;
      const o = opt || {};
      push(smoke, {
        x, y, z,
        vx: (Math.random() - 0.5) * (o.spread || 1.2),
        vy: 0.4 + Math.random() * 0.6,
        vz: (Math.random() - 0.5) * (o.spread || 1.2),
        life: o.life || 0.8, max: o.life || 0.8,
        size: o.size || 0.45, grow: o.grow == null ? 1.4 : o.grow,
        r: o.r == null ? 0.75 : o.r, g: o.g == null ? 0.75 : o.g, b: o.b == null ? 0.78 : o.b,
        drag: 0.96, alphaMul: 0.55
      });
    },
    /** Additive fireball plus a dark smoke column. Ignores the ambient budget. */
    fireball(x, y, z, count) {
      const n = count || 28;
      for (let i = 0; i < n; i++) {
        const hot = Math.random();
        push(sparks, {
          x: x + (Math.random() - 0.5) * 1.2,
          y: y + Math.random() * 0.8,
          z: z + (Math.random() - 0.5) * 1.2,
          vx: (Math.random() - 0.5) * 16,
          vy: 2 + Math.random() * 11,
          vz: (Math.random() - 0.5) * 16,
          life: 0.28 + Math.random() * 0.45,
          max: 0.7,
          size: 0.7 + Math.random() * 1.8,
          grow: 4.2,
          r: 1, g: 0.28 + hot * 0.45, b: 0.04,
          drag: 0.93, grav: -3.5, alphaMul: 1
        });
      }
      const sm = Math.max(8, Math.round(n * 0.45));
      for (let i = 0; i < sm; i++) {
        push(smoke, {
          x: x + (Math.random() - 0.5) * 1.4,
          y: y + 0.3,
          z: z + (Math.random() - 0.5) * 1.4,
          vx: (Math.random() - 0.5) * 3.5,
          vy: 1.2 + Math.random() * 2.4,
          vz: (Math.random() - 0.5) * 3.5,
          life: 1.1 + Math.random() * 0.8,
          max: 1.8,
          size: 0.9 + Math.random() * 0.8,
          grow: 2.6,
          r: 0.12, g: 0.1, b: 0.1,
          drag: 0.98, grav: 0.4, alphaMul: 0.7
        });
      }
    },
    sparks(x, y, z, power) {
      const n = Math.min(16, 4 + (power || 4));
      for (let i = 0; i < n; i++) {
        push(sparks, {
          x, y: y + 0.3, z,
          vx: (Math.random() - 0.5) * 8,
          vy: 2 + Math.random() * 5,
          vz: (Math.random() - 0.5) * 8,
          life: 0.25 + Math.random() * 0.25, max: 0.45,
          size: 0.18, grow: -0.2,
          r: 1, g: 0.85, b: 0.35,
          drag: 0.92, grav: -12, alphaMul: 1
        });
      }
    },
    flame(x, y, z, dx, dz) {
      const hot = Math.random() < 0.45;
      push(sparks, {
        x, y, z,
        vx: dx * 6 + (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.3) * 0.6,
        vz: dz * 6 + (Math.random() - 0.5) * 0.8,
        life: 0.18, max: 0.18,
        size: 0.35, grow: -0.8,
        r: hot ? 1 : 0.35, g: hot ? 0.5 : 0.7, b: hot ? 0.15 : 1,
        drag: 0.9, alphaMul: 0.9
      });
    },
    update(dt) {
      updateCloud(smoke, dt);
      updateCloud(sparks, dt);
    },
    /* kind: clear | rain | snow | dust. Drops live in a box around the camera. */
    updateWeather(dt, camera, kind, wind) {
      const show = kind === 'rain' || kind === 'snow' || kind === 'dust';
      weather.visible = show;
      if (!show) return;
      const n = weatherBudget;
      weatherGeo.setDrawRange(0, n);
      const box = kind === 'dust' ? 50 : 36;
      const fall = kind === 'snow' ? 3.2 : kind === 'dust' ? 1.2 : 22;
      weatherMat.size = kind === 'snow' ? 0.55 : kind === 'dust' ? 2.4 : 1.35;
      weatherMat.opacity = kind === 'dust' ? 0.28 : kind === 'snow' ? 0.85 : 0.5;
      weatherMat.map = kind === 'snow' ? soft : streak;
      if (kind === 'snow') weatherMat.color.set(0xffffff);
      else if (kind === 'dust') weatherMat.color.set(0xd2b48a);
      else weatherMat.color.set(0xd5e6ff);
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      for (let i = 0; i < n; i++) {
        const d = drops[i];
        if (d.y === 0 && d.x === 0 && d.z === 0) {
          d.x = cx + (Math.random() - 0.5) * box;
          d.y = cy + Math.random() * 24;
          d.z = cz + (Math.random() - 0.5) * box;
        }
        d.y -= fall * dt;
        d.x += (wind || 0) * dt + (kind === 'snow' ? Math.sin(d.y + i) * 0.4 * dt : 0);
        if (kind === 'dust') d.x += 12 * dt;
        if (d.y < cy - 4 || Math.abs(d.x - cx) > box || Math.abs(d.z - cz) > box) {
          d.x = cx + (Math.random() - 0.5) * box;
          d.y = cy + 10 + Math.random() * 16;
          d.z = cz + (Math.random() - 0.5) * box;
        }
        weatherPos[i * 3] = d.x;
        weatherPos[i * 3 + 1] = d.y;
        weatherPos[i * 3 + 2] = d.z;
      }
      weatherGeo.attributes.position.needsUpdate = true;
    }
  };
}
