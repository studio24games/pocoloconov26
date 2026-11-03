// Game 002 maths engine (math 0.8.0). Pure + deterministic given an RNG: no I/O, no floats, no clock.
// The RGS calls playRound(); the client only ever animates the returned record.
//
// 0.8.0 (29 Oct, UGDI profile): no state is carried between rounds. The candle meter is gone; a Super Hold & Win is a
// random upgrade of a natural trigger (SUPER.upgrade), so every spin carries its full RTP.

import {
  REEL_ROWS, CELL_COUNT, cellIndex, LINES, PAYTABLE, JACKPOTS, COIN_TABLES,
  FEATURE, SUPER, LOCO, MODES, JACKPOT_FIXED, MYSTERY, PROFILES, FRAME_LADDER, FULL_HOUSE_STEPS, MAX_WIN_BU, STRIPS, MATH_VERSION, SHAPES, balanceTilt,
} from './config.js';
import { pickWeighted } from './rng.js';

const chance = (rng, num, den) => rng.int(den) < num;
const failTease = (rng, num, den) => {
  const fNum = Math.round(num * FEATURE.rescueFail.share / (1 - FEATURE.rescueFail.share));
  return chance(rng, fNum, den - num);
};

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  if (!isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = isObj(base?.[k]) ? merge(base[k], over[k]) : over[k];
  return out;
}
const PARAMS = {};
// v0.64: a profile is 'standard' or a '+'-joined list of options from PROFILES, in OPTION_ORDER (e.g. 'lean+meter'):
// each option's overrides are applied in turn. Link switches: ?version=experiment (lean), ?shape=steady, ?super=meter
// (?math=pace). v0.66: 'lite' retired (the standard reels now have rare, big curtain stacks).
export const OPTION_ORDER = ['pace', 'lean', 'steady', 'meter', 'dbl22', 'dbl36', 'loco34', 'bigFH', 'curtOften', 'bonusOften', 'bonusRare', 'jpGD', 'topTrim', 'topLean', 'top600', 'fMore', 'fPay', 'fBig', 'band75', 'band100', 'cvMix', 'cvGD', 'crRare', 'crSmall', 'midLess', 'midMore', 'nearMore', 'nearGD', 'volatile', 'potsA', 'potsB', 'potsH', 'potMk'];   // v0.66e: + double curtains
export function profileParts(profile = 'standard') {
  if (profile === 'standard') return [];
  const parts = String(profile).split('+');
  if (!parts.length || parts.some(p => !PROFILES[p] || p === 'standard')) throw new Error(`unknown profile ${profile}`);
  const canon = OPTION_ORDER.filter(o => parts.includes(o));
  if (canon.join('+') !== parts.join('+')) throw new Error(`profile options out of order: ${profile}`);
  return parts;
}
export const isProfile = p => { try { profileParts(p); return true; } catch { return false; } };
/** Maths parameters for a profile. */
export function params(profile = 'standard') {
  if (!PARAMS[profile]) {
    let P = { MODES, FEATURE, SUPER, LOCO, MYSTERY, PAYTABLE, METER: null, SHAPES: { ...SHAPES }, POTS: null };
    for (const name of profileParts(profile)) { const o = PROFILES[name];
      P = { MODES: merge(P.MODES, o.MODES), FEATURE: merge(P.FEATURE, o.FEATURE), SUPER: merge(P.SUPER, o.SUPER),
        LOCO: merge(P.LOCO, o.LOCO), MYSTERY: merge(P.MYSTERY, o.MYSTERY), PAYTABLE: merge(P.PAYTABLE, o.PAYTABLE), METER: o.METER ? merge(P.METER || {}, o.METER) : P.METER,
        SHAPES: { ...P.SHAPES, ...(o.SHAPES || {}) }, TILT: o.TILT ?? P.TILT, TRIG: o.TRIG ?? P.TRIG,
        SHAPEF: o.SHAPEF ? [...(P.SHAPEF || []), o.SHAPEF] : P.SHAPEF, TOPCUT: o.TOPCUT ?? P.TOPCUT, BANDIDO: o.BANDIDO ?? P.BANDIDO,
        MIDW: o.MIDW ?? P.MIDW, NEAR: o.NEAR ?? P.NEAR, VOL: o.VOL ?? P.VOL, POTS: o.POTS ? merge(P.POTS || {}, o.POTS) : P.POTS }; }
    // v0.71 Bandido pays: the higher pay, and the swap rate that keeps his share of the RTP (see PROFILES.band75)
    if (P.BANDIDO && P.BANDIDO > P.PAYTABLE.M1) { const was = P.PAYTABLE.M1; P.PAYTABLE = { ...P.PAYTABLE, M1: P.BANDIDO, M1SUB: Math.round(1000 * (1 - Math.cbrt(was / P.BANDIDO))) }; }
    // v0.69 top600: natural Hold & Win results from TOPCUT.from (BU) kept TOPCUT.k as often; the RTP that frees goes to the
    // base game (the "Freed RTP" options). A band is split at the threshold first, so nothing below it changes.
    if (P.TOPCUT) { const sh = { ...P.SHAPES }, { from, k } = P.TOPCUT;
      for (const key of Object.keys(sh)) if (/^(standard|super)(_(base|double))?$/.test(key)) { let { edges, w } = sh[key];
        if (!edges.includes(from)) { const b = bandOf(edges, from); edges = [...edges.slice(0, b + 1), from, ...edges.slice(b + 1)]; w = [...w.slice(0, b + 1), w[b], ...w.slice(b + 1)]; }
        sh[key] = { edges, w: w.map((x, b) => (edges[b] >= from ? Math.round(x * k) : x)) }; }
      P.SHAPES = sh; }
    // v0.68 jpGD / topTrim / topLean: per-band factors for the bonus shapes they affect, keyed by shape name and edges
    if (P.SHAPEF) { const sh = { ...P.SHAPES };
      for (const fm of P.SHAPEF) for (const k of ['standard', 'super', 'buy', 'superbuy']) { const f = sh[k] && fm[`${k}:${sh[k].edges.join(',')}`];
        if (f) { const raw = sh[k].w.map((w, b) => w * f[b]), mx = Math.max(...raw); sh[k] = { edges: sh[k].edges, w: raw.map(x => Math.round(100000 * x / mx)) }; } }
      P.SHAPES = sh; }
    // v0.68 bonusOften / bonusRare: the natural bonus shapes (standard, super) tilted towards smaller / bigger totals
    // (weight x band-middle^theta), so a more / less frequent Hold & Win keeps the same share of the RTP
    if (P.TILT) { const sh = { ...P.SHAPES }; for (const k of Object.keys(sh)) if (/^standard(_(base|double))?$/.test(k)) sh[k] = tiltShape(sh[k], P.TILT); /* standard bonus only (a Super never pays under 90x) */ P.SHAPES = sh; }
    // v0.71 Mid wins (checklist 20a): Loco Spin results of 10x+ (bands from 1,000 BU) kept MIDW times as often; the RTP
    // that moves is taken from / given back to the bonus by the balance below
    if (P.MIDW) { const sh = { ...P.SHAPES };
      for (const k of Object.keys(sh)) if (/^loco/.test(k)) { const { edges, w } = sh[k], raw = w.map((x, b) => (edges[b] >= 1000 ? x * P.MIDW : x)), mx = Math.max(...raw);
        sh[k] = { edges, w: raw.map(x => Math.round(100000 * x / mx)) }; }
      P.SHAPES = sh; }
    // v0.71 Bonus spread "Volatile" (checklist 20c): natural bonus results spread away from the middle (weight x
    // exp(VOL.k x ln(band middle / VOL.at)^2)) - fewer middling bonuses, more small and big ones; average held by the balance
    if (P.VOL) { const sh = { ...P.SHAPES };
      for (const k of Object.keys(sh)) if (/^standard(_(base|double))?$/.test(k)) { const { edges, w } = sh[k];   /* the standard bonus only: the Super keeps its own spread */
        const raw = w.map((x, b) => { const mid = b + 1 < edges.length ? (edges[b] + edges[b + 1]) / 2 : edges[b] * 1.5; return x * Math.min(6, Math.exp(P.VOL.k * Math.log(Math.max(mid, 100) / P.VOL.at) ** 2)); }), mx = Math.max(...raw);
        sh[k] = { edges, w: raw.map(x => Math.round(100000 * x / mx)) }; if (P.VOL.tilt) sh[k] = tiltShape(sh[k], P.VOL.tilt); }
      P.SHAPES = sh; }
    // v0.71 (checklist 2): the final RTP balance. One small tilt per mode of the bonus-value spread (natural Hold & Win and
    // Super; Buy; Super Buy), sized from the RTP model so every combination lands near BALANCE.target. Tools can force it:
    // globalThis.__POCO_BAL = null (none) or { base, double, buy, superbuy }.
    const bal = globalThis.__POCO_BAL !== undefined ? globalThis.__POCO_BAL : balanceTilt(profile);
    if (bal) { const sh = { ...P.SHAPES };
      for (const m of ['base', 'double']) if (bal[m]) for (const k of ['standard', 'super']) sh[`${k}_${m}`] = tiltShape(sh[`${k}_${m}`] ?? sh[k], bal[m]);
      for (const m of ['buy', 'superbuy']) if (bal[m]) sh[m] = tiltShape(sh[m], bal[m]);
      P.SHAPES = sh; P.BAL = bal; }
    PARAMS[profile] = P;
  }
  return PARAMS[profile];
}

