// Mob models (vanilla LayerDefinitions) and their setupAnim animations.

import { ModelPart, Cube, sitHumanoid, animateCrossbowCharge, animateCrossbowHold } from './model';

export { animateCrossbowCharge, animateCrossbowHold };

const PI = Math.PI;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

export interface MobModelDef {
  root: ModelPart;
  texW: number;
  texH: number;
  /** vanilla AgeableListModel baby rendering */
  baby?: { headParts: string[]; scaleHead: boolean; yHead: number; zHead: number; headScale: number; bodyScale: number; bodyY: number };
}

// ---------------------------------------------------------------------------
// quadrupeds

function quadruped(legHeight: number, head: ModelPart, body: ModelPart, legPos: [number, number, number][], legCube: Cube): ModelPart {
  const root = new ModelPart();
  root.add('head', head);
  root.add('body', body);
  const names = ['right_hind_leg', 'left_hind_leg', 'right_front_leg', 'left_front_leg'];
  names.forEach((n, i) => root.add(n, part([legCube], legPos[i])));
  void legHeight;
  return root;
}

export function pigModel(): MobModelDef {
  const head = part([{ x: -4, y: -4, z: -8, w: 8, h: 8, d: 8, u: 0, v: 0 }, { x: -2, y: 0, z: -9, w: 4, h: 3, d: 1, u: 16, v: 16 }], [0, 12, -6]);
  const body = part([{ x: -5, y: -10, z: -7, w: 10, h: 16, d: 8, u: 28, v: 8 }], [0, 11, 2], [PI / 2, 0, 0]);
  const root = quadruped(6, head, body, [[-3, 18, 7], [3, 18, 7], [-3, 18, -5], [3, 18, -5]], { x: -2, y: 0, z: -2, w: 4, h: 6, d: 4, u: 0, v: 16 });
  return { root, texW: 64, texH: 32, baby: { headParts: ['head'], scaleHead: false, yHead: 4, zHead: 4, headScale: 2, bodyScale: 2, bodyY: 24 } };
}

export function cowModel(): MobModelDef {
  const head = part(
    [
      { x: -4, y: -4, z: -6, w: 8, h: 8, d: 6, u: 0, v: 0 },
      { x: -5, y: -5, z: -4, w: 1, h: 3, d: 1, u: 22, v: 0 },
      { x: 4, y: -5, z: -4, w: 1, h: 3, d: 1, u: 22, v: 0 },
    ],
    [0, 4, -8],
  );
  const body = part([{ x: -6, y: -10, z: -7, w: 12, h: 18, d: 10, u: 18, v: 4 }, { x: -2, y: 2, z: -8, w: 4, h: 6, d: 1, u: 52, v: 0 }], [0, 5, 2], [PI / 2, 0, 0]);
  const root = quadruped(12, head, body, [[-4, 12, 7], [4, 12, 7], [-4, 12, -6], [4, 12, -6]], { x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 16 });
  return { root, texW: 64, texH: 32, baby: { headParts: ['head'], scaleHead: false, yHead: 10, zHead: 4, headScale: 2, bodyScale: 2, bodyY: 24 } };
}

export function sheepModel(): MobModelDef {
  const head = part([{ x: -3, y: -4, z: -6, w: 6, h: 6, d: 8, u: 0, v: 0 }], [0, 6, -8]);
  const body = part([{ x: -4, y: -10, z: -7, w: 8, h: 16, d: 6, u: 28, v: 8 }], [0, 5, 2], [PI / 2, 0, 0]);
  const root = quadruped(12, head, body, [[-3, 12, 7], [3, 12, 7], [-3, 12, -5], [3, 12, -5]], { x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 16 });
  return { root, texW: 64, texH: 32, baby: { headParts: ['head'], scaleHead: false, yHead: 8, zHead: 4, headScale: 2, bodyScale: 2, bodyY: 24 } };
}

export function sheepFurModel(): MobModelDef {
  const head = part([{ x: -3, y: -4, z: -4, w: 6, h: 6, d: 6, u: 0, v: 0, inflate: 0.6 }], [0, 6, -8]);
  const body = part([{ x: -4, y: -10, z: -7, w: 8, h: 16, d: 6, u: 28, v: 8, inflate: 1.75 }], [0, 5, 2], [PI / 2, 0, 0]);
  const root = quadruped(12, head, body, [[-3, 12, 7], [3, 12, 7], [-3, 12, -5], [3, 12, -5]], { x: -2, y: 0, z: -2, w: 4, h: 6, d: 4, u: 0, v: 16, inflate: 0.5 });
  return { root, texW: 64, texH: 32, baby: { headParts: ['head'], scaleHead: false, yHead: 8, zHead: 4, headScale: 2, bodyScale: 2, bodyY: 24 } };
}

/** vanilla QuadrupedModel.setupAnim */
export function animateQuadruped(root: ModelPart, limbSwing: number, limbAmount: number, headYaw: number, headPitch: number): void {
  root.resetPose();
  const head = root.child('head');
  head.xRot = (headPitch * PI) / 180;
  head.yRot = (headYaw * PI) / 180;
  root.child('right_hind_leg').xRot = Math.cos(limbSwing * 0.6662) * 1.4 * limbAmount;
  root.child('left_hind_leg').xRot = Math.cos(limbSwing * 0.6662 + PI) * 1.4 * limbAmount;
  root.child('right_front_leg').xRot = Math.cos(limbSwing * 0.6662 + PI) * 1.4 * limbAmount;
  root.child('left_front_leg').xRot = Math.cos(limbSwing * 0.6662) * 1.4 * limbAmount;
}

// ---------------------------------------------------------------------------

export function chickenModel(): MobModelDef {
  const root = new ModelPart();
  root.add('head', part([{ x: -2, y: -6, z: -2, w: 4, h: 6, d: 3, u: 0, v: 0 }], [0, 15, -4]));
  root.add('beak', part([{ x: -2, y: -4, z: -4, w: 4, h: 2, d: 2, u: 14, v: 0 }], [0, 15, -4]));
  root.add('red_thing', part([{ x: -1, y: -2, z: -3, w: 2, h: 2, d: 2, u: 14, v: 4 }], [0, 15, -4]));
  root.add('body', part([{ x: -3, y: -4, z: -3, w: 6, h: 8, d: 6, u: 0, v: 9 }], [0, 16, 0], [PI / 2, 0, 0]));
  const leg: Cube = { x: -1, y: 0, z: -3, w: 3, h: 5, d: 3, u: 26, v: 0 };
  root.add('right_leg', part([leg], [-2, 19, 1]));
  root.add('left_leg', part([leg], [1, 19, 1]));
  root.add('right_wing', part([{ x: 0, y: 0, z: -3, w: 1, h: 4, d: 6, u: 24, v: 13 }], [-4, 13, 0]));
  root.add('left_wing', part([{ x: -1, y: 0, z: -3, w: 1, h: 4, d: 6, u: 24, v: 13 }], [4, 13, 0]));
  return { root, texW: 64, texH: 32, baby: { headParts: ['head', 'beak', 'red_thing'], scaleHead: true, yHead: 5, zHead: 2, headScale: 2, bodyScale: 2, bodyY: 24 } };
}

