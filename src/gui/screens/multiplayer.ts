// The multiplayer screens (vanilla ShareToLanScreen, JoinMultiplayerScreen, ConnectScreen, DisconnectedScreen): a world
// opened to LAN from the pause menu, and joined from the title screen's Multiplayer: by the other windows of this
// browser, and (stage 5) by other computers' pages through the relay on the game's own server, with the join code.
// Whatever another page says (a world's name, a host's, a reason) is only ever drawn as text, never as markup.

import type { Game } from '../../game/game';
import { Screen, Button, CycleButton, EditBox } from '../screen';
import { ScrollList } from '../list';
import type { GuiGraphics } from '../guiGraphics';
import { LanWorldList, type LanWorld } from '../../net/transport/lan';
import { RelayWorldList } from '../../net/transport/webSocket';
import { offlinePlayerUuid } from '../../net/offlineUuid';
import { normalizeJoinCode, showJoinCode, JOIN_CODE_LENGTH } from '../../net/joinCode';
import type { GuestIdentity } from '../../net/client/clientSession';
import type { GameMode } from '../../entity/player';
import { NAME_PATTERN, PROTOCOL_VERSION, BUILD_ID, GUEST_VIEW_DISTANCE } from '../../net/config';

// ---------------------------------------------------------------------------
// who a guest is: its name, which is who it is to the host's world (as vanilla's LAN worlds know their players), so
// coming back by the same name is coming back to its things. This window's name first (kept while the tab is open: two
// windows of one browser can be two players), else the one this browser last joined as (kept after the tab is closed,
// as a vanilla player's account name always is), else none: the Name box is empty till one is typed, never a made-up
// one that would come back as somebody new

const NAME_KEY = 'mc-mp-name';

function stored(key: string): string | null {
  for (const s of [() => sessionStorage, () => localStorage]) {
    try {
      const v = s().getItem(key);
      if (v && NAME_PATTERN.test(v)) return v;
    } catch {
      // (no storage of that kind here)
    }
  }
  return null;
}

function store(key: string, v: string): void {
  for (const s of [() => sessionStorage, () => localStorage]) {
    try {
      s().setItem(key, v);
    } catch {
      // (no storage: the name is asked again next time)
    }
  }
}

/** the name this window, or else this browser, last joined as ('' if none) */
export function rememberedName(): string {
  return stored(NAME_KEY) ?? '';
}

/** (joining without the Multiplayer screen: ?mp=join, for tests) the name remembered, or a new Player### */
export function guestName(): string {
  return rememberedName() || `Player${100 + Math.floor(Math.random() * 900)}`;
}

/**
 * who this window joins as: `name`, the uuid a LAN world knows that name by (vanilla's offline uuid, made from the name:
 * the host keeps its player under it), how far round it wants chunks, and the world's join code
 */
export function guestIdentity(game: Game, name: string, code: string): GuestIdentity {
  store(NAME_KEY, name);
  return { name, uuid: offlinePlayerUuid(name), viewDistance: Math.max(2, Math.min(GUEST_VIEW_DISTANCE, game.opts.renderDistance)), code: normalizeJoinCode(code) };
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
  /** Allow Cheats (vanilla: off to begin with) */
  private cheats = false;

  constructor(game: Game, parent: Screen) {
    super(game, 'LAN World');
    this.parent = parent;
  }

  init(): void {
    const cx = Math.floor(this.width / 2);
    this.add(new CycleButton(cx - 155, 100, 150, 20, 'Game Mode', GUEST_MODES, this.mode, (m) => MODE_NAMES[m], (m) => (this.mode = m)));
    // (vanilla: commands for everyone while the world is open; in this version only the host runs commands)
    const cheats = this.add(new CycleButton(cx + 5, 100, 150, 20, 'Allow Cheats', [false, true], this.cheats, (v) => (v ? 'ON' : 'OFF'), (v) => (this.cheats = v)));
    cheats.tooltip = 'Commands (/gamemode, /tp, /kick...) for you while the world is open, even if it was made without cheats. Your guests can\'t use commands in this version.';
    this.add(new Button(cx - 155, this.height - 28, 150, 20, 'Start LAN World', () => {
      // (vanilla: back to the game, "Local game hosted" in the chat)
      if (this.game.openToLan(this.mode, this.cheats)) this.game.setScreen(null);
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
    g.centered('Others join from Multiplayer, with the join code you get.', cx, 144, 0xa0a0a0, true);
    if (this.failed) g.centered("This browser can't open a world to LAN.", cx, 164, 0xff5555, true);
    this.renderTooltip(g, mx, my);
    void partial;
  }
}

// ---------------------------------------------------------------------------
// Multiplayer

/** a world heard of: from another window of this browser, or through the relay (open on the computer this page came from) */
type Heard = { world: LanWorld; via: 'browser' | 'relay' };
type Row = Heard | { scanning: true };

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
      const text = this.screen.canHear ? 'Scanning for games on your local network' : "This browser can't hear of any open worlds";
      g.centered(text, cx, y - 4, 0xffffff, true);
      if (this.screen.canHear) g.centered(loadingDots(performance.now()), cx, y + 5, 0x808080, true);
      return;
    }
    // (vanilla NetworkServerEntry: "LAN World", then its host's name and the world's, then where it is)
    const w = e.world;
    const x = left + 32 + 3;
    g.text('LAN World', x, top + 1, 0xffffff, true);
    g.text(fit(g, `${w.host} - ${w.name}`, width - 35), x, top + 12, 0x808080, true);
    const where = e.via === 'browser' ? 'Another window of this browser' : `At ${location.host}`;
    if (compatible(w)) g.text(fit(g, `${where}, ${w.players}/${w.max} players`, width - 35), x, top + 23, 0x808080, true);
    else g.text(e.via === 'browser' ? 'Incompatible version! Reload both windows.' : 'Incompatible version! Reload this page.', x, top + 23, 0xff5555, true);
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
    if (mx - this.rowLeft() <= 32 || dbl) this.screen.join(e);
    return true;
  }
}

