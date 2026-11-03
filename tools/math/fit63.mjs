// v0.63 / math 0.8.0 shape fit (29 Oct): items 1, 4 and 6 of docs/UGDI_COMPARISON_2026-10-29.md.
// Plays bonuses with natural odds (no shape), then sets SHAPES band weights so the KEPT results follow UGDI:
//   - natural Hold & Win, standard and Super together (the Super is SUPER.upgrade of them and carries the top of the
//     range): UGDI natural rounds - 1 in 10 under 9x, median 68x, 1 in 10 over 117x, 1 in 100 over about 253x
//   - bought bonus: UGDI's bought rounds in x bet - 1 in 10 under 19x, median 65x, 1 in 10 over 145x, 1 in 100 over
//     231x (average about 77.5x); the price is then the average / target RTP
//   - Super buy: the Super's own shape; price = average / target RTP
// Usage: node tools/math/fit63.mjs [samples=200000] [seed=5]  -> prints the SHAPES block + prices for config.js
import { playFeature, params } from '../../math/engine.js';
import { SeededRNG } from '../../math/rng.js';
import { COIN_TABLES, JACKPOTS, CELL_COUNT, SUPER } from '../../math/config.js';
import { pickWeighted } from '../../math/rng.js';

const K = +(process.argv[2] || 200000);
const rng = new SeededRNG(+(process.argv[3] || 5));
const P = params('standard');
const RTP = 0.967;

// natural trigger starts: 4 coins mostly (Poco's 4-coin trigger), sometimes 5-6; values from the base (trigger) table
const startOf = counts => {
  const n = pickWeighted(rng, counts), m = new Map(), cells = [...Array(CELL_COUNT).keys()];
  for (let i = 0; i < n; i++) { const c = cells.splice(rng.int(cells.length), 1)[0];
    const v = pickWeighted(rng, COIN_TABLES.base); m.set(c, typeof v === 'string' ? { v: JACKPOTS[v], jp: v } : { v, jp: null }); }
  return m;
};
const NAT = [[4, 88], [5, 11], [6, 1]];

// bands in BU (x100); targets are shares of the band (sum 1)
const E = [0, 1000, 2000, 3000, 4500, 6000, 7500, 9000, 10500, 12000, 15000, 20000, 25000, 35000, 50000, 100000, 200000];
// UGDI natural rounds (combined standard + Super): mean about 73x
// v0.63 pass 2: the top trimmed (1 in 100 over about 255x; was 316x measured), the saving moved into 150-200x
// pass 3 (RTP): 1.5% of results moved from under 10x to 75-90x
const NATURAL = [0.085, 0.06, 0.06, 0.09, 0.11, 0.14, 0.155, 0.11, 0.095, 0.045, 0.0284, 0.013, 0.005, 0.0022, 0.001, 0.0003, 0.0001];
// the Super's share of each band (it is the top of the range; standard rounds keep some big results too)
const SUPER_SHARE = [0, 0, 0, 0, 0, 0, 0, 0.10, 0.30, 0.65, 0.80, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85];
// UGDI bought rounds, x bet
const EB = [0, 1000, 1900, 3000, 4000, 5200, 6500, 8000, 10000, 12000, 14500, 16000, 20000, 25000, 35000, 50000, 100000];
const BOUGHT = [0.04, 0.06, 0.08, 0.12, 0.10, 0.10, 0.09, 0.11, 0.10, 0.10, 0.022, 0.048, 0.021, 0.006, 0.0022, 0.0006, 0.0002];

const band = (edges, v) => { let b = 0; while (b + 1 < edges.length && v >= edges[b + 1]) b++; return b; };
const mid = (edges, b, tail) => (b + 1 < edges.length ? (edges[b] + edges[b + 1]) / 2 : tail);

function natural(edges, play, n = K) {
  const cnt = new Array(edges.length).fill(0), sum = new Array(edges.length).fill(0);
  for (let i = 0; i < n; i++) { const t = Math.min(play().total, 500000); const b = band(edges, t); cnt[b]++; sum[b] += t; }
  return { p: cnt.map(c => c / n), avg: sum.map((s, b) => (cnt[b] ? s / cnt[b] : mid(edges, b, edges[b] * 1.5))) };
}
function weights(target, nat, name) {
  const raw = target.map((t, b) => {
    if (t <= 0) return 0;
    if (nat.p[b] <= 0) { console.error(`! ${name}: band ${b} has no natural results; its target ${t} is lost`); return 0; }
    return t / nat.p[b];
  });
  const mx = Math.max(...raw);
  const w = raw.map(x => Math.round(100000 * x / mx));
  const kept = target.map((t, b) => (w[b] > 0 ? t : 0)), tot = kept.reduce((a, b) => a + b, 0);
  const mean = kept.reduce((a, t, b) => a + t * nat.avg[b], 0) / tot / 100;
  const accept = nat.p.reduce((a, p, b) => a + p * w[b] / 100000, 0);
  return { w, mean, draws: 1 / accept };
}

const q = SUPER.upgrade.num / SUPER.upgrade.den;
const superT = NATURAL.map((t, b) => t * SUPER_SHARE[b]); const sT = superT.reduce((a, b) => a + b, 0);
const stdT = NATURAL.map((t, b) => t * (1 - SUPER_SHARE[b]));  const dT = stdT.reduce((a, b) => a + b, 0);
console.error(`Super share of natural bonuses implied by the target: ${(100 * sT).toFixed(1)}% (SUPER.upgrade ${(100 * q).toFixed(1)}%)`);

const natStd = natural(E, () => playFeature(rng, startOf(NAT), { P }));
const natSup = natural(E, () => playFeature(rng, startOf(NAT), { P, super: true }));
const natBuy = natural(EB, () => playFeature(rng, startOf(P.MODES.buy.startCoins), { P, buy: true }));
const natSB = natural(E, () => playFeature(rng, startOf(P.MODES.superbuy.startCoins), { P, super: true, superBuy: true }));

const std = weights(stdT.map(t => t / dT), natStd, 'standard');
const sup = weights(superT.map(t => t / sT), natSup, 'super');
const buy = weights(BOUGHT, natBuy, 'buy');
const sb = weights(superT.map(t => t / sT), natSB, 'superbuy');
const combinedMean = (1 - sT) * std.mean + sT * sup.mean;

const fmt = (name, edges, r) => `  ${name}: { edges: [${edges.join(', ')}],\n    w: [${r.w.join(', ')}] },   // mean ${r.mean.toFixed(1)}x, about ${r.draws.toFixed(1)} plays per kept result`;
console.log(fmt('standard', E, std));
console.log(fmt('super', E, sup));
console.log(fmt('buy', EB, buy));
console.log(fmt('superbuy', E, sb));
console.log(`// natural bonus mean (standard + Super): ${combinedMean.toFixed(1)}x; Super ${(100 * sT).toFixed(1)}% of bonuses`);
console.log(`// buy price at ${RTP * 100}% RTP: ${(buy.mean / RTP).toFixed(1)}x; Super buy price: ${(sb.mean / RTP).toFixed(1)}x`);
console.log('// natural shares (std / super / buy / superbuy):', JSON.stringify([natStd.p, natSup.p, natBuy.p, natSB.p].map(a => a.map(x => +(100 * x).toFixed(2)))));
