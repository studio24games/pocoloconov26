// v0.48 reel grid + art pack v2.1 (darker; poco_loco_art_v2_1.zip, 24 Oct), installed by tools/install_reels_v21.py
// into assets/reels_v21/. v0.51: art pack v3 (26 Oct: refreshed Mariachi / Catrina / Bandana, widened upper centre rails)
// installed into the same folder by tools/art/install_art_v3.py. ?art=v1 brings back the v0.46 look without a redeploy. ?dividers=0 hides the row dividers
// (cell geometry, symbol scale and clipping are identical either way).
//
// Everything here is in STAGE units (the 720-wide portrait stage); the reel machine is drawn 1:1 in stage units.
// Rules from the pack (README.txt, asset_manifest.json):
//  - every symbol is a 1024 x 1024 canvas whose logical cell is x 72-952, y 104-919 (880 x 815); s = cellWidth / 880,
//    drawn at (cellX - 72s, cellY - 104s), 1024s square, and CLIPPED TO ITS CELL: no overhang of any kind;
//  - assembly as the pack's own verification preview: each reel column is a sandstone frame (bars 112 tall, 96 wide at
//    s = 1); the centre column's side bars are the separators between columns; patterned outer pillars outside the side
//    frames; the skull-ended win bar under the machine; corners authored at 4x (drawn at s / 4), mirrored as needed;
//  - repeating pieces tile at native scale x s and are clipped to length, never stretched. Uniform scaling only.
//  The pack's top_cap and thin gold pillar are not used by its own preview assembly, so they are installed but not drawn.
import { ASSETS } from './assets.js';

export const ART_V2 = !(typeof location !== 'undefined' && /[?&]art=v1\b/.test(location.search));
export const DIVIDERS = !(typeof location !== 'undefined' && /[?&]dividers=0\b/.test(location.search));
const A = './assets/reels_v21/';
const V = '?v=66';   // the symbol art changes under the same names each build; this keeps phones from mixing cached old art (assets cache 1 h)

const BV = 96, BH = 112, OUT = 250, DV = 16;            // native bar / pillar / divider sizes (s = 1)
const MACHINE_UNITS = 3 * 880 + 4 * BV + 2 * OUT;        // outer pillar to outer pillar, in art px: 3524 (as the preview)
const TOP = 250;                                         // v0.49: stage y of the centre frame's top edge (up under the smaller logo)
// v0.49 (25 Oct): the machine is drawn at a base scale (86 % of the stage width); the layout then zooms the machine and
// its win bar together, uniformly, from this top edge, to fill the height down to the Buy / Double Chance row
// (layoutAssembly in main.js). Width may run past the screen edges on tall phones (client decision).
const k = ((0.86 * 720) * 880 / MACHINE_UNITS) / 880;    // art scale (s) before the layout zoom
const W = 880 * k;                                       // cell width
const H = 815 * k;                                       // cell height (1.08 : 1)
const GAP = BV * k;                                      // the centre column's side bar separates the columns
const BAR_V = BV * k, BAR_H = BH * k, OUTER = OUT * k, DIV = DV * k;
const Y0 = TOP + BAR_H;                                  // centre reel window top
const X0 = 360 - 1.5 * W - GAP;                          // left reel window left
const centreBottom = Y0 + 4 * H;                         // bottom edge of the centre column's last symbol
// Win bar (v0.49): the pack's skull bar lengthened by one whole brick per row (tools/art/make_wide_winbar.py, rough
// version for review): 1720 canvas, opaque x 18-1701 (1684 wide), body rows 416-630, anchor (18, 371). Uniformly scaled so
// the skulls' outer edges sit on the outer pillars' outer edges; its top edge frames the bottom of the centre column
// (covering that column's bottom rail).
const WB_W = 1684;
const WB_S = (MACHINE_UNITS * k) / WB_W;
const WB_X = 360 - (WB_W / 2) * WB_S;                    // stage x of the artwork's left edge (canvas x 18)
const winTop = centreBottom - (416 - 371) * WB_S, winBottom = winTop + 281 * WB_S;
const frameBottom = centreBottom + BAR_H;

