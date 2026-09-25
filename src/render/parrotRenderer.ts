// Parrots: vanilla ParrotRenderer with ParrotModel, a little bird whose wings beat out from its sides as it flies, its
// legs tucked back; it bobs with the beat (the model's "age" is the wingbeat, vanilla getBob), sits squat when told
// to, and on a player's shoulder (vanilla ParrotOnShoulderLayer) turns its head as the player does, its tail
// swinging to their walk.

import type { EntityBatch, PoseStack } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import type { MobModelDef } from './mobModels';
import type { LivingKit, LivingAnim } from './illagerRenderers';
import type { Mob, SavedEntity } from '../entity/mob';
import { Parrot, PARROT_VARIANTS, shoulderVariant } from '../entity/parrot';
import '../textures/parrot';

const PI = Math.PI;
const RAD = PI / 180;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

/** vanilla ParrotModel.createBodyLayer, 32x32 */
export function parrotModel(): MobModelDef {
  const root = new ModelPart();
  root.add('body', part([{ x: -1.5, y: 0, z: -1.5, w: 3, h: 6, d: 3, u: 2, v: 8 }], [0, 16.5, -3], [0.4937, 0, 0]));
  root.add('tail', part([{ x: -1.5, y: -1, z: -1, w: 3, h: 4, d: 1, u: 22, v: 1 }], [0, 21.07, 1.16], [1.015, 0, 0]));
  root.add('left_wing', part([{ x: -0.5, y: 0, z: -1.5, w: 1, h: 5, d: 3, u: 19, v: 8 }], [1.5, 16.94, -2.76], [-0.6981, -PI, 0]));
  root.add('right_wing', part([{ x: -0.5, y: 0, z: -1.5, w: 1, h: 5, d: 3, u: 19, v: 8 }], [-1.5, 16.94, -2.76], [-0.6981, -PI, 0]));
  const head = root.add('head', part([{ x: -1, y: -1.5, z: -1, w: 2, h: 3, d: 2, u: 2, v: 2 }], [0, 15.69, -2.76]));
  head.add('head2', part([{ x: -1, y: -0.5, z: -2, w: 2, h: 1, d: 4, u: 10, v: 0 }], [0, -2, -1]));
  head.add('beak1', part([{ x: -0.5, y: -1, z: -0.5, w: 1, h: 2, d: 1, u: 11, v: 7 }], [0, -0.5, -1.5]));
  head.add('beak2', part([{ x: -0.5, y: 0, z: -0.5, w: 1, h: 2, d: 1, u: 16, v: 7 }], [0, -1.75, -2.45]));
  head.add('feather', part([{ x: 0, y: -4, z: -2, w: 0, h: 5, d: 4, u: 2, v: 18 }], [0, -2.15, 0.15], [-0.2214, 0, 0]));
  root.add('left_leg', part([{ x: -0.5, y: 0, z: -0.5, w: 1, h: 2, d: 1, u: 14, v: 18 }], [1, 22, -1.05], [-0.0299, 0, 0]));
  root.add('right_leg', part([{ x: -0.5, y: 0, z: -0.5, w: 1, h: 2, d: 1, u: 14, v: 18 }], [-1, 22, -1.05], [-0.0299, 0, 0]));
  return { root, texW: 32, texH: 32 };
}

type State = 'flying' | 'standing' | 'sitting' | 'party' | 'on_shoulder';

/** vanilla ParrotModel.getState */
function stateOf(e: Parrot): State {
  if (e.partyParrot) return 'party';
  if (e.inSittingPose) return 'sitting';
  return e.isFlying() ? 'flying' : 'standing';
}

/**
 * vanilla ParrotModel.prepare then setupAnim (each frame from the model's rest pose, as the later versions do: the
 * party pose's splayed legs don't stay splayed after it). `age` is the bob: the wingbeat's lift, and the wings' spread.
 */
