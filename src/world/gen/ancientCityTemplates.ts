// The ancient city's pieces as templates written in code (vanilla StructureTemplate, SinglePoolElement,
// ListPoolElement and FeaturePoolElement): every cell of a template's box is structure void, air or a block, and
// unlike a village's, its air is placed too, so a piece hollows out the cave it stands in. As a piece is placed its
// blocks crack and crumble (vanilla's ancient_city_start, _generic and _walls_degradation processor lists), it takes in
// the water it's put into, and it leaves the blocks features can't replace alone. The sculk pieces grow a sculk patch
// (their city works it out: world/gen/ancientCity.ts). The templates themselves are in world/gen/ancientCityPieces.ts.

import { hash3 } from '../../core/rng';
import { BLOCK_BY_NAME, BLOCKS, STATE_BLOCK, FLAGS, F_WATER, F_WATERLOGGED } from '../block';
import { MIN_Y, MAX_Y } from '../constants';
import { Box, PoolElement, rotDir, rotateState, parseState, type Jigsaw, type PlacedJigsaw, type PlaceCtx, type Piece, type Dir6 } from './jigsaw';
import { SCULK_BLOCK_ENTITIES } from './deepDark';
import type { GenContext } from './context';

// ---------------------------------------------------------------------------------------------------------------
// Templates

/** a template cell that leaves the world as it is (vanilla structure void: not part of the template) */
export const VOID = 0xffff;

/** where a template's chests get their loot from */
export interface TemplateLoot {
  x: number;
  y: number;
  z: number;
  table: string;
}

/** a template: every cell of its box (VOID, air or a block), its jigsaw connectors and its chests' loot tables */
export class CityTemplate {
  constructor(
    readonly id: string,
    readonly sx: number,
    readonly sy: number,
    readonly sz: number,
    readonly cells: Uint16Array,
    /** in vanilla's template order: by y, then x, then z */
    readonly jigsaws: Jigsaw[],
    readonly loot: TemplateLoot[],
  ) {}

  at(x: number, y: number, z: number): number {
    return this.cells[(y * this.sz + z) * this.sx + x];
  }
}

export interface ConnectorSpec {
  facing: Dir6;
  /** what this connector is called (default minecraft:empty) */
  name?: string;
  /** the name of the connector a piece put here must have */
  target?: string;
  /** where those pieces come from (default minecraft:empty: none) */
  pool?: string;
  /** what the connector's block becomes (default air) */
  final?: string;
  /** for a connector facing up or down: where its top points (default north) */
  top?: Dir6;
  /** vertical connectors: rollable (default) lets a piece turn any way, aligned keeps their tops together */
  joint?: 'rollable' | 'aligned';
}

/** a template put together block by block; cells not set are structure void */
export class CityBuilder {
  readonly cells: Uint16Array;
  private readonly jigsawList: Jigsaw[] = [];
  private readonly lootList: TemplateLoot[] = [];

  constructor(readonly sx: number, readonly sy: number, readonly sz: number) {
    this.cells = new Uint16Array(sx * sy * sz).fill(VOID);
  }

  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  /** a block, written out ("deepslate_tile_stairs[facing=east]") or as a state; 'air' is air, null is void */
  set(x: number, y: number, z: number, st: string | number | null): this {
    if (!this.inside(x, y, z)) return this;
    this.cells[(y * this.sz + z) * this.sx + x] = st === null ? VOID : typeof st === 'number' ? st : st === 'air' ? 0 : parseState(st);
    return this;
  }

  get(x: number, y: number, z: number): number {
    return this.inside(x, y, z) ? this.cells[(y * this.sz + z) * this.sx + x] : VOID;
  }

