// (bastions) What the bastion remnants' pieces are made of: templates drawn in code on a grid (trialChamberPieces.ts's
// Grid: every block named, air carved out, the rest left as it is), the pool element that places one (vanilla
// SinglePoolElement: its air too, so a bastion hollows itself out of the netherrack), and vanilla's processor lists for
// bastions (ProcessorLists: RuleProcessors whose random is the block's own position's, Mth.getSeed), which crack the
// polished blackstone bricks, knock out the odd block, trade blackstone and gilded blackstone, and take gold away.
// The mobs are pieces of their own (vanilla bastion/mobs/*: a piglin with a golden sword or a crossbow, a piglin brute,
// a hoglin, persistent and finalized as a structure's), and so are the blocks of gold here and there
// (bastion/blocks/gold). The shared parts of the four kinds are here too: the palette, walls, ramparts and floors.

import { hash3 } from '../../core/rng';
import { BLOCK_BY_NAME, blockOf, FLAGS, F_LAVA } from '../block';
import { MIN_Y, MAX_Y } from '../constants';
import { SingleElement, pool, parseState, rotateState, rotDir, EMPTY, type Dir6, type JigsawSpec, type PlaceCtx, type Piece, type PoolElement, type Template } from './jigsaw';
import { Grid, legacyRandom, mthSeed, type TemplateBlockEntity } from './trialChamberPieces';
import type { SavedEntity } from '../../entity/mob';

// ---------------------------------------------------------------------------------------------------------------
// The palette

export const PBB = 'polished_blackstone_bricks';
export const CPBB = 'cracked_polished_blackstone_bricks';
export const PB = 'polished_blackstone';
export const CPB = 'chiseled_polished_blackstone';
export const BS = 'blackstone';
export const GILD = 'gilded_blackstone';
export const GOLD = 'gold_block';
export const BASALT = 'basalt';
export const PBASALT = 'polished_basalt';
export const MAGMA = 'magma_block';
export const LAVA = 'lava';
export const CHAIN = 'chain';
export const AIR = 'air';
export const SOUL_LANTERN_HANGING = 'soul_lantern[hanging=true]';
export const LANTERN_HANGING = 'lantern[hanging=true]';
export const PBB_WALL = 'polished_blackstone_brick_wall';
export const BS_WALL = 'blackstone_wall';
export const PB_WALL = 'polished_blackstone_wall';
export const stairs = (b: string, facing: string, half: 'top' | 'bottom' = 'bottom') => `${b}_stairs[facing=${facing},half=${half}]`;
export const slab = (b: string, type: 'top' | 'bottom' | 'double' = 'bottom') => `${b}_slab[type=${type}]`;
/** the stairs and slabs' prefixes */
export const PBB_ = 'polished_blackstone_brick', BS_ = 'blackstone', PB_ = 'polished_blackstone';
export const OPP: Record<string, string> = { north: 'south', south: 'north', west: 'east', east: 'west' };

// ---------------------------------------------------------------------------------------------------------------
// Processors (vanilla ProcessorLists: RuleProcessor, RandomBlockMatchTest, AxisAlignedLinearPosTest)

/** one rule: the input block and its chance, or any block (`input` null) at a chance growing with the height */
interface Rule {
  input: number;
  chance: number;
  /** vanilla AxisAlignedLinearPosTest on Y: [min chance, max chance, min distance, max distance] from the structure's base */
  heightChance?: [number, number, number, number];
  output: number;
}

export type ProcessorList = Rule[];

function rules(list: [string | null, number, string][], height?: [number, number, number, number]): ProcessorList {
  return list.map(([input, chance, output]) => {
    const b = input ? BLOCK_BY_NAME.get(input) : null;
    if (input && !b) throw new Error(`bastion processor: unknown block ${input}`);
    return { input: b ? b.id : -1, chance, output: parseState(output), heightChance: input ? undefined : height };
  });
}

