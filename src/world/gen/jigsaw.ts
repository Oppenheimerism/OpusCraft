// Jigsaw structures (vanilla JigsawPlacement, StructureTemplatePool, LegacySinglePoolElement, FeaturePoolElement,
// PoolElementStructurePiece and Beardifier). Pieces are hand-written block templates. A structure grows breadth-first
// from its start piece: every jigsaw connector of a placed piece draws pieces from its pool until one fits, joined
// connector to connector, and each new piece has to keep clear of the others. The pieces are then placed chunk by
// chunk, and the rigid ones bend the terrain noise around themselves (the "beard") before the chunk is filled.

import { JavaRandom, Rand, hash3 } from '../../core/rng';
import { BLOCK_BY_NAME, blockOf, FLAGS, F_WATER, F_WATERLOGGED, F_AIR } from '../block';
import { MIN_Y, MAX_Y } from '../constants';
import type { GenContext } from './context';
import type { SavedEntity } from '../../entity/mob';

// ---------------------------------------------------------------------------------------------------------------
// Directions and rotations

export type Dir6 = 'north' | 'south' | 'west' | 'east' | 'up' | 'down';
export const STEP: Record<Dir6, [number, number, number]> = {
  north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0], up: [0, 1, 0], down: [0, -1, 0],
};
const OPPOSITE: Record<Dir6, Dir6> = { north: 'south', south: 'north', west: 'east', east: 'west', up: 'down', down: 'up' };
const CLOCKWISE: Dir6[] = ['north', 'east', 'south', 'west'];

/** vanilla Rotation, by ordinal: NONE, CLOCKWISE_90, CLOCKWISE_180, COUNTERCLOCKWISE_90 (= clockwise quarter turns) */
export type Rot = 0 | 1 | 2 | 3;

/** vanilla Rotation.rotate(Direction) */
export function rotDir(d: Dir6, rot: number): Dir6 {
  const i = CLOCKWISE.indexOf(d);
  return i < 0 ? d : CLOCKWISE[(i + rot) & 3];
}

/** vanilla StructureTemplate.transform(BlockPos) about the origin, x and z */
function rotX(x: number, z: number, rot: number): number {
  return rot === 1 ? -z : rot === 2 ? -x : rot === 3 ? z : x;
}
function rotZ(x: number, z: number, rot: number): number {
  return rot === 1 ? x : rot === 2 ? -z : rot === 3 ? -x : z;
}

// ---------------------------------------------------------------------------------------------------------------
// Block states

const parsed = new Map<string, number>();

/** "oak_stairs[facing=north,half=top]" to a state (unknown blocks and properties are template bugs: they throw) */
export function parseState(s: string): number {
  const c = parsed.get(s);
  if (c !== undefined) return c;
  const i = s.indexOf('[');
  const name = i < 0 ? s : s.slice(0, i);
  const b = BLOCK_BY_NAME.get(name);
  if (!b) throw new Error(`jigsaw template: unknown block ${name}`);
  let st = b.defaultState;
  if (i >= 0) {
    for (const kv of s.slice(i + 1, -1).split(',')) {
      const [k, v] = kv.split('=');
      const pi = b.propIndex(k);
      if (pi < 0) throw new Error(`jigsaw template: ${name} has no property ${k}`);
      const val = b.props[pi].values.find((x) => String(x) === v);
      if (val === undefined) throw new Error(`jigsaw template: ${name}.${k} can't be ${v}`);
      st = b.with(st, k, val);
    }
  }
  parsed.set(s, st);
  return st;
}

const SIDES = ['north', 'east', 'south', 'west'];
const RAIL_TURN: Record<string, string> = {
  north_south: 'east_west', east_west: 'north_south', ascending_east: 'ascending_south', ascending_west: 'ascending_north',
  ascending_north: 'ascending_east', ascending_south: 'ascending_west', south_east: 'south_west', south_west: 'north_west', north_west: 'north_east', north_east: 'south_east',
};
const rotated: Map<number, number>[] = [new Map(), new Map(), new Map(), new Map()];

