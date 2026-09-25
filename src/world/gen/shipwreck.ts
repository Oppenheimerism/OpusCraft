// Shipwrecks (Stage 5: ocean; vanilla ShipwreckStructure and ShipwreckPieces): a wooden ship on the sea floor, or
// half buried in a beach, turned any of the four ways about (4, 0, 15). Twenty wrecks lie in the sea and eleven on
// beaches (vanilla's lists): the whole ship with its mast, or without it (a stump), its front or back half broken
// off, upside down or lying on its side, and each of those again rotted into holes. Up to three chests are aboard,
// each marked by the data marker above it: supplies in the bow's hold, treasure in the stern's, and the captain's
// maps in the cabin on the stern deck. Nothing is waterlogged (vanilla LiquidSettings.IGNORE_WATERLOGGING) and the
// hold keeps whatever it's sunk into. The ship is vanilla's shape as the game shows it, made here block by block
// (hull, ribs and keel, deck and hatches, rail, cabin and mast); no game files are used.

import { hash3, hashString, type Rand, type JavaRandom } from '../../core/rng';
import { blockOf } from '../block';
import { MAX_Y } from '../constants';
import type { GenContext } from './context';
import { TemplateBuilder, TemplatePiece, type BlockTemplate } from './templates';
import { parseState } from './jigsaw';

/** vanilla ShipwreckPieces.PIVOT */
export const SHIPWRECK_PIVOT: [number, number] = [4, 15];

/** vanilla ShipwreckPieces.STRUCTURE_LOCATION_OCEAN */
export const OCEAN_SHIPWRECKS = [
  'with_mast', 'upsidedown_full', 'upsidedown_fronthalf', 'upsidedown_backhalf', 'sideways_full', 'sideways_fronthalf', 'sideways_backhalf',
  'rightsideup_full', 'rightsideup_fronthalf', 'rightsideup_backhalf', 'with_mast_degraded', 'upsidedown_full_degraded',
  'upsidedown_fronthalf_degraded', 'upsidedown_backhalf_degraded', 'sideways_full_degraded', 'sideways_fronthalf_degraded',
  'sideways_backhalf_degraded', 'rightsideup_full_degraded', 'rightsideup_fronthalf_degraded', 'rightsideup_backhalf_degraded',
];

/** vanilla ShipwreckPieces.STRUCTURE_LOCATION_BEACHED */
export const BEACHED_SHIPWRECKS = [
  'with_mast', 'sideways_full', 'sideways_fronthalf', 'sideways_backhalf', 'rightsideup_full', 'rightsideup_fronthalf', 'rightsideup_backhalf',
  'with_mast_degraded', 'rightsideup_full_degraded', 'rightsideup_fronthalf_degraded', 'rightsideup_backhalf_degraded',
];

/** vanilla ShipwreckPieces.MARKERS_TO_LOOT */
const MARKERS_TO_LOOT: Record<string, string> = {
  map_chest: 'chests/shipwreck_map',
  treasure_chest: 'chests/shipwreck_treasure',
  supply_chest: 'chests/shipwreck_supply',
};

// ---------------------------------------------------------------------------------------------------------------
// The ship

/** the woods a wreck is built of: its hull's planks, its frame's logs, the trim (stairs, slabs, fences, trapdoors) */
interface ShipWoods {
  hull: string;
  frame: string;
  trim: string;
}

/** (each of vanilla's wrecks mixes its own woods) */
const WOODS: Record<string, ShipWoods> = {
  with_mast: { hull: 'spruce', frame: 'dark_oak', trim: 'spruce' },
  rightsideup_full: { hull: 'oak', frame: 'spruce', trim: 'oak' },
  rightsideup_fronthalf: { hull: 'jungle', frame: 'oak', trim: 'jungle' },
  rightsideup_backhalf: { hull: 'acacia', frame: 'dark_oak', trim: 'acacia' },
  upsidedown_full: { hull: 'dark_oak', frame: 'oak', trim: 'dark_oak' },
  upsidedown_fronthalf: { hull: 'spruce', frame: 'jungle', trim: 'spruce' },
  upsidedown_backhalf: { hull: 'birch', frame: 'spruce', trim: 'birch' },
  sideways_full: { hull: 'spruce', frame: 'birch', trim: 'spruce' },
  sideways_fronthalf: { hull: 'oak', frame: 'acacia', trim: 'oak' },
  sideways_backhalf: { hull: 'jungle', frame: 'spruce', trim: 'jungle' },
};

