// Nether portals: the frame check (vanilla PortalShape), finding the portal on
// the other side through its point-of-interest records (vanilla PoiManager /
// PortalForcer.findClosestPortalPosition), building one when there's none
// (PortalForcer.createPortal), and where an entity comes out
// (NetherPortalBlock.getDimensionTransitionFromExit).

import type { World } from '../world/world';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_REPLACEABLE, F_WATER, F_LAVA, F_WATERLOGGED, S, getBlock } from '../world/block';
import { isSolidBlock } from '../world/gen/patches';
import type { DimensionId, DimensionType } from '../world/dimension';

export type HAxis = 'x' | 'z';

/** a portal's rectangle: its lowest corner, how wide along its axis and how tall */
export interface PortalRect {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
}

let IDS: { obsidian: number; portal: number; fire: number; soulFire: number } | null = null;
function ids() {
  return (IDS ??= {
    obsidian: BLOCKS.findIndex((b) => b.name === 'obsidian'),
    portal: BLOCKS.findIndex((b) => b.name === 'nether_portal'),
    fire: BLOCKS.findIndex((b) => b.name === 'fire'),
    soulFire: BLOCKS.findIndex((b) => b.name === 'soul_fire'),
  });
}

const blockId = (st: number) => STATE_BLOCK[st];
export const isPortal = (st: number): boolean => blockId(st) === ids().portal;
const isObsidian = (st: number) => blockId(st) === ids().obsidian;

export function portalState(axis: HAxis): number {
  const b = getBlock('nether_portal');
  return b.with(b.defaultState, 'axis', axis);
}

export function portalAxis(st: number): HAxis {
  return BLOCKS[STATE_BLOCK[st]].get<string>(st, 'axis') === 'z' ? 'z' : 'x';
}

/** vanilla PortalShape.isEmpty: air, fire, or portal already */
function emptyForPortal(st: number): boolean {
  const id = blockId(st);
  return (FLAGS[st] & F_AIR) !== 0 || id === ids().fire || (id === ids().soulFire && id >= 0) || id === ids().portal;
}

/** vanilla PortalShape: an obsidian frame 2..21 wide and 3..21 tall around empty space (the corners don't matter) */
export class PortalShape {
  /** vanilla rightDir: west along x, south along z */
  private readonly rx: number;
  private readonly rz: number;
  bottomLeft: [number, number, number] | null;
  width = 0;
  height = 0;
  portalBlocks = 0;

  constructor(private readonly world: World, x: number, y: number, z: number, readonly axis: HAxis, minY: number) {
    this.rx = axis === 'x' ? -1 : 0;
    this.rz = axis === 'x' ? 0 : 1;
    this.bottomLeft = this.findBottomLeft(x, y, z, minY);
    if (!this.bottomLeft) {
      this.bottomLeft = [x, y, z];
      this.width = 1;
      this.height = 1;
    } else {
      this.width = this.findWidth();
      if (this.width > 0) this.height = this.findHeight();
    }
  }

  private get(x: number, y: number, z: number): number {
    return this.world.getState(x, y, z);
  }

  private findBottomLeft(x: number, y: number, z: number, minY: number): [number, number, number] | null {
    const lo = Math.max(minY, y - 21);
    while (y > lo && emptyForPortal(this.get(x, y - 1, z))) y--;
    // towards the left (the opposite of rightDir)
    const d = this.distanceToEdge(x, y, z, -this.rx, -this.rz) - 1;
    return d < 0 ? null : [x - this.rx * d, y, z - this.rz * d];
  }

  /** vanilla getDistanceUntilEdgeAboveFrame: empty spaces over obsidian, up to the obsidian side */
  private distanceToEdge(x: number, y: number, z: number, dx: number, dz: number): number {
    for (let i = 0; i <= 21; i++) {
      const px = x + dx * i, pz = z + dz * i;
      const st = this.get(px, y, pz);
      if (!emptyForPortal(st)) return isObsidian(st) ? i : 0;
      if (!isObsidian(this.get(px, y - 1, pz))) break;
    }
    return 0;
  }

  private findWidth(): number {
    const [x, y, z] = this.bottomLeft!;
    const w = this.distanceToEdge(x, y, z, this.rx, this.rz);
    return w >= 2 && w <= 21 ? w : 0;
  }