/**
 * v0.50 prize-led shapes (math 0.6.0). A bonus (or Loco Spin) is played in full by the rules above; the complete play
 * is then kept with a chance set by the band its total win falls in (`shape.w`, integer weights per band, kept with
 * chance w / max w), otherwise the whole play is drawn again. So totals follow the published shape while every result
 * shown is a complete, genuine play of the game. A band weight of 0 means that band is never kept (e.g. a Loco Spin
 * under its 5x minimum). `shape` null = natural odds (kept first time).
 */
/** v0.68: a shape with its band weights multiplied by (band middle / 100x)^theta, scaled back to a 100000 maximum */
export function tiltShape(shape, theta) {
  const e = shape.edges, raw = shape.w.map((w, b) => { const mid = b + 1 < e.length ? (e[b] + e[b + 1]) / 2 : e[b] * 1.5; return w * Math.min(12, Math.max(1 / 12, Math.pow(Math.max(mid, 100) / 10000, theta))); });   /* v0.68: capped, so a big start can still finish */
  const mx = Math.max(...raw); return { edges: e, w: raw.map(x => Math.round(100000 * x / mx)) };
}
export const bandOf = (edges, v) => { let b = 0; while (b + 1 < edges.length && v >= edges[b + 1]) b++; return b; };
const SHAPE_LIMIT = 1000000;
// v0.67: `valid` (optional) - a kept play that breaks a presentation rule (option bigFH) is replaced by another play from
// the SAME band that keeps it, so the spread of totals across bands is exactly what the shape publishes.
export function shapedDraw(rng, shape, draw, value, valid = null) {
  if (!shape) { let out = draw(), n = 1; if (valid) while (!valid(out) && n < SHAPE_LIMIT) { out = draw(); n++; } return { out, draws: n }; }
  let max = 0; for (const w of shape.w) if (w > max) max = w;
  for (let n = 1; n <= SHAPE_LIMIT; n++) {
    const out = draw();
    const b = bandOf(shape.edges, Math.min(value(out), MAX_WIN_BU)), w = shape.w[b];
    if (w > 0 && (w === max || rng.int(max) < w)) {
      if (!valid || valid(out)) return { out, draws: n };
      for (let m = n + 1; m <= SHAPE_LIMIT * 4; m++) { const o2 = draw();
        if (valid(o2) && bandOf(shape.edges, Math.min(value(o2), MAX_WIN_BU)) === b) return { out: o2, draws: m }; }
      throw new Error('shapedDraw: no valid play in the band');
    }
  }
  throw new Error('shapedDraw: no result kept'); // statistically unreachable (every shape keeps a common band)
}

/** Draw a coin. Cash values are scaled by `scale` per mille (rounded to 10 BU); jackpots carry their key. */
function drawCoin(rng, tableName, scale = 1000) {
  const pick = pickWeighted(rng, COIN_TABLES[tableName]);
  if (typeof pick === 'string') return { v: JACKPOTS[pick], jp: pick };
  return { v: scale === 1000 ? pick : Math.max(10, Math.round(pick * scale / 10000) * 10), jp: null };
}
const featureTable = held => (held <= 5 ? 'early' : held <= 7 ? 'late' : 'last');
/** Coin table for a coin landing on a multiplier frame: jackpot weights scaled by `k` per mille (stated rule). */
function framedTable(name, k) {
  const key = `${name}~${k}`;
  if (!COIN_TABLES[key]) COIN_TABLES[key] = COIN_TABLES[name].map(([v, w]) => [v, typeof v === 'string' ? Math.round(w * k / 1000) : w]).filter(([, w]) => w > 0);
  return key;
}

/** Spin the 3 reels. Returns stops and the 10 visible symbols in cell order. */
export function spinReels(rng, stripSet) {
  const strips = STRIPS[stripSet];
  const stops = strips.map(s => rng.int(s.length));
  const symbols = [];
  strips.forEach((strip, r) => {
    for (let row = 0; row < REEL_ROWS[r]; row++) symbols.push(strip[(stops[r] + row) % strip.length]);
  });
  return { stops, symbols };
}

/** Evaluate the 10 lines. 3-of-a-kind only, Wild substitutes for everything but Coins. */
export function evalLines(symbols, mult = 1, pays = PAYTABLE) {   // v0.66: a version can have its own paytable
  const wins = [];
  let total = 0;
  LINES.forEach((rows, li) => {
    const cells = rows.map((row, r) => cellIndex(r, row));
    const syms = cells.map(c => symbols[c]);
    if (syms.includes('C') || syms.includes('K')) return;   // coins and collector pots never pay on a line
    const target = syms.find(s => s !== 'W') ?? 'W';
    if (!syms.every(s => s === target || s === 'W')) return;
    const win = pays[target] * mult;
    total += win;
    wins.push({ line: li, symbol: target, cells, win });
  });
  return { wins, total };
}

