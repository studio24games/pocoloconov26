// v0.71: fit the curtain options so the base game's line wins (where all curtain value lives) keep the same RTP as the
// default set (replicating the round's curtain thinning). Usage: node fit_curtains71.mjs [spins] [mode]
import { baseSpin, params, curtainThin } from '../../math/engine.js';
import { SeededRNG } from '../../math/rng.js';
const N = +(process.argv[2] || 300000), MODE = process.argv[3] || 'base', BASE = 'lean+steady+dbl22+bigFH';
function measure(prof, over = {}, seed = 7) {
  const P0 = params(prof), MY = { ...P0.MYSTERY, ...over }, M = P0.MODES[MODE], rng = new SeededRNG(seed);
  let tot = 0, q = 0, q2 = 0, qp = 0, small = 0;
  for (let i = 0; i < N; i++) { let sp = baseSpin(rng, M, P0.LOCO, false, MY, P0.PAYTABLE);
    for (let g = 0; g < 6 && curtainThin(MY) && sp.mystery && !sp.mystery.small && rng.int(1000) < curtainThin(MY); g++) sp = baseSpin(rng, M, P0.LOCO, false, MY, P0.PAYTABLE);
    tot += sp.lines.total; if (sp.mystery) { if (sp.mystery.small) small++; else { q++; if (new Set(sp.mystery.cells.map(c => (c < 3 ? 0 : c < 7 ? 1 : 2))).size > 1) q2++; if (sp.lines.total > 0) qp++; } } }
  return { lines: tot / N, curtain1in: N / q, two1in: q2 ? N / q2 : Infinity, payShare: qp / q, small1in: small ? N / small : Infinity };
}
const fmt = r => `lines ${r.lines.toFixed(2)} | curtains 1 in ${r.curtain1in.toFixed(1)} | two-reel 1 in ${r.two1in.toFixed(0)} | pay ${(100 * r.payShare).toFixed(0)}% | small 1 in ${r.small1in.toFixed(1)}`;
const ref = measure(BASE); console.log(`${MODE} ref: ${fmt(ref)}`);
// bisect one parameter so lines == ref.lines; up = true when raising the parameter raises the lines
function fit(opt, key, lo, hi, up) { let r;
  for (let it = 0; it < 8 && hi - lo > 2; it++) { const mid = Math.round((lo + hi) / 2); r = measure(`${BASE}+${opt}`, { [key]: mid });
    if ((r.lines > ref.lines) === up) hi = mid; else lo = mid; }
  const v = Math.round((lo + hi) / 2); r = measure(`${BASE}+${opt}`, { [key]: v }); console.log(`${opt} ${key}=${v}: ${fmt(r)}`); return v; }
const only = process.argv[4];
if (!only || only === 'cvMix') fit('cvMix', 'thinMix', 0, 600, false);
if (!only || only === 'cvGD') fit('cvGD', 'extraMix', 0, 160, true);
if (!only || only === 'crRare') fit('crRare', 'thin', 0, 950, false);
if (!only || only === 'crSmall') { for (const num of [300, 450, 600]) { const r = measure(`${BASE}+crSmall`, { small: { ...params(`${BASE}+crSmall`).MYSTERY.small, num }, thin: 0 }); console.log(`crSmall num=${num} thin=0: ${fmt(r)}`); } }
