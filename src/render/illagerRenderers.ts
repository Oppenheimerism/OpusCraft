// The raiders' renderers (Stage 4): vanilla IllagerRenderer with IllagerModel for the pillager, vindicator and evoker
// (arms folded across the chest unless they're doing something; a captain's banner worn on the head by
// CustomHeadLayer; the weapon shown by ItemInHandLayer — always for the pillager, only in a fight for the
// vindicator, only mid-spell for the evoker), VexRenderer (translucent, lit by its own light, a charging face),
// RavagerRenderer (the neck lunging with each butt, shaking while stunned, the jaw dropping to roar) and
// EvokerFangsRenderer (the jaws rising out of the ground and snapping shut). The steps every living renderer shares
// (placing and turning the body, the hurt flash, the body pass) are the dispatcher's, lent through LivingKit.

import type { EntityBatch, PoseStack, DrawState } from './entityRenderer';
import type { ItemRenderer } from './itemRenderer';
import { ModelPart, type Cube, animateCrossbowCharge, animateCrossbowHold } from './model';
import { animateZombieArms, triangleWave, type MobModelDef } from './mobModels';
import { drawArmItem } from './playerPose';
import { renderHeadItem } from './armorLayer';
import type { LivingEntity } from '../entity/living';
import type { Mob } from '../entity/mob';
import type { ItemStack } from '../item/item';
import { crossbowChargeProgress } from '../item/crossbow';
import { AbstractIllager, type IllagerArmPose } from '../entity/raider';
import { Pillager, Vindicator } from '../entity/illagers';
import { Evoker, Vex, type EvokerFangs } from '../entity/evoker';
import { Ravager } from '../entity/ravager';
import '../textures/illagers';

const PI = Math.PI;
const RAD = PI / 180;

/** what the dispatcher's LivingEntityRenderer.setupRotations hands the model's setupAnim */
export interface LivingAnim {
  limbSwing: number;
  limbAmount: number;
  age: number;
  headYaw: number;
  headPitch: number;
}

/** the dispatcher's shared living-renderer steps (entityRenderers.ts) */
export interface LivingKit {
  readonly pose: PoseStack;
  readonly items: ItemRenderer;
  tex(name: string): WebGLTexture | null;
  setupLiving(e: LivingEntity, dx: number, dy: number, dz: number, p: number, flip?: number, scale?: (pose: PoseStack) => void): LivingAnim;
  overlay(b: EntityBatch, e: LivingEntity, white?: number): void;
  drawBody(b: EntityBatch, e: LivingEntity, def: MobModelDef, tex: WebGLTexture, baby: boolean, extra?: Partial<DrawState>): void;
  /** vanilla AgeableListModel.renderToBuffer, tinted: a layer's pass over the model (after `state` has begun one) */
  drawModel(b: EntityBatch, def: MobModelDef, baby: boolean, r?: number, g?: number, bl?: number, a?: number): void;
  state(tex: WebGLTexture, extra?: Partial<DrawState>): DrawState;
  attackAnim(e: LivingEntity, p: number): number;
}

/** vanilla shadow radii of these renderers (EvokerFangsRenderer has none) */
export const RAIDER_SHADOW_RADII: Record<string, number> = { pillager: 0.5, vindicator: 0.5, evoker: 0.5, vex: 0.3, ravager: 1.1 };

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

// ---------------------------------------------------------------------------
// vanilla IllagerModel (64x64)

