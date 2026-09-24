// The End's chunk generator (vanilla NoiseBasedChunkGenerator with the end
// noise settings, NoiseRouterData.end, and TheEndBiomeSource).
//
// The terrain is one density: the End's islands (vanilla
// EndIslandDensityFunction: the main island round 0,0 and, beyond 1024
// blocks, a scatter of outer islands wherever a simplex noise dips under
// -0.9) plus the End's own 3D blended noise, slid to nothing above y 56 and
// below y 32, sampled every 8x4x8 blocks and interpolated between: end stone
// where it's positive, air everywhere else. Both noises are seeded with
// vanilla's legacy random source, so for a numeric seed the islands are where
// vanilla puts them. The biome is chosen per chunk from the same island
// density at the chunk's middle.
//
// Decoration (vanilla EndBiomes): small end islands in their biome (RAW_GENERATION),
// the obsidian spikes on the main island (SURFACE_STRUCTURES, endSpikes.ts). The
// decoration randomness is this game's own (seeded per chunk), not vanilla's.

import { BlendedNoise, type SeedSource } from './noise';
import { LegacyRandom, SimplexNoise, seedLong } from './legacyRandom';
import { squeeze } from './router';
import { GenContext } from './context';
import { B } from './biomes';
import { placeEndPlatform, placeEndSpikes } from './endFeatures';
import { S } from '../block';
import { COLUMN_VOLUME, colIndex } from '../constants';
import { Rand, hash2, hash32 } from '../../core/rng';
import { clampedMap } from '../../core/math';
import { computeChunkLight } from '../lightlocal';
import type { GenOutput } from './generator';

const CELL_W = 8, CELL_H = 4;
/** vanilla NoiseSettings.END_NOISE_SETTINGS: min_y 0, height 128, cells 2x1 quarts */
const NOISE_H = 128;
const NCX = 16 / CELL_W + 1; // 3
const NCY = NOISE_H / CELL_H + 1; // 33

const fr = Math.fround;
/** vanilla EndIslandDensityFunction's ISLAND_THRESHOLD, -0.9F */
const ISLAND_THRESHOLD = fr(-0.9);

/** vanilla DensityFunctions.EndIslandDensityFunction: the End's islands, from a simplex noise seeded 17292 ints into the world seed's legacy random */
export class EndIslands {
  private readonly noise: SimplexNoise;
  private readonly heights = new Map<number, number>();

  constructor(seed: bigint) {
    const r = new LegacyRandom(seed);
    r.consumeCount(17292);
    this.noise = new SimplexNoise(r);
  }

  /**
   * vanilla getHeightValue(noise, x, z), x and z in 8-block units: 100 at the centre falling 8 per unit to the main
   * island's edge; past 64 units of 2 (1024 blocks) out, every 2x2 spot where the noise is under -0.9 raises an
   * island of its own, 9..21 steep. All in float arithmetic, as in vanilla.
   */
  heightValue(x: number, z: number): number {
    const key = (x + 0x800000) * 0x1000000 + (z + 0x800000);
    const hit = this.heights.get(key);
    if (hit !== undefined) return hit;
    if (this.heights.size > 20000) this.heights.clear();
    // (Java int division and remainder: toward zero)
    const i = (x / 2) | 0, j = (z / 2) | 0;
    const k = x % 2, l = z % 2;
    let f = fr(100 - fr(fr(Math.sqrt(fr((Math.imul(x, x) + Math.imul(z, z)) | 0))) * 8));
    f = f < -100 ? -100 : Math.min(f, 80);
    for (let m = -12; m <= 12; m++)
      for (let n = -12; n <= 12; n++) {
        const o = i + m, p = j + n;
        if (o * o + p * p > 4096 && this.noise.getValue(o, p) < ISLAND_THRESHOLD) {
          const g = fr(fr(fr(fr(Math.abs(o) * 3439) + fr(Math.abs(p) * 147)) % 13) + 9);
          const h = k - m * 2, q = l - n * 2;
          let r = fr(100 - fr(fr(Math.sqrt(fr(h * h + q * q))) * g));
          r = r < -100 ? -100 : Math.min(r, 80);
          if (r > f) f = r;
        }
      }
    this.heights.set(key, f);
    return f;
  }

  /** vanilla compute: (height(blockX / 8, blockZ / 8) - 8) / 128, with Java's integer division */
  density(blockX: number, blockZ: number): number {
    return (this.heightValue((blockX / 8) | 0, (blockZ / 8) | 0) - 8) / 128;
  }
}

/** vanilla DensityFunctions.lerp(delta, min, max): min·(1 − delta) + max·delta */
const lerpDF = (delta: number, min: number, max: number): number => min * (delta * -1 + 1) + max * delta;

/** vanilla NoiseRouterData.slideEnd (slideEndLike(0, 128)): toward -23.4375 from y 56 up to 312, toward -0.234375 from y 32 down to 4 */
export function slideEnd(y: number, d: number): number {
  d = lerpDF(clampedMap(y, 56, 312, 1, 0), -23.4375, d);
  return lerpDF(clampedMap(y, 4, 32, 0, 1), -0.234375, d);
}

