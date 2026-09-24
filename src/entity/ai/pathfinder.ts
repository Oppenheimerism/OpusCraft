// A* pathfinding over the block grid: vanilla PathFinder + WalkNodeEvaluator
// (path types, maluses, step-up/jump/fall rules, diagonal checks).

import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_WATER, F_LAVA, F_LEAVES, COLLISION } from '../../world/block';
import { MIN_Y } from '../../world/constants';
import { AABB } from '../../core/aabb';
import type { World } from '../../world/world';
import { fluidType } from '../../world/fluids';

/** vanilla PathType, in declaration order (EnumSet iteration order matters) */
export const enum PathType {
  BLOCKED,
  OPEN,
  WALKABLE,
  TRAPDOOR,
  FENCE,
  LAVA,
  WATER,
  WATER_BORDER,
  DANGER_FIRE,
  DAMAGE_FIRE,
  DANGER_OTHER,
  DAMAGE_OTHER,
  LEAVES,
  DAMAGE_CAUTIOUS,
  DANGER_TRAPDOOR,
  COUNT,
}

export const DEFAULT_MALUS: number[] = [];
DEFAULT_MALUS[PathType.BLOCKED] = -1;
DEFAULT_MALUS[PathType.OPEN] = 0;
DEFAULT_MALUS[PathType.WALKABLE] = 0;
DEFAULT_MALUS[PathType.TRAPDOOR] = 0;
DEFAULT_MALUS[PathType.FENCE] = -1;
DEFAULT_MALUS[PathType.LAVA] = -1;
DEFAULT_MALUS[PathType.WATER] = 8;
DEFAULT_MALUS[PathType.WATER_BORDER] = 8;
DEFAULT_MALUS[PathType.DANGER_FIRE] = 8;
DEFAULT_MALUS[PathType.DAMAGE_FIRE] = 16;
DEFAULT_MALUS[PathType.DANGER_OTHER] = 8;
DEFAULT_MALUS[PathType.DAMAGE_OTHER] = -1;
DEFAULT_MALUS[PathType.LEAVES] = -1;
DEFAULT_MALUS[PathType.DAMAGE_CAUTIOUS] = 0;
DEFAULT_MALUS[PathType.DANGER_TRAPDOOR] = 0;

/** what the evaluator needs to know about the mob */
export interface PathMob {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  onGround: boolean;
  inWater: boolean;
  bb: AABB;
  stepHeight: number;
  malus(t: PathType): number;
  maxFallDistance(): number;
  /** walks on this fluid (FLUID_*) as on a floor (the strider on lava) */
  canStandOnFluid(fluid: number): boolean;
}

export class Node {
  g = 0;
  h = 0;
  f = 0;
  heapIdx = -1;
  closed = false;
  cameFrom: Node | null = null;
  walkedDistance = 0;
  costMalus = 0;
  type: PathType = PathType.BLOCKED;
  constructor(readonly x: number, readonly y: number, readonly z: number) {}
  inOpenSet(): boolean {
    return this.heapIdx >= 0;
  }
  distanceTo(o: { x: number; y: number; z: number }): number {
    const a = o.x - this.x, b = o.y - this.y, c = o.z - this.z;
    return Math.sqrt(a * a + b * b + c * c);
  }
  distanceManhattan(o: { x: number; y: number; z: number }): number {
    return Math.abs(o.x - this.x) + Math.abs(o.y - this.y) + Math.abs(o.z - this.z);
  }
}

