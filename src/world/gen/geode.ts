// Amethyst geodes (vanilla GeodeFeature with the amethyst_geode configuration):
// in 1 chunk in 24, a lumpy sphere at y -58..30 made from 3-4 overlapping
// distance fields plus a little noise: an air pocket lined with amethyst (and
// the odd budding amethyst growing buds into the pocket), then calcite, then a
// smooth basalt shell, usually split by a crack. A geode spans up to 33 blocks,
// so every chunk places its share of the geodes around it: each one is worked
// out whole, from its origin chunk alone, and cached.

import { Rand, hash2 } from '../../core/rng';
import { S, blockOf, getBlock, FLAGS, F_WATER, F_LAVA } from '../block';
import { MIN_Y } from '../constants';
import type { GenContext } from './context';
import type { NormalNoise } from './noise';

/** what the noise terrain holds at a block, before carvers (ChunkGenerator.substanceAt) */
export const SUB_AIR = 0, SUB_SOLID = 1, SUB_FLUID = 2;

// GeodeLayerSettings / GeodeCrackSettings / GeodeConfiguration for amethyst_geode
const FILLING = 1.7, INNER = 2.2, MIDDLE = 3.2, OUTER = 4.2;
const CRACK_CHANCE = 0.95, CRACK_SIZE = 2, CRACK_OFFSET = 2;
const PLACEMENTS_CHANCE = 0.35, ALTERNATE_CHANCE = 0.083;
const MIN_OFFSET = -16, MAX_OFFSET = 16, NOISE_MULT = 0.05;
const WALL_MIN = 4, WALL_MAX = 6;

/** vanilla BlockTags.FEATURES_CANNOT_REPLACE (of the blocks the game has) */
const CANNOT_REPLACE = new Set(['bedrock', 'spawner', 'chest']);
const DIRS: [number, number, number, string][] = [[0, -1, 0, 'down'], [0, 1, 0, 'up'], [0, 0, -1, 'north'], [0, 0, 1, 'south'], [-1, 0, 0, 'west'], [1, 0, 0, 'east']];

interface Geode {
  /** writes in placement order: x, y, z, state (state -1 = air from the crack) */
  writes: Int32Array;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export class Geodes {
  private readonly cache = new Map<number, Geode | null>();

  constructor(
    private readonly seed: number,
    private readonly noise: NormalNoise,
    /** SUB_* at a block of the noise terrain */
    private readonly substanceAt: (x: number, y: number, z: number) => number,
  ) {}

  /** place the parts of all geodes near this chunk that fall inside it (vanilla LOCAL_MODIFICATIONS step) */
  place(ctx: GenContext): void {
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        const g = this.geodeAt(ctx.cx + dx, ctx.cz + dz);
        if (!g || g.maxX < ctx.x0 || g.minX > ctx.x0 + 15 || g.maxZ < ctx.z0 || g.minZ > ctx.z0 + 15) continue;
        this.apply(ctx, g);
      }
  }

  private apply(ctx: GenContext, g: Geode): void {
    const w = g.writes;
    for (let i = 0; i < w.length; i += 4) {
      const x = w[i], y = w[i + 1], z = w[i + 2];
      if (!ctx.inChunk(x, z)) continue;
      const cur = ctx.get(x, y, z);
      if (cur < 0 || CANNOT_REPLACE.has(blockOf(cur).name)) continue;
      const st = w[i + 3];
      ctx.set(x, y, z, st < 0 ? 0 : st);
      if (st < 0) {
        // the crack lets neighbouring fluids flow in (vanilla scheduleTick)
        for (const [ox, oy, oz] of DIRS) {
          const n = ctx.get(x + ox, y + oy, z + oz);
          if (n > 0 && FLAGS[n] & (F_WATER | F_LAVA)) ctx.scheduleFluid(x + ox, y + oy, z + oz);
        }
      }
    }
  }

