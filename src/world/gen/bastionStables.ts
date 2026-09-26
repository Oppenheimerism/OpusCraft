// (bastions) The hoglin stables (vanilla bastion/hoglin_stable/*, BastionHoglinStablePools; the names are vanilla's,
// the pieces this game's own). The start, bastion/hoglin_stable/air_base, is room for the rest: 46 x 46 and 36 high.
// Round it run walls 28 high (hoglin_stable/wall_bases below, hoglin_stable/walls above: arched windows, or loopholes)
// with ramparts on top (hoglin_stable/ramparts). Inside, two ramps climb the walls in a double spiral: each starts
// on the floor in a corner (hoglin_stable/starting_pieces, and the same turned half round, mirrored_starting_pieces),
// rises half a block a block along one wall, turns the corner and climbs the next (hoglin_stable/stairs) to come out
// on the ramparts, 28 blocks up. Posts hold up the corners (hoglin_stable/posts: a gatehouse, or a pillar), stalls
// line the walls under the ramps (hoglin_stable/small_stables/outer) and the great pen stands in the middle
// (hoglin_stable/large_stables/inner), hoglins shut in them, the stables' chests beside them. Piglins walk the ramps
// and the ramparts, a brute or two about the pen.

import {
  BastionGrid, element, bastionPool, seat, masonry, doorway, floor, h, stairs, slab, type Seatable,
  PBB, CPBB, PB, CPB, BS, GOLD, BASALT, PBASALT, AIR, CHAIN, PBB_WALL, BS_WALL, PB_WALL, PBB_, BS_, PB_,
} from './bastionPieces';
import type { PoolElement } from './jigsaw';

/** the connectors' names */
const J = {
  wall: 'bastion:stable_wall',
  sideWall: 'bastion:stable_side_wall',
  rampart: 'bastion:stable_rampart',
  ramp: 'bastion:stable_ramp',
  stairs: 'bastion:stable_stairs',
  post: 'bastion:stable_post',
  stall: 'bastion:stable_stall',
  pen: 'bastion:stable_pen',
};

/** the whole: 46 x 46, 36 high; the walls 4 thick, each part 14 high; the ramps 5 wide, rising 14 along a side */
const SIZE = 46, HEIGHT = 36, WALL_T = 4, WALL_L = 42, WALL_H = 14, RAMP_W = 5, RUN = 28, RISE = 14;

const WALL: Seatable = { sx: WALL_L, sz: WALL_T, jx: 21, jy: 1, jz: 1 };
const RAMP0: Seatable = { sx: RUN, sz: RAMP_W, jx: 14, jy: 1, jz: 2 };
const POST: Seatable = { sx: RAMP_W, sz: RAMP_W, jx: 2, jy: 1, jz: 2 };
const STALL: Seatable = { sx: RUN, sz: RAMP_W, jx: 14, jy: 1, jz: 2 };
const PEN: Seatable = { sx: RUN, sz: RUN, jx: 14, jy: 1, jz: 14 };

// ---------------------------------------------------------------------------------------------------------------
// The start

/**
 * vanilla bastion/hoglin_stable/air_base: room and nothing else. The walls in a pinwheel; a ramp's first flight on
 * the north wall and its twin on the south; a post in each corner; the stalls on the east and west walls (under the
 * ramps' second flights) and the pen in the middle
 */
function airBase(): PoolElement {
  const g = new BastionGrid(SIZE, HEIGHT, SIZE);
  const T = WALL_T, R = RAMP_W, far = SIZE - WALL_T - RAMP_W;
  seat(g, 0, 0, 0, 0, WALL, J.wall, 'bastion/hoglin_stable/wall_bases');
  seat(g, SIZE - T, 0, 0, 1, WALL, J.wall, 'bastion/hoglin_stable/wall_bases');
  seat(g, T, 0, SIZE - T, 2, WALL, J.wall, 'bastion/hoglin_stable/wall_bases');
  seat(g, 0, 0, T, 3, WALL, J.wall, 'bastion/hoglin_stable/wall_bases');
  seat(g, T + R, 0, T, 0, RAMP0, J.ramp, 'bastion/hoglin_stable/starting_pieces');
  seat(g, T + R, 0, far, 2, RAMP0, J.ramp, 'bastion/hoglin_stable/mirrored_starting_pieces');
  seat(g, T, 0, T, 0, POST, J.post, 'bastion/hoglin_stable/posts');
  seat(g, far, 0, T, 1, POST, J.post, 'bastion/hoglin_stable/posts');
  seat(g, far, 0, far, 2, POST, J.post, 'bastion/hoglin_stable/posts');
  seat(g, T, 0, far, 3, POST, J.post, 'bastion/hoglin_stable/posts');
  seat(g, far, 0, T + R, 1, STALL, J.stall, 'bastion/hoglin_stable/small_stables/outer');
  seat(g, T, 0, T + R, 3, STALL, J.stall, 'bastion/hoglin_stable/small_stables/outer');
  seat(g, T + R, 0, T + R, 0, PEN, J.pen, 'bastion/hoglin_stable/large_stables/inner');
  return element(g, 'bastion/hoglin_stable/air_base', 'bastion_generic_degradation');
}

