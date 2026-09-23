// Passive animals (vanilla AgeableMob / Animal / Pig / Cow / Sheep / Chicken)
// with their goals: tempting, breeding, following parents, eating grass.

import { Mob, LootEntry, MobCategory } from './mob';
import type { Level } from '../game/level';
import { Goal, Flag, reducedTickDelay } from './ai/goal';
import { FloatGoal, PanicGoal, WaterAvoidingRandomStrollGoal, LookAtPlayerGoal, RandomLookAroundGoal } from './ai/goals';
import { PathType } from './ai/pathfinder';
import type { Player } from './player';
import { ItemStack, ITEMS } from '../item/item';
import { BLOCKS, STATE_BLOCK, S } from '../world/block';
import type { Entity } from './entity';

// ---------------------------------------------------------------------------

export abstract class Animal extends Mob {
  readonly category: MobCategory = 'creature';
  /** vanilla AgeableMob age: <0 baby (grows to 0), >0 breeding cooldown */
  age = 0;
  inLove = 0;
  loveCause: Player | null = null;
  protected abstract adultWidth: number;
  protected abstract adultHeight: number;

  override isBaby(): boolean {
    return this.age < 0;
  }

  setAge(a: number): void {
    const wasBaby = this.isBaby();
    this.age = a;
    if (wasBaby !== this.isBaby() || this.width === 0.6) this.refreshSize();
  }

  refreshSize(): void {
    const s = this.isBaby() ? 0.5 : 1;
    this.setSize(this.adultWidth * s, this.adultHeight * s);
  }

  /** vanilla AgeableMob.ageUp (feeding babies) */
  ageUp(seconds: number, forced: boolean): void {
    let i = this.age;
    i += seconds * 20;
    if (i > 0) i = 0;
    this.setAge(i);
    if (forced) this.level.particles.spawn?.('happy_villager', this.x, this.y + this.height / 2, this.z, 0, 0, 0);
  }

  override aiStep(): void {
    super.aiStep();
    if (this.isAlive) {
      if (this.age < 0) this.setAge(this.age + 1);
      else if (this.age > 0) this.setAge(this.age - 1);
    }
    if (this.age !== 0) this.inLove = 0;
    if (this.inLove > 0) {
      this.inLove--;
      if (this.inLove % 10 === 0) {
        const r = this.random;
        this.level.particles.spawn?.('heart', this.x + (r.nextFloat() * 2 - 1) * this.width, this.y + 0.5 + r.nextFloat() * this.height, this.z + (r.nextFloat() * 2 - 1) * this.width, r.gaussian() * 0.02, r.gaussian() * 0.02, r.gaussian() * 0.02);
      }
    }
  }

