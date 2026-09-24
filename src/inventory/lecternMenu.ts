// A lectern's menu (vanilla LecternMenu): its one book slot and the page it's open at. The screen's buttons turn the
// page back and forward, jump to a page, or take the book.

import { ContainerMenu, Slot } from './container';
import type { ItemStack } from '../item/item';
import type { Player } from '../entity/player';
import { LecternBlockEntity } from '../world/blockEntity';
import { lecternSetPage, lecternTakeBook } from '../game/villageBlocks';

export const BUTTON_PREV_PAGE = 1;
export const BUTTON_NEXT_PAGE = 2;
export const BUTTON_TAKE_BOOK = 3;
export const BUTTON_PAGE_JUMP_RANGE_START = 100;

/** vanilla Player.mayBuild: adventure and spectator players can't take the book */
export function mayBuild(p: Player): boolean {
  return p.gameMode !== 'adventure' && p.gameMode !== 'spectator';
}

export class LecternMenu extends ContainerMenu {
  /** the screen's ContainerListener: the book (slotChanged) or the page (dataChanged) changed */
  onBookChanged: (() => void) | null = null;
  onPageChanged: (() => void) | null = null;
  private lastPage: number;

  constructor(player: Player, readonly lectern: LecternBlockEntity) {
    super(player);
    // (vanilla: at 0, 0, never drawn)
    this.addSlot(new Slot(lectern.container, 0, 0, 0));
    this.lastPage = lectern.page;
  }

  getBook(): ItemStack | null {
    return this.lectern.book;
  }

  getPage(): number {
    return this.lectern.page;
  }

  /** vanilla clickMenuButton */
  clickMenuButton(id: number): boolean {
    const p = this.player, level = p.level;
    if (id >= BUTTON_PAGE_JUMP_RANGE_START) {
      this.setPage(id - BUTTON_PAGE_JUMP_RANGE_START);
      return true;
    }
    switch (id) {
      case BUTTON_PREV_PAGE:
        this.setPage(this.lectern.page - 1);
        return true;
      case BUTTON_NEXT_PAGE:
        this.setPage(this.lectern.page + 1);
        return true;
      case BUTTON_TAKE_BOOK: {
        if (!mayBuild(p)) return false;
        const s = lecternTakeBook(level, this.lectern);
        this.onBookChanged?.();
        if (s) {
          const left = p.inventory.add(s);
          if (left > 0) p.dropItem(s.copyWithCount(left), false);
        }
        return true;
      }
    }
    return false;
  }

  /** vanilla setData(0, page) and broadcastChanges: the lectern turns to it, and the screen hears if it moved */
  private setPage(page: number): void {
    lecternSetPage(this.player.level, this.lectern, page);
    if (this.lectern.page !== this.lastPage) {
      this.lastPage = this.lectern.page;
      this.onPageChanged?.();
    }
  }

  quickMoveStack(): ItemStack | null {
    return null;
  }

  /** vanilla bookAccess.stillValid: the lectern still there (Container.stillValidBlockEntity) and a book on it */
  override stillValid(p: Player): boolean {
    const be = this.lectern;
    if (be.removed || p.level.world.getBlockEntity(be.x, be.y, be.z) !== be) return false;
    if (p.distanceToSqr(be.x + 0.5, be.y + 0.5, be.z + 0.5) > 64) return false;
    const id = be.book?.item.id;
    return id === 'writable_book' || id === 'written_book';
  }
}