function animateParrot(root: ModelPart, state: State, tickCount: number, limbSwing: number, limbAmount: number, age: number, headYaw: number, headPitch: number): void {
  for (const [, c] of root.children) c.resetPose();
  const head = root.child('head'), body = root.child('body'), tail = root.child('tail');
  const lw = root.child('left_wing'), rw = root.child('right_wing'), ll = root.child('left_leg'), rl = root.child('right_leg');
  ll.z = rl.z = -1;
  if (state === 'sitting') {
    head.y = 17.59;
    tail.xRot = 1.5388988;
    tail.y = 22.97;
    body.y = 18.4;
    lw.zRot = -0.0873;
    lw.y = 18.84;
    rw.zRot = 0.0873;
    rw.y = 18.84;
    ll.y++;
    rl.y++;
    ll.xRot++;
    rl.xRot++;
  } else if (state === 'party') {
    ll.zRot = -PI / 9;
    rl.zRot = PI / 9;
  } else if (state === 'flying') {
    ll.xRot += (PI * 2) / 9;
    rl.xRot += (PI * 2) / 9;
  }
  head.xRot = headPitch * RAD;
  head.yRot = headYaw * RAD;
  if (state === 'sitting') return;
  if (state === 'party') {
    const f = Math.cos(tickCount), f1 = Math.sin(tickCount);
    head.x = f;
    head.y = 15.69 + f1;
    head.xRot = 0;
    head.yRot = 0;
    head.zRot = Math.sin(tickCount) * 0.4;
    body.x = f;
    body.y = 16.5 + f1;
    lw.zRot = -0.0873 - age;
    lw.x = 1.5 + f;
    lw.y = 16.94 + f1;
    rw.zRot = 0.0873 + age;
    rw.x = -1.5 + f;
    rw.y = 16.94 + f1;
    tail.x = f;
    tail.y = 21.07 + f1;
    return;
  }
  if (state === 'standing') {
    ll.xRot += Math.cos(limbSwing * 0.6662) * 1.4 * limbAmount;
    rl.xRot += Math.cos(limbSwing * 0.6662 + PI) * 1.4 * limbAmount;
  }
  const f2 = age * 0.3;
  head.y = 15.69 + f2;
  tail.xRot = 1.015 + Math.cos(limbSwing * 0.6662) * 0.3 * limbAmount;
  tail.y = 21.07 + f2;
  body.y = 16.5 + f2;
  lw.zRot = -0.0873 - age;
  lw.y = 16.94 + f2;
  rw.zRot = 0.0873 + age;
  rw.y = 16.94 + f2;
  ll.y = 22 + f2;
  rl.y = 22 + f2;
}

/** vanilla ParrotRenderer.getBob: the wingbeat's lift, 0 at rest */
function bob(e: Parrot, p: number): number {
  const f = e.oFlap + (e.flap - e.oFlap) * p;
  const f1 = e.oFlapSpeed + (e.flapSpeed - e.oFlapSpeed) * p;
  return (Math.sin(f) + 1) * f1;
}

/** vanilla ParrotRenderer's shadow */
export const PARROT_SHADOW_RADII: Record<string, number> = { parrot: 0.3 };

export class ParrotRenderers {
  private readonly model = parrotModel();

  constructor(private readonly kit: LivingKit) {}

  /** draws `e` if it's a parrot (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (!(e instanceof Parrot)) return false;
    const kit = this.kit;
    const tex = kit.tex('parrot_' + PARROT_VARIANTS[e.variant]);
    if (!tex) return true;
    const a: LivingAnim = kit.setupLiving(e, dx, dy, dz, p, 90);
    animateParrot(this.model.root, stateOf(e), e.tickCount, a.limbSwing, a.limbAmount, bob(e, p), a.headYaw, a.headPitch);
    kit.overlay(b, e);
    kit.drawBody(b, e, this.model, tex, false);
    b.setOverlay(0, 0, 0, 0);
    return true;
  }

  /**
   * vanilla ParrotOnShoulderLayer: the parrot whose record `d` is, on the left or right shoulder, in the player's
   * model frame (`pose`); never flashing red with them (NO_OVERLAY)
   */
  renderOnShoulder(b: EntityBatch, pose: PoseStack, d: SavedEntity, left: boolean, crouching: boolean, a: LivingAnim, tickCount: number): void {
    if (d.id !== 'parrot') return;
    const tex = this.kit.tex('parrot_' + PARROT_VARIANTS[shoulderVariant(d)]);
    if (!tex) return;
    pose.push();
    pose.translate(left ? 0.4 : -0.4, crouching ? -1.3 : -1.5, 0);
    animateParrot(this.model.root, 'on_shoulder', tickCount, a.limbSwing, a.limbAmount, 0, a.headYaw, a.headPitch);
    b.setOverlay(0, 0, 0, 0);
    b.begin(this.kit.state(tex));
    this.model.root.render(b, pose, 32, 32);
    pose.pop();
  }
}
