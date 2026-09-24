// Strongholds (vanilla StrongholdStructure, StrongholdPieces and ConcentricRingsStructurePlacement).
//
// Where: 128 of them in 8 rings around the world's centre (3 in the first ring, 1280 to 2816 blocks out, then 6,
// 10, 15, 21, 28, 36 and the last 9), spaced evenly round each ring from a random starting angle, and each nudged
// (within 112 blocks) toward the biomes vanilla prefers for them (#stronghold_biased_to). The ring positions come
// from vanilla's own random, so for a numeric seed they start from where vanilla puts them.
//
// What: a start staircase down from y 64 into a five-way crossing, then corridors grown piece by piece, each one
// picked at random from the kinds that can still go there (straight halls, turns, prison cells, room crossings in
// four styles, straight and spiral stairs down, chest corridors, libraries, the portal room), out to 112 blocks and
// 50 pieces deep; tried again with a new seed until the portal room turns up. Then the whole thing is sunk into the
// ground, its top somewhere between y -64 + its height and y 53, and the terrain is filled in round its floors
// (terrain_adaptation "bury"). Walls are stone bricks, a fifth of them cracked, 30% mossy and 5% infested; only
// where there's already rock to replace, so caves eat into them. Doors are openings, wooden doors, iron bars or
// iron doors with a button either side.
//
// The portal room: a lava pool under a ring of 12 end portal frames, each with a 10% chance of already holding an
// eye (the portal is lit if all 12 do), stairs up to it with a silverfish spawner on top, lava by the entrance, a
// ledge round the walls and barred windows.
//
// Approximations: the terrain and biomes aren't vanilla's, so neither are the nudged positions; the random that
// places each chunk's share (vanilla: a Xoroshiro WorldgenRandom) is a java.util.Random seeded the same way; a
// chest right at a chunk's edge is turned by the piece's own plan of its walls where vanilla looks at the
// neighbouring chunk's blocks.

import { Rand } from '../../core/rng';
import { S, blockOf } from '../block';
import { MIN_Y, MAX_Y, SEA_LEVEL } from '../constants';
import type { GenContext } from './context';
import { BoundingBox, PieceList, StructurePiece, type Dir4, isAir, solidRender } from './structure';
import { LegacyRandom } from './legacyRandom';
import { B, pickSurfaceBiome, pickCaveBiome } from './biomes';
import { OverworldRouter, newColumn } from './router';
import { SeedSource } from './noise';
import { worldSeed64 } from './jigsaw';

const LOOT_CORRIDOR = 'chests/stronghold_corridor';
const LOOT_CROSSING = 'chests/stronghold_crossing';
const LOOT_LIBRARY = 'chests/stronghold_library';

/** vanilla Direction.Plane.HORIZONTAL */
const HORIZONTAL: Dir4[] = ['north', 'east', 'south', 'west'];

/** vanilla #minecraft:stronghold_biased_to */
export const STRONGHOLD_BIASED_TO = new Set<number>([
  B.plains, B.sunflower_plains, B.snowy_plains, B.ice_spikes, B.desert, B.forest, B.flower_forest, B.birch_forest, B.dark_forest,
  B.old_growth_birch_forest, B.old_growth_pine_taiga, B.old_growth_spruce_taiga, B.taiga, B.snowy_taiga, B.savanna, B.savanna_plateau,
  B.windswept_hills, B.windswept_gravelly_hills, B.windswept_forest, B.windswept_savanna, B.jungle, B.sparse_jungle, B.bamboo_jungle,
  B.badlands, B.eroded_badlands, B.wooded_badlands, B.meadow, B.cherry_grove, B.grove, B.snowy_slopes, B.frozen_peaks, B.jagged_peaks,
  B.stony_peaks, B.mushroom_fields, B.dripstone_caves, B.lush_caves,
]);

// vanilla structure_set strongholds: concentric_rings, distance 32, spread 3, count 128
const COUNT = 128, DISTANCE = 32, SPREAD = 3;
/** vanilla StrongholdPieces.MAX_DEPTH, and how far out pieces may start (generateAndAddPiece) */
const MAX_DEPTH = 50, MAX_REACH = 112;

// ---------------------------------------------------------------------------------------------------------------
// Randoms

/** vanilla's RandomSource (LegacyRandomSource) behind the Rand the structure helpers take */
class JRand extends Rand {
  constructor(readonly j: LegacyRandom) {
    super(0);
  }
  override nextU32(): number {
    return this.j ? this.j.next(32) >>> 0 : super.nextU32();
  }
  override next(): number {
    return this.j.nextDouble();
  }
  override nextFloat(): number {
    return this.j.nextFloat();
  }
  override nextDouble(): number {
    return this.j.nextDouble();
  }
  override nextInt(n: number): number {
    return this.j.nextInt(n);
  }
  override nextBool(): boolean {
    return this.j.nextBoolean();
  }
}

/** vanilla WorldgenRandom.setLargeFeatureSeed */
function largeFeatureRandom(seed: bigint, cx: number, cz: number): LegacyRandom {
  const r = new LegacyRandom(seed);
  const a = r.nextLong(), b = r.nextLong();
  r.setSeed((BigInt(cx) * a) ^ (BigInt(cz) * b) ^ seed);
  return r;
}

/**
 * vanilla WorldgenRandom.setDecorationSeed(levelSeed, chunk's min x, min z) then setFeatureSeed(that, 0, the
 * STRONGHOLDS step, 5): the random a chunk's share of a stronghold is built with
 */
function chunkRandom(seed: bigint, x0: number, z0: number): JRand {
  const r = new LegacyRandom(seed);
  const a = r.nextLong() | 1n, b = r.nextLong() | 1n;
  const deco = BigInt.asIntN(64, (BigInt(x0) * a + BigInt(z0) * b) ^ seed);
  r.setSeed(deco + 50000n);
  return new JRand(r);
}

// ---------------------------------------------------------------------------------------------------------------
// Blocks

interface Blocks {
  AIR: number;
  STONE_BRICKS: number;
  CRACKED: number;
  MOSSY: number;
  INFESTED: number;
  COBBLESTONE: number;
  SMOOTH_SLAB: number;
  SMOOTH_DOUBLE: number;
  BRICK_SLAB: number;
  PLANKS: number;
  BOOKSHELF: number;
  COBWEB: number;
  TORCH: number;
  LAVA: number;
  WATER: number;
  CHEST: number;
  SPAWNER: number;
  PORTAL: number;
}
let BLK: Blocks | null = null;
function K(): Blocks {
  return (BLK ??= {
    AIR: 0, STONE_BRICKS: S('stone_bricks'), CRACKED: S('cracked_stone_bricks'), MOSSY: S('mossy_stone_bricks'), INFESTED: S('infested_stone_bricks'),
    COBBLESTONE: S('cobblestone'), SMOOTH_SLAB: S('smooth_stone_slab'), SMOOTH_DOUBLE: S('smooth_stone_slab', { type: 'double' }),
    BRICK_SLAB: S('stone_brick_slab'), PLANKS: S('oak_planks'), BOOKSHELF: S('bookshelf'), COBWEB: S('cobweb'), TORCH: S('torch'),
    LAVA: S('lava'), WATER: S('water'), CHEST: S('chest'), SPAWNER: S('spawner'), PORTAL: S('end_portal'),
  });
}
const wallTorch = (facing: Dir4) => S('wall_torch', { facing });
const bars = (north: boolean, east: boolean, south: boolean, west: boolean) => S('iron_bars', { north, east, south, west });
const fence = (north: boolean, east: boolean, south: boolean, west: boolean) => S('oak_fence', { north, east, south, west });
const stairs = (name: string, facing: Dir4) => S(name, { facing });
const frame = (facing: Dir4, eye: boolean) => S('end_portal_frame', { facing, eye });

const F01 = Math.fround(0.1), F02 = Math.fround(0.2), F05 = Math.fround(0.5), F055 = Math.fround(0.55), F007 = Math.fround(0.07), F09 = Math.fround(0.9);

/**
 * vanilla StrongholdPieces.SmoothStoneSelector: a wall is stone bricks, a fifth of them cracked, 30% mossy and 5%
 * infested with a silverfish; inside is cleared
 */
function smoothStone(r: Rand, wall: boolean): number {
  const k = K();
  if (!wall) return k.AIR;
  const f = r.nextFloat();
  if (f < F02) return k.CRACKED;
  if (f < F05) return k.MOSSY;
  if (f < F055) return k.INFESTED;
  return k.STONE_BRICKS;
}

