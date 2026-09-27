// The multiplayer screens (vanilla ShareToLanScreen, JoinMultiplayerScreen, ConnectScreen, DisconnectedScreen): a world
// opened to the other windows of this browser from the pause menu, and joined from the title screen's Multiplayer.
// Whatever another window says (a world's name, a host's, a reason) is only ever drawn as text, never as markup.

import type { Game } from '../../game/game';
import { Screen, Button, CycleButton, EditBox } from '../screen';
import { ScrollList } from '../list';
import type { GuiGraphics } from '../guiGraphics';
import { LanWorldList, type LanWorld } from '../../net/transport/lan';
import { randomId } from '../../net/transport/transport';
import type { GuestIdentity } from '../../net/client/clientSession';
import type { GameMode } from '../../entity/player';
import { NAME_PATTERN, PROTOCOL_VERSION, BUILD_ID, GUEST_VIEW_DISTANCE } from '../../net/config';

// ---------------------------------------------------------------------------
// who a guest is (this window's, kept while the tab is open: two windows are two players)

const NAME_KEY = 'mc-mp-name';
const UUID_KEY = 'mc-mp-uuid';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function stored(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, v: string): void {
  try {
    sessionStorage.setItem(key, v);
  } catch {
    // (no storage: the name is asked again next time)
  }
}

/** this window's player name for joining: the last one used, or a new Player### */
export function guestName(): string {
  const n = stored(NAME_KEY);
  return n && NAME_PATTERN.test(n) ? n : `Player${100 + Math.floor(Math.random() * 900)}`;
}

/** who this window joins as: `name`, its uuid (made once per tab), and how far round it wants chunks */
export function guestIdentity(game: Game, name: string): GuestIdentity {
  let uuid = stored(UUID_KEY);
  if (!uuid || !UUID.test(uuid)) {
    uuid = randomId();
    store(UUID_KEY, uuid);
  }
  store(NAME_KEY, name);
  return { name, uuid, viewDistance: Math.max(2, Math.min(GUEST_VIEW_DISTANCE, game.opts.renderDistance)) };
}

/** whether this game can join `w` (vanilla ServerData.isCompatible: the same protocol, and here the same build) */
export function compatible(w: LanWorld): boolean {
  return w.protocol === PROTOCOL_VERSION && w.build === BUILD_ID;
}

// ---------------------------------------------------------------------------
// Open to LAN

/** vanilla ShareToLanScreen: what the guests play in, and "Start LAN World" */
/** vanilla ShareToLanScreen's game modes, in its order, by GameType.getShortDisplayName */
const GUEST_MODES: GameMode[] = ['survival', 'spectator', 'creative', 'adventure'];
const MODE_NAMES: Record<GameMode, string> = { survival: 'Survival', spectator: 'Spectator', creative: 'Creative', adventure: 'Adventure' };

export class ShareToLanScreen extends Screen {
  private failed = false;
  /** what the guests play in (vanilla: Survival to begin with) */
  private mode: GameMode = 'survival';

  constructor(game: Game, parent: Screen) {
    super(game, 'LAN World');
    this.parent = parent;
  }

  init(): void {
    const cx = Math.floor(this.width / 2);
    this.add(new CycleButton(cx - 155, 100, 150, 20, 'Game Mode', GUEST_MODES, this.mode, (m) => MODE_NAMES[m], (m) => (this.mode = m)));
    // (in this version only the host runs commands: the button says so, greyed out)
    const cheats = this.add(new CycleButton(cx + 5, 100, 150, 20, 'Allow Cheats', [false], false, () => 'OFF', () => {}));
    cheats.active = false;
    cheats.tooltip = 'Only the host can use commands in this version';
    this.add(new Button(cx - 155, this.height - 28, 150, 20, 'Start LAN World', () => {
      // (vanilla: back to the game, "Local game hosted" in the chat)
      if (this.game.openToLan(this.mode)) this.game.setScreen(null);
      else this.failed = true;
    }));
    this.add(new Button(cx + 5, this.height - 28, 150, 20, 'Cancel', () => this.onClose()));
  }

  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    this.renderBackground(g);
    for (const w of this.widgets) if (w.visible) w.render(g, mx, my);
    const cx = Math.floor(this.width / 2);
    g.centered(this.title, cx, 50, 0xffffff, true);
    g.centered('Settings for Other Players', cx, 82, 0xffffff, true);
    g.centered('Only you can use commands, for now.', cx, 132, 0xa0a0a0, true);
    g.centered('Other windows of this browser can join from Multiplayer.', cx, 144, 0xa0a0a0, true);
    if (this.failed) g.centered("This browser can't open a world to its other windows.", cx, 164, 0xff5555, true);
    this.renderTooltip(g, mx, my);
    void partial;
  }
}

// ---------------------------------------------------------------------------
// Multiplayer

type Row = { world: LanWorld } | { scanning: true };

