/* summon.js - Call the selected garage car to your side in free roam.
   One body, a short cooldown, and no new garage entry. Blocked at 3+ stars
   and while you are busted. */
RL.Summon = (function () {
  const COOL = 12;
  function stars() {
    const w = RL.Game && RL.Game.state && RL.Game.state.wanted;
    return (w && w.stars) || 0;
  }
  function reason(p) {
    const s = RL.Game && RL.Game.state;
    if (!s || !p) return 'now';
    if (p.downed || (p.bustLock || 0) > 0) return 'busted';
    if (stars() >= 3) return 'heat';
    if (s.hub && s.hub.summonCd > 0) return 'cool';
    if (p.inCar !== false && !p.joyride) return 'here';
    if (!RL.Game.currentCar()) return 'none';
    return null;
  }
  function spot(p) {
    const blocked = RL.Hub && RL.Hub.blocked;
    const base = (p.h || 0) + 1.15;
    for (let i = 0; i < 10; i++) {
      const a = base + i * 0.62;
      const dist = 48 + (i % 3) * 18;
      const x = p.x + Math.cos(a) * dist;
      const y = p.y + Math.sin(a) * dist;
      if (blocked && blocked(x, y, 16)) continue;
      return { x: x, y: y, h: Math.atan2(p.y - y, p.x - x) };
    }
    return null;
  }
  function call() {
    const s = RL.Game && RL.Game.state;
    const p = RL.Hub && RL.Hub.player;
    const why = reason(p);
    if (why) return { ok: false, reason: why };
    const cars = s.cars.length;
    const uid = s.currentCar;
    const money = s.money;
    const place = spot(p);
    if (!place) return { ok: false, reason: 'blocked' };
    const parked = { x: place.x, y: place.y, h: place.h };
    if (p.joyride) p.ownPark = parked;
    else {
      p.parked = parked;
      if (s.hub) s.hub.parked = parked;
    }
    if (s.hub) s.hub.summonCd = COOL;
    if (s.cars.length !== cars) s.cars.length = cars;
    if (s.currentCar !== uid) s.currentCar = uid;
    if (s.money !== money) s.money = money;
    try { RL.Game.save(); } catch (e) { }
    return { ok: true };
  }
  function toast(res) {
    if (!RL.UI || !RL.UI.toast) return;
    if (res.ok) RL.UI.toast('Your car is beside you', '#7dff5a');
    else if (res.reason === 'heat') RL.UI.toast('Can\'t call a car at 3 stars or more', '#ff8a2e');
    else if (res.reason === 'busted') RL.UI.toast('Can\'t call a car while you\'re busted', '#ff8a2e');
    else if (res.reason === 'cool') RL.UI.toast('Call car is cooling down', '#9fb3c8');
    else if (res.reason === 'here') RL.UI.toast('You\'re already in your car', '#9fb3c8');
    else if (res.reason === 'blocked') RL.UI.toast('No room to park it', '#ff8a2e');
    else RL.UI.toast('Can\'t call the car right now', '#ff8a2e');
  }
  function poll(dt) {
    const s = RL.Game && RL.Game.state;
    const p = RL.Hub && RL.Hub.player;
    if (s && s.hub && s.hub.summonCd > 0) s.hub.summonCd = Math.max(0, s.hub.summonCd - dt);
    if (p && p.bustLock > 0) p.bustLock = Math.max(0, p.bustLock - dt);
    if (!s || RL.Game.mode !== 'hub') return;
    if (RL.UI && RL.UI.isOpen && RL.UI.isOpen()) return;
    if (RL.Photo && RL.Photo.active) return;
    if (RL.City && RL.City.mapOpen && RL.City.mapOpen()) return;
    if (RL.Input && RL.Input.hit('summon')) toast(call());
  }
  return { call, poll, reason, toast, COOL };
})();
