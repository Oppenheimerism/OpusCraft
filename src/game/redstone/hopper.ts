// The hopper (vanilla HopperBlock, HopperBlockEntity): five slots. Once its 8-tick cooldown is up it passes one item
// on into the container it points into, and takes one out of the container above it, or picks up what lies in its
// bowl or on it; either sets the cooldown going again. Power switches it off (`enabled`). Right-click opens it.
// Where it puts things and takes them from is dispenser.ts's "container as a hopper or dropper sees it".

import { STATE_BLOCK, COLLISION, getBlock, type Block } from '../../world/block';
import { DX, DY, DZ, DIR_NAMES, OPPOSITE, UP, DOWN, type Dir } from '../../world/dir';
import { BlockEntity, registerBlockEntityType } from '../../world/blockEntity';
import { ShulkerBoxBlockEntity } from '../../world/shulkerBoxEntity';
import { isShulkerBox } from '../../world/blocksShulker';
import { ItemEntity } from '../../entity/itemEntity';
import type { Entity } from '../../entity/entity';
import { AABB } from '../../core/aabb';
import { fillContainer } from '../loot';
import { registerBehavior } from '../blockBehavior';
import { DecoratedPotBlockEntity } from '../decoratedPot';
import { hasNeighborSignal } from './signal';
import { containerAt, insertItem, isFullContainer, slotsOf, takeOneFrom, CONTAINER_TARGETS, type InsertTarget } from './dispenser';
import type { Level } from '../level';
import type { Player } from '../../entity/player';

let HOPPER: Block | null = null;
const hopper = (): Block => (HOPPER ??= getBlock('hopper'));

/** vanilla HopperBlockEntity.MOVE_ITEM_SPEED */
export const MOVE_ITEM_SPEED = 8;

/** vanilla Hopper.SUCK_AABB: the bowl and the block above it, where it picks up items */
const SUCK_MIN_Y = 11 / 16, SUCK_MAX_Y = 2;

/** vanilla HopperBlockEntity: five slots, the cooldown between moves, and a loot table rolled into them when first needed */
export class HopperBlockEntity extends BlockEntity {
  readonly id = 'hopper';
  /** vanilla cooldownTime (TransferCooldown): ticks till it may move something again */
  cooldownTime = -1;
  /** vanilla tickedGameTime: the game time it last ticked */
  tickedGameTime = 0;
  /** vanilla LootTable / LootTableSeed */
  lootTable: string | null = null;
  lootSeed = 0;
  /** the hopper as a container things go into (vanilla tryMoveInItem's hopper case: filled from empty, it waits) */
  readonly target: InsertTarget;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 5);
    this.target = {
      container: this.container,
      filledFromEmpty: (from) => {
        // (vanilla isOnCustomCooldown: a longer wait than a move's is left alone)
        if (this.cooldownTime > MOVE_ITEM_SPEED) return;
        // (from a hopper that ticks after this one this tick: a tick less, so the two stay in step)
        const k = from?.tickedGameTime && this.tickedGameTime >= from.tickedGameTime() ? 1 : 0;
        this.cooldownTime = MOVE_ITEM_SPEED - k;
      },
      tickedGameTime: () => this.tickedGameTime,
    };
  }
  override unpackLoot(): void {
    if (!this.lootTable) return;
    const table = this.lootTable;
    this.lootTable = null;
    fillContainer(this.container, table, this.lootSeed);
  }
  /** vanilla isOnCooldown */
  isOnCooldown(): boolean {
    return this.cooldownTime > 0;
  }
  /** vanilla inventoryFull: every slot holds a full stack */
  inventoryFull(): boolean {
    for (let i = 0; i < 5; i++) {
      const s = this.container.get(i);
      if (!s || s.count !== s.maxStack) return false;
    }
    return true;
  }
  isEmpty(): boolean {
    for (let i = 0; i < 5; i++) if (this.container.get(i)) return false;
    return true;
  }
  /** vanilla pushItemsTick: the cooldown runs down; once it's out, it tries to move something */
  override tick(level: Level): void {
    this.cooldownTime--;
    this.tickedGameTime = level.gameTime;
    if (this.isOnCooldown()) return;
    this.cooldownTime = 0;
    tryMoveItems(level, this, () => suckInItems(level, this));
  }
  protected override saveData(): Record<string, number | string> | undefined {
    const d: Record<string, number | string> = { TransferCooldown: this.cooldownTime };
    if (this.lootTable) Object.assign(d, { lootTable: this.lootTable, lootSeed: this.lootSeed });
    return d;
  }
  protected override loadData(d: Record<string, number | string>): void {
    this.cooldownTime = Number(d.TransferCooldown ?? -1);
    if (typeof d.lootTable === 'string') {
      this.lootTable = d.lootTable;
      this.lootSeed = Number(d.lootSeed ?? 0);
    }
  }
}

registerBlockEntityType('hopper', (x, y, z) => new HopperBlockEntity(x, y, z));

// what hoppers (and droppers) see of the block entities that aren't a plain chest's: the hopper itself; a shulker box,
// which won't take another shulker box (vanilla ShulkerBoxBlockEntity.canPlaceItemThroughFace); a decorated pot's
// one slot
CONTAINER_TARGETS.push((be) => {
  if (be instanceof HopperBlockEntity) return be.target;
  if (be instanceof ShulkerBoxBlockEntity) return { container: be.container, canPlace: (_i, s) => !isShulkerBox(s.item.id) };
  if (be instanceof DecoratedPotBlockEntity) return { container: be.container };
  return null;
});

const facingOf = (st: number): Dir => DIR_NAMES.indexOf(hopper().get<string>(st, 'facing') as (typeof DIR_NAMES)[number]) as Dir;

