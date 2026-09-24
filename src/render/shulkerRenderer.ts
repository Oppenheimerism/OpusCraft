// The shulker's shell as it's drawn (vanilla ShulkerModel): a shulker box in the world (vanilla ShulkerBoxRenderer:
// the lid rising half a block and turning three quarters round as it opens). Drawn with the entity batch after the
// entities, like the other block entity renderers.

import type { GL } from './gl';
import { createTexture } from './gl';
import { EntityBatch, PoseStack, type DrawState } from './entityRenderer';
import { ModelPart } from './model';
import type { Camera } from './renderer';
import type { Frustum } from '../core/math';
import type { Level } from '../game/level';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { ShulkerBoxBlockEntity } from '../world/shulkerBoxEntity';
import { shulkerBoxColor } from '../world/blocksShulker';
import { shulkerTexture, SHULKER_TEX_W, SHULKER_TEX_H } from '../textures/shulker';

/** vanilla BlockEntityRenderer.getViewDistance */
const VIEW_DISTANCE = 64;

export interface ShulkerModel {
  root: ModelPart;
  lid: ModelPart;
  base: ModelPart;
  head: ModelPart;
}

/** vanilla ShulkerModel.createBodyLayer (64x64): the lid over the base, both at the model's foot, and the head inside */
export function shulkerModel(): ShulkerModel {
  const root = new ModelPart();
  const lid = root.add('lid', new ModelPart([{ x: -8, y: -16, z: -8, w: 16, h: 12, d: 16, u: 0, v: 0 }], [0, 24, 0]));
  const base = root.add('base', new ModelPart([{ x: -8, y: -8, z: -8, w: 16, h: 8, d: 16, u: 0, v: 28 }], [0, 24, 0]));
  const head = root.add('head', new ModelPart([{ x: -3, y: 0, z: -3, w: 6, h: 6, d: 6, u: 0, v: 52 }], [0, 12, 0]));
  return { root, lid, base, head };
}

/** vanilla Direction.getRotation: the model (standing up) turned to face each way */
export function rotateToFacing(pose: PoseStack, facing: string): void {
  switch (facing) {
    case 'down':
      pose.rotX(180);
      break;
    case 'north':
      pose.rotX(90);
      pose.rotZ(180);
      break;
    case 'south':
      pose.rotX(90);
      break;
    case 'west':
      pose.rotX(90);
      pose.rotZ(90);
      break;
    case 'east':
      pose.rotX(90);
      pose.rotZ(-90);
      break;
  }
}

export class ShulkerRenderers {
  private readonly pose = new PoseStack();
  /** vanilla ModelLayers.SHULKER_BOX: the shell without the head */
  private readonly box = shulkerModel();
  private readonly textures = new Map<string, WebGLTexture>();

  constructor(private readonly gl: GL) {
    this.box.head.visible = false;
  }

  /** vanilla Sheets.SHULKER_TEXTURE_LOCATION (entity/shulker/shulker_<colour>, or plain shulker) */
  texture(color: string | null): WebGLTexture {
    const key = color ?? '';
    let t = this.textures.get(key);
    if (!t) {
      const img = shulkerTexture(color);
      t = createTexture(this.gl, img.w, img.h, new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength));
      this.textures.set(key, t);
    }
    return t;
  }

  /** vanilla RenderType.entityCutoutNoCull */
  private state(tex: WebGLTexture): DrawState {
    return { texture: tex, cutoff: 0.1, blend: false, cull: false, lit: true, useLightmap: true };
  }

  /** every shulker box in view */
  renderBlockEntities(b: EntityBatch, level: Level, cam: Camera, partial: number, frustum: Frustum): void {
    for (const be of level.world.blockEntities.values()) {
      if (!(be instanceof ShulkerBoxBlockEntity) || be.removed) continue;
      const dx = be.x - cam.x, dy = be.y - cam.y, dz = be.z - cam.z;
      if ((dx + 0.5) ** 2 + (dy + 0.5) ** 2 + (dz + 0.5) ** 2 > VIEW_DISTANCE * VIEW_DISTANCE) continue;
      if (!frustum.testBox(dx - 0.5, dy - 0.5, dz - 0.5, dx + 1.5, dy + 1.5, dz + 1.5)) continue;
      const st = level.getState(be.x, be.y, be.z);
      const block = BLOCKS[STATE_BLOCK[st]];
      const color = shulkerBoxColor(block.name);
      if (color === undefined) continue;
      const l = level.world.getLight(be.x, be.y, be.z);
      b.lightS = (l >> 4) * 16;
      b.lightB = (l & 15) * 16;
      b.setOverlay(0, 0, 0, 0);
      b.begin(this.state(this.texture(color)));
      this.renderBox(b, block.get<string>(st, 'facing'), be.getProgress(partial), dx, dy, dz);
    }
  }

  /** vanilla ShulkerBoxRenderer.render: the shell turned to its facing, the lid up and round by `progress` */
  private renderBox(b: EntityBatch, facing: string, progress: number, dx: number, dy: number, dz: number): void {
    const pose = this.pose, m = this.box;
    pose.reset();
    pose.translate(dx + 0.5, dy + 0.5, dz + 0.5);
    pose.scale(0.9995, 0.9995, 0.9995);
    rotateToFacing(pose, facing);
    pose.scale(1, -1, -1);
    pose.translate(0, -1, 0);
    // vanilla ShulkerBoxModel.animate
    m.lid.y = 24 - progress * 0.5 * 16;
    m.lid.yRot = ((270 * progress) * Math.PI) / 180;
    m.root.render(b, pose, SHULKER_TEX_W, SHULKER_TEX_H);
  }
}
