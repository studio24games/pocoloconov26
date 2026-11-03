// Fit the v0.53 prize-led shapes (27 Oct, client):
//   buy / superbuy  - "35 % profile" against the price: dud (<40 %) 5 %, 40-70 % 23.8 %, 70-100 % 36.1 %,
//                     100-130 % 23.3 %, 130-200 % 8.8 %, 200 %+ about 3 % (its size set so the RTP is RTP_BUY)
//   super (meter)   - never under 100x, average about 200x, typical about 150x
// Usage: node shapes53.mjs <buy|superbuy|super> [N]
import { playFeature, params, spinReels, bandOf, shapedDraw, playRound } from '../../math/engine.js';
import { SeededRNG, pickWeighted } from '../../math/rng.js';
import { COIN_TABLES, JACKPOTS, SHAPES, MODES, MAX_WIN_BU } from '../../math/config.js';

const P = params('standard');
const what = process.argv[2] || 'buy', N = +(process.argv[3] || 200000);
const rng = new SeededRNG(20261027);
const RTP_BUY = +(process.env.RTP || 0.968);
const toW = r => { const mx = Math.max(...r); return r.map(x => (x > 0 ? Math.max(1, Math.round(100000 * x / mx)) : 0)); };

function sample(E, n, one) {   // one() -> { total (BU), draws }
  const cnt = new Array(E.length).fill(0), sum = new Array(E.length).fill(0), vals = new Float64Array(n); let draws = 0;
  for (let i = 0; i < n; i++) { const { total, draws: d } = one(); draws += d; const v = Math.min(total, MAX_WIN_BU); const b = bandOf(E, v); cnt[b]++; sum[b] += v; vals[i] = v / 100; }
  vals.sort();
  return { p: cnt.map(c => c / n), m: sum.map((s, b) => (cnt[b] ? s / cnt[b] / 100 : 0)), avg: vals.reduce((a, b) => a + b, 0) / n, med: vals[n >> 1], vals, draws: draws / n };
}

if (what === 'buy' || what === 'superbuy') {
  const price = MODES[what].costPct / 100;
  // bands as multiples of the price
  const X = [0, 0.4, 0.7, 1.0, 1.3, 2.0, 3.0, 5.0, 10.0];
  const E = X.map(x => Math.round(x * price * 100));
  const saved = P.SHAPES[what]; P.SHAPES[what] = null;
  const nat = sample(E, N, () => ({ total: playRound(rng, what).feature.total, draws: 1 }));
  // target shares; the 200 %+ group keeps its inner split (2-3x : 3-5x : 5-10x : 10x+ = 65 : 24 : 8 : 3) and its size
  // (with the 70-100 % band giving or taking the difference) is solved so the average return is RTP_BUY
  const fixed = [0.050, 0.238, null, 0.233, 0.088], split = [0.65, 0.24, 0.08, 0.03];
  const at = big => { const t = [...fixed]; t[2] = 1 - 0.050 - 0.238 - 0.233 - 0.088 - big; split.forEach((s, i) => t.push(big * s)); return t; };
  const rtp = t => t.reduce((a, p, b) => a + p * nat.m[b], 0) / price;
  let lo = 0.001, hi = 0.2; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (rtp(at(m)) > RTP_BUY) hi = m; else lo = m; }
  const t = at((lo + hi) / 2);
  const w = toW(t.map((x, b) => (nat.p[b] ? x / nat.p[b] : 0)));
  P.SHAPES[what] = { edges: E, w };
  const chk = sample(E, N, () => { const f = playRound(rng, what).feature; return { total: f.total, draws: f.draws }; });
  P.SHAPES[what] = saved;
  const sh = s => X.map((x, b) => `${Math.round(x * 100)}%+:${(s.p[b] * 100).toFixed(1)}`).join(' ');
  console.log(what, 'price', price, '\n natural', sh(nat), 'RTP', (nat.avg / price * 100).toFixed(2) + '%', 'median', nat.med,
    '\n target ', t.map(x => (x * 100).toFixed(1)).join(' '), '\n shaped ', sh(chk), 'RTP', (chk.avg / price * 100).toFixed(2) + '%', 'median', chk.med, 'draws', chk.draws.toFixed(2),
    '\n in profit', ((1 - chk.p.slice(0, 3).reduce((a, b) => a + b, 0)) * 100).toFixed(1) + '%');
  console.log(JSON.stringify({ edges: E, w }));
}