const WIDTH = 9, MID = 4, LENGTH = 28, DECK = 5, CABIN_Z0 = 21, CABIN_Z1 = 26, MAST_Z = 13;
/** where the two halves part */
const HALF = 14;

/** how far out from the middle line the hull reaches at height y and along z (-1: no hull there); the bow rises */
function halfWidth(y: number, z: number): number {
  if (z < 0 || z >= LENGTH) return -1;
  const bottom = z <= 1 ? 3 : z <= 3 ? 2 : z === 4 || z === LENGTH - 1 ? 1 : 0;
  if (y < bottom || y > DECK) return -1;
  const byY = [1, 2, 3, 4, 4, 4][y];
  const byZ = z === 0 ? 0 : z <= 2 ? 1 : z === 3 ? 2 : z <= 5 ? 3 : z === LENGTH - 1 ? 3 : 4;
  return Math.min(byY, byZ);
}

const inHull = (x: number, y: number, z: number): boolean => {
  const w = halfWidth(y, z);
  return w >= 0 && Math.abs(x - MID) <= w;
};

interface ShipChest {
  x: number;
  y: number;
  z: number;
  facing: 'north' | 'south';
  marker: string;
}

/**
 * the whole ship, bow to the north: a hull of planks on ribs of logs every five blocks and a log keel, a deck with two
 * hatches, a rail of fences, a stem post at the bow, a cabin of planks under a slab roof on the stern deck, and the
 * mast (or the stump of it) through the middle; the chests are kept aside to be put in at the end
 */
function buildShip(w: ShipWoods, mast: boolean): { b: TemplateBuilder; chests: ShipChest[] } {
  const b = new TemplateBuilder(WIDTH, mast ? 21 : 10, LENGTH);
  const planks = `${w.hull}_planks`;
  const logY = `${w.frame}_log[axis=y]`, logZ = `${w.frame}_log[axis=z]`, logX = `${w.frame}_log[axis=x]`;
  const fence = `${w.trim}_fence`, slab = `${w.trim}_slab[type=bottom]`, slabTop = `${w.trim}_slab[type=top]`;
  for (let z = 0; z < LENGTH; z++)
    for (let y = 0; y <= DECK; y++)
      for (let x = 0; x < WIDTH; x++) {
        if (!inHull(x, y, z)) continue;
        const hw = halfWidth(y, z);
        if (y === DECK) {
          b.set(x, y, z, planks);
          continue;
        }
        const side = Math.abs(x - MID) === hw;
        const shell = side || !inHull(x, y - 1, z) || !inHull(x, y, z - 1) || !inHull(x, y, z + 1);
        if (!shell) continue;
        // the keel along the bottom's middle, the ribs up the sides
        if (x === MID && !inHull(x, y - 1, z)) b.set(x, y, z, logZ);
        else if (side && z % 5 === 2 && y >= 1) b.set(x, y, z, logY);
        else b.set(x, y, z, planks);
      }
  // the hatches, shut
  for (const z of [9, 18]) b.set(MID, DECK, z, `${w.trim}_trapdoor[facing=south,half=top]`);
  // the rail round the deck, but for the cabin's walls and the stem
  for (let z = 0; z < LENGTH; z++)
    for (let x = 0; x < WIDTH; x++) {
      if (!inHull(x, DECK, z)) continue;
      const edge = Math.abs(x - MID) === halfWidth(DECK, z) || !inHull(x, DECK, z - 1) || !inHull(x, DECK, z + 1);
      const cabin = z >= CABIN_Z0 && z <= CABIN_Z1 && x >= 1 && x <= 7;
      if (edge && !cabin) b.set(x, DECK + 1, z, fence);
    }
  // the stem post at the bow
  b.set(MID, DECK + 1, 0, logY).set(MID, DECK + 2, 0, fence);
  // the cabin: plank walls between log corners, a door toward the bow, fence windows, a slab roof
  for (let z = CABIN_Z0; z <= CABIN_Z1; z++)
    for (let x = 1; x <= 7; x++)
      for (let y = DECK + 1; y <= DECK + 3; y++) {
        const wx = x === 1 || x === 7, wz = z === CABIN_Z0 || z === CABIN_Z1;
        if (!wx && !wz) continue;
        b.set(x, y, z, wx && wz ? logY : planks);
      }
  b.set(MID, DECK + 1, CABIN_Z0, null).set(MID, DECK + 2, CABIN_Z0, null);
  for (const [x, z] of [[1, 23], [1, 24], [7, 23], [7, 24], [3, CABIN_Z1], [5, CABIN_Z1]]) b.set(x, DECK + 2, z, fence);
  b.fill(1, DECK + 4, CABIN_Z0, 7, DECK + 4, CABIN_Z1, slab);
  // the mast, from the keel up through the deck, with its yard and a small top; or what's left of it
  if (mast) {
    b.fill(MID, 1, MAST_Z, MID, 19, MAST_Z, logY);
    for (let x = 1; x <= 7; x++) if (x !== MID) b.set(x, 15, MAST_Z, logX);
    for (const [x, z] of [[MID - 1, MAST_Z], [MID + 1, MAST_Z], [MID, MAST_Z - 1], [MID, MAST_Z + 1]]) b.set(x, 18, z, slabTop);
    b.set(MID, 20, MAST_Z, fence);
  } else b.fill(MID, 1, MAST_Z, MID, DECK + 2, MAST_Z, logY);
  const chests: ShipChest[] = [
    { x: MID, y: 1, z: 7, facing: 'south', marker: 'supply_chest' },
    { x: MID, y: 1, z: 22, facing: 'north', marker: 'treasure_chest' },
    { x: 2, y: DECK + 1, z: 25, facing: 'north', marker: 'map_chest' },
  ];
  return { b, chests };
}

