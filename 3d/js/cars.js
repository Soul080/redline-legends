/* cars.js — procedural low-poly cars.
   Every mesh in here is original geometry for this project (no third-party
   model, so no extra asset license). Silhouettes are class-specific: a long
   hood for the muscle car, a tall roof for the kei, a wing for drift / hyper.
   Paint is MeshPhysicalMaterial with a clearcoat lobe so the env map reads
   as real car paint. Wheel, glass and trim materials are shared. */

import * as THREE from 'three';
import { hexToInt } from './util.js';
import { makeDecalTexture } from './textures.js';

const SPECS = {
  Hatchback: { L: 3.7, W: 1.7, ride: 0.32, bodyH: 0.98, roof: 1.5, cabinRear: -0.85, cabinFront: 0.55, wing: 0 },
  Kei: { L: 3.2, W: 1.5, ride: 0.3, bodyH: 1.08, roof: 1.64, cabinRear: -0.72, cabinFront: 0.72, wing: 0 },
  Coupe: { L: 4.3, W: 1.84, ride: 0.28, bodyH: 0.84, roof: 1.24, cabinRear: -0.4, cabinFront: 0.55, wing: 0.04 },
  Muscle: { L: 4.9, W: 1.92, ride: 0.3, bodyH: 0.88, roof: 1.26, cabinRear: -1.2, cabinFront: -0.15, wing: 0, scoop: true },
  Drift: { L: 4.35, W: 2.02, ride: 0.24, bodyH: 0.8, roof: 1.18, cabinRear: -0.55, cabinFront: 0.42, wing: 0.4 },
  Rally: { L: 4.2, W: 1.88, ride: 0.42, bodyH: 0.96, roof: 1.52, cabinRear: -0.7, cabinFront: 0.62, wing: 0.14, bar: true },
  Sports: { L: 4.45, W: 1.92, ride: 0.26, bodyH: 0.8, roof: 1.18, cabinRear: -0.48, cabinFront: 0.5, wing: 0.12 },
  GT: { L: 4.65, W: 1.98, ride: 0.24, bodyH: 0.76, roof: 1.14, cabinRear: -0.52, cabinFront: 0.55, wing: 0.22 },
  Super: { L: 4.75, W: 2.05, ride: 0.22, bodyH: 0.72, roof: 1.06, cabinRear: -0.58, cabinFront: 0.32, wing: 0.28 },
  Hypercar: { L: 4.95, W: 2.14, ride: 0.2, bodyH: 0.66, roof: 0.98, cabinRear: -0.62, cabinFront: 0.22, wing: 0.34 }
};

const geoCache = new Map();
const matCache = new Map();

function shared(key, factory) {
  if (!matCache.has(key)) matCache.set(key, factory());
  return matCache.get(key);
}

function tireMat() {
  return shared('tire', () => new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7, metalness: 0.05 }));
}
function glassMat() {
  return shared('glass', () => new THREE.MeshPhysicalMaterial({
    color: 0x10161c, metalness: 0.85, roughness: 0.08, transparent: true,
    opacity: 0.78, envMapIntensity: 1.5
  }));
}
function trimMat() {
  return shared('trim', () => new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.45, metalness: 0.4 }));
}
function chromeMat() {
  return shared('chrome', () => new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.18, metalness: 0.95, envMapIntensity: 1.3 }));
}
function darkMetal() {
  return shared('darkmetal', () => new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.35, metalness: 0.8 }));
}

