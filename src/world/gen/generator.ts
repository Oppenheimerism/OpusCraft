// Chunk generator: noise terrain → aquifers/ore veins → surface rules →
// decoration → initial lighting.

import { OverworldRouter, ColumnSample, newColumn, CHANNELS, CH_MAIN, CH_NTOGGLE, CH_NTHICK, CH_NRA, CH_NRB, CH_VTOGGLE, CH_VRIDGED, squeeze } from './router';
import { SeedSource, NormalNoise } from './noise';
import { Aquifer, FLUID_WATER, FLUID_LAVA } from './aquifer';
import { pickSurfaceBiome, B, BIOMES, pickCaveBiome } from './biomes';
import { GenContext, PendingWrites } from './context';
import { Decorator } from './features';
import { Carvers } from './carvers';
import { Mineshafts } from './mineshaft';
import { Geodes, SUB_AIR, SUB_SOLID, SUB_FLUID } from './geode';
import { Villages } from './villages';
import { Temples } from './temples';
import { Strongholds, biomeAtY0, addBeards } from './stronghold';
// (Stage 4: outposts)
import { PillagerOutposts } from './outposts';
// (Stage 5: ocean)
import { OceanMonuments } from './monument';
import { worldSeed64 } from './jigsaw';
import { S, getBlock } from '../block';
import { MIN_Y, MAX_Y, SEA_LEVEL, COLUMN_VOLUME, colIndex, CAVE_BIOME_LEVELS, NO_CAVE_BIOME } from '../constants';
import { hash3, hash2, hashFloat, hash32, Rand, hashString } from '../../core/rng';
import { clampedMap } from '../../core/math';
import { computeChunkLight } from '../lightlocal';
import type { SavedBlockEntity } from '../blockEntity';
import type { SavedEntity } from '../../entity/mob';

export interface GenOutput {
  cx: number;
  cz: number;
  blocks: Uint16Array;
  light: Uint8Array;
  biomes: Uint8Array;
  pending: PendingWrites[];
  /** generated fluids to tick once loaded (packed lx, y, lz) */
  fluidTicks: number[];
  blockEntities: SavedBlockEntity[];
  entities: SavedEntity[];
  postProcess: number[];
  /** underground biomes per quart, null when the whole column has the surface biome */
  caveBiomes: Uint8Array | null;
}

const CELL_W = 4, CELL_H = 8;
const NCX = 16 / CELL_W + 1; // 5
const NCY = (MAX_Y - MIN_Y) / CELL_H + 1; // 49

export class ChunkGenerator {
  readonly router: OverworldRouter;
  readonly seeds: SeedSource;
  private readonly decorator: Decorator;
  private readonly carvers: Carvers;
  private readonly seedHash: number;
  private readonly clayBands: number[];
  private readonly surfaceNoise: NormalNoise;
  private readonly surfaceSecondary: NormalNoise;
  /** aquifer for single-block terrain queries (substanceAt) */
  private readonly pointAquifer: Aquifer;
  readonly villages: Villages;
  /** desert pyramids, jungle temples, swamp huts and igloos (world/gen/temples) */
  readonly temples: Temples;
  readonly strongholds: Strongholds;
  /** (Stage 4: outposts) */
  readonly outposts: PillagerOutposts;
  /** (Stage 5: ocean) */
  readonly monuments: OceanMonuments;
  /** corner columns for terrain height queries, with the noise at their cell corners as it's needed */
  private readonly heightCols = new Map<number, { c: ColumnSample; exactTop: number; corners: (Float32Array | undefined)[] }>();

  constructor(seed: string | number | bigint) {
    this.seeds = SeedSource.fromWorldSeed(typeof seed === 'string' ? seed : BigInt(seed));
    this.router = new OverworldRouter(this.seeds);
    this.seedHash = hash32(this.seeds.lo ^ this.seeds.hi);
    this.decorator = new Decorator(this.seedHash, this.router.n.patch);
    this.carvers = new Carvers(this.seedHash);
    this.decorator.mineshafts = new Mineshafts(this.seedHash, (x, z) => BIOMES[this.biomeAt(x, z)].name, (x, z) => this.router.preliminarySurface(this.column(x, z)));
    this.pointAquifer = new Aquifer(this.router, this.seedHash);
    this.decorator.geodes = new Geodes(this.seedHash, new NormalNoise(this.seeds.sub('geode'), { firstOctave: -4, amplitudes: [1] }), (x, y, z) => this.substanceAt(x, y, z));
    this.surfaceNoise = this.router.n.surface;
    this.surfaceSecondary = this.router.n.surface_secondary;
    this.clayBands = makeClayBands(new Rand(this.seedHash ^ 0xba4d, 3));
    this.villages = new Villages(worldSeed64(seed), { firstFreeHeight: (x, z) => this.firstFreeHeight(x, z), quartBiome: (x, z) => this.quartBiome(x, z) });
    // (Stage 4: outposts) placed in the villages' step (vanilla SURFACE_STRUCTURES, the outpost first), bending the terrain with them
    this.outposts = new PillagerOutposts(worldSeed64(seed), { firstFreeHeight: (x, z) => this.firstFreeHeight(x, z), quartBiome: (x, z) => this.quartBiome(x, z) }, this.villages);
    // (Stage 5: ocean) monuments too (vanilla SURFACE_STRUCTURES, after the outposts)
    this.monuments = new OceanMonuments(worldSeed64(seed), (x, z) => this.quartBiome(x, z));
    this.decorator.villages = { place: (ctx) => (this.outposts.place(ctx), this.monuments.place(ctx), this.villages.place(ctx)) };
    // (temples) desert pyramids, jungle temples, igloos and swamp huts, placed in the same step just before
    this.temples = new Temples(worldSeed64(seed), {
      firstFreeHeight: (x, z) => this.firstFreeHeight(x, z),
      oceanFloorHeight: (x, z) => this.firstFreeHeight(x, z, true),
      quartBiome: (x, z) => this.quartBiome(x, z),
    });
    this.decorator.temples = this.temples;
    this.strongholds = new Strongholds(worldSeed64(seed), biomeAtY0(this.router));
    this.decorator.strongholds = this.strongholds;
  }

