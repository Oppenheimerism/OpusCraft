// The woodland mansion's building templates (vanilla woodland_mansion/*.nbt, made here after vanilla's look): the
// outside walls (a cobblestone course and plain windows on the ground storey, a dark oak band and pairs of windows
// above), their corners, the roof (a flat top, sloping fronts, hips and valleys), the low walls under the third
// storey, the corridors' floors, carpet runners and lanterns, the inner walls and doorways, and the entrance hall
// with its grand staircase. Each fits where vanilla's MansionPiecePlacer puts the piece of that name (see
// mansion.ts): a wall piece's line is its x 0, eight long, ending on the post the next corner shares; a roof
// front runs from the cell's inner column (x 0) over the wall line (x 1) to the eave (x 2); and so on. The rooms
// are in mansionRooms.ts.

import { TemplateBuilder, type MansionTemplate } from './mansionBuilder';
import { ROOMS } from './mansionRooms';

export type { MansionTemplate } from './mansionBuilder';

const PLANKS = 'dark_oak_planks';
const LOG_Y = 'dark_oak_log[axis=y]', LOG_X = 'dark_oak_log[axis=x]', LOG_Z = 'dark_oak_log[axis=z]';
const COBBLE = 'cobblestone';
const PANE = 'glass_pane';
const SILL = 'dark_oak_slab[type=top]';
const stair = (facing: string, half = 'bottom') => `dark_oak_stairs[facing=${facing},half=${half}]`;
/** the runner's edges and middle */
const EDGE = 'white_carpet', MID = 'red_carpet';
const runner = (i: number) => (i === 0 || i === 4 ? EDGE : MID);

// ---------------------------------------------------------------------------------------------------------------
// Outside walls

/** vanilla wall_flat: the ground storey's outside wall: a cobblestone course and plinth, a window with a sill */
function wallFlat(): MansionTemplate {
  const b = new TemplateBuilder('wall_flat', 2, 8, 8);
  b.fill(0, 0, 0, 0, 0, 6, COBBLE).fill(0, 1, 0, 0, 7, 6, PLANKS).fill(1, 0, 0, 1, 0, 6, COBBLE);
  // the post it ends on, standing out a block
  b.fill(0, 0, 7, 1, 0, 7, COBBLE).fill(0, 1, 7, 1, 7, 7, LOG_Y);
  b.fill(0, 2, 2, 0, 3, 4, PANE).fill(1, 1, 2, 1, 1, 4, SILL);
  return b.build();
}

/** vanilla wall_window: the upper storeys' outside wall: a dark oak band along the floor, two windows with sills */
function wallWindow(): MansionTemplate {
  const b = new TemplateBuilder('wall_window', 2, 8, 8);
  b.fill(0, 0, 0, 1, 0, 6, LOG_Z).fill(0, 1, 0, 0, 7, 6, PLANKS);
  b.fill(0, 0, 7, 1, 7, 7, LOG_Y);
  for (const z of [1, 4]) b.fill(0, 2, z, 0, 4, z + 1, PANE).fill(1, 1, z, 1, 1, z + 1, SILL);
  return b.build();
}

/** vanilla wall_corner: the outer corner's post (the walls either side end and begin on it) */
function wallCorner(): MansionTemplate {
  const b = new TemplateBuilder('wall_corner', 9, 8, 2);
  return b.fill(7, 0, 1, 8, 7, 1, LOG_Y).fill(8, 0, 0, 8, 7, 0, LOG_Y).build();
}

/** vanilla small_wall: under a third storey on the edge, the three blocks between the roof's foot and its floor */
function smallWall(): MansionTemplate {
  const b = new TemplateBuilder('small_wall', 2, 3, 8);
  return b.fill(0, 0, 0, 0, 2, 6, PLANKS).fill(0, 0, 7, 1, 2, 7, LOG_Y).build();
}

