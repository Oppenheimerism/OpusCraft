// (remaining mobs: the mooshroom) The mooshroom (vanilla 1.21 MushroomCow extends Cow): the mushroom fields' cow, red
// with red mushrooms growing on its back and head, or (rarely) brown with brown ones. It lives on mycelium (the best
// ground for it to wander to), comes out in herds of four to eight, and is a cow in every other way: its voice and
// its drops, wheat to tempt and breed it, a bucket to milk it. A bowl held to a grown one fills with mushroom stew. A
// brown one fed a small flower takes in what the flower does, and the next bowl comes back as suspicious stew with
// that in it (a second flower before then goes up in smoke, not taken). Shears take its mushrooms off, five of
// them, and leave a plain cow where it stood, as hurt and named as it was. Lightning turns a red one brown and a
// brown one red, without hurting it. Two of a colour have a calf of it, now and then (one time in 1024) of the
// other; two of different colours, one of either. Drawn as a cow with its mushrooms (render/mooshroomRenderer.ts).

import { Cow, type Animal } from './animals';
import type { Level } from '../game/level';
import type { Entity } from './entity';
import type { Player } from './player';
import { ItemEntity } from './itemEntity';
import { ItemStack, getItem } from '../item/item';
import { hurtAndBreak } from '../item/enchantHelper';
import { MOB_EFFECTS } from './effects';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { SMALL_FLOWERS, flowerStewEffects, suspiciousStew, type StewEffect } from '../game/suspiciousStew';
import { parseSnbt, snbtObject, type SnbtValue } from '../game/snbt';

/** vanilla MushroomCow.MushroomType (its Type: red, brown) */
export type MooshroomVariant = 'red' | 'brown';

/** vanilla MushroomType.byType: an unknown name is red */
export function mooshroomVariant(name: string): MooshroomVariant {
  return name === 'brown' ? 'brown' : 'red';
}

/** vanilla SuspiciousStewEffects.Entry.DEFAULT_DURATION: an entry saved without its duration */
const DEFAULT_STEW_DURATION = 160;

/**
 * vanilla SuspiciousStewEffects.CODEC: a list of {id, duration} (an effect by its id, minecraft: or not); null if
 * any of it isn't (an unknown effect, say: vanilla then leaves what it had)
 */
function readStewEffects(v: SnbtValue | null | undefined): StewEffect[] | null {
  if (!Array.isArray(v)) return null;
  const out: StewEffect[] = [];
  for (const x of v) {
    const o = snbtObject(x);
    const id = typeof o?.id === 'string' ? o.id.replace(/^minecraft:/, '') : '';
    if (!MOB_EFFECTS[id]) return null;
    const d = o?.duration;
    out.push({ id, duration: typeof d === 'number' && Number.isFinite(d) ? Math.trunc(d) : DEFAULT_STEW_DURATION });
  }
  return out;
}

/**
 * vanilla MushroomCow.checkMushroomSpawnRules: on mycelium (#mooshrooms_spawnable_on), in light over 8 (the sky's
 * counted, day or night: Animal.isBrightEnoughToSpawn)
 */
export function mooshroomSpawnRulesOk(level: Level, x: number, y: number, z: number): boolean {
  const below = BLOCKS[STATE_BLOCK[level.world.getState(x, y - 1, z)]].name;
  return below === 'mycelium' && level.rawBrightness(x, y, z, 0) > 8;
}

/**
 * vanilla ItemUtils.createFilledResult(held, player, result, false): one of the held stack spent for `result` (not
 * in creative, where the result goes in the inventory besides); the rest kept, the result put away (or dropped)
 */
function fillFromHand(p: Player, held: ItemStack, result: ItemStack): void {
  const inv = p.inventory;
  if (p.gameMode !== 'creative') held.count--;
  if (held.count <= 0) inv.setSelectedItem(result);
  else {
    const left = inv.add(result);
    if (left > 0) p.dropItem(result.copyWithCount(left), false);
  }
  inv.version++;
}

export class Mooshroom extends Cow {
  override readonly type: string = 'mooshroom';
  /** vanilla DATA_TYPE: red or brown (what it looks like, and the mushrooms it has) */
  variant: MooshroomVariant = 'red';
  /** vanilla stewEffects: what a flower put in it (a brown one), for the next bowl (null: nothing) */
  stewEffects: StewEffect[] | null = null;
  /** vanilla lastLightningBoltUUID: the bolt that last turned it (one bolt strikes for several ticks) */
  lastLightningBolt: string | null = null;

  /** vanilla MushroomCow.getWalkTargetValue: mycelium is best, otherwise brighter is better */
  override walkTargetValue(x: number, y: number, z: number): number {
    const below = BLOCKS[STATE_BLOCK[this.level.world.getState(x, y - 1, z)]].name;
    if (below === 'mycelium') return 10;
    return this.level.brightness(x, y, z) - 0.5;
  }

  /** vanilla MushroomCow.thunderHit: turned the other colour, once for each bolt, unhurt and unburnt */
  override thunderHit(bolt: Entity): void {
    const id = bolt.uuid;
    if (id === this.lastLightningBolt) return;
    this.variant = this.variant === 'red' ? 'brown' : 'red';
    this.lastLightningBolt = id;
    this.playSound('entity.mooshroom.convert', 2, 1);
  }

  /** vanilla MushroomCow.readyForShearing: alive and grown */
  readyForShearing(): boolean {
    return this.isAlive && !this.isBaby();
  }

