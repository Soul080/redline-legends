/* net.js - Online multiplayer for Redline Legends.
   Static hosts (itch.io, any web server) and the Electron build share this
   path: there is no game server to deploy. Browsers talk peer-to-peer with
   WebRTC. A free public PeerJS broker (0.peerjs.com) only introduces them;
   the script is loaded from a CDN the first time someone opens Multiplayer,
   so single-player never touches the network and still runs fully offline.

   If the CDN or the broker can't be reached, the room falls back to a
   same-browser BroadcastChannel. Friends on one computer can still race;
   friends across the internet need the broker. Override the broker from a
   desktop build with window.RL_PEER_CONFIG before the lobby opens.

   The host simulates AI and owns the clock, countdown, and results. Each
   human simulates their own car (so steering stays instant) and streams
   pose snapshots. Everyone else draws those cars from a short interpolation
   buffer. Empty grid slots are AI, always up to 6 cars. */
RL.Net = (function () {
  const GRID = 6;
  const INTERP_MS = 90;          // render remotes slightly in the past so snapshots overlap
  const SEND_EVERY = 0.05;       // 20 Hz pose stream
  const RACE_CAP = 300;          // host ends a stuck race so nobody waits forever
  const CDNS = [
    'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
    'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'
  ];
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const CHANNEL_NAME = 'redline-legends-mp-v1';

  // Resolved on first use. RL.uid lives in game.js, which may load after this file.
  let _pid = '';
  function me() {
    if (_pid) return _pid;
    try {
      const prev = sessionStorage.getItem('redline_mp_pid');
      if (prev) return (_pid = prev);
    } catch (e) { /* storage blocked */ }
    _pid = RL.uid();
    try { sessionStorage.setItem('redline_mp_pid', _pid); } catch (e) { /* ignore */ }
    return _pid;
  }

  let epoch = 0;                 // bumped on disconnect so in-flight dials abort
  let phase = 'idle';            // idle | connecting | lobby | racing | results
  let isHost = false;
  let roomCode = '';
  let transport = '';            // 'peerjs' once the broker accepts the room, else 'local'
  let peerUp = false;
  let roster = [];               // humans only: { pid, name, color, phys, nitro, host }
  let setup = null;
  let error = '';
  let busy = false;
  let panelOpen = false;
  let teardown = false;
  let linkDead = false;
  let lastError = '';
  let channel = null;
  let hostPeer = null;
  let guestPeer = null;
  let uplink = null;             // guest -> host link
  let joinWait = null;
  const links = new Map();      // guest pid -> link (host only)
  const livePeers = new Set();
  const stats = { peerMsgs: 0, localMsgs: 0 };

  /* Race-stream cursors. Reset every time a race arms. */
  let worldSeq = 0, selfSeq = 0, sendAcc = 1;
  let resultsSent = false, humanDoneAt = 0, firstFinishAt = 0, finishedNote = false;
  let clock = { t: 0, at: 0 };

  function guardErr(e) { lastError = (e && e.stack) ? String(e.stack) : String(e); }
  function guard(fn) {
    return function () {
      try { return fn.apply(this, arguments); }
      catch (e) { guardErr(e); }
    };
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function makeCode() {
    let s = '';
    for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s;
  }
  function sanitize(code) { return String(code || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 4); }
  function peerId(code) { return 'redline' + code; }
  function cycle(arr, cur) {
    const i = Math.max(0, arr.indexOf(cur));
    return arr[(i + 1) % arr.length];
  }

  /* ---------- PeerJS (loaded on demand) ---------- */
  let peerLoader = null;
  function loadPeer() {
    if (window.Peer) return Promise.resolve(window.Peer);
    if (peerLoader) return peerLoader;
    peerLoader = (async () => {
      for (let i = 0; i < CDNS.length; i++) {
        const ok = await injectScript(CDNS[i]);
        if (ok && window.Peer) return window.Peer;
      }
      return null;
    })();
    return peerLoader;
  }
  function injectScript(url) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      const s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = () => done(true);
      s.onerror = () => done(false);
      document.head.appendChild(s);
      setTimeout(() => done(false), 8000);
    });
  }
  /* Public broker + STUN. A desktop build may replace this via RL_PEER_CONFIG. */
  function peerConfig() {
    const extra = window.RL_PEER_CONFIG || {};
    const ice = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ];
    const base = {
      debug: extra.debug == null ? 0 : extra.debug,
      secure: true, host: '0.peerjs.com', port: 443, path: '/', key: 'peerjs',
      config: { iceServers: ice }
    };
    return Object.assign(base, extra, { config: Object.assign({}, base.config, extra.config || {}) });
  }
  function destroyPeer(p) { if (!p) return; try { p.destroy(); } catch (e) { /* already gone */ } }

  /* ---------- Same-browser fallback (no broker) ---------- */
  function ensureChannel() {
    if (channel || typeof BroadcastChannel !== 'function') return;
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (ev) => onLocalMessage(ev.data);
  }
  function postLocal(payload, to) {
    if (!channel || !roomCode) return;
    try { channel.postMessage({ v: 1, room: roomCode, from: me(), to: to, payload: payload }); }
    catch (e) { guardErr(e); }
  }
  function onLocalMessage(m) {
    if (!m || m.v !== 1 || !roomCode || m.room !== roomCode || m.from === me()) return;
    if (m.to !== me() && m.to !== '*' && !(isHost && m.to === 'host')) return;
    handle(m.payload, 'local', null);
  }

  function makeLocalLink(guestPid) {
    return {
      kind: 'local', pid: guestPid, dead: false,
      send(payload) { if (!this.dead) postLocal(payload, guestPid); },
      close() { this.dead = true; }
    };
  }
  function makePeerLink(guestPid, conn) {
    return {
      kind: 'peer', pid: guestPid, conn: conn, dead: false,
      send(payload) {
        if (this.dead) return;
        try { if (conn && conn.open) conn.send(payload); } catch (e) { guardErr(e); }
      },
      close() { this.dead = true; try { if (conn) conn.close(); } catch (e) { /* closed */ } }
    };
  }
  /* Prefer the WebRTC link once it exists; keep the local one until then. */
  function attachLink(guestPid, link) {
    const prev = links.get(guestPid);
    if (prev && !prev.dead && prev.kind === 'peer' && link.kind === 'local') return prev;
    if (prev && prev !== link) prev.dead = true;
    links.set(guestPid, link);
    return link;
  }
  function broadcast(payload) {
    links.forEach((link) => { if (!link.dead) link.send(payload); });
  }
  function sendToHost(payload) {
    if (uplink && !uplink.dead && uplink.kind === 'peer' && uplink.conn && uplink.conn.open) uplink.send(payload);
    else postLocal(payload, 'host');
  }

  function myProfile() {
    const G = RL.Game, car = G.currentCar();
    return {
      pid: me(),
      name: String(G.state.name || 'Racer').slice(0, 14),
      color: G.carColor(car),
      phys: RL.Race.physFromStats(G.carStats(car)),
      nitro: RL.hasPerk('double_tank') ? 100 : 30,
      host: !!isHost
    };
  }
  function cleanProfile(p) {
    if (!p || typeof p.pid !== 'string' || !p.pid || p.pid.length > 40) return null;
    const src = p.phys || {}, phys = {};
    ['maxSpeed', 'accel', 'turn', 'grip', 'nitroPower', 'dmgMult'].forEach((k) => {
      const n = Number(src[k]); phys[k] = Number.isFinite(n) ? n : 0;
    });
    phys.maxSpeed = RL.clamp(phys.maxSpeed, 50, 800);
    phys.accel = RL.clamp(phys.accel, 20, 800);
    phys.turn = RL.clamp(phys.turn, 0.5, 8);
    phys.grip = RL.clamp(phys.grip, 0.5, 30);
    phys.nitroPower = RL.clamp(phys.nitroPower, 1, 3);
    phys.dmgMult = RL.clamp(phys.dmgMult, 0.2, 3);
    const color = typeof p.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(p.color) ? p.color : '#2ee6ff';
    return {
      pid: p.pid.slice(0, 40),
      name: String(p.name || 'Racer').replace(/[<>]/g, '').slice(0, 14) || 'Racer',
      color: color, phys: phys, nitro: RL.clamp(Number(p.nitro) || 30, 0, 100), host: false
    };
  }
  /* Built-in circuits the career has unlocked, plus saved custom tracks and
     community listings currently on screen. Custom defs travel with the race. */
  function unlockedTracks() {
    const G = RL.Game, s = G.state, out = [], seen = {};
    const add = (key, def, custom) => {
      if (!key || seen[key] || !def || !def.pts || def.pts.length < 3) return;
      if (!def.weather || !def.times) return;
      seen[key] = 1;
      out.push({ key: String(key), name: def.name || key, custom: !!custom, def: def });
    };
    const addBuilt = (key) => { if (key && RL.TRACKS[key]) add(key, RL.TRACKS[key], !!RL.TRACKS[key].custom); };
    for (let i = 1; i <= s.league; i++) G.leagueData(i).races.forEach((r) => addBuilt(r.track));
    addBuilt('oval');
    if (RL.Tracks && RL.Tracks.lobbyChoices) {
      RL.Tracks.lobbyChoices().forEach((t) => {
        if (!t.custom || !t.raceable || !RL.TRACKS[t.id]) return;
        add(t.id, RL.TRACKS[t.id], true);
      });
    }
    if (RL.Community && RL.Community.lobbyTracks) {
      RL.Community.lobbyTracks().forEach((t) => add(t.key, t.def, true));
    }
    return out;
  }
  function trackByKey(key) {
    const row = unlockedTracks().find((t) => t.key === key);
    if (row) return row;
    if (key && RL.TRACKS[key]) return { key: key, name: RL.TRACKS[key].name, custom: !!RL.TRACKS[key].custom, def: RL.TRACKS[key] };
    return null;
  }
  function defaultSetup() {
    const tracks = unlockedTracks();
    const row = tracks[0] || trackByKey('docklands');
    const def = row.def;
    return { track: row.key, trackName: def.name, custom: !!row.custom, reverse: false, weather: def.weather[0], time: def.times[0], laps: 3 };
  }
  function lobbyPacket() {
    return {
      players: roster.map((p) => ({ pid: p.pid, name: p.name, color: p.color, phys: p.phys, nitro: p.nitro, host: !!p.host })),
      setup: setup, transport: transport, code: roomCode
    };
  }
  function refreshIfLobby() {
    if (panelOpen && (phase === 'idle' || phase === 'connecting' || phase === 'lobby')) {
      try { RL.UI.refresh(); } catch (e) { guardErr(e); }
    }
  }

  /* ---------- Dialing ---------- */
  function bindHostPeer(code, gen) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      loadPeer().then((Peer) => {
        if (!Peer || gen !== epoch) return done('fail');
        let peer;
        try { peer = new Peer(peerId(code), peerConfig()); }
        catch (e) { guardErr(e); return done('fail'); }
        const timer = setTimeout(() => { destroyPeer(peer); done('fail'); }, 6000);
        peer.on('open', () => {
          clearTimeout(timer);
          if (gen !== epoch) { destroyPeer(peer); return done('fail'); }
          hostPeer = peer;
          livePeers.add(peer);
          peer.on('connection', (conn) => acceptPeerConn(conn));
          peer.on('disconnected', () => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) { /* broker blip */ } });
          done('ok');
        });
        peer.on('error', (err) => {
          if (settled) return; // later socket noise should not tear down a live room
          clearTimeout(timer);
          destroyPeer(peer);
          done(err && err.type === 'unavailable-id' ? 'taken' : 'fail');
        });
      }).catch((e) => { guardErr(e); done('fail'); });
    });
  }
  function acceptPeerConn(conn) {
    livePeers.add(conn);
    conn.on('data', (d) => handle(d, 'peer', conn));
    conn.on('close', () => { livePeers.delete(conn); onPeerClosed(conn); });
    conn.on('error', () => {});
  }
  function onPeerClosed(conn) {
    if (teardown) return;
    let who = null;
    links.forEach((link, id) => { if (link.conn === conn) who = id; });
    if (who) onGuestBye(who);
    if (!isHost && uplink && uplink.conn === conn) onHostLost();
  }
  async function createRoom(gen) {
    roster = [Object.assign(myProfile(), { host: true })];
    setup = defaultSetup();
    ensureChannel();
    let code = null;
    peerUp = false;
    for (let i = 0; i < 4 && gen === epoch; i++) {
      const attempt = makeCode();
      const result = await bindHostPeer(attempt, gen);
      if (gen !== epoch) return null;
      if (result === 'ok') { code = attempt; peerUp = true; break; }
      if (result === 'fail') break; // broker down: one timeout is enough, then go local
    }
    if (gen !== epoch) return null;
    if (!code) code = makeCode();
    roomCode = code;
    transport = peerUp ? 'peerjs' : 'local';
    return code;
  }
  function tryPeerGuest(code, gen) {
    loadPeer().then((Peer) => {
      if (!Peer || gen !== epoch) return;
      let peer;
      try { peer = new Peer(peerConfig()); }
      catch (e) { guardErr(e); return; }
      guestPeer = peer;
      const timer = setTimeout(() => { if (guestPeer === peer && !(uplink && uplink.conn && uplink.conn.open)) destroyPeer(peer); }, 9000);
      peer.on('open', () => {
        if (gen !== epoch) { destroyPeer(peer); return; }
        const conn = peer.connect(peerId(code), { reliable: true, serialization: 'json' });
        const giveUp = setTimeout(() => { try { conn.close(); } catch (e) { /* no answer */ } }, 6000);
        conn.on('open', () => {
          clearTimeout(giveUp); clearTimeout(timer);
          if (gen !== epoch) { try { conn.close(); } catch (e) { /* aborted */ } return; }
          uplink = makePeerLink('host', conn);
          peerUp = true;
          try { conn.send({ type: 'hello', profile: myProfile() }); } catch (e) { guardErr(e); }
        });
        conn.on('data', (d) => handle(d, 'peer', conn));
        conn.on('close', () => { if (!teardown && uplink && uplink.conn === conn) onHostLost(); });
        conn.on('error', () => {});
      });
      peer.on('error', () => { clearTimeout(timer); });
      peer.on('disconnected', () => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) { /* ignore */ } });
    }).catch((e) => guardErr(e));
  }
  function connectGuest(code, gen) {
    roomCode = code;
    ensureChannel();
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        joinWait = null;
        resolve(!!ok);
      };
      const timer = setTimeout(() => finish(phase === 'lobby'), 10000);
      joinWait = () => { clearTimeout(timer); finish(true); };
      postLocal({ type: 'hello', profile: myProfile() }, 'host');
      tryPeerGuest(code, gen);
    });
  }

  /* ---------- Messages ---------- */
  function handle(msg, via, conn) {
    try { handleMessage(msg, via, conn); }
    catch (e) { guardErr(e); }
  }
  function handleMessage(msg, via, conn) {
    if (!msg || typeof msg !== 'object') return;
    if (via === 'peer') stats.peerMsgs++;
    else stats.localMsgs++;
    if (msg.type === 'hello') return onHello(msg.profile, via, conn);
    if (msg.type === 'welcome' || msg.type === 'lobby') return onLobby(msg);
    if (msg.type === 'start') return onStart(msg);
    if (msg.type === 'world') return onWorld(msg);
    if (msg.type === 'snap') return onSnap(msg);
    if (msg.type === 'results') return applyResults(msg);
    if (msg.type === 'bye' && msg.host && !isHost) return onHostLost();
    if (msg.type === 'bye' && msg.pid && isHost) return onGuestBye(msg.pid);
    if (msg.type === 'full' && !isHost && phase !== 'lobby') error = 'That room is full (6 racers).';
    if (msg.type === 'closed' && !isHost && phase === 'connecting') error = 'That room has already started.';
  }
  function onHello(raw, via, conn) {
    if (!isHost || teardown) return;
    const replyLink = via === 'peer' && conn ? makePeerLink(raw && raw.pid, conn) : makeLocalLink(raw && raw.pid);
    const profile = cleanProfile(raw);
    if (!profile || profile.pid === me()) return;
    // ICE can finish after the lights go out. Upgrade the pipe for someone already in the field.
    if (phase !== 'lobby' && phase !== 'connecting') {
      if (phase === 'racing' && roster.some((p) => p.pid === profile.pid)) attachLink(profile.pid, replyLink);
      else replyLink.send({ type: 'closed' });
      return;
    }
    const known = roster.find((p) => p.pid === profile.pid);
    if (!known && roster.length >= GRID) { replyLink.send({ type: 'full' }); return; }
    const link = attachLink(profile.pid, replyLink);
    if (!known) roster.push(profile);
    else Object.assign(known, profile, { host: false });
    const packet = lobbyPacket();
    link.send(Object.assign({ type: 'welcome' }, packet));
    broadcast(Object.assign({ type: 'lobby' }, packet));
    refreshIfLobby();
  }
  function onLobby(msg) {
    if (isHost) return;
    const players = msg.players || [];
    if (!players.some((p) => p.pid === me())) return;
    roster = players;
    if (msg.setup) setup = msg.setup;
    if (msg.transport) transport = msg.transport;
    if (msg.code) roomCode = msg.code;
    if (phase === 'connecting' || phase === 'lobby') phase = 'lobby';
    if (joinWait) joinWait();
    refreshIfLobby();
  }
  function onGuestBye(guestPid) {
    if (teardown || !isHost) return;
    const link = links.get(guestPid);
    if (link) { link.dead = true; links.delete(guestPid); }
    if (phase === 'lobby' || phase === 'connecting') {
      roster = roster.filter((p) => p.pid !== guestPid);
      broadcast(Object.assign({ type: 'lobby' }, lobbyPacket()));
      refreshIfLobby();
    } else if (phase === 'racing') takeover(guestPid);
  }
  function takeover(guestPid) {
    const R = RL.Race.state;
    const car = R && R.cars.find((c) => c.netId === guestPid);
    if (!car || car.finished) return;
    // Host inherits the abandoned car so the rest of the field keeps racing.
    car.remote = false;
    car.isAI = true;
    car.ai = car.ai || { pers: 'clean', lane: 0, laneT: 0 };
    RL.UI.toast(car.name + ' dropped — AI took the wheel');
  }
  function onHostLost() {
    if (isHost || teardown || phase === 'idle') return;
    linkDead = true;
    if (phase === 'results') return; // let them read the board
    if (phase === 'racing') abortToHub('The host disconnected.');
    else {
      RL.UI.toast('The host closed the room.');
      disconnect();
      if (panelOpen) RL.UI.refresh();
    }
  }
  function onStart(msg) {
    if (isHost || !msg || !msg.cfg) return;
    if (msg.raceId && msg.raceId === onStart.seen) return;
    onStart.seen = msg.raceId || 0;
    armRace();
    phase = 'racing';
    panelOpen = false;
    RL.UI.closeAll();
    RL.Game.startRace(msg.cfg);
  }
  function onWorld(msg) {
    if (isHost || phase !== 'racing') return;
    // Arrival time, not the host's wall clock: machines don't share a clock.
    clock = { t: Number(msg.t) || 0, at: performance.now() };
    const cars = msg.cars || [];
    for (let i = 0; i < cars.length; i++) {
      const s = cars[i];
      if (!s || s.id === me()) continue; // never rubber-band our own car
      const c = carById(s.id);
      if (c) pushSample(c, s);
    }
  }
  function onSnap(msg) {
    if (!isHost || !msg.car) return;
    const c = carById(msg.car.id);
    if (c && c.remote) pushSample(c, msg.car);
  }

  /* ---------- Lobby UI ---------- */
  function renderLobby() {
    if (phase === 'connecting') {
      return '<p>Opening the room…</p><p class="small">Trying the free PeerJS broker. If it is blocked, this browser can still host a same-computer room.</p>';
    }
    if (phase === 'lobby') return renderRoom();
    return (error ? '<p style="color:#ff8a2e">' + esc(error) + '</p>' : '') +
      '<p>Race friends on any unlocked track. You drive your career car. AI fills the grid to 6.</p>' +
      '<div class="row"><button class="primary" data-act="host">Host a room</button></div>' +
      '<h3>Join a friend</h3>' +
      '<input id="room-code-input" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="Room code" style="text-transform:uppercase;letter-spacing:.3em;text-align:center">' +
      '<div class="row"><button data-act="join">Join</button></div>' +
      '<p class="small">Across the internet this uses WebRTC via the public PeerJS broker (no account). Offline, two tabs on this computer can still share a code.</p>';
  }
  function renderRoom() {
    const link = transport === 'peerjs'
      ? '<span class="net-dot"></span>Internet room — share the code with anyone'
      : '<span class="net-dot off"></span>Same-browser room — the public broker did not connect';
    let h = '<div class="room-code" id="room-code">' + esc(roomCode) + '</div>';
    h += '<p class="small" style="text-align:center">' + link + '</p>';
    h += '<div class="row" style="justify-content:center"><button data-act="copy">Copy code</button></div>';
    h += '<h3>Racers (' + roster.length + '/' + GRID + ')</h3>';
    h += roster.map((p) => '<div class="card"><div><span class="carchip" style="background:' + esc(p.color) + '"></span> <b>' + esc(p.name) + '</b>' +
      (p.host ? ' · host' : '') + (p.pid === me() ? ' · you' : '') + '</div></div>').join('');
    h += '<p class="small">Empty spots are filled with AI. At least 2 humans are required.</p>';
    h += '<h3>Track</h3>';
    if (isHost) {
      const tracks = unlockedTracks();
      h += '<div class="btns" style="flex-wrap:wrap;margin-bottom:8px">' + tracks.map((t) =>
        '<button data-act="track" data-arg="' + t.key + '"' + (setup.track === t.key ? ' class="primary"' : '') + '>' + esc(t.name) + '</button>').join('') + '</div>';
      const row = trackByKey(setup.track);
      const tr = row ? row.def : null;
      h += '<div class="row">';
      h += '<button data-act="weather">' + esc((RL.WEATHER[setup.weather] || RL.WEATHER.clear).icon + ' ' + (RL.WEATHER[setup.weather] || RL.WEATHER.clear).name) + '</button>';
      h += '<button data-act="time">' + esc((RL.TIMES[setup.time] || RL.TIMES.day).name) + '</button>';
      h += '<button data-act="reverse">' + (setup.reverse ? 'Reverse' : 'Forward') + '</button>';
      h += '<button data-act="laps" data-arg="-1">−</button><b>' + setup.laps + ' laps</b><button data-act="laps" data-arg="1">+</button>';
      h += '</div>';
      h += '<p class="small">' + esc(tr ? tr.name : setup.trackName || 'Track') + (row && row.custom ? ' · custom' : '') + ' · league tracks, saved circuits, and open community listings</p>';
      h += '<div class="row"><button class="primary" data-act="start"' + (roster.length < 2 ? ' disabled' : '') + '>Start race</button><button data-act="leave">Close room</button></div>';
    } else {
      h += '<p>' + setupLine() + '</p><p class="small">Waiting for the host to start. The countdown is shared.</p>';
      h += '<div class="row"><button data-act="leave">Leave</button></div>';
    }
    return h;
  }
  function setupLine() {
    if (!setup) return '';
    const row = trackByKey(setup.track);
    const tr = row ? row.def : null;
    if (!tr && !setup.trackName) return '';
    if (!tr) return esc(setup.trackName) + (setup.reverse ? ' (reverse)' : '') + ' · ' + setup.laps + ' laps';
    const w = RL.WEATHER[setup.weather] || RL.WEATHER.clear;
    const tm = RL.TIMES[setup.time] || RL.TIMES.day;
    return esc(tr.name) + (setup.reverse ? ' (reverse)' : '') + ' · ' + w.icon + ' ' + esc(w.name) + ' · ' + esc(tm.name) + ' · ' + setup.laps + ' laps';
  }
  function openLobbyPanel() {
    panelOpen = true;
    RL.UI.open({
      title: '🌐 Multiplayer',
      onClose: () => {
        panelOpen = false;
        if (!teardown && (phase === 'lobby' || phase === 'connecting')) disconnect();
      },
      render: renderLobby,
      acts: {
        host: hostRoom,
        join: () => joinRoom((document.getElementById('room-code-input') || {}).value || ''),
        start: beginRace,
        copy: copyCode,
        leave: () => RL.UI.back(),
        track: (key) => {
          if (!isHost || !setup) return;
          const row = trackByKey(key);
          if (!row || !unlockedTracks().some((t) => t.key === key)) return;
          setup.track = key;
          setup.trackName = row.def.name;
          setup.custom = !!row.custom;
          setup.weather = row.def.weather[0]; setup.time = row.def.times[0]; setup.reverse = false;
          pushSetup();
        },
        weather: () => { if (!isHost || !setup) return; const d = trackByKey(setup.track); if (!d) return; setup.weather = cycle(d.def.weather, setup.weather); pushSetup(); },
        time: () => { if (!isHost || !setup) return; const d = trackByKey(setup.track); if (!d) return; setup.time = cycle(d.def.times, setup.time); pushSetup(); },
        laps: (d) => { if (!isHost || !setup) return; setup.laps = RL.clamp((setup.laps || 3) + Number(d), 2, 5); pushSetup(); },
        reverse: () => { if (!isHost || !setup) return; setup.reverse = !setup.reverse; pushSetup(); }
      }
    });
  }
  function pushSetup() {
    broadcast(Object.assign({ type: 'lobby' }, lobbyPacket()));
    refreshIfLobby();
  }
  function copyCode() {
    const t = roomCode;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(() => RL.UI.toast('Room code copied'), () => RL.UI.toast('Code ' + t));
    } else RL.UI.toast('Code ' + t);
  }
  function hostRoom() {
    if (busy || phase === 'lobby' || phase === 'connecting') return;
    busy = true; error = ''; phase = 'connecting'; isHost = true;
    const gen = ++epoch;
    createRoom(gen).then((code) => {
      busy = false;
      if (gen !== epoch) return;
      if (!code) { phase = 'idle'; isHost = false; error = 'Could not open a room in this browser.'; refreshIfLobby(); return; }
      phase = 'lobby';
      refreshIfLobby();
    }).catch((e) => {
      guardErr(e); busy = false;
      if (gen === epoch) { phase = 'idle'; isHost = false; error = 'Could not open a room.'; refreshIfLobby(); }
    });
  }
  function joinRoom(raw) {
    const code = sanitize(raw);
    if (code.length !== 4) { error = 'Enter the 4-character room code.'; refreshIfLobby(); return; }
    if (busy) return;
    busy = true; error = ''; phase = 'connecting'; isHost = false;
    const gen = ++epoch;
    connectGuest(code, gen).then((ok) => {
      busy = false;
      if (gen !== epoch) return;
      if (!ok) {
        epoch++;
        phase = 'idle'; roomCode = '';
        if (guestPeer) { const p = guestPeer; guestPeer = null; destroyPeer(p); }
        uplink = null;
        if (!error) error = 'Room not found. Check the code and that the host is still in the lobby.';
        refreshIfLobby();
      }
    }).catch((e) => { guardErr(e); busy = false; });
  }

  /* ---------- Race control ---------- */
  function aiFill(list) {
    const taken = {};
    list.forEach((p) => { taken[p.name] = 1; });
    const names = RL.RIVAL_NAMES.filter((n) => !taken[n]);
    const L = RL.Game.leagueData(RL.Game.state.league);
    const diff = RL.difficulty ? RL.difficulty() : { pace: 1, skill: 1 };
    const pool = (RL.pickRivals ? RL.pickRivals(L.id, GRID) : []).filter((r) => r && !taken[r.name]);
    let n = 1, ri = 0;
    while (list.length < GRID) {
      const rival = pool[ri++] || null;
      const name = rival ? rival.name : (names.length ? names.splice(Math.floor(Math.random() * names.length), 1)[0] : ('AI ' + n));
      const def = RL.Game.carDef(RL.pick(L.cars));
      const st = {};
      for (const k in def.s) st[k] = def.s[k] + (L.aiBonus || 0);
      const phys = RL.Race.physFromStats(st);
      const drive = RL.clamp(((L.ai || 0.8) + ((rival && rival.skill) || 0)) * (diff.skill || 1), 0.32, 1);
      const pace = (L.pace || 1) * (diff.pace || 1);
      phys.maxSpeed *= pace; phys.accel *= 0.9 + pace * 0.12;
      list.push({
        id: 'ai' + n, name: name, color: def.color, phys: phys, isAI: true,
        pers: rival ? rival.pers : 'clean', lane: 0, skill: drive, nitro: 46
      });
      n++;
    }
    return list;
  }
  function buildCfg() {
    const mine = roster.find((p) => p.pid === me());
    if (mine) Object.assign(mine, myProfile(), { host: true });
    const row = trackByKey(setup.track) || trackByKey('docklands');
    const def = row.def;
    const weather = def.weather.indexOf(setup.weather) >= 0 ? setup.weather : def.weather[0];
    const time = def.times.indexOf(setup.time) >= 0 ? setup.time : def.times[0];
    const humans = roster.map((p) => ({ id: p.pid, name: p.name, color: p.color, phys: p.phys, nitro: p.nitro || 30, isAI: false }));
    const cfg = {
      kind: 'multiplayer', multiplayer: true,
      track: row.key, reverse: !!setup.reverse, weather: weather, time: time,
      laps: RL.clamp(setup.laps | 0, 2, 5),
      league: RL.Game.state.league,
      title: 'Online ' + roomCode + ' · ' + def.name,
      roster: aiFill(humans)
    };
    if (row.custom) cfg.trackDef = def;
    return cfg;
  }
  let raceSerial = 0;
  function beginRace() {
    if (!isHost || phase !== 'lobby' || roster.length < 2 || !setup) return;
    raceSerial++;
    const cfg = JSON.parse(JSON.stringify(buildCfg()));
    armRace();
    phase = 'racing';
    panelOpen = false;
    broadcast({ type: 'start', raceId: raceSerial, cfg: cfg });
    RL.UI.closeAll();
    RL.Game.startRace(cfg);
  }
  function armRace() {
    worldSeq = 0; selfSeq = 0; sendAcc = 1;
    resultsSent = false; humanDoneAt = 0; firstFinishAt = 0; finishedNote = false;
    clock = { t: 0, at: 0 };
  }
  function carById(id) {
    const R = RL.Race.state;
    return R ? R.cars.find((c) => c.netId === id) : null;
  }
  function sane(s) { return s && Number.isFinite(+s.x) && Number.isFinite(+s.y) && Number.isFinite(+s.h); }
  function pushSample(c, s) {
    if (!sane(s)) return;
    if (s.seq && c._seq && s.seq <= c._seq) return;
    if (s.seq) c._seq = s.seq;
    const now = performance.now();
    const sample = {
      t: now, seq: s.seq || 0, id: s.id,
      x: +s.x, y: +s.y, h: +s.h,
      vx: +s.vx || 0, vy: +s.vy || 0, speed: +s.speed || 0,
      nitro: +s.nitro || 0, lapsDone: s.lapsDone | 0,
      progress: +s.progress || 0, finished: !!s.finished, finishTime: +s.finishTime || 0
    };
    c.netLatest = sample;
    if (!c.netBuf) c.netBuf = [];
    c.netBuf.push(sample);
    const cutoff = now - 1000;
    while (c.netBuf.length > 2 && c.netBuf[0].t < cutoff) c.netBuf.shift();
    if (c.netBuf.length > 40) c.netBuf.splice(0, c.netBuf.length - 40);
  }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function lerpAng(a, b, k) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
  }
  /* Sample the buffer at renderT. A single packet snaps; a gap extrapolates briefly. */
  function sampleAt(c, renderT) {
    const buf = c.netBuf;
    if (!buf || !buf.length) return null;
    const last = buf[buf.length - 1];
    if (buf.length === 1 || renderT <= buf[0].t) return buf[0];
    if (renderT >= last.t) {
      const extra = Math.min(0.18, (renderT - last.t) / 1000);
      return Object.assign({}, last, { x: last.x + last.vx * extra, y: last.y + last.vy * extra });
    }
    let i = 1;
    while (i < buf.length && buf[i].t < renderT) i++;
    const b = buf[i], a = buf[i - 1];
    const k = RL.clamp((renderT - a.t) / ((b.t - a.t) || 1), 0, 1);
    return {
      x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), h: lerpAng(a.h, b.h, k),
      vx: lerp(a.vx, b.vx, k), vy: lerp(a.vy, b.vy, k), speed: lerp(a.speed, b.speed, k),
      nitro: b.nitro, lapsDone: b.lapsDone, progress: lerp(a.progress, b.progress, k),
      finished: b.finished, finishTime: b.finishTime
    };
  }
  function packCar(c) {
    return {
      id: c.netId,
      x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10,
      h: Math.round(c.h * 1000) / 1000,
      vx: Math.round(c.vx) || 0, vy: Math.round(c.vy) || 0, speed: Math.round(c.speed) || 0,
      nitro: Math.round(c.nitro) || 0, lapsDone: c.lapsDone | 0,
      progress: Math.round(c.progress || 0), finished: !!c.finished,
      finishTime: c.finished ? Math.round(c.finishTime * 100) / 100 : 0
    };
  }
  function relayPack(c, seq) {
    // Relay the latest raw guest pose, not the interpolated one, so delay isn't applied twice.
    const base = (c.remote && c.netLatest) ? {
      id: c.netId, x: c.netLatest.x, y: c.netLatest.y, h: c.netLatest.h,
      vx: c.netLatest.vx, vy: c.netLatest.vy, speed: c.netLatest.speed,
      nitro: c.netLatest.nitro, lapsDone: c.netLatest.lapsDone, progress: c.netLatest.progress,
      finished: c.netLatest.finished, finishTime: c.netLatest.finishTime
    } : packCar(c);
    base.id = c.netId;
    base.seq = seq;
    return base;
  }
  function sendState(R) {
    if (isHost) {
      const seq = ++worldSeq;
      broadcast({ type: 'world', t: R.t, cars: R.cars.map((c) => relayPack(c, seq)) });
    } else if (R.player) {
      sendToHost({ type: 'snap', car: Object.assign(packCar(R.player), { seq: ++selfSeq }) });
    }
  }
  function maybeFinish(R) {
    if (!isHost || resultsSent || !R || R.done) return;
    const humans = R.cars.filter((c) => !c.isAI);
    const allHumans = humans.length > 0 && humans.every((c) => c.finished);
    if (allHumans && !humanDoneAt) humanDoneAt = R.t;
    if (R.cars.some((c) => c.finished) && !firstFinishAt) firstFinishAt = R.t;
    // All humans done, someone finished long ago, or the safety cap. AI still on track are placed by progress.
    if (R.t > RACE_CAP || (humanDoneAt && R.t - humanDoneAt > 2.2) || (firstFinishAt && R.t - firstFinishAt > 50)) publishResults(R);
  }
  function publishResults(R) {
    if (!isHost || resultsSent || !R) return;
    resultsSent = true;
    const order = R.cars.slice().sort((a, b) => {
      if (!!a.finished !== !!b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return (a.finishTime || 0) - (b.finishTime || 0);
      return (b.progress || 0) - (a.progress || 0);
    });
    const msg = {
      type: 'results',
      standings: order.map((c) => ({ id: c.netId, name: c.name, time: c.finished ? c.finishTime : null, out: false }))
    };
    broadcast(msg);
    applyResults(msg);
  }
  function applyResults(msg) {
    const R = RL.Race.state;
    if (!R || R.done || R.netResult) return;
    phase = 'results';
    R.netResult = { standings: msg.standings || [] };
    R.ended = true;
    R.endTimer = 0.35;
  }

  function disconnect() {
    if (teardown) return;
    teardown = true;
    try {
      if (phase !== 'idle') {
        if (isHost) broadcast({ type: 'bye', host: true });
        else sendToHost({ type: 'bye', pid: me() });
      }
      epoch++;
      phase = 'idle';
      isHost = false;
      roomCode = '';
      roster = [];
      transport = '';
      peerUp = false;
      resultsSent = false;
      joinWait = null;
      links.forEach((l) => { l.dead = true; if (l.kind === 'peer') l.close(); });
      links.clear();
      if (uplink && uplink.kind === 'peer') uplink.close();
      uplink = null;
      if (hostPeer) { const p = hostPeer; hostPeer = null; destroyPeer(p); }
      if (guestPeer) { const p = guestPeer; guestPeer = null; destroyPeer(p); }
      livePeers.clear();
    } finally { teardown = false; }
  }
  function abortToHub(text) {
    const R = RL.Race.state;
    const racing = RL.Game.mode === 'race';
    if (R && R.player && RL.Game.currentCar()) RL.Game.currentCar().damage = R.player.damage;
    disconnect();
    if (text) RL.UI.toast(text);
    if (racing) { RL.UI.closeAll(); RL.Game.toHub(); }
  }
  function openMenu() {
    if (!RL.Game.state) { openFromTitle(); return; }
    if (phase === 'racing') return;
    openLobbyPanel();
  }
  function openFromTitle() {
    const G = RL.Game;
    if (!G.state && G.hasSave()) G.load();
    if (G.state) { openMenu(); return; }
    RL.UI.open({
      title: '🌐 Multiplayer',
      render: () => '<p>Multiplayer uses your career car and your name. Start a career first, then come back here or open Multiplayer from the Race Office.</p><div class="row"><button class="primary" data-act="new">New Game</button><button data-act="back">Back</button></div>',
      acts: { new: () => { RL.UI.closeAll(); const b = document.getElementById('btn-new'); if (b) b.click(); } }
    });
  }
  function rematch() {
    if (phase !== 'racing' && phase !== 'results') return false;
    if (!isHost && linkDead) return false;
    if (isHost) roster = roster.filter((p) => p.pid === me() || links.has(p.pid));
    phase = 'lobby';
    resultsSent = false;
    RL.UI.closeAll();
    openLobbyPanel();
    if (isHost) broadcast(Object.assign({ type: 'lobby' }, lobbyPacket()));
    return true;
  }

  /* Hooks called from race.js. Guarded so a bad packet can't kill the frame loop. */
  function fillField(R, player, api) {
    const list = (R.cfg && R.cfg.roster) || [];
    const cars = [];
    list.forEach((r) => {
      if (r.id === me()) {
        player.netId = me();
        player.remote = false;
        player.isAI = false;
        cars.push(player);
        return;
      }
      // AI is live only on the host. Everyone else, including the host's view of humans, is interpolated.
      const remote = !(r.isAI && isHost);
      cars.push(api.makeCar({
        name: r.name, color: r.color || '#aaa', p: r.phys, skill: r.skill || 1,
        netId: r.id, isAI: !!r.isAI, remote: remote, nitro: r.nitro || (r.isAI ? 50 : 30),
        ai: r.isAI ? { pers: r.pers || 'clean', lane: r.lane || 0, laneT: 0 } : null
      }));
    });
    if (cars.indexOf(player) < 0) { player.netId = me(); cars.unshift(player); }
    R.cars = cars;
    cars.forEach((c, i) => api.placeOnGrid(c, i));
  }
  function integrateRemote(c) {
    const s = sampleAt(c, performance.now() - INTERP_MS);
    if (!s) return;
    c.x = s.x; c.y = s.y; c.h = s.h;
    c.vx = s.vx; c.vy = s.vy; c.speed = s.speed;
    c.nitro = s.nitro; c.lapsDone = s.lapsDone; c.progress = s.progress;
    c.finished = s.finished; c.finishTime = s.finishTime || 0;
    c._pose = { x: c.x, y: c.y, h: c.h, vx: c.vx, vy: c.vy };
  }
  function syncClock(R) {
    if (isHost || !clock.at || phase !== 'racing') return;
    const est = clock.t + (performance.now() - clock.at) / 1000;
    const drift = est - R.t;
    if (Math.abs(drift) > 1.2) R.t = est;          // missed a hitch; snap back to the host
    else R.t += RL.clamp(drift, -0.5, 0.5) * 0.2; // otherwise ease, so countdown beeps still fire
  }
  function afterPhysics(R, dt) {
    if (phase !== 'racing') return;
    for (let i = 0; i < R.cars.length; i++) {
      const c = R.cars[i];
      if (c.remote && c._pose) { c.x = c._pose.x; c.y = c._pose.y; c.h = c._pose.h; c.vx = c._pose.vx; c.vy = c._pose.vy; }
    }
    sendAcc += dt;
    if (sendAcc >= SEND_EVERY) { sendAcc = 0; if (!resultsSent) sendState(R); }
    if (isHost) maybeFinish(R);
  }
  function onLocalFinish() {
    if (finishedNote) return;
    finishedNote = true;
    RL.UI.toast('Finished — waiting for the other racers…');
  }
  function status() {
    return {
      phase: phase, isHost: isHost, code: roomCode, transport: transport, peerUp: peerUp,
      players: roster.map((p) => p.name), selfId: me(),
      peerMsgs: stats.peerMsgs, localMsgs: stats.localMsgs, lastError: lastError
    };
  }

  return {
    openMenu: openMenu, openFromTitle: openFromTitle, disconnect: disconnect, rematch: rematch, status: status,
    refreshLobby: refreshIfLobby, unlockedTracks: unlockedTracks,
    fillField: guard(fillField), integrateRemote: guard(integrateRemote), syncClock: guard(syncClock),
    afterPhysics: guard(afterPhysics), onLocalFinish: guard(onLocalFinish)
  };
})();

/* Track editor and community publish call this after a custom circuit changes.
   City roles look for send/peers; the city is local, so those stay empty. */
RL.Multiplayer = {
  refreshTracks() { if (RL.Net && RL.Net.refreshLobby) RL.Net.refreshLobby(); },
  send() {},
  peers() { return []; }
};