/** vanilla ChickenModel.setupAnim; `bob` = (sin(flap)+1)*flapSpeed */
export function animateChicken(root: ModelPart, limbSwing: number, limbAmount: number, bob: number, headYaw: number, headPitch: number): void {
  root.resetPose();
  const head = root.child('head');
  head.xRot = (headPitch * PI) / 180;
  head.yRot = (headYaw * PI) / 180;
  for (const n of ['beak', 'red_thing']) {
    root.child(n).xRot = head.xRot;
    root.child(n).yRot = head.yRot;
  }
  root.child('right_leg').xRot = Math.cos(limbSwing * 0.6662) * 1.4 * limbAmount;
  root.child('left_leg').xRot = Math.cos(limbSwing * 0.6662 + PI) * 1.4 * limbAmount;
  root.child('right_wing').zRot = bob;
  root.child('left_wing').zRot = -bob;
}

// ---------------------------------------------------------------------------
// humanoids

export function zombieModel(): MobModelDef {
  const root = new ModelPart();
  const head = root.add('head', part([{ x: -4, y: -8, z: -4, w: 8, h: 8, d: 8, u: 0, v: 0 }]));
  head.add('hat', part([{ x: -4, y: -8, z: -4, w: 8, h: 8, d: 8, u: 32, v: 0, inflate: 0.5 }]));
  root.add('body', part([{ x: -4, y: 0, z: -2, w: 8, h: 12, d: 4, u: 16, v: 16 }]));
  root.add('right_arm', part([{ x: -3, y: -2, z: -2, w: 4, h: 12, d: 4, u: 40, v: 16 }], [-5, 2, 0]));
  root.add('left_arm', part([{ x: -1, y: -2, z: -2, w: 4, h: 12, d: 4, u: 40, v: 16, mirror: true }], [5, 2, 0]));
  root.add('right_leg', part([{ x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 16 }], [-1.9, 12, 0]));
  root.add('left_leg', part([{ x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 16, mirror: true }], [1.9, 12, 0]));
  return { root, texW: 64, texH: 64, baby: { headParts: ['head'], scaleHead: true, yHead: 16, zHead: 0, headScale: 2, bodyScale: 2, bodyY: 24 } };
}

/**
 * vanilla GhastModel.createBodyLayer: a 16-block cube of a body and nine 2x2 tentacles under it, their lengths
 * those RandomSource.create(1660) deals out (nextInt(7) + 8)
 */
const GHAST_TENTACLES = [8, 13, 9, 11, 11, 10, 12, 9, 12];
export function ghastModel(): MobModelDef {
  const root = new ModelPart();
  root.add('body', part([{ x: -8, y: -8, z: -8, w: 16, h: 16, d: 16, u: 0, v: 0 }], [0, 17.6, 0]));
  for (let i = 0; i < 9; i++) {
    const f = (((i % 3) - (Math.floor(i / 3) % 2) * 0.5 + 0.25) / 2 * 2 - 1) * 5;
    const g = (Math.floor(i / 3) / 2 * 2 - 1) * 5;
    root.add('tentacle' + i, part([{ x: -1, y: 0, z: -1, w: 2, h: GHAST_TENTACLES[i], d: 2, u: 0, v: 0 }], [f, 24.6, g]));
  }
  return { root, texW: 64, texH: 32 };
}

/** vanilla GhastModel.setupAnim: the tentacles sway, each a step behind the last */
export function animateGhast(root: ModelPart, age: number): void {
  for (let i = 0; i < 9; i++) root.child('tentacle' + i).xRot = 0.2 * Math.sin(age * 0.3 + i) + 0.4;
}

/** vanilla BlazeModel: the head, and twelve rods set out in a ring (setupAnim sorts them into three) */
export function blazeModel(): MobModelDef {
  const root = new ModelPart();
  root.add('head', part([{ x: -4, y: -4, z: -4, w: 8, h: 8, d: 8, u: 0, v: 0 }]));
  for (let i = 0; i < 12; i++) root.add('part' + i, part([{ x: 0, y: 0, z: 0, w: 2, h: 8, d: 2, u: 0, v: 16 }], [Math.cos(i) * 9, -2 + Math.cos(i * 2 * 0.25), Math.sin(i) * 9]));
  return { root, texW: 64, texH: 32 };
}

/**
 * vanilla BlazeModel.setupAnim: three rings of four rods, each ring turning its own way at its own pace (wide at the
 * top, narrow at the bottom), every rod bobbing; the head follows the look
 */
export function animateBlaze(root: ModelPart, age: number, headYaw: number, headPitch: number): void {
  const ring = (from: number, radius: number, start: number, y: (i: number) => number) => {
    let f = start;
    for (let i = from; i < from + 4; i++) {
      const r = root.child('part' + i);
      r.y = y(i);
      r.x = Math.cos(f) * radius;
      r.z = Math.sin(f) * radius;
      f += PI / 2;
    }
  };
  ring(0, 9, age * PI * -0.1, (i) => -2 + Math.cos((i * 2 + age) * 0.25));
  ring(4, 7, PI / 4 + age * PI * 0.03, (i) => 2 + Math.cos((i * 2 + age) * 0.25));
  ring(8, 5, 0.47123894 + age * PI * -0.05, (i) => 11 + Math.cos((i * 1.5 + age) * 0.5));
  const head = root.child('head');
  head.yRot = (headYaw * PI) / 180;
  head.xRot = (headPitch * PI) / 180;
}

/**
 * vanilla PiglinModel.createMesh: PlayerModel's body and limbs (wide arms; the jacket, sleeve and trouser layers
 * are left out) under the broad piglin head, with its snout, two tusks and floppy ears
 */
