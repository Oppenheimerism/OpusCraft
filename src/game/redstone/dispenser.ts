// The dispenser and dropper (vanilla DispenserBlock, DropperBlock, DispenserBlockEntity): nine slots; power reaching
// it (or the block above it: quasi-connectivity) triggers it, and four ticks later it takes a random stack and uses
// one of it the way that item is dispensed (dispenseItems.ts) — a dropper just drops it, or puts it into the
// container it faces. Empty, it clicks. Right-click opens its 3x3 inventory.

import { BLOCKS, STATE_BLOCK, getBlock, type Block } from '../../world/block';
import { DX, DY, DZ, DIR_NAMES, OPPOSITE, UP, DOWN, type Dir } from '../../world/dir';
import { BlockEntity, ChestBlockEntity, FurnaceBlockEntity, BrewingStandBlockEntity, registerBlockEntityType } from '../../world/blockEntity';
import type { Container } from '../../inventory/container';
import { fuelTime } from '../../inventory/recipes';
import { isBrewingIngredient } from '../../item/potions';
import { ItemStack } from '../../item/item';
import { AABB } from '../../core/aabb';
import type { Rand } from '../../core/rng';
import { fillContainer } from '../loot';
import { registerBehavior } from '../blockBehavior';
import { lookingDirections } from '../blockRules';
import { hasNeighborSignal } from './signal';
import { composterInsert, composterFillEffects, isCompostable } from '../villageBlocks';
import { AbstractMinecartContainer } from '../../entity/minecart';
import { ChestBoat } from '../../entity/boat';
import { dispenseBehaviorFor, DEFAULT_DISPENSE, failClick, type DispenseSource } from './dispenseItems';
import type { Level } from '../level';
import type { Player } from '../../entity/player';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];
const facingOf = (st: number): Dir => DIR_NAMES.indexOf(blk(st).get<string>(st, 'facing') as (typeof DIR_NAMES)[number]) as Dir;

/** vanilla TRIGGER_DURATION */
const TRIGGER_DURATION = 4;

/** vanilla DispenserBlockEntity / DropperBlockEntity: nine slots, and a loot table rolled into them when first needed */
export class DispenserBlockEntity extends BlockEntity {
  /** vanilla LootTable / LootTableSeed */
  lootTable: string | null = null;
  lootSeed = 0;
  constructor(x: number, y: number, z: number, readonly id: 'dispenser' | 'dropper') {
    super(x, y, z, 9);
  }
  override unpackLoot(): void {
    if (!this.lootTable) return;
    const table = this.lootTable;
    this.lootTable = null;
    fillContainer(this.container, table, this.lootSeed);
  }
  /** vanilla getRandomSlot: each filled slot as likely as the next (reservoir sampling), -1 when all are empty */
  randomSlot(r: Rand): number {
    this.unpackLoot();
    let i = -1, j = 1;
    for (let k = 0; k < this.container.size; k++) {
      const s = this.container.get(k);
      if (s && s.count > 0 && r.nextInt(j++) === 0) i = k;
    }
    return i;
  }
  /** vanilla addItem: into the first empty slot; that slot, or -1 when there's none */
  addItem(s: ItemStack): number {
    for (let i = 0; i < this.container.size; i++)
      if (!this.container.get(i)) {
        this.container.set(i, s);
        return i;
      }
    return -1;
  }
  protected override saveData(): Record<string, number | string> | undefined {
    return this.lootTable ? { lootTable: this.lootTable, lootSeed: this.lootSeed } : undefined;
  }
  protected override loadData(d: Record<string, number | string>): void {
    if (typeof d.lootTable === 'string') {
      this.lootTable = d.lootTable;
      this.lootSeed = Number(d.lootSeed ?? 0);
    }
  }
}

registerBlockEntityType('dispenser', (x, y, z) => new DispenserBlockEntity(x, y, z, 'dispenser'));
registerBlockEntityType('dropper', (x, y, z) => new DispenserBlockEntity(x, y, z, 'dropper'));

// ---------------------------------------------------------------------------
// Where a dropper puts things (vanilla HopperBlockEntity.getContainerAt and addItem)

