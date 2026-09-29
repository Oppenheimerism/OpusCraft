// (remaining mobs: the panda) The panda (vanilla 1.21 Panda extends Animal): the big black-and-white bear of the
// jungles, most of all the bamboo jungle. Each carries two genes (normal, lazy, worried, playful, brown, weak,
// aggressive), and shows its main one, unless that's recessive (brown, weak), which shows only when both are the
// same. A lazy one ambles slowly and lies about on its back; a worried one keeps away from players and monsters and
// cowers when it thunders; a playful one rolls over and over; a weak one (only 10 health) sneezes more as a cub; an
// aggressive one fights back when hurt, and joins in when another panda is. The others bite back only once. It
// picks up bamboo and cake from the ground, sits down to eat it (crumbs and munching), and gets up to wander off
// again, dropping what's left. Bamboo tempts it and breeds it, but only with bamboo growing within a few blocks:
// with none, it sulks, shaking its head. A cub sneezes now and then, the grown pandas round it jumping at the noise,
// and one time in 700 a slimeball comes out. One bamboo when it dies (none from a cub).

import { Animal, BreedGoal, FollowParentGoal, TemptGoal } from './animals';
import type { Level } from '../game/level';
import type { LootEntry, SpawnGroup, SpawnReason } from './mob';
import type { Entity } from './entity';
import { LivingEntity } from './living';
import type { Player } from './player';
import { ItemEntity } from './itemEntity';
import { ItemStack } from '../item/item';
import { Goal, Flag, reducedTickDelay } from './ai/goal';
import { MoveControl } from './ai/controls';
import {
  AvoidEntityGoal, FloatGoal, HurtByTargetGoal, LookAtPlayerGoal, MeleeAttackGoal, PanicGoal, RandomLookAroundGoal,
  WaterAvoidingRandomStrollGoal,
} from './ai/goals';
import { isMonster } from './rabbit';
import { FLAGS, F_AIR, BLOCKS, STATE_BLOCK } from '../world/block';

const DEG = Math.PI / 180;

/** vanilla Panda.Gene (by id: normal 0, lazy 1, worried 2, playful 3, brown 4, weak 5, aggressive 6) */
export const PANDA_GENES = ['normal', 'lazy', 'worried', 'playful', 'brown', 'weak', 'aggressive'] as const;
export type PandaGene = (typeof PANDA_GENES)[number];

/** vanilla Gene.isRecessive: shown only when both genes are it */
const RECESSIVE = new Set<PandaGene>(['brown', 'weak']);

/** vanilla Gene.byName: an unknown name is normal */
export function geneByName(s: string): PandaGene {
  return (PANDA_GENES as readonly string[]).includes(s) ? (s as PandaGene) : 'normal';
}

/**
 * vanilla Gene.getRandom: of sixteen, lazy, worried, playful and aggressive one each, weak five, brown two, and
 * normal the other five
 */
export function randomGene(nextInt: (n: number) => number): PandaGene {
  const i = nextInt(16);
  if (i === 0) return 'lazy';
  if (i === 1) return 'worried';
  if (i === 2) return 'playful';
  if (i === 4) return 'aggressive';
  if (i < 9) return 'weak';
  return i < 11 ? 'brown' : 'normal';
}

/** vanilla Gene.getVariantFromGenes: the main gene, unless it's recessive and the hidden one differs (then normal) */
export function variantFromGenes(main: PandaGene, hidden: PandaGene): PandaGene {
  return RECESSIVE.has(main) ? (main === hidden ? main : 'normal') : main;
}

/** vanilla PANDA_ITEMS: bamboo or cake lying about, to be taken */
function pandaItem(e: Entity): e is ItemEntity {
  if (!(e instanceof ItemEntity) || e.removed || e.pickupDelay > 0) return false;
  const id = e.stack.item.id;
  return id === 'bamboo' || id === 'cake';
}

/** vanilla #panda_food */
const PANDA_FOOD = new Set(['bamboo']);

/** vanilla #panic_environmental_causes (PandaPanicGoal runs only from these) */
const ENVIRONMENTAL = new Set(['cactus', 'freeze', 'hotFloor', 'inFire', 'lava', 'lightningBolt', 'onFire']);

