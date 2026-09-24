// The iron golem (vanilla IronGolem extends AbstractGolem, NeutralMob): a village's guardian. It walks the village
// among the villagers and their workplaces, hands a villager a poppy now and then, and fights anything hostile
// nearby (but never a creeper), and any player the villagers have come to hate or who hits it. One the player built
// never turns on a player. It doesn't drown, fall damage can't hurt it, and an iron ingot patches it up.

import { Mob, isValidEmptySpawnBlock, type MobCategory, type LootEntry } from './mob';
import { LivingEntity } from './living';
import type { Entity } from './entity';
import type { Level } from '../game/level';
import type { Player } from './player';
import type { ItemStack } from '../item/item';
import { BLOCKS, STATE_BLOCK, FLAGS, COLLISION, F_AIR, F_WATER, F_LAVA, F_FULL_COLLISION } from '../world/block';
import { Goal, Flag } from './ai/goal';
import {
  MeleeAttackGoal, RandomStrollGoal, LookAtPlayerGoal, RandomLookAroundGoal, HurtByTargetGoal, NearestAttackablePlayerGoal, NearestAttackableMobGoal, TargetGoal,
  defaultRandomPosTowards, landRandomPos, landRandomPosTowards,
} from './ai/goals';
import { Villager } from './villager';

type Pos = [number, number, number];

/** vanilla Crackiness.GOLEM: how broken it looks, by the health it has left */
export type Crackiness = 'none' | 'low' | 'medium' | 'high';

function crackinessOf(f: number): Crackiness {
  return f < 0.25 ? 'high' : f < 0.5 ? 'medium' : f < 0.75 ? 'low' : 'none';
}

/** vanilla Enemy (every Monster, slimes, ghasts, hoglins…) */
export function isEnemy(e: Entity): boolean {
  return e instanceof Mob && e.category === 'monster';
}

// ---------------------------------------------------------------------------
// goals

/** vanilla MoveTowardsTargetGoal: head toward the target when it's within reach */
class MoveTowardsTargetGoal extends Goal {
  private to: Pos | null = null;
  constructor(readonly mob: IronGolem, readonly speed: number, readonly within: number) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    const t = this.mob.target;
    if (!t || t.distanceToSqr(this.mob.x, this.mob.y, this.mob.z) > this.within * this.within) return false;
    this.to = defaultRandomPosTowards(this.mob, 16, 7, t.x, t.z, Math.PI / 2);
    return this.to !== null;
  }
  override canContinueToUse(): boolean {
    const t = this.mob.target;
    return !this.mob.navigation.isDone() && !!t && t.isAlive && t.distanceToSqr(this.mob.x, this.mob.y, this.mob.z) < this.within * this.within;
  }
  override start(): void {
    const p = this.to!;
    this.mob.navigation.moveTo(p[0] + 0.5, p[1], p[2] + 0.5, this.speed);
  }
}

/** vanilla BehaviorUtils.findSectionClosestToVillage: a section within `r` nearer a village than this one (or this one) */
function sectionCloserToVillage(level: Level, sx: number, sy: number, sz: number, r: number): [number, number, number] {
  const poi = level.poi;
  let best = poi.sectionsToVillage(sx, sy, sz), to: [number, number, number] = [sx, sy, sz];
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++)
      for (let dz = -r; dz <= r; dz++) {
        const d = poi.sectionsToVillage(sx + dx, sy + dy, sz + dz);
        if (d < best) {
          best = d;
          to = [sx + dx, sy + dy, sz + dz];
        }
      }
  return to;
}

/** vanilla MoveBackToVillageGoal: outside a village, stroll back toward the nearest one */
class MoveBackToVillageGoal extends RandomStrollGoal {
  constructor(mob: IronGolem, speed: number) {
    super(mob, speed, 10, false);
  }
  override canUse(): boolean {
    const m = this.mob;
    if (m.level.poi.isVillage(Math.floor(m.x), Math.floor(m.y), Math.floor(m.z))) return false;
    return super.canUse();
  }
  protected override getPosition(): Pos | null {
    const m = this.mob;
    const sx = Math.floor(m.x) >> 4, sy = Math.floor(m.y) >> 4, sz = Math.floor(m.z) >> 4;
    const [tx, , tz] = sectionCloserToVillage(m.level, sx, sy, sz, 2);
    if (tx === sx && tz === sz) return null;
    return defaultRandomPosTowards(m, 10, 7, tx * 16 + 8, tz * 16 + 8, Math.PI / 2);
  }
}

