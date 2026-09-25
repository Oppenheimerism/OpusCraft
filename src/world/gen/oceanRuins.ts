// Ocean ruins (Stage 5: ocean; vanilla OceanRuinStructure and OceanRuinPieces): the wreckage of old buildings on
// the sea floor. In warm seas they're sandstone over sand, in cold ones stone bricks over gravel, each cold ruin in
// three overlays (its plain bricks, its cracked ones and its mossy ones) placed one on another, the mossy ones
// rotting away fastest. Three in ten are large (a temple, a colonnade, a tower or a courtyard, with a chest and two
// drowned), and nine in ten of those have four to eight small ones round them (a hut, some pillars, an arch or a
// heap of rubble, half of them with a chest). Every block has its chance of having rotted away (0.9 kept for the
// large, 0.8 for the small, 0.7 and 0.5 for the cold ones' cracked and mossy overlays), up to five of the sand or
// gravel blocks are suspicious, to be brushed for the archaeology/ocean_ruin_* loot, and the blocks put into water
// are waterlogged. Each ruin settles to the sea floor under its corner, or drops to the lowest ground under it when
// most of it would hang over a drop. The ruins are made here, to vanilla's scale and style; no game files are used.

import { Rand, hash3, hashString, type JavaRandom } from '../../core/rng';
import { FLAGS, F_WATER, S } from '../block';
import { MIN_Y, SEA_LEVEL } from '../constants';
import type { GenContext } from './context';
import type { SavedEntity } from '../../entity/mob';
import { BoundingBox } from './structure';
import { parseState } from './jigsaw';
import { TemplateBuilder, TemplatePiece, turnAbout, type BlockTemplate } from './templates';

// ---------------------------------------------------------------------------------------------------------------
// The ruins, sketched in materials and then built in the stone of their sea

/** a ruin in materials: wall, cut, chisel, smooth, loose, magma, slab, slab_top, stairs_<facing>, stairs_top_<facing> */
class Sketch {
  readonly cells = new Map<number, string>();
  readonly marks: [number, number, number, string][] = [];
  readonly r: Rand;

  constructor(readonly sx: number, readonly sy: number, readonly sz: number, seed: string) {
    this.r = new Rand(hashString(seed), 0x0ce4);
  }

  private key(x: number, y: number, z: number): number {
    return (y * this.sz + z) * this.sx + x;
  }

  set(x: number, y: number, z: number, m: string | null): void {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return;
    if (m) this.cells.set(this.key(x, y, z), m);
    else this.cells.delete(this.key(x, y, z));
  }

  get(x: number, y: number, z: number): string | undefined {
    return this.cells.get(this.key(x, y, z));
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: string | null): void {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, m);
  }

  /** a data marker, with something under it to stand on */
  marker(x: number, y: number, z: number, name: string): void {
    this.set(x, y, z, null);
    if (y > 0 && !this.get(x, y - 1, z)) this.set(x, y - 1, z, 'wall');
    this.marks.push([x, y, z, name]);
  }

  /** a floor block: mostly plain, some loose, some cut or smooth */
  floor(): string {
    const k = this.r.nextFloat();
    return k < 0.25 ? 'loose' : k < 0.4 ? 'smooth' : k < 0.55 ? 'cut' : 'wall';
  }

  pick(options: string[]): string {
    return options[this.r.nextInt(options.length)];
  }

  forEach(f: (x: number, y: number, z: number, m: string) => void): void {
    for (const [k, m] of this.cells) f(k % this.sx, Math.floor(k / (this.sx * this.sz)), Math.floor(k / this.sx) % this.sz, m);
  }
}

// the small ruins (6 x 5 x 7)

