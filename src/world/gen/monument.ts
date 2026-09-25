// Ocean monuments (Stage 5: ocean; vanilla structure set minecraft:ocean_monuments, structure minecraft:monument,
// OceanMonumentStructure and OceanMonumentPieces). Where they go: one chance per 32×32-chunk region, spread
// triangularly (5 chunks clear of the region's far edges), in a deep ocean, and only if every biome within 29 blocks
// is ocean or river. What they are: all code, no templates — a 58×58 building of prismarine on the sea floor
// (its base at y 39), pillars under its rim, an arched entrance hall, two wings each with an elder guardian in its
// hall, a penthouse on top with the third, and inside a 5×5×3 grid of rooms joined at random (one opening at a
// time closed off as long as every room can still reach the entrance): single, double and double-double rooms, the
// sponge rooms, and the gold core room with its eight gold blocks.
//
// The pieces are laid out once per monument from the start chunk's random, then built chunk by chunk.

import { Rand, JavaRandom, hash2 } from '../../core/rng';
import { S, blockOf } from '../block';
import { MIN_Y, MAX_Y, SEA_LEVEL } from '../constants';
import type { GenContext } from './context';
import { BoundingBox, StructurePiece, type Dir4 } from './structure';
import { largeFeatureRandom, saltedRandom, worldSeed64 } from './jigsaw';
import { B, pickSurfaceBiome } from './biomes';
import { OverworldRouter, newColumn } from './router';
import { SeedSource } from './noise';

// vanilla RandomSpreadStructurePlacement for ocean_monuments (triangular spread)
const SPACING = 32, SEPARATION = 5, SALT = 10387313;
/** vanilla MonumentBuilding.BIOME_RANGE_CHECK */
const BIOME_RANGE = 29;

/** vanilla #has_structure/ocean_monument (#is_deep_ocean) */
const DEEP_OCEANS = new Set<number>([B.deep_frozen_ocean, B.deep_cold_ocean, B.deep_ocean, B.deep_lukewarm_ocean]);
/** vanilla #required_ocean_monument_surrounding: #is_ocean and #is_river */
const SURROUNDING = new Set<number>([
  ...DEEP_OCEANS, B.frozen_ocean, B.cold_ocean, B.ocean, B.lukewarm_ocean, B.warm_ocean, B.river, B.frozen_river,
]);

// ---------------------------------------------------------------------------------------------------------------
// Blocks

interface Blocks {
  /** vanilla BASE_GRAY, BASE_LIGHT, BASE_BLACK, LAMP_BLOCK, FILL_BLOCK */
  G: number;
  L: number;
  K: number;
  LAMP: number;
  WATER: number;
  GOLD: number;
  SPONGE: number;
}
let BL: Blocks | null = null;
function blocks(): Blocks {
  return (BL ??= {
    G: S('prismarine'),
    L: S('prismarine_bricks'),
    K: S('dark_prismarine'),
    LAMP: S('sea_lantern'),
    WATER: S('water'),
    GOLD: S('gold_block'),
    SPONGE: S('wet_sponge'),
  });
}
/** vanilla FILL_KEEP: the water box leaves ice and water be */
const FILL_KEEP = new Set(['ice', 'packed_ice', 'blue_ice', 'water']);
/** vanilla isReplaceableByStructures */
const COLUMN_REPLACEABLE = new Set(['air', 'cave_air', 'void_air', 'water', 'lava', 'bubble_column', 'glow_lichen', 'seagrass', 'tall_seagrass']);

// vanilla Direction 3D data values (and Direction.values() order)
const DOWN = 0, UP = 1, NORTH = 2, SOUTH = 3, WEST = 4, EAST = 5;
const STEP: [number, number, number][] = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
/** vanilla Direction.Plane.HORIZONTAL */
const HORIZONTAL: Dir4[] = ['north', 'east', 'south', 'west'];

/** vanilla getRoomIndex: 5 across (x), 5 deep (z), 3 high (y) */
const roomIndex = (x: number, y: number, z: number) => y * 25 + z * 5 + x;
const SOURCE_INDEX = roomIndex(2, 0, 0);
const TOP_CONNECT_INDEX = roomIndex(2, 2, 0);
const LEFTWING_CONNECT_INDEX = roomIndex(0, 1, 0);
const RIGHTWING_CONNECT_INDEX = roomIndex(4, 1, 0);
const LEFTWING_INDEX = 1001, RIGHTWING_INDEX = 1002, PENTHOUSE_INDEX = 1003;

/** vanilla OceanMonumentPieces.RoomDefinition: a cell of the room grid, its neighbours and which way it's open */
class RoomDefinition {
  readonly connections: (RoomDefinition | null)[] = [null, null, null, null, null, null];
  readonly hasOpening = [false, false, false, false, false, false];
  claimed = false;
  isSource = false;
  private scanIndex = 0;

  constructor(readonly index: number) {}

  setConnection(d: number, room: RoomDefinition): void {
    this.connections[d] = room;
    room.connections[d ^ 1] = this;
  }

  updateOpenings(): void {
    for (let i = 0; i < 6; i++) this.hasOpening[i] = this.connections[i] !== null;
  }

  /** whether the entrance can be reached from here through open ways */
  findSource(scan: number): boolean {
    if (this.isSource) return true;
    this.scanIndex = scan;
    for (let i = 0; i < 6; i++) {
      const c = this.connections[i];
      if (c && this.hasOpening[i] && c.scanIndex !== scan && c.findSource(scan)) return true;
    }
    return false;
  }

  isSpecial(): boolean {
    return this.index >= 75;
  }

  countOpenings(): number {
    let n = 0;
    for (let i = 0; i < 6; i++) if (this.hasOpening[i]) n++;
    return n;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Pieces

/** vanilla OceanMonumentPiece */
abstract class MonumentPiece extends StructurePiece {
  constructor(box: BoundingBox, orientation: Dir4, readonly room: RoomDefinition | null = null) {
    super(1, box);
    this.setOrientation(orientation);
  }

  addChildren(): void {}

  protected worldPos(x: number, y: number, z: number): [number, number, number] {
    return [this.worldX(x, z), this.worldY(y), this.worldZ(x, z)];
  }

  /** generateBox with one block for the edge and the inside */
  protected fill(ctx: GenContext, chunk: BoundingBox, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, st: number): void {
    this.generateBox(ctx, chunk, x0, y0, z0, x1, y1, z1, st, st, false);
  }

  /** vanilla generateWaterBox: water below the sea (air above it), ice and water left be */
  protected waterBox(ctx: GenContext, chunk: BoundingBox, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const W = blocks().WATER;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) {
          const st = this.getBlock(ctx, x, y, z, chunk);
          if (FILL_KEEP.has(blockOf(st).name)) continue;
          if (this.worldY(y) >= SEA_LEVEL && st !== W) this.placeBlock(ctx, 0, x, y, z, chunk);
          else this.placeBlock(ctx, W, x, y, z, chunk);
        }
  }

  /** vanilla generateDefaultFloor: a room's floor, with a hole in the middle if it's open below */
  protected defaultFloor(ctx: GenContext, chunk: BoundingBox, x: number, z: number, hasOpening: boolean): void {
    const { G, L } = blocks();
    if (hasOpening) {
      this.fill(ctx, chunk, x + 0, 0, z + 0, x + 2, 0, z + 8 - 1, G);
      this.fill(ctx, chunk, x + 5, 0, z + 0, x + 8 - 1, 0, z + 8 - 1, G);
      this.fill(ctx, chunk, x + 3, 0, z + 0, x + 4, 0, z + 2, G);
      this.fill(ctx, chunk, x + 3, 0, z + 5, x + 4, 0, z + 8 - 1, G);
      this.fill(ctx, chunk, x + 3, 0, z + 2, x + 4, 0, z + 2, L);
      this.fill(ctx, chunk, x + 3, 0, z + 5, x + 4, 0, z + 5, L);
      this.fill(ctx, chunk, x + 2, 0, z + 3, x + 2, 0, z + 4, L);
      this.fill(ctx, chunk, x + 5, 0, z + 3, x + 5, 0, z + 4, L);
    } else {
      this.fill(ctx, chunk, x + 0, 0, z + 0, x + 8 - 1, 0, z + 8 - 1, G);
    }
  }

  /** vanilla generateBoxOnFillOnly: `st` only where there's water */
  protected boxOnFillOnly(ctx: GenContext, chunk: BoundingBox, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, st: number): void {
    const W = blocks().WATER;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) if (this.getBlock(ctx, x, y, z, chunk) === W) this.placeBlock(ctx, st, x, y, z, chunk);
  }

  /** vanilla chunkIntersects: whether this chunk takes any of the local rectangle */
  protected chunkIntersects(chunk: BoundingBox, x0: number, z0: number, x1: number, z1: number): boolean {
    const i = this.worldX(x0, z0), j = this.worldZ(x0, z0), k = this.worldX(x1, z1), l = this.worldZ(x1, z1);
    return chunk.maxX >= Math.min(i, k) && chunk.minX <= Math.max(i, k) && chunk.maxZ >= Math.min(j, l) && chunk.minZ <= Math.max(j, l);
  }

  /** vanilla spawnElder: an elder guardian, at full health, kept (a structure's) */
  protected spawnElder(ctx: GenContext, chunk: BoundingBox, x: number, y: number, z: number): void {
    const [wx, wy, wz] = this.worldPos(x, y, z);
    if (!chunk.isInside(wx, wy, wz)) return;
    ctx.entities.push({ id: 'elder_guardian', x: wx + 0.5, y: wy, z: wz + 0.5, yaw: 0, pitch: 0, dx: 0, dy: 0, dz: 0, health: 80, fire: 0, persistent: true });
  }

  /** vanilla StructurePiece.fillColumnDown: down through water (and air and sea plants) to the ground */
  protected fillColumnDown(ctx: GenContext, st: number, x: number, y: number, z: number, chunk: BoundingBox): void {
    const [wx, , wz] = this.worldPos(x, y, z);
    let wy = this.worldY(y);
    if (!chunk.isInside(wx, wy, wz)) return;
    while (COLUMN_REPLACEABLE.has(blockOf(ctx.getOrAir(wx, wy, wz)).name) && wy > MIN_Y + 1) {
      ctx.set(wx, wy, wz, st);
      wy--;
    }
  }
}