/** a container as a hopper or dropper sees it: its slots, which of them a face takes, and what they take */
// (trial chambers: exported for the crafter)
export interface InsertTarget {
  container: Container;
  /** vanilla WorldlyContainer.getSlotsForFace (null: all of them) */
  slotsFor?(face: Dir): number[];
  /** vanilla canPlaceItem / canPlaceItemThroughFace (`face` null: an item entity's stack, which comes in by no face) */
  canPlace?(slot: number, s: ItemStack, face: Dir | null): boolean;
  /** vanilla canTakeItem / canTakeItemThroughFace: a hopper under it (`into`) may take this out */
  canTake?(slot: number, s: ItemStack, face: Dir, into: InsertTarget): boolean;
  /** after something went in (vanilla setChanged) */
  changed?(): void;
  /**
   * (hoppers) vanilla tryMoveInItem's `to instanceof HopperBlockEntity`: something went into it while it was empty,
   * from `from` (null: not from a container)
   */
  filledFromEmpty?(from: InsertTarget | null): void;
  /** (hoppers) vanilla HopperBlockEntity.tickedGameTime, when it is a hopper */
  tickedGameTime?(): number;
}

/** vanilla AbstractFurnaceBlockEntity: in from the top, fuel from the sides, the result out of the bottom */
function furnaceTarget(be: FurnaceBlockEntity): InsertTarget {
  const c = be.container;
  return {
    container: c,
    slotsFor: (face) => (face === DOWN ? [2, 1] : face === UP ? [0] : [1]),
    canPlace: (slot, s) => slot === 0 || (slot === 1 && (fuelTime(s) > 0 || (s.item.id === 'bucket' && c.get(1)?.item.id !== 'bucket'))),
    // (vanilla canTakeItemThroughFace: out of the bottom, only an emptied bucket from the fuel slot)
    canTake: (slot, s, face) => !(face === DOWN && slot === 1) || s.item.id === 'water_bucket' || s.item.id === 'bucket',
  };
}

/** vanilla BrewingStandBlockEntity: the ingredient from the top, bottles (and from the sides blaze powder) round about */
function brewingTarget(be: BrewingStandBlockEntity): InsertTarget {
  const c = be.container;
  const bottle = /^(potion|splash_potion|lingering_potion|glass_bottle)$/;
  return {
    container: c,
    slotsFor: (face) => (face === UP ? [3] : face === DOWN ? [0, 1, 2, 3] : [0, 1, 2, 4]),
    canPlace: (slot, s) => (slot === 3 ? isBrewingIngredient(s) : slot === 4 ? s.item.id === 'blaze_powder' : bottle.test(s.item.id) && !c.get(slot)),
    // (vanilla canTakeItemThroughFace: the ingredient slot gives up only a bottle left in it)
    canTake: (slot, s) => slot !== 3 || s.item.id === 'glass_bottle',
  };
}

/**
 * vanilla ComposterBlock.getContainer: below 7, one compostable thing from above goes straight into the compost
 * (InputContainer, level event 1500); at 7 there's no room and when ready nothing goes in, but it's still the
 * composter's (the dropper keeps its item). Ready, its bone meal can be taken out of the bottom (OutputContainer),
 * which empties it
 */
function composterTarget(level: Level, x: number, y: number, z: number, st: number): InsertTarget {
  const lvl = blk(st).get<number>(st, 'level');
  if (lvl === 8) {
    let taken = false;
    const out: (ItemStack | null)[] = [ItemStack.of('bone_meal')];
    return {
      container: { size: 1, get: (i) => out[i] ?? null, set: (i, s) => void (out[i] = s), changed() {} },
      slotsFor: (face) => (face === DOWN ? [0] : []),
      canPlace: () => false,
      canTake: (_i, s, face) => !taken && face === DOWN && s.item.id === 'bone_meal',
      // vanilla OutputContainer.setChanged: ComposterBlock.empty
      changed() {
        if (taken) return;
        taken = true;
        const now = blk(st).with(st, 'level', 0);
        level.setBlock(x, y, z, now);
        level.gameEvent('block_change', x + 0.5, y + 0.5, z + 0.5, { state: now });
      },
    };
  }
  const slot: (ItemStack | null)[] = [null];
  let changed = false;
  const container: Container = {
    size: lvl === 7 ? 0 : 1,
    maxStackSize: 1,
    get: (i) => slot[i] ?? null,
    set: (i, s) => void (slot[i] = s),
    changed() {},
  };
  return {
    container,
    canPlace: (_i, s, face) => lvl < 7 && !changed && face === UP && isCompostable(s.item.id),
    canTake: () => false,
    changed() {
      const s = slot[0];
      if (!s || changed) return;
      changed = true;
      const now = composterInsert(level, x, y, z, st, s);
      composterFillEffects(level, x, y, z, now, now !== st);
      slot[0] = null;
    },
  };
}