  private findHeight(): number {
    const [x, y, z] = this.bottomLeft!;
    let h = 21;
    outer: for (let i = 0; i < 21; i++) {
      if (!isObsidian(this.get(x - this.rx, y + i, z - this.rz))) {
        h = i;
        break;
      }
      if (!isObsidian(this.get(x + this.rx * this.width, y + i, z + this.rz * this.width))) {
        h = i;
        break;
      }
      for (let j = 0; j < this.width; j++) {
        const st = this.get(x + this.rx * j, y + i, z + this.rz * j);
        if (!emptyForPortal(st)) {
          h = i;
          break outer;
        }
        if (isPortal(st)) this.portalBlocks++;
      }
    }
    if (h < 3 || h > 21) return 0;
    // the top of the frame
    for (let j = 0; j < this.width; j++) if (!isObsidian(this.get(x + this.rx * j, y + h, z + this.rz * j))) return 0;
    return h;
  }

  isValid(): boolean {
    return this.width >= 2 && this.width <= 21 && this.height >= 3 && this.height <= 21;
  }

  isComplete(): boolean {
    return this.isValid() && this.portalBlocks === this.width * this.height;
  }

  /** vanilla createPortalBlocks: fill the frame (without neighbour updates) */
  createPortalBlocks(): void {
    const [x, y, z] = this.bottomLeft!;
    const st = portalState(this.axis);
    for (let i = 0; i < this.height; i++) for (let j = 0; j < this.width; j++) this.world.setState(x + this.rx * j, y + i, z + this.rz * j, st);
  }

  /** vanilla findEmptyPortalShape: a valid frame with no portal in it yet, along `axis` or else the other way */
  static findEmpty(world: World, x: number, y: number, z: number, axis: HAxis, minY: number): PortalShape | null {
    for (const a of [axis, axis === 'x' ? 'z' : 'x'] as HAxis[]) {
      const s = new PortalShape(world, x, y, z, a, minY);
      if (s.isValid() && s.portalBlocks === 0) return s;
    }
    return null;
  }
}

/** vanilla BaseFireBlock.isPortal: could fire lit at (x, y, z) open a portal? (obsidian beside it, an empty frame round it) */
export function fireCouldOpenPortal(world: World, dim: DimensionType, x: number, y: number, z: number, face: string, random: () => number): boolean {
  if (dim.id !== 'overworld' && dim.id !== 'the_nether') return false;
  const next: [number, number, number][] = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
  if (!next.some(([dx, dy, dz]) => isObsidian(world.getState(x + dx, y + dy, z + dz)))) return false;
  // vanilla: the axis across the clicked face, or a random one for a top or bottom
  const axis: HAxis = face === 'north' || face === 'south' ? 'x' : face === 'west' || face === 'east' ? 'z' : random() < 0.5 ? 'x' : 'z';
  return PortalShape.findEmpty(world, x, y, z, axis, dim.minY) !== null;
}

/** vanilla BaseFireBlock.onPlace: new fire in an empty obsidian frame becomes a portal */
export function tryLightPortal(world: World, dim: DimensionType, x: number, y: number, z: number): boolean {
  if (dim.id !== 'overworld' && dim.id !== 'the_nether') return false;
  const s = PortalShape.findEmpty(world, x, y, z, 'x', dim.minY);
  if (!s) return false;
  s.createPortalBlocks();
  return true;
}

/** vanilla NetherPortalBlock.updateShape: does the portal at (x, y, z) still have its whole frame? */
export function portalStillStands(world: World, x: number, y: number, z: number, st: number, minY: number): boolean {
  return new PortalShape(world, x, y, z, portalAxis(st), minY).isComplete();
}