export class Path {
  nextNodeIndex = 0;
  constructor(readonly nodes: Node[], readonly target: { x: number; y: number; z: number }, readonly reached: boolean) {}
  get distToTarget(): number {
    const n = this.nodes[this.nodes.length - 1];
    return n ? n.distanceTo(this.target) : Infinity;
  }
  isDone(): boolean {
    return this.nextNodeIndex >= this.nodes.length;
  }
  advance(): void {
    this.nextNodeIndex++;
  }
  get nextNode(): Node {
    return this.nodes[this.nextNodeIndex];
  }
  get endNode(): Node | null {
    return this.nodes.length ? this.nodes[this.nodes.length - 1] : null;
  }
  canReach(): boolean {
    return this.reached;
  }
  /** vanilla Path.getEntityPosAtNode */
  entityPosAt(width: number, i: number): [number, number, number] {
    const n = this.nodes[i];
    const off = Math.floor(width + 1) * 0.5;
    return [n.x + off, n.y, n.z + off];
  }
  sameAs(o: Path | null): boolean {
    if (!o || o.nodes.length !== this.nodes.length) return false;
    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i], b = o.nodes[i];
      if (a.x !== b.x || a.y !== b.y || a.z !== b.z) return false;
    }
    return true;
  }
}

/** binary min-heap on Node.f (vanilla BinaryHeap) */
class Heap {
  private h: Node[] = [];
  get size(): number {
    return this.h.length;
  }
  clear(): void {
    for (const n of this.h) n.heapIdx = -1;
    this.h.length = 0;
  }
  insert(n: Node): void {
    n.heapIdx = this.h.length;
    this.h.push(n);
    this.up(n.heapIdx);
  }
  pop(): Node {
    const top = this.h[0];
    const last = this.h.pop()!;
    if (this.h.length) {
      this.h[0] = last;
      last.heapIdx = 0;
      this.down(0);
    }
    top.heapIdx = -1;
    return top;
  }
  changeCost(n: Node, f: number): void {
    const old = n.f;
    n.f = f;
    if (f < old) this.up(n.heapIdx);
    else this.down(n.heapIdx);
  }
  private up(i: number): void {
    const h = this.h, n = h[i];
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p].f <= n.f) break;
      h[i] = h[p];
      h[i].heapIdx = i;
      i = p;
    }
    h[i] = n;
    n.heapIdx = i;
  }
  private down(i: number): void {
    const h = this.h, n = h[i], len = h.length;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      if (l >= len) break;
      const c = r < len && h[r].f < h[l].f ? r : l;
      if (h[c].f >= n.f) break;
      h[i] = h[c];
      h[i].heapIdx = i;
      i = c;
    }
    h[i] = n;
    n.heapIdx = i;
  }
}

// 20 bits x/z (wrapping; a search never spans 1M blocks) + 12 bits y: fits in a double exactly
const key = (x: number, y: number, z: number) => ((x & 0xfffff) * 4096 + ((y + 2048) & 0xfff)) * 1048576 + (z & 0xfffff);

function collisionTop(st: number): number {
  const boxes = COLLISION[st];
  if (!boxes || !boxes.length) return 0;
  let m = 0;
  for (const b of boxes) if (b[4] > m) m = b[4];
  return m;
}

/** ground-walking node evaluator (vanilla WalkNodeEvaluator) */
export class WalkNodeEvaluator {
  private mob!: PathMob;
  private world!: World;
  private nodes = new Map<number, Node>();
  private rawCache = new Map<number, PathType>();
  private staticCache = new Map<number, PathType>();
  private mobCache = new Map<number, PathType>();
  canFloat = false;
  private ew = 1;
  private eh = 1;

  prepare(world: World, mob: PathMob): void {
    this.world = world;
    this.mob = mob;
    this.nodes.clear();
    this.rawCache.clear();
    this.staticCache.clear();
    this.mobCache.clear();
    this.ew = Math.floor(mob.width + 1);
    this.eh = Math.floor(mob.height + 1);
  }

  done(): void {
    this.nodes.clear();
    this.rawCache.clear();
    this.staticCache.clear();
    this.mobCache.clear();
  }

  getNode(x: number, y: number, z: number): Node {
    const k = key(x, y, z);
    let n = this.nodes.get(k);
    if (!n) {
      n = new Node(x, y, z);
      this.nodes.set(k, n);
    }
    return n;
  }

