/* traffic.js — free-roam traffic tiers. A stolen car never enters the garage. */

export const TIERS = [
  { id: 'beater', name: 'Beater', weight: 46, color: '#8b919a', cls: 'Hatchback', top: 0.76, acc: 0.7, turn: 0.84, hp: 60, heat: 8 },
  { id: 'commuter', name: 'Commuter', weight: 32, color: '#d5dbe3', cls: 'Coupe', top: 0.9, acc: 0.84, turn: 0.94, hp: 82, heat: 12 },
  { id: 'sport', name: 'Sport', weight: 16, color: '#ff3b6b', cls: 'Sports', top: 1.14, acc: 1.08, turn: 1.12, hp: 104, heat: 18 },
  { id: 'exotic', name: 'Exotic', weight: 6, color: '#ffe03b', cls: 'Super', top: 1.32, acc: 1.18, turn: 1.18, hp: 128, heat: 26 }
];

const KNOWN = {};
for (const t of TIERS) KNOWN[t.id] = t;

export function tierById(id) { return KNOWN[id] || null; }

export function rollTier(n) {
  const r = ((Math.abs(n | 0) * 47) + 13) % 100;
  let acc = 0;
  for (const t of TIERS) {
    acc += t.weight;
    if (r < acc) return t;
  }
  return TIERS[0];
}
