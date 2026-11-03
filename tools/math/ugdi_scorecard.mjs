// UGDI scorecard (v0.63): measures the live maths against Betsoft's Ultimate Golden Dragon Inferno targets
// (reference doc "Poco Loco maths reference: Ultimate Golden Dragon Inferno", harvest of 28 Oct 2026).
// Usage: node tools/math/ugdi_scorecard.mjs [baseSpins=4e6] [buys=4e5] [sessions=20000] [seed=1] [profile=standard]
// Prints a table: metric, UGDI range, Poco, verdict (OK / edge / OUT).
import { playRound, params } from '../../math/engine.js';
import { SeededRNG } from '../../math/rng.js';

const [N = 4e6, NB = 4e5, NS = 20000, SEED = 1] = process.argv.slice(2, 6).map(Number);
const PROFILE = process.argv[6] || 'standard';
const MODE = process.env.MODE || 'base';
const rng = new SeededRNG(SEED);
const P = params(PROFILE);
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const rows = [];
const row = (name, ugdi, val, lo, hi, fmt = v => v.toFixed(2)) => {
  const s = typeof val === 'number' ? fmt(val) : val;
  let v = '';
  if (lo != null && typeof val === 'number') {
    const w = (hi - lo) * 0.1;
    v = val >= lo && val <= hi ? 'OK' : val >= lo - w && val <= hi + w ? 'edge' : 'OUT';
  }
  rows.push([name, ugdi, s, v]);
};

// ---------- base game ----------
const cost = P.MODES[MODE].costPct;
let paid = 0, won = 0, hit = 0, sub05 = 0, ge1 = 0, lineRet = 0, locoRet = 0, locoN = 0, hw = 0, sup = 0, hwRet = 0, supRet = 0;
const bonus = [], locoW = [], respins = [], coinsN = new Array(11).fill(0);
let coinNT = 0, coinNTjp = 0, coinNTv = 0, coinT = 0, coinTjp = 0, coinTv = 0;
const BK = [0, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, Infinity];
const bkN = new Array(BK.length - 1).fill(0), bkW = new Array(BK.length - 1).fill(0);
let meter = null;   // v0.64: carried from spin to spin for the meter option (one long player)
for (let i = 0; i < N; i++) {
  const r = playRound(rng, MODE, { profile: PROFILE, meter }); if (r.meter) meter = r.meter.after;
  const w = r.totalWin; paid += cost; won += w;
  if (w > 0) { hit++; if (w < 50) sub05++; if (w >= 100) ge1++;
    for (let b = 0; b < bkN.length; b++) if (w < BK[b + 1]) { bkN[b]++; bkW[b] += w; break; } }
  if (r.base.loco) { locoN++; locoRet += r.base.lineWin; locoW.push(r.base.lineWin); } else lineRet += r.base.lineWin;
  const added = r.base.rescue?.added?.length || 0;
  const shown = r.base.coins.length - added;
  coinsN[shown]++;
  const trig = !!r.feature;
  for (const c of r.base.coins.slice(0)) {
    if (trig) { coinT++; if (c.jp) coinTjp++; coinTv += c.v; } else { coinNT++; if (c.jp) coinNTjp++; coinNTv += c.v; }
  }
  if (r.feature) { hw++; hwRet += r.feature.total; bonus.push(r.feature.total); respins.push(r.feature.respins.length);
    if (r.feature.super) { sup++; supRet += r.feature.total; } }
}
bonus.sort((a, b) => a - b); locoW.sort((a, b) => a - b); respins.sort((a, b) => a - b);
const pct = x => 100 * x / N;
const rtp = 100 * won / paid;
row(`RTP (${MODE}, ${cost}% stake)`, '96.27 (unconfirmed)', rtp, null, null);
row('Spins that pay anything %', '28.8-30.6', pct(hit), 28.8, 30.6);
row('Spins paying under 0.5x %', '19.5', pct(sub05), 17.5, 21.5);
row('Spins paying 1x or more %', '6.6-7.6', pct(ge1), 6.6, 7.6);
row('Base-game wins, % of stake', '26.5-32.3', 100 * (lineRet + locoRet) / paid, 26.5, 32.3);
row('  of which line wins', '19.4', 100 * lineRet / paid, null, null);
row('  of which Loco Spin', '9.9 (wild reel)', 100 * locoRet / paid, null, null);
row('Hold & Win, 1 in', '97-149', N / hw, 97, 149, v => v.toFixed(0));
row('Hold & Win share of stake (incl. Super)', '59.5 + Pick 10.0', 100 * hwRet / paid, null, null);
row('Super upgrade: share of bonuses %', '-', 100 * sup / Math.max(1, hw), null, null);
row('Super, 1 in spins', 'Pick 337-822', sup ? N / sup : 0, null, null, v => v.toFixed(0));
row('Natural bonus mean x', '57.5-85.7', bonus.reduce((a, b) => a + b, 0) / bonus.length / 100, 57.5, 85.7, v => v.toFixed(1));
row('Natural bonus median x', '55-77', q(bonus, 0.5) / 100, 55, 77, v => v.toFixed(1));
row('Natural bonus 1 in 10 under x', '8-16', q(bonus, 0.1) / 100, 8, 16, v => v.toFixed(1));
row('Natural bonus 1 in 10 over x', '106-140', q(bonus, 0.9) / 100, 106, 140, v => v.toFixed(1));
row('Natural bonus 1 in 100 over x', 'about 253', q(bonus, 0.99) / 100, 200, 300, v => v.toFixed(0));
row('Bonus respins, median', '24 (structural)', q(respins, 0.5), null, null, v => v.toFixed(0));
row('Loco Spin, 1 in', '32-40 (wild reel)', N / locoN, 32, 40, v => v.toFixed(1));
row('Loco Spin mean x', '3.6', locoW.reduce((a, b) => a + b, 0) / locoW.length / 100, 3.0, 4.2, v => v.toFixed(2));
row('Loco Spin median x', '2.2', q(locoW, 0.5) / 100, 1.8, 2.8, v => v.toFixed(2));
row('Loco Spin 1 in 10 over x', '7.6', q(locoW, 0.9) / 100, 6, 9.5, v => v.toFixed(1));
row('Coin on screen %', '63', 100 - pct(coinsN[0]), 58, 68, v => v.toFixed(1));
row('Coins on screen 1 / 2 / 3 %', '-', [1, 2, 3].map(k => pct(coinsN[k]).toFixed(1)).join(' / '), null, null);
row('Non-trigger coins showing a jackpot %', '16-17', 100 * coinNTjp / Math.max(1, coinNT), 15, 18, v => v.toFixed(1));
row('Non-trigger coin average x', '9.6', coinNTv / Math.max(1, coinNT) / 100, null, null, v => v.toFixed(1));
row('Trigger coins showing a jackpot %', '1.4', 100 * coinTjp / Math.max(1, coinT), 0.5, 3, v => v.toFixed(1));

