// (trial chambers) What the trial chambers' pieces are made of: a grid a template is drawn on in code (every block
// named, air carved out, the rest left as it is), and the pool element that places one (vanilla SinglePoolElement,
// which unlike the legacy one places its air, so a piece hollows its rooms out of the stone round it). As it's
// placed, the trial chambers' processors run (vanilla ProcessorLists.TRIAL_CHAMBERS_COPPER_BULB_DEGRADATION: some of
// its waxed copper bulbs are left to age, lit, and nothing replaces #features_cannot_replace), what it's put into
// doesn't soak into it (vanilla LiquidSettings.IGNORE_WATERLOGGING), and its trial spawners, vaults, chests, barrels,
// dispensers and pots get their block entities: a spawner's configs, a vault's key and loot, a container's loot table.

import { JavaRandom, hash3 } from '../../core/rng';
import { BLOCK_BY_NAME, blockOf, FLAGS, F_WATER } from '../block';
import { MIN_Y, MAX_Y } from '../constants';
import { SingleElement, template, rotateState, parseState, type Dir6, type JigsawSpec, type PlaceCtx, type Piece, type Template } from './jigsaw';

// ---------------------------------------------------------------------------------------------------------------
// Vanilla's positional randoms

/** vanilla Mth.getSeed(x, y, z) */
export function mthSeed(x: number, y: number, z: number): bigint {
  let l = BigInt.asIntN(64, BigInt(Math.imul(x, 3129871)) ^ (BigInt(z) * 116129781n) ^ BigInt(y));
  l = BigInt.asIntN(64, l * l * 42317861n + l * 11n);
  return l >> 16n;
}

/** vanilla LegacyRandomSource(seed) */
export function legacyRandom(seed: bigint): JavaRandom {
  return new JavaRandom(Number(BigInt.asUintN(48, seed)));
}

/** vanilla LegacyRandomSource.nextLong */
export function nextLong(r: JavaRandom): bigint {
  const hi = BigInt(r.next(32)), lo = BigInt(r.next(32));
  return BigInt.asIntN(64, (hi << 32n) + lo);
}

// ---------------------------------------------------------------------------------------------------------------
// Templates drawn in code

/** a block entity a template carries: a trial spawner's configs, a vault's, or a container's loot table */
export interface TemplateBlockEntity {
  x: number;
  y: number;
  z: number;
  /** the block it belongs to (a processor or the world may have put another there: then there's none) */
  block: string;
  data: Record<string, number | string>;
  /** a loot table (rolled into it the first time it's opened, or broken) */
  table?: string;
}

/** a finished template and what the element needs besides its blocks */
export interface TrialTemplate {
  template: Template;
  /** packed x, y, z of every cell it carves out */
  airs: Int32Array;
  blockEntities: TemplateBlockEntity[];
}

const AIR = 'air';

/**
 * A template drawn in code: a box of cells, each a block ("tuff_bricks", "waxed_copper_bulb[lit=true]"), air to be
 * carved, or nothing (null: the world is left as it is: vanilla's structure void). x runs west to east, y up, z north
 * to south, as a template's own coordinates do.
 */
export class Grid {
  readonly cells: (string | null)[];
  readonly jigsaws: JigsawSpec[] = [];
  readonly blockEntities: TemplateBlockEntity[] = [];

  constructor(readonly sx: number, readonly sy: number, readonly sz: number, fill: string | null = null) {
    this.cells = new Array(sx * sy * sz).fill(fill);
  }

  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  private i(x: number, y: number, z: number): number {
    return (y * this.sz + z) * this.sx + x;
  }

  get(x: number, y: number, z: number): string | null {
    return this.inside(x, y, z) ? this.cells[this.i(x, y, z)] : null;
  }

  /** one cell (outside the box: nothing) */
  set(x: number, y: number, z: number, s: string | null): this {
    if (this.inside(x, y, z)) this.cells[this.i(x, y, z)] = s;
    return this;
  }