  protected override customServerAiStep(): void {
    if (this.age !== 0) this.inLove = 0;
  }

  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    const ok = super.hurt(amount, source, attacker, direct);
    if (ok) this.inLove = 0;
    return ok;
  }

  /** vanilla Animal.getWalkTargetValue: grass is best, otherwise brighter is better */
  override walkTargetValue(x: number, y: number, z: number): number {
    const below = BLOCKS[STATE_BLOCK[this.level.world.getState(x, y - 1, z)]].name;
    if (below === 'grass_block') return 10;
    return this.level.brightness(x, y, z) - 0.5;
  }

  override removeWhenFarAway(): boolean {
    return false;
  }

  override ambientSoundInterval(): number {
    return 120;
  }

  override experienceReward(): number {
    return 1 + this.random.nextInt(3);
  }

  abstract isFood(s: ItemStack): boolean;

  canFallInLove(): boolean {
    return this.inLove <= 0;
  }

  setInLove(p: Player | null): void {
    this.inLove = 600;
    this.loveCause = p;
    // entity event 18: 7 hearts
    for (let i = 0; i < 7; i++) {
      const r = this.random;
      this.level.particles.spawn?.('heart', this.x + (r.nextFloat() * 2 - 1) * this.width, this.y + 0.5 + r.nextFloat() * this.height, this.z + (r.nextFloat() * 2 - 1) * this.width, r.gaussian() * 0.02, r.gaussian() * 0.02, r.gaussian() * 0.02);
    }
  }

  isInLove(): boolean {
    return this.inLove > 0;
  }

  canMate(o: Animal): boolean {
    return o !== this && o.type === this.type && this.isInLove() && o.isInLove();
  }

  /** vanilla Animal.mobInteract (feeding); returns true if the click was consumed */
  interact(p: Player, stack: ItemStack | null): boolean {
    if (!stack || !this.isFood(stack)) return false;
    const i = this.age;
    if (i === 0 && this.canFallInLove()) {
      this.usePlayerItem(p);
      this.setInLove(p);
      this.playEatSound();
      return true;
    }
    if (this.isBaby()) {
      this.usePlayerItem(p);
      this.ageUp(Math.floor((-i / 20) * 0.1), true);
      this.playEatSound();
      return true;
    }
    return false;
  }

  protected playEatSound(): void {}

  protected usePlayerItem(p: Player): void {
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
  }

  abstract makeBaby(): Animal;

  /** vanilla Animal.spawnChildFromBreeding */
  spawnChildFromBreeding(partner: Animal): void {
    const baby = this.makeBaby();
    baby.setAge(-24000);
    baby.moveTo(this.x, this.y, this.z, 0, 0);
    this.level.addEntity(baby);
    this.setAge(6000);
    partner.setAge(6000);
    this.inLove = 0;
    partner.inLove = 0;
    const cause = this.loveCause ?? partner.loveCause;
    if (cause && this.level.gameRules.doMobLoot) this.level.awardExperience(this.x, this.y, this.z, this.random.nextInt(7) + 1);
  }

  protected override saveData(): Record<string, number | string | boolean> {
    return { age: this.age, inLove: this.inLove };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    this.setAge(Number(d.age ?? 0));
    this.inLove = Number(d.inLove ?? 0);
  }

  /** vanilla Animal.checkAnimalSpawnRules */
  checkAnimalSpawn(x: number, y: number, z: number): boolean {
    const below = BLOCKS[STATE_BLOCK[this.level.world.getState(x, y - 1, z)]].name;
    return below === 'grass_block' && this.level.rawBrightness(x, y, z, 0) > 8;
  }
}

// ---------------------------------------------------------------------------
// animal goals

export class TemptGoal extends Goal {
  private player: Player | null = null;
  private calmDown = 0;
  isRunning = false;
  constructor(readonly mob: Animal, readonly speed: number, readonly items: Set<string>) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  private shouldFollow(p: Player): boolean {
    const s = p.inventory.selectedItem, o = p.inventory.offhand;
    return (!!s && this.items.has(s.item.id)) || (!!o && this.items.has(o.item.id));
  }
  canUse(): boolean {
    if (this.calmDown > 0) {
      this.calmDown--;
      return false;
    }
    const p = this.mob.level.player;
    this.player = null;
    if (p && p.isAlive && p.gameMode !== 'spectator' && this.mob.distanceToSqr(p.x, p.y, p.z) <= 100 && this.shouldFollow(p)) this.player = p;
    return this.player !== null;
  }
  override start(): void {
    this.isRunning = true;
  }
  override stop(): void {
    this.player = null;
    this.mob.navigation.stop();
    this.calmDown = reducedTickDelay(100);
    this.isRunning = false;
  }
  override tick(): void {
    const p = this.player!;
    const m = this.mob;
    m.lookControl.setLookAtEntity(p, m.maxHeadYRot() + 20, m.maxHeadXRot());
    if (m.distanceToSqr(p.x, p.y, p.z) < 6.25) m.navigation.stop();
    else m.navigation.moveToEntity(p, this.speed);
  }
}