/** vanilla OceanMonumentPiece(…, RoomDefinition, roomWidth, roomHeight, roomDepth).makeBoundingBox, before the building moves it */
function roomBox(o: Dir4, room: RoomDefinition, w: number, h: number, d: number): BoundingBox {
  const i = room.index, j = i % 5, k = Math.floor(i / 5) % 5, l = Math.floor(i / 25);
  const box = o === 'north' || o === 'south' ? new BoundingBox(0, 0, 0, w * 8 - 1, h * 4 - 1, d * 8 - 1) : new BoundingBox(0, 0, 0, d * 8 - 1, h * 4 - 1, w * 8 - 1);
  switch (o) {
    case 'north':
      box.move(j * 8, l * 4, -(k + d) * 8 + 1);
      break;
    case 'south':
      box.move(j * 8, l * 4, k * 8);
      break;
    case 'west':
      box.move(-(k + d) * 8 + 1, l * 4, j * 8);
      break;
    default:
      box.move(k * 8, l * 4, j * 8);
  }
  return box;
}

abstract class GridRoom extends MonumentPiece {
  declare readonly room: RoomDefinition;
  constructor(o: Dir4, room: RoomDefinition, w: number, h: number, d: number) {
    super(roomBox(o, room, w, h, d), o, room);
  }
}

/** vanilla OceanMonumentEntryRoom: the cell behind the entrance */
class EntryRoom extends GridRoom {
  constructor(o: Dir4, room: RoomDefinition) {
    super(o, room, 1, 1, 1);
  }
  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { L } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number) => this.fill(ctx, chunk, a, b, c, d, e, g, L);
    f(0, 3, 0, 2, 3, 7);
    f(5, 3, 0, 7, 3, 7);
    f(0, 2, 0, 1, 2, 7);
    f(6, 2, 0, 7, 2, 7);
    f(0, 1, 0, 0, 1, 7);
    f(7, 1, 0, 7, 1, 7);
    f(0, 1, 7, 7, 3, 7);
    f(1, 1, 0, 2, 3, 0);
    f(5, 1, 0, 6, 3, 0);
    const o = this.room.hasOpening;
    if (o[NORTH]) this.waterBox(ctx, chunk, 3, 1, 7, 4, 2, 7);
    if (o[WEST]) this.waterBox(ctx, chunk, 0, 1, 3, 1, 2, 4);
    if (o[EAST]) this.waterBox(ctx, chunk, 6, 1, 3, 7, 2, 4);
  }
}

/** vanilla OceanMonumentSimpleRoom: one cell, in one of three designs (lamps in the corners, pillars, dark bands) */
class SimpleRoom extends GridRoom {
  private readonly mainDesign: number;
  constructor(o: Dir4, room: RoomDefinition, r: JavaRandom) {
    super(o, room, 1, 1, 1);
    this.mainDesign = r.nextInt(3);
  }
  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    const { G, L, K, LAMP } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number, st: number) => this.fill(ctx, chunk, a, b, c, d, e, g, st);
    const p = (st: number, x: number, y: number, z: number) => this.placeBlock(ctx, st, x, y, z, chunk);
    const room = this.room, o = room.hasOpening;
    if (Math.floor(room.index / 25) > 0) this.defaultFloor(ctx, chunk, 0, 0, o[DOWN]);
    if (room.connections[UP] === null) this.boxOnFillOnly(ctx, chunk, 1, 4, 1, 6, 4, 6, G);
    const pillar = this.mainDesign !== 0 && r.nextBool() && !o[DOWN] && !o[UP] && room.countOpenings() > 1;
    if (this.mainDesign === 0) {
      f(0, 1, 0, 2, 1, 2, L);
      f(0, 3, 0, 2, 3, 2, L);
      f(0, 2, 0, 0, 2, 2, G);
      f(1, 2, 0, 2, 2, 0, G);
      p(LAMP, 1, 2, 1);
      f(5, 1, 0, 7, 1, 2, L);
      f(5, 3, 0, 7, 3, 2, L);
      f(7, 2, 0, 7, 2, 2, G);
      f(5, 2, 0, 6, 2, 0, G);
      p(LAMP, 6, 2, 1);
      f(0, 1, 5, 2, 1, 7, L);
      f(0, 3, 5, 2, 3, 7, L);
      f(0, 2, 5, 0, 2, 7, G);
      f(1, 2, 7, 2, 2, 7, G);
      p(LAMP, 1, 2, 6);
      f(5, 1, 5, 7, 1, 7, L);
      f(5, 3, 5, 7, 3, 7, L);
      f(7, 2, 5, 7, 2, 7, G);
      f(5, 2, 7, 6, 2, 7, G);
      p(LAMP, 6, 2, 6);
      if (o[SOUTH]) f(3, 3, 0, 4, 3, 0, L);
      else {
        f(3, 3, 0, 4, 3, 1, L);
        f(3, 2, 0, 4, 2, 0, G);
        f(3, 1, 0, 4, 1, 1, L);
      }
      if (o[NORTH]) f(3, 3, 7, 4, 3, 7, L);
      else {
        f(3, 3, 6, 4, 3, 7, L);
        f(3, 2, 7, 4, 2, 7, G);
        f(3, 1, 6, 4, 1, 7, L);
      }
      if (o[WEST]) f(0, 3, 3, 0, 3, 4, L);
      else {
        f(0, 3, 3, 1, 3, 4, L);
        f(0, 2, 3, 0, 2, 4, G);
        f(0, 1, 3, 1, 1, 4, L);
      }
      if (o[EAST]) f(7, 3, 3, 7, 3, 4, L);
      else {
        f(6, 3, 3, 7, 3, 4, L);
        f(7, 2, 3, 7, 2, 4, G);
        f(6, 1, 3, 7, 1, 4, L);
      }
    } else if (this.mainDesign === 1) {
      f(2, 1, 2, 2, 3, 2, L);
      f(2, 1, 5, 2, 3, 5, L);
      f(5, 1, 5, 5, 3, 5, L);
      f(5, 1, 2, 5, 3, 2, L);
      p(LAMP, 2, 2, 2);
      p(LAMP, 2, 2, 5);
      p(LAMP, 5, 2, 5);
      p(LAMP, 5, 2, 2);
      f(0, 1, 0, 1, 3, 0, L);
      f(0, 1, 1, 0, 3, 1, L);
      f(0, 1, 7, 1, 3, 7, L);
      f(0, 1, 6, 0, 3, 6, L);
      f(6, 1, 7, 7, 3, 7, L);
      f(7, 1, 6, 7, 3, 6, L);
      f(6, 1, 0, 7, 3, 0, L);
      f(7, 1, 1, 7, 3, 1, L);
      p(G, 1, 2, 0);
      p(G, 0, 2, 1);
      p(G, 1, 2, 7);
      p(G, 0, 2, 6);
      p(G, 6, 2, 7);
      p(G, 7, 2, 6);
      p(G, 6, 2, 0);
      p(G, 7, 2, 1);
      if (!o[SOUTH]) {
        f(1, 3, 0, 6, 3, 0, L);
        f(1, 2, 0, 6, 2, 0, G);
        f(1, 1, 0, 6, 1, 0, L);
      }
      if (!o[NORTH]) {
        f(1, 3, 7, 6, 3, 7, L);
        f(1, 2, 7, 6, 2, 7, G);
        f(1, 1, 7, 6, 1, 7, L);
      }
      if (!o[WEST]) {
        f(0, 3, 1, 0, 3, 6, L);
        f(0, 2, 1, 0, 2, 6, G);
        f(0, 1, 1, 0, 1, 6, L);
      }
      if (!o[EAST]) {
        f(7, 3, 1, 7, 3, 6, L);
        f(7, 2, 1, 7, 2, 6, G);
        f(7, 1, 1, 7, 1, 6, L);
      }
    } else if (this.mainDesign === 2) {
      f(0, 1, 0, 0, 1, 7, L);
      f(7, 1, 0, 7, 1, 7, L);
      f(1, 1, 0, 6, 1, 0, L);
      f(1, 1, 7, 6, 1, 7, L);
      f(0, 2, 0, 0, 2, 7, K);
      f(7, 2, 0, 7, 2, 7, K);
      f(1, 2, 0, 6, 2, 0, K);
      f(1, 2, 7, 6, 2, 7, K);
      f(0, 3, 0, 0, 3, 7, L);
      f(7, 3, 0, 7, 3, 7, L);
      f(1, 3, 0, 6, 3, 0, L);
      f(1, 3, 7, 6, 3, 7, L);
      f(0, 1, 3, 0, 2, 4, K);
      f(7, 1, 3, 7, 2, 4, K);
      f(3, 1, 0, 4, 2, 0, K);
      f(3, 1, 7, 4, 2, 7, K);
      if (o[SOUTH]) this.waterBox(ctx, chunk, 3, 1, 0, 4, 2, 0);
      if (o[NORTH]) this.waterBox(ctx, chunk, 3, 1, 7, 4, 2, 7);
      if (o[WEST]) this.waterBox(ctx, chunk, 0, 1, 3, 0, 2, 4);
      if (o[EAST]) this.waterBox(ctx, chunk, 7, 1, 3, 7, 2, 4);
    }
    if (pillar) {
      f(3, 1, 3, 4, 1, 4, L);
      f(3, 2, 3, 4, 2, 4, G);
      f(3, 3, 3, 4, 3, 4, L);
    }
  }
}

