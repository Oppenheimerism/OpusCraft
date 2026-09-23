// Options screens (vanilla 1.21 OptionsScreen and its sub-screens).

import type { Game } from '../../game/game';
import { Screen, Button, CycleButton, Slider, Widget } from '../screen';
import { OptionsList, ScrollList } from '../list';
import type { GuiGraphics } from '../guiGraphics';
import { autoGuiScale } from '../guiGraphics';
import { boolOption, enumOption, intSlider, fracSlider, volumeSlider, pct } from './optionWidgets';
import { KEYS, keyDisplayName } from '../../game/input';
import { DEFAULT_KEYS, applyKeys } from '../../game/options';
import { saveWorldMeta } from '../../storage/worldStore';

const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'] as const;
export const DIFFICULTY_NAMES: Record<string, string> = { peaceful: 'Peaceful', easy: 'Easy', normal: 'Normal', hard: 'Hard' };
export const DIFFICULTY_INFO: Record<string, string> = {
  peaceful: "No hostile mobs and only some neutral mobs spawn. Hunger bar doesn't deplete and health replenishes over time.",
  easy: 'Hostile mobs spawn but deal less damage. Hunger bar depletes and drains health down to 5 hearts.',
  normal: 'Hostile mobs spawn and deal standard damage. Hunger bar depletes and drains health down to half a heart.',
  hard: 'Hostile mobs spawn and deal greater damage. Hunger bar depletes and drains all health.',
};

function inWorldMenu(game: Game): boolean {
  return game.inWorld && game.spawned;
}

export class OptionsScreen extends Screen {
  constructor(game: Game, parent: Screen | null) {
    super(game, 'Options');
    this.parent = parent;
  }

  init(): void {
    const g = this.game;
    const cx = Math.floor(this.width / 2);
    // header: FOV slider + Online.../Difficulty
    const fov = intSlider(g, 'FOV', 'fov', 30, 110, (v) => (v === 70 ? 'Normal' : v === 110 ? 'Quake Pro' : String(v)));
    fov.x = cx - 154;
    fov.y = 29;
    this.add(fov);
    if (inWorldMenu(g) && g.meta) {
      const meta = g.meta;
      const d = new CycleButton<string>(cx + 4, 29, 150, 20, 'Difficulty', [...DIFFICULTIES], meta.difficulty, (v) => DIFFICULTY_NAMES[v], (v) => {
        meta.difficulty = v;
        g.level.difficulty = v as (typeof DIFFICULTIES)[number];
        g.player.food.difficulty = g.level.difficulty;
        d.tooltip = DIFFICULTY_INFO[v];
        if (!meta.transient) void saveWorldMeta(meta);
      });
      d.tooltip = DIFFICULTY_INFO[meta.difficulty];
      d.active = !meta.hardcore;
      this.add(d);
    } else {
      this.add(new Button(cx + 4, 29, 150, 20, 'Online...', () => g.setScreen(new OnlineOptionsScreen(g, this))));
    }
    const x0 = Math.floor((this.width - 316) / 2) + 4;
    const y0 = Math.min(61 + 30, this.height - 33 - 120);
    const entries: [string, (() => Screen) | null][] = [
      ['Skin Customization...', () => new SkinCustomizationScreen(g, this)],
      ['Music & Sounds...', () => new SoundOptionsScreen(g, this)],
      ['Video Settings...', () => new VideoSettingsScreen(g, this)],
      ['Controls...', () => new ControlsScreen(g, this)],
      ['Language...', () => new LanguageScreen(g, this)],
      ['Chat Settings...', () => new ChatOptionsScreen(g, this)],
      ['Resource Packs...', null],
      ['Accessibility Settings...', () => new AccessibilityOptionsScreen(g, this)],
      ['Telemetry Data...', null],
      ['Credits & Attribution...', null],
    ];
    entries.forEach(([label, make], i) => {
      const b = this.add(new Button(x0 + (i % 2) * 158, y0 + Math.floor(i / 2) * 24, 150, 20, label, () => make && g.setScreen(make())));
      b.active = !!make;
    });
    this.add(new Button(cx - 100, this.height - 27, 200, 20, 'Done', () => this.onClose()));
  }

