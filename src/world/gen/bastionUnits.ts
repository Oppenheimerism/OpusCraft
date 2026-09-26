// (bastions) The housing units (vanilla bastion/units/*, BastionHousingUnitsPools; the names are vanilla's, the
// pieces this game's own). The start, bastion/units/air_base, is nothing but room: 48 x 48 and 44 high, holding the
// rest in their places. A square of walls runs round it (units/walls/wall_bases: 14 high, a gate in the middle of
// each side) with ramparts on top (units/ramparts). Inside, a grid of three by three: in each corner a tower of
// stacked units (units/stages/stage_0 to stage_3: a room each, a stair up the inside, their doors onto the pathways
// and, at the ramparts' level, onto the ramparts; now and then the first floor has fallen in, units/stages/rot), on
// each side a pathway between two towers (units/pathways: bridges from tower to tower at the first and second floor,
// or a wall with a passage through it), and in the middle a courtyard (units/center_pieces). Everything goes through
// vanilla's housing processor (cracked bricks, the odd block gone, gilded blackstone traded for plain), and holds
// piglins, now and then a brute, a few blocks of gold and chests of bastion_other loot.

import {
  BastionGrid, element, bastionPool, seat, masonry, doorway, pillar, floor, h, stairs, slab, type Seatable,
  PBB, CPBB, PB, CPB, BS, GOLD, LAVA, AIR, CHAIN, PBB_WALL, BS_WALL, PB_WALL, PBB_, BS_, PB_,
} from './bastionPieces';
import type { PoolElement } from './jigsaw';

/** the connectors' names */
const J = {
  center: 'bastion:units_center',
  pathway: 'bastion:units_pathway',
  stage: 'bastion:units_stage',
  wall: 'bastion:units_wall',
  rampart: 'bastion:units_rampart',
};

/** the whole: 48 x 48, 44 high; the walls 4 thick and 14 high, a unit 13 x 13 and a stage 7 high, the pathways 14 x 13 */
const SIZE = 48, HEIGHT = 44, WALL_T = 4, WALL_L = 44, WALL_H = 14, U = 13, SH = 7, PW = 14, PD = 13, C = 14;

const STAGE0: Seatable = { sx: U, sz: U, jx: 6, jy: 1, jz: 6 };
const STAGE: Seatable = { sx: U, sz: U, jx: 6, jy: 0, jz: 6 };
const PATHWAY: Seatable = { sx: PW, sz: PD, jx: 7, jy: 1, jz: 6 };
const CENTER: Seatable = { sx: C, sz: C, jx: 7, jy: 1, jz: 7 };
const WALL: Seatable = { sx: WALL_L, sz: WALL_T, jx: 21, jy: 1, jz: 1 };
const RAMPART: Seatable = { sx: WALL_L, sz: WALL_T, jx: 21, jy: 0, jz: 2 };

// ---------------------------------------------------------------------------------------------------------------
// The start

/**
 * vanilla bastion/units/air_base: room for the rest and nothing else (structure void). The walls go round in a
 * pinwheel, each 44 long; the towers stand in the corners of the 40 x 40 inside, the pathways between them and the
 * courtyard in the middle, every one turned to face out
 */
