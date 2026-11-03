import { SUPER } from '../../math/config.js';
// Consistency tests (math 0.8.0): every round record is replayed step by step and must add up and obey the rules it
// presents (Mystery reveal, Loco Spin, coin tease, frames, delayed step-ups, jackpot doubling - never the GRAND -,
// Full House, Super upgrade, sprinkled 4th life / x10 opening frame). 0.8.0: no candle meter.
// Usage: node test_math.mjs [rounds=300000]
import { playRound, params, evalLines, bandOf } from '../../math/engine.js';
import { SeededRNG } from '../../math/rng.js';
import { FRAME_LADDER, FULL_HOUSE_STEPS, JACKPOTS, MAX_WIN_BU, PAYTABLE, STRIPS, REEL_ROWS, LOCO, SHAPES, MYSTERY, JACKPOT_FIXED, COIN_TABLES, FEATURE } from '../../math/config.js';

const n = +(process.argv[2] || 300000);
let fails = 0; const byMsg = {}; const fail = (msg, r) => { byMsg[msg] = (byMsg[msg] || 0) + 1; if (fails++ < 12) console.log('FAIL', msg, JSON.stringify(r).slice(0, 500)); };
process.on('exit', () => { if (fails) console.log('failures by check', JSON.stringify(byMsg)); });
const counts = {};
const count = k => { counts[k] = (counts[k] || 0) + 1; };
const next = (m, max) => { const t = FRAME_LADDER[FRAME_LADDER.indexOf(m) + 1]; return t && t <= max ? t : m; };

