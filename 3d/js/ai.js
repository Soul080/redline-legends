/* ai.js — circuit AI. Looks ahead in meters, brakes for curvature, and gets
   genuinely quicker as the league climbs: later braking, higher corner speed,
   less rubber-banding. League 1 still eases off when it gaps the player so a
   first race is finishable; League 4 does not. Boss gimmicks match the 2D
   roster (blocker, magnet, nitro, phantom). */

import { RL } from './data.js';
import { clamp, angNorm, rand } from './util.js';
import { sampleAhead } from './track.js';

export function aiInput(car, track, dt, player, leagueId, weatherGrip, raceT) {
  const pers = RL.PERSONALITIES[car.ai.pers] || RL.PERSONALITIES.clean;
  const skill = car.skill || 0.85;
  const look = 12 + car.speed * 0.42 + skill * 6;
  const tp = sampleAhead(track, car, look);
  let curv = 0;
  for (let k = 1; k <= 5; k++) {
    const a = sampleAhead(track, car, k * 10);
    if (Math.abs(a.curv || 0) > Math.abs(curv)) curv = a.curv || 0;
  }
  car.ai.laneT = (car.ai.laneT || 0) - dt;
  if (car.ai.laneT <= 0) {
    car.ai.laneT = rand(1.4, 3.4);
    car.ai.lane = (Math.random() * 2 - 1) * pers.lane * (1.1 - skill * 0.3);
  }
  const sign = Math.sign(curv);
  let off = car.ai.lane * track.halfW * 0.8;
  off += -sign * Math.min(1, Math.abs(curv) * 7) * track.halfW * 0.32;

  car.speedMult = 1;
  const gap = (player ? player.progress : 0) - car.progress;
  if (player && (car.boss === 'blocker' || car.boss === 'phantom') && gap < 0 && gap > -36) {
    off = clamp(player.lat, -track.halfW * 0.72, track.halfW * 0.72);
  }
  if (player && (car.boss === 'magnet' || car.boss === 'phantom')) {
    const d = Math.hypot(player.x - car.x, player.z - car.z);
    if (d < 26) car.speedMult = car.boss === 'phantom' ? 1.08 : 1.12;
  }
  if (car.boss === 'nitro') {
    car.bossT = (car.bossT || 0) + dt;
    if (car.bossT > 5.5) { car.bossT = 0; car.nitro = 100; }
  }
  if (player && pers.bump && Math.abs(gap) < 10) {
    const d = Math.hypot(player.x - car.x, player.z - car.z);
    if (d < 7) off = player.lat;
  }
  off = clamp(off, -track.halfW * 0.88, track.halfW * 0.88);

  const tx = tp.x + tp.nx * off;
  const tz = tp.z + tp.nz * off;
  const steerAng = angNorm(Math.atan2(tx - car.x, tz - car.z) - car.h);
  // Higher leagues trust the tires and brake later.
  const brakeBias = 1.25 - skill * 0.45;
  const corner = clamp(1 - Math.abs(curv) * brakeBias / (0.45 + weatherGrip * 0.55), 0.36, 1);
  let target = car.p.maxSpeed * car.speedMult * corner;
  const gapM = gap * 4;
  if (!car.ghost) {
    if (gapM > 90) target *= 1 + Math.min(0.07, gapM / 3500);
    else if (gapM < -70 && leagueId <= 2) target *= leagueId === 1 ? 0.9 : 0.95;
  }
  car.nitro = Math.min(100, car.nitro + (6 + skill * 4) * dt);
  const straight = Math.abs(curv) < 0.025;
  const wantNitro = straight && car.speed > 16 && car.nitro > 100 - pers.nitroUse * 75 && raceT > 1;
  if (car.speed < 2.5 && raceT > 2) car.stuckT += dt;
  else car.stuckT = 0;
  if (car.stuckT > 2.4) {
    const p = track.pts[car.idx];
    car.x = p.x + p.nx * off * 0.3;
    car.z = p.z + p.nz * off * 0.3;
    car.h = Math.atan2(p.tx, p.tz);
    car.vx = car.vz = 0;
    car.stuckT = 0;
  }
  return {
    throttle: car.speed < target,
    brake: car.speed > target + 3.5,
    steer: clamp(steerAng * (2.2 + skill), -1, 1),
    drift: false,
    nitro: !!(wantNitro || (car.nitroOn && car.nitro > 6 && Math.abs(curv) < 0.05))
  };
}

/** Point-to-point rival used by street challenges and the police. */
export function seekInput(car, tx, tz, speedCap) {
  const ang = angNorm(Math.atan2(tx - car.x, tz - car.z) - car.h);
  const dist = Math.hypot(tx - car.x, tz - car.z);
  const target = Math.min(speedCap, car.p.maxSpeed * (car.speedMult || 1));
  return {
    throttle: car.speed < target && Math.abs(ang) < 1.2,
    brake: Math.abs(ang) > 0.9 || car.speed > target + 2,
    steer: clamp(ang * 2.2, -1, 1),
    drift: Math.abs(ang) > 0.55 && car.speed > 14,
    nitro: dist > 25 && Math.abs(ang) < 0.3 && car.nitro > 20
  };
}