export class Panda extends Animal {
  readonly type = 'panda';
  protected adultWidth = 1.3;
  protected adultHeight = 1.25;
  /** vanilla MAIN_GENE_ID and HIDDEN_GENE_ID */
  mainGene: PandaGene = 'normal';
  hiddenGene: PandaGene = 'normal';
  /** vanilla DATA_ID_FLAGS: sneezing (2), rolling (4), sitting (8), on its back (16) */
  sneezing = false;
  rolling = false;
  sitting = false;
  onBack = false;
  /** vanilla UNHAPPY_COUNTER: ticks left of sulking (and shaking its head) when it wants to breed with no bamboo about */
  unhappyCounter = 0;
  /** vanilla SNEEZE_COUNTER: ticks into a sneeze */
  sneezeCounter = 0;
  /** vanilla EAT_COUNTER: ticks into its meal (0: not eating) */
  eatCounter = 0;
  /** vanilla rollCounter: ticks into a roll (the renderer turns it over by it) */
  rollCounter = 0;
  /** vanilla sitAmount, onBackAmount, rollAmount and the last tick's: how far into each pose, 0 to 1 */
  sitAmount = 0;
  sitAmountO = 0;
  onBackAmount = 0;
  onBackAmountO = 0;
  rollAmount = 0;
  rollAmountO = 0;
  /** vanilla gotBamboo, didBite: what calls off a fight (given bamboo during it; a bite, for all but an aggressive one) */
  gotBamboo = false;
  didBite = false;
  /**
   * what only the host's AI keeps (a record of its own, which isn't sent to guests): vanilla rollDelta, the push it
   * rolls along with
   */
  private readonly rollState = { x: 0, z: 0 };
  /** vanilla lookAtPlayerGoal: the breeding goal points it at the player who fed it */
  lookAtPlayerGoal: PandaLookAtPlayerGoal | null = null;

  constructor(level: Level) {
    super(level);
    this.setSize(1.3, 1.25);
    // vanilla createAttributes: 0.15 speed, 6 attack damage (and the mob's 20 health)
    this.maxHealth = this.health = 20;
    this.moveSpeedAttr = 0.15;
    this.attackDamage = 6;
    this.moveControl = new PandaMoveControl(this);
    // (vanilla: set in the constructor, before its age is, so every panda picks things up, cubs too)
    this.canPickUpLoot = true;
  }

  protected registerGoals(): void {
    const g = this.goalSelector;
    g.addGoal(0, new FloatGoal(this));
    g.addGoal(2, new PandaPanicGoal(this, 2.0));
    g.addGoal(2, new PandaBreedGoal(this, 1.0));
    g.addGoal(3, new PandaAttackGoal(this, 1.2, true));
    g.addGoal(4, new TemptGoal(this, 1.0, PANDA_FOOD, false));
    g.addGoal(6, new PandaAvoidGoal(this, (e) => e.type === 'player' && (e as Player).gameMode !== 'spectator', 8, 2.0, 2.0));
    g.addGoal(6, new PandaAvoidGoal(this, isMonster, 4, 2.0, 2.0));
    g.addGoal(7, new PandaSitGoal(this));
    g.addGoal(8, new PandaLieOnBackGoal(this));
    g.addGoal(8, new PandaSneezeGoal(this));
    this.lookAtPlayerGoal = new PandaLookAtPlayerGoal(this, 6);
    g.addGoal(9, this.lookAtPlayerGoal);
    g.addGoal(10, new RandomLookAroundGoal(this));
    g.addGoal(12, new PandaRollGoal(this));
    g.addGoal(13, new FollowParentGoal(this, 1.25));
    g.addGoal(14, new WaterAvoidingRandomStrollGoal(this, 1.0));
    // vanilla PandaHurtByTargetGoal(this).setAlertOthers(new Class[0])
    this.targetSelector.addGoal(1, new PandaHurtByTargetGoal(this).setAlertOthers());
  }

  // --- genes -------------------------------------------------------------------------------------------------

  /** vanilla getVariant: the gene it shows */
  variant(): PandaGene {
    return variantFromGenes(this.mainGene, this.hiddenGene);
  }
  isLazy(): boolean {
    return this.variant() === 'lazy';
  }
  isWorried(): boolean {
    return this.variant() === 'worried';
  }
  isPlayful(): boolean {
    return this.variant() === 'playful';
  }
  isBrown(): boolean {
    return this.variant() === 'brown';
  }
  isWeak(): boolean {
    return this.variant() === 'weak';
  }
  /** vanilla isAggressive (the gene; vanilla's own override of Mob.isAggressive) */
  isAggressive(): boolean {
    return this.variant() === 'aggressive';
  }

