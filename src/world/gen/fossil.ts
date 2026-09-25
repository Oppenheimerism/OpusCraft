// Fossils (vanilla FossilFeature, the placed features fossil_upper and fossil_lower that deserts, swamps and mangrove
// swamps have in their UNDERGROUND_STRUCTURES step): in one chunk in 64 each, the bones of some great beast buried in
// the rock, a skull or a length of spine in bone blocks (world/gen/fossilTemplates) turned any of four ways, a tenth
// of the bones rotted away and coal ore in a tenth of their places. An upper one lies 15 to 24 blocks under the lowest
// ground over it (or under the height drawn for it, where that's lower); a lower one is drawn between the bottom of
// the world and y -8 and lies as far under that, with diamond ore in deepslate for its coal. One with more than four
// of its box's eight corners in air, water or lava isn't laid.
// A fossil reaches into the chunks round the one it starts in, so every chunk lays its share of the fossils round
// it, each worked out whole from its own chunk's random and the noise terrain (vanilla reads the ground's heights
// there, which are the same but where a carver has been at them); which bones rot and which turn to ore goes by each
// block's position rather than vanilla's one stream.

import { Rand, hash2, hash3, hashFloat } from '../../core/rng';
import { S, blockOf } from '../block';
import { MIN_Y, MAX_Y } from '../constants';
import { B, pickCaveBiome } from './biomes';
import { SUB_AIR, SUB_FLUID } from './geode';
import { rotateState } from './jigsaw';
import { newColumn, type OverworldRouter } from './router';
import { FOSSILS, fossilTemplate } from './fossilTemplates';
import type { MansionTemplate } from './mansionBuilder';
import type { Rot } from './mansion';
import type { GenContext } from './context';

/** the ground a fossil is worked out on */
export interface FossilTerrain {
  /** vanilla getHeight(OCEAN_FLOOR_WG): the first block above the ground, water not counted */
  oceanFloorHeight(x: number, z: number): number;
  /** SUB_* at a block of the noise terrain */
  substanceAt(x: number, y: number, z: number): number;
  /** the biome at a block, underground ones included (as the chunk's GenContext.biomeAt3) */
  biome(x: number, y: number, z: number): number;
}

/** the Overworld's terrain for fossils (world/gen/generator) */
export function fossilTerrain(g: {
  router: OverworldRouter;
  firstFreeHeight(x: number, z: number, oceanFloor?: boolean): number;
  substanceAt(x: number, y: number, z: number): number;
  columnBiome(x: number, z: number): number;
}): FossilTerrain {
  return {
    oceanFloorHeight: (x, z) => g.firstFreeHeight(x, z, true),
    substanceAt: (x, y, z) => g.substanceAt(x, y, z),
    biome: (x, y, z) => {
      const c = g.router.column(x & ~3, z & ~3, newColumn());
      const cave = pickCaveBiome(c.humidity, c.continents, c.erosion, g.router.depth(y & ~3, c));
      return cave >= 0 ? cave : g.columnBiome(x, z);
    },
  };
}

/** vanilla BiomeDefaultFeatures.addFossilDecoration's biomes */
const WITH_FOSSILS = new Set([B.desert, B.swamp, B.mangrove_swamp]);

interface Placement {
  salt: number;
  /** vanilla HeightRangePlacement.uniform: the height drawn for it */
  minY: number;
  maxY: number;
  /** vanilla fossil_diamonds (ProcessorLists.FOSSIL_DIAMONDS): the overlay's coal ore as deepslate diamond ore */
  diamonds: boolean;
}

/** vanilla CavePlacements.FOSSIL_UPPER and FOSSIL_LOWER (each RarityFilter.onAverageOnceEvery(64)), in the step's order */
const PLACEMENTS: Placement[] = [
  { salt: 0xf055, minY: 0, maxY: MAX_Y - 1, diamonds: false },
  { salt: 0xf056, minY: MIN_Y, maxY: -8, diamonds: true },
];
const RARITY = 64;

export interface Fossil {
  template: string;
  rot: Rot;
  /** the corner of its box (west, bottom, north) */
  x: number;
  y: number;
  z: number;
  /** its box's size along x and z, once turned */
  wx: number;
  wz: number;
  diamonds: boolean;
  /** for the rot and the ore, block by block */
  salt: number;
}

/** vanilla #features_cannot_replace (those the game has) */
const PROTECTED = new Set(['bedrock', 'spawner', 'chest', 'end_portal_frame', 'reinforced_deepslate', 'trial_spawner', 'vault']);
const f32 = Math.fround;

