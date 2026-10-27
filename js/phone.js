/* phone.js - Text threads. UNKNOWN is a free chat on the in-browser model
   from js/ai-npc.js, with a scripted fallback when WebGPU is unavailable.
   Chat never pays. Story beats and once-only quests do. */
RL.Phone = (function () {
  const CAP = 36;
  let view = null;
  let busy = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function state() { return RL.Game && RL.Game.state; }
  function book() {
    const s = state();
    if (!s) return null;
    if (!s.phone || typeof s.phone !== 'object' || Array.isArray(s.phone)) s.phone = { threads: {}, seen: {}, memory: {}, open: 'unknown' };
    if (!s.phone.threads || typeof s.phone.threads !== 'object') s.phone.threads = {};
    if (!s.phone.seen || typeof s.phone.seen !== 'object') s.phone.seen = {};
    if (!s.phone.memory || typeof s.phone.memory !== 'object') s.phone.memory = {};
    return s.phone;
  }
  function thread(id) {
    const b = book();
    if (!b.threads[id]) b.threads[id] = [];
    return b.threads[id];
  }
  function push(id, who, text, extra) {
    const list = thread(id);
    const row = Object.assign({ who: who, text: String(text || '').slice(0, 500), t: Date.now() }, extra || {});
    list.push(row);
    while (list.length > CAP) list.shift();
    if (who === 'them' && id === 'unknown') book().unread = true;
    return row;
  }
  function syncMemory() {
    const s = state(), b = book();
    if (!s || !b) return;
    const f = s.flags || {};
    const keep = ['vexDeal', 'vexRefused', 'vexHandshake', 'vexSlip', 'vexSorry', 'salAlly', 'salSold', 'salGreet', 'unknownTrust', 'unknownSold', 'unknownTold', 'unknownToldSal', 'unknownKeep', 'unknownJob', 'lolaWeld', 'champion', 'hungMask', 'woreMask', 'introMoney', 'introRespect', 'blazeCheat', 'blazeTold', 'kaiFree', 'kaiSold', 'leagueBoss1', 'leagueBoss2', 'leagueBoss3', 'leagueBoss4'];
    keep.forEach((k) => { if (f[k]) b.memory[k] = true; });
    if (f.unknownTrust || f.unknownToldSal) b.memory.persona = 'known';
    else if (f.unknownSold) b.memory.persona = 'burned';
    else b.memory.persona = 'cryptic';
    b.memory.league = s.league || 1;
    b.memory.name = s.name || 'Rookie';
  }
  function personaLine() {
    const m = (book() && book().memory) || {};
    if (m.persona === 'known') return 'You are Lola, the night-circuit archivist, texting from a number the driver knows is yours. Stay unsigned on the screen. You want a clean champion, not a race Vex bought. You already told them who you are.';
    if (m.persona === 'burned') return 'You are Lola, but the driver sold this number to Vex. You are cold, brief, and done being useful. You do not help them win.';
    return 'You are UNKNOWN. No name. Short, cryptic, lowercase texts. You hint at the drag tree, at Vex buying wins, and at Sal refusing to sell a finish. You never say you are Lola.';
  }
  function systemPrompt() {
    syncMemory();
    const s = state(), m = book().memory;
    const lines = [
      personaLine(),
      'Reply with one or two short text messages. No stage directions, lists, or markdown.',
      'PG-13. No flirting, no graphic violence, no slurs.',
      'Never offer money, cars, parts, codes, or rewards. If they ask to be paid, refuse. Jobs pay only when the city already wrote them down.',
      'Do not invent victories. Do not claim you changed their save.',
      'Driver: ' + (m.name || 'Rookie') + ', league ' + (m.league || 1) + '.'
    ];
    if (m.champion) lines.push('They finished the story. The Phantom was Mags. You may say that only if they ask.');
    else lines.push('The Phantom\'s face is still a secret. Do not guess a name.');
    if (m.vexDeal) lines.push('They took Vex\'s money to throw races.');
    if (m.vexRefused) lines.push('They refused to throw races for Vex.');
    if (m.salAlly) lines.push('Sal rides with them. She does not fix finishes.');
    if (m.salSold) lines.push('They took Vex\'s bounty on Sal.');
    if (m.blazeCheat) lines.push('They bought Blaze\'s canyon tip.');
    if (s && s.quests && s.quests.active && s.quests.active.indexOf('unk_strip') >= 0) lines.push('They already have your strip job. Winning one drag finishes it. Do not pay them yourself.');
    return lines.join('\n');
  }
  function fallback(text) {
    syncMemory();
    const m = book().memory;
    const q = String(text || '').toLowerCase();
    if (m.persona === 'burned') return 'you sold the number. i archive that. do not write again expecting a favor.';
    if (/money|cash|pay|reward|\$|dollar|give me/.test(q)) return 'i do not pay. the strip pays once, if the job is already in your book. i will not put a number on this text.';
    if (/who are you|your name|identify|lola/.test(q)) {
      if (m.persona === 'known') return 'lola. keep the name off the lock screen. i time what vextakes and what sal will not sell.';
      return 'not yet. count the lights. the third one lies. ask again when the ice has a winner.';
    }
    if (/vex/.test(q)) return m.vexDeal ? 'you kept his receipt. it spends. it also shows.' : 'he smiles with a price on the back. a handshake is the only receipt that does not bounce.';
    if (/sal/.test(q)) return m.salSold ? 'she will watch. she will not cheer. that was the bounty.' : 'she does not lift in the bowl, and she does not sell the canyon. do not buy it for her.';
    if (/nitro|shift|launch|drag|tree|gear/.test(q)) return 'hold the brake with the gas until the light sits in the window. release on green. shift when the bulb flashes, not after it goes red. nitro is a shove, not a personality.';
    if (/police|star|heat|busted/.test(q)) return 'stars stick while they can see you. three of them and i will not send the car. being busted is not a parking spot.';
    if (/phantom|mask|mags/.test(q)) {
      if (m.champion) return 'the mask was a person in a garage you already know. i only kept the minutes.';
      return 'do not guess the face. a plain coat on the ridge takes notes. that is all i will spend.';
    }
    if (m.persona === 'known') return 'the archive is still open. win the next one clean. i am not a purse.';
    const cryptic = [
      'the tree blinks for people who count.',
      'easy money is a part being sold. usually you.',
      'short gears leave. long gears tell the truth at the stripe.',
      'i am not in the bar. the bar is where he watches.',
      'if the desert sends an invoice, it is not from her.'
    ];
    return cryptic[Math.abs(hash(q)) % cryptic.length];
  }
  function hash(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) n = (n * 33 + s.charCodeAt(i)) | 0;
    return n;
  }
  function scrub(text) {
    let t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return fallback('');
    t = t.replace(/\$\s?\d[\d,]*/g, 'nothing you can bank');
    if (t.length > 420) t = t.slice(0, 419) + '…';
    return t;
  }
  function contacts() {
    return [
      { id: 'unknown', name: 'UNKNOWN', color: '#c86bff' },
      { id: 'mags', name: 'Mags', color: '#ffe03b' },
      { id: 'rex', name: 'Rex', color: '#ff8a2e' },
      { id: 'kane', name: 'Kane', color: '#7aa2ff' }
    ];
  }
  function seedStatic() {
    const b = book();
    if (!b || b.seen.static) return;
    b.seen.static = true;
    push('mags', 'them', 'Kid. If a text feels like a shortcut, it is because you are the part being sold. The wrench is still at the garage.');
    push('rex', 'them', 'Quarter is truth. Half is a longer truth. Launch in the window, shift on the flash, and do not redlight the tree.');
    push('kane', 'them', 'I do not text suspects. I text people who might still park. Stars stick while we can see you. Three of them and the city will not deliver your car.');
  }
  function note(id, key, text, story) {
    const b = book();
    if (!b || b.seen[key]) return;
    b.seen[key] = true;
    push('unknown', 'them', text, story ? { story: story } : null);
    try { RL.Audio.play('confirm'); } catch (e) { }
    try { RL.UI.toast('UNKNOWN texted you', '#c86bff'); } catch (e) { }
  }
  function scan() {
    const s = state();
    if (!s || !s.flags) return;
    seedStatic();
    syncMemory();
    const f = s.flags;
    note('unknown', 'boot', 'count the lights. the third one lies. do not answer with your name.');
    if (f.leagueBoss1 || f.seen_boss1) {
      note('unknown', 'dock', 'brick lost the door. the smile you meet next has a receipt. the desert does not.', 'unknown_dock');
    }
    if (f.leagueBoss2 || f.seen_boss2) {
      note('unknown', 'dunes', 'she will not sell the canyon. if you buy the line, you bought him.', 'unknown_dunes');
    }
    if (f.leagueBoss3 || f.seen_boss3) {
      note('unknown', 'reveal', 'the house lost a fair one. i was in the stands. not the mask. ask me who.', 'unknown_reveal');
    }
    if (f.champion || f.seen_boss4) {
      note('unknown', 'end', 'the mask is a person. you already know which garage. i only kept the minutes.');
    }
  }
  function takeJob(id) {
    const s = state();
    if (!s || !RL.QUESTS || !RL.QUESTS[id]) return;
    const q = s.quests || { active: [], done: [] };
    if ((q.done || []).indexOf(id) >= 0 || (q.active || []).indexOf(id) >= 0) {
      RL.UI.toast('That job is already on the books.');
      return;
    }
    RL.Game.startQuest(id);
    RL.UI.toast('Job added. It pays once, when you finish it.', '#7dff5a');
  }
  function send() {
    if (busy) return;
    const input = document.getElementById('phone-input');
    const text = String(input && input.value || '').trim().slice(0, 240);
    if (!text) return;
    if (input) input.value = '';
    const openId = book().open || 'unknown';
    push(openId, 'you', text);
    if (openId !== 'unknown') {
      push(openId, 'them', openId === 'kane' ? 'Keep the line short. I am on patrol.' : 'Read it twice. Then drive.');
      RL.Game.save();
      return;
    }
    busy = true;
    const s = state();
    const snap = {
      money: s.money, respect: s.respect, cars: s.cars.length, inv: s.inventory.length,
      claimed: Object.keys(s.claimed || {}).length, flags: Object.keys(s.flags || {}).length
    };
    const history = thread('unknown').filter((m) => m.who === 'you' || m.who === 'them').slice(-8).map((m) => ({
      role: m.who === 'you' ? 'user' : 'assistant', content: m.text
    }));
    const done = (res) => {
      busy = false;
      push('unknown', 'them', scrub(res && res.text));
      const now = state();
      if (now.money !== snap.money) now.money = snap.money;
      if (now.respect !== snap.respect) now.respect = snap.respect;
      if (now.cars.length !== snap.cars) now.cars.length = snap.cars;
      if (now.inventory.length > snap.inv) now.inventory.length = snap.inv;
      try { RL.Game.save(); } catch (e) { }
      if (RL.UI && RL.UI.refresh) RL.UI.refresh();
    };
    if (RL.AiNpc && RL.AiNpc.reply) {
      RL.AiNpc.reply({ system: systemPrompt(), messages: history, fallback: () => fallback(text) }).then(done).catch(() => done({ text: fallback(text) }));
    } else done({ text: fallback(text) });
  }
  function render() {
    scan();
    const b = book();
    const id = b.open || 'unknown';
    const who = contacts().find((c) => c.id === id) || contacts()[0];
    b.unread = false;
    let h = '<div class="phone-top"><div><b style="color:' + who.color + '">' + esc(who.name) + '</b><div class="small">' + (id === 'unknown' ? 'no caller id · replies stay on this phone' : 'saved contact') + '</div></div>';
    h += '<button data-act="car">Call car</button></div>';
    h += '<div class="phone-threads">' + contacts().map((c) => '<button data-act="tab" data-arg="' + c.id + '" class="' + (c.id === id ? 'on' : '') + '">' + esc(c.name) + '</button>').join('') + '</div>';
    h += '<div class="phone-log" id="phone-log">';
    const rows = thread(id);
    if (!rows.length) h += '<p class="small dim">No messages.</p>';
    rows.forEach((m) => {
      const mine = m.who === 'you';
      h += '<div class="sms ' + (mine ? 'you' : 'them') + '"><div class="who">' + (mine ? 'You' : esc(who.name)) + '</div>' + esc(m.text) + '</div>';
    });
    h += '</div>';
    if (id === 'unknown') {
      const s = state();
      const q = s && s.quests;
      const have = q && ((q.active || []).indexOf('unk_strip') >= 0 || (q.done || []).indexOf('unk_strip') >= 0);
      const scenes = [];
      rows.forEach((m) => {
        if (!m.story || scenes.indexOf(m.story) >= 0) return;
        if (s && s.flags && s.flags['seen_' + m.story]) return;
        scenes.push(m.story);
      });
      scenes.forEach((key) => { h += '<div class="row"><button data-act="scene" data-arg="' + esc(key) + '">Read it in the city</button></div>'; });
      if (b.seen.dock && !have) h += '<div class="row"><button data-act="job" data-arg="unk_strip">Take the strip job</button></div>';
      h += '<p class="small">Free texts do not pay. The strip job pays once, from the quest log, after a drag win.</p>';
      h += '<div class="phone-compose"><input id="phone-input" type="text" maxlength="240" placeholder="Text UNKNOWN" autocomplete="off"><button class="primary" data-act="send">Send</button></div>';
    }
    return h;
  }
  function openPhone() {
    if (!state() || !RL.UI) return;
    scan();
    view = {
      title: 'Phone', cls: 'phone', focus: '#phone-input',
      render: render,
      acts: {
        tab: (id) => { book().open = id; },
        send: () => send(),
        job: (id) => takeJob(id),
        scene: (key) => {
          if (!key || !RL.UI || !RL.STORY || !RL.STORY[key]) return;
          RL.UI.closeAll();
          RL.UI.showStory(key);
        },
        car: () => { if (RL.Summon) RL.Summon.toast(RL.Summon.call()); }
      }
    };
    RL.UI.open(view);
    setTimeout(() => {
      const log = document.getElementById('phone-log');
      if (log) log.scrollTop = log.scrollHeight;
    }, 30);
  }
  function poll() {
    if (!state() || RL.Game.mode !== 'hub') return;
    scan();
    if (RL.UI && RL.UI.isOpen && RL.UI.isOpen()) return;
    if (RL.Photo && RL.Photo.active) return;
    if (RL.City && RL.City.mapOpen && RL.City.mapOpen()) return;
    if (RL.Input && RL.Input.hit('phone')) openPhone();
  }
  function bind() {
    const b = document.getElementById('btn-phone');
    if (b) b.onclick = () => { try { RL.Audio.init(); } catch (e) { } if (RL.UI && RL.UI.isOpen()) RL.UI.closeAll(); openPhone(); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  return { open: openPhone, poll, scan, push, fallback, scrub, systemPrompt };
})();