/** a corner of a hut: its floor, a north wall with a gap and a west wall, a corner post */
function hut(s: Sketch, chest: boolean): void {
  const r = s.r;
  for (let z = 0; z < 7; z++)
    for (let x = 0; x < 6; x++) {
      if ((x === 0 || x === 5) && (z === 0 || z === 6) && r.nextFloat() < 0.6) continue;
      s.set(x, 0, z, s.floor());
    }
  const gap = 1 + r.nextInt(4);
  for (let x = 0; x < 6; x++) {
    if (x === gap) continue;
    const h = 2 + r.nextInt(2);
    for (let y = 1; y <= h; y++) s.set(x, y, 0, 'wall');
    if (r.nextFloat() < 0.4) s.set(x, h + 1, 0, 'slab');
  }
  for (let z = 1; z < 7; z++) {
    const h = 1 + r.nextInt(2) - (z > 4 ? 1 : 0);
    for (let y = 1; y <= h; y++) s.set(0, y, z, 'wall');
  }
  for (let z = 1; z < 4; z++) s.set(5, 1, z, 'cut');
  s.set(0, 1, 0, 'chisel');
  s.fill(0, 2, 0, 0, 3, 0, 'cut');
  s.set(0, 4, 0, 'slab');
  if (chest) s.marker(4, 1, 5, 'chest');
}

/** four pillars on a floor, the front pair perhaps still spanned by a lintel */
function pillars(s: Sketch, chest: boolean): void {
  const r = s.r;
  for (let z = 0; z < 7; z++)
    for (let x = 0; x < 6; x++) {
      const rim = x === 0 || x === 5 || z === 0 || z === 6;
      if (r.nextFloat() < (rim ? 0.15 : 0.35)) continue;
      s.set(x, 0, z, rim ? (r.nextFloat() < 0.5 ? 'cut' : 'wall') : s.floor());
    }
  const hs: number[] = [];
  for (const [x, z] of [[1, 1], [4, 1], [1, 5], [4, 5]]) {
    const h = 1 + r.nextInt(3);
    hs.push(h);
    s.set(x, 0, z, 'wall');
    s.set(x, 1, z, 'chisel');
    for (let y = 2; y <= h; y++) s.set(x, y, z, 'cut');
    if (r.nextFloat() < 0.5) s.set(x, h + 1, z, 'slab');
  }
  if (hs[0] === 3 && hs[1] === 3) {
    s.fill(1, 4, 1, 4, 4, 1, 'slab');
    s.fill(2, 3, 1, 3, 3, 1, null);
  }
  if (chest) s.marker(2, 1, 3, 'chest');
}

/** an arch over a paved way, sprung from two pillars on upside-down stairs, half fallen perhaps */
function arch(s: Sketch, chest: boolean): void {
  const r = s.r;
  for (let z = 0; z < 7; z++)
    for (let x = 0; x < 6; x++) {
      const path = z >= 2 && z <= 4;
      if (!path && r.nextFloat() < 0.5) continue;
      s.set(x, 0, z, path ? (r.nextFloat() < 0.2 ? 'loose' : 'wall') : 'loose');
    }
  for (const x of [0, 5]) for (let y = 1; y <= 3; y++) s.set(x, y, 3, y === 1 ? 'chisel' : 'cut');
  s.set(1, 3, 3, 'stairs_top_west');
  s.set(4, 3, 3, 'stairs_top_east');
  for (let x = 0; x < 6; x++) s.set(x, 4, 3, x === 0 || x === 5 ? 'wall' : 'slab');
  if (r.nextFloat() < 0.5) {
    s.fill(4, 4, 3, 5, 4, 3, null);
    s.set(3, 1, 5, 'slab');
    s.set(4, 1, 1, 'wall');
  }
  if (chest) s.marker(2, 1, 5, 'chest');
}

/** a heap of rubble round the stump of a wall */
function rubble(s: Sketch, chest: boolean): void {
  const r = s.r;
  for (let z = 0; z < 7; z++) for (let x = 0; x < 6; x++) if (r.nextFloat() < 0.65) s.set(x, 0, z, s.floor());
  for (let x = 1; x <= 4; x++) {
    s.set(x, 0, 2, 'wall');
    s.set(x, 1, 2, 'wall');
    if (r.nextFloat() < 0.6) s.set(x, 2, 2, 'wall');
  }
  for (let z = 0; z < 7; z++)
    for (let x = 0; x < 6; x++)
      if (s.get(x, 0, z) && !s.get(x, 1, z) && r.nextFloat() < 0.22) s.set(x, 1, z, s.pick(['wall', 'cut', 'stairs_south', 'stairs_east', 'slab']));
  if (chest) s.marker(4, 1, 5, 'chest');
}

