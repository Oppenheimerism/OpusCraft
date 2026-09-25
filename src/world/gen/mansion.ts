// Woodland mansions (vanilla structure set minecraft:woodland_mansions, structure minecraft:mansion,
// WoodlandMansionStructure and WoodlandMansionPieces). Where they go: one chance per 80×80-chunk region, spread
// triangularly (20 chunks clear of the region's far edges), where the biome at the start (the chunk's block 7, 7)
// is a dark forest, and only if the lowest of the ground heights at the corners of a 5×5 square from there (turned
// with the mansion) is y 60 or more. What they are: an 11×11 grid of 8-block cells grown from the entrance at
// random — corridors that wind west, the rooms that line them grouped into 1×1, 1×2 and 2×2 rooms (a few of them
// sealed secret rooms), two storeys, and on some a smaller third storey reached by a staircase room — walled,
// windowed and roofed in dark oak on a cobblestone foundation that reaches down to the ground. The pieces are
// vanilla's (walls, corners, roofs, corridor floors and carpets, inner walls and doorways, the rooms); the
// templates they're built from are made here (world/gen/mansionTemplates.ts and mansionRooms.ts), with the
// data markers vanilla's have: loot chests (chests/woodland_mansion), evokers and vindicators, and the allays'
// cells, which stand empty (the game has no allays).
//
// Each mansion is laid out once from its start chunk's large-feature random, then placed chunk by chunk in the
// SURFACE_STRUCTURES step. The chunk workers and the main thread (/locate) work them out alike.

import { Rand, JavaRandom, hash2 } from '../../core/rng';
import { B } from './biomes';
import { S, blockOf, FLAGS, F_AIR, F_WATER, F_LAVA } from '../block';
import { MIN_Y, MAX_Y } from '../constants';
import { W_AIR, type GenContext } from './context';
import { BoundingBox } from './structure';
import { largeFeatureRandom, saltedRandom, shuffle, rotateState } from './jigsaw';
import type { MansionTemplate } from './mansionBuilder';
import { mansionTemplate } from './mansionTemplates';

// vanilla RandomSpreadStructurePlacement for woodland_mansions (triangular spread)
const SPACING = 80, SEPARATION = 20, SALT = 10387319;
/** vanilla WoodlandMansionStructure.findGenerationPoint: no mansion whose ground is lower than this */
const MIN_HEIGHT = 60;
/** vanilla #has_structure/woodland_mansion */
const MANSION_BIOMES = new Set<number>([B.dark_forest]);
/** how many chunks a mansion's pieces reach from its start chunk (at most 67 blocks from the start, either way) */
const REACH = 5;

// ---------------------------------------------------------------------------------------------------------------
// Directions, rotations and mirrors

export type D4 = 'north' | 'east' | 'south' | 'west';
/** vanilla Direction.Plane.HORIZONTAL (and the clockwise order) */
const HORIZONTAL: D4[] = ['north', 'east', 'south', 'west'];
/** vanilla Direction.from2DDataValue */
const BY_2D: D4[] = ['south', 'west', 'north', 'east'];
const STEP: Record<D4, [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const cw = (d: D4): D4 => HORIZONTAL[(HORIZONTAL.indexOf(d) + 1) & 3];
const ccw = (d: D4): D4 => HORIZONTAL[(HORIZONTAL.indexOf(d) + 3) & 3];
const opposite = (d: D4): D4 => HORIZONTAL[(HORIZONTAL.indexOf(d) + 2) & 3];

/** vanilla Rotation by ordinal: NONE, CLOCKWISE_90, CLOCKWISE_180, COUNTERCLOCKWISE_90 (clockwise quarter turns) */
export type Rot = 0 | 1 | 2 | 3;
const CLOCKWISE_90: Rot = 1, CLOCKWISE_180: Rot = 2, COUNTERCLOCKWISE_90: Rot = 3;
/** vanilla Rotation.rotate(Direction) */
const turn = (r: Rot, d: D4): D4 => HORIZONTAL[(HORIZONTAL.indexOf(d) + r) & 3];
/** vanilla Rotation.getRotated */
const rotated = (a: Rot, b: Rot): Rot => ((a + b) & 3) as Rot;

/** vanilla Mirror: NONE, LEFT_RIGHT (z flipped), FRONT_BACK (x flipped) */
export type Mirror = 0 | 1 | 2;
export const NO_MIRROR: Mirror = 0, LEFT_RIGHT: Mirror = 1, FRONT_BACK: Mirror = 2;

type P3 = [number, number, number];
/** vanilla BlockPos.relative(direction, n) */
const rel = (p: P3, d: D4, n: number): P3 => [p[0] + STEP[d][0] * n, p[1], p[2] + STEP[d][1] * n];
const above = (p: P3, n: number): P3 => [p[0], p[1] + n, p[2]];

/** vanilla StructureTemplate.transform about the origin: mirror, then a quarter turn at a time */
export function transformXZ(x: number, z: number, rot: Rot, mirror: Mirror): [number, number] {
  if (mirror === LEFT_RIGHT) z = -z;
  else if (mirror === FRONT_BACK) x = -x;
  switch (rot) {
    case CLOCKWISE_90: return [-z, x];
    case CLOCKWISE_180: return [-x, -z];
    case COUNTERCLOCKWISE_90: return [z, -x];
    default: return [x, z];
  }
}

/** vanilla StructureTemplate.getZeroPositionWithTransform: where a sx × sz template's corner goes for it to fill the same place turned */
function zeroPositionWithTransform(p: P3, mirror: Mirror, rot: Rot, sx: number, sz: number): P3 {
  const i = sx - 1, j = sz - 1;
  const k = mirror === FRONT_BACK ? i : 0, l = mirror === LEFT_RIGHT ? j : 0;
  switch (rot) {
    case COUNTERCLOCKWISE_90: return [p[0] + l, p[1], p[2] + i - k];
    case CLOCKWISE_90: return [p[0] + j - l, p[1], p[2] + k];
    case CLOCKWISE_180: return [p[0] + i - k, p[1], p[2] + j - l];
    default: return [p[0] + k, p[1], p[2] + l];
  }
}

/** vanilla BlockPos.rotate */
function rotatePos(p: P3, r: Rot): P3 {
  switch (r) {
    case CLOCKWISE_90: return [-p[2], p[1], p[0]];
    case CLOCKWISE_180: return [-p[0], p[1], -p[2]];
    case COUNTERCLOCKWISE_90: return [p[2], p[1], -p[0]];
    default: return p;
  }
}

// vanilla BlockState.mirror for the properties the templates use: facings (and a stair's corner, a door's hinge),
// 16-way rotations and side connections
const MIRRORED_FACING: Record<number, Record<string, string>> = { [LEFT_RIGHT]: { north: 'south', south: 'north' }, [FRONT_BACK]: { east: 'west', west: 'east' } };
const HANDED: Record<string, string> = { inner_left: 'inner_right', inner_right: 'inner_left', outer_left: 'outer_right', outer_right: 'outer_left' };
const mirroredCache: Map<number, number>[] = [new Map(), new Map(), new Map()];

export function mirrorState(st: number, mirror: Mirror): number {
  if (!mirror || st <= 0) return st;
  const cache = mirroredCache[mirror];
  const c = cache.get(st);
  if (c !== undefined) return c;
  const b = blockOf(st);
  let out = st;
  if (b.propIndex('facing') >= 0) {
    const f = b.get<string>(st, 'facing');
    const m = MIRRORED_FACING[mirror][f];
    if (m) out = b.with(out, 'facing', m);
  }
  if (b.propIndex('shape') >= 0 && b.name.endsWith('_stairs')) out = b.with(out, 'shape', HANDED[b.get<string>(st, 'shape')] ?? 'straight');
  if (b.propIndex('hinge') >= 0) out = b.with(out, 'hinge', b.get(st, 'hinge') === 'left' ? 'right' : 'left');
  if (b.propIndex('rotation') >= 0) {
    const r = b.get<number>(st, 'rotation'), l = r > 8 ? r - 16 : r;
    out = b.with(out, 'rotation', mirror === LEFT_RIGHT ? (((8 - l) % 16) + 16) % 16 : (((16 - l) % 16) + 16) % 16);
  }
  const [s1, s2] = mirror === LEFT_RIGHT ? ['north', 'south'] : ['east', 'west'];
  if (b.propIndex(s1) >= 0 && b.propIndex(s2) >= 0) out = b.with(b.with(out, s1, b.get(st, s2)), s2, b.get(st, s1));
  cache.set(st, out);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The grid (vanilla WoodlandMansionPieces.MansionGrid and SimpleGrid)

const CLEAR = 0, CORRIDOR = 1, ROOM = 2, START_ROOM = 3, BLOCKED = 5;
const ROOM_1x1 = 65536, ROOM_1x2 = 131072, ROOM_2x2 = 262144;
const ROOM_ORIGIN_FLAG = 1048576, ROOM_DOOR_FLAG = 2097152, ROOM_STAIRS_FLAG = 4194304, ROOM_CORRIDOR_FLAG = 8388608;
const ROOM_TYPE_MASK = 983040, ROOM_ID_MASK = 65535;

/** vanilla SimpleGrid: width × height cells, a value for anything outside */
export class SimpleGrid {
  private readonly grid: Int32Array;
  constructor(readonly width: number, readonly height: number, private readonly valueIfOutside: number) {
    this.grid = new Int32Array(width * height);
  }
  set(x: number, y: number, v: number): void {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) this.grid[x * this.height + y] = v;
  }
  setRect(x0: number, y0: number, x1: number, y1: number, v: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, v);
  }
  get(x: number, y: number): number {
    return x >= 0 && x < this.width && y >= 0 && y < this.height ? this.grid[x * this.height + y] : this.valueIfOutside;
  }
  setif(x: number, y: number, ifValue: number, v: number): void {
    if (this.get(x, y) === ifValue) this.set(x, y, v);
  }
  edgesTo(x: number, y: number, v: number): boolean {
    return this.get(x - 1, y) === v || this.get(x + 1, y) === v || this.get(x, y + 1) === v || this.get(x, y - 1) === v;
  }
}

