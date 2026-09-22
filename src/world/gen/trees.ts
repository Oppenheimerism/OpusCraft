// Tree generators modelled on vanilla trunk & foliage placers.

import { Rand } from '../../core/rng';
import { S, getBlock, blockOf, FLAGS, F_AIR, F_REPLACEABLE, F_LEAVES, F_WATER } from '../block';
import { GenContext, W_LOG, W_REPLACEABLE, W_ANY } from './context';

export type TreeKind =
  | 'oak' | 'fancy_oak' | 'birch' | 'tall_birch' | 'spruce' | 'pine' | 'mega_spruce' | 'mega_pine'
  | 'jungle' | 'jungle_bush' | 'mega_jungle' | 'acacia' | 'dark_oak' | 'swamp_oak' | 'cherry';

interface TreeBlocks {
  log: string;
  leaves: string;
}

const WOOD: Record<TreeKind, TreeBlocks> = {
  oak: { log: 'oak_log', leaves: 'oak_leaves' },
  fancy_oak: { log: 'oak_log', leaves: 'oak_leaves' },
  birch: { log: 'birch_log', leaves: 'birch_leaves' },
  tall_birch: { log: 'birch_log', leaves: 'birch_leaves' },
  spruce: { log: 'spruce_log', leaves: 'spruce_leaves' },
  pine: { log: 'spruce_log', leaves: 'spruce_leaves' },
  mega_spruce: { log: 'spruce_log', leaves: 'spruce_leaves' },
  mega_pine: { log: 'spruce_log', leaves: 'spruce_leaves' },
  jungle: { log: 'jungle_log', leaves: 'jungle_leaves' },
  jungle_bush: { log: 'jungle_log', leaves: 'oak_leaves' },
  mega_jungle: { log: 'jungle_log', leaves: 'jungle_leaves' },
  acacia: { log: 'acacia_log', leaves: 'acacia_leaves' },
  dark_oak: { log: 'dark_oak_log', leaves: 'dark_oak_leaves' },
  swamp_oak: { log: 'oak_log', leaves: 'oak_leaves' },
  cherry: { log: 'cherry_log', leaves: 'cherry_leaves' },
};

/** Collects tree blocks, then commits to the context (so a tree can be rejected). */
class TreeBuilder {
  logs = new Map<string, [number, number, number, number]>();
  leaves = new Map<string, [number, number, number]>();
  constructor(readonly ctx: GenContext, readonly logState: (axis: string) => number, readonly leafBase: number) {}

  isFree(x: number, y: number, z: number): boolean {
    const s = this.ctx.get(x, y, z);
    if (s < 0) return true; // unknown (neighbour chunk): optimistic
    const f = FLAGS[s];
    return (f & (F_AIR | F_REPLACEABLE | F_LEAVES)) !== 0 && !(f & F_WATER) || (f & F_LEAVES) !== 0;
  }

  log(x: number, y: number, z: number, axis = 'y'): void {
    this.logs.set(`${x},${y},${z}`, [x, y, z, this.logState(axis)]);
    this.leaves.delete(`${x},${y},${z}`);
  }

  leaf(x: number, y: number, z: number): void {
    const k = `${x},${y},${z}`;
    if (this.logs.has(k)) return;
    const s = this.ctx.get(x, y, z);
    if (s >= 0) {
      const f = FLAGS[s];
      if (!((f & (F_AIR | F_REPLACEABLE)) && !(f & F_WATER))) return;
    }
    this.leaves.set(k, [x, y, z]);
  }

  /** leaves row helper (vanilla placeLeavesRow) */
  row(cx: number, cy: number, cz: number, range: number, localY: number, large: boolean, skip: (dx: number, dy: number, dz: number, range: number) => boolean, signed = false): void {
    const ext = large ? 1 : 0;
    for (let dx = -range; dx <= range + ext; dx++)
      for (let dz = -range; dz <= range + ext; dz++) {
        const ax = signed ? dx : large ? Math.min(Math.abs(dx), Math.abs(dx - 1)) : Math.abs(dx);
        const az = signed ? dz : large ? Math.min(Math.abs(dz), Math.abs(dz - 1)) : Math.abs(dz);
        if (skip(ax, localY, az, range)) continue;
        this.leaf(cx + dx, cy + localY, cz + dz);
      }
  }

