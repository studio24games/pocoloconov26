// math 0.4.0 shape check. Usage: TUNE='{"FEATURE":{...},"SUPER":{...},"MODES":{...}}' node v4.mjs [which=std,sup,buy,sbuy] [n=200000]
import { PROFILES, COIN_TABLES, JACKPOTS, MAX_WIN_BU } from '../poco/math/config.js';
if (process.env.TUNE) { const t = JSON.parse(process.env.TUNE); PROFILES.standard = { ...PROFILES.standard, ...t }; }
const { playRound, playFeature, params } = await import('../poco/math/engine.js');
const { SeededRNG, pickWeighted } = await import('../poco/math/rng.js');
const [which = 'std,sup,buy,sbuy', nArg = '200000'] = process.argv.slice(2); const N = +nArg;
const rng = new SeededRNG(+(process.env.SEED || 9)), P = params('standard');
const draw = () => { const p = pickWeighted(rng, COIN_TABLES.base); return typeof p === 'string' ? { v: JACKPOTS[p], jp: p } : { v: p, jp: null }; };
const start = k => { const m = new Map(), cells = [...Array(10).keys()]; for (let j = 0; j < k; j++) m.set(cells.splice(rng.int(cells.length), 1)[0], draw()); return m; };
const makers = {
  std: () => playFeature(rng, start(pickWeighted(rng, [[4, 85], [5, 13], [6, 2]])), { P }),
  sup: () => playFeature(rng, start(3), { P, super: true }),
  buy: () => playRound(rng, 'buy').feature,
  sbuy: () => playRound(rng, 'superbuy').feature,
};
const pc = (a, b = N) => +(100 * a / b).toFixed(2);
for (const w of which.split(',')) {
  const x = new Float64Array(N); let fh = 0, col1 = 0, col2 = 0, colPaid = 0, sum = 0, fhBig = 0, big = 0;
  const fr = { 10: [0, 0], 20: [0, 0], 50: [0, 0] }; let framesShown = 0, openN = 0, jpShown = 0, jpWon = 0, steps = 0, finalSteps = 0;
  for (let i = 0; i < N; i++) { const F = makers[w](); const v = Math.min(F.total, MAX_WIN_BU) / 100; x[i] = v; sum += v;
    if (F.fullHouse.applied) fh++; if (F.collectors >= 1) col1++; if (F.collectors >= 2) col2++;
    for (const c of F.collect) if (c.col) colPaid += c.win * (F.fullHouse.applied ? F.fullHouse.mult : 1) / 100;
    if (v >= 150) { big++; if (F.fullHouse.applied) fhBig++; }
    // biggest frame value reached in the bonus, and whether a coin was collected on a frame that big
    const shownMax = Math.max(0, ...F.openingFrames.map(f => f.mult), ...F.respins.flatMap(r => r.actions.filter(a => a.type === 'frame' || a.type === 'level').map(a => a.to ?? a.mult)), ...F.finalLevels.map(a => a.to));
    const paidMax = Math.max(0, ...F.collect.map(c => c.mult));
    for (const k of [10, 20, 50]) { if (shownMax >= k) { fr[k][0]++; if (paidMax >= k) fr[k][1]++; } }
    framesShown += F.respins.reduce((n, r) => n + r.actions.filter(a => a.type === 'frame').length, 0); openN += F.openingFrames.length;
    const grown = new Set(F.respins.flatMap(r => r.actions.filter(a => a.type === 'jackpot').map(a => a.jp))); if (grown.size) jpShown++;
    if (F.collect.some(c => c.jp && grown.has(c.jp))) jpWon++;
    steps += F.respins.reduce((n, r) => n + r.actions.filter(a => a.type === 'level' && a.coin).length, 0); finalSteps += F.finalLevels.length; }
  const s = [...x].sort((a, b) => a - b), q = p => +s[Math.floor(p * (N - 1))].toFixed(1);
  console.log(w, JSON.stringify({ avg: +(sum / N).toFixed(2), median: q(.5), p10: q(.1), p90: q(.9), p99: q(.99), under50: pc(x.filter(v => v < 50).length), over100: pc(x.filter(v => v >= 100).length), over150: pc(big), over300: pc(x.filter(v => v >= 300).length),
    fullHouse: `1 in ${(N / fh).toFixed(1)}`, fhShareOf150: pc(fhBig, big) + '%', collector: `1 in ${(N / col1).toFixed(1)}`, collector2: `1 in ${(N / Math.max(1, col2)).toFixed(0)}`, collectorValueShare: pc(colPaid, sum) + '%',
    openingFrames: +(openN / N).toFixed(2), skullFramesPerBonus: +(framesShown / N).toFixed(2),
    x10: `1 in ${(N / fr[10][0]).toFixed(1)} (paid ${pc(fr[10][1], fr[10][0])}%)`, x20: `1 in ${(N / fr[20][0]).toFixed(1)} (paid ${pc(fr[20][1], fr[20][0])}%)`, x50: `1 in ${(N / fr[50][0]).toFixed(1)} (paid ${pc(fr[50][1], fr[50][0])}%)`,
    jpDoubledShown: `1 in ${(N / jpShown).toFixed(1)}`, jpDoubledWon: `1 in ${(N / Math.max(1, jpWon)).toFixed(0)}`, stepUpsPerBonus: +(steps / N).toFixed(2), stepUpsAtEnd: +(finalSteps / N).toFixed(2) }));
}