/** vanilla BlockUtil.getLargestRectangleAround, for the portal block at (x, y, z): the rectangle of like blocks round it */
export function portalRectangle(world: World, x: number, y: number, z: number): PortalRect {
  const st = world.getState(x, y, z);
  const axis = portalAxis(st);
  const ax = axis === 'x' ? 1 : 0, az = axis === 'z' ? 1 : 0;
  const same = (px: number, py: number, pz: number) => world.getState(px, py, pz) === st;
  let x0 = x, z0 = z, y0 = y;
  for (let i = 0; i < 21 && same(x0 - ax, y, z0 - az); i++) {
    x0 -= ax;
    z0 -= az;
  }
  for (let i = 0; i < 21 && same(x0, y0 - 1, z0); i++) y0--;
  let width = 1, height = 1;
  while (width < 21 && same(x0 + ax * width, y0, z0 + az * width)) width++;
  while (height < 21 && same(x0, y0 + height, z0)) height++;
  return { x: x0, y: y0, z: z0, width, height };
}

/**
 * vanilla PortalShape.getRelativePosition: where in its portal an entity stands, as (0..1 across, 0..1 up,
 * offset through the portal's plane)
 */
export function relativePortalPosition(rect: PortalRect, axis: HAxis, px: number, py: number, pz: number, w: number, h: number): [number, number, number] {
  const d = rect.width - w, e = rect.height - h;
  const along = axis === 'x' ? px : pz, lo = axis === 'x' ? rect.x : rect.z;
  const g = d > 0 ? Math.min(1, Math.max(0, (along - (lo + w / 2)) / d)) : 0.5;
  const f = e > 0 ? Math.min(1, Math.max(0, (py - rect.y) / e)) : 0;
  const across = axis === 'x' ? pz - (rect.z + 0.5) : px - (rect.x + 0.5);
  return [g, f, across];
}

/** vanilla NetherPortalBlock.createDimensionTransition: the spot in `rect` matching the entry, and the turn */
export function portalExit(
  rect: PortalRect, exitAxis: HAxis, entryAxis: HAxis, rel: [number, number, number], w: number, h: number,
): { x: number; y: number; z: number; turn: number } {
  const turn = entryAxis === exitAxis ? 0 : 90;
  const f = w / 2 + (rect.width - w) * rel[0];
  const g = (rect.height - h) * rel[1];
  const across = 0.5 + rel[2];
  const alongX = exitAxis === 'x';
  return { x: rect.x + (alongX ? f : across), y: rect.y + g, z: rect.z + (alongX ? across : f), turn };
}

// ---------------------------------------------------------------------------
// Point-of-interest records for portal blocks (vanilla PoiManager), per dimension

export class PortalPoi {
  private readonly sets: Record<string, Set<string>> = {};

  private set(dim: DimensionId): Set<string> {
    return (this.sets[dim] ??= new Set());
  }

  changed(dim: DimensionId, x: number, y: number, z: number, present: boolean): void {
    const k = `${x},${y},${z}`;
    if (present) this.set(dim).add(k);
    else this.set(dim).delete(k);
  }

  /** vanilla findClosestPortalPosition: within a square of `radius` round (x, z), the nearest (then the lowest) */
  closest(dim: DimensionId, x: number, y: number, z: number, radius: number, skip?: Set<string>): [number, number, number] | null {
    let best: [number, number, number] | null = null, bestD = Infinity;
    for (const k of this.set(dim)) {
      if (skip?.has(k)) continue;
      const [px, py, pz] = k.split(',').map(Number);
      if (Math.abs(px - x) > radius || Math.abs(pz - z) > radius) continue;
      const d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
      if (d < bestD || (d === bestD && best && py < best[1])) {
        bestD = d;
        best = [px, py, pz];
      }
    }
    return best;
  }

  save(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    for (const [dim, s] of Object.entries(this.sets)) out[dim] = [...s].flatMap((k) => k.split(',').map(Number));
    return out;
  }

  load(data: Record<string, number[]> | undefined): void {
    for (const k of Object.keys(this.sets)) delete this.sets[k];
    if (!data) return;
    for (const [dim, a] of Object.entries(data)) {
      const s = this.set(dim as DimensionId);
      for (let i = 0; i + 2 < a.length; i += 3) s.add(`${a[i]},${a[i + 1]},${a[i + 2]}`);
    }
  }
}

// ---------------------------------------------------------------------------
// vanilla PortalForcer.createPortal

const replaceableHere = (st: number) => ((FLAGS[st] & (F_AIR | F_REPLACEABLE)) !== 0) && !(FLAGS[st] & (F_WATER | F_LAVA | F_WATERLOGGED));

