// Structure templates built in code (Stage 5: ocean; vanilla StructureTemplate, StructurePlaceSettings and
// TemplateStructurePiece): a box of blocks and data markers, placed at a position turned a number of quarter turns
// about a pivot, chunk by chunk. Air is never part of one (vanilla BlockIgnoreProcessor.STRUCTURE_AND_AIR drops it
// and the structure blocks, so what was there stays). As they're placed, a template's blocks can rot away
// (BlockRotProcessor: each kept with the chance of its integrity, drawn from its own position), take in the water
// they're put into (LiquidSettings.APPLY_WATERLOGGING), and a few of one block can become another carrying a loot
// table (CappedProcessor round a RuleProcessor with AppendLoot: the suspicious sand and gravel of the ocean ruins).
// Then each data marker in the chunk is handed to the piece. The shipwrecks (shipwreck.ts) and the ocean ruins
// (oceanRuins.ts) are made of these; no game files are used.

import type { Rand } from '../../core/rng';
import { blockOf, FLAGS, F_WATER, F_FULL_COLLISION } from '../block';
import type { GenContext } from './context';
import { BoundingBox, PieceList, StructurePiece } from './structure';
import { parseState, rotateState } from './jigsaw';
import { LegacyRandom } from './legacyRandom';
import { positionalRandom } from './templePiece';

export interface TemplateMarker {
  x: number;
  y: number;
  z: number;
  /** vanilla the structure block's metadata */
  name: string;
}

/** a finished template: its size, its blocks (packed x, y, z, state) in vanilla's order, and its data markers */
export class BlockTemplate {
  constructor(
    readonly name: string,
    readonly sx: number,
    readonly sy: number,
    readonly sz: number,
    readonly blocks: Int32Array,
    readonly markers: readonly TemplateMarker[],
  ) {}

  /** the state at a template position (0: nothing there) */
  stateAt(x: number, y: number, z: number): number {
    const b = this.blocks;
    for (let i = 0; i < b.length; i += 4) if (b[i] === x && b[i + 1] === y && b[i + 2] === z) return b[i + 3];
    return 0;
  }
}

/** a template put together cell by cell (a cell left empty is air: nothing is placed there) */
export class TemplateBuilder {
  private readonly cells = new Map<number, number>();
  private readonly marks = new Map<number, string>();

  constructor(readonly sx: number, readonly sy: number, readonly sz: number) {}

  private key(x: number, y: number, z: number): number {
    return (y * this.sz + z) * this.sx + x;
  }

  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  /** a block (a state, or a state written out, e.g. "oak_stairs[facing=east]"); null or 0 empties the cell */
  set(x: number, y: number, z: number, st: number | string | null): this {
    if (!this.inside(x, y, z)) return this;
    const s = typeof st === 'string' ? parseState(st) : (st ?? 0);
    if (s > 0) this.cells.set(this.key(x, y, z), s);
    else this.cells.delete(this.key(x, y, z));
    return this;
  }

  get(x: number, y: number, z: number): number {
    return this.inside(x, y, z) ? (this.cells.get(this.key(x, y, z)) ?? 0) : 0;
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, st: number | string | null): this {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, st);
    return this;
  }

  /** a data marker (vanilla a structure block in DATA mode) */
  marker(x: number, y: number, z: number, name: string): this {
    if (this.inside(x, y, z)) this.marks.set(this.key(x, y, z), name);
    return this;
  }

  markerAt(x: number, y: number, z: number): string | undefined {
    return this.marks.get(this.key(x, y, z));
  }

  /** every filled cell: x, y, z, state */
  forEach(f: (x: number, y: number, z: number, st: number) => void): void {
    for (const [k, st] of this.cells) {
      const x = k % this.sx, z = Math.floor(k / this.sx) % this.sz, y = Math.floor(k / (this.sx * this.sz));
      f(x, y, z, st);
    }
  }

  forEachMarker(f: (x: number, y: number, z: number, name: string) => void): void {
    for (const [k, name] of this.marks) {
      const x = k % this.sx, z = Math.floor(k / this.sx) % this.sz, y = Math.floor(k / (this.sx * this.sz));
      f(x, y, z, name);
    }
  }

  /**
   * vanilla StructureTemplate.buildInfoList: the full blocks, then the others, then those with block entities, each
   * sorted by y, then x, then z (the order the processors see them in)
   */
  build(name: string): BlockTemplate {
    const groups: number[][][] = [[], [], []];
    this.forEach((x, y, z, st) => {
      const g = blockOf(st).name === 'chest' ? 2 : FLAGS[st] & F_FULL_COLLISION ? 0 : 1;
      groups[g].push([x, y, z, st]);
    });
    const order = (a: number[], b: number[]) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2];
    const out: number[] = [];
    for (const g of groups) for (const c of g.sort(order)) out.push(...c);
    const markers: TemplateMarker[] = [];
    this.forEachMarker((x, y, z, n) => markers.push({ x, y, z, name: n }));
    markers.sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);
    return new BlockTemplate(name, this.sx, this.sy, this.sz, Int32Array.from(out), markers);
  }
}