const coinList = held => [...held.entries()].sort((a, b) => a[0] - b[0]).map(([cell, c]) => ({ cell, ...c }));

function randomEmptyCells(rng, held, k, avoid = null) {   // v0.67: `avoid` - cells Coin Save must not use (Loco Wilds)
  const empties = [];
  for (let c = 0; c < CELL_COUNT; c++) if (!held.has(c) && !avoid?.has(c)) empties.push(c);
  const out = [];
  for (let i = 0; i < k && empties.length; i++) out.push(empties.splice(rng.int(empties.length), 1)[0]);
  return out;
}
const freeFrameCells = frames => { const f = []; for (let c = 0; c < CELL_COUNT; c++) if (!frames.has(c)) f.push(c); return f; };
const nextStep = (m, max) => { const i = FRAME_LADDER.indexOf(m); const n = FRAME_LADDER[i + 1]; return n && n <= max ? n : m; };

/**
 * Hold & Win (math 0.4.0). `startCoins`: Map(cell -> {v, jp}).
 * opts: { super: bool, buy: bool, extraOpeningFrames, P: params }
 * Every respin that lands a coin restores the lives; a dead respin costs one; Coin Save may rescue the last life.
 * Ends when the lives run out or all 10 positions fill (Full House: the whole win is multiplied).
 *
 * 0.4.0 changes (agreed 24 Oct):
 *  - frame step-ups are delivered by the skull: a coin landing on a frame lands at the frame's current value and the
 *    skull steps that frame up on a later respin (one per respin). Any step-up still waiting is applied before the
 *    collect (`finalLevels`). Every frame ends at the same value as before, so this changes timing, not payout.
 *  - a jackpot grown by the skull doubles (MINI 20 -> 40 etc.); once per plaque in a standard bonus, up to x4 in Super.
 *  - collector coin: lands like any coin (never on a frame); on landing it takes the current value of every coin on
 *    the grid (frames and jackpots included, an earlier collector's total included) as its own value, paid at the end.
 *    Replaces the Super skull's hidden grid collect.
 *  - big frames dropped by the skull go mainly to empty positions, so they must still be won.
 */
