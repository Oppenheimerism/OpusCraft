// (bastions) Bastion remnants (vanilla structure minecraft:bastion_remnant, BastionPieces and its pools). They share
// the nether_complexes structure set with the fortresses: one of the two per 27 x 27-chunk region, a bastion three
// times in five, never in basalt deltas (vanilla #has_structure/bastion_remnant; the pick is fortress.ts's, so the
// fortresses stay where they were). A bastion is a jigsaw structure of 6 steps from the pool bastion/starts, whose
// four start pieces make the four kinds: housing units, hoglin stables, a treasure room and a bridge. Its start is
// set at y 33 whatever the ground (vanilla start_height absolute 33: the lava sea's level), it reaches at most 80
// blocks from its middle, and it goes in with the surface structures, before the ruined portals. No terrain
// adaptation: it hollows itself out of the netherrack and stands in the lava. The pieces are hand-drawn after
// vanilla's (bastionTemplates.ts and the four kinds' files); no game files are used.

import { MIN_Y, MAX_Y } from '../constants';
import type { GenContext } from './context';
import { POOLS, Box, jigsawStart, jigsawAssemble, largeFeatureRandom, type Piece } from './jigsaw';
import type { NetherFortresses } from './fortress';
import type { BastionPlaceCtx } from './bastionPieces';
import { START_POOL, variantOf, type BastionVariant } from './bastionTemplates';

/** the nether_complexes placement (fortress.ts has the pick): spacing 27 */
const SPACING = 27;
/** vanilla JigsawStructure bastion_remnant: size 6, start height absolute 33, max_distance_from_center 80 (the default) */
const SIZE = 6, START_Y = 33, MAX_DISTANCE = 80;
/** a start is placed in the chunks within this many of its own (80 blocks and the start chunk's own width) */
const REACH = 7;

export interface BastionStub {
  /** the start chunk */
  cx: number;
  cz: number;
  /** the start piece's middle, at the start height (vanilla GenerationStub.position) */
  x: number;
  y: number;
  z: number;
  /** which of the four kinds its start piece makes it */
  variant: BastionVariant;
}

export interface BastionLayout {
  stub: BastionStub;
  pieces: Piece[];
  /** all the pieces together */
  box: Box;
}

const floorDiv = (a: number, b: number) => Math.floor(a / b);

export class BastionRemnants {
  private readonly stubs = new Map<number, BastionStub | null>();
  private readonly built = new Map<number, BastionLayout>();
  private readonly salt: number;

  constructor(private readonly seed: bigint, private readonly complexes: NetherFortresses) {
    this.salt = Number(BigInt.asIntN(32, seed ^ (seed >> 32n))) ^ 0xba5710;
  }

  /**
   * vanilla JigsawPlacement.addPieces up to the start piece: a random turn and start element (of the four) at the
   * chunk's corner, set down so its floor (the element's ground level) is at y 33
   */
  private start(cx: number, cz: number) {
    const r = largeFeatureRandom(this.seed, cx, cz);
    const start = jigsawStart(POOLS.get(START_POOL)!, r, cx, cz, null);
    if (!start) return null;
    start.piece.move(START_Y - (start.piece.box.minY + start.piece.groundLevelDelta));
    start.y = START_Y;
    return { r, start };
  }

  /** a region's bastion, if the set picked one there (fortress.ts NetherFortresses.complexInRegion) */
  stub(rx: number, rz: number): BastionStub | null {
    const key = rx * 65536 + rz;
    const c = this.stubs.get(key);
    if (c !== undefined) return c;
    const pick = this.complexes.complexInRegion(rx, rz);
    let found: BastionStub | null = null;
    if (pick.kind === 'bastion_remnant') {
      const s = this.start(pick.cx, pick.cz);
      if (s) found = { cx: pick.cx, cz: pick.cz, x: s.start.x, y: START_Y, z: s.start.z, variant: variantOf(s.start.piece.element) };
    }
    if (this.stubs.size > 4096) this.stubs.clear();
    this.stubs.set(key, found);
    return found;
  }

