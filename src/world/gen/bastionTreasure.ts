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
  BastionGrid, element, bastionPool, wallX, floor, h, stairs, slab, EMPTY, OPP,
  noiseOf, breakTop, breach, spall, rubble, hangLantern, stump, vee, deepest, teeth, walkway, type Noise,
  PBB, CPBB, PB, CPB, BS, GILD, GOLD, BASALT, PBASALT, MAGMA, LAVA, AIR, CHAIN, PBB_WALL, BS_WALL, PB_WALL, PBB_, BS_, PB_, LANTERN_UP,
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
  const n = noiseOf('bastion/treasure/big_air_full');
  // in the two corners the stairs leave free, a hearth: lava in a curb of magma and blackstone, sunk in the floor
  for (const [x0, z0] of [[HALL - 4, 0], [0, HALL - 4]])
    for (let x = x0; x < x0 + 4; x++)
      for (let z = z0; z < z0 + 4; z++) {
        const inner = x > x0 && x < x0 + 3 && z > z0 && z < z0 + 3;
        g.set(x, 0, z, inner || (x + z) % 2 === 0 ? MAGMA : CPB);
        g.set(x, 1, z, inner ? LAVA : (x + z) % 2 ? CPB : slab(PBB_));
      }
  // what's left of the floors that once ran round the hall: ledges on corbels along its walls at different heights,
  // two of them on the pillars in the corners, beams out over the drop, all broken off short, lanterns hanging
  stump(g, n, HALL - 1, 2, 21, 0);
  stump(g, n, 0, 2, 25, HALL - 1);
  ledge(g, n, 17, 0, HALL - 1, 2, 22, 'south', true, false);
  ledge(g, n, 0, HALL - 3, 11, HALL - 1, 26, 'north', false, true);
  ledge(g, n, 0, 19, 1, 27, 20, 'east', true, true);
  ledge(g, n, HALL - 3, 3, HALL - 1, 10, 17, 'west', true, true);
  beam(g, n, 9, 0, 0, 1, 7, 25);
  beam(g, n, HALL - 1, 21, -1, 0, 6, 28);
  beam(g, n, 0, 12, 1, 0, 9, 30);
  // heaps of what fell at the walls' feet
  for (const [x, z, r] of [[20, 1, 1.8], [30, 10, 1.5], [11, 30, 1.7], [1, 22, 1.4]]) rubble(g, n, x, 1, z, r, x);
  return element(g, 'bastion/treasure/big_air_full', 'bastion_generic_degradation');
}

/**
 * a ledge along a wall of the hall at y over x0..x1, z0..z1, the drop on its `pit` side: bricks and blackstone on
 * corbels of upside-down stairs, its edge ragged, broken off short at its start or end (or both), rubble on it and a
 * lantern hanging from it
 */
function ledge(g: BastionGrid, n: Noise, x0: number, z0: number, x1: number, z1: number, y: number, pit: 'north' | 'south' | 'east' | 'west', broken0: boolean, broken1: boolean): void {
  const alongX = pit === 'north' || pit === 'south';
  const [u0, u1] = alongX ? [x0, x1] : [z0, z1];
  const [v0, v1] = alongX ? [z0, z1] : [x0, x1];
  const out = pit === 'south' || pit === 'east' ? 1 : -1, wall = out > 0 ? v0 : v1, deep = v1 - v0 + 1;
  let lantern: [number, number] | null = null;
  for (let u = u0; u <= u1; u++) {
    const short = (broken0 ? Math.max(0, 3 - (u - u0)) : 0) + (broken1 ? Math.max(0, 3 - (u1 - u)) : 0);
    const reach = deep - (n(u, y, 0, 1) < 0.3 ? 1 : 0) - Math.floor(short * (0.5 + n(u, y, 1, 1)));
    if (reach <= 0) continue;
    for (let i = 0; i < reach; i++) {
      const v = wall + out * i, [x, z] = alongX ? [u, v] : [v, u];
      g.set(x, y, z, i === reach - 1 && n(x, y, z, 2) < 0.4 ? slab(PBB_) : n(x, y, z, 3) < 0.35 ? BS : PBB);
    }
    const [cx, cz] = alongX ? [u, wall] : [wall, u];
    g.set(cx, y - 1, cz, stairs(PBB_, OPP[pit], 'top'));
    if (u % 3 === 0) g.set(cx, y - 2, cz, stairs(PBB_, OPP[pit], 'top'));
    if (reach >= 2 && Math.abs(u - ((u0 + u1) >> 1)) <= 1) lantern = alongX ? [u, wall + out * (reach - 1)] : [wall + out * (reach - 1), u];
  }
  const [mx, mz] = alongX ? [(u0 + u1) >> 1, wall] : [wall, (u0 + u1) >> 1];
  rubble(g, n, mx, y + 1, mz, 1.6);
  if (lantern) hangLantern(g, lantern[0], y - 1, lantern[1], 1);
}

