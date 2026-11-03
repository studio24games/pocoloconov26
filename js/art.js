import { ASSETS } from './assets.js';
import { ART_V2 } from './artv2.js';
// Original placeholder art for the Día de los Muertos theme — hand-built SVG, no external assets.
// Everything is injected once as an SVG sprite; cells reference symbols with <use href="#sym-XX">.
// To swap in production art later, replace symbolMarkup() with <img> tags from an asset manifest.

const OL = '#2a0d2e'; // outline plum

const P = {
  gold: ['#fff4b8', '#ffd04a', '#c7801a'], bone: ['#fffdf6', '#f1e6d2', '#d9c7aa'],
  magenta: '#ff2f92', orange: '#ff9a1f', teal: '#1fd1c8', purple: '#8a3ffc', lime: '#a6e22e',
  red: '#e8333f', yellow: '#ffd23f', blue: '#3aa0ff',
};

const flower = (cx, cy, r, petal, center = P.yellow, n = 8, stroke = OL) => {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (360 / n) * i;
    s += `<ellipse cx="${cx}" cy="${cy - r * 0.62}" rx="${r * 0.36}" ry="${r * 0.55}" fill="${petal}" stroke="${stroke}" stroke-width="${Math.max(1.5, r * 0.09)}" transform="rotate(${a} ${cx} ${cy})"/>`;
  }
  return s + `<circle cx="${cx}" cy="${cy}" r="${r * 0.36}" fill="${center}" stroke="${stroke}" stroke-width="${Math.max(1.5, r * 0.09)}"/>`;
};

// Marigold (cempasúchil): layered ruffled rings
const marigold = (cx, cy, r) => {
  let s = '';
  const rings = [[1, '#e86a00', 14], [0.78, '#ff8c00', 12], [0.56, '#ffab1f', 10], [0.34, '#ffd23f', 8]];
  for (const [k, col, n] of rings) {
    for (let i = 0; i < n; i++) {
      const a = (360 / n) * i + k * 37;
      s += `<ellipse cx="${cx}" cy="${cy - r * k * 0.55}" rx="${r * k * 0.3}" ry="${r * k * 0.5}" fill="${col}" stroke="${OL}" stroke-width="${Math.max(1.2, r * 0.05)}" transform="rotate(${a} ${cx} ${cy})"/>`;
    }
  }
  return s + `<circle cx="${cx}" cy="${cy}" r="${r * 0.14}" fill="#8a3b00"/>`;
};

// Sugar skull centred at (cx, cy) with scale k. eye = petal colour around the sockets.
const sugarSkull = (cx, cy, k, { eye = P.teal, eye2 = P.magenta, brow = P.orange } = {}) => `
<g transform="translate(${cx} ${cy}) scale(${k})">
  <path d="M0 -68 C-50 -68 -64 -32 -62 -2 C-61 18 -50 28 -40 34 L-40 54 C-40 64 -28 70 0 70 C28 70 40 64 40 54 L40 34 C50 28 61 18 62 -2 C64 -32 50 -68 0 -68 Z"
        fill="url(#gBone)" stroke="${OL}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M-46 -30 C-30 -48 30 -48 46 -30" fill="none" stroke="${brow}" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 8"/>
  ${flower(0, -44, 13, P.magenta, P.yellow, 6)}
  ${flower(-25, 2, 24, eye, eye2, 10)}
  ${flower(25, 2, 24, eye, eye2, 10)}
  <circle cx="-25" cy="2" r="12" fill="${OL}"/><circle cx="25" cy="2" r="12" fill="${OL}"/>
  <circle cx="-21" cy="-2" r="4" fill="#fff"/><circle cx="29" cy="-2" r="4" fill="#fff"/>
  <path d="M0 22 C-9 12 -12 26 0 33 C12 26 9 12 0 22 Z" fill="${OL}"/>
  <path d="M-30 46 L30 46" stroke="${OL}" stroke-width="4" stroke-linecap="round"/>
  ${[-22, -11, 0, 11, 22].map(x => `<path d="M${x} 40 L${x} 52" stroke="${OL}" stroke-width="3" stroke-linecap="round"/>`).join('')}
  <circle cx="-44" cy="24" r="3.5" fill="${P.magenta}"/><circle cx="-50" cy="14" r="2.5" fill="${P.teal}"/>
  <circle cx="44" cy="24" r="3.5" fill="${P.magenta}"/><circle cx="50" cy="14" r="2.5" fill="${P.teal}"/>
</g>`;

