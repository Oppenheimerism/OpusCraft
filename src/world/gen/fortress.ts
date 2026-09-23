// Nether fortresses (vanilla NetherFortressStructure + NetherFortressPieces).
// One fortress or bastion remnant per 27 x 27-chunk region (the nether_complexes
// set, fortresses weight 2 and bastions 3). A fortress starts as a bridge
// crossing at y 64 and grows up to 30 pieces deep and 112 blocks out: bridges
// that end in rubble, open crossings, stair rooms, blaze spawner thrones, and
// castles of corridors, T balconies and nether wart rooms. The whole thing is
// then moved between y 48 and 70. Pieces carve through the rock, and brick
// pillars run down from them until they reach solid ground.

import { Rand, hash2 } from '../../core/rng';
import { S, blockOf } from '../block';
import { MIN_Y, MAX_Y } from '../constants';
import type { GenContext } from './context';
import { BoundingBox, PieceList, StructurePiece, Dir4, isAir, isLiquid, solidRender } from './structure';

const LOOT = 'chests/nether_bridge';
/** vanilla NetherFortressPieces.MAX_DEPTH */
const MAX_DEPTH = 30;
/** the nether_complexes placement: spacing 27, separation 4 */
const SPACING = 27, SEPARATION = 4;
const SALT = 30084232;
const HORIZONTAL: Dir4[] = ['north', 'east', 'south', 'west'];

interface Blocks {
  BRICKS: number;
  FENCE: number;
  STAIRS: number;
  LAVA: number;
  SOUL_SAND: number;
  NETHER_WART: number;
  CHEST: number;
  SPAWNER: number;
}
let BLK: Blocks | null = null;
function k(): Blocks {
  return (BLK ??= {
    BRICKS: S('nether_bricks'), FENCE: S('nether_brick_fence'), STAIRS: S('nether_brick_stairs'), LAVA: S('lava'),
    SOUL_SAND: S('soul_sand'), NETHER_WART: S('nether_wart'), CHEST: S('chest'), SPAWNER: S('spawner'),
  });
}
const stairs = (facing: Dir4): number => blockOf(k().STAIRS).with(k().STAIRS, 'facing', facing);

/** vanilla BoundingBox.orientBox: a piece's box from the point it attaches at */
function orientBox(x: number, y: number, z: number, ox: number, oy: number, oz: number, w: number, h: number, d: number, facing: Dir4): BoundingBox {
  switch (facing) {
    case 'north': return new BoundingBox(x + ox, y + oy, z - d + 1 + oz, x + w - 1 + ox, y + h - 1 + oy, z + oz);
    case 'west': return new BoundingBox(x - d + 1 + oz, y + oy, z + ox, x + oz, y + h - 1 + oy, z + w - 1 + ox);
    case 'east': return new BoundingBox(x + oz, y + oy, z + ox, x + d - 1 + oz, y + h - 1 + oy, z + w - 1 + ox);
    default: return new BoundingBox(x + ox, y + oy, z + oz, x + w - 1 + ox, y + h - 1 + oy, z + d - 1 + oz);
  }
}

/** vanilla StructurePiece.isReplaceableByStructures */
function replaceableByStructures(st: number): boolean {
  if (isAir(st) || isLiquid(st)) return true;
  const n = blockOf(st).name;
  return n === 'glow_lichen' || n === 'seagrass' || n === 'tall_seagrass';
}

// ---------------------------------------------------------------------------
// Piece weights

type Factory = (pieces: PieceList, r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number) => NetherBridgePiece | null;

/** vanilla NetherFortressPieces.PieceWeight */
class PieceWeight {
  placeCount = 0;
  constructor(readonly create: Factory, readonly weight: number, readonly maxPlaceCount: number, readonly allowInRow = false) {}
  doPlace(): boolean {
    return this.maxPlaceCount === 0 || this.placeCount < this.maxPlaceCount;
  }
  isValid(): boolean {
    return this.maxPlaceCount === 0 || this.placeCount < this.maxPlaceCount;
  }
}

const bridgeWeights = (): PieceWeight[] => [
  new PieceWeight(BridgeStraight.createPiece, 30, 0, true),
  new PieceWeight(BridgeCrossing.createPiece, 10, 4),
  new PieceWeight(RoomCrossing.createPiece, 10, 4),
  new PieceWeight(StairsRoom.createPiece, 10, 3),
  new PieceWeight(MonsterThrone.createPiece, 5, 2),
  new PieceWeight(CastleEntrance.createPiece, 5, 1),
];

const castleWeights = (): PieceWeight[] => [
  new PieceWeight(CastleSmallCorridorPiece.createPiece, 25, 0, true),
  new PieceWeight(CastleSmallCorridorCrossingPiece.createPiece, 15, 5),
  new PieceWeight(CastleSmallCorridorRightTurnPiece.createPiece, 5, 10),
  new PieceWeight(CastleSmallCorridorLeftTurnPiece.createPiece, 5, 10),
  new PieceWeight(CastleCorridorStairsPiece.createPiece, 10, 3, true),
  new PieceWeight(CastleCorridorTBalconyPiece.createPiece, 7, 2),
  new PieceWeight(CastleStalkRoom.createPiece, 5, 2),
];

/** vanilla NetherBridgePiece.isOkBox */
const isOkBox = (b: BoundingBox) => b.minY > 10;

// ---------------------------------------------------------------------------
// Pieces

abstract class NetherBridgePiece extends StructurePiece {
  constructor(genDepth: number, box: BoundingBox, d: Dir4) {
    super(genDepth, box);
    this.setOrientation(d);
  }

  addChildren(_start: StructurePiece, _pieces: PieceList, _r: Rand): void {}

  /** the total weight while any piece with a limit can still be placed (vanilla updatePieceWeight) */
  private static updatePieceWeight(weights: PieceWeight[]): number {
    let limited = false, total = 0;
    for (const w of weights) {
      if (w.maxPlaceCount > 0 && w.placeCount < w.maxPlaceCount) limited = true;
      total += w.weight;
    }
    return limited ? total : -1;
  }

  /**
   * vanilla generatePiece: five weighted draws; the same kind twice in a row only where that's allowed, and when a
   * drawn piece doesn't fit, the kinds after it in the list are tried in turn. Failing all that, the bridge ends
   */
  private generatePiece(start: StartPiece, weights: PieceWeight[], pieces: PieceList, r: Rand, x: number, y: number, z: number, d: Dir4, depth: number): NetherBridgePiece | null {
    const total = NetherBridgePiece.updatePieceWeight(weights);
    const ok = total > 0 && depth <= MAX_DEPTH;
    for (let j = 0; j < 5 && ok; j++) {
      let n = r.nextInt(total);
      for (const w of weights) {
        n -= w.weight;
        if (n >= 0) continue;
        if (!w.doPlace() || (w === start.previousPiece && !w.allowInRow)) break;
        const p = w.create(pieces, r, x, y, z, d, depth);
        if (!p) continue;
        w.placeCount++;
        start.previousPiece = w;
        if (!w.isValid()) weights.splice(weights.indexOf(w), 1);
        return p;
      }
    }
    return BridgeEndFiller.createPiece(pieces, r, x, y, z, d, depth);
  }