  private geodeAt(cx: number, cz: number): Geode | null {
    const key = cx * 65536 + cz;
    let g = this.cache.get(key);
    if (g === undefined) {
      g = this.generate(cx, cz);
      if (this.cache.size >= 96) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, g);
    }
    return g;
  }

  /** vanilla amethyst_geode placement (RarityFilter 1/24, in square, y 6 above the bottom to 30) and GeodeFeature.place */
  private generate(cx: number, cz: number): Geode | null {
    const r = new Rand(hash2(cx, cz, this.seed ^ 0x6e0de), 7);
    if (r.nextFloat() >= 1 / 24) return null;
    const ox = cx * 16 + r.nextInt(16), oz = cz * 16 + r.nextInt(16);
    const oy = MIN_Y + 6 + r.nextInt(30 - (MIN_Y + 6) + 1);

    const k = 3 + r.nextInt(2);
    const d0 = k / WALL_MAX;
    const d1 = 1 / Math.sqrt(FILLING), d2 = 1 / Math.sqrt(INNER + d0), d3 = 1 / Math.sqrt(MIDDLE + d0), d4 = 1 / Math.sqrt(OUTER + d0);
    const d5 = 1 / Math.sqrt(CRACK_SIZE + r.nextDouble() / 2 + (k > 3 ? d0 : 0));
    const crack = r.nextFloat() < CRACK_CHANCE;
    const pts: number[] = [];
    let invalid = 0;
    for (let i = 0; i < k; i++) {
      const px = ox + WALL_MIN + r.nextInt(WALL_MAX - WALL_MIN + 1);
      const py = oy + WALL_MIN + r.nextInt(WALL_MAX - WALL_MIN + 1);
      const pz = oz + WALL_MIN + r.nextInt(WALL_MAX - WALL_MIN + 1);
      // points in open air or fluid (vanilla GEODE_INVALID_BLOCKS: water, lava, ice): more than one and there's no geode
      if (this.substanceAt(px, py, pz) !== SUB_SOLID && ++invalid > 1) return null;
      pts.push(px, py, pz, 1 + r.nextInt(2));
    }
    const cracks: number[] = [];
    if (crack) {
      const i2 = r.nextInt(4), j2 = k * 2 + 1;
      const [cxo, czo] = i2 === 0 ? [j2, 0] : i2 === 1 ? [0, j2] : i2 === 2 ? [j2, j2] : [0, 0];
      for (const dy of [7, 5, 1]) cracks.push(ox + cxo, oy + dy, oz + czo);
    }

    const AIR = 0, AMETHYST = S('amethyst_block'), BUDDING = S('budding_amethyst'), CALCITE = S('calcite'), BASALT = S('smooth_basalt');
    const writes: number[] = [];
    const placements: number[] = [];
    // what the geode leaves at each position of its box (for where buds can grow)
    const SIZE = MAX_OFFSET - MIN_OFFSET + 1;
    const open = new Uint8Array(SIZE * SIZE * SIZE);
    const at = (x: number, y: number, z: number) => ((z - oz - MIN_OFFSET) * SIZE + (y - oy - MIN_OFFSET)) * SIZE + (x - ox - MIN_OFFSET);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const put = (x: number, y: number, z: number, st: number) => {
      if (y < MIN_Y) return;
      writes.push(x, y, z, st);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    };
    // BlockPos.betweenClosed order: x fastest, then y, then z
    for (let z = oz + MIN_OFFSET; z <= oz + MAX_OFFSET; z++)
      for (let y = oy + MIN_OFFSET; y <= oy + MAX_OFFSET; y++)
        for (let x = ox + MIN_OFFSET; x <= ox + MAX_OFFSET; x++) {
          const n = this.noise.getValue(x, y, z) * NOISE_MULT;
          let d6 = 0, d7 = 0;
          for (let i = 0; i < pts.length; i += 4) {
            const dx = x - pts[i], dy = y - pts[i + 1], dz = z - pts[i + 2];
            d6 += 1 / Math.sqrt(dx * dx + dy * dy + dz * dz + pts[i + 3]) + n;
          }
          if (d6 < d4) continue;
          for (let i = 0; i < cracks.length; i += 3) {
            const dx = x - cracks[i], dy = y - cracks[i + 1], dz = z - cracks[i + 2];
            d7 += 1 / Math.sqrt(dx * dx + dy * dy + dz * dz + CRACK_OFFSET) + n;
          }
          if (crack && d7 >= d5 && d6 < d1) {
            put(x, y, z, -1);
            open[at(x, y, z)] = 1;
          } else if (d6 >= d1) {
            put(x, y, z, AIR);
            open[at(x, y, z)] = 1;
          } else if (d6 >= d2) {
            const alt = r.nextFloat() < ALTERNATE_CHANCE;
            put(x, y, z, alt ? BUDDING : AMETHYST);
            if (alt && r.nextFloat() < PLACEMENTS_CHANCE) placements.push(x, y, z);
          } else if (d6 >= d3) put(x, y, z, CALCITE);
          else put(x, y, z, BASALT);
        }
    // buds on budding amethyst, on the first side (down, up, north, south, west, east) that opens into the pocket
    const BUDS = ['small_amethyst_bud', 'medium_amethyst_bud', 'large_amethyst_bud', 'amethyst_cluster'].map((n) => getBlock(n));
    for (let i = 0; i < placements.length; i += 3) {
      const bud = BUDS[r.nextInt(4)];
      for (const [dx, dy, dz, face] of DIRS) {
        const x = placements[i] + dx, y = placements[i + 1] + dy, z = placements[i + 2] + dz;
        if (Math.abs(x - ox) > MAX_OFFSET || Math.abs(y - oy) > MAX_OFFSET || Math.abs(z - oz) > MAX_OFFSET || !open[at(x, y, z)]) continue;
        put(x, y, z, bud.state({ facing: face, waterlogged: false }));
        open[at(x, y, z)] = 0;
        break;
      }
    }
    return writes.length ? { writes: Int32Array.from(writes), minX, maxX, minZ, maxZ } : null;
  }
}