  /** vanilla getOneOfGenesRandomly */
  private oneOfGenes(): PandaGene {
    return this.random.nextBool() ? this.mainGene : this.hiddenGene;
  }

  /**
   * vanilla setGeneFromParents: one gene from each parent (which goes main, which hidden, a coin toss), each
   * mutating one time in 32 to a random gene
   */
  setGeneFromParents(father: Panda, mother: Panda | null): void {
    const r = this.random, rnd = (): PandaGene => randomGene((n) => r.nextInt(n));
    if (!mother) {
      if (r.nextBool()) {
        this.mainGene = father.oneOfGenes();
        this.hiddenGene = rnd();
      } else {
        this.mainGene = rnd();
        this.hiddenGene = father.oneOfGenes();
      }
    } else if (r.nextBool()) {
      this.mainGene = father.oneOfGenes();
      this.hiddenGene = mother.oneOfGenes();
    } else {
      this.mainGene = mother.oneOfGenes();
      this.hiddenGene = father.oneOfGenes();
    }
    if (r.nextInt(32) === 0) this.mainGene = rnd();
    if (r.nextInt(32) === 0) this.hiddenGene = rnd();
  }

  /** vanilla setAttributes: a weak panda has 10 health, a lazy one 0.07 speed */
  setAttributes(): void {
    if (this.isWeak()) this.maxHealth = 10;
    if (this.isLazy()) this.moveSpeedAttr = 0.07;
  }

