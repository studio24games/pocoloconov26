// RNG adapters. The engine only ever calls rng.int(n) -> integer in [0, n).
// Seeded RNG is for simulation and reproducible tests ONLY.
// Production/RGS must inject a certified RNG (see CryptoRNG as the local stand-in).

/** xoshiro128** — fast, 128-bit state, good statistical quality for simulation. */
export class SeededRNG {
  constructor(seed = 1) {
    // splitmix32 to expand the seed into 4 words of state
    let s = seed >>> 0;
    const next = () => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.s = [next(), next(), next(), next()];
    if (this.s.every(v => v === 0)) this.s[0] = 1;
  }
  nextU32() {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t; s[3] = rotl(s[3], 11);
    return result;
  }
  /** Unbiased integer in [0, n) via rejection sampling. */
  int(n) {
    if (!(n > 0 && n <= 0x100000000)) throw new RangeError(`bad range ${n}`);
    const limit = 0x100000000 - (0x100000000 % n);
    let x;
    do { x = this.nextU32(); } while (x >= limit);
    return x % n;
  }
}

function rotl(x, k) { return ((x << k) | (x >>> (32 - k))) >>> 0; }

/** Node crypto-backed RNG for the local mock RGS. */
export async function createCryptoRNG() {
  const { randomInt } = await import('node:crypto');
  return { int: n => randomInt(n) };
}

/** Weighted pick over [[item, integerWeight], ...]. Integer maths only. */
export function pickWeighted(rng, table) {
  let total = 0;
  for (const [, w] of table) total += w;
  let x = rng.int(total);
  for (const [item, w] of table) {
    if (x < w) return item;
    x -= w;
  }
  throw new Error('unreachable');
}
