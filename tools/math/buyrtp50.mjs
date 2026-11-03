// Buy and Super buy RTP for math 0.6.0 (all modes are complete rounds; sampled). Usage: node buyrtp50.mjs <buy|superbuy> [N] [seed]
import { playRound } from '../../math/engine.js'; import { SeededRNG } from '../../math/rng.js'; import { MODES, MAX_WIN_BU } from '../../math/config.js';
const [mode = 'superbuy', nA = '2000000', sA = '5'] = process.argv.slice(2); const N = +nA, rng = new SeededRNG(+sA), price = MODES[mode].costPct / 100;
let s = 0, s2 = 0; const xs = new Float64Array(N);
for (let i = 0; i < N; i++) { const v = Math.min(playRound(rng, mode).totalWin, MAX_WIN_BU) / 100; xs[i] = v; s += v; s2 += v * v; }
const m = s / N, sd = Math.sqrt(s2 / N - m * m); const q = [...xs].sort((a, b) => a - b);
console.log(JSON.stringify({ mode, price, avg: +m.toFixed(2), RTP: (m / price * 100).toFixed(3) + '%', ci95: '±' + (196 * sd / Math.sqrt(N) / price).toFixed(3), median: q[N >> 1],
  underHalfPrice: (100 * xs.filter(v => v < price / 2).length / N).toFixed(1) + '%', over1000: '1 in ' + (N / xs.filter(v => v >= 1000).length).toFixed(0), maxWin: '1 in ' + (N / Math.max(1, xs.filter(v => v >= 5000).length)).toFixed(0) }));
