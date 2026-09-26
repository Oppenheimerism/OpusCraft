// (bastions) The bridge (vanilla bastion/bridge/*, BastionBridgePools; the names are vanilla's, the pieces this
// game's own). The start, bastion/bridge/starting_pieces/entrance_base, is a great plinth standing in the lava, a
// flight of steps up its front and a vaulted undercroft inside. On it stands the gatehouse (bridge/starting_pieces:
// two towers either side of a high arch, or a sheer face with a snout of gold over its gate), and from its top the
// bridge (bridge/bridge_pieces/bridge) crosses 32 blocks of lava on legs (bridge/legs), the bastion_bridge chest
// half way over. At the far end a landing (bridge/connectors: level, or with a dais) is closed in by walls on three
// sides (bridge/walls: a keep with a room and a chest, or a curtain wall with a stair up its face), ramparts along
// their tops (bridge/ramparts). Brutes hold the bridge; piglins the gate, the walls and the ramparts. All of it is
// long fallen into ruin: the towers' corners fallen in, the railings gone here and there, the walls' tops broken away.

import {
  BastionGrid, element, bastionPool, seat, masonry, doorway, pillar, floor, h, stairs, slab, type Seatable,
  noiseOf, breakTop, breach, spall, rubble, hangLantern, vee, wearParapet, fall,
  PBB, CPBB, PB, CPB, BS, GOLD, BASALT, MAGMA, AIR, PBB_WALL, BS_WALL, PB_WALL, PBB_, BS_, PB_, LANTERN_UP,
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
  const id = 'bastion/bridge/starting_pieces/entrance_base';
  const g = new BastionGrid(BW, TOP + 1, BD + STEPS);
  // the plinth: a shell two thick, the undercroft inside on pillars
  masonry(g, 0, 0, 0, BW - 1, TOP - 1, BD - 1);
  g.fill(2, 1, 2, BW - 3, TOP - 3, BD - 3, AIR);
  for (let x = 7; x < BW - 4; x += 6) for (const z of [6, 11]) pillar(g, x, 1, TOP - 3, z);
  doorway(g, 5, 1, BD - 2, 3, 4, 2, true);
  g.set(6, 5, BD - 1, CPB);
  // its top (the gatehouse's floor and the terrace round it)
  floor(g, 0, 0, BW - 1, BD - 1, TOP);
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
  // ruin: the walls up the steps knocked about, the plinth's faces spalled, a breach in its west side into the
  // undercroft, the terrace's far corner crumbling
  const n = noiseOf(id);
  for (let k = 0; k < STEPS; k++) {
    const z = BD + STEPS - 1 - k, y = 1 + k;
    for (const x of [12, 21]) {
      const t = n(x, y, z, 1);
      if (t < 0.45) g.knock(x, y + 1, z);
      if (t < 0.15 && k > 1) g.knock(x, y, z);
    }
  }
  spall(g, n, 0, BD - 1, 1, TOP - 1, 0, 1, 0.2, false);
  spall(g, n, 0, BD - 1, 1, TOP - 1, BW - 1, BW - 2, 0.2, false);
  spall(g, n, 0, BW - 1, 1, TOP - 1, 0, 1, 0.2);
  for (const [x0, x1] of [[0, 11], [22, BW - 1]]) spall(g, n, x0, x1, 1, TOP - 1, BD - 1, BD - 2, 0.2);
  breach(g, n, 9, 4, 2.4, 2.2, 0, 1, false);
  breakTop(g, n, 28, BW - 1, 0, 1, TOP, vee(27, BW + 2, 2));
  return element(g, id, 'bastion_generic_degradation');
}

/**
 * the gatehouse's gate: 8 wide (x 13-20) and 11 high through its whole depth, stepped in at the top, lanterns on
 * chains hung from the steps of the arch; its floor (the gatehouse's own, a step over the plinth's top)
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
  for (const [x, z, n] of [[14, 3, 3], [19, 3, 4], [14, 8, 2], [19, 8, 3]]) hangLantern(g, x, 9, z, n);
}

/**
 * vanilla bastion/bridge/starting_pieces/entrance: two towers, the gate between, a walk over it; a chest in a tower.
 * The west tower's corner over the bridge has fallen in, the east tower's far corner is crumbling
 */