/** `s` cut to `maxW` pixels, with "..." if it was longer */
function fit(g: GuiGraphics, s: string, maxW: number): string {
  if (g.textWidth(s) <= maxW) return s;
  while (s.length > 1 && g.textWidth(s + '...') > maxW) s = s.slice(0, -1);
  return s + '...';
}

/**
 * vanilla JoinMultiplayerScreen ("Play Multiplayer"): the worlds open to LAN that this page can hear of (other windows'
 * of this browser, and the one on the computer it came from, through the relay), a name to join as, and the join code
 * (the other windows tell theirs; a world on another computer needs the one its host gave)
 */
export class JoinMultiplayerScreen extends Screen {
  private lan: LanWorldList | null = null;
  private relay: RelayWorldList | null = null;
  private seen = '';
  private list!: LanList;
  private nameBox!: EditBox;
  private codeBox!: EditBox;
  private name: string;
  private code: string;
  private joinBtn!: Button;

  /** `code`: a join code to begin with (the link's ?join=, or one tried before) */
  constructor(game: Game, parent: Screen | null, code = '') {
    super(game, 'Play Multiplayer');
    this.parent = parent;
    this.name = rememberedName();
    const c = normalizeJoinCode(code);
    this.code = c ? showJoinCode(c) : '';
  }

  get canHear(): boolean {
    return (this.lan?.available ?? false) || (this.relay?.connected ?? false);
  }

  init(): void {
    const cx = Math.floor(this.width / 2);
    this.lan ??= new LanWorldList();
    this.relay ??= new RelayWorldList();
    const prev = this.list?.selected ?? null;
    this.nameBox = this.add(new EditBox(cx - 120, 22, 114, 20, this.name));
    this.nameBox.maxLength = 16;
    this.nameBox.hint = 'Your name';
    this.nameBox.onChange = (v) => {
      this.name = v;
      this.updateButtons();
    };
    this.codeBox = this.add(new EditBox(cx + 36, 22, 118, 20, this.code));
    this.codeBox.maxLength = 12;
    this.codeBox.hint = 'Join code';
    this.codeBox.onChange = (v) => {
      this.code = v;
      this.updateButtons();
    };
    this.list = this.add(new LanList(this, this.width, 48, this.height - 112));
    this.seen = '';
    this.refreshList(prev);
    this.joinBtn = this.add(new Button(cx - 154, this.height - 52, 150, 20, 'Join Server', () => {
      const s = this.list.selected;
      if (s && 'world' in s) this.join(s);
    }));
    this.add(new Button(cx + 4, this.height - 52, 150, 20, 'Refresh', () => {
      this.closeLists();
      this.game.setScreen(this);
    }));
    this.add(new Button(cx - 100, this.height - 28, 200, 20, 'Back', () => this.onClose()));
    this.updateButtons();
  }

  private nameOk(): boolean {
    return NAME_PATTERN.test(this.name);
  }

  private codeOk(): boolean {
    return normalizeJoinCode(this.code).length === JOIN_CODE_LENGTH;
  }

