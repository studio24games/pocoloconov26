// Reel + Hold & Respin rendering. Pure presentation: it is told what to show and animates it.
import { symbolSVG, hasImage, COIN_BAND_TOP, COIN_BAND, COIN_PLATE_V11, framed } from './art.js';
import { ASSETS } from './assets.js';
import { Perimeter } from './perim.js';
import { ART_V2, V2G, v2Sym, v2Blur, v2CoinLabel } from './artv2.js';

export let CELL_W = 222, CELL_H = 222, GAP = 47.3, X0 = 0, Y0 = 200, SIDE_DY = 0;
// v0.47: art v2 grid (1.08 : 1 cells, gold pillars as the gaps), drawn 1:1 in stage units; ?art=v1 keeps the line above
if (ART_V2) ({ W: CELL_W, H: CELL_H, p: GAP, X0, Y0 } = V2G);   // v0.20: square tiles in the rebuilt mock-up surround; machine scaled in main.js (MACHINE)
// Reel timing measured frame-by-frame from Mayan Coins (30 fps capture): first reel stops ~0.45 s after
// the press, each next reel ~0.40 s later; a stop overshoots ~10% of a cell and settles within ~0.1 s.
export const TIMING = {
  normal: { first: 638, step: 525, near: 2950 },   // v0.54 (client): the near-miss slow-down held about 50 % longer (was 1969)   // v0.22: a further 5% slower (team request); wind-up now 50 ms
  quick:  { first: 300, step: 90,  near: 900 },
  cellsPerMs: 0.01824, overshoot: 17,              // v0.22: scroll speed 5% slower too
};
// v0.22 Mayan motion (measured from the 60 fps recordings): a quick ~9% flick up before the drop, then on the
// stop a hard brake that sails ~8% of a tile past the rest point and eases back over ~0.1 s.
export const MOTION = { lift: 20, liftMs: 35, holdMs: 50, accelMs: 100, brakeFrom: 45, brakeMs: 70, over: 18, settleMs: 100 };
// v0.26 (handover s1): the team's approved soft bounce is the pre-v0.22 profile — a gentle lift before the drop, a long
// ease into the stop, a soft ~14 px sail past and an unhurried settle. Timings stay 5% slower as agreed in v0.22.
export const SOFT = { lift: 16, liftMs: 70, holdMs: 95, accelMs: 90, easeFrom: 90, easeMs: 100, over: 14, settleMs: 140 };
// v0.31 (19 Oct): start and stop bounces made more impactful again — a bigger wind-up before the drop and a deeper
// overshoot on the stop with a second small rebound, so each reel lands with weight.
export const PUNCH = { lift: 34, liftMs: 85, holdMs: 120, accelMs: 85, easeFrom: 120, easeMs: 95, over: 34, settleMs: 210, rebound: 9 };
const FILL_MAX = 100;                               // pre-built blurred filler cells per reel
export const REEL_ROWS = [3, 4, 3];
export const cellPos = c => (c < 3 ? [0, c] : c < 7 ? [1, c - 3] : [2, c - 7]);
export const cellIndex = (r, row) => [0, 3, 7][r] + row;
export function reelBox(r) {
  const rows = REEL_ROWS[r];
  return { x: X0 + r * (CELL_W + GAP), y: Y0 + ((4 - rows) * CELL_H) / 2 + (rows < 4 ? SIDE_DY : 0), w: CELL_W, h: rows * CELL_H };
}
export function cellRect(c) {
  const [r, row] = cellPos(c); const b = reelBox(r);
  return { x: b.x, y: b.y + row * CELL_H, w: CELL_W, h: CELL_H, cx: b.x + CELL_W / 2, cy: b.y + row * CELL_H + CELL_H / 2 };
}

/** Coin art + value label. With production art the label sits inside the image's value band. */
function coinMarkup(coin, labelFor) {
  const id = `C_${coin.jp || 'CASH'}`; const lab = labelFor(coin);
  // 0.4.0 collector coin. TEMPORARY placeholder until the obsidian / molten-gold art arrives: the new coin, darkened,
  // with COLLECT (then its collected value) on the plate.
  // pot collectors (3 Nov): the collector pot, COLLECT (then its value) on its plate
  if (coin.pot) return `<div class="pot-sym">${ART_V2 ? v2Sym('K', v2CoinLabel({ text: lab.text, cls: `pot-lab ${lab.cls}` })) : `${symbolSVG('C_CASH')}<div class="coin-label ${lab.cls}">${lab.text}</div>`}</div>`;
  if (coin.col) return `<div class="col-coin">${ART_V2 ? v2Sym('C_CASH', v2CoinLabel(lab)) : `${symbolSVG('C_CASH')}<div class="coin-label ${lab.cls}">${lab.text}</div>`}</div>`;
  if (ART_V2) return id === 'C_CASH' ? v2Sym(id, v2CoinLabel(lab))
    : v2Sym(id, `<span class="coin-label in-band mouth ${lab.cls}" style="top:${COIN_BAND[id] || COIN_BAND_TOP};--n:${String(lab.text).length}">${lab.text}</span>`);
  if (hasImage(id) && ASSETS.symbolCanvas && id === 'C_CASH')   // v0.30: live value on the new coin's blank plate
    return symbolSVG(id, `<span class="coin-label v11 ${lab.cls}" style="top:${COIN_PLATE_V11.top};left:${COIN_PLATE_V11.left};width:${COIN_PLATE_V11.width};--n:${String(lab.text).length}">${lab.text}</span>`);
  if (hasImage(id)) return symbolSVG(id, `<span class="coin-label in-band mouth ${lab.cls}" style="top:${COIN_BAND[id] || COIN_BAND_TOP};--n:${String(lab.text).length}">${lab.text}</span>`);
  return `${symbolSVG(id)}<div class="coin-label ${lab.cls}">${lab.text}</div>`;
}