// ---------- buys ----------
const buyStats = (mode, n) => {
  const c = P.MODES[mode].costPct; const w = []; let sum = 0;
  for (let i = 0; i < n; i++) { const r = playRound(rng, mode, { profile: PROFILE }); w.push(r.totalWin); sum += r.totalWin; }
  w.sort((a, b) => a - b);
  return { c, w, rtp: 100 * sum / (n * c), mean: sum / n / 100 };
};
if (NB > 0) {
  const b = buyStats('buy', NB);
  const share = f => 100 * b.w.filter(f).length / b.w.length;
  row('Buy price x', '80', b.c / 100, null, null, v => v.toFixed(0));
  row('Buy RTP %', '89.6-104.3', b.rtp, 89.6, 104.3);
  row('Buy mean x', '71.7-83.4', b.mean, 71.7, 83.4, v => v.toFixed(1));
  row('Buy median x', '60-72', q(b.w, 0.5) / 100, 60, 72, v => v.toFixed(1));
  row('Buy 1 in 10 under x', '16-23', q(b.w, 0.1) / 100, 16, 23, v => v.toFixed(1));
  row('Buy 1 in 10 over x', '135-160', q(b.w, 0.9) / 100, 135, 160, v => v.toFixed(1));
  row('Buy 1 in 100 over x', 'about 231', q(b.w, 0.99) / 100, 190, 280, v => v.toFixed(0));
  row('Buys paying the price or more %', '36-46', share(x => x >= b.c), 36, 46, v => v.toFixed(1));
  row('Buys paying under half the price %', '25-34', share(x => x < b.c / 2), 25, 34, v => v.toFixed(1));
  row('Buys paying double or more %', '7.8', share(x => x >= 2 * b.c), 6, 10, v => v.toFixed(1));
  const s = buyStats('superbuy', Math.round(NB / 4));
  row('Super Buy price x', '-', s.c / 100, null, null, v => v.toFixed(0));
  row('Super Buy RTP %', '-', s.rtp, null, null);
  row('Super Buy mean / median x', '-', `${s.mean.toFixed(1)} / ${(q(s.w, 0.5) / 100).toFixed(1)}`, null, null);
}