  override titleY(): number {
    return 12;
  }

  override onClose(): void {
    this.game.saveOptions();
    super.onClose();
  }
}

/** vanilla OptionsSubScreen: title header (33), OptionsList, Done footer (33) */
export abstract class OptionsSubScreen extends Screen {
  list!: OptionsList;
  constructor(game: Game, parent: Screen | null, title: string) {
    super(game, title);
    this.parent = parent;
  }

  init(): void {
    this.list = this.add(new OptionsList(this.width, 33, this.height - 66));
    this.list.inWorld = inWorldMenu(this.game);
    this.addOptions(this.list);
    this.addFooter();
  }

  addFooter(): void {
    this.add(new Button(Math.floor(this.width / 2) - 100, this.height - 27, 200, 20, 'Done', () => this.onClose()));
  }

  abstract addOptions(list: OptionsList): void;

  override titleY(): number {
    return 12;
  }

  override onClose(): void {
    this.game.saveOptions();
    super.onClose();
  }
}

export class VideoSettingsScreen extends OptionsSubScreen {
  private startRd = 0;
  private startSmooth = true;
  private startGraphics = 1;
  constructor(game: Game, parent: Screen | null) {
    super(game, parent, 'Video Settings');
    this.startRd = game.opts.renderDistance;
    this.startSmooth = game.opts.smoothLighting;
    this.startGraphics = game.opts.graphics;
  }

  addOptions(list: OptionsList): void {
    const g = this.game;
    const o = g.opts;
    const graphicsTips = [
      'Fast graphics reduces the amount of visible rain and snow. Transparency effects are disabled for various blocks such as leaves.',
      'Fancy graphics balances performance and quality for the majority of machines. Weather, clouds, and particles may not appear behind translucent blocks or water.',
      'Fabulous! graphics uses screen shaders for drawing weather, clouds, and particles behind translucent blocks and water. This may severely impact performance for portable devices and 4K displays.',
    ];
    const graphics = enumOption(g, 'Graphics', 'graphics', ['Fast', 'Fancy', 'Fabulous!'], (v) => {
      graphics.tooltip = graphicsTips[v];
      g.applyVideoOptions();
    });
    graphics.tooltip = graphicsTips[o.graphics];
    const maxScale = autoGuiScale(g.canvas.width, g.canvas.height, 0);
    const scales = [0];
    for (let i = 1; i <= maxScale; i++) scales.push(i);
    const guiScale = new CycleButton<number>(0, 0, 150, 20, 'GUI Scale', scales, Math.min(o.guiScale, maxScale), (v) => (v === 0 ? 'Auto' : String(v)), (v) => {
      o.guiScale = v;
      g.saveOptions();
    });
    const fullscreen = new CycleButton<boolean>(0, 0, 150, 20, 'Fullscreen', [true, false], !!document.fullscreenElement, (v) => (v ? 'ON' : 'OFF'), (v) => {
      if (v) document.documentElement.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) document.exitFullscreen?.();
    });
    list.addSmall(
      graphics,
      intSlider(g, 'Render Distance', 'renderDistance', 2, 32, (v) => `${v} chunks`, () => g.applyVideoOptions(), 1, true),
      enumOption(g, 'Chunk Builder', 'chunkBuilder', ['Threaded', 'Semi Blocking', 'Fully Blocking']),
      intSlider(g, 'Simulation Distance', 'simulationDistance', 5, 32, (v) => `${v} chunks`, () => g.applyVideoOptions(), 1, true),
      boolOption(g, 'Smooth Lighting', 'smoothLighting'),
      intSlider(g, 'Max Framerate', 'maxFps', 10, 260, (v) => (v >= 260 ? 'Unlimited' : `${v} fps`), undefined, 10),
      boolOption(g, 'VSync', 'vsync'),
      boolOption(g, 'View Bobbing', 'bobView'),
      guiScale,
      enumOption(g, 'Attack Indicator', 'attackIndicator', ['OFF', 'Crosshair', 'Hotbar']),
      fracSlider(g, 'Brightness', 'gamma', (v) => (v <= 0 ? 'Moody' : v >= 1 ? 'Bright' : `+${Math.round(v * 100)}%`)),
      enumOption(g, 'Clouds', 'clouds', ['OFF', 'Fast', 'Fancy'], () => g.applyVideoOptions()),
      fullscreen,
      enumOption(g, 'Particles', 'particles', ['All', 'Decreased', 'Minimal']),
      intSlider(g, 'Mipmap Levels', 'mipmapLevels', 0, 4, (v) => (v === 0 ? 'OFF' : String(v))),
      boolOption(g, 'Entity Shadows', 'entityShadows'),
      fracSlider(g, 'Distortion Effects', 'screenEffectScale', pct),
      intSlider(g, 'Entity Distance', 'entityDistanceScaling', 0.5, 5, (v) => `${Math.round(v * 100)}%`, undefined, 0.25),
      fracSlider(g, 'FOV Effects', 'fovEffects', pct),
      boolOption(g, 'Autosave Indicator', 'showAutosaveIndicator'),
      fracSlider(g, 'Glint Speed', 'glintSpeed', pct),
      fracSlider(g, 'Glint Strength', 'glintStrength', pct),
      intSlider(g, 'Menu Background Blur', 'menuBlur', 0, 10, (v) => (v === 0 ? 'OFF' : String(v))),
    );
  }

  override removed(): void {
    const o = this.game.opts;
    const remesh = o.smoothLighting !== this.startSmooth || (o.graphics >= 1) !== (this.startGraphics >= 1);
    if (remesh || o.renderDistance !== this.startRd) this.game.applyVideoOptions(remesh);
    this.startRd = o.renderDistance;
    this.startSmooth = o.smoothLighting;
    this.startGraphics = o.graphics;
  }
}

