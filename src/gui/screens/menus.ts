// Out-of-game menus: title screen, world selection/creation, confirm and
// message screens (vanilla 1.21 layouts and strings).

import type { Game } from '../../game/game';
import { Screen, Button, CycleButton, EditBox, IconButton, playClick } from '../screen';
import { ScrollList } from '../list';
import type { GuiGraphics } from '../guiGraphics';
import { OptionsScreen, LanguageScreen, AccessibilityOptionsScreen, DIFFICULTY_NAMES, DIFFICULTY_INFO } from './options';
import { WorldMeta, listWorlds, saveWorldMeta, deleteWorld } from '../../storage/worldStore';
import { tidyUpInterruptedImport } from '../../storage/worldTransfer';
import { makeBackup, importWorldFiles, pickWorldFiles, WorldFileDrop } from './worldFiles';
import { JoinMultiplayerScreen } from './multiplayer';
import { MULTIPLAYER_ENABLED } from '../../net/config';
import { GAME_NAME, GAME_VERSION, SOURCE_URL } from '../../brand';
import { WinScreen } from './winScreen';

const SPLASHES = [
  'Blocky and proud!', 'Now with 100% more cubes!', 'Hand-placed pixels!', 'Punch a tree!', "Don't dig straight down!",
  'Watch out for lava!', 'Sunrise every twenty minutes!', 'Water flows downhill!', 'Infinite-ish!', 'Made in a browser!',
  'Runs on WebGL!', 'Mind the gravel!', 'Craft responsibly!', 'Batteries not included!', 'Squares all the way down!',
  'Surprisingly square!', 'Fresh from the chunk oven!', 'Seed-driven!', 'Procedurally lovely!', 'Build a hut before night!',
  'Bring a torch!', 'Low poly, high hopes!', 'Every block counts!', 'Smooth lighting!', 'Now with sunsets!',
  'Look at the clouds!', 'One more block!', 'Stacks to 64!', 'Diamonds are rare!', 'Coal is common!', 'Sprint jump!',
  'Sneak on edges!', 'Fully voxelated!', 'Ambient occlusion!', 'Biomes galore!', 'Mountains ahead!', 'Oceans are deep!',
  'Swamps are murky!', 'Deserts are dry!', 'Taigas are cozy!', 'Press F3 for secrets!', 'F5 to see yourself!',
  'Digging is fun!', 'Hello, voxel world!', 'Handcrafted noise!', 'Perlin approved!', 'Sixteen by sixteen!',
  'Sandbox!', 'Adventure awaits!', "Don't feed the lava!", 'Night falls fast!', 'Cubes, not spheres!', 'Tall grass sways!',
  'Mine the mountain!', 'Caves echo!', 'Snowy peaks!', 'Now in stereo!', 'Sixty frames of fun!', 'Pixel perfect!',
  'Grass is green-ish!', 'The sky is the limit!', 'Try the chat commands!', 'Chop, chop!', 'Rain or shine!',
  'Made from scratch!', 'No assets, all code!', 'Every pixel drawn in code!', 'Every sound synthesized!',
];

function pickSplash(): string {
  const d = new Date();
  const m = d.getMonth() + 1, day = d.getDate();
  if (m === 12 && day === 24) return 'Merry X-mas!';
  if (m === 1 && day === 1) return 'Happy new year!';
  if (m === 10 && day === 31) return 'OOoooOOOoooo! Spooky!';
  return SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
}

/** the title screen's bottom right corner (vanilla's "Copyright Mojang AB. Do not distribute!", and like it a way to the credits) */
const UNOFFICIAL = 'Not an official Minecraft product';

/** a phone or a tablet, with no mouse or trackpad to play with (a stylus that hovers isn't one: so by its name too) */
export function touchOnly(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0 && typeof matchMedia === 'function' && !matchMedia('(any-hover: hover)').matches);
}

let toldItNeedsKeys = false;

/**
 * Going on from the title screen on a phone or a tablet, the first time: the game has no touch controls yet, and says
 * so, the way vanilla warns before Multiplayer (SafetyScreen: what to know, then Proceed or Back). Anywhere else, and
 * once told, straight on to `next`.
 */