/** vanilla MansionGrid.isHouse: corridor, room, the entrance, or a test room */
export function isHouse(g: SimpleGrid, x: number, y: number): boolean {
  const k = g.get(x, y);
  return k === 1 || k === 2 || k === 3 || k === 4;
}

/** vanilla MansionGrid */
export class MansionGrid {
  readonly baseGrid: SimpleGrid;
  readonly thirdFloorGrid: SimpleGrid;
  readonly floorRooms: SimpleGrid[];
  readonly entranceX = 7;
  readonly entranceY = 4;

  constructor(private readonly random: JavaRandom) {
    const ex = this.entranceX, ey = this.entranceY;
    const g = (this.baseGrid = new SimpleGrid(11, 11, BLOCKED));
    g.setRect(ex, ey, ex + 1, ey + 1, START_ROOM);
    g.setRect(ex - 1, ey, ex - 1, ey + 1, ROOM);
    g.setRect(ex + 2, ey - 2, ex + 3, ey + 3, BLOCKED);
    g.setRect(ex + 1, ey - 2, ex + 1, ey - 1, CORRIDOR);
    g.setRect(ex + 1, ey + 2, ex + 1, ey + 3, CORRIDOR);
    g.set(ex - 1, ey - 1, CORRIDOR);
    g.set(ex - 1, ey + 2, CORRIDOR);
    g.setRect(0, 0, 11, 1, BLOCKED);
    g.setRect(0, 9, 11, 11, BLOCKED);
    this.recursiveCorridor(g, ex, ey - 2, 'west', 6);
    this.recursiveCorridor(g, ex, ey + 3, 'west', 6);
    this.recursiveCorridor(g, ex - 2, ey - 1, 'west', 3);
    this.recursiveCorridor(g, ex - 2, ey + 2, 'west', 3);
    while (this.cleanEdges(g));
    this.floorRooms = [new SimpleGrid(11, 11, BLOCKED), new SimpleGrid(11, 11, BLOCKED), new SimpleGrid(11, 11, BLOCKED)];
    this.identifyRooms(g, this.floorRooms[0]);
    this.identifyRooms(g, this.floorRooms[1]);
    this.floorRooms[0].setRect(ex + 1, ey, ex + 1, ey + 1, ROOM_CORRIDOR_FLAG);
    this.floorRooms[1].setRect(ex + 1, ey, ex + 1, ey + 1, ROOM_CORRIDOR_FLAG);
    this.thirdFloorGrid = new SimpleGrid(g.width, g.height, BLOCKED);
    this.setupThirdFloor();
    this.identifyRooms(this.thirdFloorGrid, this.floorRooms[2]);
  }

  isRoomId(x: number, y: number, floor: number, id: number): boolean {
    return (this.floorRooms[floor].get(x, y) & ROOM_ID_MASK) === id;
  }

  /** vanilla get1x2RoomDirection: which way the other half of a 1×2 room lies */
  get1x2RoomDirection(x: number, y: number, floor: number, id: number): D4 | null {
    for (const d of HORIZONTAL) if (this.isRoomId(x + STEP[d][0], y + STEP[d][1], floor, id)) return d;
    return null;
  }

  /** vanilla recursiveCorridor: a corridor from (x, y) going `d`, turning at random, rooms marked out along it */
  private recursiveCorridor(g: SimpleGrid, x: number, y: number, d: D4, depth: number): void {
    if (depth <= 0) return;
    const [dx, dy] = STEP[d];
    g.set(x, y, CORRIDOR);
    g.setif(x + dx, y + dy, CLEAR, CORRIDOR);
    for (let l = 0; l < 8; l++) {
      const d2 = BY_2D[this.random.nextInt(4)];
      if (d2 !== opposite(d) && (d2 !== 'east' || !this.random.nextBoolean())) {
        const m = x + dx, n = y + dy;
        const [ex, ey] = STEP[d2];
        if (g.get(m + ex, n + ey) === CLEAR && g.get(m + ex * 2, n + ey * 2) === CLEAR) {
          this.recursiveCorridor(g, x + dx + ex, y + dy + ey, d2, depth - 1);
          break;
        }
      }
    }
    const [ax, ay] = STEP[cw(d)], [bx, by] = STEP[ccw(d)];
    g.setif(x + ax, y + ay, CLEAR, ROOM);
    g.setif(x + bx, y + by, CLEAR, ROOM);
    g.setif(x + dx + ax, y + dy + ay, CLEAR, ROOM);
    g.setif(x + dx + bx, y + dy + by, CLEAR, ROOM);
    g.setif(x + dx * 2, y + dy * 2, CLEAR, ROOM);
    g.setif(x + ax * 2, y + ay * 2, CLEAR, ROOM);
    g.setif(x + bx * 2, y + by * 2, CLEAR, ROOM);
  }