  /** the biome a structure checks for (vanilla getNoiseBiome at the quart, without the fuzzy zoom) */
  quartBiome(x: number, z: number): number {
    return this.biomeAt(x & ~3, z & ~3);
  }

  private heightCol(x: number, z: number): { c: ColumnSample; exactTop: number; corners: (Float32Array | undefined)[] } {
    const key = (x >> 2) * 131072 + (z >> 2);
    let e = this.heightCols.get(key);
    if (e) return e;
    if (this.heightCols.size > 16384) this.heightCols.clear();
    const c = this.router.column(x, z, newColumn());
    // (as generate() does: corners above the highest one that may be solid aren't worked out)
    let top = 0;
    for (let j = NCY - 1; j >= 0; j--) {
      if (this.router.slopedCheeseBase(MIN_Y + j * CELL_H, c) + 1.1 >= 0) {
        top = j;
        break;
      }
    }
    e = { c, exactTop: Math.min(NCY - 1, top + 1), corners: new Array(NCY) };
    this.heightCols.set(key, e);
    return e;
  }

  /**
   * vanilla getFirstFreeHeight(WORLD_SURFACE_WG): the first block above the bare noise terrain (water counts as
   * terrain), read off one column exactly as generate() fills it, for structures laying themselves out;
   * `oceanFloor`: OCEAN_FLOOR_WG, where water doesn't count
   */
  firstFreeHeight(x: number, z: number, oceanFloor = false): number {
    const x0 = Math.floor(x / CELL_W) * CELL_W, z0 = Math.floor(z / CELL_W) * CELL_W;
    const cols = [this.heightCol(x0, z0), this.heightCol(x0 + CELL_W, z0), this.heightCol(x0, z0 + CELL_W), this.heightCol(x0 + CELL_W, z0 + CELL_W)];
    const prelim = this.router.preliminarySurface(cols[0].c);
    const tx = (x - x0) / CELL_W, tz = (z - z0) / CELL_W;
    let topCell = 0;
    for (const c of cols) topCell = Math.max(topCell, c.exactTop);
    topCell = Math.min(NCY - 2, topCell);
    const yStart = Math.max(MIN_Y + (topCell + 1) * CELL_H - 1, Math.min(prelim + 16, MAX_Y - 1), SEA_LEVEL - 1);
    const cv = new Float32Array(8 * CHANNELS);
    let cell = -1, allAir = false;
    for (let y = yStart; y >= MIN_Y; y--) {
      const cj = Math.floor((y - MIN_Y) / CELL_H);
      if (cj !== cell) {
        cell = cj;
        let maxMain = -Infinity;
        for (let n = 0; n < 8; n++) {
          const di = n & 1, dj = (n >> 1) & 1, dk = (n >> 2) & 1;
          const col = cols[di + dk * 2], j = cj + dj;
          let v = col.corners[j];
          if (!v) {
            v = new Float32Array(CHANNELS);
            this.router.corner(x0 + di * CELL_W, MIN_Y + j * CELL_H, z0 + dk * CELL_W, col.c, v, 0, j <= col.exactTop);
            col.corners[j] = v;
          }
          cv.set(v, n * CHANNELS);
          maxMain = Math.max(maxMain, v[CH_MAIN]);
        }
        allAir = maxMain < 0 && MIN_Y + cj * CELL_H >= SEA_LEVEL + 8;
      }
      if (allAir && y > prelim + 16) continue;
      const ty = (y - (MIN_Y + cj * CELL_H)) / CELL_H;
      let d = squeeze(0.64 * tri(cv, CH_MAIN, tx, ty, tz));
      if (tri(cv, CH_NTOGGLE, tx, ty, tz) >= 0) {
        const nd = tri(cv, CH_NTHICK, tx, ty, tz) + 1.5 * Math.max(Math.abs(tri(cv, CH_NRA, tx, ty, tz)), Math.abs(tri(cv, CH_NRB, tx, ty, tz)));
        if (nd < d) d = nd;
      }
      if (d > 0) return y + 1;
      if (y >= SEA_LEVEL && y > prelim + 16) continue;
      const sub = this.pointAquifer.substance(x, y, z, d);
      if (sub === -1 || (!oceanFloor && (sub === FLUID_WATER || sub === FLUID_LAVA))) return y + 1;
    }
    return MIN_Y;
  }

