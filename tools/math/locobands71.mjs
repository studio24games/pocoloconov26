// v0.71 Mid wins (checklist 20a): each Loco Spin shape's kept share and average win per band, so the Mid wins option can
// move Loco Spin results into / out of 10-50x while the Loco Spin average stays the same. Output goes to config LOCO_BANDS.
import { baseSpin, params, shapedDraw, bandOf } from '../../math/engine.js';
import { SeededRNG } from '../../math/rng.js';
const N = +(process.argv[2] || 60000), rng = new SeededRNG(5), out = {};
const jobs = [['loco', 'lean+steady+dbl22+bigFH+band75+cvMix', 'base'], ['loco_double', 'lean+steady+dbl22+bigFH+band75+cvMix', 'double'],
  ['locoGD_baseLean', 'lean+steady+dbl22+loco34+bigFH+band75+cvMix', 'base'], ['locoGD_doubleLean', 'lean+steady+dbl22+loco34+bigFH+band75+cvMix', 'double'],
  ['locoGD_base', 'steady+dbl22+loco34+bigFH+band75+cvMix', 'base'], ['locoGD_double', 'steady+dbl22+loco34+bigFH+band75+cvMix', 'double']];
for (const [key, prof, mode] of jobs) {
  const P = params(prof), M = P.MODES[mode], sh = P.SHAPES[key], n = sh.w.map(() => 0), s = sh.w.map(() => 0);
  for (let i = 0; i < N; i++) { const v = shapedDraw(rng, sh, () => baseSpin(rng, M, P.LOCO, true, P.MYSTERY, P.PAYTABLE), sp => sp.lines.total).out.lines.total, b = bandOf(sh.edges, v); n[b]++; s[b] += v; }
  out[key] = { q: n.map(x => +(x / N).toFixed(5)), m: s.map((x, b) => (n[b] ? Math.round(x / n[b]) : 0)) };
  console.error(key, prof, mode, JSON.stringify(out[key]));
}
console.log(JSON.stringify(out));
