// (trial chambers) The trial chambers' pieces and pools, drawn in code after vanilla's TrialChambersStructurePools
// (the names are vanilla's; the rooms are this game's own). Tuff bricks, polished and chiseled tuff, with waxed copper
// trim, grates and bulbs (some left to age as they're placed). The structure starts from an end room
// (trial_chambers/chamber/end) and grows along wide corridors (straight runs, plates with pots and chests, stairs,
// intersections on one or two levels, an atrium with a grand staircase), with doors off them into the chambers
// (trial_chambers/chambers/end: the eight rooms of trials, each with its spawners, its vaults and its supplies), and
// narrow hallways off the chambers (turns, staircases, rubble, small encounters and caches) that lead back to the
// corridors. A connector nothing fits at is walled off (the fallback caps).
//
// Pieces of this game's own, to keep a structure the size and shape of vanilla's with rooms of other sizes: the end
// rooms have doors of their own into chambers, a corridor can end in a dead-end alcove with a chest
// (trial_chambers/corridor/end_1), a hallway can end in a doorway into a chamber
// (trial_chambers/hallway/chamber_entrance), and a door no chamber fits at opens into a small storeroom with a barrel
// (trial_chambers/chamber/storeroom, the chambers' fallback) before it's walled off.
//
// The spawners are pieces of their own, one per mob, named by what they spawn (trial_chambers/spawner/melee/zombie,
// ...), and a room asks for a kind (trial_chambers/spawner/contents/melee, ...): the structure's pool aliases decide
// which mob that kind is for the whole structure (vanilla ALIAS_BINDINGS). The vaults (trial_chambers/reward/...) face
// into their room; the chambers' supply chests, the corridors' and the intersections' chests and barrels, the wall
// dispensers and the pots carry vanilla's loot tables (game/trialChamberLoot.ts).

import { pool, EMPTY, type Dir6, type PoolElement } from './jigsaw';
import { Grid, TrialElement } from './trialChamberPieces';

// ---------------------------------------------------------------------------------------------------------------
// The palette

const TB = 'tuff_bricks', PT = 'polished_tuff', CT = 'chiseled_tuff', CTB = 'chiseled_tuff_bricks', TU = 'tuff';
const CU = 'waxed_copper_block', CUT = 'waxed_cut_copper', CCH = 'waxed_chiseled_copper', GR = 'waxed_copper_grate';
const OCU = 'waxed_oxidized_copper', OCUT = 'waxed_oxidized_cut_copper', OGR = 'waxed_oxidized_copper_grate', OCCH = 'waxed_oxidized_chiseled_copper';
const ECUT = 'waxed_exposed_cut_copper', WCUT = 'waxed_weathered_cut_copper';
const BULB = 'waxed_copper_bulb[lit=true]';
const AIR = 'air';
const stairs = (b: string, facing: string, half: 'top' | 'bottom' = 'bottom', shape = 'straight') => `${b}[facing=${facing},half=${half},shape=${shape}]`;
const TBS = 'tuff_brick_stairs', PTS = 'polished_tuff_stairs', CUS = 'waxed_cut_copper_stairs';
const slab = (b: string, type: 'top' | 'bottom' = 'bottom') => `${b}[type=${type}]`;
const TBSL = 'tuff_brick_slab', PTSL = 'polished_tuff_slab', CUSL = 'waxed_cut_copper_slab';
const trapdoor = (facing: string, half: 'top' | 'bottom', open: boolean) => `waxed_copper_trapdoor[facing=${facing},half=${half},open=${open}]`;
const OPP: Record<string, string> = { north: 'south', south: 'north', west: 'east', east: 'west' };

// ---------------------------------------------------------------------------------------------------------------
// Connectors and pools

/** the connector names: what a piece offers, and what its connectors ask for */
const J = {
  corridor: 'trial_chambers:corridor',
  door: 'trial_chambers:chamber_entrance',
  hallway: 'trial_chambers:hallway',
  spawner: 'trial_chambers:spawner',
  reward: 'trial_chambers:reward',
  decor: 'trial_chambers:decor',
  chest: 'trial_chambers:chest',
};

export const START_POOL = 'trial_chambers/chamber/end';
const CORRIDOR = 'trial_chambers/corridor';
const CHAMBERS = 'trial_chambers/chambers/end';
const HALLWAY = 'trial_chambers/hallway';
const DECOR = 'trial_chambers/decor';
const SUPPLY = 'trial_chambers/chests/supply';
const VAULT = 'trial_chambers/reward/contents/default';
const OMINOUS_VAULT = 'trial_chambers/reward/ominous_vault';
type SpawnerKind = 'melee' | 'small_melee' | 'ranged' | 'slow_ranged' | 'breeze';
const spawnerPool = (k: SpawnerKind) => `trial_chambers/spawner/contents/${k}`;

/** a corridor end: the corridor pool, offering a corridor */
const corridorJ = (g: Grid, x: number, y: number, z: number, facing: Dir6) => g.jig(x, y, z, facing, { name: J.corridor, target: J.corridor, pool: CORRIDOR });
/** a hallway end */
const hallwayJ = (g: Grid, x: number, y: number, z: number, facing: Dir6) => g.jig(x, y, z, facing, { name: J.hallway, target: J.hallway, pool: HALLWAY });
/**
 * a door into a chamber (off a corridor or at a hallway's end): tried before the piece's other connectors (vanilla
 * selection_priority), so a chamber gets its room first; nameless, so nothing else joins a piece by it
 */
const doorJ = (g: Grid, x: number, y: number, z: number, facing: Dir6) => g.jig(x, y, z, facing, { target: J.door, pool: CHAMBERS, selection: 1 });
/** a chamber's own door (what a corridor's door connector takes) */
const entranceJ = (g: Grid, x: number, y: number, z: number, facing: Dir6) => g.jig(x, y, z, facing, { name: J.door });
/** a spawner of a kind on the block above this one */
const spawnerJ = (g: Grid, x: number, y: number, z: number, kind: SpawnerKind) => g.jig(x, y, z, 'up', { target: J.spawner, pool: spawnerPool(kind), top: 'north' });
/** a vault on the block above this one, its front to `facing` */
const vaultJ = (g: Grid, x: number, y: number, z: number, facing: Dir6, ominous = false) =>
  g.jig(x, y, z, 'up', { target: J.reward, pool: ominous ? OMINOUS_VAULT : VAULT, top: facing, joint: 'aligned' });
/** a pot, a barrel or nothing on the block above */
const decorJ = (g: Grid, x: number, y: number, z: number) => g.jig(x, y, z, 'up', { target: J.decor, pool: DECOR, top: 'north' });
/** a supply chest on the block above, its front to `facing` */
const supplyJ = (g: Grid, x: number, y: number, z: number, facing: Dir6) => g.jig(x, y, z, 'up', { target: J.chest, pool: SUPPLY, top: facing, joint: 'aligned' });

const rigid = (g: Grid, id: string): TrialElement => new TrialElement(g.build(id));

// ---------------------------------------------------------------------------------------------------------------
// Walls, floors and ceilings

/** a wall block at height y (from the floor layer) and position u along the wall, for a room `h` tall */
function wallBlock(y: number, u: number, h: number, pillarEvery = 4): string {
  const pillar = u % pillarEvery === 0;
  if (y === 1) return pillar ? CT : PT;
  if (y === h - 2) return pillar ? CCH : CUT;
  if (pillar) return CTB;
  return y === 3 && u % pillarEvery === pillarEvery >> 1 ? GR : TB;
}

/** a floor: polished tuff with a tuff brick border and chiseled tuff set in a lattice round the middle */
function floorBlock(x: number, z: number, sx: number, sz: number): string {
  if (x <= 1 || z <= 1 || x >= sx - 2 || z >= sz - 2) return TB;
  const cx = (sx - 1) / 2, cz = (sz - 1) / 2;
  const d = Math.abs(x - cx) + Math.abs(z - cz);
  if (d === 0) return CCH;
  if (d <= 2) return CUT;
  if (d % 4 === 0) return CT;
  return PT;
}

