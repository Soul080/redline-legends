/* pursuit.js — police chase tuning for the top-down city.
   Low stars are slower, lazier, and slower to turn than a decent player car.
   High stars get close, but a hard juke still opens a gap because aim is
   delayed and velocity does not snap to the new heading. */
RL.Pursuit = (function () {
  const COUNT = [0, 1, 2, 3, 5, 7];
  /* Units match drive.js: coupe top is about 257, accel about 283, turn about 2.73. */
  const PROFILES = [null,
    { top: 178, accel: 64, turn: 1.02, react: 0.5, grip: 1.65, predict: 0.16 },
    { top: 198, accel: 82, turn: 1.22, react: 0.38, grip: 2.05, predict: 0.26 },
    { top: 218, accel: 108, turn: 1.5, react: 0.28, grip: 2.6, predict: 0.4 },
    { top: 236, accel: 150, turn: 1.85, react: 0.18, grip: 3.4, predict: 0.55 },
    { top: 252, accel: 205, turn: 2.2, react: 0.11, grip: 4.5, predict: 0.7 }
  ];
  const COUPE = { max: 200 + 42 * 1.35, accel: 220 + 42 * 1.5, turn: 2.15 + 48 * 0.012 };

  function countFor(stars) {
    const n = Math.max(0, Math.min(5, stars | 0));
    return COUNT[n];
  }
  function profile(stars) {
    const n = Math.max(1, Math.min(5, stars | 0));
    return PROFILES[n];
  }
  function angDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function stepCop(cop, target, dt, stars) {
    const P = profile(stars);
    const tx = target.x + (target.vx || 0) * P.predict;
    const ty = target.y + (target.vy || 0) * P.predict;
    if (cop.aimX == null) { cop.aimX = tx; cop.aimY = ty; }
    const lag = 1 - Math.exp(-dt / Math.max(0.05, P.react));
    cop.aimX += (tx - cop.aimX) * lag;
    cop.aimY += (ty - cop.aimY) * lag;
    const want = Math.atan2(cop.aimY - cop.y, cop.aimX - cop.x);
    const maxTurn = P.turn * dt;
    let dh = angDiff(want, cop.h || 0);
    if (dh > maxTurn) dh = maxTurn;
    else if (dh < -maxTurn) dh = -maxTurn;
    cop.h = (cop.h || 0) + dh;
    const turnFrac = Math.min(1, Math.abs(dh) / Math.max(1e-4, maxTurn));
    const cap = P.top * (1 - 0.55 * turnFrac);
    const spd = cop.speed || 0;
    if (spd < cap) cop.speed = Math.min(cap, spd + P.accel * dt);
    else cop.speed = Math.max(cap, spd - P.accel * 1.3 * dt);
    const vx = Math.cos(cop.h) * cop.speed;
    const vy = Math.sin(cop.h) * cop.speed;
    if (cop.vx == null) cop.vx = vx;
    if (cop.vy == null) cop.vy = vy;
    const k = 1 - Math.exp(-P.grip * dt);
    cop.vx += (vx - cop.vx) * k;
    cop.vy += (vy - cop.vy) * k;
    cop.x += cop.vx * dt;
    cop.y += cop.vy * dt;
    cop.speed = Math.hypot(cop.vx, cop.vy);
    return cop;
  }
  function bustSeconds(stars) {
    const n = Math.max(1, Math.min(5, stars | 0));
    return 2.75 - (n - 1) * 0.32;
  }
  function ramDamage(stars) {
    const n = Math.max(1, Math.min(5, stars | 0));
    return 1 + n;
  }
  return { COUNT, COUPE, countFor, profile, stepCop, bustSeconds, ramDamage, angDiff };
})();
