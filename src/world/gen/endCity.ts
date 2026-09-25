// End cities (vanilla structure set end_cities, EndCityStructure and EndCityPieces). At most one per 20 x 20-chunk
// region, in a chunk drawn from the region's salted random with a triangular spread (RandomSpreadStructurePlacement:
// spacing 20, separation 11, salt 10387313), where that chunk is End highlands or midlands and the ground at the
// corners of a 5 x 5 box beside its middle (on the side the city is turned to) is at y 60 or above
// (getLowestYIn5by5BoxOffset7Blocks). The city grows from there as vanilla's does: a house of three floors with a tower
// on its roof; towers with bridges out of them, or with a fat tower on top that has bridges of its own; bridges that end
// in another house with its own tower, or (once in a city) in a ship; up to 8 sections deep, and a section is dropped
// when it runs into what's there. Its pieces reach only the chunks within 8 of the start's (vanilla's structure
// references), and are placed in the SURFACE_STRUCTURES step. The chunk workers and the main thread (/locate, The City
// at the End of the Game) lay them out alike.

import { Rand, hash2, type JavaRandom } from '../../core/rng';
import { B } from './biomes';
import { blockOf } from '../block';
import type { GenContext } from './context';
import type { SavedBlockEntity } from '../blockEntity';
import type { SavedEntity } from '../../entity/mob';
import { BoundingBox } from './structure';
import { largeFeatureRandom, saltedRandom, rotateState } from './jigsaw';
import { cityTemplate, CITY_SIZES } from './endCityTemplates';

export interface EndCityTerrain {
  /** the End's biome for a chunk (vanilla TheEndBiomeSource: one per chunk) */
  biomeOfChunk(cx: number, cz: number): number;
  /** vanilla getFirstOccupiedHeight(WORLD_SURFACE_WG) on the bare noise terrain: the top end stone's y, -1 over none */
  firstOccupiedHeight(x: number, z: number): number;
}

// vanilla worldgen/structure_set/end_cities.json
const SPACING = 20, SEPARATION = 11, SALT = 10387313;
/** vanilla ChunkGenerator.createReferences: a start's pieces reach the chunks within 8 of its own */
const REACH = 8;
/** vanilla getWritableArea in the End (min build height 0, max 256): y 1 to 255 */
const MIN_PLACE_Y = 1, MAX_PLACE_Y = 255;
/** vanilla EndCityStructure: no city starts on ground lower than this */
const MIN_START_Y = 60;
/** vanilla getLowestYIn5by5BoxOffset7Blocks: which way the box reaches from the chunk's middle, by the city's turn */
const BOX: readonly [number, number][] = [[5, 5], [-5, 5], [-5, -5], [5, -5]];
/** vanilla Rotation.rotate(Direction.SOUTH), as the item frame's facing (Direction's 3D data values) */
const SOUTH_TURNED = [3, 4, 2, 5];
/** blocks whose shape depends on their neighbours: fixed up once the chunks round them are there */
const SHAPED = /(_stairs|_fence|_pane|_wall|^iron_bars)$/;

/** vanilla StructureTemplate.transform about the origin: (x, z) turned clockwise by quarter turns (Rotation's order) */
function turn(x: number, z: number, rot: number): [number, number] {
  switch (rot & 3) {
    case 1: return [-z, x];
    case 2: return [-x, -z];
    case 3: return [z, -x];
    default: return [x, z];
  }
}

/** vanilla EndCityPieces.EndCityPiece: a template at a position, turned about its corner */
export class EndCityPiece {
  /** vanilla StructurePiece.genDepth: which batch of the layout it came in (collisions within one are allowed) */
  genDepth = 0;
  readonly box: BoundingBox;

  /** overwrite: vanilla BlockIgnoreProcessor.STRUCTURE_BLOCK (the template's air is placed) rather than STRUCTURE_AND_AIR */
  constructor(readonly name: string, readonly x: number, readonly y: number, readonly z: number, readonly rot: number, readonly overwrite: boolean) {
    const [sx, sy, sz] = CITY_SIZES[name];
    const [ax, az] = turn(sx - 1, sz - 1, rot);
    this.box = new BoundingBox(x + Math.min(0, ax), y, z + Math.min(0, az), x + Math.max(0, ax), y + sy - 1, z + Math.max(0, az));
  }

