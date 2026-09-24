// Vanilla's legacy random source and simplex noise, bit for bit: what the End's
// islands, its 3D terrain noise and its obsidian spikes are made from, so for a
// numeric seed they come out exactly where vanilla puts them.

/** Java String.hashCode (vanilla WorldOptions.parseSeed for text seeds) */
function javaHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

/** a world's seed as the signed 64-bit long vanilla keeps it as */
export function seedLong(seed: string | number | bigint): bigint {
  if (typeof seed === 'bigint') return BigInt.asIntN(64, seed);
  if (typeof seed === 'number') return BigInt.asIntN(64, BigInt(Math.trunc(seed)));
  const s = seed.trim();
  if (/^-?\d+$/.test(s)) return BigInt.asIntN(64, BigInt(s));
  return BigInt(javaHash(s));
}

const TWO24 = 16777216;
/** vanilla BitRandomSource.DOUBLE_MULTIPLIER: the float 1.110223E-16F (which rounds to exactly 2^-53) */
const DOUBLE_MULTIPLIER = Math.fround(1.110223e-16);
/** vanilla BitRandomSource.FLOAT_MULTIPLIER 5.9604645E-8F (= 2^-24) */
const FLOAT_MULTIPLIER = Math.fround(5.9604645e-8);

/**
 * vanilla LegacyRandomSource (BitRandomSource): java.util.Random's 48-bit LCG (seed ^ 0x5DEECE66D,
 * x·0x5DEECE66D + 0xB mod 2^48), kept as two 24-bit halves.
 */
export class LegacyRandom {
  private hi = 0;
  private lo = 0;

  constructor(seed: bigint | number) {
    this.setSeed(seed);
  }

  setSeed(seed: bigint | number): void {
    const s = BigInt.asUintN(48, BigInt(seed) ^ 0x5deece66dn);
    this.hi = Number(s >> 24n);
    this.lo = Number(s & 0xffffffn);
  }

  /** vanilla next(bits): the top `bits` bits of the new state, as a Java int */
  next(bits: number): number {
    const loFull = this.lo * 0xece66d + 0xb;
    const carry = Math.floor(loFull / TWO24);
    const lo = loFull - carry * TWO24;
    // (the high half: only its low 24 bits matter; keep the products exact)
    const hi = ((this.hi * 0xece66d) % TWO24 + ((this.lo * 0x5de) % TWO24) + carry) % TWO24;
    this.lo = lo;
    this.hi = hi;
    const value = hi * TWO24 + lo;
    return Math.floor(value / 2 ** (48 - bits)) | 0;
  }

  nextInt(bound?: number): number {
    if (bound === undefined) return this.next(32);
    if (bound <= 0) throw new Error('bound must be positive');
    if ((bound & (bound - 1)) === 0) return Math.floor(this.next(31) / 2 ** (31 - Math.log2(bound)));
    let i: number, j: number;
    do {
      i = this.next(31);
      j = i % bound;
    } while (((i - j + (bound - 1)) | 0) < 0);
    return j;
  }

  /** a Java long, as a bigint */
  nextLong(): bigint {
    const i = this.next(32), j = this.next(32);
    return BigInt.asIntN(64, (BigInt(i) << 32n) + BigInt(j));
  }

  nextBoolean(): boolean {
    return this.next(1) !== 0;
  }

  nextFloat(): number {
    return Math.fround(this.next(24) * FLOAT_MULTIPLIER);
  }

  nextDouble(): number {
    const i = this.next(26), j = this.next(27);
    return (i * 134217728 + j) * DOUBLE_MULTIPLIER;
  }

  /** vanilla RandomSource.consumeCount: skip `n` ints */
  consumeCount(n: number): void {
    for (let i = 0; i < n; i++) this.next(32);
  }

  /** the shape codebase noises are built from (ImprovedNoise takes next() and nextInt(n)) */
  asNoiseRandom(): { next(): number; nextInt(n: number): number } {
    return { next: () => this.nextDouble(), nextInt: (n: number) => this.nextInt(n) };
  }
}

// vanilla SimplexNoise.GRADIENT (the first 12 are used)
const GRAD: [number, number, number][] = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];
const SQRT_3 = Math.sqrt(3);
const F2 = 0.5 * (SQRT_3 - 1);
const G2 = (3 - SQRT_3) / 6;

/** vanilla SimplexNoise (2D): the permutation from a random source; the offsets are drawn but getValue(x, y) doesn't use them */
export class SimplexNoise {
  private readonly p = new Int32Array(256);
  readonly xo: number;
  readonly yo: number;
  readonly zo: number;

  constructor(random: LegacyRandom) {
    this.xo = random.nextDouble() * 256;
    this.yo = random.nextDouble() * 256;
    this.zo = random.nextDouble() * 256;
    const p = this.p;
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 0; i < 256; i++) {
      const j = random.nextInt(256 - i);
      const k = p[i];
      p[i] = p[j + i];
      p[j + i] = k;
    }
  }

  private perm(i: number): number {
    return this.p[i & 255];
  }

  private corner(g: number, x: number, y: number): number {
    let d = 0.5 - x * x - y * y;
    if (d < 0) return 0;
    d *= d;
    return d * d * (GRAD[g][0] * x + GRAD[g][1] * y);
  }

  getValue(x: number, y: number): number {
    const d = (x + y) * F2;
    const i = Math.floor(x + d), j = Math.floor(y + d);
    const e = (i + j) * G2;
    const h = x - (i - e), k = y - (j - e);
    const [l, m] = h > k ? [1, 0] : [0, 1];
    const n = h - l + G2, o = k - m + G2;
    const p = h - 1 + 2 * G2, q = k - 1 + 2 * G2;
    const r = i & 255, s = j & 255;
    const t = this.perm(r + this.perm(s)) % 12;
    const u = this.perm(r + l + this.perm(s + m)) % 12;
    const v = this.perm(r + 1 + this.perm(s + 1)) % 12;
    return 70 * (this.corner(t, h, k) + this.corner(u, n, o) + this.corner(v, p, q));
  }
}