  /**
   * The noise terrain at one block, before surface rules and carvers (SUB_AIR / SUB_SOLID / SUB_FLUID),
   * for features that look at blocks in chunks that aren't generated: the cell's 8 corners
   * interpolated exactly as generate() does, then the aquifer.
   */
  substanceAt(x: number, y: number, z: number): number {
    const router = this.router;
    const x0 = Math.floor(x / CELL_W) * CELL_W, z0 = Math.floor(z / CELL_W) * CELL_W;
    const y0 = MIN_Y + Math.floor((y - MIN_Y) / CELL_H) * CELL_H;
    const cv = new Float32Array(8 * CHANNELS);
    const cols = [0, 1, 2, 3].map((i) => router.column(x0 + (i & 1) * CELL_W, z0 + (i >> 1) * CELL_W, newColumn()));
    for (let n = 0; n < 8; n++) {
      const di = n & 1, dj = (n >> 1) & 1, dk = (n >> 2) & 1;
      router.corner(x0 + di * CELL_W, y0 + dj * CELL_H, z0 + dk * CELL_W, cols[di + dk * 2], cv, n * CHANNELS, true);
    }
    const tx = (x - x0) / CELL_W, ty = (y - y0) / CELL_H, tz = (z - z0) / CELL_W;
    let d = squeeze(0.64 * tri(cv, CH_MAIN, tx, ty, tz));
    if (tri(cv, CH_NTOGGLE, tx, ty, tz) >= 0) {
      const nd = tri(cv, CH_NTHICK, tx, ty, tz) + 1.5 * Math.max(Math.abs(tri(cv, CH_NRA, tx, ty, tz)), Math.abs(tri(cv, CH_NRB, tx, ty, tz)));
      if (nd < d) d = nd;
    }
    if (d > 0) return SUB_SOLID;
    const sub = this.pointAquifer.substance(x, y, z, d);
    return sub === -1 ? SUB_SOLID : sub === FLUID_WATER || sub === FLUID_LAVA ? SUB_FLUID : SUB_AIR;
  }

  /** Sample the surface biome at a block position (used for spawn search / F3). */
  biomeAt(x: number, z: number): number {
    const c = this.router.column(x, z, newColumn());
    return pickSurfaceBiome(c.temperature, c.humidity, c.continents, c.erosion, c.ridges);
  }

  column(x: number, z: number): ColumnSample {
    return this.router.column(x, z, newColumn());
  }