/** vanilla BoundingBox.orientBox */
function orientBox(x: number, y: number, z: number, ox: number, oy: number, oz: number, w: number, h: number, d: number, facing: Dir4): BoundingBox {
  switch (facing) {
    case 'north': return new BoundingBox(x + ox, y + oy, z - d + 1 + oz, x + w - 1 + ox, y + h - 1 + oy, z + oz);
    case 'west': return new BoundingBox(x - d + 1 + oz, y + oy, z + ox, x + oz, y + h - 1 + oy, z + w - 1 + ox);
    case 'east': return new BoundingBox(x + oz, y + oy, z + ox, x + d - 1 + oz, y + h - 1 + oy, z + w - 1 + ox);
    default: return new BoundingBox(x + ox, y + oy, z + oz, x + w - 1 + ox, y + h - 1 + oy, z + d - 1 + oz);
  }
}

/** vanilla StrongholdPiece.isOkBox: not down among the bedrock */
const isOkBox = (b: BoundingBox) => b.minY > 10;

// ---------------------------------------------------------------------------------------------------------------
// Piece weights (vanilla StrongholdPieces.STRONGHOLD_PIECE_WEIGHTS)

type Factory = (pieces: PieceList, r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number) => StrongholdPiece | null;

class PieceWeight {
  placeCount = 0;
  /** `minDepth`: only deeper than this (the library > 4, the portal room > 5) */
  constructor(readonly create: Factory, readonly weight: number, readonly maxPlaceCount: number, readonly minDepth: number | null = null) {}
  doPlace(genDepth: number): boolean {
    return (this.maxPlaceCount === 0 || this.placeCount < this.maxPlaceCount) && (this.minDepth === null || genDepth > this.minDepth);
  }
  isValid(): boolean {
    return this.maxPlaceCount === 0 || this.placeCount < this.maxPlaceCount;
  }
}

function pieceWeights(): PieceWeight[] {
  return [
    new PieceWeight(Straight.createPiece, 40, 0),
    new PieceWeight(PrisonHall.createPiece, 5, 5),
    new PieceWeight(LeftTurn.createPiece, 20, 0),
    new PieceWeight(RightTurn.createPiece, 20, 0),
    new PieceWeight(RoomCrossing.createPiece, 10, 6),
    new PieceWeight(StraightStairsDown.createPiece, 5, 5),
    new PieceWeight(StairsDown.createPiece, 5, 5),
    new PieceWeight(FiveCrossing.createPiece, 5, 4),
    new PieceWeight(ChestCorridor.createPiece, 5, 4),
    new PieceWeight(Library.createPiece, 10, 2, 4),
    new PieceWeight(PortalRoom.createPiece, 20, 1, 5),
  ];
}

/** vanilla updatePieceWeight: the total weight, and whether any piece with a limit can still be placed */
function updatePieceWeight(s: StartPiece): boolean {
  let limited = false;
  s.totalWeight = 0;
  for (const w of s.weights) {
    if (w.maxPlaceCount > 0 && w.placeCount < w.maxPlaceCount) limited = true;
    s.totalWeight += w.weight;
  }
  return limited;
}

/**
 * vanilla generatePieceFromSmallDoor: the piece a door leads to. The start's five-way crossing first if it's owed
 * one; else five weighted draws (not the same kind twice running; a kind that doesn't fit passes the draw on to the
 * kinds after it); failing all that, a short filler corridor up to whatever's in the way
 */
function generatePieceFromSmallDoor(start: StartPiece, pieces: PieceList, r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number): StrongholdPiece | null {
  if (!updatePieceWeight(start)) return null;
  if (start.imposed) {
    const p = start.imposed(pieces, r, x, y, z, d, genDepth);
    start.imposed = null;
    if (p) return p;
  }
  for (let k = 0; k < 5; k++) {
    let j = r.nextInt(start.totalWeight);
    for (const w of start.weights) {
      j -= w.weight;
      if (j >= 0) continue;
      if (!w.doPlace(genDepth) || w === start.previousPiece) break;
      const p = w.create(pieces, r, x, y, z, d, genDepth);
      if (!p) continue;
      w.placeCount++;
      start.previousPiece = w;
      if (!w.isValid()) start.weights.splice(start.weights.indexOf(w), 1);
      return p;
    }
  }
  const box = FillerCorridor.findPieceBox(pieces, x, y, z, d);
  return box && box.minY > 1 ? new FillerCorridor(genDepth, box, d) : null;
}

/** vanilla generateAndAddPiece: no deeper than 50, no further than 112 blocks from the start */
function generateAndAddPiece(start: StartPiece, pieces: PieceList, r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number): StructurePiece | null {
  if (genDepth > MAX_DEPTH) return null;
  if (Math.abs(x - start.box.minX) > MAX_REACH || Math.abs(z - start.box.minZ) > MAX_REACH) return null;
  const p = generatePieceFromSmallDoor(start, pieces, r, x, y, z, d, genDepth + 1);
  if (p) {
    pieces.add(p);
    start.pendingChildren.push(p);
  }
  return p;
}

// ---------------------------------------------------------------------------------------------------------------
// Pieces

type Door = 'opening' | 'wood_door' | 'grates' | 'iron_door';

/** vanilla StrongholdPieces.StrongholdPiece */
export abstract class StrongholdPiece extends StructurePiece {
  entryDoor: Door = 'opening';

  constructor(genDepth: number, box: BoundingBox, d: Dir4) {
    super(genDepth, box);
    this.setOrientation(d);
  }

  addChildren(_start: StructurePiece, _pieces: PieceList, _r: Rand): void {}

  /** vanilla randomSmallDoor: 2 in 5 open, then a wooden door, bars or an iron door */
  protected randomSmallDoor(r: Rand): Door {
    switch (r.nextInt(5)) {
      case 2: return 'wood_door';
      case 3: return 'grates';
      case 4: return 'iron_door';
      default: return 'opening';
    }
  }

  protected fill(ctx: GenContext, chunk: BoundingBox, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, st: number): void {
    this.generateBox(ctx, chunk, x0, y0, z0, x1, y1, z1, st, st, false);
  }

