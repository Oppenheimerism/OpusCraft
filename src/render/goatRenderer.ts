// Goats (M8): vanilla GoatRenderer with GoatModel, 64x64 — a quadruped with a shaggy chest, a long face angled down
// (its "nose"), ears standing out, a beard, and two horns, each gone once it has snapped off; walking as any
// quadruped, and lowering its head to ram (up to 30 degrees down, in place of its look up or down). A kid as
// QuadrupedModel(true, 19, 1, 2.5, 2, 24): its head drawn big.

import type { EntityBatch } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import type { MobModelDef } from './mobModels';
import type { LivingKit, LivingAnim } from './illagerRenderers';
import type { Mob } from '../entity/mob';
import { Goat } from '../entity/goat';
import '../textures/goat';

const PI = Math.PI;
const RAD = PI / 180;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

/** vanilla GoatModel.createBodyLayer, 64x64 */
export function goatModel(): MobModelDef {
  const root = new ModelPart();
  const head = part([
    { x: -6, y: -11, z: -10, w: 3, h: 2, d: 1, u: 2, v: 61 },
    // (vanilla: mirrored from here on)
    { x: 2, y: -11, z: -10, w: 3, h: 2, d: 1, u: 2, v: 61, mirror: true },
    { x: -0.5, y: -3, z: -14, w: 0, h: 7, d: 5, u: 23, v: 52, mirror: true },
  ], [1, 14, 0]);
  head.add('left_horn', part([{ x: -0.01, y: -16, z: -10, w: 2, h: 7, d: 2, u: 12, v: 55 }]));
  head.add('right_horn', part([{ x: -2.99, y: -16, z: -10, w: 2, h: 7, d: 2, u: 12, v: 55 }]));
  head.add('nose', part([{ x: -3, y: -4, z: -8, w: 5, h: 7, d: 10, u: 34, v: 46 }], [0, -8, -8], [0.9599, 0, 0]));
  root.add('head', head);
  root.add('body', part([
    { x: -4, y: -17, z: -7, w: 9, h: 11, d: 16, u: 1, v: 1 },
    { x: -5, y: -18, z: -8, w: 11, h: 14, d: 11, u: 0, v: 28 },
  ], [0, 24, 0]));
  root.add('left_hind_leg', part([{ x: 0, y: 4, z: 0, w: 3, h: 6, d: 3, u: 36, v: 29 }], [1, 14, 4]));
  root.add('right_hind_leg', part([{ x: 0, y: 4, z: 0, w: 3, h: 6, d: 3, u: 49, v: 29 }], [-3, 14, 4]));
  root.add('left_front_leg', part([{ x: 0, y: 0, z: 0, w: 3, h: 10, d: 3, u: 49, v: 2 }], [1, 14, -6]));
  root.add('right_front_leg', part([{ x: 0, y: 0, z: 0, w: 3, h: 10, d: 3, u: 35, v: 2 }], [-3, 14, -6]));
  return { root, texW: 64, texH: 64, baby: { headParts: ['head'], scaleHead: true, yHead: 19, zHead: 1, headScale: 2.5, bodyScale: 2, bodyY: 24 } };
}

/** vanilla GoatModel.setupAnim: the horns it has, QuadrupedModel's walk and look, then the head lowered to ram */
export function animateGoat(root: ModelPart, e: Goat, a: LivingAnim): void {
  for (const [, c] of root.children) c.resetPose();
  const head = root.child('head');
  head.child('left_horn').visible = e.hasLeftHorn;
  head.child('right_horn').visible = e.hasRightHorn;
  head.xRot = a.headPitch * RAD;
  head.yRot = a.headYaw * RAD;
  const f = Math.cos(a.limbSwing * 0.6662) * 1.4 * a.limbAmount, g = Math.cos(a.limbSwing * 0.6662 + PI) * 1.4 * a.limbAmount;
  root.child('right_hind_leg').xRot = f;
  root.child('left_hind_leg').xRot = g;
  root.child('right_front_leg').xRot = g;
  root.child('left_front_leg').xRot = f;
  const ram = e.rammingXHeadRot();
  if (ram !== 0) head.xRot = ram;
}

/** vanilla GoatRenderer's shadow (a kid's half) */
export const GOAT_SHADOW_RADII: Record<string, number> = { goat: 0.7 };

export class GoatRenderers {
  private readonly model = goatModel();

  constructor(private readonly kit: LivingKit) {}

  /** draws `e` if it's a goat (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (!(e instanceof Goat)) return false;
    const kit = this.kit;
    const tex = kit.tex('goat');
    if (!tex) return true;
    const a = kit.setupLiving(e, dx, dy, dz, p, 90);
    animateGoat(this.model.root, e, a);
    kit.overlay(b, e);
    kit.drawBody(b, e, this.model, tex, e.isBaby());
    b.setOverlay(0, 0, 0, 0);
    return true;
  }
}
