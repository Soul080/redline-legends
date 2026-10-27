/* servers.js — Public city servers for free-roam.
   Downtown rooms use Supabase Realtime (presence + broadcast) and Postgres
   RPCs. The anon key lives in community-config.js. Race rooms stay on PeerJS
   in net.js. This file does not edit wanted.js: it calls the public Wanted
   and Roles APIs and draws remote cars from the existing Roles.draw hook.
   Keep CAP, payout(), and the room ids in sync with docs/ONLINE_SERVERS.md. */
window.RL = window.RL || {};

RL.Servers = (function () {
  const CAP = 12;
  const ROOMS = [
    { id: 'downtown-1', name: 'Downtown 1', cap: CAP },
    { id: 'downtown-2', name: 'Downtown 2', cap: CAP }
  ];
  const INTERP_MS = 100;
  const SEND_EVERY = 0.1;
  const WORLD = 2000;

  const counts = { 'downtown-1': 0, 'downtown-2': 0 };
  const remotes = new Map();
  let leaders = [];
  let roomId = null;
  let channel = null;
  let phase = 'idle';
  let note = '';
  let browsing = false;
  let pollTimer = 0;
  let showBoard = false;
  let sendAcc = 0;
  let trackAcc = 0;
  let heartAcc = 0;
  let boardAcc = 0;
  let pinId = null;
  let pinT = 0;
  const recentBust = new Map();
  let boardEl = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toast(text, color) { try { if (RL.UI && RL.UI.toast) RL.UI.toast(text, color || '#ffe03b'); } catch (e) { /* hud toast is optional */ } }
  function clampStars(n) {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v) || v < 1) return 0;
    return v > 5 ? 5 : v;
  }
  /* Server-side formulas live in claim_bounty / claim_bust. Mirror them here
     so a bad response cannot pay more than the SQL clamp. */
  function payout(kind, stars, role) {
    const s = clampStars(stars);
    if (s < 1) return 0;
    if (kind === 'bust') return Math.min(1250, 500 + s * 150);
    if (role === 'criminal') return Math.min(1015, Math.round(140 * s * 1.45));
    return Math.min(1015, 140 * s);
  }
  function cleanColor(c) { return /^#[0-9a-fA-F]{3,8}$/.test(String(c || '')) ? String(c) : '#ff3b6b'; }
  function cleanCoord(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v < -200 || v > WORLD) return null;
    return v;
  }
  function roomById(id) {
    for (let i = 0; i < ROOMS.length; i++) if (ROOMS[i].id === id) return ROOMS[i];
    return null;
  }
  function myId() {
    const p = RL.Auth && RL.Auth.profile && RL.Auth.profile();
    return p && p.id ? p.id : '';
  }
  function guestKey() {
    const p = RL.Auth && RL.Auth.profile && RL.Auth.profile();
    if (p && p.guest && /^g_[A-Za-z0-9]{8,24}$/.test(p.id)) return p.id;
    return 'g_signedinplaceholder';
  }
  function hasCareer() {
    const G = RL.Game;
    if (!G) return false;
    if (!G.state && G.hasSave && G.hasSave()) { try { G.load(); } catch (e) { /* unreadable save */ } }
    return !!G.state;
  }

  function selfPlayer() {
    const prof = RL.Auth && RL.Auth.profile ? RL.Auth.profile() : null;
    const h = RL.Hub && RL.Hub.player;
    let role = 'neutral';
    try { role = RL.Roles && RL.Roles.current ? RL.Roles.current() : 'neutral'; } catch (e) { role = 'neutral'; }
    if (role !== 'police' && role !== 'criminal') role = 'neutral';
    let stars = 0;
    try { stars = RL.Wanted && RL.Wanted.stars ? RL.Wanted.stars() : 0; } catch (e) { stars = 0; }
    stars = clampStars(stars);
    let color = '#ff3b6b';
    try {
      const car = RL.Game && RL.Game.currentCar && RL.Game.currentCar();
      if (car && RL.Game.carColor) color = RL.Game.carColor(car);
    } catch (e) { color = '#ff3b6b'; }
    const name = (prof && RL.Auth.cleanNick(prof.nickname)) || (RL.Game && RL.Game.state && RL.Auth.cleanNick(RL.Game.state.name)) || 'Racer';
    return {
      id: prof ? prof.id : 'local',
      name: name,
      role: role,
      stars: stars,
      bounty: role === 'police' ? 0 : payout('evade', stars, role),
      x: h ? Number(h.x) || 0 : 0,
      y: h ? Number(h.y) || 0 : 0,
      h: h ? Number(h.h) || 0 : 0,
      speed: h ? Number(h.speed) || 0 : 0,
      color: cleanColor(color),
      siren: !!(h && h.siren),
      guest: !prof || !!prof.guest,
      self: true
    };
  }

  function pushSample(remote, x, y, h, speed) {
    if (!remote.buf) remote.buf = [];
    remote.buf.push({ t: Date.now(), x: x, y: y, h: h, speed: speed });
    const cutoff = Date.now() - 1000;
    while (remote.buf.length > 2 && remote.buf[0].t < cutoff) remote.buf.shift();
  }
  function lerpAngle(a, b, u) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * u;
  }
  function poseAt(remote, now) {
    const buf = remote.buf;
    if (!buf || !buf.length) return null;
    const t = now - INTERP_MS;
    if (buf.length === 1 || t <= buf[0].t) return buf[0];
    const last = buf[buf.length - 1];
    if (t >= last.t) return last;
    let i = 1;
    while (i < buf.length && buf[i].t < t) i++;
    const a = buf[i - 1], b = buf[i];
    const u = (t - a.t) / Math.max(1, b.t - a.t);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, h: lerpAngle(a.h, b.h, u), speed: a.speed + (b.speed - a.speed) * u };
  }

  function upsertRemote(id, meta, fromPose) {
    if (!id || id === myId() || typeof id !== 'string' || id.length > 80) return;
    meta = meta || {};
    let remote = remotes.get(id);
    if (!remote) {
      remote = { id: id, name: 'Racer', role: 'neutral', stars: 0, bounty: 0, x: 0, y: 0, h: 0, speed: 0, color: '#ff3b6b', siren: false, guest: false, seen: 0, buf: [] };
      remotes.set(id, remote);
    }
    const name = RL.Auth && RL.Auth.cleanNick ? RL.Auth.cleanNick(meta.name) : null;
    if (name) remote.name = name;
    else if (!fromPose && meta.name) remote.name = 'Racer';
    if (meta.role === 'police' || meta.role === 'criminal' || meta.role === 'neutral') remote.role = meta.role;
    if (meta.stars != null) remote.stars = clampStars(meta.stars);
    if (meta.guest != null) remote.guest = !!meta.guest;
    if (meta.color) remote.color = cleanColor(meta.color);
    if (meta.siren != null) remote.siren = !!meta.siren;
    const x = cleanCoord(meta.x), y = cleanCoord(meta.y);
    if (x != null && y != null) {
      remote.x = x; remote.y = y;
      if (Number.isFinite(Number(meta.h))) remote.h = Number(meta.h);
      if (Number.isFinite(Number(meta.speed))) remote.speed = Math.max(-500, Math.min(500, Number(meta.speed)));
      pushSample(remote, remote.x, remote.y, remote.h, remote.speed);
    }
    remote.bounty = remote.role === 'police' ? 0 : payout('evade', remote.stars, remote.role);
    remote.seen = Date.now();
  }

  function onPresence() {
    if (!channel || !channel.presenceState) return;
    let state = {};
    try { state = channel.presenceState() || {}; } catch (e) { return; }
    const seen = new Set();
    Object.keys(state).forEach((key) => {
      if (key === myId()) return;
      const metas = state[key];
      const meta = metas && metas[metas.length - 1];
      if (!meta) return;
      seen.add(key);
      upsertRemote(key, meta, false);
    });
    remotes.forEach((remote, id) => {
      if (!seen.has(id) && Date.now() - remote.seen > 1000) remotes.delete(id);
    });
    paintBoard();
  }
  function onPose(payload) {
    if (!payload || typeof payload !== 'object') return;
    upsertRemote(String(payload.id || ''), payload, true);
    paintBoard();
  }
  function onBustMsg(payload) {
    if (!payload || payload.target !== myId()) return;
    const sender = remotes.get(payload.from);
    const me = selfPlayer();
    if (!sender || sender.role !== 'police') return;
    if (me.role !== 'criminal' || me.stars < 1) return;
    if (Math.hypot((sender.x || 0) - me.x, (sender.y || 0) - me.y) > 80) return;
    try { if (RL.Wanted && RL.Wanted.bust) RL.Wanted.bust(); } catch (e) { /* wanted owns the impound */ }
  }

  function publicPeer(remote) {
    return {
      id: remote.id, name: remote.name, role: remote.role, stars: remote.stars, bounty: remote.bounty,
      x: remote.x, y: remote.y, h: remote.h, speed: remote.speed, color: remote.color,
      siren: !!remote.siren, guest: !!remote.guest, self: false
    };
  }
  function players() {
    const list = [];
    const me = selfPlayer();
    if (roomId) list.push(me);
    remotes.forEach((remote) => list.push(publicPeer(remote)));
    list.sort((a, b) => (b.bounty - a.bounty) || (b.stars - a.stars) || String(a.name).localeCompare(String(b.name)));
    return list;
  }

  function presencePayload() {
    const me = selfPlayer();
    return { name: me.name, role: me.role, stars: me.stars, color: me.color, guest: me.guest, x: me.x, y: me.y, h: me.h, speed: me.speed, siren: me.siren };
  }
  function trackPresence() {
    if (!channel || !channel.track || !roomId) return Promise.resolve();
    try { return Promise.resolve(channel.track(presencePayload())); }
    catch (e) { return Promise.resolve(); }
  }
  function sendPose() {
    if (!channel || !channel.send || !roomId || !RL.Game || RL.Game.mode !== 'hub') return;
    const me = selfPlayer();
    if (!me.id) return;
    try {
      channel.send({
        type: 'broadcast',
        event: 'pose',
        payload: { id: me.id, name: me.name, role: me.role, stars: me.stars, guest: me.guest, color: me.color, siren: me.siren, x: me.x, y: me.y, h: me.h, speed: me.speed, t: Date.now() }
      });
    } catch (e) { /* a dropped pose is replaced by the next one */ }
  }
  function dropStale() {
    const now = Date.now();
    remotes.forEach((remote, id) => { if (now - remote.seen > 1500) remotes.delete(id); });
  }

  function tickBust(dt) {
    const me = selfPlayer();
    if (me.role !== 'police' || Math.abs(me.speed) >= 90) { pinId = null; pinT = 0; return; }
    let target = null;
    remotes.forEach((remote) => {
      if (target || remote.role !== 'criminal' || remote.stars < 1) return;
      if (Math.hypot(remote.x - me.x, remote.y - me.y) < 32) target = remote;
    });
    if (!target) { pinId = null; pinT = 0; return; }
    if (pinId !== target.id) { pinId = target.id; pinT = 0; }
    pinT += dt;
    if (pinT < 0.9) return;
    pinT = 0;
    const last = recentBust.get(target.id) || 0;
    if (Date.now() - last < 8000) return;
    recentBust.set(target.id, Date.now());
    const stars = target.stars;
    try {
      channel.send({ type: 'broadcast', event: 'bust', payload: { from: me.id, target: target.id, stars: stars } });
    } catch (e) { /* the reward still goes through the RPC */ }
    grantBust(stars, target.name);
  }

  function tick(dt) {
    if (!roomId) {
      if (boardEl && boardEl.classList.contains('on')) boardEl.classList.remove('on');
      return;
    }
    dt = Math.min(0.1, Math.max(0, Number(dt) || 0));
    sendAcc += dt; trackAcc += dt; heartAcc += dt; boardAcc += dt;
    if (sendAcc >= SEND_EVERY) { sendAcc = 0; sendPose(); }
    if (trackAcc >= 0.5) { trackAcc = 0; trackPresence(); }
    if (heartAcc >= 8) { heartAcc = 0; heartbeat(); }
    if (boardAcc >= 0.25) { boardAcc = 0; paintBoard(); }
    dropStale();
    if (RL.Game && RL.Game.mode === 'hub') tickBust(dt);
  }

  async function claim(kind, stars, role) {
    const cleanRole = role === 'criminal' ? 'criminal' : (role === 'police' ? 'police' : 'neutral');
    const cleanStars = clampStars(stars);
    const capPay = payout(kind === 'bust' ? 'bust' : 'evade', cleanStars, cleanRole);
    if (cleanStars < 1) return { ok: false, reason: 'nostars', money: 0, capped: 0 };
    const prof = RL.Auth.profile();
    if (!prof || prof.guest) return { ok: false, reason: 'guest', money: 0, capped: capPay };
    if (!RL.Auth.configured()) return { ok: false, reason: 'unconfigured', money: 0, capped: capPay };
    const fn = kind === 'bust' ? 'claim_bust' : 'claim_bounty';
    const args = kind === 'bust' ? { p_stars: cleanStars } : { p_stars: cleanStars, p_role: cleanRole === 'criminal' ? 'criminal' : 'neutral' };
    const data = await RL.Auth.rpc(fn, args);
    if (!data || data.ok === false) {
      return { ok: false, reason: (data && data.reason) || 'offline', money: 0, capped: capPay, message: data && data.message };
    }
    const money = Math.min(capPay, Math.max(0, Math.round(Number(data.money) || 0)));
    await refreshLeaderboard();
    return { ok: true, money: money, bounty: Math.max(0, Math.round(Number(data.bounty) || 0)), capped: capPay, reason: 'ok' };
  }

  function onEvade(stars, role) {
    if (!RL.Auth || !RL.Auth.configured()) return;
    if (role === 'police') return;
    const starsN = clampStars(stars);
    if (starsN < 1) return;
    RL.Auth.boot().then(() => claim('evade', starsN, role)).then((res) => {
      if (res && res.ok) toast('All-time bounty +' + RL.fmtMoney(res.money), '#7dff5a');
    }).catch(() => { /* solo evade already paid on this device */ });
  }

  function grantBust(stars, name) {
    const cap = payout('bust', stars, 'criminal');
    const label = RL.Auth.cleanNick(name) || 'a criminal';
    claim('bust', stars, 'criminal').then((res) => {
      if (!RL.Game || !RL.Game.addMoney) return;
      if (res && res.ok) {
        RL.Game.addMoney(res.money);
        toast('Busted ' + label + ' +' + RL.fmtMoney(res.money), '#7dff5a');
      } else if (res && res.reason === 'guest') {
        RL.Game.addMoney(cap);
        toast('Busted ' + label + ' +' + RL.fmtMoney(cap) + ' (not on the board)', '#7dff5a');
      } else if (res && (res.reason === 'rate' || res.reason === 'cap')) {
        toast('The bounty board already counted a recent claim.', '#ffe03b');
        return;
      } else {
        RL.Game.addMoney(cap);
        toast('Busted ' + label + ' +' + RL.fmtMoney(cap) + '. The leaderboard did not save it.', '#ffe03b');
      }
      try {
        if (RL.Roles && RL.Roles.addXp) RL.Roles.addXp('police', 35);
        if (RL.Game.state && RL.Game.state.totals) RL.Game.state.totals.bustsAi = (RL.Game.state.totals.bustsAi || 0) + 1;
        if (RL.Game.unlockAch) RL.Game.unlockAch('sp_bust');
        if (RL.Game.event) RL.Game.event('bust', { peer: true });
      } catch (e) { /* career bookkeeping stays local */ }
    }).catch(() => { /* the next heartbeat will retry presence, not the payout */ });
  }

  function cleanRow(row) {
    if (!row || typeof row !== 'object') return null;
    const nickname = RL.Auth.cleanNick(row.nickname) || 'Racer';
    const bounty = Math.max(0, Math.round(Number(row.bounty) || 0));
    const busts = Math.max(0, Math.round(Number(row.busts) || 0));
    if (bounty <= 0 || bounty > 100000000) return null;
    return { nickname: nickname, bounty: bounty, busts: busts };
  }
  async function refreshLeaderboard() {
    if (!RL.Auth.configured()) { leaders = []; return leaders; }
    const c = await RL.Auth.ensureClient();
    if (!c || !c.from) return leaders;
    let res;
    try {
      res = await c.from('bounty_leaderboard').select('nickname,bounty,busts').order('bounty', { ascending: false }).limit(20);
    } catch (e) { return leaders; }
    if (!res || res.error || !Array.isArray(res.data)) return leaders;
    leaders = res.data.map(cleanRow).filter(Boolean);
    return leaders;
  }
  async function refreshCounts() {
    if (!RL.Auth.configured()) return counts;
    const data = await RL.Auth.rpc('server_counts', {});
    if (!Array.isArray(data)) return counts;
    counts['downtown-1'] = 0; counts['downtown-2'] = 0;
    data.forEach((row) => {
      if (row && (row.room_id === 'downtown-1' || row.room_id === 'downtown-2')) {
        counts[row.room_id] = Math.max(0, Math.round(Number(row.players) || 0));
      }
    });
    return counts;
  }
  function heartbeat() {
    if (!roomId) return;
    RL.Auth.rpc('touch_server', { p_room: roomId, p_guest_key: guestKey() }).then((res) => {
      if (res && res.ok && res.count != null) counts[roomId] = res.count;
      else if (res && res.reason === 'full') leave();
    }).catch(() => { /* the slot expires server-side if this keeps failing */ });
  }

  function connectRoom(room) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        if (!result.ok && channel) {
          const dropped = channel;
          channel = null;
          try { if (dropped.unsubscribe) dropped.unsubscribe(); } catch (e) { /* ignore */ }
        }
        resolve(result);
      };
      RL.Auth.ensureClient().then((c) => {
        if (!c || !c.channel) { finish({ ok: false, reason: 'offline' }); return; }
        try {
          channel = c.channel('rl-city:' + room.id, {
            config: { presence: { key: myId() }, broadcast: { self: false } }
          });
          channel.on('broadcast', { event: 'pose' }, (msg) => onPose(msg && msg.payload))
            .on('broadcast', { event: 'bust' }, (msg) => onBustMsg(msg && msg.payload))
            .on('presence', { event: 'sync' }, () => onPresence());
          channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') trackPresence().then(() => finish({ ok: true }));
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') finish({ ok: false, reason: 'offline' });
          });
        } catch (e) { finish({ ok: false, reason: 'offline' }); }
      }).catch(() => finish({ ok: false, reason: 'offline' }));
      setTimeout(() => finish({ ok: false, reason: 'offline' }), 8000);
    });
  }

  async function leave() {
    const id = roomId;
    roomId = null;
    phase = 'idle';
    pinId = null; pinT = 0;
    remotes.clear();
    const ch = channel;
    channel = null;
    if (ch) {
      try { if (ch.untrack) await ch.untrack(); } catch (e) { /* already gone */ }
      try { if (ch.unsubscribe) await ch.unsubscribe(); } catch (e) { /* already gone */ }
    }
    if (id && RL.Auth.configured()) {
      try { await RL.Auth.rpc('leave_server', { p_room: id, p_guest_key: guestKey() }); } catch (e) { /* slot expires */ }
    }
    paintBoard();
    if (browsing) { await refreshCounts(); paint(); }
    return { ok: true };
  }

  async function join(id) {
    const room = roomById(id);
    if (!room) return { ok: false, reason: 'room' };
    if (!RL.Auth.configured()) { note = RL.Auth.messages.unconfigured; paint(); return { ok: false, reason: 'unconfigured', message: note }; }
    await RL.Auth.boot();
    const prof = RL.Auth.profile();
    if (!prof) { note = 'Sign in with Google, or play as a guest, before joining.'; paint(); return { ok: false, reason: 'signin', message: note }; }
    if (!hasCareer()) { note = 'Start a career first. City servers use your car and your role.'; paint(); return { ok: false, reason: 'career', message: note }; }
    if ((counts[room.id] || 0) >= room.cap && roomId !== room.id) {
      note = room.name + ' is full (' + (counts[room.id] || 0) + '/' + room.cap + ').';
      paint();
      return { ok: false, reason: 'full', message: note };
    }
    phase = 'joining';
    note = '';
    const touch = await RL.Auth.rpc('touch_server', { p_room: room.id, p_guest_key: guestKey() });
    if (!touch || touch.ok === false) {
      phase = 'idle';
      if (touch && touch.reason === 'full') note = room.name + ' is full (' + (touch.count || room.cap) + '/' + (touch.cap || room.cap) + ').';
      else if (touch && touch.message) note = touch.message;
      else note = RL.Auth.messages.offline;
      paint();
      return { ok: false, reason: (touch && touch.reason) || 'offline', message: note };
    }
    if (touch.count != null) counts[room.id] = touch.count;
    if (roomId && roomId !== room.id) await leave();
    if (roomId === room.id && channel) { phase = 'live'; return { ok: true, room: room.id }; }
    const connected = await connectRoom(room);
    if (!connected.ok) {
      phase = 'idle';
      try { await RL.Auth.rpc('leave_server', { p_room: room.id, p_guest_key: guestKey() }); } catch (e) { /* slot expires */ }
      note = RL.Auth.messages.offline;
      paint();
      return { ok: false, reason: 'offline', message: note };
    }
    roomId = room.id;
    phase = 'live';
    note = '';
    sendAcc = SEND_EVERY;
    if (RL.Game && RL.Game.mode !== 'hub') RL.Game.toHub();
    if (RL.UI && RL.UI.closeAll) RL.UI.closeAll();
    browsing = false;
    clearInterval(pollTimer);
    pollTimer = 0;
    toast('Joined ' + room.name + (prof.guest ? ' as a guest' : ''), '#7dff5a');
    paintBoard();
    return { ok: true, room: room.id };
  }

  function roomRows() {
    return ROOMS.map((room) => {
      const playersN = counts[room.id] || 0;
      return { id: room.id, name: room.name, cap: room.cap, players: playersN, full: playersN >= room.cap };
    });
  }

  function oursOpen() {
    if (!browsing || !RL.UI || !RL.UI.isOpen || !RL.UI.isOpen()) return false;
    const h = document.querySelector('#panel h2');
    return !!(h && h.textContent.indexOf('City Servers') >= 0);
  }
  function paint() {
    if (!oursOpen() || !RL.UI || !RL.UI.refresh) return;
    const active = document.activeElement;
    if (active && active.id === 'sv-nick') return;
    RL.UI.refresh();
  }

  function authBlock() {
    const st = RL.Auth.status();
    const prof = RL.Auth.profile();
    let h = '';
    if (!hasCareer()) {
      h += '<p>City servers use your career car and your role. Start a career first, then come back here.</p>';
      h += '<div class="row"><button class="primary" data-act="newgame">New Game</button></div>';
    }
    if (st.mode === 'offline') h += '<p class="sv-note">' + esc(RL.Auth.messages.offline) + '</p>';
    if (note) h += '<p class="sv-note">' + esc(note) + '</p>';
    if (prof && !prof.guest) {
      h += '<p>Signed in as <b class="hl">' + esc(prof.nickname) + '</b>' + (prof.googleName ? ' <span class="small">(Google: ' + esc(prof.googleName) + ')</span>' : '') + '.</p>';
      h += '<div class="row"><input id="sv-nick" maxlength="16" value="' + esc(prof.nickname) + '" aria-label="Nickname"><button data-act="nick">Save name</button><button data-act="out">Sign out</button></div>';
    } else if (prof && prof.guest) {
      h += '<p>Playing as guest <b>' + esc(prof.nickname) + '</b>. Guests are not listed on the all-time board.</p>';
      h += '<div class="row"><input id="sv-nick" maxlength="16" value="' + esc(prof.nickname) + '" aria-label="Nickname"><button data-act="nick">Save name</button><button class="primary" data-act="google">Sign in with Google</button></div>';
    } else {
      h += '<p>Sign in with Google to use your Google name as a nickname and post to the all-time bounty board. Guests can ride, and they stay off that board.</p>';
      h += '<div class="row"><input id="sv-nick" maxlength="16" placeholder="Nickname" aria-label="Nickname"><button class="primary" data-act="google">Sign in with Google</button><button data-act="guest">Play as guest</button></div>';
    }
    return h;
  }
  function body() {
    if (!RL.Auth.configured()) return '<p class="sv-note">' + esc(RL.Auth.messages.unconfigured) + '</p>';
    let h = authBlock();
    if (roomId) {
      const room = roomById(roomId);
      h += '<p class="small">You are in <b>' + esc(room ? room.name : roomId) + '</b>.</p><div class="row"><button data-act="leave">Leave server</button></div>';
    }
    h += '<h3>Servers</h3>';
    roomRows().forEach((room) => {
      const mine = roomId === room.id;
      h += '<div class="card"><div><b>' + esc(room.name) + '</b><div class="small">' + room.players + '/' + room.cap + ' drivers' + (room.full ? ' · Full' : '') + '</div></div><div class="btns">';
      if (mine) h += '<span class="eq">IN</span>';
      else h += '<button class="primary" data-act="join" data-arg="' + esc(room.id) + '"' + (room.full || !RL.Auth.profile() ? ' disabled' : '') + '>' + (room.full ? 'Full' : 'Join') + '</button>';
      h += '</div></div>';
    });
    h += '<div class="row"><button data-act="board">' + (showBoard ? 'Hide all-time board' : 'All-time bounty board') + '</button><button data-act="reload">Reload</button></div>';
    if (showBoard) {
      h += '<h3>All-time bounty</h3><p class="small">Signed-in drivers only. Guests are not listed. Payouts are clamped by the database.</p>';
      if (!leaders.length) h += '<p class="dim">No bounty has been recorded yet.</p>';
      else {
        h += '<table class="standings"><tr><th>#</th><th>Name</th><th>Bounty</th><th>Busts</th></tr>';
        leaders.forEach((row, i) => {
          h += '<tr><td>' + (i + 1) + '</td><td>' + esc(row.nickname) + '</td><td>' + esc(RL.fmtMoney(row.bounty)) + '</td><td>' + row.busts + '</td></tr>';
        });
        h += '</table>';
      }
    }
    return h;
  }

  function afterAuth(res) {
    if (res && res.ok === false && res.message) { note = res.message; toast(res.message, '#ff8a2e'); }
    else note = '';
    paint();
  }
  function view() {
    return {
      title: '🏙️ City Servers',
      cls: 'wide',
      onClose: () => { browsing = false; clearInterval(pollTimer); pollTimer = 0; },
      render: body,
      acts: {
        google: () => { RL.Auth.signInGoogle().then(afterAuth); },
        guest: () => {
          const el = document.getElementById('sv-nick');
          RL.Auth.playAsGuest(el && el.value ? el.value : '').then(afterAuth);
        },
        nick: () => {
          const el = document.getElementById('sv-nick');
          RL.Auth.setNickname(el ? el.value : '').then(afterAuth);
        },
        out: () => { leave().then(() => RL.Auth.signOut()).then(() => { note = ''; paint(); }); },
        join: (id) => { join(id).then((res) => { if (res && res.ok === false && res.message) toast(res.message, '#ff8a2e'); }); },
        leave: () => { leave(); },
        board: () => { showBoard = !showBoard; if (showBoard) refreshLeaderboard().then(paint); },
        reload: () => { refreshCounts().then(() => refreshLeaderboard()).then(paint); },
        newgame: () => { if (RL.UI) RL.UI.closeAll(); const b = document.getElementById('btn-new'); if (b) b.click(); }
      }
    };
  }

  function open(opts) {
    browsing = true;
    if (!opts || !opts.keepBoard) showBoard = false;
    note = '';
    hasCareer();
    if (RL.UI) RL.UI.open(view());
    if (!RL.Auth.configured()) return;
    RL.Auth.boot().then(() => Promise.all([refreshCounts(), refreshLeaderboard()])).then(() => { if (browsing) paint(); }).catch(() => {
      note = RL.Auth.messages.offline;
      if (browsing) paint();
    });
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!browsing) return;
      refreshCounts().then(() => { if (browsing) paint(); }).catch(() => { /* keep the last counts */ });
    }, 3000);
  }

  function ensureBoard() {
    if (boardEl) return boardEl;
    boardEl = document.createElement('aside');
    boardEl.id = 'bounty-board';
    boardEl.innerHTML = '<h3 id="bb-title">City server</h3><div class="bb-sub" id="bb-sub"></div><ul id="bb-list"></ul><div class="bb-actions"><button type="button" id="bb-leaders">All-time</button><button type="button" id="bb-leave">Leave</button></div>';
    document.body.appendChild(boardEl);
    boardEl.querySelector('#bb-leave').addEventListener('click', () => { leave(); });
    boardEl.querySelector('#bb-leaders').addEventListener('click', () => { showBoard = true; open({ keepBoard: true }); });
    return boardEl;
  }
  function paintBoard() {
    const board = ensureBoard();
    const inHub = !!(roomId && RL.Game && RL.Game.mode === 'hub');
    board.classList.toggle('on', inHub);
    if (!inHub) return;
    const room = roomById(roomId);
    board.querySelector('#bb-title').textContent = room ? room.name : 'City server';
    const prof = RL.Auth.profile();
    board.querySelector('#bb-sub').textContent = prof && prof.guest ? 'Guest — off the all-time board' : 'Live bounty';
    const ul = board.querySelector('#bb-list');
    ul.textContent = '';
    players().forEach((p) => {
      const li = document.createElement('li');
      if (p.self) li.className = 'me';
      const name = document.createElement('div');
      name.className = 'bb-name';
      name.textContent = p.name + (p.guest ? ' · guest' : '');
      const stars = document.createElement('div');
      stars.className = 'bb-stars';
      stars.textContent = p.stars > 0 ? '★'.repeat(p.stars) : '☆';
      const role = document.createElement('div');
      role.className = 'bb-role ' + p.role;
      role.textContent = p.role;
      const money = document.createElement('div');
      money.className = 'bb-money';
      money.textContent = RL.fmtMoney(p.bounty);
      li.appendChild(name); li.appendChild(stars); li.appendChild(role); li.appendChild(money);
      ul.appendChild(li);
    });
  }

  function drawRemotes(ctx) {
    if (!roomId || !ctx || !ctx.save) return;
    const now = Date.now();
    remotes.forEach((remote) => {
      const pose = poseAt(remote, now) || remote;
      if (!Number.isFinite(pose.x) || !Number.isFinite(pose.y)) return;
      if (RL.Drive && RL.Drive.drawCar) {
        RL.Drive.drawCar(ctx, { x: pose.x, y: pose.y, h: pose.h || 0, color: remote.color }, {
          livery: remote.role === 'police',
          siren: !!remote.siren,
          night: !!(RL.City && RL.City.dark && RL.City.dark() > 0.2)
        });
      }
      const label = remote.name + (remote.stars > 0 ? ' ' + '★'.repeat(remote.stars) : '');
      ctx.save();
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = remote.role === 'police' ? '#7aa2ff' : remote.role === 'criminal' ? '#ff3b6b' : '#ffe03b';
      ctx.fillText(label, pose.x, pose.y - 20);
      ctx.restore();
    });
  }

  function hook() {
    if (RL.Roles && RL.Roles.draw && !RL.Roles.draw._sv) {
      const orig = RL.Roles.draw;
      function wrapped(ctx) {
        orig.call(RL.Roles, ctx);
        try { drawRemotes(ctx); } catch (e) { /* a bad pose should not stop the city */ }
      }
      wrapped._sv = true;
      RL.Roles.draw = wrapped;
    }
    if (RL.Wanted && RL.Wanted.evade && !RL.Wanted.evade._sv) {
      const orig = RL.Wanted.evade;
      function wrapped() {
        let stars = 0, role = 'neutral';
        try {
          const w = RL.Wanted.W && RL.Wanted.W();
          stars = w ? Math.max(Number(w.stars) || 0, Number(w.peak) || 0) : 0;
          role = RL.Roles && RL.Roles.current ? RL.Roles.current() : 'neutral';
        } catch (e) { stars = 0; }
        const result = orig.apply(RL.Wanted, arguments);
        try { onEvade(stars, role); } catch (e) { /* board is best-effort */ }
        return result;
      }
      wrapped._sv = true;
      RL.Wanted.evade = wrapped;
    }
  }
  hook();
  window.addEventListener('load', hook);

  return {
    open: open,
    join: join,
    leave: leave,
    tick: tick,
    players: players,
    leaderboard: () => leaders.slice(),
    rooms: roomRows,
    payout: payout,
    claim: claim,
    CAP: CAP,
    ROOMS: ROOMS.map((room) => ({ id: room.id, name: room.name, cap: room.cap })),
    configured: () => RL.Auth.configured(),
    status: () => ({ room: roomId, phase: phase, error: note, cap: CAP, players: players().map((p) => p.name), count: players().length }),
    messages: RL.Auth.messages
  };
})();
