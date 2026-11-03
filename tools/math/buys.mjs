// What does a player experience over sessions of 20 bonus buys? Usage: node buys.mjs [TUNE json]
import { PROFILES, COIN_TABLES } from '../poco/math/config.js';
if (process.argv[3]) { const c = JSON.parse(process.argv[3]); for (const k of Object.keys(c)) COIN_TABLES[k] = c[k]; }
if (process.argv[2]) { const t = JSON.parse(process.argv[2]); for (const k of Object.keys(t)) PROFILES.standard = { ...PROFILES.standard, [k]: { ...(PROFILES.standard?.[k] || {}), ...t[k] } }; }
const { playRound, params } = await import('../poco/math/engine.js');
const { SeededRNG } = await import('../poco/math/rng.js');
const rng = new SeededRNG(77), cost = params('standard').MODES.buy.costPct / 100, N = 400000;
const x = new Float64Array(N); let fh = 0; for (let i = 0; i < N; i++) { const r = playRound(rng, 'buy'); x[i] = r.totalWin / 100; if (r.feature.fullHouse.applied) fh++; }
if (process.env.TARGET) { const m = x.reduce((a, b) => a + b, 0) / N, f = (+process.env.TARGET / 100) * cost / m; for (let i = 0; i < N; i++) x[i] *= f; }
const s = [...x].sort((a, b) => a - b), q = p => s[Math.floor(p * (N - 1))];
const mean = x.reduce((a, b) => a + b, 0) / N;
const beat = x.filter(v => v >= cost).length / N;
const sess = []; for (let g = 0; g + 20 <= N; g += 20) { let t = 0, w = 0; for (let i = g; i < g + 20; i++) { t += x[i]; if (x[i] >= cost) w++; } sess.push({ ret: t / (20 * cost), w }); }
const rs = sess.map(o => o.ret).sort((a, b) => a - b), qs = p => rs[Math.floor(p * (rs.length - 1))];
const t10 = []; for (let g = 0; g + 10 <= N; g += 10) { let t = 0; for (let i = g; i < g + 10; i++) t += x[i]; t10.push(t / 10); }
t10.sort((a, b) => a - b); const q10 = p => +t10[Math.floor(p * (t10.length - 1))].toFixed(1);
const grp = []; for (let g = 0; g + 10 <= N; g += 10) { const a = Array.from(x.slice(g, g + 10)); let run = 0, maxRun = 0; for (const v of a) { run = v < 60 ? run + 1 : 0; maxRun = Math.max(maxRun, run); }
  grp.push({ big150: a.some(v => v >= 150), big200: a.some(v => v >= 200), big300: a.some(v => v >= 300), bad3: a.filter(v => v < 50).length >= 3, bad4: a.filter(v => v < 60).length >= 4, run3: maxRun >= 3, nBig: a.filter(v => v >= 150).length }); }
const pg = f => (100 * grp.filter(f).length / grp.length).toFixed(1) + '%';
const per10 = { atLeast1_150: pg(o => o.big150), atLeast1_200: pg(o => o.big200), atLeast1_300: pg(o => o.big300), twoPlus_150: pg(o => o.nBig >= 2), threePlus_under50: pg(o => o.bad3), fourPlus_under60: pg(o => o.bad4), run3_under60: pg(o => o.run3) };
const ten = { median: q10(.5), p10: q10(.1), p25: q10(.25), p75: q10(.75), p90: q10(.9), under70: (100 * t10.filter(v => v < 70).length / t10.length).toFixed(1) + '%', under80: (100 * t10.filter(v => v < 80).length / t10.length).toFixed(1) + '%', atLeast100: (100 * t10.filter(v => v >= 100).length / t10.length).toFixed(1) + '%', atLeast120: (100 * t10.filter(v => v >= 120).length / t10.length).toFixed(1) + '%' };
const wc = new Array(21).fill(0); sess.forEach(o => wc[o.w]++);
const pct = n => (100 * n / sess.length).toFixed(1) + '%';
console.log(JSON.stringify({ per10, ten, cost, RTP: (100 * mean / cost).toFixed(2) + '%', avg: +mean.toFixed(1), median: +q(.5).toFixed(1), p10: +q(.1).toFixed(1), p25: +q(.25).toFixed(1), p75: +q(.75).toFixed(1), p90: +q(.9).toFixed(1),
  fullHouse: (100 * fh / N).toFixed(1) + '%', beatCost: (100 * beat).toFixed(1) + '%', atLeast1of3: (100 * (1 - (1 - beat) ** 3)).toFixed(0) + '%', p60_140: (100 * x.filter(v => v >= 60 && v < 140).length / N).toFixed(1) + '%', over200: (100 * x.filter(v => v >= 200).length / N).toFixed(2) + '%', over300: (100 * x.filter(v => v >= 300).length / N).toFixed(2) + '%', b80_120: (100 * x.filter(v => v >= 80 && v < 120).length / N).toFixed(1) + '%', p95: +q(.95).toFixed(0), p99: +q(.99).toFixed(0), over500: (100 * x.filter(v => v >= 500).length / N).toFixed(2) + '%', over150: (100 * x.filter(v => v >= 150).length / N).toFixed(1) + '%', under50: (100 * x.filter(v => v < 50).length / N).toFixed(1) + '%',
  session20: { medianReturn: (100 * qs(.5)).toFixed(0) + '%', p25: (100 * qs(.25)).toFixed(0) + '%', p75: (100 * qs(.75)).toFixed(0) + '%', downOver25pct: pct(rs.filter(r => r <= 0.75).length), inProfit: pct(rs.filter(r => r >= 1).length) },
  winsAboveCostIn20: { '0-2': pct(wc[0] + wc[1] + wc[2]), '3': pct(wc[3]), '4': pct(wc[4]), '5-7': pct(wc[5] + wc[6] + wc[7]), '8+': pct(wc.slice(8).reduce((a, b) => a + b, 0)) } }, null, 1));
