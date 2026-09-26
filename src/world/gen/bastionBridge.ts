// (bastions) The bridge (vanilla bastion/bridge/*, BastionBridgePools; the names are vanilla's, the pieces this
// game's own). The start, bastion/bridge/starting_pieces/entrance_base, is a great plinth standing in the lava, a
// flight of steps up its front and a vaulted undercroft inside. On it stands the gatehouse (bridge/starting_pieces:
// two towers either side of a high arch, or a sheer face with a snout of gold over its gate), and from its top the
// bridge (bridge/bridge_pieces/bridge) crosses 32 blocks of lava on legs (bridge/legs), the bastion_bridge chest
// half way over. At the far end a landing (bridge/connectors: level, or with a dais) is closed in by walls on three
// sides (bridge/walls: a keep with a room and a chest, or a curtain wall with a stair up its face), ramparts along
// their tops (bridge/ramparts). Brutes hold the bridge; piglins the gate, the walls and the ramparts.

import {
  BastionGrid, element, bastionPool, seat, masonry, doorway, pillar, floor, h, stairs, slab, type Seatable,
  PBB, CPBB, PB, CPB, BS, GOLD, BASALT, MAGMA, AIR, CHAIN, PBB_WALL, BS_WALL, PBB_, BS_, PB_,
} from './bastionPieces';
import type { PoolElement } from './jigsaw';

/** the connectors' names */
const J = {
  gate: 'bastion:bridge_gate',
  bridge: 'bastion:bridge',
  leg: 'bastion:bridge_leg',
  landing: 'bastion:bridge_connector',
  wall: 'bastion:bridge_wall',
  rampart: 'bastion:bridge_rampart',
};

/** the plinth: 34 wide, 18 deep and its steps 11 more, its top at y 11 (the bridge's deck) */
const BW = 34, BD = 18, STEPS = 11, TOP = 11;
/** the gatehouse: as wide as the plinth, 12 deep, 25 high */
const GW = BW, GD = 12, GH = 25;
/** the bridge: 7 wide, 32 long, its deck at y 3 */
const W = 7, LEN = 32, DECK = 3;
/** the far landing and its walls: 15 wide; the walls 7 thick and 26 high, their foot 12 below the deck */
const LW = 15, LD = 9, WT = 7, WH = 26, FOOT = 12;

const GATE: Seatable = { sx: GW, sz: GD, jx: 16, jy: 0, jz: 6 };

// ---------------------------------------------------------------------------------------------------------------
// The plinth (the start) and the gatehouse

/** vanilla bastion/bridge/starting_pieces/entrance_base */
function entranceBase(): PoolElement {
  const g = new BastionGrid(BW, TOP + 1, BD + STEPS);
  // the plinth: a shell two thick, the undercroft inside on pillars
  masonry(g, 0, 0, 0, BW - 1, TOP - 1, BD - 1);
  g.fill(2, 1, 2, BW - 3, TOP - 3, BD - 3, AIR);
  for (let x = 7; x < BW - 4; x += 6) for (const z of [6, 11]) pillar(g, x, 1, TOP - 3, z);
  doorway(g, 5, 1, BD - 2, 3, 4, 2, true);
  g.set(6, 5, BD - 1, CPB);
  // its top (the gatehouse's floor and the terrace round it)
  floor(g, 0, TOP, BW - 1, BD - 1, TOP);
  // the steps up the front, walls either side
  for (let k = 0; k < STEPS; k++) {
    const z = BD + STEPS - 1 - k, y = 1 + k;
    for (let x = 13; x <= 20; x++) {
      g.fill(x, 0, z, x, y - 1, z, (xx, yy, zz) => (yy === 0 ? BS : h(xx, yy, zz, 80) < 0.2 ? BS : PBB));
      g.set(x, y, z, stairs(x === 13 || x === 20 ? PB_ : PBB_, 'north'));
    }
    for (const x of [12, 21]) {
      g.fill(x, 0, z, x, y, z, PBB);
      g.set(x, y + 1, z, k % 3 === 0 ? PB : PBB_WALL);
    }
  }
  // (on the terrace, clear of where the gatehouse goes: what stands on the top is outside this piece)
  g.mob(8, TOP, BD - 2, 'piglin').mob(26, TOP, 1, 'piglin').mob(16, 6, BD + 5, 'piglin');
  g.gold(3, TOP, 1).gold(30, TOP, BD - 2);
  seat(g, 0, TOP + 1, 3, 0, GATE, J.gate, 'bastion/bridge/starting_pieces');
  g.connect(16, TOP, 0, 'north', { target: J.bridge, pool: 'bastion/bridge/bridge_pieces' });
  return element(g, 'bastion/bridge/starting_pieces/entrance_base', 'bastion_generic_degradation');
}

