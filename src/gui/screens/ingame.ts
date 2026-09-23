// In-game screens: pause menu, death screen, level loading, chat.

import type { Game } from '../../game/game';
import { Screen, Button, EditBox } from '../screen';
import type { GuiGraphics } from '../guiGraphics';
import { OptionsScreen } from './options';
import { ConfirmScreen, GenericMessageScreen } from './menus';
import { suggestCommand } from '../../game/commands';

export class PauseScreen extends Screen {
  constructor(game: Game) {
    super(game, 'Game Menu');
  }

  init(): void {
    const g = this.game;
    // vanilla GridLayout: 2 columns of (98 + 8), padding 4/4/4/0, first row paddingTop 50,
    // aligned at (0.5, 0.25) of the screen
    const gridW = 212, gridH = 70 + 24 * 4;
    const gx = Math.floor((this.width - gridW) * 0.5);
    const gy = Math.floor((this.height - gridH) * 0.25);
    const col = (c: number) => gx + c * 106 + 4;
    const row = (r: number) => (r === 0 ? gy + 50 : gy + 70 + (r - 1) * 24 + 4);
    this.add(new Button(col(0), row(0), 204, 20, 'Back to Game', () => g.setScreen(null)));
    this.add(new Button(col(0), row(1), 98, 20, 'Advancements', () => g.advancementsScreenFactory && g.setScreen(g.advancementsScreenFactory())));
    this.add(new Button(col(1), row(1), 98, 20, 'Statistics', () => {})).active = false;
    this.add(new Button(col(0), row(2), 98, 20, 'Give Feedback', () => {})).active = false;
    this.add(new Button(col(1), row(2), 98, 20, 'Report Bugs', () => {})).active = false;
    this.add(new Button(col(0), row(3), 98, 20, 'Options...', () => g.setScreen(new OptionsScreen(g, this))));
    this.add(new Button(col(1), row(3), 98, 20, 'Open to LAN', () => {})).active = false;
    const quit = this.add(
      new Button(col(0), row(4), 204, 20, 'Save and Quit to Title', () => {
        quit.active = false;
        void g.quitToTitle(new GenericMessageScreen(g, 'Saving world'));
      }),
    );
  }

  override titleY(): number {
    return 40;
  }
}

// ---------------------------------------------------------------------------

export class DeathScreen extends Screen {
  private delay = 0;
  private buttons: Button[] = [];
  constructor(game: Game, private readonly cause: string, private readonly hardcore: boolean) {
    super(game, hardcore ? 'Game Over!' : 'You Died!');
  }

  init(): void {
    const g = this.game;
    const cx = Math.floor(this.width / 2);
    const y = Math.floor(this.height / 4);
    this.buttons = [
      this.add(
        new Button(cx - 100, y + 72, 200, 20, this.hardcore ? 'Spectate World' : 'Respawn', () => {
          if (this.hardcore) {
            g.player.setGameMode('spectator');
            g.respawnInPlace();
          } else g.respawn();
        }),
      ),
      this.add(
        new Button(cx - 100, y + 96, 200, 20, 'Title Screen', () => {
          if (this.hardcore) {
            void g.quitToTitle(new GenericMessageScreen(g, 'Saving world'));
            return;
          }
          g.setScreen(
            new ConfirmScreen(g, 'Are you sure you want to quit?', '', 'Title Screen', 'Respawn', (ok) => {
              if (ok) void g.quitToTitle(new GenericMessageScreen(g, 'Saving world'));
              else g.respawn();
            }),
          );
        }),
      ),
    ];
    for (const b of this.buttons) b.active = this.delay >= 20;
  }

  override isPauseScreen(): boolean {
    return false;
  }

  override shouldCloseOnEsc(): boolean {
    return false;
  }

  override tick(): void {
    if (++this.delay === 20) for (const b of this.buttons) b.active = true;
  }

  override renderBackground(g: GuiGraphics): void {
    g.fillGradient(0, 0, this.width, this.height, 0x60500000, 0xa0803030);
  }

  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    this.renderBackground(g);
    for (const w of this.widgets) w.render(g, mx, my);
    g.pushTransform(0, 0, 0, 2);
    g.centered(this.title, Math.floor(this.width / 2 / 2), 30, 0xffffff, true);
    g.popTransform();
    g.centered(this.cause, this.width / 2, 85, 0xffffff, true);
    g.centered(`Score: §e${this.game.player.xpTotal}`, this.width / 2, 100, 0xffffff, true);
    void partial;
  }
}

