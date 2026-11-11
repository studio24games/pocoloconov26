// Browser check of both RGS modes with Playwright (needs `playwright` installed). Run from tests/: npm run e2e
//  1. Demo (no launch params): the in-browser RGS, the Connector is never requested, a spin plays.
//  2. Tequity (?rgs=tequity): /slotify/connector/connector.js is served by tests/mock-connector.js (real maths as
//     the server). Checks the Connector calls, the demo-only tools are gone, base and Buy rounds settle to the wallet's
//     balance, and the mute/turbo/freeze controls work both ways. Any console error fails the run.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = 8765, URL0 = `http://127.0.0.1:${PORT}/`;
const mock = readFileSync(new URL('mock-connector.js', import.meta.url), 'utf8');

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(800);

const browser = await chromium.launch();
let failed = false;
async function run(name, fn) {
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  const errors = [], connectorRequests = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/slotify/connector/connector.js', r => { connectorRequests.push(r.request().url()); r.fulfill({ contentType: 'text/javascript', body: mock.replace("document.currentScript?.src || location.href", `'${URL0}tests/'`) }); });
  try { await fn(page, connectorRequests); assert.deepEqual(errors, [], 'console errors'); console.log(`PASS ${name}`); }
  catch (e) { failed = true; console.log(`FAIL ${name}\n  ${e.message}\n  console: ${errors.join(' | ')}`); }
  await page.close();
}
const enter = async page => {
  await page.waitForFunction(() => !document.querySelector('#playBtn')?.disabled, null, { timeout: 30000 });
  await page.click('#playBtn'); await page.waitForTimeout(700);
  await page.evaluate(() => { window.__game.S.turbo = true; });
};
// A Buy or forced feature round's bonus animation runs for minutes (it waits on the player), so those rounds are
// checked through the game's RGS object directly: the same calls the round flow makes, without the presentation.
const rgsPlay = async (page, bet, mode, force = null) => page.evaluate(async ([b, m, f]) => { const rec = await window.__game.rgs.play(b, m, f);
  const { balance } = await window.__connector.authenticate(); return { stake: rec.stake, win: rec.win, before: rec.balanceBefore, after: rec.balanceAfter, wallet: Math.round(balance * 100) }; }, [bet, mode, force]);
const spinOnce = async (page, mode = 'base') => page.evaluate(async m => { const g = window.__game; const t = setInterval(() => { g.S.skip = true; }, 100);
  try { const rec = await g.playRound(m); return { rec: rec && { stake: rec.stake, win: rec.win, before: rec.balanceBefore, after: rec.balanceAfter, mode: rec.mode }, bal: g.S.balance }; } finally { clearInterval(t); } }, mode);

await run('demo mode: in-browser RGS, no Connector', async (page, reqs) => {
  await page.goto(URL0);
  await enter(page);
  assert.ok(await page.$('.demo-badge'), 'demo badge kept');
  const { rec, bal } = await spinOnce(page);
  assert.ok(rec, 'round played'); assert.equal(bal, rec.after);
  assert.equal(reqs.length, 0, 'Connector not requested');
});

await run('Tequity mode: Connector drives the round and the wallet', async (page, reqs) => {
  await page.goto(`${URL0}?rgs=tequity`);
  await enter(page);
  assert.equal(reqs.length, 1, 'Connector loaded from /slotify/connector/connector.js');
  assert.ok(reqs[0].endsWith('/slotify/connector/connector.js'));
  assert.equal(await page.$('.demo-badge'), null, 'demo badge removed');
  const log = () => page.evaluate(() => window.__connectorLog.map(([m, a]) => [m, a]));
  let L = await log();
  for (const m of ['create', 'authenticate', 'info', 'recover', 'gameLoaded', 'setActiveBet']) assert.ok(L.some(x => x[0] === m), `called ${m}`);
  assert.ok(!L.some(x => x[0] === 'cheats'), 'no cheats outside dev');
  assert.equal(await page.evaluate(() => window.__game.S.balance), 100000);
  assert.equal(await page.evaluate(() => window.__game.S.cfg.currency), 'EUR');

  const base = await spinOnce(page);
  L = await log();
  const plays = L.filter(x => x[0] === 'play');
  assert.equal(plays.at(-1)[1].action, 'main'); assert.equal(plays.at(-1)[1].bet, 1.25);
  assert.equal(L.at(-1)[0] === 'complete' || L.some(x => x[0] === 'complete'), true);
  assert.equal(base.rec.before, 100000); assert.equal(base.bal, base.rec.after);
  assert.equal(base.rec.after, 100000 - 125 + base.rec.win);

  const buy = await rgsPlay(page, 125, 'buy');
  L = await log();
  assert.equal(L.filter(x => x[0] === 'play').at(-1)[1].action, 'buy');
  assert.equal(buy.stake, 10000, 'Buy at a 1.25 stake costs 80x = 100.00');
  assert.equal(minorOf(L.filter(x => x[0] === 'play').at(-1)[1].bet), buy.stake);
  assert.equal(buy.after, buy.wallet, 'game balance = wallet balance');
  assert.equal(buy.after, base.rec.after - buy.stake + buy.win);

  // game -> Connector
  await page.click('#soundBtn'); await page.click('#turboBtn');
  L = await log();
  assert.ok(L.some(x => x[0] === 'muted'), 'muted reported');
  assert.ok(L.some(x => x[0] === 'turboToggled' && x[1] === false), 'turbo reported');
  // Connector -> game
  const st = await page.evaluate(() => { const c = window.__connector.callbacks; c.unmute(); c.turboToggle(true); c.freeze();
    return { sound: window.__game.S.sound, turbo: window.__game.S.turbo, frozen: document.body.classList.contains('rgs-frozen') }; });
  assert.deepEqual(st, { sound: true, turbo: true, frozen: true });
  assert.equal(await page.evaluate(() => window.__game.playRound('base')), null, 'no spin while frozen');
  await page.evaluate(() => window.__connector.callbacks.unfreeze());
  L = await log();
  assert.equal(L.filter(x => x[0] === 'unmuted').length, 0, 'Connector-driven unmute not echoed');
});
function minorOf(v) { return Math.round(v * 100); }

