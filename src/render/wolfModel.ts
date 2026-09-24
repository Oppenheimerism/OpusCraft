// The wolf's model (vanilla 1.20.5+ WolfModel, 64x32) and its animation: prepareMobModel (sitting, the tail wagging
// as it walks, the shake rolling down its body, the head on one side while it begs) and setupAnim (where it looks,
// and the tail raised by how it feels, which WolfRenderer.getBob hands over).

import { ModelPart, type Cube } from './model';
import type { MobModelDef } from './mobModels';

const PI = Math.PI;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

/** vanilla WolfModel.createMeshDefinition (AgeableListModel(false, 5, 2): a pup's head isn't scaled down) */
export function wolfModel(g = 0): MobModelDef {
  const root = new ModelPart();
  const head = part([], [-1, 13.5, -7]);
  head.add(
    'real_head',
    part([
      { x: -2, y: -3, z: -2, w: 6, h: 6, d: 4, u: 0, v: 0, inflate: g },
      { x: -2, y: -5, z: 0, w: 2, h: 2, d: 1, u: 16, v: 14, inflate: g },
      { x: 2, y: -5, z: 0, w: 2, h: 2, d: 1, u: 16, v: 14, inflate: g },
      { x: -0.5, y: 0, z: -5, w: 3, h: 3, d: 4, u: 0, v: 10, inflate: g },
    ]),
  );
  root.add('head', head);
  root.add('body', part([{ x: -3, y: -2, z: -3, w: 6, h: 9, d: 6, u: 18, v: 14, inflate: g }], [0, 14, 2], [PI / 2, 0, 0]));
  root.add('upper_body', part([{ x: -3, y: -3, z: -3, w: 8, h: 6, d: 7, u: 21, v: 0, inflate: g }], [-1, 14, -3], [PI / 2, 0, 0]));
  const leg: Cube = { x: 0, y: 0, z: -1, w: 2, h: 8, d: 2, u: 0, v: 18, inflate: g };
  root.add('right_hind_leg', part([leg], [-2.5, 16, 7]));
  root.add('left_hind_leg', part([leg], [0.5, 16, 7]));
  root.add('right_front_leg', part([leg], [-2.5, 16, -4]));
  root.add('left_front_leg', part([leg], [0.5, 16, -4]));
  const tail = part([], [-1, 12, 8], [PI / 5, 0, 0]);
  tail.add('real_tail', part([{ x: 0, y: 0, z: -1, w: 2, h: 8, d: 2, u: 9, v: 18, inflate: g }]));
  root.add('tail', tail);
  return { root, texW: 64, texH: 32, baby: { headParts: ['head'], scaleHead: false, yHead: 5, zHead: 2, headScale: 2, bodyScale: 2, bodyY: 24 } };
}

export interface WolfPose {
  limbSwing: number;
  limbAmount: number;
  headYaw: number;
  headPitch: number;
  angry: boolean;
  sitting: boolean;
  /** vanilla Wolf.getTailAngle */
  tailAngle: number;
  /** vanilla Wolf.getHeadRollAngle */
  headRoll: number;
  /** vanilla Wolf.getBodyRollAngle at an offset along the body */
  bodyRoll: (offset: number) => number;
}

/** vanilla WolfModel.prepareMobModel + setupAnim */
export function animateWolf(root: ModelPart, s: WolfPose): void {
  root.resetPose();
  const head = root.child('head'), realHead = head.child('real_head');
  const body = root.child('body'), upper = root.child('upper_body');
  const tail = root.child('tail'), realTail = tail.child('real_tail');
  const rh = root.child('right_hind_leg'), lh = root.child('left_hind_leg'), rf = root.child('right_front_leg'), lf = root.child('left_front_leg');
  const set = (p: ModelPart, x: number, y: number, z: number) => {
    p.x = x;
    p.y = y;
    p.z = z;
  };
  tail.yRot = s.angry ? 0 : Math.cos(s.limbSwing * 0.6662) * 1.4 * s.limbAmount;
  if (s.sitting) {
    set(upper, -1, 16, -3);
    upper.xRot = 1.2566371;
    upper.yRot = 0;
    set(body, 0, 18, 0);
    body.xRot = PI / 4;
    set(tail, -1, 21, 6);
    set(rh, -2.5, 22.7, 2);
    rh.xRot = (PI * 3) / 2;
    set(lh, 0.5, 22.7, 2);
    lh.xRot = (PI * 3) / 2;
    rf.xRot = 5.811947;
    set(rf, -2.49, 17, -4);
    lf.xRot = 5.811947;
    set(lf, 0.51, 17, -4);
  } else {
    const a = Math.cos(s.limbSwing * 0.6662) * 1.4 * s.limbAmount, b = Math.cos(s.limbSwing * 0.6662 + PI) * 1.4 * s.limbAmount;
    rh.xRot = a;
    lh.xRot = b;
    rf.xRot = b;
    lf.xRot = a;
  }
  realHead.zRot = s.headRoll + s.bodyRoll(0);
  upper.zRot = s.bodyRoll(-0.08);
  body.zRot = s.bodyRoll(-0.16);
  realTail.zRot = s.bodyRoll(-0.2);
  head.xRot = (s.headPitch * PI) / 180;
  head.yRot = (s.headYaw * PI) / 180;
  tail.xRot = s.tailAngle;
}
