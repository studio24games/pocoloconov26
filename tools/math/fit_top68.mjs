// v0.68 options topTrim / topLean (menu: Top wins "Trimmed" / "Lean top"): results of 250x+ (bands from 25000 BU) kept
// k = 0.5 / 0.25 times as often, and the 40-150x bands (4000-15000 BU) raised by the factor that keeps each bonus type's
// average (exact: shaped mean = sum nat_b w_b m_b / sum nat_b w_b, from unshaped samples). Prints SHAPEF maps per k.
// Usage: node tools/math/fit_top68.mjs [plays=300000]
import { playFeature, params } from '../../math/engine.js';
import { SeededRNG, pickWeighted } from '../../math/rng.js';
import { COIN_TABLES, JACKPOTS, CELL_COUNT, SHAPES, PROFILES } from '../../math/config.js';
const N = +(process.argv[2] || 300000), P = params('standard');
const coin = rng => { const v = pickWeighted(rng, COIN_TABLES.base); return typeof v === 'string' ? { v: JACKPOTS[v], jp: v } : { v, jp: null }; };
function sample(kind) { const rng = new SeededRNG(21), out = new Float64Array(N);
  for (let i = 0; i < N; i++) { const n = kind === 'buy' || kind === 'superbuy' ? pickWeighted(rng, P.MODES[kind].startCoins) : (rng.int(100) < 88 ? 4 : 5);
    const m = new Map(), cells = [...Array(CELL_COUNT).keys()]; for (let k = 0; k < n; k++) m.set(cells.splice(rng.int(cells.length), 1)[0], coin(rng));
    const o = kind === 'buy' ? { P, buy: true } : kind === 'super' ? { P, super: true } : kind === 'superbuy' ? { P, super: true, superBuy: true } : { P };
    out[i] = Math.min(playFeature(rng, m, o).total, 500000); } return out; }
const stats = (xs, e) => { const c = new Array(e.length).fill(0), s = new Array(e.length).fill(0);
  for (const x of xs) { let b = 0; while (b + 1 < e.length && x >= e[b + 1]) b++; c[b]++; s[b] += x; } return { c, m: s.map((v, i) => (c[i] ? v / c[i] : 0)) }; };
const meanOf = (st, w) => { let a = 0, z = 0; w.forEach((x, b) => { a += st.c[b] * x * st.m[b]; z += st.c[b] * x; }); return a / z; };
const out = { 0.5: {}, 0.25: {} }, report = [];
for (const kind of ['standard', 'super', 'buy', 'superbuy']) {
  const xs = sample(kind);
  const shapes = [SHAPES[kind], PROFILES.steady?.SHAPES?.[kind]].filter(Boolean);
  for (const sh of shapes) { const st = stats(xs, sh.edges), m0 = meanOf(st, sh.w);
    for (const k of [0.5, 0.25]) {
      const top = sh.edges.map(e => e >= 25000), mid = sh.edges.map((e, b) => e >= Math.max(4000, 0.8 * m0) && e < 25000 && sh.w[b] > 0);   // just under the average up to 250x
      let lo = 1, hi = 20; for (let it = 0; it < 60; it++) { const B = (lo + hi) / 2, w = sh.w.map((x, b) => x * (top[b] ? k : mid[b] ? B : 1)); if (meanOf(st, w) > m0) hi = B; else lo = B; }
      const B = (lo + hi) / 2, f = sh.edges.map((_, b) => +(top[b] ? k : mid[b] ? B : 1).toFixed(4));
      const w = sh.w.map((x, b) => x * f[b]); const share = (ww) => { let t = 0, z = 0; ww.forEach((x, b) => { z += st.c[b] * x; if (top[b]) t += st.c[b] * x; }); return t / z; };
      out[k][`${kind}:${sh.edges.join(',')}`] = f;
      report.push(`${kind}${sh === shapes[1] ? '/steady' : ''} k=${k}: mid x${B.toFixed(3)}, 250x+ share ${(100 * share(sh.w)).toFixed(2)}% -> ${(100 * share(w)).toFixed(2)}%, mean ${(m0 / 100).toFixed(1)}x -> ${(meanOf(st, w) / 100).toFixed(1)}x`); } } }
console.error(report.join('\n'));
console.log(JSON.stringify(out));
