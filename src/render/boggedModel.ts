// (trial chambers) The bogged's models (1.21; vanilla BoggedModel and ModelLayers.BOGGED_OUTER_LAYER): the skeleton's,
// with a crop of mushrooms on its head (two red ones crossed at the back right of its crown, two brown at the front
// left, and two more brown growing out of the back of its skull, each a pair of flat sprites crossed at right angles),
// which go when it's sheared; and over it its moss (vanilla SkeletonClothingLayer), on the humanoid mesh a fifth of a
// pixel bigger all round. Both on 64x32 textures (textures/bogged.ts).

import { ModelPart, type Cube } from './model';
import { skeletonModel, type MobModelDef } from './mobModels';

const PI = Math.PI;

/** vanilla BoggedModel.createBodyLayer: SkeletonModel.createDefaultSkeletonMesh and the head's "mushrooms" */
export function boggedModel(): MobModelDef {
  const def = skeletonModel();
  const mushrooms = def.root.child('head').add('mushrooms', new ModelPart());
  // (each one a 6x4 sprite with no depth: its front at u..u+6 and its back beside it at u+6..u+12)
  const sprite = (u: number, v: number, y: number): Cube => ({ x: -3, y, z: 0, w: 6, h: 4, d: 0, u, v });
  const add = (name: string, c: Cube, pivot: [number, number, number], rot: [number, number, number]) => mushrooms.add(name, new ModelPart([c], pivot, rot));
  add('red_mushroom_1', sprite(50, 16, -3), [3, -8, 3], [0, PI / 4, 0]);
  add('red_mushroom_2', sprite(50, 16, -3), [3, -8, 3], [0, (PI * 3) / 4, 0]);
  add('brown_mushroom_1', sprite(50, 22, -3), [-3, -8, -3], [0, PI / 4, 0]);
  add('brown_mushroom_2', sprite(50, 22, -3), [-3, -8, -3], [0, (PI * 3) / 4, 0]);
  add('brown_mushroom_3', sprite(50, 28, -4), [-2, -1, 4], [-PI / 2, 0, PI / 4]);
  add('brown_mushroom_4', sprite(50, 28, -4), [-2, -1, 4], [-PI / 2, 0, (PI * 3) / 4]);
  return def;
}

/**
 * vanilla ModelLayers.BOGGED_OUTER_LAYER (HumanoidModel.createMesh(CubeDeformation(0.2)) on 64x32): the humanoid mesh
 * a fifth of a pixel bigger (the hat seven tenths), its limbs as wide as a zombie's so the moss hangs round the
 * bones; posed as the bones are
 */
export function boggedOuterModel(): MobModelDef {
  const g = 0.2;
  const root = new ModelPart();
  const head = root.add('head', new ModelPart([{ x: -4, y: -8, z: -4, w: 8, h: 8, d: 8, u: 0, v: 0, inflate: g }]));
  head.add('hat', new ModelPart([{ x: -4, y: -8, z: -4, w: 8, h: 8, d: 8, u: 32, v: 0, inflate: g + 0.5 }]));
  root.add('body', new ModelPart([{ x: -4, y: 0, z: -2, w: 8, h: 12, d: 4, u: 16, v: 16, inflate: g }]));
  root.add('right_arm', new ModelPart([{ x: -3, y: -2, z: -2, w: 4, h: 12, d: 4, u: 40, v: 16, inflate: g }], [-5, 2, 0]));
  root.add('left_arm', new ModelPart([{ x: -1, y: -2, z: -2, w: 4, h: 12, d: 4, u: 40, v: 16, mirror: true, inflate: g }], [5, 2, 0]));
  root.add('right_leg', new ModelPart([{ x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 16, inflate: g }], [-1.9, 12, 0]));
  root.add('left_leg', new ModelPart([{ x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 16, mirror: true, inflate: g }], [1.9, 12, 0]));
  return { root, texW: 64, texH: 32 };
}
