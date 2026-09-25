// The turtle's renderer (Stage 5: ocean, M6; vanilla TurtleRenderer with TurtleModel, 128x64): the head, the shell
// (the carapace and the plastron under it, turned onto its back), the four flippers, and the egg belly beneath, shown
// (and the whole turtle raised a little over it) while a grown turtle carries eggs. In the water its flippers beat
// together; on land they paddle, the front ones swinging wide, and faster and wider still while it digs to lay. A baby
// is the model drawn a sixth the size (vanilla's baby head and body scales). The steps every living renderer shares
// are the dispatcher's, lent through LivingKit.

import type { EntityBatch } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import type { MobModelDef } from './mobModels';
import type { LivingKit } from './illagerRenderers';
import type { Turtle } from '../entity/turtle';
import '../textures/turtle';

const PI = Math.PI;
const RAD = PI / 180;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}
const box = (x: number, y: number, z: number, w: number, h: number, d: number, u: number, v: number): Cube => ({ x, y, z, w, h, d, u, v, inflate: 0, mirror: false });

/**
 * vanilla TurtleModel.createBodyLayer, with its QuadrupedModel baby transforms (the head and the body both scaled to a
 * sixth, 120 pixels down)
 */
export function turtleModel(): MobModelDef {
  const root = new ModelPart();
  root.add('head', part([box(-3, -1, -3, 6, 5, 6, 3, 0)], [0, 19, -10]));
  root.add('body', part([box(-9.5, 3, -10, 19, 20, 6, 7, 37), box(-5.5, 3, -13, 11, 18, 3, 31, 1)], [0, 11, -10], [PI / 2, 0, 0]));
  root.add('egg_belly', part([box(-4.5, 3, -14, 9, 18, 1, 70, 33)], [0, 11, -10], [PI / 2, 0, 0]));
  root.add('right_hind_leg', part([box(-2, 0, 0, 4, 1, 10, 1, 23)], [-3.5, 22, 11]));
  root.add('left_hind_leg', part([box(-2, 0, 0, 4, 1, 10, 1, 12)], [3.5, 22, 11]));
  root.add('right_front_leg', part([box(-13, 0, -2, 13, 1, 5, 27, 30)], [-5, 21, -4]));
  root.add('left_front_leg', part([box(0, 0, -2, 13, 1, 5, 27, 24)], [5, 21, -4]));
  return { root, texW: 128, texH: 64, baby: { headParts: ['head'], scaleHead: true, yHead: 120, zHead: 0, headScale: 9, bodyScale: 6, bodyY: 120 } };
}

/** vanilla TurtleModel.setupAnim (after QuadrupedModel's head turn) */
export function animateTurtle(root: ModelPart, e: Turtle, limbSwing: number, limbAmount: number, headYaw: number, headPitch: number): void {
  const head = root.child('head');
  head.xRot = headPitch * RAD;
  head.yRot = headYaw * RAD;
  const rh = root.child('right_hind_leg'), lh = root.child('left_hind_leg'), rf = root.child('right_front_leg'), lf = root.child('left_front_leg');
  // swimming: the flippers beat up and down together, fore against hind
  const s = limbSwing * 0.6662 * 0.6;
  rh.xRot = Math.cos(s) * 0.5 * limbAmount;
  lh.xRot = Math.cos(s + PI) * 0.5 * limbAmount;
  rf.zRot = Math.cos(s + PI) * 0.5 * limbAmount;
  lf.zRot = Math.cos(s) * 0.5 * limbAmount;
  rf.xRot = lf.xRot = rf.yRot = lf.yRot = rh.yRot = lh.yRot = 0;
  if (!e.inWater && e.onGround) {
    // on land: the flippers swing to and fro, the front ones wide (and, digging to lay, four times as fast and twice as far)
    const f = e.isLayingEgg() ? 4 : 1, f1 = e.isLayingEgg() ? 2 : 1;
    rf.yRot = Math.cos(f * limbSwing * 5 + PI) * 8 * limbAmount * f1;
    rf.zRot = 0;
    lf.yRot = Math.cos(f * limbSwing * 5) * 8 * limbAmount * f1;
    lf.zRot = 0;
    rh.yRot = Math.cos(limbSwing * 5 + PI) * 3 * limbAmount;
    rh.xRot = 0;
    lh.yRot = Math.cos(limbSwing * 5) * 3 * limbAmount;
    lh.xRot = 0;
  }
  root.child('egg_belly').visible = !e.isBaby() && e.hasEgg;
}

export class TurtleRenderer {
  private readonly model = turtleModel();

  constructor(private readonly kit: LivingKit) {}

  render(b: EntityBatch, e: Turtle, dx: number, dy: number, dz: number, p: number): void {
    const kit = this.kit, def = this.model;
    const tex = kit.tex('turtle');
    if (!tex) return;
    const baby = e.isBaby();
    // (vanilla TurtleModel.renderToBuffer: with the egg belly showing, all of it is drawn 0.08 higher)
    const egg = !baby && e.hasEgg;
    const a = kit.setupLiving(e, dx, dy, dz, p, 90, egg ? (pose) => pose.translate(0, -0.08, 0) : undefined);
    animateTurtle(def.root, e, a.limbSwing, a.limbAmount, a.headYaw, a.headPitch);
    kit.overlay(b, e);
    kit.drawBody(b, e, def, tex, baby);
    b.setOverlay(0, 0, 0, 0);
  }
}
