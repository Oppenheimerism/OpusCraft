// The end city's templates (vanilla data/minecraft/structure/end_city/*.nbt): the houses (base_floor, the second and
// third floors and their roofs), the towers (tower_base, tower_piece, tower_top), the fat towers (fat_tower_base,
// fat_tower_middle, fat_tower_top), the bridges (bridge_end, bridge_piece, bridge_steep_stairs, bridge_gentle_stairs)
// and the ship. Vanilla builds the city from saved templates the game can't ship, so they're made here block by block
// as close to vanilla's as they're known. Their sizes are vanilla's, since the city's layout (which pieces are kept
// and which collide) depends on them, and so are their joins: each floor a block wider than the one under it, the
// towers' ladders one above the other, the bridges' doorways where the next piece's floor is. Their data markers are
// vanilla's: "Chest" over each treasure chest, "Sentry" where a shulker sits, "Elytra" where the ship's item frame hangs.

import type { SavedBlockEntity } from '../blockEntity';
import { parseState } from './jigsaw';

export type CityMarkerName = 'Chest' | 'Sentry' | 'Elytra';

export interface CityMarker {
  x: number;
  y: number;
  z: number;
  name: CityMarkerName;
}

export interface CityBlockEntity {
  x: number;
  y: number;
  z: number;
  id: string;
  items: SavedBlockEntity['items'];
}

export interface CityTemplate {
  readonly name: string;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  /** packed x, y, z, state (0: air, which only the pieces that overwrite place); structure void isn't in it */
  readonly blocks: Int32Array;
  readonly markers: readonly CityMarker[];
  /** the block entities the template carries (chests, the ship's brewing stands and dragon head) */
  readonly blockEntities: readonly CityBlockEntity[];
}

const AIR = 'air';
const P = 'purpur_block';
const PILLAR = 'purpur_pillar[axis=y]';
const SLAB = 'purpur_slab[type=bottom]';
const GLASS = 'magenta_stained_glass';
type Side = 'north' | 'south' | 'west' | 'east';
const stairs = (f: Side, top: boolean) => `purpur_stairs[facing=${f},half=${top ? 'top' : 'bottom'}]`;
const rod = (f: Side | 'up' | 'down') => `end_rod[facing=${f}]`;
const ladder = (f: Side) => `ladder[facing=${f}]`;

class Builder {
  private readonly cells = new Map<number, string>();
  private readonly markers: CityMarker[] = [];
  private readonly bes: CityBlockEntity[] = [];

  constructor(readonly name: string, readonly sx: number, readonly sy: number, readonly sz: number) {}