  /**
   * vanilla generateBox with the SmoothStoneSelector: stone bricks on the box's faces, air inside. `checkAir`
   * (vanilla's alwaysReplace): only where there's something already, which is never outside the chunk
   */
  protected stoneBox(ctx: GenContext, chunk: BoundingBox, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, checkAir: boolean, r: Rand): void {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) {
          if (checkAir && isAir(this.getBlock(ctx, x, y, z, chunk))) continue;
          const wall = y === y0 || y === y1 || x === x0 || x === x1 || z === z0 || z === z1;
          this.placeBlock(ctx, smoothStone(r, wall), x, y, z, chunk);
        }
  }

  /** vanilla generateSmallDoor: a 3 x 3 doorway at (x, y, z) */
  protected generateSmallDoor(ctx: GenContext, chunk: BoundingBox, type: Door, x: number, y: number, z: number): void {
    const k = K();
    if (type === 'opening') {
      this.fill(ctx, chunk, x, y, z, x + 2, y + 2, z, k.AIR);
      return;
    }
    if (type === 'grates') {
      this.placeBlock(ctx, k.AIR, x + 1, y, z, chunk);
      this.placeBlock(ctx, k.AIR, x + 1, y + 1, z, chunk);
      this.placeBlock(ctx, bars(false, false, false, true), x, y, z, chunk);
      this.placeBlock(ctx, bars(false, false, false, true), x, y + 1, z, chunk);
      this.placeBlock(ctx, bars(false, true, false, true), x, y + 2, z, chunk);
      this.placeBlock(ctx, bars(false, true, false, true), x + 1, y + 2, z, chunk);
      this.placeBlock(ctx, bars(false, true, false, true), x + 2, y + 2, z, chunk);
      this.placeBlock(ctx, bars(false, true, false, false), x + 2, y + 1, z, chunk);
      this.placeBlock(ctx, bars(false, true, false, false), x + 2, y, z, chunk);
      return;
    }
    // a stone brick frame round a door (an iron one with a button either side)
    const SB = k.STONE_BRICKS;
    this.placeBlock(ctx, SB, x, y, z, chunk);
    this.placeBlock(ctx, SB, x, y + 1, z, chunk);
    this.placeBlock(ctx, SB, x, y + 2, z, chunk);
    this.placeBlock(ctx, SB, x + 1, y + 2, z, chunk);
    this.placeBlock(ctx, SB, x + 2, y + 2, z, chunk);
    this.placeBlock(ctx, SB, x + 2, y + 1, z, chunk);
    this.placeBlock(ctx, SB, x + 2, y, z, chunk);
    const door = type === 'wood_door' ? 'oak_door' : 'iron_door';
    this.placeBlock(ctx, S(door), x + 1, y, z, chunk);
    this.placeBlock(ctx, S(door, { half: 'upper' }), x + 1, y + 1, z, chunk);
    if (type === 'iron_door') {
      this.placeBlock(ctx, S('stone_button', { facing: 'north' }), x + 2, y + 1, z + 1, chunk);
      this.placeBlock(ctx, S('stone_button', { facing: 'south' }), x + 2, y + 1, z - 1, chunk);
    }
  }

  // vanilla generateSmallDoorChildForward / Left / Right: the piece through a doorway ahead, to the left, to the right
  protected childForward(start: StartPiece, pieces: PieceList, r: Rand, indexOffset: number, heightOffset: number): StructurePiece | null {
    const b = this.box, d = this.orientation!;
    switch (d) {
      case 'north': return generateAndAddPiece(start, pieces, r, b.minX + indexOffset, b.minY + heightOffset, b.minZ - 1, d, this.genDepth);
      case 'south': return generateAndAddPiece(start, pieces, r, b.minX + indexOffset, b.minY + heightOffset, b.maxZ + 1, d, this.genDepth);
      case 'west': return generateAndAddPiece(start, pieces, r, b.minX - 1, b.minY + heightOffset, b.minZ + indexOffset, d, this.genDepth);
      case 'east': return generateAndAddPiece(start, pieces, r, b.maxX + 1, b.minY + heightOffset, b.minZ + indexOffset, d, this.genDepth);
    }
  }
  protected childLeft(start: StartPiece, pieces: PieceList, r: Rand, heightOffset: number, indexOffset: number): StructurePiece | null {
    const b = this.box;
    switch (this.orientation!) {
      case 'north': case 'south': return generateAndAddPiece(start, pieces, r, b.minX - 1, b.minY + heightOffset, b.minZ + indexOffset, 'west', this.genDepth);
      case 'west': case 'east': return generateAndAddPiece(start, pieces, r, b.minX + indexOffset, b.minY + heightOffset, b.minZ - 1, 'north', this.genDepth);
    }
  }
  protected childRight(start: StartPiece, pieces: PieceList, r: Rand, heightOffset: number, indexOffset: number): StructurePiece | null {
    const b = this.box;
    switch (this.orientation!) {
      case 'north': case 'south': return generateAndAddPiece(start, pieces, r, b.maxX + 1, b.minY + heightOffset, b.minZ + indexOffset, 'east', this.genDepth);
      case 'west': case 'east': return generateAndAddPiece(start, pieces, r, b.minX + indexOffset, b.minY + heightOffset, b.maxZ + 1, 'south', this.genDepth);
    }
  }

  /** the piece's size in its own terms (width across, depth along) */
  protected get width(): number {
    return this.orientation === 'east' || this.orientation === 'west' ? this.box.zSpan : this.box.xSpan;
  }
  protected get depth(): number {
    return this.orientation === 'east' || this.orientation === 'west' ? this.box.xSpan : this.box.zSpan;
  }

  /** the local position of a world block (the inverse of worldX/worldZ) */
  protected localXZ(wx: number, wz: number): [number, number] {
    const b = this.box;
    switch (this.orientation) {
      case 'north': return [wx - b.minX, b.maxZ - wz];
      case 'south': return [wx - b.minX, wz - b.minZ];
      case 'west': return [wz - b.minZ, b.maxX - wx];
      default: return [wz - b.minZ, wx - b.minX];
    }
  }

  /** whether the plan has something solid at a local position (the chest's view past the edge of the chunk): the walls */
  protected solidHint(x: number, y: number, z: number): boolean {
    return x <= 0 || x >= this.width - 1 || z <= 0 || z >= this.depth - 1 || y <= 0 || y >= this.box.ySpan - 1;
  }

  /**
   * vanilla createChest with StructurePiece.reorient: a chest backed by exactly one solid block faces away from it;
   * otherwise it starts facing north and turns (about, clockwise, about) while a solid block is in front
   */
  protected createChest(ctx: GenContext, chunk: BoundingBox, r: Rand, x: number, y: number, z: number, loot: string): void {
    const wx = this.worldX(x, z), wy = this.worldY(y), wz = this.worldZ(x, z);
    if (!chunk.isInside(wx, wy, wz) || blockOf(ctx.getOrAir(wx, wy, wz)).name === 'chest') return;
    const solid = (dx: number, dz: number): boolean => {
      const st = ctx.get(wx + dx, wy, wz + dz);
      if (st >= 0) return solidRender(st);
      const [lx, lz] = this.localXZ(wx + dx, wz + dz);
      return this.solidHint(lx, y, lz);
    };
    const DIRS: [Dir4, number, number][] = [['north', 0, -1], ['east', 1, 0], ['south', 0, 1], ['west', -1, 0]];
    const OPP: Record<Dir4, Dir4> = { north: 'south', south: 'north', east: 'west', west: 'east' };
    const CW: Record<Dir4, Dir4> = { north: 'east', east: 'south', south: 'west', west: 'north' };
    let wall: Dir4 | null = null, nextToChest = false;
    for (const [d, dx, dz] of DIRS) {
      if (blockOf(Math.max(0, ctx.get(wx + dx, wy, wz + dz))).name === 'chest') {
        nextToChest = true;
        break;
      }
      if (!solid(dx, dz)) continue;
      if (wall === null) {
        wall = d;
        continue;
      }
      wall = null;
      break;
    }
    let facing: Dir4;
    // (beside another chest it keeps its default facing)
    if (nextToChest) facing = 'north';
    else if (wall !== null) facing = OPP[wall];
    else {
      const off = (d: Dir4) => DIRS.find((e) => e[0] === d)!;
      const blocked = (d: Dir4) => solid(off(d)[1], off(d)[2]);
      facing = 'north';
      if (blocked(facing)) facing = OPP[facing];
      if (blocked(facing)) facing = CW[facing];
      if (blocked(facing)) facing = OPP[facing];
    }
    const chest = K().CHEST;
    ctx.set(wx, wy, wz, blockOf(chest).with(chest, 'facing', facing));
    ctx.blockEntities.push({ id: 'chest', x: wx, y: wy, z: wz, items: [], data: { lootTable: loot, lootSeed: Number(BigInt.asUintN(32, (r as JRand).j.nextLong())) } });
  }
}

/** a 5 x 5 x 7 hall, maybe with openings to either side and a torch or two (vanilla Straight) */
class Straight extends StrongholdPiece {
  private readonly leftChild: boolean;
  private readonly rightChild: boolean;
  constructor(genDepth: number, r: Rand, box: BoundingBox, d: Dir4) {
    super(genDepth, box, d);
    this.entryDoor = this.randomSmallDoor(r);
    this.leftChild = r.nextInt(2) === 0;
    this.rightChild = r.nextInt(2) === 0;
  }
  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    const s = start as StartPiece;
    this.childForward(s, pieces, r, 1, 1);
    if (this.leftChild) this.childLeft(s, pieces, r, 1, 2);
    if (this.rightChild) this.childRight(s, pieces, r, 1, 2);
  }
  static createPiece: Factory = (pieces, r, x, y, z, d, genDepth) => {
    const box = orientBox(x, y, z, -1, -1, 0, 5, 5, 7, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new Straight(genDepth, r, box, d) : null;
  };
  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    this.stoneBox(ctx, chunk, 0, 0, 0, 4, 4, 6, true, r);
    this.generateSmallDoor(ctx, chunk, this.entryDoor, 1, 1, 0);
    this.generateSmallDoor(ctx, chunk, 'opening', 1, 1, 6);
    const east = wallTorch('east'), west = wallTorch('west');
    this.maybeGenerateBlock(ctx, chunk, r, F01, 1, 2, 1, east);
    this.maybeGenerateBlock(ctx, chunk, r, F01, 3, 2, 1, west);
    this.maybeGenerateBlock(ctx, chunk, r, F01, 1, 2, 5, east);
    this.maybeGenerateBlock(ctx, chunk, r, F01, 3, 2, 5, west);
    if (this.leftChild) this.fill(ctx, chunk, 0, 1, 2, 0, 3, 4, K().AIR);
    if (this.rightChild) this.fill(ctx, chunk, 4, 1, 2, 4, 3, 4, K().AIR);
  }
}