  /** where a template position is in the world */
  pos(lx: number, ly: number, lz: number): [number, number, number] {
    const [dx, dz] = turn(lx, lz, this.rot);
    return [this.x + dx, this.y + ly, this.z + dz];
  }

  /**
   * vanilla TemplateStructurePiece.postProcess: the template's blocks in this chunk, turned (air only if the piece
   * overwrites), and its block entities; then its data markers (EndCityPiece.handleDataMarker): the chest under a
   * "Chest" gets chests/end_city_treasure, a shulker sits at a "Sentry", and at "Elytra" an item frame with an elytra
   * hangs facing the template's south
   */
  place(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    const t = cityTemplate(this.name), b = t.blocks;
    for (let i = 0; i < b.length; i += 4) {
      const st = b[i + 3];
      if (st === 0 && !this.overwrite) continue;
      const [wx, wy, wz] = this.pos(b[i], b[i + 1], b[i + 2]);
      if (!chunk.isInside(wx, wy, wz)) continue;
      const s = rotateState(st, this.rot);
      ctx.set(wx, wy, wz, s);
      if (s > 0 && SHAPED.test(blockOf(s).name)) ctx.markForPostprocessing(wx, wy, wz);
    }
    const placed = new Map<string, SavedBlockEntity>();
    for (const e of t.blockEntities) {
      const [wx, wy, wz] = this.pos(e.x, e.y, e.z);
      if (!chunk.isInside(wx, wy, wz)) continue;
      const be: SavedBlockEntity = { id: e.id, x: wx, y: wy, z: wz, items: e.items.map((s) => [...s] as SavedBlockEntity['items'][number]) };
      ctx.blockEntities.push(be);
      placed.set(`${wx},${wy},${wz}`, be);
    }
    for (const m of t.markers) {
      const [wx, wy, wz] = this.pos(m.x, m.y, m.z);
      if (m.name === 'Chest') {
        const chest = chunk.isInside(wx, wy - 1, wz) ? placed.get(`${wx},${wy - 1},${wz}`) : undefined;
        if (chest) chest.data = { lootTable: 'chests/end_city_treasure', lootSeed: r.nextU32() };
        continue;
      }
      if (!chunk.isInside(wx, wy, wz)) continue;
      const base = { x: wx + 0.5, y: wy, z: wz + 0.5, yaw: 0, pitch: 0, dx: 0, dy: 0, dz: 0, fire: 0 };
      if (m.name === 'Sentry') ctx.entities.push({ id: 'shulker', ...base, health: 30 } as SavedEntity);
      else
        ctx.entities.push({
          id: 'item_frame', ...base, health: 1, hand: ['elytra', 1, 0],
          data: { facing: SOUTH_TURNED[this.rot], tileX: wx, tileY: wy, tileZ: wz, rotation: 0, dropChance: 1 },
        } as SavedEntity);
    }
  }
}

type Offset = readonly [number, number, number];
type Section = 'house' | 'tower' | 'bridge' | 'fat_tower';

/** vanilla EndCityPieces.TOWER_BRIDGES: where a tower's bridges start (turn, offset from the tower piece) */
const TOWER_BRIDGES: readonly [number, Offset][] = [[0, [1, -1, 0]], [1, [6, -1, 1]], [3, [0, -1, 5]], [2, [5, -1, 6]]];
/** vanilla EndCityPieces.FAT_TOWER_BRIDGES */
const FAT_TOWER_BRIDGES: readonly [number, Offset][] = [[0, [4, -1, 0]], [1, [12, -1, 4]], [3, [0, -1, 8]], [2, [8, -1, 12]]];

function add(list: EndCityPiece[], p: EndCityPiece): EndCityPiece {
  list.push(p);
  return p;
}

/** vanilla EndCityPieces.addPiece: a piece placed from the previous one's corner, the offset turned as that one is */
function next(prev: EndCityPiece, off: Offset, name: string, rot: number, overwrite: boolean): EndCityPiece {
  const [dx, dz] = turn(off[0], off[2], prev.rot);
  return new EndCityPiece(name, prev.x + dx, prev.y + off[1], prev.z + dz, rot & 3, overwrite);
}

/** vanilla EndCityPieces: a city's layout from the start chunk's random, drawn in vanilla's order */
export class EndCityLayout {
  /** vanilla TOWER_BRIDGE_GENERATOR.shipCreated: one ship a city (even if the bridge it was on is then dropped) */
  private shipCreated = false;

  constructor(private readonly r: JavaRandom) {}