/** vanilla StructureTemplate.transform(pos, NONE, rotation, pivot): a template position turned about the pivot */
export function turnAbout(x: number, z: number, rot: number, px: number, pz: number): [number, number] {
  switch (rot & 3) {
    case 1: return [px + pz - z, pz - px + x];
    case 2: return [px + px - x, pz + pz - z];
    case 3: return [px - pz + z, px + pz - x];
    default: return [x, z];
  }
}

/** vanilla StructureTemplate.getBoundingBox: the box the turned template fills from `pos` */
export function templateBox(t: { sx: number; sy: number; sz: number }, x: number, y: number, z: number, rot: number, px: number, pz: number): BoundingBox {
  const [ax, az] = turnAbout(0, 0, rot, px, pz), [bx, bz] = turnAbout(t.sx - 1, t.sz - 1, rot, px, pz);
  return new BoundingBox(x + Math.min(ax, bx), y, z + Math.min(az, bz), x + Math.max(ax, bx), y + t.sy - 1, z + Math.max(az, bz));
}

/** vanilla Mth.getSeed: a position's seed (what a template's per-block processors draw from) */
export function positionSeed(x: number, y: number, z: number): bigint {
  let l = BigInt(Math.imul(x, 3129871)) ^ (BigInt(z) * 116129781n) ^ BigInt(y);
  l = BigInt.asIntN(64, l);
  l = BigInt.asIntN(64, l * l * 42317861n + l * 11n);
  return l >> 16n;
}

export interface TemplateSettings {
  /** clockwise quarter turns (vanilla Rotation by ordinal) */
  rot: number;
  /** vanilla StructurePlaceSettings.rotationPivot (x, z) */
  pivot: [number, number];
  /** vanilla BlockRotProcessor: the chance each block is kept (1: all of them, no processor) */
  integrity: number;
  /** vanilla LiquidSettings: APPLY_WATERLOGGING (true) or IGNORE_WATERLOGGING */
  waterlog: boolean;
  /**
   * vanilla CappedProcessor(RuleProcessor(BlockMatchTest(from) → to, AppendLoot(lootTable)), cap): at most `cap` of the
   * `from` blocks become `to`, carrying the loot table and a seed drawn from their position
   */
  suspicious?: { from: string; to: string; lootTable: string; cap: number };
}

/** blocks whose shape depends on their neighbours: fixed up once the chunks round them are there */
const SHAPED = /(_stairs|_fence|_pane|_wall|^iron_bars)$/;

/** vanilla TemplateStructurePiece: a template at a position with its place settings */
export abstract class TemplatePiece extends StructurePiece {
  /** what's placed, once the processors have had it: template block index, state, the suspicious block's loot seed */
  private processed: { i: number; st: number; seed?: bigint }[] | null = null;
  private suspiciousState = -1;

  constructor(
    readonly template: BlockTemplate,
    public x: number,
    public y: number,
    public z: number,
    readonly settings: TemplateSettings,
    readonly worldSeed: bigint,
  ) {
    super(0, templateBox(template, x, y, z, settings.rot, settings.pivot[0], settings.pivot[1]));
  }

