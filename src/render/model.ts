// Entity models: ModelPart hierarchy with cuboids and vanilla box-UV mapping.
// Coordinates are in pixels with Y pointing down (vanilla model space).

import type { EntityBatch, PoseStack } from './entityRenderer';

export interface Cube {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  u: number;
  v: number;
  inflate?: number;
  /** vanilla CubeDeformation(growX, growY, growZ): each axis its own, in place of `inflate` (the texture keeps the box's size) */
  grow?: [number, number, number];
  mirror?: boolean;
}

export class ModelPart {
  x = 0;
  y = 0;
  z = 0;
  xRot = 0;
  yRot = 0;
  zRot = 0;
  xScale = 1;
  yScale = 1;
  zScale = 1;
  visible = true;
  readonly children = new Map<string, ModelPart>();
  private baked: Float32Array[] | null = null;

  constructor(readonly cubes: Cube[] = [], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]) {
    [this.x, this.y, this.z] = pivot;
    [this.xRot, this.yRot, this.zRot] = rot;
    this.initial = { x: this.x, y: this.y, z: this.z, xr: this.xRot, yr: this.yRot, zr: this.zRot };
  }

  private initial: { x: number; y: number; z: number; xr: number; yr: number; zr: number };

  resetPose(): void {
    const i = this.initial;
    this.x = i.x;
    this.y = i.y;
    this.z = i.z;
    this.xRot = i.xr;
    this.yRot = i.yr;
    this.zRot = i.zr;
    this.xScale = this.yScale = this.zScale = 1;
    for (const c of this.children.values()) c.resetPose();
  }

  add(name: string, part: ModelPart): ModelPart {
    this.children.set(name, part);
    return part;
  }

  child(name: string): ModelPart {
    const c = this.children.get(name);
    if (!c) throw new Error('no model part ' + name);
    return c;
  }

  /** find nested part by name (depth-first) */
  find(name: string): ModelPart | null {
    if (this.children.has(name)) return this.children.get(name)!;
    for (const c of this.children.values()) {
      const f = c.find(name);
      if (f) return f;
    }
    return null;
  }

  translateAndRotate(pose: PoseStack): void {
    pose.translate(this.x / 16, this.y / 16, this.z / 16);
    if (this.xRot || this.yRot || this.zRot) pose.rotZYX(this.xRot, this.yRot, this.zRot);
    if (this.xScale !== 1 || this.yScale !== 1 || this.zScale !== 1) pose.scale(this.xScale, this.yScale, this.zScale);
  }

  render(batch: EntityBatch, pose: PoseStack, texW: number, texH: number, r = 1, g = 1, b = 1, a = 1): void {
    if (!this.visible) return;
    if (!this.cubes.length && !this.children.size) return;
    pose.push();
    this.translateAndRotate(pose);
    if (!this.baked) this.baked = this.cubes.map((c) => bakeCube(c, texW, texH));
    for (const faces of this.baked) {
      // each face: 4 verts * (x,y,z,u,v) + normal (3)
      for (let f = 0; f < 6; f++) {
        const o = f * 23;
        const p = [faces[o], faces[o + 1], faces[o + 2], faces[o + 5], faces[o + 6], faces[o + 7], faces[o + 10], faces[o + 11], faces[o + 12], faces[o + 15], faces[o + 16], faces[o + 17]];
        const uv = [faces[o + 3], faces[o + 4], faces[o + 8], faces[o + 9], faces[o + 13], faces[o + 14], faces[o + 18], faces[o + 19]];
        batch.quad(pose, p, uv, faces[o + 20], faces[o + 21], faces[o + 22], r, g, b, a);
      }
    }
    for (const c of this.children.values()) c.render(batch, pose, texW, texH, r, g, b, a);
    pose.pop();
  }
}

