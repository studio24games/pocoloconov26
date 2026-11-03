// v0.71 (checklist 2): engine-faithful RTP of one profile, split into parts so option effects can be measured precisely.
//   base part  = line wins + curtains + Loco Spins: N base rounds through playRound (bonuses not played)
//   pTrigger   = exact from the reel strips (every stop), as par63 (Coin Save, TRIG thinning); Super share from the config
//                (Super = Meter: counted from the N rounds, the meter carried from spin to spin)
//   bonus mean = B shaped bonuses, each started from the coins a real trigger landed with and redrawn from those SAME
//                coins until kept - exactly as playRound does (par63 drew new start coins for each redraw, which reads
//                about 1.4 points low in base play)
//   buys       = B whole rounds each through playRound
// Usage: node model71.mjs <profile> [N=4e6] [B=300000] [modes=base,double,buy,superbuy] [seed=5]   env BAL=none|{json}
if (process.env.BAL) globalThis.__POCO_BAL = process.env.BAL === 'none' ? null : JSON.parse(process.env.BAL);
const { playRound, playFeature, shapedDraw, params, featureRule } = await import('../../math/engine.js');
const { SeededRNG } = await import('../../math/rng.js');
const { evaluate, SYMS } = await import('./reelopt63.mjs');
const { STRIPS, FEATURE } = await import('../../math/config.js');
const [PROF = 'standard', N0 = 4e6, B0 = 300000, MODES = 'base,double,buy,superbuy', SEED = 5] = process.argv.slice(2);
const N = +N0, B = +B0, P = params(PROF), out = { profile: PROF, bal: P.BAL ?? null };
const IDX = Object.fromEntries(SYMS.map((s, i) => [s, i]));
const stat = () => ({ s: 0, s2: 0, n: 0, add(x) { this.s += x; this.s2 += x * x; this.n++; }, get m() { return this.n ? this.s / this.n : 0; }, get se() { return this.n ? Math.sqrt(Math.max(0, this.s2 / this.n - this.m ** 2) / this.n) : 0; } });
for (const mode of MODES.split(',')) {
  const rng = new SeededRNG(+SEED), M = P.MODES[mode], cost = M.costPct;
  if (mode === 'buy' || mode === 'superbuy') { const w = stat(); for (let i = 0; i < B; i++) w.add(playRound(rng, mode, { profile: PROF }).totalWin);
    out[mode] = { rtp: +(100 * w.m / cost).toFixed(3), se: +(100 * w.se / cost).toFixed(3), meanX: +(w.m / 100).toFixed(2) }; continue; }
  // exact trigger odds
  const pays = [...SYMS.slice(0, 7).map(s => P.PAYTABLE[s]), 0, 0];
  const r = evaluate(STRIPS[M.strips].map(s => Int8Array.from(s, x => IDX[x])), pays);
  const thin = ((mode === 'double' ? P.TRIG?.thinDouble ?? P.TRIG?.thin : P.TRIG?.thin) ?? 0) / 1000;
  const pTrig = r.c4 * (1 - thin) + r.c3 * (M.rescue3Num / FEATURE.rescue3.den);
  // base rounds: base part, start-coin pools, Super share (meter)
  const basePart = stat(), starts = { standard: [], super: [] }, seen = { standard: 0, super: 0 }, KEEP = +(process.env.KEEP || 20000); let meter = null;
  for (let i = 0; i < N; i++) { const o = playRound(rng, mode, { profile: PROF, noFeature: true, meter }); if (o.meter) meter = o.meter.after; basePart.add(o.totalWin);
    if (o.trig) { const a = starts[o.trig], k = ++seen[o.trig]; if (a.length < KEEP) a.push(o.start); else { const j = rng.int(k); if (j < KEEP) a[j] = o.start; } } }
  const q = P.METER ? seen.super / Math.max(1, seen.super + seen.standard) : (M.superNum ?? P.SUPER.upgrade.num) / P.SUPER.upgrade.den;
  const mean = kind => { const st = stat(), sh = P.SHAPES[`${kind}_${mode}`] ?? P.SHAPES[kind], rule = featureRule(P, mode), a = starts[kind], n = kind === 'super' ? Math.round(B / 3) : B, r2 = new SeededRNG(+SEED + 101);
    for (let i = 0; i < n && a.length; i++) { const s0 = a[i % a.length]; st.add(Math.min(500000, shapedDraw(r2, sh, () => playFeature(r2, new Map(s0), { P, super: kind === 'super' }), f => f.total, rule).out.total)); } return st; };
  if (!B) { out[mode] = { base: +(basePart.m / cost * 100).toFixed(3), baseSe: +(basePart.se / cost * 100).toFixed(3), every: +(1 / pTrig).toFixed(2), q: +q.toFixed(4) }; continue; }   // base part only
  const std = mean('standard'), sup = mean('super');
  const bonus = pTrig * ((1 - q) * std.m + q * sup.m), rtp = (basePart.m + bonus) / cost * 100;
  const se = Math.sqrt(basePart.se ** 2 + (pTrig * (1 - q) * std.se) ** 2 + (pTrig * q * sup.se) ** 2) / cost * 100;
  out[mode] = { rtp: +rtp.toFixed(3), se: +se.toFixed(3), base: +(basePart.m / cost * 100).toFixed(3), baseSe: +(basePart.se / cost * 100).toFixed(3), bonus: +(bonus / cost * 100).toFixed(3),
    every: +(1 / pTrig).toFixed(2), q: +q.toFixed(4), stdX: +(std.m / 100).toFixed(2), supX: +(sup.m / 100).toFixed(2), starts: [starts.standard.length, starts.super.length] };
}
console.log(JSON.stringify(out));