  private generateAndAddPiece(start: StartPiece, pieces: PieceList, r: Rand, x: number, y: number, z: number, d: Dir4, depth: number, castle: boolean): StructurePiece | null {
    // (too far out: vanilla makes a bridge end here but never adds it, so the fortress just stops)
    if (Math.abs(x - start.box.minX) > 112 || Math.abs(z - start.box.minZ) > 112) return BridgeEndFiller.createPiece(pieces, r, x, y, z, d, depth);
    const p = this.generatePiece(start, castle ? start.availableCastlePieces : start.availableBridgePieces, pieces, r, x, y, z, d, depth + 1);
    if (p) {
      pieces.add(p);
      start.pendingChildren.push(p);
    }
    return p;
  }

  protected generateChildForward(start: StartPiece, pieces: PieceList, r: Rand, offsetX: number, offsetY: number, castle: boolean): StructurePiece | null {
    const b = this.box, d = this.orientation!;
    switch (d) {
      case 'north': return this.generateAndAddPiece(start, pieces, r, b.minX + offsetX, b.minY + offsetY, b.minZ - 1, d, this.genDepth, castle);
      case 'south': return this.generateAndAddPiece(start, pieces, r, b.minX + offsetX, b.minY + offsetY, b.maxZ + 1, d, this.genDepth, castle);
      case 'west': return this.generateAndAddPiece(start, pieces, r, b.minX - 1, b.minY + offsetY, b.minZ + offsetX, d, this.genDepth, castle);
      case 'east': return this.generateAndAddPiece(start, pieces, r, b.maxX + 1, b.minY + offsetY, b.minZ + offsetX, d, this.genDepth, castle);
    }
  }

  protected generateChildLeft(start: StartPiece, pieces: PieceList, r: Rand, offsetY: number, offsetX: number, castle: boolean): StructurePiece | null {
    const b = this.box;
    switch (this.orientation!) {
      case 'north': case 'south': return this.generateAndAddPiece(start, pieces, r, b.minX - 1, b.minY + offsetY, b.minZ + offsetX, 'west', this.genDepth, castle);
      case 'west': case 'east': return this.generateAndAddPiece(start, pieces, r, b.minX + offsetX, b.minY + offsetY, b.minZ - 1, 'north', this.genDepth, castle);
    }
  }

  protected generateChildRight(start: StartPiece, pieces: PieceList, r: Rand, offsetY: number, offsetX: number, castle: boolean): StructurePiece | null {
    const b = this.box;
    switch (this.orientation!) {
      case 'north': case 'south': return this.generateAndAddPiece(start, pieces, r, b.maxX + 1, b.minY + offsetY, b.minZ + offsetX, 'east', this.genDepth, castle);
      case 'west': case 'east': return this.generateAndAddPiece(start, pieces, r, b.minX + offsetX, b.minY + offsetY, b.maxZ + 1, 'south', this.genDepth, castle);
    }
  }

  protected fill(ctx: GenContext, chunk: BoundingBox, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, st: number): void {
    this.generateBox(ctx, chunk, x0, y0, z0, x1, y1, z1, st, st, false);
  }

  /** vanilla fillColumnDown: from a local position down through air and liquids until something solid */
  protected fillColumnDown(ctx: GenContext, st: number, x: number, y: number, z: number, chunk: BoundingBox): void {
    const wx = this.worldX(x, z), wz = this.worldZ(x, z);
    let wy = this.worldY(y);
    if (!chunk.isInside(wx, wy, wz)) return;
    while (replaceableByStructures(ctx.getOrAir(wx, wy, wz)) && wy > MIN_Y + 1) {
      ctx.set(wx, wy, wz, st);
      wy--;
    }
  }

  /** brick pillars under the local columns x0..x1, z0..z1 */
  protected pillars(ctx: GenContext, chunk: BoundingBox, x0: number, x1: number, z0: number, z1: number): void {
    const b = k().BRICKS;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) this.fillColumnDown(ctx, b, x, -1, z, chunk);
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

  /** whether this piece puts a solid block at a local position (for looking past the edge of the chunk) */
  protected solidHint(_x: number, _y: number, _z: number): boolean {
    return false;
  }

  /**
   * vanilla createChest with StructurePiece.reorient: a chest backed by exactly one wall faces away from it;
   * otherwise it starts facing north and turns (opposite, clockwise, opposite) while a solid block is in front
   */
  protected createChest(ctx: GenContext, chunk: BoundingBox, r: Rand, x: number, y: number, z: number): void {
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
    let wall: Dir4 | null = null;
    for (const [d, dx, dz] of DIRS) {
      if (!solid(dx, dz)) continue;
      if (wall === null) {
        wall = d;
        continue;
      }
      wall = null;
      break;
    }
    let facing: Dir4;
    if (wall !== null) facing = OPP[wall];
    else {
      const off = (d: Dir4) => DIRS.find((e) => e[0] === d)!;
      const blocked = (d: Dir4) => solid(off(d)[1], off(d)[2]);
      facing = 'north';
      if (blocked(facing)) facing = OPP[facing];
      if (blocked(facing)) facing = CW[facing];
      if (blocked(facing)) facing = OPP[facing];
    }
    const chest = k().CHEST;
    ctx.set(wx, wy, wz, blockOf(chest).with(chest, 'facing', facing));
    ctx.blockEntities.push({ id: 'chest', x: wx, y: wy, z: wz, items: [], data: { lootTable: LOOT, lootSeed: r.nextU32() } });
  }
}

