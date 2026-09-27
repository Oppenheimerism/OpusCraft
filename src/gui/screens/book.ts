// Books: reading a signed book or a lectern's (vanilla BookViewScreen and LecternScreen), and writing in and signing
// a book and quill (vanilla BookEditScreen, with TextFieldHelper and StringSplitter's line breaking), with their
// page-turning arrows (PageButton).

import type { Game } from '../../game/game';
import type { GuiGraphics, BitmapFont } from '../guiGraphics';
import { Screen, Button } from '../screen';
import type { ItemStack } from '../../item/item';
import { writeBook } from '../../game/books';
import type { Player } from '../../entity/player';
import type { Hand } from '../../item/inventory';
import { LecternMenu, mayBuild, BUTTON_PREV_PAGE, BUTTON_NEXT_PAGE, BUTTON_TAKE_BOOK, BUTTON_PAGE_JUMP_RANGE_START } from '../../inventory/lecternMenu';
import '../../textures/jobSiteGui';

const IMAGE_WIDTH = 192;
const TEXT_WIDTH = 114;
const TEXT_HEIGHT = 128;
const LINE_HEIGHT = 9;
/** vanilla WritableBookContent.MAX_PAGES */
const MAX_PAGES = 100;
const BLACK = 0x000000;

/** vanilla Mth.clamp (the lower bound wins when the range is empty) */
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : Math.min(v, hi));

/** vanilla BookViewScreen.BookAccess.fromItem: a signed book's pages, or a book and quill's; null for anything else */
export function bookPages(s: ItemStack | null): string[] | null {
  if (!s) return null;
  if (s.tag?.book) return s.tag.book.pages;
  if (s.item.id === 'written_book') return [];
  if (s.item.id === 'writable_book') return s.tag?.pages ?? [];
  return null;
}

// ---------------------------------------------------------------------------
// vanilla StringSplitter

/**
 * vanilla StringSplitter.splitLines(String, maxWidth, Style, withNewLines, LinePosConsumer): each line's start and end,
 * broken at the last space that fits (or mid-word when there's none) and at newlines; `withNewLines` counts the
 * breaking space or newline into the line it ends
 */
export function splitLines(font: BitmapFont, text: string, maxWidth: number, withNewLines: boolean, out: (start: number, end: number) => void): void {
  const n = text.length;
  let i = 0;
  while (i < n) {
    // LineBreakFinder over the rest of the text
    let width = 0, lastSpace = -1, lineBreak = -1, nextChar = i, nonZero = false;
    for (let k = i; k < n; k++) {
      const c = text[k];
      if (c === '§' && k + 1 < n) {
        k++;
        nextChar = k + 1;
        continue;
      }
      if (c === '\n') {
        lineBreak = k;
        break;
      }
      if (c === ' ') lastSpace = k;
      const w = font.charWidth(c);
      width += w;
      if (nonZero && width > maxWidth) {
        lineBreak = lastSpace !== -1 ? lastSpace : k;
        break;
      }
      nonZero ||= w !== 0;
      nextChar = k + 1;
    }
    if (lineBreak === -1 && nextChar >= n) {
      out(i, n);
      return;
    }
    const k = lineBreak !== -1 ? lineBreak : nextChar;
    const c0 = text[k];
    const l = c0 !== '\n' && c0 !== ' ' ? k : k + 1;
    out(i, withNewLines ? l : k);
    i = l;
  }
}

/** vanilla Font.split(text, width): the lines as they are drawn */
function splitText(font: BitmapFont, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  splitLines(font, text, maxWidth, false, (a, b) => lines.push(text.substring(a, b)));
  return lines;
}

/** vanilla Font.wordWrapHeight */
function wordWrapHeight(font: BitmapFont, text: string, maxWidth: number): number {
  let n = 0;
  splitLines(font, text, maxWidth, false, () => n++);
  return n * LINE_HEIGHT;
}

/** vanilla StringSplitter.plainIndexAtWidth: how many characters fit in `width` */
function indexAtWidth(font: BitmapFont, text: string, width: number): number {
  let left = width;
  for (let i = 0; i < text.length; i++) {
    left -= font.charWidth(text[i]);
    if (left < 0) return i;
  }
  return text.length;
}

