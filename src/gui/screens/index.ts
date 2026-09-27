// Registers the screen factories the game shell uses.

import type { Game } from '../../game/game';
import { TitleScreen, GenericMessageScreen } from './menus';
import { PauseScreen, DeathScreen, LevelLoadingScreen, ReceivingLevelScreen, ChatScreen, InBedChatScreen, ClickToResumeScreen } from './ingame';
import { executeCommand } from '../../game/commands';
import { InventoryScreen, CraftingScreen, FurnaceScreen, ChestScreen, BrewingStandScreen } from './container';
import { CreativeInventoryScreen } from './creative';
import { AdvancementsScreen } from './advancements';
import { InventoryMenu, CraftingMenu, FurnaceMenu, ChestMenu, BrewingStandMenu } from '../../inventory/menus';
import { EnchantmentMenu, AnvilMenu, GrindstoneMenu } from '../../inventory/enchantMenus';
import { EnchantmentScreen, AnvilScreen, GrindstoneScreen } from './enchanting';
import { MerchantMenu } from '../../inventory/merchantMenu';
import { MerchantScreen } from './merchant';
import { WinScreen } from './winScreen';
import { installBookScreens } from './jobSites';
import { DispenserScreen, HopperScreen } from './dispenser';
import { StonecutterMenu } from '../../inventory/stonecutterMenu';
import { StonecutterScreen } from './stonecutter';
import { SmithingMenu } from '../../inventory/smithingMenu';
import { SmithingScreen } from './smithing';
import { LoomMenu } from '../../inventory/loomMenu';
import { LoomScreen } from './loom';
import { CartographyTableMenu } from '../../inventory/cartographyMenu';
import { CartographyTableScreen } from './cartography';
import { LecternMenu } from '../../inventory/lecternMenu';
import { LecternScreen } from './book';
import { DispenserMenu } from '../../inventory/dispenserMenu';
import { HopperMenu } from '../../inventory/hopperMenu';
// (trial chambers)
import { CrafterMenu } from '../../inventory/crafterMenu';
import { CrafterScreen } from './crafter';
import { HorseInventoryMenu } from '../../inventory/horseMenu';
import { HorseInventoryScreen } from './horse';
import { ConnectScreen, DisconnectedScreen } from './multiplayer';

export function installScreens(game: Game): void {
  game.titleScreenFactory = () => new TitleScreen(game, false);
  game.pauseScreenFactory = () => new PauseScreen(game);
  game.deathScreenFactory = () => new DeathScreen(game, game.deathCause(), !!game.meta?.hardcore);
  game.loadingScreenFactory = () => new LevelLoadingScreen(game);
  game.resumeScreenFactory = () => new ClickToResumeScreen(game);
  game.messageScreenFactory = (title) => new GenericMessageScreen(game, title);
  game.receivingScreenFactory = (reason) => new ReceivingLevelScreen(game, reason);
  game.winScreenFactory = (onFinished) => new WinScreen(game, true, onFinished);
  game.chatScreenFactory = (initial) => new ChatScreen(game, initial);
  game.inBedScreenFactory = () => new InBedChatScreen(game);
  game.advancementsScreenFactory = () => new AdvancementsScreen(game);
  game.connectingScreenFactory = (cancel) => new ConnectScreen(game, cancel);
  game.disconnectedScreenFactory = (title, reason) => new DisconnectedScreen(game, title, reason);
  game.onCommand = (cmd) => executeCommand(game, cmd);
  game.inventoryScreenFactory = () => {
    const p = game.player;
    if (p.gameMode === 'creative') return new CreativeInventoryScreen(game);
    // (a guest's inventory menu is the one the host keeps in step with its own: net/client/clientMenus.ts)
    return new InventoryScreen(game, game.client?.menus?.inventory ?? new InventoryMenu(p));
  };
  game.containerScreenFactory = (menu) => {
    if (menu instanceof CraftingMenu) return new CraftingScreen(game, menu);
    if (menu instanceof FurnaceMenu) return new FurnaceScreen(game, menu);
    if (menu instanceof ChestMenu) return new ChestScreen(game, menu);
    if (menu instanceof BrewingStandMenu) return new BrewingStandScreen(game, menu);
    if (menu instanceof EnchantmentMenu) return new EnchantmentScreen(game, menu);
    if (menu instanceof AnvilMenu) return new AnvilScreen(game, menu);
    if (menu instanceof GrindstoneMenu) return new GrindstoneScreen(game, menu);
    if (menu instanceof MerchantMenu) return new MerchantScreen(game, menu);
    // the job sites' (game/openMenu.ts), a dispenser's, dropper's or hopper's, a crafter's, a horse's
    if (menu instanceof StonecutterMenu) return new StonecutterScreen(game, menu);
    if (menu instanceof SmithingMenu) return new SmithingScreen(game, menu);
    if (menu instanceof LoomMenu) return new LoomScreen(game, menu);
    if (menu instanceof CartographyTableMenu) return new CartographyTableScreen(game, menu);
    if (menu instanceof LecternMenu) return new LecternScreen(game, menu);
    if (menu instanceof DispenserMenu) return new DispenserScreen(game, menu);
    if (menu instanceof HopperMenu) return new HopperScreen(game, menu);
    if (menu instanceof CrafterMenu) return new CrafterScreen(game, menu);
    if (menu instanceof HorseInventoryMenu) return new HorseInventoryScreen(game, menu);
    return new InventoryScreen(game, menu as InventoryMenu);
  };
  installBookScreens(game);
}
