// The job sites' screens, as the game opens them (game/jobSites.ts): each block's menu with its screen.

import type { Game } from '../../game/game';
import type { Screen } from '../screen';
import { setJobSiteScreens } from '../../game/jobSites';
import { StonecutterMenu } from '../../inventory/stonecutterMenu';
import { StonecutterScreen } from './stonecutter';

export function installJobSiteScreens(game: Game): void {
  setJobSiteScreens((kind, x, y, z): Screen | null => {
    const p = game.player;
    const pos: [number, number, number] = [x, y, z];
    switch (kind) {
      case 'stonecutter':
        return new StonecutterScreen(game, new StonecutterMenu(p, pos));
    }
    return null;
  });
}