/** vanilla StringSplitter.getWordPosition: `dir` words back or on from `cursor` */
function wordPosition(text: string, dir: number, cursor: number, skipWhitespace: boolean): number {
  let i = cursor;
  for (let k = 0; k < Math.abs(dir); k++) {
    if (dir < 0) {
      while (skipWhitespace && i > 0 && text[i - 1] === ' ') i--;
      while (i > 0 && text[i - 1] !== ' ') i--;
    } else {
      const l = text.length;
      const j = text.indexOf(' ', i);
      i = j === -1 ? l : j;
      while (skipWhitespace && i < l && text[i] === ' ') i++;
    }
  }
  return i;
}

/** vanilla StringUtil.isAllowedChatCharacter */
const allowedChar = (c: string): boolean => c.length === 1 && c !== '§' && c >= ' ' && c !== '\x7f';

// ---------------------------------------------------------------------------
// vanilla TextFieldHelper: a cursor and selection over a string held elsewhere

class TextFieldHelper {
  cursorPos = 0;
  selectionPos = 0;

  constructor(
    private readonly get: () => string,
    private readonly set: (s: string) => void,
    private readonly valid: (s: string) => boolean,
  ) {}

  charTyped(c: string): boolean {
    if (allowedChar(c)) this.insert(this.get(), c);
    return true;
  }

  private insert(msg: string, text: string): void {
    if (this.selectionPos !== this.cursorPos) msg = this.deleteSelection(msg);
    this.cursorPos = clamp(this.cursorPos, 0, msg.length);
    const s = msg.slice(0, this.cursorPos) + text + msg.slice(this.cursorPos);
    if (this.valid(s)) {
      this.set(s);
      this.selectionPos = this.cursorPos = Math.min(s.length, this.cursorPos + text.length);
    }
  }

  insertText(text: string): void {
    this.insert(this.get(), text);
  }

  private keep(keepSelection: boolean): void {
    if (!keepSelection) this.selectionPos = this.cursorPos;
  }

  moveBy(dir: number, keepSelection: boolean, words: boolean): void {
    const s = this.get();
    this.cursorPos = words ? wordPosition(s, dir, this.cursorPos, true) : clamp(this.cursorPos + dir, 0, s.length);
    this.keep(keepSelection);
  }

  removeFromCursor(dir: number, words: boolean): void {
    if (words) this.removeCharsFromCursor(wordPosition(this.get(), dir, this.cursorPos, true) - this.cursorPos);
    else this.removeCharsFromCursor(dir);
  }

  removeCharsFromCursor(dir: number): void {
    const s = this.get();
    if (!s) return;
    let out: string;
    if (this.selectionPos !== this.cursorPos) out = this.deleteSelection(s);
    else {
      const i = clamp(this.cursorPos + dir, 0, s.length);
      const j = Math.min(i, this.cursorPos), k = Math.max(i, this.cursorPos);
      out = s.slice(0, j) + s.slice(k);
      if (dir < 0) this.selectionPos = this.cursorPos = j;
    }
    this.set(out);
  }

  cut(): string {
    const s = this.get();
    const sel = this.selected(s);
    this.set(this.deleteSelection(s));
    return sel;
  }

  paste(text: string): void {
    this.insert(this.get(), text);
    this.selectionPos = this.cursorPos;
  }

  copy(): string {
    return this.selected(this.get());
  }

  selectAll(): void {
    this.selectionPos = 0;
    this.cursorPos = this.get().length;
  }

  private selected(s: string): string {
    return s.substring(Math.min(this.cursorPos, this.selectionPos), Math.max(this.cursorPos, this.selectionPos));
  }

  private deleteSelection(s: string): string {
    if (this.selectionPos === this.cursorPos) return s;
    const i = Math.min(this.cursorPos, this.selectionPos), j = Math.max(this.cursorPos, this.selectionPos);
    this.selectionPos = this.cursorPos = i;
    return s.slice(0, i) + s.slice(j);
  }

  setCursorToStart(keepSelection = false): void {
    this.cursorPos = 0;
    this.keep(keepSelection);
  }

  setCursorToEnd(keepSelection = false): void {
    this.cursorPos = this.get().length;
    this.keep(keepSelection);
  }

  setCursorPos(pos: number, keepSelection: boolean): void {
    this.cursorPos = clamp(pos, 0, this.get().length);
    this.keep(keepSelection);
  }

