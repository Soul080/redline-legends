/* drive.js — arcade vehicle step shared by the city, circuit races and the
   AI. Units are meters and seconds. Heading 0 faces +Z.
   Collision response is left to the caller (track walls or city AABBs) so the
   same integrator can drive every mode. */

import { clamp, angNorm, forwardXZ, rightXZ } from './util.js';

/** Map a 0–100 car sheet into meters/second and radians/second. */
export function physFromStats(st) {
  return {
    maxSpeed: 22 + st.topSpeed * 0.52,
    accel: 6.2 + st.accel * 0.085,
    turn: 1.35 + st.handling * 0.014,
    grip: 2.2 + st.grip * 0.05,
    nitroPower: 1.18 + st.nitro * 0.003,
    dmgMult: Math.max(0.35, 1.5 - st.durability * 0.009)
  };
}

export const AI_MODS = {
  steerResp: 10, driftGrip: 2.1, driftCharge: 12, crashKeep: 0.62,
  dmgTake: 0.55, nitroBurn: 18, draft: 1.1, startWindow: 0.18
};

export function driverMods(state, hasPerk) {
  const st = state.stats;
  return {
    steerResp: 6.5 + st.reflexes * 0.5 * (hasPerk('quick_hands') ? 1.12 : 1),
    startWindow: 0.18 + st.reflexes * 0.016,
    driftGrip: 1.05 + st.control * 0.055,
    driftCharge: (12 + st.control * 1.1) * (hasPerk('drift_king') ? 1.3 : 1),
    crashKeep: 0.4 + st.nerve * 0.02,
    dmgTake: (1 - st.nerve * 0.02) * (hasPerk('thick_skin') ? 0.7 : 1),
    nitroBurn: 20 * (1 - st.tactics * 0.018) * (hasPerk('nitro_saver') ? 0.8 : 1),
    draft: (1 + st.tactics * 0.03) * (hasPerk('draft_master') ? 1.6 : 1)
  };
}

export function blankVehicle(extra) {
  return Object.assign({
    x: 0, z: 0, h: 0, vx: 0, vz: 0, steer: 0,
    nitro: 35, nitroOn: false, drifting: false, driftCur: 0, driftT: 0, boostT: 0,
    damage: 0, speed: 0, offroad: false, drafting: false, speedMult: 1,
    vf: 0, vl: 0, lat: 0, idx: 0,
    lapsDone: -1, nextCp: 0, finished: false, finishTime: 0,
    lapStart: 0, bestLap: 0, eliminated: false, progress: 0,
    stuckT: 0, ghost: false, isPlayer: false
  }, extra);
}

/**
 * Integrate one step. `inp` is {throttle, brake, steer, drift, nitro}.
 * `ctx` carries weatherGrip, mods, hasPerk(id), comeback, noNitro, onDriftEnd, stats.
 */
export function stepVehicle(car, inp, dt, ctx) {
  const M = ctx.mods || AI_MODS;
  const P = car.p;
  const has = ctx.hasPerk || (() => false);
  const f = forwardXZ(car.h);
  const r = rightXZ(car.h);
  let vf = car.vx * f.x + car.vz * f.z;
  let vl = car.vx * r.x + car.vz * r.z;

  let maxS = P.maxSpeed * (1 - car.damage * 0.0025) * (car.speedMult || 1);
  let acc = P.accel;
  if (car.isPlayer) {
    if (has('gear_master')) maxS *= 1.04;
    if (has('reflex_god')) acc *= 1.06;
    if (has('comeback_king') && ctx.comeback) maxS *= 1.07;
  }
  if (car.drafting) maxS *= 1 + 0.06 * M.draft;
  if (car.offroad) {
    const k = car.isPlayer && has('smooth_operator') ? 0.8 : 0.62;
    maxS *= k;
    vf -= vf * 1.1 * dt * (1 - k);
  }
  if (car.boostT > 0) {
    car.boostT -= dt;
    maxS *= 1.14;
    acc *= 1.75;
  }
  const wantN = !!(inp.nitro && car.nitro > 1 && !ctx.noNitro);
  car.nitroOn = wantN;
  if (car.nitroOn) {
    maxS *= 1 + (P.nitroPower - 1) * 0.95;
    acc *= 1.65;
    car.nitro -= M.nitroBurn * dt;
    if (car.isPlayer && ctx.stats) ctx.stats.nitroTime += dt;
  }
  if (inp.throttle && vf < maxS) {
    vf = Math.min(maxS, vf + acc * dt * (1.2 - Math.max(0, vf) / Math.max(1, maxS)));
  }
  if (vf > maxS) vf -= (vf - maxS) * 2.4 * dt;
  if (inp.brake) {
    const bp = 16 * (car.isPlayer && has('late_braker') ? 1.35 : 1);
    if (vf > 1.5) vf -= bp * dt;
    else vf = Math.max(-11, vf - 9 * dt);
  } else if (!inp.throttle) {
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), 7 * dt);
  }
  vf -= vf * 0.18 * dt;

  car.steer += ((inp.steer || 0) - car.steer) * Math.min(1, M.steerResp * dt);
  const av = Math.abs(vf);
  const speedF = clamp(av / 5, 0.42, 1) * (1 - clamp((av - 42) / 55, 0, 0.38));
  car.h = angNorm(car.h + car.steer * P.turn * speedF * (vf < -0.8 ? -0.7 : 1) * (car.drifting ? 1.32 : 1) * dt);

  let wg = ctx.weatherGrip == null ? 1 : ctx.weatherGrip;
  if (car.isPlayer && has('grip_lord')) wg = 1 - (1 - wg) / 2;
  let g = P.grip * wg;
  if (inp.drift && av > 7) {
    g = M.driftGrip * (0.55 + wg * 0.45);
    vf -= 3.2 * dt * Math.sign(vf || 1);
  }
  vl -= vl * Math.min(1, g * dt);

  const wasDrift = car.drifting;
  car.drifting = Math.abs(vl) > 4.2 && av > 9;
  if (car.drifting) {
    car.driftT += dt;
    car.nitro = Math.min(100, car.nitro + M.driftCharge * dt);
    const pts = Math.abs(vl) * dt * 22 * (car.isPlayer && has('zen_drift') ? 1.5 : 1);
    car.driftCur += pts;
  } else if (wasDrift) {
    if (car.isPlayer && ctx.onDriftEnd) ctx.onDriftEnd(car);
    car.driftCur = 0;
    car.driftT = 0;
  }

  const f2 = forwardXZ(car.h);
  const r2 = rightXZ(car.h);
  car.vx = f2.x * vf + r2.x * vl;
  car.vz = f2.z * vf + r2.z * vl;
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  car.speed = Math.hypot(car.vx, car.vz);
  car.vf = vf;
  car.vl = vl;
  if (car.nitro < 0) car.nitro = 0;
}