function smallWallCorner(): MansionTemplate {
  return new TemplateBuilder('small_wall_corner', 2, 3, 2).fill(0, 0, 0, 1, 2, 1, LOG_Y).build();
}

// ---------------------------------------------------------------------------------------------------------------
// The roof: flat on top (four above the roof's foot), sloping down over the walls to the eaves. Heights by how far
// a column is from the eave: the cell's inner column 3 (the top step), the wall line 2, the eave 1, and a cornice
// under the eave at 0.

const CORNICE = (towardHouse: string) => stair(towardHouse, 'top');

/** vanilla roof: a cell's flat top */
function roof(): MansionTemplate {
  return new TemplateBuilder('roof', 8, 1, 8).fill(0, 0, 0, 7, 0, 7, PLANKS).build();
}

/** vanilla roof_front: a cell's edge of roof (x 0 the cell's inner column, x 1 over the wall, x 2 the eave), eight long */
function roofFront(): MansionTemplate {
  const b = new TemplateBuilder('roof_front', 3, 4, 8);
  for (let z = 0; z < 8; z++) {
    b.set(0, 3, z, stair('west'));
    b.fill(1, 0, z, 1, 1, z, PLANKS).set(1, 2, z, stair('west')).set(1, 3, z, 'air');
    b.set(2, 0, z, CORNICE('west')).set(2, 1, z, stair('west'));
  }
  return b.build();
}

/** vanilla roof_corner: an outer corner (x 0 and z 0 the inner column and row), hipped */
function roofCorner(): MansionTemplate {
  const b = new TemplateBuilder('roof_corner', 3, 4, 3);
  for (let x = 0; x < 3; x++)
    for (let z = 0; z < 3; z++) {
      const d = Math.max(x, z), top = 3 - d;
      // the slope running along x faces west, the one along z north; on the hip, west (it meets the north slope's step beside it: an outer corner)
      b.set(x, top, z, stair(z > x ? 'north' : 'west'));
      if (d === 1) b.fill(x, 0, z, x, 1, z, PLANKS);
      if (d === 2) b.set(x, 0, z, CORNICE(z > x ? 'north' : 'west'));
      if (top < 3) b.set(x, 3, z, 'air');
    }
  return b.build();
}

/**
 * vanilla roof_inner_corner: where the roof turns in (a valley). x runs from one part's inner column (0) out to its
 * eave (2); z from two outside the other part (0) to its wall line (2), its slope rising the other way (south)
 */
function roofInnerCorner(): MansionTemplate {
  const b = new TemplateBuilder('roof_inner_corner', 3, 4, 3);
  const hA = (x: number) => 3 - x, hB = (z: number) => (z === 0 ? -1 : z);
  for (let x = 0; x < 3; x++)
    for (let z = 0; z < 3; z++) {
      const a = hA(x), c = hB(z), top = Math.max(a, c);
      b.set(x, top, z, stair(c > a ? 'south' : 'west'));
      // under the wall lines, solid; under an eave, the cornice
      const wallLine = x === 1 || z === 2;
      if (wallLine) b.fill(x, 0, z, x, top - 1, z, PLANKS);
      else if (x === 2) b.set(x, 0, z, CORNICE('west'));
      if (top < 3) b.set(x, 3, z, 'air');
    }
  return b.build();
}

// ---------------------------------------------------------------------------------------------------------------
// Corridors

/** vanilla corridor_floor: a corridor cell's floor, the middle of its runner, a lantern and its ceiling */
function corridorFloor(): MansionTemplate {
  const b = new TemplateBuilder('corridor_floor', 7, 8, 7);
  b.fill(0, 0, 0, 6, 0, 6, PLANKS).fill(0, 1, 0, 6, 6, 6, 'air').fill(0, 7, 0, 6, 7, 6, PLANKS);
  for (let x = 1; x <= 5; x++) for (let z = 1; z <= 5; z++) b.set(x, 1, z, x === 1 || x === 5 || z === 1 || z === 5 ? EDGE : MID);
  b.set(3, 6, 3, 'lantern[hanging=true]');
  return b.build();
}

