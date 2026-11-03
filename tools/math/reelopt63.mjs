// v0.63 / math 0.8.0 reel search (29 Oct, UGDI profile): items 3 and 9 of docs/UGDI_COMPARISON_2026-10-29.md.
// Searches the symbol layout (coins included; Wild positions kept) and the line pays together, scoring every stop
// combination exactly. Targets are shares of ALL spins (Loco Spins excluded: they are shaped separately).
//   - line wins like UGDI's way wins: about 1 spin in 4 pays, mostly under 0.5x; about 20% RTP
//   - coins on screen: one on about 63% of spins (UGDI 63%); 3 (one short) and 4+ (trigger) set per mode
//   - Mystery stacks (Q): on screen on about 60% of spins (UGDI 64%), mostly in stacks; every stop is scored for each
//     reveal symbol (MYSTERY.reveal weights), so the targets include the reveal
//   - pays in whole coins: multiples of 4 BU (UGDI bet = 25 coins; every win is whole cents at EUR 0.25)
//   v0.66: targets per version (TSET=gd_base | gd_double | lean_base | lean_double); MINRUN=4 for curtain runs of 4+;
//     every reveal is a premium (MYSTERY.reveal), with the on-screen boost (MYSTERY.screenBoost).
// Usage: node reelopt63.mjs <base|double> <iterations> <seed> <out.json>   (env TSET / TARGET / FROM / PAYS / MINRUN / BOOST)
import { STRIPS, LINES, MYSTERY } from '../../math/config.js';
import { SeededRNG } from '../../math/rng.js';
import fs from 'node:fs';

export const SYMS = ['W', 'H1', 'H2', 'M1', 'L1', 'L2', 'L3', 'C', 'Q'];
const IDX = Object.fromEntries(SYMS.map((s, i) => [s, i]));
const W = 0, C = 7, Q = 8;
const FREE = [1, 2, 3, 4, 5, 6, 7, 8];
const BOUNDS = { 1: [2, 10], 2: [3, 12], 3: [3, 16], 4: [4, 24], 5: [4, 24], 6: [4, 24], 7: [3, 12], 8: [0, 16] };
// v0.66: the Mystery settings come from config (premium-only reveals, on-screen boost); env can override.
const BOOST = +(process.env.BOOST ?? MYSTERY.screenBoost ?? 0);
const tbl = t => { const r = t.map(([s, w]) => [IDX[s], w]); return { r, t: r.reduce((a, [, w]) => a + w, 0) }; };
const RV = tbl(MYSTERY.reveal), RVB = tbl(MYSTERY.revealBig || MYSTERY.reveal), BIG = +(process.env.BIGFROM ?? MYSTERY.bigFrom ?? 99);
const MINRUN = +(process.env.MINRUN || 2);
const EXPAND = !!(process.env.EXPAND ?? MYSTERY.expandReel);   // v0.66: full-reel curtains   // a Mystery in a run shorter than this counts as 'lone' (qlone)

// Targets are shares of ALL spins (line wins only; Loco Spins are shaped separately). v0.66 (30 Oct):
//  gd_*   Golden Dragon version: the v0.63 hit-rate shape, a little more 1-5x (the Loco Spin is now rarer and bigger);
//         curtains on about 1 spin in 9, only in runs of 4+.
//  lean_* Experiment version: wins below the stake on about 13.5% of spins (was 22%), the saving in 1-2x wins.
//  c1..c4 = exactly 1 / 2 / 3 / 4+ coins on screen (unchanged, so Hold & Win keeps its frequency).
// q1 (exactly one curtain visible) can't be near 0: a stack entering or leaving a reel's window always shows one cell;
// Golden Dragon's singles are 11% of reveals, so the ceiling is about 14% of q.
const CURT = { q: 0.065, qwin: 0.25 };   // v0.66: full-reel curtains on about 1 spin in 15
export const TARGETS = {
  gd_base: { rtp: 0.185, s05: 0.190, s51: 0.031, b12: 0.025, b25: 0.018, b510: 0.0055, b1020: 0.0018, b20: 0.0007,
    c1: 0.43, c2: 0.17, c3: 0.030, c4: 0.0078, ...CURT },
  gd_double: { rtp: 0.185, s05: 0.190, s51: 0.031, b12: 0.025, b25: 0.018, b510: 0.0055, b1020: 0.0018, b20: 0.0007,
    c1: 0.43, c2: 0.21, c3: 0.050, c4: 0.0150, ...CURT },
  lean_base: { rtp: 0.185, s05: 0.100, s51: 0.035, b12: 0.036, b25: 0.018, b510: 0.0055, b1020: 0.0018, b20: 0.0007,
    c1: 0.43, c2: 0.17, c3: 0.030, c4: 0.0078, ...CURT },
  lean_double: { rtp: 0.185, s05: 0.100, s51: 0.035, b12: 0.036, b25: 0.018, b510: 0.0055, b1020: 0.0018, b20: 0.0007,
    c1: 0.43, c2: 0.21, c3: 0.050, c4: 0.0150, ...CURT },
};
TARGETS.base = TARGETS.gd_base; TARGETS.double = TARGETS.gd_double;
const WEIGHT = { qwin: 2, rtp: 10, s05: 3, s51: 1.5, b12: 1.5, b25: 1.5, b510: 1.2, b1020: 0.8, b20: 0.5, c1: 2, c2: 2, c3: 3, c4: 6, q: 3, qlone: 1, q1: 1.5 , ...JSON.parse(process.env.WEIGHTS || '{}') };

