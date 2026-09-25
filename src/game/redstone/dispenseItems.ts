// What a dispenser does with each item (vanilla DispenseItemBehavior.bootStrap and the behaviours it registers, for
// the items the game has and what they work on): it shoots arrows, tridents, eggs, snowballs, splash and lingering
// potions, bottles o' enchanting and fire charges; sets down boats, minecarts, primed TNT and spawn eggs' mobs; empties and
// fills buckets and bottles; uses bone meal, flint and steel and shears on what's in front; puts armour, carved
// pumpkins and saddles on what stands there; and throws anything else out as an item (DefaultDispenseItemBehavior).

import { BLOCKS, STATE_BLOCK, FLAGS, COLLISION, F_AIR, F_WATER, F_LAVA, F_REPLACEABLE, S, getBlock, type Block } from '../../world/block';
import { DX, DY, DZ, UP, DOWN, NORTH, SOUTH, WEST, DIR_NAMES, type Dir } from '../../world/dir';
import { AABB } from '../../core/aabb';
import { ItemStack, type Item } from '../../item/item';
import { hurtAndBreak, type EquipSlot } from '../../item/enchantHelper';
import { armorIndex, equipSound, isArmorSlot } from '../../item/equipment';
import { contentsOf, potionStack } from '../../item/potions';
import { Entity } from '../../entity/entity';
import { LivingEntity } from '../../entity/living';
import { Mob } from '../../entity/mob';
import { Player } from '../../entity/player';
import { ItemEntity } from '../../entity/itemEntity';
import { Arrow } from '../../entity/arrow';
import { ThrownItem } from '../../entity/throwable';
import { ThrownPotion } from '../../entity/thrownPotion';
import { ThrownExperienceBottle } from '../../entity/thrownExperienceBottle';
import { ThrownTrident } from '../../entity/thrownTrident';
import { SmallFireball } from '../../entity/fireball';
import { PrimedTnt } from '../../entity/tnt';
import { Pig, Sheep, DYE_COLORS } from '../../entity/animals';
import { SnowGolem } from '../../entity/snowGolem';
import { Strider } from '../../entity/strider';
import { AbstractHorse, AbstractChestedHorse } from '../../entity/horse';
import { createBoat, boatItemInfo } from '../../entity/boat';
import { createMinecart } from '../../entity/minecart';
import { createMob } from '../spawner';
// (Stage 5: ocean)
import { releaseBucketFish } from '../../entity/fish';
import { behaviorOf } from '../blockBehavior';
import { canSurvive } from '../blockRules';
import { performBoneMeal, boneMealParticles } from '../boneMeal';
import { canPlaceFire, placeFire, fireStateAt } from '../fire';
import { lightCampfire } from '../villageBlocks';
import { isRail, railShape, isAscending } from '../rails';
import { BlockPattern } from '../blockPattern';
import { dispenseShulkerBox } from '../shulkerBox';
import { isShulkerBox } from '../../world/blocksShulker';
import { isSkullItem } from '../../world/blocksSkulls';
import type { Level } from '../level';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

/** where a dispenser is and how its try went (vanilla BlockSource, and OptionalDispenseItemBehavior's success) */
export interface DispenseSource {
  level: Level;
  x: number;
  y: number;
  z: number;
  facing: Dir;
  /** its inventory, for what a bucket or bottle fills into (vanilla DispenserBlockEntity.addItem: a slot, or -1) */
  be: { addItem(s: ItemStack): number };
  /** vanilla OptionalDispenseItemBehavior.isSuccess: the click if it did something, the failed click if not */
  success: boolean;
}

/** a dispense behaviour: what's left of `stack` for its slot */
export type DispenseBehavior = (src: DispenseSource, stack: ItemStack) => ItemStack | null;

const left = (s: ItemStack): ItemStack | null => (s.count > 0 ? s : null);
const front = (src: DispenseSource): [number, number, number] => [src.x + DX[src.facing], src.y + DY[src.facing], src.z + DZ[src.facing]];
const cell = ([x, y, z]: [number, number, number]) => new AABB(x, y, z, x + 1, y + 1, z + 1);
const isSpectator = (e: Entity) => (e as { gameMode?: string }).gameMode === 'spectator';

