// Structure pieces (vanilla BoundingBox / StructurePiece / StructurePiecesBuilder):
// a piece works in its own local coordinates, which its orientation turns into
// world positions (and block states are mirrored/rotated to match). Pieces
// are placed chunk by chunk: every helper is clipped to the chunk's box.

import { Rand } from '../../core/rng';
import { blockOf, getBlock, FLAGS, FACE_OCC, F_AIR, F_WATER, F_LAVA, F_FULL_COLLISION } from '../block';
import type { GenContext } from './context';

export type Dir4 = 'north' | 'south' | 'west' | 'east';

export class BoundingBox {
  constructor(public minX: number, public minY: number, public minZ: number, public maxX: number, public maxY: number, public maxZ: number) {}
  move(dx: number, dy: number, dz: number): this {
    this.minX += dx;
    this.minY += dy;
    this.minZ += dz;
    this.maxX += dx;
    this.maxY += dy;
    this.maxZ += dz;
    return this;
  }
  intersects(o: BoundingBox): boolean {
    return this.maxX >= o.minX && this.minX <= o.maxX && this.maxZ >= o.minZ && this.minZ <= o.maxZ && this.maxY >= o.minY && this.minY <= o.maxY;
  }
  isInside(x: number, y: number, z: number): boolean {
    return x >= this.minX && x <= this.maxX && z >= this.minZ && z <= this.maxZ && y >= this.minY && y <= this.maxY;
  }
  get xSpan(): number {
    return this.maxX - this.minX + 1;
  }
  get ySpan(): number {
    return this.maxY - this.minY + 1;
  }
  get zSpan(): number {
    return this.maxZ - this.minZ + 1;
  }
  encapsulate(o: BoundingBox): void {
    this.minX = Math.min(this.minX, o.minX);
    this.minY = Math.min(this.minY, o.minY);
    this.minZ = Math.min(this.minZ, o.minZ);
    this.maxX = Math.max(this.maxX, o.maxX);
    this.maxY = Math.max(this.maxY, o.maxY);
    this.maxZ = Math.max(this.maxZ, o.maxZ);
  }
}

