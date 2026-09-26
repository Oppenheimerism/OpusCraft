// (bastions) The treasure room (vanilla bastion/treasure/*, BastionTreasureRoomPools; the names are vanilla's, the
// pieces this game's own). The start is a great hall hollowed out of the rock (bastion/treasure/big_air_full, 32 x 32
// and 33 high), walled in on four sides (treasure/walls: solid, windowed, or with the gate) with a tower at each
// corner (treasure/corners, a chest in the turret). In the middle of the hall stands the base (treasure/bases/
// lava_basin): a moat of lava round a great block of bricks eleven high, its four arms reaching out at the top towards
// galleries cut into the walls (treasure/bridges, some of them fallen), stairs (treasure/stairs) climbing from the
// floor to the galleries. Inside the block, behind barred windows, the brain (treasure/brains/center_brain): a heap of
// magma and gold with two magma cube spawners. On top, the centre (treasure/bases/centers): gold, and the treasure
// chest (chests/bastion_treasure). Platforms stand out from the walls at the galleries' level (treasure/extensions:
// pools of lava, a hut with a chest). Piglin brutes guard the centre, piglins the hall, the galleries and the towers.

import {
  BastionGrid, element, bastionPool, wallX, floor, h, stairs, slab, EMPTY,
  PBB, CPBB, PB, CPB, BS, GOLD, BASALT, PBASALT, MAGMA, LAVA, AIR, CHAIN, PBB_WALL, BS_WALL, PBB_, BS_, PB_,
} from './bastionPieces';
import type { PoolElement } from './jigsaw';

/** the connectors' names */
const T = {
  wall: 'bastion:treasure_wall',
  corner: 'bastion:treasure_corner',
  base: 'bastion:treasure_base',
  center: 'bastion:treasure_center',
  brain: 'bastion:treasure_brain',
  stairs: 'bastion:treasure_stairs',
  bridge: 'bastion:treasure_bridge',
  extension: 'bastion:treasure_extension',
};

/** the hall: 32 x 32 inside, the floor at y 0 */
const HALL = 32, HALL_H = 34;
/** the walls: 6 thick, 36 high; the galleries' floor at y 12, the rampart's walkway at y 32 */
const WALL_T = 6, WALL_H = 36, GALLERY = 12, WALK = 32;

// ---------------------------------------------------------------------------------------------------------------
// The hall (the start)

function hall(): PoolElement {
  const g = new BastionGrid(HALL, HALL_H, HALL);
  g.fill(0, 1, 0, HALL - 1, HALL_H - 1, HALL - 1, AIR);
  floor(g, 0, 0, HALL - 1, HALL - 1, 0);
  // the base in the middle, its turn the hall's
  g.connect(16, 0, 16, 'up', { target: T.base, pool: 'bastion/treasure/bases', top: 'north', joint: 'aligned' });
  // the four walls round it
  g.connect(16, 0, 0, 'north', { target: T.wall, pool: 'bastion/treasure/walls' });
  g.connect(31, 0, 16, 'east', { target: T.wall, pool: 'bastion/treasure/walls' });
  g.connect(15, 0, 31, 'south', { target: T.wall, pool: 'bastion/treasure/walls' });
  g.connect(0, 0, 15, 'west', { target: T.wall, pool: 'bastion/treasure/walls' });
  // piglins about the floor, clear of the stairs and the bridges
  for (const [x, z] of [[2, 8], [29, 23], [8, 29], [23, 2]]) g.mob(x, 0, z, 'piglin');
  return element(g, 'bastion/treasure/big_air_full', 'bastion_generic_degradation');
}

// ---------------------------------------------------------------------------------------------------------------
// The walls and the corner towers

type WallKind = 'plain' | 'windows' | 'entrance';

/**
 * a wall of the hall, along x, its outer face z 0 and its inner face z 5 (on the hall's side). A gallery is cut into
 * its inner half at y 13-16, opening onto the hall between pillars; the rampart walks along its top
 */
