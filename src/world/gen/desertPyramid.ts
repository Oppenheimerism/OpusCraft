// Desert pyramids (vanilla DesertPyramidStructure + DesertPyramidPiece): a 21 x 21 sandstone pyramid with two
// towers at the front, an entrance hall with a coloured terracotta floor, and a shaft under the middle of it down to
// a hidden room: four chests in alcoves around a stone pressure plate that sets off the nine TNT under it. Since
// 1.20 a stairway under the hall's floor leads down to a sand-filled cellar under a collapsed patch of the floor;
// 5-7 blocks of the cellar's sand (and one of the collapsed roof) are suspicious sand to brush.

import type { Rand, JavaRandom } from '../../core/rng';
import { S } from '../block';
import type { GenContext } from './context';
import { BoundingBox } from './structure';
import { ScatteredPiece, HORIZONTAL, positionalRandom } from './templePiece';
import type { LegacyRandom } from './legacyRandom';

const LOOT = 'chests/desert_pyramid';
/** vanilla BuiltInLootTables.DESERT_PYRAMID_ARCHAEOLOGY */
export const ARCHAEOLOGY_LOOT = 'archaeology/desert_pyramid';

interface Blocks {
  SANDSTONE: number;
  CUT: number;
  CHISELED: number;
  SLAB: number;
  ORANGE: number;
  BLUE: number;
  PLATE: number;
  TNT: number;
  SAND: number;
  SUSPICIOUS: number;
  stairs: (facing: string) => number;
}
let BLK: Blocks | null = null;
function k(): Blocks {
  return (BLK ??= {
    SANDSTONE: S('sandstone'), CUT: S('cut_sandstone'), CHISELED: S('chiseled_sandstone'), SLAB: S('sandstone_slab', { type: 'bottom' }),
    ORANGE: S('orange_terracotta'), BLUE: S('blue_terracotta'), PLATE: S('stone_pressure_plate'), TNT: S('tnt'), SAND: S('sand'), SUSPICIOUS: S('suspicious_sand'),
    stairs: (facing: string) => S('sandstone_stairs', { facing, half: 'bottom', shape: 'straight' }),
  });
}

/** vanilla BlockPos.asLong: x in the top 26 bits, then z in 26, y in the low 12 */
export function blockPosAsLong(x: number, y: number, z: number): bigint {
  return BigInt.asIntN(64, (BigInt(x & 0x3ffffff) << 38n) | (BigInt(z & 0x3ffffff) << 12n) | BigInt(y & 0xfff));
}

/**
 * vanilla DesertPyramidStructure.placeSuspiciousSand: suspicious sand where it's in this chunk, its block entity
 * given the archaeology loot table seeded by the position (game/archaeology.ts rolls it when it's first brushed)
 */
function placeSuspiciousSand(ctx: GenContext, chunk: BoundingBox, x: number, y: number, z: number): void {
  if (!chunk.isInside(x, y, z)) return;
  ctx.set(x, y, z, k().SUSPICIOUS);
  ctx.blockEntities.push({ id: 'brushable_block', x, y, z, items: [], data: { lootTable: ARCHAEOLOGY_LOOT, lootSeed: blockPosAsLong(x, y, z).toString() } });
}

/** vanilla DesertPyramidPiece */
export class DesertPyramidPiece extends ScatteredPiece {
  /** where the collapsed roof's suspicious sand goes (vanilla randomCollapsedRoofPos), set by postProcess */
  private roofPos: [number, number, number] = [0, 0, 0];
  /** the cellar's sand, some of it to be suspicious (vanilla potentialSuspiciousSandWorldPositions) */
  private sandPositions: [number, number, number][] = [];

  constructor(worldSeed: bigint, r: JavaRandom, x: number, z: number) {
    super(worldSeed, x, 64, z, 21, 15, 21, HORIZONTAL[r.nextInt(4)]);
  }

