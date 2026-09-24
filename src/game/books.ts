// Books (vanilla WritableBookItem, WrittenBookItem and BookCloningRecipe): using one opens it to write in or read
// (Player.openItemGui, through the game's screens), a signed book's tooltip names its author and how far it is from
// the original, and a crafting table copies it into books and quills.

import { ItemStack } from '../item/item';
import type { Player } from '../entity/player';
import type { Hand } from '../item/inventory';
import { registerItemBehavior } from './itemBehavior';
import { registerHoverText } from '../item/hoverText';
import { registerCustomRecipe, type Grid } from '../inventory/customRecipes';

type ItemGui = (p: Player, stack: ItemStack, hand: Hand) => void;
let openItemGuiHook: ItemGui | null = null;

/** the game's book screens (BookEditScreen for a book and quill, BookViewScreen for a signed book) */
export function setItemGuiHook(f: ItemGui | null): void {
  openItemGuiHook = f;
}

for (const id of ['writable_book', 'written_book']) {
  registerItemBehavior(id, {
    // vanilla use: player.openItemGui(stack, hand)
    use(_level, p, stack) {
      openItemGuiHook?.(p, stack, p.inventory.activeHand);
      return 'success';
    },
  });
}

/** vanilla book.generation.* */
const GENERATIONS = ['Original', 'Copy of original', 'Copy of a copy', 'Tattered'];

// vanilla WrittenBookItem.appendHoverText: "by" the author (when there is one) and the generation
registerHoverText('written_book', (s) => {
  const b = s.tag?.book;
  if (!b) return [];
  const out: string[] = [];
  if (b.author.trim()) out.push(`§7by ${b.author}`);
  out.push(`§7${GENERATIONS[b.generation] ?? GENERATIONS[0]}`);
  return out;
});

/** vanilla WrittenBookContent.MAX_CRAFTABLE_GENERATION: a copy of a copy can't be copied again */
const MAX_CRAFTABLE_GENERATION = 2;

/** the grid's one written book and how many books and quills are with it (nothing else allowed) */
function cloningInput(grid: Grid): { original: ItemStack; copies: number } | null {
  let original: ItemStack | null = null;
  let copies = 0;
  for (const s of grid) {
    if (!s) continue;
    if (s.item.id === 'written_book') {
      if (original) return null;
      original = s;
    } else if (s.item.id === 'writable_book') copies++;
    else return null;
  }
  return original && copies > 0 ? { original, copies } : null;
}

// vanilla BookCloningRecipe (3x3 grids only): the written book stays, each book and quill becomes a copy one
// generation further on
registerCustomRecipe({
  assemble(grid, width) {
    if (width < 3) return null;
    const input = cloningInput(grid);
    const book = input?.original.tag?.book;
    if (!input || !book || book.generation >= MAX_CRAFTABLE_GENERATION) return null;
    const out = input.original.copyWithCount(input.copies);
    out.tag!.book = { ...book, generation: book.generation + 1, pages: [...book.pages] };
    return out;
  },
  remaining(grid) {
    const out: (ItemStack | null)[] = grid.map(() => null);
    const i = grid.findIndex((s) => s?.item.id === 'written_book');
    if (i >= 0) out[i] = grid[i]!.copyWithCount(1);
    return out;
  },
});
