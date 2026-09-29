/**
 * Deterministic pseudo-random numbers. Every stochastic element of the
 * simulator (sensor noise, dataset sampling, scenario jitter) draws from an
 * explicitly seeded generator so that every experiment is reproducible.
 */

/** mulberry32: small, fast, well-distributed 32-bit generator. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;
  private spare: number | null = null;

  constructor(public readonly seed: number) {
    this.next = mulberry32(seed);
  }

  /** Uniform in [0, 1). */
  random(): number {
    return this.next();
  }

  uniform(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Standard normal via Box–Muller (caches the second variate). */
  normal(mu = 0, sigma = 1): number {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return mu + sigma * s;
    }
    let u = 0;
    let v = 0;
    while (u <= Number.EPSILON) u = this.next();
    v = this.next();
    const mag = Math.sqrt(-2 * Math.log(u));
    this.spare = mag * Math.sin(2 * Math.PI * v);
    return mu + sigma * mag * Math.cos(2 * Math.PI * v);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  /** Derive an independent child stream (for per-component noise). */
  fork(salt: number): Rng {
    return new Rng((Math.imul(this.seed ^ 0x9e3779b9, 0x85ebca6b) + salt * 0xc2b2ae35) >>> 0);
  }
}
