// Mob models (vanilla LayerDefinitions) and their setupAnim animations.

import { ModelPart, Cube } from './model';

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

export type ArmPose = 'empty' | 'item' | 'bow';

/** vanilla AnimationUtils.bobArms */
function bobArms(ra: ModelPart, la: ModelPart, age: number): void {
  ra.zRot += Math.cos(age * 0.09) * 0.05 + 0.05;
  la.zRot -= Math.cos(age * 0.09) * 0.05 + 0.05;
  ra.xRot += Math.sin(age * 0.067) * 0.05;
  la.xRot -= Math.sin(age * 0.067) * 0.05;
}

/** vanilla HumanoidModel.setupAnim (mob subset: walking, arm poses, attack swing, idle bob) */
export function animateHumanoidMob(root: ModelPart, limbSwing: number, limbAmount: number, age: number, headYaw: number, headPitch: number, attackTime: number, rightPose: ArmPose): void {
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