/** vanilla BlockState.rotate: facings, axes, 16-way rotations, side connections and rail shapes turn with the piece */
export function rotateState(st: number, rot: number): number {
  if (!rot || st <= 0) return st;
  const cache = rotated[rot];
  const c = cache.get(st);
  if (c !== undefined) return c;
  const b = blockOf(st);
  let out = st;
  for (const p of b.props) {
    const v = b.get(st, p.name);
    if (p.name === 'facing' && typeof v === 'string' && CLOCKWISE.includes(v as Dir6)) out = b.with(out, 'facing', rotDir(v as Dir6, rot));
    else if (p.name === 'axis' && rot & 1 && (v === 'x' || v === 'z')) out = b.with(out, 'axis', v === 'x' ? 'z' : 'x');
    else if (p.name === 'rotation' && typeof v === 'number') out = b.with(out, 'rotation', (v + rot * 4) & 15);
    else if (p.name === 'shape' && typeof v === 'string' && b.name.endsWith('rail')) {
      let s = v;
      for (let i = 0; i < rot; i++) s = RAIL_TURN[s] ?? s;
      if (p.values.includes(s)) out = b.with(out, 'shape', s);
    }
  }
  // side connections (fences, panes, walls, vines): the value on each side moves round with it
  if (SIDES.every((s) => b.propIndex(s) >= 0)) {
    const vals = SIDES.map((s) => b.get(st, s));
    for (let i = 0; i < 4; i++) out = b.with(out, SIDES[(i + rot) & 3], vals[i]);
  }
  cache.set(st, out);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Templates

export interface JigsawSpec {
  at: [number, number, number];
  facing: Dir6;
  /** for connectors facing up or down: where their top points (default north) */
  top?: Dir6;
  /** what this connector is called (default minecraft:empty) */
  name?: string;
  /** the name of the connector a child must offer */
  target?: string;
  /** where children come from (default minecraft:empty, i.e. none) */
  pool?: string;
  /** vertical connectors: rollable (default) lets a child turn any way, aligned keeps tops together */
  joint?: 'rollable' | 'aligned';
  /** what the connector turns into (default air, which a legacy piece doesn't place) */
  final?: string;
  /** (trial chambers) vanilla selection_priority: a piece's connectors are tried highest first (in random order among equals) */
  selection?: number;
  /** (trial chambers) vanilla placement_priority: a piece joined here has its own connectors seen to before lower ones' */
  placement?: number;
}

export interface EntitySpec {
  /** position in the template (block corner coordinates) */
  at: [number, number, number];
  id: string;
  health: number;
  yaw?: number;
  data?: Record<string, number | string | boolean>;
  /** more data drawn when it's placed (vanilla Mob.finalizeSpawn for a structure) */
  init?: (r: Rand) => Record<string, number | string | boolean>;
}

export interface TemplateSpec {
  /** block per character; '.' and ' ' are structure void (a legacy piece doesn't place air either) */
  key: Record<string, string>;
  /** layers bottom-up; each layer is rows north to south separated by '|', each row west to east */
  layers: string[];
  jigsaws?: JigsawSpec[];
  /** containers filled from a loot table the first time they're opened */
  loot?: { at: [number, number, number]; table: string }[];
  entities?: EntitySpec[];
}

export interface Jigsaw {
  x: number;
  y: number;
  z: number;
  front: Dir6;
  top: Dir6;
  name: string;
  target: string;
  pool: string;
  rollable: boolean;
  /** (trial chambers) vanilla selection_priority and placement_priority (0 unless given) */
  selection: number;
  placement: number;
}

export class Template {
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  /** packed local blocks: x, y, z, state (jigsaws already turned into their final state) */
  readonly blocks: Int32Array;
  /** connectors in vanilla's template order (y, then x, then z) */
  readonly jigsaws: Jigsaw[];
  readonly loot: { x: number; y: number; z: number; table: string }[];
  readonly entities: EntitySpec[];

  constructor(readonly id: string, spec: TemplateSpec) {
    const layers = spec.layers.map((l) => l.split('|'));
    this.sy = layers.length;
    this.sz = Math.max(...layers.map((l) => l.length));
    this.sx = Math.max(...layers.flatMap((l) => l.map((r) => r.length)));
    const out: number[] = [];
    const finals = new Map<string, number>();
    for (const j of spec.jigsaws ?? []) {
      const f = j.final && j.final !== 'air' ? parseState(j.final) : 0;
      if (f) finals.set(j.at.join(), f);
    }
    for (let y = 0; y < this.sy; y++)
      for (let z = 0; z < layers[y].length; z++) {
        const row = layers[y][z];
        for (let x = 0; x < row.length; x++) {
          const ch = row[x];
          const f = finals.get(`${x},${y},${z}`);
          if (f) {
            out.push(x, y, z, f);
            finals.delete(`${x},${y},${z}`);
            continue;
          }
          if (ch === '.' || ch === ' ') continue;
          const s = spec.key[ch];
          if (s === undefined) throw new Error(`jigsaw template ${id}: no block for '${ch}'`);
          if (s === 'air') continue;
          out.push(x, y, z, parseState(s));
        }
      }
    for (const [k, f] of finals) out.push(...k.split(',').map(Number), f);
    this.blocks = Int32Array.from(out);
    this.jigsaws = (spec.jigsaws ?? [])
      .map((j) => {
        const vertical = j.facing === 'up' || j.facing === 'down';
        return {
          x: j.at[0], y: j.at[1], z: j.at[2], front: j.facing, top: vertical ? (j.top ?? 'north') : 'up',
          name: j.name ?? 'empty', target: j.target ?? 'empty', pool: j.pool ?? 'empty',
          rollable: (j.joint ?? (vertical ? 'rollable' : 'aligned')) === 'rollable',
          selection: j.selection ?? 0,
          placement: j.placement ?? 0,
        } as Jigsaw;
      })
      .sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);
    for (const j of this.jigsaws)
      if (j.x < 0 || j.y < 0 || j.z < 0 || j.x >= this.sx || j.y >= this.sy || j.z >= this.sz) throw new Error(`jigsaw template ${id}: connector outside`);
    this.loot = (spec.loot ?? []).map((l) => ({ x: l.at[0], y: l.at[1], z: l.at[2], table: l.table }));
    this.entities = spec.entities ?? [];
  }
}

