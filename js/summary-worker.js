// v0.71 (checklist 19): the Summary's live measurement. Plays whole rounds of the chosen combination through the same
// engine the game uses (no estimates), in a background worker, and posts a snapshot of the figures as it goes.
// Messages in: { cmd: 'run', profile } | { cmd: 'pause' } | { cmd: 'resume' } | { cmd: 'stop' }
// Messages out: { type: 'snap', profile, snap, done }
import { playRound, params } from '../math/engine.js';

const rng = { int: n => Math.floor(Math.random() * n) };   // a fresh, unseeded stream for every run
const TARGET = { base: 2000000, double: 1000000, buy: 60000, superbuy: 30000 };
const CHUNK = { base: 4000, double: 2000, buy: 150, superbuy: 80 };
const BK = [0, 50, 100, 200, 500, 1000, 2000, 5000, 10000, Infinity];   // BU = 1/100 of the stake: <0.5x, 0.5-1x, 1-2x, ... 100x+
const SYMS = ['L1', 'L2', 'L3', 'M1', 'H2', 'H1', 'W'];
const JP = ['MINI', 'MINOR', 'MAJOR', 'GRAND'];
let job = null, paused = false, timer = null;

const reservoir = (arr, x, seen, cap) => { if (arr.length < cap) arr.push(x); else { const j = Math.floor(Math.random() * seen); if (j < cap) arr[j] = x; } };
function newMode() {
  return { n: 0, sum: 0, sum2: 0, hit: 0, bkN: BK.slice(1).map(() => 0), bkW: BK.slice(1).map(() => 0),
    what: { nothing: 0, coins: 0, sub: 0, curtain: 0, win1: 0, loco: 0, near: 0, bonus: 0 },
    rtp: { small: 0, line1: 0, curtain: 0, loco: 0, hw: 0, sup: 0, jp: 0, fh: 0 },
    cur: { n: 0, two: 0, small: 0, pay: 0, win: 0, wins: [], seen: 0, sym: Object.fromEntries(SYMS.map(s => [s, 0])), pay1: 0, pay10: 0 },
    loco: { n: 0, win: 0, wins: [], seen: 0 }, save: 0, near3: 0, short: [0, 0, 0],
    bon: { n: 0, sup: 0, supW: 0, fh: 0, tot: [], seen: 0, jp: Object.fromEntries(JP.map(j => [j, 0])), jpW: 0, gap: 0, gaps: [], gseen: 0 },
    meter: null,
    sess: { cur: null, s2000: [], s500: [], paths: [], seen: 0 } };
}
function newBuy() { return { n: 0, sum: 0, sum2: 0, res: [], seen: 0 }; }

function base(mode, st) {
  const r = playRound(rng, mode, { profile: job.profile, meter: st.meter });
  if (r.meter) st.meter = r.meter.after;
  const w = r.totalWin, b = r.base, f = r.feature;
  st.n++; st.sum += w; st.sum2 += w * w; if (w > 0) st.hit++;
  if (w > 0) for (let i = 0; i < st.bkN.length; i++) if (w < BK[i + 1]) { st.bkN[i]++; st.bkW[i] += w; break; }
  const added = b.rescue?.added?.length || 0, shown = b.coins.length - added;
  if (shown >= 1 && shown <= 3) st.short[3 - shown]++;   // screens 1 / 2 / 3 coins short of the trigger
  const curtain = b.mystery && !b.mystery.small ? b.mystery : null, small = b.mystery?.small;
  if (b.mystery) { const c = st.cur; if (small) c.small++; else { c.n++; if (new Set(b.mystery.cells.map(x => (x < 3 ? 0 : x < 7 ? 1 : 2))).size > 1) c.two++; }
    c.sym[b.mystery.symbol] = (c.sym[b.mystery.symbol] || 0) + 1;
    if (!b.loco && b.lineWin > 0) { c.pay++; c.win += b.lineWin; if (b.lineWin >= 100) c.pay1++; if (b.lineWin >= 1000) c.pay10++; }
    if (!b.loco) reservoir(c.wins, b.lineWin, ++c.seen, 4000); }
  if (b.loco) { st.loco.n++; st.loco.win += b.lineWin; reservoir(st.loco.wins, b.lineWin, ++st.loco.seen, 4000); st.rtp.loco += b.lineWin; }
  else if (b.mystery) st.rtp.curtain += b.lineWin;
  else if (b.lineWin >= 100) st.rtp.line1 += b.lineWin; else st.rtp.small += b.lineWin;
  if (b.rescue) st.save++;
  const near = !f && b.coins.length === 3;
  if (near) st.near3++;
  // what happened on the spin (first that applies)
  const wh = st.what;
  if (f) wh.bonus++; else if (b.loco) wh.loco++; else if (near) wh.near++; else if (b.mystery) wh.curtain++; else if (w >= 100) wh.win1++; else if (w > 0) wh.sub++; else if (b.coins.length) wh.coins++; else wh.nothing++;
  const B = st.bon; B.gap++;
  if (f) { B.n++; reservoir(B.tot, f.total, ++B.seen, 30000); if (f.super) { B.sup++; B.supW += f.total; st.rtp.sup += f.total; } else st.rtp.hw += f.total;
    if (f.fullHouse) B.fh++;
    for (const c of f.collect || []) if (c.jp) { B.jp[c.jp] = (B.jp[c.jp] || 0) + 1; B.jpW += c.win; }
    reservoir(B.gaps, B.gap, ++B.gseen, 8000); B.gap = 0; }
  // sessions of 2,000 spins (and four of 500 inside each): balance in stakes
  const S = st.sess, cost = r.costPct;
  if (!S.cur) S.cur = { bal: 0, path: [], bon: 0, gap: 0, maxGap: 0, big: 0, k: 0, b500: 0, bon500: 0 };
  const C = S.cur; C.k++; C.bal += (w - cost) / 100; C.big = Math.max(C.big, w / 100);
  if (f) { C.bon++; C.bon500++; C.maxGap = Math.max(C.maxGap, C.gap); C.gap = 0; } else C.gap++;
  if (C.k % 50 === 0) C.path.push(+C.bal.toFixed(1));
  if (C.k % 500 === 0) { S.s500.push({ ret: (C.bal - C.b500 + 500 * cost / 100) / (500 * cost / 100), bon: C.bon500 }); if (S.s500.length > 4000) S.s500.shift(); C.b500 = C.bal; C.bon500 = 0; }
  if (C.k === 2000) { C.maxGap = Math.max(C.maxGap, C.gap);
    S.s2000.push({ ret: (C.bal + 2000 * cost / 100) / (2000 * cost / 100), bon: C.bon, gap: C.maxGap, big: C.big }); if (S.s2000.length > 1000) S.s2000.shift();
    reservoir(S.paths, C.path, ++S.seen, 300); S.cur = null; }
}
function buy(mode, st) { const w = playRound(rng, mode, { profile: job.profile }).totalWin; st.n++; st.sum += w; st.sum2 += w * w; reservoir(st.res, w, ++st.seen, 30000); }