function wall(kind: WallKind, id: string): PoolElement {
  const g = new BastionGrid(HALL, WALL_H, WALL_T);
  wallX(g, 0, HALL - 1, 0, WALK - 1, 0, WALL_T - 1);
  // bands of chiseled and polished blackstone along the outer face
  for (let x = 0; x < HALL; x++) {
    g.set(x, GALLERY - 1, 0, (x & 3) === 2 ? CPB : PB);
    g.set(x, WALK - 1, 0, (x & 3) === 0 ? CPB : PB);
  }
  // the gallery: its floor, the opening onto the hall between pillars, a chain hanging now and then
  g.fill(0, GALLERY + 1, 3, HALL - 1, GALLERY + 4, 5, AIR);
  floor(g, 0, 3, HALL - 1, 5, GALLERY, PBB);
  for (let x = 0; x < HALL; x += 5) {
    for (let y = GALLERY + 1; y <= GALLERY + 4; y++) g.set(x, y, 5, y === GALLERY + 4 ? CPB : PB);
    if (x + 2 < HALL) g.set(x + 2, GALLERY + 4, 5, stairs(PBB_, 'north', 'top'));
  }
  for (let x = 3; x < HALL; x += 8) g.set(x, GALLERY + 4, 4, CHAIN);
  // the rampart: its walkway, merlons on the outer edge, a low wall on the hall's side
  for (let x = 0; x < HALL; x++) {
    for (let z = 0; z < WALL_T; z++) g.set(x, WALK, z, h(x, WALK, z, 3) < 0.3 ? BS : PBB);
    const merlon = x % 4 < 2;
    g.set(x, WALK + 1, 0, merlon ? PBB : PBB_WALL);
    if (merlon) g.set(x, WALK + 2, 0, h(x, 0, 0, 9) < 0.2 ? slab(PBB_) : PBB);
    if (x % 2 === 0) g.set(x, WALK + 1, WALL_T - 1, BS_WALL);
    g.fill(x, WALK + 1, 1, x, WALL_H - 1, WALL_T - 2, AIR);
  }
  // a doorway out of the gallery to what stands out from the wall
  g.fill(15, GALLERY + 1, 0, 17, GALLERY + 3, 2, AIR);
  if (kind === 'windows') {
    for (const x0 of [4, 10, 21, 27]) {
      g.fill(x0, GALLERY + 1, 0, x0 + 1, GALLERY + 3, 2, AIR);
      g.set(x0, GALLERY + 2, 1, PBB_WALL).set(x0 + 1, GALLERY + 2, 1, PBB_WALL);
      g.set(x0, GALLERY + 4, 0, stairs(PBB_, 'south', 'top')).set(x0 + 1, GALLERY + 4, 0, stairs(PBB_, 'south', 'top'));
    }
  }
  if (kind === 'entrance') {
    // the gate: 6 wide, 8 high, an arch of stairs over it, chains hung in it
    g.fill(13, 1, 0, 18, 7, WALL_T - 1, AIR);
    for (let z = 0; z < WALL_T; z++) {
      g.set(13, 7, z, stairs(PBB_, 'east', 'top')).set(18, 7, z, stairs(PBB_, 'west', 'top'));
      g.set(12, 0, z, CPB).set(19, 0, z, CPB);
    }
    for (let y = 1; y <= 8; y++) g.set(12, y, 0, PB).set(19, y, 0, PB);
    g.set(14, 7, 2, CHAIN).set(14, 6, 2, CHAIN).set(17, 7, 2, CHAIN).set(17, 6, 2, CHAIN);
    g.set(14, 5, 2, CHAIN);
    g.set(15, 8, 0, CPB).set(16, 8, 0, CPB);
  }
  // this wall's own connector (to the hall), its corner tower, what stands out from it
  g.connect(16, 0, WALL_T - 1, 'south', { name: T.wall });
  g.connect(0, 0, 2, 'west', { target: T.corner, pool: 'bastion/treasure/corners' });
  g.connect(16, GALLERY, 0, 'north', { target: T.extension, pool: 'bastion/treasure/extensions' });
  // piglins in the gallery and on the rampart, gold on the walkway
  g.mob(6, GALLERY, 4, 'piglin').mob(26, GALLERY, 4, 'piglin');
  g.mob(16, WALK, 3, 'piglin');
  g.gold(9, WALK, 4).gold(23, WALK, 4);
  return element(g, id, 'treasure_rooms');
}