function airBase(): PoolElement {
  const g = new BastionGrid(SIZE, HEIGHT, SIZE);
  seat(g, 0, 0, 0, 0, WALL, J.wall, 'bastion/units/walls/wall_bases');
  seat(g, SIZE - WALL_T, 0, 0, 1, WALL, J.wall, 'bastion/units/walls/wall_bases');
  seat(g, WALL_T, 0, SIZE - WALL_T, 2, WALL, J.wall, 'bastion/units/walls/wall_bases');
  seat(g, 0, 0, WALL_T, 3, WALL, J.wall, 'bastion/units/walls/wall_bases');
  const a = WALL_T, b = WALL_T + U, c = WALL_T + U + PW;
  seat(g, a, 0, a, 0, STAGE0, J.stage, 'bastion/units/stages/stage_0');
  seat(g, c, 0, a, 1, STAGE0, J.stage, 'bastion/units/stages/stage_0');
  seat(g, c, 0, c, 2, STAGE0, J.stage, 'bastion/units/stages/stage_0');
  seat(g, a, 0, c, 3, STAGE0, J.stage, 'bastion/units/stages/stage_0');
  seat(g, b, 0, a, 0, PATHWAY, J.pathway, 'bastion/units/pathways');
  seat(g, c, 0, b, 1, PATHWAY, J.pathway, 'bastion/units/pathways');
  seat(g, b, 0, c, 2, PATHWAY, J.pathway, 'bastion/units/pathways');
  seat(g, a, 0, b, 3, PATHWAY, J.pathway, 'bastion/units/pathways');
  seat(g, b, 0, b, 0, CENTER, J.center, 'bastion/units/center_pieces');
  return element(g, 'bastion/units/air_base', 'bastion_generic_degradation');
}

// ---------------------------------------------------------------------------------------------------------------
// The stages: a unit's rooms, one over another

type Side = 'north' | 'south' | 'west' | 'east';
type StageDecor = (g: BastionGrid) => void;

/**
 * a stage of a unit: 13 x 13, its floor at y 0, walls to y 6 (the next stage's floor over them). Its outer sides
 * are north and west (on the walls), the pathways east and south. The stair climbs the west side northwards from
 * z 11 (x 1-2), coming up through the next floor at z 6-8. `doors`: the sides with a doorway in the middle (the
 * outer ones, onto the ramparts, nearer the north-west corner); the others have two windows each
 */
function stageShell(level: number, doors: Side[], stair: boolean, top: boolean): BastionGrid {
  const H = top ? SH + 3 : SH;
  const g = new BastionGrid(U, H, U);
  g.fill(1, 1, 1, U - 2, SH - 1, U - 2, AIR);
  floor(g, 0, 0, U - 1, U - 1, 0);
  // (the stair from the stage below)
  if (level > 0) g.fill(1, 0, 6, 2, 0, 8, AIR);
  masonry(g, 0, 1, 0, U - 1, SH - 1, 0);
  masonry(g, 0, 1, U - 1, U - 1, SH - 1, U - 1);
  masonry(g, 0, 1, 1, 0, SH - 1, U - 2, false);
  masonry(g, U - 1, 1, 1, U - 1, SH - 1, U - 2, false);
  for (const [x, z] of [[0, 0], [U - 1, 0], [0, U - 1], [U - 1, U - 1]]) g.fill(x, 1, z, x, SH - 1, z, (_x, y) => (y === SH - 1 ? CPB : PB));
  for (const side of ['north', 'south', 'west', 'east'] as Side[]) {
    const outer = side === 'north' || side === 'west';
    if (doors.includes(side)) {
      const at = outer ? 2 : 5;
      if (side === 'north') doorway(g, at, 1, 0, 3, 4, 1, true);
      else if (side === 'south') doorway(g, at, 1, U - 1, 3, 4, 1, true);
      else if (side === 'west') doorway(g, 0, 1, at - 1, 3, 4, 1, false);
      else doorway(g, U - 1, 1, at, 3, 4, 1, false);
      continue;
    }
    for (const w of [2, 9]) {
      const [x0, z0, x1, z1] = side === 'north' ? [w, 0, w + 1, 0] : side === 'south' ? [w, U - 1, w + 1, U - 1] : side === 'west' ? [0, w, 0, w + 1] : [U - 1, w, U - 1, w + 1];
      g.fill(x0, 2, z0, x1, 3, z1, AIR);
      g.fill(x0, 2, z0, x1, 2, z1, PB_WALL);
    }
  }
  if (stair) {
    for (let i = 0; i < 6; i++)
      for (const x of [1, 2]) {
        g.set(x, 1 + i, 11 - i, stairs(x === 1 ? PB_ : PBB_, 'north'));
        g.fill(x, 1, 11 - i, x, i, 11 - i, PBB);
      }
  }
  if (top) {
    // the roof, the stair's hole in it, a parapet of merlons, the roof's piglin and gold
    floor(g, 0, 0, U - 1, U - 1, SH);
    g.fill(1, SH, 6, 2, SH, 8, AIR);
    for (let x = 0; x < U; x++)
      for (let z = 0; z < U; z++) {
        const edge = x === 0 || z === 0 || x === U - 1 || z === U - 1;
        if (!edge) continue;
        const merlon = (x + z) % 3 !== 1;
        g.set(x, SH + 1, z, merlon ? PBB : PBB_WALL);
        if (merlon) g.set(x, SH + 2, z, h(x, 0, z, 60) < 0.25 ? slab(PBB_) : PBB);
      }
  }
  return g;
}