function drawFrame(svg) {
  if (!svg || ART_V2) return;
  const b = [0, 1, 2].map(reelBox), pad = 12, rr = 22;
  const L = b[0].x - pad, R = b[2].x + b[2].w + pad;
  const sideT = b[0].y - pad, sideB = b[0].y + b[0].h + pad, midT = b[1].y - pad, midB = b[1].y + b[1].h + pad;
  const mL = b[1].x - 2, mR = b[1].x + b[1].w + 2;
  // clockwise from top-left of the left column
  const d = `M${L + rr},${sideT} H${mL - rr} Q${mL},${sideT} ${mL},${sideT - rr} V${midT + rr} Q${mL},${midT} ${mL + rr},${midT}
    H${mR - rr} Q${mR},${midT} ${mR},${midT + rr} V${sideT - rr} Q${mR},${sideT} ${mR + rr},${sideT} H${R - rr} Q${R},${sideT} ${R},${sideT + rr}
    V${sideB - rr} Q${R},${sideB} ${R - rr},${sideB} H${mR + rr} Q${mR},${sideB} ${mR},${sideB + rr} V${midB - rr} Q${mR},${midB} ${mR - rr},${midB}
    H${mL + rr} Q${mL},${midB} ${mL},${midB - rr} V${sideB + rr} Q${mL},${sideB} ${mL - rr},${sideB} H${L + rr} Q${L},${sideB} ${L},${sideB - rr}
    V${sideT + rr} Q${L},${sideT} ${L + rr},${sideT} Z`;
  const div = x => `<line x1="${x}" y1="${sideT + 14}" x2="${x}" y2="${sideB - 14}" />`;
  // v0.10.1 placeholder structure (Mayan Coins framing, deliberately plain): a dark adobe wall behind the grid,
  // a stepped top over each short side reel, plain pilasters at the outer edges, a plinth with one pattern band.
  const wL = L - 70, wR = R + 70, wT = sideT - 96, wB = midB + 70, step = 34;
  // stepped parapet: outer edge low, rising in two steps towards the centre, flat across the middle (behind the logo)
  const sw = (mL - 20 - wL) / 3;
  const wall = `M${wL},${wB} V${wT + step * 2} H${wL + sw} V${wT + step} H${wL + 2 * sw} V${wT} H${wR - 2 * sw} V${wT + step} H${wR - sw} V${wT + step * 2} H${wR} V${wB} Z`;
  const rim = `M${wL},${wT + step * 2} H${wL + sw} V${wT + step} H${wL + 2 * sw} V${wT} H${wR - 2 * sw} V${wT + step} H${wR - sw} V${wT + step * 2} H${wR}`;
  const pil = x => `<rect x="${x}" y="${wT + step * 2}" width="40" height="${wB - wT - step * 2}" fill="url(#sStone2)"/><rect x="${x}" y="${wT + step * 2}" width="40" height="8" fill="#c9952e" opacity=".55"/>`;
  const meander = Array.from({ length: Math.ceil((wR - wL) / 44) }, (_, i) => { const x = wL + i * 44;
    return `<path d="M${x + 6},${wB - 10} v-24 h28 v16 h-14 v-8" fill="none" stroke="#7a3a20" stroke-width="5"/>`; }).join('');
  const structure = `
  <path d="${wall}" fill="url(#sStone)" stroke="#1a0608" stroke-width="3"/>
  <path d="${wall}" fill="url(#sBlocks)" opacity=".5"/>
  <path d="${rim}" fill="none" stroke="#c9952e" stroke-opacity=".6" stroke-width="5"/>
  ${pil(wL)}${pil(wR - 40)}
  <rect x="${wL - 12}" y="${wB - 56}" width="${wR - wL + 24}" height="56" rx="6" fill="url(#sStone2)" stroke="#1a0608" stroke-width="3"/>
  <rect x="${wL - 12}" y="${wB - 56}" width="${wR - wL + 24}" height="6" fill="#c9952e" opacity=".6"/>
  <g opacity=".85">${meander}</g>`;
  svg.innerHTML = `<defs>
    <linearGradient id="fGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".35" stop-color="#ffc83a"/><stop offset=".7" stop-color="#d98a12"/><stop offset="1" stop-color="#8a4a06"/></linearGradient>
    <linearGradient id="fWell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140419"/><stop offset=".5" stop-color="#2a0c36"/><stop offset="1" stop-color="#140419"/></linearGradient>
    <linearGradient id="sStone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a1c1c"/><stop offset=".5" stop-color="#3a1418"/><stop offset="1" stop-color="#260b10"/></linearGradient>
    <linearGradient id="sStone2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a1416"/><stop offset=".5" stop-color="#5a2420"/><stop offset="1" stop-color="#3a1416"/></linearGradient>
    <pattern id="sBlocks" width="88" height="44" patternUnits="userSpaceOnUse"><path d="M0,0 H88 M0,22 H88 M0,0 V22 M44,22 V44" stroke="#12040a" stroke-width="2" fill="none" opacity=".7"/></pattern>
  </defs>
  <g class="code-structure">${structure}</g>
  <path d="${d}" fill="url(#fWell)"/>
  <g class="dividers" stroke="#e8b440" stroke-width="3"><line x1="${mL}" y1="${midT}" x2="${mL}" y2="${midB}"/><line x1="${mR}" y1="${midT}" x2="${mR}" y2="${midB}"/></g>`;
}

/**
 * Checklist 4 item 7: a brightness flash that the GPU can animate. Animating `filter: brightness()` on a symbol
 * re-rasterises its full-resolution image on every frame (measured: the main source of dropped frames at landings and
 * collection). Instead, one pre-brightened copy of the image sits over the original (rasterised once) and only its
 * opacity animates. levels: brightness multipliers over time (1 = normal), e.g. [1, 1.6, 1].
 */
