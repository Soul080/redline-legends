/* heat.js — wanted thresholds and offense sizes.
   Stars are expensive on purpose: a bump or a clipped sign should not
   light the board, and 4–5 stars take a sustained spree. Clean driving
   sheds heat. The evade payout is bountyFor(peak stars, role). */
RL.Heat = (function () {
  const STAR_AT = [0, 48, 110, 190, 290, 420];
  const MAX = 540;
  function starsOf(heat) {
    let s = 0;
    const h = Number(heat) || 0;
    for (let i = 1; i <= 5; i++) if (h >= STAR_AT[i]) s = i;
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
    if (type === 'smuggle') return 8;
    if (type === 'wreck') return info.amount || 10;
    return 6;
  }
  /* While cops can see you, heat cannot fall through the current star. */
  function decay(heat, stars, dt, visible, cleanFor) {
    if ((cleanFor || 0) < 3.5) return heat;
    const floor = visible && stars > 0 ? STAR_AT[stars] : 0;
    const rate = visible ? 1.5 : 9;
    return Math.max(floor, heat - rate * dt);
  }
  function bountyFor(starsN, role) {
    const n = Math.max(0, Number(starsN) || 0);
    return Math.round(140 * n * (role === 'criminal' ? 1.45 : 1));
  }
  return { STAR_AT, MAX, starsOf, amount, decay, bountyFor };
})();