/**
 * the gatehouse's gate: 8 wide (x 13-20) and 11 high through its whole depth, stepped in at the top, chains in it;
 * its floor (the gatehouse's own, a step over the plinth's top)
 */
function gateArch(g: BastionGrid): void {
  g.fill(13, 1, 0, 20, 9, GD - 1, AIR);
  floor(g, 13, 0, 20, GD - 1, 0);
  g.fill(14, 10, 0, 19, 10, GD - 1, AIR);
  g.fill(15, 11, 0, 18, 11, GD - 1, AIR);
  for (let z = 0; z < GD; z++) {
    g.set(13, 9, z, stairs(PBB_, 'east', 'top')).set(20, 9, z, stairs(PBB_, 'west', 'top'));
    g.set(14, 10, z, stairs(PBB_, 'east', 'top')).set(19, 10, z, stairs(PBB_, 'west', 'top'));
  }
  for (const [x, z, n] of [[14, 3, 3], [19, 3, 4], [14, 8, 2], [19, 8, 3]]) for (let i = 0; i < n; i++) g.set(x, 8 - i, z, CHAIN);
}

/** vanilla bastion/bridge/starting_pieces/entrance: two towers, the gate between, a walk over it; a chest in a tower */
function entrance(): PoolElement {
  const g = new BastionGrid(GW, GH, GD);
  for (const x0 of [0, 24]) {
    masonry(g, x0, 0, 0, x0 + 9, 21, GD - 1);
    // a room in the foot of each tower, its door onto the gate
    g.fill(x0 + 1, 1, 1, x0 + 8, 5, GD - 2, AIR);
    floor(g, x0 + 1, 1, x0 + 8, GD - 2, 0);
    doorway(g, x0 === 0 ? 9 : 24, 1, 5, 2, 4, 1, false);
    // bands, the tower's top: a floor, merlons
    for (let x = x0; x <= x0 + 9; x++)
      for (let z = 0; z < GD; z++) {
        const edge = x === x0 || z === 0 || x === x0 + 9 || z === GD - 1;
        if (!edge) continue;
        g.set(x, 12, z, (x + z) % 3 === 0 ? CPB : PB);
        const merlon = (x + z) % 2 === 0;
        g.set(x, 22, z, merlon ? PBB : PBB_WALL);
        if (merlon) g.set(x, 23, z, h(x, 23, z, 81) < 0.2 ? slab(PBB_) : PBB);
      }
    floor(g, x0, 0, x0 + 9, GD - 1, 21);
    for (const x of [x0 + 2, x0 + 7]) g.fill(x, 15, 0, x, 17, 0, AIR).set(x, 15, 0, PBB_WALL);
  }
  g.chest(2, 1, 2, 'south', 'bastion_other');
  // the middle: the gate, and the wall over it with a walk along its top
  masonry(g, 10, 0, 0, 23, 16, GD - 1);
  gateArch(g);
  for (let x = 10; x <= 23; x++) {
    for (let z = 0; z < GD; z++) g.set(x, 17, z, h(x, 17, z, 82) < 0.3 ? BS : PBB);
    for (const z of [0, GD - 1]) {
      const merlon = x % 3 !== 1;
      g.set(x, 18, z, merlon ? PBB : BS_WALL);
      if (merlon) g.set(x, 19, z, PBB);
    }
  }
  g.set(15, 13, 0, GOLD).set(18, 13, 0, GOLD).set(16, 14, 0, CPB).set(17, 14, 0, CPB);
  g.mob(16, 0, 6, 'piglin_melee');
  g.mob(5, 21, 5, 'piglin').mob(28, 21, 6, 'piglin').mob(17, 17, 5, 'piglin').mob(28, 0, 4, 'piglin');
  g.connect(16, 0, 6, 'down', { name: J.gate, top: 'north', joint: 'aligned' });
  return element(g, 'bastion/bridge/starting_pieces/entrance', 'entrance_replacement');
}

