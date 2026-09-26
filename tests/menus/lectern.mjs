// Headless checks for the lectern's menu, books and book copying (node tests/menus/lectern.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/item/item.ts', '/src/entity/player.ts', '/src/inventory/lecternMenu.ts', '/src/game/villageBlocks.ts', '/src/world/blockEntity.ts',
  '/src/inventory/menus.ts', '/src/gui/screens/container.ts', '/src/gui/screens/book.ts', '/src/game/itemBehavior.ts', '/src/game/books.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, itemMod, playerMod, lm, vb, beMod, menus, cont, book, ib, books] = mods;
const { S, getBlock } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const world = new worldMod.World();
for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
let sounds = [];
level.sound = { play: (n, x, y, z, v, p) => sounds.push([n, v, p]), playUI() {} };
const player = new playerMod.Player(level);
player.moveTo(0.5, 64, -2.5, 0, 0);
const inv = player.inventory;
const lectern = getBlock('lectern');

// a signed book of three pages on a lectern
const written = (title, pages, generation = 0) => { const s = ItemStack.of('written_book'); s.tag = { book: { title, author: 'Alex', generation, pages } }; return s; };
level.setBlock(0, 64, 0, lectern.with(S('lectern'), 'has_book', true));
const be = world.getBlockEntity(0, 64, 0);
check('the lectern has its block entity', be instanceof beMod.LecternBlockEntity);
be.setBook(written('Notes', ['one', 'two', 'three']));
check('analog output on the first page of three: 1', vb.lecternAnalogOutput(level, 0, 64, 0) === 1, String(vb.lecternAnalogOutput(level, 0, 64, 0)));
const m = new lm.LecternMenu(player, be);
let pageHeard = 0, bookHeard = 0;
m.onPageChanged = () => pageHeard++;
m.onBookChanged = () => bookHeard++;
check('valid with a book on it', m.stillValid(player));
sounds = [];
m.clickMenuButton(lm.BUTTON_PREV_PAGE);
check('no page before the first: nothing happens', m.getPage() === 0 && pageHeard === 0 && sounds.length === 0);
m.clickMenuButton(lm.BUTTON_NEXT_PAGE);
const st = level.getState(0, 64, 0);
check('next page: page 1, the screen hears it', m.getPage() === 1 && pageHeard === 1);
check('the page turn powers the lectern and rustles', lectern.get(st, 'powered') === true && sounds.some((s) => s[0] === 'item.book.page_turn' && s[2] === 1), JSON.stringify(sounds));
check('a tick is due in 2', level.hasScheduledTick(0, 64, 0, lectern.id));
check('analog output halfway: 8', vb.lecternAnalogOutput(level, 0, 64, 0) === 8, String(vb.lecternAnalogOutput(level, 0, 64, 0)));
level.gameTime += 2;
level['runScheduledTicks']();
check('two ticks later it stops powering', lectern.get(level.getState(0, 64, 0), 'powered') === false);
m.clickMenuButton(lm.BUTTON_PAGE_JUMP_RANGE_START + 9);
check('a jump past the end lands on the last page', m.getPage() === 2);
check('analog output on the last page: 15', vb.lecternAnalogOutput(level, 0, 64, 0) === 15);
// in adventure mode the book stays
player.gameMode = 'adventure';
check('an adventure player can\'t take the book', m.clickMenuButton(lm.BUTTON_TAKE_BOOK) === false && be.book);
player.gameMode = 'survival';
check('take book', m.clickMenuButton(lm.BUTTON_TAKE_BOOK) === true);
check('the book is in the inventory', inv.main.some((s) => s?.item.id === 'written_book' && s.tag?.book?.title === 'Notes'));
const st2 = level.getState(0, 64, 0);
check('the lectern shows no book, unpowered, page 0', lectern.get(st2, 'has_book') === false && lectern.get(st2, 'powered') === false && be.page === 0 && !be.book);
check('the menu is no longer valid', !m.stillValid(player) && bookHeard === 1);
check('analog output with no book: 0', vb.lecternAnalogOutput(level, 0, 64, 0) === 0);

// tooltip lines of a signed book
const tip = cont.itemTooltip(written('Notes', ['x'], 1));
check('tooltip: title, author, generation', tip[0] === 'Notes' && tip[1] === '§7by Alex' && tip[2] === '§7Copy of original', JSON.stringify(tip));
check('a written book glints', written('a', []).hasGlint());