/** vanilla ProcessorLists.REMOVE_GILDED_BLACKSTONE and ADD_GILDED_BLACKSTONE, at the end of every bastion list */
const GILDED: [string, number, string][] = [
  [GILD, 0.5, BS],
  [BS, 0.01, GILD],
];

/**
 * vanilla's bastion processor lists, by name. Each is one RuleProcessor: the first rule that matches decides (a rule
 * with a chance draws from the position's random only when its block matches)
 */
export const PROCESSORS = {
  /** vanilla BASTION_GENERIC_DEGRADATION */
  bastion_generic_degradation: rules([[PBB, 0.3, CPBB], [BS, 0.0001, AIR], [GOLD, 0.3, CPBB], ...GILDED]),
  /** vanilla ROOF */
  roof: rules([[PBB, 0.3, CPBB], [PBB, 0.15, AIR], ...GILDED]),
  /** vanilla HOUSING */
  housing: rules([[PBB, 0.3, CPBB], [BS, 0.0001, AIR], ...GILDED]),
  /** vanilla SIDE_WALL_DEGRADATION */
  side_wall_degradation: rules([[CPB, 0.5, AIR], [GOLD, 0.1, CPBB], ...GILDED]),
  /** vanilla STABLE_DEGRADATION */
  stable_degradation: rules([[PBB, 0.1, CPBB], [BS, 0.0001, AIR], ...GILDED]),
  /** vanilla BOTTOM_RAMPART */
  bottom_rampart: rules([[MAGMA, 0.75, CPBB], [CPBB, 0.15, PBB], ...GILDED]),
  /** vanilla TREASURE_ROOMS */
  treasure_rooms: rules([[PBB, 0.35, CPBB], [CPB, 0.1, CPBB], ...GILDED]),
  /** vanilla HIGH_WALL */
  high_wall: rules([[PBB, 0.01, AIR], [PBB, 0.5, CPBB], [BS, 0.3, slab(BS_)], ...GILDED]),
  /** vanilla HIGH_RAMPART: some gold gone, then the higher up, the more blocks missing (up to 5 % a hundred up) */
  high_rampart: rules([[GOLD, 0.3, AIR], [null, 0, AIR], [PBB, 0.3, CPBB], [BS, 0.0001, AIR], ...GILDED], [0, 0.05, 0, 100]),
  /** vanilla RAMPART_DEGRADATION */
  rampart_degradation: rules([[PBB, 0.4, CPBB], [BS, 0.01, AIR], [PBB, 0.0001, AIR], [BS, 0.0001, AIR], [GOLD, 0.3, AIR], ...GILDED]),
  /** vanilla ENTRANCE_REPLACEMENT */
  entrance_replacement: rules([[CPB, 0.5, AIR], [GOLD, 0.6, CPBB], ...GILDED]),
  /** vanilla BRIDGE */
  bridge: rules([[PBB, 0.3, CPBB], [BS, 0.0001, AIR]]),
} satisfies Record<string, ProcessorList>;

export type ProcessorName = keyof typeof PROCESSORS;

/** vanilla RuleProcessor.processBlock: the first rule that holds decides; `dy` is the height over the structure's base */
export function runProcessor(list: ProcessorList, st: number, x: number, y: number, z: number, dy: number): number {
  const id = blockOf(st).id;
  let r: ReturnType<typeof legacyRandom> | null = null;
  const rand = () => (r ??= legacyRandom(mthSeed(x, y, z)));
  for (const rule of list) {
    if (rule.heightChance) {
      // (AlwaysTrueTest on the input: any block, air too, which stays air)
      const [lo, hi, d0, d1] = rule.heightChance;
      const t = Math.max(0, Math.min(1, (Math.abs(dy) - d0) / (d1 - d0)));
      if (!(rand().nextFloat() <= lo + (hi - lo) * t)) continue;
      return rule.output;
    }
    if (rule.input !== id) continue;
    if (rule.chance < 1 && !(rand().nextFloat() < rule.chance)) continue;
    return rule.output;
  }
  return st;
}