/** vanilla bastion/bridge/starting_pieces/entrance_face: one sheer face, the gate in it, a snout of gold over the gate */
function entranceFace(): PoolElement {
  const g = new BastionGrid(GW, GH, GD);
  masonry(g, 0, 0, 0, GW - 1, 19, GD - 1);
  // hollowed behind the face, but for buttresses
  g.fill(1, 1, 3, GW - 2, 18, GD - 2, AIR);
  for (const x of [1, 8, 25, 32]) g.fill(x, 1, 3, x + 1, 18, GD - 2, (xx, y, z) => (y % 6 === 5 ? CPB : h(xx, y, z, 83) < 0.2 ? BS : PBB));
  masonry(g, 10, 0, 1, 23, 19, GD - 1);
  gateArch(g);
  // the snout: a plate of chiseled blackstone, two nostrils of gold
  g.fill(12, 13, 0, 21, 17, 0, (x, y) => (x === 12 || x === 21 || y === 13 || y === 17 ? PB : CPB));
  g.fill(14, 14, 0, 15, 16, 0, GOLD).fill(18, 14, 0, 19, 16, 0, GOLD);
  // the walk along the top and its merlons
  for (let x = 0; x < GW; x++) {
    for (let z = 0; z < 3; z++) g.set(x, 20, z, h(x, 20, z, 84) < 0.3 ? BS : PBB);
    const merlon = x % 4 < 2;
    g.set(x, 21, 0, merlon ? PBB : BS_WALL);
    if (merlon) g.set(x, 22, 0, PBB);
  }
  g.mob(16, 0, 6, 'piglin_melee').mob(6, 20, 1, 'piglin').mob(27, 20, 1, 'piglin');
  g.connect(16, 0, 6, 'down', { name: J.gate, top: 'north', joint: 'aligned' });
  return element(g, 'bastion/bridge/starting_pieces/entrance_face', 'bastion_generic_degradation');
}

// ---------------------------------------------------------------------------------------------------------------
// The bridge and its legs

