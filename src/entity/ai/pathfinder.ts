// A* pathfinding over the block grid: vanilla PathFinder + WalkNodeEvaluator
// (path types, maluses, step-up/jump/fall rules, diagonal checks), and SwimNodeEvaluator for what swims.

import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_WATER, F_LAVA, F_LEAVES, COLLISION } from '../../world/block';
import { MIN_Y, SEA_LEVEL } from '../../world/constants';
import { AABB } from '../../core/aabb';
import type { World } from '../../world/world';
import { fluidType, FLUID_NONE, FLUID_WATER } from '../../world/fluids';

/** vanilla PathType, in declaration order (EnumSet iteration order matters) */
export const enum PathType {
  BLOCKED,
  OPEN,
  WALKABLE,
  /** a closed wooden door, to a mob that opens doors */
  WALKABLE_DOOR,
  TRAPDOOR,
  FENCE,
  LAVA,
  WATER,
  WATER_BORDER,
  DANGER_FIRE,
  DAMAGE_FIRE,
  DANGER_OTHER,
  DAMAGE_OTHER,
  DOOR_OPEN,
  DOOR_WOOD_CLOSED,
  DOOR_IRON_CLOSED,
  LEAVES,
  DAMAGE_CAUTIOUS,
  DANGER_TRAPDOOR,
  COUNT,
}