// ---------------------------------------------------------------------------------------------------------------
// The ramps

/** a deck block of a ramp at step i of its slope (half a block a block: a slab, then a whole block) */
function deckBlock(i: number, x: number, y: number, z: number): string {
  const b = z === 0 ? PB_ : h(x, y, z, 70) < 0.3 ? BS_ : PBB_;
  if (i % 2 === 0) return slab(b);
  return b === PB_ ? PB : b === BS_ ? BS : PBB;
}

/** the railing on a ramp's inner edge (z 4) over a deck block at y: a post every other block */
function railing(g: BastionGrid, x: number, y: number): void {
  if (x % 2 === 0) g.set(x, y + 1, RAMP_W - 1, PBB_WALL);
}

/**
 * vanilla bastion/hoglin_stable/starting_pieces/*: a ramp's first flight, 28 long along x (its wall to the north,
 * z 0), rising from the floor at x 0 to 14 at x 27; the bulk under it solid but for arches through it. At its top it
 * meets the next flight, round the corner (a connector facing east at the last step)
 */
function firstFlight(id: string, n: number, mirrored: boolean): PoolElement {
  const g = new BastionGrid(RUN, 2 * RISE + 1, RAMP_W);
  g.fill(0, 1, 0, RUN - 1, 2 * RISE, RAMP_W - 1, AIR);
  floor(g, 0, 0, RUN - 1, RAMP_W - 1, 0, BS);
  for (let i = 0; i < RUN; i++) {
    const y = 1 + (i >> 1);
    for (let z = 0; z < RAMP_W; z++) {
      g.set(i, y, z, deckBlock(i, i, y, z));
      if (y > 1) masonry(g, i, 1, z, i, y - 1, z);
    }
    if (i > 3) railing(g, i, y);
  }
  // arches through the bulk, where it's high enough
  for (const x0 of [13, 20]) doorway(g, x0, 1, 0, 3, 4 + ((x0 - 13) >> 2), RAMP_W, true);
  // what's on it
  if (n === 1) for (const x of [8, 9]) g.set(x, 1 + (x >> 1) + 1, 0, GOLD);
  if (n === 2) {
    // a stretch of the railing broken off, its blocks lying on the steps
    for (let x = 16; x <= 22; x++) g.set(x, 1 + (x >> 1) + 1, RAMP_W - 1, AIR);
    g.set(18, 1 + 9 + 1, 2, CPBB);
  }
  g.mob(11, 6, 2, 'piglin').gold(25, 13, 1);
  if (mirrored) g.gold(5, 3, 3);
  g.connect(RUN - 1, RISE, 2, 'east', { target: J.stairs, pool: 'bastion/hoglin_stable/stairs' });
  g.connect(14, 1, 2, 'down', { name: J.ramp, top: 'north', joint: 'aligned' });
  return element(g, id, 'side_wall_degradation');
}

/**
 * vanilla bastion/hoglin_stable/stairs/*: a ramp's second flight, along x too: a landing (x 0-4, the corner it turns),
 * 28 blocks of slope, and a landing at the top (x 33-37), level with the ramparts. It hangs from the wall over the
 * stalls, corbelled out under its edges. Its connector (on the first landing's inner edge) turns it round the corner
 */
