/* city.js — a driveable downtown. Roads are one merged mesh (so the wet
   asphalt material is a single draw), buildings and lamps are instanced,
   and a spatial hash answers "did the car hit a wall?".
   The drag strip sits on the east edge and is part of the same city, so you
   can drive to it instead of teleporting through a menu. */

import * as THREE from 'three';
import { makeAsphalt, makeFacade, makeSignTexture } from './textures.js';
import { mulberry32, clamp } from './util.js';
import { POIS, buildDistricts } from './districts.js';

export const CITY = {
  pitch: 86,
  roadW: 15,
  half: 3
};

export function buildCity() {
  const rng = mulberry32(0x51ed);
  const { pitch, roadW, half } = CITY;
  const extent = half * pitch;
  const group = new THREE.Group();
  const tex = makeAsphalt();
  const facade = makeFacade();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(extent * 2 + 420, extent * 2 + 220),
    new THREE.MeshStandardMaterial({ color: 0x1a2a22, roughness: 0.96, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  group.add(ground);

  const roadMat = new THREE.MeshStandardMaterial({
    map: tex.map, roughnessMap: tex.roughDry, normalMap: tex.normal,
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughness: 0.9, metalness: 0.06, envMapIntensity: 0.5, color: 0xffffff,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  });
  roadMat.map.repeat.set(extent / 18, 8);
  roadMat.userData.tex = tex;
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x3c4452, roughness: 0.86, metalness: 0.02 });

  const roadGeos = [];
  const sideGeos = [];
  const markGeos = [];
  // Horizontal avenues run the full width (they own the intersections).
  for (let i = -half; i <= half; i++) {
    roadGeos.push(plane( -extent - 40, i * pitch - roadW / 2, extent * 2 + 80, roadW, 0.02));
    sideGeos.push(plane(-extent - 40, i * pitch - roadW / 2 - 2.2, extent * 2 + 80, 2.2, 0.01));
    sideGeos.push(plane(-extent - 40, i * pitch + roadW / 2, extent * 2 + 80, 2.2, 0.01));
    markGeos.push(dashLine(-extent, extent, i * pitch, true));
  }
  // Vertical streets stop at each avenue so two coplanar meshes don't z-fight.
  for (let i = -half; i <= half; i++) {
    for (let j = -half; j < half; j++) {
      const z0 = j * pitch + roadW / 2;
      const z1 = (j + 1) * pitch - roadW / 2;
      roadGeos.push(plane(i * pitch - roadW / 2, z0, roadW, z1 - z0, 0.025));
      markGeos.push(dashLine(z0, z1, i * pitch, false));
    }
    sideGeos.push(plane(i * pitch - roadW / 2 - 2.2, -extent, 2.2, extent * 2, 0.012));
    sideGeos.push(plane(i * pitch + roadW / 2, -extent, 2.2, extent * 2, 0.012));
  }

  // Drag strip: a long two-lane road east of downtown, plus a connector.
  const stripX = extent + 70;
  const stripZ0 = -30;
  const stripLen = 470;
  roadGeos.push(plane(stripX - 9, stripZ0, 18, stripLen, 0.03));
  sideGeos.push(plane(stripX - 11.2, stripZ0, 2.2, stripLen, 0.015));
  sideGeos.push(plane(stripX + 9, stripZ0, 2.2, stripLen, 0.015));
  // Connector from the eastern avenue (x = extent) at z = -pitch.
  const connZ = -pitch;
  roadGeos.push(plane(extent - roadW / 2, connZ - roadW / 2, stripX - extent + 9, roadW, 0.028));

  const walk = new THREE.Mesh(mergePlanes(sideGeos), sidewalkMat);
  walk.receiveShadow = true;
  const marks = new THREE.Mesh(
    mergePlanes(markGeos),
    new THREE.MeshBasicMaterial({
      color: 0xf0e27a,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    })
  );
  group.add(walk, marks);

  // Barriers along the strip so a missed shift doesn't yeet you into the grass forever.
  const barrierMat = new THREE.MeshStandardMaterial({ color: 0xc83a3a, roughness: 0.55, metalness: 0.15 });
  const barrierGeo = new THREE.BoxGeometry(0.4, 0.7, 1);
  const barrierCount = Math.floor(stripLen / 4) * 2;
  const barriers = new THREE.InstancedMesh(barrierGeo, barrierMat, barrierCount);
  const dummy = new THREE.Object3D();
  const colliders = [];
  let bi = 0;
  for (let z = stripZ0 + 2; z < stripZ0 + stripLen; z += 4) {
    for (const side of [-1, 1]) {
      dummy.position.set(stripX + side * 10.2, 0.35, z);
      dummy.scale.set(1, 1, 3.6);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      barriers.setMatrixAt(bi++, dummy.matrix);
      colliders.push(boxOf(stripX + side * 10.2, z, 0.6, 2, 0.9));
    }
  }
  barriers.castShadow = true;
  barriers.computeBoundingSphere();
  group.add(barriers);

  // Buildings.
  const bmat = new THREE.MeshStandardMaterial({
    map: facade.map, emissiveMap: facade.emissiveMap, emissive: 0xffffff,
    emissiveIntensity: 0.35, roughness: 0.72, metalness: 0.08, color: 0xffffff
  });
  bmat.customProgramCacheKey = () => 'facade-tile';
  bmat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
       #ifdef USE_INSTANCING
         float _fw = length(instanceMatrix[0].xyz);
         float _fh = instanceMatrix[1].y;
         float _fd = length(instanceMatrix[2].xyz);
         #ifdef USE_MAP
           vMapUv.x *= max(_fw, _fd) * 0.22;
           vMapUv.y *= _fh * 0.22;
         #endif
         #ifdef USE_EMISSIVEMAP
           vEmissiveMapUv.x *= max(_fw, _fd) * 0.22;
           vEmissiveMapUv.y *= _fh * 0.22;
         #endif
       #endif`
    );
  };
  const blockBuilds = [];
  const dressed = buildDistricts({
    rng, pitch, roadW, half, extent, group, blockBuilds, colliders, roadGeos, plane, boxOf
  });
  const pois = dressed.pois;
  const landmarks = dressed.landmarks;
  const districtInfo = dressed.districtInfo;

  const road = new THREE.Mesh(mergePlanes(roadGeos), roadMat);
  road.receiveShadow = true;
  group.add(road);

  const building = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bmat, blockBuilds.length);
  const color = new THREE.Color();
  blockBuilds.forEach((b, i) => {
    dummy.position.set(b.x, (b.base || 0) + b.h / 2, b.z);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    building.setMatrixAt(i, dummy.matrix);
    color.set(b.color);
    building.setColorAt(i, color);
  });
  building.castShadow = true;
  building.receiveShadow = false;
  building.computeBoundingSphere();
  group.add(building);

  // Plaza fountain + wordmark, the thing the title camera orbits.
  const plaza = new THREE.Group();
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(7.2, 7.5, 0.8, 20),
    new THREE.MeshStandardMaterial({ color: 0x2a3344, roughness: 0.4, metalness: 0.4 })
  );
  rim.position.y = 0.4;
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(6.2, 6.2, 0.4, 20),
    new THREE.MeshPhysicalMaterial({ color: 0x2ee6ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.72, envMapIntensity: 1.4 })
  );
  water.position.y = 0.7;
  const jet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.6, 3.2, 8),
    new THREE.MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.7 })
  );
  jet.position.y = 2.2;
  plaza.add(rim, water, jet);
  group.add(plaza);
  colliders.push(boxOf(0, 0, 7.5, 7.5, 3.4));

  const word = signMesh('REDLINE', '#ff2ef0', 16, 3.2);
  word.position.set(0, 10, -18);
  group.add(word);

  const signs = [word];
  for (const p of pois) {
    const s = signMesh(p.name, p.color, Math.min(14, 2.2 + p.name.length * 0.72), 2.1);
    s.position.set(p.signX, p.signY || 5.4, p.signZ);
    group.add(s);
    signs.push(s);
    // A little porch light so the door reads at night even before the nearest-lamp pass.
    const pl = new THREE.PointLight(new THREE.Color(p.color), 0, 16, 2);
    pl.position.set(p.signX, 5, p.signZ + 1);
    group.add(pl);
    p.light = pl;
  }

  // Lamps along avenues. Instanced poles; a handful of real SpotLights follow the car.
  const lamps = [];
  for (let i = -half; i <= half; i++) {
    for (let x = -extent; x <= extent; x += 48) {
      lamps.push({ x: x + 8, z: i * pitch + roadW / 2 + 1.4 });
      lamps.push({ x: x - 8, z: i * pitch - roadW / 2 - 1.4 });
    }
  }
  const pole = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.12, 0.16, 7, 6),
    new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.5, metalness: 0.5 }),
    lamps.length
  );
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffe2a8, emissiveIntensity: 0.2 });
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 8), headMat, lamps.length);
  lamps.forEach((p, i) => {
    dummy.position.set(p.x, 3.5, p.z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    pole.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 7.05;
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  });
  pole.computeBoundingSphere();
  heads.computeBoundingSphere();
  group.add(pole, heads);

  // Sidewalk props. Cones and bins are destructible; buildings are not.
  const props = [];
  const propGroup = new THREE.Group();
  const coneGeo = new THREE.ConeGeometry(0.32, 0.72, 7);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6a12, roughness: 0.55 });
  const binGeo = new THREE.BoxGeometry(0.72, 0.95, 0.72);
  const binMat = new THREE.MeshStandardMaterial({ color: 0x243044, roughness: 0.72, metalness: 0.25 });
  for (let i = -half; i <= half; i++) {
    for (let k = -half; k <= half; k++) {
      if (i === 0 && k === 0) continue;
      const along = k * pitch + (i % 2 === 0 ? 6 : -6);
      const side = i * pitch + roadW / 2 + 2.6;
      if ((i + k) % 2 === 0) {
        const mesh = new THREE.Mesh(coneGeo, coneMat);
        mesh.position.set(side, 0.36, along);
        propGroup.add(mesh);
        const prop = { mesh, hp: 16, maxHp: 16, kind: 'cone', dead: false };
        const box = boxOf(side, along, 0.38, 0.38, 1.1);
        box.prop = prop;
        prop.box = box;
        colliders.push(box);
        props.push(prop);
      } else {
        const mesh = new THREE.Mesh(binGeo, binMat);
        mesh.position.set(side, 0.48, along);
        propGroup.add(mesh);
        const prop = { mesh, hp: 34, maxHp: 34, kind: 'bin', dead: false };
        const box = boxOf(side, along, 0.5, 0.5, 1.2);
        box.prop = prop;
        prop.box = box;
        colliders.push(box);
        props.push(prop);
      }
    }
  }
  group.add(propGroup);

  // Outer walls so the map has an edge. The strip end is open on purpose? No — close it past the finish.
  colliders.push(boxOf(0, -extent - 28, extent + 80, 3));
  colliders.push(boxOf(0, extent + 28, extent + 80, 3));
  colliders.push(boxOf(-extent - 28, 0, 3, extent + 30));
  colliders.push(boxOf(stripX + 18, stripZ0 + stripLen / 2, 3, stripLen / 2 + 20));
  colliders.push(boxOf(stripX, stripZ0 + stripLen + 4, 14, 3));

  const hash = new Map();
  const CELL = 24;
  for (const b of colliders) {
    const x0 = Math.floor(b.minX / CELL), x1 = Math.floor(b.maxX / CELL);
    const z0 = Math.floor(b.minZ / CELL), z1 = Math.floor(b.maxZ / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const k = x + ',' + z;
      let arr = hash.get(k);
      if (!arr) { arr = []; hash.set(k, arr); }
      arr.push(b);
    }
  }

  const garage = pois.find((p) => p.id === 'garage');
  const garageDef = POIS.find((p) => p.id === 'garage');
  // Spawn on the avenue in front of the garage, facing along the road.
  // Heading 0 points +Z, straight into the garage building.
  const spawn = { x: garage.x, z: garageDef.iz * pitch, h: Math.PI / 2 };
  const hospitalPoi = pois.find((p) => p.id === 'hospital');
  const hospitalDef = POIS.find((p) => p.id === 'hospital');
  const hospital = hospitalPoi
    ? { x: hospitalPoi.x, z: hospitalDef.iz * pitch, h: Math.PI / 2 }
    : spawn;

  // One signal per intersection except the fountain roundabout.
  const signals = [];
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.5, metalness: 0.5 });
  const signalGroup = new THREE.Group();
  for (let i = -half; i <= half; i++) {
    for (let j = -half; j <= half; j++) {
      if (i === 0 && j === 0) continue;
      const x = i * pitch + roadW / 2 + 1.1;
      const z = j * pitch + roadW / 2 + 1.1;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5.2, 6), poleMat);
      pole.position.set(x, 2.6, z);
      const ns = new THREE.MeshStandardMaterial({ color: 0x3dff6a, emissive: 0x3dff6a, emissiveIntensity: 0.4 });
      const ew = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 0.4 });
      const bulbN = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), ns);
      const bulbE = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), ew);
      bulbN.position.set(x, 5.1, z - 0.2);
      bulbE.position.set(x + 0.2, 4.7, z);
      signalGroup.add(pole, bulbN, bulbE);
      signals.push({ x: i * pitch, z: j * pitch, ns, ew });
    }
  }
  group.add(signalGroup);

  // Street-challenge anchors. All of these sit on road centerlines.
  const streets = [
    {
      id: 'harbor', name: 'Harbor Dash', league: 1,
      x: -2 * pitch, z: -half * pitch, h: 0,
      cps: [[-2 * pitch, -pitch], [-2 * pitch, pitch], [0, pitch], [0, -pitch]]
    },
    {
      id: 'grid', name: 'Gridiron', league: 2,
      x: pitch, z: -2 * pitch, h: Math.PI / 2,
      cps: [[2 * pitch, -2 * pitch], [2 * pitch, 0], [0, 0], [-pitch, 0], [-pitch, 2 * pitch]]
    },
    {
      id: 'neonrun', name: 'Neon Run', league: 3,
      x: -pitch, z: 2 * pitch, h: 0,
      cps: [[-pitch, pitch], [pitch, pitch], [pitch, -pitch], [-2 * pitch, -pitch], [-2 * pitch, 2 * pitch]]
    },
    {
      id: 'outer', name: 'Outer Belt', league: 4,
      x: half * pitch, z: 0, h: Math.PI,
      cps: [[half * pitch, half * pitch], [-half * pitch, half * pitch], [-half * pitch, -half * pitch], [half * pitch, -half * pitch]]
    }
  ];

  function query(x, z, rad) {
    const out = [];
    const x0 = Math.floor((x - rad) / CELL), x1 = Math.floor((x + rad) / CELL);
    const z0 = Math.floor((z - rad) / CELL), z1 = Math.floor((z + rad) / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const arr = hash.get(ix + ',' + iz);
      if (arr) for (const b of arr) out.push(b);
    }
    return out;
  }

  function isRoad(x, z) {
    const halfR = roadW * 0.5 + 0.3;
    for (let i = -half; i <= half; i++) {
      if (Math.abs(z - i * pitch) <= halfR && Math.abs(x) <= extent + 46) return true;
      if (Math.abs(x - i * pitch) <= halfR && Math.abs(z) <= extent + 8) return true;
    }
    if (Math.abs(x - stripX) <= 9 && z >= stripZ0 - 2 && z <= stripZ0 + stripLen) return true;
    if (z > connZ - halfR && z < connZ + halfR && x >= extent - roadW && x <= stripX + 9) return true;
    for (const lot of pois) {
      if (Math.abs(x - lot.x) <= lot.hx + 0.4 && Math.abs(z - lot.z) <= lot.hz + 0.4) return true;
    }
    return false;
  }

  function nearestRoad(x, z) {
    let best = Infinity, bx = x, bz = z, bh = 0;
    for (let i = -half; i <= half; i++) {
      const dz = Math.abs(z - i * pitch);
      if (dz < best) { best = dz; bx = clamp(x, -extent, extent); bz = i * pitch; bh = Math.PI / 2; }
      const dx = Math.abs(x - i * pitch);
      if (dx < best) { best = dx; bx = i * pitch; bz = clamp(z, -extent, extent); bh = 0; }
    }
    return { x: bx, z: bz, h: bh };
  }

  return {
    group, roadMat, building, headMat, signs, pois, lamps, streets, spawn, hospital, water, jet, word,
    landmarks, districtInfo,
    signals, signalT: 0,
    strip: { x: stripX, z0: stripZ0, z1: stripZ0 + stripLen, laneL: stripX - 2.3, laneR: stripX + 2.3 },
    query, isRoad, nearestRoad, props,
    strikeProp(prop, impact) {
      if (!prop || prop.dead) return null;
      prop.hp -= Math.max(3, impact * 2.8);
      if (prop.hp > 0) return { destroyed: false, kind: prop.kind, hp: prop.hp };
      prop.dead = true;
      prop.hp = 0;
      if (prop.box) prop.box.dead = true;
      if (prop.mesh) prop.mesh.visible = false;
      return { destroyed: true, kind: prop.kind };
    },
    setBuildingShadows(on) { building.castShadow = !!on; },
    update(dt, night) {
      this.signalT += dt;
      const phase = signalPhase(this.signalT);
      for (const s of signals) {
        paintBulb(s.ns, phase.ns);
        paintBulb(s.ew, phase.ew);
      }
      water.position.y = 0.62 + Math.sin(performance.now() / 600) * 0.05;
      jet.scale.y = 0.85 + Math.sin(performance.now() / 220) * 0.12;
      const glow = 0.25 + night * 1.7;
      bmat.emissiveIntensity = 0.15 + night * 1.55;
      headMat.emissiveIntensity = 0.15 + night * 2.4;
      for (const s of signs) {
        const m = s.material;
        m.emissiveIntensity = 0.4 + night * 2.3 + Math.sin(performance.now() / 400 + s.idN) * 0.15;
      }
      for (const p of pois) if (p.light) p.light.intensity = night * 10;
      return glow;
    }
  };
}