function checkFeature(F, P, ctx) {
  const buy = ctx.mode === 'buy';
  const FE = buy ? { ...P.FEATURE, ...P.MODES.buy.feature, frames: { ...P.FEATURE.frames, ...P.MODES.buy.feature.frames } } : P.FEATURE, S = P.SUPER;
  const sup = F.super;
  const levelMax = sup ? S.levelMax : FE.levelMax, maxFrames = sup ? S.max : FE.frames.max, lives0 = sup ? S.lives : FE.lives + (F.sprinkle?.fourthLife ? 1 : 0);
  if (!sup && F.sprinkle?.fourthLife) count('sprinkle_4thLife');
  if (!sup && F.sprinkle?.bigOpen) { count('sprinkle_x10open'); if (F.openingFrames[0]?.mult !== F.sprinkle.bigOpen) fail('x10 opening frame missing', F.openingFrames); }
  const maxDoubles = sup ? S.jackpotDoubles : FE.jackpotDoubles, colMax = (sup ? S.collector : FE.collector)?.max ?? 0;
  const avoid = sup ? S.framesAvoidJackpots : FE.framesAvoidJackpots;
  if (F.lives !== lives0) fail('lives', { lives: F.lives, ctx });
  const held = new Map(F.start.map(c => [c.cell, { v: c.v, jp: c.jp }]));
  const frames = new Map(), jackpots = { ...JACKPOTS }, doubles = {}, pending = [];
  for (const f of F.openingFrames) { if (frames.has(f.cell)) fail('opening frame twice', f); frames.set(f.cell, f.mult); }
  // v0.62j: the Super opens with one of the configured equal-value sets (4 or 5 frames)
  if (sup) { const got = F.openingFrames.map(f => f.mult).join(','), ok = [...(SUPER.openingFrames.sets || []), ...(SUPER.openingFrames.setsBuy || []), [[10, 2, 2, 2], 1]].some(([set]) => set.join(',') === got);
    if (!ok) fail('super opening frames', F.openingFrames); }
  if (sup && JACKPOT_FIXED.includes(F.openingJackpot?.jp)) fail('fixed jackpot doubled at the start', F.openingJackpot);
  if (sup) { const o = F.openingJackpot; if (!o || o.from !== JACKPOTS[o.jp] || o.to !== 2 * o.from) fail('opening jackpot double', o);
    else { jackpots[o.jp] = o.to; doubles[o.jp] = 1; } }
  let fh = sup ? S.fullHouseStart : FE.fullHouseMult, cols = 0;
  const val = (cell, c) => (c.jp ? jackpots[c.jp] : c.v) * (frames.get(cell) ?? 1);
  let lives = lives0;
  for (const rs of F.respins) {
    let stepUps = 0;
    // order: the coin step-up (always first), standard skull actions, the landing; in a Super the skull acts after it
    const pre = sup ? rs.actions.filter(a => a.coin) : rs.actions, post = sup ? rs.actions.filter(a => !a.coin) : [];
    if (sup && rs.actions.findIndex(a => !a.coin) >= 0 && rs.actions.findIndex(a => !a.coin) < rs.actions.findLastIndex(a => a.coin)) fail('super action order', rs.actions);
    const act = a => {
      count((sup ? 'sup_' : buy ? 'buy_' : 'std_') + a.type + (a.coin ? '_coin' : ''));
      if (a.type === 'frame') {
        if (frames.has(a.cell)) fail('frame on framed cell', a);
        if (held.get(a.cell)?.col) fail('frame on collector', a);
        if (a.mult >= avoid && held.get(a.cell)?.jp) fail('big frame on held jackpot', a);
        frames.set(a.cell, a.mult); if (frames.size > maxFrames) fail('too many frames', a);
        if (a.mult >= 20) count(`${sup ? 'sup' : buy ? 'buy' : 'std'}_frame${a.mult}_${held.has(a.cell) ? 'onCoin' : 'onEmpty'}`);
      } else if (a.type === 'level') {
        if (frames.get(a.cell) !== a.from || a.to !== next(a.from, levelMax) || a.to === a.from) fail('level step', { a, f: frames.get(a.cell) });
        if (a.coin) { stepUps++; if (pending[0] !== a.cell) fail('step-up out of order', { a, pending, sup, mode: ctx.mode, open: F.openingFrames, rs: F.respins.map(r => [r.index, r.actions, r.landed.map(l => l.cell)]) }); pending.shift(); }
        else if (!sup) fail('standard skull level-up', a);
        frames.set(a.cell, a.to);
      } else if (a.type === 'jackpot') {
        if (jackpots[a.jp] !== a.from || a.to !== 2 * a.from) fail('jackpot double', a);
        if (JACKPOT_FIXED.includes(a.jp)) fail('fixed jackpot doubled', a);
        doubles[a.jp] = (doubles[a.jp] || 0) + 1; if (doubles[a.jp] > maxDoubles) fail('too many doubles', { a, doubles });
        jackpots[a.jp] = a.to;
      } else if (a.type === 'fullHouse') {
        if (!sup) fail('standard FH step', a);
        if (a.from !== fh || FULL_HOUSE_STEPS.indexOf(a.to) !== FULL_HOUSE_STEPS.indexOf(a.from) + 1) fail('FH step', a);
        fh = a.to;
      } else fail('unknown action', a);
    };
    pre.forEach(act);
    if (stepUps > 1) fail('more than one step-up in a respin', rs);
    // pending step-ups that were skipped because the frame was already at its top must not exist
    if (rs.levelUps.length) fail('immediate level-up', rs.levelUps);
    for (const l of [...rs.landed, ...rs.rescued]) if (held.has(l.cell)) fail('landed on held cell', l);
    for (const l of [...rs.landed, ...rs.rescued]) if (!l.col) held.set(l.cell, { v: l.v, jp: l.jp });
    for (const l of rs.landed) if (l.col) {
      cols++; count(sup ? 'sup_collector' : buy ? 'buy_collector' : 'std_collector');
      if (frames.has(l.cell)) fail('collector on frame', l);
      let v = 0; for (const [cell, c] of [...held.entries()].sort((a, b) => a[0] - b[0])) v += val(cell, c);
      if (v !== l.v) fail('collector value', { l, v });
      if ([...held.values()].some(c => c.col)) count('collectorTakesCollector');
      held.set(l.cell, { v: l.v, jp: null, col: true });
    }
    if (rs.rescued.some(c => c.col)) fail('rescued collector', rs.rescued);
    for (const l of rs.landed) { const m = frames.get(l.cell); if (m && next(m, levelMax) !== m) pending.push(l.cell); }
    post.forEach(act);
    if (rs.landed.length) lives = lives0; else { lives--; if (rs.rescued.length) lives = lives0; }
    if (rs.lives !== lives) fail('lives replay', { rs: rs.index, lives, rec: rs.lives });
    if (rs.held !== held.size) fail('held count', rs);
    if (rs.dead !== (!rs.landed.length && !rs.rescued.length)) fail('dead flag', rs);
  }
  if (cols > colMax || cols !== F.collectors) fail('collector count', { cols, rec: F.collectors });
  for (const a of F.finalLevels) {
    if (!a.coin || pending[0] !== a.cell || frames.get(a.cell) !== a.from || a.to !== next(a.from, levelMax)) fail('final step-up', { a, pending });
    pending.shift(); frames.set(a.cell, a.to); count('finalStepUp');
  }
  if (pending.length) fail('step-ups never delivered', pending);
  for (const f of F.frames) if (frames.get(f.cell) !== f.mult) fail('frames replay', { f, replay: [...frames] });
  if (F.frames.length !== frames.size) fail('frame count', F.frames);
  for (const [k, v] of Object.entries(jackpots)) if (F.jackpots[k] !== v) fail('jackpot replay', { k, v, rec: F.jackpots });
  if (!sup && fh !== FE.fullHouseMult) fail('standard FH mult', fh);
  if (F.fullHouse.mult !== fh) fail('FH mult replay', { fh, rec: F.fullHouse });
  // collect
  let total = 0;
  if (F.collect.length !== held.size) fail('collect size', { c: F.collect.length, held: held.size });
  for (const c of F.collect) {
    const h = held.get(c.cell); if (!h) { fail('collect unknown cell', c); continue; }
    if (!!h.col !== !!c.col || (h.jp || null) !== (c.jp || null)) fail('collect coin kind', { c, h });
    const v = h.jp ? jackpots[h.jp] : h.v, m = h.col ? 1 : frames.get(c.cell) ?? 1;
    if (c.v !== v || c.mult !== m || c.win !== v * m) fail('collect value', { c, v, m });
    if (c.jp && c.v > JACKPOTS[c.jp]) count('wonDoubledJackpot');
    total += c.win;
  }
  if (F.fullHouse.before !== total) fail('before-FH total', { total, rec: F.fullHouse });
  const full = F.endReason === 'full';
  if (full !== F.fullHouse.applied || (full && held.size !== 10) || (!full && lives !== 0)) fail('end state', { end: F.endReason, held: held.size, lives });
  if (F.total !== (full ? total * fh : total)) fail('feature total', { total: F.total });
  if (F.skullPot) fail('skull pot present', F.skullPot);
  if (full) count(sup ? 'superFull' : buy ? 'buyFull' : 'stdFull');
  // v0.67 (checklist 7): a Full House the reels complete ends on a respin that lands exactly one coin; an added respin
  // carries nothing else
  if (full) { const last = F.respins[F.respins.length - 1];
    if (!last.rescued?.length && last.landed.length !== 1) fail('final coin not on its own respin', last); }
  for (const rs of F.respins) if (rs.split) { count('splitFinalCoin'); if (rs.actions.length || rs.levelUps.length || rs.rescued.length || rs.landed.length !== 1) fail('split respin carries more than the coin', rs); }
  for (const m of frames.values()) if (!FRAME_LADDER.includes(m)) fail('frame not on ladder', m);
}