  /**
   * vanilla finalizeSpawn: two random genes (the world's random) and the attributes they give; in a pack, one in five
   * after the first a cub (AgeableMobGroupData(0.2))
   */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    const r = this.level.random ?? this.random;
    this.mainGene = randomGene((n) => r.nextInt(n));
    this.hiddenGene = randomGene((n) => r.nextInt(n));
    this.setAttributes();
    const g = group ?? {};
    g.ageable ??= { size: 0, babyChance: 0.2 };
    super.finalizeSpawn(reason, g);
  }

  // --- states ------------------------------------------------------------------------------------------------

  /** vanilla isEating: EAT_COUNTER above 0 */
  isEating(): boolean {
    return this.eatCounter > 0;
  }
  /** vanilla eat: starts its meal's count at 1, or ends it */
  eat(eating: boolean): void {
    this.eatCounter = eating ? 1 : 0;
  }
  isSitting(): boolean {
    return this.sitting;
  }
  sit(v: boolean): void {
    this.sitting = v;
  }
  isOnBack(): boolean {
    return this.onBack;
  }
  setOnBack(v: boolean): void {
    this.onBack = v;
  }
  isSneezing(): boolean {
    return this.sneezing;
  }
  /** vanilla sneeze: its count starts over when it stops */
  sneeze(v: boolean): void {
    this.sneezing = v;
    if (!v) this.sneezeCounter = 0;
  }
  isRolling(): boolean {
    return this.rolling;
  }
  roll(v: boolean): void {
    this.rolling = v;
  }

  /** vanilla isScared: a worried panda in a thunderstorm */
  isScared(): boolean {
    return this.isWorried() && this.level.isThundering();
  }

  /** vanilla canPerformAction: not on its back, cowering, eating, rolling or sitting */
  canPerformAction(): boolean {
    return !this.onBack && !this.isScared() && !this.isEating() && !this.rolling && !this.sitting;
  }

  /** vanilla tryToSit: out of the water, it stops where it is and sits */
  tryToSit(): void {
    if (this.inWater) return;
    this.zza = 0;
    this.navigation.stop();
    this.sit(true);
  }

  isFood(s: ItemStack): boolean {
    return PANDA_FOOD.has(s.item.id);
  }
  /** vanilla isFoodOrCake: what it finishes when it's done eating */
  private isFoodOrCake(s: ItemStack | null): boolean {
    return !!s && (this.isFood(s) || s.item.id === 'cake');
  }

  makeBaby(partner: Animal): Animal {
    // vanilla getBreedOffspring: genes from both, and what they give
    const baby = new Panda(this.level);
    if (partner instanceof Panda) baby.setGeneFromParents(this, partner);
    baby.setAttributes();
    return baby;
  }

  /** vanilla canBeLeashed: never */
  override canBeLeashed(): boolean {
    return false;
  }

  /** vanilla BABY_DIMENSIONS: a cub's rider sits 0.40625 up */
  override passengerAttachmentY(p: Entity): number {
    return this.isBaby() ? 0.40625 : super.passengerAttachmentY(p);
  }

  // --- ticking -----------------------------------------------------------------------------------------------

  override tick(): void {
    super.tick();
    if (this.removed) return;
    // a worried panda sits (and stops eating) in a thunderstorm, out of the water; otherwise it's up unless it's eating
    if (this.isWorried()) {
      if (this.level.isThundering() && !this.inWater) {
        this.sit(true);
        this.eat(false);
      } else if (!this.isEating()) this.sit(false);
    }
    const t = this.target;
    if (!t) {
      this.gotBamboo = false;
      this.didBite = false;
    }
    if (this.unhappyCounter > 0) {
      if (t) this.lookAtEntity(t, 90, 90);
      if (this.unhappyCounter === 29 || this.unhappyCounter === 14) this.playSound('entity.panda.cant_breed', 1, 1);
      this.unhappyCounter--;
    }
    if (this.sneezing) {
      this.sneezeCounter++;
      if (this.sneezeCounter > 20) {
        this.sneeze(false);
        this.afterSneeze();
      } else if (this.sneezeCounter === 1) this.playSound('entity.panda.pre_sneeze', 1, 1);
    }
    if (this.rolling) this.handleRoll();
    else this.rollCounter = 0;
    if (this.sitting) this.pitch = 0;
    this.sitAmountO = this.sitAmount;
    this.sitAmount = this.sitting ? Math.min(1, this.sitAmount + 0.15) : Math.max(0, this.sitAmount - 0.19);
    this.handleEating();
    this.onBackAmountO = this.onBackAmount;
    this.onBackAmount = this.onBack ? Math.min(1, this.onBackAmount + 0.15) : Math.max(0, this.onBackAmount - 0.19);
    this.rollAmountO = this.rollAmount;
    this.rollAmount = this.rolling ? Math.min(1, this.rollAmount + 0.15) : Math.max(0, this.rollAmount - 0.19);
  }

  /** vanilla getSitAmount, getLieOnBackAmount, getRollAmount: between the last tick's and this one's */
  sitAmountAt(p: number): number {
    return this.sitAmountO + (this.sitAmount - this.sitAmountO) * p;
  }
  onBackAmountAt(p: number): number {
    return this.onBackAmountO + (this.onBackAmount - this.onBackAmountO) * p;
  }
  rollAmountAt(p: number): number {
    return this.rollAmountO + (this.rollAmount - this.rollAmountO) * p;
  }

  /**
   * vanilla handleEating: sitting with something in its paws (and not cowering), it starts eating one tick in 80; it
   * stops when it's up or has nothing. Past 80 ticks in, one tick in 20 it stops, and past 100 it has finished
   * (bamboo or cake: the whole of what it held) and gets up
   */
  private handleEating(): void {
    const held = this.mainHand;
    if (!this.isEating() && this.sitting && !this.isScared() && held && this.random.nextInt(80) === 1) this.eat(true);
    else if (!held || !this.sitting) this.eat(false);
    if (!this.isEating()) return;
    this.addEatingParticles();
    if (this.eatCounter > 80 && this.random.nextInt(20) === 1) {
      if (this.eatCounter > 100 && this.isFoodOrCake(this.mainHand)) {
        this.setItemSlot('mainhand', null);
        this.level.gameEvent('eat', this.x, this.y, this.z, { entity: this });
        this.sit(false);
      }
      this.eat(false);
      return;
    }
    this.eatCounter++;
  }

  /**
   * vanilla addEatingParticles: every fifth tick of its meal a munch (half or full volume) and six crumbs of what it
   * holds, from about a block ahead of it at head height, tossed up and off the way it's looking
   */
  private addEatingParticles(): void {
    const s = this.mainHand;
    if (this.eatCounter % 5 !== 0 || !s) return;
    const r = this.random;
    this.playSound('entity.panda.eat', 0.5 + 0.5 * r.nextInt(2), (r.nextFloat() - r.nextFloat()) * 0.2 + 1);
    const xr = -this.pitch * DEG, yr = -this.yaw * DEG, br = -this.bodyYaw * DEG;
    for (let i = 0; i < 6; i++) {
      // (vanilla Vec3.xRot, then yRot)
      const x0 = (r.nextFloat() - 0.5) * 0.1, y0 = Math.random() * 0.1 + 0.1, z0 = (r.nextFloat() - 0.5) * 0.1;
      const y1 = y0 * Math.cos(xr) + z0 * Math.sin(xr), z1 = z0 * Math.cos(xr) - y0 * Math.sin(xr);
      const vx = x0 * Math.cos(yr) + z1 * Math.sin(yr), vz = z1 * Math.cos(yr) - x0 * Math.sin(yr);
      const d0 = -r.nextFloat() * 0.6 - 0.3;
      const px = (r.nextFloat() - 0.5) * 0.8, pz = 1 + (r.nextFloat() - 0.5) * 0.4;
      const ox = px * Math.cos(br) + pz * Math.sin(br), oz = pz * Math.cos(br) - px * Math.sin(br);
      this.level.particles.spawn?.(`item_${s.item.id}`, this.x + ox, this.y + this.eyeHeight + 1 + d0, this.z + oz, vx, y1 + 0.05, vz);
    }
  }

  /**
   * vanilla handleRoll: 32 ticks of rolling over. The first pushes it off ahead (a cub half as hard) and up; it rolls
   * on with that push, stopping still and hopping at each quarter turn (7, 14, 21, 28)
   */
  private handleRoll(): void {
    this.rollCounter++;
    if (this.rollCounter > 32) {
      this.roll(false);
      return;
    }
    const d = this.rollState;
    if (this.rollCounter === 1) {
      const f = this.yaw * DEG, f1 = this.isBaby() ? 0.1 : 0.2;
      d.x = this.dx - Math.sin(f) * f1;
      d.z = this.dz + Math.cos(f) * f1;
      this.dx = d.x;
      this.dy = 0.27;
      this.dz = d.z;
    } else if (this.rollCounter !== 7 && this.rollCounter !== 14 && this.rollCounter !== 21 && this.rollCounter !== 28) {
      this.dx = d.x;
      this.dz = d.z;
    } else {
      this.dx = 0;
      if (this.onGround) this.dy = 0.27;
      this.dz = 0;
    }
  }

  /**
   * vanilla afterSneeze: the sneeze (its cloud ahead of its nose, its sound), every grown panda within 10 on the
   * ground and free to jumps, and one time in 700 a slimeball comes out
   */
  private afterSneeze(): void {
    const w = (this.width + 1) * 0.5, br = this.bodyYaw * DEG;
    this.level.particles.spawn?.('sneeze', this.x - w * Math.sin(br), this.y + this.eyeHeight - 0.1, this.z + w * Math.cos(br), this.dx, 0, this.dz);
    this.playSound('entity.panda.sneeze', 1, 1);
    for (const e of this.level.getEntities(this.bb.inflate(10), (o) => o instanceof Panda)) {
      const p = e as Panda;
      if (!p.isBaby() && p.onGround && !p.inWater && p.canPerformAction()) p.jumpFromGround();
    }
    if (this.random.nextInt(700) === 0 && this.level.gameRules.doMobLoot) this.spawnAtLocation(ItemStack.of('slime_ball'));
  }

  /** vanilla pickUpItem: bamboo or cake (the whole stack) into its empty paws, kept, and dropped for sure */
  protected override pickUpItem(it: ItemEntity): void {
    if (this.mainHand || !pandaItem(it)) return;
    this.onItemPickup(it);
    const s = it.stack;
    this.setItemSlot('mainhand', s);
    this.setGuaranteedDrop('mainhand');
    this.take(it, s.count);
    it.remove();
  }

  /** vanilla hurt: it gets up */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    this.sit(false);
    return super.hurt(amount, source, attacker, direct);
  }

  /** vanilla doHurtTarget: all but an aggressive panda call it off after one bite (PandaHurtByTargetGoal); playAttackSound */
  override doHurtTarget(target: Entity): boolean {
    if (!this.isAggressive()) this.didBite = true;
    const ok = super.doHurtTarget(target);
    if (ok) this.playSound('entity.panda.bite', 1, 1);
    return ok;
  }

  /**
   * vanilla mobInteract: nothing while it cowers; on its back, it gets up; bamboo grows a cub up a tenth of the way,
   * puts a grown one in love, or (in love already, or on its breeding cooldown) sits it down to eat it, the one piece
   * given (what it had is dropped for a player not in creative)
   */
  override interact(p: Player, stack: ItemStack | null): boolean {
    if (this.isScared()) return false;
    if (this.onBack) {
      this.setOnBack(false);
      return true;
    }
    if (!stack || !this.isFood(stack)) return false;
    if (this.target) this.gotBamboo = true;
    if (this.isBaby()) {
      this.usePlayerItem(p);
      this.ageUp(Math.trunc(Math.trunc(-this.age / 20) * 0.1), true);
    } else if (this.age === 0 && this.canFallInLove()) {
      this.usePlayerItem(p);
      this.setInLove(p);
    } else {
      if (this.sitting || this.inWater) return false;
      this.tryToSit();
      this.eat(true);
      const held = this.mainHand;
      if (held && p.gameMode !== 'creative') this.spawnAtLocation(held);
      this.setItemSlot('mainhand', new ItemStack(stack.item, 1));
      this.usePlayerItem(p);
    }
    return true;
  }

  // --- sounds and loot ---------------------------------------------------------------------------------------

  override ambientSound(): string {
    if (this.isAggressive()) return 'entity.panda.aggressive_ambient';
    return this.isWorried() ? 'entity.panda.worried_ambient' : 'entity.panda.ambient';
  }
  override hurtSound(): string {
    return 'entity.panda.hurt';
  }
  override deathSound(): string {
    return 'entity.panda.death';
  }
  protected override playStepSound(): void {
    this.playSound('entity.panda.step', 0.15, 1);
  }

  /** vanilla loot table entities/panda: one bamboo */
  override lootTable(): LootEntry[] {
    return [{ item: 'bamboo', min: 1, max: 1, noLooting: true }];
  }
  /** vanilla LivingEntity.shouldDropLoot: a cub drops nothing (neither its loot nor what it holds) */
  protected override dropLoot(byPlayer: boolean, looting = 0): void {
    if (!this.isBaby()) super.dropLoot(byPlayer, looting);
  }
  protected override dropCustomDeathLoot(attacker: Entity | null, recentlyHit: boolean, looting: number): void {
    if (!this.isBaby()) super.dropCustomDeathLoot(attacker, recentlyHit, looting);
  }
  /** vanilla LivingEntity.shouldDropExperience: nor any experience */
  override experienceReward(): number {
    return this.isBaby() ? 0 : super.experienceReward();
  }

  // --- saving ------------------------------------------------------------------------------------------------

  /**
   * vanilla addAdditionalSaveData: MainGene and HiddenGene; and its max health and speed (vanilla keeps them with its
   * attributes, as the horse's are here), which /summon with genes alone leaves as they were, as vanilla does
   */
  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), MainGene: this.mainGene, HiddenGene: this.hiddenGene, MaxHealth: this.baseMaxHealth, Speed: this.baseMoveSpeed };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.mainGene = geneByName(String(d.MainGene ?? ''));
    this.hiddenGene = geneByName(String(d.HiddenGene ?? ''));
    // (vanilla onAttributeUpdated: no more health than its most)
    if (d.MaxHealth !== undefined && Number(d.MaxHealth) > 0) this.health = Math.min(this.health, (this.maxHealth = Number(d.MaxHealth)));
    if (d.Speed !== undefined && Number(d.Speed) >= 0) this.moveSpeedAttr = Number(d.Speed);
  }
}