// ---------------------------------------------------------------------------
// The sounds and smoke (vanilla level events 1000, 1001, 1002, 1018, 2000)

/** level event 1000: the dispense click */
export function click(src: DispenseSource): void {
  src.level.sound.play('block.dispenser.dispense', src.x + 0.5, src.y + 0.5, src.z + 0.5, 1, 1);
}
/** level event 1001: the higher click of one that had nothing to give, or couldn't */
export function failClick(src: DispenseSource): void {
  src.level.sound.play('block.dispenser.fail', src.x + 0.5, src.y + 0.5, src.z + 0.5, 1, 1.2);
}
/** level event 1002: shooting a projectile */
function launch(src: DispenseSource): void {
  src.level.sound.play('block.dispenser.launch', src.x + 0.5, src.y + 0.5, src.z + 0.5, 1, 1.2);
}
/** level event 1018: a fire charge goes off as a blaze's fireball does */
function blazeShoot(src: DispenseSource): void {
  const r = src.level.random;
  src.level.sound.play('entity.blaze.shoot', src.x + 0.5, src.y + 0.5, src.z + 0.5, 2, (r.nextFloat() - r.nextFloat()) * 0.2 + 1);
}

/** vanilla Random.nextGaussian (Box-Muller) */
function gauss(): number {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

/** level event 2000 (LevelRenderer.shootParticles): ten puffs of smoke out of its front */
export function smoke(src: DispenseSource): void {
  const f = src.facing, i = DX[f], j = DY[f], k = DZ[f];
  const x0 = src.x + i * 0.6 + 0.5, y0 = src.y + j * 0.6 + 0.5, z0 = src.z + k * 0.6 + 0.5;
  for (let n = 0; n < 10; n++) {
    const d = Math.random() * 0.2 + 0.01;
    const x = x0 + i * 0.01 + (Math.random() - 0.5) * k * 0.5;
    const y = y0 + j * 0.01 + (Math.random() - 0.5) * j * 0.5;
    const z = z0 + k * 0.01 + (Math.random() - 0.5) * i * 0.5;
    src.level.particles.spawn?.('smoke', x, y, z, i * d + gauss() * 0.01, j * d + gauss() * 0.01, k * d + gauss() * 0.01);
  }
}

// ---------------------------------------------------------------------------
// Dropping (vanilla DefaultDispenseItemBehavior)

/** vanilla DispenserBlock.getDispensePosition: `mul` out from its middle toward its front (and `dy` up) */
export function dispensePosition(src: DispenseSource, mul = 0.7, dy = 0): [number, number, number] {
  const f = src.facing;
  return [src.x + 0.5 + mul * DX[f], src.y + 0.5 + mul * DY[f] + dy, src.z + 0.5 + mul * DZ[f]];
}

/** vanilla spawnItem: the item a little below that point, off out of the front at 0.2-0.3 and up 0.2, spread by `speed` */
export function spawnItem(level: Level, stack: ItemStack, speed: number, facing: Dir, [x, y, z]: [number, number, number]): ItemEntity {
  y -= facing === UP || facing === DOWN ? 0.125 : 0.15625;
  const e = new ItemEntity(level, stack);
  e.moveTo(x, y, z, Math.random() * 360, 0);
  const r = level.random;
  const tri = (mode: number, dev: number) => mode + dev * (r.nextDouble() - r.nextDouble());
  const d = r.nextDouble() * 0.1 + 0.2;
  e.dx = tri(DX[facing] * d, 0.0172275 * speed);
  e.dy = tri(0.2, 0.0172275 * speed);
  e.dz = tri(DZ[facing] * d, 0.0172275 * speed);
  e.pickupDelay = 0;
  level.addEntity(e);
  return e;
}

/** vanilla DefaultDispenseItemBehavior.execute: one of it thrown out of the front */
function dropOne(src: DispenseSource, stack: ItemStack): ItemStack | null {
  spawnItem(src.level, stack.split(1), 6, src.facing, dispensePosition(src));
  return left(stack);
}

/** a behaviour: its execute, then its sound (the click unless it says otherwise) and the smoke (vanilla dispense) */
function behavior(execute: DispenseBehavior, sound: (src: DispenseSource) => void = click): DispenseBehavior {
  return (src, stack) => {
    src.success = true;
    const out = execute(src, stack);
    sound(src);
    smoke(src);
    return out;
  };
}

/** vanilla OptionalDispenseItemBehavior: the click if it did something, the failed click if not */
const optional = (execute: DispenseBehavior) => behavior(execute, (src) => (src.success ? click(src) : failClick(src)));

/** vanilla DefaultDispenseItemBehavior: anything with nothing else to do is thrown out */
export const DEFAULT_DISPENSE: DispenseBehavior = behavior(dropOne);

/** vanilla consumeWithRemainder's 1.21 form: the used one goes, the result takes its place or a free slot, or is dropped */
function withRemainder(src: DispenseSource, stack: ItemStack, result: ItemStack): ItemStack | null {
  stack.count--;
  if (stack.count <= 0) return result;
  if (src.be.addItem(result) < 0) DEFAULT_DISPENSE(src, result);
  return stack;
}

// ---------------------------------------------------------------------------
// Projectiles (vanilla ProjectileDispenseBehavior and each ProjectileItem's DispenseConfig: by default 0.7 out and
// 0.1 up, at 1.1 with a spread of 6)

interface Shot {
  shoot(x: number, y: number, z: number, velocity: number, inaccuracy: number): void;
}

function projectile(make: (src: DispenseSource, at: [number, number, number], stack: ItemStack) => Entity & Shot, power = 1.1, uncertainty = 6): DispenseBehavior {
  return behavior((src, stack) => {
    const f = src.facing;
    const p = make(src, dispensePosition(src, 0.7, 0.1), stack);
    p.shoot(DX[f], DY[f], DZ[f], power, uncertainty);
    src.level.addEntity(p);
    stack.count--;
    return left(stack);
  }, launch);
}

/** vanilla ArrowItem.asProjectile: an arrow that can be picked up (a tipped one keeps its potion) */
const arrow = projectile((src, [x, y, z], stack) => {
  const a = new Arrow(src.level, null);
  a.moveTo(x, y, z, 0, 0);
  a.pickup = 'allowed';
  if (stack.item.id !== 'arrow') a.setPickupStack(stack);
  return a;
});

/** vanilla TridentItem.asProjectile: it flies as an arrow does, and whoever finds it may pick it up */
const trident = projectile((src, [x, y, z], stack) => {
  const t = new ThrownTrident(src.level, null, stack);
  t.moveTo(x, y, z, 0, 0);
  t.pickup = 'allowed';
  return t;
});

/** vanilla EggItem / SnowballItem.asProjectile */
const thrown = (kind: 'egg' | 'snowball') =>
  projectile((src, [x, y, z]) => {
    const t = new ThrownItem(src.level, kind, null);
    t.moveTo(x, y, z, 0, 0);
    return t;
  });

/** vanilla ThrowablePotionItem / ExperienceBottleItem: half the spread and a quarter more speed */
const potion = projectile((src, [x, y, z], stack) => {
  const t = new ThrownPotion(src.level, null, stack.copyWithCount(1));
  t.moveTo(x, y, z, 0, 0);
  return t;
}, 1.375, 3);
const experienceBottle = projectile((src, [x, y, z]) => {
  const t = new ThrownExperienceBottle(src.level, null);
  t.moveTo(x, y, z, 0, 0);
  return t;
}, 1.375, 3);

/** vanilla FireChargeItem: a small fireball from the front face, headed out a little astray (level event 1018) */
const fireCharge = behavior((src, stack) => {
  const f = src.facing, r = src.level.random;
  const tri = (mode: number) => mode + 0.11485000000000001 * (r.nextDouble() - r.nextDouble());
  const [x, y, z] = dispensePosition(src, 1);
  const ball = new SmallFireball(src.level, null, tri(DX[f]), tri(DY[f]), tri(DZ[f]));
  ball.moveTo(x, y, z, 0, 0);
  src.level.addEntity(ball);
  stack.count--;
  return left(stack);
}, blazeShoot);

// ---------------------------------------------------------------------------
// Things set down in front

/** vanilla EntityType.getYOffset: dropped onto whatever is in the block's space under it (a slab, a fence's top) */
function floorIn(level: Level, x: number, y: number, z: number, e: Entity): number {
  const hw = e.width / 2;
  let top = 0;
  const over = (b: number[]) => b[0] < 0.5 + hw && b[3] > 0.5 - hw && b[2] < 0.5 + hw && b[5] > 0.5 - hw;
  for (const b of COLLISION[level.getState(x, y, z)] ?? []) if (over(b) && b[4] <= 1) top = Math.max(top, b[4]);
  for (const b of COLLISION[level.getState(x, y - 1, z)] ?? []) if (over(b) && b[4] > 1) top = Math.max(top, b[4] - 1);
  return top;
}

/** vanilla SpawnEggItem's dispense behaviour: the mob in front, standing on what's there (not raised when facing up) */
const spawnEgg = behavior((src, stack) => {
  const [x, y, z] = front(src);
  const mob = createMob(stack.item.id.slice(0, -'_spawn_egg'.length), src.level);
  if (!mob) return stack;
  const dy = src.facing !== UP ? floorIn(src.level, x, y, z, mob) : 0;
  mob.moveTo(x + 0.5, y + dy, z + 0.5, src.level.random.nextFloat() * 360, 0);
  mob.bodyYaw = mob.headYaw = mob.yaw;
  // (vanilla MobSpawnType.DISPENSER; the game's mobs treat it as a spawn egg's)
  mob.finalizeSpawn('egg');
  mob.playAmbientSound();
  src.level.addEntity(mob);
  stack.count--;
  return left(stack);
});

/** vanilla Direction.toYRot */
const yRot = (d: Dir) => ({ [SOUTH]: 0, [WEST]: 90, [NORTH]: 180 } as Record<number, number>)[d] ?? 270;

/** vanilla BoatDispenseItemBehavior: on the water in front (or on water under an empty front), else thrown out */
function boat(variant: string, chest: boolean): DispenseBehavior {
  return behavior((src, stack) => {
    const f = src.facing, level = src.level;
    const d0 = 0.5625 + 1.375 / 2;
    const x = src.x + 0.5 + DX[f] * d0, y = src.y + 0.5 + DY[f] * 1.125, z = src.z + 0.5 + DZ[f] * d0;
    const [fx, fy, fz] = front(src);
    let up: number;
    if (FLAGS[level.getState(fx, fy, fz)] & F_WATER) up = 1;
    else if (!(FLAGS[level.getState(fx, fy, fz)] & F_AIR) || !(FLAGS[level.getState(fx, fy - 1, fz)] & F_WATER)) return DEFAULT_DISPENSE(src, stack);
    else up = 0;
    const b = createBoat(chest ? 'chest_boat' : 'boat', level, variant)!;
    b.moveTo(x, y + up, z, yRot(f), 0);
    level.addEntity(b);
    stack.count--;
    return left(stack);
  });
}

/** vanilla MinecartDispenseItemBehavior: on the rail in front (or the rail under an empty front), else thrown out */
function minecart(type: string): DispenseBehavior {
  return behavior((src, stack) => {
    const f = src.facing, level = src.level;
    const x = src.x + 0.5 + DX[f] * 1.125, y = src.y + DY[f], z = src.z + 0.5 + DZ[f] * 1.125;
    const [fx, fy, fz] = front(src);
    const st = level.getState(fx, fy, fz);
    let dy: number;
    if (isRail(st)) dy = isAscending(railShape(st)) ? 0.6 : 0.1;
    else {
      const below = level.getState(fx, fy - 1, fz);
      if (!(FLAGS[st] & F_AIR) || !isRail(below)) return DEFAULT_DISPENSE(src, stack);
      dy = f !== DOWN && isAscending(railShape(below)) ? -0.4 : -0.9;
    }
    const cart = createMinecart(type, level)!;
    cart.moveTo(x, y + dy, z, 0, 0);
    level.addEntity(cart);
    stack.count--;
    return left(stack);
  });
}

/** vanilla: TNT comes out primed, in the block in front */
const tnt = behavior((src, stack) => {
  const [x, y, z] = front(src);
  PrimedTnt.prime(src.level, x, y, z, null);
  stack.count--;
  return left(stack);
});

// ---------------------------------------------------------------------------
// Buckets and bottles

/** vanilla BlockStateBase.isSolid (legacy): a collision shape that fills most of the block, or its whole height */
function isSolid(st: number): boolean {
  const boxes = COLLISION[st];
  if (!boxes) return false;
  let x0 = 1, y0 = 1, z0 = 1, x1 = 0, y1 = 0, z1 = 0;
  for (const b of boxes) {
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); z0 = Math.min(z0, b[2]);
    x1 = Math.max(x1, b[3]); y1 = Math.max(y1, b[4]); z1 = Math.max(z1, b[5]);
  }
  return (x1 - x0 + (y1 - y0) + (z1 - z0)) / 3 >= 0.7291666666666666 || y1 - y0 >= 1;
}