export const V2G = {
  W, H, k, p: GAP, X0, Y0,
  top: TOP, bottom: winBottom, half: (MACHINE_UNITS * k) / 2,
  gameH: Math.ceil(winBottom + 10),
  // the win bar's text panel (wide bar: the text-safe band canvas [245,480,1475,535], artwork origin 18,371). v0.50: the
  // box is the bar's whole dark slot (rows 455-560, same centre line), so tall letters are never clipped at the bottom
  panel: { left: WB_X + (245 - 18) * WB_S, top: winTop + (460 - 371) * WB_S, width: (1475 - 245) * WB_S, height: (570 - 460) * WB_S },   // v0.53: exactly the dark slot (art rows 460-570, measured)
  winTop, winBottom,
  coinDiameter: 854 * k,                                 // the coin's gold rim: canvas x 86-940
  colHalf: 1.5 * W + GAP + BAR_V,                         // centre line to the side columns' outer frame edge (v0.50 zoom limit)
  lintelTop: TOP,                                         // top edge of the centre column's frame (v0.52: no lintel above it)
};

const px = v => `${v.toFixed(3)}px`;
const IMG = { W: 'sym_wild', H1: 'sym_mariachi', H2: 'sym_catrina', M1: 'sym_bandana', C_CASH: 'sym_coin',
  K: 'sym_pot',   /* pot collectors (3 Nov): the collector pot */
  L1: 'sym_ring', L2: 'sym_guitar', L3: 'sym_maracas',   /* v0.71: Gold Ring is the top low (client, 31 Oct): art re-mapped, maths unchanged */ Q: 'sym_curtain' };   // v0.65: Q = Mystery, the theatre curtain
// v0.64: the five marigold designs stay available on the link - ?marigold=terracotta | amber | ember | rose | stone
// (?marigold=original is the v0.63 marigold). Without it the Mystery is the curtain, which opens on its reveal.
const MARIGOLD = typeof location !== 'undefined' && (location.search.match(/[?&]marigold=(terracotta|amber|ember|rose|stone|original)\b/) || [])[1];
if (MARIGOLD) IMG.Q = MARIGOLD === 'original' ? 'sym_mystery' : `sym_mystery_${MARIGOLD}`;
export const CURTAIN = !MARIGOLD;
// Placement is written inline with !important so no older symbol-specific rule can resize a symbol (the v0.47 Wild bug).
const PLACE = `left:${px(-72 * k)}!important;top:${px(-104 * k)}!important;width:${px(1024 * k)}!important;height:${px(1024 * k)}!important`;
// Jackpot coins have no v2.1 art: the v0.46 coins (512 canvas, coin [6,6,504,502]) scaled to the new coin's rim
// (854 art px across, centred on canvas 513, 497) and clipped to the cell like every symbol.
const JP_COIN = { c: 512, cx: 255, cy: 254, d: 498 };
function jpBox() { const s = (854 * k) / JP_COIN.d; return { left: (513 - 72) * k - JP_COIN.cx * s, top: (497 - 104) * k - JP_COIN.cy * s, size: JP_COIN.c * s }; }

/** v0.50: every file of the reel art pack, so the loader can download and decode them all before Play is enabled
 * (a symbol drawn before its image has arrived showed as an empty square on slow connections). */
// Symbol files are always requested in CORS mode (the lighting test also uses them as CSS masks, which are CORS
// requests): one mode means one cached copy, so a symbol shown after loading never waits for a second download.
export const V2_CORS = f => /\/sym_|\/blur\//.test(f);
export const V2_FILES = [...Object.values(IMG).map(f => `${A}${f}.webp${V}`), ...Object.values(IMG).map(f => `${A}blur/${f}.webp${V}`),
  ...['frame_bar_h_s', 'frame_bar_v_s', 'pillar_outer_s', 'divider_gold_s',
    'win_bar_wide_s', 'bg_scene', 'cell_floor', 'pillar_cap', 'super_badge', 'super_badge_ring', 'ui/jp_grand', 'ui/jp_major', 'ui/jp_minor', 'ui/jp_mini',
    ...(CURTAIN ? ['curtain_pelmet', 'curtain_left', 'curtain_right'] : [])].map(f => `${A}${f}.webp${f.startsWith('curtain_') ? V : ''}`)];