// the large ruins (16 x 9 x 16)

/** a temple: a platform, a raised floor walled round with a north door and windows, a tower at each corner */
function temple(s: Sketch): void {
  const r = s.r;
  for (let z = 0; z < 16; z++)
    for (let x = 0; x < 16; x++) {
      const edge = Math.min(x, z, 15 - x, 15 - z);
      if (edge === 0 && r.nextFloat() < 0.45) continue;
      s.set(x, 0, z, edge <= 1 ? s.floor() : r.nextFloat() < 0.2 ? 'loose' : 'wall');
    }
  s.fill(3, 1, 3, 12, 1, 12, 'smooth');
  for (let x = 6; x <= 9; x++) s.set(x, 1, 2, 'stairs_south');
  for (let z = 3; z <= 12; z++)
    for (let x = 3; x <= 12; x++) {
      if (x !== 3 && x !== 12 && z !== 3 && z !== 12) continue;
      const h = r.nextFloat() < 0.3 ? 2 + r.nextInt(2) : 4;
      for (let y = 2; y <= h; y++) {
        if (z === 3 && (x === 7 || x === 8) && y <= 3) continue;
        if (y === 3 && (x + z) % 3 === 0 && x !== z && x + z !== 15) continue;
        s.set(x, y, z, 'wall');
      }
    }
  for (const [cx, cz] of [[0, 0], [14, 0], [0, 14], [14, 14]]) {
    const h = 5 + r.nextInt(3);
    for (let dz = 0; dz < 2; dz++)
      for (let dx = 0; dx < 2; dx++) {
        s.set(cx + dx, 0, cz + dz, 'wall');
        for (let y = 1; y <= h; y++) s.set(cx + dx, y, cz + dz, y === 1 ? 'chisel' : 'cut');
      }
    if (h === 7) s.fill(cx, 8, cz, cx + 1, 8, cz + 1, 'slab');
  }
  s.marker(7, 2, 10, 'chest');
  s.marker(5, 2, 5, 'drowned');
  s.marker(10, 2, 8, 'drowned');
}

/** a colonnade: two rows of columns (some fallen) beamed where they still stand, round a dais */
function colonnade(s: Sketch): void {
  const r = s.r;
  for (let z = 0; z < 16; z++)
    for (let x = 1; x < 15; x++) if (!(Math.min(x - 1, z, 14 - x, 15 - z) === 0 && r.nextFloat() < 0.4)) s.set(x, 0, z, s.floor());
  s.fill(5, 1, 9, 10, 1, 14, 'smooth');
  s.fill(6, 2, 10, 9, 2, 13, 'cut');
  for (let x = 5; x <= 10; x++) s.set(x, 1, 8, 'stairs_south');
  for (const x of [2, 13]) {
    let prev = -1;
    for (const z of [1, 4, 7, 10, 13]) {
      const broken = r.nextFloat() < 0.35;
      const h = broken ? 1 + r.nextInt(4) : 6;
      s.set(x, 1, z, 'chisel');
      for (let y = 2; y <= h; y++) s.set(x, y, z, 'cut');
      if (broken) {
        if (r.nextFloat() < 0.6) s.set(x + (x === 2 ? 1 : -1), 1, z + 1, s.pick(['cut', 'slab', 'wall']));
        prev = -1;
        continue;
      }
      if (prev >= 0) s.fill(x, 7, prev, x, 7, z, 'wall');
      else s.set(x, 7, z, 'slab');
      prev = z;
    }
  }
  s.set(4, 0, 2, 'magma');
  s.set(11, 0, 6, 'magma');
  s.marker(7, 3, 12, 'chest');
  s.marker(5, 1, 4, 'drowned');
  s.marker(10, 1, 5, 'drowned');
}

