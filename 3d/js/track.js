/* track.js — turns the 2D Catmull-Rom circuits into a ribbon of asphalt,
   curbs, walls and themed scenery. Queries (nearest sample, look-ahead, lap
   progress) are what the AI and the checkpoint logic drive against.
   Position scale and width scale are independent so circuits are long enough
   to race without becoming absurdly wide. */

import * as THREE from 'three';
import { RL } from './data.js';
import { makeAsphalt } from './textures.js';
import { mulberry32 } from './util.js';

const POS = 0.2;     // design pixels → meters
const WIDTH = 0.095; // road width scale (a 150px road ≈ 14.2m)

let asphaltTex = null;
function asphalt() {
  if (!asphaltTex) asphaltTex = makeAsphalt();
  return asphaltTex;
}

export function buildTrack(key, reverse) {
  const def = RL.TRACKS[key];
  let cp = def.pts.map((p) => ({ x: p[0] * POS, z: p[1] * POS, y: 0, bank: 0 }));
  if (reverse && !def.open) cp.reverse();
  const pts = def.open ? sampleOpen(cp) : sampleSpline(cp);
  return finalize(pts, {
    key, def, theme: def.theme, walls: true, open: !!def.open,
    halfW: def.width * WIDTH * 0.5,
    grass: def.grass * WIDTH * 0.85
  });
}

/** Editor / share-code tracks. Points are meters: {x, z, y, bank} with bank in degrees. */
export function buildCustomTrack(def) {
  const cp = def.pts.map((p) => ({
    x: +p.x || 0, z: +p.z || 0, y: +p.y || 0,
    bank: ((+p.bank || 0) * Math.PI) / 180
  }));
  const pts = sampleSpline(cp);
  const width = def.width || 14;
  return finalize(pts, {
    key: def.id || def.name || 'custom',
    def: { name: def.name || 'Custom', theme: def.theme || 'city' },
    theme: def.theme || 'city',
    walls: def.walls !== false,
    halfW: width / 2,
    grass: def.grass != null ? def.grass : Math.max(4, width * 0.4)
  });
}

function sampleOpen(body) {
  if (!body || body.length < 2) return [];
  const first = body[0], second = body[1], last = body[body.length - 1], prev = body[body.length - 2];
  const cp = [
    { x: first.x * 2 - second.x, z: first.z * 2 - second.z, y: 0, bank: 0 },
    ...body,
    { x: last.x * 2 - prev.x, z: last.z * 2 - prev.z, y: 0, bank: 0 }
  ];
  const pts = [];
  const cr = (a, b, c, d, t, t2, t3) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  for (let i = 1; i < cp.length - 2; i++) {
    const p0 = cp[i - 1], p1 = cp[i], p2 = cp[i + 1], p3 = cp[i + 2];
    const span = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const steps = Math.max(4, Math.ceil(span / 5));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      pts.push({
        x: cr(p0.x, p1.x, p2.x, p3.x, t, t2, t3),
        z: cr(p0.z, p1.z, p2.z, p3.z, t, t2, t3),
        y: 0,
        bank: 0
      });
    }
  }
  return pts;
}

function sampleSpline(cp) {
  const n = cp.length;
  const pts = [];
  const cr = (a, b, c, d, t, t2, t3) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  for (let i = 0; i < n; i++) {
    const p0 = cp[(i - 1 + n) % n], p1 = cp[i], p2 = cp[(i + 1) % n], p3 = cp[(i + 2) % n];
    const span = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const steps = Math.max(4, Math.ceil(span / 5));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      pts.push({
        x: cr(p0.x, p1.x, p2.x, p3.x, t, t2, t3),
        z: cr(p0.z, p1.z, p2.z, p3.z, t, t2, t3),
        y: cr(p0.y, p1.y, p2.y, p3.y, t, t2, t3),
        bank: p1.bank + (p2.bank - p1.bank) * t
      });
    }
  }
  return pts;
}