/** vanilla Mth.lerp */
const lerp = (t: number, a: number, b: number): number => a + t * (b - a);

export class EndGenerator {
  readonly seed: bigint;
  private readonly seedHash: number;
  readonly islands: EndIslands;
  private readonly base3d: BlendedNoise;
  private readonly chunkBiomes = new Map<number, number>();
  private readonly cornerCache = new Map<number, number>();
  private readonly END_STONE = S('end_stone');

  constructor(seed: string | number | bigint) {
    this.seed = seedLong(seed);
    this.seedHash = hash32(Number(BigInt.asUintN(32, this.seed)) ^ Number(BigInt.asUintN(32, this.seed >> 32n)) ^ 0xe7d);
    this.islands = new EndIslands(this.seed);
    // vanilla RandomState: with the legacy random source a BlendedNoise is reseeded from LegacyRandomSource(seed):
    // its min limit, max limit and main octaves drawn in that order, as this game's BlendedNoise draws them.
    // BASE_3D_NOISE_END: BlendedNoise(0.25, 0.25, 80, 160, 4)
    const r = new LegacyRandom(this.seed).asNoiseRandom();
    const legacy = { rand: () => r } as unknown as SeedSource;
    this.base3d = new BlendedNoise(legacy, 0.25, 0.25, 80, 160, 4);
  }

  // -------------------------------------------------------------------------
  // Biomes (vanilla TheEndBiomeSource)

  /**
   * one biome per chunk: the End within 64 chunks of 0,0; beyond, by the island density at the chunk's middle
   * (the router's erosion): highlands over 0.25, midlands from -0.0625, small islands under -0.21875, barrens between
   */
  biomeOfChunk(cx: number, cz: number): number {
    if (cx * cx + cz * cz <= 4096) return B.the_end;
    const key = (cx + 0x200000) * 0x400000 + (cz + 0x200000);
    const hit = this.chunkBiomes.get(key);
    if (hit !== undefined) return hit;
    if (this.chunkBiomes.size > 20000) this.chunkBiomes.clear();
    const d = this.islands.density((cx * 2 + 1) * 8, (cz * 2 + 1) * 8);
    const b = d > 0.25 ? B.end_highlands : d >= -0.0625 ? B.end_midlands : d < -0.21875 ? B.small_end_islands : B.end_barrens;
    this.chunkBiomes.set(key, b);
    return b;
  }