function secondFlight(n: number): PoolElement {
  const L = RAMP_W + RUN + RAMP_W;
  const g = new BastionGrid(L, RISE + 3, RAMP_W);
  g.fill(0, 0, 0, L - 1, RISE + 2, RAMP_W - 1, AIR);
  const landing = (x0: number, y: number) => {
    for (let x = x0; x < x0 + RAMP_W; x++)
      for (let z = 0; z < RAMP_W; z++) g.set(x, y, z, (x + z) % 4 === 0 ? CPB : h(x, y, z, 71) < 0.3 ? BS : PBB);
    for (let x = x0; x < x0 + RAMP_W; x++) g.set(x, y - 1, RAMP_W - 1, slab(PBB_, 'top'));
  };
  landing(0, 0);
  for (let i = 0; i < RUN; i++) {
    const x = RAMP_W + i, y = 1 + (i >> 1);
    for (let z = 0; z < RAMP_W; z++) g.set(x, y, z, deckBlock(i, x, y, z));
    // corbels under the edges
    if (i % 2 === 1) g.set(x, y - 1, 0, stairs(PBB_, 'north', 'top')).set(x, y - 1, RAMP_W - 1, stairs(PBB_, 'north', 'top'));
    railing(g, x, y);
  }
  landing(RAMP_W + RUN, RISE);
  for (let x = RAMP_W + RUN; x < L; x++) if (x % 2) g.set(x, RISE + 1, RAMP_W - 1, PBB_WALL);
  // chains from the underside
  g.set(12, 3, 3, CHAIN).set(12, 2, 3, CHAIN).set(24, 9, 3, CHAIN).set(24, 8, 3, CHAIN);
  if (n === 1) g.set(RAMP_W + RUN + 2, RISE + 1, 1, GOLD);
  if (n === 2) {
    // the railing gone along the upper half
    for (let x = RAMP_W + 14; x < RAMP_W + RUN; x++) g.set(x, 1 + ((x - RAMP_W) >> 1) + 1, RAMP_W - 1, AIR);
  }
  if (n === 3) g.set(2, 1, 0, GOLD).set(2, 2, 0, CPB);
  g.mob(RAMP_W + 13, 7, 2, 'piglin').mob(RAMP_W + RUN + 2, RISE, 2, n === 0 ? 'piglin_melee' : 'piglin');
  g.gold(1, 0, 1);
  g.connect(2, 0, RAMP_W - 1, 'south', { name: J.stairs });
  return element(g, `bastion/hoglin_stable/stairs/stairs_1_${n}`, 'side_wall_degradation');
}

// ---------------------------------------------------------------------------------------------------------------
// The posts in the corners

/**
 * vanilla bastion/hoglin_stable/posts/stair_post: a gatehouse under a corner, 5 x 5 and 14 high, arches through it
 * on three sides (the gate in the wall to the north, the ways in to the east and south)
 */
function stairPost(): PoolElement {
  const g = new BastionGrid(RAMP_W, WALL_H, RAMP_W);
  floor(g, 0, 0, RAMP_W - 1, RAMP_W - 1, 0, BS);
  masonry(g, 0, 1, 0, RAMP_W - 1, WALL_H - 1, RAMP_W - 1);
  g.fill(1, 1, 1, 3, 5, 3, AIR);
  doorway(g, 1, 1, 0, 3, 5, 1, true);
  doorway(g, 1, 1, RAMP_W - 1, 3, 5, 1, true);
  doorway(g, RAMP_W - 1, 1, 1, 3, 5, 1, false);
  for (const [x, z] of [[0, 0], [4, 0], [0, 4], [4, 4]]) g.fill(x, 1, z, x, WALL_H - 1, z, (_x, y) => (y % 6 === 0 ? CPB : PBASALT));
  g.set(2, 5, 2, CHAIN).set(2, 4, 2, CHAIN);
  g.connect(2, 1, 2, 'down', { name: J.post, top: 'north', joint: 'aligned' });
  return element(g, 'bastion/hoglin_stable/posts/stair_post', 'stable_degradation');
}

