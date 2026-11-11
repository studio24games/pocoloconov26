// Poco Loco game logic for the Tequity (Xanadu) game server. Pure: no I/O. Rounds are drawn by the same code as the
// demo wallet (math/wallet.js drawRound), so the server and the demo can never disagree on maths.
//
// Money: Tequity sends the bet in the PLAYER's currency (2 decimals). The server never looks it up in a euro ladder.
// It derives the base stake from the action's price ratio (costPct) and pays in exact integer minor units:
//   win = floor(totalWinBU * stakeMinor / costPct)  ==  floor(totalWinBU * baseBetMinor / 100)
import { drawRound, getMeter, meterKey, publicConfig, BET_LADDER, DEFAULT_BET, BUY_MAX_STAKE, CHEAT_NAMES } from '../../math/wallet.js';
import { params, isProfile } from '../../math/engine.js';
import { MAX_WIN_BU } from '../../math/config.js';

/** Tequity action -> engine mode. The base action must be called "main". */
export const ACTIONS = { main: 'base', double: 'double', buy: 'buy', superbuy: 'superbuy' };
const BOUGHT = new Set(['buy', 'superbuy']);

/** An error the RGS shows to the player. `code` is one of Tequity's codes; `message` is for logs (hidden in production). */
export class AppError extends Error {
  constructor(message, { code = 'APPLICATION_ERROR', status = 400 } = {}) { super(message); this.code = code; this.status = status; }
}

export const costPct = (profile, mode) => params(profile).MODES[mode].costPct;

/** Variants Tequity may launch. /bets takes no variant, so every allowed variant must price its actions alike. */
export function checkVariants(variants) {
  if (!variants.length) throw new Error('No variants configured');
  for (const v of variants) {
    if (!isProfile(v)) throw new Error(`Unknown variant "${v}"`);
    for (const mode of Object.values(ACTIONS)) if (costPct(v, mode) !== costPct(variants[0], mode))
      throw new Error(`Variant "${v}" prices ${mode} differently from "${variants[0]}": /bets cannot serve both`);
  }
  return variants;
}

export function profileFor(variant, variants) {
  const v = variant ?? variants[0];
  if (!variants.includes(v)) throw new AppError(`Variant "${v}" is not offered`);
  return v;
}

/** GET /bets: one list per action, in euros (Tequity converts to the player's currency). Entry i of every list is the
 *  price of main stake i, so lists line up by index (Buy lists stop at the Buy price limit). */
export function betsConfig(profile) {
  const out = {};
  for (const [action, mode] of Object.entries(ACTIONS)) {
    const pct = costPct(profile, mode);
    const price = b => Math.round((b * pct) / 100);
    const ladder = BET_LADDER.filter(b => !BOUGHT.has(mode) || price(b) <= BUY_MAX_STAKE);
    out[action] = {
      available: ladder.map(b => price(b) / 100),
      default: price(DEFAULT_BET) / 100,
      coin: pct,                      // proportional coins: main 100, double 160, buy 8000, superbuy 16000
      maxWin: MAX_WIN_BU / pct,       // max theoretical win as a multiple of this action's bet (5,000x the base stake)
    };
  }
  return out;
}

/** GET /config: the demo's publicConfig for one variant, as plain JSON (no per-profile lookup tables). */
export function gameConfig(profile) {
  const pub = publicConfig({ currency: 'EUR' });
  const cfg = { ...pub, profile };
  cfg.paytableBU = pub.paytableByProfile[profile];
  cfg.modes = pub.modesByProfile[profile];
  cfg.rtp = pub.rtpByProfile[profile];
  cfg.loco = pub.locoByProfile[profile];
  const candles = pub.candlesByProfile[profile];
  if (candles) cfg.candles = candles;
  for (const k of Object.keys(cfg)) if (k.endsWith('ByProfile')) delete cfg[k];
  for (const k of ['bets', 'defaultBet', 'currency', 'dev']) delete cfg[k];   // the Connector supplies these
  return JSON.parse(JSON.stringify(cfg));
}

