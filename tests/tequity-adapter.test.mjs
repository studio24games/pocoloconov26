// Unit tests for js/api-tequity.js against a fake Connector. Run: cd tests && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TequityRGS, isTequityLaunch, toMinor } from '../js/api-tequity.js';

const BETS = {
  main: { available: [0.25, 1.25, 2.5], default: 1.25, coin: 25 },
  double: { available: [0.38, 1.88, 3.75], default: 1.88, coin: 25 },
  buy: { available: [25, 125, 250], default: 125, coin: 25 },
};

function fakeConnector({ recover, playErr } = {}) {
  const calls = [];
  let balance = 100;
  const c = {
    calls,
    async authenticate() { calls.push(['authenticate']); return { balance, currency: 'eur' }; },
    async info() { calls.push(['info']); return { config: { modes: {}, candles: { base: 5 } }, bets: BETS, state: { meters: {} }, settings: {} }; },
    async recover() { calls.push(['recover']); return recover; },
    async cheats() { calls.push(['cheats']); return { cheats: { main: ['feature'] } }; },
    async play(action, bet, params, cheat) {
      calls.push(['play', action, bet, cheat]);
      if (playErr) throw new Error(playErr);
      balance = Math.round((balance - bet) * 100) / 100;
      return { wager: { data: { base: {}, totalWin: 300 }, win: 3.75, state: { meters: { 'standard:base:125': { lit: 2, n: 5 } } } }, balance, roundId: 'r1' };
    },
    async complete() { calls.push(['complete']); balance = Math.round((balance + 3.75) * 100) / 100; return { balance }; },
    setActiveBet(b) { calls.push(['setActiveBet', b]); return Promise.resolve(); },
    muted() { calls.push(['muted']); }, unmuted() { calls.push(['unmuted']); },
    turboToggled(v) { calls.push(['turboToggled', v]); }, autoplayToggled(v) { calls.push(['autoplayToggled', v]); },
    gameLoaded() { calls.push(['gameLoaded']); }, gameHistory() { calls.push(['gameHistory']); },
  };
  return c;
}

async function setup(opts = {}, search = '?rgs=tequity') {
  const c = fakeConnector(opts);
  globalThis.location = { search };
  globalThis.window = { connector: { async create(s, cb) { c.cb = cb; return c; } } };
  const rgs = new TequityRGS();
  const init = await rgs.init();
  return { c, rgs, init };
}

test('detects a Tequity launch only from its launch URL or ?rgs=tequity', () => {
  assert.equal(isTequityLaunch(new URLSearchParams('?rgs=tequity')), true);
  assert.equal(isTequityLaunch(new URLSearchParams('?provider=x&game=y&key=z&language=en')), true);
  assert.equal(isTequityLaunch(new URLSearchParams('')), false);
  assert.equal(isTequityLaunch(new URLSearchParams('?dev=1&key=z')), false);
});

test('cash and minor units round correctly', () => {
  assert.equal(toMinor(1.25), 125); assert.equal(toMinor(0.29), 29); assert.equal(toMinor('1.10'), 110);
});

test('init: authenticate, info, recover; currency, balance and stake ladder in minor units', async () => {
  const { c, init } = await setup();
  assert.deepEqual(c.calls.map(x => x[0]), ['authenticate', 'info', 'recover']);
  assert.equal(init.balance, 10000);
  assert.equal(init.config.currency, 'EUR');
  assert.deepEqual(init.config.bets, [25, 125, 250]);
  assert.equal(init.config.defaultBet, 125);
  assert.equal(init.config.dev, false);
  assert.equal(init.config.candlesByProfile.anything.base, 5);
  assert.equal(init.config.buyMaxStake, 25000, 'Buy limit = highest price in the server Buy lists');
});

test('base spin: action "main" with the cash bet, then complete; round record as the game expects', async () => {
  const { c, rgs } = await setup();
  const rec = await rgs.play(125, 'base', null, 'standard');
  assert.deepEqual(c.calls.slice(-2), [['play', 'main', 1.25, undefined], ['complete']]);
  assert.equal(rec.stake, 125); assert.equal(rec.win, 375);
  assert.equal(rec.balanceBefore, 10000); assert.equal(rec.balanceAfter, 10250);
  assert.equal(rec.roundId, 'r1'); assert.equal(rec.round.totalWin, 300);
  assert.deepEqual(await rgs.meter(125, 'base', 'standard'), { lit: 2, n: 5 });
  const h = await rgs.history(); assert.equal(h.rounds, 1); assert.equal(h.history[0].stake, 125);
});

test('Buy sends the Buy price at the same stake index; an action with no bet list is refused', async () => {
  const { c, rgs } = await setup();
  await rgs.play(250, 'buy');
  assert.deepEqual(c.calls.at(-2), ['play', 'buy', 250, undefined]);
  await assert.rejects(rgs.play(125, 'superbuy'), { code: 'MODE_NOT_AVAILABLE' });
  await assert.rejects(rgs.play(999, 'base'), { code: 'INVALID_BET' });
});

test('forced outcomes are sent as cheats only in Tequity development mode (?dev=1 and cheats() answers)', async () => {
  const prod = await setup();
  await prod.rgs.play(125, 'base', 'feature');
  assert.equal(prod.c.calls.at(-2)[3], undefined);
  assert.ok(!prod.c.calls.some(x => x[0] === 'cheats'));
  const dev = await setup({}, '?rgs=tequity&dev=1');
  await dev.rgs.play(125, 'base', 'feature');
  assert.equal(dev.c.calls.at(-2)[3], 'feature');
});

test('server errors carry a code and are marked as shown by the Connector', async () => {
  const { rgs } = await setup({ playErr: 'INSUFFICIENT_FUNDS' });
  await assert.rejects(rgs.play(125, 'base'), e => e.code === 'INSUFFICIENT_FUNDS' && e.shownByConnector === true);
});

test('an unfinished round found at start is completed and the balance refreshed', async () => {
  const { c, init } = await setup({ recover: { wagers: [{ win: 3.75 }] } });
  assert.ok(c.calls.some(x => x[0] === 'complete'));
  assert.equal(init.balance, 10375);
});

test('sync reports each change once; Connector-driven changes are not echoed back', async () => {
  const { c, rgs } = await setup();
  const n = () => c.calls.length;
  rgs.sync({ bet: 125, mode: 'base', sound: true, turbo: false, auto: false });
  assert.deepEqual(c.calls.slice(-1), [['setActiveBet', 1.25]]);   // the starting state: only the active bet
  const k = n(); rgs.sync({ bet: 125, mode: 'base', sound: true, turbo: false, auto: false }); assert.equal(n(), k);
  rgs.sync({ bet: 125, mode: 'double', sound: false, turbo: true, auto: true });
  assert.deepEqual(c.calls.slice(-4), [['setActiveBet', 1.88], ['muted'], ['turboToggled', true], ['autoplayToggled', true]]);
  let set = null; rgs.bindGame({ setSound: v => { set = v; } });
  c.cb.unmute(); assert.equal(set, true);
  const m = n(); rgs.sync({ bet: 125, mode: 'double', sound: true, turbo: true, auto: true }); assert.equal(n(), m);
});
