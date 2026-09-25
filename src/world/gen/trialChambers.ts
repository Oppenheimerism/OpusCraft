// (trial chambers) Trial chambers (vanilla structure set minecraft:trial_chambers, structure minecraft:trial_chambers
// and TrialChambersStructurePools). Where they go: one chance per 34×34-chunk region, the start at least 12 chunks
// clear of the region's far edges (random_spread, salt 94251327), in any Overworld biome but the deep dark, as it is
// down at the start's height. The start is a jigsaw structure of 20 steps from the pool trial_chambers/chamber/end,
// set down 40 to 20 blocks below y 0 and reaching at most 116 blocks from its middle (and 10 short of the bottom of the
// world), placed in the underground structures' step. The ground round it is filled in solid (terrain_adaptation
// encapsulate), so the caves go round its walls. Its spawners' mobs are picked once for the whole structure (vanilla
// pool aliases): all its melee spawners are zombies, or husks, or spiders; its small melee ones slimes, cave spiders,
// silverfish or baby zombies; and its ranged and slow ranged ones skeletons, strays or the bogged, the same for both.
// The pieces are hand-drawn after vanilla's (trialChamberTemplates.ts); no game files are used.

import { JavaRandom } from '../../core/rng';
import { MIN_Y, MAX_Y } from '../constants';
import { OverworldRouter, newColumn } from './router';
import { SeedSource } from './noise';
import { B, pickSurfaceBiome, pickCaveBiome } from './biomes';
import type { GenContext } from './context';
import { POOLS, Box, beard, jigsawStart, jigsawAssemble, largeFeatureRandom, saltedRandom, worldSeed64, type Piece } from './jigsaw';
import type { Bury } from './stronghold';
import { legacyRandom, mthSeed, nextLong } from './trialChamberPieces';
import { START_POOL, ALIAS_BINDINGS, type AliasBinding } from './trialChamberTemplates';

// vanilla RandomSpreadStructurePlacement for trial_chambers (linear spread)
const SPACING = 34, SEPARATION = 12, SALT = 94251327;
// vanilla JigsawStructure trial_chambers: size 20, max_distance_from_center 116, start_height uniform -40..-20,
// dimension_padding 10, no expansion hack, liquid_settings ignore_waterlogging
const SIZE = 20, MAX_DISTANCE = 116, START_MIN = -40, START_MAX = -20, PADDING = 10;
/** vanilla ChunkGenerator.createReferences: a start is placed in the chunks within 8 of its own */
const REACH = 8;

/** the biomes a trial chambers start may be in: vanilla #has_structure/trial_chambers (#is_overworld but the deep dark) */
export function trialChambersBiome(b: number): boolean {
  return b !== B.deep_dark;
}

export interface TrialChambersTerrain {
  /** the biome at a quart, underground ones included (vanilla getNoiseBiome with its y) */
  biome(x: number, y: number, z: number): number;
}

export interface TrialChambersStub {
  /** the start chunk */
  cx: number;
  cz: number;
  /** the start piece's middle, at the start height (vanilla GenerationStub.position) */
  x: number;
  y: number;
  z: number;
}

export interface TrialChambersLayout {
  pieces: Piece[];
  /** all the pieces together */
  box: Box;
  /** the pools this one's aliases stand for (vanilla PoolAliasLookup) */
  aliases: Map<string, string>;
}

const floorDiv = (a: number, b: number) => Math.floor(a / b);

/**
 * vanilla PoolAliasLookup.create: a random of the world seed's forked at the start (the chunk's corner at the start
 * height) resolves each binding in turn
 */
