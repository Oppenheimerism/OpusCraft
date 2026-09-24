// The witch (vanilla Witch): a raider that keeps its distance and throws splash potions — slowness at anyone far
// off, poison while they're hale, weakness now and then up close, harming the rest of the time — and drinks its own
// to get by: water breathing under water, fire resistance when burning, healing when hurt, swiftness to catch up.
// Magic barely touches it and its own potions not at all. A villager struck by lightning turns into one.

import { Monster } from './monsters';
import { Mob, LootEntry } from './mob';
import type { Level } from '../game/level';
import type { Entity } from './entity';
import { LivingEntity, FIRE_SOURCES } from './living';
import { FloatGoal, WaterAvoidingRandomStrollGoal, LookAtPlayerGoal, RandomLookAroundGoal, HurtByTargetGoal, NearestAttackablePlayerGoal, RangedAttackGoal, type RangedAttacker } from './ai/goals';
import { ItemStack, ITEMS } from '../item/item';
import { allEffects, contentsOf, potionStack } from '../item/potions';
import { ThrownPotion } from './thrownPotion';
import { FLUID_WATER } from '../world/fluids';
import { Villager, lightningConversion } from './villager';

/** vanilla #raiders: the ones a witch won't turn on when they hurt it (and heals, in a raid) */
const RAIDERS = new Set(['witch', 'pillager', 'vindicator', 'evoker', 'illusioner', 'ravager']);
/** vanilla #witch_resistant_to: what the witch takes only 15% of */
const WITCH_RESISTANT_TO = new Set(['magic', 'indirectMagic', 'sonicBoom', 'thorns']);

/** vanilla HurtByTargetGoal(this, Raider.class): it turns on whoever hurt it, unless that's a fellow raider */
class WitchHurtByTargetGoal extends HurtByTargetGoal {
  override canUse(): boolean {
    const by = this.mob.lastHurtByMob;
    return !(by && RAIDERS.has(by.type)) && super.canUse();
  }
}