function bodyGeometry(spec) {
  const key = spec.L + ':' + spec.W + ':' + spec.roof + ':' + spec.cabinRear;
  if (geoCache.has(key)) return geoCache.get(key);
  const L = spec.L, H = spec.bodyH, roof = spec.roof, cr = spec.cabinRear, cf = spec.cabinFront, y0 = spec.ride;
  const r = -L / 2, f = L / 2;
  const shape = new THREE.Shape();
  shape.moveTo(r + 0.06, y0);
  shape.lineTo(r + 0.06, y0 + 0.28);
  shape.lineTo(r + 0.32, H * 0.62);
  shape.lineTo(cr - 0.05, H * 0.78);
  shape.lineTo(cr + 0.05, roof);
  shape.lineTo(cf, roof);
  shape.lineTo(cf + 0.42, H * 0.7);
  shape.lineTo(f - 0.45, H * 0.5);
  shape.lineTo(f - 0.06, y0 + 0.26);
  shape.lineTo(f - 0.02, y0 + 0.02);
  shape.lineTo(r + 0.06, y0);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: spec.W, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.04,
    bevelSegments: 1, steps: 1, curveSegments: 1
  });
  geo.translate(0, 0, -spec.W / 2);
  // Shape +X (nose) becomes +Z.
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  geoCache.set(key, geo);
  return geo;
}

function wheelGeo(radius) {
  const key = 'w' + radius;
  if (geoCache.has(key)) return geoCache.get(key);
  const g = new THREE.CylinderGeometry(radius, radius, 0.26, 14);
  g.rotateZ(Math.PI / 2);
  geoCache.set(key, g);
  return g;
}

function rimGeo(style, radius) {
  const key = 'rim' + style + ':' + radius;
  if (geoCache.has(key)) return geoCache.get(key);
  let g;
  if (style === 2) g = new THREE.CylinderGeometry(radius * 0.72, radius * 0.55, 0.28, 16);
  else if (style === 1) g = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, 0.22, 6);
  else g = new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, 0.2, 12);
  g.rotateZ(Math.PI / 2);
  geoCache.set(key, g);
  return g;
}

function paintMaterial(color, ghost) {
  const m = new THREE.MeshPhysicalMaterial({
    color: hexToInt(color),
    metalness: 0.62,
    roughness: 0.28,
    clearcoat: ghost ? 0.2 : 0.85,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.15
  });
  if (ghost) { m.transparent = true; m.opacity = 0.4; m.depthWrite = false; }
  return m;
}

function addWheel(group, spec, x, z, style, spinList, steerList) {
  const radius = spec.bar ? 0.38 : 0.33;
  const pivot = new THREE.Group();
  pivot.position.set(x, radius, z);
  const tire = new THREE.Mesh(wheelGeo(radius), tireMat());
  tire.castShadow = true;
  const rimMat = style === 2 ? darkMetal() : chromeMat();
  const rim = new THREE.Mesh(rimGeo(style, radius), rimMat);
  pivot.add(tire, rim);
  if (z > 0) steerList.push(pivot);
  spinList.push(tire);
  spinList.push(rim);
  group.add(pivot);
}

/**
 * Build a car Group. `style` is {color, rims, decal, underglow}.
 * `opt.lights` attaches headlights (player only). `opt.ghost` fades the body.
 * The group's origin is on the ground, nose toward +Z.
 */