/**
 * A new portal near (x, y, z): the closest spot (spiralling out 16 blocks) with room for the frame and
 * solid ground under it — preferring room for a 3 wide platform — else a platform of obsidian built in the air.
 */
export function createPortal(world: World, dim: DimensionType, x: number, y: number, z: number, axis: HAxis): PortalRect {
  const sx = axis === 'x' ? 1 : 0, sz = axis === 'z' ? 1 : 0;
  // (the clockwise turn of the positive axis direction)
  const cx = axis === 'x' ? 0 : -1, cz = axis === 'x' ? 1 : 0;
  const top = Math.min(dim.maxY, dim.minY + dim.logicalHeight) - 1;
  const get = (px: number, py: number, pz: number) => world.getState(px, py, pz);
  const canHostFrame = (bx: number, by: number, bz: number, off: number) => {
    for (let i = -1; i < 3; i++)
      for (let j = -1; j < 4; j++) {
        const px = bx + sx * i + cx * off, py = by + j, pz = bz + sz * i + cz * off;
        const st = get(px, py, pz);
        if (j < 0 && !isSolidBlock(st)) return false;
        if (j >= 0 && !replaceableHere(st)) return false;
      }
    return true;
  };
  let best: [number, number, number] | null = null, bestD = -1;
  let fallback: [number, number, number] | null = null, fallbackD = -1;
  for (const [px, pz] of spiral(x, z, 16)) {
    const h = Math.min(top, world.heightAt(px, pz));
    const bx = px, bz = pz;
    for (let l = h; l >= dim.minY; l--) {
      if (!replaceableHere(get(bx, l, bz))) continue;
      const m = l;
      while (l > dim.minY && replaceableHere(get(bx, l - 1, bz))) l--;
      if (l + 4 > top) continue;
      const n = m - l;
      if (n > 0 && n < 3) continue;
      if (!canHostFrame(bx, l, bz, 0)) continue;
      const d = (bx - x) ** 2 + (l - y) ** 2 + (bz - z) ** 2;
      if (canHostFrame(bx, l, bz, -1) && canHostFrame(bx, l, bz, 1) && (bestD < 0 || bestD > d)) {
        bestD = d;
        best = [bx, l, bz];
      }
      if (bestD < 0 && (fallbackD < 0 || fallbackD > d)) {
        fallbackD = d;
        fallback = [bx, l, bz];
      }
    }
  }
  if (!best && fallback) best = fallback;
  const OBSIDIAN = S('obsidian');
  if (!best) {
    // nowhere: a platform of obsidian with room above it, somewhere between 70 and 9 under the top
    const lo = Math.max(dim.minY + 1, 70), hi = top - 9;
    best = [x - sx, Math.min(hi, Math.max(lo, y)), z - sz];
    for (let l = -1; l < 2; l++)
      for (let m = 0; m < 2; m++)
        for (let n = -1; n < 3; n++) world.setState(best[0] + m * sx + l * cx, best[1] + n, best[2] + m * sz + l * cz, n < 0 ? OBSIDIAN : 0);
  }
  const [bx, by, bz] = best;
  for (let o = -1; o < 3; o++)
    for (let p = -1; p < 4; p++) if (o === -1 || o === 2 || p === -1 || p === 3) world.setState(bx + o * sx, by + p, bz + o * sz, OBSIDIAN);
  const st = portalState(axis);
  for (let o = 0; o < 2; o++) for (let p = 0; p < 3; p++) world.setState(bx + o * sx, by + p, bz + o * sz, st);
  return { x: bx, y: by, z: bz, width: 2, height: 3 };
}

/** vanilla BlockPos.spiralAround(center, radius, EAST, SOUTH): the centre, then square rings outwards */
function* spiral(x: number, z: number, radius: number): Generator<[number, number]> {
  const dirs: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let cx = x, cz = z + 1;
  let leg = -1, legSize = 0, legIndex = 0;
  const legs = 4 * radius;
  for (;;) {
    const [dx, dz] = dirs[(leg + 4) % 4];
    cx += dx;
    cz += dz;
    if (legIndex >= legSize) {
      if (leg >= legs) return;
      leg++;
      legIndex = 0;
      legSize = (leg >> 1) + 1;
    }
    legIndex++;
    yield [cx, cz];
  }
}