/** a 19 x 19 crossing of two bridges on arches (vanilla BridgeCrossing) */
class BridgeCrossing extends NetherBridgePiece {
  static createPiece(pieces: PieceList, _r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number): NetherBridgePiece | null {
    const box = orientBox(x, y, z, -8, -3, 0, 19, 10, 19, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new BridgeCrossing(genDepth, box, d) : null;
  }

  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    this.generateChildForward(start as StartPiece, pieces, r, 8, 3, false);
    this.generateChildLeft(start as StartPiece, pieces, r, 3, 8, false);
    this.generateChildRight(start as StartPiece, pieces, r, 3, 8, false);
  }

  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const B = k().BRICKS;
    this.fill(ctx, chunk, 7, 3, 0, 11, 4, 18, B);
    this.fill(ctx, chunk, 0, 3, 7, 18, 4, 11, B);
    this.fill(ctx, chunk, 8, 5, 0, 10, 7, 18, 0);
    this.fill(ctx, chunk, 0, 5, 8, 18, 7, 10, 0);
    this.fill(ctx, chunk, 7, 5, 0, 7, 5, 7, B);
    this.fill(ctx, chunk, 7, 5, 11, 7, 5, 18, B);
    this.fill(ctx, chunk, 11, 5, 0, 11, 5, 7, B);
    this.fill(ctx, chunk, 11, 5, 11, 11, 5, 18, B);
    this.fill(ctx, chunk, 0, 5, 7, 7, 5, 7, B);
    this.fill(ctx, chunk, 11, 5, 7, 18, 5, 7, B);
    this.fill(ctx, chunk, 0, 5, 11, 7, 5, 11, B);
    this.fill(ctx, chunk, 11, 5, 11, 18, 5, 11, B);
    this.fill(ctx, chunk, 7, 2, 0, 11, 2, 5, B);
    this.fill(ctx, chunk, 7, 2, 13, 11, 2, 18, B);
    this.fill(ctx, chunk, 7, 0, 0, 11, 1, 3, B);
    this.fill(ctx, chunk, 7, 0, 15, 11, 1, 18, B);
    for (let i = 7; i <= 11; i++)
      for (let j = 0; j <= 2; j++) {
        this.fillColumnDown(ctx, B, i, -1, j, chunk);
        this.fillColumnDown(ctx, B, i, -1, 18 - j, chunk);
      }
    this.fill(ctx, chunk, 0, 2, 7, 5, 2, 11, B);
    this.fill(ctx, chunk, 13, 2, 7, 18, 2, 11, B);
    this.fill(ctx, chunk, 0, 0, 7, 3, 1, 11, B);
    this.fill(ctx, chunk, 15, 0, 7, 18, 1, 11, B);
    for (let i = 0; i <= 2; i++)
      for (let j = 7; j <= 11; j++) {
        this.fillColumnDown(ctx, B, i, -1, j, chunk);
        this.fillColumnDown(ctx, B, 18 - i, -1, j, chunk);
      }
  }
}

/** the first piece: a bridge crossing that keeps the fortress's piece lists (vanilla StartPiece) */
class StartPiece extends BridgeCrossing {
  previousPiece: PieceWeight | null = null;
  readonly availableBridgePieces = bridgeWeights();
  readonly availableCastlePieces = castleWeights();
  readonly pendingChildren: StructurePiece[] = [];

  constructor(r: Rand, x: number, z: number) {
    super(0, new BoundingBox(x, 64, z, x + 18, 73, z + 18), HORIZONTAL[r.nextInt(4)]);
  }
}

/** a straight bridge, 19 long, with a low parapet and fence slits in its sides (vanilla BridgeStraight) */
class BridgeStraight extends NetherBridgePiece {
  static createPiece(pieces: PieceList, _r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number): NetherBridgePiece | null {
    const box = orientBox(x, y, z, -1, -3, 0, 5, 10, 19, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new BridgeStraight(genDepth, box, d) : null;
  }

  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    this.generateChildForward(start as StartPiece, pieces, r, 1, 3, false);
  }

  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { BRICKS: B, FENCE: F } = k();
    this.fill(ctx, chunk, 0, 3, 0, 4, 4, 18, B);
    this.fill(ctx, chunk, 1, 5, 0, 3, 7, 18, 0);
    this.fill(ctx, chunk, 0, 5, 0, 0, 5, 18, B);
    this.fill(ctx, chunk, 4, 5, 0, 4, 5, 18, B);
    this.fill(ctx, chunk, 0, 2, 0, 4, 2, 5, B);
    this.fill(ctx, chunk, 0, 2, 13, 4, 2, 18, B);
    this.fill(ctx, chunk, 0, 0, 0, 4, 1, 3, B);
    this.fill(ctx, chunk, 0, 0, 15, 4, 1, 18, B);
    for (let i = 0; i <= 4; i++)
      for (let j = 0; j <= 2; j++) {
        this.fillColumnDown(ctx, B, i, -1, j, chunk);
        this.fillColumnDown(ctx, B, i, -1, 18 - j, chunk);
      }
    this.fill(ctx, chunk, 0, 1, 1, 0, 4, 1, F);
    this.fill(ctx, chunk, 0, 3, 4, 0, 4, 4, F);
    this.fill(ctx, chunk, 0, 3, 14, 0, 4, 14, F);
    this.fill(ctx, chunk, 0, 1, 17, 0, 4, 17, F);
    this.fill(ctx, chunk, 4, 1, 1, 4, 4, 1, F);
    this.fill(ctx, chunk, 4, 3, 4, 4, 4, 4, F);
    this.fill(ctx, chunk, 4, 3, 14, 4, 4, 14, F);
    this.fill(ctx, chunk, 4, 1, 17, 4, 4, 17, F);
  }
}

/** where a bridge gives out: a ragged stub of deck and arch (vanilla BridgeEndFiller) */
class BridgeEndFiller extends NetherBridgePiece {
  private readonly selfSeed: number;

  constructor(genDepth: number, r: Rand, box: BoundingBox, d: Dir4) {
    super(genDepth, box, d);
    this.selfSeed = r.nextU32();
  }

  static createPiece(pieces: PieceList, r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number): NetherBridgePiece | null {
    const box = orientBox(x, y, z, -1, -3, 0, 5, 10, 8, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new BridgeEndFiller(genDepth, r, box, d) : null;
  }

  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const B = k().BRICKS;
    // (its own seed, so every chunk it spans breaks it off the same way)
    const r = new Rand(this.selfSeed, 0x4e46);
    for (let i = 0; i <= 4; i++)
      for (let j = 3; j <= 4; j++) {
        const n = r.nextInt(8);
        this.fill(ctx, chunk, i, j, 0, i, j, n, B);
      }
    let n = r.nextInt(8);
    this.fill(ctx, chunk, 0, 5, 0, 0, 5, n, B);
    n = r.nextInt(8);
    this.fill(ctx, chunk, 4, 5, 0, 4, 5, n, B);
    for (let i = 0; i <= 4; i++) {
      n = r.nextInt(5);
      this.fill(ctx, chunk, i, 2, 0, i, 2, n, B);
    }
    for (let i = 0; i <= 4; i++)
      for (let j = 0; j <= 1; j++) {
        n = r.nextInt(3);
        this.fill(ctx, chunk, i, j, 0, i, j, n, B);
      }
  }
}