/** vanilla carpet_north: the runner from the middle to the cell's north edge */
function carpetNorth(): MansionTemplate {
  const b = new TemplateBuilder('carpet_north', 5, 1, 2);
  for (let x = 0; x < 5; x++) b.fill(x, 0, 0, x, 0, 1, runner(x));
  return b.build();
}

/** vanilla carpet_east: the runner from the middle to the cell's east edge */
function carpetEast(): MansionTemplate {
  const b = new TemplateBuilder('carpet_east', 2, 1, 5);
  for (let z = 0; z < 5; z++) b.fill(0, 0, z, 1, 0, z, runner(z));
  return b.build();
}

/**
 * vanilla carpet_south_1/2: the runner from the middle over the joint to the next cell south, with the joint's floor
 * and ceiling (x 1..7 the cell's width); the ground storey's ceiling has a beam. At either end (x 0 and 8) the
 * joint crosses another: a wall's post is there unless corridors meet all round it, so its floor and ceiling only
 * go into air
 */
function carpetSouth(name: string, beam: boolean): MansionTemplate {
  const b = new TemplateBuilder(name, 9, 8, 3);
  b.fill(1, 0, 2, 7, 0, 2, PLANKS).fill(1, 1, 2, 7, 6, 2, 'air').fill(1, 7, 2, 7, 7, 2, beam ? LOG_X : PLANKS);
  for (const x of [0, 8]) b.soft(x, 0, 2, x, 0, 2, PLANKS).soft(x, 7, 2, x, 7, 2, PLANKS);
  for (let i = 0; i < 5; i++) b.fill(2 + i, 1, 0, 2 + i, 1, 2, runner(i));
  return b.build();
}

/** vanilla carpet_west_1/2: the runner from the middle over the joint to the next cell west (x 0 the joint; z 0 and 8 crossings) */
function carpetWest(name: string, beam: boolean): MansionTemplate {
  const b = new TemplateBuilder(name, 3, 8, 9);
  b.fill(0, 0, 1, 0, 0, 7, PLANKS).fill(0, 1, 1, 0, 6, 7, 'air').fill(0, 7, 1, 0, 7, 7, beam ? LOG_Z : PLANKS);
  for (const z of [0, 8]) b.soft(0, 0, z, 0, 0, z, PLANKS).soft(0, 7, z, 0, 7, z, PLANKS);
  for (let i = 0; i < 5; i++) b.fill(0, 1, 2 + i, 2, 1, 2 + i, runner(i));
  return b.build();
}

// ---------------------------------------------------------------------------------------------------------------
// Inner walls: eight long (the last block the post it shares), the storey's height; the ground storey's panelled
// in dark oak, the upper storeys' with birch above

function indoorsWall(name: string, upper: boolean, door: boolean): MansionTemplate {
  const b = new TemplateBuilder(name, 1, 8, 8);
  b.fill(0, 0, 0, 0, 7, 6, PLANKS).fill(0, 0, 7, 0, 7, 7, LOG_Y);
  if (upper) b.fill(0, 4, 0, 0, 6, 6, 'birch_planks');
  if (door) b.fill(0, 1, 2, 0, 3, 2, LOG_Y).fill(0, 1, 4, 0, 3, 4, LOG_Y).set(0, 3, 3, LOG_Z).fill(0, 1, 3, 0, 2, 3, 'air');
  return b.build();
}

// ---------------------------------------------------------------------------------------------------------------
// The entrance hall (vanilla entrance): the two cells of the start room, both storeys. x 0 is its west wall, 1-7
// the west cell, 8 the joint, 9-15 the east cell, 16 the front wall with the doorway, 17 the wall's outside, 18-21
// the porch; z 0-14 inside, 15 the south wall (open where the corridor runs on south). Up from the hall a flight
// to a landing and two flights back to the gallery, where the corridor crosses on the upper storey.