export function playFeature(rng, startCoins, opts = {}) {
  const P = opts.P ?? params();
  // A bought bonus has its own shape (MODES.buy.feature + its own coin tables). A Super buy plays the Super bonus.
  const F = opts.buy && P.MODES.buy.feature ? merge(P.FEATURE, P.MODES.buy.feature) : P.FEATURE, S = P.SUPER;
  // 0.4.1: coin values are never rescaled: every coin shows a value from the stated list, and the coins that start a
  // bonus keep their value. Each bonus type tunes its value through its own coin tables (weights), not a hidden scale.
  const TBL = (opts.buy && P.MODES.buy.tables) || (opts.super && S.tables) || F.tables || { early: 'early', late: 'late', last: 'last' };
  const tableFor = n => TBL[featureTable(n)];
  const isSuper = !!opts.super;
  const scale = 1000;
  // 0.8.0: the Super's own touches turn up now and then in a standard bonus too (a 4th life, a x10 opening frame).
  // They change how a round plays, not the published payout shape (SHAPES keeps the totals).
  const SP = !isSuper && F.sprinkle;
  const fourthLife = !!SP && chance(rng, SP.fourthLife, 1000);
  const bigOpen = !!SP && chance(rng, SP.bigOpen.num, 1000) ? pickWeighted(rng, SP.bigOpen.mult) : 0;
  const lives0 = isSuper ? S.lives : F.lives + (fourthLife ? 1 : 0);
  const maxFrames = isSuper ? S.max : F.frames.max;
  const levelMax = isSuper ? S.levelMax : F.levelMax;
  const multJp = isSuper ? (S.multiplyJackpots ?? F.multiplyJackpots) : F.multiplyJackpots;
  const avoidJp = isSuper ? S.framesAvoidJackpots : F.framesAvoidJackpots;
  const framedJp = isSuper ? S.framedJackpots : F.framedJackpots;
  const maxDoubles = isSuper ? S.jackpotDoubles : F.jackpotDoubles;
  const COL = isSuper ? S.collector : F.collector;

  const held = new Map([...startCoins].map(([c, coin]) => [c, { v: coin.v, jp: coin.jp }]));   // start coins keep their value
  const frames = new Map(); // cell -> multiplier
  const jackpots = { ...JACKPOTS };
  const doubles = { MINI: 0, MINOR: 0, MAJOR: 0, GRAND: 0 };
  const respins = [];
  const pending = []; // cells whose frame the skull will step up (a coin landed on it)
  const POTB = P.POTS?.bonus?.count ? P.POTS.bonus : null;   // pot collectors (client 3 Nov): the Full House is fixed (x2)
  let fullHouseMult = POTB ? POTB.fh : isSuper ? S.fullHouseStart : F.fullHouseMult;
  let endReason = 'dead';
  let collectors = 0;

  const openingFrames = [];
  // Frames: never on a collector; x`avoidJp`+ never on a held jackpot; big frames (`bigOnEmpty.from`+) mainly on empty cells.
  const placeFrame = (mult, bigOnEmpty) => {
    if (frames.size >= maxFrames) return null;
    let free = freeFrameCells(frames).filter(c => !held.get(c)?.col && !(avoidJp && mult >= avoidJp && held.get(c)?.jp));
    if (bigOnEmpty && mult >= bigOnEmpty.from) { const empty = free.filter(c => !held.has(c));
      if (empty.length && chance(rng, bigOnEmpty.num, 1000)) free = empty; }
    if (!free.length) return null;
    const cell = free[rng.int(free.length)];
    frames.set(cell, mult);
    return { cell, mult };
  };
  const openSets = isSuper && ((opts.superBuy && S.openingFrames.setsBuy) || S.openingFrames.sets);
  if (openSets) {   // v0.62j (client): the Super opens with one of several sets of equal value (variety)
    const set = pickWeighted(rng, openSets);
    for (const m of set) { const f = placeFrame(m); if (f) openingFrames.push(f); }
  } else if (isSuper) {
    const n = pickWeighted(rng, S.openingFrames.count);
    for (let k = 0; k < n; k++) {
      const f = placeFrame(pickWeighted(rng, k === 0 ? S.openingFrames.first : S.openingFrames.mult));
      if (f) openingFrames.push(f);
    }
  } else {
    const ex = opts.extraOpeningFrames;
    const n = pickWeighted(rng, F.openingFrames.count) + (Array.isArray(ex) ? pickWeighted(rng, ex) : (ex || 0));
    for (let k = 0; k < n; k++) {
      const f = placeFrame(k === 0 && bigOpen ? bigOpen : pickWeighted(rng, F.openingFrames.mult));
      if (f) openingFrames.push(f);
    }
  }
  const canDouble = jp => doubles[jp] < maxDoubles && !JACKPOT_FIXED.includes(jp);   // 0.8.0: the GRAND never doubles
  // 0.5: upgrade stories. When a jackpot coin is already on the grid, the skull mostly doubles that one (`heldPick` per
  // mille), so a held MINOR becomes worth a MAJOR; otherwise it picks from `which`.
  const heldPick = isSuper ? (S.jackpotHeldPick ?? 0) : (F.jackpotHeldPick ?? 0);
  const doubleJackpot = which => { // pick a plaque that can still double; null if none can
    const onGrid = [...new Set([...held.values()].filter(c => c.jp && canDouble(c.jp)).map(c => c.jp))];
    let opts2 = which.filter(([jp]) => canDouble(jp));
    if (onGrid.length && chance(rng, heldPick, 1000)) opts2 = onGrid.map(jp => [jp, (which.find(([j]) => j === jp)?.[1] || 1)]);
    if (!opts2.length) return null;
    const jp = pickWeighted(rng, opts2);
    const a = { type: 'jackpot', jp, from: jackpots[jp], to: jackpots[jp] * 2 };
    jackpots[jp] *= 2; doubles[jp]++;
    return a;
  };
  let openingJackpot = null;
  if (isSuper) { const a = doubleJackpot(S.openingJackpot); openingJackpot = { jp: a.jp, from: a.from, to: a.to }; }

  const coinValue = (cell, c) => (c.jp ? jackpots[c.jp] : c.v) * (!c.jp || multJp ? (frames.get(cell) ?? 1) : 1);
  const stepUp = cell => { const m = frames.get(cell), to = nextStep(m, levelMax); if (to === m) return null; frames.set(cell, to); return { cell, from: m, to }; };

  let lives = lives0;
  while (true) {
    if (held.size >= CELL_COUNT) { endReason = 'full'; break; }
    const index = respins.length + 1;
    const actions = []; // skull actions this respin, in order (shown before the cells spin)

    // 1) The skull delivers one waiting frame step-up (a coin landed on that frame earlier).
    while (pending.length) { const a = stepUp(pending.shift()); if (a) { actions.push({ type: 'level', ...a, coin: true }); break; } }

    // 2) Standard bonus: the skull may drop a frame (more likely later) or double a jackpot.
    let frame = null;
    if (!isSuper) {
      const num = Math.min(F.frames.start + F.frames.perRespin * (index - 1), F.frames.cap);
      if (frames.size < maxFrames && chance(rng, num, F.frames.den)) {
        frame = placeFrame(pickWeighted(rng, F.frames.mult), F.frames.bigOnEmpty);
        if (frame) actions.push({ type: 'frame', ...frame });
      }
      if (chance(rng, F.jackpotGrow.num, F.jackpotGrow.den)) { const a = doubleJackpot(F.jackpotGrow.which); if (a) actions.push(a); }
    }

    // 3) Each empty cell spins individually. A landing coin may be a collector (more likely as the grid fills).
    const p = (isSuper && S.cellHit?.byHeld[held.size]) || F.cellHit.byHeld[held.size];
    const table = tableFor(held.size);
    const colNum = COL?.byHeld[held.size] ?? 0;
    const landed = [];
    for (let c = 0; c < CELL_COUNT; c++) {
      if (held.has(c)) continue;
      if (rng.int(F.cellHit.den) >= p) continue;
      if (colNum && !frames.has(c) && collectors < COL.max && chance(rng, colNum, 1000)) { landed.push({ cell: c, v: 0, jp: null, col: true }); collectors++; continue; }
      landed.push({ cell: c, ...drawCoin(rng, frames.has(c) && framedJp ? framedTable(table, framedJp[frames.get(c)] ?? 1000) : table, scale) });
    }
    for (const l of landed) if (frames.has(l.cell) && nextStep(frames.get(l.cell), levelMax) !== frames.get(l.cell)) pending.push(l.cell);

    // 4) Lives and Coin Save.
    let rescued = [];
    let rescueFail = false;
    if (landed.length) lives = lives0;
    else {
      lives--;
      if (lives === 0) {
        if (chance(rng, F.rescueDead.num, F.rescueDead.den)) {
          const k = pickWeighted(rng, F.rescueDead.add);
          rescued = randomEmptyCells(rng, held, k).map(cell => ({ cell, ...drawCoin(rng, tableFor(held.size), scale) }));
          lives = lives0;
        } else rescueFail = failTease(rng, F.rescueDead.num, F.rescueDead.den);
      }
    }
    for (const c of [...landed, ...rescued]) if (!c.col) held.set(c.cell, { v: c.v, jp: c.jp });
    // Collectors take the grid's current value (cell order; a later collector includes an earlier one's total).
    for (const c of landed) if (c.col) {
      let v = 0; const from = [];
      for (const [cell, h] of [...held.entries()].sort((a, b) => a[0] - b[0])) { const x = coinValue(cell, h); if (x > 0) { v += x; from.push(cell); } }
      c.v = v; c.from = from;
      held.set(c.cell, { v, jp: null, col: true });
    }
    const dead = !landed.length && !rescued.length;

    // 5) Super bonus: the skull acts as host. More often on dead respins; bigger actions late in the bonus.
    if (isSuper && held.size < CELL_COUNT && (lives > 0 || rescued.length)) {
      if (chance(rng, dead ? S.act.dead : S.act.landed, S.act.den)) {
        const late = held.size >= S.late.held || index >= S.late.respin;
        const phase = late ? 'late' : 'early';
        let type = pickWeighted(rng, S.actions[phase]);
        if (type === 'fullHouse' && (POTB || fullHouseMult >= FULL_HOUSE_STEPS[FULL_HOUSE_STEPS.length - 1])) type = 'jackpot';
        // the skull's own level-ups skip frames that still have a coin's step-up waiting (that one is delivered first)
        const can = [...frames.entries()].filter(([c, m]) => nextStep(m, levelMax) !== m && !pending.includes(c));
        if (type === 'level' && !can.length) type = 'frame';
        if (type === 'frame' && frames.size >= maxFrames) type = 'jackpot';
        if (type === 'frame') {
          const f = placeFrame(pickWeighted(rng, S.frameMult[phase]), S.bigOnEmpty);
          if (f) actions.push({ type: 'frame', ...f });
        } else if (type === 'level') {
          actions.push({ type: 'level', ...stepUp(can[rng.int(can.length)][0]) });
        } else if (type === 'jackpot') {
          const a = doubleJackpot(S.jackpotWhich[phase]); if (a) actions.push(a);
        } else if (type === 'fullHouse') {
          const to = FULL_HOUSE_STEPS[FULL_HOUSE_STEPS.indexOf(fullHouseMult) + 1];
          actions.push({ type: 'fullHouse', from: fullHouseMult, to });
          fullHouseMult = to;
        }
      }
    }

    respins.push({ index, frame, actions, landed, levelUps: [], rescued, rescueFail, held: held.size, dead, lives });
    if (lives === 0) break;
  }

  // Step-ups still waiting are delivered before the collect.
  const finalLevels = [];
  for (const cell of pending) { const a = stepUp(cell); if (a) finalLevels.push({ type: 'level', ...a, coin: true }); }

  // Collect, in cell order. Jackpots pay their plaque value at the end of the bonus.
  const collect = [];
  let coinTotal = 0;
  for (const c of coinList(held)) {
    const v = c.jp ? jackpots[c.jp] : c.v;
    const mult = c.col ? 1 : frames.get(c.cell) ?? 1;
    const applies = !c.jp || multJp;
    const win = v * (applies ? mult : 1);
    coinTotal += win;
    collect.push({ cell: c.cell, v, jp: c.jp, col: !!c.col, mult: applies ? mult : 1, win });
  }
  const beforeFullHouse = coinTotal;
  const full = endReason === 'full';
  const total = full ? beforeFullHouse * fullHouseMult : beforeFullHouse;

  return {
    super: isSuper,
    lives: lives0,
    sprinkle: isSuper ? null : { fourthLife, bigOpen },
    start: coinList(held).filter(c => startCoins.has(c.cell)),
    openingFrames,
    openingJackpot,
    respins,
    finalLevels,
    frames: [...frames.entries()].map(([cell, mult]) => ({ cell, mult })),
    jackpots,
    endReason,
    collect,
    collectors,
    skullPot: 0,
    fullHouse: { mult: fullHouseMult, applied: full, before: beforeFullHouse },
    total,
  };
}