export function afterKeyboardWarning(game: Game, back: Screen, next: () => Screen): Screen {
  if (toldItNeedsKeys || !touchOnly()) return next();
  const what = `${GAME_NAME} has no touch controls yet: it is played with a keyboard and a mouse. Open this page on a computer to play. You can still look around here.`;
  return new ConfirmScreen(game, 'Keyboard and Mouse Needed', what, 'Proceed', 'Back', (ok) => {
    toldItNeedsKeys ||= ok;
    game.setScreen(ok ? next() : back);
  });
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clampedMap = (v: number, a: number, b: number, c: number, d: number) => c + clamp01((v - a) / (b - a)) * (d - c);

export class TitleScreen extends Screen {
  readonly isTitle = true;
  private readonly splash = pickSplash();
  private fadeInStart = 0;
  private overlayFadeStart = 0;

  constructor(game: Game, private fading: boolean) {
    super(game, '');
  }

  init(): void {
    const g = this.game;
    const cx = Math.floor(this.width / 2);
    const l = Math.floor(this.height / 4) + 48;
    this.add(new Button(cx - 100, l, 200, 20, 'Singleplayer', () => g.setScreen(afterKeyboardWarning(g, this, () => new SelectWorldScreen(g, this)))));
    // (multiplayer/ switched off, the button stays greyed out, as it was)
    this.add(new Button(cx - 100, l + 24, 200, 20, 'Multiplayer', () => g.setScreen(afterKeyboardWarning(g, this, () => new JoinMultiplayerScreen(g, this))))).active = MULTIPLAYER_ENABLED;
    // (where vanilla has Minecraft Realms: the game's source, in a tab of its own)
    this.add(new Button(cx - 100, l + 48, 200, 20, 'Source Code...', () => void window.open(SOURCE_URL, '_blank', 'noopener')));
    this.add(new IconButton(cx - 124, l + 84, 'icon_language', () => g.setScreen(new LanguageScreen(g, this)), 'Language'));
    this.add(new Button(cx - 100, l + 84, 98, 20, 'Options...', () => g.setScreen(new OptionsScreen(g, this))));
    this.add(new Button(cx + 2, l + 84, 98, 20, 'Quit Game', () => quitGame()));
    this.add(new IconButton(cx + 104, l + 84, 'icon_accessibility', () => g.setScreen(new AccessibilityOptionsScreen(g, this)), 'Accessibility Settings...'));
  }

  override isPauseScreen(): boolean {
    return false;
  }

  override shouldCloseOnEsc(): boolean {
    return false;
  }

  override renderBackground(): void {
    /* panorama is drawn by the game */
  }

  private startupReady(): boolean {
    const p = this.game.panorama;
    return !p || p.state === 'ready';
  }

  override mouseClicked(mx: number, my: number, button: number): boolean {
    if (!this.startupReady()) return false;
    if (super.mouseClicked(mx, my, button)) return true;
    // (vanilla: the line in the corner is a button to the credits, which here say how the game was made)
    if (button !== 0 || !this.overCorner(mx, my)) return false;
    playClick();
    this.game.setScreen(new WinScreen(this.game, false, () => this.game.setScreen(this)));
    return true;
  }

  /** whether the mouse is over the bottom right corner's line */
  private overCorner(mx: number, my: number): boolean {
    return mx >= this.width - this.game.gui.textWidth(UNOFFICIAL) - 2 && mx < this.width - 2 && my >= this.height - 11 && my < this.height;
  }

  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    const now = performance.now();
    if (!this.startupReady()) {
      this.game.panoramaFade = 0;
      this.renderStartupOverlay(g, 1);
      return;
    }
    if (this.fading && !this.overlayFadeStart) this.overlayFadeStart = now;
    let f = 1;
    if (this.fading) {
      if (!this.fadeInStart) this.fadeInStart = now;
      const f1 = (now - this.fadeInStart) / 2000;
      if (f1 > 1) {
        this.fading = false;
        this.game.panoramaFade = 1;
      } else {
        f = clampedMap(f1, 0.5, 1, 0, 1);
        this.game.panoramaFade = clampedMap(f1, 0, 0.5, 0, 1);
      }
    } else this.game.panoramaFade = 1;
    g.pushAlpha(f);
    for (const w of this.widgets) if (w.visible) w.render(g, mx, my);
    this.renderLogo(g);
    if (!this.game.opts.hideSplashTexts) this.renderSplash(g);
    g.text(`${GAME_NAME} ${GAME_VERSION}`, 2, this.height - 10, 0xffffff, true);
    // (where vanilla has "Copyright Mojang AB. Do not distribute!", underlined like it with the mouse over it)
    g.text(UNOFFICIAL, this.width - g.textWidth(UNOFFICIAL) - 2, this.height - 10, 0xffffff, true);
    if (f >= 1 && this.overCorner(mx, my)) g.fill(this.width - g.textWidth(UNOFFICIAL) - 2, this.height - 1, this.width - 2, this.height, 0xffffffff);
    g.popAlpha();
    if (f >= 1) this.renderTooltip(g, mx, my);
    // startup overlay fading out on top (vanilla LoadingOverlay, 1s)
    if (this.overlayFadeStart) {
      const a = 1 - (now - this.overlayFadeStart) / 1000;
      if (a > 0) this.renderStartupOverlay(g, a);
    }
    void partial;
  }

  private renderLogo(g: GuiGraphics): void {
    const cx = Math.floor(this.width / 2);
    const y = 30;
    if (!g.sprite('title_logo', cx - (g.spriteWidth('title_logo') >> 1), y)) g.centered(GAME_NAME.toUpperCase(), this.width / 2, y + 16, 0xffffff, true);
    g.sprite('title_edition', cx - 64, y + 37);
  }

  private renderSplash(g: GuiGraphics): void {
    const t = (performance.now() % 1000) / 1000;
    let f = 1.8 - Math.abs(Math.sin(t * Math.PI * 2) * 0.1);
    f = (f * 100) / (g.textWidth(this.splash) + 32);
    // (over the logo's end: 123 right of the middle for a logo 274 wide)
    g.pushTransform(this.width / 2 + ((g.spriteWidth('title_logo') || 274) >> 1) - 14, 69, -20, f);
    g.text(this.splash, -Math.floor(g.textWidth(this.splash) / 2), -8, 0xffff00, true);
    g.popTransform();
  }

  /** black startup overlay with the vanilla-style progress bar */
  private renderStartupOverlay(g: GuiGraphics, alpha: number): void {
    const W = g.width, H = g.height;
    g.pushAlpha(alpha);
    g.fill(0, 0, W, H, 0xff000000);
    // (where vanilla has Mojang's logo: the game's own, and how it was made, while its textures and sounds are)
    const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
    g.sprite('title_logo', cx - (g.spriteWidth('title_logo') >> 1), cy - 50);
    g.centered(`Made from scratch, in code, by Claude Opus 5.5:`, cx, cy + 8, 0xa0a0a0, false);
    g.centered('every texture, every sound, every world.', cx, cy + 20, 0xa0a0a0, false);
    const d1 = Math.min(W * 0.75, H) * 0.25;
    const k1 = Math.floor(d1 * 4 * 0.5);
    const y = Math.floor(H * 0.8325);
    const x0 = Math.floor(W / 2) - k1, x1 = Math.floor(W / 2) + k1, y0 = y - 5, y1 = y + 5;
    const prog = this.game.panorama?.progressFraction ?? 1;
    const fillW = Math.ceil((x1 - x0 - 2) * prog);
    const c = 0xffffffff;
    g.fill(x0 + 2, y0 + 2, x0 + fillW, y1 - 2, c);
    g.fill(x0 + 1, y0, x1 - 1, y0 + 1, c);
    g.fill(x0 + 1, y1, x1 - 1, y1 - 1, c);
    g.fill(x0 + 1, y1 - 1, x1 - 1, y1, c);
    g.fill(x0, y0, x0 + 1, y1, c);
    g.fill(x1 - 1, y0, x1, y1, c);
    g.popAlpha();
  }
}

