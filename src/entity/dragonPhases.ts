// The ender dragon's phases (vanilla EnderDragonPhase, EnderDragonPhaseManager
// and the phase instances in world.entity.boss.enderdragon.phases): circling the
// pillars on the flight graph, swooping at a player to spit a fireball,
// approaching and landing on the exit portal, perching there to scan for
// someone to roar at and breathe on, charging a player it can see, taking off
// again, and dying. Each phase says where to fly and how fast to turn; the
// dragon (enderDragon.ts) does the flying.
//
// Vanilla runs each phase twice, once on the server and once on the client (the
// client's copy only makes the breath particles and the roaring); here the one
// instance does both, with the client's counters kept apart.

import type { EnderDragon } from './enderDragon';
import { DragonNode, DragonPath, heightmapY, mthCos, mthSin } from './enderDragon';
import type { Entity } from './entity';
import type { LivingEntity } from './living';
import { Arrow } from './arrow';
import { DragonFireball } from './dragonFireball';
import { AreaEffectCloud } from './areaEffectCloud';
import { FLAGS, F_AIR } from '../world/block';

const fr = Math.fround;
const DEG = Math.PI / 180;

/** vanilla EnderDragonPhase ids (saved as DragonPhase) */
export const PHASE = {
  HOLDING_PATTERN: 0,
  STRAFE_PLAYER: 1,
  LANDING_APPROACH: 2,
  LANDING: 3,
  TAKEOFF: 4,
  SITTING_FLAMING: 5,
  SITTING_SCANNING: 6,
  SITTING_ATTACKING: 7,
  CHARGING_PLAYER: 8,
  DYING: 9,
  HOVERING: 10,
} as const;

/**
 * vanilla getNearestPlayer(TargetingConditions.forCombat, dragon, x, y, z) (with the dragon testing): the nearest to
 * `from` (the dragon, unless it says) of the players who can be fought; within `range` (scaled by how visible they are
 * — sneaking, invisibility) when there is one; seen, when `los` — through the dragon's Sensing, which it never clears
 * (vanilla: the dragon has no serverAiStep), so whether it once saw you is what it goes on
 */
function combatTarget(d: EnderDragon, range: number, los: boolean, selector?: (p: LivingEntity) => boolean, from: readonly [number, number, number] = [d.x, d.y, d.z]): LivingEntity | null {
  return d.level.nearestPlayer(from[0], from[1], from[2], -1, (p) => {
    if (!p.isAlive || p.gameMode === 'spectator') return false;
    if (selector && !selector(p)) return false;
    if (!d.canAttack(p)) return false;
    if (range > 0) {
      const r = Math.max(range * p.visibilityPercent(d), 2);
      if (d.distanceToSqr(p.x, p.y, p.z) > r * r) return false;
    }
    return !los || d.sensing.hasLineOfSight(p);
  });
}

/** a random height at or above the node's (vanilla: node y + nextFloat() * 20) */
function aboveNode(d: EnderDragon, n: DragonNode): number {
  let y: number;
  do y = fr(n.y + fr(d.random.nextFloat() * 20));
  while (y < n.y);
  return y;
}

/** vanilla AbstractDragonPhaseInstance */
export abstract class DragonPhase {
  abstract readonly id: number;
  constructor(protected readonly dragon: EnderDragon) {}
  isSitting(): boolean {
    return false;
  }
  doClientTick(): void {}
  doServerTick(): void {}
  /** a crystal went (whoever did it, or the nearest player who could be blamed) */
  onCrystalDestroyed(_player: LivingEntity | null): void {}
  begin(): void {}
  end(): void {}
  getFlySpeed(): number {
    return 0.6;
  }
  getFlyTargetLocation(): [number, number, number] | null {
    return null;
  }
  /** the damage the dragon takes, after the phase has had its say */
  onHurt(_source: string, amount: number, _direct: Entity | null): number {
    return amount;
  }
  /** vanilla getTurnSpeed: the faster it flies, the wider it turns */
  getTurnSpeed(): number {
    const d = this.dragon;
    const f = fr(Math.sqrt(d.dx * d.dx + d.dz * d.dz)) + 1;
    const f1 = Math.min(f, 40);
    return 0.7 / f1 / f;
  }
}