  /** the block's name at a cell ('' for void) */
  name(x: number, y: number, z: number): string {
    const c = this.get(x, y, z);
    return c === VOID ? '' : BLOCKS[STATE_BLOCK[c]].name;
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, st: string | number | null): this {
    const s = st === null ? VOID : typeof st === 'number' ? st : st === 'air' ? 0 : parseState(st);
    for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(this.sy - 1, Math.max(y0, y1)); y++)
      for (let z = Math.max(0, Math.min(z0, z1)); z <= Math.min(this.sz - 1, Math.max(z0, z1)); z++)
        for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(this.sx - 1, Math.max(x0, x1)); x++) this.cells[(y * this.sz + z) * this.sx + x] = s;
    return this;
  }

  /** a jigsaw connector (its block becomes its final state) */
  jigsaw(x: number, y: number, z: number, spec: ConnectorSpec): this {
    if (!this.inside(x, y, z)) throw new Error(`ancient city template: connector outside at ${x},${y},${z}`);
    const vertical = spec.facing === 'up' || spec.facing === 'down';
    this.jigsawList.push({
      x, y, z, front: spec.facing, top: vertical ? (spec.top ?? 'north') : 'up', name: spec.name ?? 'minecraft:empty',
      target: spec.target ?? 'minecraft:empty', pool: spec.pool ?? 'empty', rollable: (spec.joint ?? (vertical ? 'rollable' : 'aligned')) === 'rollable',
    });
    return this.set(x, y, z, spec.final ?? 'air');
  }

  /** a chest facing that way, filled from the loot table the first time it's opened */
  chest(x: number, y: number, z: number, facing: 'north' | 'south' | 'west' | 'east', table: string): this {
    this.set(x, y, z, `chest[facing=${facing}]`);
    this.lootList.push({ x, y, z, table });
    return this;
  }

  build(id: string): CityTemplate {
    const js = this.jigsawList.slice().sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);
    return new CityTemplate(id, this.sx, this.sy, this.sz, this.cells, js, this.lootList);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Processors: vanilla ProcessorLists.ANCIENT_CITY_START_DEGRADATION, ANCIENT_CITY_GENERIC_DEGRADATION and
// ANCIENT_CITY_WALLS_DEGRADATION

export type CityProcessors = 'start' | 'generic' | 'walls';

interface ProcessorTables {
  /** block ids: vanilla #ancient_city_replaceable, what BlockRotProcessor lets crumble (1 in 20) */
  rottable: Set<number>;
  /** block id → [chance, output state]: the RuleProcessor's RandomBlockMatchTest rules */
  rules: Record<CityProcessors, Map<number, [number, number]>>;
  /** block ids: vanilla #features_cannot_replace, which ProtectedBlockProcessor leaves standing */
  protect: Set<number>;
}

let TABLES: ProcessorTables | null = null;

function tables(): ProcessorTables {
  if (TABLES) return TABLES;
  const id = (n: string) => BLOCK_BY_NAME.get(n)?.id ?? -1;
  const ids = (names: string[]) => new Set(names.map(id).filter((i) => i >= 0));
  const base: [string, number, string][] = [
    ['deepslate_bricks', 0.3, 'cracked_deepslate_bricks'],
    ['deepslate_tiles', 0.3, 'cracked_deepslate_tiles'],
    ['soul_lantern', 0.05, 'air'],
  ];
  const walls: [string, number, string][] = [base[0], base[1], ['deepslate_tile_slab', 0.3, 'air'], base[2]];
  const rules = (list: [string, number, string][]) => new Map(list.map(([i, c, o]) => [id(i), [c, o === 'air' ? 0 : parseState(o)] as [number, number]]));
  TABLES = {
    rottable: ids([
      'deepslate', 'deepslate_bricks', 'deepslate_tiles', 'deepslate_brick_slab', 'deepslate_tile_slab', 'deepslate_brick_stairs', 'deepslate_tile_wall',
      'deepslate_brick_wall', 'cobbled_deepslate', 'cracked_deepslate_bricks', 'cracked_deepslate_tiles', 'gray_wool',
    ]),
    rules: { start: rules(base), generic: rules(base), walls: rules(walls) },
    protect: ids(['bedrock', 'spawner', 'chest', 'end_portal_frame', 'reinforced_deepslate', 'trial_spawner', 'vault']),
  };
  return TABLES;
}

/** 64-bit arithmetic on four 16-bit limbs, least significant first (mod 2^64) */
function mul64(a: number[], b: number[]): number[] {
  const r = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    let carry = 0;
    for (let j = 0; i + j < 4; j++) {
      const t = a[i] * b[j] + r[i + j] + carry;
      r[i + j] = t % 65536;
      carry = Math.floor(t / 65536);
    }
  }
  return r;
}

function limbs(hi: number, lo: number): number[] {
  return [lo & 0xffff, lo >>> 16, hi & 0xffff, hi >>> 16];
}

const M_42317861 = limbs(0, 42317861), M_11 = limbs(0, 11);

