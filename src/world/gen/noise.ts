// Noise primitives modelled on Minecraft 1.18+ (ImprovedNoise / PerlinNoise /
// NormalNoise / BlendedNoise). Seeding uses our own PRNG, so worlds are not
// seed-identical to vanilla, but the noise character (octaves, amplitudes,
// value scaling) is the same.

import { Rand, hashString, hash32 } from '../../core/rng';
import { clampedLerp } from '../../core/math';

const GX = new Int8Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, 0, -1, 0]);
const GY = new Int8Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1]);
const GZ = new Int8Array([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 1, 0, -1]);

function grad(h: number, x: number, y: number, z: number): number {
  const i = h & 15;
  return GX[i] * x + GY[i] * y + GZ[i] * z;
}

function smooth(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export class ImprovedNoise {
  readonly p = new Uint8Array(256);
  readonly xo: number;
  readonly yo: number;
  readonly zo: number;

  constructor(rand: Rand) {
    this.xo = rand.next() * 256;
    this.yo = rand.next() * 256;
    this.zo = rand.next() * 256;
    const p = this.p;
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 0; i < 256; i++) {
      const j = rand.nextInt(256 - i);
      const t = p[i];
      p[i] = p[i + j];
      p[i + j] = t;
    }
  }

  noise(x: number, y: number, z: number): number {
    const dx = x + this.xo, dy = y + this.yo, dz = z + this.zo;
    const ix = Math.floor(dx), iy = Math.floor(dy), iz = Math.floor(dz);
    const fx = dx - ix, fy = dy - iy, fz = dz - iz;
    return this.sampleAndLerp(ix, iy, iz, fx, fy, fz, fy);
  }

  /** Vanilla's "smeared" y variant used by the legacy blended noise. */
  noiseSmear(x: number, y: number, z: number, yScale: number, yMax: number): number {
    const dx = x + this.xo, dy = y + this.yo, dz = z + this.zo;
    const ix = Math.floor(dx), iy = Math.floor(dy), iz = Math.floor(dz);
    const fx = dx - ix, fy = dy - iy, fz = dz - iz;
    let o = 0;
    if (yScale !== 0) {
      const m = yMax >= 0 && yMax < fy ? yMax : fy;
      o = Math.floor(m / yScale + 1.0e-7) * yScale;
    }
    return this.sampleAndLerp(ix, iy, iz, fx, fy - o, fz, fy);
  }

  private sampleAndLerp(gx: number, gy: number, gz: number, dx: number, dyw: number, dz: number, dy: number): number {
    const p = this.p;
    const i = p[gx & 255];
    const j = p[(gx + 1) & 255];
    const k = p[(i + gy) & 255];
    const l = p[(i + gy + 1) & 255];
    const i1 = p[(j + gy) & 255];
    const j1 = p[(j + gy + 1) & 255];
    const d0 = grad(p[(k + gz) & 255], dx, dyw, dz);
    const d1 = grad(p[(i1 + gz) & 255], dx - 1, dyw, dz);
    const d2 = grad(p[(l + gz) & 255], dx, dyw - 1, dz);
    const d3 = grad(p[(j1 + gz) & 255], dx - 1, dyw - 1, dz);
    const d4 = grad(p[(k + gz + 1) & 255], dx, dyw, dz - 1);
    const d5 = grad(p[(i1 + gz + 1) & 255], dx - 1, dyw, dz - 1);
    const d6 = grad(p[(l + gz + 1) & 255], dx, dyw - 1, dz - 1);
    const d7 = grad(p[(j1 + gz + 1) & 255], dx - 1, dyw - 1, dz - 1);
    const sx = smooth(dx), sy = smooth(dy), sz = smooth(dz);
    const a0 = d0 + sx * (d1 - d0);
    const a1 = d2 + sx * (d3 - d2);
    const a2 = d4 + sx * (d5 - d4);
    const a3 = d6 + sx * (d7 - d6);
    const b0 = a0 + sy * (a1 - a0);
    const b1 = a2 + sy * (a3 - a2);
    return b0 + sz * (b1 - b0);
  }
}

export function wrap(d: number): number {
  return d - Math.floor(d / 3.3554432e7 + 0.5) * 3.3554432e7;
}

/** Seed source: derive independent streams by name. */
export class SeedSource {
  constructor(readonly lo: number, readonly hi: number) {}

  static fromWorldSeed(seed: bigint | number | string): SeedSource {
    let lo: number, hi: number;
    if (typeof seed === 'string') {
      lo = hashString(seed);
      hi = hashString('#' + seed + '#');
    } else {
      const b = BigInt(seed);
      lo = Number(b & 0xffffffffn) >>> 0;
      hi = Number((b >> 32n) & 0xffffffffn) >>> 0;
    }
    return new SeedSource(hash32(lo ^ 0x6a09e667), hash32(hi ^ 0xbb67ae85 ^ lo));
  }

  rand(name: string): Rand {
    const h = hashString(name);
    return new Rand(hash32(this.lo ^ h), hash32(this.hi + h));
  }

  sub(name: string): SeedSource {
    const h = hashString(name);
    return new SeedSource(hash32(this.lo ^ h ^ 0x5bd1e995), hash32(this.hi ^ Math.imul(h, 0x27d4eb2d)));
  }
}

export class PerlinNoise {
  readonly levels: (ImprovedNoise | null)[] = [];
  readonly amplitudes: number[];
  readonly lowestFreqInputFactor: number;
  readonly lowestFreqValueFactor: number;

