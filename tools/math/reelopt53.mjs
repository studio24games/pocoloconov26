// v0.53 (27 Oct, item 11): under-0.5x line wins halved, 0.5-1x kept, the saving moved into 2-5x wins (and the Loco Spin).
// v0.50 base-game reshape (26 Oct): keep the small wins, cut most 1-2x wins, move the money into 2-20x wins.
// Coin (C) and Wild (W) positions are kept exactly as they are, so coins on screen, triggers, near misses and the
// meter are unchanged; only the other symbols are re-laid and the line pays searched alongside.
// Usage: node reelopt50.mjs <base|double> <iterations> <seed> <out.json>
import { STRIPS, LINES } from '../../math/config.js';
import { SeededRNG } from '../../math/rng.js';
import fs from 'node:fs';

export const SYMS = ['W', 'H1', 'H2', 'M1', 'L1', 'L2', 'L3', 'C'];
const IDX = Object.fromEntries(SYMS.map((s, i) => [s, i]));
const W = 0, C = 7;
const FREE = [1, 2, 3, 4, 5, 6];
const BOUNDS = { 1: [2, 10], 2: [3, 12], 3: [3, 16], 4: [5, 22], 5: [5, 22], 6: [5, 22] };

// Line wins only (Loco excluded), as a share of all spins. Agreed shape (26 Oct): small wins about 1 spin in 6-7,
// 1-2x rare (1 in 80), 2-5x about 1 in 30, 5-10x about 1 in 140, 10-20x about 1 in 450, 20x+ about 1 in 1,500; about 26%
// RTP (the Loco Spin, about 10 points, now carries much of the 5x+ and 10x+ base-game wins).
export const TARGET = JSON.parse(process.env.TARGET || 'null') || { rtp: 0.259, s05: 1 / 20, s51: 1 / 18, b12: 1 / 80, b25: 1 / 27.5, b510: 1 / 141, b1020: 1 / 441, b20: 1 / 1429 };
const WEIGHT = { rtp: +(process.env.WRTP || 8), s05: 2, s51: 1.5, b12: 1, b25: 1.5, b510: 1.5, b1020: 1, b20: 0.6 };

const CELL_OF = [[0, 1, 2], [3, 4, 5, 6], [7, 8, 9]];
const LINE_CELLS = LINES.map(rows => rows.map((row, r) => CELL_OF[r][row]));

export function evaluate(strips, pays) {
  const [a, b, c] = strips;
  const la = a.length, lb = b.length, lc = c.length;
  const sym = new Int8Array(10);
  let total = 0, sum = 0; const n = { s05: 0, s51: 0, b12: 0, b25: 0, b510: 0, b1020: 0, b20: 0 };
  for (let i = 0; i < la; i++) {
    sym[0] = a[i]; sym[1] = a[(i + 1) % la]; sym[2] = a[(i + 2) % la];
    for (let j = 0; j < lb; j++) {
      sym[3] = b[j]; sym[4] = b[(j + 1) % lb]; sym[5] = b[(j + 2) % lb]; sym[6] = b[(j + 3) % lb];
      for (let k = 0; k < lc; k++) {
        sym[7] = c[k]; sym[8] = c[(k + 1) % lc]; sym[9] = c[(k + 2) % lc];
        let w = 0;
        for (let l = 0; l < 10; l++) {
          const L = LINE_CELLS[l];
          const s0 = sym[L[0]], s1 = sym[L[1]], s2 = sym[L[2]];
          if (s0 === C || s1 === C || s2 === C) continue;
          const t = s0 !== W ? s0 : s1 !== W ? s1 : s2;
          if ((s0 === t || s0 === W) && (s1 === t || s1 === W) && (s2 === t || s2 === W)) w += pays[t];
        }
        total++;
        if (w > 0) {
          sum += w;
          if (w < 50) n.s05++; else if (w < 100) n.s51++; else if (w < 200) n.b12++; else if (w < 500) n.b25++; else if (w < 1000) n.b510++; else if (w < 2000) n.b1020++; else n.b20++;
        }
      }
    }
  }
  const r = { rtp: sum / total / 100 };
  for (const k of Object.keys(n)) r[k] = n[k] / total;
  r.hit = Object.keys(n).reduce((s, k) => s + r[k], 0);
  return r;
}