/** Symbol markup inside a reel/board cell (the cell is W x H and clips; overlay moves with the art). */
export function v2Sym(id, overlay = '') {
  if (IMG[id]) return `<div class="sym-svg v2s v2-new" data-id="${id}" style="${PLACE}"><img src="${A}${IMG[id]}.webp${V}" crossorigin="anonymous" alt="" draggable="false">${overlay}</div>`;
  if (/^C_(MINI|MINOR|MAJOR|GRAND)$/.test(id) && ASSETS.symbols[id]) { const b = jpBox();
    return `<div class="sym-svg v2s v2-old" data-id="${id}" style="left:${px(b.left)}!important;top:${px(b.top)}!important;width:${px(b.size)}!important;height:${px(b.size)}!important"><img src="${ASSETS.symbols[id]}" alt="" draggable="false">${overlay}</div>`; }
  return `<div class="sym-svg v2s" data-id="${id}"></div>`;
}
/** v0.65: the curtain in three pieces (valance, left and right drape), on the symbol's own canvas and placement, laid
 *  over a cell whose real symbol is already in place underneath. mysteryReveal() opens and then puffs it away. */
export function v2Curtain() {
  // v0.66: the light (glow or swirl) sits between the symbol and the curtain; the whole effect is clipped to the square,
  // below its top divider (style.css .curtain-fx), so nothing in the reveal draws over the dividers
  const im = f => `<img class="ct-${f}" src="${A}curtain_${f}.webp${V}" alt="" draggable="false">`;
  return `<div class="curtain-fx" style="${PLACE}"><i class="ct-light"></i><div class="ct-cloth">${im('left')}${im('right')}${im('pelmet')}</div></div>`;
}
/** Spin (blurred) version: derived sprites of the same art, placed by the same rule. */
export function v2Blur(id) {
  const key = id === 'C' ? 'C_CASH' : id;
  return IMG[key] ? `<div class="sym-svg v2s v2-new" style="${PLACE}"><img src="${A}blur/${IMG[key]}.webp${V}" crossorigin="anonymous" alt="" decoding="async"></div>` : '';
}
/** Cash coin value in the coin's empty plate (manifest safe box: canvas [220,490,808,620]), scaled with the coin. */
export function v2CoinLabel(lab) {
  const n = Math.max(1, String(lab.text).length), fs = Math.min(106 * k, (560 * k) / (0.6 * n));   // v0.61: back to the v0.56c size; v0.49: bigger, bolder (client); line box stays inside the 588 x 130 safe box
  return `<span class="coin-label v2c ${lab.cls}" style="font-size:${px(fs)}">${lab.text}</span>`;
}
/** Paytable icon: the whole canvas, uniformly scaled into the icon box. */
export function v2Icon(id) {
  const src = IMG[id] ? `${A}${IMG[id]}.webp${V}` : ASSETS.symbols[id];
  return `<div class="sym-svg v2-icon" data-id="${id}"><img src="${src}"${IMG[id] ? ' crossorigin="anonymous"' : ''} alt="" draggable="false"></div>`;
}

// ---------- surround ----------
const tileH = (file, x, y, w, contentTop, canvasW, canvasH, thick, cls = '', flipY = false) =>
  `<i class="v2t ${cls}" style="left:${px(x)};top:${px(y)};width:${px(w)};height:${px(thick)};background:url(${A}${file}) 0 ${px(-contentTop * k)} / ${px(canvasW * k)} ${px(canvasH * k)} repeat-x${flipY ? ';transform:scaleY(-1)' : ''}"></i>`;
const tileV = (file, x, y, h, contentLeft, canvasW, canvasH, thick, cls = '', flipX = false, phase = 0) =>
  `<i class="v2t ${cls}" style="left:${px(x)};top:${px(y)};width:${px(thick)};height:${px(h)};background:url(${A}${file}) ${px(-contentLeft * k)} ${px(phase)} / ${px(canvasW * k)} ${px(canvasH * k)} repeat-y${flipX ? ';transform:scaleX(-1)' : ''}"></i>`;
