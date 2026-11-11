// Random numbers for the game server.
//
// Production: Tequity's certified RNG service (RNG_API.pdf), GET /api/numbers?provider=&game=&total= -> floats in
// [0, 1). Numbers are fetched in batches, cached, and consumed strictly first to last.
//
// Each float is turned back into the 32-bit integer it came from (f * 2^32, exact) and mapped to [0, n) by rejection
// sampling, the same unbiased method as math/rng.js. A rejected integer is consumed, never reused.
//
// The engine draws synchronously and a round's draw count has a long tail (base mean ~9, worst seen 32,051), so no
// fixed buffer is always enough. If the buffer runs dry mid-round, the runner fetches more and REPLAYS the round from
// the start with the numbers it already consumed, then continues with new ones. The engine is deterministic given
// its numbers, so the result is exactly the round a bigger buffer would have produced: no number is discarded and
// no round is re-drawn.
import { randomBytes, randomInt } from 'node:crypto';

const TWO32 = 0x100000000;
const EMPTY = Symbol('rng buffer empty');

/** float in [0, 1) from the RNG service -> its 32-bit integer. */
export function floatToU32(f) {
  if (typeof f !== 'number' || !(f >= 0 && f < 1)) throw new Error(`RNG returned an invalid number: ${f}`);
  const u = f * TWO32;
  if (!Number.isInteger(u)) throw new Error(`RNG number is not a 32-bit fraction: ${f}`);
  return u;
}

/** Unbiased integer in [0, n) from a stream of 32-bit integers (next() returns the next one). */
export function intFrom(next, n) {
  if (!(Number.isInteger(n) && n > 0 && n <= TWO32)) throw new RangeError(`bad range ${n}`);
  const limit = TWO32 - (TWO32 % n);
  let x;
  do { x = next(); } while (x >= limit);
  return x % n;
}

/** Tequity RNG service source. */
export function serviceSource({ host, port, provider, game, fetchImpl = fetch, timeoutMs = 5000 }) {
  const base = `http://${host}:${port}/api/numbers`;
  return {
    name: `rng-service ${host}:${port}`,
    async fetch(total) {
      const url = `${base}?provider=${encodeURIComponent(provider)}&game=${encodeURIComponent(game)}&total=${total}`;
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`RNG service answered ${res.status}`);
      const body = await res.json();
      const numbers = Array.isArray(body) ? body : body?.numbers;
      if (!Array.isArray(numbers) || numbers.length !== total) throw new Error('RNG service returned the wrong amount of numbers');
      return numbers.map(floatToU32);
    },
  };
}

/** Local source from Node's crypto: development and tests only (ALLOW_LOCAL_RNG=1). Not certified. */
export function localSource() {
  return {
    name: 'local crypto (NOT certified)',
    async fetch(total) { const b = randomBytes(total * 4); return Array.from({ length: total }, (_, i) => b.readUInt32BE(i * 4)); },
  };
}

/** Fast synchronous RNG for the re-draw loops of dev cheats only. */
export const devRng = { int: n => randomInt(n) };

/**
 * Buffered runner. run(fn) tops the buffer up to `target`, then calls fn(rng) where rng.int(n) draws from the buffer.
 * Concurrent rounds share one buffer; each round's numbers are consumed in order.
 */
export function createRunner(source, { target = 20000, batch = 10000 } = {}) {
  const buf = [];
  let head = 0, filling = null, drawn = 0, fetched = 0;

  async function fill(min) {
    while (buf.length - head < min) {
      if (!filling) filling = source.fetch(batch).then(nums => { if (head > 50000) { buf.splice(0, head); head = 0; } for (const u of nums) buf.push(u); fetched += nums.length; }).finally(() => { filling = null; });
      await filling;
    }
  }

  async function run(fn) {
    const used = [];
    for (;;) {
      await fill(target);
      let replay = 0;
      const next = () => {
        if (replay < used.length) return used[replay++];
        if (head >= buf.length) throw EMPTY;
        const u = buf[head++]; used.push(u); replay++; drawn++;
        return u;
      };
      try { return fn({ int: n => intFrom(next, n) }); }
      catch (e) { if (e !== EMPTY) throw e; await fill(Math.max(target, used.length)); }
    }
  }

  return { run, fill, stats: () => ({ source: source.name, buffered: buf.length - head, drawn, fetched }) };
}
