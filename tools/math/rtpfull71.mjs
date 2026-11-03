// v0.71: RTP of one profile by playing whole rounds through playRound - exactly what the game does (each bonus is
// shaped from its own start coins; par63 drew a new start per redraw and read about 1.4 points low in base play).
// Usage: node rtpfull71.mjs <profile> [spinsM=12] [buys=300000] [modes=base,double,buy,superbuy] [seed=1]   env BAL=none|{json}
if (process.env.BAL) globalThis.__POCO_BAL = process.env.BAL === 'none' ? null : JSON.parse(process.env.BAL);
const { playRound, params } = await import('../../math/engine.js'); const { SeededRNG } = await import('../../math/rng.js');
const [PROF, NM = 12, B = 300000, MODES = 'base,double,buy,superbuy', SEED = 1] = process.argv.slice(2);
const P = params(PROF), rng = new SeededRNG(+SEED), out = { profile: PROF, bal: P.BAL ?? null };
for (const mode of MODES.split(',')) {
  const n = mode === 'buy' || mode === 'superbuy' ? +B : Math.round(+NM * 1e6), cost = P.MODES[mode].costPct;
  let s = 0, s2 = 0, nf = 0, fs = 0, lines = 0;
  for (let i = 0; i < n; i++) { const r = playRound(rng, mode, { profile: PROF }); s += r.totalWin; s2 += r.totalWin * r.totalWin; if (r.feature) { nf++; fs += r.feature.total; } lines += r.base?.lineWin ?? 0; }
  const m = s / n, se = Math.sqrt((s2 / n - m * m) / n);
  out[mode] = { rtp: +(100 * m / cost).toFixed(2), se: +(100 * se / cost).toFixed(2), n, ...(nf && mode !== 'buy' && mode !== 'superbuy' ? { bonusEvery: +(n / nf).toFixed(1), bonusX: +(fs / nf / 100).toFixed(1), base: +(100 * lines / n / cost).toFixed(2) } : {}) };
}
console.log(JSON.stringify(out));