/** a template block's place, turned about the box's corner as vanilla's getZeroPositionWithTransform leaves it */
function at(f: Fossil, t: MansionTemplate, tx: number, tz: number): [number, number] {
  switch (f.rot) {
    case 1: return [f.x + t.sz - 1 - tz, f.z + tx];
    case 2: return [f.x + t.sx - 1 - tx, f.z + t.sz - 1 - tz];
    case 3: return [f.x + tz, f.z + t.sx - 1 - tx];
    default: return [f.x + tx, f.z + tz];
  }
}

export class Fossils {
  private readonly cache = new Map<number, Fossil | null>();
  private ores: [number, number] | null = null;

  constructor(
    private readonly seed: number,
    private readonly terrain: FossilTerrain,
  ) {}

  /** lay the parts of the fossils round this chunk that fall inside it (the UNDERGROUND_STRUCTURES step's features) */
  place(ctx: GenContext): void {
    for (let p = 0; p < PLACEMENTS.length; p++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const f = this.fossilAt(ctx.cx + dx, ctx.cz + dz, p);
          if (f && f.x + f.wx > ctx.x0 && f.x <= ctx.x0 + 15 && f.z + f.wz > ctx.z0 && f.z <= ctx.z0 + 15) this.lay(ctx, f);
        }
  }

  /**
   * the fossil a chunk's placed feature lays, if any (`p`: 0 the upper one, 1 the lower): its rarity, a spot in the
   * chunk (InSquarePlacement), a height (HeightRangePlacement) and the biome there (BiomeFilter), then the feature's
   * turn, template and depth, and its corners
   */
  fossilAt(cx: number, cz: number, p: number): Fossil | null {
    const key = (cx * 65536 + cz) * 2 + p;
    let f = this.cache.get(key);
    if (f === undefined) {
      f = this.work(cx, cz, PLACEMENTS[p]);
      if (this.cache.size > 8192) this.cache.clear();
      this.cache.set(key, f);
    }
    return f;
  }

  private work(cx: number, cz: number, P: Placement): Fossil | null {
    const salt = hash2(cx, cz, this.seed ^ P.salt);
    const r = new Rand(salt, 15);
    if (!(r.nextFloat() < f32(1 / RARITY))) return null;
    const ox = cx * 16 + r.nextInt(16), oz = cz * 16 + r.nextInt(16), oy = P.minY + r.nextInt(P.maxY - P.minY + 1);
    const t = this.terrain;
    if (!WITH_FOSSILS.has(t.biome(ox, oy, oz))) return null;
    // vanilla FossilFeature.place: a turn and a template, its box centred on the spot
    const rot = r.nextInt(4) as Rot;
    const name = FOSSILS[r.nextInt(FOSSILS.length)];
    const tpl = fossilTemplate(name);
    const [wx, wz] = rot & 1 ? [tpl.sz, tpl.sx] : [tpl.sx, tpl.sz];
    const x = ox - (wx >> 1), z = oz - (wz >> 1);
    // under the lowest ground over it
    let j = oy;
    for (let i = 0; i < wx; i++) for (let k = 0; k < wz; k++) j = Math.min(j, t.oceanFloorHeight(x + i, z + k));
    const y = Math.max(j - 15 - r.nextInt(10), MIN_Y + 10);
    // countEmptyCorners
    let empty = 0;
    for (const ex of [x, x + wx - 1])
      for (const ey of [y, y + tpl.sy - 1])
        for (const ez of [z, z + wz - 1]) {
          const s = t.substanceAt(ex, ey, ez);
          if (s === SUB_AIR || s === SUB_FLUID) empty++;
        }
    if (empty > 4) return null;
    return { template: name, rot, x, y, z, wx, wz, diamonds: P.diamonds, salt };
  }

  /** the fossil's blocks that are in this chunk: the bones (BlockRotProcessor 0.9), then the overlay's ore (0.1) */
  private lay(ctx: GenContext, f: Fossil): void {
    const [coal, diamond] = (this.ores ??= [S('coal_ore'), S('deepslate_diamond_ore')]);
    const t = fossilTemplate(f.template), b = t.blocks;
    for (const overlay of [false, true])
      for (let i = 0; i < b.length; i += 4) {
        const [x, z] = at(f, t, b[i], b[i + 2]);
        const y = f.y + b[i + 1];
        if (!ctx.inChunk(x, z) || y < MIN_Y || y >= MAX_Y) continue;
        if (hashFloat(hash3(x, y, z, overlay ? f.salt ^ 0xc0a1 : f.salt)) > f32(overlay ? 0.1 : 0.9)) continue;
        // ProtectedBlockProcessor
        const cur = ctx.get(x, y, z);
        if (cur > 0 && PROTECTED.has(blockOf(cur).name)) continue;
        ctx.set(x, y, z, overlay ? (f.diamonds ? diamond : coal) : rotateState(b[i + 3], f.rot));
      }
  }
}
