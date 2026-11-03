// Low-noise PAR for math 0.6.0 (v0.50).
//   Line wins (ordinary spins): exact enumeration of every stop combination.
//   Loco Spin: its shaped pay and its coins from millions of shaped Loco Spins (engine's own baseSpin + shapedDraw).
//   Triggers / near misses: exact for ordinary spins (Coin Save rate from config), sampled for Loco Spins.
//   Standard bonus: millions of bonuses from triggers sampled exactly from the enumerated reel stops (natural shape).
//   Super (meter): rate = near misses per spin / steps; value = shaped Supers from near-miss starts sampled the same way.
// Usage: node par50.mjs <base|double> [profile=standard] [bonuses=2000000] [seed=1]
import { playFeature, params, baseSpin, shapedDraw } from '../../math/engine.js';
import { SeededRNG, pickWeighted } from '../../math/rng.js';
import { STRIPS, PAYTABLE, LINES, COIN_TABLES, JACKPOTS, FEATURE, MAX_WIN_BU } from '../../math/config.js';

const [mode = 'base', profile = 'standard', nArg = '2000000', seedArg = '1'] = process.argv.slice(2);
const P = params(profile), M = P.MODES[mode], strips = STRIPS[M.strips];
const cost = M.costPct / 100, pLoco = M.loco ? P.LOCO.num / P.LOCO.den : 0;
const CELL_OF = [[0, 1, 2], [3, 4, 5, 6], [7, 8, 9]];
const LC = LINES.map(rows => rows.map((row, r) => CELL_OF[r][row]));
const lineWin = sym => { let w = 0; for (const L of LC) { const s = L.map(c => sym[c]); if (s.includes('C')) continue;
  const t = s.find(x => x !== 'W') ?? 'W'; if (s.every(x => x === t || x === 'W')) w += PAYTABLE[t]; } return w; };
const rng = new SeededRNG(+seedArg);

// ---- exact enumeration of ordinary spins ----
const [a, b, c] = strips; const N = a.length * b.length * c.length;
let lineSum = 0; const trig = []; const sym = new Array(10);
const bands = { sub: 0, b12: 0, b25: 0, b510: 0, b1020: 0, b20: 0 };
for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) for (let k = 0; k < c.length; k++) {
  for (let r = 0; r < 3; r++) sym[r] = a[(i + r) % a.length];
  for (let r = 0; r < 4; r++) sym[3 + r] = b[(j + r) % b.length];
  for (let r = 0; r < 3; r++) sym[7 + r] = c[(k + r) % c.length];
  const w = lineWin(sym); lineSum += w;
  if (w > 0) bands[w < 100 ? 'sub' : w < 200 ? 'b12' : w < 500 ? 'b25' : w < 1000 ? 'b510' : w < 2000 ? 'b1020' : 'b20']++;
  const coins = []; sym.forEach((s, cc) => { if (s === 'C') coins.push(cc); });
  if (coins.length >= 3) trig.push(coins);
}
const r3 = M.rescue3Num / FEATURE.rescue3.den;

// ---- Loco Spins (shaped), sampled ----
const nLoco = pLoco ? 1000000 : 0; let locoSum = 0, locoSq = 0; const locoTrig = []; let locoDraws = 0; const locoBand = { u10: 0, o10: 0, o20: 0 };
const locoShape = P.SHAPES[`loco_${mode}`] ?? P.SHAPES.loco;
for (let i = 0; i < nLoco; i++) {
  const { out, draws } = shapedDraw(rng, locoShape, () => baseSpin(rng, M, P.LOCO, true), sp => sp.lines.total);
  locoDraws += draws; const x = out.lines.total / 100; locoSum += x; locoSq += x * x;
  if (x >= 20) locoBand.o20++; if (x >= 10) locoBand.o10++; else locoBand.u10++;
  if (out.coins.size >= 3) locoTrig.push([...out.coins.keys()]);
}
const linesRTP = (1 - pLoco) * lineSum / N / 100;
const locoMean = nLoco ? locoSum / nLoco : 0, locoRTP = pLoco * locoMean;
const pTrig = st => st.reduce((acc, cs) => acc + (cs.length >= 4 ? 1 : r3), 0);
const trigRate = (1 - pLoco) * pTrig(trig) / N + (nLoco ? pLoco * pTrig(locoTrig) / nLoco : 0);
const pNear = ((1 - pLoco) * trig.filter(cs => cs.length === 3).length / N + (nLoco ? pLoco * locoTrig.filter(cs => cs.length === 3).length / nLoco : 0)) * (1 - r3);

// ---- bonus values: triggers sampled exactly ----
const pool = [];
for (const cs of trig) pool.push([cs, (cs.length >= 4 ? 1000 : M.rescue3Num) * (1 - pLoco) / N]);
for (const cs of locoTrig) pool.push([cs, (cs.length >= 4 ? 1000 : M.rescue3Num) * pLoco / nLoco]);
const mkPicker = list => { const tot = list.reduce((x, [, w]) => x + w, 0), cum = []; list.reduce((acc, [, w], i) => (cum[i] = acc + w), 0);
  return () => { const x = rng.int(2 ** 30) / 2 ** 30 * tot; let lo = 0, hi = cum.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] > x) hi = mid; else lo = mid + 1; } return list[lo][0]; }; };
