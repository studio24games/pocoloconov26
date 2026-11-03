// Buy feel as % of the price paid: one buy and a run of 10 buys (old vs new maths).
// Usage: node tools/math/buy_feel.mjs <math-dir> [buys=200000] [seed=1]
import { pathToFileURL } from 'node:url';
const dir = process.argv[2], N = +(process.argv[3] || 200000), seed = +(process.argv[4] || 1);
const E = await import(pathToFileURL(`${dir}/engine.js`).href);
const C = await import(pathToFileURL(`${dir}/config.js`).href);
const { SeededRNG } = await import(pathToFileURL(`${dir}/rng.js`).href);
const rng = new SeededRNG(seed);
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const pct = v => Math.round(100 * (v - 1));   // net result as % of the price (+ profit / - loss)
const lv = a => ({ worst10: pct(q(a, 0.1)), p25: pct(q(a, 0.25)), median: pct(q(a, 0.5)), p75: pct(q(a, 0.75)), best10: pct(q(a, 0.9)),
  best100: pct(q(a, 0.99)), inProfit: +(100 * a.filter(v => v > 1).length / a.length).toFixed(1), avg: pct(a.reduce((x, y) => x + y, 0) / a.length) });
const out = {};
for (const mode of ['buy', 'superbuy']) {
  const price = C.MODES[mode].costPct, one = [];
  for (let i = 0; i < N; i++) one.push(E.playRound(rng, mode).totalWin / price);
  const ten = [];
  for (let i = 0; i + 10 <= one.length; i += 10) { let s = 0; for (let k = 0; k < 10; k++) s += one[i + k]; ten.push(s / 10); }
  out[mode] = { priceX: price / 100, avgWinX: +(one.reduce((x, y) => x + y, 0) / N * price / 100).toFixed(1),
    one: lv([...one].sort((a, b) => a - b)), ten: lv(ten.sort((a, b) => a - b)) };
}
console.log(JSON.stringify(out));
