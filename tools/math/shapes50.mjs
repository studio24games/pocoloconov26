// Fit the v0.50 prize-led shapes (SHAPES.super, SHAPES.superbuy, SHAPES.loco) to the agreed targets (26 Oct).
// Usage: node shapes50.mjs <super|loco> [N]
import { playFeature, params, spinReels, bandOf, shapedDraw, evalLines } from '../../math/engine.js';
import { SeededRNG, pickWeighted } from '../../math/rng.js';
import { COIN_TABLES, JACKPOTS, SHAPES, LOCO, MODES } from '../../math/config.js';

const P = params('standard');
const what = process.argv[2] || 'super', N = +(process.argv[3] || 200000);
const rng = new SeededRNG(20261026);
const draw = t => { const p = pickWeighted(rng, COIN_TABLES[t]); return typeof p === 'string' ? { v: JACKPOTS[p], jp: p } : { v: p, jp: null }; };
export function nearMissStart(strips = 'base') {
  for (;;) { const { symbols } = spinReels(rng, strips); const cells = []; symbols.forEach((s, c) => { if (s === 'C') cells.push(c); });
    if (cells.length === 3) { const m = new Map(); for (const c of cells) m.set(c, draw('base')); return m; } }
}
const buyStart = () => { const n = pickWeighted(rng, P.MODES.superbuy.startCoins), m = new Map(); const cells = [...Array(10).keys()];
  for (let i = 0; i < n; i++) { const c = cells.splice(rng.int(cells.length), 1)[0]; m.set(c, draw('base')); } return m; };

/** sample totals (BU) with a given shape; returns band counts, band sums */
function sample(E, shape, play, n) {
  const cnt = new Array(E.length).fill(0), sum = new Array(E.length).fill(0); let draws = 0; const vals = new Float64Array(n);
  for (let i = 0; i < n; i++) { const { out, draws: d } = shapedDraw(rng, shape, play, x => x); draws += d; const v = Math.min(out, 500000); const b = bandOf(E, v); cnt[b]++; sum[b] += v; vals[i] = v / 100; }
  const q = [...vals].sort((a, b) => a - b);
  return { p: cnt.map(c => c / n), m: sum.map((s, b) => cnt[b] ? s / cnt[b] / 100 : 0), avg: vals.reduce((a, b) => a + b, 0) / n, med: q[n >> 1], p10: q[Math.floor(n * 0.1)], draws: draws / n,
    over: x => vals.filter(v => v >= x).length / n };
}
const toW = r => { const mx = Math.max(...r); return r.map(x => Math.round(10000 * x / mx)); };
const fmt = s => JSON.stringify({ avg: +s.avg.toFixed(1), med: s.med, p10: s.p10, under50: +(s.p.slice(0, 3).reduce((a, b) => a + b, 0) * 100).toFixed(1),
  over300: '1 in ' + (1 / s.over(300)).toFixed(1), over500: '1 in ' + (1 / s.over(500)).toFixed(1), over1000: '1 in ' + (1 / s.over(1000)).toFixed(0), max: '1 in ' + (1 / Math.max(s.over(5000), 1e-9)).toFixed(0), draws: +s.draws.toFixed(2) });

