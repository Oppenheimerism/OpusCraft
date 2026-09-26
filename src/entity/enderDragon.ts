// The ender dragon (vanilla EnderDragon and EnderDragonPart): a 16x8 flying
// boss with no physics of its own. It steers toward whatever its current phase
// (dragonPhases.ts) wants, along a graph of 24 nodes round the main island
// (three rings: twelve at 60 blocks, eight at 40, four at 20), heals from the
// nearest end crystal, flings away whatever its wings brush and bites whatever
// its head touches, and eats through any block that isn't dragon-proof.
//
// It is hit through its eight parts — head, neck, body, three tail segments
// and two wings — each a box of its own that follows the body round: a blow to
// the head counts in full, anywhere else a quarter plus one. Only players and
// explosions hurt it at all. Brought to zero health in the air it flies to the
// exit portal to die; its death throes (tickDeath) rain experience and end the
// fight (game/endDragonFight.ts).

import { Mob } from './mob';
import { Entity } from './entity';
import { LivingEntity } from './living';
import type { Level } from '../game/level';
import type { EndDragonFight } from '../game/endDragonFight';
import type { MobEffectInstance } from './effects';
import { DragonPhaseManager, PHASE, type DragonPhase } from './dragonPhases';
import { EndCrystal, EXPLOSION_SOURCES } from './endCrystal';
import { AABB } from '../core/aabb';
import { wrapDegrees } from '../core/math';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_WATERLOGGED, S } from '../world/block';
import { doPostAttackEffects } from '../game/enchantEffects';

const fr = Math.fround;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// vanilla Mth.sin / Mth.cos: a 65536-entry float table (the node layout depends on its exact values)

let SIN_TABLE: Float32Array | null = null;
function sinTable(): Float32Array {
  if (!SIN_TABLE) {
    SIN_TABLE = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) SIN_TABLE[i] = Math.sin((i * Math.PI * 2) / 65536);
  }
  return SIN_TABLE;
}
export function mthSin(v: number): number {
  return sinTable()[Math.trunc(fr(fr(v) * fr(10430.378))) & 65535];
}
export function mthCos(v: number): number {
  return sinTable()[Math.trunc(fr(fr(fr(v) * fr(10430.378)) + 16384)) & 65535];
}

/** vanilla Vec3.normalize: the zero vector for anything shorter than 1e-4 */
function normalize(x: number, y: number, z: number): [number, number, number] {
  const d = Math.sqrt(x * x + y * y + z * z);
  return d < 1e-4 ? [0, 0, 0] : [x / d, y / d, z / d];
}

// ---------------------------------------------------------------------------
// the flight graph (vanilla pathfinder Node, BinaryHeap and Path as EnderDragon.findPath uses them)

export class DragonNode {
  f = 0;
  g = 0;
  h = 0;
  heapIdx = -1;
  closed = false;
  cameFrom: DragonNode | null = null;
  constructor(readonly x: number, readonly y: number, readonly z: number) {}
  inOpenSet(): boolean {
    return this.heapIdx >= 0;
  }
  /** vanilla Node.distanceTo: in float */
  distanceTo(o: DragonNode): number {
    return fr(Math.sqrt(this.distanceToSqr(o)));
  }
  distanceToSqr(o: DragonNode): number {
    const a = fr(o.x - this.x), b = fr(o.y - this.y), c = fr(o.z - this.z);
    return fr(fr(fr(a * a) + fr(b * b)) + fr(c * c));
  }
  equals(o: DragonNode): boolean {
    return o.x === this.x && o.y === this.y && o.z === this.z;
  }
}

/** vanilla BinaryHeap, exactly (ties go the way vanilla's go) */
class BinaryHeap {
  private heap: DragonNode[] = [];
  private size = 0;
  clear(): void {
    this.size = 0;
  }
  isEmpty(): boolean {
    return this.size === 0;
  }
  insert(n: DragonNode): void {
    this.heap[this.size] = n;
    n.heapIdx = this.size;
    this.upHeap(this.size++);
  }
  pop(): DragonNode {
    const n = this.heap[0];
    this.heap[0] = this.heap[--this.size];
    if (this.size > 0) this.downHeap(0);
    n.heapIdx = -1;
    return n;
  }
  changeCost(n: DragonNode, cost: number): void {
    const f = n.f;
    n.f = cost;
    if (cost < f) this.upHeap(n.heapIdx);
    else this.downHeap(n.heapIdx);
  }
  private upHeap(index: number): void {
    const h = this.heap, n = h[index], f = n.f;
    while (index > 0) {
      const i = (index - 1) >> 1;
      const p = h[i];
      if (!(f < p.f)) break;
      h[index] = p;
      p.heapIdx = index;
      index = i;
    }
    h[index] = n;
    n.heapIdx = index;
  }
  private downHeap(index: number): void {
    const h = this.heap, n = h[index], f = n.f;
    for (;;) {
      const i = 1 + (index << 1), j = i + 1;
      if (i >= this.size) break;
      const a = h[i], fa = a.f;
      const b = j >= this.size ? null : h[j];
      const fb = b ? b.f : Infinity;
      if (fa < fb) {
        if (fa >= f) break;
        h[index] = a;
        a.heapIdx = index;
        index = i;
      } else {
        if (fb >= f) break;
        h[index] = b!;
        b!.heapIdx = index;
        index = j;
      }
    }
    h[index] = n;
    n.heapIdx = index;
  }
}

