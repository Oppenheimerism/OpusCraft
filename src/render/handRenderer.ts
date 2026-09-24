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
import type { Hand } from '../item/inventory';
import { chargeDuration, crossbowTexture, isCharged } from '../item/crossbow';
import { MapRenderer } from './mapRenderer';

export class HandRenderer {
  private mainHandHeight = 0;
  private oMainHandHeight = 0;
  private offHandHeight = 0;
  private oOffHandHeight = 0;
  /** the dimension lights entities from above and below (the Nether) */
  netherLighting = false;
  private mainHandItem: ItemStack | null = null;
  private offHandItem: ItemStack | null = null;
  readonly skin: WebGLTexture;
  private readonly model: ModelPart;
  private readonly pose = new PoseStack();
  private readonly proj = mat4();
  private readonly maps: MapRenderer;

  constructor(gl: GL, private readonly items: ItemRenderer) {
    const s = steveSkin();
    this.skin = createTexture(gl, s.w, s.h, new Uint8Array(s.data.buffer));
    this.model = playerModel(false);
    this.maps = new MapRenderer(gl);
  }

  get skinTexture(): WebGLTexture {
    return this.skin;
  }

  /** vanilla ItemInHandRenderer.tick: each hand lowers to swap what it shows, then comes back up (the main one with the attack cooldown) */
  tick(p: Player): void {
    this.oMainHandHeight = this.mainHandHeight;
    this.oOffHandHeight = this.offHandHeight;
    const cur = p.inventory.inHand('main'), off = p.inventory.inHand('off');
    if (sameItem(this.mainHandItem, cur)) this.mainHandItem = cur;
    if (sameItem(this.offHandItem, off)) this.offHandItem = off;
    if (p.handsBusy) {
      // (rowing: both hands are on the oars)
      this.mainHandHeight = Math.max(0, Math.min(1, this.mainHandHeight - 0.4));
      this.offHandHeight = Math.max(0, Math.min(1, this.offHandHeight - 0.4));
    } else {
      const f = p.attackStrengthScale(1);
      this.mainHandHeight += Math.max(-0.4, Math.min(0.4, (this.mainHandItem === cur ? f * f * f : 0) - this.mainHandHeight));
      this.offHandHeight += Math.max(-0.4, Math.min(0.4, (this.offHandItem === off ? 1 : 0) - this.offHandHeight));
    }
    if (this.mainHandHeight < 0.1) this.mainHandItem = cur;
    if (this.offHandHeight < 0.1) this.offHandItem = off;
  }

  /** vanilla itemUsed: an item use went through, the item in that hand drops and comes back up */
  itemUsed(hand: Hand = 'main'): void {
    if (hand === 'main') this.mainHandHeight = 0;
    else this.offHandHeight = 0;
  }

  /** Called after the world is drawn. `bob` = view bob/hurt matrix (camera space). */
  render(batch: EntityBatch, p: Player, partial: number, width: number, height: number, fovMul: number, bob: Mat4, lightB: number, lightS: number, viewRot: Mat4, mainArm: Arm = 'right'): void {
    perspective(this.proj, 70 * fovMul * DEG, width / height, 0.05, 100);
    batch.proj = this.proj;
    batch.view = mat4();
    batch.fog = [0, 0];
    // light directions in view space
    // (vanilla Lighting.setupNetherLevel: the second light from below in the Nether)
    const l0 = rotateDir(viewRot, 0.2, 1.0, -0.7), l1 = rotateDir(viewRot, -0.2, this.netherLighting ? -1.0 : 1.0, 0.7);
    batch.light0 = l0;
    batch.light1 = l1;
    batch.lightB = lightB;
    batch.lightS = lightS;
    const pose = this.pose;
    pose.reset(bob);
    // view lag sway (vanilla xBob/yBob, against getViewYRot: lerped while riding)
    const pitch = p.pitch, yaw = p.vehicle ? p.yawO + (p.yaw - p.yawO) * partial : p.yaw;
    const xb = p.xBobO + (p.xBob - p.xBobO) * partial;
    const yb = p.yBobO + (p.yBob - p.yBobO) * partial;
    pose.rotX((pitch - xb) * 0.1);
    pose.rotY((yaw - yb) * 0.1);
    let swing = p.attackAnim - p.attackAnimO;
    if (swing < 0) swing += 1;
    swing = p.attackAnimO + swing * partial;
    const hands = whichHandsToRender(p);
    const offArm: Arm = mainArm === 'right' ? 'left' : 'right';
    if (hands.main) {
      const equip = 1 - (this.oMainHandHeight + (this.mainHandHeight - this.oMainHandHeight) * partial);
      pose.push();
      this.renderArmWithItem(batch, pose, p, 'main', mainArm, p.swingingArm === 'main' ? swing : 0, this.mainHandItem, equip, partial, pitch);
      pose.pop();
    }
    if (hands.off) {
      const equip = 1 - (this.oOffHandHeight + (this.offHandHeight - this.oOffHandHeight) * partial);
      pose.push();
      this.renderArmWithItem(batch, pose, p, 'off', offArm, p.swingingArm === 'off' ? swing : 0, this.offHandItem, equip, partial, pitch);
      pose.pop();
    }
    batch.flush();
  }