  /** the pieces of a region's bastion, laid out the first time they're wanted (vanilla JigsawPlacement.addPieces) */
  layout(rx: number, rz: number): BastionLayout | null {
    const stub = this.stub(rx, rz);
    if (!stub) return null;
    const key = rx * 65536 + rz;
    let b = this.built.get(key);
    if (b) return b;
    if (this.built.size > 16) this.built.clear();
    const s = this.start(stub.cx, stub.cz)!;
    const pieces = jigsawAssemble(s.start, s.r, SIZE, MAX_DISTANCE, false, () => START_Y);
    const box = new Box(Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity);
    for (const p of pieces) {
      box.minX = Math.min(box.minX, p.box.minX);
      box.minY = Math.min(box.minY, p.box.minY);
      box.minZ = Math.min(box.minZ, p.box.minZ);
      box.maxX = Math.max(box.maxX, p.box.maxX);
      box.maxY = Math.max(box.maxY, p.box.maxY);
      box.maxZ = Math.max(box.maxZ, p.box.maxZ);
    }
    b = { stub, pieces, box };
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

  /** the bastions whose pieces may reach a chunk */
  near(cx: number, cz: number): BastionLayout[] {
    return this.startsNear(cx, cz).map(([rx, rz]) => this.layout(rx, rz)!);
  }

  /** vanilla StructureStart.placeInChunk: every piece reaching this chunk (each clipped to it), in the order laid out */
  place(ctx: GenContext): void {
    const chunk = new Box(ctx.x0, MIN_Y, ctx.z0, ctx.x0 + 15, MAX_Y - 1, ctx.z0 + 15);
    for (const { pieces, box } of this.near(ctx.cx, ctx.cz)) {
      if (!box.intersects(chunk)) continue;
      const pc: BastionPlaceCtx = { ctx, chunk, salt: this.salt, baseY: pieces[0].box.minY };
      for (const p of pieces) if (p.box.intersects(chunk)) p.element.place(pc, p);
    }
  }

  /** the bastion whose pieces hold a block, if any (vanilla StructureManager.getStructureWithPieceAt) */
  layoutAt(x: number, y: number, z: number): BastionLayout | null {
    for (const l of this.near(x >> 4, z >> 4)) {
      if (!l.box.isInside(x, y, z)) continue;
      if (l.pieces.some((p) => p.box.isInside(x, y, z))) return l;
    }
    return null;
  }

  /** whether a block is inside one of the pieces of a bastion */
  pieceAt(x: number, y: number, z: number): boolean {
    return this.layoutAt(x, y, z) !== null;
  }

  /** vanilla ChunkGenerator.getNearestGeneratedStructure for /locate (a random spread's rings): the start chunk's corner */
  nearest(x: number, z: number, radius = 100, variant: BastionVariant | null = null): [number, number] | null {
    const s = this.nearestStub(x, z, radius, variant);
    return s ? [s.cx * 16, s.cz * 16] : null;
  }

  /** the stub /locate finds (the first ring out with any), optionally only of one kind */
  nearestStub(x: number, z: number, radius = 100, variant: BastionVariant | null = null): BastionStub | null {
    const rx0 = floorDiv(x >> 4, SPACING), rz0 = floorDiv(z >> 4, SPACING);
    for (let ring = 0; ring <= radius; ring++)
      for (let i = -ring; i <= ring; i++)
        for (let j = -ring; j <= ring; j++) {
          if (i !== -ring && i !== ring && j !== -ring && j !== ring) continue;
          const s = this.stub(rx0 + i, rz0 + j);
          if (s && (!variant || s.variant === variant)) return s;
        }
    return null;
  }

  /** every bastion start in a box of regions (for tests and the report) */
  stubsIn(rx0: number, rz0: number, rx1: number, rz1: number): BastionStub[] {
    const out: BastionStub[] = [];
    for (let rx = rx0; rx <= rx1; rx++)
      for (let rz = rz0; rz <= rz1; rz++) {
        const s = this.stub(rx, rz);
        if (s) out.push(s);
      }
    return out;
  }
}