/** Whole-canvas piece: the canvas point (ax, ay) is placed at stage (x, y); scale s; optional mirror about that point. */
const piece = (file, x, y, canvasW, canvasH, ax, ay, s, cls = '', flip = '') =>
  `<img class="v2p ${cls}" src="${A}${file}" alt="" draggable="false" style="left:${px(x - ax * s)};top:${px(y - ay * s)};width:${px(canvasW * s)};height:${px(canvasH * s)}${flip ? `;transform:${flip};transform-origin:${px(ax * s)} ${px(ay * s)}` : ''}">`;

export function reelBoxV2(r) { const rows = r === 1 ? 4 : 3; return { x: X0 + r * (W + GAP), y: Y0 + ((4 - rows) * H) / 2, w: W, h: rows * H }; }

/** A sandstone frame: bars on the given sides of a window, corners where two bars meet on the outside. */
function frame(out, b, sides, shaftEnd = null) {   // v0.71: shaftEnd = where the side bars stop (the centre column's feet carry them on)
  const L = sides.includes('l'), R = sides.includes('r');
  // v0.55: the side bars' art has a dark outer edge (11 of 96 px); the rails stop where the side bars' stone starts, so
  // their ends never stick out past the corner
  const EDGE = 11 * k, x0 = b.x - (L ? BAR_V - EDGE : 0), x1 = b.x + b.w + (R ? BAR_V - EDGE : 0);
  // v0.52 (client, 26 Oct): plain stone all the way round - no separate corner pieces; the top and bottom rails are
  // drawn after the posts, so they run straight across the corners
  // the slab's thickness (22 px of a 271.5 px column in the client's reference = 87 art px); the upright bars start
  // under it, so they never stick up above the slab
  const CH = 110 * k, vTop = b.y - CH / 2, vH = (shaftEnd ?? b.y + b.h + BAR_H) - vTop;   // the block art is 79 % lit stone: 87 px of lit stone
  if (L) out.push(tileV('frame_bar_v_s.webp', b.x - BAR_V, vTop, vH, 0, 96, 1536, BAR_V, sides === 'l' ? 'bar side-l' : 'bar'));
  if (R) out.push(tileV('frame_bar_v_s.webp', b.x + b.w, vTop, vH, 0, 96, 1536, BAR_V, sides === 'r' ? 'bar side-r' : 'bar', true));
  // v0.55 (client art reference): the top of each column is one long stone slab (no brick joints), a little taller than
  // the rail and overhanging the column's outer sides; the side columns' slabs meet the centre column
  // proportions measured from the client's reference (centre column 270 px wide there): the slab is as tall as a rail and
  // overhangs by 9 px of 270 (= 36 art px here)
  const O = 36 * k, cx0 = L ? x0 - O - EDGE : x0, cx1 = R ? x1 + O + EDGE : x1;
  out.push(`<img class="v2p cap-slab" src="${A}stone_block.webp${V}" alt="" draggable="false" style="left:${px(cx0)};top:${px(b.y - CH)};width:${px(cx1 - cx0)};height:${px(CH)}">`);
  out.push(tileH(`frame_bar_h_s.webp${V}`, x0, b.y + b.h, x1 - x0, 0, 1536, 112, BAR_H, 'bar rail', true));
}