/**
 * vanilla RandomSource.create(Mth.getSeed(pos)).nextFloat(): the first float a template's processors draw at a
 * position (BlockRotProcessor and RuleProcessor each start their own from the same seed)
 */
export function positionFloat(x: number, y: number, z: number): number {
  // (long)(x * 3129871) ^ (long)z * 116129781L ^ (long)y
  const a = Math.imul(x, 3129871);
  const b = z * 116129781;
  const bHi = Math.floor(b / 4294967296), bLo = b - bHi * 4294967296;
  const lo = ((a >>> 0) ^ bLo ^ (y >>> 0)) >>> 0;
  const hi = ((a < 0 ? 0xffffffff : 0) ^ (bHi >>> 0) ^ (y < 0 ? 0xffffffff : 0)) >>> 0;
  const i = limbs(hi, lo);
  // i * i * 42317861 + i * 11, of which the seed is >> 16
  const t = mul64(mul64(i, i), M_42317861), u = mul64(i, M_11);
  const s = [0, 0, 0, 0];
  let c = 0;
  for (let k = 0; k < 4; k++) {
    const v = t[k] + u[k] + c;
    s[k] = v % 65536;
    c = Math.floor(v / 65536);
  }
  // LegacyRandomSource: (seed ^ 0x5DEECE66D) mod 2^48, one step of the LCG, the top 24 bits
  const s0 = s[1] ^ 0xe66d, s1 = s[2] ^ 0xdeec, s2 = s[3] ^ 0x0005;
  let r0 = s0 * 0xe66d + 0xb;
  let carry = Math.floor(r0 / 65536);
  r0 %= 65536;
  let r1 = s0 * 0xdeec + s1 * 0xe66d + carry;
  carry = Math.floor(r1 / 65536);
  r1 %= 65536;
  const r2 = (s0 * 0x0005 + s1 * 0xdeec + s2 * 0xe66d + carry) % 65536;
  return (r2 * 256 + (r1 >>> 8)) / 16777216;
}

/** blocks whose shape depends on their neighbours: fixed up once the chunks round them are there */
const SHAPED = /(_fence|_pane|_wall|_stairs|_fence_gate|^iron_bars|^chest)$/;
/** blocks a generated chunk lists a block entity for */
const WITH_BLOCK_ENTITY = /^(chest|barrel|sculk_sensor|calibrated_sculk_sensor|sculk_shrieker|sculk_catalyst|(soul_)?campfire|(skeleton|wither_skeleton)_(wall_)?skull)$/;

// ---------------------------------------------------------------------------------------------------------------
// Pool elements

/** vanilla StructureTemplate.transform about the origin: x and z of a template position turned `rot` quarter turns */
function rotXZ(x: number, z: number, rot: number): [number, number] {
  return rot === 1 ? [-z, x] : rot === 2 ? [-x, -z] : rot === 3 ? [z, -x] : [x, z];
}

/** the template position at a world offset from the piece (the inverse of rotXZ) */
function unrotXZ(dx: number, dz: number, rot: number): [number, number] {
  return rot === 1 ? [dz, -dx] : rot === 2 ? [-dx, -dz] : rot === 3 ? [-dz, dx] : [dx, dz];
}

/** what grows the sculk pieces' patches: their city (world/gen/ancientCity.ts) */
export interface SculkSource {
  /** the blocks the sculk piece at `index` grows, by packed position (see posKey) */
  sculk(index: number): Map<number, number>;
}

/** what an ancient city piece is placed with: the city it's part of and its place in it, for the sculk pieces */
export interface CityPlaceCtx extends PlaceCtx {
  city: SculkSource;
  index: number;
}

/** vanilla SinglePoolElement with one of the ancient city's processor lists (air is placed, structure void isn't) */
export class CityElement extends PoolElement {
  constructor(readonly template: CityTemplate, readonly processors: CityProcessors) {
    super('rigid');
  }

  jigsaws(x: number, y: number, z: number, rot: number): PlacedJigsaw[] {
    return this.template.jigsaws.map((j) => {
      const [dx, dz] = rotXZ(j.x, j.z, rot);
      return { x: x + dx, y: y + j.y, z: z + dz, front: rotDir(j.front, rot), top: rotDir(j.top, rot), info: j };
    });
  }