/** vanilla Path, as far as the dragon uses one */
export class DragonPath {
  nextNodeIndex = 0;
  constructor(readonly nodes: DragonNode[]) {}
  isDone(): boolean {
    return this.nextNodeIndex >= this.nodes.length;
  }
  advance(): void {
    this.nextNodeIndex++;
  }
  nextNodePos(): DragonNode {
    return this.nodes[this.nextNodeIndex];
  }
}

/** vanilla EnderDragon's nodeAdjacency: which of the 24 nodes each connects to (a bit per node) */
const NODE_ADJACENCY = [
  6146, 8197, 8202, 16404, 32808, 32848, 65696, 131392, 131712, 263424, 526848, 525313, 1581057, 3166214, 2138120, 6373424, 4358208, 12910976, 9044480, 9706496,
  15216640, 13688832, 11763712, 8257536,
];

/** vanilla BlockTags.DRAGON_IMMUNE: what the dragon can't break (flying into it, it slows) */
const DRAGON_IMMUNE = new Set([
  'barrier', 'bedrock', 'end_portal', 'end_portal_frame', 'end_gateway', 'command_block', 'repeating_command_block', 'chain_command_block', 'structure_block', 'jigsaw',
  'moving_piston', 'obsidian', 'crying_obsidian', 'end_stone', 'iron_bars', 'respawn_anchor', 'reinforced_deepslate',
]);
/** vanilla BlockTags.DRAGON_TRANSPARENT: what it flies through as if it weren't there (light, #fire) */
const DRAGON_TRANSPARENT = new Set(['light', 'fire', 'soul_fire']);

/** vanilla EntitySelector.NO_CREATIVE_OR_SPECTATOR */
const noCreativeOrSpectator = (e: Entity): boolean => {
  const gm = (e as { gameMode?: string }).gameMode;
  return e.type !== 'player' || (gm !== 'creative' && gm !== 'spectator');
};

/** the End's sea level (vanilla NoiseGeneratorSettings.end: 0) */
const END_SEA_LEVEL = 0;

/**
 * vanilla Heightmap MOTION_BLOCKING (or MOTION_BLOCKING_NO_LEAVES): the first block above anything that stops
 * movement or holds a fluid, never under the bottom of the world
 */
export function heightmapY(level: Level, x: number, z: number): number {
  return Math.max(level.motionBlockingHeight(x, z), level.world.dim.minY);
}

// ---------------------------------------------------------------------------

/** vanilla EnderDragonPart: one of the boxes the dragon is hit through; never saved, never ticked on its own */
export class EnderDragonPart extends Entity {
  readonly type = 'ender_dragon';
  constructor(readonly parent: EnderDragon, readonly name: string, w: number, h: number) {
    super(parent.level);
    this.setSize(w, h);
  }
  override tick(): void {}
  override isPickable(): boolean {
    return true;
  }
  /** (vanilla: fire can't hurt it — the dragon's type is fireproof) */
  override fireImmune(): boolean {
    return true;
  }
  override pickResult(): string | null {
    return this.parent.pickResult();
  }
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    if (this.parent.removed || (this.fireImmune() && FIRE_LIKE.has(source))) return false;
    return this.parent.hurtPart(this, amount, source, attacker ?? null, direct ?? null);
  }
}

const FIRE_LIKE = new Set(['onFire', 'inFire', 'campfire', 'lava', 'hotFloor', 'fireball']);

export class EnderDragon extends Mob {
  readonly type = 'ender_dragon';
  readonly category = 'monster' as const;
  readonly head: EnderDragonPart;
  readonly neck: EnderDragonPart;
  readonly body: EnderDragonPart;
  readonly tail1: EnderDragonPart;
  readonly tail2: EnderDragonPart;
  readonly tail3: EnderDragonPart;
  readonly wing1: EnderDragonPart;
  readonly wing2: EnderDragonPart;
  readonly subEntities: EnderDragonPart[];
  /** vanilla positions: its heading and height these last 64 ticks, round and round (the neck and tail trail them) */
  readonly positions = new Float64Array(64 * 2);
  posPointer = -1;
  oFlapTime = 0;
  flapTime = 0;
  /** vanilla inWall: it hit something it couldn't break */
  inWall = false;
  /** vanilla dragonDeathTime: ticks into its death throes */
  dragonDeathTime = 0;
  /** vanilla yRotA: how hard it's turning */
  yRotA = 0;
  /** vanilla nearestCrystal: the crystal healing it (its beam is drawn to it) */
  nearestCrystal: EndCrystal | null = null;
  dragonFight: EndDragonFight | null = null;
  /** vanilla fightOrigin: the middle of the island the fight is over */
  fightOrigin: [number, number, number] = [0, 0, 0];
  readonly phaseManager: DragonPhaseManager;
  private growlTime = 100;
  sittingDamageReceived = 0;
  private readonly nodes: (DragonNode | null)[] = new Array(24).fill(null);
  private readonly openSet = new BinaryHeap();