export class SoundOptionsScreen extends OptionsSubScreen {
  constructor(game: Game, parent: Screen | null) {
    super(game, parent, 'Music & Sound Options');
  }
  addOptions(list: OptionsList): void {
    const g = this.game;
    list.addBig(volumeSlider(g, 'Master Volume', 'masterVolume'));
    list.addSmall(
      volumeSlider(g, 'Music', 'musicVolume'),
      volumeSlider(g, 'Jukebox/Note Blocks', 'recordsVolume'),
      volumeSlider(g, 'Weather', 'weatherVolume'),
      volumeSlider(g, 'Blocks', 'blocksVolume'),
      volumeSlider(g, 'Hostile Creatures', 'hostileVolume'),
      volumeSlider(g, 'Friendly Creatures', 'friendlyVolume'),
      volumeSlider(g, 'Players', 'playersVolume'),
      volumeSlider(g, 'Ambient/Environment', 'ambientVolume'),
      volumeSlider(g, 'Voice/Speech', 'voiceVolume'),
    );
    list.addBig(new CycleButton<string>(0, 0, 310, 20, 'Device', ['System Default'], 'System Default', (v) => v, () => {}));
    list.addSmall(boolOption(g, 'Show Subtitles', 'showSubtitles'), boolOption(g, 'Directional Audio', 'directionalAudio', undefined, 'Directional audio needs headphones. Simulates the sound heard by the ears.'));
  }
}