  box(x: number, y: number, z: number, rot: number): Box {
    const t = this.template;
    const [ax, az] = rotXZ(t.sx - 1, t.sz - 1, rot);
    return new Box(x + Math.min(0, ax), y, z + Math.min(0, az), x + Math.max(0, ax), y + t.sy - 1, z + Math.max(0, az));
  }

  /**
   * what this piece puts at a world position, its processors applied (VOID: nothing, it's structure void or it
   * crumbled away; the protected blocks it would go over aren't looked at)
   */
  stateAt(p: Piece, x: number, y: number, z: number): number {
    const t = this.template;
    const [tx, tz] = unrotXZ(x - p.x, z - p.z, p.rot);
    const ty = y - p.y;
    if (tx < 0 || ty < 0 || tz < 0 || tx >= t.sx || ty >= t.sy || tz >= t.sz) return VOID;
    const cell = t.at(tx, ty, tz);
    if (cell === VOID || cell === 0) return cell;
    const st = this.process(cell, x, y, z);
    return st < 0 ? VOID : st === 0 ? 0 : rotateState(st, p.rot);
  }

  /** the processors on one block (-1: it crumbled away) */
  private process(st: number, x: number, y: number, z: number): number {
    const T = tables();
    const id = STATE_BLOCK[st];
    let f = -1;
    // vanilla BlockRotProcessor(#ancient_city_replaceable, 0.95)
    if (this.processors !== 'start' && T.rottable.has(id)) {
      f = positionFloat(x, y, z);
      if (!(f <= 0.95)) return -1;
    }
    // vanilla RuleProcessor: RandomBlockMatchTest(block, chance) → output
    const rule = T.rules[this.processors].get(id);
    if (rule) {
      if (f < 0) f = positionFloat(x, y, z);
      if (f < rule[0]) return rule[1];
    }
    return st;
  }

  place(pc: PlaceCtx, piece: Piece): void {
    const { ctx, chunk } = pc;
    const b = piece.box, t = this.template, rot = piece.rot;
    const x0 = Math.max(b.minX, chunk.minX), x1 = Math.min(b.maxX, chunk.maxX), z0 = Math.max(b.minZ, chunk.minZ), z1 = Math.min(b.maxZ, chunk.maxZ);
    if (x0 > x1 || z0 > z1) return;
    const T = tables();
    const y0 = Math.max(b.minY, MIN_Y), y1 = Math.min(b.maxY, MAX_Y - 1);
    for (let wy = y0; wy <= y1; wy++) {
      const ty = wy - piece.y;
      for (let wz = z0; wz <= z1; wz++)
        for (let wx = x0; wx <= x1; wx++) {
          const [tx, tz] = unrotXZ(wx - piece.x, wz - piece.z, rot);
          const cell = t.at(tx, ty, tz);
          if (cell === VOID) continue;
          let st = cell === 0 ? 0 : this.process(cell, wx, wy, wz);
          if (st < 0) continue;
          const current = ctx.getOrAir(wx, wy, wz);
          // vanilla ProtectedBlockProcessor(#features_cannot_replace)
          if (T.protect.has(STATE_BLOCK[current])) continue;
          if (st === 0) {
            ctx.set(wx, wy, wz, 0);
            continue;
          }
          st = rotateState(st, rot);
          const block = BLOCKS[STATE_BLOCK[st]];
          // vanilla LiquidSettings.APPLY_WATERLOGGING: what goes into still water takes some in
          if (FLAGS[current] & F_WATER && !(FLAGS[current] & F_WATERLOGGED) && block.propIndex('waterlogged') >= 0) {
            const cb = BLOCKS[STATE_BLOCK[current]];
            if (cb.name === 'water' && cb.get(current, 'level') === 0) st = block.with(st, 'waterlogged', true);
          }
          ctx.set(wx, wy, wz, st);
          if (FLAGS[st] & F_WATER && block.name === 'water') ctx.scheduleFluid(wx, wy, wz);
          if (SHAPED.test(block.name)) ctx.markForPostprocessing(wx, wy, wz);
          if (WITH_BLOCK_ENTITY.test(block.name)) {
            const loot = block.name === 'chest' || block.name === 'barrel' ? t.loot.find((l) => l.x === tx && l.y === ty && l.z === tz) : undefined;
            const data = loot ? { lootTable: loot.table, lootSeed: hash3(wx, wy, wz, pc.salt ^ 0x10075eed) >>> 0 } : undefined;
            ctx.blockEntities.push({ id: block.name, x: wx, y: wy, z: wz, items: [], ...(data ? { data } : {}) });
          }
        }
    }
  }
}