export const TEMPLATES = new Map<string, Template>();

export function template(id: string, spec: TemplateSpec): Template {
  const t = new Template(id, spec);
  TEMPLATES.set(id, t);
  return t;
}

// ---------------------------------------------------------------------------------------------------------------
// Boxes and free space

/** an inclusive block box (vanilla BoundingBox) */
export class Box {
  constructor(public minX: number, public minY: number, public minZ: number, public maxX: number, public maxY: number, public maxZ: number) {}
  intersects(o: Box): boolean {
    return this.maxX >= o.minX && this.minX <= o.maxX && this.maxZ >= o.minZ && this.minZ <= o.maxZ && this.maxY >= o.minY && this.minY <= o.maxY;
  }
  intersectsXZ(x0: number, z0: number, x1: number, z1: number): boolean {
    return this.maxX >= x0 && this.minX <= x1 && this.maxZ >= z0 && this.minZ <= z1;
  }
  isInside(x: number, y: number, z: number): boolean {
    return x >= this.minX && x <= this.maxX && z >= this.minZ && z <= this.maxZ && y >= this.minY && y <= this.maxY;
  }
  within(o: Box): boolean {
    return this.minX >= o.minX && this.maxX <= o.maxX && this.minY >= o.minY && this.maxY <= o.maxY && this.minZ >= o.minZ && this.maxZ <= o.maxZ;
  }
  moved(dx: number, dy: number, dz: number): Box {
    return new Box(this.minX + dx, this.minY + dy, this.minZ + dz, this.maxX + dx, this.maxY + dy, this.maxZ + dz);
  }
  get ySpan(): number {
    return this.maxY - this.minY + 1;
  }
}

/**
 * vanilla's free-space VoxelShape: a box with the pieces placed in it cut out. A new piece fits when, shrunk by a
 * quarter block, it lies wholly in what's left, so pieces may touch but not overlap
 */