/** a tower fallen on its east side, its stones strewn beyond it */
function tower(s: Sketch): void {
  const r = s.r;
  for (let z = 0; z < 16; z++)
    for (let x = 0; x < 16; x++) {
      if (x >= 4 && x <= 11 && z >= 4 && z <= 11) s.set(x, 0, z, 'smooth');
      else if (r.nextFloat() < 0.4) s.set(x, 0, z, s.floor());
    }
  for (let z = 4; z <= 11; z++)
    for (let x = 4; x <= 11; x++) {
      if (x !== 4 && x !== 11 && z !== 4 && z !== 11) continue;
      const top = x >= 8 ? 7 - r.nextInt(5) : 8;
      for (let y = 1; y <= top; y++) {
        if (z === 4 && (x === 7 || x === 8) && y <= 2) continue;
        const across = (x === 4 || x === 11) && (z === 7 || z === 8), along = (z === 4 || z === 11) && (x === 7 || x === 8);
        if (y === 5 && (across || along)) continue;
        s.set(x, y, z, (x === 4 || x === 11) && (z === 4 || z === 11) ? 'cut' : 'wall');
      }
    }
  for (let i = 0; i < 14; i++) {
    const x = 12 + r.nextInt(4), z = r.nextInt(16);
    if (!s.get(x, 0, z)) s.set(x, 0, z, 'wall');
    s.set(x, 1, z, s.pick(['wall', 'cut', 'slab', 'stairs_west', 'loose']));
  }
  s.marker(6, 1, 9, 'chest');
  s.marker(8, 1, 7, 'drowned');
  s.marker(2, 1, 12, 'drowned');
}

/** a courtyard: low outer walls, fallen in places, a fountain of slabs round a magma heart, four columns */
function courtyard(s: Sketch): void {
  const r = s.r;
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) if (r.nextFloat() < 0.85) s.set(x, 0, z, r.nextFloat() < 0.4 ? 'loose' : 'wall');
  for (let z = 0; z < 16; z++)
    for (let x = 0; x < 16; x++) {
      if (x !== 0 && x !== 15 && z !== 0 && z !== 15) continue;
      const h = r.nextFloat() < 0.2 ? 0 : 1 + r.nextInt(4);
      s.set(x, 0, z, 'wall');
      for (let y = 1; y <= h; y++) s.set(x, y, z, y === h && r.nextFloat() < 0.3 ? 'slab' : 'wall');
    }
  s.fill(6, 0, 6, 9, 0, 9, 'cut');
  for (let z = 6; z <= 9; z++) for (let x = 6; x <= 9; x++) if (x === 6 || x === 9 || z === 6 || z === 9) s.set(x, 1, z, 'slab');
  s.set(7, 0, 7, 'magma');
  s.set(8, 0, 8, 'magma');
  for (const [x, z] of [[4, 4], [11, 4], [4, 11], [11, 11]]) {
    const h = 2 + r.nextInt(4);
    s.set(x, 1, z, 'chisel');
    for (let y = 2; y <= h; y++) s.set(x, y, z, 'cut');
  }
  s.marker(12, 1, 12, 'chest');
  s.marker(4, 1, 8, 'drowned');
  s.marker(11, 1, 7, 'drowned');
}

const SMALL_SHAPES = [hut, pillars, arch, rubble];
const BIG_SHAPES = [temple, colonnade, tower, courtyard];
/** which of the eight small ruins have a chest */
const SMALL_CHESTS = [true, false, true, false, false, true, false, true];

/** the stone of a warm ruin, and (the brick overlay's) of a cold one */
const WARM: Record<string, string> = {
  wall: 'sandstone', cut: 'cut_sandstone', chisel: 'chiseled_sandstone', smooth: 'smooth_sandstone', loose: 'sand', magma: 'magma_block',
  slab: 'sandstone_slab[type=bottom]', slab_top: 'sandstone_slab[type=top]', stairs: 'sandstone_stairs',
};
const COLD: Record<string, string> = {
  wall: 'stone_bricks', cut: 'stone_bricks', chisel: 'chiseled_stone_bricks', smooth: 'stone_bricks', loose: 'gravel', magma: 'magma_block',
  slab: 'stone_brick_slab[type=bottom]', slab_top: 'stone_brick_slab[type=top]', stairs: 'stone_brick_stairs',
};