export const DEFAULT_MALUS: number[] = [];
DEFAULT_MALUS[PathType.BLOCKED] = -1;
DEFAULT_MALUS[PathType.OPEN] = 0;
DEFAULT_MALUS[PathType.WALKABLE] = 0;
DEFAULT_MALUS[PathType.WALKABLE_DOOR] = 0;
DEFAULT_MALUS[PathType.TRAPDOOR] = 0;
DEFAULT_MALUS[PathType.FENCE] = -1;
DEFAULT_MALUS[PathType.LAVA] = -1;
DEFAULT_MALUS[PathType.WATER] = 8;
DEFAULT_MALUS[PathType.WATER_BORDER] = 8;
DEFAULT_MALUS[PathType.DANGER_FIRE] = 8;
DEFAULT_MALUS[PathType.DAMAGE_FIRE] = 16;
DEFAULT_MALUS[PathType.DANGER_OTHER] = 8;
DEFAULT_MALUS[PathType.DAMAGE_OTHER] = -1;
DEFAULT_MALUS[PathType.DOOR_OPEN] = 0;
DEFAULT_MALUS[PathType.DOOR_WOOD_CLOSED] = -1;
DEFAULT_MALUS[PathType.DOOR_IRON_CLOSED] = -1;
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
  /** vanilla getPreviousNode */
  get previousNode(): Node | null {
    return this.nextNodeIndex > 0 ? this.nodes[this.nextNodeIndex - 1] : null;
  }
  /** vanilla notStarted */
  notStarted(): boolean {
    return this.nextNodeIndex <= 0;
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

/** what the path finder asks of a node evaluator (vanilla NodeEvaluator) */
export interface NodeEvaluator {
  prepare(world: World, mob: PathMob): void;
  done(): void;
  getStart(): Node | null;
  /** fills `out` with the nodes to try from `node`, returning how many */
  neighbors(out: Node[], node: Node): number;
}

/** ground-walking node evaluator (vanilla WalkNodeEvaluator) */
export class WalkNodeEvaluator implements NodeEvaluator {
  protected mob!: PathMob;
  protected world!: World;
  private nodes = new Map<number, Node>();
  private rawCache = new Map<number, PathType>();
  private staticCache = new Map<number, PathType>();
  private mobCache = new Map<number, PathType>();
  canFloat = false;
  /** vanilla canOpenDoors: closed wooden doors are a way through (villagers) */
  canOpenDoors = false;
  /** vanilla canPassDoors: open doors are a way through */
  canPassDoors = true;
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
        for (let l = 0; l < this.ew; l++) {
          // vanilla getPathTypeWithinMobBB: doors as this mob sees them
          let t = this.staticType(x + i, y + j, z + l);
          if (t === PathType.DOOR_WOOD_CLOSED && this.canOpenDoors && this.canPassDoors) t = PathType.WALKABLE_DOOR;
          if (t === PathType.DOOR_OPEN && !this.canPassDoors) t = PathType.BLOCKED;
          mask |= 1 << t;
        }
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
    if ((this.canFloat || this.isAmphibious()) && FLAGS[this.world.getState(x, y, z)] & F_WATER) return y + 0.5;
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

  /** vanilla isAmphibious: water is somewhere to go in its own right (AmphibiousNodeEvaluator) */
  protected isAmphibious(): boolean {
    return false;
  }

  protected startNode(x: number, y: number, z: number): Node {
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
  protected acceptedNode(x: number, y: number, z: number, vertical: number, nodeFloor: number, dx: number, dz: number, fromType: PathType): Node | null {
    let node: Node | null = null;
    const floor = this.floorLevel(x, y, z);
    if (floor - nodeFloor > this.jumpHeight()) return null;
    const t = this.mobType(x, y, z);
    const malus = this.mob.malus(t);
    if (malus >= 0) node = this.nodeWithMalus(x, y, z, t, malus);
    if (t === PathType.WALKABLE || (t === PathType.WATER && this.isAmphibious())) return node;
    if ((node === null || node.costMalus < 0) && vertical > 0 && t !== PathType.FENCE && t !== PathType.TRAPDOOR) {
      return this.tryJumpOn(x, y, z, vertical, nodeFloor, dx, dz, fromType);
    }
    if (t === PathType.WATER && !this.canFloat && !this.isAmphibious()) return this.firstNonWaterBelow(x, y, z, node);
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

// the six directions in vanilla Direction order (down, up, north, south, west, east), and each horizontal one (north,
// east, south, west) with the next one clockwise
const DIRS6 = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
const CLOCKWISE_PAIRS = [[2, 5], [5, 3], [3, 4], [4, 2]];

/**
 * vanilla SwimNodeEvaluator (not breaching: a drowned's): a way through water, up and down as well as across and
 * over the diagonals, only through cells where all of the mob would be in water
 */
export class SwimNodeEvaluator implements NodeEvaluator {
  private mob!: PathMob;
  private world!: World;
  private nodes = new Map<number, Node>();
  private types = new Map<number, PathType>();
  private readonly got: (Node | null)[] = [null, null, null, null, null, null];
  private ew = 1;
  private eh = 1;

  prepare(world: World, mob: PathMob): void {
    this.world = world;
    this.mob = mob;
    this.nodes.clear();
    this.types.clear();
    this.ew = Math.floor(mob.width + 1);
    this.eh = Math.floor(mob.height + 1);
  }

  done(): void {
    this.nodes.clear();
    this.types.clear();
  }

  private getNode(x: number, y: number, z: number): Node {
    const k = key(x, y, z);
    let n = this.nodes.get(k);
    if (!n) {
      n = new Node(x, y, z);
      this.nodes.set(k, n);
    }
    return n;
  }

  /** vanilla getStart: the cell at the corner of its feet (half a block up) */
  getStart(): Node {
    const bb = this.mob.bb;
    return this.getNode(Math.floor(bb.minX), Math.floor(bb.minY + 0.5), Math.floor(bb.minZ));
  }

  /** vanilla getNeighbors: the six ways, then each diagonal between two open horizontal ones */
  neighbors(out: Node[], node: Node): number {
    let i = 0;
    for (let d = 0; d < 6; d++) {
      const n = this.acceptedNode(node.x + DIRS6[d][0], node.y + DIRS6[d][1], node.z + DIRS6[d][2]);
      this.got[d] = n;
      if (n && !n.closed) out[i++] = n;
    }
    for (const [a, b] of CLOCKWISE_PAIRS) {
      const na = this.got[a], nb = this.got[b];
      if (!na || na.costMalus < 0 || !nb || nb.costMalus < 0) continue;
      const n = this.acceptedNode(node.x + DIRS6[a][0] + DIRS6[b][0], node.y, node.z + DIRS6[a][2] + DIRS6[b][2]);
      if (n && !n.closed) out[i++] = n;
    }
    return i;
  }

  /** vanilla findAcceptedNode: a water cell the mob doesn't mind (8 more for one with no water in it) */
  private acceptedNode(x: number, y: number, z: number): Node | null {
    const t = this.cachedType(x, y, z);
    if (t !== PathType.WATER) return null;
    const f = this.mob.malus(t);
    if (f < 0) return null;
    const n = this.getNode(x, y, z);
    n.type = t;
    n.costMalus = Math.max(n.costMalus, f);
    if (fluidType(this.world.getState(x, y, z)) === FLUID_NONE) n.costMalus += 8;
    return n;
  }

  private cachedType(x: number, y: number, z: number): PathType {
    const k = key(x, y, z);
    let t = this.types.get(k);
    if (t === undefined) {
      t = this.mobType(x, y, z);
      this.types.set(k, t);
    }
    return t;
  }

  /**
   * vanilla getPathTypeOfMob: water right through the mob's footprint, and the last cell looked at one that can be
   * swum through (not a waterlogged block in the way)
   */
  mobType(x: number, y: number, z: number): PathType {
    let st = 0;
    for (let i = x; i < x + this.ew; i++)
      for (let j = y; j < y + this.eh; j++)
        for (let k = z; k < z + this.ew; k++) {
          st = this.world.getState(i, j, k);
          if (fluidType(st) !== FLUID_WATER) return PathType.BLOCKED;
        }
    const boxes = COLLISION[st];
    return boxes && boxes.length ? PathType.BLOCKED : PathType.WATER;
  }
}

/** a mob whose maluses an evaluator may change while it finds a way (vanilla Mob.setPathfindingMalus) */
type MalusSetter = PathMob & { setPathfindingMalus(t: PathType, v: number): void };

/**
 * vanilla AmphibiousNodeEvaluator (Stage 5: ocean; a turtle's, an axolotl's): it walks as the walkers do, but water
 * is somewhere to be rather than something to get across — it swims up and down through it as well as along it, a
 * cell of water costing nothing, dry ground 6 and water up against something solid 4 while it looks (the ground's and
 * the border's costs put back after); in the water it starts from the cell at the corner of its feet.
 * `prefersShallowSwimming` (an axolotl's) makes water more than ten below the sea a little dearer
 */
export class AmphibiousNodeEvaluator extends WalkNodeEvaluator {
  private oldWalkable = 0;
  private oldWaterBorder = 0;

  constructor(readonly prefersShallowSwimming: boolean) {
    super();
  }

  override prepare(world: World, mob: PathMob): void {
    super.prepare(world, mob);
    const m = mob as MalusSetter;
    m.setPathfindingMalus(PathType.WATER, 0);
    this.oldWalkable = m.malus(PathType.WALKABLE);
    m.setPathfindingMalus(PathType.WALKABLE, 6);
    this.oldWaterBorder = m.malus(PathType.WATER_BORDER);
    m.setPathfindingMalus(PathType.WATER_BORDER, 4);
  }

  override done(): void {
    const m = this.mob as MalusSetter;
    m.setPathfindingMalus(PathType.WALKABLE, this.oldWalkable);
    m.setPathfindingMalus(PathType.WATER_BORDER, this.oldWaterBorder);
    super.done();
  }

  protected override isAmphibious(): boolean {
    return true;
  }

  /** vanilla getStart: out of the water as a walker starts; in it, at the corner of its feet half a block up */
  override getStart(): Node | null {
    if (!this.mob.inWater) return super.getStart();
    const bb = this.mob.bb;
    return this.startNode(Math.floor(bb.minX), Math.floor(bb.minY + 0.5), Math.floor(bb.minZ));
  }

  /** vanilla getNeighbors: the walker's, then straight up and straight down where that's water */
  override neighbors(out: Node[], node: Node): number {
    let i = super.neighbors(out, node);
    const above = this.mobType(node.x, node.y + 1, node.z);
    const here = this.mobType(node.x, node.y, node.z);
    const j = this.mob.malus(above) >= 0 ? Math.floor(Math.max(1, this.mob.stepHeight)) : 0;
    const floor = this.floorLevel(node.x, node.y, node.z);
    const up = this.acceptedNode(node.x, node.y + 1, node.z, Math.max(0, j - 1), floor, 0, 0, here);
    const down = this.acceptedNode(node.x, node.y - 1, node.z, j, floor, 0, 0, here);
    if (up && this.verticalOk(up, node)) out[i++] = up;
    if (down && this.verticalOk(down, node) && here !== PathType.TRAPDOOR) out[i++] = down;
    if (this.prefersShallowSwimming) for (let k = 0; k < i; k++) if (out[k].type === PathType.WATER && out[k].y < SEA_LEVEL - 10) out[k].costMalus++;
    return i;
  }

  /** vanilla isVerticalNeighborValid: a way on (isNeighborValid) that is water */
  private verticalOk(n: Node, from: Node): boolean {
    return !n.closed && (n.costMalus >= 0 || from.costMalus < 0) && n.type === PathType.WATER;
  }

  /** vanilla AmphibiousNodeEvaluator.getPathType: water with something solid on any of its six sides is a water border */
  override staticType(x: number, y: number, z: number): PathType {
    if (this.rawType(x, y, z) !== PathType.WATER) return super.staticType(x, y, z);
    for (const [dx, dy, dz] of DIRS6) if (this.rawType(x + dx, y + dy, z + dz) === PathType.BLOCKED) return PathType.WATER_BORDER;
    return PathType.WATER;
  }
}

/**
 * vanilla WalkNodeEvaluator.isBurningBlock: fire, lava, magma blocks, lit
 * campfires of either kind and lava cauldrons
 */
export function isBurningBlock(st: number): boolean {
  if (FLAGS[st] & F_LAVA) return true;
  const b = BLOCKS[STATE_BLOCK[st]];
  const name = b.name;
  if (name === 'fire' || name === 'soul_fire' || name === 'magma_block' || name === 'lava_cauldron') return true;
  return (name === 'campfire' || name === 'soul_campfire') && !!b.get(st, 'lit');
}

/** vanilla getPathTypeFromState for a single block */
export function rawPathType(world: World, x: number, y: number, z: number): PathType {
  const st = world.getState(x, y, z);
  const f = FLAGS[st];
  if (f & F_AIR) return PathType.OPEN;
  const name = BLOCKS[STATE_BLOCK[st]].name;
  // (vanilla: a door that won't open by hand is iron)
  if (name.endsWith('_door')) return BLOCKS[STATE_BLOCK[st]].get(st, 'open') ? PathType.DOOR_OPEN : name === 'iron_door' ? PathType.DOOR_IRON_CLOSED : PathType.DOOR_WOOD_CLOSED;
  if (name.endsWith('_fence_gate')) return BLOCKS[STATE_BLOCK[st]].get(st, 'open') ? PathType.OPEN : PathType.FENCE;
  if (name.endsWith('_trapdoor') || name === 'lily_pad') return PathType.TRAPDOOR;
  if (name === 'fire') return PathType.DAMAGE_FIRE;
  if (name.endsWith('_bed')) return PathType.BLOCKED;
  if (name === 'cactus' || name === 'sweet_berry_bush') return PathType.DAMAGE_OTHER;
  if (name === 'wither_rose' || name === 'pointed_dripstone') return PathType.DAMAGE_CAUTIOUS;
  if (f & F_LAVA) return PathType.LAVA;
  if (isBurningBlock(st)) return PathType.DAMAGE_FIRE;
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
export function findPath(evaluator: NodeEvaluator, world: World, mob: PathMob, target: PathTarget, maxRange: number, accuracy: number, maxVisited: number): Path | null {
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