export function piglinModel(): MobModelDef {
  const root = new ModelPart();
  const head = root.add('head', part([
    { x: -5, y: -8, z: -4, w: 10, h: 8, d: 8, u: 0, v: 0 },
    { x: -2, y: -4, z: -5, w: 4, h: 4, d: 1, u: 31, v: 1 },
    { x: 2, y: -2, z: -5, w: 1, h: 2, d: 1, u: 2, v: 4 },
    { x: -3, y: -2, z: -5, w: 1, h: 2, d: 1, u: 2, v: 0 },
  ]));
  head.add('left_ear', part([{ x: 0, y: 0, z: -2, w: 1, h: 5, d: 4, u: 51, v: 6 }], [4.5, -6, 0], [0, 0, -PI / 6]));
  head.add('right_ear', part([{ x: -1, y: 0, z: -2, w: 1, h: 5, d: 4, u: 39, v: 6 }], [-4.5, -6, 0], [0, 0, PI / 6]));
  root.add('body', part([{ x: -4, y: 0, z: -2, w: 8, h: 12, d: 4, u: 16, v: 16 }]));
  root.add('right_arm', part([{ x: -3, y: -2, z: -2, w: 4, h: 12, d: 4, u: 40, v: 16 }], [-5, 2, 0]));
  root.add('left_arm', part([{ x: -1, y: -2, z: -2, w: 4, h: 12, d: 4, u: 32, v: 48 }], [5, 2, 0]));
  root.add('right_leg', part([{ x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 16 }], [-1.9, 12, 0]));
  root.add('left_leg', part([{ x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 16, v: 48 }], [1.9, 12, 0]));
  return { root, texW: 64, texH: 64, baby: { headParts: ['head'], scaleHead: true, yHead: 16, zHead: 0, headScale: 2, bodyScale: 2, bodyY: 24 } };
}

/** vanilla PiglinModel.setupAnim: the ears flap with every step and a slow idle sway */
export function animatePiglinEars(root: ModelPart, limbSwing: number, limbAmount: number, age: number): void {
  const g = age * 0.1 + limbSwing * 0.5, h = 0.08 + limbAmount * 0.4;
  const head = root.child('head');
  head.child('left_ear').zRot = -PI / 6 - Math.cos(g * 1.2) * h;
  head.child('right_ear').zRot = PI / 6 + Math.cos(g) * h;
}

/**
 * vanilla HoglinModel.createBodyLayer (the zoglin wears it too): a long head hung at 50° with two tusks and two
 * flat ears, a deep body with a flat mane of bristles along the spine, stout legs. Babies: AgeableListModel(true, 8,
 * 6, 1.9, 2, 24)
 */
export function hoglinModel(): MobModelDef {
  const root = new ModelPart();
  const body = root.add('body', part([{ x: -8, y: -7, z: -13, w: 16, h: 14, d: 26, u: 1, v: 1 }], [0, 7, 0]));
  body.add('mane', part([{ x: 0, y: 0, z: -9, w: 0, h: 10, d: 19, u: 90, v: 33, inflate: 0.001 }], [0, -14, -5]));
  const head = root.add('head', part([{ x: -7, y: -3, z: -19, w: 14, h: 6, d: 19, u: 61, v: 1 }], [0, 2, -12], [0.87266463, 0, 0]));
  head.add('right_ear', part([{ x: -6, y: -1, z: -2, w: 6, h: 1, d: 4, u: 1, v: 1 }], [-6, -2, -3], [0, 0, -0.6981317]));
  head.add('left_ear', part([{ x: 0, y: -1, z: -2, w: 6, h: 1, d: 4, u: 1, v: 6 }], [6, -2, -3], [0, 0, 0.6981317]));
  head.add('right_horn', part([{ x: -1, y: -11, z: -1, w: 2, h: 11, d: 2, u: 10, v: 13 }], [-7, 2, -12]));
  head.add('left_horn', part([{ x: -1, y: -11, z: -1, w: 2, h: 11, d: 2, u: 1, v: 13 }], [7, 2, -12]));
  root.add('right_front_leg', part([{ x: -3, y: 0, z: -3, w: 6, h: 14, d: 6, u: 66, v: 42 }], [-4, 10, -8.5]));
  root.add('left_front_leg', part([{ x: -3, y: 0, z: -3, w: 6, h: 14, d: 6, u: 41, v: 42 }], [4, 10, -8.5]));
  root.add('right_hind_leg', part([{ x: -2.5, y: 0, z: -2.5, w: 5, h: 11, d: 5, u: 21, v: 45 }], [-5, 13, 10]));
  root.add('left_hind_leg', part([{ x: -2.5, y: 0, z: -2.5, w: 5, h: 11, d: 5, u: 0, v: 45 }], [5, 13, 10]));
  return { root, texW: 128, texH: 64, baby: { headParts: ['head'], scaleHead: true, yHead: 8, zHead: 6, headScale: 1.9, bodyScale: 2, bodyY: 24 } };
}

/**
 * vanilla HoglinModel.setupAnim: the ears flap with the stride, and through the 10 ticks of a strike the head
 * swings from its 50° hang up to -20° and back (a baby's also drops from y 2 to 5)
 */
export function animateHoglin(root: ModelPart, limbSwing: number, limbAmount: number, headYaw: number, attackTicks: number, baby: boolean): void {
  root.resetPose();
  const head = root.child('head');
  head.child('right_ear').zRot = -PI * 2 / 9 - limbAmount * Math.sin(limbSwing);
  head.child('left_ear').zRot = PI * 2 / 9 + limbAmount * Math.sin(limbSwing);
  head.yRot = (headYaw * PI) / 180;
  const f = 1 - Math.abs(10 - 2 * attackTicks) / 10;
  head.xRot = 0.87266463 + (-PI / 9 - 0.87266463) * f;
  const mane = root.child('body').child('mane');
  if (baby) {
    head.y = 2 + 3 * f;
    mane.z = -3;
  } else {
    head.y = 2;
    mane.z = -7;
  }
  const rf = root.child('right_front_leg'), lf = root.child('left_front_leg');
  rf.xRot = Math.cos(limbSwing) * 1.2 * limbAmount;
  lf.xRot = Math.cos(limbSwing + PI) * 1.2 * limbAmount;
  root.child('right_hind_leg').xRot = lf.xRot;
  root.child('left_hind_leg').xRot = rf.xRot;
}

export function skeletonModel(): MobModelDef {
  const root = new ModelPart();
  const head = root.add('head', part([{ x: -4, y: -8, z: -4, w: 8, h: 8, d: 8, u: 0, v: 0 }]));
  head.add('hat', part([{ x: -4, y: -8, z: -4, w: 8, h: 8, d: 8, u: 32, v: 0, inflate: 0.5 }]));
  root.add('body', part([{ x: -4, y: 0, z: -2, w: 8, h: 12, d: 4, u: 16, v: 16 }]));
  root.add('right_arm', part([{ x: -1, y: -2, z: -1, w: 2, h: 12, d: 2, u: 40, v: 16 }], [-5, 2, 0]));
  root.add('left_arm', part([{ x: -1, y: -2, z: -1, w: 2, h: 12, d: 2, u: 40, v: 16, mirror: true }], [5, 2, 0]));
  root.add('right_leg', part([{ x: -1, y: 0, z: -1, w: 2, h: 12, d: 2, u: 0, v: 16 }], [-2, 12, 0]));
  root.add('left_leg', part([{ x: -1, y: 0, z: -1, w: 2, h: 12, d: 2, u: 0, v: 16, mirror: true }], [2, 12, 0]));
  return { root, texW: 64, texH: 32 };
}