/** vanilla OceanMonumentSimpleTopRoom: a closed cell hung with wet sponges (the sponge room) */
class SimpleTopRoom extends GridRoom {
  constructor(o: Dir4, room: RoomDefinition) {
    super(o, room, 1, 1, 1);
  }
  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    const { G, L, K, SPONGE } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number, st: number) => this.fill(ctx, chunk, a, b, c, d, e, g, st);
    const room = this.room;
    if (Math.floor(room.index / 25) > 0) this.defaultFloor(ctx, chunk, 0, 0, room.hasOpening[DOWN]);
    if (room.connections[UP] === null) this.boxOnFillOnly(ctx, chunk, 1, 4, 1, 6, 4, 6, G);
    for (let i = 1; i <= 6; i++)
      for (let j = 1; j <= 6; j++) {
        if (r.nextInt(3) !== 0) {
          const k = 2 + (r.nextInt(4) === 0 ? 0 : 1);
          f(i, k, j, i, 3, j, SPONGE);
        }
      }
    f(0, 1, 0, 0, 1, 7, L);
    f(7, 1, 0, 7, 1, 7, L);
    f(1, 1, 0, 6, 1, 0, L);
    f(1, 1, 7, 6, 1, 7, L);
    f(0, 2, 0, 0, 2, 7, K);
    f(7, 2, 0, 7, 2, 7, K);
    f(1, 2, 0, 6, 2, 0, K);
    f(1, 2, 7, 6, 2, 7, K);
    f(0, 3, 0, 0, 3, 7, L);
    f(7, 3, 0, 7, 3, 7, L);
    f(1, 3, 0, 6, 3, 0, L);
    f(1, 3, 7, 6, 3, 7, L);
    f(0, 1, 3, 0, 2, 4, K);
    f(7, 1, 3, 7, 2, 4, K);
    f(3, 1, 0, 4, 2, 0, K);
    f(3, 1, 7, 4, 2, 7, K);
    if (room.hasOpening[SOUTH]) this.waterBox(ctx, chunk, 3, 1, 0, 4, 2, 0);
  }
}

/** vanilla OceanMonumentDoubleYRoom: two cells, one over the other */
class DoubleYRoom extends GridRoom {
  constructor(o: Dir4, room: RoomDefinition) {
    super(o, room, 1, 2, 1);
  }
  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { G, L } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number, st: number) => this.fill(ctx, chunk, a, b, c, d, e, g, st);
    if (Math.floor(this.room.index / 25) > 0) this.defaultFloor(ctx, chunk, 0, 0, this.room.hasOpening[DOWN]);
    const above = this.room.connections[UP]!;
    if (above.connections[UP] === null) this.boxOnFillOnly(ctx, chunk, 1, 8, 1, 6, 8, 6, G);
    f(0, 4, 0, 0, 4, 7, L);
    f(7, 4, 0, 7, 4, 7, L);
    f(1, 4, 0, 6, 4, 0, L);
    f(1, 4, 7, 6, 4, 7, L);
    f(2, 4, 1, 2, 4, 2, L);
    f(1, 4, 2, 1, 4, 2, L);
    f(5, 4, 1, 5, 4, 2, L);
    f(6, 4, 2, 6, 4, 2, L);
    f(2, 4, 5, 2, 4, 6, L);
    f(1, 4, 5, 1, 4, 5, L);
    f(5, 4, 5, 5, 4, 6, L);
    f(6, 4, 5, 6, 4, 5, L);
    let def = this.room;
    for (let i = 1; i <= 5; i += 4) {
      let j = 0;
      if (def.hasOpening[SOUTH]) {
        f(2, i, j, 2, i + 2, j, L);
        f(5, i, j, 5, i + 2, j, L);
        f(3, i + 2, j, 4, i + 2, j, L);
      } else {
        f(0, i, j, 7, i + 2, j, L);
        f(0, i + 1, j, 7, i + 1, j, G);
      }
      j = 7;
      if (def.hasOpening[NORTH]) {
        f(2, i, j, 2, i + 2, j, L);
        f(5, i, j, 5, i + 2, j, L);
        f(3, i + 2, j, 4, i + 2, j, L);
      } else {
        f(0, i, j, 7, i + 2, j, L);
        f(0, i + 1, j, 7, i + 1, j, G);
      }
      let k = 0;
      if (def.hasOpening[WEST]) {
        f(k, i, 2, k, i + 2, 2, L);
        f(k, i, 5, k, i + 2, 5, L);
        f(k, i + 2, 3, k, i + 2, 4, L);
      } else {
        f(k, i, 0, k, i + 2, 7, L);
        f(k, i + 1, 0, k, i + 1, 7, G);
      }
      k = 7;
      if (def.hasOpening[EAST]) {
        f(k, i, 2, k, i + 2, 2, L);
        f(k, i, 5, k, i + 2, 5, L);
        f(k, i + 2, 3, k, i + 2, 4, L);
      } else {
        f(k, i, 0, k, i + 2, 7, L);
        f(k, i + 1, 0, k, i + 1, 7, G);
      }
      def = above;
    }
  }
}

/** vanilla OceanMonumentDoubleXRoom: two cells side by side along x, a lit pillar between */
class DoubleXRoom extends GridRoom {
  constructor(o: Dir4, room: RoomDefinition) {
    super(o, room, 2, 1, 1);
  }
  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { G, L, LAMP } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number, st: number) => this.fill(ctx, chunk, a, b, c, d, e, g, st);
    const east = this.room.connections[EAST]!, self = this.room;
    if (Math.floor(this.room.index / 25) > 0) {
      this.defaultFloor(ctx, chunk, 8, 0, east.hasOpening[DOWN]);
      this.defaultFloor(ctx, chunk, 0, 0, self.hasOpening[DOWN]);
    }
    if (self.connections[UP] === null) this.boxOnFillOnly(ctx, chunk, 1, 4, 1, 7, 4, 6, G);
    if (east.connections[UP] === null) this.boxOnFillOnly(ctx, chunk, 8, 4, 1, 14, 4, 6, G);
    f(0, 3, 0, 0, 3, 7, L);
    f(15, 3, 0, 15, 3, 7, L);
    f(1, 3, 0, 15, 3, 0, L);
    f(1, 3, 7, 14, 3, 7, L);
    f(0, 2, 0, 0, 2, 7, G);
    f(15, 2, 0, 15, 2, 7, G);
    f(1, 2, 0, 15, 2, 0, G);
    f(1, 2, 7, 14, 2, 7, G);
    f(0, 1, 0, 0, 1, 7, L);
    f(15, 1, 0, 15, 1, 7, L);
    f(1, 1, 0, 15, 1, 0, L);
    f(1, 1, 7, 14, 1, 7, L);
    f(5, 1, 0, 10, 1, 4, L);
    f(6, 2, 0, 9, 2, 3, G);
    f(5, 3, 0, 10, 3, 4, L);
    this.placeBlock(ctx, LAMP, 6, 2, 3, chunk);
    this.placeBlock(ctx, LAMP, 9, 2, 3, chunk);
    if (self.hasOpening[SOUTH]) this.waterBox(ctx, chunk, 3, 1, 0, 4, 2, 0);
    if (self.hasOpening[NORTH]) this.waterBox(ctx, chunk, 3, 1, 7, 4, 2, 7);
    if (self.hasOpening[WEST]) this.waterBox(ctx, chunk, 0, 1, 3, 0, 2, 4);
    if (east.hasOpening[SOUTH]) this.waterBox(ctx, chunk, 11, 1, 0, 12, 2, 0);
    if (east.hasOpening[NORTH]) this.waterBox(ctx, chunk, 11, 1, 7, 12, 2, 7);
    if (east.hasOpening[EAST]) this.waterBox(ctx, chunk, 15, 1, 3, 15, 2, 4);
  }
}

/** vanilla OceanMonumentDoubleZRoom: two cells one behind the other, a lit arch between */
class DoubleZRoom extends GridRoom {
  constructor(o: Dir4, room: RoomDefinition) {
    super(o, room, 1, 1, 2);
  }
  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { G, L, LAMP } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number, st: number) => this.fill(ctx, chunk, a, b, c, d, e, g, st);
    const p = (st: number, x: number, y: number, z: number) => this.placeBlock(ctx, st, x, y, z, chunk);
    const north = this.room.connections[NORTH]!, self = this.room;
    if (Math.floor(this.room.index / 25) > 0) {
      this.defaultFloor(ctx, chunk, 0, 8, north.hasOpening[DOWN]);
      this.defaultFloor(ctx, chunk, 0, 0, self.hasOpening[DOWN]);
    }
    if (self.connections[UP] === null) this.boxOnFillOnly(ctx, chunk, 1, 4, 1, 6, 4, 7, G);
    if (north.connections[UP] === null) this.boxOnFillOnly(ctx, chunk, 1, 4, 8, 6, 4, 14, G);
    f(0, 3, 0, 0, 3, 15, L);
    f(7, 3, 0, 7, 3, 15, L);
    f(1, 3, 0, 7, 3, 0, L);
    f(1, 3, 15, 6, 3, 15, L);
    f(0, 2, 0, 0, 2, 15, G);
    f(7, 2, 0, 7, 2, 15, G);
    f(1, 2, 0, 7, 2, 0, G);
    f(1, 2, 15, 6, 2, 15, G);
    f(0, 1, 0, 0, 1, 15, L);
    f(7, 1, 0, 7, 1, 15, L);
    f(1, 1, 0, 7, 1, 0, L);
    f(1, 1, 15, 6, 1, 15, L);
    f(1, 1, 1, 1, 1, 2, L);
    f(6, 1, 1, 6, 1, 2, L);
    f(1, 3, 1, 1, 3, 2, L);
    f(6, 3, 1, 6, 3, 2, L);
    f(1, 1, 13, 1, 1, 14, L);
    f(6, 1, 13, 6, 1, 14, L);
    f(1, 3, 13, 1, 3, 14, L);
    f(6, 3, 13, 6, 3, 14, L);
    f(2, 1, 6, 2, 3, 6, L);
    f(5, 1, 6, 5, 3, 6, L);
    f(2, 1, 9, 2, 3, 9, L);
    f(5, 1, 9, 5, 3, 9, L);
    f(3, 2, 6, 4, 2, 6, L);
    f(3, 2, 9, 4, 2, 9, L);
    f(2, 2, 7, 2, 2, 8, L);
    f(5, 2, 7, 5, 2, 8, L);
    p(LAMP, 2, 2, 5);
    p(LAMP, 5, 2, 5);
    p(LAMP, 2, 2, 10);
    p(LAMP, 5, 2, 10);
    p(L, 2, 3, 5);
    p(L, 5, 3, 5);
    p(L, 2, 3, 10);
    p(L, 5, 3, 10);
    if (self.hasOpening[SOUTH]) this.waterBox(ctx, chunk, 3, 1, 0, 4, 2, 0);
    if (self.hasOpening[EAST]) this.waterBox(ctx, chunk, 7, 1, 3, 7, 2, 4);
    if (self.hasOpening[WEST]) this.waterBox(ctx, chunk, 0, 1, 3, 0, 2, 4);
    if (north.hasOpening[NORTH]) this.waterBox(ctx, chunk, 3, 1, 15, 4, 2, 15);
    if (north.hasOpening[WEST]) this.waterBox(ctx, chunk, 0, 1, 11, 0, 2, 12);
    if (north.hasOpening[EAST]) this.waterBox(ctx, chunk, 7, 1, 11, 7, 2, 12);
  }
}