/** a beam out from a wall at (x, y, z) along x or z (`dx`, `dz`) for `len`, its end broken off; a lantern from its end */
function beam(g: BastionGrid, n: Noise, x: number, z: number, dx: number, dz: number, len: number, y: number): void {
  for (let i = 0; i < len; i++) {
    const bx = x + dx * i, bz = z + dz * i;
    g.set(bx, y, bz, i === len - 1 ? slab(PBB_) : n(bx, y, bz, 4) < 0.3 ? CPBB : PBB);
    if (i < 2) g.set(bx, y - 1, bz, i === 0 ? PBB : stairs(PBB_, dx > 0 ? 'west' : dx < 0 ? 'east' : dz > 0 ? 'north' : 'south', 'top'));
  }
  hangLantern(g, x + dx * (len - 2), y - 1, z + dz * (len - 2), 3);
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
  ruinWall(g, kind, noiseOf(id));
  return element(g, id, 'treasure_rooms');
}

/**
 * what the years have done to a wall of the hall: its top fallen in (deep at one end beside a corner tower, shallow
 * elsewhere, the parapet gone in stretches), a breach or two, the facing fallen from its outer face in patches, rubble
 * on what's left of the walkway's outer side, lanterns in the gallery. Each of the three walls differently. The
 * outer half of the wall falls as it may; the inner half (z 3-5) only so far that the rampart's walkway still runs
 * from corner tower to corner tower, down into each gap and up out of it a block a step. Nothing under the walkway's
 * piglin and gold, nor the gallery, which stays whole to walk along
 */
