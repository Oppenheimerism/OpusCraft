// Chunk decoration: ores, disks, vegetation, trees, top-layer freezing.

import { Rand, hash2 } from '../../core/rng';
import { S, getBlock, blockOf, FLAGS, F_AIR, F_WATER, F_OPAQUE, F_REPLACEABLE, F_COLLIDE, FACE_OCC } from '../block';
import { GenContext, W_ORE_STONE, W_ORE_DEEP, W_BASE_STONE, W_REPLACEABLE, W_ANY } from './context';
import { placeTree, TreeKind } from './trees';
import { B, BIOMES } from './biomes';
import { MIN_Y, SEA_LEVEL } from '../constants';
import { NormalNoise } from './noise';

// ---------------------------------------------------------------------------
// Ores

interface OreSpec {
  stone: string;
  deep?: string;
  size: number;
  count: number | [number, number];
  rarity?: number; // 1 in N chunks
  height: ['uniform' | 'trapezoid', number, number];
  discard?: number;
  rule?: number; // override target rule (blobs)
  biomes?: number[];
}

const ORES: OreSpec[] = [
  { stone: 'dirt', size: 33, count: 7, height: ['uniform', 0, 160], rule: W_BASE_STONE },
  { stone: 'gravel', size: 33, count: 14, height: ['uniform', -64, 320], rule: W_BASE_STONE },
  { stone: 'granite', size: 64, count: 1, rarity: 6, height: ['uniform', 64, 128], rule: W_ORE_STONE },
  { stone: 'granite', size: 64, count: 2, height: ['uniform', 0, 60], rule: W_ORE_STONE },
  { stone: 'diorite', size: 64, count: 1, rarity: 6, height: ['uniform', 64, 128], rule: W_ORE_STONE },
  { stone: 'diorite', size: 64, count: 2, height: ['uniform', 0, 60], rule: W_ORE_STONE },
  { stone: 'andesite', size: 64, count: 1, rarity: 6, height: ['uniform', 64, 128], rule: W_ORE_STONE },
  { stone: 'andesite', size: 64, count: 2, height: ['uniform', 0, 60], rule: W_ORE_STONE },
  { stone: 'tuff', size: 64, count: 2, height: ['uniform', -64, 0], rule: W_ORE_DEEP },
  { stone: 'coal_ore', deep: 'deepslate_coal_ore', size: 17, count: 30, height: ['uniform', 136, 320] },
  { stone: 'coal_ore', deep: 'deepslate_coal_ore', size: 17, count: 20, height: ['trapezoid', 0, 192], discard: 0.5 },
  { stone: 'iron_ore', deep: 'deepslate_iron_ore', size: 9, count: 90, height: ['trapezoid', 80, 384] },
  { stone: 'iron_ore', deep: 'deepslate_iron_ore', size: 9, count: 10, height: ['trapezoid', -24, 56] },
  { stone: 'iron_ore', deep: 'deepslate_iron_ore', size: 4, count: 10, height: ['uniform', -64, 72] },
  { stone: 'copper_ore', deep: 'deepslate_copper_ore', size: 10, count: 16, height: ['trapezoid', -16, 112] },
  { stone: 'gold_ore', deep: 'deepslate_gold_ore', size: 9, count: 4, height: ['trapezoid', -64, 32], discard: 0.5 },
  { stone: 'gold_ore', deep: 'deepslate_gold_ore', size: 9, count: [0, 1], height: ['uniform', -64, -48], discard: 0.5 },
  { stone: 'redstone_ore', deep: 'deepslate_redstone_ore', size: 8, count: 4, height: ['uniform', -64, 15] },
  { stone: 'redstone_ore', deep: 'deepslate_redstone_ore', size: 8, count: 8, height: ['trapezoid', -96, -32] },
  { stone: 'diamond_ore', deep: 'deepslate_diamond_ore', size: 4, count: 7, height: ['trapezoid', -144, 16], discard: 0.5 },
  { stone: 'diamond_ore', deep: 'deepslate_diamond_ore', size: 12, count: 1, rarity: 9, height: ['trapezoid', -144, 16], discard: 0.7 },
  { stone: 'diamond_ore', deep: 'deepslate_diamond_ore', size: 8, count: 4, height: ['trapezoid', -144, 16], discard: 1 },
  { stone: 'lapis_ore', deep: 'deepslate_lapis_ore', size: 7, count: 2, height: ['trapezoid', -32, 32] },
  { stone: 'lapis_ore', deep: 'deepslate_lapis_ore', size: 7, count: 4, height: ['uniform', -64, 64], discard: 1 },
  { stone: 'emerald_ore', deep: 'deepslate_emerald_ore', size: 3, count: 100, height: ['trapezoid', -16, 480], biomes: [B.windswept_hills, B.windswept_forest, B.windswept_gravelly_hills, B.meadow, B.grove, B.snowy_slopes, B.jagged_peaks, B.frozen_peaks, B.stony_peaks, B.cherry_grove] },
];

function sampleHeight(r: Rand, h: OreSpec['height']): number {
  const [type, lo, hi] = h;
  if (type === 'uniform') return lo + r.nextInt(hi - lo + 1);
  const k = hi - lo;
  const l = Math.floor(k / 2);
  const i1 = k - l;
  return lo + r.nextInt(i1 + 1) + r.nextInt(l + 1);
}

