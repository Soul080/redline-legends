/* heat.js — wanted thresholds. Minor contact adds nothing. Four and five
   stars take a long run of real offenses. Clean driving sheds heat, but a
   cop who can still see you holds the current star. */

export const STAR_AT = [0, 72, 160, 270, 410, 580];
export const HEAT_MAX = 720;

export function starsOf(heat) {
  let s = 0;
  const h = Number(heat) || 0;
  for (let i = 1; i <= 5; i++) if (h >= STAR_AT[i]) s = i;
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
  return 8;
}

export function decay(heat, stars, dt, visible, cleanFor) {
  if ((cleanFor || 0) < 3.5) return heat;
  const floor = visible && stars > 0 ? STAR_AT[stars] : 0;
  const rate = visible ? 1.6 : 8;
  return Math.max(floor, heat - rate * dt);
}

/** Evade payout. Matches the chase reward: bountyFor(peak stars, role). */
export function bountyFor(starsN, role) {
  const n = Math.max(0, Number(starsN) || 0);
  return Math.round((90 + n * 70) * (role === 'criminal' ? 1.25 : 1));
}