/** a material's block in a palette (stairs: 'stairs_<facing>' sits on the ground, 'stairs_top_<facing>' hangs) */
function blockFor(m: string, pal: Record<string, string>): string {
  const st = /^stairs_(top_)?(north|south|east|west)$/.exec(m);
  if (st) return `${pal.stairs}[facing=${st[2]},half=${st[1] ? 'top' : 'bottom'}]`;
  return pal[m];
}

/** the cracked and mossy versions of a cold ruin's block (null: it has none, so it stays with the plain bricks) */
function overlayBlock(block: string, overlay: 'cracked' | 'mossy'): string | null {
  if (block === 'stone_bricks') return `${overlay}_stone_bricks`;
  if (overlay === 'mossy' && block.startsWith('stone_brick_')) return 'mossy_' + block;
  return null;
}

const TEMPLATES = new Map<string, BlockTemplate>();

/** vanilla OceanRuinPieces' templates: warm_1..8, big_warm_4..7, and each cold one's brick, cracked and mossy overlays */
function buildRuins(): void {
  const small = (seed: string, i: number) => {
    const s = new Sketch(6, 5, 7, seed);
    SMALL_SHAPES[i % 4](s, SMALL_CHESTS[i]);
    return s;
  };
  const big = (seed: string, i: number) => {
    const s = new Sketch(16, 9, 16, seed);
    BIG_SHAPES[i](s);
    return s;
  };
  const warm = (name: string, s: Sketch) => {
    const b = new TemplateBuilder(s.sx, s.sy, s.sz);
    s.forEach((x, y, z, m) => b.set(x, y, z, blockFor(m, WARM)));
    for (const [x, y, z, n] of s.marks) b.marker(x, y, z, n);
    TEMPLATES.set(`underwater_ruin/${name}`, b.build(`underwater_ruin/${name}`));
  };
  // (every block of a cold ruin is in one overlay: half plain, a quarter each cracked and mossy where it can be)
  const cold = (prefix: string, n: number, s: Sketch) => {
    const layers = { brick: new TemplateBuilder(s.sx, s.sy, s.sz), cracked: new TemplateBuilder(s.sx, s.sy, s.sz), mossy: new TemplateBuilder(s.sx, s.sy, s.sz) };
    const seed = hashString(`${prefix}brick_${n}`);
    s.forEach((x, y, z, m) => {
      const block = blockFor(m, COLD);
      const k = hash3(x, y, z, seed) & 3;
      const over = k === 2 ? overlayBlock(block, 'cracked') : k === 3 ? overlayBlock(block, 'mossy') : null;
      if (over) layers[k === 2 ? 'cracked' : 'mossy'].set(x, y, z, over);
      else layers.brick.set(x, y, z, block);
    });
    for (const [x, y, z, name] of s.marks) layers.brick.marker(x, y, z, name);
    for (const [kind, b] of Object.entries(layers)) TEMPLATES.set(`underwater_ruin/${prefix}${kind}_${n}`, b.build(`underwater_ruin/${prefix}${kind}_${n}`));
  };
  for (let i = 0; i < 8; i++) {
    warm(`warm_${i + 1}`, small(`warm_${i + 1}`, i));
    cold('', i + 1, small(`brick_${i + 1}`, i));
  }
  [4, 5, 6, 7].forEach((n, i) => warm(`big_warm_${n}`, big(`big_warm_${n}`, i)));
  [1, 2, 3, 8].forEach((n, i) => cold('big_', n, big(`big_brick_${n}`, i)));
}

/** one of the ruins' templates, by vanilla's name (underwater_ruin/...) */
export function ruinTemplate(name: string): BlockTemplate {
  if (!TEMPLATES.size) buildRuins();
  const t = TEMPLATES.get(name);
  if (!t) throw new Error('no ocean ruin template ' + name);
  return t;
}