function quitGame(): void {
  window.close();
  setTimeout(() => {
    location.href = 'about:blank';
  }, 200);
}

// ---------------------------------------------------------------------------

export class ConfirmScreen extends Screen {
  private lines: string[] = [];
  constructor(game: Game, title: string, private readonly message: string, private readonly yes: string, private readonly no: string, private readonly callback: (ok: boolean) => void) {
    super(game, title);
  }
  init(): void {
    this.lines = this.game.gui.wrap(this.message, this.width - 50);
    const y = Math.max(Math.floor(this.height / 6) + 96, Math.min(this.height - 24, this.messageTop() + this.lines.length * 9 + 20));
    const cx = Math.floor(this.width / 2);
    this.add(new Button(cx - 155, y, 150, 20, this.yes, () => this.callback(true)));
    this.add(new Button(cx - 155 + 160, y, 150, 20, this.no, () => this.callback(false)));
  }
  private titleTop(): number {
    const i = Math.floor((this.height - this.lines.length * 9) / 2);
    return Math.max(10, Math.min(80, i - 20 - 9));
  }
  private messageTop(): number {
    return this.titleTop() + 20;
  }
  override titleY(): number {
    return this.titleTop();
  }
  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    super.render(g, mx, my, partial);
    let y = this.messageTop();
    for (const l of this.lines) {
      g.centered(l, this.width / 2, y, 0xffffff, true);
      y += 9;
    }
  }
  override onClose(): void {
    this.callback(false);
  }
}

