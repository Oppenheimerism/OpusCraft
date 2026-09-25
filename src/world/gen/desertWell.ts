// Desert wells (vanilla DesertWellFeature, the desert's placed feature desert_well): in about one desert chunk in a
// thousand, a little sandstone well sunk into the sand, four pillars holding up a slab roof over a cross of water on
// a cross of sand, a low wall round it with a slab in the middle of each side. Two of the blocks under the water are
// suspicious sand (archaeology/desert_well), brushed out as the desert pyramid's are.
// A well reaches two blocks into the chunks round the one it starts in, so every chunk builds its share of the wells
// round it, each worked out whole from its own chunk's random and the noise terrain: vanilla looks at the ground
// there, which is the same but where a carver or a lake has been at it.

import { Rand, hash2 } from '../../core/rng';
import { S } from '../block';
import { MIN_Y } from '../constants';
import { B } from './biomes';
import { SUB_AIR, SUB_SOLID } from './geode';
import { blockPosAsLong } from './desertPyramid';
import type { GenContext } from './context';

/** vanilla loot_table/archaeology/desert_well */
export const DESERT_WELL_LOOT = 'archaeology/desert_well';
/** vanilla RarityFilter.onAverageOnceEvery(1000) */
const RARITY = 1000;

/** the noise terrain a well is worked out on (world/gen/generator) */
export interface WellTerrain {
  /** vanilla getHeight(MOTION_BLOCKING) before the chunk's features: the first block above the ground or water */
  firstFreeHeight(x: number, z: number): number;
  /** SUB_* at a block of the noise terrain */
  substanceAt(x: number, y: number, z: number): number;
  /** the biome generate() gives a column */
  columnBiome(x: number, z: number): number;
}

export interface Well {
  /** the sand in the middle, where the well's water goes (vanilla's position once it has come down to the ground) */
  x: number;
  y: number;
  z: number;
  /** the two suspicious sand, one and two under the water */
  suspicious: [number, number, number][];
}

let K: { sandstone: number; slab: number; sand: number; water: number; suspicious: number } | null = null;
const k = () => (K ??= { sandstone: S('sandstone'), slab: S('sandstone_slab'), sand: S('sand'), water: S('water'), suspicious: S('suspicious_sand') });

export class DesertWells {
  private readonly cache = new Map<number, Well | null>();

  constructor(
    private readonly seed: number,
    private readonly terrain: WellTerrain,
  ) {}

  /** place the parts of the wells round this chunk that fall inside it (after the SURFACE_STRUCTURES step's structures) */
  place(ctx: GenContext): void {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const w = this.wellAt(ctx.cx + dx, ctx.cz + dz);
        if (w && w.x + 2 >= ctx.x0 && w.x - 2 <= ctx.x0 + 15 && w.z + 2 >= ctx.z0 && w.z - 2 <= ctx.z0 + 15) build(ctx, w);
      }
  }

  /**
   * the well a chunk's placed feature puts down, if any: its rarity, a spot in the chunk (InSquarePlacement), the height
   * there (MOTION_BLOCKING) and the biome (BiomeFilter), then the feature's own checks
   */
  wellAt(cx: number, cz: number): Well | null {
    const key = cx * 65536 + cz;
    let w = this.cache.get(key);
    if (w === undefined) {
      w = this.work(cx, cz);
      if (this.cache.size > 4096) this.cache.clear();
      this.cache.set(key, w);
    }
    return w;
  }

  private work(cx: number, cz: number): Well | null {
    const r = new Rand(hash2(cx, cz, this.seed ^ 0xde5e7), 14);
    if (!(r.nextFloat() < Math.fround(1 / RARITY))) return null;
    const x = cx * 16 + r.nextInt(16), z = cz * 16 + r.nextInt(16);
    const t = this.terrain;
    const h = t.firstFreeHeight(x, z);
    if (h <= MIN_Y || t.columnBiome(x, z) !== B.desert) return null;
    // vanilla DesertWellFeature.place: down to the ground, which must be sand (the desert's ground: not its water)
    const y = h - 1;
    if (y <= MIN_Y + 2 || t.substanceAt(x, y, z) !== SUB_SOLID) return null;
    // nowhere under the well hollow two deep
    for (let i = -2; i <= 2; i++)
      for (let j = -2; j <= 2; j++) if (t.substanceAt(x + i, y - 1, z + j) === SUB_AIR && t.substanceAt(x + i, y - 2, z + j) === SUB_AIR) return null;
    // the suspicious sand: under the middle or one of its four sides (vanilla Util.getRandom of middle, east, south, west, north)
    const CROSS = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]];
    const [ax, az] = CROSS[r.nextInt(5)], [bx, bz] = CROSS[r.nextInt(5)];
    return { x, y, z, suspicious: [[x + ax, y - 1, z + az], [x + bx, y - 2, z + bz]] };
  }
}

/** vanilla DesertWellFeature.place, the blocks of it that are in this chunk */
function build(ctx: GenContext, w: Well): void {
  const { sandstone, slab, sand, water, suspicious } = k();
  const set = (dx: number, dy: number, dz: number, st: number) => {
    if (ctx.inChunk(w.x + dx, w.z + dz)) ctx.set(w.x + dx, w.y + dy, w.z + dz, st);
  };
  // a block of sandstone, the ground's top three
  for (let dy = -2; dy <= 0; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) set(dx, dy, dz, sandstone);
  // the water in a cross, on a cross of sand
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    set(dx, 0, dz, water);
    set(dx, -1, dz, sand);
  }
  // the wall round it, a slab in the middle of each side
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (dx === -2 || dx === 2 || dz === -2 || dz === 2) set(dx, 1, dz, sandstone);
  for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) set(dx, 1, dz, slab);
  // the roof: slabs round a sandstone middle, on four pillars
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(dx, 4, dz, dx === 0 && dz === 0 ? sandstone : slab);
  for (let dy = 1; dy <= 3; dy++) for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) set(dx, dy, dz, sandstone);
  // (vanilla placeSusSand: the block, and its block entity given the loot table seeded by its position)
  for (const [x, y, z] of w.suspicious) {
    if (!ctx.inChunk(x, z)) continue;
    ctx.set(x, y, z, suspicious);
    ctx.blockEntities.push({ id: 'brushable_block', x, y, z, items: [], data: { lootTable: DESERT_WELL_LOOT, lootSeed: blockPosAsLong(x, y, z).toString() } });
  }
}