/** a hall with two barred cells off it, each with an iron door (vanilla PrisonHall) */
class PrisonHall extends StrongholdPiece {
  constructor(genDepth: number, r: Rand, box: BoundingBox, d: Dir4) {
    super(genDepth, box, d);
    this.entryDoor = this.randomSmallDoor(r);
  }
  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    this.childForward(start as StartPiece, pieces, r, 1, 1);
  }
  static createPiece: Factory = (pieces, r, x, y, z, d, genDepth) => {
    const box = orientBox(x, y, z, -1, -1, 0, 9, 5, 11, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new PrisonHall(genDepth, r, box, d) : null;
  };
  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    this.stoneBox(ctx, chunk, 0, 0, 0, 8, 4, 10, true, r);
    this.generateSmallDoor(ctx, chunk, this.entryDoor, 1, 1, 0);
    this.fill(ctx, chunk, 1, 1, 10, 3, 3, 10, K().AIR);
    this.stoneBox(ctx, chunk, 4, 1, 1, 4, 3, 1, false, r);
    this.stoneBox(ctx, chunk, 4, 1, 3, 4, 3, 3, false, r);
    this.stoneBox(ctx, chunk, 4, 1, 7, 4, 3, 7, false, r);
    this.stoneBox(ctx, chunk, 4, 1, 9, 4, 3, 9, false, r);
    const ns = bars(true, false, true, false), nse = bars(true, true, true, false), we = bars(false, true, false, true);
    for (let i = 1; i <= 3; i++) {
      this.placeBlock(ctx, ns, 4, i, 4, chunk);
      this.placeBlock(ctx, nse, 4, i, 5, chunk);
      this.placeBlock(ctx, ns, 4, i, 6, chunk);
      this.placeBlock(ctx, we, 5, i, 5, chunk);
      this.placeBlock(ctx, we, 6, i, 5, chunk);
      this.placeBlock(ctx, we, 7, i, 5, chunk);
    }
    this.placeBlock(ctx, ns, 4, 3, 2, chunk);
    this.placeBlock(ctx, ns, 4, 3, 8, chunk);
    const lower = S('iron_door', { facing: 'west' }), upper = S('iron_door', { facing: 'west', half: 'upper' });
    this.placeBlock(ctx, lower, 4, 1, 2, chunk);
    this.placeBlock(ctx, upper, 4, 2, 2, chunk);
    this.placeBlock(ctx, lower, 4, 1, 8, chunk);
    this.placeBlock(ctx, upper, 4, 2, 8, chunk);
  }
}

/** a 5 x 5 x 5 corner (vanilla LeftTurn, RightTurn: which side the way on is depends on the heading, as vanilla has it) */
class Turn extends StrongholdPiece {
  constructor(genDepth: number, r: Rand, box: BoundingBox, d: Dir4, readonly left: boolean) {
    super(genDepth, box, d);
    this.entryDoor = this.randomSmallDoor(r);
  }
  /** the turn's way on is on the piece's own left (x = 0) */
  private get exitLeft(): boolean {
    const nOrE = this.orientation === 'north' || this.orientation === 'east';
    return this.left === nOrE;
  }
  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    if (this.exitLeft) this.childLeft(start as StartPiece, pieces, r, 1, 1);
    else this.childRight(start as StartPiece, pieces, r, 1, 1);
  }
  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    this.stoneBox(ctx, chunk, 0, 0, 0, 4, 4, 4, true, r);
    this.generateSmallDoor(ctx, chunk, this.entryDoor, 1, 1, 0);
    if (this.exitLeft) this.fill(ctx, chunk, 0, 1, 1, 0, 3, 3, K().AIR);
    else this.fill(ctx, chunk, 4, 1, 1, 4, 3, 3, K().AIR);
  }
}
class LeftTurn extends Turn {
  static createPiece: Factory = (pieces, r, x, y, z, d, genDepth) => {
    const box = orientBox(x, y, z, -1, -1, 0, 5, 5, 5, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new LeftTurn(genDepth, r, box, d, true) : null;
  };
}
class RightTurn extends Turn {
  static createPiece: Factory = (pieces, r, x, y, z, d, genDepth) => {
    const box = orientBox(x, y, z, -1, -1, 0, 5, 5, 5, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new RightTurn(genDepth, r, box, d, false) : null;
  };
}

/**
 * an 11 x 7 x 11 room with ways on in three directions (vanilla RoomCrossing), in one of four styles: a torch-lit
 * pillar ringed with slabs, a fountain, a storeroom with a gallery, a ladder and a chest, or nothing at all
 */
class RoomCrossing extends StrongholdPiece {
  readonly type: number;
  constructor(genDepth: number, r: Rand, box: BoundingBox, d: Dir4) {
    super(genDepth, box, d);
    this.entryDoor = this.randomSmallDoor(r);
    this.type = r.nextInt(5);
  }
  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    const s = start as StartPiece;
    this.childForward(s, pieces, r, 4, 1);
    this.childLeft(s, pieces, r, 1, 4);
    this.childRight(s, pieces, r, 1, 4);
  }
  static createPiece: Factory = (pieces, r, x, y, z, d, genDepth) => {
    const box = orientBox(x, y, z, -4, -1, 0, 11, 7, 11, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new RoomCrossing(genDepth, r, box, d) : null;
  };
  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    const k = K();
    this.stoneBox(ctx, chunk, 0, 0, 0, 10, 6, 10, true, r);
    this.generateSmallDoor(ctx, chunk, this.entryDoor, 4, 1, 0);
    this.fill(ctx, chunk, 4, 1, 10, 6, 3, 10, k.AIR);
    this.fill(ctx, chunk, 0, 1, 4, 0, 3, 6, k.AIR);
    this.fill(ctx, chunk, 10, 1, 4, 10, 3, 6, k.AIR);
    const put = (st: number, x: number, y: number, z: number) => this.placeBlock(ctx, st, x, y, z, chunk);
    switch (this.type) {
      case 0: {
        // a pillar with a torch on each side, ringed with smooth stone slabs
        for (let y = 1; y <= 3; y++) put(k.STONE_BRICKS, 5, y, 5);
        put(wallTorch('west'), 4, 3, 5);
        put(wallTorch('east'), 6, 3, 5);
        put(wallTorch('south'), 5, 3, 4);
        put(wallTorch('north'), 5, 3, 6);
        for (const [x, z] of [[4, 4], [4, 5], [4, 6], [6, 4], [6, 5], [6, 6], [5, 4], [5, 6]]) put(k.SMOOTH_SLAB, x, 1, z);
        break;
      }
      case 1: {
        // a fountain: a spring on a pillar in a stone brick ring
        for (let i = 0; i < 5; i++) {
          put(k.STONE_BRICKS, 3, 1, 3 + i);
          put(k.STONE_BRICKS, 7, 1, 3 + i);
          put(k.STONE_BRICKS, 3 + i, 1, 3);
          put(k.STONE_BRICKS, 3 + i, 1, 7);
        }
        for (let y = 1; y <= 3; y++) put(k.STONE_BRICKS, 5, y, 5);
        put(k.WATER, 5, 4, 5);
        break;
      }
      case 2: {
        // a storeroom: a cobblestone gallery round the walls on plank floors, a cobblestone pillar cluster, a
        // ladder up and a chest
        for (let j = 1; j <= 9; j++) {
          put(k.COBBLESTONE, 1, 3, j);
          put(k.COBBLESTONE, 9, 3, j);
        }
        for (let j = 1; j <= 9; j++) {
          put(k.COBBLESTONE, j, 3, 1);
          put(k.COBBLESTONE, j, 3, 9);
        }
        put(k.COBBLESTONE, 5, 1, 4);
        put(k.COBBLESTONE, 5, 1, 6);
        put(k.COBBLESTONE, 5, 3, 4);
        put(k.COBBLESTONE, 5, 3, 6);
        put(k.COBBLESTONE, 4, 1, 5);
        put(k.COBBLESTONE, 6, 1, 5);
        put(k.COBBLESTONE, 4, 3, 5);
        put(k.COBBLESTONE, 6, 3, 5);
        for (let y = 1; y <= 3; y++) {
          put(k.COBBLESTONE, 4, y, 4);
          put(k.COBBLESTONE, 6, y, 4);
          put(k.COBBLESTONE, 4, y, 6);
          put(k.COBBLESTONE, 6, y, 6);
        }
        put(wallTorch('north'), 5, 3, 5);
        for (let z = 2; z <= 8; z++) {
          put(k.PLANKS, 2, 3, z);
          put(k.PLANKS, 3, 3, z);
          if (z <= 3 || z >= 7) {
            put(k.PLANKS, 4, 3, z);
            put(k.PLANKS, 5, 3, z);
            put(k.PLANKS, 6, 3, z);
          }
          put(k.PLANKS, 7, 3, z);
          put(k.PLANKS, 8, 3, z);
        }
        const ladder = S('ladder', { facing: 'west' });
        put(ladder, 9, 1, 3);
        put(ladder, 9, 2, 3);
        put(ladder, 9, 3, 3);
        this.createChest(ctx, chunk, r, 3, 4, 8, LOOT_CROSSING);
        break;
      }
    }
  }
}

/** stairs straight down, 7 blocks over 6 (vanilla StraightStairsDown) */
class StraightStairsDown extends StrongholdPiece {
  constructor(genDepth: number, r: Rand, box: BoundingBox, d: Dir4) {
    super(genDepth, box, d);
    this.entryDoor = this.randomSmallDoor(r);
  }
  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    this.childForward(start as StartPiece, pieces, r, 1, 1);
  }
  static createPiece: Factory = (pieces, r, x, y, z, d, genDepth) => {
    const box = orientBox(x, y, z, -1, -7, 0, 5, 11, 8, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new StraightStairsDown(genDepth, r, box, d) : null;
  };
  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    this.stoneBox(ctx, chunk, 0, 0, 0, 4, 10, 7, true, r);
    this.generateSmallDoor(ctx, chunk, this.entryDoor, 1, 7, 0);
    this.generateSmallDoor(ctx, chunk, 'opening', 1, 1, 7);
    const st = stairs('cobblestone_stairs', 'south'), SB = K().STONE_BRICKS;
    for (let i = 0; i < 6; i++) {
      for (let x = 1; x <= 3; x++) this.placeBlock(ctx, st, x, 6 - i, 1 + i, chunk);
      if (i < 5) for (let x = 1; x <= 3; x++) this.placeBlock(ctx, SB, x, 5 - i, 1 + i, chunk);
    }
  }
}