/** "Saving world" etc. */
export class GenericMessageScreen extends Screen {
  constructor(game: Game, title: string) {
    super(game, title);
  }
  init(): void {}
  override shouldCloseOnEsc(): boolean {
    return false;
  }
  override titleY(): number {
    return Math.floor(this.height / 2) - 4;
  }
}

// ---------------------------------------------------------------------------
// World selection

const GAME_MODE_NAMES: Record<string, string> = { survival: 'Survival Mode', creative: 'Creative Mode', adventure: 'Adventure Mode', spectator: 'Spectator Mode' };

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { year: '2-digit', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

class WorldList extends ScrollList<WorldMeta> {
  constructor(private readonly screen: SelectWorldScreen, w: number, top: number, h: number) {
    super(0, top, w, h, 36, 270);
  }
  renderEntry(g: GuiGraphics, e: WorldMeta, _i: number, left: number, top: number, width: number, _h: number, mx: number, my: number, hovered: boolean): void {
    const maxW = width - 32 - 3;
    let name = e.name || 'New World';
    if (g.textWidth(name) > maxW) {
      while (name.length > 1 && g.textWidth(name + '...') > maxW) name = name.slice(0, -1);
      name += '...';
    }
    g.text(name, left + 35, top + 1, 0xffffff, true);
    g.text(`${e.id} (${formatDate(e.lastPlayed)})`, left + 35, top + 12, 0x808080, true);
    const mode = e.hardcore ? '§cHardcore Mode!§7' : GAME_MODE_NAMES[e.gameMode] ?? 'Survival Mode';
    g.text(`${mode}${e.allowCommands ? ', Cheats' : ''}, Version: ${GAME_VERSION}`, left + 35, top + 21, 0x808080, true);
    if (!g.sprite('world_icon_unknown', left, top, 32, 32, 0, 0, 64, 64)) g.fill(left, top, left + 32, top + 32, 0xff606060);
    if (hovered) {
      g.fill(left, top, left + 32, top + 32, 0xa0909090);
      g.sprite(mx - left < 32 ? 'join_highlighted' : 'join', left, top, 32, 32);
    }
    void my;
  }
  override onEntryClicked(e: WorldMeta, _i: number, mx: number, _my: number, _b: number, dbl: boolean): boolean {
    this.screen.updateButtons();
    if (mx - this.rowLeft() <= 32 || dbl) this.screen.play(e);
    return true;
  }
}

export class SelectWorldScreen extends Screen {
  private list!: WorldList;
  private search!: EditBox;
  private all: WorldMeta[] | null = null;
  private playBtn!: Button;
  private editBtn!: Button;
  private deleteBtn!: Button;
  private recreateBtn!: Button;
  private searchText = '';
  /** after an import: the world to select once the list is read again */
  private selectId: string | null = null;
  /** world files dropped on the list are imported */
  private readonly drop = new WorldFileDrop((files) => this.importFiles(files));
  constructor(game: Game, parent: Screen | null) {
    super(game, 'Select World');
    this.parent = parent;
  }

  init(): void {
    const cx = Math.floor(this.width / 2);
    const prevSel = this.list?.selected ?? null;
    // (vanilla has no Import World: it takes the search row's last column, over Back, and the search box the rest)
    this.search = this.add(new EditBox(cx - 154, 22, 230, 20, this.searchText));
    this.add(new Button(cx + 82, 22, 72, 20, 'Import World', () => pickWorldFiles((files) => this.importFiles(files)), 'Drag and drop world files into this window to import them'));
    this.drop.install();
    this.search.onChange = (v) => {
      this.searchText = v;
      this.refilter();
    };
    this.list = this.add(new WorldList(this, this.width, 48, this.height - 112));
    this.playBtn = this.add(new Button(cx - 154, this.height - 52, 150, 20, 'Play Selected World', () => this.list.selected && this.play(this.list.selected)));
    this.add(new Button(cx + 4, this.height - 52, 150, 20, 'Create New World', () => this.game.setScreen(new CreateWorldScreen(this.game, this))));
    this.editBtn = this.add(new Button(cx - 154, this.height - 28, 72, 20, 'Edit', () => this.list.selected && this.game.setScreen(new EditWorldScreen(this.game, this, this.list.selected))));
    this.deleteBtn = this.add(new Button(cx - 76, this.height - 28, 72, 20, 'Delete', () => this.confirmDelete()));
    this.recreateBtn = this.add(new Button(cx + 4, this.height - 28, 72, 20, 'Re-Create', () => this.list.selected && this.game.setScreen(new CreateWorldScreen(this.game, this, this.list.selected))));
    this.add(new Button(cx + 82, this.height - 28, 72, 20, 'Back', () => this.onClose()));
    if (this.all) {
      this.refilter();
      if (prevSel) this.list.selected = this.list.entries.find((w) => w.id === prevSel.id) ?? null;
    } else void this.load();
    this.updateButtons();
  }

  private async load(): Promise<void> {
    await tidyUpInterruptedImport();
    this.all = await listWorlds();
    if (!this.all.length) {
      // (Cancel comes back to the empty list rather than the title, for Import World)
      this.game.setScreen(new CreateWorldScreen(this.game, this));
      return;
    }
    this.refilter();
    if (this.selectId) {
      const i = this.list.entries.findIndex((w) => w.id === this.selectId);
      if (i >= 0) {
        this.list.selected = this.list.entries[i];
        this.list.ensureVisible(i);
      }
      this.selectId = null;
      this.updateButtons();
    }
  }

  /** Import World: back here once they're in, with the list read again and the new world selected */
  private importFiles(files: File[]): void {
    void importWorldFiles(this.game, files, (imported) => {
      this.all = null;
      if (imported) {
        this.selectId = imported.id;
        this.searchText = '';
      }
      this.game.setScreen(this);
    });
  }

  override removed(): void {
    this.drop.remove();
  }

  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    super.render(g, mx, my, partial);
    // (world files dragged over the page: the list lights up to take them)
    if (this.drop.dragging) {
      const l = this.list;
      g.fill(0, l.y, this.width, l.bottom, 0x30ffffff);
      g.fill(0, l.y, this.width, l.y + 1, 0xffffffff);
      g.fill(0, l.bottom - 1, this.width, l.bottom, 0xffffffff);
    }
  }

  private refilter(): void {
    const q = this.searchText.toLowerCase();
    this.list.entries = (this.all ?? []).filter((w) => !q || w.name.toLowerCase().includes(q) || w.id.toLowerCase().includes(q));
    if (this.list.selected && !this.list.entries.includes(this.list.selected)) this.list.selected = null;
    this.updateButtons();
  }

  updateButtons(): void {
    const sel = !!this.list?.selected;
    for (const b of [this.playBtn, this.editBtn, this.deleteBtn, this.recreateBtn]) if (b) b.active = sel;
  }

  play(meta: WorldMeta): void {
    void this.game.startWorld(meta);
  }

  private confirmDelete(): void {
    const w = this.list.selected;
    if (!w) return;
    this.game.setScreen(
      new ConfirmScreen(this.game, 'Are you sure you want to delete this world?', `'${w.name}' will be lost forever! (A long time!)`, 'Delete', 'Cancel', (ok) => {
        if (!ok) {
          this.game.setScreen(this);
          return;
        }
        void deleteWorld(w.id).then(() => {
          this.all = null;
          this.list.selected = null;
          this.game.setScreen(this);
        });
      }),
    );
  }

  override titleY(): number {
    return 8;
  }

  override tick(): void {
    this.updateButtons();
  }
}