/** vanilla ModelPart.Cube polygon construction → 6 faces × (4 × xyzuv + normal) */
function bakeCube(c: Cube, texW: number, texH: number): Float32Array {
  const g = c.inflate ?? 0;
  const [gx, gy, gz] = c.grow ?? [g, g, g];
  let x0 = c.x - gx, y0 = c.y - gy, z0 = c.z - gz;
  let x1 = c.x + c.w + gx;
  const y1 = c.y + c.h + gy, z1 = c.z + c.d + gz;
  if (c.mirror) [x0, x1] = [x1, x0];
  const V = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const u = c.u, v = c.v, dx = c.w, dy = c.h, dz = c.d;
  const f4 = u, f5 = u + dz, f6 = u + dz + dx, f7 = u + dz + dx + dx, f8 = u + dz + dx + dz, f9 = u + dz + dx + dz + dx;
  const f10 = v, f11 = v + dz, f12 = v + dz + dy;
  const polys: [number[], number, number, number, number, number[]][] = [
    [[5, 4, 0, 1], f5, f10, f6, f11, [0, -1, 0]], // DOWN
    [[2, 3, 7, 6], f6, f11, f7, f10, [0, 1, 0]], // UP
    [[0, 4, 7, 3], f4, f11, f5, f12, [-1, 0, 0]], // WEST
    [[1, 0, 3, 2], f5, f11, f6, f12, [0, 0, -1]], // NORTH
    [[5, 1, 2, 6], f6, f11, f8, f12, [1, 0, 0]], // EAST
    [[4, 5, 6, 7], f8, f11, f9, f12, [0, 0, 1]], // SOUTH
  ];
  const out = new Float32Array(6 * 23);
  polys.forEach(([idx, u1, v1, u2, v2, n], f) => {
    const uvs = [
      [u2 / texW, v1 / texH],
      [u1 / texW, v1 / texH],
      [u1 / texW, v2 / texH],
      [u2 / texW, v2 / texH],
    ];
    let order = [0, 1, 2, 3];
    if (c.mirror) order = [3, 2, 1, 0];
    const o = f * 23;
    order.forEach((k, j) => {
      const p = V[idx[k]];
      out[o + j * 5] = p[0] / 16;
      out[o + j * 5 + 1] = p[1] / 16;
      out[o + j * 5 + 2] = p[2] / 16;
      out[o + j * 5 + 3] = uvs[k][0];
      out[o + j * 5 + 4] = uvs[k][1];
    });
    out[o + 20] = c.mirror ? -n[0] : n[0];
    out[o + 21] = n[1];
    out[o + 22] = n[2];
  });
  return out;
}

// ---------------------------------------------------------------------------
// Humanoid / player model (vanilla PlayerModel, wide arms)

export function playerModel(slim = false): ModelPart {
  const root = new ModelPart();
  const head = root.add('head', new ModelPart([{ x: -4, y: -8, z: -4, w: 8, h: 8, d: 8, u: 0, v: 0 }], [0, 0, 0]));
  head.add('hat', new ModelPart([{ x: -4, y: -8, z: -4, w: 8, h: 8, d: 8, u: 32, v: 0, inflate: 0.5 }]));
  const body = root.add('body', new ModelPart([{ x: -4, y: 0, z: -2, w: 8, h: 12, d: 4, u: 16, v: 16 }], [0, 0, 0]));
  body.add('jacket', new ModelPart([{ x: -4, y: 0, z: -2, w: 8, h: 12, d: 4, u: 16, v: 32, inflate: 0.25 }]));
  const aw = slim ? 3 : 4;
  const ra = root.add('right_arm', new ModelPart([{ x: -3, y: -2, z: -2, w: aw, h: 12, d: 4, u: 40, v: 16 }], [-5, slim ? 2.5 : 2, 0]));
  ra.add('right_sleeve', new ModelPart([{ x: -3, y: -2, z: -2, w: aw, h: 12, d: 4, u: 40, v: 32, inflate: 0.25 }]));
  const la = root.add('left_arm', new ModelPart([{ x: -1, y: -2, z: -2, w: aw, h: 12, d: 4, u: 32, v: 48 }], [5, slim ? 2.5 : 2, 0]));
  la.add('left_sleeve', new ModelPart([{ x: -1, y: -2, z: -2, w: aw, h: 12, d: 4, u: 48, v: 48, inflate: 0.25 }]));
  const rl = root.add('right_leg', new ModelPart([{ x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 16 }], [-1.9, 12, 0]));
  rl.add('right_pants', new ModelPart([{ x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 32, inflate: 0.25 }]));
  const ll = root.add('left_leg', new ModelPart([{ x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 16, v: 48 }], [1.9, 12, 0]));
  ll.add('left_pants', new ModelPart([{ x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 48, inflate: 0.25 }]));
  return root;
}