/** Build the surround (machine layer) and the win bar (bar layer). */
export function buildV2Surround(machine, asmBar) {
  const out = [];
  // v0.56 (client): the backdrop's lit windows glowed in the corner between a side column's top and the centre column
  // (next to the centre column's divider): a soft dark shade calms that corner on both sides, behind the surround
  // v0.67 (client): removed - it read as a shadow above the left and right columns. Kept here for reference only.
  if (false) { const c = reelBoxV2(1), CH = 110 * k;
    for (const r of [0, 2]) { const sb = reelBoxV2(r), left = r === 0, x0 = left ? sb.x - BAR_V - 36 * k : c.x + c.w + BAR_V - 12 * k,
      x1 = left ? c.x - BAR_V + 12 * k : sb.x + sb.w + BAR_V + 36 * k, y0 = c.y - CH - 40 * k, y1 = sb.y - CH + 30 * k;
      out.push(`<i class="v2p bg-calm ${left ? 'l' : 'r'}" style="left:${px(x0)};top:${px(y0)};width:${px(x1 - x0)};height:${px(y1 - y0)}"></i>`); } }
  // side columns: outer bar + top/bottom; their inner side meets the centre frame's side bar
  frame(out, reelBoxV2(0), 'l');
  frame(out, reelBoxV2(2), 'r');
  // centre column: framed on all four sides (its side bars separate the columns)
  // v0.71: the side bars stop where the feet's own straight shaft starts (70 reference px above the foot, 1 px overlap)
  // v0.73 (checklist 7): the side bars run on down behind the feet (the feet are drawn over them), so the join has no gap
  frame(out, reelBoxV2(1), 'lr', reelBoxV2(1).y + reelBoxV2(1).h);
  // outer patterned pillars (v0.54, client 27 Oct): part of the surround again, directly against the side columns and
  // zooming with them; 9 % shorter than the side frames at each end (the step); end caps from the pillar's own
  // sandstone edge; the toned-down diamond panel fills the length between them. Mirrored on the right.
  for (const r of [0, 2]) {
    const b = reelBoxV2(r), left = r === 0, full = b.h + 2 * BAR_H, step = 0.09 * full;
    const top = b.y - BAR_H + step, len = full - 2 * step, cap = 75 * k, d = 307.2 * k, body = len - 2 * cap;
    const pxl = left ? b.x - BAR_V - OUTER : b.x + b.w + BAR_V, phase = ((body % d) - d) / 2;
    out.push(tileV('pillar_outer_s.webp', pxl, top + cap, body, 0, 250, 1536, OUTER, 'outer', !left, phase));
    const capImg = (y, flipY) => `<img class="v2p outer pcap" src="${A}pillar_cap.webp" alt="" draggable="false" style="left:${px(pxl)};top:${px(y)};width:${px(OUTER)};height:${px(cap)}${!left || flipY ? `;transform:scale(${left ? 1 : -1},${flipY ? -1 : 1})` : ''}">`;
    out.push(capImg(top, false), capImg(top + len - cap, true));
  }
  // v0.71 (client art, 31 Oct): the centre column's feet - three shallow steps and the bottom of the column's shaft, one
  // piece each side (assets/reels_v21/foot_c_left/right, from the client's 1024 px PNGs). Placed by the art's anchor (512,
  // 800 of 1024 = the reel-facing inner edge at the foot's bottom) on the column's inner edge at the top of the win-bar
  // rail; 128 x 128 reference px at a 185 px centre cell, so q = cell width / 185 (one uniform scale, never stretched)
  { const b = reelBoxV2(1), bot = b.y + b.h, q = W / 185, S = 128 * q;
    for (const left of [true, false]) { const inner = left ? b.x : b.x + b.w;
      // v0.73 (checklist 7): measured from the two artworks - the foot's straight stone (lit 193-242 of its 512 px, at
      // q / 4 per px) is the same width as the bar's lit stone (10-69 of 96 px, at k per px), but sat 10.8 bar px towards
      // the reels; moved outwards by that so its stone continues the bar's exactly on both edges
      const JOIN = 10.8 * k * (left ? -1 : 1);
      out.push(`<img class="v2p foot" src="${A}foot_c_${left ? 'left' : 'right'}.webp${V}" alt="" draggable="false" style="left:${px(inner - 64 * q + JOIN)};top:${px(bot - 100 * q)};width:${px(S)};height:${px(S)}">`); } }
  // v0.52: no lintel and no widened upper rails on the centre column (client: the simpler surround)
  // static row dividers for the bonus board (the reels carry their own, so they move with the symbols); optional
  if (DIVIDERS) for (const r of [0, 1, 2]) { const b = reelBoxV2(r), rows = r === 1 ? 4 : 3;
    for (let i = 1; i < rows; i++) out.push(tileH('divider_gold_s.webp', b.x, b.y + i * H - DIV / 2, W, 0, 1536, 16, DIV, 'fdiv')); }
  // v0.70 (checklist 3 + 6): the bonus shadow round the grid is drawn ONCE as soft shadows behind each column (not a CSS
  // filter on the whole frame, which phones had to redraw at every step of the bonus zoom); much bigger than v0.68's
  const shadowHTML = [0, 1, 2].map(r => { const b = reelBoxV2(r), m = 0.10 * W;
    return `<i class="v2shadow" style="left:${px(b.x - m)};top:${px(b.y - m)};width:${px(b.w + 2 * m)};height:${px(b.h + 2 * m)}"></i>`; }).join('');
  const fr = document.createElement('div'); fr.id = 'v2frame'; fr.innerHTML = out.join('');
  // behind everything in the machine (reels and bonus squares cover the inside), so only the outside edge darkens
  machine.querySelector('#v2shadow')?.remove();
  const sh = document.createElement('div'); sh.id = 'v2shadow'; sh.innerHTML = shadowHTML; machine.prepend(sh);
  machine.insertBefore(fr, machine.querySelector('#featureLayer'));
  asmBar?.insertAdjacentHTML('afterbegin', piece('win_bar_wide_s.webp', WB_X, winTop, 1684, 281, 0, 0, WB_S, 'v2-winbar'));
  const st = document.querySelector('#stage');
  for (const [n, v] of Object.entries({ '--v2k': k, '--cw': W, '--ch': H, '--v2-wb-l': V2G.panel.left, '--v2-wb-t': V2G.panel.top,
    '--v2-wb-w': V2G.panel.width, '--v2-wb-h': V2G.panel.height, '--v2-halo': 1.5 * V2G.coinDiameter, '--fq': W / 222 }))
    st.style.setProperty(n, n === '--v2k' || n === '--fq' ? String(v) : px(v));   // --fq: v0.46 bonus pieces were drawn for a 222-unit cell
  document.body.classList.toggle('no-dividers', !DIVIDERS);
  return fr;
}

