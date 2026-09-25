// Frogs and tadpoles (M9): vanilla FrogRenderer with FrogModel, 48x48 — a squat body with the head on it (its mouth the
// seam between them, the mouth's roof and floor inside), two bulging eyes, a throat that swells as it croaks, a tongue
// folded in its mouth, splayed hands and feet laid flat — each of the three kinds its own skin; and TadpoleRenderer with
// TadpoleModel, 16x16, a speck of a body and a flat tail that wags. The frog's moves are keyframed (vanilla
// FrogAnimation, authored afresh here): it walks with its limbs in a diagonal gait, swims kicking its legs back, paddles
// gently while still in the water, leaps stretched out (held until it lands), puffs its throat twice as it croaks, and
// throws its head back to shoot its tongue out.

import type { EntityBatch } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import { applyAnimation, type AnimationDef, type MobModelDef } from './mobModels';
import type { LivingKit } from './illagerRenderers';
import type { Mob } from '../entity/mob';
import { Frog } from '../entity/frog';
import { Tadpole } from '../entity/tadpole';
import '../textures/frog';

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

/** vanilla FrogModel.createBodyLayer (48x48) */
export function frogModel(): MobModelDef {
  const top = new ModelPart();
  const root = top.add('root', part([], [0, 24, 0]));
  const body = root.add(
    'body',
    part(
      [
        { x: -3.5, y: -2, z: -8, w: 7, h: 3, d: 9, u: 3, v: 1 },
        { x: -3.5, y: -1, z: -8, w: 7, h: 0, d: 9, u: 23, v: 22 },
      ],
      [0, -2, 4],
    ),
  );
  const head = body.add(
    'head',
    part(
      [
        { x: -3.5, y: -1, z: -7, w: 7, h: 0, d: 9, u: 23, v: 13 },
        { x: -3.5, y: -2, z: -7, w: 7, h: 3, d: 9, u: 0, v: 13 },
      ],
      [0, -2, -1],
    ),
  );
  const eyes = head.add('eyes', part([], [-0.5, 0, 2]));
  eyes.add('right_eye', part([{ x: -1.5, y: -1, z: -1.5, w: 3, h: 2, d: 3, u: 0, v: 0 }], [-1.5, -3, -6.5]));
  eyes.add('left_eye', part([{ x: -1.5, y: -1, z: -1.5, w: 3, h: 2, d: 3, u: 0, v: 5 }], [2.5, -3, -6.5]));
  body.add('croaking_body', part([{ x: -3.5, y: -0.1, z: -2.9, w: 7, h: 2, d: 3, u: 26, v: 5, inflate: -0.1 }], [0, -1, -5]));
  body.add('tongue', part([{ x: -2, y: 0, z: -7.1, w: 4, h: 0, d: 7, u: 17, v: 13 }], [0, -1.01, 1]));
  const leftArm = body.add('left_arm', part([{ x: -1, y: 0, z: -1, w: 2, h: 3, d: 3, u: 0, v: 32 }], [4, -1, -6.5]));
  leftArm.add('left_hand', part([{ x: -4, y: 0.01, z: -5, w: 8, h: 0, d: 8, u: 18, v: 40 }], [0, 3, -1]));
  const rightArm = body.add('right_arm', part([{ x: -1, y: 0, z: -1, w: 2, h: 3, d: 3, u: 0, v: 38 }], [-4, -1, -6.5]));
  rightArm.add('right_hand', part([{ x: -4, y: 0.01, z: -4, w: 8, h: 0, d: 8, u: 2, v: 40 }], [0, 3, 0]));
  const leftLeg = root.add('left_leg', part([{ x: -1, y: 0, z: -2, w: 3, h: 3, d: 4, u: 14, v: 25 }], [3.5, -3, 4]));
  leftLeg.add('left_foot', part([{ x: -4, y: 0.01, z: -4, w: 8, h: 0, d: 8, u: 2, v: 32 }], [2, 3, 0]));
  const rightLeg = root.add('right_leg', part([{ x: -2, y: 0, z: -2, w: 3, h: 3, d: 4, u: 0, v: 25 }], [-3.5, -3, 4]));
  rightLeg.add('right_foot', part([{ x: -4, y: 0.01, z: -4, w: 8, h: 0, d: 8, u: 18, v: 32 }], [-2, 3, 0]));
  return { root: top, texW: 48, texH: 48 };
}