function finalize(pts, extra) {
  const open = !!extra.open;
  const N = pts.length;
  let len = 0;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < N; i++) {
    const a = pts[i];
    if (open && i === N - 1 && N > 1) {
      const p = pts[N - 2];
      a.tx = p.tx; a.tz = p.tz; a.nx = p.nx; a.nz = p.nz; a.seg = 0.001; a.curv = 0;
      a.y = a.y || 0;
      if (a.x < minX) minX = a.x; if (a.x > maxX) maxX = a.x;
      if (a.z < minZ) minZ = a.z; if (a.z > maxZ) maxZ = a.z;
      if ((a.y || 0) < minY) minY = a.y || 0; if ((a.y || 0) > maxY) maxY = a.y || 0;
      continue;
    }
    const b = open ? pts[Math.min(N - 1, i + 1)] : pts[(i + 1) % N];
    const dx = b.x - a.x, dz = b.z - a.z;
    const seg = Math.hypot(dx, dz) || 0.001;
    a.tx = dx / seg; a.tz = dz / seg;
    a.nx = -a.tz; a.nz = a.tx;
    a.seg = seg;
    a.dist = len;
    len += seg;
    minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x);
    minZ = Math.min(minZ, a.z); maxZ = Math.max(maxZ, a.z);
    minY = Math.min(minY, a.y || 0); maxY = Math.max(maxY, a.y || 0);
  }
  for (let i = 0; i < N; i++) {
    const a = pts[i];
    const b = sampleByDist(pts, N, len, a.dist + 22);
    a.curv = Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz);
    while (a.curv > Math.PI) a.curv -= Math.PI * 2;
    while (a.curv < -Math.PI) a.curv += Math.PI * 2;
  }
  const cps = open ? [0, Math.max(1, N - 3)] : [0, Math.floor(N * 0.25), Math.floor(N * 0.5), Math.floor(N * 0.75)];
  const finishAt = open ? Math.max(1, N - 3) : 0;
  return Object.assign({ pts, N, len, cps, minX, maxX, minZ, maxZ, minY, maxY, open, finishAt }, extra);
}

/** Right and up vectors after banking around the tangent. bank is radians. */
function frame(p) {
  const bank = p.bank || 0;
  const cb = Math.cos(bank), sb = Math.sin(bank);
  return {
    rx: p.nx * cb, ry: sb, rz: p.nz * cb,
    ux: -p.nx * sb, uy: cb, uz: -p.nz * sb
  };
}

function sampleByDist(pts, N, len, dist) {
  let d = ((dist % len) + len) % len;
  // linear scan is fine — tracks are a few hundred samples and this runs at build time
  for (let i = 0; i < N; i++) {
    if (pts[i].dist + pts[i].seg >= d) {
      const a = pts[i];
      const t = a.seg > 0 ? (d - a.dist) / a.seg : 0;
      const b = pts[(i + 1) % N];
      return {
        x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
        y: (a.y || 0) + ((b.y || 0) - (a.y || 0)) * t,
        bank: (a.bank || 0) + ((b.bank || 0) - (a.bank || 0)) * t,
        tx: a.tx, tz: a.tz, nx: a.nx, nz: a.nz
      };
    }
  }
  return pts[0];
}

export function sampleAtDist(track, dist) {
  return sampleByDist(track.pts, track.N, track.len, dist);
}

export function sampleAhead(track, car, meters) {
  const pts = track.pts;
  const N = track.N;
  const open = !!track.open;
  let i = car.idx || 0;
  let left = meters;
  for (let n = 0; n < N; n++) {
    if (open && i >= N - 1) return pts[N - 1];
    const seg = pts[i].seg;
    const next = open ? Math.min(N - 1, i + 1) : (i + 1) % N;
    if (left <= seg) {
      const a = pts[i], b = pts[next];
      const t = seg > 0 ? left / seg : 0;
      return {
        x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
        tx: a.tx, tz: a.tz, nx: a.nx, nz: a.nz, curv: a.curv
      };
    }
    left -= seg;
    i = next;
  }
  return pts[open ? N - 1 : (car.idx || 0)];
}