/** vanilla LoadingDotsText */
function loadingDots(ms: number): string {
  const i = Math.floor(ms / 300) % 4;
  return i === 1 || i === 3 ? 'o O o' : i === 2 ? 'o o O' : 'O o o';
}

/** vanilla ServerSelectionList: its LAN header ("Scanning for games...") and the LAN worlds heard */
class LanList extends ScrollList<Row> {
  constructor(private readonly screen: JoinMultiplayerScreen, w: number, top: number, h: number) {
    super(0, top, w, h, 36, 305);
  }

  renderEntry(g: GuiGraphics, e: Row, _i: number, left: number, top: number, width: number, height: number, mx: number, my: number, hovered: boolean): void {
    if ('scanning' in e) {
      // (vanilla ServerSelectionList.LANHeader)
      const y = top + Math.floor(height / 2) - 4, cx = Math.floor(this.w / 2);
      const text = this.screen.canHear ? 'Scanning for games on your local network' : "This browser can't hear its other windows";
      g.centered(text, cx, y - 4, 0xffffff, true);
      if (this.screen.canHear) g.centered(loadingDots(performance.now()), cx, y + 5, 0x808080, true);
      return;
    }
    // (vanilla NetworkServerEntry: "LAN World", then its host's name and the world's, then where it is)
    const w = e.world;
    const x = left + 32 + 3;
    g.text('LAN World', x, top + 1, 0xffffff, true);
    g.text(fit(g, `${w.host} - ${w.name}`, width - 35), x, top + 12, 0x808080, true);
    if (compatible(w)) g.text(`Another window of this browser, ${w.players}/${w.max} players`, x, top + 23, 0x808080, true);
    else g.text('Incompatible version! Reload both windows.', x, top + 23, 0xff5555, true);
    if (hovered && compatible(w)) {
      g.fill(left, top, left + 32, top + 32, 0xa0909090);
      g.sprite(mx - left < 32 ? 'join_highlighted' : 'join', left, top, 32, 32);
    }
    void my;
  }

  override onEntryClicked(e: Row, _i: number, mx: number, _my: number, _b: number, dbl: boolean): boolean {
    if ('scanning' in e) {
      this.selected = null;
      return true;
    }
    this.screen.updateButtons();
    if (mx - this.rowLeft() <= 32 || dbl) this.screen.join(e.world);
    return true;
  }
}

/** `s` cut to `maxW` pixels, with "..." if it was longer */
function fit(g: GuiGraphics, s: string, maxW: number): string {
  if (g.textWidth(s) <= maxW) return s;
  while (s.length > 1 && g.textWidth(s + '...') > maxW) s = s.slice(0, -1);
  return s + '...';
}

/** vanilla JoinMultiplayerScreen ("Play Multiplayer"): the worlds other windows have open to LAN, and a name to join as */
export class JoinMultiplayerScreen extends Screen {
  private lan: LanWorldList | null = null;
  private seen = -1;
  private list!: LanList;
  private nameBox!: EditBox;
  private name: string;
  private joinBtn!: Button;

  constructor(game: Game, parent: Screen | null) {
    super(game, 'Play Multiplayer');
    this.parent = parent;
    this.name = guestName();
  }

  get canHear(): boolean {
    return this.lan?.available ?? false;
  }

  init(): void {
    const cx = Math.floor(this.width / 2);
    this.lan ??= new LanWorldList();
    const prev = this.list?.selected ?? null;
    this.nameBox = this.add(new EditBox(cx - 100, 22, 254, 20, this.name));
    this.nameBox.maxLength = 16;
    this.nameBox.hint = 'Your name';
    this.nameBox.onChange = (v) => {
      this.name = v;
      this.updateButtons();
    };
    this.list = this.add(new LanList(this, this.width, 48, this.height - 112));
    this.seen = -1;
    this.refreshList(prev);
    this.joinBtn = this.add(new Button(cx - 154, this.height - 52, 150, 20, 'Join Server', () => {
      const s = this.list.selected;
      if (s && 'world' in s) this.join(s.world);
    }));
    this.add(new Button(cx + 4, this.height - 52, 150, 20, 'Refresh', () => {
      this.lan?.close();
      this.lan = null;
      this.game.setScreen(this);
    }));
    this.add(new Button(cx - 100, this.height - 28, 200, 20, 'Back', () => this.onClose()));
    this.updateButtons();
  }

  private nameOk(): boolean {
    return NAME_PATTERN.test(this.name);
  }

  /** the worlds heard of, the "Scanning..." row first, the selection kept */
  private refreshList(prev: Row | null): void {
    const worlds = this.lan?.worlds() ?? [];
    if (this.lan && this.lan.version === this.seen) return;
    this.seen = this.lan?.version ?? -1;
    const selId = prev && 'world' in prev ? prev.world.id : null;
    this.list.entries = [{ scanning: true }, ...worlds.map((world) => ({ world }))];
    this.list.selected = this.list.entries.find((r) => 'world' in r && r.world.id === selId) ?? null;
    this.updateButtons();
  }