function entrance(): PoolElement {
  const id = 'bastion/bridge/starting_pieces/entrance';
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
  // ruin
  const n = noiseOf(id);
  for (const x0 of [0, 24]) {
    // (room over the towers' tops for what falls on them)
    g.fill(x0 + 1, 22, 1, x0 + 8, GH - 1, GD - 2, (x, y, z) => g.get(x, y, z) ?? AIR);
    wearParapet(g, n, x0, x0 + 9, 0, 22, 23);
    wearParapet(g, n, x0, x0 + 9, GD - 1, 22, 23);
    wearParapet(g, n, 0, GD - 1, x0, 22, 23, false);
    wearParapet(g, n, 0, GD - 1, x0 + 9, 22, 23, false);
    spall(g, n, x0, x0 + 9, 6, 20, 0, 1, 0.16);
    spall(g, n, x0, x0 + 9, 6, 20, GD - 1, GD - 2, 0.16);
    spall(g, n, 0, GD - 1, 6, 20, x0 === 0 ? 0 : GW - 1, x0 === 0 ? 1 : GW - 2, 0.16, false);
    // a lantern in each tower's room, rubble in a corner of it
    hangLantern(g, x0 + 5, 5, 7, 1);
    rubble(g, n, x0 + 6.5, 1, 9, 1.4);
  }
  fall(g, n, 0, 0, 6.5, 23, 11);
  fall(g, n, GW - 1, GD - 1, 4.5, 23, 6);
  rubble(g, n, 5, 22, 2.5, 1.6);
  rubble(g, n, 30, 22, 7.5, 1.3, 1);
  // the walk over the gate: its parapets worn, a bite out of its north side
  wearParapet(g, n, 10, 23, 0, 18, 19, true, 0.4);
  wearParapet(g, n, 10, 23, GD - 1, 18, 19, true, 0.4);
  breakTop(g, n, 10, 14, 0, 3, 19, vee(9, 15, 5));
  return element(g, id, 'entrance_replacement');
}

/**
 * vanilla bastion/bridge/starting_pieces/entrance_face: one sheer face toward the bridge, carved as a piglin's head,
 * its gate the mouth: the face set back a block, and standing out of it a great snout with two dark nostrils over the
 * gate, eyes deep under heavy brows with gold in them, tusks either side of the mouth and ears hanging at the corners
 */
function entranceFace(): PoolElement {
  const id = 'bastion/bridge/starting_pieces/entrance_face';
  const g = new BastionGrid(GW, GH, GD);
  masonry(g, 0, 0, 0, GW - 1, 19, GD - 1);
  // hollowed behind the face, but for buttresses
  g.fill(1, 1, 3, GW - 2, 18, GD - 2, AIR);
  for (const x of [1, 8, 25, 32]) g.fill(x, 1, 3, x + 1, 18, GD - 2, (xx, y, z) => (y % 6 === 5 ? CPB : h(xx, y, z, 83) < 0.2 ? BS : PBB));
  masonry(g, 10, 0, 1, 23, 19, GD - 1);
  gateArch(g);
  // the walk along the top and its merlons
  for (let x = 0; x < GW; x++) {
    for (let z = 0; z < 3; z++) g.set(x, 20, z, h(x, 20, z, 84) < 0.3 ? BS : PBB);
    const merlon = x % 4 < 2;
    g.set(x, 21, 0, merlon ? PBB : BS_WALL);
    if (merlon) g.set(x, 22, 0, PBB);
  }
  g.mob(16, 0, 6, 'piglin_melee').mob(6, 20, 1, 'piglin').mob(27, 20, 1, 'piglin');
  g.connect(16, 0, 6, 'down', { name: J.gate, top: 'north', joint: 'aligned' });
  piglinFace(g);
  // ruin: the merlons worn, a bite out of the top between the snout and the east ear, the jaw spalled; at the back a
  // breach into the hall behind the west half of the face, the fallen stone inside, a lantern hung over it
  const n = noiseOf(id);
  wearParapet(g, n, 6, GW - 7, 0, 21, 22);
  breakTop(g, n, 19, 24, 0, 2, 22, vee(18, 25, 4));
  spall(g, n, 1, GW - 2, 1, 10, 1, 2, 0.14);
  breach(g, n, 5, 2.6, 1.7, 2.2, GD - 1, GD - 1);
  rubble(g, n, 5.5, 1, GD - 3.5, 1.6);
  hangLantern(g, 5, 18, 6, 4);
  return element(g, id, 'bastion_generic_degradation');
}

/**
 * the piglin's head on the gatehouse's face (z 0, toward the bridge; the gate at x 13-20 its mouth). The face is set
 * back to z 1 and what makes the head stands out of it at z 0
 */