class FreeSpace {
  private readonly taken: Box[] = [];
  constructor(private readonly bounds: Box) {}
  fits(b: Box): boolean {
    if (!b.within(this.bounds)) return false;
    for (const t of this.taken) if (t.intersects(b)) return false;
    return true;
  }
  take(b: Box): void {
    this.taken.push(b);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Processors (vanilla RuleProcessor and friends)

export interface ProcessorRule {
  /** the template's block (a block name) */
  input: string;
  /** vanilla RandomBlockMatchTest: only this share of them */
  chance?: number;
  /** vanilla location predicate: what's in the world where it goes (a block name) */
  location?: string;
  output: string;
}

export interface Processor {
  rules: { input: number; chance: number; location: number; output: number }[];
}

export function processor(rules: ProcessorRule[]): Processor {
  const id = (n: string) => {
    const b = BLOCK_BY_NAME.get(n);
    if (!b) throw new Error(`jigsaw processor: unknown block ${n}`);
    return b.id;
  };
  return { rules: rules.map((r) => ({ input: id(r.input), chance: r.chance ?? 1, location: r.location ? id(r.location) : -1, output: parseState(r.output) })) };
}

/** vanilla RuleProcessor.processBlock: the first rule that matches decides (a random per position, as vanilla's Mth.getSeed) */
function runProcessors(list: Processor[], st: number, current: number, x: number, y: number, z: number, salt: number): number {
  let r: Rand | null = null;
  for (const p of list) {
    const bid = blockOf(st).id;
    for (const rule of p.rules) {
      if (rule.input !== bid) continue;
      if (rule.chance < 1) {
        r ??= new Rand(hash3(x, y, z, salt ^ 0x9e3779b9), 0x7c0);
        if (!(r.nextFloat() < rule.chance)) continue;
      }
      if (rule.location >= 0 && (current <= 0 || blockOf(current).id !== rule.location)) continue;
      st = rule.output;
      break;
    }
  }
  return st;
}

// ---------------------------------------------------------------------------------------------------------------
// Pool elements

export type Projection = 'rigid' | 'terrain_matching';

/** a jigsaw connector placed in the world */
export interface PlacedJigsaw {
  x: number;
  y: number;
  z: number;
  front: Dir6;
  top: Dir6;
  info: Jigsaw;
}

/** what a village places: entities go into the chunk's list, the rest through the generation context */
export interface PlaceCtx {
  ctx: GenContext;
  /** the chunk being generated (all heights) */
  chunk: Box;
  /** world seed salt for per-position randomness */
  salt: number;
}

export abstract class PoolElement {
  groundLevelDelta = 1;
  constructor(readonly projection: Projection) {}
  abstract jigsaws(x: number, y: number, z: number, rot: number): PlacedJigsaw[];
  abstract box(x: number, y: number, z: number, rot: number): Box;
  abstract place(pc: PlaceCtx, piece: Piece): void;
}

/** vanilla LegacySinglePoolElement: a template whose air and structure void leave the world as it is */
export class SingleElement extends PoolElement {
  constructor(readonly template: Template, projection: Projection, readonly processors: Processor[] = []) {
    super(projection);
  }

  jigsaws(x: number, y: number, z: number, rot: number): PlacedJigsaw[] {
    return this.template.jigsaws.map((j) => ({
      x: x + rotX(j.x, j.z, rot), y: y + j.y, z: z + rotZ(j.x, j.z, rot), front: rotDir(j.front, rot), top: rotDir(j.top, rot), info: j,
    }));
  }

  box(x: number, y: number, z: number, rot: number): Box {
    const t = this.template;
    const ax = rotX(t.sx - 1, t.sz - 1, rot), az = rotZ(t.sx - 1, t.sz - 1, rot);
    return new Box(x + Math.min(0, ax), y, z + Math.min(0, az), x + Math.max(0, ax), y + t.sy - 1, z + Math.max(0, az));
  }

  place(pc: PlaceCtx, piece: Piece): void {
    const { ctx, chunk } = pc;
    const t = this.template, rot = piece.rot, b = t.blocks;
    const terrain = this.projection === 'terrain_matching';
    // (vanilla processBlockInfos: every position is worked out, heightmap included, before anything is placed)
    const at: number[] = [];
    for (let i = 0; i < b.length; i += 4) {
      const wx = piece.x + rotX(b[i], b[i + 2], rot), wz = piece.z + rotZ(b[i], b[i + 2], rot);
      if (wx < chunk.minX || wx > chunk.maxX || wz < chunk.minZ || wz > chunk.maxZ) continue;
      // vanilla GravityProcessor(WORLD_SURFACE_WG, -1): a street lies on the ground, whatever its height
      const wy = terrain ? ctx.heightSurface(wx, wz) - 1 + b[i + 1] : piece.y + b[i + 1];
      if (wy < MIN_Y || wy >= MAX_Y) continue;
      at.push(i, wx, wy, wz);
    }
    for (let k = 0; k < at.length; k += 4) {
      const i = at[k], wx = at[k + 1], wy = at[k + 2], wz = at[k + 3];
      const current = ctx.getOrAir(wx, wy, wz);
      let st = b[i + 3];
      if (this.processors.length) st = runProcessors(this.processors, st, current, wx, wy, wz, pc.salt);
      if (st <= 0 || FLAGS[st] & F_AIR) continue;
      st = rotateState(st, rot);
      // vanilla LiquidSettings.APPLY_WATERLOGGING: what goes into still water takes some in
      const blk = blockOf(st);
      if (current > 0 && FLAGS[current] & F_WATER && !(FLAGS[current] & F_WATERLOGGED) && blk.propIndex('waterlogged') >= 0) {
        const cb = blockOf(current);
        if (cb.name === 'water' && (cb.propIndex('level') < 0 || cb.get(current, 'level') === 0)) st = blk.with(st, 'waterlogged', true);
      }
      ctx.set(wx, wy, wz, st);
      if (FLAGS[st] & F_WATER && blk.name === 'water') ctx.scheduleFluid(wx, wy, wz);
      if (SHAPED.test(blk.name)) ctx.markForPostprocessing(wx, wy, wz);
    }
    for (const l of t.loot) {
      const wx = piece.x + rotX(l.x, l.z, rot), wz = piece.z + rotZ(l.x, l.z, rot);
      if (wx < chunk.minX || wx > chunk.maxX || wz < chunk.minZ || wz > chunk.maxZ) continue;
      const wy = terrain ? ctx.heightSurface(wx, wz) - 1 + l.y : piece.y + l.y;
      const name = blockOf(ctx.getOrAir(wx, wy, wz)).name;
      if (name !== 'chest' && name !== 'barrel') continue;
      const seed = hash3(wx, wy, wz, pc.salt ^ 0x10075eed) >>> 0;
      ctx.blockEntities.push({ id: name, x: wx, y: wy, z: wz, items: [], data: { lootTable: l.table, lootSeed: seed } });
    }
    for (const e of t.entities) {
      // vanilla StructureTemplate.transform(Vec3): about the block corner, so a block centre stays a block centre
      const [ex, ey, ez] = e.at;
      const wx = piece.x + (rot === 1 ? 1 - ez : rot === 2 ? 1 - ex : rot === 3 ? ez : ex);
      const wz = piece.z + (rot === 1 ? ex : rot === 2 ? 1 - ez : rot === 3 ? 1 - ex : ez);
      const bx = Math.floor(wx), bz = Math.floor(wz);
      if (bx < chunk.minX || bx > chunk.maxX || bz < chunk.minZ || bz > chunk.maxZ) continue;
      const wy = (terrain ? ctx.heightSurface(bx, bz) - 1 : piece.y) + ey;
      const extra = e.init?.(new Rand(hash3(bx, Math.floor(wy), bz, pc.salt ^ 0x3e7171), 0x5e));
      const data = e.data || extra ? { ...e.data, ...extra } : undefined;
      pc.ctx.entities.push({
        id: e.id, x: wx, y: wy, z: wz, yaw: ((e.yaw ?? 0) + rot * 90) % 360, pitch: 0, dx: 0, dy: 0, dz: 0, health: e.health, fire: 0,
        ...(data ? { data } : {}),
      } as SavedEntity);
    }
  }
}

/** blocks whose shape depends on their neighbours: they're fixed up once the chunks around are there */
const SHAPED = /(_fence|_pane|_wall|_stairs|_fence_gate|^iron_bars|^grass_block|^podzol|^mycelium|^tripwire|^chest|^redstone_wire)$/;

export type FeatureFn = (ctx: GenContext, x: number, y: number, z: number, r: Rand) => boolean;

/** vanilla FeaturePoolElement: a placed feature grown where its one downward connector lands */
export class FeatureElement extends PoolElement {
  private static readonly JIGSAW: Jigsaw = { x: 0, y: 0, z: 0, front: 'down', top: 'south', name: 'bottom', target: 'empty', pool: 'empty', rollable: true, selection: 0, placement: 0 };
  constructor(readonly feature: FeatureFn, readonly featureName: string) {
    super('rigid');
  }
  jigsaws(x: number, y: number, z: number): PlacedJigsaw[] {
    return [{ x, y, z, front: 'down', top: 'south', info: FeatureElement.JIGSAW }];
  }
  box(x: number, y: number, z: number): Box {
    return new Box(x, y, z, x, y, z);
  }
  place(pc: PlaceCtx, piece: Piece): void {
    const { chunk } = pc;
    if (piece.x < chunk.minX || piece.x > chunk.maxX || piece.z < chunk.minZ || piece.z > chunk.maxZ) return;
    this.feature(pc.ctx, piece.x, piece.y, piece.z, new Rand(hash3(piece.x, piece.y, piece.z, pc.salt ^ 0xfea7), 0x5f));
  }
}

/** vanilla EmptyPoolElement: drawing it ends the search for that connector */
class EmptyElement extends PoolElement {
  constructor() {
    super('terrain_matching');
  }
  jigsaws(): PlacedJigsaw[] {
    return [];
  }
  box(x: number, y: number, z: number): Box {
    return new Box(x, y, z, x, y, z);
  }
  place(): void {}
}
export const EMPTY = new EmptyElement();

// ---------------------------------------------------------------------------------------------------------------
// Pools

export class Pool {
  /** the elements, each as many times as its weight (vanilla StructureTemplatePool.templates) */
  readonly templates: PoolElement[] = [];
  private maxSizeCache = -1;
  constructor(readonly name: string, readonly fallback: string, entries: [PoolElement, number][]) {
    for (const [e, w] of entries) for (let i = 0; i < w; i++) this.templates.push(e);
  }
  /** vanilla getMaxSize: the tallest element */
  maxSize(): number {
    if (this.maxSizeCache < 0) {
      let m = 0;
      for (const e of this.templates) if (e !== EMPTY) m = Math.max(m, e.box(0, 0, 0, 0).ySpan);
      this.maxSizeCache = m;
    }
    return this.maxSizeCache;
  }
  getRandomTemplate(r: JavaRandom): PoolElement {
    return this.templates[r.nextInt(this.templates.length)];
  }
  getShuffledTemplates(r: JavaRandom): PoolElement[] {
    const l = this.templates.slice();
    shuffle(l, r);
    return l;
  }
}

export const POOLS = new Map<string, Pool>();
POOLS.set('empty', new Pool('empty', 'empty', []));

export function pool(name: string, fallback: string, entries: [PoolElement, number][]): Pool {
  const p = new Pool(name, fallback, entries);
  POOLS.set(name, p);
  return p;
}

/** vanilla Util.shuffle */
export function shuffle<T>(l: T[], r: JavaRandom): void {
  for (let j = l.length; j > 1; j--) {
    const k = r.nextInt(j);
    const t = l[j - 1];
    l[j - 1] = l[k];
    l[k] = t;
  }
}

function shuffledJigsaws(e: PoolElement, x: number, y: number, z: number, rot: number, r: JavaRandom): PlacedJigsaw[] {
  const l = e.jigsaws(x, y, z, rot);
  shuffle(l, r);
  // (trial chambers) vanilla SinglePoolElement.sortBySelectionPriority: a stable sort, highest first
  if (l.some((j) => j.info.selection)) l.sort((a, b) => b.info.selection - a.info.selection);
  return l;
}

/**
 * (trial chambers) vanilla SequencedPriorityIterator: the pieces still to be seen to, a queue for each placement
 * priority, the highest first, each in the order they came (with every priority 0: breadth first)
 */
class PriorityQueues<T> {
  private readonly queues = new Map<number, { items: T[]; head: number }>();
  private top: { items: T[]; head: number } | null = null;
  private topPriority = -Infinity;

  add(v: T, priority: number): void {
    if (priority === this.topPriority && this.top) {
      this.top.items.push(v);
      return;
    }
    let q = this.queues.get(priority);
    if (!q) this.queues.set(priority, (q = { items: [], head: 0 }));
    q.items.push(v);
    if (priority >= this.topPriority) {
      this.top = q;
      this.topPriority = priority;
    }
  }

  next(): T | undefined {
    const q = this.top;
    if (!q) return undefined;
    const v = q.items[q.head++];
    if (q.head >= q.items.length) {
      let best = -Infinity, bq: { items: T[]; head: number } | null = null;
      for (const [p, o] of this.queues) if (p > best && o.head < o.items.length) (best = p), (bq = o);
      this.top = bq;
      this.topPriority = best;
    }
    return v;
  }
}

/** vanilla JigsawBlock.canAttach */
function canAttach(a: PlacedJigsaw, b: PlacedJigsaw): boolean {
  return a.front === OPPOSITE[b.front] && (a.info.rollable || a.top === b.top) && a.info.target === b.info.name;
}

// ---------------------------------------------------------------------------------------------------------------
// Pieces

/** vanilla JigsawJunction: where two pieces meet, for the terrain to ease into */
export interface Junction {
  x: number;
  groundY: number;
  z: number;
}

/** vanilla PoolElementStructurePiece */
export class Piece {
  readonly junctions: Junction[] = [];
  constructor(readonly element: PoolElement, public x: number, public y: number, public z: number, readonly rot: Rot, public box: Box, readonly groundLevelDelta: number) {}
  move(dy: number): void {
    this.y += dy;
    this.box = this.box.moved(0, dy, 0);
  }
}

export interface JigsawStart {
  piece: Piece;
  /** vanilla GenerationStub position: the start piece's centre at ground level */
  x: number;
  y: number;
  z: number;
}

/**
 * vanilla JigsawPlacement.addPieces up to the start piece: a random turn and start element at the chunk's corner,
 * lifted so its ground level meets the surface under its centre
 */
export function jigsawStart(startPool: Pool, r: JavaRandom, cx: number, cz: number, height: ((x: number, z: number) => number) | null): JigsawStart | null {
  const rot = r.nextInt(4) as Rot;
  const e = startPool.getRandomTemplate(r);
  if (e === EMPTY) return null;
  const x = cx * 16, z = cz * 16;
  const box = e.box(x, 0, z, rot);
  const piece = new Piece(e, x, 0, z, rot, box, e.groundLevelDelta);
  // (Java's int division rounds toward zero)
  const ix = Math.trunc((box.maxX + box.minX) / 2), iz = Math.trunc((box.maxZ + box.minZ) / 2);
  if (!height) return { piece, x: ix, y: 0, z: iz };
  const k = height(ix, iz);
  piece.move(k - (box.minY + piece.groundLevelDelta));
  return { piece, x: ix, y: k, z: iz };
}

/**
 * vanilla JigsawPlacement.Placer: grow the structure breadth-first from its start piece. (trial chambers) `padding`:
 * vanilla DimensionPadding, the blocks kept clear at the bottom and top of the world; `alias`: vanilla PoolAliasLookup,
 * the pool a connector's pool stands for in this structure
 */
export function jigsawAssemble(
  start: JigsawStart, r: JavaRandom, maxDepth: number, maxDistance: number, expansionHack: boolean, height: (x: number, z: number) => number,
  padding = 0, alias: (pool: string) => string = (p) => p,
): Piece[] {
  const pieces: Piece[] = [start.piece];
  if (maxDepth <= 0) return pieces;
  const i = start.x, m = start.y, j = start.z;
  const free = new FreeSpace(new Box(i - maxDistance, Math.max(m - maxDistance, MIN_Y + padding), j - maxDistance, i + maxDistance, Math.min(m + maxDistance, MAX_Y - 1 - padding), j + maxDistance));
  free.take(start.piece.box);
  const queue = new PriorityQueues<{ piece: Piece; free: FreeSpace; depth: number }>();
  queue.add({ piece: start.piece, free, depth: 0 }, 0);
  for (let s = queue.next(); s; s = queue.next()) tryPlacingChildren(s.piece, s.free, s.depth, maxDepth, expansionHack, pieces, queue, r, height, alias);
  return pieces;
}

function tryPlacingChildren(
  piece: Piece, free: FreeSpace, depth: number, maxDepth: number, expansionHack: boolean, pieces: Piece[], queue: PriorityQueues<{ piece: Piece; free: FreeSpace; depth: number }>,
  r: JavaRandom, height: (x: number, z: number) => number, alias: (pool: string) => string,
): void {
  const element = piece.element;
  const rigid = element.projection === 'rigid';
  const box = piece.box;
  const i = box.minY;
  let inner: FreeSpace | null = null;
  jigsawLoop: for (const jig of shuffledJigsaws(element, piece.x, piece.y, piece.z, piece.rot, r)) {
    const [fx, fy, fz] = STEP[jig.front];
    const tx = jig.x + fx, ty = jig.y + fy, tz = jig.z + fz;
    const jy = jig.y - i;
    let k = -1;
    // (trial chambers) the pool this structure's aliases make it
    const p0 = POOLS.get(alias(jig.info.pool));
    if (!p0 || (p0.templates.length === 0 && jig.info.pool !== 'empty')) continue;
    const fb = POOLS.get(p0.fallback);
    if (!fb || (fb.templates.length === 0 && p0.fallback !== 'empty')) continue;
    let space: FreeSpace;
    if (box.isInside(tx, ty, tz)) space = inner ??= new FreeSpace(box);
    else space = free;
    const candidates = depth !== maxDepth ? p0.getShuffledTemplates(r) : [];
    candidates.push(...fb.getShuffledTemplates(r));
    for (const e2 of candidates) {
      if (e2 === EMPTY) break;
      const rots: Rot[] = [0, 1, 2, 3];
      shuffle(rots, r);
      for (const rot2 of rots) {
        const jigs2 = shuffledJigsaws(e2, 0, 0, 0, rot2, r);
        const box0 = e2.box(0, 0, 0, rot2);
        // vanilla's "expansion hack": a low piece whose own connectors point into it (a street's decorations) is
        // made as tall as what they'd bring, so nothing else is put over it
        let l = 0;
        if (expansionHack && box0.ySpan <= 16) {
          for (const j2 of jigs2) {
            const [sx, sy, sz] = STEP[j2.front];
            if (!box0.isInside(j2.x + sx, j2.y + sy, j2.z + sz)) continue;
            const pp = POOLS.get(j2.info.pool), pf = pp ? POOLS.get(pp.fallback) : undefined;
            l = Math.max(l, pp?.maxSize() ?? 0, pf?.maxSize() ?? 0);
          }
        }
        for (const j2 of jigs2) {
          if (!canAttach(jig, j2)) continue;
          const ox = tx - j2.x, oy = ty - j2.y, oz = tz - j2.z;
          const box3 = e2.box(ox, oy, oz, rot2);
          const mY = box3.minY;
          const rigid2 = e2.projection === 'rigid';
          const n = j2.y;
          const o = jy - n + fy;
          let p: number;
          if (rigid && rigid2) p = i + o;
          else {
            if (k === -1) k = height(jig.x, jig.z);
            p = k - n;
          }
          const dq = p - mY;
          const box4 = box3.moved(0, dq, 0);
          if (l > 0) {
            const rr = Math.max(l + 1, box4.maxY - box4.minY);
            box4.maxY = Math.max(box4.maxY, box4.minY + rr);
          }
          if (!space.fits(box4)) continue;
          space.take(box4);
          const s = piece.groundLevelDelta;
          const t = rigid2 ? s - o : e2.groundLevelDelta;
          const child = new Piece(e2, ox, oy + dq, oz, rot2, box4, t);
          let u: number;
          if (rigid) u = i + jy;
          else if (rigid2) u = p + n;
          else {
            if (k === -1) k = height(jig.x, jig.z);
            u = k + Math.trunc(o / 2);
          }
          piece.junctions.push({ x: tx, groundY: u - jy + s, z: tz });
          child.junctions.push({ x: jig.x, groundY: u - n + t, z: jig.z });
          pieces.push(child);
          if (depth + 1 <= maxDepth) queue.add({ piece: child, free: space, depth: depth + 1 }, jig.info.placement);
          continue jigsawLoop;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Terrain adaptation (vanilla Beardifier with TerrainAdjustment.BEARD_THIN)

/** vanilla BEARD_KERNEL: exp(-(x² + (y + ½)² + z²) / 16) over -12..11 on each axis, indexed [z][x][y] */
const KERNEL = (() => {
  const k = new Float32Array(24 * 24 * 24);
  for (let z = 0; z < 24; z++)
    for (let x = 0; x < 24; x++)
      for (let y = 0; y < 24; y++) {
        const dx = x - 12, dy = y - 12 + 0.5, dz = z - 12;
        k[(z * 24 + x) * 24 + y] = Math.exp(-(dx * dx + dy * dy + dz * dz) / 16);
      }
  return k;
})();

/** vanilla Beardifier.getBeardContribution ((trial chambers) exported: the trial chambers' junctions) */
export function beard(x: number, y: number, z: number, yToGround: number): number {
  const i = x + 12, j = y + 12, k = z + 12;
  if (i < 0 || i >= 24 || j < 0 || j >= 24 || k < 0 || k >= 24) return 0;
  const d = yToGround + 0.5;
  const e = x * x + d * d + z * z;
  const f = (-d / Math.sqrt(e / 2)) / 2;
  return f * KERNEL[(k * 24 + i) * 24 + j];
}

/**
 * The density a chunk's terrain gets from the structures near it: rigid pieces raise the ground under their floor
 * and clear it above, and every junction eases the ground towards its height
 */
export class Beardifier {
  /** minX, minZ, maxX, maxZ, floor per rigid piece */
  private readonly rigid: number[] = [];
  /** x, groundY, z per junction */
  private readonly junctions: number[] = [];
  minY = Infinity;
  maxY = -Infinity;

  /** vanilla Beardifier.forStructuresInChunk */
  add(pieces: Piece[], cx: number, cz: number): void {
    const x0 = cx * 16, z0 = cz * 16;
    for (const p of pieces) {
      if (!p.box.intersectsXZ(x0 - 12, z0 - 12, x0 + 15 + 12, z0 + 15 + 12)) continue;
      if (p.element.projection === 'rigid') {
        const floor = p.box.minY + p.groundLevelDelta;
        this.rigid.push(p.box.minX, p.box.minZ, p.box.maxX, p.box.maxZ, floor);
        this.minY = Math.min(this.minY, floor - 12);
        this.maxY = Math.max(this.maxY, floor + 11);
      }
      for (const j of p.junctions) {
        if (j.x > x0 - 12 && j.z > z0 - 12 && j.x < x0 + 15 + 12 && j.z < z0 + 15 + 12) {
          this.junctions.push(j.x, j.groundY, j.z);
          this.minY = Math.min(this.minY, j.groundY - 12);
          this.maxY = Math.max(this.maxY, j.groundY + 11);
        }
      }
    }
  }

  get empty(): boolean {
    return this.rigid.length === 0 && this.junctions.length === 0;
  }

  /** vanilla Beardifier.compute */
  compute(x: number, y: number, z: number): number {
    let d = 0;
    const rg = this.rigid;
    for (let n = 0; n < rg.length; n += 5) {
      const m = Math.max(0, rg[n] - x, x - rg[n + 2]);
      const q = Math.max(0, rg[n + 1] - z, z - rg[n + 3]);
      if (m >= 12 || q >= 12) continue;
      const p = y - rg[n + 4];
      d += beard(m, p, q, p) * 0.8;
    }
    const jn = this.junctions;
    for (let n = 0; n < jn.length; n += 3) {
      const l = y - jn[n + 1];
      d += beard(x - jn[n], l, z - jn[n + 2], l) * 0.4;
    }
    return d;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Vanilla's seeded randoms (WorldgenRandom on a LegacyRandomSource), in 64-bit arithmetic

const M64 = (1n << 64n) - 1n;

function nextLong(r: JavaRandom): bigint {
  const hi = BigInt(r.next(32)), lo = BigInt(r.next(32));
  return BigInt.asIntN(64, (hi << 32n) + lo);
}

function seedRandom(r: JavaRandom, seed: bigint): void {
  r.setSeed(Number(BigInt.asUintN(48, seed)));
}

/** vanilla WorldgenRandom.setLargeFeatureSeed */
export function largeFeatureRandom(worldSeed: bigint, cx: number, cz: number): JavaRandom {
  const r = new JavaRandom(0);
  seedRandom(r, worldSeed);
  const l = nextLong(r), m = nextLong(r);
  seedRandom(r, ((BigInt(cx) * l) & M64) ^ ((BigInt(cz) * m) & M64) ^ (worldSeed & M64));
  return r;
}

/** vanilla WorldgenRandom.setLargeFeatureWithSalt */
export function saltedRandom(worldSeed: bigint, rx: number, rz: number, salt: number): JavaRandom {
  const r = new JavaRandom(0);
  seedRandom(r, BigInt(rx) * 341873128712n + BigInt(rz) * 132897987541n + worldSeed + BigInt(salt));
  return r;
}

/** vanilla WorldOptions.parseSeed: a number as it is, anything else by its String.hashCode */
export function worldSeed64(seed: string | number | bigint): bigint {
  if (typeof seed === 'bigint') return BigInt.asIntN(64, seed);
  if (typeof seed === 'number') return BigInt.asIntN(64, BigInt(Math.trunc(seed)));
  const s = seed.trim();
  if (/^[+-]?\d+$/.test(s)) {
    const v = BigInt(s);
    if (v >= -(1n << 63n) && v < 1n << 63n) return v;
  }
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return BigInt(h);
}