export class BreedGoal extends Goal {
  private partner: Animal | null = null;
  private loveTime = 0;
  constructor(readonly animal: Animal, readonly speed: number) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK;
  }
  canUse(): boolean {
    if (!this.animal.isInLove()) return false;
    this.partner = this.freePartner();
    return this.partner !== null;
  }
  override canContinueToUse(): boolean {
    const p = this.partner;
    return !!p && p.isAlive && p.isInLove() && this.loveTime < 60 && p.lastHurtByMob === null;
  }
  override stop(): void {
    this.partner = null;
    this.loveTime = 0;
  }
  override tick(): void {
    const a = this.animal, p = this.partner!;
    a.lookControl.setLookAtEntity(p, 10, a.maxHeadXRot());
    a.navigation.moveToEntity(p, this.speed);
    this.loveTime++;
    if (this.loveTime >= this.adjustedTickDelay(60) && a.distanceToSqr(p.x, p.y, p.z) < 9) a.spawnChildFromBreeding(p);
  }
  private freePartner(): Animal | null {
    const a = this.animal;
    let best: Animal | null = null, bd = Infinity;
    for (const e of a.level.getEntities(a.bb.inflate(8))) {
      if (!(e instanceof Animal) || !a.canMate(e) || e.lastHurtByMob) continue;
      const d = a.distanceToSqr(e.x, e.y, e.z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }
}

export class FollowParentGoal extends Goal {
  private parent: Animal | null = null;
  private timeToRecalc = 0;
  constructor(readonly animal: Animal, readonly speed: number) {
    super();
  }
  canUse(): boolean {
    const a = this.animal;
    if (a.age >= 0) return false;
    let best: Animal | null = null, bd = Infinity;
    for (const e of a.level.getEntities(a.bb.inflate(8, 4, 8))) {
      if (!(e instanceof Animal) || e.type !== a.type || e.age < 0) continue;
      const d = a.distanceToSqr(e.x, e.y, e.z);
      if (d <= bd) {
        bd = d;
        best = e;
      }
    }
    if (!best || bd < 9) return false;
    this.parent = best;
    return true;
  }
  override canContinueToUse(): boolean {
    const a = this.animal, p = this.parent;
    if (a.age >= 0 || !p || !p.isAlive) return false;
    const d = a.distanceToSqr(p.x, p.y, p.z);
    return d >= 9 && d <= 256;
  }
  override start(): void {
    this.timeToRecalc = 0;
  }
  override stop(): void {
    this.parent = null;
  }
  override tick(): void {
    if (--this.timeToRecalc <= 0) {
      this.timeToRecalc = this.adjustedTickDelay(10);
      this.animal.navigation.moveToEntity(this.parent!, this.speed);
    }
  }
}

/** vanilla EatBlockGoal (sheep grazing) */
export class EatBlockGoal extends Goal {
  eatAnimationTick = 0;
  constructor(readonly mob: Sheep) {
    super();
    this.flags = Flag.MOVE | Flag.LOOK | Flag.JUMP;
  }
  canUse(): boolean {
    const m = this.mob;
    if (m.random.nextInt(m.isBaby() ? 50 : 1000) !== 0) return false;
    const w = m.level.world;
    const bx = Math.floor(m.x), by = Math.floor(m.y), bz = Math.floor(m.z);
    const here = BLOCKS[STATE_BLOCK[w.getState(bx, by, bz)]].name;
    if (here === 'short_grass') return true;
    return BLOCKS[STATE_BLOCK[w.getState(bx, by - 1, bz)]].name === 'grass_block';
  }
  override start(): void {
    this.eatAnimationTick = this.adjustedTickDelay(40);
    this.mob.eatAnimationTick = 40;
    this.mob.navigation.stop();
  }
  override stop(): void {
    this.eatAnimationTick = 0;
  }
  override canContinueToUse(): boolean {
    return this.eatAnimationTick > 0;
  }
  override tick(): void {
    this.eatAnimationTick = Math.max(0, this.eatAnimationTick - 1);
    if (this.eatAnimationTick !== this.adjustedTickDelay(4)) return;
    const m = this.mob;
    const lvl = m.level;
    const bx = Math.floor(m.x), by = Math.floor(m.y), bz = Math.floor(m.z);
    const hereSt = lvl.world.getState(bx, by, bz);
    if (BLOCKS[STATE_BLOCK[hereSt]].name === 'short_grass') {
      if (lvl.gameRules.mobGriefing) lvl.destroyBlock(bx, by, bz, false);
      m.ate();
      return;
    }
    const belowSt = lvl.world.getState(bx, by - 1, bz);
    if (BLOCKS[STATE_BLOCK[belowSt]].name === 'grass_block') {
      if (lvl.gameRules.mobGriefing) {
        lvl.particles.blockBreak(bx, by - 1, bz, belowSt);
        lvl.sound.play('block.grass.break', bx + 0.5, by - 0.5, bz + 0.5, 1, 0.8);
        lvl.setBlock(bx, by - 1, bz, S('dirt'));
      }
      m.ate();
    }
  }
}

// ---------------------------------------------------------------------------
// species

const PIG_FOOD = new Set(['carrot', 'potato', 'beetroot']);
const WHEAT = new Set(['wheat']);
const SEEDS = new Set(['wheat_seeds', 'melon_seeds', 'pumpkin_seeds', 'beetroot_seeds', 'torchflower_seeds', 'pitcher_pod']);

export class Pig extends Animal {
  readonly type = 'pig';
  protected adultWidth = 0.9;
  protected adultHeight = 0.9;
  constructor(level: Level) {
    super(level);
    this.setSize(0.9, 0.9);
    this.maxHealth = this.health = 10;
    this.moveSpeedAttr = 0.25;
  }
  protected registerGoals(): void {
    this.goalSelector.addGoal(0, new FloatGoal(this));
    this.goalSelector.addGoal(1, new PanicGoal(this, 1.25));
    this.goalSelector.addGoal(3, new BreedGoal(this, 1.0));
    this.goalSelector.addGoal(4, new TemptGoal(this, 1.2, new Set(['carrot_on_a_stick'])));
    this.goalSelector.addGoal(4, new TemptGoal(this, 1.2, PIG_FOOD));
    this.goalSelector.addGoal(5, new FollowParentGoal(this, 1.1));
    this.goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 1.0));
    this.goalSelector.addGoal(7, new LookAtPlayerGoal(this, 6));
    this.goalSelector.addGoal(8, new RandomLookAroundGoal(this));
  }
  override get eyeHeight(): number {
    return this.height * 0.85;
  }
  isFood(s: ItemStack): boolean {
    return PIG_FOOD.has(s.item.id);
  }
  makeBaby(): Animal {
    return new Pig(this.level);
  }
  override ambientSound(): string {
    return 'entity.pig.ambient';
  }
  override hurtSound(): string {
    return 'entity.pig.hurt';
  }
  override deathSound(): string {
    return 'entity.pig.death';
  }
  override stepSound(): string {
    return 'entity.pig.step';
  }
  override lootTable(): LootEntry[] {
    return [{ item: 'porkchop', min: 1, max: 3, cooked: 'cooked_porkchop' }];
  }
}

