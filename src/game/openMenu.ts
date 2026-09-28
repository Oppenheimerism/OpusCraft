// A menu opened for a player (vanilla Player.openMenu with the block's or entity's MenuProvider): what a block or an
// entity with a menu does when it's used, for whoever used it, and who then shows the menu (vanilla ServerPlayer's
// OpenScreen to its client): the game's own screens for its own player, and for a guest's player on a host, its
// session (net/server). One place for every kind of menu, so a guest's are made exactly as the host's own are.

import type { Player } from '../entity/player';
import type { Level } from './level';
import type { ContainerMenu } from '../inventory/container';
import { CraftingMenu, FurnaceMenu, ChestMenu, BrewingStandMenu } from '../inventory/menus';
import { EnchantmentMenu, AnvilMenu, GrindstoneMenu } from '../inventory/enchantMenus';
import { StonecutterMenu } from '../inventory/stonecutterMenu';
import { SmithingMenu } from '../inventory/smithingMenu';
import { LoomMenu } from '../inventory/loomMenu';
import { CartographyTableMenu } from '../inventory/cartographyMenu';
import { LecternMenu } from '../inventory/lecternMenu';
import { DispenserMenu } from '../inventory/dispenserMenu';
import { HopperMenu } from '../inventory/hopperMenu';
import { CrafterMenu } from '../inventory/crafterMenu';
import { HorseInventoryMenu } from '../inventory/horseMenu';
import { ChestBlockEntity, FurnaceBlockEntity, BarrelBlockEntity, BrewingStandBlockEntity, LecternBlockEntity } from '../world/blockEntity';
import { FLAGS, F_OPAQUE } from '../world/block';
import { catSittingOn } from '../entity/cat';
import { MinecartHopper } from '../entity/minecartVariants';
import type { AbstractMinecartContainer } from '../entity/minecart';
import type { ChestBoat } from '../entity/boat';
import { horseHooks } from '../entity/horse';
import { entityDisplayName } from './spawner';
import { setDispenserMenuHook } from './redstone/dispenser';
import { setHopperMenuHook } from './redstone/hopper';
import { setCrafterMenuHook } from './crafter';

/** shows `menu`, opened for `p`; false if it can't be (a player nobody shows menus to) */
export type ShowMenu = (p: Player, menu: ContainerMenu) => boolean;

let show: ShowMenu | null = null;

/** who shows the menus opened for players (the game; a host's server wraps it for its guests' players) */
export function setShowMenu(f: ShowMenu | null): void {
  show = f;
}

export function getShowMenu(): ShowMenu | null {
  return show;
}

/** vanilla Player.openMenu: `menu` shown to `p`, if anyone shows it */
export function showMenu(p: Player, menu: ContainerMenu): boolean {
  return show?.(p, menu) ?? false;
}

/** what opening a menu earns the player who did (the advancements: the game's own player's) */
export interface MenuEvents {
  /** vanilla player_generates_container_loot: a container's loot was rolled as they opened it */
  loot?(table: string): void;
  /** vanilla brewed_potion */
  brewed?(potion: string): void;
  /** vanilla enchanted_item */
  enchanted?(): void;
}

/**
 * (bastions) vanilla RandomizableContainer.unpackLootTable(player): a container's loot rolled as the player opens
 * it, and the player_generates_container_loot trigger for its table (War Pigs)
 */
function unpackLootFor(be: { lootTable?: string | null; unpackLoot(): void }, events: MenuEvents): void {
  const table = be.lootTable ?? null;
  be.unpackLoot();
  if (table) events.loot?.(table);
}

/**
 * the menu of the block `kind` at (x, y, z) that `p` used (vanilla useWithoutItem → openMenu): the crafting table,
 * furnaces, a chest or barrel (its lid opening), the brewing stand, enchanting table, anvils, grindstone, and the job
 * sites' (stonecutter, smithing table, loom, cartography table, a lectern's book); null if it has none, or can't be
 * opened now (a chest with a block or a cat on it)
 */