/** vanilla bastion/hoglin_stable/posts/end_post: the corner left open, a pillar of basalt against the walls */
function endPost(): PoolElement {
  const g = new BastionGrid(RAMP_W, WALL_H, RAMP_W);
  floor(g, 0, 0, RAMP_W - 1, RAMP_W - 1, 0, BS);
  g.fill(0, 1, 0, RAMP_W - 1, WALL_H - 1, RAMP_W - 1, AIR);
  for (let y = 1; y < WALL_H; y++)
    for (const [x, z] of [[0, 0], [1, 0], [0, 1], [1, 1]]) g.set(x, y, z, y === WALL_H - 1 ? CPB : x + z === 2 ? PBASALT : BASALT);
  g.set(2, WALL_H - 1, 0, stairs(PBB_, 'west', 'top')).set(0, WALL_H - 1, 2, stairs(PBB_, 'north', 'top'));
  g.set(3, 1, 3, GOLD);
  g.connect(2, 1, 2, 'down', { name: J.post, top: 'north', joint: 'aligned' });
  return element(g, 'bastion/hoglin_stable/posts/end_post', 'stable_degradation');
}

// ---------------------------------------------------------------------------------------------------------------
// The stables

/**
 * vanilla bastion/hoglin_stable/small_stables/outer/*: a row of stalls along a wall under a ramp, 28 x 5 and 14
 * high: walkways at the ends, three stalls (x 3-8, 10-17, 19-24) walled apart, fenced in along the front (z 4), a
 * hoglin in each; now and then the stables' chest in the middle one
 */
function stalls(n: number): PoolElement {
  const g = new BastionGrid(RUN, WALL_H, RAMP_W);
  g.fill(0, 1, 0, RUN - 1, WALL_H - 1, RAMP_W - 1, AIR);
  floor(g, 0, 0, RUN - 1, RAMP_W - 1, 0, BS);
  for (const x of [2, 9, 18, 25]) g.fill(x, 1, 0, x, 3, RAMP_W - 1, (_x, y, z) => (z === RAMP_W - 1 ? (y === 3 ? CPB : PB) : y === 3 ? slab(PBB_) : PBB));
  const pens: [number, number][] = [[3, 8], [10, 17], [19, 24]];
  for (const [a, b] of pens) {
    for (let x = a; x <= b; x++) g.set(x, 1, RAMP_W - 1, PB_WALL).set(x, 2, RAMP_W - 1, x % 2 ? PB_WALL : AIR);
    for (let x = a; x <= b; x++) for (let z = 0; z < RAMP_W - 1; z++) g.set(x, 0, z, h(x, 0, z, 72) < 0.25 ? PB : BS);
    g.mob((a + b) >> 1, 0, 2, 'hoglin');
  }
  if (n === 1) g.chest(13, 1, 0, 'south', 'bastion_hoglin_stable');
  if (n === 2) {
    // the middle stall broken open
    for (let x = 11; x <= 16; x++) g.set(x, 1, RAMP_W - 1, x === 13 || x === 14 ? AIR : CPBB).set(x, 2, RAMP_W - 1, AIR);
    g.set(12, 1, 1, GOLD);
  }
  g.gold(0, 0, 3).gold(RUN - 1, 0, 1);
  g.connect(14, 1, 2, 'down', { name: J.stall, top: 'north', joint: 'aligned' });
  return element(g, `bastion/hoglin_stable/small_stables/outer/outer_${n}`, 'stable_degradation');
}

/**
 * vanilla bastion/hoglin_stable/large_stables/inner/*: the middle of the floor, 28 x 28, hollowed out to the
 * ramparts' height: the great pen (14 x 14, its wall of bricks and chiseled posts) split into pens with a hoglin in
 * each and the stables' chest in one, gold and brutes round it
 */