/** a ceiling: tuff bricks, a lit bulb every four blocks with grates either side */
function ceilingBlock(x: number, z: number, every = 4, off = 2): string {
  const bx = (x - off) % every === 0, bz = (z - off) % every === 0;
  if (bx && bz) return BULB;
  if ((bx && (z - off) % every === 1) || (bz && (x - off) % every === 1)) return GR;
  return TB;
}

/** a room's shell: floor layer y=0, walls, ceiling at y=sy-1, all carved inside */
function roomShell(g: Grid, sx: number, sy: number, sz: number, y0 = 0): void {
  for (let y = y0; y < y0 + sy; y++)
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) {
        const ly = y - y0;
        const edgeX = x === 0 || x === sx - 1, edgeZ = z === 0 || z === sz - 1;
        let s: string;
        if (ly === 0) s = floorBlock(x, z, sx, sz);
        else if (ly === sy - 1) s = edgeX || edgeZ ? TB : ceilingBlock(x, z);
        else if (edgeX && edgeZ) s = ly === 1 ? CT : CTB;
        else if (edgeX) s = wallBlock(ly, z, sy);
        else if (edgeZ) s = wallBlock(ly, x, sy);
        else s = AIR;
        g.set(x, y, z, s);
      }
}

/** an opening in a wall (a door or a hallway's end): carved, with a polished frame round it */
function opening(g: Grid, axis: 'x' | 'z', at: number, c: number, y0: number, w: number, h: number): void {
  const half = w >> 1;
  for (let y = y0 + 1; y <= y0 + h; y++)
    for (let u = c - half; u <= c + half; u++) {
      if (axis === 'x') g.set(at, y, u, AIR);
      else g.set(u, y, at, AIR);
    }
  // the frame: chiseled tuff at the sides, cut copper over the top
  for (let y = y0 + 1; y <= y0 + h + 1; y++)
    for (const u of [c - half - 1, c + half + 1]) {
      const s = y === y0 + h + 1 ? CUT : CT;
      if (axis === 'x') g.get(at, y, u) !== null && g.set(at, y, u, s);
      else g.get(u, y, at) !== null && g.set(u, y, at, s);
    }
  for (let u = c - half; u <= c + half; u++) {
    if (axis === 'x') g.set(at, y0 + h + 1, u, CUT);
    else g.set(u, y0 + h + 1, at, CUT);
  }
}

/** a pedestal: a column of chiseled tuff from y0 up to y1 (its top a chiseled copper block), where a spawner sits */
function pedestal(g: Grid, x: number, z: number, y0: number, y1: number): number {
  for (let y = y0; y < y1; y++) g.set(x, y, z, y === y0 ? PT : CT);
  g.set(x, y1, z, CCH);
  // trim round its foot
  for (const [dx, dz, f] of [[1, 0, 'west'], [-1, 0, 'east'], [0, 1, 'north'], [0, -1, 'south']] as const)
    if (g.get(x + dx, y0, z + dz) === AIR) g.set(x + dx, y0, z + dz, stairs(PTS, f));
  return y1;
}

/** a raised platform: solid from y0 to y1 over the box, stairs up on its edges */
function platform(g: Grid, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, top = PT): void {
  g.fill(x0, y0, z0, x1, y1 - 1, z1, TB);
  g.fill(x0, y1, z0, x1, y1, z1, (x, _y, z) => (x === x0 || x === x1 || z === z0 || z === z1 ? CUT : top));
}

/** a pillar floor to ceiling: chiseled tuff bricks with a copper band and a bulb facing out at mid height */
function pillar(g: Grid, x: number, z: number, y0: number, y1: number, bulbAt = -1): void {
  for (let y = y0; y <= y1; y++) g.set(x, y, z, y === y0 ? CT : y === y1 ? CT : y === bulbAt ? BULB : (y - y0) % 4 === 2 ? CCH : CTB);
}

/** a dais of the reward: a step of cut copper across a room's back wall */
function dais(g: Grid, x0: number, x1: number, z0: number, z1: number, y: number): void {
  g.fill(x0, y, z0, x1, y, z1, (x, _y, z) => (z === z1 ? stairs(CUS, 'north') : x === x0 || x === x1 ? CUT : OCUT));
}

// ---------------------------------------------------------------------------------------------------------------
// The spawners, the vaults, the chests and the decor

/** vanilla's trial spawner configs by kind and mob (game/trialSpawner.ts TRIAL_SPAWNER_CONFIGS: `trial_chamber/<kind>/<mob>`) */
const SPAWNERS: [SpawnerKind, string[]][] = [
  ['melee', ['zombie', 'husk', 'spider']],
  ['small_melee', ['slime', 'cave_spider', 'silverfish', 'baby_zombie']],
  ['ranged', ['skeleton', 'stray', 'poison_skeleton']],
  ['slow_ranged', ['skeleton', 'stray', 'poison_skeleton']],
  ['breeze', ['breeze']],
];
for (const [kind, mobs] of SPAWNERS) {
  for (const mob of mobs) {
    const name = kind === 'breeze' ? 'breeze' : `${kind}/${mob}`;
    const g = new Grid(1, 1, 1);
    g.entity(0, 0, 0, 'trial_spawner', { normal_config: `trial_chamber/${name}/normal`, ominous_config: `trial_chamber/${name}/ominous` });
    g.jig(0, 0, 0, 'down', { name: J.spawner });
    // (each its own fallback: a chamber at the structure's last step still gets its spawners)
    pool(`trial_chambers/spawner/${name}`, `trial_chambers/spawner/${name}`, [[rigid(g, `trial_chambers/spawner/${name}`), 1]]);
  }
  // (what a kind's pool holds without an alias: its first mob)
  pool(spawnerPool(kind), spawnerPool(kind), [[rigid(oneSpawner(kind, mobs[0]), `trial_chambers/spawner/contents/${kind}`), 1]]);
}
function oneSpawner(kind: SpawnerKind, mob: string): Grid {
  const name = kind === 'breeze' ? 'breeze' : `${kind}/${mob}`;
  const g = new Grid(1, 1, 1);
  g.entity(0, 0, 0, 'trial_spawner', { normal_config: `trial_chamber/${name}/normal`, ominous_config: `trial_chamber/${name}/ominous` });
  g.jig(0, 0, 0, 'down', { name: J.spawner });
  return g;
}

/** vanilla PoolAliasBinding: an alias for a pool, resolved once per structure */
export type AliasBinding =
  | { kind: 'direct'; alias: string; target: string }
  | { kind: 'random'; alias: string; targets: [string, number][] }
  | { kind: 'group'; groups: [AliasBinding[], number][] };

/** vanilla TrialChambersStructurePools.ALIAS_BINDINGS */
export const ALIAS_BINDINGS: AliasBinding[] = [
  {
    kind: 'group',
    groups: (['skeleton', 'stray', 'poison_skeleton'] as const).map((mob) => [
      [
        { kind: 'direct', alias: spawnerPool('ranged'), target: `trial_chambers/spawner/ranged/${mob}` },
        { kind: 'direct', alias: spawnerPool('slow_ranged'), target: `trial_chambers/spawner/slow_ranged/${mob}` },
      ],
      1,
    ]),
  },
  { kind: 'random', alias: spawnerPool('melee'), targets: ['zombie', 'husk', 'spider'].map((m) => [`trial_chambers/spawner/melee/${m}`, 1]) },
  {
    kind: 'random',
    alias: spawnerPool('small_melee'),
    targets: ['slime', 'cave_spider', 'silverfish', 'baby_zombie'].map((m) => [`trial_chambers/spawner/small_melee/${m}`, 1]),
  },
];

