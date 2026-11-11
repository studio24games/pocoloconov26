// Round + wallet rules shared by the mock RGS (server/server.mjs) and the static demo build
// (client/js/api-local.js). Pure: no I/O, no Node or browser APIs. Money is integer minor units.
import { playRound, params, isProfile, OPTION_ORDER } from './engine.js';
import {
  GAME_ID, MATH_VERSION, LINES, PAYTABLE, JACKPOTS, MODES, MAX_WIN_BU, REEL_ROWS, FEATURE, SUPER,
  PUBLISHED_RTP, PUBLISHED_RTP_BY_PROFILE, COIN_TABLES, FRAME_LADDER, PROFILES, LOCO, SHAPES,
} from './config.js';

// v0.63 (29 Oct): UGDI's stakes (EUR 0.25 - 100, all multiples of 0.25: a 25-coin bet, so 1 coin = bet / 25 = 4 BU).
export const BET_LADDER = [25, 75, 125, 175, 250, 500, 750, 1000, 1500, 1750, 2000, 3000, 3250, 3750, 4500, 5500, 6250, 7750, 8750, 10000];
export const DEFAULT_BET = 125;
export const BUY_MAX_STAKE = 600_00; // reference game disables Buy above this price
export const toMinor = (bu, betMinor) => Math.floor((bu * betMinor) / 100);

export class GameError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

// v0.70: per-option-set values are built on demand for the set actually played. v0.69 built them for all 18,433
// combinations at start-up (about 0.9 s of work on a desktop, several seconds on a phone, and ~45 MB of memory held for
// the whole session - which made phones collect garbage, and stutter, throughout play).
const lazyByProfile = fn => new Proxy({}, { get(t, k) { if (typeof k !== 'string' || !isProfile(k)) return undefined; if (!(k in t)) t[k] = fn(k); return t[k]; },
  has(t, k) { return typeof k === 'string' && isProfile(k); } });
export function publicConfig({ currency = 'USD', dev = false } = {}) {
  return {
    gameId: GAME_ID, mathVersion: MATH_VERSION, currency,
    bets: BET_LADDER, defaultBet: DEFAULT_BET, reelRows: REEL_ROWS, lines: LINES,
    paytableBU: PAYTABLE, jackpotsBU: JACKPOTS, maxWinBU: MAX_WIN_BU,
    paytableByProfile: lazyByProfile(p => params(p).PAYTABLE),   // v0.66: the Experiment has its own
    modes: Object.fromEntries(Object.entries(MODES).map(([k, m]) => [k, { costPct: m.costPct }])),
    // each maths profile can price its modes differently (Faster pace has a cheaper Buy)
    modesByProfile: lazyByProfile(p => Object.fromEntries(Object.entries(params(p).MODES).map(([k, m]) => [k, { costPct: m.costPct }]))),
    buyMaxStake: BUY_MAX_STAKE, triggerCount: FEATURE.triggerCount, dev, rtp: PUBLISHED_RTP,
    coinValuesBU: COIN_TABLES.early.map(([v]) => v).filter(v => typeof v === 'number'),
    frameMults: FRAME_LADDER, jackpotGrowth: 'double',
    lives: FEATURE.lives, superLives: SUPER.lives, fullHouseMult: FEATURE.fullHouseMult,
    superFullHouseStart: SUPER.fullHouseStart, superUpgrade: SUPER.upgrade, rtpByProfile: lazyByProfile(p => PUBLISHED_RTP_BY_PROFILE[p] || PUBLISHED_RTP),
    candlesByProfile: lazyByProfile(p => { const P = params(p), c = P.METER?.candles;   // v0.64 meter option (v0.66: per version)
      return c ? { base: c[P.MODES.base.strips] ?? c.base, double: c[P.MODES.double.strips] ?? c.double } : null; }),
    loco: (() => { const sh = SHAPES.loco, i = sh.w.findIndex(x => x > 0);   // v0.66: bounds read from the Loco shape
      return { every: Math.round(LOCO.den / LOCO.num), minX: sh.edges[i] / 100, maxX: Math.floor(sh.edges[sh.edges.length - 1] / 100), mults: LOCO.mult.map(([m]) => m) }; })(),
    // v0.67: per option set (loco34 has its own rate and bounds)
    locoByProfile: lazyByProfile(p => { const P = params(p), L = P.LOCO,
      sh = (L.shapeSet && P.SHAPES[`${L.shapeSet}_${P.MODES.base.strips}`]) ?? P.SHAPES.loco, i = sh.w.findIndex(x => x > 0);
      return { every: Math.round(L.den / L.num), minX: sh.edges[i] / 100, maxX: Math.floor(sh.edges[sh.edges.length - 1] / 100), mults: L.mult.map(([m]) => m) }; }),
    mystery: true,   // v0.63: Mystery stacks (Q) reveal after the reels stop
  };
}