/** vanilla OceanMonumentDoubleXYRoom: two cells wide and two high, a lit gallery across the middle */
class DoubleXYRoom extends GridRoom {
  constructor(o: Dir4, room: RoomDefinition) {
    super(o, room, 2, 2, 1);
  }
  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { G, L, LAMP } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number, st: number) => this.fill(ctx, chunk, a, b, c, d, e, g, st);
    const p = (st: number, x: number, y: number, z: number) => this.placeBlock(ctx, st, x, y, z, chunk);
    const east = this.room.connections[EAST]!, self = this.room;
    const selfUp = self.connections[UP]!, eastUp = east.connections[UP]!;
    if (Math.floor(this.room.index / 25) > 0) {
      this.defaultFloor(ctx, chunk, 8, 0, east.hasOpening[DOWN]);
      this.defaultFloor(ctx, chunk, 0, 0, self.hasOpening[DOWN]);
    }
    if (selfUp.connections[UP] === null) this.boxOnFillOnly(ctx, chunk, 1, 8, 1, 7, 8, 6, G);
    if (eastUp.connections[UP] === null) this.boxOnFillOnly(ctx, chunk, 8, 8, 1, 14, 8, 6, G);
    for (let i = 1; i <= 7; i++) {
      const st = i === 2 || i === 6 ? G : L;
      f(0, i, 0, 0, i, 7, st);
      f(15, i, 0, 15, i, 7, st);
      f(1, i, 0, 15, i, 0, st);
      f(1, i, 7, 14, i, 7, st);
    }
    f(2, 1, 3, 2, 7, 4, L);
    f(3, 1, 2, 4, 7, 2, L);
    f(3, 1, 5, 4, 7, 5, L);
    f(13, 1, 3, 13, 7, 4, L);
    f(11, 1, 2, 12, 7, 2, L);
    f(11, 1, 5, 12, 7, 5, L);
    f(5, 1, 3, 5, 3, 4, L);
    f(10, 1, 3, 10, 3, 4, L);
    f(5, 7, 2, 10, 7, 5, L);
    f(5, 5, 2, 5, 7, 2, L);
    f(10, 5, 2, 10, 7, 2, L);
    f(5, 5, 5, 5, 7, 5, L);
    f(10, 5, 5, 10, 7, 5, L);
    p(L, 6, 6, 2);
    p(L, 9, 6, 2);
    p(L, 6, 6, 5);
    p(L, 9, 6, 5);
    f(5, 4, 3, 6, 4, 4, L);
    f(9, 4, 3, 10, 4, 4, L);
    p(LAMP, 5, 4, 2);
    p(LAMP, 5, 4, 5);
    p(LAMP, 10, 4, 2);
    p(LAMP, 10, 4, 5);
    if (self.hasOpening[SOUTH]) this.waterBox(ctx, chunk, 3, 1, 0, 4, 2, 0);
    if (self.hasOpening[NORTH]) this.waterBox(ctx, chunk, 3, 1, 7, 4, 2, 7);
    if (self.hasOpening[WEST]) this.waterBox(ctx, chunk, 0, 1, 3, 0, 2, 4);
    if (east.hasOpening[SOUTH]) this.waterBox(ctx, chunk, 11, 1, 0, 12, 2, 0);
    if (east.hasOpening[NORTH]) this.waterBox(ctx, chunk, 11, 1, 7, 12, 2, 7);
    if (east.hasOpening[EAST]) this.waterBox(ctx, chunk, 15, 1, 3, 15, 2, 4);
    if (selfUp.hasOpening[SOUTH]) this.waterBox(ctx, chunk, 3, 5, 0, 4, 6, 0);
    if (selfUp.hasOpening[NORTH]) this.waterBox(ctx, chunk, 3, 5, 7, 4, 6, 7);
    if (selfUp.hasOpening[WEST]) this.waterBox(ctx, chunk, 0, 5, 3, 0, 6, 4);
    if (eastUp.hasOpening[SOUTH]) this.waterBox(ctx, chunk, 11, 5, 0, 12, 6, 0);
    if (eastUp.hasOpening[NORTH]) this.waterBox(ctx, chunk, 11, 5, 7, 12, 6, 7);
    if (eastUp.hasOpening[EAST]) this.waterBox(ctx, chunk, 15, 5, 3, 15, 6, 4);
  }
}

/** vanilla OceanMonumentDoubleYZRoom: two cells deep and two high, a dark column lit twice down the middle */
class DoubleYZRoom extends GridRoom {
  constructor(o: Dir4, room: RoomDefinition) {
    super(o, room, 1, 2, 2);
  }
  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { G, L, K, LAMP } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number, st: number) => this.fill(ctx, chunk, a, b, c, d, e, g, st);
    const north = this.room.connections[NORTH]!, self = this.room;
    const northUp = north.connections[UP]!, selfUp = self.connections[UP]!;
    if (Math.floor(this.room.index / 25) > 0) {
      this.defaultFloor(ctx, chunk, 0, 8, north.hasOpening[DOWN]);
      this.defaultFloor(ctx, chunk, 0, 0, self.hasOpening[DOWN]);
    }
    if (selfUp.connections[UP] === null) this.boxOnFillOnly(ctx, chunk, 1, 8, 1, 6, 8, 7, G);
    if (northUp.connections[UP] === null) this.boxOnFillOnly(ctx, chunk, 1, 8, 8, 6, 8, 14, G);
    for (let i = 1; i <= 7; i++) {
      const st = i === 2 || i === 6 ? G : L;
      f(0, i, 0, 0, i, 15, st);
      f(7, i, 0, 7, i, 15, st);
      f(1, i, 0, 6, i, 0, st);
      f(1, i, 15, 6, i, 15, st);
    }
    for (let j = 1; j <= 7; j++) {
      const st = j === 2 || j === 6 ? LAMP : K;
      f(3, j, 7, 4, j, 8, st);
    }
    if (self.hasOpening[SOUTH]) this.waterBox(ctx, chunk, 3, 1, 0, 4, 2, 0);
    if (self.hasOpening[EAST]) this.waterBox(ctx, chunk, 7, 1, 3, 7, 2, 4);
    if (self.hasOpening[WEST]) this.waterBox(ctx, chunk, 0, 1, 3, 0, 2, 4);
    if (north.hasOpening[NORTH]) this.waterBox(ctx, chunk, 3, 1, 15, 4, 2, 15);
    if (north.hasOpening[WEST]) this.waterBox(ctx, chunk, 0, 1, 11, 0, 2, 12);
    if (north.hasOpening[EAST]) this.waterBox(ctx, chunk, 7, 1, 11, 7, 2, 12);
    if (selfUp.hasOpening[SOUTH]) this.waterBox(ctx, chunk, 3, 5, 0, 4, 6, 0);
    if (selfUp.hasOpening[EAST]) {
      this.waterBox(ctx, chunk, 7, 5, 3, 7, 6, 4);
      f(5, 4, 2, 6, 4, 5, L);
      f(6, 1, 2, 6, 3, 2, L);
      f(6, 1, 5, 6, 3, 5, L);
    }
    if (selfUp.hasOpening[WEST]) {
      this.waterBox(ctx, chunk, 0, 5, 3, 0, 6, 4);
      f(1, 4, 2, 2, 4, 5, L);
      f(1, 1, 2, 1, 3, 2, L);
      f(1, 1, 5, 1, 3, 5, L);
    }
    if (northUp.hasOpening[NORTH]) this.waterBox(ctx, chunk, 3, 5, 15, 4, 6, 15);
    if (northUp.hasOpening[WEST]) {
      this.waterBox(ctx, chunk, 0, 5, 11, 0, 6, 12);
      f(1, 4, 10, 2, 4, 13, L);
      f(1, 1, 10, 1, 3, 10, L);
      f(1, 1, 13, 1, 3, 13, L);
    }
    if (northUp.hasOpening[EAST]) {
      this.waterBox(ctx, chunk, 7, 5, 11, 7, 6, 12);
      f(5, 4, 10, 6, 4, 13, L);
      f(6, 1, 10, 6, 3, 10, L);
      f(6, 1, 13, 6, 3, 13, L);
    }
  }
}