/** vanilla bastion/bridge/bridge_pieces/bridge: 7 wide, 32 long (north to south), its deck at y 3 on a truss */
function bridge(): PoolElement {
  const g = new BastionGrid(W, DECK + 4, LEN);
  g.fill(0, DECK + 1, 0, W - 1, DECK + 3, LEN - 1, AIR);
  for (let z = 0; z < LEN; z++) {
    for (let x = 0; x < W; x++) {
      g.set(x, DECK, z, x === 0 || x === W - 1 ? PBB : x === 3 ? PB : h(x, DECK, z, 85) < 0.35 ? BS : PBB);
      g.set(x, DECK - 1, z, x === 0 || x === W - 1 ? stairs(PBB_, x === 0 ? 'east' : 'west', 'top') : PBB);
    }
    // the railings: walls, a pier of bricks every fourth block
    const pier = z % 4 === 0;
    for (const x of [0, W - 1]) {
      g.set(x, DECK + 1, z, pier ? PBB : PBB_WALL);
      if (pier) g.set(x, DECK + 2, z, z % 8 === 0 ? CPB : slab(PBB_));
    }
  }
  // the truss: arches from leg to leg
  for (const [z0, z1] of [[0, 7], [9, 22], [24, 31]])
    for (let z = z0; z <= z1; z++) {
      const d = Math.min(z - z0, z1 - z);
      if (d > 1) continue;
      for (let x = 1; x < W - 1; x++) g.set(x, DECK - 2, z, d === 0 ? PBB : stairs(PBB_, z - z0 < z1 - z ? 'south' : 'north', 'top'));
    }
  for (const z of [8, 23]) g.fill(1, 0, z, W - 2, DECK - 1, z, (x, y, zz) => (y === 0 ? CPB : h(x, y, zz, 86) < 0.2 ? BS : PBB));
  // the chest half way over, gold on the railings
  g.chest(1, DECK + 1, 15, 'east', 'bastion_bridge');
  g.set(1, DECK + 1, 14, slab(BS_)).set(1, DECK + 1, 16, slab(BS_));
  g.set(W - 1, DECK + 1, 10, GOLD).set(0, DECK + 1, 21, GOLD);
  g.mob(3, DECK, 17, 'piglin_melee').mob(3, DECK, 6, 'piglin').mob(4, DECK, 26, 'piglin_melee');
  g.gold(5, DECK, 13);
  for (const z of [8, 23]) g.connect(3, 0, z, 'down', { target: J.leg, pool: 'bastion/bridge/legs', top: 'north', joint: 'aligned' });
  g.connect(3, DECK, 0, 'north', { target: J.landing, pool: 'bastion/bridge/connectors' });
  g.connect(3, DECK, LEN - 1, 'south', { name: J.bridge });
  return element(g, 'bastion/bridge/bridge_pieces/bridge', 'bridge');
}

/** vanilla bastion/bridge/legs/*: a pier 20 high from under the bridge down into the lava; the broken one stops short */
function leg(broken: boolean): PoolElement {
  const H = 20;
  const g = new BastionGrid(W, H, 5);
  for (let y = broken ? 9 : 0; y < H; y++)
    for (let x = 0; x < W; x++)
      for (let z = 0; z < 5; z++) {
        const wide = y < 4;
        if (!wide && (x === 0 || x === W - 1)) continue;
        const corner = (x === 1 || x === W - 2) && (z === 0 || z === 4);
        g.set(x, y, z, wide && h(x, y, z, 87) < 0.3 ? MAGMA : corner ? (y % 5 === 0 ? CPB : BASALT) : h(x, y, z, 88) < 0.25 ? BS : PBB);
      }
  if (broken) for (let x = 1; x < W - 1; x++) for (let z = 0; z < 5; z++) if (h(x, 9, z, 89) < 0.5) g.set(x, 9, z, null);
  g.connect(3, H - 1, 2, 'up', { name: J.leg, top: 'north', joint: 'aligned' });
  return element(g, broken ? 'bastion/bridge/legs/leg_1' : 'bastion/bridge/legs/leg_0', 'bastion_generic_degradation');
}

// ---------------------------------------------------------------------------------------------------------------
// The far landing, its walls and their ramparts

/**
 * vanilla bastion/bridge/connectors/*: the landing at the bridge's far end, 15 x 9, its deck at y 3 (the bridge's
 * level) on a foundation with a leg under it; the walls stand on three sides. back_bridge_top has a dais along its
 * north side, the wall there standing on it
 */
