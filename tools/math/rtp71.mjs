// v0.71: engine-faithful RTP of one profile (every option, including the curtain and Bandido options par63 can't see).
//  base / double: N whole base rounds through playRound (lines, curtains, Loco Spins, Coin Save, trigger odds; bonuses
//  not played), then the bonus means from B shaped bonuses started from the coins those rounds actually triggered with.
//  buy / superbuy: B rounds each. Usage: node rtp71.mjs <profile> [N=1000000] [B=150000] [modes=base,double,buy,superbuy] [seed=11]
import { playRound, playFeature, shapedDraw, params, featureRule } from '../../math/engine.js';
import { SeededRNG } from '../../math/rng.js';
if (process.env.BAL) globalThis.__POCO_BAL = process.env.BAL === 'none' ? null : JSON.parse(process.env.BAL);   // force the balance tilt
const [PROF = 'standard', N0 = 1e6, B0 = 150000, MODES = 'base,double,buy,superbuy', SEED = 11] = process.argv.slice(2);
const N = +N0, B = +B0, rng = new SeededRNG(+SEED), P = params(PROF), CAP = 500000;
const stat = () => ({ s: 0, s2: 0, n: 0, add(x) { this.s += x; this.s2 += x * x; this.n++; }, get m() { return this.s / this.n; }, get se() { return Math.sqrt(Math.max(0, this.s2 / this.n - this.m ** 2) / this.n); } });
const out = { profile: PROF };
for (const mode of MODES.split(',')) {
  const M = P.MODES[mode], cost = M.costPct;
  if (mode === 'buy' || mode === 'superbuy') { const w = stat(); for (let i = 0; i < B; i++) w.add(playRound(rng, mode, { profile: PROF }).totalWin);
    out[mode] = { rtp: +(100 * w.m / cost).toFixed(2), se: +(100 * w.se / cost).toFixed(2), meanX: +(w.m / 100).toFixed(1) }; continue; }
  let base = 0, nStd = 0, nSup = 0; const starts = { standard: [], super: [] }, KEEP = 6000;
  for (let i = 0; i < N; i++) { const r = playRound(rng, mode, { profile: PROF, noFeature: true }); base += r.totalWin;
    if (r.trig) { const arr = starts[r.trig], k = r.trig === 'super' ? ++nSup : ++nStd; if (arr.length < KEEP) arr.push(r.start); else { const j = rng.int(k); if (j < KEEP) arr[j] = r.start; } } }
  const bonus = kind => { const st = stat(), sh = P.SHAPES[`${kind}_${mode}`] ?? P.SHAPES[kind], rule = featureRule(P, mode), arr = starts[kind], n = kind === 'super' ? Math.round(B / 4) : B;
    if (!arr.length) return st; for (let i = 0; i < n; i++) { const s0 = arr[rng.int(arr.length)];
      st.add(Math.min(CAP, shapedDraw(rng, sh, () => playFeature(rng, new Map(s0), { P, super: kind === 'super' }), f => f.total, rule).out.total)); } return st; };
  const std = bonus('standard'), sup = bonus('super');
  const pS = nStd / N, pU = nSup / N, lines = base / N;
  const rtp = (lines + pS * (std.m || 0) + pU * (sup.m || 0)) / cost * 100, se = Math.sqrt((pS * std.se) ** 2 + (pU * (sup.se || 0)) ** 2) / cost * 100;
  out[mode] = { rtp: +rtp.toFixed(2), se: +se.toFixed(2), base: +(lines / cost * 100).toFixed(2), bonus: +((pS * std.m + pU * (sup.m || 0)) / cost * 100).toFixed(2),
    bonusEvery: +(N / (nStd + nSup)).toFixed(1), stdX: +(std.m / 100).toFixed(1), superX: +((sup.m || 0) / 100).toFixed(1) };
}
console.log(JSON.stringify(out));