/** a small roofless crossing room with fenced windows (vanilla RoomCrossing) */
class RoomCrossing extends NetherBridgePiece {
  static createPiece(pieces: PieceList, _r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number): NetherBridgePiece | null {
    const box = orientBox(x, y, z, -2, 0, 0, 7, 9, 7, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new RoomCrossing(genDepth, box, d) : null;
  }

  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    this.generateChildForward(start as StartPiece, pieces, r, 2, 0, false);
    this.generateChildLeft(start as StartPiece, pieces, r, 0, 2, false);
    this.generateChildRight(start as StartPiece, pieces, r, 0, 2, false);
  }

  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { BRICKS: B, FENCE: F } = k();
    this.fill(ctx, chunk, 0, 0, 0, 6, 1, 6, B);
    this.fill(ctx, chunk, 0, 2, 0, 6, 7, 6, 0);
    this.fill(ctx, chunk, 0, 2, 0, 1, 6, 0, B);
    this.fill(ctx, chunk, 0, 2, 6, 1, 6, 6, B);
    this.fill(ctx, chunk, 5, 2, 0, 6, 6, 0, B);
    this.fill(ctx, chunk, 5, 2, 6, 6, 6, 6, B);
    this.fill(ctx, chunk, 0, 2, 0, 0, 6, 1, B);
    this.fill(ctx, chunk, 0, 2, 5, 0, 6, 6, B);
    this.fill(ctx, chunk, 6, 2, 0, 6, 6, 1, B);
    this.fill(ctx, chunk, 6, 2, 5, 6, 6, 6, B);
    this.fill(ctx, chunk, 2, 6, 0, 4, 6, 0, B);
    this.fill(ctx, chunk, 2, 5, 0, 4, 5, 0, F);
    this.fill(ctx, chunk, 2, 6, 6, 4, 6, 6, B);
    this.fill(ctx, chunk, 2, 5, 6, 4, 5, 6, F);
    this.fill(ctx, chunk, 0, 6, 2, 0, 6, 4, B);
    this.fill(ctx, chunk, 0, 5, 2, 0, 5, 4, F);
    this.fill(ctx, chunk, 6, 6, 2, 6, 6, 4, B);
    this.fill(ctx, chunk, 6, 5, 2, 6, 5, 4, F);
    this.pillars(ctx, chunk, 0, 6, 0, 6);
  }
}

/** a room with a stair of bricks up to a landing and a door out to the right, high up (vanilla StairsRoom) */
class StairsRoom extends NetherBridgePiece {
  static createPiece(pieces: PieceList, _r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number): NetherBridgePiece | null {
    const box = orientBox(x, y, z, -2, 0, 0, 7, 11, 7, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new StairsRoom(genDepth, box, d) : null;
  }

  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    this.generateChildRight(start as StartPiece, pieces, r, 6, 2, false);
  }

  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { BRICKS: B, FENCE: F } = k();
    this.fill(ctx, chunk, 0, 0, 0, 6, 1, 6, B);
    this.fill(ctx, chunk, 0, 2, 0, 6, 10, 6, 0);
    this.fill(ctx, chunk, 0, 2, 0, 1, 8, 0, B);
    this.fill(ctx, chunk, 5, 2, 0, 6, 8, 0, B);
    this.fill(ctx, chunk, 0, 2, 1, 0, 8, 6, B);
    this.fill(ctx, chunk, 6, 2, 1, 6, 8, 6, B);
    this.fill(ctx, chunk, 1, 2, 6, 5, 8, 6, B);
    this.fill(ctx, chunk, 0, 3, 2, 0, 5, 4, F);
    this.fill(ctx, chunk, 6, 3, 2, 6, 5, 2, F);
    this.fill(ctx, chunk, 6, 3, 4, 6, 5, 4, F);
    this.placeBlock(ctx, B, 5, 2, 5, chunk);
    this.fill(ctx, chunk, 4, 2, 5, 4, 3, 5, B);
    this.fill(ctx, chunk, 3, 2, 5, 3, 4, 5, B);
    this.fill(ctx, chunk, 2, 2, 5, 2, 5, 5, B);
    this.fill(ctx, chunk, 1, 2, 5, 1, 6, 5, B);
    this.fill(ctx, chunk, 1, 7, 1, 5, 7, 4, B);
    this.fill(ctx, chunk, 6, 8, 2, 6, 8, 4, 0);
    this.fill(ctx, chunk, 2, 6, 0, 4, 8, 0, B);
    this.fill(ctx, chunk, 2, 5, 0, 4, 5, 0, F);
    this.pillars(ctx, chunk, 0, 6, 0, 6);
  }
}

/** the blaze spawner on its stepped dais, under a fenced canopy (vanilla MonsterThrone) */
class MonsterThrone extends NetherBridgePiece {
  static createPiece(pieces: PieceList, _r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number): NetherBridgePiece | null {
    const box = orientBox(x, y, z, -2, 0, 0, 7, 8, 9, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new MonsterThrone(genDepth, box, d) : null;
  }

  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { BRICKS: B, FENCE: F } = k();
    this.fill(ctx, chunk, 0, 2, 0, 6, 7, 7, 0);
    this.fill(ctx, chunk, 1, 0, 0, 5, 1, 7, B);
    this.fill(ctx, chunk, 1, 2, 1, 5, 2, 7, B);
    this.fill(ctx, chunk, 1, 3, 2, 5, 3, 7, B);
    this.fill(ctx, chunk, 1, 4, 3, 5, 4, 7, B);
    this.fill(ctx, chunk, 1, 2, 0, 1, 4, 2, B);
    this.fill(ctx, chunk, 5, 2, 0, 5, 4, 2, B);
    this.fill(ctx, chunk, 1, 5, 2, 1, 5, 3, B);
    this.fill(ctx, chunk, 5, 5, 2, 5, 5, 3, B);
    this.fill(ctx, chunk, 0, 5, 3, 0, 5, 8, B);
    this.fill(ctx, chunk, 6, 5, 3, 6, 5, 8, B);
    this.fill(ctx, chunk, 1, 5, 8, 5, 5, 8, B);
    this.placeBlock(ctx, F, 1, 6, 3, chunk);
    this.placeBlock(ctx, F, 5, 6, 3, chunk);
    this.placeBlock(ctx, F, 0, 6, 3, chunk);
    this.placeBlock(ctx, F, 6, 6, 3, chunk);
    this.fill(ctx, chunk, 0, 6, 4, 0, 6, 7, F);
    this.fill(ctx, chunk, 6, 6, 4, 6, 6, 7, F);
    this.placeBlock(ctx, F, 0, 6, 8, chunk);
    this.placeBlock(ctx, F, 6, 6, 8, chunk);
    this.fill(ctx, chunk, 1, 6, 8, 5, 6, 8, F);
    this.placeBlock(ctx, F, 1, 7, 8, chunk);
    this.fill(ctx, chunk, 2, 7, 8, 4, 7, 8, F);
    this.placeBlock(ctx, F, 5, 7, 8, chunk);
    this.placeBlock(ctx, F, 2, 8, 8, chunk);
    this.placeBlock(ctx, F, 3, 8, 8, chunk);
    this.placeBlock(ctx, F, 4, 8, 8, chunk);
    const sx = this.worldX(3, 5), sy = this.worldY(5), sz = this.worldZ(3, 5);
    if (chunk.isInside(sx, sy, sz)) {
      ctx.set(sx, sy, sz, k().SPAWNER);
      ctx.blockEntities.push({ id: 'spawner', x: sx, y: sy, z: sz, items: [], data: { entity: 'blaze', delay: 20 } });
    }
    this.pillars(ctx, chunk, 0, 6, 0, 6);
  }
}