  setSelectionRange(start: number, end: number): void {
    const n = this.get().length;
    this.cursorPos = clamp(start, 0, n);
    this.selectionPos = clamp(end, 0, n);
  }

  isSelecting(): boolean {
    return this.cursorPos !== this.selectionPos;
  }
}

/** the system clipboard (vanilla KeyboardHandler; what's pasted loses its carriage returns and formatting codes) */
function copyToClipboard(s: string): void {
  if (!s) return;
  try {
    void navigator.clipboard?.writeText(s).catch(() => {});
  } catch {
    // (no clipboard access)
  }
}
function readClipboard(then: (s: string) => void): void {
  try {
    void navigator.clipboard
      ?.readText()
      .then((s) => then(s.replace(/\r/g, '').replace(/§./g, '')))
      .catch(() => {});
  } catch {
    // (no clipboard access)
  }
}

const hasControlDown = (e: KeyboardEvent): boolean => e.ctrlKey || e.metaKey;

// ---------------------------------------------------------------------------
// vanilla PageButton

class PageButton extends Button {
  constructor(private readonly game: Game, x: number, y: number, private readonly isForward: boolean, onPress: () => void, private readonly playTurnSound: boolean) {
    super(x, y, 23, 13, '', onPress);
  }

  override render(g: GuiGraphics, mx: number, my: number): void {
    if (!this.visible) return;
    const hover = this.isMouseOver(mx, my) || this.focused;
    g.sprite(`page_${this.isForward ? 'forward' : 'backward'}${hover ? '_highlighted' : ''}`, this.x, this.y, 23, 13);
  }

  /** vanilla playDownSound: the page's rustle for a book in hand, nothing for a lectern's (it rustles itself) */
  override mouseClicked(mx: number, my: number, b: number): boolean {
    if (b !== 0 || !this.active || !this.isMouseOver(mx, my)) return false;
    if (this.playTurnSound) this.game.sound.playUI('item.book.page_turn', 0.25, 1);
    this.onPress(this);
    return true;
  }
}

// ---------------------------------------------------------------------------
// vanilla BookViewScreen

export class BookViewScreen extends Screen {
  private pages: string[];
  private currentPage = 0;
  private cachedLines: string[] = [];
  private cachedPage = -1;
  private pageMsg = '';
  private forwardButton: PageButton | null = null;
  private backButton: PageButton | null = null;

  constructor(game: Game, pages: string[], private readonly playTurnSound = true) {
    super(game, '');
    this.pages = pages;
  }

  setBookAccess(pages: string[]): void {
    this.pages = pages;
    this.currentPage = clamp(this.currentPage, 0, pages.length);
    this.updateButtonVisibility();
    this.cachedPage = -1;
  }

  setPage(page: number): boolean {
    const i = clamp(page, 0, this.pages.length - 1);
    if (i === this.currentPage) return false;
    this.currentPage = i;
    this.updateButtonVisibility();
    this.cachedPage = -1;
    return true;
  }

  protected forcePage(page: number): boolean {
    return this.setPage(page);
  }

  init(): void {
    this.createMenuControls();
    this.createPageControlButtons();
  }

  protected createMenuControls(): void {
    this.add(new Button(Math.floor(this.width / 2) - 100, 196, 200, 20, 'Done', () => this.onClose()));
  }

  private createPageControlButtons(): void {
    const i = Math.floor((this.width - IMAGE_WIDTH) / 2);
    this.forwardButton = this.add(new PageButton(this.game, i + 116, 159, true, () => this.pageForward(), this.playTurnSound));
    this.backButton = this.add(new PageButton(this.game, i + 43, 159, false, () => this.pageBack(), this.playTurnSound));
    this.updateButtonVisibility();
  }

  protected pageBack(): void {
    if (this.currentPage > 0) this.currentPage--;
    this.updateButtonVisibility();
  }

  protected pageForward(): void {
    if (this.currentPage < this.pages.length - 1) this.currentPage++;
    this.updateButtonVisibility();
  }

  private updateButtonVisibility(): void {
    if (this.forwardButton) this.forwardButton.visible = this.currentPage < this.pages.length - 1;
    if (this.backButton) this.backButton.visible = this.currentPage > 0;
  }

  override keyPressed(e: KeyboardEvent): boolean {
    if (super.keyPressed(e)) return true;
    if (e.key === 'PageUp') {
      this.backButton?.onPress(this.backButton);
      return true;
    }
    if (e.key === 'PageDown') {
      this.forwardButton?.onPress(this.forwardButton);
      return true;
    }
    return false;
  }