/**
 * vanilla GolemRandomStrollInVillageGoal: now and then (every 240 ticks or so) walk somewhere: mostly toward a
 * villager that wants a golem about or a place the villagers use, sometimes anywhere
 */
class GolemRandomStrollInVillageGoal extends RandomStrollGoal {
  constructor(mob: IronGolem, speed: number) {
    super(mob, speed, 240, false);
  }
  protected override getPosition(): Pos | null {
    const m = this.mob;
    const r = m.level.random;
    const f = r.nextFloat();
    if (r.nextFloat() < 0.3) return landRandomPos(m, 10, 7);
    let p: Pos | null;
    if (f < 0.7) p = this.towardVillagerWhoWantsGolem() ?? this.towardPoi();
    else p = this.towardPoi() ?? this.towardVillagerWhoWantsGolem();
    return p ?? landRandomPos(m, 10, 7);
  }
  private towardVillagerWhoWantsGolem(): Pos | null {
    const m = this.mob;
    const now = m.level.gameTime;
    const list = m.level.getEntities(m.bb.inflate(32, 32, 32), (e) => e instanceof Villager && e.wantsToSpawnGolem(now)) as Villager[];
    if (!list.length) return null;
    const v = list[m.level.random.nextInt(list.length)];
    return landRandomPosTowards(m, 10, 7, v.x, v.z);
  }
  private towardPoi(): Pos | null {
    const m = this.mob;
    const poi = m.level.poi;
    const sx = Math.floor(m.x) >> 4, sy = Math.floor(m.y) >> 4, sz = Math.floor(m.z) >> 4;
    // (vanilla getRandomVillageSection: a section within 2 that is part of the village)
    const secs: [number, number, number][] = [];
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) if (poi.sectionsToVillage(sx + dx, sy + dy, sz + dz) === 0) secs.push([sx + dx, sy + dy, sz + dz]);
    if (!secs.length) return null;
    const [cx, cy, cz] = secs[m.level.random.nextInt(secs.length)];
    // (vanilla getRandomPoiWithinSection: an occupied point within 8 of the section's centre)
    const pts = poi.findAll(cx * 16 + 8, cy * 16 + 8, cz * 16 + 8, 8, () => true, false).filter((p) => poi.isOccupied(p[0], p[1], p[2]));
    if (!pts.length) return null;
    const p = pts[m.level.random.nextInt(pts.length)];
    return landRandomPosTowards(m, 10, 7, p[0] + 0.5, p[2] + 0.5);
  }
}

/** vanilla OfferFlowerGoal: in the day, one time in 8000, hold a poppy out to a villager close by for 20 seconds */
class OfferFlowerGoal extends Goal {
  private villager: Villager | null = null;
  private tick_ = 0;
  constructor(readonly golem: IronGolem) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse(): boolean {
    const g = this.golem;
    if (!g.level.isDay() || g.random.nextInt(8000) !== 0) return false;
    let best: Villager | null = null, bd = Infinity;
    for (const e of g.level.getEntities(g.bb.inflate(6, 2, 6), (e) => e instanceof Villager && e.isAlive)) {
      const d = e.distanceToSqr(g.x, g.y, g.z);
      if (d < bd) {
        bd = d;
        best = e as Villager;
      }
    }
    this.villager = best;
    return best !== null;
  }
  override canContinueToUse(): boolean {
    return this.tick_ > 0;
  }
  override start(): void {
    this.tick_ = this.adjustedTickDelay(400);
    this.golem.offerFlower(true);
  }
  override stop(): void {
    this.golem.offerFlower(false);
    this.villager = null;
  }
  override tick(): void {
    if (this.villager) this.golem.lookControl.setLookAtEntity(this.villager, 30, 30);
    this.tick_--;
  }
}