/** vanilla TadpoleModel.createBodyLayer (16x16) */
export function tadpoleModel(): MobModelDef {
  const root = new ModelPart();
  root.add('body', part([{ x: -1.5, y: -1, z: 0, w: 3, h: 2, d: 3, u: 0, v: 0 }], [0, 22, -3]));
  root.add('tail', part([{ x: 0, y: -1, z: 0, w: 0, h: 2, d: 7, u: 0, v: 0 }], [0, 22, 0]));
  return { root, texW: 16, texH: 16 };
}

// ---------------------------------------------------------------------------
// the frog's moves (keyframed as vanilla's FrogAnimation is; rotations in degrees, positions in pixels up)

type Keys = [number, [number, number, number]][];
const rot = (bone: string, keys: Keys) => ({ bone, target: 'rotation' as const, keys });
const pos = (bone: string, keys: Keys) => ({ bone, target: 'position' as const, keys });
const scl = (bone: string, keys: Keys) => ({ bone, target: 'scale' as const, keys });
/** an x rotation through a cycle: the angles at each quarter of `len`, back to the first at the end */
const swing = (len: number, a: number[]): Keys => [...a.map((d, i): [number, [number, number, number]] => [(len * i) / a.length, [d, 0, 0]]), [len, [a[0], 0, 0]]];

/** walking: a diagonal gait, each limb reaching forward as its opposite pushes back, the hands and feet kept flat */
const WALK: AnimationDef = {
  length: 1.25,
  looping: true,
  channels: [
    rot('left_arm', swing(1.25, [0, -25, 0, 15])),
    rot('left_hand', swing(1.25, [0, 25, 0, -15])),
    rot('right_arm', swing(1.25, [0, 15, 0, -25])),
    rot('right_hand', swing(1.25, [0, -15, 0, 25])),
    rot('right_leg', swing(1.25, [0, -20, 0, 20])),
    rot('right_foot', swing(1.25, [0, 20, 0, -20])),
    rot('left_leg', swing(1.25, [0, 20, 0, -20])),
    rot('left_foot', swing(1.25, [0, -20, 0, 20])),
    pos('left_arm', [[0, [0, 0, 0]], [0.3125, [0, 0.6, 0]], [0.625, [0, 0, 0]], [1.25, [0, 0, 0]]]),
    pos('right_arm', [[0, [0, 0, 0]], [0.625, [0, 0, 0]], [0.9375, [0, 0.6, 0]], [1.25, [0, 0, 0]]]),
    pos('right_leg', [[0, [0, 0, 0]], [0.3125, [0, 0.6, 0]], [0.625, [0, 0, 0]], [1.25, [0, 0, 0]]]),
    pos('left_leg', [[0, [0, 0, 0]], [0.625, [0, 0, 0]], [0.9375, [0, 0.6, 0]], [1.25, [0, 0, 0]]]),
    { bone: 'body', target: 'rotation', keys: [[0, [0, 0, 0]], [0.3125, [0, 5, 0]], [0.625, [0, 0, 0]], [0.9375, [0, -5, 0]], [1.25, [0, 0, 0]]] },
  ],
};

