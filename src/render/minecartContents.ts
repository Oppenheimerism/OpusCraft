// (minecarts) The block a minecart carries, as drawn (vanilla MinecartRenderer.renderMinecartContents and
// TntMinecartRenderer's): the block as it is (a chest, a hopper, a furnace lit or not); a lit TNT minecart's TNT
// flashes white every quarter second and, in its last half second, swells up to 1.3 times its size (from its corner,
// as vanilla scales it).

import type { EntityBatch, PoseStack } from './entityRenderer';
import type { ItemRenderer } from './itemRenderer';
import type { AbstractMinecart } from '../entity/minecart';
import { MinecartTNT } from '../entity/minecartVariants';

export function renderMinecartContents(b: EntityBatch, pose: PoseStack, items: ItemRenderer, e: AbstractMinecart, state: number, p: number): void {
  if (!(e instanceof MinecartTNT) || e.fuse < 0) {
    items.renderBlockState(b, pose, state);
    return;
  }
  const i = e.fuse;
  if (i - p + 1 < 10) {
    let f = 1 - (i - p + 1) / 10;
    f = Math.max(0, Math.min(1, f));
    f *= f;
    f *= f;
    const s = 1 + f * 0.3;
    pose.scale(s, s, s);
  }
  if (Math.floor(i / 5) % 2 === 0) b.setOverlay(1, 1, 1, 0.75);
  items.renderBlockState(b, pose, state);
  b.setOverlay(0, 0, 0, 0);
}
