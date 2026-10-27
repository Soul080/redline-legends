/* districts.js — 2D districts, parks, and doors, built as real 3D masses.
   Gameplay lots stay on the avenues. Filler blocks get stacked buildings.
   Parks, the harbor, and the dragway get their own props. */

import * as THREE from 'three';

const DOWNTOWN = { id: 'downtown', name: 'Downtown', tint: 0x1a3338, blurb: 'Where every nobody starts.' };
const HARBOR = { id: 'harbor', name: 'Harbor', tint: 0x143044, blurb: 'Cranes, salt air, and quiet money.' };
const NEON = { id: 'neon', name: 'Neon Mile', tint: 0x2a1434, blurb: 'The lights never go out.' };
const INDUSTRIAL = { id: 'industrial', name: 'Industrial', tint: 0x2a2418, blurb: 'Warehouses, warrants, and side bets.' };
const OLDTOWN = { id: 'oldtown', name: 'Old Town', tint: 0x2a2618, blurb: 'Clock tower, crooked alleys, hidden tags.' };
const HEIGHTS = { id: 'heights', name: 'The Heights', tint: 0x16341e, blurb: 'Best view in Redline City.' };
const DRAGWAY = { id: 'dragway', name: 'Redline Dragway', tint: 0x2a1520, blurb: 'Thirteen hundred and twenty feet of truth.' };

export function districtAt(ix, iz) {
  if (iz === -3) return DOWNTOWN;
  if (ix <= -2 && iz <= -1) return HARBOR;
  if (ix >= 1 && iz <= -1) return NEON;
  if (ix <= -2 && iz >= 0) return INDUSTRIAL;
  if (ix >= 1 && iz >= 0) return HEIGHTS;
  if (iz >= 0) return OLDTOWN;
  return DOWNTOWN;
}

/* Parks are whole blocks: no tower fill, just paths, trees, and a landmark. */
const PARKS = {
  '-1:-1': { id: 'plaza', name: 'Plaza Park', district: 'downtown' },
  '-2:-2': { id: 'pierpark', name: 'Harbor Green', district: 'harbor' },
  '0:2': { id: 'oldpark', name: 'Old Town Square', district: 'oldtown' },
  '1:2': { id: 'heights', name: 'Heights Park', district: 'heights' }
};

const PALETTE = {
  downtown: ['#6a7c90', '#7d8ea0', '#556878', '#8a7868'],
  harbor: ['#4e6a78', '#3e5868', '#6a5e4e', '#2f4c5c'],
  neon: ['#4a2a62', '#6a3478', '#2a3a62', '#703060'],
  industrial: ['#6a6256', '#5a5046', '#7a6a50', '#4a4038'],
  oldtown: ['#7a6a54', '#6a5c48', '#8a7a60', '#5a4e40'],
  heights: ['#5a7a68', '#6a8a74', '#4a6a58', '#7a9078']
};

export const POIS = [
  { id: 'garage', ix: -3, iz: -3, name: 'GARAGE', color: '#2ee6ff', kind: 'garage', blurb: 'Bays, paint, and the car you actually own.' },
  { id: 'office', ix: 0, iz: -3, name: 'RACE OFFICE', color: '#ffe03b', kind: 'tower', blurb: 'League races and the side grid meet here.' },
  { id: 'dealer', ix: 1, iz: -3, name: 'DEALERSHIP', color: '#ff2ef0', kind: 'dealer', blurb: 'New metal. League locks still apply.' },
  { id: 'shop', ix: 2, iz: -3, name: 'SHOP', color: '#7dff5a', kind: 'shop', blurb: 'Parts, spares, and a counter that buys them back.' },
  { id: 'bar', ix: -1, iz: -2, name: 'NEON BAR', color: '#ff2ef0', kind: 'bar', blurb: 'The downtown hideout. Crew talk, and criminal work.' },
  { id: 'training', ix: 0, iz: -2, name: 'TRAINING', color: '#ff8a2e', kind: 'track', blurb: 'A walled practice loop. Solo laps, no purse.' },
  { id: 'warehouse', ix: -3, iz: -2, name: 'HARBOR CO', color: '#8aa0b4', kind: 'warehouse', blurb: 'Containers move after midnight. Criminals load them.' },
  { id: 'bank', ix: 2, iz: -2, name: 'NEON BANK', color: '#d9d3c4', kind: 'bank', blurb: 'Marble, cameras, and a vault that has never been politely opened.' },
  { id: 'mart', ix: -2, iz: 0, name: 'QUICK MART', color: '#7dff5a', kind: 'shop', blurb: 'A bright aisled shop. Criminals know the back door.' },
  { id: 'police', ix: -3, iz: 1, name: 'POLICE', color: '#3fa9ff', kind: 'police', blurb: 'Role HQ. Neutral, criminal, or a badge.' },
  { id: 'hospital', ix: -1, iz: 2, name: 'HOSPITAL', color: '#ff5a7a', kind: 'hospital', blurb: 'Clinic off the avenue. Wasted drivers wake up here.' },
  { id: 'gas', ix: 2, iz: 0, name: 'NITRO FUEL', color: '#ff8a2e', kind: 'gas', blurb: 'High-test and a hose. Patches a little damage.' },
  { id: 'drag', ix: 2, iz: -1, name: 'DRAG STRIP', color: '#ff3b6b', kind: 'meetup', blurb: 'The east meetup. The quarter mile starts past the tower.' },
  { id: 'vista', ix: 2, iz: 2, name: 'VISTA', color: '#ffe03b', kind: 'vista', blurb: 'Best view in the city. Photo mode was made for this deck.' }
];

