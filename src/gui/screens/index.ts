// Registers the screen factories the game shell uses.

import type { Game } from '../../game/game';
import { TitleScreen } from './menus';
import { PauseScreen, DeathScreen, LevelLoadingScreen, ReceivingLevelScreen, ChatScreen, InBedChatScreen } from './ingame';
import { executeCommand } from '../../game/commands';
import { InventoryScreen, CraftingScreen, FurnaceScreen, ChestScreen } from './container';
import { CreativeInventoryScreen } from './creative';
import { AdvancementsScreen } from './advancements';
import { InventoryMenu, CraftingMenu, FurnaceMenu, ChestMenu } from '../../inventory/menus';
import { EnchantmentMenu, AnvilMenu, GrindstoneMenu } from '../../inventory/enchantMenus';
import { EnchantmentScreen, AnvilScreen, GrindstoneScreen } from './enchanting';

export function installScreens(game: Game): void {
  game.titleScreenFactory = () => new TitleScreen(game, false);
  game.pauseScreenFactory = () => new PauseScreen(game);
  game.deathScreenFactory = () => new DeathScreen(game, game.deathMessage(game.player.lastDamageSource), !!game.meta?.hardcore);
  game.loadingScreenFactory = () => new LevelLoadingScreen(game);
  game.receivingScreenFactory = (reason) => new ReceivingLevelScreen(game, reason);
  game.chatScreenFactory = (initial) => new ChatScreen(game, initial);
  game.inBedScreenFactory = () => new InBedChatScreen(game);
  game.advancementsScreenFactory = () => new AdvancementsScreen(game);
  game.onCommand = (cmd) => executeCommand(game, cmd);
  game.inventoryScreenFactory = () => {
    const p = game.player;
    if (p.gameMode === 'creative') return new CreativeInventoryScreen(game);
    return new InventoryScreen(game, new InventoryMenu(p));
  };
  game.containerScreenFactory = (menu) => {
    if (menu instanceof CraftingMenu) return new CraftingScreen(game, menu);
    if (menu instanceof FurnaceMenu) return new FurnaceScreen(game, menu);
    if (menu instanceof ChestMenu) return new ChestScreen(game, menu);
    if (menu instanceof EnchantmentMenu) return new EnchantmentScreen(game, menu);
    if (menu instanceof AnvilMenu) return new AnvilScreen(game, menu);
    if (menu instanceof GrindstoneMenu) return new GrindstoneScreen(game, menu);
    return new InventoryScreen(game, menu as InventoryMenu);
  };
}