/** vanilla OceanMonumentCoreRoom: two by two by two cells round the dark prismarine heart with its eight gold blocks */
class CoreRoom extends GridRoom {
  constructor(o: Dir4, room: RoomDefinition) {
    super(o, room, 2, 2, 2);
  }
  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { G, L, K, LAMP, GOLD } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number, st: number) => this.fill(ctx, chunk, a, b, c, d, e, g, st);
    this.boxOnFillOnly(ctx, chunk, 1, 8, 0, 14, 8, 14, G);
    f(0, 7, 0, 0, 7, 15, L);
    f(15, 7, 0, 15, 7, 15, L);
    f(1, 7, 0, 15, 7, 0, L);
    f(1, 7, 15, 14, 7, 15, L);
    for (let k = 1; k <= 6; k++) {
      const st = k === 2 || k === 6 ? G : L;
      for (let j = 0; j <= 15; j += 15) {
        f(j, k, 0, j, k, 1, st);
        f(j, k, 6, j, k, 9, st);
        f(j, k, 14, j, k, 15, st);
      }
      f(1, k, 0, 1, k, 0, st);
      f(6, k, 0, 9, k, 0, st);
      f(14, k, 0, 14, k, 0, st);
      f(1, k, 15, 14, k, 15, st);
    }
    f(6, 3, 6, 9, 6, 9, K);
    f(7, 4, 7, 8, 5, 8, GOLD);
    for (let l = 3; l <= 6; l += 3)
      for (let i1 = 6; i1 <= 9; i1 += 3) {
        this.placeBlock(ctx, LAMP, i1, l, 6, chunk);
        this.placeBlock(ctx, LAMP, i1, l, 9, chunk);
      }
    f(5, 1, 6, 5, 2, 6, L);
    f(5, 1, 9, 5, 2, 9, L);
    f(10, 1, 6, 10, 2, 6, L);
    f(10, 1, 9, 10, 2, 9, L);
    f(6, 1, 5, 6, 2, 5, L);
    f(9, 1, 5, 9, 2, 5, L);
    f(6, 1, 10, 6, 2, 10, L);
    f(9, 1, 10, 9, 2, 10, L);
    f(5, 2, 5, 5, 6, 5, L);
    f(5, 2, 10, 5, 6, 10, L);
    f(10, 2, 5, 10, 6, 5, L);
    f(10, 2, 10, 10, 6, 10, L);
    f(5, 7, 1, 5, 7, 6, L);
    f(10, 7, 1, 10, 7, 6, L);
    f(5, 7, 9, 5, 7, 14, L);
    f(10, 7, 9, 10, 7, 14, L);
    f(1, 7, 5, 6, 7, 5, L);
    f(1, 7, 10, 6, 7, 10, L);
    f(9, 7, 5, 14, 7, 5, L);
    f(9, 7, 10, 14, 7, 10, L);
    f(2, 1, 2, 2, 1, 3, L);
    f(3, 1, 2, 3, 1, 2, L);
    f(13, 1, 2, 13, 1, 3, L);
    f(12, 1, 2, 12, 1, 2, L);
    f(2, 1, 12, 2, 1, 13, L);
    f(3, 1, 13, 3, 1, 13, L);
    f(13, 1, 12, 13, 1, 13, L);
    f(12, 1, 13, 12, 1, 13, L);
  }
}

/** vanilla OceanMonumentWingRoom: a wing's hall, in one of two designs, with its elder guardian */
class WingRoom extends MonumentPiece {
  private readonly mainDesign: number;
  constructor(o: Dir4, box: BoundingBox, flag: number) {
    super(box, o);
    this.mainDesign = flag & 1;
  }
  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { L, K, LAMP } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number, st: number) => this.fill(ctx, chunk, a, b, c, d, e, g, st);
    const p = (st: number, x: number, y: number, z: number) => this.placeBlock(ctx, st, x, y, z, chunk);
    if (this.mainDesign === 0) {
      for (let i = 0; i < 4; i++) f(10 - i, 3 - i, 20 - i, 12 + i, 3 - i, 20, L);
      f(7, 0, 6, 15, 0, 16, L);
      f(6, 0, 6, 6, 3, 20, L);
      f(16, 0, 6, 16, 3, 20, L);
      f(7, 1, 7, 7, 1, 20, L);
      f(15, 1, 7, 15, 1, 20, L);
      f(7, 1, 6, 9, 3, 6, L);
      f(13, 1, 6, 15, 3, 6, L);
      f(8, 1, 7, 9, 1, 7, L);
      f(13, 1, 7, 14, 1, 7, L);
      f(9, 0, 5, 13, 0, 5, L);
      f(10, 0, 7, 12, 0, 7, K);
      f(8, 0, 10, 8, 0, 12, K);
      f(14, 0, 10, 14, 0, 12, K);
      for (let i1 = 18; i1 >= 7; i1 -= 3) {
        p(LAMP, 6, 3, i1);
        p(LAMP, 16, 3, i1);
      }
      p(LAMP, 10, 0, 10);
      p(LAMP, 12, 0, 10);
      p(LAMP, 10, 0, 12);
      p(LAMP, 12, 0, 12);
      p(LAMP, 8, 3, 6);
      p(LAMP, 14, 3, 6);
      p(L, 4, 2, 4);
      p(LAMP, 4, 1, 4);
      p(L, 4, 0, 4);
      p(L, 18, 2, 4);
      p(LAMP, 18, 1, 4);
      p(L, 18, 0, 4);
      p(L, 4, 2, 18);
      p(LAMP, 4, 1, 18);
      p(L, 4, 0, 18);
      p(L, 18, 2, 18);
      p(LAMP, 18, 1, 18);
      p(L, 18, 0, 18);
      p(L, 9, 7, 20);
      p(L, 13, 7, 20);
      f(6, 0, 21, 7, 4, 21, L);
      f(15, 0, 21, 16, 4, 21, L);
      this.spawnElder(ctx, chunk, 11, 2, 16);
    } else if (this.mainDesign === 1) {
      f(9, 3, 18, 13, 3, 20, L);
      f(9, 0, 18, 9, 2, 18, L);
      f(13, 0, 18, 13, 2, 18, L);
      let j1 = 9;
      for (let l = 0; l < 2; l++) {
        p(L, j1, 6, 20);
        p(LAMP, j1, 5, 20);
        p(L, j1, 4, 20);
        j1 = 13;
      }
      f(7, 3, 7, 15, 3, 14, L);
      j1 = 10;
      for (let k1 = 0; k1 < 2; k1++) {
        f(j1, 0, 10, j1, 6, 10, L);
        f(j1, 0, 12, j1, 6, 12, L);
        p(LAMP, j1, 0, 10);
        p(LAMP, j1, 0, 12);
        p(LAMP, j1, 4, 10);
        p(LAMP, j1, 4, 12);
        j1 = 12;
      }
      j1 = 8;
      for (let l1 = 0; l1 < 2; l1++) {
        f(j1, 0, 7, j1, 2, 7, L);
        f(j1, 0, 14, j1, 2, 14, L);
        j1 = 14;
      }
      f(8, 3, 8, 8, 3, 13, K);
      f(14, 3, 8, 14, 3, 13, K);
      this.spawnElder(ctx, chunk, 11, 5, 13);
    }
  }
}

/** vanilla OceanMonumentPenthouse: the room on the roof, with the third elder guardian */
class Penthouse extends MonumentPiece {
  constructor(o: Dir4, box: BoundingBox) {
    super(box, o);
  }
  postProcess(ctx: GenContext, chunk: BoundingBox): void {
    const { G, L, K, LAMP } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number, st: number) => this.fill(ctx, chunk, a, b, c, d, e, g, st);
    const p = (st: number, x: number, y: number, z: number) => this.placeBlock(ctx, st, x, y, z, chunk);
    f(2, -1, 2, 11, -1, 11, L);
    f(0, -1, 0, 1, -1, 11, G);
    f(12, -1, 0, 13, -1, 11, G);
    f(2, -1, 0, 11, -1, 1, G);
    f(2, -1, 12, 11, -1, 13, G);
    f(0, 0, 0, 0, 0, 13, L);
    f(13, 0, 0, 13, 0, 13, L);
    f(1, 0, 0, 12, 0, 0, L);
    f(1, 0, 13, 12, 0, 13, L);
    for (let i = 2; i <= 11; i += 3) {
      p(LAMP, 0, 0, i);
      p(LAMP, 13, 0, i);
      p(LAMP, i, 0, 0);
    }
    f(2, 0, 3, 4, 0, 9, L);
    f(9, 0, 3, 11, 0, 9, L);
    f(4, 0, 9, 9, 0, 11, L);
    p(L, 5, 0, 8);
    p(L, 8, 0, 8);
    p(L, 10, 0, 10);
    p(L, 3, 0, 10);
    f(3, 0, 3, 3, 0, 7, K);
    f(10, 0, 3, 10, 0, 7, K);
    f(6, 0, 10, 7, 0, 10, K);
    let j = 3;
    for (let k = 0; k < 2; k++) {
      for (let l = 2; l <= 8; l += 3) f(j, 0, l, j, 2, l, L);
      j = 10;
    }
    f(5, 0, 10, 5, 2, 10, L);
    f(8, 0, 10, 8, 2, 10, L);
    f(6, -1, 7, 7, -1, 8, K);
    this.waterBox(ctx, chunk, 6, -1, 3, 7, -1, 4);
    this.spawnElder(ctx, chunk, 6, 1, 6);
  }
}

// --- vanilla MonumentRoomFitter: the first that fits takes an unclaimed cell (and its neighbours)
interface Fitter {
  fits(d: RoomDefinition): boolean;
  create(o: Dir4, d: RoomDefinition, r: JavaRandom): MonumentPiece;
}
const FITTERS: Fitter[] = [
  // vanilla FitDoubleXYRoom
  {
    fits: (d) => {
      if (!(d.hasOpening[EAST] && !d.connections[EAST]!.claimed && d.hasOpening[UP] && !d.connections[UP]!.claimed)) return false;
      const e = d.connections[EAST]!;
      return e.hasOpening[UP] && !e.connections[UP]!.claimed;
    },
    create: (o, d) => {
      d.claimed = true;
      d.connections[EAST]!.claimed = true;
      d.connections[UP]!.claimed = true;
      d.connections[EAST]!.connections[UP]!.claimed = true;
      return new DoubleXYRoom(o, d);
    },
  },
  // vanilla FitDoubleYZRoom
  {
    fits: (d) => {
      if (!(d.hasOpening[NORTH] && !d.connections[NORTH]!.claimed && d.hasOpening[UP] && !d.connections[UP]!.claimed)) return false;
      const n = d.connections[NORTH]!;
      return n.hasOpening[UP] && !n.connections[UP]!.claimed;
    },
    create: (o, d) => {
      d.claimed = true;
      d.connections[NORTH]!.claimed = true;
      d.connections[UP]!.claimed = true;
      d.connections[NORTH]!.connections[UP]!.claimed = true;
      return new DoubleYZRoom(o, d);
    },
  },
  // vanilla FitDoubleZRoom
  {
    fits: (d) => d.hasOpening[NORTH] && !d.connections[NORTH]!.claimed,
    create: (o, d) => {
      let def = d;
      if (!d.hasOpening[NORTH] || d.connections[NORTH]!.claimed) def = d.connections[SOUTH]!;
      def.claimed = true;
      def.connections[NORTH]!.claimed = true;
      return new DoubleZRoom(o, def);
    },
  },
  // vanilla FitDoubleXRoom
  {
    fits: (d) => d.hasOpening[EAST] && !d.connections[EAST]!.claimed,
    create: (o, d) => {
      d.claimed = true;
      d.connections[EAST]!.claimed = true;
      return new DoubleXRoom(o, d);
    },
  },
  // vanilla FitDoubleYRoom
  {
    fits: (d) => d.hasOpening[UP] && !d.connections[UP]!.claimed,
    create: (o, d) => {
      d.claimed = true;
      d.connections[UP]!.claimed = true;
      return new DoubleYRoom(o, d);
    },
  },
  // vanilla FitSimpleTopRoom: closed on every side but below
  {
    fits: (d) => !d.hasOpening[WEST] && !d.hasOpening[EAST] && !d.hasOpening[NORTH] && !d.hasOpening[SOUTH] && !d.hasOpening[UP],
    create: (o, d) => {
      d.claimed = true;
      return new SimpleTopRoom(o, d);
    },
  },
  // vanilla FitSimpleRoom
  {
    fits: () => true,
    create: (o, d, r) => {
      d.claimed = true;
      return new SimpleRoom(o, d, r);
    },
  },
];

