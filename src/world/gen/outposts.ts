// Pillager outposts (vanilla structure set minecraft:pillager_outposts, structure minecraft:pillager_outpost and
// PillagerOutpostPools): a watchtower on a flattened base plate, with up to four features round it on the ground —
// iron golem cages, a pile of logs, tents, straw targets. Where they go: one chance per 32×32-chunk region (the start
// 8 chunks clear of the region's far edges), then vanilla's legacy_type_1 one-in-five, then not within 10 chunks of
// where a village could start, and only in #has_structure/pillager_outpost biomes. Laid out as a jigsaw structure
// (size 7, 80 blocks from the centre, the expansion hack) on the WORLD_SURFACE_WG height, with beard_thin terrain.
//
// The templates are hand-made after vanilla's pillager_outpost/* structures: dark oak and birch, cobblestone, a
// ladder up the middle, the ominous banner hung on each side under the lookout, and the loot chest up top. (Not
// here: the overgrown overlay vanilla lays over 5% of the tower, and the allays of the third cage — it stands empty.)

import { B, pickSurfaceBiome } from './biomes';
import { OverworldRouter, newColumn } from './router';
import { SeedSource } from './noise';
import { MIN_Y, MAX_Y } from '../constants';
import type { GenContext } from './context';
import {
  template, pool, POOLS, SingleElement, EMPTY, Box, Beardifier, jigsawStart, jigsawAssemble, largeFeatureRandom, saltedRandom, worldSeed64,
  type Piece, type PlaceCtx, type Template,
} from './jigsaw';
import { JavaRandom } from '../../core/rng';
import { blockOf } from '../block';
import type { Villages } from './villages';

// vanilla RandomSpreadStructurePlacement for pillager_outposts (linear spread)
const SPACING = 32, SEPARATION = 8, SALT = 165745296;
/** vanilla frequency 0.2 with legacy_type_1: nextInt((int) (1 / 0.2f)) */
const FREQUENCY_BOUND = 5;
/** vanilla exclusion_zone: minecraft:villages, 10 chunks */
const EXCLUSION_CHUNKS = 10;
// vanilla JigsawStructure pillager_outpost: size 7, max_distance_from_center 80, use_expansion_hack true
const SIZE = 7, MAX_DISTANCE = 80;
/** vanilla Structure.adjustBoundingBox: a structure that adapts the terrain reaches 12 blocks further all round */
const BOX_INFLATE = 12;

/** vanilla #has_structure/pillager_outpost: desert, plains, savanna, snowy plains, taiga, #is_mountain and grove */
const OUTPOST_BIOMES = new Set<number>([
  B.desert, B.plains, B.savanna, B.snowy_plains, B.taiga, B.meadow, B.frozen_peaks, B.jagged_peaks, B.stony_peaks, B.snowy_slopes, B.cherry_grove, B.grove,
]);

// ---------------------------------------------------------------------------------------------------------------
// Templates

const P = 'pillager_outpost';
/** the watchtower's rows: 11×11, the tower in the middle 9×9 (u, v from its corner), a block's margin for the banners */
function rows(f: (u: number, v: number, x: number, z: number) => string): string {
  const out: string[] = [];
  for (let z = 0; z < 11; z++) {
    let row = '';
    for (let x = 0; x < 11; x++) {
      const u = x - 1, v = z - 1;
      row += u < 0 || u > 8 || v < 0 || v > 8 ? f(-1, -1, x, z) : f(u, v, x, z);
    }
    out.push(row);
  }
  return out.join('|');
}
const corner = (u: number, v: number) => (u === 0 || u === 8) && (v === 0 || v === 8);
const edge = (u: number, v: number) => u === 0 || u === 8 || v === 0 || v === 8;
/** the ladder up the south wall, inside */
const ladder = (u: number, v: number) => u === 4 && v === 7;
/** a storey of wall: logs at the corners, `wall` round the sides with `gaps` left open */
const wallLayer = (wall: string, gaps: [number, number][] = []) =>
  rows((u, v) => (u < 0 ? '.' : corner(u, v) ? 'L' : edge(u, v) ? (gaps.some(([a, b]) => a === u && b === v) ? '.' : wall) : ladder(u, v) ? 'H' : '.'));
const floorLayer = (banners = false) =>
  rows((u, v, x, z) => {
    if (u < 0) {
      if (!banners) return '.';
      return x === 5 && z === 0 ? 'n' : x === 5 && z === 10 ? 'S' : x === 0 && z === 5 ? 'w' : x === 10 && z === 5 ? 'e' : '.';
    }
    return ladder(u, v) ? 'H' : 'P';
  });
