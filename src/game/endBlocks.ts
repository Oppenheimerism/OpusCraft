// The dragon egg (vanilla DragonEggBlock): the trophy the first dragon leaves on top of the exit portal. It falls
// like sand does (level.ts counts it among the gravity blocks: it goes five ticks after a change, where sand waits
// two), sifting black dust when there's nothing under it, and it won't be broken by hand in survival: a click or
// the first blow and it jumps to an empty spot up to 15 blocks across and 7 up or down.
//
// Vanilla runs the jump twice: the server moves the egg and the client, on its own dice, picks a spot of its own
// and draws the trail of portal particles between it and the egg. The trail usually points somewhere the egg
// didn't go, and so it does here. There's no sound to it.

import { FLAGS, F_AIR, F_REPLACEABLE, F_WATER, F_LAVA, BLOCKS, STATE_BLOCK } from '../world/block';
import { Rand } from '../core/rng';
import { registerBehavior } from './blockBehavior';
import type { Level } from './level';

/** vanilla Block.UPDATE_CLIENTS: the egg lands in its new spot without telling the neighbours */
const UPDATE_CLIENTS = 2;
/** the client's own dice (vanilla ClientLevel.random) */
const CLIENT = new Rand();

/** vanilla FallingBlock.isFree: air, fire, a liquid or something replaceable */
function isFree(st: number): boolean {
  return (FLAGS[st] & (F_AIR | F_REPLACEABLE | F_WATER | F_LAVA)) !== 0 || BLOCKS[STATE_BLOCK[st]].name === 'fire';
}

/** vanilla getBlockState(pos).isAir(), where the chunk is there to look at */
function isAir(level: Level, x: number, y: number, z: number): boolean {
  return level.world.isLoaded(x, z) && (FLAGS[level.world.getState(x, y, z)] & F_AIR) !== 0;
}

/**
 * vanilla DragonEggBlock.teleport: a thousand tries at a spot nextInt(16) - nextInt(16) across, nextInt(8) -
 * nextInt(8) up and down; the first one that's air gets the egg (set without telling the neighbours), and the egg's
 * old place is emptied
 */
function teleport(level: Level, x: number, y: number, z: number, st: number): void {
  trail(level, x, y, z);
  const r = level.random;
  for (let i = 0; i < 1000; i++) {
    const tx = x + r.nextInt(16) - r.nextInt(16), ty = y + r.nextInt(8) - r.nextInt(8), tz = z + r.nextInt(16) - r.nextInt(16);
    if (!isAir(level, tx, ty, tz)) continue;
    level.setBlock(tx, ty, tz, st, UPDATE_CLIENTS);
    // (vanilla removeBlock(pos, false): an ordinary update, so whatever the egg stood on or propped up hears it)
    level.setBlock(x, y, z, 0);
    return;
  }
}

/** the client's half of the jump: 128 portal particles strung between the egg and a spot it rolls for itself */
function trail(level: Level, x: number, y: number, z: number): void {
  const r = CLIENT;
  for (let i = 0; i < 1000; i++) {
    const tx = x + r.nextInt(16) - r.nextInt(16), ty = y + r.nextInt(8) - r.nextInt(8), tz = z + r.nextInt(16) - r.nextInt(16);
    if (!isAir(level, tx, ty, tz)) continue;
    for (let j = 0; j < 128; j++) {
      const d = r.nextDouble();
      const fx = (r.nextFloat() - 0.5) * 0.2, fy = (r.nextFloat() - 0.5) * 0.2, fz = (r.nextFloat() - 0.5) * 0.2;
      const px = tx + (x - tx) * d + r.nextDouble() - 0.5 + 0.5;
      const py = ty + (y - ty) * d + r.nextDouble() - 0.5;
      const pz = tz + (z - tz) * d + r.nextDouble() - 0.5 + 0.5;
      level.particles.spawn?.('portal', px, py, pz, fx, fy, fz);
    }
    return;
  }
}

registerBehavior('dragon_egg', {
  /** vanilla useWithoutItem: it jumps (and the hand swings) */
  use(level, x, y, z, st) {
    teleport(level, x, y, z, st);
    return true;
  },
  /** vanilla attack: the first blow in survival sends it off before it takes any damage */
  attack(level, x, y, z, st) {
    teleport(level, x, y, z, st);
  },
  /** vanilla FallingBlock.animateTick: now and then a speck of dust (the egg's is black) under it when it could fall */
  animateTick(level, x, y, z) {
    if (Math.floor(Math.random() * 16) !== 0) return;
    if (isFree(level.world.getState(x, y - 1, z))) level.particles.fallingDust?.(x + Math.random(), y - 0.05, z + Math.random(), 0x000000);
  },
});
