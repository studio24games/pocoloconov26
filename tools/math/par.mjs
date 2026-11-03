// Low-noise PAR for math 0.3.0.
//   Line wins and Loco Spin: exact enumeration of every stop combination.
//   Trigger rate: exact (coin counts from enumeration, Coin Save rate from config).
//   Super share of bonuses: from a long meter-only simulation (near misses only, cheap).
//   Bonus values: millions of bonuses started from triggers sampled exactly from the enumerated reel stops.
// Usage (0.4.0 instant Super): node par.mjs <base|double> [profile=standard] [bonuses=2000000] [seed=1]
import { playFeature, params, spinReels } from '../poco/math/engine.js';
import { SeededRNG, pickWeighted } from '../poco/math/rng.js';
import { STRIPS, PAYTABLE, LINES, COIN_TABLES, JACKPOTS, FEATURE, MODES, PROFILES, MAX_WIN_BU } from '../poco/math/config.js';

if (process.env.TUNE) { const t = JSON.parse(process.env.TUNE); const p = process.argv[3] || 'standard';
  for (const k of Object.keys(t)) PROFILES[p] = { ...PROFILES[p], [k]: { ...(PROFILES[p]?.[k] || {}), ...t[k] } }; }

const [mode = 'base', profile = 'standard', nArg = '2000000', seedArg = '1'] = process.argv.slice(2);
const P = params(profile), M = P.MODES[mode], strips = STRIPS[M.strips];
const cost = M.costPct / 100, pLoco = M.loco ? P.LOCO.num / P.LOCO.den : 0;
const CELL_OF = [[0, 1, 2], [3, 4, 5, 6], [7, 8, 9]];
const LC = LINES.map(rows => rows.map((row, r) => CELL_OF[r][row]));
const lineWin = sym => { let w = 0; for (const L of LC) { const s = L.map(c => sym[c]); if (s.includes('C')) continue;
  const t = s.find(x => x !== 'W') ?? 'W'; if (s.every(x => x === t || x === 'W')) w += PAYTABLE[t]; } return w; };

// ---- exact enumeration: lines, coins, trigger states ----
const [a, b, c] = strips; const N = a.length * b.length * c.length;
let lineSum = 0, locoSum = 0, locoN = 0;
const trig = [], trigLoco = []; // [cellsWithCoins] for >=3 coins
const sym = new Array(10);
for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) for (let k = 0; k < c.length; k++) {
  for (let r = 0; r < 3; r++) sym[r] = a[(i + r) % a.length];
  for (let r = 0; r < 4; r++) sym[3 + r] = b[(j + r) % b.length];
  for (let r = 0; r < 3; r++) sym[7 + r] = c[(k + r) % c.length];
  lineSum += lineWin(sym);
  const coins = []; sym.forEach((s, cc) => { if (s === 'C') coins.push(cc); });
  if (coins.length >= 3) trig.push(coins);
  if (pLoco && j === 0) { // Loco Spin: middle reel Wild (independent of reel 1's stop)
    const ls = sym.slice(); for (let r = 3; r < 7; r++) ls[r] = 'W';
    locoSum += lineWin(ls); locoN++;
    const lc = []; ls.forEach((s, cc) => { if (s === 'C') lc.push(cc); }); if (lc.length >= 3) trigLoco.push(lc);
  }
}
const locoMeanMult = (() => { let t = 0, s = 0; for (const [m, w] of P.LOCO.mult) { t += w; s += m * w; } return s / t; })();
const linesRTP = (1 - pLoco) * lineSum / N / 100;
const locoRTP = pLoco * locoSum / locoN / 100 * locoMeanMult;
const r3 = M.rescue3Num / FEATURE.rescue3.den;
const pTrig = st => st.reduce((acc, cs) => acc + (cs.length >= 4 ? 1 : r3), 0);
const trigRate = (1 - pLoco) * pTrig(trig) / N + (pLoco ? pLoco * pTrig(trigLoco) / locoN : 0);