/** a spiral staircase down a 5 x 11 x 5 shaft (vanilla StairsDown); the stronghold's first piece is one */
class StairsDown extends StrongholdPiece {
  constructor(genDepth: number, r: Rand | null, box: BoundingBox, d: Dir4, readonly isSource = false) {
    super(genDepth, box, d);
    this.entryDoor = r ? this.randomSmallDoor(r) : 'opening';
  }
  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    // (vanilla: the start's staircase leads into a five-way crossing)
    if (this.isSource) (start as StartPiece).imposed = FiveCrossing.createPiece;
    this.childForward(start as StartPiece, pieces, r, 1, 1);
  }
  static createPiece: Factory = (pieces, r, x, y, z, d, genDepth) => {
    const box = orientBox(x, y, z, -1, -7, 0, 5, 11, 5, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new StairsDown(genDepth, r, box, d) : null;
  };
  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    const k = K(), SB = k.STONE_BRICKS, SL = k.SMOOTH_SLAB;
    this.stoneBox(ctx, chunk, 0, 0, 0, 4, 10, 4, true, r);
    this.generateSmallDoor(ctx, chunk, this.entryDoor, 1, 7, 0);
    this.generateSmallDoor(ctx, chunk, 'opening', 1, 1, 4);
    const steps: [number, number, number, number][] = [
      [SB, 2, 6, 1], [SB, 1, 5, 1], [SL, 1, 6, 1], [SB, 1, 5, 2], [SB, 1, 4, 3], [SL, 1, 5, 3], [SB, 2, 4, 3], [SB, 3, 3, 3], [SL, 3, 4, 3],
      [SB, 3, 3, 2], [SB, 3, 2, 1], [SL, 3, 3, 1], [SB, 2, 2, 1], [SB, 1, 1, 1], [SL, 1, 2, 1], [SB, 1, 1, 2], [SL, 1, 1, 3],
    ];
    for (const [st, x, y, z] of steps) this.placeBlock(ctx, st, x, y, z, chunk);
  }
}

/** vanilla StrongholdPieces.StartPiece: the spiral staircase down from y 64, facing a random way */
class StartPiece extends StairsDown {
  previousPiece: PieceWeight | null = null;
  portalRoomPiece: PortalRoom | null = null;
  readonly pendingChildren: StructurePiece[] = [];
  readonly weights = pieceWeights();
  /** vanilla imposedPiece: what the next door must lead to */
  imposed: Factory | null = null;
  totalWeight = 0;
  constructor(r: Rand, x: number, z: number) {
    // (vanilla makeBoundingBox(x, 64, z, facing, 5, 11, 5): the same either way round)
    super(0, null, new BoundingBox(x, 64, z, x + 4, 74, z + 4), HORIZONTAL[r.nextInt(4)], true);
  }
}

/**
 * a 10 x 9 x 11 hall where five ways meet (vanilla FiveCrossing): the way on straight ahead, low down, and ways
 * off to either side, low and high, on a split-level floor with a torch
 */
class FiveCrossing extends StrongholdPiece {
  private readonly leftLow: boolean;
  private readonly leftHigh: boolean;
  private readonly rightLow: boolean;
  private readonly rightHigh: boolean;
  constructor(genDepth: number, r: Rand, box: BoundingBox, d: Dir4) {
    super(genDepth, box, d);
    this.entryDoor = this.randomSmallDoor(r);
    this.leftLow = r.nextBool();
    this.leftHigh = r.nextBool();
    this.rightLow = r.nextBool();
    this.rightHigh = r.nextInt(3) > 0;
  }
  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    const s = start as StartPiece;
    let i = 3, j = 5;
    // (vanilla: heading west or north, the local depth runs against the world axis the side doors are offset
    // along, so the heights are swapped to match; the openings aren't, so when only one of a side's two doors is
    // open, the piece behind it is walled off and the opening faces rock)
    if (this.orientation === 'west' || this.orientation === 'north') {
      i = 8 - i;
      j = 8 - j;
    }
    this.childForward(s, pieces, r, 5, 1);
    if (this.leftLow) this.childLeft(s, pieces, r, i, 1);
    if (this.leftHigh) this.childLeft(s, pieces, r, j, 7);
    if (this.rightLow) this.childRight(s, pieces, r, i, 1);
    if (this.rightHigh) this.childRight(s, pieces, r, j, 7);
  }
  static createPiece: Factory = (pieces, r, x, y, z, d, genDepth) => {
    const box = orientBox(x, y, z, -4, -3, 0, 10, 9, 11, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new FiveCrossing(genDepth, r, box, d) : null;
  };
  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    const k = K(), AIR = k.AIR, SL = k.SMOOTH_SLAB;
    this.stoneBox(ctx, chunk, 0, 0, 0, 9, 8, 10, true, r);
    this.generateSmallDoor(ctx, chunk, this.entryDoor, 4, 3, 0);
    if (this.leftLow) this.fill(ctx, chunk, 0, 3, 1, 0, 5, 3, AIR);
    if (this.rightLow) this.fill(ctx, chunk, 9, 3, 1, 9, 5, 3, AIR);
    if (this.leftHigh) this.fill(ctx, chunk, 0, 5, 7, 0, 7, 9, AIR);
    if (this.rightHigh) this.fill(ctx, chunk, 9, 5, 7, 9, 7, 9, AIR);
    this.fill(ctx, chunk, 5, 1, 10, 7, 3, 10, AIR);
    this.stoneBox(ctx, chunk, 1, 2, 1, 8, 2, 6, false, r);
    this.stoneBox(ctx, chunk, 4, 1, 5, 4, 4, 9, false, r);
    this.stoneBox(ctx, chunk, 8, 1, 5, 8, 4, 9, false, r);
    this.stoneBox(ctx, chunk, 1, 4, 7, 3, 4, 9, false, r);
    this.stoneBox(ctx, chunk, 1, 3, 5, 3, 3, 6, false, r);
    this.fill(ctx, chunk, 1, 3, 4, 3, 3, 4, SL);
    this.fill(ctx, chunk, 1, 4, 6, 3, 4, 6, SL);
    this.stoneBox(ctx, chunk, 5, 1, 7, 7, 1, 8, false, r);
    this.fill(ctx, chunk, 5, 1, 9, 7, 1, 9, SL);
    this.fill(ctx, chunk, 5, 2, 7, 7, 2, 7, SL);
    this.fill(ctx, chunk, 4, 5, 7, 4, 5, 9, SL);
    this.fill(ctx, chunk, 8, 5, 7, 8, 5, 9, SL);
    this.fill(ctx, chunk, 5, 5, 7, 7, 5, 9, k.SMOOTH_DOUBLE);
    this.placeBlock(ctx, wallTorch('south'), 6, 5, 6, chunk);
  }
}