// ---------------------------------------------------------------------------------------------------------------
// Templates

/** a mob a template places (vanilla StructureTemplate entities) */
export interface TemplateMob {
  /** the block it stands in, in the template */
  x: number;
  y: number;
  z: number;
  entity: Omit<SavedEntity, 'x' | 'y' | 'z' | 'yaw' | 'pitch' | 'dx' | 'dy' | 'dz' | 'fire'>;
}

/** a template drawn on a grid, and the mobs it places */
export class BastionGrid extends Grid {
  readonly mobs: TemplateMob[] = [];

  /** a chest with a loot table, its front to `facing` */
  chest(x: number, y: number, z: number, facing: string, table: string): this {
    return this.entity(x, y, z, `chest[facing=${facing}]`, {}, `chests/${table}`);
  }

  /** a monster spawner of that mob (vanilla SpawnerBlockEntity: a delay of 20 to begin with) */
  spawner(x: number, y: number, z: number, mob: string): this {
    return this.entity(x, y, z, 'spawner', { entity: mob, delay: 20 });
  }

  /**
   * a mob from a pool (bastion/mobs/...) standing on the block above (x, y, z): the connector is in the floor block,
   * which it leaves as it is drawn
   */
  mob(x: number, y: number, z: number, which: 'piglin' | 'hoglin' | 'piglin_melee'): this {
    return this.jig(x, y, z, 'up', { target: J.mob, pool: `bastion/mobs/${which}`, top: 'north' });
  }

  /** a block of gold, or not, from bastion/blocks/gold on the block above (x, y, z) */
  gold(x: number, y: number, z: number): this {
    return this.jig(x, y, z, 'up', { target: J.block, pool: 'bastion/blocks/gold', top: 'north' });
  }

  /** a connector (a thin wrapper over Grid.jig) */
  connect(x: number, y: number, z: number, facing: Dir6, o: Omit<JigsawSpec, 'at' | 'facing'>): this {
    return this.jig(x, y, z, facing, o);
  }
}

/** the connectors' names */
export const J = {
  mob: 'bastion:mob',
  block: 'bastion:block',
};

export interface BastionTemplate {
  grid: BastionGrid;
  template: Template;
  airs: Int32Array;
  blockEntities: TemplateBlockEntity[];
}

/** blocks whose shape depends on their neighbours: fixed up once the chunks round them are there */
const SHAPED = /(_wall|_fence|_pane|_stairs|^iron_bars|^chest)$/;

/** vanilla StructureTemplate.transform(BlockPos) about the origin */
const turnX = (x: number, z: number, rot: number) => (rot === 1 ? -z : rot === 2 ? -x : rot === 3 ? z : x);
const turnZ = (x: number, z: number, rot: number) => (rot === 1 ? x : rot === 2 ? -z : rot === 3 ? -x : z);

/** where the whole structure's base is (vanilla's processors measure heights from the start piece's floor) */
export interface BastionPlaceCtx extends PlaceCtx {
  baseY: number;
}

/**
 * vanilla SinglePoolElement with a bastion processor list: every block of the template, air included (structure void
 * aside), run through the processors and turned with the piece; the chests get their loot tables, the spawners their
 * mob, and the mobs are placed as their chunk's entities (persistent, finalized as a structure's when they're loaded)
 */
export class BastionElement extends SingleElement {
  constructor(readonly t: BastionTemplate, readonly list: ProcessorList | null) {
    super(t.template, 'rigid');
  }

