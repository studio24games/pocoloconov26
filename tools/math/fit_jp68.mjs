// v0.68 option jpGD: Golden Dragon-like jackpot coins change how often each total occurs naturally, so the bonus shapes
// (which keep a band with chance w/max relative to its natural frequency) would let more big results through. This
// samples unshaped bonuses with the standard and the jpGD coin tables and prints, for each shape the option affects
// (standard bonus and Buy, standard and steady spreads), the per-band factor nat_old / nat_new that restores every
// band's share. Usage: node tools/math/fit_jp68.mjs [plays=200000]
import { playFeature, params } from '../../math/engine.js';
import { SeededRNG, pickWeighted } from '../../math/rng.js';
import { COIN_TABLES, JACKPOTS, CELL_COUNT, SHAPES, PROFILES } from '../../math/config.js';
const N = +(process.argv[2] || 200000);
const coin = rng => { const v = pickWeighted(rng, COIN_TABLES.base); return typeof v === 'string' ? { v: JACKPOTS[v], jp: v } : { v, jp: null }; };
function sample(prof, kind) { const P = params(prof), rng = new SeededRNG(kind === 'buy' ? 11 : 12), out = new Float64Array(N);
  for (let i = 0; i < N; i++) { const n = kind === 'buy' ? pickWeighted(rng, P.MODES.buy.startCoins) : (rng.int(100) < 88 ? 4 : 5);
    const m = new Map(), cells = [...Array(CELL_COUNT).keys()]; for (let k = 0; k < n; k++) m.set(cells.splice(rng.int(cells.length), 1)[0], coin(rng));
    out[i] = playFeature(rng, m, kind === 'buy' ? { P, buy: true } : { P }).total; } return out; }
const bandCounts = (xs, e) => { const c = new Array(e.length).fill(0); for (const x of xs) { let b = 0; while (b + 1 < e.length && x >= e[b + 1]) b++; c[b]++; } return c; };
const res = {};
for (const kind of ['standard', 'buy']) {
  const old = sample('standard', kind), neu = sample('jpGD', kind);
  for (const sh of [SHAPES[kind], PROFILES.steady.SHAPES[kind]]) {
    const a = bandCounts(old, sh.edges), b = bandCounts(neu, sh.edges);
    res[`${kind}:${sh.edges.join(',')}`] = a.map((x, i) => (x && b[i] ? +(x / b[i]).toFixed(4) : 1)); } }
console.log(JSON.stringify(res));