/** vanilla LiquidBlockContainers that never take any: the water plants (the water goes nowhere, the bucket's empty) */
const WATER_PLANTS = new Set(['seagrass', 'tall_seagrass', 'kelp', 'kelp_plant']);

/**
 * vanilla BucketItem.emptyContents (no player): into a block that holds water (waterlogging it), or in place of
 * air, a replaceable or non-solid block (broken first, with its drops) or other fluid; water boils away in the Nether.
 * False if it can't go there. (Stage 5: ocean: `emptySound` is a bucket of fish's own, vanilla MobBucketItem.playEmptySound)
 */
export function emptyContents(level: Level, x: number, y: number, z: number, fluid: 'water' | 'lava', emptySound = 'item.bucket.empty'): boolean {
  const st = level.getState(x, y, z);
  const b = blk(st);
  const f = FLAGS[st];
  const replaceable = (f & (F_AIR | F_REPLACEABLE)) !== 0 || !isSolid(st);
  const holds = fluid === 'water' && (behaviorOf(st)?.placeLiquid !== undefined || b.propIndex('waterlogged') >= 0 || WATER_PLANTS.has(b.name));
  if (!replaceable && !holds) return false;
  const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
  if (fluid === 'water' && level.world.dim.ultraWarm) {
    const r = level.random;
    level.sound.play('block.fire.extinguish', cx, cy, cz, 0.5, 2.6 + (r.nextFloat() - r.nextFloat()) * 0.8);
    for (let i = 0; i < 8; i++) level.particles.spawn?.('large_smoke', x + Math.random(), y + Math.random(), z + Math.random(), 0, 0, 0);
    return true;
  }
  if (holds) {
    if (!behaviorOf(st)?.placeLiquid?.(level, x, y, z, st) && b.propIndex('waterlogged') >= 0 && !b.get(st, 'waterlogged')) {
      level.setBlock(x, y, z, b.with(st, 'waterlogged', true));
      level.scheduleTick(x, y, z, 5);
    }
    level.sound.play(emptySound, cx, cy, cz, 1, 1);
    return true;
  }
  if (!(f & F_AIR) && !(f & (F_WATER | F_LAVA) && b.s.fluid)) level.destroyBlock(x, y, z, true);
  level.setBlock(x, y, z, getBlock(fluid).defaultState);
  level.sound.play(fluid === 'lava' ? 'item.bucket.empty_lava' : emptySound, cx, cy, cz, 1, 1);
  return true;
}

