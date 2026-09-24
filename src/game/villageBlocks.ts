// What the village blocks do (vanilla BellBlock and the job site blocks: BarrelBlock, ComposterBlock, SmokerBlock,
// BlastFurnaceBlock, the cauldrons, LecternBlock, FlowerPotBlock, CampfireBlock). The blocks themselves are in
// world/blocksVillage; their block entities in world/blockEntity.

import { BLOCKS, STATE_BLOCK, FLAGS, FACE_OCC, F_FULL_COLLISION, F_LEAVES, BLOCK_BY_NAME, Block, getBlock } from '../world/block';
import { DOWN, UP, NORTH, SOUTH, WEST, EAST, DX, DZ, OPPOSITE, DIR_NAMES, AXIS_OF, dirFromYaw, type Dir } from '../world/dir';
import type { World } from '../world/world';
import { AABB } from '../core/aabb';
import { LivingEntity } from '../entity/living';
import { registerBehavior, type ItemUseResult, type UseContext } from './blockBehavior';
import type { PlaceContext } from './blockRules';
import { hasNeighborSignal } from './redstone/signal';
import { BellBlockEntity, LecternBlockEntity, campfireSmoke } from '../world/blockEntity';
import { composterFloor, cauldronContentTop, POTTABLE, pottedName } from '../world/blocksVillage';
import { isDyeable } from '../item/dyedColor';
import type { Entity } from '../entity/entity';
import { ItemStack, blockForItem } from '../item/item';
import { potionStack } from '../item/potions';
import { ItemEntity } from '../entity/itemEntity';
import type { Player } from '../entity/player';
import { lookingDirections } from './blockRules';
import type { Level } from './level';
// (books' uses, tooltips and copying, loaded with the lectern that holds them)
import './books';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

/** vanilla BlockBehaviour.isFaceSturdy (FULL): the face is all there to hang something on */
function sturdy(st: number, face: number): boolean {
  return (FLAGS[st] & F_FULL_COLLISION && !(FLAGS[st] & F_LEAVES)) || ((FACE_OCC[st] >> face) & 1) === 1;
}

/** vanilla Block.canSupportCenter: a sturdy face, or the post of a fence, wall, pane, bars or chain */
function supportsCenter(st: number, face: number): boolean {
  return sturdy(st, face) || /_fence$|_wall$|_pane$|^iron_bars$|^chain$/.test(blk(st).name);
}

const dirOf = (name: string): Dir => DIR_NAMES.indexOf(name as (typeof DIR_NAMES)[number]) as Dir;
const facingOf = (st: number): Dir => dirOf(blk(st).get<string>(st, 'facing'));