/**
 * vanilla tryMoveItems: off cooldown and enabled, it passes one thing on (if it holds any) and takes one in (if it
 * has room: `take`); if either happened, the cooldown starts again
 */
function tryMoveItems(level: Level, be: HopperBlockEntity, take: () => boolean): boolean {
  if (be.isOnCooldown()) return false;
  const st = level.getState(be.x, be.y, be.z);
  if (STATE_BLOCK[st] !== hopper().id || !hopper().get(st, 'enabled')) return false;
  let moved = false;
  if (!be.isEmpty()) moved = ejectItems(level, be, st);
  if (!be.inventoryFull()) moved = take() || moved;
  if (!moved) return false;
  be.cooldownTime = MOVE_ITEM_SPEED;
  // (vanilla setChanged: the chunk is saved with its cooldown)
  const c = level.world.getChunk(be.x >> 4, be.z >> 4);
  if (c) c.modified = true;
  return true;
}

/** vanilla ejectItems: one of the first stack that fits into the container it points into */
function ejectItems(level: Level, be: HopperBlockEntity, st: number): boolean {
  const d = facingOf(st);
  const target = containerAt(level, be.x + DX[d], be.y + DY[d], be.z + DZ[d]);
  if (!target) return false;
  const face = OPPOSITE[d] as Dir;
  if (isFullContainer(target, face)) return false;
  for (let i = 0; i < 5; i++) {
    const s = be.container.get(i);
    if (!s) continue;
    if (insertItem(target, s.copyWithCount(1), face, be.target)) continue;
    if (s.count <= 1) be.container.set(i, null);
    else {
      s.count--;
      be.container.changed();
    }
    return true;
  }
  return false;
}

/** vanilla BlockState.isCollisionShapeFullBlock */
function fullBlock(st: number): boolean {
  const c = COLLISION[st];
  return !!c && c.length === 1 && c[0][0] <= 0 && c[0][1] <= 0 && c[0][2] <= 0 && c[0][3] >= 1 && c[0][4] >= 1 && c[0][5] >= 1;
}

/** vanilla getItemsAtAndAbove: the items lying in its bowl or on the block above */
function itemsAbove(level: Level, be: HopperBlockEntity): ItemEntity[] {
  const box = new AABB(be.x, be.y + SUCK_MIN_Y, be.z, be.x + 1, be.y + SUCK_MAX_Y, be.z + 1);
  return level.getEntities(box, (e) => e instanceof ItemEntity && !e.removed) as ItemEntity[];
}

/** vanilla addItem(Container, ItemEntity): as much of the item's stack as it has room for; true if it took it all */
function takeItemEntity(be: HopperBlockEntity, e: ItemEntity): boolean {
  const left = insertItem(be.target, e.stack.copy(), null);
  if (!left) {
    e.stack.count = 0;
    e.remove();
    return true;
  }
  e.stack = left;
  return false;
}

/**
 * vanilla suckInItems: one thing from the container above (out of its bottom); with none there, and the block above
 * not a full one, an item lying on it
 */
function suckInItems(level: Level, be: HopperBlockEntity): boolean {
  const source = containerAt(level, be.x, be.y + 1, be.z);
  if (source) {
    for (const i of slotsOf(source, DOWN)) if (takeOneFrom(source, i, be.target)) return true;
    return false;
  }
  if (fullBlock(level.getState(be.x, be.y + 1, be.z))) return false;
  for (const e of itemsAbove(level, be)) if (takeItemEntity(be, e)) return true;
  return false;
}

type MenuOpener = (be: HopperBlockEntity, player: Player) => void;
let openMenu: MenuOpener | null = null;

/** the game's screens (gui/screens/dispenser.ts): how a hopper's inventory is opened */
export function setHopperMenuHook(fn: MenuOpener | null): void {
  openMenu = fn;
}

/** vanilla checkPoweredState: power anywhere round it switches it off */
function checkPoweredState(level: Level, x: number, y: number, z: number, st: number): void {
  const enabled = !hasNeighborSignal(level.world, x, y, z);
  if (enabled !== hopper().get(st, 'enabled')) level.setBlock(x, y, z, hopper().with(st, 'enabled', enabled), 2);
}

registerBehavior('hopper', {
  // vanilla getStateForPlacement: into the block clicked, or down when that was above or below
  placement(ctx) {
    const d = OPPOSITE[ctx.face] as Dir;
    return hopper().state({ facing: d === UP || d === DOWN ? 'down' : DIR_NAMES[d], enabled: true });
  },
  onPlace(level, x, y, z, st, old) {
    if (STATE_BLOCK[old] !== STATE_BLOCK[st]) checkPoweredState(level, x, y, z, st);
  },
  neighborChanged(level, x, y, z, st) {
    checkPoweredState(level, x, y, z, st);
  },
  // vanilla useWithoutItem: its inventory (the loot table rolled first)
  use(level, x, y, z, _st, ctx) {
    const be = level.world.getBlockEntity(x, y, z);
    if (!(be instanceof HopperBlockEntity)) return false;
    be.unpackLoot();
    openMenu?.(be, ctx.player);
    return true;
  },
  // vanilla HopperBlock.entityInside / HopperBlockEntity.entityInside: an item fallen into the bowl goes in at once
  entityInside(level, x, y, z, st, e: Entity) {
    if (!(e instanceof ItemEntity) || e.removed || !e.stack || e.stack.count <= 0) return;
    const be = level.world.getBlockEntity(x, y, z);
    if (!(be instanceof HopperBlockEntity)) return;
    if (!e.bb.intersects(new AABB(x, y + SUCK_MIN_Y, z, x + 1, y + SUCK_MAX_Y, z + 1))) return;
    if (STATE_BLOCK[st] === hopper().id) tryMoveItems(level, be, () => takeItemEntity(be, e));
  },
});
