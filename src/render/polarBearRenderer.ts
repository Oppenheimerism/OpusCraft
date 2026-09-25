// Polar bears: vanilla PolarBearRenderer with PolarBearModel, a fifth bigger than the model (scale 1.2), walking on
// all fours as any quadruped, and rearing up on its hind legs to strike: the body tips back, the forelegs come up
// and forward, and the head rises with them. A cub has its head drawn big, as the other young animals.

import type { EntityBatch } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import type { MobModelDef } from './mobModels';
import type { LivingKit, LivingAnim } from './illagerRenderers';
import type { Mob } from '../entity/mob';
import { PolarBear } from '../entity/polarBear';
import '../textures/polarBear';

const PI = Math.PI;
const RAD = PI / 180;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

/** vanilla PolarBearModel.createBodyLayer, 128x64 (the young as QuadrupedModel(true, 16, 4, 2.25, 2, 24)) */
export function polarBearModel(): MobModelDef {
  const root = new ModelPart();
  root.add('head', part([
    { x: -3.5, y: -3, z: -3, w: 7, h: 7, d: 7, u: 0, v: 0 },
    { x: -2.5, y: 1, z: -6, w: 5, h: 3, d: 3, u: 0, v: 44 },
    { x: -4.5, y: -4, z: -1, w: 2, h: 2, d: 1, u: 26, v: 0 },
    { x: 2.5, y: -4, z: -1, w: 2, h: 2, d: 1, u: 26, v: 0, mirror: true },
  ], [0, 10, -16]));
  root.add('body', part([
    { x: -5, y: -13, z: -7, w: 14, h: 14, d: 11, u: 0, v: 19 },
    { x: -4, y: -25, z: -7, w: 12, h: 12, d: 10, u: 39, v: 0 },
  ], [-2, 9, 12], [PI / 2, 0, 0]));
  const hind: Cube = { x: -2, y: 0, z: -2, w: 4, h: 10, d: 8, u: 50, v: 22 };
  const front: Cube = { x: -2, y: 0, z: -2, w: 4, h: 10, d: 6, u: 50, v: 40 };
  root.add('right_hind_leg', part([hind], [-4.5, 14, 6]));
  root.add('left_hind_leg', part([hind], [4.5, 14, 6]));
  root.add('right_front_leg', part([front], [-3.5, 14, -8]));
  root.add('left_front_leg', part([front], [3.5, 14, -8]));
  return { root, texW: 128, texH: 64, baby: { headParts: ['head'], scaleHead: true, yHead: 16, zHead: 4, headScale: 2.25, bodyScale: 2, bodyY: 24 } };
}

/** vanilla QuadrupedModel.setupAnim, then PolarBearModel's rearing (by the square of how far up it is) */
function animateBear(root: ModelPart, e: PolarBear, a: LivingAnim, p: number): void {
  for (const [, c] of root.children) c.resetPose();
  const head = root.child('head'), body = root.child('body');
  const rh = root.child('right_hind_leg'), lh = root.child('left_hind_leg'), rf = root.child('right_front_leg'), lf = root.child('left_front_leg');
  head.xRot = a.headPitch * RAD;
  head.yRot = a.headYaw * RAD;
  const f = Math.cos(a.limbSwing * 0.6662) * 1.4 * a.limbAmount, g = Math.cos(a.limbSwing * 0.6662 + PI) * 1.4 * a.limbAmount;
  rh.xRot = f;
  lh.xRot = g;
  rf.xRot = g;
  lf.xRot = f;
  let f1 = e.standingScale(p);
  f1 *= f1;
  const f2 = 1 - f1;
  body.xRot = PI / 2 - f1 * PI * 0.35;
  body.y = 9 * f2 + 11 * f1;
  rf.y = lf.y = 14 * f2 - 6 * f1;
  rf.z = lf.z = -8 * f2 - 4 * f1;
  rf.xRot -= f1 * PI * 0.45;
  lf.xRot -= f1 * PI * 0.45;
  if (e.isBaby()) {
    head.y = 10 * f2 - 9 * f1;
    head.z = -16 * f2 - 7 * f1;
  } else {
    head.y = 10 * f2 - 14 * f1;
    head.z = -16 * f2 - 3 * f1;
  }
  head.xRot += f1 * PI * 0.15;
}

/** vanilla PolarBearRenderer's shadow */
export const POLAR_BEAR_SHADOW_RADII: Record<string, number> = { polar_bear: 0.9 };

export class PolarBearRenderers {
  private readonly model = polarBearModel();

  constructor(private readonly kit: LivingKit) {}

  /** draws `e` if it's a polar bear (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (!(e instanceof PolarBear)) return false;
    const kit = this.kit;
    const tex = kit.tex('polar_bear');
    if (!tex) return true;
    const a = kit.setupLiving(e, dx, dy, dz, p, 90, (pose) => pose.scale(1.2, 1.2, 1.2));
    animateBear(this.model.root, e, a, p);
    kit.overlay(b, e);
    kit.drawBody(b, e, this.model, tex, e.isBaby());
    b.setOverlay(0, 0, 0, 0);
    return true;
  }
}