export function resolveAliases(bindings: AliasBinding[], worldSeed: bigint, x: number, y: number, z: number): Map<string, string> {
  const fork = nextLong(legacyRandom(worldSeed));
  const r = legacyRandom(mthSeed(x, y, z) ^ fork);
  const out = new Map<string, string>();
  const pick = <T>(list: [T, number][]): T => {
    const total = list.reduce((a, [, w]) => a + w, 0);
    let k = r.nextInt(total);
    for (const [v, w] of list) if ((k -= w) < 0) return v;
    return list[list.length - 1][0];
  };
  const resolve = (b: AliasBinding): void => {
    if (b.kind === 'direct') out.set(b.alias, b.target);
    else if (b.kind === 'random') out.set(b.alias, pick(b.targets));
    else for (const g of pick(b.groups)) resolve(g);
  };
  for (const b of bindings) resolve(b);
  return out;
}

export class TrialChambers {
  private readonly stubs = new Map<number, TrialChambersStub | null>();
  private readonly built = new Map<number, TrialChambersLayout>();
  private readonly salt: number;

  constructor(private readonly seed: bigint, private readonly terrain: TrialChambersTerrain) {
    this.salt = Number(BigInt.asIntN(32, seed ^ (seed >> 32n))) ^ 0x7c4a3b;
  }

  /** vanilla RandomSpreadStructurePlacement.getPotentialStructureChunk (linear spread) */
  potentialChunk(rx: number, rz: number): [number, number] {
    const r = saltedRandom(this.seed, rx, rz, SALT);
    const i = r.nextInt(SPACING - SEPARATION), j = r.nextInt(SPACING - SEPARATION);
    return [rx * SPACING + i, rz * SPACING + j];
  }

  /**
   * vanilla JigsawStructure.findGenerationPoint up to the start piece: the start height (uniform, drawn first), then
   * JigsawPlacement.addPieces' turn and start element at the chunk's corner, lowered by its ground level delta
   */
  private start(cx: number, cz: number): { r: JavaRandom; height: number; start: NonNullable<ReturnType<typeof jigsawStart>> } | null {
    const r = largeFeatureRandom(this.seed, cx, cz);
    const height = START_MIN + r.nextInt(START_MAX - START_MIN + 1);
    const start = jigsawStart(POOLS.get(START_POOL)!, r, cx, cz, null);
    if (!start) return null;
    start.piece.move(height - (start.piece.box.minY + start.piece.groundLevelDelta));
    start.y = height;
    return { r, height, start };
  }

  /** a region's trial chambers, if it has one (vanilla StructurePlacement.isStructureChunk, then Structure.isValidBiome at the start) */
  stub(rx: number, rz: number): TrialChambersStub | null {
    const key = rx * 65536 + rz;
    const c = this.stubs.get(key);
    if (c !== undefined) return c;
    const [cx, cz] = this.potentialChunk(rx, rz);
    const s = this.start(cx, cz);
    const found = s && trialChambersBiome(this.terrain.biome(s.start.x, s.height, s.start.z)) ? { cx, cz, x: s.start.x, y: s.height, z: s.start.z } : null;
    this.stubs.set(key, found);
    return found;
  }

  /** the pieces of a region's trial chambers, laid out the first time they're wanted (vanilla JigsawPlacement.addPieces) */
  layout(rx: number, rz: number): TrialChambersLayout | null {
    const stub = this.stub(rx, rz);
    if (!stub) return null;
    const key = rx * 65536 + rz;
    let b = this.built.get(key);
    if (b) return b;
    if (this.built.size > 16) this.built.clear();
    const s = this.start(stub.cx, stub.cz)!;
    const aliases = resolveAliases(ALIAS_BINDINGS, this.seed, stub.cx * 16, s.height, stub.cz * 16);
    const pieces = jigsawAssemble(s.start, s.r, SIZE, MAX_DISTANCE, false, () => s.height, PADDING, (p) => aliases.get(p) ?? p);
    const box = new Box(Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity);
    for (const p of pieces) {
      box.minX = Math.min(box.minX, p.box.minX);
      box.minY = Math.min(box.minY, p.box.minY);
      box.minZ = Math.min(box.minZ, p.box.minZ);
      box.maxX = Math.max(box.maxX, p.box.maxX);
      box.maxY = Math.max(box.maxY, p.box.maxY);
      box.maxZ = Math.max(box.maxZ, p.box.maxZ);
    }
    b = { pieces, box, aliases };
    this.built.set(key, b);
    return b;
  }

