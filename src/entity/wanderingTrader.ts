// The wandering trader (vanilla 1.21 WanderingTrader, an AbstractVillager). Every few days one turns up near the
// player (at the village bell, if one is within 48 blocks) leading two trader llamas, wanders about the place and is
// gone again some forty minutes later (game/wanderingTraderSpawner.ts). He sells five things drawn from a long list
// of plants, flowers, dyes, coral, sand and the like, and one rarer one; he has no levels, and what he sells never
// restocks. At nightfall he drinks a potion of invisibility, at daybreak a bucket of milk to be seen again. Zombies
// and illagers are after him, and he runs from them.

import { AgeableMob } from './animals';
import type { Level } from '../game/level';
import { Mob, type MobCategory, type SpawnGroup, type SpawnReason } from './mob';
import type { LivingEntity } from './living';
import type { Entity } from './entity';
import type { Player } from './player';
import { ItemStack } from '../item/item';
import { Goal, Flag } from './ai/goal';
import { AvoidEntityGoal, FloatGoal, LookAtPlayerGoal, MoveTowardsRestrictionGoal, PanicGoal, WaterAvoidingRandomStrollGoal } from './ai/goals';
import { MerchantOffer, WANDERING_TRADER_TRADES, addOffersFromListings, type Merchant, type SavedOffer } from './trading';
import { Zombie } from './monsters';
import { contentsOf, potionEffects, potionStack } from '../item/potions';

type Pos = [number, number, number];

/** vanilla PotionItem / MilkBucketItem.getUseDuration: 32 ticks to drink */
const DRINK_TICKS = 32;