export class EditWorldScreen extends Screen {
  private name!: EditBox;
  constructor(game: Game, parent: Screen, private readonly meta: WorldMeta) {
    super(game, 'Edit World');
    this.parent = parent;
  }
  init(): void {
    const cx = Math.floor(this.width / 2);
    // vanilla's column, 234 high and centred: a spacer, the name, five buttons 25 apart, a spacer, Save and Cancel
    const y = Math.floor((this.height - 234) / 2) + 39;
    this.name = this.add(new EditBox(cx - 100, y, 200, 20, this.meta.name));
    this.name.focused = true;
    // (a browser has no world icon or folders, and no older chunks to optimize: only Make Backup does anything)
    this.add(new Button(cx - 100, y + 25, 200, 20, 'Reset Icon', () => {})).active = false;
    this.add(new Button(cx - 100, y + 50, 200, 20, 'Open World Folder', () => {})).active = false;
    this.add(new Button(cx - 100, y + 75, 200, 20, 'Make Backup', () => void makeBackup(this.game, this.meta, this.parent)));
    this.add(new Button(cx - 100, y + 100, 200, 20, 'Open Backups Folder', () => {})).active = false;
    this.add(new Button(cx - 100, y + 125, 200, 20, 'Optimize World', () => {})).active = false;
    const save = this.add(new Button(cx - 100, y + 175, 98, 20, 'Save', () => {
      this.meta.name = this.name.value.trim() || this.meta.name;
      void saveWorldMeta(this.meta).then(() => this.game.setScreen(this.parent));
    }));
    this.name.onChange = (v) => (save.active = v.trim().length > 0);
    this.add(new Button(cx + 2, y + 175, 98, 20, 'Cancel', () => this.onClose()));
  }
  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    super.render(g, mx, my, partial);
    g.text('World Name', this.name.x, this.name.y - 13, 0xa0a0a0, true);
  }
}