  /** every cell of a box (corners inclusive, in any order) */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, s: string | null | ((x: number, y: number, z: number) => string | null)): this {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, typeof s === 'function' ? s(x, y, z) : s);
    return this;
  }

  /** a box's cells that are something already (not nothing) */
  replace(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, from: (s: string) => boolean, to: string): this {
    return this.fill(x0, y0, z0, x1, y1, z1, (x, y, z) => {
      const c = this.get(x, y, z);
      return c !== null && from(c) ? to : c;
    });
  }

  /** a box's shell (walls, floor and ceiling) of one block, its inside carved out */
  room(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, wall: string | ((x: number, y: number, z: number) => string)): this {
    return this.fill(x0, y0, z0, x1, y1, z1, (x, y, z) => {
      const edge = x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1;
      return edge ? (typeof wall === 'function' ? wall(x, y, z) : wall) : AIR;
    });
  }

  /** a jigsaw connector in this cell (the cell keeps what's drawn there: its final state) */
  jig(x: number, y: number, z: number, facing: Dir6, o: Omit<JigsawSpec, 'at' | 'facing'> = {}): this {
    if (!this.inside(x, y, z)) throw new Error(`trial chambers: connector outside at ${x},${y},${z}`);
    this.jigsaws.push({ at: [x, y, z], facing, ...o });
    return this;
  }

  /** a block with a block entity: a container with a loot table, or data of its own */
  entity(x: number, y: number, z: number, state: string, data: Record<string, number | string> = {}, table?: string): this {
    this.set(x, y, z, state);
    this.blockEntities.push({ x, y, z, block: state.split('[')[0], data, table });
    return this;
  }

  /** the template, registered under this name */
  build(id: string): TrialTemplate {
    const key: Record<string, string> = {};
    const chars = new Map<string, string>();
    const airs: number[] = [];
    const layers: string[] = [];
    for (let y = 0; y < this.sy; y++) {
      const rows: string[] = [];
      for (let z = 0; z < this.sz; z++) {
        let row = '';
        for (let x = 0; x < this.sx; x++) {
          const c = this.cells[this.i(x, y, z)];
          if (c === null) {
            row += '.';
            continue;
          }
          if (c === AIR) airs.push(x, y, z);
          let ch = chars.get(c);
          if (!ch) {
            ch = String.fromCharCode(0x100 + chars.size);
            chars.set(c, ch);
            key[ch] = c;
          }
          row += ch;
        }
        rows.push(row);
      }
      layers.push(rows.join('|'));
    }
    const t = template(id, { key, layers, jigsaws: this.jigsaws });
    return { template: t, airs: Int32Array.from(airs), blockEntities: this.blockEntities };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Placing a piece

/** vanilla #features_cannot_replace: what a trial chambers piece never replaces */
const PROTECTED = new Set(
  ['bedrock', 'spawner', 'chest', 'end_portal_frame', 'reinforced_deepslate', 'trial_spawner', 'vault'].map((n) => BLOCK_BY_NAME.get(n)?.id ?? -1),
);
const isProtected = (st: number) => st > 0 && PROTECTED.has(blockOf(st).id);

/** blocks whose connections are fixed up once the chunks around are there (as jigsaw.ts marks them) */
const SHAPED = /(_fence|_pane|_wall|^iron_bars|^chest|^redstone_wire)$/;

/**
 * vanilla ProcessorLists.TRIAL_CHAMBERS_COPPER_BULB_DEGRADATION: each waxed copper bulb, by a random of its own
 * position, becomes a lit oxidized one a tenth of the time, else a weathered one a third of the time, else an exposed
 * one half the time: aging, as they're no longer waxed
 */
function degradeBulb(st: number, x: number, y: number, z: number): number {
  const r = legacyRandom(mthSeed(x, y, z));
  if (r.nextFloat() < 0.1) return BULBS.oxidized;
  if (r.nextFloat() < 0.33333334) return BULBS.weathered;
  if (r.nextFloat() < 0.5) return BULBS.exposed;
  return st;
}
const BULBS = {
  waxed: BLOCK_BY_NAME.get('waxed_copper_bulb')?.id ?? -1,
  get oxidized() {
    return parseState('oxidized_copper_bulb[lit=true]');
  },
  get weathered() {
    return parseState('weathered_copper_bulb[lit=true]');
  },
  get exposed() {
    return parseState('exposed_copper_bulb[lit=true]');
  },
};

/** vanilla StructureTemplate.transform(BlockPos) about the origin */
const turnX = (x: number, z: number, rot: number) => (rot === 1 ? -z : rot === 2 ? -x : rot === 3 ? z : x);
const turnZ = (x: number, z: number, rot: number) => (rot === 1 ? x : rot === 2 ? -z : rot === 3 ? -x : z);

/**
 * vanilla SinglePoolElement with the trial chambers' processors and LiquidSettings.IGNORE_WATERLOGGING: every block
 * of the template, air included (structure void aside), turned with the piece; nothing it places takes in water
 */
export class TrialElement extends SingleElement {
  constructor(readonly t: TrialTemplate) {
    super(t.template, 'rigid');
  }

  override place(pc: PlaceCtx, piece: Piece): void {
    const { ctx, chunk } = pc;
    const rot = piece.rot;
    const inChunk = (x: number, z: number) => x >= chunk.minX && x <= chunk.maxX && z >= chunk.minZ && z <= chunk.maxZ;
    // the air first, then the blocks (vanilla's order has the blocks after the air they're set in)
    const a = this.t.airs;
    for (let i = 0; i < a.length; i += 3) {
      const wx = piece.x + turnX(a[i], a[i + 2], rot), wz = piece.z + turnZ(a[i], a[i + 2], rot), wy = piece.y + a[i + 1];
      if (!inChunk(wx, wz) || wy < MIN_Y || wy >= MAX_Y || isProtected(ctx.getOrAir(wx, wy, wz))) continue;
      ctx.set(wx, wy, wz, 0);
    }
    const b = this.template.blocks;
    for (let i = 0; i < b.length; i += 4) {
      const wx = piece.x + turnX(b[i], b[i + 2], rot), wz = piece.z + turnZ(b[i], b[i + 2], rot), wy = piece.y + b[i + 1];
      if (!inChunk(wx, wz) || wy < MIN_Y || wy >= MAX_Y || isProtected(ctx.getOrAir(wx, wy, wz))) continue;
      let st = b[i + 3];
      if (blockOf(st).id === BULBS.waxed) st = degradeBulb(st, wx, wy, wz);
      st = rotateState(st, rot);
      ctx.set(wx, wy, wz, st);
      const name = blockOf(st).name;
      if (FLAGS[st] & F_WATER && name === 'water') ctx.scheduleFluid(wx, wy, wz);
      if (SHAPED.test(name)) ctx.markForPostprocessing(wx, wy, wz);
    }
    for (const e of this.t.blockEntities) {
      const wx = piece.x + turnX(e.x, e.z, rot), wz = piece.z + turnZ(e.x, e.z, rot), wy = piece.y + e.y;
      if (!inChunk(wx, wz) || blockOf(ctx.getOrAir(wx, wy, wz)).name !== e.block) continue;
      const data: Record<string, number | string> = { ...e.data };
      if (e.table) {
        data.lootTable = e.table;
        data.lootSeed = hash3(wx, wy, wz, pc.salt ^ 0x7a1c4e) >>> 0;
      }
      ctx.blockEntities.push({ id: e.block, x: wx, y: wy, z: wz, items: [], data });
    }
  }
}
