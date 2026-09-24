// Path following (vanilla PathNavigation / GroundPathNavigation): waypoint
// advancing, corner cutting, stuck detection, sun avoidance.

import { findPath, Path, PathType, WalkNodeEvaluator } from './pathfinder';
import type { Mob } from '../mob';
import type { Entity } from '../entity';
import { FLAGS, F_AIR, F_COLLIDE, F_OPAQUE } from '../../world/block';
import { MIN_Y, MAX_Y } from '../../world/constants';

export class PathNavigation {
  path: Path | null = null;
  speedModifier = 1;
  readonly evaluator = new WalkNodeEvaluator();
  avoidSun = false;
  isStuck = false;
  private tickCount = 0;
  private lastStuckCheck = 0;
  private lastStuck: [number, number, number] = [0, 0, 0];
  private timeoutNode: string | null = null;
  private timeoutTimer = 0;
  private lastTimeoutCheck = 0;
  private timeoutLimit = 0;
  private maxDistanceToWaypoint = 0.5;
  targetPos: [number, number, number] | null = null;
  private reachRange = 0;
  /** multiplier for maxVisitedNodes (vanilla setMaxVisitedNodesMultiplier) */
  maxVisitedMultiplier = 1;

  constructor(readonly mob: Mob) {}

  set canFloat(v: boolean) {
    this.evaluator.canFloat = v;
  }
  get canFloat(): boolean {
    return this.evaluator.canFloat;
  }

  private canUpdatePath(): boolean {
    return this.mob.onGround || this.mob.inWater || this.mob.inLava;
  }

  /** GroundPathNavigation.createPath(BlockPos): snap the target to standable ground */
  createPath(x: number, y: number, z: number, accuracy: number): Path | null {
    const w = this.mob.level.world;
    let bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    if (!w.isLoaded(bx, bz)) return null;
    const isAir = (yy: number) => (FLAGS[w.getState(bx, yy, bz)] & F_AIR) !== 0;
    const solid = (yy: number) => (FLAGS[w.getState(bx, yy, bz)] & (F_COLLIDE | F_OPAQUE)) !== 0;
    if (isAir(by)) {
      let b = by - 1;
      while (b > MIN_Y && isAir(b)) b--;
      if (b > MIN_Y) return this.createPathRaw(bx, b + 1, bz, accuracy);
      while (b < MAX_Y && isAir(b)) b++;
      by = b;
    }
    if (!solid(by)) return this.createPathRaw(bx, by, bz, accuracy);
    let a = by + 1;
    while (a < MAX_Y && solid(a)) a++;
    return this.createPathRaw(bx, a, bz, accuracy);
  }

  createPathToEntity(e: Entity, accuracy: number): Path | null {
    return this.createPath(e.x, e.y, e.z, accuracy);
  }

  /** vanilla PathNavigation.createPath(Set<BlockPos>, accuracy): to the block itself, not the ground by it */
  createPathToBlock(x: number, y: number, z: number, accuracy: number): Path | null {
    return this.createPathRaw(x, y, z, accuracy);
  }

  private createPathRaw(x: number, y: number, z: number, accuracy: number): Path | null {
    if (this.mob.y < MIN_Y || !this.canUpdatePath()) return null;
    if (this.path && !this.path.isDone() && this.targetPos && this.targetPos[0] === x && this.targetPos[1] === y && this.targetPos[2] === z) return this.path;
    const range = this.mob.followRange;
    const path = findPath(this.evaluator, this.mob.level.world, this.mob, { x, y, z }, range, accuracy, Math.floor(range * 16 * this.maxVisitedMultiplier));
    if (path) {
      this.targetPos = [x, y, z];
      this.reachRange = accuracy;
      this.resetStuckTimeout();
    }
    return path;
  }

  moveTo(x: number, y: number, z: number, speed: number): boolean {
    return this.moveToPath(this.createPath(x, y, z, 1), speed);
  }

  moveToEntity(e: Entity, speed: number): boolean {
    const p = this.createPathToEntity(e, 1);
    return p !== null && this.moveToPath(p, speed);
  }

  moveToPath(path: Path | null, speed: number): boolean {
    if (!path) {
      this.path = null;
      return false;
    }
    if (!path.sameAs(this.path)) this.path = path;
    if (this.isDone()) return false;
    this.trimPath();
    if (this.path!.nodes.length <= 0) return false;
    this.speedModifier = speed;
    const [x, y, z] = this.tempMobPos();
    this.lastStuckCheck = this.tickCount;
    this.lastStuck = [x, y, z];
    return true;
  }

  /** GroundPathNavigation.trimPath: stop the path before it leaves shade (avoidSun) */
  private trimPath(): void {
    const p = this.path;
    if (!p || !this.avoidSun) return;
    const w = this.mob.level.world;
    const bx = Math.floor(this.mob.x), by = Math.floor(this.mob.y + 0.5), bz = Math.floor(this.mob.z);
    if (by >= w.heightAt(bx, bz)) return;
    for (let i = 0; i < p.nodes.length; i++) {
      const n = p.nodes[i];
      if (n.y >= w.heightAt(n.x, n.z)) {
        p.nodes.length = i;
        return;
      }
    }
  }