// the vaults: a normal one (vanilla VaultConfig.DEFAULT: the trial key, chests/trial_chambers/reward), an ominous one
// (these pools and the spawners' and supply chests' are their own fallbacks, so the last step's chambers are furnished)
{
  const g = new Grid(1, 1, 1);
  g.entity(0, 0, 0, 'vault[facing=north]');
  g.jig(0, 0, 0, 'down', { name: J.reward, top: 'north' });
  pool(VAULT, VAULT, [[rigid(g, 'trial_chambers/reward/vault'), 1]]);
  const o = new Grid(1, 1, 1);
  o.entity(0, 0, 0, 'vault[facing=north,ominous=true]', {
    config: JSON.stringify({ key_item: 'minecraft:ominous_trial_key', loot_table: 'minecraft:chests/trial_chambers/reward_ominous' }),
  });
  o.jig(0, 0, 0, 'down', { name: J.reward, top: 'north' });
  pool(OMINOUS_VAULT, OMINOUS_VAULT, [[rigid(o, 'trial_chambers/reward/ominous_vault'), 1]]);
}

// the supply chests
{
  const g = new Grid(1, 1, 1);
  g.entity(0, 0, 0, 'chest[facing=north]', {}, 'chests/trial_chambers/supply');
  g.jig(0, 0, 0, 'down', { name: J.chest, top: 'north' });
  pool(SUPPLY, SUPPLY, [[rigid(g, 'trial_chambers/chests/supply'), 1]]);
}