/** vanilla AbstractDragonSittingPhase: arrows glance off a perched dragon, set alight */
abstract class SittingPhase extends DragonPhase {
  override isSitting(): boolean {
    return true;
  }
  override onHurt(source: string, amount: number, direct: Entity | null): number {
    if (direct instanceof Arrow) {
      direct.igniteForSeconds(1);
      return 0;
    }
    return super.onHurt(source, amount, direct);
  }
}

/** the shared "fly the path, a node at a time" of the circling phases (vanilla navigateToNextPathNode) */
function nextPathTarget(d: EnderDragon, path: DragonPath | null): [number, number, number] | null {
  if (!path || path.isDone()) return null;
  const n = path.nextNodePos();
  path.advance();
  return [n.x, aboveNode(d, n), n.z];
}

/** vanilla DragonHoldingPatternPhase: circling the outer ring of nodes, now and then turning round; landing or strafing a player */
export class HoldingPatternPhase extends DragonPhase {
  readonly id = PHASE.HOLDING_PATTERN;
  private currentPath: DragonPath | null = null;
  private targetLocation: [number, number, number] | null = null;
  private clockwise = false;

  override doServerTick(): void {
    const t = this.targetLocation, d = this.dragon;
    const d0 = t ? d.distanceToSqr(t[0], t[1], t[2]) : 0;
    if (d0 < 100 || d0 > 22500 || d.horizontalCollision || d.verticalCollision) this.findNewTarget();
  }
  override begin(): void {
    this.currentPath = null;
    this.targetLocation = null;
  }
  override getFlyTargetLocation(): [number, number, number] | null {
    return this.targetLocation;
  }
  private findNewTarget(): void {
    const d = this.dragon;
    if (this.currentPath && this.currentPath.isDone()) {
      const [px, py, pz] = d.podiumTop();
      const i = d.dragonFight ? d.dragonFight.crystalsAlive : 0;
      if (d.random.nextInt(i + 3) === 0) {
        d.phaseManager.setPhase(PHASE.LANDING_APPROACH);
        return;
      }
      const player = combatTarget(d, -1, false, undefined, [px, py, pz]);
      // vanilla distToCenterSqr(player.position()) / 512
      const d0 = player ? ((player.x - px - 0.5) ** 2 + (player.y - py - 0.5) ** 2 + (player.z - pz - 0.5) ** 2) / 512 : 64;
      if (player && (d.random.nextInt(Math.trunc(d0 + 2)) === 0 || d.random.nextInt(i + 2) === 0)) {
        this.strafePlayer(player);
        return;
      }
    }
    if (!this.currentPath || this.currentPath.isDone()) {
      const j = d.findClosestNode();
      let k = j;
      if (d.random.nextInt(8) === 0) {
        this.clockwise = !this.clockwise;
        k = j + 6;
      }
      if (this.clockwise) k++;
      else k--;
      // (vanilla: `crystalsAlive >= 0`, so with a fight it keeps to the outer ring even once the crystals are gone)
      if (d.dragonFight && d.dragonFight.crystalsAlive >= 0) {
        k %= 12;
        if (k < 0) k += 12;
      } else {
        k -= 12;
        k &= 7;
        k += 12;
      }
      this.currentPath = d.findPath(j, k, null);
      this.currentPath?.advance();
    }
    this.targetLocation = nextPathTarget(d, this.currentPath) ?? this.targetLocation;
  }
  private strafePlayer(p: LivingEntity): void {
    const pm = this.dragon.phaseManager;
    pm.setPhase(PHASE.STRAFE_PLAYER);
    (pm.getPhase(PHASE.STRAFE_PLAYER) as StrafePlayerPhase).setTarget(p);
  }
  override onCrystalDestroyed(player: LivingEntity | null): void {
    if (player && this.dragon.canAttack(player)) this.strafePlayer(player);
  }
}

/** vanilla DragonStrafePlayerPhase: a swoop toward a player; lined up within 10° for a quarter second, a fireball */
export class StrafePlayerPhase extends DragonPhase {
  readonly id = PHASE.STRAFE_PLAYER;
  private fireballCharge = 0;
  private currentPath: DragonPath | null = null;
  private targetLocation: [number, number, number] | null = null;
  private attackTarget: LivingEntity | null = null;
  private holdingPatternClockwise = false;