/** the two big castle halls: walls, battlements and the cross of arches under them */
abstract class CastleHall extends NetherBridgePiece {
  /** the walls and battlements the entrance hall and the nether wart room share */
  protected hall(ctx: GenContext, chunk: BoundingBox): void {
    const { BRICKS: B, FENCE: F } = k();
    this.fill(ctx, chunk, 0, 3, 0, 12, 4, 12, B);
    this.fill(ctx, chunk, 0, 5, 0, 12, 13, 12, 0);
    this.fill(ctx, chunk, 0, 5, 0, 1, 12, 12, B);
    this.fill(ctx, chunk, 11, 5, 0, 12, 12, 12, B);
    this.fill(ctx, chunk, 2, 5, 11, 4, 12, 12, B);
    this.fill(ctx, chunk, 8, 5, 11, 10, 12, 12, B);
    this.fill(ctx, chunk, 5, 9, 11, 7, 12, 12, B);
    this.fill(ctx, chunk, 2, 5, 0, 4, 12, 1, B);
    this.fill(ctx, chunk, 8, 5, 0, 10, 12, 1, B);
    this.fill(ctx, chunk, 5, 9, 0, 7, 12, 1, B);
    this.fill(ctx, chunk, 2, 11, 2, 10, 12, 10, B);
    for (let i = 1; i <= 11; i += 2) {
      this.fill(ctx, chunk, i, 10, 0, i, 11, 0, F);
      this.fill(ctx, chunk, i, 10, 12, i, 11, 12, F);
      this.fill(ctx, chunk, 0, 10, i, 0, 11, i, F);
      this.fill(ctx, chunk, 12, 10, i, 12, 11, i, F);
      this.placeBlock(ctx, B, i, 13, 0, chunk);
      this.placeBlock(ctx, B, i, 13, 12, chunk);
      this.placeBlock(ctx, B, 0, 13, i, chunk);
      this.placeBlock(ctx, B, 12, 13, i, chunk);
      if (i === 11) continue;
      this.placeBlock(ctx, F, i + 1, 13, 0, chunk);
      this.placeBlock(ctx, F, i + 1, 13, 12, chunk);
      this.placeBlock(ctx, F, 0, 13, i + 1, chunk);
      this.placeBlock(ctx, F, 12, 13, i + 1, chunk);
    }
    this.placeBlock(ctx, F, 0, 13, 0, chunk);
    this.placeBlock(ctx, F, 0, 13, 12, chunk);
    this.placeBlock(ctx, F, 12, 13, 12, chunk);
    this.placeBlock(ctx, F, 12, 13, 0, chunk);
    for (let i = 3; i <= 9; i += 2) {
      this.fill(ctx, chunk, 1, 7, i, 1, 8, i, F);
      this.fill(ctx, chunk, 11, 7, i, 11, 8, i, F);
    }
  }

  /** the cross of arches under the hall, with pillars down from its four ends */
  protected foundations(ctx: GenContext, chunk: BoundingBox): void {
    const B = k().BRICKS;
    this.fill(ctx, chunk, 4, 2, 0, 8, 2, 12, B);
    this.fill(ctx, chunk, 0, 2, 4, 12, 2, 8, B);
    this.fill(ctx, chunk, 4, 0, 0, 8, 1, 3, B);
    this.fill(ctx, chunk, 4, 0, 9, 8, 1, 12, B);
    this.fill(ctx, chunk, 0, 0, 4, 3, 1, 8, B);
    this.fill(ctx, chunk, 9, 0, 4, 12, 1, 8, B);
    for (let i = 4; i <= 8; i++)
      for (let j = 0; j <= 2; j++) {
        this.fillColumnDown(ctx, B, i, -1, j, chunk);
        this.fillColumnDown(ctx, B, i, -1, 12 - j, chunk);
      }
    for (let i = 0; i <= 2; i++)
      for (let j = 4; j <= 8; j++) {
        this.fillColumnDown(ctx, B, i, -1, j, chunk);
        this.fillColumnDown(ctx, B, 12 - i, -1, j, chunk);
      }
  }
}

/** a castle's entrance hall, with a lava well in the middle (vanilla CastleEntrance) */
class CastleEntrance extends CastleHall {
  static createPiece(pieces: PieceList, _r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number): NetherBridgePiece | null {
    const box = orientBox(x, y, z, -5, -3, 0, 13, 14, 13, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new CastleEntrance(genDepth, box, d) : null;
  }

  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    this.generateChildForward(start as StartPiece, pieces, r, 5, 3, true);
  }

  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { BRICKS: B, FENCE: F } = k();
    this.hall(ctx, chunk);
    this.fill(ctx, chunk, 5, 8, 0, 7, 8, 0, F);
    this.foundations(ctx, chunk);
    this.fill(ctx, chunk, 5, 5, 5, 7, 5, 7, B);
    this.fill(ctx, chunk, 6, 1, 6, 6, 4, 6, 0);
    this.placeBlock(ctx, B, 6, 0, 6, chunk);
    this.placeBlock(ctx, k().LAVA, 6, 5, 6, chunk);
  }
}

