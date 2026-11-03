// v0.66c (30 Oct): curtains on every reel. The v0.66 reel search put both curtain symbols on one reel (reel 3 in base, reel 1
// in Double Chance), so curtains only ever showed there. This rebuilds each reel set with ONE curtain per reel:
//   - each strip is doubled (every stop appears twice, so every line-win and coin statistic is exactly unchanged) and
//     its old curtain cells become low symbols;
//   - one curtain goes on each reel, at a position chosen by exact evaluation against the version's targets
//     (reelopt63 loss), never next to a coin (a full-reel curtain over mostly coins would read as nothing);
//   - per reel the curtain then shows on 3/118 (reels 1 and 3) or 4/124+ (reel 2) of stops: any curtain on about 1 spin
//     in 12, two reels at once about 1 spin in 400.
// Usage: node tools/math/spread_curtains66.mjs <set> <TSET> <out.json> [candidates=10] [passes=2]
import fs from 'node:fs';
import { evaluate, loss } from './reelopt63.mjs';
import { STRIPS } from '../../math/strips.generated.js';
import { params } from '../../math/engine.js';
import { SeededRNG } from '../../math/rng.js';

const [set, tset, out, K = 10, PASSES = 2] = process.argv.slice(2);
const I = { W: 0, H1: 1, H2: 2, M1: 3, L1: 4, L2: 5, L3: 6, C: 7, Q: 8 }, NAMES = Object.keys(I);
const prof = set.includes('Lean') ? 'lean' : 'standard';
const P = params(prof), pays = ['W', 'H1', 'H2', 'M1', 'L1', 'L2', 'L3'].map(k => P.PAYTABLE[k]).concat(0, 0);
const T = (await import('./reelopt63.mjs')).TARGETS?.[tset];
const rng = new SeededRNG(7);
const ROWS = [3, 4, 3];
// doubled strips, curtains removed (a curtain cell becomes the low symbol that appears least on that reel)
const strips = STRIPS[set].map(s => {
  const counts = { L1: 0, L2: 0, L3: 0 }; for (const x of s) if (x in counts) counts[x]++;
  const low = Object.entries(counts).sort((a, b) => a[1] - b[1])[0][0];
  const clean = s.map(x => (x === 'Q' ? low : x));
  return Int8Array.from([...clean, ...clean].map(x => I[x]));
});
// candidate positions: not a coin / wild, and no coin within the reel's window either side
const okPos = (st, r) => [...st.keys()].filter(i => { if (st[i] === I.C || st[i] === I.W) return false;
  for (let d = -(ROWS[r] - 1); d <= ROWS[r] - 1; d++) if (st[(i + d + st.length) % st.length] === I.C) return false; return true; });
const cand = strips.map((st, r) => okPos(st, r));
let pos = cand.map(c => c[rng.int(c.length)]);
const score = p => { const s2 = strips.map((st, r) => { const c = Int8Array.from(st); c[p[r]] = I.Q; return c; });
  const res = evaluate(s2, pays); return { res, L: loss(res, T) }; };
let best = score(pos);
for (let pass = 0; pass < +PASSES; pass++) for (let r = 0; r < 3; r++) for (let k = 0; k < +K; k++) {
  const p2 = pos.slice(); p2[r] = cand[r][rng.int(cand[r].length)];
  const s = score(p2); if (s.L < best.L) { best = s; pos = p2; }
}
const final = strips.map((st, r) => { const c = [...st].map(x => NAMES[x]); c[pos[r]] = 'Q'; return c; });
fs.writeFileSync(out, JSON.stringify({ set, pays: Object.fromEntries(['W', 'H1', 'H2', 'M1', 'L1', 'L2', 'L3'].map((k, i) => [k, pays[i]])), strips: final, positions: pos }));
const pct = Object.fromEntries(Object.entries(best.res).map(([k, v]) => [k, +(100 * v).toFixed(2)]));
console.log(JSON.stringify({ set, prof, positions: pos, lengths: final.map(s => s.length), L: +best.L.toFixed(3), pct }));