/** vanilla OceanMonumentPieces.MonumentBuilding: the building, and the rooms it holds */
export class MonumentBuilding extends MonumentPiece {
  readonly children: MonumentPiece[] = [];
  private sourceRoom!: RoomDefinition;
  private coreRoom!: RoomDefinition;

  constructor(r: JavaRandom, x: number, z: number, o: Dir4) {
    super(new BoundingBox(x, 39, z, x + 57, 61, z + 57), o);
    const rooms = this.generateRoomGraph(r);
    this.sourceRoom.claimed = true;
    this.children.push(new EntryRoom(o, this.sourceRoom));
    this.children.push(new CoreRoom(o, this.coreRoom));
    for (const d of rooms) {
      if (d.claimed || d.isSpecial()) continue;
      for (const fit of FITTERS)
        if (fit.fits(d)) {
          this.children.push(fit.create(o, d, r));
          break;
        }
    }
    const [bx, by, bz] = this.worldPos(9, 0, 22);
    for (const c of this.children) c.box.move(bx, by, bz);
    const corners = (a: [number, number, number], b: [number, number, number]) =>
      new BoundingBox(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]));
    const left = corners(this.worldPos(1, 1, 1), this.worldPos(23, 8, 21));
    const right = corners(this.worldPos(34, 1, 1), this.worldPos(56, 8, 21));
    const top = corners(this.worldPos(22, 13, 22), this.worldPos(35, 17, 35));
    let i = r.nextInt();
    this.children.push(new WingRoom(o, left, i++));
    this.children.push(new WingRoom(o, right, i++));
    this.children.push(new Penthouse(o, top));
  }

  /** the rooms' kinds, for tests */
  roomKinds(): string[] {
    return this.children.map((c) => c.constructor.name);
  }

  /** vanilla generateRoomGraph: the 5×5×3 grid of cells (fewer up high), joined, then thinned at random */
  private generateRoomGraph(r: JavaRandom): RoomDefinition[] {
    const grid: (RoomDefinition | null)[] = new Array(75).fill(null);
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 4; j++) {
        const l = roomIndex(i, 0, j);
        grid[l] = new RoomDefinition(l);
      }
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 4; j++) {
        const l = roomIndex(i, 1, j);
        grid[l] = new RoomDefinition(l);
      }
    for (let i = 1; i < 4; i++)
      for (let j = 0; j < 2; j++) {
        const l = roomIndex(i, 2, j);
        grid[l] = new RoomDefinition(l);
      }
    this.sourceRoom = grid[SOURCE_INDEX]!;
    for (let x = 0; x < 5; x++)
      for (let z = 0; z < 5; z++)
        for (let y = 0; y < 3; y++) {
          const here = grid[roomIndex(x, y, z)];
          if (!here) continue;
          for (let d = 0; d < 6; d++) {
            const nx = x + STEP[d][0], ny = y + STEP[d][1], nz = z + STEP[d][2];
            if (nx < 0 || nx >= 5 || nz < 0 || nz >= 5 || ny < 0 || ny >= 3) continue;
            const there = grid[roomIndex(nx, ny, nz)];
            if (!there) continue;
            // (the grid's z runs north: a step south in the world is a step back in it)
            if (nz === z) here.setConnection(d, there);
            else here.setConnection(d ^ 1, there);
          }
        }
    const penthouse = new RoomDefinition(PENTHOUSE_INDEX);
    const leftWing = new RoomDefinition(LEFTWING_INDEX);
    const rightWing = new RoomDefinition(RIGHTWING_INDEX);
    grid[TOP_CONNECT_INDEX]!.setConnection(UP, penthouse);
    grid[LEFTWING_CONNECT_INDEX]!.setConnection(SOUTH, leftWing);
    grid[RIGHTWING_CONNECT_INDEX]!.setConnection(SOUTH, rightWing);
    penthouse.claimed = true;
    leftWing.claimed = true;
    rightWing.claimed = true;
    this.sourceRoom.isSource = true;
    // the core room: two by two by two cells, somewhere along the back
    const core = grid[roomIndex(r.nextInt(4), 0, 2)]!;
    this.coreRoom = core;
    core.claimed = true;
    core.connections[EAST]!.claimed = true;
    core.connections[NORTH]!.claimed = true;
    core.connections[EAST]!.connections[NORTH]!.claimed = true;
    core.connections[UP]!.claimed = true;
    core.connections[EAST]!.connections[UP]!.claimed = true;
    core.connections[NORTH]!.connections[UP]!.claimed = true;
    core.connections[EAST]!.connections[NORTH]!.connections[UP]!.claimed = true;
    const list: RoomDefinition[] = [];
    for (const d of grid) {
      if (!d) continue;
      d.updateOpenings();
      list.push(d);
    }
    penthouse.updateOpenings();
    // vanilla Util.shuffle
    for (let j = list.length; j > 1; j--) {
      const k = r.nextInt(j);
      const t = list[j - 1];
      list[j - 1] = list[k];
      list[k] = t;
    }
    // close up to two ways out of each cell, as long as both sides can still reach the entrance
    let scan = 1;
    for (const d of list) {
      let closed = 0, tries = 0;
      while (closed < 2 && tries < 5) {
        tries++;
        const l = r.nextInt(6);
        if (!d.hasOpening[l]) continue;
        const back = l ^ 1;
        d.hasOpening[l] = false;
        d.connections[l]!.hasOpening[back] = false;
        if (d.findSource(scan++) && d.connections[l]!.findSource(scan++)) closed++;
        else {
          d.hasOpening[l] = true;
          d.connections[l]!.hasOpening[back] = true;
        }
      }
    }
    list.push(penthouse, leftWing, rightWing);
    return list;
  }

  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    const { L } = blocks();
    const top = Math.max(SEA_LEVEL, 64) - this.box.minY;
    this.waterBox(ctx, chunk, 0, 0, 0, 58, top, 58);
    this.generateWing(false, 0, ctx, chunk);
    this.generateWing(true, 33, ctx, chunk);
    this.generateEntranceArchs(ctx, chunk);
    this.generateEntranceWall(ctx, chunk);
    this.generateRoofPiece(ctx, chunk);
    this.generateLowerWall(ctx, chunk);
    this.generateMiddleWall(ctx, chunk);
    this.generateUpperWall(ctx, chunk);
    // the pillars under the rim, down to the sea floor
    for (let j = 0; j < 7; j++) {
      let k = 0;
      while (k < 7) {
        if (k === 0 && j === 3) k = 6;
        const l = j * 9, i1 = k * 9;
        for (let j1 = 0; j1 < 4; j1++)
          for (let k1 = 0; k1 < 4; k1++) {
            this.placeBlock(ctx, L, l + j1, 0, i1 + k1, chunk);
            this.fillColumnDown(ctx, L, l + j1, -1, i1 + k1, chunk);
          }
        if (j !== 0 && j !== 6) k += 6;
        else k++;
      }
    }
    // the water stepping away round it
    for (let l1 = 0; l1 < 5; l1++) {
      this.waterBox(ctx, chunk, -1 - l1, 0 + l1 * 2, -1 - l1, -1 - l1, 23, 58 + l1);
      this.waterBox(ctx, chunk, 58 + l1, 0 + l1 * 2, -1 - l1, 58 + l1, 23, 58 + l1);
      this.waterBox(ctx, chunk, 0 - l1, 0 + l1 * 2, -1 - l1, 57 + l1, 23, -1 - l1);
      this.waterBox(ctx, chunk, 0 - l1, 0 + l1 * 2, 58 + l1, 57 + l1, 23, 58 + l1);
    }
    for (const c of this.children) if (c.box.intersects(chunk)) c.postProcess(ctx, chunk, r);
  }

  private generateWing(wing: boolean, x: number, ctx: GenContext, chunk: BoundingBox): void {
    if (!this.chunkIntersects(chunk, x, 0, x + 23, 20)) return;
    const { G, L } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number, st: number) => this.fill(ctx, chunk, a, b, c, d, e, g, st);
    const p = (st: number, px: number, py: number, pz: number) => this.placeBlock(ctx, st, px, py, pz, chunk);
    f(x + 0, 0, 0, x + 24, 0, 20, G);
    this.waterBox(ctx, chunk, x + 0, 1, 0, x + 24, 10, 20);
    for (let j = 0; j < 4; j++) {
      f(x + j, j + 1, j, x + j, j + 1, 20, L);
      f(x + j + 7, j + 5, j + 7, x + j + 7, j + 5, 20, L);
      f(x + 17 - j, j + 5, j + 7, x + 17 - j, j + 5, 20, L);
      f(x + 24 - j, j + 1, j, x + 24 - j, j + 1, 20, L);
      f(x + j + 1, j + 1, j, x + 23 - j, j + 1, j, L);
      f(x + j + 8, j + 5, j + 7, x + 16 - j, j + 5, j + 7, L);
    }
    f(x + 4, 4, 4, x + 6, 4, 20, G);
    f(x + 7, 4, 4, x + 17, 4, 6, G);
    f(x + 18, 4, 4, x + 20, 4, 20, G);
    f(x + 11, 8, 11, x + 13, 8, 20, G);
    p(L, x + 12, 9, 12);
    p(L, x + 12, 9, 15);
    p(L, x + 12, 9, 18);
    const j1 = x + (wing ? 19 : 5);
    const k = x + (wing ? 5 : 19);
    for (let l = 20; l >= 5; l -= 3) p(L, j1, 5, l);
    for (let k1 = 19; k1 >= 7; k1 -= 3) p(L, k, 5, k1);
    for (let l1 = 0; l1 < 4; l1++) {
      const i1 = wing ? x + 24 - (17 - l1 * 3) : x + 17 - l1 * 3;
      p(L, i1, 5, 5);
    }
    p(L, k, 5, 5);
    f(x + 11, 1, 12, x + 13, 7, 12, G);
    f(x + 12, 1, 11, x + 12, 7, 13, G);
  }

  private generateEntranceArchs(ctx: GenContext, chunk: BoundingBox): void {
    if (!this.chunkIntersects(chunk, 22, 5, 35, 17)) return;
    const { G, L, LAMP } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number, st: number) => this.fill(ctx, chunk, a, b, c, d, e, g, st);
    const p = (st: number, x: number, y: number, z: number) => this.placeBlock(ctx, st, x, y, z, chunk);
    this.waterBox(ctx, chunk, 25, 0, 0, 32, 8, 20);
    for (let i = 0; i < 4; i++) {
      const z = 5 + i * 4;
      f(24, 2, z, 24, 4, z, L);
      f(22, 4, z, 23, 4, z, L);
      p(L, 25, 5, z);
      p(L, 26, 6, z);
      p(LAMP, 26, 5, z);
      f(33, 2, z, 33, 4, z, L);
      f(34, 4, z, 35, 4, z, L);
      p(L, 32, 5, z);
      p(L, 31, 6, z);
      p(LAMP, 31, 5, z);
      f(27, 6, z, 30, 6, z, G);
    }
  }

  private generateEntranceWall(ctx: GenContext, chunk: BoundingBox): void {
    if (!this.chunkIntersects(chunk, 15, 20, 42, 21)) return;
    const { G, L, K } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number, st: number) => this.fill(ctx, chunk, a, b, c, d, e, g, st);
    const p = (st: number, x: number, y: number, z: number) => this.placeBlock(ctx, st, x, y, z, chunk);
    const w = (a: number, b: number, c: number, d: number, e: number, g: number) => this.waterBox(ctx, chunk, a, b, c, d, e, g);
    f(15, 0, 21, 42, 0, 21, G);
    w(26, 1, 21, 31, 3, 21);
    f(21, 12, 21, 36, 12, 21, G);
    f(17, 11, 21, 40, 11, 21, G);
    f(16, 10, 21, 41, 10, 21, G);
    f(15, 7, 21, 42, 9, 21, G);
    f(16, 6, 21, 41, 6, 21, G);
    f(17, 5, 21, 40, 5, 21, G);
    f(21, 4, 21, 36, 4, 21, G);
    f(22, 3, 21, 26, 3, 21, G);
    f(31, 3, 21, 35, 3, 21, G);
    f(23, 2, 21, 25, 2, 21, G);
    f(32, 2, 21, 34, 2, 21, G);
    f(28, 4, 20, 29, 4, 21, L);
    p(L, 27, 3, 21);
    p(L, 30, 3, 21);
    p(L, 26, 2, 21);
    p(L, 31, 2, 21);
    p(L, 25, 1, 21);
    p(L, 32, 1, 21);
    for (let i = 0; i < 7; i++) {
      p(K, 28 - i, 6 + i, 21);
      p(K, 29 + i, 6 + i, 21);
    }
    for (let j = 0; j < 4; j++) {
      p(K, 28 - j, 9 + j, 21);
      p(K, 29 + j, 9 + j, 21);
    }
    p(K, 28, 12, 21);
    p(K, 29, 12, 21);
    for (let k = 0; k < 3; k++) {
      p(K, 22 - k * 2, 8, 21);
      p(K, 22 - k * 2, 9, 21);
      p(K, 35 + k * 2, 8, 21);
      p(K, 35 + k * 2, 9, 21);
    }
    w(15, 13, 21, 42, 15, 21);
    w(15, 1, 21, 15, 6, 21);
    w(16, 1, 21, 16, 5, 21);
    w(17, 1, 21, 20, 4, 21);
    w(21, 1, 21, 21, 3, 21);
    w(22, 1, 21, 22, 2, 21);
    w(23, 1, 21, 24, 1, 21);
    w(42, 1, 21, 42, 6, 21);
    w(41, 1, 21, 41, 5, 21);
    w(37, 1, 21, 40, 4, 21);
    w(36, 1, 21, 36, 3, 21);
    w(33, 1, 21, 34, 1, 21);
    w(35, 1, 21, 35, 2, 21);
  }

  private generateRoofPiece(ctx: GenContext, chunk: BoundingBox): void {
    if (!this.chunkIntersects(chunk, 21, 21, 36, 36)) return;
    const { G, L, LAMP } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number, st: number) => this.fill(ctx, chunk, a, b, c, d, e, g, st);
    const p = (st: number, x: number, y: number, z: number) => this.placeBlock(ctx, st, x, y, z, chunk);
    f(21, 0, 22, 36, 0, 36, G);
    this.waterBox(ctx, chunk, 21, 1, 22, 36, 23, 36);
    for (let i = 0; i < 4; i++) {
      f(21 + i, 13 + i, 21 + i, 36 - i, 13 + i, 21 + i, L);
      f(21 + i, 13 + i, 36 - i, 36 - i, 13 + i, 36 - i, L);
      f(21 + i, 13 + i, 22 + i, 21 + i, 13 + i, 35 - i, L);
      f(36 - i, 13 + i, 22 + i, 36 - i, 13 + i, 35 - i, L);
    }
    f(25, 16, 25, 32, 16, 32, G);
    f(25, 17, 25, 25, 19, 25, L);
    f(32, 17, 25, 32, 19, 25, L);
    f(25, 17, 32, 25, 19, 32, L);
    f(32, 17, 32, 32, 19, 32, L);
    p(L, 26, 20, 26);
    p(L, 27, 21, 27);
    p(LAMP, 27, 20, 27);
    p(L, 26, 20, 31);
    p(L, 27, 21, 30);
    p(LAMP, 27, 20, 30);
    p(L, 31, 20, 31);
    p(L, 30, 21, 30);
    p(LAMP, 30, 20, 30);
    p(L, 31, 20, 26);
    p(L, 30, 21, 27);
    p(LAMP, 30, 20, 27);
    f(28, 21, 27, 29, 21, 27, G);
    f(27, 21, 28, 27, 21, 29, G);
    f(28, 21, 30, 29, 21, 30, G);
    f(30, 21, 28, 30, 21, 29, G);
  }

  private generateLowerWall(ctx: GenContext, chunk: BoundingBox): void {
    const { G, L } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number, st: number) => this.fill(ctx, chunk, a, b, c, d, e, g, st);
    const p = (st: number, x: number, y: number, z: number) => this.placeBlock(ctx, st, x, y, z, chunk);
    if (this.chunkIntersects(chunk, 0, 21, 6, 58)) {
      f(0, 0, 21, 6, 0, 57, G);
      this.waterBox(ctx, chunk, 0, 1, 21, 6, 7, 57);
      f(4, 4, 21, 6, 4, 53, G);
      for (let i = 0; i < 4; i++) f(i, i + 1, 21, i, i + 1, 57 - i, L);
      for (let j = 23; j < 53; j += 3) p(L, 5, 5, j);
      p(L, 5, 5, 52);
      for (let k = 0; k < 4; k++) f(k, k + 1, 21, k, k + 1, 57 - k, L);
      f(4, 1, 52, 6, 3, 52, G);
      f(5, 1, 51, 5, 3, 53, G);
    }
    if (this.chunkIntersects(chunk, 51, 21, 58, 58)) {
      f(51, 0, 21, 57, 0, 57, G);
      this.waterBox(ctx, chunk, 51, 1, 21, 57, 7, 57);
      f(51, 4, 21, 53, 4, 53, G);
      for (let l = 0; l < 4; l++) f(57 - l, l + 1, 21, 57 - l, l + 1, 57 - l, L);
      for (let i1 = 23; i1 < 53; i1 += 3) p(L, 52, 5, i1);
      p(L, 52, 5, 52);
      f(51, 1, 52, 53, 3, 52, G);
      f(52, 1, 51, 52, 3, 53, G);
    }
    if (this.chunkIntersects(chunk, 0, 51, 57, 57)) {
      f(7, 0, 51, 50, 0, 57, G);
      this.waterBox(ctx, chunk, 7, 1, 51, 50, 10, 57);
      for (let j1 = 0; j1 < 4; j1++) f(j1 + 1, j1 + 1, 57 - j1, 56 - j1, j1 + 1, 57 - j1, L);
    }
  }

  private generateMiddleWall(ctx: GenContext, chunk: BoundingBox): void {
    const { G, L } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number, st: number) => this.fill(ctx, chunk, a, b, c, d, e, g, st);
    const p = (st: number, x: number, y: number, z: number) => this.placeBlock(ctx, st, x, y, z, chunk);
    if (this.chunkIntersects(chunk, 7, 21, 13, 50)) {
      f(7, 0, 21, 13, 0, 50, G);
      this.waterBox(ctx, chunk, 7, 1, 21, 13, 10, 50);
      f(11, 8, 21, 13, 8, 53, G);
      for (let i = 0; i < 4; i++) f(i + 7, i + 5, 21, i + 7, i + 5, 54, L);
      for (let j = 21; j <= 45; j += 3) p(L, 12, 9, j);
    }
    if (this.chunkIntersects(chunk, 44, 21, 50, 54)) {
      f(44, 0, 21, 50, 0, 50, G);
      this.waterBox(ctx, chunk, 44, 1, 21, 50, 10, 50);
      f(44, 8, 21, 46, 8, 53, G);
      for (let k = 0; k < 4; k++) f(50 - k, k + 5, 21, 50 - k, k + 5, 54, L);
      for (let l = 21; l <= 45; l += 3) p(L, 45, 9, l);
    }
    if (this.chunkIntersects(chunk, 8, 44, 49, 54)) {
      f(14, 0, 44, 43, 0, 50, G);
      this.waterBox(ctx, chunk, 14, 1, 44, 43, 10, 50);
      for (let i1 = 12; i1 <= 45; i1 += 3) {
        p(L, i1, 9, 45);
        p(L, i1, 9, 52);
        if (i1 === 12 || i1 === 18 || i1 === 24 || i1 === 33 || i1 === 39 || i1 === 45) {
          p(L, i1, 9, 47);
          p(L, i1, 9, 50);
          p(L, i1, 10, 45);
          p(L, i1, 10, 46);
          p(L, i1, 10, 51);
          p(L, i1, 10, 52);
          p(L, i1, 11, 47);
          p(L, i1, 11, 50);
          p(L, i1, 12, 48);
          p(L, i1, 12, 49);
        }
      }
      for (let j1 = 0; j1 < 3; j1++) f(8 + j1, 5 + j1, 54, 49 - j1, 5 + j1, 54, G);
      f(11, 8, 54, 46, 8, 54, L);
      f(14, 8, 44, 43, 8, 53, G);
    }
  }

  private generateUpperWall(ctx: GenContext, chunk: BoundingBox): void {
    const { G, L } = blocks();
    const f = (a: number, b: number, c: number, d: number, e: number, g: number, st: number) => this.fill(ctx, chunk, a, b, c, d, e, g, st);
    const p = (st: number, x: number, y: number, z: number) => this.placeBlock(ctx, st, x, y, z, chunk);
    if (this.chunkIntersects(chunk, 14, 21, 20, 43)) {
      f(14, 0, 21, 20, 0, 43, G);
      this.waterBox(ctx, chunk, 14, 1, 22, 20, 14, 43);
      f(18, 12, 22, 20, 12, 39, G);
      f(18, 12, 21, 20, 12, 21, L);
      for (let i = 0; i < 4; i++) f(i + 14, i + 9, 21, i + 14, i + 9, 43 - i, L);
      for (let j = 23; j <= 39; j += 3) p(L, 19, 13, j);
    }
    if (this.chunkIntersects(chunk, 37, 21, 43, 43)) {
      f(37, 0, 21, 43, 0, 43, G);
      this.waterBox(ctx, chunk, 37, 1, 22, 43, 14, 43);
      f(37, 12, 22, 39, 12, 39, G);
      f(37, 12, 21, 39, 12, 21, L);
      for (let k = 0; k < 4; k++) f(43 - k, k + 9, 21, 43 - k, k + 9, 43 - k, L);
      for (let l = 23; l <= 39; l += 3) p(L, 38, 13, l);
    }
    if (this.chunkIntersects(chunk, 15, 37, 42, 43)) {
      f(21, 0, 37, 36, 0, 43, G);
      this.waterBox(ctx, chunk, 21, 1, 37, 36, 14, 43);
      f(21, 12, 37, 36, 12, 39, G);
      for (let i1 = 0; i1 < 4; i1++) f(15 + i1, i1 + 9, 43 - i1, 42 - i1, i1 + 9, 43 - i1, L);
      for (let j1 = 21; j1 <= 36; j1 += 3) p(L, j1, 13, 38);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Placement

export interface MonumentStub {
  /** the start chunk */
  cx: number;
  cz: number;
}

const floorDiv = (a: number, b: number) => Math.floor(a / b);

export class OceanMonuments {
  private readonly stubs = new Map<number, MonumentStub | null>();
  private readonly built = new Map<number, MonumentBuilding>();
  private readonly hashSeed: number;

  /** `quartBiome`: the biome at a quart (vanilla getNoiseBiome) */
  constructor(private readonly seed: bigint, private readonly quartBiome: (x: number, z: number) => number) {
    this.hashSeed = Number(BigInt.asIntN(32, seed ^ (seed >> 32n))) ^ 0x0ce4a7;
  }

  /** vanilla RandomSpreadStructurePlacement.getPotentialStructureChunk (triangular spread) */
  potentialChunk(rx: number, rz: number): [number, number] {
    const r = saltedRandom(this.seed, rx, rz, SALT);
    const n = SPACING - SEPARATION;
    const i = Math.floor((r.nextInt(n) + r.nextInt(n)) / 2), j = Math.floor((r.nextInt(n) + r.nextInt(n)) / 2);
    return [rx * SPACING + i, rz * SPACING + j];
  }

  /**
   * a region's monument, if it has one: vanilla OceanMonumentStructure.findGenerationPoint (every biome within 29
   * blocks of the start chunk's (9, 9), at sea level, ocean or river) and Structure.isValidBiome (a deep ocean at the
   * chunk's middle). The biomes are the surface's, a quart at a time.
   */
  stub(rx: number, rz: number): MonumentStub | null {
    const key = rx * 65536 + rz;
    const c = this.stubs.get(key);
    if (c !== undefined) return c;
    const [cx, cz] = this.potentialChunk(rx, rz);
    let found: MonumentStub | null = null;
    if (DEEP_OCEANS.has(this.quartBiome(cx * 16 + 8, cz * 16 + 8)) && this.surroundedByOcean(cx * 16 + 9, cz * 16 + 9)) found = { cx, cz };
    this.stubs.set(key, found);
    return found;
  }

  /** vanilla BiomeSource.getBiomesWithin(x, sea level, z, 29): every quart in reach */
  private surroundedByOcean(x: number, z: number): boolean {
    const q0x = (x - BIOME_RANGE) >> 2, q1x = (x + BIOME_RANGE) >> 2, q0z = (z - BIOME_RANGE) >> 2, q1z = (z + BIOME_RANGE) >> 2;
    for (let qz = q0z; qz <= q1z; qz++) for (let qx = q0x; qx <= q1x; qx++) if (!SURROUNDING.has(this.quartBiome(qx * 4, qz * 4))) return false;
    return true;
  }

  /** a region's monument, laid out the first time it's wanted (vanilla OceanMonumentStructure.createTopPiece) */
  building(rx: number, rz: number): MonumentBuilding | null {
    const s = this.stub(rx, rz);
    if (!s) return null;
    const key = rx * 65536 + rz;
    let b = this.built.get(key);
    if (b) return b;
    if (this.built.size > 32) this.built.clear();
    const r = largeFeatureRandom(this.seed, s.cx, s.cz);
    const dir = HORIZONTAL[r.nextInt(4)];
    b = new MonumentBuilding(r, s.cx * 16 - 29, s.cz * 16 - 29, dir);
    this.built.set(key, b);
    return b;
  }

  /** the monuments whose building may reach a chunk (it spans two chunks either side of its start) */
  private near(cx: number, cz: number): MonumentBuilding[] {
    const out: MonumentBuilding[] = [];
    for (let rx = floorDiv(cx - 2, SPACING); rx <= floorDiv(cx + 2, SPACING); rx++)
      for (let rz = floorDiv(cz - 2, SPACING); rz <= floorDiv(cz + 2, SPACING); rz++) {
        const s = this.stub(rx, rz);
        if (!s || Math.abs(s.cx - cx) > 2 || Math.abs(s.cz - cz) > 2) continue;
        const b = this.building(rx, rz);
        if (b) out.push(b);
      }
    return out;
  }

  /** vanilla StructureStart.placeInChunk: the building (and the rooms in it) as far as it reaches into this chunk */
  place(ctx: GenContext): void {
    const chunk = new BoundingBox(ctx.x0, MIN_Y + 1, ctx.z0, ctx.x0 + 15, MAX_Y - 1, ctx.z0 + 15);
    for (const b of this.near(ctx.cx, ctx.cz)) {
      if (!b.box.intersects(chunk)) continue;
      b.postProcess(ctx, chunk, new Rand(hash2(ctx.cx, ctx.cz, this.hashSeed), 4));
    }
  }

  /**
   * (Stage 5: ocean) the monuments whose box may hold (x, z), for their spawn overrides (vanilla getAllStructuresAt):
   * the start's box is the building's, and the building is its one piece (its rooms are inside it)
   */
  startsAt(x: number, z: number): { bounds: BoundingBox; pieces: { box: BoundingBox }[] }[] {
    return this.near(x >> 4, z >> 4).map((b) => ({ bounds: b.box, pieces: [b] }));
  }

  /** vanilla StructureManager.getStructureAt (the structure's box: the building's) */
  structureAt(x: number, y: number, z: number): BoundingBox | null {
    for (const b of this.near(x >> 4, z >> 4)) if (b.box.isInside(x, y, z)) return b.box;
    return null;
  }

  /** vanilla ChunkGenerator.getNearestGeneratedStructure for /locate (the first in the nearest ring): the start chunk's corner */
  nearest(x: number, z: number, radius = 100): [number, number] | null {
    const rx0 = floorDiv(x >> 4, SPACING), rz0 = floorDiv(z >> 4, SPACING);
    for (let ring = 0; ring <= radius; ring++)
      for (let i = -ring; i <= ring; i++)
        for (let j = -ring; j <= ring; j++) {
          if (i !== -ring && i !== ring && j !== -ring && j !== ring) continue;
          const s = this.stub(rx0 + i, rz0 + j);
          if (s) return [s.cx * 16, s.cz * 16];
        }
    return null;
  }
}

/** monuments for /locate and their guardians on the main thread: only the biome noise is needed to know where they are */
export function monumentLocator(seed: string): OceanMonuments {
  const router = new OverworldRouter(SeedSource.fromWorldSeed(seed));
  const quartBiome = (x: number, z: number) => {
    const c = router.column(x & ~3, z & ~3, newColumn());
    return pickSurfaceBiome(c.temperature, c.humidity, c.continents, c.erosion, c.ridges);
  };
  return new OceanMonuments(worldSeed64(seed), quartBiome);
}
