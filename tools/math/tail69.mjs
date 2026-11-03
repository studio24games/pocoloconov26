// v0.69: how often natural Hold & Win totals reach each size from 500x to 5,000x (the cap), and the RTP each size holds,
// for an option set. Exact weighting: unshaped plays are kept with chance w_band / max w, as shapedDraw does.
// Usage: node tools/math/tail69.mjs <profile> [stdPlays] [superPlays] [hwEvery]
import { playFeature, params } from '../../math/engine.js';
import { SeededRNG, pickWeighted } from '../../math/rng.js';
import { COIN_TABLES, JACKPOTS, CELL_COUNT } from '../../math/config.js';
const [prof = 'lean+steady+bigFH', NS = 2000000, NU = 600000, EVERY = 109] = process.argv.slice(2);
const P = params(prof), SUP = P.SUPER.upgrade.num / P.SUPER.upgrade.den;
const coin = rng => { const v = pickWeighted(rng, COIN_TABLES.base); return typeof v === 'string' ? { v: JACKPOTS[v], jp: v } : { v, jp: null }; };
const band = (e, x) => { let b = 0; while (b + 1 < e.length && x >= e[b + 1]) b++; return b; };
const T = []; for (let x = 500; x < 1000; x += 100) T.push(x); for (let x = 1000; x <= 5000; x += 500) T.push(x);
function dist(kind, N) { const sh = P.SHAPES[kind], mx = Math.max(...sh.w), rng = new SeededRNG(kind === 'super' ? 5 : 6);
  let W = 0, Wv = 0; const ge = T.map(() => 0), gev = T.map(() => 0);
  for (let i = 0; i < N; i++) { const m = new Map(), cells = [...Array(CELL_COUNT).keys()], n = rng.int(100) < 88 ? 4 : 5;
    for (let k = 0; k < n; k++) m.set(cells.splice(rng.int(cells.length), 1)[0], coin(rng));
    const v = Math.min(playFeature(rng, m, kind === 'super' ? { P, super: true } : { P }).total, 500000), w = sh.w[band(sh.edges, v)] / mx; if (!w) continue;
    W += w; Wv += w * v; T.forEach((t, k) => { if (v >= t * 100) { ge[k] += w; gev[k] += w * v; } }); }
  return { mean: Wv / W, ge: ge.map(x => x / W), gev: gev.map(x => x / W) }; }
const s = dist('standard', +NS), u = dist('super', +NU);
const pSpin = 1 / +EVERY, rows = T.map((t, k) => { const p = pSpin * ((1 - SUP) * s.ge[k] + SUP * u.ge[k]), pts = 100 * pSpin * ((1 - SUP) * s.gev[k] + SUP * u.gev[k]) / 100 / 100;
  return { x: t, oneIn: p ? Math.round(1 / p) : null, rtpPtsAtOrAbove: +pts.toFixed(3) }; });
console.log(JSON.stringify({ prof, meanStd: +(s.mean / 100).toFixed(1), meanSuper: +(u.mean / 100).toFixed(1), bonusRtpPts: +(100 * pSpin * ((1 - SUP) * s.mean + SUP * u.mean) / 100 / 100).toFixed(2), rows }));
