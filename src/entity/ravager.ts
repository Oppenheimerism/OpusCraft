// The ravager (vanilla Ravager): the raids' great horned beast, 100 health, that butts for 12 and tramples through
// leaves. A blow of its stopped by a shield may stun it for two seconds, after which it roars — knocking everything
// round it away and hurting all but the illagers. In a raid an illager may ride it.

import { Raider, RaiderHurtByTargetGoal, LookAtMobGoal, isVillagerTarget, AbstractIllager } from './raider';
import { Mob } from './mob';
import type { Level } from '../game/level';
import type { Entity } from './entity';
import { LivingEntity } from './living';
import { FloatGoal, WaterAvoidingRandomStrollGoal, LookAtPlayerGoal, MeleeAttackGoal, NearestAttackablePlayerGoal, NearestAttackableMobGoal } from './ai/goals';
import { PathType } from './ai/pathfinder';
import { Flag } from './ai/goal';
import { BLOCKS, STATE_BLOCK, FLAGS, F_WATER, F_LAVA } from '../world/block';

const DEG = Math.PI / 180;

/** vanilla nextGaussian */
function gauss(r: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class Ravager extends Raider {
  readonly type = 'ravager';
  /** vanilla attackTick: the head's butt, 10 ticks (entity event 4) */
  attackTick = 0;
  /** vanilla stunnedTick: 40 after a blocked blow (entity event 39) */
  stunnedTick = 0;
  /** vanilla roarTick: 20 after the stun, the roar at 10 */
  roarTick = 0;

  constructor(level: Level) {
    super(level);
    this.setSize(1.95, 2.2);
    this.maxHealth = this.health = 100;
    this.moveSpeedAttr = 0.3;
    this.kbResist = 0.75;
    this.attackDamage = 12;
    this.attackKnockback = 1.5;
    this.followRange = 32;
    this.stepHeight = 1;
    this.xpReward = 20;
    this.setPathfindingMalus(PathType.LEAVES, 0);
  }

  protected override registerGoals(): void {
    super.registerGoals();
    this.goalSelector.addGoal(0, new FloatGoal(this));
    this.goalSelector.addGoal(4, new MeleeAttackGoal(this, 1, true));
    this.goalSelector.addGoal(5, new WaterAvoidingRandomStrollGoal(this, 0.4));
    this.goalSelector.addGoal(6, new LookAtPlayerGoal(this, 6));
    this.goalSelector.addGoal(10, new LookAtMobGoal(this, 8));
    this.targetSelector.addGoal(2, new RaiderHurtByTargetGoal(this));
    this.targetSelector.addGoal(3, new NearestAttackablePlayerGoal(this, true));
    this.targetSelector.addGoal(4, new NearestAttackableMobGoal(this, (e) => isVillagerTarget(e) && !(e as Mob).isBaby(), true));
    this.targetSelector.addGoal(4, new NearestAttackableMobGoal(this, (e) => e.type === 'iron_golem', true));
  }

  /**
   * vanilla Ravager.updateControlFlags: a raider riding it leaves it its own moving, looking and targeting (it
   * doesn't hand them over as other mounts do); only a boat takes its jumping
   */
  override tick(): void {
    super.tick();
    if (this.tickCount % 5 === 0) {
      const rider = this.controllingPassenger();
      const own = !(rider instanceof Mob) || rider instanceof Raider;
      if (own) this.goalSelector.disabledFlags = this.vehicle?.type === 'boat' || this.vehicle?.type === 'chest_boat' ? Flag.JUMP : 0;
    }
  }

  override maxHeadYRot(): number {
    return 45;
  }

  /** vanilla EntityType passengerAttachments(0, 2.2625, -0.0625): the saddle just behind the middle, turned with it */
  override passengerAttachmentY(_p: Entity): number {
    return 2.2625;
  }
  override positionRider(p: Entity): void {
    // (vanilla getPassengerAttachmentPoint: the attachment turned by -yRot about y, Vec3.yRot)
    const r = this.yaw * DEG;
    const ox = Math.sin(r) * 0.0625, oz = -Math.cos(r) * 0.0625;
    p.setPos(this.x + ox, this.y + this.passengerAttachmentY(p) - p.vehicleAttachmentY(), this.z + oz);
  }

  /**
   * vanilla Ravager.aiStep: speed easing towards 0.35 with a target (0.3 without; nothing while it's busy with a butt,
   * a stun or a roar); up against leaves (with mobGriefing) it tramples them, else hops; the roar, the stun's wisps
   */
  override aiStep(): void {
    super.aiStep();
    if (!this.isAlive) return;
    if (this.isImmobile()) this.moveSpeedAttr = 0;
    else {
      const d0 = this.target ? 0.35 : 0.3;
      this.moveSpeedAttr = this.moveSpeedAttr + (d0 - this.moveSpeedAttr) * 0.1;
    }
    if (this.horizontalCollision && this.level.gameRules.mobGriefing) {
      let broke = false;
      const bb = this.bb.inflate(0.2, 0.2, 0.2);
      for (let x = Math.floor(bb.minX); x <= Math.floor(bb.maxX); x++)
        for (let y = Math.floor(bb.minY); y <= Math.floor(bb.maxY); y++)
          for (let z = Math.floor(bb.minZ); z <= Math.floor(bb.maxZ); z++) {
            const n = BLOCKS[STATE_BLOCK[this.level.world.getState(x, y, z)]].name;
            if (n.endsWith('_leaves')) broke = this.level.destroyBlock(x, y, z, true, null, true, null, this) || broke;
          }
      if (!broke && this.onGround) this.jumpFromGround();
    }
    if (this.roarTick > 0 && --this.roarTick === 10) this.roar();
    if (this.attackTick > 0) this.attackTick--;
    if (this.stunnedTick > 0) {
      this.stunnedTick--;
      this.stunEffect();
      if (this.stunnedTick === 0) {
        this.playSound('entity.ravager.roar', 1, 1);
        this.roarTick = 20;
      }
    }
  }

  /** vanilla stunEffect: now and then a grey wisp over its head */
  private stunEffect(): void {
    const r = this.random;
    if (r.nextInt(6) !== 0) return;
    const d0 = this.x - this.width * Math.sin(this.bodyYaw * DEG) + (r.nextFloat() * 0.6 - 0.3);
    const d1 = this.y + this.height - 0.3;
    const d2 = this.z + this.width * Math.cos(this.bodyYaw * DEG) + (r.nextFloat() * 0.6 - 0.3);
    // (vanilla ENTITY_EFFECT 0.498, 0.514, 0.573)
    this.level.particles.entityEffect?.(d0, d1, d2, 0x7f8392, 1);
  }

  /** vanilla isImmobile: not while it butts, is stunned or roars */
  override isImmobile(): boolean {
    return super.isImmobile() || this.attackTick > 0 || this.stunnedTick > 0 || this.roarTick > 0;
  }

  /** vanilla hasLineOfSight: blind while stunned or roaring */
  override hasLineOfSight(e: Entity): boolean {
    return this.stunnedTick <= 0 && this.roarTick <= 0 ? super.hasLineOfSight(e) : false;
  }

  /**
   * vanilla Ravager.blockedByShield: stopped by a shield (not mid-roar), it's stunned half the time (the defender
   * pushed from it), otherwise it throws the defender back hard
   */
  blockedByShield(defender: LivingEntity): void {
    if (this.roarTick !== 0) return;
    if (this.random.nextFloat() < 0.5) {
      this.stunnedTick = 40;
      this.playSound('entity.ravager.stunned', 1, 1);
      defender.pushAgainst(this);
    } else this.strongKnockback(defender);
  }

  /**
   * vanilla roar: everything alive within 4 (armour stands too, with mobGriefing) but ravagers is thrown back, and all
   * but the illagers take 6 damage from it; a burst of 40 puffs
   */
  private roar(): void {
    if (!this.isAlive) return;
    const griefing = !!this.level.gameRules.mobGriefing;
    for (const e of this.level.getEntities(this.bb.inflate(4, 4, 4), (e) => e instanceof LivingEntity && !!e.isAlive && !(e instanceof Ravager) && (griefing || e.type !== 'armor_stand'))) {
      if (!(e instanceof AbstractIllager)) e.hurt(6, 'mob', this);
      this.strongKnockback(e);
    }
    const cx = (this.bb.minX + this.bb.maxX) / 2, cy = (this.bb.minY + this.bb.maxY) / 2, cz = (this.bb.minZ + this.bb.maxZ) / 2;
    const r = () => this.random.nextFloat();
    for (let i = 0; i < 40; i++) this.level.particles.spawn?.('poof', cx, cy, cz, gauss(r) * 0.2, gauss(r) * 0.2, gauss(r) * 0.2);
  }

  /** vanilla strongKnockback: a shove away of 4 over the square of the distance, and up 0.2 */
  private strongKnockback(e: Entity): void {
    const d0 = e.x - this.x, d1 = e.z - this.z;
    const d2 = Math.max(d0 * d0 + d1 * d1, 0.001);
    e.push((d0 / d2) * 4, 0.2, (d1 / d2) * 4);
  }

  /** vanilla doHurtTarget: the butt (entity event 4) and its sound, then the blow */
  override doHurtTarget(t: Entity): boolean {
    this.attackTick = 10;
    this.playSound('entity.ravager.attack', 1, 1);
    return super.doHurtTarget(t);
  }

  /** vanilla checkSpawnObstruction: no liquid where it'd stand */
  override checkSpawnObstruction(): boolean {
    const b = this.bb, w = this.level.world;
    for (let x = Math.floor(b.minX); x <= Math.floor(b.maxX); x++)
      for (let y = Math.floor(b.minY); y <= Math.floor(b.maxY); y++)
        for (let z = Math.floor(b.minZ); z <= Math.floor(b.maxZ); z++) if (FLAGS[w.getState(x, y, z)] & (F_WATER | F_LAVA)) return false;
    return true;
  }

  /** vanilla Ravager.canBeLeader: never a captain */
  override canBeLeader(): boolean {
    return false;
  }
  applyRaidBuffs(_wave: number, _unused: boolean): void {}

  celebrateSound(): string {
    return 'entity.ravager.celebrate';
  }
  override ambientSound(): string {
    return 'entity.ravager.ambient';
  }
  override hurtSound(): string {
    return 'entity.ravager.hurt';
  }
  override deathSound(): string {
    return 'entity.ravager.death';
  }
  override stepSound(): string {
    return 'entity.ravager.step';
  }

  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), AttackTick: this.attackTick, StunTick: this.stunnedTick, RoarTick: this.roarTick };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.attackTick = Number(d.AttackTick ?? 0);
    this.stunnedTick = Number(d.StunTick ?? 0);
    this.roarTick = Number(d.RoarTick ?? 0);
  }
}
