// HTTP tests: the real app on a random port, with a fake Tequity RNG service on another.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.mjs';
import { createRunner, serviceSource, devRng } from '../src/rng.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
let rngSrv, rngCalls = 0, app, base;
const listen = s => new Promise(r => s.listen(0, '127.0.0.1', () => r(s.address().port)));

before(async () => {
  rngSrv = createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); rngCalls++;
    const total = +u.searchParams.get('total');
    const numbers = Array.from({ length: total }, () => Math.floor(Math.random() * 0x100000000) / 0x100000000);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ numbers }));
  });
  const rngPort = await listen(rngSrv);
  const runner = createRunner(serviceSource({ host: '127.0.0.1', port: rngPort, provider: 'gem', game: 'pocoloco' }), { target: 2000, batch: 1000 });
  app = createApp({ provider: 'gem', game: 'pocoloco', variants: ['standard'], runner, devRng, allowCheats: false, production: true, root });
  base = `http://127.0.0.1:${await listen(app.server)}`;
});
after(() => { app.server.close(); rngSrv.close(); });

const get = async p => { const r = await fetch(base + p); return { status: r.status, type: r.headers.get('content-type'), body: r.headers.get('content-type').includes('json') ? await r.json() : await r.text() }; };
const post = async (p, b) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof b === 'string' ? b : JSON.stringify(b) }); return { status: r.status, body: await r.json() }; };

test('health: ERROR until the RNG is ready, then OK', async () => {
  assert.deepEqual(await get('/health'), { status: 500, type: 'text/plain; charset=utf-8', body: 'ERROR' });
  assert.equal((await get('/api/games/pocoloco/bets')).status, 503);
  app.setReady(true);
  assert.equal((await get('/health')).body, 'OK');
});

test('game list, bets, config, cheats (none in production)', async () => {
  assert.deepEqual((await get('/api/games')).body, { gem: ['pocoloco'] });
  const bets = (await get('/api/games/pocoloco/bets')).body.bets;
  assert.equal(bets.main.default, 1.25);
  const cfg = await get('/api/games/pocoloco/config?variant=standard');
  assert.equal(cfg.status, 200); assert.equal(cfg.body.profile, 'standard'); assert.ok(cfg.type.startsWith('application/json'));
  assert.deepEqual((await get('/api/games/pocoloco/cheats')).body, {});
  assert.equal((await get('/api/games/pocoloco/config?variant=lean')).status, 400);
});

test('play: a wager from the certified RNG; win in cash; cheats refused', async () => {
  const before = rngCalls;
  for (let i = 0; i < 30; i++) {
    const r = await post('/api/games/pocoloco/play', { bet: 1.25, coin: 100, action: 'main' });
    assert.equal(r.status, 200);
    assert.equal(r.body.action, 'main'); assert.equal(r.body.bet, 1.25);
    assert.equal(Math.round(r.body.win * 100), Math.floor(r.body.data.totalWin * 125 / 100));
  }
  const buy = await post('/api/games/pocoloco/play', { bet: 100, coin: 8000, action: 'buy' });
  assert.equal(buy.status, 200); assert.ok(buy.body.data.feature, 'a Buy always has the feature');
  assert.ok(rngCalls > before || rngCalls > 0, 'numbers came from the RNG service');
  const c = await post('/api/games/pocoloco/play', { bet: 1.25, action: 'main', cheat: 'feature' });
  assert.deepEqual(c, { status: 400, body: { error: { message: 'Application error', code: 'APPLICATION_ERROR' } } });
});

test('errors: unified JSON, generic message in production', async () => {
  assert.deepEqual((await post('/api/games/pocoloco/play', '{oops')).body, { error: { message: 'Application error', code: 'APPLICATION_ERROR' } });
  assert.equal((await get('/api/games/other/bets')).status, 404);
  assert.equal((await get('/nope')).status, 404);
  assert.equal((await post('/api/games/pocoloco/action', {})).status, 400);
  assert.equal((await post('/api/games/pocoloco/evaluate', { type: 'achievement', wagers: [] })).status, 400);
});

test('validate and checksum', async () => {
  assert.deepEqual((await post('/api/games/pocoloco/validate', { bet: 1.25, coin: 100, action: 'main' })).body, { valid: false });
  const L = { minBet: 0.25, maxBet: 100, maxBonusBet: 10000, maxExposure: 1e9, currencyRate: 1 };
  assert.deepEqual((await post('/api/games/pocoloco/validate', { bet: 1.25, coin: 100, action: 'main', betLimits: L })).body, { valid: true });
  const a = await get('/api/games/checksum?file=math/engine.js'), b = await get('/api/criticalFileChecksum?criticalFilePath=math/engine.js');
  assert.match(a.body.checksum, /^[0-9a-f]{40}$/); assert.equal(a.body.checksum, b.body.checksum);
  assert.equal((await get('/api/games/checksum?file=../../etc/passwd')).status, 400);
  assert.equal((await get('/api/games/checksum?file=math/nope.js')).status, 404);
});

test('index.mjs refuses to start without an RNG, or with cheats in production', async () => {
  const run = env => new Promise(r => { const p = spawn(process.execPath, ['server/src/index.mjs'], { cwd: root, env: { PATH: process.env.PATH, ...env } }); let err = ''; p.stderr.on('data', d => { err += d; }); p.on('exit', code => r({ code, err })); setTimeout(() => p.kill(), 5000); });
  assert.match((await run({ PROVIDER: 'gem' })).err, /RNG_SERVICE_HOST/);
  assert.match((await run({ PROVIDER: 'gem', ALLOW_LOCAL_RNG: '1' })).err, /RNG_SERVICE_HOST/, 'local RNG never in production');
  assert.match((await run({ PROVIDER: 'gem', ALLOW_CHEATS: '1', ALLOW_LOCAL_RNG: '1' })).err, /ALLOW_CHEATS/);
  assert.match((await run({})).err, /PROVIDER/);
});

test('health says QUITING once SIGTERM is received (runs last)', async () => {
  app.setQuitting();
  assert.deepEqual(await get('/health'), { status: 500, type: 'text/plain; charset=utf-8', body: 'QUITING' });
});