export function loss(r) {
  let L = 0;
  for (const k of Object.keys(TARGET)) L += WEIGHT[k] * Math.log(Math.max(r[k], 1e-6) / TARGET[k]) ** 2;
  return L;
}

// lows at least 0.2x (visible small wins), the top symbol at least 5x (a single line is a real jump), Wild 25-50x
const payOk = p => p[6] >= 20 && p[5] >= p[6] && p[4] >= p[5] && p[3] >= p[4] + 20 && p[2] >= p[3] + 50 && p[1] >= Math.max(500, p[2] + 100) && p[0] >= 2500 && p[0] <= 5000;

if (import.meta.url === `file://${process.argv[1]}`) {
  const set = process.argv[2] || 'base';
  const iters = +(process.argv[3] || 3000);
  const rng = new SeededRNG(+(process.argv[4] || 7));
  const out = process.argv[5];
  let strips = (process.env.FROM ? JSON.parse(fs.readFileSync(process.env.FROM, 'utf8')).strips : STRIPS[set]).map(s => Int8Array.from(s, x => IDX[x]));
  // starting pays (BU): small lows, a 2-4x mid, 5x+ highs
  let pays = [2500, 1000, 500, 250, 40, 30, 20, 0];
  if (process.env.PAYS) pays = JSON.parse(process.env.PAYS);
  const free = strips.map(s => [...s.keys()].filter(i => s[i] !== W && s[i] !== C));
  let cur = evaluate(strips, pays), curL = loss(cur);
  let best = { strips: strips.map(s => s.slice()), pays: pays.slice(), r: cur, L: curL };
  const t0 = Date.now();
  for (let it = 0; it < iters; it++) {
    const T = 0.25 * (1 - it / iters) + 0.002;
    const move = process.env.FIXPAYS ? 0 : rng.int(10);
    let undo;
    if (move < 7) {
      const r = rng.int(3);
      if (rng.int(2)) {
        const p1 = free[r][rng.int(free[r].length)], p2 = free[r][rng.int(free[r].length)];
        if (strips[r][p1] === strips[r][p2]) continue;
        const t = strips[r][p1]; strips[r][p1] = strips[r][p2]; strips[r][p2] = t;
        undo = () => { const u = strips[r][p1]; strips[r][p1] = strips[r][p2]; strips[r][p2] = u; };
      } else {
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
      const step = Math.max(10, Math.round(old * 0.1 / 10) * 10);
      pays[s] = Math.max(10, old + (rng.int(2) ? step : -step));
      if (!payOk(pays)) { pays[s] = old; continue; }
      undo = () => { pays[s] = old; };
    }
    const r = evaluate(strips, pays), L = loss(r);
    if (L < curL || rng.int(1e6) / 1e6 < Math.exp((curL - L) / T)) {
      cur = r; curL = L;
      if (L < best.L) best = { strips: strips.map(s => s.slice()), pays: pays.slice(), r, L };
    } else undo();
    if (it % 500 === 0) console.error(it, curL.toFixed(4), best.L.toFixed(4), JSON.stringify(best.pays), ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  const res = { set, pays: Object.fromEntries(SYMS.slice(0, 7).map((s, i) => [s, best.pays[i]])), r: best.r, L: best.L,
    strips: best.strips.map(s => [...s].map(x => SYMS[x])) };
  console.log(JSON.stringify({ pays: res.pays, L: res.L, r: Object.fromEntries(Object.entries(res.r).map(([k, v]) => [k, k === 'rtp' ? +(v * 100).toFixed(2) : `1 in ${(1 / v).toFixed(1)}`])) }));
  if (out) fs.writeFileSync(out, JSON.stringify(res));
}