  commit(): void {
    const ctx = this.ctx;
    const leafBlock = blockOf(this.leafBase);
    // leaf distances via BFS from logs (only within this tree)
    const dist = new Map<string, number>();
    const q: [number, number, number, number][] = [];
    for (const [x, y, z] of this.logs.values()) q.push([x, y, z, 0]);
    let qi = 0;
    while (qi < q.length) {
      const [x, y, z, d] = q[qi++];
      if (d >= 6) continue;
      for (const [dx, dy, dz] of NB6) {
        const k = `${x + dx},${y + dy},${z + dz}`;
        if (!this.leaves.has(k) || dist.has(k)) continue;
        dist.set(k, d + 1);
        q.push([x + dx, y + dy, z + dz, d + 1]);
      }
    }
    for (const [k, [x, y, z]] of this.leaves) {
      const d = dist.get(k) ?? 7;
      ctx.set(x, y, z, leafBlock.with(this.leafBase, 'distance', Math.min(7, d)), W_REPLACEABLE);
    }
    for (const [x, y, z, st] of this.logs.values()) ctx.set(x, y, z, st, W_LOG);
  }
}

const NB6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];


function skipBlob(r: Rand) {
  return (dx: number, dy: number, dz: number, range: number) => dx === range && dz === range && (r.nextInt(2) === 0 || dy === 0);
}
function skipCorner(dx: number, _dy: number, dz: number, range: number): boolean {
  return dx === range && dz === range && range > 0;
}

function straightHeight(r: Rand, base: number, a: number, b: number): number {
  return base + r.nextInt(a + 1) + r.nextInt(b + 1);
}

function canGrowOn(s: number): boolean {
  if (s < 0) return false;
  const n = blockOf(s).name;
  return n === 'grass_block' || n === 'dirt' || n === 'coarse_dirt' || n === 'podzol' || n === 'rooted_dirt' || n === 'moss_block' || n === 'mud' || n === 'farmland' || n === 'mycelium';
}

/** Try to grow a tree at (x,y,z) where y is the first air block above ground. */
export function placeTree(ctx: GenContext, kind: TreeKind, x: number, y: number, z: number, r: Rand): boolean {
  const ground = ctx.get(x, y - 1, z);
  if (!canGrowOn(ground)) return false;
  const w = WOOD[kind];
  const logB = getBlock(w.log);
  const leafB = getBlock(w.leaves);
  const logState = (axis: string) => logB.state({ axis });
  const leafBase = leafB.state({ persistent: false, distance: 1 });
  const t = new TreeBuilder(ctx, logState, leafBase);
  let ok = true;
  switch (kind) {
    case 'oak': ok = blobTree(t, r, x, y, z, straightHeight(r, 4, 2, 0), 2); break;
    case 'birch': ok = blobTree(t, r, x, y, z, straightHeight(r, 5, 2, 0), 2); break;
    case 'tall_birch': ok = blobTree(t, r, x, y, z, straightHeight(r, 5, 2, 6), 2); break;
    case 'swamp_oak': ok = blobTree(t, r, x, y, z, straightHeight(r, 5, 3, 0), 3); break;
    case 'jungle': ok = blobTree(t, r, x, y, z, straightHeight(r, 4, 8, 0), 2); break;
    case 'jungle_bush': jungleBush(t, r, x, y, z); break;
    case 'spruce': ok = spruceTree(t, r, x, y, z); break;
    case 'pine': ok = pineTree(t, r, x, y, z); break;
    case 'fancy_oak': ok = fancyTree(t, r, x, y, z); break;
    case 'acacia': ok = acaciaTree(t, r, x, y, z); break;
    case 'dark_oak': ok = darkOakTree(t, r, x, y, z); break;
    case 'mega_jungle': ok = megaJungle(t, r, x, y, z); break;
    case 'mega_spruce': ok = megaPine(t, r, x, y, z, true); break;
    case 'mega_pine': ok = megaPine(t, r, x, y, z, false); break;
    case 'cherry': ok = cherryTree(t, r, x, y, z); break;
  }
  if (!ok) return false;
  // dirt under trunk
  if (blockOf(ground).name === 'grass_block' || blockOf(ground).name === 'mycelium') ctx.set(x, y - 1, z, S('dirt'), W_ANY);
  t.commit();
  if (kind === 'swamp_oak') vines(ctx, t, r, 0.25);
  if (kind === 'jungle' || kind === 'mega_jungle') vines(ctx, t, r, 0.25);
  return true;
}