/** vanilla DefendVillageTargetGoal: a player any villager within 10 has a reputation of -100 or worse with */
class DefendVillageTargetGoal extends TargetGoal {
  private potential: LivingEntity | null = null;
  constructor(readonly golem: IronGolem) {
    super(golem, false);
    this.flags = Flag.TARGET;
  }
  canUse(): boolean {
    const g = this.golem;
    const p = g.level.player;
    this.potential = null;
    if (!p || !p.isAlive) return false;
    const box = g.bb.inflate(10, 8, 10);
    // (vanilla TargetingConditions.forCombat().range(64): what it could fight, in sight)
    const seen = (e: LivingEntity) => {
      const r = 64 * Math.max(e.visibilityPercent(g), 2 / 64);
      return e.distanceToSqr(g.x, g.y, g.z) <= r * r && g.sensing.hasLineOfSight(e);
    };
    if (!box.intersects(p.bb) || !g.canAttack(p) || !seen(p)) return false;
    for (const e of g.level.getEntities(box, (e) => e instanceof Villager && e.isAlive)) {
      if (seen(e as Villager) && (e as Villager).playerReputation(p) <= -100) this.potential = p;
    }
    if (!this.potential) return false;
    return p.gameMode !== 'spectator' && p.gameMode !== 'creative';
  }
  override start(): void {
    this.golem.setTarget(this.potential);
    super.start();
  }
}

/** vanilla NearestAttackableTargetGoal(Player, 10, true, false, this::isAngryAt) */
class AngryAtPlayerGoal extends NearestAttackablePlayerGoal {
  constructor(readonly golem: IronGolem) {
    super(golem, true);
  }
  protected override extraCondition(): boolean {
    const p = this.golem.level.player;
    return !!p && this.golem.isAngryAt(p);
  }
}

// ---------------------------------------------------------------------------

export class IronGolem extends Mob {
  readonly type = 'iron_golem';
  readonly category: MobCategory = 'misc';
  /** the ticks left of its double-armed swing (vanilla attackAnimationTick) */
  attackAnimationTick = 0;
  /** the ticks left holding out a poppy (vanilla offerFlowerTick) */
  offerFlowerTick = 0;
  /** built by a player (vanilla isPlayerCreated): it never attacks players */
  playerCreated = false;
  /** vanilla NeutralMob: ticks of anger left, and at whom */
  angerTime = 0;
  angerTarget: Entity | null = null;

  constructor(level: Level) {
    super(level);
    this.setSize(1.4, 2.7);
    this.maxHealth = 100;
    this.health = 100;
    this.moveSpeedAttr = 0.25;
    this.kbResist = 1;
    this.attackDamage = 15;
    this.stepHeight = 1;
  }

  protected registerGoals(): void {
    this.goalSelector.addGoal(1, new MeleeAttackGoal(this, 1.0, true));
    this.goalSelector.addGoal(2, new MoveTowardsTargetGoal(this, 0.9, 32));
    this.goalSelector.addGoal(2, new MoveBackToVillageGoal(this, 0.6));
    this.goalSelector.addGoal(4, new GolemRandomStrollInVillageGoal(this, 0.6));
    this.goalSelector.addGoal(5, new OfferFlowerGoal(this));
    this.goalSelector.addGoal(7, new LookAtPlayerGoal(this, 6));
    this.goalSelector.addGoal(8, new RandomLookAroundGoal(this));
    this.targetSelector.addGoal(1, new DefendVillageTargetGoal(this));
    this.targetSelector.addGoal(2, new HurtByTargetGoal(this));
    this.targetSelector.addGoal(3, new AngryAtPlayerGoal(this));
    // vanilla NearestAttackableTargetGoal(Mob, 5, false, false, an enemy but not a creeper)
    this.targetSelector.addGoal(3, new NearestAttackableMobGoal(this, (e) => isEnemy(e) && e.type !== 'creeper', false, 5));
  }

  // --- the golem's nature ------------------------------------------------------------------------------------

  /** vanilla AbstractGolem.removeWhenFarAway: never */
  override removeWhenFarAway(): boolean {
    return false;
  }
  /** vanilla IronGolem.decreaseAirSupply: it needs no air */
  override canBreatheUnderwater(): boolean {
    return true;
  }
  /** vanilla fall_damage_immune */
  protected override causeFallDamage(_dist: number): void {}

  /** vanilla IronGolem.canAttackType: never a creeper, and a player's own golem never a player */
  override canAttack(e: LivingEntity | null): boolean {
    if (!e) return false;
    if (e.type === 'creeper') return false;
    if (this.playerCreated && e.type === 'player') return false;
    return super.canAttack(e);
  }