const q = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0);
const sorted = a => a.slice().sort((x, y) => x - y);
function snapMode(st, cost) {
  const m = st.n ? st.sum / st.n : 0, sd = st.n ? Math.sqrt(Math.max(0, st.sum2 / st.n - m * m)) : 0, n = st.n || 1;
  const bt = sorted(st.bon.tot), lw = sorted(st.loco.wins), cw = sorted(st.cur.wins), gaps = sorted(st.bon.gaps);
  const pct = x => 100 * x / n, toRtp = x => 100 * x / n / cost;
  const s2 = st.sess.s2000, s5 = st.sess.s500, rets2 = sorted(s2.map(s => s.ret)), rets5 = sorted(s5.map(s => s.ret)), bon2 = sorted(s2.map(s => s.bon));
  // fan chart: quantiles of the balance at each 50-spin point
  const P = st.sess.paths, fan = [];
  if (P.length >= 20) for (let i = 0; i < 40; i++) { const v = sorted(P.map(p => p[i])); fan.push([0.05, 0.25, 0.5, 0.75, 0.95].map(x => q(v, x))); }
  return {
    n: st.n, rtp: 100 * m / cost, se: 100 * sd / Math.sqrt(n) / cost, sdX: sd / 100, hit: pct(st.hit),
    nothing: pct(st.what.nothing), what: Object.fromEntries(Object.entries(st.what).map(([k, v]) => [k, pct(v)])),
    bk: st.bkN.map((x, i) => ({ spins: pct(x), rtp: toRtp(st.bkW[i]) })),
    parts: Object.fromEntries(Object.entries(st.rtp).map(([k, v]) => [k, toRtp(v)])), jpRtp: toRtp(st.bon.jpW),
    cur: { every: st.cur.n ? n / st.cur.n : 0, twoEvery: st.cur.two ? n / st.cur.two : 0, smallEvery: st.cur.small ? n / st.cur.small : 0,
      pay: st.cur.n + st.cur.small ? 100 * st.cur.pay / (st.cur.n + st.cur.small) : 0, avgX: st.cur.n + st.cur.small ? st.cur.win / (st.cur.n + st.cur.small) / 100 : 0,
      medX: q(cw, 0.5) / 100, sym: st.cur.sym, pay1: st.cur.pay1, pay10: st.cur.pay10, all: st.cur.n + st.cur.small },
    loco: { every: st.loco.n ? n / st.loco.n : 0, avgX: st.loco.n ? st.loco.win / st.loco.n / 100 : 0, medX: q(lw, 0.5) / 100, p90X: q(lw, 0.9) / 100 },
    saveEvery: st.save ? n / st.save : 0, nearEvery: st.near3 ? n / st.near3 : 0, short: st.short.map(pct),
    bon: { every: st.bon.n ? n / st.bon.n : 0, n: st.bon.n, avgX: st.bon.n ? (st.rtp.hw + st.rtp.sup) / st.bon.n / 100 : 0, medX: q(bt, 0.5) / 100, p10X: q(bt, 0.1) / 100, p90X: q(bt, 0.9) / 100, p99X: q(bt, 0.99) / 100,
      t500: 100 * bt.filter(x => x >= 50000).length / (bt.length || 1), t1000: 100 * bt.filter(x => x >= 100000).length / (bt.length || 1), t2000: 100 * bt.filter(x => x >= 200000).length / (bt.length || 1),
      x1000: pct(bt.length ? st.bon.n * bt.filter(x => x >= 100000).length / bt.length : 0),
      fh: st.bon.n ? 100 * st.bon.fh / st.bon.n : 0, supEvery: st.bon.sup ? n / st.bon.sup : 0, supAvgX: st.bon.sup ? st.bon.supW / st.bon.sup / 100 : 0,
      jp: Object.fromEntries(JP.map(j => [j, { per10k: 10000 * (st.bon.jp[j] || 0) / n, per100: st.bon.n ? 100 * (st.bon.jp[j] || 0) / st.bon.n : 0 }])),
      hist: histLog(bt), gap10: q(gaps, 0.9), gapMed: q(gaps, 0.5), gapHist: hist(gaps, 25, Math.max(100, q(gaps, 0.98))) },
    sess: { n2000: s2.length, med2000: q(rets2, 0.5), up2000: 100 * s2.filter(s => s.ret >= 1).length / (s2.length || 1), bon5: q(bon2, 0.05), bon95: q(bon2, 0.95),
      gap2000: q(sorted(s2.map(s => s.gap)), 0.5), big2000: q(sorted(s2.map(s => s.big)), 0.5), n500: s5.length, med500: q(rets5, 0.5), up500: 100 * s5.filter(s => s.ret >= 1).length / (s5.length || 1),
      fan, examples: P.slice(0, 5) },
  };
}
function hist(a, bins, max) { const h = new Array(bins).fill(0); for (const x of a) h[Math.min(bins - 1, Math.floor(x / max * bins))]++; return { max, h: h.map(x => x / (a.length || 1)) }; }
function histLog(a) { const edges = [0, 5, 10, 20, 30, 50, 75, 100, 150, 250, 500, 1000, 2000, 5001].map(x => x * 100), h = edges.slice(1).map(() => 0);
  for (const x of a) for (let i = 0; i < h.length; i++) if (x < edges[i + 1]) { h[i]++; break; } return { edges: edges.map(e => e / 100), h: h.map(x => x / (a.length || 1)) }; }
