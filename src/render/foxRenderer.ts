// Foxes: vanilla FoxRenderer with FoxModel, a slim fox on thin legs with pointed ears, a narrow snout and a bushy tail.
// It trots with its legs swinging; stalking, it crouches low, quivering, with its head cocked; it pounces nose first,
// pitched along its leap, and one with its nose stuck in the snow kicks its legs. Sitting, it props itself up on its
// forelegs, its tail curled round; asleep, it lies curled on its side, its head turned back over its body, breathing,
// its eyes shut (its sleeping skin). Whatever it has in its mouth is held crosswise in its jaws. Red or snow, and a
// cub's head drawn big on its small body.

import type { EntityBatch } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import type { MobModelDef } from './mobModels';
import type { LivingKit, LivingAnim } from './illagerRenderers';
import type { Mob } from '../entity/mob';
import type { ItemStack } from '../item/item';
import { Fox, RED } from '../entity/fox';
import '../textures/fox';

const PI = Math.PI;
const RAD = PI / 180;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

/**
 * vanilla FoxModel.createBodyLayer, 48x32: the head with its ears and snout, the body laid along its length with the
 * tail on it, four legs (the left pair on one skin, the right on another). An AgeableListModel(true, 8, 3.35): a
 * cub's head is drawn at 0.75, its body at half
 */
export function foxModel(): MobModelDef {
  const root = new ModelPart();
  const head = root.add('head', part([{ x: -3, y: -2, z: -5, w: 8, h: 6, d: 6, u: 1, v: 5 }], [-1, 16.5, -3]));
  head.add('right_ear', part([{ x: -3, y: -4, z: -4, w: 2, h: 2, d: 1, u: 8, v: 1 }]));
  head.add('left_ear', part([{ x: 3, y: -4, z: -4, w: 2, h: 2, d: 1, u: 15, v: 1 }]));
  head.add('nose', part([{ x: -1, y: 2.01, z: -8, w: 4, h: 2, d: 3, u: 6, v: 18 }]));
  const body = root.add('body', part([{ x: -3, y: 3.999, z: -3.5, w: 6, h: 11, d: 6, u: 24, v: 15 }], [0, 16, -6], [PI / 2, 0, 0]));
  const leg = (u: number, v: number): Cube => ({ x: 2, y: 0.5, z: -1, w: 2, h: 6, d: 2, u, v, inflate: 0.001 });
  root.add('right_hind_leg', part([leg(13, 24)], [-5, 17.5, 7]));
  root.add('left_hind_leg', part([leg(4, 24)], [-1, 17.5, 7]));
  root.add('right_front_leg', part([leg(13, 24)], [-5, 17.5, 0]));
  root.add('left_front_leg', part([leg(4, 24)], [-1, 17.5, 0]));
  body.add('tail', part([{ x: 2, y: 0, z: -1, w: 4, h: 9, d: 5, u: 30, v: 0 }], [-4, 15, -1], [-0.05235988, 0, 0]));
  return { root, texW: 48, texH: 32, baby: { headParts: ['head'], scaleHead: true, yHead: 8, zHead: 3.35, headScale: 2, bodyScale: 2, bodyY: 24 } };
}

/**
 * vanilla FoxModel.prepareMobModel and setupAnim: the legs swing as it goes, the head tilts with its interest. Crouched,
 * its body tips forward and sinks with its head as it gets down, and trembles; asleep, it lies on its side with its
 * legs tucked out of sight, the tail curled over, its head turned back and rocking gently as it breathes; sitting, it's
 * propped up, its hind legs folded and the forelegs braced. The head follows its gaze unless it's asleep, crouched or
 * nose-down in the snow, when its legs kick (`legMotion`, vanilla legMotionPos)
 */