/** swimming: the legs kicking back together and drawn up again, the arms held back along the body */
const SWIM: AnimationDef = {
  length: 1.04,
  looping: true,
  channels: [
    rot('left_leg', [[0, [25, 0, 0]], [0.26, [95, 0, 0]], [0.52, [110, 0, 0]], [0.78, [60, 0, 0]], [1.04, [25, 0, 0]]]),
    rot('right_leg', [[0, [25, 0, 0]], [0.26, [95, 0, 0]], [0.52, [110, 0, 0]], [0.78, [60, 0, 0]], [1.04, [25, 0, 0]]]),
    rot('left_foot', [[0, [20, 0, 0]], [0.26, [-10, 0, 0]], [0.52, [-20, 0, 0]], [0.78, [0, 0, 0]], [1.04, [20, 0, 0]]]),
    rot('right_foot', [[0, [20, 0, 0]], [0.26, [-10, 0, 0]], [0.52, [-20, 0, 0]], [0.78, [0, 0, 0]], [1.04, [20, 0, 0]]]),
    rot('left_arm', [[0, [60, 0, 0]], [0.52, [75, 0, 0]], [1.04, [60, 0, 0]]]),
    rot('right_arm', [[0, [60, 0, 0]], [0.52, [75, 0, 0]], [1.04, [60, 0, 0]]]),
    rot('left_hand', [[0, [-30, 0, 0]], [0.52, [-40, 0, 0]], [1.04, [-30, 0, 0]]]),
    rot('right_hand', [[0, [-30, 0, 0]], [0.52, [-40, 0, 0]], [1.04, [-30, 0, 0]]]),
  ],
};

/** floating still: a slow paddle of all four, the body bobbing */
const IDLE_WATER: AnimationDef = {
  length: 3,
  looping: true,
  channels: [
    rot('left_leg', swing(3, [20, 35, 20, 10])),
    rot('right_leg', swing(3, [20, 10, 20, 35])),
    rot('left_arm', swing(3, [15, 30, 15, 5])),
    rot('right_arm', swing(3, [15, 5, 15, 30])),
    pos('body', [[0, [0, 0, 0]], [1.5, [0, 0.4, 0]], [3, [0, 0, 0]]]),
  ],
};

/** a leap: stretched out along it, nose up, legs thrown back and arms forward (held till it lands) */
const JUMP: AnimationDef = {
  length: 0.5,
  looping: false,
  channels: [
    rot('body', [[0, [0, 0, 0]], [0.1, [-22.5, 0, 0]], [0.5, [-22.5, 0, 0]]]),
    rot('left_leg', [[0, [0, 0, 0]], [0.1, [112.5, 0, 0]], [0.5, [112.5, 0, 0]]]),
    rot('right_leg', [[0, [0, 0, 0]], [0.1, [112.5, 0, 0]], [0.5, [112.5, 0, 0]]]),
    rot('left_foot', [[0, [0, 0, 0]], [0.1, [30, 0, 0]], [0.5, [30, 0, 0]]]),
    rot('right_foot', [[0, [0, 0, 0]], [0.1, [30, 0, 0]], [0.5, [30, 0, 0]]]),
    rot('left_arm', [[0, [0, 0, 0]], [0.1, [-45, 0, 0]], [0.5, [-45, 0, 0]]]),
    rot('right_arm', [[0, [0, 0, 0]], [0.1, [-45, 0, 0]], [0.5, [-45, 0, 0]]]),
    rot('left_hand', [[0, [0, 0, 0]], [0.1, [45, 0, 0]], [0.5, [45, 0, 0]]]),
    rot('right_hand', [[0, [0, 0, 0]], [0.1, [45, 0, 0]], [0.5, [45, 0, 0]]]),
  ],
};

const PUFF: [number, number, number] = [1.3, 1.7, 1.6];
const FLAT: [number, number, number] = [1, 1, 1];
/** a croak: the throat puffing out twice (it's drawn only while it croaks) */
const CROAK: AnimationDef = {
  length: 3,
  looping: false,
  channels: [
    scl('croaking_body', [
      [0, FLAT], [0.625, FLAT], [0.7083, PUFF], [0.875, PUFF], [0.9583, FLAT],
      [1.7083, FLAT], [1.7917, PUFF], [1.9583, PUFF], [2.0417, FLAT], [3, FLAT],
    ]),
  ],
};