/** vanilla IllagerModel.createBodyLayer: the villager's head and nose, a long coat, folded arms and a pair of free ones */
export function illagerModel(): MobModelDef {
  const root = new ModelPart();
  const head = root.add('head', part([{ x: -4, y: -10, z: -4, w: 8, h: 10, d: 8, u: 0, v: 0 }]));
  // (the illusioner's hat; the others' is hidden)
  head.add('hat', part([{ x: -4, y: -10, z: -4, w: 8, h: 12, d: 8, u: 32, v: 0, inflate: 0.45 }])).visible = false;
  head.add('nose', part([{ x: -1, y: -1, z: -6, w: 2, h: 4, d: 2, u: 24, v: 0 }], [0, -2, 0]));
  root.add('body', part([
    { x: -4, y: 0, z: -3, w: 8, h: 12, d: 6, u: 16, v: 20 },
    { x: -4, y: 0, z: -3, w: 8, h: 20, d: 6, u: 0, v: 38, inflate: 0.5 },
  ]));
  const arms = root.add('arms', part([
    { x: -8, y: -2, z: -2, w: 4, h: 8, d: 4, u: 44, v: 22 },
    { x: -4, y: 2, z: -2, w: 8, h: 4, d: 4, u: 40, v: 38 },
  ], [0, 3, -1], [-0.75, 0, 0]));
  arms.add('left_shoulder', part([{ x: 4, y: -2, z: -2, w: 4, h: 8, d: 4, u: 44, v: 22, mirror: true }]));
  root.add('right_leg', part([{ x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 22 }], [-2, 12, 0]));
  root.add('left_leg', part([{ x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 22, mirror: true }], [2, 12, 0]));
  root.add('right_arm', part([{ x: -3, y: -2, z: -2, w: 4, h: 12, d: 4, u: 40, v: 46 }], [-5, 2, 0]));
  root.add('left_arm', part([{ x: -1, y: -2, z: -2, w: 4, h: 12, d: 4, u: 40, v: 46, mirror: true }], [5, 2, 0]));
  return { root, texW: 64, texH: 64 };
}

/** vanilla AnimationUtils.bobArms */
function bobArms(ra: ModelPart, la: ModelPart, age: number): void {
  ra.zRot += Math.cos(age * 0.09) * 0.05 + 0.05;
  la.zRot -= Math.cos(age * 0.09) * 0.05 + 0.05;
  ra.xRot += Math.sin(age * 0.067) * 0.05;
  la.xRot -= Math.sin(age * 0.067) * 0.05;
}

/** vanilla AnimationUtils.swingWeaponDown (a right-handed mob): the weapon raised high and brought down in the swing */
function swingWeaponDown(ra: ModelPart, la: ModelPart, attack: number, age: number): void {
  const f = Math.sin(attack * PI);
  const f1 = Math.sin((1 - (1 - attack) * (1 - attack)) * PI);
  ra.zRot = 0;
  la.zRot = 0;
  ra.yRot = PI / 20;
  la.yRot = -PI / 20;
  ra.xRot = -1.8849558 + Math.cos(age * 0.09) * 0.15;
  la.xRot = -0 + Math.cos(age * 0.19) * 0.5;
  ra.xRot += f * 2.2 - f1 * 0.4;
  la.xRot += f * 1.2 - f1 * 0.4;
  bobArms(ra, la, age);
}

/**
 * vanilla IllagerModel.setupAnim: the head follows the gaze; sitting astride (a ravager), the arms rest forward and
 * the legs splay; else they swing as it walks. Then the arm pose: an axe raised and swung down (fists up like a
 * zombie's with nothing in hand), both arms thrown up and wavering to cast, a crossbow levelled or being loaded, both
 * arms raised to celebrate — or, doing nothing, folded (the folded pair drawn in place of the free arms)
 */
