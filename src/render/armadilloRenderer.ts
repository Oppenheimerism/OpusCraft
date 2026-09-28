// (remaining mobs: the armadillo) Armadillos: vanilla ArmadilloRenderer with ArmadilloModel, 64x64 — a long low body
// under a banded shell (the shell a hair bigger than the body, open underneath where the skin shows), a small
// pointed head hung low with two tall ears, four stubby legs, a thin tail angled down behind; and, rolled up, a ball
// ten pixels across in its place, with only the head and front legs (tucked inside it) still drawn with it. A baby
// is the whole of it at 0.6. Its moves are keyframed (vanilla ArmadilloAnimation, authored afresh here): it walks
// with quick little steps, the body swaying; rolling up it tips its nose down and tucks its head and legs in, and the
// ball drops into place with a squash; rolled up, it peeks out now and then, its head poking out of the front of the
// ball and looking about before it pulls back in; rolling out, the ball rocks and the head comes out, then it
// unfolds.

import type { EntityBatch } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import { applyAnimation, type AnimationDef, type MobModelDef } from './mobModels';
import type { LivingKit } from './illagerRenderers';
import type { Mob } from '../entity/mob';
import { Armadillo, ARMADILLO_BABY_SCALE, type ArmadilloAnim } from '../entity/armadillo';
import '../textures/armadillo';

const RAD = Math.PI / 180;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

/**
 * vanilla ArmadilloModel.createBodyLayer (64x64). The body's own two boxes are a part of their own here
 * ('body_cubes'), so that hiding them (vanilla body.skipDraw) leaves its head drawn
 */
export function armadilloModel(): MobModelDef {
  const root = new ModelPart();
  const body = root.add('body', part([], [0, 21, 4]));
  body.add(
    'body_cubes',
    part([
      { x: -4, y: -7, z: -10, w: 8, h: 8, d: 12, u: 0, v: 20, inflate: 0.3 },
      { x: -4, y: -7, z: -10, w: 8, h: 8, d: 12, u: 0, v: 40 },
    ]),
  );
  body.add('tail', part([{ x: -0.5, y: -0.0865, z: 0.0933, w: 1, h: 6, d: 1, u: 44, v: 53 }], [0, -3, 1], [0.5061, 0, 0]));
  const head = body.add('head', part([], [0, -2, -11]));
  head.add('head_cube', part([{ x: -1.5, y: -1, z: -1, w: 3, h: 5, d: 2, u: 43, v: 15 }], [0, 0, 0], [-0.3927, 0, 0]));
  const rightEar = head.add('right_ear', part([], [-1, -1, 0]));
  rightEar.add('right_ear_cube', part([{ x: -2, y: -3, z: 0, w: 2, h: 5, d: 0, u: 43, v: 10 }], [-0.5, 0, -0.6], [0.1886, -0.3864, -0.0718]));
  const leftEar = head.add('left_ear', part([], [1, -2, 0]));
  leftEar.add('left_ear_cube', part([{ x: 0, y: -3, z: 0, w: 2, h: 5, d: 0, u: 47, v: 10 }], [0.5, 1, -0.6], [0.1886, 0.3864, 0.0718]));
  const leg = (u: number, v: number): Cube => ({ x: -1, y: 0, z: -1, w: 2, h: 3, d: 2, u, v });
  root.add('right_hind_leg', part([leg(51, 31)], [-2, 21, 4]));
  root.add('left_hind_leg', part([leg(42, 31)], [2, 21, 4]));
  root.add('right_front_leg', part([leg(51, 43)], [-2, 21, -4]));
  root.add('left_front_leg', part([leg(42, 43)], [2, 21, -4]));
  root.add('cube', part([{ x: -5, y: -10, z: -6, w: 10, h: 10, d: 10, u: 0, v: 0 }], [0, 24, 0]));
  return { root, texW: 64, texH: 64 };
}

// ---------------------------------------------------------------------------
// its moves (keyframed as vanilla's ArmadilloAnimation is; rotations in degrees, positions in pixels up)

type V = [number, number, number];
type Keys = [number, V][];
const rot = (bone: string, keys: Keys) => ({ bone, target: 'rotation' as const, keys });
const pos = (bone: string, keys: Keys) => ({ bone, target: 'position' as const, keys });
const scl = (bone: string, keys: Keys) => ({ bone, target: 'scale' as const, keys });
/** a cycle through these values at even steps over `len`, back to the first at the end, on one axis */
const cycle = (len: number, axis: 0 | 1 | 2, a: number[]): Keys => [
  ...a.map((d, i): [number, V] => {
    const v: V = [0, 0, 0];
    v[axis] = d;
    return [(len * i) / a.length, v];
  }),
  [len, ((): V => {
    const v: V = [0, 0, 0];
    v[axis] = a[0];
    return v;
  })()],
];