// ---------------------------------------------------------------------------
// Create world (1.20+ tabbed layout)

const MODE_INFO: Record<string, string> = {
  survival: 'Search for resources, craft, gain levels, health and hunger',
  hardcore: 'Same as Survival Mode, locked at hardest difficulty, and one life only',
  creative: "Create, build, and explore without limits. You can fly, have endless materials, and can't be hurt by monsters",
};

/** Java String.hashCode */
function javaHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

/** vanilla WorldOptions.parseSeed: numeric → long, text → hashCode, blank → random */
export function parseSeed(input: string): string {
  const s = input.trim();
  if (!s) {
    const hi = BigInt(Math.floor(Math.random() * 2 ** 32));
    const lo = BigInt(Math.floor(Math.random() * 2 ** 32));
    return BigInt.asIntN(64, (hi << 32n) | lo).toString();
  }
  if (/^-?\d+$/.test(s)) {
    try {
      const v = BigInt(s);
      if (v >= -(2n ** 63n) && v < 2n ** 63n) return v.toString();
    } catch {
      /* fall through */
    }
  }
  return String(javaHash(s));
}

export function newWorldMeta(id: string, name: string, seed: string, gameMode: string, difficulty: string, hardcore: boolean, allowCommands: boolean): WorldMeta {
  const now = Date.now();
  return {
    id, name, seed, gameMode, difficulty, hardcore, allowCommands,
    created: now, lastPlayed: now, dayTime: 0, gameTime: 0,
    raining: false, thundering: false, rainTime: 0, thunderTime: 0, clearWeatherTime: 0,
    player: null, version: 1, structures: true, bonusChest: false,
  };
}

class TabButton extends Button {
  selected = false;
  override render(g: GuiGraphics, mx: number, my: number): void {
    const hover = this.isMouseOver(mx, my);
    const sprite = this.selected ? (hover ? 'tab_selected_highlighted' : 'tab_selected') : hover ? 'tab_highlighted' : 'tab';
    if (!g.nineSlice(sprite, this.x, this.y, this.w, this.h, 2)) g.fill(this.x, this.y, this.x + this.w, this.y + this.h, this.selected ? 0xff505050 : 0xff202020);
    const color = this.selected ? 0xffffff : 0xa0a0a0;
    const tw = g.textWidth(this.label);
    g.text(this.label, this.x + Math.floor((this.w - tw) / 2), this.y + Math.floor((this.h - 8) / 2), color, true);
    if (this.selected) {
      const i = Math.min(tw, this.w - 4);
      const j = this.x + Math.floor((this.w - i) / 2);
      const k = this.y + this.h - 2;
      g.fill(j, k, j + i, k + 1, 0xff000000 | color);
    }
  }
}