/**
 * One base-game spin. Loco Spin (v0.50): the Mariachi turns the middle reel fully Wild, adds 0-3 extra Wilds on random
 * outer-reel positions (never on a coin), and a multiplier (x2-x10) applies to the spin's line wins.
 */
/** v0.71: the share of full curtains redrawn (per 1000), Curtain rate's and Curtain reveals' thinning combined */
export const curtainThin = MY => { const a = (MY.thin || 0) / 1000, b = (MY.thinMix || 0) / 1000; return Math.round(1000 * (1 - (1 - a) * (1 - b))); };
export function baseSpin(rng, M, L, loco, MY = MYSTERY, pays = PAYTABLE) {
  const { stops, symbols } = spinReels(rng, M.strips);
  // v0.71 Bandido pays: some Bandidos land as a Guitar or a Gold Ring instead (fewer, bigger Bandido lines; hit rate held)
  if (pays.M1SUB) for (let c = 0; c < symbols.length; c++) if (symbols[c] === 'M1' && rng.int(1000) < pays.M1SUB) symbols[c] = rng.int(2) ? 'L1' : 'L2';
  // 0.8.0: Mystery reveal - every Q on screen becomes one symbol (before the Loco Spin, which may turn some Wild).
  // `bigFrom`+ Mystery symbols on screen reveal from `revealBig` (v0.66: not used - every reveal is from `reveal`).
  let mystery = null;
  // v0.66: a curtain landing anywhere on a reel draws across that whole reel (coins and Wilds stay) - curtains always
  // come as a full-reel block. `landed` keeps the cells the strips actually showed as curtains.
  const landed = []; symbols.forEach((s, c) => { if (s === 'Q') landed.push(c); });
  if (MY.expandReel && landed.length) for (let r = 0; r < 3; r++) {
    const c0 = cellIndex(r, 0);
    let any = false; for (let row = 0; row < REEL_ROWS[r]; row++) if (symbols[c0 + row] === 'Q') any = true;
    if (any) for (let row = 0; row < REEL_ROWS[r]; row++) if (symbols[c0 + row] !== 'C' && symbols[c0 + row] !== 'W') symbols[c0 + row] = 'Q';
  }
  // v0.66e double-curtain options (dbl22 / dbl36): a curtain on a single reel spreads to a neighbouring reel with chance
  // spread / 1000 (the middle reel spreads left or right at random), so two-reel curtains are common, not 1 in 440.
  if (MY.spread && landed.length) {
    const rs = [0, 1, 2].filter(r => { const c0 = cellIndex(r, 0); for (let row = 0; row < REEL_ROWS[r]; row++) if (symbols[c0 + row] === 'Q') return true; return false; });
    if (rs.length === 1 && rng.int(1000) < MY.spread) {
      const r = rs[0], nb = r === 1 ? (rng.int(2) ? 0 : 2) : 1, c0 = cellIndex(nb, 0);
      for (let row = 0; row < REEL_ROWS[nb]; row++) if (symbols[c0 + row] !== 'C' && symbols[c0 + row] !== 'W') symbols[c0 + row] = 'Q';
    }
  }
  // v0.68 curtOften: on a spin with no curtain from the reels, an extra full-reel curtain draws across one random reel
  // (MY.extra.num per 1000), revealing from the modest table (MY.extra.reveal) - more curtains, the same payout
  let extraCurtain = false, extraPrem = false;
  // v0.69 freed RTP -> "More curtains": extra full-reel curtains with the normal premium reveal
  const xPrem = (MY.extraPremium || 0) + (MY.extraMix || 0);   // v0.71: + the Curtain reveals options' extra curtains
  if (!extraCurtain && xPrem && !landed.length && rng.int(1000) < xPrem) {
    const r = rng.int(3), c0 = cellIndex(r, 0);
    for (let row = 0; row < REEL_ROWS[r]; row++) if (symbols[c0 + row] !== 'C' && symbols[c0 + row] !== 'W') symbols[c0 + row] = 'Q';
    extraPrem = true;
  }
  if (!extraPrem && MY.extra && !landed.length && rng.int(1000) < MY.extra.num) {
    const r = rng.int(3), c0 = cellIndex(r, 0); extraCurtain = true;
    for (let row = 0; row < REEL_ROWS[r]; row++) if (symbols[c0 + row] !== 'C' && symbols[c0 + row] !== 'W') symbols[c0 + row] = 'Q';
  }
  // v0.71 Curtain rate "Often · small blocks": on a spin with no curtain, a small curtain block (2-3 squares of one reel)
  // MY.small.num per 1000, revealing from MY.small.reveal (mostly low symbols) - Golden Dragon-style texture
  let smallCurtain = false;
  if (MY.small && !landed.length && !extraCurtain && !extraPrem && !symbols.includes('Q') && rng.int(1000) < MY.small.num) {
    const r = rng.int(3), rows = REEL_ROWS[r], n = Math.min(rows, 2 + rng.int(2)), top = rng.int(rows - n + 1), c0 = cellIndex(r, 0);
    for (let row = top; row < top + n; row++) if (symbols[c0 + row] !== 'C' && symbols[c0 + row] !== 'W') { symbols[c0 + row] = 'Q'; smallCurtain = true; }
  }
  const qCells = []; symbols.forEach((s, c) => { if (s === 'Q') qCells.push(c); });
  if (qCells.length) {
    // v0.66e: curtains over two or more reels reveal from `revealTwo` when the option sets one (the Catrina), so common
    // doubles cost about what rare ones did
    const nReels = new Set(qCells.map(c => (c < 3 ? 0 : c < 7 ? 1 : 2))).size;
    let tbl = smallCurtain ? MY.small.reveal : extraCurtain ? MY.extra.reveal : extraPrem ? MY.reveal : nReels > 1 && MY.revealTwo ? MY.revealTwo : qCells.length >= (MY.bigFrom ?? 99) ? MY.revealBig : MY.reveal;
    if (MY.wildX && !smallCurtain) tbl = tbl.map(([s0, w]) => [s0, s0 === 'W' ? w * MY.wildX : w]);   // v0.71 fPay
    if (MY.screenBoost) {   // symbols already on screen are more likely (1 + boost x count)
      const cnt = {}; for (const s0 of symbols) cnt[s0] = (cnt[s0] || 0) + 1;
      tbl = tbl.map(([s0, w]) => [s0, w * (1 + MY.screenBoost * (cnt[s0] || 0))]);
    }
    // v0.71 Curtain rate "Rare · always pays": the reveal is drawn only from symbols that make a line win with what is
    // already on screen (if none can, from the whole table)
    if (MY.connect && !smallCurtain) { const ok = tbl.filter(([s0]) => { const t = symbols.slice(); for (const c of qCells) t[c] = s0; return evalLines(t, 1, pays).total > 0; });
      if (ok.length) tbl = ok; }
    const sym = pickWeighted(rng, tbl);
    for (const c of qCells) symbols[c] = sym;
    mystery = { cells: qCells, symbol: sym, landed, ...(extraCurtain ? { extra: true } : {}), ...(extraPrem ? { extra: true, prem: true } : {}), ...(smallCurtain ? { small: true } : {}) };
  }
  let locoInfo = null, mult = 1;
  if (loco) {
    for (let c = 3; c < 7; c++) symbols[c] = 'W';
    const outer = [0, 1, 2, 7, 8, 9].filter(c => symbols[c] !== 'C' && symbols[c] !== 'W');
    const k = Math.min(pickWeighted(rng, L.wilds), outer.length), wilds = [];
    for (let i = 0; i < k; i++) wilds.push(outer.splice(rng.int(outer.length), 1)[0]);
    wilds.sort((a, b) => a - b);
    const under = wilds.map(c => symbols[c]);   // what the Mariachi turned Wild (the client shows it, then the change)
    for (const c of wilds) symbols[c] = 'W';
    mult = pickWeighted(rng, L.mult);
    locoInfo = { mult, wilds, under };
  }
  const coins = new Map();
  symbols.forEach((s, c) => { if (s === 'C') coins.set(c, drawCoin(rng, 'base')); });
  let lines = evalLines(symbols, mult, pays);
  // v0.69 freed RTP -> "Bigger curtain wins": a paying curtain spin (no Loco Spin) doubles its win MY.curtainX2 per 1000
  if (mystery && !loco && MY.curtainX2 && lines.total > 0 && rng.int(1000) < MY.curtainX2) { mystery.mult = 2; lines = evalLines(symbols, 2, pays); }
  return { stops, symbols, coins, lines, locoInfo, mystery };
}

