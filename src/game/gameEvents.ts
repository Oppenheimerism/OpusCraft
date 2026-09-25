// Game events (vanilla GameEvent, GameEventDispatcher and GameEventListener, with the game event tags and the block
// tags that go with them): what happens in the world that something may notice. A step, a block placed or broken, a
// chest opened, food eaten, an arrow landing, a mob hurt or dying... each is posted at a position with what caused
// it, and every listener near enough hears it: sculk sensors and shriekers (game/vibrations.ts), the sculk catalyst
// (a death near it) and the warden. Each event has the vibration frequency a sensor gives off for it.

import { BLOCKS, STATE_BLOCK } from '../world/block';

/** vanilla GameEvent: every event, with its notification radius (16 unless it says otherwise) */
export const GAME_EVENT_RADIUS: Record<string, number> = {};
const EVENTS = [
  'block_activate', 'block_attach', 'block_change', 'block_close', 'block_deactivate', 'block_destroy', 'block_detach', 'block_open', 'block_place',
  'container_close', 'container_open', 'drink', 'eat', 'elytra_glide', 'entity_damage', 'entity_die', 'entity_dismount', 'entity_interact',
  'entity_mount', 'entity_place', 'entity_action', 'equip', 'explode', 'flap', 'fluid_pickup', 'fluid_place', 'hit_ground', 'instrument_play',
  'item_interact_finish', 'item_interact_start', 'jukebox_play', 'jukebox_stop_play', 'lightning_strike', 'note_block_play', 'prime_fuse',
  'projectile_land', 'projectile_shoot', 'sculk_sensor_tendrils_clicking', 'shear', 'shriek', 'splash', 'step', 'swim', 'teleport', 'unequip',
] as const;
for (const e of EVENTS) GAME_EVENT_RADIUS[e] = 16;
GAME_EVENT_RADIUS.jukebox_play = GAME_EVENT_RADIUS.jukebox_stop_play = 10;
GAME_EVENT_RADIUS.shriek = 32;
for (let i = 1; i <= 15; i++) GAME_EVENT_RADIUS[`resonate_${i}`] = 16;

export type GameEventName = (typeof EVENTS)[number] | `resonate_${number}`;

/** vanilla VibrationSystem.VIBRATION_FREQUENCY_FOR_EVENT (0 for those that aren't vibrations) */
export const VIBRATION_FREQUENCY: Record<string, number> = {
  step: 1, swim: 1, flap: 1,
  projectile_land: 2, hit_ground: 2, splash: 2,
  item_interact_finish: 3, projectile_shoot: 3, instrument_play: 3,
  entity_action: 4, elytra_glide: 4, unequip: 4,
  entity_dismount: 5, equip: 5,
  entity_interact: 6, shear: 6, entity_mount: 6,
  entity_damage: 7,
  drink: 8, eat: 8,
  container_close: 9, block_close: 9, block_deactivate: 9, block_detach: 9,
  container_open: 10, block_open: 10, block_activate: 10, block_attach: 10, prime_fuse: 10, note_block_play: 10,
  block_change: 11,
  block_destroy: 12, fluid_pickup: 12,
  block_place: 13, fluid_place: 13,
  entity_place: 14, lightning_strike: 14, teleport: 14,
  entity_die: 15, explode: 15,
};
for (let i = 1; i <= 15; i++) VIBRATION_FREQUENCY[`resonate_${i}`] = i;

/** vanilla VibrationSystem.getGameEventFrequency */
export function vibrationFrequency(event: string): number {
  return VIBRATION_FREQUENCY[event] ?? 0;
}

/** vanilla VibrationSystem.getResonanceEventByFrequency */
export function resonanceEvent(frequency: number): GameEventName {
  return `resonate_${frequency}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Tags (vanilla GameEventTagsProvider)

/** vanilla GameEventTagsProvider.VIBRATIONS_EXCEPT_FLAP */
const VIBRATIONS_EXCEPT_FLAP = [
  'block_attach', 'block_change', 'block_close', 'block_destroy', 'block_detach', 'block_open', 'block_place', 'block_activate', 'block_deactivate',
  'container_close', 'container_open', 'drink', 'eat', 'elytra_glide', 'entity_damage', 'entity_die', 'entity_dismount', 'entity_interact',
  'entity_mount', 'entity_place', 'entity_action', 'equip', 'explode', 'fluid_pickup', 'fluid_place', 'hit_ground', 'instrument_play',
  'item_interact_finish', 'lightning_strike', 'note_block_play', 'prime_fuse', 'projectile_land', 'projectile_shoot', 'shear', 'splash', 'step',
  'swim', 'teleport', 'unequip', ...Array.from({ length: 15 }, (_, i) => `resonate_${i + 1}`),
];

export const GAME_EVENT_TAGS = {
  /** #vibrations: what sculk sensors hear */
  vibrations: new Set([...VIBRATIONS_EXCEPT_FLAP, 'flap']),
  /** #shrieker_can_listen: a sensor's tendrils clicking */
  shrieker_can_listen: new Set(['sculk_sensor_tendrils_clicking']),
  /** #warden_can_listen: the vibrations but flapping, a shriek, and a sensor's tendrils clicking */
  warden_can_listen: new Set([...VIBRATIONS_EXCEPT_FLAP, 'shriek', 'sculk_sensor_tendrils_clicking']),
  /** #ignore_vibrations_sneaking: what isn't heard from something stepping carefully */
  ignore_vibrations_sneaking: new Set(['hit_ground', 'projectile_shoot', 'step', 'swim', 'item_interact_start', 'item_interact_finish']),
  /** #allay_can_listen */
  allay_can_listen: new Set(['note_block_play']),
};

// ---------------------------------------------------------------------------------------------------------------
// The block tags vibrations care about

const WOOL = /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_wool$/;
const WOOL_CARPET = /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_carpet$/;

/** vanilla #occludes_vibration_signals: the wools; a vibration can't pass through them */
export function occludesVibrations(st: number): boolean {
  return WOOL.test(BLOCKS[STATE_BLOCK[st]].name);
}

/** vanilla #dampens_vibrations: the wools and the carpets; what happens to them (stepping on them) makes no vibration */
export function dampensVibrations(st: number): boolean {
  const n = BLOCKS[STATE_BLOCK[st]].name;
  return WOOL.test(n) || WOOL_CARPET.test(n);
}

/** vanilla ItemTags.DAMPENS_VIBRATIONS: a dropped wool or carpet makes none either (ItemEntity.dampensVibrations) */
export function itemDampensVibrations(itemId: string): boolean {
  return WOOL.test(itemId) || WOOL_CARPET.test(itemId);
}

/** vanilla #vibration_resonators: amethyst blocks give a vibration's frequency back as a resonance */
export function resonatesVibrations(st: number): boolean {
  return BLOCKS[STATE_BLOCK[st]].name === 'amethyst_block';
}
