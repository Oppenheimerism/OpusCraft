// Carvers (vanilla CaveWorldCarver / CanyonWorldCarver with the 1.18+ overworld
// configured carvers "cave", "cave_extra_underground" and "canyon"): winding
// worm tunnels, round rooms and ravines cut through the terrain after the
// surface is built. Every chunk replays the carvers started in the 17x17
// chunks around it and keeps only what falls inside itself.

import { GenContext } from './context';
import type { Aquifer } from './aquifer';
import { FLUID_WATER, FLUID_LAVA } from './aquifer';
import { BLOCKS, STATE_BLOCK, S } from '../block';
import { MIN_Y, MAX_Y, colIndex } from '../constants';
import { Rand, hash2 } from '../../core/rng';
import { BIOMES } from './biomes';

const RANGE = 8;
const GEN_DEPTH = MAX_Y - MIN_Y;
const LAVA_LEVEL = MIN_Y + 8;

/** vanilla #overworld_carver_replaceables */
let REPLACEABLE: Uint8Array | null = null;
function replaceable(): Uint8Array {
  if (REPLACEABLE) return REPLACEABLE;
  const r = new Uint8Array(BLOCKS.length);
  const names = /^(stone|granite|diorite|andesite|tuff|deepslate|dirt|coarse_dirt|podzol|rooted_dirt|grass_block|mycelium|mud|sand|red_sand|gravel|sandstone|red_sandstone|calcite|snow|snow_block|powder_snow|packed_ice|water|clay|dripstone_block|raw_iron_block|raw_copper_block|iron_ore|deepslate_iron_ore|copper_ore|deepslate_copper_ore|terracotta|.*_terracotta)$/;
  BLOCKS.forEach((b, i) => (r[i] = names.test(b.name) ? 1 : 0));
  return (REPLACEABLE = r);
}

interface CaveConfig {
  probability: number;
  yMin: number;
  yMax: number;
}
const CAVE: CaveConfig = { probability: 0.15, yMin: MIN_Y + 8, yMax: 180 };
const CAVE_EXTRA: CaveConfig = { probability: 0.07, yMin: MIN_Y + 8, yMax: 47 };
const CANYON_PROBABILITY = 0.01;

const uniform = (r: Rand, a: number, b: number) => a + r.nextFloat() * (b - a);
const nextInt = (r: Rand, n: number) => (n <= 0 ? 0 : Math.floor(r.nextFloat() * n));
const nextSeed = (r: Rand) => (r.nextU32() ^ Math.imul(r.nextU32(), 0x9e3779b1)) >>> 0;

type SkipCheck = (rx: number, ry: number, rz: number, y: number) => boolean;

class ChunkCarving {
  readonly mask = new Uint8Array(16 * 16 * GEN_DEPTH);
  private readonly rep = replaceable();
  private readonly GRASS = S('grass_block');
  private readonly MYCELIUM = S('mycelium');
  private readonly DIRT = S('dirt');
  private readonly WATER = S('water');
  private readonly LAVA = S('lava');
  readonly midX: number;
  readonly midZ: number;

  constructor(readonly ctx: GenContext, readonly aquifer: Aquifer) {
    this.midX = ctx.x0 + 8;
    this.midZ = ctx.z0 + 8;
  }

  /** vanilla WorldCarver.canReach */
  canReach(x: number, z: number, branch: number, branchCount: number, width: number): boolean {
    const dx = x - this.midX, dz = z - this.midZ;
    const left = branchCount - branch;
    const d5 = width + 2 + 16;
    return dx * dx + dz * dz - left * left <= d5 * d5;
  }

  /** vanilla WorldCarver.carveEllipsoid */
  carveEllipsoid(x: number, y: number, z: number, hr: number, vr: number, skip: SkipCheck): void {
    const ctx = this.ctx;
    const d2 = 16 + hr * 2;
    if (Math.abs(x - this.midX) > d2 || Math.abs(z - this.midZ) > d2) return;
    const x0 = ctx.x0, z0 = ctx.z0;
    const k = Math.max(Math.floor(x - hr) - x0 - 1, 0);
    const l = Math.min(Math.floor(x + hr) - x0, 15);
    const i1 = Math.max(Math.floor(y - vr) - 1, MIN_Y + 1);
    const k1 = Math.min(Math.floor(y + vr) + 1, MIN_Y + GEN_DEPTH - 1 - 7);
    const l1 = Math.max(Math.floor(z - hr) - z0 - 1, 0);
    const i2 = Math.min(Math.floor(z + hr) - z0, 15);
    for (let lx = k; lx <= l; lx++) {
      const d3 = (x0 + lx + 0.5 - x) / hr;
      for (let lz = l1; lz <= i2; lz++) {
        const d4 = (z0 + lz + 0.5 - z) / hr;
        if (d3 * d3 + d4 * d4 >= 1) continue;
        let reachedSurface = false;
        for (let yy = k1; yy > i1; yy--) {
          const d5 = (yy - 0.5 - y) / vr;
          if (skip(d3, d5, d4, yy)) continue;
          const mi = ((yy - MIN_Y) * 16 + lz) * 16 + lx;
          if (this.mask[mi]) continue;
          this.mask[mi] = 1;
          reachedSurface = this.carveBlock(lx, yy, lz, reachedSurface);
        }
      }
    }
  }