// ---- bonus values: sample triggers exactly ----
const rng = new SeededRNG(+seedArg);
const pool = []; // weighted by trigger probability
for (const cs of trig) pool.push([cs, (cs.length >= 4 ? 1000 : M.rescue3Num) * (1 - pLoco) * locoN]);
if (pLoco) for (const cs of trigLoco) pool.push([cs, (cs.length >= 4 ? 1000 : M.rescue3Num) * pLoco * N]);
const poolW = pool.map(([, w]) => Math.round(w)); const poolTot = poolW.reduce((x, y) => x + y, 0);
const cum = []; poolW.reduce((acc, w, i) => (cum[i] = acc + w), 0);
const pickPool = () => { let x = Math.floor(rng.int(2 ** 30) / 2 ** 30 * poolTot); let lo = 0, hi = cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] > x) hi = mid; else lo = mid + 1; } return pool[lo][0]; };
const drawBase = () => { const p = pickWeighted(rng, COIN_TABLES.base); return typeof p === 'string' ? { v: JACKPOTS[p], jp: p } : { v: p, jp: null }; };
function sampleStart() {
  const cells = pickPool(); const m = new Map(cells.map(cc => [cc, drawBase()]));
  if (cells.length === 3) { const k = pickWeighted(rng, FEATURE.rescue3.add); const e = []; for (let x = 0; x < 10; x++) if (!m.has(x)) e.push(x);
    for (let q = 0; q < k; q++) m.set(e.splice(rng.int(e.length), 1)[0], drawBase()); }
  return m;
}
const n = +nArg;
const nearPool = pool.filter(([cs]) => cs.length === 3); const nearTot = nearPool.reduce((x, [, w]) => x + w, 0);
const pickNear = () => { let x = rng.int(2 ** 30) / 2 ** 30 * nearTot; for (const [cs, w] of nearPool) { x -= w; if (x <= 0) return cs; } return nearPool[0][0]; };
const sampleNear = () => new Map(pickNear().map(cc => [cc, drawBase()]));
const stat = isSuper => { let s = 0, s2 = 0, full = 0; const xs = new Float64Array(isSuper ? Math.ceil(n / 4) : n);
  for (let i = 0; i < xs.length; i++) { const f = isSuper ? playFeature(rng, sampleNear(), { P, super: true }) : playFeature(rng, sampleStart(), { P });
    const x = Math.min(f.total, MAX_WIN_BU) / 100; xs[i] = x; s += x; s2 += x * x; if (f.fullHouse.applied) full++; }
  xs.sort(); const mean = s / xs.length; return { mean, sd: Math.sqrt(s2 / xs.length - mean * mean), median: xs[xs.length >> 1], full: full / xs.length,
    over100: xs.filter(v => v >= 100).length / xs.length, se: Math.sqrt(s2 / xs.length - mean * mean) / Math.sqrt(xs.length), xs }; };
const std = stat(false), sup = stat(true);

// ---- instant Super (0.4.0), exact: near misses (exactly 3 coins, not rescued) per spin; each lights the next candle
// with chance p_k; the one that lights the last candle starts the Super. Expected near misses per Super = sum 1/p_k.
const pNear = ((1 - pLoco) * trig.filter(cs => cs.length === 3).length / N + (pLoco ? pLoco * trigLoco.filter(cs => cs.length === 3).length / locoN : 0)) * (1 - r3);
const nearPerSuper = P.METER.candles; // 0.4.1: every unrescued near miss is one step
const superRate = pNear / nearPerSuper;

const bonusRTP = trigRate * std.mean + superRate * sup.mean;
const rtp = (linesRTP + locoRTP + bonusRTP) / cost;
const se = Math.sqrt((trigRate * std.se) ** 2 + (superRate * sup.se) ** 2) / cost;
const pct = x => (100 * x).toFixed(3) + '%';
console.log(JSON.stringify({
  mode, profile, cost, RTP: pct(rtp), RTP_95CI: '±' + (196 * se).toFixed(3) + ' pts',
  lines: pct(linesRTP / cost), loco: pct(locoRTP / cost), stdBonus: pct(trigRate * std.mean / cost), superBonus: pct(superRate * sup.mean / cost),
  bonusEvery: +(1 / trigRate).toFixed(1), superEvery: +(1 / superRate).toFixed(0), nearMissEvery: +(1 / pNear).toFixed(1), nearMissesPerSuper: +nearPerSuper.toFixed(1),
  std: { avg: +std.mean.toFixed(2), median: +std.median.toFixed(1), sd: +std.sd.toFixed(1), over100: +(std.over100 * 100).toFixed(2) + '%', fullHouse: +(std.full * 100).toFixed(2) + '%' },
  super: { avg: +sup.mean.toFixed(1), median: +sup.median.toFixed(1), sd: +sup.sd.toFixed(0), over500: +(sup.xs.filter(v => v >= 500).length / sup.xs.length * 100).toFixed(2) + '%', fullHouse: +(sup.full * 100).toFixed(2) + '%' },
}, null, 1));