const CELL_OF = [[0, 1, 2], [3, 4, 5, 6], [7, 8, 9]];
const LINE_CELLS = LINES.map(rows => rows.map((row, r) => CELL_OF[r][row]));

export function evaluate(strips, pays) {
  const [a, b, c] = strips;
  const la = a.length, lb = b.length, lc = c.length;
  const sym = new Int8Array(10);
  // coins per window, per reel stop
  const ca = new Int8Array(la), cb = new Int8Array(lb), cc = new Int8Array(lc);
  for (let i = 0; i < la; i++) for (let r = 0; r < 3; r++) ca[i] += a[(i + r) % la] === C;
  for (let i = 0; i < lb; i++) for (let r = 0; r < 4; r++) cb[i] += b[(i + r) % lb] === C;
  for (let i = 0; i < lc; i++) for (let r = 0; r < 3; r++) cc[i] += c[(i + r) % lc] === C;
  const qa = new Int8Array(la), qb = new Int8Array(lb), qc = new Int8Array(lc);
  for (let i = 0; i < la; i++) for (let r = 0; r < 3; r++) qa[i] += a[(i + r) % la] === Q;
  for (let i = 0; i < lb; i++) for (let r = 0; r < 4; r++) qb[i] += b[(i + r) % lb] === Q;
  for (let i = 0; i < lc; i++) for (let r = 0; r < 3; r++) qc[i] += c[(i + r) % lc] === Q;
  let q1n = 0, qwn = 0;
  let total = 0, sum = 0, qn = 0; const n = { s05: 0, s51: 0, b12: 0, b25: 0, b510: 0, b1020: 0, b20: 0 };
  const cn = [0, 0, 0, 0, 0];
  const lineWin = (k) => {   // total line win with every Q shown as k
    let w = 0;
    for (let l = 0; l < 10; l++) {
      const L = LINE_CELLS[l];
      let s0 = sym[L[0]], s1 = sym[L[1]], s2 = sym[L[2]];
      if (s0 === Q) s0 = k; if (s1 === Q) s1 = k; if (s2 === Q) s2 = k;
      if (s0 === C || s1 === C || s2 === C) continue;
      const t = s0 !== W ? s0 : s1 !== W ? s1 : s2;
      if ((s0 === t || s0 === W) && (s1 === t || s1 === W) && (s2 === t || s2 === W)) w += pays[t];
    }
    return w;
  };
  const add = (w, p) => {
    if (w <= 0) return;
    sum += w * p;
    if (w < 50) n.s05 += p; else if (w < 100) n.s51 += p; else if (w < 200) n.b12 += p; else if (w < 500) n.b25 += p; else if (w < 1000) n.b510 += p; else if (w < 2000) n.b1020 += p; else n.b20 += p;
  };
  for (let i = 0; i < la; i++) {
    sym[0] = a[i]; sym[1] = a[(i + 1) % la]; sym[2] = a[(i + 2) % la];
    for (let j = 0; j < lb; j++) {
      sym[3] = b[j]; sym[4] = b[(j + 1) % lb]; sym[5] = b[(j + 2) % lb]; sym[6] = b[(j + 3) % lb];
      const cij = ca[i] + cb[j];
      for (let k = 0; k < lc; k++) {
        sym[7] = c[k]; sym[8] = c[(k + 1) % lc]; sym[9] = c[(k + 2) % lc];
        const coins = cij + cc[k]; cn[coins > 4 ? 4 : coins]++;
        total++;
        let nq = qa[i] + qb[j] + qc[k];
        if (!nq) { add(lineWin(-1), 1); continue; }
        if (EXPAND) {   // v0.66: a curtain on a reel draws across the whole reel (coins and Wilds stay)
          if (qa[i]) for (let x = 0; x < 3; x++) if (sym[x] !== C && sym[x] !== W) sym[x] = Q;
          if (qb[j]) for (let x = 3; x < 7; x++) if (sym[x] !== C && sym[x] !== W) sym[x] = Q;
          if (qc[k]) for (let x = 7; x < 10; x++) if (sym[x] !== C && sym[x] !== W) sym[x] = Q;
          nq = 0; for (let x = 0; x < 10; x++) if (sym[x] === Q) nq++;
        }
        qn++; if (nq === 1) q1n++;
        let T = nq >= BIG ? RVB : RV; const w0 = lineWin(-1);   // w0: the win with the marigolds left blank
        if (BOOST) {   // v0.64 lite: a symbol already on screen is (1 + BOOST x its count) times as likely
          const cnt = new Int8Array(9); for (let x = 0; x < 10; x++) cnt[sym[x]]++;
          const r2 = T.r.map(([s0, w]) => [s0, w * (1 + BOOST * cnt[s0])]); T = { r: r2, t: r2.reduce((a, [, w]) => a + w, 0) };
        }
        for (const [rk, rw] of T.r) { const w = lineWin(rk); add(w, rw / T.t); if (w > w0) qwn += rw / T.t; }
      }
    }
  }
  const r = { rtp: sum / total / 100 };
  for (const k of Object.keys(n)) r[k] = n[k] / total;
  r.hit = Object.keys(n).reduce((s, k) => s + r[k], 0);
  r.q = qn / total; r.q1 = Math.max(q1n / total, 0.0001); r.qwin = qn ? qwn / qn : 0;   // share of reveals that add a win
  // short stacks: Q in a run shorter than MINRUN - stacks read better
  let lone = 0, qs = 0;
  for (const st of strips) { const L = st.length;
    for (let i = 0; i < L; i++) if (st[i] === Q) { qs++;
      let run = 1; for (let d = 1; d < L && st[(i + d) % L] === Q; d++) run++; for (let d = 1; d < L && st[(i - d + L) % L] === Q; d++) run++;
      if (run < MINRUN) lone++; } }
  r.qlone = Math.max(lone / Math.max(1, qs), 0.0001);
  r.c0 = cn[0] / total; r.c1 = cn[1] / total; r.c2 = cn[2] / total; r.c3 = cn[3] / total; r.c4 = cn[4] / total;
  return r;
}

