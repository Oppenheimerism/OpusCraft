// (remaining mobs: the panda) Pandas: vanilla PandaRenderer with PandaModel (64x64), a QuadrupedModel with a big round
// head (snout and ears on it) and a long body on four stout legs, the skin its gene's. It walks as any quadruped; it
// sits back on its haunches (tipped up and back, forelegs out and head up), munching with its head bobbing and its
// forepaws working at what it holds; a worried one cowers there in a storm, head down, trembling; a lazy one lies on
// its back with its paws waving; a playful one (or a cub) rolls head over heels; one that's sulking shakes its head,
// and a cub about to sneeze throws its head back. A cub has its head drawn big, as the other young animals.

import type { EntityBatch } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import type { MobModelDef } from './mobModels';
import type { LivingKit, LivingAnim } from './illagerRenderers';
import type { Mob } from '../entity/mob';
import { Panda } from '../entity/panda';
import '../textures/panda';

const PI = Math.PI;
const RAD = PI / 180;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

/** vanilla PandaModel.createBodyLayer (64x64; the young as QuadrupedModel(true, 23, 4.8, 2.7, 3, 49)) */
export function pandaModel(): MobModelDef {
  const root = new ModelPart();
  root.add('head', part([
    { x: -6.5, y: -5, z: -4, w: 13, h: 10, d: 9, u: 0, v: 6 },
    { x: -3.5, y: 0, z: -6, w: 7, h: 5, d: 2, u: 45, v: 16 },
    { x: 3.5, y: -8, z: -1, w: 5, h: 4, d: 1, u: 52, v: 25 },
    { x: -8.5, y: -8, z: -1, w: 5, h: 4, d: 1, u: 52, v: 25 },
  ], [0, 11.5, -17]));
  root.add('body', part([{ x: -9.5, y: -13, z: -6.5, w: 19, h: 26, d: 13, u: 0, v: 25 }], [0, 10, 0], [PI / 2, 0, 0]));
  const leg: Cube = { x: -3, y: 0, z: -3, w: 6, h: 9, d: 6, u: 40, v: 0 };
  root.add('right_hind_leg', part([leg], [-5.5, 15, 9]));
  root.add('left_hind_leg', part([leg], [5.5, 15, 9]));
  root.add('right_front_leg', part([leg], [-5.5, 15, -9]));
  root.add('left_front_leg', part([leg], [5.5, 15, -9]));
  return { root, texW: 64, texH: 64, baby: { headParts: ['head'], scaleHead: true, yHead: 23, zHead: 4.8, headScale: 2.7, bodyScale: 3, bodyY: 49 } };
}

/** vanilla ModelUtils.rotlerpRad: from `a` toward `b` by `t`, the short way round */
function rotlerpRad(a: number, b: number, t: number): number {
  let f = b - a;
  while (f < -PI) f += PI * 2;
  while (f >= PI) f -= PI * 2;
  return a + t * f;
}

/**
 * vanilla QuadrupedModel.setupAnim then PandaModel's (prepareMobModel's amounts: sitting, on its back, rolling — a
 * cub never rolls in the model), from the rest pose each frame
 */
export function animatePanda(root: ModelPart, e: Panda, a: LivingAnim, p: number): void {
  for (const [, c] of root.children) c.resetPose();
  const head = root.child('head'), body = root.child('body');
  const rh = root.child('right_hind_leg'), lh = root.child('left_hind_leg'), rf = root.child('right_front_leg'), lf = root.child('left_front_leg');
  const age = a.age;
  head.xRot = a.headPitch * RAD;
  head.yRot = a.headYaw * RAD;
  const f = Math.cos(a.limbSwing * 0.6662) * 1.4 * a.limbAmount, g = Math.cos(a.limbSwing * 0.6662 + PI) * 1.4 * a.limbAmount;
  rh.xRot = f;
  lh.xRot = g;
  rf.xRot = g;
  lf.xRot = f;
  const sit = e.sitAmountAt(p), back = e.onBackAmountAt(p), roll = e.isBaby() ? 0 : e.rollAmountAt(p);
  // sulking: the head shaking, the forelegs pawing
  if (e.unhappyCounter > 0) {
    head.yRot = 0.35 * Math.sin(0.6 * age);
    head.zRot = 0.35 * Math.sin(0.6 * age);
    rf.xRot = -0.75 * Math.sin(0.3 * age);
    lf.xRot = 0.75 * Math.sin(0.3 * age);
  } else head.zRot = 0;
  // about to sneeze: the head goes back over 14 ticks, and holds there (vanilla's whole-number step keeps it back)
  if (e.isSneezing()) {
    const i = e.sneezeCounter;
    if (i < 15) head.xRot = (-PI / 4 * i) / 14;
    else if (i < 20) head.xRot = -PI / 4 + (PI / 4) * Math.trunc((i - 15) / 5);
  }
  if (sit > 0) {
    body.xRot = rotlerpRad(body.xRot, 1.7407963, sit);
    head.xRot = rotlerpRad(head.xRot, PI / 2, sit);
    rf.zRot = -0.27079642;
    lf.zRot = 0.27079642;
    rh.zRot = 0.5707964;
    lh.zRot = -0.5707964;
    if (e.isEating()) {
      head.xRot = PI / 2 + 0.2 * Math.sin(age * 0.6);
      rf.xRot = -0.4 - 0.2 * Math.sin(age * 0.6);
      lf.xRot = -0.4 - 0.2 * Math.sin(age * 0.6);
    }
    if (e.isScared()) {
      head.xRot = 2.1707964;
      rf.xRot = -0.9;
      lf.xRot = -0.9;
    }
  } else {
    rh.zRot = 0;
    lh.zRot = 0;
    rf.zRot = 0;
    lf.zRot = 0;
  }
  if (back > 0) {
    rh.xRot = -0.6 * Math.sin(age * 0.15);
    lh.xRot = 0.6 * Math.sin(age * 0.15);
    rf.xRot = 0.3 * Math.sin(age * 0.25);
    lf.xRot = -0.3 * Math.sin(age * 0.25);
    head.xRot = rotlerpRad(head.xRot, PI / 2, back);
  }
  if (roll > 0) {
    head.xRot = rotlerpRad(head.xRot, 2.0561945, roll);
    rh.xRot = -0.5 * Math.sin(age * 0.5);
    lh.xRot = 0.5 * Math.sin(age * 0.5);
    rf.xRot = 0.5 * Math.sin(age * 0.5);
    lf.xRot = -0.5 * Math.sin(age * 0.5);
  }
}