  /**
   * vanilla MushroomCow.shear: the snip, a puff where it stood and a cow in its place (its health, its turn, its
   * name and whether it's kept), and five of its mushrooms from the top of its back
   */
  shear(): void {
    const level = this.level;
    this.playSound('entity.mooshroom.shear', 1, 1);
    const cow = new Cow(level);
    level.particles.spawn?.('explosion', this.x, this.y + this.height * 0.5, this.z, 0, 0, 0);
    this.remove();
    cow.moveTo(this.x, this.y, this.z, this.yaw, this.pitch);
    cow.health = Math.min(cow.maxHealth, Math.max(0, this.health));
    cow.bodyYaw = cow.bodyYawO = this.bodyYaw;
    cow.headYaw = cow.headYawO = this.headYaw;
    if (this.hasCustomName()) {
      cow.setCustomName(this.customName);
      cow.customNameVisible = this.customNameVisible;
    }
    if (this.persistenceRequired) cow.persistenceRequired = true;
    level.addEntity(cow);
    // (vanilla new ItemEntity(level, x, getY(1.0), z, stack): straight up and a little aside, to be picked up at once)
    const mushroom = getItem(this.variant === 'brown' ? 'brown_mushroom' : 'red_mushroom');
    for (let i = 0; i < 5; i++) {
      const it = new ItemEntity(level, new ItemStack(mushroom, 1));
      it.pickupDelay = 0;
      it.moveTo(this.x, this.y + this.height, this.z, level.random.nextFloat() * 360, 0);
      it.dx = level.random.nextFloat() * 0.2 - 0.1;
      it.dy = 0.2;
      it.dz = level.random.nextFloat() * 0.2 - 0.1;
      level.addEntity(it);
    }
  }

  /**
   * vanilla MushroomCow.mobInteract: a bowl (a grown one) for stew, suspicious if a flower went in; shears; a small
   * flower for a brown one; then as a cow (a bucket for milk, wheat). True when the click did something
   */
  override interact(p: Player, stack: ItemStack | null): boolean {
    const id = stack?.item.id ?? '';
    if (stack && id === 'bowl' && !this.isBaby()) {
      const fx = this.stewEffects;
      this.stewEffects = null;
      fillFromHand(p, stack, fx ? suspiciousStew(fx) : ItemStack.of('mushroom_stew'));
      this.playSound(fx ? 'entity.mooshroom.suspicious_milk' : 'entity.mooshroom.milk', 1, 1);
      return true;
    }
    if (stack && id === 'shears' && this.readyForShearing()) {
      this.shear();
      this.level.gameEvent('shear', this.x, this.y, this.z, { entity: p });
      if (hurtAndBreak(stack, 1, p.gameMode === 'creative')) {
        p.inventory.setSelectedItem(null);
        this.level.sound.play('entity.item.break', p.x, p.y, p.z, 0.8, 0.8 + Math.random() * 0.4);
      }
      p.inventory.version++;
      return true;
    }
    if (stack && this.variant === 'brown' && SMALL_FLOWERS.has(id)) {
      const r = this.random, y = this.y + this.height * 0.5;
      if (this.stewEffects) {
        // (it has one in it already: the flower isn't taken, a wisp of smoke)
        for (let i = 0; i < 2; i++) this.level.particles.spawn?.('smoke', this.x + r.nextFloat() / 2, y, this.z + r.nextFloat() / 2, 0, r.nextFloat() / 5, 0);
        return true;
      }
      const fx = flowerStewEffects(id);
      if (!fx) return false;
      if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
      for (let i = 0; i < 4; i++) this.level.particles.spell?.('effect', this.x + r.nextFloat() / 2, y, this.z + r.nextFloat() / 2, 0, r.nextFloat() / 5, 0, 1, 1, 1);
      this.stewEffects = fx;
      this.playSound('entity.mooshroom.eat', 2, 1);
      return true;
    }
    return super.interact(p, stack);
  }

  /** vanilla MushroomCow.getBreedOffspring: a mooshroom calf, its colour getOffspringType's */
  override makeBaby(partner?: Animal): Animal {
    const baby = new Mooshroom(this.level);
    baby.variant = this.offspringVariant(partner instanceof Mooshroom ? partner : this);
    return baby;
  }

  /**
   * vanilla MushroomCow.getOffspringType: two of a colour, one time in 1024 the other colour; otherwise either
   * parent's, even odds
   */
  private offspringVariant(mate: Mooshroom): MooshroomVariant {
    const a = this.variant, b = mate.variant;
    if (a === b && this.random.nextInt(1024) === 0) return a === 'brown' ? 'red' : 'brown';
    return this.random.nextBool() ? a : b;
  }

  /** vanilla addAdditionalSaveData: Type, and stew_effects if a flower's in it */
  protected override saveData(): Record<string, number | string | boolean> {
    const d: Record<string, number | string | boolean> = { ...super.saveData(), Type: this.variant };
    if (this.stewEffects) d.stew_effects = JSON.stringify(this.stewEffects);
    return d;
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    this.variant = mooshroomVariant(String(d.Type ?? ''));
    let fx: SnbtValue | null = null;
    try {
      if (typeof d.stew_effects === 'string') fx = JSON.parse(d.stew_effects) as SnbtValue;
    } catch {
      fx = null;
    }
    this.stewEffects = readStewEffects(fx);
  }

  /** /summon's entity data (vanilla readAdditionalSaveData): its stew_effects list (Type comes with its saved values) */
  readEntityData(nbt: string): void {
    const list = snbtObject(parseSnbt(nbt))?.stew_effects;
    const fx = readStewEffects(list);
    if (fx) this.stewEffects = fx;
  }
}