function greatPen(n: number): PoolElement {
  const H = 2 * WALL_H;
  const g = new BastionGrid(RUN, H, RUN);
  g.fill(0, 1, 0, RUN - 1, H - 1, RUN - 1, AIR);
  floor(g, 0, 0, RUN - 1, RUN - 1, 0);
  const a = 7, b = 20;
  // the pen's wall
  for (let x = a; x <= b; x++)
    for (let z = a; z <= b; z++) {
      const edge = x === a || z === a || x === b || z === b;
      if (!edge) {
        g.set(x, 0, z, h(x, 0, z, 73) < 0.25 ? PB : BS);
        continue;
      }
      const post = (x - a) % 13 === 0 && (z - a) % 13 === 0;
      g.fill(x, 1, z, x, post ? 4 : 2, z, (_x, y) => (post ? (y === 4 ? CPB : PB) : y === 2 ? PBB_WALL : PBB));
    }
  if (n === 0) {
    // four pens
    for (let i = a + 1; i < b; i++) g.set(13, 1, i, PBB).set(13, 2, i, PBB_WALL).set(i, 1, 13, PBB).set(i, 2, 13, PBB_WALL);
    g.set(13, 1, 13, CPB).set(13, 2, 13, CPB).set(13, 3, 13, GOLD);
    g.mob(10, 0, 10, 'hoglin').mob(17, 0, 10, 'hoglin').mob(10, 0, 17, 'hoglin').mob(17, 0, 17, 'hoglin');
    g.chest(19, 1, 19, 'north', 'bastion_hoglin_stable');
  } else if (n === 1) {
    // two long pens either side of a raised walk with the chest at its end
    for (let i = a + 1; i < b; i++)
      for (const x of [12, 15]) g.set(x, 1, i, PBB).set(x, 2, i, PBB_WALL);
    for (let z = a; z <= b; z++) for (const x of [13, 14]) g.set(x, 1, z, z === a || z === b ? stairs(PBB_, z === a ? 'south' : 'north') : PB);
    g.chest(13, 2, 12, 'east', 'bastion_hoglin_stable');
    g.set(14, 2, 12, GOLD).set(13, 2, 16, GOLD);
    g.mob(9, 0, 11, 'hoglin').mob(9, 0, 17, 'hoglin').mob(18, 0, 10, 'hoglin').mob(18, 0, 16, 'hoglin');
  } else {
    // one great pen round a heap of gold and blackstone, the chest walled in beside it
    for (let x = 12; x <= 15; x++) for (let z = 12; z <= 15; z++) g.set(x, 1, z, h(x, 1, z, 74) < 0.5 ? GOLD : BS);
    g.set(13, 2, 13, GOLD).set(14, 2, 14, slab(BS_));
    g.fill(8, 1, 8, 10, 3, 10, PBB).fill(9, 1, 9, 9, 2, 9, AIR).chest(9, 1, 9, 'south', 'bastion_hoglin_stable');
    g.set(9, 2, 10, AIR).set(9, 1, 10, AIR);
    g.mob(17, 0, 10, 'hoglin').mob(10, 0, 17, 'hoglin').mob(17, 0, 17, 'hoglin');
  }
  // round the pen: brutes and piglins, gold, slabs capping the posts
  g.mob(3, 0, 3, 'piglin_melee').mob(24, 0, 24, 'piglin').mob(3, 0, 24, 'piglin');
  g.gold(24, 0, 3).gold(4, 0, 14).gold(22, 0, 13);
  for (const [x, z] of [[a, a], [b, a], [a, b], [b, b]]) g.set(x, 5, z, slab(PB_));
  g.connect(14, 1, 14, 'down', { name: J.pen, top: 'north', joint: 'aligned' });
  return element(g, `bastion/hoglin_stable/large_stables/inner/inner_${n}`, 'stable_degradation');
}

// ---------------------------------------------------------------------------------------------------------------
// The walls and the ramparts

/** the lower half of a wall, along x, its outer face north (z 0): the corner's gate (x 5-7) in it, buttresses */
function wallBase(): PoolElement {
  const g = new BastionGrid(WALL_L, WALL_H, WALL_T);
  masonry(g, 0, 0, 0, WALL_L - 1, WALL_H - 1, WALL_T - 1);
  for (let x = 10; x < WALL_L; x += 8) g.fill(x, 1, 0, x + 1, WALL_H - 1, 0, (xx, y) => (y === WALL_H - 1 ? CPB : xx === x ? PB : PBB));
  doorway(g, 5, 1, 0, 3, 5, WALL_T, true);
  g.set(5, 6, 0, CPB).set(7, 6, 0, CPB).set(6, 6, 0, GOLD);
  g.connect(21, WALL_H - 1, 1, 'up', { target: J.sideWall, pool: 'bastion/hoglin_stable/walls', top: 'north', joint: 'aligned' });
  g.connect(21, 1, 1, 'down', { name: J.wall, top: 'north', joint: 'aligned' });
  return element(g, 'bastion/hoglin_stable/walls/wall_base', 'side_wall_degradation');
}