/** vanilla: a water or lava bucket empties in front and an empty bucket is left, else it's thrown out */
const fullBucket = (fluid: 'water' | 'lava') =>
  behavior((src, stack) => {
    const [x, y, z] = front(src);
    if (emptyContents(src.level, x, y, z, fluid)) return ItemStack.of('bucket');
    return DEFAULT_DISPENSE(src, stack);
  });

/**
 * vanilla: an empty bucket takes up a source of water or lava in front, or the water of a waterlogged block (vanilla
 * BucketPickup), and the full one goes in its place, a free slot or out; nothing to take, it's thrown out
 */
const emptyBucket = behavior((src, stack) => {
  const level = src.level;
  const [x, y, z] = front(src);
  const st = level.getState(x, y, z);
  const b = blk(st);
  let filled: string | null = null;
  if ((b.name === 'water' || b.name === 'lava') && b.get<number>(st, 'level') === 0) {
    level.setBlock(x, y, z, 0);
    filled = `${b.name}_bucket`;
  } else if (b.propIndex('waterlogged') >= 0 && b.get(st, 'waterlogged')) {
    const now = b.with(st, 'waterlogged', false);
    level.setBlock(x, y, z, now);
    if (!canSurvive(level.world, x, y, z, now)) level.destroyBlock(x, y, z, true);
    filled = 'water_bucket';
  }
  if (!filled) return dropOne(src, stack);
  return withRemainder(src, stack, ItemStack.of(filled));
});