/** its tongue: the head thrown back, the tongue shot out long and thin and drawn back in */
const TONGUE: AnimationDef = {
  length: 0.5,
  looping: false,
  channels: [
    rot('head', [[0, [0, 0, 0]], [0.0833, [-60, 0, 0]], [0.4167, [-60, 0, 0]], [0.5, [0, 0, 0]]]),
    rot('tongue', [[0, [0, 0, 0]], [0.0833, [-18, 0, 0]], [0.4167, [-18, 0, 0]], [0.5, [0, 0, 0]]]),
    scl('tongue', [[0, FLAT], [0.0833, [0.5, 1, 5]], [0.2083, [0.5, 1, 5]], [0.4167, FLAT]]),
  ],
};

/** the seconds since an animation state started (vanilla AnimationState.getAccumulatedTime), -1 while it's stopped */
function since(e: Frog, start: number, p: number): number {
  return start < 0 ? -1 : Math.max(0, (e.tickCount + p - start) * 0.05);
}

/**
 * vanilla FrogModel.setupAnim: reset, then the leap, the croak and the tongue as they're playing, the walk (or swim) as
 * fast as it's going (HierarchicalModel.animateWalk), the idle paddle; the throat drawn only while it croaks
 */
export function animateFrog(top: ModelPart, e: Frog, limbSwing: number, limbAmount: number, p: number): void {
  top.resetPose();
  const jump = since(e, e.jumpAnimStart, p), croak = since(e, e.croakAnimStart, p), tongue = since(e, e.tongueAnimStart, p);
  if (jump >= 0) applyAnimation(top, JUMP, jump);
  if (croak >= 0) applyAnimation(top, CROAK, croak);
  if (tongue >= 0) applyAnimation(top, TONGUE, tongue);
  const swim = e.inWater;
  const t = Math.floor(limbSwing * 50 * (swim ? 1 : 1.5)) / 1000;
  applyAnimation(top, swim ? SWIM : WALK, t, Math.min(limbAmount * 2.5, 1));
  const idle = since(e, e.swimIdleAnimStart, p);
  if (idle >= 0) applyAnimation(top, IDLE_WATER, idle);
  top.find('croaking_body')!.visible = e.croakAnimStart >= 0;
}

/** vanilla TadpoleModel.setupAnim: the tail wags, harder out of the water */
export function animateTadpole(root: ModelPart, e: Tadpole, age: number): void {
  const f = e.inWater ? 1 : 1.5;
  root.child('tail').yRot = -f * 0.25 * Math.sin(0.3 * age);
}

/** vanilla FrogRenderer's shadow and TadpoleRenderer's */
export const FROG_SHADOW_RADII: Record<string, number> = { frog: 0.3, tadpole: 0.14 };

export class FrogRenderers {
  private readonly frog = frogModel();
  private readonly tadpole = tadpoleModel();

  constructor(private readonly kit: LivingKit) {}

  /** draws `e` if it's a frog or a tadpole (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    const kit = this.kit;
    if (e instanceof Frog) {
      const tex = kit.tex(`frog_${e.variant}`);
      if (!tex) return true;
      const a = kit.setupLiving(e, dx, dy, dz, p, 90);
      animateFrog(this.frog.root, e, a.limbSwing, a.limbAmount, p);
      kit.overlay(b, e);
      kit.drawBody(b, e, this.frog, tex, false);
      b.setOverlay(0, 0, 0, 0);
      return true;
    }
    if (e instanceof Tadpole) {
      const tex = kit.tex('tadpole');
      if (!tex) return true;
      const a = kit.setupLiving(e, dx, dy, dz, p, 90);
      animateTadpole(this.tadpole.root, e, a.age);
      kit.overlay(b, e);
      kit.drawBody(b, e, this.tadpole, tex, false);
      b.setOverlay(0, 0, 0, 0);
      return true;
    }
    return false;
  }
}
