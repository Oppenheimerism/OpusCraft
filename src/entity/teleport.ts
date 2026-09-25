// Teleporting down to solid ground (vanilla LivingEntity.randomTeleport), as chorus fruit does to whoever eats it,
// with the trail of portal particles vanilla's entity event 46 leaves.

import { BLOCKS, STATE_BLOCK, COLLISION } from '../world/block';
import type { Entity } from './entity';

/** blocks vanilla builds with forceSolidOff: never "solid", whatever their shape */
const NOT_SOLID = new Set(['chorus_plant', 'chorus_flower', 'end_rod', 'cobweb', 'bamboo_sapling']);

/**
 * vanilla BlockState.blocksMotion (legacySolid, BlockBehaviour.calculateSolid): it has a shape to collide with that's
 * a full block high, or bulky enough on average across (not a cobweb or a bamboo shoot)
 */
export function blocksMotion(st: number): boolean {
  const boxes = COLLISION[st];
  if (!boxes || !boxes.length || NOT_SOLID.has(BLOCKS[STATE_BLOCK[st]].name)) return false;
  let x0 = 1, y0 = 1, z0 = 1, x1 = 0, y1 = 0, z1 = 0;
  for (const b of boxes) {
    x0 = Math.min(x0, b[0]);
    y0 = Math.min(y0, b[1]);
    z0 = Math.min(z0, b[2]);
    x1 = Math.max(x1, b[3]);
    y1 = Math.max(y1, b[4]);
    z1 = Math.max(z1, b[5]);
  }
  return (x1 - x0 + (y1 - y0) + (z1 - z0)) / 3 >= 0.7291666666666666 || y1 - y0 >= 1;
}

/**
 * vanilla LivingEntity.randomTeleport: from (x, y, z) down to the first block that stops movement, in a loaded
 * chunk; the entity goes there if it fits clear of blocks, solid entities and liquid, else it stays where it was.
 * `broadcast`: the portal particles (vanilla entity event 46).
 */
export function randomTeleport(e: Entity, x: number, y: number, z: number, broadcast: boolean): boolean {
  const w = e.level.world;
  const ox = e.x, oy = e.y, oz = e.z;
  const bx = Math.floor(x), bz = Math.floor(z);
  let by = Math.floor(y), ty = y;
  let ok = false;
  if (w.isLoaded(bx, bz)) {
    let found = false;
    while (!found && by > w.dim.minY) {
      if (blocksMotion(w.getState(bx, by - 1, bz))) found = true;
      else {
        ty--;
        by--;
      }
    }
    if (found) {
      e.setPos(x, ty, z);
      if (e.isFree(e.bb)) ok = true;
    }
  }
  if (!ok) {
    e.setPos(ox, oy, oz);
    return false;
  }
  if (broadcast) teleportParticles(e, ox, oy, oz);
  (e as Entity & { navigation?: { stop(): void } }).navigation?.stop();
  return true;
}

/**
 * vanilla LivingEntity.handleEntityEvent(46): 128 portal particles from where it was to where it is, in and about
 * its body (the player has already been put where it is, so its own land round it)
 */
export function teleportParticles(e: Entity, fromX: number, fromY: number, fromZ: number): void {
  const spawn = e.level.particles.spawn;
  if (!spawn) return;
  for (let j = 0; j < 128; j++) {
    const d = j / 127;
    const f = (Math.random() - 0.5) * 0.2, f1 = (Math.random() - 0.5) * 0.2, f2 = (Math.random() - 0.5) * 0.2;
    const px = fromX + (e.x - fromX) * d + (Math.random() - 0.5) * e.width * 2;
    const py = fromY + (e.y - fromY) * d + Math.random() * e.height;
    const pz = fromZ + (e.z - fromZ) * d + (Math.random() - 0.5) * e.width * 2;
    spawn.call(e.level.particles, 'portal', px, py, pz, f, f1, f2);
  }
}