/**
 * a corner tower: 6 x 6, its gallery room joining the two walls' galleries, and above the ramparts a turret room
 * (a chest in one of them) under a crown of merlons
 */
function corner(broken: boolean, id: string): PoolElement {
  const H = WALL_H + 6;
  const g = new BastionGrid(WALL_T, H, WALL_T);
  for (let y = 0; y < H - 4; y++)
    for (let x = 0; x < WALL_T; x++)
      for (let z = 0; z < WALL_T; z++) {
        const edge = x === 0 || z === 0 || x === WALL_T - 1 || z === WALL_T - 1;
        const cornerPost = (x === 0 || x === WALL_T - 1) && (z === 0 || z === WALL_T - 1);
        g.set(x, y, z, cornerPost && y > 1 ? (y % 6 === 0 ? CPB : PBASALT) : edge ? (h(x, y, z, 11) < 0.12 ? BS : PBB) : y < 2 ? BS : PBB);
      }
  // the gallery room: open to both galleries (x 5 and z 5 sides)
  g.fill(3, GALLERY + 1, 3, 5, GALLERY + 4, 5, AIR);
  floor(g, 3, 3, 5, 5, GALLERY);
  g.set(3, GALLERY + 4, 3, CHAIN);
  // the turret room over the walkway, doorways onto both ramparts
  const t0 = WALK + 1;
  g.fill(1, t0, 1, 4, t0 + 3, 4, AIR);
  floor(g, 1, 1, 4, 4, WALK, PBB);
  g.fill(5, t0, 2, 5, t0 + 1, 3, AIR).fill(2, t0, 5, 3, t0 + 1, 5, AIR);
  g.set(1, t0 + 2, 0, AIR).set(4, t0 + 2, 0, AIR).set(0, t0 + 2, 1, AIR).set(0, t0 + 2, 4, AIR);
  // its roof and the crown
  for (let x = 0; x < WALL_T; x++)
    for (let z = 0; z < WALL_T; z++) {
      g.set(x, t0 + 4, z, (x + z) % 3 === 0 ? BS : PBB);
      const edge = x === 0 || z === 0 || x === WALL_T - 1 || z === WALL_T - 1;
      if (edge) {
        const merlon = (x + z) % 2 === 0;
        g.set(x, t0 + 5, z, merlon ? PBB : PBB_WALL);
        if (merlon) g.set(x, t0 + 6, z, h(x, 1, z, 12) < 0.3 ? slab(PBB_) : PBB);
      }
    }
  if (broken) {
    // half the crown and the roof fallen in, gold left lying in the turret
    g.fill(0, t0 + 4, 0, 2, t0 + 6, 5, null).fill(0, t0 + 4, 0, 2, t0 + 4, 5, AIR);
    g.gold(2, WALK, 2).gold(3, WALK, 3);
  } else {
    g.chest(1, t0, 1, 'south', 'bastion_other');
    g.set(3, t0 + 3, 3, CHAIN).set(3, t0 + 2, 3, CHAIN);
  }
  g.mob(2, WALK, 3, 'piglin_melee');
  g.connect(WALL_T - 1, 0, 2, 'east', { name: T.corner });
  return element(g, id, 'high_rampart');
}

// ---------------------------------------------------------------------------------------------------------------
// What stands out from the walls (the extensions)