export function hiFlash(root, levels, ms, { easing = 'ease-out', fill = 'none', delay = 0 } = {}) {
  const img = root?.matches?.('img') ? root : root?.querySelector('img:not(.hi)'); if (!img || matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  let hi = img.nextElementSibling?.classList?.contains('hi') ? img.nextElementSibling : null;
  if (!hi) { hi = img.cloneNode(); hi.classList.add('hi'); hi.alt = ''; hi.removeAttribute('id'); img.after(hi); }
  hi.getAnimations().forEach(a => a.cancel());
  return hi.animate(levels.map(b => ({ opacity: Math.max(0, Math.min(1, (b - 1) / 0.9)) })), { duration: ms, easing, fill, delay });
}

/** Mayan Coins coin arrival: the coin pops ~12% with a golden flare and settles (~0.4 s). */
export function coinPop(el) {
  if (!el) return;
  el.animate([{ scale: '.86', easing: 'cubic-bezier(.3,.8,.4,1)' }, { scale: '1.12', offset: .4, easing: 'cubic-bezier(.4,0,.4,1)' }, { scale: '1' }], { duration: 440 });
  hiFlash(el, [2.2, 1.5, 1], 440);
  const f = document.createElement('i'); f.className = 'coin-flare'; el.append(f); setTimeout(() => f.remove(), 520);
}

// v0.63: Mystery marigolds (Q) pass by too (v2 art only: the v1 pack has no Mystery art)
const FILLER = ['H1', 'H2', 'M1', 'M1', 'L1', 'L1', 'L2', 'L2', 'L3', 'L3', 'W', 'C', 'C'];
// v0.67 (P1): curtains pass by in the spin blur about as often as they really show on a reel (about 3 symbols in 100 -
// was 2 in 15), and never on the opening screen or the screen behind a bought bonus (randomGrid), where a lone curtain
// square would be a shape real spins never show
const fillerSym = () => (ART_V2 && Math.random() < 0.03 ? 'Q' : rand(FILLER));
// v0.22: pre-blurred spin sprites (vertical motion blur baked from our own symbol art) replace the CSS blur filter
const BLUR = id => (ASSETS.symbolCanvas ? `./assets/symbols/blur2/${id === 'C' ? 'C_CASH' : id}${framed(id) ? '_tf' : ''}.webp`   // v0.45: framed skulls blur with their frame   // v0.30 set (300 canvas)
  : `./assets/symbols/blur1/${id === "W" ? "W4" : id === "C" ? "C2" : id}.webp`);   // v0.25: square wild
const BLUR_K = { W: 1, H1: 1, H2: 1, M1: .97, L1: .9, L2: .86, L3: .82, C: 1.1 };
const rand = a => a[Math.floor(Math.random() * a.length)];
const PASS_VALUES = [50, 100, 100, 200, 200, 300, 500, 800, 1000];   // the base coin table's cash denominations (BU)
const wait = ms => new Promise(r => setTimeout(r, ms));

export class Reels {
  /** @param labelFor (coin) => {text, cls} — supplied by main so labels show live currency. */
  constructor(stage, labelFor) {
    this.stage = stage; this.labelFor = labelFor;
    this.frameEl = stage.querySelector('#reelFrame');
    this.reelsEl = stage.querySelector('#reels');
    this.lineLayer = stage.querySelector('#lineLayer');
    this.machine = stage.querySelector('#machine');
    this.winFx = document.createElement('div'); this.winFx.id = 'winFx';
    this.machine.insertBefore(this.winFx, this.machine.querySelector('#reels'));
    this.masks = []; this.strips = []; this.current = []; this.anims = []; this.perims = [null, null, null];
    this.boxes = []; this.shown = []; this.fills = [];
    drawFrame(stage.querySelector('#frameSvg'));
    for (let r = 0; r < 3; r++) {
      const b = reelBox(r);
      const bg = document.createElement('div'); bg.className = 'reel-bg';
      Object.assign(bg.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
      this.frameEl.append(bg);
      const mask = document.createElement('div'); mask.className = 'reel-mask';
      Object.assign(mask.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
      const strip = document.createElement('div'); strip.className = 'strip';
      // v0.22: the strip is built once — two boxes of real cells (shown / next result) and a block of blurred filler
      // between them. A spin only rewrites the next box's few cells, so nothing is parsed or laid out at the press.
      const rows = REEL_ROWS[r];
      const mkBox = () => { const bx = document.createElement('div'); bx.className = 'rbox';
        for (let i = 0; i < rows; i++) { const c = document.createElement('div'); c.className = 'cell'; c.style.top = `${i * CELL_H}px`; bx.append(c); }
        return bx; };
      const fill = document.createElement('div'); fill.className = 'rfill';
      // checklist 11: every passing cash coin carries a cosmetic value on its plate (moves with the art; never paid)
      fill.innerHTML = Array.from({ length: FILL_MAX }, (_, i) => { const id = fillerSym();
        return ART_V2 ? `<div class="fcell" data-s="${id}" style="top:${i * CELL_H}px">${this.fcellV2(id)}</div>`
          : `<div class="fcell" style="top:${i * CELL_H}px;--k:${BLUR_K[id]}"><img src="${BLUR(id)}" alt="" decoding="async">${id === 'C' ? this.passLabel() : ''}</div>`; }).join('');
      const A = mkBox(), B = mkBox(); B.style.top = '-9999px'; B.style.visibility = 'hidden';
      strip.append(A, fill, B); mask.append(strip); this.reelsEl.append(mask);
      this.masks.push(mask); this.strips.push(strip);
      this.boxes.push([A, B]); this.shown.push(A); this.fills.push(fill);
    }
    if (!ART_V2) for (const id of new Set(FILLER)) { const im = new Image(); im.src = BLUR(id); im.decode?.().catch(() => {}); }
    // Checklist 4 item 7: the pre-v0.35 column effect (.col-fx) is gone - it was invisible yet repainted every frame
    this.frameCols = [];
  }

  /** v2 filler cell: its divider, the spin sprite and (coins) a passing value on the plate. */
  fcellV2(id) { return `<i class="v2div"></i>${v2Blur(id)}${id === 'C' ? this.passLabel() : ''}`; }
  cellHTML(sym, coin) {
    if (sym === 'K') return `${ART_V2 ? '<i class="v2div"></i>' : ''}${coinMarkup({ pot: true, pending: true, v: 0, ...(coin || {}) }, this.labelFor)}`;   // pot collectors: the pot on the reels
    if (ART_V2) return `<i class="v2div"></i>${sym === 'C' ? coinMarkup(coin || { v: rand([50, 100, 200, 300, 500]), jp: null }, this.labelFor) : v2Sym(sym)}`;
    if (sym === 'C') {
      const c = coin || { v: rand([50, 100, 200, 300, 500]), jp: null };
      return coinMarkup(c, this.labelFor);
    }
    return symbolSVG(sym);
  }

  /** Write symbols into a box's cells (the only DOM work a spin does). */
  fillBox(box, items) {
    items.forEach((it, i) => { const c = box.children[i];
      c.getAnimations().forEach(a => a.cancel());   // entry drop-aways are cleared when the cell is reused
      c.className = 'cell'; c.dataset.s = it.sym; c.style.setProperty('--d', `${(Math.random() * 2).toFixed(2)}s`);
      c.innerHTML = this.cellHTML(it.sym, it.coin); });
  }
  /** v0.52 Loco Spin: every passing (blurred) symbol on a reel is one symbol (the centre reel races through Wild suns);
   *  `null` deals ordinary random filler back. */
  fillAll(r, sym = null) {
    for (const f of this.fills[r].children) { const id = sym || fillerSym();
      if (ART_V2) { f.dataset.s = id; f.innerHTML = this.fcellV2(id); continue; }
      f.style.setProperty('--k', BLUR_K[id]); f.firstChild.src = BLUR(id); f.querySelector('.pass-val')?.remove(); if (id === 'C') f.insertAdjacentHTML('beforeend', this.passLabel()); }
  }
  /** Re-deal the filler while idle so consecutive spins don't show the same blurred sequence. */
  reshuffle(r) {
    const run = () => { for (const f of this.fills[r].children) { if (Math.random() < .5) continue; const id = fillerSym();
      if (ART_V2) { f.dataset.s = id; f.innerHTML = this.fcellV2(id); continue; }
      f.style.setProperty('--k', BLUR_K[id]); f.firstChild.src = BLUR(id);
      f.querySelector('.pass-val')?.remove(); if (id === 'C') f.insertAdjacentHTML('beforeend', this.passLabel()); } };
    (window.requestIdleCallback || (fn => setTimeout(fn, 200)))(run);
  }
  /** Cosmetic value for a passing (blurred) cash coin: an ordinary coin denomination at the current stake. */
  passLabel() {
    if (ART_V2) { const t = this.labelFor({ v: rand(PASS_VALUES), jp: null }).text; return `<span class="pass-val v2pv" style="--n:${String(t).length}">${t}</span>`; }
    if (!ASSETS.symbolCanvas) return '';
    const t = this.labelFor({ v: rand(PASS_VALUES), jp: null }).text;
    return `<span class="pass-val" style="--n:${String(t).length}">${t}</span>`;
  }
  /** Stake changed: passing coin values follow it. */
  relabel() { for (const f of this.fills) for (const el of f.querySelectorAll('.pass-val')) { const t = this.labelFor({ v: rand(PASS_VALUES), jp: null }).text; el.textContent = t; el.style.setProperty('--n', String(t).length); } }

  /** Immediately show a grid. symbols: 10 ids in cell order; coins: [{cell,v,jp}] */
  setGrid(symbols, coins = []) {
    const coinAt = new Map(coins.map(c => [c.cell, c]));
    this.current = symbols.slice(); this.currentCoins = coinAt;
    for (let r = 0; r < 3; r++) {
      const items = [];
      for (let row = 0; row < REEL_ROWS[r]; row++) { const c = cellIndex(r, row); items.push({ sym: symbols[c], coin: coinAt.get(c) }); }
      const [A, B] = this.boxes[r];
      this.fillBox(A, items); A.style.top = '0px'; A.style.visibility = ''; B.style.top = '-9999px'; B.style.visibility = 'hidden';
      this.fills[r].style.height = '0px'; this.shown[r] = A;
      this.strips[r].style.transform = 'translateY(0)';
      A.querySelectorAll('.cell[data-s="C"]').forEach(c => c.classList.add('front'));
    }
  }

  randomGrid() { return Array.from({ length: 10 }, () => rand(FILLER)); }

  cellEl(c) { const [r, row] = cellPos(c); return this.shown[r]?.children[row]; }

  /**
   * Spin to the result. opts: {turbo, nearFrom (first reel index that gets a near-miss slow-down, or -1), onStop(r)}
   * Reels stop left to right at the measured Mayan Coins cadence. Each near-miss reel slows down for an extra
   * beat with an animated surround. slam() lands everything still moving immediately.
   */
  async spin(symbols, coins, opts = {}) {
    const { turbo = false, onStop = () => {} } = opts;
    const nearReels = opts.nearReels ?? (opts.anticipateReel >= 0 ? [opts.anticipateReel] : []);
    const tm = turbo ? TIMING.quick : TIMING.normal;
    this.clearWins(); this.slammed = false; this.anims = [];
    // v0.73 (checklist 6): nothing from the last landing may ride down with the new spin - remove any lifted coin copy and
    // show the real coins again before the strips move
    this.reelsEl.querySelectorAll('.land-lift').forEach(e => e.remove());
    this.reelsEl.querySelectorAll('.lift-hidden').forEach(e => e.classList.remove('lift-hidden'));
    const fillWith = opts.fillWith || {};
    for (const [r, sym] of Object.entries(fillWith)) this.fillAll(+r, sym);
    const coinAt = new Map(coins.map(c => [c.cell, c]));
    let stopAt = 0;
    const runs = [];
    for (let r = 0; r < 3; r++) {
      const rows = REEL_ROWS[r];
      const finalItems = [];
      for (let row = 0; row < rows; row++) { const c = cellIndex(r, row); finalItems.push({ sym: symbols[c], coin: coinAt.get(c) }); }
      const near = nearReels.includes(r);
      const pace = turbo ? 1 : (opts.pace ?? 1);   // v0.71 Spin pace (normal speed only; near-miss build-ups keep their length)
      stopAt = r === 0 ? Math.round(tm.first * pace) : stopAt + Math.round(tm.step * pace);
      if (near) stopAt += tm.near;
      // pot collectors (3 Nov): a pot on reels 1-2 - the reels after it get a short, light anticipation (a soft glow, a
      // short extra beat), not the full near miss
      const light = !near && (opts.lightReels || []).includes(r);
      if (light) stopAt += turbo ? 220 : 650;
      // v0.22 Mayan motion profile (MOTION). Quick spin keeps a short settle and no flick.
      const M = PUNCH;
      const W = turbo ? 0 : M.holdMs;                // wind-up time added in front of the travel
      const duration = stopAt + W;
      const n = Math.min(FILL_MAX, Math.max(6, Math.round(stopAt * TIMING.cellsPerMs)));
      // shown box drops below the filler, the other box takes the result at the top
      const [A, B] = this.boxes[r]; const cur = this.shown[r]; const nxt = cur === A ? B : A;
      this.fillBox(nxt, finalItems); nxt.classList.add('landing'); cur.classList.remove('landing');   // v0.55: the result box keeps its dividers through the spin
      nxt.style.top = '0px'; nxt.style.visibility = ''; cur.style.top = `${(rows + n) * CELL_H}px`;
      const fill = this.fills[r]; fill.style.top = `${rows * CELL_H}px`; fill.style.height = `${n * CELL_H}px`;
      const strip = this.strips[r];
      const start = -(n + rows) * CELL_H;
      const os = turbo ? TIMING.overshoot : 14;
      const at = ms => Math.min(0.999, Math.max(0.001, ms / duration));
      // checklist 10 (v0.35): one continuous motion. The wind-up eases into its apex (zero speed, no held pause) and the
      // drop accelerates from rest; the acceleration ends at exactly the travel speed and the brake starts at exactly the
      // travel speed (bezier slopes solved per reel), so there is no speed step at either joint. Shape and timing as approved.
      const tStart = start + CELL_H * 0.6, tEnd = -M.easeFrom, tTime = Math.max(60, duration - M.easeMs - M.settleMs - (W + M.accelMs));
      const vT = (tEnd - tStart) / tTime;                                   // px per ms on the straight
      const sA = Math.min(9, vT / ((tStart - (start - M.lift)) / M.accelMs)), y2 = Math.max(0, 1 - sA * 0.1);
      const sD = vT / ((M.easeFrom + M.over) / M.easeMs), x1 = Math.min(.25, .95 / Math.max(.1, sD)), y1 = Math.min(1, sD * x1);
      const accelEase = `cubic-bezier(.45,0,.9,${y2.toFixed(3)})`, brakeEase = near ? 'cubic-bezier(.2,.6,.35,1)' : `cubic-bezier(${x1.toFixed(3)},${y1.toFixed(3)},.35,1)`;
      const frames = turbo ? [
        { transform: `translateY(${start}px)`, easing: 'cubic-bezier(.5,0,1,1)' },
        { transform: `translateY(${start + CELL_H * 0.6}px)`, offset: Math.min(0.08, 60 / duration), easing: near ? 'cubic-bezier(.1,.55,.25,1)' : 'linear' },
        { transform: `translateY(${os}px)`, offset: 1 - Math.min(0.2, 110 / duration), easing: 'cubic-bezier(.25,.6,.4,1)' },
        { transform: 'translateY(0)' },
      ] : [
        { transform: `translateY(${start}px)`, easing: 'cubic-bezier(.3,.6,.45,1)' },
        { transform: `translateY(${start - M.lift}px)`, offset: at(W), easing: accelEase },
        { transform: `translateY(${start + CELL_H * 0.6}px)`, offset: at(W + M.accelMs), easing: near ? 'cubic-bezier(.1,.55,.25,1)' : 'linear' },
        { transform: `translateY(${-M.easeFrom}px)`, offset: at(duration - M.easeMs - M.settleMs), easing: brakeEase },
        { transform: `translateY(${M.over}px)`, offset: at(duration - M.settleMs), easing: 'cubic-bezier(.4,0,.6,1)' },
        { transform: `translateY(${-M.rebound}px)`, offset: at(duration - M.settleMs * 0.42), easing: 'cubic-bezier(.4,0,.6,1)' },
        { transform: 'translateY(0)' },
      ];
      const anim = strip.animate(frames, { duration, fill: 'forwards' });
      // v0.25 Mayan coin landing: coins swell on the landing bounce (peak at the overshoot) and settle back to size
      // checklist 10: the landing coin grows smoothly into its enlarged state through the brake and bounce, then returns
      // with a quicker satisfying ping. It animates `scale` only — the idle sway owns `rotate` — so no two animations
      // ever fight over one transform and it always finishes at rest size. Same 1.2x strength as before.
      const bounceMs = M.easeMs + M.settleMs, swellMs = bounceMs + 230;
      // v0.53 (item 8): the swell plays on a copy of the column lifted out of the clipped reel window (same motion as
      // the strip, only its coins visible), so the whole coin shows over the surround; the real coins are hidden for it
      // v0.73 (checklist 3): timed from the drop's own timeline (its real start can be a few frames after this call on a
      // busy phone), and the copy only opens upwards once the coins are measured inside their squares (never by a timer)
      const swellAt = Math.max(0, duration - bounceMs);
      const swellGo = () => { if (this.slammed) return;
        // v0.73 (checklist 3, found by the coin hunt at phone speed): on a busy phone this can run after the drop has
        // already finished and been cleared - a copy started then would replay the whole drop from far above the grid
        // while the real reel is at rest. The landing is over: no swell.
        if (anim.playState !== 'running' || anim.currentTime == null || anim.currentTime >= duration - 40) return;
        const coinsHere = [...nxt.querySelectorAll('.cell[data-s="C"], .cell[data-s="K"]')]; if (!coinsHere.length) return;
        const mask = this.masks[r], lift = document.createElement('div');
        lift.className = 'reel-mask land-lift'; lift.style.cssText = mask.style.cssText;
        const sc = strip.cloneNode(false); sc.style.cssText = strip.style.cssText; const box = nxt.cloneNode(true); sc.append(box); lift.append(sc);
        box.querySelectorAll('.cell').forEach((cl, i) => { if (cl.dataset.s !== 'C' && cl.dataset.s !== 'K') cl.style.visibility = 'hidden'; });
        this.reelsEl.append(lift);
        // v0.62 (client): once the coin has dropped into its square, its swell shows in full over the column top; while
        // it is still dropping in it stays cut at the window's top edge (so it never appears from above the column)
        const a2 = sc.animate(frames, { duration, fill: 'forwards' }); a2.currentTime = anim.currentTime ?? 0;
        const openWhenIn = () => { if (!lift.isConnected) return;
          // the copy's own offset this frame (it is what is drawn), and the real strip's: both must be in place
          const y = new DOMMatrixReadOnly(getComputedStyle(sc).transform).m42, yr = new DOMMatrixReadOnly(getComputedStyle(strip).transform).m42;
          if (y >= -2 && yr >= -2) lift.classList.add('lift-open'); else if (a2.playState === 'finished' && y < -2) done(); else requestAnimationFrame(openWhenIn); };
        requestAnimationFrame(openWhenIn);
        coinsHere.forEach(cl => cl.classList.add('lift-hidden'));
        const grow = [{ scale: '1', easing: 'cubic-bezier(.3,.1,.3,1)' }, { scale: '1.2', offset: .6, easing: 'cubic-bezier(.55,0,.75,.6)' },
          { scale: '.975', offset: .84, easing: 'cubic-bezier(.25,.6,.4,1)' }, { scale: '1' }];
        const done = () => { coinsHere.forEach(cl => cl.classList.remove('lift-hidden')); lift.remove(); };
        const g = box.querySelectorAll('.cell[data-s="C"] .sym-svg, .cell[data-s="K"] .sym-svg'); g.forEach(el => el.animate(grow, { duration: swellMs }));
        setTimeout(done, swellMs + 20); };
      let swell = null;
      if (!turbo) anim.ready.then(() => { swell = setTimeout(swellGo, Math.max(0, swellAt - (anim.currentTime ?? 0))); this.timers?.push?.(swell); }).catch(() => {});
      this.anims.push(anim);
      this.masks[r].classList.add('spinning');
      let nearOn = null;
      if (light) { const pre = duration - (turbo ? 220 : 650) - tm.step;
        nearOn = setTimeout(() => { if (this.slammed) return; this.masks[r].classList.add('pot-light'); opts.onLight?.(r); }, Math.max(0, pre)); }
      if (near) {
        // surround starts when the reel before it has landed, i.e. while this one is still spinning
        const prevStop = duration - tm.near;
        nearOn = setTimeout(() => { if (this.slammed) return; this.masks[r].classList.add('near');
          // checklist 14: the shared perimeter energy round this column only, building through the existing slow-down
          const b = reelBox(r); this.perims[r]?.remove();   // v0.52: the burn sits inside the reel window
          this.perims[r] = new Perimeter(this.reelsEl, { x: b.x, y: b.y, w: b.w, h: b.h, r: 6, z: 4 }).start(Math.round(duration - Math.max(0, prevStop - tm.step)));
          this.machine.classList.add('nearing'); opts.onNear?.(r, Math.round(duration - Math.max(0, prevStop - tm.step))); }, Math.max(0, prevStop - tm.step));
      }
      runs.push((async () => {
        await anim.finished.catch(() => {});
        clearTimeout(nearOn);
        strip.style.transform = 'translateY(0)'; anim.cancel();   // brief s05B: no layer at rest, so landed coins can sit above the frame's dividers
        nxt.querySelectorAll('.cell[data-s="C"], .cell[data-s="K"]').forEach(c => c.classList.add('front'));
        // the mask stops clipping once a reel lands (symbols may overlap the frame), so park the filler and old box
        cur.style.top = '-9999px'; cur.style.visibility = 'hidden'; fill.style.height = '0px';
        this.shown[r] = nxt; if (fillWith[r]) this.fillAll(r); else this.reshuffle(r);
        const pm = this.perims[r];
        if (pm) {   // the tease resolves: a flare that hands over to the trigger celebration, or a prompt dissipation on a miss
          this.perims[r] = null; if (opts.nearResult?.(r)) pm.success(); else pm.fail();
        }
        this.masks[r].classList.remove('near', 'anticipate', 'spinning', 'pot-light');
        if (!this.masks.some(m => m.classList.contains('near'))) this.machine.classList.remove('nearing');
        const m = this.masks[r]; m.classList.remove('landed'); void m.offsetWidth; m.classList.add('landed');
        m.querySelectorAll('.wild-rib').forEach(w => { const t = w.closest('.sym-svg'); t.classList.remove('wild-land'); void t.offsetWidth; t.classList.add('wild-land'); });
        onStop(r);
      })());
    }
    await Promise.all(runs);
    this.current = symbols.slice(); this.currentCoins = coinAt;
  }
  /** Player pressed spin while reels move: everything lands now. */
  slam() { this.slammed = true; for (const a of this.anims) { try { if (a.playState === 'running') a.finish(); } catch { /* done */ } } }
  /** v0.73 (checklist 9): a landed column gets the same flame build-up as a spinning near-miss column (the Loco Spin's
   *  signpost that an extra Wild is coming there); resolves after `ms` with the flare, the flames then clear. */
  async burnColumn(r, ms = 600) {
    const b = reelBox(r), m = this.masks[r]; this.perims[r]?.remove();
    m.classList.add('near'); this.machine.classList.add('nearing');
    const pm = new Perimeter(this.reelsEl, { x: b.x, y: b.y, w: b.w, h: b.h, r: 6, z: 4 }).start(ms); this.perims[r] = pm;
    await new Promise(res => setTimeout(res, ms));
    if (this.perims[r] === pm) { this.perims[r] = null; pm.success(); }
    m.classList.remove('near'); if (!this.masks.some(x => x.classList.contains('near'))) this.machine.classList.remove('nearing');
  }
  /** no anticipation energy may outlive its opportunity */
  clearPerims() { this.perims.forEach((p, i) => { p?.fail(120); this.perims[i] = null; }); }

  /** v0.50 Loco Spin: the Mariachi turns a landed symbol Wild in place. */
  setSymbol(cell, sym) {
    const el = this.cellEl(cell); if (!el) return null;
    el.innerHTML = this.cellHTML(sym); el.dataset.s = sym; this.current[cell] = sym;
    return el;
  }
  /** Turn plain cells into coins in place (Coin Rescue). */
  setCoin(cell, coin) {
    const el = this.cellEl(cell); if (!el) return null;
    el.innerHTML = this.cellHTML('C', coin); el.dataset.s = 'C'; el.classList.add('front');
    this.current[cell] = 'C'; this.currentCoins.set(cell, coin);
    return el;
  }

  /** Mayan-Coins-style win presentation: traced gold lines, bursts behind winners, everything else dark. */
  showAllWins(wins, symbols = this.current) {
    this.machine.classList.add('dim');
    const cells = new Set();
    // v0.53 (item 2, lag on Android): the glow is two wide soft strokes under the line instead of a blur filter
    let svg = '';
    for (const w of wins) {
      w.cells.forEach(c => cells.add(c));
      const [a, , b] = w.cells.map(cellRect);
      const pts = [`${a.x - 10},${a.cy}`, ...w.cells.map(c => { const r = cellRect(c); return `${r.cx},${r.cy}`; }), `${b.x + b.w + 10},${b.cy}`].join(' ');
      // v0.58 (client): the line arrives with its full wide glow (the burst), then the glow settles to a narrow halo so the
      // enlarged characters behind it read clearly (the line itself stays)
      svg += `<polyline class="wl wl-g1" points="${pts}" stroke="#ff9a1f" stroke-width="30" opacity=".18"/><polyline class="wl wl-g2" points="${pts}" stroke="#ff9a1f" stroke-width="16" opacity=".45"/>`
        + `<polyline class="wl" points="${pts}" stroke="#ffc24a" stroke-width="9" opacity=".9"/><polyline class="wl" points="${pts}" stroke="#fff6c8" stroke-width="4"/>`;
    }
    this.lineLayer.innerHTML = svg;
    const settle = (sel, from, to, w0, w1) => this.lineLayer.querySelectorAll(sel).forEach(pl => pl.animate(
      [{ opacity: from, strokeWidth: w0 }, { opacity: from, strokeWidth: w0, offset: .4 }, { opacity: to, strokeWidth: w1 }], { duration: 1000, easing: 'ease-in-out', fill: 'forwards' }));
    settle('.wl-g1', .18, .06, '30px', '16px'); settle('.wl-g2', .45, .2, '16px', '10px');
    this.lineLayer.querySelectorAll('.wl:not(.wl-g1):not(.wl-g2)').forEach((pl, i) => pl.animate(
      [{ strokeWidth: i % 2 ? '4px' : '9px' }, { strokeWidth: i % 2 ? '4px' : '9px', offset: .4 }, { strokeWidth: i % 2 ? '3px' : '6px' }], { duration: 1000, easing: 'ease-in-out', fill: 'forwards' }));
    this.lineLayer.querySelectorAll('.wl').forEach(pl => {
      const len = pl.getTotalLength ? pl.getTotalLength() : 900;
      pl.style.strokeDasharray = len; pl.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 320, easing: 'ease-out', fill: 'forwards' });
    });
    for (const c of cells) {
      const el = this.cellEl(c); if (!el) continue;
      const sym = symbols[c];
      el.classList.add('win', sym === 'W' ? 'tier-w' : /^(H1|H2|M1)$/.test(sym) ? 'tier-h' : 'tier-l'); if (sym === 'W') el.classList.add('wild');
      this.masks[cellPos(c)[0]].classList.add('has-win');
      const r = cellRect(c);
      const burst = document.createElement('div'); burst.className = `wburst${symbols[c] === 'W' ? ' fire' : ''}`;
      Object.assign(burst.style, { left: `${r.cx}px`, top: `${r.cy}px` });
      this.winFx.append(burst);
    }
    return [...cells];
  }
  clearWins() {
    this.machine.classList.remove('dim');
    this.lineLayer.innerHTML = '';
    this.winFx.innerHTML = '';
    // checklist 10: winners ease back from wherever their win loop is to rest (no snap when the win class goes)
    this.reelsEl.querySelectorAll('.cell.win,.cell.coin-hot').forEach(e => {
      const sym = e.querySelector('.sym-svg'); const cs = sym && getComputedStyle(sym); const tf = cs?.transform, fl = cs?.filter;
      e.classList.remove('win', 'wild', 'coin-hot', 'tier-w', 'tier-h', 'tier-l');
      if (sym && tf && tf !== 'none' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const to = getComputedStyle(sym).filter;
        sym.animate([{ transform: tf, filter: fl || 'none' }, { transform: 'none', filter: to || 'none' }], { duration: 240, easing: 'cubic-bezier(.3,.6,.4,1)' });
      } });
    this.masks.forEach(m => m.classList.remove('has-win'));
  }
  /** Idle life: a sparkle on a random visible symbol. */
  glint() {
    const c = Math.floor(Math.random() * 10); const el = this.cellEl(c); if (!el) return;
    const g = document.createElement('i'); g.className = 'glint';
    Object.assign(g.style, { left: `${40 + Math.random() * 120}px`, top: `${30 + Math.random() * 100}px` });
    el.append(g); setTimeout(() => g.remove(), 900);
    el.querySelector('.sym-svg')?.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.35)' }, { filter: 'brightness(1)' }], { duration: 700 });
  }
  hotCoins(cells) { for (const c of cells) this.cellEl(c)?.classList.add('coin-hot'); }
  show(v) { this.reelsEl.classList.toggle('hidden', !v); }
}