// ---------------------------------------------------------------------------
// its controls and goals

/** vanilla PandaMoveControl: it only moves while it's free to (canPerformAction) */
class PandaMoveControl extends MoveControl {
  constructor(readonly panda: Panda) {
    super(panda);
  }
  override tick(): void {
    if (this.panda.canPerformAction()) super.tick();
  }
}

/** vanilla PandaPanicGoal: it runs only from what the world does to it (#panic_environmental_causes), never sitting */
class PandaPanicGoal extends PanicGoal {
  constructor(readonly panda: Panda, speed: number) {
    super(panda, speed);
  }
  protected override shouldPanic(): boolean {
    const s = this.panda.recentDamageSource();
    return s !== null && ENVIRONMENTAL.has(s);
  }
  override canContinueToUse(): boolean {
    if (this.panda.isSitting()) {
      this.panda.navigation.stop();
      return false;
    }
    return super.canContinueToUse();
  }
}

/**
 * vanilla PandaBreedGoal: in love, with a partner about, it breeds only with bamboo growing near it; with none, it
 * sulks for 32 ticks (unhappyCounter) looking at the nearest player within 8, and won't again for 30 seconds
 */
class PandaBreedGoal extends BreedGoal {
  private unhappyCooldown = 0;
  constructor(readonly panda: Panda, speed: number) {
    super(panda, speed);
  }
  override canUse(): boolean {
    const p = this.panda;
    if (!super.canUse() || p.unhappyCounter !== 0) return false;
    if (this.canFindBamboo()) return true;
    if (this.unhappyCooldown <= p.tickCount) {
      p.unhappyCounter = 32;
      this.unhappyCooldown = p.tickCount + 600;
      // (vanilla BREED_TARGETING: forNonCombat().range(8))
      const pl = p.level.nearestPlayer(p.x, p.y, p.z, 8, (o) => o.isAlive && o.gameMode !== 'spectator');
      p.lookAtPlayerGoal?.setTarget(pl);
    }
    return false;
  }
  /**
   * vanilla canFindBamboo: a bamboo stalk in the three layers from its feet up, within 7 across, looked for in rings
   * from the middle out
   */
  private canFindBamboo(): boolean {
    const p = this.panda, w = p.level.world;
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 8; j++)
        for (let k = 0; k <= j; k = k > 0 ? -k : 1 - k)
          for (let l = k < j && k > -j ? j : 0; l <= j; l = l > 0 ? -l : 1 - l)
            if (BLOCKS[STATE_BLOCK[w.getState(bx + k, by + i, bz + l)]].name === 'bamboo') return true;
    return false;
  }
}

