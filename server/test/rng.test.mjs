import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRunner, floatToU32, intFrom, serviceSource } from '../src/rng.mjs';
import { drawRound } from '../../math/wallet.js';
import { SeededRNG } from '../../math/rng.js';

/** A source that hands out a fixed stream of 32-bit integers, in order, in batches of the size asked. */
function streamSource(seed) {
  const r = new SeededRNG(seed); let calls = 0;
  return { name: 'stream', calls: () => calls, async fetch(total) { calls++; return Array.from({ length: total }, () => r.nextU32()); } };
}

test('floats from the service map back to their exact 32-bit integers', () => {
  assert.equal(floatToU32(0), 0);
  assert.equal(floatToU32(0.5), 0x80000000);
  assert.equal(floatToU32((0x100000000 - 1) / 0x100000000), 0xffffffff);
  for (const bad of [1, -0.1, NaN, '0.5', 0.1]) assert.throws(() => floatToU32(bad));   // 0.1 is not a 32-bit fraction
});

test('integers in [0, n) are unbiased: rejected values are consumed, never folded in', () => {
  const seq = [0xffffffff, 7];   // 0xffffffff is above the limit for n = 10, so it is rejected
  let i = 0; assert.equal(intFrom(() => seq[i++], 10), 7); assert.equal(i, 2);
  assert.throws(() => intFrom(() => 0, 0), RangeError);
});

test('a round that runs the buffer dry is replayed: identical to the round a huge buffer gives', async () => {
  const big = createRunner(streamSource(77), { target: 200000, batch: 200000 });
  const tiny = createRunner(streamSource(77), { target: 3, batch: 5 });
  for (const mode of ['buy', 'superbuy', 'base', 'double']) {
    for (let i = 0; i < (mode === 'buy' || mode === 'superbuy' ? 60 : 600); i++) {
      const a = await big.run(rng => drawRound(rng, { bet: 125, mode }));
      const b = await tiny.run(rng => drawRound(rng, { bet: 125, mode }));
      assert.deepEqual(b, a, `${mode} #${i}`);
    }
  }
  assert.equal(tiny.stats().drawn, big.stats().drawn, 'every number used exactly once');
});

test('numbers are consumed first to last, across rounds', async () => {
  const src = { name: 's', async fetch(total) { this.n = (this.n || 0); return Array.from({ length: total }, () => this.n++); } };
  const r = createRunner(src, { target: 4, batch: 4 });
  const seen = [];
  for (let k = 0; k < 3; k++) await r.run(rng => { seen.push(rng.int(1000), rng.int(1000)); });
  assert.deepEqual(seen, [0, 1, 2, 3, 4, 5]);
});

test('RNG service: request shape, {numbers} body, errors on bad answers', async () => {
  let url;
  const ok = async u => { url = u; return { ok: true, json: async () => ({ numbers: [0, 0.5] }) }; };
  const s = serviceSource({ host: 'rng', port: 8080, provider: 'gem', game: 'pocoloco', fetchImpl: ok });
  assert.deepEqual(await s.fetch(2), [0, 0x80000000]);
  assert.equal(url, 'http://rng:8080/api/numbers?provider=gem&game=pocoloco&total=2');
  await assert.rejects(serviceSource({ host: 'r', port: 1, provider: 'p', game: 'g', fetchImpl: async () => ({ ok: false, status: 503 }) }).fetch(2), /503/);
  await assert.rejects(serviceSource({ host: 'r', port: 1, provider: 'p', game: 'g', fetchImpl: async () => ({ ok: true, json: async () => [0.5] }) }).fetch(2), /wrong amount/);
});
