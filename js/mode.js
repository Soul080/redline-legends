/* mode.js — one career, two cities. F3, the title button, Settings, and the
   corner button all switch the 2D canvas and the 3D city. The last choice is
   stored in the shared settings slot. WebGL failure stays on the 2D city. */
RL.Mode = (function () {
  let framePromise = null;

  function webglOk() {
    if (window.__RL_FORCE_NO_WEBGL) return false;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return !!gl;
    } catch (e) {
      return false;
    }
  }

  function current() {
    return RL.settings && RL.settings.view === '3d' ? '3d' : '2d';
  }

  function frameEl() {
    return document.getElementById('view3d');
  }

  function api(frame) {
    try { return frame && frame.contentWindow && frame.contentWindow.__RL3; }
    catch (e) { return null; }
  }

  function note(text) {
    const el = document.getElementById('view-note');
    if (el) {
      el.hidden = !text;
      el.textContent = text || '';
    }
    if (text && RL.UI && RL.UI.toast) RL.UI.toast(text, '#ffe03b');
  }

  function paint() {
    const view = current();
    const titleBtn = document.getElementById('btn-view');
    if (titleBtn) titleBtn.textContent = view === '3d' ? 'Switch to 2D' : 'Switch to 3D';
    const fab = document.getElementById('mode-fab');
    if (fab) fab.textContent = view === '3d' ? '2D' : '3D';
    document.body.classList.toggle('view-3d', view === '3d');
  }

  function remember(view) {
    RL.settings.view = view === '3d' ? '3d' : '2d';
    RL.saveSettings();
    paint();
  }

  function armFrame() {
    const frame = frameEl();
    if (!frame) return Promise.resolve(null);
    if (frame.dataset.booted === '1' && api(frame)) return Promise.resolve(frame);
    if (framePromise) return framePromise;
    framePromise = new Promise((resolve) => {
      frame.addEventListener('load', () => {
        frame.dataset.booted = '1';
        resolve(frame);
      }, { once: true });
      frame.src = '3d/index.html';
    });
    return framePromise;
  }

  function flush2d() {
    if (RL.Game && RL.Game.state) RL.Game.save();
  }

  function show3d() {
    const frame = frameEl();
    if (!frame) return;
    frame.hidden = false;
    document.body.classList.add('view-3d');
    const playing = !!(RL.Game && RL.Game.state && RL.Game.mode && RL.Game.mode !== 'title');
    if (RL.Audio && RL.Audio.stopMusic) RL.Audio.stopMusic();
    armFrame().then((fr) => {
      const live = api(fr);
      if (!live) {
        fallback('The 3D city did not start, so this session stays in 2D.');
        return;
      }
      if (live.freeze) live.freeze(false);
      if (playing && live.resumeShared) live.resumeShared();
      try { fr.contentWindow.focus(); } catch (e) { /* the iframe can still be clicked */ }
    }).catch(() => fallback('The 3D city did not start, so this session stays in 2D.'));
  }

  function show2d() {
    const frame = frameEl();
    const live = api(frame);
    const wasPlaying = !!(live && live.playing && live.playing());
    if (live && live.flush) live.flush();
    if (live && live.freeze) live.freeze(true);
    if (frame) frame.hidden = true;
    document.body.classList.remove('view-3d');
    const keepPlaying = wasPlaying || (RL.Game && RL.Game.state && RL.Game.mode !== 'title');
    if (keepPlaying && RL.Game && RL.Game.load()) {
      if (RL.Race && RL.Race.stop) RL.Race.stop();
      RL.Game.mode = 'hub';
      if (RL.Hub && RL.Hub.enter) RL.Hub.enter();
      if (RL.UI && RL.UI.setMode) RL.UI.setMode('hub');
      if (RL.Audio && RL.Audio.startMusic) RL.Audio.startMusic('hub');
    }
  }

  function fallback(text) {
    remember('2d');
    const frame = frameEl();
    if (frame) frame.hidden = true;
    document.body.classList.remove('view-3d');
    note(text);
  }

  function apply(view) {
    if (view === '3d') {
      if (!webglOk()) {
        fallback('WebGL is not available on this device, so Redline Legends stays in 2D.');
        return;
      }
      note('');
      flush2d();
      remember('3d');
      show3d();
      return;
    }
    show2d();
    remember('2d');
  }

  function toggle() {
    apply(current() === '3d' ? '2d' : '3d');
  }

  function boot() {
    if (!RL.settings.view) RL.settings.view = '2d';
    paint();
    const fab = document.getElementById('mode-fab');
    if (fab) fab.addEventListener('click', () => { if (RL.Audio && RL.Audio.init) RL.Audio.init(); toggle(); });
    const titleBtn = document.getElementById('btn-view');
    if (titleBtn) titleBtn.addEventListener('click', () => { if (RL.Audio && RL.Audio.init) RL.Audio.init(); toggle(); });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'F3') return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      toggle();
    });
    window.addEventListener('message', (e) => {
      const frame = frameEl();
      if (!frame || e.source !== frame.contentWindow) return;
      if (!e.data || e.data.type !== 'rl-toggle-view') return;
      toggle();
    });
    if (current() === '3d') apply('3d');
  }

  return { boot, toggle, apply, webglOk, current };
})();