/**
 * Hold & Win board, rebuilt for the 18 Oct brief (s07-s13). Four stacked layers inside #featureLayer / #frameLayer:
 *   sockets (empty positions)  ->  halos (one per held coin, jackpot priority on top)  ->  cells (motion previews clipped
 *   to the cell, held coins at the base-game size, unclipped)  ->  multiplier position frames + badges (#frameLayer).
 * Pure presentation: it is told what to show by main.js and never decides anything.
 */
const HALO_Z = { GRAND: 5, MAJOR: 4, MINOR: 3, MINI: 2, CASH: 1 };
const PREVIEW_COINS = [{ v: 50 }, { v: 100 }, { v: 100 }, { v: 200 }, { v: 300 }, { v: 500 }, { v: 1000 }, { jp: 'MINI' }, { v: 200 }, { jp: 'MINOR' }, { v: 100 }];
export class FeatureBoard {
  constructor(stage, labelFor) {
    this.layer = stage.querySelector('#featureLayer');
    this.frameLayer = stage.querySelector('#frameLayer');
    this.labelFor = labelFor;
    this.slots = []; this.held = new Map(); this.frames = new Map(); this.motion = new Map(); this.tension = new Map();
    this.haloCycle = 2500;
  }
  coinHTML(coin) { return coinMarkup({ v: coin.v ?? 100, jp: coin.jp ?? null, col: !!coin.col, pot: !!coin.pot, pending: !!coin.pending }, this.labelFor); }
  /** Build the board. startCoins are placed at once (optionally at a temporary scale for the continuous entry). */
  enter(startCoins, { coinScale = 1, halos = false } = {}) {
    // v0.35 (checklist 9): back to front — sockets (now invisible: no inset squares), halos, the coloured multiplier
    // frames, coins, then the multiplier badges in #frameLayer above the coins
    this.layer.innerHTML = '<div class="hb-socks"></div><div class="hb-halos"></div><div class="hb-rings"></div><div class="hb-cells"></div><div class="hb-perims"></div>';
    this.frameLayer.innerHTML = '';
    const [socks, halos_, rings, cells, perims] = this.layer.children; this.rings = rings; this.perimLayer = perims; this.tension?.forEach(p => p.remove()); this.tension = new Map();
    this.slots = []; this.held = new Map(); this.frames = new Map(); this.stopAllMotion();
    for (let c = 0; c < 10; c++) {
      const r = cellRect(c); const pos = `left:${r.x}px;top:${r.y}px`;
      const sock = document.createElement('div'); sock.className = 'hb-sock'; sock.style.cssText = pos; socks.append(sock);
      const halo = document.createElement('div'); halo.className = 'hb-halo'; // v0.48: centred on the coin's rim (canvas 513, 497)
      halo.style.cssText = ART_V2 ? `left:${r.x + 441 * V2G.k}px;top:${r.y + 393 * V2G.k}px` : `left:${r.cx}px;top:${r.cy}px`; halos_.append(halo);
      const cell = document.createElement('div'); cell.className = 'hb-cell'; cell.style.cssText = pos; cell.dataset.cell = c;
      cell.innerHTML = '<div class="hb-clip"></div><div class="hb-coin"></div>'; cells.append(cell);
      this.slots.push({ sock, halo, cell, clip: cell.firstChild, coin: cell.lastChild });
    }
    this.layer.classList.remove('hidden');   // (same task: nothing paints before the scales below are set)
    for (const c of startCoins) { this.place(c.cell, c, { animate: false, halo: halos });
      const sc = typeof coinScale === 'function' ? coinScale(c, this.slots[c.cell]) : coinScale; if (sc !== 1) this.slots[c.cell].coin.style.scale = String(sc); }
  }
  /** Fade the empty sockets in (entry). */
  revealSockets(ms = 420) {
    this.slots.forEach((s, i) => s.sock.animate([{ opacity: 0, transform: 'scale(.86)' }, { opacity: 1, transform: 'none' }], { duration: ms, delay: i * 30, easing: 'cubic-bezier(.3,1.3,.5,1)', fill: 'backwards' }));
  }
  /**
   * A coin becomes held. animate: lands like a base-game coin (drops in, swells on the bounce, settles) and its halo
   * starts as the landing settles. Resolves when it has settled.
   */
  place(cell, coin, { animate = true, scale = 1, halo = true, drop = true } = {}) {
    const s = this.slots[cell]; if (!s) return Promise.resolve();
    this.held.set(cell, coin); this.stopMotion(cell);
    s.coin.innerHTML = this.coinHTML(coin);
    s.cell.classList.add('filled'); s.sock.classList.add('filled');
    s.halo.dataset.t = coin.col ? 'COL' : coin.jp || 'CASH'; s.halo.style.zIndex = HALO_Z[coin.jp || 'CASH'];
    if (scale !== 1) s.coin.style.scale = String(scale);
    if (!animate) { if (halo) this.haloOn(cell); return Promise.resolve(); }
    const a = drop
      ? s.coin.animate([{ translate: '0 -34%', scale: '1' }, { translate: '0 5%', scale: '1.22', offset: .5 }, { translate: '0 -1%', scale: '.97', offset: .78 }, { translate: '0 0', scale: '1' }],
        { duration: 380, easing: 'cubic-bezier(.3,.7,.4,1)' })
      : (hiFlash(s.coin, [1.8, 1.4, 1], 320), s.coin.animate([{ scale: '1' }, { scale: '1.2', offset: .45 }, { scale: '1' }], { duration: 320, easing: 'cubic-bezier(.3,1.3,.5,1)' }));
    return a.finished.catch(() => {}).then(() => { if (halo) this.haloOn(cell); });
  }
  /** Ambient halo on: synchronised to one shared ~2.5 s pulse so every halo breathes together. */
  haloOn(cell) {
    const h = this.slots[cell]?.halo; if (!h) return;
    h.style.setProperty('--hc', `${this.haloCycle}ms`); h.style.animationDelay = `-${Math.round(performance.now() % this.haloCycle)}ms`;
    h.classList.add('on');
  }
  /** Return the temporary entry scale to the resting size together; halos light as they settle. */
  settleCoins(cells, ms) {
    return Promise.all(cells.map(c => { const s = this.slots[c]; if (!s) return null;
      const from = s.coin.style.scale || '1'; s.coin.style.scale = '';
      hiFlash(s.coin, [1.35, 1, 1], ms);
      return s.coin.animate([{ scale: from }, { scale: '.97', offset: .8 }, { scale: '1' }], { duration: ms, easing: 'cubic-bezier(.3,.8,.4,1)' }).finished.catch(() => {}).then(() => this.haloOn(c)); }));
  }
  /** v0.53 (item 19): every held coin back to its exact square and normal size, whatever animation was cut short
   *  (a phone dropping frames, a skip). Called at each respin start, after the skull's actions and before the collect. */
  snap() {
    for (const [c] of this.held) { const s = this.slots[c]; if (!s) continue;
      for (const a of s.coin.getAnimations()) { if (a !== s.focusAnim) a.cancel(); }
      s.coin.style.scale = ''; s.coin.style.translate = ''; s.coin.style.transform = '';
      const r = cellRect(c); s.cell.style.left = `${r.x}px`; s.cell.style.top = `${r.y}px`; s.sock.style.left = `${r.x}px`; s.sock.style.top = `${r.y}px`;
      s.halo.style.left = ART_V2 ? `${r.x + 441 * V2G.k}px` : `${r.cx}px`; s.halo.style.top = ART_V2 ? `${r.y + 393 * V2G.k}px` : `${r.cy}px`; }
  }
  empties() { const e = []; for (let c = 0; c < 10; c++) if (!this.held.has(c)) e.push(c); return e; }
  coinEl(c) { return this.slots[c]?.coin; }
  cellEl(c) { return this.slots[c]?.cell; }