  override place(pc: PlaceCtx, piece: Piece): void {
    const { ctx, chunk } = pc;
    const baseY = (pc as BastionPlaceCtx).baseY ?? piece.y;
    const rot = piece.rot;
    const inChunk = (x: number, z: number) => x >= chunk.minX && x <= chunk.maxX && z >= chunk.minZ && z <= chunk.maxZ;
    // the air first, then the blocks
    const a = this.t.airs;
    for (let i = 0; i < a.length; i += 3) {
      const wx = piece.x + turnX(a[i], a[i + 2], rot), wz = piece.z + turnZ(a[i], a[i + 2], rot), wy = piece.y + a[i + 1];
      if (!inChunk(wx, wz) || wy < MIN_Y || wy >= MAX_Y) continue;
      ctx.set(wx, wy, wz, 0);
    }
    const b = this.template.blocks;
    for (let i = 0; i < b.length; i += 4) {
      const wx = piece.x + turnX(b[i], b[i + 2], rot), wz = piece.z + turnZ(b[i], b[i + 2], rot), wy = piece.y + b[i + 1];
      if (!inChunk(wx, wz) || wy < MIN_Y || wy >= MAX_Y) continue;
      let st = b[i + 3];
      if (this.list) st = runProcessor(this.list, st, wx, wy, wz, wy - baseY);
      if (st <= 0) {
        ctx.set(wx, wy, wz, 0);
        continue;
      }
      st = rotateState(st, rot);
      ctx.set(wx, wy, wz, st);
      const name = blockOf(st).name;
      if (FLAGS[st] & F_LAVA && name === 'lava') ctx.scheduleFluid(wx, wy, wz);
      if (SHAPED.test(name)) ctx.markForPostprocessing(wx, wy, wz);
    }
    for (const e of this.t.blockEntities) {
      const wx = piece.x + turnX(e.x, e.z, rot), wz = piece.z + turnZ(e.x, e.z, rot), wy = piece.y + e.y;
      if (!inChunk(wx, wz) || blockOf(ctx.getOrAir(wx, wy, wz)).name !== e.block) continue;
      const data: Record<string, number | string> = { ...e.data };
      if (e.table) {
        data.lootTable = e.table;
        data.lootSeed = hash3(wx, wy, wz, pc.salt ^ 0x6ba57) >>> 0;
      }
      ctx.blockEntities.push({ id: e.block, x: wx, y: wy, z: wz, items: [], data });
    }
    for (const m of this.t.grid.mobs) {
      // (vanilla StructureTemplate.transform(Vec3) about the block corner: the middle of its block stays the middle)
      const bx = piece.x + turnX(m.x, m.z, rot), bz = piece.z + turnZ(m.x, m.z, rot);
      const wx = bx + (rot === 1 || rot === 2 ? -0.5 : 0.5), wz = bz + (rot === 2 || rot === 3 ? -0.5 : 0.5);
      const cx = Math.floor(wx), cz = Math.floor(wz);
      if (!inChunk(cx, cz)) continue;
      const yaw = (hash3(cx, piece.y + m.y, cz, pc.salt ^ 0x3a7) >>> 0) % 360;
      ctx.entities.push({ ...m.entity, x: wx, y: piece.y + m.y, z: wz, yaw, pitch: 0, dx: 0, dy: 0, dz: 0, fire: 0 } as SavedEntity);
    }
  }
}

/** a template registered under this name (vanilla's), and its element with that processor list */
export function element(g: BastionGrid, id: string, list: ProcessorName | null): BastionElement {
  const built = g.build(id);
  return new BastionElement({ grid: g, template: built.template, airs: built.airs, blockEntities: built.blockEntities }, list ? PROCESSORS[list] : null);
}

// ---------------------------------------------------------------------------------------------------------------
// The mobs and the blocks of gold (vanilla BastionSharedPools)

/** a structure's mob: persistent (vanilla PersistenceRequired), equipped and finalized as a structure's when it's loaded */
function mobTemplate(id: string, entity: TemplateMob['entity']): PoolElement {
  const g = new BastionGrid(1, 1, 1);
  g.set(0, 0, 0, AIR).jig(0, 0, 0, 'down', { name: J.mob, top: 'north' });
  g.mobs.push({ x: 0, y: 0, z: 0, entity: { ...entity, persistent: true, data: { finalize: 'structure' } } });
  return element(g, id, null);
}