export class Cow extends Animal {
  readonly type = 'cow';
  protected adultWidth = 0.9;
  protected adultHeight = 1.4;
  constructor(level: Level) {
    super(level);
    this.setSize(0.9, 1.4);
    this.maxHealth = this.health = 10;
    this.moveSpeedAttr = 0.2;
  }
  protected registerGoals(): void {
    this.goalSelector.addGoal(0, new FloatGoal(this));
    this.goalSelector.addGoal(1, new PanicGoal(this, 2.0));
    this.goalSelector.addGoal(2, new BreedGoal(this, 1.0));
    this.goalSelector.addGoal(3, new TemptGoal(this, 1.25, WHEAT));
    this.goalSelector.addGoal(4, new FollowParentGoal(this, 1.25));
    this.goalSelector.addGoal(5, new WaterAvoidingRandomStrollGoal(this, 1.0));
    this.goalSelector.addGoal(6, new LookAtPlayerGoal(this, 6));
    this.goalSelector.addGoal(7, new RandomLookAroundGoal(this));
  }
  isFood(s: ItemStack): boolean {
    return s.item.id === 'wheat';
  }
  makeBaby(): Animal {
    return new Cow(this.level);
  }
  override soundVolume(): number {
    return 0.4;
  }
  override ambientSound(): string {
    return 'entity.cow.ambient';
  }
  override hurtSound(): string {
    return 'entity.cow.hurt';
  }
  override deathSound(): string {
    return 'entity.cow.death';
  }
  override stepSound(): string {
    return 'entity.cow.step';
  }
  override lootTable(): LootEntry[] {
    return [
      { item: 'leather', min: 0, max: 2 },
      { item: 'beef', min: 1, max: 3, cooked: 'cooked_beef' },
    ];
  }
  override interact(p: Player, stack: ItemStack | null): boolean {
    if (stack && stack.item.id === 'bucket' && !this.isBaby()) {
      this.level.sound.play('entity.cow.milk', this.x, this.y, this.z, 1, 1);
      const milk = new ItemStack(ITEMS.get('milk_bucket')!, 1);
      if (p.gameMode === 'creative') {
        if (!p.inventory.main.some((s) => s?.item.id === 'milk_bucket')) p.inventory.add(milk);
      } else if (stack.count === 1) p.inventory.setSelectedItem(milk);
      else {
        p.inventory.consumeSelected(1);
        if (p.inventory.add(milk) > 0) p.dropItem(milk, false);
      }
      return true;
    }
    return super.interact(p, stack);
  }
}