/**
 * the right arm's pose. The crossbow ones (vanilla PiglinArmPose / IllagerArmPose CROSSBOW_CHARGE and
 * CROSSBOW_HOLD) pose both arms; as in PiglinModel / IllagerModel they're applied after the rest of the
 * humanoid animation (the idle sway included), with animateHumanoidMob's `crossbowCharge` (0..1) for the draw
 */
export type ArmPose = 'empty' | 'item' | 'bow' | 'crossbow_charge' | 'crossbow_hold';

/** vanilla AnimationUtils.bobArms */
function bobArms(ra: ModelPart, la: ModelPart, age: number): void {
  ra.zRot += Math.cos(age * 0.09) * 0.05 + 0.05;
  la.zRot -= Math.cos(age * 0.09) * 0.05 + 0.05;
  ra.xRot += Math.sin(age * 0.067) * 0.05;
  la.xRot -= Math.sin(age * 0.067) * 0.05;
}

/** vanilla HumanoidModel.setupAnim (mob subset: walking, riding, arm poses, attack swing, idle bob) */
export function animateHumanoidMob(root: ModelPart, limbSwing: number, limbAmount: number, age: number, headYaw: number, headPitch: number, attackTime: number, rightPose: ArmPose, riding = false, crossbowCharge = 0): void {
  root.resetPose();
  const head = root.child('head'), body = root.child('body');
  const ra = root.child('right_arm'), la = root.child('left_arm'), rl = root.child('right_leg'), ll = root.child('left_leg');
  head.yRot = (headYaw * PI) / 180;
  head.xRot = (headPitch * PI) / 180;
  ra.xRot = Math.cos(limbSwing * 0.6662 + PI) * 2 * limbAmount * 0.5;
  la.xRot = Math.cos(limbSwing * 0.6662) * 2 * limbAmount * 0.5;
  rl.xRot = Math.cos(limbSwing * 0.6662) * 1.4 * limbAmount;
  ll.xRot = Math.cos(limbSwing * 0.6662 + PI) * 1.4 * limbAmount;
  rl.yRot = 0.005;
  ll.yRot = -0.005;
  rl.zRot = 0.005;
  ll.zRot = -0.005;
  if (riding) sitHumanoid(ra, la, rl, ll);
  if (rightPose === 'item') {
    ra.xRot = ra.xRot * 0.5 - PI / 10;
    ra.yRot = 0;
  } else if (rightPose === 'bow') {
    ra.yRot = -0.1 + head.yRot;
    la.yRot = 0.1 + head.yRot + 0.4;
    ra.xRot = -PI / 2 + head.xRot;
    la.xRot = -PI / 2 + head.xRot;
  }
  if (attackTime > 0) {
    body.yRot = Math.sin(Math.sqrt(attackTime) * PI * 2) * 0.2;
    ra.z = Math.sin(body.yRot) * 5;
    ra.x = -Math.cos(body.yRot) * 5;
    la.z = -Math.sin(body.yRot) * 5;
    la.x = Math.cos(body.yRot) * 5;
    ra.yRot += body.yRot;
    la.yRot += body.yRot;
    la.xRot += body.yRot;
    let f = 1 - attackTime;
    f *= f;
    f *= f;
    f = 1 - f;
    const f1 = Math.sin(f * PI);
    const f2 = Math.sin(attackTime * PI) * -(head.xRot - 0.7) * 0.75;
    ra.xRot -= f1 * 1.2 + f2;
    ra.yRot += body.yRot * 2;
    ra.zRot += Math.sin(attackTime * PI) * -0.4;
  }
  if (rightPose !== 'bow') bobArms(ra, la, age);
  else {
    ra.zRot += Math.cos(age * 0.09) * 0.05 + 0.05;
    ra.xRot += Math.sin(age * 0.067) * 0.05;
    la.zRot -= Math.cos(age * 0.09) * 0.05 + 0.05;
    la.xRot -= Math.sin(age * 0.067) * 0.05;
  }
  if (rightPose === 'crossbow_charge') animateCrossbowCharge(ra, la, crossbowCharge);
  else if (rightPose === 'crossbow_hold') animateCrossbowHold(ra, la, head);
}

/** vanilla AnimationUtils.animateZombieArms */
export function animateZombieArms(root: ModelPart, aggressive: boolean, attackTime: number, age: number): void {
  const ra = root.child('right_arm'), la = root.child('left_arm');
  const f = Math.sin(attackTime * PI);
  const f1 = Math.sin((1 - (1 - attackTime) * (1 - attackTime)) * PI);
  ra.zRot = 0;
  la.zRot = 0;
  ra.yRot = -(0.1 - f * 0.6);
  la.yRot = 0.1 - f * 0.6;
  const f2 = -PI / (aggressive ? 1.5 : 2.25);
  ra.xRot = f2;
  la.xRot = f2;
  ra.xRot += f * 1.2 - f1 * 0.4;
  la.xRot += f * 1.2 - f1 * 0.4;
  bobArms(ra, la, age);
}

/** vanilla SkeletonModel melee arms (aggressive without a bow) */
export function animateSkeletonMelee(root: ModelPart, attackTime: number, age: number): void {
  const ra = root.child('right_arm'), la = root.child('left_arm');
  const f = Math.sin(attackTime * PI);
  const f1 = Math.sin((1 - (1 - attackTime) * (1 - attackTime)) * PI);
  ra.zRot = 0;
  la.zRot = 0;
  ra.yRot = -(0.1 - f * 0.6);
  la.yRot = 0.1 - f * 0.6;
  ra.xRot = -PI / 2;
  la.xRot = -PI / 2;
  ra.xRot -= f * 1.2 - f1 * 0.4;
  la.xRot -= f * 1.2 - f1 * 0.4;
  bobArms(ra, la, age);
}

// ---------------------------------------------------------------------------

export function creeperModel(): MobModelDef {
  const root = new ModelPart();
  root.add('head', part([{ x: -4, y: -8, z: -4, w: 8, h: 8, d: 8, u: 0, v: 0 }], [0, 6, 0]));
  root.add('body', part([{ x: -4, y: 0, z: -2, w: 8, h: 12, d: 4, u: 16, v: 16 }], [0, 6, 0]));
  const leg: Cube = { x: -2, y: 0, z: -2, w: 4, h: 6, d: 4, u: 0, v: 16 };
  root.add('right_hind_leg', part([leg], [-2, 18, 4]));
  root.add('left_hind_leg', part([leg], [2, 18, 4]));
  root.add('right_front_leg', part([leg], [-2, 18, -4]));
  root.add('left_front_leg', part([leg], [2, 18, -4]));
  return { root, texW: 64, texH: 32 };
}