// the decor: mostly nothing; plain pots (with a little in them), a few with the trial chambers' sherds, dead bushes
// in flower pots, empty flower pots, barrels
{
  const one = (id: string, state: string, data?: Record<string, string>, table?: string): PoolElement => {
    const g = new Grid(1, 1, 1);
    if (data || table) g.entity(0, 0, 0, state, data ?? {}, table);
    else g.set(0, 0, 0, state);
    g.jig(0, 0, 0, 'down', { name: J.decor, top: 'north' });
    return rigid(g, `trial_chambers/decor/${id}`);
  };
  // (a sherd's pattern on the back and the front, bricks either side)
  const pot = (sherd: string | null) => ({ sherds: sherd ? `${sherd}_pottery_sherd,brick,brick,${sherd}_pottery_sherd` : 'brick,brick,brick,brick' });
  pool(DECOR, 'empty', [
    [EMPTY, 22],
    [one('undecorated_pot', 'decorated_pot[facing=north]', pot(null), 'pots/trial_chambers/corridor'), 10],
    [one('flow_pot', 'decorated_pot[facing=north]', pot('flow'), 'pots/trial_chambers/corridor'), 1],
    [one('guster_pot', 'decorated_pot[facing=north]', pot('guster'), 'pots/trial_chambers/corridor'), 1],
    [one('scrape_pot', 'decorated_pot[facing=north]', pot('scrape'), 'pots/trial_chambers/corridor'), 1],
    [one('dead_bush_pot', 'potted_dead_bush'), 2],
    [one('empty_pot', 'flower_pot'), 2],
    [one('barrel', 'barrel[facing=up]'), 2],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------
// Corridors: 7 wide and 7 tall, open at both ends, running north to south

/** a corridor's cross-section over z0..z1 (floor y0): its floor, walls with pillars and lamps, a chamfered ceiling */
function corridorRun(g: Grid, z0: number, z1: number, y0 = 0, phase = 0): void {
  for (let z = z0; z <= z1; z++) {
    const u = z + phase;
    const pillarZ = u % 4 === 0, lamp = u % 4 === 2;
    for (let x = 0; x < 7; x++) {
      g.set(x, y0, z, x <= 1 || x >= 5 ? TB : x === 3 && lamp ? CCH : x === 3 ? CUT : PT);
      g.set(x, y0 + 6, z, x === 3 && lamp ? BULB : (x === 2 || x === 4) && lamp ? GR : x === 3 ? OCUT : TB);
    }
    for (const x of [0, 6]) {
      g.set(x, y0 + 1, z, pillarZ ? CT : PT);
      g.set(x, y0 + 2, z, pillarZ ? CTB : TB);
      g.set(x, y0 + 3, z, pillarZ ? CTB : lamp ? GR : TB);
      g.set(x, y0 + 4, z, pillarZ ? CCH : CUT);
      g.set(x, y0 + 5, z, pillarZ ? CTB : TB);
    }
    for (let y = y0 + 1; y <= y0 + 5; y++) for (let x = 1; x <= 5; x++) g.set(x, y, z, AIR);
    g.set(1, y0 + 5, z, stairs(TBS, 'west', 'top'));
    g.set(5, y0 + 5, z, stairs(TBS, 'east', 'top'));
    if (pillarZ) {
      g.set(1, y0 + 4, z, stairs(PTS, 'west', 'top'));
      g.set(5, y0 + 4, z, stairs(PTS, 'east', 'top'));
    }
  }
}

const corridors: [PoolElement, number][] = [];

// straight: a run of nine
{
  const g = new Grid(7, 7, 9);
  corridorRun(g, 0, 8);
  corridorJ(g, 3, 0, 0, 'north');
  corridorJ(g, 3, 0, 8, 'south');
  corridors.push([rigid(g, 'trial_chambers/corridor/straight_1'), 8]);
}
// straight with a hallway off each side
{
  const g = new Grid(7, 7, 13);
  corridorRun(g, 0, 12);
  for (const x of [0, 6]) opening(g, 'x', x, 6, 0, 3, 4);
  hallwayJ(g, 0, 0, 6, 'west');
  hallwayJ(g, 6, 0, 6, 'east');
  corridorJ(g, 3, 0, 0, 'north');
  corridorJ(g, 3, 0, 12, 'south');
  corridors.push([rigid(g, 'trial_chambers/corridor/straight_2'), 1]);
}
// first plate: pots and a chest along the walls (chests/trial_chambers/corridor)
{
  const g = new Grid(7, 7, 11);
  corridorRun(g, 0, 10);
  for (const z of [3, 7]) {
    decorJ(g, 1, 0, z);
    decorJ(g, 5, 0, z);
  }
  g.entity(1, 1, 5, 'chest[facing=east]', {}, 'chests/trial_chambers/corridor');
  corridorJ(g, 3, 0, 0, 'north');
  corridorJ(g, 3, 0, 10, 'south');
  corridors.push([rigid(g, 'trial_chambers/corridor/first_plate'), 4]);
}
// second plate: dispensers set in the walls, facing across (dispensers/trial_chambers/corridor)
{
  const g = new Grid(7, 7, 11);
  corridorRun(g, 0, 10);
  for (const z of [3, 7]) {
    g.entity(0, 2, z, 'dispenser[facing=east]', {}, 'dispensers/trial_chambers/corridor');
    g.entity(6, 2, z, 'dispenser[facing=west]', {}, 'dispensers/trial_chambers/corridor');
  }
  decorJ(g, 1, 0, 5);
  corridorJ(g, 3, 0, 0, 'north');
  corridorJ(g, 3, 0, 10, 'south');
  corridors.push([rigid(g, 'trial_chambers/corridor/second_plate'), 3]);
}
// entrances: a door off the corridor into a chamber, on one side or both
for (const [id, sides, w] of [['entrance_1', ['west'], 3], ['entrance_2', ['east'], 3], ['entrance_3', ['west', 'east'], 1]] as const) {
  const g = new Grid(7, 7, 11);
  corridorRun(g, 0, 10);
  for (const side of sides) {
    const x = side === 'west' ? 0 : 6;
    opening(g, 'x', x, 5, 0, 3, 3);
    doorJ(g, x, 0, 5, side);
    // copper trapdoors hung either side of the door
    for (const z of [3, 7]) g.set(side === 'west' ? 1 : 5, 3, z, trapdoor(side === 'west' ? 'east' : 'west', 'top', true));
  }
  corridorJ(g, 3, 0, 0, 'north');
  corridorJ(g, 3, 0, 10, 'south');
  corridors.push([rigid(g, `trial_chambers/corridor/${id}`), w]);
}
// stairs: up six over a flight of six (either way: entered from the top it goes down)
{
  const g = new Grid(7, 13, 14);
  g.fill(0, 0, 0, 6, 12, 13, TB);
  corridorRun(g, 0, 3, 0);
  corridorRun(g, 10, 13, 6, 2);
  for (let i = 0; i < 6; i++) {
    const z = 4 + i, y = i + 1;
    for (let x = 0; x < 7; x++) {
      if (x === 0 || x === 6) {
        for (let yy = y; yy <= y + 5; yy++) g.set(x, yy, z, yy === y ? PT : yy === y + 3 ? CUT : TB);
        continue;
      }
      // (five of headroom over each step, as along the corridor, under its own ceiling)
      g.set(x, y, z, x === 3 ? stairs(CUS, 'south') : stairs(TBS, 'south'));
      for (let yy = y + 1; yy <= y + 5; yy++) g.set(x, yy, z, AIR);
      g.set(x, y + 6, z, x === 3 && i % 2 === 1 ? BULB : TB);
    }
  }
  corridorJ(g, 3, 0, 0, 'north');
  corridorJ(g, 3, 6, 13, 'south');
  corridors.push([rigid(g, 'trial_chambers/corridor/stairs'), 4]);
}
// intersection 1: four ways round a copper pillar, pots in the corners, a chest and a barrel
{
  const g = new Grid(13, 9, 13);
  roomShell(g, 13, 9, 13);
  opening(g, 'z', 0, 6, 0, 5, 5);
  opening(g, 'z', 12, 6, 0, 5, 5);
  opening(g, 'x', 0, 6, 0, 5, 5);
  opening(g, 'x', 12, 6, 0, 5, 5);
  g.fill(5, 1, 5, 7, 7, 7, (x, y, z) => (x === 6 && z === 6 ? (y === 4 ? BULB : CU) : y === 1 ? CT : y === 4 ? GR : y % 2 ? CUT : OCUT));
  for (const [x, z] of [[1, 1], [11, 1], [1, 11], [11, 11]]) decorJ(g, x, 0, z);
  g.entity(1, 1, 3, 'chest[facing=east]', {}, 'chests/trial_chambers/intersection');
  g.entity(11, 1, 9, 'barrel[facing=up]', {}, 'chests/trial_chambers/intersection_barrel');
  corridorJ(g, 6, 0, 0, 'north');
  corridorJ(g, 6, 0, 12, 'south');
  corridorJ(g, 0, 0, 6, 'west');
  corridorJ(g, 12, 0, 6, 'east');
  corridors.push([rigid(g, 'trial_chambers/corridor/intersection/intersection_1'), 1]);
}
// intersection 2: three ways, a lamp over the middle
{
  const g = new Grid(13, 9, 13);
  roomShell(g, 13, 9, 13);
  opening(g, 'z', 12, 6, 0, 5, 5);
  opening(g, 'x', 0, 6, 0, 5, 5);
  opening(g, 'x', 12, 6, 0, 5, 5);
  for (const [x, z] of [[4, 4], [8, 4], [4, 8], [8, 8]]) pillar(g, x, z, 1, 7, 5);
  g.set(6, 8, 6, BULB);
  for (const [x, z] of [[1, 1], [11, 1], [6, 1]]) decorJ(g, x, 0, z);
  g.entity(3, 1, 1, 'barrel[facing=south]', {}, 'chests/trial_chambers/intersection_barrel');
  corridorJ(g, 6, 0, 12, 'south');
  corridorJ(g, 0, 0, 6, 'west');
  corridorJ(g, 12, 0, 6, 'east');
  corridors.push([rigid(g, 'trial_chambers/corridor/intersection/intersection_2'), 2]);
}
// intersection 3: on two levels, a gallery round a well of air, stairs up the side
{
  const g = new Grid(15, 15, 15);
  roomShell(g, 15, 15, 15);
  // the gallery floor at y 7 round the walls, three wide
  for (let z = 1; z <= 13; z++)
    for (let x = 1; x <= 13; x++) {
      const inner = x >= 4 && x <= 10 && z >= 4 && z <= 10;
      if (!inner) g.set(x, 7, z, x === 4 || x === 10 || z === 4 || z === 10 ? PT : TB);
      else if (x === 4 || x === 10 || z === 4 || z === 10) g.set(x, 7, z, AIR);
    }
  // railings of trapdoors round the well
  for (let u = 4; u <= 10; u++) {
    g.set(u, 8, 4, trapdoor('south', 'bottom', true));
    g.set(u, 8, 10, trapdoor('north', 'bottom', true));
    g.set(4, 8, u, trapdoor('east', 'bottom', true));
    g.set(10, 8, u, trapdoor('west', 'bottom', true));
  }
  // the flight up the west side, from the north
  for (let i = 0; i < 6; i++) {
    for (const x of [1, 2, 3]) {
      g.set(x, i + 1, 3 + i, stairs(TBS, 'south'));
      g.fill(x, 1, 3 + i, x, i, 3 + i, TB);
      g.set(x, 7, 3 + i, AIR);
    }
  }
  g.fill(1, 7, 3, 3, 7, 9, AIR);
  g.fill(1, 1, 9, 3, 6, 9, TB);
  g.set(7, 14, 7, BULB);
  g.set(7, 6, 7, CCH);
  opening(g, 'z', 0, 7, 0, 5, 5);
  opening(g, 'x', 14, 7, 0, 5, 5);
  opening(g, 'z', 14, 7, 7, 5, 5);
  opening(g, 'x', 0, 11, 7, 5, 5);
  for (const [x, z] of [[13, 1], [13, 13]]) decorJ(g, x, 0, z);
  decorJ(g, 13, 7, 1);
  corridorJ(g, 7, 0, 0, 'north');
  corridorJ(g, 14, 0, 7, 'east');
  corridorJ(g, 7, 7, 14, 'south');
  corridorJ(g, 0, 7, 11, 'west');
  corridors.push([rigid(g, 'trial_chambers/corridor/intersection/intersection_3'), 1]);
}
// the atrium: a great hall two floors high, a grand staircase to its gallery, a copper column in the middle
{
  const S = 25, H = 21;
  const g = new Grid(S, H, S);
  roomShell(g, S, H, S);
  // the gallery at y 10: along the north and south walls, four deep, and along the west wall between them
  for (let x = 1; x <= S - 2; x++)
    for (const z of [1, 2, 3, 4, 20, 21, 22, 23]) g.set(x, 10, z, z === 4 || z === 20 ? CUT : PT);
  for (let z = 5; z <= 19; z++) for (let x = 1; x <= 4; x++) g.set(x, 10, z, x === 4 ? CUT : PT);
  for (let x = 5; x <= S - 2; x++) {
    g.set(x, 11, 5, trapdoor('south', 'bottom', true));
    g.set(x, 11, 19, trapdoor('north', 'bottom', true));
  }
  for (let z = 5; z <= 19; z++) g.set(5, 11, z, trapdoor('east', 'bottom', true));
  // the grand staircase: up the east wall from the south gallery's foot to the north gallery... in two flights
  for (let i = 0; i < 9; i++) {
    for (const x of [19, 20, 21, 22, 23]) {
      const z = 16 - i, y = 1 + i;
      if (z < 5) break;
      g.set(x, y, z, x === 21 ? stairs(CUS, 'north') : stairs(TBS, 'north'));
      g.fill(x, 1, z, x, y - 1, z, TB);
    }
  }
  g.fill(19, 1, 5, 23, 9, 7, TB);
  g.fill(19, 10, 5, 23, 10, 7, PT);
  for (let x = 19; x <= 23; x++) g.set(x, 11, 5, AIR);
  // the column
  for (let y = 1; y <= H - 2; y++)
    for (let z = 11; z <= 13; z++)
      for (let x = 11; x <= 13; x++) {
        const mid = x === 12 && z === 12;
        g.set(x, y, z, mid ? (y % 5 === 0 ? BULB : CU) : y % 5 === 0 ? GR : y === 1 ? CT : (y >> 1) % 2 ? CUT : OCUT);
      }
  // planters of pots round the column
  for (const [x, z] of [[9, 9], [15, 9], [9, 15], [15, 15]]) {
    g.set(x, 1, z, CT);
    decorJ(g, x, 1, z);
  }
  opening(g, 'x', 0, 12, 0, 5, 5);
  opening(g, 'z', 24, 12, 0, 5, 5);
  opening(g, 'z', 0, 12, 10, 5, 5);
  opening(g, 'x', 24, 21, 10, 5, 5);
  opening(g, 'x', 0, 3, 10, 3, 4);
  g.entity(2, 11, 2, 'chest[facing=south]', {}, 'chests/trial_chambers/intersection');
  corridorJ(g, 0, 0, 12, 'west');
  corridorJ(g, 12, 0, 24, 'south');
  corridorJ(g, 12, 10, 0, 'north');
  corridorJ(g, 24, 10, 21, 'east');
  hallwayJ(g, 0, 10, 3, 'west');
  corridors.push([rigid(g, 'trial_chambers/corridor/atrium_1'), 1]);
}
// a dead end: an alcove with a chest under a lamp, pots either side
{
  const g = new Grid(7, 7, 7);
  corridorRun(g, 0, 5);
  g.fill(0, 0, 6, 6, 6, 6, (x, y) => (y === 0 ? TB : x === 0 || x === 6 ? CTB : y === 3 && x === 3 ? BULB : y === 3 ? GR : y === 1 ? PT : TB));
  g.entity(3, 1, 5, 'chest[facing=north]', {}, 'chests/trial_chambers/corridor');
  for (const [x, z] of [[1, 5], [5, 5], [1, 3], [5, 3]]) decorJ(g, x, 0, z);
  corridorJ(g, 3, 0, 0, 'north');
  corridors.push([rigid(g, 'trial_chambers/corridor/end_1'), 1]);
}
// a corridor's end nothing else fitted at: walled off
const corridorCap = (() => {
  const g = new Grid(7, 7, 1);
  g.fill(0, 0, 0, 6, 6, 0, (x, y) => (y === 0 ? TB : x === 0 || x === 6 ? CTB : y === 3 && x === 3 ? CCH : y === 3 ? CUT : TB));
  g.jig(3, 0, 0, 'north', { name: J.corridor });
  return rigid(g, 'trial_chambers/corridor/end_cap');
})();
pool('trial_chambers/corridor/end_cap', 'empty', [[corridorCap, 1]]);
pool(CORRIDOR, 'trial_chambers/corridor/end_cap', corridors);

// ---------------------------------------------------------------------------------------------------------------
// Hallways: 5 wide and 6 tall, the chambers' back ways

/** a hallway's cross-section over z0..z1 (floor y0) */
function hallwayRun(g: Grid, z0: number, z1: number, y0 = 0, phase = 0): void {
  for (let z = z0; z <= z1; z++) {
    const u = z + phase;
    for (let x = 0; x < 5; x++) {
      g.set(x, y0, z, x === 0 || x === 4 ? TB : x === 2 && u % 4 === 0 ? CT : PT);
      g.set(x, y0 + 5, z, x === 2 && u % 4 === 2 ? BULB : TB);
    }
    for (const x of [0, 4]) {
      g.set(x, y0 + 1, z, u % 4 === 0 ? CT : PT);
      g.set(x, y0 + 2, z, u % 4 === 0 ? CTB : TB);
      g.set(x, y0 + 3, z, u % 4 === 0 ? CTB : TB);
      g.set(x, y0 + 4, z, u % 4 === 0 ? CCH : TB);
    }
    for (let y = y0 + 1; y <= y0 + 4; y++) for (let x = 1; x <= 3; x++) g.set(x, y, z, AIR);
  }
}

const hallways: [PoolElement, number][] = [];
{
  const g = new Grid(5, 6, 9);
  hallwayRun(g, 0, 8);
  hallwayJ(g, 2, 0, 0, 'north');
  hallwayJ(g, 2, 0, 8, 'south');
  hallways.push([rigid(g, 'trial_chambers/hallway/straight'), 4]);
}
for (const [id, side] of [['left_corner', 'west'], ['right_corner', 'east']] as const) {
  const g = new Grid(5, 6, 5);
  hallwayRun(g, 0, 4);
  // the far end walled, the side opened
  g.fill(0, 1, 0, 4, 4, 0, (x, y) => (y === 1 ? PT : x === 2 && y === 3 ? BULB : TB));
  const x = side === 'west' ? 0 : 4;
  g.fill(x, 1, 1, x, 4, 3, AIR);
  hallwayJ(g, 2, 0, 4, 'south');
  hallwayJ(g, x, 0, 2, side);
  hallways.push([rigid(g, `trial_chambers/hallway/${id}`), 2]);
}
// a staircase: up five over a flight of five
{
  const g = new Grid(5, 11, 12);
  g.fill(0, 0, 0, 4, 10, 11, TB);
  hallwayRun(g, 0, 2, 0);
  hallwayRun(g, 8, 11, 5, 3);
  for (let i = 0; i < 5; i++) {
    const z = 3 + i, y = i + 1;
    for (let x = 1; x <= 3; x++) {
      g.set(x, y, z, stairs(x === 2 ? PTS : TBS, 'south'));
      for (let yy = y + 1; yy <= y + 4; yy++) g.set(x, yy, z, AIR);
    }
    g.set(2, y + 5, z, i === 2 ? BULB : TB);
  }
  hallwayJ(g, 2, 0, 0, 'north');
  hallwayJ(g, 2, 5, 11, 'south');
  hallways.push([rigid(g, 'trial_chambers/hallway/straight_staircase'), 2]);
}
// rubble: a run half blocked by fallen blocks
{
  const g = new Grid(5, 6, 7);
  hallwayRun(g, 0, 6);
  g.set(1, 1, 2, TU).set(1, 2, 2, slab(TBSL)).set(1, 1, 3, stairs(TBS, 'east')).set(3, 1, 4, TU).set(3, 1, 5, slab(PTSL)).set(3, 2, 4, stairs(TBS, 'west'));
  g.set(2, 4, 3, 'cobweb').set(1, 4, 5, 'cobweb');
  hallwayJ(g, 2, 0, 0, 'north');
  hallwayJ(g, 2, 0, 6, 'south');
  hallways.push([rigid(g, 'trial_chambers/hallway/rubble'), 1]);
}
// an encounter: a small room with a spawner, ways on three sides
{
  const g = new Grid(11, 7, 11);
  roomShell(g, 11, 7, 11);
  opening(g, 'z', 10, 5, 0, 3, 4);
  opening(g, 'z', 0, 5, 0, 3, 4);
  opening(g, 'x', 10, 5, 0, 3, 4);
  platform(g, 4, 4, 6, 6, 1, 1);
  spawnerJ(g, 5, 1, 5, 'small_melee');
  for (const [x, z] of [[1, 1], [9, 1], [1, 9], [9, 9]]) decorJ(g, x, 0, z);
  hallwayJ(g, 5, 0, 10, 'south');
  hallwayJ(g, 5, 0, 0, 'north');
  hallwayJ(g, 10, 0, 5, 'east');
  hallways.push([rigid(g, 'trial_chambers/hallway/encounter_1'), 1]);
}
// a second encounter: a spawner of the melee kind between two ledges with ranged ones
{
  const g = new Grid(11, 8, 11);
  roomShell(g, 11, 8, 11);
  opening(g, 'z', 10, 5, 0, 3, 4);
  opening(g, 'x', 0, 5, 0, 3, 4);
  g.fill(1, 1, 1, 9, 2, 2, TB);
  g.fill(1, 3, 1, 9, 3, 2, (x) => (x % 2 ? PT : CUT));
  // a flight up to the ledge
  g.fill(5, 1, 3, 5, 2, 4, TB).set(5, 1, 5, stairs(TBS, 'north')).set(5, 2, 4, stairs(TBS, 'north')).set(5, 3, 3, stairs(TBS, 'north'));
  spawnerJ(g, 5, 0, 6, 'melee');
  spawnerJ(g, 2, 3, 1, 'ranged');
  decorJ(g, 8, 3, 1);
  hallwayJ(g, 5, 0, 10, 'south');
  hallwayJ(g, 0, 0, 5, 'west');
  hallways.push([rigid(g, 'trial_chambers/hallway/encounter_2'), 1]);
}
// a cache: a dead end with a supply chest, a barrel and pots
{
  const g = new Grid(7, 6, 7);
  roomShell(g, 7, 6, 7);
  opening(g, 'z', 6, 3, 0, 3, 4);
  supplyJ(g, 3, 0, 1, 'south');
  g.entity(1, 1, 1, 'barrel[facing=up]', {}, 'chests/trial_chambers/intersection_barrel');
  for (const [x, z] of [[5, 1], [1, 3], [5, 3]]) decorJ(g, x, 0, z);
  hallwayJ(g, 3, 0, 6, 'south');
  hallways.push([rigid(g, 'trial_chambers/hallway/cache_1'), 2]);
}
// back to a corridor: the hallway widening into one
{
  const g = new Grid(7, 7, 6);
  corridorRun(g, 1, 5);
  g.fill(0, 0, 0, 6, 6, 0, (x, y) => (y === 0 ? TB : x >= 2 && x <= 4 && y >= 1 && y <= 4 ? AIR : y === 5 && x === 3 ? BULB : x === 1 || x === 5 ? CTB : TB));
  hallwayJ(g, 3, 0, 0, 'north');
  corridorJ(g, 3, 0, 5, 'south');
  hallways.push([rigid(g, 'trial_chambers/hallway/corridor_connector'), 1]);
}
// to a chamber: the hallway ends in a doorway, a chamber's door beyond it
{
  const g = new Grid(5, 6, 5);
  hallwayRun(g, 0, 4);
  g.fill(0, 0, 0, 4, 5, 0, (x, y) => (y === 0 ? TB : x >= 1 && x <= 3 && y >= 1 && y <= 3 ? AIR : y === 4 ? CUT : x === 0 || x === 4 ? CT : TB));
  doorJ(g, 2, 0, 0, 'north');
  hallwayJ(g, 2, 0, 4, 'south');
  hallways.push([rigid(g, 'trial_chambers/hallway/chamber_entrance'), 2]);
}
const hallwayCap = (() => {
  const g = new Grid(5, 6, 1);
  g.fill(0, 0, 0, 4, 5, 0, (x, y) => (y === 0 ? TB : x === 2 && y === 2 ? CT : y === 1 ? PT : TB));
  g.jig(2, 0, 0, 'north', { name: J.hallway });
  return rigid(g, 'trial_chambers/hallway/fallback');
})();
pool('trial_chambers/hallway/fallback', 'empty', [[hallwayCap, 1]]);
pool(HALLWAY, 'trial_chambers/hallway/fallback', hallways);

// ---------------------------------------------------------------------------------------------------------------
// The chambers: the rooms of trials. Each is entered by its door in the middle of its south wall (from a corridor),
// its vaults at the back on a dais, facing the door

const chambers: [PoolElement, number][] = [];

/** a chamber's door in its south wall, `y0` the floor it opens onto */
function chamberDoor(g: Grid, sx: number, sz: number, y0 = 0): void {
  const c = (sx - 1) >> 1;
  opening(g, 'z', sz - 1, c, y0, 3, 3);
  entranceJ(g, c, y0, sz - 1, 'south');
}

/** a hallway off a chamber's east or west wall */
function chamberHallway(g: Grid, sx: number, side: 'west' | 'east', z: number, y0 = 0): void {
  const x = side === 'west' ? 0 : sx - 1;
  opening(g, 'x', x, z, y0, 3, 4);
  hallwayJ(g, x, y0, z, side);
}

// chamber 1: a platform in the middle with a melee spawner, two pedestals with a ranged and a small melee one
{
  const sx = 17, sy = 11, sz = 17;
  const g = new Grid(sx, sy, sz);
  roomShell(g, sx, sy, sz);
  platform(g, 6, 6, 10, 10, 1, 1);
  spawnerJ(g, 8, 1, 8, 'melee');
  spawnerJ(g, 3, pedestal(g, 3, 5, 1, 2), 5, 'ranged');
  spawnerJ(g, 13, pedestal(g, 13, 5, 1, 2), 5, 'small_melee');
  dais(g, 5, 11, 1, 2, 1);
  vaultJ(g, 7, 1, 1, 'south');
  vaultJ(g, 9, 1, 1, 'south', true);
  supplyJ(g, 1, 0, 12, 'east');
  for (const [x, z] of [[1, 1], [15, 1], [1, 15], [15, 15], [15, 12]]) decorJ(g, x, 0, z);
  chamberDoor(g, sx, sz);
  chamberHallway(g, sx, 'east', 8);
  chamberHallway(g, sx, 'west', 8);
  chambers.push([rigid(g, 'trial_chambers/chamber/chamber_1'), 1]);
}
// chamber 2: a long hall of pillars, three spawners down the middle
{
  const sx = 23, sy = 11, sz = 15;
  const g = new Grid(sx, sy, sz);
  roomShell(g, sx, sy, sz);
  for (const x of [5, 9, 13, 17]) for (const z of [4, 10]) pillar(g, x, z, 1, 9, 5);
  spawnerJ(g, 7, pedestal(g, 7, 7, 1, 1), 7, 'melee');
  spawnerJ(g, 11, pedestal(g, 11, 7, 1, 2), 7, 'ranged');
  spawnerJ(g, 15, pedestal(g, 15, 7, 1, 1), 7, 'small_melee');
  // the vaults at the east end on a dais facing west
  g.fill(20, 1, 4, 21, 1, 10, (x, _y, z) => (x === 20 ? stairs(CUS, 'east') : z === 4 || z === 10 ? CUT : OCUT));
  vaultJ(g, 21, 1, 6, 'west');
  vaultJ(g, 21, 1, 8, 'west');
  supplyJ(g, 1, 0, 2, 'east');
  supplyJ(g, 21, 0, 12, 'west');
  for (const [x, z] of [[1, 12], [3, 1], [19, 1], [19, 13]]) decorJ(g, x, 0, z);
  chamberDoor(g, sx, sz);
  chamberHallway(g, sx, 'west', 7);
  chambers.push([rigid(g, 'trial_chambers/chamber/chamber_2'), 1]);
}
// chamber 4: the pit: a walkway round a sunken floor with four spawners down in it
{
  const sx = 19, sy = 13, sz = 19;
  const g = new Grid(sx, sy, sz);
  roomShell(g, sx, sy, sz);
  // the walkway at y 4, three wide, and the pit's walls
  for (let z = 1; z <= 17; z++)
    for (let x = 1; x <= 17; x++) {
      const pit = x >= 4 && x <= 14 && z >= 4 && z <= 14;
      if (pit) continue;
      g.fill(x, 1, z, x, 3, z, TB);
      g.set(x, 4, z, x === 4 || x === 14 || z === 4 || z === 14 ? CUT : floorBlock(x, z, sx, sz));
    }
  // the pit's rim: railings, and stairs down on the east and west
  for (let u = 4; u <= 14; u++) {
    for (const [x, z, f] of [[u, 4, 'south'], [u, 14, 'north'], [4, u, 'east'], [14, u, 'west']] as const)
      g.set(x, 5, z, u % 2 ? trapdoor(f, 'bottom', true) : AIR);
  }
  for (const side of [0, 1]) {
    for (let i = 0; i < 4; i++) {
      const x = side ? 13 - i : 5 + i;
      for (const z of [8, 9, 10]) {
        g.set(x, 4 - i, z, stairs(TBS, side ? 'east' : 'west'));
        g.fill(x, 5 - i, z, x, 5, z, AIR);
        g.fill(x, 1, z, x, 3 - i, z, TB);
      }
    }
    for (const z of [8, 9, 10]) g.set(side ? 14 : 4, 5, z, AIR);
  }
  spawnerJ(g, 6, 0, 6, 'melee');
  spawnerJ(g, 12, 0, 12, 'melee');
  spawnerJ(g, 12, 0, 6, 'slow_ranged');
  spawnerJ(g, 6, 0, 12, 'small_melee');
  dais(g, 6, 12, 1, 2, 5);
  vaultJ(g, 8, 5, 1, 'south');
  vaultJ(g, 10, 5, 1, 'south', true);
  supplyJ(g, 1, 4, 16, 'east');
  for (const [x, z] of [[17, 16], [1, 1], [17, 1]]) decorJ(g, x, 4, z);
  for (const [x, z] of [[9, 5], [9, 13]]) decorJ(g, x, 0, z);
  chamberDoor(g, sx, sz, 4);
  chamberHallway(g, sx, 'east', 3, 4);
  chambers.push([rigid(g, 'trial_chambers/chamber/chamber_4'), 1]);
}
// chamber 8: two floors, a gallery round the north and east with the ranged spawners and the vaults, a breeze below
{
  const sx = 19, sy = 15, sz = 19;
  const g = new Grid(sx, sy, sz);
  roomShell(g, sx, sy, sz);
  // the gallery floor at y 6
  for (let z = 1; z <= 17; z++)
    for (let x = 1; x <= 17; x++) {
      if (!(z <= 4 || x >= 14)) continue;
      g.set(x, 6, z, (z === 4 && x <= 14) || (x === 14 && z >= 4) ? CUT : PT);
    }
  for (let u = 1; u <= 14; u++) g.set(u, 7, 5, trapdoor('south', 'bottom', true));
  for (let u = 5; u <= 17; u++) g.set(13, 7, u, trapdoor('west', 'bottom', true));
  // the stairs up the west wall
  for (let i = 0; i < 5; i++) {
    const z = 15 - i;
    for (const x of [1, 2]) {
      g.set(x, i + 1, z, stairs(TBS, 'north'));
      g.fill(x, 1, z, x, i, z, TB);
    }
  }
  g.fill(1, 1, 5, 2, 5, 10, TB);
  g.fill(1, 6, 5, 2, 6, 10, PT);
  g.fill(1, 7, 5, 2, 7, 10, AIR);
  for (let x = 1; x <= 2; x++) g.set(x, 7, 5, AIR);
  // pillars under the gallery
  for (const [x, z] of [[4, 4], [8, 4], [14, 8], [14, 12], [14, 16]]) pillar(g, x, z, 1, 5);
  spawnerJ(g, 8, pedestal(g, 8, 11, 1, 2), 11, 'breeze');
  spawnerJ(g, 6, 0, 13, 'melee');
  spawnerJ(g, 5, 6, 2, 'ranged');
  spawnerJ(g, 16, 6, 10, 'ranged');
  g.fill(9, 6, 1, 13, 6, 2, (x, _y, z) => (z === 2 ? stairs(CUS, 'north') : x === 9 || x === 13 ? CUT : OCUT));
  vaultJ(g, 10, 6, 1, 'south');
  vaultJ(g, 12, 6, 1, 'south');
  supplyJ(g, 16, 6, 16, 'north');
  for (const [x, z] of [[1, 1], [16, 1], [11, 16]]) decorJ(g, x, 0, z);
  chamberDoor(g, sx, sz);
  chamberHallway(g, sx, 'east', 3, 6);
  chambers.push([rigid(g, 'trial_chambers/chamber/chamber_8'), 1]);
}
// the assembly: a great square room of four pillars, four spawners, dispensers in the walls
{
  const sx = 23, sy = 11, sz = 23;
  const g = new Grid(sx, sy, sz);
  roomShell(g, sx, sy, sz);
  for (const [px, pz] of [[6, 6], [16, 6], [6, 16], [16, 16]])
    g.fill(px - 1, 1, pz - 1, px + 1, 9, pz + 1, (x, y, z) => (x === px && z === pz ? CU : y === 1 ? CT : y === 5 ? (x === px || z === pz ? BULB : CCH) : y % 4 === 3 ? OCUT : CTB));
  spawnerJ(g, 11, pedestal(g, 11, 11, 1, 2), 11, 'melee');
  spawnerJ(g, 6, 0, 11, 'small_melee');
  spawnerJ(g, 16, 0, 11, 'ranged');
  spawnerJ(g, 11, 0, 6, 'melee');
  for (const z of [5, 11, 17]) {
    g.entity(0, 2, z, 'dispenser[facing=east]', {}, 'dispensers/trial_chambers/chamber');
    g.entity(22, 2, z, 'dispenser[facing=west]', {}, 'dispensers/trial_chambers/chamber');
  }
  dais(g, 8, 14, 1, 2, 1);
  vaultJ(g, 10, 1, 1, 'south');
  vaultJ(g, 12, 1, 1, 'south', true);
  supplyJ(g, 1, 0, 20, 'east');
  supplyJ(g, 21, 0, 20, 'west');
  for (const [x, z] of [[1, 1], [21, 1], [3, 21], [19, 21]]) decorJ(g, x, 0, z);
  chamberDoor(g, sx, sz);
  chamberHallway(g, sx, 'west', 14);
  chamberHallway(g, sx, 'east', 14);
  chambers.push([rigid(g, 'trial_chambers/chamber/assembly'), 1]);
}
// the eruption: a stepped mound in the middle with a breeze spawner on top, ranged spawners at its feet
{
  const sx = 19, sy = 15, sz = 19;
  const g = new Grid(sx, sy, sz);
  roomShell(g, sx, sy, sz);
  for (let lvl = 0; lvl < 3; lvl++) {
    const r = 4 - lvl;
    g.fill(9 - r, 1 + lvl, 9 - r, 9 + r, 1 + lvl, 9 + r, (x, _y, z) => (x === 9 - r || x === 9 + r || z === 9 - r || z === 9 + r ? (lvl === 2 ? CUT : TB) : lvl === 2 ? OCUT : TU));
  }
  g.set(9, 3, 9, CCH);
  spawnerJ(g, 9, 3, 9, 'breeze');
  spawnerJ(g, 3, 0, 9, 'ranged');
  spawnerJ(g, 15, 0, 9, 'small_melee');
  // an opening of grates in the ceiling over the mound
  g.fill(7, 14, 7, 11, 14, 11, (x, _y, z) => (x === 9 && z === 9 ? BULB : GR));
  dais(g, 6, 12, 1, 2, 1);
  vaultJ(g, 8, 1, 1, 'south');
  vaultJ(g, 10, 1, 1, 'south', true);
  supplyJ(g, 16, 0, 16, 'west');
  for (const [x, z] of [[1, 1], [17, 1], [1, 17], [17, 17]]) decorJ(g, x, 0, z);
  chamberDoor(g, sx, sz);
  chamberHallway(g, sx, 'west', 13);
  chambers.push([rigid(g, 'trial_chambers/chamber/eruption'), 1]);
}
// slanted: terraces rising from the door to the vaults, a spawner on each, water dispensers in the walls below
{
  const sx = 17, sy = 14, sz = 21;
  const g = new Grid(sx, sy, sz);
  roomShell(g, sx, sy, sz);
  const TERRACES: [number, number, number][] = [[14, 19, 0], [9, 13, 2], [4, 8, 4], [1, 3, 6]];
  for (const [z0, z1, y] of TERRACES) {
    if (y > 0) g.fill(1, 1, z0, 15, y - 1, z1, TB);
    if (y > 0) g.fill(1, y, z0, 15, y, z1, (x, _y, z) => (z === z1 ? CUT : floorBlock(x, z, sx, sz)));
  }
  // stairs up the middle between the terraces
  for (const [z, y] of [[14, 1], [13, 2], [9, 3], [8, 4], [4, 5], [3, 6]] as const)
    for (const x of [7, 8, 9]) {
      g.set(x, y, z, stairs(x === 8 ? CUS : TBS, 'north'));
      g.fill(x, y + 1, z, x, sy - 2, z, AIR);
    }
  spawnerJ(g, 4, 0, 16, 'melee');
  spawnerJ(g, 12, 2, 11, 'ranged');
  spawnerJ(g, 4, 4, 6, 'slow_ranged');
  for (const z of [15, 17]) {
    g.entity(0, 2, z, 'dispenser[facing=east]', {}, 'dispensers/trial_chambers/water');
    g.entity(16, 2, z, 'dispenser[facing=west]', {}, 'dispensers/trial_chambers/water');
  }
  g.fill(5, 7, 1, 11, 7, 2, (x, _y, z) => (z === 2 ? stairs(CUS, 'north') : x === 5 || x === 11 ? CUT : OCUT));
  vaultJ(g, 7, 7, 1, 'south');
  vaultJ(g, 9, 7, 1, 'south');
  supplyJ(g, 14, 6, 1, 'south');
  for (const [x, z, y] of [[1, 19, 0], [15, 19, 0], [1, 1, 6]]) decorJ(g, x, y, z);
  chamberDoor(g, sx, sz);
  chamberHallway(g, sx, 'west', 2, 6);
  chambers.push([rigid(g, 'trial_chambers/chamber/slanted'), 1]);
}
// the pedestal: a breeze spawner on a high pedestal in the middle, pots on four lower ones round it
{
  const sx = 17, sy = 11, sz = 17;
  const g = new Grid(sx, sy, sz);
  roomShell(g, sx, sy, sz);
  platform(g, 7, 7, 9, 9, 1, 2, OCUT);
  g.set(8, 2, 8, CCH);
  spawnerJ(g, 8, 2, 8, 'breeze');
  for (const [x, z] of [[4, 4], [12, 4], [4, 12], [12, 12]]) {
    g.set(x, 1, z, CT);
    decorJ(g, x, 1, z);
  }
  spawnerJ(g, 2, 0, 14, 'small_melee');
  spawnerJ(g, 14, 0, 14, 'melee');
  dais(g, 5, 11, 1, 2, 1);
  vaultJ(g, 8, 1, 1, 'south');
  supplyJ(g, 1, 0, 8, 'east');
  chamberDoor(g, sx, sz);
  chamberHallway(g, sx, 'east', 8);
  chambers.push([rigid(g, 'trial_chambers/chamber/pedestal'), 1]);
}
// a chamber door nothing fitted at: walled off
const entranceCap = (() => {
  const g = new Grid(5, 5, 1);
  g.fill(0, 0, 0, 4, 4, 0, (x, y) => (y === 0 ? TB : x === 2 && y === 2 ? CCH : TB));
  g.jig(2, 0, 0, 'north', { name: J.door });
  return rigid(g, 'trial_chambers/chamber/entrance_cap');
})();
pool('trial_chambers/chamber/entrance_cap', 'empty', [[entranceCap, 1]]);
// a storeroom, where a chamber didn't fit: a barrel and pots under the lamps (and where even that doesn't fit, most of
// the time, the door's walled off)
const storeroom = (() => {
  const sx = 9, sy = 6, sz = 7;
  const g = new Grid(sx, sy, sz);
  roomShell(g, sx, sy, sz);
  g.entity(1, 1, 1, 'barrel[facing=up]', {}, 'chests/trial_chambers/intersection_barrel');
  for (const [x, z] of [[3, 1], [5, 1], [7, 1], [1, 3], [7, 3]]) decorJ(g, x, 0, z);
  chamberDoor(g, sx, sz);
  return rigid(g, 'trial_chambers/chamber/storeroom');
})();
pool('trial_chambers/chamber/fallback', 'empty', [[storeroom, 9], [entranceCap, 1]]);
pool(CHAMBERS, 'trial_chambers/chamber/fallback', chambers);

// ---------------------------------------------------------------------------------------------------------------
// The start: an end room, the chambers' entrance hall, its chests (chests/trial_chambers/entrance)

{
  // end 1: a hall with a corridor out of each end and a chamber's door either side, entrance chests along its walls
  const sx = 15, sy = 9, sz = 13;
  const g = new Grid(sx, sy, sz);
  roomShell(g, sx, sy, sz);
  opening(g, 'x', 0, 6, 0, 5, 5);
  opening(g, 'x', 14, 6, 0, 5, 5);
  opening(g, 'z', 0, 7, 0, 3, 3);
  opening(g, 'z', 12, 7, 0, 3, 3);
  for (const x of [4, 10]) for (const z of [3, 9]) pillar(g, x, z, 1, 7, 4);
  g.entity(3, 1, 1, 'chest[facing=south]', {}, 'chests/trial_chambers/entrance');
  g.entity(11, 1, 11, 'chest[facing=north]', {}, 'chests/trial_chambers/entrance');
  for (const [x, z] of [[1, 1], [13, 1], [1, 11], [13, 11], [11, 1], [3, 11]]) decorJ(g, x, 0, z);
  corridorJ(g, 0, 0, 6, 'west');
  corridorJ(g, 14, 0, 6, 'east');
  doorJ(g, 7, 0, 0, 'north');
  doorJ(g, 7, 0, 12, 'south');
  const end1 = rigid(g, 'trial_chambers/chamber/end_1');
  // end 2: a round-cornered hall with a corridor out north and south and a chamber's door east and west, a copper
  // fountain of bulbs in the middle
  const h = new Grid(13, 11, 13);
  roomShell(h, 13, 11, 13);
  for (const [x, z] of [[1, 1], [11, 1], [1, 11], [11, 11]]) h.fill(x, 1, z, x, 9, z, CTB);
  h.fill(5, 1, 5, 7, 1, 7, CUT);
  h.fill(6, 1, 6, 6, 4, 6, (_x, y) => (y === 4 ? BULB : CU));
  h.entity(2, 1, 3, 'chest[facing=east]', {}, 'chests/trial_chambers/entrance');
  h.entity(10, 1, 9, 'chest[facing=west]', {}, 'chests/trial_chambers/entrance');
  for (const [x, z] of [[2, 2], [10, 2], [2, 10], [10, 10]]) decorJ(h, x, 0, z);
  opening(h, 'z', 12, 6, 0, 5, 5);
  opening(h, 'z', 0, 6, 0, 5, 5);
  opening(h, 'x', 0, 6, 0, 3, 3);
  opening(h, 'x', 12, 6, 0, 3, 3);
  corridorJ(h, 6, 0, 12, 'south');
  corridorJ(h, 6, 0, 0, 'north');
  doorJ(h, 0, 0, 6, 'west');
  doorJ(h, 12, 0, 6, 'east');
  const end2 = rigid(h, 'trial_chambers/chamber/end_2');
  pool(START_POOL, 'empty', [[end1, 1], [end2, 1]]);
}

// (unused colours, kept for the pieces to come)
void [OCU, OGR, OCCH, ECUT, WCUT, OPP, CUSL];