/**
 * v0.53 wings (items 3 / 12): the two patterned pillars, fixed to the screen edges. Each wing is drawn in the machine's
 * own art units inside a box scaled by `ws` (the machine's base scale), so it looks exactly like the old pillar; its
 * height comes from the layout (the side columns' height minus a step at each end, item 12). End caps are the pillar's
 * own sandstone edge, as thick as its side; the diamond panel fills the length between them.
 */
export const WING = { art: OUTER };
export function buildWings(stage) {
  let box = document.getElementById('wings');
  if (!box) { box = document.createElement('div'); box.id = 'wings'; box.setAttribute('aria-hidden', 'true'); stage.insertBefore(box, stage.querySelector('#game')); }
  return box;
}
export function placeWings(box, { left, right, top, height, ws }) {
  const lenArt = height / ws, cap = 75 * k, d = 307.2 * k, body = lenArt - 2 * cap, phase = ((body % d) - d) / 2;
  const one = (x, isLeft) => {
    const capImg = (y, flipY) => `<img class="v2p outer pcap" src="${A}pillar_cap.webp" alt="" draggable="false" style="left:0;top:${px(y)};width:${px(OUTER)};height:${px(cap)}${!isLeft || flipY ? `;transform:scale(${isLeft ? 1 : -1},${flipY ? -1 : 1})` : ''}">`;
    return `<div class="wing ${isLeft ? 'wl' : 'wr'}" style="left:${px(x)};top:${px(top)};width:${px(OUTER)};height:${px(lenArt)};transform:scale(${ws.toFixed(5)})">`
      + tileV('pillar_outer_s.webp', 0, cap, body, 0, 250, 1536, OUTER, 'outer', !isLeft, phase) + capImg(0, false) + capImg(lenArt - cap, true) + '</div>';
  };
  const key = [left, right, top, height, ws].map(v => v.toFixed(2)).join();
  if (box.dataset.key === key) return; box.dataset.key = key;
  box.innerHTML = one(left, true) + one(right - OUTER * ws, false);
}

/** Dark candlelit street: covers the window, uniform scale, centred (the pack's safe crop keeps the central street). */
export function layoutBackgroundV2() {
  const els = [...document.querySelectorAll('.bg-img')]; if (!els.length) return;
  const vw = innerWidth, vh = innerHeight, p = Math.max(vw / 1024, vh / 1536), w = 1024 * p, h = 1536 * p;
  for (const el of els) {
    el.style.setProperty('background-image', `url(${A}bg_scene.webp)`, 'important');
    el.style.setProperty('background-size', `${w.toFixed(1)}px ${h.toFixed(1)}px`, 'important');
    el.style.setProperty('background-position', `${((vw - w) / 2).toFixed(1)}px ${((vh - h) / 2).toFixed(1)}px`, 'important');
  }
  window.__bg = { v2: true, scale: +p.toFixed(4) };
}
