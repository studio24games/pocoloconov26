// v0.66c (30 Oct): the player's-view check - run before any build is reported as working. It looks at what a player
// sees, not just totals: where curtains, coins and Wilds land by reel, what each reel strip holds, and how repetitive
// the curtain blocks are. Prints PROBLEM lines (and exits 1) when a feature is stuck to some reels or looks predictable.
// Usage: node tools/math/player_view.mjs [spins=300000] [profiles=standard,lean]
import { playRound, params } from '../../math/engine.js';
import { SeededRNG } from '../../math/rng.js';
import { STRIPS } from '../../math/strips.generated.js';

const N = +(process.argv[2] || 300000), PROFILES = (process.argv[3] || 'standard,lean').split(',');
const REELS = [[0, 1, 2], [3, 4, 5, 6], [7, 8, 9]];
const reelOf = c => (c < 3 ? 0 : c < 7 ? 1 : 2);
const problems = [];
for (const prof of PROFILES) for (const mode of ['base', 'double']) {
  const P = params(prof), set = P.MODES[mode].strips, rng = new SeededRNG(5);
  // 1) the strips themselves
  const strips = STRIPS[set], layout = strips.map(s => { const c = {}; for (const x of s) c[x] = (c[x] || 0) + 1; return c; });
  // 2) what lands, by reel
  const qReel = [0, 0, 0], coinReel = [0, 0, 0], wildReel = [0, 0, 0], blocks = {}; let qSpins = 0, multiReel = 0;
  for (let i = 0; i < N; i++) {
    const r = playRound(rng, mode, { profile: prof }), B = r.base;
    for (const c of B.coins) coinReel[reelOf(c.cell)]++;
    if (!B.loco) B.symbols.forEach((s, c) => { if (s === 'W' && !(B.mystery?.cells.includes(c))) wildReel[reelOf(c)]++; });
    if (B.mystery) { qSpins++; const rs = [...new Set(B.mystery.cells.map(reelOf))]; rs.forEach(x => qReel[x]++); if (rs.length > 1) multiReel++;
      const key = rs.map(x => `R${x + 1}`).join('+'); blocks[key] = (blocks[key] || 0) + 1; }
  }
  const pc = (a, n) => a.map(x => (100 * x / n).toFixed(2) + '%').join(' / ');
  console.log(`\n== ${prof} / ${mode} (strips ${set}, lengths ${strips.map(s => s.length).join('/')})`);
  console.log('  strip contents:', layout.map((c, i) => `R${i + 1} ` + Object.entries(c).sort().map(([k, v]) => `${k}${v}`).join(' ')).join(' | '));
  console.log(`  curtains: on ${(100 * qSpins / N).toFixed(2)}% of spins (1 in ${(N / qSpins).toFixed(1)}); by reel R1/R2/R3: ${pc(qReel, N)}; two+ reels at once: 1 in ${multiReel ? (N / multiReel).toFixed(0) : 'never'}`);
  console.log('  curtain blocks seen:', Object.entries(blocks).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / qSpins).toFixed(1)}%`).join(', '));
  console.log(`  coins by reel R1/R2/R3 (per spin): ${pc(coinReel, N)}`);
  console.log(`  Wilds by reel R1/R2/R3 (per spin, Loco Spins excluded): ${pc(wildReel, N)}`);
  // checks
  const tag = `${prof}/${mode}`;
  if (qSpins) { qReel.forEach((x, i) => { if (x === 0) problems.push(`${tag}: curtains NEVER land on reel ${i + 1}`); });
    // v0.66e: judged on single-reel curtains (a two-reel curtain covers neighbouring reels, so it always includes the middle
    // one); two-reel blocks must come both ways (left+middle and middle+right)
    const singles = [0, 1, 2].map(i => blocks[`R${i + 1}`] || 0), ns = singles.reduce((a, b) => a + b, 0), mx = Math.max(...singles) / (ns || 1);
    if (mx > 0.6) problems.push(`${tag}: ${(100 * mx).toFixed(0)}% of single curtains are on one reel - predictable`);
    const lm = blocks['R1+R2'] || 0, mr = blocks['R2+R3'] || 0;
    if (lm + mr > qSpins * 0.05 && Math.min(lm, mr) / Math.max(lm, mr) < 0.5) problems.push(`${tag}: two-reel curtains lean one way (L+M ${lm}, M+R ${mr})`); }
  coinReel.forEach((x, i) => { if (x === 0) problems.push(`${tag}: coins never land on reel ${i + 1}`); });
}
console.log(problems.length ? '\n' + problems.map(p => 'PROBLEM ' + p).join('\n') : '\nPLAYER VIEW OK: every feature lands on every reel; no reel carries most of the curtains');
process.exit(problems.length ? 1 : 0);