function entrance(): MansionTemplate {
  const b = new TemplateBuilder('entrance', 22, 16, 16);
  // shell: floor, the gallery (and the ceiling under it), the ceiling, air inside
  b.fill(1, 0, 0, 15, 0, 14, PLANKS).fill(1, 1, 0, 15, 14, 14, 'air').fill(1, 15, 0, 15, 15, 14, PLANKS);
  b.fill(9, 7, 0, 15, 7, 14, PLANKS).fill(8, 8, 0, 15, 8, 14, PLANKS);
  // the west wall (an inner wall, both storeys) and the south wall's west part
  b.fill(0, 0, 0, 0, 15, 15, PLANKS).fill(0, 0, 7, 0, 15, 7, LOG_Y).fill(0, 0, 15, 0, 15, 15, LOG_Y);
  b.fill(1, 0, 15, 8, 15, 15, PLANKS).fill(8, 0, 15, 8, 15, 15, LOG_Y);
  b.fill(1, 11, 15, 7, 13, 15, 'birch_planks');
  b.fill(0, 11, 1, 0, 13, 6, 'birch_planks').fill(0, 11, 8, 0, 13, 14, 'birch_planks');
  // where the corridor runs on south: floor, runner, ceiling on each storey
  b.fill(9, 0, 15, 15, 0, 15, PLANKS).fill(9, 1, 15, 15, 6, 15, 'air').fill(9, 7, 15, 15, 7, 15, LOG_X);
  b.fill(9, 8, 15, 15, 8, 15, PLANKS).fill(9, 9, 15, 15, 14, 15, 'air').fill(9, 15, 15, 15, 15, 15, PLANKS);
  for (let i = 0; i < 5; i++) {
    b.fill(10 + i, 1, 0, 10 + i, 1, 15, runner(i));
    b.fill(10 + i, 9, 0, 10 + i, 9, 15, runner(i));
  }
  // the front wall: cobblestone course, the doorway (three wide), windows each side; above, the band and windows
  b.fill(16, 0, 0, 16, 0, 14, COBBLE).fill(16, 1, 0, 16, 7, 14, PLANKS).fill(16, 1, 6, 16, 3, 8, 'air');
  b.fill(16, 2, 2, 16, 3, 4, PANE).fill(16, 2, 10, 16, 3, 12, PANE);
  b.fill(16, 8, 0, 17, 8, 14, LOG_Z).fill(16, 9, 0, 16, 15, 14, PLANKS);
  for (const z of [1, 4, 9, 12]) b.fill(16, 10, z, 16, 12, z + 1, PANE).fill(17, 9, z, 17, 9, z + 1, SILL);
  b.fill(16, 0, 15, 17, 0, 15, COBBLE).fill(16, 1, 15, 17, 15, 15, LOG_Y);
  b.fill(17, 0, 0, 17, 0, 14, COBBLE).fill(17, 1, 2, 17, 1, 4, SILL).fill(17, 1, 10, 17, 1, 12, SILL);
  // the doorway's frame, and a runner from it to the stairs
  b.fill(16, 1, 5, 17, 4, 5, LOG_Y).fill(16, 1, 9, 17, 4, 9, LOG_Y).fill(16, 4, 5, 17, 4, 9, LOG_Z);
  for (let x = 8; x <= 15; x++) for (let i = 0; i < 5; i++) b.set(x, 1, 5 + i, runner(i));
  b.fill(16, 1, 6, 16, 1, 8, MID);
  // the porch: a cobblestone step, fence posts and a slab roof over the door
  b.fill(18, 0, 4, 20, 0, 10, COBBLE).fill(21, 0, 5, 21, 0, 9, 'cobblestone_stairs[facing=west,half=bottom]');
  b.fill(20, 1, 4, 20, 3, 4, 'dark_oak_fence').fill(20, 1, 10, 20, 3, 10, 'dark_oak_fence');
  b.fill(18, 4, 4, 20, 4, 10, 'dark_oak_slab[type=bottom]').fill(18, 4, 5, 20, 4, 9, 'dark_oak_slab[type=top]');
  // the grand staircase: a flight up west from the hall to a landing along the west wall, and two back up east
  // along the north and south walls to the gallery
  for (let i = 0; i < 4; i++) {
    const x = 7 - i, y = 1 + i;
    b.fill(x, y, 5, x, y, 9, stair('west'));
    if (y > 1) b.fill(x, 1, 5, x, y - 1, 9, PLANKS);
  }
  b.fill(1, 1, 0, 3, 4, 14, PLANKS);
  for (let i = 0; i < 4; i++) {
    const x = 4 + i, y = 5 + i;
    for (const [z0, z1] of [[0, 1], [13, 14]]) b.fill(x, 1, z0, x, y - 1, z1, PLANKS).fill(x, y, z0, x, y, z1, stair('east'));
  }
  // rails: round the landing's edge, along the gallery over the stairwell
  b.fill(4, 5, 2, 4, 5, 4, 'dark_oak_fence').fill(4, 5, 10, 4, 5, 12, 'dark_oak_fence');
  b.fill(1, 5, 2, 1, 5, 12, 'dark_oak_fence');
  b.fill(8, 9, 2, 8, 9, 12, 'dark_oak_fence');
  // lanterns: three hanging over the stairwell, two under the gallery, two over it, one over the porch
  for (const z of [3, 7, 11]) b.fill(4, 12, z, 4, 14, z, 'dark_oak_fence').set(4, 11, z, 'lantern[hanging=true]');
  for (const z of [3, 11]) b.set(12, 6, z, 'lantern[hanging=true]').set(12, 14, z, 'lantern[hanging=true]');
  b.set(19, 3, 7, 'lantern[hanging=true]');
  // potted plants on the landing, a vindicator standing guard in the hall
  b.set(2, 5, 0, 'potted_dark_oak_sapling').set(2, 5, 14, 'potted_dark_oak_sapling').set(1, 5, 7, 'potted_red_tulip');
  b.marker(12, 1, 7, 'Warrior');
  return b.build();
}