class SmallToggle extends CycleButton<boolean> {}

export class CreateWorldScreen extends Screen {
  private tab = 0;
  private name = 'New World';
  private seed = '';
  private mode: 'survival' | 'hardcore' | 'creative' = 'survival';
  private difficulty = 'normal';
  private cheats = false;
  private structures = true;
  private bonusChest = false;
  private existingIds: Set<string> | null = null;
  private tabs: TabButton[] = [];
  private creating = false;

  constructor(game: Game, parent: Screen | null, recreate?: WorldMeta) {
    super(game, 'Create New World');
    this.parent = parent;
    if (recreate) {
      this.name = recreate.name;
      this.seed = recreate.seed;
      this.mode = recreate.hardcore ? 'hardcore' : recreate.gameMode === 'creative' ? 'creative' : 'survival';
      this.difficulty = recreate.difficulty;
      this.cheats = recreate.allowCommands;
    }
    void listWorlds().then((ws) => (this.existingIds = new Set(ws.map((w) => w.id))));
  }

  init(): void {
    const cx = Math.floor(this.width / 2);
    // tab bar
    const tw0 = Math.min(400, this.width) - 28;
    const tw = Math.round(tw0 / 3 / 2) * 2;
    const tx = Math.round((this.width - tw0) / 2 / 2) * 2;
    this.tabs = ['Game', 'World', 'More'].map((label, i) => {
      const b = this.add(new TabButton(tx + i * tw, 0, tw, 24, label, () => {
        this.tab = i;
        this.game.setScreen(this);
      }));
      b.selected = i === this.tab;
      return b;
    });
    const areaTop = 24, areaBottom = this.height - 33;
    if (this.tab === 0) {
      const gridH = 33 + 8 + 20 + 8 + 20 + 8 + 20;
      const y0 = areaTop + Math.floor((areaBottom - areaTop - gridH) / 6);
      const name = this.add(new EditBox(cx - 104, y0 + 13, 208, 20, this.name));
      name.maxLength = 32;
      name.onChange = (v) => (this.name = v);
      name.focused = true;
      const modes: ('survival' | 'hardcore' | 'creative')[] = ['survival', 'hardcore', 'creative'];
      const mode = this.add(new CycleButton(cx - 105, y0 + 41, 210, 20, 'Game Mode', modes, this.mode, (v) => v[0].toUpperCase() + v.slice(1), (v) => {
        this.mode = v;
        if (v === 'hardcore') {
          this.difficulty = 'hard';
          this.cheats = false;
        }
        this.game.setScreen(this);
      }));
      mode.tooltip = MODE_INFO[this.mode];
      const diff = this.add(new CycleButton(cx - 105, y0 + 69, 210, 20, 'Difficulty', ['peaceful', 'easy', 'normal', 'hard'], this.difficulty, (v) => DIFFICULTY_NAMES[v], (v) => {
        this.difficulty = v;
        diff.tooltip = DIFFICULTY_INFO[v];
      }));
      diff.tooltip = DIFFICULTY_INFO[this.difficulty];
      diff.active = this.mode !== 'hardcore';
      const cheats = this.add(new CycleButton(cx - 105, y0 + 97, 210, 20, 'Allow Cheats', [true, false], this.cheats || this.mode === 'creative' ? this.cheats : this.cheats, (v) => (v ? 'ON' : 'OFF'), (v) => (this.cheats = v)));
      cheats.tooltip = 'Commands like /gamemode, /experience';
      cheats.active = this.mode !== 'hardcore';
      this.nameBox = name;
    } else if (this.tab === 1) {
      const gridH = 20 + 8 + 33 + 8 + 20 + 8 + 20;
      const y0 = areaTop + Math.floor((areaBottom - areaTop - gridH) / 6);
      this.add(new CycleButton(cx - 155, y0, 150, 20, 'World Type', ['Default'], 'Default', (v) => v, () => {}));
      this.add(new Button(cx + 5, y0, 150, 20, 'Customize', () => {})).active = false;
      const seed = this.add(new EditBox(cx - 154, y0 + 28 + 13, 308, 20, this.seed));
      seed.maxLength = 32;
      seed.hint = 'Leave blank for a random seed';
      seed.onChange = (v) => (this.seed = v);
      this.seedBox = seed;
      const t1 = this.add(new SmallToggle(cx + 154 - 44, y0 + 69, 44, 20, '', [true, false], this.structures, (v) => (v ? 'ON' : 'OFF'), (v) => (this.structures = v)));
      t1.tooltip = 'Villages, Shipwrecks, etc.';
      const t2 = this.add(new SmallToggle(cx + 154 - 44, y0 + 97, 44, 20, '', [true, false], this.bonusChest, (v) => (v ? 'ON' : 'OFF'), (v) => (this.bonusChest = v)));
      void t2;
      this.toggleRows = [
        ['Generate Structures', y0 + 69],
        ['Bonus Chest', y0 + 97],
      ];
    } else {
      const y0 = areaTop + Math.floor((areaBottom - areaTop - 76) / 6);
      this.add(new Button(cx - 105, y0, 210, 20, 'Game Rules', () => {})).active = false;
      this.add(new Button(cx - 105, y0 + 28, 210, 20, 'Experiments', () => {})).active = false;
      this.add(new Button(cx - 105, y0 + 56, 210, 20, 'Data Packs', () => {})).active = false;
    }
    this.add(new Button(cx - 154, this.height - 27, 150, 20, 'Create New World', () => void this.create()));
    this.add(new Button(cx + 4, this.height - 27, 150, 20, 'Cancel', () => this.onClose()));
  }