  /** the chest room's walls round the chests (the only neighbours reorient asks about) */
  protected override solidHint(x: number, y: number, z: number): boolean {
    if (x >= 9 && x <= 11 && z >= 9 && z <= 11) return false;
    return !(y === -11 && ((z === 10 && (x === 8 || x === 12)) || (x === 10 && (z === 8 || z === 12))));
  }

  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    // (vanilla draws the height adjustment on every chunk; the piece was moved when it was laid out)
    r.nextInt(3);
    // vanilla WorldGenRegion.getRandom: the chunk's own random, apart from the structure's
    const region = regionRandom(ctx, this.worldSeed);
    const { SANDSTONE, CUT, CHISELED, SLAB, ORANGE, BLUE, PLATE, TNT, stairs } = k();
    const w = this.width, d = this.depth;
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, edge: number, inside = edge, existingOnly = false) =>
      this.generateBox(ctx, chunk, x0, y0, z0, x1, y1, z1, edge, inside, existingOnly);
    const put = (st: number, x: number, y: number, z: number) => this.placeBlock(ctx, st, x, y, z, chunk);

    box(0, -4, 0, w - 1, 0, d - 1, SANDSTONE);
    for (let i = 1; i <= 9; i++) {
      box(i, i, i, w - 1 - i, i, d - 1 - i, SANDSTONE);
      box(i + 1, i, i + 1, w - 2 - i, i, d - 2 - i, 0);
    }
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) this.fillColumnDown(ctx, SANDSTONE, x, -5, z, chunk);

    const N = stairs('north'), So = stairs('south'), E = stairs('east'), W = stairs('west');
    // the two towers at the front
    box(0, 0, 0, 4, 9, 4, SANDSTONE, 0);
    box(1, 10, 1, 3, 10, 3, SANDSTONE);
    put(N, 2, 10, 0);
    put(So, 2, 10, 4);
    put(E, 0, 10, 2);
    put(W, 4, 10, 2);
    box(w - 5, 0, 0, w - 1, 9, 4, SANDSTONE, 0);
    box(w - 4, 10, 1, w - 2, 10, 3, SANDSTONE);
    put(N, w - 3, 10, 0);
    put(So, w - 3, 10, 4);
    put(E, w - 5, 10, 2);
    put(W, w - 1, 10, 2);
    // the entrance and the passages to the towers
    box(8, 0, 0, 12, 4, 4, SANDSTONE, 0);
    box(9, 1, 0, 11, 3, 4, 0);
    put(CUT, 9, 1, 1);
    put(CUT, 9, 2, 1);
    put(CUT, 9, 3, 1);
    put(CUT, 10, 3, 1);
    put(CUT, 11, 3, 1);
    put(CUT, 11, 2, 1);
    put(CUT, 11, 1, 1);
    box(4, 1, 1, 8, 3, 3, SANDSTONE, 0);
    box(4, 1, 2, 8, 2, 2, 0);
    box(12, 1, 1, 16, 3, 3, SANDSTONE, 0);
    box(12, 1, 2, 16, 2, 2, 0);
    // the hall: its upper floor with the hole over the middle, the pillars, the side galleries
    box(5, 4, 5, w - 6, 4, d - 6, SANDSTONE);
    box(9, 4, 9, 11, 4, 11, 0);
    box(8, 1, 8, 8, 3, 8, CUT);
    box(12, 1, 8, 12, 3, 8, CUT);
    box(8, 1, 12, 8, 3, 12, CUT);
    box(12, 1, 12, 12, 3, 12, CUT);
    box(1, 1, 5, 4, 4, 11, SANDSTONE);
    box(w - 5, 1, 5, w - 2, 4, 11, SANDSTONE);
    box(6, 7, 9, 6, 7, 11, SANDSTONE);
    box(w - 7, 7, 9, w - 7, 7, 11, SANDSTONE);
    box(5, 5, 9, 5, 7, 11, CUT);
    box(w - 6, 5, 9, w - 6, 7, 11, CUT);
    put(0, 5, 5, 10);
    put(0, 5, 6, 10);
    put(0, 6, 6, 10);
    put(0, w - 6, 5, 10);
    put(0, w - 6, 6, 10);
    put(0, w - 7, 6, 10);
    box(2, 4, 4, 2, 6, 4, 0);
    box(w - 3, 4, 4, w - 3, 6, 4, 0);
    put(N, 2, 4, 5);
    put(N, 2, 3, 4);
    put(N, w - 3, 4, 5);
    put(N, w - 3, 3, 4);
    box(1, 1, 3, 2, 2, 3, SANDSTONE);
    box(w - 3, 1, 3, w - 2, 2, 3, SANDSTONE);
    put(SANDSTONE, 1, 1, 2);
    put(SANDSTONE, w - 2, 1, 2);
    put(SLAB, 1, 2, 2);
    put(SLAB, w - 2, 2, 2);
    put(W, 2, 1, 2);
    put(E, w - 3, 1, 2);
    box(4, 3, 5, 4, 3, 17, SANDSTONE);
    box(w - 5, 3, 5, w - 5, 3, 17, SANDSTONE);
    box(3, 1, 5, 4, 2, 16, 0);
    box(w - 6, 1, 5, w - 5, 2, 16, 0);
    for (let z = 5; z <= 17; z += 2) {
      put(CUT, 4, 1, z);
      put(CHISELED, 4, 2, z);
      put(CUT, w - 5, 1, z);
      put(CHISELED, w - 5, 2, z);
    }
    // the terracotta star on the hall's floor
    put(ORANGE, 10, 0, 7);
    put(ORANGE, 10, 0, 8);
    put(ORANGE, 9, 0, 9);
    put(ORANGE, 11, 0, 9);
    put(ORANGE, 8, 0, 10);
    put(ORANGE, 12, 0, 10);
    put(ORANGE, 7, 0, 10);
    put(ORANGE, 13, 0, 10);
    put(ORANGE, 9, 0, 11);
    put(ORANGE, 11, 0, 11);
    put(ORANGE, 10, 0, 12);
    put(ORANGE, 10, 0, 13);
    put(BLUE, 10, 0, 10);
    // the patterns on the towers' outer sides and fronts
    for (let x = 0; x <= w - 1; x += w - 1) {
      put(CUT, x, 2, 1);
      put(ORANGE, x, 2, 2);
      put(CUT, x, 2, 3);
      put(CUT, x, 3, 1);
      put(ORANGE, x, 3, 2);
      put(CUT, x, 3, 3);
      put(ORANGE, x, 4, 1);
      put(CHISELED, x, 4, 2);
      put(ORANGE, x, 4, 3);
      put(CUT, x, 5, 1);
      put(ORANGE, x, 5, 2);
      put(CUT, x, 5, 3);
      put(ORANGE, x, 6, 1);
      put(CHISELED, x, 6, 2);
      put(ORANGE, x, 6, 3);
      put(ORANGE, x, 7, 1);
      put(ORANGE, x, 7, 2);
      put(ORANGE, x, 7, 3);
      put(CUT, x, 8, 1);
      put(CUT, x, 8, 2);
      put(CUT, x, 8, 3);
    }
    for (let x = 2; x <= w - 3; x += w - 3 - 2) {
      put(CUT, x - 1, 2, 0);
      put(ORANGE, x, 2, 0);
      put(CUT, x + 1, 2, 0);
      put(CUT, x - 1, 3, 0);
      put(ORANGE, x, 3, 0);
      put(CUT, x + 1, 3, 0);
      put(ORANGE, x - 1, 4, 0);
      put(CHISELED, x, 4, 0);
      put(ORANGE, x + 1, 4, 0);
      put(CUT, x - 1, 5, 0);
      put(ORANGE, x, 5, 0);
      put(CUT, x + 1, 5, 0);
      put(ORANGE, x - 1, 6, 0);
      put(CHISELED, x, 6, 0);
      put(ORANGE, x + 1, 6, 0);
      put(ORANGE, x - 1, 7, 0);
      put(ORANGE, x, 7, 0);
      put(ORANGE, x + 1, 7, 0);
      put(CUT, x - 1, 8, 0);
      put(CUT, x, 8, 0);
      put(CUT, x + 1, 8, 0);
    }
    // over the entrance
    box(8, 4, 0, 12, 6, 0, CUT);
    put(0, 8, 6, 0);
    put(0, 12, 6, 0);
    put(ORANGE, 9, 5, 0);
    put(CHISELED, 10, 5, 0);
    put(ORANGE, 11, 5, 0);
    // the shaft and the treasure room under the hall
    box(8, -14, 8, 12, -11, 12, CUT);
    box(8, -10, 8, 12, -10, 12, CHISELED);
    box(8, -9, 8, 12, -9, 12, CUT);
    box(8, -8, 8, 12, -1, 12, SANDSTONE);
    box(9, -11, 9, 11, -1, 11, 0);
    put(PLATE, 10, -11, 10);
    box(9, -13, 9, 11, -13, 11, TNT, 0);
    put(0, 8, -11, 10);
    put(0, 8, -10, 10);
    put(CHISELED, 7, -10, 10);
    put(CUT, 7, -11, 10);
    put(0, 12, -11, 10);
    put(0, 12, -10, 10);
    put(CHISELED, 13, -10, 10);
    put(CUT, 13, -11, 10);
    put(0, 10, -11, 8);
    put(0, 10, -10, 8);
    put(CHISELED, 10, -10, 7);
    put(CUT, 10, -11, 7);
    put(0, 10, -11, 12);
    put(0, 10, -10, 12);
    put(CHISELED, 10, -10, 13);
    put(CUT, 10, -11, 13);
    // a chest in each alcove (vanilla: the four horizontal directions in order)
    const STEP: Record<string, [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
    for (const dir of HORIZONTAL) {
      const [sx, sz] = STEP[dir];
      this.createChest(ctx, chunk, r, 10 + sx * 2, -11, 10 + sz * 2, LOOT);
    }
    this.addCellar(ctx, chunk, region);
  }

  /** vanilla addCellar: the cellar round (16, -4, 13) */
  private addCellar(ctx: GenContext, chunk: BoundingBox, region: LegacyRandom): void {
    this.sandPositions = [];
    this.addCellarStairs(ctx, chunk, region, 16, -4, 13);
    this.addCellarRoom(ctx, chunk, region, 16, -4, 13);
  }

  /** vanilla addCellarStairs: three stairs down from the hall, under sand (and a block or two of sandstone) */
  private addCellarStairs(ctx: GenContext, chunk: BoundingBox, region: LegacyRandom, i: number, j: number, k0: number): void {
    const { SAND, SANDSTONE, stairs } = k();
    const put = (st: number, x: number, y: number, z: number) => this.placeBlock(ctx, st, x, y, z, chunk);
    // (vanilla: the default stair turned counterclockwise)
    const st = stairs('west');
    put(st, 13, -1, 17);
    put(st, 14, -2, 17);
    put(st, 15, -3, 17);
    const bl = region.nextBoolean();
    put(SAND, i - 4, j + 4, k0 + 4);
    put(SAND, i - 3, j + 4, k0 + 4);
    put(SAND, i - 2, j + 4, k0 + 4);
    put(SAND, i - 1, j + 4, k0 + 4);
    put(SAND, i, j + 4, k0 + 4);
    put(SAND, i - 2, j + 3, k0 + 4);
    put(bl ? SAND : SANDSTONE, i - 1, j + 3, k0 + 4);
    put(!bl ? SAND : SANDSTONE, i, j + 3, k0 + 4);
    put(SAND, i - 1, j + 2, k0 + 4);
    put(SANDSTONE, i, j + 2, k0 + 4);
    put(SAND, i, j + 1, k0 + 4);
  }

  /** vanilla addCellarRoom: a ring of cut and chiseled sandstone round a room of sand, with a terracotta floor */
  private addCellarRoom(ctx: GenContext, chunk: BoundingBox, region: LegacyRandom, i: number, j: number, k0: number): void {
    const { CUT, CHISELED, ORANGE, BLUE } = k();
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, st: number) => this.generateBox(ctx, chunk, x0, y0, z0, x1, y1, z1, st, st, true);
    const put = (st: number, x: number, y: number, z: number) => this.placeBlock(ctx, st, x, y, z, chunk);
    box(i - 3, j + 1, k0 - 3, i - 3, j + 1, k0 + 2, CUT);
    box(i + 3, j + 1, k0 - 3, i + 3, j + 1, k0 + 2, CUT);
    box(i - 3, j + 1, k0 - 3, i + 3, j + 1, k0 - 2, CUT);
    box(i - 3, j + 1, k0 + 3, i + 3, j + 1, k0 + 3, CUT);
    box(i - 3, j + 2, k0 - 3, i - 3, j + 2, k0 + 2, CHISELED);
    box(i + 3, j + 2, k0 - 3, i + 3, j + 2, k0 + 2, CHISELED);
    box(i - 3, j + 2, k0 - 3, i + 3, j + 2, k0 - 2, CHISELED);
    box(i - 3, j + 2, k0 + 3, i + 3, j + 2, k0 + 3, CHISELED);
    box(i - 3, -1, k0 - 3, i - 3, -1, k0 + 2, CUT);
    box(i + 3, -1, k0 - 3, i + 3, -1, k0 + 2, CUT);
    box(i - 3, -1, k0 - 3, i + 3, -1, k0 - 2, CUT);
    box(i - 3, -1, k0 + 3, i + 3, -1, k0 + 3, CUT);
    this.placeSandBox(i - 2, j + 1, k0 - 2, i + 2, j + 3, k0 + 2);
    this.placeCollapsedRoof(ctx, chunk, region, i - 2, j + 4, k0 - 2, i + 2, k0 + 2);
    put(BLUE, i, j, k0);
    put(ORANGE, i + 1, j, k0 - 1);
    put(ORANGE, i + 1, j, k0 + 1);
    put(ORANGE, i - 1, j, k0 - 1);
    put(ORANGE, i - 1, j, k0 + 1);
    put(ORANGE, i + 2, j, k0);
    put(ORANGE, i - 2, j, k0);
    put(ORANGE, i, j, k0 + 2);
    put(ORANGE, i, j, k0 - 2);
    put(ORANGE, i + 3, j, k0);
    this.placeSand(i + 3, j + 1, k0);
    this.placeSand(i + 3, j + 2, k0);
    put(CUT, i + 4, j + 1, k0);
    put(CHISELED, i + 4, j + 2, k0);
    put(ORANGE, i - 3, j, k0);
    this.placeSand(i - 3, j + 1, k0);
    this.placeSand(i - 3, j + 2, k0);
    put(CUT, i - 4, j + 1, k0);
    put(CHISELED, i - 4, j + 2, k0);
    put(ORANGE, i, j, k0 + 3);
    this.placeSand(i, j + 1, k0 + 3);
    this.placeSand(i, j + 2, k0 + 3);
    put(ORANGE, i, j, k0 - 3);
    this.placeSand(i, j + 1, k0 - 3);
    this.placeSand(i, j + 2, k0 - 3);
    put(CUT, i, j + 1, k0 - 4);
    put(CHISELED, i, j + 2, k0 - 4);
  }

  /** vanilla placeSand: a place for the cellar's sand (the structure fills them all in afterwards) */
  private placeSand(x: number, y: number, z: number): void {
    this.sandPositions.push(this.worldPos(x, y, z));
  }

  private placeSandBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) this.placeSand(x, y, z);
  }

  /** vanilla placeCollapsedRoof: a patch of the hall's floor fallen in (a third sandstone, the rest sand), and one place in it for suspicious sand */
  private placeCollapsedRoof(ctx: GenContext, chunk: BoundingBox, region: LegacyRandom, x0: number, y: number, z0: number, x1: number, z1: number): void {
    const { SAND, SANDSTONE } = k();
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) this.placeBlock(ctx, region.nextFloat() < 0.33 ? SANDSTONE : SAND, x, y, z, chunk);
    const [wx, wy, wz] = this.worldPos(x0, y, z0);
    const r = positionalRandom(this.worldSeed, wx, wy, wz);
    const i = r.nextInt(x1 - x0 + 1) + x0;
    const j = r.nextInt(z1 - z0 + 1) + z0;
    this.roofPos = this.worldPos(i, y, j);
  }

  /**
   * vanilla DesertPyramidStructure.afterPlace: suspicious sand at the collapsed roof's place, then the cellar's places
   * (in order, then shuffled by a random of the world seed and the structure's middle): the first 5-7 suspicious
   * sand, the rest plain sand
   */
  afterPlace(ctx: GenContext, chunk: BoundingBox): void {
    placeSuspiciousSand(ctx, chunk, ...this.roofPos);
    // (vanilla SortedArraySet with Vec3i.compareTo: by y, then z, then x)
    const list = this.sandPositions.slice();
    list.sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[0] - b[0]);
    const b = this.box;
    const r = positionalRandom(this.worldSeed, b.minX + (b.xSpan >> 1), b.minY + (b.ySpan >> 1), b.minZ + (b.zSpan >> 1));
    // vanilla Util.shuffle
    for (let n = list.length; n > 1; n--) {
      const m = r.nextInt(n);
      [list[n - 1], list[m]] = [list[m], list[n - 1]];
    }
    let i = Math.min(list.length, 5 + r.nextInt(3));
    for (const [x, y, z] of list) {
      if (i > 0) {
        i--;
        placeSuspiciousSand(ctx, chunk, x, y, z);
      } else if (chunk.isInside(x, y, z)) ctx.set(x, y, z, k().SAND);
    }
  }

  /** where the suspicious sand may go (the collapsed roof's first, then all the cellar's), for tests */
  suspiciousSand(): [number, number, number][] {
    return [this.roofPos, ...this.sandPositions];
  }
}

/** vanilla WorldGenRegion.getRandom: a random for the chunk being decorated, apart from the structures' own */
function regionRandom(ctx: GenContext, worldSeed: bigint): LegacyRandom {
  return positionalRandom(worldSeed, ctx.x0, 0, ctx.z0);
}

