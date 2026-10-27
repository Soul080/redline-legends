/* heat.js — wanted thresholds and offense sizes.
   Stars are expensive on purpose: a bump or a clipped sign should not
   light the board. A star falls only after a long, unbroken hide.
   The standing bounty does not fall with it. crimePay is what a pedestrian
   or a wreck adds. A bust is the only reset. */
RL.Heat = (function () {
  const STAR_AT = [0, 48, 110, 190, 290, 420];
  /* Heat can keep climbing. The number is only a guard against a bad value. */
  const MAX = 1000000;
  /* Seconds of continuous hiding before the current star can fall.
     One star is already a long wait. Past five, each star waits longer. */
  const HIDE_SEC = [0, 90, 120, 150, 180, 240];
  const BOUNTY_CAP = 100000;
  const CRIME = { pedestrian: 75, ram: 50, wreck: 150 };
  /* Heat required to show this many stars. After five, the gaps keep growing. */
  function starThreshold(n) {
    const k = Math.max(0, n | 0);
    if (k <= 5) return STAR_AT[k] || 0;
    let h = STAR_AT[5];
    let gap = STAR_AT[5] - STAR_AT[4];
    for (let i = 6; i <= k; i++) {
      gap += 40;
      h += gap;
    }
    return h;
  }
  function starsOf(heat) {
    const h = Number(heat) || 0;
    if (h < STAR_AT[1]) return 0;
    let s = 0;
    for (let i = 1; i < 80; i++) {
      if (h >= starThreshold(i)) s = i;
      else break;
    }
    return s;
  }
  /* Base heat before role multipliers. 0 means the hit was too small to count. */
  function amount(type, info) {
    info = info || {};
    const sp = Number(info.speed) || 0;
    if (type === 'prop') {
      if (info.destroyed) return 5;
      if (sp > 200) return 2;
      return 0;
    }
    if (type === 'traffic') {
      if (info.destroyed) return 16;
      if (sp < 90) return 0;
      if (sp < 150) return 4;
      return 9;
    }
    if (type === 'cop') {
      if (sp < 80) return 0;
      return 8;
    }
    if (type === 'copkill') return 55;
    if (type === 'steal') return info.amount || 12;
    if (type === 'speeding') return info.major ? 6 : 2;
    if (type === 'redlight') return 14;
    if (type === 'street') return 22;
    if (type === 'heist') return 30;
    if (type === 'robbery') return info.amount || 56;
    if (type === 'smuggle') return 8;
    if (type === 'wreck') return info.amount || 10;
    if (type === 'ped') return 18;
    return 6;
  }
  function hideSeconds(stars) {
    const n = Math.max(0, stars | 0);
    if (n <= 5) return HIDE_SEC[n] || 0;
    return HIDE_SEC[5] + (n - 5) * 45;
  }
  function formatCooldown(sec) {
    const s = Math.max(0, Math.ceil(Number(sec) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function cooldownLeft(stars, hiddenFor) {
    if ((stars | 0) <= 0) return 0;
    return Math.max(0, hideSeconds(stars) - Math.max(0, Number(hiddenFor) || 0));
  }
  /* A shop till is loud. The added heat is at least enough to light the next star. */
  function raiseForRobbery(heat, add) {
    const h0 = Number(heat) || 0;
    const before = starsOf(h0);
    let next = h0 + (Number(add) || 0);
    next = Math.max(next, starThreshold(before + 1));
    if (next > MAX) next = MAX;
    if (next < 0) next = 0;
    return next;
  }
  /* While cops can see you, heat cannot fall through the current star, and
     surplus above that star cools very slowly. Hidden heat does not move
     until hiddenFor reaches hideSeconds(stars). That call drops one star. */
  function decay(heat, stars, dt, visible, cleanFor, hiddenFor) {
    const n = stars | 0;
    if (n <= 0) return Math.max(0, heat - 8 * dt);
    const floor = starThreshold(n);
    if (visible) {
      if ((cleanFor || 0) < 8) return heat;
      return Math.max(floor, heat - 0.15 * dt);
    }
    if ((Number(hiddenFor) || 0) < hideSeconds(n)) return heat;
    return Math.max(0, floor - 0.01);
  }
  /* Each new star adds this much. Higher stars add more. */
  function starPay(n, role) {
    const k = Math.max(1, Math.round(Number(n) || 0));
    const base = 80 + 60 * k;
    if (role === 'criminal') return Math.round(base * 1.45);
    return base;
  }
  function bountyFor(starsN, role) {
    const n = Math.max(0, Math.round(Number(starsN) || 0));
    let sum = 0;
    for (let i = 1; i <= n; i++) sum += starPay(i, role);
    return Math.min(BOUNTY_CAP, sum);
  }
  function starLabel(n) {
    const s = Math.max(0, n | 0);
    if (s <= 0) return '☆☆☆☆☆';
    if (s <= 5) return '★'.repeat(s) + '☆'.repeat(5 - s);
    return '★★★★★ x' + s;
  }
  function crimePay(kind) {
    const n = CRIME[kind];
    return n || 0;
  }
  return { STAR_AT, MAX, HIDE_SEC, BOUNTY_CAP, CRIME, starsOf, starThreshold, amount, decay, bountyFor, starPay, starLabel, hideSeconds, formatCooldown, cooldownLeft, crimePay, raiseForRobbery };
})();
