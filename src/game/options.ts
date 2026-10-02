// Game options (vanilla options.txt equivalents), persisted in localStorage.

import { touchOnly } from './touch';
import { KEYS } from './input';

export interface GameOptions {
  // video
  renderDistance: number;
  simulationDistance: number;
  fov: number;
  gamma: number;
  bobView: boolean;
  smoothLighting: boolean;
  /** 0 fast, 1 fancy, 2 fabulous */
  graphics: number;
  /** derived: graphics >= 1 */
  fancy: boolean;
  guiScale: number; // 0 = auto
  /** 0 off, 1 fast, 2 fancy */
  clouds: number;
  maxFps: number; // 260 = unlimited
  vsync: boolean;
  attackIndicator: number; // 0 off, 1 crosshair, 2 hotbar
  particles: number; // 0 all, 1 decreased, 2 minimal
  mipmapLevels: number;
  entityShadows: boolean;
  screenEffectScale: number;
  entityDistanceScaling: number;
  fovEffects: number;
  showAutosaveIndicator: boolean;
  glintSpeed: number;
  glintStrength: number;
  menuBlur: number;
  chunkBuilder: number;
  // sound
  masterVolume: number;
  musicVolume: number;
  recordsVolume: number;
  weatherVolume: number;
  blocksVolume: number;
  hostileVolume: number;
  friendlyVolume: number;
  playersVolume: number;
  ambientVolume: number;
  voiceVolume: number;
  showSubtitles: boolean;
  directionalAudio: boolean;
  // controls
  sensitivity: number;
  invertMouse: boolean;
  autoJump: boolean;
  toggleCrouch: boolean;
  toggleSprint: boolean;
  operatorItemsTab: boolean;
  mouseWheelSensitivity: number;
  discreteMouseScroll: boolean;
  touchscreen: boolean;
  /** (game/touch.ts) how fingers touch the world: a block where it is tapped, or what the crosshair is on with buttons */
  touchMode: 'tap' | 'crosshair';
  /** a phone's own distances have been given to these options (loadOptions): 1, else 0 */
  touchDefaults: number;
  rawMouseInput: boolean;
  // accessibility / chat
  narrator: number;
  highContrast: boolean;
  textBackgroundOpacity: number;
  backgroundForChatOnly: boolean;
  chatOpacity: number;
  chatLineSpacing: number;
  chatDelay: number;
  chatScale: number;
  chatWidth: number;
  chatHeightFocused: number;
  chatHeightUnfocused: number;
  chatVisibility: number; // 0 shown, 1 commands only, 2 hidden
  chatColors: boolean;
  chatLinks: boolean;
  chatLinksPrompt: boolean;
  autoSuggestions: boolean;
  hideMatchedNames: boolean;
  reducedDebugInfo: boolean;
  onlyShowSecureChat: boolean;
  notificationDisplayTime: number;
  darknessEffectScale: number;
  damageTiltStrength: number;
  hideLightningFlash: boolean;
  monochromeLogo: boolean;
  panoramaSpeed: number;
  hideSplashTexts: boolean;
  // skin
  skinCape: boolean;
  skinJacket: boolean;
  skinLeftSleeve: boolean;
  skinRightSleeve: boolean;
  skinLeftPants: boolean;
  skinRightPants: boolean;
  skinHat: boolean;
  mainHand: 'left' | 'right';
  // misc
  realmsNotifications: boolean;
  allowServerListing: boolean;
  username: string;
  keys: Record<string, string>;
  /** vanilla tutorialStep: first-time hints still to show */
  tutorialStep: string;
}

export const DEFAULT_KEYS: Record<string, string> = { ...KEYS };