  override renderBackground(g: GuiGraphics): void {
    this.game.renderTransparentBackground(g);
    g.sprite('book', Math.floor((this.width - IMAGE_WIDTH) / 2), 2, IMAGE_WIDTH, IMAGE_WIDTH);
  }

  override render(g: GuiGraphics, mx: number, my: number): void {
    this.renderBackground(g);
    for (const w of this.widgets) if (w.visible) w.render(g, mx, my);
    const i = Math.floor((this.width - IMAGE_WIDTH) / 2);
    if (this.cachedPage !== this.currentPage) {
      this.cachedLines = splitText(g.font, this.pages[this.currentPage] ?? '', TEXT_WIDTH);
      this.pageMsg = `Page ${this.currentPage + 1} of ${Math.max(this.pages.length, 1)}`;
    }
    this.cachedPage = this.currentPage;
    g.text(this.pageMsg, i - g.textWidth(this.pageMsg) + IMAGE_WIDTH - 44, 18, BLACK, false);
    const k = Math.min(Math.floor(TEXT_HEIGHT / LINE_HEIGHT), this.cachedLines.length);
    for (let l = 0; l < k; l++) g.text(this.cachedLines[l], i + 36, 32 + l * LINE_HEIGHT, BLACK, false);
  }
}

// ---------------------------------------------------------------------------
// vanilla LecternScreen

export class LecternScreen extends BookViewScreen {
  constructor(game: Game, readonly menu: LecternMenu) {
    super(game, [], false);
    // (its ContainerListener)
    menu.onBookChanged = () => this.bookChanged();
    menu.onPageChanged = () => this.pageChanged();
  }

  override init(): void {
    super.init();
    // (what the menu's first contents and data bring)
    this.bookChanged();
    this.pageChanged();
  }

  protected override createMenuControls(): void {
    if (!mayBuild(this.game.player)) return super.createMenuControls();
    const c = Math.floor(this.width / 2);
    this.add(new Button(c - 100, 196, 98, 20, 'Done', () => this.onClose()));
    this.add(new Button(c + 2, 196, 98, 20, 'Take Book', () => this.menu.clickMenuButton(BUTTON_TAKE_BOOK)));
  }

  protected override pageBack(): void {
    this.menu.clickMenuButton(BUTTON_PREV_PAGE);
  }

  protected override pageForward(): void {
    this.menu.clickMenuButton(BUTTON_NEXT_PAGE);
  }

  protected override forcePage(page: number): boolean {
    if (page === this.menu.getPage()) return false;
    this.menu.clickMenuButton(BUTTON_PAGE_JUMP_RANGE_START + page);
    return true;
  }

  override isPauseScreen(): boolean {
    return false;
  }

  /** (the server closing the menu once it's no longer valid: the book taken, the lectern gone or left behind) */
  override tick(): void {
    if (!this.menu.stillValid(this.game.player) || this.game.player.health <= 0) this.onClose();
  }

  override onClose(): void {
    this.game.setScreen(null);
  }

  override removed(): void {
    this.menu.onBookChanged = this.menu.onPageChanged = null;
    this.menu.removed();
  }

  private bookChanged(): void {
    this.setBookAccess(bookPages(this.menu.getBook()) ?? []);
  }

  private pageChanged(): void {
    this.setPage(this.menu.getPage());
  }
}

// ---------------------------------------------------------------------------
// vanilla BookEditScreen

interface LineInfo {
  contents: string;
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** vanilla BookEditScreen.DisplayCache: the page laid out, with the cursor and the selection */
class DisplayCache {
  constructor(
    readonly fullText: string,
    readonly cursor: [number, number],
    readonly cursorAtEnd: boolean,
    readonly lineStarts: number[],
    readonly lines: LineInfo[],
    readonly selection: Rect[],
  ) {}

  static readonly EMPTY = new DisplayCache('', [0, 0], true, [0], [{ contents: '', x: 0, y: 0 }], []);

  indexAtPosition(font: BitmapFont, x: number, y: number): number {
    const i = Math.floor(y / LINE_HEIGHT);
    if (i < 0) return 0;
    if (i >= this.lines.length) return this.fullText.length;
    return this.lineStarts[i] + indexAtWidth(font, this.lines[i].contents, x);
  }