  override doServerTick(): void {
    const d = this.dragon, t = this.attackTarget;
    if (!t) {
      d.phaseManager.setPhase(PHASE.HOLDING_PATTERN);
      return;
    }
    if (this.currentPath && this.currentPath.isDone()) {
      const d2 = t.x - d.x, d3 = t.z - d.z;
      const d5 = Math.min(fr(0.4) + Math.sqrt(d2 * d2 + d3 * d3) / 80 - 1, 10);
      this.targetLocation = [t.x, t.y + d5, t.z];
    }
    const tl = this.targetLocation;
    const d12 = tl ? d.distanceToSqr(tl[0], tl[1], tl[2]) : 0;
    if (d12 < 100 || d12 > 22500) this.findNewTarget();
    if (t.distanceToSqr(d.x, d.y, d.z) < 4096) {
      if (d.hasLineOfSight(t)) {
        this.fireballCharge++;
        const [ax, , az] = norm(t.x - d.x, 0, t.z - d.z);
        const [bx, , bz] = norm(mthSin(d.yaw * DEG), 0, -mthCos(d.yaw * DEG));
        const f1 = fr(bx * ax + bz * az);
        const f = fr(fr(Math.acos(f1) * fr(180 / Math.PI)) + 0.5);
        if (this.fireballCharge >= 5 && f >= 0 && f < 10) {
          const [vx, , vz] = d.viewVector();
          const x0 = d.head.x - vx, y0 = d.head.y + d.head.height * 0.5 + 0.5, z0 = d.head.z - vz;
          const lvl = d.level;
          // vanilla level event 1017: the dragon's spit
          const r = lvl.random;
          lvl.sound.play('entity.ender_dragon.shoot', Math.floor(d.x) + 0.5, Math.floor(d.y) + 0.5, Math.floor(d.z) + 0.5, 10, (r.nextFloat() - r.nextFloat()) * 0.2 + 1);
          const ball = new DragonFireball(lvl, d, t.x - x0, t.y + t.height * 0.5 - y0, t.z - z0);
          ball.moveTo(x0, y0, z0, 0, 0);
          lvl.addEntity(ball);
          this.fireballCharge = 0;
          if (this.currentPath) while (!this.currentPath.isDone()) this.currentPath.advance();
          d.phaseManager.setPhase(PHASE.HOLDING_PATTERN);
        }
      } else if (this.fireballCharge > 0) this.fireballCharge--;
    } else if (this.fireballCharge > 0) this.fireballCharge--;
  }
  private findNewTarget(): void {
    const d = this.dragon;
    if (!this.currentPath || this.currentPath.isDone()) {
      const i = d.findClosestNode();
      let j = i;
      if (d.random.nextInt(8) === 0) {
        this.holdingPatternClockwise = !this.holdingPatternClockwise;
        j = i + 6;
      }
      if (this.holdingPatternClockwise) j++;
      else j--;
      if (d.dragonFight && d.dragonFight.crystalsAlive > 0) {
        j %= 12;
        if (j < 0) j += 12;
      } else {
        j -= 12;
        j &= 7;
        j += 12;
      }
      this.currentPath = d.findPath(i, j, null);
      this.currentPath?.advance();
    }
    this.targetLocation = nextPathTarget(d, this.currentPath) ?? this.targetLocation;
  }
  override begin(): void {
    this.fireballCharge = 0;
    this.targetLocation = null;
    this.currentPath = null;
    this.attackTarget = null;
  }
  /** vanilla setTarget: a path to the graph node nearest the player, then on to a point above them */
  setTarget(t: LivingEntity): void {
    const d = this.dragon;
    this.attackTarget = t;
    const i = d.findClosestNode();
    const j = d.findClosestNodeTo(t.x, t.y, t.z);
    const k = Math.floor(t.x), l = Math.floor(t.z);
    const d0 = k - d.x, d1 = l - d.z;
    const d3 = Math.min(fr(0.4) + Math.sqrt(d0 * d0 + d1 * d1) / 80 - 1, 10);
    const node = new DragonNode(k, Math.floor(t.y + d3), l);
    this.currentPath = d.findPath(i, j, node);
    if (this.currentPath) {
      this.currentPath.advance();
      this.targetLocation = nextPathTarget(d, this.currentPath) ?? this.targetLocation;
    }
  }
  override getFlyTargetLocation(): [number, number, number] | null {
    return this.targetLocation;
  }
}