export function animateIllager(root: ModelPart, pose: IllagerArmPose, a: LivingAnim, attack: number, riding: boolean, mainEmpty: boolean, charge: number): void {
  root.resetPose();
  const head = root.child('head'), ra = root.child('right_arm'), la = root.child('left_arm'), rl = root.child('right_leg'), ll = root.child('left_leg');
  head.yRot = a.headYaw * RAD;
  head.xRot = a.headPitch * RAD;
  if (riding) {
    ra.xRot = -PI / 5;
    la.xRot = -PI / 5;
    rl.xRot = -1.4137167;
    rl.yRot = PI / 10;
    rl.zRot = 0.07853982;
    ll.xRot = -1.4137167;
    ll.yRot = -PI / 10;
    ll.zRot = -0.07853982;
  } else {
    ra.xRot = Math.cos(a.limbSwing * 0.6662 + PI) * 2 * a.limbAmount * 0.5;
    la.xRot = Math.cos(a.limbSwing * 0.6662) * 2 * a.limbAmount * 0.5;
    rl.xRot = Math.cos(a.limbSwing * 0.6662) * 1.4 * a.limbAmount * 0.5;
    ll.xRot = Math.cos(a.limbSwing * 0.6662 + PI) * 1.4 * a.limbAmount * 0.5;
  }
  switch (pose) {
    case 'attacking':
      if (mainEmpty) animateZombieArms(root, true, attack, a.age);
      else swingWeaponDown(ra, la, attack, a.age);
      break;
    case 'spellcasting':
      ra.z = 0;
      ra.x = -5;
      la.z = 0;
      la.x = 5;
      ra.xRot = Math.cos(a.age * 0.6662) * 0.25;
      la.xRot = Math.cos(a.age * 0.6662) * 0.25;
      ra.zRot = (PI * 3) / 4;
      la.zRot = (-PI * 3) / 4;
      ra.yRot = 0;
      la.yRot = 0;
      break;
    case 'bow_and_arrow':
      ra.yRot = -0.1 + head.yRot;
      ra.xRot = -PI / 2 + head.xRot;
      la.xRot = -0.9424779 + head.xRot;
      la.yRot = head.yRot - 0.4;
      la.zRot = PI / 2;
      break;
    case 'crossbow_hold':
      animateCrossbowHold(ra, la, head, true);
      break;
    case 'crossbow_charge':
      animateCrossbowCharge(ra, la, charge, true);
      break;
    case 'celebrating':
      ra.z = 0;
      ra.x = -5;
      ra.xRot = Math.cos(a.age * 0.6662) * 0.05;
      ra.zRot = 2.670354;
      ra.yRot = 0;
      la.z = 0;
      la.x = 5;
      la.xRot = Math.cos(a.age * 0.6662) * 0.05;
      la.zRot = (-PI * 3) / 4;
      la.yRot = 0;
      break;
  }
  const crossed = pose === 'crossed';
  root.child('arms').visible = crossed;
  ra.visible = !crossed;
  la.visible = !crossed;
}

// ---------------------------------------------------------------------------
// vanilla VexModel (32x32)

/** vanilla VexModel.createBodyLayer: a big head over a small body tapering to a wisp, stubby arms, two flat wings */
export function vexModel(): MobModelDef {
  const root = new ModelPart();
  const r = root.add('root', part([], [0, -2.5, 0]));
  r.add('head', part([{ x: -2.5, y: -5, z: -2.5, w: 5, h: 5, d: 5, u: 0, v: 0 }], [0, 20, 0]));
  const body = r.add('body', part([
    { x: -1.5, y: 0, z: -1, w: 3, h: 4, d: 2, u: 0, v: 10 },
    { x: -1.5, y: 1, z: -1, w: 3, h: 5, d: 2, u: 0, v: 16, inflate: -0.2 },
  ], [0, 20, 0]));
  body.add('right_arm', part([{ x: -1.25, y: -0.5, z: -1, w: 2, h: 4, d: 2, u: 23, v: 0, inflate: -0.1 }], [-1.75, 0.25, 0]));
  body.add('left_arm', part([{ x: -0.75, y: -0.5, z: -1, w: 2, h: 4, d: 2, u: 23, v: 6, inflate: -0.1 }], [1.75, 0.25, 0]));
  body.add('left_wing', part([{ x: 0, y: 0, z: 0, w: 0, h: 5, d: 8, u: 16, v: 14, mirror: true }], [0.5, 1, 1]));
  body.add('right_wing', part([{ x: 0, y: 0, z: 0, w: 0, h: 5, d: 8, u: 16, v: 14 }], [-0.5, 1, 1]));
  return { root, texW: 32, texH: 32 };
}

/**
 * vanilla VexModel.setupAnim: the arms drift, the body leans forward (upright to charge, arms thrust out ahead — or,
 * holding a sword, raised overhead), the wings beat fast
 */
