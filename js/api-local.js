// Static-demo RGS adapter: runs the real maths engine + wallet rules in the browser, so the game can be
// hosted as plain files (Vercel, Netlify, any web host) with no server. For demos only — real-money
// play must use the server-side RGS (client/js/api.js).
import { newSession, publicConfig, settleRound, getMeter } from '../math/wallet.js';
// v0.64: candle meters (?super=meter) carry over between visits - demo only: kept in this browser (the real RGS stores
// them per player).
const METERS_KEY = 'pocoLoco.meters64';
const loadMeters = () => { try { return JSON.parse(localStorage.getItem(METERS_KEY)) || {}; } catch { return {}; } };
const saveMeters = m => { try { localStorage.setItem(METERS_KEY, JSON.stringify(m)); } catch { /* storage blocked */ } };

const browserRNG = {
  int(n) { // unbiased integer in [0, n) from crypto.getRandomValues
    const buf = new Uint32Array(1), limit = 0x100000000 - (0x100000000 % n);
    let x; do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
    return x % n;
  },
};


export class RGS {
  async init() {
    this.session = newSession('demo', 1_000_000);
    this.session.meters = loadMeters();
    return { sessionId: 'demo', balance: this.session.balance, config: { ...publicConfig({ currency: 'USD', dev: true }), demo: true } };
  }
  async play(bet, mode, force = null, profile = 'standard') {
    try { const rec = settleRound(this.session, browserRNG, { bet, mode, force, dev: true, profile }); saveMeters(this.session.meters); return rec; }
    catch (e) { const err = new Error(e.code || e.message); err.code = e.code; throw err; }
  }
  /** v0.64 ?super=meter: the candle meter for a mode, stake and profile ({ lit, n }); none otherwise. */
  async meter(bet, mode, profile = 'standard') { return getMeter(this.session, mode, bet, profile) || { lit: 0, n: 0 }; }
  async history() { const s = this.session; return { balance: s.balance, rounds: s.roundCount, history: s.history }; }
}