  constructor(level: Level) {
    super(level);
    this.head = new EnderDragonPart(this, 'head', 1, 1);
    this.neck = new EnderDragonPart(this, 'neck', 3, 3);
    this.body = new EnderDragonPart(this, 'body', 5, 3);
    this.tail1 = new EnderDragonPart(this, 'tail', 2, 2);
    this.tail2 = new EnderDragonPart(this, 'tail', 2, 2);
    this.tail3 = new EnderDragonPart(this, 'tail', 2, 2);
    this.wing1 = new EnderDragonPart(this, 'wing', 4, 2);
    this.wing2 = new EnderDragonPart(this, 'wing', 4, 2);
    this.subEntities = [this.head, this.neck, this.body, this.tail1, this.tail2, this.tail3, this.wing1, this.wing2];
    // vanilla EnderDragon.createAttributes: 200 health; EntityType.ENDER_DRAGON: sized(16, 8), fireproof
    this.maxHealth = 200;
    this.health = 200;
    this.setSize(16, 8);
    this.noPhysics = true;
    this.phaseManager = new DragonPhaseManager(this);
  }

  protected registerGoals(): void {}

  // --- vanilla overrides -----------------------------------------------------------------------------------------

  /** (only its parts can be hit) */
  override isPickable(): boolean {
    return false;
  }
  override fireImmune(): boolean {
    return true;
  }
  /** vanilla EnderDragon.addEffect: nothing takes */
  override addEffect(_inst: MobEffectInstance, _source: Entity | null = null): boolean {
    return false;
  }
  /** (never despawns: the fight holds on to it) */
  override checkDespawn(): void {}
  override removeWhenFarAway(): boolean {
    return false;
  }
  /** vanilla EnderDragon.canAttack: any player that can be an enemy, peaceful or not */
  override canAttack(e: LivingEntity | null): boolean {
    if (!e || !e.isAlive) return false;
    const gm = (e as { gameMode?: string }).gameMode;
    return gm !== 'creative' && gm !== 'spectator';
  }

  override ambientSound(): string | null {
    return 'entity.ender_dragon.ambient';
  }
  override hurtSound(): string | null {
    return 'entity.ender_dragon.hurt';
  }
  /** (vanilla doesn't override getDeathSound: the generic one, heard when its health first runs out) */
  override deathSound(): string | null {
    return 'entity.generic.death';
  }
  override soundVolume(): number {
    return 5;
  }
  protected override makesStepSounds(): boolean {
    return false;
  }

  isSitting(): boolean {
    return this.phaseManager.current.isSitting();
  }

  /** vanilla Entity.getViewVector with the dragon's own pitch (always 0 here) */
  viewVector(pitch = this.pitch): [number, number, number] {
    const pr = pitch * DEG, yr = this.yaw * DEG;
    return [-Math.sin(yr) * Math.cos(pr), -Math.sin(pr), Math.cos(yr) * Math.cos(pr)];
  }

  /** vanilla isFlapping: the wings just came down past the bottom of their beat */
  override isFlapping(): boolean {
    const f = mthCos(this.flapTime * Math.PI * 2), f1 = mthCos(this.oFlapTime * Math.PI * 2);
    return f1 <= -0.3 && f >= -0.3;
  }

  // --- ticking ---------------------------------------------------------------------------------------------------

