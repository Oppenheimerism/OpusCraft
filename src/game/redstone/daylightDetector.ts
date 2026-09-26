// The daylight detector (vanilla DaylightDetectorBlock, DaylightDetectorBlockEntity): once a second it gives off as
// much power as there's daylight on it — the sky light where it stands, less the dark of night and weather, and
// fading with the sun's height — or, inverted, as much as there's dark. Right-click inverts it. Its power is weak,
// out of every side, and it only works under a sky.

import { getBlock, type Block } from '../../world/block';
import { BlockEntity, registerBlockEntityType } from '../../world/blockEntity';
import { timeOfDay } from '../../render/environment';
import { registerBehavior } from '../blockBehavior';
import type { Level } from '../level';

let DETECTOR: Block | null = null;
const detector = (): Block => (DETECTOR ??= getBlock('daylight_detector'));

/**
 * vanilla updateSignalStrength: the sky light on it less the level's sky darkening; inverted, 15 less that; else
 * scaled by the cosine of the sun's angle (pulled a fifth of the way toward straight up, so it's darker longer at the
 * ends of the day)
 */
export function updateSignalStrength(level: Level, x: number, y: number, z: number, st: number): void {
  let i = (level.world.getLight(x, y, z) >> 4) - level.skyDarken;
  let f = Math.fround(timeOfDay(level.skyTime()) * Math.PI * 2);
  if (detector().get(st, 'inverted')) i = 15 - i;
  else if (i > 0) {
    const g = f < Math.PI ? 0 : Math.PI * 2;
    f = Math.fround(f + (g - f) * 0.2);
    i = Math.round(i * Math.cos(f));
  }
  i = Math.max(0, Math.min(15, i));
  if (detector().get<number>(st, 'power') !== i) level.setBlock(x, y, z, detector().with(st, 'power', i), 3);
}

/** vanilla DaylightDetectorBlockEntity: nothing kept, but it's what ticks it (vanilla tickEntity: every 20 game ticks) */
export class DaylightDetectorBlockEntity extends BlockEntity {
  readonly id = 'daylight_detector';
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }
  override tick(level: Level): void {
    // (vanilla getTicker: none where there's no sky)
    if (!level.world.dim.hasSkyLight || level.gameTime % 20 !== 0) return;
    const st = level.getState(this.x, this.y, this.z);
    if (st >= detector().baseState && st < detector().baseState + detector().stateCount) updateSignalStrength(level, this.x, this.y, this.z, st);
  }
}

registerBlockEntityType('daylight_detector', (x, y, z) => new DaylightDetectorBlockEntity(x, y, z));

registerBehavior('daylight_detector', {
  isSignalSource: () => true,
  // vanilla getSignal: its power, whichever way (weak only)
  getSignal: (_w, _x, _y, _z, st) => detector().get<number>(st, 'power'),
  // vanilla useWithoutItem: inverted or back (players who may build), and read again at once
  use(level, x, y, z, st, ctx) {
    const mode = ctx.player.gameMode;
    if (mode === 'adventure' || mode === 'spectator') return false;
    const now = detector().with(st, 'inverted', !detector().get(st, 'inverted'));
    level.setBlock(x, y, z, now, 2);
    level.gameEvent('block_change', x + 0.5, y + 0.5, z + 0.5, { entity: ctx.player, state: now });
    updateSignalStrength(level, x, y, z, now);
    return true;
  },
});
