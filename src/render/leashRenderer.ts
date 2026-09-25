// Leads as the game draws them. vanilla MobRenderer.renderLeash: from where the mob's end ties on (turned with its
// body) to where the holder holds it, 24 segments sagging in a curve, as two thin ribbons crossed along it; brown,
// every other segment darker, lit by a lerp from the light at the mob to the light at the holder. vanilla
// LeashKnotRenderer: the knot round a fence post, a 6x8x6 box.

import type { EntityBatch, PoseStack, DrawState } from './entityRenderer';
import { ModelPart } from './model';
import type { Entity } from '../entity/entity';
import type { Mob } from '../entity/mob';
import '../textures/leash';

/** vanilla LeashKnotModel (32x32) */
const KNOT = new ModelPart([{ x: -3, y: -8, z: -3, w: 6, h: 8, d: 6, u: 0, v: 0 }]);

/** vanilla LeashKnotRenderer: at camera-relative (dx, dy, dz), the batch's light already the knot's */
export function renderKnot(b: EntityBatch, pose: PoseStack, state: DrawState, dx: number, dy: number, dz: number): void {
  b.setOverlay(0, 0, 0, 0);
  b.begin(state);
  pose.reset();
  pose.translate(dx, dy, dz);
  pose.scale(-1, -1, 1);
  KNOT.render(b, pose, 32, 32);
}

/** the light at a block, packed as the world keeps it (sky << 4 | block) */
export type LightAt = (x: number, y: number, z: number) => number;

const SEGMENTS = 24;
const px = new Float32Array((SEGMENTS + 1) * 6);
const pc = new Float32Array(SEGMENTS + 1);
const pl = new Float32Array((SEGMENTS + 1) * 2);

/**
 * vanilla MobRenderer.renderLeash (with addVertexPair): `white` is an untextured, unlit, lightmapped state; (cx, cy, cz)
 * the camera
 */
export function renderLeash(b: EntityBatch, white: DrawState, mob: Mob, holder: Entity, cx: number, cy: number, cz: number, p: number, light: LightAt): void {
  const [hx, hy, hz] = holder.ropeHoldPosition(p);
  // vanilla getPreciseBodyRotation (a plain lerp) and getLeashOffset, turned with the body
  const d0 = ((mob.bodyYawO + (mob.bodyYaw - mob.bodyYawO) * p) * Math.PI) / 180 + Math.PI / 2;
  const [ox, oy, oz] = mob.leashOffset();
  const d1 = Math.cos(d0) * oz + Math.sin(d0) * ox;
  const d2 = Math.sin(d0) * oz - Math.cos(d0) * ox;
  const sx = mob.lerpX(p) + d1, sy = mob.lerpY(p) + oy, sz = mob.lerpZ(p) + d2;
  const f = hx - sx, f1 = hy - sy, f2 = hz - sz;
  const h = Math.sqrt(f * f + f2 * f2);
  // (straight up or down there's no across: nothing to draw)
  if (h < 1e-6) return;
  const f4 = (0.025 / 2) / h;
  const f5 = f2 * f4, f6 = f * f4;
  // the light at each end: where the mob's eyes are, and where the holder's are
  const lm = light(Math.floor(mob.lerpX(p)), Math.floor(mob.lerpY(p) + mob.eyeHeight), Math.floor(mob.lerpZ(p)));
  const lh = light(Math.floor(holder.lerpX(p)), Math.floor(holder.lerpY(p) + holder.eyeHeight), Math.floor(holder.lerpZ(p)));
  const bm = lm & 15, bh = lh & 15, sm = lm >> 4, sh = lh >> 4;
  const ox0 = sx - cx, oy0 = sy - cy, oz0 = sz - cz;
  b.setOverlay(0, 0, 0, 0);
  b.begin(white);
  for (const reverse of [false, true]) {
    const dy = reverse ? 0 : 0.025;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      // (vanilla: the light lerped in whole levels)
      pl[i * 2] = Math.trunc(bm + (bh - bm) * t) * 16;
      pl[i * 2 + 1] = Math.trunc(sm + (sh - sm) * t) * 16;
      pc[i] = i % 2 === (reverse ? 1 : 0) ? 0.7 : 1;
      const x = f * t, z = f2 * t;
      // (it sags: a parabola from the lower end)
      const y = f1 > 0 ? f1 * t * t : f1 - f1 * (1 - t) * (1 - t);
      const o = i * 6;
      px[o] = ox0 + x - f5;
      px[o + 1] = oy0 + y + dy;
      px[o + 2] = oz0 + z + f6;
      px[o + 3] = ox0 + x + f5;
      px[o + 4] = oy0 + y + 0.025 - dy;
      px[o + 5] = oz0 + z - f6;
    }
    // (vanilla's triangle strip, as two triangles a segment)
    const vert = (i: number, k: number) => {
      const c = pc[i], o = i * 6 + k * 3;
      b.lightB = pl[i * 2];
      b.lightS = pl[i * 2 + 1];
      b.vertexRaw(px[o], px[o + 1], px[o + 2], 0, 0, 0.5 * c, 0.4 * c, 0.3 * c, 1, 0, 1, 0);
    };
    for (let i = 0; i < SEGMENTS; i++) {
      vert(i, 0);
      vert(i, 1);
      vert(i + 1, 0);
      vert(i, 1);
      vert(i + 1, 1);
      vert(i + 1, 0);
    }
  }
}