/** vanilla DragonLandingApproachPhase: along the graph to the exit portal, coming in from the side away from the player */
export class LandingApproachPhase extends DragonPhase {
  readonly id = PHASE.LANDING_APPROACH;
  private currentPath: DragonPath | null = null;
  private targetLocation: [number, number, number] | null = null;

  override begin(): void {
    this.currentPath = null;
    this.targetLocation = null;
  }
  override doServerTick(): void {
    const d = this.dragon, t = this.targetLocation;
    const d0 = t ? d.distanceToSqr(t[0], t[1], t[2]) : 0;
    if (d0 < 100 || d0 > 22500 || d.horizontalCollision || d.verticalCollision) this.findNewTarget();
  }
  override getFlyTargetLocation(): [number, number, number] | null {
    return this.targetLocation;
  }
  private findNewTarget(): void {
    const d = this.dragon;
    if (!this.currentPath || this.currentPath.isDone()) {
      const i = d.findClosestNode();
      const [px, py, pz] = d.podiumTop();
      const player = combatTarget(d, -1, false, undefined, [px, py, pz]);
      let j: number;
      if (player) {
        const [vx, , vz] = norm(player.x, 0, player.z);
        j = d.findClosestNodeTo(-vx * 40, 105, -vz * 40);
      } else j = d.findClosestNodeTo(40, py, 0);
      this.currentPath = d.findPath(i, j, new DragonNode(px, py, pz));
      this.currentPath?.advance();
    }
    this.targetLocation = nextPathTarget(d, this.currentPath) ?? this.targetLocation;
    if (this.currentPath && this.currentPath.isDone()) d.phaseManager.setPhase(PHASE.LANDING);
  }
}

/** vanilla DragonLandingPhase: down onto the top of the exit portal's pillar, trailing breath */
export class LandingPhase extends DragonPhase {
  readonly id = PHASE.LANDING;
  private targetLocation: [number, number, number] | null = null;

  override doClientTick(): void {
    const d = this.dragon;
    const [lx, ly, lz] = norm(...d.getHeadLookVector());
    // (vanilla turns the vector for each puff, but throws the turned one away: they all go the same way)
    const x0 = d.head.x, y0 = d.head.y + d.head.height * 0.5, z0 = d.head.z;
    const r = d.random;
    for (let i = 0; i < 8; i++) {
      const x = x0 + r.gaussian() / 2, y = y0 + r.gaussian() / 2, z = z0 + r.gaussian() / 2;
      d.level.particles.spawn?.('dragon_breath', x, y, z, -lx * fr(0.08) + d.dx, -ly * fr(0.3) + d.dy, -lz * fr(0.08) + d.dz);
    }
  }
  override doServerTick(): void {
    const d = this.dragon;
    if (!this.targetLocation) {
      const [px, py, pz] = d.podiumTop();
      this.targetLocation = [px + 0.5, py, pz + 0.5];
    }
    const t = this.targetLocation;
    if (d.distanceToSqr(t[0], t[1], t[2]) < 1) {
      (d.phaseManager.getPhase(PHASE.SITTING_FLAMING) as SittingFlamingPhase).resetFlameCount();
      d.phaseManager.setPhase(PHASE.SITTING_SCANNING);
    }
  }
  override getFlySpeed(): number {
    return 1.5;
  }
  override getTurnSpeed(): number {
    const d = this.dragon;
    const f = fr(Math.sqrt(d.dx * d.dx + d.dz * d.dz)) + 1;
    return Math.min(f, 40) / f;
  }
  override begin(): void {
    this.targetLocation = null;
  }
  override getFlyTargetLocation(): [number, number, number] | null {
    return this.targetLocation;
  }
}

/** vanilla DragonSittingScanningPhase: perched, turning to face a player close by — a roar if it's still there after 25 ticks */
export class SittingScanningPhase extends SittingPhase {
  readonly id = PHASE.SITTING_SCANNING;
  private scanningTime = 0;