  /** vanilla getPathTypeFromState */
  rawType(x: number, y: number, z: number): PathType {
    const k = key(x, y, z);
    const c = this.rawCache.get(k);
    if (c !== undefined) return c;
    const t = rawPathType(this.world, x, y, z);
    this.rawCache.set(k, t);
    return t;
  }

  /** vanilla getPathTypeStatic: open cells above ground become WALKABLE (or a danger type) */
  staticType(x: number, y: number, z: number): PathType {
    const k = key(x, y, z);
    const c = this.staticCache.get(k);
    if (c !== undefined) return c;
    let t = this.rawType(x, y, z);
    if (t === PathType.OPEN && y >= MIN_Y + 1) {
      switch (this.rawType(x, y - 1, z)) {
        case PathType.OPEN:
        case PathType.WATER:
        case PathType.LAVA:
        case PathType.WALKABLE:
          t = PathType.OPEN;
          break;
        case PathType.DAMAGE_FIRE:
          t = PathType.DAMAGE_FIRE;
          break;
        case PathType.DAMAGE_OTHER:
          t = PathType.DAMAGE_OTHER;
          break;
        case PathType.DAMAGE_CAUTIOUS:
          t = PathType.DAMAGE_CAUTIOUS;
          break;
        case PathType.TRAPDOOR:
          t = PathType.DANGER_TRAPDOOR;
          break;
        default:
          t = this.checkNeighbours(x, y, z, PathType.WALKABLE);
      }
    }
    this.staticCache.set(k, t);
    return t;
  }