  /** vanilla WorldCarver.carveBlock; returns whether the column has reached the surface */
  private carveBlock(lx: number, y: number, lz: number, reachedSurface: boolean): boolean {
    const b = this.ctx.blocks;
    const idx = colIndex(lx, y, lz);
    const st = b[idx];
    if (st === this.GRASS || st === this.MYCELIUM) reachedSurface = true;
    if (!this.rep[STATE_BLOCK[st]]) return reachedSurface;
    // vanilla getCarveState: lava at the very bottom, else what the aquifer puts here
    let to: number;
    if (y <= LAVA_LEVEL) to = this.LAVA;
    else {
      const sub = this.aquifer.substance(this.ctx.x0 + lx, y, this.ctx.z0 + lz, 0);
      if (sub === -1) return reachedSurface;
      to = sub === FLUID_WATER ? this.WATER : sub === FLUID_LAVA ? this.LAVA : 0;
    }
    b[idx] = to;
    // a tunnel breaking out under grass re-grasses the dirt below it
    if (reachedSurface && y - 1 > MIN_Y) {
      const below = colIndex(lx, y - 1, lz);
      if (b[below] === this.DIRT) {
        const biome = BIOMES[this.ctx.biomes[(lz << 4) | lx]];
        b[below] = to !== 0 ? this.DIRT : biome?.name === 'mushroom_fields' ? this.MYCELIUM : this.GRASS;
      }
    }
    return reachedSurface;
  }
}

// ---------------------------------------------------------------------------
// vanilla CaveWorldCarver

function thickness(r: Rand): number {
  let f = r.nextFloat() * 2 + r.nextFloat();
  if (nextInt(r, 10) === 0) f *= r.nextFloat() * r.nextFloat() * 3 + 1;
  return f;
}

function carveCaves(c: ChunkCarving, cfg: CaveConfig, r: Rand, sx: number, sz: number): void {
  const range = (4 * 2 - 1) * 16;
  const n = nextInt(r, nextInt(r, nextInt(r, 15) + 1) + 1);
  for (let k = 0; k < n; k++) {
    const x = sx * 16 + nextInt(r, 16);
    const y = Math.floor(uniform(r, cfg.yMin, cfg.yMax + 1));
    const z = sz * 16 + nextInt(r, 16);
    const hMul = uniform(r, 0.7, 1.4);
    const vMul = uniform(r, 0.8, 1.3);
    const floor = uniform(r, -1, -0.4);
    const skip: SkipCheck = (rx, ry, rz) => ry <= floor || rx * rx + ry * ry + rz * rz >= 1;
    let tunnels = 1;
    if (nextInt(r, 4) === 0) {
      // a room: one big ellipsoid
      const yScale = uniform(r, 0.1, 0.9);
      const radius = 1 + r.nextFloat() * 6;
      const d0 = 1.5 + radius;
      c.carveEllipsoid(x + 1, y, z, d0, d0 * yScale, skip);
      tunnels += nextInt(r, 4);
    }
    for (let t = 0; t < tunnels; t++) {
      const yaw = r.nextFloat() * Math.PI * 2;
      const pitch = (r.nextFloat() - 0.5) / 4;
      const th = thickness(r);
      const count = range - nextInt(r, range / 4);
      tunnel(c, nextSeed(r), x, y, z, hMul, vMul, th, yaw, pitch, 0, count, 1, skip);
    }
  }
}

function tunnel(c: ChunkCarving, seed: number, x: number, y: number, z: number, hMul: number, vMul: number, th: number, yaw: number, pitch: number, start: number, count: number, yScale: number, skip: SkipCheck): void {
  const r = new Rand(seed, 3);
  const branchAt = nextInt(r, count / 2) + Math.floor(count / 4);
  const steep = nextInt(r, 6) === 0;
  let dYaw = 0, dPitch = 0;
  for (let j = start; j < count; j++) {
    const d0 = 1.5 + Math.sin((Math.PI * j) / count) * th;
    const d1 = d0 * yScale;
    const cp = Math.cos(pitch);
    x += Math.cos(yaw) * cp;
    y += Math.sin(pitch);
    z += Math.sin(yaw) * cp;
    pitch *= steep ? 0.92 : 0.7;
    pitch += dPitch * 0.1;
    yaw += dYaw * 0.1;
    dPitch *= 0.9;
    dYaw *= 0.75;
    dPitch += (r.nextFloat() - r.nextFloat()) * r.nextFloat() * 2;
    dYaw += (r.nextFloat() - r.nextFloat()) * r.nextFloat() * 4;
    if (j === branchAt && th > 1) {
      tunnel(c, nextSeed(r), x, y, z, hMul, vMul, r.nextFloat() * 0.5 + 0.5, yaw - Math.PI / 2, pitch / 3, j, count, 1, skip);
      tunnel(c, nextSeed(r), x, y, z, hMul, vMul, r.nextFloat() * 0.5 + 0.5, yaw + Math.PI / 2, pitch / 3, j, count, 1, skip);
      return;
    }
    if (nextInt(r, 4) !== 0) {
      if (!c.canReach(x, z, j, count, th)) return;
      c.carveEllipsoid(x, y, z, d0 * hMul, d1 * vMul, skip);
    }
  }
}