  /** vanilla renderArmWithItem: one hand, on the `arm` side (i = 1 right, -1 left: every sideways move and turn mirrors) */
  private renderArmWithItem(batch: EntityBatch, pose: PoseStack, p: Player, hand: Hand, arm: Arm, swing: number, item: ItemStack | null, equip: number, partial: number, pitch: number): void {
    const i = arm === 'right' ? 1 : -1;
    // vanilla: the bare arm only for an empty main hand, and not while invisible
    if (!item) {
      if (hand === 'main' && !p.isInvisible()) this.renderArm(batch, pose, equip, swing, i);
      return;
    }
    // vanilla: a map in the main hand with nothing in the other is held up in both; otherwise in its own hand
    if (item.item.id === 'filled_map') {
      if (hand === 'main' && !this.offHandItem) this.renderTwoHandedMap(batch, pose, p, pitch, equip, swing);
      else this.renderOneHandedMap(batch, pose, p, equip, i, swing, item);
      return;
    }
    const using = p.useItem === item && p.useItemRemaining > 0 && p.useHand === hand;
    const ctx = i > 0 ? 'firstperson_righthand' : 'firstperson_lefthand';
    if (item.item.id === 'crossbow') {
      this.renderCrossbow(batch, pose, p, item, using, partial, equip, swing, i, hand === 'main');
      return;
    }
    if (using) {
      const it = item.item;
      let tex: string | undefined;
      if (it.id === 'bow') {
        // vanilla ItemInHandRenderer BOW use animation
        pose.translate(i * 0.56, -0.52 + equip * -0.6, -0.72);
        pose.translate(i * -0.2785682, 0.18344387, 0.15731531);
        pose.rotX(-13.935);
        pose.rotY(i * 35.3);
        pose.rotZ(i * -9.785);
        const f8 = p.useDuration - (p.useItemRemaining - partial + 1);
        let f12 = f8 / 20;
        f12 = (f12 * f12 + f12 * 2) / 3;
        if (f12 > 1) f12 = 1;
        if (f12 > 0.1) {
          const f15 = Math.sin((f8 - 0.1) * 1.3);
          const f18 = f12 - 0.1;
          pose.translate(0, f15 * f18 * 0.004, 0);
        }
        pose.translate(0, 0, f12 * 0.04);
        pose.scale(1, 1, 1 + f12 * 0.2);
        pose.rotY(i * -45);
        const pull = f8 / 20;
        tex = pull >= 0.9 ? 'bow_pulling_2' : pull >= 0.65 ? 'bow_pulling_1' : 'bow_pulling_0';
      } else if (it.id === 'trident') {
        // vanilla ItemInHandRenderer SPEAR use animation: raised over the shoulder and drawn back over half a
        // second, shaking once it's past 10 %
        pose.translate(i * 0.56, -0.52 + equip * -0.6, -0.72);
        pose.translate(i * -0.5, 0.7, 0.1);
        pose.rotX(-55);
        pose.rotY(i * 35.3);
        pose.rotZ(i * -9.785);
        const f7 = p.useDuration - (p.useItemRemaining - partial + 1);
        let f11 = f7 / 10;
        if (f11 > 1) f11 = 1;
        if (f11 > 0.1) pose.translate(0, Math.sin((f7 - 0.1) * 1.3) * (f11 - 0.1) * 0.004, 0);
        pose.translate(0, 0, f11 * 0.2);
        pose.scale(1, 1, 1 + f11 * 0.2);
        pose.rotY(i * -45);
        tex = 'trident_throwing';
      } else if (it.id === 'shield') {
        // vanilla BLOCK use animation: just applyItemArmTransform (no swing), the shield_blocking model held across
        pose.translate(i * 0.56, -0.52 + equip * -0.6, -0.72);
        tex = 'shield_blocking';
      } else {
        // vanilla applyEatTransform + applyItemArmTransform (eating and drinking)
        const f = p.useItemRemaining - partial + 1;
        const f1 = f / p.useDuration;
        if (f1 < 0.8) pose.translate(0, Math.abs(Math.cos((f / 4) * Math.PI) * 0.1), 0);
        const f3 = 1 - Math.pow(f1, 27);
        pose.translate(f3 * 0.6 * i, f3 * -0.5, 0);
        pose.rotY(i * f3 * 90);
        pose.rotX(f3 * 10);
        pose.rotZ(i * f3 * 30);
        pose.translate(i * 0.56, -0.52 + equip * -0.6, -0.72);
      }
      this.items.render(batch, pose, item, ctx, i < 0, tex);
      return;
    }
    if (p.isAutoSpinAttack()) {
      // vanilla: whirling in a riptide, what's in the hand is thrust out ahead
      pose.translate(i * 0.56, -0.52 + equip * -0.6, -0.72);
      pose.translate(i * -0.4, 0.8, 0.3);
      pose.rotY(i * 65);
      pose.rotZ(i * -85);
      this.items.render(batch, pose, item, ctx, i < 0);
      return;
    }
    const sq = Math.sqrt(swing);
    const f5 = -0.4 * Math.sin(sq * Math.PI);
    const f6 = 0.2 * Math.sin(sq * Math.PI * 2);
    const f10 = -0.2 * Math.sin(swing * Math.PI);
    pose.translate(i * f5, f6, f10);
    // applyItemArmTransform
    pose.translate(i * 0.56, -0.52 + equip * -0.6, -0.72);
    this.attackTransform(pose, i, swing);
    this.items.render(batch, pose, item, ctx, i < 0);
  }