export function loss(r, T) {
  let L = 0;
  for (const k of Object.keys(T)) {
    if ((k === 'qlone' || k === 'q1') && r[k] <= T[k]) continue;   // ceilings: fewer lone / single marigolds is never worse
    L += WEIGHT[k] * Math.log(Math.max(r[k], 1e-7) / T[k]) ** 2;
  }
  return L;
}

// pays (BU, per line, 3 of a kind): lows 0.1-0.4x, M1 above the lows, H2 / H1 the 2-5x line hits, Wild the top
const payOk = p => p.slice(0, 7).every(v => v % 4 === 0) && p[1] >= 300 && p[0] >= 600 && p[6] >= 8 && p[5] >= p[6] && p[4] >= p[5] && p[4] <= 40
  && p[3] >= p[4] + 8 && p[3] <= 152 && p[2] >= p[3] + 48 && p[1] >= p[2] + 100 && p[1] <= 1200 && p[0] >= p[1] + 300 && p[0] <= 3000;

if (import.meta.url === `file://${process.argv[1]}`) {
  const set = process.argv[2] || 'base';
  const iters = +(process.argv[3] || 3000);
  const rng = new SeededRNG(+(process.argv[4] || 7));
  const out = process.argv[5];
  const T = { ...TARGETS[process.env.TSET || set], ...JSON.parse(process.env.TARGET || '{}') };
  const strips = (process.env.FROM ? JSON.parse(fs.readFileSync(process.env.FROM, 'utf8')).strips : STRIPS[set]).map(s => Int8Array.from(s, x => IDX[x]));
  let pays = process.env.PAYS ? JSON.parse(process.env.PAYS) : [2000, 600, 248, 60, 20, 16, 12, 0, 0];
  if (process.env.FROM && !process.env.PAYS) { const p = JSON.parse(fs.readFileSync(process.env.FROM, 'utf8')).pays; pays = SYMS.slice(0, 7).map(s => p[s]).concat(0); }
  if (!process.env.FROM) for (const st of strips) {   // seed 3 Mystery stacks of 3 per reel over low symbols
    let placed = 0;
    for (let i = 5; i < st.length && placed < 3; i += Math.floor(st.length / 3)) {
      if ([0, 1, 2].every(d => st[(i + d) % st.length] >= 4 && st[(i + d) % st.length] <= 6)) { for (const d of [0, 1, 2]) st[(i + d) % st.length] = Q; placed++; }
      else i -= Math.floor(st.length / 3) - 1;
    }
  }
  const free = strips.map(s => [...s.keys()].filter(i => s[i] !== W));
  let cur = evaluate(strips, pays), curL = loss(cur, T);
  let best = { strips: strips.map(s => s.slice()), pays: pays.slice(), r: cur, L: curL };
  const t0 = Date.now();
  for (let it = 0; it < iters; it++) {
    const Tm = 0.2 * (1 - it / iters) + 0.001;
    const move = process.env.FIXPAYS ? 0 : rng.int(10);
    let undo;
    if (move < 8) {
      const r = rng.int(3);
      if (rng.int(2)) {   // swap two positions (moves a coin or a symbol without changing counts)
        const p1 = free[r][rng.int(free[r].length)], p2 = free[r][rng.int(free[r].length)];
        if (strips[r][p1] === strips[r][p2]) continue;
        const t = strips[r][p1]; strips[r][p1] = strips[r][p2]; strips[r][p2] = t;
        undo = () => { const u = strips[r][p1]; strips[r][p1] = strips[r][p2]; strips[r][p2] = u; };
      } else {            // change one symbol (counts move within BOUNDS)
        const pos = free[r][rng.int(free[r].length)];
        const old = strips[r][pos], nu = FREE[rng.int(FREE.length)];
        if (old === nu) continue;
        const cnt = x => strips[r].reduce((a, y) => a + (y === x), 0);
        if (cnt(nu) + 1 > BOUNDS[nu][1] || cnt(old) - 1 < BOUNDS[old][0]) continue;
        strips[r][pos] = nu;
        undo = () => { strips[r][pos] = old; };
      }
    } else {
      const s = rng.int(7), old = pays[s];
      const step = Math.max(4, Math.round(old * 0.1 / 4) * 4);
      pays[s] = Math.max(4, old + (rng.int(2) ? step : -step));
      if (!payOk(pays)) { pays[s] = old; continue; }
      undo = () => { pays[s] = old; };
    }
    const r = evaluate(strips, pays), L = loss(r, T);
    if (L < curL || rng.int(1e6) / 1e6 < Math.exp((curL - L) / Tm)) {
      cur = r; curL = L;
      if (L < best.L) best = { strips: strips.map(s => s.slice()), pays: pays.slice(), r, L };
    } else undo();
    if (it % 1000 === 0) console.error(set, it, curL.toFixed(4), best.L.toFixed(4), JSON.stringify(best.pays), ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  const res = { set, pays: Object.fromEntries(SYMS.slice(0, 7).map((s, i) => [s, best.pays[i]])), r: best.r, L: best.L,
    strips: best.strips.map(s => [...s].map(x => SYMS[x])) };
  const show = Object.fromEntries(Object.entries(res.r).map(([k, v]) => [k, k === 'rtp' ? +(v * 100).toFixed(2) : +(v * 100).toFixed(3)]));
  console.log(JSON.stringify({ set, pays: res.pays, L: +res.L.toFixed(4), pct: show }));
  if (out) fs.writeFileSync(out, JSON.stringify(res));
}