const DOOR: [number, number][] = [[4, 0]];
const SIDE_WINDOWS: [number, number][] = [[0, 4], [8, 4]];

const watchtower = template(`${P}/watchtower`, {
  key: {
    C: 'cobblestone', L: 'dark_oak_log', B: 'birch_planks', P: 'dark_oak_planks', H: 'ladder[facing=north]', F: 'dark_oak_fence',
    c: 'chest[facing=south]', s: 'dark_oak_slab[type=bottom]',
    n: 'white_wall_banner[facing=north]', S: 'white_wall_banner[facing=south]', w: 'white_wall_banner[facing=west]', e: 'white_wall_banner[facing=east]',
  },
  layers: [
    rows((u) => (u < 0 ? '.' : 'C')),
    wallLayer('C', DOOR),
    wallLayer('B', DOOR),
    wallLayer('B'),
    wallLayer('B', SIDE_WINDOWS),
    floorLayer(),
    wallLayer('B'),
    wallLayer('B', [[4, 0], ...SIDE_WINDOWS]),
    wallLayer('B'),
    wallLayer('B'),
    floorLayer(true),
    rows((u, v) => (u < 0 ? '.' : corner(u, v) ? 'L' : edge(u, v) ? 'F' : u === 6 && v === 2 ? 'c' : '.')),
    rows((u, v) => (u >= 0 && corner(u, v) ? 'L' : '.')),
    rows((u) => (u < 0 ? '.' : 'P')),
    rows((u, v) => (u >= 1 && u <= 7 && v >= 1 && v <= 7 ? 's' : '.')),
  ],
  jigsaws: [{ at: [5, 0, 5], facing: 'down', name: 'bottom', final: 'cobblestone' }],
  loot: [{ at: [7, 11, 3], table: 'chests/pillager_outpost' }],
});

/** the tower's banners: the ominous banner's patterns (game/banners.ts ominousBanner) */
const OMINOUS_PATTERNS = JSON.stringify(
  [
    ['rhombus', 'cyan'], ['stripe_bottom', 'light_gray'], ['stripe_center', 'gray'], ['border', 'light_gray'],
    ['stripe_middle', 'black'], ['half_horizontal', 'light_gray'], ['circle', 'light_gray'], ['border', 'black'],
  ].map(([pattern, color]) => ({ pattern, color })),
);

/** the watchtower: its wall banners get their block entity, the ominous banner's patterns, as they're placed */
class TowerElement extends SingleElement {
  override place(pc: PlaceCtx, piece: Piece): void {
    super.place(pc, piece);
    const t = this.template, b = t.blocks, rot = piece.rot, { chunk, ctx } = pc;
    for (let i = 0; i < b.length; i += 4) {
      if (!blockOf(b[i + 3]).name.endsWith('_wall_banner')) continue;
      const lx = b[i], lz = b[i + 2];
      const wx = piece.x + (rot === 1 ? -lz : rot === 2 ? -lx : rot === 3 ? lz : lx);
      const wz = piece.z + (rot === 1 ? lx : rot === 2 ? -lz : rot === 3 ? -lx : lz);
      if (wx < chunk.minX || wx > chunk.maxX || wz < chunk.minZ || wz > chunk.maxZ) continue;
      const wy = piece.y + b[i + 1];
      if (!blockOf(ctx.getOrAir(wx, wy, wz)).name.endsWith('_wall_banner')) continue;
      ctx.blockEntities.push({ id: 'banner', x: wx, y: wy, z: wz, items: [], data: { patterns: OMINOUS_PATTERNS, itemName: 'Ominous Banner', hide: 1, rarity: 'uncommon' } });
    }
  }
}

/** the base plate: nothing of its own but its place in the flattened ground, the tower in the middle, a feature plate off each side */
const basePlate = template(`${P}/base_plate`, {
  key: {},
  layers: [Array.from({ length: 15 }, () => '.'.repeat(15)).join('|')],
  jigsaws: [
    { at: [7, 0, 7], facing: 'up', target: 'bottom', pool: `${P}/towers` },
    { at: [7, 0, 0], facing: 'north', target: 'plate', pool: `${P}/feature_plates` },
    { at: [7, 0, 14], facing: 'south', target: 'plate', pool: `${P}/feature_plates` },
    { at: [0, 0, 7], facing: 'west', target: 'plate', pool: `${P}/feature_plates` },
    { at: [14, 0, 7], facing: 'east', target: 'plate', pool: `${P}/feature_plates` },
  ],
});