export class WanderingTrader extends AgeableMob implements Merchant {
  readonly type = 'wandering_trader';
  readonly category: MobCategory = 'creature';
  protected readonly adultWidth = 0.6;
  protected readonly adultHeight = 1.95;
  /** (vanilla: a wandering trader's level is always 1, and his menu shows none) */
  merchantLevel = 1;
  xp = 0;
  tradingPlayer: Player | null = null;
  private offers: MerchantOffer[] | null = null;
  /** vanilla despawnDelay: the ticks left before he goes (0: he stays, as one from a spawn egg does) */
  despawnDelay = 0;
  /** vanilla wanderTarget: where he's making for (the bell he came to, or where the player was) */
  wanderTarget: Pos | null = null;
  /** vanilla useItemRemaining: the ticks left drinking what's in his hand */
  private useItemRemaining = 0;

  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 1.95);
    // vanilla DefaultAttributes: Mob.createMobAttributes (20 health, the default speed of 0.7)
    this.maxHealth = this.health = 20;
    this.moveSpeedAttr = 0.7;
  }

  protected registerGoals(): void {
    const g = this.goalSelector;
    g.addGoal(0, new FloatGoal(this));
    g.addGoal(0, new UseItemGoal(this, () => potionStack('potion', 'invisibility'), 'entity.wandering_trader.disappeared', (t) => isNight(t.level) && !t.isInvisible()));
    g.addGoal(0, new UseItemGoal(this, () => ItemStack.of('milk_bucket', 1), 'entity.wandering_trader.reappeared', (t) => t.level.isDay() && t.isInvisible()));
    g.addGoal(1, new TradeWithPlayerGoal(this));
    const avoid = (d: number, is: (e: LivingEntity) => boolean) => g.addGoal(1, new AvoidEntityGoal(this, is, d, 0.5, 0.5));
    avoid(8, (e) => e instanceof Zombie);
    avoid(12, (e) => e.type === 'evoker');
    avoid(8, (e) => e.type === 'vindicator');
    avoid(8, (e) => e.type === 'vex');
    avoid(15, (e) => e.type === 'pillager');
    avoid(12, (e) => e.type === 'illusioner');
    avoid(10, (e) => e.type === 'zoglin');
    g.addGoal(1, new PanicGoal(this, 0.5));
    g.addGoal(1, new LookAtTradingPlayerGoal(this));
    g.addGoal(2, new WanderToPositionGoal(this, 2.0, 0.35));
    g.addGoal(4, new MoveTowardsRestrictionGoal(this, 0.35));
    g.addGoal(8, new WaterAvoidingRandomStrollGoal(this, 0.35));
    g.addGoal(9, new InteractGoal(this));
    g.addGoal(10, new LookAtMobGoal(this, 8));
  }

  /** vanilla AbstractVillager.canBeLeashed: never on a lead (his llamas are on his) */
  override canBeLeashed(): boolean {
    return false;
  }

  /** vanilla AbstractVillager.finalizeSpawn: AgeableMobGroupData(false), so never a baby */
  override finalizeSpawn(reason: SpawnReason, group?: SpawnGroup): void {
    const g = group ?? {};
    g.ageable ??= { size: 0, babyChance: 0 };
    super.finalizeSpawn(reason, g);
  }

  /** vanilla removeWhenFarAway: he goes when his time is up, not before */
  override removeWhenFarAway(): boolean {
    return false;
  }

  override get eyeHeight(): number {
    return 1.62;
  }

  // --- trading (vanilla AbstractVillager and WanderingTrader as a Merchant) -----------------------------------

  isTrading(): boolean {
    return this.tradingPlayer !== null;
  }

  getOffers(): MerchantOffer[] {
    if (!this.offers) {
      this.offers = [];
      this.updateTrades();
    }
    return this.offers;
  }

  /** vanilla WanderingTrader.updateTrades: five from the first list, and one from the second if it can be made */
  private updateTrades(): void {
    const offers = this.getOffers();
    addOffersFromListings(offers, WANDERING_TRADER_TRADES[0], 5, this);
    const rare = WANDERING_TRADER_TRADES[1];
    const o = rare[this.random.nextInt(rare.length)](this);
    if (o) offers.push(o);
  }

  /** vanilla WanderingTrader.mobInteract; true when the click did something */
  interact(p: Player, stack: ItemStack | null): boolean {
    if (stack?.item.id === 'villager_spawn_egg' || !this.isAlive || this.isTrading() || this.isBaby()) return false;
    if (this.getOffers().length === 0) return true;
    this.tradingPlayer = p;
    this.level.onOpenMerchant?.(this, p);
    return true;
  }

  stopTrading(): void {
    this.tradingPlayer = null;
  }

  notifyTrade(o: MerchantOffer): void {
    o.uses++;
    this.ambientSoundTime = -this.ambientSoundInterval();
    this.rewardTradeXp(o);
  }

  /** vanilla WanderingTrader.rewardTradeXp: 3-6 experience for the player (he has none of his own to gain) */
  private rewardTradeXp(o: MerchantOffer): void {
    if (o.rewardExp) this.level.awardExperience(this.x, this.y + 0.5, this.z, 3 + this.random.nextInt(4));
  }

  notifyTradeUpdated(s: ItemStack | null): void {
    if (this.ambientSoundTime > -this.ambientSoundInterval() + 20) {
      this.ambientSoundTime = -this.ambientSoundInterval();
      this.playSound(s && !s.isEmpty() ? 'entity.wandering_trader.yes' : 'entity.wandering_trader.no', this.soundVolume(), this.voicePitch());
    }
  }

  showProgressBar(): boolean {
    return false;
  }

  canRestock(): boolean {
    return false;
  }

  override die(source: string, attacker: Entity | null = null): void {
    super.die(source, attacker);
    this.stopTrading();
  }

  // --- drinking (vanilla LivingEntity.startUsingItem / updateUsingItem / completeUsingItem, for his potion and milk) ---

  override startUsingItem(): void {
    super.startUsingItem();
    this.useItemRemaining = DRINK_TICKS;
  }

  override stopUsingItem(): void {
    super.stopUsingItem();
    this.useItemRemaining = 0;
  }

  /** vanilla updateUsingItem: a gulp every fourth tick once the first seven are past; drunk at the last */
  private updateUsingItem(): void {
    if (!this.usingItem) return;
    const s = this.mainHand;
    if (!s) return this.stopUsingItem();
    if (DRINK_TICKS - this.useItemRemaining > Math.floor(DRINK_TICKS * 0.21875) && this.useItemRemaining % 4 === 0) this.drinkSound(s);
    if (--this.useItemRemaining === 0) {
      this.drinkSound(s);
      // vanilla PotionItem.finishUsingItem (the potion's effects; a mob's bottle isn't used up) / MilkBucketItem's
      if (s.item.id === 'milk_bucket') this.removeAllEffects();
      else for (const e of potionEffects(contentsOf(s)?.potion)) this.addEffect(e);
      this.stopUsingItem();
    }
  }

  /** vanilla triggerItemUseEffects for a drink, with getDrinkingSound */
  private drinkSound(s: ItemStack): void {
    this.playSound(s.item.id === 'milk_bucket' ? 'entity.wandering_trader.drink_milk' : 'entity.wandering_trader.drink_potion', 0.5, this.random.nextFloat() * 0.1 + 0.9);
  }

  override aiStep(): void {
    // (vanilla LivingEntity.tick: the item in use before the rest of the tick)
    this.updateUsingItem();
    super.aiStep();
    if (this.isAlive) this.maybeDespawn();
  }

  /** vanilla maybeDespawn: counting down, not while he's trading; at nought he's gone */
  private maybeDespawn(): void {
    if (this.despawnDelay > 0 && !this.isTrading() && --this.despawnDelay === 0) this.remove();
  }

  /** vanilla AbstractVillager.getRopeHoldPosition: his llamas' leads are held in his folded arms */
  override ropeHoldPosition(p: number): [number, number, number] {
    const f = ((this.bodyYawO + (this.bodyYaw - this.bodyYawO) * p) * Math.PI) / 180;
    return [this.lerpX(p) - 0.2 * Math.sin(f), this.lerpY(p) + this.height - 1, this.lerpZ(p) + 0.2 * Math.cos(f)];
  }

  // --- sounds -----------------------------------------------------------------

  override ambientSound(): string | null {
    return this.isTrading() ? 'entity.wandering_trader.trade' : 'entity.wandering_trader.ambient';
  }

  override hurtSound(): string {
    return 'entity.wandering_trader.hurt';
  }

  override deathSound(): string {
    return 'entity.wandering_trader.death';
  }

  // --- saving -----------------------------------------------------------------

  protected override saveData(): Record<string, number | string | boolean> {
    const d: Record<string, number | string | boolean> = { ...super.saveData(), DespawnDelay: this.despawnDelay };
    if (this.wanderTarget) d.WanderTarget = this.wanderTarget.join(',');
    if (this.offers) d.offers = JSON.stringify(this.offers.map((o) => o.save()));
    return d;
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    if (d.DespawnDelay !== undefined) this.despawnDelay = Number(d.DespawnDelay);
    if (typeof d.WanderTarget === 'string') {
      const p = d.WanderTarget.split(',').map(Number);
      if (p.length === 3 && p.every(Number.isFinite)) this.wanderTarget = p as Pos;
    }
    if (typeof d.offers === 'string') this.offers = (JSON.parse(d.offers) as SavedOffer[]).map((o) => MerchantOffer.load(o)).filter((o): o is MerchantOffer => !!o);
    // (vanilla: never a baby, whatever was saved)
    this.setAge(Math.max(0, this.age));
  }
}

