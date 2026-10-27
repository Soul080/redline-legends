/* ai-npc.js - Free-form NPC conversations. A small instruct model runs entirely
   in the player's browser through WebLLM on WebGPU. There is no API key.
   The library and the weights download once, after the player opts in, and the
   browser Cache API keeps them for later visits.

   This file owns the feature. The rest of the game only has small hooks:
     - index.html loads this script after game.js
     - ui.js bar list and dialogue views add a "Chat freely" button
     - ui.js Settings calls toggle() / settingsHint()
     - game.js stores settings.aiChat and settings.aiChatDeclined
   Scripted dialogue, quest effects, and choices are never modified from here.

   Model (WebLLM 0.2.86 prebuilt list):
     SmolLM2-360M-Instruct, 4-bit. Weights are about 198 MB and the WebGPU
     runtime is about 6 MB, so the first download is about 205 MB.
     GPU memory is about 380 MB, or about 580 MB on adapters without
     shader-f16 (the f32 build of the same model, same download size). */
RL.AiNpc = (function () {
  const INFO = {
    lib: 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/lib/index.js',
    modelId: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    fallbackModelId: 'SmolLM2-360M-Instruct-q4f32_1-MLC',
    downloadMB: 205,
    vramMB: 380,
    vramFallbackMB: 580
  };

  /* Voice used when data.js has no persona/personality string of its own.
     Hints are the rumors this character is allowed to offer, one at a time. */
  const VOICE = {
    mags: {
      voice: 'Gruff, warm mechanic. Short sentences. Calls the driver kid. Talks parts, repairs, and the long climb out of a junk hatch. Never claims to know who the Phantom is.',
      hints: 'Drifting fills nitro and nitro belongs on straights. Walls are not free. Grip parts matter when the weather turns.'
    },
    dana: {
      voice: 'Cocky drifter who teases rookies and loves a bet. Talks angle, not speeches.',
      hints: 'Hold the drift button into the turn and counter-steer on the way out. Four thousand points in a Drift Challenge is the number that matters.'
    },
    tom: {
      voice: 'Old, soft-spoken, and loyal to clean racing. Treats the Phantom as a rumor, not a person he can name.',
      hints: 'A podium with almost no damage earns respect. Someone rich pays for 300 km/h. The Phantom shows up for the Neon Legends final and nobody has seen a face.'
    },
    kim: {
      voice: 'Dry, no-nonsense coach. Pushes practice over promises.',
      hints: 'The Training Track is free and clean laps pay XP. Three sessions and the car starts to feel different.'
    },
    vex: {
      voice: 'Cold boss of the Vipers. Few words, all of them a threat or a test. Respects nerve.',
      hints: 'Ice punishes bad tires. The Vipers run this city, and Vex does not arrive with an empty nitro tank.'
    },
    rita: {
      voice: 'A whisper and a grin. Trades one rumor, then waits to be asked for the next.',
      hints: 'The ghost on the Race Office board is the driver\'s own best lap. Rain cuts grip hard, snow cuts it harder, and tires with grip are the fix.'
    }
  };

  const sessions = {};
  const sinks = new Set();
  let engine = null;
  let modelUsed = null;
  let loadPromise = null;
  let libPromise = null;
  let gpuDead = false;
  let gpuProbed = false;
  let gpuF16 = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function clip(s, n) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return n && s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function sessionFor(id) {
    if (!sessions[id]) sessions[id] = { messages: [], phase: 'optin', progress: 0, progressText: '', busy: false, gen: 0, error: '' };
    return sessions[id];
  }

  /* ---------- Availability ---------- */
  /* Synchronous on purpose: the bar renders this every time it opens, and a
     failing graphics probe must not log or throw during a normal visit. */
  function blockReason() {
    if (gpuDead) return 'adapter';
    if (typeof window !== 'undefined' && window.isSecureContext === false) return 'insecure';
    const gpu = typeof navigator !== 'undefined' ? navigator.gpu : null;
    if (!gpu || typeof gpu.requestAdapter !== 'function') return 'unsupported';
    return null;
  }
  function declined() {
    const st = RL.settings;
    return !!(st && st.aiChatDeclined && !st.aiChat);
  }
  function buttonBlock() {
    return blockReason() || (declined() ? 'declined' : null);
  }
  function reasonText(code) {
    if (code === 'insecure') return 'Free chat needs WebGPU, which only runs on a secure page. Serve the game from localhost or HTTPS and open it in Chrome or Edge. Scripted talk still works.';
    if (code === 'adapter') return 'WebGPU is switched on, but no compatible graphics adapter was found. Free chat stays off. Scripted talk still works.';
    if (code === 'declined') return 'You declined the in-browser model. Turn Chat freely on in Settings if you want to be asked again.';
    return 'This browser has no WebGPU, so free chat stays off. Chrome or Edge on a computer can run it. Scripted talk still works.';
  }
  function shortReason(code) {
    if (code === 'insecure') return 'Free chat needs localhost or HTTPS so WebGPU can run.';
    if (code === 'adapter') return 'No compatible WebGPU adapter.';
    if (code === 'declined') return 'Free chat is off. Turn it on in Settings.';
    return 'This browser does not support WebGPU.';
  }

  function statusHtml() {
    try {
      const blocked = buttonBlock();
      let text;
      if (blocked) text = reasonText(blocked);
      else if (RL.settings && RL.settings.aiChat && engine) text = 'Free chat is ready on this device.';
      else if (RL.settings && RL.settings.aiChat) text = 'Free chat is on. The first conversation downloads the model (about ' + INFO.downloadMB + ' MB) and caches it in this browser.';
      else text = 'Chat freely downloads a small model once (about ' + INFO.downloadMB + ' MB) and keeps it in this browser. No API key.';
      return '<p class="small ai-status' + (blocked ? ' bad' : '') + '">' + esc(text) + '</p>';
    } catch (e) { return ''; }
  }
  function chatButtonHtml(npcId) {
    try {
      const blocked = buttonBlock();
      const title = blocked ? shortReason(blocked) : 'Unscripted talk. The model runs in this browser.';
      return '<button data-act="chat" data-arg="' + esc(npcId) + '"' + (blocked ? ' disabled' : '') + ' title="' + esc(title) + '">Chat freely</button>';
    } catch (e) { return ''; }
  }
  function settingsHint() {
    try {
      const blocked = blockReason();
      if (blocked) return reasonText(blocked) + ' The toggle stays off until the page can use WebGPU.';
      if (RL.settings && RL.settings.aiChat) return 'On. Chat freely runs SmolLM2 360M Instruct through WebLLM. First use downloads about ' + INFO.downloadMB + ' MB once (cached afterwards). No API key. Needs about ' + INFO.vramMB + ' MB of GPU memory, or about ' + INFO.vramFallbackMB + ' MB without 16-bit shaders.';
      if (RL.settings && RL.settings.aiChatDeclined) return 'Off. The bar button stays disabled until you turn this on. Turning it on lets you download the model from the bar.';
      return 'Off. Turn on to allow unscripted talk with bar NPCs. The model stays on this device; nothing is sent to a chat server.';
    } catch (e) { return ''; }
  }
  function toggle() {
    try {
      const st = RL.settings;
      if (!st) return;
      if (st.aiChat) {
        st.aiChat = false;
        RL.saveSettings();
        if (!anyBusy()) unloadEngine();
        return;
      }
      const reason = blockReason();
      if (reason) {
        st.aiChat = false;
        RL.saveSettings();
        if (RL.UI && RL.UI.toast) RL.UI.toast(shortReason(reason), '#ff8a2e');
        return;
      }
      /* Adapter probe is deferred until the player asks. requestAdapter()
         logs a browser warning when no adapter exists, so the bar must not
         call it just to draw. */
      probeAdapter().then((ok) => {
        if (!ok) {
          st.aiChat = false;
          RL.saveSettings();
          if (RL.UI && RL.UI.toast) RL.UI.toast(shortReason('adapter'), '#ff8a2e');
          if (RL.UI && RL.UI.isOpen && RL.UI.isOpen() && RL.UI.refresh) RL.UI.refresh();
          return;
        }
        st.aiChat = true;
        st.aiChatDeclined = false;
        RL.saveSettings();
        if (RL.UI && RL.UI.isOpen && RL.UI.isOpen() && RL.UI.refresh) RL.UI.refresh();
      }).catch(() => {});
    } catch (e) { /* leave the settings menu usable */ }
  }

  /* ---------- Persona, built from data.js plus the save ---------- */
  function npcLines(npc) {
    const out = [];
    const nodes = npc && npc.nodes || {};
    Object.keys(nodes).forEach((k) => { if (nodes[k] && nodes[k].text) out.push(clip(nodes[k].text, 220)); });
    return out.slice(0, 8);
  }
  function customPersona(npc, id) {
    if (npc && typeof npc.persona === 'string' && npc.persona.trim()) return npc.persona.trim();
    if (npc && typeof npc.personality === 'string' && npc.personality.trim()) return npc.personality.trim();
    return (VOICE[id] && VOICE[id].voice) || 'A regular at the Neon Bar. Speak the way their written lines already sound.';
  }
  function respectWord(n) {
    if (n >= 40) return 'famous on the street';
    if (n >= 20) return 'known around the bar';
    if (n >= 5) return 'a name a few people recognize';
    return 'a nobody';
  }
  /* What this NPC is allowed to know: league, respect, bosses already beaten,
     quests, and the flags scripted dialogue has already set. Later twists
     (who the Phantom is) stay out until the save says the player saw them. */
  function storyKnowledge() {
    const G = RL.Game, s = G && G.state;
    if (!s) return 'The driver just walked into town. Do not invent victories or name the Phantom.';
    const lines = [];
    let carName = 'an unknown car', damage = 0;
    try {
      const car = G.currentCar();
      const def = car && G.carDef(car.id);
      if (def) carName = def.name;
      if (car) damage = Math.round(car.damage || 0);
    } catch (e) { /* keep the prompt even if the garage data is mid-edit */ }
    const league = G.leagueData ? G.leagueData(s.league) : null;
    lines.push(s.name + ' is ' + respectWord(s.respect || 0) + ' (respect ' + (s.respect || 0) + '), driving a ' + carName + ' at ' + damage + '% damage.');
    lines.push('Current league: ' + s.league + (league ? ' ' + league.name : '') + '.');
    (RL.LEAGUES || []).forEach((L) => {
      const beaten = !!(s.flags && s.flags['leagueBoss' + L.id]);
      const boss = L.boss || {};
      if (beaten) lines.push('Already beaten: ' + boss.name + ' (' + L.name + ').');
      else lines.push('Not beaten yet: ' + (boss.name || 'a boss') + ' of ' + L.name + '. ' + clip(boss.desc || '', 160));
    });
    if (s.flags && (s.flags.champion || s.flags.leagueBoss4)) lines.push('The driver is the Redline Legend. The ending revealed the Phantom was Mags. Mention that only if asked.');
    else lines.push('The Phantom\'s identity is still a secret. Do not guess who they are.');
    if (s.flags && s.flags.vexDeal) lines.push('The driver took Vex\'s money to throw races. The bar is uneasy about it.');
    if (s.flags && s.flags.vexRefused) lines.push('The driver refused to throw races for the Vipers.');
    if (s.flags && s.flags.danaBet) lines.push('The driver has a drift bet with Drift Dana.');
    if (s.flags && s.flags.magsCash) lines.push('Mags already handed the driver a little cash for parts.');
    const q = s.quests || {};
    const active = (q.active || []).map((id) => RL.QUESTS && RL.QUESTS[id]).filter(Boolean).slice(0, 4).map((d) => d.title + ' — ' + clip(d.desc, 120));
    const done = (q.done || []).map((id) => RL.QUESTS && RL.QUESTS[id]).filter(Boolean).slice(-6).map((d) => d.title);
    if (active.length) lines.push('Open jobs: ' + active.join(' | '));
    if (done.length) lines.push('Finished jobs: ' + done.join(', '));
    return lines.join('\n');
  }
  function systemPrompt(npcId) {
    const npc = RL.NPCS[npcId] || { name: 'a stranger', nodes: {} };
    const lines = npcLines(npc);
    const hints = (VOICE[npcId] && VOICE[npcId].hints) || 'Only hint at things this character would actually say.';
    return [
      'You are ' + npc.name + ' in the street-racing world of Redline Legends. Stay in character.',
      'Reply with one to three short sentences of spoken dialogue. No stage directions, lists, or markdown.',
      'You are not an assistant. Never mention AI, models, prompts, or being a program.',
      'Offer at most one rumor or racing hint, and only when it fits. Do not dump everything you know.',
      'Do not invent results, cash, or jobs. Do not claim the driver did something the story notes do not support.',
      'Personality: ' + clip(customPersona(npc, npcId), 420),
      lines.length ? 'Lines you have said before:\n- ' + lines.join('\n- ') : '',
      'Hints you may drop, one at a time: ' + hints,
      'Story so far:\n' + storyKnowledge()
    ].filter(Boolean).join('\n');
  }
  function previewPrompt(npcId) {
    try { return systemPrompt(npcId); } catch (e) { return ''; }
  }

  /* ---------- Model lifecycle ---------- */
  function loadLib() {
    if (!libPromise) libPromise = import(INFO.lib).catch((err) => { libPromise = null; throw err; });
    return libPromise;
  }
  function onReport(report) {
    sinks.forEach((fn) => { try { fn(report); } catch (e) { /* a closed panel must not break the download */ } });
  }
  /* One probe per page. A missing adapter is remembered so later visits
     disable the button instead of asking the browser again. */
  function probeAdapter() {
    if (gpuProbed) return Promise.resolve(!gpuDead);
    if (blockReason()) { gpuProbed = true; return Promise.resolve(false); }
    gpuProbed = true;
    return Promise.resolve().then(() => navigator.gpu.requestAdapter()).then((adapter) => {
      if (!adapter) { gpuDead = true; return false; }
      gpuF16 = !!(adapter.features && adapter.features.has && adapter.features.has('shader-f16'));
      return true;
    }).catch(() => { gpuDead = true; return false; });
  }
  async function chooseModel(webllm) {
    const ready = await probeAdapter();
    if (!ready) throw new Error('No WebGPU adapter');
    const list = (webllm.prebuiltAppConfig && webllm.prebuiltAppConfig.model_list) || [];
    const preferred = gpuF16 ? INFO.modelId : INFO.fallbackModelId;
    const alt = gpuF16 ? INFO.fallbackModelId : INFO.modelId;
    const id = list.some((m) => m.model_id === preferred) ? preferred : (list.some((m) => m.model_id === alt) ? alt : '');
    if (!id) throw new Error('Model is not in this WebLLM build');
    return id;
  }
  function buildEngine() {
    return loadLib().then(async (webllm) => {
      const modelId = await chooseModel(webllm);
      modelUsed = modelId;
      return webllm.CreateMLCEngine(modelId, { initProgressCallback: onReport, logLevel: 'SILENT' });
    });
  }
  function ensureEngine() {
    if (engine) return Promise.resolve(engine);
    if (!loadPromise) {
      loadPromise = buildEngine().then((eng) => { engine = eng; return eng; }).catch((err) => { loadPromise = null; throw err; });
    }
    return loadPromise;
  }
  function unloadEngine() {
    const eng = engine;
    engine = null;
    modelUsed = null;
    if (eng && typeof eng.unload === 'function') Promise.resolve(eng.unload()).catch(() => {});
  }
  function anyBusy() {
    return Object.keys(sessions).some((id) => sessions[id].busy);
  }
  function friendlyError(err) {
    const msg = String((err && (err.message || err)) || '');
    if (/shader-f16|required feature/i.test(msg)) return 'This graphics adapter is missing a feature the model needs. Scripted talk still works.';
    if (/webgpu|adapter|device|gpu/i.test(msg)) { gpuDead = true; return reasonText('adapter'); }
    if (/fetch|network|import|failed to load/i.test(msg)) return 'The model could not be downloaded. Check the connection and try again.';
    return 'The model did not start. You can try again, or keep using scripted talk.';
  }
  function progressLabel(session) {
    const pct = Math.round(Math.max(0, Math.min(1, Number(session.progress) || 0)) * 100);
    const detail = clip(session.progressText || '', 180);
    const head = /from cache/i.test(detail) ? 'Loading saved model… ' + pct + '%' : 'Downloading model… ' + pct + '%';
    return detail ? head + ' — ' + detail : head;
  }
  function paintProgress(session) {
    const fill = document.getElementById('ai-progress-fill');
    const label = document.getElementById('ai-progress-text');
    const pct = Math.round(Math.max(0, Math.min(1, Number(session.progress) || 0)) * 100);
    if (fill) fill.style.width = pct + '%';
    if (label) label.textContent = progressLabel(session);
  }
  function chatStillOpen(npcId) {
    const el = document.getElementById('ai-npc-root');
    return !!(el && el.getAttribute('data-npc') === npcId);
  }
  function safeRefresh(npcId) {
    if (chatStillOpen(npcId) && RL.UI && RL.UI.refresh) RL.UI.refresh();
  }
  function startLoad(npcId, session) {
    const sink = (report) => {
      const p = Number(report && report.progress);
      if (isFinite(p)) session.progress = Math.max(0, Math.min(1, p));
      session.progressText = report && report.text ? String(report.text) : session.progressText;
      if (chatStillOpen(npcId)) paintProgress(session);
    };
    sinks.add(sink);
    session.phase = 'loading';
    session.error = '';
    ensureEngine().then(() => {
      sinks.delete(sink);
      session.phase = 'chat';
      ensureGreeting(npcId, session);
      if (chatStillOpen(npcId)) safeRefresh(npcId);
      else if (RL.UI && RL.UI.toast) RL.UI.toast('Free chat model is ready.', '#7dff5a');
    }).catch((err) => {
      sinks.delete(sink);
      session.phase = 'error';
      session.error = friendlyError(err);
      safeRefresh(npcId);
    });
  }

  /* ---------- Chat panel ---------- */
  function ensureGreeting(npcId, session) {
    if (session.messages.length) return;
    const npc = RL.NPCS[npcId];
    const node = npc && npc.nodes && npc.nodes[npc.start];
    session.messages.push({ role: 'assistant', content: node && node.text ? node.text : 'You looking for me?' });
  }
  function fallbackLine(npcId) {
    const npc = RL.NPCS[npcId];
    const node = npc && npc.nodes && npc.nodes[npc.start];
    return (node && node.text) || 'Buy me a drink and ask me about the street.';
  }
  function cleanReply(text, npc) {
    let t = String(text || '').replace(/\r/g, '').trim();
    const short = String((npc && npc.name) || '').split('(')[0].trim();
    if (short) t = t.replace(new RegExp('^' + short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*', 'i'), '');
    const cut = t.search(/\n\s*(?:Player|You|User)\s*:/i);
    if (cut >= 0) t = t.slice(0, cut).trim();
    const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (parts.length > 3) t = parts.slice(0, 3).join(' ');
    if (/as an ai|language model|i am an? (ai|llm)|i'm an? (ai|llm)|chatgpt|openai/i.test(t)) return '';
    return t.trim();
  }
  function historyFor(npcId, session) {
    const msgs = [{ role: 'system', content: systemPrompt(npcId) }];
    session.messages.filter((m) => m.content && (m.role === 'user' || m.role === 'assistant')).slice(-8).forEach((m) => {
      msgs.push({ role: m.role, content: clip(m.content, 500) });
    });
    return msgs;
  }
  function paintReply(text) {
    const span = document.getElementById('ai-reply-text');
    if (span) span.textContent = text || '…';
    const log = document.getElementById('ai-log');
    if (log) log.scrollTop = log.scrollHeight;
  }
  function finishReply(npcId, session, text) {
    const last = session.messages[session.messages.length - 1];
    if (last && last.role === 'assistant') last.content = text || fallbackLine(npcId);
    session.busy = false;
    if (!chatStillOpen(npcId)) return;
    safeRefresh(npcId);
    setTimeout(() => {
      const input = document.getElementById('ai-input');
      if (input) input.focus();
      const log = document.getElementById('ai-log');
      if (log) log.scrollTop = log.scrollHeight;
    }, 30);
  }
  async function reply(npcId, session, gen) {
    await Promise.resolve();
    try {
      if (session.gen !== gen) return;
      const eng = engine || await ensureEngine();
      if (session.gen !== gen) return;
      const raw = await streamInto(eng, historyFor(npcId, session), npcId, session, gen);
      if (session.gen !== gen) return;
      const npc = RL.NPCS[npcId];
      finishReply(npcId, session, cleanReply(raw, npc));
    } catch (e) {
      if (session.gen !== gen) return;
      finishReply(npcId, session, fallbackLine(npcId));
    }
  }
  async function streamInto(eng, messages, npcId, session, gen) {
    const result = await eng.chat.completions.create({ messages: messages, temperature: 0.7, max_tokens: 100, stream: true });
    if (!result || typeof result[Symbol.asyncIterator] !== 'function') {
      const choice = result && result.choices && result.choices[0];
      return (choice && choice.message && choice.message.content) || '';
    }
    let acc = '';
    for await (const chunk of result) {
      if (session.gen !== gen) {
        if (eng.interruptGenerate) Promise.resolve(eng.interruptGenerate()).catch(() => {});
        return acc;
      }
      const choice = chunk && chunk.choices && chunk.choices[0];
      const delta = choice && choice.delta && choice.delta.content;
      if (!delta) continue;
      acc += delta;
      const last = session.messages[session.messages.length - 1];
      if (last && last.role === 'assistant') last.content = acc;
      if (chatStillOpen(npcId)) paintReply(acc);
    }
    return acc;
  }
  function send(npcId, session) {
    if (session.busy || session.phase !== 'chat' || !engine) return;
    const input = document.getElementById('ai-input');
    const text = clip(input && input.value, 280);
    if (!text) return;
    session.messages.push({ role: 'user', content: text });
    session.messages.push({ role: 'assistant', content: '' });
    session.busy = true;
    const gen = ++session.gen;
    reply(npcId, session, gen);
  }

  function root(npcId, inner) {
    return '<div id="ai-npc-root" data-npc="' + esc(npcId) + '">' + inner + '</div>';
  }
  function renderOptIn(npcId) {
    const loaded = engine ? ' The model is already loaded in this tab, so this will not download it again.' : '';
    return root(npcId, '<p>Free chat runs a small instruct model in this browser. Lines are not sent to a chat server, and there is no API key.</p>' +
      '<ul class="help"><li><b>Model:</b> SmolLM2 360M Instruct, 4-bit, via WebLLM.</li>' +
      '<li><b>Download:</b> about ' + INFO.downloadMB + ' MB the first time (about 198 MB of weights and a 6 MB WebGPU runtime). The browser caches it.</li>' +
      '<li><b>Graphics:</b> WebGPU, about ' + INFO.vramMB + ' MB of GPU memory, or about ' + INFO.vramFallbackMB + ' MB if the adapter has no 16-bit shaders. Chrome or Edge on a computer, from localhost or HTTPS.</li>' +
      '<li>They keep the personality and the rumors from their scripted lines, and they only know the story you have already reached. Those scripted choices stay as they are.</li></ul>' +
      '<p>' + (engine ? 'Open the conversation?' : 'Download the model and start talking?') + loaded + '</p>' +
      '<div class="row"><button class="primary" data-act="download">' + (engine ? 'Start chatting' : 'Download and chat') + '</button><button data-act="decline">Not now</button></div>');
  }
  function renderLoading(npcId, session) {
    const pct = Math.round(Math.max(0, Math.min(1, Number(session.progress) || 0)) * 100);
    return root(npcId, '<p>Fetching the model into this browser. The bar finishes once, then later visits load the cached copy.</p>' +
      '<div class="ai-progress"><div class="bar"><i id="ai-progress-fill" style="width:' + pct + '%"></i></div>' +
      '<p class="small" id="ai-progress-text">' + esc(progressLabel(session)) + '</p></div>' +
      '<p class="small">You can close this panel. A download that already started keeps whatever the browser has cached.</p>');
  }
  function renderError(npcId, session) {
    return root(npcId, '<p>' + esc(session.error || 'The model did not start.') + '</p><div class="row"><button class="primary" data-act="retry">Try again</button><button data-act="back">Back</button></div>');
  }
  function renderUnavailable(npcId, session) {
    return root(npcId, '<p>' + esc(reasonText(session.error || blockReason() || 'unsupported')) + '</p><div class="row"><button class="primary" data-act="back">Back</button></div>');
  }
  function renderChat(npcId, session) {
    const npc = RL.NPCS[npcId];
    const who = npc ? npc.name : 'NPC';
    const color = npc && /^#[0-9a-fA-F]{3,8}$/.test(npc.color) ? npc.color : '#ffe03b';
    const log = session.messages.map((m, i) => {
      const mine = m.role === 'user';
      const last = session.busy && i === session.messages.length - 1;
      return '<div class="ai-msg ' + (mine ? 'you' : 'npc') + '"><b style="color:' + (mine ? '#2ee6ff' : color) + '">' + esc(mine ? 'You' : who) + '</b> <span' + (last ? ' id="ai-reply-text"' : '') + '>' + esc(m.content || (last ? '…' : '')) + '</span></div>';
    }).join('');
    const vram = modelUsed === INFO.fallbackModelId ? INFO.vramFallbackMB : INFO.vramMB;
    return root(npcId, '<div class="ai-log" id="ai-log">' + log + '</div>' +
      '<div class="ai-compose"><input id="ai-input" type="text" maxlength="280" autocomplete="off" placeholder="Say something…" ' + (session.busy ? 'disabled' : '') + '>' +
      '<button class="primary" data-act="send"' + (session.busy || !engine ? ' disabled' : '') + '>Send</button></div>' +
      '<p class="small">Scripted dialogue is unchanged. Close this to go back. Running locally' + (modelUsed ? ' (' + esc(modelUsed) + ', ~' + vram + ' MB GPU)' : '') + '.</p>');
  }
  function renderChecking(npcId) {
    return root(npcId, '<p>Checking whether this device can run a model on WebGPU…</p>');
  }
  function render(npcId, session) {
    if (session.phase === 'checking') return renderChecking(npcId);
    if (session.phase === 'optin') return renderOptIn(npcId);
    if (session.phase === 'loading') return renderLoading(npcId, session);
    if (session.phase === 'error') return renderError(npcId, session);
    if (session.phase === 'unavailable') return renderUnavailable(npcId, session);
    return renderChat(npcId, session);
  }
  function decline() {
    if (RL.settings) {
      RL.settings.aiChat = false;
      RL.settings.aiChatDeclined = true;
      if (RL.saveSettings) RL.saveSettings();
    }
    if (RL.UI) {
      RL.UI.back();
      if (RL.UI.toast) RL.UI.toast('Free chat stays off. Turn it on in Settings if you change your mind.', '#c86bff');
    }
  }
  function agree(npcId, session) {
    const reason = blockReason();
    if (reason) { session.phase = 'unavailable'; session.error = reason; return; }
    if (RL.settings) {
      RL.settings.aiChat = true;
      RL.settings.aiChatDeclined = false;
      if (RL.saveSettings) RL.saveSettings();
    }
    if (engine) { session.phase = 'chat'; ensureGreeting(npcId, session); return; }
    session.progress = 0;
    session.progressText = 'Preparing…';
    startLoad(npcId, session);
  }
  function makeView(npcId, session) {
    const npc = RL.NPCS[npcId];
    return {
      get title() { return session.phase === 'chat' && npc ? npc.name : 'Chat freely'; },
      cls: 'ai-chat',
      render: () => render(npcId, session),
      onClose: () => {
        const wasBusy = session.busy;
        session.gen++;
        session.busy = false;
        const last = session.messages[session.messages.length - 1];
        if (last && last.role === 'assistant' && !String(last.content || '').trim()) session.messages.pop();
        if (wasBusy && engine && typeof engine.interruptGenerate === 'function') Promise.resolve(engine.interruptGenerate()).catch(() => {});
      },
      acts: {
        download: () => agree(npcId, session),
        decline: () => decline(),
        retry: () => agree(npcId, session),
        send: () => send(npcId, session)
      }
    };
  }
  function continueOpen(npcId, session) {
    const reason = buttonBlock();
    if (reason) { session.phase = 'unavailable'; session.error = reason; return; }
    if (!(RL.settings && RL.settings.aiChat)) { session.phase = 'optin'; return; }
    if (engine) { session.phase = 'chat'; ensureGreeting(npcId, session); return; }
    session.phase = 'loading';
    session.progress = session.progress || 0;
    session.progressText = session.progressText || 'Preparing…';
    startLoad(npcId, session);
  }
  function openChat(npcId) {
    try {
      if (!RL.NPCS || !RL.NPCS[npcId] || !RL.UI || !RL.UI.open) return;
      const session = sessionFor(npcId);
      const reason = buttonBlock();
      if (reason) {
        session.phase = 'unavailable';
        session.error = reason;
        RL.UI.open(makeView(npcId, session));
        return;
      }
      if (!gpuProbed) {
        session.phase = 'checking';
        RL.UI.open(makeView(npcId, session));
        probeAdapter().then(() => {
          if (!chatStillOpen(npcId)) return;
          continueOpen(npcId, session);
          safeRefresh(npcId);
        }).catch(() => {});
        return;
      }
      continueOpen(npcId, session);
      RL.UI.open(makeView(npcId, session));
    } catch (e) {
      if (RL.UI && RL.UI.toast) RL.UI.toast('Free chat could not open.', '#ff8a2e');
    }
  }

  /* One-shot completion for the phone. Scripted fallback when WebGPU,
     the opt-in, or the download is not available. Never throws to the caller. */
  function complete(opts) {
    opts = opts || {};
    const fallback = typeof opts.fallback === 'function' ? opts.fallback : function () { return ''; };
    let useModel = false;
    try { useModel = !blockReason() && RL.settings && RL.settings.aiChat && !gpuDead; } catch (e) { useModel = false; }
    if (!useModel) return Promise.resolve({ text: fallback(), source: 'script' });
    const messages = [{ role: 'system', content: String(opts.system || '') }].concat(Array.isArray(opts.messages) ? opts.messages.slice(-8) : []);
    return ensureEngine().then(async (eng) => {
      const result = await eng.chat.completions.create({ messages: messages, temperature: 0.7, max_tokens: 120, stream: true });
      if (!result || typeof result[Symbol.asyncIterator] !== 'function') {
        const choice = result && result.choices && result.choices[0];
        return (choice && choice.message && choice.message.content) || '';
      }
      let acc = '';
      for await (const chunk of result) {
        const choice = chunk && chunk.choices && chunk.choices[0];
        const delta = choice && choice.delta && choice.delta.content;
        if (delta) acc += delta;
      }
      return acc;
    }).then((raw) => {
      const clean = clip(String(raw || '').replace(/```[\s\S]*?```/g, '').trim(), 420);
      return { text: clean || fallback(), source: clean ? 'model' : 'script' };
    }).catch(() => ({ text: fallback(), source: 'script' }));
  }

  return {
    info: INFO, statusHtml, chatButtonHtml, settingsHint, toggle, openChat, previewPrompt, blockReason, reply: complete
  };
})();