if (what === 'super') {
  const E = [0, 10000, 15000, 20000, 30000, 50000, 100000, 200000, 500000];
  const fixed = { 0: 0, 5: 0.037, 6: 0.009, 7: 0.003, 8: 0.0004 };
  const base = [0, 0.50, 0.22, 0.15, 0.08];                  // 100-150, 150-200, 200-300, 300-500 before the average fit
  const AVG = +(process.env.AVG || 200);
  const draw = tn => { const p = pickWeighted(rng, COIN_TABLES[tn]); return typeof p === 'string' ? { v: JACKPOTS[p], jp: p } : { v: p, jp: null }; };
  const nearMissStart = () => { for (;;) { const { symbols } = spinReels(rng, 'base'); const cells = []; symbols.forEach((s, c) => { if (s === 'C') cells.push(c); });
    if (cells.length === 3) { const m = new Map(); for (const c of cells) m.set(c, draw('base')); return m; } } };
  const one = w => () => { const st = nearMissStart(); const r = shapedDraw(rng, w ? { edges: E, w } : null, () => playFeature(rng, st, { P, super: true }), f => f.total); return { total: r.out.total, draws: r.draws }; };
  const natM = sample(E, N, one(null));
  const target = m => { const rest = 1 - Object.values(fixed).reduce((a, b) => a + b, 0);
    const atL = lam => { const t = new Array(E.length).fill(0); let z = 0; for (let b = 1; b <= 4; b++) { t[b] = base[b] * Math.exp(lam * Math.log(m[b])); z += t[b]; }
      for (let b = 1; b <= 4; b++) t[b] *= rest / z; for (const [b, v] of Object.entries(fixed)) t[b] = v; return t; };
    const mean = t => t.reduce((a, p, b) => a + p * m[b], 0);
    let lo = -4, hi = 4; for (let i = 0; i < 60; i++) { const x = (lo + hi) / 2; if (mean(atL(x)) > AVG) hi = x; else lo = x; } return atL((lo + hi) / 2); };
  let tM = target(natM.m), r = tM.map((x, b) => (natM.p[b] ? x / natM.p[b] : 0)), w = toW(r), s;
  for (let it = 0; it < 6; it++) { s = sample(E, N, one(w)); tM = target(s.m); r = r.map((x, b) => (s.p[b] ? x * Math.pow(tM[b] / s.p[b], 0.9) : x)); w = toW(r);
    console.error('iter', it, 'avg', s.avg.toFixed(1), 'median', s.med, 'shares', s.p.map(x => (x * 100).toFixed(2)).join(' '), 'draws', s.draws.toFixed(2)); }
  s = sample(E, N, one(w));
  const over = x => s.vals.filter(v => v >= x).length / s.vals.length;
  console.log('natural avg', natM.avg.toFixed(1), 'median', natM.med, 'under100', (natM.p[0] * 100).toFixed(1) + '%');
  console.log('shaped  avg', s.avg.toFixed(1), 'median', s.med, 'min', s.vals[0], 'shares', s.p.map(x => (x * 100).toFixed(2)).join(' '), 'draws', s.draws.toFixed(2),
    '500x+ 1 in', (1 / over(500)).toFixed(0), '1000x+ 1 in', (1 / over(1000)).toFixed(0));
  console.log(JSON.stringify({ edges: E, w }));
}
