/* auth.js — Google sign-in for City Servers.
   Uses the anon key in community-config.js. The Supabase client is loaded from
   a CDN the first time someone opens City Servers, the same way race rooms load
   PeerJS. Guests can play without an account. They never get a user id, so the
   bounty RPCs refuse to write a leaderboard row for them.
   Keep BLOCKED in sync with server_name_blocked() in docs/ONLINE_SERVERS.md
   and with BLOCKED in js/community.js. */
window.RL = window.RL || {};

RL.Auth = (function () {
  const BLOCKED = ['fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'slut', 'whore', 'porn'];
  const GUEST_KEY = 'redline_legends_server_guest_v1';
  const NICK_KEY = 'redline_legends_server_nick_v1';
  const CDNS = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://unpkg.com/@supabase/supabase-js@2'
  ];
  const MESSAGES = {
    unconfigured: "Online servers aren't connected yet. Add the Supabase URL and anon key in js/community-config.js (see docs/ONLINE_SERVERS.md). Free roam on this device still works, and race rooms still use the 4-character code.",
    offline: 'Online servers are offline right now. Free roam on this device still works, and race rooms still use the 4-character code.',
    setup: 'Online servers rejected the request. Check the anon key and the SQL in docs/ONLINE_SERVERS.md. Free roam on this device still works.',
    file: 'Google sign-in needs the game on https (itch.io) or http://localhost. You can still play as a guest.',
    name: 'Use 1–16 letters, numbers, or spaces, and skip blocked words.',
    auth: 'Google sign-in did not finish. You can still play as a guest.'
  };

  let client = null;
  let profile = null;
  let mode = 'unconfigured';
  let booting = null;
  let authBound = false;
  let adopting = false;
  let adoptChain = Promise.resolve();
  const listeners = [];

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
  function blocked(value) {
    const flat = squash(value);
    for (let i = 0; i < BLOCKED.length; i++) if (flat.indexOf(BLOCKED[i]) >= 0) return true;
    return false;
  }
  /* Strip characters the board cannot show, then reject profanity and links.
     Returns the nickname, or null when nothing usable is left. */
  function cleanNick(value) {
    let s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    try { s = s.replace(/[^\p{L}\p{N} .'_-]/gu, ''); }
    catch (e) { s = s.replace(/[^A-Za-z0-9 .'_-]/g, ''); }
    s = s.replace(/\s+/g, ' ').trim().slice(0, 16);
    if (!s || s.length > 16) return null;
    if (/https?:\/\/|www\./i.test(s)) return null;
    if (blocked(s)) return null;
    return s;
  }
  function nameAllowed(value) {
    const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return !!s && s.length <= 16 && cleanNick(s) === s;
  }

  function googleName(user) {
    const meta = (user && user.user_metadata) || {};
    const idData = user && user.identities && user.identities[0] && user.identities[0].identity_data;
    return meta.full_name || meta.name || (idData && (idData.full_name || idData.name)) || '';
  }
  function guestId() {
    let id = '';
    try { id = localStorage.getItem(GUEST_KEY) || ''; } catch (e) { id = ''; }
    if (!/^g_[A-Za-z0-9]{8,24}$/.test(id)) {
      const body = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + 'abcdefghij').replace(/[^a-z0-9]/g, '').slice(0, 16);
      id = 'g_' + body;
      try { localStorage.setItem(GUEST_KEY, id); } catch (e) { /* private mode */ }
    }
    return id;
  }
  function emit() { listeners.forEach((fn) => { try { fn(status()); } catch (e) { /* listener */ } }); }

  function libCreate() {
    const lib = window.supabase;
    if (!lib) return null;
    if (typeof lib.createClient === 'function') return lib.createClient;
    if (lib.default && typeof lib.default.createClient === 'function') return lib.default.createClient;
    return null;
  }
  function injectScript(url) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = () => done(!!libCreate());
      s.onerror = () => done(false);
      document.head.appendChild(s);
      setTimeout(() => done(!!libCreate()), 8000);
    });
  }
  let loader = null;
  function loadLibrary() {
    if (libCreate()) return Promise.resolve(true);
    if (loader) return loader;
    loader = (async () => {
      for (let i = 0; i < CDNS.length; i++) {
        const ok = await injectScript(CDNS[i]);
        if (ok && libCreate()) return true;
      }
      return false;
    })();
    return loader;
  }

  function explain(error) {
    const msg = error && (error.message || error.error_description || error.hint) || '';
    const code = error && (error.code || error.status);
    if (code === 401 || code === 403 || code === '401' || code === '403' || code === 'PGRST301' || /jwt|permission|unauthorized|api key/i.test(String(msg))) {
      return MESSAGES.setup;
    }
    return MESSAGES.offline;
  }

  async function ensureClient() {
    const c = config();
    if (!c) { mode = 'unconfigured'; return null; }
    if (client) return client;
    const ok = await loadLibrary();
    const create = libCreate();
    if (!ok || !create) { mode = 'offline'; return null; }
    try {
      client = create(c.url, c.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce'
        },
        realtime: { params: { eventsPerSecond: 20 } }
      });
    } catch (e) {
      client = null;
      mode = 'offline';
      return null;
    }
    return client;
  }

  function adopt(session) {
    const run = () => adoptNow(session);
    adoptChain = adoptChain.then(run, run);
    return adoptChain;
  }
  async function adoptNow(session) {
    if (adopting) return;
    adopting = true;
    try {
      const user = session && session.user;
      if (!user || !user.id) {
        if (mode === 'user') { profile = null; mode = 'signed-out'; emit(); }
        return;
      }
      const google = googleName(user);
      const saved = user.user_metadata && user.user_metadata.nickname;
      const nick = cleanNick(saved) || cleanNick(google) || 'Racer';
      profile = {
        id: String(user.id),
        guest: false,
        nickname: nick,
        googleName: cleanNick(google),
        email: user.email || null
      };
      mode = 'user';
      emit();
      if (saved !== nick && client && client.auth && client.auth.updateUser) {
        try { await client.auth.updateUser({ data: { nickname: nick } }); }
        catch (e) { /* the RPC still stores the board name */ }
      }
      try {
        const set = await rpc('set_nickname', { p_name: nick });
        if (set && set.ok && set.nickname && cleanNick(set.nickname)) {
          profile.nickname = cleanNick(set.nickname);
          emit();
        }
      } catch (e) { /* next claim retries the name */ }
    } finally { adopting = false; }
  }

  async function boot() {
    if (booting) return booting;
    booting = (async () => {
      if (!configured()) { mode = 'unconfigured'; profile = null; return status(); }
      const c = await ensureClient();
      if (!c || !c.auth) { mode = 'offline'; return status(); }
      try {
        if (!authBound && c.auth.onAuthStateChange) {
          authBound = true;
          c.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
              if (mode === 'guest') return;
              profile = null; mode = 'signed-out'; emit(); return;
            }
            if (session && session.user && mode !== 'guest') adopt(session);
          });
        }
        const got = await c.auth.getSession();
        const session = got && got.data && got.data.session;
        if (session) await adopt(session);
        else if (mode !== 'guest') { mode = 'signed-out'; profile = null; }
      } catch (e) {
        mode = 'offline';
      }
      return status();
    })();
    try { return await booting; }
    finally { booting = null; }
  }

  async function rpc(name, args) {
    const c = client || await ensureClient();
    if (!c || !c.rpc) {
      return { ok: false, reason: configured() ? 'offline' : 'unconfigured', message: configured() ? MESSAGES.offline : MESSAGES.unconfigured };
    }
    let res;
    try { res = await c.rpc(name, args || {}); }
    catch (e) { return { ok: false, reason: 'offline', message: MESSAGES.offline }; }
    if (!res || res.error) return { ok: false, reason: 'offline', message: explain(res && res.error) };
    return res.data;
  }

  async function signInGoogle() {
    if (!configured()) return { ok: false, reason: 'unconfigured', message: MESSAGES.unconfigured };
    if (typeof location !== 'undefined' && location.protocol === 'file:') return { ok: false, reason: 'file', message: MESSAGES.file };
    await boot();
    if (!client || !client.auth || !client.auth.signInWithOAuth) return { ok: false, reason: 'offline', message: MESSAGES.offline };
    const redirectTo = location.origin + location.pathname;
    let res;
    try {
      res = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTo,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' }
        }
      });
    } catch (e) {
      return { ok: false, reason: 'auth', message: MESSAGES.auth };
    }
    if (res && res.error) return { ok: false, reason: 'auth', message: MESSAGES.auth };
    const url = res && res.data && res.data.url;
    if (url) {
      const popup = window.open(url, 'rl-google', 'popup,width=520,height=680');
      if (!popup) location.assign(url);
      return { ok: true, pending: true };
    }
    try {
      const got = await client.auth.getSession();
      const session = got && got.data && got.data.session;
      if (session) { await adopt(session); return { ok: true }; }
    } catch (e) { /* fall through */ }
    return { ok: false, reason: 'auth', message: MESSAGES.auth };
  }

  async function signOut() {
    const wasUser = mode === 'user';
    if (client && client.auth && client.auth.signOut) {
      try { await client.auth.signOut(); } catch (e) { /* local session still drops */ }
    }
    if (wasUser || mode === 'user') { profile = null; mode = configured() ? 'signed-out' : 'unconfigured'; }
    emit();
    return status();
  }

  async function playAsGuest(name) {
    const typed = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
    if (typed && !nameAllowed(typed)) return { ok: false, reason: 'name', message: MESSAGES.name };
    if (mode === 'user') await signOut();
    const nick = cleanNick(typed) || 'Guest';
    profile = { id: guestId(), guest: true, nickname: nick, googleName: null, email: null };
    mode = 'guest';
    try { localStorage.setItem(NICK_KEY, nick); } catch (e) { /* ignore */ }
    emit();
    return { ok: true, nickname: nick };
  }

  async function setNickname(name) {
    if (!nameAllowed(name)) return { ok: false, reason: 'name', message: MESSAGES.name };
    const nick = cleanNick(name);
    if (!profile) return { ok: false, reason: 'signed-out', message: MESSAGES.auth };
    if (profile.guest) {
      profile = Object.assign({}, profile, { nickname: nick });
      try { localStorage.setItem(NICK_KEY, nick); } catch (e) { /* ignore */ }
      emit();
      return { ok: true, nickname: nick };
    }
    await boot();
    const data = await rpc('set_nickname', { p_name: nick });
    if (!data || data.ok === false) return { ok: false, reason: (data && data.reason) || 'name', message: MESSAGES.name };
    const saved = cleanNick(data.nickname) || nick;
    profile = Object.assign({}, profile, { nickname: saved });
    if (client && client.auth && client.auth.updateUser) {
      try { await client.auth.updateUser({ data: { nickname: saved } }); } catch (e) { /* board name is already stored */ }
    }
    emit();
    return { ok: true, nickname: saved };
  }

  function status() {
    return {
      mode: mode,
      configured: configured(),
      nickname: profile ? profile.nickname : '',
      guest: !!(profile && profile.guest),
      id: profile ? profile.id : ''
    };
  }

  return {
    boot: boot,
    configured: configured,
    config: config,
    status: status,
    profile: () => profile ? Object.assign({}, profile) : null,
    signInGoogle: signInGoogle,
    signOut: signOut,
    playAsGuest: playAsGuest,
    setNickname: setNickname,
    nameAllowed: nameAllowed,
    cleanNick: cleanNick,
    rpc: rpc,
    ensureClient: ensureClient,
    onChange: (fn) => { if (typeof fn === 'function') listeners.push(fn); },
    messages: MESSAGES,
    BLOCKED: BLOCKED.slice()
  };
})();
