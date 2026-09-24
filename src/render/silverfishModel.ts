// The silverfish's model (vanilla SilverfishModel, 64x32): seven body segments nose to tail, each a box sitting on
// the ground, and three bristle layers over segments 2, 4 and 1. It wriggles all the time, whether it walks or not:
// each segment swings side to side and turns, the swing growing away from the third segment.

import { ModelPart } from './model';
import type { MobModelDef } from './mobModels';

const PI = Math.PI;
/** vanilla SilverfishModel.BODY_SIZES and BODY_TEXS */
const SIZES: [number, number, number][] = [[3, 2, 2], [4, 3, 2], [6, 4, 3], [3, 3, 3], [2, 2, 3], [2, 1, 2], [1, 1, 2]];
const TEXS: [number, number][] = [[0, 0], [0, 4], [0, 9], [0, 16], [0, 22], [11, 0], [13, 4]];

/** vanilla SilverfishModel.createBodyLayer */
export function silverfishModel(): MobModelDef {
  const root = new ModelPart();
  const zs: number[] = [];
  let f = -3.5;
  for (let i = 0; i < 7; i++) {
    const [w, h, d] = SIZES[i], [u, v] = TEXS[i];
    root.add(`segment${i}`, new ModelPart([{ x: w * -0.5, y: 0, z: d * -0.5, w, h, d, u, v }], [0, 24 - h, f]));
    zs[i] = f;
    if (i < 6) f += (d + SIZES[i + 1][2]) * 0.5;
  }
  root.add('layer0', new ModelPart([{ x: -5, y: 0, z: SIZES[2][2] * -0.5, w: 10, h: 8, d: SIZES[2][2], u: 20, v: 0 }], [0, 16, zs[2]]));
  root.add('layer1', new ModelPart([{ x: -3, y: 0, z: SIZES[4][2] * -0.5, w: 6, h: 4, d: SIZES[4][2], u: 20, v: 11 }], [0, 20, zs[4]]));
  root.add('layer2', new ModelPart([{ x: -3, y: 0, z: SIZES[4][2] * -0.5, w: 6, h: 5, d: SIZES[1][2], u: 20, v: 18 }], [0, 19, zs[1]]));
  return { root, texW: 64, texH: 32 };
}

/** vanilla SilverfishModel.setupAnim */
export function animateSilverfish(root: ModelPart, age: number): void {
  root.resetPose();
  const seg = (i: number) => root.child(`segment${i}`);
  for (let i = 0; i < 7; i++) {
    const p = seg(i), a = age * 0.9 + i * 0.15 * PI;
    p.yRot = Math.cos(a) * PI * 0.05 * (1 + Math.abs(i - 2));
    p.x = Math.sin(a) * PI * 0.2 * Math.abs(i - 2);
  }
  const l0 = root.child('layer0'), l1 = root.child('layer1'), l2 = root.child('layer2');
  l0.yRot = seg(2).yRot;
  l1.yRot = seg(4).yRot;
  l1.x = seg(4).x;
  l2.yRot = seg(1).yRot;
  l2.x = seg(1).x;
}