export function updateTrackPos(track, car) {
  const pts = track.pts, N = track.N;
  const open = !!track.open;
  let bi = car.idx || 0;
  let best = Infinity;
  const scan = (from, to, step) => {
    for (let k = from; k <= to; k += step) {
      const i = open ? Math.max(0, Math.min(N - 1, bi + k)) : ((bi + k) % N + N) % N;
      const p = pts[i];
      const d = (p.x - car.x) ** 2 + (p.z - car.z) ** 2;
      if (d < best) { best = d; bi = i; }
    }
  };
  scan(open ? -12 : -20, open ? 30 : 50, 1);
  if (!open && best > 60 * 60) { bi = 0; best = Infinity; scan(0, N - 1, 1); }
  car.idx = bi;
  const p = pts[bi];
  car.lat = (car.x - p.x) * p.nx + (car.z - p.z) * p.nz;
  if (open) {
    car.progress = car.finished ? 1e9 - car.finishTime : bi;
    if (bi >= (track.finishAt || N - 3) && (car.lapsDone || 0) < 1) {
      car.lapsDone = 1;
      return 'lap';
    }
    return null;
  }
  const win = Math.floor(N * 0.1);
  if (car.nextCp === 0) {
    if (bi < win && car._armed) {
      car.lapsDone++;
      car.nextCp = 1;
      car._armed = false;
      return 'lap';
    }
  } else {
    const cpi = track.cps[car.nextCp];
    if (bi >= cpi && bi < cpi + win) car.nextCp = (car.nextCp + 1) % 4;
    if (car.nextCp !== 0) car._armed = true;
  }
  if (bi > N * 0.4) car._armed = true;
  let rel = bi;
  if (car.nextCp === 1 && bi > N / 2) rel -= N;
  car.progress = car.finished ? 1e9 - car.finishTime : car.lapsDone * N + rel;
  return null;
}

function geoFrom(positions, normals, uvs, indices, colors) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  return g;
}

function pushTri(idx, a, b, c) { idx.push(a, b, c); }

/** Closed ribbon. half-width is meters. Elevation and bank come off each sample. */
function nextIndex(i, N, closed) {
  return closed ? (i + 1) % N : i + 1;
}
function ribbon(pts, half, lift, closed) {
  if (closed == null) closed = true;
  const pos = [], nrm = [], uv = [], idx = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const f = frame(p);
    const cy = (p.y || 0) + lift;
    pos.push(p.x + f.rx * half, cy + f.ry * half, p.z + f.rz * half);
    pos.push(p.x - f.rx * half, cy - f.ry * half, p.z - f.rz * half);
    nrm.push(f.ux, f.uy, f.uz, f.ux, f.uy, f.uz);
    uv.push(0, dist * 0.04, 1, dist * 0.04);
    dist += p.seg;
  }
  const N = pts.length;
  const segs = closed ? N : N - 1;
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    const c = nextIndex(i, N, closed) * 2;
    pushTri(idx, b, c, b + 1);
    pushTri(idx, b + 1, c, c + 1);
  }
  return geoFrom(pos, nrm, uv, idx);
}

function wallRibbon(pts, lateral, height, closed) {
  if (closed == null) closed = true;
  const pos = [], nrm = [], uv = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const f = frame(p);
    const x = p.x + f.rx * lateral, y = (p.y || 0) + f.ry * lateral, z = p.z + f.rz * lateral;
    pos.push(x, y, z, x + f.ux * height, y + f.uy * height, z + f.uz * height);
    const nx = Math.sign(lateral) * p.nx, nz = Math.sign(lateral) * p.nz;
    nrm.push(nx, 0, nz, nx, 0, nz);
    uv.push(0, i, 1, i);
  }
  const N = pts.length;
  const segs = closed ? N : N - 1;
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    const c = nextIndex(i, N, closed) * 2;
    pushTri(idx, b, b + 1, c);
    pushTri(idx, c, b + 1, c + 1);
  }
  return geoFrom(pos, nrm, uv, idx);
}

