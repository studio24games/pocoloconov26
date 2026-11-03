import { ASSETS } from './assets.js';
// Audio engine. Game code fires *events* (audio.play('trigger')); CUES maps each event to one or more
// layered samples (ids from assets/manifest.json "sfx"). If none of an event's samples loaded, the old
// procedural synth recipe plays instead, so the game always has sound.
//   s: sample id   gain: 0..1   delay: seconds   pitch: semitones per data.i (capped by maxStep)
//   duck: [depth 0..1, seconds] lowers the music under big moments   pick: choose ONE layer at random

const semis = n => Math.pow(2, n / 12);

export const CUES = {
  // v0.25 mix: effects louder and layered for punch (sfx bus +4 dB), music lower (see startMusic)
  // v0.39: the 20 Oct ElevenLabs voice (VOX2_*, one voice for every line)
  welcome:      [{ s: 'VOX2_VAMOS', gain: 0.8 }],
  spinStart:    [{ s: 'SFX_SPIN_SOFT', gain: 0.4 }],   // v0.25b: hiss rolled off (was a loud 12 kHz noise burst)
  reelStop:     [{ s: 'SFX_REEL_STOP_01', gain: 0.9 }, { s: 'SFX_REEL_THUD', gain: 0.45 }],   // v0.25b: short thud, not the 1.8 s impact rumble
  coinLand:     [{ s: 'SFX_COIN_LAND_BASE', gain: 0.9, pitch: 1, maxStep: 9 }, { s: 'SFX_CRYSTAL', gain: 0.3, pitch: 1, maxStep: 9 }],
  lineWin:      [{ s: 'SFX_LINE_WIN', gain: 0.85 }, { s: 'SFX_CRYSTAL', gain: 0.3 }],
  wildWin:      [{ s: 'SFX_LINE_WIN', gain: 0.85 }, { s: 'SFX_MULTIPLIER_REVEAL', gain: 0.6 }, { s: 'SFX_REEL_THUD', gain: 0.5 }],
  anticipation: [{ s: 'SFX_TENSION_3_COINS', gain: 0.6 }],
  trigger:      [{ s: 'SFX_BONUS_BRASS_HIT', gain: 0.95, duck: [0.2, 2.2] }, { s: 'SFX_BOOM', gain: 0.85 }],
  cheer:        [{ s: 'VOX2_AY_AY_AY', gain: 1.0, duck: [0.2, 2.4] }, { s: 'VOX2_AJUA', gain: 0.95, delay: 1.25 }],
  respinStart:  [{ s: 'SFX_SPIN_SOFT', gain: 0.3, rate: 1.25 }],
  frame:        [{ s: 'SFX_MULTIPLIER_REVEAL', gain: 0.8 }, { s: 'SFX_IMPACT', gain: 0.7 }, { s: 'SFX_DEEP_HIT', gain: 0.35 }, { s: 'VOX2_ORALE', gain: 0.8, delay: 0.3 }],
  frameQuiet:   [{ s: 'SFX_MULTIPLIER_REVEAL', gain: 0.8 }, { s: 'SFX_IMPACT', gain: 0.7 }, { s: 'SFX_DEEP_HIT', gain: 0.35 }],   // v0.62m: the same without the voice
  stamp:        [{ s: 'SFX_STAMP', gain: 0.75, pitch: 1, maxStep: 6 }],
  rescue:       [{ s: 'SFX_COIN_RESCUE', gain: 0.9, duck: [0.4, 1.4] }, { s: 'SFX_CRYSTAL', gain: 0.85 }, { s: 'VOX2_ARRIBA', gain: 0.85, delay: 0.2 }],
  deadSpin:     [{ s: 'SFX_DEAD_SPIN', gain: 0.65 }],
  heartbeat:    [{ s: 'SFX_HEARTBEAT', gain: 0.7 }],
  collect:      [{ s: 'SFX_COIN_COLLECT', gain: 0.85, pitch: 1, maxStep: 7 }, { s: 'SFX_CRYSTAL', gain: 0.2, pitch: 1, maxStep: 7 }],
  jackpot:      [{ s: 'SFX_JACKPOT_FANFARE', gain: 1.0, duck: [0.12, 1.6] }, { s: 'SFX_CRYSTAL', gain: 0.6 }, { s: 'SFX_IMPACT', gain: 0.5 }],
  bigJackpot:   [{ s: 'SFX_JACKPOT_FANFARE', gain: 1.0, duck: [0.1, 2.6] }, { s: 'SFX_DEEP_HIT', gain: 0.8 }, { s: 'SFX_CRYSTAL', gain: 0.6 }, { s: 'VOX2_AY_AY_AY', gain: 0.95, delay: 0.55 }],
  fullHouse:    [{ s: 'VOX_OLE_TRUMPET', gain: 0.95, duck: [0.25, 3.8] }, { s: 'SFX_DEEP_HIT', gain: 0.85 }],
  bigWin:       [{ s: 'SFX_BIG_WIN', gain: 0.95, duck: [0.12, 2.4] }, { s: 'VOX2_QUE_SUERTE', gain: 0.9, delay: 0.25 }],
  winStinger:   [{ s: 'SFX_WIN_STINGER', gain: 1.0, duck: [0.12, 4.6] }],
  ole:          [{ s: 'VOX_OLE_TRUMPET', gain: 0.9 }],
  oleBlast:     [{ s: 'VOX_OLE_TRUMPET', gain: 0.9, offset: 1.45, fadeIn: 0.02 }],   // v0.62k: the olé from its trumpet (skips the 1.5 s lead-in)
  bigWinIn:     [{ s: 'VOX2_QUE_SUERTE', gain: 0.9, delay: 0.25 }],
  // v0.62f (client): the win screens as in v0.52 - game music muted, the mariachi win stinger under the count (looped
  // on its 2.75 s of sound for longer counts), and ONE ending on every win: a clean 1.4 s snippet of the brass fanfare's
  // climax (from its big hit at 1.16 s, faded out as it rings), replacing the olé trumpet
  winLoop:      [{ s: 'SFX_WIN_STINGER', gain: 1.0, loopStart: 0, loopEnd: 2.75, soundEnd: 2.85 }],
  bigWinEnd:    [{ s: 'SFX_BIG_WIN', gain: 0.95, offset: 1.16, dur: 1.4, fadeIn: 0.015, fadeOut: 0.35 }],
  andale:       [{ s: 'VOX2_ANDALE', gain: 0.85 }],
  grito:        [{ s: 'VOX2_AJUA', gain: 0.9 }, { s: 'VOX2_AY_AY_AY', gain: 0.9 }, { s: 'VOX2_ESO', gain: 0.9 }].map(l => ({ ...l, pick: true })),
  button:       [{ s: 'SFX_BUTTON', gain: 0.65 }],
  eat:          [{ s: 'SFX_CHOMP', gain: 0.85 }, { s: 'SFX_COIN_COLLECT', gain: 0.35, rate: 1.2 }],
  // v0.53 item 5: coins flying to the Super meter (a light whoosh) and the meter taking them (its own sound: a bright
  // chime over a soft coin hit; the caller raises the pitch as the meter fills)
  meterFly:     [{ s: 'SFX_WHOOSH_BANNER', gain: 0.32, rate: 1.25 }],
  meterUp:      [{ s: 'SFX_CRYSTAL', gain: 0.75 }, { s: 'SFX_COIN_COLLECT', gain: 0.45, rate: 0.8 }],
  poof:         [{ s: 'SFX_POOF', gain: 0.6 }, { s: 'SFX_COIN_COLLECT', gain: 0.4, rate: 1.3 }],
  fireball:     [{ s: 'SFX_WHOOSH_FIREBALL', gain: 0.9 }],
  morph:        [{ s: 'SFX_WHOOSH_MORPH', gain: 0.85 }],
  buyRiser:     [{ s: 'SFX_RISER', gain: 0.8 }],
  bannerIn:     [{ s: 'SFX_WHOOSH_BANNER', gain: 0.7 }],
  sceneIn:      [{ s: 'SFX_WHOOSH_BIG', gain: 0.8 }],
  countTick:    [{ s: 'SFX_COIN_COLLECT', gain: 0.3, pitch: 1, maxStep: 12 }],
  rescueBuild:  [{ s: 'SFX_RISER', gain: 0.75, duck: [0.3, 2.8] }],
  rescueFail:   [{ s: 'SFX_FIZZLE', gain: 0.95 }, { s: 'SFX_DEAD_SPIN', gain: 0.5, delay: 0.25 }, { s: 'VOX2_AY_AY_AY_SAD', gain: 0.9, delay: 0.45 }],
  lifeReset:    [{ s: 'SFX_CRYSTAL', gain: 0.55 }],
  tierUp:       [{ s: 'SFX_CRYSTAL', gain: 0.7 }, { s: 'SFX_REEL_THUD', gain: 0.7 }],
  // v0.64-v0.65: Mystery reveal - a gentle puff when the reveal makes a win (no ping); a reveal that makes no win is
  // silent. The line win's own sound and animation follow.
  // v0.70 (checklist 8): punchier - the snap open gets a gold "ching" with the puff, and a paying 1x+ / Wild reveal a deep hit
  mysterySoft:  [{ s: 'SFX_POOF', gain: 0.36, rate: 0.95 }, { s: 'SFX_CRYSTAL', gain: 0.32, rate: 1.1 }],
  mysteryBig:   [{ s: 'SFX_POOF', gain: 0.45, rate: 0.85 }, { s: 'SFX_CRYSTAL', gain: 0.55 }, { s: 'SFX_DEEP_HIT', gain: 0.5 }],
  // v0.66 (checklist item 2): the curtain opening - a soft, low fabric swish (the banner whoosh, quiet and pitched down
  // to read as heavy velvet), once per reveal. One line to swap if a proper curtain sound is sourced.
  curtainSwish: [{ s: 'SFX_WHOOSH_BIG', gain: 0.32, rate: 0.95 }],   // v0.70: a quicker, firmer swoosh for the snap   // level step on the win screens: a hit, not another music clip
};

