// math 0.5 targets. Usage: TABLES='{...}' TUNE='{...profile override...}' node v5.mjs [std,buy,sup,sbuy] [n]
import { PROFILES, COIN_TABLES, JACKPOTS, MAX_WIN_BU } from '../poco/math/config.js';
if (process.env.TABLES) Object.assign(COIN_TABLES, JSON.parse(process.env.TABLES));
const mergeDeep = (a, b) => { const r = { ...(a || {}) }; for (const k of Object.keys(b)) r[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? mergeDeep(r[k], b[k]) : b[k]; return r; };
if (process.env.TUNE) PROFILES.standard = mergeDeep(PROFILES.standard, JSON.parse(process.env.TUNE));
const { playRound, playFeature, params } = await import('../poco/math/engine.js');
const { SeededRNG, pickWeighted } = await import('../poco/math/rng.js');
const [which = 'std,buy', nArg = '150000'] = process.argv.slice(2); const N = +nArg;
const rng = new SeededRNG(+(process.env.SEED || 21)), P = params('standard');
const draw = () => { const p = pickWeighted(rng, COIN_TABLES.base); return typeof p === 'string' ? { v: JACKPOTS[p], jp: p } : { v: p, jp: null }; };
const start = k => { const m = new Map(), cells = [...Array(10).keys()]; for (let j = 0; j < k; j++) m.set(cells.splice(rng.int(cells.length), 1)[0], draw()); return m; };
const mk = { std: () => playFeature(rng, start(pickWeighted(rng, [[4, 91], [5, 9]])), { P }), sup: () => playFeature(rng, start(3), { P, super: true }),
  buy: () => playRound(rng, 'buy').feature, sbuy: () => playRound(rng, 'superbuy').feature };
const pc = (a, b = N) => +(100 * a / b).toFixed(1);
for (const w of which.split(',')) {
  const x = new Float64Array(N); let s = 0; const c = { jpStart: 0, major: 0, minor: 0, minorUp: 0, x5: 0, x10: 0, x10paid: 0, open2: 0, open3: 0, fh: 0, start4: 0, col: 0, big: 0, fhBig: 0 };
  for (let i = 0; i < N; i++) { const F = mk[w](); const v = Math.min(F.total, MAX_WIN_BU) / 100; x[i] = v; s += v;
    if (F.start.some(q => q.jp)) c.jpStart++; if (F.start.length === 4) c.start4++;
    const col = F.collect; if (col.some(q => q.jp === 'MAJOR')) c.major++; if (col.some(q => q.jp === 'MINOR')) c.minor++;
    if (col.some(q => q.jp === 'MINOR' && (q.mult > 1 || F.jackpots.MINOR > JACKPOTS.MINOR))) c.minorUp++;
    const shown = [...F.openingFrames.map(f => f.mult), ...F.respins.flatMap(r => r.actions.filter(a => a.type === 'frame' || a.type === 'level').map(a => a.to ?? a.mult)), ...F.finalLevels.map(a => a.to)];
    const mx = Math.max(0, ...shown); if (mx >= 5) c.x5++; if (mx >= 10) { c.x10++; if (Math.max(0, ...col.map(q => q.mult)) >= 10) c.x10paid++; }
    if (F.openingFrames.length <= 2) c.open2++; if (F.openingFrames.length >= 3) c.open3++; if (F.fullHouse.applied) c.fh++; if (F.collectors) c.col++;
    if (v >= 150) { c.big++; if (F.fullHouse.applied) c.fhBig++; } }
  const q = [...x].sort((a, b) => a - b), Q = p => +q[Math.floor(p * (N - 1))].toFixed(1);
  const out = { avg: +(s / N).toFixed(2), median: Q(.5), p10: Q(.1), under50: pc(x.filter(v => v < 50).length), over150: pc(c.big), over300: pc(x.filter(v => v >= 300).length),
    jackpotInStart: pc(c.jpStart), start4coins: pc(c.start4), openingMax2: pc(c.open2), majorWon: `1 in ${(N / Math.max(1, c.major)).toFixed(0)}`, minorWon: pc(c.minor), minorUpgradedWon: `1 in ${(N / Math.max(1, c.minorUp)).toFixed(1)}`,
    x5plusSeen: pc(c.x5), x10Seen: `1 in ${(N / Math.max(1, c.x10)).toFixed(1)}`, x10Paid: pc(c.x10paid, c.x10) + '%', fullHouse: `1 in ${(N / Math.max(1, c.fh)).toFixed(1)}`, fhShare150: pc(c.fhBig, c.big) + '%', collectors: c.col };
  if (w === 'buy') { const g = []; for (let k = 0; k + 10 <= N; k += 10) { const a = Array.from(x.slice(k, k + 10)); let run = 0, mr = 0; for (const v of a) { run = v < 60 ? run + 1 : 0; mr = Math.max(mr, run); }
      g.push({ b150: a.some(v => v >= 150), b200: a.some(v => v >= 200), b300: a.some(v => v >= 300), bad3: a.filter(v => v < 50).length >= 3, run3: mr >= 3, avg: a.reduce((u, v) => u + v, 0) / 10 }); }
    const pg = f => pc(g.filter(f).length, g.length) + '%'; const av = g.map(o => o.avg).sort((a, b) => a - b);
    out.per10 = { with150: pg(o => o.b150), with200: pg(o => o.b200), with300: pg(o => o.b300), threeUnder50: pg(o => o.bad3), run3under60: pg(o => o.run3), typicalAvg: +av[av.length >> 1].toFixed(1) }; }
  console.log(w, JSON.stringify(out));
}