/** a block the same with its top and bottom swapped (stairs, slabs, trapdoors) */
function flipState(st: number): number {
  const blk = blockOf(st);
  if (blk.propIndex('half') >= 0) return blk.with(st, 'half', blk.get(st, 'half') === 'top' ? 'bottom' : 'top');
  if (blk.propIndex('type') >= 0 && blk.name.endsWith('_slab')) {
    const t = blk.get(st, 'type');
    return t === 'double' ? st : blk.with(st, 'type', t === 'top' ? 'bottom' : 'top');
  }
  return st;
}

/**
 * a block rolled a quarter turn onto its side (x becoming up): logs lie the other way; stairs become their wood's
 * planks; slabs, fences and trapdoors, which can't lie on their side, are gone
 */
function rollState(st: number): number | null {
  const blk = blockOf(st);
  if (blk.name.endsWith('_log')) {
    const a = blk.get(st, 'axis');
    return a === 'z' ? st : blk.with(st, 'axis', a === 'x' ? 'y' : 'x');
  }
  if (blk.name.endsWith('_stairs')) return parseState(blk.name.replace(/_stairs$/, '_planks'));
  if (/_(slab|fence|trapdoor)$/.test(blk.name)) return null;
  return st;
}

/** vanilla's wreck of this name, made from the ship */
function buildShipwreck(name: string): BlockTemplate {
  const degraded = name.endsWith('_degraded');
  const base = name.replace(/_degraded$/, '');
  const [pose, part = 'full'] = base === 'with_mast' ? ['with_mast', 'full'] : base.split('_');
  let { b, chests } = buildShip(WOODS[base], pose === 'with_mast');
  // the half broken off: the front ends before the stern's half starts, which is moved up to the bow's place
  if (part !== 'full') {
    const front = part === 'fronthalf';
    const out = new TemplateBuilder(b.sx, b.sy, HALF);
    b.forEach((x, y, z, st) => {
      if (front ? z < HALF : z >= HALF) out.set(x, y, front ? z : z - HALF, st);
    });
    chests = chests.filter((c) => (front ? c.z < HALF : c.z >= HALF)).map((c) => ({ ...c, z: front ? c.z : c.z - HALF }));
    b = out;
  }
  // upside down: turned over along its length, keel up; lying on its side: rolled onto its port side
  if (pose === 'upsidedown') {
    const out = new TemplateBuilder(b.sx, b.sy, b.sz);
    b.forEach((x, y, z, st) => out.set(x, b.sy - 1 - y, z, flipState(st)));
    chests = chests.map((c) => ({ ...c, y: b.sy - 1 - c.y }));
    b = out;
  } else if (pose === 'sideways') {
    const out = new TemplateBuilder(b.sy, b.sx, b.sz);
    b.forEach((x, y, z, st) => {
      const s = rollState(st);
      if (s !== null) out.set(y, WIDTH - 1 - x, z, s);
    });
    chests = chests.map((c) => ({ ...c, x: c.y, y: WIDTH - 1 - c.x }));
    b = out;
  }
  // rotted: about a quarter of it gone, in holes (the same holes every time)
  if (degraded) {
    const seed = hashString(name);
    const gone: [number, number, number][] = [];
    b.forEach((x, y, z) => {
      // (in patches: a cell goes with its neighbours often enough to leave holes rather than a sieve)
      const patch = hash3(x >> 1, y >> 1, z >> 1, seed) % 5;
      if (hash3(x, y, z, seed ^ 0x5bd1e995) % 100 < (patch === 0 ? 70 : 12)) gone.push([x, y, z]);
    });
    for (const [x, y, z] of gone) b.set(x, y, z, null);
  }
  // the chests, each settled onto whatever is under it, and its marker over it
  for (const c of chests) {
    let y = c.y;
    while (y > 0 && b.get(c.x, y - 1, c.z) === 0) y--;
    b.set(c.x, y, c.z, `chest[facing=${c.facing}]`);
    b.marker(c.x, y + 1, c.z, c.marker);
  }
  return b.build(`shipwreck/${name}`);
}