if (what === 'super') {
  const E = SHAPES.super.edges;
  // Targets (share of Supers): <50x 10% in all; 500x+ about 1 in 30; 1,000x+ about 1 in 300; 5,000x about 1 in 20,000.
  const fixed = { 0: 0.010, 1: 0.020, 2: 0.070, 9: 0.0297, 10: 0.0026, 11: 0.0006, 12: 0.00005 };
  const base = [0, 0, 0, 0.160, 0.200, 0.230, 0.120, 0.105, 0.052]; // middle bands 3-8 before the mean fit
  const AVG = +(process.env.AVG || 144);
  const target = means => { // tilt the middle bands so the average is AVG
    const restMass = 1 - Object.values(fixed).reduce((a, b) => a + b, 0);
    const at = lam => { const t = new Array(E.length).fill(0); let z = 0;
      for (let b = 3; b <= 8; b++) { t[b] = base[b] * Math.exp(lam * Math.log(means[b])); z += t[b]; }
      for (let b = 3; b <= 8; b++) t[b] *= restMass / z; for (const [b, v] of Object.entries(fixed)) t[b] = v;
      return t; };
    const mean = t => t.reduce((a, p, b) => a + p * means[b], 0);
    let lo = -3, hi = 3; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (mean(at(m)) > AVG) hi = m; else lo = m; }
    return at((lo + hi) / 2);
  };
  // 1) Super buy: start redrawn on every draw, so weights = target / natural exactly
  const playBuy = () => playFeature(rng, buyStart(), { P, super: true }).total;
  const nat = sample(E, null, playBuy, N);
  const tBuy = target(nat.m);
  const wBuy = toW(tBuy.map((t, b) => nat.p[b] ? t / nat.p[b] : 0));
  const chkBuy = sample(E, { edges: E, w: wBuy }, playBuy, N);
  console.log('superbuy natural', fmt(nat)); console.log('superbuy shaped ', fmt(chkBuy), 'RTP at', MODES.superbuy.costPct / 100, '=', (chkBuy.avg / (MODES.superbuy.costPct / 100) * 100).toFixed(2) + '%');
  // 2) Meter Super: the start (the near miss's 3 coins) is fixed, so iterate the weights
  const playMeter = (() => { let start = null; return { next() { start = nearMissStart(); }, play: () => playFeature(rng, start, { P, super: true }).total }; })();
  const sampleMeter = (w, n) => { const cnt = new Array(E.length).fill(0), sum = new Array(E.length).fill(0); let draws = 0; const vals = new Float64Array(n);
    for (let i = 0; i < n; i++) { playMeter.next(); const { out, draws: d } = shapedDraw(rng, w ? { edges: E, w } : null, playMeter.play, x => x); draws += d; const v = Math.min(out, 500000); const b = bandOf(E, v); cnt[b]++; sum[b] += v; vals[i] = v / 100; }
    const q = [...vals].sort((a, b) => a - b);
    return { p: cnt.map(c => c / n), m: sum.map((s, b) => cnt[b] ? s / cnt[b] / 100 : 0), avg: vals.reduce((a, b) => a + b, 0) / n, med: q[n >> 1], p10: q[Math.floor(n * 0.1)], draws: draws / n, over: x => vals.filter(v => v >= x).length / n }; };
  const natM = sampleMeter(null, N);
  const tM = target(natM.m);
  let r = tM.map((t, b) => natM.p[b] ? t / natM.p[b] : 0), wM = toW(r), s;
  for (let it = 0; it < 5; it++) { s = sampleMeter(wM, N); r = r.map((x, b) => s.p[b] ? x * Math.pow(tM[b] / s.p[b], 0.9) : x); wM = toW(r);
    console.error('meter iter', it, fmt(s)); }
  s = sampleMeter(wM, N);
  console.log('meter natural', fmt(natM)); console.log('meter shaped ', fmt(s));
  console.log(JSON.stringify({ superbuy: wBuy, super: wM, targetBuy: tBuy.map(x => +x.toFixed(5)), targetMeter: tM.map(x => +x.toFixed(5)) }));
}

if (what === 'loco') {
  const E = SHAPES.loco.edges; const M = P.MODES[process.env.MODE || 'base'];
  // Targets (share of Loco Spins): 5-7.5x 45%, 7.5-10x 25%, 10-15x 15%, 15-20x 6%, 20-30x 5%, 30-50x 4% (never under 5x or over 50x)
  const t = [0, 0.45, 0.25, 0.15, 0.06, 0.05, 0.04, 0];
  const locoWin = () => { // one natural Loco spin's line win (same steps as baseSpin in engine.js)
    const { symbols } = spinReels(rng, M.strips);
    for (let c = 3; c < 7; c++) symbols[c] = 'W';
    const outer = [0, 1, 2, 7, 8, 9].filter(c => symbols[c] !== 'C' && symbols[c] !== 'W');
    const k = Math.min(pickWeighted(rng, LOCO.wilds), outer.length);
    for (let i = 0; i < k; i++) symbols[outer.splice(rng.int(outer.length), 1)[0]] = 'W';
    const mult = pickWeighted(rng, LOCO.mult);
    for (const s of symbols) if (s === 'C') draw('base');
    return evalLines(symbols, mult).total;
  };
  const nat = sample(E, null, locoWin, N);
  const w = toW(t.map((x, b) => nat.p[b] ? x / nat.p[b] : 0));
  const chk = sample(E, { edges: E, w }, locoWin, N);
  const f = s => JSON.stringify({ avg: +s.avg.toFixed(2), med: s.med, under5: +(s.p[0] * 100).toFixed(1), at10: +((1 - s.p[0] - s.p[1] - s.p[2] - s.p[7]) * 100).toFixed(1), over50: +(s.p[7] * 100).toFixed(1), draws: +s.draws.toFixed(2), p: s.p.map(x => +x.toFixed(3)) });
  console.log('loco natural', f(nat)); console.log('loco shaped ', f(chk));
  console.log(JSON.stringify({ loco: w }));
}
