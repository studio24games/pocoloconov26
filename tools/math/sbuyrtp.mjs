import { playRound } from '../poco/math/engine.js'; import { SeededRNG } from '../poco/math/rng.js'; import { MAX_WIN_BU } from '../poco/math/config.js';
const rng = new SeededRNG(31), N = 600000; let s = 0, s2 = 0; const x = new Float64Array(N);
for (let i = 0; i < N; i++) { const v = Math.min(playRound(rng, 'superbuy').totalWin, MAX_WIN_BU) / 100; x[i] = v; s += v; s2 += v * v; }
const m = s / N, sd = Math.sqrt(s2 / N - m * m), q = [...x].sort((a, b) => a - b);
console.log(JSON.stringify({ avg: +m.toFixed(2), rtp: (m / 205 * 100).toFixed(2) + '% ±' + (196 * sd / Math.sqrt(N) / 205).toFixed(2), median: q[N >> 1], beatPrice: (100 * x.filter(v => v >= 205).length / N).toFixed(1) + '%', over500: (100 * x.filter(v => v >= 500).length / N).toFixed(1) + '%', over1000: (100 * x.filter(v => v >= 1000).length / N).toFixed(2) + '%' }));