/** vanilla PandaAttackGoal: it fights only when it's free to (canPerformAction) */
class PandaAttackGoal extends MeleeAttackGoal {
  constructor(readonly panda: Panda, speed: number, followEvenIfNotSeen: boolean) {
    super(panda, speed, followEvenIfNotSeen);
  }
  override canUse(): boolean {
    return this.panda.canPerformAction() && super.canUse();
  }
}

/** vanilla PandaAvoidGoal: only a worried panda, free to, keeps away */
class PandaAvoidGoal extends AvoidEntityGoal {
  constructor(readonly panda: Panda, avoid: (e: LivingEntity) => boolean, maxDist: number, walk: number, sprint: number) {
    super(panda, avoid, maxDist, walk, sprint);
  }
  override canUse(): boolean {
    return this.panda.isWorried() && this.panda.canPerformAction() && super.canUse();
  }
}

/**
 * vanilla PandaSitGoal: a grown panda out of the water, free and not sulking, with bamboo or cake lying within 6 (or
 * something in its paws) goes to the nearest within 8 for it, or sits with what it has; it gets up after a while
 * (one tick in 300, or 1000 for a lazy one, on average) dropping what's left, and won't again for 10 to 160 seconds
 * (a lazy one 10 to 60)
 */
class PandaSitGoal extends Goal {
  private cooldown = 0;
  constructor(readonly panda: Panda) {
    super();
    this.flags = Flag.MOVE;
  }
  private itemsWithin(r: number): ItemEntity[] {
    return this.panda.level.getEntities(this.panda.bb.inflate(r), pandaItem) as ItemEntity[];
  }
  canUse(): boolean {
    const p = this.panda;
    if (this.cooldown > p.tickCount || p.isBaby() || p.inWater || !p.canPerformAction() || p.unhappyCounter > 0) return false;
    return this.itemsWithin(6).length > 0 || p.mainHand !== null;
  }
  override canContinueToUse(): boolean {
    const p = this.panda;
    if (p.inWater || (!p.isLazy() && p.random.nextInt(reducedTickDelay(600)) === 1)) return false;
    return p.random.nextInt(reducedTickDelay(2000)) !== 1;
  }
  override tick(): void {
    const p = this.panda;
    if (!p.isSitting() && p.mainHand) p.tryToSit();
  }
  override start(): void {
    const p = this.panda;
    const items = this.itemsWithin(8);
    if (items.length && !p.mainHand) p.navigation.moveToEntity(items[0], 1.2);
    else if (p.mainHand) p.tryToSit();
    this.cooldown = 0;
  }
  override stop(): void {
    const p = this.panda;
    const s = p.mainHand;
    if (s) {
      p.spawnAtLocation(s);
      p.setItemSlot('mainhand', null);
      const i = p.isLazy() ? p.random.nextInt(50) + 10 : p.random.nextInt(150) + 10;
      this.cooldown = p.tickCount + i * 20;
    }
    p.sit(false);
  }
}

