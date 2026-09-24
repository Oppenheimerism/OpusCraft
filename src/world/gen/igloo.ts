// Igloos (vanilla IglooStructure + IglooPieces): a dome of snow blocks in the snowy plains, taigas and slopes, turned
// any of the four ways about the middle of its floor, with a bed, a furnace, a crafting table and a redstone torch
// (whose light doesn't melt the ice windows) on a floor of white carpet. Half of them hide an oak trapdoor under the
// third carpet in from the door, over a ladder down 4-11 shaft segments of stone bricks, some of them infested, to
// a basement: a table of stairs with a brewing stand holding a splash potion of weakness and a potted cactus, a
// cauldron two-thirds full, a chest with a golden apple among its loot, and behind iron bars a villager and a zombie
// villager to cure. The three templates (vanilla igloo/top, igloo/middle and igloo/bottom) are made here block by
// block from what the game shows; no game files are used.

import type { Rand, JavaRandom } from '../../core/rng';
import { S, blockOf } from '../block';
import type { GenContext } from './context';
import type { SavedBlockEntity } from '../blockEntity';
import type { SavedEntity } from '../../entity/mob';
import { BoundingBox, PieceList, StructurePiece, isAir } from './structure';
import { parseState, rotateState } from './jigsaw';

export type IglooPart = 'top' | 'middle' | 'bottom';

interface TemplateDef {
  /** block per character; '.' is structure void (the world is left as it is), a key of '@name' a data marker */
  key: Record<string, string>;
  /** layers bottom-up; each layer is rows north to south separated by '|', each row west to east */
  layers: string[];
  /** vanilla IglooPieces.PIVOTS: what the piece turns about (x, z) */
  pivot: [number, number];
  /** vanilla IglooPieces.OFFSETS: where the template goes from the structure's corner */
  offset: [number, number, number];
  /** the block entities the template carries (their contents) */
  blockEntities?: { at: [number, number, number]; id: string; items?: SavedBlockEntity['items'] }[];
  /** the mobs the template carries, at their exact positions */
  entities?: { at: [number, number, number]; id: string; health: number; data?: Record<string, number | string | boolean> }[];
}

class Template {
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  /** packed x, y, z, state (0: air, which is placed) */
  readonly blocks: Int32Array;
  readonly markers: { x: number; y: number; z: number; name: string }[] = [];

  constructor(readonly def: TemplateDef) {
    const layers = def.layers.map((l) => l.split('|'));
    this.sy = layers.length;
    this.sz = Math.max(...layers.map((l) => l.length));
    this.sx = Math.max(...layers.flatMap((l) => l.map((r) => r.length)));
    const out: number[] = [];
    for (let y = 0; y < this.sy; y++)
      for (let z = 0; z < layers[y].length; z++)
        for (let x = 0; x < layers[y][z].length; x++) {
          const ch = layers[y][z][x];
          if (ch === '.') continue;
          const s = def.key[ch];
          if (s === undefined) throw new Error(`igloo template: no block for '${ch}'`);
          if (s.startsWith('@')) this.markers.push({ x, y, z, name: s.slice(1) });
          else out.push(x, y, z, s === 'air' ? 0 : parseState(s));
        }
    this.blocks = Int32Array.from(out);
  }
}

// vanilla igloo/top: the dome, 7 x 5 x 8, the doorstep at (3, 0, 0) and the trapdoor at (3, 0, 5)
const TOP: TemplateDef = {
  key: {
    S: 'snow_block', _: 'air', w: 'white_carpet', I: 'ice', C: 'crafting_table', F: 'furnace[facing=west]',
    f: 'red_bed[facing=south,part=foot]', h: 'red_bed[facing=south,part=head]', R: 'redstone_wall_torch[facing=north]',
    T: 'oak_trapdoor[facing=north,half=top]',
  },
  layers: [
    '...S...|..SSS..|.SSSSS.|SSSSSSS|SSSSSSS|SSSTSSS|SSSSSSS|.SSSSS.',
    '.......|..S_S..|.SS_SS.|SwwwwwS|SwwwwwS|SfwwwCS|ShwwwFS|.SSSSS.',
    '.......|..S_S..|.SS_SS.|S_____S|I_____I|S_____S|S__R__S|.SSSSS.',
    '.......|..SSS..|..SSS..|.SSSSS.|.S___S.|.S___S.|.SSSSS.|.......',
    '.......|.......|.......|.......|..SSS..|..SSS..|.......|.......',
  ],
  pivot: [3, 5],
  offset: [0, 0, 0],
  blockEntities: [{ at: [5, 1, 6], id: 'furnace' }],
};