  /** vanilla startHouseTower: the first house, three floors high, and its tower */
  start(x: number, y: number, z: number, rot: number): EndCityPiece[] {
    const pieces: EndCityPiece[] = [];
    let p = add(pieces, new EndCityPiece('base_floor', x, y, z, rot, true));
    p = add(pieces, next(p, [-1, 0, -1], 'second_floor_1', rot, false));
    p = add(pieces, next(p, [-1, 4, -1], 'third_floor_1', rot, false));
    p = add(pieces, next(p, [-1, 8, -1], 'third_roof', rot, true));
    this.children('tower', 1, p, null, pieces);
    return pieces;
  }

  /**
   * vanilla recursiveChildren: a section's pieces, kept (added to the list) unless the section is too deep, fails,
   * or any of its pieces (all given a new random generation depth) first runs into one in the list from another
   * batch than the parent's
   */
  private children(section: Section, counter: number, parent: EndCityPiece, start: Offset | null, pieces: EndCityPiece[]): boolean {
    if (counter > 8) return false;
    const list: EndCityPiece[] = [];
    if (!this.generate(section, counter, parent, start, list)) return false;
    const depth = this.r.nextInt();
    for (const p of list) {
      p.genDepth = depth;
      const hit = pieces.find((q) => q.box.intersects(p.box));
      if (hit && hit.genDepth !== parent.genDepth) return false;
    }
    pieces.push(...list);
    return true;
  }

  private generate(section: Section, counter: number, parent: EndCityPiece, start: Offset | null, list: EndCityPiece[]): boolean {
    switch (section) {
      case 'house':
        return this.houseTower(counter, parent, start!, list);
      case 'tower':
        return this.tower(counter, parent, list);
      case 'bridge':
        return this.towerBridge(counter, parent, list);
      case 'fat_tower':
        return this.fatTower(counter, parent, list);
    }
  }

  /** vanilla HOUSE_TOWER_GENERATOR: a house at the end of a bridge: its ground floor only, or two or three floors and a tower */
  private houseTower(counter: number, parent: EndCityPiece, start: Offset, list: EndCityPiece[]): boolean {
    if (counter > 8) return false;
    const rot = parent.rot;
    let p = add(list, next(parent, start, 'base_floor', rot, true));
    const i = this.r.nextInt(3);
    if (i === 0) add(list, next(p, [-1, 4, -1], 'base_roof', rot, true));
    else if (i === 1) {
      p = add(list, next(p, [-1, 0, -1], 'second_floor_2', rot, false));
      p = add(list, next(p, [-1, 8, -1], 'second_roof', rot, false));
      this.children('tower', counter + 1, p, null, list);
    } else {
      p = add(list, next(p, [-1, 0, -1], 'second_floor_2', rot, false));
      p = add(list, next(p, [-1, 4, -1], 'third_floor_2', rot, false));
      p = add(list, next(p, [-1, 8, -1], 'third_roof', rot, true));
      this.children('tower', counter + 1, p, null, list);
    }
    return true;
  }

  /**
   * vanilla TOWER_GENERATOR: a tower on a roof, two to four pieces high; a third of the time (or at a piece on the
   * way up) bridges out of it on any of its four sides and a top, otherwise a fat tower on it (or, 7 deep, a top)
   */
  private tower(counter: number, parent: EndCityPiece, list: EndCityPiece[]): boolean {
    const rot = parent.rot;
    let p = add(list, next(parent, [3 + this.r.nextInt(2), -3, 3 + this.r.nextInt(2)], 'tower_base', rot, true));
    p = add(list, next(p, [0, 7, 0], 'tower_piece', rot, true));
    let bridged: EndCityPiece | null = this.r.nextInt(3) === 0 ? p : null;
    const n = 1 + this.r.nextInt(3);
    for (let j = 0; j < n; j++) {
      p = add(list, next(p, [0, 4, 0], 'tower_piece', rot, true));
      if (j < n - 1 && this.r.nextBoolean()) bridged = p;
    }
    if (bridged) {
      for (const [turns, off] of TOWER_BRIDGES) {
        if (!this.r.nextBoolean()) continue;
        const end = add(list, next(bridged, off, 'bridge_end', rot + turns, true));
        this.children('bridge', counter + 1, end, null, list);
      }
      add(list, next(p, [-1, 4, -1], 'tower_top', rot, true));
    } else {
      if (counter !== 7) return this.children('fat_tower', counter + 1, p, null, list);
      add(list, next(p, [-1, 4, -1], 'tower_top', rot, true));
    }
    return true;
  }