/** a feature plate: a patch of ground beside the base, with a feature (or none) in the middle */
const featurePlate = template(`${P}/feature_plate`, {
  key: {},
  layers: [Array.from({ length: 9 }, () => '.'.repeat(9)).join('|')],
  jigsaws: [
    { at: [4, 0, 0], facing: 'north', name: 'plate' },
    { at: [4, 0, 4], facing: 'up', target: 'feature', pool: `${P}/features` },
  ],
});

const FK = {
  L: 'dark_oak_log', l: 'dark_oak_log[axis=z]', F: 'dark_oak_fence', I: 'iron_bars', P: 'dark_oak_planks', s: 'dark_oak_slab[type=bottom]',
  W: 'white_wool', h: 'hay_block', p: 'carved_pumpkin[facing=south]', T: 'crafting_table',
};
const featureJ = (x: number, z: number) => ({ at: [x, 0, z] as [number, number, number], facing: 'down' as const, name: 'feature' });
const golem = { at: [2.5, 0, 2.5] as [number, number, number], id: 'iron_golem', health: 100 };

const cage1 = template(`${P}/feature_cage1`, {
  key: FK,
  layers: ['LFFFL|F...F|F...F|F...F|LFFFL', 'LFFFL|F...F|F...F|F...F|LFFFL', 'LFFFL|F...F|F...F|F...F|LFFFL', 'sssss|sssss|sssss|sssss|sssss'],
  jigsaws: [featureJ(2, 2)],
  entities: [golem],
});
const cage2 = template(`${P}/feature_cage2`, {
  key: FK,
  layers: ['LIIIL|I...I|I...I|I...I|LIIIL', 'LIIIL|I...I|I...I|I...I|LIIIL', 'LIIIL|I...I|I...I|I...I|LIIIL', 'PPPPP|PPPPP|PPPPP|PPPPP|PPPPP'],
  jigsaws: [featureJ(2, 2)],
  entities: [golem],
});
/** (vanilla's holds two allays, which the game doesn't have: it stands empty) */
const cageAllays = template(`${P}/feature_cage_with_allays`, {
  key: FK,
  layers: ['FFF|F.F|FFF', 'FFF|F.F|FFF', 'sss|sss|sss'],
  jigsaws: [featureJ(1, 1)],
});
const logs = template(`${P}/feature_logs`, {
  key: FK,
  layers: ['lll|lll|lll|lll', '.ll|.ll|.ll|.ll', '.l.|.l.|.l.|.l.'],
  jigsaws: [featureJ(1, 1)],
});
const tent1 = template(`${P}/feature_tent1`, {
  key: FK,
  layers: ['W...W|W...W|W...W|W..TW|WWWWW', '.W.W.|.W.W.|.W.W.|.W.W.|.WWW.', '..W..|..W..|..W..|..W..|..W..'],
  jigsaws: [featureJ(2, 2)],
});
const tent2 = template(`${P}/feature_tent2`, {
  key: FK,
  layers: ['F.F|...|F.F', 'F.F|...|F.F', 'WWW|WWW|WWW'],
  jigsaws: [featureJ(1, 1)],
});
const targets = template(`${P}/feature_targets`, {
  key: FK,
  layers: ['F.F', 'h.h', 'p.p'],
  jigsaws: [featureJ(1, 0)],
});

const rigid = (t: Template) => new SingleElement(t, 'rigid');
pool(`${P}/base_plates`, 'empty', [[rigid(basePlate), 1]]);
pool(`${P}/towers`, 'empty', [[new TowerElement(watchtower, 'rigid'), 1]]);
pool(`${P}/feature_plates`, 'empty', [[new SingleElement(featurePlate, 'terrain_matching'), 1]]);
pool(`${P}/features`, 'empty', [
  [rigid(cage1), 1], [rigid(cage2), 1], [rigid(cageAllays), 1], [rigid(logs), 1], [rigid(tent1), 1], [rigid(tent2), 1], [rigid(targets), 1], [EMPTY, 6],
]);

// ---------------------------------------------------------------------------------------------------------------
// Placement

export interface OutpostTerrain {
  /** vanilla getFirstFreeHeight(WORLD_SURFACE_WG) on the bare noise terrain */
  firstFreeHeight(x: number, z: number): number;
  /** the biome at a quart (vanilla getNoiseBiome) */
  quartBiome(x: number, z: number): number;
}