function landing(top: boolean): PoolElement {
  const g = new BastionGrid(LW, 11, LD);
  g.fill(0, DECK + 1, 0, LW - 1, 10, LD - 1, AIR);
  masonry(g, 0, 0, 0, LW - 1, DECK - 1, LD - 1);
  floor(g, 0, 0, LW - 1, LD - 1, DECK);
  if (top) {
    // a loggia over the landing: posts of basalt at its corners, a roof of slabs on beams
    for (const [x, z] of [[0, 0], [LW - 1, 0], [0, LD - 1], [LW - 1, LD - 1], [7, LD - 1]]) pillar(g, x, DECK + 1, DECK + 5, z);
    for (let x = 0; x < LW; x++)
      for (let z = 0; z < LD; z++) {
        const beam = x === 0 || x === LW - 1 || z === 0 || z === LD - 1;
        g.set(x, DECK + 6, z, beam ? PBB : slab(BS_, 'top'));
        if (beam && (x + z) % 2 === 0) g.set(x, DECK + 7, z, slab(PBB_));
      }
    g.set(1, DECK + 1, 1, GOLD).set(13, DECK + 1, 1, GOLD);
    hang(g, 7, DECK + 5, 4);
  }
  g.mob(3, DECK, 6, 'piglin').gold(12, DECK, 6);
  g.connect(7, DECK, 0, 'north', { target: J.wall, pool: 'bastion/bridge/walls' });
  g.connect(0, DECK, 4, 'west', { target: J.wall, pool: 'bastion/bridge/walls' });
  g.connect(LW - 1, DECK, 4, 'east', { target: J.wall, pool: 'bastion/bridge/walls' });
  g.connect(7, 0, 4, 'down', { target: J.leg, pool: 'bastion/bridge/legs', top: 'north', joint: 'aligned' });
  g.connect(3, DECK, LD - 1, 'south', { name: J.landing });
  return element(g, top ? 'bastion/bridge/connectors/back_bridge_top' : 'bastion/bridge/connectors/back_bridge_bottom', 'bastion_generic_degradation');
}

/**
 * a wall at the landing, 15 wide and 7 thick, its foot 12 below the deck in the lava and its top 13 over it; its
 * inner face (z 6) on the landing. vanilla bastion/bridge/walls/wall_base_0: a keep, a room at the deck's level (a
 * chest in it) and another over it. wall_base_1: a curtain wall, blind arches, a stair up its inner face
 */
function wall(keep: boolean): PoolElement {
  const g = new BastionGrid(LW, WH, WT);
  masonry(g, 0, 0, 0, LW - 1, WH - 1, WT - 1);
  // its foot in the lava: blackstone and magma
  for (let x = 0; x < LW; x++) for (let z = 0; z < WT; z++) for (let y = 0; y < 3; y++) if (h(x, y, z, 91) < 0.35) g.set(x, y, z, MAGMA);
  for (let x = 0; x < LW; x++) g.set(x, FOOT - 1, WT - 1, (x & 3) === 1 ? CPB : PB).set(x, WH - 2, 0, (x & 3) === 3 ? CPB : PB);
  if (keep) {
    g.fill(1, FOOT + 1, 1, LW - 2, FOOT + 5, WT - 2, AIR);
    floor(g, 1, 1, LW - 2, WT - 2, FOOT);
    doorway(g, 6, FOOT + 1, WT - 1, 3, 4, 1, true);
    g.fill(1, FOOT + 7, 1, LW - 2, FOOT + 10, WT - 2, AIR);
    floor(g, 1, 1, LW - 2, WT - 2, FOOT + 6);
    // a stair up to the room over it, along the outer wall
    g.fill(3, FOOT + 6, 1, 6, FOOT + 6, 1, AIR);
    for (let k = 0; k < 6; k++) g.set(2 + k, FOOT + 1 + k, 1, stairs(PBB_, 'east')).fill(2 + k, FOOT + 1, 1, 2 + k, FOOT + k, 1, PBB);
    for (const x of [3, 7, 11]) g.fill(x, FOOT + 8, 0, x, FOOT + 9, 0, AIR).set(x, FOOT + 8, 0, PBB_WALL);
    g.chest(12, FOOT + 1, 2, 'west', 'bastion_other');
    g.set(12, FOOT + 1, 1, GOLD);
    hang(g, 7, FOOT + 5, 3);
    g.mob(8, FOOT, 3, 'piglin').mob(9, FOOT + 6, 3, 'piglin');
  } else {
    // blind arches on the inner face, a stair climbing it to the top
    for (const x0 of [1, 9]) g.fill(x0, FOOT + 1, WT - 1, x0 + 4, FOOT + 7, WT - 1, (x, y) => (y === FOOT + 7 ? (x === x0 || x === x0 + 4 ? PBB : stairs(PBB_, 'south', 'top')) : x === x0 || x === x0 + 4 ? PB : BS));
    for (let k = 0; k < WH - FOOT - 1; k++) {
      const x = LW - 1 - k;
      if (x < 0) break;
      g.fill(x, FOOT + 1 + k, WT - 2, x, WH - 1, WT - 1, AIR);
      g.set(x, FOOT + 1 + k, WT - 2, stairs(BS_, 'west')).set(x, FOOT + 1 + k, WT - 1, stairs(BS_, 'west'));
    }
    g.mob(7, FOOT + 7, WT - 1, 'piglin');
  }
  g.connect(7, WH - 1, 3, 'up', { target: J.rampart, pool: 'bastion/bridge/ramparts', top: 'north', joint: 'aligned' });
  g.connect(7, FOOT, WT - 1, 'south', { name: J.wall });
  return element(g, keep ? 'bastion/bridge/walls/wall_base_0' : 'bastion/bridge/walls/wall_base_1', 'rampart_degradation');
}