/** the nether wart room: two soul sand beds of wart either side of a stair up to a door in the far wall (vanilla CastleStalkRoom) */
class CastleStalkRoom extends CastleHall {
  static createPiece(pieces: PieceList, _r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number): NetherBridgePiece | null {
    const box = orientBox(x, y, z, -5, -3, 0, 13, 14, 13, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new CastleStalkRoom(genDepth, box, d) : null;
  }

  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    this.generateChildForward(start as StartPiece, pieces, r, 5, 3, true);
    this.generateChildForward(start as StartPiece, pieces, r, 5, 11, true);
  }

  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { BRICKS: B, FENCE: F } = k();
    this.hall(ctx, chunk);
    const N = stairs('north');
    for (let j = 0; j <= 6; j++) {
      const z = j + 4;
      for (let x = 5; x <= 7; x++) this.placeBlock(ctx, N, x, 5 + j, z, chunk);
      if (z >= 5 && z <= 8) this.fill(ctx, chunk, 5, 5, z, 7, j + 4, z, B);
      else if (z >= 9 && z <= 10) this.fill(ctx, chunk, 5, 8, z, 7, j + 4, z, B);
      if (j >= 1) this.fill(ctx, chunk, 5, 6 + j, z, 7, 9 + j, z, 0);
    }
    for (let x = 5; x <= 7; x++) this.placeBlock(ctx, N, x, 12, 11, chunk);
    this.fill(ctx, chunk, 5, 6, 7, 5, 7, 7, F);
    this.fill(ctx, chunk, 7, 6, 7, 7, 7, 7, F);
    this.fill(ctx, chunk, 5, 13, 12, 7, 13, 12, 0);
    this.fill(ctx, chunk, 2, 5, 2, 3, 5, 3, B);
    this.fill(ctx, chunk, 2, 5, 9, 3, 5, 10, B);
    this.fill(ctx, chunk, 2, 5, 4, 2, 5, 8, B);
    this.fill(ctx, chunk, 9, 5, 2, 10, 5, 3, B);
    this.fill(ctx, chunk, 9, 5, 9, 10, 5, 10, B);
    this.fill(ctx, chunk, 10, 5, 4, 10, 5, 8, B);
    const E = stairs('east'), W = stairs('west');
    this.placeBlock(ctx, W, 4, 5, 2, chunk);
    this.placeBlock(ctx, W, 4, 5, 3, chunk);
    this.placeBlock(ctx, W, 4, 5, 9, chunk);
    this.placeBlock(ctx, W, 4, 5, 10, chunk);
    this.placeBlock(ctx, E, 8, 5, 2, chunk);
    this.placeBlock(ctx, E, 8, 5, 3, chunk);
    this.placeBlock(ctx, E, 8, 5, 9, chunk);
    this.placeBlock(ctx, E, 8, 5, 10, chunk);
    const { SOUL_SAND: SS, NETHER_WART: NW } = k();
    this.fill(ctx, chunk, 3, 4, 4, 4, 4, 8, SS);
    this.fill(ctx, chunk, 8, 4, 4, 9, 4, 8, SS);
    this.fill(ctx, chunk, 3, 5, 4, 4, 5, 8, NW);
    this.fill(ctx, chunk, 8, 5, 4, 9, 5, 8, NW);
    this.foundations(ctx, chunk);
  }
}

/** a short covered corridor with fence windows (vanilla CastleSmallCorridorPiece) */
class CastleSmallCorridorPiece extends NetherBridgePiece {
  static createPiece(pieces: PieceList, _r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number): NetherBridgePiece | null {
    const box = orientBox(x, y, z, -1, 0, 0, 5, 7, 5, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new CastleSmallCorridorPiece(genDepth, box, d) : null;
  }

  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    this.generateChildForward(start as StartPiece, pieces, r, 1, 0, true);
  }

  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { BRICKS: B, FENCE: F } = k();
    this.fill(ctx, chunk, 0, 0, 0, 4, 1, 4, B);
    this.fill(ctx, chunk, 0, 2, 0, 4, 5, 4, 0);
    this.fill(ctx, chunk, 0, 2, 0, 0, 5, 4, B);
    this.fill(ctx, chunk, 4, 2, 0, 4, 5, 4, B);
    this.fill(ctx, chunk, 0, 3, 1, 0, 4, 1, F);
    this.fill(ctx, chunk, 0, 3, 3, 0, 4, 3, F);
    this.fill(ctx, chunk, 4, 3, 1, 4, 4, 1, F);
    this.fill(ctx, chunk, 4, 3, 3, 4, 4, 3, F);
    this.fill(ctx, chunk, 0, 6, 0, 4, 6, 4, B);
    this.pillars(ctx, chunk, 0, 4, 0, 4);
  }
}

/** a four-way corridor junction (vanilla CastleSmallCorridorCrossingPiece) */
class CastleSmallCorridorCrossingPiece extends NetherBridgePiece {
  static createPiece(pieces: PieceList, _r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number): NetherBridgePiece | null {
    const box = orientBox(x, y, z, -1, 0, 0, 5, 7, 5, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new CastleSmallCorridorCrossingPiece(genDepth, box, d) : null;
  }

  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    this.generateChildForward(start as StartPiece, pieces, r, 1, 0, true);
    this.generateChildLeft(start as StartPiece, pieces, r, 0, 1, true);
    this.generateChildRight(start as StartPiece, pieces, r, 0, 1, true);
  }

  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const B = k().BRICKS;
    this.fill(ctx, chunk, 0, 0, 0, 4, 1, 4, B);
    this.fill(ctx, chunk, 0, 2, 0, 4, 5, 4, 0);
    this.fill(ctx, chunk, 0, 2, 0, 0, 5, 0, B);
    this.fill(ctx, chunk, 4, 2, 0, 4, 5, 0, B);
    this.fill(ctx, chunk, 0, 2, 4, 0, 5, 4, B);
    this.fill(ctx, chunk, 4, 2, 4, 4, 5, 4, B);
    this.fill(ctx, chunk, 0, 6, 0, 4, 6, 4, B);
    this.pillars(ctx, chunk, 0, 4, 0, 4);
  }
}

/** a corridor turning right, one in three with a chest in the corner (vanilla CastleSmallCorridorRightTurnPiece) */
class CastleSmallCorridorRightTurnPiece extends NetherBridgePiece {
  private readonly isNeedingChest: boolean;

  constructor(genDepth: number, r: Rand, box: BoundingBox, d: Dir4) {
    super(genDepth, box, d);
    this.isNeedingChest = r.nextInt(3) === 0;
  }

  static createPiece(pieces: PieceList, r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number): NetherBridgePiece | null {
    const box = orientBox(x, y, z, -1, 0, 0, 5, 7, 5, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new CastleSmallCorridorRightTurnPiece(genDepth, r, box, d) : null;
  }

  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    this.generateChildRight(start as StartPiece, pieces, r, 0, 1, true);
  }