const inTable = (name, c) => COIN_TABLES[name].some(([v]) => (typeof v === 'string' ? c.jp === v && c.v === JACKPOTS[v] : !c.jp && c.v === v));
const PROFILES_TO_TEST = (process.env.PROFILES || 'standard,pace,lean,steady,meter,lean+steady+meter,dbl22,dbl36,lean+dbl22,lean+steady+meter+dbl36,loco34,bigFH,lean+steady+dbl22+loco34+bigFH,lean+steady+dbl22+bigFH+band75+cvMix,lean+steady+meter+dbl22+bigFH+band100+cvGD+crRare+midMore+nearGD,lean+dbl22+loco34+bigFH+band75+cvMix+crSmall+midLess+nearMore+volatile,steady+dbl22+bigFH+top600+fBig+band100+cvMix+crRare').split(',');
for (const profile of PROFILES_TO_TEST) for (const mode of ['base', 'double', 'buy', 'superbuy']) {
  const P = params(profile); const rng = new SeededRNG(42); let meter = null;
  const rounds = mode === 'buy' || mode === 'superbuy' ? n / 10 : n;
  const a = JSON.stringify(playRound(new SeededRNG(7), mode, { profile }));
  const b = JSON.stringify(playRound(new SeededRNG(7), mode, { profile }));
  if (a !== b) fail(`${profile}/${mode} not deterministic`, {});
  for (let i = 0; i < rounds; i++) {
    const r = playRound(rng, mode, { profile, meter });
    if (!P.METER && 'meter' in r) fail('meter in record', r.meter);
    // v0.67 bigFH: a Full House / standard 4th life only on a bonus paying at least the bar
    if (P.FEATURE.bigOnly && r.feature) { const F = r.feature, bar = mode === 'buy' || mode === 'superbuy' ? Math.round(P.MODES[mode].costPct * 1.5) : P.FEATURE.bigOnly.betBU;
      if (F.fullHouse.applied && F.total < bar) fail('bigFH: Full House under the bar', { total: F.total, bar });
      if (!F.super && F.lives > P.FEATURE.lives && F.total < bar) fail('bigFH: 4th life under the bar', { total: F.total, bar });
      if (F.fullHouse.applied) count('bigFH_full'); if (!F.super && F.lives > P.FEATURE.lives) count('bigFH_4thLife'); }
    if (P.LOCO.shapeSet && r.base?.loco && (r.base.lineWin < 100 || r.base.lineWin >= 4001)) fail('loco34 pay outside 1-40x', r.base.lineWin);
    if (P.METER && r.base) {   // v0.64 meter option
      const M = r.meter, N = P.METER.candles[P.MODES[mode].strips] ?? P.METER.candles[mode], B = r.base, trig = B.coins.length >= FEATURE.triggerCount;
      if (!M || M.candles !== N || M.after.n !== N) fail('meter missing / step count', M);
      const near = B.coins.length === 3 && !B.rescue;
      if (near && r.base.nearAdded === undefined && M.before.lit < N) {   // v0.71: added near misses light no candle
        if (M.candle !== M.before.lit + 1) fail('near miss did not light a candle', M); count('candle'); }
      else if (M.candle) fail('candle without an unrescued near miss below full', { M, near });
      if (M.filled !== (M.candle === N)) fail('filled flag', M);
      if (M.superStart !== (trig && M.before.lit >= N)) fail('meter Super start', { M, trig });
      if (!!r.feature?.super !== M.superStart) fail('meter Super flag', M);
      if (M.superStart && M.after.lit !== 0) fail('meter not emptied', M);
      if (M.superStart) count(`meterSuper_${mode}`);
      meter = M.after;
    }
    if (r.base) {
      const B = r.base;
      const mult = B.loco ? B.loco.mult : (B.mystery?.mult ?? 1);   // v0.69: a doubled curtain win (fBig)
      if (B.lineWins.reduce((s, w) => s + w.win, 0) !== B.lineWin) fail('line total', B);
      for (const w of B.lineWins) if (w.win !== P.PAYTABLE[w.symbol] * mult) fail('line pay', w);
      // the shown symbols are the reel window at the recorded stops; every Q became the one revealed symbol (0.8.0), then
      // a Loco Spin only turns cells Wild
      const strips = STRIPS[P.MODES[mode].strips]; let ci = 0; const qs = [], landed = [];
      const raw = (rr, row) => strips[rr][(B.stops[rr] + row) % strips[rr].length];
      // v0.66 expandReel: a curtain anywhere on a reel covers that whole reel (coins and Wilds stay)
      const reelHasQ = [0, 1, 2].map(rr => { for (let row = 0; row < REEL_ROWS[rr]; row++) if (raw(rr, row) === 'Q') return true; return false; });
      // v0.66e double curtains: a single landed curtain reel may spread to ONE neighbouring reel (options dbl22 / dbl36 only)
      // v0.71 Curtain rate "Often · small blocks": a 2-3-square block on one reel, only on a spin the reels gave no curtain
      const smallSet = B.mystery?.small ? new Set(B.mystery.cells) : null;
      if (smallSet) { const rs = new Set(B.mystery.cells.map(c => (c < 3 ? 0 : c < 7 ? 1 : 2)));
        if (!P.MYSTERY.small || rs.size !== 1 || B.mystery.cells.length < 1 || B.mystery.cells.length > 3 || reelHasQ.some(Boolean)) fail('small curtain not allowed', { m: B.mystery, profile }); else count('smallCurtain'); }
      if (!smallSet) { const rOf = c => (c < 3 ? 0 : c < 7 ? 1 : 2), extra = [...new Set((B.mystery?.cells ?? []).map(rOf))].filter(rr => !reelHasQ[rr]);
        if (extra.length && B.mystery?.extra) {   // v0.68 curtOften: one whole extra reel, only when the reels gave no curtain
          if (!(P.MYSTERY.extra || P.MYSTERY.extraPremium || P.MYSTERY.extraMix) || extra.length !== 1 || reelHasQ.some(Boolean)) fail('extra curtain not allowed', { extra, profile }); else reelHasQ[extra[0]] = true; }
        else if (extra.length) { const from = reelHasQ.indexOf(true);
          if (!P.MYSTERY.spread || extra.length > 1 || reelHasQ.filter(Boolean).length !== 1 || Math.abs(extra[0] - from) !== 1) fail('curtain spread not allowed', { extra, reelHasQ, profile });
          else reelHasQ[extra[0]] = true; } }
      for (let rr = 0; rr < 3; rr++) for (let row = 0; row < REEL_ROWS[rr]; row++, ci++) {
        const s0 = raw(rr, row); if (s0 === 'Q') landed.push(ci);
        const isQ = s0 === 'Q' || (P.MYSTERY.expandReel && reelHasQ[rr] && s0 !== 'C' && s0 !== 'W') || !!smallSet?.has(ci);
        if (isQ) qs.push(ci);
        const want = isQ ? B.mystery?.symbol : s0, made = B.loco && (rr === 1 || B.loco.wilds.includes(ci));
        // v0.71: Bandido pays swaps some Bandidos for a Guitar / Gold Ring (M1SUB); Near misses adds a coin on one square
        const subOk = P.PAYTABLE.M1SUB && want === 'M1' && (B.symbols[ci] === 'L1' || B.symbols[ci] === 'L2'), nearOk = B.nearAdded === ci && B.symbols[ci] === 'C';
        if (subOk) count('bandidoSwap'); if (nearOk) count('nearAdded');
        if (made ? B.symbols[ci] !== 'W' : B.symbols[ci] !== want && !subOk && !nearOk) fail('symbols are not the reel window', { ci, want, got: B.symbols[ci], loco: B.loco }); }
      if (qs.length) { count('mystery'); if (!B.mystery || JSON.stringify(B.mystery.cells) !== JSON.stringify(qs) || JSON.stringify(B.mystery.landed) !== JSON.stringify(landed)) fail('mystery cells', { qs, landed, m: B.mystery });
        const MY = P.MYSTERY, nR = new Set(qs.map(c => (c < 3 ? 0 : c < 7 ? 1 : 2))).size;   // v0.68: the table the engine used
        const tbl = B.mystery?.small ? MY.small.reveal : B.mystery?.prem ? MY.reveal : B.mystery?.extra ? MY.extra.reveal : nR > 1 && MY.revealTwo ? MY.revealTwo : qs.length >= (MY.bigFrom ?? 99) ? MY.revealBig : MY.reveal;
        if (!tbl.some(([s0]) => s0 === B.mystery?.symbol)) fail('mystery symbol not in its table', { m: B.mystery, n: qs.length });
        if (B.mystery?.symbol === 'W') count('mysteryWild'); }
      else if (B.mystery) fail('mystery without Q', B.mystery);
      if (B.symbols.includes('Q')) fail('unrevealed Q', B.symbols);
      const ev = evalLines(B.symbols, mult, P.PAYTABLE);
      if (ev.total !== B.lineWin || JSON.stringify(ev.wins) !== JSON.stringify(B.lineWins)) fail('line wins do not match the symbols', B);
      if (B.loco && B.rescue?.added.some(a => a.cell >= 3 && a.cell < 7 || B.loco.wilds.includes(a.cell))) fail('Coin Save on a Loco Wild', B);
      if (B.loco) { count('loco'); for (let c = 3; c < 7; c++) if (B.symbols[c] !== 'W') fail('loco middle reel not wild', B);
        if (!LOCO.mult.some(([m]) => m === B.loco.mult)) fail('loco multiplier not listed', B.loco);
        if (B.loco.wilds.length > 3 || B.loco.wilds.some(c => (c >= 3 && c < 7) || B.coins.some(k => k.cell === c))) fail('loco extra wilds', B.loco);
        B.loco.wilds.forEach((c, i) => { const rr = c < 3 ? 0 : 2, row = c < 3 ? c : c - 7; const want = qs.includes(c) ? B.mystery.symbol : raw(rr, row);
          if ((B.loco.under[i] !== want && !(P.PAYTABLE.M1SUB && want === 'M1' && /^L[12]$/.test(B.loco.under[i]))) || want === 'C' || want === 'W') fail('loco wild did not replace the reel symbol', { c, want, under: B.loco.under }); });
        const sh = (P.LOCO.shapeSet && P.SHAPES[`${P.LOCO.shapeSet}_${P.MODES[mode].strips}`]) ?? P.SHAPES[`loco_${mode}`] ?? P.SHAPES.loco;   // v0.67 loco34
        const lo = sh.edges[sh.w.findIndex(x => x > 0)], hi = sh.edges[sh.w.length - 1];   // v0.66: the shape's own bounds
        if (!(sh.w[bandOf(sh.edges, B.lineWin)] > 0) || B.lineWin < lo || B.lineWin >= hi) fail('loco pay outside its shape', { w: B.lineWin, lo, hi });
        if (B.lineWin >= 1000) count('loco10'); if (!(B.loco.draws >= 1)) fail('loco draws', B.loco); }
      // 0.8.0: 4+ coins (after Coin Save) start Hold & Win; a share of them are Super upgrades. No meter.
      const trig = B.coins.length >= FEATURE.triggerCount;
      if (trig !== !!r.feature) fail('trigger and feature disagree', { coins: B.coins.length, f: !!r.feature });
      if (B.coins.length === 3 && !B.rescue && r.feature) fail('near miss started a bonus', B);
      if (r.feature?.super) count(`super_${mode}`);
      if (r.feature) { const bv = new Map(B.coins.map(c => [c.cell, c.v]));
        for (const c of r.feature.start) if (bv.get(c.cell) !== c.v) fail('start coin changed value', { c, base: bv.get(c.cell) }); else count('startCoinSame');
        if (r.feature.start.length !== B.coins.length) fail('start coins', r.feature.start); }
      // coin values: trigger coins from the base table, coins that can't trigger from the tease table
      for (const c of B.coins) if (!inTable(trig ? 'base' : 'tease', c)) fail(`coin not from the ${trig ? 'base' : 'tease'} table`, c);
      if (!trig) for (const c of B.coins) if (c.jp) count('teaseJackpot');
    } else if (mode === 'superbuy' && !r.feature.super) fail('superbuy not super', {});
    else if (mode === 'buy' && r.feature.super) fail('buy is super', {});
    if (r.feature) { count(`${profile}_${mode}_${r.feature.super ? 'super' : 'std'}`); checkFeature(r.feature, P, { mode, profile });
      // 0.6.0 prize-led: a kept result is always in a band the shape keeps
      const sh = r.feature.super ? (mode === 'superbuy' ? P.SHAPES.superbuy : P.SHAPES.super) : (mode === 'buy' ? P.SHAPES.buy : P.SHAPES.standard);
      if (!(r.feature.draws >= 1)) fail('feature draws', r.feature.draws);
      if (sh && !(sh.w[bandOf(sh.edges, Math.min(r.feature.total, MAX_WIN_BU))] > 0)) fail('feature total in a band the shape never keeps', r.feature.total);
      if (!sh && r.feature.draws !== 1) fail('natural bonus redrawn', r.feature.draws); }
    if (r.totalWin !== Math.min((r.base?.lineWin ?? 0) + (r.feature?.total ?? 0), MAX_WIN_BU)) fail('round total', r);
    if (r.capped) count('capped');
  }
  console.log(`${profile}/${mode}: ${rounds} rounds checked`);
}
// v0.66c: the player's view - curtains must be able to land on every reel (v0.66 had them on one reel only)
for (const [set, st] of Object.entries(STRIPS)) {
  const has = st.map(s => s.includes('Q'));
  if (has.some(Boolean) && !has.every(Boolean)) fail(`curtains missing from some reels of ${set}`, has);
}
console.log('counts', JSON.stringify(counts));
console.log(fails ? `${fails} FAILURES` : 'ALL PASS');
process.exit(fails ? 1 : 0);