  // ---- s11A: independent motion in empty positions (presentation only) ----
  /** v0.49 item 35: `spinUp` ms - the first respin of a bonus launches with a fast flicker (about 2.5x speed, a
   *  continuous stream) that decelerates to the normal cadence over that time. Presentation only. */
  startMotion(cells, { spinUp = 0 } = {}) {
    const t0 = performance.now(), speed = () => { const t = performance.now() - t0; return spinUp && t < spinUp ? 0.4 + 0.6 * (t / spinUp) ** 2 : 1; };
    for (const c of cells) {
      if (this.motion.has(c)) continue;
      const st = { on: true, timer: 0 }; this.motion.set(c, st);
      const s = this.slots[c]; s.cell.classList.add('moving');
      const flash = () => {
        if (!st.on) return;
        const el = document.createElement('div'); el.className = 'hb-flash';
        el.innerHTML = this.coinHTML(PREVIEW_COINS[Math.floor(Math.random() * PREVIEW_COINS.length)]);
        s.clip.append(el);
        // checklist 11: passing coins always enter from above and travel down (never upwards); varied timing and gaps
        const f = speed(), ms = (300 + Math.random() * 260) * f;
        const a = el.animate([{ translate: '0 -118%', opacity: .9 }, { translate: '0 118%', opacity: .9 }], { duration: ms, easing: Math.random() < .5 ? 'linear' : 'cubic-bezier(.4,.1,.6,.9)' });
        a.finished.catch(() => {}).then(() => el.remove());
        // varied rhythm: sometimes a second flash overlaps, sometimes a dark gap
        const gap = f < 1 ? ms * (.45 + Math.random() * .2) : Math.random() < .22 ? ms * (.35 + Math.random() * .3) : ms + 90 + Math.random() * 520;
        st.timer = setTimeout(flash, gap);
      };
      st.timer = setTimeout(flash, spinUp ? Math.random() * 50 : Math.random() * 420);
    }
  }
  stopMotion(c) {
    const st = this.motion.get(c); if (!st) return;
    st.on = false; clearTimeout(st.timer); this.motion.delete(c);
    const s = this.slots[c]; if (!s) return;
    s.cell.classList.remove('moving');
    for (const el of s.clip.querySelectorAll('.hb-flash')) el.animate([{ opacity: .9 }, { opacity: 0 }], { duration: 120 }).finished.catch(() => {}).then(() => el.remove());
  }
  stopAllMotion() { for (const c of [...this.motion.keys()]) this.stopMotion(c); }
  /**
   * s11B partial reveal: the coin's lower edge eases down from the top of its cell until about a third shows, stops
   * dead for `hold` ms, then either drops into place (land) or springs back up out of sight. Clipped to its cell.
   * Resolves when the preview has finished (for land, the caller then places the real coin).
   */
  async tease(c, { land, coin, approach = 325, hold = 230, resolve = 230, drop = 300, superHold = 0 }) {
    const s = this.slots[c]; if (!s) return;
    this.stopMotion(c);
    const el = document.createElement('div'); el.className = 'hb-flash tease';
    el.innerHTML = this.coinHTML(land && coin ? coin : PREVIEW_COINS[Math.floor(Math.random() * PREVIEW_COINS.length)]);
    s.clip.append(el);
    // checklist 12 (v0.35). translate is in % of the 222 cell box: 0 = resting centre, -110% = hidden above.
    // One owner of the transform from first frame to last: approach (identical for both outcomes, no early cue) ->
    // a slow creep through the reveal point (a hesitation, never a frozen stop) -> success: continues down and settles;
    // failure: a short controlled snap back upwards (eases in and out, quicker than the approach, never a jump).
    if (superHold) {   // v0.62l (client): super tease - a slow creep to about two-thirds in, a trembling hang, then a slam in or a yank back
      const a1 = el.animate([{ translate: '0 -110%', easing: 'cubic-bezier(.25,.7,.35,1)' }, { translate: '0 -36%' }], { duration: approach, fill: 'forwards' });
      await a1.finished.catch(() => {});
      const h = el.animate([{ translate: '0 -36%' }, { translate: '0 -27%' }], { duration: superHold, easing: 'linear', fill: 'forwards' });   // v0.62l: one slow, smooth descent (no wobble)
      await h.finished.catch(() => {}); a1.cancel();
      const o = land ? el.animate([{ translate: '0 -27%', easing: 'cubic-bezier(.55,0,.9,.5)' }, { translate: '0 6%', offset: .65, easing: 'cubic-bezier(.3,.6,.4,1)' }, { translate: '0 0' }], { duration: 240, fill: 'forwards' })
        : el.animate([{ translate: '0 -27%', easing: 'cubic-bezier(.6,0,.3,1)' }, { translate: '0 -112%' }], { duration: 170, fill: 'forwards' });
      await o.finished.catch(() => {}); h.cancel();
      if (land) { s.coin.style.visibility = 'hidden'; requestAnimationFrame(() => { s.coin.style.visibility = ''; el.remove(); }); } else el.remove();
      return;
    }
    const T0 = approach + hold;
    const a = el.animate([{ translate: '0 -110%', easing: 'cubic-bezier(.25,.75,.45,1)' }, { translate: '0 -70%', offset: approach / T0, easing: 'cubic-bezier(.45,0,.55,1)' }, { translate: '0 -64%' }],
      { duration: T0, fill: 'forwards' });
    await a.finished.catch(() => {});
    const out = land
      ? el.animate([{ translate: '0 -64%', easing: 'cubic-bezier(.4,0,.75,.45)' }, { translate: '0 5%', offset: .7, easing: 'cubic-bezier(.3,.6,.4,1)' }, { translate: '0 0' }], { duration: drop, fill: 'forwards' })
      : el.animate([{ translate: '0 -64%', easing: 'cubic-bezier(.5,0,.3,1)' }, { translate: '0 -112%' }], { duration: resolve, fill: 'forwards' });
    await out.finished.catch(() => {});
    a.cancel();
    if (land) { s.coin.style.visibility = 'hidden'; requestAnimationFrame(() => { s.coin.style.visibility = ''; el.remove(); }); }   // the held coin takes over at the same place before the preview goes
    else el.remove();
  }
  /** A position with no coin resolves: the socket gives a tiny knock. */
  knock(c) { this.slots[c]?.sock.animate([{ translate: '0 -5px' }, { translate: '0 3px', offset: .5 }, { translate: '0 0' }], { duration: 220, easing: 'cubic-bezier(.25,.6,.4,1)' }); }
  // ---- checklist 14: near completion (two or fewer empty positions) — the shared perimeter energy round each empty
  // cell individually, inside the board so it follows the camera push-in ----
  tensionOn(cells, build = 1150) {
    for (const c of cells) { if (this.tension.has(c) || this.held.has(c)) continue;
      const r = cellRect(c); this.tension.set(c, new Perimeter(this.perimLayer, { x: r.x, y: r.y, w: r.w, h: r.h, r: 0, z: 1 }).start(build)); }
  }
  /** a coin locked here: its energy flares out and goes; any other empty cell keeps its own */
  tensionOff(c) { const p = this.tension.get(c); if (!p) return; this.tension.delete(c); p.success(); }
  /** unfilled at the end of a spin / the feature: whatever is left dissipates */
  tensionClear() { for (const p of this.tension.values()) p.fail(); this.tension.clear(); }
  /** s05 / checklist 19: the source coin is briefly emphasised as its value leaves */
  /**
   * Checklist 4 items 2 + 6: the coin whose value is leaving becomes the clear focus - it lifts to 1.1x, brightens and its
   * halo intensifies, and it HOLDS that state while its value travels. focusEnd() (on arrival) eases it back from wherever
   * it is and the coin dims as collected. One owner per property: scale on the coin, opacity on the bright copy.
   */
  emphasise(c, ms = 190) { const s = this.slots[c]; if (!s) return;
    s.cell.classList.add('focus'); s.halo.classList.add('focus');
    s.focusAnim?.cancel(); s.focusAnim = s.coin.animate([{ scale: '1' }, { scale: '1.1' }], { duration: ms, easing: 'cubic-bezier(.3,.9,.4,1)', fill: 'forwards' });
    hiFlash(s.coin, [1, 1.7, 1.35], ms + 40, { fill: 'forwards' }); }
  focusEnd(c, ms = 220) { const s = this.slots[c]; if (!s) return;
    s.cell.classList.remove('focus'); s.halo.classList.remove('focus');
    const cur = getComputedStyle(s.coin).scale; s.focusAnim?.cancel(); s.focusAnim = null;
    s.coin.animate([{ scale: cur === 'none' ? '1' : cur }, { scale: '1' }], { duration: ms, easing: 'cubic-bezier(.3,.7,.4,1)' });
    hiFlash(s.coin, [1.35, 1], ms); }
  /**
   * Checklist 18: the feature-entry enlargement-and-drop, replayed before collection. Every coin grows together (ordinary
   * ambient halo only), holds, then drops back to its rest in turn (one owner per transform: the drop starts from the
   * held enlarged state in the same frame); its strong pre-collection glow lights as it settles. Resolves when all rest.
   */
  async prepareCollect(cells, { grow = 480, scale = 1.22, hold = 160, drop = 380, stagger = 170, onSettle } = {}) {
    const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (rm) { cells.forEach((c, i) => { this.elevate(c); onSettle?.(c, i); }); return; }
    const grows = cells.map(c => this.slots[c].coin.animate([{ scale: '1' }, { scale: String(scale) }], { duration: grow, easing: 'cubic-bezier(.33,0,.2,1)', fill: 'forwards' }));
    await wait(grow + hold);
    await Promise.all(cells.map((c, i) => wait(i * stagger).then(() => {
      const s = this.slots[c];
      const a = s.coin.animate([{ scale: String(scale), translate: '0 0' }, { scale: '.965', translate: '0 2.5%', offset: .7 }, { scale: '1', translate: '0 0' }], { duration: drop, easing: 'cubic-bezier(.45,0,.35,1)' });
      grows[i].cancel();
      return a.finished.catch(() => {}).then(() => { this.elevate(c); onSettle?.(c, i); });
    })));
  }