// ---------- sessions ----------
const session = (bets, maxSpins) => {
  let bust = 0, profit = 0, wag = 0, ret = 0; const dry = [];
  for (let s = 0; s < NS; s++) {
    let bal = bets * cost, spins = 0, run = 0, longest = 0, m = null;   // a new player: empty meter
    while (spins < maxSpins && bal >= cost) {
      const r = playRound(rng, MODE, { profile: PROFILE, meter: m }); if (r.meter) m = r.meter.after;
      bal += r.totalWin - cost; wag += cost; ret += r.totalWin; spins++;
      if (r.totalWin >= cost) run = 0; else { run++; if (run > longest) longest = run; }
    }
    if (bal < cost) bust++; if (bal > bets * cost) profit++; dry.push(longest);
  }
  dry.sort((a, b) => a - b);
  return { bust: 100 * bust / NS, profit: 100 * profit / NS, rtp: 100 * ret / wag, dry: q(dry, 0.5) };
};
if (NS > 0) {
  const a = session(100, 300);
  row('100 bets / 300 spins: bust %', 'about 49', a.bust, 44, 54, v => v.toFixed(1));
  row('100 bets / 300 spins: end in profit %', 'about 33', a.profit, 28, 38, v => v.toFixed(1));
  row('New-player realised RTP %', 'about 96', a.rtp, 90, 102, v => v.toFixed(1));
  row('Longest run without stake back, median', 'about 44', a.dry, null, null, v => v.toFixed(0));
  const b = session(200, 1000);
  row('200 bets / 1,000 spins: bust / profit %', 'about 50 / 33', `${b.bust.toFixed(1)} / ${b.profit.toFixed(1)}`, null, null);
}

// ---------- where the return comes from ----------
const lab = ['<0.5', '0.5-1', '1-2', '2-5', '5-10', '10-20', '20-50', '50-100', '100-200', '200+'];
const UG = { n: [19.45, 3.21, 2.54, 2.11, 1.03, 0.41, 0.38, 0.35, 0.21, 0.01], r: [3.0, 2.4, 3.7, 6.7, 7.3, 5.5, 13.9, 26.7, 25.4, 5.4] };

const w0 = Math.max(...rows.map(r => r[0].length)), w1 = Math.max(...rows.map(r => r[1].length)), w2 = Math.max(...rows.map(r => String(r[2]).length));
console.log(`Poco Loco scorecard vs UGDI (profile ${PROFILE}, mode ${MODE}; ${N} spins, ${NB} buys, ${NS} sessions, seed ${SEED})`);
for (const r of rows) console.log(r[0].padEnd(w0), ' ', r[1].padEnd(w1), ' ', String(r[2]).padStart(w2), ' ', r[3]);
// v0.66 (checklist item 1): every win-size row has Golden Dragon's 95% range (Wilson, from its 10,000 paid spins) and a
// verdict, like the scorecard rows above. Rows resting on fewer than 10 Golden Dragon spins can't be judged.
const UG_SPINS = 10000;
const wilson = (p, n) => { const z = 1.96, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)), d = 1 + z * z / n;
  return [100 * (c - m) / d, 100 * (c + m) / d]; };
console.log('\nWin size x  | UGDI % spins (95% range) | Poco % spins | verdict           | UGDI % return | Poco % return');
const verdicts = [];
lab.forEach((l, i) => {
  const ug = UG.n[i], po = pct(bkN[i]), events = Math.round(ug / 100 * UG_SPINS);
  let v, rng = '';
  if (events < 10) v = 'too few to judge';
  else { const [lo, hi] = wilson(ug / 100, UG_SPINS), w = (hi - lo) * 0.1; rng = `${lo.toFixed(2)}-${hi.toFixed(2)}`;
    v = po >= lo && po <= hi ? 'OK' : po >= lo - w && po <= hi + w ? 'edge' : 'OUT'; }
  verdicts.push([l, v]);
  console.log(`${l.padEnd(11)} | ${(ug.toFixed(2) + (rng ? ` (${rng})` : '')).padStart(23)} | ${po.toFixed(2).padStart(12)} | ${v.padEnd(17)} | ${UG.r[i].toFixed(1).padStart(13)} | ${(100 * bkW[i] / won).toFixed(1).padStart(13)}`);
});
// wins below the stake together (the client reads <0.5x and 0.5-1x as one group)
{ const ug = UG.n[0] + UG.n[1], po = pct(bkN[0]) + pct(bkN[1]), [lo, hi] = wilson(ug / 100, UG_SPINS);
  console.log(`${'below 1x'.padEnd(11)} | ${(ug.toFixed(2) + ` (${lo.toFixed(2)}-${hi.toFixed(2)})`).padStart(23)} | ${po.toFixed(2).padStart(12)} | ${po >= lo && po <= hi ? 'OK' : 'OUT'}`); }
const flagged = [...rows.filter(r => r[3] === 'OUT' || r[3] === 'edge').map(r => `${r[0]} (${r[3]})`), ...verdicts.filter(([, v]) => v === 'OUT' || v === 'edge').map(([l, v]) => `win size ${l}x (${v})`)];
console.log(`\nOUT or edge, both tables: ${flagged.length ? flagged.join('; ') : 'none'}`);