const naturalStart = (rng, M) => { // 4-6 coins from the base table, as a natural trigger lands (Super buy)
  const n = pickWeighted(rng, M.startCoins), start = new Map();
  for (const cell of randomEmptyCells(rng, start, n)) start.set(cell, drawCoin(rng, M.coinTable));
  return start;
};

/**
 * Play one complete round.
 * @param rng   object with int(n)
 * @param mode  'base' | 'double' | 'buy' | 'superbuy'
 * @param opts  { profile: 'standard'|'pace' }
 * @returns round record; all values in BU (1/100 of base bet). `costPct` is the stake as % of base bet.
 *
 * 0.8.0: 4+ coins (after Coin Save) start Hold & Win; SUPER.upgrade of them are Super Hold & Wins.
 */
/**
 * v0.67 (checklist 7): the final coin always gets a respin of its own. When a drawn play fills the grid with two or more
 * coins on one respin (no Coin Save involved), it is laid out as two respins: every coin but the last lands on the first
 * (the lives reset, as on any landing) and the last lands on an added respin with nothing else happening. Same coins,
 * values, frames, jackpots and total: only the record's respin list changes, after the draw. Returns the feature.
 */
export function splitFinalCoin(F) {
  if (!F || F.endReason !== 'full') return F;
  const i = F.respins.findIndex(rs => rs.held === 10);
  if (i < 0) return F;
  const rs = F.respins[i];
  if (!rs.landed || rs.landed.length < 2 || rs.rescued?.length) return F;
  const last = rs.landed[rs.landed.length - 1];
  const first = { ...rs, landed: rs.landed.slice(0, -1), held: 9, dead: false, lives: rs.lives };
  const added = { index: rs.index + 1, frame: rs.frame, actions: [], landed: [last], levelUps: [], rescued: [], rescueFail: false,
    held: 10, dead: false, lives: rs.lives, split: true };
  const respins = [...F.respins.slice(0, i), first, added, ...F.respins.slice(i + 1).map(r => ({ ...r, index: r.index + 1 }))];
  return { ...F, respins };
}

/** v0.67 option 'bigFH': a Full House (and a standard bonus's 4th life) only on a bonus paying at least `thr` BU. */
const bigOnlyOk = (P, f, thr) => { const B = P.FEATURE.bigOnly; if (!B) return true;
  if (f.fullHouse?.applied && f.total < thr) return false;
  if (!f.super && f.lives > P.FEATURE.lives && f.total < thr) return false;
  return true; };
const bigOnly = (P, thr) => (P.FEATURE.bigOnly ? f => bigOnlyOk(P, f, thr) : null);
/** v0.67: the bonus rule for a mode (option bigFH), for tools that draw bonuses themselves (par63). */
export const featureRule = (P, mode) => bigOnly(P, mode === 'buy' || mode === 'superbuy' ? Math.round(P.MODES[mode].costPct * (P.FEATURE.bigOnly?.buyPct ?? 150) / 100) : (P.FEATURE.bigOnly?.betBU ?? 12000));

/**
 * Pot collectors (client 3 Nov 09:21). A presentation of the same bonus: every multiplier (at its final value) and every
 * jackpot doubling is awarded at the start; 1-3 of the coins that land become collector pots, each taking the value of
 * every coin on the grid as it lands (multipliers and jackpots included, an earlier pot included). Values MOVE into the pot
 * (the collected coins pay nothing more), so the total is unchanged - except option potMk, where each collection adds
 * POTS.bonus.extra per mille of what it collected (the Full House x2 make-back). Integer BU only.
 */
