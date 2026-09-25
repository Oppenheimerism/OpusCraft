// Goat horns (M8; vanilla InstrumentItem, Instruments and the #goat_horns instrument tags, 1.21). Each horn carries one
// of eight calls (minecraft:instrument): Ponder, Sing, Seek and Feel from a regular goat (and pillager outposts' chests),
// Admire, Call, Yearn and Dream from a screaming one. Used, it's raised to the lips and blown: its call carries 256
// blocks (sound category of the note blocks), and the horn can't be blown again for seven seconds. A horn with no call
// does nothing. The creative inventory has all eight; the call names itself, grey, under the horn's name.

import { ITEMS, ItemStack } from '../item/item';
import type { Rand } from '../core/rng';
import { registerItemBehavior } from './itemBehavior';
import { registerHoverText } from '../item/hoverText';

/** vanilla Instruments, in their sounds' order (item.goat_horn.sound.0-7) */
export const GOAT_HORN_INSTRUMENTS = [
  'ponder_goat_horn', 'sing_goat_horn', 'seek_goat_horn', 'feel_goat_horn', 'admire_goat_horn', 'call_goat_horn', 'yearn_goat_horn', 'dream_goat_horn',
];
/** vanilla #regular_goat_horns and #screaming_goat_horns */
export const REGULAR_GOAT_HORNS = GOAT_HORN_INSTRUMENTS.slice(0, 4);
export const SCREAMING_GOAT_HORNS = GOAT_HORN_INSTRUMENTS.slice(4);
/** vanilla instrument.minecraft.<id> */
const NAMES = ['Ponder', 'Sing', 'Seek', 'Feel', 'Admire', 'Call', 'Yearn', 'Dream'];
/** vanilla Instrument.useDuration (and the cooldown) and range */
export const GOAT_HORN_USE_DURATION = 140;
const RANGE = 256;

/** vanilla InstrumentItem.create: a goat horn with this call */
export function goatHornStack(instrument: string): ItemStack {
  const s = ItemStack.of('goat_horn');
  s.tag = { instrument };
  return s;
}

/** vanilla SetInstrumentFunction: one of these calls, at random */
export function withRandomInstrument(s: ItemStack, options: readonly string[], r: Rand): ItemStack {
  s.tag = { ...s.tag, instrument: options[r.nextInt(options.length)] };
  return s;
}

registerItemBehavior('goat_horn', {
  /**
   * vanilla InstrumentItem.use: with a call, it's raised (the toot-horn pose, for seven seconds at most) and blown —
   * the call heard 256 blocks round — and cools down seven seconds; without one, nothing
   */
  use(level, p, stack) {
    const i = GOAT_HORN_INSTRUMENTS.indexOf(stack.tag?.instrument ?? '');
    if (i < 0) return 'fail';
    // (vanilla ServerPlayerGameMode.useItem: an item cooling down isn't used)
    if (p.cooldowns.get('goat_horn')) return 'pass';
    p.startUsingItem(stack, GOAT_HORN_USE_DURATION);
    level.sound.play(`item.goat_horn.sound.${i}`, p.x, p.y, p.z, RANGE / 16, 1);
    level.gameEvent('instrument_play', p.x, p.y, p.z, { entity: p });
    p.cooldowns.set('goat_horn', GOAT_HORN_USE_DURATION);
    return 'success';
  },
});

// vanilla InstrumentItem.appendHoverText: the call, grey
registerHoverText('goat_horn', (s) => {
  const i = GOAT_HORN_INSTRUMENTS.indexOf(s.tag?.instrument ?? '');
  return i >= 0 ? [`§7${NAMES[i]}`] : [];
});

// vanilla CreativeModeTabs.generateInstrumentTypes: one of each call
const horn = ITEMS.get('goat_horn');
if (horn) horn.creativeStacks = () => GOAT_HORN_INSTRUMENTS.map(goatHornStack);