  /**
   * vanilla TOWER_BRIDGE_GENERATOR: one to four lengths of bridge (level, or climbing four up steep or gentle stairs),
   * then, the first time the dice allow (the deeper, the likelier), a ship out beyond it; otherwise a house at its end
   * (and without the house, no bridge); and the doorway into it
   */
  private towerBridge(counter: number, parent: EndCityPiece, list: EndCityPiece[]): boolean {
    const rot = parent.rot;
    const n = this.r.nextInt(4) + 1;
    let p = add(list, next(parent, [0, 0, -4], 'bridge_piece', rot, true));
    p.genDepth = -1;
    let j = 0;
    for (let k = 0; k < n; k++) {
      if (this.r.nextBoolean()) {
        p = add(list, next(p, [0, j, -4], 'bridge_piece', rot, true));
        j = 0;
      } else {
        if (this.r.nextBoolean()) p = add(list, next(p, [0, j, -4], 'bridge_steep_stairs', rot, true));
        else p = add(list, next(p, [0, j, -8], 'bridge_gentle_stairs', rot, true));
        j = 4;
      }
    }
    if (!this.shipCreated && this.r.nextInt(10 - counter) === 0) {
      add(list, next(p, [-8 + this.r.nextInt(8), j, -70 + this.r.nextInt(10)], 'ship', rot, true));
      this.shipCreated = true;
    } else if (!this.children('house', counter + 1, p, [-3, j + 1, -11], list)) return false;
    p = add(list, next(p, [4, j, -1], 'bridge_end', rot + 2, true));
    p.genDepth = -1;
    return true;
  }

  /** vanilla FAT_TOWER_GENERATOR: a wide tower on a tower, a storey or up to two more with bridges out of them, and its top */
  private fatTower(counter: number, parent: EndCityPiece, list: EndCityPiece[]): boolean {
    const rot = parent.rot;
    let p = add(list, next(parent, [-3, 4, -3], 'fat_tower_base', rot, true));
    p = add(list, next(p, [0, 4, 0], 'fat_tower_middle', rot, true));
    for (let i = 0; i < 2 && this.r.nextInt(3) !== 0; i++) {
      p = add(list, next(p, [0, 8, 0], 'fat_tower_middle', rot, true));
      for (const [turns, off] of FAT_TOWER_BRIDGES) {
        if (!this.r.nextBoolean()) continue;
        const end = add(list, next(p, off, 'bridge_end', rot + turns, true));
        this.children('bridge', counter + 1, end, null, list);
      }
    }
    add(list, next(p, [-2, 8, -2], 'fat_tower_top', rot, true));
    return true;
  }
}

export interface EndCityStub {
  /** the start chunk (vanilla locate reports its corner) */
  cx: number;
  cz: number;
  /** clockwise quarter turns (vanilla Rotation.getRandom) */
  rot: number;
  /** the first house's corner: the chunk's (7, 7) at the lowest ground of the 5 x 5 box */
  x: number;
  y: number;
  z: number;
}

export interface EndCityStart extends EndCityStub {
  pieces: EndCityPiece[];
  /** vanilla PiecesContainer.calculateBoundingBox */
  bounds: BoundingBox;
}

const floorDiv = (a: number, b: number) => Math.floor(a / b);

export class EndCities {
  private readonly stubs = new Map<number, EndCityStub | null>();
  private readonly starts = new Map<number, EndCityStart>();
  private readonly seedHash: number;

  constructor(readonly seed: bigint, private readonly terrain: EndCityTerrain) {
    this.seedHash = Number(BigInt.asIntN(32, seed ^ (seed >> 32n)));
  }

  /** vanilla RandomSpreadStructurePlacement.getPotentialStructureChunk, triangular spread */
  potentialChunk(rx: number, rz: number): [number, number] {
    const r = saltedRandom(this.seed, rx, rz, SALT);
    const n = SPACING - SEPARATION;
    const i = (r.nextInt(n) + r.nextInt(n)) >> 1;
    const j = (r.nextInt(n) + r.nextInt(n)) >> 1;
    return [rx * SPACING + i, rz * SPACING + j];
  }

  private key(rx: number, rz: number): number {
    return (rx + 0x100000) * 0x200000 + (rz + 0x100000);
  }

