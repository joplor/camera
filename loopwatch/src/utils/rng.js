/**
 * Deterministic RNG utilities.
 *
 * For a loop-based game we *need* reproducibility: if the player reloads a
 * save at cycle 7, we want anomaly placements to match what they saw before.
 * Math.random is not seedable. These helpers give us a seeded mulberry32 PRNG
 * plus a few sugar methods built on top.
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    this.seed = typeof seed === "string" ? hashString(seed) : (seed >>> 0);
    this._next = mulberry32(this.seed);
  }
  f()              { return this._next(); }
  range(a, b)      { return a + (b - a) * this._next(); }
  int(a, b)        { return Math.floor(this.range(a, b + 1)); }
  pick(arr)        { return arr[Math.floor(this._next() * arr.length)]; }
  chance(p)        { return this._next() < p; }
  shuffle(arr)     {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this._next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  fork(label)      { return new Rng(this.seed ^ hashString(label)); }
}