  override doServerTick(): void {
    const d = this.dragon;
    this.scanningTime++;
    const p = combatTarget(d, 20, true, (e) => Math.abs(e.y - d.y) <= 10);
    if (p) {
      if (this.scanningTime > 25) d.phaseManager.setPhase(PHASE.SITTING_ATTACKING);
      else {
        const [ax, , az] = norm(p.x - d.x, 0, p.z - d.z);
        const [bx, , bz] = norm(mthSin(d.yaw * DEG), 0, -mthCos(d.yaw * DEG));
        const f = fr(bx * ax + bz * az);
        const f1 = fr(fr(Math.acos(f) * fr(180 / Math.PI)) + 0.5);
        if (f1 < 0 || f1 > 10) {
          const d0 = p.x - d.head.x, d1 = p.z - d.head.z;
          const d2 = Math.max(-100, Math.min(100, wrap(180 - Math.atan2(d0, d1) * fr(180 / Math.PI) - d.yaw)));
          d.yRotA *= 0.8;
          let f2 = fr(Math.sqrt(d0 * d0 + d1 * d1)) + 1;
          const f3 = f2;
          if (f2 > 40) f2 = 40;
          d.yRotA += d2 * (0.7 / f2 / f3);
          d.yaw += d.yRotA;
        }
      }
    } else if (this.scanningTime >= 100) {
      const q = combatTarget(d, 150, true);
      d.phaseManager.setPhase(PHASE.TAKEOFF);
      if (q) {
        d.phaseManager.setPhase(PHASE.CHARGING_PLAYER);
        (d.phaseManager.getPhase(PHASE.CHARGING_PLAYER) as ChargingPlayerPhase).setTarget([q.x, q.y, q.z]);
      }
    }
  }
  override begin(): void {
    this.scanningTime = 0;
  }
}

/** vanilla DragonSittingAttackingPhase: two seconds of roaring before it breathes */
export class SittingAttackingPhase extends SittingPhase {
  readonly id = PHASE.SITTING_ATTACKING;
  private attackingTicks = 0;
  /** (vanilla's client plays the growl every tick of the roar) */
  override doClientTick(): void {
    const d = this.dragon;
    d.playSound('entity.ender_dragon.growl', 2.5, 0.8 + d.random.nextFloat() * 0.3);
  }
  override doServerTick(): void {
    if (this.attackingTicks++ >= 40) this.dragon.phaseManager.setPhase(PHASE.SITTING_FLAMING);
  }
  override begin(): void {
    this.attackingTicks = 0;
  }
}

/** vanilla DragonSittingFlamingPhase: a breath of purple fire that lingers on the ground ten seconds; after four, it takes off */
export class SittingFlamingPhase extends SittingPhase {
  readonly id = PHASE.SITTING_FLAMING;
  private flameTicks = 0;
  private clientFlameTicks = 0;
  private flameCount = 0;
  private flame: AreaEffectCloud | null = null;

  override doClientTick(): void {
    const d = this.dragon;
    this.clientFlameTicks++;
    if (this.clientFlameTicks % 2 !== 0 || this.clientFlameTicks >= 10) return;
    const [lx, ly, lz] = norm(...d.getHeadLookVector());
    const x0 = d.head.x, y0 = d.head.y + d.head.height * 0.5, z0 = d.head.z;
    const r = d.random;
    for (let i = 0; i < 8; i++) {
      const x = x0 + r.gaussian() / 2, y = y0 + r.gaussian() / 2, z = z0 + r.gaussian() / 2;
      for (let j = 0; j < 6; j++) d.level.particles.spawn?.('dragon_breath', x, y, z, -lx * fr(0.08) * j, -ly * fr(0.6), -lz * fr(0.08) * j);
    }
  }
  override doServerTick(): void {
    const d = this.dragon;
    this.flameTicks++;
    if (this.flameTicks >= 200) {
      d.phaseManager.setPhase(this.flameCount >= 4 ? PHASE.TAKEOFF : PHASE.SITTING_SCANNING);
    } else if (this.flameTicks === 10) {
      // the cloud goes down on the ground two and a half blocks out in front of the head
      const [vx, , vz] = norm(d.head.x - d.x, 0, d.head.z - d.z);
      const x0 = d.head.x + (vx * 5) / 2, z0 = d.head.z + (vz * 5) / 2;
      const y0 = d.head.y + d.head.height * 0.5;
      let y = y0;
      const w = d.level.world;
      let bx = Math.floor(x0), by = Math.floor(y0), bz = Math.floor(z0);
      while (FLAGS[w.getState(bx, by, bz)] & F_AIR) {
        if (--y < 0) {
          y = y0;
          break;
        }
        bx = Math.floor(x0);
        by = Math.floor(y);
        bz = Math.floor(z0);
      }
      y = Math.floor(y) + 1;
      const c = new AreaEffectCloud(d.level, x0, y, z0);
      c.owner = d;
      c.radius = 5;
      c.duration = 200;
      c.particle = 'dragon_breath';
      // vanilla MobEffectInstance(HARM): instant damage I
      c.harm = 0;
      this.flame = c;
      d.level.addEntity(c);
    }
  }
  override begin(): void {
    this.flameTicks = 0;
    this.clientFlameTicks = 0;
    this.flameCount++;
  }
  override end(): void {
    if (this.flame) {
      this.flame.remove();
      this.flame = null;
    }
  }
  resetFlameCount(): void {
    this.flameCount = 0;
  }
}