  /** vanilla cleanEdges: a free cell with three houses beside it, or two and at most one diagonally, becomes a room */
  private cleanEdges(g: SimpleGrid): boolean {
    let changed = false;
    const h = (x: number, y: number) => (isHouse(g, x, y) ? 1 : 0);
    for (let i = 0; i < g.height; i++)
      for (let j = 0; j < g.width; j++) {
        if (g.get(j, i) !== CLEAR) continue;
        const k = h(j + 1, i) + h(j - 1, i) + h(j, i + 1) + h(j, i - 1);
        if (k >= 3) {
          g.set(j, i, ROOM);
          changed = true;
        } else if (k === 2) {
          const l = h(j + 1, i + 1) + h(j - 1, i + 1) + h(j + 1, i - 1) + h(j - 1, i - 1);
          if (l <= 1) {
            g.set(j, i, ROOM);
            changed = true;
          }
        }
      }
    return changed;
  }

  /**
   * vanilla setupThirdFloor: over one of the second storey's 1×2 rooms with a door (it becomes the staircase), a
   * third storey with a corridor of its own, or none when there's no such room or no way out of the landing
   */
  private setupThirdFloor(): void {
    const list: [number, number][] = [];
    const g2 = this.floorRooms[1], g3 = this.thirdFloorGrid;
    for (let i = 0; i < g3.height; i++)
      for (let j = 0; j < g3.width; j++) {
        const k = g2.get(j, i);
        if ((k & ROOM_TYPE_MASK) === ROOM_1x2 && (k & ROOM_DOOR_FLAG) === ROOM_DOOR_FLAG) list.push([j, i]);
      }
    if (!list.length) {
      g3.setRect(0, 0, g3.width, g3.height, BLOCKED);
      return;
    }
    const [tx, ty] = list[this.random.nextInt(list.length)];
    const k = g2.get(tx, ty);
    g2.set(tx, ty, k | ROOM_STAIRS_FLAG);
    const d = this.get1x2RoomDirection(tx, ty, 1, k & ROOM_ID_MASK)!;
    const l = tx + STEP[d][0], m = ty + STEP[d][1];
    for (let n = 0; n < g3.height; n++)
      for (let o = 0; o < g3.width; o++) {
        if (!isHouse(this.baseGrid, o, n)) g3.set(o, n, BLOCKED);
        else if (o === tx && n === ty) g3.set(o, n, START_ROOM);
        else if (o === l && n === m) {
          g3.set(o, n, START_ROOM);
          this.floorRooms[2].set(o, n, ROOM_CORRIDOR_FLAG);
        }
      }
    const ways: D4[] = [];
    for (const d2 of HORIZONTAL) if (g3.get(l + STEP[d2][0], m + STEP[d2][1]) === CLEAR) ways.push(d2);
    if (!ways.length) {
      g3.setRect(0, 0, g3.width, g3.height, BLOCKED);
      g2.set(tx, ty, k);
      return;
    }
    const d3 = ways[this.random.nextInt(ways.length)];
    this.recursiveCorridor(g3, l + STEP[d3][0], m + STEP[d3][1], d3, 4);
    while (this.cleanEdges(g3));
  }