function trunkFree(t: TreeBuilder, x: number, y: number, z: number, h: number): boolean {
  for (let i = 0; i < h; i++) if (!t.isFree(x, y + i, z)) return false;
  return true;
}

function blobTree(t: TreeBuilder, r: Rand, x: number, y: number, z: number, h: number, radius: number): boolean {
  if (y + h + 2 >= 320) return false;
  if (!trunkFree(t, x, y, z, h)) return false;
  for (let i = 0; i < h; i++) t.log(x, y + i, z);
  const ay = y + h;
  const skip = skipBlob(r);
  for (let i = 0; i >= -3; i--) {
    const range = Math.max(radius - 1 - Math.trunc(i / 2), 0);
    t.row(x, ay, z, range, i, false, skip);
  }
  return true;
}

function jungleBush(t: TreeBuilder, r: Rand, x: number, y: number, z: number): void {
  t.log(x, y, z);
  // bush foliage placer: radius 2, offset 1, height 2
  const skip = (dx: number, _dy: number, dz: number, range: number) => dx === range && dz === range && r.nextInt(2) === 0;
  for (let i = 1; i >= -1; i--) {
    const range = 2 + 0 - 1 - i;
    t.row(x, y, z, range, i, false, skip);
  }
}

function spruceTree(t: TreeBuilder, r: Rand, x: number, y: number, z: number): boolean {
  const h = straightHeight(r, 5, 2, 1);
  if (y + h + 2 >= 320 || !trunkFree(t, x, y, z, h)) return false;
  const trunkH = 1 + r.nextInt(2);
  const foliageH = Math.max(4, h - trunkH);
  const radius = 2 + r.nextInt(2);
  const offset = r.nextInt(3);
  for (let i = 0; i < h; i++) t.log(x, y + i, z);
  const ay = y + h;
  let i = r.nextInt(2), j = 1, k = 0;
  for (let l = offset; l >= -foliageH; l--) {
    t.row(x, ay, z, i, l, false, skipCorner);
    if (i >= j) {
      i = k;
      k = 1;
      j = Math.min(j + 1, radius);
    } else i++;
  }
  return true;
}

function pineTree(t: TreeBuilder, r: Rand, x: number, y: number, z: number): boolean {
  const h = straightHeight(r, 6, 4, 0);
  if (y + h + 2 >= 320 || !trunkFree(t, x, y, z, h)) return false;
  for (let i = 0; i < h; i++) t.log(x, y + i, z);
  const foliageH = 3 + r.nextInt(2);
  const radius = 1 + r.nextInt(Math.max(h - foliageH + 1, 1));
  const offset = 1;
  const ay = y + h;
  let i = 0;
  for (let j = offset; j >= offset - foliageH; j--) {
    t.row(x, ay, z, i, j, false, skipCorner);
    if (i >= 1 && j === offset - foliageH + 1) i--;
    else if (i < radius) i++;
  }
  return true;
}

