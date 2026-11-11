// HTTP API for the Tequity (Xanadu) RGS: the endpoints in GAME_SERVER_INTEGRATION.pdf. JSON in and out, errors as
// { error: { message, code } }. Built on node:http only.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { AppError, betsConfig, gameConfig, cheatsList, play, validate, profileFor } from './game.mjs';

const MAX_BODY = 1 << 20;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const data = type.startsWith('application/json') ? JSON.stringify(body) : String(body);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(data);
}

async function readJson(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > MAX_BODY) throw new AppError('Request body too large'); chunks.push(c); }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError('Body is not valid JSON'); }
}

/** SHA1 of a file inside the server's working directory (never outside it). */
async function checksum(root, file) {
  if (typeof file !== 'string' || !file) throw new AppError('file is required');
  const full = resolve(root, file);
  if (full !== root && !full.startsWith(root + sep)) throw new AppError('file is outside the game server');
  let data; try { data = await readFile(full); } catch { throw new AppError('file not found', { status: 404 }); }
  return createHash('sha1').update(data).digest('hex');
}

/**
 * opts: { provider, game, variants, runner, devRng, allowCheats, production, root, log }
 * Returns { server, setReady(bool), setQuitting() }.
 */
export function createApp(opts) {
  const { provider, game, variants, runner, devRng = null, allowCheats = false, production = true, root = process.cwd(), log = () => {} } = opts;
  let ready = false, quitting = false;

  const routes = async (req, url) => {
    const parts = url.pathname.split('/').filter(Boolean);
    const q = url.searchParams, m = req.method;
    if (m === 'GET' && url.pathname === '/health') return quitting ? ['text', 500, 'QUITING'] : ready ? ['text', 200, 'OK'] : ['text', 500, 'ERROR'];
    if (m === 'GET' && url.pathname === '/api/games') return [200, { [provider]: [game] }];
    if (m === 'GET' && url.pathname === '/api/games/checksum') return [200, { checksum: await checksum(root, q.get('file')) }];
    if (m === 'GET' && url.pathname === '/api/criticalFileChecksum') return [200, { checksum: await checksum(root, q.get('criticalFilePath')) }];
    if (parts[0] !== 'api' || parts[1] !== 'games' || parts.length !== 4) throw new AppError('Not found', { status: 404 });
    const [, , g, what] = parts;
    if (g !== game) throw new AppError(`Unknown game "${g}"`, { status: 404 });
    if (!ready) throw new AppError('Game server is not ready', { code: 'SERVER_ERROR', status: 503 });
    if (m === 'GET' && what === 'cheats') return [200, cheatsList(allowCheats)];
    if (m === 'GET' && what === 'config') return [200, gameConfig(profileFor(q.get('variant') || undefined, variants))];
    if (m === 'GET' && what === 'bets') return [200, { bets: betsConfig(variants[0]) }];
    if (m === 'POST' && what === 'play') return [200, await play(await readJson(req), { run: runner.run, devRng, variants, allowCheats })];
    if (m === 'POST' && what === 'validate') return [200, validate(await readJson(req), { variants })];
    if (m === 'POST' && what === 'action') { await readJson(req); throw new AppError('Poco Loco rounds are a single wager: there is no next action'); }
    if (m === 'POST' && what === 'evaluate') { await readJson(req); throw new AppError('No evaluations are implemented for this game'); }
    throw new AppError('Not found', { status: 404 });
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const t0 = Date.now();
    try {
      const r = await routes(req, url);
      if (r[0] === 'text') send(res, r[1], r[2], 'text/plain; charset=utf-8'); else send(res, r[0], r[1]);
    } catch (e) {
      const app = e instanceof AppError;
      const status = app ? e.status : 500, code = app ? e.code : 'SERVER_ERROR';
      if (!app) log('error', `${req.method} ${url.pathname}: ${e.stack || e}`);
      const message = production ? (status >= 500 ? 'Server error' : 'Application error') : String(e.message || e);
      send(res, status, { error: { message, code } });
    } finally {
      if (url.pathname !== '/health') log('info', `${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - t0}ms`);
    }
  });

  return { server, setReady: v => { ready = v; }, setQuitting: () => { quitting = true; } };
}