export function animateVex(root: ModelPart, a: LivingAnim, charging: boolean, main: ItemStack | null, off: ItemStack | null): void {
  root.resetPose();
  const r = root.child('root'), head = r.child('head'), body = r.child('body');
  const ra = body.child('right_arm'), la = body.child('left_arm'), rw = body.child('right_wing'), lw = body.child('left_wing');
  head.yRot = a.headYaw * RAD;
  head.xRot = a.headPitch * RAD;
  const f = Math.cos(a.age * 5.5 * RAD) * 0.1;
  ra.zRot = PI / 5 + f;
  la.zRot = -(PI / 5 + f);
  if (charging) {
    body.xRot = 0;
    // vanilla setArmsCharging
    if (!main && !off) {
      ra.xRot = -1.2217305;
      ra.yRot = PI / 12;
      ra.zRot = -0.47123888 - f;
      la.xRot = -1.2217305;
      la.yRot = -PI / 12;
      la.zRot = 0.47123888 + f;
    } else {
      if (main) {
        ra.xRot = (PI * 7) / 6;
        ra.yRot = PI / 12;
        ra.zRot = -0.47123888 - f;
      }
      if (off) {
        la.xRot = (PI * 7) / 6;
        la.yRot = -PI / 12;
        la.zRot = 0.47123888 + f;
      }
    }
  } else body.xRot = PI / 20;
  lw.yRot = 1.0995574 + Math.cos(a.age * 45.836624 * RAD) * RAD * 16.2;
  rw.yRot = -lw.yRot;
  lw.xRot = 0.47123888;
  lw.zRot = -0.47123888;
  rw.xRot = 0.47123888;
  rw.zRot = 0.47123888;
}

// ---------------------------------------------------------------------------
// vanilla RavagerModel (128x128)

/** vanilla RavagerModel.createBodyLayer: a long neck carrying the great horned head and its jaw, a barrel body, four pillar legs */
export function ravagerModel(): MobModelDef {
  const root = new ModelPart();
  const neck = root.add('neck', part([{ x: -5, y: -1, z: -18, w: 10, h: 10, d: 18, u: 68, v: 73 }], [0, -7, 5.5]));
  const head = neck.add('head', part([
    { x: -8, y: -20, z: -14, w: 16, h: 20, d: 16, u: 0, v: 0 },
    { x: -2, y: -6, z: -18, w: 4, h: 8, d: 4, u: 0, v: 0 },
  ], [0, 16, -17]));
  head.add('right_horn', part([{ x: 0, y: -14, z: -2, w: 2, h: 14, d: 4, u: 74, v: 55 }], [-10, -14, -8], [1.0995574, 0, 0]));
  head.add('left_horn', part([{ x: 0, y: -14, z: -2, w: 2, h: 14, d: 4, u: 74, v: 55, mirror: true }], [8, -14, -8], [1.0995574, 0, 0]));
  head.add('mouth', part([{ x: -8, y: 0, z: -16, w: 16, h: 3, d: 16, u: 0, v: 36 }], [0, -2, 2]));
  root.add('body', part([
    { x: -7, y: -10, z: -7, w: 14, h: 16, d: 20, u: 0, v: 55 },
    { x: -6, y: 6, z: -7, w: 12, h: 13, d: 18, u: 0, v: 91 },
  ], [0, 1, 2], [PI / 2, 0, 0]));
  const hind: Cube = { x: -4, y: 0, z: -4, w: 8, h: 37, d: 8, u: 96, v: 0 };
  const front: Cube = { x: -4, y: 0, z: -4, w: 8, h: 37, d: 8, u: 64, v: 0 };
  root.add('right_hind_leg', part([hind], [-8, -13, 18]));
  root.add('left_hind_leg', part([hind], [8, -13, 18]));
  root.add('right_front_leg', part([front], [-8, -13, -5]));
  root.add('left_front_leg', part([front], [8, -13, -5]));
  return { root, texW: 128, texH: 128 };
}

/**
 * vanilla RavagerModel.prepareMobModel and setupAnim: butting (`attack`: its 10 ticks' count), the neck lunges out
 * and back with the jaw snapping; stunned, the head hangs and swings from side to side, the mouth ajar; roaring
 * (`roar`: its 20 ticks' count), the jaw drops wide. (Like vanilla's, the neck keeps the tilt it was last given
 * between frames — the model is shared, so every ravager's lunge starts from the last one drawn.)
 */