/** vanilla StructurePiecesBuilder */
export class PieceList {
  readonly pieces: StructurePiece[] = [];
  add(p: StructurePiece): void {
    this.pieces.push(p);
  }
  findCollision(box: BoundingBox): StructurePiece | null {
    for (const p of this.pieces) if (p.box.intersects(box)) return p;
    return null;
  }
  bounds(): BoundingBox {
    const b = this.pieces[0].box;
    const out = new BoundingBox(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
    for (const p of this.pieces) out.encapsulate(p.box);
    return out;
  }
}

const CW: Record<Dir4, Dir4> = { north: 'east', east: 'south', south: 'west', west: 'north' };
const FLIP_NS: Record<Dir4, Dir4> = { north: 'south', south: 'north', east: 'east', west: 'west' };
// vanilla RailBlock.rotate(CLOCKWISE_90) / mirror(LEFT_RIGHT)
const RAIL_CW: Record<string, string> = {
  north_south: 'east_west', east_west: 'north_south', ascending_east: 'ascending_south', ascending_west: 'ascending_north',
  ascending_north: 'ascending_east', ascending_south: 'ascending_west', south_east: 'south_west', south_west: 'north_west', north_west: 'north_east', north_east: 'south_east',
};
const RAIL_FLIP: Record<string, string> = { ascending_north: 'ascending_south', ascending_south: 'ascending_north', north_east: 'south_east', south_east: 'north_east', north_west: 'south_west', south_west: 'north_west' };

// vanilla StairBlock.mirror: a stair facing along z swaps its corners' left and right
const STAIR_FLIP: Record<string, string> = { inner_left: 'inner_right', inner_right: 'inner_left', outer_left: 'outer_right', outer_right: 'outer_left' };

/** vanilla BlockState.mirror(LEFT_RIGHT) then rotate(CLOCKWISE_90), for the properties pieces use */
function transformState(st: number, flip: boolean, rot: boolean): number {
  const b = blockOf(st);
  if (b.propIndex('facing') >= 0) {
    let f = b.get<string>(st, 'facing') as Dir4;
    if (f in CW) {
      if (flip && (f === 'north' || f === 'south') && b.name.endsWith('_stairs')) st = b.with(st, 'shape', STAIR_FLIP[b.get<string>(st, 'shape')] ?? 'straight');
      if (flip) f = FLIP_NS[f];
      if (rot) f = CW[f];
      st = b.with(st, 'facing', f);
    }
  }
  // vanilla VineBlock, TripWireBlock, RedStoneWireBlock, CrossCollisionBlock...: a property per side, turned with the block
  if (b.propIndex('north') >= 0 && b.propIndex('east') >= 0 && b.propIndex('south') >= 0 && b.propIndex('west') >= 0) {
    let n = b.get(st, 'north'), e = b.get(st, 'east'), s = b.get(st, 'south'), w = b.get(st, 'west');
    if (flip) [n, s] = [s, n];
    if (rot) [n, e, s, w] = [w, n, e, s];
    st = b.with(b.with(b.with(b.with(st, 'north', n), 'east', e), 'south', s), 'west', w);
  }
  // vanilla RotatedPillarBlock.rotate: a quarter turn swaps x and z
  if (rot && b.propIndex('axis') >= 0 && b.get(st, 'axis') !== 'y') st = b.with(st, 'axis', b.get(st, 'axis') === 'x' ? 'z' : 'x');
  // vanilla DoorBlock.mirror: the hinge goes to the other side
  if (flip && b.propIndex('hinge') >= 0) st = b.with(st, 'hinge', b.get(st, 'hinge') === 'left' ? 'right' : 'left');
  if (b.name === 'rail') {
    let s = b.get<string>(st, 'shape');
    if (flip) s = RAIL_FLIP[s] ?? s;
    if (rot) s = RAIL_CW[s];
    st = b.with(st, 'shape', s);
  }
  return st;
}

export function isAir(st: number): boolean {
  return st <= 0 || (FLAGS[st] & F_AIR) !== 0;
}

export function isLiquid(st: number): boolean {
  return st > 0 && (FLAGS[st] & (F_WATER | F_LAVA)) !== 0;
}

/** vanilla isFaceSturdy(UP) / canSupportCenter: a full top face */
export function sturdyUp(st: number): boolean {
  return st > 0 && ((FLAGS[st] & F_FULL_COLLISION) !== 0 || (FACE_OCC[st] & 2) !== 0);
}

/** vanilla isSolidRender: full opaque cube */
export function solidRender(st: number): boolean {
  return st > 0 && FACE_OCC[st] === 63;
}

export abstract class StructurePiece {
  orientation: Dir4 | null = null;
  private flip = false;
  private rot = false;

  constructor(readonly genDepth: number, public box: BoundingBox) {}

  /** vanilla setOrientation: south mirrors, east rotates, west does both */
  setOrientation(d: Dir4 | null): void {
    this.orientation = d;
    this.flip = d === 'south' || d === 'west';
    this.rot = d === 'east' || d === 'west';
  }

  abstract addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void;
  abstract postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void;

  worldX(x: number, z: number): number {
    switch (this.orientation) {
      case 'north': case 'south': return this.box.minX + x;
      case 'west': return this.box.maxX - z;
      case 'east': return this.box.minX + z;
      default: return x;
    }
  }
  worldY(y: number): number {
    return this.orientation === null ? y : y + this.box.minY;
  }
  worldZ(x: number, z: number): number {
    switch (this.orientation) {
      case 'north': return this.box.maxZ - z;
      case 'south': return this.box.minZ + z;
      case 'west': case 'east': return this.box.minZ + x;
      default: return z;
    }
  }