function fancyTree(t: TreeBuilder, r: Rand, x: number, y: number, z: number): boolean {
  const freeH = 3 + r.nextInt(12);
  const j = freeH + 2;
  const k = Math.floor(j * 0.618);
  const l = Math.min(1, Math.floor(1.382 + Math.pow(j / 13, 2)));
  const i1 = y + k;
  let j1 = j - 5;
  const coords: [number, number, number, number][] = [[x, y + j1, z, i1]];
  const limb = (fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, place: boolean): boolean => {
    if (!place && fx === tx && fy === ty && fz === tz) return true;
    const dx = tx - fx, dy = ty - fy, dz = tz - fz;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    if (steps === 0) {
      if (place) t.log(fx, fy, fz);
      return true;
    }
    const sx = dx / steps, sy = dy / steps, sz = dz / steps;
    for (let s = 0; s <= steps; s++) {
      const px = fx + Math.floor(0.5 + s * sx), py = fy + Math.floor(0.5 + s * sy), pz = fz + Math.floor(0.5 + s * sz);
      if (place) {
        const ax = Math.abs(px - fx), az = Math.abs(pz - fz);
        const m = Math.max(ax, az);
        const axis = m > 0 ? (ax === m ? 'x' : 'z') : 'y';
        t.log(px, py, pz, axis);
      } else if (!t.isFree(px, py, pz)) return false;
    }
    return true;
  };
  const treeShape = (height: number, yy: number): number => {
    if (yy < height * 0.3) return -1;
    const f = height / 2;
    const f1 = f - yy;
    let f2 = Math.sqrt(f * f - f1 * f1);
    if (f1 === 0) f2 = f;
    else if (Math.abs(f1) >= f) return 0;
    return f2 * 0.5;
  };
  for (; j1 >= 0; j1--) {
    const f = treeShape(j, j1);
    if (f < 0) continue;
    for (let k1 = 0; k1 < l; k1++) {
      const d2 = f * (r.nextFloat() + 0.328);
      const d3 = r.nextFloat() * 2 * Math.PI;
      const d4 = d2 * Math.sin(d3) + 0.5;
      const d5 = d2 * Math.cos(d3) + 0.5;
      const bx = x + Math.floor(d4), by = y + j1 - 1, bz = z + Math.floor(d5);
      if (limb(bx, by, bz, bx, by + 5, bz, false)) {
        const l1 = x - bx, i2 = z - bz;
        const d6 = by - Math.sqrt(l1 * l1 + i2 * i2) * 0.381;
        const j2 = d6 > i1 ? i1 : Math.trunc(d6);
        if (limb(x, j2, z, bx, by, bz, false)) coords.push([bx, by, bz, j2]);
      }
    }
  }
  limb(x, y, z, x, y + k, z, true);
  const trim = (yy: number) => yy >= j * 0.2;
  for (const [bx, by, bz, base] of coords) {
    if (!(bx === x && base === by && bz === z) && trim(base - y)) limb(x, base, z, bx, by, bz, true);
  }
  for (const [bx, by, bz, base] of coords) {
    if (!trim(base - y)) continue;
    // fancy foliage: radius 2, offset 4, height 4
    for (let i = 4; i >= 0; i--) {
      const range = 2 + (i !== 4 && i !== 0 ? 1 : 0);
      t.row(bx, by, bz, range, i, false, (dx, _dy, dz, rg) => (dx + 0.5) * (dx + 0.5) + (dz + 0.5) * (dz + 0.5) > rg * rg);
    }
  }
  return true;
}

const HDIRS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

function acaciaTree(t: TreeBuilder, r: Rand, x: number, y: number, z: number): boolean {
  const freeH = straightHeight(r, 5, 2, 2);
  if (y + freeH + 3 >= 320) return false;
  const dir = HDIRS[r.nextInt(4)];
  const i = freeH - r.nextInt(4) - 1;
  let j = 3 - r.nextInt(3);
  let k = x, l = z;
  let top = -1;
  const attach: [number, number, number, number][] = [];
  for (let i1 = 0; i1 < freeH; i1++) {
    const y1 = y + i1;
    if (i1 >= i && j > 0) {
      k += dir[0];
      l += dir[1];
      j--;
    }
    if (t.isFree(k, y1, l)) {
      t.log(k, y1, l);
      top = y1 + 1;
    }
  }
  if (top >= 0) attach.push([k, top, l, 1]);
  k = x;
  l = z;
  const dir2 = HDIRS[r.nextInt(4)];
  if (dir2 !== dir) {
    const j2 = i - r.nextInt(2) - 1;
    let k1 = 1 + r.nextInt(3);
    top = -1;
    for (let l1 = j2; l1 < freeH && k1 > 0; k1--) {
      if (l1 >= 1) {
        const y2 = y + l1;
        k += dir2[0];
        l += dir2[1];
        if (t.isFree(k, y2, l)) {
          t.log(k, y2, l);
          top = y2 + 1;
        }
      }
      l1++;
    }
    if (top >= 0) attach.push([k, top, l, 0]);
  }
  for (const [ax, ay, az, ro] of attach) {
    const skip = (dx: number, dy: number, dz: number, range: number) => {
      if (dy === 0) return (dx > 1 || dz > 1) && dx !== 0 && dz !== 0;
      return dx === range && dz === range && range > 0;
    };
    t.row(ax, ay, az, 2 + ro, -1, false, skip);
    t.row(ax, ay, az, 1, 0, false, skip);
    t.row(ax, ay, az, 2 + ro - 1, 0, false, skip);
  }
  return true;
}

