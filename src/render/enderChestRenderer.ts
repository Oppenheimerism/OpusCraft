// The ender chest as it's drawn (vanilla ChestRenderer with the ender chest's material): ChestModel's body, lid and
// lock, upright and turned to face the way the block does, the lid swinging up about its back edge as it opens — eased
// as vanilla eases it (1 - (1 - f)^3 of the way) — and drawn in the block's own light, like the other block entity
// renderers after the entities.

import type { GL } from './gl';
import { createTexture } from './gl';
import { PoseStack, type EntityBatch, type DrawState } from './entityRenderer';
import { ModelPart } from './model';
import type { Camera } from './renderer';
import type { Frustum } from '../core/math';
import type { Level } from '../game/level';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { EnderChestBlockEntity } from '../world/enderChestBlockEntity';
import { enderChestTexture, ENDER_CHEST_TEX_W, ENDER_CHEST_TEX_H } from '../textures/enderChest';

/** vanilla BlockEntityRenderer.getViewDistance */
const VIEW_DISTANCE = 64;

/** vanilla Direction.toYRot */
const Y_ROT: Record<string, number> = { south: 0, west: 90, north: 180, east: 270 };

export interface ChestModel {
  root: ModelPart;
  bottom: ModelPart;
  lid: ModelPart;
  lock: ModelPart;
}

/** vanilla ChestModel.createSingleBodyLayer (64x64): the body, and the lid and lock hinged at its back edge */
export function chestModel(): ChestModel {
  const root = new ModelPart();
  const bottom = root.add('bottom', new ModelPart([{ x: 1, y: 0, z: 1, w: 14, h: 10, d: 14, u: 0, v: 19 }]));
  const lid = root.add('lid', new ModelPart([{ x: 1, y: 0, z: 0, w: 14, h: 5, d: 14, u: 0, v: 0 }], [0, 9, 1]));
  const lock = root.add('lock', new ModelPart([{ x: 7, y: -2, z: 14, w: 2, h: 4, d: 1, u: 0, v: 0 }], [0, 9, 1]));
  return { root, bottom, lid, lock };
}

/** vanilla ChestRenderer's lid angle: how far open (0..1) eased, as a turn about X (the lid's back edge) */
export function lidAngle(openness: number): number {
  const g = 1 - openness;
  return -((1 - g * g * g) * Math.PI) / 2;
}

export class EnderChestRenderer {
  private readonly pose = new PoseStack();
  private readonly model = chestModel();
  private tex: WebGLTexture | null = null;

  constructor(private readonly gl: GL) {}

  private texture(): WebGLTexture {
    if (!this.tex) {
      const img = enderChestTexture();
      this.tex = createTexture(this.gl, img.w, img.h, new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength));
    }
    return this.tex;
  }

  /** vanilla RenderType.entityCutout */
  private state(): DrawState {
    return { texture: this.texture(), cutoff: 0.1, blend: false, cull: true, lit: true, useLightmap: true };
  }

  /** every ender chest near enough and in view */
  renderBlockEntities(b: EntityBatch, level: Level, cam: Camera, partial: number, frustum: Frustum): void {
    const pose = this.pose, m = this.model;
    for (const be of level.world.blockEntities.values()) {
      if (!(be instanceof EnderChestBlockEntity) || be.removed) continue;
      const dx = be.x - cam.x, dy = be.y - cam.y, dz = be.z - cam.z;
      if ((dx + 0.5) ** 2 + (dy + 0.5) ** 2 + (dz + 0.5) ** 2 > VIEW_DISTANCE * VIEW_DISTANCE) continue;
      if (!frustum.testBox(dx, dy, dz, dx + 1, dy + 1, dz + 1)) continue;
      const st = level.getState(be.x, be.y, be.z);
      const block = BLOCKS[STATE_BLOCK[st]];
      if (block.name !== 'ender_chest') continue;
      const l = level.world.getLight(be.x, be.y, be.z);
      b.lightS = (l >> 4) * 16;
      b.lightB = (l & 15) * 16;
      b.setOverlay(0, 0, 0, 0);
      b.begin(this.state());
      pose.reset();
      pose.translate(dx, dy, dz);
      pose.translate(0.5, 0.5, 0.5);
      pose.rotY(-(Y_ROT[block.get<string>(st, 'facing')] ?? 0));
      pose.translate(-0.5, -0.5, -0.5);
      m.lid.xRot = m.lock.xRot = lidAngle(be.openness(level.gameTime + partial));
      m.root.render(b, pose, ENDER_CHEST_TEX_W, ENDER_CHEST_TEX_H);
    }
  }
}
