/* sight.js — on-sight shots at a criminal with no wanted stars.
   The officer aims at where you were. Moving more than `dodge` meters
   during the windup, leaving range, breaking line of sight, or standing
   in the station lot all spoil the shot. Numbers stay small on purpose. */

export const SIGHT = {
  range: 11,
  wind: 0.96,
  cool: 2.2,
  dmg: 8,
  dodge: 1.55
};

export function sightResult(moved, dist, los, ceasefire) {
  if (ceasefire || !los) return 'safe';
  if (!(dist >= 0) || dist > SIGHT.range) return 'safe';
  if (moved > SIGHT.dodge) return 'miss';
  return 'hit';
}
