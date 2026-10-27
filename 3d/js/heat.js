/* heat.js — wanted thresholds. Minor contact adds nothing. Four and five
   stars take a long run of real offenses. A star falls only after a long
   hide. A cop who can still see you holds the current star. */

export const STAR_AT = [0, 72, 160, 270, 410, 580];
export const HEAT_MAX = 1000000;
/* Seconds of continuous hiding before the current star can fall.
   Past five stars the wait keeps growing. */
export const HIDE_SEC = [0, 90, 120, 150, 180, 240];

export function starThreshold(n) {
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

export function hideSeconds(stars) {
  const n = Math.max(0, stars | 0);
  if (n <= 5) return HIDE_SEC[n] || 0;
  return HIDE_SEC[5] + (n - 5) * 45;
}

export function formatCooldown(sec) {
  const s = Math.max(0, Math.ceil(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

export function cooldownLeft(stars, hiddenFor) {
  if ((stars | 0) <= 0) return 0;
  return Math.max(0, hideSeconds(stars) - Math.max(0, Number(hiddenFor) || 0));
}

export function starsOf(heat) {
  const h = Number(heat) || 0;
  if (h < STAR_AT[1]) return 0;
  let s = 0;
  for (let i = 1; i < 80; i++) {
    if (h >= starThreshold(i)) s = i;
    else break;
  }
  return s;
}

export function amount(kind, info) {
  info = info || {};
  const sp = Number(info.speed) || 0;
  if (kind === 'prop') {
    if (info.destroyed) return 5;
    if (sp > 18) return 2;
    return 0;
  }
  if (kind === 'traffic') {
    if (info.destroyed) return 14;
    if (sp < 8) return 0;
    if (sp < 14) return 3;
    return 8;
  }
  if (kind === 'cop') {
    if (sp < 8) return 0;
    return 8;
  }
  if (kind === 'copkill') return 58;
  if (kind === 'steal') return info.amount || 12;
  if (kind === 'red') return 16;
  if (kind === 'race' || kind === 'street') return 24;
  if (kind === 'job') return info.amount == null ? 18 : info.amount;
  if (kind === 'robbery') return info.amount || 14;
  return 8;
}

/* Seen surplus cools very slowly and cannot cross the current star.
   Hidden heat waits out hideSeconds, then one star drops. */
export function decay(heat, stars, dt, visible, cleanFor, hiddenFor) {
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

/** Standing bounty. Each new star adds starPay, and higher stars add more. */
export const BOUNTY_CAP = 100000;
const CRIME = { pedestrian: 75, ram: 50, wreck: 150 };

export function starPay(n, role) {
  const k = Math.max(1, Math.round(Number(n) || 0));
  const base = 80 + 60 * k;
  if (role === 'criminal') return Math.round(base * 1.45);
  return base;
}

export function bountyFor(starsN, role) {
  const n = Math.max(0, Math.round(Number(starsN) || 0));
  let sum = 0;
  for (let i = 1; i <= n; i++) sum += starPay(i, role);
  return Math.min(BOUNTY_CAP, sum);
}

export function starLabel(n) {
  const s = Math.max(0, n | 0);
  if (s <= 0) return '☆☆☆☆☆';
  if (s <= 5) return '★'.repeat(s) + '☆'.repeat(5 - s);
  return '★★★★★ x' + s;
}

export function crimePay(kind) {
  return CRIME[kind] || 0;
}