/** vanilla: a glass bottle fills from water in front (a water bottle takes its place, a free slot or goes out) */
const glassBottle = optional((src, stack) => {
  src.success = false;
  const [x, y, z] = front(src);
  if (!(FLAGS[src.level.getState(x, y, z)] & F_WATER)) return dropOne(src, stack);
  src.success = true;
  return withRemainder(src, stack, potionStack('potion', 'water'));
});

/** vanilla: a water bottle poured on dirt, coarse dirt or rooted dirt in front makes mud, else it's thrown out */
const waterBottle = behavior((src, stack) => {
  const level = src.level;
  const [x, y, z] = front(src);
  if (contentsOf(stack)?.potion !== 'water' || !/^(dirt|coarse_dirt|rooted_dirt)$/.test(level.getBlockName(x, y, z))) return DEFAULT_DISPENSE(src, stack);
  // (vanilla: the splashes and the sound are the dispenser's own, not the dirt's)
  for (let i = 0; i < 5; i++) level.particles.spawn?.('splash', src.x + Math.random(), src.y + 1, src.z + Math.random(), 0, 0, 0);
  level.sound.play('item.bottle.empty', src.x + 0.5, src.y + 0.5, src.z + 0.5, 1, 1);
  level.setBlock(x, y, z, S('mud'));
  return ItemStack.of('glass_bottle');
});