const MELEE_PIGLIN = mobTemplate('bastion/mobs/melee_piglin', { id: 'piglin_brute', health: 50 });
const MELEE_PIGLIN_ALWAYS = mobTemplate('bastion/mobs/melee_piglin_always', { id: 'piglin_brute', health: 50 });
const SWORD_PIGLIN = mobTemplate('bastion/mobs/sword_piglin', { id: 'piglin', health: 16, hand: ['golden_sword', 1, 0] });
const CROSSBOW_PIGLIN = mobTemplate('bastion/mobs/crossbow_piglin', { id: 'piglin', health: 16, hand: ['crossbow', 1, 0] });
const HOGLIN = mobTemplate('bastion/mobs/hoglin', { id: 'hoglin', health: 40 });
/** vanilla bastion/mobs/empty: a mob-less place */
const NO_MOB = (() => {
  const g = new BastionGrid(1, 1, 1);
  g.jig(0, 0, 0, 'down', { name: J.mob, top: 'north' });
  return element(g, 'bastion/mobs/empty', null);
})();

/** a block (vanilla bastion/blocks/gold and bastion/blocks/air) */
function blockTemplate(id: string, block: string): PoolElement {
  const g = new BastionGrid(1, 1, 1);
  g.set(0, 0, 0, block).jig(0, 0, 0, 'down', { name: J.block, top: 'north' });
  return element(g, id, null);
}

pool('bastion/mobs/piglin', 'empty', [[MELEE_PIGLIN, 1], [SWORD_PIGLIN, 4], [CROSSBOW_PIGLIN, 4], [NO_MOB, 1]]);
pool('bastion/mobs/hoglin', 'empty', [[HOGLIN, 2], [NO_MOB, 1]]);
pool('bastion/mobs/piglin_melee', 'empty', [[MELEE_PIGLIN_ALWAYS, 1], [MELEE_PIGLIN, 5], [SWORD_PIGLIN, 1]]);
pool('bastion/blocks/gold', 'empty', [[blockTemplate('bastion/blocks/air', AIR), 3], [blockTemplate('bastion/blocks/gold', GOLD), 1]]);

export { EMPTY };

// ---------------------------------------------------------------------------------------------------------------
// Shared shapes: walls, ramparts, floors

/** a hash of a position in a template, for the patterns (the same every time the template is built) */
export function h(x: number, y: number, z: number, salt = 0): number {
  return (hash3(x, y, z, 0xba57 ^ salt) >>> 0) / 4294967296;
}

/**
 * a bastion wall's block at height y from its foot and position u along it: a blackstone footing, courses of polished
 * blackstone bricks with blackstone let into them in patches, a chiseled band, the odd block of gold
 */
export function wallBlock(u: number, y: number, v = 0, height = 20): string {
  if (y <= 1) return h(u, y, v, 1) < 0.6 ? BS : PBB;
  if (y === height - 2) return (u & 3) === 1 ? CPB : PB;
  const n = h(u >> 1, y >> 1, v, 2);
  if (n < 0.14) return BS;
  if (n > 0.997) return GOLD;
  return PBB;
}

/**
 * a wall along x (z = z0..z1 thick) from x0 to x1, y0 to y1: courses as `wallBlock`, a doorway or none. The outer
 * face (z0) has pilasters of polished blackstone every `bay` blocks
 */
export function wallX(g: BastionGrid, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, bay = 6): void {
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
        const pilaster = (x - x0) % bay === 0 && z === z0;
        g.set(x, y, z, pilaster && y - y0 > 1 ? ((y - y0) % 5 === 4 ? CPB : PB) : wallBlock(x, y - y0, z, y1 - y0 + 1));
      }
}