/** in the ball: the head drawn back inside it (from the front of the body into the ball's middle) */
const HEAD_IN: V = [0, 0, 4];
const ONE: V = [1, 1, 1];

/** walking (vanilla ArmadilloAnimation.ARMADILLO_WALK's length): quick diagonal steps, the body swaying, the tail wagging */
export const ARMADILLO_WALK: AnimationDef = {
  length: 1.4583,
  looping: true,
  channels: [
    rot('right_front_leg', cycle(1.4583, 0, [0, 30, 0, -30])),
    rot('left_hind_leg', cycle(1.4583, 0, [0, 30, 0, -30])),
    rot('left_front_leg', cycle(1.4583, 0, [0, -30, 0, 30])),
    rot('right_hind_leg', cycle(1.4583, 0, [0, -30, 0, 30])),
    rot('body', cycle(1.4583, 2, [0, 2.5, 0, -2.5])),
    pos('body', cycle(1.4583, 1, [0, 0.3, 0, 0.3])),
    rot('head', cycle(1.4583, 0, [0, 4, 0, 4])),
    rot('tail', cycle(1.4583, 1, [0, 12, 0, -12])),
  ],
};

/**
 * rolling up (0.5 s): the nose goes down and the head and legs tuck in as the back arches (the body is shown for its
 * first six ticks), and the ball drops into place with a squash
 */
export const ARMADILLO_ROLL_UP: AnimationDef = {
  length: 0.5,
  looping: false,
  channels: [
    rot('body', [[0, [0, 0, 0]], [0.15, [12, 0, 0]], [0.3, [22, 0, 0]], [0.5, [0, 0, 0]]]),
    pos('body', [[0, [0, 0, 0]], [0.15, [0, 0.5, 0]], [0.3, [0, 0, 0]], [0.5, [0, 0, 0]]]),
    rot('head', [[0, [0, 0, 0]], [0.2, [35, 0, 0]], [0.3, [35, 0, 0]], [0.5, [0, 0, 0]]]),
    pos('head', [[0, [0, 0, 0]], [0.25, [0, -0.5, 3]], [0.3, HEAD_IN], [0.5, HEAD_IN]]),
    rot('tail', [[0, [0, 0, 0]], [0.25, [-40, 0, 0]], [0.5, [-40, 0, 0]]]),
    rot('right_front_leg', [[0, [0, 0, 0]], [0.25, [-40, 0, 0]], [0.3, [0, 0, 0]]]),
    rot('left_front_leg', [[0, [0, 0, 0]], [0.25, [-40, 0, 0]], [0.3, [0, 0, 0]]]),
    rot('right_hind_leg', [[0, [0, 0, 0]], [0.25, [40, 0, 0]], [0.3, [0, 0, 0]]]),
    rot('left_hind_leg', [[0, [0, 0, 0]], [0.25, [40, 0, 0]], [0.3, [0, 0, 0]]]),
    scl('cube', [[0, [0.85, 0.85, 0.85]], [0.3, [0.85, 0.85, 0.85]], [0.375, [1.08, 0.9, 1.08]], [0.45, [0.97, 1.04, 0.97]], [0.5, ONE]]),
  ],
};

/**
 * peeking out (2.5 s, rolled up): the ball lifts a little at the front as the head pokes out, looks one way and then
 * the other, and draws back in; played to its end, it's the ball at rest
 */
export const ARMADILLO_PEEK: AnimationDef = {
  length: 2.5,
  looping: false,
  channels: [
    pos('head', [[0, HEAD_IN], [0.3, [0, 0, 2.5]], [0.5, [0, 0.5, 1.5]], [1.75, [0, 0.5, 1.5]], [2.1, HEAD_IN], [2.5, HEAD_IN]]),
    rot('head', [[0, [0, 0, 0]], [0.5, [-12, 0, 0]], [0.8, [-12, 25, 0]], [1.2, [-12, 25, 0]], [1.45, [-12, -25, 0]], [1.75, [-12, 0, 0]], [2.1, [0, 0, 0]], [2.5, [0, 0, 0]]]),
    rot('cube', [[0, [0, 0, 0]], [0.3, [-4, 0, 0]], [1.75, [-4, 0, 0]], [2.1, [0, 0, 0]], [2.5, [0, 0, 0]]]),
  ],
};

/**
 * rolling out (1.5 s): the ball rocks side to side and the head works its way out (it's still a ball for 26 ticks),
 * then it's out, the back unarching and the head coming up to where it belongs
 */