function curbRibbon(pts, inner, outer, closed) {
  if (closed == null) closed = true;
  const pos = [], nrm = [], col = [], idx = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const stripe = Math.floor(dist / 3) % 2 === 0;
    const r = stripe ? 0.9 : 0.95, g = stripe ? 0.15 : 0.95, b = stripe ? 0.15 : 0.95;
    const f = frame(p);
    const cy = (p.y || 0) + 0.08;
    for (const lat of [inner, outer]) {
      pos.push(p.x + f.rx * lat, cy + f.ry * lat, p.z + f.rz * lat);
      nrm.push(f.ux, f.uy, f.uz);
      col.push(r, g, b);
    }
    dist += p.seg;
  }
  const N = pts.length;
  const segs = closed ? N : N - 1;
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    const c = nextIndex(i, N, closed) * 2;
    pushTri(idx, b, c, b + 1);
    pushTri(idx, b + 1, c, c + 1);
  }
  return geoFrom(pos, nrm, null, idx, col);
}

function dashedCenter(pts) {
  const pos = [], nrm = [], idx = [];
  let dist = 0, on = false, acc = 0;
  const hw = 0.12;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    acc += p.seg;
    if (acc > 4) { acc = 0; on = !on; }
    if (!on) { dist += p.seg; continue; }
    const b = pos.length / 3;
    const y = (p.y || 0) + 0.05;
    const x1 = p.x + p.nx * hw, z1 = p.z + p.nz * hw;
    const x2 = p.x - p.nx * hw, z2 = p.z - p.nz * hw;
    const len = Math.min(p.seg, 2.2);
    pos.push(x1, y, z1, x2, y, z2);
    pos.push(x1 + p.tx * len, y, z1 + p.tz * len, x2 + p.tx * len, y, z2 + p.tz * len);
    nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    pushTri(idx, b, b + 2, b + 1);
    pushTri(idx, b + 1, b + 2, b + 3);
    dist += p.seg;
  }
  if (!pos.length) return null;
  return geoFrom(pos, nrm, null, idx);
}

function checkered(p, half) {
  const pos = [], nrm = [], col = [], idx = [];
  const across = 10, along = 2;
  for (let a = 0; a < across; a++) {
    for (let b = 0; b < along; b++) {
      const lat0 = -half + (a / across) * half * 2;
      const lat1 = -half + ((a + 1) / across) * half * 2;
      const t0 = b * 0.7, t1 = (b + 1) * 0.7;
      const base = pos.length / 3;
      const corners = [[lat0, t0], [lat1, t0], [lat1, t1], [lat0, t1]];
      const light = (a + b) % 2 === 0;
      for (const [lat, t] of corners) {
        pos.push(p.x + p.nx * lat + p.tx * t, (p.y || 0) + 0.06, p.z + p.nz * lat + p.tz * t);
        nrm.push(0, 1, 0);
        col.push(light ? 0.95 : 0.05, light ? 0.95 : 0.05, light ? 0.95 : 0.05);
      }
      pushTri(idx, base, base + 1, base + 2);
      pushTri(idx, base, base + 2, base + 3);
    }
  }
  return geoFrom(pos, nrm, null, idx, col);
}