  private checkNeighbours(x: number, y: number, z: number, t: PathType): PathType {
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) {
          if (i === 0 && k === 0) continue;
          const p = this.rawType(x + i, y + j, z + k);
          if (p === PathType.DAMAGE_OTHER) return PathType.DANGER_OTHER;
          if (p === PathType.DAMAGE_FIRE || p === PathType.LAVA) return PathType.DANGER_FIRE;
          if (p === PathType.WATER) return PathType.WATER_BORDER;
          if (p === PathType.DAMAGE_CAUTIOUS) return PathType.DAMAGE_CAUTIOUS;
        }
    return t;
  }

  /** vanilla getPathTypeOfMob: the worst type over the mob's footprint */
  mobType(x: number, y: number, z: number): PathType {
    const k = key(x, y, z);
    const c = this.mobCache.get(k);
    if (c !== undefined) return c;
    let mask = 0;
    for (let i = 0; i < this.ew; i++)
      for (let j = 0; j < this.eh; j++)
        for (let l = 0; l < this.ew; l++) mask |= 1 << this.staticType(x + i, y + j, z + l);
    let res: PathType;
    if (mask & (1 << PathType.FENCE)) res = PathType.FENCE;
    else {
      res = PathType.BLOCKED;
      let found = false;
      for (let t = 0; t < PathType.COUNT; t++) {
        if (!(mask & (1 << t))) continue;
        const m = this.mob.malus(t as PathType);
        if (m < 0) {
          res = t as PathType;
          found = true;
          break;
        }
        if (m >= this.mob.malus(res)) res = t as PathType;
      }
      if (!found && this.ew <= 1 && res !== PathType.OPEN && this.mob.malus(res) === 0 && this.staticType(x, y, z) === PathType.OPEN) res = PathType.OPEN;
    }
    this.mobCache.set(k, res);
    return res;
  }

  floorLevel(x: number, y: number, z: number): number {
    if (this.canFloat && FLAGS[this.world.getState(x, y, z)] & F_WATER) return y + 0.5;
    return y - 1 + collisionTop(this.world.getState(x, y - 1, z));
  }

  /** static vanilla getFloorLevel(level, pos) (no water handling) */
  floorLevelAt(world: World, x: number, y: number, z: number): number {
    return y - 1 + collisionTop(world.getState(x, y - 1, z));
  }

  private jumpHeight(): number {
    return Math.max(1.125, this.mob.stepHeight);
  }

  /** vanilla getStart */
  getStart(): Node | null {
    const m = this.mob;
    let y = Math.floor(m.y);
    const bx = Math.floor(m.x), bz = Math.floor(m.z);
    if (m.canStandOnFluid(fluidType(this.world.getState(bx, y, bz)))) {
      // standing on a fluid: start at the top of it
      while (m.canStandOnFluid(fluidType(this.world.getState(bx, ++y, bz))));
      y--;
    } else if (this.canFloat && m.inWater) {
      for (;;) {
        if (!(FLAGS[this.world.getState(bx, y, bz)] & F_WATER)) {
          y--;
          break;
        }
        y++;
      }
    } else if (m.onGround) {
      y = Math.floor(m.y + 0.5);
    } else {
      let py = Math.floor(m.y + 1);
      while (py > MIN_Y) {
        y = py;
        py--;
        const t = this.rawType(bx, py, bz);
        if (t !== PathType.OPEN && t !== PathType.WATER) break;
      }
    }
    // wide mobs: node origin is the min corner of their footprint
    const ox = Math.floor(m.x - (this.ew - 1) * 0.5), oz = Math.floor(m.z - (this.ew - 1) * 0.5);
    if (!this.canStartAt(ox, y, oz)) {
      const bb = m.bb;
      for (const [cx, cz] of [[bb.minX, bb.minZ], [bb.minX, bb.maxZ], [bb.maxX, bb.minZ], [bb.maxX, bb.maxZ]]) {
        const sx = Math.floor(cx), sz = Math.floor(cz);
        if (this.canStartAt(sx, y, sz)) return this.startNode(sx, y, sz);
      }
    }
    return this.startNode(ox, y, oz);
  }

  private startNode(x: number, y: number, z: number): Node {
    const n = this.getNode(x, y, z);
    n.type = this.mobType(x, y, z);
    n.costMalus = this.mob.malus(n.type);
    return n;
  }

  private canStartAt(x: number, y: number, z: number): boolean {
    const t = this.mobType(x, y, z);
    return t !== PathType.OPEN && this.mob.malus(t) >= 0;
  }

  private nodeWithMalus(x: number, y: number, z: number, t: PathType, malus: number): Node {
    const n = this.getNode(x, y, z);
    n.type = t;
    n.costMalus = Math.max(n.costMalus, malus);
    return n;
  }

  private blockedNode(x: number, y: number, z: number): Node {
    const n = this.getNode(x, y, z);
    n.type = PathType.BLOCKED;
    n.costMalus = -1;
    return n;
  }

  private readonly neigh: (Node | null)[] = [null, null, null, null];

  /** vanilla getNeighbors: 4 cardinal + valid diagonals */
  neighbors(out: Node[], node: Node): number {
    let count = 0;
    let vertical = 0;
    const above = this.mobType(node.x, node.y + 1, node.z);
    if (this.mob.malus(above) >= 0) vertical = Math.floor(Math.max(1, this.mob.stepHeight));
    const floor = this.floorLevel(node.x, node.y, node.z);
    const here = this.mobType(node.x, node.y, node.z);
    // south, west, north, east (Direction.Plane.HORIZONTAL order)
    const dirs = [[0, 1], [-1, 0], [0, -1], [1, 0]];
    for (let d = 0; d < 4; d++) {
      const n = this.acceptedNode(node.x + dirs[d][0], node.y, node.z + dirs[d][1], vertical, floor, dirs[d][0], dirs[d][1], here);
      this.neigh[d] = n;
      if (n && !n.closed && (n.costMalus >= 0 || node.costMalus < 0)) out[count++] = n;
    }
    for (let d = 0; d < 4; d++) {
      const d2 = (d + 1) & 3; // clockwise
      const a = this.neigh[d], b = this.neigh[d2];
      if (!this.diagonalOk(node, a, b)) continue;
      const n = this.acceptedNode(node.x + dirs[d][0] + dirs[d2][0], node.y, node.z + dirs[d][1] + dirs[d2][1], vertical, floor, dirs[d][0], dirs[d][1], here);
      if (n && !n.closed && n.costMalus >= 0) out[count++] = n;
    }
    return count;
  }

  private diagonalOk(root: Node, x: Node | null, z: Node | null): boolean {
    if (!z || !x || z.y > root.y || x.y > root.y) return false;
    const fence = z.type === PathType.FENCE && x.type === PathType.FENCE && this.mob.width < 0.5;
    return (z.y < root.y || z.costMalus >= 0 || fence) && (x.y < root.y || x.costMalus >= 0 || fence);
  }

  /** vanilla findAcceptedNode */
  private acceptedNode(x: number, y: number, z: number, vertical: number, nodeFloor: number, dx: number, dz: number, fromType: PathType): Node | null {
    let node: Node | null = null;
    const floor = this.floorLevel(x, y, z);
    if (floor - nodeFloor > this.jumpHeight()) return null;
    const t = this.mobType(x, y, z);
    const malus = this.mob.malus(t);
    if (malus >= 0) node = this.nodeWithMalus(x, y, z, t, malus);
    if (t === PathType.WALKABLE) return node;
    if ((node === null || node.costMalus < 0) && vertical > 0 && t !== PathType.FENCE && t !== PathType.TRAPDOOR) {
      return this.tryJumpOn(x, y, z, vertical, nodeFloor, dx, dz, fromType);
    }
    if (t === PathType.WATER && !this.canFloat) return this.firstNonWaterBelow(x, y, z, node);
    if (t === PathType.OPEN) return this.firstGroundBelow(x, y, z);
    return node;
  }

  private tryJumpOn(x: number, y: number, z: number, vertical: number, nodeFloor: number, dx: number, dz: number, fromType: PathType): Node | null {
    const n = this.acceptedNode(x, y + 1, z, vertical - 1, nodeFloor, dx, dz, fromType);
    if (!n) return null;
    if (this.mob.width >= 1) return n;
    if (n.type !== PathType.OPEN && n.type !== PathType.WALKABLE) return n;
    // the mob must fit through the jump arc from the previous cell
    const cx = x - dx + 0.5, cz = z - dz + 0.5, hw = this.mob.width / 2;
    const box = new AABB(cx - hw, this.floorLevel(Math.floor(cx), y + 1, Math.floor(cz)) + 0.001, cz - hw, cx + hw, this.mob.height + this.floorLevel(n.x, n.y, n.z) - 0.002, cz + hw);
    return this.hasCollisions(box) ? null : n;
  }

  private hasCollisions(box: AABB): boolean {
    const x0 = Math.floor(box.minX), x1 = Math.floor(box.maxX), y0 = Math.floor(box.minY), y1 = Math.floor(box.maxY), z0 = Math.floor(box.minZ), z1 = Math.floor(box.maxZ);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const boxes = COLLISION[this.world.getState(x, y, z)];
          if (!boxes) continue;
          for (const b of boxes) if (box.intersectsRaw(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5])) return true;
        }
    return false;
  }

  private firstNonWaterBelow(x: number, y: number, z: number, node: Node | null): Node | null {
    for (let i = y - 1; i > MIN_Y; i--) {
      const t = this.mobType(x, i, z);
      if (t !== PathType.WATER) return node;
      node = this.nodeWithMalus(x, i, z, t, this.mob.malus(t));
    }
    return node;
  }

  private firstGroundBelow(x: number, y: number, z: number): Node {
    for (let i = y - 1; i >= MIN_Y; i--) {
      if (y - i > this.mob.maxFallDistance()) return this.blockedNode(x, i, z);
      const t = this.mobType(x, i, z);
      const m = this.mob.malus(t);
      if (t !== PathType.OPEN) {
        if (m >= 0) return this.nodeWithMalus(x, i, z, t, m);
        return this.blockedNode(x, i, z);
      }
    }
    return this.blockedNode(x, y, z);
  }
}

