/* pursuit.js — police chase tuning, meters and seconds.
   A stock coupe is about 44 m/s, 9.8 m/s^2, and 2.0 rad/s.
   One star sits well under that. Five stars come close on top speed
   and still turn and react a step behind a sharp juke. */

export const COUNT = [0, 1, 2, 3, 5, 7];

const PROFILES = [null,
  { top: 30, accel: 5.2, turn: 0.95, react: 0.48, grip: 1.8, predict: 0.2 },
  { top: 34, accel: 6.4, turn: 1.15, react: 0.36, grip: 2.3, predict: 0.32 },
  { top: 38, accel: 7.6, turn: 1.4, react: 0.26, grip: 2.9, predict: 0.45 },
  { top: 42, accel: 8.8, turn: 1.65, react: 0.18, grip: 3.6, predict: 0.58 },
  { top: 43, accel: 10.0, turn: 1.88, react: 0.12, grip: 4.4, predict: 0.7 }
];

export const COUPE = {
  max: 22 + 42 * 0.52,
  accel: 6.2 + 42 * 0.085,
  turn: 1.35 + 48 * 0.014
};

export function countFor(stars) {
  const n = Math.max(0, stars | 0);
  if (n <= 0) return 0;
  if (n <= 5) return COUNT[n];
  return Math.min(8, COUNT[5] + (n >= 9 ? 1 : 0));
}

export function profile(stars) {
  const n = Math.max(1, stars | 0);
  if (n <= 5) return PROFILES[n];
  return PROFILES[5];
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Heading 0 faces +Z. Velocity lags the nose so a juke is not instant. */
export function stepCop(cop, target, dt, stars) {
  const P = profile(stars);
  const tx = target.x + (target.vx || 0) * P.predict;
  const tz = target.z + (target.vz || 0) * P.predict;
  if (cop.aimX == null) { cop.aimX = tx; cop.aimZ = tz; }
  const lag = 1 - Math.exp(-dt / Math.max(0.05, P.react));
  cop.aimX += (tx - cop.aimX) * lag;
  cop.aimZ += (tz - cop.aimZ) * lag;
  const want = Math.atan2(cop.aimX - cop.x, cop.aimZ - cop.z);
  const maxTurn = P.turn * dt;
  let dh = angDiff(want, cop.h || 0);
  if (dh > maxTurn) dh = maxTurn;
  else if (dh < -maxTurn) dh = -maxTurn;
  cop.h = (cop.h || 0) + dh;
  const turnFrac = Math.min(1, Math.abs(dh) / Math.max(1e-4, maxTurn));
  const cap = P.top * (1 - 0.5 * turnFrac);
  const spd = cop.speed || 0;
  if (spd < cap) cop.speed = Math.min(cap, spd + P.accel * dt);
  else cop.speed = Math.max(cap, spd - P.accel * 1.25 * dt);
  const vx = Math.sin(cop.h) * cop.speed;
  const vz = Math.cos(cop.h) * cop.speed;
  if (cop.vx == null) cop.vx = vx;
  if (cop.vz == null) cop.vz = vz;
  const k = 1 - Math.exp(-P.grip * dt);
  cop.vx += (vx - cop.vx) * k;
  cop.vz += (vz - cop.vz) * k;
  cop.x += cop.vx * dt;
  cop.z += cop.vz * dt;
  cop.speed = Math.hypot(cop.vx, cop.vz);
  return cop;
}

export function bustSeconds(stars) {
  const n = Math.max(1, Math.min(5, stars | 0));
  return 2.9 - (n - 1) * 0.34;
}

export function ramDamage(stars) {
  const n = Math.max(1, Math.min(5, stars | 0));
  return 1 + Math.round(n * 0.6);
}
