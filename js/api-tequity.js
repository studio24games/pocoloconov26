// Tequity (Xanadu) RGS adapter: the same interface as api-local.js (init, play, meter, history), backed by Tequity's
// Connector library (CONNECTOR_GAME_CLIENT_API.pdf). The game server decides every outcome and the operator's wallet
// holds the balance; this file only translates.
//
// Units: the game works in integer minor units (cents) with the stake ladder of the main action. The Connector works
// in the player's currency as decimals, with a bet list per action (main, double, buy, superbuy) whose entries line up
// by index with the main ladder. So stake index i of "buy" is the Buy price of main bet i.
//
// What the game server must return is described in docs/TEQUITY_INTEGRATION.md.

const CONNECTOR_SRC = '/slotify/connector/connector.js';   // relative: the copy deployed next to the game
const CONNECTOR_TEST_SRC = 'https://cdn-test.tequity.ventures/slotify/connector/connector.js';   // local development

/** Game mode -> Connector action. The base action must be called "main". */
export const ACTIONS = { base: 'main', double: 'double', buy: 'buy', superbuy: 'superbuy' };

const params = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

/** True when the game was launched by Tequity (their launch URL carries the Connector settings), or forced with
 *  ?rgs=tequity. Everywhere else (the Vercel demo, localhost) the in-browser demo RGS runs. */
export function isTequityLaunch(q = params()) {
  return q.get('rgs') === 'tequity' || (q.has('key') && q.has('game') && q.has('provider'));
}