/** the next stage's connector (over the middle) and this one's own */
function stageJoints(g: BastionGrid, level: number, up: string | null): void {
  if (up) g.connect(6, SH - 1, 6, 'up', { target: J.stage, pool: up, top: 'north', joint: 'aligned' });
  g.connect(6, level === 0 ? 1 : 0, 6, 'down', { name: J.stage, top: 'north', joint: 'aligned' });
}

/** the doors each stage has: onto the pathways (ground, first and second floor) and the ramparts (the second) */
const STAGE_DOORS: Side[][] = [['east', 'south'], ['east', 'south'], ['north', 'west', 'east', 'south'], []];

function stage(level: number, n: number, decor: StageDecor, up: string | null): PoolElement {
  const top = level === 3;
  const g = stageShell(level, STAGE_DOORS[level], true, top);
  decor(g);
  stageJoints(g, level, up);
  return element(g, `bastion/units/stages/stage_${level}_${n}`, 'housing');
}

/** vanilla bastion/units/stages/rot/stage_1_0: a first floor fallen in, open to the sky, rubble and gold on its floor */
function rotStage(): PoolElement {
  const g = stageShell(1, STAGE_DOORS[1], false, false);
  // the walls broken down from the top, deeper in places
  for (let x = 0; x < U; x++)
    for (let z = 0; z < U; z++) {
      const edge = x === 0 || z === 0 || x === U - 1 || z === U - 1;
      if (!edge) continue;
      const keep = 2 + Math.floor(h(x, 1, z, 61) * 5);
      for (let y = keep; y < SH; y++) g.set(x, y, z, AIR);
    }
  // rubble on the floor
  for (let x = 1; x < U - 1; x++)
    for (let z = 1; z < U - 1; z++) {
      const r = h(x, 2, z, 62);
      if (r < 0.12) g.set(x, 1, z, r < 0.04 ? slab(BS_) : r < 0.08 ? BS : CPBB);
    }
  g.set(9, 1, 3, GOLD);
  g.mob(5, 0, 5, 'piglin').gold(9, 0, 9);
  stageJoints(g, 1, null);
  return element(g, 'bastion/units/stages/rot/stage_1_0', 'housing');
}

/** a heap of gold and blackstone in a corner */
function goldHeap(g: BastionGrid, x0: number, z0: number, dx: number, dz: number): void {
  g.set(x0, 1, z0, GOLD).set(x0 + dx, 1, z0, GOLD).set(x0, 1, z0 + dz, BS).set(x0 + dx, 1, z0 + dz, slab(BS_));
  g.set(x0, 2, z0, GOLD).set(x0 + dx, 2, z0, slab(BS_));
}

const S0 = 'bastion/units/stages/stage_1', ROT = 'bastion/units/stages/rot/stage_1', S1 = 'bastion/units/stages/stage_2', S2 = 'bastion/units/stages/stage_3';