  changeLine(cursor: number, delta: number): number {
    const i = findLineFromPos(this.lineStarts, cursor);
    const j = i + delta;
    if (j < 0 || j >= this.lineStarts.length) return cursor;
    return this.lineStarts[j] + Math.min(cursor - this.lineStarts[i], this.lines[j].contents.length);
  }

  findLineStart(cursor: number): number {
    return this.lineStarts[findLineFromPos(this.lineStarts, cursor)];
  }

  findLineEnd(cursor: number): number {
    const i = findLineFromPos(this.lineStarts, cursor);
    return this.lineStarts[i] + this.lines[i].contents.length;
  }
}

/** vanilla findLineFromPos (Arrays.binarySearch): the line a character index is on */
function findLineFromPos(starts: number[], pos: number): number {
  let lo = 0, hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] < pos) lo = mid + 1;
    else if (starts[mid] > pos) hi = mid - 1;
    else return mid;
  }
  return lo - 1;
}

export class BookEditScreen extends Screen {
  private isModified = false;
  private isSigning = false;
  private frameTick = 0;
  private currentPage = 0;
  private readonly pages: string[] = [];
  /** the title being typed when signing */
  private bookTitle = '';
  private readonly pageEdit: TextFieldHelper;
  private readonly titleEdit: TextFieldHelper;
  private lastClickTime = 0;
  private lastIndex = -1;
  private forwardButton: PageButton | null = null;
  private backButton: PageButton | null = null;
  private doneButton: Button | null = null;
  private signButton: Button | null = null;
  private finalizeButton: Button | null = null;
  private cancelButton: Button | null = null;
  private displayCache: DisplayCache | null = DisplayCache.EMPTY;
  private pageMsg = '';
  private readonly ownerText: string;

  constructor(game: Game, private readonly owner: Player, private readonly book: ItemStack, private readonly hand: Hand) {
    super(game, '');
    for (const p of book.tag?.pages ?? []) this.pages.push(p);
    if (!this.pages.length) this.pages.push('');
    this.ownerText = `by ${game.playerName}`;
    const font = game.gui.font;
    this.pageEdit = new TextFieldHelper(() => this.getCurrentPageText(), (s) => this.setCurrentPageText(s), (s) => s.length < 1024 && wordWrapHeight(font, s, TEXT_WIDTH) <= TEXT_HEIGHT);
    this.titleEdit = new TextFieldHelper(() => this.bookTitle, (s) => (this.bookTitle = s), (s) => s.length < 16);
  }

  private get font(): BitmapFont {
    return this.game.gui.font;
  }

  private getNumPages(): number {
    return this.pages.length;
  }

  override tick(): void {
    this.frameTick++;
  }

  init(): void {
    this.clearDisplayCache();
    const c = Math.floor(this.width / 2);
    this.signButton = this.add(new Button(c - 100, 196, 98, 20, 'Sign', () => {
      this.isSigning = true;
      this.updateButtonVisibility();
    }));
    this.doneButton = this.add(new Button(c + 2, 196, 98, 20, 'Done', () => {
      this.game.setScreen(null);
      this.saveChanges(false);
    }));
    this.finalizeButton = this.add(new Button(c - 100, 196, 98, 20, 'Sign and Close', () => {
      if (!this.isSigning) return;
      this.saveChanges(true);
      this.game.setScreen(null);
    }));
    this.cancelButton = this.add(new Button(c + 2, 196, 98, 20, 'Cancel', () => {
      if (this.isSigning) this.isSigning = false;
      this.updateButtonVisibility();
    }));
    const i = Math.floor((this.width - IMAGE_WIDTH) / 2);
    this.forwardButton = this.add(new PageButton(this.game, i + 116, 159, true, () => this.pageForward(), true));
    this.backButton = this.add(new PageButton(this.game, i + 43, 159, false, () => this.pageBack(), true));
    this.updateButtonVisibility();
  }

  private pageBack(): void {
    if (this.currentPage > 0) this.currentPage--;
    this.updateButtonVisibility();
    this.clearDisplayCacheAfterPageChange();
  }

  private pageForward(): void {
    if (this.currentPage < this.getNumPages() - 1) this.currentPage++;
    else {
      this.appendPageToBook();
      if (this.currentPage < this.getNumPages() - 1) this.currentPage++;
    }
    this.updateButtonVisibility();
    this.clearDisplayCacheAfterPageChange();
  }