/** vanilla DyeColor diffuse colors, by DyeColor id */
export const DYE_COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
export const DYE_DIFFUSE = [0xf9fffe, 0xf9801d, 0xc74ebd, 0x3ab3da, 0xfed83d, 0x80c71f, 0xf38baa, 0x474f52, 0x9d9d97, 0x169c9c, 0x8932b8, 0x3c44aa, 0x835432, 0x5e7c16, 0xb02e26, 0x1d1d21];

/** vanilla Sheep fur color: white is 0xE6E6E6, others are the dye color × 0.75 */
export function sheepFurColor(c: number): [number, number, number] {
  if (c === 0) return [230 / 255, 230 / 255, 230 / 255];
  const d = DYE_DIFFUSE[c];
  return [(Math.floor(((d >> 16) & 255) * 0.75)) / 255, (Math.floor(((d >> 8) & 255) * 0.75)) / 255, (Math.floor((d & 255) * 0.75)) / 255];
}

export class Sheep extends Animal {
  readonly type = 'sheep';
  protected adultWidth = 0.9;
  protected adultHeight = 1.3;
  color = 0;
  sheared = false;
  eatAnimationTick = 0;
  private eatGoal: EatBlockGoal | null = null;
  constructor(level: Level) {
    super(level);
    this.setSize(0.9, 1.3);
    this.maxHealth = this.health = 8;
    this.moveSpeedAttr = 0.23;
  }
  protected registerGoals(): void {
    this.eatGoal = new EatBlockGoal(this);
    this.goalSelector.addGoal(0, new FloatGoal(this));
    this.goalSelector.addGoal(1, new PanicGoal(this, 1.25));
    this.goalSelector.addGoal(2, new BreedGoal(this, 1.0));
    this.goalSelector.addGoal(3, new TemptGoal(this, 1.1, WHEAT));
    this.goalSelector.addGoal(4, new FollowParentGoal(this, 1.1));
    this.goalSelector.addGoal(5, this.eatGoal);
    this.goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 1.0));
    this.goalSelector.addGoal(7, new LookAtPlayerGoal(this, 6));
    this.goalSelector.addGoal(8, new RandomLookAroundGoal(this));
  }
  override aiStep(): void {
    super.aiStep();
    this.eatAnimationTick = Math.max(0, this.eatAnimationTick - 1);
  }
  /** vanilla Sheep.getHeadEatPositionScale */
  headEatPositionScale(p: number): number {
    const t = this.eatAnimationTick;
    if (t <= 0) return 0;
    if (t >= 4 && t <= 36) return 1;
    return t < 4 ? (t - p) / 4 : -(t - 40 - p) / 4;
  }
  /** vanilla Sheep.getHeadEatAngleScale (radians) */
  headEatAngleScale(p: number, pitchDeg: number): number {
    const t = this.eatAnimationTick;
    if (t > 4 && t <= 36) {
      const f = (t - 4 - p) / 32;
      return Math.PI / 5 + 0.21991149 * Math.sin(f * 28.7);
    }
    return t > 0 ? Math.PI / 5 : (pitchDeg * Math.PI) / 180;
  }
  ate(): void {
    this.sheared = false;
    if (this.isBaby()) this.ageUp(60, false);
  }
  isFood(s: ItemStack): boolean {
    return s.item.id === 'wheat';
  }
  makeBaby(): Animal {
    return new Sheep(this.level);
  }
  override spawnChildFromBreeding(partner: Animal): void {
    const before = new Set(this.level.entities);
    super.spawnChildFromBreeding(partner);
    const baby = this.level.entities.find((e) => !before.has(e)) as Sheep | undefined;
    if (baby && partner instanceof Sheep) baby.color = offspringColor(this.color, partner.color, this.random.nextBool());
  }
  override finalizeSpawn(): void {
    // vanilla Sheep.getRandomSheepColor
    const i = this.random.nextInt(100);
    this.color = i < 5 ? 15 : i < 10 ? 7 : i < 15 ? 8 : i < 18 ? 12 : this.random.nextInt(500) === 0 ? 6 : 0;
  }
  override ambientSound(): string {
    return 'entity.sheep.ambient';
  }
  override hurtSound(): string {
    return 'entity.sheep.hurt';
  }
  override deathSound(): string {
    return 'entity.sheep.death';
  }
  override stepSound(): string {
    return 'entity.sheep.step';
  }
  override lootTable(): LootEntry[] {
    const l: LootEntry[] = [{ item: 'mutton', min: 1, max: 2, cooked: 'cooked_mutton' }];
    if (!this.sheared) l.unshift({ item: `${DYE_COLORS[this.color]}_wool`, min: 1, max: 1 });
    return l;
  }
  override interact(p: Player, stack: ItemStack | null): boolean {
    if (stack && stack.item.id === 'shears' && !this.sheared && !this.isBaby()) {
      this.shear();
      if (p.gameMode !== 'creative' && stack.item.maxDamage) {
        stack.damage++;
        if (stack.damage >= stack.item.maxDamage) {
          p.inventory.setSelectedItem(null);
          this.level.sound.play('entity.item.break', p.x, p.y, p.z, 0.8, 0.8 + Math.random() * 0.4);
        }
        p.inventory.version++;
      }
      return true;
    }
    if (stack && stack.item.id.endsWith('_dye') && !this.sheared) {
      const c = DYE_COLORS.indexOf(stack.item.id.slice(0, -4));
      if (c >= 0 && c !== this.color) {
        this.color = c;
        this.level.sound.play('item.dye.use', this.x, this.y, this.z, 1, 1);
        if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
        return true;
      }
    }
    return super.interact(p, stack);
  }
  /** vanilla Sheep.shear */
  shear(): void {
    this.playSound('entity.sheep.shear', 1, 1);
    this.sheared = true;
    const n = 1 + this.random.nextInt(3);
    const it = ITEMS.get(`${DYE_COLORS[this.color]}_wool`);
    for (let i = 0; i < n && it; i++) {
      const e = this.spawnAtLocation(new ItemStack(it, 1), 1);
      e.dx += (this.random.nextFloat() - this.random.nextFloat()) * 0.1;
      e.dy += this.random.nextFloat() * 0.05;
      e.dz += (this.random.nextFloat() - this.random.nextFloat()) * 0.1;
    }
  }
  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), color: this.color, sheared: this.sheared };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.color = Number(d.color ?? 0);
    this.sheared = !!d.sheared;
  }
}