export class ControlsScreen extends OptionsSubScreen {
  constructor(game: Game, parent: Screen | null) {
    super(game, parent, 'Controls');
  }
  addOptions(list: OptionsList): void {
    const g = this.game;
    const holdToggle = (caption: string, key: 'toggleCrouch' | 'toggleSprint') =>
      new CycleButton<boolean>(0, 0, 150, 20, caption, [false, true], g.opts[key], (v) => (v ? 'Toggle' : 'Hold'), (v) => {
        g.opts[key] = v;
        g.saveOptions();
      });
    list.addSmall(
      new Button(0, 0, 150, 20, 'Mouse Settings...', () => g.setScreen(new MouseSettingsScreen(g, this))),
      new Button(0, 0, 150, 20, 'Key Binds...', () => g.setScreen(new KeyBindsScreen(g, this))),
      holdToggle('Sneak', 'toggleCrouch'),
      holdToggle('Sprint', 'toggleSprint'),
      boolOption(g, 'Auto-Jump', 'autoJump'),
      boolOption(g, 'Operator Items Tab', 'operatorItemsTab'),
    );
  }
}

export class MouseSettingsScreen extends OptionsSubScreen {
  constructor(game: Game, parent: Screen | null) {
    super(game, parent, 'Mouse Settings');
  }
  addOptions(list: OptionsList): void {
    const g = this.game;
    list.addSmall(
      fracSlider(g, 'Sensitivity', 'sensitivity', (v) => (v <= 0 ? '*yawn*' : v >= 1 ? 'HYPERSPEED!!!' : `${Math.round(v * 200)}%`)),
      boolOption(g, 'Touchscreen Mode', 'touchscreen'),
      fracSlider(g, 'Scroll Sensitivity', 'mouseWheelSensitivity', (v) => v.toFixed(2), undefined, 0.01, 10),
      boolOption(g, 'Discrete Scrolling', 'discreteMouseScroll'),
      boolOption(g, 'Invert Mouse', 'invertMouse'),
      boolOption(g, 'Raw Input', 'rawMouseInput'),
    );
  }
}

export class AccessibilityOptionsScreen extends OptionsSubScreen {
  constructor(game: Game, parent: Screen | null) {
    super(game, parent, 'Accessibility Settings');
  }
  addOptions(list: OptionsList): void {
    const g = this.game;
    const narrator = new CycleButton<string>(0, 0, 150, 20, 'Narrator', ['Not Available'], 'Not Available', (v) => v, () => {});
    narrator.active = false;
    const holdToggle = (caption: string, key: 'toggleCrouch' | 'toggleSprint') =>
      new CycleButton<boolean>(0, 0, 150, 20, caption, [false, true], g.opts[key], (v) => (v ? 'Toggle' : 'Hold'), (v) => {
        g.opts[key] = v;
        g.saveOptions();
      });
    list.addSmall(
      narrator,
      boolOption(g, 'Show Subtitles', 'showSubtitles'),
      boolOption(g, 'High Contrast', 'highContrast'),
      boolOption(g, 'Auto-Jump', 'autoJump'),
      intSlider(g, 'Menu Background Blur', 'menuBlur', 0, 10, (v) => (v === 0 ? 'OFF' : String(v))),
      fracSlider(g, 'Text Background Opacity', 'textBackgroundOpacity', pct),
      new CycleButton<boolean>(0, 0, 150, 20, 'Text Background', [true, false], g.opts.backgroundForChatOnly, (v) => (v ? 'Chat' : 'Everywhere'), (v) => {
        g.opts.backgroundForChatOnly = v;
        g.saveOptions();
      }),
      fracSlider(g, 'Chat Text Opacity', 'chatOpacity', (v) => pct(v * 0.9 + 0.1)),
      fracSlider(g, 'Line Spacing', 'chatLineSpacing', pct),
      intSlider(g, 'Chat Delay', 'chatDelay', 0, 6, (v) => (v === 0 ? 'None' : `${v.toFixed(1)} seconds`), undefined, 0.1),
      intSlider(g, 'Notification Time', 'notificationDisplayTime', 0.5, 10, (v) => `${v.toFixed(1)}x`, undefined, 0.1),
      boolOption(g, 'View Bobbing', 'bobView'),
      holdToggle('Sneak', 'toggleCrouch'),
      holdToggle('Sprint', 'toggleSprint'),
      fracSlider(g, 'Distortion Effects', 'screenEffectScale', pct),
      fracSlider(g, 'FOV Effects', 'fovEffects', pct),
      fracSlider(g, 'Darkness Pulsing', 'darknessEffectScale', pct),
      fracSlider(g, 'Damage Tilt', 'damageTiltStrength', pct),
      fracSlider(g, 'Glint Speed', 'glintSpeed', pct),
      fracSlider(g, 'Glint Strength', 'glintStrength', pct),
      boolOption(g, 'Hide Lightning Flashes', 'hideLightningFlash'),
      boolOption(g, 'Monochrome Logo', 'monochromeLogo'),
      fracSlider(g, 'Panorama Scroll Speed', 'panoramaSpeed', pct),
      boolOption(g, 'Hide Splash Texts', 'hideSplashTexts'),
    );
  }
}

