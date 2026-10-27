/* robbery.js — walk up to a shop lot and empty the register.
   Cash is immediate. Heat climbs at least one wanted star, and the
   live bounty follows that heat. Each till stays empty for a minute. */

import { career } from './state.js';
import { wanted } from './wanted.js';

const TILL_MS = 90000;

export const SHOPS = {
  shop: { name: 'Shop', pay: 280, heat: 14 },
  mart: { name: 'Quick Mart', pay: 460, heat: 16 },
  dealer: { name: 'Dealership', pay: 820, heat: 18 },
  chandler: { name: 'Parts', pay: 340, heat: 15 },
  scrap: { name: 'Scrap', pay: 200, heat: 14 },
  customs: { name: 'Customs', pay: 500, heat: 17 },
  gas: { name: 'Nitro Fuel', pay: 180, heat: 14 },
  diner: { name: 'Mile Diner', pay: 150, heat: 14 }
};

export function isShop(id) { return !!SHOPS[id]; }

function tills() {
  const s = career.state;
  if (!s) return {};
  if (!s.tills || typeof s.tills !== 'object' || Array.isArray(s.tills)) s.tills = {};
  return s.tills;
}

function readyIn(id) {
  return Math.max(0, (Number(tills()[id]) || 0) - Date.now());
}

function payFor(id) {
  const spec = SHOPS[id];
  return spec ? spec.pay : 0;
}

function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

export function promptLine(id) {
  const spec = SHOPS[id];
  if (!spec) return '';
  if (readyIn(id) > 0) return spec.name + '  [E]  ·  till empty';
  return spec.name + '  [E] open  ·  [C] Rob ' + money(payFor(id));
}

export function card(id) {
  const spec = SHOPS[id];
  if (!spec) return '';
  const wait = readyIn(id);
  const line = wait > 0 ? 'Till empty. Give it a minute.' : 'Take ' + money(payFor(id)) + '. Stars and bounty go up.';
  return '<div class="card rob-card"><div><b>Rob the register</b><div class="rob-line">' + line + '</div></div><div class="btns"><button data-act="robbery"' + (wait > 0 ? ' disabled' : '') + '>Rob</button></div></div>';
}

export function rob(id) {
  const spec = SHOPS[id];
  const s = career.state;
  if (!spec || !s) return { ok: false, reason: 'none', text: '' };
  const role = s.role || 'neutral';
  if (role === 'police') return { ok: false, reason: 'police', text: 'Shops stay shut for a badge.' };
  if (readyIn(id) > 0) return { ok: false, reason: 'empty', text: spec.name + ' till is empty.' };
  const pay = payFor(id);
  if (!s.totals) s.totals = {};
  s.totals.heists = (s.totals.heists || 0) + 1;
  career.addMoney(pay);
  tills()[id] = Date.now() + TILL_MS;
  wanted.offense('robbery', spec.heat, { quiet: true });
  wanted.shownBounty = wanted.stars > 0 ? wanted.bounty() : 0;
  if (s.wanted) s.wanted = { heat: wanted.heat, stars: wanted.stars, peak: Math.max(s.wanted.peak || 0, wanted.peak || 0, wanted.stars || 0) };
  const key = role === 'criminal' ? 'criminal' : 'neutral';
  if (!s.roleXp) s.roleXp = { neutral: 0, criminal: 0, police: 0 };
  s.roleXp[key] = (s.roleXp[key] || 0) + (spec.pay >= 500 ? 18 : 10);
  career.save();
  const stars = wanted.stars;
  const bounty = wanted.bounty();
  return {
    ok: true,
    pay: pay,
    stars: stars,
    bounty: bounty,
    text: 'Robbed ' + spec.name + ' +' + money(pay) + ' · ' + stars + ' star' + (stars === 1 ? '' : 's') + ' · bounty ' + money(bounty)
  };
}