/** vanilla Level.isNight: a dimension with its own days, and the sky dark */
function isNight(level: Level): boolean {
  return level.world.dim.fixedTime === null && !level.isDay();
}

// ---------------------------------------------------------------------------
// goals

/**
 * vanilla UseItemGoal: when `when` says so, he takes out `item` and drinks it; as he puts the empty hand down, the
 * sound `sound` (no flags: it goes on whatever else he's doing)
 */
class UseItemGoal extends Goal {
  constructor(readonly t: WanderingTrader, readonly item: () => ItemStack, readonly sound: string, readonly when: (t: WanderingTrader) => boolean) {
    super();
  }
  canUse(): boolean {
    return this.when(this.t);
  }
  override canContinueToUse(): boolean {
    return this.t.usingItem;
  }
  override start(): void {
    this.t.setItemSlot('mainhand', this.item());
    this.t.startUsingItem();
  }
  override stop(): void {
    this.t.setItemSlot('mainhand', null);
    this.t.playSound(this.sound, 1, this.t.random.nextFloat() * 0.2 + 0.9);
  }
}

/** vanilla TradeWithPlayerGoal: he stands still for whoever's trading with him, while they're within 4 blocks */
class TradeWithPlayerGoal extends Goal {
  constructor(readonly t: WanderingTrader) {
    super();
    this.flags = Flag.JUMP | Flag.MOVE;
  }
  canUse(): boolean {
    const t = this.t, p = t.tradingPlayer;
    if (!t.isAlive || t.inWater || !t.onGround || !p) return false;
    return t.distanceToSqr(p.x, p.y, p.z) <= 16;
  }
  override start(): void {
    this.t.navigation.stop();
  }
  /** (and so the trading's over: the menu sees he's stopped) */
  override stop(): void {
    this.t.tradingPlayer = null;
  }
}