/** a platform 10 deep out from a wall at the galleries' level on blackstone legs down into the lava; `w` wide */
function platform(g: BastionGrid, w: number, deck: number): void {
  const d = 10;
  for (let x = 0; x < w; x++)
    for (let z = 0; z < d; z++) {
      const edge = x === 0 || z === 0 || x === w - 1;
      g.set(x, deck, z, edge ? PBB : (x + z) % 5 === 0 ? PB : BS);
      g.set(x, deck - 1, z, edge ? stairs(PBB_, x === 0 ? 'east' : x === w - 1 ? 'west' : 'south', 'top') : PBB);
      if (edge && z < d - 1) g.set(x, deck + 1, z, (x + z) % 2 === 0 ? PBB_WALL : AIR);
    }
  // legs down to below the deck
  for (const x of [1, w - 2])
    for (const z of [1, d - 3]) for (let y = 0; y < deck - 1; y++) g.set(x, y, z, y % 4 === 3 ? PBASALT : BASALT);
  // the deck's air
  g.fill(1, deck + 1, 1, w - 2, deck + 3, d - 1, AIR);
}

/** an extension's connector on its wall side (z 9, in the middle) at the deck, and its piglin */
function extensionEnds(g: BastionGrid, w: number, deck: number): void {
  g.connect(w >> 1, deck, 9, 'south', { name: T.extension });
  g.mob((w >> 1) - 2, deck, 5, 'piglin');
}

function largePool(): PoolElement {
  const w = 15, deck = 10;
  const g = new BastionGrid(w, deck + 4, 10);
  platform(g, w, deck);
  // a pool of lava sunk in the deck
  for (let x = 4; x <= 10; x++)
    for (let z = 2; z <= 6; z++) {
      g.set(x, deck, z, x === 4 || x === 10 || z === 2 || z === 6 ? CPBB : LAVA);
      g.set(x, deck - 1, z, PBB);
    }
  g.gold(2, deck, 2).gold(12, deck, 7);
  extensionEnds(g, w, deck);
  return element(g, 'bastion/treasure/extensions/large_pool', 'bastion_generic_degradation');
}

function smallPool(): PoolElement {
  const w = 9, deck = 10;
  const g = new BastionGrid(w, deck + 4, 10);
  platform(g, w, deck);
  for (let x = 3; x <= 5; x++) for (let z = 2; z <= 4; z++) g.set(x, deck, z, x === 4 && z === 3 ? LAVA : MAGMA);
  g.gold(1, deck, 7);
  extensionEnds(g, w, deck);
  return element(g, 'bastion/treasure/extensions/small_pool', 'bastion_generic_degradation');
}

function house(): PoolElement {
  const w = 11, deck = 10;
  const g = new BastionGrid(w, deck + 7, 10);
  platform(g, w, deck);
  // a hut of bricks with a slab roof, its door towards the wall, a chest inside
  for (let x = 2; x <= 8; x++)
    for (let z = 1; z <= 6; z++)
      for (let y = deck + 1; y <= deck + 5; y++) {
        const edge = x === 2 || x === 8 || z === 1 || z === 6;
        if (y === deck + 5) g.set(x, y, z, edge ? slab(PBB_) : slab(BS_, 'top'));
        else g.set(x, y, z, edge ? ((x === 2 || x === 8) && (z === 1 || z === 6) ? PBASALT : PBB) : AIR);
      }
  g.fill(5, deck + 1, 6, 5, deck + 2, 6, AIR);
  g.set(3, deck + 3, 1, PBB_WALL).set(7, deck + 3, 1, PBB_WALL);
  g.chest(3, deck + 1, 2, 'south', 'bastion_other');
  g.set(5, deck + 4, 3, CHAIN);
  g.connect(w >> 1, deck, 9, 'south', { name: T.extension });
  g.mob(6, deck, 3, 'piglin');
  return element(g, 'bastion/treasure/extensions/houses', 'bastion_generic_degradation');
}

// ---------------------------------------------------------------------------------------------------------------
// The base: the lava moat, the great block of bricks with its four arms

const BASE = 24, BASE_TOP = 11;
/** the block in the middle: x and z 5..18 */
const P0 = 5, P1 = 18;