  /** the worlds heard of, the "Scanning..." row first, the selection kept (a world through the relay chosen for a code given) */
  private refreshList(prev: Row | null): void {
    const mine = this.lan?.worlds() ?? [];
    const theirs = (this.relay?.worlds() ?? []).filter((w) => !mine.some((m) => m.id === w.id));
    const key = `${this.lan?.version ?? -1},${this.relay?.version ?? -1},${mine.length},${theirs.length}`;
    if (key === this.seen) return;
    this.seen = key;
    const heard: Heard[] = [...mine.map((world) => ({ world, via: 'browser' as const })), ...theirs.map((world) => ({ world, via: 'relay' as const }))];
    const selId = prev && 'world' in prev ? prev.world.id : null;
    this.list.entries = [{ scanning: true }, ...heard];
    this.list.selected = this.list.entries.find((r) => 'world' in r && r.world.id === selId) ?? null;
    if (!this.list.selected && this.codeOk()) this.list.selected = this.list.entries.find((r) => 'world' in r && r.via === 'relay' && compatible(r.world)) ?? null;
    this.updateButtons();
  }

  updateButtons(): void {
    const s = this.list?.selected;
    if (this.joinBtn) this.joinBtn.active = !!s && 'world' in s && compatible(s.world) && this.nameOk() && (s.via === 'browser' || this.codeOk());
  }

  join(h: Heard): void {
    if (!compatible(h.world) || !this.nameOk()) return;
    // (another window of this browser told its code; a world on another computer needs the one its host gave)
    const code = h.via === 'browser' ? (h.world.code ?? '') : this.code;
    if (h.via === 'relay' && !this.codeOk()) return;
    void this.game.joinWorld(h.via === 'browser' ? { via: 'browser', lanId: h.world.id } : { via: 'relay' }, guestIdentity(this.game, this.name, code));
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
    g.text('Code:', cx + 4, 28, 0xa0a0a0, true);
    const s = this.list.selected;
    if (!this.name) g.centered('Type your name: use the same one each time to keep your things', cx, this.height - 63, 0xffff55, true);
    else if (!this.nameOk()) g.centered('A name is 3 to 16 letters, digits or _', cx, this.height - 63, 0xff5555, true);
    else if (s && 'world' in s && s.via === 'relay' && !this.codeOk()) g.centered("Type the join code from the host's screen", cx, this.height - 63, 0xff5555, true);
    this.renderTooltip(g, mx, my);
    void partial;
  }

  private closeLists(): void {
    this.lan?.close();
    this.lan = null;
    this.relay?.close();
    this.relay = null;
  }

  override removed(): void {
    this.closeLists();
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

/** vanilla DisconnectedScreen: a title, why, and back to the title screen (or to the server list, `back`'s) */
export class DisconnectedScreen extends Screen {
  private lines: string[] = [];
  private top = 0;

  constructor(game: Game, title: string, private readonly reason: string, private readonly back: (() => Screen) | null = null) {
    super(game, title);
  }

  init(): void {
    // (vanilla: title, reason and button in a column 8 apart, in the middle of the screen)
    this.lines = this.game.gui.wrap(this.reason, this.width - 50);
    const h = 9 + 8 + this.lines.length * 9 + 8 + 20;
    this.top = Math.floor((this.height - h) / 2);
    const back = this.back;
    this.add(new Button(Math.floor(this.width / 2) - 100, this.top + h - 20, 200, 20, back ? 'Back to Server List' : 'Back to Title Screen', () => this.game.setScreen(back ? back() : null)));
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

/**
 * ?mp=join: the first world heard of is joined, another window's of this browser before the one through the relay (with
 * `code`, ?code='s); if none is heard within a few seconds, the list shows
 */
export function joinFirstLanWorld(game: Game, code = ''): void {
  const lan = new LanWorldList();
  const relay = new RelayWorldList();
  const started = Date.now();
  const wait = setInterval(() => {
    const mine = lan.worlds().find(compatible);
    const theirs = mine ? undefined : relay.worlds().find(compatible);
    if (!mine && !theirs && Date.now() - started < 5000) return;
    clearInterval(wait);
    lan.close();
    relay.close();
    if (game.inWorld || game.client) return;
    if (mine) void game.joinWorld({ via: 'browser', lanId: mine.id }, guestIdentity(game, guestName(), mine.code ?? ''));
    else if (theirs) void game.joinWorld({ via: 'relay' }, guestIdentity(game, guestName(), code));
    else game.setScreen(new JoinMultiplayerScreen(game, game.titleScreenFactory?.() ?? null, code));
  }, 100);
}
