// Overworld noise router (density functions) modelled on vanilla 1.18+.

import { NormalNoise, BlendedNoise, SeedSource, NoiseParams } from './noise';
import { overworldOffset, overworldFactor, overworldJaggedness, peaksAndValleys, Spline, ClimatePoint } from './spline';
import { clampedMap } from '../../core/math';

export const NOISES: Record<string, NoiseParams> = {
  temperature: { firstOctave: -10, amplitudes: [1.5, 0, 1, 0, 0, 0] },
  vegetation: { firstOctave: -8, amplitudes: [1, 1, 0, 0, 0, 0] },
  continentalness: { firstOctave: -9, amplitudes: [1, 1, 2, 2, 2, 1, 1, 1, 1] },
  erosion: { firstOctave: -9, amplitudes: [1, 1, 0, 1, 1] },
  ridge: { firstOctave: -7, amplitudes: [1, 2, 1, 0, 0, 0] },
  offset: { firstOctave: -3, amplitudes: [1, 1, 1, 0] },
  jagged: { firstOctave: -16, amplitudes: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  cave_entrance: { firstOctave: -7, amplitudes: [0.4, 0.5, 1] },
  cave_layer: { firstOctave: -8, amplitudes: [1] },
  cave_cheese: { firstOctave: -8, amplitudes: [0.5, 1, 2, 1, 2, 1, 0, 2, 0] },
  spaghetti_2d: { firstOctave: -7, amplitudes: [1] },
  spaghetti_2d_elevation: { firstOctave: -8, amplitudes: [1] },
  spaghetti_2d_modulator: { firstOctave: -11, amplitudes: [1] },
  spaghetti_2d_thickness: { firstOctave: -11, amplitudes: [1] },
  spaghetti_3d_1: { firstOctave: -7, amplitudes: [1] },
  spaghetti_3d_2: { firstOctave: -7, amplitudes: [1] },
  spaghetti_3d_rarity: { firstOctave: -11, amplitudes: [1] },
  spaghetti_3d_thickness: { firstOctave: -8, amplitudes: [1] },
  spaghetti_roughness: { firstOctave: -5, amplitudes: [1] },
  spaghetti_roughness_modulator: { firstOctave: -8, amplitudes: [1] },
  noodle: { firstOctave: -8, amplitudes: [1] },
  noodle_thickness: { firstOctave: -8, amplitudes: [1] },
  noodle_ridge_a: { firstOctave: -7, amplitudes: [1] },
  noodle_ridge_b: { firstOctave: -7, amplitudes: [1] },
  pillar: { firstOctave: -7, amplitudes: [1, 1] },
  pillar_rareness: { firstOctave: -8, amplitudes: [1] },
  pillar_thickness: { firstOctave: -8, amplitudes: [1] },
  aquifer_barrier: { firstOctave: -3, amplitudes: [1] },
  aquifer_fluid_level_floodedness: { firstOctave: -7, amplitudes: [1] },
  aquifer_fluid_level_spread: { firstOctave: -5, amplitudes: [1] },
  aquifer_lava: { firstOctave: -1, amplitudes: [1] },
  ore_veininess: { firstOctave: -8, amplitudes: [1] },
  ore_vein_a: { firstOctave: -7, amplitudes: [1] },
  ore_vein_b: { firstOctave: -7, amplitudes: [1] },
  ore_gap: { firstOctave: -5, amplitudes: [1] },
  surface: { firstOctave: -6, amplitudes: [1, 1, 1] },
  surface_secondary: { firstOctave: -6, amplitudes: [1, 1, 0, 1] },
  calcite: { firstOctave: -9, amplitudes: [1, 1, 1, 1] },
  gravel: { firstOctave: -8, amplitudes: [1, 1, 1, 1] },
  powder_snow: { firstOctave: -6, amplitudes: [1, 1, 1, 1] },
  packed_ice: { firstOctave: -7, amplitudes: [1, 1, 1, 1] },
  ice: { firstOctave: -4, amplitudes: [1, 1, 1, 1] },
  swamp: { firstOctave: -2, amplitudes: [1] },
  badlands_pillar: { firstOctave: -2, amplitudes: [1, 1, 1, 1] },
  badlands_pillar_roof: { firstOctave: -8, amplitudes: [1] },
  badlands_surface: { firstOctave: -6, amplitudes: [1, 1, 1] },
  iceberg_pillar: { firstOctave: -6, amplitudes: [1, 1, 1, 1] },
  iceberg_pillar_roof: { firstOctave: -3, amplitudes: [1] },
  iceberg_surface: { firstOctave: -6, amplitudes: [1, 1, 1] },
  clay_bands_offset: { firstOctave: -8, amplitudes: [1] },
  patch: { firstOctave: -5, amplitudes: [1, 0, 0, 0, 0, 0] },
  temperature_variation: { firstOctave: -3, amplitudes: [1] },
};

export interface ColumnSample {
  x: number;
  z: number;
  continents: number;
  erosion: number;
  ridges: number;
  ridgesFolded: number;
  temperature: number;
  humidity: number;
  offset: number;
  factor: number;
  jaggedness: number;
  jaggedNoise: number;
  elevation: number; // spaghetti 2d elevation (2D)
  /** preliminary surface level (block y), computed lazily */
  prelim: number;
}

export function newColumn(): ColumnSample {
  return {
    x: 0, z: 0, continents: 0, erosion: 0, ridges: 0, ridgesFolded: 0, temperature: 0, humidity: 0,
    offset: 0, factor: 0, jaggedness: 0, jaggedNoise: 0, elevation: 0, prelim: NaN,
  };
}

/** Channels computed at cell corners and interpolated per block. */
export const CH_MAIN = 0, CH_NTOGGLE = 1, CH_NTHICK = 2, CH_NRA = 3, CH_NRB = 4, CH_VTOGGLE = 5, CH_VRIDGED = 6;
export const CHANNELS = 7;

function rarity2D(d: number): number {
  if (d < -0.75) return 0.5;
  if (d < -0.5) return 0.75;
  if (d < 0.5) return 1;
  return d < 0.75 ? 2 : 3;
}

function rarity3D(d: number): number {
  if (d < -0.5) return 0.75;
  if (d < 0) return 1;
  return d < 0.5 ? 1.5 : 2;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class OverworldRouter {
  readonly n: Record<string, NormalNoise> = {};
  readonly base3d: BlendedNoise;
  private readonly offsetSpline: Spline;
  private readonly factorSpline: Spline;
  private readonly jaggedSpline: Spline;
  private readonly cp: ClimatePoint = { continents: 0, erosion: 0, ridges: 0, ridgesFolded: 0 };

  constructor(readonly seeds: SeedSource) {
    for (const k in NOISES) this.n[k] = new NormalNoise(seeds.sub('minecraft:' + k), NOISES[k]);
    this.base3d = new BlendedNoise(seeds.sub('minecraft:terrain'));
    this.offsetSpline = overworldOffset();
    this.factorSpline = overworldFactor();
    this.jaggedSpline = overworldJaggedness();
  }

  /** 2D climate/terrain-shape values at a block column. */
  column(x: number, z: number, out: ColumnSample): ColumnSample {
    const n = this.n;
    out.x = x;
    out.z = z;
    const sx = n.offset.getValue(x * 0.25, 0, z * 0.25) * 4;
    const sz = n.offset.getValue(z * 0.25, x * 0.25, 0) * 4;
    const qx = x * 0.25 + sx, qz = z * 0.25 + sz;
    out.continents = n.continentalness.getValue(qx, 0, qz);
    out.erosion = n.erosion.getValue(qx, 0, qz);
    out.ridges = n.ridge.getValue(qx, 0, qz);
    out.temperature = n.temperature.getValue(qx, 0, qz);
    out.humidity = n.vegetation.getValue(qx, 0, qz);
    out.ridgesFolded = peaksAndValleys(out.ridges);
    const cp = this.cp;
    cp.continents = out.continents;
    cp.erosion = out.erosion;
    cp.ridges = out.ridges;
    cp.ridgesFolded = out.ridgesFolded;
    out.offset = -0.50375 + this.offsetSpline.apply(cp);
    out.factor = this.factorSpline.apply(cp);
    out.jaggedness = this.jaggedSpline.apply(cp);
    out.jaggedNoise = out.jaggedness > 0 ? n.jagged.getValue(x * 1500, 0, z * 1500) : 0;
    out.elevation = 8 * n.spaghetti_2d_elevation.getValue(x, 0, z);
    out.prelim = NaN;
    return out;
  }

  /** "depth" density function: y gradient + offset. */
  depth(y: number, c: ColumnSample): number {
    return clampedMap(y, -64, 320, 1.5, -1.5) + c.offset;
  }

  /** Upper bound on sloped cheese without the 3D noise term (for skipping air). */
  slopedCheeseBase(y: number, c: ColumnSample): number {
    const depth = clampedMap(y, -64, 320, 1.5, -1.5) + c.offset;
    const jn = c.jaggedNoise;
    const dq = (depth + c.jaggedness * (jn > 0 ? jn : jn * 0.5)) * c.factor;
    return 4 * (dq > 0 ? dq : dq * 0.25);
  }

  /** Preliminary surface level (block y) per vanilla's initial_density_without_jaggedness scan. */
  preliminarySurface(c: ColumnSample): number {
    if (!Number.isNaN(c.prelim)) return c.prelim;
    for (let y = 320; y >= -64; y -= 8) {
      const depth = clampedMap(y, -64, 320, 1.5, -1.5) + c.offset;
      const dq = depth * c.factor;
      let v = 4 * (dq > 0 ? dq : dq * 0.25) - 0.703125;
      v = clamp(v, -64, 64);
      // slides
      const t = clampedMap(y, 240, 256, 1, 0);
      v = -0.078125 + t * (v + 0.078125);
      const b = clampedMap(y, -64, -40, 0, 1);
      v = 0.1171875 + b * (v - 0.1171875);
      if (v > 0.390625) {
        c.prelim = y;
        return y;
      }
    }
    c.prelim = -64;
    return -64;
  }

  /** Evaluate interpolated channels at a cell corner. */
  corner(x: number, y: number, z: number, c: ColumnSample, out: Float32Array, o: number, exact: boolean): void {
    const n = this.n;
    const inRange = y >= -60 && y <= 320;
    // noodle channels
    if (inRange) {
      out[o + CH_NTOGGLE] = n.noodle.getValue(x, y, z);
      out[o + CH_NTHICK] = -0.075 - 0.025 * n.noodle_thickness.getValue(x, y, z);
      out[o + CH_NRA] = n.noodle_ridge_a.getValue(x * 2.6666666666666665, y * 2.6666666666666665, z * 2.6666666666666665);
      out[o + CH_NRB] = n.noodle_ridge_b.getValue(x * 2.6666666666666665, y * 2.6666666666666665, z * 2.6666666666666665);
    } else {
      out[o + CH_NTOGGLE] = -1;
      out[o + CH_NTHICK] = 0;
      out[o + CH_NRA] = 0;
      out[o + CH_NRB] = 0;
    }
    // ore vein channels
    if (y >= -60 && y <= 50) {
      out[o + CH_VTOGGLE] = n.ore_veininess.getValue(x * 1.5, y * 1.5, z * 1.5);
      out[o + CH_VRIDGED] = -0.08 + Math.max(Math.abs(n.ore_vein_a.getValue(x * 4, y * 4, z * 4)), Math.abs(n.ore_vein_b.getValue(x * 4, y * 4, z * 4)));
    } else {
      out[o + CH_VTOGGLE] = 0;
      out[o + CH_VRIDGED] = 0;
    }
    if (!exact) {
      out[o + CH_MAIN] = -1;
      return;
    }
    // sloped cheese
    const sc = this.slopedCheeseBase(y, c) + this.base3d.compute(x, y, z);
    let inner: number;
    if (sc < 1.5625) {
      inner = Math.min(sc, 5 * this.entrances(x, y, z));
    } else {
      // underground caves
      const layer = n.cave_layer.getValue(x, y * 8, z);
      const cheese = n.cave_cheese.getValue(x, y * 0.6666666666666666, z);
      const cheeseCaves = 4 * layer * layer + clamp(0.27 + cheese, -1, 1) + clamp(1.5 - 0.64 * sc, 0, 0.5);
      const entr = this.entrances(x, y, z);
      const sp2 = this.spaghetti2d(x, y, z, c) + this.roughness(x, y, z);
      let v = Math.min(Math.min(cheeseCaves, entr), sp2);
      const pil = this.pillars(x, y, z);
      if (pil >= 0.03) v = Math.max(v, pil);
      inner = v;
    }
    // slides
    const t = clampedMap(y, 240, 256, 1, 0);
    let a = -0.078125 + t * (inner + 0.078125);
    const b = clampedMap(y, -64, -40, 0, 1);
    a = 0.1171875 + b * (a - 0.1171875);
    out[o + CH_MAIN] = a;
  }

  private roughnessCache = { x: NaN, y: NaN, z: NaN, v: 0 };
  roughness(x: number, y: number, z: number): number {
    const rc = this.roughnessCache;
    if (rc.x === x && rc.y === y && rc.z === z) return rc.v;
    const n = this.n;
    const v = (-0.05 - 0.05 * n.spaghetti_roughness_modulator.getValue(x, y, z)) * (-0.4 + Math.abs(n.spaghetti_roughness.getValue(x, y, z)));
    rc.x = x; rc.y = y; rc.z = z; rc.v = v;
    return v;
  }

  entrances(x: number, y: number, z: number): number {
    const n = this.n;
    const rar = n.spaghetti_3d_rarity.getValue(x * 2, y, z * 2);
    const r = rarity3D(rar);
    const s1 = r * Math.abs(n.spaghetti_3d_1.getValue(x / r, y / r, z / r));
    const s2 = r * Math.abs(n.spaghetti_3d_2.getValue(x / r, y / r, z / r));
    const thick = -0.0765 - 0.0115 * n.spaghetti_3d_thickness.getValue(x, y, z);
    const sp3 = clamp(Math.max(s1, s2) + thick, -1, 1);
    const ent = n.cave_entrance.getValue(x * 0.75, y * 0.5, z * 0.75) + 0.37 + clampedMap(y, -10, 30, 0.3, 0);
    return Math.min(ent, this.roughness(x, y, z) + sp3);
  }

  spaghetti2d(x: number, y: number, z: number, c: ColumnSample): number {
    const n = this.n;
    const mod = n.spaghetti_2d_modulator.getValue(x * 2, y, z * 2);
    const r = rarity2D(mod);
    const weird = r * Math.abs(n.spaghetti_2d.getValue(x / r, y / r, z / r));
    const thickMod = -0.95 - 0.35 * n.spaghetti_2d_thickness.getValue(x * 2, y, z * 2);
    const elevTerm = Math.abs(c.elevation + clampedMap(y, -64, 320, 8, -40));
    const tt = elevTerm + thickMod;
    const thickTerm = tt * tt * tt;
    return clamp(Math.max(weird + 0.083 * thickMod, thickTerm), -1, 1);
  }

  pillars(x: number, y: number, z: number): number {
    const n = this.n;
    const p = n.pillar.getValue(x * 25, y * 0.3, z * 25);
    const rare = -1 - n.pillar_rareness.getValue(x, y, z);
    const th = 0.55 + 0.55 * n.pillar_thickness.getValue(x, y, z);
    return (2 * p + rare) * th * th * th;
  }
}

export function squeeze(x: number): number {
  const d = x < -1 ? -1 : x > 1 ? 1 : x;
  return d / 2 - (d * d * d) / 24;
}
