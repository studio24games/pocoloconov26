// v0.63 / math 0.8.0 PAR: theoretical RTP per mode with low noise.
//  - line wins and coins on screen: exact, every reel stop (Mystery reveal weighted), from reelopt63's evaluate()
//  - Loco Spin, Hold & Win (standard and Super), Buy and Super buy: large simulations of the shaped draws
// RTP(base / double) = (1 - pLoco) * lines + pLoco * locoMean + pTrigger * bonusMean, all per base bet, / cost.
// Usage: node tools/math/par63.mjs [bonuses=600000] [seed=9] [profile=standard]   (lite profiles: run with LITE=1)
import { evaluate, SYMS } from './reelopt63.mjs';
import { playFeature, shapedDraw, baseSpin, params, featureRule } from '../../math/engine.js';
import { SeededRNG, pickWeighted } from '../../math/rng.js';
import { STRIPS, PAYTABLE, COIN_TABLES, JACKPOTS, CELL_COUNT, FEATURE } from '../../math/config.js';

const NB = +(process.argv[2] || 600000), rng = new SeededRNG(+(process.argv[3] || 9)), PROFILE = process.argv[4] || 'standard';
const P = params(PROFILE);
const IDX = Object.fromEntries(SYMS.map((s, i) => [s, i]));
const pays = [...SYMS.slice(0, 7).map(s => P.PAYTABLE[s]), 0, 0];   // v0.66: the version's own paytable
const coin = () => { const v = pickWeighted(rng, COIN_TABLES.base); return typeof v === 'string' ? { v: JACKPOTS[v], jp: v } : { v, jp: null }; };
const mean = (n, f) => { let s = 0, s2 = 0; for (let i = 0; i < n; i++) { const x = f(); s += x; s2 += x * x; } const m = s / n; return { m, se: Math.sqrt((s2 / n - m * m) / n) }; };

const out = {};
for (const mode of ['base', 'double']) {
  const M = P.MODES[mode];
  const r = evaluate(STRIPS[M.strips].map(s => Int8Array.from(s, x => IDX[x])), pays);
  // exact share of 4 / 5 / 6+ coins among natural triggers is approximated as 4: 88%, 5+: 12% (the strips' c4 is 4+)
  const res = M.rescue3Num / FEATURE.rescue3.den;
  const pTrig = r.c4 * (1 - ((mode === 'double' ? P.TRIG?.thinDouble ?? P.TRIG?.thin : P.TRIG?.thin) ?? 0) / 1000) + r.c3 * res;   // v0.68 bonusRare: thinned natural triggers
  const pL = M.loco ? P.LOCO.num / P.LOCO.den : 0;
  const shape = n => P.SHAPES[`${n}_${mode}`] ?? P.SHAPES[n];
  const loco = mean(Math.round(NB / 4), () => shapedDraw(rng, (P.LOCO.shapeSet && P.SHAPES[`${P.LOCO.shapeSet}_${M.strips}`]) ?? shape('loco'), () => baseSpin(rng, M, P.LOCO, true, P.MYSTERY, P.PAYTABLE), sp => sp.lines.total).out.lines.total);
  const start = () => { const m = new Map(); const n = rng.int(100) < 88 ? 4 : 5; const cells = [...Array(CELL_COUNT).keys()];
    for (let i = 0; i < n; i++) m.set(cells.splice(rng.int(cells.length), 1)[0], coin()); return m; };
  const q = (M.superNum ?? P.SUPER.upgrade.num) / P.SUPER.upgrade.den;
  const std = mean(NB, () => Math.min(shapedDraw(rng, shape('standard'), () => playFeature(rng, start(), { P }), f => f.total, featureRule(P, mode)).out.total, 500000));
  const sup = mean(Math.round(NB / 4), () => Math.min(shapedDraw(rng, shape('super'), () => playFeature(rng, start(), { P, super: true }), f => f.total, featureRule(P, mode)).out.total, 500000));
  const bonus = (1 - q) * std.m + q * sup.m;
  const lines = r.rtp * 100;   // BU per spin
  const rtp = ((1 - pL) * lines + pL * loco.m + pTrig * bonus) / M.costPct * 100;
  const se = Math.sqrt((pTrig * (1 - q) * std.se) ** 2 + (pTrig * q * sup.se) ** 2 + (pL * loco.se) ** 2) / M.costPct * 100;
  out[mode] = { rtp: +rtp.toFixed(2), se: +se.toFixed(2), hitLines: +(100 * r.hit).toFixed(2), lines: +((1 - pL) * lines / M.costPct * 100).toFixed(2),
    loco: +(pL * loco.m / M.costPct * 100).toFixed(2), holdAndWinEvery: +(1 / pTrig).toFixed(1), bonus: +(pTrig * bonus / M.costPct * 100).toFixed(2),
    bonusMeanX: +(bonus / 100).toFixed(1), stdX: +(std.m / 100).toFixed(1), superX: +(sup.m / 100).toFixed(1), locoX: +(loco.m / 100).toFixed(2),
    coins: [r.c1, r.c2, r.c3, r.c4].map(x => +(100 * x).toFixed(2)) };
}
for (const mode of ['buy', 'superbuy']) {
  const M = P.MODES[mode];
  const start = () => { const n = pickWeighted(rng, M.startCoins), m = new Map(), cells = [...Array(CELL_COUNT).keys()];
    for (let i = 0; i < n; i++) m.set(cells.splice(rng.int(cells.length), 1)[0], coin()); return m; };
  const opts = mode === 'buy' ? { P, buy: true } : { P, super: true, superBuy: true };
  const b = mean(Math.round(NB / 2), () => Math.min(shapedDraw(rng, P.SHAPES[mode], () => playFeature(rng, start(), opts), f => f.total, featureRule(P, mode)).out.total, 500000));
  out[mode] = { price: M.costPct / 100, meanX: +(b.m / 100).toFixed(2), rtp: +(b.m / M.costPct * 100).toFixed(2), se: +(b.se / M.costPct * 100).toFixed(2),
    priceAt967: +(b.m / 96.7).toFixed(1) };
}
console.log(JSON.stringify(out, null, 1));