  /** vanilla LivingEntity.tick for the dragon: the base tick (its death throes there), then aiStep */
  override tick(): void {
    this.baseTick();
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.health <= 0 && !this.removed) this.tickDeath();
    if (this.removed) return;
    this.aiStep();
  }

  /** vanilla EnderDragon.aiStep */
  override aiStep(): void {
    // vanilla processFlappingMovement → onFlap (the client's whoosh of the wings)
    if (this.isFlapping()) this.playSound('entity.ender_dragon.flap', 5, 0.8 + this.random.nextFloat() * 0.3);
    // (the client's growl every 10 to 20 seconds while it flies)
    if (!this.isSitting() && --this.growlTime < 0) {
      this.playSound('entity.ender_dragon.growl', 2.5, 0.8 + this.random.nextFloat() * 0.3);
      this.growlTime = 200 + this.random.nextInt(200);
    }
    const fight = this.level.dragonFight;
    if (!this.dragonFight && fight && fight.dragonUUID === this.uuid) this.dragonFight = fight;
    this.oFlapTime = this.flapTime;
    if (this.health <= 0) {
      // (the client's little bursts all over it while it dies)
      const f8 = (this.random.nextFloat() - 0.5) * 8, f10 = (this.random.nextFloat() - 0.5) * 4, f11 = (this.random.nextFloat() - 0.5) * 8;
      this.level.particles.spawn?.('explosion', this.x + f8, this.y + 2 + f10, this.z + f11, 0, 0, 0);
      return;
    }
    this.checkCrystals();
    const vh = Math.sqrt(this.dx * this.dx + this.dz * this.dz);
    let f9 = fr(0.2 / (vh * 10 + 1));
    f9 *= Math.pow(2, this.dy);
    if (this.isSitting()) this.flapTime += 0.1;
    else if (this.inWall) this.flapTime += f9 * 0.5;
    else this.flapTime += f9;
    this.yaw = wrapDegrees(this.yaw);
    const pos = this.positions;
    if (this.posPointer < 0)
      for (let i = 0; i < 64; i++) {
        pos[i * 2] = this.yaw;
        pos[i * 2 + 1] = this.y;
      }
    if (++this.posPointer === 64) this.posPointer = 0;
    pos[this.posPointer * 2] = this.yaw;
    pos[this.posPointer * 2 + 1] = this.y;
    // (the client's copy of the phase: breath, roars, death bursts)
    this.phaseManager.current.doClientTick();
    // the server's: where to fly
    let phase = this.phaseManager.current;
    phase.doServerTick();
    if (this.phaseManager.current !== phase) {
      phase = this.phaseManager.current;
      phase.doServerTick();
    }
    const target = phase.getFlyTargetLocation();
    if (target) this.flyToward(phase, target);
    this.bodyYaw = this.bodyYawO = this.yaw;
    this.headYaw = this.yaw;
    this.tickParts();
  }

  /** vanilla EnderDragon.aiStep's steering toward the phase's fly target */
  private flyToward(phase: DragonPhase, target: [number, number, number]): void {
    const d0 = target[0] - this.x, d2 = target[2] - this.z;
    let d1 = target[1] - this.y;
    const d3 = d0 * d0 + d1 * d1 + d2 * d2;
    const f5 = phase.getFlySpeed();
    const d4 = Math.sqrt(d0 * d0 + d2 * d2);
    const [vx31, vy31, vz31] = normalize(d0, d1, d2);
    if (d4 > 0) d1 = Math.max(-f5, Math.min(f5, d1 / d4));
    this.dy += d1 * 0.01;
    this.yaw = wrapDegrees(this.yaw);
    const [vx32, vy32, vz32] = normalize(mthSin(this.yaw * DEG), this.dy, -mthCos(this.yaw * DEG));
    const f6 = Math.max((fr(vx32 * vx31 + vy32 * vy31 + vz32 * vz31) + 0.5) / 1.5, 0);
    if (Math.abs(d0) > 1e-5 || Math.abs(d2) > 1e-5) {
      const f7 = Math.max(-50, Math.min(50, wrapDegrees(180 - fr(Math.atan2(d0, d2)) * fr(180 / Math.PI) - this.yaw)));
      this.yRotA *= 0.8;
      this.yRotA += f7 * phase.getTurnSpeed();
      this.yaw += this.yRotA * 0.1;
    }
    const f18 = fr(2 / (d3 + 1));
    this.moveRelative(0.06 * (f6 * f18 + (1 - f18)), 0, 0, -1);
    if (this.inWall) this.move(this.dx * 0.8, this.dy * 0.8, this.dz * 0.8);
    else this.move(this.dx, this.dy, this.dz);
    const [vx33, vy33, vz33] = normalize(this.dx, this.dy, this.dz);
    const d5 = 0.8 + (0.15 * (vx33 * vx32 + vy33 * vy32 + vz33 * vz32 + 1)) / 2;
    this.dx *= d5;
    this.dy *= fr(0.91);
    this.dz *= d5;
  }

  /** vanilla EnderDragon.aiStep's parts: laid out round the body, the wings' buffet and the head's bite, blocks eaten */
  private tickParts(): void {
    const parts = this.subEntities;
    const old = parts.map((p) => [p.x, p.y, p.z]);
    const f12 = fr((this.getLatencyPos(5, 1)[1] - this.getLatencyPos(10, 1)[1]) * 10 * DEG);
    const f13 = mthCos(f12), f = mthSin(f12);
    const f14 = this.yaw * DEG;
    const f1 = mthSin(f14), f15 = mthCos(f14);
    this.tickPart(this.body, f1 * 0.5, 0, -f15 * 0.5);
    this.tickPart(this.wing1, f15 * 4.5, 2, f1 * 4.5);
    this.tickPart(this.wing2, f15 * -4.5, 2, f1 * -4.5);
    if (this.hurtTime === 0) {
      const lvl = this.level;
      this.knockBack(lvl.getEntities(this.wing1.bb.inflate(4, 2, 4).move(0, -2, 0), noCreativeOrSpectator, this));
      this.knockBack(lvl.getEntities(this.wing2.bb.inflate(4, 2, 4).move(0, -2, 0), noCreativeOrSpectator, this));
      this.bite(lvl.getEntities(this.head.bb.inflate(1), noCreativeOrSpectator, this));
      this.bite(lvl.getEntities(this.neck.bb.inflate(1), noCreativeOrSpectator, this));
    }
    const f2 = mthSin(this.yaw * DEG - this.yRotA * 0.01), f16 = mthCos(this.yaw * DEG - this.yRotA * 0.01);
    const f3 = this.headYOffset();
    this.tickPart(this.head, f2 * 6.5 * f13, f3 + f * 6.5, -f16 * 6.5 * f13);
    this.tickPart(this.neck, f2 * 5.5 * f13, f3 + f * 5.5, -f16 * 5.5 * f13);
    const spine = this.getLatencyPos(5, 1);
    const tails = [this.tail1, this.tail2, this.tail3];
    for (let k = 0; k < 3; k++) {
      const lat = this.getLatencyPos(12 + k * 2, 1);
      const f17 = this.yaw * DEG + wrapDegrees(lat[0] - spine[0]) * DEG;
      const f4 = mthSin(f17), f20 = mthCos(f17);
      const f22 = (k + 1) * 2;
      this.tickPart(tails[k], -(f1 * 1.5 + f4 * f22) * f13, lat[1] - spine[1] - (f22 + 1.5) * f + 1.5, (f15 * 1.5 + f20 * f22) * f13);
    }
    // (vanilla ORs all three without stopping short: each part eats its own way through)
    const a = this.checkWalls(this.head.bb), b = this.checkWalls(this.neck.bb), c = this.checkWalls(this.body.bb);
    this.inWall = a || b || c;
    this.dragonFight?.updateDragon(this);
    for (let i = 0; i < parts.length; i++) {
      parts[i].xo = old[i][0];
      parts[i].yo = old[i][1];
      parts[i].zo = old[i][2];
    }
  }

  private tickPart(p: EnderDragonPart, dx: number, dy: number, dz: number): void {
    p.setPos(this.x + dx, this.y + dy, this.z + dz);
  }

  /** vanilla EnderDragon.getHeadYOffset: how far the head hangs below the body (a sitting dragon's, one block) */
  private headYOffset(): number {
    if (this.isSitting()) return -1;
    return fr(this.getLatencyPos(5, 1)[1] - this.getLatencyPos(0, 1)[1]);
  }

  /** vanilla EnderDragon.getLatencyPos: its heading and height `offset` ticks ago, between ticks */
  getLatencyPos(offset: number, partial: number): [number, number] {
    if (this.health <= 0) partial = 0;
    partial = 1 - partial;
    const i = (this.posPointer - offset) & 63, j = (this.posPointer - offset - 1) & 63;
    const p = this.positions;
    const yaw = p[i * 2] + wrapDegrees(p[j * 2] - p[i * 2]) * partial;
    const y = p[i * 2 + 1] + (p[j * 2 + 1] - p[i * 2 + 1]) * partial;
    return [yaw, y];
  }

  /** vanilla EnderDragon.getHeadPartYOffset: how steeply the neck bends down to the head (the renderer's) */
  getHeadPartYOffset(partIndex: number, spineEnd: [number, number], headPart: [number, number]): number {
    const id = this.phaseManager.current.id;
    if (id === PHASE.LANDING || id === PHASE.TAKEOFF) {
      const [px, py, pz] = this.podiumTop();
      const d1 = Math.max(Math.sqrt((px + 0.5 - this.x) ** 2 + (py + 0.5 - this.y) ** 2 + (pz + 0.5 - this.z) ** 2) / 4, 1);
      return fr(partIndex / d1);
    }
    if (this.isSitting()) return partIndex;
    if (partIndex === 6) return 0;
    return fr(headPart[1] - spineEnd[1]);
  }

  /** vanilla EnderDragon.getHeadLookVector: where the head looks (down at 45° sitting, steeply on landing and takeoff) */
  getHeadLookVector(): [number, number, number] {
    const id = this.phaseManager.current.id;
    if (id === PHASE.LANDING || id === PHASE.TAKEOFF) {
      const [px, py, pz] = this.podiumTop();
      const f = Math.max(fr(Math.sqrt((px + 0.5 - this.x) ** 2 + (py + 0.5 - this.y) ** 2 + (pz + 0.5 - this.z) ** 2)) / 4, 1);
      return this.viewVector(-(6 / f) * 1.5 * 5);
    }
    if (this.isSitting()) return this.viewVector(-45);
    return this.viewVector();
  }

  /** vanilla getHeightmapPos(MOTION_BLOCKING_NO_LEAVES, EndPodiumFeature.getLocation(fightOrigin)): the top of the exit portal's pillar */
  podiumTop(): [number, number, number] {
    const [ox, , oz] = this.fightOrigin;
    return [ox, heightmapY(this.level, ox, oz), oz];
  }

  /** vanilla EnderDragon.checkCrystals: heal a point every half second from a crystal; a new nearest one now and then */
  private checkCrystals(): void {
    const c = this.nearestCrystal;
    if (c) {
      if (c.removed) this.nearestCrystal = null;
      else if (this.tickCount % 10 === 0 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + 1);
    }
    if (this.random.nextInt(10) === 0) {
      let best: EndCrystal | null = null, bd = Number.MAX_VALUE;
      for (const e of this.level.getEntities(this.bb.inflate(32), (e) => e instanceof EndCrystal)) {
        const d = e.distanceToSqr(this.x, this.y, this.z);
        if (d < bd) {
          bd = d;
          best = e as EndCrystal;
        }
      }
      this.nearestCrystal = best;
    }
  }

  /** vanilla EnderDragon.knockBack: the wings' buffet flings the living away (and hurts, unless it's sitting) */
  private knockBack(list: Entity[]): void {
    const bb = this.body.bb;
    const d0 = (bb.minX + bb.maxX) / 2, d1 = (bb.minZ + bb.maxZ) / 2;
    for (const e of list) {
      if (!(e instanceof LivingEntity)) continue;
      const d2 = e.x - d0, d3 = e.z - d1;
      const d4 = Math.max(d2 * d2 + d3 * d3, 0.1);
      e.push((d2 / d4) * 4, fr(0.2), (d3 / d4) * 4);
      if (!this.isSitting() && e.lastHurtByMobTimestamp < e.tickCount - 2) {
        e.hurt(5, 'mob', this, this);
        doPostAttackEffects(e, this, null, false);
      }
    }
  }

  /** vanilla EnderDragon.hurt(List): what its head and neck touch takes 10 */
  private bite(list: Entity[]): void {
    for (const e of list) {
      if (!(e instanceof LivingEntity)) continue;
      e.hurt(10, 'mob', this, this);
      doPostAttackEffects(e, this, null, false);
    }
  }

  /**
   * vanilla EnderDragon.checkWalls: every block in the box that isn't dragon-transparent goes (quietly, no drops) —
   * unless it's dragon-proof or mobs may not grief, when it holds the dragon back instead; a burst where it broke
   * through (level event 2008)
   */
  private checkWalls(bb: AABB): boolean {
    const i = Math.floor(bb.minX), j = Math.floor(bb.minY), k = Math.floor(bb.minZ);
    const l = Math.floor(bb.maxX), i1 = Math.floor(bb.maxY), j1 = Math.floor(bb.maxZ);
    const lvl = this.level, w = lvl.world;
    const griefing = !!lvl.gameRules.mobGriefing;
    let blocked = false, broke = false;
    for (let x = i; x <= l; x++)
      for (let y = j; y <= i1; y++)
        for (let z = k; z <= j1; z++) {
          const st = w.getState(x, y, z);
          if (FLAGS[st] & F_AIR) continue;
          const name = BLOCKS[STATE_BLOCK[st]].name;
          if (DRAGON_TRANSPARENT.has(name)) continue;
          if (griefing && !DRAGON_IMMUNE.has(name)) broke = removeBlock(lvl, x, y, z) || broke;
          else blocked = true;
        }
    if (broke) {
      const bx = i + this.random.nextInt(l - i + 1), by = j + this.random.nextInt(i1 - j + 1), bz = k + this.random.nextInt(j1 - k + 1);
      lvl.particles.spawn?.('explosion', bx + 0.5, by + 0.5, bz + 0.5, 0, 0, 0);
    }
    return blocked;
  }

  // --- the flight graph ------------------------------------------------------------------------------------------

  /** vanilla EnderDragon.findClosestNode(): lays the graph out the first time (on the island as it is then) */
  findClosestNode(): number {
    if (!this.nodes[0]) {
      const PI = fr(Math.PI);
      for (let i = 0; i < 24; i++) {
        let j = 5, l: number, i1: number;
        if (i < 12) {
          const a = fr(2 * fr(fr(-PI) + fr(fr(Math.PI / 12) * i)));
          l = Math.floor(fr(60 * mthCos(a)));
          i1 = Math.floor(fr(60 * mthSin(a)));
        } else if (i < 20) {
          const a = fr(2 * fr(fr(-PI) + fr(fr(Math.PI / 8) * (i - 12))));
          l = Math.floor(fr(40 * mthCos(a)));
          i1 = Math.floor(fr(40 * mthSin(a)));
          j += 10;
        } else {
          const a = fr(2 * fr(fr(-PI) + fr(fr(Math.PI / 4) * (i - 20))));
          l = Math.floor(fr(20 * mthCos(a)));
          i1 = Math.floor(fr(20 * mthSin(a)));
        }
        const j1 = Math.max(END_SEA_LEVEL + 10, heightmapY(this.level, l, i1) + j);
        this.nodes[i] = new DragonNode(l, j1, i1);
      }
    }
    return this.findClosestNodeTo(this.x, this.y, this.z);
  }

  /** the graph's nodes, once laid out (the respawn and the tests look) */
  graphNodes(): readonly (DragonNode | null)[] {
    return this.nodes;
  }

  /** vanilla findClosestNode(x, y, z): only the inner rings once no crystal is left (or there's no fight); none past 100 blocks */
  findClosestNodeTo(x: number, y: number, z: number): number {
    let f = 10000, best = 0;
    const node = new DragonNode(Math.floor(x), Math.floor(y), Math.floor(z));
    const j = !this.dragonFight || this.dragonFight.crystalsAlive === 0 ? 12 : 0;
    for (let k = j; k < 24; k++) {
      const n = this.nodes[k];
      if (!n) continue;
      const f1 = n.distanceToSqr(node);
      if (f1 < f) {
        f = f1;
        best = k;
      }
    }
    return best;
  }

  /** vanilla EnderDragon.findPath: A* over the graph (the outer ring only while crystals stand), then on to `andThen` */
  findPath(startIndex: number, finishIndex: number, andThen: DragonNode | null): DragonPath | null {
    const nodes = this.nodes as DragonNode[];
    for (const n of nodes) {
      n.closed = false;
      n.f = n.g = n.h = 0;
      n.cameFrom = null;
      n.heapIdx = -1;
    }
    const start = nodes[startIndex];
    let finish = nodes[finishIndex];
    start.g = 0;
    start.h = start.distanceTo(finish);
    start.f = start.h;
    this.openSet.clear();
    this.openSet.insert(start);
    let closest = start;
    const j = !this.dragonFight || this.dragonFight.crystalsAlive === 0 ? 12 : 0;
    while (!this.openSet.isEmpty()) {
      const n = this.openSet.pop();
      if (n.equals(finish)) {
        if (andThen) {
          andThen.cameFrom = finish;
          finish = andThen;
        }
        return reconstructPath(finish);
      }
      if (n.distanceTo(finish) < closest.distanceTo(finish)) closest = n;
      n.closed = true;
      const k = nodes.indexOf(n);
      for (let i1 = j; i1 < 24; i1++) {
        if ((NODE_ADJACENCY[k] & (1 << i1)) <= 0) continue;
        const m = nodes[i1];
        if (m.closed) continue;
        const g = fr(n.g + n.distanceTo(m));
        if (!m.inOpenSet() || g < m.g) {
          m.cameFrom = n;
          m.g = g;
          m.h = m.distanceTo(finish);
          if (m.inOpenSet()) this.openSet.changeCost(m, fr(m.g + m.h));
          else {
            m.f = fr(m.g + m.h);
            this.openSet.insert(m);
          }
        }
      }
    }
    if (closest === start) return null;
    if (andThen) {
      andThen.cameFrom = closest;
      closest = andThen;
    }
    return reconstructPath(closest);
  }

  // --- being hurt ------------------------------------------------------------------------------------------------

  /** a blow to the body when nothing says where (vanilla EnderDragon.hurt(DamageSource, float)) */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    return this.hurtPart(this.body, amount, source, attacker ?? null, direct ?? null);
  }

  /**
   * vanilla EnderDragon.hurt(part, source, damage): nothing while dying; the phase may shrug it off (arrows at a
   * sitting dragon); off the head it's a quarter plus one; only a player's blow or an explosion lands. Brought down
   * in flight it's left a point of health to fly to the portal and die; sitting, 50 damage sends it up again
   */
  hurtPart(part: EnderDragonPart, amount: number, source: string, attacker: Entity | null, direct: Entity | null): boolean {
    if (this.phaseManager.current.id === PHASE.DYING) return false;
    let damage = this.phaseManager.current.onHurt(source, amount, direct);
    if (part !== this.head) damage = damage / 4 + Math.min(damage, 1);
    if (damage < 0.01) return false;
    if (attacker?.type === 'player' || EXPLOSION_SOURCES.has(source)) {
      const before = this.health;
      super.hurt(damage, source, attacker, direct);
      if (this.health <= 0 && !this.isSitting()) {
        this.health = 1;
        this.phaseManager.setPhase(PHASE.DYING);
      }
      if (this.isSitting()) {
        this.sittingDamageReceived += before - this.health;
        if (this.sittingDamageReceived > 0.25 * this.maxHealth) {
          this.sittingDamageReceived = 0;
          this.phaseManager.setPhase(PHASE.TAKEOFF);
        }
      }
    }
    return true;
  }

  /** vanilla EnderDragon.onCrystalDestroyed: its healing crystal's blast hurts its head (10); the phase may turn on whoever did it */
  onCrystalDestroyed(crystal: EndCrystal, source: string, attacker: Entity | null): void {
    let player: LivingEntity | null = null;
    if (attacker?.type === 'player') player = attacker as LivingEntity;
    else {
      // vanilla getNearestPlayer(CRYSTAL_DESTROY_TARGETING): anyone who could be fought, peaceful aside
      if (this.level.difficulty !== 'peaceful') player = this.level.nearestPlayer(this.x, this.y, this.z, -1, (p) => p.isAlive && this.canAttack(p));
    }
    void source;
    if (crystal === this.nearestCrystal) this.hurtPart(this.head, 10, player ? 'playerExplosion' : 'explosion', player, crystal);
    this.phaseManager.current.onCrystalDestroyed(player);
  }

  /** vanilla EnderDragon.kill (/kill): gone at once, and the fight is won */
  override kill(): void {
    this.remove();
    this.level.gameEvent?.('entity_die', this.x, this.y, this.z, { entity: this });
    if (this.dragonFight) {
      this.dragonFight.updateDragon(this);
      this.dragonFight.setDragonKilled(this);
    }
  }

  /**
   * vanilla EnderDragon.tickDeath: ten seconds rising and bursting apart, the death roar heard all over the
   * dimension, 12000 experience for the first dragon (500 for any other) in the last few seconds; then it's gone
   * and the fight is over
   */
  protected override tickDeath(): void {
    this.dragonFight?.updateDragon(this);
    this.dragonDeathTime++;
    if (this.dragonDeathTime >= 180 && this.dragonDeathTime <= 200) {
      const f = (this.random.nextFloat() - 0.5) * 8, f1 = (this.random.nextFloat() - 0.5) * 4, f2 = (this.random.nextFloat() - 0.5) * 8;
      this.level.particles.spawn?.('explosion_emitter', this.x + f, this.y + 2 + f1, this.z + f2, 0, 0, 0);
    }
    const loot = !!this.level.gameRules.doMobLoot;
    const xp = this.dragonFight && !this.dragonFight.previouslyKilled ? 12000 : 500;
    if (this.dragonDeathTime > 150 && this.dragonDeathTime % 5 === 0 && loot) this.level.awardExperience(this.x, this.y, this.z, Math.floor(xp * 0.08));
    // vanilla globalLevelEvent 1028: the death roar, heard wherever you are in the End
    if (this.dragonDeathTime === 1) globalSound(this.level, 'entity.ender_dragon.death', this.x, this.y, this.z, 5);
    this.move(0, fr(0.1), 0);
    if (this.dragonDeathTime === 200) {
      if (loot) this.level.awardExperience(this.x, this.y, this.z, Math.floor(xp * 0.2));
      this.dragonFight?.setDragonKilled(this);
      this.remove();
    }
  }

  // --- saving ----------------------------------------------------------------------------------------------------

  protected override saveData(): Record<string, number | string | boolean> {
    return { DragonPhase: this.phaseManager.current.id, DragonDeathTime: this.dragonDeathTime, UUID: this.uuid };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    if (typeof d.UUID === 'string') this.uuid = d.UUID;
    if (typeof d.DragonPhase === 'number') this.phaseManager.setPhase(d.DragonPhase);
    if (typeof d.DragonDeathTime === 'number') this.dragonDeathTime = d.DragonDeathTime;
  }
}

