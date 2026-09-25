// What the temples' pieces share (vanilla ScatteredFeaturePiece, and the StructurePiece helpers they use): a box of
// width x height x depth laid out from the corner of the start chunk and turned to face one of the four ways, chests
// that turn away from the wall behind them, columns filled down to the ground, and the mobs placed with them.

import type { Rand } from '../../core/rng';
import { LegacyRandom } from './legacyRandom';
import { S, blockOf } from '../block';
import { MIN_Y } from '../constants';
import type { GenContext } from './context';
import type { SavedEntity } from '../../entity/mob';
import { BoundingBox, PieceList, StructurePiece, isAir, isLiquid, solidRender, type Dir4 } from './structure';

/** vanilla Direction.Plane.HORIZONTAL, the order getRandomHorizontalDirection draws from */
export const HORIZONTAL: Dir4[] = ['north', 'east', 'south', 'west'];

const STEP: Record<Dir4, [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const OPP: Record<Dir4, Dir4> = { north: 'south', south: 'north', east: 'west', west: 'east' };
const CW: Record<Dir4, Dir4> = { north: 'east', east: 'south', south: 'west', west: 'north' };

/** vanilla Mth.getSeed: a position's seed */
export function positionSeed(x: number, y: number, z: number): bigint {
  let l = BigInt(Math.imul(x, 3129871)) ^ (BigInt(z) * 116129781n) ^ BigInt(y);
  l = BigInt.asIntN(64, l);
  l = BigInt.asIntN(64, l * l * 42317861n + l * 11n);
  return l >> 16n;
}

/** vanilla RandomSource.create(worldSeed).forkPositional().at(x, y, z): the same draws for the same place in a world */
export function positionalRandom(worldSeed: bigint, x: number, y: number, z: number): LegacyRandom {
  const fork = new LegacyRandom(worldSeed).nextLong();
  return new LegacyRandom(positionSeed(x, y, z) ^ fork);
}

/** vanilla StructurePiece.isReplaceableByStructures */
function replaceableByStructures(st: number): boolean {
  if (isAir(st) || isLiquid(st)) return true;
  const n = blockOf(st).name;
  return n === 'glow_lichen' || n === 'seagrass' || n === 'tall_seagrass';
}

/** vanilla StructurePiece.makeBoundingBox: the box of a width x height x depth piece from its corner, turned to face `d` */
function makeBoundingBox(x: number, y: number, z: number, d: Dir4, w: number, h: number, depth: number): BoundingBox {
  return d === 'north' || d === 'south' ? new BoundingBox(x, y, z, x + w - 1, y + h - 1, z + depth - 1) : new BoundingBox(x, y, z, x + depth - 1, y + h - 1, z + w - 1);
}

/** vanilla ScatteredFeaturePiece */
export abstract class ScatteredPiece extends StructurePiece {
  constructor(readonly worldSeed: bigint, x: number, y: number, z: number, readonly width: number, readonly height: number, readonly depth: number, d: Dir4) {
    super(0, makeBoundingBox(x, y, z, d, width, height, depth));
    this.setOrientation(d);
  }

  addChildren(_start: StructurePiece, _pieces: PieceList, _r: Rand): void {}

  /** where the piece's height adjustment put it (vanilla boundingBox.move to heightPosition) */
  moveToY(y: number): void {
    this.box.move(0, y - this.box.minY, 0);
  }

  /** vanilla getWorldPos */
  worldPos(x: number, y: number, z: number): [number, number, number] {
    return [this.worldX(x, z), this.worldY(y), this.worldZ(x, z)];
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

  /**
   * whether this piece leaves a full block at a local position, for a chest looking at a neighbour over the edge of
   * the chunk (vanilla looks at whatever that chunk has so far)
   */
  protected solidHint(_x: number, _y: number, _z: number): boolean {
    return true;
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

  /**
   * vanilla StructurePiece.reorient: next to another chest it keeps the state it has; backed by exactly one full
   * block it faces away from it; otherwise it starts from its own facing and turns (opposite, clockwise, opposite)
   * while a full block is in front
   */
  private reorient(ctx: GenContext, wx: number, wy: number, wz: number, st: number): number {
    const at = (d: Dir4): number => ctx.get(wx + STEP[d][0], wy, wz + STEP[d][1]);
    const solid = (d: Dir4): boolean => {
      const s = at(d);
      if (s >= 0) return solidRender(s);
      const [lx, lz] = this.localXZ(wx + STEP[d][0], wz + STEP[d][1]);
      return this.solidHint(lx, wy - this.box.minY, lz);
    };
    let wall: Dir4 | null = null;
    for (const d of HORIZONTAL) {
      const s = at(d);
      if (s >= 0 && blockOf(s).name === 'chest') return st;
      if (!solid(d)) continue;
      if (wall !== null) {
        wall = null;
        break;
      }
      wall = d;
    }
    const b = blockOf(st);
    if (wall !== null) return b.with(st, 'facing', OPP[wall]);
    let f = b.get<string>(st, 'facing') as Dir4;
    if (solid(f)) f = OPP[f];
    if (solid(f)) f = CW[f];
    if (solid(f)) f = OPP[f];
    return b.with(st, 'facing', f);
  }

  /**
   * vanilla StructurePiece.createChest: a chest with a loot table (and its seed) at a local position in this chunk,
   * turned by reorient unless a state is given; false where it isn't placed here
   */
  protected createChest(ctx: GenContext, chunk: BoundingBox, r: Rand, x: number, y: number, z: number, lootTable: string, state?: number): boolean {
    const [wx, wy, wz] = this.worldPos(x, y, z);
    if (!chunk.isInside(wx, wy, wz) || blockOf(ctx.getOrAir(wx, wy, wz)).name === 'chest') return false;
    ctx.set(wx, wy, wz, state ?? this.reorient(ctx, wx, wy, wz, S('chest')));
    ctx.blockEntities.push({ id: 'chest', x: wx, y: wy, z: wz, items: [], data: { lootTable, lootSeed: r.nextU32() } });
    return true;
  }

  /** a mob placed with the structure where a local block is in this chunk, at the middle of the block (e.g. vanilla SwampHutPiece.spawnWitch) */
  protected addMob(ctx: GenContext, chunk: BoundingBox, x: number, y: number, z: number, e: Partial<SavedEntity> & { id: string; health: number }): boolean {
    const [wx, wy, wz] = this.worldPos(x, y, z);
    if (!chunk.isInside(wx, wy, wz)) return false;
    ctx.entities.push({ x: wx + 0.5, y: wy, z: wz + 0.5, yaw: 0, pitch: 0, dx: 0, dy: 0, dz: 0, fire: 0, ...e });
    return true;
  }
}
