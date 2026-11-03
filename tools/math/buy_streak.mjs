// Chance of a run of k buys in a row each returning at most t of the price, within n buys (exact, from the measured
// single-buy probability p; buys are independent). Usage: node tools/math/buy_streak.mjs [buys=1000000] [profile]
import { playRound, params } from '../../math/engine.js';
import { SeededRNG } from '../../math/rng.js';
const N = +(process.argv[2] || 1e6), PROFILE = process.argv[3] || 'standard', rng = new SeededRNG(77);
const price = params(PROFILE).MODES.buy.costPct;
const r = new Float64Array(N); for (let i = 0; i < N; i++) r[i] = playRound(rng, 'buy', { profile: PROFILE }).totalWin / price;
const sorted = Float64Array.from(r).sort();
const P = t => { let lo = 0, hi = N; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= t) lo = m + 1; else hi = m; } return lo / N; };
// P(at least one run of >= k successes in n trials), success prob p: DP over current run length
const runProb = (p, k, n) => { let s = new Float64Array(k); s[0] = 1; let hit = 0;
  for (let i = 0; i < n; i++) { const t = new Float64Array(k); for (let j = 0; j < k; j++) { t[0] += s[j] * (1 - p); if (j + 1 === k) hit += s[j] * p; else t[j + 1] += s[j] * p; } s = t; } return hit; };
console.log(`profile ${PROFILE}, price ${price / 100}x, ${N} buys`);
console.log('share of price | P(one buy at or under) | P(5 in a row somewhere in 50 / 75 / 100 buys)');
for (const t of [0.2, 0.25, 0.3, 0.35, 0.4, 0.5]) { const p = P(t);
  console.log(`  <= ${String(Math.round(t * 100)).padStart(2)}% (${(t * price / 100).toFixed(0).padStart(2)}x)  | ${(100 * p).toFixed(1).padStart(5)}%  | ${[50, 75, 100].map(n => (100 * runProb(p, 5, n)).toFixed(2) + '%').join(' / ')}`); }
// empirical check of the run maths on the simulated sequence itself (independent buys -> should agree)
let runs = 0, cur = 0; for (let i = 0; i < N; i++) { if (r[i] <= 0.3) { if (++cur === 5) runs++; } else cur = 0; }
console.log(`in the simulated sequence: ${runs} runs of 5+ at <=30% in ${N} buys (1 per ${(N / runs).toFixed(0)} buys)`);
