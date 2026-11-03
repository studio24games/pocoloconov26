// Game 002 client orchestrator. It never decides outcomes — it animates the RGS round record.
import { injectSprite, symbolSVG, SYMBOL_NAMES, altarSVG, ensureWildDefs, COIN_BAND_TOP } from './art.js';
import { Reels, FeatureBoard, cellRect as cellRectM, cellPos, coinPop, hiFlash } from './reels.js';
// v0.20: the reel area (#machine) is scaled to fit the mock-up surround; board-level effects map through it
const MACHINE = { k: 0.80, ox: 380.3, oy: 0, dx: -20.3, dy: 104 };   // v0.29: grid up 9.5 so the surround has even clearance top and bottom
// v0.47 art v2: the reel machine is laid out directly in stage units, so its transform is the identity
if (ART_V2) Object.assign(MACHINE, { k: 1, ox: 360, oy: 0, dx: 0, dy: 0 });
const MACHINE0 = { ...MACHINE };   // v0.35 (checklist 7): the approved placement; the assembly enlargement is applied on top of it
const cellRect = c => { const r = cellRectM(c); if (!ASSETS.ui?.surround) return r; const { k, ox, oy, dy } = MACHINE;
  const X = v => ox + (v - ox) * k + MACHINE.dx, Y = v => oy + (v - oy) * k + dy;
  return { x: X(r.x), y: Y(r.y), w: r.w * k, h: r.h * k, cx: X(r.cx), cy: Y(r.cy) }; };
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { RGS } from './api.js';
import { OPTION_ORDER } from '../math/engine.js';   // v0.71: the option order lives in one place
import * as Summary from './summary.js';   // v0.71 (checklist 19)
import { CARDS } from './cards.js';   // v0.71 (checklist 18)
import { loadManifest, ASSETS } from './assets.js';
import { ART_V2, V2G, v2Icon, buildV2Surround, layoutBackgroundV2, V2_FILES, V2_CORS, buildWings, placeWings, WING, CURTAIN, v2Curtain } from './artv2.js';

const $ = s => document.querySelector(s);
const stage = $('#stage');
const wait = ms => new Promise(r => setTimeout(r, ms));

// v0.68: the test options - ONE table read by the maths profile, the menu, the badge and the loading label. Each row:
// link key, menu label, choices [value, label, profile option or null, badge text or null], default value (the client's
// chosen standard set, 30 Oct). A link only carries values that differ from the default.
const TEST_OPTS = [
  // v0.69: g = the menu group; presets (PRESETS below) set several rows at once
  { g: 'Base game', k: 'version', t: 'Small wins', def: 'fewer', ch: [['fewer', 'Fewer · 13%', 'lean', 'FEWER SMALL WINS'], ['golden', 'GD · 22%', null, 'GD SMALL WINS']] },
  { g: 'Base game', k: 'curtains', t: 'Curtains', def: '22', ch: [['single', 'Single', null, 'CURTAINS SINGLE'], ['22', 'A · 22%', 'dbl22', null], ['36', 'B · 36%', 'dbl36', 'CURTAINS B']] },
  // v0.71 (checklist 17): what curtains reveal, and how often they come. 'Often · modest' (curtOften) is replaced by small blocks;
  // old links with cfreq=often get the small blocks
  { g: 'Base game', k: 'cv', t: 'Curtain reveals', def: 'mix', ch: [['prem', 'Premium only', null, 'CURTAINS PREMIUM'], ['mix', 'Mixed', 'cvMix', null], ['gd', 'GD-like', 'cvGD', 'CURTAINS GD']] },
  { g: 'Base game', k: 'cfreq', t: 'Curtain rate', def: 'std', ch: [['rare', 'Rare · pays more', 'crRare', 'CURTAINS RARE'], ['std', 'Standard', null, null], ['often', 'Often · small blocks', 'crSmall', 'SMALL CURTAINS']] },
  { g: 'Base game', k: 'loco', t: 'Loco Spin', def: 'rare', ch: [['rare', 'Rare · big', null, null], ['often', 'Often · small', 'loco34', 'LOCO OFTEN']] },
  { g: 'Base game', k: 'top', t: 'Top wins', def: 'now', ch: [['now', 'As now', null, null], ['600', '600×+ half', 'top600', 'TOP 600 HALF']] },
  { g: 'Base game', k: 'fdest', t: 'Freed RTP', def: 'pay', needs: ['top', '600'], note: 'needs Top wins 600×+',
    ch: [['more', 'More', 'fMore', 'TO MORE CURTAINS'], ['pay', 'Pay more', 'fPay', 'TO CURTAINS PAYING'], ['big', '×2 wins', 'fBig', 'TO CURTAIN ×2']] },
  { g: 'Base game', k: 'band', t: 'Bandido pays', def: 'mid', ch: [['now', 'As now', null, 'BANDIDO AS NOW'], ['mid', 'Mid · 0.75×', 'band75', null], ['stake', 'Stake · 1×', 'band100', 'BANDIDO 1X']] },   // v0.71 (checklist 16)
  // v0.71 (checklist 20a, 20b)
  { g: 'Base game', k: 'mid', t: 'Mid wins (10–50×)', def: 'now', ch: [['less', 'Fewer', 'midLess', 'MID WINS FEWER'], ['now', 'As now', null, null], ['more', 'More', 'midMore', 'MID WINS MORE']] },
  { g: 'Base game', k: 'near', t: 'Near misses', def: 'now', ch: [['now', 'As now', null, null], ['more', 'More', 'nearMore', 'NEAR MISSES MORE'], ['gd', 'GD-like', 'nearGD', 'NEAR MISSES GD']] },
  { g: 'Base game', k: 'wpop', t: 'Win pop', def: '2', ch: [['off', 'Off', null, null], ['2', '2×+', null, null], ['5', '5×+', null, 'WIN POP 5X']] },   // v0.70 (checklist 10)
  { g: 'Base game', k: 'wpstyle', t: 'Win pop style', def: 'gold', needs: ['wpop', '!off'], note: 'needs Win pop on', ch: [['gold', 'Gold', null, null], ['plaque', 'Plaque', null, 'POP PLAQUE'], ['burst', 'Burst', null, 'POP BURST']] },
  // pot collectors (client 3 Nov 09:21 / 10:00): collector pots in Hold & Win (multipliers at the start, Full House x2) and pot
  // wins in the base game in place of the Clover Spin + curtains (A) or the curtains only (B), or the bonus only
  { g: 'Hold & Win', k: 'pots', t: 'Pot collectors', def: 'off', ch: [['off', 'Off', null, null], ['A', 'On · replaces Loco Spin + curtains', 'potsA', 'POTS A'], ['B', 'On · replaces curtains', 'potsB', 'POTS B'], ['H', 'On · bonus only', 'potsH', 'POTS BONUS ONLY']] },
  { g: 'Hold & Win', k: 'potmk', t: 'Full House ×2 make-back', def: 'bal', needs: ['pots', '!off'], note: 'needs Pot collectors on', ch: [['bal', 'Bonus values', null, null], ['pot', 'Collector bonus', 'potMk', 'POT MAKE-BACK']] },
  { g: 'Hold & Win', k: 'bonus', t: 'Frequency', def: 'std', ch: [['often', 'Often', 'bonusOften', 'BONUS OFTEN'], ['std', '1 in 110', null, null], ['rare', 'Rare', 'bonusRare', 'BONUS RARE']] },
  // v0.68: the 'Top wins' row is held back for v0.69 (to trim only 1,000x+, with a choice of where the RTP goes); the
  // maths options topTrim / topLean stay in math/config.js, unused by the menu
  { g: 'Hold & Win', k: 'fh', t: 'Full House', def: 'big', ch: [['any', 'Any bonus', null, 'FH ANY BONUS'], ['big', 'Big wins', 'bigFH', null]] },
  { g: 'Hold & Win', k: 'jp', t: 'Jackpots', def: 'now', ch: [['now', 'As now', null, null], ['gd', 'GD-like', 'jpGD', 'JACKPOTS GD']] },
  { g: 'Hold & Win', k: 'st', t: 'Super tease', def: '3', ch: [['2', '1 in 2', null, 'TEASE 1/2'], ['3', '1 in 3 lands', null, null], ['4', '1 in 4', null, 'TEASE 1/4']] },   // v0.71: + 1 in 2 (checklist 5)
  { g: 'Hold & Win', k: 'super', t: 'Super', def: 'random', ch: [['random', 'Random', null, null], ['meter', 'Meter', 'meter', 'SUPER METER']] },
  { g: 'Hold & Win', k: 'shape', t: 'Bonus spread', def: 'steady', ch: [['steady', 'Steady', 'steady', null], ['standard', 'Standard', null, 'STANDARD SPREAD'], ['volatile', 'Volatile', 'volatile', 'VOLATILE SPREAD']] },   // v0.71: + Volatile (checklist 20c)
  { g: 'Hold & Win', k: 'bw', t: 'Buy celebrations', def: 'price', ch: [['price', 'vs price', null, null], ['bet', 'vs bet', null, 'BUY WINS VS BET']] },   // v0.69
  { g: 'Look & tools', k: 'spin', t: 'Spin pace', def: 'now', ch: [['brisk', 'Brisk', null, 'SPIN BRISK'], ['now', 'As now', null, null], ['relaxed', 'Relaxed', null, 'SPIN RELAXED']] },   // v0.71 (checklist 20d)
  { g: 'Look & tools', k: 'wcount', t: 'Win count pace', def: 'slower', ch: [['now', 'As now', null, 'COUNT AS NOW'], ['slower', 'Slower', null, null], ['slowest', 'Slowest', null, 'COUNT SLOWEST']] },   // v0.70 (checklist 13)
  { g: 'Look & tools', k: 'stats', t: 'Stats panel', def: 'off', ch: [['off', 'Off', null, null], ['on', 'On', null, null]] },   // v0.68: session stats
  { g: 'Look & tools', k: 'reveal', t: 'Curtain reveal', def: 'glow', ch: [['glow', 'Glow', null, null], ['swirl', 'Swirl', null, 'SWIRL']] },
];
/** v0.69: presets set several linked rows at once (any row can still be changed afterwards -> Custom) */
const PRESETS = [
  ['poco', 'Poco style', { loco: 'rare', top: '600', fdest: 'pay' }],    // Loco Spin a rare, big moment; curtains carry the texture
  ['gd', 'GD style', { loco: 'often', top: 'now', cv: 'gd', cfreq: 'std' }],      // Golden Dragon: a frequent small wild reel; curtains show any symbol (v0.71)
];
/** the value of a test option: the link's, else the default (old links: version=gd/original, version=experiment) */
/** v0.70: a row that needs another row's choice ('!x' = anything but x) */
const needsOk = (o, get) => !o.needs || (o.needs[1].startsWith('!') ? get(o.needs[0]) !== o.needs[1].slice(1) : get(o.needs[0]) === o.needs[1]);
// bonus coin flicker test switches: ?coinfx=v70 | cell | old | none   ?fx=noshadow,gradshadow,plainrays | v69
{ const q = new URLSearchParams(location.search), cf = q.get('coinfx'), fx = (q.get('fx') ?? 'gradshadow').split(',').filter(Boolean);
  const v69 = fx.includes('v69'); document.body.classList.add(`coinfx-${v69 ? 'old' : ['v70', 'cell', 'old', 'none'].includes(cf) ? cf : 'cell'}`);
  for (const f of v69 ? ['noshadow', 'plainrays'] : fx) document.body.classList.add(`fx-${f}`); }
// v0.75: FX TEST panel (client's Galaxy A37 flicker hunt) - switch candidate effects off live, without typing links.
// Every switch is a body class handled in style.css (.lab-*), remembered on the device; nothing changes the maths.
const FXLAB = [
  ['lab-static', 'Freeze ALL looping animations (test)'],
  ['lab-nosway', 'Coins: no idle sway'],
  ['lab-nocoinshadow', 'Coins: no drop shadow'],
  ['lab-noclip', 'Coins: no clipping at the reel edge'],
  ['lab-noglow', 'Bonus coins: no glow'],
  ['lab-noshadow', 'Bonus: no shadow round the columns'],
  ['lab-norays', 'Bonus: no turning rays'],
  ['lab-nohalo', 'Bonus: no halos behind the coins'],
  ['lab-nofx', 'No particle effects (sparks, coins, smoke)'],
  ['lab-nologo', 'Logo / skull: no idle movement'],
  ['lab-nopetals', 'No falling petals'],
  ['lab-nobg', 'Plain background (no picture)'],
];
const fxLab = {
  get() { try { return JSON.parse(localStorage.getItem('pocoFxLab') || '[]'); } catch { return []; } },
  set(list) { try { localStorage.setItem('pocoFxLab', JSON.stringify(list)); } catch { /* private mode */ }
    for (const [c] of FXLAB) document.body.classList.toggle(c, list.includes(c)); fxLab.btn && (fxLab.btn.textContent = list.length ? `FX TEST · ${list.length} off` : 'FX TEST'); },
  build() {
    const b = document.createElement('button'); b.id = 'fxLabBtn'; b.type = 'button'; fxLab.btn = b; b.hidden = true; document.body.append(b);   // client 3 Nov: not on screen; opened from the test menu
    const pnl = document.createElement('div'); pnl.id = 'fxLab'; pnl.className = 'hidden';
    pnl.innerHTML = `<h3>FX TEST</h3><p>Tick to switch an effect OFF. Changes apply at once and are remembered on this phone. Play a bonus and see if the flicker stops.</p>`
      + FXLAB.map(([c, t]) => `<label><input type="checkbox" data-c="${c}"> ${t}</label>`).join('')
      + `<div class="fl-row"><button type="button" data-a="none">All on (normal)</button><button type="button" data-a="close">Close</button></div>`;
    document.body.append(pnl);
    const sync = () => pnl.querySelectorAll('input').forEach(i => { i.checked = fxLab.get().includes(i.dataset.c); });
    b.onclick = e => { e.stopPropagation(); sync(); pnl.classList.toggle('hidden'); };
    fxLab.open = () => { sync(); pnl.classList.remove('hidden'); };
    pnl.addEventListener('click', e => e.stopPropagation());
    pnl.addEventListener('change', e => { const c = e.target.dataset.c; if (!c) return; const l = new Set(fxLab.get()); e.target.checked ? l.add(c) : l.delete(c); fxLab.set([...l]); });
    pnl.querySelector('[data-a="none"]').onclick = () => { fxLab.set([]); sync(); };
    pnl.querySelector('[data-a="close"]').onclick = () => pnl.classList.add('hidden');
    fxLab.set(fxLab.get());
  },
};
fxLab.build(); window.__fxLabOpen = () => fxLab.open?.();
/** client 3 Nov 14:00-14:55: the secret door. Tapping the Settings title drops a rough black "glitch" box: type on its top
 *  half (plain grey text, no field), tap its bottom half to enter; a tap outside it, or a wrong code, just makes it vanish.
 *  The right code opens the test menus and this device remembers it. Only a salted SHA-256 of the code is kept here. */
const LAB_H = 'b9dad4a4aafd081281f1a68bf65b43a36e1a0b31c4798517fbe7fe57a51f7b6f', LAB_KEY = 'pocoLabDevice';
const labOk = () => { try { return localStorage.getItem(LAB_KEY) === LAB_H.slice(0, 16); } catch { return false; } };
function labOpen() { window.__openDev?.(); }
async function labSha(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
function labDoor() {
  if (labOk()) { labOpen(); return; }
  document.getElementById('labDoor')?.remove();
  const d = document.createElement('div'); d.id = 'labDoor';
  d.innerHTML = '<div class="ld-pad"><span class="ld-typed"></span><div class="ld-top"><input inputmode="numeric" autocomplete="off" autocorrect="off" spellcheck="false" aria-hidden="true"></div><div class="ld-bot"></div></div>';
  document.body.append(d);
  const inp = d.querySelector('input'), typed = d.querySelector('.ld-typed'), close = () => d.remove();
  setTimeout(() => inp.focus(), 30);
  inp.addEventListener('input', () => { typed.textContent = inp.value; });
  d.addEventListener('click', e => { if (e.target === d) close(); });
  d.querySelector('.ld-top').addEventListener('click', () => inp.focus());
  const go = async () => { let ok = false; try { ok = (await labSha('ef-lab:' + inp.value.trim())) === LAB_H; } catch { /* no crypto: stays shut */ }
    close(); if (ok) { try { localStorage.setItem(LAB_KEY, LAB_H.slice(0, 16)); } catch { /* private mode */ } closeModal(); verSwitch.unlock(); } };
  d.querySelector('.ld-bot').addEventListener('click', go);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}
// v0.75: the jackpot plaques' shine as a moving layer (see style.css): no full-screen redraw every frame
for (const jp of document.querySelectorAll('.jackpots .jp')) if (!jp.querySelector('.jp-shine')) jp.insertAdjacentHTML('beforeend', '<i class="jp-shine" aria-hidden="true"><b></b></i>');
{ const sh = document.createElement('i'); sh.className = 'tease-shade'; document.querySelector('#backdrop')?.append(sh); }   // v0.75: the tease dim (see teasePush)
const optVal = k => { const o = TEST_OPTS.find(x => x.k === k), v = new URLSearchParams(location.search).get(k);
  if (k === 'version' && v) return /^(golden|gd|original)$/.test(v) ? 'golden' : 'fewer';
  return o.ch.some(c => c[0] === v) ? v : o.def; };
/** v0.71: the maths profile for a set of row choices (get = row key -> value); also used for the menu's pending choices */
function profileOf(get) { const p = [];
  if (/[?&](math=pace|v=2)\b/.test(location.search)) p.push('pace');
  for (const o of TEST_OPTS) { if (!needsOk(o, get)) continue; const v = get(o.k), c = o.ch.find(x => x[0] === v); if (c?.[2]) p.push(c[2]); }
  p.sort((a, b) => OPTION_ORDER.indexOf(a) - OPTION_ORDER.indexOf(b));   // v0.71: one list, from the engine
  return p.length ? p.join('+') : 'standard'; }
const S = {
  cfg: null, balance: 0, betIdx: 0, extra: false, turbo: false, busy: false, sound: true,
  auto: { running: false, remaining: 0, stopOnFeature: true, stopOnBig: false, stopRequested: false },
  pendingForce: null, last: null, roundWin: 0, skip: false,
  // 0.3.0: maths profile (?math=pace or ?v=2 plays the Faster pace comparison build), candle meter, live jackpot plaques
  // v0.64-v0.66: link switches, combinable - ?version=experiment (the Experiment version: fewer wins below the stake),
  // ?shape=steady (steadier bonus and Buy), ?super=meter (the candle meter: when full, the next Hold & Win is a Super);
  // ?reveal=swirl is presentation only. Sent to the RGS as e.g. 'lean+meter'. The footer switch (verSwitch) sets them.
  // v0.68: built from TEST_OPTS (defaults = the client's standard set), in the maths' OPTION_ORDER
  profile: profileOf(optVal), meterState: { lit: 0 }, jpLive: null,
};
/** Double Chance is the old Extra Bet switch (S.extra). */
const modeName = () => (S.extra ? 'double' : 'base');
// Published figures shown to players (docs/PAR.md, math 0.4.1). Faster pace has its own.
const PAR_TXT = {
  standard: { base: 107, double: 59, superBase: 970, superDouble: 535 },   // v0.63 (math 0.8.0, docs/MATH_0.8.0.md)
  pace: { base: 107, double: 59, superBase: 970, superDouble: 535 },   // 0.8.0: same odds as standard
};

const rgs = new RGS();
const audio = new Audio();
const fx = new FX($('#fx'));
const fx2 = new FX($('#fx2'));
// v0.55: the logo's smoke has its own layer in the game (not on the board, which zooms in Hold & Win), above the logo
// v0.62e (client): the Big Win's own scattered coin rain, falling from the top of the screen behind the characters. It
// used to fall on the board canvas, which the full-screen celebration (v0.62) hides, so it had disappeared.
// It sits on the full-screen celebration backdrop, so on a wide screen it falls across the whole width.
const fxBw = (() => { const c = document.createElement('canvas'); c.id = 'fxBw'; c.width = 0; c.height = 0; $('#backdrop .cele').append(c); const f = new FX(c); f.LW = f.LH = 0; return f; })();   // v0.62j: no memory until a Big Win
/** Size the rain canvas to the screen in game px (coins the same size as in the game); returns the rain intensity that
 *  keeps the same scattered density per area on any width. */
function fitFx(f) { const r = f.c.getBoundingClientRect(), k = $('#game').getBoundingClientRect().width / 720; if (!r.width || !k) return 1;
  const LW = Math.round(r.width / k), LH = Math.round(r.height / k);
  if (LW !== f.LW || LH !== f.LH || !f.c.width) { f.LW = LW; f.LH = LH; f.R = 0; } f.setResolution(1);   // v0.62j: standard resolution (small coins and confetti)
  return Math.max(1, LW / 720); }
const fxTop = (() => { const c = document.createElement('canvas'); c.id = 'fxTop'; c.width = 720; c.height = 1280; $('#game').append(c); return new FX(c); })();   // v0.62f: full height (every skull swoosh is drawn here, above the logo)
let reels, board, money, num;

// ---------- formatting ----------
const bet = () => S.cfg.bets[S.betIdx];
const buToMinor = (bu, b = bet()) => Math.floor((bu * b) / 100);
const fmt = minor => money.format(minor / 100);
const fmtNum = minor => num.format(minor / 100);
/**
 * Brief 18 Oct (s16A): every presentation timing in one place. Values are ms unless noted. These are tuning choices,
 * not measured reference timings. Overlapping events share one timeline (the entry), they are not added serially.
 * window.__game.PRES exposes this object so timings can be tuned live.
 */
const PRES = {
  // 07 continuous Hold & Win entry (one timeline). Checklist 16: trigger recognition 400-600 (entryGrow)
  entryGrow: 520, entryScale: 1.22, entryHold: 560, entrySettle: 460, dropMs: 520, dropStagger: 40,
  // 16: repeat-entry line (first entry shows the rules card instead); range 600-900
  repeatEntry: 800,
  // 09 logo activation. Checklist 13: every multiplier gets its own shake; the first build is the full one
  logoBuild: 1400, multReshake: 950, logoRecoil: 420, releaseGap: 260, multGap: 520,   // multGap v0.62f: between opening multipliers (one shake)
  // 13: cosmetic smoke-only tease in Hold & Win (logo strains, small puff, nothing awarded). Never before a real
  // multiplier, never on two eligible respins in a row, at most once every `smokeCooldown` respins.
  // Frequency (20k simulated bought features, 6.8 respins each): before, the only smoke-only moment was the Coin Save
  // fizzle from the round record, 0.056 per feature (about 1 in 18). This adds a cosmetic one at 2.5 % per eligible
  // respin (about 5 eligible per feature, cooldown included) -> +0.13 per feature, 0.18 in total (about 1 in 5-6).
  smokeChance: 0.025, smokeCooldown: 3, smokeBuild: 1000,   // v0.52: 700 -> 1000 (client: longer shake before the smoke)
  // 17 Coin Save: zero recognition 350-500, logo build (the announcement) 800-1200 excluding travel
  zeroRecog: 420, rescueBuild: 1600, fizzleSettle: 380, saveBuild: 2000, saveBuildMin: 1300,   // v0.52: Coin Save build-ups longer (were 1400 / 1050)
  // 15 spins text + meter: one event; reset feedback 350-550
  markerSpend: 220, markerReset: 450, newCoinRecog: 250,
  // 08 / 16 multiplier events: recognition 600-900 per award
  frameEvent: 760,
  // 12 partial tease: approach +25 % (260 -> 325), a creeping hesitation instead of a frozen hold, smooth outcomes
  teaseRespin: 700, zoomTwo: 1.18, zoomOne: 1.22, zoomSuper: 1.28, zoomLight: 1.1, lightK: .7, peekSpin: 700, peekApproach: 200, peekHold: 140, peekResolve: 170, peekGap: 330, peekJitter: 170, peekMinGap: 1000, peekTotal: 2600, zoomHold: 400, zoomOut: 700, zoomRest: 900,   /* v0.67 (checklist 8) */
  superCreep: 1100, superHang: 1500, superLand: 1 /* v0.67: every natural last coin */, superMiss: ({ 2: 0.0125, 3: 0.025, 4: 0.037 })[optVal('st')] ?? 0.025 /* v0.67: 1 in 3 super teases land; v0.71: 1 in 2 / 1 in 4 */,   // v0.62l super tease (odds to be set from the maths)
   twoSpin: 1700, twoGap: 1150, twoLast: 1650, teaseApproach: 325,   // v0.62f: the hole spins on ~0.7 s between the last hole's two teases; two holes left ~4.5 s (originally 5 s)
   teaseHold: 230, teaseResolve: 230, teaseDrop: 300, teaseChanceEmpty: 0.16, teaseChanceLand: 0.45, teaseMaxPerSpin: 3,
  teaseTwo: 0.75, teaseLastLand: 0.9, teaseLastFail: 0.35, teaseLastFailMax: 2,   // v0.58 (client): more teases near the end, rationed on the last hole
  // 07C / 13B halos
  haloCycle: 2500,
  // 17 Full House: final-coin recognition 300-500, announcement 800-1200
  fullHouseSettle: 400, fullHouseMs: 1000,
  // 18 pre-collection: every coin enlarges together (entry replay), then drops back one by one (150-200 apart);
  // the strong glow lights as each one settles
  prepGrow: 480, prepHold: 160, prepDrop: 380, prepStagger: 170,
  // 19 collection: flight 350-500 by distance; arrivals 1->2 ~420 apart, later ~290; pulse 1.4x, peak 85, settle 250
  flightMin: 350, flightMax: 500, gapFirst: 420, gapRoutine: 290, emphMs: 130, multExplain: 760, jackpotMs: 1000,
  pulseScale: 1.4, pulsePeak: 85, pulseSettle: 250, pulseLastK: 1.12,
  // 19 jolt of grid + surround + bar: 3 CSS px at a 390 px viewport (= 5.5 stage units), settling in 150 ms
  shakeMs: 150, shakePx: 5.5, shakeFinalK: 1.5,
  // 19 / 15 completion: exact total readable for 600-900 before the result screen; result reading time
  collectRead: 750, readingPause: 1500,
  // 21 base win bar (checklist 19: pulse 1.08-1.12, settle 160-220)
  baseWinPulse: 450, baseWinScale: 1.28,   /* v0.67 (checklist 2): was 200 / 1.1 */ baseWinBurst: 480,
  // v0.54 (client): the last-squares respins hold the fire, zoom and riser longer (was 1150 / 840 / 1365: about 3.4 s
  // for two squares, now about 5.1 s)
  tenseSpin: 1750, tenseGap: 1150, tenseLast: 700,   // v0.62f (client): the last-hole spin as long as before the changes (about 4.7 s) with both teases and the spin between them
  // quick spin factor (base game only)
  quick: 0.45,
};
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Quick spin speeds the base game only: the bonus always plays at normal speed (team review).
const T = ms => (S.turbo && !S.inFeature ? Math.round(ms * PRES.quick) : ms);
// A wait the player can cut short with the spin button (skip). S.skip is reset at the start of each phase.
const skipBus = new EventTarget();
const sw = ms => (S.skip ? Promise.resolve() : Promise.race([wait(ms), new Promise(r => skipBus.addEventListener('skip', r, { once: true }))]));
function requestSkip() { S.skip = true; if (S.inFeature) S.hurry = true; reels?.slam(); skipBus.dispatchEvent(new Event('skip')); }
const labelFor = coin => (coin.pot ? { text: coin.pending ? 'COLLECT' : fmtNum(buToMinor(coin.v)), cls: `cpot${coin.pending ? ' cpot-wait' : ''}` }
  : coin.col ? { text: coin.pending ? 'COLLECT' : fmtNum(buToMinor(coin.v)), cls: `ccol${coin.pending ? ' ccol-wait' : ''}` }
  : coin.jp ? { text: coin.jp, cls: `cjp cjp-${coin.jp}` } : { text: fmtNum(buToMinor(coin.v)), cls: '' });

// ---------- layout ----------
function fit() {
  // v0.72 (client's A11 desktop layout): a wide window gets the 1920x1080 landscape arrangement; everything else the
  // 720x1280 portrait layout, scaled to fit. The arrangement only changes between rounds (WIDE.pending), never mid-animation.
  const want = wantWide();
  if (want !== WIDE.on) { if (S.busy || S.inFeature) WIDE.pending = true; else { WIDE.on = want; WIDE.pending = false; leaveWide(); } }
  if (WIDE.on) return fitWide();
  // The 720x1280 portrait layout, scaled to fit the window.
  // v0.24: portrait only. Wide windows (desktop, landscape phones) show the same phone layout centred, background filling the sides.
  const land = false;
  stage.classList.toggle('land', land);
  // v0.12: portrait uses the extra height of tall phones (up to 720x1500) so the bottom section can breathe;
  // on shorter portrait windows the machine block scales down a touch instead of the controls overlapping it.
  const H = land ? 720 : Math.round(Math.max(1280, Math.min(1500, 720 * innerHeight / innerWidth)));
  const W = land ? 1280 : 720;
  stage.style.height = `${H}px`;
  const s = Math.min(innerWidth / W, innerHeight / H);
  applyStageScale(s);
  // brief s03C: essential content stays inside the safe area (notch / home indicator) with 12 CSS px of breathing room
  // under the footer; the footer background still runs to the screen edge. --hit is a 44 CSS px touch target in stage px.
  const safe = safeInsets();
  const footPad = (safe.bottom + 12) / s, topPad = safe.top / s;
  stage.style.setProperty('--safe-t', `${topPad.toFixed(1)}px`); stage.style.setProperty('--safe-b', `${(safe.bottom / s).toFixed(1)}px`);
  stage.style.setProperty('--hit', `${(44 / s).toFixed(1)}px`);
  const game = $('#game');
  if (land) game.style.transform = '';
  else {
    // v0.26 (s8): the game block now ends at the win bar (1126); Buy / Extra moved into the controls (270 tall).
    const nav = !!document.querySelector('.controls.nav26'), ut = document.body.classList.contains('util-top');
    const GH = ART_V2 ? V2G.gameH : nav ? 1126 : ut ? 1196 : 1232, CH = (nav ? (ART_V2 ? 246 : 270) : ut ? 272 : 206) + (nav ? footPad : 0), GAP = 14;   // v0.50: tighter controls (art v2)
    const g = Math.min(1, (H - topPad - CH - GAP) / GH);
    game.style.transform = `translate(${(720 - 720 * g) / 2}px, ${topPad.toFixed(1)}px) scale(${g})`;
    fx.setResolution(Math.min(1.5, (window.devicePixelRatio || 1) * s * g)); fxTop.setResolution(1);   /* v0.62j: standard resolution (Android GPU memory) */   // v0.52: capped (iPhone memory; particles look the same)
    const c = document.querySelector('.controls.nav26');
    if (c) { const top = Math.round(topPad + GH * g + GAP); c.style.top = `${top}px`; c.style.height = `${H - top}px`;
      c.style.setProperty('--foot-pad', `${footPad.toFixed(1)}px`);
      // v0.50: the controls sit together at the bottom and the spare height goes above Buy / Double Chance, where the
      // assembly's zoom takes it; if the zoom is capped (the side frames reach the screen edges) the rest goes back
      // between Buy / Double Chance and the spin button
      c.style.setProperty('--slack', `${Math.max(0, H - top - CH)}px`); }
    const r = layoutAssembly(g, topPad);
    if (c && r?.capped && r.excess > 1) {
      // v0.53: when the grid can't grow any more (it stops at the wings), the spare height is shared three ways: above
      // the jackpots, under the win bar and under the Buy row
      const sl = parseFloat(c.style.getPropertyValue('--slack')) || 0, share = r.excess / 3, tp = topPad + share;
      game.style.transform = `translate(${(720 - 720 * g) / 2}px, ${tp.toFixed(1)}px) scale(${g})`;
      c.style.setProperty('--slack', `${Math.max(0, sl - share).toFixed(1)}px`); layoutAssembly(g, tp); }
  }
  layoutBackground();
  requestAnimationFrame(placeJackpots);   // v0.55: the plaques and the Super badge follow every layout change
  requestAnimationFrame(alignSideButtons);   // v0.68 (checklist 3)
}
// ---------- v0.72: the wide (desktop / landscape) layout, client's mock-up A11 ----------
// Designed on a 1920x1080 frame, scaled to fit (letterboxed by the background). The logo + grid assembly keep the
// portrait proportions as one unit; the jackpots go to the top corners, Double Chance / Buy Feature left of the grid,
// the spin cluster right of it under the Super badge, and a 44 px strip along the bottom. Positions are the mock-up's.
const WIDE = { on: false, pending: false, g: 1, tx: 0, ty: 0,
  // the A11 reference numbers (stage px in the 1920x1080 frame)
  ref: { logoTop: 4, barBottom: 1030, stripH: 44, plaqueW: 250, plaqueTop: 34, plaqueGap: 10, leftX: 376, btnW: 196, btnH: 44, btnGap: 16,
    badgeCx: 1419, badgeTop: 242, badgeW: 124, spinCy: 902, spinD: 104, smallD: 43, smallDx: 62, smallCy: 1006 } };
/** wide when the game's window is clearly wider than tall (1.2+, back to portrait only at 1.05 or less) and at least
 *  500 px tall (a phone on its side stays portrait). ?layout=wide / portrait forces one (QA). */
function wantWide() {
  const q = new URLSearchParams(location.search).get('layout'); if (q === 'wide') return true; if (q === 'portrait') return false;
  const vv = window.visualViewport, w = vv?.width || innerWidth, h = vv?.height || innerHeight, r = w / h;
  if (h < 500) return false;
  // v0.75c (client, 1 Nov): the switch back to the phone layout happens at nearly the same shape as the switch to desktop
  // (it used to wait until the window was almost square, so a desktop window made narrower kept a tiny letterboxed layout
  // that a freshly opened window of the same size would not get)
  return WIDE.on ? r > 1.3 : r >= 1.4;
}
/** inline layout styles written in the wide layout (cleared again when the window goes back to portrait) */
const wideSet = (el, props) => { if (!el) return; el.dataset.wideStyled = '1'; for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v, 'important'); };
function leaveWide() {
  stage.classList.toggle('wide', WIDE.on); document.documentElement.classList.toggle('wide', WIDE.on);
  for (const el of document.querySelectorAll('[data-wide-styled]')) { el.removeAttribute('style'); delete el.dataset.wideStyled; }
  stage.style.width = WIDE.on ? '1920px' : ''; stage.style.height = WIDE.on ? '1080px' : ''; if (!WIDE.on) stage.style.translate = '';
  if (!WIDE.on) { fxTop.setResolution(1); fxTop.resize(720, 1280, 0, 0); if ($('#launch') && !$('#playBtn')?.disabled) requestAnimationFrame(layoutLaunch); }   // the wide size is set by fitWide (it depends on the game's scale)
}
function fitWide() {
  const R = WIDE.ref; stage.classList.add('wide'); stage.style.width = '1920px'; stage.style.height = '1080px';
  // v0.75 (client, Edge): if the game first laid out in portrait (Edge reports a narrow window for a moment while it opens),
  // the phone placement of quick spin / autoplay was left on them as inline styles and pushed them far right in the wide
  // layout. The wide layout owns their position: clear it.
  for (const id of ['#turboBtn', '#autoBtn']) $(id)?.style.removeProperty('left');
  const vv = window.visualViewport, s = Math.min((vv?.width || innerWidth) / 1920, (vv?.height || innerHeight) / 1080);
  applyStageScale(s);
  // v0.74 (D5): on a window taller than 16:9 the frame sits at the bottom (the strip on the window's bottom edge); the
  // extra height shows the background above the jackpots instead of an empty band under the strip
  const spareY = Math.max(0, (vv?.height || innerHeight) / s - 1080) / 2;
  stage.style.translate = spareY > 0.5 ? `0 ${spareY.toFixed(1)}px` : '';
  stage.style.setProperty('--safe-t', '0px'); stage.style.setProperty('--safe-b', '0px'); stage.style.setProperty('--hit', `${(44 / s).toFixed(1)}px`);
  // the assembly at its resting (base-game) zoom, A = 1, lifted under the logo as in portrait
  const m = $('#machine'), bar = $('#asmBar'), lift = ART_V2 ? logoLift() : 0, top0 = ASM.top - lift;
  ASM.A = 1; ASM.lift = lift; ASM.push = 1.05;   // a gentler push-in: the grid grows upwards towards the logo
  if (m) { const ax = MACHINE0.ox + (360 - MACHINE0.ox - MACHINE0.dx) / MACHINE0.k, ay = (ASM.top - MACHINE0.dy) / MACHINE0.k;
    MACHINE.k = MACHINE0.k; MACHINE.dx = 360 - MACHINE0.ox - (ax - MACHINE0.ox) * MACHINE.k; MACHINE.dy = top0 - ay * MACHINE.k;
    m.style.transform = `translate(${MACHINE.dx.toFixed(3)}px, ${MACHINE.dy.toFixed(3)}px) scale(${MACHINE.k.toFixed(5)})`; }
  if (bar) { bar.style.transformOrigin = `360px ${V2G.winBottom}px`; bar.style.transform = ''; bar.style.translate = lift ? `0 ${(-lift).toFixed(2)}px` : ''; }   // push-in about the bar's bottom (it sits 6 px above the strip)
  const brd = $('#board'); if (brd) brd.style.transformOrigin = `360px ${(V2G.winBottom - lift).toFixed(1)}px`;
  // logo top (the hat) and the win bar's bottom, in game units -> one scale and offset that put them at A11's lines
  const logo = $('.logo .logo-img'), hat = logo ? logo.closest('.logo').offsetTop + logo.offsetTop : 0, barBot = V2G.winBottom - lift;
  const g = WIDE.g = (R.barBottom - R.logoTop) / (barBot - hat), tx = WIDE.tx = 960 - 360 * g, ty = WIDE.ty = R.logoTop - hat * g;
  const game = $('#game'); game.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${g.toFixed(4)})`;
  ASM.g = g; ASM.pivot = ty + g * top0; ASM.hudTop = ty + g * (top0 + (ASM.bottom - ASM.top)) + ASM.meterGap;
  fx.setResolution(Math.min(1.5, (window.devicePixelRatio || 1) * s * g));
  // the top effects layer covers exactly the visible 1920x1080 frame (in game units), so swooshes to the plaques, the lives
  // counter and the Full House chip are seen wherever they now sit; about the same pixels as the portrait layer
  fxTop.resize(1920 / g, 1080 / g, -tx / g, -ty / g); fxTop.setResolution(0.75, 0.75);   // about the portrait layer's pixel count (canvas memory)
  const G = (x, y) => ({ x: (x - tx) / g, y: (y - ty) / g });   // stage px -> game units
  // jackpots: GRAND over MINOR left, MAJOR over MINI right, 250 px plaques mirrored about the centre
  const pw = R.plaqueW / g;
  for (const [sel, x] of [['.jp-col.left', R.leftX], ['.jp-col.right', 1920 - R.leftX - R.plaqueW]]) { const p = G(x, R.plaqueTop);
    wideSet($(sel), { left: `${p.x.toFixed(1)}px`, top: `${p.y.toFixed(1)}px`, width: `${(200).toFixed(1)}px`, transform: `scale(${(pw / 200).toFixed(4)})`, 'transform-origin': '0 0', gap: `${(R.plaqueGap / g / (pw / 200)).toFixed(1)}px` }); }
  // on screens wider than 16:9 the bottom strip still runs edge to edge (the frame itself stays centred)
  const extra = Math.max(0, ((vv?.width || innerWidth) / s - 1920) / 2);
  // v0.74 (D5): the strip spans the whole window; BALANCE sits at the window's left edge area and the icons at its right
  // edge area (not the centred frame's); the stake stays centred under SPIN TO PLAY
  // v0.74 (client, 31 Oct 14:39): BALANCE sits under BUY FEATURE; sound and menu (only those two) sit spread out under
  // the spin button; the stake stays centred under SPIN TO PLAY. Placed in the strip's own coordinates (it starts at -extra).
  wideSet($('.controls.nav26 .row-strip'), { left: `${(-extra).toFixed(1)}px`, width: `${(1920 + 2 * extra).toFixed(1)}px`, 'padding-left': '0px' });
  wideSet($('.controls.nav26 .row-strip .meter.bal'), { position: 'absolute', left: `${(extra + R.leftX + R.btnW / 2).toFixed(1)}px`, top: '50%', transform: 'translate(-50%, -50%)', 'text-align': 'center' });
  wideSet($('.controls.nav26 .row-strip .strip-icons'), { left: `${(extra + R.badgeCx).toFixed(1)}px`, right: 'auto', transform: 'translate(-50%, -50%)' });
  wideSet($('.controls.nav26 .row-strip .stake'), { left: `${(960 + extra).toFixed(1)}px` });
  // Double Chance over Buy Feature: in the controls' row (stage px), placed by CSS (#stage.wide .row-feat)
  wideSet($('.demo-badge'), { left: '24px', right: 'auto', top: `${(14 - spareY).toFixed(1)}px`, bottom: 'auto', 'text-align': 'left', 'font-size': '11px' });   // at the window's top even when the frame sits lower
  // desktop: a full-screen button beside sound and menu (not where the browser has no full screen, e.g. iPhone Safari)
  if (false && document.fullscreenEnabled && !$('#fsBtn')) {   // v0.74 (client): no full-screen icon - only sound and menu const fb = document.createElement('button'); fb.id = 'fsBtn'; fb.className = 'util'; fb.title = 'Full screen'; fb.setAttribute('aria-label', 'Full screen');
    fb.innerHTML = '<svg viewBox="0 0 24 24"><path class="w" d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
    fb.addEventListener('click', () => { audio.play('button'); (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}); });
    $('.strip-icons')?.prepend(fb); }
  layoutBackground();
  requestAnimationFrame(placeJackpotsWide); requestAnimationFrame(() => candles.place());
  if ($('#launch') && !$('#playBtn')?.disabled) requestAnimationFrame(layoutLaunch);   // v0.74 (D1)
}
function placeJackpotsWide() { /* the plaques were placed by fitWide; nothing to measure */ }
/** v0.68 (checklist 3): quick spin centred under BUY FEATURE, autoplay under DOUBLE CHANCE (more room round the spin
 *  button); measured from the real buttons so it follows every layout. The test-versions icon follows autoplay. */
function alignSideButtons() {
  if (WIDE.on) { try { verSwitch.place(); } catch { /* not built yet */ } return; }
  const row = document.querySelector('.controls .row-main'); if (!row) return;
  const k = row.getBoundingClientRect().width / row.offsetWidth || 1, rr = row.getBoundingClientRect();
  for (const [btnId, refId] of [['#turboBtn', '#buyBtn'], ['#autoBtn', '#extraBtn']]) {
    const b = $(btnId), ref = $(refId); if (!b || !ref || !ref.offsetWidth) continue;
    const rc = ref.getBoundingClientRect(), cx = (rc.left + rc.width / 2 - rr.left) / k;
    b.style.setProperty('left', `${(cx - b.offsetWidth / 2).toFixed(1)}px`, 'important'); }
  try { verSwitch.place(); } catch { /* not built yet */ }
}
/**
 * v0.53 (iPhone crash, item 15): the stage is sized with CSS `zoom` instead of a scale transform, so the browser lays
 * the game out at the phone's real size and draws every layer at the size it is seen (a scale-down transform makes iOS
 * Safari draw each layer at the full 720-wide size x 3 pixel density first: about 2.8x the graphics memory on an
 * iPhone 13 Pro Max). All position maths reads sizes from getBoundingClientRect, so it keeps working as long as the
 * browser reports zoomed rectangles; that is checked once, and if it does not hold the old transform is used instead.
 * `?zoom=0` forces the old method (comparison).
 */
function applyStageScale(s) {
  const Z = applyStageScale;   // Z.ok: undefined = not checked yet, true / false after the check
  if (Z.ok === undefined && !(CSS.supports?.('zoom', '1') && !/[?&]zoom=0\b/.test(location.search))) Z.ok = false;
  if (Z.ok !== false) {
    stage.style.zoom = String(s); stage.style.transform = 'translate(-50%, -50%)';
    if (Z.ok === undefined) { const w = stage.getBoundingClientRect().width; Z.ok = Math.abs(w - stage.offsetWidth * s) < 2;
      if (!Z.ok) stage.style.zoom = ''; }
    if (Z.ok) { document.documentElement.classList.add('stage-zoom'); return; }
  }
  stage.style.zoom = ''; stage.style.transform = `translate(-50%, -50%) scale(${s})`;
}
/**
 * Checklist 5 (v0.35): the background composition. The asset (964 x 1632, art/background) was cut from the team mock-up,
 * where it fills the screen. The approved "quiet background" render named in the checklist was not supplied, so the rows
 * below come from the written description and the asset itself. Instead of a viewport `cover` crop (which on wide or
 * short windows zooms into the flower-filled middle of the picture), the PNG is placed in the game's own coordinates so
 * the same picture rows always meet the same layout landmarks:
 *   image row 160 (evening sky between the buildings and the church tower) -> the logo centre,
 *   image row 1180 (the clean central stone path, marigolds only at its sides) -> the bottom edge of the win-bar surround.
 * Uniform scale only, centred horizontally. Where that would leave the top, the sides or the area above the (near-opaque)
 * footer strip uncovered, the scale grows about the win-bar row until it covers (never a stretch, never a fill). Shading behind the lower controls
 * is a separate background-only layer (#bgShade), positioned from the same landmarks; no foreground element is darkened.
 */
const BG = { w: 964, h: 1632, logoRow: 160, barRow: 1180 };
function layoutBackground() {
  if (ART_V2) return layoutBackgroundV2();
  const els = [...document.querySelectorAll('.bg-img')], logo = $('.logo .logo-img'), shade = $('#bgShade');
  const L = window.__layout; if (!els.length || !logo || !L) return;
  const st = stage.getBoundingClientRect(), k = st.width / 720, vw = innerWidth, vh = innerHeight;
  const gr = $('#game').getBoundingClientRect(), gk = gr.width / 720; if (!logo.offsetHeight || !gk) return;
  const yLogo = gr.top + (logo.closest('.logo').offsetTop + logo.offsetTop + logo.offsetHeight / 2) * gk;   // layout box: ignores the idle bob
  const yBar = st.top + L.plaqueBottom * k;
  let p = (yBar - yLogo) / (BG.barRow - BG.logoRow), top = yLogo - BG.logoRow * p;
  // the image must reach the footer strip (which is near-opaque and runs on to the bottom edge of the window)
  const foot = $('.controls.nav26 .row-strip'), yFoot = foot ? foot.getBoundingClientRect().top + 2 : vh;
  if (top + BG.h * p < yFoot) { p = (yFoot - yBar) / (BG.h - BG.barRow); top = yBar - BG.barRow * p; }
  if (top > 0) { p = Math.max(p, yBar / BG.barRow); top = yBar - BG.barRow * p; }                   // reach the top edge
  if (BG.w * p < vw) { p = vw / BG.w; top = yBar - BG.barRow * p; }                                  // reach both sides
  const w = BG.w * p, h = BG.h * p, left = (vw - w) / 2;
  for (const el of els) { el.style.setProperty('background-size', `${w.toFixed(1)}px ${h.toFixed(1)}px`, 'important'); el.style.setProperty('background-position', `${left.toFixed(1)}px ${top.toFixed(1)}px`, 'important'); }
  if (shade) { const b = st.top + (L.buyTop - 40) * k; shade.style.top = `${b.toFixed(1)}px`; }
  window.__bg = { scale: +p.toFixed(4), imgTop: +top.toFixed(1), imgLeft: +left.toFixed(1), w: +w.toFixed(1), h: +h.toFixed(1), barRowAt: +yBar.toFixed(1), logoRowAt: +(top + BG.logoRow * p).toFixed(1), logoCentre: +yLogo.toFixed(1) };
}
/**
 * Checklist 19 Oct, items 6 / 7 / 8 (v0.35). Measured after the controls are placed (stage units = the 720-wide stage).
 *  7: the reel assembly (reels, symbols, surround, posts, plinths, win bar + its text, masks and effects) is enlarged as
 *     one piece about its top centre, aiming for a ~30-unit gap above Buy Feature / Extra Bet. The largest uniform scale
 *     that keeps the frame's outermost protrusions (pilaster steps, plaque tabs: 358 units either side of the centre)
 *     inside the stage with their existing 2-unit margin wins; when width is the limit the actual gap is reported.
 *  6: Quick Spin / Spin / Autoplay move up together so the spin button sits midway between the Buy / Extra row and the
 *     footer (their hit areas move with them; Buy / Extra and the footer stay put).
 *  8: the spins meter is drawn at 50 % and hangs ~14.6 units (10 px at the 493 px reference) below the win bar.
 */
const ASM = { top: 244.5, bottom: 1069.9, half: 352.2, gapTarget: 30, meterGap: 14.6, A: 1, lift: 0, push: 1.09 };   // v0.37: frame9 extents (tools/build_surround5.py geometry.json)
if (ART_V2) Object.assign(ASM, { top: V2G.top, bottom: V2G.bottom, half: V2G.half, gapTarget: 18 });   // v0.47: art v2 machine extents; v0.50: 18-unit gap above Buy
function layoutAssembly(g, topPad) {
  const buy = $('#buyBtn'), m = $('#machine'), bar = $('#asmBar'); if (!buy || !m || !bar || !ASSETS.ui?.surround) return null;
  const st = stage.getBoundingClientRect(), k = st.width / 720 || 1, Y = r => (r - st.top) / k;
  const br = buy.getBoundingClientRect(), buyTop = Y(br.top), buyBot = Y(br.bottom);
  // v0.50 (26 Oct): the centre column's stone lintel sits just under the logo on every screen. `lift` (game units) moves
  // the whole assembly up from its drawn position, and the room it frees goes to the zoom.
  const lift = ART_V2 ? logoLift() : 0, top0 = ASM.top - lift;
  const Ah = ((buyTop - ASM.gapTarget - topPad) / g - top0) / (ASM.bottom - ASM.top);
  const Aw = 358 / (ASM.half * g);   // keeps the frame's outermost edge (360 ± half·A·g) at least 2 units inside the stage
  // v0.49 art v2: the machine and its win bar zoom together from the grid's top edge to fill the height down to the
  // Buy / Double Chance row; the outer pillars may run past the screen edges (client decision, 25 Oct).
  // v0.50: but the side columns' own frames always stay on screen (the reels are never cut), so the zoom stops there.
  const Acol = ART_V2 ? 356 / (V2G.colHalf * g) : Aw;
  // v0.53 (item 3): at rest the side columns stop at the wings' inner edge (2 units clear), so the wings always show in
  // full; the Hold & Win zoom may still go in front of them (Afeat keeps the old limit)
  // v0.54: the pillars are part of the surround again; at rest the whole surround (pillars included) stays on screen
  const wingW = 0, Arest = ART_V2 ? Acol * V2G.colHalf / (V2G.colHalf + WING.art) : Aw;
  const Abase = ART_V2 ? Math.max(1, Math.min(Ah, 1.7, Acol, Arest)) : Math.max(1, Math.min(Ah, Aw));
  // v0.50: in Hold & Win the Buy / Double Chance row is hidden, so the camera eases in to fill that space too, down to the
  // spins meter's room above the footer strip (S.zoomIn, set on bonus entry; the change animates, see featureZoom)
  const strip = $('.controls.nav26 .row-strip'), stripTop = strip ? Y(strip.getBoundingClientRect().top) : buyBot + 200;
  const hud = Math.max(($('#spinMeter')?.offsetHeight || 120) * 0.5, $('#fhChip')?.offsetHeight || 60) + 18;
  // the push-in (last empty positions) never cuts an outer reel; in the zoomed-in bonus it is gentler (1.05), since the
  // grid is already larger, so the zoom can take the room the push-in would otherwise need under the bar
  // v0.55 (client): the bonus's resting view is never smaller than the base game's and never past the point where the
  // pillars fit; the push-in on the last squares may take the pillars off screen, but the stone border next to the
  // symbols (the side columns' frames) always stays on screen
  const Pcol = A => 356 / (V2G.colHalf * A * g);
  const pushFor = (A, feat) => (ART_V2 ? Math.max(1, Math.min(feat ? 1.10 : 1.09, Pcol(A))) : 1.09);
  let Afeat = Abase;
  if (ART_V2) { for (let A = Math.min(1.7, Arest); A > Abase; A -= 0.005) { const D = g * A * (ASM.bottom - ASM.top);
    if (topPad + g * top0 + pushFor(A, true) * D + ASM.meterGap + hud <= stripTop) { Afeat = A; break; } }
    Afeat = Math.max(Abase, Math.min(Afeat, Arest)); }
  const A = S.zoomIn ? Afeat : Abase;
  ASM.A = A; ASM.g = g; ASM.lift = lift; ASM.push = pushFor(A, !!S.zoomIn); ASM.pcol = ART_V2 ? Pcol(A) : 1.09;   // v0.75: the deepest push that keeps the outer reels on screen
  // machine: same anchor point (moved up by the lift), scale k0·A (cellRect, effects, masks and the surround follow MACHINE)
  const ax = MACHINE0.ox + (360 - MACHINE0.ox - MACHINE0.dx) / MACHINE0.k, ay = (ASM.top - MACHINE0.dy) / MACHINE0.k;
  MACHINE.k = MACHINE0.k * A; MACHINE.dx = 360 - MACHINE0.ox - (ax - MACHINE0.ox) * MACHINE.k; MACHINE.dy = top0 - ay * MACHINE.k;
  m.style.transform = `translate(${MACHINE.dx.toFixed(3)}px, ${MACHINE.dy.toFixed(3)}px) scale(${MACHINE.k.toFixed(5)})`;
  // the win bar's text, its effects and the HUD text scale about the same point; the lift is the separate `translate`
  // property so the push-in (`scale`) still grows the bar from the grid's top edge
  bar.style.transformOrigin = `360px ${ASM.top}px`; bar.style.transform = A === 1 ? '' : `scale(${A.toFixed(5)})`;
  bar.style.translate = lift ? `0 ${(-lift).toFixed(2)}px` : '';
  const plaqueBot = topPad + g * (top0 + A * (ASM.bottom - ASM.top));
  // 8: meter under the bar (stage units; its 50 % size is applied once, in CSS)
  // v0.49: the meter and Full House chip sit below the bar by the extra height the bar gains in the push-in (about the
  // grid's top), so the zoomed bar never covers them
  // v0.53 (item 9): the spins meter and the Full House chip sit just under the win bar and move with the push-in
  // (pushIn / pushOut translate them as the assembly grows about the grid's top), instead of leaving room for it
  ASM.pivot = topPad + g * top0; ASM.hudTop = plaqueBot + ASM.meterGap;
  stage.style.setProperty('--meter-top', `${ASM.hudTop.toFixed(1)}px`);
  // 6: spin row centred between the Buy / Extra row and the footer
  const row = $('.controls.nav26 .row-main'), spin = $('#spinBtn');
  if (row && spin && strip && spin.offsetWidth) {
    const cur = parseFloat(row.style.getPropertyValue('--lift')) || 0;
    const sr = spin.getBoundingClientRect(), cy = Y((sr.top + sr.bottom) / 2) + cur;
    const lf = cy - (buyBot + stripTop) / 2;
    row.style.setProperty('--lift', `${Math.max(0, lf).toFixed(1)}px`);
  }
  void wingW;
  window.__layout = { A: +A.toFixed(4), Abase: +Abase.toFixed(4), Afeat: +Afeat.toFixed(4), Ah: +Ah.toFixed(4), Acol: +Acol.toFixed(4), lift: +lift.toFixed(1),
    push: +ASM.push.toFixed(3), g: +g.toFixed(4), gap: +(buyTop - plaqueBot).toFixed(1), plaqueBottom: +plaqueBot.toFixed(1), buyTop: +buyTop.toFixed(1) };
  return { capped: ART_V2 && Abase < Ah - 1e-3, excess: buyTop - ASM.gapTarget - plaqueBot };
}
/** v0.53 wings (items 3 / 12): pillars at the screen edges, as tall as the side columns at rest minus a step of 9 % of
 *  that height at each end (the client's reference). Measured from the base layout only, so the bonus zoom never moves
 *  them. Stage units (the stage is the screen's width on phones). */
function layoutWings(A, g, topPad, lift, wingW) {
  const bar = document.querySelector('#v2frame .side-l'); if (!bar) return;
  if ($('#machine')?.style.transition) return;   // mid-zoom: measured again when the zoom has finished (featureZoom)
  const st = stage.getBoundingClientRect(), k = st.width / 720 || 1, r = bar.getBoundingClientRect();
  const top = (r.top - st.top) / k, h = r.height / k, step = 0.09 * h;
  // the stage may be wider than the window on very short screens: keep the wings on screen
  const visL = Math.max(0, -st.left / k), visR = Math.min(720, (innerWidth - st.left) / k);
  placeWings(buildWings(stage), { left: visL, right: visR, top: top + step, height: h - 2 * step, ws: MACHINE0.k });
  window.__wings = { top: +(top + step).toFixed(1), height: +(h - 2 * step).toFixed(1), width: +wingW.toFixed(1), colTop: +top.toFixed(1), colH: +h.toFixed(1) };
}
/** v0.50: how far the assembly moves up so the lintel sits just under the logo (game units; the logo's own box, at its
 *  largest point of the idle bob, so the two never touch). */
function logoLift() {
  const blk = $('.logo'), img = blk?.querySelector('.logo-img'); if (!img || !img.offsetHeight) return 0;
  const bottom = blk.offsetTop + img.offsetTop + img.offsetHeight * LOGO_SCALE_MAX;
  return Math.max(-30, Math.min(120, V2G.lintelTop - (bottom + 6)));
}
const LOGO_SCALE_MAX = 0.88 * 1.03;   // style.css: the logo at 88 %, bobbing up to 3 % larger
/** v0.50: Hold & Win camera: eases the assembly in to fill the hidden Buy row's space (in = true), or back out. */
async function featureZoom(on) {
  if (!ART_V2 || !!S.zoomIn === on) return;
  // v0.75 (client, 1 Nov: "use the same zoom as the last-coin push-in"): the camera move is now built like the push-in -
  // one compositor animation of the assembly's transform (and a translate for the HUD), from where it is to where the new
  // layout puts it. The layout is worked out ONCE before the move (fit), never during it, and nothing moves by `top`
  // (the v0.50 version re-ran the layout under CSS transitions, and the HUD's `top` transition re-laid the page every
  // frame - judder on a budget phone).
  const els = [$('#machine'), $('#asmBar'), $('#spinMeter'), $('#fhChip')].filter(Boolean);
  const ms = reducedMotion() ? 0 : on ? 720 : 560, EASE = 'cubic-bezier(.45,0,.55,1)';
  const before = els.map(el => ({ el, tf: el.style.transform || 'none', y: el.getBoundingClientRect().top }));
  S.zoomIn = on; fit();
  if (!ms) { if (!on) fit(); return; }
  const k = stage.getBoundingClientRect().height / stage.offsetHeight || 1, runs = [];
  for (const b of before) { const el = b.el;
    if (el.id === 'machine' || el.id === 'asmBar') { const to = el.style.transform || 'none'; if (to !== b.tf) runs.push(el.animate([{ transform: b.tf }, { transform: to }], { duration: ms, easing: EASE })); }
    else { const dy = (b.y - el.getBoundingClientRect().top) / k; if (Math.abs(dy) > 0.5) runs.push(el.animate([{ translate: `0px ${dy.toFixed(1)}px` }, { translate: '0px 0px' }], { duration: ms, easing: EASE, composite: 'add' })); } }
  await Promise.all(runs.map(a => a.finished.catch(() => {})));
  if (!on) fit();   // v0.53: the wings are re-measured at rest
}
/** game point (fx / cellRect space) -> the win-bar wrapper's own coordinates (it is scaled by ASM.A about its top centre) */
const toAsm = (x, y) => ({ x: 360 + (x - 360) / ASM.A, y: ASM.top + (y - (ASM.top - (ASM.lift || 0))) / ASM.A });
/** Device safe-area insets in CSS px (0 where the browser has none). */
function safeInsets() {
  let p = safeInsets.el;
  if (!p) { p = safeInsets.el = document.createElement('div'); p.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0'; document.body.append(p); }
  const cs = getComputedStyle(p); return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
}
window.visualViewport?.addEventListener('resize', () => fit());   // mobile browser chrome opening / closing
addEventListener('resize', fit);
document.addEventListener('fullscreenchange', () => setTimeout(fit, 80));   // v0.50: Android full screen
/** s5: jackpot columns — GRAND/MAJOR title tops level with the top of the logo's hat, outer frame edges level with the
 *  grid surround's outer edges (kept a few px on screen when a tall phone crops the surround). */
function placeJackpots() {
  if (WIDE.on) return placeJackpotsWide();
  const game = $('#game'), full = $('#frameArt .m-full') || (ART_V2 && $('#v2frame')), logo = $('.logo .logo-img');
  if (!game || !full || !logo) return;
  const gr = game.getBoundingClientRect(), k = gr.width / 720 || 1;
  const fr = full.getBoundingClientRect();
  // v0.27: jackpots stay exactly where they were (edges of the v0.26 surround, game units) — the new frame is narrower
  // v0.47 art v2: inset ~3% from each side, as in the approved layout (their end diamonds stay fully on screen)
  const gridL = -22.7, gridR = 742.78; void fr;   // v0.49: back at the screen edges, as v0.46
  // v0.55: iOS can report a too-small window width for a moment while the page settles (a colleague's iPhone showed the
  // right-hand plaques and the Super badge pulled in over the logo); take the widest width the browser reports, keep the
  // right column on its own side, and measure again whenever the layout changes
  const vw = Math.max(innerWidth, document.documentElement.clientWidth || 0, window.visualViewport?.width || 0);
  const visL = (0 - gr.left) / k + 6, visR = (vw - gr.left) / k - 6;
  const L = Math.min(Math.max(gridL, visL), 120), R = Math.max(Math.min(gridR, visR), 600);
  const hatTop = logo.closest('.logo').offsetTop + logo.offsetTop;   // the logo art's first opaque row (the hat) is its top edge; layout box ignores the bob
  const st = game.style; st.setProperty('--jp-left', `${L.toFixed(1)}px`); st.setProperty('--jp-right', `${(R - 200).toFixed(1)}px`);   // v0.33: 200-wide plaques
  st.setProperty('--jp-top', `${Math.max(0, Math.round(hatTop)) + 2}px`);
  requestAnimationFrame(() => candles.place());   // v0.52: the Super badge sits under MINI
}
addEventListener('resize', () => requestAnimationFrame(placeJackpots));
addEventListener('pageshow', () => { fit(); setTimeout(fit, 300); });   // v0.55: back/forward cache and tab restores on iOS
document.fonts?.ready.then(() => fit());

// ---------- HUD ----------
function updateHud() {
  $('#balance').textContent = fmt(S.balance);
  $('#bet').textContent = fmt(Math.round(bet() * S.cfg.modes[modeName()].costPct / 100));
  // in a bonus the skull can grow a plaque: the plaques show the live values until the bonus ends
  for (const el of document.querySelectorAll('.jackpots .jp')) el.querySelector('strong').textContent = fmt(buToMinor((S.jpLive ?? S.cfg.jackpotsBU)[el.dataset.jp]));
  candles.render(S.meterState);
  const buyStake = bet() * S.cfg.modes.buy.costPct / 100;
  $('#buyCost').textContent = fmt(buyStake);
  const locked = S.busy || S.auto.running;
  $('#buyBtn').disabled = locked || buyStake > S.cfg.buyMaxStake;
  $('#betDown').disabled = locked || S.betIdx === 0;
  $('#betUp').disabled = locked || S.betIdx === S.cfg.bets.length - 1;
  $('#extraBtn').disabled = locked;
  $('#extraBtn').setAttribute('aria-pressed', String(S.extra));
  $('#turboBtn').setAttribute('aria-pressed', String(S.turbo));
  const ab = $('#autoBtn');
  ab.classList.toggle('active', S.auto.running);
  $('#autoCount').textContent = S.auto.running ? (S.auto.remaining === Infinity ? '∞' : String(S.auto.remaining)) : '';
  const spin = $('#spinBtn');
  // v0.25: autoplay spins left are shown inside the spin button (Mayan style), not under the auto button
  const n = S.auto.running ? (S.auto.remaining === Infinity ? '∞' : String(S.auto.remaining)) : '';
  const sn = $('#spinN'); if (sn.textContent !== n) { sn.textContent = n; if (n) sn.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.3,1.6,.5,1)' }); }
  spin.classList.toggle('auto-on', S.auto.running);
  sn.style.fontSize = n.length >= 3 ? '40px' : '';
  spin.classList.toggle('busy', S.busy);
  candles.el?.classList.toggle('paused', !!S.busy);   // v0.52: the badge's fire pauses while a round plays
  spin.disabled = false; // while a round plays, spin = skip
  $('#soundBtn').classList.toggle('off', !S.sound);
}
function setWin(minor, bump = true) {
  S.roundWin = minor;
  $('#win').textContent = fmt(minor);
  if (bump) { const m = $('.meter.win'); m.classList.remove('bump'); void m.offsetWidth; m.classList.add('bump'); }
}
async function countWin(from, to, ms, onTick) {
  const t0 = performance.now(); let lastTick = 0, ticks = 0;
  return new Promise(res => {
    const step = now => {
      const p = S.skip ? 1 : Math.max(0, Math.min(1, (now - t0) / ms)); const v = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));   // v0.50: never below `from` (the first frame's time can precede t0)
      $('#win').textContent = fmt(v); onTick?.(v);
      if (now - lastTick > 140 && p < 1) { audio.play('countTick', { i: ticks++ % 8 }); lastTick = now; }
      if (p < 1) requestAnimationFrame(step); else { S.roundWin = to; res(); }
    };
    requestAnimationFrame(step);
  });
}
function msg(text, cls = '') {
  stopTicker(); const el = $('#msgText'); el.textContent = text; el.className = cls;
  $('#msgBar').classList.remove('ticking', 'plaque', 'pop'); fitMsg();
}
/** Glowing TOTAL WIN plaque under the reels. */
function plaque(text) {
  const bar = $('#msgBar'); const el = $('#msgText');
  const fresh = !bar.classList.contains('plaque'); stopTicker();
  bar.classList.remove('ticking'); el.className = 'win'; el.textContent = text; bar.classList.add('plaque'); fitMsg();
  if (fresh) { bar.classList.remove('pop'); void bar.offsetWidth; bar.classList.add('pop'); }
}
// v0.27: the message bar shows one centred line at a time (separate game text over the win-bar art), led by the
// approved "EVERY NEW COIN RESETS THE SPINS"; lines change every few seconds while the bar is idle.
let idleTimer = 0;
/** Shrink the message to fit the bar's dark panel (never wraps, never scrolls). */
function fitMsg() {
  const el = $('#msgText'), bar = $('#msgBar'); if (!el || !bar) return;
  // v0.40: the stylesheet sets the bar's type size with !important, so the fitted size must be important too
  el.style.removeProperty('font-size'); const room = bar.clientWidth - 12, w = el.scrollWidth;
  if (room > 0 && w > room) el.style.setProperty('font-size', `${(parseFloat(getComputedStyle(el).fontSize) * room / w).toFixed(1)}px`, 'important');
  capCentre(el);
}
/** v0.53 (item 16): the bar's messages are centred on their capitals (style.css: text-box trim to the cap height);
 *  nothing to do here any more, kept as the single place to adjust. */
function capCentre() {}
// v0.55 (client): two kinds of win-bar message. General information scrolls in quietly from the right and slowly across
// (the standing line, plus one-off notes queued by scrollNote); moments of excitement flash up as before (plaque).
// Wins replace the scroll; it comes back when the bar is idle and never restarts mid-pass between spins.
// v0.70 (checklist 12): the meter lines only when Super = Meter; with the random upgrade a line for that instead
const TICKERS = optVal('super') === 'meter'
  ? ['4 COINS TRIGGER HOLD & WIN BONUS', '3 COINS FILL THE SUPER BONUS METER', 'FILL THE METER TO TRIGGER SUPER BONUS', 'LOCO SPIN LANDS A FULL STACK OF WILDS']
  : ['4 COINS TRIGGER HOLD & WIN BONUS', 'ANY HOLD & WIN CAN BECOME A SUPER HOLD & WIN', 'LOCO SPIN LANDS A FULL STACK OF WILDS'];   // v0.56: one per pass, in turn (v0.62f: + Loco Spin line)
let tickI = 0; const TICKER = TICKERS[0], TICK_SPEED = 55, TICK_GAP = 1200;   // stage px per second; pause between passes
let tickAnim = null, tickWait = false; const tickQueue = [];
function stopTicker() { clearTimeout(idleTimer); tickWait = false; tickAnim?.cancel(); tickAnim = null;
  // v0.58 fix: a finished pass (fill: both) kept the text parked off the left edge, so a win or SPIN TO PLAY shown after it
  // was invisible; every scroll animation on the text is now cleared whenever the bar changes
  const t = $('#msgText'); if (!t) return; t.style.visibility = '';
  for (const a of t.getAnimations()) if (a.effect?.getKeyframes?.().some(k => k.transform)) a.cancel(); }
function idleTicker() {
  const bar = $('#msgBar'), el = $('#msgText');
  if (bar.classList.contains('ticking') && (tickAnim || tickWait)) return;   // already running: never restart mid-pass
  bar.classList.remove('plaque', 'pop'); bar.classList.add('ticking');
  stopTicker(); el.className = 'idle'; el.style.removeProperty('font-size');
  const run = () => {
    if (!bar.classList.contains('ticking')) return;
    el.textContent = tickQueue.shift() ?? TICKERS[tickI++ % TICKERS.length]; el.style.visibility = '';
    if (reducedMotion()) return;   // reduced motion: the line just sits centred
    const room = bar.offsetWidth, w = el.offsetWidth, d = (room + w) / 2 + 4;
    tickAnim = el.animate([{ transform: `translateX(${d}px)` }, { transform: `translateX(${-d}px)` }], { duration: (2 * d) / TICK_SPEED * 1000, easing: 'linear', fill: 'both' });
    tickAnim.onfinish = () => { tickAnim?.cancel(); tickAnim = null; tickWait = true; $('#msgText').style.visibility = 'hidden'; idleTimer = setTimeout(() => { tickWait = false; run(); }, TICK_GAP); };
  };
  run();
}
/** v0.56 (client): at the start of a session and back from a bonus the bar shows SPIN TO PLAY, still and centred; the
 *  scrolling line takes over when the next spin starts. */
let idleSoon = 0;
function idleLater(ms) { clearTimeout(idleSoon); idleSoon = setTimeout(() => { if (S.busy) return;
  const bar = $('#msgBar'), t = $('#msgText').textContent;   // a one-off note mid-pass finishes first
  if (bar.classList.contains('ticking') && tickAnim && !TICKERS.includes(t)) return idleLater(600);
  spinToPlay(); }, ms); }
function spinToPlay() {
  stopTicker(); const bar = $('#msgBar'), el = $('#msgText'); bar.classList.remove('ticking', 'plaque', 'pop');
  el.className = 'idle start'; el.textContent = 'SPIN TO PLAY'; el.style.removeProperty('font-size'); fitMsg();
}
/** General information: scrolls across once, then the standing line returns. */
function scrollNote(text) {
  if (!tickQueue.includes(text)) tickQueue.push(text);
  const bar = $('#msgBar');
  if (bar.classList.contains('plaque')) return;   // a flashed message or win is up: the note follows when the bar is idle
  // the standing line gives way at once; a note already passing finishes first
  if (!bar.classList.contains('ticking') || tickWait || TICKERS.includes($('#msgText').textContent)) { stopTicker(); idleTicker(); }
}
function flash(ms = 500) {
  const f = document.createElement('div'); f.className = 'flash'; stage.append(f);
  f.animate([{ opacity: 0 }, { opacity: 1, offset: .25 }, { opacity: 0 }], { duration: ms, easing: 'ease-out' }).finished.then(() => f.remove()).catch(() => {});
}

// ---------- v0.23 bonus atmosphere: light, ambient movement, impact (presentation only) ----------
/** Built once: soft frame glow, light sweep and twinkling glints (in the machine), golden haze + embers (backdrop).
 *  All of it is hidden in the base game and fades in with body.feature-mode. */
function bonusLayers(fa, surroundUrl) {
  fa.insertAdjacentHTML('afterbegin', '<div class="m-aura"></div>');
  if (!surroundUrl) {   // v0.47 art v2: keep the bonus haze, embers and beams; the light sweep and glints follow the old frame's shape
    $('#board').insertBefore(Object.assign(document.createElement('div'), { id: 'beams' }), $('#fx'));
    const bd = $('#backdrop'); bd.insertAdjacentHTML('beforeend', '<div class="haze"></div><div class="embers"></div>');
    const em = bd.querySelector('.embers');
    for (let i = 0; i < 30; i++) { const e = document.createElement('i');
      e.style.cssText = `left:${(Math.random() * 100).toFixed(1)}%;--d:${(5 + Math.random() * 6).toFixed(1)}s;--dl:${(-Math.random() * 12).toFixed(1)}s;--s:${(4 + Math.random() * 7).toFixed(1)}px;--dx:${(Math.random() * 80 - 40).toFixed(0)}px`; em.append(e); }
    return;
  }
  const sw = document.createElement('div'); sw.className = 'm-sweep';
  sw.style.webkitMaskImage = sw.style.maskImage = `url(${surroundUrl})`;
  sw.innerHTML = '<i></i>'; fa.append(sw);
  // v0.23b: twinkling glints that catch the light along the gold frame (machine coordinates, on the bars and posts)
  // v0.29 frame: glints on the bars, given in game units and converted to machine units
  const G = [[35.8, 332.8], [684.2, 332.8], [360, 244], [252.3, 300], [467.7, 300], [252.3, 620], [467.7, 760], [150, 994.4], [570, 994.4], [35.8, 640], [684.2, 700], [35.8, 1060.4], [684.2, 1060.4], [150, 900.6]]
    .map(([x, y]) => [(x - 360) / MACHINE0.k + MACHINE0.ox, (y - MACHINE0.dy) / MACHINE0.k]);
  fa.insertAdjacentHTML('beforeend', G.map(([x, y], i) => `<i class="glint" style="left:${x}px;top:${y}px;--gd:${(2.6 + (i * 0.37) % 1.6).toFixed(2)}s;--gl:${(-(i * 0.71) % 3).toFixed(2)}s"></i>`).join(''));
  $('#board').insertBefore(Object.assign(document.createElement('div'), { id: 'beams' }), $('#fx'));
  const bd = $('#backdrop');
  bd.insertAdjacentHTML('beforeend', '<div class="haze"></div><div class="embers"></div>');
  const em = bd.querySelector('.embers');
  for (let i = 0; i < 30; i++) {
    const e = document.createElement('i');
    e.style.cssText = `left:${(Math.random() * 100).toFixed(1)}%;--d:${(5 + Math.random() * 6).toFixed(1)}s;--dl:${(-Math.random() * 12).toFixed(1)}s;--s:${(4 + Math.random() * 7).toFixed(1)}px;--dx:${(Math.random() * 80 - 40).toFixed(0)}px`;
    em.append(e);
  }
}
/** A coin lands in the bonus: the board kicks and a shaft of light shoots up the column. Jackpots hit harder. */
function landImpact(cell, coin) {
  const big = !!coin?.jp;
  // v0.35: the landing kick moves the reel assembly only (logo, jackpots, meter and background stay still)
  if (!reducedMotion()) for (const el of [$('#board'), $('#asmBar')]) el?.animate([{ translate: '0 0' }, { translate: `0 ${big ? 10 : 4}px`, offset: .3 }, { translate: `0 ${big ? -4 : -1.5}px`, offset: .65 }, { translate: '0 0' }], { duration: big ? 340 : 240, easing: 'cubic-bezier(.25,.6,.35,1)', composite: 'add' });
  const [r] = cellPos(cell); const top = cellRect([0, 3, 7][r]), bot = cellRect([2, 6, 9][r]); const rc = cellRect(cell);
  const b = document.createElement('i'); b.className = `beam${big ? ' big' : ''}`;
  Object.assign(b.style, { left: `${top.x - 10}px`, top: `${top.y - 30}px`, width: `${top.w + 20}px`, height: `${bot.y + bot.h - top.y + 60}px`, transformOrigin: `50% ${rc.cy - top.y + 30}px` });
  $('#beams').append(b); setTimeout(() => b.remove(), 700);
  if (big) flash(260);
}
/** Down to the last one or two positions: the camera pushes in on them, and eases back out after the spin. */
let pushAnim = null;
/** v0.75 (client, 1 Nov): the base game's one-coin-short tease uses the SAME camera as the bonus's last-square tease - the
 *  smooth build-up push ('build') to the bonus's depth (capped so the outer reels stay on screen), and the background
 *  dims with a cheap shade layer instead of a brightness filter over the whole backdrop (which phones redraw every frame). */
function teasePush(ms) { const P = Math.max(1, Math.min(PRES.zoomOne, ASM.pcol || 1.09, WIDE.on ? 1.04 : 9)); pushIn([], ms, P / (ASM.push || 1.09), 'build'); }
function pushIn(cells, ms = 750, deeper = 1, smooth = false) {
  // v0.49: the push-in zooms the whole reel assembly - board (grid, surround, coins, effects) and win bar (art, text,
  // HUD, effects) - together about the grid's top centre, so it grows downwards: the logo never covers the top row and
  // the bar's text keeps its place in the bar. `cells` (the last empty positions) no longer moves the pivot.
  // v0.53 (item 22): the push builds slowly through the whole tense respin (ms), from wherever the camera is, and
  // peaks as the last position resolves.
  void cells;
  // v0.54 (client): a fast lunge (about 60 % of the push in the first ~250 ms), then a slow crawl to the peak as the
  // last position resolves; pushHit() adds a small punch when a coin lands there
  const P = Math.min(WIDE.on ? 1.04 : 9, (ASM.push || 1.09) * deeper) /* v0.72 wide: at most 4%, the top squares stay clear of the logo */, lunge = Math.min(0.45, 260 / Math.max(260, ms));   // v0.62l: deeper for the super tease
  const opt = { duration: ms, fill: 'forwards' };
  const prev = pushAnim || []; pushAnim = [];
  const kf = (from, to) => { const f = parseFloat(from) || 1, mid = f + (to - f) * 0.6;
    if (smooth === true) return [{ scale: String(f), easing: 'cubic-bezier(.45,0,.55,1)' }, { scale: String(to) }];   // v0.62l: one smooth push (super tease)
    if (smooth === 'build') return [{ scale: String(f), easing: 'cubic-bezier(.3,.55,.35,1)' }, { scale: String(to) }];   // v0.67 (checklist 8): brisk start, slow creep to the peak, no lunge
    return [{ scale: String(f), easing: 'cubic-bezier(.2,.75,.35,1)' }, { scale: mid.toFixed(4), offset: lunge, easing: 'cubic-bezier(.3,.1,.6,1)' }, { scale: String(to) }]; };
  for (const el of [$('#board'), $('#asmBar')]) { if (!el) continue;
    const cur = getComputedStyle(el).scale; const from = cur && cur !== 'none' ? cur : '1';
    if (el.id === 'board') el.style.transformOrigin = WIDE.on ? `360px ${(V2G.winBottom - (ASM.lift || 0)).toFixed(1)}px` : `360px ${ASM.top}px`;   // #asmBar already scales about this point (its lift is a separate translate); v0.72 wide: about the bar's bottom, so the bar never slides under the strip
    pushAnim.push(el.animate(kf(from, P), opt)); }
  pushAnim.push(...hudFollow(P, { ...opt, easing: 'cubic-bezier(.15,.8,.3,1)' }));
  prev.forEach(a => a.cancel());
}
/** v0.53: after a tense respin the camera eases back only part of the way (the next tense respin builds again from
 *  there); full = all the way out (feature end / collect). */
function pushOut(full = false, ms = 0) {   // v0.67: optional duration (the last-holes deflate)
  if (!pushAnim) return;
  // v0.75b (client, 1 Nov: the jump as the camera comes back after the last coin of a buy): the landing punch (pushHit) is
  // an extra scale ADDED on top; reading the current scale while it played and then letting it carry on doubled it for a
  // moment. It is folded into the start value and stopped.
  hitAnims.forEach(a => a.cancel()); hitAnims = [];
  const P = ASM.push || 1.09, to = full ? 1 : 1 + (P - 1) * 0.35, prev = pushAnim; pushAnim = full ? null : [];
  for (const el of [$('#board'), $('#asmBar')]) { if (!el) continue;
    const cur = getComputedStyle(el).scale; const from = cur && cur !== 'none' ? cur : String(P);
    const a = el.animate([{ scale: from }, { scale: String(to) }], { duration: ms || (full ? 420 : 520), easing: ms ? 'cubic-bezier(.25,.8,.35,1)' : 'ease-in-out', fill: full ? 'none' : 'forwards' });
    if (!full) pushAnim.push(a); }
  const h = hudFollow(to, { duration: ms || (full ? 420 : 520), easing: ms ? 'cubic-bezier(.25,.8,.35,1)' : 'ease-in-out', fill: full ? 'none' : 'forwards' }); if (!full) pushAnim.push(...h);
  prev.forEach(a => a.cancel());
}
/** v0.54: the last position filled during a tense respin: a small extra punch-in (2 %) and back */
/** v0.75b (client, 1 Nov): after the tease's last coin lands (bought or natural), the camera comes back exactly like the
 *  bonus's last-square reset - a short hold, then the slow deflate - and the bonus entry waits for it, so nothing else
 *  (new coins, the reel drop) is built while it moves. */
async function deflateAfterTease() { if (!S.deflate) return; S.deflate = false; await wait(PRES.zoomHold); pushOut(true, PRES.zoomOut); await wait(PRES.zoomOut + 40); }
let hitAnims = [];
function pushHit() {
  hitAnims = [];
  for (const el of [$('#board'), $('#asmBar')]) if (el) hitAnims.push(el.animate([{ scale: '1' }, { scale: WIDE.on ? '1.01' : '1.02', offset: .35 }, { scale: '1' }], { duration: 380, easing: 'cubic-bezier(.3,1.4,.5,1)', composite: 'accumulate' }));
}
/** the HUD under the bar follows the assembly's push (a point at y moves to pivot + (y - pivot) * scale) */
function hudFollow(scale, opt) {
  if (WIDE.on) return [];   // v0.72: in the wide layout the counter and the chip stay put (they are not under the bar)
  const dy = ((ASM.hudTop ?? 0) - (ASM.pivot ?? 0)) * (scale - 1), out = [];
  for (const el of [$('#spinMeter'), $('#fhChip')]) { if (!el) continue;
    const cur = getComputedStyle(el).translate; const from = cur && cur !== 'none' ? cur : '0px 0px';
    out.push(el.animate([{ translate: from }, { translate: `0px ${dy.toFixed(1)}px` }], opt)); }
  return out;
}

// ---------- logo skull: eats coins in the base game, spits Coin Rescue coins ----------
// Logo block geometry in machine coordinates (see .logo in style.css); skull box measured from the art.
const LOGO = { x: 190, y: 0, w: 340, h: 340 * 713 / 1000 };   // v0.20: smaller, sits over the frame's crown
// v1: the logo's own skull cut out and split horizontally. v2 (v0.21): three drawn jaw frames (closed / half / wide open),
// registered over the logo's skull (rotated 6.25° to match its tilt); box is taller so the dropped jaw fits. mx/my = mouth.
const SKULL_V1 = { l: 0.281, t: 0.4867, w: 0.261, h: 0.4011, mx: 0.5, my: 0.62 };
const SKULL_V2 = { l: 0.26, t: 0.4670, w: 0.306, h: 0.4853, mx: 0.564, my: 0.734 };
// v0.25: 4 drawn frames (closed / slightly open / wide / shouting), registered over the logo skull (5.25° tilt)
const SKULL_V3 = { l: 0.268, t: 0.4698, w: 0.288, h: 0.4923, mx: 0.55, my: 0.71 };   // v0.62f: my 0.669 -> 0.71, the middle of his open mouth (was on his upper teeth)
let SKULL = SKULL_V1;
// v0.49: measured from the skull overlay itself, so effects stay on the mouth whatever the logo's size (it is drawn at
// 88 % in v0.49 so it clears the jackpot plaques); falls back to the fixed geometry before the logo is built
const skullXY = () => { const sk = skullEl(), g = $('#game');
  if (sk && g && sk.offsetWidth) { const gr = g.getBoundingClientRect(), kk = gr.width / 720, r = sk.getBoundingClientRect();
    return { x: (r.left - gr.left + r.width * SKULL.mx) / kk, y: (r.top - gr.top + r.height * SKULL.my) / kk }; }
  return { x: LOGO.x + LOGO.w * (SKULL.l + SKULL.w * SKULL.mx), y: LOGO.y + LOGO.h * (SKULL.t + SKULL.h * SKULL.my) }; };
/** v0.62c: a screen point in an FX canvas's own logical coordinates (the board canvas zooms with the board in the bonus). */
function toFx(f, sx, sy) { const cr = f.c.getBoundingClientRect(); return { x: (sx - cr.left) * f.LW / cr.width, y: (sy - cr.top) * f.LH / cr.height }; }
/** v0.62c (client): every swoosh leaves from / arrives at the skull's MOUTH, in the coordinates of the canvas drawing it. */
function mouthIn(f) { const sk = skullEl();
  if (!sk || !sk.offsetWidth) { const k = skullXY(); const g = $('#game').getBoundingClientRect(), kk = g.width / 720; return toFx(f, g.left + k.x * kk, g.top + k.y * kk); }
  const r = sk.getBoundingClientRect(); return toFx(f, r.left + r.width * SKULL.mx, r.top + r.height * SKULL.my); }
/** v0.62f: a point in the board canvas (fx, zooms with the board) in the top canvas's coordinates (fxTop, never zoomed). */
function topPt(x, y) { const cr = fx.c.getBoundingClientRect(); return toFx(fxTop, cr.left + x * cr.width / fx.LW, cr.top + y * cr.height / fx.LH); }
/** v0.72: a burst on a HUD element (lives counter, Full House chip), drawn on the top layer - in the wide layout these sit
 *  outside the board's canvas. `to` is in board (fx) coordinates. */
function hudBurst(to, o) { const t = topPt(to.x, to.y); fxTop.burst(t.x, t.y, o);
  if (window.__fxLog) { const cr = fxTop.c.getBoundingClientRect(); window.__fxLog.push({ x: cr.left + t.x * cr.width / fxTop.LW, y: cr.top + t.y * cr.height / fxTop.LH }); } }   // QA: where it landed on screen
function fxPoint(f, el) { const r = el.getBoundingClientRect(); return toFx(f, r.left + r.width / 2, r.top + r.height / 2); }
function skullEl() { return document.querySelector('.logo .lskull'); }
/** Jaw pose: 0 closed, 1 slightly open, 2 wide open, 3 shouting (v3 art; older art tops out at 2). */
let JAW_MAX = 2;
function jaw(n, sk = skullEl()) { if (!sk) return; n = Math.min(n, JAW_MAX); sk.dataset.j = n; sk.classList.toggle('open', n >= 2); }
const jawLater = (n, ms) => setTimeout(() => jaw(n), ms);
/** Chomp: the skull bulges and snaps its jaw shut as a coin arrives. */
function skullChomp(big = false) {
  const sk = skullEl(); if (!sk) return;
  sk.classList.remove('chomp'); void sk.offsetWidth; sk.classList.add('chomp');
  jaw(3, sk); jawLater(0, 45); jawLater(2, 130); jawLater(0, 170);   // v0.25: gape, hard snap shut, quick second bite
  sk.animate([{ transform: 'scale(1)' }, { transform: `scale(${big ? 1.55 : 1.38}) rotate(-5deg)`, offset: .35 }, { transform: 'scale(.96) rotate(2deg)', offset: .7 }, { transform: 'none' }], { duration: 360, easing: 'ease-out' });
}
/** v0.21 skull fills up: every coin he eats in the base game makes him fuller — eyes glow, gold creeps up the bone,
 *  cheeks puff, then fully gilded. Purely cosmetic; it pays nothing and empties when Hold & Respin triggers. */
const SKULL_FULL = 8;
function setSkullFill(n) {
  S.skullFill = n; const sk = skullEl(); if (!sk) return;
  const f = Math.min(1, n / SKULL_FULL);
  sk.style.setProperty('--f', f.toFixed(3));
  // v0.55 (client): no visible fill stages any more (glow, sparkle, swell removed); the count is kept for the logic
}
/** v0.25 bonus trigger: the skull can't contain himself — mouth flapping open and shut, bouncing, with a shout. */
function skullCheer(ms = 1500) {
  const sk = skullEl(); if (!sk) return;
  audio.play('cheer');
  let n = 0; const t0 = performance.now();
  (function flap() { if (performance.now() - t0 > ms) { jaw(0); return; } jaw(n++ % 2 ? 1 : 3); setTimeout(flap, n % 2 ? 110 : 85); })();
  $('.logo').animate([{ translate: '0 0', rotate: '0deg' }, { translate: '0 -10px', rotate: '-3deg', offset: .15 }, { translate: '0 2px', rotate: '2deg', offset: .3 },
    { translate: '0 -8px', rotate: '-2deg', offset: .45 }, { translate: '0 2px', rotate: '2deg', offset: .6 }, { translate: '0 -5px', rotate: '-1deg', offset: .75 }, { translate: '0 0', rotate: '0deg' }], { duration: ms, easing: 'ease-in-out' });
}
async function skullRelease() {
  if (!S.skullFill) return;
  const sk = skullEl(); const k = mouthIn(fxTop); const n = S.skullFill;
  sk?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35) rotate(-4deg)', offset: .3 }, { transform: 'scale(.92) rotate(2deg)', offset: .65 }, { transform: 'none' }], { duration: 520, easing: 'ease-out' });
  fxTop.burst(k.x, k.y, { count: 30 + n * 6, speed: 10 + Math.min(6, n), size: 7, colors: ['#ffd35a', '#fff4b8', '#ffb21f'] });
  setSkullFill(0);
}
/**
 * Brief s05A: one coordinated collection per base spin. Once the reels have settled, every landed coin flashes and sends
 * its gold ribbon up into the logo together; the skull takes them in one bite with ONE collection sound (no per-coin
 * stacking). All coin movements are kept. The coins stay on the reels.
 */
async function coinsToSkull(cells) {
  if (!cells.length) return;
  const k = mouthIn(fxTop);   // v0.62f: into his mouth on the top layer (seen all the way in)
  for (const cell of cells) {
    const cellEl = reels.cellEl(cell); const el = cellEl?.querySelector('.sym-svg');
    hiFlash(el, [1, 1.9, 1], T(380));   // checklist 4 item 7: composited flash, not a per-frame filter repaint
    if (cellEl) { const sh = document.createElement('i'); sh.className = 'coin-shine'; cellEl.append(sh); setTimeout(() => sh.remove(), 700); }
  }
  await wait(T(230));
  const fly = T(440), stag = T(45);
  const last = fly + stag * (cells.length - 1);
  jawLater(1, Math.max(0, last - 170)); jawLater(2, Math.max(0, last - 115)); jawLater(3, Math.max(0, last - 60));   // mouth opens as they close in
  await Promise.all(cells.map((cell, i) => wait(i * stag).then(() => { const rc = cellRect(cell);
    const a0 = topPt(rc.cx, rc.cy - 10); return fxTop.ribbon(a0.x, a0.y, k.x, k.y, { ms: fly, bend: -150, width: 12 }); })));
  skullFlare();
  skullChomp(cells.length > 1); audio.play('eat');
  setSkullFill((S.skullFill || 0) + cells.length);
}
/** The collector flares as a coin arrives. */
function skullFlare() {
  const logo = document.querySelector('.logo'); if (!logo) return;
  logo.classList.remove('flare'); void logo.offsetWidth; logo.classList.add('flare'); setTimeout(() => logo.classList.remove('flare'), 420);
}
/**
 * Brief s09A: ONE logo activation for every valuable release (initial multipliers, later multipliers, Coin Save in the
 * base game and the bonus). The whole logo + skull shakes as a group: a noticeable aggressive start, then movement
 * frequency and rotational wobble climb to a crescendo, the head pops out and fires; after the releases a short recoil
 * and a smooth return. Reduced motion: a restrained glow instead of the shake. Resolves at the crescendo with
 * { release(x, y), fizzle(), done() }.
 */
async function logoActivate({ build = PRES.logoBuild } = {}) {
  const logo = $('.logo'), sk = skullEl(), rm = reducedMotion();
  logo.classList.add('charging');
  const riser = audio.play('rescueBuild');
  logo.getAnimations().forEach(x => x.cancel());
  let shake = null;
  if (!rm) {
    const N = 48, kf = [];
    for (let i = 0; i <= N; i++) {
      const p = 1 - Math.pow(1 - i / N, 1.75);          // keyframes bunch up towards the end: the shake gets faster
      const amp = 3.5 + 10.5 * Math.pow(p, 1.25), sg = i % 2 ? 1 : -1, j = 0.7 + Math.random() * 0.3;
      kf.push({ offset: p, translate: `${(sg * amp * j).toFixed(1)}px ${((Math.random() * 2 - 1) * amp * 0.45).toFixed(1)}px`, rotate: `${(sg * (0.8 + 3.6 * p) * j).toFixed(2)}deg` });
    }
    kf[0] = { offset: 0, translate: '0px 0px', rotate: '0deg' };
    shake = logo.animate(kf, { duration: build, easing: 'linear', fill: 'forwards' });
  } else logo.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.45) drop-shadow(0 0 26px #ffd35a)' }], { duration: build, fill: 'forwards' });
  sk?.getAnimations().forEach(x => x.cancel());
  sk?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1) rotate(-3deg)', offset: .4 }, { transform: 'scale(1.16) rotate(3deg)', offset: .75 }, { transform: 'scale(1.24)' }], { duration: build, easing: 'ease-in', fill: 'forwards' });
  let alive = true, chat = 0; const t0 = performance.now();
  (function chatter() { if (!alive) return; jaw(++chat % 2); setTimeout(chatter, Math.max(45, 160 - (performance.now() - t0) / build * 115)); })();
  await sw(build);   // v0.62e: a tap cuts the build-up short
  alive = false; riser?.stop(0.1);
  jaw(3);   // crescendo: the head pops out
  sk?.animate([{ transform: 'scale(1.24)' }, { transform: 'scale(1.8) translateY(6px)' }], { duration: 160, easing: 'cubic-bezier(.3,1.6,.5,1)', fill: 'forwards' });
  const recoil = (ms = PRES.logoRecoil) => {
    shake?.cancel(); logo.getAnimations().forEach(x => x.cancel());
    if (!rm) logo.animate([{ translate: '0 -9px', rotate: '-2deg' }, { translate: '0 4px', rotate: '1.2deg', offset: .45 }, { translate: '0 -1px', rotate: '-.3deg', offset: .75 }, { translate: '0 0', rotate: '0deg' }], { duration: ms, easing: 'ease-out' });
    logo.classList.remove('charging');
  };
  return {
    /** Fire one award from the mouth to (x, y). Resolves on arrival. */
    release(x, y, { ms = 480, bend = -120, top = false, quiet = false } = {}) {
      if (!quiet) audio.play('fireball'); jaw(1); jawLater(3, 70);
      if (top) {   // v0.55: to a jackpot plaque - on the top layer (never shifted by the board's zoom), dropping out of the mouth first
        sk?.animate([{ transform: 'scale(1.8) translateY(6px)' }, { transform: 'scale(1.95) translateY(12px)' }, { transform: 'scale(1.8) translateY(6px)' }], { duration: 200, fill: 'forwards' });   // v0.62f: stays popped out between shots
        const k = mouthIn(fxTop);
        fxTop.burst(k.x, k.y, { count: 14, speed: 4, size: 4, colors: ['#ffd35a', '#fff4b8', '#ff7a1a'] });
        return fxTop.ribbon(k.x, k.y, x, y, { ms, bend, width: 16, glow: '#ff7a1a' });
      }
      sk?.animate([{ transform: 'scale(1.8) translateY(6px)' }, { transform: 'scale(1.95) translateY(12px)' }, { transform: 'scale(1.8) translateY(6px)' }], { duration: 200, fill: 'forwards' });   // v0.62f: stays popped out between shots
      // v0.62f (client): drawn on the top layer, above the logo, so the whole swoosh is seen leaving his mouth (on the
      // board layer its start was hidden behind the logo and it seemed to come out of the logo's side)
      const k = mouthIn(fxTop), t = topPt(x, y);
      return fxTop.ribbon(k.x, k.y, t.x, t.y, { ms, bend, width: 16, glow: '#ff7a1a' });
    },
    /** Cosmetic fail tease (server-decided): strains, coughs smoke, fizzles. Nothing is awarded. */
    async fizzle() {
      const k = mouthIn(fxTop); audio.play('rescueFail');
      if (S.skip) {   // v0.62e (client): skipped - a quick puff that still says the Coin Save failed, under half a second
        sk?.animate([{ transform: 'scale(1.8) translateY(6px)' }, { transform: 'none' }], { duration: 300, easing: 'ease-out', fill: 'forwards' }).finished.then(() => sk.getAnimations().forEach(x => x.cancel())).catch(() => {});
        fxTop.smoke(k.x, k.y + 10, { count: 18, big: 1.1, linger: 0.8 }); recoil(300); jaw(1); jawLater(0, 90); await wait(420); return;
      }
      sk?.animate([{ transform: 'scale(1.8) translateY(6px)' }, { transform: 'scale(1.42) rotate(-4deg)', offset: .3 }, { transform: 'scale(.9) rotate(3deg)', offset: .65 }, { transform: 'none' }], { duration: 900, easing: 'ease-out', fill: 'forwards' })
        .finished.then(() => sk.getAnimations().forEach(x => x.cancel())).catch(() => {});
      // v0.55: a bigger, denser cloud that lingers longer, on its own layer; then a beat so it reads before anything moves on
      fxTop.smoke(k.x, k.y + 10, { count: 34, big: 1.3, linger: 1.6 }); setTimeout(() => fxTop.smoke(k.x + 6, k.y - 6, { count: 16, spread: .8, big: 1.2, linger: 1.6 }), 160);
      setTimeout(() => fxTop.smoke(k.x - 8, k.y + 4, { count: 10, spread: .6, big: 1.1, linger: 1.5 }), 340);
      recoil(600); await wait(380); jaw(1); jawLater(0, 90); await wait(1100);
    },
    /** Smoke-only tease: a small puff and a quick settle (shorter and quieter than the Coin Save fizzle). */
    async puff() {
      const k = mouthIn(fxTop);
      if (S.skip) { recoil(200); sk?.getAnimations().forEach(x => x.cancel()); jaw(0); return; }   // v0.62e: tapped - no smoke (nothing is awarded)
      sk?.animate([{ transform: 'scale(1.8) translateY(6px)' }, { transform: 'scale(1.2) rotate(-3deg)', offset: .4 }, { transform: 'none' }], { duration: 520, easing: 'ease-out', fill: 'forwards' })
        .finished.then(() => sk.getAnimations().forEach(x => x.cancel())).catch(() => {});
      fxTop.smoke(k.x, k.y + 8, { count: 10, spread: .6 }); audio.play('poof');
      recoil(420); await wait(160); jaw(1); jawLater(0, 90); await wait(360);
    },
    /** After the releases: brief recoil and a smooth return to the resting logo. */
    async done() {
      jaw(1); jawLater(0, 80); recoil();
      sk?.animate([{ transform: 'scale(1.8) translateY(6px)' }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'forwards' }).finished.then(() => sk.getAnimations().forEach(x => x.cancel())).catch(() => {});
      await wait(PRES.logoRecoil);
    },
  };
}
/** s09B Coin Save (base game: exactly 3 coins). Logo activation, then each awarded coin is fired onto its position. */
async function skullSpit(targets, place, { fail = false, say = () => {} } = {}) {
  // v0.52 (client): a longer shake before the smoke or the coins (same length either way, so it never gives the result away)
  const act = await logoActivate({ build: Math.max(PRES.saveBuildMin, T(PRES.saveBuild)) });
  if (fail) { await act.fizzle(); return; }
  audio.play('rescue'); say('COIN SAVE!');
  for (const t of targets) {
    const rc = cellRect(t.cell);
    await act.release(rc.cx, rc.cy, { ms: T(480) });
    place(t); audio.play('coinLand', { i: 6 });
    fx.burst(rc.cx, rc.cy, { count: 26, speed: 8, colors: ['#ffd35a', '#fff4b8', '#ffb21f'] });
    await wait(T(PRES.releaseGap));
  }
  await act.done();
}

async function banner(kicker, title, sub = '', ms = 1400, cls = '') {
  const b = $('#banner');
  b.className = `banner ${cls}`; b.querySelector('.b-kicker').textContent = kicker; b.querySelector('.b-title').textContent = title; b.querySelector('.b-sub').textContent = sub;
  b.classList.add('show'); audio.play('bannerIn'); await wait(T(ms));
  b.classList.replace('show', 'hide'); await wait(300); b.className = 'banner hidden';
}
function toast(text) { const t = $('#toast'); t.textContent = text; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2600); }
/** v0.70 (checklist 10): the amount appears over the grid (Gold / Plaque / Burst), holds, then swooshes into the win bar,
 *  shrinking to the bar's text size; the bar takes the amount as it lands. Only transform and opacity animate. */
async function winPop(winMinor) {
  const style = optVal('wpstyle') || 'gold', board = $('#board');
  plaque('');   // the bar waits, empty, for the amount to land
  const a = cellRect(4), b = cellRect(5), cx = (a.cx + b.cx) / 2, cy = (a.cy + b.cy) / 2 - a.h * 0.35;
  const bar = $('#msgBar'), to = bar ? fxPoint(fx, bar) : { x: cx, y: cy + 600 };
  const el = document.createElement('div'); el.className = `winpop wp-${style}`;
  el.innerHTML = `<b>${fmt(winMinor)}</b>`;
  el.style.left = `${cx}px`; el.style.top = `${cy}px`; el.style.fontSize = `${Math.round(a.h * 0.6)}px`;
  board.append(el);
  const maxW = (cellRect(7).x + cellRect(7).w - cellRect(0).x) * 0.85, w = el.offsetWidth;
  const fit = w > maxW ? maxW / w : 1;   // long amounts shrink to fit the grid
  const barFont = parseFloat(getComputedStyle($('#msgText')).fontSize) || 40, endScale = Math.min(1, barFont / (a.h * 0.6)) * 1.05;
  const reels = $('#reels'), dim = style === 'plaque' ? 1 : style === 'burst' ? .9 : .85;
  if (dim < 1) reels?.animate([{ opacity: 1 }, { opacity: dim }], { duration: T(150), fill: 'forwards' });
  const SLOW = window.__wpSlow || 1, tIn = T(150) * SLOW, tHold = T(350) * SLOW, tOut = T(250) * SLOW;   // __wpSlow: QA only
  const pop = style === 'burst' ? [{ transform: `translate(-50%,-50%) scale(${.4 * fit})`, opacity: 0 }, { transform: `translate(-50%,-50%) scale(${1.18 * fit})`, opacity: 1, offset: .7 }, { transform: `translate(-50%,-50%) scale(${fit})`, opacity: 1 }]
    : [{ transform: `translate(-50%,-50%) scale(${.6 * fit})`, opacity: 0 }, { transform: `translate(-50%,-50%) scale(${fit})`, opacity: 1 }];
  audio.play('coinLand', { i: 3 });
  if (style === 'burst') fx.burst(cx, cy, { count: 36, speed: 9, size: 6, colors: ['#ffd35a', '#fff4b8', '#ff9a1f'] });
  await el.animate(pop, { duration: tIn, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'forwards' }).finished.catch(() => {});
  await sw(tHold);
  const dx = to.x - cx, dy = to.y - cy;
  const path = style === 'burst'
    ? [{ transform: `translate(-50%,-50%) scale(${fit})`, opacity: 1 }, { transform: `translate(calc(-50% + ${dx * .35}px), calc(-50% + ${dy * .2 - 60}px)) scale(${fit * .8})`, opacity: 1, offset: .4 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${endScale})`, opacity: .9 }]
    : [{ transform: `translate(-50%,-50%) scale(${fit})`, opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${endScale}, ${endScale * (style === 'gold' ? .85 : 1)})`, opacity: .9 }];
  if (style === 'burst') { const trail = setInterval(() => { const m = new DOMMatrix(getComputedStyle(el).transform); fx.burst(cx + m.e, cy + m.f, { count: 3, speed: 2, size: 4, colors: ['#ffd35a', '#fff4b8'] }); }, 50); setTimeout(() => clearInterval(trail), tOut); }
  if (dim < 1) reels?.animate([{ opacity: dim }, { opacity: 1 }], { duration: tOut, fill: 'forwards' }).finished.then(() => reels.getAnimations().forEach(x => x.cancel())).catch(() => {});
  await el.animate(path, { duration: tOut, easing: 'cubic-bezier(.5,0,.75,.6)', fill: 'forwards' }).finished.catch(() => {});
  el.remove();
  plaque(fmt(winMinor)); fitMsg?.();
  if (style === 'plaque' && bar) bar.animate([{ scale: '1' }, { scale: '1.06', offset: .35 }, { scale: '1' }], { duration: 320, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  if (style === 'burst') fx.burst(to.x, to.y, { count: 26, speed: 7, size: 5, colors: ['#ffd35a', '#fff4b8', '#ff9a1f'] });
}
function floatText(text, x, y, { dy = -90, ms = 900, size } = {}) {
  const el = document.createElement('div'); el.className = 'float-val'; el.textContent = text;
  Object.assign(el.style, { left: `${x}px`, top: `${y}px` }); if (size) el.style.fontSize = `${size}px`;
  $('#board').append(el);
  el.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: .25 }, { transform: `translate(-50%,calc(-50% + ${dy}px)) scale(1)`, opacity: 0 }], { duration: T(ms), easing: 'ease-out' })
    .finished.then(() => el.remove()).catch(() => {});
}

// ---------- v0.50 dev stats panel (?dev=1 only; never shown to players) ----------
// Demo tools stay in Settings while testing; to be hidden at the end of the build (client)
// For play-testing in blocks of 100 spins: spins, biggest win, features seen, spins since the last 5x+ win, balance range.
const devStats = {
  on: /[?&]dev=1\b/.test(location.search) || optVal('stats') === 'on', el: null, s: null,   // v0.68: also from the test menu
  reset() { this.s = { spins: 0, staked: 0, won: 0, best: 0, bonus: 0, sup: 0, loco: 0, buys: 0, since5: 0, w5: 0, w10: 0, net: 0, lo: 0, hi: 0, started: S.balance,
    hits: 0, dry: 0, dryMax: 0, bonusWin: 0, baseStaked: 0, baseWon: 0, expB: 0, log: [] }; this.render(); },
  /** v0.68: the designed Hold & Win rate for this option set and mode (1 in N), for the session's expected range */
  every(mode) { const p = S.profile.split('+'); return mode === 'double' ? (p.includes('bonusOften') ? 50 : p.includes('bonusRare') ? 80 : 59) : (p.includes('bonusOften') ? 92 : p.includes('bonusRare') ? 149 : 110); },
  /** v0.68: every paid spin of the session, so a session that feels wrong can be checked spin by spin (EXPORT) */
  save() { try { localStorage.setItem('pocoLoco.session68', JSON.stringify({ v: 'v0.68', profile: S.profile, log: this.s.log })); } catch { /* storage blocked */ } },
  exportFile() { const blob = new Blob([JSON.stringify({ game: 'Poco Loco', version: 'v0.68', profile: S.profile, saved: new Date().toISOString(),
      fields: 'mode (b = base, d = Double Chance, u = buy, s = Super Buy), stake, win, bonus (0/1)', log: this.s.log })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `poco_session_${Date.now()}.json`; document.body.append(a); a.click(); a.remove(); },
  add(rec) {
    if (!this.on) return; if (!this.s) this.reset();
    const s = this.s, R = rec.round, x = rec.win / rec.bet, bought = rec.mode === 'buy' || rec.mode === 'superbuy';
    if (bought) s.buys++; else s.spins++;
    s.staked += rec.stake; s.won += rec.win; s.net = s.won - s.staked; s.lo = Math.min(s.lo, s.net); s.hi = Math.max(s.hi, s.net);
    s.best = Math.max(s.best, x);
    if (R.feature && !R.feature.super) s.bonus++; if (R.feature?.super) s.sup++; if (R.base?.loco) s.loco++;
    if (!bought) { if (x >= 5) { s.since5 = 0; s.w5++; } else s.since5++; if (x >= 10) s.w10++; }
    // v0.68: hit rate, runs without a win, average bonus, RTP of the paid spins (base game + Double Chance)
    s.log.push([{ base: 'b', double: 'd', buy: 'u', superbuy: 's' }[rec.mode] || rec.mode, rec.stake, rec.win, R.feature ? 1 : 0]); if (s.log.length % 25 === 0) this.save();
    if (!bought) { s.expB += 1 / this.every(rec.mode);
      s.baseStaked += rec.stake; s.baseWon += rec.win; if (rec.win > 0) { s.hits++; s.dry = 0; } else { s.dry++; s.dryMax = Math.max(s.dryMax, s.dry); }
      if (R.feature) s.bonusWin += (R.feature.total / 100) * rec.bet; }
    this.render();
  },
  render() {
    if (!this.on) return;
    if (!this.el) { this.el = document.createElement('div'); this.el.id = 'devStats'; document.body.append(this.el);
      this.el.addEventListener('click', e => { if (e.target.closest('.ds-export')) { this.save(); this.exportFile(); return; } if (e.target.closest('.ds-reset')) this.reset(); else if (e.target.closest('b')) this.el.classList.toggle('min'); }); }
    const s = this.s || {}, m = v => fmt(v || 0);
    const n = s.spins || 0, nb = (s.bonus || 0) + (s.sup || 0), pc = (a, b) => (b ? (100 * a / b).toFixed(1) : '0.0');
    this.el.innerHTML = `<b title="tap to fold">SESSION ▾</b><span>Spins ${n}${s.buys ? ` · buys ${s.buys}` : ''} · RTP ${pc(s.baseWon || 0, s.baseStaked || 0)}%</span>`
      + `<span>Hit rate ${pc(s.hits || 0, n)}% · no win: now ${s.dry || 0}, longest ${s.dryMax || 0}</span>`
      + `<span>Bonuses ${nb} · expected ${(s.expB || 0).toFixed(1)} (usual ${Math.max(0, Math.floor((s.expB || 0) - 1.645 * Math.sqrt(s.expB || 0)))}–${Math.ceil((s.expB || 0) + 1.645 * Math.sqrt(s.expB || 0))}) · avg ${nb ? ((s.bonusWin || 0) / nb / bet()).toFixed(1) : '-'}×</span>`
      + `<span>Biggest win ${(s.best || 0).toFixed(1)}×</span>`
      + `<span>Bonuses ${s.bonus || 0} · Supers ${s.sup || 0} · Loco ${s.loco || 0}</span><span>5×+ wins ${s.w5 || 0} · 10×+ ${s.w10 || 0}</span>`
      + `<span>Spins since 5×+ ${s.since5 || 0}</span><span>Net ${m(s.net)} (low ${m(s.lo)} · high ${m(s.hi)})</span><button class="ds-reset" type="button">reset</button><button class="ds-export" type="button">export</button>`;
  },
};

// ---------- round flow ----------
async function playRound(mode) {
  if (S.busy) return null;
  audio.unlock();
  const stakeMinor = Math.round(bet() * S.cfg.modes[mode].costPct / 100);
  if (S.balance < stakeMinor) { toast('Insufficient balance'); stopAuto(); return null; }
  S.busy = true; S.skip = false; S.inFeature = false; updateHud(); extraTip(false); clearTimeout(idleSoon); keepAwake(true);
  reels.clearWins(); setWin(0, false);
  let rec, action = null;
  try {
    rec = await rgs.play(bet(), mode, S.pendingForce, S.profile);
  } catch (e) {
    S.busy = false; updateHud(); toast(`Server: ${e.code || e.message}`); stopAuto(); return null;
  }
  S.pendingForce = null; S.last = rec;
  S.balance = rec.balanceBefore - rec.stake; updateHud();
  const R = rec.round;

  try {
    if (mode === 'buy' || mode === 'superbuy') {
      await buySpin(R.feature);
      action = await runFeature(R.feature, rec, true);
    } else {
      await baseSpin(R, rec);
      if (R.feature) action = await runFeature(R.feature, rec, false);
      if (S.afterBonus) { const a = S.afterBonus; S.afterBonus = null; S.afterBonusRun = true;   // v0.67 (checklist 1)
        try { if (a.mysteryCells.length || R.base.loco || R.base.lineWin > 0) await baseResults(R, rec, a.mysteryCells); } finally { S.afterBonusRun = false; }
        if (R.base.lineWin > 0) S.lineAfter = true; }
    }
    if (R.capped) await banner('MAXIMUM WIN', `${S.cfg.maxWinBU / 100}×`, 'ROUND COMPLETE', 1800);
    setWin(rec.win, false);
    if (!R.feature) await bigWin(rec.win, rec.bet);   // v0.70 (checklist 9): against the stake only, never the Double Chance extra
  } catch (e) { console.error(e); }

  const balFrom = S.balance;
  S.balance = rec.balanceAfter;
  if (R.meter) S.meterState = R.meter.after;
  devStats.add(rec);
  S.busy = false; updateHud(); keepAwake(false);
  if (R.feature) tickBalance(balFrom, S.balance);   // v0.62e: back from a bonus, the balance ticks up
  if (S.lineAfter) { S.lineAfter = false; plaque(fmt(buToMinor(R.base.lineWin, rec.bet))); }   // v0.67: the spin's line win, paid after the bonus, stays
  else if (R.feature) spinToPlay(); else if (rec.win > 0) plaque(fmt(rec.win));
  S.winShown = rec.win > 0 && !R.feature || !!(R.feature && R.base?.lineWin > 0);   // v0.68: kept into the next spin
  if (!(rec.win > 0) && S.winShownPrev) idleLater(300);   // a spin without a win hands the bar back to its usual lines
  S.winShownPrev = S.winShown;   // v0.56: back from a bonus: SPIN TO PLAY; v0.67: amount only
  if (!(rec.win > 0 && (!R.feature || R.base?.lineWin > 0))) idleLater(900);   // v0.67 (checklist 2): a base-game win stays in the bar until the next spin
  if (action === 'buy') { stopAuto(); openBuy(); }   // checklist 4 item 10: BUY FEATURE opens the adjustable buy panel (its own BUY confirms)
  return rec;
}

async function baseSpin(R, rec) {
  const B = R.base;
  audio.play('spinStart');
  if (B.loco) await locoIntro();
  // v0.68 (checklist 2): the last win's amount stays in the bar while this spin runs; this spin's own result replaces it
  if (!S.winShown && !$('#msgBar').classList.contains('ticking')) idleTicker();
  // Near miss: a reel slows down with an animated surround when the reels before it already hold one
  // coin short of the trigger (3 on the first reel → reels 2 and 3; 3 on reels 1-2 → reel 3).
  const need = S.cfg.triggerCount;
  const upTo = r => B.coins.filter(c => cellPos(c.cell)[0] < r).length;
  const nearReels = [1, 2].filter(r => upTo(r) >= need - 1 && upTo(r) < need);
  // v0.50 Loco Spin build-up: the middle and right reels spin on inside the burning edge (the middle one lands fully Wild);
  // the outer positions the Mariachi then turns Wild first land as the reel's own symbols (B.loco.under)
  // v0.56 (client): only the centre reel burns - it is the one that is sure to land Wild; the right reel lands normally
  // (it still burns if it is a real one-coin-short near miss)
  const locoReels = B.loco ? [1] : [];
  const shown = B.loco ? B.symbols.map((sym, c) => { const i = B.loco.wilds?.indexOf(c) ?? -1; return i >= 0 ? B.loco.under[i] : sym; }) : B.symbols.slice();
  // v0.63: Mystery stacks land as marigolds and reveal after the stop (in a Loco Spin the centre reel is all Wild anyway)
  const mysteryCells = B.mystery?.plain ? [] : (B.mystery?.cells || []).filter(c => !(B.loco && c >= 3 && c < 7));   // pot collectors: curtains land already revealed
  for (const c of mysteryCells) shown[c] = 'Q';
  let antic = null, teaseCam = false;
  let landedCoins = 0;
  // v0.67 (checklist 1): a natural trigger (4+ coins landed, no Coin Save) fires the bonus burst - brass hit and the
  // skull's shout - on the landing of the coin that completes it, as in a bought bonus; then straight into Hold & Win
  const natTrig = !!R.feature && !B.rescue && B.coins.length >= need;
  let trigFired = false;
  // pot collectors (3 Nov): a pot on reel 1 or 2 - the reels after it get a short, light anticipation ("will coins land?")
  const potReel = B.pot ? cellPos(B.pot.cell)[0] : -1;
  const lightReels = potReel >= 0 && potReel < 2 ? [1, 2].filter(r => r > potReel && !nearReels.includes(r)) : [];
  let potAntic = null;
  await reels.spin(shown, B.coins, {
    turbo: S.turbo, pace: { brisk: 0.8, now: 1, relaxed: 1.2 }[optVal('spin')] ?? 1, nearReels: [...new Set([...nearReels, ...locoReels])].sort(),   // v0.71 Spin pace
    fillWith: B.loco ? { 1: 'W' } : null,   // v0.52: in a Loco Spin the centre reel races through Wild suns inside the burn
    nearResult: r => (B.loco && locoReels.includes(r) && !nearReels.includes(r) ? true : upTo(r + 1) >= need),   // s06: success only when the stopping column really completes the trigger
    lightReels, onLight: r => { if (!potAntic && !antic) potAntic = audio.play('anticipation', { gain: 0.5 }); },
    onNear: (r, ms) => { if (!antic) { antic = audio.play('anticipation'); plaque(B.loco && !nearReels.includes(r) ? 'LOCO SPIN…' : 'ONE MORE COIN…')   /* v0.67 (checklist 3) */; }
      // v0.62f (client): the bonus tease (one coin short) also dims the background and pushes in on the grid, building
      // with the flames to the reel's stop (the Hold & Win push-in)
      if (nearReels.includes(r) && !reducedMotion()) { teaseCam = true; document.body.classList.add('tease-dim'); teasePush(ms || 1200); } },
    onStop: r => {
      audio.play('reelStop', { i: r });
      if (teaseCam && (r === 2 || !nearReels.some(n => n > r))) { teaseCam = false; document.body.classList.remove('tease-dim');
        if (upTo(r + 1) >= need) { pushHit(); S.deflate = true; } else pushOut(true); }
      if (r === 2 && antic) { antic.stop(0.1); antic = null; }
      if (r === 2 && potAntic) { potAntic.stop(0.12); potAntic = null; }
      if (r === potReel) { audio.play('tierUp'); const el = reels.cellEl(B.pot.cell)?.querySelector('.sym-svg');
        el?.animate([{ scale: '1' }, { scale: '1.22', filter: 'brightness(1.5)', offset: .4 }, { scale: '1', filter: 'brightness(1)' }], { duration: 420, easing: 'cubic-bezier(.3,1.4,.5,1)' }); }
      // checklist 20: coins landing together in one column are spaced 50 ms apart and slightly quieter after the
      // first, instead of stacking into one loud overlapped hit
      // v0.52 (client): one coin sound per column, however many coins land in it (each column a step higher)
      if (B.coins.some(c => cellPos(c.cell)[0] === r)) audio.play('coinLand', { i: landedCoins++ });
      if (natTrig && !trigFired && upTo(r + 1) >= need) { trigFired = true; S.triggerFired = true; audio.play('trigger'); skullCheer(); }
    },
  });
  // v0.67 (checklist 1): a natural trigger goes straight into Hold & Win - no coin flight to the skull; any curtain,
  // Loco Spin and line win of this spin play when the game returns to the reels (baseResults after the bonus)
  if (natTrig) { stage.classList.remove('loco'); S.afterBonus = { mysteryCells }; return; }
  await baseResults(R, rec, mysteryCells);
}

/** v0.67: the base spin's results after the reels stop (curtains, Loco Spin, line win, Coin Save, candle); after a
 *  natural trigger they play when the bonus is over. */
async function baseResults(R, rec, mysteryCells) {
  const B = R.base;
  // v0.53 (item 5): a 3-coin spin keeps its coins on the reels: Coin Save may add to them, or they fly straight into the
  // Super meter. The same for every 3-coin spin, so the coins never give the result away.
  const near3 = B.coins.length === (S.cfg.triggerCount ?? 4) - 1;
  const potWin = !!B.pot && !B.pot.tease;
  if (!near3 && !S.afterBonusRun && !R.feature && !potWin) await coinsToSkull(B.coins.map(c => c.cell));   // v0.67: never on a trigger spin (Coin Save triggers too)   // s05A: one coordinated collection for the spin
  S.skip = false;
  if (mysteryCells.length) await mysteryReveal(mysteryCells, B);
  // v0.69 "Bigger curtain wins" (fBig): a doubled curtain win is shown as a x2 burst over the curtain before the win plays
  if (mysteryCells.length && B.mystery?.mult > 1 && !B.loco) {
    const rs = mysteryCells.map(c => cellRect(c)), cx = rs.reduce((a, r) => a + r.cx, 0) / rs.length, cy = rs.reduce((a, r) => a + r.cy, 0) / rs.length;
    audio.play('tierUp'); flash(260); fx.burst(cx, cy, { count: 40, speed: 10, size: 7, colors: ['#ffd35a', '#fff4b8', '#ff8a1f'] });
    floatText(`×${B.mystery.mult}`, cx, cy, { size: 130, dy: -50, ms: 1100 }); await sw(T(750)); }
  if (B.loco) await locoReveal(B);
  if (potWin) await potCollectBase(B, rec);   // pot collectors: the coins swoosh into the pot, one by one

  if (B.lineWin > 0) {
    const winMinor = buToMinor(B.lineWin, rec.bet);
    if (potWin && !B.lineWins.length) { plaque(fmt(winMinor)); winBarFX(); await sw(T(900)); reels.clearWins(); S.skip = false; }
    else {
    const cells = reels.showAllWins(B.lineWins, B.symbols);
    const wild = cells.some(c => B.symbols[c] === 'W');
    for (const c of cells) {
      const r = cellRect(c);
      fx.burst(r.cx, r.cy, { count: (wild && B.symbols[c] === 'W' ? 34 : 18) / (cells.length > 4 ? 2 : 1), speed: 8, colors: B.symbols[c] === 'W' ? ['#ff4d00', '#ffb21f', '#fff3b0'] : ['#ffd35a', '#fff4b8', '#ff9a1f'], size: 6 });
    }
    audio.play(wild ? 'wildWin' : 'lineWin');
    // v0.70 (checklist 10) Win pop: a win of 2x+ (or 5x+) the stake - never the Double Chance extra - shows its amount over
    // the grid, then swooshes down into the win bar; BIG WIN (15x+) keeps its own celebration
    const popAt = { off: Infinity, 2: 2, 5: 5 }[optVal('wpop')] ?? 2, xStake = winMinor / rec.bet;
    if (xStake >= popAt && xStake < (TIERS[TIERS.length - 1][0])) { await winPop(winMinor); }
    else {
    // v0.67 (checklist 2): the win bar shows the amount only - no WIN / LOCO SPIN / multiplier text
    plaque(fmt(0));
    await countWin(0, winMinor, T(Math.min(1400, 450 + B.lineWins.length * 120)), v => { $("#msgText").textContent = fmt(v); fitMsg(); });
    }
    winBarFX();   // s21: one finishing gold splash once the exact amount is known
    await sw(T(R.feature || B.rescue ? 700 : 1100));
    reels.clearWins(); S.skip = false;
    }
  }

  if (B.rescue || B.rescueFail) {
    reels.hotCoins(B.coins.filter(c => !B.rescue?.added.some(a => a.cell === c.cell)).map(c => c.cell));
    await wait(T(350));
    await skullSpit(B.rescue?.added ?? [], a => { const el = reels.setCoin(a.cell, a); coinPop(el?.querySelector('.sym-svg')); },
      { fail: !!B.rescueFail, say: plaque });
    if (B.rescueFail) reels.clearWins();
  }
  stage.classList.remove('loco');
  // 0.3.0: a near miss that Coin Save didn't rescue may light the next candle
  if (R.meter?.candle) await lightCandle(R.meter, B.coins.map(c => c.cell));

  // s07: a trigger goes straight into the continuous Hold & Win entry (runFeature), with the coins still on the reels
}

// ---------- pot collectors (client 3 Nov 09:21) ----------
/** The bonus opening with pots: each multiplier square in turn - the big ×N in the middle of the square, then up to its
 *  corner (no swish from the pot); then any jackpot doublings. A tap places the rest at once. */
async function potsOpening(F, b) {
  S.voiceTurn = false; S.skip = false;
  for (const f of F.openingFrames || []) { const rc = cellRect(f.cell);
    board.addFrame(f.cell, f.mult, { fast: S.skip }); frameSound(); info(`×${f.mult} MULTIPLIER`);
    fx.burst(rc.cx, rc.cy, { count: 36, speed: 10, size: 7, colors: MULT_COL[f.mult] || MULT_COL[2] });
    await sw(S.skip ? 120 : 1350); }
  for (const a of [...(F.openingJackpot ? [{ type: 'jackpot', ...F.openingJackpot }] : []), ...(F.openingJackpots || [])]) await growJackpot(a);
  await sw(300);
}
/** The pot's plate: COLLECT, then the value it holds (counts up as each coin arrives). */
function potLabel(el, minor, pop = true) {
  const lab = el?.querySelector('.coin-label'); if (!lab) return;
  const t = fmtNum(minor); lab.textContent = t; lab.classList.remove('cpot-wait'); lab.style.setProperty('--n', String(t.length));
  if (pop) lab.animate([{ transform: 'translate(-50%, -50%) scale(1.45)', filter: 'brightness(2)' }, { transform: 'translate(-50%, -50%) scale(1)', filter: 'brightness(1)' }], { duration: 260, easing: 'cubic-bezier(.3,1.5,.5,1)' });
}
/** Base game: every coin on the reels swooshes into the pot, one by one; its plate counts up; a burst when it's done. */
async function potCollectBase(B, rec) {
  const potEl = reels.cellEl(B.pot.cell), pr = cellRect(B.pot.cell), fast = S.turbo || S.skip;
  potEl?.classList.add('pot-hot');
  let sum = 0; const coins = B.pot.coins.slice().sort((a, b) => Math.abs(cellPos(a.cell)[0] - cellPos(B.pot.cell)[0]) - Math.abs(cellPos(b.cell)[0] - cellPos(B.pot.cell)[0]) || a.cell - b.cell);
  await sw(T(fast ? 120 : 300));
  for (let i = 0; i < coins.length; i++) { const c = coins[i], rc = cellRect(c.cell), el = reels.cellEl(c.cell);
    el?.querySelector('.sym-svg')?.animate([{ scale: '1' }, { scale: '1.2', filter: 'brightness(1.8)', offset: .5 }, { scale: '1' }], { duration: 260 });
    if (c.jp) { audio.play('jackpot'); floatText(`${c.jp}!`, rc.cx, rc.cy - 40, { size: 56, dy: -30, ms: 800 }); }
    await fx.ribbon(rc.cx, rc.cy, pr.cx, pr.cy, { ms: fast ? 260 : 460, bend: 90, width: 14, tail: .55, accel: 'strong', sparks: .5 });
    sum += c.v; potLabel(potEl, buToMinor(sum, rec.bet)); audio.play('coinLand', { i: i + 2 });
    el?.classList.add('pot-taken');
    fx.burst(pr.cx, pr.cy, { count: 22, speed: 8, size: 6, colors: ['#ffd35a', '#fff4b8', '#ffb21f'] });
    await sw(T(fast ? 60 : 160)); }
  audio.play('bigJackpot'); fx.burst(pr.cx, pr.cy, { count: 60, speed: 12, size: 7, colors: ['#ffd35a', '#fff4b8', '#ff8a1f'] });
  potEl?.querySelector('.sym-svg')?.animate([{ scale: '1' }, { scale: '1.3', filter: 'brightness(1.9)', offset: .35 }, { scale: '1' }], { duration: 520, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  await sw(T(fast ? 300 : 650));
  potEl?.classList.remove('pot-hot'); reels.reelsEl?.querySelectorAll('.pot-taken').forEach(e => e.classList.remove('pot-taken'));
}
/** Bonus: the pot lands (a heavy slam, COLLECT on its plate), then every coin already on the grid swooshes in one by one
 *  - multipliers shown as they go, a jackpot being eaten made a moment of its own - and its value counts up. */
async function potLandBonus(cell, b, { replace = false } = {}) {
  const rc = cellRect(cell);
  audio.play('trigger'); assemblyShake(1.4);
  await board.place(cell, { pot: true, pending: true, v: 0 }, { drop: !replace });
  fx.burst(rc.cx, rc.cy, { count: 50, speed: 11, size: 7, colors: ['#ffd35a', '#fff4b8', '#ff8a1f'] });
  info('COLLECTOR POT!'); await sw(PRES.newCoinRecog + 250);
}
async function potCollectBonus(p, b) {
  const potEl = board.coinEl(p.cell), pr = cellRect(p.cell);
  let sum = p.own;
  if (p.own > 0) potLabel(potEl, buToMinor(sum, b), false);
  await sw(200);
  for (let i = 0; i < p.from.length; i++) { const f = p.from[i], rc = cellRect(f.cell), cEl = board.coinEl(f.cell), h = board.held.get(f.cell);
    if (S.skip) break;
    board.emphasise?.(f.cell, 300);
    const m = board.frames?.get(f.cell); const badge = board.frameEl(f.cell)?.querySelector('.mp-badge');
    if (m > 1 && badge) { badge.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.9)', filter: 'brightness(1.8)', offset: .4 }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.3,1.4,.5,1)' }); frameSound(); await sw(240); }
    if (h?.jp) { audio.play(h.jp === 'MAJOR' || h.jp === 'GRAND' ? 'bigJackpot' : 'jackpot'); floatText(`${h.jp}!`, rc.cx, rc.cy - 40, { size: 60, dy: -34, ms: 900 });
      fx.burst(rc.cx, rc.cy, { count: 40, speed: 10, size: 7, colors: [JP_HUE[h.jp] || '#ffd35a', '#ffd35a', '#fff4b8'] }); await sw(380); }
    await fx.ribbon(rc.cx, rc.cy, pr.cx, pr.cy, { ms: 440, bend: 80, width: 15, tail: .55, accel: 'strong', sparks: .5 });
    sum += f.v; potLabel(potEl, buToMinor(sum, b)); audio.play('collect', { i: Math.min(6, i) });
    board.collected(f.cell); if (h?.pot) h.pot = false;
    fx.burst(pr.cx, pr.cy, { count: 20, speed: 8, size: 6, colors: ['#ffd35a', '#fff4b8', '#ffb21f'] });
    await sw(140); }
  if (S.skip) { for (const f of p.from) board.collected(f.cell); }
  sum = p.value; potLabel(potEl, buToMinor(sum, b));
  board.held.set(p.cell, { pot: true, v: p.value, pending: false });
  audio.play('bigJackpot'); flash(200);
  fx.burst(pr.cx, pr.cy, { count: 70, speed: 13, size: 7, life: 55, colors: ['#ffd35a', '#fff4b8', '#ff8a1f', '#ffb21f'] });
  potEl?.animate([{ scale: '1' }, { scale: '1.28', filter: 'brightness(2)', offset: .35 }, { scale: '1' }], { duration: 560, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  info(`POT ${fmt(buToMinor(p.value, b))}`); await sw(700);
}

// ---------- v0.63 Mystery reveal (UGDI-style mystery stacks) ----------
/** Every Mystery on screen opens at once into the same symbol (the revealed symbol, before any Loco Wilds).
 *  v0.65 curtain: the real symbol is put in place underneath, the curtain is laid over it in three pieces; the drapes
 *  part from the middle and gather to the sides, then the whole curtain (valance too) puffs away. Every reveal opens
 *  the same way; only a reveal that makes a win has a sound (a gentle puff) - the line win's own sound follows.
 *  v0.64 (marigold art): no win - a quiet flip; a win - a light flip, a little more for 1x+ or a Wild. */
async function mysteryReveal(cells, B) {
  const fast = S.turbo || S.skip || reducedMotion();
  const sym = B.mystery.symbol;
  const helped = (B.lineWins || []).filter(w => w.cells.some(c => cells.includes(c)));
  const pay = helped.reduce((a, w) => a + w.win, 0);   // BU (1/100 of the bet)
  const level = pay <= 0 ? 0 : (pay >= 100 || sym === 'W') ? 2 : 1;
  if (CURTAIN && ART_V2) {
    // v0.66 (checklist item 2): one soft fabric swish per reveal (every reveal), then the stage-light glow - a thin line
    // of warm light through the centre seam, blooming as the drapes part, the curtain dissolving into it, the light
    // settling on the symbol. ?reveal=swirl: a swirl of gold light that spins the curtain away instead.
    const swirl = /[?&]reveal=swirl\b/.test(location.search);
    const open = fast ? 180 : 420, fade = fast ? 140 : 300;
    const fxs = [];
    for (const c of cells) {
      const el = reels.setSymbol(c, sym); if (!el) continue;
      el.insertAdjacentHTML('beforeend', v2Curtain());
      const f = el.lastElementChild; if (swirl) f.classList.add('swirl');
      fxs.push(f);
    }
    audio.play('curtainSwish');
    const ease = 'cubic-bezier(.55,0,.35,1)';
    for (const f of fxs) {
      const L = f.querySelector('.ct-light'), cloth = f.querySelector('.ct-cloth');
      if (swirl) {
        // the light spins up from the centre; the curtain turns and shrinks into it
        L.animate([{ opacity: 0, transform: 'rotate(0deg) scale(.25)' }, { opacity: 1, transform: 'rotate(260deg) scale(1)', offset: .55 }, { opacity: 0, transform: 'rotate(420deg) scale(1.25)' }],
          { duration: open + fade, easing: 'ease-in-out', fill: 'forwards' });
        cloth.animate([{ opacity: 1, transform: 'rotate(0deg) scale(1)' }, { opacity: 1, transform: 'rotate(40deg) scale(.8)', offset: .35 }, { opacity: 0, transform: 'rotate(160deg) scale(.15)' }],
          { duration: open, easing: 'ease-in', fill: 'forwards' });
        continue;
      }
      // v0.73 (checklist 2): the opening is the show - a quick tremble, then the drapes open ALL the way to the sides, fast
      // from the start and easing in; the curtain stays fully visible until they get there. Then a glow pop (below).
      const TR = fast ? 40 : 100, PULL = fast ? 200 : 300, OUT = fast ? 130 : 200, T = TR + PULL + OUT, tr = TR / T, pk = (TR + PULL) / T;
      for (const side of ['.ct-left', '.ct-right']) f.querySelector(side)?.animate([
        { transform: 'scaleX(1) translateX(0)' }, ...(TR ? [{ transform: `scaleX(.97) translateX(${side === '.ct-left' ? '-1.5%' : '1.5%'})`, offset: tr * .5 }, { transform: 'scaleX(1) translateX(0)', offset: tr, easing: 'cubic-bezier(.15,.75,.3,1)' }] : [{ transform: 'scaleX(1) translateX(0)', offset: 0, easing: 'cubic-bezier(.15,.75,.3,1)' }]),
        { transform: 'scaleX(.1) translateY(-1%)', offset: pk }, { transform: 'scaleX(.1) translateY(-1%)' }], { duration: T, fill: 'forwards' });
      L.animate([{ opacity: 0 }, { opacity: 0, offset: tr }, { opacity: level ? .9 : .6, offset: pk }, { opacity: 0 }], { duration: T, easing: 'ease-out', fill: 'forwards' });
      cloth.animate([{ opacity: 1 }, { opacity: 1, offset: pk }, { opacity: 0 }], { duration: T, easing: 'ease-in', fill: 'forwards' });
    }
    // the glow pop as the drapes reach the sides: a soft warm-gold bloom behind each revealed symbol that swells a little
    // past the block, peaks and fades; the symbol pops 1.08x with it. Scaled to the result; no particles at any level.
    const atSides = fast ? 40 + 200 : 100 + 300, GLOW = fast ? 260 : 350;
    if (swirl) { await sw(open + fade); for (const f of fxs) f.remove(); return; }   // the Swirl style is unchanged
    setTimeout(() => {
      const peak = [.55, .8, 1][level], grow = [1.12, 1.2, 1.28][level];
      for (const c of cells) { const el = reels.cellEl(c); if (!el) continue;
        const g = document.createElement('i'); g.className = `curtain-glow lv${level}`; el.prepend(g);
        g.animate([{ opacity: 0, transform: 'scale(.7)' }, { opacity: peak, transform: `scale(${grow})`, offset: .4 }, { opacity: 0, transform: `scale(${grow + .08})` }],
          { duration: GLOW + (level === 2 ? 120 : 0), easing: 'cubic-bezier(.2,.7,.4,1)' }).finished.then(() => g.remove()).catch(() => g.remove());
        el.querySelector('.sym-svg')?.animate([{ scale: '1' }, { scale: '1.08', offset: .4 }, { scale: '1' }], { duration: GLOW, easing: 'cubic-bezier(.3,1.2,.5,1)' }); }
      if (level) audio.play(level === 2 ? 'mysteryBig' : 'mysterySoft');
      if (level === 2 && !reducedMotion()) { const w = document.createElement('i'); w.className = 'warm-wash'; $('#machine').append(w);
        w.animate([{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 0 }], { duration: fast ? 300 : 420, easing: 'ease-out' }).finished.then(() => w.remove()).catch(() => w.remove()); }
    }, atSides);
    await sw(atSides + GLOW);
    for (const f of fxs) f.remove();
    return;
  }
  if (level === 0) {   // nothing to see: just becomes the symbol
    for (const c of cells) { const el = reels.setSymbol(c, sym); el?.querySelector('.sym-svg')?.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' }); }
    return;
  }
  audio.play(level === 2 ? 'mysteryBig' : 'mysterySoft');
  for (const c of cells) {
    const el = reels.setSymbol(c, sym);
    el?.querySelector('.sym-svg')?.animate(level === 2
      ? [{ scale: '.8', filter: 'brightness(1.7)' }, { scale: '1.06', offset: .5, filter: 'brightness(1.25)' }, { scale: '1', filter: 'brightness(1)' }]
      : [{ scale: '.9', filter: 'brightness(1.4)' }, { scale: '1', filter: 'brightness(1)' }], { duration: fast ? 180 : (level === 2 ? 340 : 240), easing: 'cubic-bezier(.3,1.3,.5,1)' });
  }
  await sw(fast ? 80 : (level === 2 ? 260 : 160));
}

// ---------- 0.3.0 Loco Spin: the Mariachi turns the middle reel fully Wild ----------
async function locoIntro() {
  stage.classList.add('loco');
  plaque('LOCO SPIN!'); audio.play('wildWin'); flash(420);
  const r = cellRect(4); fx.burst(r.cx, r.cy + 60, { count: 60, speed: 12, size: 7, colors: ['#ff4d00', '#ffb21f', '#fff3b0'] });
  floatText('LOCO SPIN!', 360, r.cy, { size: 84, dy: -60, ms: 1100 });
  await wait(T(520));
}

/**
 * v0.50 Loco Spin reveal (after the reels land): the Mariachi turns 0-3 outer positions Wild one by one, then the
 * multiplier ticker races through x2 / x3 / x5 / x10, slows and stops on the spin's multiplier. Quick Spin shortens it;
 * a tap (skip) jumps to the result. Purely presentation of the round record (B.loco).
 */
async function locoReveal(B) {
  const L = B.loco, fast = () => S.turbo || S.skip || reducedMotion();
  // v0.73 (checklist 9): a column that is about to get extra Wild(s) burns first - the same flames as the centre column -
  // then its Wild(s) appear; left column first, then right. A column with no extra Wild never burns.
  const byCol = [0, 2].map(col => (L.wilds || []).filter(c => cellPos(c)[0] === col)).filter(a => a.length);
  for (const cells of byCol) {
    if (!S.skip) { const h = audio.play('anticipation'); await reels.burnColumn(cellPos(cells[0])[0], fast() ? 320 : 620); try { h?.stop?.(0.1); } catch { /* done */ } }
  for (const c of cells) {
    const r = cellRect(c);
    fx.burst(r.cx, r.cy, { count: fast() ? 18 : 40, speed: 10, size: 7, colors: ['#ff4d00', '#ffb21f', '#fff3b0'] });
    flash(160); audio.play('wildWin');
    const el = reels.setSymbol(c, 'W');
    const sym = el?.querySelector('.sym-svg');
    sym?.animate([{ scale: '.6', filter: 'brightness(2.4)' }, { scale: '1.14', offset: .45, filter: 'brightness(1.6)' }, { scale: '1', filter: 'brightness(1)' }], { duration: fast() ? 220 : 420, easing: 'cubic-bezier(.3,1.4,.5,1)' });
    await sw(fast() ? 120 : 360);
  } }
  // the multiplier ticker
  const steps = [2, 3, 5, 8, 10], target = L.mult;   // v0.63: x8 added (UGDI's wild-reel mix)
  const el = document.createElement('div'); el.className = 'loco-ticker'; el.innerHTML = '<small>LOCO MULTIPLIER</small><b>×2</b>';
  const r4 = cellRect(4); el.style.left = '360px'; el.style.top = `${(r4.cy + cellRect(5).cy) / 2}px`;
  $('#game').append(el);
  const b = el.querySelector('b');
  el.animate([{ opacity: 0, scale: '.6' }, { opacity: 1, scale: '1' }], { duration: 180, easing: 'ease-out', fill: 'forwards' });
  if (!fast()) {
    let i = 0, gap = 70, t = 0;
    const total = 1250 + Math.floor(Math.random() * 400);
    while (t < total && !S.skip) { b.textContent = `×${steps[i % steps.length]}`; audio.play('reelStop', { i: i % 3, gain: 0.5 }); await sw(gap); t += gap; gap = Math.min(260, gap * 1.13); i++; }
  }
  b.textContent = `×${target}`;
  el.classList.add('hit', `m${target}`);
  b.animate([{ scale: '1.6', filter: 'brightness(2.2)' }, { scale: '.94', offset: .5 }, { scale: '1', filter: 'brightness(1)' }], { duration: 420, easing: 'cubic-bezier(.3,1.5,.5,1)' });
  audio.play(target >= 5 ? 'tierUp' : 'frame'); if (target >= 5) flash(220);
  fx.burst(360, r4.cy, { count: target >= 5 ? 60 : 30, speed: 11, size: 7, colors: ['#ffd35a', '#fff4b8', '#ff9a1f'] });
  plaque(`LOCO SPIN ×${target}`);
  await sw(fast() ? 260 : 650);
  el.animate([{ opacity: 1 }, { opacity: 0, translate: '0 -30px' }], { duration: 300, easing: 'ease-in', fill: 'forwards' }).finished.then(() => el.remove()).catch(() => {});
  S.skip = false;
}

// ---------- 0.3.0 Calavera candle meter (base game) ----------
const CANDLE_SVG = `<svg viewBox="0 0 40 72" aria-hidden="true"><defs>
  <linearGradient id="cwax" x1="0" x2="1"><stop offset="0" stop-color="#d9b98a"/><stop offset=".45" stop-color="#fff4dc"/><stop offset="1" stop-color="#c79b62"/></linearGradient>
  <radialGradient id="cfl" cx="50%" cy="70%" r="60%"><stop offset="0" stop-color="#fffbe0"/><stop offset=".45" stop-color="#ffd35a"/><stop offset="1" stop-color="#ff6a00"/></radialGradient></defs>
  <ellipse class="c-glow" cx="20" cy="16" rx="16" ry="18" fill="#ffb21f"/>
  <path class="c-flame" d="M20 2c5 7 8 11 8 16a8 8 0 0 1-16 0c0-5 3-9 8-16z" fill="url(#cfl)"/>
  <rect x="19" y="24" width="2" height="6" rx="1" fill="#4a2a12"/>
  <path d="M8 30h24v36a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z" fill="url(#cwax)"/>
  <path d="M8 30h24v5c-2 0-2 6-4 6s-1-4-4-4-2 8-5 8-1-6-4-6-2 3-3 3-2-4-4-4z" fill="#fff8ea"/>
  <circle cx="20" cy="52" r="5.5" fill="#e85a9a" opacity=".8"/><circle cx="17.8" cy="51" r="1.4" fill="#5a1036"/><circle cx="22.2" cy="51" r="1.4" fill="#5a1036"/></svg>`;
// v0.52 (client art, 26 Oct): the Super meter is the skull badge top right, centred under the MINI plaque with equal
// clear space above (to MINI) and below (to the top of the right column's surround). Progress fills the badge's dark
// ring clockwise from the banner's left end, over the top, to its right end (no count shown). It warms as it fills:
// 60 % a breathing glow, 80 % the fill's tip burns and the badge throbs, the last 3 steps the whole ring burns with
// embers and a heartbeat. The fire pauses while the reels spin and in the bonus. Tap = what it does.
const SB = { cx: 182.6 / 360, cy: 163 / 356, r: 115 / 360, a0: 243, span: 234 };   // ring geometry in the badge art
const candles = {
  el: null, n: 10, f: 0,
  build(n = 10) {
    if (this.el) return;
    this.n = n;
    const el = this.el = document.createElement('button'); el.id = 'superBadge'; el.type = 'button';
    el.innerHTML = `<i class="sb-halo"></i><img class="sb-art" src="./assets/reels_v21/super_badge.webp?v=60" alt="" draggable="false">`
      + `<i class="sb-fill"></i><i class="sb-burn"><b></b></i><i class="sb-tipwrap"><i class="sb-tip"></i></i>`
      + `<span class="sb-embers">${'<i></i>'.repeat(9)}</span>`;
    el.addEventListener('click', e => { e.stopPropagation(); audio.play('button');
      toast('SUPER METER: every near miss (3 Coins) that Coin Save doesn\'t rescue fills the ring a little more. When it is full, your next Hold & Win is a SUPER Hold & Win. Your progress is saved for each stake.'); });
    $('#game')?.append(el);
    this.place();
  },
  /** centred under MINI, equal gaps above and below (game units) */
  place() {
    const el = this.el, game = $('#game'), mini = $('.jp-MINI'); if (!el || !game || !mini) return;
    if (WIDE.on) { const R = WIDE.ref, g = WIDE.g, w = R.badgeW / g * 360 / 300, x = (R.badgeCx - WIDE.tx) / g - w / 2, y = (R.badgeTop - WIDE.ty) / g - w * 16 / 360;   // the visible art is about 300 of the image's 360 px
      Object.assign(el.style, { left: `${x.toFixed(1)}px`, top: `${y.toFixed(1)}px`, width: `${w.toFixed(1)}px`, height: `${(w * 356 / 360).toFixed(1)}px` }); this.render(S.meterState); return; }
    const g = game.getBoundingClientRect(), k = g.width / 720 || 1, mr = mini.getBoundingClientRect();
    let top = null;
    for (const e of document.querySelectorAll('#v2frame > .cap-slab, #v2frame > .v2t.bar')) { const r = e.getBoundingClientRect();
      if (r.left - g.left > 380 * k && r.width > 150 * k) top = Math.min(top ?? 1e9, (r.top - g.top) / k); }
    if (top == null) { const rb = document.querySelectorAll('#reels .rbox')[2]; top = rb ? (rb.getBoundingClientRect().top - g.top) / k - 26 : 320; }
    const miniB = (mr.bottom - g.top) / k, gap = top - miniB, cx = (mr.left + mr.width / 2 - g.left) / k;
    // v0.54: the approved size; the badge's VISIBLE art is centred in the space (the image has 16 px of empty space at the
    // top and 41 px at the bottom, of 356), so the gaps above and below look equal
    const VT = 16 / 356, VB = 41 / 356, h = Math.max(70, Math.min(200, gap - 12)), vis = h * (1 - VT - VB), w = h * 360 / 356;   // size as approved (image box = gap - 12), visible art centred
    const y0 = miniB + (gap - vis) / 2 - h * VT;
    Object.assign(el.style, { left: `${(cx - w / 2).toFixed(1)}px`, top: `${y0.toFixed(1)}px`, width: `${w.toFixed(1)}px`, height: `${h.toFixed(1)}px` });
    this.render(S.meterState);
  },
  render(m = { lit: 0 }) {
    if (!this.el) return;
    // a small visible start so the first near miss shows; the early steps are slightly bigger than the late ones
    // (v0.50, client): empty and full are exact
    const x = Math.min(1, (m?.lit ?? 0) / this.n), eased = 1.13 * x - 0.13 * x * x;
    const f = this.f = m?.lit > 0 ? Math.min(1, 0.04 + 0.96 * eased) : 0;
    const el = this.el, a = SB.a0 + f * SB.span, rad = a * Math.PI / 180;
    el.style.setProperty('--fill', String(f)); el.style.setProperty('--deg', `${(f * SB.span).toFixed(2)}deg`);
    el.style.setProperty('--tx', `${((SB.cx + SB.r * Math.sin(rad)) * 100).toFixed(2)}%`);
    el.style.setProperty('--ty', `${((SB.cy - SB.r * Math.cos(rad) * 360 / 356) * 100).toFixed(2)}%`);
    el.style.setProperty('--rot', `${a.toFixed(1)}deg`);   // v0.54: the tip's long axis runs across the ring
    const lit = m?.lit ?? 0;
    el.classList.toggle('lit', lit > 0);
    el.classList.toggle('warm', x >= 0.6 && x < 0.8);
    el.classList.toggle('hot', x >= 0.8 && lit < this.n - 3);
    el.classList.toggle('blaze', lit >= this.n - 3 && lit < this.n);
    el.classList.toggle('ready', lit >= this.n);
    // v0.56 (client): one calm throb from 60 % that only gets a little quicker (3.2 s -> 1.7 s a beat) and a little firmer,
    // while the glow behind it grows bigger and brighter step by step towards full (no heartbeat, no flicker, no embers)
    const u = Math.max(0, Math.min(1, (x - 0.6) / (((this.n - 1) / this.n) - 0.6)));
    el.classList.toggle('throb', x >= 0.6 && lit < this.n);
    el.style.setProperty('--tp', `${(3.2 - 1.5 * u).toFixed(2)}s`);
    el.style.setProperty('--tw', `${(6 + 8 * u).toFixed(2)}%`); el.style.setProperty('--tb', (1 + 0.25 * u).toFixed(2));   // the burning tip grows along the ring
    el.style.setProperty('--ts', (1.02 + 0.025 * u).toFixed(3));
    el.style.setProperty('--ho0', (0.1 + 0.3 * u).toFixed(2)); el.style.setProperty('--ho1', (0.35 + 0.6 * u).toFixed(2));
    el.style.setProperty('--hs0', (0.96 + 0.04 * u).toFixed(2)); el.style.setProperty('--hs1', (1.04 + 0.16 * u).toFixed(2));
    el.setAttribute('aria-label', 'Super meter');
  },
  /** v0.53 (item 5): the badge takes the coins: it swells with a glow like the coins', then settles */
  take() {
    const el = this.el; if (!el) return;
    el.animate([{ scale: '1' }, { scale: '1.22', offset: .28 }, { scale: '0.97', offset: .62 }, { scale: '1' }], { duration: 640, easing: 'cubic-bezier(.3,1.3,.5,1)', composite: 'add' });
    el.querySelector('.sb-halo')?.animate([{ opacity: 0, scale: '.8' }, { opacity: 1, scale: '1.25', offset: .3 }, { opacity: 0, scale: '1.1' }], { duration: 760, easing: 'ease-out' });
    el.querySelector('.sb-fill')?.animate([{ opacity: .4 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' });
  },
  /** full: one big flare as the Super starts */
  flare() {
    const el = this.el; if (!el) return;
    el.animate([{ scale: '1' }, { scale: '1.32', offset: .3 }, { scale: '1.05' }], { duration: 900, easing: 'cubic-bezier(.3,1.4,.5,1)', composite: 'add' });
    el.querySelector('.sb-halo')?.animate([{ opacity: 0, scale: '.9' }, { opacity: 1, scale: '1.6', offset: .35 }, { opacity: .2, scale: '1.3' }], { duration: 1000, easing: 'ease-out' });
  },
  /** where the spark lands: the tip of the fill after this step */
  pos(i) { const el = this.el; if (!el) return { x: 590, y: 240 };
    const x = Math.min(1, (i + 1) / this.n), f = Math.min(1, 0.04 + 0.96 * (1.13 * x - 0.13 * x * x)), rad = (SB.a0 + f * SB.span) * Math.PI / 180;
    const g = $('#game').getBoundingClientRect(), k = g.width / 720, r = el.getBoundingClientRect();
    return { x: (r.left - g.left + r.width * (SB.cx + SB.r * Math.sin(rad))) / k, y: (r.top - g.top + r.height * (SB.cy - SB.r * Math.cos(rad) * 360 / 356)) / k }; },
};
/** A near miss lights the next candle: the skull's spark flies down to it, it catches and flares. */
async function lightCandle(M, cells = []) {
  // v0.53 (item 5): the near miss's own 3 coins swell and glow, then a gold trail runs from each one (staggered)
  // straight into the Super badge; the badge takes them with its own sound (pitched up as the meter fills), pulses
  // bigger with a glow and settles, and the fill steps up. ~1.2 s; Quick Spin shortens it; a tap skips it.
  const full = !!(M.filled ?? M.superBonus);   // v0.64: filling it readies the Super for the next Hold & Win
  const close = !full && M.candle === candles.n - 3;   // v0.52: one-off message as the badge starts to burn
  const seen = loadPrefs().meterHint || 0, hint = !full && !close && seen < 3;   // first 3 times only
  if (hint) savePrefsPatch({ meterHint: seen + 1 });
  if (full) plaque('THE SUPER METER IS FULL!'); else if (close) plaque('THE SUPER IS CLOSE!');   // excitement: flashes
  else scrollNote('NEAR MISS · SUPER METER RISES');   // information: scrolls (v0.56: the same short note every time)
  const to = candles.pos(M.candle - 1), k = mouthIn(fx);
  const from = cells.length ? cells.map(c => cellRect(c)).map(r => ({ x: r.cx, y: r.cy })) : [k];
  for (const c of cells) { const el = reels.cellEl(c)?.querySelector('.sym-svg');
    const cl = reels.cellEl(c); cl?.classList.add('meter-swell'); cl?.closest('.reel-mask')?.classList.add('meter-swell');   // v0.62: never clipped at the top
    el?.animate([{ scale: '1' }, { scale: '1.16', offset: .45 }, { scale: '1.1' }], { duration: T(320), easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'forwards' });
    const cellEl = reels.cellEl(c); if (cellEl) { const sh = document.createElement('i'); sh.className = 'coin-shine'; cellEl.append(sh); setTimeout(() => sh.remove(), 700); } }
  await sw(T(300));
  const fly = T(520), stag = T(110);
  await Promise.all(from.map((p, i) => wait(i * stag).then(() => { audio.play('meterFly', { gain: i ? 0.7 : 1 });
    return fx.ribbon(p.x, p.y, to.x, to.y, { ms: fly, bend: 140 - 60 * i, width: 11, glow: '#ffb21f' }); })));
  for (const c of cells) { const el = reels.cellEl(c)?.querySelector('.sym-svg'); el?.getAnimations().forEach(x => x.cancel()); }   // the coins settle back
  document.querySelectorAll('.meter-swell').forEach(e => e.classList.remove('meter-swell'));
  S.meterState = { lit: M.candle }; candles.render(S.meterState);
  candles.take(M.candle / candles.n);
  audio.play('meterUp', { rate: 0.9 + 0.45 * Math.min(1, M.candle / candles.n) });
  fx.burst(to.x, to.y, { count: 22, speed: 5, size: 5, colors: ['#fff4b8', '#ffd35a', '#ff8a1f'] });
  if (full) {   // v0.64: the meter is full - the next Hold & Win will be a Super
    await wait(T(300));
    audio.play('tierUp'); plaque('SUPER READY · NEXT HOLD & WIN IS SUPER!');
    candles.flare(); flash(320); await wait(T(900));
  } else await sw(T(close ? 1300 : 450));
}

/** Bought feature: a real spin that lands the starting coins among ordinary symbols; the entry (s07) takes over from there. */
async function buySpin(F) {
  const coinAt = new Set(F.start.map(c => c.cell));
  const fillers = ['H1', 'H2', 'M1', 'M1', 'L1', 'L1', 'L2', 'L2', 'L3', 'L3', 'W'];
  const symbols = Array.from({ length: 10 }, (_, c) => (coinAt.has(c) ? 'C' : fillers[Math.floor(Math.random() * fillers.length)]));
  audio.play('spinStart');
  
  let landed = 0, riser = null;
  await reels.spin(symbols, F.start, {
    turbo: false, nearReels: [2], nearResult: () => true,
    // v0.62l (client): the bought bonus's landing tease gets the same dim and grid push-in as the base game's bonus tease
    onNear: (r, ms) => { if (!reducedMotion()) { document.body.classList.add('tease-dim'); teasePush(ms || 1200); } },
    onStop: r => {
      audio.play('reelStop', { i: r });
      if (r === 2 && document.body.classList.contains('tease-dim')) { document.body.classList.remove('tease-dim'); pushHit(); S.deflate = true; }   // the 4th coin always lands
      if (r === 1) riser = audio.play('buyRiser');
      let any = false;
      for (const c of F.start) if (cellPos(c.cell)[0] === r) {
        const rc = cellRect(c.cell); fx.burst(rc.cx, rc.cy, { count: 14, colors: ['#ffd35a', '#ffb21f', '#fff4b8'], speed: 6 }); any = true;
      }
      if (any) audio.play('coinLand', { i: landed++ });   // v0.52: one sound per column
    },
  });
  S.skip = false;
  riser?.stop(0.06);
}

// ---------- brief s10: info bar text + the three-coin spins meter ----------
const LIVES_DEFAULT = 3;
/** The information bar during Hold & Win (same place as the base message bar). */
function info(text) {
  const el = $('#fhState'); if (!el) return;
  el.classList.remove('total'); el.innerHTML = ''; const t = document.createElement('span'); t.textContent = text; el.append(t);
  el.style.removeProperty('font-size'); const room = el.clientWidth - 16, w = t.getBoundingClientRect().width / (el.getBoundingClientRect().width / el.offsetWidth || 1);
  if (room > 0 && w > room) el.style.setProperty('font-size', `${(parseFloat(getComputedStyle(el).fontSize) * room / w).toFixed(1)}px`, 'important');
  capCentre(el);
}
/** s13A: the same bar becomes TOTAL WIN and the accumulating amount. */
function infoTotal(minor) {
  const el = $('#fhState'); if (!el) return null;
  // checklist 19: a dominant amount centred in the bar (its centre stays put as digits change) and a smaller TOTAL WIN
  // label at the left; the size is fixed once from the widest amount this feature can show, so it never jumps
  if (!el.classList.contains('total')) { el.classList.add('total'); el.style.fontSize = ''; el.innerHTML = '<span class="tw-l">TOTAL<br>WIN</span><b class="tw-v"></b>';
    const v0 = el.querySelector('.tw-v'); v0.textContent = fmt(Math.max(minor, (infoTotal.max || 0))); v0.style.fontSize = '';
    const room = el.clientWidth - 2 * (el.querySelector('.tw-l').offsetWidth + 18);
    if (room > 0 && v0.scrollWidth > room) v0.style.fontSize = `${(parseFloat(getComputedStyle(v0).fontSize) * room / v0.scrollWidth).toFixed(1)}px`; }
  const v = el.querySelector('.tw-v'); v.textContent = fmt(minor);
  return v;
}
const METER_COIN = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs>
  <radialGradient id="smFace" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#fff7cf"/><stop offset=".32" stop-color="#ffd84f"/><stop offset=".72" stop-color="#e6930f"/><stop offset="1" stop-color="#8f4c06"/></radialGradient>
  <linearGradient id="smRim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset=".5" stop-color="#e09a18"/><stop offset="1" stop-color="#7a3f04"/></linearGradient></defs>
  <circle cx="32" cy="32" r="30" fill="url(#smRim)"/><circle cx="32" cy="32" r="25.5" fill="url(#smFace)"/>
  <circle cx="32" cy="32" r="21.5" fill="none" stroke="#b5690b" stroke-width="1.6" opacity=".75"/>
  <path d="M32 19.5l3.1 7.6 7.6-3.1-3.1 7.6 7.6 3.1-7.6 3.1 3.1 7.6-7.6-3.1L32 44.5l-3.1-7.6-7.6 3.1 3.1-7.6-7.6-3.1 7.6-3.1-3.1-7.6 7.6 3.1z" fill="#c87a0c" opacity=".55"/>
  <path d="M32 21.5l2.6 6.4 6.4-2.6-2.6 6.4 6.4 2.6-6.4 2.6 2.6 6.4-6.4-2.6L32 42.5l-2.6-6.4-6.4 2.6 2.6-6.4-6.4-2.6 6.4-2.6-2.6-6.4 6.4 2.6z" fill="#ffe27a"/>
  <ellipse cx="25" cy="21" rx="9" ry="4.5" fill="#fffbe6" opacity=".45" transform="rotate(-28 25 21)"/></svg>`;
const meter = {
  els: [], n: LIVES_DEFAULT, count: LIVES_DEFAULT,
  /** 0.3.0: the meter has one socket per life (3 in a standard bonus, 4 in a Super bonus). */
  build(count = LIVES_DEFAULT) {
    const old = $('#spinMeter');
    if (old && count === this.count) return;
    this.count = count;
    const m = old || document.createElement('div'); m.id = 'spinMeter'; m.setAttribute('role', 'img'); m.setAttribute('aria-label', 'Spins left');
    m.classList.toggle('four', count === 4);
    m.innerHTML = Array.from({ length: count }, () => `<i class="sm-sock"><b class="sm-coin">${METER_COIN}</b><em class="sm-burst"></em></i>`).join('') + '<span class="sm-glint"></span>';
    if (!old) stage.append(m);   // v0.35 (checklist 8): hangs under the win bar, positioned by layoutAssembly
    this.els = [...m.querySelectorAll('.sm-sock')];
  },
  set(n) { this.n = n; this.els.forEach((e, i) => e.classList.toggle('on', i < n)); $('#spinMeter')?.setAttribute('aria-label', `${n} spins left`); },
  /** Checklist 15: one marker spends together with the text. The socket reads empty at once (the real marker goes
   *  inactive immediately); a separate ghost of the coin flares and fades on top while the sparkle finishes. */
  spend(n) {
    const e = this.els[n]; this.n = n; $('#spinMeter')?.setAttribute('aria-label', `${n} spins left`);
    if (!e || !e.classList.contains('on')) return;
    e.classList.remove('on');
    if (reducedMotion()) return;
    const ghost = e.querySelector('.sm-coin').cloneNode(true); ghost.classList.add('sm-ghost'); e.append(ghost);
    ghost.animate([{ opacity: .9, scale: '1', filter: 'brightness(1.6)' }, { opacity: 0, scale: '1.25', filter: 'brightness(2)' }], { duration: PRES.markerSpend, easing: 'ease-out' })
      .finished.catch(() => {}).then(() => ghost.remove());
    const b = e.querySelector('.sm-burst'); b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  },
  /** Checklist 15: one reset per qualifying spin — all three markers light in the same frame as the reset text, then one
   *  coordinated flare + glint across the meter (PRES.markerReset, 350-550 ms). No staggered intermediate state. */
  reset() {
    this.n = this.count; $('#spinMeter')?.setAttribute('aria-label', `${this.count} spins left`);
    const rm = reducedMotion(), ms = PRES.markerReset;
    this.els.forEach(e => { e.classList.add('on'); if (!rm) e.querySelector('.sm-coin').animate([{ scale: '1', filter: 'brightness(2)' }, { scale: '1.14', filter: 'brightness(1.5)', offset: .3 }, { scale: '1', filter: 'brightness(1)' }], { duration: ms, easing: 'cubic-bezier(.3,.9,.4,1)' }); });
    if (!rm) { const g = $('#spinMeter .sm-glint'); g.classList.remove('go'); void g.offsetWidth; g.classList.add('go'); }
  },
};
/** Checklist 15: spins text (message bar) and the meter always change in the same call, from the same count. */
function spinsUI(n, kind = 'set', { landed = 0, tension = 0, save = false } = {}) {
  const count = n > 0 ? `${n} SPIN${n > 1 ? 'S' : ''} LEFT` : 'LAST SPIN';
  if (kind === 'reset') {
    info('SPINS RESET'); meter.reset();   // v0.56 (client)
  } else if (kind === 'spend') { info(count); meter.spend(n); }
  else if (kind === 'zero') { info(''); meter.set(0); }
  else { info(count); meter.set(n); }
}
/** v0.67 (checklist 5): the skull awards the extra life - his build-up, a spray down onto the spins row, the row grows
 *  from 3 to 4 sockets, with the jackpot-upgrade sound (fireball build + jackpot hit). */
async function awardLife(n) {
  S.skip = false;
  spinsUI(n - 1); await wait(T(250));
  // v0.70 (checklist 7): the 4th socket is on screen (empty) before the skull fires, and the shot lands on THAT socket,
  // which then lights with a burst and a "+1 SPIN" label - so the spit always visibly delivers something
  meter.build(n); meter.set(n - 1);
  const act = await logoActivate({ build: 160 }); audio.play('fireball');
  const sock = meter.els[n - 1] || $('#spinMeter'), to = sock ? fxPoint(fx, sock) : { x: 360, y: 900 };
  await act.release(to.x, to.y, { ms: 360, bend: -60 });
  meter.set(n); info('EXTRA SPIN!'); audio.play('jackpot');
  floatText('+1 SPIN', to.x, to.y, { size: 64, dy: -70, ms: 1100 });
  hudBurst(to, { count: 30, speed: 8, size: 6, colors: ['#ffd35a', '#fff4b8', '#ff8a1f'] });
  if (!reducedMotion() && sock) sock.animate([{ scale: '1' }, { scale: '1.18', offset: .35 }, { scale: '1' }], { duration: 520, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  await act.done();
  await wait(T(700));
}
// Checklist 4 item 5: the separate SECURED total box is removed (internal totals, collection and payout unchanged).

// ---------- brief s07: continuous Hold & Win entry ----------
/**
 * v0.62m (client): the phone's screen must not dim during a spin or a bonus (the touch that wakes it would skip the
 * animation - a web page cannot tell the two apart). The Screen Wake Lock keeps it on while a round plays and for a
 * minute after; then it is released, so an idle phone still dims as normal. Where the browser has no wake lock, nothing
 * changes.
 */
let wakeLock = null, wakeOff = null;
async function keepAwake(on) {
  clearTimeout(wakeOff);
  if (!on) { wakeOff = setTimeout(() => { wakeLock?.release?.().catch(() => {}); wakeLock = null; }, 60000); return; }
  if (wakeLock || !navigator.wakeLock || document.visibilityState !== 'visible') return;
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener?.('release', () => { wakeLock = null; }); } catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (S.busy || S.auto?.running)) keepAwake(true); });
function setFeatureScene(on) {
  if (on) document.body.classList.remove('rays-off');   // v0.62m: rays allowed again once the next bonus starts
  stage.classList.toggle('mode-feature', on); stage.classList.toggle('mode-base', !on);
  document.body.classList.toggle('feature-mode', on);
  $('#featureHud').classList.toggle('hidden', !on);
  for (const id of ['#spinBtn', '#turboBtn', '#autoBtn']) { const b = $(id); if (on) b.setAttribute('inert', ''); else b.removeAttribute('inert'); }   // s10A: no focus or hits while hidden
  audio.startMusic(on ? 'feature' : 'base');
}
/**
 * One timeline from the last trigger coin to the settled Hold & Win board: the trigger coins enlarge together
 * (the base landing pop, stretched), every other symbol drops away, the background and bonus interface change under
 * them, the coins hand over invisibly to the bonus board at the same size and place, then return together to their
 * resting size and their halos light as they settle. Used for natural and purchased entry alike.
 */
const JP_HUE = { MINI: '#3fe070', MINOR: '#3a9bff', MAJOR: '#b45cff', GRAND: '#ff3a3a' };   // Hold & Win jackpot box / base-game jackpot box (style.css v0.44 item 9)
async function enterHoldAndWin(coins, lives = LIVES_DEFAULT) {
  const cells = coins.map(c => c.cell), coinSet = new Set(cells);
  const P = PRES, rm = reducedMotion();
  await deflateAfterTease();
  // v0.75b (client, 1 Nov: everything after the final coin felt jerky): switching the page into bonus mode restyles the
  // whole page (~3,500 elements, 62 ms at budget-phone speed). It used to happen in the middle of the coins' grow and the
  // reels' drop; it now happens here, while nothing is moving, and the grow starts on the next frame.
  setFeatureScene(true); meter.build(lives); meter.set(lives); info(S.superBonus ? 'SUPER HOLD & WIN' : 'HOLD & WIN');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  reels.clearWins();
  // v0.67 (checklist 1): after a natural trigger the burst already fired on the coin's landing
  if (S.triggerFired) { S.triggerFired = false; skullRelease(); } else { audio.play('trigger'); skullRelease(); skullCheer(); }
  
  // v0.49: the coins are handed to the bonus board BEFORE they grow (same art, same size, same place), so the enlargement
  // happens in the unclipped board layer above the surround: each coin grows whole, over the borders and the symbols
  // around it, instead of being cut off by the reel window.
  const handK = (coin, slot) => { const from = reels.cellEl(coin.cell)?.querySelector('.sym-svg')?.offsetWidth, to = slot?.coin.querySelector('.sym-svg')?.offsetWidth;
    return from && to ? from / to : 1; };
  board.enter(coins, { coinScale: (coin, slot) => +handK(coin, slot).toFixed(4) });
  // v0.75 (client, 1 Nov: a flicker as the last coin lands on a bonus buy): the board's copies are new images - on a phone
  // they can paint blank for a frame until decoded. The reel coins stay until the copies are ready (at most ~150 ms).
  const imgs = cells.flatMap(c => [...(board.coinEl(c)?.querySelectorAll('img') || [])]);
  await Promise.race([Promise.all(imgs.map(im => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()))), wait(150)]);
  await new Promise(r => requestAnimationFrame(() => r()));
  for (const c of cells) { const rc = reels.cellEl(c); if (rc) rc.style.visibility = 'hidden'; }
  for (const c of cells) {
    const el = board.coinEl(c); if (!el) continue;
    const k0 = +(el.style.scale || 1), k1 = rm ? k0 : +(k0 * P.entryScale).toFixed(4);
    // checklist 4 item 7: the enlargement animates `scale` only (composited); the brightening is the overlay copy
    if (!rm) el.animate([{ scale: String(k0) }, { scale: String(+(k1 * 1.05).toFixed(4)), offset: .55 }, { scale: String(k1) }], { duration: P.entryGrow, easing: 'cubic-bezier(.3,1.25,.5,1)' })
      .finished.catch(() => {}).then(() => { el.style.scale = String(k1); });
    el.style.scale = String(k1);   // the end state (the animation above plays over it)
    hiFlash(el, [1, 1.75, 1.12], P.entryGrow, { fill: 'forwards' });
    const r = cellRect(c); fx.burst(r.cx, r.cy, { count: 22, speed: 8, size: 6 });
  }
  setTimeout(() => {   // the rest of the reel drops away during the same movement
    audio.play('morph');
    for (let c = 0; c < 10; c++) { if (coinSet.has(c)) continue;
      reels.cellEl(c)?.animate([{ translate: '0 0', scale: '1', rotate: '0deg', opacity: 1 }, { translate: '0 -14px', scale: '1.06', opacity: 1, offset: .22 }, { translate: '0 150px', scale: '.45', rotate: '10deg', opacity: 0 }],
        { duration: P.dropMs, delay: c * P.dropStagger, easing: 'cubic-bezier(.5,0,.8,.5)', fill: 'forwards' }); }
  }, P.entryGrow * 0.35);
  await wait(P.entryGrow * 0.75);
  await wait(P.entryGrow * 0.25 + P.entryHold * 0.45);
  board.revealSockets();
  requestAnimationFrame(() => { reels.show(false); for (const c of cells) { const rc = reels.cellEl(c); if (rc) rc.style.visibility = ''; } });
  await wait(P.entryHold * 0.55);
  await board.settleCoins(cells, rm ? 1 : P.entrySettle);
}
/** s01C: first entry explains the rules with a continue action; later entries get one short line in the bar. */
async function holdAndWinIntro(lives) {
  const prefs = loadPrefs();
  if (prefs.seenHW) { info(`${lives} SPINS LEFT`); await wait(PRES.repeatEntry); return; }   // checklist 16: repeat entry 600-900
  const card = document.createElement('div'); card.className = 'hw-intro'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Hold and Win rules');
  card.innerHTML = `<div class="hw-card"><h2>HOLD &amp; WIN</h2><ul>
    <li>Coins stay locked in place.</li>
    <li>You have <b>${lives} spins</b>. Every new coin resets them to ${lives}.</li>
    <li>Multipliers multiply the coin in their position, jackpots too. When a coin lands on a multiplier, the skull steps it up on the next spin.</li>
    <li>The skull can <b>double a jackpot</b> for the rest of the bonus.</li>
    <li>Fill all 10 positions for a <b>Full House</b>: the whole win is multiplied.</li>
    <li>When the spins run out, every coin is collected.</li></ul>
    <button class="btn-primary hw-go" type="button">CONTINUE</button><small>These rules are also in the menu under Paytable &amp; rules.</small></div>`;
  stage.append(card);
  card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
  const btn = card.querySelector('.hw-go'); btn.focus({ preventScroll: true });
  await new Promise(res => {
    const go = e => { e?.stopPropagation(); res(); };
    btn.addEventListener('click', go, { once: true });
    card.addEventListener('click', e => { if (e.target === card) go(e); });
    if (S.auto.running) setTimeout(go, 6000);   // autoplay: readable time, then continue on its own
  });
  savePrefsPatch({ seenHW: true });
  await card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 }).finished.catch(() => {}); card.remove();
}
function savePrefsPatch(patch) { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...patch })); } catch { /* storage blocked */ } }

// ---------- brief s08 / s09: multiplier awards from the logo ----------
const MULT_COL = { 2: ['#ff5a3a', '#ff9a7a', '#c3100e'], 3: ['#3ab0ff', '#9fd8ff', '#135fd1'], 5: ['#c07bff', '#e4c4ff', '#6a16c4'], 10: ['#ffd35a', '#fff4b8', '#e07a00'],
  20: ['#3fe070', '#c8ffd8', '#0f8a3a'], 50: ['#ff3ab0', '#ffc4ea', '#a3106a'], 100: ['#ffffff', '#fff4b8', '#ffd35a'] };
/** One logo build-up, then each frame fired onto its position in turn (grouped awards share one build-up). */
/**
 * Checklist 13: shake -> spit one multiplier -> shake again -> spit the next, for every award. Each release (travel,
 * frame, badge, recognition) completes before the next shake starts. Award count, values, targets and order are the
 * round record's; only the presentation is sequenced. The sharp logo vibration is logoActivate's, unchanged.
 */
// v0.56 (client): the Hold & Win bar never announces what the skull is about to do (no spoilers); after each action it
// says what happened in a few words (×2 MULTIPLIER, MULTIPLIER UP · ×3, MINI DOUBLED, FULL HOUSE ×3, SKULL POT, COLLECTED)
async function multiplierEvent(frames, { opening = false, build = null } = {}) {
  if (!frames?.length) return;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const act = await logoActivate({ build: build ?? (i ? PRES.multReshake : PRES.logoBuild) });
    const rc = cellRect(f.cell);
    await act.release(rc.cx, rc.cy, { ms: 460 });
    board.addFrame(f.cell, f.mult); frameSound(); info(`×${f.mult} MULTIPLIER`);
    fx.burst(rc.cx, rc.cy, { count: 40, speed: 10, size: 7, colors: MULT_COL[f.mult] || MULT_COL[2] });
    await act.done();
    await sw(Math.max(0, PRES.frameEvent - PRES.logoRecoil));   // recognition: the badge lands in its corner before anything else moves
  }
  await sw(420);   // the last badge has fully settled before play resumes
}
/** v0.62f (client): one full-length shake, then every grid multiplier fired in turn from the mouth (no re-shake between
 *  them); each badge lands and is recognised before the next leaves. A tap fires the rest together. */
async function multiplierRun(frames) {
  const act = await logoActivate({ build: PRES.logoBuild });
  for (let i = 0; i < frames.length; i++) {
    if (S.skip) {   // tapped: the rest leave together
      await Promise.all(frames.slice(i).map((f, k) => wait(k * 35).then(async () => { const rc = cellRect(f.cell); await act.release(rc.cx, rc.cy, { ms: 300, quiet: k > 0 });
        board.addFrame(f.cell, f.mult, { fast: true }); frameSound(); fx.burst(rc.cx, rc.cy, { count: 26, speed: 9, size: 6, colors: MULT_COL[f.mult] || MULT_COL[2] }); })));
      break;
    }
    const f = frames[i], rc = cellRect(f.cell);
    await act.release(rc.cx, rc.cy, { ms: 460 });
    board.addFrame(f.cell, f.mult); frameSound(); info(`×${f.mult} MULTIPLIER`);
    fx.burst(rc.cx, rc.cy, { count: 40, speed: 10, size: 7, colors: MULT_COL[f.mult] || MULT_COL[2] });
    if (i < frames.length - 1) await sw(PRES.multGap);   // the badge lands before the next one leaves
  }
  await act.done();
  await sw(420);
}
// ---------- 0.3.0 the skull as host: actions from the round record ----------
/** Full House multiplier chip over the board (standard ×2, Super from ×3 climbing). */
const fhChip = {
  show(mult) { let c = $('#fhChip'); if (!c) { c = document.createElement('div'); c.id = 'fhChip'; stage.append(c); }   // beside the spins meter, clear of the reels
    c.innerHTML = `<small>FULL HOUSE</small><b>×${mult}</b>`; c.classList.add('show'); },
  set(mult) { const c = $('#fhChip'); if (!c) return; c.querySelector('b').textContent = `×${mult}`;
    c.animate([{ scale: '1', filter: 'brightness(1)' }, { scale: '1.5', filter: 'brightness(2)', offset: .3 }, { scale: '1', filter: 'brightness(1)' }], { duration: 640, easing: 'cubic-bezier(.3,1.5,.5,1)' }); },
  hide() { const c = $('#fhChip'); c?.classList.remove('show'); if (c) delete c.dataset.near; },
  /** v0.67 (checklist 6): 2 positions left - the chip throbs and glows; 1 left - harder, faster, brighter */
  near(left) { const c = $('#fhChip'); if (!c) return; if (left === 1 || left === 2) c.dataset.near = String(left); else delete c.dataset.near; },
  /** v0.73 (checklist 4): the spins have run out - the throb settles back to rest in about 0.2 s and stays still */
  calm() { const c = $('#fhChip'); if (!c || !c.dataset.near) return; const cs = getComputedStyle(c), from = { scale: cs.scale === 'none' ? '1' : cs.scale, filter: cs.filter, boxShadow: cs.boxShadow };
    delete c.dataset.near; c.animate([from, { scale: '1', filter: 'brightness(1)', boxShadow: getComputedStyle(c).boxShadow }], { duration: 200, easing: 'ease-out' }); },
};
const actBuild = () => (S.superBonus ? 620 : 900);
/** The skull grows a jackpot plaque: the spark flies to the plaque and its live value steps up. */
async function growJackpot(a) {
  const pq = document.querySelector(`.jackpots .jp-${a.jp}`);
  const act = await logoActivate({ build: actBuild() });
  // v0.74 (D7): aimed at the plaque measured on screen, in the top layer's own coordinates (in the wide layout the top
  // layer is offset from the game; game units here sent the shot off the left edge)
  const to = pq ? fxPoint(fxTop, pq) : mouthIn(fxTop);
  await act.release(to.x, to.y, { ms: 520, bend: 110, top: true });   // v0.55: from the skull's mouth (down and out, then up to the plaque)
  S.jpLive = { ...(S.jpLive ?? S.cfg.jackpotsBU), [a.jp]: a.to }; updateHud(); info(`${a.jp} DOUBLED`);
  pq?.classList.remove('jp-grow'); void pq?.offsetWidth; pq?.classList.add('jp-grow'); setTimeout(() => pq?.classList.remove('jp-grow'), 1200);
  fxTop.burst(to.x, to.y, { count: 30, speed: 8, size: 6, colors: [JP_HUE[a.jp] || '#ffd35a', '#ffd35a', '#fff4b8'] });
  audio.play('jackpot');
  await act.done(); await sw(380);
}
async function stepFullHouse(a) {
  const act = await logoActivate({ build: actBuild() });
  const chip = $('#fhChip'), to = chip ? fxPoint(fx, chip) : { x: 360, y: 300 };
  await act.release(to.x, to.y, { ms: 420 });
  fhChip.set(a.to); audio.play('jackpot'); info(`FULL HOUSE ×${a.to}`);   // v0.62m (client): the jackpot-increase sound, no voice
  hudBurst(to, { count: 34, speed: 9, size: 6, colors: ['#ffd35a', '#fff4b8', '#ff8a1f'] });
  await act.done(); await sw(380);
}
async function levelFrame(cell, from, to, { bySkull = false, coin = false } = {}) {
  const rc = cellRect(cell);
  let act = null;
  if (bySkull) { act = await logoActivate({ build: actBuild() }); await act.release(rc.cx, rc.cy, { ms: 420 }); }
  board.setFrameMult(cell, to); frameSound(); info(`MULTIPLIER UP · ×${to}`);
  fx.burst(rc.cx, rc.cy, { count: 36, speed: 10, size: 7, colors: MULT_COL[to] || MULT_COL[10] });
  // v0.55 (client): no floating "×2 → ×3" text; the corner badge changing (and the burst) says it
  if (act) await act.done();
  await sw(bySkull ? 380 : 520);
}
/** The skull collects the grid: every coin's current value streams into his mouth and joins the skull pot. */
async function skullCollect(a, b) {
  const k = mouthIn(fxTop), kg = skullXY();
  jawLater(2, 200); jawLater(3, 380);
  await Promise.all(a.cells.map((cell, i) => wait(i * 60).then(() => { const rc = cellRect(cell); board.emphasise?.(cell, 500);
    const a0 = topPt(rc.cx, rc.cy); return fxTop.ribbon(a0.x, a0.y, k.x, k.y, { ms: 520, bend: -120, width: 13 }); })));
  skullFlare(); skullChomp(true); audio.play('eat'); audio.play('bigJackpot');
  S.skullPot = (S.skullPot || 0) + a.value; info(`SKULL POT ${fmt(buToMinor(S.skullPot, b))}`);
  floatText(fmt(buToMinor(a.value, b)), kg.x, kg.y + 120, { size: 58, dy: -30, ms: 1400 });
  await sw(900);
}
/**
 * 0.4.0 collector coin: it lands showing COLLECT; the logo skull draws every coin's current value (frames and doubled
 * jackpots included, an earlier collector's total included) into himself and spits the total onto the collector,
 * which keeps it and pays it again at the end.
 */
async function collectorEvent(c, b) {
  audio.play('tierUp');
  const act = await logoActivate({ build: actBuild() });
  const k = mouthIn(fxTop);
  jawLater(2, 200); jawLater(3, 380);
  await Promise.all((c.from || []).map((cell, i) => wait(i * 70).then(() => { const rc = cellRect(cell); board.emphasise?.(cell, 520);
    const a0 = topPt(rc.cx, rc.cy); return fxTop.ribbon(a0.x, a0.y, k.x, k.y, { ms: 480, bend: -120, width: 12 }); })));
  skullFlare(); skullChomp(true); audio.play('eat');
  const rc = cellRect(c.cell);
  await act.release(rc.cx, rc.cy, { ms: 520 });
  const lab = board.coinEl(c.cell)?.querySelector('.coin-label');
  if (lab) { const t = fmtNum(buToMinor(c.v, b)); lab.textContent = t; lab.classList.remove('ccol-wait'); lab.style.setProperty('--n', String(t.length));
    lab.animate([{ scale: '1.8', filter: 'brightness(2.2)' }, { scale: '1', filter: 'brightness(1)' }], { duration: 420, easing: 'cubic-bezier(.3,1.5,.5,1)' }); }
  board.held.set(c.cell, { ...c, pending: false }); info(`COLLECTED ${fmt(buToMinor(c.v, b))}`);
  fx.burst(rc.cx, rc.cy, { count: 50, speed: 11, size: 7, colors: ['#ffb21f', '#ff6a00', '#fff4b8'] });
  audio.play('bigJackpot');
  floatText(fmt(buToMinor(c.v, b)), rc.cx, rc.cy - 24, { size: 50, dy: -40, ms: 1300 });
  await act.done(); await wait(700);
}
/** v0.62m (client): the multiplier sound - "¡Órale!" only once per skull turn (once for the opening allocation, once for
 *  any later turn that awards multipliers); every other multiplier in the turn gets the sound without the voice. */
function frameSound() { audio.play(S.voiceTurn ? 'frameQuiet' : 'frame'); S.voiceTurn = true; }
async function runSkullActions(actions, b, { opening = false } = {}) {
  S.voiceTurn = false;
  // v0.62e (client): one skull turn. A tap during it finishes the current action quickly, then everything he still had
  // to do this turn happens at once (skullVolley). Each turn needs its own tap (a tap that skipped the spin does not
  // carry over).
  S.skip = false;
  const list = actions || [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (S.skip) { await skullVolley(list.slice(i), b); return; }
    // v0.62f (client): at the opening the skull shakes ONCE (full length) and fires all the grid multipliers one after
    // another; a doubled jackpot or the Full House step gets its own shake as before
    if (a.type === 'frame' && opening) { let j = i; while (j + 1 < list.length && list[j + 1].type === 'frame') j++;
      await multiplierRun(list.slice(i, j + 1)); i = j; continue; }
    if (a.type === 'frame') await multiplierEvent([a]);
    else if (a.type === 'jackpot') await growJackpot(a);
    else if (a.type === 'fullHouse') await stepFullHouse(a);
    else if (a.type === 'level') await levelFrame(a.cell, a.from, a.to, { bySkull: true, coin: !!a.coin });
    else if (a.type === 'collect') await skullCollect(a, b);
  }
}

/**
 * v0.62e (client): skipped skull turn - one quick shake, then every remaining award leaves his mouth together and lands
 * in its place (multipliers, step-ups, jackpot doubles, Full House, skull pot), in the turn's order. Same results.
 */
async function skullVolley(list, b) {
  if (!list.length) return;
  const act = await logoActivate({ build: 160 }); audio.play('fireball');
  const fhs = list.filter(a => a.type === 'fullHouse'), lastFh = fhs[fhs.length - 1];
  const k = mouthIn(fxTop);
  await Promise.all(list.map((a, i) => wait(i * 35).then(async () => {
    if (a.type === 'frame' || a.type === 'level') { const rc = cellRect(a.cell); await act.release(rc.cx, rc.cy, { ms: 300, quiet: true });
      if (a.type === 'frame') board.addFrame(a.cell, a.mult, { fast: true }); else board.setFrameMult(a.cell, a.to);
      const m = a.type === 'frame' ? a.mult : a.to; fx.burst(rc.cx, rc.cy, { count: 26, speed: 9, size: 6, colors: MULT_COL[m] || MULT_COL[2] }); frameSound(); }
    else if (a.type === 'jackpot') { const pq = document.querySelector(`.jackpots .jp-${a.jp}`), to = pq ? fxPoint(fxTop, pq) : mouthIn(fxTop);   // v0.74 (D7)
      await act.release(to.x, to.y, { ms: 320, bend: 110, top: true, quiet: true });
      S.jpLive = { ...(S.jpLive ?? S.cfg.jackpotsBU), [a.jp]: a.to }; updateHud();
      pq?.classList.remove('jp-grow'); void pq?.offsetWidth; pq?.classList.add('jp-grow'); setTimeout(() => pq?.classList.remove('jp-grow'), 1200);
      fxTop.burst(to.x, to.y, { count: 22, speed: 7, size: 5, colors: [JP_HUE[a.jp] || '#ffd35a', '#ffd35a', '#fff4b8'] }); audio.play('jackpot'); }
    else if (a.type === 'fullHouse') { if (a !== lastFh) return;   // several steps: one flight, the chip shows the final step
      const chip = $('#fhChip'), to = chip ? fxPoint(fx, chip) : { x: 360, y: 300 }; await act.release(to.x, to.y, { ms: 300, quiet: true });
      fhChip.set(a.to); audio.play('jackpot'); hudBurst(to, { count: 24, speed: 8, size: 6, colors: ['#ffd35a', '#fff4b8', '#ff8a1f'] }); }
    else if (a.type === 'collect') { await Promise.all(a.cells.map(cell => { const rc = cellRect(cell), a0 = topPt(rc.cx, rc.cy); return fxTop.ribbon(a0.x, a0.y, k.x, k.y, { ms: 280, bend: -120, width: 12 }); }));
      skullChomp(true); audio.play('eat'); S.skullPot = (S.skullPot || 0) + a.value; }
  })));
  await act.done();
  await wait(260);   // everything has landed before play resumes
}
/** Checklist 13: the occasional cosmetic smoke-only tease — the logo strains as if preparing an award, a small puff,
 *  then idle. Nothing is awarded; scheduled apart from the round record and never in place of real content. */
async function smokeTease() {
  const act = await logoActivate({ build: PRES.smokeBuild });
  await act.puff();
}

// ---------- checklist 17 / 18 / 19: Coin Save & Full House, pre-collection, connected collection ----------
/** 19: the reel grid, its surround and the win bar jolt together on an impact; background, logo, spins meter, secured
 *  total and footer stay still. A new impact replaces the previous one (offsets never accumulate). */
function assemblyShake(k = 1) {
  if (reducedMotion()) return;
  const px = PRES.shakePx * k / (ASM.g || 1), ms = Math.round(PRES.shakeMs * (k > 1 ? 1.2 : 1));
  const kf = p => [{ translate: '0 0' }, { translate: `0 ${p.toFixed(2)}px`, offset: .2 }, { translate: `0 ${(-p * .35).toFixed(2)}px`, offset: .5 }, { translate: `0 ${(p * .12).toFixed(2)}px`, offset: .76 }, { translate: '0 0' }];
  for (const [el, p] of [[$('#board'), px], [$('#featureHud .fh-mid'), px / ASM.A], [$('#wbFx'), px / ASM.A]]) {
    if (!el) continue; el.__shake?.cancel();
    el.__shake = el.animate(kf(p), { duration: ms, easing: 'cubic-bezier(.2,.6,.3,1)' });
  }
}
/** Game-space centre of an element (the coordinate space of the fx canvas). */
function gamePoint(el) {
  const g = $('#game').getBoundingClientRect(), k = g.width / 720, r = el.getBoundingClientRect();
  return { x: (r.left + r.width / 2 - g.left) / k, y: (r.top + r.height / 2 - g.top) / k };
}
/**
 * 16: at the existing application time (collection), on the coin itself: the frame lights and the base value is
 * highlighted -> the ×N leaves the badge onto the coin -> the payable value replaces it (jackpot art keeps its label and
 * shows the payable amount beneath). Never credited here; the amount is added once, when it reaches the bar.
 */
async function explainMultiplier(c, valMinor) {
  const coinEl = board.coinEl(c.cell); const lab = coinEl?.querySelector('.coin-label'); const fr = board.frameEl(c.cell), badge = fr?.querySelector('.mp-badge');
  const ring = board.ringEl(c.cell), rc = cellRect(c.cell), M = PRES.multExplain;
  ring?.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(2)', offset: .3 }, { filter: 'brightness(1.3)' }], { duration: M, easing: 'ease-out' });
  lab?.animate([{ scale: '1' }, { scale: '1.25', offset: .5 }, { scale: '1' }], { duration: M * .35, easing: 'ease-in-out' });
  await wait(M * .3);
  // client 3 Nov 08:16: the multiplier's own award graphic (not white text) - the corner badge comes out big into the middle
  // of the square, in front of the coin, holds, then goes back to its corner; the coin's value then changes
  const BIG = 1050;
  if (badge) { const W = fr.offsetWidth || 222, Hh = fr.offsetHeight || 222, bw = badge.offsetWidth || 90, bh = badge.offsetHeight || 60;
    const dx = W / 2 - (badge.offsetLeft + bw / 2), dy = Hh / 2 - (badge.offsetTop + bh / 2), at = sc => `translate(${dx}px, ${dy}px) scale(${sc})`;
    fr.style.zIndex = 5;
    badge.animate([{ transform: 'none' }, { transform: at(2.5), filter: 'brightness(1.6)', offset: .24 }, { transform: at(2.3), filter: 'brightness(1)', offset: .34 },
      { transform: at(2.3), offset: .72 }, { transform: 'none' }], { duration: BIG, easing: 'cubic-bezier(.4,0,.2,1)' }).finished.catch(() => {}).then(() => { fr.style.zIndex = ''; }); }
  else floatText(`×${c.mult}`, rc.cx, rc.cy - 30, { size: 64, dy: -20, ms: 560 });
  audio.play('frameQuiet');   // v0.62m (client): no voice during the final count
  await wait(badge ? BIG * .8 : M * .35);
  if (c.jp) revealJpValue(c, valMinor);
  else if (lab) { lab.textContent = fmtNum(valMinor); lab.style.setProperty('--n', String(fmtNum(valMinor).length)); lab.classList.add('multiplied');
    lab.animate([{ transform: 'translate(-50%, -50%) scale(1.7)', filter: 'brightness(2)' }, { transform: 'translate(-50%, -50%) scale(1)', filter: 'brightness(1)' }], { duration: 300, easing: 'cubic-bezier(.3,1.5,.5,1)' }); }
  await wait(M * .35);
}
/** client 3 Nov 08:16: a jackpot coin's name (MINI / MINOR / MAJOR / GRAND) turns into the amount it pays, on the coin itself
 *  (Emerald: the coin's baked name is swapped for the same coin with a blank band, and the amount is written on the band) */
function revealJpValue(c, valMinor) {
  const coinEl = board.coinEl(c.cell), lab = coinEl?.querySelector('.coin-label'); if (!lab || lab.dataset.jpv) return; lab.dataset.jpv = '1';
  if (typeof EF !== "undefined" && EF.on) { const im = coinEl.querySelector('.sym-svg img'); if (im) im.src = im.src.replace(/sym_coin_(mini|minor|major|grand)\.webp/, 'sym_coin_$1_blank.webp');
    lab.classList.remove('cjp', `cjp-${c.jp}`); }
  const t = fmtNum(valMinor); lab.textContent = t; lab.style.setProperty('--n', String(t.length)); lab.classList.add('jp-val');
  lab.animate([{ transform: 'translate(-50%, -50%) scale(1.7)', filter: 'brightness(2)' }, { transform: 'translate(-50%, -50%) scale(1)', filter: 'brightness(1)' }], { duration: 320, easing: 'cubic-bezier(.3,1.5,.5,1)' });
}
/** 19: a subtotal count that starts at an impact and finishes before the next arrival (never compounds). */
let subAnim = null;
function countSub(from, to, ms) {
  if (subAnim) { cancelAnimationFrame(subAnim.raf); subAnim = null; }
  const t0 = performance.now(), st = { raf: 0 };
  const step = now => { const p = Math.max(0, Math.min(1, (now - t0) / ms)), v = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 2)));
    infoTotal(v); if (p < 1) st.raf = requestAnimationFrame(step); else subAnim = null; };
  subAnim = st; st.raf = requestAnimationFrame(step);
}
/**
 * 19: the arrival — exactly once per contribution: the subtotal takes the amount, the receiving figure kicks to ~1.4x
 * (peak ~85 ms, settles ~250 ms), gold light flashes and splashes behind the digits (rays + sparks, no coin shapes, the
 * bar border catches it), and the assembly jolts. Overlapping pulses restart from rest, so nothing accumulates.
 */
function collectImpact(v, last, strong = false) {
  if (!v) return;
  const k = last ? PRES.shakeFinalK : 1, S1 = PRES.pulseScale * (last ? PRES.pulseLastK : 1), dur = PRES.pulsePeak + PRES.pulseSettle;
  // checklist 4 items 2 + 7: a new pulse blends from wherever the previous one is (one owner, no snap back to 1 first,
  // no accumulation: the peak is always the same absolute size)
  const cur = getComputedStyle(v).scale, from = cur && cur !== 'none' ? cur : '1';
  v.getAnimations().forEach(a => a.cancel());
  if (!reducedMotion()) v.animate([{ scale: from }, { scale: S1.toFixed(3), offset: PRES.pulsePeak / dur, easing: 'cubic-bezier(.25,.6,.35,1)' }, { scale: '1' }], { duration: dur, easing: 'cubic-bezier(.2,.9,.3,1.25)' });
  const bar = $('#featureHud .fh-mid'); bar.classList.remove('hit'); void bar.offsetWidth; bar.classList.add('hit');
  barSplash(last || strong ? 1.5 : 1);
  assemblyShake(k);
}
/** Gold flash + rays + sparks behind the win-bar digits (DOM, under the text layer; attached to the bar). */
function barSplash(power = 1) {
  let host = $('#wbFx');
  if (!host) { winBarFX.ensure(); host = $('#wbFx'); }
  const rm = reducedMotion();
  host.classList.remove('go', 'big'); void host.offsetWidth; host.classList.add('go'); if (power > 1.2) host.classList.add('big');
  if (rm) return;
  const sp = host.querySelector('.wb-sparks'); const n = Math.round(12 * power);
  for (let i = 0; i < n; i++) {
    const d = document.createElement('i'); d.style.left = `${50 + (Math.random() - .5) * 34}%`; sp.append(d);
    const a = -Math.PI / 2 + (Math.random() - .5) * 2.2, dist = (80 + Math.random() * 110) * power, ms = 380 + Math.random() * 260;
    d.animate([{ translate: '0 0', scale: '.7', opacity: 0 }, { translate: `${Math.cos(a) * dist * .35}px ${Math.sin(a) * dist * .35}px`, scale: '1', opacity: 1, offset: .2 }, { translate: `${Math.cos(a) * dist}px ${Math.sin(a) * dist}px`, scale: '.3', opacity: 0 }],
      { duration: ms, easing: 'cubic-bezier(.15,.7,.35,1)' }).finished.catch(() => {}).then(() => d.remove());
  }
}
async function collectAll(F, b) {
  pushOut(true);   // v0.53: the camera all the way back out for the collect
  board.snap();   // v0.53 (item 19)
  const occ = (F.potsMode ? F.collect.map(c => c.cell) : [...board.held.keys()]).sort((x, y) => x - y);   // progressive: down each column, left, centre, right (pots: what the pots left)
  info('COLLECTING');
  // checklist 4 item 2: the transfer is the only thing moving - the frame's light sweep, aura, glints and embers fade
  // out, and any Full House confetti still falling clears, so nothing washes over the values
  document.body.classList.add('collecting'); fx.fade(18);
  // 18: the entry's enlargement-and-drop, replayed: every coin enlarges together with its ordinary glow, then each drops
  // back to rest in turn; its strong pre-collection glow lights as it settles. All of it finishes before values fly.
  if (!S.skip) await board.prepareCollect(occ, { grow: PRES.prepGrow, scale: PRES.entryScale, hold: PRES.prepHold, drop: PRES.prepDrop, stagger: PRES.prepStagger,
    onSettle: (c, i) => audio.play('countTick', { i }) });
  await wait(180);
  // 19: the win bar becomes the receiver — a dominant subtotal from zero, a smaller TOTAL WIN label
  const exact = buToMinor(F.collect.reduce((a, c) => a + c.win, 0), b);
  infoTotal.max = exact; let sub = 0; const v = infoTotal(0);   // sized once for the longest amount it will show
  let prevArrival = 0, arriving = Promise.resolve(), given = 0; const to0 = fxPoint(fx, v);   // v0.74: measured on screen in the board canvas's own coordinates (exact at any zoom)
  for (let i = 0; i < F.collect.length; i++) {
    if (S.skip) {   // v0.60 (client): skipped - the rest still fly in (swooshes and all) but together and fast, then the total
      await arriving.catch?.(() => {});
      const rest = F.collect.slice(i), fast = 240, stag = 45;
      await Promise.all(rest.map((cc, j) => wait(j * stag).then(() => { const r2 = cellRect(cc.cell); board.emphasise?.(cc.cell, 200);
        return fx.ribbon(r2.cx, r2.cy, to0.x, to0.y, { ms: fast, bend: 80, width: 15, tail: .55, accel: 'strong', sparks: .4 }).then(() => {
          audio.play('collect', { i: Math.min(6, j) }); collectImpact(v, j === rest.length - 1, false); board.collected(cc.cell); }); })));
      if (subAnim) { cancelAnimationFrame(subAnim.raf); subAnim = null; }
      countSub(sub, exact, 260); await wait(280);
      sub = exact; given = exact; infoTotal(exact); break;
    }
    const c = F.collect[i], last = i === F.collect.length - 1, rc = cellRect(c.cell);
    const valMinor = buToMinor(c.win, b), contrib = last ? exact - given : valMinor; given += contrib;
    const to = fxPoint(fx, v), dist = Math.hypot(to.x - rc.cx, to.y - rc.cy);
    const fl = Math.round(PRES.flightMin + (PRES.flightMax - PRES.flightMin) * Math.min(1, dist / 760));
    const special = c.mult > 1 || !!c.jp || !!c.col;
    if (special) {   // real jackpots and multipliers get their own recognition, after the previous impact has landed
      await arriving;
      if (c.mult > 1) await explainMultiplier(c, valMinor);
      if (c.col) { floatText('COLLECTOR', rc.cx, rc.cy - 40, { size: 40, dy: -20, ms: 800 }); audio.play('frameQuiet'); await wait(420); }
      if (c.jp) {
        revealJpValue(c, valMinor);   // client 3 Nov 08:16: the name on the coin becomes its amount
        const pq = document.querySelector(`.jackpots .jp-${c.jp}`); pq?.classList.remove('jp-hit'); void pq?.offsetWidth; pq?.classList.add('jp-hit'); setTimeout(() => pq?.classList.remove('jp-hit'), 2300);
        audio.play(c.jp === 'MAJOR' || c.jp === 'GRAND' ? 'bigJackpot' : 'jackpot'); fx.burst(rc.cx, rc.cy, { count: 40, speed: 10, size: 7, life: 60, colors: [JP_HUE[c.jp] || '#ffd35a', '#ffd35a', '#fff4b8'] });   // item 2: its own jackpot hue + gold, no unrelated colours
        // v0.49 item 34: say exactly what was won - a doubled plaque and / or a multiplier frame - so an upgraded MINOR
        // reads as the story it is ("MINOR ×2 = $100"), never as a straight MAJOR
        const face = S.cfg.jackpotsBU[c.jp], dbl = Math.round(c.v / face), parts = [];
        if (dbl > 1) parts.push(`×${dbl}`); if (c.mult > 1) parts.push(`ON ×${c.mult}`);
        const story = parts.length ? `${c.jp} ${parts.join(' ')} = ${fmt(valMinor)}` : fmt(valMinor);
        if (!S.skip) await banner('JACKPOT', parts.length ? `${c.jp} UPGRADED` : c.jp, story, PRES.jackpotMs + (parts.length ? 400 : 0), `jp-${c.jp}`);
      }
    } else if (i > 0) {   // rhythm: the next value is already travelling while the last impact's particles fade
      const at = prevArrival + (i === 1 ? PRES.gapFirst : PRES.gapRoutine) - fl - PRES.emphMs, d = at - performance.now();
      if (d > 0) await sw(d);
    }
    board.emphasise(c.cell, PRES.emphMs + 60);
    await sw(PRES.emphMs);
    prevArrival = performance.now() + fl;
    const from = sub, target = (sub += contrib);
    arriving = fx.ribbon(rc.cx, rc.cy, to.x, to.y, { ms: fl, bend: 80, width: 15, tail: .55, accel: 'strong', sparks: .4 }).then(() => {
      if (S.skip) { board.collected(c.cell); return; }   // skipped: the total is already showing
      countSub(from, target, last ? 260 : Math.min(200, PRES.gapRoutine - 70));
      audio.play('collect', { i });
      collectImpact(v, last, special);
      board.collected(c.cell);   // dims after its contribution arrives; the uncollected stay emphasised
    });
  }
  await Promise.race([arriving, new Promise(r => skipBus.addEventListener('skip', r, { once: true }))]);
  if (S.skip && subAnim) { cancelAnimationFrame(subAnim.raf); subAnim = null; }
  await sw(280); infoTotal(exact);   // the count has finished on the exact feature total
  let total = exact;
  // 0.3.0: the skull pot (Super bonus) arrives from the skull, then a Full House multiplies the whole win
  if (F.skullPot) {
    const potTo = buToMinor(F.fullHouse.before, b), k = mouthIn(fxTop), to = fxPoint(fxTop, v);
    info('SKULL POT'); infoTotal(total);
    const q = S.skip;   // skipped: same flight, much quicker
    await fxTop.ribbon(k.x, k.y, to.x, to.y, { ms: q ? 220 : 520, bend: 120, width: 18, glow: '#ff7a1a' });
    countSub(total, potTo, q ? 200 : 520); collectImpact(v, false, true); audio.play('collect', { i: 3 });
    total = potTo; await (q ? wait(240) : sw(700));
  }
  if (F.fullHouse?.applied && F.fullHouse.mult > 1) {
    const fin = buToMinor(F.total, b);
    const chip = $('#fhChip'); chip?.animate([{ scale: '1' }, { scale: '1.8', offset: .4 }, { scale: '1' }], { duration: 700, easing: 'cubic-bezier(.3,1.5,.5,1)' });
    audio.play('fullHouse');
    const q2 = S.skip;
    await banner('FULL HOUSE', `×${F.fullHouse.mult}`, 'THE WHOLE WIN IS MULTIPLIED', q2 ? 450 : 1300);
    infoTotal.max = fin; countSub(total, fin, q2 ? 350 : 1200); collectImpact(v, true, true);
    fx.burst(360, 600, { count: 80, speed: 13, size: 7, life: 60, colors: ['#ffd35a', '#fff4b8', '#ffb21f'] });
    await (q2 ? wait(400) : sw(1400)); if (subAnim) { cancelAnimationFrame(subAnim.raf); subAnim = null; } total = fin; infoTotal(total);
  }
  document.body.classList.remove('collecting');
  return buToMinor(F.total, b);
}

async function runFeature(F, rec, bought) {
  const b = rec.bet;
  S.inFeature = true;
  S.superBonus = !!F.super; S.skullPot = 0;
  const LIVES = F.lives ?? S.cfg.lives ?? LIVES_DEFAULT;
  board.haloCycle = PRES.haloCycle; S.andaleSaid = false;
  S.jpLive = { ...S.cfg.jackpotsBU };
  document.body.classList.toggle('super-bonus', S.superBonus);
  const fromMeter = !!rec.round?.meter?.superStart;   // v0.64 ?super=meter: this Super is the meter's
  if (fromMeter) { S.meterState = { lit: 0, n: candles.n }; candles.render(S.meterState); candles.el?.animate([{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 900 }); }
  if (S.superBonus && !bought) {   // v0.63: a natural trigger upgraded to a Super - the skull calls it before the board opens
    flash(360); audio.play('wildWin');
    const r = cellRect(4); fx.burst(360, r.cy, { count: 70, speed: 13, size: 7, colors: ['#ff4d00', '#ffb21f', '#fff3b0', '#b06bff'] });
    floatText('SUPER!', 360, r.cy, { size: 96, dy: -70, ms: 1300 });
    plaque('SUPER UPGRADE!');
    await wait(T(900));
  } else if (S.superBonus) plaque('SUPER HOLD & WIN!');
  if (S.superBonus) document.body.classList.add('rays-wait');   // v0.62f (client): the Super's turning rays come in WITH its title box
  // v0.67 (checklist 5): a standard bonus's 4th life is awarded by the skull after the opening awards - the bonus opens
  // with the usual 3, then he sprays the 4th onto the spins row
  const fourth = !F.super && LIVES > LIVES_DEFAULT, SHOWN = fourth ? LIVES - 1 : LIVES;
  await enterHoldAndWin(F.start, SHOWN);
  if (S.superBonus) {
    document.body.classList.remove('rays-wait');
    await banner(bought ? 'SUPER BUY' : fromMeter ? 'SUPER METER' : 'SUPER UPGRADE', 'SUPER HOLD & WIN', '', 1900, 'super'); }   // v0.58 (client): no description line
  else await holdAndWinIntro(SHOWN);
  await featureZoom(true);   // v0.50: the camera eases in over the hidden Buy row's space
  fhChip.show(F.potsMode ? F.fullHouse?.mult ?? 2 : S.cfg.fullHouseMult ?? 2);   // a Super starts at the standard ×2; the skull's opening step raises it (pots: fixed ×2)
  // s09A / checklist 13: initial multiplier allocation through the logo, one shake per multiplier, before the first spin
  // v0.62e (client): the opening awards are one skull turn, so a tap fires all of them together
  if (F.potsMode) await potsOpening(F, b);   // pot collectors: every multiplier (and jackpot doubling) awarded before the first spin
  else await runSkullActions([...(F.openingFrames || []).map(f => ({ type: 'frame', ...f })), ...(F.openingJackpot ? [{ type: 'jackpot', ...F.openingJackpot }] : []),
    ...(S.superBonus ? [{ type: 'fullHouse', from: S.cfg.fullHouseMult ?? 2, to: S.cfg.superFullHouseStart ?? 3 }] : [])], b, { opening: true });
  if (fourth) await awardLife(LIVES);
  let lives = LIVES;
  spinsUI(lives);
  let smokeCool = 1;   // checklist 13: no smoke-only tease on the first respin; cooldown after one
  // v0.58 (client): the last hole's "coin tease" (a coin starts to drop, then snaps back or drops in) is rationed so it
  // keeps its meaning: a real landing on the last hole is nearly always teased; a tease that snaps back there happens on
  // at most about a third of last-hole respins, never two respins running, and at most twice per bonus
  const lastHole = { fails: 0, prevFail: false };
  let superUsed = false;   // v0.62l: the super tease at most once per bonus
  let peekPrev = 0;   // v0.70 (checklist 4): peeks on the previous two-holes respin
  for (let ri = 0; ri < F.respins.length; ri++) {
    const rs = F.respins[ri];
    const hurried = S.hurry; S.hurry = false;   // v0.62e: the player tapped during the last respin - no cosmetic puff now
    S.skip = false;
    const pre = F.super ? (rs.actions || []).filter(a => a.coin) : (rs.actions || []);   // a coin's step-up comes first; Super skull acts after the landing
    if (pre.length) { await runSkullActions(pre, b); smokeCool = Math.max(smokeCool, 1); }
    else if (smokeCool <= 0 && !hurried && !reducedMotion() && Math.random() < PRES.smokeChance) { await smokeTease(); smokeCool = PRES.smokeCooldown; }
    else smokeCool--;
    S.skip = false;   // v0.62f (client): a tap that skipped the skull's turn (or the puff) does not also skip this spin and its teases
    board.snap();   // v0.53 (item 19): every held coin at its exact place and size before the respin
    // 15: a spin is consumed as it starts — the text and the right-hand marker change together
    lives--;
    const empties = board.empties();
    fhChip.near(empties.length);   // v0.67 (checklist 6)
    const tension = empties.length <= 2;
    // v0.62e (client): only the LAST hole has the long spin; with two holes left the effects (sun, flames, push-in,
    // sound) all run but the spin is the normal length
    const long = empties.length === 1;
    const twoGap = empties.length === 2 ? (cellPos(empties[0])[0] !== cellPos(empties[1])[0] ? 315 : 60) : 0;
    // v0.68 (checklist 8): the tension escalates - two holes: flames, sound, peeks, normal length, no zoom; one hole on an
    // earlier life: a little longer, a light zoom, a short reset; one hole on the LAST life: the full treatment
    const two = tension && !long, fullT = long && lives === 0, lightT = long && lives > 0;
    const lk = lightT ? PRES.lightK : 1;   // the lighter one-hole spin runs at this share of the full timings
    const dbl = long ? PRES.teaseApproach + PRES.teaseHold + PRES.teaseResolve + PRES.teaseRespin : 0;   // the first of the last hole's two teases
    spinsUI(lives, 'spend', { tension: tension ? empties.length : 0 });
    let heart = null;
    audio.play('respinStart');
    // v0.49 item 35: the bonus's first respin launches with a fast flicker that slows to the normal cadence
    if (ri === 0 && !reducedMotion()) { board.startMotion(empties, { spinUp: 800 }); audio.play('spinStart'); } else board.startMotion(empties);
    // 14: near completion — the camera push-in and the shared perimeter energy round each empty cell
    let riser = null;
    if (tension) { const total = long ? Math.round((PRES.tenseSpin + PRES.tenseLast) * lk) + dbl + PRES.teaseApproach + PRES.teaseHold + 120 : PRES.peekSpin + PRES.peekTotal + 300;   // the respin's whole build-up, peaking at the reveal (v0.67: incl. the double try)
      heart = audio.loop('heartbeat'); if (!two) pushIn(empties, total, (fullT ? PRES.zoomOne : PRES.zoomLight) / (ASM.push || 1.09), 'build'); riser = audio.loop('anticipation'); raysSpeed(total);   /* v0.62 (client): the base game's near-miss sound, not the riser */ board.tensionOn(empties, total); if (!S.andaleSaid) { S.andaleSaid = true; audio.play('andale'); } }   // v0.39: once per feature
    await sw(long ? Math.round(PRES.tenseSpin * lk) : two ? PRES.peekSpin : 945);   // v0.68: two holes - normal length, then the peeks
    // v0.68 (checklist 9): two holes left - both holes peek, 2-3 times each, alternating, never starting together, with
    // uneven gaps, so the eye is pulled from one hole to the other; then each hole plays out its real result
    // v0.70 (checklist 4): far fewer peeks, with plain spinning between them - 0, 1 or 2 per respin (most get one),
    // either hole at random (the same one can peek twice), never both at once, at least ~1 s of plain spin before a
    // peek and between two; after a respin with two peeks, the next leans to none or one. The respin's length is kept:
    // the spare time is plain spinning.
    if (two && !S.skip && !reducedMotion()) {
      const t0 = performance.now(), budget = PRES.peekTotal;
      const r = Math.random(), n = peekPrev >= 2 ? (r < .45 ? 0 : 1) : (r < .22 ? 0 : r < .78 ? 1 : 2);
      peekPrev = n;
      const peekLen = PRES.peekApproach + PRES.peekHold + PRES.peekResolve;
      let lastHole = -1;
      for (let i = 0; i < n && !S.skip; i++) {
        const left = budget - (performance.now() - t0) - peekLen * (n - i);
        if (left < 250) break;
        const gap = i === 0 ? 250 + Math.random() * Math.min(left - 250, n === 1 ? 1500 : 500) : Math.min(left, PRES.peekMinGap + Math.random() * PRES.peekJitter * 3);
        await sw(Math.round(gap));
        if (S.skip) break;
        const k = Math.random() < (lastHole < 0 ? .5 : .4) ? (lastHole < 0 ? 0 : lastHole) : (lastHole < 0 ? 1 : 1 - lastHole);
        lastHole = k; const c = empties[k];
        await board.tease(c, { land: false, approach: PRES.peekApproach, hold: PRES.peekHold, resolve: PRES.peekResolve });
        if (!S.skip) board.startMotion([c]);
      }
      const rest = budget - (performance.now() - t0);
      if (rest > 0 && !S.skip) await sw(Math.round(rest));
    }
    const landedAt = new Map(rs.landed.map(c => [c.cell, c]));
    teasesLeft = PRES.teaseMaxPerSpin;
    const lands = [];
    let prevCol = -1;
    for (let i = 0; i < empties.length; i++) {
      const c = empties[i], last = i === empties.length - 1, col = cellPos(c)[0];
      if (long) await sw(Math.round(PRES.tenseLast * lk)); else if (two) await sw(last ? 260 : 120); else if (prevCol >= 0) await sw(col !== prevCol ? 315 : 60);
      prevCol = col;
      const coin = landedAt.get(c);
      // v0.58: two holes left - teases are frequent (visual); one hole left - see lastHole above
      const solo = empties.length === 1;
      // v0.62e (client): the last hole is ALWAYS teased, twice (below); two holes left: the normal chances (normal length)
      // v0.67 (client): at the last two holes EVERY spin peeks - with two holes left the last-resolving hole gets the same
      // double try as the last hole (a peek that snaps back, the hole spins on, then the real try)
      const chance = long ? 1 : two ? 0 : (coin ? PRES.teaseChanceLand : PRES.teaseChanceEmpty);   // v0.68: two holes peek above
      const dblTry = solo;
      // with two holes, a hole that comes up empty keeps spinning until the last one resolves (both stay alive to the end)
      const hold2 = tension && !solo && !last && !coin;
      const tease = !hold2 && !S.skip && teasesLeft > 0 && Math.random() < chance;
      if (solo) { const failT = tease && !coin; lastHole.prevFail = failT; if (failT) lastHole.fails++; }
      // v0.62l (client): the occasional SUPER tease on the last hole replaces the second try - a slow creep, a long trembling
      // hang while the fire, sound and camera surge, then a slam in or a yank back. Rare and honest: about 1 in 3 of them
      // land (shown on PRES.superLand of last-hole landings and PRES.superMiss of misses), at most once per bonus.
      // v0.67 (checklist 7): EVERY Full House the reels complete arrives through the super tease (the maths always gives the
      // final coin a respin of its own); on last-hole misses it shows on PRES.superMiss of them (once per bonus), so about
      // 1 in 3 super teases lands (?st=4: 1 in 4). Coin Save fills are not super teases.
      const superT = solo && !S.skip && (!!coin || (!superUsed && (window.__superTease === 'always' || Math.random() < PRES.superMiss)));
      if (tease && dblTry && !S.skip) {   // v0.62e (client): last hole - a coin starts to drop and snaps back, the hole spins on, then the real try
        await board.tease(c, { land: false, approach: PRES.teaseApproach, hold: PRES.teaseHold, resolve: PRES.teaseResolve });
        if (!S.skip) { board.startMotion([c]); await sw(PRES.teaseRespin); }
      }
      if (tease && S.skip) board.stopMotion(c);
      else if (tease && superT) { superUsed = true; teasesLeft--;
        const hang = PRES.superHang, creep = PRES.superCreep;
        // the fire speeds up and turns orange, the near-miss sound and heartbeat speed up steadily, the music drops away and the
        // camera pushes smoothly further in - all building to the result
        board.tension.get(c)?.surge(1.6, creep + 300, creep + hang); riser?.ramp?.(1.35, (creep + hang) / 1000); heart?.ramp?.(1.7, (creep + hang) / 1000);
        audio.duck(0.15, (creep + hang) / 1000 + 0.3); pushIn([c], creep + hang, PRES.zoomSuper / (ASM.push || 1.09), true); raysSpeed(creep + hang);
        await board.tease(c, { land: !!coin, coin, approach: creep, superHold: hang });
        riser?.rate?.(1, 0.1); heart?.rate?.(1, 0.1); }
      else if (tease) { teasesLeft--; await board.tease(c, { land: !!coin, coin, approach: PRES.teaseApproach, hold: PRES.teaseHold, resolve: PRES.teaseResolve, drop: PRES.teaseDrop }); }
      else if (!hold2) board.stopMotion(c);
      if (riser && last) { if (coin) { riser.stop(0.05); pushHit(); } else riser.stop(0.25); riser = null; }   // cut into the landing hit (with a punch-in), or drop away
      if (coin && rs.pot?.cell === c) {   // pot collectors: this landing is the collector pot - a heavy slam, COLLECT on its plate
        lands.push(board.place(c, { pot: true, pending: true, v: 0 }, { drop: !tease })); audio.play('trigger'); assemblyShake(1.4);
        board.tensionOff(c); const rc = cellRect(c); fx.burst(rc.cx, rc.cy, { count: 50, speed: 11, size: 7, colors: ['#ffd35a', '#fff4b8', '#ff8a1f'] });
      } else if (coin) {
        lands.push(board.place(c, coin.col ? { ...coin, pending: true } : coin, { drop: !tease })); landImpact(c, coin);
        board.tensionOff(c);   // its energy flares out as the coin locks; the other empty keeps its own
        audio.play('coinLand', { i: board.held.size });
        const rc = cellRect(c); fx.burst(rc.cx, rc.cy, { count: 18, speed: 7, colors: ['#ffd35a', '#fff4b8', '#ffb21f'] });
      } else if (!tease && !hold2) board.knock(c);
      if (last) for (const d of empties) if (d !== c && !landedAt.has(d) && board.motion?.has(d)) { board.stopMotion(d); board.knock(d); }   // the held-back empty settles with the last
    }
    board.stopAllMotion();
    heart?.stop(0.04);
    const full = board.held.size >= 10;
    fhChip.near(full ? 0 : 10 - board.held.size);   // v0.67 (checklist 6): the step up shows as soon as a coin lands
    if (!full) board.tensionClear();   // unfilled: the energy dissipates with the push-out
    riser?.stop(0.2); raysSpeed(0);
    // v0.67 (checklist 8): a tense respin is its own cycle - hold the peak on the result, deflate ALL the way back, rest -
    // so each spin builds and falls on its own instead of blurring into one long zoom
    if (fullT && !full) { await sw(PRES.zoomHold); pushOut(true, PRES.zoomOut); }
    else if (lightT && !full) { await sw(200); pushOut(true, 450); }   // v0.68 (checklist 8): the lighter one-hole reset
    else pushOut();
    if (rs.landed.length) {
      await Promise.all(lands);
      for (const lu of rs.levelUps || []) await levelFrame(lu.cell, lu.from, lu.to);   // (0.3.0 records only; 0.4.0 step-ups come from the skull)
      for (const c of rs.landed.filter(x => x.col)) await collectorEvent(c, b);
      if (rs.pot) { info('COLLECTOR POT!'); await sw(PRES.newCoinRecog + 200); S.skip = false; await potCollectBonus(rs.pot, b); }
      await wait(PRES.newCoinRecog);   // s12: recognition inside the landing + reset, not an extra stacked pause
      lives = LIVES;
      if (!full) { spinsUI(lives, 'reset', { landed: rs.landed.length }); audio.play('lifeReset'); await sw(PRES.markerReset + 250); }
    } else {
      audio.play('deadSpin');
      if (lives > 0 && fullT) await sw(PRES.zoomOut + PRES.zoomRest);   // v0.67 (checklist 8): the deflate, then a rest
      else if (lives > 0 && lightT) await sw(450 + 400);   // v0.68: lighter reset
      else if (lives > 0 && two) await sw(450);
      else if (lives > 0) await wait(380);   // routine empty result: brisk
      else {
        // 17: zero recognised first; Coin Save is only shown when the round record has one (or its cosmetic fail)
        spinsUI(0, 'zero');
        if (!rs.rescued.length) fhChip.calm();   // v0.73 (checklist 4): the last life is gone (a failed Coin Save ends it too)
        await wait(PRES.zeroRecog);
        if (rs.rescued.length || rs.rescueFail) {
          S.skip = false;   // v0.62e: the Coin Save is its own skull turn (a tap that skipped the spin does not skip it)
          const act = await logoActivate({ build: PRES.rescueBuild });
          if (rs.rescueFail) { await act.fizzle(); await wait(PRES.fizzleSettle); }   // the smoke clears before the next presentation
          else {
            audio.play('rescue'); info('COIN SAVE!');
            for (const c of rs.rescued) {
              const rc = cellRect(c.cell);
              await act.release(rc.cx, rc.cy, { ms: S.skip ? 260 : 480 });
              await board.place(c.cell, c); landImpact(c.cell, c); audio.play('coinLand', { i: 6 });
              fx.burst(rc.cx, rc.cy, { count: 26, speed: 8, colors: ['#ffd35a', '#fff4b8', '#ffb21f'] });
              await sw(PRES.releaseGap);
            }
            await act.done();
            lives = LIVES;
            if (board.held.size < 10) { spinsUI(lives, 'reset', { save: true }); audio.play('lifeReset'); await wait(PRES.markerReset + 350); }
          }
        }
      }
    }
    // Super bonus: the skull acts after the respin resolves (more often after a dead one)
    const post = F.super ? (rs.actions || []).filter(a => !a.coin) : [];
    if (post.length) { await runSkullActions(post, b); spinsUI(lives); board.snap(); }
  }
  board.tensionClear();
  // 17 Full House: the last coin settles, all ten light, FULL HOUSE and its actual consequence (no extra prize)
  if (F.endReason === 'full') {
    await wait(PRES.fullHouseSettle);
    board.flashAll([...board.held.keys()]); audio.play('fullHouse'); fx.burst(360, 600, { count: 70, speed: 12, size: 6, life: 60, colors: ['#ffd35a', '#fff4b8', '#ffb21f'] });   // gold only (checklist 4 item 2)
    info(`FULL HOUSE ×${F.fullHouse?.mult ?? 1}`);
    await banner('ALL 10 POSITIONS FILLED', 'FULL HOUSE!', `THE WHOLE WIN PAYS ×${F.fullHouse?.mult ?? 1}`, PRES.fullHouseMs);
  }
  S.skip = false;
  if (F.finalLevels?.length) { await runSkullActions(F.finalLevels, b); }   // waiting step-ups are delivered before the collect
  // pot collectors: a bonus whose spins brought no pot gets one now, after the last spin, and it collects the grid
  if (F.endPot) { await potLandBonus(F.endPot.cell, b, { replace: !!F.endPot.replace }); S.skip = false; await potCollectBonus(F.endPot, b); }
  const featWin = await collectAll(F.potsMode ? { ...F, collect: F.collect.filter(c => !c.taken) } : F, b);
  // 19: the jolt and pulse finish, then the exact total stays readable (600-900) before the result screen
  await wait(PRES.shakeMs * PRES.shakeFinalK);
  await wait(PRES.collectRead);
  // v0.62b (client): a bonus that reaches a win level first plays the Big Win sequence (the count climbing through the
  // characters: dancer, guitarist, the pair, the pair with the altar; tap = next level), then the Total Win summary
  // v0.62e (client): a BOUGHT bonus measures its levels against the price paid (2x / 3x / 4x / 7.5x: doubled, tripled,
  // quadrupled, then LEGENDARIO!), so a level screen always means the player made money; a natural bonus keeps the bet
  const { unit, LV } = celebration(rec, bought);   // v0.69
  const bigFirst = featWin >= unit * LV[LV.length - 1][0];
  // v0.62c (client): a bonus that reaches a win level ends on its character screen (no separate Total Win page)
  const action = bigFirst ? await bigWin(featWin, unit, true, LV) : await totalWinScene(featWin, rec, bought, false);
  S.inFeature = false; S.superBonus = false; S.jpLive = null; updateHud(); fhChip.hide(); document.body.classList.remove('super-bonus', 'rays-wait');
  // v0.62h (client): from the win screen straight into the settle - the base symbols start dropping into their windows
  // at once, while the camera zooms back out (no empty grid in between); the finished bonus coins are not shown again
  document.body.classList.add('settle-pre');
  board.exit();
  setFeatureScene(false);
  reels.show(true);
  if (bought) reels.setGrid(reels.randomGrid().map(s => (s === 'C' ? 'L1' : s)));
  else reels.setGrid(reels.current, [...(reels.currentCoins?.values() ?? [])]);
  returnSettle();
  await featureZoom(false);
  fit();
  return action;
}
/**
 * v0.62e (client): a deliberate hand-back to the base game after a bonus: the reel symbols drop into their windows one
 * column after another, the base controls slide back up, and the balance ticks up to its new amount (playRound).
 */
function returnSettle() {
  if (reducedMotion()) { document.body.classList.remove('settle-pre'); return; }
  document.querySelectorAll('#reels .reel-mask:not(.land-lift) .strip').forEach((st, i) =>
    st.animate([{ translate: '0 -70px', opacity: 0 }, { translate: '0 6px', opacity: 1, offset: .7 }, { translate: '0 0', opacity: 1 }],
      { duration: 460, delay: i * 90, easing: 'cubic-bezier(.3,.9,.4,1)', fill: 'backwards' }));
  requestAnimationFrame(() => document.body.classList.remove('settle-pre'));   // the drop-ins hold them hidden until each starts
  const ctl = $('#stage > .controls');
  ctl?.animate([{ translate: '0 26px', opacity: 0 }, { translate: '0 0', opacity: 1 }], { duration: 420, delay: 300, easing: 'cubic-bezier(.25,.8,.35,1)', fill: 'backwards' });
  for (const id of ['#buyBtn', '#extraBtn']) $(id)?.animate([{ scale: '.85', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: 360, delay: 520, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'backwards' });
}
/** v0.62e: the balance counts up to its new amount (after a bonus). */
function tickBalance(from, to, ms = 900) {
  const el = $('#balance'); if (!el || to <= from || reducedMotion()) return;
  const t0 = performance.now();
  (function step(now) { const q = Math.min(1, (now - t0) / ms), k = 1 - Math.pow(1 - q, 3);
    if (S.balance !== to) return;   // something else changed it (a new round): stop
    el.textContent = fmt(Math.round(from + (to - from) * k)); if (q < 1) requestAnimationFrame(step); })(t0);
}
let teasesLeft = 0;

const TIERS = [[250, 'LEGENDARIO!'],   // v0.62 (client): LEGENDARIO! from 250x (was 500x)
  [100, 'EPIC WIN'], [40, 'MEGA WIN'], [15, 'BIG WIN']];
/**
 * s15B: celebration tiers for a BOUGHT bonus are measured against the buy cost, not the line bet (50x bet): a return
 * below 1.5x the cost gets the neutral finish with the gross win, the cost and the net shown separately. Natural
 * bonuses keep the stake-based tiers above. Configurable; does not touch payouts.
 */
/**
 * Checklist 4 (v0.35) — celebration tiers for a BOUGHT feature, as multiples of the buy cost (configurable, display only;
 * wins and credits are never touched):
 *   < 1.0x cost  -> neutral completion (no tier label, no character, restrained effects)
 *   1.0 - 1.5x   -> NICE WIN: modest feedback near break-even (label, light fountain, no character)
 *   1.5 - 3x BIG WIN · 3 - 6x MEGA WIN · 6 - 10x EPIC WIN · 10x+ LEGENDARIO! (characters as before)
 * At a $50 buy: $40.50 neutral, $52.00 and $59.00 NICE WIN, $75 BIG, $150 MEGA. Natural features keep the stake tiers.
 */
// v0.62e (client): bought bonuses, as multiples of the price paid: 2x dancer, 3x guitarist, 4x the pair, 7.5x the pair
// with the altar (at a 100 buy: 200 / 300 / 400 / 750). Below 2x: the Total Win page.
const BUY_LEVELS = [[7.5, 'LEGENDARIO!'], [4, 'EPIC WIN'], [3, 'MEGA WIN'], [2, 'BIG WIN']];
const BUY_TIERS = [[10, 'LEGENDARIO!'], [6, 'EPIC WIN'], [3, 'MEGA WIN'], [1.5, 'BIG WIN'], [1.0, 'NICE WIN']];
// v0.25 big-win hierarchy: each level has its own character, and the count climbs through the levels on screen
// v0.62 (client): the dancer first, then the guitarist, then the two together (file names: mega = dancer, big = guitarist)
const TIER_CHAR = { 'BIG WIN': 'mega', 'MEGA WIN': 'big', 'EPIC WIN': 'epic', 'LEGENDARIO!': 'epic' };   // NICE WIN has no character
// the Total Win screen uses the same order, in front of the altar
const TW_CHAR = TIER_CHAR;
const tierAt = (x, list = TIERS) => list.find(([t]) => x >= t);
/** v0.69: what a win's celebration levels are measured against - the stake actually paid (Double Chance: 1.6x the bet),
 *  and for a bought bonus its price (2 / 3 / 4 / 7.5x) or, with "Buy celebrations: vs bet", the bet (15 / 40 / 100 / 250x) */
function celebration(rec, bought) {
  if (bought && optVal('bw') !== 'bet') return { unit: rec.stake, LV: BUY_LEVELS };
  return { unit: rec.bet, LV: TIERS };   // v0.70 (checklist 9): natural wins against the stake only (not the Double Chance 1.6x)
}
/** Swap in the character for a level with its own entrance (hop in / spin up / slam down). */
/** v0.73 (checklist 5, 8): every win page is laid out from measured positions. The headline sits exactly where TOTAL WIN
 *  sits on the Total Win page; the picture (altar or character) is centred between the headline and the amount (shrunk a
 *  little only when the space is short); the backdrop's turning rays are centred on the picture. Layout units (offsets),
 *  so entrance animations never skew the measurements; applied with translate / scale only (the flow is unchanged). */
function layoutTop(e) {   // stage units, from the element's untransformed layout box (its parent's box on screen + its offset)
  const sr = stage.getBoundingClientRect(), k = sr.height / stage.offsetHeight || 1, par = e.offsetParent || stage;
  return (par.getBoundingClientRect().top + par.clientTop * k + e.offsetTop * k - sr.top) / k; }
function placeResult() {
  const land = stage.classList.contains('land');
  for (const el of [$('#bigWin'), $('#totalWin')]) {
    if (!el || el.classList.contains('hidden')) continue;
    const big = el.id === 'bigWin';
    const head = el.querySelector(big ? '.bw-tier' : '.tw-title');
    const tier = el.querySelector('.tw-tier');   // the level line (EPIC WIN ...) sits above the amount when it shows
    const amt = big ? ([el.querySelector('.bw-total'), el.querySelector('.bw-amount')].find(e => e && e.offsetHeight) || el.querySelector('.bw-amount')) : (!big && tier?.textContent.trim() && tier.offsetHeight ? tier : el.querySelector('.tw-amount'));
    const pics = (big ? ['.char-host'] : el.classList.contains('has-char') ? ['.char-host', '.tw-altar'] : ['.tw-altar']).map(q => el.querySelector(q)).filter(Boolean);
    const main = pics[0]; if (!head || !amt || !main || !main.offsetHeight) continue;
    for (const p of [head, ...pics]) { p.style.translate = ''; p.style.scale = ''; }
    const hTop = layoutTop(head);   // the Big Win headline is placed by CSS exactly where TOTAL WIN is (style.css, v0.73)
    const hBot = hTop + head.offsetHeight, aTop = layoutTop(amt), gap = aTop - hBot;
    const pTop = layoutTop(main), ph = main.offsetHeight, s = Math.max(0.55, Math.min(1, (gap - 24) / ph));
    const mid = hBot + gap / 2, dy = mid - (pTop + ph / 2);
    for (const p of pics) { p.style.translate = `0 ${dy.toFixed(1)}px`; if (s < 1) p.style.scale = s.toFixed(3); }
    // the turning rays (behind the stage, in window pixels) centred on the picture
    const rays = document.querySelector('#backdrop .cele-rays'), bd = document.querySelector('#backdrop');
    if (rays && bd) { const sr = stage.getBoundingClientRect(), k = sr.height / stage.offsetHeight || 1;
      rays.style.top = `${(sr.top + mid * k - bd.getBoundingClientRect().top).toFixed(1)}px`; }
  }
}
function placeResultSoon() { for (const t of [0, 120, 300, 600, 1000, 1600]) setTimeout(() => requestAnimationFrame(placeResult), t); }
function resetResultRays() { const rays = document.querySelector('#backdrop .cele-rays'); if (rays) rays.style.top = ''; }
addEventListener('resize', () => requestAnimationFrame(placeResult));
// the pages settle after they open (images load, the amount grows as it counts): re-place on any size change
{ let q = 0; const ro = new ResizeObserver(() => { if (!q) q = requestAnimationFrame(() => { q = 0; placeResult(); }); });
  const watch = () => { for (const e of document.querySelectorAll('#bigWin > *, #totalWin > *, #bigWin, #totalWin')) ro.observe(e); };
  watch(); new MutationObserver(watch).observe(document.body, { childList: true, subtree: false }); setTimeout(watch, 3000);
  window.__watchResult = watch; }
function showChar(host, tier, first, list = TIERS, map = TIER_CHAR) {
  const key = map[tier[1]]; const src = ASSETS.ui[`char_${key}`]; if (!host || !src) return;
  const lvl = TIERS.length - Math.max(0, TIERS.findIndex(t => t[1] === tier[1]));   // 1 big .. 4 legendario
  host.className = `char-host lv${lvl}`;
  host.innerHTML = `<img class="char" src="${src}" alt="">`;
  const im = host.firstChild;
  const enter = lvl === 1 ? [{ transform: 'translateX(-120%) rotate(-12deg)', opacity: 0 }, { transform: 'translateX(8%) rotate(4deg)', opacity: 1, offset: .7 }, { transform: 'none' }]
    : lvl === 2 ? [{ transform: 'scale(.2) rotate(-200deg)', opacity: 0 }, { transform: 'scale(1.12) rotate(8deg)', opacity: 1, offset: .7 }, { transform: 'none' }]
    : [{ transform: 'translateY(-60%) scale(1.5)', opacity: 0 }, { transform: 'translateY(4%) scale(.96)', opacity: 1, offset: .55 }, { transform: 'none' }];
  im.animate(enter, { duration: first ? 650 : 520, easing: 'cubic-bezier(.3,1.2,.5,1)' });
  if (!first) { if (lvl >= 3) $('#game').animate([{ translate: '0 0' }, { translate: '-8px 6px' }, { translate: '7px -4px' }, { translate: '0 0' }], { duration: 300 }); }
  window.__watchResult?.(); placeResultSoon();
}

/**
 * Full-screen ofrenda celebration that closes every Hold & Win (s15). The count-up always runs to the end and taps are
 * ignored while it does (nothing is queued). After the reading pause BUY ANOTHER BONUS appears; it opens the normal
 * buy panel once the base game is back. A tap anywhere else returns to the base game. Resolves 'buy' or 'continue'.
 */
/**
 * Checklist 3: the result composition keeps its heading inside what is actually visible — notch / safe area and any
 * part of the stage a browser bar hides — with top clearance; the lower actions keep clear of the home indicator.
 */
function layoutResult() {
  const r = stage.getBoundingClientRect(), k = r.height / (parseFloat(stage.style.height) || 1280) || 1;
  const vv = window.visualViewport, top = vv ? vv.offsetTop : 0, bottom = vv ? vv.offsetTop + vv.height : innerHeight;
  stage.style.setProperty('--vis-t', `${Math.max(0, (top - r.top) / k).toFixed(1)}px`);
  stage.style.setProperty('--vis-b', `${Math.max(0, (r.bottom - bottom) / k).toFixed(1)}px`);
}
addEventListener('resize', () => { if (!$('#totalWin')?.classList.contains('hidden')) layoutResult(); });
async function totalWinScene(winMinor, rec, bought, afterBig = false) {
  const el = $('#totalWin');
  const betMinor = rec.bet, cost = bought ? rec.stake : 0;
  const land = stage.classList.contains('land');
  const SH = parseFloat(stage.style.height) || 1280;   // v0.35: the particle canvas matches the stage (no vertical stretch)
  const cv = $('#fx2'); cv.width = land ? 1280 : 720; cv.height = land ? 720 : SH; fx2.LW = cv.width; fx2.LH = cv.height; fx2.R = 1;
  layoutResult();
  el.querySelector('.tw-altar').innerHTML = altarSVG();
  // v0.62 (client): the win levels always climb against the stake (BIG 15x · MEGA 40x · EPIC 100x · LEGENDARIO 250x),
  // bought bonuses too; a bought bonus that paid back less than its price is never celebrated
  // v0.62e (client): a bought bonus measures against the price paid (BUY_LEVELS); this page only shows one under 2x, so no level
  const { unit: cu, LV: list } = celebration(rec, bought), ratio = m => m / cu, under = false;   // v0.69
  const tier = under || afterBig ? null : tierAt(ratio(winMinor), list);
  el.querySelector('.tw-tier').textContent = '';
  let twHost = el.querySelector('.char-host'); if (!twHost) { twHost = document.createElement('div'); el.querySelector('.tw-altar').after(twHost); }
  twHost.className = 'char-host'; twHost.innerHTML = ''; el.classList.remove('has-char', 'neutral');
  el.querySelector('.tw-net')?.remove();   // checklist 1: no buy-cost / profit strip (accounting unchanged)
  // Checklist 4 item 1: every result starts from a clean presentation state - no scroll offset inside the layer (its
  // rotating rays are far larger than the screen), no retained transforms or finished animations, no focus
  el.scrollTop = 0; el.scrollLeft = 0; el.getAnimations({ subtree: true }).forEach(a => { if (!a.animationName) a.cancel(); });
  if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
  // Checklist 4 item 10: BACK TO THE GAME (green, primary) above BUY FEATURE (purple, secondary); both hidden and
  // disabled until the uninterrupted count-up and the reading pause have finished
  const back = el.querySelector('.tw-back'), buy = el.querySelector('.tw-buy2'), acts = el.querySelector('.tw-actions');
  for (const b of [back, buy]) b.disabled = true; acts.classList.remove('show');
  if (!tier) el.classList.add('neutral');
  const big = !!tier;   // every level climbs with its own presentation
  el.classList.toggle('modest', !!tier && !big);
  let shownTier = null;
  const amt = el.querySelector('.tw-amount'); amt.textContent = fmt(0); amt.classList.remove('done');
  el.classList.remove('hidden', 'out', 'done', 'ready'); el.classList.add('show'); document.body.classList.remove('rays-off'); document.body.classList.add('celebrating');
  placeResultSoon();   // v0.73 (checklist 5)
  // v0.52 (iPhone crash at the payout screen): the board's effects are released and, once the opaque result screen
  // has covered it, the machine and the backdrop stop being painted, so the phone holds only the result screen's layers
  fx.clear(); board.tensionClear(); clearTimeout(totalWinScene.cov); totalWinScene.cov = setTimeout(() => document.body.classList.add('tw-cover'), 560);
  el.onclick = null;   // s15C: taps during the count are ignored, not queued
  // v0.62f (client): as in v0.52 - the game music is muted and the mariachi win stinger plays under the count
  audio.hush(0.5); audio.play('sceneIn'); const winSnd = { t0: performance.now(), h: audio.play('winStinger') };   // v0.62k: the stinger once, never repeated
  // v0.32: the celebration music and the Olé always play on the Total Win screen. Only the on-screen tier label and
  // character follow the buy-relative tiers (a losing buy shows no BIG/MEGA label, but still gets its music).
  const oleWin = winMinor >= betMinor * 15;
  const pot = land ? [640, 300] : [360, SH * 0.42];
  const x = ratio(winMinor);
  const ms = afterBig ? 500 : big ? Math.min(5000, 1800 + (bought ? x * 300 : x * 30)) : tier ? 1900 : 1500;   // after the Big Win: a quick settle
  const t0 = performance.now(); let lastTick = 0, lastFountain = 0;
  if (big) fx2.coinRain(true, 1);   // checklist 4: lively during the count (particles sit behind the lettering)
  // v0.62 (client): the count climbs through the levels; a tap jumps the count straight to the next level (the last
  // tap to the final amount). Each new level: its character, a hit, a flash, more coin rain and the music steps up.
  let tStart = t0, ended = false, hold = 0, holdFrom = 0;
  const levelsUp = list.filter(([t]) => under ? false : t <= ratio(winMinor)).map(([t]) => t * cu).sort((a, b) => a - b);
  const curAt = q => Math.round(winMinor * (1 - Math.pow(1 - q, 2.2))), qAt = v => 1 - Math.pow(Math.max(0, 1 - v / winMinor), 1 / 2.2);
  el.onclick = () => { if (ended) return; const now = performance.now(); if (hold) { tStart += now - holdFrom; hold = 0; } const q = Math.min(1, (now - tStart) / ms), cur = curAt(q);
    const nextLv = levelsUp.find(v => v > cur + 0.5); const target = nextLv && nextLv < winMinor ? nextLv : winMinor;
    tStart = now - qAt(target) * ms; };
  const lvlOf = t => (t ? TIERS.length - TIERS.findIndex(x => x[1] === t[1]) : 0);
  await new Promise(res => {
    const step = now => {
      if (hold) { if (now < hold) { requestAnimationFrame(step); return; } tStart += hold - holdFrom; hold = 0; }
      const p = Math.max(0, Math.min(1, (now - tStart) / ms));
      const cur = curAt(p);
      amt.textContent = fmt(cur);
      const tNow = under || afterBig ? null : tierAt(ratio(cur), list);   // v0.62c: after the Big Win, no second climb
      if (tNow && tNow !== shownTier) { el.querySelector('.tw-tier').textContent = tNow[1];
        el.classList.toggle('lv4', tNow[1] === 'LEGENDARIO!');
        if (TW_CHAR[tNow[1]]) { el.classList.add('has-char'); showChar(twHost, tNow, !el.querySelector('.char-host img'), list, TW_CHAR); }
        { const L = lvlOf(tNow); audio.musicLift(L);   // v0.62k (client): no sound between levels (stinger once, then the olé)
          fx2.coinRain(true, 1); fx2.fountain(pot[0], pot[1], 10 + 6 * L);   // v0.62e: light and scattered at every level
          el.animate([{ scale: '1', filter: 'brightness(1)' }, { scale: '1.035', filter: 'brightness(1.35)', offset: .25 }, { scale: '1', filter: 'brightness(1)' }], { duration: 520, easing: 'cubic-bezier(.3,1.4,.5,1)' }); }
        if (shownTier && p < 1) { hold = now + 700; holdFrom = now; }   // each new level holds for a moment so it lands (a tap moves on)
        shownTier = tNow; }
      // v0.62k (client): no count ticks on the Total Win page (stinger once, then the olé)
      if (tier && now - lastFountain > (big ? 320 : 520) && p < 1) { fx2.fountain(pot[0], pot[1], big ? 6 : 3); lastFountain = now; }
      if (p < 1) requestAnimationFrame(step); else { ended = true; res(); }
    };
    requestAnimationFrame(step);
  });
  el.onclick = null;
  amt.textContent = fmt(winMinor);   // the exact gross feature win
  winEnd(winSnd);   // v0.62k (client): the olé trumpet when the total is reached (after the stinger has finished)
  if (tier) fx2.fountain(pot[0], pot[1], big ? 22 : 10);
  // checklist 4: activity eases off as the amount settles — the rain stops, the last particles fall away behind the
  // lettering, so the settled figure has a clear reading moment before the (smaller, lower) buy button appears
  setTimeout(() => { fx2.coinRain(false); fx2.fade(big ? 55 : 30); }, big ? 450 : 0);
  amt.classList.add('done'); el.classList.add('done');
  await wait(PRES.readingPause);   // the exact amount stays readable before anything else is offered
  el.classList.add('ready'); acts.classList.add('show'); for (const b of [back, buy]) b.disabled = false;
  const auto = S.auto.running;
  // after that, every tap outside BUY FEATURE (its own touch area) returns to the base game; BUY FEATURE only opens the
  // adjustable buy panel (the normal BUY confirmation is still required there). The first input decides, once.
  const action = await new Promise(res => {
    let done = false; const fin = a => { if (done) return; done = true; res(a); };
    buy.onpointerdown = e => e.stopPropagation();
    buy.onclick = e => { e.stopPropagation(); e.preventDefault(); document.body.classList.add('rays-off'); fin('buy'); };   // v0.62m: rays off at once
    el.onclick = () => fin('continue');
    if (auto) setTimeout(() => fin('continue'), 1800);
  });
  el.onclick = null; buy.onclick = null; buy.onpointerdown = null; acts.classList.remove('show'); for (const b of [back, buy]) b.disabled = true;
  // the tap that closed the screen must not fall through to the base-game controls revealed underneath
  document.body.classList.add('tw-guard'); setTimeout(() => document.body.classList.remove('tw-guard'), 450);
  S.skip = false;
  fx2.coinRain(false);
   audio.unhush(1.2); audio.musicLift(0);   // the game music comes back as the page closes (any stinger left fades)
  el.classList.replace('show', 'out'); await wait(380);
  document.body.classList.add('rays-off');   // v0.62m (client): the rays go at once when the win screen closes, whatever comes next
  resetResultRays();
  el.classList.add('hidden'); el.classList.remove('out', 'done', 'ready', 'neutral', 'has-char', 'modest', 'lv4'); el.scrollTop = 0; fx2.clear(); { const c2 = $('#fx2'); c2.width = c2.height = 0; }   /* v0.62j: release its memory */ clearTimeout(totalWinScene.cov); document.body.classList.remove('celebrating', 'tw-cover');
  return action;
}

/** v0.62: the gold pot altar behind the two dancers on the LEGENDARIO! level of the Big Win */
function bwAltar(el, on) {
  let a = el.querySelector('.bw-altar');
  if (!on) { a?.remove(); return; }
  if (!a) { a = document.createElement('div'); a.className = 'bw-altar'; a.innerHTML = altarSVG(); el.querySelector('.char-host')?.prepend(a); }
  a.animate([{ opacity: 0, translate: '0 40px', scale: '.85' }, { opacity: 1, translate: '0 0', scale: '1' }], { duration: 520, easing: 'cubic-bezier(.2,1.2,.4,1)', fill: 'both' });
}
/** v0.62b (client): during a last-squares respin the bonus sun rays speed up with the near-miss fire - the same timing
 *  (from normal to 4x over the first 15 % of the build, at most 0.45 s, easing out), held to the result, then eased back */
let raysRaf = 0;
function raysSpeed(build) {
  const a = document.querySelector('#backdrop .cele-rays')?.getAnimations()[0]; if (!a) return;
  cancelAnimationFrame(raysRaf); const t0 = performance.now(), from = a.playbackRate;
  if (!build) { const step = now => { const q = Math.min(1, (now - t0) / 700); a.updatePlaybackRate(from + (1 - from) * q); if (q < 1) raysRaf = requestAnimationFrame(step); }; raysRaf = requestAnimationFrame(step); return; }
  const A = Math.min(0.15 * build, 450), TOP = 4;
  const step = now => { const q = Math.min(1, (now - t0) / A); a.updatePlaybackRate(1 + (TOP - 1) * (1 - Math.pow(1 - q, 2))); if (q < 1) raysRaf = requestAnimationFrame(step); };
  raysRaf = requestAnimationFrame(step);
}
/** v0.62k (client): the end of a win screen - the mariachi stinger (played once at the start) finishes, then the whole olé
 *  trumpet clip plays: at once when the total is reached, or as soon as the stinger has ended if the count
 *  was quicker than the stinger. */
function winEnd(winSnd) {
  const STINGER = 2850, left = winSnd ? STINGER - (performance.now() - winSnd.t0) : 0;
  if (left > 0) setTimeout(() => audio.play('ole'), left); else audio.play('ole');   // the whole olé clip (its build-up, then the trumpet), as in the old builds
}
async function bigWin(winMinor, betMinor, finale = false, LV = TIERS) {
  // v0.62e: betMinor is the unit the levels are measured in - the bet, or for a bought bonus the price paid (BUY_LEVELS)
  const x = winMinor / betMinor;
  const tier = LV.find(([t]) => x >= t);
  if (!tier) return;
  layoutResult();   // v0.73 (checklist 8): the notch / browser-bar allowance the headline shares with TOTAL WIN
  const el = $('#bigWin'); el.classList.remove('hidden'); document.body.classList.remove('rays-off'); document.body.classList.add('celebrating'); board.tensionClear();
  let host = el.querySelector('.char-host'); if (!host) { host = document.createElement('div'); el.prepend(host); }
  let shownTier = LV[LV.length - 1];
  el.querySelector('.bw-tier').textContent = shownTier[1]; showChar(host, shownTier, true);
  const amt = el.querySelector('.bw-amount');
  S.skip = false;
  // v0.62f (client): as in v0.52 - the game music is muted; the mariachi win stinger plays under the count (looped for
  // longer counts) with the voice; the brass fanfare's climax is the one ending
  audio.hush(0.3); audio.play('sceneIn'); const winSnd = { t0: performance.now(), h: audio.play('winStinger') }; fxBw.coinRain(true, fitFx(fxBw));   // v0.62k: the stinger once, never repeated
  // v0.62c (client): the count is paced by level, like other slots - each picture gets its own stretch of time and the
  // count speeds up as it climbs (the stretches cover bigger amounts in less time): the dancer up to 40x, the
  // guitarist up to 100x, the pair up to 250x, then the pair with the altar to the final amount. A tap jumps to the
  // next picture; the last tap to the final amount.
  // v0.62e (client): quick spin plays the win screens at about a third of the time (was half); a tap still jumps
  const SL = S.turbo ? 0.35 : 1, bounds = [0, ...LV.slice(0, -1).map(([m]) => m).reverse().map(m => m * betMinor).filter(v => v < winMinor), winMinor];
  // v0.70 (checklist 13) "Win count pace": As now / Slower (1.6x) / Slowest (2x). At Slower and Slowest the count races
  // early in each level and crawls through the last stretch before the next threshold (will it get there?), and the
  // final level is paced as if heading for the NEXT threshold - so the crawl looks the same whether the count will
  // cross or stop short; it simply stops where the win is.
  const WP = { now: 1, slower: 1.6, slowest: 2 }[optVal('wcount')] ?? 1, CRAWL = 2.4;
  const crawl = q => 1 - Math.pow(1 - q, CRAWL), crawlInv = y => 1 - Math.pow(1 - Math.min(.999, y), 1 / CRAWL);
  const lastI = bounds.length - 2, ups = LV.map(([m]) => m * betMinor).sort((p1, p2) => p1 - p2);
  const virt = WP > 1 ? (ups.find(v => v > winMinor) ?? Math.max(winMinor * 1.3, bounds[lastI] * 2)) : winMinor;
  const virtMs = [3000, 2600, 2300, 2100][Math.min(3, lastI)] * SL * WP;
  const lastMs = WP > 1 ? Math.max(700 * SL, virtMs * crawlInv((winMinor - bounds[lastI]) / Math.max(1, virt - bounds[lastI]))) : 0;
  const segMs = bounds.slice(1).map((v, i, arr) => { const base = [3000, 2600, 2300, 2100][i] * SL * WP;
    if (WP > 1) return i === arr.length - 1 ? lastMs : base;
    return i === arr.length - 1 ? Math.max(1200 * SL, base * Math.min(1, (v - bounds[i]) / (bounds[i] * 1.5 || v))) : base; });
  const segStart = segMs.reduce((acc, d, i) => (acc.push(acc[i] + d), acc), [0]), total = segStart[segStart.length - 1];
  const valueAt = e => { if (e >= total) return winMinor; const i = Math.min(segMs.length - 1, segStart.findIndex((s0, k) => e < segStart[k + 1])); const q = Math.max(0, Math.min(1, (e - segStart[i]) / segMs[i]));
    if (WP > 1) {
      if (i === segMs.length - 1) { const qq = q * crawlInv((winMinor - bounds[i]) / Math.max(1, virt - bounds[i]));
        return Math.min(winMinor, Math.round(bounds[i] + (virt - bounds[i]) * crawl(qq))); }
      return Math.round(bounds[i] + (bounds[i + 1] - bounds[i]) * crawl(q)); }
    // v0.62e (client): within each picture's stretch the count starts slower and speeds up into the next level; the
    // last stretch still eases out so the final amount lands
    const k = i === segMs.length - 1 ? 1 - Math.pow(1 - q, 2) : Math.pow(q, 1.7); return Math.round(bounds[i] + (bounds[i + 1] - bounds[i]) * k); };
  // v0.62e (client): the build into each new level - over its last ~second the amount swells (to 1.3x, brightening)
  // with a rising sound; on the change the new picture lands with the hit and the amount drops back with a bounce
  const SWELL = Math.min(1000 * SL, 0.45 * Math.min(...segMs)), swellAt = e => { for (let i = 0; i < segMs.length - 1; i++) {
    const end = segStart[i + 1], st = end - SWELL; if (e >= st && e < end) return { i, u: (e - st) / SWELL }; } return null; };
  let riseSnd = null, riseSeg = -1;
  const endRise = (fade = 0.05) => { riseSnd?.stop(fade); riseSnd = null; };
  const t0 = performance.now(); let tStart = t0, ended = false;
  let lvAt = performance.now();   // taps within 0.6 s of the screen opening or a new level are ignored (taps carried over
  // from skipping the bonus collect can't race through the levels unseen)
  el.onclick = () => { const now = performance.now(); if (now - lvAt < 600) return; if (ended) { S.skip = true; return; }
    const e = now - tStart, nx = segStart.find(st => st > e + 1); tStart = now - (nx ?? total); };
  await new Promise(res => {
    const step = now => {
      const e = Math.min(total, now - tStart), p = e / total;
      const cur = valueAt(e);
      amt.textContent = fmt(cur);
      const sw8 = swellAt(e);
      if (sw8) { const u = sw8.u * sw8.u; amt.style.scale = String(1 + 0.3 * u); amt.style.filter = `brightness(${(1 + 0.45 * u).toFixed(3)})`;
        if (riseSeg !== sw8.i) { riseSeg = sw8.i; endRise(); } }   // v0.62k (client): the swell is visual only (no rising sound)
      const tNow = tierAt(cur / betMinor, LV);
      if (tNow && tNow !== shownTier && LV.indexOf(tNow) < LV.indexOf(shownTier)) {
        shownTier = tNow; const t = el.querySelector('.bw-tier'); t.textContent = tNow[1];
        t.animate([{ transform: 'scale(1.8)', filter: 'brightness(2)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 420, easing: 'cubic-bezier(.3,1.5,.5,1)' });
        showChar(host, tNow, false);   // v0.62e (client): the rain stays light and scattered at every level (no heavy wall of coins)
        if (tNow[1] === 'LEGENDARIO!') bwAltar(el, true);   // v0.62 (client): the gold pot altar rises behind the pair
        audio.musicLift(LV.length - LV.indexOf(tNow)); lvAt = now;   // the level's hit comes from showChar (once)
        endRise(0.05); riseSeg = -1; const from = parseFloat(amt.style.scale) || 1.3; amt.style.scale = ''; amt.style.filter = '';
        amt.animate([{ scale: String(Math.max(1.15, from)), filter: 'brightness(1.5)' }, { scale: '.94', filter: 'brightness(1.1)', offset: .55 }, { scale: '1', filter: 'brightness(1)' }], { duration: 480, easing: 'cubic-bezier(.3,1.3,.5,1)' });
        el.animate([{ scale: '1', filter: 'brightness(1)' }, { scale: '1.035', filter: 'brightness(1.35)', offset: .25 }, { scale: '1', filter: 'brightness(1)' }], { duration: 520, easing: 'cubic-bezier(.3,1.4,.5,1)' });
      }
      if (p < 1) requestAnimationFrame(step); else { ended = true; res(); }
    };
    requestAnimationFrame(step);
  });
  endRise(); amt.style.scale = ''; amt.style.filter = '';
  if (WP > 1 && !finale && !S.skip) { await wait(320); amt.animate([{ scale: '1', filter: 'brightness(1)' }, { scale: '1.22', filter: 'brightness(1.6)', offset: .35 }, { scale: '1', filter: 'brightness(1)' }], { duration: 560, easing: 'cubic-bezier(.3,1.4,.5,1)' }); }   // v0.70: a beat, then the final amount pulses
  winEnd(winSnd);   // v0.62k (client): the olé trumpet when the total is reached (after the stinger has finished)
  let action = null;
  if (finale) {   // v0.62c: the end of a bonus - the amount slams, TOTAL WIN appears above it, then the buttons
    el.onclick = null;
    let lab = el.querySelector('.bw-total'); if (!lab) { lab = document.createElement('div'); lab.className = 'bw-total'; lab.textContent = 'TOTAL WIN'; amt.before(lab); window.__watchResult?.(); } requestAnimationFrame(placeResult);
    el.classList.add('final');   // the slam rides on the finishing sound above (no second ending)
    amt.animate([{ scale: '1', filter: 'brightness(1)' }, { scale: '1.32', filter: 'brightness(1.8)', offset: .3 }, { scale: '.96', offset: .65 }, { scale: '1', filter: 'brightness(1)' }], { duration: 700, easing: 'cubic-bezier(.3,1.4,.5,1)' });
    const r = amt.getBoundingClientRect(), gp = fxPoint(fx, amt); fx.burst(gp.x, gp.y, { count: 60, speed: 12, size: 7, life: 60, colors: ['#ffd35a', '#fff4b8', '#ffb21f'] });
    fxBw.coinRain(false); fxBw.fade(45); void r;
    await wait(S.turbo ? 700 : PRES.readingPause);   // v0.62e: quicker with quick spin
    const acts = $('#totalWin .tw-actions'), back = acts.querySelector('.tw-back'), buy = acts.querySelector('.tw-buy2');
    el.append(acts); acts.classList.add('show'); for (const b2 of [back, buy]) b2.disabled = false;
    action = await new Promise(res => { let done = false; const fin = a => { if (done) return; done = true; document.body.classList.add('rays-off'); res(a); };   // v0.62m: rays off on any exit
      buy.onpointerdown = e => e.stopPropagation(); buy.onclick = e => { e.stopPropagation(); e.preventDefault(); document.body.classList.add('rays-off'); fin('buy'); };   // v0.62m: rays off at once
      el.onclick = () => fin('continue'); if (S.auto.running) setTimeout(() => fin('continue'), 1800); });
    buy.onclick = null; buy.onpointerdown = null; acts.classList.remove('show'); for (const b2 of [back, buy]) b2.disabled = true;
    $('#totalWin').append(acts);
    document.body.classList.add('tw-guard'); setTimeout(() => document.body.classList.remove('tw-guard'), 450);
  } else await (S.skip ? wait(400) : sw(S.turbo ? 600 : 1600));   // v0.62e: quick spin holds the final amount briefly
  S.skip = false;
  fxBw.coinRain(false); fxBw.clear(); fxBw.c.width = fxBw.c.height = 0; fxBw.R = 0;   // v0.62j: release its memory
   audio.unhush(1.2); audio.musicLift(0); bwAltar(el, false);
  document.body.classList.add('rays-off');   // v0.62m (client): the rays go at once when the win screen closes
  resetResultRays();
  el.classList.add('hidden'); el.classList.remove('final'); el.onclick = null; document.body.classList.remove('celebrating');
  return action;
}

// ---------- brief s03D: Extra Bet explanation ----------
// Wording from the rules: Extra Bet only changes the reel strips (more Coins) and the stake. PAR (docs/PAR.md, maths
// 0.2.0): Hold & Win 1 in 58 spins with Extra Bet vs 1 in 176 without (3.0x). Coin values and the feature are unchanged.
function extraTip(show) {
  const P = PAR_TXT[S.profile] || PAR_TXT.standard;
  let t = $('#extraTip');
  if (!t) { t = document.createElement('div'); t.id = 'extraTip'; t.setAttribute('role', 'status'); $('.row-feat').append(t);
    t.addEventListener('click', e => { e.stopPropagation(); extraTip(false); }); }
  clearTimeout(extraTip.timer);
  if (!show) { t.classList.remove('show'); return; }
  const c = S.cfg.modes.double.costPct / 100, stake = Math.round(bet() * c);
  t.innerHTML = `<b>DOUBLE CHANCE ON</b><span>Hold &amp; Win about <em>twice as often</em> (1 in ${P.double} spins instead of 1 in ${P.base}), so Super bonuses come sooner too.</span><small>Stake ×${c}: ${fmt(stake)} per spin · same bonus, same RTP</small>`;
  t.classList.add('show');
  extraTip.timer = setTimeout(() => t.classList.remove('show'), 5200);
}

// ---------- autoplay ----------
async function startAuto(count, stopOnFeature, stopOnBig) {
  Object.assign(S.auto, { running: true, remaining: count, stopOnFeature, stopOnBig, stopRequested: false });
  updateHud();
  while (S.auto.running && !S.auto.stopRequested && S.auto.remaining > 0) {
    if (S.auto.remaining !== Infinity) S.auto.remaining--;
    updateHud();
    const rec = await playRound(modeName());
    if (!rec) break;
    if (S.auto.stopOnFeature && rec.round.feature) break;
    if (S.auto.stopOnBig && rec.win >= rec.bet * 50) break;
    await wait(T(260 * ({ brisk: 0.7, now: 1, relaxed: 1.4 }[optVal('spin')] ?? 1)));   // v0.71 Spin pace; v0.68 (checklist 2): back to the v0.66d pause - the win amount stays in the bar through the next spin instead
  }
  stopAuto();
}
function stopAuto() { S.auto.running = false; S.auto.remaining = 0; updateHud(); }

// ---------- modals ----------
function openModal(html, onMount) {
  const m = $('#modal'); m.querySelector('.modal-body').innerHTML = html; m.classList.remove('hidden');
  onMount?.(m.querySelector('.modal-body'));
}
// v0.20 settings: separate music / effects volume, remembered on this device
const PREFS_KEY = 'pocoLoco.prefs';
function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; } }
// checklist 16: settings are merged into the stored prefs, so saving them (sound, volume, autoplay count) never wipes
// the "rules already seen" flag — the first-time Hold & Win card only returns if the player has never dismissed it
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), music: audio.vol.music, sfx: audio.vol.sfx, sound: S.sound, turbo: S.turbo, autoN: S.autoN })); } catch { /* storage blocked */ } }
function applyPrefs() { const p = loadPrefs(); if (p.autoN) S.autoN = p.autoN; if (p.music != null) audio.setVolume('music', p.music); if (p.sfx != null) audio.setVolume('sfx', p.sfx);
  if (p.sound === false) { S.sound = false; audio.setEnabled(false); } }
function settingsHTML() {
  const pct = v => Math.round(v * 100);
  const slider = (id, label, v) => `<label class="vol"><span>${label}</span><input type="range" id="${id}" min="0" max="100" step="1" value="${pct(v)}" style="--v:${pct(v)}%"><b id="${id}Val">${pct(v)}%</b></label>`;
  return `<h2 id="setTitle">Settings</h2>
    <div class="set-group">${slider('volMusic', 'Music', audio.vol.music)}${slider('volSfx', 'Game sounds', audio.vol.sfx)}</div>
    <button class="set-row" id="setMute" aria-pressed="${!S.sound}"><span>Mute all sound</span><i class="sw"></i></button>
    <button class="set-row" id="setTurbo" aria-pressed="${S.turbo}"><span>Quick spin</span><i class="sw"></i></button>
`;
}
function mountSettings(body) {
  for (const [id, bus] of [['volMusic', 'music'], ['volSfx', 'sfx']]) {
    const el = body.querySelector('#' + id), out = body.querySelector('#' + id + 'Val');
    el.oninput = () => { const v = el.value / 100; el.style.setProperty('--v', el.value + '%'); out.textContent = el.value + '%'; audio.setVolume(bus, v);
      if (v > 0 && !S.sound) { S.sound = true; audio.setEnabled(true); body.querySelector('#setMute').setAttribute('aria-pressed', 'false'); updateHud(); } };
    el.onchange = () => { savePrefs(); if (bus === 'sfx') audio.play('button'); };
  }
  body.querySelector('#setMute').onclick = e => { S.sound = !S.sound; audio.setEnabled(S.sound); e.currentTarget.setAttribute('aria-pressed', String(!S.sound)); savePrefs(); updateHud(); };
  body.querySelector('#setTurbo').onclick = e => { $('#turboBtn').click(); e.currentTarget.setAttribute('aria-pressed', String(S.turbo)); savePrefs(); };
  body.querySelector('#setTitle')?.addEventListener('click', () => labDoor());   // client 3 Nov: the secret door to the test menus
}
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modal .modal-close').onclick = closeModal;
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };

function infoHTML() {
  const c = S.cfg; const b = bet();
  const order = ['W', 'H1', 'H2', 'M1', 'L1', 'L2', 'L3'];   // v0.71: lows shown Gold Ring, Guitar, Maracas (L1 / L2 / L3)
  const icon = id => (ART_V2 ? v2Icon(id) : symbolSVG(id));
  const pays = order.map(id => `<div class="pay-item">${icon(id)}<div><small>${SYMBOL_NAMES[id]}</small><b>3× ${fmt(buToMinor(c.paytableBU[id], b))}</b></div></div>`).join('');
  const lines = c.lines.map((rows, li) => {
    const col = (r, n) => `<div class="col ${r === 1 ? 'mid' : ''}">${Array.from({ length: n }, (_, k) => `<i class="${rows[r] === k ? 'on' : ''}"></i>`).join('')}</div>`;
    return `<div class="mini-line">${col(0, 3)}${col(1, 4)}${col(2, 3)}<em>${li + 1}</em></div>`;
  }).join('');
  const coinVals = c.coinValuesBU.map(v => fmt(buToMinor(v, b))).join(', ');
  const OPT = o => S.profile.split('+').includes(o);   // v0.64 link options
  return `<h2>Paytable &amp; Rules</h2>
  <p class="muted">Values shown for the current bet of ${fmt(b)}. RTP: ${c.rtp.base}% · Double Chance ${c.rtp.double}% · Buy Feature ${c.rtp.buy}%${c.rtp.superbuy ? ` · Super Buy ${c.rtp.superbuy}%` : ''}. Max win ${(c.maxWinBU / 100).toLocaleString()}× bet.</p>
  <h3>Symbols</h3><div class="pay-grid">${pays}</div>
  <p>Wins pay left to right on 10 fixed lines, 3 of a kind. The Calavera Wild substitutes for all symbols except Coins. Only the highest win per line is paid; wins on different lines are added.</p>
  <p><b>Mystery curtains:</b> a curtain landing on a reel draws across that whole reel (Coins and Wilds stay in place). When the reels stop, the curtains open and every curtain on screen turns into the same premium symbol - the Mariachi or the Catrina, and now and then a Wild - and line wins are then paid. ${OPT('dbl36') ? '' : 'A premium symbol already on screen is more likely to be revealed.'}${OPT('dbl22') || OPT('dbl36') ? ` About ${OPT('dbl36') ? '1 in 3' : '1 in 5'} curtains draws across two reels; a two-reel curtain reveals the Catrina.` : ''}</p>
  <p><b>Loco Spin:</b> about one base-game spin in ${c.loco?.every ?? 36}, the Mariachi turns the whole middle reel Wild, may turn up to 3 more positions on the outer reels Wild, and reveals a multiplier (${(c.loco?.mults || [2, 3, 5, 8, 10]).map(m => `×${m}`).join(', ')}) for the spin's line wins. A Loco Spin always pays at least ${c.loco?.minX ?? 1}× and at most ${c.loco?.maxX ?? 40}× the bet.</p>
  <h3>Coins &amp; Jackpots</h3>
  <div class="pay-grid">
    <div class="pay-item">${icon('C_CASH')}<div><small>Cash Coin</small><b style="font-size:18px">${coinVals}</b></div></div>
    ${['MINI', 'MINOR', 'MAJOR', 'GRAND'].map(j => `<div class="pay-item">${symbolSVG(`C_${j}`)}<div><small>${j} Jackpot (${c.jackpotsBU[j] / 100}×)</small><b>${fmt(buToMinor(c.jackpotsBU[j], b))}</b></div></div>`).join('')}
  </div>
  <h3>Hold &amp; Win</h3>
  <ul>
    <li>${c.triggerCount} or more Coins anywhere trigger Hold &amp; Win. Coins lock in place; every other position respins individually.</li>
    <li>The feature starts with ${c.lives ?? 3} respins. Every respin that lands at least one new Coin resets the count to ${c.lives ?? 3}. It ends when the respins run out or when all 10 positions are filled.</li>
    <li>Coin values are drawn from the same table throughout the feature; only Coins landing when 8 or more positions are filled come from a slightly lower table.</li>
    <li><b>Coin Save:</b> when exactly 3 Coins land in the base game, or the last respin of the feature is used up, the Poco Loco skull may fire extra Coins onto the grid to trigger or continue the feature (and the respins reset). Coin Save is never guaranteed: the skull can build up and fizzle out with no award.</li>
    <li><b>Multiplier Frames</b> (×2 to ×50; ×100 in the Super bonus only): the feature opens with 1 or 2 frames and the skull fires more onto positions as the feature goes on. A Coin in a frame is paid × the frame, jackpots included. Frames of ×10 and above are usually fired onto empty positions, so a Coin still has to land there.</li>
    <li>When a Coin lands on a frame it lands at the frame's current value, and the skull <b>steps that frame up</b> one level (×2 → ×3 → ×5 → ×10) on a following respin, one frame per respin. Any step-up still waiting when the feature ends is given before the collection. In the standard feature, step-ups stop at ×10 (×20 in the Super feature).</li>
    <li>How often a Coin landing on a frame is a jackpot depends on the frame: more often on ×2, less often on ×5 and above. Frames of ×5 or more are never placed on a jackpot already on the grid.</li>
    <li>The skull may <b>double a jackpot</b> during the feature, usually one already on the grid (MINI ${fmt(buToMinor(c.jackpotsBU.MINI, b))} → ${fmt(buToMinor(2 * c.jackpotsBU.MINI, b))}, and so on), at most once per jackpot in the standard feature and twice (×4) in the Super feature. A doubled jackpot pays its new value until the feature ends. The GRAND is never doubled.</li>
    <li>Now and then a standard Hold &amp; Win gets a touch of the Super: a 4th respin, or a ×10 opening frame.</li>
    <li>Fill all 10 positions for a <b>Full House</b>: the feature ends and the whole feature win is multiplied ×${c.fullHouseMult ?? 2}.${OPT('bigFH') ? ' A Full House, and the skull\'s extra (4th) spin in a standard Hold &amp; Win, only come in a Hold &amp; Win that pays at least 120× the bet (a bought one: at least 1.5× its price).' : ' Now and then the skull awards an extra (4th) spin at the start.'}</li>
    <li>At the end every Coin and Jackpot is collected into the TOTAL WIN.</li>
  </ul>
  <h3>Super Hold &amp; Win</h3>
  <ul>${OPT('meter') ? `<li><b>Super meter:</b> every time exactly 3 Coins land and Coin Save does not add any, the near miss lights a candle on the Super meter (${c.candlesByProfile?.[S.profile]?.base ?? 32} candles; ${c.candlesByProfile?.[S.profile]?.double ?? 28} with Double Chance). When the meter is full, your next Hold &amp; Win is a <b>Super Hold &amp; Win</b>, and the meter empties. The meter is saved separately for each stake and for Double Chance, and is kept when you leave the game.</li>`
    : `<li>Any Hold &amp; Win triggered in the base game may be upgraded to a <b>Super Hold &amp; Win</b> when it starts (about ${Math.round(100 * (c.superUpgrade?.num ?? 11) / (c.superUpgrade?.den ?? 100))} in 100 of them).</li>`}
    <li>Super Hold &amp; Win: ${c.superLives ?? 4} respins; it opens with 4 or 5 multiplier frames, one jackpot doubled and the Full House at ×${c.superFullHouseStart ?? 3}. On most respins the skull adds value: a new frame (up to ×100), a frame levelled up, a jackpot doubled, or the Full House multiplier raised (up to ×10).</li></ul>
  <h3>How results are set</h3>
  <ul>${OPT('steady') ? `<li>The total win of a Hold &amp; Win follows a published distribution of results. A standard Hold &amp; Win rarely pays less than about 30×; the typical one pays about 50–55× and it averages about 62×. A Super Hold &amp; Win never pays less than 90× and averages about 162×.</li>`
    : `<li>The total win of a Hold &amp; Win follows a published distribution of results. Over all bonuses from the base game (standard and Super together): about 1 in 10 pays under 13×, the typical bonus pays about 68×, about 1 in 10 pays 120× or more and about 1 in 100 pays 250× or more. A Super Hold &amp; Win never pays less than 90×.</li>`}
    <li>A <b>Buy Feature</b> follows its own published distribution: ${OPT('steady') ? 'it rarely pays less than about 40×, the typical bought bonus pays about 65× and it averages about 78×' : 'the typical bought bonus pays about 65×, about 1 in 10 pays under 19× and about 1 in 10 pays 145× or more'}. A <b>Super Buy</b> follows the Super's distribution.</li>
    <li>A <b>Loco Spin</b> always pays between ${c.loco?.minX ?? 1}× and ${c.loco?.maxX ?? 40}×; the typical Loco Spin pays about 2×.</li>
    <li>Every result shown is a complete play of the feature by the rules above. Base-game spins, Mystery reveals, Coins and Coin Save play with their natural odds. Coins on a spin that does not start Hold &amp; Win show values from their own table and pay nothing.</li></ul>
  <h3>Double Chance &amp; Buy Feature</h3>
  <ul><li><b>Double Chance</b> raises the total bet to ${c.modes.double.costPct / 100}×. Hold &amp; Win triggers about twice as often. The feature is the same and the RTP is about the same. Line wins, Loco Spins, Coins and jackpots are paid on the base bet.</li>
  <li><b>Buy Feature</b> starts Hold &amp; Win immediately for ${c.modes.buy.costPct / 100}× the bet, usually with 4 Coins, 1 or 2 multiplier frames and 3 respins. In a bought feature, Coins land more often, respin Coins are 2× or more, Coins step frames up to ×5, and the skull's frames go up to ×10.</li>
  ${c.modes.superbuy ? `<li><b>Super Buy</b> starts a Super Hold &amp; Win immediately for ${c.modes.superbuy.costPct / 100}× the bet, with 4–6 Coins.</li>` : ''}</ul>
  <h3>Paylines</h3><div class="lines-grid">${lines}</div>
  <p class="muted">Malfunction voids all pays and plays. Math v${c.mathVersion} · ${c.gameId}</p>`;
}

// Two buys - Hold & Win (80x) and Super Hold & Win (167x), v0.63. The panel remembers the last choice.
S.buyKind = 'buy';
const buyCost = (i, kind = S.buyKind) => S.cfg.bets[i] * (S.cfg.modes[kind]?.costPct ?? 0) / 100;
function openBuy() { openModal(buyHTML(), body => { bindBuyStake(body); body.querySelector('#buyConfirm').onclick = () => { closeModal(); playRound(S.buyKind); }; }); }
function buyHTML() {
  if (!S.cfg.modes.superbuy) S.buyKind = 'buy';
  const stake = buyCost(S.betIdx);
  // brief s04: themed heading and BUY type, BONUS set into the coin's mouth plate like its own lettering
  const coin = symbolSVG('C_GRAND', `<span class="coin-label in-band mouth cjp cjp-GRAND buy-bonus" style="top:${COIN_BAND_TOP};--n:5">BONUS</span>`);
  const x = k => `${Math.round(S.cfg.modes[k].costPct / 100)}× BET`;   // Super buy 150x (0.6.0)
  const tabs = S.cfg.modes.superbuy ? `<div class="buy-kinds" role="tablist">
    <button class="bk${S.buyKind === 'buy' ? ' on' : ''}" data-k="buy" role="tab"><b>HOLD &amp; WIN</b><small>${x('buy')}</small></button>
    <button class="bk super${S.buyKind === 'superbuy' ? ' on' : ''}" data-k="superbuy" role="tab"><b>SUPER</b><small>${x('superbuy')}</small></button></div>` : '';
  return `<div class="buy-card buy27"><h2 class="buy-title" id="buyTitle">${S.buyKind === 'superbuy' ? 'BUY SUPER HOLD &amp; WIN' : 'BUY HOLD &amp; WIN'}</h2>
  ${tabs}
  <div class="buy-coin${S.buyKind === 'superbuy' ? ' super' : ''}">${coin}</div>
  <div class="cost" id="buyCostBig">${fmt(stake)}</div>
  <div class="buy-stake"><button class="bs-btn" id="bsDown" aria-label="Lower bet">−</button>
    <div class="bs-val"><small>BET</small><b id="bsBet">${fmt(bet())}</b></div>
    <button class="bs-btn" id="bsUp" aria-label="Raise bet">+</button></div>
  <p class="buy-note" id="bsNote" hidden></p>
  <button class="btn-primary buy-go" id="buyConfirm">BUY</button></div>`;
}
/** v0.25: the buy box has its own stake +/-; it moves the game bet, and the price follows. */
function bindBuyStake(body) {
  const sync = () => {
    body.querySelector('#bsBet').textContent = fmt(bet());
    body.querySelector('#buyCostBig').textContent = fmt(buyCost(S.betIdx));
    body.querySelector('#bsDown').disabled = S.betIdx === 0;
    const upOk = S.betIdx < S.cfg.bets.length - 1 && buyCost(S.betIdx + 1) <= S.cfg.buyMaxStake;
    body.querySelector('#bsUp').disabled = !upOk;
    const tooHigh = buyCost(S.betIdx) > S.cfg.buyMaxStake, afford = S.balance >= buyCost(S.betIdx) && !tooHigh;
    body.querySelector('#buyConfirm').disabled = !afford;
    const note = body.querySelector('#bsNote'); note.hidden = afford; note.textContent = afford ? '' : tooHigh ? 'Not available at this bet: lower the bet' : 'Not enough balance for this bet';
    const c = body.querySelector('#buyCostBig'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
  };
  const step = d => { const n = S.betIdx + d; if (n < 0 || n >= S.cfg.bets.length || (d > 0 && buyCost(n) > S.cfg.buyMaxStake)) return; S.betIdx = n; audio.play('button'); refreshCoins(); updateHud(); refreshMeter(); sync(); };
  body.querySelector('#bsDown').onclick = () => step(-1);
  body.querySelector('#bsUp').onclick = () => step(1);
  body.querySelectorAll('.bk').forEach(btn => { btn.onclick = () => { S.buyKind = btn.dataset.k; audio.play('button');
    body.querySelectorAll('.bk').forEach(o => o.classList.toggle('on', o === btn));
    body.querySelector('#buyTitle').innerHTML = S.buyKind === 'superbuy' ? 'BUY SUPER HOLD &amp; WIN' : 'BUY HOLD &amp; WIN';
    body.querySelector('.buy-coin').classList.toggle('super', S.buyKind === 'superbuy'); sync(); }; });
  sync();
}
/**
 * Brief s21: ordinary base-game wins. The top edge of the win bar lights with warm gold, the exact amount gives a small
 * pulse and returns, and a compact splash of gold light and sparks rises from several points across the bar (no coin
 * shapes; everything sits behind the digits). Overlaps the existing feedback; no pause, no dismissal step.
 */
function winBarFX() {
  const host = winBarFX.ensure();
  const rm = reducedMotion();
  host.classList.remove('go', 'big'); void host.offsetWidth; host.classList.add('go');
  // checklist 19: ordinary wins get the local, smaller version — pulse 1.08-1.12, settling in 160-220 ms, no jolt
  // v0.67 (checklist 2): three clear beats (about 1.28x, 0.45 s each, the last a little softer) so the eye goes to the amount
  if (!rm) { const k = PRES.baseWinScale, el = $('#msgText');
    el.animate([{ scale: '1' }, { scale: String(k), offset: .3 }, { scale: '1', offset: .5 }, { scale: String(k), offset: .63 }, { scale: '1', offset: .8 }, { scale: String(1 + (k - 1) * .6), offset: .9 }, { scale: '1' }],
      { duration: PRES.baseWinPulse * 3, easing: 'cubic-bezier(.3,.9,.4,1)' }); }
  audio.play('poof');
  if (rm) return;
  host.querySelector('.wb-sparks').innerHTML = '';
  goldDust();   // v0.49 item 37: fine gold dust falling from the bar (replaces the chunky upward sparks)
}
/**
 * v0.49 (client item 37): after a base-game win, fine gold dust drifts DOWN from the win bar: many tiny, round, soft
 * glowing particles, twinkling as they fall and fade. Drawn on a canvas at the screen's real resolution (the old sparks
 * were small blocks in layout units, scaled up with the game, so they looked chunky / low resolution).
 */
function goldDust(power = 1) {
  const bar = $('#msgBar'); if (!bar) return;
  const br = bar.getBoundingClientRect(); if (!br.width) return;
  let cv = goldDust.cv;
  if (!cv) { cv = goldDust.cv = document.createElement('canvas'); cv.id = 'goldDust';
    Object.assign(cv.style, { position: 'fixed', pointerEvents: 'none', zIndex: 40 }); document.body.append(cv); }
  const dpr = window.devicePixelRatio || 1, padX = br.width * 0.04, H = br.height * 4.2;
  Object.assign(cv.style, { left: `${br.left - padX}px`, top: `${br.top}px`, width: `${br.width + 2 * padX}px`, height: `${H}px` });
  cv.width = Math.round((br.width + 2 * padX) * dpr); cv.height = Math.round(H * dpr);
  const c = cv.getContext('2d'), W = cv.width, Hh = cv.height, n = Math.round(150 * power);
  const parts = Array.from({ length: n }, () => ({ x: (padX + Math.random() * br.width) * dpr, y: (br.height * (0.25 + Math.random() * 0.6)) * dpr,
    vx: (Math.random() - .5) * 0.02 * dpr, vy: (0.01 + Math.random() * 0.035) * dpr, r: (0.5 + Math.random() * 0.9) * dpr, life: 900 + Math.random() * 900,
    d: Math.random() * 260, tw: Math.random() * 6.28 }));
  cancelAnimationFrame(goldDust.raf); const t0 = performance.now();
  const frame = now => { const t = now - t0; c.clearRect(0, 0, W, Hh); c.globalCompositeOperation = 'lighter'; let alive = 0;
    for (const q of parts) { const u = (t - q.d) / q.life; if (u < 0 || u > 1) { if (u < 0) alive++; continue; } alive++;
      const x = q.x + q.vx * (t - q.d), y = q.y + q.vy * (t - q.d) + 0.000012 * dpr * (t - q.d) ** 2;
      const a = (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85) * (0.55 + 0.45 * Math.sin(t / 70 + q.tw));
      const g = c.createRadialGradient(x, y, 0, x, y, q.r * 3); g.addColorStop(0, `rgba(255,246,200,${a.toFixed(3)})`); g.addColorStop(0.35, `rgba(255,205,90,${(a * 0.7).toFixed(3)})`); g.addColorStop(1, 'rgba(255,170,40,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, q.r * 3, 0, 6.283); c.fill(); }
    if (alive) goldDust.raf = requestAnimationFrame(frame); else c.clearRect(0, 0, W, Hh); };
  goldDust.raf = requestAnimationFrame(frame);
}
winBarFX.ensure = () => { let host = $('#wbFx');
  if (!host) { host = document.createElement('div'); host.id = 'wbFx'; host.innerHTML = '<i class="wb-edge"></i><i class="wb-bloom"></i><i class="wb-rays"></i><i class="wb-core"></i><div class="wb-sparks"></div>'; $('#msgBar').before(host); }
  return host; };

function autoHTML() {
  const last = String(S.autoN || 100);   // s9: 100 until the player picks a count, then their last starting count
  return `<h2>Autoplay</h2><p>Number of spins</p>
  <div id="autoCounts">${[10, 25, 50, 100, 500, '∞'].map(n => `<button class="btn-ghost ${String(n) === last ? 'sel' : ''}" data-n="${n}">${n}</button>`).join('')}</div>
  <h3>Stop</h3>
  <div><button class="btn-ghost" id="aStopF">When Hold &amp; Win triggers</button><button class="btn-ghost" id="aStopB">On a win ≥ 50×</button></div>
  <div style="text-align:center;margin-top:24px"><button class="btn-primary" id="autoGo">START</button></div>`;
}

async function historyHTML() {
  const h = await rgs.history();
  const rows = h.history.slice(0, 30).map(r => `<tr><td>${r.time.slice(11, 19)}</td><td>${({ base: 'Spin', double: 'Double Chance', buy: 'Buy', superbuy: 'Super Buy' })[r.mode] || r.mode}</td><td>${fmt(r.stake)}</td><td>${fmt(r.win)}</td></tr>`).join('');
  return `<h2>History</h2><p class="muted">${h.rounds} rounds this session · balance ${fmt(h.balance)}</p>
  <table class="hist"><tr><th>Time</th><th>Mode</th><th>Stake</th><th>Win</th></tr>${rows || '<tr><td colspan=4>No rounds yet</td></tr>'}</table>`;
}

function devHTML() {
  return `<button class="set-link" type="button" onclick="window.__fxLabOpen && window.__fxLabOpen()">FX TEST panel</button><h2>Developer</h2><p class="muted">Local mock RGS only — forces re-draw the round server-side until the situation occurs. Not available on the real RGS.</p>
  <div class="dev-grid">
    <button data-f="feature">Next spin: Hold &amp; Win</button>
    <button data-f="rescue">Next spin: Coin Rescue</button>
    <button data-f="rescueFail">Next spin: Coin Rescue fails</button>
    <button data-f="featRescue">Next spin: feature with a rescue</button>
    <button data-f="featFail">Next spin: feature with a failed rescue</button>
    <button data-f="big">Next spin: 200×+ win</button>
    <button data-f="loco">Next spin: Loco Spin</button>
    <button data-f="locoBig:3">Next spin: Loco Spin ×3+</button>
    <button data-f="fullHouse">Next spin: Full House</button>
    <button data-st="1">Super tease: show on every last hole (on/off)</button>
    <button data-f="stepUp">Next spin: skull steps up a frame</button>
    <button data-f="jpGrow">Next spin: jackpot doubles</button>
    <button data-f="potWin">Next spin: pot win (pots on)</button>
    <button data-f="potTease">Next spin: pot tease (pots on)</button>
    <button data-f="potJp">Next spin: pot eats a jackpot (pots on)</button>
    <button data-f="pots2">Next spin: two pots (pots on)</button>
    <button data-f="jpDouble">Next spin: upgraded jackpot won</button>
    <button data-f="frameWon:20">Next spin: ×20+ frame won</button>
    <button data-f="super">Next spin: Super (meter fills)</button>
    <button data-f="superFull">Next spin: Super Full House</button>
    <button data-f="">Clear</button>
  </div>
  <h3>Last round record</h3><pre class="dev-log">${S.last ? JSON.stringify(S.last, null, 1).slice(0, 12000) : 'none yet'}</pre>`;
}

// ---------- controls ----------
function bind() {
  // v0.58 (client): in Hold & Win there is no spin button, so a tap anywhere below the grid skips: the spinning
  // squares land at once, and during the collect the values go straight to the total
  stage.addEventListener('pointerdown', e => {
    const idle = performance.now() - (S.lastTouch || performance.now()); S.lastTouch = performance.now();
    if (!S.inFeature || !document.body.classList.contains('feature-mode') || document.body.classList.contains('celebrating') || e.target.closest('button, a, .modal, #settingsBtn')) return;   // the win screens handle their own taps
    // v0.62m (client): where the screen can't be kept awake, a tap after 20 s without any touch is taken as waking a
    // dimmed phone screen, so it does not skip; the next tap does
    if (!wakeLock && idle > 20000 && e.pointerType === 'touch') return;   // v0.72: touch only - a mouse click always skips
    // v0.62e (client): a tap ANYWHERE in the bonus skips (it was only below the win bar, which the last-squares push-in
    // moves down, so taps on the grid there were ignored); it also hurries the skull (see runSkullActions)
    requestSkip();
  });
  const click = (id, fn) => { $(id).addEventListener('click', e => { audio.unlock(); fn(e); }); };
  click('#spinBtn', () => {
    // During autoplay or a playing round the spin button skips: reels slam, counts and collects finish.
    if (S.busy || S.auto.running) { requestSkip(); return; }
    playRound(modeName());
  });
  click('#betDown', () => { if (S.betIdx > 0) { S.betIdx--; audio.play('button'); refreshCoins(); updateHud(); refreshMeter(); } });
  click('#betUp', () => { if (S.betIdx < S.cfg.bets.length - 1) { S.betIdx++; audio.play('button'); refreshCoins(); updateHud(); refreshMeter(); } });
  click('#extraBtn', () => { S.extra = !S.extra; audio.play('button'); updateHud(); extraTip(S.extra); refreshMeter(); });
  click('#turboBtn', () => { S.turbo = !S.turbo; audio.play('button'); updateHud(); });
  click('#soundBtn', () => { S.sound = !S.sound; audio.setEnabled(S.sound); savePrefs(); syncLaunchSound(); updateHud(); });
  click('#settingsBtn', () => openModal(settingsHTML(), mountSettings));
  click('#infoBtn', () => openModal(infoHTML()));
  click('#historyBtn', async () => openModal(await historyHTML()));
  // s8: rules, history and settings live behind the menu icon in the bottom strip
  click('#menuBtn', () => openModal(`<h2>Menu</h2><div class="menu26">
    <button class="btn-ghost" data-feat="1">Game features</button><button class="btn-ghost" data-go="#infoBtn">Paytable &amp; rules</button><button class="btn-ghost" data-go="#historyBtn">Game history</button><button class="btn-ghost" data-go="#settingsBtn">Settings</button></div>`,
    body => { body.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => { closeModal(); setTimeout(() => $(b.dataset.go).click(), 60); }; });
      body.querySelector('[data-feat]').onclick = () => { closeModal(); setTimeout(() => showFeatures(false), 60); }; }));
  const openDev = () => openModal(devHTML(), body => { const st = body.querySelector('[data-st]');   // v0.62l: testing switch for the super tease
    if (st) st.onclick = () => { window.__superTease = window.__superTease === 'always' ? null : 'always'; toast(window.__superTease ? 'Super tease: every last hole (once per bonus)' : 'Super tease: normal odds'); };
    body.querySelectorAll('[data-f]').forEach(btn => { btn.onclick = () => { S.pendingForce = btn.dataset.f || null; toast(S.pendingForce ? `Next spin forced: ${S.pendingForce}` : 'Force cleared'); closeModal(); }; }); });
  window.__openDev = openDev;
  click('#buyBtn', () => openBuy());
  click('#autoBtn', () => {
    if (S.auto.running) { S.auto.stopRequested = true; stopAuto(); return; }
    if (S.busy) return;
    openModal(autoHTML(), body => {
      const parse = v => (v === '∞' ? Infinity : Number(v));
      let n = parse(String(S.autoN || 100)), sf = false, sb = false;
      body.querySelectorAll('[data-n]').forEach(btn => { btn.onclick = () => { body.querySelectorAll('[data-n]').forEach(x => x.classList.remove('sel')); btn.classList.add('sel'); n = parse(btn.dataset.n); S.autoN = btn.dataset.n; savePrefs(); }; });
      body.querySelector('#aStopF').onclick = e => { sf = !sf; e.currentTarget.classList.toggle('sel', sf); };
      body.querySelector('#aStopB').onclick = e => { sb = !sb; e.currentTarget.classList.toggle('sel', sb); };
      body.querySelector('#autoGo').onclick = () => { closeModal(); startAuto(n, sf, sb); };
    });
  });
  document.addEventListener('keydown', e => {
    // v0.72 (desktop): Escape closes the menu, the Summary or a dialog; Space or Enter spins / skips, never while a menu,
    // a dialog or a text field has the keyboard
    if (e.code === 'Escape') { if ($('#summary')) { Summary.close(); return; } if ($('#verPop')) { document.body.click(); return; } if (!$('#modal').classList.contains('hidden')) { closeModal(); return; } return; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { if (e.target.closest?.('button, input, textarea, select, a')) return; }
    else if (e.code !== 'Space') return;
    if (!$('#modal').classList.contains('hidden') || $('#verPop') || $('#summary') || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.target.closest?.('#lSound')) return;   // the intro sound switch handles its own key; it never launches the game
    e.preventDefault();
    const play = $('#playBtn');
    if (play) { if (!play.disabled) play.click(); return; } // launch screen still up
    $('#spinBtn').click();
  });
}

/** The candle meter belongs to the mode and bet level being played: reload it when either changes. */
async function refreshMeter() { if (!candles.el) return; try { S.meterState = await rgs.meter(bet(), modeName(), S.profile); } catch { /* older RGS: keep the last state */ }
  if (S.meterState?.n) candles.n = S.meterState.n; candles.render(S.meterState); }
function refreshCoins() { if (!S.busy) { reels.setGrid(reels.current, [...(reels.currentCoins?.values() ?? [])].map(c => c)); reels.relabel(); } }

// ---------- boot ----------
function applyBackgrounds() {
  const land = false;   // v0.24: portrait art everywhere
  const pick = k => ASSETS.backgrounds[`${k}_${land ? 'landscape' : 'portrait'}`] || ASSETS.backgrounds[`${k}_${land ? 'portrait' : 'landscape'}`];
  const base = pick('base'), feat = pick('feature') || base;
  document.body.classList.toggle('has-bg', !!base);
  if (base && !ART_V2) $('.bg-base').style.backgroundImage = `url("${base}")`;   // v0.53: the art pack sets its own (layoutBackgroundV2)
  if (feat && !ART_V2) $('.bg-feature').style.backgroundImage = `url("${feat}")`;
  layoutBackground();
}
addEventListener('resize', () => { if (Object.keys(ASSETS.backgrounds).length) applyBackgrounds(); });

// ---------- brief s02: intro screen ----------
const LAUNCH_GAP = 75.5;   // A01: 44 reference px at the 0.583 reference scale, in stage px (scales with the stage)
/** Visible top/bottom of a launch row in #launch layout px (transform-free): text rows use the real glyph box. */
function launchVis(el) {
  const top = el.offsetTop + (el.offsetParent !== $('#launch') ? el.offsetParent.offsetTop : 0);
  if (el.matches('.l-tag span')) {
    const cs = getComputedStyle(el), cv = launchVis.cv || (launchVis.cv = document.createElement('canvas')), g = cv.getContext('2d');
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = g.measureText(el.textContent.trim()); const fa = m.fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * .9, fd = m.fontBoundingBoxDescent ?? parseFloat(cs.fontSize) * .25;
    const lh = parseFloat(cs.lineHeight) || fa + fd; const base = top + (lh - (fa + fd)) / 2 + fa;
    return [base - m.actualBoundingBoxAscent, base + m.actualBoundingBoxDescent];
  }
  if (el.id === 'playBtn') return [top, top + el.offsetHeight + 6];   // the button's solid 6 px lip is part of its artwork
  if (el.matches('.l-sound')) { const pill = el.querySelector('.ls-pill'); const b = el.querySelector('.l-sound-btn');
    return [top + b.offsetTop + pill.offsetTop, top + b.offsetTop + pill.offsetTop + pill.offsetHeight]; }
  return [top, top + el.offsetHeight];
}
/** Equal visible gaps between the five intro rows (feature line, jackpot line, loading bar, Play, SOUND). */
window.__launchVis = (...a) => launchVis(...a);
function layoutLaunch() {
  const L = $('#launch'); if (!L) return;
  const rows = [...L.querySelectorAll('.l-tag span'), L.querySelector('.l-load'), L.querySelector('#playBtn'), L.querySelector('.l-sound')];
  for (let i = 1; i < rows.length; i++) {
    const el = rows[i]; el.style.marginTop = '0px';
    const gap = launchVis(el)[0] - launchVis(rows[i - 1])[1];
    el.style.marginTop = `${(LAUNCH_GAP - gap).toFixed(2)}px`;
  }
  // v0.74 (desktop D1): in the wide frame the whole intro (logos, tag lines, loading bar, PLAY, SOUND, version line) is
  // scaled as one so it all sits inside the 1080 px frame with room under the SOUND switch; the screen stays covered
  L.style.zoom = ''; L.style.width = ''; L.style.height = '';
  if (stage.classList.contains('wide')) { const sd = L.querySelector('.l-sound'), bottom = sd ? sd.offsetTop + sd.offsetHeight + 96 : L.scrollHeight;   // room under SOUND for the version line
    const z = Math.min(1, 1080 / Math.max(1, bottom));
    if (z < 1) { L.style.zoom = z.toFixed(4); L.style.width = `${(1920 / z).toFixed(1)}px`; L.style.height = `${(1080 / z).toFixed(1)}px`; L.style.inset = 'auto'; L.style.left = '0'; L.style.top = '0'; } }
}
/**
 * v0.62f (client): the feature guide - four picture pages (Hold & Win, Coin Save, multipliers & jackpots, Super Hold &
 * Win) built from the game's own art. Opens after PLAY until the player ticks "Don't show again", and from the menu.
 * A first version for the client to refine (wording and pictures).
 */
const FEATURE_PAGES = [
  { t: 'HOLD &amp; WIN', d: 'Land <b>4 or more Coins</b> to start Hold &amp; Win. Coins lock in place and every new Coin resets the respins to 3.',
    art: () => `<div class="fg-row">${[['sym', '1.00'], ['sym', '5.00'], ['MINI', 'MINI'], ['sym', '2.00']].map(([k, v], i) => fgCoin(k, v, i)).join('')}</div>` },
  { t: 'COIN SAVE', d: 'Land <b>3 Coins</b> and the Poco Loco skull may fire in extra Coins to start the bonus, or to keep it going when the respins run out.',
    art: () => `<div class="fg-save"><img class="fg-skull" src="${ASSETS.ui.skullJ3 || ''}" alt=""><i class="fg-trail t1"></i><i class="fg-trail t2"></i>${fgCoin('sym', '3.00', 0, 'fly1')}${fgCoin('sym', '8.00', 1, 'fly2')}</div>` },
  { t: 'MULTIPLIERS &amp; JACKPOTS', d: 'In the bonus the skull fires <b>multipliers</b> onto the grid and can <b>double the jackpots</b>. Fill all 10 positions for a <b>FULL HOUSE ×2</b>.',
    art: () => `<div class="fg-mult">${fgCoin('GRAND', 'GRAND', 0, 'big')}<span class="fg-badge">×10</span><div class="fg-jps"><img src="./assets/reels_v21/ui/jp_mini.webp" alt=""><span class="fg-jpv">${S.cfg?.jackpotsBU?.MINI ? fmt(buToMinor(S.cfg.jackpotsBU.MINI * 2)) : ''}</span><span class="fg-x2">×2</span></div></div>` },
  { t: 'SUPER HOLD &amp; WIN', d: 'Any Hold &amp; Win can be <b>upgraded to SUPER</b> as it starts: 4 respins, bigger multipliers and a Full House from <b>×3</b>.',
    art: () => `<div class="fg-super"><img src="./assets/reels_v21/super_badge.webp" alt=""></div>` },
];
function fgCoin(kind, label, i, cls = '') {
  const src = kind === 'sym' ? './assets/reels_v21/sym_coin.webp' : `./assets/coins/v3/${kind}.webp`;
  return `<div class="fg-coin ${kind === 'sym' ? 'fg-cash' : 'fg-jpc'} ${cls}" style="--i:${i}"><img src="${src}" alt=""><span>${label}</span></div>`;
}
function showFeatures(fromLaunch = false) {
  $('#features')?.remove();
  const el = document.createElement('div'); el.id = 'features';
  el.innerHTML = `<div class="fg-card"><div class="fg-pages">${FEATURE_PAGES.map((p, i) => `<section class="fg-page" data-i="${i}"><div class="fg-art">${p.art()}</div><h3>${p.t}</h3><p>${p.d}</p></section>`).join('')}</div>
    <div class="fg-nav"><button class="fg-prev" aria-label="Previous">‹</button><div class="fg-dots">${FEATURE_PAGES.map((_, i) => `<i data-i="${i}"></i>`).join('')}</div><button class="fg-next" aria-label="Next">›</button></div>
    <button class="btn-primary fg-go">${fromLaunch ? 'PLAY' : 'CLOSE'}</button>
    ${fromLaunch ? '<label class="fg-hide"><input type="checkbox"> Don\'t show again</label>' : ''}</div>`;
  $('#stage').append(el);
  let cur = 0; const pages = [...el.querySelectorAll('.fg-page')], dots = [...el.querySelectorAll('.fg-dots i')];
  const go = i => { cur = (i + pages.length) % pages.length; pages.forEach((p, k) => p.classList.toggle('on', k === cur)); dots.forEach((d, k) => d.classList.toggle('on', k === cur)); };
  go(0);
  el.querySelector('.fg-prev').onclick = () => go(cur - 1); el.querySelector('.fg-next').onclick = () => go(cur + 1);
  dots.forEach(d => { d.onclick = () => go(+d.dataset.i); });
  let x0 = null; el.addEventListener('pointerdown', e => { x0 = e.clientX; }); el.addEventListener('pointerup', e => { if (x0 != null && Math.abs(e.clientX - x0) > 40) go(cur + (e.clientX < x0 ? 1 : -1)); x0 = null; });
  el.addEventListener('pointerdown', e => e.stopPropagation()); el.addEventListener('click', e => e.stopPropagation());
  el.querySelector('.fg-go').onclick = () => { if (el.querySelector('.fg-hide input')?.checked) savePrefsPatch({ hideFeatures: true });
    el.classList.add('out'); setTimeout(() => el.remove(), 320); audio.play('button'); };
  requestAnimationFrame(() => el.classList.add('show'));
}
window.__showFeatures = showFeatures;
function syncLaunchSound() {
  const b = $('#lSound'); if (!b) return;
  b.setAttribute('aria-checked', String(S.sound)); b.classList.toggle('off', !S.sound);   // checklist 2: ON = knob left, ON right; OFF = OFF left, knob right
}
function bindLaunchSound() {
  const b = $('#lSound'); if (!b) return;
  syncLaunchSound();
  b.addEventListener('click', e => {   // never launches the game, never reaches the Play handler
    e.stopPropagation(); e.preventDefault();
    S.sound = !S.sound; audio.setEnabled(S.sound); savePrefs(); syncLaunchSound(); if (S.cfg) updateHud();
  });
}

async function boot() {
  document.body.classList.add('launching');
  // v0.38 trial: a matte finish over the surround and the symbols (?matte=0 turns it off for comparison)
  document.body.classList.toggle('matte', !/[?&]matte=0/.test(location.search));
  // v0.41 clarity: resting symbols are shown exactly as drawn - no idle breathing / sway / glint (?idle=1 brings them back)
  document.body.classList.toggle('idle-fx', /[?&]idle=1/.test(location.search));
  await loadManifest(); applyPrefs(); bindLaunchSound();
  // v0.31: decode every symbol up front at full size so landed symbols never show a low-resolution first decode
  // v0.50: the reel art pack too (symbols, spin sprites, surround, win bar, background): every file is downloaded and
  // decoded before Play is enabled, and kept referenced so the browser keeps it ready (no empty squares on a slow line)
  const bar0 = $('#loadBar'); let done = 0;
  const pre = [...Object.values(ASSETS.symbols), ...(ART_V2 ? V2_FILES : [])];
  window.__preloaded = await Promise.all(pre.map(src => new Promise(res => { const im = new Image(); im.decoding = 'async'; if (V2_CORS(src)) im.crossOrigin = 'anonymous';
    const fin = () => { done++; if (bar0) bar0.style.width = `${(5 + 30 * done / pre.length).toFixed(1)}%`; res(im); };
    im.onload = () => (im.decode ? im.decode().catch(() => {}).then(fin) : fin()); im.onerror = fin; im.src = src; })));
  // v0.62e (client): the win-screen art (characters, altar) is not needed to
  // start playing: it downloads in the background once the game has opened, so it is ready before the first bonus
  setTimeout(() => { const later = [ASSETS.ui.char_mega, ASSETS.ui.char_big, ASSETS.ui.char_epic, ASSETS.ui.altar].filter(Boolean);
    window.__later = later.map(src => { const im = new Image(); im.decoding = 'async'; im.src = src; return im; }); }, 2500);
  document.fonts?.ready.then(layoutLaunch); requestAnimationFrame(layoutLaunch);
  injectSprite(); ensureWildDefs(); fit(); applyBackgrounds();
  if (ASSETS.ui.logo) {
    let J = [ASSETS.ui.skullJ0, ASSETS.ui.skullJ1, ASSETS.ui.skullJ2, ASSETS.ui.skullJ3];
    if (J.every(Boolean)) { SKULL = SKULL_V3; JAW_MAX = 3; } else { J = J.slice(0, 3); if (J.every(Boolean)) SKULL = SKULL_V2; }
    const box = () => `left:${SKULL.l * 100}%;top:${SKULL.t * 100}%;width:${SKULL.w * 100}%;height:${SKULL.h * 100}%`;
    const sk = SKULL !== SKULL_V1
      ? `<div class="lskull v2" data-j="0" style="${box()}">${J.map((src, i) => `<img class="sk-f j${i}" src="${src}" alt="">`).join('')}${J.map((src, i) => `<img class="sk-g j${i}" src="${src}" alt="">`).join('')}<i class="sk-eye l"></i><i class="sk-eye r"></i><i class="sk-spark"></i></div>`
      : ASSETS.ui.skull ? `<div class="lskull" style="left:${SKULL.l * 100}%;top:${SKULL.t * 100}%;width:${SKULL.w * 100}%;height:${SKULL.h * 100}%"><i class="sk-mouth"></i><img class="sk-top" src="${ASSETS.ui.skull}" alt=""><img class="sk-jaw" src="${ASSETS.ui.skull}" alt=""><img class="sk-top sk-g" src="${ASSETS.ui.skull}" alt=""><img class="sk-jaw sk-g" src="${ASSETS.ui.skull}" alt=""><i class="sk-eye l"></i><i class="sk-eye r"></i><i class="sk-spark"></i></div>` : '';
    $('.logo').innerHTML = `<i class="logo-glow"></i><img class="logo-img" src="${ASSETS.ui.logo}" alt="Poco Loco">${sk}`;
    $('.l-title').innerHTML = `<img class="logo-img" src="${ASSETS.ui.logo}" alt="Poco Loco">`;
  }
  // v0.8 frame art: crest behind the logo, ornate win-bar panel on a shelf under the grid
  // v0.9 structure: chapel facade crowning the reels, pillars either side, altar steps below, guardian statues
  const U = ASSETS.ui, img = (src, cls) => (src ? `<img class="${cls}" src="${src}" alt="" draggable="false">` : '');
  // v0.11 structure art (simplified, Mayan Coins level of detail): lintel behind the top of the grid,
  // pillars beside the side reels, plinth carrying the win bar, guardian statues (desktop)
  if (!ART_V2) $('.frame-top').innerHTML = img(U.statue, 'st-statue l') + img(U.statueR, 'st-statue r');   // v0.53: not shown with the art pack
  // v0.13 Mayan-structure frame: one set of pieces assembled to the measured blueprint, drawn above the reel well
  // but below the symbols — frieze, side frames (with carved strips), middle frame, base block, corner urns.
  if (U.frameSide) {
    const fa = document.createElement('div'); fa.id = 'frameArt';
    if (!ART_V2) fa.innerHTML = `<div class="m-frieze" style="background-image:url(${U.stoneBand || U.frieze2})"></div>` + img(U.frameSide, 'm-side l') + img(U.frameSide, 'm-side r')
      + (U.rail ? `<div class="m-base2" style="--rail:url(${U.rail});--stone:url(${U.stoneBase || U.stoneDark})"><i class="r t"></i><i class="r b"></i></div>` : img(U.base2, 'm-base')) + img(U.midTop, 'm-cap top') + img(U.midBot, 'm-cap bot') + '<div class="m-post l"></div><div class="m-post r"></div>' + img(U.urn, 'm-urn l') + img(U.urnR, 'm-urn r');
    if (U.surround) { fa.innerHTML = ART_V2 ? '' : '<div class="m-well"></div>' + img(U.surround, 'm-full'); document.body.classList.add('full-surround'); if (!/[?&]util=bottom/.test(location.search)) document.body.classList.add('util-top'); fit(); }
    $('#machine').insertBefore(fa, $('#reelFrame'));
    document.body.classList.toggle('art-v2', ART_V2);
    document.body.classList.add('mayan-frame');
    if (U.surround && U.plaque && !ART_V2) $('#msgBar').insertAdjacentHTML('beforebegin', img(U.plaque, 'm-plaque'));
    if (U.surround) bonusLayers(fa, ART_V2 ? null : U.surround);
    // v0.40: the restored v0.25 surround (frame3/surround_sq9) has its own extents: crown top at game y 76.8, plaque
    // bottom at 1113.5, outer edges 391 either side of the centre (it bleeds off narrow screens, as it did in v0.25)
    if (U.surround && /surround_sq9/.test(U.surround)) { document.body.classList.add('surround-sq9'); Object.assign(ASM, { top: 76.8, bottom: 1113.5, half: 391 }); }
    // v0.43: the stone kit frame (frame10, tools/build_surround6.py geometry.json)
    if (U.surround && /frame10\//.test(U.surround) && !ART_V2) { document.body.classList.add('surround-f10'); Object.assign(ASM, { top: 223, bottom: 1075.8, half: 354.2 }); }
    if (U.surround) { const m = $('#machine'); m.style.transformOrigin = `${MACHINE.ox}px ${MACHINE.oy}px`; m.style.transform = `translate(${MACHINE.dx}px, ${MACHINE.dy}px) scale(${MACHINE.k})`;
      // v0.35: the win bar's text and the HUD live in one wrapper that scales with the reel assembly (checklist 7)
      const ab = document.createElement('div'); ab.id = 'asmBar'; $('#msgBar').before(ab); ab.append(...[$('.m-plaque'), $('#msgBar'), $('#featureHud')].filter(Boolean));
      if (ART_V2) buildV2Surround($('#machine'), ab);   // v0.47: sandstone frames, gold and outer pillars, top cap, win bar
      fit(); }
  }
  document.body.classList.add('has-structure', 'v10');
  document.body.classList.toggle('has-structure-art', !!U.lintel);
  $('.frame-base').innerHTML = U.frameSide || ART_V2 ? '' : img(U.plinth, 'fb-plinth');
  document.body.classList.toggle('has-frame-art', !!(ASSETS.ui.panel || ASSETS.ui.plinth || ASSETS.ui.frameSide));
  const bar = $('#loadBar');
  bar.style.width = '35%';
  const minShow = wait(2400); // let the Studio24 ident play
  const init = await rgs.init();
  bar.style.width = '80%';
  S.cfg = init.config; S.balance = init.balance;
  if (S.cfg.modesByProfile?.[S.profile]) S.cfg.modes = S.cfg.modesByProfile[S.profile];
  // v0.49 item 44: lighting test on the premium symbols. v0.51: OFF by default - art pack v3 carries the approved
  // lighting and clean edges in the art itself (no added rim, glow, shadow or tint); ?light=1 shows the old test
  document.body.classList.toggle('premium-lit', /[?&]light=1\b/.test(location.search));   // prices for the maths profile being played
  if (S.cfg.rtpByProfile?.[S.profile]) S.cfg.rtp = S.cfg.rtpByProfile[S.profile];
  S.betIdx = Math.max(0, S.cfg.bets.indexOf(S.cfg.defaultBet));
  { const kept = verSwitch.restore();   // v0.66: the same balance and stake after a version switch (demo session)
    if (kept) { if (S.cfg.bets.includes(kept.bet)) S.betIdx = S.cfg.bets.indexOf(kept.bet);
      if (Number.isFinite(kept.balance) && rgs.session) { rgs.session.balance = kept.balance; S.balance = kept.balance; } } }
  S.cfg.paytableBU = S.cfg.paytableByProfile?.[S.profile] || S.cfg.paytableBU;
  S.cfg.loco = S.cfg.locoByProfile?.[S.profile] || S.cfg.loco;   // v0.67: the Loco Spin option's own rate and bounds   // v0.66: the Experiment has its own paytable
  money = new Intl.NumberFormat(undefined, { style: 'currency', currency: S.cfg.currency, currencyDisplay: 'narrowSymbol' });
  num = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  reels = new Reels(stage, labelFor);
  board = new FeatureBoard(stage, labelFor);
  const g = reels.randomGrid();
  const coins = g.map((s, cell) => (s === 'C' ? { cell, v: [50, 100, 200, 500][cell % 4], jp: null } : null)).filter(Boolean);
  reels.setGrid(g, coins);
  const petals = document.querySelector('.petals');
  const cols = ['#ff9a1f', '#ffb21f', '#ff2f92', '#e86a00', '#ffd23f'];
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('i'); p.className = 'petal';
    Object.assign(p.style, { left: `${Math.random() * 100}%`, background: cols[i % cols.length], animationDuration: `${9 + Math.random() * 10}s`, animationDelay: `${-Math.random() * 18}s`, transform: `scale(${0.6 + Math.random()})` });
    petals.append(p);
  }
  spinToPlay(); meter.build();
  // v0.41: no idle glint on resting tiles (its sparkle + brightness wash kept a symbol washed out every 0.7 s); ?idle=1 restores it
  if (document.body.classList.contains('idle-fx')) setInterval(() => { if (!S.busy && !document.hidden) reels.glint(); }, 700);
  // s8: Buy Feature and Extra Bet move from the notches into the control area, above the spin row
  $('.row-feat')?.append($('#buyBtn'), $('#extraBtn'));
  // v0.64: the candle meter only with ?super=meter (otherwise the Super is a random upgrade)
  { const n = S.cfg.candlesByProfile?.[S.profile]; if (n) { candles.build(n.base); await refreshMeter(); } }
  verSwitch.build();   // v0.66 test-versions switch (demo only)
  // v0.64: show the active link options on the splash footer (e.g. "v0.64 · MYSTERY LITE · SUPER METER")
  { const lab = { pace: 'PACE' };   // v0.68: the options' own badge texts come from TEST_OPTS (below)
    const mg = (location.search.match(/[?&]marigold=([a-z]+)/) || [])[1];
    const f = document.querySelector('.l-foot');
    { const t = TEST_OPTS.filter(o => needsOk(o, optVal)).map(o => o.ch.find(c => c[0] === optVal(o.k))?.[3]).filter(Boolean); if (S.profile.includes('pace')) t.unshift(lab.pace); if (f && t.length) f.textContent += ' · ' + t.join(' · '); }
    if (f && mg) f.textContent += ' · MARIGOLD ' + mg.toUpperCase(); }
  fit(); document.fonts?.ready.then(() => fit());   // v0.35: the assembly / spin row / meter layout measures the final control positions
  bind(); updateHud(); setWin(0, false); requestAnimationFrame(placeJackpots); setTimeout(placeJackpots, 600);
  await minShow;
  bar.style.width = '100%';
  const play = $('#playBtn'); play.disabled = false; play.textContent = 'Play'; layoutLaunch();
  // checklist 2: once loading completes, Play or a tap anywhere on the intro enters through the same transition, once.
  // The whole SOUND control (and its touch area) only toggles sound; it never enters.
  let entered = false;
  const enter = () => {
    if (entered) return; entered = true;
    // v0.50: on Android the game goes full screen when Play is tapped (the address and navigation bars hide, so the
    // grid gets the whole height); the player leaves it with the normal back gesture. iPhones don't allow it in Safari.
    // ?fs=0 turns it off.
    const de = document.documentElement;
    if (/Android/i.test(navigator.userAgent) && !/[?&]fs=0\b/.test(location.search) && de.requestFullscreen && !document.fullscreenElement)
      de.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    audio.unlock(); audio.startMusic('base'); setTimeout(() => audio.play('welcome'), 120);
    $('#launch').classList.add('out'); document.body.classList.remove('launching'); spinToPlay(); setTimeout(() => $('#launch').remove(), 600);
    // v0.62g (client): the feature guide does not open on launch; it is only in the menu (Game features)   // v0.27: idleTicker restarts the bar on its lead line
  };
  play.onclick = e => { e.stopPropagation(); enter(); };
  $('#launch').addEventListener('click', e => { if (e.target.closest('.l-sound')) return; enter(); });
  if (devStats.on) devStats.reset();   // v0.50: ?dev=1 session stats
  window.__game = { totalWinScene, S, reels, board, audio, playRound, PRES, winBarFX, candles, devStats, rgs, bigWin, fx, fxTop, BUY_LEVELS }; // handy for debugging / automated QA
}
boot().catch(e => { console.error(e); toast(`Could not reach the game server (${e.message})`); });


// ---------- v0.66 (checklist item 5): the test-versions switch ----------
// A small, dimmed icon to the right of the autoplay button; tap: a compact pop-up, one row per option. Choosing reloads
// the game in that version (balance and stake kept). The active versions show only as a few words on the small
// "DEMO · PLAY MONEY" line. Demo only: removed before release with the other demo tools.
const verSwitch = (() => {
  const KEEP = 'pocoLoco.keep66';
  // v0.68 (checklist 5): rows from TEST_OPTS; taps only mark a choice, APPLY reloads once with all of them
  const cur = k => optVal(k);
  const pending = {};
  const label = () => TEST_OPTS.filter(o => needsOk(o, cur)).map(o => o.ch.find(c => c[0] === cur(o.k))?.[3]).filter(Boolean).join(' · ') || 'STANDARD SET';
  let btn = null, pop = null;
  function place() {
    const a = $('#autoBtn'), host = $('#stage'); if (!btn || !a || !host) return;
    const ra = a.getBoundingClientRect(), rh = host.getBoundingClientRect(), k = rh.width / host.offsetWidth || 1;
    const hostW = host.offsetWidth, bw = btn.offsetWidth || 72;   // v0.68: right of autoplay, never off the screen
    btn.style.left = `${Math.min((ra.right - rh.left) / k + 34, hostW - bw - 4)}px`;
    btn.style.top = `${(ra.top + ra.height / 2 - rh.top) / k}px`;
  }
  function apply() {
    const u = new URL(location.href);
    for (const o of TEST_OPTS) { const v = pending[o.k] ?? cur(o.k); if (v === o.def) u.searchParams.delete(o.k); else u.searchParams.set(o.k, v); }
    try { sessionStorage.setItem(KEEP, JSON.stringify({ balance: S.balance, bet: bet() })); } catch { /* storage blocked */ }
    location.replace(u.toString());
  }
  const changed = () => TEST_OPTS.some(o => pending[o.k] !== undefined && pending[o.k] !== cur(o.k));
  function toggle(e) {
    e?.stopPropagation(); audio.play('button');
    if (pop) { pop.remove(); pop = null; return; }
    pop = document.createElement('div'); pop.id = 'verPop';
    for (const k of Object.keys(pending)) delete pending[k];
    const sel = k => pending[k] ?? cur(k);
    const preset = () => (PRESETS.find(([, , set]) => Object.entries(set).every(([k, v]) => sel(k) === v)) || ['custom'])[0];
    const draw = () => { let g = null; pop.innerHTML = `<div class="vp-row vp-pre"><span>Preset</span><div>${[...PRESETS.map(([id, l]) => [id, l]), ['custom', 'Custom']].map(([id, l]) =>
        `<button data-p="${id}" class="${preset() === id ? 'on' : ''}">${l}</button>`).join('')}</div></div>`
      + TEST_OPTS.map(o => { const head = o.g !== g ? `<div class="vp-group">${(g = o.g)}</div>` : '', off = !needsOk(o, sel);
        return head + `<div class="vp-row${off ? ' vp-off' : ''}"><span class="vp-t" data-i="${o.k}">${o.t}<i>ⓘ</i>${off ? `<em>${o.note}</em>` : ''}</span><div>${o.ch.map(([v, l]) =>
        `<button data-k="${o.k}" data-v="${v}" class="${sel(o.k) === v ? 'on' : ''}${v === o.def ? ' def' : ''}"${off ? ' disabled' : ''}>${l}</button>`).join('')}</div></div>`; }).join('')
      + `<div class="vp-act"><button class="vp-sum" data-a="sum">SUMMARY</button><span></span><button class="vp-cancel" data-a="cancel">CANCEL</button><button class="vp-apply${changed() ? '' : ' off'}" data-a="apply">APPLY</button></div>`; };
    draw();
    // v0.71 (checklist 18): a row's info card, with the live-measured figures of the choices as they stand (not applied)
    const pendingProfile = () => profileOf(sel), pendingLabel = () => { const ch = TEST_OPTS.filter(o => needsOk(o, sel) && sel(o.k) !== o.def).map(o => `${o.t}: ${o.ch.find(c => c[0] === sel(o.k))?.[1]}`);
      const pr = preset(); return pr !== 'custom' ? `${PRESETS.find(p => p[0] === pr)[1]}${ch.length ? ` (${ch.length} changes)` : ''}` : ch.length ? ch.join(' · ') : 'Default set'; };
    let cardKey = null, unsub = null;
    const card = () => { pop.querySelector('.vp-card')?.remove(); if (!cardKey) { unsub?.(); unsub = null; return; }
      const o = TEST_OPTS.find(r => r.k === cardKey), c = CARDS[cardKey] || {}, prof = pendingProfile(), snap = Summary.snapOf(prof), m = S.extra ? 'double' : 'base';
      Summary.measure(prof); unsub ??= Summary.onSnap(p => { if (p === pendingProfile() && cardKey) card(); });
      const ok = snap && snap.base.n > 20000, r2 = (v, se) => (v == null ? '–' : `<b class="${Summary.rtpClass(v, se)}">${v.toFixed(2)}%</b><small> ±${(2 * se).toFixed(2)}</small>`);
      const d = document.createElement('div'); d.className = 'vp-card';
      d.innerHTML = `<h3>${o.t}</h3>${c.what ? `<p>${c.what}</p>` : ''}${c.lv ? `<ul>${c.lv.map((l, i) => `<li class="${sel(o.k) === o.ch[i]?.[0] ? 'on' : ''}">${l}</li>`).join('')}</ul>` : ''}
        ${c.watch ? `<p><b>Watch for:</b> ${c.watch}</p>` : ''}${c.with ? `<p><b>Works with:</b> ${c.with}</p>` : ''}${c.rtp ? `<p><b>RTP:</b> ${c.rtp}</p>` : ''}
        <div class="vp-live"><b>Measured now · ${pendingLabel()}</b>${ok ? `<table>
          <tr><td>RTP base / Double Chance</td><td>${r2(snap.base.rtp, snap.base.se)} / ${r2(snap.double.rtp, snap.double.se)}</td></tr>
          <tr><td>RTP Buy / Super Buy</td><td>${r2(snap.buy.rtp, snap.buy.se)} / ${r2(snap.superbuy.rtp, snap.superbuy.se)}</td></tr>
          <tr><td>Bonuses per 1,000 spins</td><td>${(1000 / snap[m].bon.every).toFixed(1)}</td></tr>
          ${(c.live ? c.live(snap, m) : []).map(([l, v]) => `<tr><td>${l}</td><td>${v}</td></tr>`).join('')}</table><small>${snap.done ? 'Finished measurement.' : `Still measuring (${Math.round(snap.base.n / 1000)}k spins); figures firm up as it runs.`}</small>`
          : '<p>Measuring this combination… first figures in a few seconds.</p>'}</div><p class="vp-close">Tap to close</p>`;
      pop.append(d); };
    pop.addEventListener('click', ev => { ev.stopPropagation();
      if (ev.target.closest('.vp-card')) { cardKey = null; card(); return; }
      const t = ev.target.closest('[data-i]'); if (t) { cardKey = t.dataset.i; audio.play('button'); card(); return; }
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'sum') { audio.play('button'); Summary.openSummary(pendingProfile(), pendingLabel()); return; }
      if (b.dataset.a === 'cancel') { unsub?.(); pop.remove(); pop = null; return; }
      if (b.dataset.a === 'apply') { if (changed()) apply(); return; }
      if (b.dataset.p) { const pr = PRESETS.find(([id]) => id === b.dataset.p); if (pr) Object.assign(pending, pr[2]); audio.play('button'); draw(); return; }
      if (b.disabled) return;
      pending[b.dataset.k] = b.dataset.v; audio.play('button'); draw(); });
    $('#stage').append(pop);
    const r = btn.getBoundingClientRect(), rh = $('#stage').getBoundingClientRect(), k = rh.width / $('#stage').offsetWidth || 1;
    // v0.66d: centred across the game (it is wider than the space beside the icon) and placed just above the icon,
    // measured from the top so its own height is accounted for; never above the top of the game
    const hostW = $('#stage').offsetWidth, w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = `${Math.max(8, (hostW - w) / 2)}px`;
    pop.style.top = `${Math.max(8, (r.top - rh.top) / k - h - 12)}px`;
  }
  return {
    build() {
      btn = document.createElement('button'); btn.id = 'verBtn'; btn.type = 'button'; btn.title = 'Test versions'; btn.setAttribute('aria-label', 'Test versions');
      btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>';
      btn.hidden = !labOk();   // client 3 Nov: only on a device that has been through the secret door
      $('#stage').append(btn); btn.addEventListener('click', toggle);
      document.addEventListener('click', () => { if (pop) { pop.remove(); pop = null; } });
      addEventListener('resize', () => requestAnimationFrame(place)); requestAnimationFrame(place); setTimeout(place, 600);
      const d = $('.demo-badge'); if (d) d.textContent = labOk() ? `DEMO · PLAY MONEY · ${label()}` : 'DEMO · PLAY MONEY';   // the options' names only on an unlocked device
    },
    place,
    unlock() { if (btn) { btn.hidden = false; place(); } const d = $('.demo-badge'); if (d) d.textContent = `DEMO · PLAY MONEY · ${label()}`; setTimeout(() => { if (!pop) toggle(); }, 120); },
    /** the balance and stake carried over a switch (read once) */
    restore() { try { const k = JSON.parse(sessionStorage.getItem(KEEP) || 'null'); sessionStorage.removeItem(KEEP); return k; } catch { return null; } },
  };
})();
// v0.71 (checklist 3, 19): the Summary's background measurement pauses while a round plays
setInterval(() => { if (S.deflate && !S.busy) { S.deflate = false; pushOut(true); }   // v0.75b safety: never leave the camera pushed in
  Summary.setBusy(!!S.busy || !!S.auto.running); Summary.stopIfUnseen(!!$('#summary') || !!$('#verPop .vp-card')); if (WIDE.pending && !S.busy && !S.inFeature) fit(); }, 300);   // v0.72: a layout change waits for the round to end