  constructor(seeds: SeedSource, readonly firstOctave: number, amplitudes: number[]) {
    this.amplitudes = amplitudes;
    const n = amplitudes.length;
    for (let i = 0; i < n; i++) {
      this.levels.push(amplitudes[i] !== 0 ? new ImprovedNoise(seeds.rand('octave_' + (firstOctave + i))) : null);
    }
    this.lowestFreqInputFactor = Math.pow(2, firstOctave);
    this.lowestFreqValueFactor = Math.pow(2, n - 1) / (Math.pow(2, n) - 1);
  }

  getValue(x: number, y: number, z: number): number {
    let sum = 0;
    let inF = this.lowestFreqInputFactor;
    let valF = this.lowestFreqValueFactor;
    const levels = this.levels;
    for (let i = 0; i < levels.length; i++) {
      const n = levels[i];
      if (n !== null) sum += this.amplitudes[i] * n.noise(wrap(x * inF), wrap(y * inF), wrap(z * inF)) * valF;
      inF *= 2;
      valF /= 2;
    }
    return sum;
  }

  /** Maximum possible absolute value (approximate, used for early-outs). */
  maxValue(): number {
    let sum = 0;
    let valF = this.lowestFreqValueFactor;
    for (let i = 0; i < this.amplitudes.length; i++) {
      if (this.levels[i]) sum += Math.abs(this.amplitudes[i]) * valF;
      valF /= 2;
    }
    return sum;
  }
}

export interface NoiseParams {
  firstOctave: number;
  amplitudes: number[];
}

export class NormalNoise {
  private readonly first: PerlinNoise;
  private readonly second: PerlinNoise;
  readonly valueFactor: number;
  static readonly INPUT_FACTOR = 1.0181268882175227;

  constructor(seeds: SeedSource, params: NoiseParams) {
    this.first = new PerlinNoise(seeds.sub('a'), params.firstOctave, params.amplitudes);
    this.second = new PerlinNoise(seeds.sub('b'), params.firstOctave, params.amplitudes);
    let lo = Infinity, hi = -Infinity;
    params.amplitudes.forEach((a, i) => {
      if (a !== 0) {
        lo = Math.min(lo, i);
        hi = Math.max(hi, i);
      }
    });
    const octaves = hi - lo;
    const expectedDeviation = 0.1 * (1 + 1 / (octaves + 1));
    this.valueFactor = 0.16666666666666666 / expectedDeviation;
  }

  getValue(x: number, y: number, z: number): number {
    const f = NormalNoise.INPUT_FACTOR;
    return (this.first.getValue(x, y, z) + this.second.getValue(x * f, y * f, z * f)) * this.valueFactor;
  }
}

/** Vanilla's legacy "old_blended_noise" 3D terrain noise. */
export class BlendedNoise {
  private readonly minLimit: ImprovedNoise[] = [];
  private readonly maxLimit: ImprovedNoise[] = [];
  private readonly main: ImprovedNoise[] = [];
  private readonly xzMultiplier: number;
  private readonly yMultiplier: number;

  constructor(
    seeds: SeedSource,
    xzScale = 0.25,
    yScale = 0.125,
    private readonly xzFactor = 80,
    private readonly yFactor = 160,
    private readonly smear = 8,
  ) {
    for (let i = 0; i < 16; i++) this.minLimit.push(new ImprovedNoise(seeds.rand('min_limit_' + i)));
    for (let i = 0; i < 16; i++) this.maxLimit.push(new ImprovedNoise(seeds.rand('max_limit_' + i)));
    for (let i = 0; i < 8; i++) this.main.push(new ImprovedNoise(seeds.rand('main_' + i)));
    this.xzMultiplier = 684.412 * xzScale;
    this.yMultiplier = 684.412 * yScale;
  }

  compute(x: number, y: number, z: number): number {
    const d = x * this.xzMultiplier;
    const e = y * this.yMultiplier;
    const f = z * this.xzMultiplier;
    const g = d / this.xzFactor;
    const h = e / this.yFactor;
    const i = f / this.xzFactor;
    const j = this.yMultiplier * this.smear;
    const k = j / this.yFactor;
    let l = 0, m = 0, n = 0;
    let o = 1;
    for (let p = 0; p < 8; p++) {
      n += this.main[p].noiseSmear(wrap(g * o), wrap(h * o), wrap(i * o), k * o, h * o) / o;
      o /= 2;
    }
    const q = (n / 10 + 1) / 2;
    const hiQ = q >= 1;
    const loQ = q <= 0;
    o = 1;
    for (let r = 0; r < 16; r++) {
      const s = wrap(d * o), t = wrap(e * o), u = wrap(f * o);
      const v = j * o;
      if (!hiQ) l += this.minLimit[r].noiseSmear(s, t, u, v, e * o) / o;
      if (!loQ) m += this.maxLimit[r].noiseSmear(s, t, u, v, e * o) / o;
      o /= 2;
    }
    return clampedLerp(l / 512, m / 512, q) / 128;
  }
}

/** Simple 2D simplex-free value noise helper for decoration (fast, tileable-free). */
export class SimpleNoise2D {
  private readonly n: ImprovedNoise;
  constructor(seeds: SeedSource, name: string) {
    this.n = new ImprovedNoise(seeds.rand(name));
  }
  get(x: number, z: number): number {
    return this.n.noise(x, 0, z);
  }
}