  crackiness(): Crackiness {
    return crackinessOf(this.health / this.maxHealth);
  }

  offerFlower(on: boolean): void {
    this.offerFlowerTick = on ? 400 : 0;
  }

  // --- anger (vanilla NeutralMob) ----------------------------------------------------------------------------

  isAngryAt(e: Entity): boolean {
    return e instanceof LivingEntity && this.canAttack(e) && e === this.angerTarget;
  }
  /** vanilla startPersistentAngerTimer: TimeUtil.rangeOfSeconds(20, 39) */
  private startAngerTimer(): void {
    this.angerTime = 400 + this.random.nextInt(381);
  }
  stopBeingAngry(): void {
    this.lastHurtByMob = null;
    this.angerTarget = null;
    this.setTarget(null);
    this.angerTime = 0;
  }
  /** vanilla NeutralMob.updatePersistentAnger */
  private updateAnger(): void {
    const t = this.target;
    if ((!t || !t.isAlive) && this.angerTarget && this.angerTarget.type !== 'player') {
      this.stopBeingAngry();
      return;
    }
    if (t && t !== this.angerTarget) {
      this.angerTarget = t;
      this.startAngerTimer();
    }
    if (this.angerTime > 0 && (!t || t.type !== 'player') && --this.angerTime === 0) this.stopBeingAngry();
  }

  // --- ticking ------------------------------------------------------------------------------------------------

  override aiStep(): void {
    super.aiStep();
    if (this.attackAnimationTick > 0) this.attackAnimationTick--;
    if (this.offerFlowerTick > 0) this.offerFlowerTick--;
    this.updateAnger();
  }

  // --- fighting -----------------------------------------------------------------------------------------------

  /** vanilla IronGolem.doHurtTarget: both arms up and down, 7.5 to 21.5, and a toss into the air */
  override doHurtTarget(target: Entity): boolean {
    this.attackAnimationTick = 10;
    const f = this.attackDamage;
    const dmg = Math.trunc(f) > 0 ? f / 2 + this.random.nextInt(Math.trunc(f)) : f;
    const ok = target.hurt(dmg, 'mob', this);
    if (ok) {
      const kb = target instanceof LivingEntity ? target.knockbackResistance() : 0;
      target.dy += 0.4 * Math.max(0, 1 - kb);
      if (target instanceof LivingEntity) this.lastHurtMob = target;
    }
    this.playSound('entity.iron_golem.attack', 1, 1);
    return ok;
  }

  /** vanilla IronGolem.hurt: the crack sound when a hit breaks it up further */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    const before = this.crackiness();
    const ok = super.hurt(amount, source, attacker, direct);
    if (ok && this.isAlive && this.crackiness() !== before) this.playSound('entity.iron_golem.damage', 1, 1);
    return ok;
  }

  /** vanilla IronGolem.mobInteract: an iron ingot mends 25 health (if there's any to mend) */
  interact(p: Player, stack: ItemStack | null): boolean {
    if (!stack || stack.item.id !== 'iron_ingot') return false;
    const before = this.health;
    this.heal(25);
    if (this.health === before) return false;
    this.playSound('entity.iron_golem.repair', 1, 1 + (this.random.nextFloat() - this.random.nextFloat()) * 0.2);
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    return true;
  }

  // --- sounds and loot ----------------------------------------------------------------------------------------

  /** vanilla AbstractGolem.getAmbientSound: none */
  override ambientSound(): string | null {
    return null;
  }
  override ambientSoundInterval(): number {
    return 120;
  }
  override hurtSound(): string {
    return 'entity.iron_golem.hurt';
  }
  override deathSound(): string {
    return 'entity.iron_golem.death';
  }
  /** vanilla IronGolem.playStepSound: full volume (the others step at 0.15) */
  protected override playStepSound(): void {
    this.playSound('entity.iron_golem.step', 1, 1);
  }

  /** vanilla entities/iron_golem */
  override lootTable(): LootEntry[] {
    return [
      { item: 'poppy', min: 0, max: 2, noLooting: true },
      { item: 'iron_ingot', min: 3, max: 5, noLooting: true },
    ];
  }

  protected override saveData(): Record<string, number | string | boolean> {
    return { playerCreated: this.playerCreated, anger: this.angerTime };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    this.playerCreated = d.playerCreated === true;
    this.angerTime = Number(d.anger ?? 0);
    if (this.angerTime > 0) this.angerTarget = this.level.player ?? null;
  }
}