  private updateButtonVisibility(): void {
    if (!this.backButton || !this.forwardButton || !this.doneButton || !this.signButton || !this.cancelButton || !this.finalizeButton) return;
    this.backButton.visible = !this.isSigning && this.currentPage > 0;
    this.forwardButton.visible = !this.isSigning;
    this.doneButton.visible = !this.isSigning;
    this.signButton.visible = !this.isSigning;
    this.cancelButton.visible = this.isSigning;
    this.finalizeButton.visible = this.isSigning;
    this.finalizeButton.active = this.bookTitle.trim() !== '';
  }

  private eraseEmptyTrailingPages(): void {
    while (this.pages.length && this.pages[this.pages.length - 1] === '') this.pages.pop();
  }

  /**
   * vanilla saveChanges: the pages (without empty ones at the end) go to the book in hand
   * (ServerboundEditBookPacket → ServerGamePacketListenerImpl.updateBookContents / signBook)
   */
  private saveChanges(publish: boolean): void {
    if (!this.isModified) return;
    this.eraseEmptyTrailingPages();
    this.updateLocalCopy();
    const pages = this.pages.slice(0, MAX_PAGES);
    const slot = this.hand === 'off' ? 40 : this.owner.inventory.selected;
    const title = publish ? this.bookTitle.trim() : null;
    // (a guest's book is the host's to write in: it does, and the book in hand follows)
    if (this.game.client) return this.game.client.editBook(slot, pages, title);
    writeBook(this.owner, slot, pages, title === null ? null : { title, author: this.game.playerName });
  }

  private updateLocalCopy(): void {
    this.book.tag = { ...(this.book.tag ?? {}), pages: [...this.pages] };
  }

  private appendPageToBook(): void {
    if (this.getNumPages() >= MAX_PAGES) return;
    this.pages.push('');
    this.isModified = true;
  }

  override keyPressed(e: KeyboardEvent): boolean {
    if (super.keyPressed(e)) return true;
    if (this.isSigning) return this.titleKeyPressed(e);
    if (this.bookKeyPressed(e)) {
      this.clearDisplayCache();
      return true;
    }
    return false;
  }

  override charTyped(ch: string): boolean {
    if (super.charTyped(ch)) return true;
    if (this.isSigning) {
      this.titleEdit.charTyped(ch);
      this.updateButtonVisibility();
      this.isModified = true;
      return true;
    }
    if (!allowedChar(ch)) return false;
    this.pageEdit.insertText(ch);
    this.clearDisplayCache();
    return true;
  }

  private bookKeyPressed(e: KeyboardEvent): boolean {
    const ctrl = hasControlDown(e), shift = e.shiftKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (ctrl && !shift && !e.altKey) {
      if (key === 'a') {
        this.pageEdit.selectAll();
        return true;
      }
      if (key === 'c') {
        copyToClipboard(this.pageEdit.copy());
        return true;
      }
      if (key === 'v') {
        readClipboard((s) => {
          this.pageEdit.paste(s);
          this.clearDisplayCache();
        });
        return true;
      }
      if (key === 'x') {
        copyToClipboard(this.pageEdit.cut());
        return true;
      }
    }
    switch (e.key) {
      case 'Enter':
        this.pageEdit.insertText('\n');
        return true;
      case 'Backspace':
        this.pageEdit.removeFromCursor(-1, ctrl);
        return true;
      case 'Delete':
        this.pageEdit.removeFromCursor(1, ctrl);
        return true;
      case 'ArrowRight':
        this.pageEdit.moveBy(1, shift, ctrl);
        return true;
      case 'ArrowLeft':
        this.pageEdit.moveBy(-1, shift, ctrl);
        return true;
      case 'ArrowDown':
        this.changeLine(1, shift);
        return true;
      case 'ArrowUp':
        this.changeLine(-1, shift);
        return true;
      case 'PageUp':
        this.backButton?.onPress(this.backButton);
        return true;
      case 'PageDown':
        this.forwardButton?.onPress(this.forwardButton);
        return true;
      case 'Home':
        if (ctrl) this.pageEdit.setCursorToStart(shift);
        else this.pageEdit.setCursorPos(this.getDisplayCache().findLineStart(this.pageEdit.cursorPos), shift);
        return true;
      case 'End':
        if (ctrl) this.pageEdit.setCursorToEnd(shift);
        else this.pageEdit.setCursorPos(this.getDisplayCache().findLineEnd(this.pageEdit.cursorPos), shift);
        return true;
    }
    return false;
  }