  protected override solidHint(x: number, y: number, z: number): boolean {
    return y >= 2 && y <= 5 && (x === 0 || (z === 4 && x >= 1));
  }

  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    const { BRICKS: B, FENCE: F } = k();
    this.fill(ctx, chunk, 0, 0, 0, 4, 1, 4, B);
    this.fill(ctx, chunk, 0, 2, 0, 4, 5, 4, 0);
    this.fill(ctx, chunk, 0, 2, 0, 0, 5, 4, B);
    this.fill(ctx, chunk, 0, 3, 1, 0, 4, 1, F);
    this.fill(ctx, chunk, 0, 3, 3, 0, 4, 3, F);
    this.fill(ctx, chunk, 4, 2, 0, 4, 5, 0, B);
    this.fill(ctx, chunk, 1, 2, 4, 4, 5, 4, B);
    this.fill(ctx, chunk, 1, 3, 4, 1, 4, 4, F);
    this.fill(ctx, chunk, 3, 3, 4, 3, 4, 4, F);
    if (this.isNeedingChest) this.createChest(ctx, chunk, r, 1, 2, 3);
    this.fill(ctx, chunk, 0, 6, 0, 4, 6, 4, B);
    this.pillars(ctx, chunk, 0, 4, 0, 4);
  }
}

/** a corridor turning left, one in three with a chest in the corner (vanilla CastleSmallCorridorLeftTurnPiece) */
class CastleSmallCorridorLeftTurnPiece extends NetherBridgePiece {
  private readonly isNeedingChest: boolean;

  constructor(genDepth: number, r: Rand, box: BoundingBox, d: Dir4) {
    super(genDepth, box, d);
    this.isNeedingChest = r.nextInt(3) === 0;
  }

  static createPiece(pieces: PieceList, r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number): NetherBridgePiece | null {
    const box = orientBox(x, y, z, -1, 0, 0, 5, 7, 5, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new CastleSmallCorridorLeftTurnPiece(genDepth, r, box, d) : null;
  }

  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    this.generateChildLeft(start as StartPiece, pieces, r, 0, 1, true);
  }

  protected override solidHint(x: number, y: number, z: number): boolean {
    return y >= 2 && y <= 5 && (x === 4 || (z === 4 && x <= 3));
  }

  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    const { BRICKS: B, FENCE: F } = k();
    this.fill(ctx, chunk, 0, 0, 0, 4, 1, 4, B);
    this.fill(ctx, chunk, 0, 2, 0, 4, 5, 4, 0);
    this.fill(ctx, chunk, 4, 2, 0, 4, 5, 4, B);
    this.fill(ctx, chunk, 4, 3, 1, 4, 4, 1, F);
    this.fill(ctx, chunk, 4, 3, 3, 4, 4, 3, F);
    this.fill(ctx, chunk, 0, 2, 0, 0, 5, 0, B);
    this.fill(ctx, chunk, 0, 2, 4, 3, 5, 4, B);
    this.fill(ctx, chunk, 1, 3, 4, 1, 4, 4, F);
    this.fill(ctx, chunk, 3, 3, 4, 3, 4, 4, F);
    if (this.isNeedingChest) this.createChest(ctx, chunk, r, 3, 2, 3);
    this.fill(ctx, chunk, 0, 6, 0, 4, 6, 4, B);
    this.pillars(ctx, chunk, 0, 4, 0, 4);
  }
}

/** a covered stairway down seven blocks (vanilla CastleCorridorStairsPiece) */
class CastleCorridorStairsPiece extends NetherBridgePiece {
  static createPiece(pieces: PieceList, _r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number): NetherBridgePiece | null {
    const box = orientBox(x, y, z, -1, -7, 0, 5, 14, 10, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new CastleCorridorStairsPiece(genDepth, box, d) : null;
  }

  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    this.generateChildForward(start as StartPiece, pieces, r, 1, 0, true);
  }

  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { BRICKS: B, FENCE: F } = k();
    const step = stairs('south');
    for (let i = 0; i <= 9; i++) {
      const j = Math.max(1, 7 - i);
      const top = Math.min(Math.max(j + 5, 14 - i), 13);
      this.fill(ctx, chunk, 0, 0, i, 4, j, i, B);
      this.fill(ctx, chunk, 1, j + 1, i, 3, top - 1, i, 0);
      if (i <= 6) {
        this.placeBlock(ctx, step, 1, j + 1, i, chunk);
        this.placeBlock(ctx, step, 2, j + 1, i, chunk);
        this.placeBlock(ctx, step, 3, j + 1, i, chunk);
      }
      this.fill(ctx, chunk, 0, top, i, 4, top, i, B);
      this.fill(ctx, chunk, 0, j + 1, i, 0, top - 1, i, B);
      this.fill(ctx, chunk, 4, j + 1, i, 4, top - 1, i, B);
      if ((i & 1) === 0) {
        this.fill(ctx, chunk, 0, j + 2, i, 0, j + 3, i, F);
        this.fill(ctx, chunk, 4, j + 2, i, 4, j + 3, i, F);
      }
      for (let x = 0; x <= 4; x++) this.fillColumnDown(ctx, B, x, -1, i, chunk);
    }
  }
}

/** a T junction of corridors with a fenced balcony looking out (vanilla CastleCorridorTBalconyPiece) */
class CastleCorridorTBalconyPiece extends NetherBridgePiece {
  static createPiece(pieces: PieceList, _r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number): NetherBridgePiece | null {
    const box = orientBox(x, y, z, -3, 0, 0, 9, 7, 9, d);
    return isOkBox(box) && !pieces.findCollision(box) ? new CastleCorridorTBalconyPiece(genDepth, box, d) : null;
  }

  override addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    const d = this.orientation;
    const i = d === 'west' || d === 'north' ? 5 : 1;
    this.generateChildLeft(start as StartPiece, pieces, r, 0, i, r.nextInt(8) > 0);
    this.generateChildRight(start as StartPiece, pieces, r, 0, i, r.nextInt(8) > 0);
  }

  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { BRICKS: B, FENCE: F } = k();
    this.fill(ctx, chunk, 0, 0, 0, 8, 1, 8, B);
    this.fill(ctx, chunk, 0, 2, 0, 8, 5, 8, 0);
    this.fill(ctx, chunk, 0, 6, 0, 8, 6, 5, B);
    this.fill(ctx, chunk, 0, 2, 0, 2, 5, 0, B);
    this.fill(ctx, chunk, 6, 2, 0, 8, 5, 0, B);
    this.fill(ctx, chunk, 1, 3, 0, 1, 4, 0, F);
    this.fill(ctx, chunk, 7, 3, 0, 7, 4, 0, F);
    this.fill(ctx, chunk, 0, 2, 4, 8, 2, 8, B);
    this.fill(ctx, chunk, 1, 1, 4, 2, 2, 4, 0);
    this.fill(ctx, chunk, 6, 1, 4, 7, 2, 4, 0);
    this.fill(ctx, chunk, 1, 3, 8, 7, 3, 8, F);
    this.placeBlock(ctx, F, 0, 3, 8, chunk);
    this.placeBlock(ctx, F, 8, 3, 8, chunk);
    this.fill(ctx, chunk, 0, 3, 6, 0, 3, 7, F);
    this.fill(ctx, chunk, 8, 3, 6, 8, 3, 7, F);
    this.fill(ctx, chunk, 0, 3, 4, 0, 5, 5, B);
    this.fill(ctx, chunk, 8, 3, 4, 8, 5, 5, B);
    this.fill(ctx, chunk, 1, 3, 5, 2, 5, 5, B);
    this.fill(ctx, chunk, 6, 3, 5, 7, 5, 5, B);
    this.fill(ctx, chunk, 1, 4, 5, 1, 5, 5, F);
    this.fill(ctx, chunk, 7, 4, 5, 7, 5, 5, F);
    for (let z = 0; z <= 5; z++) for (let x = 0; x <= 8; x++) this.fillColumnDown(ctx, B, x, -1, z, chunk);
  }
}

