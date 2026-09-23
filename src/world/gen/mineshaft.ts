// Mineshafts (vanilla MineshaftStructure + MineshaftPieces): 0.4% of chunks
// start one, a room below sea level that branches into corridors, crossings
// and stairs up to 8 pieces deep and 80 blocks out. Corridors have support
// beams, rails, cobwebs, chest minecarts and the odd cave spider spawner; where
// they cross caves, plank bridges are held up by log pillars or chains.

import { Rand, hash2 } from '../../core/rng';
import { S, getBlock, blockOf } from '../block';
import { MIN_Y, MAX_Y, SEA_LEVEL } from '../constants';
import type { GenContext } from './context';
import { BoundingBox, PieceList, StructurePiece, Dir4, isAir, isLiquid, sturdyUp, solidRender } from './structure';

type ShaftType = 'normal' | 'mesa';

interface Materials {
  planks: number;
  wood: number;
  fence: number;
}

let MATERIALS: Record<ShaftType, Materials> | null = null;
function materials(t: ShaftType): Materials {
  MATERIALS ??= {
    normal: { planks: S('oak_planks'), wood: S('oak_log'), fence: S('oak_fence') },
    mesa: { planks: S('dark_oak_planks'), wood: S('dark_oak_log'), fence: S('dark_oak_fence') },
  };
  return MATERIALS[t];
}

const LOOT = 'chests/abandoned_mineshaft';

/** vanilla StructurePiece.isReplaceableByStructures */
function replaceableByStructures(st: number): boolean {
  if (isAir(st) || isLiquid(st)) return true;
  const n = blockOf(st).name;
  return n === 'glow_lichen' || n === 'seagrass' || n === 'tall_seagrass';
}

const FALLING = /^(sand|red_sand|gravel|.*_concrete_powder|anvil|chipped_anvil|damaged_anvil|dragon_egg|pointed_dripstone|scaffolding|suspicious_sand|suspicious_gravel)$/;

abstract class MineShaftPiece extends StructurePiece {
  constructor(genDepth: number, box: BoundingBox, readonly type: ShaftType) {
    super(genDepth, box);
  }

  /** vanilla MineShaftPiece.canBeReplaced: never over another piece's woodwork */
  protected override canBeReplaced(ctx: GenContext, x: number, y: number, z: number, chunk: BoundingBox): boolean {
    const st = this.getBlock(ctx, x, y, z, chunk);
    const m = materials(this.type);
    const b = blockOf(st);
    return b !== blockOf(m.planks) && b !== blockOf(m.wood) && b !== blockOf(m.fence) && b.name !== 'chain';
  }

  protected isSupportingBox(ctx: GenContext, chunk: BoundingBox, x0: number, x1: number, y: number, z: number): boolean {
    for (let x = x0; x <= x1; x++) if (isAir(this.getBlock(ctx, x, y + 1, z, chunk))) return false;
    return true;
  }

  /** vanilla isInInvalidLocation: any liquid on the faces of the piece's part in this chunk */
  protected isInInvalidLocation(ctx: GenContext, chunk: BoundingBox): boolean {
    const x0 = Math.max(this.box.minX - 1, chunk.minX), y0 = Math.max(this.box.minY - 1, chunk.minY), z0 = Math.max(this.box.minZ - 1, chunk.minZ);
    const x1 = Math.min(this.box.maxX + 1, chunk.maxX), y1 = Math.min(this.box.maxY + 1, chunk.maxY), z1 = Math.min(this.box.maxZ + 1, chunk.maxZ);
    const liquid = (x: number, y: number, z: number) => isLiquid(ctx.getOrAir(x, y, z));
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) if (liquid(x, y0, z) || liquid(x, y1, z)) return true;
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) if (liquid(x, y, z0) || liquid(x, y, z1)) return true;
    for (let z = z0; z <= z1; z++)
      for (let y = y0; y <= y1; y++) if (liquid(x0, y, z) || liquid(x1, y, z)) return true;
    return false;
  }

  /** vanilla setPlanksBlock: bridge any floor that isn't sturdy */
  protected setPlanksBlock(ctx: GenContext, chunk: BoundingBox, planks: number, x: number, y: number, z: number): void {
    if (!this.isInterior(ctx, x, y, z, chunk)) return;
    const wx = this.worldX(x, z), wy = this.worldY(y), wz = this.worldZ(x, z);
    if (!sturdyUp(ctx.getOrAir(wx, wy, wz))) ctx.set(wx, wy, wz, planks);
  }
}