function reconstructPath(finish: DragonNode): DragonPath {
  const list: DragonNode[] = [finish];
  let n = finish;
  while (n.cameFrom) {
    n = n.cameFrom;
    list.unshift(n);
  }
  return new DragonPath(list);
}

/**
 * vanilla Level.removeBlock(pos, false): the block is simply gone (no drops, no sound), its fluid left behind; a
 * container's contents spill as its block entity goes
 */
function removeBlock(level: Level, x: number, y: number, z: number): boolean {
  const st = level.getState(x, y, z);
  const now = FLAGS[st] & F_WATERLOGGED ? S('water') : BLOCKS[STATE_BLOCK[st]].s.fluid ? st : 0;
  if (now === st) return false;
  const be = level.world.getBlockEntity(x, y, z);
  if (be) {
    be.unpackLoot();
    for (const s of be.container.removeAll()) level.dropStackAt(x, y, z, s);
  }
  level.setBlock(x, y, z, now);
  return true;
}

/**
 * vanilla LevelRenderer.globalLevelEvent (1023, 1028, 1038): a sound heard from anywhere in the dimension, played two
 * blocks from the camera in the direction of where it happened (for each player, from where they are)
 */
export function globalSound(level: Level, name: string, x: number, y: number, z: number, volume: number): void {
  for (const p of level.players()) {
    const cx = p.x, cy = p.y + p.eyeHeight, cz = p.z;
    const [dx, dy, dz] = normalize(Math.floor(x) + 0.5 - cx, Math.floor(y) + 0.5 - cy, Math.floor(z) + 0.5 - cz);
    level.playSoundTo(p, name, cx + dx * 2, cy + dy * 2, cz + dz * 2, volume, 1);
  }
}

/** the dragon a part (or the dragon itself) belongs to */
export function dragonOf(e: Entity): EnderDragon | null {
  if (e instanceof EnderDragon) return e;
  if (e instanceof EnderDragonPart) return e.parent;
  return null;
}