export function animateRavager(root: ModelPart, a: LivingAnim, attack: number, stunned: number, roar: number, p: number): void {
  const neck = root.child('neck'), head = neck.child('head'), mouth = head.child('mouth');
  if (attack > 0) {
    const f = triangleWave(attack - p, 10);
    const f1 = (1 + f) * 0.5;
    const f2 = f1 * f1 * f1 * 12;
    const f3 = f2 * Math.sin(neck.xRot);
    neck.z = -6.5 + f2;
    neck.y = -7 - f3;
    mouth.xRot = attack > 5 ? Math.sin((-4 + attack - p) / 4) * PI * 0.4 : (PI / 20) * Math.sin((PI * (attack - p)) / 10);
  } else {
    const f6 = -1 * Math.sin(neck.xRot);
    neck.x = 0;
    neck.y = -7 - f6;
    neck.z = 5.5;
    const stun = stunned > 0;
    neck.xRot = stun ? 0.21991149 : 0;
    mouth.xRot = PI * (stun ? 0.05 : 0.01);
    if (stun) neck.x = Math.sin((stunned / 40) * 10) * 3;
    else if (roar > 0) mouth.xRot = (PI / 2) * Math.sin(((20 - roar - p) / 20) * PI * 0.25);
  }
  head.xRot = a.headPitch * RAD;
  head.yRot = a.headYaw * RAD;
  const f = 0.4 * a.limbAmount;
  root.child('right_hind_leg').xRot = Math.cos(a.limbSwing * 0.6662) * f;
  root.child('left_hind_leg').xRot = Math.cos(a.limbSwing * 0.6662 + PI) * f;
  root.child('right_front_leg').xRot = Math.cos(a.limbSwing * 0.6662 + PI) * f;
  root.child('left_front_leg').xRot = Math.cos(a.limbSwing * 0.6662) * f;
}

// ---------------------------------------------------------------------------
// vanilla EvokerFangsModel (64x32)

/** vanilla EvokerFangsModel.createBodyLayer: a stony base and two jaws, the lower turned about to face the upper */
export function evokerFangsModel(): MobModelDef {
  const root = new ModelPart();
  root.add('base', part([{ x: 0, y: 0, z: 0, w: 10, h: 12, d: 10, u: 0, v: 0 }], [-5, 24, -5]));
  const jaw: Cube = { x: 0, y: 0, z: 0, w: 4, h: 14, d: 8, u: 40, v: 0 };
  root.add('upper_jaw', part([jaw], [1.5, 24, -4]));
  root.add('lower_jaw', part([jaw], [-1.5, 24, 4], [0, PI, 0]));
  return { root, texW: 64, texH: 32 };
}

/** vanilla EvokerFangsModel.setupAnim: the jaws spring open as they rise, then close as the whole thing sinks back */
export function animateFangs(root: ModelPart, progress: number): void {
  let f = Math.min(1, progress * 2);
  f = 1 - f * f * f;
  const upper = root.child('upper_jaw'), lower = root.child('lower_jaw');
  upper.zRot = PI - f * 0.35 * PI;
  lower.zRot = PI + f * 0.35 * PI;
  const f1 = (progress + Math.sin(progress * 2.7)) * 0.6 * 12;
  upper.y = 24 - f1;
  lower.y = upper.y;
  root.child('base').y = upper.y;
}

// ---------------------------------------------------------------------------

export class RaiderRenderers {
  private readonly illager = illagerModel();
  private readonly vex = vexModel();
  private readonly ravager = ravagerModel();
  private readonly fangs = evokerFangsModel();

  // ((Stage 5: ocean) lent on to the ocean's renderers)
  constructor(readonly kit: LivingKit) {}

