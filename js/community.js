/* community.js — Public Community Tracks browser.
   Talks to Supabase PostgREST with the anon key from community-config.js.
   No key, a bad key, or a failed request leaves share codes working locally.
   Listings are checked with RL.Tracks.validate before they can be raced.
   Keep BLOCKED in sync with community_name_blocked() in docs/COMMUNITY_TRACKS.md. */
window.RL = window.RL || {};

RL.Community = (function () {
  const CLIENT_KEY = 'redline_legends_community_client_v1';
  const PUB_KEY = 'redline_legends_community_pubs_v1';
  const VOTE_KEY = 'redline_legends_community_votes_v1';
  const BLOCKED = ['fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'slut', 'whore', 'porn'];
  const MESSAGES = {
    unconfigured: "Community Tracks isn't connected yet. Share codes from the editor still work on this device.",
    offline: 'Community Tracks is offline right now. Share codes from the editor still work on this device.',
    setup: 'Community Tracks rejected the request. Check the anon key and the SQL policies in docs/COMMUNITY_TRACKS.md. Share codes from the editor still work on this device.'
  };
  const LIMITS = { name: 24, code: 4000, thumb: 28000, list: 30, publishPerHour: 5 };
  const state = { sort: 'new', query: '', status: 'unconfigured', error: '', rows: [], skipped: 0 };
  let alive = false;
  let ticket = 0;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function config() {
    const raw = window.RL_COMMUNITY || {};
    const url = String(raw.supabaseUrl || '').trim().replace(/\/+$/, '');
    const key = String(raw.supabaseAnonKey || '').trim();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) return null;
    if (!/^[\w.-]{20,2000}$/.test(key)) return null;
    return { url: url, key: key };
  }
  function configured() { return !!config(); }

  function squash(value) {
    return String(value || '').toLowerCase()
      .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
      .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')
      .replace(/[^a-z]/g, '');
  }
  function nameAllowed(value) {
    const s = String(value || '').replace(/\s+/g, ' ').trim();
    if (!s || s.length > LIMITS.name) return false;
    if (/https?:\/\/|www\./i.test(s)) return false;
    const flat = squash(s);
    for (let i = 0; i < BLOCKED.length; i++) if (flat.indexOf(BLOCKED[i]) >= 0) return false;
    return true;
  }
  function cleanLabel(value, label) {
    const s = String(value || '').replace(/\s+/g, ' ').trim();
    if (!s || s.length > LIMITS.name) throw new Error(label + ' must be 1-24 characters.');
    if (!nameAllowed(s)) throw new Error('Name is not allowed');
    return s;
  }

  function clientId() {
    let id = '';
    try { id = localStorage.getItem(CLIENT_KEY) || ''; } catch (e) { id = ''; }
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = 'rc_' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
      try { localStorage.setItem(CLIENT_KEY, id); } catch (e) { /* storage may be blocked */ }
    }
    return id;
  }
  function voteMap() {
    try { return JSON.parse(localStorage.getItem(VOTE_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function remember(id, patch) {
    const all = voteMap();
    all[id] = Object.assign(all[id] || {}, patch);
    try { localStorage.setItem(VOTE_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ }
  }
  function pubStamps() {
    const now = Date.now();
    let stamps = [];
    try { stamps = JSON.parse(localStorage.getItem(PUB_KEY) || '[]') || []; } catch (e) { stamps = []; }
    return stamps.filter((t) => now - t < 3600000);
  }
  function tooSoon() { return pubStamps().length >= LIMITS.publishPerHour; }
  function markPub() {
    const stamps = pubStamps();
    stamps.push(Date.now());
    try { localStorage.setItem(PUB_KEY, JSON.stringify(stamps)); } catch (e) { /* ignore */ }
  }

  function cleanThumb(url) {
    if (typeof url !== 'string' || url.length > LIMITS.thumb) return '';
    if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(url)) return '';
    return url;
  }
  function thumbnail(def) {
    try {
      const n = RL.Tracks.normalize(def);
      const geom = RL.Tracks.sampleLoop(n.pts, false);
      const c = document.createElement('canvas');
      c.width = 160; c.height = 100;
      const g = c.getContext('2d');
      const th = RL.THEMES[n.theme] || RL.THEMES.city;
      g.fillStyle = th.bg; g.fillRect(0, 0, 160, 100);
      if (!geom.N) return '';
      const pad = 8;
      const s = Math.min((160 - pad * 2) / Math.max(1, geom.maxX - geom.minX), (100 - pad * 2) / Math.max(1, geom.maxY - geom.minY));
      g.translate(pad + (160 - pad * 2 - (geom.maxX - geom.minX) * s) / 2, pad + (100 - pad * 2 - (geom.maxY - geom.minY) * s) / 2);
      g.scale(s, s);
      g.translate(-geom.minX, -geom.minY);
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      geom.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.strokeStyle = th.road; g.lineWidth = n.width; g.stroke();
      g.strokeStyle = th.line; g.lineWidth = Math.max(2, n.width * 0.04); g.stroke();
      const url = c.toDataURL('image/jpeg', 0.62);
      return cleanThumb(url.length > LIMITS.thumb ? c.toDataURL('image/jpeg', 0.35) : url);
    } catch (e) { return ''; }
  }

  function explainHttp(status, message) {
    if (status === 401 || status === 403 || status === 404) return MESSAGES.setup;
    const clean = String(message || '').replace(/\s+/g, ' ').trim();
    if (clean && clean.length <= 180 && !/[<>]/.test(clean)) return clean;
    return MESSAGES.offline;
  }
  async function request(path, options) {
    const c = config();
    if (!c) throw new Error(MESSAGES.unconfigured);
    const headers = { apikey: c.key, Authorization: 'Bearer ' + c.key, Accept: 'application/json' };
    if (options && options.body) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(c.url + path, {
        method: (options && options.method) || 'GET',
        headers: headers,
        body: options && options.body ? JSON.stringify(options.body) : undefined,
        signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(8000) : undefined
      });
    } catch (e) { throw new Error(MESSAGES.offline); }
    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); }
      catch (e) { throw new Error(MESSAGES.offline); }
    }
    if (!res.ok) throw new Error(explainHttp(res.status, data && (data.message || data.error_description || data.hint)));
    return data;
  }

  function acceptRow(row) {
    if (!row || typeof row !== 'object') return null;
    const id = String(row.id || '');
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return null;
    let def;
    try { def = RL.Tracks.fromShareCode(row.share_code); }
    catch (e) { return null; }
    const report = RL.Tracks.validate(def);
    if (!report.ok) return null;
    const author = String(row.author || '').replace(/\s+/g, ' ').trim();
    if (!nameAllowed(def.name) || !nameAllowed(author)) return null;
    if (def.theme !== row.theme) return null;
    return {
      id: id,
      name: def.name,
      author: author,
      theme: def.theme,
      plays: Math.max(0, Number(row.plays) || 0),
      likes: Math.max(0, Number(row.likes) || 0),
      rating: Math.max(0, Number(row.rating_avg) || 0),
      ratingCount: Math.max(0, Number(row.rating_count) || 0),
      thumbnail: cleanThumb(row.thumbnail || ''),
      def: def
    };
  }
  function find(id) {
    for (let i = 0; i < state.rows.length; i++) if (state.rows[i].id === id) return state.rows[i];
    return null;
  }

  function listPath() {
    const order = state.sort === 'top' ? 'rating_avg.desc,rating_count.desc'
      : state.sort === 'played' ? 'plays.desc' : 'created_at.desc';
    let path = '/rest/v1/community_tracks_live?select=id,name,author,theme,share_code,thumbnail,plays,likes,rating_avg,rating_count,created_at&order=' + order + '&limit=' + LIMITS.list;
    const q = String(state.query || '').replace(/[^a-zA-Z0-9 \-]/g, '').trim().slice(0, LIMITS.name);
    if (q) path += '&or=(name.ilike.*' + q.replace(/ /g, '*') + '*,author.ilike.*' + q.replace(/ /g, '*') + '*)';
    return path;
  }
  function load() {
    const mine = ++ticket;
    if (!configured()) {
      state.status = 'unconfigured'; state.rows = []; state.skipped = 0; state.error = '';
      paint();
      return;
    }
    state.status = 'loading'; state.error = '';
    paint();
    request(listPath()).then((data) => {
      if (mine !== ticket || !alive) return;
      if (!Array.isArray(data)) throw new Error(MESSAGES.offline);
      const rows = [];
      let skipped = 0;
      data.forEach((row) => { const clean = acceptRow(row); if (clean) rows.push(clean); else skipped++; });
      state.rows = rows; state.skipped = skipped; state.status = 'ready';
      paint();
    }).catch((err) => {
      if (mine !== ticket || !alive) return;
      state.rows = []; state.skipped = 0;
      const msg = (err && err.message) || MESSAGES.offline;
      if (msg === MESSAGES.unconfigured) state.status = 'unconfigured';
      else if (msg === MESSAGES.setup) state.status = 'setup';
      else if (msg === MESSAGES.offline) state.status = 'offline';
      else { state.status = 'error'; state.error = msg; }
      paint();
    });
  }

  async function publish(def, author) {
    if (!configured()) throw new Error(MESSAGES.unconfigured);
    const name = cleanLabel(def && def.name, 'Track name');
    const by = cleanLabel(author, 'Author name');
    const copy = RL.Tracks.normalize(def);
    copy.name = name;
    const report = RL.Tracks.validate(copy);
    if (!report.ok) throw new Error((report.errors && report.errors[0]) || 'Track is not a closed, drivable loop');
    if (tooSoon()) throw new Error('Too many publishes. Try again in an hour.');
    const code = RL.Tracks.toShareCode(copy);
    if (!/^RL1\.[A-Za-z0-9_-]+$/.test(code) || code.length > LIMITS.code) throw new Error('Track is too large');
    const row = await request('/rest/v1/rpc/community_publish', {
      method: 'POST',
      body: { p_name: name, p_author: by, p_theme: copy.theme, p_code: code, p_thumb: thumbnail(copy), p_client: clientId() }
    });
    const accepted = acceptRow(row);
    if (!accepted) throw new Error('Published track failed the safety check');
    markPub();
    return accepted;
  }
  async function act(kind, id, extra) {
    const row = find(id);
    if (!row) return;
    const body = { p_track: id, p_client: clientId() };
    if (extra) Object.assign(body, extra);
    try {
      const data = await request('/rest/v1/rpc/community_' + kind, { method: 'POST', body: body });
      if (data && typeof data === 'object') {
        if (data.likes != null) row.likes = Number(data.likes) || 0;
        if (data.rating_avg != null) row.rating = Number(data.rating_avg) || 0;
        if (data.rating_count != null) row.ratingCount = Number(data.rating_count) || 0;
        if (data.plays != null) row.plays = Number(data.plays) || 0;
        if (kind === 'like') remember(id, { like: !!data.liked });
        if (kind === 'rate') remember(id, { stars: Number(extra && extra.p_stars) || 0 });
        if (kind === 'report') remember(id, { report: true });
      }
      paint();
    } catch (err) {
      if (RL.UI) RL.UI.toast((err && err.message) || MESSAGES.offline, '#ff3b6b');
      if (RL.Audio) RL.Audio.play('error');
    }
  }
  function recordPlay(id) {
    request('/rest/v1/rpc/community_play', { method: 'POST', body: { p_track: id, p_client: clientId() } }).then((data) => {
      const row = find(id);
      if (row && data && data.plays != null) row.plays = Number(data.plays) || 0;
    }).catch(() => {});
  }
  function race(id) {
    const row = find(id);
    if (!row || !RL.Game) return;
    const fp = (RL.FreePlay && RL.FreePlay.settings) || {};
    RL.UI.closeAll();
    RL.Game.startRace({
      kind: 'custom',
      track: 'community',
      trackDef: RL.Tracks.asRaceDef(row.def),
      laps: fp.laps || 3,
      aiCount: fp.aiCount == null ? 5 : fp.aiCount,
      difficulty: fp.difficulty == null ? 2 : fp.difficulty,
      weather: fp.weather || 'clear',
      time: fp.time || 'day',
      damage: fp.damage !== false,
      nitro: fp.nitro !== false,
      catchup: fp.catchup !== false,
      collision: fp.collision !== false,
      reverse: !!fp.reverse,
      classes: (fp.classes || []).slice(),
      title: row.name
    });
    recordPlay(id);
  }
  function keep(id) {
    const row = find(id);
    if (!row) return;
    try {
      const saved = RL.Tracks.save(row.def);
      if (RL.UI) RL.UI.toast('Saved ' + saved.name + ' on this device', '#7dff5a');
    } catch (err) {
      if (RL.UI) RL.UI.toast((err && err.message) || 'Could not save that track', '#ff3b6b');
    }
  }

  function paint() { if (alive && RL.UI && RL.UI.isOpen()) RL.UI.refresh(); }
  function stars(row) {
    const picked = (voteMap()[row.id] || {}).stars || 0;
    let h = '';
    for (let i = 1; i <= 5; i++) {
      h += '<button type="button" data-act="rate" data-arg="' + esc(row.id) + '|' + i + '"' + (picked === i ? ' class="on"' : '') + ' title="' + i + ' star' + (i > 1 ? 's' : '') + '">' + i + '</button>';
    }
    return h;
  }
  function card(row) {
    const th = (RL.THEMES[row.theme] && RL.THEMES[row.theme].name) || row.theme;
    const voted = voteMap()[row.id] || {};
    const rating = row.ratingCount ? (row.rating.toFixed(1) + ' (' + row.ratingCount + ')') : 'Not rated';
    const pic = row.thumbnail
      ? '<img alt="' + esc(row.name) + '" src="' + esc(row.thumbnail) + '">'
      : '<div class="ct-ph"></div>';
    return '<div class="ct-card">' + pic + '<div class="ct-meta"><b>' + esc(row.name) + '</b>' +
      '<div class="small">by ' + esc(row.author) + ' · ' + esc(th) + '</div>' +
      '<div class="small">★ ' + rating + ' · ' + row.plays + ' played · ' + row.likes + ' likes</div>' +
      '<div class="row ct-actions"><button type="button" class="primary" data-act="play" data-arg="' + esc(row.id) + '">Play</button>' +
      '<button type="button" data-act="like" data-arg="' + esc(row.id) + '">' + (voted.like ? 'Liked' : 'Like') + '</button>' +
      '<span class="ct-stars">' + stars(row) + '</span>' +
      '<button type="button" data-act="keep" data-arg="' + esc(row.id) + '">Save here</button>' +
      '<button type="button" data-act="report" data-arg="' + esc(row.id) + '|spam"' + (voted.report ? ' disabled' : '') + '>' + (voted.report ? 'Reported' : 'Report') + '</button></div></div></div>';
  }
  function body() {
    let h = '<div class="fp-line ct-tools"><span>Sort</span>' +
      '<button type="button" data-act="sort" data-arg="new"' + (state.sort === 'new' ? ' class="on"' : '') + '>Newest</button>' +
      '<button type="button" data-act="sort" data-arg="top"' + (state.sort === 'top' ? ' class="on"' : '') + '>Top rated</button>' +
      '<button type="button" data-act="sort" data-arg="played"' + (state.sort === 'played' ? ' class="on"' : '') + '>Most played</button>' +
      '<input id="ct-q" type="search" placeholder="Search name or author" value="' + esc(state.query) + '" maxlength="24">' +
      '<button type="button" data-act="search">Search</button>' +
      '<button type="button" data-act="reload">Reload</button></div>';
    if (state.status === 'unconfigured') return h + '<p class="ct-note">' + esc(MESSAGES.unconfigured) + '</p>';
    if (state.status === 'offline') return h + '<p class="ct-note">' + esc(MESSAGES.offline) + '</p>';
    if (state.status === 'setup') return h + '<p class="ct-note">' + esc(MESSAGES.setup) + '</p>';
    if (state.status === 'loading') return h + '<p class="small">Loading community tracks…</p>';
    if (state.status === 'error') return h + '<p class="ct-note">' + esc(state.error || MESSAGES.offline) + '</p>';
    if (state.skipped) h += '<p class="small">' + state.skipped + ' listing' + (state.skipped === 1 ? '' : 's') + ' hidden because ' + (state.skipped === 1 ? 'it is' : 'they are') + ' not a closed, drivable circuit.</p>';
    if (!state.rows.length) h += '<p class="dim">' + (state.query ? 'No tracks match that search.' : 'No community tracks yet. Publish one from the Track Editor.') + '</p>';
    else h += '<div class="ct-list">' + state.rows.map(card).join('') + '</div>';
    return h;
  }
  function view() {
    return {
      title: '🌐 Community Tracks',
      cls: 'wide',
      onClose: () => { alive = false; ticket++; },
      render: body,
      acts: {
        sort: (id) => { if (id === 'new' || id === 'top' || id === 'played') { state.sort = id; load(); } },
        search: () => { const el = document.getElementById('ct-q'); state.query = el ? el.value : ''; load(); },
        reload: () => load(),
        play: (id) => race(id),
        like: (id) => { act('like', id); },
        rate: (arg) => {
          const cut = String(arg || '').lastIndexOf('|');
          if (cut < 0) return;
          const starsN = Number(String(arg).slice(cut + 1));
          if (starsN < 1 || starsN > 5) return;
          act('rate', String(arg).slice(0, cut), { p_stars: starsN });
        },
        report: (arg) => {
          const cut = String(arg || '').lastIndexOf('|');
          const id = cut < 0 ? arg : String(arg).slice(0, cut);
          const reason = cut < 0 ? 'spam' : String(arg).slice(cut + 1);
          act('report', id, { p_reason: reason === 'offensive' || reason === 'broken' ? reason : 'spam' });
        },
        keep: (id) => keep(id)
      }
    };
  }
  function open() {
    alive = true;
    state.sort = state.sort || 'new';
    if (RL.UI) RL.UI.open(view());
    load();
  }

  return {
    open: open,
    publish: publish,
    configured: configured,
    nameAllowed: nameAllowed,
    thumbnail: thumbnail,
    messages: MESSAGES,
    LIMITS: LIMITS,
    get rows() { return state.rows; },
    /* Circuits currently listed, so a multiplayer host can pick one. */
    lobbyTracks() {
      return (state.rows || []).map((row) => {
        const def = RL.Tracks.asRaceDef(row.def);
        def.name = row.name;
        return { key: 'cm_' + row.id, name: row.name, def: def };
      });
    }
  };
})();
