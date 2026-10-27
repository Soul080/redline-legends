/* input.js - Unified keyboard + touch input. Game code reads RL.Input.down('up') etc.
   Keys are rebindable through the Settings menu (stored in RL.settings.keys). */
RL.DEFAULT_KEYS = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  drift: ['Space'], nitro: ['ShiftLeft', 'ShiftRight', 'KeyN'], action: ['KeyE', 'Enter'], pause: ['Escape', 'KeyP'],
  steal: ['KeyC'], enter: ['KeyF'], phone: ['KeyB'], summon: ['KeyV'], shift: ['KeyQ']
};
RL.ACTION_NAMES = { up: 'Accelerate / Up', down: 'Brake / Down', left: 'Steer Left', right: 'Steer Right', drift: 'Drift (handbrake)', nitro: 'Nitro', action: 'Interact / Confirm', pause: 'Pause / Menu', steal: 'Steal car / rob shop', enter: 'Enter car', phone: 'Phone', summon: 'Call car', shift: 'Drag shift' };

RL.Input = (function () {
  const keys = {}, pressed = {}, touch = {};
  let rebindCb = null;
  function bindings() { return (RL.settings && RL.settings.keys) || RL.DEFAULT_KEYS; }
  window.addEventListener('keydown', (e) => {
    RL.Audio.init();
    if (rebindCb) { e.preventDefault(); const cb = rebindCb; rebindCb = null; cb(e.code); return; }
    // Don't steal keys while typing in an input field
    if (e.target && e.target.tagName === 'INPUT') return;
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  /* Is an action currently held? */
  function actionKeys(action) {
    const saved = bindings();
    if (saved && saved[action] && saved[action].length) return saved[action];
    return (RL.DEFAULT_KEYS && RL.DEFAULT_KEYS[action]) || [];
  }
  function down(action) {
    if (touch[action]) return true;
    const b = actionKeys(action);
    for (const c of b) if (keys[c]) return true;
    return false;
  }
  /* Was an action pressed this frame (edge-triggered)? */
  function hit(action) {
    if (touch['_hit_' + action]) { touch['_hit_' + action] = false; return true; }
    const b = actionKeys(action);
    for (const c of b) if (pressed[c]) return true;
    return false;
  }
  function endFrame() { for (const k in pressed) delete pressed[k]; }
  function clear() { for (const k in keys) keys[k] = false; for (const k in touch) touch[k] = false; endFrame(); }

  /* Touch buttons: any element with data-touch="action" */
  function setupTouch() {
    document.querySelectorAll('[data-touch]').forEach((el) => {
      const a = el.dataset.touch;
      const on = (e) => { e.preventDefault(); RL.Audio.init(); if (!touch[a]) touch['_hit_' + a] = true; touch[a] = true; el.classList.add('on'); };
      const off = (e) => { e.preventDefault(); touch[a] = false; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
      el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off);
    });
  }
  function rebind(cb) { rebindCb = cb; }
  function keyName(code) { const ar = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }; if (ar[code]) return ar[code]; return code.replace('Key', '').replace('Arrow', '').replace('Left', ' L').replace('Right', ' R'); }
  return { down, hit, endFrame, clear, setupTouch, rebind, keyName, keys, touch };
})();
