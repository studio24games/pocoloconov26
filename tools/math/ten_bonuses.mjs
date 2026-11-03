// Compare what 10 natural bonuses feel like to a fresh player, old maths (carries the candle meter) vs new.
// Usage: node tools/math/ten_bonuses.mjs <path-to-math-dir> [players=20000] [seed=1]
import { pathToFileURL } from 'node:url';
const dir = process.argv[2], NP = +(process.argv[3] || 20000), seed = +(process.argv[4] || 1);
const E = await import(pathToFileURL(`${dir}/engine.js`).href);
const { SeededRNG } = await import(pathToFileURL(`${dir}/rng.js`).href);
const rng = new SeededRNG(seed);
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const std = [], sup = [], tot = [], nSup = [], best = [], under20 = [], over100 = [], spins = [], noSup = [];
for (let pl = 0; pl < NP; pl++) {
  let meter = E.newMeter ? E.newMeter() : undefined, n = 0, s = 0, t = 0, ns = 0, b = 0, u = 0, o = 0;
  while (n < 10) {
    const r = E.playRound(rng, 'base', { meter });
    if (r.meter) meter = r.meter.after;
    s++;
    if (!r.feature) continue;
    const x = r.feature.total / 100;
    n++; t += x; if (x > b) b = x; if (x < 20) u++; if (x >= 100) o++;
    if (r.feature.super) { ns++; sup.push(x); } else std.push(x);
  }
  tot.push(t); nSup.push(ns); best.push(b); under20.push(u); over100.push(o); spins.push(s);
}
for (const a of [std, sup, tot, best, spins]) a.sort((x, y) => x - y);
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const dist = a => { const c = {}; for (const v of a) c[v] = (c[v] || 0) + 1; return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, +(100 * v / a.length).toFixed(1)])); };
console.log(JSON.stringify({
  standard: { share: +(100 * std.length / (std.length + sup.length)).toFixed(1), mean: +mean(std).toFixed(1), median: q(std, 0.5), p10: q(std, 0.1), p90: q(std, 0.9) },
  super: { share: +(100 * sup.length / (std.length + sup.length)).toFixed(1), mean: +mean(sup).toFixed(1), median: q(sup, 0.5), p10: q(sup, 0.1), p90: q(sup, 0.9) },
  tenBonuses: { totalMean: +mean(tot).toFixed(0), totalMedian: +q(tot, 0.5).toFixed(0), totalP10: +q(tot, 0.1).toFixed(0), totalP90: +q(tot, 0.9).toFixed(0),
    supersIn10: dist(nSup), noSuperPct: +(100 * nSup.filter(v => v === 0).length / NP).toFixed(1),
    bestMedian: q(best, 0.5), bestP10: q(best, 0.1), bestP90: q(best, 0.9),
    under20Mean: +mean(under20).toFixed(2), over100Mean: +mean(over100).toFixed(2),
    spinsMedian: q(spins, 0.5), spinsP10: q(spins, 0.1), spinsP90: q(spins, 0.9) },
}, null, 1));