function base(): PoolElement {
  const g = new BastionGrid(BASE, BASE_TOP + 1, BASE);
  // the floor, the rim round the moat and the moat
  for (let x = 0; x < BASE; x++)
    for (let z = 0; z < BASE; z++) {
      g.set(x, 0, z, h(x, 0, z, 20) < 0.5 ? BS : PBB);
      const rim = x === 0 || z === 0 || x === BASE - 1 || z === BASE - 1;
      if (rim) {
        g.set(x, 1, z, (x + z) % 6 === 0 ? CPB : PBB);
        g.set(x, 2, z, (x + z) % 2 === 0 ? slab(PBB_) : AIR);
      } else if (x < P0 || z < P0 || x > P1 || z > P1) {
        g.set(x, 1, z, LAVA);
        g.fill(x, 2, z, x, BASE_TOP, z, AIR);
      }
    }
  // the block: two thick walls, barred windows onto the brain, a lintel of chiseled blackstone, the top
  for (let x = P0; x <= P1; x++)
    for (let z = P0; z <= P1; z++)
      for (let y = 1; y <= BASE_TOP; y++) {
        const shell = x <= P0 + 1 || z <= P0 + 1 || x >= P1 - 1 || z >= P1 - 1;
        const outer = x === P0 || z === P0 || x === P1 || z === P1;
        if (y >= BASE_TOP - 1) g.set(x, y, z, y === BASE_TOP ? ((x + z) % 4 === 0 ? PB : PBB) : BS);
        else if (!shell) g.set(x, y, z, AIR);
        else if (outer && y === BASE_TOP - 2) g.set(x, y, z, (x + z) % 3 === 0 ? CPB : PB);
        else g.set(x, y, z, h(x, y, z, 21) < 0.15 ? BS : PBB);
      }
  // windows: three on each face, bars of blackstone wall
  for (const u of [8, 11, 14])
    for (let y = 3; y <= 6; y++) {
      for (const [x, z, x2, z2] of [[u, P0, u, P0 + 1], [u + 1, P1 - 1, u + 1, P1], [P0, u + 1, P0 + 1, u + 1], [P1 - 1, u, P1, u]]) {
        g.set(x, y, z, y === 3 || y === 6 ? AIR : PBB_WALL);
        g.set(x2, y, z2, AIR);
      }
    }
  // the four arms at the top, out over the moat to the rim
  for (let t = 0; t < P0; t++)
    for (let k = 10; k <= 12; k++) {
      for (const [x, z] of [[t, k], [BASE - 1 - t, k], [k, t], [k, BASE - 1 - t]]) {
        g.set(x, BASE_TOP, z, k === 11 ? PBB : BS);
        g.set(x, BASE_TOP - 1, z, k === 11 ? stairs(PBB_, x < P0 ? 'west' : x > P1 ? 'east' : z < P0 ? 'north' : 'south', 'top') : slab(PBB_, 'top'));
      }
    }
  // what goes on it and in it: the centre on top, the brain inside, the bridges at the arms' ends, the stairs up
  g.connect(11, BASE_TOP, 11, 'up', { target: T.center, pool: 'bastion/treasure/bases/centers', top: 'north', joint: 'aligned' });
  g.connect(11, 0, 11, 'up', { target: T.brain, pool: 'bastion/treasure/brains', top: 'north', joint: 'aligned' });
  g.connect(BASE - 1, BASE_TOP, 11, 'east', { target: T.bridge, pool: 'bastion/treasure/bridges' });
  g.connect(0, BASE_TOP, 12, 'west', { target: T.bridge, pool: 'bastion/treasure/bridges' });
  g.connect(11, BASE_TOP, 0, 'north', { target: T.bridge, pool: 'bastion/treasure/bridges' });
  g.connect(12, BASE_TOP, BASE - 1, 'south', { target: T.bridge, pool: 'bastion/treasure/bridges' });
  g.connect(14, 0, BASE - 1, 'south', { target: T.stairs, pool: 'bastion/treasure/stairs' });
  g.connect(9, 0, 0, 'north', { target: T.stairs, pool: 'bastion/treasure/stairs' });
  // brutes at the arms' roots
  g.mob(11, BASE_TOP, P0 - 2, 'piglin_melee').mob(11, BASE_TOP, P1 + 2, 'piglin_melee');
  // its own connector, under its middle, to the hall's floor
  g.connect(12, 0, 12, 'down', { name: T.base, top: 'north', joint: 'aligned' });
  return element(g, 'bastion/treasure/bases/lava_basin', 'treasure_rooms');
}