/** vanilla getEntityContainer: a chest minecart ((minecarts) or hopper minecart) or chest boat there (one at random) */
function entityTarget(level: Level, x: number, y: number, z: number): InsertTarget | null {
  const found = level.getEntities(new AABB(x, y, z, x + 1, y + 1, z + 1), (e) => (e instanceof AbstractMinecartContainer || e instanceof ChestBoat) && !e.removed);
  if (!found.length) return null;
  const e = found[level.random.nextInt(found.length)] as AbstractMinecartContainer | ChestBoat;
  // (vanilla ContainerEntity.setChestVehicleItem: its loot is rolled first)
  e.unpackLoot();
  return { container: e.container };
}

/**
 * (trial chambers) the block entities kept elsewhere that hoppers and droppers put things into (the crafter; the
 * hopper, shulker boxes and decorated pots: game/redstone/hopper.ts)
 */
export const CONTAINER_TARGETS: ((be: BlockEntity, level: Level) => InsertTarget | null)[] = [];

/** vanilla HopperBlockEntity.getContainerAt: the block's container (or composter), else a container entity there */
export function containerAt(level: Level, x: number, y: number, z: number): InsertTarget | null {
  const st = level.getState(x, y, z);
  if (blk(st).name === 'composter') return composterTarget(level, x, y, z, st);
  const be = level.world.getBlockEntity(x, y, z);
  // (vanilla RandomizableContainer.getItem: a structure's chest has its loot rolled when a hopper or dropper gets at it)
  be?.unpackLoot();
  // (trial chambers; hoppers) the ones kept elsewhere first: a shulker box is a barrel of sorts here
  if (be) for (const f of CONTAINER_TARGETS) {
    const t = f(be, level);
    if (t) return t;
  }
  if (be instanceof ChestBlockEntity || be instanceof DispenserBlockEntity) return { container: be.container };
  if (be instanceof FurnaceBlockEntity) return furnaceTarget(be);
  if (be instanceof BrewingStandBlockEntity) return brewingTarget(be);
  return entityTarget(level, x, y, z);
}

/** vanilla Container.isEmpty */
function isEmptyContainer(c: Container): boolean {
  for (let i = 0; i < c.size; i++) if (c.get(i)) return false;
  return true;
}

/** vanilla getSlots: the slots of `target` open toward `face` */
export function slotsOf(target: InsertTarget, face: Dir): number[] {
  return target.slotsFor?.(face) ?? [...Array(target.container.size).keys()];
}

/** vanilla isFullContainer: every slot open toward `face` holds all it can */
export function isFullContainer(target: InsertTarget, face: Dir): boolean {
  const c = target.container;
  for (const i of slotsOf(target, face)) {
    const s = c.get(i);
    if (!s || s.count < Math.min(s.maxStack, c.maxStackSize ?? 64)) return false;
  }
  return true;
}

/**
 * vanilla HopperBlockEntity.tryTakeInItemFromSlot: one of what's in `source`'s slot moved into `into` (out through
 * the source's bottom), if it may come out and there's room for it; true if it moved
 */
export function takeOneFrom(source: InsertTarget, slot: number, into: InsertTarget): boolean {
  const s = source.container.get(slot);
  if (!s || s.count <= 0) return false;
  if (source.canTake && !source.canTake(slot, s, DOWN, into)) return false;
  if (insertItem(into, s.copyWithCount(1), null, source)) return false;
  if (s.count <= 1) source.container.set(slot, null);
  else {
    s.count--;
    source.container.changed();
  }
  source.changed?.();
  return true;
}

/**
 * vanilla HopperBlockEntity.addItem / tryMoveInItem: into the slots that face takes (all of them with no face),
 * merging, then an empty one; what's left. `from`: the container it comes out of (a hopper's timing goes by it)
 */