/** vanilla nextGaussian */
function gauss(r: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class Witch extends Monster implements RangedAttacker {
  readonly type = 'witch';
  /** vanilla DATA_USING_ITEM: drinking the potion in its hand */
  drinking = false;
  private usingTime = 0;
  /** what hurt it, while the hurt is being worked out (vanilla DamageSource.getEntity) */
  private hurtBy: Entity | null = null;
  /** vanilla getLastDamageSource: the last hurt, for 2 seconds */
  private lastHurtSource: string | null = null;
  private lastHurtTick = 0;

  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 1.95);
    this.maxHealth = this.health = 26;
    this.moveSpeedAttr = 0.25;
  }

  override get eyeHeight(): number {
    return 1.62;
  }

  /** (vanilla SPEED_MODIFIER_DRINKING: -0.25, which stops it in its tracks while it drinks) */
  override get moveSpeedAttr(): number {
    const base = super.moveSpeedAttr;
    return this.drinking ? 0 : base;
  }
  override set moveSpeedAttr(v: number) {
    super.moveSpeedAttr = v;
  }

  protected registerGoals(): void {
    this.goalSelector.addGoal(1, new FloatGoal(this));
    this.goalSelector.addGoal(2, new RangedAttackGoal(this, 1.0, 60, 60, 10));
    this.goalSelector.addGoal(2, new WaterAvoidingRandomStrollGoal(this, 1.0));
    this.goalSelector.addGoal(3, new LookAtPlayerGoal(this, 8));
    this.goalSelector.addGoal(3, new RandomLookAroundGoal(this));
    this.targetSelector.addGoal(1, new WitchHurtByTargetGoal(this));
    // (vanilla NearestAttackableWitchTargetGoal: players, unless it's busy healing raiders — there are no raids yet)
    this.targetSelector.addGoal(3, new NearestAttackablePlayerGoal(this, true));
  }

  /**
   * vanilla Witch.aiStep: done drinking, the potion's effects take and the bottle's gone; otherwise it may start on
   * one it needs; now and then a wisp of purple sparkles rises over its hat (entity event 15)
   */
  override aiStep(): void {
    if (this.isAlive) {
      const r = this.random;
      if (this.drinking) {
        if (this.usingTime-- <= 0) {
          this.drinking = false;
          const s = this.mainHand;
          this.setItemSlot('mainhand', null);
          if (s?.item.id === 'potion') for (const e of allEffects(contentsOf(s))) this.addEffect(e);
        }
      } else {
        let potion: string | null = null;
        if (r.nextFloat() < 0.15 && this.eyeFluid === FLUID_WATER && !this.hasEffect('water_breathing')) potion = 'water_breathing';
        else if (r.nextFloat() < 0.15 && (this.isOnFire() || (this.lastHurtSource !== null && FIRE_SOURCES.has(this.lastHurtSource))) && !this.hasEffect('fire_resistance')) potion = 'fire_resistance';
        else if (r.nextFloat() < 0.05 && this.health < this.maxHealth) potion = 'healing';
        else if (r.nextFloat() < 0.5 && this.target && !this.hasEffect('speed') && this.target.distanceToSqr(this.x, this.y, this.z) > 121) potion = 'swiftness';
        if (potion) {
          this.setItemSlot('mainhand', potionStack('potion', potion));
          // (vanilla PotionItem.getUseDuration)
          this.usingTime = 32;
          this.drinking = true;
          this.playSound('entity.witch.drink', 1, 0.8 + r.nextFloat() * 0.4);
        }
      }
      if (r.nextFloat() < 7.5e-4) this.sparkle();
    }
    if (this.level.gameTime - this.lastHurtTick > 40) this.lastHurtSource = null;
    super.aiStep();
  }

  /** vanilla Witch.handleEntityEvent(15): 10 to 44 purple sparkles just over its head */
  private sparkle(): void {
    const r = () => this.random.nextFloat();
    const n = this.random.nextInt(35) + 10;
    for (let i = 0; i < n; i++) {
      const f = r() * 0.5 + 0.35;
      this.level.particles.spell?.('witch', this.x + gauss(r) * 0.13, this.bb.maxY + 0.5 + gauss(r) * 0.13, this.z + gauss(r) * 0.13, 0, 0, 0, f, 0, f);
    }
  }

  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    this.hurtBy = attacker ?? null;
    try {
      const ok = super.hurt(amount, source, attacker, direct);
      if (ok) {
        this.lastHurtSource = source;
        this.lastHurtTick = this.level.gameTime;
      }
      return ok;
    } finally {
      this.hurtBy = null;
    }
  }

  /** vanilla Witch.getDamageAfterMagicAbsorb: nothing from its own doing, 15% of magic and thorns */
  protected override damageAfterMagicAbsorb(source: string, amount: number): number {
    amount = super.damageAfterMagicAbsorb(source, amount);
    if (this.hurtBy === this) amount = 0;
    if (WITCH_RESISTANT_TO.has(source)) amount *= 0.15;
    return amount;
  }

  /**
   * vanilla Witch.performRangedAttack: a splash potion lobbed a little ahead of where the target's going — healing
   * or regeneration for a fellow raider, slowness at 8 blocks or more (if it isn't slowed yet), poison while it has 8
   * health or more (if it isn't poisoned), weakness now and then within 3 (if it isn't weak), else harming
   */
  performRangedAttack(t: LivingEntity, _power: number): void {
    if (this.drinking) return;
    const d0 = t.x + t.dx - this.x;
    const d1 = t.y + t.eyeHeight - 1.1 - this.y;
    const d2 = t.z + t.dz - this.z;
    const d3 = Math.sqrt(d0 * d0 + d2 * d2);
    let potion = 'harming';
    if (RAIDERS.has(t.type)) {
      potion = t.health <= 4 ? 'healing' : 'regeneration';
      this.setTarget(null);
    } else if (d3 >= 8 && !t.hasEffect('slowness')) potion = 'slowness';
    else if (t.health >= 8 && !t.hasEffect('poison')) potion = 'poison';
    else if (d3 <= 3 && !t.hasEffect('weakness') && this.random.nextFloat() < 0.25) potion = 'weakness';
    const p = new ThrownPotion(this.level, this, potionStack('splash_potion', potion));
    p.shoot(d0, d1 + d3 * 0.2, d2, 0.75, 8);
    // (vanilla setXRot(getXRot() + 20): only how the bottle is turned as it flies)
    p.pitch = p.pitchO = p.pitch + 20;
    this.playSound('entity.witch.throw', 1, 0.8 + this.random.nextFloat() * 0.4);
    this.level.addEntity(p);
  }

  override ambientSound(): string {
    return 'entity.witch.ambient';
  }
  override hurtSound(): string {
    return 'entity.witch.hurt';
  }
  override deathSound(): string {
    return 'entity.witch.death';
  }

  /** vanilla entities/witch: 1 to 3 picks of bits for brewing, sticks twice as likely, 0 to 2 of each (+ looting) */
  protected override dropLoot(_byPlayer: boolean, looting = 0): void {
    const table: [string, number][] = [['glowstone_dust', 1], ['sugar', 1], ['redstone', 1], ['spider_eye', 1], ['glass_bottle', 1], ['gunpowder', 1], ['stick', 2]];
    const rolls = 1 + this.random.nextInt(3);
    for (let i = 0; i < rolls; i++) {
      let k = this.random.nextInt(8);
      let id = table[0][0];
      for (const [name, w] of table) {
        if (k < w) {
          id = name;
          break;
        }
        k -= w;
      }
      let n = this.random.nextInt(3);
      if (looting > 0) n += Math.round(looting * this.random.nextFloat());
      const it = ITEMS.get(id);
      if (n > 0 && it) this.spawnAtLocation(new ItemStack(it, n));
    }
  }
  override lootTable(): LootEntry[] {
    return [];
  }

  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), drinking: this.drinking, usingTime: this.usingTime };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.drinking = d.drinking === true;
    this.usingTime = Number(d.usingTime ?? 0);
  }
}

// vanilla Villager.thunderHit: struck by lightning (not in peaceful), a villager becomes a witch where it stood, one
// that stays, and gives up its bed and workstation
lightningConversion.witch = (v: Villager): Mob | null => {
  const w = new Witch(v.level);
  w.moveTo(v.x, v.y, v.z, v.yaw, v.pitch);
  w.headYaw = w.headYawO = v.headYaw;
  w.bodyYaw = w.bodyYawO = v.bodyYaw;
  w.finalizeSpawn('conversion');
  w.persistenceRequired = true;
  v.releaseAllPois();
  v.level.addEntity(w);
  v.remove();
  return w;
};