/** Cash in the player's currency -> integer minor units, and back. Bets have at most 2 decimals (Connector rule). */
export const toMinor = v => Math.round(Number(v) * 100);
export const toCash = m => Math.round(m) / 100;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load the Tequity Connector (${src})`));
    document.head.append(s);
  });
}

function gameError(e, fallback = 'SERVER_ERROR') {
  // The Connector shows its own error popup; the game only needs a code for its toast and to stop autoplay.
  const err = new Error(e?.message || fallback);
  err.code = e?.code || e?.message || fallback;
  err.shownByConnector = true;
  return err;
}

export class TequityRGS {
  constructor() {
    this.c = null;            // the Connector instance
    this.game = {};           // hooks into the game, set by bindGame()
    this.state = {};          // player's persistent game state (candle meters), owned by the server
    this.history_ = [];
    this.rounds = 0;
    this.last = {};           // last values sent to the Connector, so each change is reported once
    this.session = undefined; // no client-side wallet: the demo-only balance tools in main.js stay off
  }

  /** Connector -> game. Each callback updates this.last first, so the change it causes is not echoed back. */
  callbacks() {
    const g = () => this.game;
    return {
      mute: () => { this.last.sound = false; g().setSound?.(false); },
      unmute: () => { this.last.sound = true; g().setSound?.(true); },
      turboToggle: v => { this.last.turbo = !!v; g().setTurbo?.(!!v); },
      paytableToggle: v => { if (v) g().openPaytable?.(); },
      stopAutoplay: () => g().stopAutoplay?.(),
      play: () => g().spin?.(),
      freeze: () => g().freeze?.(true),
      unfreeze: () => g().freeze?.(false),
    };
  }

  async init() {
    const q = params();
    if (!globalThis.window?.connector) await loadScript(q.get('connector') === 'test' ? CONNECTOR_TEST_SRC : CONNECTOR_SRC);
    const theme = { backgroundColor: '#14061c', primaryColor: '#ffb21f', primaryTextColor: '#ffffff', fontFamily: 'Lilita One, sans-serif' };
    const features = { mute: true, turbo: true, paytable: true };
    try {
      this.c = await window.connector.create({}, this.callbacks(), theme, features);
      const auth = await this.c.authenticate();
      const info = await this.c.info();
      this.currency = String(auth.currency || 'EUR').toUpperCase();
      this.balance = toMinor(auth.balance);
      this.state = info.state || {};
      this.applyBets(info.bets);
      this.config = this.normaliseConfig(info.config || {});
      await this.recover();
    } catch (e) { throw gameError(e, 'CONNECTOR_INIT_FAILED'); }
    // Cheats exist only in Tequity's development mode; ask only when ?dev=1, so production never calls it.
    this.dev = false;
    if (q.get('dev') === '1') { try { const { cheats } = await this.c.cheats(); this.cheats = cheats || {}; this.dev = true; } catch { /* not dev */ } }
    return { sessionId: 'tequity', balance: this.balance, config: { ...this.config, currency: this.currency, dev: this.dev, demo: false } };
  }

  /** Bet lists per action in cash -> the main ladder in minor units, and the per-action lists kept for play(). */
  applyBets(bets) {
    const main = bets?.main;
    if (!Array.isArray(main?.available) || !main.available.length) throw new Error('NO_BET_CONFIG');
    this.bets = bets;
    this.ladder = main.available.map(toMinor);
    this.defaultBet = toMinor(main.default ?? main.available[0]);
  }

  /** The server sends the config of the variant being played (no per-profile tables). Fill what main.js reads. */
  normaliseConfig(cfg) {
    const out = { ...cfg, bets: this.ladder, defaultBet: this.defaultBet };
    if (!this.ladder.includes(out.defaultBet)) out.defaultBet = this.ladder[0];
    // The candle meter (if the variant has one): main.js looks it up per profile; the variant has exactly one.
    if (cfg.candles) { const c = cfg.candles; out.candlesByProfile = new Proxy({}, { get: () => c }); }
    return out;
  }

  /** An unfinished round (browser closed between play and complete): the Connector asks the player; settle it. */
  async recover() {
    const r = await this.c.recover();
    if (r && Number.isFinite(r.balance)) { this.balance = toMinor(r.balance); return; }
    if (r?.wagers?.length) {
      const done = await this.c.complete();
      if (Number.isFinite(done?.balance)) this.balance = toMinor(done.balance);
      else { const fresh = await this.c.authenticate(); this.balance = toMinor(fresh.balance); }
    }
  }

  /** One round: play then complete straight away (Poco Loco rounds are a single wager; the feature is inside it). */
  async play(bet, mode, force = null, profile = 'standard') {
    if (mode === 'extra') mode = 'double';
    const action = ACTIONS[mode];
    if (!action) throw Object.assign(new Error('INVALID_MODE'), { code: 'INVALID_MODE' });
    const i = this.ladder.indexOf(bet);
    if (i < 0) throw Object.assign(new Error('INVALID_BET'), { code: 'INVALID_BET' });
    const cash = this.bets[action]?.available?.[i];
    if (!Number.isFinite(cash)) throw Object.assign(new Error('MODE_NOT_AVAILABLE'), { code: 'MODE_NOT_AVAILABLE' });
    const cheat = this.dev && force ? force : undefined;   // forced outcomes only in Tequity's development mode
    const stake = toMinor(cash);

    let res, done;
    try {
      res = await this.c.play(action, cash, undefined, cheat);
      done = await this.c.complete();
    } catch (e) { throw gameError(e); }

    const { wager, roundId } = res;
    const afterDebit = Number.isFinite(res.balance) ? toMinor(res.balance) : this.balance - stake;
    const win = toMinor(wager.win);
    const balanceBefore = afterDebit + stake;
    const balanceAfter = Number.isFinite(done?.balance) ? toMinor(done.balance) : afterDebit + win;
    if (wager.state) this.state = wager.state;
    this.balance = balanceAfter;

    const time = new Date().toISOString();
    this.rounds++;
    this.history_.unshift({ roundId, time, bet, mode, stake, win });
    this.history_.length = Math.min(this.history_.length, 100);
    return { roundId, time, bet, mode, profile, stake, win, balanceBefore, balanceAfter, forced: cheat || null, round: wager.data };
  }

  /** The candle meter, from the persistent state the server returns ({ meters: { 'profile:mode:bet': {lit, n} } }). */
  async meter(bet, mode, profile = 'standard') {
    const m = this.state?.meters || {};
    const hit = m[`${profile}:${mode}:${bet}`] || Object.entries(m).find(([k]) => k.endsWith(`:${mode}:${bet}`))?.[1];
    return hit || { lit: 0, n: this.config?.candles?.[mode] || 0 };
  }

  /** This session's rounds (the full history is the operator's: see openHistory). */
  async history() { return { balance: this.balance, rounds: this.rounds, history: this.history_ }; }

  /** Tequity's own game history popup. */
  openHistory() { this.c?.gameHistory?.(); }

  // ---- game -> Connector ----
  bindGame(hooks) { this.game = hooks || {}; }

  gameLoaded() { try { this.c?.gameLoaded?.(); } catch { /* informational */ } }

  /** Called from updateHud(): report only what changed. */
  sync({ bet, mode, sound, turbo, auto }) {
    const c = this.c; if (!c) return;
    const L = this.last, quiet = p => { Promise.resolve(p).catch(() => {}); };
    const action = ACTIONS[mode] || 'main', i = this.ladder?.indexOf(bet) ?? -1;
    const active = i >= 0 ? this.bets[action]?.available?.[i] : undefined;
    if (Number.isFinite(active) && active !== L.activeBet) { L.activeBet = active; quiet(c.setActiveBet?.(active)); }
    if (sound !== undefined && sound !== L.sound) { const first = L.sound === undefined; L.sound = sound; if (!first || !sound) quiet(sound ? c.unmuted?.() : c.muted?.()); }
    if (turbo !== undefined && turbo !== L.turbo) { const first = L.turbo === undefined; L.turbo = turbo; if (!first || turbo) quiet(c.turboToggled?.(turbo)); }
    if (auto !== undefined && auto !== L.auto) { const first = L.auto === undefined; L.auto = auto; if (!first || auto) quiet(c.autoplayToggled?.(auto)); }
  }
}
