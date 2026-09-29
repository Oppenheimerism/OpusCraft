// vanilla Biome.getTemperature: a biome's base temperature, patchy in the frozen oceans (TemperatureModifier.FROZEN)
// and falling with height above y 80. The noises behind it have fixed seeds, so they're the same in every world:
// the snow line wanders the same way on every mountain of every seed.

import { JavaRandom } from '../../core/rng';

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
/** vanilla SimplexNoise.GRADIENT (x and y parts; the 2D noise ignores z) */
const GRAD = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1];

/** vanilla SimplexNoise, 2D only */
class SimplexNoise {
  private readonly p = new Int32Array(256);

  constructor(r: JavaRandom) {
    // (the offsets are drawn but never used here: every temperature lookup passes useNoiseOffsets = false)
    r.nextDouble();
    r.nextDouble();
    r.nextDouble();
    for (let i = 0; i < 256; i++) this.p[i] = i;
    for (let l = 0; l < 256; l++) {
      const j = r.nextInt(256 - l);
      const k = this.p[l];
      this.p[l] = this.p[j + l];
      this.p[j + l] = k;
    }
  }

  private perm(i: number): number {
    return this.p[i & 255];
  }

  private corner(g: number, x: number, y: number): number {
    let d = 0.5 - x * x - y * y;
    if (d < 0) return 0;
    d *= d;
    return d * d * (GRAD[g * 2] * x + GRAD[g * 2 + 1] * y);
  }

  getValue(x: number, y: number): number {
    const s = (x + y) * F2;
    const i = Math.floor(x + s), j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t), y0 = y - (j - t);
    const k = x0 > y0 ? 1 : 0, l = x0 > y0 ? 0 : 1;
    const x1 = x0 - k + G2, y1 = y0 - l + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const i1 = i & 255, j1 = j & 255;
    const g0 = this.perm(i1 + this.perm(j1)) % 12;
    const g1 = this.perm(i1 + k + this.perm(j1 + l)) % 12;
    const g2 = this.perm(i1 + 1 + this.perm(j1 + 1)) % 12;
    return 70 * (this.corner(g0, x0, y0) + this.corner(g1, x1, y1) + this.corner(g2, x2, y2));
  }
}

/** vanilla PerlinSimplexNoise over octaves up to 0 (all the temperature noises need) */
class PerlinSimplexNoise {
  private readonly levels: (SimplexNoise | null)[];
  private readonly valueFactor: number;

  constructor(seed: number, octaves: number[]) {
    const r = new JavaRandom(seed);
    const lowest = -Math.min(...octaves), highest = Math.max(...octaves);
    const k = lowest + highest + 1;
    const first = new SimplexNoise(r);
    this.levels = new Array(k).fill(null);
    if (highest >= 0 && highest < k && octaves.includes(0)) this.levels[highest] = first;
    for (let i = highest + 1; i < k; i++) {
      if (octaves.includes(highest - i)) this.levels[i] = new SimplexNoise(r);
      else for (let n = 0; n < 262; n++) r.next(32);
    }
    this.valueFactor = 1 / (2 ** k - 1);
  }

  getValue(x: number, y: number): number {
    let v = 0, input = 1, value = this.valueFactor;
    for (const n of this.levels) {
      if (n) v += n.getValue(x * input, y * input) * value;
      input /= 2;
      value *= 2;
    }
    return v;
  }
}

let noises: { temperature: PerlinSimplexNoise; frozen: PerlinSimplexNoise; info: PerlinSimplexNoise } | null = null;
function N() {
  return (noises ??= {
    temperature: new PerlinSimplexNoise(1234, [0]),
    frozen: new PerlinSimplexNoise(3456, [-2, -1, 0]),
    info: new PerlinSimplexNoise(2345, [0]),
  });
}

const f32 = Math.fround;

/** (remaining mobs: the panda) vanilla Biome.BIOME_INFO_NOISE.getValue(x, z, false) (NoiseBasedCountPlacement's) */
export function biomeInfoNoise(x: number, z: number): number {
  return N().info.getValue(x, z);
}

/** vanilla Biome.getTemperature at a block (float arithmetic, as vanilla's threshold checks see it) */
export function biomeTemperature(base: number, frozen: boolean, x: number, y: number, z: number): number {
  let t = f32(base);
  if (frozen) {
    // vanilla TemperatureModifier.FROZEN: frozen oceans have milder patches where the water stays open
    const n = N();
    const d = n.frozen.getValue(x * 0.05, z * 0.05) * 7 + n.info.getValue(x * 0.2, z * 0.2);
    if (d < 0.3 && n.info.getValue(x * 0.09, z * 0.09) < 0.8) t = f32(0.2);
  }
  if (y > 80) {
    const f1 = f32(N().temperature.getValue(f32(x / 8), f32(z / 8)) * 8);
    return f32(t - f32(f32(f32(f32(f1 + y) - 80) * f32(0.05)) / 40));
  }
  return t;
}

/** vanilla Biome.coldEnoughToSnow */
export function coldEnoughToSnow(base: number, frozen: boolean, x: number, y: number, z: number): boolean {
  return !(biomeTemperature(base, frozen, x, y, z) >= f32(0.15));
}