// ---------------------------------------------------------------------------
// Tools used on what's in front

/** a tool worn by a use (vanilla hurtAndBreak with no one holding it: gone quietly when worn out) */
const wear = (stack: ItemStack): ItemStack | null => (hurtAndBreak(stack, 1) ? null : stack);

/** vanilla: flint and steel lights a fire in front (a portal in a frame), a campfire that's out, or TNT */
const flintAndSteel = optional((src, stack) => {
  const level = src.level, f = src.facing;
  const [x, y, z] = front(src);
  // (vanilla isPortal: the frame's axis from the dispenser's facing, or either way at random for up and down)
  const facing = f === UP || f === DOWN ? (level.random.nextInt(2) ? 'north' : 'east') : DIR_NAMES[f];
  if (canPlaceFire(level.world, x, y, z, facing)) placeFire(level, x, y, z, fireStateAt(level.world, x, y, z));
  else if (lightCampfire(level, x, y, z)) {
    // (candles and candle cakes, when the game has them)
  } else if (level.getBlockName(x, y, z) === 'tnt') {
    PrimedTnt.prime(level, x, y, z, null);
    level.setBlock(x, y, z, 0);
  } else src.success = false;
  return src.success ? wear(stack) : stack;
});

/** vanilla: bone meal on what's in front (level event 1505: the sparkles and its sound) */
const boneMeal = optional((src, stack) => {
  const level = src.level;
  const [x, y, z] = front(src);
  if (!performBoneMeal(level, x, y, z, level.getState(x, y, z))) {
    src.success = false;
    return stack;
  }
  stack.count--;
  boneMealParticles(level, x, y, z);
  level.sound.play('item.bone_meal.use', x + 0.5, y + 0.5, z + 0.5, 1, 1);
  return left(stack);
});

/** vanilla ShearsDispenseItemBehavior: a sheep or snow golem in front that can be shorn is (beehives, when the game has them) */
const shears = optional((src, stack) => {
  const s = src.level.getEntities(cell(front(src)), (e) => (e instanceof Sheep && e.isAlive && !e.sheared && !e.isBaby()) || (e instanceof SnowGolem && e.readyForShearing()))[0] as Sheep | SnowGolem | undefined;
  if (!s) {
    src.success = false;
    return stack;
  }
  s.shear();
  return wear(stack);
});

// ---------------------------------------------------------------------------
// Things put on what stands in front