/** vanilla RandomSource.nextGaussian */
function gaussian(): number {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

/** vanilla ItemStack.consume(1, player): one from the hand in use, unless the player has infinite materials */
function consumeHeld(p: Player): void {
  if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
}

/**
 * vanilla ItemUtils.createFilledResult: the hand's item (an empty bucket, a bottle) swapped for `filled`, one at a
 * time, the rest of the stack kept and the filled one put away (or dropped); a creative player keeps the empty one
 * and gets a filled one only if they have none
 */
export function fillHeld(p: Player, filled: ItemStack): void {
  const inv = p.inventory;
  if (p.gameMode === 'creative') {
    const has = [...inv.main, inv.offhand, ...inv.armor].some((s) => s && s.sameItem(filled));
    if (!has) inv.add(filled);
    return;
  }
  const held = inv.selectedItem;
  if (!held || held.count <= 1) {
    inv.setSelectedItem(filled);
    return;
  }
  inv.consumeSelected(1);
  const left = inv.add(filled);
  if (left > 0) p.dropItem(filled.copyWithCount(left), false);
}

// ---------------------------------------------------------------------------
// Bell (vanilla BellBlock)

/** (Stage 4: raids) vanilla BellBlock.attemptToRing, for a villager sounding the alarm (game/raidVillagers.ts): set below */
export const bellRinger: { ring: (level: Level, x: number, y: number, z: number, dir: Dir | null) => boolean } = { ring: () => false };

{
  const bell = getBlock('bell');
  const attachment = (st: number) => bell.get<string>(st, 'attachment');

  /** vanilla BellBlock.canSurvive: standing on a sturdy top, hanging under something that holds up its middle, or on a wall's sturdy face */
  const canSurvive = (w: World, x: number, y: number, z: number, st: number): boolean => {
    const a = attachment(st);
    if (a === 'floor') return sturdy(w.getState(x, y - 1, z), UP);
    if (a === 'ceiling') return supportsCenter(w.getState(x, y + 1, z), DOWN);
    const f = facingOf(st);
    return sturdy(w.getState(x + DX[f], y, z + DZ[f]), OPPOSITE[f]);
  };

  /** vanilla BellBlock.isProperHit: the bell, not its frame, was struck (from the side, below the top rim of the frame) */
  const isProperHit = (st: number, face: number, dy: number): boolean => {
    if (face === UP || face === DOWN || dy > 0.8124) return false;
    const f = facingOf(st);
    switch (attachment(st)) {
      case 'floor': return AXIS_OF[f] === AXIS_OF[face];
      case 'single_wall':
      case 'double_wall': return AXIS_OF[f] !== AXIS_OF[face];
      default: return true;
    }
  };

  /**
   * vanilla BellBlock.attemptToRing and BellBlockEntity.onHit / triggerEvent / updateEntities: the bell swings away
   * from `dir` (its facing when none), rings out (volume 2: heard 32 blocks away), and every living thing within 32
   * blocks remembers hearing it (villagers' HEARD_BELL_TIME: an entity that keeps a `heardBellTime` gets the time)
   */
  const ring = (level: Level, x: number, y: number, z: number, dir: Dir | null): boolean => {
    const be = level.world.getBlockEntity(x, y, z);
    if (!(be instanceof BellBlockEntity)) return false;
    const st = level.getState(x, y, z);
    be.onHit(dir ?? facingOf(st));
    // (who is around is looked up again at most every 3 seconds)
    if (level.gameTime > be.lastRingTimestamp + 60 || !be.nearbyEntities) {
      be.lastRingTimestamp = level.gameTime;
      be.nearbyEntities = level.getEntities(new AABB(x - 48, y - 48, z - 48, x + 49, y + 49, z + 49), (e) => e instanceof LivingEntity);
    }
    const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
    for (const e of be.nearbyEntities) {
      if (!(e as LivingEntity).isAlive || e.removed) continue;
      if ((e.x - cx) ** 2 + (e.y - cy) ** 2 + (e.z - cz) ** 2 >= 32 * 32) continue;
      if ('heardBellTime' in e) (e as { heardBellTime: number }).heardBellTime = level.gameTime;
    }
    level.sound.play('block.bell.use', cx, cy, cz, 2, 1);
    return true;
  };
  bellRinger.ring = ring;

  registerBehavior('bell', {
    // vanilla BellBlock.getStateForPlacement
    placement(ctx: PlaceContext) {
      const { world: w, x, y, z, face } = ctx;
      if (face === UP || face === DOWN) {
        const st = bell.state({ attachment: face === DOWN ? 'ceiling' : 'floor', facing: DIR_NAMES[dirFromYaw(ctx.yaw)] });
        return canSurvive(w, x, y, z, st) ? st : null;
      }
      // a wall on both sides along the clicked face's axis: it hangs between them
      const between = face === WEST || face === EAST
        ? sturdy(w.getState(x - 1, y, z), EAST) && sturdy(w.getState(x + 1, y, z), WEST)
        : sturdy(w.getState(x, y, z - 1), SOUTH) && sturdy(w.getState(x, y, z + 1), NORTH);
      let st = bell.state({ facing: DIR_NAMES[OPPOSITE[face]], attachment: between ? 'double_wall' : 'single_wall' });
      if (canSurvive(w, x, y, z, st)) return st;
      st = bell.with(st, 'attachment', sturdy(w.getState(x, y - 1, z), UP) ? 'floor' : 'ceiling');
      return canSurvive(w, x, y, z, st) ? st : null;
    },
    canSurvive,
    /**
     * vanilla BellBlock.updateShape, from all the neighbours at once: a bell between two walls that loses one hangs
     * from the other; one on a wall that gains a wall behind it hangs between the two (the rest is canSurvive's)
     */
    updateShape(w, x, y, z, st) {
      const a = attachment(st);
      if (a !== 'single_wall' && a !== 'double_wall') return st;
      const f = facingOf(st), b = OPPOSITE[f];
      const front = sturdy(w.getState(x + DX[f], y, z + DZ[f]), b);
      const back = sturdy(w.getState(x + DX[b], y, z + DZ[b]), f);
      if (a === 'single_wall') return front && back ? bell.with(st, 'attachment', 'double_wall') : st;
      if (front && back) return st;
      if (front) return bell.with(st, 'attachment', 'single_wall');
      return back ? bell.with(bell.with(st, 'attachment', 'single_wall'), 'facing', DIR_NAMES[b]) : 0;
    },
    // vanilla BellBlock.useWithoutItem / onHit: a proper hit rings it; anything else (the frame, the top) passes
    use(level, x, y, z, st, ctx) {
      if (!isProperHit(st, ctx.face, ctx.hy - y)) return false;
      ring(level, x, y, z, ctx.face as Dir);
      return true;
    },
    // vanilla BellBlock.onProjectileHit: the same rule for arrows, snowballs, eggs and fireballs
    projectileHit(level, x, y, z, st, hit) {
      if (isProperHit(st, hit.face, hit.py - y)) ring(level, x, y, z, hit.face as Dir);
    },
    // vanilla BellBlock.neighborChanged: it rings as power comes on
    neighborChanged(level, x, y, z, st) {
      const on = hasNeighborSignal(level.world, x, y, z);
      if (on === bell.get(st, 'powered')) return;
      if (on) ring(level, x, y, z, null);
      level.setBlock(x, y, z, bell.with(st, 'powered', on));
    },
  });
}

// ---------------------------------------------------------------------------
// Barrel (vanilla BarrelBlock: faces away from the player, toward where they look from; its menu is the game's)
{
  const barrel = getBlock('barrel');
  registerBehavior('barrel', {
    placement: (ctx) => barrel.state({ facing: DIR_NAMES[OPPOSITE[lookingDirections(ctx.yaw, ctx.pitch)[0]]] }),
  });
}

// ---------------------------------------------------------------------------
// Composter (vanilla ComposterBlock): plant matter in, a chance a level for each; full at 7, ready a second later;
// the ready one gives bone meal. Farmer villagers fill theirs with their spare seeds.
const composter = getBlock('composter');
const composterLevel = (st: number) => composter.get<number>(st, 'level');

/** vanilla ComposterBlock.COMPOSTABLES: the chance each item raises the level */
const COMPOSTABLES: Record<string, number> = {};
{
  const add = (chance: number, ...ids: string[]) => {
    for (const id of ids) COMPOSTABLES[id] = chance;
  };
  add(0.3, 'jungle_leaves', 'oak_leaves', 'spruce_leaves', 'dark_oak_leaves', 'acacia_leaves', 'cherry_leaves', 'birch_leaves', 'azalea_leaves', 'mangrove_leaves',
    'oak_sapling', 'spruce_sapling', 'birch_sapling', 'jungle_sapling', 'acacia_sapling', 'cherry_sapling', 'dark_oak_sapling', 'mangrove_propagule',
    'beetroot_seeds', 'dried_kelp', 'short_grass', 'kelp', 'melon_seeds', 'pumpkin_seeds', 'seagrass', 'sweet_berries', 'glow_berries', 'wheat_seeds',
    'moss_carpet', 'pink_petals', 'small_dripleaf', 'hanging_roots', 'mangrove_roots', 'torchflower_seeds', 'pitcher_pod');
  add(0.5, 'dried_kelp_block', 'tall_grass', 'flowering_azalea_leaves', 'cactus', 'sugar_cane', 'vine', 'nether_sprouts', 'weeping_vines', 'twisting_vines',
    'melon_slice', 'glow_lichen');
  add(0.65, 'sea_pickle', 'lily_pad', 'pumpkin', 'carved_pumpkin', 'melon', 'apple', 'beetroot', 'carrot', 'cocoa_beans', 'potato', 'wheat',
    'brown_mushroom', 'red_mushroom', 'mushroom_stem', 'crimson_fungus', 'warped_fungus', 'nether_wart', 'crimson_roots', 'warped_roots', 'shroomlight',
    'dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower',
    'lily_of_the_valley', 'wither_rose', 'fern', 'sunflower', 'lilac', 'rose_bush', 'peony', 'large_fern', 'spore_blossom', 'azalea', 'moss_block',
    'big_dripleaf');
  add(0.85, 'hay_block', 'brown_mushroom_block', 'red_mushroom_block', 'nether_wart_block', 'warped_wart_block', 'flowering_azalea', 'bread',
    'baked_potato', 'cookie', 'torchflower', 'pitcher_plant');
  add(1, 'cake', 'pumpkin_pie');
}

/** vanilla ComposterBlock.COMPOSTABLES.containsKey: whether `id` composts at all */
export function isCompostable(id: string): boolean {
  return COMPOSTABLES[id] !== undefined;
}

/** vanilla ComposterBlock.handleFill (level event 1500): the rustle, and green sparkles over what's in it */
export function composterFillEffects(level: Level, x: number, y: number, z: number, st: number, success: boolean): void {
  level.sound.play(success ? 'block.composter.fill_success' : 'block.composter.fill', x + 0.5, y + 0.5, z + 0.5, 1, 1);
  const top = composterFloor(composterLevel(st)) / 16 + 0.03125;
  for (let i = 0; i < 10; i++) {
    level.particles.spawn?.('composter', x + 0.13125 + 0.7375 * Math.random(), y + top + Math.random() * (1 - top), z + 0.13125 + 0.7375 * Math.random(),
      gaussian() * 0.02, gaussian() * 0.02, gaussian() * 0.02);
  }
}

/** vanilla ComposterBlock.addItem: an empty composter always takes the first; after that it's the item's chance */
function composterAddItem(level: Level, x: number, y: number, z: number, st: number, chance: number): number {
  const lvl = composterLevel(st);
  if (!(lvl === 0 && chance > 0) && !(level.random.nextDouble() < chance)) return st;
  const now = composter.with(st, 'level', lvl + 1);
  level.setBlock(x, y, z, now);
  return now;
}

/** vanilla ComposterBlock.insertItem: one of `stack` in, if it composts and there's room (the state it leaves) */
export function composterInsert(level: Level, x: number, y: number, z: number, st: number, stack: ItemStack): number {
  const chance = COMPOSTABLES[stack.item.id];
  if (composterLevel(st) >= 7 || chance === undefined) return st;
  const now = composterAddItem(level, x, y, z, st, chance);
  stack.count--;
  return now;
}

/** vanilla ComposterBlock.extractProduce: a ready composter pops out bone meal and empties (the state it leaves) */
export function composterExtract(level: Level, x: number, y: number, z: number, st: number): number {
  const e = new ItemEntity(level, ItemStack.of('bone_meal'));
  e.moveTo(x + 0.5 + (Math.random() - 0.5) * 0.7, y + 1.01 + (Math.random() - 0.5) * 0.7, z + 0.5 + (Math.random() - 0.5) * 0.7, Math.random() * 360, 0);
  e.dx = Math.random() * 0.2 - 0.1;
  e.dy = 0.2;
  e.dz = Math.random() * 0.2 - 0.1;
  level.addEntity(e);
  const now = composter.with(st, 'level', 0);
  level.setBlock(x, y, z, now);
  level.sound.play('block.composter.empty', x + 0.5, y + 0.5, z + 0.5, 1, 1);
  return now;
}

registerBehavior('composter', {
  // vanilla ComposterBlock.useItemOn: compostable things go in (the click is spent once it's full, until it's ready)
  useItemOn(level, x, y, z, st, stack, ctx) {
    const lvl = composterLevel(st);
    const chance = COMPOSTABLES[stack.item.id];
    if (lvl >= 8 || chance === undefined) return 'pass';
    if (lvl < 7) {
      const now = composterAddItem(level, x, y, z, st, chance);
      composterFillEffects(level, x, y, z, now, now !== st);
      consumeHeld(ctx.player);
    }
    return 'success';
  },
  // vanilla ComposterBlock.useWithoutItem / extractProduce
  use(level, x, y, z, st) {
    if (composterLevel(st) !== 8) return false;
    composterExtract(level, x, y, z, st);
    return true;
  },
  // vanilla ComposterBlock.onPlace / addItem: full, it's ready a second later
  onPlace(level, x, y, z, st) {
    if (composterLevel(st) === 7) level.scheduleBlockTick(x, y, z, composter.id, 20);
  },
  tick(level, x, y, z, st) {
    if (composterLevel(st) !== 7) return;
    level.setBlock(x, y, z, composter.with(st, 'level', 8));
    level.sound.play('block.composter.ready', x + 0.5, y + 0.5, z + 0.5, 1, 1);
  },
  // vanilla loot table: itself, and bone meal from a ready one
  drops: (st) => (composterLevel(st) === 8 ? [ItemStack.of('composter'), ItemStack.of('bone_meal')] : [ItemStack.of('composter')]),
});

// ---------------------------------------------------------------------------
// Smoker and blast furnace (vanilla SmokerBlock / BlastFurnaceBlock.animateTick; the cooking is FurnaceBlockEntity's)
{
  const lit = (st: number) => blk(st).get(st, 'lit') === true;
  // the smoker puffs smoke out of its flue
  registerBehavior('smoker', {
    animateTick(level, x, y, z, st) {
      if (!lit(st)) return;
      if (Math.random() < 0.1) level.sound.play('block.smoker.smoke', x + 0.5, y, z + 0.5, 1, 1);
      level.particles.spawn?.('smoke', x + 0.5, y + 1.1, z + 0.5, 0, 0, 0);
    },
  });
  // the blast furnace's smoke curls out of the vents in its front
  registerBehavior('blast_furnace', {
    animateTick(level, x, y, z, st) {
      if (!lit(st)) return;
      if (Math.random() < 0.1) level.sound.play('block.blast_furnace.fire_crackle', x + 0.5, y, z + 0.5, 1, 1);
      const f = facingOf(st);
      const d4 = Math.random() * 0.6 - 0.3;
      const dx = DX[f] !== 0 ? DX[f] * 0.52 : d4;
      const dz = DZ[f] !== 0 ? DZ[f] * 0.52 : d4;
      level.particles.spawn?.('smoke', x + 0.5 + dx, y + (Math.random() * 9) / 16, z + 0.5 + dz, 0, 0, 0);
    },
  });
}

// ---------------------------------------------------------------------------
// Cauldrons (vanilla CauldronInteraction, AbstractCauldronBlock, LayeredCauldronBlock, LavaCauldronBlock): buckets in
// and out, leather washed clean, fire put out, lava that burns
{
  const cauldron = getBlock('cauldron'), waterCauldron = getBlock('water_cauldron'), lavaCauldron = getBlock('lava_cauldron');
  const levelOf = (st: number) => waterCauldron.get<number>(st, 'level');
  const at = (level: Level, x: number, y: number, z: number, sound: string) => level.sound.play(sound, x + 0.5, y + 0.5, z + 0.5, 1, 1);

  /** vanilla CauldronInteraction.emptyBucket: the bucket's load in, the empty bucket back */
  const emptyBucket = (level: Level, x: number, y: number, z: number, ctx: UseContext, now: number, sound: string): ItemUseResult => {
    fillHeld(ctx.player, ItemStack.of('bucket'));
    level.setBlock(x, y, z, now);
    at(level, x, y, z, sound);
    return 'success';
  };
  /** vanilla CauldronInteraction.fillBucket: the cauldron scooped out into the bucket */
  const fillBucket = (level: Level, x: number, y: number, z: number, ctx: UseContext, filled: string, sound: string): ItemUseResult => {
    fillHeld(ctx.player, ItemStack.of(filled));
    level.setBlock(x, y, z, cauldron.defaultState);
    at(level, x, y, z, sound);
    return 'success';
  };
  /** vanilla CauldronInteraction.addDefaultInteractions: any cauldron takes a water or lava bucket, whatever was in it */
  const pour = (level: Level, x: number, y: number, z: number, id: string, ctx: UseContext): ItemUseResult | null => {
    if (id === 'water_bucket') return emptyBucket(level, x, y, z, ctx, waterCauldron.state({ level: 3 }), 'item.bucket.empty');
    if (id === 'lava_bucket') return emptyBucket(level, x, y, z, ctx, lavaCauldron.defaultState, 'item.bucket.empty_lava');
    return null;
  };
  /** vanilla LayeredCauldronBlock.lowerFillLevel */
  const lowerFillLevel = (level: Level, x: number, y: number, z: number, st: number) => {
    const l = levelOf(st) - 1;
    level.setBlock(x, y, z, l === 0 ? cauldron.defaultState : waterCauldron.with(st, 'level', l));
  };
  /** vanilla AbstractCauldronBlock.isEntityInsideContent: down in whatever's in it (`top` in blocks) */
  const inContent = (e: Entity, y: number, top: number) => e.y < y + top && e.bb.maxY > y + 0.25;
  const drops = () => [ItemStack.of('cauldron')];

  /** a water bottle's contents: vanilla PotionContents.is(Potions.WATER) */
  const isWaterBottle = (s: ItemStack) => s.item.id === 'potion' && s.tag?.potion?.potion === 'water';
  registerBehavior('cauldron', {
    useItemOn(level, x, y, z, _st, stack, ctx) {
      const r = pour(level, x, y, z, stack.item.id, ctx);
      if (r) return r;
      // vanilla CauldronInteraction.EMPTY: a water bottle poured in is a third full
      if (isWaterBottle(stack)) {
        fillHeld(ctx.player, ItemStack.of('glass_bottle'));
        level.setBlock(x, y, z, waterCauldron.state({ level: 1 }));
        at(level, x, y, z, 'item.bottle.empty');
        return 'success';
      }
      return 'pass';
    },
    drops,
  });
  registerBehavior('water_cauldron', {
    useItemOn(level, x, y, z, st, stack, ctx) {
      const id = stack.item.id;
      const r = pour(level, x, y, z, id, ctx);
      if (r) return r;
      // (only a full one fills a bucket)
      if (id === 'bucket') return levelOf(st) === 3 ? fillBucket(level, x, y, z, ctx, 'water_bucket', 'item.bucket.fill') : 'pass';
      // vanilla CauldronInteraction.WATER: a glass bottle takes a third of it, a water bottle tops it up by one
      if (id === 'glass_bottle') {
        fillHeld(ctx.player, potionStack('potion', 'water'));
        lowerFillLevel(level, x, y, z, st);
        at(level, x, y, z, 'item.bottle.fill');
        return 'success';
      }
      if (isWaterBottle(stack) && levelOf(st) !== 3) {
        fillHeld(ctx.player, ItemStack.of('glass_bottle'));
        level.setBlock(x, y, z, waterCauldron.with(st, 'level', levelOf(st) + 1));
        at(level, x, y, z, 'item.bottle.empty');
        return 'success';
      }
      // vanilla CauldronInteraction.DYED_ITEM: dyed leather comes out undyed, for a level of water
      if (isDyeable(stack.item) && stack.tag?.dyedColor !== undefined) {
        delete stack.tag.dyedColor;
        delete stack.tag.dyedHidden;
        ctx.player.inventory.setSelectedItem(stack);
        lowerFillLevel(level, x, y, z, st);
        return 'success';
      }
      return 'pass';
    },
    // vanilla LayeredCauldronBlock.entityInside: a burning thing in the water is put out, and some water goes
    entityInside(level, x, y, z, st, e) {
      if (!e.isOnFire() || !inContent(e, y, cauldronContentTop(levelOf(st)) / 16)) return;
      e.clearFire();
      lowerFillLevel(level, x, y, z, st);
    },
    drops,
  });
  registerBehavior('lava_cauldron', {
    useItemOn(level, x, y, z, _st, stack, ctx) {
      const id = stack.item.id;
      const r = pour(level, x, y, z, id, ctx);
      if (r) return r;
      return id === 'bucket' ? fillBucket(level, x, y, z, ctx, 'lava_bucket', 'item.bucket.fill_lava') : 'pass';
    },
    // vanilla LavaCauldronBlock.entityInside: as bad as lava (Entity.lavaHurt)
    entityInside(_level, _x, y, _z, _st, e) {
      if (inContent(e, y, 15 / 16)) (e as unknown as { lavaHurt(): void }).lavaHurt();
    },
    drops,
  });
}

// ---------------------------------------------------------------------------
// The job sites' menus (vanilla useWithoutItem opening CartographyTableMenu, LoomMenu, StonecutterMenu, SmithingMenu,
// BrewingStandMenu, and LecternMenu for a lectern's book): the game opens whichever it has a screen for

type MenuOpener = (kind: string, x: number, y: number, z: number) => void;
let openMenu: MenuOpener | null = null;

/** the game's container screens (Game.openContainer), which open the job sites' menus by block name */
export function setVillageMenuHook(fn: MenuOpener | null): void {
  openMenu = fn;
}

for (const name of ['cartography_table', 'loom', 'stonecutter', 'smithing_table', 'brewing_stand']) {
  registerBehavior(name, {
    use(_level, x, y, z) {
      openMenu?.(name, x, y, z);
      return true;
    },
  });
}

// vanilla BrewingStandBlock.animateTick: a wisp of smoke, always
registerBehavior('brewing_stand', {
  animateTick(level, x, y, z) {
    level.particles.spawn?.('smoke', x + 0.4 + Math.random() * 0.2, y + 0.7 + Math.random() * 0.3, z + 0.4 + Math.random() * 0.2, 0, 0, 0);
  },
});

// ---------------------------------------------------------------------------
// Lectern (vanilla LecternBlock): a book and quill (or a written book) laid on it; turning its pages sends a pulse
// down into the block beneath

const lectern = getBlock('lectern');

/** vanilla LecternBlock.changePowered + updateBelow */
function lecternPowered(level: Level, x: number, y: number, z: number, st: number, on: boolean): void {
  level.setBlock(x, y, z, lectern.with(st, 'powered', on));
  level.updateNeighborsAt(x, y - 1, z, lectern.id);
}

/** vanilla LecternBlock.signalPageChange: a page turned (by the lectern's screen) — a 2-tick pulse and the rustle */
export function lecternPageTurned(level: Level, x: number, y: number, z: number): void {
  const st = level.getState(x, y, z);
  if (STATE_BLOCK[st] !== lectern.id) return;
  lecternPowered(level, x, y, z, st, true);
  level.scheduleBlockTick(x, y, z, lectern.id, 2);
  // (level event 1043)
  level.sound.play('item.book.page_turn', x + 0.5, y + 0.5, z + 0.5, 1, 1);
}

/** vanilla LecternBlockEntity.getPageCount: a signed book's pages, or a book and quill's */
export function bookPageCount(s: ItemStack | null): number {
  return s?.tag?.book?.pages.length ?? s?.tag?.pages?.length ?? 0;
}

/** vanilla LecternBlockEntity.setPage: the book opened at a page (Mth.clamp to its pages); a new page signals */
export function lecternSetPage(level: Level, be: LecternBlockEntity, page: number): void {
  const last = bookPageCount(be.book) - 1;
  const i = page < 0 ? 0 : Math.min(page, last);
  if (i === be.page) return;
  be.page = i;
  be.container.changed();
  lecternPageTurned(level, be.x, be.y, be.z);
}

/**
 * vanilla LecternMenu's Take Book button (bookAccess.removeItemNoUpdate, onBookItemRemove → LecternBlock.resetBookState):
 * the book comes off, the lectern shows none and stops powering
 */
export function lecternTakeBook(level: Level, be: LecternBlockEntity): ItemStack | null {
  const s = be.book;
  be.container.items[0] = null;
  be.page = 0;
  be.container.changed();
  const st = level.getState(be.x, be.y, be.z);
  if (STATE_BLOCK[st] === lectern.id) {
    level.setBlock(be.x, be.y, be.z, lectern.with(lectern.with(st, 'powered', false), 'has_book', false));
    level.updateNeighborsAt(be.x, be.y - 1, be.z, lectern.id);
  }
  return s;
}

/**
 * vanilla LecternBlock.getAnalogOutputSignal (LecternBlockEntity.getRedstoneSignal): how far through its book the
 * lectern is open, 1 on the first page to 15 on the last, 0 with no book. For a comparator (none in the game yet)
 */
export function lecternAnalogOutput(level: Level, x: number, y: number, z: number): number {
  const st = level.getState(x, y, z);
  if (STATE_BLOCK[st] !== lectern.id || !lectern.get(st, 'has_book')) return 0;
  const be = level.world.getBlockEntity(x, y, z);
  if (!(be instanceof LecternBlockEntity)) return 0;
  const n = bookPageCount(be.book);
  const f = n > 1 ? be.page / (n - 1) : 1;
  return Math.floor(f * 14) + (be.book ? 1 : 0);
}

{
  const LECTERN_BOOKS = new Set(['writable_book', 'written_book']);
  registerBehavior('lectern', {
    // vanilla LecternBlock.useItemOn / tryPlaceBook / placeBook: a book goes on an empty lectern; anything else is
    // the item's business
    useItemOn(level, x, y, z, st, stack, ctx) {
      if (lectern.get(st, 'has_book')) return 'pass';
      if (!LECTERN_BOOKS.has(stack.item.id)) return 'skip';
      const be = level.world.getBlockEntity(x, y, z);
      if (be instanceof LecternBlockEntity) {
        be.setBook(stack.copyWithCount(1));
        consumeHeld(ctx.player);
        // vanilla resetBookState
        level.setBlock(x, y, z, lectern.with(lectern.with(st, 'powered', false), 'has_book', true));
        level.updateNeighborsAt(x, y - 1, z, lectern.id);
        level.sound.play('item.book.put', x + 0.5, y + 0.5, z + 0.5, 1, 1);
      }
      return 'success';
    },
    // vanilla LecternBlock.useWithoutItem: its book opens to be read; without one the click is simply spent
    use(_level, x, y, z, st) {
      if (!lectern.get(st, 'has_book')) return 'consume';
      openMenu?.('lectern', x, y, z);
      return true;
    },
    tick(level, x, y, z, st) {
      lecternPowered(level, x, y, z, st, false);
    },
    isSignalSource: () => true,
    getSignal: (_w, _x, _y, _z, st) => (lectern.get(st, 'powered') ? 15 : 0),
    getDirectSignal: (_w, _x, _y, _z, st, dir) => (dir === UP && lectern.get(st, 'powered') ? 15 : 0),
    // (vanilla popBook: the book comes off with the lectern — here it is its block entity's one slot, spilt with it)
    onRemove(level, x, y, z, st, now) {
      if (STATE_BLOCK[now] !== lectern.id && lectern.get(st, 'powered')) level.updateNeighborsAt(x, y - 1, z, lectern.id);
    },
  });
}

// ---------------------------------------------------------------------------
// Flower pot (vanilla FlowerPotBlock): a plant goes into an empty pot, and comes back out into the hand

{
  /** vanilla POTTED_BY_CONTENT: the plant's block name → its potted block */
  const pottedBy = new Map<string, Block>();
  for (const plant of POTTABLE) {
    const potted = BLOCK_BY_NAME.get(pottedName(plant));
    if (potted) pottedBy.set(plant, potted);
  }
  const pottedFor = (stack: ItemStack): Block | undefined => {
    const b = blockForItem(stack.item);
    return b && pottedBy.get(b.name);
  };
  registerBehavior('flower_pot', {
    // vanilla useItemOn: a plant (its block item) goes in, one from the hand
    useItemOn(level, x, y, z, _st, stack, ctx) {
      const potted = pottedFor(stack);
      if (!potted) return 'pass';
      level.setBlock(x, y, z, potted.defaultState);
      consumeHeld(ctx.player);
      return 'success';
    },
    // vanilla useWithoutItem: nothing to take out of an empty pot, but the click is spent
    use: () => 'consume',
  });
  const pot = getBlock('flower_pot');
  for (const [plant, potted] of pottedBy) {
    registerBehavior(potted.name, {
      // a full pot takes no second plant; anything else lets the plant be taken out
      useItemOn: (_level, _x, _y, _z, _st, stack) => (pottedFor(stack) ? 'consume' : 'pass'),
      // vanilla useWithoutItem: the plant comes out into the inventory (or drops at the player's feet if it's full)
      use(level, x, y, z, _st, ctx) {
        const p = ctx.player;
        const stack = ItemStack.of(plant);
        const left = p.inventory.add(stack, p.gameMode === 'creative');
        if (left > 0) p.dropItem(stack.copyWithCount(left), false);
        level.setBlock(x, y, z, pot.defaultState);
        return true;
      },
      // vanilla createPotFlowerItemTable: the pot and its plant
      drops: () => [ItemStack.of('flower_pot'), ItemStack.of(plant)],
    });
  }
}

// ---------------------------------------------------------------------------
// Campfire (vanilla CampfireBlock): lit as it's placed (unless in water), a signal fire over a hay bale, hurts what
// stands in it; put out by water or a shovel, lit again by flint and steel, a fire charge or a burning arrow

const CAMPFIRES = new Set(['campfire', 'soul_campfire']);

/** vanilla CampfireBlock.canLight: a campfire that is out, and not under water */
function canLight(st: number): boolean {
  const b = blk(st);
  return CAMPFIRES.has(b.name) && !b.get(st, 'waterlogged') && !b.get(st, 'lit');
}

/** vanilla CampfireBlock.dowse: the smoke of it going out (and what was cooking would fall off) */
function dowse(level: Level, x: number, y: number, z: number, st: number): void {
  const signal = !!blk(st).get(st, 'signal_fire');
  for (let i = 0; i < 20; i++) campfireSmoke(level, x, y, z, signal, true);
}

/** vanilla FlintAndSteelItem / FireChargeItem.useOn: a campfire that is out is lit where it stands; false if it can't be */
export function lightCampfire(level: Level, x: number, y: number, z: number): boolean {
  const st = level.getState(x, y, z);
  if (!canLight(st)) return false;
  level.setBlock(x, y, z, blk(st).with(st, 'lit', true));
  return true;
}

/** vanilla ShovelItem.useOn: a lit campfire is put out with a hiss; false if there's none to put out */
export function dowseCampfire(level: Level, x: number, y: number, z: number): boolean {
  const st = level.getState(x, y, z);
  const b = blk(st);
  if (!CAMPFIRES.has(b.name) || !b.get(st, 'lit')) return false;
  // (vanilla levelEvent 1009)
  level.sound.play('block.fire.extinguish', x + 0.5, y + 0.5, z + 0.5, 0.5, 2.6 + (Math.random() - Math.random()) * 0.8);
  dowse(level, x, y, z, st);
  level.setBlock(x, y, z, b.with(st, 'lit', false));
  return true;
}

for (const name of CAMPFIRES) {
  const b = getBlock(name);
  const soul = name === 'soul_campfire';
  /** vanilla CampfireBlock.isSmokeSource: a hay bale underneath makes it a signal fire */
  const smokeSource = (st: number) => blk(st).name === 'hay_block';
  /** vanilla Projectile.mayInteract: a mob's projectile changes blocks only while mobs may grief */
  const mayInteract = (level: Level, projectile: Entity) => {
    const owner = (projectile as Entity & { owner?: Entity | null }).owner;
    return !owner || owner.type === 'player' || !!level.gameRules.mobGriefing;
  };
  registerBehavior(name, {
    // vanilla getStateForPlacement: facing the way the player looks, out if it goes into water
    placement(ctx: PlaceContext) {
      const here = ctx.world.getState(ctx.x, ctx.y, ctx.z);
      const water = blk(here).name === 'water' && blk(here).get(here, 'level') === 0;
      const signal = smokeSource(ctx.world.getState(ctx.x, ctx.y - 1, ctx.z));
      return b.state({ waterlogged: water, signal_fire: signal, lit: !water, facing: DIR_NAMES[dirFromYaw(ctx.yaw)] });
    },
    // vanilla updateShape: the hay underneath comes and goes
    updateShape(world, x, y, z, st) {
      return b.with(st, 'signal_fire', smokeSource(world.getState(x, y - 1, z)));
    },
    // vanilla entityInside: a lit one burns (twice as hard for soul fire) whatever living thing stands in it
    entityInside(_level, _x, _y, _z, st, e) {
      if (b.get(st, 'lit') && e instanceof LivingEntity) e.hurt(soul ? 2 : 1, 'campfire');
    },
    // vanilla animateTick: now and then a crackle; the ordinary campfire spits embers
    animateTick(level, x, y, z, st) {
      if (!b.get(st, 'lit')) return;
      if (Math.random() < 0.1) level.sound.play('block.campfire.crackle', x + 0.5, y + 0.5, z + 0.5, 0.5 + Math.random(), Math.random() * 0.7 + 0.6);
      if (!soul && Math.random() < 0.2) level.particles.spawn?.('lava', x + 0.5, y + 0.5, z + 0.5, Math.random() / 2, 5e-5, Math.random() / 2);
    },
    // vanilla onProjectileHit: a burning arrow or a fireball lights it
    projectileHit(level, x, y, z, st, _hit, projectile) {
      const burning = projectile.isOnFire() || projectile.type === 'fireball' || projectile.type === 'small_fireball';
      if (burning && mayInteract(level, projectile) && canLight(st)) level.setBlock(x, y, z, b.with(st, 'lit', true));
    },
    // vanilla placeLiquid: water poured on puts it out, and stays in it
    placeLiquid(level, x, y, z, st) {
      if (b.get(st, 'waterlogged')) return false;
      if (b.get(st, 'lit')) {
        level.sound.play('entity.generic.extinguish_fire', x + 0.5, y + 0.5, z + 0.5, 1, 1);
        dowse(level, x, y, z, st);
      }
      level.setBlock(x, y, z, b.with(b.with(st, 'waterlogged', true), 'lit', false));
      return true;
    },
    // vanilla block loot: itself with silk touch, else two charcoal (or the soul campfire's soul soil)
    drops(_st, _tool, _r, silk) {
      if (silk) return [ItemStack.of(name)];
      return soul ? [ItemStack.of('soul_soil')] : [ItemStack.of('charcoal', 2)];
    },
  });
}