/** vanilla PandaRenderer.getAngle: the next step's angle, eased into, until the quarter turn's last */
function rollAngle(cur: number, next: number, step: number, p: number, threshold: number): number {
  return step < threshold ? cur + (next - cur) * p : cur;
}

/** vanilla PandaRenderer's shadow (a cub's half) */
export const PANDA_SHADOW_RADII: Record<string, number> = { panda: 0.9 };

/** vanilla PandaRenderer.TEXTURES: the skin for the gene it shows */
export function pandaTexture(e: Panda): string {
  const v = e.variant();
  return v === 'normal' ? 'panda' : `${v}_panda`;
}

export class PandaRenderers {
  private readonly model = pandaModel();

  constructor(private readonly kit: LivingKit) {}

  /** draws `e` if it's a panda (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (!(e instanceof Panda)) return false;
    const kit = this.kit;
    const tex = kit.tex(pandaTexture(e)) ?? kit.tex('panda');
    if (!tex) return true;
    // vanilla PandaRenderer.setupRotations (after the body's turn and before the model's flip: here after the flip,
    // so each move up is down and each turn about x or y the other way)
    const a = kit.setupLiving(e, dx, dy, dz, p, 90, (pose) => {
      // rolling: head over heels a quarter turn each seven ticks, lifted as it goes over
      const i = e.rollCounter;
      if (i > 0) {
        const j = i + 1, f1 = e.isBaby() ? 0.3 : 0.8;
        if (i < 8) {
          const f2 = rollAngle((90 * i) / 7, (90 * j) / 7, j, p, 8);
          pose.translate(0, -(f1 + 0.2) * (f2 / 90), 0);
          pose.rotX(f2);
        } else if (i < 16) {
          const f = 90 + 90 * ((i - 8) / 7), f5 = 90 + (90 * (j - 8)) / 7;
          const f10 = rollAngle(f, f5, j, p, 16);
          pose.translate(0, -(f1 + 0.2 + ((f1 - 0.2) * (f10 - 90)) / 90), 0);
          pose.rotX(f10);
        } else if (i < 24) {
          const f = 180 + 90 * ((i - 16) / 7), f19 = 180 + (90 * (j - 16)) / 7;
          const f11 = rollAngle(f, f19, j, p, 24);
          pose.translate(0, -(f1 + (f1 * (270 - f11)) / 90), 0);
          pose.rotX(f11);
        } else if (i < 32) {
          const f = 270 + 90 * ((i - 24) / 7), f20 = 270 + (90 * (j - 24)) / 7;
          const f12 = rollAngle(f, f20, j, p, 32);
          pose.translate(0, -(f1 * ((360 - f12) / 90)), 0);
          pose.rotX(f12);
        }
      }
      // sitting: tipped back onto its haunches (a cowering one trembling from side to side; a cub cowering sits lower)
      // (vanilla getXRot: this tick's, not eased)
      const pitch = e.pitch;
      const f6 = e.sitAmountAt(p);
      if (f6 > 0) {
        pose.translate(0, -0.8 * f6, 0);
        pose.rotX(-(pitch + (pitch + 90 - pitch) * f6));
        pose.translate(0, 1 * f6, 0);
        if (e.isScared()) {
          const f7 = Math.cos(e.tickCount * 1.25) * PI * 0.05;
          pose.rotY(-f7);
          if (e.isBaby()) pose.translate(0, -0.8, 0.55);
        }
      }
      // on its back: rolled right over and lifted by its girth
      const f8 = e.onBackAmountAt(p);
      if (f8 > 0) {
        const f9 = e.isBaby() ? 0.5 : 1.3;
        pose.translate(0, -f9 * f8, 0);
        pose.rotX(-(pitch + (pitch + 180 - pitch) * f8));
      }
    });
    animatePanda(this.model.root, e, a, p);
    kit.overlay(b, e);
    kit.drawBody(b, e, this.model, tex, e.isBaby());
    b.setOverlay(0, 0, 0, 0);
    // vanilla PandaHoldsItemLayer: sitting (and not cowering), what it holds, before its chest, bobbing as it eats
    const held = e.mainHand;
    if (held && e.isSitting() && !e.isScared()) {
      let f = -0.6, f1 = 1.4;
      if (e.isEating()) {
        f -= 0.2 * Math.sin(a.age * 0.6) + 0.2;
        f1 -= 0.09 * Math.sin(a.age * 0.6);
      }
      const pose = kit.pose;
      pose.push();
      pose.translate(0.1, f1, f);
      kit.items.render(b, pose, held, 'ground', false);
      pose.pop();
    }
    return true;
  }
}