export function animateCreeper(root: ModelPart, limbSwing: number, limbAmount: number, headYaw: number, headPitch: number): void {
  root.resetPose();
  const head = root.child('head');
  head.yRot = (headYaw * PI) / 180;
  head.xRot = (headPitch * PI) / 180;
  root.child('right_hind_leg').xRot = Math.cos(limbSwing * 0.6662) * 1.4 * limbAmount;
  root.child('left_hind_leg').xRot = Math.cos(limbSwing * 0.6662 + PI) * 1.4 * limbAmount;
  root.child('right_front_leg').xRot = Math.cos(limbSwing * 0.6662 + PI) * 1.4 * limbAmount;
  root.child('left_front_leg').xRot = Math.cos(limbSwing * 0.6662) * 1.4 * limbAmount;
}

// ---------------------------------------------------------------------------

const SPIDER_LEGS: [string, [number, number, number], [number, number, number], boolean][] = [
  ['right_hind_leg', [-4, 15, 2], [0, PI / 4, -PI / 4], false],
  ['left_hind_leg', [4, 15, 2], [0, -PI / 4, PI / 4], true],
  ['right_middle_hind_leg', [-4, 15, 1], [0, 0.3926991, -0.58119464], false],
  ['left_middle_hind_leg', [4, 15, 1], [0, -0.3926991, 0.58119464], true],
  ['right_middle_front_leg', [-4, 15, 0], [0, -0.3926991, -0.58119464], false],
  ['left_middle_front_leg', [4, 15, 0], [0, 0.3926991, 0.58119464], true],
  ['right_front_leg', [-4, 15, -1], [0, -PI / 4, -PI / 4], false],
  ['left_front_leg', [4, 15, -1], [0, PI / 4, PI / 4], true],
];

export function spiderModel(): MobModelDef {
  const root = new ModelPart();
  root.add('head', part([{ x: -4, y: -4, z: -8, w: 8, h: 8, d: 8, u: 32, v: 4 }], [0, 15, -3]));
  root.add('body0', part([{ x: -3, y: -3, z: -3, w: 6, h: 6, d: 6, u: 0, v: 0 }], [0, 15, 0]));
  root.add('body1', part([{ x: -5, y: -4, z: -6, w: 10, h: 8, d: 12, u: 0, v: 12 }], [0, 15, 9]));
  for (const [n, p, r, left] of SPIDER_LEGS) {
    const c: Cube = left ? { x: -1, y: -1, z: -1, w: 16, h: 2, d: 2, u: 18, v: 0, mirror: true } : { x: -15, y: -1, z: -1, w: 16, h: 2, d: 2, u: 18, v: 0 };
    root.add(n, part([c], p, r));
  }
  return { root, texW: 64, texH: 32 };
}

/** vanilla SpiderModel.setupAnim */
export function animateSpider(root: ModelPart, limbSwing: number, limbAmount: number, headYaw: number, headPitch: number): void {
  root.resetPose();
  const head = root.child('head');
  head.yRot = (headYaw * PI) / 180;
  head.xRot = (headPitch * PI) / 180;
  const c = (o: number) => -(Math.cos(limbSwing * 0.6662 * 2 + o) * 0.4) * limbAmount;
  const s = (o: number) => Math.abs(Math.sin(limbSwing * 0.6662 + o) * 0.4) * limbAmount;
  const f3 = c(0), f4 = c(PI), f5 = c(PI / 2), f6 = c(PI * 1.5);
  const f7 = s(0), f8 = s(PI), f9 = s(PI / 2), f10 = s(PI * 1.5);
  const L = (n: string) => root.child(n);
  L('right_hind_leg').yRot += f3;
  L('left_hind_leg').yRot += -f3;
  L('right_middle_hind_leg').yRot += f4;
  L('left_middle_hind_leg').yRot += -f4;
  L('right_middle_front_leg').yRot += f5;
  L('left_middle_front_leg').yRot += -f5;
  L('right_front_leg').yRot += f6;
  L('left_front_leg').yRot += -f6;
  L('right_hind_leg').zRot += f7;
  L('left_hind_leg').zRot += -f7;
  L('right_middle_hind_leg').zRot += f8;
  L('left_middle_hind_leg').zRot += -f8;
  L('right_middle_front_leg').zRot += f9;
  L('left_middle_front_leg').zRot += -f9;
  L('right_front_leg').zRot += f10;
  L('left_front_leg').zRot += -f10;
}

// ---------------------------------------------------------------------------
// enderman (HumanoidModel with long limbs; "hat" is the jaw)

export function endermanModel(): MobModelDef {
  const root = new ModelPart();
  root.add('hat', part([{ x: -4, y: -8, z: -4, w: 8, h: 8, d: 8, u: 0, v: 16, inflate: -0.5 }], [0, -13, 0]));
  root.add('head', part([{ x: -4, y: -8, z: -4, w: 8, h: 8, d: 8, u: 0, v: 0 }], [0, -13, 0]));
  root.add('body', part([{ x: -4, y: 0, z: -2, w: 8, h: 12, d: 4, u: 32, v: 16 }], [0, -14, 0]));
  root.add('right_arm', part([{ x: -1, y: -2, z: -1, w: 2, h: 30, d: 2, u: 56, v: 0 }], [-5, -12, 0]));
  root.add('left_arm', part([{ x: -1, y: -2, z: -1, w: 2, h: 30, d: 2, u: 56, v: 0, mirror: true }], [5, -12, 0]));
  root.add('right_leg', part([{ x: -1, y: 0, z: -1, w: 2, h: 30, d: 2, u: 56, v: 0 }], [-2, -5, 0]));
  root.add('left_leg', part([{ x: -1, y: 0, z: -1, w: 2, h: 30, d: 2, u: 56, v: 0, mirror: true }], [2, -5, 0]));
  return { root, texW: 64, texH: 32 };
}

/** vanilla EndermanModel.setupAnim (on top of HumanoidModel) */
export function animateEnderman(root: ModelPart, limbSwing: number, limbAmount: number, age: number, headYaw: number, headPitch: number, attackTime: number, carrying: boolean, creepy: boolean): void {
  animateHumanoidMob(root, limbSwing, limbAmount, age, headYaw, headPitch, attackTime, 'empty');
  const head = root.child('head'), hat = root.child('hat'), body = root.child('body');
  const ra = root.child('right_arm'), la = root.child('left_arm'), rl = root.child('right_leg'), ll = root.child('left_leg');
  body.xRot = 0;
  body.y = -14;
  body.z = 0;
  ra.xRot *= 0.5;
  la.xRot *= 0.5;
  rl.xRot *= 0.5;
  ll.xRot *= 0.5;
  const clampR = (p: ModelPart) => (p.xRot = Math.max(-0.4, Math.min(0.4, p.xRot)));
  clampR(ra);
  clampR(la);
  clampR(rl);
  clampR(ll);
  if (carrying) {
    ra.xRot = -0.5;
    la.xRot = -0.5;
    ra.zRot = 0.05;
    la.zRot = -0.05;
  }
  rl.z = 0;
  ll.z = 0;
  rl.y = -5;
  ll.y = -5;
  head.z = 0;
  head.y = -13;
  hat.x = head.x;
  hat.y = head.y;
  hat.z = head.z;
  hat.xRot = head.xRot;
  hat.yRot = head.yRot;
  hat.zRot = head.zRot;
  if (creepy) head.y -= 5;
  ra.x = -5;
  ra.y = -12;
  ra.z = 0;
  la.x = 5;
  la.y = -12;
  la.z = 0;
}

