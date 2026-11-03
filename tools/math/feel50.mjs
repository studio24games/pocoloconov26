// Player-feel measures (26 Oct targets): first sessions, first bonuses, base-game jumps, dry spells, the meter, 10 buys.
// Runs the real engine of a build (any math folder) round by round, as players would meet it.
// Usage: node feel50.mjs <mathDir> <label> [sessions=20000]
import path from 'node:path';
const [dir, label = 'build', nS = '20000'] = process.argv.slice(2);
const E = await import(path.resolve(dir, 'engine.js')), R = await import(path.resolve(dir, 'rng.js')), C = await import(path.resolve(dir, 'config.js'));
const { playRound, newMeter } = E; const rng = new R.SeededRNG(26102026); const S = +nS;
const pc = x => +(100 * x).toFixed(1);
const out = { label, mathVersion: C.MATH_VERSION };

// One player's first session of `L` spins in a mode (fresh meter). Stakes in base bets; wins as multiples of the BASE bet.
function session(mode, L) {
  let meter = newMeter(); const cost = C.MODES[mode].costPct / 100;
  const s = { bonus: 0, superB: 0, loco: 0, win5: 0, win10: 0, win2to5: 0, bigCoin: 0, nearFire: 0, step: 0, firstBonusAt: 0, firstBonusWin: 0, spent: 0, won: 0, lowBal: 0, best: 0 };
  for (let i = 1; i <= L; i++) {
    const r = playRound(rng, mode, { meter }); meter = r.meter.after;
    s.spent += cost; const w = r.totalWin / 100; s.won += w; s.lowBal = Math.min(s.lowBal, s.won - s.spent); s.best = Math.max(s.best, w);
    const B = r.base;
    if (r.feature) { s.bonus++; if (r.feature.super) s.superB++; if (!s.firstBonusAt) { s.firstBonusAt = i; s.firstBonusWin = w; } }
    if (B.loco) s.loco++;
    if (w >= 5) s.win5++; if (w >= 10) s.win10++; if (w >= 2 && w < 5) s.win2to5++;
    if (B.coins.some(c => c.jp || c.v >= 1000)) s.bigCoin++;   // a jackpot coin or a 10x coin lands in the base game
    // the client's anticipation: a later reel slows with fire when the reels before it hold exactly 3 coins
    const upTo = rr => B.coins.filter(c => (c.cell < 3 ? 0 : c.cell < 7 ? 1 : 2) < rr).length;
    if ([1, 2].some(rr => upTo(rr) === 3)) s.nearFire++;
    if (r.meter.candle) s.step++;
  }
  return s;
}
const trial = {};
for (const mode of ['base', 'double']) for (const L of [30, 50, 100]) {
  const xs = Array.from({ length: S }, () => session(mode, L));
  const f = fn => pc(xs.filter(fn).length / S);
  const signposts = x => x.win5 + x.bigCoin + x.nearFire + x.step + x.loco + x.bonus;
  trial[`${mode}_${L}`] = {
    seesBonus: f(x => x.bonus > 0), seesLoco: f(x => x.loco > 0), sees5x: f(x => x.win5 > 0), sees10x: f(x => x.win10 > 0),
    realMoment: f(x => x.bonus > 0 || x.loco > 0 || x.win10 > 0), threeSignposts: f(x => signposts(x) >= 3),
    deadSession: f(x => x.bonus === 0 && x.loco === 0 && x.win5 === 0),
    bigCoinSeen: f(x => x.bigCoin > 0), fieryNearMiss: f(x => x.nearFire > 0), meterStep: f(x => x.step > 0),
  };
}
out.trial = trial;

// Base-game jumps per spin (lines + Loco; bonuses excluded) and dry spells over 240 spins (the client's test)
{
  for (const mode of ['base', 'double']) {
    let n = 0, j25 = 0, j5 = 0, j10 = 0, hit = 0, small = 0, b12 = 0; const N = 2000000;
    for (let i = 0; i < N; i++) { const r = playRound(rng, mode, { meter: newMeter() }); const lw = r.base.lineWin / 100; n++;
      if (lw > 0) hit++; if (lw > 0 && lw < 1) small++; if (lw >= 1 && lw < 2) b12++; if (lw >= 2 && lw < 5) j25++; if (lw >= 5) j5++; if (lw >= 10) j10++; }
    const oneIn = k => +(n / k).toFixed(1);
    out[`jumps_${mode}`] = { lineOrLocoHit: oneIn(hit), smallUnder1x: oneIn(small), win1to2x: oneIn(b12), win2to5x: oneIn(j25), win5xPlus: oneIn(j5), win10xPlus: oneIn(j10) };
    const xs = Array.from({ length: 6000 }, () => session(mode, 240));
    out[`dry240_${mode}`] = { no5xLineOrLoco: pc(xs.filter(x => x.win5 - (x.bonus ? 1 : 0) <= 0 && x.best < 5).length / xs.length),
      noWin5xAtAll: pc(xs.filter(x => x.best < 5).length / xs.length), noBonus: pc(xs.filter(x => x.bonus === 0).length / xs.length) };
  }
}

