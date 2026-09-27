// The needles of the compass, the recovery compass and the clock (vanilla ItemProperties: CompassItemPropertyFunction's
// "angle" and the clock's "time", with their wobble): which of compass_NN / recovery_compass_NN (00..31, the needle
// NN/32 of a turn clockwise from straight up) or clock_NN (00..63, 00 = noon) a stack shows right now.
//
// Vanilla reads them for the entity showing the stack (its holder, the item entity, the frame); ours are read for the
// player whose view is drawn, wherever the stack is.

import type { ItemStack } from './item';
import type { Player } from '../entity/player';
import { timeOfDay } from '../render/environment';

const posMod = (v: number, m: number): number => ((v % m) + m) % m;

/** vanilla CompassItemPropertyFunction.CompassWobble */
class Wobble {
  rotation = 0;
  private deltaRotation = 0;
  private lastUpdateTick = -1;

  constructor(private readonly damping: number) {}

  shouldUpdate(tick: number): boolean {
    return this.lastUpdateTick !== tick;
  }

  update(tick: number, rotation: number): void {
    this.lastUpdateTick = tick;
    const d = posMod(rotation - this.rotation + 0.5, 1) - 0.5;
    this.deltaRotation += d * 0.1;
    this.deltaRotation *= this.damping;
    this.rotation = posMod(this.rotation + this.deltaRotation, 1);
  }
}

interface Target {
  dim: string;
  pos: readonly [number, number, number];
}

/** vanilla CompassItemPropertyFunction: one per item, like vanilla's one per registered property */
class CompassAngle {
  private readonly wobble = new Wobble(0.8);
  private readonly wobbleRandom = new Wobble(0.8);

  constructor(private readonly target: (p: Player, stack: ItemStack) => Target | null) {}

  angle(p: Player, stack: ItemStack, seed: number): number {
    const t = this.target(p, stack);
    const tick = p.level.gameTime;
    // (isValidCompassTargetPos: in this dimension, and not right on it)
    if (!t || t.dim !== p.level.dim.id || (t.pos[0] + 0.5 - p.x) ** 2 + (t.pos[1] + 0.5 - p.y) ** 2 + (t.pos[2] + 0.5 - p.z) ** 2 < 1e-5) {
      // getRandomlySpinningRotation
      if (this.wobbleRandom.shouldUpdate(tick)) this.wobbleRandom.update(tick, Math.random());
      return posMod(this.wobbleRandom.rotation + Math.imul(seed, 1327217883) / 2.1474836e9, 1);
    }
    // getRotationTowardsCompassTarget, for the local player
    const d0 = Math.atan2(t.pos[2] + 0.5 - p.z, t.pos[0] + 0.5 - p.x) / (Math.PI * 2);
    const d1 = posMod(p.yaw / 360, 1);
    if (this.wobble.shouldUpdate(tick)) this.wobble.update(tick, 0.5 - (d1 - 0.25));
    return posMod(d0 + this.wobble.rotation, 1);
  }
}

let viewer: { player: Player; spawn: readonly [number, number, number] } | null = null;

/** the player the needles are read for, and the world spawn the compass points to (the game sets it every frame) */
export function setDialViewer(player: Player, spawn: readonly [number, number, number]): void {
  viewer = { player, spawn };
}

// vanilla ItemProperties: the compass points to its lodestone if it was used on one (nowhere once that's known to be
// gone, and nowhere outside the lodestone's dimension: game/lodestoneCompass.ts), else to the world spawn in a natural
// dimension; the recovery compass to where its holder last died
const COMPASS = new CompassAngle((p, s) => {
  const t = s.tag?.lodestoneTracker;
  if (t) return t.target ?? null;
  return p.level.dim.natural && viewer ? { dim: p.level.dim.id, pos: viewer.spawn } : null;
});
const RECOVERY = new CompassAngle((p) => p.lastDeathLocation);

// the clock's "time": the sun's angle in a natural dimension, spinning anywhere else (its wobble damps less)
const CLOCK = new Wobble(0.9);
function clockTime(p: Player): number {
  const tick = p.level.gameTime;
  const t = p.level.dim.natural ? timeOfDay(p.level.skyTime()) : Math.random();
  if (CLOCK.shouldUpdate(tick)) CLOCK.update(tick, t);
  return CLOCK.rotation;
}

const frame = (prefix: string, a: number, n: number): string => `${prefix}_${String(Math.round(a * n) % n).padStart(2, '0')}`;

/** the sprite a compass, recovery compass or clock stack shows now (undefined: any other item, or no viewer yet) */
export function dialTexture(stack: ItemStack, seed = 0): string | undefined {
  const id = stack.item.id;
  if (!viewer || (id !== 'compass' && id !== 'recovery_compass' && id !== 'clock')) return undefined;
  const p = viewer.player;
  if (id === 'clock') return frame('clock', clockTime(p), 64);
  return frame(id, (id === 'compass' ? COMPASS : RECOVERY).angle(p, stack, seed), 32);
}