  // ---- s08C: multiplier position frames ----
  addFrame(cell, mult, { fast = false } = {}) {   // v0.62e: fast = a skipped skull turn (slam and settle in 0.5 s)
    const r = cellRect(cell);
    // checklist 9: the coloured frame sits under the coin (the coin's rim covers it), the badge above the coin
    const ring = document.createElement('div'); ring.className = `mpos m${mult} mpos-ring`; ring.dataset.cell = cell;
    const el = document.createElement('div'); el.className = `mpos m${mult} mpos-badge`; el.dataset.cell = cell;
    for (const e of [ring, el]) Object.assign(e.style, { left: `${r.x}px`, top: `${r.y}px` });
    ring.innerHTML = '<i class="mp-ring"></i>'; el.innerHTML = `<div class="mp-badge">×${mult}</div>`;
    (this.rings || this.frameLayer).append(ring); this.frameLayer.append(el);
    ring.animate([{ transform: 'scale(1.7)', opacity: 0 }, { transform: 'scale(.95)', opacity: 1, offset: .6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 480, easing: 'cubic-bezier(.3,1.3,.5,1)' });
    // the ×N slams down big in the middle of the square, holds, then settles into its corner badge
    const b = el.querySelector('.mp-badge'); const W = el.offsetWidth || 222, Hh = el.offsetHeight || 222;
    const bw = b.offsetWidth || 90, bh = b.offsetHeight || 60;
    const dx = W / 2 - (b.offsetLeft + bw / 2), dy = Hh / 2 - (b.offsetTop + bh / 2);
    b.animate([{ transform: `translate(${dx}px, ${dy}px) scale(3.4)`, opacity: 0 }, { transform: `translate(${dx}px, ${dy}px) scale(2.2)`, opacity: 1, offset: .14 },
      { transform: `translate(${dx}px, ${dy}px) scale(2.45)`, offset: .22 }, { transform: `translate(${dx}px, ${dy}px) scale(2.3)`, offset: .62 }, { transform: 'none' }],
    { duration: fast ? 520 : 1300, easing: 'cubic-bezier(.4,0,.2,1)' });
    this.frames.set(cell, mult);
    return el;
  }
  /** 0.3.0: a frame levels up in place (a coin landed on it, or the skull levelled it). */
  setFrameMult(cell, mult) {
    for (const e of [this.frameEl(cell), this.ringEl(cell)]) { if (!e) continue; e.className = e.className.replace(/\bm\d+\b/, `m${mult}`); }
    const b = this.frameEl(cell)?.querySelector('.mp-badge');
    if (b) { b.textContent = `×${mult}`; b.animate([{ transform: 'scale(1)' }, { transform: 'scale(2.2)', filter: 'brightness(2)', offset: .3 }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 620, easing: 'cubic-bezier(.3,1.5,.5,1)' }); }
    this.frames.set(cell, mult);
  }
  frameEl(cell) { return this.frameLayer.querySelector(`.mpos[data-cell="${cell}"]`); }
  ringEl(cell) { return this.rings?.querySelector(`.mpos[data-cell="${cell}"]`); }

  // ---- s12 / s13: recognition, staged intensification, collection ----
  flashAll(cells) { for (const c of cells) { const s = this.slots[c]; if (!s) continue; hiFlash(s.coin, [1, 1.9, 1], 700); s.halo.classList.add('up'); } }
  elevate(c) { const s = this.slots[c]; if (!s) return; s.halo.classList.add('up'); s.cell.classList.add('lit');
    // item 6 / 11: the stronger glow comes on as the coin settles - the same smooth falloff, brighter (no ring, no band)
    s.halo.animate([{ opacity: .75, scale: '1' }, { opacity: 1, scale: '1.04', offset: .35 }, { opacity: 1, scale: '1.02' }], { duration: 340, easing: 'ease-out' });
    hiFlash(s.coin, [1, 1.5, 1], 360); }
  collected(c) { const s = this.slots[c]; if (!s) return; this.focusEnd(c); s.cell.classList.remove('lit'); s.cell.classList.add('collected'); s.halo.classList.add('gone'); }
  exit() { this.stopAllMotion(); this.tensionClear?.(); this.layer.classList.add('hidden'); this.layer.innerHTML = ''; this.frameLayer.innerHTML = ''; this.slots = []; this.held = new Map(); this.frames = new Map(); }
}
