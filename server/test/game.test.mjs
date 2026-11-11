import { test } from 'node:test';
import assert from 'node:assert/strict';
import { play, betsConfig, gameConfig, cheatsList, validate, checkVariants, ACTIONS } from '../src/game.mjs';
import { newSession, settleRound, BET_LADDER, BUY_MAX_STAKE } from '../../math/wallet.js';
import { SeededRNG } from '../../math/rng.js';

const variants = ['standard'];
const seeded = seed => { const r = new SeededRNG(seed); return { rng: r, run: fn => fn(r) }; };

test('bets: one list per action, lined up by index with main, Buy capped at the Buy limit', () => {
  const b = betsConfig('standard');
  assert.deepEqual(Object.keys(b), ['main', 'double', 'buy', 'superbuy']);
  assert.deepEqual(b.main.available, BET_LADDER.map(x => x / 100));
  b.main.available.forEach((m, i) => assert.equal(b.double.available[i], Math.round(m * 160) / 100));
  b.buy.available.forEach((p, i) => assert.equal(p, b.main.available[i] * 80));
  assert.ok(b.buy.available.every(p => p * 100 <= BUY_MAX_STAKE));
  assert.ok(b.buy.available.length < b.main.available.length);
  assert.deepEqual([b.main.coin, b.double.coin, b.buy.coin, b.superbuy.coin], [100, 160, 8000, 16000]);
  assert.equal(b.main.maxWin, 5000); assert.equal(b.buy.maxWin, 62.5);
  assert.equal(b.main.default, 1.25);
});

test('config: plain JSON for one variant, no per-profile tables, no client-supplied fields', () => {
  const c = gameConfig('standard');
  assert.equal(c.profile, 'standard');
  assert.ok(c.paytableBU && c.modes.buy.costPct === 8000 && c.rtp && c.loco);
  assert.ok(!Object.keys(c).some(k => k.endsWith('ByProfile')));
  for (const k of ['bets', 'defaultBet', 'currency', 'dev']) assert.ok(!(k in c), k);
  assert.ok(gameConfig('meter').candles.base > 0);
});

test('same numbers, same round, same win as the demo wallet (EUR stakes, every action)', async () => {
  for (const [action, mode] of Object.entries(ACTIONS)) {
    const a = seeded(42), s = newSession('x', 1e12), b = new SeededRNG(42);
    const bets = betsConfig('standard')[action].available;
    for (let i = 0; i < (mode === 'base' || mode === 'double' ? 3000 : 300); i++) {
      const baseBet = BET_LADDER[i % bets.length];
      const w = await play({ action, bet: bets[i % bets.length], coin: 1 }, { run: a.run, variants });
      const rec = settleRound(s, b, { bet: baseBet, mode });
      assert.equal(Math.round(w.win * 100), rec.win, `${action} #${i}`);
      assert.equal(Math.round(w.bet * 100), rec.stake);
      assert.deepEqual(w.data, rec.round);
    }
  }
});

test('other currencies: the win is exact integer cents of the player-currency stake', async () => {
  const { run } = seeded(5);
  for (let i = 0; i < 2000; i++) {
    const w = await play({ action: 'main', bet: 12.37 }, { run, variants });
    assert.equal(Math.round(w.win * 100), Math.floor(w.data.totalWin * 1237 / 100));
  }
  const d = await play({ action: 'double', bet: 19.79 }, { run, variants });   // 12.37 x 1.6 rounded by the RGS
  assert.equal(Math.round(d.win * 100), Math.floor(d.data.totalWin * 1979 / 160));
});

test('candle meter: kept in the player state per base stake, returned with the wager', async () => {
  const { run } = seeded(9);
  const v = ['meter'];
  let state, lit = 0, filled = false;
  for (let i = 0; i < 4000 && !filled; i++) {
    const w = await play({ action: 'main', bet: 1.25, state, variant: 'meter' }, { run, variants: v });
    state = w.state; const m = state.meters['meter:base:125'];
    assert.ok(m && m.lit >= 0 && m.lit <= m.n);
    if (w.data.meter?.filled) filled = true; lit = Math.max(lit, m.lit);
  }
  assert.ok(lit > 0, 'meter moved');
  await assert.rejects(play({ action: 'main', bet: 1.25, state: { meters: { x: { lit: 9, n: 2 } } }, variant: 'meter' }, { run, variants: v }), /bad meter/);
});

test('cheats: refused unless allowed; honoured in development', async () => {
  const { run, rng } = seeded(3);
  assert.deepEqual(cheatsList(false), {});
  assert.ok(cheatsList(true).main.includes('feature'));
  await assert.rejects(play({ action: 'main', bet: 1.25, cheat: 'feature' }, { run, variants }), /Cheats are not available/);
  const w = await play({ action: 'main', bet: 1.25, cheat: 'feature' }, { run, devRng: rng, variants, allowCheats: true });
  assert.ok(w.data.feature);
  await assert.rejects(play({ action: 'main', bet: 1.25, cheat: 'nope' }, { run, devRng: rng, variants, allowCheats: true }), /Unknown cheat/);
});

test('bad requests are application errors', async () => {
  const { run } = seeded(1);
  for (const body of [{ action: 'gamble', bet: 1 }, { action: 'main', bet: -1 }, { action: 'main', bet: '1' }, { action: 'main', bet: 0.001 }, { action: 'main', bet: 1, variant: 'lean' }, { action: 'main', bet: 1, state: [] }])
    await assert.rejects(play(body, { run, variants }), e => e.code === 'APPLICATION_ERROR' && e.status === 400, JSON.stringify(body));
});

test('variants must exist and price their actions alike (/bets has no variant)', () => {
  assert.deepEqual(checkVariants(['standard', 'meter']), ['standard', 'meter']);
  assert.throws(() => checkVariants(['standard', 'nope']), /Unknown variant/);
  assert.throws(() => checkVariants([]), /No variants/);
});

test('validate: operator limits in the player currency; never valid by default', () => {
  const L = { minBet: 0.25, maxBet: 50, maxBonusBet: 2000, maxExposure: 250000, currencyRate: 1 };
  assert.equal(validate({}, { variants }).valid, false);
  assert.equal(validate({ action: 'main', bet: 1.25 }, { variants }).valid, false);
  assert.equal(validate({ action: 'main', bet: 1.25, betLimits: L }, { variants }).valid, true);
  assert.equal(validate({ action: 'main', bet: 100, betLimits: L }, { variants }).valid, false);
  assert.equal(validate({ action: 'buy', bet: 1000, betLimits: L }, { variants }).valid, true);
  assert.equal(validate({ action: 'buy', bet: 4000, betLimits: L }, { variants }).valid, false);
  assert.equal(validate({ action: 'main', bet: 50, betLimits: { ...L, maxExposure: 100000 } }, { variants }).valid, false);
  assert.equal(validate({ action: 'main', bet: 1.25, betLimits: { ...L, maxExposure: undefined, maxExposre: 250000 } }, { variants }).valid, true);
});