// copying at a crafting table
level.setBlock(4, 64, 0, S('crafting_table'));
const cm = new menus.CraftingMenu(player, [4, 64, 0]);
cm.craft.set(0, written('Notes', ['p1', 'p2']));
cm.craft.set(1, ItemStack.of('writable_book'));
cm.craft.set(5, ItemStack.of('writable_book'));
let r = cm.result.items[0];
check('a written book and two books and quills make two copies', r?.item.id === 'written_book' && r.count === 2 && r.tag.book.generation === 1 && r.tag.book.title === 'Notes', JSON.stringify(r?.tag));
cm.clicked(0, 0, 'pickup');
check('taken: the original stays, the books and quills are used', cm.carried?.count === 2 && cm.craft.items[0]?.item.id === 'written_book' && cm.craft.items[0].tag.book.generation === 0 && !cm.craft.items[1] && !cm.craft.items[5]);
cm.carried = null;
cm.craft.set(0, written('Old', ['p'], 2));
cm.craft.set(1, ItemStack.of('writable_book'));
check('a copy of a copy can\'t be copied', !cm.result.items[0]);
cm.craft.set(0, written('Old', ['p'], 0));
cm.craft.set(2, ItemStack.of('stick'));
check('nothing else may be in the grid', !cm.result.items[0]);
cm.craft.set(2, null);
cm.removed();
const im = new menus.InventoryMenu(player);
im.craft.set(0, written('Two', ['p'], 0));
im.craft.set(1, ItemStack.of('writable_book'));
check('the 2x2 grid can\'t copy books', !im.result.items[0]);
im.removed();

// writing in a book and quill, then signing it (the screen with a stand-in game and font)
const font = { charWidth: (c) => (c === ' ' ? 4 : c === 'i' || c === '.' ? 2 : 6), width(s) { let w = 0; for (const c of s) w += this.charWidth(c); return w; } };
let opened = null;
const game = { gui: { font }, playerName: 'Steve', player, sound: { playUI() {} }, setScreen: (s) => (opened = s), renderTransparentBackground() {}, input: { isDown: () => false } };
for (let i = 0; i < 36; i++) inv.main[i] = null;
inv.selected = 3;
const quill = ItemStack.of('writable_book');
inv.main[3] = quill;
const ed = new book.BookEditScreen(game, player, quill, 'main');
ed.initScreen(320, 240);
const key = (k, extra = {}) => ed.keyPressed({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...extra });
const type = (t) => { for (const c of t) if (!key(c)) ed.charTyped(c); };
type('Hello world');
key('Enter');
type('Second line');
check('typed onto the page', ed.pages[0] === 'Hello world\nSecond line', JSON.stringify(ed.pages));
key('Backspace', { ctrlKey: true });
check('ctrl+backspace deletes a word', ed.pages[0] === 'Hello world\nSecond ', JSON.stringify(ed.pages[0]));
key('Home');
type('>');
check('home goes to the start of the line', ed.pages[0] === 'Hello world\n>Second ', JSON.stringify(ed.pages[0]));
// a long word wraps; a full page takes no more
type('x'.repeat(400));
const lines = [];
book.splitLines(font, ed.pages[0], 114, false, (a, b) => lines.push(ed.pages[0].slice(a, b)));
check('the page stops at 14 lines', lines.length === 14, String(lines.length));
check('the lines fit the width', lines.every((l) => font.width(l) <= 114));
// a second page, then done
const fwd = ed.widgets.find((w) => w.constructor.name === 'PageButton' && w.isForward);
fwd.onPress(fwd);
type('Page two');
fwd.onPress(fwd);
check('three pages, the last empty', ed.pages.length === 3 && ed.pages[2] === '');
const done = ed.widgets.find((w) => w.label === 'Done');
done.onPress(done);
check('done saves the pages (the empty last one dropped)', quill.tag?.pages?.length === 2 && quill.tag.pages[1] === 'Page two' && inv.main[3] === quill, JSON.stringify(quill.tag?.pages?.map((p) => p.length)));
// sign it
const ed2 = new book.BookEditScreen(game, player, quill, 'main');
ed2.initScreen(320, 240);
const sign = ed2.widgets.find((w) => w.label === 'Sign');
sign.onPress(sign);
const fin = ed2.widgets.find((w) => w.label === 'Sign and Close');
check('signing: the finalize button waits for a title', fin.visible && !fin.active);
for (const c of 'My Very Long Book Title') ed2.charTyped(c);
check('the title stops at 15 characters', ed2.bookTitle === 'My Very Long Bo', ed2.bookTitle);
fin.onPress(fin);
const signed = inv.main[3];
check('signed: a written book with title, author, generation and pages', signed?.item.id === 'written_book' && signed.tag.book.title === 'My Very Long Bo' && signed.tag.book.author === 'Steve' && signed.tag.book.generation === 0 && signed.tag.book.pages.length === 2 && !signed.tag.pages, JSON.stringify(signed?.tag));
check('its name is its title', signed.displayName() === 'My Very Long Bo');
// using books opens their screens
opened = null;
ib.itemBehaviorOf('written_book').use(level, player, signed);
check('using a written book: nothing without the game hook', opened === null);
books.setItemGuiHook((p, s, hand) => (opened = [s.item.id, hand]));
ib.itemBehaviorOf('written_book').use(level, player, signed);
check('using a written book opens it', opened?.[0] === 'written_book' && opened[1] === 'main');
console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