export function newSession(id, balance) {
  return { id, balance, history: [], seq: 0, roundCount: 0, meters: {} };
}

/** v0.64 'super=meter': meters are kept per profile, mode and stake, so progress is never lost when the player changes
 *  stake (and a meter built at a small stake can't be cashed at a big one). */
const meterKey = (mode, bet, profile) => `${profile}:${mode}:${bet}`;
export function getMeter(session, mode, bet, profile = 'standard') {
  const P = params(profile), MT = P.METER, n = MT && (MT.candles[P.MODES[mode]?.strips] ?? MT.candles[mode]); if (!n) return null;
  session.meters ??= {};
  return session.meters[meterKey(mode, bet, profile)] ?? { lit: 0, n };
}
/** Every combination of the link options, e.g. 'standard', 'lean', 'lean+steady+meter' ('pace' combos left out). */
const buildProfileList = () => { const opts = OPTION_ORDER.filter(o => o !== 'pace'); const out = ['standard', 'pace'];
  for (let m = 1; m < 1 << opts.length; m++) { const pick = opts.filter((_, i) => m & (1 << i)); if (![['dbl22', 'dbl36'], ['bonusOften', 'bonusRare'], ['topTrim', 'topLean'], ['fMore', 'fPay'], ['fMore', 'fBig'], ['fPay', 'fBig'], ['topTrim', 'top600'], ['topLean', 'top600'], ['band75', 'band100'], ['cvMix', 'cvGD'], ['crRare', 'crSmall'], ['midLess', 'midMore'], ['nearMore', 'nearGD'], ['steady', 'volatile']].some(([a, b]) => pick.includes(a) && pick.includes(b))) out.push(pick.join('+')); } return out; };   // v0.68: exclusive pairs excluded
/** Every valid option set - built only when a tool asks for it (v0.70: never at game start-up). v0.71: tens of millions of
 *  sets now (29 options), so tools should build the sets they need instead. */
export const PROFILE_LIST = new Proxy([], { get(t, k) { if (!t.length) t.push(...buildProfileList()); const v = Reflect.get(t, k); return typeof v === 'function' ? v.bind(t) : v; } });