export class ChatOptionsScreen extends OptionsSubScreen {
  constructor(game: Game, parent: Screen | null) {
    super(game, parent, 'Chat Settings...');
  }
  addOptions(list: OptionsList): void {
    const g = this.game;
    const narrator = new CycleButton<string>(0, 0, 150, 20, 'Narrator', ['Not Available'], 'Not Available', (v) => v, () => {});
    narrator.active = false;
    list.addSmall(
      enumOption(g, 'Chat', 'chatVisibility', ['Shown', 'Commands Only', 'Hidden']),
      boolOption(g, 'Colors', 'chatColors'),
      boolOption(g, 'Web Links', 'chatLinks'),
      boolOption(g, 'Prompt on Links', 'chatLinksPrompt'),
      fracSlider(g, 'Chat Text Opacity', 'chatOpacity', (v) => pct(v * 0.9 + 0.1)),
      fracSlider(g, 'Text Background Opacity', 'textBackgroundOpacity', pct),
      fracSlider(g, 'Chat Text Size', 'chatScale', (v) => (v <= 0 ? 'OFF' : pct(v))),
      fracSlider(g, 'Line Spacing', 'chatLineSpacing', pct),
      intSlider(g, 'Chat Delay', 'chatDelay', 0, 6, (v) => (v === 0 ? 'None' : `${v.toFixed(1)} seconds`), undefined, 0.1),
      fracSlider(g, 'Width', 'chatWidth', (v) => `${Math.floor(v * 280 + 40)}px`),
      fracSlider(g, 'Focused Height', 'chatHeightFocused', (v) => `${Math.floor(v * 160 + 20)}px`),
      fracSlider(g, 'Unfocused Height', 'chatHeightUnfocused', (v) => `${Math.floor(v * 160 + 20)}px`),
      narrator,
      boolOption(g, 'Command Suggestions', 'autoSuggestions'),
      boolOption(g, 'Hide Matching Names', 'hideMatchedNames'),
      boolOption(g, 'Reduced Debug Info', 'reducedDebugInfo'),
      boolOption(g, 'Only Show Secure Chat', 'onlyShowSecureChat'),
    );
  }
}

export class SkinCustomizationScreen extends OptionsSubScreen {
  constructor(game: Game, parent: Screen | null) {
    super(game, parent, 'Skin Customization');
  }
  addOptions(list: OptionsList): void {
    const g = this.game;
    list.addSmall(
      boolOption(g, 'Cape', 'skinCape'),
      boolOption(g, 'Jacket', 'skinJacket'),
      boolOption(g, 'Left Sleeve', 'skinLeftSleeve'),
      boolOption(g, 'Right Sleeve', 'skinRightSleeve'),
      boolOption(g, 'Left Pants Leg', 'skinLeftPants'),
      boolOption(g, 'Right Pants Leg', 'skinRightPants'),
      boolOption(g, 'Hat', 'skinHat'),
      new CycleButton<'left' | 'right'>(0, 0, 150, 20, 'Main Hand', ['left', 'right'], g.opts.mainHand, (v) => (v === 'left' ? 'Left' : 'Right'), (v) => {
        g.opts.mainHand = v;
        g.saveOptions();
      }),
    );
  }
}

