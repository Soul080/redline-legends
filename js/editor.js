/* editor.js - Track editor. Mouse and touch: place and drag closed-loop waypoints,
   set width, grass, walls, and theme, scatter or drop decorations. Checkpoints and
   the start grid are generated from the spline. Test-drive, then save or share. */
window.RL = window.RL || {};

RL.Editor = (function () {
  const WORLD_MIN = -300, WORLD_MAX = 5400;
  let draft = null;
  let tool = 'move';
  let decoType = 'lamp';
  let selected = -1;
  let cam = { x: 900, y: 700 };
  let zoom = 0.6;
  let undo = [], redo = [];
  let drag = null;
  let pinch = null;
  let report = { ok: false, errors: [], warnings: [], length: 0, crossings: [], checkpoints: 0 };
  let savedStamp = '';
  let lastNote = '';
  let geomDirty = true;
  let modalFlag = false;
  let onYes = null;
  let mounted = false;
  const pointers = new Map();

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const canvas = () => RL.Game && RL.Game.canvas || document.getElementById('game');
  const ui = () => document.getElementById('editor-ui');

  function clampCoord(v) { return RL.clamp(v, WORLD_MIN, WORLD_MAX); }
  function snap() {
    return JSON.stringify({
      pts: draft.pts, decorations: draft.decorations,
      width: draft.width, grass: draft.grass, theme: draft.theme, walls: draft.walls
    });
  }
  function stamp() { return snap() + '|' + draft.name; }
  function isDirty() { return !!draft && stamp() !== savedStamp; }

  function pushUndo() {
    if (!draft) return;
    undo.push(snap());
    if (undo.length > 60) undo.shift();
    redo = [];
  }
  function restore(raw) {
    const s = JSON.parse(raw);
    draft.pts = s.pts;
    draft.decorations = s.decorations;
    draft.width = s.width;
    draft.grass = s.grass;
    draft.theme = s.theme;
    draft.walls = s.walls;
    selected = Math.min(selected, draft.pts.length - 1);
    geomDirty = true;
    revalidate();
    refresh();
  }
  function undoOnce() {
    if (!undo.length || !draft) return;
    redo.push(snap());
    restore(undo.pop());
  }
  function redoOnce() {
    if (!redo.length || !draft) return;
    undo.push(snap());
    restore(redo.pop());
  }

  function revalidate() {
    if (!draft) return report;
    report = RL.Tracks.validate(draft);
    return report;
  }

  function screenBox() {
    const c = canvas();
    const dpr = (RL.Game && RL.Game.dpr) || 1;
    return { c: c, dpr: dpr, W: c.width / dpr, H: c.height / dpr };
  }
  function worldToScreen(x, y) {
    const box = screenBox();
    return { x: (x - cam.x) * zoom + box.W / 2, y: (y - cam.y) * zoom + box.H / 2 };
  }
  function screenToWorld(sx, sy) {
    const box = screenBox();
    return { x: (sx - box.W / 2) / zoom + cam.x, y: (sy - box.H / 2) / zoom + cam.y };
  }
  function eventScreen(e) {
    const c = canvas();
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function project(wx, wy) {
    const c = canvas();
    const r = c.getBoundingClientRect();
    const s = worldToScreen(wx, wy);
    return { x: r.left + s.x, y: r.top + s.y };
  }

  function fit() {
    const pts = draft && draft.pts || [];
    if (!pts.length) { cam.x = 900; cam.y = 700; zoom = 0.65; return; }
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    pts.forEach((p) => { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); });
    const pad = 180;
    const w = Math.max(240, maxX - minX + pad * 2);
    const h = Math.max(240, maxY - minY + pad * 2);
    const box = screenBox();
    zoom = RL.clamp(Math.min((box.W - 20) / w, (box.H - 20) / h), 0.18, 1.7);
    cam.x = (minX + maxX) / 2;
    cam.y = (minY + maxY) / 2;
  }

  function zoomAtScreen(sx, sy, newZoom) {
    const world = screenToWorld(sx, sy);
    zoom = RL.clamp(newZoom, 0.12, 2.6);
    const box = screenBox();
    cam.x = world.x - (sx - box.W / 2) / zoom;
    cam.y = world.y - (sy - box.H / 2) / zoom;
  }

  function hitPoint(sx, sy) {
    let best = -1, bd = 22;
    draft.pts.forEach((p, i) => {
      const s = worldToScreen(p[0], p[1]);
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (d <= 22 && (best < 0 || d < bd)) { best = i; bd = d; }
    });
    return best;
  }
  function hitDeco(sx, sy) {
    let best = -1, bd = 18;
    draft.decorations.forEach((d, i) => {
      const s = worldToScreen(d.x, d.y);
      const dist = Math.hypot(s.x - sx, s.y - sy);
      if (dist <= 18 && (best < 0 || dist < bd)) { best = i; bd = dist; }
    });
    return best;
  }
  function pointSegDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = RL.clamp(t, 0, 1);
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }

  function addPoint(world) {
    if (draft.pts.length >= 40) { lastNote = '40 waypoints is the limit'; return selected; }
    const pts = draft.pts;
    let best = 1e9, idx = pts.length;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const d = pointSegDist(world.x, world.y, a[0], a[1], b[0], b[1]);
      if (d < best) { best = d; idx = i + 1; }
    }
    const threshold = Math.max(40, draft.width * 0.45);
    const p = [Math.round(clampCoord(world.x)), Math.round(clampCoord(world.y))];
    if (best <= threshold && pts.length >= 3) draft.pts.splice(idx, 0, p);
    else { draft.pts.push(p); idx = draft.pts.length - 1; }
    selected = idx;
    geomDirty = true;
    return idx;
  }

  function deleteAt(index) {
    if (index < 0 || index >= draft.pts.length) return;
    pushUndo();
    draft.pts.splice(index, 1);
    selected = Math.min(selected, draft.pts.length - 1);
    geomDirty = true;
    revalidate();
    refresh();
  }
  function deleteSelected() {
    if (selected >= 0) deleteAt(selected);
  }

  function loadIntoEditor(def, saved) {
    draft = RL.Tracks.normalize(def);
    draft.id = saved ? def.id : (def.id && saved ? def.id : null);
    if (!saved) draft.id = null;
    else draft.id = def.id;
    draft.created = saved ? def.created : null;
    selected = draft.pts.length ? 0 : -1;
    undo = []; redo = [];
    lastNote = saved ? '' : lastNote;
    geomDirty = true;
    revalidate();
    fit();
    savedStamp = saved ? stamp() : '';
    refresh();
  }

  function enterMode() {
    if (RL.UI) RL.UI.closeAll();
    RL.Game.mode = 'editor';
    if (RL.UI) RL.UI.setMode('editor');
    try { RL.Audio.startMusic('hub'); } catch (e) { /* music is optional */ }
    refresh();
  }

  function open(id) {
    mount();
    if (id) {
      const t = RL.Tracks.get(id);
      if (t) { loadIntoEditor(t, true); enterMode(); return; }
    }
    const b = RL.Tracks.blank('New Circuit');
    b.decorations = RL.Tracks.scatter(b, 26, 0xC0FFEE);
    loadIntoEditor(b, false);
    savedStamp = stamp();
    lastNote = '';
    enterMode();
  }
  function openDraft(def) {
    mount();
    loadIntoEditor(def, false);
    if (def && def.id && RL.Tracks.get(def.id)) {
      draft.id = def.id;
      savedStamp = stamp();
    }
    enterMode();
  }

  function exitEditor() {
    const go = () => {
      hideModal();
      if (!RL.Game.state) { RL.Game.mode = 'title'; RL.UI.setMode('title'); return; }
      RL.Game.mode = 'hub';
      RL.Hub.enter();
      RL.UI.setMode('hub');
      try { RL.Audio.startMusic('hub'); } catch (e) { /* music is optional */ }
    };
    if (isDirty()) confirm('Leave the editor? Unsaved changes will be lost.', go);
    else go();
  }

  function saveTrack() {
    revalidate();
    try {
      const kept = RL.Tracks.save(draft);
      draft.id = kept.id;
      draft.created = kept.created;
      draft.updated = kept.updated;
      draft.name = kept.name;
      draft.pts = kept.pts.map((p) => [p[0], p[1]]);
      draft.decorations = kept.decorations.map((d) => ({ t: d.t, x: d.x, y: d.y }));
      draft.width = kept.width;
      draft.grass = kept.grass;
      savedStamp = stamp();
      lastNote = report.ok ? 'Saved to this browser' : 'Saved — fix the errors before racing it';
      refresh();
      if (RL.UI) RL.UI.toast('Saved ' + kept.name, report.ok ? '#7dff5a' : '#ffe03b');
    } catch (e) {
      lastNote = e.message || 'Save failed';
      refreshStatus();
    }
  }

  function testDrive() {
    revalidate();
    if (!report.ok) { lastNote = report.errors[0] || 'Track is not raceable'; refreshStatus(); return; }
    const def = RL.Tracks.asRaceDef(draft);
    const themeTime = { neon: 'night', snow: 'day', desert: 'day', city: 'dusk' }[def.theme] || 'day';
    RL.Game.startRace({
      kind: 'testdrive',
      track: def.id || 'testdrive',
      trackDef: def,
      laps: 2,
      aiCount: 0,
      weather: 'clear',
      time: themeTime,
      damage: false,
      nitro: true,
      collision: true,
      catchup: false,
      reverse: false,
      title: 'Test Drive · ' + def.name
    });
  }

  function resumeAfterTest(res) {
    if (!draft) return;
    if (!res) lastNote = 'Test drive cancelled';
    else if (res.finished) lastNote = 'Test lap ' + RL.fmtTime(res.bestLap || res.totalTime);
    else lastNote = 'Test drive ended';
    try { RL.Audio.startMusic('hub'); } catch (e) { /* music is optional */ }
    refreshStatus();
  }

  function setTool(next) {
    tool = next;
    if (tool === 'deco' && RL.Tracks.THEME_DECO[draft && draft.theme]) {
      const prefer = RL.Tracks.THEME_DECO[draft.theme];
      if (prefer.indexOf(decoType) < 0) decoType = prefer[0];
    }
    refresh();
  }

  function statusText() {
    const len = RL.Tracks.formatLength(report.length || 0);
    const head = report.ok
      ? 'Closed and drivable · ' + len + ' · ' + draft.pts.length + ' waypoints · 4 checkpoints · 12-car grid'
      : 'Not raceable · ' + (report.errors[0] || 'Fix the circuit');
    const more = report.ok ? (report.warnings[0] || '') : report.errors.slice(1, 3).join(' · ');
    const hint = 'Drag points · Place to add · scroll or pinch to zoom · Del removes · Esc exits';
    return [head, more, lastNote, isDirty() ? 'Unsaved' : '', hint].filter(Boolean).join('   ·   ');
  }

  function refreshStatus() {
    const el = document.getElementById('ed-status');
    if (!el || !draft) return;
    el.textContent = statusText();
    el.classList.toggle('ok', !!report.ok);
    el.classList.toggle('bad', !report.ok);
    const test = document.getElementById('ed-test');
    if (test) test.disabled = !report.ok;
    const u = document.getElementById('ed-undo'), r = document.getElementById('ed-redo');
    if (u) u.disabled = !undo.length;
    if (r) r.disabled = !redo.length;
    const wv = document.getElementById('ed-width-v');
    const gv = document.getElementById('ed-grass-v');
    if (wv) wv.textContent = String(draft.width);
    if (gv) gv.textContent = String(draft.grass);
  }

  function refresh() {
    if (!draft || !mounted) return;
    const root = ui();
    root.classList.remove('tool-move', 'tool-place', 'tool-erase', 'tool-deco');
    root.classList.add('tool-' + tool);
    const name = document.getElementById('ed-name');
    if (name && document.activeElement !== name) name.value = draft.name;
    document.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('on', b.dataset.theme === draft.theme));
    document.querySelectorAll('[data-deco]').forEach((b) => b.classList.toggle('on', b.dataset.deco === decoType));
    ['move', 'place', 'erase', 'deco'].forEach((t) => {
      const b = document.getElementById('ed-' + t);
      if (b) b.classList.toggle('on', tool === t);
    });
    const width = document.getElementById('ed-width');
    const grass = document.getElementById('ed-grass');
    if (width && document.activeElement !== width) width.value = String(draft.width);
    if (grass && document.activeElement !== grass) grass.value = String(draft.grass);
    const walls = document.getElementById('ed-walls');
    if (walls) { walls.textContent = 'Walls: ' + (draft.walls ? 'ON' : 'OFF'); walls.classList.toggle('on', !!draft.walls); }
    const u = document.getElementById('ed-undo'), r = document.getElementById('ed-redo');
    if (u) u.disabled = !undo.length;
    if (r) r.disabled = !redo.length;
    refreshStatus();
  }

  function showModal(html) {
    document.getElementById('ed-modal-card').innerHTML = html;
    document.getElementById('ed-modal').hidden = false;
    modalFlag = true;
  }
  function hideModal() {
    const m = document.getElementById('ed-modal');
    if (m) m.hidden = true;
    const card = document.getElementById('ed-modal-card');
    if (card) card.innerHTML = '';
    modalFlag = false;
    onYes = null;
  }
  function confirm(text, yes) {
    onYes = yes;
    showModal('<p>' + esc(text) + '</p><div class="row"><button type="button" class="primary" data-ed="yes">Continue</button><button type="button" data-ed="no">Cancel</button></div>');
  }

  function showPublish() {
    revalidate();
    if (!report.ok) {
      lastNote = report.errors[0] || 'Fix the circuit before publishing';
      refreshStatus();
      if (RL.UI) RL.UI.toast(lastNote, '#ff3b6b');
      return;
    }
    const linked = RL.Community && RL.Community.configured && RL.Community.configured();
    if (!linked) {
      const msg = (RL.Community && RL.Community.messages && RL.Community.messages.unconfigured) ||
        "Community Tracks isn't connected yet. Share codes from the editor still work on this device.";
      showModal('<h3>Publish</h3><p>' + esc(msg) + '</p><div class="row"><button type="button" class="primary" data-ed="share">Share code</button><button type="button" data-ed="close">Close</button></div>');
      return;
    }
    const author = (RL.Game.state && RL.Game.state.name) || 'Racer';
    showModal(
      '<h3>Publish to Community Tracks</h3><p class="small">' + esc(draft.name) + ' · ' + esc((RL.THEMES[draft.theme] && RL.THEMES[draft.theme].name) || draft.theme) + '</p>' +
      '<label class="small">Author name</label><input id="ed-author" maxlength="24" type="text" value="' + esc(author) + '">' +
      '<p id="ed-pub-err" class="small" style="color:#ff8a8a"></p>' +
      '<div class="row"><button type="button" class="primary" data-ed="do-publish">Publish</button><button type="button" data-ed="close">Cancel</button></div>'
    );
  }
  function showShare() {
    let code = '';
    try { code = RL.Tracks.toShareCode(draft); }
    catch (e) { code = ''; }
    showModal(
      '<h3>Share code</h3><p class="small">A short code for this circuit. Paste one below to load it here, or export a JSON file.</p>' +
      '<textarea id="ed-code" readonly rows="4">' + esc(code) + '</textarea>' +
      '<h3>Import a code</h3><textarea id="ed-import-code" rows="3" placeholder="RL1...."></textarea>' +
      '<p id="ed-import-err" class="small" style="color:#ff8a8a"></p>' +
      '<div class="row"><button type="button" data-ed="select-code">Select code</button><button type="button" class="primary" data-ed="load-code">Load code</button><button type="button" data-ed="close">Close</button></div>'
    );
  }
  function showLibrary() {
    const list = RL.Tracks.allCustom();
    const rows = list.length ? list.map((t) => {
      const v = RL.Tracks.validate(t);
      const theme = (RL.THEMES[t.theme] && RL.THEMES[t.theme].name) || t.theme;
      return '<div class="card"><div><b>' + esc(t.name) + '</b><div class="small">' + esc(theme) + ' · ' + (v.ok ? 'ready to race' : 'needs work') + '</div></div>' +
        '<div class="btns"><button type="button" data-ed="load-track" data-id="' + esc(t.id) + '">Load</button><button type="button" data-ed="delete-track" data-id="' + esc(t.id) + '">Delete</button></div></div>';
    }).join('') : '<p class="dim">No saved tracks on this device yet.</p>';
    showModal('<h3>Saved tracks</h3>' + rows + '<div class="row"><button type="button" data-ed="close">Close</button></div>');
  }

  function onModalClick(e) {
    const b = e.target.closest('[data-ed]');
    if (!b) return;
    const act = b.dataset.ed;
    if (act === 'close' || act === 'no') { hideModal(); return; }
    if (act === 'yes') { const fn = onYes; hideModal(); if (fn) fn(); return; }
    if (act === 'select-code') {
      const ta = document.getElementById('ed-code');
      if (ta) { ta.focus(); ta.select(); }
      return;
    }
    if (act === 'load-code') {
      const err = document.getElementById('ed-import-err');
      try {
        const def = RL.Tracks.fromShareCode(document.getElementById('ed-import-code').value);
        hideModal();
        lastNote = 'Loaded share code — Save to keep it';
        loadIntoEditor(def, false);
      } catch (ex) { if (err) err.textContent = ex.message || 'Could not read that code'; }
      return;
    }
    if (act === 'load-track') {
      const t = RL.Tracks.get(b.dataset.id);
      if (!t) return;
      hideModal();
      lastNote = '';
      loadIntoEditor(t, true);
      return;
    }
    if (act === 'share') { hideModal(); showShare(); return; }
    if (act === 'do-publish') {
      const input = document.getElementById('ed-author');
      const err = document.getElementById('ed-pub-err');
      const author = input ? input.value : '';
      b.disabled = true;
      RL.Community.publish(draft, author).then((row) => {
        hideModal();
        lastNote = 'Published to Community Tracks';
        refreshStatus();
        if (RL.UI) RL.UI.toast('Published ' + ((row && row.name) || draft.name), '#7dff5a');
      }).catch((ex) => {
        b.disabled = false;
        if (err) err.textContent = (ex && ex.message) || 'Could not publish';
      });
      return;
    }
    if (act === 'delete-track') {
      const id = b.dataset.id;
      const t = RL.Tracks.get(id);
      confirm('Delete ' + (t ? t.name : 'this track') + '?', () => {
        RL.Tracks.remove(id);
        if (draft && draft.id === id) { draft.id = null; savedStamp = ''; }
        showLibrary();
      });
    }
  }

  function newTrack() {
    const go = () => {
      const b = RL.Tracks.blank('New Circuit');
      b.decorations = RL.Tracks.scatter(b, 26, (Math.random() * 1e9) | 0);
      lastNote = '';
      loadIntoEditor(b, false);
      savedStamp = stamp();
      refreshStatus();
    };
    if (isDirty()) confirm('Start a new track? Unsaved edits will be lost.', go);
    else go();
  }

  function drawProp(ctx, t, x, y) {
    ctx.save();
    ctx.translate(x, y);
    if (t === 'building') {
      ctx.fillStyle = '#3b4458'; ctx.fillRect(-16, -18, 32, 36);
      ctx.fillStyle = 'rgba(255,224,59,0.85)';
      ctx.fillRect(-8, -10, 5, 5); ctx.fillRect(3, -10, 5, 5); ctx.fillRect(-8, 2, 5, 5);
    } else if (t === 'cactus') {
      ctx.fillStyle = '#3f8a3a'; ctx.fillRect(-4, -18, 8, 32); ctx.fillRect(-14, -6, 12, 6); ctx.fillRect(2, 0, 12, 6);
    } else if (t === 'pine') {
      ctx.fillStyle = '#2c5a45'; ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(14, 12); ctx.lineTo(-14, 12); ctx.fill();
      ctx.fillStyle = '#eef4fb'; ctx.beginPath(); ctx.arc(-3, -6, 4, 0, 7); ctx.fill();
    } else if (t === 'neon') {
      ctx.strokeStyle = '#ff2ef0'; ctx.lineWidth = 3; ctx.strokeRect(-14, -10, 28, 16);
      ctx.strokeStyle = '#2ee6ff'; ctx.beginPath(); ctx.moveTo(-8, 8); ctx.lineTo(-8, 18); ctx.moveTo(8, 8); ctx.lineTo(8, 18); ctx.stroke();
    } else if (t === 'rock') {
      ctx.fillStyle = '#6d6258'; ctx.beginPath(); ctx.ellipse(0, 2, 14, 8, 0, 0, 7); ctx.fill();
    } else {
      ctx.strokeStyle = '#ffe03b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 16); ctx.stroke();
      ctx.fillStyle = '#ffe03b'; ctx.beginPath(); ctx.arc(0, -8, 5, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function draw(ctx) {
    if (!draft || RL.Game.mode !== 'editor') return;
    if (geomDirty) { revalidate(); geomDirty = false; refreshStatus(); }
    const box = screenBox();
    const W = box.W, H = box.H, dpr = box.dpr;
    const th = RL.THEMES[draft.theme] || RL.THEMES.city;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, dpr * (W / 2 - cam.x * zoom), dpr * (H / 2 - cam.y * zoom));
    const tl = screenToWorld(0, 0), br = screenToWorld(W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    const g0 = 100;
    for (let x = Math.floor(tl.x / g0) * g0; x < br.x; x += g0) { ctx.moveTo(x, tl.y); ctx.lineTo(x, br.y); }
    for (let y = Math.floor(tl.y / g0) * g0; y < br.y; y += g0) { ctx.moveTo(tl.x, y); ctx.lineTo(br.x, y); }
    ctx.stroke();

    const geom = RL.Tracks.sampleLoop(draft.pts, false);
    const strokeLoop = () => {
      if (!geom.N) return;
      ctx.beginPath();
      geom.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
    };
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (geom.N) {
      const outer = draft.width + Math.max(0, draft.grass) * 2;
      if (draft.walls) {
        strokeLoop(); ctx.strokeStyle = th.wall; ctx.lineWidth = outer + 22; ctx.stroke();
      }
      if (draft.grass > 0) { strokeLoop(); ctx.strokeStyle = th.off; ctx.lineWidth = outer; ctx.stroke(); }
      strokeLoop(); ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = draft.width + 14; ctx.stroke();
      strokeLoop(); ctx.strokeStyle = th.deco === 'neon' ? '#2ee6ff' : '#e0303a'; ctx.setLineDash([18, 16]); ctx.stroke(); ctx.setLineDash([]);
      strokeLoop(); ctx.strokeStyle = th.road; ctx.lineWidth = draft.width; ctx.stroke();
      strokeLoop(); ctx.strokeStyle = th.line; ctx.globalAlpha = 0.7; ctx.lineWidth = 3; ctx.setLineDash([26, 22]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;

      geom.cps.forEach((ci, k) => {
        const p = geom.pts[ci];
        if (!p) return;
        const hw = draft.width / 2;
        ctx.lineWidth = 4;
        if (k === 0) {
          ctx.strokeStyle = '#ffe03b';
          for (let j = -hw; j < hw; j += 12) {
            ctx.fillStyle = ((j / 12) & 1) ? '#fff' : '#111';
            ctx.fillRect(p.x + p.nx * j - 5, p.y + p.ny * j - 5, 10, 10);
          }
        } else {
          ctx.strokeStyle = 'rgba(46,230,255,0.9)';
          ctx.beginPath();
          ctx.moveTo(p.x + p.nx * hw, p.y + p.ny * hw);
          ctx.lineTo(p.x - p.nx * hw, p.y - p.ny * hw);
          ctx.stroke();
        }
        ctx.save();
        ctx.translate(p.x + p.nx * (hw + 18), p.y + p.ny * (hw + 18));
        ctx.scale(1 / zoom, 1 / zoom);
        ctx.fillStyle = k === 0 ? '#ffe03b' : '#2ee6ff';
        ctx.font = 'bold 13px Trebuchet MS, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(k === 0 ? 'START / FINISH' : ('CP ' + (k + 1)), 0, 0);
        ctx.restore();
      });

      const slots = RL.Tracks.gridSlots(geom, draft.width, 12);
      slots.forEach((s, n) => {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.h);
        ctx.fillStyle = n === 0 ? 'rgba(255,224,59,0.9)' : 'rgba(255,255,255,0.35)';
        ctx.fillRect(-16, -8, 32, 16);
        ctx.restore();
      });
    }

    draft.decorations.forEach((d) => drawProp(ctx, d.t, d.x, d.y));

    if (report.crossings && report.crossings.length) {
      ctx.strokeStyle = '#ff3355';
      ctx.lineWidth = 8;
      ctx.globalAlpha = 0.9;
      report.crossings.forEach((c) => {
        ctx.beginPath(); ctx.moveTo(c.x1, c.y1); ctx.lineTo(c.x2, c.y2); ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    if (draft.pts.length) {
      ctx.beginPath();
      draft.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([8 / zoom, 6 / zoom]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    draft.pts.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p[0], p[1], (i === selected ? 16 : 12) / zoom, 0, 7);
      ctx.fillStyle = i === selected ? '#ff2ef0' : '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2 / zoom;
      ctx.strokeStyle = '#14101f';
      ctx.stroke();
      ctx.save();
      ctx.translate(p[0], p[1]);
      ctx.scale(1 / zoom, 1 / zoom);
      ctx.fillStyle = i === selected ? '#fff' : '#14101f';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), 0, 1);
      ctx.restore();
    });
    ctx.restore();
  }

  function update() { /* input is event-driven; the loop still calls this */ }

  function beginPrimary(e) {
    const s = eventScreen(e);
    const world = screenToWorld(s.x, s.y);
    const pi = hitPoint(s.x, s.y);
    const di = hitDeco(s.x, s.y);
    if (tool === 'erase') {
      if (pi >= 0) deleteAt(pi);
      else if (di >= 0) { pushUndo(); draft.decorations.splice(di, 1); geomDirty = true; refresh(); }
      return;
    }
    if (pi >= 0 && tool !== 'deco') {
      selected = pi;
      drag = { mode: 'point', index: pi, undoPushed: false };
      refreshStatus();
      return;
    }
    if (tool === 'deco') {
      if (di >= 0) { pushUndo(); draft.decorations.splice(di, 1); refresh(); return; }
      if (draft.decorations.length >= 80) { lastNote = '80 props is the limit'; refreshStatus(); return; }
      pushUndo();
      draft.decorations.push({ t: decoType, x: Math.round(clampCoord(world.x)), y: Math.round(clampCoord(world.y)) });
      geomDirty = true;
      refresh();
      return;
    }
    if (tool === 'place') {
      if (draft.pts.length >= 40) { lastNote = '40 waypoints is the limit'; refreshStatus(); return; }
      pushUndo();
      const idx = addPoint(world);
      drag = { mode: 'point', index: idx, undoPushed: true };
      revalidate();
      refresh();
      return;
    }
    drag = { mode: 'pan', sx: s.x, sy: s.y, camx: cam.x, camy: cam.y };
  }

  function moveDrag(e) {
    if (!drag) return;
    const s = eventScreen(e);
    if (drag.mode === 'pan') {
      cam.x = drag.camx - (s.x - drag.sx) / zoom;
      cam.y = drag.camy - (s.y - drag.sy) / zoom;
      return;
    }
    if (drag.mode === 'point') {
      if (!drag.undoPushed) { pushUndo(); drag.undoPushed = true; }
      const world = screenToWorld(s.x, s.y);
      draft.pts[drag.index] = [clampCoord(world.x), clampCoord(world.y)];
      selected = drag.index;
      geomDirty = true;
    }
  }

  function finishDrag() {
    if (drag && drag.mode === 'point' && draft && draft.pts[drag.index]) {
      const p = draft.pts[drag.index];
      draft.pts[drag.index] = [Math.round(p[0]), Math.round(p[1])];
      geomDirty = true;
    }
    drag = null;
    pinch = null;
    revalidate();
    refreshStatus();
    const u = document.getElementById('ed-undo');
    if (u) u.disabled = !undo.length;
  }

  function capturePinch() {
    const pts = Array.from(pointers.values());
    if (pts.length < 2) return null;
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    const mid = eventScreen({ clientX: (pts[0].x + pts[1].x) / 2, clientY: (pts[0].y + pts[1].y) / 2 });
    return { dist: dist, zoom: zoom, sx: mid.x, sy: mid.y };
  }

  function onPointerDown(e) {
    if (!draft || RL.Game.mode !== 'editor' || modalFlag) return;
    if (e.target !== canvas()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) {
      const s = eventScreen(e);
      drag = { mode: 'pan', sx: s.x, sy: s.y, camx: cam.x, camy: cam.y };
      try { canvas().setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas().setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (pointers.size >= 2) {
      // A second finger turns the gesture into a pinch. Drop a point the first finger just added.
      if (drag && drag.undoPushed && undo.length) {
        const s = JSON.parse(undo.pop());
        draft.pts = s.pts; draft.decorations = s.decorations;
        draft.width = s.width; draft.grass = s.grass; draft.theme = s.theme; draft.walls = s.walls;
        geomDirty = true;
      }
      drag = null;
      pinch = capturePinch();
      return;
    }
    beginPrimary(e);
  }
  function onPointerMove(e) {
    if (!draft || RL.Game.mode !== 'editor') return;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2 && pinch) {
      const next = capturePinch();
      if (!next) return;
      const factor = next.dist / pinch.dist;
      zoomAtScreen(pinch.sx, pinch.sy, pinch.zoom * factor);
      return;
    }
    if (drag) moveDrag(e);
  }
  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size >= 2) pinch = capturePinch();
    else pinch = null;
    if (pointers.size === 0) finishDrag();
  }

  function mount() {
    if (mounted) return;
    const c = canvas();
    if (!c) return;
    mounted = true;
    const root = document.createElement('div');
    root.id = 'editor-ui';
    const themes = Object.keys(RL.THEMES).map((id) => '<button type="button" class="ed-btn" data-theme="' + id + '" id="ed-theme-' + id + '">' + RL.THEMES[id].name + '</button>').join('');
    const decos = RL.Tracks.DECO_IDS.map((id) => '<button type="button" class="ed-btn ed-mini" data-deco="' + id + '">' + id + '</button>').join('');
    root.innerHTML =
      '<div class="ed-top ed-bar">' +
        '<input id="ed-name" maxlength="24" type="text" aria-label="Track name" autocomplete="off">' +
        '<div class="ed-themes">' + themes + '</div>' +
        '<label class="ed-slider">Width <input id="ed-width" type="range" min="90" max="210" step="2"> <b id="ed-width-v">140</b></label>' +
        '<label class="ed-slider">Grass <input id="ed-grass" type="range" min="0" max="140" step="2"> <b id="ed-grass-v">48</b></label>' +
        '<button type="button" id="ed-walls" class="ed-btn">Walls: ON</button>' +
        '<button type="button" id="ed-fit" class="ed-btn">Fit</button>' +
      '</div>' +
      '<div class="ed-tools ed-bar">' +
        '<button type="button" id="ed-move" class="ed-btn on">Move</button>' +
        '<button type="button" id="ed-place" class="ed-btn">Place</button>' +
        '<button type="button" id="ed-erase" class="ed-btn">Erase</button>' +
        '<button type="button" id="ed-deco" class="ed-btn">Props</button>' +
        '<div id="ed-deco-types">' + decos + '</div>' +
        '<button type="button" id="ed-scatter" class="ed-btn">Reseed</button>' +
        '<button type="button" id="ed-undo" class="ed-btn" disabled>Undo</button>' +
        '<button type="button" id="ed-redo" class="ed-btn" disabled>Redo</button>' +
      '</div>' +
      '<div class="ed-actions ed-bar">' +
        '<button type="button" id="ed-new" class="ed-btn">New</button>' +
        '<button type="button" id="ed-open" class="ed-btn">Open</button>' +
        '<button type="button" id="ed-save" class="ed-btn primary">Save</button>' +
        '<button type="button" id="ed-test" class="ed-btn">Test drive</button>' +
        '<button type="button" id="ed-share" class="ed-btn">Share</button>' +
        '<button type="button" id="ed-publish" class="ed-btn">Publish</button>' +
        '<button type="button" id="ed-export" class="ed-btn">Export</button>' +
        '<button type="button" id="ed-import" class="ed-btn">Import</button>' +
        '<button type="button" id="ed-exit" class="ed-btn">Exit</button>' +
        '<input id="ed-file" type="file" accept="application/json,.json" hidden>' +
      '</div>' +
      '<div id="ed-status" class="ed-status"></div>' +
      '<div id="ed-modal" class="ed-modal" hidden><div class="ed-modal-card" id="ed-modal-card"></div></div>';
    document.body.appendChild(root);

    document.getElementById('ed-name').addEventListener('input', (e) => {
      draft.name = e.target.value.slice(0, 24);
      refreshStatus();
    });
    root.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => {
      pushUndo();
      draft.theme = b.dataset.theme;
      const prefer = RL.Tracks.THEME_DECO[draft.theme] || [];
      if (prefer.length && prefer.indexOf(decoType) < 0) decoType = prefer[0];
      geomDirty = true;
      refresh();
    }));
    const width = document.getElementById('ed-width');
    const grass = document.getElementById('ed-grass');
    width.addEventListener('pointerdown', () => pushUndo());
    grass.addEventListener('pointerdown', () => pushUndo());
    width.addEventListener('input', () => { draft.width = Number(width.value); geomDirty = true; refreshStatus(); });
    grass.addEventListener('input', () => { draft.grass = Number(grass.value); geomDirty = true; refreshStatus(); });
    document.getElementById('ed-walls').addEventListener('click', () => { pushUndo(); draft.walls = !draft.walls; geomDirty = true; refresh(); });
    document.getElementById('ed-fit').addEventListener('click', () => fit());
    document.getElementById('ed-move').addEventListener('click', () => setTool('move'));
    document.getElementById('ed-place').addEventListener('click', () => setTool('place'));
    document.getElementById('ed-erase').addEventListener('click', () => setTool('erase'));
    document.getElementById('ed-deco').addEventListener('click', () => setTool('deco'));
    root.querySelectorAll('[data-deco]').forEach((b) => b.addEventListener('click', () => { decoType = b.dataset.deco; setTool('deco'); }));
    document.getElementById('ed-scatter').addEventListener('click', () => {
      pushUndo();
      draft.decorations = RL.Tracks.scatter(draft, 28, (Math.random() * 1e9) | 0);
      lastNote = draft.decorations.length + ' props placed outside the walls';
      refresh();
    });
    document.getElementById('ed-undo').addEventListener('click', undoOnce);
    document.getElementById('ed-redo').addEventListener('click', redoOnce);
    document.getElementById('ed-new').addEventListener('click', newTrack);
    document.getElementById('ed-open').addEventListener('click', showLibrary);
    document.getElementById('ed-save').addEventListener('click', saveTrack);
    document.getElementById('ed-test').addEventListener('click', testDrive);
    document.getElementById('ed-share').addEventListener('click', showShare);
    document.getElementById('ed-publish').addEventListener('click', showPublish);
    document.getElementById('ed-export').addEventListener('click', () => { try { RL.Tracks.download(draft); } catch (e) { lastNote = 'Export failed'; refreshStatus(); } });
    document.getElementById('ed-import').addEventListener('click', () => document.getElementById('ed-file').click());
    document.getElementById('ed-exit').addEventListener('click', exitEditor);
    document.getElementById('ed-file').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const def = RL.Tracks.fromJSON(String(reader.result || ''));
          lastNote = 'Imported — Save to keep it on this device';
          loadIntoEditor(def, false);
          if (RL.UI) RL.UI.toast('Imported ' + def.name, '#2ee6ff');
        } catch (ex) {
          lastNote = ex.message || 'Could not import that file';
          refreshStatus();
          if (RL.UI) RL.UI.toast(lastNote, '#ff3b6b');
        }
      };
      reader.readAsText(f);
    });
    document.getElementById('ed-modal').addEventListener('click', (e) => { if (e.target.id === 'ed-modal') hideModal(); });
    document.getElementById('ed-modal-card').addEventListener('click', onModalClick);

    c.addEventListener('pointerdown', onPointerDown);
    c.addEventListener('pointermove', onPointerMove);
    c.addEventListener('pointerup', onPointerUp);
    c.addEventListener('pointercancel', onPointerUp);
    c.addEventListener('wheel', (e) => {
      if (!draft || RL.Game.mode !== 'editor' || modalFlag) return;
      e.preventDefault();
      const s = eventScreen(e);
      zoomAtScreen(s.x, s.y, zoom * (e.deltaY > 0 ? 0.9 : 1.1));
    }, { passive: false });
    c.addEventListener('contextmenu', (e) => { if (RL.Game.mode === 'editor') e.preventDefault(); });
    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (!draft || RL.Game.mode !== 'editor') return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (e.code === 'Escape') { document.activeElement.blur(); e.preventDefault(); }
      return;
    }
    if (modalFlag) {
      if (e.code === 'Escape') { hideModal(); e.preventDefault(); }
      return;
    }
    if (e.code === 'Escape') { e.preventDefault(); exitEditor(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redoOnce(); else undoOnce(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); redoOnce(); return; }
    if (e.code === 'Delete' || e.code === 'Backspace') {
      if (selected >= 0) { e.preventDefault(); deleteSelected(); }
      return;
    }
    const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.code];
    if (nudge && selected >= 0) {
      e.preventDefault();
      if (!e.repeat) pushUndo();
      const step = e.shiftKey ? 20 : 6;
      const p = draft.pts[selected];
      draft.pts[selected] = [clampCoord(p[0] + nudge[0] * step), clampCoord(p[1] + nudge[1] * step)];
      geomDirty = true;
      revalidate();
      refreshStatus();
      return;
    }
    const toolKey = { Digit1: 'move', Digit2: 'place', Digit3: 'erase', Digit4: 'deco' }[e.code];
    if (toolKey) { e.preventDefault(); setTool(toolKey); }
  }

  return {
    open: open, openDraft: openDraft, exit: exitEditor, resumeAfterTest: resumeAfterTest,
    setTool: setTool, project: project, update: update, draw: draw,
    get draft() { return draft; },
    get report() { return report; }
  };
})();