  addChildren(_start: StructurePiece, _pieces: PieceList, _r: Rand): void {}

  /** the template position moved to height `y` (and the box with it) */
  setY(y: number): void {
    this.box.move(0, y - this.y, 0);
    this.y = y;
    this.processed = null;
  }

  /** where a template position is in the world */
  pos(x: number, y: number, z: number): [number, number, number] {
    const [tx, tz] = turnAbout(x, z, this.settings.rot, this.settings.pivot[0], this.settings.pivot[1]);
    return [this.x + tx, this.y + y, this.z + tz];
  }

  /**
   * vanilla StructureTemplate.processBlockInfos over the whole template (every chunk works out the same): the blocks
   * that don't rot, then the capped processor's pick of them, from the positional random of the template's position
   */
  private process(): { i: number; st: number; seed?: bigint }[] {
    if (this.processed) return this.processed;
    const t = this.template, b = t.blocks, s = this.settings;
    const out: { i: number; st: number; seed?: bigint }[] = [];
    for (let i = 0; i < b.length; i += 4) {
      if (s.integrity < 1) {
        const [wx, wy, wz] = this.pos(b[i], b[i + 1], b[i + 2]);
        if (!(new LegacyRandom(positionSeed(wx, wy, wz)).nextFloat() <= s.integrity)) continue;
      }
      out.push({ i, st: b[i + 3] });
    }
    const sus = s.suspicious;
    if (sus && out.length) {
      const from = parseState(sus.from);
      this.suspiciousState = parseState(sus.to);
      const r = positionalRandom(this.worldSeed, this.x, this.y, this.z);
      const cap = Math.min(sus.cap, out.length);
      if (cap >= 1) {
        // vanilla Util.toShuffledList
        const idx = Array.from(out.keys());
        for (let j = idx.length; j > 1; j--) {
          const k = r.nextInt(j);
          [idx[j - 1], idx[k]] = [idx[k], idx[j - 1]];
        }
        let n = 0;
        for (const k of idx) {
          if (n >= cap) break;
          const e = out[k];
          if (e.st !== from) continue;
          const [wx, wy, wz] = this.pos(b[e.i], b[e.i + 1], b[e.i + 2]);
          e.st = this.suspiciousState;
          e.seed = new LegacyRandom(positionSeed(wx, wy, wz)).nextLong();
          n++;
        }
      }
    }
    this.processed = out;
    return out;
  }

  /**
   * vanilla TemplateStructurePiece.postProcess: the processed blocks in this chunk, turned (taking in the water they're
   * put into when the settings say so), their block entities, then the data markers in the chunk
   */
  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    const b = this.template.blocks, s = this.settings;
    const sus = s.suspicious;
    for (const e of this.process()) {
      const [wx, wy, wz] = this.pos(b[e.i], b[e.i + 1], b[e.i + 2]);
      if (!chunk.isInside(wx, wy, wz)) continue;
      let st = rotateState(e.st, s.rot);
      const blk = blockOf(st);
      if (s.waterlog && blk.propIndex('waterlogged') >= 0 && FLAGS[ctx.getOrAir(wx, wy, wz)] & F_WATER) st = blk.with(st, 'waterlogged', true);
      ctx.set(wx, wy, wz, st);
      if (SHAPED.test(blk.name)) ctx.markForPostprocessing(wx, wy, wz);
      if (blk.name === 'chest') ctx.blockEntities.push({ id: 'chest', x: wx, y: wy, z: wz, items: [] });
      else if (e.seed !== undefined && sus) ctx.blockEntities.push({ id: 'brushable_block', x: wx, y: wy, z: wz, items: [], data: { lootTable: sus.lootTable, lootSeed: e.seed.toString() } });
    }
    for (const m of this.template.markers) {
      const [wx, wy, wz] = this.pos(m.x, m.y, m.z);
      if (chunk.isInside(wx, wy, wz)) this.handleDataMarker(m.name, wx, wy, wz, ctx, r);
    }
  }

  /** vanilla handleDataMarker */
  protected abstract handleDataMarker(name: string, x: number, y: number, z: number, ctx: GenContext, r: Rand): void;
}
