/* peds.js — people on the curb. A fast car that hits one raises the bounty.
   They are not gory: a hit knocks them down, then they get back up. */
RL.Peds = (function () {
  const COLORS = ['#ffffff', '#d7e4ff', '#ffe08a', '#ffd0e0', '#c8ffe0'];
  let list = [];
  let index = null;

  function map() { return RL.CityMap; }
  function roadAt(tx, ty) {
    const m = map();
    if (!m || !m.mask) return false;
    if (tx < 0 || ty < 0 || tx >= m.cols || ty >= m.rows) return false;
    return m.mask[ty * m.cols + tx] > 0;
  }
  function rebuild() {
    const m = map();
    list = [];
    index = null;
    if (!m || !m.sidewalks || !m.sidewalks.length) return list;
    const T = m.T || 40;
    const step = Math.max(1, Math.floor(m.sidewalks.length / 24));
    for (let i = 0; i < m.sidewalks.length && list.length < 24; i += step) {
      const s = m.sidewalks[i];
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let nx = 0, ny = 0, found = false;
      for (let d = 0; d < dirs.length; d++) {
        if (roadAt(s.x + dirs[d][0], s.y + dirs[d][1])) { nx = dirs[d][0]; ny = dirs[d][1]; found = true; break; }
      }
      if (!found) continue;
      let x, y;
      if (nx === 1) { x = (s.x + 1) * T + 12; y = (s.y + 0.5) * T; }
      else if (nx === -1) { x = s.x * T - 12; y = (s.y + 0.5) * T; }
      else if (ny === 1) { y = (s.y + 1) * T + 12; x = (s.x + 0.5) * T; }
      else { y = s.y * T - 12; x = (s.x + 0.5) * T; }
      const along = nx !== 0 ? 0 : 1;
      list.push({
        x: x, y: y,
        vx: along ? 28 : 0,
        vy: along ? 0 : 28,
        color: COLORS[list.length % COLORS.length],
        down: 0
      });
    }
    return list;
  }
  function ensure() {
    if (!list.length) rebuild();
  }
  function update(dt) {
    ensure();
    if (!list.length) return;
    dt = Math.max(0, Math.min(0.1, Number(dt) || 0));
    const T = (map() && map().T) || 40;
    const onRoad = (x, y) => roadAt(Math.floor(x / T), Math.floor(y / T));
    const p = RL.Hub && RL.Hub.player;
    for (let i = 0; i < list.length; i++) {
      const ped = list[i];
      if (ped.down > 0) { ped.down -= dt; continue; }
      const nx = ped.x + ped.vx * dt;
      const ny = ped.y + ped.vy * dt;
      if (ped.vx && !onRoad(nx, ped.y)) ped.vx *= -1;
      else ped.x = nx;
      if (ped.vy && !onRoad(ped.x, ny)) ped.vy *= -1;
      else ped.y = ny;
      if (!p || p.inCar === false || p.wrecked) continue;
      const sp = Math.abs(p.speed || 0);
      if (sp < 90) continue;
      if (Math.hypot(p.x - ped.x, p.y - ped.y) > 20) continue;
      ped.down = 6;
      ped.x += Math.cos(p.h || 0) * 10;
      ped.y += Math.sin(p.h || 0) * 10;
      if (RL.Wanted) {
        RL.Wanted.report('ped', { speed: sp });
        RL.Wanted.addBounty('pedestrian');
      }
      try { RL.Audio.play('bump', 0.35); } catch (e) { }
    }
  }
  function draw(ctx) {
    if (!ctx || !list.length) return;
    for (let i = 0; i < list.length; i++) {
      const ped = list[i];
      ctx.save();
      ctx.translate(ped.x, ped.y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0c0816';
      if (ped.down > 0) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 4, 0, 0, 7);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = ped.color;
        ctx.beginPath();
        ctx.arc(0, 2, 6, 0, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f2c9a0';
        ctx.beginPath();
        ctx.arc(0, -6, 4, 0, 7);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  return { update: update, draw: draw, rebuild: rebuild, all: () => list.slice() };
})();