function placeOre(ctx: GenContext, r: Rand, spec: OreSpec, ox: number, oy: number, oz: number): void {
  const stoneState = S(spec.stone);
  const deepState = spec.deep ? S(spec.deep) : stoneState;
  const size = spec.size;
  const f = r.nextFloat() * Math.PI;
  const f1 = size / 8;
  const i = Math.ceil((size / 16 * 2 + 1) / 2);
  const x0 = ox + Math.sin(f) * f1, x1 = ox - Math.sin(f) * f1;
  const z0 = oz + Math.cos(f) * f1, z1 = oz - Math.cos(f) * f1;
  const y0 = oy + r.nextInt(3) - 2, y1 = oy + r.nextInt(3) - 2;
  const minX = ox - Math.ceil(f1) - i, minY = oy - 2 - i, minZ = oz - Math.ceil(f1) - i;
  const sizeXZ = 2 * (Math.ceil(f1) + i), sizeY = 2 * (2 + i);
  const spheres = new Float64Array(size * 4);
  for (let k = 0; k < size; k++) {
    const t = k / size;
    const d3 = (r.nextDouble() * size) / 16;
    const d4 = ((Math.sin(Math.PI * t) + 1) * d3 + 1) / 2;
    spheres[k * 4] = x0 + t * (x1 - x0);
    spheres[k * 4 + 1] = y0 + t * (y1 - y0);
    spheres[k * 4 + 2] = z0 + t * (z1 - z0);
    spheres[k * 4 + 3] = d4;
  }
  for (let a = 0; a < size - 1; a++) {
    if (spheres[a * 4 + 3] <= 0) continue;
    for (let b = a + 1; b < size; b++) {
      if (spheres[b * 4 + 3] <= 0) continue;
      const dx = spheres[a * 4] - spheres[b * 4], dy = spheres[a * 4 + 1] - spheres[b * 4 + 1], dz = spheres[a * 4 + 2] - spheres[b * 4 + 2];
      const dr = spheres[a * 4 + 3] - spheres[b * 4 + 3];
      if (dr * dr > dx * dx + dy * dy + dz * dz) {
        if (dr > 0) spheres[b * 4 + 3] = -1;
        else spheres[a * 4 + 3] = -1;
      }
    }
  }
  const done = new Set<number>();
  const discard = spec.discard ?? 0;
  for (let k = 0; k < size; k++) {
    const rad = spheres[k * 4 + 3];
    if (rad < 0) continue;
    const cx = spheres[k * 4], cy = spheres[k * 4 + 1], cz = spheres[k * 4 + 2];
    const ax0 = Math.max(Math.floor(cx - rad), minX), ay0 = Math.max(Math.floor(cy - rad), minY), az0 = Math.max(Math.floor(cz - rad), minZ);
    const ax1 = Math.max(Math.floor(cx + rad), ax0), ay1 = Math.max(Math.floor(cy + rad), ay0), az1 = Math.max(Math.floor(cz + rad), az0);
    for (let x = ax0; x <= ax1; x++) {
      const dx = (x + 0.5 - cx) / rad;
      if (dx * dx >= 1) continue;
      for (let y = ay0; y <= ay1; y++) {
        const dy = (y + 0.5 - cy) / rad;
        if (dx * dx + dy * dy >= 1) continue;
        if (y < MIN_Y || y >= 320) continue;
        for (let z = az0; z <= az1; z++) {
          const dz = (z + 0.5 - cz) / rad;
          if (dx * dx + dy * dy + dz * dz >= 1) continue;
          const key = (x - minX) + (y - minY) * (sizeXZ + 1) + (z - minZ) * (sizeXZ + 1) * (sizeY + 1);
          if (done.has(key)) continue;
          done.add(key);
          if (discard > 0 && r.next() < discard) {
            // vanilla: skip if adjacent to air
            if (adjacentAir(ctx, x, y, z)) continue;
          }
          if (spec.rule !== undefined) {
            ctx.set(x, y, z, stoneState, spec.rule);
          } else {
            if (!ctx.set(x, y, z, stoneState, W_ORE_STONE)) ctx.set(x, y, z, deepState, W_ORE_DEEP);
          }
        }
      }
    }
  }
}