export function potify(F, rng, P) {
  const PB = P.POTS?.bonus; if (!F || !PB?.count) return F;
  const frameCells = new Set(F.frames.map(f => f.cell)), win = new Map(F.collect.map(c => [c.cell, c.win]));
  const jpStart = []; const respins = F.respins.map(rs => {
    const actions = []; for (const a of rs.actions || []) { if (a.type === 'jackpot') jpStart.push(a); else if (a.type !== 'frame' && a.type !== 'level') actions.push(a); }
    return { ...rs, actions, frame: null }; });
  // the coins that can become a pot: landed in a respin, not on a multiplier, not a jackpot
  const cands = []; respins.forEach((rs, i) => { const ok = rs.landed.filter(l => !l.col && !l.jp && !frameCells.has(l.cell)); if (ok.length) cands.push(i); });
  const k = Math.min(cands.length, pickWeighted(rng, PB.count)), chosen = new Map();
  // later spins weigh more (index + 2), so pots come early (small) and late (big) about equally often
  const pool = cands.slice(); for (let n = 0; n < k; n++) { const i = pickWeighted(rng, pool.map(x => [x, (x + 2) * (x + 2)])); pool.splice(pool.indexOf(i), 1);
    const ok = respins[i].landed.filter(l => !l.col && !l.jp && !frameCells.has(l.cell)); chosen.set(i, ok[rng.int(ok.length)].cell); }
  const grid = new Map(F.start.map(c => [c.cell, win.get(c.cell) ?? 0])), pots = new Map(), taken = new Set();
  const collectAt = (cell, own) => { const from = []; let coll = 0;
    for (const [c, v] of [...grid.entries()].sort((a, b) => a[0] - b[0])) { if (c === cell || taken.has(c)) continue; if (v > 0 || pots.has(c)) { from.push({ cell: c, v, pot: pots.has(c) }); coll += v; taken.add(c); grid.set(c, 0); pots.delete(c); } }
    const extra = PB.extra ? Math.floor(coll * PB.extra / 1000) : 0, value = own + coll + extra;
    grid.set(cell, value); pots.set(cell, value); return { cell, own, from, collected: coll, extra, value }; };
  respins.forEach((rs, i) => {
    for (const l of [...rs.landed, ...(rs.rescued || [])]) grid.set(l.cell, win.get(l.cell) ?? 0);
    if (chosen.has(i)) { const cell = chosen.get(i); rs.pot = collectAt(cell, win.get(cell) ?? 0); }
  });
  // every bonus has a pot: if none landed, one lands on an empty square after the last spin and collects the grid
  let endPot = null;
  if (!pots.size) { const empty = []; for (let c = 0; c < CELL_COUNT; c++) if (!grid.has(c)) empty.push(c);
    if (empty.length) endPot = collectAt(empty[rng.int(empty.length)], 0);
    else { // a full grid where every landing was on a multiplier or a jackpot: the last such coin (not a jackpot) is the pot
      for (let i = respins.length - 1; i >= 0 && !pots.size; i--) { const ok = respins[i].landed.filter(l => !l.col && !l.jp);
        if (ok.length) { const cell = ok[ok.length - 1].cell; endPot = collectAt(cell, win.get(cell) ?? 0); endPot.replace = true; } } } }   // the coin there turns into the pot
  // the collection: pots pay what they hold, collected coins nothing, the rest as before
  const collect = []; let before = 0;
  for (const c of F.collect) { if (pots.has(c.cell)) continue; const w = taken.has(c.cell) ? 0 : c.win; before += w; collect.push(taken.has(c.cell) ? { ...c, win: 0, taken: true } : c); }
  for (const [cell, v] of pots) { before += v; collect.push({ cell, v, jp: null, col: false, pot: true, mult: 1, win: v }); }
  collect.sort((a, b) => a.cell - b.cell);
  const full = F.fullHouse.applied, total = full ? before * F.fullHouse.mult : before;
  return { ...F, respins, finalLevels: [], openingFrames: F.frames.map(f => ({ ...f })), openingJackpots: jpStart, endPot, collect,
    pots: [...pots.keys()], fullHouse: { ...F.fullHouse, before }, total, potsMode: true };
}
/** Pot collectors, base game: a pot win (a pot lands; the coins on the reels pay their values into it) or a pot tease
 *  (a pot lands, no coins - nothing changes). Coins in a pot spin never start the bonus (at most 3). Integer BU only. */
function potBase(rng, sp, PBs, pays) {
  if (sp.locoInfo || sp.nearAdded !== undefined) return;
  const reelOf = c => (c < 3 ? 0 : c < 7 ? 1 : 2), free = r => { const out = []; for (let row = 0; row < REEL_ROWS[r]; row++) { const c = cellIndex(r, row); if (sp.symbols[c] !== 'W' && sp.symbols[c] !== 'C') out.push(c); } return out; };
  const mult = sp.mystery?.mult ?? 1;
  if (sp.coins.size <= 2 && rng.int(1000) < PBs.win) {
    const r = pickWeighted(rng, PBs.col), cells = free(r); if (!cells.length) return;
    const potCell = cells[rng.int(cells.length)]; sp.symbols[potCell] = 'K';
    const want = Math.max(1, Math.min(3 - sp.coins.size, pickWeighted(rng, PBs.coins)));
    const spots = []; for (let c = 0; c < CELL_COUNT; c++) if (reelOf(c) !== r && sp.symbols[c] !== 'W' && sp.symbols[c] !== 'C' && sp.symbols[c] !== 'K') spots.push(c);
    for (let n = 0; n < want && spots.length; n++) { const c = spots.splice(rng.int(spots.length), 1)[0]; sp.symbols[c] = 'C'; sp.coins.set(c, null); }
    for (const c of sp.coins.keys()) sp.coins.set(c, drawCoin(rng, PBs.table));
    sp.lines = evalLines(sp.symbols, mult, pays);
    const coins = [...sp.coins.entries()].sort((a, b) => a[0] - b[0]).map(([cell, c]) => ({ cell, ...c }));
    sp.pot = { cell: potCell, coins, value: coins.reduce((a, c) => a + c.v, 0) };
    return; }
  if (!sp.coins.size && rng.int(1000) < PBs.tease) {
    const r = pickWeighted(rng, PBs.teaseCol), cells = free(r);
    while (cells.length) { const c = cells.splice(rng.int(cells.length), 1)[0], t = sp.symbols.slice(); t[c] = 'K';
      if (evalLines(t, mult, pays).total === sp.lines.total) { sp.symbols[c] = 'K'; sp.lines = evalLines(sp.symbols, mult, pays); sp.pot = { cell: c, coins: [], value: 0, tease: true }; return; } } }
}