// vanilla igloo/middle: a 3 x 3 x 3 length of the shaft, the ladder on its south wall
const MIDDLE: TemplateDef = {
  key: { S: 'stone_bricks', X: 'infested_stone_bricks', L: 'ladder[facing=north]' },
  layers: ['SSS|SLS|SXS', 'XSS|SLS|SSS', 'SSS|SLS|SSX'],
  pivot: [1, 1],
  offset: [2, -3, 4],
};

// vanilla igloo/bottom: the basement, 7 x 6 x 9, the ladder coming down at (3, 5, 7) into the room; the cells at
// the north end; facing the ladder, the table (upside-down stairs) and the cauldron to its left, the chest to its right
// HOOK(signs): vanilla also has a sign on the wall between the cells, facing the room, with arrows pointing to each
// cell; the game has no sign blocks yet
const BOTTOM: TemplateDef = {
  key: {
    S: 'stone_bricks', X: 'infested_stone_bricks', _: 'air', B: 'iron_bars', r: 'red_carpet', c: 'water_cauldron[level=2]',
    a: 'spruce_stairs[facing=west,half=top]', b: 'spruce_stairs[facing=east,half=top]', L: 'ladder[facing=north]', K: 'chest[facing=north]',
    M: '@chest', Z: 'brewing_stand[has_bottle_0=true]', P: 'potted_cactus', E: 'wall_torch[facing=east]', W: 'wall_torch[facing=west]',
  },
  layers: [
    'SSSSSSS|SSSSSSS|SSSSSXS|SSSSSSS|SSSSSSS|SXSSSSS|SSSSSSS|SSSSSSS|SSSSSSS',
    'SSSSSSS|S__S__S|S__S__S|SBBSBBS|S_rrr_S|S_rrr_S|S_rrrcS|S_KLabS|SSSSSSS',
    'SSSSSSS|S__S__S|S__S__S|SBBSBBS|S_____S|SE___WS|X_____S|S_MLPZS|SSSSSSS',
    'SSSSSSS|S__S__S|S__S__S|SSSSSSS|S_____S|S_____S|S_____S|S__L__S|SSXSSSS',
    'SSSSSSS|SSSSSSS|SSSSSSS|SSSSSSS|SSSSSSS|SSSSSSS|SSSSSSS|SSSLSSS|SSSSSSS',
    '.......|.......|.......|.......|.......|.......|..SSS..|..SLS..|..SSS..',
  ],
  pivot: [3, 7],
  offset: [0, -3, -2],
  blockEntities: [{ at: [5, 2, 7], id: 'brewing_stand', items: [[0, 'splash_potion', 1, 0, { potion: { potion: 'weakness' } }]] }],
  // (vanilla: a plains villager and a plains zombie villager from before villagers had jobs; neither despawns)
  entities: [
    { at: [1.5, 1, 1.5], id: 'villager', health: 20, data: { vtype: 'plains', profession: 'none' } },
    { at: [5.5, 1, 1.5], id: 'zombie_villager', health: 20, data: { vtype: 'plains', profession: 'none' } },
  ],
};

let TEMPLATES: Record<IglooPart, Template> | null = null;
function templates(): Record<IglooPart, Template> {
  return (TEMPLATES ??= { top: new Template(TOP), middle: new Template(MIDDLE), bottom: new Template(BOTTOM) });
}

/** vanilla StructureTemplate.transform(BlockPos): a template position turned (clockwise quarter turns) about the pivot */
function turn(x: number, z: number, rot: number, [px, pz]: [number, number]): [number, number] {
  switch (rot) {
    case 1: return [px + pz - z, pz - px + x];
    case 2: return [px + px - x, pz + pz - z];
    case 3: return [px - pz + z, px + pz - x];
    default: return [x, z];
  }
}

/** vanilla StructureTemplate.transform(Vec3): an exact position turned about the pivot (a block's corner, not its middle) */
function turnExact(x: number, z: number, rot: number, [px, pz]: [number, number]): [number, number] {
  switch (rot) {
    case 1: return [px + pz + 1 - z, pz - px + x];
    case 2: return [px + px + 1 - x, pz + pz + 1 - z];
    case 3: return [px - pz + z, px + pz + 1 - x];
    default: return [x, z];
  }
}

/** blocks whose shape depends on their neighbours: fixed up once the chunks round them are there */
const SHAPED = /(_stairs|_fence|_pane|_wall|^iron_bars)$/;

/** vanilla IglooPieces.IglooPiece: one of the templates at a position, turned about its pivot */
export class IglooPiece extends StructurePiece {
  readonly template: Template;

  constructor(readonly part: IglooPart, readonly x: number, readonly y: number, readonly z: number, readonly turns: number) {
    const t = templates()[part];
    const [ax, az] = turn(0, 0, turns, t.def.pivot), [bx, bz] = turn(t.sx - 1, t.sz - 1, turns, t.def.pivot);
    super(0, new BoundingBox(x + Math.min(ax, bx), y, z + Math.min(az, bz), x + Math.max(ax, bx), y + t.sy - 1, z + Math.max(az, bz)));
    this.template = t;
  }