/** the same wall along z (x = x0..x1 thick) */
export function wallZ(g: BastionGrid, z0: number, z1: number, y0: number, y1: number, x0: number, x1: number, bay = 6): void {
  for (let z = z0; z <= z1; z++)
    for (let y = y0; y <= y1; y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        const pilaster = (z - z0) % bay === 0 && x === x0;
        g.set(x, y, z, pilaster && y - y0 > 1 ? ((y - y0) % 5 === 4 ? CPB : PB) : wallBlock(z, y - y0, x, y1 - y0 + 1));
      }
}

/**
 * a rampart along a wall's top: a walkway of blackstone and bricks at y, a parapet on the outer side of merlons (two
 * blocks of bricks) and crenels (a blackstone wall post), stairs overhanging the outer face under it
 */
export function rampartX(g: BastionGrid, x0: number, x1: number, y: number, zOut: number, zIn: number, outward: string): void {
  const step = zIn > zOut ? 1 : -1;
  for (let x = x0; x <= x1; x++) {
    for (let z = zOut; z !== zIn + step; z += step) g.set(x, y, z, h(x, y, z, 3) < 0.3 ? BS : PBB);
    const merlon = (x - x0) % 4 < 2;
    g.set(x, y + 1, zOut, merlon ? PBB : PBB_WALL);
    if (merlon) g.set(x, y + 2, zOut, h(x, y, zOut, 4) < 0.15 ? slab(PBB_) : PBB);
    // under the walkway's edge, stairs upside down overhanging the face
    g.set(x, y - 1, zOut - step, stairs(PBB_, outward === 'north' ? 'south' : outward === 'south' ? 'north' : outward === 'west' ? 'east' : 'west', 'top'));
  }
}

/** the same along z */
export function rampartZ(g: BastionGrid, z0: number, z1: number, y: number, xOut: number, xIn: number, outward: string): void {
  const step = xIn > xOut ? 1 : -1;
  for (let z = z0; z <= z1; z++) {
    for (let x = xOut; x !== xIn + step; x += step) g.set(x, y, z, h(x, y, z, 3) < 0.3 ? BS : PBB);
    const merlon = (z - z0) % 4 < 2;
    g.set(xOut, y + 1, z, merlon ? PBB : PBB_WALL);
    if (merlon) g.set(xOut, y + 2, z, h(xOut, y, z, 4) < 0.15 ? slab(PBB_) : PBB);
    g.set(xOut - step, y - 1, z, stairs(PBB_, outward === 'west' ? 'east' : outward === 'east' ? 'west' : outward === 'north' ? 'south' : 'north', 'top'));
  }
}

/** a floor of blackstone and polished blackstone bricks in a pattern: bricks in a border and a lattice, blackstone between */
export function floor(g: BastionGrid, x0: number, z0: number, x1: number, z1: number, y: number, border = PBB): void {
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++) {
      const edge = x === x0 || z === z0 || x === x1 || z === z1;
      const lattice = (x - x0) % 4 === 0 || (z - z0) % 4 === 0;
      g.set(x, y, z, edge ? border : lattice ? PBB : h(x, y, z, 5) < 0.2 ? PB : BS);
    }
}

/**
 * a foundation under a piece, down to the lava sea's floor: blackstone and bricks, with magma let into the bottom
 * courses (vanilla's bottom ramparts; the bottom_rampart processor turns most of the magma to cracked bricks)
 */
export function foundation(g: BastionGrid, x0: number, z0: number, x1: number, z1: number, yTop: number, yBottom = 0): void {
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++)
      for (let y = yBottom; y <= yTop; y++) {
        const edge = x === x0 || z === z0 || x === x1 || z === z1;
        if (!edge && y < yTop - 1) {
          // (hollow inside: the netherrack or lava it stands in stays)
          continue;
        }
        g.set(x, y, z, y - yBottom < 3 && h(x, y, z, 6) < 0.35 ? MAGMA : h(x, y, z, 7) < 0.3 ? BS : PBB);
      }
}