function darkOakTree(t: TreeBuilder, r: Rand, x: number, y: number, z: number): boolean {
  const freeH = straightHeight(r, 6, 2, 1);
  if (y + freeH + 3 >= 320) return false;
  for (const [dx, dz] of [[1, 0], [0, 1], [1, 1]]) if (!canGrowOn(t.ctx.get(x + dx, y - 1, z + dz)) && t.ctx.get(x + dx, y - 1, z + dz) >= 0) return false;
  const dir = HDIRS[r.nextInt(4)];
  const i = freeH - r.nextInt(4);
  let j = 2 - r.nextInt(3);
  let j1 = x, k1 = z;
  const l1 = y + freeH - 1;
  for (let i2 = 0; i2 < freeH; i2++) {
    if (i2 >= i && j > 0) {
      j1 += dir[0];
      k1 += dir[1];
      j--;
    }
    const y2 = y + i2;
    if (t.isFree(j1, y2, k1)) {
      t.log(j1, y2, k1);
      t.log(j1 + 1, y2, k1);
      t.log(j1, y2, k1 + 1);
      t.log(j1 + 1, y2, k1 + 1);
    }
  }
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const s = t.ctx.get(x + dx, y - 1, z + dz);
    if (s >= 0 && blockOf(s).name === 'grass_block') t.ctx.set(x + dx, y - 1, z + dz, S('dirt'));
  }
  const attach: [number, number, number, boolean][] = [[j1, l1, k1, true]];
  for (let l2 = -1; l2 <= 2; l2++)
    for (let i3 = -1; i3 <= 2; i3++) {
      if ((l2 < 0 || l2 > 1 || i3 < 0 || i3 > 1) && r.nextInt(3) <= 0) {
        const j3 = r.nextInt(3) + 2;
        for (let k2 = 0; k2 < j3; k2++) t.log(x + l2, l1 - k2 - 1, z + i3);
        attach.push([x + l2, l1, z + i3, false]);
      }
    }
  for (const [ax, ay, az, large] of attach) {
    const skip = (dx: number, dy: number, dz: number, range: number) => {
      if (dy === -1 && !large) return dx === range && dz === range;
      if (dy === 1) return dx + dz > range * 2 - 2;
      return false;
    };
    const skipSigned = (range: number) => (dx: number, dy: number, dz: number, _r: number) => skip(dx, dy, dz, range);
    if (large) {
      t.row(ax, ay, az, 2, -1, true, skipSigned(2));
      t.row(ax, ay, az, 3, 0, true, (dx, _dy, dz, rg) => (dx === -rg || dx >= rg) && (dz === -rg || dz >= rg), true);
      t.row(ax, ay, az, 2, 1, true, skipSigned(2));
      if (r.nextBool()) t.row(ax, ay, az, 0, 2, true, skipSigned(0));
    } else {
      t.row(ax, ay, az, 2, -1, false, skipSigned(2));
      t.row(ax, ay, az, 1, 0, false, skipSigned(1));
    }
  }
  return true;
}

function megaJungle(t: TreeBuilder, r: Rand, x: number, y: number, z: number): boolean {
  const h = 10 + r.nextInt(3) + r.nextInt(20);
  if (y + h + 3 >= 320) return false;
  for (let i = 0; i < h; i++) {
    t.log(x, y + i, z);
    if (i < h - 1) {
      t.log(x + 1, y + i, z);
      t.log(x, y + i, z + 1);
      t.log(x + 1, y + i, z + 1);
    }
  }
  const attach: [number, number, number, number, boolean][] = [[x, y + h, z, 0, true]];
  for (let i = h - 2 - r.nextInt(4); i > h / 2; i -= 2 + r.nextInt(4)) {
    const f = r.nextFloat() * Math.PI * 2;
    let jx = 0, kz = 0;
    for (let l = 0; l < 5; l++) {
      jx = Math.trunc(1.5 + Math.cos(f) * l);
      kz = Math.trunc(1.5 + Math.sin(f) * l);
      t.log(x + jx, y + i - 3 + Math.trunc(l / 2), z + kz, Math.abs(Math.cos(f)) > Math.abs(Math.sin(f)) ? 'x' : 'z');
    }
    attach.push([x + jx, y + i, z + kz, -2, false]);
  }
  for (const [ax, ay, az, ro, large] of attach) {
    const n = large ? 2 : 1 + r.nextInt(2);
    for (let j = 0; j >= -n; j--) {
      const range = 2 + ro + 1 - j;
      t.row(ax, ay, az, range, j, large, (dx, _dy, dz, rg) => dx + dz >= 7 || dx * dx + dz * dz > rg * rg);
    }
  }
  return true;
}