// ---------------------------------------------------------------------------
// Piece generation

function createRandomShaftPiece(pieces: PieceList, r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number, type: ShaftType): MineShaftPiece | null {
  const i = r.nextInt(100);
  if (i >= 80) {
    const box = MineShaftCrossing.findCrossing(pieces, r, x, y, z, d);
    if (box) return new MineShaftCrossing(genDepth, box, d, type);
  } else if (i >= 70) {
    const box = MineShaftStairs.findStairs(pieces, x, y, z, d);
    if (box) return new MineShaftStairs(genDepth, box, d, type);
  } else {
    const box = MineShaftCorridor.findCorridorSize(pieces, r, x, y, z, d);
    if (box) return new MineShaftCorridor(genDepth, r, box, d, type);
  }
  return null;
}

function generateAndAddPiece(start: StructurePiece, pieces: PieceList, r: Rand, x: number, y: number, z: number, d: Dir4, genDepth: number): MineShaftPiece | null {
  if (genDepth > 8) return null;
  if (Math.abs(x - start.box.minX) > 80 || Math.abs(z - start.box.minZ) > 80) return null;
  const piece = createRandomShaftPiece(pieces, r, x, y, z, d, genDepth + 1, (start as MineShaftPiece).type);
  if (piece) {
    pieces.add(piece);
    piece.addChildren(start, pieces, r);
  }
  return piece;
}

// ---------------------------------------------------------------------------
// Room: the start, an open chamber with a domed roof

class MineShaftRoom extends MineShaftPiece {
  private readonly childEntranceBoxes: BoundingBox[] = [];

  constructor(genDepth: number, r: Rand, x: number, z: number, type: ShaftType) {
    super(genDepth, new BoundingBox(x, 50, z, x + 7 + r.nextInt(6), 54 + r.nextInt(6), z + 7 + r.nextInt(6)), type);
  }

  addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    const depth = this.genDepth, b = this.box;
    let j = b.ySpan - 3 - 1;
    if (j <= 0) j = 1;
    const side = (span: number, make: (k: number) => MineShaftPiece | null, entrance: (p: BoundingBox) => BoundingBox) => {
      for (let k = 0; k < span; k += 4) {
        k += r.nextInt(span);
        if (k + 3 > span) break;
        const p = make(k);
        if (p) this.childEntranceBoxes.push(entrance(p.box));
      }
    };
    side(b.xSpan, (k) => generateAndAddPiece(start, pieces, r, b.minX + k, b.minY + r.nextInt(j) + 1, b.minZ - 1, 'north', depth), (p) => new BoundingBox(p.minX, p.minY, b.minZ, p.maxX, p.maxY, b.minZ + 1));
    side(b.xSpan, (k) => generateAndAddPiece(start, pieces, r, b.minX + k, b.minY + r.nextInt(j) + 1, b.maxZ + 1, 'south', depth), (p) => new BoundingBox(p.minX, p.minY, b.maxZ - 1, p.maxX, p.maxY, b.maxZ));
    side(b.zSpan, (k) => generateAndAddPiece(start, pieces, r, b.minX - 1, b.minY + r.nextInt(j) + 1, b.minZ + k, 'west', depth), (p) => new BoundingBox(b.minX, p.minY, p.minZ, b.minX + 1, p.maxY, p.maxZ));
    side(b.zSpan, (k) => generateAndAddPiece(start, pieces, r, b.maxX + 1, b.minY + r.nextInt(j) + 1, b.minZ + k, 'east', depth), (p) => new BoundingBox(b.maxX - 1, p.minY, p.minZ, b.maxX, p.maxY, p.maxZ));
  }

  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    if (this.isInInvalidLocation(ctx, chunk)) return;
    const b = this.box;
    this.generateBox(ctx, chunk, b.minX, b.minY + 1, b.minZ, b.maxX, Math.min(b.minY + 3, b.maxY), b.maxZ, 0, 0, false);
    for (const e of this.childEntranceBoxes) this.generateBox(ctx, chunk, e.minX, e.maxY - 2, e.minZ, e.maxX, e.maxY, e.maxZ, 0, 0, false);
    this.generateUpperHalfSphere(ctx, chunk, b.minX, b.minY + 4, b.minZ, b.maxX, b.maxY, b.maxZ, 0, false);
  }
}

