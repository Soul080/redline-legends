/* roles.js - Neutral, criminal, and police lives. Switch at Role HQ on a cooldown.
   Each life has its own XP, rank, missions and perks. If RL.Multiplayer exists,
   exportNet/peers keep cop-vs-criminal roles in sync:
     send(state), peers() -> [{id,name,x,y,h,role,stars,color,speed,siren,racing}], onBust(peer). */
RL.Roles = (function () {
  const RANKS = {
    neutral: [{ xp: 0, name: 'Nobody' }, { xp: 40, name: 'Regular' }, { xp: 140, name: 'Known Face' }, { xp: 360, name: 'Respected' }, { xp: 800, name: 'Local Legend' }],
    criminal: [{ xp: 0, name: 'Pickpocket' }, { xp: 70, name: 'Thief' }, { xp: 200, name: 'Enforcer' }, { xp: 480, name: 'Kingpin' }, { xp: 900, name: 'Underboss' }],
    police: [{ xp: 0, name: 'Cadet' }, { xp: 70, name: 'Officer' }, { xp: 200, name: 'Sergeant' }, { xp: 480, name: 'Lieutenant' }, { xp: 900, name: 'Chief' }]
  };
  const PERKS = {
    criminal: ['plates', 'ghost', 'underglow', 'fence'],
    police: ['siren', 'backup', 'spikes', 'gold']
  };
  const COOLDOWN = 90000;
  let peers = [], peerPin = 0, peerTarget = null, syncT = 0;

  function S() { return RL.Game.state; }
  function current() { const s = S(); return (s && s.role) || 'neutral'; }
  function xpOf(role) { const s = S(); return (s && s.roleXp && s.roleXp[role || current()]) || 0; }
  function rankIndex(role) {
    const list = RANKS[role || current()], xp = xpOf(role || current());
    let i = 0; for (let k = 0; k < list.length; k++) if (xp >= list[k].xp) i = k; return i;
  }
  function rankName(role) { return RANKS[role || current()][rankIndex(role)].name; }
  function hasPerk(id) {
    const role = current();
    const list = PERKS[role]; if (!list) return false;
    const idx = list.indexOf(id); if (idx < 0) return false;
    return rankIndex(role) >= idx;
  }
  function addXp(role, n) {
    const s = S(); if (!s || !n) return;
    if (!s.roleXp) s.roleXp = { neutral: 0, criminal: 0, police: 0 };
    const before = rankIndex(role);
    s.roleXp[role] = (s.roleXp[role] || 0) + n;
    const after = rankIndex(role);
    if (after > before) RL.UI.toast(RANKS[role][after].name + ' — ' + role + ' rank up', '#ffe03b');
    if (after === RANKS[role].length - 1 && RL.Game.unlockAch) RL.Game.unlockAch('sp_bigshot');
  }
  function switchTo(role) {
    const s = S(); if (!s) return { ok: false, reason: 'no save' };
    if (role === current()) return { ok: false, reason: 'That is already your life.' };
    if (RL.Wanted && RL.Wanted.stars() > 0) return { ok: false, reason: 'Lose the cops before you switch lives.' };
    if ((s.roleCooldownUntil || 0) > Date.now()) return { ok: false, reason: 'Cooldown ' + Math.ceil((s.roleCooldownUntil - Date.now()) / 1000) + 's.' };
    s.role = role;
    s.roleCooldownUntil = Date.now() + COOLDOWN;
    s.roleSwitchAt = s.roleCooldownUntil - 60000;
    s.iaStrikes = 0;
    if (role !== 'police' && RL.Hub.player) RL.Hub.player.siren = false;
    if (RL.Game.unlockAch) { if (role === 'police') RL.Game.unlockAch('sp_recruit'); if (role === 'criminal') RL.Game.unlockAch('sp_dirty'); }
    RL.Game.event('roleSwitch', { role: role });
    RL.Game.save();
    return { ok: true };
  }
  function infraction(kind) {
    const s = S(); if (!s || current() !== 'police') return;
    s.iaStrikes = (s.iaStrikes || 0) + 1;
    const fine = 200 * s.iaStrikes;
    RL.Game.addMoney(-Math.min(s.money, fine));
    addXp('police', -12);
    RL.UI.toast('Internal Affairs: ' + kind + ' (' + RL.fmtMoney(fine) + ')', '#ff8a2e');
    if (s.iaStrikes >= 3) {
      s.role = 'neutral'; s.roleCooldownUntil = Date.now() + COOLDOWN; s.roleSwitchAt = s.roleCooldownUntil - 60000; s.iaStrikes = 0;
      if (RL.Hub.player) RL.Hub.player.siren = false;
      RL.UI.toast('Badge suspended. You are neutral.', '#ff3b6b');
      if (RL.Game.unlockAch) RL.Game.unlockAch('sp_ia');
    }
    RL.Game.save();
  }
  function exportNet() {
    const s = S(), p = RL.Hub && RL.Hub.player; if (!s || !p) return null;
    const car = RL.Game.currentCar();
    return {
      id: s.netId || s.name, name: s.name, x: p.x, y: p.y, h: p.h || 0, speed: p.speed || 0,
      inCar: p.inCar !== false, role: current(), stars: RL.Wanted ? RL.Wanted.stars() : 0,
      color: RL.Game.carColor(car), rank: rankName(), siren: !!p.siren,
      racing: !!(s.job && s.job.type === 'street')
    };
  }
  function importPeers(list) { peers = Array.isArray(list) ? list : []; }
  function update(dt) {
    const s = S(); if (!s) return;
    document.body.classList.toggle('role-police', current() === 'police');
    syncT -= dt;
    const mp = RL.Multiplayer || RL.MP;
    if (mp && syncT <= 0) {
      syncT = 0.25;
      const payload = exportNet();
      if (payload && mp.send) { try { mp.send(payload); } catch (e) { } }
      if (mp.peers) { try { importPeers(mp.peers() || []); } catch (e) { } }
    }
    const p = RL.Hub.player;
    if (p && current() === 'police' && p.siren) {
      const tgt = peers.find((o) => o.role === 'criminal' && o.stars >= 1 && Math.hypot(o.x - p.x, o.y - p.y) < 32);
      if (tgt && Math.abs(p.speed) < 90) {
        if (peerTarget && peerTarget.id === tgt.id) peerPin += dt; else { peerTarget = tgt; peerPin = 0; }
        if (peerPin > 0.9) {
          peerPin = 0; peerTarget = null;
          const pay = 500 + tgt.stars * 150;
          RL.Game.addMoney(pay); addXp('police', 35);
          s.totals.bustsAi = (s.totals.bustsAi || 0) + 1;
          RL.UI.toast('Busted ' + tgt.name + ' +' + RL.fmtMoney(pay), '#7dff5a');
          if (RL.Game.unlockAch) RL.Game.unlockAch('sp_bust');
          RL.Game.event('bust', { peer: true });
          if (mp && mp.onBust) { try { mp.onBust(tgt); } catch (e) { } }
          peers = peers.filter((o) => o.id !== tgt.id);
        }
      } else peerPin = 0;
    }
  }
  function draw(ctx) {
    peers.forEach((o) => {
      if (RL.Drive) RL.Drive.drawCar(ctx, o, { livery: o.role === 'police', siren: o.siren, night: RL.City && RL.City.dark() > 0.2 });
      ctx.fillStyle = o.role === 'police' ? '#7aa2ff' : o.role === 'criminal' ? '#ff3b6b' : '#fff';
      ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(o.name + ' · ' + o.role, o.x, o.y - 18);
    });
  }
  function paintLivery(g, siren) {
    const gold = hasPerk('gold');
    g.fillStyle = gold ? '#ffe03b' : '#1d4e9a'; g.fillRect(-16, -8, 34, 4);
    g.fillStyle = '#fff'; g.fillRect(-16, -4, 34, 2);
    const flash = Math.sin(performance.now() / 80) > 0;
    g.fillStyle = siren && flash ? '#ff3b6b' : '#3fa9ff'; g.fillRect(-4, -11, 8, 4);
    if (siren && !flash) { g.fillStyle = '#ff3b6b'; g.fillRect(6, -11, 6, 3); }
    g.fillStyle = '#fff'; g.font = 'bold 6px sans-serif'; g.textAlign = 'center';
    g.fillText(gold ? 'CHIEF' : 'POLICE', 2, 4);
  }
  function hud() {
    const role = current();
    const color = role === 'police' ? '#7aa2ff' : role === 'criminal' ? '#ff3b6b' : '#ffe03b';
    return { role, color, label: role.toUpperCase() + ' · ' + rankName() };
  }
  function showHQ() {
    RL.UI.open({
      title: '🚓 Role HQ',
      render: () => {
        const s = S(), left = Math.max(0, (s.roleCooldownUntil || 0) - Date.now());
        let h = '<p>You are <b class="hl">' + current().toUpperCase() + '</b> · ' + rankName() + ' (' + xpOf() + ' XP).</p>';
        h += '<p class="small">Neutral: cops ignore mild speeding. Criminal: heists, smuggling, hotter heat, rank cosmetics. Police: livery and siren (L), bust suspects, crimes go to Internal Affairs. Switching takes a 90s cooldown and a clean record.</p>';
        if (left > 0) h += '<p class="small">Switch available in ' + Math.ceil(left / 1000) + 's.</p>';
        ['neutral', 'criminal', 'police'].forEach((r) => {
          const on = current() === r;
          h += '<div class="card"><div><b>' + r.toUpperCase() + '</b> · ' + rankName(r) + '<div class="small">' + RANKS[r].map((x) => x.name).join(' → ') + '</div></div><div class="btns">' +
            (on ? '<span class="eq">ACTIVE</span>' : '<button data-act="pick" data-arg="' + r + '">Switch</button>') + '</div></div>';
        });
        if (current() === 'police') h += '<div class="row"><button class="primary" data-act="dispatch">Dispatch: bust a suspect</button><button data-act="siren">Toggle siren</button></div>';
        h += '<h3>Perks</h3>';
        (PERKS[current()] || []).forEach((id, i) => {
          h += '<div class="small">' + (rankIndex() >= i ? '✅' : '🔒') + ' ' + id + ' · ' + RANKS[current()][i].name + '</div>';
        });
        return h;
      },
      acts: {
        pick: (r) => { const res = switchTo(r); RL.UI.toast(res.ok ? 'Now living as ' + r : res.reason, res.ok ? '#7dff5a' : '#ff8a2e'); },
        dispatch: () => { if (RL.Jobs) RL.Jobs.startDispatch(); },
        siren: () => { const p = RL.Hub.player; if (p) p.siren = !p.siren; }
      }
    });
  }
  return { current, xpOf, rankName, rankIndex, hasPerk, addXp, switchTo, infraction, exportNet, importPeers, update, draw, paintLivery, hud, showHQ, peers: () => peers, RANKS, COOLDOWN };
})();