export function buildTrackMesh(track) {
  const group = new THREE.Group();
  const theme = track.theme;
  const tex = asphalt();
  const groundColor = theme === 'desert' ? 0xc4a06a : theme === 'snow' ? 0xe7eef6 : theme === 'neon' ? 0x120818 : 0x1e3a2a;
  const pad = 80;
  const gw = track.maxX - track.minX + pad * 2;
  const gd = track.maxZ - track.minZ + pad * 2;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(gw, gd),
    new THREE.MeshStandardMaterial({ color: groundColor, roughness: 0.95, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((track.minX + track.maxX) / 2, Math.min(-0.02, (track.minY || 0) - 0.2), (track.minZ + track.maxZ) / 2);
  ground.receiveShadow = true;
  group.add(ground);

  const roadColor = theme === 'desert' ? 0xc8b49a : theme === 'snow' ? 0xdfe7ef : 0xffffff;
  const roadMat = new THREE.MeshStandardMaterial({
    map: tex.map, roughnessMap: tex.roughDry, normalMap: tex.normal,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.92, metalness: 0.05, envMapIntensity: 0.45, color: roadColor
  });
  roadMat.userData.tex = tex;
  const closed = !track.open;
  const road = new THREE.Mesh(ribbon(track.pts, track.halfW, 0.03, closed), roadMat);
  road.receiveShadow = true;
  group.add(road);

  const curbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
  const curb = new THREE.Mesh(curbRibbon(track.pts, track.halfW, track.halfW + 0.7, closed), curbMat);
  curb.receiveShadow = true;
  group.add(curb);

  const lineMat = new THREE.MeshBasicMaterial({ color: theme === 'neon' ? 0xff2ef0 : 0xf2e27a });
  const dashes = dashedCenter(track.pts);
  if (dashes) group.add(new THREE.Mesh(dashes, lineMat));
  const checks = new THREE.Mesh(checkered(track.pts[0], track.halfW * 0.96), new THREE.MeshBasicMaterial({ vertexColors: true }));
  group.add(checks);
  if (track.open) {
    const fin = new THREE.Mesh(checkered(track.pts[track.pts.length - 1], track.halfW * 0.96), new THREE.MeshBasicMaterial({ vertexColors: true }));
    group.add(fin);
  }

  const lim = track.halfW + track.grass;
  const wallColor = theme === 'neon' ? 0xff2ef0 : theme === 'snow' ? 0xc5d4e4 : theme === 'desert' ? 0x8a5a32 : 0x3a4254;
  const wallMat = new THREE.MeshStandardMaterial({
    color: wallColor, roughness: 0.55, metalness: theme === 'neon' ? 0.4 : 0.1,
    emissive: theme === 'neon' ? 0xff2ef0 : 0x000000, emissiveIntensity: theme === 'neon' ? 0.55 : 0
  });
  if (track.walls !== false) for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(wallRibbon(track.pts, side * lim, theme === 'neon' ? 1.4 : 0.9, closed), wallMat);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
  }

  addScenery(group, track, theme);
  addGantry(group, track);

  group.userData.roadMat = roadMat;
  return group;
}

export function applyRoadWeather(roadMat, weather) {
  if (!roadMat || !roadMat.userData.tex) return;
  const tex = roadMat.userData.tex;
  const wet = weather === 'rain' || (weather === 'snow');
  roadMat.roughnessMap = wet ? tex.roughWet : tex.roughDry;
  roadMat.roughness = wet ? 0.28 : 0.9;
  roadMat.metalness = wet ? 0.55 : 0.06;
  roadMat.envMapIntensity = wet ? 1.65 : 0.4;
  roadMat.normalScale.set(wet ? 0.85 : 0.3, wet ? 0.85 : 0.3);
  roadMat.needsUpdate = true;
}

function addGantry(group, track) {
  const p = track.pts[0];
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.5, metalness: 0.4 });
  const hw = track.halfW + 0.4;
  for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.2, 0.35), poleMat);
    pole.position.set(p.x + p.nx * s * hw, 2.6 + (p.y || 0), p.z + p.nz * s * hw);
    g.add(pole);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.4, 0.28, 0.4), poleMat);
  // Bar is axis-aligned; rotate it to the track normal.
  bar.position.set(p.x + p.tx * 2, 5.1 + (p.y || 0), p.z + p.tz * 2);
  bar.lookAt(bar.position.x + p.nx, bar.position.y, bar.position.z + p.nz);
  g.add(bar);
  const lights = [];
  const colors = [0xff2a2a, 0xff2a2a, 0xffc83a, 0x3dff6a];
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: colors[i], emissive: colors[i], emissiveIntensity: 0.15 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat);
    const lat = (i - 1.5) * 0.7;
    bulb.position.set(p.x + p.nx * lat + p.tx * 2, 4.7 + (p.y || 0), p.z + p.nz * lat + p.tz * 2);
    g.add(bulb);
    lights.push(mat);
  }
  group.add(g);
  group.userData.lights = lights;
}