export const DEFAULT_OPTIONS: GameOptions = {
  renderDistance: 12,
  simulationDistance: 12,
  fov: 70,
  gamma: 0.5,
  bobView: true,
  smoothLighting: true,
  graphics: 1,
  fancy: true,
  guiScale: 0,
  clouds: 2,
  maxFps: 120,
  vsync: true,
  attackIndicator: 1,
  particles: 0,
  mipmapLevels: 4,
  entityShadows: true,
  screenEffectScale: 1,
  entityDistanceScaling: 1,
  fovEffects: 1,
  showAutosaveIndicator: true,
  glintSpeed: 0.5,
  glintStrength: 0.75,
  menuBlur: 5,
  chunkBuilder: 0,
  masterVolume: 1,
  musicVolume: 1,
  recordsVolume: 1,
  weatherVolume: 1,
  blocksVolume: 1,
  hostileVolume: 1,
  friendlyVolume: 1,
  playersVolume: 1,
  ambientVolume: 1,
  voiceVolume: 1,
  showSubtitles: false,
  directionalAudio: false,
  sensitivity: 0.5,
  invertMouse: false,
  autoJump: false,
  toggleCrouch: false,
  toggleSprint: false,
  operatorItemsTab: false,
  mouseWheelSensitivity: 1,
  discreteMouseScroll: false,
  touchscreen: false,
  touchMode: 'tap',
  touchDefaults: 0,
  rawMouseInput: true,
  narrator: 0,
  highContrast: false,
  textBackgroundOpacity: 0.5,
  backgroundForChatOnly: true,
  chatOpacity: 1,
  chatLineSpacing: 0,
  chatDelay: 0,
  chatScale: 1,
  chatWidth: 1,
  chatHeightFocused: 1,
  chatHeightUnfocused: 0.4436619718309859,
  chatVisibility: 0,
  chatColors: true,
  chatLinks: true,
  chatLinksPrompt: true,
  autoSuggestions: true,
  hideMatchedNames: true,
  reducedDebugInfo: false,
  onlyShowSecureChat: false,
  notificationDisplayTime: 1,
  darknessEffectScale: 1,
  damageTiltStrength: 1,
  hideLightningFlash: false,
  monochromeLogo: false,
  panoramaSpeed: 1,
  hideSplashTexts: false,
  skinCape: true,
  skinJacket: true,
  skinLeftSleeve: true,
  skinRightSleeve: true,
  skinLeftPants: true,
  skinRightPants: true,
  skinHat: true,
  mainHand: 'right',
  realmsNotifications: true,
  allowServerListing: true,
  username: 'Player',
  keys: { ...DEFAULT_KEYS },
  tutorialStep: 'movement',
};

/**
 * (a phone or a tablet) how many chunks each way are drawn and ticked to begin with. A computer's 12 keep some 700
 * chunks in memory, and a phone's browser throws out a page that takes more memory than it allows (it loads the page
 * again, in the middle of play). The sliders still go as high as on a computer
 */
export const TOUCH_DISTANCE = 8;

export function loadOptions(): GameOptions {
  let o: GameOptions = { ...DEFAULT_OPTIONS, keys: { ...DEFAULT_KEYS } };
  const touch = touchOnly();
  try {
    const s = localStorage.getItem('mc.options');
    if (s) {
      const saved = JSON.parse(s) as Partial<GameOptions> & { clouds?: number | boolean };
      if (typeof saved.clouds === 'boolean') saved.clouds = saved.clouds ? 2 : 0;
      o = { ...o, ...(saved as Partial<GameOptions>), keys: { ...DEFAULT_KEYS, ...(saved.keys ?? {}) } };
      // (options saved before there were touch controls, on a phone: Auto-Jump on, as below)
      if (saved.touchMode === undefined && touch) o.autoJump = true;
    } else if (touch) o.autoJump = true; // (Bedrock: "Auto jump" is on by default on a phone, where jumping is a button to reach for)
  } catch {
    /* ignore */
  }
  // (a phone's distances, once: options saved there before it had them are brought down to them; a distance chosen since is kept)
  if (touch && !o.touchDefaults) {
    o.renderDistance = Math.min(o.renderDistance, TOUCH_DISTANCE);
    o.simulationDistance = Math.min(o.simulationDistance, TOUCH_DISTANCE);
    o.touchDefaults = 1;
  }
  o.fancy = o.graphics >= 1;
  applyKeys(o);
  return o;
}

export function saveOptions(o: GameOptions): void {
  try {
    localStorage.setItem('mc.options', JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

/** copy key bindings from options into the live KEYS table */
export function applyKeys(o: GameOptions): void {
  for (const k of Object.keys(KEYS) as (keyof typeof KEYS)[]) KEYS[k] = o.keys[k] ?? DEFAULT_KEYS[k];
}
