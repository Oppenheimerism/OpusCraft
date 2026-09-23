// The Nether's chunk generator (vanilla NoiseBasedChunkGenerator with the
// nether noise settings): one 3D noise between a floor slide and a roof slide,
// a lava sea below y 32, the nether surface rules, tall nether caves, the five
// biomes picked from two climate noises, and their decoration (springs,
// glowstone, fire, ores, and the basalt deltas' lava pools and columns).

import { SeedSource, NormalNoise, BlendedNoise } from './noise';
import { squeeze } from './router';
import { GenContext, W_NETHERRACK, W_NETHER_STONE } from './context';
import { B, BIOMES } from './biomes';
import { S, BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_LAVA, F_WATER } from '../block';
import { COLUMN_VOLUME, colIndex } from '../constants';
import { Rand, hash2, hash3, hashFloat, hash32 } from '../../core/rng';
import { clampedMap } from '../../core/math';
import { computeChunkLight } from '../lightlocal';
import type { GenOutput } from './generator';
import { placeOre, sampleHeight, type OreSpec } from './features';
import {
  placeNetherFeature, F_GLOWSTONE, F_FIRE, F_BROWN_MUSHROOM, F_RED_MUSHROOM, F_DELTA, F_SMALL_COLUMNS, F_LARGE_COLUMNS, F_PILLAR,
  F_CRIMSON_FUNGUS, F_WARPED_FUNGUS, F_CRIMSON_VEGETATION, F_WARPED_VEGETATION, F_NETHER_SPROUTS, F_WEEPING_VINES, F_TWISTING_VINES, F_SOUL_FIRE,
} from './netherFeatures';

const CELL_W = 4, CELL_H = 8;
/** vanilla nether noise settings: min_y 0, height 128 */
const NOISE_H = 128;
const NCX = 5, NCY = NOISE_H / CELL_H + 1; // 17
const SEA_LEVEL = 32;
const TOP = NOISE_H - 1; // 127

/** vanilla MultiNoiseBiomeSourceParameterList.Preset.NETHER: temperature, humidity, offset */
const NETHER_POINTS: [number, number, number, number][] = [
  [B.nether_wastes, 0, 0, 0],
  [B.soul_sand_valley, 0, -0.5, 0],
  [B.crimson_forest, 0.4, 0, 0],
  [B.warped_forest, 0, 0.5, 0.375],
  [B.basalt_deltas, -0.5, 0, 0.175],
];

interface NB {
  NETHERRACK: number; LAVA: number; BEDROCK: number; GRAVEL: number; SOUL_SAND: number; SOUL_SOIL: number; BASALT: number;
  BLACKSTONE: number; CRIMSON_NYLIUM: number; WARPED_NYLIUM: number; NETHER_WART_BLOCK: number; WARPED_WART_BLOCK: number;
  GLOWSTONE: number; MAGMA: number; FIRE: number; BROWN_MUSHROOM: number; RED_MUSHROOM: number;
}
let NBLK: NB | null = null;
function nb(): NB {
  return (NBLK ??= {
    NETHERRACK: S('netherrack'), LAVA: S('lava'), BEDROCK: S('bedrock'), GRAVEL: S('gravel'), SOUL_SAND: S('soul_sand'), SOUL_SOIL: S('soul_soil'),
    BASALT: S('basalt'), BLACKSTONE: S('blackstone'), CRIMSON_NYLIUM: S('crimson_nylium'), WARPED_NYLIUM: S('warped_nylium'),
    NETHER_WART_BLOCK: S('nether_wart_block'), WARPED_WART_BLOCK: S('warped_wart_block'), GLOWSTONE: S('glowstone'), MAGMA: S('magma_block'),
    FIRE: S('fire'), BROWN_MUSHROOM: S('brown_mushroom'), RED_MUSHROOM: S('red_mushroom'),
  });
}

const isAir = (st: number) => st >= 0 && (FLAGS[st] & F_AIR) !== 0;
const isFluid = (st: number) => st >= 0 && (FLAGS[st] & (F_WATER | F_LAVA)) !== 0 && BLOCKS[STATE_BLOCK[st]].s.fluid !== undefined;
const nameOf = (st: number) => BLOCKS[STATE_BLOCK[st]].name;

export class NetherGenerator {
  private readonly seeds: SeedSource;
  private readonly seedHash: number;
  private readonly base3d: BlendedNoise;
  private readonly temperature: NormalNoise;
  private readonly vegetation: NormalNoise;
  private readonly surface: NormalNoise;
  private readonly soulSandLayer: NormalNoise;
  private readonly gravelLayer: NormalNoise;
  private readonly patch: NormalNoise;
  private readonly netherrackNoise: NormalNoise;
  private readonly netherWart: NormalNoise;
  private readonly stateSelector: NormalNoise;