export function animateFox(root: ModelPart, e: Fox, a: LivingAnim, p: number, legMotion: number): void {
  root.resetPose();
  const young = e.isBaby();
  const head = root.child('head'), body = root.child('body'), tail = body.child('tail');
  const rh = root.child('right_hind_leg'), lh = root.child('left_hind_leg'), rf = root.child('right_front_leg'), lf = root.child('left_front_leg');
  const legs = [rh, lh, rf, lf];
  for (const l of legs) l.visible = true;
  const swing = a.limbSwing * 0.6662;
  rh.xRot = Math.cos(swing) * 1.4 * a.limbAmount;
  lh.xRot = Math.cos(swing + PI) * 1.4 * a.limbAmount;
  rf.xRot = Math.cos(swing + PI) * 1.4 * a.limbAmount;
  lf.xRot = Math.cos(swing) * 1.4 * a.limbAmount;
  head.zRot = e.headRollAngle(p);
  if (e.isCrouching()) {
    const c = e.crouchAmountAt(p);
    body.xRot = 1.6755161;
    body.y = 16 + c;
    head.y = 16.5 + c;
  } else if (e.isSleeping()) {
    body.zRot = -PI / 2;
    body.y = 21;
    tail.xRot = (-PI * 5) / 6;
    if (young) {
      tail.xRot = -2.1816616;
      body.z = -2;
    }
    head.x = 1;
    head.y = 19.49;
    head.zRot = 0;
    for (const l of legs) l.visible = false;
  } else if (e.isSitting()) {
    body.xRot = PI / 6;
    body.y = 9;
    body.z = -3;
    tail.xRot = PI / 4;
    tail.z = -2;
    head.y = 10;
    head.z = -0.25;
    if (young) {
      head.y = 13;
      head.z = -3.75;
    }
    rh.xRot = lh.xRot = (-PI * 5) / 12;
    rf.xRot = lf.xRot = -PI / 12;
    rh.y = lh.y = 21.5;
    rh.z = lh.z = 6.75;
  }
  if (!e.isSleeping() && !e.isFaceplanted() && !e.isCrouching()) {
    head.xRot = a.headPitch * RAD;
    head.yRot = a.headYaw * RAD;
  }
  if (e.isSleeping()) {
    head.xRot = 0;
    head.yRot = (-PI * 2) / 3;
    head.zRot = Math.cos(a.age * 0.027) / 22;
  }
  if (e.isCrouching()) {
    const f = Math.cos(a.age) * 0.01;
    body.yRot = f;
    rh.zRot = lh.zRot = f;
    rf.zRot = lf.zRot = f / 2;
  }
  if (e.isFaceplanted()) {
    const k = legMotion * 0.4662;
    rh.xRot = Math.cos(k) * 0.1;
    lh.xRot = Math.cos(k + PI) * 0.1;
    rf.xRot = Math.cos(k + PI) * 0.1;
    lf.xRot = Math.cos(k) * 0.1;
  }
}

/** vanilla FoxRenderer.getTextureLocation (textures/entity/fox/*.png): red or snow, its eyes shut while it sleeps */
export function foxTexture(e: Fox): string {
  const t = e.variant === RED ? 'fox' : 'snow_fox';
  return e.isSleeping() ? t + '_sleep' : t;
}

/** vanilla FoxRenderer's shadow (MobRenderer: a cub's half) */
export const FOX_SHADOW_RADII: Record<string, number> = { fox: 0.4 };

export class FoxRenderers {
  private readonly model = foxModel();
  /** vanilla FoxModel.legMotionPos: the kicking of a fox's legs while its nose is in the snow, on a step each time one's drawn */
  private legMotion = 0;

  constructor(private readonly kit: LivingKit) {}

  /** draws `e` if it's a fox (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (!(e instanceof Fox)) return false;
    const kit = this.kit;
    const tex = kit.tex(foxTexture(e));
    if (!tex) return true;
    // vanilla FoxRenderer.setupRotations: pouncing, or nose-down in the snow, it's pitched along its look (turned
    // before the model's flip in vanilla, the other way round after it here)
    const a = kit.setupLiving(e, dx, dy, dz, p, 90, (pose) => {
      if (e.isPouncing() || e.isFaceplanted()) pose.rotX(e.pitchO + (e.pitch - e.pitchO) * p);
    });
    if (e.isFaceplanted()) this.legMotion += 0.67;
    animateFox(this.model.root, e, a, p, this.legMotion);
    kit.overlay(b, e);
    kit.drawBody(b, e, this.model, tex, e.isBaby());
    b.setOverlay(0, 0, 0, 0);
    const held = e.mainHand;
    if (held) this.drawHeldItem(b, e, held, a, p);
    return true;
  }

  /**
   * vanilla FoxHeldItemLayer: what it has in its mouth, at its head (a cub's scaled as its head is), turned with its
   * tilt and gaze, then held crosswise at its jaws, laid on its side while it sleeps
   */
  private drawHeldItem(b: EntityBatch, e: Fox, s: ItemStack, a: LivingAnim, p: number): void {
    const pose = this.kit.pose, head = this.model.root.child('head');
    const asleep = e.isSleeping(), young = e.isBaby();
    pose.push();
    if (young) {
      pose.scale(0.75, 0.75, 0.75);
      pose.translate(0, 0.5, 0.209375);
    }
    pose.translate(head.x / 16, head.y / 16, head.z / 16);
    pose.rotZ(e.headRollAngle(p) / RAD);
    pose.rotY(a.headYaw);
    pose.rotX(a.headPitch);
    if (young) pose.translate(asleep ? 0.4 : 0.06, 0.26, asleep ? 0.15 : -0.5);
    else if (asleep) pose.translate(0.46, 0.26, 0.22);
    else pose.translate(0.06, 0.27, -0.5);
    pose.rotX(90);
    if (asleep) pose.rotZ(90);
    this.kit.items.render(b, pose, s, 'ground', false);
    pose.pop();
  }
}