  generate(cx: number, cz: number): GenOutput {
    const x0 = cx * 16, z0 = cz * 16;
    const router = this.router;
    // 6x6 quart columns (i,k in -1..4) — corners are the i,k in 0..4 subset
    const cols: ColumnSample[] = [];
    for (let k = -1; k <= 4; k++)
      for (let i = -1; i <= 4; i++) cols.push(router.column(x0 + i * 4, z0 + k * 4, newColumn()));
    const colAt = (i: number, k: number) => cols[(k + 1) * 6 + (i + 1)];

    // ---- biomes (per quart), fuzzy-zoomed to blocks
    const quartBiome = new Int16Array(36);
    for (let k = -1; k <= 4; k++)
      for (let i = -1; i <= 4; i++) {
        const c = colAt(i, k);
        quartBiome[(k + 1) * 6 + (i + 1)] = pickSurfaceBiome(c.temperature, c.humidity, c.continents, c.erosion, c.ridges);
      }
    const biomes = new Uint8Array(256);
    for (let lz = 0; lz < 16; lz++)
      for (let lx = 0; lx < 16; lx++) biomes[(lz << 4) | lx] = this.zoomBiome(x0 + lx, z0 + lz, cx, cz, quartBiome);

    // ---- corner densities
    const corners = new Float32Array(NCX * NCY * NCX * CHANNELS);
    for (let k = 0; k < NCX; k++)
      for (let i = 0; i < NCX; i++) {
        const c = colAt(i, k);
        // highest corner level that may be solid
        let top = 0;
        for (let j = NCY - 1; j >= 0; j--) {
          const y = MIN_Y + j * CELL_H;
          if (router.slopedCheeseBase(y, c) + 1.1 >= 0) {
            top = j;
            break;
          }
        }
        const exactTop = Math.min(NCY - 1, top + 1);
        for (let j = 0; j < NCY; j++) {
          const o = ((k * NCY + j) * NCX + i) * CHANNELS;
          router.corner(x0 + i * 4, MIN_Y + j * CELL_H, z0 + k * 4, c, corners, o, j <= exactTop);
        }
      }

    // ---- fill
    const blocks = new Uint16Array(COLUMN_VOLUME);
    const aquifer = new Aquifer(router, this.seedHash);
    const STONE = S('stone'), WATER = S('water'), LAVA = S('lava');
    const COPPER = S('copper_ore'), RAW_COPPER = S('raw_copper_block'), GRANITE = S('granite');
    const DIRON = S('deepslate_iron_ore'), RAW_IRON = S('raw_iron_block'), TUFF = S('tuff');
    const prelimCol = new Int16Array(256);
    for (let lz = 0; lz < 16; lz++)
      for (let lx = 0; lx < 16; lx++) {
        // interpolate preliminary surface from the 4 corner quarts
        const i = lx >> 2, k = lz >> 2;
        const p = router.preliminarySurface(colAt(i, k));
        prelimCol[(lz << 4) | lx] = p;
      }
    const oreGap = router.n.ore_gap;
    // structures nearby bend the terrain around themselves (vanilla Beardifier, added to the final density)
    const beard = addBeards(this.outposts.beardFor(cx, cz, this.villages.beardFor(cx, cz)), this.strongholds.buryFor(cx, cz));
    const bY0 = beard ? beard.minY : Infinity, bY1 = beard ? beard.maxY : -Infinity;
    const cv = new Float32Array(8 * CHANNELS);
    for (let ck = 0; ck < 4; ck++)
      for (let ci = 0; ci < 4; ci++)
        for (let cj = 0; cj < NCY - 1; cj++) {
          // gather 8 corners
          for (let n = 0; n < 8; n++) {
            const di = n & 1, dj = (n >> 1) & 1, dk = (n >> 2) & 1;
            const o = (((ck + dk) * NCY + (cj + dj)) * NCX + (ci + di)) * CHANNELS;
            for (let ch = 0; ch < CHANNELS; ch++) cv[n * CHANNELS + ch] = corners[o + ch];
          }
          // quick skip: all corners strongly negative & no fluid possible → air
          const yBase = MIN_Y + cj * CELL_H;
          let maxMain = -Infinity;
          for (let n = 0; n < 8; n++) maxMain = Math.max(maxMain, cv[n * CHANNELS + CH_MAIN]);
          const allAir = maxMain < 0 && yBase >= SEA_LEVEL + 8;
          for (let dy = 0; dy < CELL_H; dy++) {
            const y = yBase + dy;
            const ty = dy / CELL_H;
            for (let dz = 0; dz < CELL_W; dz++) {
              const lz = ck * 4 + dz;
              const tz = dz / CELL_W;
              for (let dx = 0; dx < CELL_W; dx++) {
                const lx = ci * 4 + dx;
                const tx = dx / CELL_W;
                const idx = colIndex(lx, y, lz);
                const bearded = y >= bY0 && y <= bY1;
                if (allAir && !bearded && y > prelimCol[(lz << 4) | lx] + 16) continue;
                const main = tri(cv, CH_MAIN, tx, ty, tz);
                let d = squeeze(0.64 * main);
                const tog = tri(cv, CH_NTOGGLE, tx, ty, tz);
                if (tog >= 0) {
                  const nd = tri(cv, CH_NTHICK, tx, ty, tz) + 1.5 * Math.max(Math.abs(tri(cv, CH_NRA, tx, ty, tz)), Math.abs(tri(cv, CH_NRB, tx, ty, tz)));
                  if (nd < d) d = nd;
                }
                const x = x0 + lx, z = z0 + lz;
                if (bearded) d += beard!.compute(x, y, z);
                if (d > 0) {
                  // ore veins
                  let st = STONE;
                  if (y >= -60 && y <= 50) {
                    const vt = tri(cv, CH_VTOGGLE, tx, ty, tz);
                    const copper = vt > 0;
                    const vmin = copper ? 0 : -60, vmax = copper ? 50 : -8;
                    if (y >= vmin && y <= vmax) {
                      const l = Math.min(vmax - y, y - vmin);
                      const d2 = clampedMap(l, 0, 20, -0.2, 0);
                      if (Math.abs(vt) + d2 >= 0.4) {
                        const h = hash3(x, y, z, this.seedHash ^ 0x0e5);
                        const r1 = hashFloat(h), r2 = hashFloat(hash32(h + 1)), r3 = hashFloat(hash32(h + 2));
                        if (r1 <= 0.7 && tri(cv, CH_VRIDGED, tx, ty, tz) < 0) {
                          const d3 = clampedMap(Math.abs(vt), 0.4, 0.6, 0.1, 0.3);
                          if (r2 < d3 && oreGap.getValue(x, y, z) > -0.3) {
                            st = r3 < 0.02 ? (copper ? RAW_COPPER : RAW_IRON) : copper ? COPPER : DIRON;
                          } else st = copper ? GRANITE : TUFF;
                        }
                      }
                    }
                  }
                  blocks[idx] = st;
                } else {
                  if (!bearded && y >= SEA_LEVEL && y > prelimCol[(lz << 4) | lx] + 16) continue; // open air
                  const sub = aquifer.substance(x, y, z, d);
                  if (sub === -1) blocks[idx] = STONE;
                  else if (sub === FLUID_WATER) blocks[idx] = WATER;
                  else if (sub === FLUID_LAVA) blocks[idx] = LAVA;
                }
              }
            }
          }
        }

    // ---- underground biomes, per quart (vanilla samples the climate at each quart's corner)
    let caveBiomes: Uint8Array | null = null;
    for (let k = 0; k < 4; k++)
      for (let i = 0; i < 4; i++) {
        const c = colAt(i, k);
        for (let qy = 0; qy < CAVE_BIOME_LEVELS; qy++) {
          const b = pickCaveBiome(c.humidity, c.continents, c.erosion, router.depth(MIN_Y + qy * 4, c));
          if (b < 0) continue;
          if (!caveBiomes) caveBiomes = new Uint8Array(CAVE_BIOME_LEVELS * 16).fill(NO_CAVE_BIOME);
          caveBiomes[(qy << 4) | (k << 2) | i] = b;
        }
      }

    const ctx = new GenContext(cx, cz, blocks, biomes, caveBiomes);
    ctx.solidGuess = (x, y, z) => this.substanceAt(x, y, z) === SUB_SOLID;
    ctx.computeHeightmaps();
    this.buildSurface(ctx, cols, colAt);
    this.carvers.carve(ctx, aquifer);
    this.decorator.decorate(ctx);
    const light = computeChunkLight(blocks);
    return { cx, cz, blocks, light, biomes, pending: ctx.pendingWrites(), fluidTicks: ctx.fluidTicks, blockEntities: ctx.blockEntities, entities: ctx.entities, postProcess: ctx.postProcess, caveBiomes };
  }

