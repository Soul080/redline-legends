/* audio.js - All sound is synthesized with WebAudio (no asset files).
   Engine hum, drift screech, crash, nitro, UI blips and a tiny music loop. */
RL.Audio = (function () {
  let ctx = null, master, sfxGain, musicGain, engineOsc, engineGain, engineOsc2, screechGain, noiseBuf;
  let musicTimer = null, musicStep = 0;

  /* Lazily create the AudioContext on the first user gesture (browser autoplay rules). */
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { ctx = null; return; }
    master = ctx.createGain(); master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.connect(master);
    // white noise buffer used by crash / screech / rain
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVolumes();
  }
  function applyVolumes() {
    if (!ctx) return;
    const s = RL.settings || { master: 0.7, sfx: 0.8, music: 0.4 };
    master.gain.value = s.master; sfxGain.gain.value = s.sfx; musicGain.gain.value = s.music * 0.35;
  }
  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, freq) {
    if (!ctx) return;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime;
    s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = freq || 800;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + dur);
  }
  const sfx = {
    click: () => tone(880, 0.06, 'square', 0.08),
    confirm: () => { tone(660, 0.08, 'square', 0.1); setTimeout(() => tone(990, 0.1, 'square', 0.1), 70); },
    error: () => tone(160, 0.2, 'sawtooth', 0.12),
    beep: () => tone(520, 0.18, 'square', 0.15),
    go: () => tone(1040, 0.4, 'square', 0.18),
    crash: (v) => { noise(0.35, Math.min(0.6, 0.15 + (v || 0.5) * 0.4), 600); tone(90, 0.2, 'sawtooth', 0.15, 40); },
    bump: () => noise(0.12, 0.2, 1200),
    nitro: () => { noise(0.5, 0.25, 3000); tone(200, 0.5, 'sawtooth', 0.08, 600); },
    levelup: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.15, 'triangle', 0.18), i * 90)),
    coin: () => { tone(988, 0.07, 'square', 0.1); setTimeout(() => tone(1319, 0.15, 'square', 0.1), 60); },
    step: () => tone(120 + Math.random() * 40, 0.03, 'triangle', 0.03),
    explosion: () => { noise(0.65, 0.55, 240); tone(62, 0.48, 'sawtooth', 0.24, 28); tone(140, 0.18, 'square', 0.07); }
  };
  function play(name, v) { try { if (sfx[name]) sfx[name](v); } catch (e) { /* audio is best-effort */ } }

  /* Continuous engine + tyre screech while racing */
  function startEngine() {
    if (!ctx || engineOsc) return;
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
    engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'square';
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    engineGain = ctx.createGain(); engineGain.gain.value = 0.05;
    engineOsc.connect(f); engineOsc2.connect(f); f.connect(engineGain); engineGain.connect(sfxGain);
    engineOsc.start(); engineOsc2.start();
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 2400; bf.Q.value = 3;
    screechGain = ctx.createGain(); screechGain.gain.value = 0;
    s.connect(bf); bf.connect(screechGain); screechGain.connect(sfxGain); s.start();
    engineOsc._noise = s;
  }
  function updateEngine(speedFrac, drifting, nitro) {
    if (!engineOsc) return;
    const t = ctx.currentTime;
    engineOsc.frequency.setTargetAtTime(50 + speedFrac * 170 + (nitro ? 40 : 0), t, 0.05);
    engineOsc2.frequency.setTargetAtTime(25 + speedFrac * 85, t, 0.05);
    engineGain.gain.setTargetAtTime(0.04 + speedFrac * 0.05, t, 0.1);
    screechGain.gain.setTargetAtTime(drifting ? 0.12 : 0, t, 0.05);
  }
  function stopEngine() {
    if (!engineOsc) return;
    try { engineOsc.stop(); engineOsc2.stop(); engineOsc._noise.stop(); } catch (e) { }
    engineOsc = null;
  }

  /* Tiny synthwave arpeggio loop. mood: 'hub' | 'race' */
  const SCALES = { hub: [220, 262, 330, 392, 330, 262, 196, 247], race: [110, 110, 165, 110, 147, 110, 196, 165] };
  function startMusic(mood) {
    stopMusic();
    if (!ctx) return;
    const notes = SCALES[mood] || SCALES.hub;
    musicTimer = setInterval(() => {
      if (!ctx || ctx.state !== 'running') return;
      const f = notes[musicStep % notes.length] * (musicStep % 16 < 8 ? 1 : 1.122);
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = mood === 'race' ? 'sawtooth' : 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.25);
      if (musicStep % 4 === 0) { // kick
        const k = ctx.createOscillator(), kg = ctx.createGain();
        k.frequency.setValueAtTime(140, t); k.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        kg.gain.setValueAtTime(0.5, t); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        k.connect(kg); kg.connect(musicGain); k.start(t); k.stop(t + 0.2);
      }
      musicStep++;
    }, mood === 'race' ? 150 : 220);
  }
  function stopMusic() { if (musicTimer) clearInterval(musicTimer); musicTimer = null; }

  return { init, play, applyVolumes, startEngine, updateEngine, stopEngine, startMusic, stopMusic };
})();