// ---------------------------------------------------------------------------

export function squidModel(): MobModelDef {
  const root = new ModelPart();
  root.add('body', part([{ x: -6, y: -8, z: -6, w: 12, h: 16, d: 12, u: 0, v: 0 }], [0, 8, 0]));
  for (let i = 0; i < 8; i++) {
    const d0 = (i * Math.PI * 2) / 8;
    const x = Math.cos(d0) * 5, z = Math.sin(d0) * 5;
    const yRot = (i * Math.PI * -2) / 8 + Math.PI / 2;
    root.add('tentacle' + i, part([{ x: -1, y: 0, z: -1, w: 2, h: 18, d: 2, u: 48, v: 0 }], [x, 15, z], [0, yRot, 0]));
  }
  return { root, texW: 64, texH: 32 };
}

export function animateSquid(root: ModelPart, tentacleAngle: number): void {
  root.resetPose();
  for (let i = 0; i < 8; i++) root.child('tentacle' + i).xRot = tentacleAngle;
}

export function slimeInnerModel(): MobModelDef {
  const root = new ModelPart();
  root.add('cube', part([{ x: -3, y: 17, z: -3, w: 6, h: 6, d: 6, u: 0, v: 16 }]));
  root.add('right_eye', part([{ x: -3.25, y: 18, z: -3.5, w: 2, h: 2, d: 2, u: 32, v: 0 }]));
  root.add('left_eye', part([{ x: 1.25, y: 18, z: -3.5, w: 2, h: 2, d: 2, u: 32, v: 4 }]));
  root.add('mouth', part([{ x: 0, y: 21, z: -3.5, w: 1, h: 1, d: 1, u: 32, v: 8 }]));
  return { root, texW: 64, texH: 32 };
}

export function slimeOuterModel(): MobModelDef {
  const root = new ModelPart();
  root.add('cube', part([{ x: -4, y: 16, z: -4, w: 8, h: 8, d: 8, u: 0, v: 0 }]));
  return { root, texW: 64, texH: 32 };
}

/**
 * vanilla LavaSlimeModel.createBodyLayer: eight 8x1x8 slices round a 4x4x4 core; the slices are textured from
 * overlapping strips, the eyes' two rows (2 and 3) from their own corner of the sheet
 */
export function magmaCubeModel(): MobModelDef {
  const root = new ModelPart();
  for (let i = 0; i < 8; i++) {
    const [u, v] = i === 2 ? [24, 10] : i === 3 ? [24, 19] : [0, i];
    root.add('cube' + i, part([{ x: -4, y: 16 + i, z: -4, w: 8, h: 1, d: 8, u, v }]));
  }
  root.add('inside_cube', part([{ x: -2, y: 18, z: -2, w: 4, h: 4, d: 4, u: 0, v: 16 }]));
  return { root, texW: 64, texH: 32 };
}

/** vanilla LavaSlimeModel.prepareMobModel: the slices fan apart while it's stretched in a jump */
export function animateMagmaCube(root: ModelPart, squish: number): void {
  const f = Math.max(0, squish);
  for (let i = 0; i < 8; i++) root.child('cube' + i).y = -(4 - i) * f * 1.7;
}

// ---------------------------------------------------------------------------
// minecart (not a mob, but the same kind of layer definition)

/** vanilla MinecartModel.createBodyLayer: a 20x16 floor, four 8-high walls and the dark inner plate */
export function minecartModel(): MobModelDef {
  const root = new ModelPart();
  const wall: Cube = { x: -8, y: -9, z: -1, w: 16, h: 8, d: 2, u: 0, v: 0 };
  root.add('bottom', part([{ x: -10, y: -8, z: -1, w: 20, h: 16, d: 2, u: 0, v: 10 }], [0, 4, 0], [PI / 2, 0, 0]));
  root.add('front', part([wall], [-9, 4, 0], [0, PI * 1.5, 0]));
  root.add('back', part([wall], [9, 4, 0], [0, PI / 2, 0]));
  root.add('left', part([wall], [0, 4, -7], [0, PI, 0]));
  root.add('right', part([wall], [0, 4, 7]));
  root.add('contents', part([{ x: -9, y: -7, z: -1, w: 18, h: 14, d: 1, u: 44, v: 10 }], [0, 4, 0], [-PI / 2, 0, 0]));
  return { root, texW: 64, texH: 32 };
}

/** vanilla MinecartModel.setupAnim (the renderer passes ageInTicks = -0.1) */
export function animateMinecart(root: ModelPart, age: number): void {
  root.child('contents').y = 4 - age;
}

// ---------------------------------------------------------------------------
// keyframe animations (vanilla AnimationDefinition / KeyframeAnimations, linear channels)

type Vec3 = [number, number, number];

interface AnimChannel {
  bone: string;
  /** rotation keys are in degrees (KeyframeAnimations.degreeVec), position keys in pixels with +y up (posVec) */
  target: 'rotation' | 'position';
  keys: [number, Vec3][];
}

export interface AnimationDef {
  length: number;
  looping: boolean;
  channels: AnimChannel[];
}

/** vanilla KeyframeAnimations.animate: offsets each bone's pose by its channels at `seconds` */
export function applyAnimation(root: ModelPart, def: AnimationDef, seconds: number): void {
  const t = def.looping ? seconds % def.length : seconds;
  for (const ch of def.channels) {
    const p = root.find(ch.bone);
    if (!p) continue;
    const k = ch.keys;
    // vanilla: the last key at or before t, blended linearly towards the next
    let j = 0;
    while (j < k.length && !(t <= k[j][0])) j++;
    const i = Math.max(0, j - 1), n = Math.min(k.length - 1, i + 1);
    const f = n !== i ? Math.max(0, Math.min(1, (t - k[i][0]) / (k[n][0] - k[i][0]))) : 0;
    const a = k[i][1], b = k[n][1];
    const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, z = a[2] + (b[2] - a[2]) * f;
    if (ch.target === 'rotation') {
      p.xRot += (x * PI) / 180;
      p.yRot += (y * PI) / 180;
      p.zRot += (z * PI) / 180;
    } else {
      p.x += x;
      p.y -= y;
      p.z += z;
    }
  }
}

// ---------------------------------------------------------------------------
// bat (the 1.20.3+ model: small body, big ears, two-part wings, feet)