/** vanilla HumanoidModel riding pose: arms raised a little, legs stretched forward and apart */
export function sitHumanoid(ra: ModelPart, la: ModelPart, rl: ModelPart, ll: ModelPart): void {
  ra.xRot += -Math.PI / 5;
  la.xRot += -Math.PI / 5;
  rl.xRot = -1.4137167;
  rl.yRot = Math.PI / 10;
  rl.zRot = 0.07853982;
  ll.xRot = -1.4137167;
  ll.yRot = -Math.PI / 10;
  ll.zRot = -0.07853982;
}

/**
 * vanilla AnimationUtils.animateCrossbowHold (ArmPose CROSSBOW_HOLD): both arms raised along the look, the
 * main one aimed 0.3 in and a little low, the other 0.6 across to steady it
 */
export function animateCrossbowHold(ra: ModelPart, la: ModelPart, head: ModelPart, rightHanded = true): void {
  const main = rightHanded ? ra : la, off = rightHanded ? la : ra;
  main.yRot = (rightHanded ? -0.3 : 0.3) + head.yRot;
  off.yRot = (rightHanded ? 0.6 : -0.6) + head.yRot;
  main.xRot = -Math.PI / 2 + head.xRot + 0.1;
  off.xRot = -1.5 + head.xRot;
}

/**
 * vanilla AnimationUtils.animateCrossbowCharge (ArmPose CROSSBOW_CHARGE): the main arm holds it across the
 * body, the other pulls the string up and back as `charge` (0..1: ticks used / charge duration, clamped,
 * see item/crossbow.ts crossbowChargeProgress) grows
 */
export function animateCrossbowCharge(ra: ModelPart, la: ModelPart, charge: number, rightHanded = true): void {
  const main = rightHanded ? ra : la, off = rightHanded ? la : ra;
  main.yRot = rightHanded ? -0.8 : 0.8;
  main.xRot = -0.97079635;
  off.xRot = main.xRot;
  off.yRot = (0.4 + (0.85 - 0.4) * charge) * (rightHanded ? 1 : -1);
  off.xRot = off.xRot + (-Math.PI / 2 - off.xRot) * charge;
}

/** vanilla HumanoidModel.ArmPose, as a player's arms take them (PlayerRenderer.getArmPose) */
export type HumanoidArmPose = 'empty' | 'item' | 'block' | 'bow' | 'crossbow_charge' | 'crossbow_hold' | 'throw_spear' | 'brush';

/** vanilla ArmPose.isTwoHanded */
export function twoHanded(pose: HumanoidArmPose): boolean {
  return pose === 'bow' || pose === 'crossbow_charge' || pose === 'crossbow_hold';
}

export interface HumanoidArms {
  right: HumanoidArmPose;
  left: HumanoidArmPose;
  /** the main arm: whose two-handed pose wins */
  mainArm: 'right' | 'left';
  /** the arm using an item: then only it is posed */
  usingArm: 'right' | 'left' | null;
  /** the arm the attack swing is with (vanilla getAttackArm) */
  attackArm: 'right' | 'left';
  /** a charging crossbow's progress (see item/crossbow.ts crossbowChargeProgress) */
  charge: number;
}

const EMPTY_ARMS: HumanoidArms = { right: 'empty', left: 'empty', mainArm: 'right', usingArm: null, attackArm: 'right', charge: 0 };

/**
 * vanilla HumanoidModel.setupAnim (walking/riding/idle/swing subset), in its order: the arm poses first (only the
 * using arm's while an item is in use; otherwise the off arm's first unless it's the two-handed one), then the
 * attack swing on the swinging arm, the crouch, and the idle sway
 */