  updateButtons(): void {
    const s = this.list?.selected;
    if (this.joinBtn) this.joinBtn.active = !!s && 'world' in s && compatible(s.world) && this.nameOk();
  }

  join(w: LanWorld): void {
    if (!compatible(w) || !this.nameOk()) return;
    void this.game.joinWorld(w.id, guestIdentity(this.game, this.name));
  }

  override tick(): void {
    this.refreshList(this.list.selected);
  }

  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    this.renderBackground(g);
    for (const w of this.widgets) if (w.visible) w.render(g, mx, my);
    const cx = Math.floor(this.width / 2);
    g.centered(this.title, cx, 8, 0xffffff, true);
    g.text('Name:', cx - 154, 28, 0xa0a0a0, true);
    if (!this.nameOk()) g.centered('A name is 3 to 16 letters, digits or _', cx, this.height - 63, 0xff5555, true);
    this.renderTooltip(g, mx, my);
    void partial;
  }

  override removed(): void {
    this.lan?.close();
    this.lan = null;
  }
}

// ---------------------------------------------------------------------------
// connecting and disconnected

/** vanilla ConnectScreen: what's happening, and a Cancel */
export class ConnectScreen extends Screen {
  constructor(game: Game, private readonly cancel: () => void) {
    super(game, '');
  }

  init(): void {
    this.add(new Button(Math.floor(this.width / 2) - 100, Math.floor(this.height / 4) + 120 + 12, 200, 20, 'Cancel', () => this.cancel()));
  }

  override isPauseScreen(): boolean {
    return false;
  }

  override shouldCloseOnEsc(): boolean {
    return false;
  }

  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    this.renderBackground(g);
    const st = this.game.client?.state;
    const text = st === 'login' ? 'Logging in...' : st === 'play' ? 'Joining world...' : 'Connecting to the server...';
    g.centered(text, Math.floor(this.width / 2), Math.floor(this.height / 2) - 50, 0xffffff, true);
    for (const w of this.widgets) if (w.visible) w.render(g, mx, my);
    void partial;
  }
}

/** vanilla DisconnectedScreen: a title, why, and back to the title screen */
export class DisconnectedScreen extends Screen {
  private lines: string[] = [];
  private top = 0;

  constructor(game: Game, title: string, private readonly reason: string) {
    super(game, title);
  }

  init(): void {
    // (vanilla: title, reason and button in a column 8 apart, in the middle of the screen)
    this.lines = this.game.gui.wrap(this.reason, this.width - 50);
    const h = 9 + 8 + this.lines.length * 9 + 8 + 20;
    this.top = Math.floor((this.height - h) / 2);
    this.add(new Button(Math.floor(this.width / 2) - 100, this.top + h - 20, 200, 20, 'Back to Title Screen', () => this.game.setScreen(null)));
  }

  override isPauseScreen(): boolean {
    return false;
  }

  override shouldCloseOnEsc(): boolean {
    return false;
  }

  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    this.renderBackground(g);
    const cx = Math.floor(this.width / 2);
    g.centered(this.title, cx, this.top, 0xffffff, true);
    this.lines.forEach((l, i) => g.centered(l, cx, this.top + 17 + i * 9, 0xffffff, true));
    for (const w of this.widgets) if (w.visible) w.render(g, mx, my);
    void partial;
  }
}

// ---------------------------------------------------------------------------
// the URL's ?mp= flags (main.ts)

/** ?mp=host: once the world is in, it's opened to LAN */
export function openToLanOnceSpawned(game: Game, guestMode: GameMode = 'survival'): void {
  const wait = setInterval(() => {
    if (!game.inWorld) return clearInterval(wait);
    if (!game.spawned) return;
    clearInterval(wait);
    game.openToLan(guestMode);
  }, 100);
}

/** ?guests=: what the guests of a ?mp=host world play in (Survival if it says nothing it knows) */
export function guestModeParam(v: string | null): GameMode {
  return GUEST_MODES.includes(v as GameMode) ? (v as GameMode) : 'survival';
}

/** ?mp=join: the first world heard of on the LAN is joined; if none is heard within a few seconds, the list shows */
export function joinFirstLanWorld(game: Game): void {
  const lan = new LanWorldList();
  const started = Date.now();
  const wait = setInterval(() => {
    const w = lan.worlds().find(compatible);
    if (!w && Date.now() - started < 5000) return;
    clearInterval(wait);
    lan.close();
    if (game.inWorld || game.client) return;
    if (w) void game.joinWorld(w.id, guestIdentity(game, guestName()));
    else game.setScreen(new JoinMultiplayerScreen(game, game.titleScreenFactory?.() ?? null));
  }, 100);
}