const STAGE_0 = [
  stage(0, 0, (g) => {
    g.set(11, 1, 1, GOLD).chest(11, 1, 11, 'north', 'bastion_other');
    g.mob(8, 0, 9, 'piglin').gold(4, 0, 10);
  }, S0),
  stage(0, 1, (g) => {
    g.chest(11, 1, 1, 'south', 'bastion_other');
    g.mob(7, 0, 5, 'piglin').mob(5, 0, 9, 'piglin_melee');
  }, S0),
  stage(0, 2, (g) => {
    // a low wall across the room, a gap in it, gold behind
    for (let x = 4; x <= 11; x++) if (x !== 7 && x !== 8) g.set(x, 1, 4, x % 2 === 0 ? PB_WALL : PBB);
    goldHeap(g, 10, 1, -1, 1);
    g.mob(7, 0, 8, 'piglin').gold(5, 0, 2);
  }, S0),
  stage(0, 3, (g) => {
    // chains hanging from the floor above, a slab bench, and the floor over it fallen in
    g.set(6, SH - 1, 3, CHAIN).set(6, SH - 2, 3, CHAIN).set(9, SH - 1, 9, CHAIN);
    for (let x = 4; x <= 8; x++) g.set(x, 1, 11, slab(PBB_));
    g.mob(7, 0, 6, 'piglin').gold(10, 0, 2);
  }, ROT),
];

const STAGE_1 = [
  stage(1, 0, (g) => {
    g.mob(9, 0, 9, 'piglin').gold(9, 0, 3);
  }, S1),
  stage(1, 1, (g) => {
    g.chest(11, 1, 11, 'north', 'bastion_other');
    g.set(10, 1, 11, slab(BS_)).set(11, 1, 10, slab(BS_));
    g.mob(6, 0, 4, 'piglin');
  }, S1),
  stage(1, 2, (g) => {
    goldHeap(g, 11, 1, -1, 1);
    g.mob(7, 0, 7, 'piglin_melee').gold(4, 0, 3);
  }, S1),
  stage(1, 3, (g) => {
    // a pillar in the middle of the room
    g.fill(6, 1, 6, 6, SH - 1, 6, (_x, y) => (y === 1 || y === SH - 1 ? CPB : PB));
    g.mob(8, 0, 3, 'piglin').gold(10, 0, 10);
  }, S1),
];

const STAGE_2 = [
  stage(2, 0, (g) => {
    g.mob(8, 0, 9, 'piglin').gold(10, 0, 2);
  }, S2),
  stage(2, 1, (g) => {
    g.chest(11, 1, 1, 'south', 'bastion_other');
    g.set(10, 1, 1, slab(PBB_, 'top'));
    g.mob(6, 0, 8, 'piglin');
  }, S2),
];

const STAGE_3 = [
  stage(3, 0, (g) => {
    g.mob(8, SH, 9, 'piglin').gold(4, SH, 3).gold(10, SH, 10);
  }, null),
  stage(3, 1, (g) => {
    g.chest(11, 1, 11, 'north', 'bastion_other');
    g.mob(6, 0, 4, 'piglin');
    g.gold(9, SH, 3);
  }, null),
  stage(3, 2, (g) => {
    // half the roof fallen in
    for (let x = 6; x < U; x++)
      for (let z = 5; z < U; z++) {
        if (h(x, 3, z, 63) < 0.25 + (x - 6) * 0.1) {
          g.set(x, SH, z, AIR);
          if (x > 0 && z > 0 && x < U - 1 && z < U - 1) continue;
          g.set(x, SH + 1, z, AIR).set(x, SH + 2, z, AIR);
        }
      }
    g.set(9, 1, 9, CPBB).set(10, 1, 9, slab(BS_)).set(9, 1, 10, GOLD);
    g.mob(5, 0, 5, 'piglin');
  }, null),
  stage(3, 3, (g) => {
    // a crown of gold and chiseled blackstone on the roof
    for (const [x, z] of [[3, 3], [9, 3], [3, 9], [9, 9]]) g.set(x, SH + 1, z, CPB).set(x, SH + 2, z, GOLD);
    g.mob(6, SH, 5, 'piglin');
  }, null),
];

// ---------------------------------------------------------------------------------------------------------------
// The pathways between the towers