  /** draws `e` if it's one of these renderers' mobs (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (e instanceof AbstractIllager) this.renderIllager(b, e, dx, dy, dz, p);
    else if (e instanceof Vex) this.renderVex(b, e, dx, dy, dz, p);
    else if (e instanceof Ravager) this.renderRavager(b, e, dx, dy, dz, p);
    else return false;
    return true;
  }

  /** vanilla IllagerRenderer (15/16 size) and its subclasses' layers */
  private renderIllager(b: EntityBatch, e: AbstractIllager, dx: number, dy: number, dz: number, p: number): void {
    const kit = this.kit, def = this.illager, tex = kit.tex(e.type);
    if (!tex) return;
    const a = kit.setupLiving(e, dx, dy, dz, p, 90, (pose) => pose.scale(0.9375, 0.9375, 0.9375));
    const pose = e.armPose();
    const charge = pose === 'crossbow_charge' ? crossbowChargeProgress(e.mainHand, e.useItemTicks) : 0;
    animateIllager(def.root, pose, a, kit.attackAnim(e, p), !!e.vehicle, !e.mainHand, charge);
    kit.overlay(b, e);
    kit.drawBody(b, e, def, tex, false);
    b.setOverlay(0, 0, 0, 0);
    // vanilla CustomHeadLayer: what's worn on the head that isn't a helmet (a captain's ominous banner)
    const head = e.armorItems[3];
    if (head && !head.item.armor) renderHeadItem(b, kit.pose, kit.items, def.root, head, false);
    // vanilla ItemInHandLayer: the pillager's always; the vindicator's only when it's fighting; the evoker's only
    // while it casts
    const show = e instanceof Pillager || (e instanceof Vindicator && e.aggressive) || (e instanceof Evoker && e.isCastingSpell());
    if (!show) return;
    if (e.mainHand) drawArmItem(b, kit.items, kit.pose, def.root, e.mainHand, false, e.usingItem ? e.useItemTicks + p : -1);
    if (e.offHand) drawArmItem(b, kit.items, kit.pose, def.root, e.offHand, true, -1);
  }

  /** vanilla VexRenderer: translucent, its own light (entityRenderers setLight), the charging texture */
  private renderVex(b: EntityBatch, e: Vex, dx: number, dy: number, dz: number, p: number): void {
    const kit = this.kit, def = this.vex, tex = kit.tex(e.charging ? 'vex_charging' : 'vex');
    if (!tex) return;
    const a = kit.setupLiving(e, dx, dy, dz, p);
    animateVex(def.root, a, e.charging, e.mainHand, e.offHand);
    kit.overlay(b, e);
    // (vanilla RenderType.entityTranslucent)
    kit.drawBody(b, e, def, tex, false, { blend: true, cutoff: 0.01 });
    b.flush();
    b.setOverlay(0, 0, 0, 0);
    // vanilla ItemInHandLayer through VexModel.translateToHand: in the little hand, at 55%
    for (const left of [false, true]) {
      const s = left ? e.offHand : e.mainHand;
      if (!s) continue;
      const ps = kit.pose;
      ps.push();
      const r = def.root.child('root'), body = r.child('body');
      r.translateAndRotate(ps);
      body.translateAndRotate(ps);
      body.child(left ? 'left_arm' : 'right_arm').translateAndRotate(ps);
      ps.scale(0.55, 0.55, 0.55);
      ps.translate(left ? -0.046875 : 0.046875, -0.15625, 0.078125);
      ps.rotX(-90);
      ps.rotY(180);
      ps.translate((left ? -1 : 1) / 16, 0.125, -0.625);
      kit.items.render(b, ps, s, left ? 'thirdperson_lefthand' : 'thirdperson_righthand', left);
      ps.pop();
    }
  }

  /** vanilla RavagerRenderer */
  private renderRavager(b: EntityBatch, e: Ravager, dx: number, dy: number, dz: number, p: number): void {
    const kit = this.kit, def = this.ravager, tex = kit.tex('ravager');
    if (!tex) return;
    const a = kit.setupLiving(e, dx, dy, dz, p);
    animateRavager(def.root, a, e.attackTick, e.stunnedTick, e.roarTick, p);
    kit.overlay(b, e);
    kit.drawBody(b, e, def, tex, false);
  }

  /** vanilla EvokerFangsRenderer: nothing until the jaws come up; they grow to full size, and shrink away at the end */
  renderFangs(b: EntityBatch, e: EvokerFangs, dx: number, dy: number, dz: number, p: number): void {
    const f = e.animationProgress(p);
    if (f === 0) return;
    const tex = this.kit.tex('evoker_fangs');
    if (!tex) return;
    let s = 2;
    if (f > 0.9) s *= (1 - f) / 0.1;
    const pose = this.kit.pose;
    pose.reset();
    pose.translate(dx, dy, dz);
    pose.rotY(90 - e.yaw);
    pose.scale(-s, -s, s);
    pose.translate(0, -0.626, 0);
    pose.scale(0.5, 0.5, 0.5);
    animateFangs(this.fangs.root, f);
    b.setOverlay(0, 0, 0, 0);
    // (vanilla entityCutoutNoCull)
    b.begin(this.kit.state(tex));
    this.fangs.root.render(b, pose, 64, 32);
  }
}