function megaPine(t: TreeBuilder, r: Rand, x: number, y: number, z: number, spruce: boolean): boolean {
  const h = 13 + r.nextInt(3) + r.nextInt(15);
  if (y + h + 3 >= 320) return false;
  for (let i = 0; i < h; i++) {
    t.log(x, y + i, z);
    t.log(x + 1, y + i, z);
    t.log(x, y + i, z + 1);
    t.log(x + 1, y + i, z + 1);
  }
  const foliageH = spruce ? 13 + r.nextInt(5) : 3 + r.nextInt(5);
  const top = y + h;
  let prev = 0;
  for (let j = top - foliageH; j <= top; j++) {
    const k = top - j;
    const l = Math.floor((k / foliageH) * 3.5);
    const i1 = k > 0 && l === prev && (j & 1) === 0 ? l + 1 : l;
    t.row(x, j, z, i1, 0, true, (dx, _dy, dz, rg) => dx + dz >= 7 || dx * dx + dz * dz > rg * rg);
    prev = l;
  }
  // podzol around
  return true;
}

function cherryTree(t: TreeBuilder, r: Rand, x: number, y: number, z: number): boolean {
  const h = 7 + r.nextInt(3);
  if (y + h + 4 >= 320 || !trunkFree(t, x, y, z, h - 2)) return false;
  const trunk = h - 3 - r.nextInt(2);
  for (let i = 0; i < trunk; i++) t.log(x, y + i, z);
  const branches = 2 + r.nextInt(2);
  const tips: [number, number, number][] = [[x, y + trunk, z]];
  t.log(x, y + trunk, z);
  const used = new Set<number>();
  for (let b = 0; b < branches; b++) {
    let di = r.nextInt(4);
    while (used.has(di) && used.size < 4) di = (di + 1) % 4;
    used.add(di);
    const [dx, dz] = HDIRS[di];
    const len = 2 + r.nextInt(3);
    let bx = x, by = y + trunk - 1 - r.nextInt(2), bz = z;
    for (let s = 0; s < len; s++) {
      bx += dx;
      bz += dz;
      t.log(bx, by, bz, dx ? 'x' : 'z');
    }
    const up = 1 + r.nextInt(3);
    for (let s = 0; s < up; s++) t.log(bx, ++by, bz);
    tips.push([bx, by + 1, bz]);
  }
  for (const [tx, ty, tz] of tips) {
    for (let dy = -2; dy <= 2; dy++) {
      const rad = dy === 2 ? 2 : dy === -2 ? 3 : 4;
      for (let dx = -rad; dx <= rad; dx++)
        for (let dz = -rad; dz <= rad; dz++) {
          const d = dx * dx + dz * dz + dy * dy * 2.2;
          if (d > rad * rad + 1.5 || (d > rad * rad - 3 && r.nextInt(3) === 0)) continue;
          t.leaf(tx + dx, ty + dy, tz + dz);
        }
    }
  }
  return true;
}

function vines(ctx: GenContext, t: TreeBuilder, r: Rand, chance: number): void {
  const vine = getBlock('vine');
  for (const [x, y, z] of t.leaves.values()) {
    for (const [dx, dz, face] of [[-1, 0, 'east'], [1, 0, 'west'], [0, -1, 'south'], [0, 1, 'north']] as [number, number, string][]) {
      if (r.next() >= chance) continue;
      const vx = x + dx, vz = z + dz;
      if (ctx.get(vx, y, vz) !== 0) continue;
      const st = vine.state({ [face]: true, south: face === 'south' });
      for (let k = 0; k < 4; k++) {
        if (ctx.get(vx, y - k, vz) !== 0) break;
        ctx.set(vx, y - k, vz, st, W_REPLACEABLE);
        if (r.nextInt(3) === 0) break;
      }
    }
  }
}

export function isTreeGround(s: number): boolean {
  return canGrowOn(s);
}