const TEMPLATES = new Map<string, BlockTemplate>();

/** one of vanilla's shipwreck templates, made the first time it's wanted */
export function shipwreckTemplate(name: string): BlockTemplate {
  let t = TEMPLATES.get(name);
  if (!t) {
    t = buildShipwreck(name);
    TEMPLATES.set(name, t);
  }
  return t;
}

// ---------------------------------------------------------------------------------------------------------------
// The piece

/** vanilla ShipwreckPieces.ShipwreckPiece */
export class ShipwreckPiece extends TemplatePiece {
  constructor(template: BlockTemplate, x: number, y: number, z: number, rot: number, worldSeed: bigint, readonly beached: boolean) {
    super(template, x, y, z, { rot, pivot: SHIPWRECK_PIVOT, integrity: 1, waterlog: false }, worldSeed);
  }

  /** vanilla handleDataMarker: the chest under a marker gets the marker's loot table */
  protected handleDataMarker(name: string, x: number, y: number, z: number, ctx: GenContext, r: Rand): void {
    const table = MARKERS_TO_LOOT[name];
    if (!table) return;
    const be = ctx.blockEntities.find((e) => e.id === 'chest' && e.x === x && e.y === y - 1 && e.z === z);
    if (be) be.data = { lootTable: table, lootSeed: r.nextU32() };
  }
}

export interface ShipwreckTerrain {
  /** vanilla WORLD_SURFACE_WG */
  firstFreeHeight(x: number, z: number): number;
  /** vanilla OCEAN_FLOOR_WG */
  oceanFloorHeight(x: number, z: number): number;
}

/**
 * vanilla ShipwreckStructure.generatePieces and ShipwreckPieces.addRandomPiece: a random turn and a random wreck
 * from the start chunk's corner, then (vanilla ShipwreckPiece.postProcess, worked out once here rather than by each
 * chunk) its height from the ground under its unturned footprint: in the sea, the average ocean floor; on a beach,
 * the lowest surface, less half the wreck's height and 0-2 more
 */
export function shipwreckPiece(worldSeed: bigint, r: JavaRandom, x0: number, z0: number, beached: boolean, terrain: ShipwreckTerrain): ShipwreckPiece {
  const rot = r.nextInt(4);
  const list = beached ? BEACHED_SHIPWRECKS : OCEAN_SHIPWRECKS;
  const t = shipwreckTemplate(list[r.nextInt(list.length)]);
  let sum = 0, low = MAX_Y;
  for (let z = z0; z < z0 + t.sz; z++)
    for (let x = x0; x < x0 + t.sx; x++) {
      const h = beached ? terrain.firstFreeHeight(x, z) : terrain.oceanFloorHeight(x, z);
      sum += h;
      low = Math.min(low, h);
    }
  const y = beached ? low - Math.trunc(t.sy / 2) - r.nextInt(3) : Math.trunc(sum / (t.sx * t.sz));
  return new ShipwreckPiece(t, x0, y, z0, rot, worldSeed, beached);
}