/** GET /cheats: names per action, only where cheats are allowed (development environments). */
export function cheatsList(allow) {
  if (!allow) return {};
  const all = CHEAT_NAMES();
  const boughtOk = ['big', 'super', 'superFull', 'superCollect', 'superCollect2', 'superFH', 'superBig', 'full', 'jp', 'many', 'long', 'mult', 'jpMult', 'frameWon', 'stepUp', 'finalStep', 'levelUp', 'fullHouse', 'collector', 'collector2', 'jpDouble', 'potJp', 'pots2', 'frameDrop', 'fourth', 'lastHole', 'nearFull', 'nearFullWin', 'ratio', 'featRescue', 'featFail'];
  return { main: all, double: all, buy: all.filter(n => boughtOk.includes(n)), superbuy: all.filter(n => boughtOk.includes(n)) };
}

function parseStake(bet) {
  if (typeof bet !== 'number' || !Number.isFinite(bet) || bet <= 0) throw new AppError('bet must be a positive number');
  const stake = Math.round(bet * 100);
  if (stake < 1) throw new AppError('bet is below the smallest unit');
  return stake;
}

function parseMeters(state) {
  if (state == null) return {};
  if (typeof state !== 'object' || Array.isArray(state)) throw new AppError('state must be an object');
  const m = state.meters ?? {};
  if (typeof m !== 'object' || Array.isArray(m)) throw new AppError('state.meters must be an object');
  const out = {};
  for (const [k, v] of Object.entries(m)) {
    if (!v || !Number.isInteger(v.lit) || !Number.isInteger(v.n) || v.lit < 0 || v.n < 1 || v.lit > v.n) throw new AppError(`bad meter ${k}`);
    out[k] = { lit: v.lit, n: v.n };
  }
  return out;
}

/**
 * POST /play. `run(fn)` draws a round with the certified RNG: it calls fn(rng) and returns its result (see rng.mjs).
 * `devRng` (cheats only) is a fast local RNG for the re-draw loops of forced outcomes; never used without allowCheats.
 */
export async function play(body, { run, devRng = null, variants, allowCheats = false }) {
  const { bet, action, cheat, state, variant } = body || {};
  const mode = ACTIONS[action];
  if (!mode) throw new AppError(`Unknown action "${action}"`);
  const profile = profileFor(variant, variants);
  const stake = parseStake(bet);
  const pct = costPct(profile, mode);
  const baseBet = Math.round((stake * 100) / pct);   // the meter is kept per base stake
  const session = { meters: parseMeters(state) };
  const meter = BOUGHT.has(mode) ? null : getMeter(session, mode, baseBet, profile);

  let round;
  if (cheat != null && cheat !== '') {
    if (!allowCheats || !devRng) throw new AppError('Cheats are not available');
    if (typeof cheat !== 'string' || !CHEAT_NAMES().includes(cheat.split(':')[0])) throw new AppError(`Unknown cheat "${cheat}"`);
    round = drawRound(devRng, { bet: baseBet, mode, force: cheat, dev: true, profile, meter });
  } else {
    round = await run(rng => drawRound(rng, { bet: baseBet, mode, profile, meter }));
  }

  const win = Math.floor((round.totalWin * stake) / pct);
  if (round.meter && !round.meter.forced) session.meters[meterKey(mode, baseBet, profile)] = round.meter.after;
  const wager = { action, bet: stake / 100, win: win / 100, data: round };
  if (Object.keys(session.meters).length || state != null) wager.state = { meters: session.meters };
  return wager;
}

/** POST /validate: is this bet allowed under the operator's limits (player's currency)? Never true by default. */
export function validate(body, { variants }) {
  const { bet, action, variant, betLimits: L } = body || {};
  const mode = ACTIONS[action];
  if (!mode || !L || typeof L !== 'object') return { valid: false };
  let profile; try { profile = profileFor(variant, variants); } catch { return { valid: false }; }
  let stake; try { stake = parseStake(bet); } catch { return { valid: false }; }
  const pct = costPct(profile, mode), base = (stake * 100) / pct / 100;   // base stake in cash
  const maxExposure = L.maxExposure ?? L.maxExposre ?? L.maxExpousre;   // spellings seen in Tequity's spec
  const num = v => typeof v === 'number' && Number.isFinite(v);
  if (![L.minBet, L.maxBet, L.maxBonusBet, maxExposure].every(num)) return { valid: false };
  if (base < L.minBet || base > L.maxBet) return { valid: false };
  if (BOUGHT.has(mode) && stake / 100 > L.maxBonusBet) return { valid: false };
  if ((base * MAX_WIN_BU) / 100 > maxExposure) return { valid: false };
  return { valid: true };
}
