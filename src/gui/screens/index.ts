// Registers the screen factories the game shell uses.

import type { Game } from '../../game/game';
import { TitleScreen } from './menus';
import { PauseScreen, DeathScreen, LevelLoadingScreen, ChatScreen } from './ingame';
import { executeCommand } from '../../game/commands';

export function installScreens(game: Game): void {
  game.titleScreenFactory = () => new TitleScreen(game, false);
  game.pauseScreenFactory = () => new PauseScreen(game);
  game.deathScreenFactory = () => new DeathScreen(game, game.deathMessage(game.player.lastDamageSource), !!game.meta?.hardcore);
  game.loadingScreenFactory = () => new LevelLoadingScreen(game);
  game.chatScreenFactory = (initial) => new ChatScreen(game, initial);
  game.onCommand = (cmd) => executeCommand(game, cmd);
}