  /** vanilla applyItemArmAttackTransform */
  private attackTransform(pose: PoseStack, i: number, swing: number): void {
    const f = Math.sin(swing * swing * Math.PI);
    pose.rotY(i * (45 + f * -20));
    const f1 = Math.sin(Math.sqrt(swing) * Math.PI);
    pose.rotZ(i * f1 * -20);
    pose.rotX(f1 * -80);
    pose.rotY(i * -45);
  }

  /**
   * vanilla renderArmWithItem, the crossbow. Drawing it: pulled in and turned aside, shaking once past 10 % and
   * pulled closer and longer with the charge (f13); it stops showing as drawn when the use duration (charge + 3
   * ticks) runs out, still held. Otherwise the usual swing, and a loaded one in the main hand sits further in
   * and turned 10° when not swinging.
   */
  private renderCrossbow(batch: EntityBatch, pose: PoseStack, p: Player, item: ItemStack, using: boolean, partial: number, equip: number, swing: number, i: number, main: boolean): void {
    if (using) {
      pose.translate(i * 0.56, -0.52 + equip * -0.6, -0.72);
      pose.translate(i * -0.4785682, -0.094387, 0.05731531);
      pose.rotX(-11.935);
      pose.rotY(i * 65.3);
      pose.rotZ(i * -9.785);
      const f9 = p.useDuration - (p.useItemRemaining - partial + 1);
      let f13 = f9 / chargeDuration(item);
      if (f13 > 1) f13 = 1;
      if (f13 > 0.1) {
        const f16 = Math.sin((f9 - 0.1) * 1.3);
        pose.translate(0, f16 * (f13 - 0.1) * 0.004, 0);
      }
      pose.translate(0, 0, f13 * 0.04);
      pose.scale(1, 1, 1 + f13 * 0.2);
      pose.rotY(i * -45);
    } else {
      const sq = Math.sqrt(swing);
      pose.translate(i * -0.4 * Math.sin(sq * Math.PI), 0.2 * Math.sin(sq * Math.PI * 2), -0.2 * Math.sin(swing * Math.PI));
      // applyItemArmTransform + applyItemArmAttackTransform
      pose.translate(i * 0.56, -0.52 + equip * -0.6, -0.72);
      this.attackTransform(pose, i, swing);
      if (isCharged(item) && swing < 0.001 && main) {
        pose.translate(i * -0.641864, 0, 0);
        pose.rotY(i * 10);
      }
    }
    this.items.render(batch, pose, item, i > 0 ? 'firstperson_righthand' : 'firstperson_lefthand', i < 0, crossbowTexture(item, p.useItem === item ? p.ticksUsingItem() : -1));
  }

  /** vanilla renderPlayerArm, the bare arm on side i (PlayerRenderer.renderRightHand / renderLeftHand) */
  private renderArm(batch: EntityBatch, pose: PoseStack, equip: number, swing: number, i: number): void {
    const f = i;
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
    this.drawArm(batch, pose, i > 0);
  }