  constructor(seed: string | number | bigint) {
    this.seeds = SeedSource.fromWorldSeed(typeof seed === 'string' ? seed : BigInt(seed)).sub('minecraft:the_nether');
    this.seedHash = hash32(this.seeds.lo ^ this.seeds.hi);
    const s = this.seeds;
    // vanilla BASE_3D_NOISE_NETHER: BlendedNoise(0.25, 0.375, 80, 60, 8)
    this.base3d = new BlendedNoise(s.sub('minecraft:terrain'), 0.25, 0.375, 80, 60, 8);
    // (legacy random source: the nether's climate noises are two octaves from -7, with no shift)
    this.temperature = new NormalNoise(s.sub('minecraft:temperature'), { firstOctave: -7, amplitudes: [1, 1] });
    this.vegetation = new NormalNoise(s.sub('minecraft:vegetation'), { firstOctave: -7, amplitudes: [1, 1] });
    this.surface = new NormalNoise(s.sub('minecraft:surface'), { firstOctave: -6, amplitudes: [1, 1, 1] });
    this.soulSandLayer = new NormalNoise(s.sub('minecraft:soul_sand_layer'), { firstOctave: -8, amplitudes: [1, 1, 1, 1, 0, 0, 0, 0, 0.013333333333333334] });
    this.gravelLayer = new NormalNoise(s.sub('minecraft:gravel_layer'), { firstOctave: -8, amplitudes: [1, 1, 1, 1, 0, 0, 0, 0, 0.013333333333333334] });
    this.patch = new NormalNoise(s.sub('minecraft:patch'), { firstOctave: -5, amplitudes: [1, 0, 0, 0, 0, 0.013333333333333334] });
    this.netherrackNoise = new NormalNoise(s.sub('minecraft:netherrack'), { firstOctave: -3, amplitudes: [1, 0, 0, 0.35] });
    this.netherWart = new NormalNoise(s.sub('minecraft:nether_wart'), { firstOctave: -3, amplitudes: [1, 0, 0, 0.9] });
    this.stateSelector = new NormalNoise(s.sub('minecraft:nether_state_selector'), { firstOctave: -4, amplitudes: [1] });
  }

  // -------------------------------------------------------------------------
  // Biomes

  /** vanilla Climate.Sampler at a quart: the nearest of the five parameter points (offset counts as distance) */
  biomeAtQuart(qx: number, qz: number): number {
    const x = qx * 4, z = qz * 4;
    const t = this.temperature.getValue(x * 0.25, 0, z * 0.25);
    const h = this.vegetation.getValue(x * 0.25, 0, z * 0.25);
    let best = B.nether_wastes, bestD = Infinity;
    for (const [biome, bt, bh, off] of NETHER_POINTS) {
      const d = (t - bt) * (t - bt) + (h - bh) * (h - bh) + off * off;
      if (d < bestD) {
        bestD = d;
        best = biome;
      }
    }
    return best;
  }