/** the upper half of a wall: great arched windows (side_wall_0) or a row of loopholes (side_wall_1) */
function sideWall(n: number): PoolElement {
  const g = new BastionGrid(WALL_L, WALL_H, WALL_T);
  masonry(g, 0, 0, 0, WALL_L - 1, WALL_H - 1, WALL_T - 1);
  for (let x = 0; x < WALL_L; x++) g.set(x, 0, 0, (x & 3) === 1 ? CPB : PB).set(x, WALL_H - 2, 0, (x & 3) === 3 ? CPB : PB);
  if (n === 0) {
    for (const x0 of [11, 20, 29]) {
      g.fill(x0, 3, 0, x0 + 2, 8, WALL_T - 1, AIR);
      g.set(x0, 8, 0, stairs(PBB_, 'east', 'top')).set(x0 + 2, 8, 0, stairs(PBB_, 'west', 'top'));
      g.set(x0 + 1, 9, 0, CPB);
      for (let x = x0; x <= x0 + 2; x++) g.set(x, 3, 1, x === x0 + 1 ? BS_WALL : slab(PBB_));
    }
  } else {
    for (let x = 6; x < WALL_L - 4; x += 5) g.fill(x, 4, 0, x, 6, WALL_T - 1, AIR).set(x, 6, 0, PBB_WALL);
  }
  g.connect(21, WALL_H - 1, 2, 'up', { target: J.rampart, pool: 'bastion/hoglin_stable/ramparts', top: 'north', joint: 'aligned' });
  g.connect(21, 0, 1, 'down', { name: J.sideWall, top: 'north', joint: 'aligned' });
  return element(g, `bastion/hoglin_stable/walls/side_wall_${n}`, 'side_wall_degradation');
}

/** a rampart on a wall: the walkway (level with the ramps' tops), merlons outside, a low wall inside */
function rampart(n: number): PoolElement {
  const g = new BastionGrid(WALL_L, 3, WALL_T);
  for (let x = 0; x < WALL_L; x++) {
    for (let z = 0; z < WALL_T; z++) g.set(x, 0, z, z === 0 ? PBB : h(x, 0, z, 75) < 0.35 ? BS : PBB);
    const merlon = x % 4 < 2;
    g.set(x, 1, 0, merlon ? PBB : BS_WALL);
    if (merlon) g.set(x, 2, 0, h(x, 2, 0, 76) < 0.2 ? slab(PBB_) : PBB);
    if (x > 8 && x < WALL_L - 4 && x % 3 === 0) g.set(x, 1, WALL_T - 1, BS_WALL);
  }
  if (n === 2) {
    // a broken stretch of the walkway
    for (let x = 26; x <= 30; x++) for (let z = 1; z < WALL_T; z++) if (h(x, 9, z, 77) < 0.6) g.set(x, 0, z, AIR);
  }
  if (n === 3) g.chest(20, 1, 1, 'south', 'bastion_other');
  g.mob(16, 0, 2, 'piglin').gold(32, 0, 1);
  g.connect(21, 0, 2, 'down', { name: J.rampart, top: 'north', joint: 'aligned' });
  return element(g, `bastion/hoglin_stable/ramparts/ramparts_${n}`, 'rampart_degradation');
}

// ---------------------------------------------------------------------------------------------------------------
// The pools (vanilla BastionHoglinStablePools)

export const STABLES_START = airBase();

bastionPool('bastion/hoglin_stable/starting_pieces', [0, 1, 2].map((n) => [firstFlight(`bastion/hoglin_stable/starting_pieces/starting_stairs_${n}`, n, false), 1]));
bastionPool('bastion/hoglin_stable/mirrored_starting_pieces', [0, 1, 2].map((n) => [firstFlight(`bastion/hoglin_stable/starting_pieces/stairs_${n}_mirrored`, n, true), 1]));
bastionPool('bastion/hoglin_stable/stairs', [0, 1, 2, 3].map((n) => [secondFlight(n), 1]));
bastionPool('bastion/hoglin_stable/wall_bases', [[wallBase(), 1]]);
bastionPool('bastion/hoglin_stable/walls', [[sideWall(0), 1], [sideWall(1), 1]]);
bastionPool('bastion/hoglin_stable/posts', [[stairPost(), 1], [endPost(), 1]]);
bastionPool('bastion/hoglin_stable/small_stables/outer', [0, 1, 2].map((n) => [stalls(n), 1]));
bastionPool('bastion/hoglin_stable/large_stables/inner', [0, 1, 2].map((n) => [greatPen(n), 1]));
bastionPool('bastion/hoglin_stable/ramparts', [1, 2, 3].map((n) => [rampart(n), 1]));
