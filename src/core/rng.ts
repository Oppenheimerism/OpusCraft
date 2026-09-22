// Random number generators and integer hashes.

/** 32-bit integer hash (lowbias32). Returns unsigned 32-bit. */
export function hash32(x: number): number {
  x |= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Hash of 3 ints + seed -> unsigned 32-bit. */
export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = hash32(seed ^ 0x9e3779b9);
  h = hash32(h ^ Math.imul(x | 0, 0x27d4eb2d));
  h = hash32(h ^ Math.imul(y | 0, 0x165667b1));
  h = hash32(h ^ Math.imul(z | 0, 0x85ebca6b));
  return h;
}

/** Hash of 2 ints + seed -> unsigned 32-bit. */
export function hash2(x: number, z: number, seed: number): number {
  let h = hash32(seed ^ 0x51ed270b);
  h = hash32(h ^ Math.imul(x | 0, 0x27d4eb2d));
  h = hash32(h ^ Math.imul(z | 0, 0x85ebca6b));
  return h;
}

/** Hash to float in [0,1). */
export function hashFloat(h: number): number {
  return (h >>> 8) / 16777216;
}

/** String hash (FNV-1a) -> unsigned 32-bit. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return hash32(h);
}

/**
 * Minecraft's position seed (Mth.getSeed), low 32 bits only. Good enough for
 * the bit ranges vanilla uses for plant offsets and model variant picks.
 */
export function mcPosSeed(x: number, y: number, z: number): number {
  const i = (Math.imul(x, 3129871) ^ Math.imul(z, 116129781) ^ y) | 0;
  const r = (Math.imul(Math.imul(i, i), 42317861) + Math.imul(i, 11)) | 0;
  return r >> 16;
}

/** xoshiro128** — fast seedable PRNG. */
export class Rand {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  private haveGauss = false;
  private nextGauss = 0;

  constructor(seed: number = (Math.random() * 0xffffffff) >>> 0, seed2 = 0) {
    this.a = hash32(seed ^ 0x3c6ef372) | 1;
    this.b = hash32(seed + 0x6a09e667 + seed2);
    this.c = hash32(seed2 ^ 0xbb67ae85);
    this.d = hash32(seed * 31 + seed2 + 0xa54ff53a);
    for (let i = 0; i < 4; i++) this.nextU32();
  }

  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.b, 5), 7), 9);
    const t = this.b << 9;
    this.c ^= this.a;
    this.d ^= this.b;
    this.b ^= this.c;
    this.a ^= this.d;
    this.c ^= t;
    this.d = rotl(this.d, 11);
    return result >>> 0;
  }

  /** [0, 1) */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  nextFloat(): number {
    return (this.nextU32() >>> 8) / 16777216;
  }

  nextDouble(): number {
    return ((this.nextU32() >>> 5) * 67108864 + (this.nextU32() >>> 6)) / 9007199254740992;
  }

  /** [0, n) */
  nextInt(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** inclusive range */
  range(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  nextBool(): boolean {
    return (this.nextU32() & 1) === 1;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  gaussian(): number {
    if (this.haveGauss) {
      this.haveGauss = false;
      return this.nextGauss;
    }
    let v1: number, v2: number, s: number;
    do {
      v1 = 2 * this.next() - 1;
      v2 = 2 * this.next() - 1;
      s = v1 * v1 + v2 * v2;
    } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    this.nextGauss = v2 * m;
    this.haveGauss = true;
    return v1 * m;
  }

  /** Triangle distribution centered on 0 with half width `spread`. */
  triangle(spread: number): number {
    return spread * (this.next() - this.next());
  }

  fork(salt: number): Rand {
    return new Rand(this.nextU32() ^ salt, this.nextU32());
  }
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/**
 * java.util.Random (48-bit LCG) implemented with 24-bit halves, used where
 * vanilla's exact sequence matters (e.g. the star field seed).
 */
export class JavaRandom {
  private hi = 0; // upper 24 bits
  private lo = 0; // lower 24 bits
  private haveGauss = false;
  private nextGauss = 0;

  constructor(seed: number) {
    this.setSeed(seed);
  }

  setSeed(seed: number): void {
    // seed may exceed 2^32; treat as integer and take low 48 bits
    const s = Math.floor(seed);
    let lo = s % 16777216;
    if (lo < 0) lo += 16777216;
    let hi = Math.floor(s / 16777216) % 16777216;
    if (hi < 0) hi += 16777216;
    // xor with multiplier 0x5DEECE66D = hi 0x5DE, lo 0xECE66D
    this.lo = lo ^ 0xece66d;
    this.hi = hi ^ 0x5de;
    this.haveGauss = false;
  }

  next(bits: number): number {
    const loFull = this.lo * 0xece66d + 0xb;
    const carry = Math.floor(loFull / 16777216);
    const newLo = loFull - carry * 16777216;
    const hiFull = this.hi * 0xece66d + this.lo * 0x5de + carry;
    const newHi = hiFull % 16777216;
    this.lo = newLo;
    this.hi = newHi;
    // value = hi * 2^24 + lo ; return value >>> (48 - bits) as int32
    const value = newHi * 16777216 + newLo;
    const r = Math.floor(value / Math.pow(2, 48 - bits));
    return r | 0;
  }

  nextInt(bound?: number): number {
    if (bound === undefined) return this.next(32);
    if ((bound & -bound) === bound) {
      // power of two
      return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    }
    let bits: number, val: number;
    do {
      bits = this.next(31);
      val = bits % bound;
    } while (bits - val + (bound - 1) < 0 || bits - val + (bound - 1) > 2147483647);
    return val;
  }

  nextFloat(): number {
    return this.next(24) / 16777216;
  }

  nextDouble(): number {
    const a = this.next(26) >>> 0;
    const b = this.next(27) >>> 0;
    return (a * 134217728 + b) / 9007199254740992;
  }

  nextBoolean(): boolean {
    return this.next(1) !== 0;
  }

  nextGaussian(): number {
    if (this.haveGauss) {
      this.haveGauss = false;
      return this.nextGauss;
    }
    let v1: number, v2: number, s: number;
    do {
      v1 = 2 * this.nextDouble() - 1;
      v2 = 2 * this.nextDouble() - 1;
      s = v1 * v1 + v2 * v2;
    } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    this.nextGauss = v2 * m;
    this.haveGauss = true;
    return v1 * m;
  }
}