  private key(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) throw new Error(`end city ${this.name}: ${x} ${y} ${z} is outside it`);
    return (y * this.sz + z) * this.sx + x;
  }

  set(x: number, y: number, z: number, s: string): this {
    this.cells.set(this.key(x, y, z), s);
    return this;
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, s: string): this {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, s);
    return this;
  }

  /** the four sides of a box, its corners of another block (pillars) */
  walls(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, s: string, corner = s): this {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) this.set(x, y, z0, s).set(x, y, z1, s);
      for (let z = z0; z <= z1; z++) this.set(x0, y, z, s).set(x1, y, z, s);
      this.set(x0, y, z0, corner).set(x1, y, z0, corner).set(x0, y, z1, corner).set(x1, y, z1, corner);
    }
    return this;
  }

  /** the outermost ring of a layer, all of one block */
  ring(y: number, x0: number, z0: number, x1: number, z1: number, s: string): this {
    for (let x = x0; x <= x1; x++) this.set(x, y, z0, s).set(x, y, z1, s);
    for (let z = z0; z <= z1; z++) this.set(x0, y, z, s).set(x1, y, z, s);
    return this;
  }

  /**
   * a ring of upside-down stairs turned inward: the trim under an overhanging floor or roof (the corners take their
   * shape from their neighbours once placed)
   */
  trim(y: number, x0: number, z0: number, x1: number, z1: number): this {
    for (let x = x0; x <= x1; x++) this.set(x, y, z0, stairs('south', true)).set(x, y, z1, stairs('north', true));
    for (let z = z0; z <= z1; z++) this.set(x0, y, z, stairs('east', true)).set(x1, y, z, stairs('west', true));
    return this;
  }

  /** a data marker (vanilla's structure block in data mode): nothing is placed there */
  marker(x: number, y: number, z: number, name: CityMarkerName): this {
    this.cells.delete(this.key(x, y, z));
    this.markers.push({ x, y, z, name });
    return this;
  }

  /** a treasure chest facing the room, and the "Chest" marker over it */
  chest(x: number, y: number, z: number, f: Side): this {
    this.set(x, y, z, `chest[facing=${f}]`);
    this.bes.push({ x, y, z, id: 'chest', items: [] });
    return this.marker(x, y + 1, z, 'Chest');
  }

  be(x: number, y: number, z: number, id: string, items: SavedBlockEntity['items'] = []): this {
    this.key(x, y, z);
    this.bes.push({ x, y, z, id, items });
    return this;
  }

  build(): CityTemplate {
    const out: number[] = [];
    for (const k of [...this.cells.keys()].sort((a, b) => a - b)) {
      const s = this.cells.get(k)!;
      const x = k % this.sx, z = Math.floor(k / this.sx) % this.sz, y = Math.floor(k / (this.sx * this.sz));
      out.push(x, y, z, s === AIR ? 0 : parseState(s));
    }
    return { name: this.name, sx: this.sx, sy: this.sy, sz: this.sz, blocks: Int32Array.from(out), markers: this.markers, blockEntities: this.bes };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The houses. base_floor is the ground floor, entered through the door in its south wall (where the bridge
// comes in); each floor above is a block wider all round, and so is each roof than the floor it covers. The upper
// floors don't overwrite (their air isn't placed), and carry in their lower half the ladder up from the floor
// below and the trim under their overhang.

/** vanilla base_floor: 10 x 4 x 10 */
function baseFloor(): CityTemplate {
  const b = new Builder('base_floor', 10, 4, 10);
  b.fill(0, 0, 0, 9, 0, 9, P);
  b.walls(0, 1, 0, 9, 3, 9, P, PILLAR);
  b.fill(1, 1, 1, 8, 3, 8, AIR);
  // the door
  b.fill(4, 1, 9, 6, 3, 9, AIR);
  // windows
  b.set(4, 2, 0, GLASS).set(5, 2, 0, GLASS).set(0, 2, 4, GLASS).set(0, 2, 5, GLASS).set(9, 2, 5, GLASS).set(9, 2, 6, GLASS);
  b.set(2, 3, 1, rod('south')).set(6, 3, 1, rod('south'));
  return b.build();
}

/** vanilla base_roof: 12 x 2 x 12, over a house with only its ground floor */
function baseRoof(): CityTemplate {
  const b = new Builder('base_roof', 12, 2, 12);
  roof(b, 11);
  b.marker(5, 1, 6, 'Sentry');
  return b.build();
}

/** a roof over a floor n - 1 wide: the overhang's trim and the roof, a parapet of slabs with end rods at its corners */
function roof(b: Builder, n: number): void {
  b.trim(0, 0, 0, n, n);
  b.fill(1, 0, 1, n - 1, 0, n - 1, P);
  b.ring(1, 0, 0, n, n, SLAB);
  b.set(0, 1, 0, rod('up')).set(n, 1, 0, rod('up')).set(0, 1, n, rod('up')).set(n, 1, n, rod('up'));
  b.fill(1, 1, 1, n - 1, 1, n - 1, AIR);
}

/** an upper floor's lower half: the trim under its overhang, end rods hanging at the corners */
function overhang(b: Builder, n: number): void {
  b.trim(3, 0, 0, n, n);
  b.set(0, 2, 0, rod('down')).set(n, 2, 0, rod('down')).set(0, 2, n, rod('down')).set(n, 2, n, rod('down'));
}

/** vanilla second_floor_1 (the first house's) and second_floor_2 (the others'): 12 x 8 x 12, the floor at y 4 */
function secondFloor(name: string, sentry: boolean): CityTemplate {
  const b = new Builder(name, 12, 8, 12);
  overhang(b, 11);
  b.fill(0, 4, 0, 11, 4, 11, P);
  // the ladder up from the ground floor, against its east wall, through a hole in this floor
  for (let y = 1; y <= 4; y++) b.set(9, y, 3, ladder('west'));
  b.walls(0, 5, 0, 11, 7, 11, P, PILLAR);
  b.fill(1, 5, 1, 10, 7, 10, AIR);
  b.set(5, 6, 0, GLASS).set(6, 6, 0, GLASS).set(5, 6, 11, GLASS).set(6, 6, 11, GLASS);
  b.set(0, 6, 5, GLASS).set(0, 6, 6, GLASS).set(11, 6, 5, GLASS).set(11, 6, 6, GLASS);
  b.set(1, 7, 1, rod('down')).set(10, 7, 10, rod('down'));
  if (sentry) b.marker(8, 5, 8, 'Sentry');
  return b.build();
}

/** vanilla second_roof: 14 x 2 x 14 */
function secondRoof(): CityTemplate {
  const b = new Builder('second_roof', 14, 2, 14);
  roof(b, 13);
  b.marker(11, 1, 2, 'Sentry');
  return b.build();
}

/** vanilla third_floor_1 and third_floor_2: 14 x 8 x 14, the floor at y 4, the treasure against its south wall */
function thirdFloor(name: string, chests: number[]): CityTemplate {
  const b = new Builder(name, 14, 8, 14);
  overhang(b, 13);
  b.fill(0, 4, 0, 13, 4, 13, P);
  // the ladder up from the second floor, against its west wall
  for (let y = 1; y <= 4; y++) b.set(2, y, 10, ladder('east'));
  b.walls(0, 5, 0, 13, 7, 13, P, PILLAR);
  b.fill(1, 5, 1, 12, 7, 12, AIR);
  b.set(6, 6, 0, GLASS).set(7, 6, 0, GLASS).set(6, 6, 13, GLASS).set(7, 6, 13, GLASS);
  b.set(0, 6, 6, GLASS).set(0, 6, 7, GLASS).set(13, 6, 6, GLASS).set(13, 6, 7, GLASS);
  b.set(12, 7, 1, rod('down')).set(1, 7, 12, rod('down'));
  for (const x of chests) b.chest(x, 5, 12, 'north');
  return b.build();
}

/** vanilla third_roof: 16 x 2 x 16 */
function thirdRoof(): CityTemplate {
  const b = new Builder('third_roof', 16, 2, 16);
  roof(b, 15);
  b.marker(12, 1, 3, 'Sentry').marker(3, 1, 12, 'Sentry');
  return b.build();
}

// ---------------------------------------------------------------------------------------------------------------
// The towers: 7 x 7, a ladder in the north-west corner against the west wall all the way up, a floor every four
// blocks (where the bridges come in) with a hole for the ladder.

/**
 * vanilla tower_base: 7 x 7 x 7, three blocks down into the room under the roof it stands on: there, only the ladder
 * and the pillar it's on; then the tower's floor in the roof, and its walls
 */
function towerBase(): CityTemplate {
  const b = new Builder('tower_base', 7, 7, 7);
  for (let y = 0; y <= 2; y++) b.set(0, y, 1, PILLAR);
  b.fill(0, 3, 0, 6, 3, 6, P);
  b.walls(0, 4, 0, 6, 6, 6, P, PILLAR);
  b.fill(1, 4, 1, 5, 6, 5, AIR);
  for (let y = 0; y <= 6; y++) b.set(1, y, 1, ladder('east'));
  b.set(3, 5, 0, GLASS).set(6, 5, 3, GLASS).set(3, 5, 6, GLASS).set(0, 5, 3, GLASS);
  return b.build();
}

/** vanilla tower_piece: 7 x 4 x 7 */
function towerPiece(): CityTemplate {
  const b = new Builder('tower_piece', 7, 4, 7);
  b.fill(0, 0, 0, 6, 0, 6, P);
  b.walls(0, 0, 0, 6, 3, 6, P, PILLAR);
  b.fill(1, 1, 1, 5, 3, 5, AIR);
  for (let y = 0; y <= 3; y++) b.set(1, y, 1, ladder('east'));
  for (const y of [1, 2]) b.set(3, y, 0, GLASS).set(6, y, 3, GLASS).set(3, y, 6, GLASS).set(0, y, 3, GLASS);
  return b.build();
}

/** vanilla tower_top: 9 x 5 x 9, a lookout a block wider than the tower, with a shulker in it */
function towerTop(): CityTemplate {
  const b = new Builder('tower_top', 9, 5, 9);
  b.trim(0, 0, 0, 8, 8);
  b.fill(1, 0, 1, 7, 0, 7, P);
  b.walls(1, 1, 1, 7, 3, 7, P, PILLAR);
  b.fill(2, 1, 2, 6, 3, 6, AIR);
  b.set(2, 0, 2, ladder('east')).set(2, 1, 2, ladder('east'));
  b.set(4, 2, 1, GLASS).set(7, 2, 4, GLASS).set(4, 2, 7, GLASS).set(1, 2, 4, GLASS);
  b.ring(4, 0, 0, 8, 8, SLAB);
  b.fill(1, 4, 1, 7, 4, 7, P);
  b.set(4, 3, 4, rod('down'));
  b.marker(5, 1, 5, 'Sentry');
  return b.build();
}

// The fat towers: 13 x 13, standing on a tower; the ladder goes on up at the same place (4, 4 here), on a pillar
// of its own.

/** vanilla fat_tower_base: 13 x 4 x 13 */
function fatTowerBase(): CityTemplate {
  const b = new Builder('fat_tower_base', 13, 4, 13);
  fatStorey(b, 0);
  b.set(1, 3, 1, rod('down')).set(11, 3, 11, rod('down'));
  return b.build();
}

/** a storey of a fat tower: its floor at y, the room over it */
function fatStorey(b: Builder, y: number): void {
  b.fill(0, y, 0, 12, y, 12, P);
  b.walls(0, y + 1, 0, 12, y + 3, 12, P, PILLAR);
  b.fill(1, y + 1, 1, 11, y + 3, 11, AIR);
  for (let i = 0; i <= 3; i++) b.set(4, y + i, 4, ladder('east'));
  for (let i = 1; i <= 3; i++) b.set(3, y + i, 4, PILLAR);
  for (let i = 5; i <= 7; i++) b.set(i, y + 2, 0, GLASS).set(12, y + 2, i, GLASS).set(i, y + 2, 12, GLASS).set(0, y + 2, i, GLASS);
}

/** vanilla fat_tower_middle: 13 x 8 x 13, two storeys (bridges come in at the bottom one) */
function fatTowerMiddle(): CityTemplate {
  const b = new Builder('fat_tower_middle', 13, 8, 13);
  fatStorey(b, 0);
  fatStorey(b, 4);
  b.set(11, 3, 1, rod('down')).set(1, 7, 11, rod('down'));
  return b.build();
}

/** vanilla fat_tower_top: 17 x 6 x 17, the treasure room at the top, two chests and two shulkers */
function fatTowerTop(): CityTemplate {
  const b = new Builder('fat_tower_top', 17, 6, 17);
  b.trim(0, 0, 0, 16, 16);
  b.fill(1, 0, 1, 15, 0, 15, P);
  b.walls(1, 1, 1, 15, 4, 15, P, PILLAR);
  b.fill(2, 1, 2, 14, 4, 14, AIR);
  b.set(6, 0, 6, ladder('east')).set(6, 1, 6, ladder('east'));
  for (let y = 1; y <= 4; y++) b.set(5, y, 6, PILLAR);
  for (let i = 7; i <= 9; i++)
    for (const y of [2, 3]) b.set(i, y, 1, GLASS).set(15, y, i, GLASS).set(i, y, 15, GLASS).set(1, y, i, GLASS);
  b.ring(5, 0, 0, 16, 16, SLAB);
  b.fill(1, 5, 1, 15, 5, 15, P);
  b.set(8, 4, 8, rod('down'));
  b.chest(7, 1, 14, 'north').chest(9, 1, 14, 'north');
  b.marker(3, 1, 12, 'Sentry').marker(13, 1, 3, 'Sentry');
  return b.build();
}

// ---------------------------------------------------------------------------------------------------------------
// The bridges run toward the north (-z) from where they start. The floor is at y 1 (the underside at y 0), the
// walkway three wide between rails, and each piece's far end is where the next begins.

/** one row of a bridge: the underside, the floor at y, the rails (a post with end rods at the joins), the air over it */
function bridgeRow(b: Builder, z: number, y: number, post: boolean): void {
  b.set(0, y - 1, z, stairs('east', true)).fill(1, y - 1, z, 3, y - 1, z, P).set(4, y - 1, z, stairs('west', true));
  b.fill(0, y, z, 4, y, z, P);
  b.set(0, y + 1, z, post ? P : SLAB).set(4, y + 1, z, post ? P : SLAB);
  if (post) b.set(0, y + 2, z, rod('up')).set(4, y + 2, z, rod('up'));
  b.fill(1, y + 1, z, 3, Math.min(y + 3, b.sy - 1), z, AIR);
}

/** vanilla bridge_piece: 5 x 6 x 4, level */
function bridgePiece(): CityTemplate {
  const b = new Builder('bridge_piece', 5, 6, 4);
  for (let z = 0; z < 4; z++) bridgeRow(b, z, 1, z === 0);
  return b.build();
}

/** vanilla bridge_steep_stairs: 5 x 7 x 4, up four in four */
function bridgeSteepStairs(): CityTemplate {
  const b = new Builder('bridge_steep_stairs', 5, 7, 4);
  for (let z = 0; z < 4; z++) {
    const y = 1 + (3 - z);
    b.set(0, y - 1, z, stairs('east', true)).fill(1, y - 1, z, 3, y - 1, z, P).set(4, y - 1, z, stairs('west', true));
    b.fill(0, y, z, 4, y, z, P);
    b.fill(1, y + 1, z, 3, y + 1, z, stairs('north', false));
    b.set(0, y + 1, z, P).set(4, y + 1, z, P);
    if (y + 2 <= 6) b.fill(1, y + 2, z, 3, Math.min(y + 4, 6), z, AIR);
  }
  return b.build();
}

/** vanilla bridge_gentle_stairs: 5 x 7 x 8, up four in eight, a slab and a block at a time */
function bridgeGentleStairs(): CityTemplate {
  const b = new Builder('bridge_gentle_stairs', 5, 7, 8);
  for (let z = 0; z < 8; z++) {
    const k = 7 - z, y = 2 + (k >> 1);
    b.set(0, y - 2, z, stairs('east', true)).fill(1, y - 2, z, 3, y - 2, z, P).set(4, y - 2, z, stairs('west', true));
    b.fill(0, y - 1, z, 4, y - 1, z, P);
    b.fill(1, y, z, 3, y, z, k & 1 ? P : SLAB);
    b.set(0, y, z, P).set(4, y, z, P);
    if (y + 1 <= 6) b.fill(1, y + 1, z, 3, Math.min(y + 3, 6), z, AIR);
  }
  return b.build();
}

/**
 * vanilla bridge_end: 5 x 6 x 2, where a bridge meets a tower or a house: a doorway in a frame on the side toward
 * the bridge (z 0), a step on the other (the wall it's set into or stands against is left as it is round it)
 */
function bridgeEnd(): CityTemplate {
  const b = new Builder('bridge_end', 5, 6, 2);
  b.fill(0, 0, 0, 4, 1, 0, P);
  b.fill(0, 2, 0, 0, 4, 0, PILLAR).fill(4, 2, 0, 4, 4, 0, PILLAR);
  b.fill(1, 2, 0, 3, 4, 0, AIR);
  b.fill(0, 5, 0, 4, 5, 0, P);
  b.fill(1, 1, 1, 3, 1, 1, P);
  return b.build();
}

// ---------------------------------------------------------------------------------------------------------------

/**
 * vanilla ship: 13 x 24 x 29, bow to the north. A hull narrowing to a stem at the bow, the dragon's head on its
 * prow; the hold (reached by a ladder through the deck) with the two brewing stands, each holding two potions of
 * healing; the mast; and at the stern the cabin with the elytra in an item frame on its forward wall, the two
 * treasure chests against the stern and a shulker between them.
 */
function ship(): CityTemplate {
  const b = new Builder('ship', 13, 24, 29);
  const C = 6;
  for (let z = 1; z <= 28; z++) {
    const w = Math.min(z, 4);
    // the bottom, narrowing downward, over upside-down stairs
    for (let y = 0; y <= 2; y++) {
      const h = w - 3 + y;
      if (h < 0) continue;
      b.fill(C - h, y, z, C + h, y, z, P);
      b.set(C - h - 1, y, z, stairs('east', true)).set(C + h + 1, y, z, stairs('west', true));
    }
    // the sides and the hold between them (at the bow, the stem)
    if (w >= 2) {
      b.fill(C - w, 3, z, C - w, 6, z, P).fill(C + w, 3, z, C + w, 6, z, P);
      b.fill(C - w + 1, 3, z, C + w - 1, 6, z, AIR);
    } else b.fill(C - 1, 3, z, C + 1, 6, z, P);
    // the deck, a block wider than the hull, and its rails
    b.fill(C - w - 1, 7, z, C + w + 1, 7, z, P);
    b.set(C - w - 1, 6, z, stairs('east', true)).set(C + w + 1, 6, z, stairs('west', true));
    b.set(C - w - 1, 8, z, SLAB).set(C + w + 1, 8, z, SLAB);
  }
  // the forecastle, a step up at the bow, its rails a block higher, the stairs up to it
  for (let z = 1; z <= 4; z++) {
    const w = Math.min(z, 4);
    b.fill(C - w - 1, 8, z, C + w + 1, 8, z, P);
    b.set(C - w - 1, 9, z, SLAB).set(C + w + 1, 9, z, SLAB);
  }
  b.fill(C - 1, 9, 1, C + 1, 9, 1, SLAB);
  b.fill(2, 8, 5, 10, 8, 5, stairs('north', false));
  // the stern's wall
  b.fill(3, 3, 28, 9, 6, 28, P);
  // the dragon's head on the prow
  b.set(C, 8, 0, 'dragon_wall_head[facing=north]').be(C, 8, 0, 'skull');
  // portholes
  for (const z of [8, 12, 16]) b.set(2, 5, z, GLASS).set(10, 5, z, GLASS);
  // the hold: a ladder down from the deck, the brewing stands at its bow end, end rods under the deck
  for (let y = 3; y <= 7; y++) b.set(3, y, 10, ladder('east'));
  const healing = (slot: number): SavedBlockEntity['items'][number] => [slot, 'potion', 1, 0, { potion: { potion: 'healing' } }];
  for (const x of [4, 8]) b.set(x, 3, 6, 'brewing_stand[has_bottle_0=true,has_bottle_2=true]').be(x, 3, 6, 'brewing_stand', [healing(0), healing(2)]);
  b.set(C, 6, 8, rod('down')).set(C, 6, 18, rod('down'));
  b.marker(C, 3, 16, 'Sentry');
  // the mast
  for (let y = 8; y <= 21; y++) b.set(C, y, 13, PILLAR);
  b.set(C, 22, 13, rod('up')).set(C - 1, 19, 13, rod('west')).set(C + 1, 19, 13, rod('east'));
  // the cabin
  b.walls(2, 8, 21, 10, 11, 28, P, PILLAR);
  b.fill(3, 8, 22, 9, 11, 27, AIR);
  b.fill(2, 12, 21, 10, 12, 28, P);
  b.fill(3, 8, 21, 3, 9, 21, AIR).fill(9, 8, 21, 9, 9, 21, AIR);
  for (let x = 5; x <= 7; x++) b.set(x, 10, 28, GLASS);
  for (const z of [24, 25]) b.set(2, 10, z, GLASS).set(10, 10, z, GLASS);
  b.set(C, 11, 24, rod('down'));
  b.marker(C, 9, 22, 'Elytra');
  b.chest(4, 8, 27, 'north').chest(8, 8, 27, 'north');
  b.marker(C, 8, 27, 'Sentry');
  return b.build();
}

const BUILDERS: Record<string, () => CityTemplate> = {
  base_floor: baseFloor,
  base_roof: baseRoof,
  second_floor_1: () => secondFloor('second_floor_1', false),
  second_floor_2: () => secondFloor('second_floor_2', true),
  second_roof: secondRoof,
  third_floor_1: () => thirdFloor('third_floor_1', [6]),
  third_floor_2: () => thirdFloor('third_floor_2', [5, 8]),
  third_roof: thirdRoof,
  tower_base: towerBase,
  tower_piece: towerPiece,
  tower_top: towerTop,
  fat_tower_base: fatTowerBase,
  fat_tower_middle: fatTowerMiddle,
  fat_tower_top: fatTowerTop,
  bridge_end: bridgeEnd,
  bridge_piece: bridgePiece,
  bridge_steep_stairs: bridgeSteepStairs,
  bridge_gentle_stairs: bridgeGentleStairs,
  ship,
};

/** vanilla's sizes, which the layout needs before any template is built */
export const CITY_SIZES: Record<string, readonly [number, number, number]> = {
  base_floor: [10, 4, 10],
  base_roof: [12, 2, 12],
  second_floor_1: [12, 8, 12],
  second_floor_2: [12, 8, 12],
  second_roof: [14, 2, 14],
  third_floor_1: [14, 8, 14],
  third_floor_2: [14, 8, 14],
  third_roof: [16, 2, 16],
  tower_base: [7, 7, 7],
  tower_piece: [7, 4, 7],
  tower_top: [9, 5, 9],
  fat_tower_base: [13, 4, 13],
  fat_tower_middle: [13, 8, 13],
  fat_tower_top: [17, 6, 17],
  bridge_end: [5, 6, 2],
  bridge_piece: [5, 6, 4],
  bridge_steep_stairs: [5, 7, 4],
  bridge_gentle_stairs: [5, 7, 8],
  ship: [13, 24, 29],
};

const built = new Map<string, CityTemplate>();

/** a template by name, built the first time it's wanted */
export function cityTemplate(name: string): CityTemplate {
  let t = built.get(name);
  if (!t) {
    const f = BUILDERS[name];
    if (!f) throw new Error('no end city template ' + name);
    t = f();
    built.set(name, t);
  }
  return t;
}
