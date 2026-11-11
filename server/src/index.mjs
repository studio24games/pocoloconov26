// Poco Loco game server for Tequity (Xanadu), Mixed RGS integration. Configuration by environment:
//   PORT               port to listen on (set by Tequity; default 8080)
//   PROVIDER           provider name allocated by Xanadu (required)
//   GAME               game id agreed with Xanadu (default "pocoloco")
//   VARIANTS           comma-separated maths variants on offer, first = default (default "standard")
//   RNG_SERVICE_HOST, RNG_SERVICE_PORT   Tequity's certified RNG service (set by Tequity)
//   ALLOW_LOCAL_RNG=1  development only: use Node's crypto when no RNG service is configured
//   ALLOW_CHEATS=1     development only: accept forced outcomes (cheats)
//   ENVIRONMENT        "production" hides error details (default production)
import { createApp } from './app.mjs';
import { checkVariants } from './game.mjs';
import { createRunner, serviceSource, localSource, devRng } from './rng.mjs';
import { fileURLToPath } from 'node:url';

const env = process.env;
const log = (level, msg) => (level === 'error' ? console.error : console.log)(JSON.stringify({ time: new Date().toISOString(), level, msg }));
const fail = msg => { log('error', msg); process.exit(1); };

const provider = env.PROVIDER || fail('PROVIDER is not set');
const game = env.GAME || 'pocoloco';
let variants; try { variants = checkVariants((env.VARIANTS || 'standard').split(',').map(s => s.trim()).filter(Boolean)); } catch (e) { fail(e.message); }
const production = (env.ENVIRONMENT || 'production') === 'production';
const allowCheats = env.ALLOW_CHEATS === '1';
if (allowCheats && production) fail('ALLOW_CHEATS=1 is not allowed with ENVIRONMENT=production');

let source;
if (env.RNG_SERVICE_HOST && env.RNG_SERVICE_PORT) source = serviceSource({ host: env.RNG_SERVICE_HOST, port: env.RNG_SERVICE_PORT, provider, game });
else if (env.ALLOW_LOCAL_RNG === '1' && !production) source = localSource();
else fail('RNG_SERVICE_HOST and RNG_SERVICE_PORT are not set (ALLOW_LOCAL_RNG=1 only outside production)');

const runner = createRunner(source);
const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');   // /app: math/ and server/
const app = createApp({ provider, game, variants, runner, devRng: allowCheats ? devRng : null, allowCheats, production, root, log });
const port = Number(env.PORT || 8080);

app.server.listen(port, async () => {
  log('info', `Poco Loco game server on :${port} provider=${provider} game=${game} variants=${variants.join(',')} rng=${source.name} cheats=${allowCheats}`);
  for (let attempt = 1; ; attempt++) {
    try { await runner.fill(20000); app.setReady(true); log('info', 'ready'); break; }
    catch (e) { log('error', `RNG not reachable (attempt ${attempt}): ${e.message}`); await new Promise(r => setTimeout(r, Math.min(30000, 1000 * attempt))); }
  }
});

process.on('SIGTERM', () => {
  log('info', 'SIGTERM: quitting');
  app.setQuitting();
  app.server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10000).unref();
});