/** where a dispenser puts an item on a living thing (vanilla getEquipmentSlotForItem): armour, a shield, a pumpkin */
function slotFor(it: Item): EquipSlot | null {
  if (it.armor) return it.armor.slot;
  if (it.id === 'shield') return 'offhand';
  if (it.id === 'carved_pumpkin') return 'head';
  if (isSkullItem(it.id)) return 'head';
  if (it.id === 'elytra') return 'chest';
  return null;
}

function itemInSlot(e: LivingEntity, slot: EquipSlot): ItemStack | null {
  if (e instanceof Mob) return e.getItemBySlot(slot);
  if (e instanceof Player) return slot === 'offhand' ? e.inventory.offhand : isArmorSlot(slot) ? e.inventory.armor[armorIndex(slot)] : e.inventory.selectedItem;
  return null;
}

/** vanilla LivingEntity.canTakeItem: a player with that slot free, a mob that picks things up with it free */
function canTakeItem(e: LivingEntity, slot: EquipSlot): boolean {
  if (e instanceof Mob) return !itemInSlot(e, slot) && e.canPickUpLoot;
  if (e instanceof Player) return slot !== 'mainhand' && !itemInSlot(e, slot);
  return false;
}

/** vanilla ArmorItem.dispenseArmor: one onto the first living thing in front that takes it (a mob keeps it and stays) */
function dispenseArmor(src: DispenseSource, stack: ItemStack): boolean {
  const slot = slotFor(stack.item);
  if (!slot) return false;
  const e = src.level.getEntities(cell(front(src)), (o) => o instanceof LivingEntity && o.isAlive && !isSpectator(o) && canTakeItem(o, slot))[0] as LivingEntity | undefined;
  if (!e) return false;
  const one = stack.split(1);
  if (e instanceof Mob) e.setItemSlotAndDropWhenKilled(slot, one);
  else if (e instanceof Player) {
    if (slot === 'offhand') e.inventory.offhand = one;
    else if (isArmorSlot(slot)) e.inventory.armor[armorIndex(slot)] = one;
    e.inventory.version++;
    const snd = equipSound(one.item);
    if (snd) src.level.sound.play(snd, e.x, e.y, e.z, 1, 1);
  }
  return true;
}

/** vanilla ArmorItem.DISPENSE_ITEM_BEHAVIOR: put on, else thrown out */
const armor = behavior((src, stack) => (dispenseArmor(src, stack) ? left(stack) : dropOne(src, stack)));

/** vanilla CarvedPumpkinBlock.getOrCreateSnowGolemBase: two snow blocks */
const SNOW_GOLEM_BASE = new BlockPattern([[' ', '#', '#']], {
  '#': (st) => blk(st).name === 'snow_block',
});

/** vanilla CarvedPumpkinBlock.getOrCreateIronGolemBase: the T of iron with air where the arms and legs leave gaps */
const IRON_GOLEM_BASE = new BlockPattern([['~ ~', '###', '~#~']], {
  '#': (st) => blk(st).name === 'iron_block',
  '~': (st) => (FLAGS[st] & F_AIR) !== 0,
});

/** vanilla: a carved pumpkin finishes a golem in front (set as a block there), else goes on a head; else nothing */
const carvedPumpkin = optional((src, stack) => {
  const level = src.level;
  const [x, y, z] = front(src);
  if (FLAGS[level.getState(x, y, z)] & F_AIR && (SNOW_GOLEM_BASE.find(level.world, x, y, z) || IRON_GOLEM_BASE.find(level.world, x, y, z))) {
    level.setBlock(x, y, z, getBlock('carved_pumpkin').defaultState);
    stack.count--;
  } else src.success = dispenseArmor(src, stack);
  return left(stack);
});

/** vanilla: a saddle on a pig, strider or horse in front that can take one, else thrown out */
const saddle = behavior((src, stack) => {
  const e = src.level.getEntities(cell(front(src)), (o) => (o instanceof Pig || o instanceof Strider || o instanceof AbstractHorse) && o.isAlive && !o.saddled && o.isSaddleable())[0] as Pig | Strider | AbstractHorse | undefined;
  if (!e) return dropOne(src, stack);
  if (e instanceof AbstractHorse) e.equipSaddle(stack.split(1), true);
  else {
    e.equipSaddle(true);
    stack.count--;
  }
  return left(stack);
});