/** a pathway's floor, its air and the posts at its corners; the ground runs from the courtyard (south) to the gate */
function pathwayShell(): BastionGrid {
  const g = new BastionGrid(PW, 3 * SH, PD);
  g.fill(0, 1, 0, PW - 1, 3 * SH - 1, PD - 1, AIR);
  floor(g, 0, 0, PW - 1, PD - 1, 0, BS);
  return g;
}

/** a bridge from tower to tower across the pathway, 3 wide (z 5-7), its deck at y; its railing, a spur north at the top */
function bridgeDeck(g: BastionGrid, y: number, spur: boolean): void {
  for (let x = 0; x < PW; x++) {
    for (let z = 5; z <= 7; z++) g.set(x, y, z, z === 6 ? PBB : h(x, y, z, 64) < 0.3 ? BS : PB);
    g.set(x, y - 1, 5, slab(PBB_, 'top')).set(x, y - 1, 7, slab(PBB_, 'top'));
    if (x > 0 && x < PW - 1) {
      if (!(spur && x >= 5 && x <= 8)) g.set(x, y + 1, 4, x % 2 ? BS_WALL : AIR);
      g.set(x, y + 1, 8, x % 2 ? BS_WALL : AIR);
    }
  }
  if (spur)
    for (let z = 0; z <= 4; z++)
      for (let x = 5; x <= 8; x++) {
        g.set(x, y, z, x === 5 || x === 8 ? PBB : BS);
        if (x === 5 || x === 8) g.set(x, y - 1, z, slab(PBB_, 'top'));
      }
}

/** vanilla bastion/units/pathways/pathway_0: two bridges, posts under them */
function pathway(): PoolElement {
  const g = pathwayShell();
  for (const [x, z] of [[3, 4], [10, 4], [3, 8], [10, 8]]) pillar(g, x, 1, 2 * SH - 1, z);
  bridgeDeck(g, SH, false);
  bridgeDeck(g, 2 * SH, true);
  // hanging chains from the upper bridge
  g.set(1, 2 * SH - 2, 6, CHAIN).set(12, 2 * SH - 2, 6, CHAIN).set(12, 2 * SH - 3, 6, CHAIN);
  g.mob(11, 2 * SH, 6, 'piglin');
  g.gold(1, 0, 1).gold(12, 0, 11);
  g.connect(7, 1, 6, 'down', { name: J.pathway, top: 'north', joint: 'aligned' });
  return element(g, 'bastion/units/pathways/pathway_0', 'housing');
}

/** vanilla bastion/units/pathways/pathway_wall_0: a wall across, an arch through it, a passage inside and a walk on top */
function pathwayWall(): PoolElement {
  const g = pathwayShell();
  masonry(g, 0, 1, 4, PW - 1, 2 * SH - 1, 8);
  doorway(g, 4, 1, 4, 6, 6, 5, true);
  // the passage from tower to tower at the first floor
  g.fill(0, SH + 1, 5, PW - 1, SH + 4, 7, AIR);
  g.fill(0, SH, 5, PW - 1, SH, 7, (x, y, z) => (z === 6 ? PBB : h(x, y, z, 65) < 0.3 ? BS : PB));
  for (let x = 2; x < PW - 2; x += 4) g.set(x, SH + 2, 4, AIR).set(x, SH + 2, 8, AIR);
  // the walk on top and its merlons
  for (let x = 0; x < PW; x++) {
    for (let z = 4; z <= 8; z++) g.set(x, 2 * SH, z, h(x, 1, z, 66) < 0.3 ? BS : PBB);
    if (x > 0 && x < PW - 1) {
      if (x < 5 || x > 8) g.set(x, 2 * SH + 1, 4, x % 3 === 1 ? PBB_WALL : PBB);
      g.set(x, 2 * SH + 1, 8, x % 3 === 1 ? PBB_WALL : PBB);
    }
  }
  for (let z = 0; z < 4; z++) for (let x = 5; x <= 8; x++) g.set(x, 2 * SH, z, x === 5 || x === 8 ? PBB : BS);
  g.mob(3, SH, 6, 'piglin');
  g.gold(11, 0, 1).gold(10, 2 * SH, 6);
  g.connect(7, 1, 6, 'down', { name: J.pathway, top: 'north', joint: 'aligned' });
  return element(g, 'bastion/units/pathways/pathway_wall_0', 'housing');
}

