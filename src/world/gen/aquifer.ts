// Noise-based aquifers (vanilla 1.18+ style): underground water/lava pockets
// with their own fluid levels and stone barriers between them.

import { OverworldRouter, ColumnSample, newColumn } from './router';
import { hash3, hash32 } from '../../core/rng';
import { clampedMap } from '../../core/math';

export const FLUID_NONE = 0, FLUID_WATER = 1, FLUID_LAVA = 2;
const WAY_BELOW = -2032;
const SEA_LEVEL = 63;
const LAVA_LEVEL = -54;
// vanilla OverworldBiomeBuilder.isDeepDarkRegion: erosion < -0.225F && depth > 0.9F (floats, compared as doubles)
const DEEP_DARK_EROSION = Math.fround(-0.225);
const DEEP_DARK_DEPTH = Math.fround(0.9);

const SURFACE_OFFSETS = [
  [-2, -1], [-1, -1], [0, -1], [1, -1], [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [-2, 1], [-1, 1], [0, 1], [1, 1],
];

interface FluidStatus {
  level: number;
  type: number; // FLUID_WATER / FLUID_LAVA
}

const GLOBAL_WATER: FluidStatus = { level: SEA_LEVEL, type: FLUID_WATER };
const GLOBAL_LAVA: FluidStatus = { level: LAVA_LEVEL, type: FLUID_LAVA };

function globalFluid(y: number): FluidStatus {
  return y < LAVA_LEVEL ? GLOBAL_LAVA : GLOBAL_WATER;
}

function at(fs: FluidStatus, y: number): number {
  return y < fs.level ? fs.type : FLUID_NONE;
}

function similarity(a: number, b: number): number {
  return 1 - Math.abs(b - a) / 25;
}

export class Aquifer {
  private readonly centers = new Map<number, number[]>();
  private readonly statuses = new Map<number, FluidStatus>();
  private readonly columns = new Map<number, ColumnSample>();
  /** set to true when the last computed substance should get a fluid tick */
  shouldScheduleFluidUpdate = false;

  constructor(private readonly router: OverworldRouter, private readonly seed: number) {}

  private col(x: number, z: number): ColumnSample {
    // quantize to quart columns like vanilla's preliminary surface cache
    const qx = x >> 2, qz = z >> 2;
    const key = qx * 131071 + qz;
    let c = this.columns.get(key);
    if (!c) {
      c = this.router.column(qx << 2, qz << 2, newColumn());
      this.columns.set(key, c);
    }
    return c;
  }

  prelim(x: number, z: number): number {
    return this.router.preliminarySurface(this.col(x, z));
  }

  private center(gx: number, gy: number, gz: number): number[] {
    const key = (gx * 4099 + gy) * 8191 + gz;
    let c = this.centers.get(key);
    if (!c) {
      const h = hash3(gx, gy, gz, this.seed);
      const h2 = hash32(h + 1), h3 = hash32(h + 2);
      c = [gx * 16 + (h % 10), gy * 12 + (h2 % 9), gz * 16 + (h3 % 10)];
      this.centers.set(key, c);
    }
    return c;
  }

  private status(x: number, y: number, z: number): FluidStatus {
    const key = (x * 4099 + y) * 8191 + z;
    let s = this.statuses.get(key);
    if (!s) {
      s = this.computeFluid(x, y, z);
      this.statuses.set(key, s);
    }
    return s;
  }

  private computeFluid(x: number, y: number, z: number): FluidStatus {
    const global = globalFluid(y);
    let minSurface = Infinity;
    const topY = y + 12, bottomY = y - 12;
    let flag = false;
    for (const [ox, oz] of SURFACE_OFFSETS) {
      const sx = x + ox * 16, sz = z + oz * 16;
      const surface = this.prelim(sx, sz);
      const surfaceTop = surface + 8;
      const center = ox === 0 && oz === 0;
      if (center && bottomY > surfaceTop) return global;
      const above = topY > surfaceTop;
      if (above || center) {
        const fs = globalFluid(surfaceTop);
        if (at(fs, surfaceTop) !== FLUID_NONE) {
          if (center) flag = true;
          if (above) return fs;
        }
      }
      minSurface = Math.min(minSurface, surface);
    }
    const level = this.surfaceLevel(x, y, z, global, minSurface, flag);
    return { level, type: this.fluidType(x, y, z, global, level) };
  }

  private surfaceLevel(x: number, y: number, z: number, global: FluidStatus, minSurface: number, flag: boolean): number {
    // vanilla NoiseBasedAquifer.computeSurfaceLevel: where the deep dark can be, the aquifers hold no water or lava
    // (only the lava sea below y -54 is left), so the deep dark and its ancient cities are dry. Erosion and the
    // offset come from the quart column, as vanilla's flat-cached router functions do inside a chunk.
    const c = this.col(x, z);
    if (c.erosion < DEEP_DARK_EROSION && this.router.depth(y, c) > DEEP_DARK_DEPTH) return WAY_BELOW;
    const n = this.router.n;
    const i = minSurface + 8 - y;
    const d2 = flag ? clampedMap(i, 0, 64, 1, 0) : 0;
    const d3 = Math.max(-1, Math.min(1, n.aquifer_fluid_level_floodedness.getValue(x, y * 0.67, z)));
    const d4 = d2 * (-0.3 - 0.8) + 0.8; // map(d2, 1,0, -0.3,0.8)
    const d5 = d2 * (-0.8 - 0.4) + 0.4; // map(d2, 1,0, -0.8,0.4)
    const d0 = d3 - d5;
    const d1 = d3 - d4;
    if (d1 > 0) return global.level;
    if (d0 > 0) return this.randomizedLevel(x, y, z, minSurface);
    return WAY_BELOW;
  }

  private randomizedLevel(x: number, y: number, z: number, minSurface: number): number {
    const k = Math.floor(x / 16), l = Math.floor(y / 40), m = Math.floor(z / 16);
    const j1 = l * 40 + 20;
    const d0 = this.router.n.aquifer_fluid_level_spread.getValue(k, l * 0.7142857142857143, m) * 10;
    const l1 = Math.floor(d0 / 3) * 3;
    return Math.min(minSurface, j1 + l1);
  }

  private fluidType(x: number, y: number, z: number, global: FluidStatus, level: number): number {
    let t = global.type;
    if (level <= -10 && level !== WAY_BELOW && global.type !== FLUID_LAVA) {
      const k = Math.floor(x / 64), l = Math.floor(y / 40), m = Math.floor(z / 64);
      const d0 = this.router.n.aquifer_lava.getValue(k, l, m);
      if (Math.abs(d0) > 0.3) t = FLUID_LAVA;
    }
    return t;
  }

  private barrier(x: number, y: number, z: number): number {
    return this.router.n.aquifer_barrier.getValue(x, y * 0.5, z);
  }

  private pressure(x: number, y: number, z: number, cache: { v: number }, fs1: FluidStatus, fs2: FluidStatus): number {
    const b1 = at(fs1, y), b2 = at(fs2, y);
    if ((b1 === FLUID_LAVA && b2 === FLUID_WATER) || (b1 === FLUID_WATER && b2 === FLUID_LAVA)) return 2;
    const j = Math.abs(fs1.level - fs2.level);
    if (j === 0) return 0;
    const d0 = 0.5 * (fs1.level + fs2.level);
    const d1 = y + 0.5 - d0;
    const d2 = j / 2;
    const d9 = d2 - Math.abs(d1);
    let d10: number;
    if (d1 > 0) {
      const d11 = d9;
      d10 = d11 > 0 ? d11 / 1.5 : d11 / 2.5;
    } else {
      const d15 = 3 + d9;
      d10 = d15 > 0 ? d15 / 3 : d15 / 10;
    }
    let d12 = 0;
    if (!(d10 < -2) && !(d10 > 2)) {
      if (Number.isNaN(cache.v)) cache.v = this.barrier(x, y, z);
      d12 = cache.v;
    }
    return 2 * (d12 + d10);
  }

  /**
   * Returns FLUID_NONE (air), FLUID_WATER, FLUID_LAVA, or -1 for "solid barrier".
   * density must be <= 0 (non-solid by noise).
   */
  substance(x: number, y: number, z: number, density: number): number {
    const g = globalFluid(y);
    if (at(g, y) === FLUID_LAVA) {
      this.shouldScheduleFluidUpdate = false;
      return FLUID_LAVA;
    }
    const l = Math.floor((x - 5) / 16), i1 = Math.floor((y + 1) / 12), j1 = Math.floor((z - 5) / 16);
    let k1 = Infinity, l1 = Infinity, i2 = Infinity;
    let p1: number[] | null = null, p2: number[] | null = null, p3: number[] | null = null;
    for (let a = 0; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (let c = 0; c <= 1; c++) {
          const pos = this.center(l + a, i1 + b, j1 + c);
          const dx = pos[0] - x, dy = pos[1] - y, dz = pos[2] - z;
          const d = dx * dx + dy * dy + dz * dz;
          if (k1 >= d) {
            i2 = l1; p3 = p2;
            l1 = k1; p2 = p1;
            k1 = d; p1 = pos;
          } else if (l1 >= d) {
            i2 = l1; p3 = p2;
            l1 = d; p2 = pos;
          } else if (i2 >= d) {
            i2 = d; p3 = pos;
          }
        }
    const fs1 = this.status(p1![0], p1![1], p1![2]);
    const d1 = similarity(k1, l1);
    const block = at(fs1, y);
    if (d1 <= 0) {
      this.shouldScheduleFluidUpdate = d1 >= -0.76;
      return block;
    }
    if (block === FLUID_WATER && at(globalFluid(y - 1), y - 1) === FLUID_LAVA) {
      this.shouldScheduleFluidUpdate = true;
      return block;
    }
    const cache = { v: NaN };
    const fs2 = this.status(p2![0], p2![1], p2![2]);
    const dd2 = d1 * this.pressure(x, y, z, cache, fs1, fs2);
    if (density + dd2 > 0) {
      this.shouldScheduleFluidUpdate = false;
      return -1;
    }
    const fs3 = this.status(p3![0], p3![1], p3![2]);
    const d0 = similarity(k1, i2);
    if (d0 > 0) {
      const d3 = d1 * d0 * this.pressure(x, y, z, cache, fs1, fs3);
      if (density + d3 > 0) {
        this.shouldScheduleFluidUpdate = false;
        return -1;
      }
    }
    const d4 = similarity(l1, i2);
    if (d4 > 0) {
      const d5 = d1 * d4 * this.pressure(x, y, z, cache, fs2, fs3);
      if (density + d5 > 0) {
        this.shouldScheduleFluidUpdate = false;
        return -1;
      }
    }
    this.shouldScheduleFluidUpdate = true;
    return block;
  }
}