  isDone(): boolean {
    return !this.path || this.path.isDone();
  }

  isInProgress(): boolean {
    return !this.isDone();
  }

  stop(): void {
    this.path = null;
  }

  private tempMobPos(): [number, number, number] {
    return [this.mob.x, this.mob.y, this.mob.z];
  }

  tick(): void {
    this.tickCount++;
    if (this.isDone()) return;
    if (this.canUpdatePath()) this.followThePath();
    if (!this.isDone()) {
      const p = this.path!;
      const [x, y, z] = p.entityPosAt(this.mob.width, p.nextNodeIndex);
      this.mob.moveControl.setWantedPosition(x, this.groundY(x, y, z), z, this.speedModifier);
    }
  }

  private groundY(x: number, y: number, z: number): number {
    const w = this.mob.level.world;
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    if (FLAGS[w.getState(bx, by - 1, bz)] & F_AIR) return y;
    return this.evaluator.floorLevelAt(w, bx, by, bz);
  }

  private followThePath(): void {
    const p = this.path!;
    const m = this.mob;
    const pos = this.tempMobPos();
    this.maxDistanceToWaypoint = m.width > 0.75 ? m.width / 2 : 0.75 - m.width / 2;
    const n = p.nextNode;
    const d0 = Math.abs(m.x - (n.x + 0.5)), d1 = Math.abs(m.y - n.y), d2 = Math.abs(m.z - (n.z + 0.5));
    const close = d0 < this.maxDistanceToWaypoint && d2 < this.maxDistanceToWaypoint && d1 < 1;
    if (close || (this.canCutCorner(n.type) && this.shouldTargetNextNode(pos))) p.advance();
    this.doStuckDetection(pos);
  }

  private canCutCorner(t: PathType): boolean {
    return t !== PathType.DANGER_FIRE && t !== PathType.DANGER_OTHER;
  }

  private shouldTargetNextNode(pos: [number, number, number]): boolean {
    const p = this.path!;
    if (p.nextNodeIndex + 1 >= p.nodes.length) return false;
    const n = p.nextNode;
    const ax = n.x + 0.5 - pos[0], ay = n.y - pos[1], az = n.z + 0.5 - pos[2];
    if (ax * ax + ay * ay + az * az >= 4) return false;
    const n2 = p.nodes[p.nextNodeIndex + 1];
    const bx = n2.x + 0.5 - pos[0], by = n2.y - pos[1], bz = n2.z + 0.5 - pos[2];
    const da = ax * ax + ay * ay + az * az, db = bx * bx + by * by + bz * bz;
    if (!(db < da) && !(da < 0.5)) return false;
    const la = Math.sqrt(da) || 1, lb = Math.sqrt(db) || 1;
    return (ax / la) * (bx / lb) + (ay / la) * (by / lb) + (az / la) * (bz / lb) < 0;
  }

  private doStuckDetection(pos: [number, number, number]): void {
    const m = this.mob;
    if (this.tickCount - this.lastStuckCheck > 100) {
      const f = m.speed >= 1 ? m.speed : m.speed * m.speed;
      const f1 = f * 100 * 0.25;
      const dx = pos[0] - this.lastStuck[0], dy = pos[1] - this.lastStuck[1], dz = pos[2] - this.lastStuck[2];
      if (dx * dx + dy * dy + dz * dz < f1 * f1) {
        this.isStuck = true;
        this.stop();
      } else this.isStuck = false;
      this.lastStuckCheck = this.tickCount;
      this.lastStuck = pos;
    }
    if (this.path && !this.path.isDone()) {
      const n = this.path.nextNode;
      const k = n.x + ',' + n.y + ',' + n.z;
      const t = m.level.gameTime;
      if (k === this.timeoutNode) this.timeoutTimer += t - this.lastTimeoutCheck;
      else {
        this.timeoutNode = k;
        const d = Math.hypot(pos[0] - (n.x + 0.5), pos[1] - n.y, pos[2] - (n.z + 0.5));
        this.timeoutLimit = m.speed > 0 ? (d / m.speed) * 20 : 0;
      }
      if (this.timeoutLimit > 0 && this.timeoutTimer > this.timeoutLimit * 3) {
        this.resetStuckTimeout();
        this.stop();
      }
      this.lastTimeoutCheck = t;
    }
  }

  private resetStuckTimeout(): void {
    this.timeoutNode = null;
    this.timeoutTimer = 0;
    this.timeoutLimit = 0;
    this.isStuck = false;
  }

  /** vanilla isStableDestination: something solid to stand on */
  isStableDestination(x: number, y: number, z: number): boolean {
    const st = this.mob.level.world.getState(x, y - 1, z);
    return (FLAGS[st] & F_OPAQUE) !== 0;
  }

  /** the mob's path type at a block (MoveControl.isWalkable) */
  evaluatorTypeAt(x: number, y: number, z: number): PathType {
    this.evaluator.prepare(this.mob.level.world, this.mob);
    const t = this.evaluator.mobType(x, y, z);
    this.evaluator.done();
    return t;
  }

  get reach(): number {
    return this.reachRange;
  }
}