export class OnlineOptionsScreen extends OptionsSubScreen {
  constructor(game: Game, parent: Screen | null) {
    super(game, parent, 'Online Options');
  }
  addOptions(list: OptionsList): void {
    const g = this.game;
    list.addSmall(boolOption(g, 'Realms Notifications', 'realmsNotifications'), boolOption(g, 'Allow Server Listings', 'allowServerListing'));
  }
}

class LanguageList extends ScrollList<string> {
  renderEntry(g: GuiGraphics, e: string, _i: number, _left: number, top: number): void {
    g.centered(e, Math.floor(this.w / 2), top + 1, 0xffffff, true);
  }
}

export class LanguageScreen extends Screen {
  constructor(game: Game, parent: Screen | null) {
    super(game, 'Language');
    this.parent = parent;
  }
  init(): void {
    const list = this.add(new LanguageList(0, 33, this.width, this.height - 33 - 53, 18, 220));
    list.inWorld = inWorldMenu(this.game);
    list.entries = ['English (US)'];
    list.selected = list.entries[0];
    const cx = Math.floor(this.width / 2);
    this.add(new Button(cx - 155, this.height - 27, 150, 20, 'Font Settings...', () => {})).active = false;
    this.add(new Button(cx + 5, this.height - 27, 150, 20, 'Done', () => this.onClose()));
  }
  override titleY(): number {
    return 12;
  }
  override render(g: GuiGraphics, mx: number, my: number, partial: number): void {
    super.render(g, mx, my, partial);
    g.centered('(Language translations may not be 100% accurate)', this.width / 2, this.height - 46, 0x808080, true);
  }
}

// ---------------------------------------------------------------------------
// Key binds

interface Bind {
  key: keyof typeof KEYS | null;
  label: string;
  fixed?: string;
}

const BIND_CATEGORIES: [string, Bind[]][] = [
  [
    'Movement',
    [
      { key: 'jump', label: 'Jump' },
      { key: 'sneak', label: 'Sneak' },
      { key: 'sprint', label: 'Sprint' },
      { key: 'left', label: 'Strafe Left' },
      { key: 'right', label: 'Strafe Right' },
      { key: 'back', label: 'Walk Backwards' },
      { key: 'forward', label: 'Walk Forwards' },
    ],
  ],
  [
    'Gameplay',
    [
      { key: null, label: 'Attack/Destroy', fixed: 'Left Button' },
      { key: null, label: 'Pick Block', fixed: 'Middle Button' },
      { key: null, label: 'Use Item/Place Block', fixed: 'Right Button' },
    ],
  ],
  [
    'Inventory',
    [
      { key: 'drop', label: 'Drop Selected Item' },
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ key: `hotbar${i}` as keyof typeof KEYS, label: `Hotbar Slot ${i}` })),
      { key: 'inventory', label: 'Open/Close Inventory' },
      { key: 'swapHands', label: 'Swap Item With Offhand' },
    ],
  ],
  [
    'Creative Mode',
    [
      { key: 'loadToolbar', label: 'Load Hotbar Activator' },
      { key: 'saveToolbar', label: 'Save Hotbar Activator' },
    ],
  ],
  [
    'Multiplayer',
    [
      { key: 'playerList', label: 'List Players' },
      { key: 'chat', label: 'Open Chat' },
      { key: 'command', label: 'Open Command' },
      { key: 'socialInteractions', label: 'Social Interactions' },
    ],
  ],
  [
    'Miscellaneous',
    [
      { key: 'advancements', label: 'Advancements' },
      { key: 'spectatorOutlines', label: 'Highlight Players (Spectators)' },
      { key: 'screenshot', label: 'Take Screenshot' },
      { key: 'cinematic', label: 'Toggle Cinematic Camera' },
      { key: 'fullscreen', label: 'Toggle Fullscreen' },
      { key: 'togglePerspective', label: 'Toggle Perspective' },
    ],
  ],
];