// ---------------------------------------------------------------------------------------------------------------
// The courtyard

function courtyard(n: number): PoolElement {
  const g = new BastionGrid(C, 9, C);
  g.fill(0, 1, 0, C - 1, 8, C - 1, AIR);
  floor(g, 0, 0, C - 1, C - 1, 0);
  if (n === 0) {
    // a dais, a pillar of gold on it capped with chiseled blackstone
    g.fill(4, 1, 4, 9, 1, 9, (x, _y, z) => (x === 4 || z === 4 || x === 9 || z === 9 ? stairs(PB_, x === 4 ? 'east' : x === 9 ? 'west' : z === 4 ? 'south' : 'north') : PB));
    for (const [x, z] of [[4, 4], [9, 4], [4, 9], [9, 9]]) g.set(x, 1, z, PB);
    g.fill(6, 2, 6, 7, 3, 7, GOLD).fill(6, 4, 6, 7, 4, 7, CPB);
    g.mob(2, 0, 2, 'piglin').mob(11, 0, 2, 'piglin_melee');
    g.gold(2, 0, 11);
  } else if (n === 1) {
    // a pool of lava sunk in the floor behind a fence, a chest by it
    g.fill(5, 0, 5, 8, 0, 8, LAVA);
    for (let i = 4; i <= 9; i++)
      for (const [x, z] of [[i, 4], [i, 9], [4, i], [9, i]]) {
        g.set(x, 0, z, CPB);
        g.set(x, 1, z, (x + z) % 2 === 0 ? PB_WALL : slab(PB_));
      }
    g.chest(6, 1, 11, 'north', 'bastion_other');
    g.mob(2, 0, 3, 'piglin').mob(11, 0, 10, 'piglin');
    g.gold(11, 0, 2);
  } else {
    // a ring of gold blocks and walls round a raised floor
    g.fill(3, 1, 3, 10, 1, 10, (x, _y, z) => (x === 3 || z === 3 || x === 10 || z === 10 ? slab(BS_) : BS));
    g.fill(5, 2, 5, 8, 2, 8, (x, _y, z) => (x === 5 || z === 5 || x === 8 || z === 8 ? slab(PBB_) : PBB));
    for (const [x, z] of [[3, 3], [10, 3], [3, 10], [10, 10]]) g.set(x, 1, z, GOLD).set(x, 2, z, PBB_WALL);
    g.mob(6, 2, 6, 'piglin_melee').mob(1, 0, 7, 'piglin');
    g.gold(1, 0, 1).gold(12, 0, 12);
  }
  g.connect(7, 1, 7, 'down', { name: J.center, top: 'north', joint: 'aligned' });
  return element(g, `bastion/units/center_pieces/center_${n}`, 'housing');
}

// ---------------------------------------------------------------------------------------------------------------
// The walls and the ramparts

/**
 * a wall along x, 44 long and 4 thick, its outer face north (z 0): courses of bricks on a blackstone footing,
 * pilasters of polished blackstone, a band under the top; the gate in the middle, opposite the pathway
 */