export interface OutpostStub {
  /** the start chunk */
  cx: number;
  cz: number;
  /** the start piece's centre */
  x: number;
  z: number;
}

const floorDiv = (a: number, b: number) => Math.floor(a / b);

export class PillagerOutposts {
  private readonly stubs = new Map<number, OutpostStub | null>();
  private readonly built = new Map<number, { pieces: Piece[]; box: Box }>();
  private readonly salt: number;

  constructor(private readonly seed: bigint, private readonly terrain: OutpostTerrain, private readonly villages: Villages) {
    this.salt = Number(BigInt.asIntN(32, seed ^ (seed >> 32n))) ^ 0x0a7905;
  }

  /** vanilla RandomSpreadStructurePlacement.getPotentialStructureChunk (linear spread) */
  potentialChunk(rx: number, rz: number): [number, number] {
    const r = saltedRandom(this.seed, rx, rz, SALT);
    const i = r.nextInt(SPACING - SEPARATION), j = r.nextInt(SPACING - SEPARATION);
    return [rx * SPACING + i, rz * SPACING + j];
  }

  /** vanilla StructurePlacement.legacyPillagerOutpostReducer: one start in five, by a quirky seed of its own */
  private frequencyAllows(cx: number, cz: number): boolean {
    const i = cx >> 4, j = cz >> 4;
    const r = new JavaRandom(0);
    r.setSeed(Number(BigInt.asUintN(48, BigInt((i ^ (j << 4)) | 0) ^ this.seed)));
    r.nextInt();
    return r.nextInt(FREQUENCY_BOUND) === 0;
  }

  /** vanilla ExclusionZone / hasStructureChunkInRange: a village's placement chunk (whether a village stands there or not) within 10 chunks */
  private nearVillagePlacement(cx: number, cz: number): boolean {
    const r = EXCLUSION_CHUNKS, VS = 34;
    for (let rx = floorDiv(cx - r, VS); rx <= floorDiv(cx + r, VS); rx++)
      for (let rz = floorDiv(cz - r, VS); rz <= floorDiv(cz + r, VS); rz++) {
        const [vx, vz] = this.villages.potentialChunk(rx, rz);
        if (Math.abs(vx - cx) <= r && Math.abs(vz - cz) <= r) return true;
      }
    return false;
  }

  /** a region's outpost, if it has one (vanilla StructurePlacement.isStructureChunk, then Structure.isValidBiome at the start) */
  stub(rx: number, rz: number): OutpostStub | null {
    const key = rx * 65536 + rz;
    const c = this.stubs.get(key);
    if (c !== undefined) return c;
    const [cx, cz] = this.potentialChunk(rx, rz);
    let found: OutpostStub | null = null;
    if (this.frequencyAllows(cx, cz) && !this.nearVillagePlacement(cx, cz)) {
      const s = jigsawStart(POOLS.get(`${P}/base_plates`)!, largeFeatureRandom(this.seed, cx, cz), cx, cz, null);
      if (s && OUTPOST_BIOMES.has(this.terrain.quartBiome(s.x, s.z))) found = { cx, cz, x: s.x, z: s.z };
    }
    this.stubs.set(key, found);
    return found;
  }

  /** the pieces of a region's outpost and the structure's box, laid out the first time they're wanted (vanilla JigsawPlacement.addPieces) */
  layout(rx: number, rz: number): { pieces: Piece[]; box: Box } | null {
    const s = this.stub(rx, rz);
    if (!s) return null;
    const key = rx * 65536 + rz;
    let b = this.built.get(key);
    if (b) return b;
    if (this.built.size > 48) this.built.clear();
    const r = largeFeatureRandom(this.seed, s.cx, s.cz);
    const height = (x: number, z: number) => this.terrain.firstFreeHeight(x, z);
    const start = jigsawStart(POOLS.get(`${P}/base_plates`)!, r, s.cx, s.cz, height)!;
    const pieces = jigsawAssemble(start, r, SIZE, MAX_DISTANCE, true, height);
    const box = new Box(Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity);
    for (const p of pieces) {
      box.minX = Math.min(box.minX, p.box.minX);
      box.minY = Math.min(box.minY, p.box.minY);
      box.minZ = Math.min(box.minZ, p.box.minZ);
      box.maxX = Math.max(box.maxX, p.box.maxX);
      box.maxY = Math.max(box.maxY, p.box.maxY);
      box.maxZ = Math.max(box.maxZ, p.box.maxZ);
    }
    b = { pieces, box: new Box(box.minX - BOX_INFLATE, box.minY - BOX_INFLATE, box.minZ - BOX_INFLATE, box.maxX + BOX_INFLATE, box.maxY + BOX_INFLATE, box.maxZ + BOX_INFLATE) };
    this.built.set(key, b);
    return b;
  }