  /** the regions whose start is within `reach` chunks of a chunk */
  private startsNear(cx: number, cz: number, reach = REACH): [number, number][] {
    const out: [number, number][] = [];
    for (let rx = floorDiv(cx - reach, SPACING); rx <= floorDiv(cx + reach, SPACING); rx++)
      for (let rz = floorDiv(cz - reach, SPACING); rz <= floorDiv(cz + reach, SPACING); rz++) {
        const s = this.stub(rx, rz);
        if (s && Math.abs(s.cx - cx) <= reach && Math.abs(s.cz - cz) <= reach) out.push([rx, rz]);
      }
    return out;
  }

  /** whether a trial chambers starts within 8 chunks (its pieces could reach this chunk): no layout needed */
  hasStartNear(cx: number, cz: number): boolean {
    return this.startsNear(cx, cz).length > 0;
  }

  /** the trial chambers whose pieces may be placed in a chunk */
  near(cx: number, cz: number): TrialChambersLayout[] {
    return this.startsNear(cx, cz).map(([rx, rz]) => this.layout(rx, rz)!);
  }

  /** vanilla StructureStart.placeInChunk: every piece reaching this chunk (each clipped to it) */
  place(ctx: GenContext): void {
    const chunk = new Box(ctx.x0, MIN_Y, ctx.z0, ctx.x0 + 15, MAX_Y - 1, ctx.z0 + 15);
    for (const { pieces } of this.near(ctx.cx, ctx.cz))
      for (const p of pieces) if (p.box.intersects(chunk)) p.element.place({ ctx, chunk, salt: this.salt }, p);
  }

  /**
   * vanilla Beardifier with TerrainAdjustment.ENCAPSULATE: round every piece within 12 blocks of the chunk the ground
   * is pushed toward solid, fully inside its box and fading out 12 blocks from it (getBuryContribution at half the
   * distance, times 0.8), and every junction eases it toward its height (the beard, times 0.4)
   */
  encapsulateFor(cx: number, cz: number): Bury | null {
    const x0 = cx * 16, z0 = cz * 16;
    const boxes: number[] = [], junctions: number[] = [];
    let minY = Infinity, maxY = -Infinity;
    for (const { pieces } of this.near(cx, cz))
      for (const p of pieces) {
        const b = p.box;
        if (!b.intersectsXZ(x0 - 12, z0 - 12, x0 + 15 + 12, z0 + 15 + 12)) continue;
        boxes.push(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
        minY = Math.min(minY, b.minY - 12);
        maxY = Math.max(maxY, b.maxY + 12);
        for (const j of p.junctions) {
          if (j.x <= x0 - 12 || j.z <= z0 - 12 || j.x >= x0 + 15 + 12 || j.z >= z0 + 15 + 12) continue;
          junctions.push(j.x, j.groundY, j.z);
          minY = Math.min(minY, j.groundY - 12);
          maxY = Math.max(maxY, j.groundY + 11);
        }
      }
    if (!boxes.length) return null;
    // (for speed: it's asked of every block) each of the chunk's columns keeps the boxes near enough to it, with the
    // square of how far off they are across, and the junctions whose kernel reaches it
    const colBoxes: Int32Array[] = [], colJunctions: Int32Array[] = [];
    for (let lz = 0; lz < 16; lz++)
      for (let lx = 0; lx < 16; lx++) {
        const x = x0 + lx, z = z0 + lz;
        const b: number[] = [], j: number[] = [];
        for (let n = 0; n < boxes.length; n += 6) {
          const m = Math.max(0, boxes[n] - x, x - boxes[n + 3]), k = Math.max(0, boxes[n + 2] - z, z - boxes[n + 5]);
          if (m < 12 && k < 12) b.push(boxes[n + 1], boxes[n + 4], m * m + k * k);
        }
        for (let n = 0; n < junctions.length; n += 3) {
          const dx = x - junctions[n], dz = z - junctions[n + 2];
          if (dx >= -12 && dx < 12 && dz >= -12 && dz < 12) j.push(dx, junctions[n + 1], dz);
        }
        colBoxes.push(Int32Array.from(b));
        colJunctions.push(Int32Array.from(j));
      }
    const column = (b: ArrayLike<number>, j: ArrayLike<number>, y: number): number => {
      let d = 0;
      for (let n = 0; n < b.length; n += 3) {
        const q = Math.max(0, b[n] - y, y - b[n + 1]);
        if (q >= 12) continue;
        // vanilla getBuryContribution(m / 2, q / 2, k / 2): 1 at the box, 0 six (half-)blocks out
        const len = Math.sqrt(b[n + 2] + q * q) / 2;
        if (len < 6) d += (1 - len / 6) * 0.8;
      }
      for (let n = 0; n < j.length; n += 3) {
        const l = y - j[n + 1];
        if (l >= -12 && l < 12) d += beard(j[n], l, j[n + 2], l) * 0.4;
      }
      return d;
    };
    return {
      minY: Math.max(minY, MIN_Y),
      maxY: Math.min(maxY, MAX_Y - 1),
      compute(x: number, y: number, z: number): number {
        const lx = x - x0, lz = z - z0;
        if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) return column(colBoxes[(lz << 4) | lx], colJunctions[(lz << 4) | lx], y);
        // (a block outside the chunk: worked out afresh)
        const b: number[] = [], j: number[] = [];
        for (let n = 0; n < boxes.length; n += 6) {
          const m = Math.max(0, boxes[n] - x, x - boxes[n + 3]), k = Math.max(0, boxes[n + 2] - z, z - boxes[n + 5]);
          if (m < 12 && k < 12) b.push(boxes[n + 1], boxes[n + 4], m * m + k * k);
        }
        for (let n = 0; n < junctions.length; n += 3) j.push(x - junctions[n], junctions[n + 1], z - junctions[n + 2]);
        return column(b, j, y);
      },
    };
  }