/** vanilla getPathTypeFromState for a single block */
export function rawPathType(world: World, x: number, y: number, z: number): PathType {
  const st = world.getState(x, y, z);
  const f = FLAGS[st];
  if (f & F_AIR) return PathType.OPEN;
  const name = BLOCKS[STATE_BLOCK[st]].name;
  if (name.endsWith('_door')) return BLOCKS[STATE_BLOCK[st]].get(st, 'open') ? PathType.OPEN : PathType.BLOCKED;
  if (name.endsWith('_fence_gate')) return BLOCKS[STATE_BLOCK[st]].get(st, 'open') ? PathType.OPEN : PathType.FENCE;
  if (name.endsWith('_trapdoor') || name === 'lily_pad') return PathType.TRAPDOOR;
  if (name === 'fire') return PathType.DAMAGE_FIRE;
  if (name.endsWith('_bed')) return PathType.BLOCKED;
  if (name === 'cactus' || name === 'sweet_berry_bush') return PathType.DAMAGE_OTHER;
  if (name === 'wither_rose' || name === 'pointed_dripstone') return PathType.DAMAGE_CAUTIOUS;
  if (f & F_LAVA) return PathType.LAVA;
  if (name === 'fire' || name === 'soul_fire' || name === 'magma_block' || name === 'campfire') return PathType.DAMAGE_FIRE;
  if (f & F_LEAVES) return PathType.LEAVES;
  if (name.endsWith('_fence') || name.endsWith('_wall') || name.endsWith('_fence_gate')) return PathType.FENCE;
  const top = collisionTop(st);
  if (top > 1) return PathType.FENCE;
  // vanilla isPathfindable(LAND): full cubes, slabs and stairs block; thin layers can be walked over
  if (COLLISION[st] && COLLISION[st].length && (top >= 0.5 || name.endsWith('_slab') || name.endsWith('_stairs'))) return PathType.BLOCKED;
  return f & F_WATER ? PathType.WATER : PathType.OPEN;
}

