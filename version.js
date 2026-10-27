/* The only release version. The main menu and the zip builders read RL_VERSION.
   Do not copy this string into another file. */
var RL_VERSION = '1.2.3';

function RL_applyVersion() {
  var el = typeof document !== 'undefined' && document.getElementById('game-version');
  if (el) el.textContent = 'v' + RL_VERSION;
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', RL_applyVersion);
  else RL_applyVersion();
}

if (typeof module !== 'undefined' && module.exports) module.exports = RL_VERSION;
