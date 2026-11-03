// Find a coinScale giving a target average. Usage: node scale.mjs <buy|sbuy|std|sup> <targetAvgX> [n=300000]
// Bonus averages are linear in the cash scale: avg(s) = J + C*s, so two runs at fixed seeds pin it down.
import { PROFILES, COIN_TABLES, JACKPOTS, MAX_WIN_BU } from '../poco/math/config.js';
const [w, tgt, nArg = '300000'] = process.argv.slice(2); const N = +nArg;
const { playRound, playFeature, params } = await import('../poco/math/engine.js');
const { SeededRNG, pickWeighted } = await import('../poco/math/rng.js');
const P = params('standard');
const setScale = s => { if (w === 'sbuy') P.MODES.superbuy.coinScale = s; else if (w === 'buy') P.MODES.buy.feature.coinScale = s; else if (w === 'std') P.FEATURE.coinScale = s; else P.SUPER.coinScale = s; };
const getScale = () => w === 'sbuy' ? P.MODES.superbuy.coinScale : w === 'buy' ? P.MODES.buy.feature.coinScale : w === 'std' ? P.FEATURE.coinScale : P.SUPER.coinScale;
function avg(s) { setScale(s); const rng = new SeededRNG(123);
  const draw = () => { const p = pickWeighted(rng, COIN_TABLES.base); return typeof p === 'string' ? { v: JACKPOTS[p], jp: p } : { v: p, jp: null }; };
  const start = k => { const m = new Map(), cells = [...Array(10).keys()]; for (let j = 0; j < k; j++) m.set(cells.splice(rng.int(cells.length), 1)[0], draw()); return m; };
  let t = 0; for (let i = 0; i < N; i++) { const f = w === 'buy' ? playRound(rng, 'buy').feature : w === 'sbuy' ? playRound(rng, 'superbuy').feature
      : w === 'std' ? playFeature(rng, start(pickWeighted(rng, [[4, 85], [5, 13], [6, 2]])), { P }) : playFeature(rng, start(3), { P, super: true });
    t += Math.min(f.total, MAX_WIN_BU); } return t / N / 100; }
const s0 = getScale(), a0 = avg(s0), s1 = Math.round(s0 * 0.8), a1 = avg(s1);
const s = Math.round(s1 + (+tgt - a1) * (s0 - s1) / (a0 - a1));
console.log(JSON.stringify({ w, s0, a0: +a0.toFixed(2), s1, a1: +a1.toFixed(2), scale: s, check: +avg(s).toFixed(2) }));