// ---------------------------------------------------------------------------
// spawning (vanilla SpawnUtil.trySpawnMob with Strategy.LEGACY_IRON_GOLEM, and IronGolem.checkSpawnObstruction)

/** blocks a golem won't be summoned onto (vanilla LEGACY_IRON_GOLEM's list) */
const NOT_ON = /^(cobweb|cactus|glass_pane|.*_stained_glass_pane|.*_stained_glass|.*_leaves|conduit|ice|tnt|glowstone|beacon|sea_lantern|frosted_ice|tinted_glass|glass)$/;

/** vanilla BlockStateBase.isSolid (legacySolid): a collision shape three quarters of a block on average, or a block tall */
function legacySolid(st: number): boolean {
  const boxes = COLLISION[st];
  if (!boxes) return false;
  let x0 = 1, y0 = 1, z0 = 1, x1 = 0, y1 = 0, z1 = 0;
  for (const b of boxes) {
    x0 = Math.min(x0, b[0]);
    y0 = Math.min(y0, b[1]);
    z0 = Math.min(z0, b[2]);
    x1 = Math.max(x1, b[3]);
    y1 = Math.max(y1, b[4]);
    z1 = Math.max(z1, b[5]);
  }
  return (x1 - x0 + (y1 - y0) + (z1 - z0)) / 3 >= 0.7291666666666666 || y1 - y0 >= 1;
}

/** vanilla BlockStateBase.entityCanStandOn: its collision shape's top face is whole */
function topFull(st: number): boolean {
  if (FLAGS[st] & F_FULL_COLLISION) return true;
  return !!COLLISION[st]?.some((b) => b[4] >= 1 && b[0] <= 0 && b[2] <= 0 && b[3] >= 1 && b[5] >= 1);
}

/** vanilla IronGolem.checkSpawnObstruction: standing on something whole, room for its height, and no one in the way */
function roomForGolem(level: Level, g: IronGolem): boolean {
  const w = level.world;
  const x = Math.floor(g.x), y = Math.floor(g.y), z = Math.floor(g.z);
  if (!topFull(w.getState(x, y - 1, z))) return false;
  for (let i = 1; i < 3; i++) if (!isValidEmptySpawnBlock(w.getState(x, y + i, z))) return false;
  // (vanilla passes the golem's own block with no fluid: water there is fine)
  const st = w.getState(x, y, z);
  if (!(FLAGS[st] & F_WATER) && !isValidEmptySpawnBlock(st)) return false;
  return level.getEntities(g.bb, (e) => e !== g && !e.removed && (e instanceof LivingEntity || /boat$|minecart$/.test(e.type))).length === 0;
}

/**
 * vanilla SpawnUtil.trySpawnMob(IRON_GOLEM, MOB_SUMMONED, level, pos, 10, 8, 6, LEGACY_IRON_GOLEM): ten tries at a
 * spot up to 8 blocks across, searched from 6 above down to 6 below for air (or liquid) over something solid
 */
export function summonGolemNear(level: Level, x: number, y: number, z: number): IronGolem | null {
  const w = level.world;
  const r = level.random;
  for (let i = 0; i < 10; i++) {
    const px = x + r.nextInt(17) - 8, pz = z + r.nextInt(17) - 8;
    let py = y + 6;
    let above = w.getState(px, py, pz);
    let found = false;
    for (let k = 6; k >= -6; k--) {
      py--;
      const below = w.getState(px, py, pz);
      const aboveOk = !!(FLAGS[above] & (F_AIR | F_WATER | F_LAVA));
      const n = BLOCKS[STATE_BLOCK[below]].name;
      if (!NOT_ON.test(n) && aboveOk && (legacySolid(below) || n === 'powder_snow')) {
        py++;
        found = true;
        break;
      }
      above = below;
    }
    if (!found) continue;
    const g = new IronGolem(level);
    g.moveTo(px + 0.5, py, pz + 0.5, r.nextFloat() * 360, 0);
    if (!roomForGolem(level, g)) continue;
    g.finalizeSpawn('summoned');
    level.addEntity(g);
    return g;
  }
  return null;
}