export function animateHumanoid(root: ModelPart, limbSwing: number, limbAmount: number, age: number, headYaw: number, headPitch: number, attackTime: number, crouching: boolean, riding = false, arms: HumanoidArms = EMPTY_ARMS): void {
  root.resetPose();
  const head = root.child('head'), body = root.child('body');
  const ra = root.child('right_arm'), la = root.child('left_arm'), rl = root.child('right_leg'), ll = root.child('left_leg');
  head.yRot = (headYaw * Math.PI) / 180;
  head.xRot = (headPitch * Math.PI) / 180;
  ra.xRot = Math.cos(limbSwing * 0.6662 + Math.PI) * 2 * limbAmount * 0.5;
  la.xRot = Math.cos(limbSwing * 0.6662) * 2 * limbAmount * 0.5;
  rl.xRot = Math.cos(limbSwing * 0.6662) * 1.4 * limbAmount;
  ll.xRot = Math.cos(limbSwing * 0.6662 + Math.PI) * 1.4 * limbAmount;
  if (riding) sitHumanoid(ra, la, rl, ll);
  // vanilla poseRightArm / poseLeftArm
  const pose = (right: boolean) => {
    const arm = right ? ra : la;
    switch (right ? arms.right : arms.left) {
      case 'item':
        arm.xRot = arm.xRot * 0.5 - Math.PI / 10;
        arm.yRot = 0;
        break;
      case 'block':
        // (a shield held up before the body, turned in across it)
        arm.xRot = arm.xRot * 0.5 - 0.9424779;
        arm.yRot = right ? -Math.PI / 6 : Math.PI / 6;
        break;
      case 'bow':
        ra.yRot = -0.1 + head.yRot - (right ? 0 : 0.4);
        la.yRot = 0.1 + head.yRot + (right ? 0.4 : 0);
        ra.xRot = -Math.PI / 2 + head.xRot;
        la.xRot = -Math.PI / 2 + head.xRot;
        break;
      case 'crossbow_charge':
        animateCrossbowCharge(ra, la, arms.charge, right);
        break;
      case 'crossbow_hold':
        animateCrossbowHold(ra, la, head, right);
        break;
      case 'throw_spear':
        // (raised up over the shoulder, swinging half as much)
        arm.xRot = arm.xRot * 0.5 - Math.PI;
        arm.yRot = 0;
        break;
      case 'brush':
        // (held out a little lower than an item, toward what's being brushed)
        arm.xRot = arm.xRot * 0.5 - Math.PI / 5;
        arm.yRot = 0;
        break;
      default:
        arm.yRot = 0;
    }
  };
  if (arms.usingArm) pose(arms.usingArm === 'right');
  else {
    const rightMain = arms.mainArm === 'right';
    if (rightMain !== twoHanded(rightMain ? arms.left : arms.right)) {
      pose(false);
      pose(true);
    } else {
      pose(true);
      pose(false);
    }
  }
  // vanilla setupAttackAnimation
  if (attackTime > 0) {
    const left = arms.attackArm === 'left';
    const arm = left ? la : ra;
    body.yRot = Math.sin(Math.sqrt(attackTime) * Math.PI * 2) * 0.2;
    if (left) body.yRot *= -1;
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
    const f1 = Math.sin(f * Math.PI);
    const f2 = Math.sin(attackTime * Math.PI) * -(head.xRot - 0.7) * 0.75;
    arm.xRot -= f1 * 1.2 + f2;
    arm.yRot += body.yRot * 2;
    arm.zRot += Math.sin(attackTime * Math.PI) * -0.4;
  }
  if (crouching) {
    body.xRot = 0.5;
    ra.xRot += 0.4;
    la.xRot += 0.4;
    rl.z = 4;
    ll.z = 4;
    rl.y = 12.2;
    ll.y = 12.2;
    head.y = 4.2;
    body.y = 3.2;
    la.y = 5.2;
    ra.y = 5.2;
  }
  // idle arm sway (AnimationUtils.bobModelPart)
  ra.zRot += Math.cos(age * 0.09) * 0.05 + 0.05;
  la.zRot -= Math.cos(age * 0.09) * 0.05 + 0.05;
  ra.xRot += Math.sin(age * 0.067) * 0.05;
  la.xRot -= Math.sin(age * 0.067) * 0.05;
}