  private nameBox: EditBox | null = null;
  private seedBox: EditBox | null = null;
  private toggleRows: [string, number][] = [];

  override renderBackground(g: GuiGraphics): void {
    this.game.requestBlur();
    g.fill(0, 0, this.width, 24, 0xc0000000);
    this.game.menuBackgroundTexture(g, 0, 24, this.width, this.height - 24);
  }

  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    this.renderBackground(g);
    // header separator beside the tab strip, footer separator
    const first = this.tabs[0], last = this.tabs[this.tabs.length - 1];
    g.tile('header_separator', 0, 22, first.x, 2);
    g.tile('header_separator', last.x + last.w, 22, this.width - last.x - last.w, 2);
    g.tile('footer_separator', 0, this.height - 33 - 2, this.width, 2);
    for (const w of this.widgets) if (w.visible) w.render(g, mx, my);
    if (this.tab === 0 && this.nameBox) g.text('World Name', this.nameBox.x, this.nameBox.y - 13, 0xffffff, true);
    if (this.tab === 1 && this.seedBox) {
      g.text('Seed for the World Generator', this.seedBox.x, this.seedBox.y - 13, 0xffffff, true);
      for (const [label, y] of this.toggleRows) g.text(label, Math.floor(this.width / 2) - 154, y + 6, 0xffffff, true);
    }
    this.renderTooltip(g, mx, my);
    void partial;
  }

  private uniqueId(name: string): string {
    let base = name.replace(/[/\\\\?%*:|"<>.]/g, '_').trim() || 'World';
    if (base.length > 32) base = base.slice(0, 32);
    const ids = this.existingIds ?? new Set<string>();
    let id = base;
    for (let i = 1; ids.has(id); i++) id = `${base} (${i})`;
    return id;
  }

  private async create(): Promise<void> {
    if (this.creating) return;
    this.creating = true;
    if (!this.existingIds) this.existingIds = new Set((await listWorlds()).map((w) => w.id));
    const name = this.name.trim() || 'New World';
    const hardcore = this.mode === 'hardcore';
    const meta = newWorldMeta(
      this.uniqueId(name),
      name,
      parseSeed(this.seed),
      this.mode === 'creative' ? 'creative' : 'survival',
      hardcore ? 'hard' : this.difficulty,
      hardcore,
      hardcore ? false : this.cheats,
    );
    meta.structures = this.structures;
    meta.bonusChest = this.bonusChest;
    await saveWorldMeta(meta);
    await this.game.startWorld(meta);
  }
}