/** vanilla DragonTakeoffPhase: off the pillar toward the graph node ahead of it, and circling again once 10 blocks clear */
export class TakeoffPhase extends DragonPhase {
  readonly id = PHASE.TAKEOFF;
  private firstTick = false;
  private currentPath: DragonPath | null = null;
  private targetLocation: [number, number, number] | null = null;

  override doServerTick(): void {
    const d = this.dragon;
    if (!this.firstTick && this.currentPath) {
      const [px, py, pz] = d.podiumTop();
      // vanilla closerToCenterThan(position, 10)
      if ((px + 0.5 - d.x) ** 2 + (py + 0.5 - d.y) ** 2 + (pz + 0.5 - d.z) ** 2 >= 100) d.phaseManager.setPhase(PHASE.HOLDING_PATTERN);
    } else {
      this.firstTick = false;
      this.findNewTarget();
    }
  }
  override begin(): void {
    this.firstTick = true;
    this.currentPath = null;
    this.targetLocation = null;
  }
  private findNewTarget(): void {
    const d = this.dragon;
    const i = d.findClosestNode();
    const [vx, , vz] = d.getHeadLookVector();
    let j = d.findClosestNodeTo(-vx * 40, 105, -vz * 40);
    if (d.dragonFight && d.dragonFight.crystalsAlive > 0) {
      j %= 12;
      if (j < 0) j += 12;
    } else {
      j -= 12;
      j &= 7;
      j += 12;
    }
    this.currentPath = d.findPath(i, j, null);
    if (this.currentPath) {
      this.currentPath.advance();
      if (!this.currentPath.isDone()) this.targetLocation = nextPathTarget(d, this.currentPath);
    }
  }
  override getFlyTargetLocation(): [number, number, number] | null {
    return this.targetLocation;
  }
}

/** vanilla DragonChargePlayerPhase: straight at where a player stood, fast; half a second after arriving, circling again */
export class ChargingPlayerPhase extends DragonPhase {
  readonly id = PHASE.CHARGING_PLAYER;
  private targetLocation: [number, number, number] | null = null;
  private timeSinceCharge = 0;

  override doServerTick(): void {
    const d = this.dragon, t = this.targetLocation;
    if (!t) d.phaseManager.setPhase(PHASE.HOLDING_PATTERN);
    else if (this.timeSinceCharge > 0 && this.timeSinceCharge++ >= 10) d.phaseManager.setPhase(PHASE.HOLDING_PATTERN);
    else {
      const d0 = d.distanceToSqr(t[0], t[1], t[2]);
      if (d0 < 100 || d0 > 22500 || d.horizontalCollision || d.verticalCollision) this.timeSinceCharge++;
    }
  }
  override begin(): void {
    this.targetLocation = null;
    this.timeSinceCharge = 0;
  }
  setTarget(t: [number, number, number]): void {
    this.targetLocation = t;
  }
  override getFlySpeed(): number {
    return 3;
  }
  override getFlyTargetLocation(): [number, number, number] | null {
    return this.targetLocation;
  }
}