const pickTrig = mkPicker(pool);
const nearList = [];
for (const cs of trig) if (cs.length === 3) nearList.push([cs, (1 - pLoco) / N]);
for (const cs of locoTrig) if (cs.length === 3) nearList.push([cs, pLoco / nLoco]);
const pickNear = mkPicker(nearList);
const drawBase = () => { const p = pickWeighted(rng, COIN_TABLES.base); return typeof p === 'string' ? { v: JACKPOTS[p], jp: p } : { v: p, jp: null }; };
function sampleStart() {
  const cells = pickTrig(); const m = new Map(cells.map(cc => [cc, drawBase()]));
  if (cells.length === 3) { const k = pickWeighted(rng, FEATURE.rescue3.add); const e = []; for (let x = 0; x < 10; x++) if (!m.has(x)) e.push(x);
    for (let q = 0; q < k; q++) m.set(e.splice(rng.int(e.length), 1)[0], drawBase()); }
  return m;
}
const sampleNear = () => new Map(pickNear().map(cc => [cc, drawBase()]));
const n = +nArg;
const stat = isSuper => { let s = 0, s2 = 0, full = 0, draws = 0; const xs = new Float64Array(isSuper ? Math.ceil(n / 4) : n);
  for (let i = 0; i < xs.length; i++) {
    let f;
    if (isSuper) { const st = sampleNear(); const r = shapedDraw(rng, P.SHAPES.super, () => playFeature(rng, st, { P, super: true }), q => q.total); f = r.out; draws += r.draws; }
    else { const st = sampleStart(); const r = shapedDraw(rng, P.SHAPES[`standard_${mode}`] ?? P.SHAPES.standard, () => playFeature(rng, st, { P }), q => q.total); f = r.out; draws += r.draws; }
    const x = Math.min(f.total, MAX_WIN_BU) / 100; xs[i] = x; s += x; s2 += x * x; if (f.fullHouse.applied) full++; }
  xs.sort(); const mean = s / xs.length;
  return { mean, sd: Math.sqrt(s2 / xs.length - mean * mean), median: xs[xs.length >> 1], full: full / xs.length, draws: draws / xs.length,
    under20: xs.filter(v => v < 20).length / xs.length, under50: xs.filter(v => v < 50).length / xs.length, over100: xs.filter(v => v >= 100).length / xs.length,
    over500: xs.filter(v => v >= 500).length / xs.length, over1000: xs.filter(v => v >= 1000).length / xs.length, se: Math.sqrt(s2 / xs.length - mean * mean) / Math.sqrt(xs.length) }; };
const std = stat(false), sup = stat(true);
const superRate = pNear / P.METER.candles;
const bonusRTP = trigRate * std.mean + superRate * sup.mean;
const rtp = (linesRTP + locoRTP + bonusRTP) / cost;
const se = Math.sqrt((trigRate * std.se) ** 2 + (superRate * sup.se) ** 2 + (pLoco * Math.sqrt(locoSq / Math.max(1, nLoco) - locoMean ** 2) / Math.sqrt(Math.max(1, nLoco))) ** 2) / cost;
const pct = x => (100 * x).toFixed(3) + '%', oneIn = p => p > 0 ? +(1 / p).toFixed(1) : null;
console.log(JSON.stringify({
  mode, profile, cost, RTP: pct(rtp), RTP_95CI: '±' + (196 * se).toFixed(3) + ' pts',
  parts: { lines: pct(linesRTP / cost), loco: pct(locoRTP / cost), stdBonus: pct(trigRate * std.mean / cost), superBonus: pct(superRate * sup.mean / cost) },
  every: { lineHit: oneIn(Object.values(bands).reduce((x, y) => x + y, 0) / N), bonus: +(1 / trigRate).toFixed(1), super: +(1 / superRate).toFixed(0), nearMiss: +(1 / pNear).toFixed(1), loco: pLoco ? 1 / pLoco : null },
  lineBands_1in: Object.fromEntries(Object.entries(bands).map(([k, v]) => [k, oneIn(v / N)])),
  loco: { avg: +locoMean.toFixed(2), at10: +(locoBand.o10 / Math.max(1, nLoco) * 100).toFixed(1) + '%', at20: +(locoBand.o20 / Math.max(1, nLoco) * 100).toFixed(1) + '%', draws: +(locoDraws / Math.max(1, nLoco)).toFixed(2) },
  std: { avg: +std.mean.toFixed(2), median: +std.median.toFixed(1), under20: +(std.under20 * 100).toFixed(1) + '%', under50: +(std.under50 * 100).toFixed(1) + '%', over100: +(std.over100 * 100).toFixed(1) + '%', fullHouse: oneIn(std.full) },
  super: { avg: +sup.mean.toFixed(1), median: +sup.median.toFixed(1), under50: +(sup.under50 * 100).toFixed(1) + '%', over500: oneIn(sup.over500), over1000: oneIn(sup.over1000), fullHouse: oneIn(sup.full), draws: +sup.draws.toFixed(2) },
}, null, 1));