// ---------------------------------------------------------------------------------------------------------------
// The registry

const PARTS: Record<string, () => MansionTemplate> = {
  entrance,
  wall_flat: wallFlat,
  wall_window: wallWindow,
  wall_corner: wallCorner,
  small_wall: smallWall,
  small_wall_corner: smallWallCorner,
  roof,
  roof_front: roofFront,
  roof_corner: roofCorner,
  roof_inner_corner: roofInnerCorner,
  corridor_floor: corridorFloor,
  carpet_north: carpetNorth,
  carpet_east: carpetEast,
  carpet_south_1: () => carpetSouth('carpet_south_1', true),
  carpet_south_2: () => carpetSouth('carpet_south_2', false),
  carpet_west_1: () => carpetWest('carpet_west_1', true),
  carpet_west_2: () => carpetWest('carpet_west_2', false),
  indoors_wall_1: () => indoorsWall('indoors_wall_1', false, false),
  indoors_wall_2: () => indoorsWall('indoors_wall_2', true, false),
  indoors_door_1: () => indoorsWall('indoors_door_1', false, true),
  indoors_door_2: () => indoorsWall('indoors_door_2', true, true),
};

const built = new Map<string, MansionTemplate>();

/** every template's name */
export function mansionTemplateNames(): string[] {
  return [...Object.keys(PARTS), ...Object.keys(ROOMS)];
}

/** a template by vanilla's name (made the first time it's wanted) */
export function mansionTemplate(name: string): MansionTemplate {
  let t = built.get(name);
  if (t) return t;
  const make = PARTS[name] ?? ROOMS[name];
  if (!make) throw new Error(`no woodland mansion template ${name}`);
  t = make();
  built.set(name, t);
  return t;
}