/** vanilla DragonDeathPhase: brought down, it makes for the exit portal (its health held at 1 till it's within 10 blocks) */
export class DyingPhase extends DragonPhase {
  readonly id = PHASE.DYING;
  private targetLocation: [number, number, number] | null = null;
  private time = 0;
  private clientTime = 0;

  /** (the client's great bursts every half second on the way) */
  override doClientTick(): void {
    const d = this.dragon;
    if (this.clientTime++ % 10 !== 0) return;
    const r = d.random;
    const f = (r.nextFloat() - 0.5) * 8, f1 = (r.nextFloat() - 0.5) * 4, f2 = (r.nextFloat() - 0.5) * 8;
    d.level.particles.spawn?.('explosion_emitter', d.x + f, d.y + 2 + f1, d.z + f2, 0, 0, 0);
  }
  override doServerTick(): void {
    const d = this.dragon;
    this.time++;
    if (!this.targetLocation) {
      // vanilla: MOTION_BLOCKING (not NO_LEAVES) over the portal, at the block's bottom centre
      const [ox, , oz] = d.fightOrigin;
      this.targetLocation = [ox + 0.5, heightmapY(d.level, ox, oz), oz + 0.5];
    }
    const t = this.targetLocation;
    const d0 = d.distanceToSqr(t[0], t[1], t[2]);
    if (!(d0 < 100) && !(d0 > 22500) && !d.horizontalCollision && !d.verticalCollision) d.health = 1;
    else d.health = 0;
  }
  override begin(): void {
    this.targetLocation = null;
    this.time = 0;
    this.clientTime = 0;
  }
  override getFlySpeed(): number {
    return 3;
  }
  override getFlyTargetLocation(): [number, number, number] | null {
    return this.targetLocation;
  }
}

/** vanilla DragonHoverPhase: hangs where it is (a dragon summoned by command starts so) */
export class HoverPhase extends DragonPhase {
  readonly id = PHASE.HOVERING;
  private targetLocation: [number, number, number] | null = null;
  override doServerTick(): void {
    const d = this.dragon;
    this.targetLocation ??= [d.x, d.y, d.z];
  }
  override isSitting(): boolean {
    return true;
  }
  override begin(): void {
    this.targetLocation = null;
  }
  override getFlySpeed(): number {
    return 1;
  }
  override getFlyTargetLocation(): [number, number, number] | null {
    return this.targetLocation;
  }
}

const FACTORIES: ((d: EnderDragon) => DragonPhase)[] = [
  (d) => new HoldingPatternPhase(d),
  (d) => new StrafePlayerPhase(d),
  (d) => new LandingApproachPhase(d),
  (d) => new LandingPhase(d),
  (d) => new TakeoffPhase(d),
  (d) => new SittingFlamingPhase(d),
  (d) => new SittingScanningPhase(d),
  (d) => new SittingAttackingPhase(d),
  (d) => new ChargingPlayerPhase(d),
  (d) => new DyingPhase(d),
  (d) => new HoverPhase(d),
];

/** vanilla EnderDragonPhaseManager: one instance of each phase, made when first needed; a new phase ends the old and begins */
export class DragonPhaseManager {
  private readonly phases: (DragonPhase | undefined)[] = [];
  current!: DragonPhase;

  constructor(private readonly dragon: EnderDragon) {
    this.setPhase(PHASE.HOVERING);
  }

  /** vanilla setPhase (an unknown id is the holding pattern: EnderDragonPhase.getById) */
  setPhase(id: number): void {
    if (!(id >= 0 && id < FACTORIES.length)) id = PHASE.HOLDING_PATTERN;
    if (this.current && id === this.current.id) return;
    this.current?.end();
    this.current = this.getPhase(id);
    // (vanilla: into the dragon's DATA_PHASE, which its clients follow; here its guests' copies do)
    this.dragon.phase = id;
    this.current.begin();
  }

  getPhase(id: number): DragonPhase {
    return (this.phases[id] ??= FACTORIES[id](this.dragon));
  }
}

/** vanilla Vec3.normalize */
function norm(x: number, y: number, z: number): [number, number, number] {
  const d = Math.sqrt(x * x + y * y + z * z);
  return d < 1e-4 ? [0, 0, 0] : [x / d, y / d, z / d];
}

/** vanilla Mth.wrapDegrees(double) */
function wrap(a: number): number {
  let d = a % 360;
  if (d >= 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