  /** vanilla PlayerRenderer.renderRightHand / renderLeftHand */
  private drawArm(batch: EntityBatch, pose: PoseStack, right: boolean): void {
    // PlayerRenderer.renderHand: the arm as setupAnim leaves it at age 0 (bobArms tilts it out by 0.1), xRot 0
    const arm = this.model.child(right ? 'right_arm' : 'left_arm');
    arm.resetPose();
    arm.xRot = 0;
    arm.zRot = right ? 0.1 : -0.1;
    batch.begin({ texture: this.skin, cutoff: 0.1, blend: false, cull: true, lit: true, useLightmap: true });
    arm.render(batch, pose, 64, 64);
    arm.child(right ? 'right_sleeve' : 'left_sleeve').visible = true;
  }

  /**
   * vanilla renderTwoHandedMap: held up in front in both hands, lowered and tipped away while you look ahead and
   * raised to face you as you look down (calculateMapTilt), bobbing with a swing
   */
  private renderTwoHandedMap(batch: EntityBatch, pose: PoseStack, p: Player, pitch: number, equip: number, swing: number): void {
    const f = Math.sqrt(swing);
    const f1 = -0.2 * Math.sin(swing * Math.PI);
    const f2 = -0.4 * Math.sin(f * Math.PI);
    pose.translate(0, -f1 / 2, f2);
    const f3 = mapTilt(pitch);
    pose.translate(0, 0.04 + equip * -1.2 + f3 * -0.5, -0.72);
    pose.rotX(f3 * -85);
    if (!p.isInvisible()) {
      pose.push();
      pose.rotY(90);
      this.renderMapHand(batch, pose, 1);
      this.renderMapHand(batch, pose, -1);
      pose.pop();
    }
    pose.rotX(Math.sin(f * Math.PI) * 20);
    pose.scale(2, 2, 2);
    this.maps.renderMap(batch, pose, this.mainHandItem!);
  }

  /** vanilla renderMapHand: an arm reaching in from each side to hold the map's edge */
  private renderMapHand(batch: EntityBatch, pose: PoseStack, f: number): void {
    pose.push();
    pose.rotY(92);
    pose.rotX(45);
    pose.rotZ(f * -41);
    pose.translate(f * 0.3, -1.1, 0.45);
    this.drawArm(batch, pose, f > 0);
    pose.pop();
  }

  /** vanilla renderOneHandedMap: the arm, and the map held out beside it on that side */
  private renderOneHandedMap(batch: EntityBatch, pose: PoseStack, p: Player, equip: number, f: number, swing: number, item: ItemStack): void {
    pose.translate(f * 0.125, -0.125, 0);
    if (!p.isInvisible()) {
      pose.push();
      pose.rotZ(f * 10);
      this.renderArm(batch, pose, equip, swing, f);
      pose.pop();
    }
    pose.push();
    pose.translate(f * 0.51, -0.08 + equip * -1.2, -0.75);
    const f1 = Math.sqrt(swing);
    const f2 = Math.sin(f1 * Math.PI);
    const f3 = -0.5 * f2;
    const f4 = 0.4 * Math.sin(f1 * Math.PI * 2);
    const f5 = -0.3 * Math.sin(swing * Math.PI);
    pose.translate(f * f3, f4 - 0.3 * f2, f5);
    pose.rotX(f2 * -45);
    pose.rotY(f * f2 * -30);
    this.maps.renderMap(batch, pose, item);
    pose.pop();
  }
}

type Arm = 'left' | 'right';

/**
 * vanilla evaluateWhichHandsToRender: both hands, except around bows and crossbows — drawing one shows only that
 * hand, and a loaded crossbow in the main hand hides the other
 */
function whichHandsToRender(p: Player): { main: boolean; off: boolean } {
  const main = p.inventory.inHand('main'), off = p.inventory.inHand('off');
  const bowLike = (s: ItemStack | null) => s?.item.id === 'bow' || s?.item.id === 'crossbow';
  const charged = (s: ItemStack | null) => s?.item.id === 'crossbow' && isCharged(s);
  if (!bowLike(main) && !bowLike(off)) return { main: true, off: true };
  if (p.isUsingItem()) {
    const u = p.useItem;
    if (!bowLike(u)) return { main: true, off: !(p.useHand === 'main' && charged(off)) };
    return { main: p.useHand === 'main', off: p.useHand === 'off' };
  }
  return { main: true, off: !charged(main) };
}

/** vanilla calculateMapTilt: 1 looking level or up, easing to 0 as you look 45°+ down */
function mapTilt(pitch: number): number {
  const f = Math.max(0, Math.min(1, 1 - pitch / 45 + 0.1));
  return -Math.cos(f * Math.PI) * 0.5 + 0.5;
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
