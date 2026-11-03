// v0.63 / math 0.8.0 Loco Spin shape (item 5: UGDI's wild reel). Plays Loco Spins with natural odds on a mode's reels,
// then sets SHAPES.loco_<mode> band weights so kept results follow UGDI's wild-reel rounds: never a blank (UGDI gives a
// free Second Chance respin instead), typical about 2.2x, average about 3.6x, 1 in 10 over about 7.6x, at most 40x.
// Usage: node tools/math/fitloco63.mjs <base|double> [samples=300000] [seed=3] [profile]
import { baseSpin, params } from '../../math/engine.js';
import { SeededRNG } from '../../math/rng.js';

const mode = process.argv[2] || 'base', K = +(process.argv[3] || 300000), rng = new SeededRNG(+(process.argv[4] || 3));
const PROFILE = process.argv[5] || 'standard';
const P = params(PROFILE), M = P.MODES[mode], L = P.LOCO;   // reels, Mystery and paytable of the version
// v0.66 (30 Oct): rarer and bigger - never under 4x, typical about 6.5x, average about 9.7x, at most 50x (LOCO 1 in 90)
// bands (x bet):  <4   4-5   5-6   6-8   8-10  10-15 15-20 20-30 30-50 >50
const E = [0, 400, 500, 600, 800, 1000, 1500, 2000, 3000, 5001];
const T = [0, 0.22, 0.18, 0.20, 0.13, 0.12, 0.07, 0.05, 0.03, 0];
const band = v => { let b = 0; while (b + 1 < E.length && v >= E[b + 1]) b++; return b; };
const cnt = new Array(E.length).fill(0), sum = new Array(E.length).fill(0);
for (let i = 0; i < K; i++) { const w = baseSpin(rng, M, L, true, P.MYSTERY, P.PAYTABLE).lines.total; const b = band(w); cnt[b]++; sum[b] += w; }
const nat = cnt.map(c => c / K);
const raw = T.map((t, b) => (t > 0 && nat[b] > 0 ? t / nat[b] : 0)); const mx = Math.max(...raw);
const w = raw.map(x => Math.round(100000 * x / mx));
const kept = T.map((t, b) => (w[b] ? t : 0)), tot = kept.reduce((a, b) => a + b, 0);
const mean = kept.reduce((a, t, b) => a + t * (cnt[b] ? sum[b] / cnt[b] : 0), 0) / tot / 100;
const accept = nat.reduce((a, p, b) => a + p * w[b] / 100000, 0);
console.log(`  loco${mode === 'base' ? '' : '_' + mode}: { edges: [${E.join(', ')}],\n    w: [${w.join(', ')}] },   // mean ${mean.toFixed(2)}x, about ${(1 / accept).toFixed(1)} plays per kept result`);
console.log('// natural shares %:', nat.map(x => +(100 * x).toFixed(2)).join(' '), `| natural mean ${(sum.reduce((a, b) => a + b, 0) / K / 100).toFixed(2)}x`);