export function insertItem(target: InsertTarget, stack: ItemStack, face: Dir | null, from: InsertTarget | null = null): ItemStack | null {
  const c = target.container;
  const slots = (face !== null && target.slotsFor?.(face)) || [...Array(c.size).keys()];
  let s: ItemStack | null = stack;
  for (const i of slots) {
    if (!s || s.count <= 0) break;
    if (target.canPlace && !target.canPlace(i, s, face)) continue;
    const there = c.get(i);
    const wasEmpty = target.filledFromEmpty ? isEmptyContainer(c) : false;
    let moved = false;
    if (!there) {
      c.set(i, s);
      s = null;
      moved = true;
    } else if (there.sameItem(s) && there.count <= there.maxStack) {
      const n = Math.min(s.count, Math.min(there.maxStack, c.maxStackSize ?? 64) - there.count);
      if (n > 0) {
        s.count -= n;
        there.count += n;
        moved = true;
      }
    }
    if (moved) {
      if (wasEmpty) target.filledFromEmpty!(from);
      c.changed();
      target.changed?.();
    }
  }
  return s && s.count > 0 ? s : null;
}

// ---------------------------------------------------------------------------
// The blocks

/** vanilla DispenserBlock.dispenseFrom */
function dispenseFrom(level: Level, x: number, y: number, z: number, st: number): void {
  const be = level.world.getBlockEntity(x, y, z);
  if (!(be instanceof DispenserBlockEntity)) return;
  const src: DispenseSource = { level, x, y, z, facing: facingOf(st), be, success: true };
  const i = be.randomSlot(level.random);
  if (i < 0) {
    failClick(src);
    // (an empty dispenser's click is a game event)
    level.gameEvent('block_activate', x + 0.5, y + 0.5, z + 0.5, { state: st });
    return;
  }
  const stack = be.container.get(i)!;
  be.container.set(i, dispenseBehaviorFor(stack)(src, stack));
}

/** vanilla DropperBlock.dispenseFrom: into the container in front (one item, none if it won't go), else dropped */
function dropFrom(level: Level, x: number, y: number, z: number, st: number): void {
  const be = level.world.getBlockEntity(x, y, z);
  if (!(be instanceof DispenserBlockEntity)) return;
  const facing = facingOf(st);
  const src: DispenseSource = { level, x, y, z, facing, be, success: true };
  const i = be.randomSlot(level.random);
  if (i < 0) {
    failClick(src);
    return;
  }
  const stack = be.container.get(i)!;
  const target = containerAt(level, x + DX[facing], y + DY[facing], z + DZ[facing]);
  let rest: ItemStack | null;
  if (!target) rest = DEFAULT_DISPENSE(src, stack);
  else {
    const left = insertItem(target, stack.copyWithCount(1), OPPOSITE[facing] as Dir);
    rest = stack.copy();
    if (!left) rest.count--;
  }
  be.container.set(i, rest && rest.count > 0 ? rest : null);
}

type MenuOpener = (be: DispenserBlockEntity, player: Player) => void;
let openMenu: MenuOpener | null = null;

/** the game's screens (gui/screens/dispenser.ts): how a dispenser's or dropper's inventory is opened */
export function setDispenserMenuHook(fn: MenuOpener | null): void {
  openMenu = fn;
}

for (const kind of ['dispenser', 'dropper'] as const) {
  let block: Block | null = null;
  const b = () => (block ??= getBlock(kind));
  registerBehavior(kind, {
    // vanilla getStateForPlacement: facing the player (the way they look, turned round)
    placement: (ctx) => b().state({ facing: DIR_NAMES[OPPOSITE[lookingDirections(ctx.yaw, ctx.pitch)[0]]] }),
    // vanilla neighborChanged: power here or just above triggers it (once, until the power goes)
    neighborChanged(level, x, y, z, st) {
      const w = level.world;
      const on = hasNeighborSignal(w, x, y, z) || hasNeighborSignal(w, x, y + 1, z);
      const was = b().get(st, 'triggered') === true;
      if (on && !was) {
        level.scheduleBlockTick(x, y, z, b().id, TRIGGER_DURATION);
        level.setBlock(x, y, z, b().with(st, 'triggered', true), 2);
      } else if (!on && was) level.setBlock(x, y, z, b().with(st, 'triggered', false), 2);
    },
    tick(level, x, y, z, st) {
      if (kind === 'dispenser') dispenseFrom(level, x, y, z, st);
      else dropFrom(level, x, y, z, st);
    },
    // vanilla useWithoutItem: its inventory (the loot table rolled first)
    use(level, x, y, z, _st, ctx) {
      const be = level.world.getBlockEntity(x, y, z);
      if (!(be instanceof DispenserBlockEntity)) return false;
      be.unpackLoot();
      openMenu?.(be, ctx.player);
      return true;
    },
  });
}