// First bonuses (standard game): spins to the first, how often it disappoints (<20x), two disappointing in a row,
// and how the typical first bonus compares with what the player spent reaching it
{
  const xs = [], pair = [];
  for (let p = 0; p < 8000; p++) {
    let meter = newMeter(), spins = 0, spent = 0, got = 0; const wins = [];
    while (wins.length < 2 && spins < 5000) { const r = playRound(rng, 'base', { meter }); meter = r.meter.after; spins++; spent += 1; got += r.totalWin / 100;
      if (r.feature) { wins.push(r.feature.total / 100); if (wins.length === 1) xs.push({ at: spins, win: r.feature.total / 100, netBefore: got - r.feature.total / 100 - spent }); } }
    if (wins.length === 2) pair.push(wins);
  }
  const q = (a, f) => { const v = a.slice().sort((x, y) => x - y); return +v[Math.floor(f * (v.length - 1))].toFixed(1); };
  out.firstBonus = { medianSpinsToFirst: q(xs.map(x => x.at), 0.5), by50: pc(xs.filter(x => x.at <= 50).length / xs.length), by100: pc(xs.filter(x => x.at <= 100).length / xs.length),
    by200: pc(xs.filter(x => x.at <= 200).length / xs.length), under20x: pc(xs.filter(x => x.win < 20).length / xs.length), typicalWin: q(xs.map(x => x.win), 0.5),
    typicalDownWhenItLands: q(xs.map(x => -x.netBefore), 0.5), bothFirstTwoUnder20x: pc(pair.filter(([a, b]) => a < 20 && b < 20).length / pair.length) };
}

// The meter: spins to a Super from empty (standard game and Double Chance)
{
  for (const mode of ['base', 'double']) {
    const xs = [];
    for (let p = 0; p < 3000; p++) { let meter = newMeter(), spins = 0; for (;;) { const r = playRound(rng, mode, { meter }); meter = r.meter.after; spins++; if (r.feature?.super || spins > 20000) break; } xs.push(spins); }
    xs.sort((a, b) => a - b); const q = f => xs[Math.floor(f * (xs.length - 1))];
    out[`meter_${mode}`] = { average: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length), median: q(0.5), p90: q(0.9), p99: q(0.99), over2000: pc(xs.filter(x => x > 2000).length / xs.length) };
  }
}

// 10 buys (bought bonus and Super buy) at the build's own prices
{
  for (const mode of ['buy', 'superbuy']) {
    const price = C.MODES[mode].costPct / 100; const sets = 20000; let lessThanHalfBack = 0, nineUnderHalf = 0, twoUnder30 = 0, profit = 0, under50x3 = 0, over150 = 0; const tot = [];
    const one = []; for (let i = 0; i < 200000; i++) one.push(playRound(rng, mode).totalWin / 100);
    for (let s = 0; s < sets; s++) { const w = Array.from({ length: 10 }, () => one[rng.int(one.length)]); const t = w.reduce((a, b) => a + b, 0); tot.push(t);
      if (t < price * 10 / 2) lessThanHalfBack++; if (w.filter(v => v < price / 2).length >= 9) nineUnderHalf++;
      if (w.some((v, i) => i && v < 30 && w[i - 1] < 30)) twoUnder30++; if (t >= price * 10) profit++;
      if (w.filter(v => v < 50).length >= 3) under50x3++; if (w.some(v => v >= 150)) over150++; }
    one.sort((a, b) => a - b);
    out[`buy10_${mode}`] = { price, avg: +(one.reduce((a, b) => a + b, 0) / one.length).toFixed(1), median: one[one.length >> 1], underHalfPrice: pc(one.filter(v => v < price / 2).length / one.length),
      under30x: pc(one.filter(v => v < 30).length / one.length), over1000x: pc(one.filter(v => v >= 1000).length / one.length),
      tenBuys: { backLessThanHalf: pc(lessThanHalfBack / sets), nineOfTenUnderHalfPrice: pc(nineUnderHalf / sets), twoInARowUnder30x: pc(twoUnder30 / sets), inProfit: pc(profit / sets),
        threePlusUnder50x: pc(under50x3 / sets), atLeastOne150xPlus: pc(over150 / sets) } };
  }
}
console.log(JSON.stringify(out));
