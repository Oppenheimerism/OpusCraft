// The books' screens, as using one opens them (game/books.ts), and which world's maps are the ones in play
// (game/mapData.ts). (The job sites' screens are the game's container screens, index.ts, for the menus
// game/openMenu.ts makes.)

import type { Game } from '../../game/game';
import { setItemGuiHook } from '../../game/books';
import { BookEditScreen, BookViewScreen, bookPages } from './book';
import { setMapWorldSource } from '../../game/mapData';

export function installBookScreens(game: Game): void {
  // the world being played, for its maps (game/mapData.ts): read from and saved with its save
  setMapWorldSource(() => (game.meta && game.level ? { level: game.level, meta: game.meta } : null));
  // a book's screen: to write in a book and quill, or read a written book
  game.bookScreenFactory = (p, stack, hand) => {
    if (stack.item.id === 'writable_book') return new BookEditScreen(game, p, stack, hand);
    if (stack.item.id === 'written_book') return new BookViewScreen(game, bookPages(stack) ?? []);
    return null;
  };
  // vanilla LocalPlayer.openItemGui (and ClientboundOpenBookPacket for a signed book): a guest's player's book opens
  // on its guest's screen
  setItemGuiHook((p, stack, hand) => {
    if (p !== game.player) return game.server?.openBook(p, hand);
    const screen = game.bookScreenFactory?.(p, stack, hand);
    if (screen) game.setScreen(screen);
  });
}