// ---------------------------------------------------------------------------
// vanilla CanyonWorldCarver (ravines)

function carveCanyon(c: ChunkCarving, r: Rand, sx: number, sz: number): void {
  const range = (4 * 2 - 1) * 16;
  const x = sx * 16 + nextInt(r, 16);
  const y = 10 + nextInt(r, 67 - 10 + 1);
  const z = sz * 16 + nextInt(r, 16);
  const yaw = r.nextFloat() * Math.PI * 2;
  const pitch = uniform(r, -0.125, 0.125);
  const yScale = 3;
  // thickness: trapezoid(0, 6, plateau 2)
  const th = trapezoid(r, 0, 6, 2);
  const count = Math.floor(range * uniform(r, 0.75, 1));
  canyon(c, nextSeed(r), x, y, z, th, yaw, pitch, 0, count, yScale);
}

function trapezoid(r: Rand, min: number, max: number, plateau: number): number {
  const range = max - min;
  const side = (range - plateau) / 2;
  const base = range - side;
  return min + r.nextFloat() * base + r.nextFloat() * side;
}

function canyon(c: ChunkCarving, seed: number, x: number, y: number, z: number, th: number, yaw: number, pitch: number, start: number, count: number, yScale: number): void {
  const r = new Rand(seed, 5);
  // vanilla initWidthFactors: the walls jitter in and out every few blocks of height
  const widths = new Float32Array(GEN_DEPTH);
  let f = 1;
  for (let j = 0; j < GEN_DEPTH; j++) {
    if (j === 0 || nextInt(r, 3) === 0) f = 1 + r.nextFloat() * r.nextFloat();
    widths[j] = f * f;
  }
  const skip: SkipCheck = (rx, ry, rz, yy) => (rx * rx + rz * rz) * widths[yy - MIN_Y - 1] + (ry * ry) / 6 >= 1;
  let dYaw = 0, dPitch = 0;
  for (let i = start; i < count; i++) {
    let d0 = 1.5 + Math.sin((i * Math.PI) / count) * th;
    let d1 = d0 * yScale;
    d0 *= uniform(r, 0.75, 1);
    // vanilla updateVerticalRadius (default factor 1, centre factor 0)
    d1 = d1 * (0.75 + r.nextFloat() * 0.25);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    x += Math.cos(yaw) * cp;
    y += sp;
    z += Math.sin(yaw) * cp;
    pitch *= 0.7;
    pitch += dPitch * 0.05;
    yaw += dYaw * 0.05;
    dPitch *= 0.8;
    dYaw *= 0.5;
    dPitch += (r.nextFloat() - r.nextFloat()) * r.nextFloat() * 2;
    dYaw += (r.nextFloat() - r.nextFloat()) * r.nextFloat() * 4;
    if (nextInt(r, 4) !== 0) {
      if (!c.canReach(x, z, i, count, th)) return;
      c.carveEllipsoid(x, y, z, d0, d1, skip);
    }
  }
}

// ---------------------------------------------------------------------------

export class Carvers {
  constructor(private readonly seed: number) {}

  /** vanilla ChunkGenerator.applyCarvers */
  carve(ctx: GenContext, aquifer: Aquifer): void {
    const c = new ChunkCarving(ctx, aquifer);
    for (let dz = -RANGE; dz <= RANGE; dz++)
      for (let dx = -RANGE; dx <= RANGE; dx++) {
        const sx = ctx.cx + dx, sz = ctx.cz + dz;
        const r0 = new Rand(hash2(sx, sz, this.seed ^ 0x5ca7e), 1);
        if (r0.nextFloat() <= CAVE.probability) carveCaves(c, CAVE, r0, sx, sz);
        const r1 = new Rand(hash2(sx, sz, this.seed ^ 0x5ca7f), 2);
        if (r1.nextFloat() <= CAVE_EXTRA.probability) carveCaves(c, CAVE_EXTRA, r1, sx, sz);
        const r2 = new Rand(hash2(sx, sz, this.seed ^ 0xca9707), 3);
        if (r2.nextFloat() <= CANYON_PROBABILITY) carveCanyon(c, r2, sx, sz);
      }
  }
}