// ---------------------------------------------------------------------------

/** vanilla ReceivingLevelScreen: "Loading terrain..." until the chunks round the player are in (over the portal's swirl after a nether portal) */
export class ReceivingLevelScreen extends Screen {
  /** (the mouse stays grabbed: the game carries straight on afterwards) */
  readonly keepsMouse = true;
  constructor(game: Game, readonly portal: boolean) {
    super(game, '');
  }
  init(): void {}
  override isPauseScreen(): boolean {
    return false;
  }
  override shouldCloseOnEsc(): boolean {
    return false;
  }
  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    if (!this.portal) this.renderBackground(g);
    g.centered('Loading terrain...', Math.floor(this.width / 2), Math.floor(this.height / 2) - 50, 0xffffff, true);
    void mx;
    void my;
    void partial;
  }
}

/** vanilla LevelLoadingScreen: chunk status map + percentage */
export class LevelLoadingScreen extends Screen {
  constructor(game: Game) {
    super(game, '');
  }
  init(): void {}
  override isPauseScreen(): boolean {
    return false;
  }
  override shouldCloseOnEsc(): boolean {
    return false;
  }
  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    this.renderBackground(g);
    const game = this.game;
    const R = 5;
    const cx = Math.floor(this.width / 2), cy = Math.floor(this.height / 2);
    const p = game.player;
    const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
    let ready = 0, total = 0;
    const d = R * 2 + 1;
    const x0 = cx - d, y0 = cy - d;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const c = game.world.getChunk(pcx + dx, pcz + dz);
        let col = 0x545454;
        if (c) col = c.meshed === 0 ? 0x21c600 : c.dirty ? 0xffe0a0 : 0xffffff;
        if (Math.abs(dx) <= 2 && Math.abs(dz) <= 2) {
          total++;
          if (c && !c.dirty) ready++;
        }
        const x = x0 + (dx + R) * 2, y = y0 + (dz + R) * 2;
        g.fill(x, y, x + 2, y + 2, 0xff000000 | col);
      }
    const pct = Math.min(100, Math.floor((ready / Math.max(1, total)) * 100));
    g.centered(`${pct}%`, cx, cy - 4 - 30, 0xffffff, true);
    void mx;
    void my;
    void partial;
  }
}

// ---------------------------------------------------------------------------

export class ChatScreen extends Screen {
  readonly isChat = true;
  protected input!: EditBox;
  private historyPos = -1;
  private draft = '';
  private suggestions: string[] = [];
  private suggestStart = 0;
  private selected = 0;
  private suggestOffset = 0;
  private suggestionsFor = '';
  private hideSuggestions = false;

  constructor(game: Game, private readonly initial: string) {
    super(game, '');
  }

  init(): void {
    const prev = this.input?.value ?? this.initial;
    this.input = this.add(new EditBox(4, this.height - 12, this.width - 4, 12, prev));
    this.input.bordered = false;
    this.input.maxLength = 256;
    this.input.focused = true;
    this.input.onChange = () => {
      this.hideSuggestions = false;
      this.updateSuggestions();
    };
    this.updateSuggestions();
  }

  override isPauseScreen(): boolean {
    return false;
  }

  override renderBackground(): void {}

  private updateSuggestions(): void {
    const v = this.input.value;
    if (v === this.suggestionsFor) return;
    this.suggestionsFor = v;
    this.suggestions = [];
    if (!v.startsWith('/') || !this.game.opts.autoSuggestions || this.hideSuggestions) return;
    const text = v.slice(1, this.input.cursor);
    const r = suggestCommand(this.game, text);
    this.suggestStart = r.start + 1;
    this.suggestions = r.list;
    this.selected = 0;
    this.suggestOffset = 0;
  }

