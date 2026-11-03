// Extra UGDI comparisons not in ugdi_scorecard.mjs (30 Oct): Mystery stack sizes, coins on screen (by count and by
// distance from the trigger), jackpot coins per Hold & Win round (natural / bought), return split by feature, the
// "second feature" (UGDI Pick vs Poco Super), and the bought-bonus curve at the points UGDI gives.
import { playRound } from '../../math/engine.js';
import { SeededRNG } from '../../math/rng.js';
const N = +(process.argv[2] || 2e6), NB = +(process.argv[3] || 2e5), rng = new SeededRNG(91);
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
let paid = 0, lines = 0, loco = 0, std = 0, sup = 0, nStd = 0, nSup = 0, nQ = 0;
const qSize = {}, coins = new Array(11).fill(0), jpRound = { MINI: 0, MINOR: 0, MAJOR: 0, GRAND: 0, any: 0 }, supW = [];
for (let i = 0; i < N; i++) {
  const r = playRound(rng, 'base'); paid += 100; const B = r.base;
  if (B.loco) loco += B.lineWin; else lines += B.lineWin;
  if (B.mystery && !B.loco) { nQ++; const k = B.mystery.cells.length; qSize[k] = (qSize[k] || 0) + 1; }
  coins[B.coins.length - (B.rescue?.added?.length || 0)]++;
  if (r.feature) { const F = r.feature; if (F.super) { nSup++; sup += F.total; supW.push(F.total); } else { nStd++; std += F.total; }
    const jps = new Set(F.collect.filter(c => c.jp).map(c => c.jp)); if (jps.size) jpRound.any++; for (const j of jps) jpRound[j]++; }
}
const pc = x => (100 * x).toFixed(1);
const nF = nStd + nSup;
console.log('RETURN SPLIT (% of stake): lines', pc(lines / paid), '| Loco', pc(loco / paid), '| standard H&W', pc(std / paid), '| Super', pc(sup / paid));
console.log('SECOND FEATURE: Super 1 in', (N / nSup).toFixed(0), 'spins, mean', (sup / nSup / 100).toFixed(1) + 'x, median', (supW.sort((a, b) => a - b)[supW.length >> 1] / 100).toFixed(0) + 'x');
const qs = Object.entries(qSize).sort((a, b) => a[0] - b[0]);
const grp = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7+': 0 }; for (const [k, v] of qs) grp[+k >= 7 ? '7+' : k] += v;
console.log('MYSTERY STACK SIZES (share of reveals):', Object.entries(grp).map(([k, v]) => `${k}: ${pc(v / nQ)}%`).join('  '));
console.log('COINS ON SCREEN (% of spins, before Coin Save):', coins.slice(0, 6).map((v, k) => `${k}: ${pc(v / N)}`).join('  '), ' 4+:', pc(coins.slice(4).reduce((a, b) => a + b, 0) / N));
console.log('NATURAL H&W ROUNDS ENDING WITH A JACKPOT COIN:', Object.entries(jpRound).map(([k, v]) => `${k} ${pc(v / nF)}%`).join('  '));
// bought bonus
const bj = { MINI: 0, MINOR: 0, MAJOR: 0, GRAND: 0, any: 0 }, bw = [];
for (let i = 0; i < NB; i++) { const r = playRound(rng, 'buy'); const F = r.feature; bw.push(r.totalWin / 100);
  const jps = new Set(F.collect.filter(c => c.jp).map(c => c.jp)); if (jps.size) bj.any++; for (const j of jps) bj[j]++; }
bw.sort((a, b) => a - b);
console.log('BOUGHT ROUNDS ENDING WITH A JACKPOT COIN:', Object.entries(bj).map(([k, v]) => `${k} ${pc(v / NB)}%`).join('  '));
console.log('BUY CURVE (x bet): p5', q(bw, .05), 'p10', q(bw, .1), 'p25', q(bw, .25), 'p50', q(bw, .5), 'p75', q(bw, .75), 'p90', q(bw, .9), 'p99', q(bw, .99), 'max', bw[bw.length - 1]);