  /** the block at a local position, air outside the chunk being generated */
  getBlock(ctx: GenContext, x: number, y: number, z: number, chunk: BoundingBox): number {
    const wx = this.worldX(x, z), wy = this.worldY(y), wz = this.worldZ(x, z);
    return chunk.isInside(wx, wy, wz) ? ctx.getOrAir(wx, wy, wz) : 0;
  }

  protected canBeReplaced(_ctx: GenContext, _x: number, _y: number, _z: number, _chunk: BoundingBox): boolean {
    return true;
  }

  placeBlock(ctx: GenContext, st: number, x: number, y: number, z: number, chunk: BoundingBox): void {
    const wx = this.worldX(x, z), wy = this.worldY(y), wz = this.worldZ(x, z);
    if (!chunk.isInside(wx, wy, wz) || !this.canBeReplaced(ctx, x, y, z, chunk)) return;
    if (this.flip || this.rot) st = transformState(st, this.flip, this.rot);
    ctx.set(wx, wy, wz, st);
    if (isLiquid(st)) ctx.scheduleFluid(wx, wy, wz);
    // vanilla SHAPE_CHECK_BLOCKS: connections are fixed up once the chunk loads
    if (blockOf(st).name.endsWith('_fence')) ctx.markForPostprocessing(wx, wy, wz);
  }

  generateBox(ctx: GenContext, chunk: BoundingBox, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, edge: number, inside: number, existingOnly: boolean): void {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) {
          if (existingOnly && isAir(this.getBlock(ctx, x, y, z, chunk))) continue;
          const onEdge = y === y0 || y === y1 || x === x0 || x === x1 || z === z0 || z === z1;
          this.placeBlock(ctx, onEdge ? edge : inside, x, y, z, chunk);
        }
  }

  generateMaybeBox(ctx: GenContext, chunk: BoundingBox, r: Rand, chance: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, edge: number, inside: number, requireNonAir: boolean, requireInterior: boolean): void {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) {
          if (r.nextFloat() > chance) continue;
          if (requireNonAir && isAir(this.getBlock(ctx, x, y, z, chunk))) continue;
          if (requireInterior && !this.isInterior(ctx, x, y, z, chunk)) continue;
          const onEdge = y === y0 || y === y1 || x === x0 || x === x1 || z === z0 || z === z1;
          this.placeBlock(ctx, onEdge ? edge : inside, x, y, z, chunk);
        }
  }

  maybeGenerateBlock(ctx: GenContext, chunk: BoundingBox, r: Rand, chance: number, x: number, y: number, z: number, st: number): void {
    if (r.nextFloat() < chance) this.placeBlock(ctx, st, x, y, z, chunk);
  }

  generateUpperHalfSphere(ctx: GenContext, chunk: BoundingBox, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, st: number, excludeAir: boolean): void {
    const fx = x1 - x0 + 1, fy = y1 - y0 + 1, fz = z1 - z0 + 1;
    const cx = x0 + fx / 2, cz = z0 + fz / 2;
    for (let y = y0; y <= y1; y++) {
      const dy = (y - y0) / fy;
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / (fx * 0.5);
        for (let z = z0; z <= z1; z++) {
          const dz = (z - cz) / (fz * 0.5);
          if (excludeAir && isAir(this.getBlock(ctx, x, y, z, chunk))) continue;
          if (dx * dx + dy * dy + dz * dz <= 1.05) this.placeBlock(ctx, st, x, y, z, chunk);
        }
      }
    }
  }

  /** vanilla isInterior: the block above is in this chunk and below the ocean-floor heightmap */
  isInterior(ctx: GenContext, x: number, y: number, z: number, chunk: BoundingBox): boolean {
    const wx = this.worldX(x, z), wy = this.worldY(y + 1), wz = this.worldZ(x, z);
    return chunk.isInside(wx, wy, wz) && wy < ctx.heightOceanFloor(wx, wz);
  }
}

export { getBlock };