  private changeLine(delta: number, shift: boolean): void {
    this.pageEdit.setCursorPos(this.getDisplayCache().changeLine(this.pageEdit.cursorPos, delta), shift);
  }

  private titleKeyPressed(e: KeyboardEvent): boolean {
    if (e.key === 'Enter') {
      if (this.bookTitle) {
        this.saveChanges(true);
        this.game.setScreen(null);
      }
      return true;
    }
    if (e.key === 'Backspace') {
      this.titleEdit.removeCharsFromCursor(-1);
      this.updateButtonVisibility();
      this.isModified = true;
      return true;
    }
    return false;
  }

  private getCurrentPageText(): string {
    return this.pages[this.currentPage] ?? '';
  }

  private setCurrentPageText(s: string): void {
    if (this.currentPage < 0 || this.currentPage >= this.pages.length) return;
    this.pages[this.currentPage] = s;
    this.isModified = true;
    this.clearDisplayCache();
  }

  override render(g: GuiGraphics, mx: number, my: number): void {
    this.game.renderTransparentBackground(g);
    const i = Math.floor((this.width - IMAGE_WIDTH) / 2);
    g.sprite('book', i, 2, IMAGE_WIDTH, IMAGE_WIDTH);
    for (const w of this.widgets) if (w.visible) w.render(g, mx, my);
    const blink = Math.floor(this.frameTick / 6) % 2 === 0;
    if (this.isSigning) {
      const label = 'Enter Book Title:';
      g.text(label, i + 36 + Math.floor((TEXT_WIDTH - g.textWidth(label)) / 2), 34, BLACK, false);
      // the title and its cursor, black and grey in turn
      const w = g.textWidth(this.bookTitle + '_');
      const x = i + 36 + Math.floor((TEXT_WIDTH - w) / 2);
      g.text(this.bookTitle, x, 50, BLACK, false);
      g.text('_', x + g.textWidth(this.bookTitle), 50, blink ? BLACK : 0xaaaaaa, false);
      g.text(this.ownerText, i + 36 + Math.floor((TEXT_WIDTH - g.textWidth(this.ownerText)) / 2), 60, 0x555555, false);
      g.wrap('Note! When you sign the book, it will no longer be editable.', TEXT_WIDTH).forEach((l, k) => g.text(l, i + 36, 82 + k * LINE_HEIGHT, BLACK, false));
      return;
    }
    const cache = this.getDisplayCache();
    g.text(this.pageMsg, i - g.textWidth(this.pageMsg) + IMAGE_WIDTH - 44, 18, BLACK, false);
    for (const l of cache.lines) g.text(l.contents, l.x, l.y, BLACK, false);
    this.renderHighlight(g, cache.selection);
    if (blink) {
      const [cx, cy] = this.localToScreen(cache.cursor[0], cache.cursor[1]);
      if (!cache.cursorAtEnd) g.fill(cx, cy - 1, cx + 1, cy + 9, 0xff000000);
      else g.text('_', cx, cy, BLACK, false);
    }
  }

