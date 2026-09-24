// The job sites' screens, as the game opens them (game/jobSites.ts): each block's menu with its screen; and the
// books' screens, as using one opens them (game/books.ts).

import type { Game } from '../../game/game';
import type { Screen } from '../screen';
import { setJobSiteScreens } from '../../game/jobSites';
import { setItemGuiHook } from '../../game/books';
import { LecternBlockEntity } from '../../world/blockEntity';
import { StonecutterMenu } from '../../inventory/stonecutterMenu';
import { StonecutterScreen } from './stonecutter';
import { SmithingMenu } from '../../inventory/smithingMenu';
import { SmithingScreen } from './smithing';
import { LecternMenu } from '../../inventory/lecternMenu';
import { BookEditScreen, BookViewScreen, LecternScreen, bookPages } from './book';

export function installJobSiteScreens(game: Game): void {
  setJobSiteScreens((kind, x, y, z): Screen | null => {
    const p = game.player;
    const pos: [number, number, number] = [x, y, z];
    switch (kind) {
      case 'stonecutter':
        return new StonecutterScreen(game, new StonecutterMenu(p, pos));
      case 'smithing_table':
        return new SmithingScreen(game, new SmithingMenu(p, pos));
      case 'lectern': {
        const be = p.level.world.getBlockEntity(x, y, z);
        return be instanceof LecternBlockEntity ? new LecternScreen(game, new LecternMenu(p, be)) : null;
      }
    }
    return null;
  });
  // vanilla LocalPlayer.openItemGui (and ClientboundOpenBookPacket for a signed book)
  setItemGuiHook((p, stack, hand) => {
    if (p !== game.player) return;
    if (stack.item.id === 'writable_book') game.setScreen(new BookEditScreen(game, p, stack, hand));
    else if (stack.item.id === 'written_book') game.setScreen(new BookViewScreen(game, bookPages(stack) ?? []));
  });
}
