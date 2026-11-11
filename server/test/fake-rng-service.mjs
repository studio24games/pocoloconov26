// A stand-in for Tequity's RNG service (RNG_API.pdf) for local runs and tests: GET /api/numbers?provider&game&total.
// Not certified. Usage: node server/test/fake-rng-service.mjs [port]
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

export function fakeRngService() {
  let requests = 0;
  const server = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const total = Number(u.searchParams.get('total'));
    if (u.pathname !== '/api/numbers' || !u.searchParams.get('provider') || !u.searchParams.get('game') || !(total > 0 && total <= 100000)) {
      res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'bad request' })); return;
    }
    requests++;
    const b = randomBytes(total * 4);
    const numbers = Array.from({ length: total }, (_, i) => b.readUInt32BE(i * 4) / 0x100000000);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ numbers }));
  });
  return { server, requests: () => requests };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] || 8081);
  fakeRngService().server.listen(port, '127.0.0.1', () => console.log(`fake RNG service on :${port}`));
}
