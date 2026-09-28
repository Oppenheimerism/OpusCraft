// (remaining mobs: the bee) Bees: vanilla BeeRenderer with BeeModel (64x64) — a striped body with the stinger at its
// tail and two antennae at its face, a pair of see-through wings on its back and three pairs of legs as flat strips
// under it. Flying, the wings beat a blur (120° of the beat a tick) with the legs swung back; calm, it bobs gently
// with its antennae and legs; attacking, it rolls over onto its back. A bee that has stung has no stinger; an angry
// one's eyes are red and one carrying nectar is dusted with pollen (its skin). A baby is half size.

import type { EntityBatch } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import type { MobModelDef } from './mobModels';
import type { LivingKit } from './illagerRenderers';
import type { Mob } from '../entity/mob';
import { Bee } from '../entity/bee';
import '../textures/bee';

const PI = Math.PI;
const RAD = PI / 180;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

/** vanilla BeeModel.createBodyLayer (64x64): everything hangs off the bone, 19 pixels down */
export function beeModel(): MobModelDef {
  const root = new ModelPart();
  const bone = root.add('bone', part([], [0, 19, 0]));
  const body = bone.add('body', part([{ x: -3.5, y: -4, z: -5, w: 7, h: 7, d: 10, u: 0, v: 0 }]));
  body.add('stinger', part([{ x: 0, y: -1, z: 5, w: 0, h: 1, d: 2, u: 26, v: 7 }]));
  body.add('left_antenna', part([{ x: 1.5, y: -2, z: -3, w: 1, h: 2, d: 3, u: 2, v: 0 }], [0, -2, -5]));
  body.add('right_antenna', part([{ x: -2.5, y: -2, z: -3, w: 1, h: 2, d: 3, u: 2, v: 3 }], [0, -2, -5]));
  // (vanilla CubeDeformation(0.001): the wings a hair apart from what's under them)
  const g: [number, number, number] = [0.001, 0.001, 0.001];
  bone.add('right_wing', part([{ x: -9, y: 0, z: 0, w: 9, h: 0, d: 6, u: 0, v: 18, grow: g }], [-1.5, -4, -3], [0, -0.2618, 0]));
  bone.add('left_wing', part([{ x: 0, y: 0, z: 0, w: 9, h: 0, d: 6, u: 0, v: 18, grow: g, mirror: true }], [1.5, -4, -3], [0, 0.2618, 0]));
  bone.add('front_legs', part([{ x: -5, y: 0, z: 0, w: 7, h: 2, d: 0, u: 26, v: 1 }], [1.5, 3, -2]));
  bone.add('middle_legs', part([{ x: -5, y: 0, z: 0, w: 7, h: 2, d: 0, u: 26, v: 3 }], [1.5, 3, 0]));
  bone.add('back_legs', part([{ x: -5, y: 0, z: 0, w: 7, h: 2, d: 0, u: 26, v: 5 }], [1.5, 3, 2]));
  // vanilla AgeableListModel(false, 24, 0): a baby's bone (its only body part) at half size, 24 pixels down
  return { root, texW: 64, texH: 64, baby: { headParts: [], scaleHead: false, yHead: 24, zHead: 0, headScale: 2, bodyScale: 2, bodyY: 24 } };
}

/** vanilla Mth.rotLerp */
function rotLerp(t: number, a: number, b: number): number {
  let d = (b - a) % (PI * 2);
  if (d < -PI) d += PI * 2;
  if (d >= PI) d -= PI * 2;
  return a + t * d;
}

/**
 * vanilla BeeModel.prepareMobModel and setupAnim (from the rest pose each frame): at rest on the ground, wings folded
 * back and legs down; flying, the wings beat (their tilt cos(age · 120.32°) · 0.15π) and the legs swing back; calm and
 * flying, the body bobs (and rises and sinks 0.9 pixels) with the antennae and legs; rolling, it turns over
 */
export function animateBee(root: ModelPart, e: Bee, age: number, roll: number): void {
  const bone = root.child('bone');
  bone.resetPose();
  for (const [, c] of bone.children) c.resetPose();
  const body = bone.child('body');
  for (const [, c] of body.children) c.resetPose();
  const rw = bone.child('right_wing'), lw = bone.child('left_wing');
  const fl = bone.child('front_legs'), ml = bone.child('middle_legs'), bl = bone.child('back_legs');
  const la = body.child('left_antenna'), ra = body.child('right_antenna');
  body.child('stinger').visible = !e.hasStung;
  rw.xRot = 0;
  la.xRot = 0;
  ra.xRot = 0;
  bone.xRot = 0;
  const resting = e.onGround && e.dx * e.dx + e.dy * e.dy + e.dz * e.dz < 1e-7;
  if (resting) {
    rw.yRot = -0.2618;
    rw.zRot = 0;
    lw.xRot = 0;
    lw.yRot = 0.2618;
    lw.zRot = 0;
    fl.xRot = 0;
    ml.xRot = 0;
    bl.xRot = 0;
  } else {
    const f = age * 120.32113 * RAD;
    rw.yRot = 0;
    rw.zRot = Math.cos(f) * PI * 0.15;
    lw.xRot = rw.xRot;
    lw.yRot = rw.yRot;
    lw.zRot = -rw.zRot;
    fl.xRot = PI / 4;
    ml.xRot = PI / 4;
    bl.xRot = PI / 4;
    bone.xRot = bone.yRot = bone.zRot = 0;
  }
  if (!e.isAngry()) {
    bone.xRot = bone.yRot = bone.zRot = 0;
    if (!resting) {
      const f1 = Math.cos(age * 0.18);
      bone.xRot = 0.1 + f1 * PI * 0.025;
      la.xRot = f1 * PI * 0.03;
      ra.xRot = f1 * PI * 0.03;
      fl.xRot = -f1 * PI * 0.1 + PI / 8;
      bl.xRot = -f1 * PI * 0.05 + PI / 4;
      bone.y = 19 - Math.cos(age * 0.18) * 0.9;
    }
  }
  if (roll > 0) bone.xRot = rotLerp(roll, bone.xRot, 3.0915928);
}

/** vanilla BeeRenderer's shadow */
export const BEE_SHADOW_RADII: Record<string, number> = { bee: 0.4 };

export class BeeRenderers {
  private readonly model = beeModel();

  constructor(private readonly kit: LivingKit) {}

  /** draws `e` if it's a bee (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (!(e instanceof Bee)) return false;
    const kit = this.kit;
    // (vanilla BeeRenderer.getTextureLocation: angry or not, with nectar or not)
    const tex = kit.tex('bee' + (e.isAngry() ? '_angry' : '') + (e.hasNectar ? '_nectar' : ''));
    if (!tex) return true;
    const a = kit.setupLiving(e, dx, dy, dz, p, 90);
    animateBee(this.model.root, e, a.age, e.rollAmount(p));
    kit.overlay(b, e);
    kit.drawBody(b, e, this.model, tex, e.isBaby());
    b.setOverlay(0, 0, 0, 0);
    return true;
  }
}