/** vanilla BatModel.createBodyLayer (32x32) */
/**
 * vanilla StriderModel (64x128): a tall body on two long legs, with three flat bristles fanned out on each side
 * (the right ones mirrored)
 */
export function striderModel(): MobModelDef {
  const root = new ModelPart();
  root.add('right_leg', part([{ x: -2, y: 0, z: -2, w: 4, h: 16, d: 4, u: 0, v: 32 }], [-4, 8, 0]));
  root.add('left_leg', part([{ x: -2, y: 0, z: -2, w: 4, h: 16, d: 4, u: 0, v: 55 }], [4, 8, 0]));
  const body = root.add('body', part([{ x: -8, y: -6, z: -8, w: 16, h: 14, d: 16, u: 0, v: 0 }], [0, 1, 0]));
  const bristle = (x: number, v: number, mirror: boolean) => [{ x, y: 0, z: 0, w: 12, h: 0, d: 16, u: 16, v, mirror }];
  body.add('right_bottom_bristle', part(bristle(-12, 65, true), [-8, 4, -8], [0, 0, -1.2217305]));
  body.add('right_middle_bristle', part(bristle(-12, 49, true), [-8, -1, -8], [0, 0, -1.134464]));
  body.add('right_top_bristle', part(bristle(-12, 33, true), [-8, -5, -8], [0, 0, -0.87266463]));
  body.add('left_top_bristle', part(bristle(0, 33, false), [8, -6, -8], [0, 0, 0.87266463]));
  body.add('left_middle_bristle', part(bristle(0, 49, false), [8, -2, -8], [0, 0, 1.134464]));
  body.add('left_bottom_bristle', part(bristle(0, 65, false), [8, 3, -8], [0, 0, 1.2217305]));
  return { root, texW: 64, texH: 128 };
}

/**
 * vanilla StriderModel.setupAnim: the body is its head (it turns and tilts to look, unless ridden) and sways and
 * bobs with the stride; the legs swing at half the stride's rate; the bristles flap with it and stir on their own
 */
export function animateStrider(root: ModelPart, limbSwing: number, limbAmount: number, age: number, headYaw: number, headPitch: number, ridden: boolean): void {
  root.resetPose();
  const amt = Math.min(0.25, limbAmount);
  const body = root.child('body');
  if (!ridden) {
    body.xRot = (headPitch * PI) / 180;
    body.yRot = (headYaw * PI) / 180;
  }
  body.zRot = 0.1 * Math.sin(limbSwing * 1.5) * 4 * amt;
  body.y = 2 - 2 * Math.cos(limbSwing * 1.5) * 2 * amt;
  const ll = root.child('left_leg'), rl = root.child('right_leg');
  ll.xRot = Math.sin(limbSwing * 1.5 * 0.5) * 2 * amt;
  rl.xRot = Math.sin(limbSwing * 1.5 * 0.5 + PI) * 2 * amt;
  ll.zRot = (PI / 18) * Math.cos(limbSwing * 1.5 * 0.5) * amt;
  rl.zRot = (PI / 18) * Math.cos(limbSwing * 1.5 * 0.5 + PI) * amt;
  ll.y = 8 + 2 * Math.sin(limbSwing * 1.5 * 0.5 + PI) * 2 * amt;
  rl.y = 8 + 2 * Math.sin(limbSwing * 1.5 * 0.5) * 2 * amt;
  const f1 = Math.cos(limbSwing * 1.5 + PI) * amt;
  const set = (n: string, base: number, swing: number, stir: number) => (body.child(n).zRot = base + f1 * swing + stir);
  set('right_bottom_bristle', -1.2217305, 1.3, 0.05 * Math.sin(age * -0.4));
  set('right_middle_bristle', -1.134464, 1.2, 0.1 * Math.sin(age * 0.2));
  set('right_top_bristle', -0.87266463, 0.6, 0.1 * Math.sin(age * 0.4));
  set('left_top_bristle', 0.87266463, 0.6, 0.1 * Math.sin(age * 0.4));
  set('left_middle_bristle', 1.134464, 1.2, 0.1 * Math.sin(age * 0.2));
  set('left_bottom_bristle', 1.2217305, 1.3, 0.05 * Math.sin(age * -0.4));
}

export function batModel(): MobModelDef {
  const root = new ModelPart();
  const body = root.add('body', part([{ x: -1.5, y: 0, z: -1, w: 3, h: 5, d: 2, u: 0, v: 0 }], [0, 17, 0]));
  const head = root.add('head', part([{ x: -2, y: -3, z: -1, w: 4, h: 3, d: 2, u: 0, v: 7 }], [0, 17, 0]));
  head.add('right_ear', part([{ x: -2.5, y: -4, z: 0, w: 3, h: 5, d: 0, u: 1, v: 15 }], [-1.5, -2, 0]));
  head.add('left_ear', part([{ x: -0.1, y: -3, z: 0, w: 3, h: 5, d: 0, u: 8, v: 15 }], [1.1, -3, 0]));
  const rw = body.add('right_wing', part([{ x: -2, y: -2, z: 0, w: 2, h: 7, d: 0, u: 12, v: 0 }], [-1.5, 0, 0]));
  rw.add('right_wing_tip', part([{ x: -6, y: -2, z: 0, w: 6, h: 8, d: 0, u: 16, v: 0 }], [-2, 0, 0]));
  const lw = body.add('left_wing', part([{ x: 0, y: -2, z: 0, w: 2, h: 7, d: 0, u: 12, v: 7 }], [1.5, 0, 0]));
  lw.add('left_wing_tip', part([{ x: 0, y: -2, z: 0, w: 6, h: 8, d: 0, u: 16, v: 8 }], [2, 0, 0]));
  body.add('feet', part([{ x: -1.5, y: 0, z: 0, w: 3, h: 2, d: 0, u: 16, v: 16 }], [0, 5, 0]));
  return { root, texW: 32, texH: 32 };
}

const still = (bone: string, target: AnimChannel['target'], v: Vec3): AnimChannel => ({ bone, target, keys: [[0, v]] });

/** vanilla BatAnimation.BAT_RESTING: hanging upside down by the feet, wings wrapped round the body */
export const BAT_RESTING: AnimationDef = {
  length: 0.5,
  looping: true,
  channels: [
    still('body', 'rotation', [180, 0, 0]),
    still('body', 'position', [0, 0.5, 0]),
    still('head', 'rotation', [180, 0, 0]),
    still('head', 'position', [0, 0.5, 0]),
    still('right_wing', 'rotation', [0, -160, 0]),
    still('right_wing_tip', 'rotation', [0, -140, 0]),
    still('left_wing', 'rotation', [0, 160, 0]),
    still('left_wing_tip', 'rotation', [0, 140, 0]),
  ],
};