/** vanilla OceanRuinPieces.WARM_RUINS, BIG_WARM_RUINS, RUIN_LOCATIONS (the cold ones') and BIG_RUIN_LOCATIONS */
const WARM_RUINS = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `warm_${i}`);
const BIG_WARM_RUINS = [4, 5, 6, 7].map((i) => `big_warm_${i}`);
const COLD_RUINS = [1, 2, 3, 4, 5, 6, 7, 8];
const BIG_COLD_RUINS = [1, 2, 3, 8];

// ---------------------------------------------------------------------------------------------------------------
// The pieces

const WATER = () => S('water');

/** vanilla OceanRuinPieces.OceanRuinPiece */
export class OceanRuinPiece extends TemplatePiece {
  constructor(template: BlockTemplate, x: number, y: number, z: number, rot: number, integrity: number, readonly warm: boolean, readonly isLarge: boolean, worldSeed: bigint) {
    super(template, x, y, z, {
      rot, pivot: [0, 0], integrity, waterlog: true,
      // vanilla WARM_SUSPICIOUS_BLOCK_PROCESSOR / COLD_SUSPICIOUS_BLOCK_PROCESSOR
      suspicious: warm
        ? { from: 'sand', to: 'suspicious_sand', lootTable: 'archaeology/ocean_ruin_warm', cap: 5 }
        : { from: 'gravel', to: 'suspicious_gravel', lootTable: 'archaeology/ocean_ruin_cold', cap: 5 },
    }, worldSeed);
  }

  /**
   * vanilla handleDataMarker: "chest", a chest facing north (waterlogged in water) with underwater_ruin_big or _small
   * loot; "drowned", a drowned that never despawns standing there (what its finalizeSpawn would draw that doesn't
   * depend on the difficulty: one in twenty a baby, one in ten with a trident or fishing rod, a nautilus shell 3% of
   * the time), and its place then water, or air above sea level
   */
  protected handleDataMarker(name: string, x: number, y: number, z: number, ctx: GenContext, r: Rand): void {
    if (name === 'chest') {
      const water = (FLAGS[ctx.getOrAir(x, y, z)] & F_WATER) !== 0;
      ctx.set(x, y, z, parseState(`chest[facing=north,waterlogged=${water}]`));
      ctx.blockEntities.push({ id: 'chest', x, y, z, items: [], data: { lootTable: this.isLarge ? 'chests/underwater_ruin_big' : 'chests/underwater_ruin_small', lootSeed: r.nextU32() } });
    } else if (name === 'drowned') {
      const e: SavedEntity = { id: 'drowned', x: x + 0.5, y, z: z + 0.5, yaw: 0, pitch: 0, dx: 0, dy: 0, dz: 0, health: 20, fire: 0, persistent: true };
      if (r.nextFloat() < 0.05) e.data = { baby: true };
      if (r.nextFloat() > 0.9) e.hand = [r.nextInt(16) < 10 ? 'trident' : 'fishing_rod', 1, 0];
      if (r.nextFloat() < 0.03) {
        e.offhand = ['nautilus_shell', 1, 0];
        e.offDrop = 2;
      }
      ctx.entities.push(e);
      ctx.set(x, y, z, y > SEA_LEVEL ? 0 : WATER());
    }
  }
}

/**
 * vanilla OceanRuinPiece.postProcess and getHeight, worked out once from the ocean floor rather than by each chunk:
 * the ocean floor at the ruin's corner; but where the ground under the turned ruin (looked for down through water
 * and ice) is more than two below that in all but a row's worth of columns, it drops to one above the lowest of it
 */
function ruinHeight(t: BlockTemplate, x: number, z: number, rot: number, floor: (x: number, z: number) => number): number {
  let i = floor(x, z);
  const [fx, fz] = turnAbout(t.sx - 1, t.sz - 1, rot, 0, 0);
  const x1 = x + fx, z1 = z + fz;
  const k = i - 1;
  let j = 512, l = 0;
  for (let bz = Math.min(z, z1); bz <= Math.max(z, z1); bz++)
    for (let bx = Math.min(x, x1); bx <= Math.max(x, x1); bx++) {
      const k1 = Math.max(Math.min(k, floor(bx, bz) - 1), MIN_Y + 1);
      j = Math.min(j, k1);
      if (k1 < k - 2) l++;
    }
  const l1 = Math.abs(x - x1);
  if (k - j > 2 && l > l1 - 2) i = j + 1;
  return i;
}