/** vanilla AnimalArmorItem's (ArmorItem.dispenseArmor): onto a tame horse (a carpet: llama) in front wearing none, else thrown out */
const horseArmor = behavior((src, stack) => {
  const h = src.level.getEntities(cell(front(src)), (o) => o instanceof AbstractHorse && o.isAlive && o.tamed && o.isArmor(stack) && !o.bodyArmor())[0] as AbstractHorse | undefined;
  if (!h) return dropOne(src, stack);
  h.setArmor(stack.split(1));
  return left(stack);
});

/** vanilla Blocks.CHEST's: strapped onto a tame donkey or mule in front without one, else thrown out */
const chestOnDonkey = behavior((src, stack) => {
  const h = src.level.getEntities(cell(front(src)), (o) => o instanceof AbstractChestedHorse && o.isAlive && o.tamed && !o.hasChest)[0] as AbstractChestedHorse | undefined;
  if (!h) return dropOne(src, stack);
  h.hasChest = true;
  stack.count--;
  return left(stack);
});

/**
 * vanilla ShulkerBoxDispenseItemBehavior: the box set down in front as a player would place it (game/shulkerBox.ts),
 * and one fewer; the failed click if it couldn't go there
 */
const shulkerBox = optional((src, stack) => {
  src.success = dispenseShulkerBox(src.level, src.x, src.y, src.z, src.facing, stack);
  if (src.success) stack.count--;
  return left(stack);
});

/** vanilla DispenseItemBehavior's mob heads: one goes on the head of whoever stands in front, else the failed click */
const skull = optional((src, stack) => {
  src.success = dispenseArmor(src, stack);
  return left(stack);
});

// ---------------------------------------------------------------------------
// The registry (vanilla DispenserBlock.DISPENSER_REGISTRY)

const BEHAVIORS: Record<string, DispenseBehavior> = {
  arrow, tipped_arrow: arrow, trident, egg: thrown('egg'), snowball: thrown('snowball'), splash_potion: potion, lingering_potion: potion,
  experience_bottle: experienceBottle, fire_charge: fireCharge,
  tnt, minecart: minecart('minecart'), chest_minecart: minecart('chest_minecart'),
  water_bucket: fullBucket('water'), lava_bucket: fullBucket('lava'), bucket: emptyBucket,
  glass_bottle: glassBottle, potion: waterBottle,
  flint_and_steel: flintAndSteel, bone_meal: boneMeal, shears,
  carved_pumpkin: carvedPumpkin, saddle,
  // (Stage 6: tameable animals)
  leather_horse_armor: horseArmor, iron_horse_armor: horseArmor, golden_horse_armor: horseArmor, diamond_horse_armor: horseArmor, chest: chestOnDonkey,
};
// (vanilla: the wool carpets go on a tame llama as a horse's armour does on a horse)
for (const c of DYE_COLORS) BEHAVIORS[`${c}_carpet`] = horseArmor;

/** vanilla getDispenseMethod: the item's own behaviour, else thrown out */
export function dispenseBehaviorFor(stack: ItemStack): DispenseBehavior {
  const id = stack.item.id;
  const own = BEHAVIORS[id];
  if (own) return own;
  if (id.endsWith('_spawn_egg')) return spawnEgg;
  if (isShulkerBox(id)) return shulkerBox;
  if (isSkullItem(id)) return skull;
  const b = boatItemInfo(id);
  if (b) return (BEHAVIORS[id] = boat(b.variant, b.chest));
  if (stack.item.armor || id === 'shield' || id === 'elytra') return armor;
  return DEFAULT_DISPENSE;
}

// (Stage 5: ocean) vanilla: a bucket of fish empties its water in front, lets the fish go in it (MobBucketItem
// checkExtraContent) and leaves an empty bucket; where the water can't go, it's thrown out
const fishBucket = behavior((src, stack) => {
  const [x, y, z] = front(src);
  if (!emptyContents(src.level, x, y, z, 'water', 'item.bucket.empty_fish')) return DEFAULT_DISPENSE(src, stack);
  releaseBucketFish(src.level, stack, x, y, z);
  return ItemStack.of('bucket');
});
Object.assign(BEHAVIORS, { cod_bucket: fishBucket, salmon_bucket: fishBucket, pufferfish_bucket: fishBucket, tropical_fish_bucket: fishBucket });