// ---------------------------------------------------------------------------
// Corridor: 3x3 tunnel in 5-block sections

class MineShaftCorridor extends MineShaftPiece {
  private readonly hasRails: boolean;
  private readonly spiderCorridor: boolean;
  private hasPlacedSpider = false;
  private readonly numSections: number;

  constructor(genDepth: number, r: Rand, box: BoundingBox, d: Dir4, type: ShaftType) {
    super(genDepth, box, type);
    this.setOrientation(d);
    this.hasRails = r.nextInt(3) === 0;
    this.spiderCorridor = !this.hasRails && r.nextInt(23) === 0;
    this.numSections = (d === 'north' || d === 'south' ? box.zSpan : box.xSpan) / 5;
  }

  static findCorridorSize(pieces: PieceList, r: Rand, x: number, y: number, z: number, d: Dir4): BoundingBox | null {
    for (let i = r.nextInt(3) + 2; i > 0; i--) {
      const j = i * 5;
      const box =
        d === 'south' ? new BoundingBox(0, 0, 0, 2, 2, j - 1)
        : d === 'west' ? new BoundingBox(-(j - 1), 0, 0, 0, 2, 2)
        : d === 'east' ? new BoundingBox(0, 0, 0, j - 1, 2, 2)
        : new BoundingBox(0, 0, -(j - 1), 2, 2, 0);
      box.move(x, y, z);
      if (!pieces.findCollision(box)) return box;
    }
    return null;
  }

  addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    const depth = this.genDepth, b = this.box;
    const j = r.nextInt(4);
    const d = this.orientation!;
    const yy = () => b.minY - 1 + r.nextInt(3);
    switch (d) {
      case 'north':
        if (j <= 1) generateAndAddPiece(start, pieces, r, b.minX, yy(), b.minZ - 1, d, depth);
        else if (j === 2) generateAndAddPiece(start, pieces, r, b.minX - 1, yy(), b.minZ, 'west', depth);
        else generateAndAddPiece(start, pieces, r, b.maxX + 1, yy(), b.minZ, 'east', depth);
        break;
      case 'south':
        if (j <= 1) generateAndAddPiece(start, pieces, r, b.minX, yy(), b.maxZ + 1, d, depth);
        else if (j === 2) generateAndAddPiece(start, pieces, r, b.minX - 1, yy(), b.maxZ - 3, 'west', depth);
        else generateAndAddPiece(start, pieces, r, b.maxX + 1, yy(), b.maxZ - 3, 'east', depth);
        break;
      case 'west':
        if (j <= 1) generateAndAddPiece(start, pieces, r, b.minX - 1, yy(), b.minZ, d, depth);
        else if (j === 2) generateAndAddPiece(start, pieces, r, b.minX, yy(), b.minZ - 1, 'north', depth);
        else generateAndAddPiece(start, pieces, r, b.minX, yy(), b.maxZ + 1, 'south', depth);
        break;
      case 'east':
        if (j <= 1) generateAndAddPiece(start, pieces, r, b.maxX + 1, yy(), b.minZ, d, depth);
        else if (j === 2) generateAndAddPiece(start, pieces, r, b.maxX - 3, yy(), b.minZ - 1, 'north', depth);
        else generateAndAddPiece(start, pieces, r, b.maxX - 3, yy(), b.maxZ + 1, 'south', depth);
        break;
    }
    if (depth < 8) {
      if (d !== 'north' && d !== 'south') {
        for (let x = b.minX + 3; x + 3 <= b.maxX; x += 5) {
          const k = r.nextInt(5);
          if (k === 0) generateAndAddPiece(start, pieces, r, x, b.minY, b.minZ - 1, 'north', depth + 1);
          else if (k === 1) generateAndAddPiece(start, pieces, r, x, b.minY, b.maxZ + 1, 'south', depth + 1);
        }
      } else {
        for (let z = b.minZ + 3; z + 3 <= b.maxZ; z += 5) {
          const k = r.nextInt(5);
          if (k === 0) generateAndAddPiece(start, pieces, r, b.minX - 1, b.minY, z, 'west', depth + 1);
          else if (k === 1) generateAndAddPiece(start, pieces, r, b.maxX + 1, b.minY, z, 'east', depth + 1);
        }
      }
    }
  }

  /** vanilla MineShaftCorridor.createChest: a rail with a chest minecart standing on it */
  private createChest(ctx: GenContext, chunk: BoundingBox, r: Rand, x: number, y: number, z: number): void {
    const wx = this.worldX(x, z), wy = this.worldY(y), wz = this.worldZ(x, z);
    if (!chunk.isInside(wx, wy, wz) || !isAir(ctx.getOrAir(wx, wy, wz)) || isAir(ctx.getOrAir(wx, wy - 1, wz))) return;
    const rail = getBlock('rail');
    this.placeBlock(ctx, rail.with(rail.defaultState, 'shape', r.nextBool() ? 'north_south' : 'east_west'), x, y, z, chunk);
    ctx.entities.push({ id: 'chest_minecart', x: wx + 0.5, y: wy + 0.5, z: wz + 0.5, yaw: 0, pitch: 0, dx: 0, dy: 0, dz: 0, health: 0, fire: 0, data: { lootTable: LOOT, lootSeed: r.nextU32() } });
  }

  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    if (this.isInInvalidLocation(ctx, chunk)) return;
    const len = this.numSections * 5 - 1;
    const m = materials(this.type);
    const COBWEB = S('cobweb');
    this.generateBox(ctx, chunk, 0, 0, 0, 2, 1, len, 0, 0, false);
    this.generateMaybeBox(ctx, chunk, r, 0.8, 0, 2, 0, 2, 2, len, 0, 0, false, false);
    if (this.spiderCorridor) this.generateMaybeBox(ctx, chunk, r, 0.6, 0, 0, 0, 2, 1, len, COBWEB, 0, false, true);
    for (let s = 0; s < this.numSections; s++) {
      const z = 2 + s * 5;
      this.placeSupport(ctx, chunk, 0, 0, z, 2, 2, r);
      this.maybePlaceCobWeb(ctx, chunk, r, 0.1, 0, 2, z - 1);
      this.maybePlaceCobWeb(ctx, chunk, r, 0.1, 2, 2, z - 1);
      this.maybePlaceCobWeb(ctx, chunk, r, 0.1, 0, 2, z + 1);
      this.maybePlaceCobWeb(ctx, chunk, r, 0.1, 2, 2, z + 1);
      this.maybePlaceCobWeb(ctx, chunk, r, 0.05, 0, 2, z - 2);
      this.maybePlaceCobWeb(ctx, chunk, r, 0.05, 2, 2, z - 2);
      this.maybePlaceCobWeb(ctx, chunk, r, 0.05, 0, 2, z + 2);
      this.maybePlaceCobWeb(ctx, chunk, r, 0.05, 2, 2, z + 2);
      if (r.nextInt(100) === 0) this.createChest(ctx, chunk, r, 2, 0, z - 1);
      if (r.nextInt(100) === 0) this.createChest(ctx, chunk, r, 0, 0, z + 1);
      if (this.spiderCorridor && !this.hasPlacedSpider) {
        const sz = z - 1 + r.nextInt(3);
        const wx = this.worldX(1, sz), wy = this.worldY(0), wz = this.worldZ(1, sz);
        if (chunk.isInside(wx, wy, wz) && this.isInterior(ctx, 1, 0, sz, chunk)) {
          this.hasPlacedSpider = true;
          ctx.set(wx, wy, wz, S('spawner'));
          ctx.blockEntities.push({ id: 'spawner', x: wx, y: wy, z: wz, items: [], data: { entity: 'cave_spider', delay: 20 } });
        }
      }
    }
    for (let x = 0; x <= 2; x++) for (let z = 0; z <= len; z++) this.setPlanksBlock(ctx, chunk, m.planks, x, -1, z);
    this.placeDoubleLowerOrUpperSupport(ctx, chunk, 0, -1, 2);
    if (this.numSections > 1) this.placeDoubleLowerOrUpperSupport(ctx, chunk, 0, -1, len - 2);
    if (this.hasRails) {
      const rail = S('rail');
      for (let z = 0; z <= len; z++) {
        const below = this.getBlock(ctx, 1, -1, z, chunk);
        if (!isAir(below) && solidRender(below)) this.maybeGenerateBlock(ctx, chunk, r, this.isInterior(ctx, 1, 0, z, chunk) ? 0.7 : 0.9, 1, 0, z, rail);
      }
    }
  }

  /** where the floor under a support had to be bridged, hold it up from below or hang it from above */
  private placeDoubleLowerOrUpperSupport(ctx: GenContext, chunk: BoundingBox, x: number, y: number, z: number): void {
    const m = materials(this.type);
    if (blockOf(this.getBlock(ctx, x, y, z, chunk)) === blockOf(m.planks)) this.fillPillarDownOrChainUp(ctx, chunk, m.wood, x, y, z);
    if (blockOf(this.getBlock(ctx, x + 2, y, z, chunk)) === blockOf(m.planks)) this.fillPillarDownOrChainUp(ctx, chunk, m.wood, x + 2, y, z);
  }

  private fillPillarDownOrChainUp(ctx: GenContext, chunk: BoundingBox, pillar: number, x: number, y: number, z: number): void {
    const wx = this.worldX(x, z), wy = this.worldY(y), wz = this.worldZ(x, z);
    if (!chunk.isInside(wx, wy, wz)) return;
    let down = true, up = true;
    for (let j = 1; down || up; j++) {
      if (down) {
        const st = ctx.getOrAir(wx, wy - j, wz);
        const open = replaceableByStructures(st) && blockOf(st).name !== 'lava';
        if (!open && sturdyUp(st)) {
          for (let yy = wy - j + 1; yy < wy; yy++) ctx.set(wx, yy, wz, pillar);
          return;
        }
        down = j <= 20 && open && wy - j > MIN_Y + 1;
      }
      if (up) {
        const st = ctx.getOrAir(wx, wy + j, wz);
        const open = replaceableByStructures(st);
        if (!open && sturdyUp(st) && !FALLING.test(blockOf(st).name)) {
          ctx.set(wx, wy + 1, wz, materials(this.type).fence);
          ctx.markForPostprocessing(wx, wy + 1, wz);
          const chain = S('chain');
          for (let yy = wy + 2; yy < wy + j; yy++) ctx.set(wx, yy, wz, chain);
          return;
        }
        up = j <= 50 && open && wy + j < MAX_Y - 1;
      }
    }
  }

  private placeSupport(ctx: GenContext, chunk: BoundingBox, x0: number, y0: number, z: number, y1: number, x1: number, r: Rand): void {
    if (!this.isSupportingBox(ctx, chunk, x0, x1, y1, z)) return;
    const m = materials(this.type);
    this.generateBox(ctx, chunk, x0, y0, z, x0, y1 - 1, z, m.fence, 0, false);
    this.generateBox(ctx, chunk, x1, y0, z, x1, y1 - 1, z, m.fence, 0, false);
    if (r.nextInt(4) === 0) {
      this.generateBox(ctx, chunk, x0, y1, z, x0, y1, z, m.planks, 0, false);
      this.generateBox(ctx, chunk, x1, y1, z, x1, y1, z, m.planks, 0, false);
    } else {
      this.generateBox(ctx, chunk, x0, y1, z, x1, y1, z, m.planks, 0, false);
      const torch = getBlock('wall_torch');
      this.maybeGenerateBlock(ctx, chunk, r, 0.05, x0 + 1, y1, z - 1, torch.with(torch.defaultState, 'facing', 'south'));
      this.maybeGenerateBlock(ctx, chunk, r, 0.05, x0 + 1, y1, z + 1, torch.with(torch.defaultState, 'facing', 'north'));
    }
  }

  private maybePlaceCobWeb(ctx: GenContext, chunk: BoundingBox, r: Rand, chance: number, x: number, y: number, z: number): void {
    if (this.isInterior(ctx, x, y, z, chunk) && r.nextFloat() < chance && this.hasSturdyNeighbours(ctx, chunk, x, y, z, 2)) this.placeBlock(ctx, S('cobweb'), x, y, z, chunk);
  }

  private hasSturdyNeighbours(ctx: GenContext, chunk: BoundingBox, x: number, y: number, z: number, required: number): boolean {
    const wx = this.worldX(x, z), wy = this.worldY(y), wz = this.worldZ(x, z);
    let n = 0;
    for (const [dx, dy, dz] of [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]]) {
      const px = wx + dx, py = wy + dy, pz = wz + dz;
      // the face towards the cobweb must be a full square (full blocks are sturdy on every side)
      if (chunk.isInside(px, py, pz) && sturdyUp(ctx.getOrAir(px, py, pz)) && ++n >= required) return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Crossing: a 5x5 junction (sometimes two floors) with corner pillars

class MineShaftCrossing extends MineShaftPiece {
  private readonly twoFloored: boolean;

  constructor(genDepth: number, box: BoundingBox, private readonly dir: Dir4, type: ShaftType) {
    super(genDepth, box, type);
    this.twoFloored = box.ySpan > 3;
  }

  static findCrossing(pieces: PieceList, r: Rand, x: number, y: number, z: number, d: Dir4): BoundingBox | null {
    const h = r.nextInt(4) === 0 ? 6 : 2;
    const box =
      d === 'south' ? new BoundingBox(-1, 0, 0, 3, h, 4)
      : d === 'west' ? new BoundingBox(-4, 0, -1, 0, h, 3)
      : d === 'east' ? new BoundingBox(0, 0, -1, 4, h, 3)
      : new BoundingBox(-1, 0, -4, 3, h, 0);
    box.move(x, y, z);
    return pieces.findCollision(box) ? null : box;
  }

  addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    const depth = this.genDepth, b = this.box;
    const n = () => generateAndAddPiece(start, pieces, r, b.minX + 1, b.minY, b.minZ - 1, 'north', depth);
    const s = () => generateAndAddPiece(start, pieces, r, b.minX + 1, b.minY, b.maxZ + 1, 'south', depth);
    const w = () => generateAndAddPiece(start, pieces, r, b.minX - 1, b.minY, b.minZ + 1, 'west', depth);
    const e = () => generateAndAddPiece(start, pieces, r, b.maxX + 1, b.minY, b.minZ + 1, 'east', depth);
    switch (this.dir) {
      case 'north': n(); w(); e(); break;
      case 'south': s(); w(); e(); break;
      case 'west': n(); s(); w(); break;
      case 'east': n(); s(); e(); break;
    }
    if (this.twoFloored) {
      if (r.nextBool()) generateAndAddPiece(start, pieces, r, b.minX + 1, b.minY + 3 + 1, b.minZ - 1, 'north', depth);
      if (r.nextBool()) generateAndAddPiece(start, pieces, r, b.minX - 1, b.minY + 3 + 1, b.minZ + 1, 'west', depth);
      if (r.nextBool()) generateAndAddPiece(start, pieces, r, b.maxX + 1, b.minY + 3 + 1, b.minZ + 1, 'east', depth);
      if (r.nextBool()) generateAndAddPiece(start, pieces, r, b.minX + 1, b.minY + 3 + 1, b.maxZ + 1, 'south', depth);
    }
  }

  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    if (this.isInInvalidLocation(ctx, chunk)) return;
    const b = this.box, planks = materials(this.type).planks;
    if (this.twoFloored) {
      this.generateBox(ctx, chunk, b.minX + 1, b.minY, b.minZ, b.maxX - 1, b.minY + 3 - 1, b.maxZ, 0, 0, false);
      this.generateBox(ctx, chunk, b.minX, b.minY, b.minZ + 1, b.maxX, b.minY + 3 - 1, b.maxZ - 1, 0, 0, false);
      this.generateBox(ctx, chunk, b.minX + 1, b.maxY - 2, b.minZ, b.maxX - 1, b.maxY, b.maxZ, 0, 0, false);
      this.generateBox(ctx, chunk, b.minX, b.maxY - 2, b.minZ + 1, b.maxX, b.maxY, b.maxZ - 1, 0, 0, false);
      this.generateBox(ctx, chunk, b.minX + 1, b.minY + 3, b.minZ + 1, b.maxX - 1, b.minY + 3, b.maxZ - 1, 0, 0, false);
    } else {
      this.generateBox(ctx, chunk, b.minX + 1, b.minY, b.minZ, b.maxX - 1, b.maxY, b.maxZ, 0, 0, false);
      this.generateBox(ctx, chunk, b.minX, b.minY, b.minZ + 1, b.maxX, b.maxY, b.maxZ - 1, 0, 0, false);
    }
    this.placeSupportPillar(ctx, chunk, b.minX + 1, b.minY, b.minZ + 1, b.maxY);
    this.placeSupportPillar(ctx, chunk, b.minX + 1, b.minY, b.maxZ - 1, b.maxY);
    this.placeSupportPillar(ctx, chunk, b.maxX - 1, b.minY, b.minZ + 1, b.maxY);
    this.placeSupportPillar(ctx, chunk, b.maxX - 1, b.minY, b.maxZ - 1, b.maxY);
    const y = b.minY - 1;
    for (let x = b.minX; x <= b.maxX; x++) for (let z = b.minZ; z <= b.maxZ; z++) this.setPlanksBlock(ctx, chunk, planks, x, y, z);
  }

  private placeSupportPillar(ctx: GenContext, chunk: BoundingBox, x: number, y: number, z: number, maxY: number): void {
    if (!isAir(this.getBlock(ctx, x, maxY + 1, z, chunk))) this.generateBox(ctx, chunk, x, y, z, x, maxY, z, materials(this.type).planks, 0, false);
  }
}