/** a 5 x 5 x 7 hall with a chest on a stone brick altar, slabs round it (vanilla ChestCorridor) */
class ChestCorridor extends StrongholdPiece {
  constructor(genDepth: number, r: Rand, box: BoundingBox, d: Dir4) {
    super(genDepth, box, d);
    this.entryDoor = this.randomSmallDoor(r);
  }
  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    this.childForward(start as StartPiece, pieces, r, 1, 1);
  }
  static createPiece: Factory = (pieces, r, x, y, z, d, genDepth) => {
    const box = orientBox(x, y, z, -1, -1, 0, 5, 5, 7, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new ChestCorridor(genDepth, r, box, d) : null;
  };
  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    const k = K();
    this.stoneBox(ctx, chunk, 0, 0, 0, 4, 4, 6, true, r);
    this.generateSmallDoor(ctx, chunk, this.entryDoor, 1, 1, 0);
    this.generateSmallDoor(ctx, chunk, 'opening', 1, 1, 6);
    this.fill(ctx, chunk, 3, 1, 2, 3, 1, 4, k.STONE_BRICKS);
    this.placeBlock(ctx, k.BRICK_SLAB, 3, 1, 1, chunk);
    this.placeBlock(ctx, k.BRICK_SLAB, 3, 1, 5, chunk);
    this.placeBlock(ctx, k.BRICK_SLAB, 3, 2, 2, chunk);
    this.placeBlock(ctx, k.BRICK_SLAB, 3, 2, 4, chunk);
    for (let i = 2; i <= 4; i++) this.placeBlock(ctx, k.BRICK_SLAB, 2, 1, i, chunk);
    this.createChest(ctx, chunk, r, 3, 2, 3, LOOT_CORRIDOR);
  }
}

/**
 * a library (vanilla Library): 14 x 11 x 15 with a gallery, a ladder up to it and a chandelier, or 6 high without
 * them when there isn't room; shelves round the walls between oak pillars, rows of shelves down the middle, cobwebs,
 * torches, and a chest on the shelves (and another up in the gallery)
 */
class Library extends StrongholdPiece {
  readonly isTall: boolean;
  constructor(genDepth: number, r: Rand, box: BoundingBox, d: Dir4) {
    super(genDepth, box, d);
    this.entryDoor = this.randomSmallDoor(r);
    this.isTall = box.ySpan > 6;
  }
  static createPiece: Factory = (pieces, r, x, y, z, d, genDepth) => {
    let box = orientBox(x, y, z, -4, -1, 0, 14, 11, 15, d);
    if (!isOkBox(box) || pieces.findCollision(box)) {
      box = orientBox(x, y, z, -4, -1, 0, 14, 6, 15, d);
      if (!isOkBox(box) || pieces.findCollision(box)) return null;
    }
    return new Library(genDepth, r, box, d);
  };
  /** the shelves and planks (for the chests' view past the chunk's edge) */
  protected override solidHint(x: number, y: number, z: number): boolean {
    if (super.solidHint(x, y, z)) return true;
    if ((x === 1 || x === 12) && z >= 1 && z <= 13 && ((y >= 1 && y <= 4) || (this.isTall && y >= 6 && y <= 9))) return true;
    if (y >= 1 && y <= 3 && z >= 3 && z <= 11 && z % 2 === 1 && x >= 3 && x <= 10 && x !== 5 && x !== 8) return true;
    return false;
  }
  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    const k = K(), PL = k.PLANKS, BS = k.BOOKSHELF;
    const top = this.isTall ? 11 : 6;
    this.stoneBox(ctx, chunk, 0, 0, 0, 13, top - 1, 14, true, r);
    this.generateSmallDoor(ctx, chunk, this.entryDoor, 4, 1, 0);
    this.generateMaybeBox(ctx, chunk, r, F007, 2, 1, 1, 11, 4, 13, k.COBWEB, k.COBWEB, false, false);
    for (let l = 1; l <= 13; l++) {
      if ((l - 1) % 4 === 0) {
        this.fill(ctx, chunk, 1, 1, l, 1, 4, l, PL);
        this.fill(ctx, chunk, 12, 1, l, 12, 4, l, PL);
        this.placeBlock(ctx, wallTorch('east'), 2, 3, l, chunk);
        this.placeBlock(ctx, wallTorch('west'), 11, 3, l, chunk);
        if (this.isTall) {
          this.fill(ctx, chunk, 1, 6, l, 1, 9, l, PL);
          this.fill(ctx, chunk, 12, 6, l, 12, 9, l, PL);
        }
      } else {
        this.fill(ctx, chunk, 1, 1, l, 1, 4, l, BS);
        this.fill(ctx, chunk, 12, 1, l, 12, 4, l, BS);
        if (this.isTall) {
          this.fill(ctx, chunk, 1, 6, l, 1, 9, l, BS);
          this.fill(ctx, chunk, 12, 6, l, 12, 9, l, BS);
        }
      }
    }
    for (let l = 3; l < 12; l += 2) {
      this.fill(ctx, chunk, 3, 1, l, 4, 3, l, BS);
      this.fill(ctx, chunk, 6, 1, l, 7, 3, l, BS);
      this.fill(ctx, chunk, 9, 1, l, 10, 3, l, BS);
    }
    if (this.isTall) {
      // the gallery floor, its railing, the ladder up and the chandelier
      this.fill(ctx, chunk, 1, 5, 1, 3, 5, 13, PL);
      this.fill(ctx, chunk, 10, 5, 1, 12, 5, 13, PL);
      this.fill(ctx, chunk, 4, 5, 1, 9, 5, 2, PL);
      this.fill(ctx, chunk, 4, 5, 12, 9, 5, 13, PL);
      this.placeBlock(ctx, PL, 9, 5, 11, chunk);
      this.placeBlock(ctx, PL, 8, 5, 11, chunk);
      this.placeBlock(ctx, PL, 9, 5, 10, chunk);
      const we = fence(false, true, false, true), ns = fence(true, false, true, false);
      this.fill(ctx, chunk, 3, 6, 3, 3, 6, 11, ns);
      this.fill(ctx, chunk, 10, 6, 3, 10, 6, 9, ns);
      this.fill(ctx, chunk, 4, 6, 2, 9, 6, 2, we);
      this.fill(ctx, chunk, 4, 6, 12, 7, 6, 12, we);
      this.placeBlock(ctx, fence(true, true, false, false), 3, 6, 2, chunk);
      this.placeBlock(ctx, fence(false, true, true, false), 3, 6, 12, chunk);
      this.placeBlock(ctx, fence(true, false, false, true), 10, 6, 2, chunk);
      for (let i = 0; i <= 2; i++) {
        this.placeBlock(ctx, fence(false, false, true, true), 8 + i, 6, 12 - i, chunk);
        if (i !== 2) this.placeBlock(ctx, fence(true, true, false, false), 8 + i, 6, 11 - i, chunk);
      }
      const ladder = S('ladder', { facing: 'south' });
      for (let y = 1; y <= 7; y++) this.placeBlock(ctx, ladder, 10, y, 13, chunk);
      const e = fence(false, true, false, false), w = fence(false, false, false, true);
      this.placeBlock(ctx, e, 6, 9, 7, chunk);
      this.placeBlock(ctx, w, 7, 9, 7, chunk);
      this.placeBlock(ctx, e, 6, 8, 7, chunk);
      this.placeBlock(ctx, w, 7, 8, 7, chunk);
      const all = fence(true, true, true, true);
      this.placeBlock(ctx, all, 6, 7, 7, chunk);
      this.placeBlock(ctx, all, 7, 7, 7, chunk);
      this.placeBlock(ctx, e, 5, 7, 7, chunk);
      this.placeBlock(ctx, w, 8, 7, 7, chunk);
      this.placeBlock(ctx, fence(true, true, false, false), 6, 7, 6, chunk);
      this.placeBlock(ctx, fence(false, true, true, false), 6, 7, 8, chunk);
      this.placeBlock(ctx, fence(true, false, false, true), 7, 7, 6, chunk);
      this.placeBlock(ctx, fence(false, false, true, true), 7, 7, 8, chunk);
      for (const [x, z] of [[5, 7], [8, 7], [6, 6], [6, 8], [7, 6], [7, 8]]) this.placeBlock(ctx, k.TORCH, x, 8, z, chunk);
    }
    this.createChest(ctx, chunk, r, 3, 3, 5, LOOT_LIBRARY);
    if (this.isTall) {
      this.placeBlock(ctx, k.AIR, 12, 9, 1, chunk);
      this.createChest(ctx, chunk, r, 12, 8, 1, LOOT_LIBRARY);
    }
  }
}

/**
 * the end portal room (vanilla PortalRoom): 11 x 8 x 16 behind barred double doors; lava either side of the way in,
 * stairs up to the portal with a silverfish spawner on the top step, the frames round a pit of lava, a ledge round
 * the walls and barred windows
 */