function snapBuy(st, cost) { const r = sorted(st.res), m = st.n ? st.sum / st.n : 0, sd = st.n ? Math.sqrt(Math.max(0, st.sum2 / st.n - m * m)) : 0, k = r.length || 1;
  const sh = f => 100 * r.filter(f).length / k;
  return { n: st.n, rtp: 100 * m / cost, se: 100 * sd / Math.sqrt(st.n || 1) / cost, avgX: m / 100, priceX: cost / 100, medX: q(r, 0.5) / 100, p99X: q(r, 0.99) / 100,
    half: sh(x => x < cost / 2), under: sh(x => x < cost), x2: sh(x => x >= 2 * cost), x10: sh(x => x >= 10 * cost),
    hist: (() => { const B = 24, max = 3 * cost, h = new Array(B).fill(0); for (const x of r) h[Math.min(B - 1, Math.floor(x / max * B))]++; return { max: max / 100, h: h.map(x => x / k) }; })() }; }

function snapshot(done) {
  const P = params(job.profile), C = m => P.MODES[m].costPct;
  return { profile: job.profile, done, at: Date.now(), base: snapMode(job.st.base, C('base')), double: snapMode(job.st.double, C('double')),
    buy: snapBuy(job.st.buy, C('buy')), superbuy: snapBuy(job.st.superbuy, C('superbuy')) };
}
function step() {
  timer = null; if (!job || paused) return;
  const t0 = performance.now(), st = job.st;
  // round-robin: base gets most of the time; the others catch up proportionally
  const order = ['base', 'double', 'buy', 'superbuy'].filter(m => st[m].n < TARGET[m]).sort((a, b) => st[a].n / TARGET[a] - st[b].n / TARGET[b]);
  if (!order.length) { postMessage({ type: 'snap', profile: job.profile, snap: snapshot(true), done: true }); job = null; return; }
  const m = order[0];
  while (performance.now() - t0 < 120) for (let i = 0; i < CHUNK[m] / 10; i++) (m === 'base' || m === 'double' ? base : buy)(m, st[m]);
  if (performance.now() - job.last > 1500) { job.last = performance.now(); postMessage({ type: 'snap', profile: job.profile, snap: snapshot(false), done: false }); }
  timer = setTimeout(step, 8);   // a short breather each slice keeps the worker low-priority
}
self.onmessage = e => { const d = e.data;
  if (d.cmd === 'run') { if (job?.profile === d.profile) return; job = { profile: d.profile, last: 0, st: { base: newMode(), double: newMode(), buy: newBuy(), superbuy: newBuy() } }; if (!timer) timer = setTimeout(step, 0); }
  else if (d.cmd === 'pause') paused = true;
  else if (d.cmd === 'resume') { paused = false; if (job && !timer) timer = setTimeout(step, 0); }
  else if (d.cmd === 'stop') job = null;
};