// ---------------------------------------------------------------------------
// Stairs: a tunnel stepping down 5 blocks over 8

class MineShaftStairs extends MineShaftPiece {
  constructor(genDepth: number, box: BoundingBox, d: Dir4, type: ShaftType) {
    super(genDepth, box, type);
    this.setOrientation(d);
  }

  static findStairs(pieces: PieceList, x: number, y: number, z: number, d: Dir4): BoundingBox | null {
    const box =
      d === 'south' ? new BoundingBox(0, -5, 0, 2, 2, 8)
      : d === 'west' ? new BoundingBox(-8, -5, 0, 0, 2, 2)
      : d === 'east' ? new BoundingBox(0, -5, 0, 8, 2, 2)
      : new BoundingBox(0, -5, -8, 2, 2, 0);
    box.move(x, y, z);
    return pieces.findCollision(box) ? null : box;
  }

  addChildren(start: StructurePiece, pieces: PieceList, r: Rand): void {
    const b = this.box;
    switch (this.orientation) {
      case 'north': generateAndAddPiece(start, pieces, r, b.minX, b.minY, b.minZ - 1, 'north', this.genDepth); break;
      case 'south': generateAndAddPiece(start, pieces, r, b.minX, b.minY, b.maxZ + 1, 'south', this.genDepth); break;
      case 'west': generateAndAddPiece(start, pieces, r, b.minX - 1, b.minY, b.minZ, 'west', this.genDepth); break;
      case 'east': generateAndAddPiece(start, pieces, r, b.maxX + 1, b.minY, b.minZ, 'east', this.genDepth); break;
    }
  }

  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    if (this.isInInvalidLocation(ctx, chunk)) return;
    this.generateBox(ctx, chunk, 0, 5, 0, 2, 7, 1, 0, 0, false);
    this.generateBox(ctx, chunk, 0, 0, 7, 2, 2, 8, 0, 0, false);
    for (let i = 0; i < 5; i++) this.generateBox(ctx, chunk, 0, 5 - i - (i < 4 ? 1 : 0), 2 + i, 2, 7 - i, 2 + i, 0, 0, false);
  }
}