  pieces(rx: number, rz: number): Piece[] | null {
    return this.layout(rx, rz)?.pieces ?? null;
  }

  /** the outposts whose pieces may reach a chunk (a start refers to chunks within 8 of it) */
  private near(cx: number, cz: number): { pieces: Piece[]; box: Box }[] {
    const out: { pieces: Piece[]; box: Box }[] = [];
    for (let rx = floorDiv(cx - 8, SPACING); rx <= floorDiv(cx + 8, SPACING); rx++)
      for (let rz = floorDiv(cz - 8, SPACING); rz <= floorDiv(cz + 8, SPACING); rz++) {
        const s = this.stub(rx, rz);
        if (!s || Math.abs(s.cx - cx) > 8 || Math.abs(s.cz - cz) > 8) continue;
        const b = this.layout(rx, rz);
        if (b) out.push(b);
      }
    return out;
  }

  /** whether an outpost starts within 8 chunks (its pieces could reach this chunk): no layout needed */
  hasStartNear(cx: number, cz: number): boolean {
    for (let rx = floorDiv(cx - 8, SPACING); rx <= floorDiv(cx + 8, SPACING); rx++)
      for (let rz = floorDiv(cz - 8, SPACING); rz <= floorDiv(cz + 8, SPACING); rz++) {
        const s = this.stub(rx, rz);
        if (s && Math.abs(s.cx - cx) <= 8 && Math.abs(s.cz - cz) <= 8) return true;
      }
    return false;
  }

  /** what the outposts around do to a chunk's terrain, added to `base` (the villages'): null when nothing */
  beardFor(cx: number, cz: number, base: Beardifier | null): Beardifier | null {
    const near = this.near(cx, cz);
    if (!near.length) return base;
    const b = base ?? new Beardifier();
    for (const { pieces } of near) b.add(pieces, cx, cz);
    return b.empty ? null : b;
  }

  /** vanilla StructureStart.placeInChunk for every outpost reaching this chunk */
  place(ctx: GenContext): void {
    const chunk = new Box(ctx.x0, MIN_Y, ctx.z0, ctx.x0 + 15, MAX_Y - 1, ctx.z0 + 15);
    let first = true;
    for (const { pieces } of this.near(ctx.cx, ctx.cz)) {
      for (const p of pieces) {
        if (!p.box.intersects(chunk)) continue;
        if (first) {
          ctx.computeHeightmaps();
          first = false;
        }
        p.element.place({ ctx, chunk, salt: this.salt }, p);
      }
    }
  }

  /** vanilla StructureManager.getStructureAt: the outpost whose (inflated) box holds this block, if any */
  structureAt(x: number, y: number, z: number): Box | null {
    for (const b of this.near(x >> 4, z >> 4)) if (b.box.isInside(x, y, z)) return b.box;
    return null;
  }

  /** vanilla ChunkGenerator.getNearestGeneratedStructure for /locate (as Villages.nearest): the start chunk's corner */
  nearest(x: number, z: number, radius = 100): [number, number] | null {
    const rx0 = floorDiv(x >> 4, SPACING), rz0 = floorDiv(z >> 4, SPACING);
    for (let ring = 0; ring <= radius; ring++)
      for (let i = -ring; i <= ring; i++)
        for (let j = -ring; j <= ring; j++) {
          if (i !== -ring && i !== ring && j !== -ring && j !== ring) continue;
          const s = this.stub(rx0 + i, rz0 + j);
          if (s) return [s.cx * 16, s.cz * 16];
        }
    return null;
  }
}

/** outposts for /locate on the main thread: only the biome noise is needed to know where they are */
export function outpostLocator(seed: string, villages: Villages): PillagerOutposts {
  const router = new OverworldRouter(SeedSource.fromWorldSeed(seed));
  const quartBiome = (x: number, z: number) => {
    const c = router.column(x & ~3, z & ~3, newColumn());
    return pickSurfaceBiome(c.temperature, c.humidity, c.continents, c.erosion, c.ridges);
  };
  return new PillagerOutposts(worldSeed64(seed), { firstFreeHeight: () => 64, quartBiome }, villages);
}