  /** vanilla renderHighlight (RenderType.guiTextHighlight: blue, OR_REVERSE over what's there) */
  private renderHighlight(g: GuiGraphics, rects: Rect[]): void {
    const ctx = g.ctx, s = g.scale;
    for (const r of rects) {
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(r.x * s), Math.round(r.y * s), Math.round(r.w * s), Math.round(r.h * s));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#0000ff';
      ctx.fillRect(Math.round(r.x * s), Math.round(r.y * s), Math.round(r.w * s), Math.round(r.h * s));
      ctx.restore();
    }
  }

  private localToScreen(x: number, y: number): [number, number] {
    return [x + Math.floor((this.width - IMAGE_WIDTH) / 2) + 36, y + 32];
  }

  private screenToLocal(x: number, y: number): [number, number] {
    return [x - Math.floor((this.width - IMAGE_WIDTH) / 2) - 36, y - 32];
  }

  override mouseClicked(mx: number, my: number, button: number): boolean {
    if (super.mouseClicked(mx, my, button)) return true;
    if (button === 0) {
      const now = performance.now();
      const [lx, ly] = this.screenToLocal(Math.floor(mx), Math.floor(my));
      const j = this.getDisplayCache().indexAtPosition(this.font, lx, ly);
      if (j >= 0) {
        if (j === this.lastIndex && now - this.lastClickTime < 250) {
          if (!this.pageEdit.isSelecting()) this.selectWord(j);
          else this.pageEdit.selectAll();
        } else this.pageEdit.setCursorPos(j, this.game.input.isDown('ShiftLeft') || this.game.input.isDown('ShiftRight'));
        this.clearDisplayCache();
      }
      this.lastIndex = j;
      this.lastClickTime = now;
    }
    return true;
  }

  private selectWord(index: number): void {
    const s = this.getCurrentPageText();
    this.pageEdit.setSelectionRange(wordPosition(s, -1, index, false), wordPosition(s, 1, index, false));
  }

  override mouseDragged(mx: number, my: number): boolean {
    if (super.mouseDragged(mx, my)) return true;
    const [lx, ly] = this.screenToLocal(Math.floor(mx), Math.floor(my));
    this.pageEdit.setCursorPos(this.getDisplayCache().indexAtPosition(this.font, lx, ly), true);
    this.clearDisplayCache();
    return true;
  }

  private getDisplayCache(): DisplayCache {
    if (!this.displayCache) {
      this.displayCache = this.rebuildDisplayCache();
      this.pageMsg = `Page ${this.currentPage + 1} of ${this.getNumPages()}`;
    }
    return this.displayCache;
  }

  private clearDisplayCache(): void {
    this.displayCache = null;
  }

  private clearDisplayCacheAfterPageChange(): void {
    this.pageEdit.setCursorToEnd();
    this.clearDisplayCache();
  }

  private rebuildDisplayCache(): DisplayCache {
    const s = this.getCurrentPageText();
    if (!s) return DisplayCache.EMPTY;
    const font = this.font;
    const i = this.pageEdit.cursorPos, j = this.pageEdit.selectionPos;
    const starts: number[] = [];
    const lines: LineInfo[] = [];
    let endsWithNewline = false;
    splitLines(font, s, TEXT_WIDTH, true, (a, b) => {
      const k = lines.length;
      const part = s.substring(a, b);
      endsWithNewline = part.endsWith('\n');
      const [x, y] = this.localToScreen(0, k * LINE_HEIGHT);
      starts.push(a);
      lines.push({ contents: part.replace(/[ \n]+$/, ''), x, y });
    });
    const atEnd = i === s.length;
    let cursor: [number, number];
    if (atEnd && endsWithNewline) cursor = [0, lines.length * LINE_HEIGHT];
    else {
      const k = findLineFromPos(starts, i);
      cursor = [font.width(s.substring(starts[k], i)), k * LINE_HEIGHT];
    }
    const sel: Rect[] = [];
    if (i !== j) {
      const lo = Math.min(i, j), hi = Math.max(i, j);
      const a = findLineFromPos(starts, lo), b = findLineFromPos(starts, hi);
      if (a === b) sel.push(this.partialLineSelection(s, lo, hi, a * LINE_HEIGHT, starts[a]));
      else {
        const aEnd = a + 1 > starts.length ? s.length : starts[a + 1];
        sel.push(this.partialLineSelection(s, lo, aEnd, a * LINE_HEIGHT, starts[a]));
        for (let k = a + 1; k < b; k++) {
          const w = font.width(s.substring(starts[k], starts[k + 1]));
          sel.push(this.selection(0, k * LINE_HEIGHT, w, k * LINE_HEIGHT + LINE_HEIGHT));
        }
        sel.push(this.partialLineSelection(s, starts[b], hi, b * LINE_HEIGHT, starts[b]));
      }
    }
    return new DisplayCache(s, cursor, atEnd, starts, lines, sel);
  }

  private partialLineSelection(s: string, start: number, end: number, y: number, lineStart: number): Rect {
    const font = this.font;
    return this.selection(font.width(s.substring(lineStart, start)), y, font.width(s.substring(lineStart, end)), y + LINE_HEIGHT);
  }

  private selection(x1: number, y1: number, x2: number, y2: number): Rect {
    const [ax, ay] = this.localToScreen(x1, y1), [bx, by] = this.localToScreen(x2, y2);
    return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
  }
}
