/* freeplay.js - Custom Race / Free Play. Any built-in or saved circuit, with
   laps, AI count, difficulty, weather, time, damage, nitro, catch-up, class
   limits, reverse, and collisions. Track list is RL.Tracks.lobbyChoices(), the
   same list multiplayer lobbies should use. */
window.RL = window.RL || {};

RL.FreePlay = (function () {
  const DIFFICULTIES = [
    { name: 'Rookie', skill: 0.72, bonus: -10 },
    { name: 'Club', skill: 0.84, bonus: 0 },
    { name: 'Pro', skill: 0.95, bonus: 10 },
    { name: 'Elite', skill: 1.05, bonus: 20 },
    { name: 'Legend', skill: 1.14, bonus: 30 }
  ];
  const state = {
    track: 'oval',
    laps: 3,
    aiCount: 5,
    difficulty: 2,
    weather: 'clear',
    time: 'day',
    damage: true,
    nitro: true,
    catchup: true,
    collision: true,
    reverse: false,
    classes: []
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function choices() { return RL.Tracks.lobbyChoices(); }
  function selected() {
    const list = choices();
    return list.find((t) => t.id === state.track) || list[0] || null;
  }

  function open() {
    const list = choices();
    if (!list.some((t) => t.id === state.track) && list[0]) state.track = list[0].id;
    RL.UI.open(view());
  }

  function view() {
    const v = {
      title: '🏁 Free Play',
      cls: 'wide fp',
      render: () => {
        const G = RL.Game, car = G.currentCar(), def = G.carDef(car.id);
        const list = choices();
        const cur = list.find((t) => t.id === state.track) || list[0];
        if (cur) state.track = cur.id;
        const btn = (act, arg, label, on, dis) => '<button type="button" data-act="' + act + '"' + (arg != null ? ' data-arg="' + esc(arg) + '"' : '') +
          (on ? ' class="on"' : '') + (dis ? ' disabled' : '') + '>' + label + '</button>';
        const group = (title, items) => '<h3>' + title + '</h3><div class="fp-tracks">' + (items || '<span class="dim">None yet — build one in the Track Editor.</span>') + '</div>';
        const builtin = list.filter((t) => !t.custom).map((t) => btn('pick', t.id, esc(t.name), t.id === state.track)).join('');
        const custom = list.filter((t) => t.custom).map((t) => btn('pick', t.id, esc(t.name) + (t.raceable ? '' : ' ✕'), t.id === state.track)).join('');
        let h = '<p>Driving <b>' + esc(def.name) + '</b> <span class="small">(' + esc(def.cls) + ')</span>. Custom tracks saved on this device show up here and in multiplayer lobbies.</p>';
        h += group('Circuits', builtin);
        h += group('My tracks', custom);
        h += '<div class="row"><button type="button" data-act="editor">Track Editor ✎</button>' +
          (cur && cur.custom ? '<button type="button" data-act="edittrack">Edit this track</button>' : '') + '</div>';
        h += '<h3>Race settings</h3>';
        h += stepper('laps', 'Laps', state.laps, 1, 10);
        h += stepper('ai', 'AI cars', state.aiCount, 0, 11);
        h += '<div class="fp-line"><span>Difficulty</span>' + DIFFICULTIES.map((d, i) => btn('diff', String(i), d.name, state.difficulty === i, state.aiCount === 0)).join('') + '</div>';
        h += '<div class="fp-line"><span>Weather</span>' + Object.keys(RL.WEATHER).map((id) => btn('weather', id, RL.WEATHER[id].icon + ' ' + RL.WEATHER[id].name, state.weather === id)).join('') + '</div>';
        h += '<div class="fp-line"><span>Time</span>' + Object.keys(RL.TIMES).map((id) => btn('time', id, RL.TIMES[id].name, state.time === id)).join('') + '</div>';
        h += '<div class="fp-line"><span>Rules</span>' +
          btn('tog', 'damage', 'Damage ' + (state.damage ? 'ON' : 'OFF'), state.damage) +
          btn('tog', 'nitro', 'Nitro ' + (state.nitro ? 'ON' : 'OFF'), state.nitro) +
          btn('tog', 'catchup', 'Catch-up ' + (state.catchup ? 'ON' : 'OFF'), state.catchup) +
          btn('tog', 'collision', 'Collision ' + (state.collision ? 'ON' : 'OFF'), state.collision) +
          btn('tog', 'reverse', 'Reverse ' + (state.reverse ? 'ON' : 'OFF'), state.reverse) + '</div>';
        h += '<div class="fp-line"><span>Classes</span>' + btn('allcls', null, 'All', state.classes.length === 0) +
          RL.Tracks.carClasses().map((c) => btn('cls', c, esc(c), state.classes.indexOf(c) >= 0)).join('') + '</div>';
        const blocked = cur && !cur.raceable;
        const classBlocked = state.classes.length > 0 && state.classes.indexOf(def.cls) < 0;
        if (blocked) h += '<p class="note" style="color:#ff8a8a">This circuit is not a closed, drivable loop yet. Open it in the editor to fix it.</p>';
        if (classBlocked) h += '<p class="note" style="color:#ff8a8a">Your car is a ' + esc(def.cls) + '. Allow that class, or pick another car in the Garage.</p>';
        h += '<p class="small">' + summary(cur) + '</p>';
        h += '<div class="row"><button type="button" class="primary" data-act="go"' + (blocked ? ' disabled' : '') + '>Start custom race ▶</button></div>';
        return h;
      },
      acts: {
        pick: (id) => { state.track = id; },
        editor: () => { RL.UI.closeAll(); RL.Editor.open(); },
        edittrack: () => { const id = state.track; RL.UI.closeAll(); RL.Editor.open(id); },
        laps: (d) => { state.laps = RL.clamp(state.laps + Number(d), 1, 10); },
        ai: (d) => { state.aiCount = RL.clamp(state.aiCount + Number(d), 0, 11); },
        diff: (i) => { state.difficulty = RL.clamp(Number(i), 0, DIFFICULTIES.length - 1); },
        weather: (id) => { if (RL.WEATHER[id]) state.weather = id; },
        time: (id) => { if (RL.TIMES[id]) state.time = id; },
        tog: (key) => { if (key in state) state[key] = !state[key]; },
        allcls: () => { state.classes = []; },
        cls: (c) => {
          const i = state.classes.indexOf(c);
          if (i >= 0) state.classes.splice(i, 1);
          else state.classes.push(c);
        },
        go: () => start()
      }
    };
    return v;
  }

  function stepper(act, label, value, min, max) {
    return '<div class="fp-line"><span>' + label + '</span><button type="button" data-act="' + act + '" data-arg="-1"' + (value <= min ? ' disabled' : '') + '>−</button><b class="fp-num">' + value + '</b><button type="button" data-act="' + act + '" data-arg="1"' + (value >= max ? ' disabled' : '') + '>+</button></div>';
  }

  function summary(cur) {
    if (!cur) return 'No circuits available.';
    const diff = DIFFICULTIES[state.difficulty];
    const bits = [
      cur.name + (cur.custom ? ' (custom)' : ''),
      state.laps + ' lap' + (state.laps === 1 ? '' : 's'),
      state.aiCount ? (state.aiCount + ' AI · ' + diff.name) : 'solo',
      RL.WEATHER[state.weather].name,
      RL.TIMES[state.time].name,
      state.reverse ? 'reverse' : 'forward',
      state.classes.length ? state.classes.join(', ') : 'all classes'
    ];
    return bits.join(' · ');
  }

  function start() {
    const cur = selected();
    if (!cur) return;
    if (!cur.raceable) { RL.UI.toast('That track is not closed and drivable yet'); RL.Audio.play('error'); return; }
    const G = RL.Game, car = G.currentCar(), def = G.carDef(car.id);
    if (state.classes.length && state.classes.indexOf(def.cls) < 0) {
      RL.UI.toast('Your ' + def.name + ' is a ' + def.cls + '. Allow that class or switch cars.');
      RL.Audio.play('error');
      return;
    }
    const custom = cur.custom ? RL.Tracks.resolve(cur.id) : null;
    G.startRace({
      kind: 'custom',
      track: cur.id,
      trackDef: custom || undefined,
      laps: state.laps,
      aiCount: state.aiCount,
      difficulty: state.difficulty,
      weather: state.weather,
      time: state.time,
      damage: state.damage,
      nitro: state.nitro,
      catchup: state.catchup,
      collision: state.collision,
      reverse: state.reverse,
      classes: state.classes.slice(),
      league: G.state.league,
      title: (state.reverse ? 'Reverse · ' : '') + cur.name
    });
  }

  return {
    open: open,
    start: start,
    DIFFICULTIES: DIFFICULTIES,
    trackOptions: function () { return choices(); },
    get settings() { return state; }
  };
})();