// ---------------------------------------------------------------------------------------------------------------
// The brain, the centres, the bridges and the stairs

/** the brain: a heap of magma, gold and blackstone filling the block's inside, two magma cube spawners beside it */
function brain(): PoolElement {
  const g = new BastionGrid(10, 9, 10);
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 10; x++)
      for (let z = 0; z < 10; z++) {
        const dx = x - 4.5, dz = z - 4.5;
        const r = 3.2 - y * 0.18 + (h(x, y, z, 30) - 0.5) * 1.4;
        if (Math.hypot(dx, dz) < r) {
          const n = h(x, y, z, 31);
          g.set(x, y, z, n < 0.55 ? MAGMA : n < 0.72 ? GOLD : n < 0.9 ? BS : 'gilded_blackstone');
        } else g.set(x, y, z, AIR);
      }
  g.spawner(1, 0, 1, 'magma_cube').spawner(8, 0, 8, 'magma_cube');
  g.connect(4, 0, 4, 'down', { name: T.brain, top: 'north' });
  return element(g, 'bastion/treasure/brains/center_brain', 'treasure_rooms');
}

/** a centre: on the block's top, the treasure chest(s) on a dais among gold; brutes about */
function center(n: number): PoolElement {
  const g = new BastionGrid(14, 8, 14);
  const dais = (x0: number, z0: number, x1: number, z1: number, y: number, b: string) => g.fill(x0, y, z0, x1, y, z1, b);
  switch (n) {
    case 0:
      // a stepped dais, gold on its corners, the chest on top
      dais(3, 3, 10, 10, 0, PBB);
      dais(4, 4, 9, 9, 1, PB);
      dais(5, 5, 8, 8, 2, CPB);
      for (const [x, z] of [[3, 3], [10, 3], [3, 10], [10, 10]]) g.set(x, 1, z, GOLD);
      g.chest(6, 3, 6, 'south', 'bastion_treasure');
      g.set(7, 3, 7, GOLD);
      break;
    case 1:
      // two chests either side of a pillar of gold and basalt
      dais(4, 4, 9, 9, 0, PBB);
      for (let y = 1; y <= 5; y++) g.set(6, y, 6, y % 2 ? PBASALT : GOLD).set(7, y, 7, y % 2 ? GOLD : PBASALT);
      g.chest(4, 1, 6, 'east', 'bastion_treasure');
      g.chest(9, 1, 7, 'west', 'bastion_treasure');
      g.set(6, 1, 7, stairs(PBB_, 'north')).set(7, 1, 6, stairs(PBB_, 'south'));
      break;
    case 2:
      // a ring of gold and chiseled blackstone round a lava well, the chest at the ring's head
      for (let x = 3; x <= 10; x++)
        for (let z = 3; z <= 10; z++) {
          const ring = x === 3 || z === 3 || x === 10 || z === 10;
          if (ring) g.set(x, 0, z, (x + z) % 2 === 0 ? GOLD : CPB);
        }
      g.fill(5, 0, 5, 8, 0, 8, PBB).set(6, 0, 6, LAVA).set(7, 0, 7, LAVA).set(6, 0, 7, LAVA).set(7, 0, 6, LAVA);
      g.chest(6, 1, 3, 'south', 'bastion_treasure');
      break;
    default:
      // a heap of gold blocks with the chest on it
      for (let x = 4; x <= 9; x++)
        for (let z = 4; z <= 9; z++) {
          const d = Math.max(Math.abs(x - 6.5), Math.abs(z - 6.5));
          if (d < 3) g.set(x, 0, z, h(x, 0, z, 40) < 0.7 ? GOLD : PBB);
          if (d < 2) g.set(x, 1, z, h(x, 1, z, 41) < 0.6 ? GOLD : BS);
        }
      g.chest(6, 2, 6, 'north', 'bastion_treasure');
      break;
  }
  // pads for the brutes, and loose gold
  for (const [x, z] of [[1, 1], [12, 12], [1, 12]]) g.set(x, 0, z, slab(PB_, 'top')).mob(x, 0, z, 'piglin_melee');
  g.gold(12, 0, 1);
  g.set(12, 0, 1, PBB);
  g.connect(6, 0, 6, 'down', { name: T.center, top: 'north' });
  return element(g, `bastion/treasure/bases/centers/center_${n}`, 'treasure_rooms');
}