  private zoomBiome(x: number, z: number, cx: number, cz: number, quartBiome: Int16Array): number {
    const i = x - 2, k = z - 2;
    const qx = i >> 2, qz = k >> 2;
    const fx = (i & 3) / 4, fz = (k & 3) / 4;
    let best = 0, bestD = Infinity;
    for (let n = 0; n < 4; n++) {
      const ax = n & 1, az = n >> 1;
      const gx = qx + ax, gz = qz + az;
      const h = hash2(gx, gz, this.seedHash ^ 0x2004);
      const ox = (((h & 1023) / 1024) - 0.5) * 0.9;
      const oz = ((((h >>> 10) & 1023) / 1024) - 0.5) * 0.9;
      const dx = fx - ax + ox, dz = fz - az + oz;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    const gx = qx + (best & 1) - cx * 4, gz = qz + (best >> 1) - cz * 4;
    return quartBiome[(Math.max(-1, Math.min(4, gz)) + 1) * 6 + (Math.max(-1, Math.min(4, gx)) + 1)];
  }

  // -------------------------------------------------------------------------
  // Surface rules

  private buildSurface(ctx: GenContext, cols: ColumnSample[], colAt: (i: number, k: number) => ColumnSample): void {
    const blocks = ctx.blocks;
    const STONE = S('stone');
    const n = this.router.n;
    const B_ = BLOCKS_SURF();
    // preliminary surface at chunk corners (vanilla getMinSurfaceLevel)
    const p00 = this.router.preliminarySurface(colAt(0, 0));
    const p10 = this.router.preliminarySurface(colAt(4, 0));
    const p01 = this.router.preliminarySurface(colAt(0, 4));
    const p11 = this.router.preliminarySurface(colAt(4, 4));
    for (let lz = 0; lz < 16; lz++)
      for (let lx = 0; lx < 16; lx++) {
        const x = ctx.x0 + lx, z = ctx.z0 + lz;
        const biome = ctx.biomes[(lz << 4) | lx];
        const sNoise = this.surfaceNoise.getValue(x, 0, z);
        const surfaceDepth = Math.floor(sNoise * 2.75 + 3 + hashFloat(hash2(x, z, this.seedHash ^ 0x5d)) * 0.25);
        const secondary = this.surfaceSecondary.getValue(x, 0, z);
        const tx = lx / 16, tz = lz / 16;
        const minSurface = Math.floor(p00 * (1 - tx) * (1 - tz) + p10 * tx * (1 - tz) + p01 * (1 - tx) * tz + p11 * tx * tz) + surfaceDepth - 8;
        const steep = this.steep(ctx, lx, lz);
        let sda = 0;
        let waterHeight = -Infinity;
        let k1 = Infinity;
        const top = ctx.surface[(lz << 4) | lx];
        for (let y = top; y >= MIN_Y; y--) {
          const idx = colIndex(lx, y, lz);
          const st = blocks[idx];
          if (st === 0) {
            sda = 0;
            waterHeight = -Infinity;
            continue;
          }
          if (st === B_.WATER || st === B_.LAVA) {
            if (waterHeight === -Infinity) waterHeight = y + 1;
            continue;
          }
          if (k1 >= y) {
            k1 = -2032;
            for (let j = y - 1; j >= MIN_Y - 1; j--) {
              const b = j < MIN_Y ? 0 : blocks[colIndex(lx, j, lz)];
              if (b === 0 || b === B_.WATER || b === B_.LAVA || j < MIN_Y) {
                k1 = j + 1;
                break;
              }
            }
          }
          sda++;
          const sdb = y - k1 + 1;
          if (st !== STONE) continue;
          let out = -1;
          // bedrock floor
          if (y < MIN_Y + 5 && this.gradient(x, y, z, MIN_Y, MIN_Y + 5, 0xbed)) out = B_.BEDROCK;
          else if (y >= minSurface) {
            out = this.surfaceRule(x, y, z, biome, sda, sdb, waterHeight, surfaceDepth, secondary, sNoise, steep, B_);
          }
          if (out < 0 && y < 8 && this.gradient(x, y, z, 0, 8, 0xdee)) out = B_.DEEPSLATE;
          if (out >= 0) blocks[idx] = out;
        }
        // bedrock for non-stone blocks at the very bottom (vanilla also covers them)
        blocks[colIndex(lx, MIN_Y, lz)] = B_.BEDROCK;
      }
  }

  /** vertical gradient random: true below trueAt, false above falseAt. */
  private gradient(x: number, y: number, z: number, trueAt: number, falseAt: number, salt: number): boolean {
    if (y <= trueAt) return true;
    if (y >= falseAt) return false;
    const p = clampedMap(y, trueAt, falseAt, 1, 0);
    return hashFloat(hash3(x, y, z, this.seedHash ^ salt)) < p;
  }

  private steep(ctx: GenContext, lx: number, lz: number): boolean {
    const hs = ctx.surface;
    const k = Math.max(lz - 1, 0), l = Math.min(lz + 1, 15);
    const i1 = hs[(k << 4) | lx], j1 = hs[(l << 4) | lx];
    if (j1 >= i1 + 4) return true;
    const k1 = Math.max(lx - 1, 0), l1 = Math.min(lx + 1, 15);
    const i2 = hs[(lz << 4) | k1], j2 = hs[(lz << 4) | l1];
    return i2 >= j2 + 4;
  }

  private surfaceRule(
    x: number, y: number, z: number, biome: number, sda: number, sdb: number, waterHeight: number, surfaceDepth: number,
    secondary: number, sNoise: number, steep: boolean, K: SurfBlocks,
  ): number {
    const n = this.router.n;
    const ON_FLOOR = sda <= 1;
    const UNDER_FLOOR = sda <= 1 + surfaceDepth;
    const deep = (range: number) => sda <= 1 + surfaceDepth + Math.floor(clampedMap(secondary, -1, 1, 0, range));
    const ON_CEILING = sdb <= 1;
    const noWater = waterHeight === -Infinity;
    const water0 = noWater || y >= waterHeight;
    const water1 = noWater || y >= waterHeight - 1;
    const waterStart = noWater || y + sda >= waterHeight - 6 - surfaceDepth;
    const hole = surfaceDepth <= 0;
    const grassOrDirt = water0 ? K.GRASS : K.DIRT;
    const sandCeil = ON_CEILING ? K.SANDSTONE : K.SAND;
    const gravelCeil = ON_CEILING ? K.STONE : K.GRAVEL;
    const sn = (v: number) => sNoise > v / 8.25;
    const nz = (noise: NormalNoise, lo: number, hi: number) => {
      const v = noise.getValue(x, 0, z);
      return v >= lo && v <= hi;
    };
    const commonStone = (): number => {
      if (biome === B.stony_peaks) return nz(n.calcite, -0.0125, 0.0125) ? K.CALCITE : K.STONE;
      if (biome === B.stony_shore) return nz(n.gravel, -0.05, 0.05) ? gravelCeil : K.STONE;
      if (biome === B.windswept_hills) return sn(1) ? K.STONE : -1;
      if (biome === B.warm_ocean || biome === B.beach || biome === B.snowy_beach) return sandCeil;
      if (biome === B.desert) return sandCeil;
      if (biome === B.dripstone_caves) return K.STONE;
      return -1;
    };
    const underFloor = (): number => {
      if (biome === B.frozen_peaks) {
        if (steep) return K.PACKED_ICE;
        if (nz(n.packed_ice, -0.5, 0.2)) return K.PACKED_ICE;
        if (nz(n.ice, -0.0625, 0.025)) return K.ICE;
        if (water0) return K.SNOW_BLOCK;
      } else if (biome === B.snowy_slopes) {
        if (steep) return K.STONE;
        if (nz(n.powder_snow, 0.45, 0.58) && water0) return K.POWDER_SNOW;
        if (water0) return K.SNOW_BLOCK;
      } else if (biome === B.jagged_peaks) return K.STONE;
      else if (biome === B.grove) {
        if (nz(n.powder_snow, 0.45, 0.58) && water0) return K.POWDER_SNOW;
        return K.DIRT;
      }
      const cs = commonStone();
      if (cs >= 0) return cs;
      if (biome === B.windswept_savanna && sn(1.75)) return K.STONE;
      if (biome === B.windswept_gravelly_hills) {
        if (sn(2)) return gravelCeil;
        if (sn(1)) return K.STONE;
        if (sn(-1)) return K.DIRT;
        return gravelCeil;
      }
      if (biome === B.mangrove_swamp) return K.MUD;
      return K.DIRT;
    };
    const onFloor = (): number => {
      if (biome === B.frozen_peaks) {
        if (steep) return K.PACKED_ICE;
        if (nz(n.packed_ice, 0, 0.2)) return K.PACKED_ICE;
        if (nz(n.ice, 0, 0.025)) return K.ICE;
        if (water0) return K.SNOW_BLOCK;
      } else if (biome === B.snowy_slopes) {
        if (steep) return K.STONE;
        if (nz(n.powder_snow, 0.35, 0.6) && water0) return K.POWDER_SNOW;
        if (water0) return K.SNOW_BLOCK;
      } else if (biome === B.jagged_peaks) {
        if (steep) return K.STONE;
        if (water0) return K.SNOW_BLOCK;
      } else if (biome === B.grove) {
        if (nz(n.powder_snow, 0.35, 0.6) && water0) return K.POWDER_SNOW;
        if (water0) return K.SNOW_BLOCK;
      }
      const cs = commonStone();
      if (cs >= 0) return cs;
      if (biome === B.windswept_savanna) {
        if (sn(1.75)) return K.STONE;
        if (sn(-0.5)) return K.COARSE_DIRT;
      }
      if (biome === B.windswept_gravelly_hills) {
        if (sn(2)) return gravelCeil;
        if (sn(1)) return K.STONE;
        if (sn(-1)) return grassOrDirt;
        return gravelCeil;
      }
      if (biome === B.old_growth_pine_taiga || biome === B.old_growth_spruce_taiga) {
        if (sn(1.75)) return K.COARSE_DIRT;
        if (sn(-0.95)) return K.PODZOL;
      }
      if (biome === B.ice_spikes && water0) return K.SNOW_BLOCK;
      if (biome === B.mangrove_swamp) return K.MUD;
      if (biome === B.mushroom_fields) return K.MYCELIUM;
      return grassOrDirt;
    };
    const isBadlands = biome === B.badlands || biome === B.eroded_badlands || biome === B.wooded_badlands;
    const noiseABC = () => {
      const v = sNoise;
      return (v >= -0.909 && v <= -0.5454) || (v >= -0.1818 && v <= 0.1818) || (v >= 0.5454 && v <= 0.909);
    };
    // 1
    if (ON_FLOOR) {
      if (biome === B.wooded_badlands && y >= 97 + 2 * surfaceDepth) return noiseABC() ? K.COARSE_DIRT : grassOrDirt;
      if (biome === B.swamp && y >= 62 && y < 63 && n.swamp.getValue(x, 0, z) >= 0) return K.WATER;
      if (biome === B.mangrove_swamp && y >= 60 && y < 63 && n.swamp.getValue(x, 0, z) >= 0) return K.WATER;
    }
    // 2 badlands
    if (isBadlands) {
      if (ON_FLOOR) {
        if (y >= 256) return K.ORANGE_TC;
        if (y + sda >= 74 + surfaceDepth) return noiseABC() ? K.TERRACOTTA : this.band(x, y, z);
        if (water1) return ON_CEILING ? K.RED_SANDSTONE : K.RED_SAND;
        if (!hole) return K.ORANGE_TC;
        if (waterStart) return K.WHITE_TC;
        return gravelCeil;
      }
      if (y + sda >= 63 - surfaceDepth) {
        if (y >= 63 && !(y + sda >= 74 + surfaceDepth)) return K.ORANGE_TC;
        return this.band(x, y, z);
      }
      if (UNDER_FLOOR && waterStart) return K.WHITE_TC;
    }
    // 3
    if (ON_FLOOR && water1) {
      if ((biome === B.frozen_ocean || biome === B.deep_frozen_ocean) && hole) {
        if (water0) return K.AIR;
        return K.WATER;
      }
      return onFloor();
    }
    // 4
    if (waterStart) {
      if (ON_FLOOR && (biome === B.frozen_ocean || biome === B.deep_frozen_ocean) && hole) return K.WATER;
      if (UNDER_FLOOR) return underFloor();
      if ((biome === B.warm_ocean || biome === B.beach || biome === B.snowy_beach) && deep(6)) return K.SANDSTONE;
      if (biome === B.desert && deep(30)) return K.SANDSTONE;
    }
    // 5
    if (ON_FLOOR) {
      if (biome === B.frozen_peaks || biome === B.jagged_peaks) return K.STONE;
      if (biome === B.warm_ocean || biome === B.lukewarm_ocean || biome === B.deep_lukewarm_ocean) return sandCeil;
      return gravelCeil;
    }
    return -1;
  }

  private band(x: number, y: number, z: number): number {
    const i = Math.round(this.router.n.clay_bands_offset.getValue(x, 0, z) * 4);
    const len = this.clayBands.length;
    return this.clayBands[(((y + i) % len) + len) % len];
  }
}

function tri(cv: Float32Array, ch: number, tx: number, ty: number, tz: number): number {
  const C = CHANNELS;
  const c000 = cv[ch], c100 = cv[C + ch], c010 = cv[2 * C + ch], c110 = cv[3 * C + ch];
  const c001 = cv[4 * C + ch], c101 = cv[5 * C + ch], c011 = cv[6 * C + ch], c111 = cv[7 * C + ch];
  const a0 = c000 + tx * (c100 - c000);
  const a1 = c010 + tx * (c110 - c010);
  const a2 = c001 + tx * (c101 - c001);
  const a3 = c011 + tx * (c111 - c011);
  const b0 = a0 + ty * (a1 - a0);
  const b1 = a2 + ty * (a3 - a2);
  return b0 + tz * (b1 - b0);
}

interface SurfBlocks {
  AIR: number; STONE: number; DIRT: number; GRASS: number; SAND: number; SANDSTONE: number; GRAVEL: number; WATER: number; LAVA: number;
  BEDROCK: number; DEEPSLATE: number; CALCITE: number; PACKED_ICE: number; ICE: number; SNOW_BLOCK: number; POWDER_SNOW: number;
  COARSE_DIRT: number; PODZOL: number; MUD: number; MYCELIUM: number; RED_SAND: number; RED_SANDSTONE: number;
  TERRACOTTA: number; ORANGE_TC: number; WHITE_TC: number;
}
let SURF: SurfBlocks | null = null;
function BLOCKS_SURF(): SurfBlocks {
  if (SURF) return SURF;
  SURF = {
    AIR: 0, STONE: S('stone'), DIRT: S('dirt'), GRASS: S('grass_block'), SAND: S('sand'), SANDSTONE: S('sandstone'), GRAVEL: S('gravel'),
    WATER: S('water'), LAVA: S('lava'), BEDROCK: S('bedrock'), DEEPSLATE: S('deepslate'), CALCITE: S('calcite'), PACKED_ICE: S('packed_ice'),
    ICE: S('ice'), SNOW_BLOCK: S('snow_block'), POWDER_SNOW: S('powder_snow'), COARSE_DIRT: S('coarse_dirt'), PODZOL: S('podzol'),
    MUD: S('mud'), MYCELIUM: S('mycelium'), RED_SAND: S('red_sand'), RED_SANDSTONE: S('red_sandstone'), TERRACOTTA: S('terracotta'),
    ORANGE_TC: S('orange_terracotta'), WHITE_TC: S('white_terracotta'),
  };
  return SURF;
}

function makeClayBands(r: Rand): number[] {
  const TC = S('terracotta');
  const bands = new Array(192).fill(TC);
  for (let i = 0; i < bands.length; i++) {
    i += r.nextInt(5) + 1;
    if (i < bands.length) bands[i] = S('orange_terracotta');
  }
  const make = (min: number, state: number) => {
    const n = 6 + r.nextInt(10);
    for (let j = 0; j < n; j++) {
      const k = min + r.nextInt(3);
      const l = r.nextInt(bands.length);
      for (let i1 = 0; l + i1 < bands.length && i1 < k; i1++) bands[l + i1] = state;
    }
  };
  make(1, S('yellow_terracotta'));
  make(2, S('brown_terracotta'));
  make(1, S('red_terracotta'));
  const j = 9 + r.nextInt(7);
  let k = 0;
  for (let l = 0; k < j && l < bands.length; l += r.nextInt(16) + 4) {
    bands[l] = S('white_terracotta');
    if (l - 1 > 0 && r.nextBool()) bands[l - 1] = S('light_gray_terracotta');
    if (l + 1 < bands.length && r.nextBool()) bands[l + 1] = S('light_gray_terracotta');
    k++;
  }
  return bands;
}

export { B, BIOMES, pickCaveBiome, getBlock, hashString };