function wall(connected: boolean): PoolElement {
  const g = new BastionGrid(WALL_L, WALL_H, WALL_T);
  masonry(g, 0, 0, 0, WALL_L - 1, WALL_H - 1, WALL_T - 1);
  for (let x = 0; x < WALL_L; x += 6) g.fill(x, 2, 0, x, WALL_H - 2, 0, (_x, y) => (y % 5 === 4 ? CPB : PB));
  for (let x = 0; x < WALL_L; x++) g.set(x, WALL_H - 2, 0, (x & 3) === 2 ? CPB : PB);
  if (connected) {
    // the great gate, and loopholes either side of it
    doorway(g, 21, 1, 0, 6, 8, WALL_T, true);
    g.set(21, 9, 0, CPB).set(26, 9, 0, CPB).set(23, 9, 0, GOLD);
    for (const x of [15, 32]) g.fill(x, 5, 0, x, 7, WALL_T - 1, AIR).set(x, 5, 0, PBB_WALL);
  } else {
    doorway(g, 22, 1, 0, 4, 6, WALL_T, true);
    g.set(22, 7, 0, CPB).set(25, 7, 0, CPB);
  }
  g.connect(21, WALL_H - 1, 2, 'up', { target: J.rampart, pool: 'bastion/units/ramparts', top: 'north', joint: 'aligned' });
  g.connect(21, 1, 1, 'down', { name: J.wall, top: 'north', joint: 'aligned' });
  return element(g, connected ? 'bastion/units/walls/connected_wall' : 'bastion/units/walls/wall_base', 'housing');
}

/** a rampart on a wall: the walkway (level with the towers' second floors), merlons on the outer side */
function rampart(n: number): PoolElement {
  const g = new BastionGrid(WALL_L, 3, WALL_T);
  for (let x = 0; x < WALL_L; x++) {
    for (let z = 0; z < WALL_T; z++) g.set(x, 0, z, z === 0 ? PBB : h(x, 0, z, 67) < 0.35 ? BS : PBB);
    const merlon = x % 4 < 2;
    g.set(x, 1, 0, merlon ? PBB : BS_WALL);
    if (merlon) g.set(x, 2, 0, h(x, 1, 0, 68) < 0.2 ? slab(PBB_) : PBB);
  }
  if (n === 1) {
    // a stretch of the parapet fallen, its bricks lying on the walkway
    g.fill(8, 1, 0, 15, 2, 0, AIR);
    g.set(9, 1, 1, CPBB).set(12, 1, 2, slab(PBB_)).set(14, 1, 1, CPBB);
  } else if (n === 2) {
    // a covered lookout over the gate
    g.fill(19, 1, 0, 28, 2, 0, (x) => (x === 19 || x === 28 ? PBB : x % 2 ? PBB_WALL : AIR));
    for (let x = 19; x <= 28; x++) g.set(x, 2, 1, slab(PB_, 'top')).set(x, 2, 2, slab(PB_, 'top'));
    g.chest(20, 1, 1, 'east', 'bastion_other');
  }
  g.mob(33, 0, 2, 'piglin');
  g.gold(5, 0, 2).gold(38, 0, 1);
  g.connect(21, 0, 2, 'down', { name: J.rampart, top: 'north', joint: 'aligned' });
  return element(g, `bastion/units/ramparts/ramparts_${n}`, 'housing');
}

// ---------------------------------------------------------------------------------------------------------------
// The pools (vanilla BastionHousingUnitsPools)

export const UNITS_START = airBase();

bastionPool('bastion/units/center_pieces', [[courtyard(0), 1], [courtyard(1), 1], [courtyard(2), 1]]);
bastionPool('bastion/units/pathways', [[pathway(), 1], [pathwayWall(), 1]]);
bastionPool('bastion/units/walls/wall_bases', [[wall(false), 1], [wall(true), 1]]);
bastionPool('bastion/units/stages/stage_0', STAGE_0.map((e) => [e, 1]));
bastionPool('bastion/units/stages/stage_1', STAGE_1.map((e) => [e, 1]));
bastionPool('bastion/units/stages/rot/stage_1', [[rotStage(), 1]]);
bastionPool('bastion/units/stages/stage_2', STAGE_2.map((e) => [e, 1]));
bastionPool('bastion/units/stages/stage_3', STAGE_3.map((e) => [e, 1]));
bastionPool('bastion/units/ramparts', [[rampart(0), 1], [rampart(1), 1], [rampart(2), 1]]);