export function keyName(code: string): string {
  return keyDisplayName(code);
}

type BindRow = { category: string } | { bind: Bind; change: Button; reset: Button };

class KeyBindsList extends ScrollList<BindRow> {
  constructor(private readonly screen: KeyBindsScreen, w: number, top: number, h: number) {
    super(0, top, w, h, 20, 340);
    this.selectable = false;
  }
  override scrollbarX(): number {
    return Math.floor(this.w / 2) + 170 + 6;
  }
  renderEntry(g: GuiGraphics, e: BindRow, _i: number, left: number, top: number, _w: number, height: number, mx: number, my: number): void {
    if ('category' in e) {
      g.text(e.category, Math.floor(this.w / 2) - Math.floor(g.textWidth(e.category) / 2), top + height - 9 - 1, 0xffffff, false);
      return;
    }
    const rx = this.scrollbarX() - 50 - 10;
    e.reset.x = rx;
    e.reset.y = top - 2;
    e.change.x = rx - 5 - 75;
    e.change.y = top - 2;
    const code = e.bind.key ? KEYS[e.bind.key] : '';
    const listening = this.screen.listening === e.bind;
    const name = e.bind.fixed ?? keyName(code);
    e.change.label = listening ? `§e> §f${name}§e <` : name;
    e.reset.active = !!e.bind.key && code !== DEFAULT_KEYS[e.bind.key];
    e.change.render(g, mx, my);
    e.reset.render(g, mx, my);
    g.text(e.bind.label, left, top + Math.floor(height / 2) - 4, 0xffffff, true);
  }
  override mouseClicked(mx: number, my: number, b: number): boolean {
    if (my < this.y || my >= this.bottom) return false;
    for (const e of this.entries) {
      if ('category' in e) continue;
      if (e.change.mouseClicked(mx, my, b) || e.reset.mouseClicked(mx, my, b)) return true;
    }
    return super.mouseClicked(mx, my, b);
  }
}

export class KeyBindsScreen extends Screen {
  listening: Bind | null = null;
  constructor(game: Game, parent: Screen | null) {
    super(game, 'Key Binds');
    this.parent = parent;
  }
  init(): void {
    const list = this.add(new KeyBindsList(this, this.width, 33, this.height - 66));
    list.inWorld = inWorldMenu(this.game);
    for (const [cat, binds] of BIND_CATEGORIES) {
      list.entries.push({ category: cat });
      for (const bind of binds) {
        const change = new Button(0, 0, 75, 20, '', () => {
          if (bind.key) this.listening = bind;
        });
        const reset = new Button(0, 0, 50, 20, 'Reset', () => {
          if (!bind.key) return;
          this.setKey(bind.key, DEFAULT_KEYS[bind.key]);
        });
        list.entries.push({ bind, change, reset });
      }
    }
    const cx = Math.floor(this.width / 2);
    this.add(new Button(cx - 154, this.height - 27, 150, 20, 'Reset Keys', () => {
      for (const k of Object.keys(DEFAULT_KEYS) as (keyof typeof KEYS)[]) this.game.opts.keys[k] = DEFAULT_KEYS[k];
      applyKeys(this.game.opts);
      this.game.saveOptions();
    }));
    this.add(new Button(cx + 4, this.height - 27, 150, 20, 'Done', () => this.onClose()));
  }
  private setKey(k: keyof typeof KEYS, code: string): void {
    this.game.opts.keys[k] = code;
    applyKeys(this.game.opts);
    this.game.saveOptions();
  }
  override titleY(): number {
    return 12;
  }
  override keyPressed(e: KeyboardEvent): boolean {
    if (this.listening && this.listening.key) {
      this.setKey(this.listening.key, e.code === 'Escape' ? '' : e.code);
      this.listening = null;
      return true;
    }
    return super.keyPressed(e);
  }
  override charTyped(): boolean {
    return false;
  }
}

export type { Slider, Widget };