  /**
   * vanilla identifyRooms: the room cells in a random order, each still free grouped with its neighbours into a
   * 2×2, else a 1×2, else left a 1×1; one cell of each room, beside a corridor if it can be, is its origin and door
   * (a room with none beside a corridor is a secret room)
   */
  private identifyRooms(g: SimpleGrid, rooms: SimpleGrid): void {
    const list: [number, number][] = [];
    for (let i = 0; i < g.height; i++) for (let j = 0; j < g.width; j++) if (g.get(j, i) === ROOM) list.push([j, i]);
    shuffle(list, this.random);
    let id = 10;
    for (const [k, l] of list) {
      if (rooms.get(k, l) !== 0) continue;
      let m = k, n = k, o = l, p = l, q = ROOM_1x1;
      if (rooms.get(k + 1, l) === 0 && rooms.get(k, l + 1) === 0 && rooms.get(k + 1, l + 1) === 0 && g.get(k + 1, l) === ROOM && g.get(k, l + 1) === ROOM && g.get(k + 1, l + 1) === ROOM) {
        n = k + 1;
        p = l + 1;
        q = ROOM_2x2;
      } else if (rooms.get(k - 1, l) === 0 && rooms.get(k, l + 1) === 0 && rooms.get(k - 1, l + 1) === 0 && g.get(k - 1, l) === ROOM && g.get(k, l + 1) === ROOM && g.get(k - 1, l + 1) === ROOM) {
        m = k - 1;
        p = l + 1;
        q = ROOM_2x2;
      } else if (rooms.get(k - 1, l) === 0 && rooms.get(k, l - 1) === 0 && rooms.get(k - 1, l - 1) === 0 && g.get(k - 1, l) === ROOM && g.get(k, l - 1) === ROOM && g.get(k - 1, l - 1) === ROOM) {
        m = k - 1;
        o = l - 1;
        q = ROOM_2x2;
      } else if (rooms.get(k + 1, l) === 0 && g.get(k + 1, l) === ROOM) {
        n = k + 1;
        q = ROOM_1x2;
      } else if (rooms.get(k, l + 1) === 0 && g.get(k, l + 1) === ROOM) {
        p = l + 1;
        q = ROOM_1x2;
      } else if (rooms.get(k - 1, l) === 0 && g.get(k - 1, l) === ROOM) {
        m = k - 1;
        q = ROOM_1x2;
      } else if (rooms.get(k, l - 1) === 0 && g.get(k, l - 1) === ROOM) {
        o = l - 1;
        q = ROOM_1x2;
      }
      let r = this.random.nextBoolean() ? m : n;
      let s = this.random.nextBoolean() ? o : p;
      let t = ROOM_DOOR_FLAG;
      if (!g.edgesTo(r, s, CORRIDOR)) {
        r = r === m ? n : m;
        s = s === o ? p : o;
        if (!g.edgesTo(r, s, CORRIDOR)) {
          s = s === o ? p : o;
          if (!g.edgesTo(r, s, CORRIDOR)) {
            r = r === m ? n : m;
            s = s === o ? p : o;
            if (!g.edgesTo(r, s, CORRIDOR)) {
              t = 0;
              r = m;
              s = o;
            }
          }
        }
      }
      for (let u = o; u <= p; u++)
        for (let v = m; v <= n; v++) {
          if (v === r && u === s) rooms.set(v, u, ROOM_ORIGIN_FLAG | t | q | id);
          else rooms.set(v, u, q | id);
        }
      id++;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Laying the pieces out (vanilla MansionPiecePlacer)

/** a piece: a template by name, where its corner goes, and how it's turned and mirrored (vanilla WoodlandMansionPiece) */
export interface PiecePlacement {
  name: string;
  x: number;
  y: number;
  z: number;
  rot: Rot;
  mirror: Mirror;
}

/** vanilla FloorRoomCollection: the room templates of a storey */
interface FloorRooms {
  get1x1(r: JavaRandom): string;
  get1x1Secret(r: JavaRandom): string;
  get1x2SideEntrance(r: JavaRandom, stairs: boolean): string;
  get1x2FrontEntrance(r: JavaRandom, stairs: boolean): string;
  get1x2Secret(r: JavaRandom): string;
  get2x2(r: JavaRandom): string;
  get2x2Secret(r: JavaRandom): string;
}
const FIRST_FLOOR: FloorRooms = {
  get1x1: (r) => '1x1_a' + (r.nextInt(5) + 1),
  get1x1Secret: (r) => '1x1_as' + (r.nextInt(4) + 1),
  get1x2SideEntrance: (r) => '1x2_a' + (r.nextInt(9) + 1),
  get1x2FrontEntrance: (r) => '1x2_b' + (r.nextInt(5) + 1),
  get1x2Secret: (r) => '1x2_s' + (r.nextInt(2) + 1),
  get2x2: (r) => '2x2_a' + (r.nextInt(4) + 1),
  get2x2Secret: () => '2x2_s1',
};
/** (vanilla ThirdFloorRoomCollection is the second floor's) */
const UPPER_FLOOR: FloorRooms = {
  get1x1: (r) => '1x1_b' + (r.nextInt(4) + 1),
  get1x1Secret: (r) => '1x1_as' + (r.nextInt(4) + 1),
  get1x2SideEntrance: (r, stairs) => (stairs ? '1x2_c_stairs' : '1x2_c' + (r.nextInt(4) + 1)),
  get1x2FrontEntrance: (r, stairs) => (stairs ? '1x2_d_stairs' : '1x2_d' + (r.nextInt(5) + 1)),
  get1x2Secret: (r) => '1x2_se' + (r.nextInt(1) + 1),
  get2x2: (r) => '2x2_b' + (r.nextInt(5) + 1),
  get2x2Secret: () => '2x2_s1',
};
const FLOOR_ROOMS = [FIRST_FLOOR, UPPER_FLOOR, UPPER_FLOOR];

/** vanilla PlacementData: where the walk round the outside has got to */
interface Walk {
  pos: P3;
  rot: Rot;
  wallType: string;
}

/** vanilla MansionPiecePlacer */
class MansionPiecePlacer {
  private startX = 0;
  private startY = 0;
  constructor(private readonly random: JavaRandom) {}

  private add(list: PiecePlacement[], name: string, p: P3, rot: Rot, mirror: Mirror = NO_MIRROR): void {
    list.push({ name, x: p[0], y: p[1], z: p[2], rot, mirror });
  }

  /** a cell's corner on the storey at `base` (vanilla's 8 + (y - startY) * 8 south, (x - startX) * 8 east) */
  private cell(base: P3, rot: Rot, x: number, y: number, east = 0): P3 {
    return rel(rel(base, turn(rot, 'south'), 8 + (y - this.startY) * 8), turn(rot, 'east'), east + (x - this.startX) * 8);
  }

  /** vanilla createMansion */
  createMansion(origin: P3, rotation: Rot, list: PiecePlacement[], grid: MansionGrid): void {
    const w1: Walk = { pos: origin, rot: rotation, wallType: 'wall_flat' };
    this.entrance(list, w1);
    const w2: Walk = { pos: above(w1.pos, 8), rot: w1.rot, wallType: 'wall_window' };
    const base = grid.baseGrid, third = grid.thirdFloorGrid;
    this.startX = grid.entranceX + 1;
    this.startY = grid.entranceY + 1;
    const i = grid.entranceX + 1, j = grid.entranceY;
    this.traverseOuterWalls(list, w1, base, 'south', this.startX, this.startY, i, j);
    this.traverseOuterWalls(list, w2, base, 'south', this.startX, this.startY, i, j);
    const w3: Walk = { pos: above(w1.pos, 19), rot: w1.rot, wallType: 'wall_window' };
    let found = false;
    for (let k = 0; k < third.height && !found; k++)
      for (let l = third.width - 1; l >= 0 && !found; l--) {
        if (!isHouse(third, l, k)) continue;
        w3.pos = rel(w3.pos, turn(rotation, 'south'), 8 + (k - this.startY) * 8);
        w3.pos = rel(w3.pos, turn(rotation, 'east'), (l - this.startX) * 8);
        this.traverseWallPiece(list, w3);
        this.traverseOuterWalls(list, w3, third, 'south', l, k, l, k);
        found = true;
      }
    this.createRoof(list, above(origin, 16), rotation, base, third);
    this.createRoof(list, above(origin, 27), rotation, third, null);

    for (let k = 0; k < 3; k++) {
      const floorBase = above(origin, k * 8 + (k === 2 ? 3 : 0));
      const rooms = grid.floorRooms[k];
      const g = k === 2 ? third : base;
      const carpetSouth = k === 0 ? 'carpet_south_1' : 'carpet_south_2';
      const carpetWest = k === 0 ? 'carpet_west_1' : 'carpet_west_2';
      for (let m = 0; m < g.height; m++)
        for (let n = 0; n < g.width; n++) {
          if (g.get(n, m) !== CORRIDOR) continue;
          const p = this.cell(floorBase, rotation, n, m);
          this.add(list, 'corridor_floor', p, rotation);
          const joins = (x: number, y: number) => g.get(x, y) === CORRIDOR || (rooms.get(x, y) & ROOM_CORRIDOR_FLAG) === ROOM_CORRIDOR_FLAG;
          if (joins(n, m - 1)) this.add(list, 'carpet_north', above(rel(p, turn(rotation, 'east'), 1), 1), rotation);
          if (joins(n + 1, m)) this.add(list, 'carpet_east', above(rel(rel(p, turn(rotation, 'south'), 1), turn(rotation, 'east'), 5), 1), rotation);
          if (joins(n, m + 1)) this.add(list, carpetSouth, rel(rel(p, turn(rotation, 'south'), 5), turn(rotation, 'west'), 1), rotation);
          if (joins(n - 1, m)) this.add(list, carpetWest, rel(rel(p, turn(rotation, 'west'), 1), turn(rotation, 'north'), 1), rotation);
        }
      const wall = k === 0 ? 'indoors_wall_1' : 'indoors_wall_2';
      const door = k === 0 ? 'indoors_door_1' : 'indoors_door_2';
      const doors: D4[] = [];
      for (let o = 0; o < g.height; o++)
        for (let p = 0; p < g.width; p++) {
          const stairTop = k === 2 && g.get(p, o) === START_ROOM;
          if (g.get(p, o) !== ROOM && !stairTop) continue;
          const q = rooms.get(p, o);
          const r = q & ROOM_TYPE_MASK, s = q & ROOM_ID_MASK;
          const landing = stairTop && (q & ROOM_CORRIDOR_FLAG) === ROOM_CORRIDOR_FLAG;
          doors.length = 0;
          if ((q & ROOM_DOOR_FLAG) === ROOM_DOOR_FLAG) for (const d of HORIZONTAL) if (g.get(p + STEP[d][0], o + STEP[d][1]) === CORRIDOR) doors.push(d);
          let doorDir: D4 | 'up' | null = null;
          if (doors.length) doorDir = doors[this.random.nextInt(doors.length)];
          else if ((q & ROOM_ORIGIN_FLAG) === ROOM_ORIGIN_FLAG) doorDir = 'up';
          const at = this.cell(floorBase, rotation, p, o, -1);
          if (isHouse(g, p - 1, o) && !grid.isRoomId(p - 1, o, k, s)) this.add(list, doorDir === 'west' ? door : wall, at, rotation);
          if (g.get(p + 1, o) === CORRIDOR && !landing) this.add(list, doorDir === 'east' ? door : wall, rel(at, turn(rotation, 'east'), 8), rotation);
          if (isHouse(g, p, o + 1) && !grid.isRoomId(p, o + 1, k, s))
            this.add(list, doorDir === 'south' ? door : wall, rel(rel(at, turn(rotation, 'south'), 7), turn(rotation, 'east'), 7), rotated(rotation, CLOCKWISE_90));
          if (g.get(p, o - 1) === CORRIDOR && !landing)
            this.add(list, doorDir === 'north' ? door : wall, rel(rel(at, turn(rotation, 'north'), 1), turn(rotation, 'east'), 7), rotated(rotation, CLOCKWISE_90));
          if (r === ROOM_1x1) this.addRoom1x1(list, at, rotation, doorDir, FLOOR_ROOMS[k]);
          else if (r === ROOM_1x2 && doorDir !== null) {
            const partner = grid.get1x2RoomDirection(p, o, k, s)!;
            this.addRoom1x2(list, at, rotation, partner, doorDir, FLOOR_ROOMS[k], (q & ROOM_STAIRS_FLAG) === ROOM_STAIRS_FLAG);
          } else if (r === ROOM_2x2 && doorDir !== null && doorDir !== 'up') {
            let side = cw(doorDir);
            if (!grid.isRoomId(p + STEP[side][0], o + STEP[side][1], k, s)) side = opposite(side);
            this.addRoom2x2(list, at, rotation, side, doorDir, FLOOR_ROOMS[k]);
          } else if (r === ROOM_2x2 && doorDir === 'up') this.addRoom2x2Secret(list, at, rotation, FLOOR_ROOMS[k]);
        }
    }
  }

  /** vanilla traverseOuterWalls: round the outside of the grid keeping the house on the right, a wall piece per cell edge */
  private traverseOuterWalls(list: PiecePlacement[], w: Walk, g: SimpleGrid, dir: D4, i: number, j: number, k: number, l: number): void {
    let m = i, n = j;
    const d0 = dir;
    do {
      const [dx, dy] = STEP[dir];
      if (!isHouse(g, m + dx, n + dy)) {
        this.traverseTurn(list, w);
        dir = cw(dir);
        if (m !== k || n !== l || d0 !== dir) this.traverseWallPiece(list, w);
      } else if (isHouse(g, m + dx + STEP[ccw(dir)][0], n + dy + STEP[ccw(dir)][1])) {
        this.traverseInnerTurn(w);
        m += dx;
        n += dy;
        dir = ccw(dir);
      } else {
        m += dx;
        n += dy;
        if (m !== k || n !== l || d0 !== dir) this.traverseWallPiece(list, w);
      }
    } while (m !== k || n !== l || d0 !== dir);
  }

  /** vanilla createRoof: a roof over every cell (not under the third storey), fronts and corners round its edge, low walls under the third storey's */
  private createRoof(list: PiecePlacement[], at: P3, rot: Rot, g: SimpleGrid, top: SimpleGrid | null): void {
    const S_ = turn(rot, 'south'), E = turn(rot, 'east'), W = turn(rot, 'west'), N = turn(rot, 'north');
    const house = (x: number, y: number) => isHouse(g, x, y);
    for (let i = 0; i < g.height; i++)
      for (let j = 0; j < g.width; j++) {
        const p = this.cell(at, rot, j, i);
        const covered = top !== null && isHouse(top, j, i);
        if (!house(j, i) || covered) continue;
        this.add(list, 'roof', above(p, 3), rot);
        if (!house(j + 1, i)) this.add(list, 'roof_front', rel(p, E, 6), rot);
        if (!house(j - 1, i)) this.add(list, 'roof_front', rel(rel(p, E, 0), S_, 7), rotated(rot, CLOCKWISE_180));
        if (!house(j, i - 1)) this.add(list, 'roof_front', rel(p, W, 1), rotated(rot, COUNTERCLOCKWISE_90));
        if (!house(j, i + 1)) this.add(list, 'roof_front', rel(rel(p, E, 6), S_, 6), rotated(rot, CLOCKWISE_90));
      }
    if (top !== null)
      for (let i = 0; i < g.height; i++)
        for (let j = 0; j < g.width; j++) {
          const p = this.cell(at, rot, j, i);
          if (!house(j, i) || !isHouse(top, j, i)) continue;
          if (!house(j + 1, i)) this.add(list, 'small_wall', rel(p, E, 7), rot);
          if (!house(j - 1, i)) this.add(list, 'small_wall', rel(rel(p, W, 1), S_, 6), rotated(rot, CLOCKWISE_180));
          if (!house(j, i - 1)) this.add(list, 'small_wall', rel(rel(p, W, 0), N, 1), rotated(rot, COUNTERCLOCKWISE_90));
          if (!house(j, i + 1)) this.add(list, 'small_wall', rel(rel(p, E, 6), S_, 7), rotated(rot, CLOCKWISE_90));
          if (!house(j + 1, i)) {
            if (!house(j, i - 1)) this.add(list, 'small_wall_corner', rel(rel(p, E, 7), N, 2), rot);
            if (!house(j, i + 1)) this.add(list, 'small_wall_corner', rel(rel(p, E, 8), S_, 7), rotated(rot, CLOCKWISE_90));
          }
          if (!house(j - 1, i)) {
            if (!house(j, i - 1)) this.add(list, 'small_wall_corner', rel(rel(p, W, 2), N, 1), rotated(rot, COUNTERCLOCKWISE_90));
            if (!house(j, i + 1)) this.add(list, 'small_wall_corner', rel(rel(p, W, 1), S_, 8), rotated(rot, CLOCKWISE_180));
          }
        }
    for (let i = 0; i < g.height; i++)
      for (let j = 0; j < g.width; j++) {
        const p = this.cell(at, rot, j, i);
        const covered = top !== null && isHouse(top, j, i);
        if (!house(j, i) || covered) continue;
        if (!house(j + 1, i)) {
          const q = rel(p, E, 6);
          if (!house(j, i + 1)) this.add(list, 'roof_corner', rel(q, S_, 6), rot);
          else if (house(j + 1, i + 1)) this.add(list, 'roof_inner_corner', rel(q, S_, 5), rot);
          if (!house(j, i - 1)) this.add(list, 'roof_corner', q, rotated(rot, COUNTERCLOCKWISE_90));
          else if (house(j + 1, i - 1)) this.add(list, 'roof_inner_corner', rel(rel(p, E, 9), N, 2), rotated(rot, CLOCKWISE_90));
        }
        if (!house(j - 1, i)) {
          const q = rel(rel(p, E, 0), S_, 0);
          if (!house(j, i + 1)) this.add(list, 'roof_corner', rel(q, S_, 6), rotated(rot, CLOCKWISE_90));
          else if (house(j - 1, i + 1)) this.add(list, 'roof_inner_corner', rel(rel(q, S_, 8), W, 3), rotated(rot, COUNTERCLOCKWISE_90));
          if (!house(j, i - 1)) this.add(list, 'roof_corner', q, rotated(rot, CLOCKWISE_180));
          else if (house(j - 1, i - 1)) this.add(list, 'roof_inner_corner', rel(q, S_, 1), rotated(rot, CLOCKWISE_180));
        }
      }
  }

  /** vanilla entrance: the entrance hall's piece, then on to the first cell south of it */
  private entrance(list: PiecePlacement[], w: Walk): void {
    this.add(list, 'entrance', rel(w.pos, turn(w.rot, 'west'), 9), w.rot);
    w.pos = rel(w.pos, turn(w.rot, 'south'), 16);
  }

  /** vanilla traverseWallPiece */
  private traverseWallPiece(list: PiecePlacement[], w: Walk): void {
    this.add(list, w.wallType, rel(w.pos, turn(w.rot, 'east'), 7), w.rot);
    w.pos = rel(w.pos, turn(w.rot, 'south'), 8);
  }

  /** vanilla traverseTurn: an outside corner, then a quarter turn clockwise */
  private traverseTurn(list: PiecePlacement[], w: Walk): void {
    w.pos = rel(w.pos, turn(w.rot, 'south'), -1);
    this.add(list, 'wall_corner', w.pos, w.rot);
    w.pos = rel(w.pos, turn(w.rot, 'south'), -7);
    w.pos = rel(w.pos, turn(w.rot, 'west'), -6);
    w.rot = rotated(w.rot, CLOCKWISE_90);
  }

  /** vanilla traverseInnerTurn: an inside corner, a quarter turn anticlockwise */
  private traverseInnerTurn(w: Walk): void {
    w.pos = rel(w.pos, turn(w.rot, 'south'), 6);
    w.pos = rel(w.pos, turn(w.rot, 'east'), 8);
    w.rot = rotated(w.rot, COUNTERCLOCKWISE_90);
  }

  /** vanilla addRoom1x1: turned to face its door (a secret one when it has none) */
  private addRoom1x1(list: PiecePlacement[], at: P3, rot: Rot, door: D4 | 'up' | null, rooms: FloorRooms): void {
    let r: Rot = 0;
    let name = rooms.get1x1(this.random);
    if (door !== 'east') {
      if (door === 'north') r = rotated(r, COUNTERCLOCKWISE_90);
      else if (door === 'west') r = rotated(r, CLOCKWISE_180);
      else if (door === 'south') r = rotated(r, CLOCKWISE_90);
      else name = rooms.get1x1Secret(this.random);
    }
    let q = zeroPositionWithTransform([1, 0, 0], NO_MIRROR, r, 7, 7);
    r = rotated(r, rot);
    q = rotatePos(q, rot);
    this.add(list, name, [at[0] + q[0], at[1], at[2] + q[2]], r);
  }

  /** vanilla addRoom1x2: `partner` is where its other half lies, `door` which way its door opens */
  private addRoom1x2(list: PiecePlacement[], at: P3, rot: Rot, partner: D4, door: D4 | 'up', rooms: FloorRooms, stairs: boolean): void {
    const E = turn(rot, 'east'), S_ = turn(rot, 'south'), W = turn(rot, 'west'), N = turn(rot, 'north');
    const side = () => rooms.get1x2SideEntrance(this.random, stairs);
    const front = () => rooms.get1x2FrontEntrance(this.random, stairs);
    if (door === 'east' && partner === 'south') this.add(list, side(), rel(at, E, 1), rot);
    else if (door === 'east' && partner === 'north') this.add(list, side(), rel(rel(at, E, 1), S_, 6), rot, LEFT_RIGHT);
    else if (door === 'west' && partner === 'north') this.add(list, side(), rel(rel(at, E, 7), S_, 6), rotated(rot, CLOCKWISE_180));
    else if (door === 'west' && partner === 'south') this.add(list, side(), rel(at, E, 7), rot, FRONT_BACK);
    else if (door === 'south' && partner === 'east') this.add(list, side(), rel(at, E, 1), rotated(rot, CLOCKWISE_90), LEFT_RIGHT);
    else if (door === 'south' && partner === 'west') this.add(list, side(), rel(at, E, 7), rotated(rot, CLOCKWISE_90));
    else if (door === 'north' && partner === 'west') this.add(list, side(), rel(rel(at, E, 7), S_, 6), rotated(rot, CLOCKWISE_90), FRONT_BACK);
    else if (door === 'north' && partner === 'east') this.add(list, side(), rel(rel(at, E, 1), S_, 6), rotated(rot, COUNTERCLOCKWISE_90));
    else if (door === 'south' && partner === 'north') this.add(list, front(), rel(rel(at, E, 1), N, 8), rot);
    else if (door === 'north' && partner === 'south') this.add(list, front(), rel(rel(at, E, 7), S_, 14), rotated(rot, CLOCKWISE_180));
    else if (door === 'west' && partner === 'east') this.add(list, front(), rel(at, E, 15), rotated(rot, CLOCKWISE_90));
    else if (door === 'east' && partner === 'west') this.add(list, front(), rel(rel(at, W, 7), S_, 6), rotated(rot, COUNTERCLOCKWISE_90));
    else if (door === 'up' && partner === 'east') this.add(list, rooms.get1x2Secret(this.random), rel(at, E, 15), rotated(rot, CLOCKWISE_90));
    else if (door === 'up' && partner === 'south') this.add(list, rooms.get1x2Secret(this.random), rel(rel(at, E, 1), N, 0), rot);
  }

  /** vanilla addRoom2x2: `side` is which way it reaches beside its door */
  private addRoom2x2(list: PiecePlacement[], at: P3, rot: Rot, side: D4, door: D4, rooms: FloorRooms): void {
    let i = 0, j = 0, r = rot, mirror = NO_MIRROR;
    if (door === 'east' && side === 'south') i = -7;
    else if (door === 'east' && side === 'north') {
      i = -7;
      j = 6;
      mirror = LEFT_RIGHT;
    } else if (door === 'north' && side === 'east') {
      i = 1;
      j = 14;
      r = rotated(rot, COUNTERCLOCKWISE_90);
    } else if (door === 'north' && side === 'west') {
      i = 7;
      j = 14;
      r = rotated(rot, COUNTERCLOCKWISE_90);
      mirror = LEFT_RIGHT;
    } else if (door === 'south' && side === 'west') {
      i = 7;
      j = -8;
      r = rotated(rot, CLOCKWISE_90);
    } else if (door === 'south' && side === 'east') {
      i = 1;
      j = -8;
      r = rotated(rot, CLOCKWISE_90);
      mirror = LEFT_RIGHT;
    } else if (door === 'west' && side === 'north') {
      i = 15;
      j = 6;
      r = rotated(rot, CLOCKWISE_180);
    } else if (door === 'west' && side === 'south') {
      i = 15;
      mirror = FRONT_BACK;
    }
    const p = rel(rel(at, turn(rot, 'east'), i), turn(rot, 'south'), j);
    this.add(list, rooms.get2x2(this.random), p, r, mirror);
  }

  /** vanilla addRoom2x2Secret */
  private addRoom2x2Secret(list: PiecePlacement[], at: P3, rot: Rot, rooms: FloorRooms): void {
    this.add(list, rooms.get2x2Secret(this.random), rel(at, turn(rot, 'east'), 1), rot);
  }
}

/** vanilla WoodlandMansionPieces.generateMansion: the pieces of a mansion whose entrance is at `origin`, turned `rotation` */
export function generateMansion(origin: P3, rotation: Rot, r: JavaRandom): { grid: MansionGrid; placements: PiecePlacement[] } {
  const grid = new MansionGrid(r);
  const placements: PiecePlacement[] = [];
  new MansionPiecePlacer(r).createMansion(origin, rotation, placements, grid);
  return { grid, placements };
}

// ---------------------------------------------------------------------------------------------------------------
// Pieces (vanilla WoodlandMansionPiece: a TemplateStructurePiece)

/** blocks whose connections are fixed up once the chunks around are there (vanilla updateFromNeighbourShapes) */
const SHAPED = /(_fence|_pane|_wall|_stairs|_fence_gate|^iron_bars|^redstone_wire)$/;

/** vanilla WoodlandMansionPiece.handleDataMarker's chests: which way each faces (turned with the piece, not mirrored) */
const CHEST_MARKERS: Record<string, D4> = { ChestNorth: 'north', ChestEast: 'east', ChestSouth: 'south', ChestWest: 'west' };

export class MansionPiece {
  readonly template: MansionTemplate;
  readonly box: BoundingBox;
  private readonly states = new Map<number, number>();

  constructor(readonly placement: PiecePlacement) {
    this.template = mansionTemplate(placement.name);
    const t = this.template, p = placement;
    const [ax, az] = transformXZ(t.ox, t.oz, p.rot, p.mirror), [bx, bz] = transformXZ(t.ox + t.sx - 1, t.oz + t.sz - 1, p.rot, p.mirror);
    this.box = new BoundingBox(p.x + Math.min(ax, bx), p.y, p.z + Math.min(az, bz), p.x + Math.max(ax, bx), p.y + t.sy - 1, p.z + Math.max(az, bz));
  }

  get name(): string {
    return this.placement.name;
  }

  /** a template position in the world */
  worldPos(x: number, y: number, z: number): P3 {
    const [dx, dz] = transformXZ(x, z, this.placement.rot, this.placement.mirror);
    return [this.placement.x + dx, this.placement.y + y, this.placement.z + dz];
  }

  /** a template state in the world (vanilla BlockState.mirror, then rotate) */
  private state(st: number): number {
    const c = this.states.get(st);
    if (c !== undefined) return c;
    const out = rotateState(mirrorState(st, this.placement.mirror), this.placement.rot);
    this.states.set(st, out);
    return out;
  }

  /** vanilla TemplateStructurePiece.postProcess: the template's blocks in this chunk, then its data markers */
  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    const t = this.template;
    this.placeBlocks(ctx, chunk, t.blocks, false);
    if (t.soft.length) this.placeBlocks(ctx, chunk, t.soft, true);
    for (const mk of t.markers) {
      const [wx, wy, wz] = this.worldPos(mk.x, mk.y, mk.z);
      if (!chunk.isInside(wx, wy, wz)) continue;
      this.handleDataMarker(ctx, mk.name, wx, wy, wz, r);
    }
  }

  private placeBlocks(ctx: GenContext, chunk: BoundingBox, b: Int32Array, soft: boolean): void {
    const { x: px, y: py, z: pz, rot, mirror } = this.placement;
    for (let i = 0; i < b.length; i += 4) {
      const [dx, dz] = transformXZ(b[i], b[i + 2], rot, mirror);
      const wx = px + dx, wy = py + b[i + 1], wz = pz + dz;
      if (!chunk.isInside(wx, wy, wz)) continue;
      const st = this.state(b[i + 3]);
      if (!ctx.set(wx, wy, wz, st, soft ? W_AIR : undefined) || st <= 0) continue;
      const n = blockOf(st).name;
      if (n === 'water' || n === 'lava') ctx.scheduleFluid(wx, wy, wz);
      if (SHAPED.test(n)) ctx.markForPostprocessing(wx, wy, wz);
    }
  }

  /**
   * vanilla WoodlandMansionPiece.handleDataMarker: a loot chest (facing the way its name says, turned with the piece
   * but not mirrored: vanilla's own quirk), an evoker ("Mage") or a vindicator ("Warrior"), persistent and finalized
   * as a structure's; "Group of Allays" would bring one to three allays, which the game doesn't have: the cell
   * stays empty
   */
  private handleDataMarker(ctx: GenContext, name: string, x: number, y: number, z: number, r: Rand): void {
    if (name.startsWith('Chest')) {
      const d = CHEST_MARKERS[name];
      const st = d ? S('chest', { facing: turn(this.placement.rot, d) }) : S('chest');
      // (vanilla StructurePiece.createChest: not where there's a chest already)
      if (blockOf(ctx.getOrAir(x, y, z)).name === 'chest') return;
      ctx.set(x, y, z, st);
      ctx.blockEntities.push({ id: 'chest', x, y, z, items: [], data: { lootTable: 'chests/woodland_mansion', lootSeed: r.nextU32() } });
      return;
    }
    const id = name === 'Mage' ? 'evoker' : name === 'Warrior' ? 'vindicator' : null;
    if (name === 'Group of Allays') {
      // HOOK(allays): r.nextInt(3) + 1 allays here, persistent, once the game has them
      ctx.set(x, y, z, 0);
      return;
    }
    if (!id) return;
    ctx.entities.push({ id, x: x + 0.5, y, z: z + 0.5, yaw: 0, pitch: 0, dx: 0, dy: 0, dz: 0, health: 24, fire: 0, persistent: true, data: { finalize: 'structure' } });
    ctx.set(x, y, z, 0);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Placement

export interface MansionTerrain {
  /** vanilla getBaseHeight(WORLD_SURFACE_WG) on the bare noise terrain: the first block above it (water counts) */
  firstFreeHeight(x: number, z: number): number;
  /** the biome at a quart (vanilla getNoiseBiome) */
  quartBiome(x: number, z: number): number;
}

export interface MansionStub {
  /** the start chunk (vanilla locate reports its corner) */
  cx: number;
  cz: number;
  /** the entrance's corner (vanilla getLowestYIn5by5BoxOffset7Blocks) */
  x: number;
  y: number;
  z: number;
  rotation: Rot;
}

export interface MansionStart extends MansionStub {
  grid: MansionGrid;
  pieces: MansionPiece[];
  /** vanilla PiecesContainer.calculateBoundingBox */
  bounds: BoundingBox;
}

const floorDiv = (a: number, b: number) => Math.floor(a / b);

export class WoodlandMansions {
  private readonly stubs = new Map<number, MansionStub | null>();
  private readonly starts = new Map<number, MansionStart>();
  private readonly seedHash: number;

  constructor(readonly seed: bigint, private readonly terrain: MansionTerrain) {
    this.seedHash = Number(BigInt.asIntN(32, seed ^ (seed >> 32n))) ^ 0x3a4510;
  }

  /** vanilla RandomSpreadStructurePlacement.getPotentialStructureChunk (triangular spread) */
  potentialChunk(rx: number, rz: number): [number, number] {
    const r = saltedRandom(this.seed, rx, rz, SALT);
    const n = SPACING - SEPARATION;
    const i = Math.floor((r.nextInt(n) + r.nextInt(n)) / 2), j = Math.floor((r.nextInt(n) + r.nextInt(n)) / 2);
    return [rx * SPACING + i, rz * SPACING + j];
  }

  private key(rx: number, rz: number): number {
    return (rx + 65536) * 131072 + (rz + 65536);
  }

  /**
   * a region's mansion, if it has one (vanilla WoodlandMansionStructure.findGenerationPoint, then isValidBiome): a
   * random turn from the start chunk's large-feature random, the lowest of the first occupied heights at the
   * corners of a 5×5 square from the chunk's (7, 7), reaching the way the turn points, which mustn't be below
   * y 60, and a dark forest there
   */
  stub(rx: number, rz: number): MansionStub | null {
    const key = this.key(rx, rz);
    const c = this.stubs.get(key);
    if (c !== undefined) return c;
    const [cx, cz] = this.potentialChunk(rx, rz);
    let s: MansionStub | null = null;
    const x = cx * 16 + 7, z = cz * 16 + 7;
    if (MANSION_BIOMES.has(this.terrain.quartBiome(x, z))) {
      const rotation = largeFeatureRandom(this.seed, cx, cz).nextInt(4) as Rot;
      const i = rotation === CLOCKWISE_90 || rotation === CLOCKWISE_180 ? -5 : 5;
      const j = rotation === CLOCKWISE_180 || rotation === COUNTERCLOCKWISE_90 ? -5 : 5;
      const h = (a: number, b: number) => this.terrain.firstFreeHeight(a, b) - 1;
      const y = Math.min(h(x, z), h(x, z + j), h(x + i, z), h(x + i, z + j));
      if (y >= MIN_HEIGHT) s = { cx, cz, x, y, z, rotation };
    }
    if (this.stubs.size > 8192) this.stubs.clear();
    this.stubs.set(key, s);
    return s;
  }

  /** a region's mansion laid out (vanilla Structure.generate: the pieces from the start chunk's large-feature random) */
  start(rx: number, rz: number): MansionStart | null {
    const s = this.stub(rx, rz);
    if (!s) return null;
    const key = this.key(rx, rz);
    let st = this.starts.get(key);
    if (st) return st;
    const r = largeFeatureRandom(this.seed, s.cx, s.cz);
    r.nextInt(4); // (the turn, drawn first: see stub)
    const { grid, placements } = generateMansion([s.x, s.y, s.z], s.rotation, r);
    const pieces = placements.map((p) => new MansionPiece(p));
    const b = pieces[0].box;
    const bounds = new BoundingBox(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
    for (const p of pieces) bounds.encapsulate(p.box);
    st = { ...s, grid, pieces, bounds };
    if (this.starts.size > 16) this.starts.clear();
    this.starts.set(key, st);
    return st;
  }

  /** the mansions whose pieces reach the chunk */
  startsNear(cx: number, cz: number): MansionStart[] {
    const out: MansionStart[] = [];
    for (let rx = floorDiv(cx - REACH, SPACING); rx <= floorDiv(cx + REACH, SPACING); rx++)
      for (let rz = floorDiv(cz - REACH, SPACING); rz <= floorDiv(cz + REACH, SPACING); rz++) {
        const s = this.stub(rx, rz);
        if (!s || Math.abs(s.cx - cx) > REACH || Math.abs(s.cz - cz) > REACH) continue;
        const st = this.start(rx, rz);
        if (st && st.bounds.maxX >= cx * 16 && st.bounds.minX <= cx * 16 + 15 && st.bounds.maxZ >= cz * 16 && st.bounds.minZ <= cz * 16 + 15) out.push(st);
      }
    return out;
  }

  /** vanilla StructureStart.placeInChunk for every mansion reaching this chunk: its pieces in order, then afterPlace */
  place(ctx: GenContext): void {
    const near = this.startsNear(ctx.cx, ctx.cz);
    if (!near.length) return;
    const chunk = new BoundingBox(ctx.x0, MIN_Y + 1, ctx.z0, ctx.x0 + 15, MAX_Y - 1, ctx.z0 + 15);
    // vanilla ChunkGenerator.applyBiomeDecoration: one random for the structure in this chunk (setFeatureSeed)
    const r = new Rand(hash2(ctx.cx, ctx.cz, this.seedHash), 0x3a);
    for (const s of near) {
      const inChunk = s.pieces.filter((p) => p.box.intersects(chunk));
      for (const p of inChunk) p.postProcess(ctx, chunk, r);
      afterPlace(ctx, s, inChunk);
    }
  }

  /**
   * vanilla ChunkGenerator.getNearestGeneratedStructure for /locate: rings of regions outwards from the one the
   * position is in, and the first start met going round a ring (not always the closest one); the start chunk's
   * corner is what's reported (StructurePlacement.getLocatePos)
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

/**
 * vanilla WoodlandMansionStructure.afterPlace: under every block of the ground storey inside a piece, cobblestone
 * down through air and liquids to whatever's solid (or anything else: a plant stops it)
 */
function afterPlace(ctx: GenContext, s: MansionStart, inChunk: MansionPiece[]): void {
  const y0 = s.bounds.minY;
  const pieces = inChunk.filter((p) => p.box.minY <= y0 && p.box.maxY >= y0);
  if (!pieces.length) return;
  const COBBLE = S('cobblestone');
  for (let z = ctx.z0; z < ctx.z0 + 16; z++)
    for (let x = ctx.x0; x < ctx.x0 + 16; x++) {
      if (!s.bounds.isInside(x, y0, z) || !pieces.some((p) => p.box.isInside(x, y0, z))) continue;
      const st = ctx.getOrAir(x, y0, z);
      if (st <= 0 || FLAGS[st] & F_AIR) continue;
      for (let y = y0 - 1; y > MIN_Y; y--) {
        const b = ctx.getOrAir(x, y, z);
        const empty = b <= 0 || (FLAGS[b] & F_AIR) !== 0;
        const liquid = b > 0 && (FLAGS[b] & (F_WATER | F_LAVA)) !== 0 && isFluidBlock(b);
        if (!empty && !liquid) break;
        ctx.set(x, y, z, COBBLE);
      }
    }
}

/** vanilla BlockState.liquid(): water and lava themselves (not waterlogged blocks) */
function isFluidBlock(st: number): boolean {
  const n = blockOf(st).name;
  return n === 'water' || n === 'lava';
}
