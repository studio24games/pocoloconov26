// A stand-in for Tequity's Connector (/slotify/connector/connector.js), for local testing only.
// It plays the part of the Tequity game server with the real Poco Loco maths (math/wallet.js), and of the operator's
// wallet with a 1,000.00 EUR play balance. Tests serve it at /slotify/connector/connector.js; it is never uploaded.
// Every call is logged to window.__connectorLog so tests can check what the game sent.
// Server mode: set window.__rgsServer (e.g. '/rgs') before this loads and the rounds, bets and config come from the
// real game server (server/) over HTTP, as Tequity's platform would fetch them; this file then plays only the wallet.
(function () {
  const base = new URL('../', document.currentScript?.src || location.href);   // the game folder
  const log = [];
  window.__connectorLog = log;
  const cash = m => Math.round(m) / 100, minor = v => Math.round(v * 100);
  const ACTIONS = { main: 'base', double: 'double', buy: 'buy', superbuy: 'superbuy' };
  const rng = { int(n) { const b = new Uint32Array(1), lim = 0x100000000 - (0x100000000 % n); let x; do { crypto.getRandomValues(b); x = b[0]; } while (x >= lim); return x % n; } };

  window.connector = {
    async create(settings, callbacks, theme, features) {
      const W = await import(new URL('math/wallet.js', base).href);
      const pub = W.publicConfig({ currency: 'EUR' });
      const config = JSON.parse(JSON.stringify(pub));   // what a server sends: plain JSON for the variant played
      delete config.bets; delete config.defaultBet;
      const bets = Object.fromEntries(Object.entries(ACTIONS).map(([action, mode]) => [action, {
        available: W.BET_LADDER.map(b => cash(Math.round(b * pub.modes[mode].costPct / 100))),
        default: cash(Math.round(W.DEFAULT_BET * pub.modes[mode].costPct / 100)), coin: 25, maxWin: cash(pub.maxWinBU * W.BET_LADDER.at(-1) / 100),
      }]));
      const srv = window.__rgsServer, gameId = window.__rgsGame || 'pocoloco';
      const api = async (path, body) => { const r = await fetch(`${srv}/api/games/${gameId}/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
        const j = await r.json(); if (!r.ok) throw new Error(j.error?.code || `HTTP ${r.status}`); return j; };
      if (srv) { Object.assign(bets, (await api('bets')).bets); for (const k of Object.keys(config)) delete config[k]; Object.assign(config, await api('config?variant=standard')); }
      let srvState = {};
      const session = W.newSession('mock', 1_000_00);
      let open = null;   // the round between play and complete
      const note = (m, a) => log.push([m, a]);
      const c = {
        callbacks, settings, theme, features,
        async authenticate() { note('authenticate'); return { balance: cash(session.balance), currency: 'eur' }; },
        async info() { note('info'); return { config, bets, state: srv ? srvState : { meters: session.meters }, settings: {} }; },
        async recover() { note('recover'); return undefined; },
        async cheats() { note('cheats'); return { cheats: { main: ['feature', 'big'] } }; },
        async play(action, bet, params, cheat) {
          note('play', { action, bet, cheat });
          if (open) throw new Error('ROUND_NOT_COMPLETE');
          const mode = ACTIONS[action], i = bets[action].available.indexOf(bet);
          if (!mode || i < 0) throw new Error('INVALID_BET');
          if (srv) {   // the real game server decides the round; this mock is the wallet
            const stake = minor(bet); if (session.balance < stake) throw new Error('INSUFFICIENT_FUNDS');
            const wager = await api('play', { bet, coin: bets[action].coin, action, cheat, params, state: srvState });
            if (wager.state) srvState = wager.state;
            session.balance -= stake; open = { win: minor(wager.win) };
            return { wager, balance: cash(session.balance), roundId: `srv-${Date.now().toString(36)}` };
          }
          const before = session.balance;
          const rec = W.settleRound(session, rng, { bet: W.BET_LADDER[i], mode, force: cheat || null, dev: !!cheat });
          if (rec.stake !== minor(bet)) throw new Error(`STAKE_MISMATCH ${rec.stake} vs ${bet}`);
          session.balance = before - rec.stake;   // the wallet debits now and pays on complete()
          open = rec;
          return { wager: { data: rec.round, win: cash(rec.win), state: { meters: session.meters }, action, bet }, balance: cash(session.balance), roundId: rec.roundId };
        },
        async complete() { note('complete'); if (!open) return {}; session.balance += open.win; open = null; return { balance: cash(session.balance) }; },
        gameHistory() { note('gameHistory'); return []; },
        gameLoaded() { note('gameLoaded'); },
        async setActiveBet(b) { note('setActiveBet', b); },
        muted() { note('muted'); }, unmuted() { note('unmuted'); },
        turboToggled(v) { note('turboToggled', v); }, autoplayToggled(v) { note('autoplayToggled', v); },
        paytableToggled(v) { note('paytableToggled', v); },
      };
      window.__connector = c;
      note('create', { features });
      return c;
    },
  };
})();
