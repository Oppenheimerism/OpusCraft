// The ender chest (vanilla EnderChestBlock and PlayerEnderChestContainer): every player has 27 slots of their own that
// any ender chest opens onto — the same slots whichever ender chest they open, and nobody else's. They are kept with
// the player (game/playerData.ts: the host's own player in the world's meta, each LAN guest's in its record under the
// world), never dropped when the player dies, and not touched by respawning.
//
// Opening one (vanilla useWithoutItem): not while a block that conducts redstone sits on it; its menu is a chest's,
// titled Ender Chest, over the opener's own slots; the chest's lid rises for as long as anyone looks in (vanilla
// ContainerOpenersCounter, world/enderChestBlockEntity.ts) and piglins who see it take it as they take a chest being
// opened. Broken without silk touch it gives 8 obsidian (vanilla blocks/ender_chest loot); purple portal motes drift
// about it (vanilla animateTick).

import type { Level } from './level';
import type { Player } from '../entity/player';
import { SimpleContainer } from '../inventory/container';
import { ChestMenu } from '../inventory/menus';
import { ItemStack, saveStack, loadStack, type SavedStack } from '../item/item';
import { registerBehavior } from './blockBehavior';
import { showMenu } from './openMenu';
import { isConductor } from './redstone/signal';
import { Piglin } from '../entity/piglin';
import { EnderChestBlockEntity } from '../world/enderChestBlockEntity';
import { canInteractWithBlock } from '../world/signBlockEntity';

/** vanilla EnderChestBlock.CONTAINER_TITLE */
export const ENDER_CHEST_TITLE = 'Ender Chest';
/** vanilla PlayerEnderChestContainer: 27 slots */
export const ENDER_CHEST_SIZE = 27;

/**
 * vanilla PlayerEnderChestContainer: a player's own ender chest slots, and the ender chest they have open (the one
 * whose lid is up for them, and that they must stay near)
 */
export class PlayerEnderChest {
  readonly container = new SimpleContainer(ENDER_CHEST_SIZE);
  activeChest: EnderChestBlockEntity | null = null;

  /** vanilla isActiveChest */
  isActiveChest(be: EnderChestBlockEntity): boolean {
    return this.activeChest === be;
  }

  /**
   * vanilla stillValid: while open at a chest, only while that chest is still there and the player within reach of it
   * (vanilla Container.stillValidBlockEntity: Player.canInteractWithBlock(pos, 4))
   */
  containerStillValid(p: Player): boolean {
    const be = this.activeChest;
    if (!be) return true;
    return !be.removed && p.level.world.getBlockEntity(be.x, be.y, be.z) === be && canInteractWithBlock(p, be.x, be.y, be.z, 4);
  }

  /** the slots as kept (vanilla EnderItems; here, as the inventory is kept: a stack or null for each slot) */
  save(): (SavedStack | null)[] {
    return this.container.items.map((s) => (s ? saveStack(s) : null));
  }

  /** the slots as `saved` kept them (nothing kept: empty); a slot past the 27th is let go */
  load(saved: readonly (SavedStack | null)[] | undefined): void {
    for (let i = 0; i < ENDER_CHEST_SIZE; i++) this.container.items[i] = saved ? (loadStack(saved[i] ?? null) ?? null) : null;
    this.container.changed();
  }
}

/** each player's ender chest, made when first needed (vanilla Player.enderChestInventory) */
const ENDER = new WeakMap<Player, PlayerEnderChest>();

/** `p`'s ender chest (vanilla Player.getEnderChestInventory) */
export function enderChestOf(p: Player): PlayerEnderChest {
  let e = ENDER.get(p);
  if (!e) ENDER.set(p, (e = new PlayerEnderChest()));
  return e;
}

/** vanilla EnderChestBlock.useWithoutItem: the opener's ender chest in a chest's menu, if nothing that conducts sits on it */
export function openEnderChest(level: Level, x: number, y: number, z: number, p: Player): boolean {
  const be = level.world.getBlockEntity(x, y, z);
  if (!(be instanceof EnderChestBlockEntity)) return true;
  if (isConductor(level.getState(x, y + 1, z))) return true;
  if (level.isClientSide) return true;
  const inv = enderChestOf(p);
  // (vanilla PlayerEnderChestContainer.startOpen and stopOpen: this chest counts the player as looking in from the
  // menu's showing till it's closed, and is the one the player must stay near; set once it's shown, so a menu it
  // replaces lets go of its own chest first)
  const m = new ChestMenu(p, inv, ENDER_CHEST_TITLE);
  m.onClosed = () => {
    be.stopOpen(level, p);
    if (inv.activeChest === be) inv.activeChest = null;
  };
  if (!showMenu(p, m)) return true;
  inv.activeChest = be;
  be.startOpen(level, p);
  // vanilla PiglinAi.angerNearbyPiglins(player, true)
  Piglin.angerNearbyPiglins(p, true);
  return true;
}

registerBehavior('ender_chest', {
  use: (level, x, y, z, _st, ctx) => openEnderChest(level, x, y, z, ctx.player),
  // vanilla EnderChestBlockEntity.triggerEvent(1, count): the lid follows how many look in
  triggerEvent(level, x, y, z, _st, id, param) {
    if (id !== 1) return false;
    const be = level.world.getBlockEntity(x, y, z);
    if (!(be instanceof EnderChestBlockEntity)) return false;
    be.setLid(param > 0, level.gameTime);
    return true;
  },
  // vanilla blocks/ender_chest loot: itself with silk touch, else 8 obsidian
  drops: (_st, _tool, _r, silk) => [silk ? ItemStack.of('ender_chest') : ItemStack.of('obsidian', 8)],
  // vanilla EnderChestBlock.animateTick: three portal motes a tick, from a corner's column, drifting out that way
  // (on the client's own random, as the other ambient effects: game/animateTick.ts)
  animateTick(level, x, y, z) {
    const r = Math.random;
    for (let i = 0; i < 3; i++) {
      const j = Math.floor(r() * 2) * 2 - 1, k = Math.floor(r() * 2) * 2 - 1;
      const px = x + 0.5 + 0.25 * j, py = y + r(), pz = z + 0.5 + 0.25 * k;
      level.particles.spawn?.('portal', px, py, pz, r() * j, (r() - 0.5) * 0.125, r() * k);
    }
  },
});
