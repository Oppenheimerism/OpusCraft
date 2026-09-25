// (trial chambers) Block entity and entity renderers of the trial chambers, drawn with the entity batch after the
// entities like the spawner's mob: vanilla TrialSpawnerRenderer (the mob it will spawn, spinning in its cage as the
// monster spawner's does, while its state spins one), VaultRenderer (one of the things a vault may give, turning in
// its cage while it's waiting on someone) and OminousItemSpawnerRenderer (what an ominous item spawner holds, growing
// in over its first 2.5 seconds and spinning fast, lit full).

import type { EntityBatch } from './entityRenderer';
import { PoseStack } from './entityRenderer';
import type { ItemRenderer } from './itemRenderer';
import type { Camera } from './renderer';
import type { Frustum } from '../core/math';
import type { Level } from '../game/level';
import type { Mob } from '../entity/mob';
import type { ItemStack } from '../item/item';
import { TrialSpawnerBlockEntity } from '../game/trialSpawner';
import { VaultBlockEntity } from '../game/vault';
import type { OminousItemSpawner } from '../entity/ominousItemSpawner';

/** vanilla BlockEntityRenderer.getViewDistance */
const VIEW_DISTANCE = 64;

/** vanilla Mth.rotLerp */
function rotLerp(p: number, a: number, b: number): number {
  let d = (b - a) % 360;
  if (d >= 180) d -= 360;
  if (d < -180) d += 360;
  return a + p * d;
}

/** vanilla Mth.wrapDegrees */
function wrapDegrees(a: number): number {
  let f = a % 360;
  if (f >= 180) f -= 360;
  if (f < -180) f += 360;
  return f;
}

/** draws a mob with this pose as its base (the dispatcher's living renderer: SpawnerRenderer.renderEntityInSpawner) */
export type DrawMobInCage = (mob: Mob, base: Float32Array) => void;

export class TrialChamberRenderers {
  private readonly pose = new PoseStack();

  render(b: EntityBatch, items: ItemRenderer, level: Level, cam: Camera, partial: number, frustum: Frustum, drawMob: DrawMobInCage): void {
    for (const be of level.world.blockEntities.values()) {
      const spawner = be instanceof TrialSpawnerBlockEntity;
      if (be.removed || !(spawner || be instanceof VaultBlockEntity)) continue;
      const dx = be.x - cam.x, dy = be.y - cam.y, dz = be.z - cam.z;
      if ((dx + 0.5) ** 2 + (dy + 0.5) ** 2 + (dz + 0.5) ** 2 > VIEW_DISTANCE * VIEW_DISTANCE) continue;
      if (!frustum.testBox(dx - 0.5, dy, dz - 0.5, dx + 1.5, dy + 1.5, dz + 1.5)) continue;
      const l = level.world.getLight(be.x, be.y, be.z);
      b.lightS = (l >> 4) * 16;
      b.lightB = (l & 15) * 16;
      b.setOverlay(0, 0, 0, 0);
      if (be instanceof TrialSpawnerBlockEntity) this.renderTrialSpawner(level, be, dx, dy, dz, partial, drawMob);
      else if (be instanceof VaultBlockEntity) this.renderVault(b, items, be, dx, dy, dz, partial);
    }
  }

  /**
   * vanilla TrialSpawnerRenderer: its display mob (TrialSpawnerData.getOrCreateDisplayEntity, none unless its state
   * spins one and spawning's allowed) in SpawnerRenderer.renderEntityInSpawner's pose
   */
  private renderTrialSpawner(level: Level, be: TrialSpawnerBlockEntity, dx: number, dy: number, dz: number, partial: number, drawMob: DrawMobInCage): void {
    const mob = be.getOrCreateDisplayEntity(level, be.state(level));
    if (!mob) return;
    let f = 0.53125;
    const size = Math.max(mob.width, mob.height);
    if (size > 1) f /= size;
    const ps = this.pose;
    ps.reset();
    ps.translate(dx + 0.5, dy + 0.4, dz + 0.5);
    ps.rotY((be.oSpin + (be.spin - be.oSpin) * partial) * 10);
    ps.translate(0, -0.2, 0);
    ps.rotX(-30);
    ps.scale(f, f, f);
    drawMob(mob, ps.m);
  }

  /** vanilla VaultRenderer: while it's waiting on someone (shouldDisplayActiveEffects), its display item turning inside */
  private renderVault(b: EntityBatch, items: ItemRenderer, be: VaultBlockEntity, dx: number, dy: number, dz: number, partial: number): void {
    const s = be.displayItem;
    if (!s || s.count <= 0 || be.connectedPlayers.size === 0) return;
    // vanilla renderItemInside
    const ps = this.pose;
    ps.reset();
    ps.translate(dx + 0.5, dy + 0.4, dz + 0.5);
    ps.rotY(rotLerp(partial, be.oSpin, be.spin));
    this.renderMultipleFromCount(b, items, ps, s);
  }

  /**
   * vanilla OminousItemSpawnerRenderer: its item growing to full size over its first 50 ticks and turning 40 degrees a
   * tick with the level's clock, lit full
   */
  renderItemSpawner(b: EntityBatch, items: ItemRenderer, level: Level, e: OminousItemSpawner, dx: number, dy: number, dz: number, partial: number): void {
    const s = e.item;
    if (!s || s.count <= 0) return;
    b.lightS = 240;
    b.lightB = 240;
    b.setOverlay(0, 0, 0, 0);
    const ps = this.pose;
    ps.reset();
    ps.translate(dx, dy, dz);
    if (e.tickCount <= 50) {
      const f = Math.min(e.tickCount + partial, 50) / 50;
      ps.scale(f, f, f);
    }
    const g = wrapDegrees(level.gameTime - 1) * 40, h = wrapDegrees(level.gameTime) * 40;
    ps.rotY(rotLerp(partial, g, h));
    this.renderMultipleFromCount(b, items, ps, s);
  }

  /** vanilla ItemEntityRenderer.renderMultipleFromCount: one to five copies by the count, as a dropped stack is drawn */
  private renderMultipleFromCount(b: EntityBatch, items: ItemRenderer, ps: PoseStack, s: ItemStack): void {
    const c = s.count;
    const copies = c > 48 ? 5 : c > 32 ? 4 : c > 16 ? 3 : c > 1 ? 2 : 1;
    const block3d = items.isBlockModel(s.item);
    // (the same scatter each frame: seeded by the item, as vanilla's getSeedForItemStack)
    let seed = s.item.id.length * 31 + 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < copies; i++) {
      ps.push();
      if (i > 0) {
        if (block3d) ps.translate((rnd() * 2 - 1) * 0.15, (rnd() * 2 - 1) * 0.15, (rnd() * 2 - 1) * 0.15);
        else ps.translate((rnd() * 2 - 1) * 0.15 * 0.5, (rnd() * 2 - 1) * 0.15 * 0.5, 0);
      }
      items.render(b, ps, s, 'ground');
      ps.pop();
      if (!block3d) ps.translate(0, 0, 0.09375);
    }
  }
}
