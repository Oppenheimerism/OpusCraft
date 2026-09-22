// First-person hand / held item (vanilla ItemInHandRenderer).

import type { GL } from './gl';
import { createTexture } from './gl';
import { EntityBatch, PoseStack } from './entityRenderer';
import { ItemRenderer } from './itemRenderer';
import { playerModel, ModelPart } from './model';
import { steveSkin } from '../textures/skin';
import { mat4, perspective, DEG, Mat4 } from '../core/math';
import type { Player } from '../entity/player';
import type { ItemStack } from '../item/item';

export class HandRenderer {
  private mainHandHeight = 0;
  private oMainHandHeight = 0;
  private mainHandItem: ItemStack | null = null;
  readonly skin: WebGLTexture;
  private readonly model: ModelPart;
  private readonly pose = new PoseStack();
  private readonly proj = mat4();

  constructor(gl: GL, private readonly items: ItemRenderer) {
    const s = steveSkin();
    this.skin = createTexture(gl, s.w, s.h, new Uint8Array(s.data.buffer));
    this.model = playerModel(false);
  }

  get skinTexture(): WebGLTexture {
    return this.skin;
  }

  tick(p: Player): void {
    this.oMainHandHeight = this.mainHandHeight;
    const cur = p.inventory.selectedItem;
    if (sameItem(this.mainHandItem, cur)) this.mainHandItem = cur;
    const f = p.attackStrengthScale(1);
    const target = sameItem(this.mainHandItem, cur) && this.mainHandItem === cur ? f * f * f : 0;
    this.mainHandHeight += Math.max(-0.4, Math.min(0.4, target - this.mainHandHeight));
    if (this.mainHandHeight < 0.1) this.mainHandItem = cur;
  }

  /** Called after the world is drawn. `bob` = view bob/hurt matrix (camera space). */
  render(batch: EntityBatch, p: Player, partial: number, width: number, height: number, fovMul: number, bob: Mat4, lightB: number, lightS: number, viewRot: Mat4): void {
    perspective(this.proj, 70 * fovMul * DEG, width / height, 0.05, 100);
    batch.proj = this.proj;
    batch.view = mat4();
    batch.fog = [0, 0];
    // light directions in view space
    const l0 = rotateDir(viewRot, 0.2, 1.0, -0.7), l1 = rotateDir(viewRot, -0.2, 1.0, 0.7);
    batch.light0 = l0;
    batch.light1 = l1;
    batch.lightB = lightB;
    batch.lightS = lightS;
    const pose = this.pose;
    pose.reset(bob);
    // view lag sway (vanilla xBob/yBob)
    const pitch = p.pitch, yaw = p.yaw;
    const xb = p.xBobO + (p.xBob - p.xBobO) * partial;
    const yb = p.yBobO + (p.yBob - p.yBobO) * partial;
    pose.rotX((pitch - xb) * 0.1);
    pose.rotY((yaw - yb) * 0.1);
    let swing = p.attackAnim - p.attackAnimO;
    if (swing < 0) swing += 1;
    swing = p.attackAnimO + swing * partial;
    const equip = 1 - (this.oMainHandHeight + (this.mainHandHeight - this.oMainHandHeight) * partial);
    const item = this.mainHandItem;
    if (!item) this.renderArm(batch, pose, equip, swing);
    else {
      const sq = Math.sqrt(swing);
      const f5 = -0.4 * Math.sin(sq * Math.PI);
      const f6 = 0.2 * Math.sin(sq * Math.PI * 2);
      const f10 = -0.2 * Math.sin(swing * Math.PI);
      pose.translate(f5, f6, f10);
      // applyItemArmTransform
      pose.translate(0.56, -0.52 + equip * -0.6, -0.72);
      // applyItemArmAttackTransform
      const f = Math.sin(swing * swing * Math.PI);
      pose.rotY(45 + f * -20);
      const f1 = Math.sin(sq * Math.PI);
      pose.rotZ(f1 * -20);
      pose.rotX(f1 * -80);
      pose.rotY(-45);
      this.items.render(batch, pose, item, 'firstperson_righthand');
    }
    batch.flush();
  }

  private renderArm(batch: EntityBatch, pose: PoseStack, equip: number, swing: number): void {
    const f = 1;
    const f1 = Math.sqrt(swing);
    const f2 = -0.3 * Math.sin(f1 * Math.PI);
    const f3 = 0.4 * Math.sin(f1 * Math.PI * 2);
    const f4 = -0.4 * Math.sin(swing * Math.PI);
    pose.translate(f * (f2 + 0.64000005), f3 + -0.6 + equip * -0.6, f4 + -0.71999997);
    pose.rotY(f * 45);
    const f5 = Math.sin(swing * swing * Math.PI);
    const f6 = Math.sin(f1 * Math.PI);
    pose.rotY(f * f6 * 70);
    pose.rotZ(f * f5 * -20);
    pose.translate(f * -1, 3.6, 3.5);
    pose.rotZ(f * 120);
    pose.rotX(200);
    pose.rotY(f * -135);
    pose.translate(f * 5.6, 0, 0);
    // PlayerRenderer.renderRightHand: arm with xRot 0, zRot 0; model is flipped (scale -1,-1,1)? vanilla renders the part directly
    const arm = this.model.child('right_arm');
    arm.resetPose();
    arm.xRot = 0;
    arm.zRot = 0.1; // idle sway from setupAnim(age 0)
    batch.begin({ texture: this.skin, cutoff: 0.1, blend: false, cull: true, lit: true, useLightmap: true });
    arm.render(batch, pose, 64, 64);
    arm.child('right_sleeve').visible = true;
  }
}

function sameItem(a: ItemStack | null, b: ItemStack | null): boolean {
  if (!a || !b) return a === b;
  return a.item === b.item && a.damage === b.damage;
}

function rotateDir(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z);
  x /= l;
  y /= l;
  z /= l;
  return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
}