/** vanilla LookAtTradingPlayerGoal: eyes on whoever he's trading with */
class LookAtTradingPlayerGoal extends LookAtPlayerGoal {
  constructor(readonly t: WanderingTrader) {
    super(t, 8);
  }
  override canUse(): boolean {
    if (!this.t.isTrading()) return false;
    this.lookAt = this.t.tradingPlayer;
    return true;
  }
}

/** vanilla InteractGoal(Player, 3, 1): a look at a player who comes within 3 blocks (a MOVE goal too) */
class InteractGoal extends LookAtPlayerGoal {
  constructor(t: WanderingTrader) {
    super(t, 3, 1);
    this.flags = Flag.LOOK | Flag.MOVE;
  }
}

/** vanilla LookAtPlayerGoal(Mob.class, 8): now and then a look at another mob nearby (his llamas, as often as not) */
class LookAtMobGoal extends LookAtPlayerGoal {
  protected override findLookAt(): LivingEntity | null {
    const m = this.mob, r = this.lookDistance;
    let best: LivingEntity | null = null, bd = Infinity;
    for (const e of m.level.getEntities(m.bb.inflate(r, 3, r), (e) => e instanceof Mob && e !== m && e.isAlive)) {
      const d = e.distanceToSqr(m.x, m.y + m.eyeHeight, m.z);
      if (d < bd && d <= r * r && m.sensing.hasLineOfSight(e)) {
        bd = d;
        best = e as LivingEntity;
      }
    }
    return best;
  }
}

/**
 * vanilla WanderingTrader.WanderToPositionGoal: off toward his wander target (ten blocks at a time while it's more
 * than ten away) until he's within `stopDistance` of it; then, or if anything else takes over, he forgets it
 */
class WanderToPositionGoal extends Goal {
  constructor(readonly t: WanderingTrader, readonly stopDistance: number, readonly speed: number) {
    super();
    this.flags = Flag.MOVE;
  }
  canUse(): boolean {
    const p = this.t.wanderTarget;
    return p !== null && this.tooFar(p, this.stopDistance);
  }
  override stop(): void {
    this.t.wanderTarget = null;
    this.t.navigation.stop();
  }
  override tick(): void {
    const t = this.t, p = t.wanderTarget;
    if (!p || !t.navigation.isDone()) return;
    if (this.tooFar(p, 10)) {
      const dx = p[0] - t.x, dy = p[1] - t.y, dz = p[2] - t.z;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // (vanilla Vec3.normalize: a vector too short to have a direction stays nought)
      const k = l < 1e-4 ? 0 : 10 / l;
      t.navigation.moveTo(t.x + dx * k, t.y + dy * k, t.z + dz * k, this.speed);
    } else t.navigation.moveTo(p[0], p[1], p[2], this.speed);
  }
  /** vanilla !BlockPos.closerToCenterThan: the block's middle is `d` or more away */
  private tooFar(p: Pos, d: number): boolean {
    const t = this.t;
    return (p[0] + 0.5 - t.x) ** 2 + (p[1] + 0.5 - t.y) ** 2 + (p[2] + 0.5 - t.z) ** 2 >= d * d;
  }
}