function boxOf(x, z, hx, hz, top) {
  return { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, top: top == null ? 48 : top };
}

function plane(x, z, w, d, y) {
  // x,z is the minimum corner. Returns non-indexed triangles.
  const y0 = y;
  return new Float32Array([
    x, y0, z, x + w, y0, z, x + w, y0, z + d,
    x, y0, z, x + w, y0, z + d, x, y0, z + d
  ]);
}

function dashLine(a, b, fixed, horizontal) {
  const chunks = [];
  const span = b - a;
  const step = 8;
  for (let t = 0; t < span; t += step) {
    if (Math.floor(t / 4) % 2 === 0) continue;
    const len = Math.min(4, span - t);
    if (horizontal) chunks.push(plane(a + t, fixed - 0.12, len, 0.24, 0.04));
    else chunks.push(plane(fixed - 0.12, a + t, 0.24, len, 0.04));
  }
  return mergeRaw(chunks);
}

function mergeRaw(list) {
  let n = 0;
  for (const a of list) n += a.length;
  const out = new Float32Array(n);
  let o = 0;
  for (const a of list) { out.set(a, o); o += a.length; }
  return out;
}

function mergePlanes(list) {
  // list items are Float32Array position blobs OR already merged
  const raw = mergeRaw(list.map((item) => item instanceof Float32Array ? item : item));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(raw, 3));
  g.computeVertexNormals();
  // UVs from world XZ so the asphalt tiles instead of stretching over the whole city.
  const uv = new Float32Array((raw.length / 3) * 2);
  for (let i = 0; i < raw.length; i += 3) {
    uv[(i / 3) * 2] = raw[i] * 0.08;
    uv[(i / 3) * 2 + 1] = raw[i + 2] * 0.08;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function signMesh(text, color, w, h) {
  const map = makeSignTexture(text, color);
  const mat = new THREE.MeshStandardMaterial({
    map, emissiveMap: map, emissive: new THREE.Color(color), emissiveIntensity: 1.4,
    roughness: 0.35, metalness: 0.1, transparent: true, side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.idN = text.length;
  return mesh;
}

/** Push a circle out of city AABBs. Returns the resolved pose and the hardest hit (m/s). */
export function resolveCity(city, x, z, vx, vz, radius) {
  let impact = 0;
  const props = [];
  const seenProp = new Set();
  for (let iter = 0; iter < 3; iter++) {
    const boxes = city.query(x, z, radius);
    const seenBox = new Set();
    for (const b of boxes) {
      if (b.dead || seenBox.has(b)) continue;
      seenBox.add(b);
      const cx = clamp(x, b.minX, b.maxX);
      const cz = clamp(z, b.minZ, b.maxZ);
      let dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      let nx, nz, pen;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        nx = dx / d; nz = dz / d; pen = radius - d;
        x += nx * pen; z += nz * pen;
      } else {
        const left = x - b.minX, right = b.maxX - x, down = z - b.minZ, up = b.maxZ - z;
        if (Math.min(left, right) < Math.min(down, up)) {
          if (left < right) { nx = -1; x = b.minX - radius; } else { nx = 1; x = b.maxX + radius; }
          nz = 0;
        } else {
          nx = 0;
          if (down < up) { nz = -1; z = b.minZ - radius; } else { nz = 1; z = b.maxZ + radius; }
        }
      }
      const vn = vx * nx + vz * nz;
      if (vn < 0) {
        vx -= nx * vn;
        vz -= nz * vn;
        impact = Math.max(impact, -vn);
      }
      if (b.prop && !seenProp.has(b.prop)) {
        seenProp.add(b.prop);
        props.push(b.prop);
      }
    }
  }
  return { x, z, vx, vz, impact, props };
}

/** Which axis has the green. Cycle is 10s: NS green, yellow, EW green, yellow. */
export function signalPhase(t) {
  const u = ((t % 10) + 10) % 10;
  if (u < 4) return { ns: 'green', ew: 'red' };
  if (u < 5.2) return { ns: 'yellow', ew: 'red' };
  if (u < 9.2) return { ns: 'red', ew: 'green' };
  return { ns: 'red', ew: 'yellow' };
}

/** Heading 0 faces +Z (north-south streets). East-west avenues are ±half pi. */
export function signalAxis(h) {
  return Math.abs(Math.sin(h)) > Math.abs(Math.cos(h)) ? 'ew' : 'ns';
}

export function lightIsRed(t, h) {
  return signalPhase(t)[signalAxis(h)] === 'red';
}

export function intersectionAt(x, z) {
  const { pitch, half } = CITY;
  const i = Math.round(x / pitch);
  const j = Math.round(z / pitch);
  if (i < -half || i > half || j < -half || j > half) return null;
  if (i === 0 && j === 0) return null;
  if (Math.hypot(x - i * pitch, z - j * pitch) > 8) return null;
  return { i, j, x: i * pitch, z: j * pitch, key: i + ':' + j };
}

export function lotAt(city, x, z) {
  if (!city || !city.pois) return null;
  for (const p of city.pois) {
    if (Math.abs(x - p.x) <= p.hx && Math.abs(z - p.z) <= p.hz) return p;
  }
  return null;
}

function paintBulb(mat, state) {
  const col = state === 'green' ? 0x3dff6a : state === 'yellow' ? 0xffc83a : 0xff2a2a;
  mat.color.setHex(col);
  mat.emissive.setHex(col);
  mat.emissiveIntensity = state === 'red' ? 0.25 : 2.6;
}

export function nearestPoi(city, x, z, maxDist) {
  let best = null, bd = maxDist;
  for (const p of city.pois) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

export function nearestLandmark(city, x, z, maxDist) {
  if (!city || !city.landmarks) return null;
  let best = null, bd = maxDist;
  for (const m of city.landmarks) {
    const d = Math.hypot(m.x - x, m.z - z);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}