class PortalRoom extends StrongholdPiece {
  override addChildren(start: StructurePiece): void {
    (start as StartPiece).portalRoomPiece = this;
  }
  static createPiece: Factory = (pieces, _r, x, y, z, d, genDepth) => {
    const box = orientBox(x, y, z, -4, -1, 0, 11, 8, 16, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new PortalRoom(genDepth, box, d) : null;
  };
  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    const k = K();
    this.stoneBox(ctx, chunk, 0, 0, 0, 10, 7, 15, false, r);
    this.generateSmallDoor(ctx, chunk, 'grates', 4, 1, 0);
    const i = 6;
    this.stoneBox(ctx, chunk, 1, i, 1, 1, i, 14, false, r);
    this.stoneBox(ctx, chunk, 9, i, 1, 9, i, 14, false, r);
    this.stoneBox(ctx, chunk, 2, i, 1, 8, i, 2, false, r);
    this.stoneBox(ctx, chunk, 2, i, 14, 8, i, 14, false, r);
    this.stoneBox(ctx, chunk, 1, 1, 1, 2, 1, 4, false, r);
    this.stoneBox(ctx, chunk, 8, 1, 1, 9, 1, 4, false, r);
    this.fill(ctx, chunk, 1, 1, 1, 1, 1, 3, k.LAVA);
    this.fill(ctx, chunk, 9, 1, 1, 9, 1, 3, k.LAVA);
    this.stoneBox(ctx, chunk, 3, 1, 8, 7, 1, 12, false, r);
    this.fill(ctx, chunk, 4, 1, 9, 6, 1, 11, k.LAVA);
    const ns = bars(true, false, true, false), we = bars(false, true, false, true);
    for (let j = 3; j < 14; j += 2) {
      this.fill(ctx, chunk, 0, 3, j, 0, 4, j, ns);
      this.fill(ctx, chunk, 10, 3, j, 10, 4, j, ns);
    }
    for (let j = 2; j < 9; j += 2) this.fill(ctx, chunk, j, 3, 15, j, 4, 15, we);
    const st = stairs('stone_brick_stairs', 'north');
    this.stoneBox(ctx, chunk, 4, 1, 5, 6, 1, 7, false, r);
    this.stoneBox(ctx, chunk, 4, 2, 6, 6, 2, 7, false, r);
    this.stoneBox(ctx, chunk, 4, 3, 7, 6, 3, 7, false, r);
    for (let x = 4; x <= 6; x++) {
      this.placeBlock(ctx, st, x, 1, 4, chunk);
      this.placeBlock(ctx, st, x, 2, 5, chunk);
      this.placeBlock(ctx, st, x, 3, 6, chunk);
    }
    // each frame has a 10% chance of an eye already in it (vanilla draws these afresh for each chunk the room is in)
    const eyes: boolean[] = [];
    let all = true;
    for (let n = 0; n < 12; n++) {
      eyes[n] = r.nextFloat() > F09;
      all &&= eyes[n];
    }
    const frames: [Dir4, number, number][] = [
      ['north', 4, 8], ['north', 5, 8], ['north', 6, 8], ['south', 4, 12], ['south', 5, 12], ['south', 6, 12],
      ['east', 3, 9], ['east', 3, 10], ['east', 3, 11], ['west', 7, 9], ['west', 7, 10], ['west', 7, 11],
    ];
    frames.forEach(([f, x, z], n) => this.placeBlock(ctx, frame(f, eyes[n]), x, 3, z, chunk));
    if (all) {
      for (let x = 4; x <= 6; x++)
        for (let z = 9; z <= 11; z++) {
          this.placeBlock(ctx, k.PORTAL, x, 3, z, chunk);
          const wx = this.worldX(x, z), wy = this.worldY(3), wz = this.worldZ(x, z);
          if (chunk.isInside(wx, wy, wz)) ctx.blockEntities.push({ id: 'end_portal', x: wx, y: wy, z: wz, items: [] });
        }
    }
    const sx = this.worldX(5, 6), sy = this.worldY(3), sz = this.worldZ(5, 6);
    if (chunk.isInside(sx, sy, sz)) {
      ctx.set(sx, sy, sz, k.SPAWNER);
      ctx.blockEntities.push({ id: 'spawner', x: sx, y: sy, z: sz, items: [], data: { entity: 'silverfish', delay: 20 } });
    }
  }
}