function addScenery(group, track, theme) {
  const rng = mulberry32(track.key.length * 1000 + track.N);
  const lim = track.halfW + track.grass + 6;
  const positions = [];
  for (let i = 0; i < track.N; i += 4) {
    for (const s of [-1, 1]) {
      if (rng() < 0.35) continue;
      const p = track.pts[i];
      const dist = lim + rng() * 18;
      positions.push({ x: p.x + p.nx * s * dist, z: p.z + p.nz * s * dist, y: p.y || 0, s: 0.7 + rng() });
    }
  }
  if (theme === 'city' || theme === 'neon') {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.05 });
    const mesh = new THREE.InstancedMesh(box, mat, positions.length);
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    positions.forEach((p, i) => {
      const h = 6 + rng() * (theme === 'neon' ? 28 : 18);
      const w = 4 + rng() * 6;
      dummy.position.set(p.x, h / 2 + (p.y || 0), p.z);
      dummy.scale.set(w, h, w * (0.6 + rng() * 0.6));
      dummy.rotation.y = rng() * 0.5;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      c.set(theme === 'neon' ? (rng() < 0.5 ? 0x241433 : 0x102028) : (rng() < 0.5 ? 0x4a5568 : 0x3d4a5c));
      mesh.setColorAt(i, c);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (theme === 'neon') {
      for (let i = 0; i < positions.length; i += 6) {
        const p = positions[i];
        const matN = new THREE.MeshStandardMaterial({
          color: i % 2 ? 0xff2ef0 : 0x2ee6ff, emissive: i % 2 ? 0xff2ef0 : 0x2ee6ff, emissiveIntensity: 2.4
        });
        const sign = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.1, 0.15), matN);
        sign.position.set(p.x, 6 + (i % 5) + (p.y || 0), p.z);
        group.add(sign);
      }
    }
  } else if (theme === 'desert') {
    const cone = new THREE.ConeGeometry(0.7, 2.4, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 0.8 });
    const mesh = new THREE.InstancedMesh(cone, mat, positions.length);
    const dummy = new THREE.Object3D();
    positions.forEach((p, i) => {
      dummy.position.set(p.x, 1.2 + (p.y || 0), p.z);
      dummy.scale.setScalar(0.6 + rng());
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    group.add(mesh);
    const rock = new THREE.DodecahedronGeometry(1, 0);
    const rmat = new THREE.MeshStandardMaterial({ color: 0xb08968, roughness: 0.9 });
    const rocks = new THREE.InstancedMesh(rock, rmat, Math.ceil(positions.length / 2));
    for (let i = 0; i < rocks.count; i++) {
      const p = positions[i * 2];
      dummy.position.set(p.x + 2, 0.6 + (p.y || 0), p.z);
      dummy.scale.set(1.2, 0.7, 1);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    group.add(rocks);
  } else {
    const cone = new THREE.ConeGeometry(1.3, 4.2, 7);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1e4d3a, roughness: 0.85 });
    const mesh = new THREE.InstancedMesh(cone, mat, positions.length);
    const dummy = new THREE.Object3D();
    const snow = new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.6 });
    const caps = new THREE.InstancedMesh(new THREE.ConeGeometry(0.7, 1.2, 6), snow, positions.length);
    positions.forEach((p, i) => {
      const sc = 0.7 + rng() * 0.8;
      dummy.position.set(p.x, 2.1 * sc + (p.y || 0), p.z);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 4.2 * sc + (p.y || 0);
      dummy.scale.setScalar(sc * 0.7);
      dummy.updateMatrix();
      caps.setMatrixAt(i, dummy.matrix);
    });
    group.add(mesh, caps);
  }
}

export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
  });
}