/** a chain from (x, y, z) with a soul lantern at its end */
function hang(g: BastionGrid, x: number, y: number, z: number): void {
  g.set(x, y, z, CHAIN).set(x, y - 1, z, 'soul_lantern[hanging=true]');
}

/** vanilla bastion/bridge/ramparts/*: along a wall's top, merlons on the outer edge and the ends */
function rampart(n: number): PoolElement {
  const g = new BastionGrid(LW, 3, WT);
  for (let x = 0; x < LW; x++)
    for (let z = 0; z < WT; z++) {
      g.set(x, 0, z, h(x, 0, z, 92) < 0.3 ? BS : PBB);
      const edge = z === 0 || x === 0 || x === LW - 1;
      if (!edge) continue;
      const merlon = (x + z) % 3 !== 1;
      if (n === 1 && x > 4 && x < 10 && z === 0) continue;
      g.set(x, 1, z, merlon ? PBB : PBB_WALL);
      if (merlon) g.set(x, 2, z, h(x, 2, z, 93) < 0.2 ? slab(PBB_) : PBB);
    }
  if (n === 1) g.set(7, 1, 1, CPBB).set(6, 1, 2, slab(PBB_));
  g.mob(4, 0, 3, 'piglin').gold(11, 0, 4);
  g.connect(7, 0, 3, 'down', { name: J.rampart, top: 'north', joint: 'aligned' });
  return element(g, `bastion/bridge/ramparts/rampart_${n}`, 'rampart_degradation');
}

// ---------------------------------------------------------------------------------------------------------------
// The pools (vanilla BastionBridgePools)

export const BRIDGE_START = entranceBase();

bastionPool('bastion/bridge/starting_pieces', [[entrance(), 1], [entranceFace(), 1]]);
bastionPool('bastion/bridge/bridge_pieces', [[bridge(), 1]]);
bastionPool('bastion/bridge/legs', [[leg(false), 1], [leg(true), 1]]);
bastionPool('bastion/bridge/walls', [[wall(true), 1], [wall(false), 1]]);
bastionPool('bastion/bridge/ramparts', [[rampart(0), 1], [rampart(1), 1]]);
bastionPool('bastion/bridge/connectors', [[landing(true), 1], [landing(false), 1]]);
