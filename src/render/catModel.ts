// The cat's model (vanilla OcelotModel's mesh, 64x32, drawn by CatModel) and its animation: OcelotModel's walk, creep
// and sprint, and CatModel's sitting, lying on its side, and settling down with its head up.

import { ModelPart, type Cube } from './model';
import type { MobModelDef } from './mobModels';

const PI = Math.PI;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

/** vanilla OcelotModel.createBodyMesh (AgeableListModel(true, 10, 4): a kitten's head is scaled too) */
export function catModel(g = 0): MobModelDef {
  const root = new ModelPart();
  root.add('head', part([
    { x: -2.5, y: -2, z: -3, w: 5, h: 4, d: 5, u: 0, v: 0, inflate: g },
    { x: -1.5, y: -0.001, z: -4, w: 3, h: 2, d: 2, u: 0, v: 24, inflate: g },
    { x: -2, y: -3, z: 0, w: 1, h: 1, d: 2, u: 0, v: 10, inflate: g },
    { x: 1, y: -3, z: 0, w: 1, h: 1, d: 2, u: 6, v: 10, inflate: g },
  ], [0, 15, -9]));
  root.add('body', part([{ x: -2, y: 3, z: -8, w: 4, h: 16, d: 6, u: 20, v: 0, inflate: g }], [0, 12, -10], [PI / 2, 0, 0]));
  root.add('tail1', part([{ x: -0.5, y: 0, z: 0, w: 1, h: 8, d: 1, u: 0, v: 15, inflate: g }], [0, 15, 8], [0.9, 0, 0]));
  // (a hair thinner, so the two halves of the tail don't fight where they meet)
  root.add('tail2', part([{ x: -0.5, y: 0, z: 0, w: 1, h: 8, d: 1, u: 4, v: 15, inflate: -0.02 }], [0, 20, 14]));
  const hind: Cube = { x: -1, y: 0, z: 1, w: 2, h: 6, d: 2, u: 8, v: 13, inflate: g };
  root.add('left_hind_leg', part([hind], [1.1, 18, 5]));
  root.add('right_hind_leg', part([hind], [-1.1, 18, 5]));
  const front: Cube = { x: -1, y: 0, z: 0, w: 2, h: 10, d: 2, u: 40, v: 0, inflate: g };
  root.add('left_front_leg', part([front], [1.2, 14.1, -5]));
  root.add('right_front_leg', part([front], [-1.2, 14.1, -5]));
  return { root, texW: 64, texH: 32, baby: { headParts: ['head'], scaleHead: true, yHead: 10, zHead: 4, headScale: 2, bodyScale: 2, bodyY: 24 } };
}

export interface CatPose {
  limbSwing: number;
  limbAmount: number;
  headYaw: number;
  headPitch: number;
  crouching: boolean;
  sprinting: boolean;
  sitting: boolean;
  /** vanilla Cat.getLieDownAmount / getLieDownAmountTail / getRelaxStateOneAmount */
  lieDown: number;
  lieDownTail: number;
  relaxStateOne: number;
}

/** vanilla ModelUtils.rotlerpRad */
function rotlerpRad(a: number, b: number, t: number): number {
  let d = b - a;
  while (d < -PI) d += 2 * PI;
  while (d >= PI) d -= 2 * PI;
  return a + t * d;
}

/** vanilla CatModel.prepareMobModel (OcelotModel's within it) and setupAnim (OcelotModel's, then CatModel's) */
export function animateCat(root: ModelPart, s: CatPose): void {
  root.resetPose();
  const head = root.child('head'), body = root.child('body'), tail1 = root.child('tail1'), tail2 = root.child('tail2');
  const lh = root.child('left_hind_leg'), rh = root.child('right_hind_leg'), lf = root.child('left_front_leg'), rf = root.child('right_front_leg');
  // OcelotModel.prepareMobModel
  tail1.xRot = 0.9;
  let state = 1;
  if (s.crouching) {
    body.y += 1;
    head.y += 2;
    tail1.y += 1;
    tail2.y += -4;
    tail2.z += 2;
    tail1.xRot = PI / 2;
    tail2.xRot = PI / 2;
    state = 0;
  } else if (s.sprinting) {
    tail2.y = tail1.y;
    tail2.z += 2;
    tail1.xRot = PI / 2;
    tail2.xRot = PI / 2;
    state = 2;
  }
  // CatModel.prepareMobModel: sitting up
  if (s.sitting) {
    body.xRot = PI / 4;
    body.y += -4;
    body.z += 5;
    head.y += -3.3;
    head.z += 1;
    tail1.y += 8;
    tail1.z += -2;
    tail2.y += 2;
    tail2.z += -0.8;
    tail1.xRot = 1.7278761;
    tail2.xRot = 2.670354;
    lf.xRot = -PI / 20;
    lf.y = 16.1;
    lf.z = -7;
    rf.xRot = -PI / 20;
    rf.y = 16.1;
    rf.z = -7;
    lh.xRot = -PI / 2;
    lh.y = 21;
    lh.z = 1;
    rh.xRot = -PI / 2;
    rh.y = 21;
    rh.z = 1;
    state = 3;
  }
  // OcelotModel.setupAnim
  head.xRot = (s.headPitch * PI) / 180;
  head.yRot = (s.headYaw * PI) / 180;
  if (state !== 3) {
    body.xRot = PI / 2;
    const f = s.limbSwing, g = s.limbAmount;
    if (state === 2) {
      lh.xRot = Math.cos(f * 0.6662) * g;
      rh.xRot = Math.cos(f * 0.6662 + 0.3) * g;
      lf.xRot = Math.cos(f * 0.6662 + PI + 0.3) * g;
      rf.xRot = Math.cos(f * 0.6662 + PI) * g;
      tail2.xRot = 1.7278761 + (PI / 10) * Math.cos(f) * g;
    } else {
      lh.xRot = Math.cos(f * 0.6662) * g;
      rh.xRot = Math.cos(f * 0.6662 + PI) * g;
      lf.xRot = Math.cos(f * 0.6662 + PI) * g;
      rf.xRot = Math.cos(f * 0.6662) * g;
      tail2.xRot = 1.7278761 + (state === 1 ? PI / 4 : 0.47123894) * Math.cos(f) * g;
    }
  }
  // CatModel.setupAnim: curled on its side, and the head raised as it settles
  if (s.lieDown > 0) {
    head.zRot = rotlerpRad(head.zRot, -1.2707963, s.lieDown);
    head.yRot = rotlerpRad(head.yRot, 1.2707963, s.lieDown);
    lf.xRot = -1.2707963;
    rf.xRot = -0.47079635;
    rf.zRot = -0.2;
    rf.x = -0.2;
    lh.xRot = -0.4;
    rh.xRot = 0.5;
    rh.zRot = -0.5;
    rh.x = -0.3;
    rh.y = 20;
    tail1.xRot = rotlerpRad(tail1.xRot, 0.8, s.lieDownTail);
    tail2.xRot = rotlerpRad(tail2.xRot, -0.4, s.lieDownTail);
  }
  if (s.relaxStateOne > 0) head.xRot = rotlerpRad(head.xRot, -0.58177644, s.relaxStateOne);
}