const DEFS = `
<defs>
  <linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.gold[0]}"/><stop offset=".45" stop-color="${P.gold[1]}"/><stop offset="1" stop-color="${P.gold[2]}"/></linearGradient>
  <linearGradient id="gGoldRim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset=".5" stop-color="#b86b0c"/><stop offset="1" stop-color="#ffd35a"/></linearGradient>
  <radialGradient id="gBone" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="${P.bone[0]}"/><stop offset=".7" stop-color="${P.bone[1]}"/><stop offset="1" stop-color="${P.bone[2]}"/></radialGradient>
  <linearGradient id="gWildBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b1a8c"/><stop offset="1" stop-color="#b0126a"/></linearGradient>
  <linearGradient id="gRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5b5b"/><stop offset="1" stop-color="#a3101e"/></linearGradient>
  <linearGradient id="gWood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset=".6" stop-color="#e3741b"/><stop offset="1" stop-color="#9c4210"/></linearGradient>
  <linearGradient id="gCandle" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9dcc3"/><stop offset=".45" stop-color="#fffaf0"/><stop offset="1" stop-color="#d4c2a2"/></linearGradient>
  <radialGradient id="gFlame" cx=".5" cy=".7" r=".6"><stop offset="0" stop-color="#fff7c2"/><stop offset=".5" stop-color="#ffb31f"/><stop offset="1" stop-color="#ff4d00"/></radialGradient>
  <radialGradient id="gGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd23f" stop-opacity=".9"/><stop offset="1" stop-color="#ff7a00" stop-opacity="0"/></radialGradient>
  <linearGradient id="gChili" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6b5a"/><stop offset=".6" stop-color="#d81e2b"/><stop offset="1" stop-color="#8e0a17"/></linearGradient>
  ${['MINI:#45d06b:#0f6b2a', 'MINOR:#47a8ff:#0d4a99', 'MAJOR:#c46bff:#5b1a9c', 'GRAND:#ff5a5a:#9c0f1a', 'CASH:#ffe27a:#b56a0d'].map(t => {
    const [id, a, b] = t.split(':');
    return `<linearGradient id="gRim${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient>`;
  }).join('')}
  <filter id="fShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#000" flood-opacity=".55"/></filter>