/** DEV-only scenario predicates for automated presentation QA (never reachable without dev=true). */
const coinsBefore = (b, r) => b.coins.filter(c => (c.cell < 3 ? 0 : c.cell < 7 ? 1 : 2) < r).length;
const DEV_SCENARIOS = {
  full: () => r => r.feature?.endReason === 'full',
  nearFull: () => r => r.feature?.respins.some(rs => rs.held >= 8) && r.feature.endReason !== 'full',
  curtain: ([pay]) => r => !r.feature && !r.base.loco && !!r.base.mystery && (pay === undefined || (pay === '1' ? r.base.lineWin >= 100 : r.base.lineWin === 0)),   // v0.70 QA
  baseWin: ([lo = '2', hi = '15']) => r => !r.feature && r.base.lineWin >= +lo * 100 && r.base.lineWin < +hi * 100,   // v0.70 QA: a base win in a band (x stake)
  curtainX2: () => r => !r.feature && r.base?.mystery?.mult > 1,   // v0.69 QA: a doubled curtain win (fBig)
  trigLine: () => r => !!r.feature && !r.base.rescue && r.base.lineWin > 0 && !r.feature.super,   // v0.67 QA: checklist 1
  fourth: () => r => !!r.feature && !r.feature.super && r.feature.lives > 3,   // v0.67 QA: checklist 5
  natFull: () => r => { const F = r.feature; if (!F || F.endReason !== 'full' || F.super) return false; const l = F.respins[F.respins.length - 1]; return !l.rescued?.length && l.landed.length === 1; },   // v0.67 QA: checklist 7
  lastHole: () => r => r.feature?.respins.some(rs => rs.held === 9),   // v0.66e QA: a bonus that reaches the last hole
  nearFullWin: () => r => r.feature?.respins.some(rs => rs.held === 8) && r.feature.endReason === 'full',
  mult: ([n = '3']) => r => (r.feature?.openingFrames.length || 0) >= +n,
  jpMult: () => r => r.feature?.collect.some(c => c.jp && c.mult > 1),
  jp: ([t = 'MINI']) => r => r.feature?.collect.some(c => c.jp === t),
  jpStart: () => r => r.feature?.start.some(c => c.jp) && r.feature.start.some(c => !c.jp),
  nearMiss: () => r => !r.feature && coinsBefore(r.base, 2) === 3 && !r.base.rescue && !r.base.rescueFail,
  nearHit: () => r => !!r.feature && coinsBefore(r.base, 2) === 3,
  baseCoins: ([n = '2']) => r => !r.feature && r.base.coins.length >= +n && r.base.lineWin > 0,
  lineWin: () => r => !r.feature && r.base.lineWin > 0 && !r.base.rescue && !r.base.rescueFail,
  ratio: ([lo = '0', hi = '1e9'], bet, mode) => { const cost = Math.round(bet * MODES[mode].costPct / 100); // standard prices
    return r => { const w = toMinor(r.totalWin, bet) / cost; return !!r.feature && w >= +lo && w < +hi; }; },
  long: ([n = '8']) => r => (r.feature?.respins.length || 0) >= +n,
  many: ([n = '7']) => r => (r.feature?.collect.length || 0) >= +n,
  // 0.3.0 features
  loco: () => r => (!!r.base?.loco && r.base.lineWin > 0) || (!!r.base?.pot && !r.base.pot.tease && !r.feature),   // pots A: no Clover Spin - a pot win instead
  locoWilds: ([n = '1', side = '']) => r => { const w = r.base?.loco?.wilds || []; if (w.length !== +n) return false;   // v0.73 QA (checklist 9)
    return side === 'L' ? w.every(c => c < 3) : side === 'R' ? w.every(c => c >= 7) : side === 'LR' ? w.some(c => c < 3) && w.some(c => c >= 7) : true; },
  mystery: ([n = '3']) => r => !r.feature && !r.base?.loco && (r.base?.mystery?.cells.length || 0) >= +n && r.base.lineWin > 0,   // v0.63
  locoBig: ([m = '3']) => r => (r.base?.loco?.mult || 0) >= +m && r.base.lineWin > 0,
  fullHouse: () => r => r.feature?.fullHouse.applied && !r.feature.super,
  levelUp: () => r => r.feature?.respins.some(rs => rs.levelUps.length),
  candle: () => r => !!r.meter?.filled,   // v0.64 meter option: a near miss fills the meter
  jpGrow: () => r => r.feature?.respins.some(rs => rs.actions.some(a => a.type === 'jackpot')) || !!r.feature?.openingJackpots?.length,   // pots: doublings come at the start
  // pot collectors (3 Nov)
  potWin: () => r => !!r.base?.pot && !r.base.pot.tease && !r.feature,
  potTease: () => r => !!r.base?.pot?.tease && !r.feature,
  potJp: () => r => !!r.feature?.collect.some(c => c.taken && c.jp),
  pots2: () => r => (r.feature?.respins.filter(rs => rs.pot).length || 0) >= 2,
  frameDrop: ([m = '10']) => r => r.feature?.respins.some(rs => rs.actions.some(a => a.type === 'frame' && a.mult >= +m)),
  frameWon: ([m = '10']) => r => r.feature?.collect.some(c => c.mult >= +m),
  collector: () => r => r.feature && !r.feature.super && r.feature.collectors > 0,
  collector2: () => r => r.feature && !r.feature.super && r.feature.collectors > 1,
  jpDouble: () => r => r.feature?.respins.some(rs => rs.actions.some(a => a.type === 'jackpot')) && r.feature.collect.some(c => c.jp && r.feature.jackpots[c.jp] > JACKPOTS[c.jp]),
  stepUp: () => r => r.feature?.respins.some(rs => rs.actions.some(a => a.type === 'level' && a.coin)) || (r.feature?.potsMode && r.feature.openingFrames.length >= 3),   // pots: no step-ups; a bonus with 3+ opening multipliers instead
  finalStep: () => r => !!r.feature?.finalLevels?.length,
};
// Super scenarios (DEV only): re-draw until a natural trigger is upgraded to a Super (0.8.0: no meter).
const SUPER_SCENARIOS = {
  super: () => r => !!r.feature?.super,
  superFull: () => r => r.feature?.super && r.feature.fullHouse.applied,
  superCollect: () => r => r.feature?.super && r.feature.collectors > 0,
  superCollect2: () => r => r.feature?.super && r.feature.collectors > 1,
  superFH: ([m = '5']) => r => r.feature?.super && r.feature.fullHouse.mult >= +m,
  superBig: ([x = '500']) => r => r.feature?.super && r.totalWin >= +x * 100,
};