  /** the biome at a block column (vanilla BiomeManager's fuzzy zoom from quarts; the jitter is this game's own hash) */
  biomeAt(x: number, z: number): number {
    const i = x - 2, k = z - 2;
    const qx = i >> 2, qz = k >> 2;
    const fx = (i & 3) / 4, fz = (k & 3) / 4;
    let best = 0, bestD = Infinity;
    for (let n = 0; n < 4; n++) {
      const ax = n & 1, az = n >> 1;
      const h = hash2(qx + ax, qz + az, this.seedHash ^ 0x2004);
      const ox = ((h & 1023) / 1024 - 0.5) * 0.9, oz = (((h >>> 10) & 1023) / 1024 - 0.5) * 0.9;
      const dx = fx - ax + ox, dz = fz - az + oz;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return this.biomeOfChunk((qx + (best & 1)) >> 2, (qz + (best >> 1)) >> 2);
  }

  // -------------------------------------------------------------------------
  // Terrain

  /** vanilla end final density before interpolation (a cell corner): slideEnd(islands + blended noise) */
  private corner(x: number, y: number, z: number): number {
    // (unique out to the world border: 23 bits for each of x / 8 and z / 8, 6 for the corner's y)
    const key = (((x >> 3) + 0x400000) * 0x800000 + ((z >> 3) + 0x400000)) * 64 + (y >> 2);
    const hit = this.cornerCache.get(key);
    if (hit !== undefined) return hit;
    if (this.cornerCache.size > 60000) this.cornerCache.clear();
    const d = slideEnd(y, this.islands.density(x, z) + this.base3d.compute(x, y, z));
    this.cornerCache.set(key, d);
    return d;
  }

  /** whether the noise terrain is solid at a block (vanilla NoiseChunk: interpolated in y, then x, then z) */
  solidAt(x: number, y: number, z: number): boolean {
    if (y < 0 || y >= NOISE_H) return false;
    const x0 = Math.floor(x / CELL_W) * CELL_W, z0 = Math.floor(z / CELL_W) * CELL_W, y0 = Math.floor(y / CELL_H) * CELL_H;
    const c = (dx: number, dy: number, dz: number) => this.corner(x0 + dx * CELL_W, y0 + dy * CELL_H, z0 + dz * CELL_W);
    const ty = (y - y0) / CELL_H, tx = (x - x0) / CELL_W, tz = (z - z0) / CELL_W;
    const v00 = lerp(ty, c(0, 0, 0), c(0, 1, 0)), v10 = lerp(ty, c(1, 0, 0), c(1, 1, 0));
    const v01 = lerp(ty, c(0, 0, 1), c(0, 1, 1)), v11 = lerp(ty, c(1, 0, 1), c(1, 1, 1));
    return squeeze(0.64 * lerp(tz, lerp(tx, v00, v10), lerp(tx, v01, v11))) > 0;
  }

  generate(cx: number, cz: number): GenOutput {
    const x0 = cx * 16, z0 = cz * 16;
    const biomes = new Uint8Array(256);
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) biomes[(lz << 4) | lx] = this.biomeAt(x0 + lx, z0 + lz);

    // ---- cell corners (3 x 33 x 3)
    const corners = new Float64Array(NCX * NCY * NCX);
    for (let k = 0; k < NCX; k++)
      for (let i = 0; i < NCX; i++)
        for (let j = 0; j < NCY; j++) corners[(k * NCY + j) * NCX + i] = this.corner(x0 + i * CELL_W, j * CELL_H, z0 + k * CELL_W);
    const at = (i: number, j: number, k: number) => corners[(k * NCY + j) * NCX + i];

    // ---- fill: end stone where the interpolated density is positive (vanilla SurfaceRuleData.end: all end stone)
    const blocks = new Uint16Array(COLUMN_VOLUME);
    const END_STONE = this.END_STONE;
    for (let ck = 0; ck < NCX - 1; ck++)
      for (let ci = 0; ci < NCX - 1; ci++)
        for (let cj = 0; cj < NCY - 1; cj++) {
          const n000 = at(ci, cj, ck), n100 = at(ci + 1, cj, ck), n010 = at(ci, cj + 1, ck), n110 = at(ci + 1, cj + 1, ck);
          const n001 = at(ci, cj, ck + 1), n101 = at(ci + 1, cj, ck + 1), n011 = at(ci, cj + 1, ck + 1), n111 = at(ci + 1, cj + 1, ck + 1);
          // (nothing to fill where all eight corners are far below zero)
          if (Math.max(n000, n100, n010, n110, n001, n101, n011, n111) <= 0) continue;
          for (let dy = 0; dy < CELL_H; dy++) {
            const ty = dy / CELL_H, y = cj * CELL_H + dy;
            const v00 = lerp(ty, n000, n010), v10 = lerp(ty, n100, n110), v01 = lerp(ty, n001, n011), v11 = lerp(ty, n101, n111);
            for (let dx = 0; dx < CELL_W; dx++) {
              const tx = dx / CELL_W;
              const v0 = lerp(tx, v00, v10), v1 = lerp(tx, v01, v11);
              for (let dz = 0; dz < CELL_W; dz++) {
                if (squeeze(0.64 * lerp(dz / CELL_W, v0, v1)) > 0) blocks[colIndex(ci * CELL_W + dx, y, ck * CELL_W + dz)] = END_STONE;
              }
            }
          }
        }

    const ctx = new GenContext(cx, cz, blocks, biomes, null);
    ctx.solidGuess = (x, y, z) => this.solidAt(x, y, z);
    ctx.computeHeightmaps();
    this.decorate(ctx);
    const light = computeChunkLight(blocks, false);
    return { cx, cz, blocks, light, biomes, pending: ctx.pendingWrites(), fluidTicks: ctx.fluidTicks, blockEntities: ctx.blockEntities, entities: ctx.entities, postProcess: ctx.postProcess, caveBiomes: null };
  }

  // -------------------------------------------------------------------------
  // Decoration

  private decorate(ctx: GenContext): void {
    const rand = (step: number) => new Rand(hash2(ctx.cx, ctx.cz, this.seedHash ^ Math.imul(step + 1, 0x9e3779b1)), 29 + step);
    // RAW_GENERATION — vanilla END_ISLAND_DECORATED: once in 14 chunks, one island (a quarter of the time two), each
    // somewhere in the chunk at y 55..70, where the biome there is small_end_islands
    {
      const r = rand(0);
      if (r.nextFloat() < 1 / 14) {
        const n = r.nextInt(4) === 0 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16), y = 55 + r.nextInt(16);
          if (this.biomeAt(x, z) === B.small_end_islands) this.endIsland(ctx, r, x, y, z);
        }
      }
    }
    // SURFACE_STRUCTURES — vanilla the_end: END_SPIKE (the pillars whose middles are in this chunk), then END_PLATFORM
    if (ctx.biomes[0] === B.the_end || this.biomeOfChunk(ctx.cx, ctx.cz) === B.the_end) {
      placeEndSpikes(ctx, this.seed, rand(4));
      placeEndPlatform(ctx);
    }
  }

  /** vanilla EndIslandFeature: a little upside-down cone of end stone, 4..6 across its top, narrowing as it goes down */
  private endIsland(ctx: GenContext, r: Rand, x: number, y: number, z: number): void {
    let f = fr(r.nextInt(3) + 4);
    for (let i = 0; f > 0.5; i--) {
      for (let j = Math.floor(-f); j <= Math.ceil(f); j++)
        for (let k = Math.floor(-f); k <= Math.ceil(f); k++) {
          if (fr(j * j + k * k) <= fr(fr(f + 1) * fr(f + 1))) ctx.set(x + j, y + i, z + k, this.END_STONE);
        }
      f = fr(f - fr(r.nextInt(2) + 0.5));
    }
  }
}