await run('Tequity dev mode: forced outcome goes to the server as a cheat', async page => {
  await page.goto(`${URL0}?rgs=tequity&dev=1`);
  await enter(page);
  assert.ok((await page.evaluate(() => window.__connectorLog)).some(x => x[0] === 'cheats'), 'cheats asked in dev');
  const r = await rgsPlay(page, 125, 'base', 'big');
  const L = await page.evaluate(() => window.__connectorLog);
  assert.equal(L.filter(x => x[0] === 'play').at(-1)[1].cheat, 'big');
  assert.ok(r.win >= 20000, 'the server honoured the cheat'); assert.equal(r.after, r.wallet);
});

// 4. The whole chain: game client -> (mock Connector as the platform + wallet) -> REAL game server (server/) ->
//    stand-in Tequity RNG service. Every outcome comes from the server.
const RNG_PORT = 8793, SRV_PORT = 8794;
const rngProc = spawn(process.execPath, ['server/test/fake-rng-service.mjs', String(RNG_PORT)], { cwd: root, stdio: 'ignore' });
const srvProc = spawn(process.execPath, ['server/src/index.mjs'], { cwd: root, stdio: 'ignore',
  env: { ...process.env, PORT: String(SRV_PORT), PROVIDER: 'studio24', GAME: 'pocoloco', RNG_SERVICE_HOST: '127.0.0.1', RNG_SERVICE_PORT: String(RNG_PORT), ENVIRONMENT: 'staging' } });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${SRV_PORT}/health`)).ok) break; } catch { /* starting */ } await sleep(200); }
await run('Tequity mode against the real game server and RNG service', async page => {
  const calls = [];
  await page.addInitScript(() => { window.__rgsServer = '/rgs'; });
  await page.route('**/rgs/**', async r => { const u = new URL(r.request().url()); calls.push(`${r.request().method()} ${u.pathname.replace('/rgs', '')}`);
    const resp = await r.fetch({ url: `http://127.0.0.1:${SRV_PORT}${u.pathname.replace('/rgs', '')}${u.search}` }); await r.fulfill({ response: resp }); });
  await page.goto(`${URL0}?rgs=tequity`);
  await enter(page);
  assert.ok(calls.includes('GET /api/games/pocoloco/bets') && calls.includes('GET /api/games/pocoloco/config'), 'bets and config from the server');
  assert.equal(await page.evaluate(() => window.__game.S.cfg.profile), 'standard');
  assert.equal(await page.evaluate(() => window.__game.S.cfg.buyMaxStake), 60000, 'Buy limit from the server Buy list');
  for (let i = 0; i < 3; i++) {
    const base = await spinOnce(page);
    assert.ok(base.rec, 'round played'); assert.equal(base.bal, base.rec.after);
    assert.equal(base.rec.after, base.rec.before - 125 + base.rec.win);
  }
  const buy = await rgsPlay(page, 125, 'buy');
  assert.equal(buy.stake, 10000); assert.equal(buy.after, buy.wallet);
  assert.equal(calls.filter(c => c === 'POST /api/games/pocoloco/play').length, 4, 'every round decided by the server');
});
srvProc.kill('SIGTERM'); rngProc.kill();

await browser.close(); server.kill();
process.exit(failed ? 1 : 0);