function piglinFace(g: BastionGrid): void {
  // the face set back, but for its rim
  g.fill(1, 1, 0, GW - 2, 19, 0, (x, y, z) => (x >= 13 && x <= 20 && y <= 11 ? g.get(x, y, z) : AIR));
  // the snout: a block of chiseled blackstone rimmed with polished, standing out over the mouth, its nostrils deep
  g.fill(11, 12, 0, 22, 17, 0, (x, y) => (x === 11 || x === 22 || y === 12 || y === 17 ? PB : CPB));
  for (const x0 of [13, 19]) g.fill(x0, 14, 0, x0 + 1, 15, 1, AIR).fill(x0, 14, 2, x0 + 1, 15, 2, BS);
  g.set(11, 17, 0, stairs(PB_, 'east', 'top')).set(22, 17, 0, stairs(PB_, 'west', 'top'));
  // the eyes, sunk two deep, gold at the back of them, under brows that come down toward the snout
  for (const [x0, inner] of [[5, 1], [24, -1]] as const) {
    g.fill(x0, 15, 0, x0 + 4, 17, 1, AIR).fill(x0, 15, 2, x0 + 4, 17, 2, BS);
    const px = inner > 0 ? x0 + 2 : x0 + 1;
    g.fill(px, 15, 2, px + 1, 16, 2, GOLD);
    for (let i = 0; i <= 6; i++) {
      const x = inner > 0 ? x0 - 1 + i : x0 + 5 - i;
      const y = i >= 5 ? 17 : 18;
      g.set(x, y, 0, stairs(PBB_, 'south', 'top'));
      if (i >= 5) g.set(x, 18, 0, PBB);
    }
  }
  // tusks up out of the jaw either side of the mouth (the east one broken off)
  g.fill(12, 1, 0, 12, 4, 0, (_x, y) => (y === 4 ? CPB : PB)).set(12, 5, 0, stairs(PB_, 'east'));
  g.fill(21, 1, 0, 21, 2, 0, PB).set(21, 3, 0, slab(PB_));
  // the ears, hanging from the top corners, their edges stepped
  for (const side of [0, 1]) {
    for (let y = 12; y <= 22; y++) {
      const w = Math.min(5, (y - 12) >> 1);
      for (let i = 0; i <= w; i++) {
        const x = side ? GW - 1 - i : i;
        g.set(x, y, 0, i === w && y < 21 ? stairs(PBB_, side ? 'west' : 'east', y % 2 ? 'bottom' : 'top') : y === 22 ? slab(PBB_) : PBB);
      }
    }
  }
  // the jaw's line under the face
  g.fill(1, 0, 0, GW - 2, 0, 0, (x) => (x >= 13 && x <= 20 ? g.get(x, 0, 0) : CPB));
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
  // ruin: a stretch of each railing fallen into the lava and the deck's edge with it, a hole through the deck, the
  // piers' caps and the truss knocked about, what fell of them lying on the deck (the way over three blocks wide
  // all along)
  const n = noiseOf('bastion/bridge/bridge_pieces/bridge');
  breakTop(g, n, 17, 22, W - 1, W - 1, DECK + 2, vee(16, 23, 5), false);
  breakTop(g, n, 26, 29, 0, 0, DECK + 2, vee(25, 30, 3), false);
  for (let x = 4; x <= 5; x++) for (let z = 11; z <= 12; z++) g.knock(x, DECK, z), g.knock(x, DECK - 1, z);
  for (let z = 0; z < LEN; z += 4) for (const x of [0, W - 1]) if (n(x, DECK + 2, z, 2) < 0.35) g.knock(x, DECK + 2, z);
  for (let z = 0; z < LEN; z++) for (let x = 1; x < W - 1; x++) if (n(x, DECK - 2, z, 3) < 0.18) g.knock(x, DECK - 2, z);
  rubble(g, n, 5.2, DECK + 1, 20, 1.3);
  rubble(g, n, 1.6, DECK + 1, 27.5, 1.2, 1);
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
  const id = broken ? 'bastion/bridge/legs/leg_1' : 'bastion/bridge/legs/leg_0';
  const n = noiseOf(id);
  // its broken end the more ragged, its faces spalled (over the lava sea only: the bridge's legs stand 11 deep in it)
  if (broken) for (let x = 1; x < W - 1; x++) for (let z = 0; z < 5; z++) if (g.get(x, 9, z) === null && n(x, 10, z, 1) < 0.45) g.set(x, 10, z, null);
  spall(g, n, 1, W - 2, 12, H - 3, 0, 1, 0.25);
  spall(g, n, 1, W - 2, 12, H - 3, 4, 3, 0.25);
  spall(g, n, 0, 4, 12, H - 3, 1, 2, 0.25, false);
  spall(g, n, 0, 4, 12, H - 3, W - 2, W - 3, 0.25, false);
  g.connect(3, H - 1, 2, 'up', { name: J.leg, top: 'north', joint: 'aligned' });
  return element(g, id, 'bastion_generic_degradation');
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
  // ruin: the loggia's north-east corner fallen in, its post broken off and the roof round it gone, the rubble of it
  // on the deck; or (no loggia) a bite out of the landing's open edge, rubble, a lantern on a post by the bridge
  const id = top ? 'bastion/bridge/connectors/back_bridge_top' : 'bastion/bridge/connectors/back_bridge_bottom';
  const n = noiseOf(id);
  if (top) {
    fall(g, n, LW - 1, 0, 5.5, DECK + 7, 4);
    g.fill(LW - 1, DECK + 3, 0, LW - 1, DECK + 5, 0, AIR);
    rubble(g, n, 11.5, DECK + 1, 1.2, 1.6);
  } else {
    breakTop(g, n, 9, LW - 1, LD - 2, LD - 1, DECK, vee(8, LW + 1, 3));
    rubble(g, n, 10, DECK + 1, 4.5, 1.4);
    g.fill(0, DECK + 1, LD - 1, 0, DECK + 2, LD - 1, PB_WALL).set(0, DECK + 3, LD - 1, LANTERN_UP);
  }
  return element(g, id, 'bastion_generic_degradation');
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
    // (a piglin on the stair, half way up)
    g.mob(7, FOOT + 8, WT - 1, 'piglin');
  }
  g.connect(7, WH - 1, 3, 'up', { target: J.rampart, pool: 'bastion/bridge/ramparts', top: 'north', joint: 'aligned' });
  g.connect(7, FOOT, WT - 1, 'south', { name: J.wall });
  // ruin: the outer half of the wall's top fallen away in the middle (x 3-11, z 0-2; the ramparts over it are gone
  // there too, their walk along the inner half still joining the walls' ends; in the keep, the upper room's outer
  // wall is broken down to a sill two high), its outer face spalled (under the keep's rooms only, where it's thick),
  // a breach in the curtain wall's
  const id = keep ? 'bastion/bridge/walls/wall_base_0' : 'bastion/bridge/walls/wall_base_1';
  const n = noiseOf(id);
  breakTop(g, n, 3, 11, 0, 2, WH - 1, vee(3, 11, keep ? 4 : 7, 1.4, 1.4));
  spall(g, n, 0, LW - 1, 3, keep ? FOOT - 1 : WH - 4, 0, 1, 0.18);
  spall(g, n, 0, WT - 1, 3, keep ? FOOT - 1 : WH - 4, 0, 1, 0.18, false);
  if (!keep) breach(g, n, 5, 17, 2.3, 2.6, 0, 2);
  return element(g, id, 'rampart_degradation');
}