// ---------------------------------------------------------------------------
// Starts

interface Start {
  pieces: MineShaftPiece[];
  bounds: BoundingBox;
}

const BADLANDS = /^(badlands|eroded_badlands|wooded_badlands)$/;

export class Mineshafts {
  private readonly cache = new Map<number, Start | null>();

  constructor(
    private readonly seed: number,
    private readonly biomeName: (x: number, z: number) => string,
    private readonly surfaceAt: (x: number, z: number) => number,
  ) {}

  /** vanilla MineshaftStructure.findGenerationPoint for a chunk (LEGACY_TYPE_3 frequency 0.004) */
  private start(cx: number, cz: number): Start | null {
    const key = ((cx & 0xffff) << 16) | (cz & 0xffff);
    if (this.cache.has(key)) return this.cache.get(key)!;
    let s: Start | null = null;
    const r = new Rand(hash2(cx, cz, this.seed ^ 0x3d1f), 7);
    if (r.nextDouble() < 0.004) {
      const biome = this.biomeName(cx * 16 + 8, cz * 16 + 8);
      if (biome !== 'deep_dark') {
        const type: ShaftType = BADLANDS.test(biome) ? 'mesa' : 'normal';
        const list = new PieceList();
        const room = new MineShaftRoom(0, r, cx * 16 + 2, cz * 16 + 2, type);
        list.add(room);
        room.addChildren(room, list, r);
        const bounds = list.bounds();
        let dy: number;
        if (type === 'mesa') {
          // vanilla: between sea level and the surface above the middle
          const cxm = (bounds.minX + bounds.maxX) >> 1, czm = (bounds.minZ + bounds.maxZ) >> 1, cym = (bounds.minY + bounds.maxY) >> 1;
          const j = this.surfaceAt(cxm, czm);
          const k = j <= SEA_LEVEL ? SEA_LEVEL : SEA_LEVEL + r.nextInt(j - SEA_LEVEL + 1);
          dy = k - cym;
        } else {
          // vanilla StructurePiecesBuilder.moveBelowSeaLevel(seaLevel, minY, random, 10)
          const i = SEA_LEVEL - 10;
          let j = bounds.ySpan + MIN_Y + 1;
          if (j < i) j += r.nextInt(i - j);
          dy = j - bounds.maxY;
        }
        for (const p of list.pieces) p.box.move(0, dy, 0);
        bounds.move(0, dy, 0);
        s = { pieces: list.pieces as MineShaftPiece[], bounds };
      }
    }
    if (this.cache.size > 4096) this.cache.clear();
    this.cache.set(key, s);
    return s;
  }

  /** vanilla StructureStart.placeInChunk for every mineshaft reaching this chunk */
  place(ctx: GenContext, r: Rand): void {
    const chunk = new BoundingBox(ctx.x0, MIN_Y, ctx.z0, ctx.x0 + 15, MAX_Y - 1, ctx.z0 + 15);
    for (let dz = -8; dz <= 8; dz++)
      for (let dx = -8; dx <= 8; dx++) {
        const s = this.start(ctx.cx + dx, ctx.cz + dz);
        if (!s || !s.bounds.intersects(chunk)) continue;
        for (const p of s.pieces) if (p.box.intersects(chunk)) p.postProcess(ctx, chunk, r);
      }
  }
}
