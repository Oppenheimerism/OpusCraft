// The shulker's shell as it's drawn (vanilla ShulkerModel): a shulker box in the world (vanilla ShulkerBoxRenderer:
// the lid rising half a block and turning three quarters round as it opens), drawn with the entity batch after the
// entities like the other block entity renderers; the shulker itself (vanilla ShulkerRenderer: the shell turned to
// the face it clings to, the lid lifting a block and twisting right round as it opens, the head turning inside, and
// gliding in over 6 ticks after a teleport); and its bullet (vanilla ShulkerBulletRenderer: the spark tumbling, in a
// faint glow half again its size).

import type { GL } from './gl';
import { createTexture } from './gl';
import { EntityBatch, PoseStack, type DrawState } from './entityRenderer';
import { ModelPart } from './model';
import type { Camera } from './renderer';
import type { Frustum } from '../core/math';
import type { Level } from '../game/level';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { DIR_NAMES, OPPOSITE } from '../world/dir';
import { ShulkerBoxBlockEntity } from '../world/shulkerBoxEntity';
import { shulkerBoxColor } from '../world/blocksShulker';
import type { Shulker } from '../entity/shulker';
import type { ShulkerBullet } from '../entity/shulkerBullet';
import { shulkerTexture, sparkTexture, SHULKER_TEX_W, SHULKER_TEX_H } from '../textures/shulker';

const DEG = Math.PI / 180;

/** vanilla Mth.rotLerp */
function rotLerp(p: number, a: number, b: number): number {
  let d = b - a;
  while (d < -180) d += 360;
  while (d >= 180) d -= 360;
  return a + p * d;
}

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

/** vanilla ShulkerBulletModel.createBodyLayer (64x32): three plates crossed at the middle */
function bulletModel(): ModelPart {
  return new ModelPart([
    { x: -4, y: -4, z: -1, w: 8, h: 8, d: 2, u: 0, v: 0 },
    { x: -1, y: -4, z: -4, w: 2, h: 8, d: 8, u: 0, v: 10 },
    { x: -4, y: -1, z: -4, w: 8, h: 2, d: 8, u: 20, v: 0 },
  ]);
}

export class ShulkerRenderers {
  private readonly pose = new PoseStack();
  /** vanilla ModelLayers.SHULKER_BOX: the shell without the head */
  private readonly box = shulkerModel();
  /** vanilla ModelLayers.SHULKER */
  private readonly mob = shulkerModel();
  private readonly bullet = bulletModel();
  private readonly textures = new Map<string, WebGLTexture>();
  private sparkTex: WebGLTexture | null = null;

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

  /**
   * vanilla ShulkerRenderer (a LivingEntityRenderer): at camera-relative (dx, dy, dz), the batch's light already the
   * shulker's. Its shell never turns (the client's body yaw is always 0: setupRotations with yBodyRot + 180), dying it
   * tips over, and it's stood on the face it clings to (rotateAround the attach face's opposite, about its middle)
   */
  renderShulker(b: EntityBatch, e: Shulker, dx: number, dy: number, dz: number, partial: number): void {
    const off = e.renderOffset(partial);
    if (off) {
      dx += off[0];
      dy += off[1];
      dz += off[2];
    }
    const pose = this.pose, m = this.mob;
    // (vanilla getOverlayCoords: red while hurt or dying)
    if (e.hurtTime > 0 || e.deathTime > 0) b.setOverlay(1, 0, 0, 0.3);
    else b.setOverlay(0, 0, 0, 0);
    b.begin(this.state(this.texture(e.color)));
    pose.reset();
    pose.translate(dx, dy, dz);
    if (e.deathTime > 0) {
      let f = ((e.deathTime + partial - 1) / 20) * 1.6;
      f = Math.sqrt(Math.max(0, f));
      pose.rotZ(Math.min(1, f) * 90);
    }
    pose.translate(0, 0.5, 0);
    rotateToFacing(pose, DIR_NAMES[OPPOSITE[e.attachFace]]);
    pose.translate(0, -0.5, 0);
    pose.scale(-1, -1, 1);
    pose.translate(0, -1.501, 0);
    // vanilla ShulkerModel.setupAnim: the lid up (a whole block when open, bobbing a little) and twisting right round
    const peek = e.peekAt(partial);
    const f1 = (0.5 + peek) * Math.PI;
    const f2 = -1 + Math.sin(f1);
    const f3 = f1 > Math.PI ? Math.sin((e.tickCount + partial) * 0.1) * 0.7 : 0;
    m.lid.y = 16 + Math.sin(f1) * 8 + f3;
    m.lid.yRot = peek > 0.3 ? f2 * f2 * f2 * f2 * Math.PI * 0.125 : 0;
    m.head.xRot = (e.pitchO + (e.pitch - e.pitchO) * partial) * DEG;
    m.head.yRot = (e.headYaw - 180) * DEG;
    m.root.render(b, pose, SHULKER_TEX_W, SHULKER_TEX_H);
  }

  /**
   * vanilla ShulkerBulletRenderer: the spark tumbling (its yaw and pitch along its flight, and a slow spin on all three
   * axes), at full block light, and a faint (0x26 alpha) glow of it half again as big
   */
  renderBullet(b: EntityBatch, e: ShulkerBullet, dx: number, dy: number, dz: number, partial: number): void {
    if (!this.sparkTex) {
      const t = sparkTexture();
      this.sparkTex = createTexture(this.gl, t.w, t.h, new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength));
    }
    const pose = this.pose, m = this.bullet;
    const age = e.tickCount + partial;
    b.lightB = 15 * 16;
    b.setOverlay(0, 0, 0, 0);
    pose.reset();
    pose.translate(dx, dy + 0.15, dz);
    pose.rotY(Math.sin(age * 0.1) * 180);
    pose.rotX(Math.cos(age * 0.1) * 180);
    pose.rotZ(Math.sin(age * 0.15) * 360);
    pose.scale(-0.5, -0.5, 0.5);
    m.yRot = rotLerp(partial, e.yawO, e.yaw) * DEG;
    m.xRot = (e.pitchO + (e.pitch - e.pitchO) * partial) * DEG;
    b.begin(this.state(this.sparkTex));
    m.render(b, pose, 64, 32);
    pose.scale(1.5, 1.5, 1.5);
    // (vanilla RenderType.entityTranslucent)
    b.begin({ texture: this.sparkTex, cutoff: 0.01, blend: true, cull: false, lit: true, useLightmap: true });
    m.render(b, pose, 64, 32, 1, 1, 1, 0x26 / 255);
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