/** vanilla PandaLieOnBackGoal: a lazy panda, free to, now and then lies on its back a while (and not again for 10 s) */
class PandaLieOnBackGoal extends Goal {
  private cooldown = 0;
  constructor(readonly panda: Panda) {
    super();
  }
  canUse(): boolean {
    const p = this.panda;
    return this.cooldown < p.tickCount && p.isLazy() && p.canPerformAction() && p.random.nextInt(reducedTickDelay(400)) === 1;
  }
  override canContinueToUse(): boolean {
    const p = this.panda;
    if (p.inWater || (!p.isLazy() && p.random.nextInt(reducedTickDelay(600)) === 1)) return false;
    return p.random.nextInt(reducedTickDelay(2000)) !== 1;
  }
  override start(): void {
    this.panda.setOnBack(true);
    this.cooldown = 0;
  }
  override stop(): void {
    this.panda.setOnBack(false);
    this.cooldown = this.panda.tickCount + 200;
  }
}

/** vanilla PandaSneezeGoal: a cub, free to, sneezes one tick in 3000 on average (a weak one's in 250) */
class PandaSneezeGoal extends Goal {
  constructor(readonly panda: Panda) {
    super();
  }
  canUse(): boolean {
    const p = this.panda;
    if (!p.isBaby() || !p.canPerformAction()) return false;
    if (p.isWeak() && p.random.nextInt(reducedTickDelay(500)) === 1) return true;
    return p.random.nextInt(reducedTickDelay(6000)) === 1;
  }
  override canContinueToUse(): boolean {
    return false;
  }
  override start(): void {
    this.panda.sneeze(true);
  }
}