// ---------------------------------------------------------------------------
// Starts

export interface FortressStart {
  /** the start chunk (vanilla locate reports its corner) */
  cx: number;
  cz: number;
  pieces: NetherBridgePiece[];
  bounds: BoundingBox;
}

/** vanilla NetherFortressStructure.generatePieces: grow from the start, children picked at random from the queue */
function generateFortress(r: Rand, cx: number, cz: number): FortressStart {
  const start = new StartPiece(r, cx * 16 + 2, cz * 16 + 2);
  const list = new PieceList();
  list.add(start);
  start.addChildren(start, list, r);
  const pending = start.pendingChildren;
  while (pending.length) {
    const i = r.nextInt(pending.length);
    const p = pending.splice(i, 1)[0];
    p.addChildren(start, list, r);
  }
  // vanilla StructurePiecesBuilder.moveInsideHeights(random, 48, 70)
  const bounds = list.bounds();
  const room = 70 - 48 + 1 - bounds.ySpan;
  const y = room > 1 ? 48 + r.nextInt(room) : 48;
  const dy = y - bounds.minY;
  for (const p of list.pieces) p.box.move(0, dy, 0);
  bounds.move(0, dy, 0);
  return { cx, cz, pieces: list.pieces as NetherBridgePiece[], bounds };
}

/** the fortresses of a nether world, generated on demand and cached (the chunk worker and the game each keep one) */
export class NetherFortresses {
  private readonly cache = new Map<number, FortressStart | null>();

  constructor(
    private readonly seed: number,
    private readonly biomeName: (x: number, z: number) => string,
  ) {}

  /** vanilla RandomSpreadStructurePlacement.getPotentialStructureChunk for a region (LINEAR spread) */
  private potentialChunk(rx: number, rz: number): [number, number] {
    const r = new Rand(hash2(rx, rz, this.seed ^ SALT), 0x6e63);
    return [rx * SPACING + r.nextInt(SPACING - SEPARATION), rz * SPACING + r.nextInt(SPACING - SEPARATION)];
  }

  /** the fortress of a 27 x 27-chunk region, if the region has one rather than a bastion */
  startInRegion(rx: number, rz: number): FortressStart | null {
    const key = ((rx & 0xffff) << 16) | (rz & 0xffff);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const [cx, cz] = this.potentialChunk(rx, rz);
    // vanilla ChunkGenerator.createStructures: a weighted pick from the set (fortress 2, bastion remnant 3); if the pick
    // can't generate there, it's struck off and the rest are drawn from. Bastions don't generate in basalt deltas
    // (bastions aren't in the game yet: their regions stay empty, so fortresses are as rare as they should be)
    const pick = new Rand(hash2(cx, cz, this.seed ^ 0x6e657468), 0x7069);
    let fortress = pick.nextInt(5) < 2;
    if (!fortress && this.biomeName(cx * 16 + 8, cz * 16 + 8) === 'basalt_deltas') fortress = true;
    const s = fortress ? generateFortress(new Rand(hash2(cx, cz, this.seed ^ 0x466f7274), 0x7473), cx, cz) : null;
    if (this.cache.size > 256) this.cache.clear();
    this.cache.set(key, s);
    return s;
  }

  /** fortresses whose bounds may reach the chunk (pieces reach at most ~130 blocks from their start) */
  startsNear(cx: number, cz: number): FortressStart[] {
    const out: FortressStart[] = [];
    const rx0 = Math.floor((cx - 9) / SPACING), rx1 = Math.floor((cx + 9) / SPACING);
    const rz0 = Math.floor((cz - 9) / SPACING), rz1 = Math.floor((cz + 9) / SPACING);
    for (let rz = rz0; rz <= rz1; rz++)
      for (let rx = rx0; rx <= rx1; rx++) {
        const s = this.startInRegion(rx, rz);
        if (s) out.push(s);
      }
    return out;
  }

  /** vanilla StructureStart.placeInChunk for every fortress reaching this chunk */
  place(ctx: GenContext, r: Rand): void {
    const chunk = new BoundingBox(ctx.x0, MIN_Y + 1, ctx.z0, ctx.x0 + 15, MAX_Y - 1, ctx.z0 + 15);
    for (const s of this.startsNear(ctx.cx, ctx.cz)) {
      if (!s.bounds.intersects(chunk)) continue;
      for (const p of s.pieces) if (p.box.intersects(chunk)) p.postProcess(ctx, chunk, r);
    }
  }

  /** the fortress whose overall bounds hold a block (vanilla StructureManager.getStructureAt) */
  at(x: number, y: number, z: number): FortressStart | null {
    for (const s of this.startsNear(x >> 4, z >> 4)) if (s.bounds.isInside(x, y, z)) return s;
    return null;
  }

  /** whether a block is inside one of a fortress's pieces (vanilla getStructureWithPieceAt) */
  pieceAt(x: number, y: number, z: number): boolean {
    const s = this.at(x, y, z);
    return !!s && s.pieces.some((p) => p.box.isInside(x, y, z));
  }

  /**
   * vanilla ChunkGenerator.getNearestGeneratedStructure for a random spread: rings of regions around the chunk, and
   * the first one found in the first ring that has any (not always the closest); the corner of its start chunk
   */
  nearest(x: number, z: number, radius = 100): [number, number] | null {
    const cx = x >> 4, cz = z >> 4;
    for (let ring = 0; ring <= radius; ring++)
      for (let i = -ring; i <= ring; i++)
        for (let j = -ring; j <= ring; j++) {
          if (Math.abs(i) !== ring && Math.abs(j) !== ring) continue;
          const s = this.startInRegion(Math.floor((cx + SPACING * i) / SPACING), Math.floor((cz + SPACING * j) / SPACING));
          if (s) return [s.cx * 16, s.cz * 16];
        }
    return null;
  }
}