export function blockMenu(level: Level, p: Player, kind: string, x: number, y: number, z: number, events: MenuEvents = {}): ContainerMenu | null {
  const world = level.world, pos: [number, number, number] = [x, y, z];
  switch (kind) {
    case 'crafting_table':
      return new CraftingMenu(p, pos);
    case 'furnace':
    case 'smoker':
    case 'blast_furnace': {
      const be = world.getBlockEntity(x, y, z);
      return be instanceof FurnaceBlockEntity ? new FurnaceMenu(p, be) : null;
    }
    case 'chest': {
      const be = world.getBlockEntity(x, y, z);
      if (!(be instanceof ChestBlockEntity)) return null;
      // a solid block above keeps the lid shut, and so does a cat sitting on it (vanilla ChestBlock.isChestBlockedAt)
      if (FLAGS[world.getState(x, y + 1, z)] & F_OPAQUE || catSittingOn(level, x, y, z)) return null;
      unpackLootFor(be, events);
      const m = new ChestMenu(p, be);
      m.onClosed = () => chestClosed(level, be, p);
      if (be.openCount++ === 0) {
        level.sound.play('block.chest.open', x + 0.5, y + 0.5, z + 0.5, 0.5, Math.random() * 0.1 + 0.9);
        // (vanilla ContainerOpenersCounter.incrementOpeners: CONTAINER_OPEN)
        level.gameEvent('container_open', x + 0.5, y + 0.5, z + 0.5, { entity: p });
      }
      return m;
    }
    case 'barrel': {
      // vanilla BarrelBlock.useWithoutItem: a chest's menu, titled Barrel; the lid opens
      const be = world.getBlockEntity(x, y, z);
      if (!(be instanceof BarrelBlockEntity)) return null;
      unpackLootFor(be, events);
      const m = new ChestMenu(p, be, 'Barrel');
      m.onClosed = () => chestClosed(level, be, p);
      be.startOpen(level, p);
      return m;
    }
    case 'brewing_stand': {
      const be = world.getBlockEntity(x, y, z);
      if (!(be instanceof BrewingStandBlockEntity)) return null;
      const m = new BrewingStandMenu(p, be);
      m.onBrewed = (potion) => events.brewed?.(potion);
      return m;
    }
    case 'enchanting_table': {
      const m = new EnchantmentMenu(p, pos);
      m.onEnchanted = () => events.enchanted?.();
      return m;
    }
    case 'grindstone':
      return new GrindstoneMenu(p, pos);
    // the job sites' menus, from game/villageBlocks
    case 'stonecutter':
      return new StonecutterMenu(p, pos);
    case 'smithing_table':
      return new SmithingMenu(p, pos);
    case 'loom':
      return new LoomMenu(p, pos);
    case 'cartography_table':
      return new CartographyTableMenu(p, pos);
    case 'lectern': {
      const be = world.getBlockEntity(x, y, z);
      return be instanceof LecternBlockEntity ? new LecternMenu(p, be) : null;
    }
  }
  return kind.endsWith('anvil') ? new AnvilMenu(p, pos) : null;
}

/** a chest's or barrel's menu closed (vanilla ChestBlockEntity.stopOpen / BarrelBlockEntity.stopOpen): the last out shuts the lid */
export function chestClosed(level: Level, be: ChestBlockEntity, p: Player): void {
  if (be instanceof BarrelBlockEntity) return be.stopOpen(level, p);
  be.openCount = Math.max(0, be.openCount - 1);
  if (be.openCount !== 0) return;
  level.sound.play('block.chest.close', be.x + 0.5, be.y + 0.5, be.z + 0.5, 0.5, Math.random() * 0.1 + 0.9);
  // (vanilla decrementOpeners: CONTAINER_CLOSE)
  level.gameEvent('container_close', be.x + 0.5, be.y + 0.5, be.z + 0.5, { entity: p });
}

/**
 * the menu of a chest minecart or chest boat `p` right-clicked (vanilla ContainerEntity.interactWithContainerVehicle:
 * its loot rolled, no sound, no lid; CONTAINER_OPEN and, when it's closed, CONTAINER_CLOSE where the vehicle is)
 * ((minecarts) a hopper minecart's is a hopper's menu)
 */
export function entityContainerMenu(level: Level, p: Player, e: AbstractMinecartContainer | ChestBoat): ChestMenu | HopperMenu {
  e.unpackLoot();
  const m = e instanceof MinecartHopper ? new HopperMenu(p, e, entityDisplayName(e)) : new ChestMenu(p, e, entityDisplayName(e));
  m.onClosed = () => level.gameEvent('container_close', e.x, e.y, e.z, { entity: p });
  level.gameEvent('container_open', e.x, e.y, e.z, { entity: p });
  return m;
}

/**
 * the hooks of the blocks and entities whose menus aren't opened by name (a dispenser's or dropper's, a hopper's, a
 * crafter's, a horse's inventory): each makes its menu for whoever used it and has it shown
 */
export function installMenuHooks(): void {
  setDispenserMenuHook((be, p) => void showMenu(p, new DispenserMenu(p, be)));
  setHopperMenuHook((be, p) => void showMenu(p, new HopperMenu(p, be)));
  setCrafterMenuHook((be, p) => void showMenu(p, new CrafterMenu(p, be)));
  horseHooks.openInventory = (h, p) => void showMenu(p, new HorseInventoryMenu(p, h));
}