export function buildCar(cls, style, opt) {
  const spec = SPECS[cls] || SPECS.Coupe;
  const o = opt || {};
  const styleIn = style || {};
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const color = styleIn.color || '#ffffff';
  const paint = paintMaterial(color, !!o.ghost);
  const body = new THREE.Mesh(bodyGeometry(spec), paint);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const glassH = Math.max(0.28, spec.roof - spec.bodyH * 0.72);
  const glassLen = Math.max(0.6, (spec.cabinFront - spec.cabinRear) * 0.86);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(spec.W * 0.78, glassH, glassLen), o.ghost ? paint : glassMat());
  glass.position.set(0, spec.bodyH * 0.72 + glassH * 0.48, (spec.cabinRear + spec.cabinFront) / 2);
  group.add(glass);

  // Dark cockpit so the glass reads as a window, not a gem.
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(spec.W * 0.7, glassH * 0.7, glassLen * 0.85),
    trimMat()
  );
  cabin.position.copy(glass.position);
  group.add(cabin);

  const spins = [];
  const steers = [];
  const rims = styleIn.rims | 0;
  const wx = spec.W * 0.5 + 0.02;
  const wz = spec.L * 0.31;
  addWheel(group, spec, -wx, wz, rims, spins, steers);
  addWheel(group, spec, wx, wz, rims, spins, steers);
  addWheel(group, spec, -wx, -wz, rims, spins, steers);
  addWheel(group, spec, wx, -wz, rims, spins, steers);

  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff4d2, emissive: 0xfff4d2, emissiveIntensity: 0.4, roughness: 0.3 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff1028, emissiveIntensity: 0.6, roughness: 0.35 });
  const hy = spec.bodyH * 0.42;
  const hz = spec.L / 2 - 0.05;
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.08), headMat);
    h.position.set(s * spec.W * 0.32, hy, hz);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.06), tailMat);
    t.position.set(s * spec.W * 0.32, hy, -spec.L / 2 + 0.04);
    group.add(t);
  }

  if (spec.wing > 0.05) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(spec.W * 0.96, 0.06, 0.28), paint);
    wing.position.set(0, spec.roof + spec.wing, -spec.L * 0.38);
    wing.castShadow = true;
    const strutL = new THREE.Mesh(new THREE.BoxGeometry(0.06, spec.wing, 0.08), trimMat());
    const strutR = strutL.clone();
    strutL.position.set(-spec.W * 0.3, spec.roof + spec.wing * 0.5, -spec.L * 0.38);
    strutR.position.set(spec.W * 0.3, spec.roof + spec.wing * 0.5, -spec.L * 0.38);
    group.add(wing, strutL, strutR);
  }
  if (spec.scoop) {
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.7), paint);
    scoop.position.set(0, spec.bodyH + 0.04, spec.L * 0.12);
    group.add(scoop);
  }
  if (spec.bar) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.12), trimMat());
    bar.position.set(0, spec.roof + 0.08, (spec.cabinRear + spec.cabinFront) / 2);
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.06, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xfff2c4, emissiveIntensity: 0.8 })
    );
    lamp.position.copy(bar.position);
    lamp.position.y += 0.06;
    group.add(bar, lamp);
  }

  // Bumpers and side skirts keep the silhouette from looking like a single blob.
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(spec.W + 0.08, 0.1, spec.L * 0.55), trimMat());
  skirt.position.set(0, spec.ride * 0.55, 0);
  group.add(skirt);

  const decal = makeDecal(styleIn.decal, spec);
  if (decal) group.add(decal);

  let siren = null;
  if (styleIn.siren) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(spec.W * 0.5, 0.08, 0.2),
      trimMat()
    );
    bar.position.set(0, spec.roof + 0.1, (spec.cabinRear + spec.cabinFront) / 2);
    const lamp = (hex, x) => {
      const mat = new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 2 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.16), mat);
      mesh.position.set(x, spec.roof + 0.2, bar.position.z);
      return { mesh, mat };
    };
    const left = lamp(0xff2244, -0.2);
    const right = lamp(0x2277ff, 0.2);
    group.add(bar, left.mesh, right.mesh);
    siren = [left.mat, right.mat];
  }

  const glowColor = o.glow || (styleIn.underglow ? color : null);
  let glow = null;
  if (glowColor) {
    glow = new THREE.Mesh(
      new THREE.CircleGeometry(spec.W * 0.55, 16),
      new THREE.MeshBasicMaterial({ color: hexToInt(glowColor), transparent: true, opacity: 0.45, depthWrite: false })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.04;
    group.add(glow);
  }

  const exhausts = [];
  for (const s of [-0.28, 0.28]) {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.7, 6),
      new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    flame.rotation.x = Math.PI / 2;
    flame.position.set(s, 0.32, -spec.L / 2 - 0.2);
    flame.visible = false;
    group.add(flame);
    exhausts.push(flame);
  }

  let spots = null;
  if (o.lights) {
    spots = [];
    for (const s of [-1, 1]) {
      const spot = new THREE.SpotLight(0xfff3d0, 0, 36, 0.55, 0.55, 1.4);
      spot.position.set(s * spec.W * 0.3, 0.7, spec.L / 2);
      const target = new THREE.Object3D();
      target.position.set(s * spec.W * 0.3, 0.2, spec.L / 2 + 14);
      group.add(spot, target);
      spot.target = target;
      spots.push(spot);
    }
  }

  group.userData = {
    spec, paint, headMat, tailMat, spins, steers, exhausts, spots, glow, siren, cls, style: Object.assign({}, styleIn)
  };
  return group;
}