/** a lantern hung on a link of chain from (x, y + 1, z) (a plain lantern: only soul fire and soul lanterns drive piglins off) */
function hang(g: BastionGrid, x: number, y: number, z: number): void {
  hangLantern(g, x, y, z, 1);
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
      g.set(x, 1, z, merlon ? PBB : PBB_WALL);
      if (merlon) g.set(x, 2, z, h(x, 2, z, 93) < 0.2 ? slab(PBB_) : PBB);
    }
  // (rampart_1: a merlon fallen onto the walk's outer side)
  if (n === 1) g.set(13, 1, 1, CPBB).set(12, 1, 2, slab(PBB_));
  g.mob(4, 0, 3, 'piglin').gold(11, 0, 4);
  g.connect(7, 0, 3, 'down', { name: J.rampart, top: 'north', joint: 'aligned' });
  // ruin: its outer half gone over the walls' fallen middle (x 3-11, z 0-2), its merlons worn, a hole in its floor
  // where the curtain wall's stair comes up under it (and so out onto it)
  const id = `bastion/bridge/ramparts/rampart_${n}`;
  const ns = noiseOf(id);
  g.fill(3, 0, 0, 11, 2, 2, AIR);
  for (let x = 2; x <= 12; x += 10) for (let z = 0; z <= 2; z++) if (ns(x, 0, z, 2) < 0.5) g.knock(x, 2, z), g.knock(x, 1, z);
  wearParapet(g, ns, 0, LW - 1, 0, 1, 2);
  wearParapet(g, ns, 0, WT - 1, 0, 1, 2, false);
  wearParapet(g, ns, 0, WT - 1, LW - 1, 1, 2, false);
  for (let x = 1; x <= 4; x++) for (let z = 5; z < WT; z++) if (x > 1 || ns(x, 0, z, 1) < 0.5) g.knock(x, 0, z);
  return element(g, id, 'rampart_degradation');
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