/** vanilla BatAnimation.BAT_FLYING: one wingbeat every half second (Bat.TICKS_PER_FLAP), body pitched forward */
export const BAT_FLYING: AnimationDef = {
  length: 0.5,
  looping: true,
  channels: [
    { bone: 'head', target: 'rotation', keys: [[0, [20, 0, 0]], [0.5, [20, 0, 0]]] },
    { bone: 'head', target: 'position', keys: [[0, [0, 0, 0]], [0.125, [0, 1, 0]], [0.25, [0, 0, 0]], [0.375, [0, -0.5, 0]], [0.5, [0, 0, 0]]] },
    { bone: 'body', target: 'rotation', keys: [[0, [40, 0, 0]], [0.5, [40, 0, 0]]] },
    { bone: 'body', target: 'position', keys: [[0, [0, 0, 0]], [0.125, [0, 1, 0]], [0.25, [0, 0, 0]], [0.375, [0, -0.5, 0]], [0.5, [0, 0, 0]]] },
    { bone: 'right_wing', target: 'rotation', keys: [[0, [0, 85, 0]], [0.125, [0, -55, 0]], [0.25, [0, 50, 0]], [0.375, [0, 70, 0]], [0.5, [0, 85, 0]]] },
    { bone: 'right_wing_tip', target: 'rotation', keys: [[0, [0, 10, 0]], [0.125, [0, -65, 0]], [0.25, [0, 35, 0]], [0.375, [0, 60, 0]], [0.5, [0, 10, 0]]] },
    { bone: 'left_wing', target: 'rotation', keys: [[0, [0, -85, 0]], [0.125, [0, 55, 0]], [0.25, [0, -50, 0]], [0.375, [0, -70, 0]], [0.5, [0, -85, 0]]] },
    { bone: 'left_wing_tip', target: 'rotation', keys: [[0, [0, -10, 0]], [0.125, [0, 65, 0]], [0.25, [0, -35, 0]], [0.375, [0, -60, 0]], [0.5, [0, -10, 0]]] },
    { bone: 'feet', target: 'rotation', keys: [[0, [10, 0, 0]], [0.125, [-21.25, 0, 0]], [0.25, [10, 0, 0]], [0.5, [10, 0, 0]]] },
  ],
};

/**
 * vanilla BatModel.setupAnim: reset, turn the head while hanging, then play whichever of the
 * fly / rest loops is running (`flySeconds` / `restSeconds` < 0 = stopped)
 */
export function animateBat(root: ModelPart, resting: boolean, netHeadYaw: number, flySeconds: number, restSeconds: number): void {
  root.resetPose();
  if (resting) root.child('head').yRot = (netHeadYaw * PI) / 180;
  if (flySeconds >= 0) applyAnimation(root, BAT_FLYING, flySeconds);
  if (restSeconds >= 0) applyAnimation(root, BAT_RESTING, restSeconds);
}

// ---------------------------------------------------------------------------
// boats (vanilla BoatModel / ChestBoatModel, 128x64 and 128x128)

function boatParts(root: ModelPart): void {
  root.add('bottom', part([{ x: -14, y: -9, z: -3, w: 28, h: 16, d: 3, u: 0, v: 0 }], [0, 3, 1], [PI / 2, 0, 0]));
  root.add('back', part([{ x: -13, y: -7, z: -1, w: 18, h: 6, d: 2, u: 0, v: 19 }], [-15, 4, 4], [0, PI * 1.5, 0]));
  root.add('front', part([{ x: -8, y: -7, z: -1, w: 16, h: 6, d: 2, u: 0, v: 27 }], [15, 4, 0], [0, PI / 2, 0]));
  root.add('right', part([{ x: -14, y: -7, z: -1, w: 28, h: 6, d: 2, u: 0, v: 35 }], [0, 4, -9], [0, PI, 0]));
  root.add('left', part([{ x: -14, y: -7, z: -1, w: 28, h: 6, d: 2, u: 0, v: 43 }], [0, 4, 9]));
  root.add('left_paddle', part([{ x: -1, y: 0, z: -5, w: 2, h: 2, d: 18, u: 62, v: 0 }, { x: -1.001, y: -3, z: 8, w: 1, h: 6, d: 7, u: 62, v: 0 }], [3, -5, 9], [0, 0, PI / 16]));
  root.add('right_paddle', part([{ x: -1, y: 0, z: -5, w: 2, h: 2, d: 18, u: 62, v: 20 }, { x: 0.001, y: -3, z: 8, w: 1, h: 6, d: 7, u: 62, v: 20 }], [3, -5, -9], [0, PI, PI / 16]));
}

/** the hull the water mask covers (vanilla WaterPatchModel.waterPatch, drawn depth-only) */
function waterPatch(): ModelPart {
  return part([{ x: -14, y: -9, z: -3, w: 28, h: 16, d: 3, u: 0, v: 0 }], [0, -3, 1], [PI / 2, 0, 0]);
}

export interface BoatModelDef extends MobModelDef {
  waterPatch: ModelPart;
}

/** vanilla BoatModel.createBodyModel */
export function boatModel(): BoatModelDef {
  const root = new ModelPart();
  boatParts(root);
  return { root, texW: 128, texH: 64, waterPatch: waterPatch() };
}

/** vanilla ChestBoatModel.createBodyModel: the boat plus a chest in the back seat */
export function chestBoatModel(): BoatModelDef {
  const root = new ModelPart();
  boatParts(root);
  root.add('chest_bottom', part([{ x: 0, y: 0, z: 0, w: 12, h: 8, d: 12, u: 0, v: 76 }], [-2, -5, -6], [0, -PI / 2, 0]));
  root.add('chest_lid', part([{ x: 0, y: 0, z: 0, w: 12, h: 4, d: 12, u: 0, v: 59 }], [-2, -9, -6], [0, -PI / 2, 0]));
  root.add('chest_lock', part([{ x: 0, y: 0, z: 0, w: 2, h: 4, d: 1, u: 0, v: 59 }], [-1, -6, -1], [0, -PI / 2, 0]));
  return { root, texW: 128, texH: 128, waterPatch: waterPatch() };
}

/** vanilla BoatModel.animatePaddle: `rowing` = Boat.getRowingTime for that side */
function animatePaddle(p: ModelPart, side: number, rowing: number): void {
  const lerp = (a: number, b: number, t: number) => (t < 0 ? a : t > 1 ? b : a + (b - a) * t);
  p.xRot = lerp(-PI / 3, -PI / 12, (Math.sin(-rowing) + 1) / 2);
  p.yRot = lerp(-PI / 4, PI / 4, (Math.sin(-rowing + 1) + 1) / 2);
  if (side === 1) p.yRot = PI - p.yRot;
}

/** vanilla BoatModel.setupAnim */
export function animateBoat(root: ModelPart, leftRowing: number, rightRowing: number): void {
  animatePaddle(root.child('left_paddle'), 0, leftRowing);
  animatePaddle(root.child('right_paddle'), 1, rightRowing);
}