  /**
   * The city a region has, if any (vanilla Structure.findValidGenerationPoint): the city's turn from the start
   * chunk's large-feature random; the lowest of the first occupied heights at the corners of the 5 x 5 box from the
   * chunk's (7, 7) toward the side it's turned to, which mustn't be under 60; and the biome there
   */
  stub(rx: number, rz: number): EndCityStub | null {
    const key = this.key(rx, rz);
    const c = this.stubs.get(key);
    if (c !== undefined) return c;
    const [cx, cz] = this.potentialChunk(rx, rz);
    let s: EndCityStub | null = null;
    const biome = this.terrain.biomeOfChunk(cx, cz);
    if (biome === B.end_highlands || biome === B.end_midlands) {
      const rot = largeFeatureRandom(this.seed, cx, cz).nextInt(4);
      const [i, j] = BOX[rot];
      const x = cx * 16 + 7, z = cz * 16 + 7;
      const h = (a: number, b: number) => this.terrain.firstOccupiedHeight(a, b);
      const y = Math.min(Math.min(h(x, z), h(x, z + j)), Math.min(h(x + i, z), h(x + i, z + j)));
      if (y >= MIN_START_Y) s = { cx, cz, rot, x, y, z };
    }
    if (this.stubs.size > 8192) this.stubs.clear();
    this.stubs.set(key, s);
    return s;
  }

  /** a region's city laid out (vanilla EndCityStructure.generatePieces, after the turn was drawn) */
  start(rx: number, rz: number): EndCityStart | null {
    const s = this.stub(rx, rz);
    if (!s) return null;
    const key = this.key(rx, rz);
    let st = this.starts.get(key);
    if (st) return st;
    const r = largeFeatureRandom(this.seed, s.cx, s.cz);
    r.nextInt(4);
    const pieces = new EndCityLayout(r).start(s.x, s.y, s.z, s.rot);
    const b0 = pieces[0].box;
    const bounds = new BoundingBox(b0.minX, b0.minY, b0.minZ, b0.maxX, b0.maxY, b0.maxZ);
    for (const p of pieces) bounds.encapsulate(p.box);
    st = { ...s, pieces, bounds };
    if (this.starts.size > 64) this.starts.clear();
    this.starts.set(key, st);
    return st;
  }

  /** the cities whose start chunk is within 8 of the chunk */
  startsNear(cx: number, cz: number): EndCityStart[] {
    const out: EndCityStart[] = [];
    for (let rx = floorDiv(cx - REACH, SPACING); rx <= floorDiv(cx + REACH, SPACING); rx++)
      for (let rz = floorDiv(cz - REACH, SPACING); rz <= floorDiv(cz + REACH, SPACING); rz++) {
        const s = this.stub(rx, rz);
        if (!s || Math.abs(s.cx - cx) > REACH || Math.abs(s.cz - cz) > REACH) continue;
        const st = this.start(rx, rz);
        if (st) out.push(st);
      }
    return out;
  }

  /** vanilla StructureStart.placeInChunk for every city reaching this chunk */
  place(ctx: GenContext): void {
    const chunk = new BoundingBox(ctx.x0, MIN_PLACE_Y, ctx.z0, ctx.x0 + 15, MAX_PLACE_Y, ctx.z0 + 15);
    let r: Rand | null = null;
    for (const s of this.startsNear(ctx.cx, ctx.cz)) {
      if (!s.bounds.intersects(chunk)) continue;
      // (one random per structure for the chunk, as vanilla's setFeatureSeed)
      r ??= new Rand(hash2(ctx.cx, ctx.cz, this.seedHash ^ SALT), 0x7e);
      for (const p of s.pieces) if (p.box.intersects(chunk)) p.place(ctx, chunk, r);
    }
  }

  /** vanilla StructureManager.getStructureWithPieceAt: the piece of a city (reaching this chunk) a block is in */
  pieceAt(x: number, y: number, z: number): EndCityPiece | null {
    for (const s of this.startsNear(x >> 4, z >> 4)) {
      if (!s.bounds.isInside(x, y, z)) continue;
      for (const p of s.pieces) if (p.box.isInside(x, y, z)) return p;
    }
    return null;
  }

  /**
   * vanilla ChunkGenerator.getNearestGeneratedStructure for /locate: rings of regions outwards from the one the
   * position is in, and the first city met going round a ring; the start chunk's corner is what's reported
   */
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