  /** the biome at a block column (vanilla BiomeManager's fuzzy zoom from quarts) */
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
    return this.biomeAtQuart(qx + (best & 1), qz + (best >> 1));
  }

  // -------------------------------------------------------------------------
  // Terrain

  /** corner densities already worked out (solidAt is asked the same corners over and over) */
  private readonly slideCache = new Map<number, number>();

  /** vanilla nether final density before interpolation: the 3D noise slid to solid at the floor and the roof */
  private slide(x: number, y: number, z: number): number {
    const key = ((x >> 2) + 0x40000) * 0x80000 * 32 + ((z >> 2) + 0x40000) * 32 + (y >> 3);
    const hit = this.slideCache.get(key);
    if (hit !== undefined) return hit;
    if (this.slideCache.size > 50000) this.slideCache.clear();
    const d = this.slideAt(x, y, z);
    this.slideCache.set(key, d);
    return d;
  }

  private slideAt(x: number, y: number, z: number): number {
    const n = this.base3d.compute(x, y, z);
    // top slide: from y 104 up to 128 towards 0.9375; bottom slide: from y 24 down to -8 towards 2.5
    let d = 0.9375 + clampedMap(y, 104, 128, 1, 0) * (n - 0.9375);
    d = 2.5 + clampedMap(y, -8, 24, 0, 1) * (d - 2.5);
    return d;
  }

  /** whether the noise terrain is solid at a block (for features looking into chunks not generated yet) */
  solidAt(x: number, y: number, z: number): boolean {
    if (y < 0 || y >= NOISE_H) return false;
    const x0 = Math.floor(x / CELL_W) * CELL_W, z0 = Math.floor(z / CELL_W) * CELL_W, y0 = Math.floor(y / CELL_H) * CELL_H;
    const c = new Float64Array(8);
    for (let n = 0; n < 8; n++) c[n] = this.slide(x0 + (n & 1) * CELL_W, y0 + ((n >> 1) & 1) * CELL_H, z0 + ((n >> 2) & 1) * CELL_W);
    const tx = (x - x0) / CELL_W, ty = (y - y0) / CELL_H, tz = (z - z0) / CELL_W;
    return squeeze(0.64 * tri(c, tx, ty, tz)) > 0;
  }

  generate(cx: number, cz: number): GenOutput {
    const K = nb();
    const x0 = cx * 16, z0 = cz * 16;

    // ---- biomes, per column
    const biomes = new Uint8Array(256);
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) biomes[(lz << 4) | lx] = this.biomeAt(x0 + lx, z0 + lz);

    // ---- corner densities (5 x 17 x 5)
    const corners = new Float64Array(NCX * NCY * NCX);
    for (let k = 0; k < NCX; k++)
      for (let i = 0; i < NCX; i++)
        for (let j = 0; j < NCY; j++) corners[(k * NCY + j) * NCX + i] = this.slide(x0 + i * CELL_W, j * CELL_H, z0 + k * CELL_W);

    // ---- fill: netherrack where the density is positive, the lava sea below y 32
    const blocks = new Uint16Array(COLUMN_VOLUME);
    const cv = new Float64Array(8);
    for (let ck = 0; ck < 4; ck++)
      for (let ci = 0; ci < 4; ci++)
        for (let cj = 0; cj < NCY - 1; cj++) {
          for (let n = 0; n < 8; n++) cv[n] = corners[((ck + ((n >> 2) & 1)) * NCY + cj + ((n >> 1) & 1)) * NCX + ci + (n & 1)];
          for (let dy = 0; dy < CELL_H; dy++) {
            const y = cj * CELL_H + dy, ty = dy / CELL_H;
            for (let dz = 0; dz < CELL_W; dz++)
              for (let dx = 0; dx < CELL_W; dx++) {
                const d = squeeze(0.64 * tri(cv, dx / CELL_W, ty, dz / CELL_W));
                const idx = colIndex(ci * 4 + dx, y, ck * 4 + dz);
                if (d > 0) blocks[idx] = K.NETHERRACK;
                else if (y < SEA_LEVEL) blocks[idx] = K.LAVA;
              }
          }
        }

    const ctx = new GenContext(cx, cz, blocks, biomes, null);
    ctx.solidGuess = (x, y, z) => this.solidAt(x, y, z);
    this.buildSurface(ctx);
    this.carve(ctx);
    ctx.computeHeightmaps();
    this.decorate(ctx);
    const light = computeChunkLight(blocks, false);
    return { cx, cz, blocks, light, biomes, pending: ctx.pendingWrites(), fluidTicks: ctx.fluidTicks, blockEntities: ctx.blockEntities, entities: ctx.entities, postProcess: ctx.postProcess, caveBiomes: null };
  }

  // -------------------------------------------------------------------------
  // Surface rules (vanilla SurfaceRuleData.nether)

  private buildSurface(ctx: GenContext): void {
    const K = nb();
    const blocks = ctx.blocks;
    for (let lz = 0; lz < 16; lz++)
      for (let lx = 0; lx < 16; lx++) {
        const x = ctx.x0 + lx, z = ctx.z0 + lz;
        const biome = ctx.biomes[(lz << 4) | lx];
        const surfaceDepth = Math.trunc(this.surface.getValue(x, 0, z) * 2.75 + 3 + hashFloat(hash2(x, z, this.seedHash ^ 0x5d)) * 0.25);
        // the column's noise conditions (vanilla samples them at y 0)
        const soulSandLayer = this.soulSandLayer.getValue(x, 0, z) >= -0.012;
        const gravelLayer = this.gravelLayer.getValue(x, 0, z) >= -0.012;
        const patch = this.patch.getValue(x, 0, z) >= -0.012;
        const netherrack = this.netherrackNoise.getValue(x, 0, z) >= 0.54;
        const wart = this.netherWart.getValue(x, 0, z) >= 1.17;
        const state = this.stateSelector.getValue(x, 0, z) >= 0;
        const hole = surfaceDepth <= 0;
        let sda = 0;
        let below = Number.MAX_SAFE_INTEGER;
        for (let y = TOP; y >= 0; y--) {
          const idx = colIndex(lx, y, lz);
          const st = blocks[idx];
          if (st === 0) {
            sda = 0;
            continue;
          }
          if (st === K.LAVA) continue;
          if (below >= y) {
            // the next non-stone block down (vanilla: the bottom of the world counts as air)
            below = -1;
            for (let j = y - 1; j >= -1; j--) {
              const b = j < 0 ? 0 : blocks[colIndex(lx, j, lz)];
              if (b === 0 || b === K.LAVA) {
                below = j + 1;
                break;
              }
            }
          }
          sda++;
          const sdb = y - below + 1;
          if (st !== K.NETHERRACK) continue;
          const onFloor = sda <= 1;
          const underFloor = sda <= 1 + surfaceDepth;
          const underCeiling = sdb <= 1 + surfaceDepth;
          const c3 = y + sda >= 30, c4 = y + sda < 35;
          const gravelPatch = patch && c3 && c4;
          let out = -1;
          if (y < 5 && this.gradient(x, y, z, 0, 5, 0xbed0)) out = K.BEDROCK;
          else if (y > 122 && !this.gradient(x, y, z, 122, 127, 0xbed1)) out = K.BEDROCK;
          else if (y >= 122) out = K.NETHERRACK;
          else if (biome === B.basalt_deltas && (underCeiling || underFloor)) {
            if (underCeiling) out = K.BASALT;
            else out = gravelPatch ? K.GRAVEL : state ? K.BASALT : K.BLACKSTONE;
          } else if (biome === B.soul_sand_valley && (underCeiling || underFloor)) {
            if (underCeiling) out = state ? K.SOUL_SAND : K.SOUL_SOIL;
            else out = gravelPatch ? K.GRAVEL : state ? K.SOUL_SAND : K.SOUL_SOIL;
          } else {
            if (onFloor) {
              if (y < 32 && hole) out = K.LAVA;
              else if (biome === B.warped_forest && !netherrack && y >= 31) out = wart ? K.WARPED_WART_BLOCK : K.WARPED_NYLIUM;
              else if (biome === B.crimson_forest && !netherrack && y >= 31) out = wart ? K.NETHER_WART_BLOCK : K.CRIMSON_NYLIUM;
            }
            if (out < 0 && biome === B.nether_wastes) {
              if (underFloor && soulSandLayer) out = !hole && c3 && c4 ? K.SOUL_SAND : K.NETHERRACK;
              else if (onFloor && y >= 31 && c4 && gravelLayer && (y >= 32 || !hole)) out = K.GRAVEL;
            }
          }
          if (out >= 0 && out !== st) blocks[idx] = out;
        }
      }
  }

  /** vanilla verticalGradient: always at or below trueAt, never at or above falseAt, fading between */
  private gradient(x: number, y: number, z: number, trueAt: number, falseAt: number, salt: number): boolean {
    if (y <= trueAt) return true;
    if (y >= falseAt) return false;
    return hashFloat(hash3(x, y, z, this.seedHash ^ salt)) < clampedMap(y, trueAt, falseAt, 1, 0);
  }

  // -------------------------------------------------------------------------
  // Carvers (vanilla NetherWorldCarver, configured "nether_cave")

  private carve(ctx: GenContext): void {
    const c = new NetherCarving(ctx);
    for (let dz = -8; dz <= 8; dz++)
      for (let dx = -8; dx <= 8; dx++) {
        const sx = ctx.cx + dx, sz = ctx.cz + dz;
        const r = new Rand(hash2(sx, sz, this.seedHash ^ 0x5ca7e), 1);
        if (r.nextFloat() <= 0.2) c.caves(r, sx, sz);
      }
  }

  // -------------------------------------------------------------------------
  // Decoration

  private decorate(ctx: GenContext): void {
    const present = new Set<number>();
    for (let i = 0; i < 256; i++) present.add(ctx.biomes[i]);
    const has = (bs: number[]) => bs.some((b) => present.has(b));
    const rand = (i: number) => new Rand(hash2(ctx.cx, ctx.cz, this.seedHash ^ Math.imul(i + 1, 0x9e3779b1)), 17 + i);
    const W = B.nether_wastes, SV = B.soul_sand_valley, CF = B.crimson_forest, WF = B.warped_forest, BD = B.basalt_deltas;
    const ALL = [W, SV, CF, WF, BD];
    const K = nb();
    /** a feature that may reach over the border: its own seed, so the neighbours can replay it */
    const feature = (f: number) => (r: Rand, x: number, y: number, z: number) => placeNetherFeature(ctx, f, r.nextU32(), x, y, z);
    let i = 0;
    const step = (biomes: number[], go: (r: Rand) => void) => {
      const r = rand(i++);
      if (has(biomes)) go(r);
    };
    // LOCAL_MODIFICATIONS
    step([SV], (r) => this.count(ctx, r, 10, 0, TOP, [SV], feature(F_PILLAR)));
    // SURFACE_STRUCTURES (deltas are let into the floor block under the layer's empty block)
    step([BD], (r) => this.everyLayer(ctx, r, 40, [BD], (r2, x, y, z) => feature(F_DELTA)(r2, x, y - 1, z)));
    step([BD], (r) => this.everyLayer(ctx, r, 4, [BD], feature(F_SMALL_COLUMNS)));
    step([BD], (r) => this.everyLayer(ctx, r, 2, [BD], feature(F_LARGE_COLUMNS)));
    // UNDERGROUND_DECORATION
    step([BD], (r) => this.count(ctx, r, 75, 0, TOP, [BD], (r2, x, y, z) => replaceBlob(ctx, r2, x, y, z, K.BASALT)));
    step([BD], (r) => this.count(ctx, r, 25, 0, TOP, [BD], (r2, x, y, z) => replaceBlob(ctx, r2, x, y, z, K.BLACKSTONE)));
    // lava breaking out of the walls
    step([BD], (r) => this.count(ctx, r, 16, 4, 123, [BD], (_r, x, y, z) => spring(ctx, x, y, z, DELTA_SPRING_ROCK, true, 4, 1)));
    step([W, SV, CF, WF], (r) => this.count(ctx, r, 8, 4, 123, [W, SV, CF, WF], (_r, x, y, z) => spring(ctx, x, y, z, NETHERRACK_ONLY, false, 4, 1)));
    step([W, SV, CF, BD], (r) => this.count(ctx, r, [0, 5], 4, 123, [W, SV, CF, BD], feature(F_FIRE)));
    step([W, SV, WF, BD], (r) => this.count(ctx, r, [0, 5], 4, 123, [W, SV, WF, BD], feature(F_SOUL_FIRE)));
    step(ALL, (r) => this.count(ctx, r, 'glowstone_extra', 4, 123, ALL, feature(F_GLOWSTONE)));
    step(ALL, (r) => this.count(ctx, r, 10, 0, TOP, ALL, feature(F_GLOWSTONE)));
    // (patch_crimson_roots waits for the roots)
    i++;
    for (const f of [F_BROWN_MUSHROOM, F_RED_MUSHROOM]) step([W, BD], (r) => r.nextInt(2) === 0 && this.count(ctx, r, 1, 0, TOP, [W, BD], feature(f)));
    const ore = (spec: OreSpec, biomes: number[]) => step(biomes, (r) => this.ore(ctx, r, spec, biomes));
    ore({ stone: 'magma_block', size: 33, count: 4, height: ['uniform', 27, 36], rule: W_NETHERRACK }, ALL);
    // closed springs: lava sealed in the rock, let out when it's mined into
    step([W, SV, CF, WF], (r) => this.count(ctx, r, 16, 10, 117, [W, SV, CF, WF], (_r, x, y, z) => spring(ctx, x, y, z, NETHERRACK_ONLY, false, 5, 0)));
    step([BD], (r) => this.count(ctx, r, 32, 10, 117, [BD], (_r, x, y, z) => spring(ctx, x, y, z, NETHERRACK_ONLY, false, 5, 0)));
    ore({ stone: 'soul_sand', size: 12, count: 12, height: ['uniform', 0, 31], rule: W_NETHERRACK }, [SV]);
    ore({ stone: 'gravel', size: 33, count: 2, height: ['uniform', 5, 41], rule: W_NETHERRACK }, [W, SV, CF, WF]);
    ore({ stone: 'blackstone', size: 33, count: 2, height: ['uniform', 5, 31], rule: W_NETHERRACK }, [W, SV, CF, WF]);
    ore({ stone: 'nether_gold_ore', size: 10, count: 10, height: ['uniform', 10, 117], rule: W_NETHERRACK }, [W, SV, CF, WF]);
    ore({ stone: 'nether_quartz_ore', size: 14, count: 16, height: ['uniform', 10, 117], rule: W_NETHERRACK }, [W, SV, CF, WF]);
    ore({ stone: 'nether_gold_ore', size: 10, count: 20, height: ['uniform', 10, 117], rule: W_NETHERRACK }, [BD]);
    ore({ stone: 'nether_quartz_ore', size: 14, count: 32, height: ['uniform', 10, 117], rule: W_NETHERRACK }, [BD]);
    // ancient debris: never where it would show in a wall (discarded on any air)
    ore({ stone: 'ancient_debris', size: 3, count: 1, height: ['trapezoid', 8, 24], rule: W_NETHER_STONE, discard: 1 }, ALL);
    ore({ stone: 'ancient_debris', size: 2, count: 1, height: ['uniform', 8, 119], rule: W_NETHER_STONE, discard: 1 }, ALL);
    // VEGETAL_DECORATION: the overworld's mushroom patches land on top of the roof
    for (const [f, rarity] of [[F_BROWN_MUSHROOM, 256], [F_RED_MUSHROOM, 512]]) {
      step([W, CF, WF], (r) => {
        if (r.nextInt(rarity) !== 0) return;
        const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16);
        if ([W, CF, WF].includes(ctx.biomeAt(x, z))) feature(f)(r, x, ctx.heightMotion(x, z), z);
      });
    }
    // the forests: weeping vines, huge fungi and the undergrowth (crimson); fungi, undergrowth, sprouts and twisting vines (warped)
    step([CF], (r) => this.count(ctx, r, 10, 0, 255, [CF], feature(F_WEEPING_VINES)));
    step([CF], (r) => this.everyLayer(ctx, r, 8, [CF], feature(F_CRIMSON_FUNGUS)));
    step([CF], (r) => this.everyLayer(ctx, r, 6, [CF], feature(F_CRIMSON_VEGETATION)));
    step([WF], (r) => this.everyLayer(ctx, r, 8, [WF], feature(F_WARPED_FUNGUS)));
    step([WF], (r) => this.everyLayer(ctx, r, 5, [WF], feature(F_WARPED_VEGETATION)));
    step([WF], (r) => this.everyLayer(ctx, r, 4, [WF], feature(F_NETHER_SPROUTS)));
    step([WF], (r) => this.count(ctx, r, 10, 0, 255, [WF], feature(F_TWISTING_VINES)));
  }

  /** vanilla CountPlacement + InSquarePlacement + a uniform height range + BiomeFilter */
  private count(
    ctx: GenContext, r: Rand, n: number | [number, number] | 'glowstone_extra', lo: number, hi: number, biomes: number[],
    place: (r: Rand, x: number, y: number, z: number) => void,
  ): void {
    // (glowstone_extra: vanilla BiasedToBottomInt(0, 9))
    const count = n === 'glowstone_extra' ? r.nextInt(r.nextInt(10) + 1) : typeof n === 'number' ? n : n[0] + r.nextInt(n[1] - n[0] + 1);
    for (let k = 0; k < count; k++) {
      const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16);
      const y = lo + r.nextInt(hi - lo + 1);
      if (!biomes.includes(ctx.biomeAt(x, z))) continue;
      place(r, x, y, z);
    }
  }

  /** vanilla CountOnEveryLayerPlacement: `n` columns per floor layer, from the top floor down until a layer has none */
  private everyLayer(ctx: GenContext, r: Rand, n: number, biomes: number[], place: (r: Rand, x: number, y: number, z: number) => void): void {
    for (let layer = 0; ; layer++) {
      let any = false;
      for (let k = 0; k < n; k++) {
        const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16);
        const y = onGroundY(ctx, x, ctx.heightMotion(x, z), z, layer);
        if (y === null) continue;
        any = true;
        if (biomes.includes(ctx.biomeAt(x, z))) place(r, x, y, z);
      }
      if (!any) return;
    }
  }

  private ore(ctx: GenContext, r: Rand, spec: OreSpec, biomes: number[]): void {
    const n = typeof spec.count === 'number' ? spec.count : spec.count[0] + r.nextInt(spec.count[1] - spec.count[0] + 1);
    for (let k = 0; k < n; k++) {
      const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16);
      const y = sampleHeight(r, spec.height);
      if (!biomes.includes(ctx.biomeAt(x, z))) continue;
      placeOre(ctx, r, spec, x, y, z);
    }
  }
}