function makeDecal(kind, spec) {
  if (!kind || kind === 'none') return null;
  const map = makeDecalTexture(kind);
  if (!map) return null;
  const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spec.W * 0.7, 1.05), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, spec.bodyH + 0.03, (spec.cabinFront + spec.L * 0.35) * 0.5);
  mesh.userData.decalMap = map;
  return mesh;
}

/** Live restyle without discarding the Group (scene parent stays). */
export function restyleCar(group, cls, style, opt) {
  const parent = group.parent;
  const next = buildCar(cls, style, opt);
  next.position.copy(group.position);
  next.rotation.copy(group.rotation);
  next.userData.spin = group.userData.spin || 0;
  if (parent) {
    parent.add(next);
    parent.remove(group);
  }
  disposeCar(group);
  return next;
}

export function disposeCar(group) {
  group.traverse((o) => {
    if (o.userData && o.userData.decalMap) o.userData.decalMap.dispose();
    if (o.material && o.material.userData && o.material.userData.unique) o.material.dispose();
  });
  const ud = group.userData;
  if (ud && ud.paint) ud.paint.dispose();
  if (ud && ud.headMat) ud.headMat.dispose();
  if (ud && ud.tailMat) ud.tailMat.dispose();
  if (ud && ud.siren) for (const m of ud.siren) m.dispose();
}

/** Per-frame wheel spin, steer, brake lights, nitro flames, headlight intensity. */
export function updateCarVisual(group, dt, state) {
  if (!group) return;
  const ud = group.userData;
  const speed = state.speed || 0;
  const radius = ud.spec.bar ? 0.38 : 0.33;
  ud.spin = (ud.spin || 0) + (speed / radius) * dt * (state.reverse ? -1 : 1);
  for (const m of ud.spins) m.rotation.x = ud.spin;
  const steerAngle = (state.steer || 0) * 0.38;
  for (const p of ud.steers) p.rotation.y = steerAngle;
  const night = state.night || 0;
  ud.headMat.emissiveIntensity = 0.25 + night * 3.2 + (state.nitro ? 0.4 : 0);
  ud.tailMat.emissiveIntensity = state.brake ? 3.2 : 0.45 + night * 0.6;
  const showFlame = !!state.nitro;
  for (const f of ud.exhausts) {
    f.visible = showFlame;
    if (showFlame) {
      const s = 0.7 + Math.random() * 0.6;
      f.scale.set(s, 0.8 + Math.random() * 0.9, s);
      f.material.color.set(Math.random() < 0.5 ? 0xff7a2a : 0x6ecbff);
      f.material.opacity = 0.85;
    }
  }
  if (ud.siren) {
    const flip = Math.sin(performance.now() / 80) > 0;
    ud.siren[0].emissiveIntensity = flip ? 7 : 0.15;
    ud.siren[1].emissiveIntensity = flip ? 0.15 : 7;
  }
  if (ud.spots) {
    const on = night > 0.25 ? 8 + night * 10 : 0;
    for (const s of ud.spots) s.intensity = on;
  }
  group.rotation.order = 'YXZ';
  group.rotation.y = state.h || 0;
  group.rotation.x = (state.accel || 0) * 0.04;
  group.rotation.z = -(state.steer || 0) * 0.06 - (state.latVel || 0) * 0.012 - (state.bank || 0) * 0.85;
  group.position.set(state.x, state.y || 0, state.z);
}

export function carClass(def) {
  return (def && def.cls) || 'Coupe';
}