const A_MINOR = [220, 246.94, 261.63, 293.66, 329.63, 349.23, 392, 440, 493.88, 523.25, 587.33, 659.25, 783.99, 880];

export class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.vol = { music: 1, sfx: 1 }; this.buffers = new Map(); this.music = null; this.musicMode = null; }

  /**
   * v0.29b iPhone fix. iOS Safari treats Web Audio as "ambient" sound: with the ring/silent switch on silent it is
   * muted completely (desktop is unaffected). Ask for the "playback" audio session (Safari 16.4+ / iOS 17+); on older
   * iOS, start a looping silent HTML <audio> inside the same tap, which moves the page into the playback category.
   * Also: the context is resumed from every tap if iOS left it 'suspended' or 'interrupted' (calls, app switch,
   * screen lock), and one silent buffer is played on the first tap (older iOS needs a sound started in the gesture).
   */
  iosSession() {
    try { if (navigator.audioSession) { navigator.audioSession.type = 'playback'; return; } } catch { /* not supported */ }
    if (this.silentEl || !/iP(hone|ad|od)|Macintosh/.test(navigator.userAgent) || !('ontouchend' in document)) return;
    const n = 4410, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 44100, true); v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    const el = this.silentEl = document.createElement('audio');
    el.src = URL.createObjectURL(new Blob([b], { type: 'audio/wav' })); el.loop = true; el.setAttribute('playsinline', ''); el.setAttribute('x-webkit-airplay', 'deny'); el.preload = 'auto';
    el.play().catch(() => { this.silentEl = null; });
  }
  resume() {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    if (this.silentEl?.paused) this.silentEl.play().catch(() => {});
  }
  unlock() {
    this.iosSession();
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    try { const sb = ctx.createBufferSource(); sb.buffer = ctx.createBuffer(1, 1, 22050); sb.connect(ctx.destination); sb.start(0); } catch { /* ignore */ }
    // any later tap revives a context iOS has suspended or interrupted; leaving the page pauses sound, coming back resumes it
    const kick = () => this.resume();
    for (const ev of ['touchend', 'pointerup', 'click', 'keydown']) document.addEventListener(ev, kick, { passive: true, capture: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.ctx.suspend().catch(() => {}); this.silentEl?.pause(); } else this.resume(); });
    addEventListener('pageshow', kick);
    this.master = ctx.createGain(); this.master.gain.value = this.enabled ? 0.8 : 0;   // brief 02A: a stored OFF must keep entry music silent
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.18;
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 1.4; this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.12;
    this.duckGain = ctx.createGain(); this.musicBus.disconnect?.(); this.musicBus.connect(this.duckGain);
    this.sfxVol = ctx.createGain(); this.musicVol = ctx.createGain(); this.sfxVol.gain.value = this.vol.sfx ** 2; this.musicVol.gain.value = this.vol.music ** 2;
    this.sfxBus.connect(this.sfxVol).connect(this.master); this.duckGain.connect(this.musicVol).connect(this.master); this.master.connect(comp).connect(ctx.destination);
    for (const [id, url] of Object.entries(ASSETS.sfx)) this.load(id, url);
    for (const [k, m] of Object.entries(ASSETS.music)) this.load(`music:${k}`, m.url).then(() => { if (this.musicMode === k && !this.music?.loop) this.startMusic(k); });
    if (this.musicMode) this.startMusic(this.musicMode);
  }
  async load(key, url) {
    // client 3 Nov 08:17: a download that fails is retried (3 tries), so a sound never stays on its synthesised stand-in
    this.urls = this.urls || new Map(); this.urls.set(key, url);
    for (let a = 0; a < 3; a++) {
      try {
        const r = await fetch(url); if (!r.ok) throw new Error(r.status);
        const b = await r.arrayBuffer();
        // callback form as well as the promise: older iOS Safari only supports the callback version
        const buf = await new Promise((res, rej) => { const p = this.ctx.decodeAudioData(b, res, rej); p?.then?.(res, rej); });
        this.buffers.set(key, buf); return;
      } catch { await new Promise(r => setTimeout(r, 600 * (a + 1))); }
    }
    console.warn(`audio missing: ${url}`);
  }
  /** a sound with real sample files that are not decoded yet: fetch them again (once at a time) and stay silent meanwhile */
  pending(event) {
    const cues = CUES[event] || []; if (!cues.length) return false;
    if (cues.some(l => this.buffers.has(l.s))) return false;
    this.retrying = this.retrying || new Set();
    for (const l of cues) { const url = this.urls?.get(l.s) || ASSETS.sfx?.[l.s]; if (url && !this.retrying.has(l.s)) { this.retrying.add(l.s); this.load(l.s, url).finally(() => this.retrying.delete(l.s)); } }
    return true;
  }
  /** v0.20: player volume sliders, 0..1 per bus (applied on top of the mix and ducking) */
  setVolume(bus, v) {
    this.vol[bus] = v; const node = bus === 'music' ? this.musicVol : this.sfxVol;
    if (node) node.gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.04);   // squared: feels linear to the ear
  }
  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  // ---- primitives ----
  tone(f, { t = 0, d = 0.2, type = 'sine', g = 0.2, attack = 0.005, bus, slide = 0, q } = {}) {
    const ctx = this.ctx; if (!ctx) return;
    const t0 = ctx.currentTime + t, o = ctx.createOscillator(), a = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t0 + d);
    a.gain.setValueAtTime(0.0001, t0); a.gain.exponentialRampToValueAtTime(g, t0 + attack); a.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    let node = o;
    if (q) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = q; o.connect(f2); node = f2; }
    node.connect(a).connect(bus || this.sfxBus); o.start(t0); o.stop(t0 + d + 0.05);
  }
  noise({ t = 0, d = 0.1, g = 0.1, f = 1200, Q = 1, type = 'bandpass' } = {}) {
    const ctx = this.ctx; if (!ctx) return;
    const t0 = ctx.currentTime + t, n = Math.floor(ctx.sampleRate * d), buf = ctx.createBuffer(1, n, ctx.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = Q;
    const a = ctx.createGain(); a.gain.value = g;
    s.connect(fl).connect(a).connect(this.sfxBus); s.start(t0);
  }
  pluck(f, t = 0, g = 0.12, bus) { this.tone(f, { t, d: 0.5, type: 'triangle', g, attack: 0.003, bus, q: 2400 }); this.tone(f * 2, { t, d: 0.18, type: 'sine', g: g * 0.3, bus }); }

  // ---- events ----
  /** Play an event. Returns a handle with stop(fadeSeconds) when samples were used. */
  play(event, data = {}) {
    if (!this.ctx || !this.enabled) return null;
    this.log?.push(event);
    let layers = (CUES[event] || []).filter(l => this.buffers.has(l.s));
    if (layers.some(l => l.pick)) layers = [layers[Math.floor(Math.random() * layers.length)]];
    if (layers.length) {
      const voices = layers.map(l => this.voice(l, data));
      const duck = layers.find(l => l.duck)?.duck; if (duck) this.duck(...duck);
      return { stop: (fade = 0.1) => voices.forEach(v => v?.stop(fade)) };
    }
    if (this.pending(event)) return null;   // never a different (synth) sound in place of the real one
    this.synth(event, data);
    return null;
  }
  voice(l, data = {}, loop = false) {
    const ctx = this.ctx, t0 = ctx.currentTime + (l.delay || 0) + (data.delay || 0);
    const src = ctx.createBufferSource(); src.buffer = this.buffers.get(l.s); src.loop = loop;
    const step = l.pitch ? Math.min(l.maxStep ?? 12, (data.i || 0) * l.pitch) : 0;
    src.playbackRate.value = (l.rate || 1) * (data.rate || 1) * semis(step);
    const g = ctx.createGain(); g.gain.value = l.gain * (data.gain ?? 1);
    if (loop && l.loopEnd) { src.loopStart = l.loopStart || 0; src.loopEnd = l.loopEnd; }   // v0.62f: loop only the part with sound
    if (l.fadeIn) { g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(l.gain * (data.gain ?? 1), t0 + l.fadeIn); }
    if (l.dur) { const v = l.gain * (data.gain ?? 1), f = l.fadeOut || 0.25; g.gain.setValueAtTime(v, t0 + l.dur - f); g.gain.linearRampToValueAtTime(0.0001, t0 + l.dur); }   // v0.62f: a clean snippet
    src.connect(g).connect(this.sfxBus); src.start(t0, (l.offset || 0) + (data.offset || 0), l.dur && !loop ? l.dur + 0.02 : undefined);
    // v0.62h: finish() lets a looping clip play its current pass through to its own ending; v0.62k: it returns the seconds
    // until that pass's sound ends (l.soundEnd = where the clip's sound stops), so the next sound can be timed to it
    return { rate: (r, tc = 0.3) => { try { src.playbackRate.setTargetAtTime(r, ctx.currentTime, tc); } catch { /* stopped */ } },   // v0.62l: speed a loop up
      ramp: (r, secs) => { try { const t = ctx.currentTime, p = src.playbackRate; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(r, t + secs); } catch { /* stopped */ } },
      finish: () => { src.loop = false; if (!loop || !l.loopEnd) return 0; const len = l.loopEnd - (l.loopStart || 0), el = Math.max(0, ctx.currentTime - t0);
        const pos = el % len; return Math.max(0, (l.soundEnd ?? l.loopEnd) - (l.loopStart || 0) - pos); },
      stop: (fade = 0.1) => { const t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t + fade); try { src.stop(t + fade + 0.02); } catch { /* not started */ } } };
  }
  /**
   * v0.53 (item 22): the Hold & Win riser - a low rumble that climbs about an octave and a half (a low bass note up to a
   * low-mid tone, never shrill) and grows fuller and louder over `ms`, with a soft rushing texture underneath. Built in
   * the browser (no file). stop(fade): cut it (into the landing hit); fall(): drop away on a miss.
   */
  riser(ms, opts = {}) {
    // v0.54 (client): a game crescendo, not a drone. Three layers that all build over `ms` with the camera's shape
    // (a quick jump, then a climb to the peak): a rising major chord swell with a tremolo that speeds up, and an airy
    // whoosh sweeping up through it. Starts low-mid (A2), rises an octave and a fifth.
    const ctx = opts.ctx || this.ctx, bus = opts.out || this.sfxBus;
    if (!ctx || (!opts.ctx && !this.enabled)) return null;
    const t0 = ctx.currentTime + 0.01, T = Math.max(0.4, ms / 1000), end = t0 + T, tl = t0 + Math.min(0.26, T * 0.45);
    const out = ctx.createGain(); out.gain.setValueAtTime(0.0001, t0); out.gain.exponentialRampToValueAtTime(0.35, tl); out.gain.exponentialRampToValueAtTime(1, end);
    const master = ctx.createGain(); master.gain.value = 0.55 * (opts.gain ?? 1); out.connect(master).connect(bus);
    const nodes = [];
    // 1) chord swell: root, major third, fifth, octave; detuned pairs; pitch jumps then climbs a 12th
    const swell = ctx.createGain(); swell.gain.value = 0.16;
    const trem = ctx.createGain(); trem.gain.value = 0.75; const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.frequency.setValueAtTime(5, t0); lfo.frequency.exponentialRampToValueAtTime(16, end); lfoG.gain.value = 0.25; lfo.connect(lfoG).connect(trem.gain); lfo.start(t0); nodes.push(lfo);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(700, t0); lp.frequency.exponentialRampToValueAtTime(1600, tl); lp.frequency.exponentialRampToValueAtTime(5200, end);
    swell.connect(trem).connect(lp).connect(out);
    const rise = Math.pow(2, 19 / 12);   // an octave and a fifth
    for (const [ratio, type, g] of [[1, 'sawtooth', .5], [1.26, 'sawtooth', .35], [1.5, 'sawtooth', .4], [2, 'square', .22]]) for (const det of [-7, 7]) {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.detune.value = det; og.gain.value = g;
      const f0 = 110 * ratio; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f0 * Math.pow(rise, 0.35), tl); o.frequency.exponentialRampToValueAtTime(f0 * rise, end);
      o.connect(og).connect(swell); o.start(t0); nodes.push(o); }
    // (v0.54: no drum roll - client: the clicking was unwanted)
    // 3) whoosh: filtered noise sweeping up
    const wb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), wd = wb.getChannelData(0); for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    const ws = ctx.createBufferSource(); ws.buffer = wb; ws.loop = true; const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.Q.value = 1.4;
    wf.frequency.setValueAtTime(500, t0); wf.frequency.exponentialRampToValueAtTime(5000, end); const wg = ctx.createGain(); wg.gain.setValueAtTime(0.02, t0); wg.gain.linearRampToValueAtTime(0.16, end);
    ws.connect(wf).connect(wg).connect(out); ws.start(t0); nodes.push(ws);
    const kill = at => nodes.forEach(o => { try { o.stop(at); } catch { /* stopped */ } });
    let done = false;
    return {
      stop: (fade = 0.06) => { if (done) return; done = true; const n = ctx.currentTime; out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), n); out.gain.exponentialRampToValueAtTime(0.0001, n + fade); kill(n + fade + 0.05); },
      fall: () => { if (done) return; done = true; const n = ctx.currentTime;
        nodes.forEach(o => { if (o.frequency) { o.frequency.cancelScheduledValues(n); o.frequency.setValueAtTime(o.frequency.value, n); o.frequency.exponentialRampToValueAtTime(Math.max(20, o.frequency.value * 0.55), n + 0.5); } });
        out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), n); out.gain.exponentialRampToValueAtTime(0.0001, n + 0.5); kill(n + 0.55); },
    };
  }
  /** Looping cue (heartbeat bed). Returns a handle with stop(). */
  loop(event) {
    if (!this.ctx || !this.enabled) return null;
    const l = (CUES[event] || []).find(x => this.buffers.has(x.s));
    if (!l && this.pending(event)) return { stop: () => {} };
    if (!l) { const id = setInterval(() => this.synth(event), 500); this.synth(event); return { stop: () => clearInterval(id) }; }
    return this.voice(l, {}, true);
  }
  /** Fade the music right out (celebration screens play their own cue) and bring it back. */
  hush(fade = 0.4) { if (!this.ctx) return; this.hushed = true; const g = this.duckGain.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.0001, t + fade); }
  unhush(fade = 1) { if (!this.ctx) return; this.hushed = false; const g = this.duckGain.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t); g.linearRampToValueAtTime(1, t + fade); }
  /** Briefly lower the music under a big moment. */
  duck(depth = 0.4, seconds = 1.5) {
    if (this.hushed) return;
    const g = this.duckGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(depth, t + 0.08); g.setValueAtTime(depth, t + seconds); g.linearRampToValueAtTime(1, t + seconds + 0.6);
  }
  synth(event, data = {}) {
    const i = data.i || 0;
    switch (event) {
      case 'spinStart': this.noise({ d: 0.25, g: 0.06, f: 600, Q: 0.7 }); this.tone(140, { d: 0.2, type: 'triangle', g: 0.08, slide: 0.6 }); break;
      case 'reelStop': this.tone(90 + i * 12, { d: 0.12, type: 'triangle', g: 0.22 }); this.noise({ d: 0.05, g: 0.07, f: 1800, Q: 2 }); break;
      case 'coinLand': { const f = A_MINOR[Math.min(A_MINOR.length - 1, 6 + i)]; this.tone(f, { d: 0.35, g: 0.16 }); this.tone(f * 1.5, { t: 0.04, d: 0.3, g: 0.08 }); this.tone(f * 3, { t: 0.02, d: 0.12, g: 0.05, type: 'triangle' }); break; }
      case 'lineWin': [0, 2, 4].forEach((k, j) => this.pluck(A_MINOR[k + 7], j * 0.06, 0.14)); break;
      case 'anticipation': for (let j = 0; j < 8; j++) this.tone(330 + j * 40, { t: j * 0.12, d: 0.14, g: 0.05 + j * 0.008, type: 'triangle' }); break;
      case 'trigger': [0, 2, 4, 7, 9, 11].forEach((k, j) => this.pluck(A_MINOR[k], j * 0.08, 0.18)); this.tone(110, { d: 0.9, type: 'sawtooth', g: 0.06, q: 600 }); break;
      case 'respinStart': this.noise({ d: 0.18, g: 0.05, f: 900 }); break;
      case 'frame': this.tone(70, { d: 0.35, g: 0.3, slide: 0.5 }); this.noise({ d: 0.2, g: 0.12, f: 400, Q: 0.6 }); this.tone(880, { t: 0.05, d: 0.25, g: 0.08, type: 'triangle' }); break;
      case 'rescue': for (let j = 0; j < 6; j++) this.tone(523 * Math.pow(1.122, j), { t: j * 0.05, d: 0.3, g: 0.09 }); this.noise({ d: 0.5, g: 0.05, f: 4000, Q: 0.5, type: 'highpass' }); break;
      case 'deadSpin': this.tone(196, { d: 0.4, type: 'triangle', g: 0.1, slide: 0.7 }); break;
      case 'heartbeat': this.tone(55, { d: 0.16, g: 0.35 }); this.tone(50, { t: 0.2, d: 0.2, g: 0.28 }); break;
      case 'collect': { const f = A_MINOR[Math.min(A_MINOR.length - 1, 4 + (i % 10))]; this.tone(f, { d: 0.22, g: 0.13, type: 'triangle' }); this.tone(f * 2, { d: 0.12, g: 0.05 }); break; }
      case 'jackpot': [0, 4, 7, 11, 13].forEach((k, j) => { this.pluck(A_MINOR[k], j * 0.1, 0.2); this.tone(A_MINOR[k] * 2, { t: j * 0.1, d: 0.6, g: 0.05 }); }); break;
      case 'bigWin': [0, 2, 4, 7].forEach((k, j) => this.pluck(A_MINOR[k + 2], j * 0.12, 0.2)); break;
      case 'countTick': this.tone(1200 + (i % 8) * 60, { d: 0.04, g: 0.04, type: 'square', q: 3000 }); break;
      case 'button': this.tone(660, { d: 0.06, g: 0.06, type: 'triangle' }); break;
      default: break;
    }
  }

  // ---- procedural music: nylon-ish plucks over a bass, A minor, 6/8 feel ----
  /** v0.62 (client): each win level steps the music up - a little faster and louder per level (0 = normal) */
  musicLift(lvl = 0) {
    if (!this.ctx || !this.music?.loop) return; const t = this.ctx.currentTime;
    // v0.62f (client): the music stays the same at every win level (no speed-up, no volume step); kept as a reset
    void lvl; this.music.loop.src.playbackRate.setTargetAtTime(1, t, 0.12);
    this.musicBus.gain.setTargetAtTime(this.musicMode === 'feature' ? 0.25 : 0.2, t, 0.15);
  }
  startMusic(mode = 'base') {
    if (this.musicMode === mode && this.music?.loop) return; // already playing this track
    this.musicMode = mode;
    if (!this.ctx) return;
    if (this.music) { clearInterval(this.music.timer); this.fadeOutLoop(this.music.loop); }
    const buf = this.buffers.get(`music:${mode}`);
    if (buf) { // seamless loop between the manifest's loop points, crossfaded in
      const meta = ASSETS.music[mode] || {}, t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      if (meta.loopEnd) { src.loopStart = meta.loopStart || 0; src.loopEnd = meta.loopEnd; }
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.9);
      src.connect(g).connect(this.musicBus); src.start(t, meta.loopStart || 0);
      this.music = { loop: { src, g } };
      this.musicBus.gain.setTargetAtTime(mode === 'feature' ? 0.25 : 0.2, t, 0.2); return;   // v0.25: music further down under the louder effects (v0.24b 0.273/0.36)
    }
    this.musicBus.gain.value = 0.12;
    const bpm = mode === 'feature' ? 150 : 112;
    const step = 60 / bpm / 2; // eighth notes
    const prog = mode === 'feature' ? [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 4]] : [[0, 2, 4], [3, 5, 7], [0, 2, 4], [4, 6, 8]];
    const patt = [0, 1, 2, 1, 2, 1];
    let n = 0, next = this.ctx.currentTime + 0.1;
    const tick = () => {
      while (next < this.ctx.currentTime + 0.25) {
        const bar = Math.floor(n / 6) % prog.length, chord = prog[bar], k = n % 6;
        const t = next - this.ctx.currentTime;
        if (k === 0) this.tone(A_MINOR[chord[0]] / 2, { t, d: step * 5, type: 'triangle', g: 0.16, bus: this.musicBus, q: 500 });
        this.pluck(A_MINOR[chord[patt[k]] + (k >= 3 && mode === 'feature' ? 2 : 0)], t, k === 0 ? 0.12 : 0.08, this.musicBus);
        if (mode === 'feature' && k % 3 === 2) this.noise({ t, d: 0.05, g: 0.03, f: 6000, Q: 1, type: 'highpass' });
        next += step; n++;
      }
    };
    this.music = { timer: setInterval(tick, 60) };
    tick();
  }
  fadeOutLoop(loop) {
    if (!loop) return; const t = this.ctx.currentTime;
    loop.g.gain.setTargetAtTime(0.0001, t, 0.25); loop.src.stop(t + 1.2);
  }
  stopMusic() { if (this.music) { clearInterval(this.music.timer); this.fadeOutLoop(this.music.loop); } this.music = null; }
}