export const ARMADILLO_ROLL_OUT: AnimationDef = {
  length: 1.5,
  looping: false,
  channels: [
    rot('cube', [[0, [0, 0, 0]], [0.25, [0, 0, 6]], [0.5, [0, 0, -6]], [0.75, [0, 0, 5]], [1.0, [0, 0, -3]], [1.2, [-5, 0, 0]], [1.3, [0, 0, 0]]]),
    pos('head', [[0, HEAD_IN], [0.9, HEAD_IN], [1.2, [0, 0, 2]], [1.3, [0, 0, 1.5]], [1.5, [0, 0, 0]]]),
    rot('head', [[0, [0, 0, 0]], [1.3, [25, 0, 0]], [1.5, [0, 0, 0]]]),
    rot('body', [[0, [0, 0, 0]], [1.3, [14, 0, 0]], [1.5, [0, 0, 0]]]),
    rot('tail', [[0, [-40, 0, 0]], [1.3, [-40, 0, 0]], [1.5, [0, 0, 0]]]),
    rot('right_hind_leg', [[0, [0, 0, 0]], [1.3, [30, 0, 0]], [1.5, [0, 0, 0]]]),
    rot('left_hind_leg', [[0, [0, 0, 0]], [1.3, [30, 0, 0]], [1.5, [0, 0, 0]]]),
  ],
};

/** the seconds one of its animations has run (vanilla AnimationState.getAccumulatedTime), -1 while it's stopped */
function since(e: Armadillo, s: ArmadilloAnim, p: number): number {
  return s.start < 0 ? -1 : Math.max(0, (e.tickCount + p - s.start + s.ff) * 0.05);
}

/**
 * vanilla ArmadilloModel.setupAnim: in its shell, the body's own boxes, hind legs and tail hidden and the ball shown;
 * out of it, the other way round and the head turned where it looks (up to 32.5 degrees either side, 22.5 up and 25
 * down); then the walk as fast as it's going (HierarchicalModel.animateWalk(WALK, 16.5, 2.5)), and the roll out,
 * roll up and peek as they're playing
 */
export function animateArmadillo(root: ModelPart, e: Armadillo, limbSwing: number, limbAmount: number, headYaw: number, headPitch: number, p: number): void {
  root.resetPose();
  const hidden = e.shouldHideInShell();
  const body = root.child('body');
  body.child('body_cubes').visible = !hidden;
  root.child('left_hind_leg').visible = root.child('right_hind_leg').visible = !hidden;
  body.child('tail').visible = !hidden;
  root.child('cube').visible = hidden;
  if (!hidden) {
    const head = body.child('head');
    head.xRot = Math.max(-22.5, Math.min(25, headPitch)) * RAD;
    head.yRot = Math.max(-32.5, Math.min(32.5, headYaw)) * RAD;
  }
  applyAnimation(root, ARMADILLO_WALK, Math.floor(limbSwing * 50 * 16.5) / 1000, Math.min(limbAmount * 2.5, 1));
  const a = e.anim;
  const out = since(e, a.rollOut, p), up = since(e, a.rollUp, p), peek = since(e, a.peek, p);
  if (out >= 0) applyAnimation(root, ARMADILLO_ROLL_OUT, out);
  if (up >= 0) applyAnimation(root, ARMADILLO_ROLL_UP, up);
  if (peek >= 0) applyAnimation(root, ARMADILLO_PEEK, peek);
}

/** vanilla ArmadilloRenderer's shadow radius (a baby's at its 0.6: LivingEntityRenderer.getShadowRadius) */
export const ARMADILLO_SHADOW_RADII: Record<string, number> = { armadillo: 0.4 };

export class ArmadilloRenderers {
  private readonly model = armadilloModel();

  constructor(private readonly kit: LivingKit) {}

  /** draws `e` if it's an armadillo (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (!(e instanceof Armadillo)) return false;
    const kit = this.kit;
    const tex = kit.tex('armadillo');
    if (!tex) return true;
    // (vanilla LivingEntityRenderer.render: a baby scaled whole, at its feet, by getAgeScale)
    const s = e.isBaby() ? ARMADILLO_BABY_SCALE : 1;
    const a = kit.setupLiving(e, dx, dy, dz, p, 90, s !== 1 ? (pose) => pose.scale(s, s, s) : undefined);
    animateArmadillo(this.model.root, e, a.limbSwing, a.limbAmount, a.headYaw, a.headPitch, p);
    kit.overlay(b, e);
    kit.drawBody(b, e, this.model, tex, false);
    b.setOverlay(0, 0, 0, 0);
    return true;
  }
}