</defs>`;

const SYMBOLS = {
  // WILD — Catrina with a marigold crown on a jewel tile.
  W: `
    <rect x="8" y="6" width="184" height="158" rx="18" fill="url(#gWildBg)" stroke="url(#gGoldRim)" stroke-width="7"/>
    <rect x="16" y="14" width="168" height="142" rx="12" fill="none" stroke="#ffd35a" stroke-opacity=".35" stroke-width="2"/>
    ${sugarSkull(100, 84, 0.86, { eye: P.magenta, eye2: P.yellow, brow: P.teal })}
    ${marigold(48, 30, 22)}${flower(78, 18, 15, P.magenta, P.yellow, 7)}${marigold(100, 14, 18)}${flower(122, 18, 15, P.teal, P.yellow, 7)}${marigold(152, 30, 22)}
    <g filter="url(#fShadow)">
      <path d="M22 128 L178 128 L168 158 L32 158 Z" fill="url(#gGold)" stroke="${OL}" stroke-width="4" stroke-linejoin="round"/>
      <text x="100" y="152" text-anchor="middle" font-family="var(--font-display)" font-size="34" fill="${OL}" letter-spacing="2">WILD</text>
    </g>`,
  // H1 — mariachi skull with sombrero
  H1: `
    <g filter="url(#fShadow)">
    ${sugarSkull(100, 104, 0.78, { eye: P.orange, eye2: P.teal, brow: P.magenta })}
    <ellipse cx="100" cy="56" rx="94" ry="20" fill="url(#gRed)" stroke="${OL}" stroke-width="5"/>
    <path d="M14 56 Q100 84 186 56" fill="none" stroke="#ffd35a" stroke-width="4" stroke-dasharray="7 6"/>
    <path d="M58 56 C58 18 74 6 100 6 C126 6 142 18 142 56 Z" fill="url(#gRed)" stroke="${OL}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M60 44 C80 52 120 52 140 44" fill="none" stroke="#ffd35a" stroke-width="7"/>
    <path d="M62 44 C80 52 120 52 138 44" fill="none" stroke="${OL}" stroke-width="2" stroke-dasharray="3 5"/>
    </g>`,
  // H2 — guitar
  H2: `
    <g filter="url(#fShadow)" transform="translate(100 96) scale(.84) rotate(-28)">
      <rect x="-8" y="-98" width="16" height="70" rx="3" fill="#6b3410" stroke="${OL}" stroke-width="4"/>
      <path d="M-13 -112 L13 -112 L10 -92 L-10 -92 Z" fill="#3b1a08" stroke="${OL}" stroke-width="4" stroke-linejoin="round"/>
      ${[-104, -98].map(y => `<circle cx="-15" cy="${y}" r="3" fill="#ffd35a" stroke="${OL}" stroke-width="1.5"/><circle cx="15" cy="${y}" r="3" fill="#ffd35a" stroke="${OL}" stroke-width="1.5"/>`).join('')}
      <path d="M0 -40 C-26 -40 -34 -24 -30 -10 C-27 0 -38 6 -42 24 C-48 52 -24 72 0 72 C24 72 48 52 42 24 C38 6 27 0 30 -10 C34 -24 26 -40 0 -40 Z" fill="url(#gWood)" stroke="${OL}" stroke-width="5" stroke-linejoin="round"/>
      <circle cx="0" cy="8" r="17" fill="none" stroke="${P.teal}" stroke-width="6"/>
      <circle cx="0" cy="8" r="17" fill="none" stroke="${P.magenta}" stroke-width="2" stroke-dasharray="3 4"/>
      <circle cx="0" cy="8" r="12" fill="${OL}"/>
      <rect x="-16" y="40" width="32" height="7" rx="2" fill="#3b1a08" stroke="${OL}" stroke-width="2"/>
      ${[-4.5, -1.5, 1.5, 4.5].map(x => `<line x1="${x}" y1="-94" x2="${x}" y2="44" stroke="#fff6d8" stroke-width="1.2" opacity=".9"/>`).join('')}
      ${flower(-28, 46, 9, P.magenta, P.yellow, 6)}${flower(28, 46, 9, P.teal, P.yellow, 6)}
    </g>`,
  // M1 — marigold bloom with leaves
  M1: `
    <g filter="url(#fShadow)">
      <path d="M40 120 C60 96 80 104 92 112 C76 126 56 132 40 120 Z" fill="#3fae4a" stroke="${OL}" stroke-width="4"/>
      <path d="M160 120 C140 96 120 104 108 112 C124 126 144 132 160 120 Z" fill="#3fae4a" stroke="${OL}" stroke-width="4"/>
      ${marigold(100, 82, 62)}
    </g>`,
  // L1 — maracas
  L1: `
    <g filter="url(#fShadow)">
      <g transform="translate(78 84) rotate(-24)">
        <rect x="-6" y="18" width="12" height="62" rx="5" fill="#8b4a1b" stroke="${OL}" stroke-width="4"/>
        <ellipse cx="0" cy="-8" rx="32" ry="38" fill="${P.teal}" stroke="${OL}" stroke-width="5"/>
        <path d="M-30 -14 Q0 -2 30 -14" fill="none" stroke="${P.yellow}" stroke-width="6"/><path d="M-27 6 Q0 18 27 6" fill="none" stroke="${P.magenta}" stroke-width="6"/>
      </g>
      <g transform="translate(124 84) rotate(24)">
        <rect x="-6" y="18" width="12" height="62" rx="5" fill="#8b4a1b" stroke="${OL}" stroke-width="4"/>
        <ellipse cx="0" cy="-8" rx="32" ry="38" fill="${P.magenta}" stroke="${OL}" stroke-width="5"/>
        <path d="M-30 -14 Q0 -2 30 -14" fill="none" stroke="${P.yellow}" stroke-width="6"/><path d="M-27 6 Q0 18 27 6" fill="none" stroke="${P.teal}" stroke-width="6"/>
      </g>
    </g>`,
  // L2 — chili pepper
  L2: `
    <g filter="url(#fShadow)">
      <path d="M128 40 C150 46 156 70 146 96 C134 126 98 150 54 150 C46 150 44 142 52 138 C88 124 104 104 108 74 C110 58 112 44 128 40 Z" fill="url(#gChili)" stroke="${OL}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M122 54 C130 58 132 70 128 84" fill="none" stroke="#ffb3a8" stroke-width="5" stroke-linecap="round" opacity=".8"/>
      <path d="M118 44 C122 30 132 22 146 20 C148 26 142 30 136 32 C132 36 134 42 132 46 Z" fill="#3fae4a" stroke="${OL}" stroke-width="4" stroke-linejoin="round"/>
    </g>`,
  // L3 — candle
  L3: `
    <g filter="url(#fShadow)">
      <ellipse cx="100" cy="44" rx="30" ry="34" fill="url(#gGlow)"/>
      <path d="M100 18 C110 32 112 44 100 58 C88 44 90 32 100 18 Z" fill="url(#gFlame)" stroke="${OL}" stroke-width="3"/>
      <line x1="100" y1="56" x2="100" y2="66" stroke="${OL}" stroke-width="3"/>
      <rect x="70" y="64" width="60" height="88" rx="8" fill="url(#gCandle)" stroke="${OL}" stroke-width="5"/>
      <path d="M70 76 C78 86 84 72 92 82 C100 92 108 74 116 84 C122 90 126 80 130 78" fill="none" stroke="#fffaf0" stroke-width="6" stroke-linecap="round"/>
      <path d="M100 116 C92 106 84 116 100 130 C116 116 108 106 100 116 Z" fill="${P.magenta}" stroke="${OL}" stroke-width="3"/>
      ${flower(84, 98, 6, P.teal, P.yellow, 5)}${flower(116, 98, 6, P.orange, P.yellow, 5)}
    </g>`,
};

// Coins: one symbol per rim style. Value text is HTML-overlaid so it can show live currency.
const coin = rim => `
  <g filter="url(#fShadow)">
    <circle cx="100" cy="85" r="76" fill="url(#gRim${rim})" stroke="${OL}" stroke-width="5"/>
    ${Array.from({ length: 24 }, (_, i) => `<circle cx="100" cy="15" r="3.2" fill="#fff6c8" opacity=".75" transform="rotate(${i * 15} 100 85)"/>`).join('')}
    <circle cx="100" cy="85" r="60" fill="url(#gGold)" stroke="${OL}" stroke-width="4"/>
    <circle cx="100" cy="85" r="53" fill="none" stroke="#b8730f" stroke-width="2.5" stroke-dasharray="4 4"/>
    <g opacity=".55">${sugarSkull(100, 70, 0.44, { eye: '#c98a1c', eye2: '#e8a930', brow: '#b8730f' }).replace(/url\(#gBone\)/g, '#f0b73c')}</g>
    <path d="M44 86 L156 86 L150 114 L50 114 Z" fill="${OL}" stroke="#ffd35a" stroke-width="3" stroke-linejoin="round"/>
  </g>`;

for (const rim of ['CASH', 'MINI', 'MINOR', 'MAJOR', 'GRAND']) SYMBOLS[`C_${rim}`] = coin(rim);

// Marigold multiplier frame (overlay, cell sized)
SYMBOLS.FRAME = `
  <rect x="6" y="6" width="188" height="158" rx="20" fill="none" stroke="#ff9a1f" stroke-width="7"/>
  <rect x="6" y="6" width="188" height="158" rx="20" fill="none" stroke="#ffd23f" stroke-width="2" stroke-dasharray="6 7"/>
  ${[[14, 14], [186, 14], [14, 156], [186, 156], [100, 8], [100, 162], [8, 85], [192, 85]].map(([x, y], i) => (i < 4 ? marigold(x, y, 15) : flower(x, y, 9, P.magenta, P.yellow, 6))).join('')}`;

// ---------- Ofrenda (altar) scene for the TOTAL WIN screen. viewBox 0 0 600 560 ----------
const goldCoin = (x, y, r, tilt = 1) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * tilt}" fill="url(#gGold)" stroke="${OL}" stroke-width="2.5"/><ellipse cx="${x}" cy="${y}" rx="${r * 0.62}" ry="${r * 0.62 * tilt}" fill="none" stroke="#b8730f" stroke-width="2"/>`;
function altar() {
  let arch = '';
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI * (1 - i / 16), x = 300 + Math.cos(a) * 250, y = 330 - Math.sin(a) * 270;
    arch += i % 2 ? flower(x, y, 20, i % 4 === 1 ? P.magenta : P.teal, P.yellow, 7) : marigold(x, y, 30);
  }
  const flags = [P.magenta, P.orange, P.teal, P.purple, P.lime, P.yellow].map((c, i) => {
    const x = 160 + i * 48;
    return `<path d="M${x} 150 L${x + 44} 150 L${x + 44} 196 L${x + 22} 186 L${x} 196 Z" fill="${c}" stroke="${OL}" stroke-width="2.5"/><circle cx="${x + 22}" cy="168" r="6" fill="${OL}" opacity=".5"/>`;
  }).join('');
  let pile = '';
  const rows = [[300, 300, 0], [258, 312, 0], [342, 312, 0], [222, 330, 0], [378, 330, 0], [280, 330, 0], [320, 330, 0], [300, 280, 0], [270, 292, 0], [330, 292, 0]];
  for (const [x, y] of rows) pile += goldCoin(x, y, 24, 0.42);
  const spill = [[170, 470], [200, 492], [430, 478], [402, 498], [455, 500], [145, 498]].map(([x, y]) => goldCoin(x, y, 18, 0.45)).join('');
  return `
  <g filter="url(#fShadow)">${arch}</g>
  <path d="M150 150 Q300 132 450 150" fill="none" stroke="${OL}" stroke-width="3"/>${flags}
  <ellipse cx="300" cy="300" rx="190" ry="120" fill="url(#gGlow)" opacity=".8"/>
  <!-- altar table -->
  <rect x="40" y="430" width="520" height="120" rx="10" fill="#7a1250" stroke="${OL}" stroke-width="5"/>
  <path d="M40 440 ${Array.from({ length: 13 }, (_, i) => `Q${60 + i * 40} 478 ${80 + i * 40} 440`).join(' ')}" fill="#ff2f92" stroke="${OL}" stroke-width="4"/>
  ${Array.from({ length: 12 }, (_, i) => `<circle cx="${80 + i * 40}" cy="452" r="4" fill="${P.yellow}"/>`).join('')}
  <!-- candles -->
  <g transform="translate(-55 236) scale(1.15)">${SYMBOLS.L3}</g>
  <g transform="translate(425 236) scale(1.15)">${SYMBOLS.L3}</g>
  <!-- sugar skulls -->
  ${sugarSkull(150, 392, 0.62, { eye: P.teal, eye2: P.magenta })}
  ${sugarSkull(450, 392, 0.62, { eye: P.orange, eye2: P.teal })}
  <!-- olla overflowing with gold -->
  <g filter="url(#fShadow)">
    ${pile}
    <path d="M216 336 C190 380 200 450 250 474 L350 474 C400 450 410 380 384 336 Z" fill="#b5541c" stroke="${OL}" stroke-width="5"/>
    <path d="M206 338 L394 338 L388 356 L212 356 Z" fill="#8c3a10" stroke="${OL}" stroke-width="4"/>
    <path d="M214 392 Q300 412 386 392" fill="none" stroke="${P.yellow}" stroke-width="7"/>
    <path d="M222 420 Q300 440 378 420" fill="none" stroke="${P.teal}" stroke-width="6"/>
    ${flower(300, 404, 14, P.magenta, P.yellow, 6)}
    ${goldCoin(300, 268, 26, 0.5)}${goldCoin(252, 286, 20, 0.5)}${goldCoin(350, 284, 22, 0.5)}
  </g>
  ${spill}`;
}
SYMBOLS.ALTAR = altar();

export const SYMBOL_IDS = Object.keys(SYMBOLS).filter(k => k !== 'ALTAR');

export function injectSprite() {
  if (document.getElementById('sprite')) return;
  const body = Object.entries(SYMBOLS).map(([id, g]) => `<symbol id="sym-${id}" viewBox="${id === 'ALTAR' ? '0 0 600 560' : '0 0 200 170'}" overflow="visible">${g}</symbol>`).join('');
  const holder = document.createElement('div');
  holder.innerHTML = `<svg id="sprite" xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${DEFS}${body}</svg>`;
  document.body.prepend(holder.firstElementChild);
}

// Production images render inside a wrapper so overlays (e.g. the WILD banner text) animate with the art.
export const WILD_BANNER = { top: '83%', text: 'WILD' }; // v0.8: WILD sits on its own plate across the bottom of the wild symbol
export const COIN_BAND_TOP = '63.2%';
export const COIN_BAND = { C_CASH: '51.5%' };
// v0.30 symbol set: value plate centre on the 300 canvas (measured from the team sheet)
export const COIN_PLATE_V11 = { top: '53.8%', left: '48.85%', width: '63.9%' };   // v0.26: C01 coin, value centred on its dark plate   // v0.19: per-coin mouth-plate centre (new cash coin's plate sits higher)                         // v0.14: centre of the open-mouth plate on the skull coins
// v0.14 WILD: gold 3D letters on a red ribbon (option D). Shared gradients live in one hidden <svg> (ensureWildDefs).
const WF = 'font-family="Lilita One, Arial Black, Impact, sans-serif" font-size="74" letter-spacing="5"';
const wtp = (dy, attrs) => `<text ${attrs} transform="translate(0 ${dy})"><textPath href="#wr-arc" startOffset="50%" text-anchor="middle">WILD</textPath></text>`;
let wildSide = ''; for (let d = 6; d >= 1; d--) wildSide += wtp(d, `${WF} fill="#6b2e05" stroke="#6b2e05" stroke-width="10" stroke-linejoin="round"`);
export function ensureWildDefs() {
  if (document.getElementById('wild-defs')) return;
  const d = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); d.id = 'wild-defs'; d.setAttribute('width', '0'); d.setAttribute('height', '0');
  d.style.position = 'absolute';
  d.innerHTML = `<defs><path id="wr-arc" d="M 22 92 Q 150 72 278 92"/>
    <linearGradient id="wr-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6b8"/><stop offset=".45" stop-color="#ffd24a"/><stop offset=".55" stop-color="#e89a12"/><stop offset="1" stop-color="#a85a06"/></linearGradient>
    <linearGradient id="wr-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff3b3b"/><stop offset=".5" stop-color="#c8102e"/><stop offset="1" stop-color="#7a0a14"/></linearGradient>
    <filter id="wr-shadow" x="-20%" y="-40%" width="140%" height="180%"><feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#000" flood-opacity=".6"/></filter></defs>`;
  document.body.appendChild(d);
}
export const wildRibbon = () => `<svg class="wild-rib" viewBox="0 0 300 120" aria-label="WILD">
  <path d="M 4 70 L 34 62 L 24 84 L 34 106 L 4 98 Z" fill="#7a0a14"/><path d="M 296 70 L 266 62 L 276 84 L 266 106 L 296 98 Z" fill="#7a0a14"/>
  <path d="M 26 58 Q 150 36 274 58 L 274 100 Q 150 78 26 100 Z" fill="url(#wr-red)" stroke="#ffd35a" stroke-width="3"/>
  <g filter="url(#wr-shadow)">${wildSide}${wtp(0, `${WF} fill="url(#wr-gold)" stroke="#3a1504" stroke-width="6" stroke-linejoin="round" paint-order="stroke"`)}</g></svg>`;
export const hasImage = id => !!ASSETS.symbols[id];
/** overlay: extra HTML placed inside the image wrapper (e.g. a coin's value), so it moves with the art. */
// v0.8 skulls: lower jaw split line (fraction of the cell image) so the skulls can chomp when they win
export const JAW = { H1: 0.785, H2: 0.83, M1: 0.76 }; // v0.19: mock-up skull set
// v0.16: only the face's lower jaw moves; anything beside it (H1's gold ear pieces) stays on the top piece
export const JAWX = { H1: [0.27, 0.73], H2: [0.31, 0.69], M1: [0.25, 0.75] };
const skullImg = (id, src) => {
  const j = JAW[id] * 100, [l, r] = (JAWX[id] || [0, 1]).map(v => v * 100);
  const top = `polygon(0 0,100% 0,100% 100%,${r}% 100%,${r}% ${j}%,${l}% ${j}%,${l}% 100%,0 100%)`;
  return `<i class="sk-gap" style="top:calc(${j}% - 7%)${JAWX[id] ? `;left:${l + 5}%;right:${105 - r}%` : ''}"></i><img class="jaw-top" src="${src}" alt="" draggable="false" style="clip-path:${top}"><img class="jaw-bot" src="${src}" alt="" draggable="false" style="clip-path:inset(${j}% ${100 - r}% 0 ${l}%)">`;
};
// v0.34: a 1024 master is drawn as its own square box inside the 300 canvas (uniform scale, placement.json offsets)
const placeStyle = id => { const p = ASSETS.symbolPlace?.[id]; return p ? ` class="m12" style="left:${p[0]}%;top:${p[1]}%;width:${p[2]}%;height:${p[2]}%"` : ''; };
// v0.45 (team decision 21 Oct): the three skull characters sit in a gilded tile frame on their own painted backdrop.
// Head and hat break out over the top of the frame; the frame's lower half sits in front of the shoulders.
// Roll back with ?tiles=0 (or set TILE_FRAMES to false). Geometry: tools/build_tile_frames.py.
// v0.47: the new art (art v2) has no tile frames; ?tiles= only applies to the old art (?art=v1).
export const TILE_FRAMES = !ART_V2 && !(typeof location !== 'undefined' && /[?&]tiles=0\b/.test(location.search));
export const TF_IDS = new Set(['H1', 'H2', 'M1']);
export const framed = id => TILE_FRAMES && TF_IDS.has(id);
export const symbolSVG = (id, overlay = '') => (ASSETS.symbolCanvas && ASSETS.symbols[id] && framed(id)
  ? `<div class="sym-svg sym-img-wrap s300 tf" data-id="${id}"><i class="tf-back"></i><i class="tf-frame"></i><div class="tf-art"><img src="${ASSETS.symbols[id]}"${placeStyle(id)} alt="" draggable="false"></div><i class="tf-frame tf-front"></i>${overlay}</div>`
  : ASSETS.symbolCanvas && ASSETS.symbols[id] && !/^C_(MINI|MINOR|MAJOR|GRAND)$/.test(id)
  ? `<div class="sym-svg sym-img-wrap s300" data-id="${id}"><img src="${ASSETS.symbols[id]}"${placeStyle(id)} alt="" draggable="false">${overlay}</div>`
  : ASSETS.symbols[id] && JAW[id]
  ? `<div class="sym-svg sym-img-wrap skull">${skullImg(id, ASSETS.symbols[id])}${overlay}</div>`
  : ASSETS.symbols[id]
  ? `<div class="sym-svg sym-img-wrap" data-id="${id}"><img src="${ASSETS.symbols[id]}" alt="" draggable="false">${overlay}</div>`
  : `<svg class="sym-svg" viewBox="0 0 200 170" overflow="visible"><use href="#sym-${id}"/></svg>`);
export const altarSVG = () => (ASSETS.ui.altar
  ? `<img class="altar-svg" src="${ASSETS.ui.altar}" alt="">`
  : `<svg class="altar-svg" viewBox="0 0 600 560" overflow="visible"><use href="#sym-ALTAR"/></svg>`);

export const SYMBOL_NAMES = {
  // v0.8 symbol order (team review): hat character = Wild, three skulls, three objects.
  // Until the new skull art arrives the skull slots show interim art (Catrina, candle, marigold).
  W: 'Calavera Wild', H1: 'Mariachi', H2: 'Catrina', M1: 'Bandido', L1: 'Gold Ring', L2: 'Guitarra', L3: 'Maracas', C: 'Coin',   // v0.30 set
};