export function playRound(rng, mode = 'base', opts = {}) {
  const P = params(opts.profile ?? 'standard');
  const M = P.MODES[mode];
  if (!M) throw new Error(`unknown mode ${mode}`);
  const round = { mathVersion: MATH_VERSION, mode, profile: opts.profile ?? 'standard', costPct: M.costPct,
    base: null, feature: null };
  let lineWin = 0;

  if (mode === 'buy') {
    const thr = Math.round(M.costPct * (P.FEATURE.bigOnly?.buyPct ?? 150) / 100);   // v0.67 bigFH: 1.5x the price
    const { out, draws } = shapedDraw(rng, P.SHAPES.buy,
      () => playFeature(rng, naturalStart(rng, M), { P, buy: true, extraOpeningFrames: M.extraOpeningFrames }), f => f.total, bigOnly(P, thr));
    round.feature = { ...out, draws };
  } else if (mode === 'superbuy') {
    const thr = Math.round(M.costPct * (P.FEATURE.bigOnly?.buyPct ?? 150) / 100);
    const { out, draws } = shapedDraw(rng, P.SHAPES.superbuy, () => playFeature(rng, naturalStart(rng, M), { P, super: true, superBuy: true }), f => f.total, bigOnly(P, thr));
    round.feature = { ...out, draws };
  } else {
    const L = P.LOCO;
    const loco = M.loco && chance(rng, L.num, L.den);
    // A Loco Spin is shaped like a bonus (SHAPES.loco_<mode> / SHAPES.loco).
    const { out: spin, draws: locoDraws } = loco
      // v0.67 loco34: its shapes are per reel set (L.shapeSet)
      ? shapedDraw(rng, (L.shapeSet && P.SHAPES[`${L.shapeSet}_${M.strips}`]) ?? P.SHAPES[`loco_${mode}`] ?? P.SHAPES.loco, () => baseSpin(rng, M, L, true, P.MYSTERY, P.PAYTABLE), sp => sp.lines.total)
      : { out: (() => { let sp = baseSpin(rng, M, L, false, P.MYSTERY, P.PAYTABLE);
          // v0.68 bonusRare: a share of natural triggers (TRIG.thin per 1000) is redrawn as a whole new spin
          while (P.TRIG?.thin && sp.coins.size >= FEATURE.triggerCount && rng.int(1000) < (mode === 'double' ? P.TRIG.thinDouble ?? P.TRIG.thin : P.TRIG.thin)) sp = baseSpin(rng, M, L, false, P.MYSTERY, P.PAYTABLE);
          // v0.71 Curtain rate "Rare · always pays": a share of full curtains (MYSTERY.thin per 1000) is redrawn as a whole
          // new spin, so curtains are rarer while each one is worth more (curtains keep their share of the RTP)
          const cThin = curtainThin(P.MYSTERY);
          for (let g = 0; g < 6 && cThin && sp.mystery && !sp.mystery.small && rng.int(1000) < cThin; g++) sp = baseSpin(rng, M, L, false, P.MYSTERY, P.PAYTABLE);
          // v0.71 Near misses (checklist 20b): a spin with two coins (no Loco Spin) gets a third, non-paying coin NEAR.num per
          // 1000, on a square where it changes no line win. These added near misses are never Coin Saved and light no
          // candle, so the Coin Save and Hold & Win frequencies stay as they are.
          const nNum = P.NEAR && (mode === 'double' ? P.NEAR.numDouble ?? P.NEAR.num : P.NEAR.num);
          if (nNum && sp.coins.size === FEATURE.triggerCount - 2 && rng.int(1000) < nNum) {
            const free = []; sp.symbols.forEach((s0, c) => { if (s0 !== 'C' && s0 !== 'W' && !sp.mystery?.cells.includes(c)) free.push(c); });
            while (free.length) { const c = free.splice(rng.int(free.length), 1)[0], t = sp.symbols.slice(); t[c] = 'C';
              if (evalLines(t, sp.mystery?.mult ?? 1, P.PAYTABLE).total === sp.lines.total) { sp.symbols[c] = 'C'; sp.coins.set(c, drawCoin(rng, 'base')); sp.nearAdded = c; break; } }
          }
          if (P.POTS?.base?.win != null) potBase(rng, sp, P.POTS.base, P.PAYTABLE);   // pot collectors: pot wins and pot teases
          return sp; })(), draws: 0 };
    const { stops, symbols, coins, lines, locoInfo, mystery } = spin;
    lineWin = lines.total + (spin.pot?.value ?? 0);   // a pot win pays with the spin

    // v0.64 'super=meter': the candle meter (stored per player, mode and stake by the RGS; passed in as opts.meter).
    const MT = P.METER;
    let meter = null, before = null, candle = null, filled = false;
    if (MT) {
      const N = MT.candles[M.strips] ?? MT.candles[mode], m0 = opts.meter || {};   // v0.66: per reel set
      let lit = Math.floor(Number(m0.lit) || 0); const n0 = Math.floor(Number(m0.n) || 0);
      if (n0 && n0 !== N) lit = Math.floor((lit * N) / n0);
      meter = { lit: Math.max(0, Math.min(N, lit)), n: N }; before = { ...meter };
    }
    let rescue = null;
    let rescueFail = false;
    if (coins.size === FEATURE.triggerCount - 1 && !spin.pot) {
      if (spin.nearAdded === undefined && chance(rng, M.rescue3Num, FEATURE.rescue3.den)) {
        const k = pickWeighted(rng, FEATURE.rescue3.add);
        const added = randomEmptyCells(rng, coins, k, locoInfo ? new Set([3, 4, 5, 6, ...locoInfo.wilds]) : null).map(cell => ({ cell, ...drawCoin(rng, 'base') }));
        for (const a of added) coins.set(a.cell, { v: a.v, jp: a.jp });
        rescue = { added };
      } else {
        rescueFail = failTease(rng, M.rescue3Num, FEATURE.rescue3.den);
        // every near miss Coin Save doesn't rescue lights a candle until the meter is full; then it waits, full
        if (MT && spin.nearAdded === undefined && meter.lit < meter.n) { meter.lit++; candle = meter.lit; filled = meter.lit === meter.n; }
      }
    }
    const trigger = coins.size >= FEATURE.triggerCount;
    // 0.8.0 (item 10, UGDI): coins on a spin that doesn't start the bonus pay nothing, so they show values from their own
    // table (jackpot plaques much more often, as in UGDI). Coins that start a bonus keep the base table's values.
    if (!trigger && COIN_TABLES.tease && !spin.pot) for (const c of coins.keys()) coins.set(c, drawCoin(rng, 'tease'));
    // 0.8.0 (item 1): a natural trigger is upgraded to a Super Hold & Win at random (SUPER.upgrade, per mode).
    // v0.64 'super=meter': instead, the first trigger after the meter is full is the Super, and the meter empties.
    const superBonus = trigger && (MT ? meter.lit >= meter.n : chance(rng, M.superNum ?? P.SUPER.upgrade.num, P.SUPER.upgrade.den));
    if (MT && superBonus) meter.lit = 0;
    if (MT) round.meter = { before, after: meter, candle, filled, superStart: superBonus, candles: meter.n };
    round.base = { stops, symbols, mystery: mystery && P.POTS?.base?.plainCurtain ? { ...mystery, plain: true } : mystery, coins: coinList(coins), lineWins: lines.wins, lineWin, ...(spin.pot ? { pot: spin.pot } : {}), rescue, rescueFail, ...(spin.nearAdded !== undefined ? { nearAdded: spin.nearAdded } : {}),
      loco: locoInfo ? { ...locoInfo, draws: locoDraws } : null };
    if (opts.noFeature && trigger) { round.trig = superBonus ? 'super' : 'standard'; round.start = new Map(coins); }   // v0.71: RTP tools measure the bonus separately
    else if (superBonus) {
      const thr = P.FEATURE.bigOnly?.betBU ?? 12000;   // v0.67 bigFH: natural bonuses measured against the bet (120x)
      const { out, draws } = shapedDraw(rng, P.SHAPES[`super_${mode}`] ?? P.SHAPES.super, () => playFeature(rng, coins, { P, super: true }), f => f.total, bigOnly(P, thr));
      round.feature = { ...out, draws };
    } else if (trigger) {
      const thr = P.FEATURE.bigOnly?.betBU ?? 12000;
      const { out, draws } = shapedDraw(rng, P.SHAPES[`standard_${mode}`] ?? P.SHAPES.standard, () => playFeature(rng, coins, { P }), f => f.total, bigOnly(P, thr));
      round.feature = { ...out, draws };
    }
  }

  if (round.feature) round.feature = splitFinalCoin(round.feature);   // v0.67 (checklist 7)
  if (round.feature && P.POTS?.bonus?.count) round.feature = potify(round.feature, rng, P);   // pot collectors (same total; potMk adds its make-back)
  const featureWin = round.feature?.total ?? 0;
  const raw = lineWin + featureWin;
  round.totalWin = Math.min(raw, MAX_WIN_BU);
  round.capped = raw > MAX_WIN_BU;
  return round;
}
