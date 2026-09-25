// (trial chambers) vanilla Level.clip with ClipContext.Block.VISUAL and Fluid.NONE: a segment stopped by the blocks'
// visual shapes, which are their collision shapes except where vanilla leaves them empty (getVisualShape): glass,
// stained and tinted glass (TransparentBlock), the copper grates (WaterloggedTransparentBlock), glass panes and iron
// bars (IronBarsBlock) and powder snow. The trial spawner sees players and its mobs through these, and an ominous
// item spawner hangs under the first thing over a player's head that isn't one of them.

import { BLOCKS, STATE_BLOCK, COLLISION } from '../world/block';
import type { World } from '../world/world';
import { AABB } from '../core/aabb';

export interface VisualHit {
  x: number;
  y: number;
  z: number;
  /** fraction along the segment */
  t: number;
}

/** the blocks whose visual shape is empty (by block id), found once the blocks are registered */
let SEE_THROUGH: Uint8Array | null = null;

/** vanilla getVisualShape returning Shapes.empty() */
export function isSeeThrough(state: number): boolean {
  if (!SEE_THROUGH) {
    SEE_THROUGH = new Uint8Array(BLOCKS.length);
    BLOCKS.forEach((b, i) => {
      if (/glass/.test(b.name) || /_grate$/.test(b.name) || b.name === 'iron_bars' || b.name === 'powder_snow') SEE_THROUGH![i] = 1;
    });
  }
  return SEE_THROUGH[STATE_BLOCK[state]] === 1;
}

/** the first block the segment (x0,y0,z0)→(x1,y1,z1) runs into, by visual shape; null if it gets through */
export function clipVisual(world: World, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): VisualHit | null {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  if (dx * dx + dy * dy + dz * dz < 1e-7) return null;
  let x = Math.floor(x0), y = Math.floor(y0), z = Math.floor(z0);
  const ex = Math.floor(x1), ey = Math.floor(y1), ez = Math.floor(z1);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDX = dx !== 0 ? Math.abs(1 / dx) : Infinity, tDY = dy !== 0 ? Math.abs(1 / dy) : Infinity, tDZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMX = dx !== 0 ? (dx > 0 ? x + 1 - x0 : x0 - x) * tDX : Infinity;
  let tMY = dy !== 0 ? (dy > 0 ? y + 1 - y0 : y0 - y) * tDY : Infinity;
  let tMZ = dz !== 0 ? (dz > 0 ? z + 1 - z0 : z0 - z) * tDZ : Infinity;
  for (let i = 0; i < 1024; i++) {
    const st = world.getState(x, y, z);
    const boxes = COLLISION[st];
    if (boxes && boxes.length && !isSeeThrough(st)) {
      let best = Infinity;
      for (const b of boxes) {
        const h = new AABB(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]).clip(x0, y0, z0, x1, y1, z1);
        if (h && h.t < best) best = h.t;
      }
      // (a box the segment starts inside of stops it where it starts)
      if (best === Infinity) for (const b of boxes) if (x0 > x + b[0] && x0 < x + b[3] && y0 > y + b[1] && y0 < y + b[4] && z0 > z + b[2] && z0 < z + b[5]) best = 0;
      if (best !== Infinity) return { x, y, z, t: best };
    }
    if (x === ex && y === ey && z === ez) return null;
    if (tMX < tMY) {
      if (tMX < tMZ) {
        if (tMX > 1) return null;
        x += stepX;
        tMX += tDX;
      } else {
        if (tMZ > 1) return null;
        z += stepZ;
        tMZ += tDZ;
      }
    } else if (tMY < tMZ) {
      if (tMY > 1) return null;
      y += stepY;
      tMY += tDY;
    } else {
      if (tMZ > 1) return null;
      z += stepZ;
      tMZ += tDZ;
    }
  }
  return null;
}
