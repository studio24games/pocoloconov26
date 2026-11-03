// v0.64 'shape=steady' fit: the standard bonus and the Buy take the Super's steadier spread (relative to its average),
// scaled to their OWN current average, so the RTP is unchanged; only the spread changes (fewer small results, fewer
// very big ones). Super and Super buy are unchanged.
// Usage: node tools/math/fit_steady63.mjs [samples=150000] [seed=3]  -> SHAPES for PROFILES.steady
import { playFeature, shapedDraw, params } from '../../math/engine.js';
import { SeededRNG, pickWeighted } from '../../math/rng.js';
import { COIN_TABLES, JACKPOTS, CELL_COUNT } from '../../math/config.js';

const K = +(process.argv[2] || 150000), rng = new SeededRNG(+(process.argv[3] || 3));
const P = params('standard');
const coin = () => { const v = pickWeighted(rng, COIN_TABLES.base); return typeof v === 'string' ? { v: JACKPOTS[v], jp: v } : { v, jp: null }; };
const start = counts => { const n = pickWeighted(rng, counts), m = new Map(), cells = [...Array(CELL_COUNT).keys()];
  for (let i = 0; i < n; i++) m.set(cells.splice(rng.int(cells.length), 1)[0], coin()); return m; };
const NAT = [[4, 88], [5, 11], [6, 1]];
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

// the Super's kept results, as multiples of its average
const sup = []; for (let i = 0; i < K; i++) sup.push(shapedDraw(rng, P.SHAPES.super, () => playFeature(rng, start(NAT), { P, super: true }), f => f.total).out.total);
const ms = mean(sup), rel = sup.map(v => v / ms);

function fit(name, shapeNow, play, edges) {
  const now = []; for (let i = 0; i < K; i++) now.push(shapedDraw(rng, shapeNow, play, f => f.total).out.total);
  const m = mean(now) * +(process.env.SCALE || 1);
  const target = new Array(edges.length).fill(0);
  const band = v => { let b = 0; while (b + 1 < edges.length && v >= edges[b + 1]) b++; return b; };
  for (const r of rel) target[band(r * m)]++;
  const nat = new Array(edges.length).fill(0), sum = new Array(edges.length).fill(0);
  for (let i = 0; i < K; i++) { const t = Math.min(play().total, 500000); nat[band(t)]++; sum[band(t)] += t; }
  const raw = target.map((t, b) => (t && nat[b] ? (t / K) / (nat[b] / K) : 0)); const mx = Math.max(...raw);
  const w = raw.map(x => Math.round(100000 * x / mx));
  const lost = target.reduce((a, t, b) => a + (t && !nat[b] ? t : 0), 0);
  const keptMean = target.reduce((a, t, b) => a + (w[b] ? t * sum[b] / nat[b] : 0), 0) / (K - lost) / 100;
  console.log(`  ${name}: { edges: [${edges.join(', ')}],\n    w: [${w.join(', ')}] },   // steady: mean ${keptMean.toFixed(1)}x (now ${(m / 100).toFixed(1)}x)${lost ? `, ${(100 * lost / K).toFixed(2)}% of target unreachable` : ''}`);
}
const E = [0, 1500, 2500, 3500, 4500, 5500, 6500, 7500, 8500, 10000, 12000, 15000, 20000, 30000, 50000, 100000, 200000];
fit('standard', P.SHAPES.standard, () => playFeature(rng, start(NAT), { P }), E);
fit('buy', P.SHAPES.buy, () => playFeature(rng, start(P.MODES.buy.startCoins), { P, buy: true }),
  [0, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11500, 13000, 15000, 20000, 30000, 50000, 100000, 200000]);
console.log(`// Super: mean ${(ms / 100).toFixed(1)}x; 1 in 10 under ${(0.1 * 0 + rel.sort((a, b) => a - b)[Math.floor(0.1 * K)]).toFixed(2)} of the mean`);