/** Draw one round for a mode and option set. `meter` is the player's candle meter for this mode and stake (or null).
 *  `force` is a DEV-only re-draw helper: never honoured without dev=true. Shared by settleRound (demo wallet) and the
 *  Tequity game server (server/), so both draw rounds the same way. */
export function drawRound(rng, { bet, mode, force = null, dev = false, profile = 'standard', meter = null }) {
  const bought = mode === 'buy' || mode === 'superbuy';
  const fname = typeof force === 'string' ? force.split(':')[0] : null;
  // DEV only (meter option): Super scenarios draw with the meter full, 'candle' with it one short. The player's real
  // meter is left as it was. Never reachable without dev=true.
  const drawMeter = dev && meter && SUPER_SCENARIOS[fname] ? { lit: meter.n, n: meter.n }
    : dev && meter && fname === 'candle' ? { lit: meter.n - 1, n: meter.n } : meter;
  const draw = () => playRound(rng, mode, { profile, meter: drawMeter });
  let round = draw();
  if (dev && force === 'feature' && !bought) {
    for (let i = 0; i < 100000 && !round.feature; i++) round = draw();
  } else if (dev && force === 'rescue' && !bought) {
    for (let i = 0; i < 2000000 && !round.base.rescue; i++) round = draw();
  } else if (dev && force === 'rescueFail' && !bought) {
    for (let i = 0; i < 2000000 && !round.base.rescueFail; i++) round = draw();
  } else if (dev && (force === 'featRescue' || force === 'featFail')) {
    const key = force === 'featRescue' ? (rs => rs.rescued.length) : (rs => rs.rescueFail);
    for (let i = 0; i < 3000000 && !round.feature?.respins.some(key); i++) round = draw();
  } else if (dev && fname && (DEV_SCENARIOS[fname] || SUPER_SCENARIOS[fname])) {
    // DEV-only QA scenarios: re-draw until the situation occurs. Same engine, same RNG, no new outcomes.
    const [name, ...args] = force.split(':');
    const want = (DEV_SCENARIOS[name] || SUPER_SCENARIOS[name])(args, bet, mode);
    for (let i = 0; i < 3000000 && !want(round); i++) round = draw();
  } else if (dev && force === 'big') {
    for (let i = 0; i < 200000 && round.totalWin < 20000; i++) round = draw();
  }
  if (round.meter && drawMeter !== meter) round.meter = { ...round.meter, forced: true };   // shown as played, but not kept
  return round;
}

/** Names of the DEV-only forced outcomes (Tequity: the cheats list in development environments). */
export const CHEAT_NAMES = () => ['feature', 'rescue', 'rescueFail', 'featRescue', 'featFail', 'big', ...Object.keys(DEV_SCENARIOS), ...Object.keys(SUPER_SCENARIOS)];
export { meterKey };

/** Validate, draw a round, settle the wallet. `force` is a DEV-only re-draw helper. */
export function settleRound(session, rng, { bet, mode = 'base', force = null, dev = false, profile = 'standard' }) {
  if (mode === 'extra') mode = 'double'; // 0.2.0 clients
  if (!BET_LADDER.includes(bet)) throw new GameError(400, 'INVALID_BET');
  if (!MODES[mode]) throw new GameError(400, 'INVALID_MODE');
  if (!isProfile(profile)) throw new GameError(400, 'INVALID_PROFILE');
  const stake = Math.round((bet * params(profile).MODES[mode].costPct) / 100);
  const bought = mode === 'buy' || mode === 'superbuy';
  if (bought && stake > BUY_MAX_STAKE) throw new GameError(400, 'BUY_DISABLED_AT_THIS_BET');
  if (session.balance < stake) throw new GameError(402, 'INSUFFICIENT_FUNDS');

  const meter = bought ? null : getMeter(session, mode, bet, profile);
  const round = drawRound(rng, { bet, mode, force, dev, profile, meter });
  if (round.meter && !round.meter.forced) session.meters[meterKey(mode, bet, profile)] = round.meter.after;

  const balanceBefore = session.balance;
  session.balance -= stake;
  const win = toMinor(round.totalWin, bet);
  session.balance += win;
  const record = {
    roundId: `${GAME_ID}-${Date.now().toString(36)}-${(++session.seq).toString(36)}`,
    time: new Date().toISOString(), bet, mode, profile, stake, win, balanceBefore, balanceAfter: session.balance,
    forced: dev && force ? force : null, round,
  };
  session.history.unshift({ roundId: record.roundId, time: record.time, bet, mode, stake, win });
  session.history.length = Math.min(session.history.length, 100);
  session.roundCount++;
  return record;
}