function tri(c: Float64Array, tx: number, ty: number, tz: number): number {
  const a0 = c[0] + tx * (c[1] - c[0]);
  const a1 = c[2] + tx * (c[3] - c[2]);
  const a2 = c[4] + tx * (c[5] - c[4]);
  const a3 = c[6] + tx * (c[7] - c[6]);
  const b0 = a0 + ty * (a1 - a0);
  const b1 = a2 + ty * (a3 - a2);
  return b0 + tz * (b1 - b0);
}

/** vanilla CountOnEveryLayerPlacement.findOnGroundYPosition: the empty block over the `layer`-th floor from the top */
function onGroundY(ctx: GenContext, x: number, top: number, z: number, layer: number): number | null {
  const empty = (st: number) => st === 0 || (FLAGS[st] & (F_WATER | F_LAVA)) !== 0 && isFluid(st);
  const BEDROCK = nb().BEDROCK;
  let above = ctx.getOrAir(x, top, z);
  let seen = 0;
  for (let y = top; y >= 1; y--) {
    const st = ctx.getOrAir(x, y - 1, z);
    if (!empty(st) && empty(above) && st !== BEDROCK) {
      if (seen === layer) return y;
      seen++;
    }
    above = st;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Features

const NETHERRACK_ONLY = ['netherrack'];
const DELTA_SPRING_ROCK = ['netherrack', 'soul_sand', 'gravel', 'magma_block', 'blackstone'];

/** vanilla SpringFeature: lava where exactly `rock` of the sides and bottom are the right rock and `holes` are open */
function spring(ctx: GenContext, x: number, y: number, z: number, valid: string[], requiresBelow: boolean, rock: number, holes: number): void {
  const ok = (st: number) => st >= 0 && valid.includes(nameOf(st));
  if (!ok(ctx.get(x, y + 1, z))) return;
  if (requiresBelow && !ok(ctx.get(x, y - 1, z))) return;
  const here = ctx.get(x, y, z);
  if (here < 0 || (!isAir(here) && !ok(here))) return;
  let r = 0, h = 0;
  for (const [dx, dy, dz] of [[-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1], [0, -1, 0]]) {
    const st = ctx.get(x + dx, y + dy, z + dz);
    // (a neighbour in the next chunk isn't generated yet: take the noise terrain's word for it)
    if (st < 0) {
      if (ctx.solidGuess?.(x + dx, y + dy, z + dz)) r++;
      else h++;
      continue;
    }
    if (ok(st)) r++;
    if (isAir(st)) h++;
  }
  if (r === rock && h === holes) {
    ctx.set(x, y, z, nb().LAVA);
    ctx.scheduleFluid(x, y, z);
  }
}

/** vanilla ReplaceBlobsFeature: from the first netherrack at or under the spot, a diamond-ish blob of another stone */
function replaceBlob(ctx: GenContext, r: Rand, x: number, y: number, z: number, state: number): void {
  const K = nb();
  let ty = Math.max(1, Math.min(254, y));
  while (ty > 1 && ctx.get(x, ty, z) !== K.NETHERRACK) ty--;
  if (ctx.get(x, ty, z) !== K.NETHERRACK) return;
  const rx = 3 + r.nextInt(5), ry = 3 + r.nextInt(5), rz = 3 + r.nextInt(5);
  const m = Math.max(rx, ry, rz);
  for (let dx = -rx; dx <= rx; dx++)
    for (let dy = -ry; dy <= ry; dy++)
      for (let dz = -rz; dz <= rz; dz++) {
        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > m) continue;
        ctx.set(x + dx, ty + dy, z + dz, state, W_NETHERRACK);
      }
}

// ---------------------------------------------------------------------------
// vanilla NetherWorldCarver: CaveWorldCarver's worms and rooms, but tall (y scale 5),
// fewer per chunk, and filled with lava up to y 31

const REPLACEABLE = /^(stone|granite|diorite|andesite|tuff|deepslate|netherrack|basalt|blackstone|dirt|grass_block|podzol|coarse_dirt|mycelium|rooted_dirt|moss_block|mud|muddy_mangrove_roots|crimson_nylium|warped_nylium|nether_wart_block|warped_wart_block|soul_sand|soul_soil)$/;

const nextInt = (r: Rand, n: number) => (n <= 0 ? 0 : Math.floor(r.nextFloat() * n));
const nextSeed = (r: Rand) => (r.nextU32() ^ Math.imul(r.nextU32(), 0x9e3779b1)) >>> 0;
type Skip = (rx: number, ry: number, rz: number) => boolean;

class NetherCarving {
  private readonly mask = new Uint8Array(16 * 16 * NOISE_H);
  private readonly rep: Uint8Array;
  private readonly midX: number;
  private readonly midZ: number;

  constructor(private readonly ctx: GenContext) {
    this.midX = ctx.x0 + 8;
    this.midZ = ctx.z0 + 8;
    this.rep = new Uint8Array(BLOCKS.length);
    BLOCKS.forEach((b, i) => (this.rep[i] = REPLACEABLE.test(b.name) ? 1 : 0));
  }

  caves(r: Rand, sx: number, sz: number): void {
    const range = (4 * 2 - 1) * 16;
    const n = nextInt(r, nextInt(r, nextInt(r, 10) + 1) + 1);
    for (let k = 0; k < n; k++) {
      const x = sx * 16 + nextInt(r, 16);
      const y = nextInt(r, 127);
      const z = sz * 16 + nextInt(r, 16);
      // (horizontal and vertical radius multipliers 1, floor level -0.7)
      const skip: Skip = (rx, ry, rz) => ry <= -0.7 || rx * rx + ry * ry + rz * rz >= 1;
      let tunnels = 1;
      if (nextInt(r, 4) === 0) {
        const radius = 1 + r.nextFloat() * 6;
        const d0 = 1.5 + radius;
        this.ellipsoid(x + 1, y, z, d0, d0 * 0.5, skip);
        tunnels += nextInt(r, 4);
      }
      for (let t = 0; t < tunnels; t++) {
        const yaw = r.nextFloat() * Math.PI * 2;
        const pitch = (r.nextFloat() - 0.5) / 4;
        const th = (r.nextFloat() * 2 + r.nextFloat()) * 2;
        const count = range - nextInt(r, range / 4);
        this.tunnel(nextSeed(r), x, y, z, th, yaw, pitch, 0, count, skip);
      }
    }
  }

  private tunnel(seed: number, x: number, y: number, z: number, th: number, yaw: number, pitch: number, start: number, count: number, skip: Skip): void {
    const r = new Rand(seed, 3);
    const branchAt = nextInt(r, count / 2) + Math.floor(count / 4);
    const steep = nextInt(r, 6) === 0;
    let dYaw = 0, dPitch = 0;
    for (let j = start; j < count; j++) {
      const d0 = 1.5 + Math.sin((Math.PI * j) / count) * th;
      const d1 = d0 * 5;
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
        this.tunnel(nextSeed(r), x, y, z, r.nextFloat() * 0.5 + 0.5, yaw - Math.PI / 2, pitch / 3, j, count, skip);
        this.tunnel(nextSeed(r), x, y, z, r.nextFloat() * 0.5 + 0.5, yaw + Math.PI / 2, pitch / 3, j, count, skip);
        return;
      }
      if (nextInt(r, 4) !== 0) {
        const dx = x - this.midX, dz = z - this.midZ, left = count - j, reach = th + 2 + 16;
        if (dx * dx + dz * dz - left * left > reach * reach) return;
        this.ellipsoid(x, y, z, d0, d1, skip);
      }
    }
  }

  private ellipsoid(x: number, y: number, z: number, hr: number, vr: number, skip: Skip): void {
    const ctx = this.ctx;
    const reach = 16 + hr * 2;
    if (Math.abs(x - this.midX) > reach || Math.abs(z - this.midZ) > reach) return;
    const LAVA = nb().LAVA;
    const lx0 = Math.max(Math.floor(x - hr) - ctx.x0 - 1, 0), lx1 = Math.min(Math.floor(x + hr) - ctx.x0, 15);
    const y0 = Math.max(Math.floor(y - vr) - 1, 1), y1 = Math.min(Math.floor(y + vr) + 1, NOISE_H - 1 - 7);
    const lz0 = Math.max(Math.floor(z - hr) - ctx.z0 - 1, 0), lz1 = Math.min(Math.floor(z + hr) - ctx.z0, 15);
    for (let lx = lx0; lx <= lx1; lx++) {
      const dx = (ctx.x0 + lx + 0.5 - x) / hr;
      for (let lz = lz0; lz <= lz1; lz++) {
        const dz = (ctx.z0 + lz + 0.5 - z) / hr;
        if (dx * dx + dz * dz >= 1) continue;
        for (let yy = y1; yy > y0; yy--) {
          const dy = (yy - 0.5 - y) / vr;
          if (skip(dx, dy, dz)) continue;
          const mi = (yy * 16 + lz) * 16 + lx;
          if (this.mask[mi]) continue;
          this.mask[mi] = 1;
          const idx = colIndex(lx, yy, lz);
          if (!this.rep[STATE_BLOCK[ctx.blocks[idx]]]) continue;
          ctx.blocks[idx] = yy <= 31 ? LAVA : 0;
        }
      }
    }
  }
}

export { BIOMES };