/** a short bit of corridor (1 to 3 long) up to a piece in the way, when nothing else fits (vanilla FillerCorridor) */
class FillerCorridor extends StrongholdPiece {
  private readonly steps: number;
  constructor(genDepth: number, box: BoundingBox, d: Dir4) {
    super(genDepth, box, d);
    this.steps = d !== 'north' && d !== 'south' ? box.xSpan : box.zSpan;
  }
  /** vanilla findPieceBox: only up against a piece level with it, and only as far as that piece */
  static findPieceBox(pieces: PieceList, x: number, y: number, z: number, d: Dir4): BoundingBox | null {
    const box = orientBox(x, y, z, -1, -1, 0, 5, 5, 4, d);
    const p = pieces.findCollision(box);
    if (!p) return null;
    if (p.box.minY === box.minY) {
      for (let j = 2; j >= 1; j--) {
        if (!p.box.intersects(orientBox(x, y, z, -1, -1, 0, 5, 5, j, d))) return orientBox(x, y, z, -1, -1, 0, 5, 5, j + 1, d);
      }
    }
    return null;
  }
  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const k = K(), SB = k.STONE_BRICKS;
    for (let i = 0; i < this.steps; i++) {
      for (let x = 0; x <= 4; x++) this.placeBlock(ctx, SB, x, 0, i, chunk);
      for (let y = 1; y <= 3; y++) {
        this.placeBlock(ctx, SB, 0, y, i, chunk);
        for (let x = 1; x <= 3; x++) this.placeBlock(ctx, k.AIR, x, y, i, chunk);
        this.placeBlock(ctx, SB, 4, y, i, chunk);
      }
      for (let x = 0; x <= 4; x++) this.placeBlock(ctx, SB, x, 4, i, chunk);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Starts

export interface StrongholdStart {
  /** which of the 128 */
  index: number;
  /** the start chunk (vanilla locate reports its corner) */
  cx: number;
  cz: number;
  pieces: StrongholdPiece[];
  bounds: BoundingBox;
  portalRoom: StructurePiece;
}

/**
 * vanilla StrongholdStructure.generatePieces: grow the corridors from the start, taking pending pieces at random,
 * sink the lot below sea level; again with the next seed until it has a portal room
 */
export function generateStronghold(seed: bigint, index: number, cx: number, cz: number): StrongholdStart {
  for (let i = 0; ; i++) {
    const r = new JRand(largeFeatureRandom(BigInt.asIntN(64, seed + BigInt(i)), cx, cz));
    const list = new PieceList();
    const start = new StartPiece(r, cx * 16 + 2, cz * 16 + 2);
    list.add(start);
    start.addChildren(start, list, r);
    const pending = start.pendingChildren;
    while (pending.length) {
      const j = r.nextInt(pending.length);
      pending.splice(j, 1)[0].addChildren(start, list, r);
    }
    // vanilla StructurePiecesBuilder.moveBelowSeaLevel(63, -64, random, 10)
    const b = list.bounds();
    const top = SEA_LEVEL - 10;
    let y = b.ySpan + MIN_Y + 1;
    if (y < top) y += r.nextInt(top - y);
    const dy = y - b.maxY;
    for (const p of list.pieces) p.box.move(0, dy, 0);
    // (a thousand tries without a portal room never happens; the last one does then)
    if (start.portalRoomPiece || i >= 1000) {
      return { index, cx, cz, pieces: list.pieces as StrongholdPiece[], bounds: list.bounds(), portalRoom: start.portalRoomPiece ?? start };
    }
  }
}

/** vanilla Mth.clampedMap */
const clampedMap = (v: number, a: number, b: number, c: number, d: number) => (v <= a ? c : v >= b ? d : c + ((v - a) / (b - a)) * (d - c));

/** the terrain a chunk's noise gets filled in with round nearby stronghold floors (vanilla Beardifier, "bury") */
export interface Bury {
  minY: number;
  maxY: number;
  compute(x: number, y: number, z: number): number;
}

/** the strongholds of a world, placed and laid out on demand and cached (each chunk worker and the game keep their own) */
export class Strongholds {
  /** the 128 ring positions before the biome nudge, in vanilla's order, with each one's forked random */
  readonly ring: { cx: number; cz: number; fork: bigint }[] = [];
  private readonly chunks: ([number, number] | undefined)[] = [];
  private readonly starts: (StrongholdStart | undefined)[] = [];

  /** `biomeAt`: the biome at a block column at y 0 (vanilla getNoiseBiome(quart, 0, quart)) */
  constructor(readonly seed: bigint, private readonly biomeAt: (x: number, z: number) => number) {
    // vanilla ChunkGeneratorStructureState.generateRingPositions
    const r = new LegacyRandom(seed);
    let angle = r.nextDouble() * Math.PI * 2;
    let inRing = 0, ring = 0, spread = SPREAD;
    for (let j = 0; j < COUNT; j++) {
      const d = 4 * DISTANCE + DISTANCE * ring * 6 + (r.nextDouble() - 0.5) * DISTANCE * 2.5;
      const cx = Math.round(Math.cos(angle) * d), cz = Math.round(Math.sin(angle) * d);
      this.ring.push({ cx, cz, fork: r.nextLong() });
      angle += (Math.PI * 2) / spread;
      if (++inRing === spread) {
        ring++;
        inRing = 0;
        spread += Math.trunc((2 * spread) / (ring + 1));
        spread = Math.min(spread, COUNT - j);
        angle += r.nextDouble() * Math.PI * 2;
      }
    }
  }

  /**
   * vanilla BiomeSource.findBiomeHorizontal(x, 0, z, 112, 1, #stronghold_biased_to, random, false): every quart
   * within 28 of the ring position's centre, row by row; each one of a preferred biome may take the place of the
   * last found, the n-th with a chance of 1 in n. The chunk it's in (or the ring position itself, if none)
   */
  chunkOf(i: number): [number, number] {
    const known = this.chunks[i];
    if (known) return known;
    const b = this.ring[i];
    const r = new LegacyRandom(b.fork);
    const qx = (b.cx * 16 + 8) >> 2, qz = (b.cz * 16 + 8) >> 2, k = 112 >> 2;
    let found: [number, number] | null = null, n = 0;
    for (let dz = -k; dz <= k; dz++)
      for (let dx = -k; dx <= k; dx++) {
        const x = (qx + dx) * 4, z = (qz + dz) * 4;
        if (!STRONGHOLD_BIASED_TO.has(this.biomeAt(x, z))) continue;
        if (found === null || r.nextInt(n + 1) === 0) found = [x, z];
        n++;
      }
    const c: [number, number] = found ? [found[0] >> 4, found[1] >> 4] : [b.cx, b.cz];
    this.chunks[i] = c;
    return c;
  }

  /** the stronghold of ring position `i`, laid out */
  start(i: number): StrongholdStart {
    let s = this.starts[i];
    if (!s) {
      const [cx, cz] = this.chunkOf(i);
      s = this.starts[i] = generateStronghold(this.seed, i, cx, cz);
    }
    return s;
  }

  /**
   * strongholds whose pieces may come within `margin` blocks of a chunk: the nudge moves a start up to 8 chunks,
   * and pieces reach about 130 blocks from it
   */
  startsNear(cx: number, cz: number, margin = 0): StrongholdStart[] {
    const out: StrongholdStart[] = [];
    const reach = 18 + Math.ceil(margin / 16);
    for (let i = 0; i < COUNT; i++) {
      const b = this.ring[i];
      if (Math.abs(b.cx - cx) > reach || Math.abs(b.cz - cz) > reach) continue;
      const [sx, sz] = this.chunkOf(i);
      if (Math.abs(sx - cx) > reach - 8 || Math.abs(sz - cz) > reach - 8) continue;
      const s = this.start(i);
      const x0 = cx * 16 - margin, z0 = cz * 16 - margin, x1 = cx * 16 + 15 + margin, z1 = cz * 16 + 15 + margin;
      if (s.bounds.maxX >= x0 && s.bounds.minX <= x1 && s.bounds.maxZ >= z0 && s.bounds.minZ <= z1) out.push(s);
    }
    return out;
  }

  /** vanilla StructureStart.placeInChunk for every stronghold reaching this chunk */
  place(ctx: GenContext): void {
    const chunk = new BoundingBox(ctx.x0, MIN_Y + 1, ctx.z0, ctx.x0 + 15, MAX_Y - 1, ctx.z0 + 15);
    const starts = this.startsNear(ctx.cx, ctx.cz);
    if (!starts.length) return;
    const r = chunkRandom(this.seed, ctx.x0, ctx.z0);
    for (const s of starts) for (const p of s.pieces) if (p.box.intersects(chunk)) p.postProcess(ctx, chunk, r);
  }

  /**
   * vanilla Beardifier for terrain_adaptation "bury": round the floor of every piece within 12 blocks of the chunk,
   * the terrain is pushed toward solid, fully at the floor and fading out 6 blocks across or 12 up and down
   */
  buryFor(cx: number, cz: number): Bury | null {
    const boxes: number[] = [];
    let minY = Infinity, maxY = -Infinity;
    const x0 = cx * 16 - 12, z0 = cz * 16 - 12, x1 = cx * 16 + 15 + 12, z1 = cz * 16 + 15 + 12;
    for (const s of this.startsNear(cx, cz, 12))
      for (const p of s.pieces) {
        const b = p.box;
        if (b.maxX < x0 || b.minX > x1 || b.maxZ < z0 || b.minZ > z1) continue;
        boxes.push(b.minX, b.minZ, b.maxX, b.maxZ, b.minY);
        minY = Math.min(minY, b.minY - 12);
        maxY = Math.max(maxY, b.minY + 12);
      }
    if (!boxes.length) return null;
    return {
      minY,
      maxY,
      compute(x: number, y: number, z: number): number {
        let d = 0;
        for (let n = 0; n < boxes.length; n += 5) {
          const i = Math.max(0, boxes[n] - x, x - boxes[n + 2]);
          const j = Math.max(0, boxes[n + 1] - z, z - boxes[n + 3]);
          if (i >= 6 || j >= 6) continue;
          const h = (y - boxes[n + 4]) / 2;
          d += clampedMap(Math.sqrt(i * i + h * h + j * j), 0, 6, 1, 0);
        }
        return d;
      },
    };
  }

  /** whether a block is inside one of a stronghold's pieces (vanilla getStructureWithPieceAt) */
  pieceAt(x: number, y: number, z: number): boolean {
    for (const s of this.startsNear(x >> 4, z >> 4)) {
      if (!s.bounds.isInside(x, y, z)) continue;
      if (s.pieces.some((p) => p.box.isInside(x, y, z))) return true;
    }
    return false;
  }

  /**
   * vanilla ChunkGenerator.getNearestGeneratedStructure for concentric rings: the ring position whose chunk centre
   * (at y 32) is closest to the block, first in ring order on a tie; its chunk's corner. Only the positions that
   * could be the closest are nudged toward their biomes to find out
   */
  nearest(x: number, y: number, z: number): [number, number] {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    const dist = (cx: number, cz: number) => (cx * 16 + 8 - x) ** 2 + (32 - y) ** 2 + (cz * 16 + 8 - z) ** 2;
    const order = this.ring.map((b, i) => ({ i, d: Math.sqrt(dist(b.cx, b.cz)) })).sort((a, b) => a.d - b.d);
    // (the nudge moves a position at most 8 chunks each way)
    const slack = Math.SQRT2 * 8 * 16 + 16;
    let best = -1, bestD = Infinity;
    for (const { i, d } of order) {
      if (best >= 0 && d - slack > Math.sqrt(bestD)) break;
      const [cx, cz] = this.chunkOf(i);
      const dd = dist(cx, cz);
      if (dd < bestD || (dd === bestD && i < best)) {
        best = i;
        bestD = dd;
      }
    }
    const [cx, cz] = this.chunkOf(best);
    return [cx * 16, cz * 16];
  }
}

/** vanilla getNoiseBiome at y 0: an underground biome if one is there, else the surface's */
export function biomeAtY0(router: OverworldRouter): (x: number, z: number) => number {
  return (x, z) => {
    const c = router.column(x, z, newColumn());
    const cave = pickCaveBiome(c.humidity, c.continents, c.erosion, router.depth(0, c));
    return cave >= 0 ? cave : pickSurfaceBiome(c.temperature, c.humidity, c.continents, c.erosion, c.ridges);
  };
}

/** two structures' terrain adjustments together (villages' beards and strongholds' burying) */
export function addBeards(a: Bury | null, b: Bury | null): Bury | null {
  if (!a || !b) return a ?? b;
  return {
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
    compute: (x, y, z) => (y >= a.minY && y <= a.maxY ? a.compute(x, y, z) : 0) + (y >= b.minY && y <= b.maxY ? b.compute(x, y, z) : 0),
  };
}

/** strongholds for the main thread (the eye of ender, /locate, being in one): only the biome noise is needed */
export function strongholdLocator(seed: string): Strongholds {
  const router = new OverworldRouter(SeedSource.fromWorldSeed(seed));
  return new Strongholds(worldSeed64(seed), biomeAtY0(router));
}