/** a bridge from an arm's end to the wall's gallery: 4 long, 3 wide; the broken one has lost its middle */
function bridge(broken: boolean): PoolElement {
  const g = new BastionGrid(4, 3, 3);
  for (let x = 0; x < 4; x++)
    for (let z = 0; z < 3; z++) {
      if (broken && (x === 1 || x === 2) && z !== 0) continue;
      g.set(x, 0, z, z === 1 ? PBB : slab(BS_, 'top'));
      if (z !== 1) g.set(x, 1, z, x % 2 === 0 ? PBB_WALL : AIR);
      else g.set(x, 1, z, AIR).set(x, 2, z, AIR);
    }
  g.connect(0, 0, 1, 'west', { name: T.bridge });
  return element(g, broken ? 'bastion/treasure/bridges/bridge_broken' : 'bastion/treasure/bridges/bridge_0', 'bastion_generic_degradation');
}

/** stairs from the hall's floor up to a gallery, rising along x beside the moat's rim; the landing at the top */
function lowerStairs(): PoolElement {
  const g = new BastionGrid(14, 13, 4);
  for (let x = 0; x < 14; x++)
    for (let z = 0; z < 4; z++) {
      const top = Math.min(x, 11);
      for (let y = 0; y < top; y++) g.set(x, y, z, y === 0 ? BS : h(x, y, z, 50) < 0.2 ? BS : PBB);
      g.set(x, top, z, x <= 11 ? stairs(z === 0 || z === 3 ? PB_ : PBB_, 'east') : z === 0 || z === 3 ? PB : PBB);
      g.fill(x, top + 1, z, x, 12, z, AIR);
    }
  g.set(12, 11, 0, PBB).set(13, 11, 0, PBB).set(13, 12, 0, PBB_WALL);
  g.connect(0, 0, 0, 'north', { name: T.stairs });
  return element(g, 'bastion/treasure/stairs/lower_stairs', 'treasure_rooms');
}

// ---------------------------------------------------------------------------------------------------------------
// The pools

export const TREASURE_START = hall();

bastionPool('bastion/treasure/walls', [[wall('plain', 'bastion/treasure/walls/wall_0'), 2], [wall('windows', 'bastion/treasure/walls/wall_1'), 2], [wall('entrance', 'bastion/treasure/walls/entrance_wall'), 1]]);
bastionPool('bastion/treasure/corners', [[corner(false, 'bastion/treasure/corners/corner_0'), 2], [corner(true, 'bastion/treasure/corners/corner_1'), 1]]);
bastionPool('bastion/treasure/extensions', [[largePool(), 1], [smallPool(), 2], [house(), 2], [EMPTY, 2]]);
bastionPool('bastion/treasure/bases', [[base(), 1]]);
bastionPool('bastion/treasure/brains', [[brain(), 1]]);
bastionPool('bastion/treasure/bases/centers', [[center(0), 1], [center(1), 1], [center(2), 1], [center(3), 1]]);
bastionPool('bastion/treasure/bridges', [[bridge(false), 3], [bridge(true), 1], [EMPTY, 1]]);
bastionPool('bastion/treasure/stairs', [[lowerStairs(), 1]]);

void CPBB;
void CHAIN;