/**
 * vanilla PandaLookAtPlayerGoal: looks at the nearest player within 6 when free to, or at the player the breeding goal
 * gave it
 */
class PandaLookAtPlayerGoal extends LookAtPlayerGoal {
  constructor(readonly panda: Panda, lookDistance: number) {
    super(panda, lookDistance);
  }
  setTarget(e: LivingEntity | null): void {
    this.lookAt = e;
  }
  override canUse(): boolean {
    const p = this.panda;
    if (p.random.nextFloat() >= this.probability) return false;
    if (!this.lookAt) this.lookAt = this.findLookAt();
    return p.canPerformAction() && this.lookAt !== null;
  }
  override canContinueToUse(): boolean {
    return this.lookAt !== null && super.canContinueToUse();
  }
  override tick(): void {
    if (this.lookAt) super.tick();
  }
}

/**
 * vanilla PandaRollGoal: a cub or a playful panda, on the ground and free to, rolls over when the ground ahead falls
 * away, and otherwise now and then (a playful one one tick in 30, the rest one in 250)
 */
class PandaRollGoal extends Goal {
  constructor(readonly panda: Panda) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK | Flag.JUMP;
  }
  canUse(): boolean {
    const p = this.panda;
    if (!(p.isBaby() || p.isPlayful()) || !p.onGround || !p.canPerformAction()) return false;
    const f = p.yaw * DEG, f1 = -Math.sin(f), f2 = Math.cos(f);
    const i = Math.abs(f1) > 0.5 ? Math.sign(f1) : 0, j = Math.abs(f2) > 0.5 ? Math.sign(f2) : 0;
    if (FLAGS[p.level.world.getState(Math.floor(p.x) + i, Math.floor(p.y) - 1, Math.floor(p.z) + j)] & F_AIR) return true;
    if (p.isPlayful() && p.random.nextInt(reducedTickDelay(60)) === 1) return true;
    return p.random.nextInt(reducedTickDelay(500)) === 1;
  }
  override canContinueToUse(): boolean {
    return false;
  }
  override start(): void {
    this.panda.roll(true);
  }
  override isInterruptable(): boolean {
    return false;
  }
}

/**
 * vanilla PandaHurtByTargetGoal: it fights back, and every panda about is told; only an aggressive one joins in. A
 * bite, or being given bamboo, calls it off (the aggressive one's bites don't)
 */
class PandaHurtByTargetGoal extends HurtByTargetGoal {
  constructor(readonly panda: Panda) {
    super(panda);
  }
  override canContinueToUse(): boolean {
    const p = this.panda;
    if (!p.gotBamboo && !p.didBite) return super.canContinueToUse();
    p.setTarget(null);
    return false;
  }
  protected override alertOther(o: Panda, target: LivingEntity): void {
    if (o instanceof Panda && o.isAggressive()) o.setTarget(target);
  }
}