/** dye mixing for lambs (vanilla crafts the two dyes; common pairs listed) */
function offspringColor(a: number, b: number, pickA: boolean): number {
  if (a === b) return a;
  const key = (x: number, y: number) => (x < y ? x + ',' + y : y + ',' + x);
  const MIX: Record<string, number> = {
    [key(0, 15)]: 7, // white + black = gray
    [key(0, 7)]: 8, // white + gray = light gray
    [key(0, 14)]: 6, // white + red = pink
    [key(0, 11)]: 3, // white + blue = light blue
    [key(0, 13)]: 5, // white + green = lime
    [key(14, 4)]: 1, // red + yellow = orange
    [key(11, 14)]: 10, // blue + red = purple
    [key(11, 13)]: 9, // blue + green = cyan
    [key(10, 6)]: 2, // purple + pink = magenta
  };
  return MIX[key(a, b)] ?? (pickA ? a : b);
}

export class Chicken extends Animal {
  readonly type = 'chicken';
  protected adultWidth = 0.4;
  protected adultHeight = 0.7;
  flap = 0;
  flapO = 0;
  flapSpeed = 0;
  flapSpeedO = 0;
  private flapping = 1;
  eggTime = 6000;
  constructor(level: Level) {
    super(level);
    this.setSize(0.4, 0.7);
    this.maxHealth = this.health = 4;
    this.moveSpeedAttr = 0.25;
    this.eggTime = Math.floor(Math.random() * 6000) + 6000;
    this.setPathfindingMalus(PathType.WATER, 0);
  }
  protected registerGoals(): void {
    this.goalSelector.addGoal(0, new FloatGoal(this));
    this.goalSelector.addGoal(1, new PanicGoal(this, 1.4));
    this.goalSelector.addGoal(2, new BreedGoal(this, 1.0));
    this.goalSelector.addGoal(3, new TemptGoal(this, 1.0, SEEDS));
    this.goalSelector.addGoal(4, new FollowParentGoal(this, 1.1));
    this.goalSelector.addGoal(5, new WaterAvoidingRandomStrollGoal(this, 1.0));
    this.goalSelector.addGoal(6, new LookAtPlayerGoal(this, 6));
    this.goalSelector.addGoal(7, new RandomLookAroundGoal(this));
  }
  override aiStep(): void {
    super.aiStep();
    this.flapO = this.flap;
    this.flapSpeedO = this.flapSpeed;
    this.flapSpeed += (this.onGround ? -1 : 4) * 0.3;
    this.flapSpeed = Math.max(0, Math.min(1, this.flapSpeed));
    if (!this.onGround && this.flapping < 1) this.flapping = 1;
    this.flapping *= 0.9;
    if (!this.onGround && this.dy < 0) this.dy *= 0.6;
    this.flap += this.flapping * 2;
    if (this.isAlive && !this.isBaby() && --this.eggTime <= 0) {
      this.playSound('entity.chicken.egg', 1, (this.random.nextFloat() - this.random.nextFloat()) * 0.2 + 1);
      const egg = ITEMS.get('egg');
      if (egg) this.spawnAtLocation(new ItemStack(egg, 1));
      this.eggTime = this.random.nextInt(6000) + 6000;
    }
  }
  protected override causeFallDamage(): void {}
  isFood(s: ItemStack): boolean {
    return SEEDS.has(s.item.id);
  }
  makeBaby(): Animal {
    return new Chicken(this.level);
  }
  override ambientSound(): string {
    return 'entity.chicken.ambient';
  }
  override hurtSound(): string {
    return 'entity.chicken.hurt';
  }
  override deathSound(): string {
    return 'entity.chicken.death';
  }
  override stepSound(): string {
    return 'entity.chicken.step';
  }
  override lootTable(): LootEntry[] {
    return [
      { item: 'feather', min: 0, max: 2 },
      { item: 'chicken', min: 1, max: 1, cooked: 'cooked_chicken' },
    ];
  }
  protected override saveData(): Record<string, number | string | boolean> {
    return { ...super.saveData(), eggTime: this.eggTime };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.eggTime = Number(d.eggTime ?? this.eggTime);
  }
}
