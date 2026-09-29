// (armour stand) Armour stands on screen (vanilla ArmorStandRenderer, ArmorStandModel and ArmorStandArmorModel): the
// wooden stand (render/armorStandPreview.ts's model and wood) turned as it stands, each part in its pose, the arms only
// when shown and the base plate unless taken away; a small one as a baby mob is (its head a size up on a half-size
// body); an invisible one shows only what it wears (a spectator sees its ghost). Over it, what it wears and holds as a
// humanoid's is drawn: the armour, the items in its hands (the arms or no), a worn elytra and whatever else is on its
// head. A stand just struck wobbles a few degrees for five ticks. Its name shows only when set to (CustomNameVisible),
// whether invisible or not.

import type { GL } from './gl';
import { createTexture } from './gl';
import type { EntityBatch, PoseStack, DrawState } from './entityRenderer';
import type { ItemRenderer } from './itemRenderer';
import type { ModelPart } from './model';
import { renderHeadItem, type ArmorLayer } from './armorLayer';
import type { ElytraLayer } from './elytraLayer';
import { drawArmItem } from './playerPose';
import { armorStandModel, armorStandTexture } from './armorStandPreview';
import type { ArmorStand, Rotations } from '../entity/armorStand';
import { wrapDegrees } from '../core/math';

const DEG = Math.PI / 180;
/** vanilla ArmorStandModel.bodyParts beside the head (a small stand's body is drawn at half size) */
const BODY_PARTS = ['body', 'right_arm', 'left_arm', 'right_leg', 'left_leg', 'right_body_stick', 'left_body_stick', 'shoulder_stick', 'base_plate'];
/** the stand's parts the body's pose turns (vanilla ArmorStandModel.setupAnim: the sticks go with the body) */
const BODY_TURNED = ['body', 'right_body_stick', 'left_body_stick', 'shoulder_stick'];

function rotLerp(p: number, a: number, b: number): number {
  return a + wrapDegrees(b - a) * p;
}

function turn(part: ModelPart, r: Rotations): void {
  part.xRot = r[0] * DEG;
  part.yRot = r[1] * DEG;
  part.zRot = r[2] * DEG;
}

/** vanilla ArmorStand.shouldRenderAtSqrDistance: four times as far as its size says (a marker's as a 1-block one's) */
export function armorStandRenderSize(e: ArmorStand): number {
  const b = e.bb;
  const size = (b.maxX - b.minX + b.maxY - b.minY + b.maxZ - b.minZ) / 3;
  return size > 0 ? size * 4 : 4;
}

/** vanilla ArmorStandRenderer.shouldShowName: set to show (CustomNameVisible), within 64 blocks, invisible or not */
export function armorStandShowsName(e: ArmorStand, d2: number): boolean {
  return e.customName !== null && e.customNameVisible && d2 < 64 * 64;
}

export class ArmorStandRenderer {
  private readonly root = armorStandModel();
  private tex: WebGLTexture | null = null;

  constructor(
    private readonly gl: GL,
    private readonly items: ItemRenderer,
    private readonly armor: ArmorLayer,
    private readonly elytra: ElytraLayer,
  ) {}

  /** vanilla ArmorStandModel.setupAnim (and ArmorStandArmorModel's): each part turned by its pose, arms and plate shown or not */
  setupAnim(e: ArmorStand): ModelPart {
    const r = this.root;
    turn(r.child('head'), e.headPose);
    for (const n of BODY_TURNED) turn(r.child(n), e.bodyPose);
    turn(r.child('left_arm'), e.leftArmPose);
    turn(r.child('right_arm'), e.rightArmPose);
    turn(r.child('left_leg'), e.leftLegPose);
    turn(r.child('right_leg'), e.rightLegPose);
    r.child('left_arm').visible = r.child('right_arm').visible = e.showArms;
    r.child('base_plate').visible = !e.noBasePlate;
    return r;
  }

  /**
   * vanilla LivingEntityRenderer.render for a stand at (dx, dy, dz) from the camera: ArmorStandRenderer.setupRotations
   * (turned by its body, the wobble), the flip and the drop, the stand (entityCutoutNoCull; for an invisible one
   * nothing, or a spectator's 15% ghost) and its layers
   */
  render(b: EntityBatch, pose: PoseStack, e: ArmorStand, dx: number, dy: number, dz: number, p: number, spectator: boolean): void {
    pose.reset();
    pose.translate(dx, dy, dz);
    pose.rotY(180 - rotLerp(p, e.bodyYawO, e.bodyYaw));
    const wiggle = e.level.gameTime - e.lastHit + p;
    if (wiggle < 5) pose.rotY(Math.sin((wiggle / 1.5) * Math.PI) * 3);
    pose.scale(-1, -1, 1);
    pose.translate(0, -1.501, 0);
    const root = this.setupAnim(e);
    const small = e.small;
    b.setOverlay(0, 0, 0, 0);
    if (!this.tex) this.tex = createTexture(this.gl, 64, 64, armorStandTexture());
    const st: DrawState = { texture: this.tex, cutoff: 0.1, blend: false, cull: false, lit: true, useLightmap: true };
    if (!e.isInvisible()) {
      b.begin(st);
      this.drawStand(b, pose, small, 1);
    } else if (spectator) {
      b.begin({ ...st, blend: true, cutoff: 0.01, depthWrite: false });
      this.drawStand(b, pose, small, 38 / 255);
      b.flush();
    }
    // vanilla HumanoidArmorLayer (the humanoid armour, copying the stand's pose), ItemInHandLayer (the main arm is
    // the right), ElytraLayer and CustomHeadLayer
    this.armor.render(b, pose, root, e.armorItems, small);
    if (e.mainHand) drawArmItem(b, this.items, pose, root, e.mainHand, false, -1, small);
    if (e.offHand) drawArmItem(b, this.items, pose, root, e.offHand, true, -1, small);
    this.elytra.render(b, pose, e, e.armorItems[2], small, false);
    const head = e.armorItems[3];
    if (head && head.item.armor?.slot !== 'head') renderHeadItem(b, pose, this.items, root, head, small);
  }

  /** vanilla AgeableListModel.renderToBuffer (HumanoidModel's: a baby's head scaled 0.75 a block up, its body half size 1.5 down) */
  private drawStand(b: EntityBatch, pose: PoseStack, small: boolean, a: number): void {
    const r = this.root;
    if (!small) {
      r.render(b, pose, 64, 64, 1, 1, 1, a);
      return;
    }
    pose.push();
    pose.scale(0.75, 0.75, 0.75);
    pose.translate(0, 1, 0);
    r.child('head').render(b, pose, 64, 64, 1, 1, 1, a);
    pose.pop();
    pose.push();
    pose.scale(0.5, 0.5, 0.5);
    pose.translate(0, 1.5, 0);
    for (const n of BODY_PARTS) r.child(n).render(b, pose, 64, 64, 1, 1, 1, a);
    pose.pop();
  }
}