  /** vanilla StructureManager.getStructureWithPieceAt: whether a block is inside one of the pieces of a trial chambers */
  pieceAt(x: number, y: number, z: number): boolean {
    for (const { box, pieces } of this.near(x >> 4, z >> 4)) {
      if (!box.isInside(x, y, z)) continue;
      if (pieces.some((p) => p.box.isInside(x, y, z))) return true;
    }
    return false;
  }

  /** vanilla ChunkGenerator.getNearestGeneratedStructure for /locate (a random spread's rings): the start chunk's corner */
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

  /** every trial chambers start in a box of regions (for tests and the report) */
  stubsIn(rx0: number, rz0: number, rx1: number, rz1: number): TrialChambersStub[] {
    const out: TrialChambersStub[] = [];
    for (let rx = rx0; rx <= rx1; rx++)
      for (let rz = rz0; rz <= rz1; rz++) {
        const s = this.stub(rx, rz);
        if (s) out.push(s);
      }
    return out;
  }
}

/** the biome at a quart, underground ones included, from the noise alone (vanilla MultiNoiseBiomeSource.getNoiseBiome) */
export function quartBiome3d(router: OverworldRouter): (x: number, y: number, z: number) => number {
  return (x, y, z) => {
    const c = router.column(x & ~3, z & ~3, newColumn());
    const cave = pickCaveBiome(c.humidity, c.continents, c.erosion, router.depth(y & ~3, c));
    return cave >= 0 ? cave : pickSurfaceBiome(c.temperature, c.humidity, c.continents, c.erosion, c.ridges);
  };
}

/** trial chambers for the main thread (/locate, being in one): nothing but the biome noise is needed to lay them out */
export function trialChambersLocator(seed: string): TrialChambers {
  const router = new OverworldRouter(SeedSource.fromWorldSeed(seed));
  return new TrialChambers(worldSeed64(seed), { biome: quartBiome3d(router) });
}