/**
 * vanilla OceanRuinStructure.generatePieces and OceanRuinPieces.addPieces: from the start chunk's corner, a random turn;
 * large three times in ten (else small), and nine in ten large ones with a cluster of small ones round them. Each
 * then settled to the floor (the cold ones' three overlays alike).
 */
export function oceanRuinPieces(worldSeed: bigint, r: JavaRandom, x0: number, z0: number, warm: boolean, floor: (x: number, z: number) => number): OceanRuinPiece[] {
  const groups: OceanRuinPiece[][] = [];
  const addPiece = (x: number, z: number, rot: number, large: boolean, integrity: number) => {
    if (warm) {
      const list = large ? BIG_WARM_RUINS : WARM_RUINS;
      groups.push([new OceanRuinPiece(ruinTemplate(`underwater_ruin/${list[r.nextInt(list.length)]}`), x, 90, z, rot, integrity, true, large, worldSeed)]);
      return;
    }
    const list = large ? BIG_COLD_RUINS : COLD_RUINS;
    const n = list[r.nextInt(list.length)], pre = large ? 'big_' : '';
    groups.push([
      new OceanRuinPiece(ruinTemplate(`underwater_ruin/${pre}brick_${n}`), x, 90, z, rot, integrity, false, large, worldSeed),
      new OceanRuinPiece(ruinTemplate(`underwater_ruin/${pre}cracked_${n}`), x, 90, z, rot, 0.7, false, large, worldSeed),
      new OceanRuinPiece(ruinTemplate(`underwater_ruin/${pre}mossy_${n}`), x, 90, z, rot, 0.5, false, large, worldSeed),
    ]);
  };
  const rot = r.nextInt(4);
  const large = r.nextFloat() <= 0.3;
  addPiece(x0, z0, rot, large, large ? 0.9 : 0.8);
  if (large && r.nextFloat() <= 0.9) {
    // vanilla addClusterRuins: eight places round the big ruin, four to eight of them taken at random (each with its
    // own turn), skipping any whose rough box would overlap the big one's
    const [bx, bz] = turnAbout(15, 15, rot, 0, 0);
    const big = new BoundingBox(Math.min(x0, x0 + bx), 90, Math.min(z0, z0 + bz), Math.max(x0, x0 + bx), 90, Math.max(z0, z0 + bz));
    const cx = big.minX, cz = big.minZ;
    const between = (lo: number, hi: number) => lo + r.nextInt(hi - lo + 1);
    const places: [number, number][] = [
      [cx - 16 + between(1, 8), cz + 16 + between(1, 7)],
      [cx - 16 + between(1, 8), cz + between(1, 7)],
      [cx - 16 + between(1, 8), cz - 16 + between(4, 8)],
      [cx + between(1, 7), cz + 16 + between(1, 7)],
      [cx + between(1, 7), cz - 16 + between(4, 6)],
      [cx + 16 + between(1, 7), cz + 16 + between(3, 8)],
      [cx + 16 + between(1, 7), cz + between(1, 7)],
      [cx + 16 + between(1, 7), cz - 16 + between(4, 8)],
    ];
    const n = between(4, 8);
    for (let j = 0; j < n; j++) {
      if (!places.length) break;
      const [px, pz] = places.splice(r.nextInt(places.length), 1)[0];
      const rot2 = r.nextInt(4);
      const [sx, sz] = turnAbout(5, 6, rot2, 0, 0);
      const box = new BoundingBox(Math.min(px, px + sx), 90, Math.min(pz, pz + sz), Math.max(px, px + sx), 90, Math.max(pz, pz + sz));
      if (!box.intersects(big)) addPiece(px, pz, rot2, false, 0.8);
    }
  }
  const out: OceanRuinPiece[] = [];
  for (const g of groups) {
    const y = ruinHeight(g[0].template, g[0].x, g[0].z, g[0].settings.rot, floor);
    for (const p of g) {
      p.setY(y);
      out.push(p);
    }
  }
  return out;
}