function adjacentAir(ctx: GenContext, x: number, y: number, z: number): boolean {
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const s = ctx.get(x + dx, y + dy, z + dz);
    if (s >= 0 && (FLAGS[s] & F_AIR)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Biome decoration tables

interface Deco {
  trees?: { count: number; extra?: number; kinds: [TreeKind, number][]; grid?: boolean };
  grass?: number;
  grassNoise?: [number, number];
  tallGrass?: number;
  tallGrassNoise?: [number, number];
  fern?: number;
  flowers?: { patches: number; rarity?: number; kinds: string[] };
  tallFlowers?: { patches: number; kinds: string[] };
  deadBush?: number;
  cactus?: number;
  sugarCane?: number;
  pumpkin?: number;
  melon?: number;
  berries?: number;
  lily?: number;
  seagrass?: number;
  kelp?: number;
  mushrooms?: number;
  sunflowers?: number;
  disks?: boolean;
}

const OAK_FOREST: [TreeKind, number][] = [['birch', 0.2], ['fancy_oak', 0.1], ['oak', 0.7]];
const DEFAULT_FLOWERS = ['dandelion', 'poppy'];
const PLAINS_FLOWERS = ['dandelion', 'poppy', 'azure_bluet', 'oxeye_daisy', 'cornflower', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip'];

const DECO: Partial<Record<number, Deco>> = {
  [B.plains]: { trees: { count: 0, extra: 0.05, kinds: [['oak', 0.8], ['fancy_oak', 0.2]] }, grassNoise: [5, 10], tallGrassNoise: [0, 7], flowers: { patches: 1, rarity: 2, kinds: PLAINS_FLOWERS }, pumpkin: 300, sugarCane: 5 },
  [B.sunflower_plains]: { trees: { count: 0, extra: 0.05, kinds: [['oak', 0.8], ['fancy_oak', 0.2]] }, grassNoise: [5, 10], tallGrassNoise: [0, 7], flowers: { patches: 1, rarity: 2, kinds: PLAINS_FLOWERS }, sunflowers: 10, sugarCane: 5 },
  [B.forest]: { trees: { count: 10, extra: 0.1, kinds: OAK_FOREST }, grass: 2, flowers: { patches: 1, rarity: 3, kinds: DEFAULT_FLOWERS }, tallFlowers: { patches: 1, kinds: ['lilac', 'rose_bush', 'peony'] }, mushrooms: 1, sugarCane: 5 },
  [B.flower_forest]: { trees: { count: 6, extra: 0.1, kinds: OAK_FOREST }, grass: 2, flowers: { patches: 4, kinds: ['dandelion', 'poppy', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley'] }, tallFlowers: { patches: 2, kinds: ['lilac', 'rose_bush', 'peony'] } },
  [B.birch_forest]: { trees: { count: 10, extra: 0.1, kinds: [['birch', 1]] }, grass: 2, flowers: { patches: 1, rarity: 3, kinds: DEFAULT_FLOWERS }, tallFlowers: { patches: 1, kinds: ['lilac', 'rose_bush', 'peony'] } },
  [B.old_growth_birch_forest]: { trees: { count: 10, extra: 0.1, kinds: [['tall_birch', 1]] }, grass: 2, flowers: { patches: 1, rarity: 3, kinds: DEFAULT_FLOWERS } },
  [B.dark_forest]: { trees: { count: 16, kinds: [['dark_oak', 0.667], ['birch', 0.2], ['fancy_oak', 0.1], ['oak', 0.033]], grid: true }, grass: 2, mushrooms: 2, tallFlowers: { patches: 1, kinds: ['lilac', 'rose_bush', 'peony'] } },
  [B.taiga]: { trees: { count: 10, extra: 0.1, kinds: [['pine', 0.33], ['spruce', 0.67]] }, grass: 1, fern: 0.8, berries: 32, mushrooms: 1, tallGrass: 1 },
  [B.snowy_taiga]: { trees: { count: 10, extra: 0.1, kinds: [['pine', 0.33], ['spruce', 0.67]] }, grass: 1, fern: 0.8, berries: 32 },
  [B.old_growth_pine_taiga]: { trees: { count: 10, extra: 0.1, kinds: [['mega_pine', 0.3], ['mega_spruce', 0.08], ['pine', 0.2], ['spruce', 0.42]] }, grass: 3, fern: 0.8, mushrooms: 3, berries: 32 },
  [B.old_growth_spruce_taiga]: { trees: { count: 10, extra: 0.1, kinds: [['mega_spruce', 0.33], ['pine', 0.33], ['spruce', 0.34]] }, grass: 3, fern: 0.8, mushrooms: 3, berries: 32 },
  [B.jungle]: { trees: { count: 50, extra: 0.1, kinds: [['fancy_oak', 0.1], ['jungle_bush', 0.5], ['mega_jungle', 0.033], ['jungle', 0.367]] }, grass: 25, fern: 0.25, melon: 3, flowers: { patches: 1, rarity: 4, kinds: DEFAULT_FLOWERS } },
  [B.sparse_jungle]: { trees: { count: 2, extra: 0.1, kinds: [['fancy_oak', 0.1], ['jungle_bush', 0.5], ['jungle', 0.4]] }, grass: 25, fern: 0.25, melon: 3 },
  [B.bamboo_jungle]: { trees: { count: 30, extra: 0.1, kinds: [['fancy_oak', 0.05], ['jungle_bush', 0.15], ['mega_jungle', 0.1], ['jungle', 0.7]] }, grass: 25, fern: 0.25, melon: 3 },
  [B.savanna]: { trees: { count: 1, extra: 0.1, kinds: [['acacia', 0.8], ['oak', 0.2]] }, grass: 20, tallGrass: 7, flowers: { patches: 1, rarity: 3, kinds: DEFAULT_FLOWERS } },
  [B.savanna_plateau]: { trees: { count: 1, extra: 0.1, kinds: [['acacia', 0.8], ['oak', 0.2]] }, grass: 20, tallGrass: 7 },
  [B.windswept_savanna]: { trees: { count: 2, extra: 0.1, kinds: [['acacia', 0.8], ['oak', 0.2]] }, grass: 5 },
  [B.windswept_hills]: { trees: { count: 0, extra: 0.1, kinds: [['spruce', 0.666], ['fancy_oak', 0.1], ['oak', 0.234]] }, grass: 2, flowers: { patches: 1, rarity: 4, kinds: DEFAULT_FLOWERS } },
  [B.windswept_gravelly_hills]: { trees: { count: 0, extra: 0.1, kinds: [['spruce', 0.666], ['fancy_oak', 0.1], ['oak', 0.234]] }, grass: 2 },
  [B.windswept_forest]: { trees: { count: 3, extra: 0.1, kinds: [['spruce', 0.666], ['fancy_oak', 0.1], ['oak', 0.234]] }, grass: 2 },
  [B.meadow]: { trees: { count: 0, extra: 0.01, kinds: [['fancy_oak', 0.6], ['tall_birch', 0.4]] }, grass: 6, tallGrass: 5, flowers: { patches: 5, kinds: ['allium', 'poppy', 'azure_bluet', 'dandelion', 'cornflower', 'oxeye_daisy'] } },
  [B.cherry_grove]: { trees: { count: 10, extra: 0.1, kinds: [['cherry', 1]] }, grass: 4, flowers: { patches: 1, rarity: 2, kinds: ['pink_tulip', 'allium'] } },
  [B.grove]: { trees: { count: 10, extra: 0.1, kinds: [['pine', 0.33], ['spruce', 0.67]] } },
  [B.snowy_plains]: { trees: { count: 0, extra: 0.1, kinds: [['spruce', 1]] }, grass: 1 },
  [B.ice_spikes]: {},
  [B.swamp]: { trees: { count: 2, extra: 0.1, kinds: [['swamp_oak', 1]] }, grass: 5, flowers: { patches: 1, kinds: ['blue_orchid'] }, lily: 4, seagrass: 64, sugarCane: 10, mushrooms: 4 },
  [B.mangrove_swamp]: { trees: { count: 10, extra: 0.1, kinds: [['swamp_oak', 1]] }, grass: 2, lily: 2, seagrass: 64 },
  [B.desert]: { deadBush: 2, cactus: 10, sugarCane: 10 },
  [B.badlands]: { deadBush: 20, cactus: 5, sugarCane: 13 },
  [B.eroded_badlands]: { deadBush: 20, cactus: 5, sugarCane: 13 },
  [B.wooded_badlands]: { trees: { count: 5, extra: 0.1, kinds: [['oak', 1]] }, deadBush: 20, grass: 2 },
  [B.mushroom_fields]: { mushrooms: 6 },
  [B.river]: { seagrass: 48, sugarCane: 5, disks: true },
  [B.frozen_river]: { disks: true },
  [B.beach]: {},
  [B.ocean]: { seagrass: 48, kelp: 60, disks: true },
  [B.deep_ocean]: { seagrass: 48, kelp: 60, disks: true },
  [B.cold_ocean]: { seagrass: 32, kelp: 60, disks: true },
  [B.deep_cold_ocean]: { seagrass: 32, kelp: 60, disks: true },
  [B.lukewarm_ocean]: { seagrass: 80, kelp: 20, disks: true },
  [B.deep_lukewarm_ocean]: { seagrass: 80, kelp: 20, disks: true },
  [B.warm_ocean]: { seagrass: 80, disks: true },
  [B.frozen_ocean]: { disks: true },
  [B.deep_frozen_ocean]: { disks: true },
  [B.stony_peaks]: {},
  [B.stony_shore]: {},
};

// ---------------------------------------------------------------------------

function isGroundForPlant(s: number): boolean {
  if (s < 0) return false;
  const n = blockOf(s).name;
  return n === 'grass_block' || n === 'dirt' || n === 'coarse_dirt' || n === 'podzol' || n === 'rooted_dirt' || n === 'moss_block' || n === 'mycelium';
}

function isAirOrReplaceable(s: number): boolean {
  if (s < 0) return false;
  const f = FLAGS[s];
  return (f & F_AIR) !== 0;
}

export class Decorator {
  private patchNoise: NormalNoise;

  constructor(readonly seed: number, patchNoise: NormalNoise, private readonly tempNoise: NormalNoise) {
    this.patchNoise = patchNoise;
  }

  decorate(ctx: GenContext): void {
    const r = new Rand(hash2(ctx.cx, ctx.cz, this.seed ^ 0x5eed), 1);
    ctx.computeHeightmaps();
    // --- lakes (vanilla LAKES step)
    this.lavaLakes(ctx, new Rand(hash2(ctx.cx, ctx.cz, this.seed ^ 0x1a4e), 2));
    // biome of the chunk center decides most decoration (vanilla decorates per biome present;
    // we use a few sample columns so borders mix naturally)
    // --- ores
    const centerBiome = ctx.biomes[8 * 16 + 8];
    for (const spec of ORES) {
      if (spec.biomes && !spec.biomes.includes(centerBiome)) continue;
      if (spec.rarity && r.nextInt(spec.rarity) !== 0) continue;
      const count = Array.isArray(spec.count) ? spec.count[0] + r.nextInt(spec.count[1] - spec.count[0] + 1) : spec.count;
      for (let i = 0; i < count; i++) {
        const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16);
        const y = sampleHeight(r, spec.height);
        if (y < MIN_Y || y >= 320) continue;
        placeOre(ctx, r, spec, x, y, z);
      }
    }
    // --- disks (sand/clay/gravel under water)
    if (DECO[centerBiome]?.disks || centerBiome === B.swamp || centerBiome === B.beach || centerBiome === B.plains || centerBiome === B.forest) {
      this.disks(ctx, r);
    }
    // --- springs (vanilla FLUID_SPRINGS step)
    this.springs(ctx, new Rand(hash2(ctx.cx, ctx.cz, this.seed ^ 0x5b41), 3));
    ctx.computeHeightmaps();
    // --- vegetation: pick sample biomes per quadrant so mixed chunks decorate with each biome
    for (let q = 0; q < 4; q++) {
      const qx = (q & 1) * 8, qz = (q >> 1) * 8;
      const biome = ctx.biomes[(qz + 4) * 16 + qx + 4];
      const deco = DECO[biome];
      if (!deco) continue;
      this.vegetation(ctx, r, deco, biome, qx, qz);
    }
    ctx.computeHeightmaps();
    this.freeze(ctx);
  }

  /**
   * vanilla LakeFeature for lake_lava_underground (1 in 9 chunks, anywhere from
   * y 0 up, sitting on whatever is below, at least 5 under the surface) and
   * lake_lava_surface (1 in 200). The 16x8x16 box is kept inside this chunk.
   */
  private lavaLakes(ctx: GenContext, r: Rand): void {
    const tryLake = (surface: boolean) => {
      const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16);
      let y: number;
      if (surface) y = ctx.heightSurface(x, z);
      else {
        y = r.nextInt(Math.max(1, ctx.heightSurface(x, z)) + 1);
        // vanilla EnvironmentScanPlacement: down to something that isn't air (max 32)
        let n = 0;
        while (n < 32 && y > MIN_Y + 5 && ctx.getOrAir(x, y, z) === 0) {
          y--;
          n++;
        }
        if (ctx.getOrAir(x, y, z) === 0) return;
        if (y > ctx.heightOceanFloor(x, z) - 5) return;
      }
      this.lake(ctx, r, ctx.x0, y - 4, ctx.z0, S('lava'), S('stone'));
    };
    if (r.nextInt(9) === 0) tryLake(false);
    if (r.nextInt(200) === 0) tryLake(true);
  }

  private lake(ctx: GenContext, r: Rand, ox: number, oy: number, oz: number, fluid: number, barrier: number): void {
    if (oy <= MIN_Y + 4) return;
    const shape = new Uint8Array(2048);
    const n = r.nextInt(4) + 4;
    for (let j = 0; j < n; j++) {
      const d0 = r.nextDouble() * 6 + 3, d1 = r.nextDouble() * 4 + 2, d2 = r.nextDouble() * 6 + 3;
      const d3 = r.nextDouble() * (16 - d0 - 2) + 1 + d0 / 2;
      const d4 = r.nextDouble() * (8 - d1 - 4) + 2 + d1 / 2;
      const d5 = r.nextDouble() * (16 - d2 - 2) + 1 + d2 / 2;
      for (let l = 1; l < 15; l++)
        for (let i1 = 1; i1 < 15; i1++)
          for (let j1 = 1; j1 < 7; j1++) {
            const d6 = (l - d3) / (d0 / 2), d7 = (j1 - d4) / (d1 / 2), d8 = (i1 - d5) / (d2 / 2);
            if (d6 * d6 + d7 * d7 + d8 * d8 < 1) shape[(l * 16 + i1) * 8 + j1] = 1;
          }
    }
    const at = (a: number, b: number, c: number) => shape[(a * 16 + b) * 8 + c] === 1;
    const edge = (a: number, b: number, c: number) =>
      !at(a, b, c) && ((a < 15 && at(a + 1, b, c)) || (a > 0 && at(a - 1, b, c)) || (b < 15 && at(a, b + 1, c)) || (b > 0 && at(a, b - 1, c)) || (c < 7 && at(a, b, c + 1)) || (c > 0 && at(a, b, c - 1)));
    const isFluid = (st: number) => (FLAGS[st] & F_WATER) !== 0 || blockOf(st).name === 'lava';
    const solid = (st: number) => (FLAGS[st] & F_COLLIDE) !== 0 && !isFluid(st);
    // vanilla: the rim must be solid below the surface line and dry above it
    for (let a = 0; a < 16; a++)
      for (let b = 0; b < 16; b++)
        for (let c = 0; c < 8; c++) {
          if (!edge(a, b, c)) continue;
          const st = ctx.getOrAir(ox + a, oy + c, oz + b);
          if (c >= 4 && isFluid(st)) return;
          if (c < 4 && !solid(st) && st !== fluid) return;
        }
    for (let a = 0; a < 16; a++)
      for (let b = 0; b < 16; b++)
        for (let c = 0; c < 8; c++) {
          if (!at(a, b, c)) continue;
          const x = ox + a, y = oy + c, z = oz + b;
          if (blockOf(ctx.getOrAir(x, y, z)).name === 'bedrock') continue;
          ctx.set(x, y, z, c >= 4 ? 0 : fluid);
          if (c < 4) ctx.scheduleFluid(x, y, z);
        }
    // stone rim so the lava doesn't leak into caves (vanilla barrier)
    for (let a = 0; a < 16; a++)
      for (let b = 0; b < 16; b++)
        for (let c = 0; c < 8; c++) {
          if (!edge(a, b, c) || !(c < 4 || r.nextInt(2) !== 0)) continue;
          const x = ox + a, y = oy + c, z = oz + b;
          const st = ctx.getOrAir(x, y, z);
          const n2 = blockOf(st).name;
          if (solid(st) && n2 !== 'bedrock' && !n2.endsWith('_ore') && n2 !== 'chest' && n2 !== 'spawner') ctx.set(x, y, z, barrier);
        }
  }

  /**
   * vanilla SpringFeature: a fluid source set into a wall with exactly one
   * opening, so it pours out (spring_water: 25 tries up to y 192; spring_lava:
   * 20 tries biased to the bottom of the world).
   */
  private springs(ctx: GenContext, r: Rand): void {
    const WATER_OK = /^(stone|granite|diorite|andesite|deepslate|tuff|calcite|dirt|snow_block|powder_snow|packed_ice)$/;
    const LAVA_OK = /^(stone|granite|diorite|andesite|deepslate|tuff|calcite)$/;
    const place = (x: number, y: number, z: number, state: number, ok: RegExp) => {
      const valid = (st: number) => st >= 0 && ok.test(blockOf(st).name);
      if (!valid(ctx.get(x, y + 1, z)) || !valid(ctx.get(x, y - 1, z))) return;
      const here = ctx.get(x, y, z);
      if (here < 0 || (here !== 0 && !valid(here))) return;
      let rock = 0, hole = 0;
      for (const [dx, dy, dz] of [[-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1], [0, -1, 0]]) {
        const st = ctx.get(x + dx, y + dy, z + dz);
        if (valid(st)) rock++;
        if (st === 0) hole++;
      }
      if (rock === 4 && hole === 1) {
        ctx.set(x, y, z, state);
        ctx.scheduleFluid(x, y, z);
      }
    };
    const WATER = S('water'), LAVA = S('lava');
    for (let i = 0; i < 25; i++) {
      const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16);
      const y = MIN_Y + r.nextInt(192 - MIN_Y + 1);
      place(x, y, z, WATER, WATER_OK);
    }
    for (let i = 0; i < 20; i++) {
      const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16);
      // vanilla VeryBiasedToBottomHeight(bottom, top - 8, inner 8)
      const lo = MIN_Y, hi = 320 - 8, inner = 8;
      const k = lo + inner + r.nextInt(hi - (lo + inner) + 1);
      const l = lo + r.nextInt(Math.max(1, k - 1 - lo + 1));
      const y = lo + r.nextInt(Math.max(1, l - 1 + inner - lo + 1));
      place(x, y, z, LAVA, LAVA_OK);
    }
  }

  private rndIn(r: Rand, ctx: GenContext, qx: number, qz: number): [number, number] {
    return [ctx.x0 + qx + r.nextInt(8), ctx.z0 + qz + r.nextInt(8)];
  }

  private vegetation(ctx: GenContext, r: Rand, d: Deco, biome: number, qx: number, qz: number): void {
    // quarter of the chunk → quarter counts (probabilistic rounding)
    const quarter = (n: number) => {
      const v = n / 4;
      return Math.floor(v) + (r.next() < v - Math.floor(v) ? 1 : 0);
    };
    // trees
    if (d.trees) {
      let n = quarter(d.trees.count);
      if (d.trees.extra && r.next() < d.trees.extra / 4 * 4 / 4) n += r.next() < 0.25 ? 1 : 0;
      if (d.trees.extra && d.trees.count === 0 && r.next() < d.trees.extra) n = Math.max(n, r.next() < 0.25 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        let x: number, z: number;
        if (d.trees.grid) {
          const gi = i % 4;
          x = ctx.x0 + qx + (gi & 1) * 4 + r.nextInt(3);
          z = ctx.z0 + qz + (gi >> 1) * 4 + r.nextInt(3);
        } else [x, z] = this.rndIn(r, ctx, qx, qz);
        const y = ctx.heightOceanFloor(x, z);
        if (ctx.heightMotion(x, z) !== y) continue; // underwater
        const kind = pickWeighted(r, d.trees.kinds);
        placeTree(ctx, kind, x, y, z, r);
      }
    }
    // grass
    let grassPatches = d.grass ? quarter(d.grass) : 0;
    if (d.grassNoise) {
      const [lo, hi] = d.grassNoise;
      const nv = this.patchNoise.getValue((ctx.x0 + qx) / 200, 0, (ctx.z0 + qz) / 200);
      grassPatches += quarter(nv < -0.8 ? lo : hi);
    }
    const grass = S('short_grass'), fern = S('fern');
    for (let i = 0; i < grassPatches; i++) {
      const [x, z] = this.rndIn(r, ctx, qx, qz);
      this.patch(ctx, r, x, ctx.heightSurface(x, z), z, 32, 7, 3, () => (d.fern && r.next() < d.fern ? fern : grass), isGroundForPlant);
    }
    // tall grass
    let tallPatches = d.tallGrass ? quarter(d.tallGrass) : 0;
    if (d.tallGrassNoise) {
      const nv = this.patchNoise.getValue((ctx.x0 + qx) / 200, 0, (ctx.z0 + qz) / 200);
      tallPatches += quarter(nv < -0.8 ? d.tallGrassNoise[0] : d.tallGrassNoise[1]);
    }
    for (let i = 0; i < tallPatches; i++) {
      const [x, z] = this.rndIn(r, ctx, qx, qz);
      const tall = d.fern ? 'large_fern' : 'tall_grass';
      this.doublePatch(ctx, r, x, ctx.heightSurface(x, z), z, 16, tall);
    }
    // flowers
    if (d.flowers && (!d.flowers.rarity || r.nextInt(d.flowers.rarity * 4) < 4)) {
      const n = Math.max(1, quarter(d.flowers.patches));
      for (let i = 0; i < n; i++) {
        const [x, z] = this.rndIn(r, ctx, qx, qz);
        const kinds = d.flowers.kinds;
        // vanilla flower patches mostly use one flower type per patch (noise-selected)
        const main = kinds[Math.floor(Math.abs(this.patchNoise.getValue(x / 48, 0, z / 48)) * kinds.length * 3) % kinds.length];
        this.patch(ctx, r, x, ctx.heightSurface(x, z), z, 48, 6, 2, () => (r.next() < 0.8 ? S(main) : S(kinds[r.nextInt(kinds.length)])), isGroundForPlant);
      }
    }
    if (d.tallFlowers && r.nextInt(8) === 0) {
      const [x, z] = this.rndIn(r, ctx, qx, qz);
      this.doublePatch(ctx, r, x, ctx.heightSurface(x, z), z, 32, d.tallFlowers.kinds[r.nextInt(d.tallFlowers.kinds.length)]);
    }
    if (d.sunflowers) {
      for (let i = 0; i < quarter(d.sunflowers) && r.nextInt(3) === 0; i++) {
        const [x, z] = this.rndIn(r, ctx, qx, qz);
        this.doublePatch(ctx, r, x, ctx.heightSurface(x, z), z, 24, 'sunflower');
      }
    }
    if (d.deadBush) {
      const n = quarter(d.deadBush);
      for (let i = 0; i < n; i++) {
        const [x, z] = this.rndIn(r, ctx, qx, qz);
        this.patch(ctx, r, x, ctx.heightSurface(x, z), z, 4, 7, 3, () => S('dead_bush'), (s) => {
          if (s < 0) return false;
          const nm = blockOf(s).name;
          return nm === 'sand' || nm === 'red_sand' || nm.endsWith('terracotta') || nm === 'dirt' || nm === 'coarse_dirt';
        });
      }
    }
    if (d.cactus && r.nextInt(6) === 0) {
      const [x, z] = this.rndIn(r, ctx, qx, qz);
      this.cactusPatch(ctx, r, x, ctx.heightSurface(x, z), z);
    }
    if (d.sugarCane && r.nextInt(6) === 0) {
      const [x, z] = this.rndIn(r, ctx, qx, qz);
      this.sugarCane(ctx, r, x, ctx.heightSurface(x, z), z);
    }
    if (d.pumpkin && r.nextInt(Math.max(1, d.pumpkin / 4)) === 0) {
      const [x, z] = this.rndIn(r, ctx, qx, qz);
      this.patch(ctx, r, x, ctx.heightSurface(x, z), z, 16, 4, 1, () => S('pumpkin'), (s) => s >= 0 && blockOf(s).name === 'grass_block');
    }
    if (d.melon && r.nextInt(4) === 0) {
      const [x, z] = this.rndIn(r, ctx, qx, qz);
      this.patch(ctx, r, x, ctx.heightSurface(x, z), z, 16, 4, 1, () => S('melon'), (s) => s >= 0 && blockOf(s).name === 'grass_block');
    }
    if (d.berries && r.nextInt(Math.max(1, d.berries / 4)) === 0) {
      const [x, z] = this.rndIn(r, ctx, qx, qz);
      this.patch(ctx, r, x, ctx.heightSurface(x, z), z, 16, 4, 1, () => getBlock('sweet_berry_bush').state({ age: 3 }), (s) => s >= 0 && blockOf(s).name === 'grass_block');
    }
    if (d.mushrooms && r.nextInt(4) < d.mushrooms) {
      const [x, z] = this.rndIn(r, ctx, qx, qz);
      const kind = r.nextBool() ? 'brown_mushroom' : 'red_mushroom';
      if (r.nextInt(biome === B.mushroom_fields ? 1 : 3) === 0) this.patch(ctx, r, x, ctx.heightSurface(x, z), z, 16, 7, 3, () => S(kind), isGroundForPlant);
    }
    if (d.lily) {
      for (let i = 0; i < quarter(d.lily); i++) {
        const [x, z] = this.rndIn(r, ctx, qx, qz);
        const y = ctx.heightMotion(x, z);
        this.patch(ctx, r, x, y, z, 10, 7, 3, () => S('lily_pad'), (s) => s >= 0 && blockOf(s).name === 'water' && blockOf(s).get(s, 'level') === 0);
      }
    }
    if (d.seagrass) {
      const n = quarter(d.seagrass);
      for (let i = 0; i < n; i++) {
        const [x, z] = this.rndIn(r, ctx, qx, qz);
        const y = ctx.heightOceanFloor(x, z);
        const above = ctx.get(x, y, z);
        if (above < 0 || blockOf(above).name !== 'water') continue;
        const below = ctx.get(x, y - 1, z);
        if (below < 0 || !(FLAGS[below] & F_OPAQUE)) continue;
        const tall = r.next() < 0.3 && ctx.get(x, y + 1, z) >= 0 && blockOf(ctx.getOrAir(x, y + 1, z)).name === 'water';
        if (tall) {
          ctx.set(x, y, z, getBlock('tall_seagrass').state({ half: 'lower' }));
          ctx.set(x, y + 1, z, getBlock('tall_seagrass').state({ half: 'upper' }));
        } else ctx.set(x, y, z, S('seagrass'));
      }
    }
    if (d.kelp) {
      const n = quarter(d.kelp) >> 1;
      for (let i = 0; i < n; i++) {
        const [x, z] = this.rndIn(r, ctx, qx, qz);
        const y = ctx.heightOceanFloor(x, z);
        if (this.patchNoise.getValue(x / 80, 1, z / 80) < 0) continue;
        const below = ctx.get(x, y - 1, z);
        if (below < 0 || !(FLAGS[below] & F_OPAQUE)) continue;
        const h = 1 + r.nextInt(10);
        for (let k = 0; k < h; k++) {
          const s = ctx.get(x, y + k, z);
          const s2 = ctx.get(x, y + k + 1, z);
          if (s < 0 || blockOf(s).name !== 'water' || blockOf(s).get(s, 'level') !== 0) break;
          const top = k === h - 1 || s2 < 0 || blockOf(s2).name !== 'water';
          ctx.set(x, y + k, z, top ? getBlock('kelp').state({ age: 20 + r.nextInt(4) }) : S('kelp_plant'));
          if (top) break;
        }
      }
    }
  }

  private patch(ctx: GenContext, r: Rand, ox: number, oy: number, oz: number, tries: number, xz: number, ys: number, state: () => number, ground: (s: number) => boolean): void {
    for (let i = 0; i < tries; i++) {
      const x = ox + r.nextInt(xz + 1) - r.nextInt(xz + 1);
      const y = oy + r.nextInt(ys + 1) - r.nextInt(ys + 1);
      const z = oz + r.nextInt(xz + 1) - r.nextInt(xz + 1);
      if (!ctx.inChunk(x, z)) continue;
      const at = ctx.get(x, y, z);
      if (!isAirOrReplaceable(at)) continue;
      if (!ground(ctx.get(x, y - 1, z))) continue;
      ctx.set(x, y, z, state(), W_REPLACEABLE);
    }
  }

  private doublePatch(ctx: GenContext, r: Rand, ox: number, oy: number, oz: number, tries: number, name: string): void {
    const b = getBlock(name);
    const lower = b.state({ half: 'lower' }), upper = b.state({ half: 'upper' });
    for (let i = 0; i < tries; i++) {
      const x = ox + r.nextInt(8) - r.nextInt(8);
      const y = oy + r.nextInt(4) - r.nextInt(4);
      const z = oz + r.nextInt(8) - r.nextInt(8);
      if (!ctx.inChunk(x, z)) continue;
      if (!isAirOrReplaceable(ctx.get(x, y, z)) || !isAirOrReplaceable(ctx.get(x, y + 1, z))) continue;
      if (!isGroundForPlant(ctx.get(x, y - 1, z))) continue;
      ctx.set(x, y, z, lower);
      ctx.set(x, y + 1, z, upper);
    }
  }

  private cactusPatch(ctx: GenContext, r: Rand, ox: number, oy: number, oz: number): void {
    const cactus = S('cactus');
    for (let i = 0; i < 10; i++) {
      const x = ox + r.nextInt(8) - r.nextInt(8);
      const y = oy + r.nextInt(4) - r.nextInt(4);
      const z = oz + r.nextInt(8) - r.nextInt(8);
      if (!ctx.inChunk(x, z)) continue;
      const g = ctx.get(x, y - 1, z);
      if (g < 0 || (blockOf(g).name !== 'sand' && blockOf(g).name !== 'red_sand')) continue;
      const h = 1 + r.nextInt(r.nextInt(3) + 1);
      for (let k = 0; k < h; k++) {
        if (ctx.get(x, y + k, z) !== 0) break;
        let ok = true;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const s = ctx.get(x + dx, y + k, z + dz);
          if (s > 0 && FLAGS[s] & F_COLLIDE) ok = false;
        }
        if (!ok) break;
        ctx.set(x, y + k, z, cactus);
      }
    }
  }

  private sugarCane(ctx: GenContext, r: Rand, ox: number, oy: number, oz: number): void {
    const cane = S('sugar_cane');
    for (let i = 0; i < 20; i++) {
      const x = ox + r.nextInt(5) - r.nextInt(5);
      const y = oy;
      const z = oz + r.nextInt(5) - r.nextInt(5);
      if (!ctx.inChunk(x, z)) continue;
      if (ctx.get(x, y, z) !== 0) continue;
      const g = ctx.get(x, y - 1, z);
      if (g < 0) continue;
      const gn = blockOf(g).name;
      if (gn !== 'grass_block' && gn !== 'dirt' && gn !== 'sand' && gn !== 'red_sand' && gn !== 'podzol' && gn !== 'coarse_dirt') continue;
      let water = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const s = ctx.get(x + dx, y - 1, z + dz);
        if (s >= 0 && (FLAGS[s] & F_WATER)) water = true;
      }
      if (!water) continue;
      const h = 2 + r.nextInt(r.nextInt(3) + 1);
      for (let k = 0; k < h; k++) {
        if (ctx.get(x, y + k, z) !== 0) break;
        ctx.set(x, y + k, z, cane);
      }
    }
  }

  private disks(ctx: GenContext, r: Rand): void {
    const kinds: [string, number, number, string[]][] = [
      ['sand', 3, 6, ['dirt', 'grass_block']],
      ['clay', 1, 3, ['dirt', 'clay']],
      ['gravel', 1, 5, ['dirt', 'grass_block']],
    ];
    for (const [name, count, maxR, targets] of kinds) {
      for (let c = 0; c < count; c++) {
        const x = ctx.x0 + r.nextInt(16), z = ctx.z0 + r.nextInt(16);
        const y = ctx.heightOceanFloor(x, z) - 1;
        const s = ctx.get(x, y + 1, z);
        if (s < 0 || !(FLAGS[s] & F_WATER)) continue;
        const rad = 2 + r.nextInt(maxR - 1);
        const state = S(name);
        for (let dx = -rad; dx <= rad; dx++)
          for (let dz = -rad; dz <= rad; dz++) {
            if (dx * dx + dz * dz > rad * rad) continue;
            for (let dy = -2; dy <= 2; dy++) {
              const t = ctx.get(x + dx, y + dy, z + dz);
              if (t < 0) continue;
              if (targets.includes(blockOf(t).name)) ctx.set(x + dx, y + dy, z + dz, state);
            }
          }
      }
    }
  }

  /** vanilla freeze_top_layer: snow layers and ice where cold. */
  private freeze(ctx: GenContext): void {
    const snow = S('snow'), ice = S('ice');
    const grass = getBlock('grass_block'), podzol = getBlock('podzol'), myc = getBlock('mycelium');
    for (let lz = 0; lz < 16; lz++)
      for (let lx = 0; lx < 16; lx++) {
        const x = ctx.x0 + lx, z = ctx.z0 + lz;
        const y = ctx.heightMotion(x, z); // first free block above
        const biome = BIOMES[ctx.biomes[(lz << 4) | lx]];
        const temp = this.heightTemp(biome.temperature, x, y - 1, z, !!biome.frozen);
        if (temp >= 0.15) continue;
        const below = ctx.get(x, y - 1, z);
        if (below >= 0 && blockOf(below).name === 'water' && blockOf(below).get(below, 'level') === 0 && y - 1 >= SEA_LEVEL - 1) {
          ctx.set(x, y - 1, z, ice);
          continue;
        }
        const at = ctx.get(x, y, z);
        if (at !== 0) {
          // plants: place snow above? vanilla replaces nothing; skip
          continue;
        }
        if (below < 0 || !biome.precipitation) continue;
        const f = FLAGS[below];
        if (!(FACE_OCC[below] & 2) && !(f & (F_REPLACEABLE))) {
          if (!(f & F_OPAQUE)) continue;
        }
        const bn = blockOf(below).name;
        if (bn === 'ice' || bn === 'packed_ice' || bn === 'water') continue;
        ctx.set(x, y, z, snow);
        if (bn === 'grass_block') ctx.set(x, y - 1, z, grass.state({ snowy: true }));
        else if (bn === 'podzol') ctx.set(x, y - 1, z, podzol.state({ snowy: true }));
        else if (bn === 'mycelium') ctx.set(x, y - 1, z, myc.state({ snowy: true }));
      }
  }

  heightTemp(base: number, x: number, y: number, z: number, frozen: boolean): number {
    let t = base;
    if (frozen) {
      const d = this.tempNoise.getValue(x * 0.05, 0, z * 0.05) * 7;
      if (d + (this.tempNoise.getValue(x * 0.2, 0, z * 0.2)) < 0.3) {
        const d2 = this.tempNoise.getValue(x * 0.09, 0, z * 0.09);
        if (d2 < 0.8) t = 0.2;
      }
    }
    if (y > 80) {
      const f1 = this.tempNoise.getValue(x / 8, 0, z / 8) * 8;
      return t - ((f1 + y - 80) * 0.05) / 40;
    }
    return t;
  }
}

function pickWeighted<T>(r: Rand, items: [T, number][]): T {
  let total = 0;
  for (const [, w] of items) total += w;
  let v = r.next() * total;
  for (const [it, w] of items) {
    v -= w;
    if (v <= 0) return it;
  }
  return items[items.length - 1][0];
}

export { W_ANY };