export interface PathTarget {
  x: number;
  y: number;
  z: number;
}

/** vanilla PathFinder.findPath (A* with h weighted 1.5, best-partial fallback) */
export function findPath(evaluator: WalkNodeEvaluator, world: World, mob: PathMob, target: PathTarget, maxRange: number, accuracy: number, maxVisited: number): Path | null {
  evaluator.prepare(world, mob);
  const start = evaluator.getStart();
  if (!start) {
    evaluator.done();
    return null;
  }
  const open = new Heap();
  start.g = 0;
  start.h = start.distanceTo(target);
  start.f = start.h;
  let best = start, bestH = start.h;
  open.insert(start);
  let visited = 0;
  let reached: Node | null = null;
  const nb: Node[] = [];
  while (open.size) {
    if (++visited >= maxVisited) break;
    const node = open.pop();
    node.closed = true;
    if (node.distanceManhattan(target) <= accuracy) {
      reached = node;
      break;
    }
    if (node.distanceTo(start) >= maxRange) continue;
    const k = evaluator.neighbors(nb, node);
    for (let i = 0; i < k; i++) {
      const n = nb[i];
      const d = node.distanceTo(n);
      n.walkedDistance = node.walkedDistance + d;
      const g = node.g + d + n.costMalus;
      if (n.walkedDistance < maxRange && (!n.inOpenSet() || g < n.g)) {
        n.cameFrom = node;
        n.g = g;
        const h = n.distanceTo(target);
        if (h < bestH) {
          bestH = h;
          best = n;
        }
        n.h = h * 1.5;
        if (n.inOpenSet()) open.changeCost(n, n.g + n.h);
        else {
          n.f = n.g + n.h;
          open.insert(n);
        }
      }
    }
  }
  const end = reached ?? best;
  const nodes: Node[] = [];
  for (let n: Node | null = end; n; n = n.cameFrom) nodes.unshift(n);
  evaluator.done();
  return new Path(nodes, { x: target.x, y: target.y, z: target.z }, reached !== null);
}
