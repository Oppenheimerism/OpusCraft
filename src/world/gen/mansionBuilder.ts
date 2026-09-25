// The woodland mansion's templates (and the ruined portals') are authored in code (vanilla ships them as .nbt files,
// which can't be used): a builder fills a box block by block, box by box or a layer at a time from rows of characters,
// and marks the data markers vanilla's templates have (chests, mobs). What a template doesn't set is left as the
// world has it (vanilla structure void); air it sets clears the space.

import { parseState } from './jigsaw';

/** a data marker (vanilla's structure block in DATA mode): the piece handles it once its blocks are placed */
export interface Marker {
  x: number;
  y: number;
  z: number;
  name: string;
}

export interface MansionTemplate {
  readonly name: string;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  /** where the box starts in the piece's own coordinates (x, z): a template may reach a block behind its corner */
  readonly ox: number;
  readonly oz: number;
  /** x, y, z, state in the piece's coordinates; state 0 is air, which is placed too */
  readonly blocks: Int32Array;
  /** x, y, z, state of blocks that only go where there's air (e.g. floor under a landing's edge, which a wall may hold) */
  readonly soft: Int32Array;
  readonly markers: readonly Marker[];
}

/** a block: a state string ("dark_oak_stairs[facing=west]"), 'air', or 'void' (leave the world be) */
export type Blk = string;

const VOID = -1;

export class TemplateBuilder {
  private readonly cells: Int32Array;
  private readonly softCells = new Map<number, number>();
  private readonly markers: Marker[] = [];

  /** a sx × sy × sz template whose box starts at (ox, oz) of the piece's coordinates (which all calls use) */
  constructor(readonly name: string, readonly sx: number, readonly sy: number, readonly sz: number, readonly ox = 0, readonly oz = 0) {
    this.cells = new Int32Array(sx * sy * sz).fill(VOID);
  }

  private index(x: number, y: number, z: number): number {
    const i = x - this.ox, k = z - this.oz;
    if (i < 0 || y < 0 || k < 0 || i >= this.sx || y >= this.sy || k >= this.sz) throw new Error(`template ${this.name}: ${x}, ${y}, ${z} is outside`);
    return (y * this.sz + k) * this.sx + i;
  }

  private static state(b: Blk): number {
    return b === 'void' ? VOID : b === 'air' ? 0 : parseState(b);
  }

  set(x: number, y: number, z: number, b: Blk): this {
    this.cells[this.index(x, y, z)] = TemplateBuilder.state(b);
    return this;
  }

  /** the state set at a position (-1 for void) */
  get(x: number, y: number, z: number): number {
    return this.cells[this.index(x, y, z)];
  }

  /** whether the block set at a position is `b` */
  is(x: number, y: number, z: number, b: Blk): boolean {
    return this.get(x, y, z) === TemplateBuilder.state(b);
  }

  /** a box, corners in any order */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: Blk): this {
    const st = TemplateBuilder.state(b);
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.cells[this.index(x, y, z)] = st;
    return this;
  }

  /** a box's four sides (no top or bottom), corners in any order */
  ring(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: Blk): this {
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)], [az, bz] = [Math.min(z0, z1), Math.max(z0, z1)];
    this.fill(ax, y0, az, bx, y1, az, b).fill(ax, y0, bz, bx, y1, bz, b);
    return this.fill(ax, y0, az, ax, y1, bz, b).fill(bx, y0, az, bx, y1, bz, b);
  }

  /** a box of blocks that only go into air */
  soft(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, b: Blk): this {
    const st = TemplateBuilder.state(b);
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
          const i = this.index(x, y, z);
          this.cells[i] = VOID;
          this.softCells.set(i, st);
        }
    return this;
  }

  /**
   * a layer from rows of characters: rows run north to south (z) separated by '|', characters west to east (x),
   * from (x0, z0); a space leaves what's there, anything else is looked up in `key`
   */
  layer(y: number, rows: string, key: Record<string, Blk>, x0 = 0, z0 = 0): this {
    const lines = rows.split('|');
    for (let z = 0; z < lines.length; z++)
      for (let x = 0; x < lines[z].length; x++) {
        const ch = lines[z][x];
        if (ch === ' ') continue;
        const b = key[ch];
        if (b === undefined) throw new Error(`template ${this.name}: no block for '${ch}'`);
        this.set(x0 + x, y, z0 + z, b);
      }
    return this;
  }

  /** a data marker; its own block is left as the world has it (vanilla ignores the structure block) */
  marker(x: number, y: number, z: number, name: string): this {
    this.set(x, y, z, 'void');
    this.markers.push({ x, y, z, name });
    return this;
  }

  build(): MansionTemplate {
    const out: number[] = [], soft: number[] = [];
    for (let y = 0; y < this.sy; y++)
      for (let k = 0; k < this.sz; k++)
        for (let i = 0; i < this.sx; i++) {
          const idx = (y * this.sz + k) * this.sx + i;
          const st = this.cells[idx];
          if (st !== VOID) out.push(i + this.ox, y, k + this.oz, st);
          const s = this.softCells.get(idx);
          if (s !== undefined && st === VOID) soft.push(i + this.ox, y, k + this.oz, s);
        }
    return {
      name: this.name, sx: this.sx, sy: this.sy, sz: this.sz, ox: this.ox, oz: this.oz,
      blocks: Int32Array.from(out), soft: Int32Array.from(soft), markers: this.markers.slice(),
    };
  }
}