  override keyPressed(e: KeyboardEvent): boolean {
    const inp = this.input;
    if (e.key === 'Escape') {
      if (this.suggestions.length) {
        this.suggestions = [];
        this.hideSuggestions = true;
        return true;
      }
      this.game.setScreen(null);
      return true;
    }
    if (e.key === 'Enter') {
      const v = inp.value;
      this.game.setScreen(null);
      this.game.sendChat(v);
      return true;
    }
    if (e.key === 'Tab') {
      this.hideSuggestions = false;
      this.suggestionsFor = '';
      this.updateSuggestions();
      if (this.suggestions.length) {
        const s = this.suggestions[this.selected];
        inp.value = inp.value.slice(0, this.suggestStart) + s + inp.value.slice(inp.cursor);
        inp.cursor = this.suggestStart + s.length;
        this.suggestionsFor = inp.value;
        this.selected = (this.selected + (e.shiftKey ? -1 + this.suggestions.length : 1)) % this.suggestions.length;
      }
      return true;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      if (this.suggestions.length) {
        this.selected = (this.selected + dir + this.suggestions.length) % this.suggestions.length;
        if (this.selected < this.suggestOffset) this.suggestOffset = this.selected;
        if (this.selected >= this.suggestOffset + 10) this.suggestOffset = this.selected - 9;
        return true;
      }
      const hist = this.game.chatHistory;
      if (!hist.length) return true;
      if (this.historyPos === -1) {
        if (dir > 0) return true;
        this.draft = inp.value;
        this.historyPos = hist.length;
      }
      this.historyPos = Math.max(0, Math.min(hist.length, this.historyPos + dir));
      inp.value = this.historyPos === hist.length ? this.draft : hist[this.historyPos];
      inp.cursor = inp.value.length;
      if (this.historyPos === hist.length) this.historyPos = -1;
      this.hideSuggestions = true;
      this.suggestionsFor = '';
      this.updateSuggestions();
      return true;
    }
    return super.keyPressed(e);
  }

  override mouseScrolled(_mx: number, _my: number, d: number): boolean {
    if (this.suggestions.length > 10) {
      this.suggestOffset = Math.max(0, Math.min(this.suggestions.length - 10, this.suggestOffset - Math.sign(d)));
      return true;
    }
    return false;
  }

  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    this.updateSuggestions();
    g.fill(2, this.height - 14, this.width - 2, this.height - 2, 0x80000000);
    this.input.render(g, mx, my);
    // ghost completion of the selected suggestion
    const v = this.input.value;
    if (this.suggestions.length && this.input.cursor === v.length) {
      const s = this.suggestions[this.selected];
      const typed = v.slice(this.suggestStart);
      const bare = s.startsWith('minecraft:') && !typed.startsWith('minecraft:') ? s.slice(10) : s;
      if (bare.startsWith(typed) && bare.length > typed.length) g.text(bare.slice(typed.length), 4 + g.textWidth(v), this.height - 12 + 2, 0x808080, true);
    }
    if (this.suggestions.length) this.renderSuggestions(g);
    void partial;
  }

  private renderSuggestions(g: GuiGraphics): void {
    const shown = this.suggestions.slice(this.suggestOffset, this.suggestOffset + 10);
    let w = 0;
    for (const s of shown) w = Math.max(w, g.textWidth(s));
    const x = Math.min(4 + g.textWidth(this.input.value.slice(0, this.suggestStart)), this.width - w - 4);
    const h = shown.length * 12;
    const y = this.height - 12 - 3 - h;
    g.fill(x - 1, y, x + w + 1, y + h, 0xd0000000);
    shown.forEach((s, i) => {
      const idx = i + this.suggestOffset;
      g.text(s, x, y + 2 + i * 12, idx === this.selected ? 0xffff00 : 0xaaaaaa, true);
    });
    // scroll hints
    if (this.suggestOffset > 0) for (let i = 0; i < w; i += 2) g.fill(x + i, y - 1, x + i + 1, y, 0xffffffff);
    if (this.suggestOffset + 10 < this.suggestions.length) for (let i = 0; i < w; i += 2) g.fill(x + i, y + h, x + i + 1, y + h + 1, 0xffffffff);
  }
}

/** vanilla InBedChatScreen: chat with a "Leave Bed" button while asleep */
export class InBedChatScreen extends ChatScreen {
  readonly inBed = true;

  constructor(game: Game) {
    super(game, '');
  }

  private leaveBed!: Button;

  override init(): void {
    super.init();
    this.leaveBed = this.add(new Button(Math.floor(this.width / 2) - 100, this.height - 40, 200, 20, 'Leave Bed', () => this.game.leaveBed()));
  }

  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    super.render(g, mx, my, partial);
    this.leaveBed.render(g, mx, my);
  }

  override keyPressed(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.game.leaveBed();
      return true;
    }
    if (e.key === 'Enter') {
      this.game.sendChat(this.input.value);
      this.input.value = '';
      this.input.cursor = 0;
      return true;
    }
    return super.keyPressed(e);
  }

  /** vanilla onPlayerWokeUp: keep a half-typed message in a normal chat screen */
  onPlayerWokeUp(): void {
    const v = this.input.value;
    this.game.setScreen(v ? new ChatScreen(this.game, v) : null);
  }
}