/** vanilla ListPoolElement: several templates placed together, joined by the first one's connectors */
export class CityListElement extends PoolElement {
  constructor(readonly elements: CityElement[]) {
    super('rigid');
  }
  jigsaws(x: number, y: number, z: number, rot: number): PlacedJigsaw[] {
    return this.elements[0].jigsaws(x, y, z, rot);
  }
  box(x: number, y: number, z: number, rot: number): Box {
    const boxes = this.elements.map((e) => e.box(x, y, z, rot));
    return new Box(
      Math.min(...boxes.map((b) => b.minX)), Math.min(...boxes.map((b) => b.minY)), Math.min(...boxes.map((b) => b.minZ)),
      Math.max(...boxes.map((b) => b.maxX)), Math.max(...boxes.map((b) => b.maxY)), Math.max(...boxes.map((b) => b.maxZ)),
    );
  }
  stateAt(p: Piece, x: number, y: number, z: number): number {
    let out = VOID;
    for (const e of this.elements) {
      const st = e.stateAt(p, x, y, z);
      if (st !== VOID) out = st;
    }
    return out;
  }
  place(pc: PlaceCtx, piece: Piece): void {
    for (const e of this.elements) e.place(pc, piece);
  }
}

/**
 * vanilla FeaturePoolElement with sculk_patch_ancient_city: grown where its one downward connector lands. The patch
 * is grown once for the whole city, on the city's blocks as they stand when this piece's turn comes (the rock round
 * the city counts as solid), and each chunk takes the part of it that falls in it.
 */
export class CitySculkElement extends PoolElement {
  private static readonly JIGSAW: Jigsaw = { x: 0, y: 0, z: 0, front: 'down', top: 'south', name: 'minecraft:bottom', target: 'minecraft:empty', pool: 'empty', rollable: true };
  constructor() {
    super('rigid');
  }
  jigsaws(x: number, y: number, z: number): PlacedJigsaw[] {
    return [{ x, y, z, front: 'down', top: 'south', info: CitySculkElement.JIGSAW }];
  }
  box(x: number, y: number, z: number): Box {
    return new Box(x, y, z, x, y, z);
  }
  place(pc: PlaceCtx, piece: Piece): void {
    const { city, index } = pc as CityPlaceCtx;
    if (!city) return;
    const grown = city.sculk(index);
    const { ctx, chunk } = pc;
    for (const [k, st] of grown) {
      const [x, y, z] = posUnkey(k, piece);
      if (x < chunk.minX || x > chunk.maxX || z < chunk.minZ || z > chunk.maxZ) continue;
      ctx.set(x, y, z, st);
      const name = BLOCKS[STATE_BLOCK[st]].name;
      if (SCULK_BLOCK_ENTITIES.has(name)) ctx.blockEntities.push({ id: name, x, y, z, items: [] });
    }
  }
}

/**
 * the chunk's listed block entities of the kinds a city places: one each, and only where the block still stands (a
 * piece placed later may have built over one)
 */
export function tidyCityBlockEntities(ctx: GenContext): void {
  const seen = new Set<string>();
  const list = ctx.blockEntities;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (!WITH_BLOCK_ENTITY.test(e.id)) continue;
    const key = `${e.x},${e.y},${e.z}`;
    const st = ctx.get(e.x, e.y, e.z);
    if (seen.has(key) || st < 0 || BLOCKS[STATE_BLOCK[st]].name !== e.id) list.splice(i, 1);
    else seen.add(key);
  }
}

/** a position near a piece packed small (within 512 blocks of it) */
export function posKey(x: number, y: number, z: number, p: Piece): number {
  return ((y - MIN_Y) * 1024 + (z - p.z + 512)) * 1024 + (x - p.x + 512);
}
export function posUnkey(k: number, p: Piece): [number, number, number] {
  const x = (k % 1024) - 512 + p.x;
  const z = (Math.floor(k / 1024) % 1024) - 512 + p.z;
  const y = Math.floor(k / 1048576) + MIN_Y;
  return [x, y, z];
}