function ruinWall(g: BastionGrid, kind: WallKind, n: Noise): void {
  const top = WALL_H - 2;
  const fallen = (depth: (u: number) => number) => {
    breakTop(g, n, 0, HALL - 1, 0, 2, top, depth);
    breakTop(g, n, 0, HALL - 1, 3, WALL_T - 1, top, walkway(depth, top - WALK, 3, 0, HALL - 1), true, true);
  };
  if (kind === 'plain') {
    // fallen in all along, down almost to the gallery's roof at the ends: stumps of it left standing where the
    // walkway's piglin and gold are
    fallen(deepest(teeth(12, [9, 16, 23], 2.6), vee(26, 60, 17, 2.5), vee(-30, 4, 15, 1, 2.5)));
    breach(g, n, 5, 5.5, 2.4, 3, 0, WALL_T - 1);
    breach(g, n, 27, 7, 2, 2.6, 0, WALL_T - 1);
  } else if (kind === 'windows') {
    // fallen in by its own corner tower, the facing slumped off the middle, a gap further on, a breach high up
    fallen(deepest(vee(-30, 7, 11, 1, 1.5), vee(18, 21, 3)));
    breakTop(g, n, 10, 22, 0, 2, top, vee(10, 22, 13, 1.6, 1.6));
    breakTop(g, n, 25, 31, 0, 1, top, () => 2);
    breach(g, n, 27.5, 24, 2.2, 3, 0, WALL_T - 1);
  } else {
    // the gate's wall: its right half fallen but for a stump, the parapet gone over the left
    fallen(deepest((u) => (u < 18 ? 0 : teeth(12, [23], 1.6)(u)), vee(11, 14, 2)));
    breakTop(g, n, 2, 10, 0, 1, top, () => 2);
    breach(g, n, 6, 22, 1.6, 2.2, 0, 2);
  }
  // the outer face spalled in patches, more high up than low
  spall(g, n, 0, HALL - 1, 2, GALLERY - 2, 0, 1, 0.16, true, 3, 2);
  spall(g, n, 0, HALL - 1, GALLERY + 5, WALK - 3, 0, 1, 0.3, true, 3, 2);
  // fallen blocks on the walkway's outer side, and a lantern or two in the gallery under its chains
  for (const x of [4, 13, 20, 29]) rubble(g, n, x, WALK + 1, 1.2, 1.6, x);
  for (const x of [3, 19]) hangLantern(g, x, GALLERY + 3, 4, 0);
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
  const n = noiseOf(id);
  if (broken) {
    // the turret broken down to its floor on the outer side, stumps of its walls standing on the inner; the stone of
    // it lying on the floor
    breakTop(g, n, 0, WALL_T - 1, 0, WALL_T - 1, t0 + 6, (x) => (x <= 2 ? 7 : x === 3 ? 5 : 3));
    rubble(g, n, 3.5, t0, 1.5, 1.5);
  } else {
    // a finial of basalt on one corner of the crown, a lantern in the turret
    g.fill(WALL_T - 1, t0 + 5, WALL_T - 1, WALL_T - 1, t0 + 7, WALL_T - 1, PBASALT).set(WALL_T - 1, t0 + 8, WALL_T - 1, slab(BS_));
    hangLantern(g, 3, t0 + 1, 3, 0);
  }
  spall(g, n, 0, WALL_T - 1, 2, WALK - 2, 0, 1, 0.16);
  spall(g, n, 0, WALL_T - 1, 2, WALK - 2, 0, 1, 0.16, false);
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

/** an extension's connector on its wall side (z 9, in the middle) at the deck, and its piglin (at `mx`, `mz`) */
function extensionEnds(g: BastionGrid, w: number, deck: number, mx = (w >> 1) - 2, mz = 5): void {
  g.connect(w >> 1, deck, 9, 'south', { name: T.extension });
  g.mob(mx, deck, mz, 'piglin');
}

/** a platform's far corner broken off, a stretch of its railing gone, a lantern on a post of it */
function weather(g: BastionGrid, id: string, w: number, deck: number): void {
  const n = noiseOf(id);
  const right = n(0, 0, 0) < 0.5, x0 = right ? w - 1 : 0, dx = right ? -1 : 1;
  for (let i = 0; i < 3; i++)
    for (let z = 0; z < 3 - i; z++) if (n(i, deck, z, 1) < 0.8 || i + z < 2) g.knock(x0 + dx * i, deck, z), g.knock(x0 + dx * i, deck - 1, z), g.knock(x0 + dx * i, deck + 1, z);
  for (let x = 3; x < w - 3; x++) if (n(x, deck, 0, 2) < 0.45) g.knock(x, deck + 1, 0);
  g.set(w - 1 - x0, deck + 1, 0, PBB_WALL).set(w - 1 - x0, deck + 2, 0, LANTERN_UP);
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
  // (its piglin beside the pool, not in it)
  extensionEnds(g, w, deck, 12, 4);
  weather(g, 'bastion/treasure/extensions/large_pool', w, deck);
  return element(g, 'bastion/treasure/extensions/large_pool', 'bastion_generic_degradation');
}

function smallPool(): PoolElement {
  const w = 9, deck = 10;
  const g = new BastionGrid(w, deck + 4, 10);
  platform(g, w, deck);
  for (let x = 3; x <= 5; x++) for (let z = 2; z <= 4; z++) g.set(x, deck, z, x === 4 && z === 3 ? LAVA : MAGMA);
  g.gold(1, deck, 7);
  extensionEnds(g, w, deck);
  weather(g, 'bastion/treasure/extensions/small_pool', w, deck);
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
  // a lantern on its chain, a corner of the roof fallen in
  hangLantern(g, 5, deck + 3, 3, 0);
  g.set(8, deck + 5, 6, AIR).set(7, deck + 5, 6, AIR).set(8, deck + 5, 5, AIR).set(8, deck + 4, 6, AIR).set(7, deck + 1, 5, slab(PBB_));
  weather(g, 'bastion/treasure/extensions/houses', w, deck);
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
        // the moat: lava laid in a lattice of magma, diamonds all the way round (vanilla's basin floor)
        const lattice = (x + z) % 4 === 1 || (x - z + BASE) % 4 === 1;
        g.set(x, 0, z, MAGMA);
        g.set(x, 1, z, lattice ? MAGMA : LAVA);
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
  // lanterns hung under the arms over the lava, the block's faces worn, a bite out of its shoulder fallen in the moat
  const n = noiseOf('bastion/treasure/bases/lava_basin');
  for (const [x, z] of [[2, 11], [BASE - 3, 12], [12, 2], [11, BASE - 3]]) hangLantern(g, x, BASE_TOP - 2, z, 1);
  for (const [v, back] of [[P0, P0 + 1], [P1, P1 - 1]]) {
    spall(g, n, P0 + 2, P1 - 2, 1, BASE_TOP - 3, v, back, 0.2);
    spall(g, n, P0 + 2, P1 - 2, 1, BASE_TOP - 3, v, back, 0.2, false);
  }
  breach(g, n, 15, 8.5, 1.8, 1.5, P1, P1);
  g.set(15, 1, P1 + 1, CPBB).set(14, 1, P1 + 2, BS).set(16, 1, P1 + 1, BS).set(15, 2, P1 + 1, slab(BS_));
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
  // lanterns on posts by the dais, gilded blackstone let into its bricks
  const id = `bastion/treasure/bases/centers/center_${n}`, nz = noiseOf(id);
  for (const [x, z] of [[3, 12], [10, 1]]) g.set(x, 0, z, PB_WALL).set(x, 1, z, LANTERN_UP);
  g.fill(0, 0, 0, 13, 7, 13, (x, y, z) => {
    const s = g.get(x, y, z);
    return (s === PBB || s === PB || s === BS) && !g.reserved(x, y, z) && nz(x, y, z, 5) < 0.25 ? GILD : s;
  });
  return element(g, id, 'treasure_rooms');
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