/** a chain hanging from (x, yTop, z) down `len` blocks, a lantern (soul or not) at its end */
export function hangingLantern(g: BastionGrid, x: number, yTop: number, z: number, len: number, soul = true): void {
  for (let i = 0; i < len; i++) g.set(x, yTop - i, z, CHAIN);
  g.set(x, yTop - len, z, soul ? SOUL_LANTERN_HANGING : LANTERN_HANGING);
}

/** is a cell's block a solid one of the palette (for drawing mobs and gold on floors) */
export function isSolid(s: string | null): boolean {
  return !!s && s !== AIR && !s.startsWith(CHAIN) && !s.includes('lantern') && !s.includes('_wall') && !s.includes('slab[type=bottom');
}

/** a named pool of elements with their weights (vanilla StructureTemplatePool, fallback minecraft:empty) */
export function bastionPool(name: string, entries: [PoolElement, number][], fallback = 'empty'): void {
  pool(name, fallback, entries);
}

/** a template's size across and its own connector (facing down, its top north), for seating it with `seat` */
export interface Seatable {
  sx: number;
  sz: number;
  jx: number;
  jy: number;
  jz: number;
}

/**
 * a connector in this piece facing up (an aligned joint) that seats a child from `pool` turned `rot` quarter turns
 * clockwise with its box's least corner at (x0, y0, z0) of this piece: where vanilla's big "air" start pieces hold
 * the parts of a bastion, each in its own place (the child's own connector faces down, its top north)
 */
export function seat(g: BastionGrid, x0: number, y0: number, z0: number, rot: 0 | 1 | 2 | 3, c: Seatable, target: string, pool: string): void {
  let x: number, z: number;
  if (rot === 0) [x, z] = [x0 + c.jx, z0 + c.jz];
  else if (rot === 1) [x, z] = [x0 + c.sz - 1 - c.jz, z0 + c.jx];
  else if (rot === 2) [x, z] = [x0 + c.sx - 1 - c.jx, z0 + c.sz - 1 - c.jz];
  else [x, z] = [x0 + c.jz, z0 + c.sx - 1 - c.jx];
  g.connect(x, y0 + c.jy - 1, z, 'up', { target, pool, top: rotDir('north', rot), joint: 'aligned' });
}

/** a box of wall courses (`wallBlock`), `u` running along x or z */
export function masonry(g: BastionGrid, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, alongX = true): void {
  g.fill(x0, y0, z0, x1, y1, z1, (x, y, z) => wallBlock(alongX ? x : z, y - y0, alongX ? z : x, y1 - y0 + 1));
}

/** a doorway through a wall, `w` wide and `hgt` high from (x0, y0, z0) along x or z, `d` deep, its lintel of upside-down stairs */
export function doorway(g: BastionGrid, x0: number, y0: number, z0: number, w: number, hgt: number, d: number, alongX: boolean): void {
  for (let i = 0; i < w; i++)
    for (let k = 0; k < d; k++) {
      const [x, z] = alongX ? [x0 + i, z0 + k] : [x0 + k, z0 + i];
      g.fill(x, y0, z, x, y0 + hgt - 1, z, AIR);
    }
  // (the lintel's ends stepped in: stairs facing into the opening)
  for (let k = 0; k < d; k++) {
    const [ax, az] = alongX ? [x0, z0 + k] : [x0 + k, z0];
    const [bx, bz] = alongX ? [x0 + w - 1, z0 + k] : [x0 + k, z0 + w - 1];
    g.set(ax, y0 + hgt - 1, az, stairs(PBB_, alongX ? 'east' : 'south', 'top'));
    g.set(bx, y0 + hgt - 1, bz, stairs(PBB_, alongX ? 'west' : 'north', 'top'));
  }
}

/** a pillar from y0 to y1: polished basalt, chiseled blackstone at the foot and the head */
export function pillar(g: BastionGrid, x: number, y0: number, y1: number, z: number): void {
  for (let y = y0; y <= y1; y++) g.set(x, y, z, y === y0 || y === y1 ? CPB : PBASALT);
}