  addChildren(_start: StructurePiece, _pieces: PieceList, _r: Rand): void {}

  /** where a template position is in the world */
  pos(x: number, y: number, z: number): [number, number, number] {
    const [tx, tz] = turn(x, z, this.turns, this.template.def.pivot);
    return [this.x + tx, this.y + y, this.z + tz];
  }

  /**
   * vanilla TemplateStructurePiece.postProcess: the template's blocks in this chunk (air too, structure void not,
   * structure blocks ignored), turned; its block entities and mobs; then its data markers (IglooPiece.handleDataMarker:
   * the marker over the chest becomes air, and the chest gets chests/igloo_chest); then, for the dome, a snow block in
   * place of the trapdoor unless the shaft's ladder is under it
   */
  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    const t = this.template, b = t.blocks;
    for (let i = 0; i < b.length; i += 4) {
      const [wx, wy, wz] = this.pos(b[i], b[i + 1], b[i + 2]);
      if (!chunk.isInside(wx, wy, wz)) continue;
      const st = rotateState(b[i + 3], this.turns);
      ctx.set(wx, wy, wz, st);
      if (st > 0 && SHAPED.test(blockOf(st).name)) ctx.markForPostprocessing(wx, wy, wz);
    }
    for (const e of t.def.blockEntities ?? []) {
      const [wx, wy, wz] = this.pos(...e.at);
      if (!chunk.isInside(wx, wy, wz)) continue;
      ctx.blockEntities.push({ id: e.id, x: wx, y: wy, z: wz, items: (e.items ?? []).map((s) => [...s] as SavedBlockEntity['items'][number]) });
    }
    for (const e of t.def.entities ?? []) {
      const [ex, ey, ez] = e.at;
      const [tx, tz] = turnExact(ex, ez, this.turns, t.def.pivot);
      const wx = this.x + tx, wy = this.y + ey, wz = this.z + tz;
      if (!chunk.isInside(Math.floor(wx), Math.floor(wy), Math.floor(wz))) continue;
      ctx.entities.push({
        id: e.id, x: wx, y: wy, z: wz, yaw: (this.turns * 90) % 360, pitch: 0, dx: 0, dy: 0, dz: 0, health: e.health, fire: 0,
        persistent: true, ...(e.data ? { data: { ...e.data } } : {}),
      } as SavedEntity);
    }
    for (const mk of t.markers) {
      const [wx, wy, wz] = this.pos(mk.x, mk.y, mk.z);
      if (!chunk.isInside(wx, wy, wz) || mk.name !== 'chest') continue;
      ctx.set(wx, wy, wz, 0);
      if (blockOf(ctx.getOrAir(wx, wy - 1, wz)).name === 'chest')
        ctx.blockEntities.push({ id: 'chest', x: wx, y: wy - 1, z: wz, items: [], data: { lootTable: 'chests/igloo_chest', lootSeed: r.nextU32() } });
    }
    if (this.part === 'top') {
      const [wx, wy, wz] = this.pos(3, 0, 5);
      if (chunk.isInside(wx, wy, wz)) {
        const below = ctx.getOrAir(wx, wy - 1, wz);
        if (!isAir(below) && blockOf(below).name !== 'ladder') ctx.set(wx, wy, wz, S('snow_block'));
      }
    }
  }
}

/**
 * vanilla IglooStructure.generatePieces and IglooPieces.addPieces: a random turn; half the time a basement 4-11
 * shaft segments (of 3) down with the segments above it; then the dome. Every piece is then moved (as vanilla's
 * IglooPiece.postProcess does) so that the dome's floor is the top block of the ground at its doorstep.
 */
export function iglooPieces(r: JavaRandom, x0: number, z0: number, surface: (x: number, z: number) => number): IglooPiece[] {
  const rot = r.nextInt(4);
  const parts: [IglooPart, number][] = [];
  if (r.nextDouble() < 0.5) {
    const i = r.nextInt(8) + 4;
    parts.push(['bottom', i * 3]);
    for (let j = 0; j < i - 1; j++) parts.push(['middle', j * 3]);
  }
  parts.push(['top', 0]);
  // (vanilla: WORLD_SURFACE_WG at the dome's (3, 0, 0), which every piece's own offset and pivot come back to)
  const [dx, dz] = turn(3, 0, rot, TOP.pivot);
  const shift = surface(x0 + dx, z0 + dz) - 90 - 1;
  const T = templates();
  return parts.map(([part, down]) => {
    const [ox, oy, oz] = T[part].def.offset;
    return new IglooPiece(part, x0 + ox, 90 + oy - down + shift, z0 + oz, rot);
  });
}