const SPEC = {
  garage: { w: 26, d: 14, h: 7 },
  tower: { w: 16, d: 14, h: 24 },
  dealer: { w: 28, d: 14, h: 8 },
  shop: { w: 18, d: 12, h: 8 },
  bar: { w: 22, d: 12, h: 7 },
  track: { w: 30, d: 20, h: 1.35 },
  warehouse: { w: 32, d: 16, h: 9 },
  bank: { w: 18, d: 16, h: 20 },
  police: { w: 18, d: 14, h: 16 },
  hospital: { w: 22, d: 14, h: 14 },
  gas: { w: 10, d: 8, h: 5 },
  meetup: { w: 18, d: 12, h: 11 },
  vista: { w: 12, d: 12, h: 28 }
};

export function buildDistricts(api) {
  const { rng, pitch, roadW, half, extent, group, blockBuilds, colliders, roadGeos, plane, boxOf } = api;
  const pois = [];
  const landmarks = [];
  const info = {};
  for (const d of [DOWNTOWN, HARBOR, NEON, INDUSTRIAL, OLDTOWN, HEIGHTS, DRAGWAY]) {
    info[d.id] = { id: d.id, name: d.name, blurb: d.blurb, buildings: 0, parks: 0, props: 0, pois: [] };
  }

  const poiByKey = {};
  POIS.forEach((p) => { poiByKey[p.ix + ':' + p.iz] = p; });
  const inner = pitch - roadW - 6;
  const tintGeos = {};
  const extras = [];
  const trees = [];
  const benches = [];

  function tint(id, geo) {
    if (!tintGeos[id]) tintGeos[id] = [];
    tintGeos[id].push(geo);
  }
  function solid(x, z, w, d, h, color, base, top) {
    blockBuilds.push({ x, z, w, d, h, color, base: base || 0 });
    colliders.push(boxOf(x, z, w / 2, d / 2, top == null ? (base || 0) + h : top));
  }
  function propBox(x, z, w, d, h, color, base) {
    extras.push({ x, z, w, d, h, color, base: base || 0 });
  }
  function stack(x, z, w, d, h, color) {
    const baseH = Math.max(3.1, Math.min(h * 0.38, h - 2.4));
    const capH = 0.55;
    const shaftH = Math.max(1.8, h - baseH - capH);
    solid(x, z, w, d, baseH, color, 0);
    solid(x, z, w * 0.74, d * 0.74, shaftH, color, baseH);
    propBox(x, z, w * 0.8, d * 0.8, capH, color, baseH + shaftH + 0.04);
  }

  for (let ix = -half; ix < half; ix++) {
    for (let iz = -half; iz < half; iz++) {
      const dist = districtAt(ix, iz);
      const key = ix + ':' + iz;
      const cx = (ix + 0.5) * pitch;
      const cz = (iz + 0.5) * pitch;
      const x0 = ix * pitch + roadW / 2 + 3.4;
      const z0 = iz * pitch + roadW / 2 + 3.4;
      const x1 = (ix + 1) * pitch - roadW / 2 - 3.4;
      const z1 = (iz + 1) * pitch - roadW / 2 - 3.4;
      tint(dist.id, plane(x0, z0, x1 - x0, z1 - z0, -0.015));

      const park = PARKS[key];
      if (park) {
        dressPark(park, cx, cz, x0, z0, x1 - x0, z1 - z0);
        info[dist.id].parks++;
        continue;
      }

      const poi = poiByKey[key];
      const pal = PALETTE[dist.id] || PALETTE.downtown;
      if (poi) {
        const spec = SPEC[poi.kind];
        const roadNorth = iz * pitch + roadW / 2;
        const lotD = 12, lotW = Math.min(18, spec.w);
        const bz = roadNorth + lotD + spec.d / 2 + 0.45;
        placeNamed(poi, cx, bz, spec);
        pois.push({
          id: poi.id, name: poi.name, color: poi.color, blurb: poi.blurb, district: dist.id,
          x: cx, z: roadNorth + lotD / 2, hx: lotW / 2 - 0.4, hz: lotD / 2 - 0.3,
          signZ: bz - spec.d / 2 - 0.35, signX: cx,
          signY: Math.max(3.5, Math.min(6.2, spec.h - 1.4))
        });
        roadGeos.push(plane(cx - lotW / 2, roadNorth, lotW, lotD, 0.032));
        info[dist.id].pois.push(poi.id);
        info[dist.id].buildings++;
        if (spec.d < 18 && poi.kind !== 'track') {
          const nz = cz + inner * 0.28;
          stack(cx - 14, nz, 14, 12, 8 + rng() * 8, pal[0]);
          stack(cx + 14, nz, 14, 12, 7 + rng() * 10, pal[1]);
          info[dist.id].buildings += 2;
        }
        continue;
      }

      const cols = 2, rows = 2, gap = 4;
      const cellW = (inner - gap * (cols - 1)) / cols;
      const cellD = (inner - gap * (rows - 1)) / rows;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (ix === 0 && iz === 1 && c === 0 && r === 1) {
            placeClock(cx - inner / 2 + cellW / 2, cz - inner / 2 + cellD / 2 + 1 * (cellD + gap));
            info[dist.id].buildings++;
            continue;
          }
          if (rng() < 0.05) continue;
          const x = cx - inner / 2 + cellW / 2 + c * (cellW + gap);
          const z = cz - inner / 2 + cellD / 2 + r * (cellD + gap);
          const downtown = dist.id === 'downtown' || dist.id === 'neon' ? 1 : 0;
          const cap = dist.id === 'heights' ? 12 : dist.id === 'harbor' || dist.id === 'industrial' ? 14 : 26;
          const h = (dist.id === 'heights' ? 6 : 8) + rng() * (6 + downtown * cap);
          const w = cellW * (0.78 + rng() * 0.16);
          const d = cellD * (0.78 + rng() * 0.16);
          stack(x, z, w, d, h, pal[(c + r + ix + iz) & 3]);
          info[dist.id].buildings++;
          if (dist.id === 'industrial' && c === 0 && r === 0) {
            propBox(x, z + d * 0.62, 0.85, 0.85, 1.15, '#6a4a32', 0);
            propBox(x + 1.3, z + d * 0.62, 0.7, 0.7, 1.0, '#2e2e2e', 0);
            info.industrial.props += 2;
          }
          if (dist.id === 'neon' && r === 1) {
            propBox(x, z - d * 0.55, w * 0.62, 0.22, 0.16, '#ff2ef0', 3.05);
            info.neon.props++;
          }
        }
      }
    }
  }

  dressHarbor();
  dressStrip();
  dressArch();
  addFountainLandmark();

  for (const id of Object.keys(tintGeos)) {
    const geos = tintGeos[id];
    if (!geos.length) continue;
    const sample = [DOWNTOWN, HARBOR, NEON, INDUSTRIAL, OLDTOWN, HEIGHTS, DRAGWAY].find((d) => d.id === id);
    const mat = new THREE.MeshStandardMaterial({
      color: sample ? sample.tint : 0x1a2a22,
      roughness: 0.96,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const mesh = new THREE.Mesh(mergeTint(geos), mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  if (extras.length) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.08 });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, extras.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    extras.forEach((b, i) => {
      dummy.position.set(b.x, (b.base || 0) + b.h / 2, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(b.color);
      mesh.setColorAt(i, color);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  if (trees.length) {
    const mesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.5, 4.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x1c6b3a, roughness: 0.88 }),
      trees.length
    );
    const trunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.18, 0.24, 1.1, 5),
      new THREE.MeshStandardMaterial({ color: 0x4a3424, roughness: 0.9 }),
      trees.length
    );
    const dummy = new THREE.Object3D();
    trees.forEach((t, i) => {
      dummy.position.set(t.x, 2.3 * t.s, t.z);
      dummy.scale.setScalar(t.s);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, 0.55, t.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      trunk.setMatrixAt(i, dummy.matrix);
    });
    mesh.castShadow = true;
    mesh.computeBoundingSphere();
    trunk.computeBoundingSphere();
    group.add(mesh, trunk);
  }

  if (benches.length) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x6a5438, roughness: 0.8 });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.45, 0.55), mat, benches.length);
    const dummy = new THREE.Object3D();
    benches.forEach((b, i) => {
      dummy.position.set(b.x, 0.4, b.z);
      dummy.rotation.set(0, b.rot || 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.castShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  function placeNamed(poi, x, z, spec) {
    const col = poi.color;
    if (poi.kind === 'track') {
      const hw = spec.w / 2, hd = spec.d / 2, t = 1.1;
      solid(x, z - hd + t / 2, spec.w, t, spec.h, col, 0, spec.h);
      solid(x, z + hd - t / 2, spec.w, t, spec.h, col, 0, spec.h);
      solid(x - hw + t / 2, z, t, spec.d, spec.h, col, 0, spec.h);
      solid(x + hw - t / 2, z, t, spec.d - 6, spec.h, col, 0, spec.h);
      propBox(x, z, spec.w - 6, spec.d - 6, 0.08, '#2f6b3a', 0.02);
      return;
    }
    if (poi.kind === 'gas') {
      solid(x, z + 2, spec.w, spec.d, spec.h, col, 0);
      const canopyY = 5.15;
      propBox(x, z - 4, 16, 9, 0.22, col, canopyY);
      for (const sx of [-6, 6]) for (const sz of [-7, -1]) {
        solid(x + sx, z + sz, 0.35, 0.35, canopyY, '#22262e', 0, canopyY);
      }
      return;
    }
    solid(x, z, spec.w, spec.d, spec.h, col, 0);
    if (poi.kind === 'garage') {
      propBox(x - 6, z - spec.d / 2 - 0.12, 7, 0.2, 3.2, '#141820', 0.2);
      propBox(x + 6, z - spec.d / 2 - 0.12, 7, 0.2, 3.2, '#141820', 0.2);
    } else if (poi.kind === 'shop') {
      propBox(x, z - spec.d / 2 - 1.3, spec.w * 0.86, 2.2, 0.18, col, 3.15);
    } else if (poi.kind === 'dealer') {
      propBox(x, z - spec.d / 2 - 0.15, spec.w * 0.7, 0.25, 3.4, '#9ad8ff', 0.3);
      propBox(x - 8, z - spec.d / 2 - 4, 3.2, 6, 0.12, '#2a3140', 0.05);
      propBox(x + 8, z - spec.d / 2 - 4, 3.2, 6, 0.12, '#2a3140', 0.05);
    } else if (poi.kind === 'bar') {
      propBox(x, z, spec.w + 0.35, spec.d + 0.35, 0.35, col, spec.h + 0.05);
    } else if (poi.kind === 'hospital') {
      propBox(x, z, 1.1, 0.4, 3.2, '#ff2a4a', spec.h + 0.2);
      propBox(x, z, 3.2, 0.4, 1.1, '#ff2a4a', spec.h + 1.25);
    } else if (poi.kind === 'police') {
      propBox(x, z, spec.w + 0.28, spec.d + 0.28, 0.7, '#dbe7ff', spec.h * 0.42);
      propBox(x, z, 0.25, 0.25, 4, '#d0d6e0', spec.h + 0.05);
    } else if (poi.kind === 'bank') {
      for (const sx of [-11, 11]) solid(x + sx, z - spec.d / 2 + 0.2, 0.7, 0.7, 4.2, '#c8c2b4', 0, 4.2);
    } else if (poi.kind === 'warehouse') {
      propBox(x - spec.w / 2 - 3.2, z, 5.5, 2.3, 2.3, '#c83a4a', 0);
      propBox(x - spec.w / 2 - 3.2, z + 3.2, 5.5, 2.3, 2.3, '#2ee6ff', 0);
      propBox(x + spec.w / 2 + 3.2, z - 2, 5.2, 2.2, 2.2, '#ffe03b', 0);
    } else if (poi.kind === 'tower' || poi.kind === 'vista' || poi.kind === 'meetup') {
      propBox(x, z, spec.w * 0.55, spec.d * 0.55, 1.4, col, spec.h);
    }
  }

  function placeClock(x, z) {
    solid(x, z, 6, 6, 34, '#6a5c48', 0);
    propBox(x, z - 3.05, 3.2, 0.2, 3.2, '#ffe03b', 22);
    landmarks.push({
      id: 'clock', name: 'Old Town Clock', x, z, r: 16,
      text: 'Stopped at 11:07 the night the Phantom first won the spiral. Nobody reset it.'
    });
    info.oldtown.props += 2;
  }

  function dressPark(park, cx, cz, x0, z0, w, d) {
    propBox(cx, cz, w * 0.92, d * 0.92, 0.05, '#1a4a28', 0.02);
    propBox(cx, cz, 3.2, d * 0.7, 0.05, '#d5d0c4', 0.1);
    propBox(cx, cz, w * 0.7, 3.2, 0.05, '#d5d0c4', 0.1);
    const spots = [
      [-10, -8], [10, -8], [-10, 8], [10, 8], [-16, 0], [16, 0], [0, -14], [0, 14]
    ];
    for (const s of spots) {
      trees.push({ x: cx + s[0], z: cz + s[1], s: 0.85 + rng() * 0.5 });
      info[park.district].props++;
    }
    benches.push({ x: cx - 6, z: cz - 4, rot: 0 });
    benches.push({ x: cx + 6, z: cz + 4, rot: Math.PI });
    benches.push({ x: cx + 4, z: cz - 6, rot: Math.PI / 2 });
    info[park.district].props += 6;
    if (park.id === 'heights') {
      solid(cx, cz + 6, 2.2, 2.2, 1.3, '#8a8478', 0, 1.3);
      propBox(cx, cz + 6, 0.7, 0.7, 2.4, '#d9d3c7', 1.3);
      landmarks.push({
        id: 'statue', name: 'Founders Statue', x: cx, z: cz + 6, r: 12,
        text: 'A bronze driver with no face. The plaque just says "EARN IT".'
      });
    } else if (park.id === 'oldpark') {
      propBox(cx, cz, 5, 5, 0.4, '#6a5438', 0.1);
    } else if (park.id === 'pierpark') {
      propBox(cx - 6, cz, 4, 1.6, 1.5, '#c83a4a', 0);
      propBox(cx + 2, cz + 3, 4, 1.6, 1.5, '#2ee6ff', 0);
    }
  }

  function dressHarbor() {
    const shore = -extent - 16;
    const pierZ = -2 * pitch;
    const south0 = -extent, south1 = pierZ - 10;
    const north0 = pierZ + 10, north1 = extent;
    colliders.push(boxOf(shore, (south0 + south1) / 2, 1.4, (south1 - south0) / 2, 2.2));
    colliders.push(boxOf(shore, (north0 + north1) / 2, 1.4, (north1 - north0) / 2, 2.2));
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x1a6e96, roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.9, envMapIntensity: 1
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(52, extent * 2.05), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(-extent - 46, 0.04, 0);
    group.add(water);
    const pierMat = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.9 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(22, 0.12, 7), pierMat);
    pier.position.set(-extent - 18, 0.08, pierZ);
    pier.receiveShadow = true;
    group.add(pier);
    const lightX = -extent - 26;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 1.4, 10), new THREE.MeshStandardMaterial({ color: 0xc8c2b4, roughness: 0.7 }));
    base.position.set(lightX, 0.7, pierZ);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.45, 16, 8), new THREE.MeshStandardMaterial({ color: 0xe6e0d2, roughness: 0.6 }));
    shaft.position.set(lightX, 9, pierZ);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffe2a0, emissiveIntensity: 0.8 }));
    lamp.position.set(lightX, 17.4, pierZ);
    shaft.castShadow = true;
    group.add(base, shaft, lamp);
    colliders.push(boxOf(lightX, pierZ, 2.2, 2.2, 18));
    landmarks.push({
      id: 'light', name: 'Harbor Lighthouse', x: lightX, z: pierZ, r: 14,
      text: 'The lamp still sweeps the inlet. Racers use it as a marker when the fog rolls in.'
    });
    const craneX = -1.5 * pitch - 8;
    const craneZ = -1.5 * pitch + 4;
    for (const shift of [0, 14]) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.7, 18, 0.7), new THREE.MeshStandardMaterial({ color: 0x8aa0b4, roughness: 0.45, metalness: 0.4 }));
      pole.position.set(craneX + shift, 9, craneZ);
      const jib = new THREE.Mesh(new THREE.BoxGeometry(16, 0.45, 0.45), new THREE.MeshStandardMaterial({ color: 0x9aafc0, roughness: 0.4, metalness: 0.5 }));
      jib.position.set(craneX + shift + 6, 17.6, craneZ);
      pole.castShadow = true;
      group.add(pole, jib);
      colliders.push(boxOf(craneX + shift, craneZ, 0.8, 0.8, 18));
    }
    landmarks.push({
      id: 'cranes', name: 'Container Cranes', x: craneX + 6, z: craneZ, r: 16,
      text: 'Harbor Co. moves more than cargo after midnight. Ask around if you want a delivery.'
    });
    info.harbor.buildings += 3;
    info.harbor.props += 6;
  }

  function dressStrip() {
    const stripX = extent + 70;
    const z0 = -30;
    const tower = { x: stripX - 16, z: z0 + 10 };
    solid(tower.x, tower.z, 5, 5, 22, '#2a121c', 0);
    propBox(tower.x, tower.z, 8, 0.4, 2.2, '#ff3b6b', 18);
    for (let i = 0; i < 6; i++) {
      propBox(stripX + 14, z0 + 30 + i * 18, 6, 10, 3.2 + (i % 2), '#3a1824', 0);
      info.dragway.props++;
    }
    landmarks.push({
      id: 'tower', name: 'Dragway Tower', x: tower.x, z: tower.z, r: 14,
      text: 'Christmas tree, timing booth, and a board of ET records that still has blank lines.'
    });
    info.dragway.buildings += 4;
    info.dragway.pois.push('drag');
  }

  function dressArch() {
    const x = 1.5 * pitch;
    const z = -2 * pitch;
    const mat = new THREE.MeshStandardMaterial({ color: 0xff2ef0, emissive: 0xff2ef0, emissiveIntensity: 0.7, roughness: 0.35 });
    const g = new THREE.Group();
    for (const pz of [-8, 8]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.3, 8.5, 1.3), mat);
      p.position.set(0, 4.25, pz);
      p.castShadow = true;
      g.add(p);
      colliders.push(boxOf(x, z + pz, 0.9, 0.9, 8.5));
    }
    for (let i = 0; i <= 6; i++) {
      const t = (i / 6) * Math.PI;
      const pz = Math.cos(t) * 8;
      const py = 8.2 + Math.sin(t) * 3.1;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 2.4), mat);
      seg.position.set(0, py, pz);
      g.add(seg);
    }
    g.position.set(x, 0, z);
    group.add(g);
    landmarks.push({
      id: 'arch', name: 'Neon Arch', x, z, r: 14,
      text: 'The arch marks the Neon Mile. Photos taken under it at night are a city tradition.'
    });
    info.neon.props += 4;
  }

  function addFountainLandmark() {
    landmarks.push({
      id: 'fountain', name: 'Plaza Fountain', x: 0, z: 0, r: 14,
      text: 'Downtown\'s meeting spot. Coins in the water are bad luck. Respect is the real currency.'
    });
    landmarks.push({
      id: 'plaza', name: 'Bank Plaza', x: (2 + 0.5) * pitch, z: (-2 + 0.5) * pitch - 6, r: 14,
      text: 'Marble, cameras, and a vault that has never been politely opened.'
    });
    info.downtown.props += 2;
  }

  return { pois, landmarks, districtInfo: Object.keys(info).map((k) => info[k]) };
}

function mergeTint(list) {
  let n = 0;
  for (const a of list) n += a.length;
  const raw = new Float32Array(n);
  let o = 0;
  for (const a of list) { raw.set(a, o); o += a.length; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(raw, 3));
  g.computeVertexNormals();
  return g;
}
