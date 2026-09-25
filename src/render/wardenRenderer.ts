// The warden (M4): vanilla WardenRenderer with WardenModel, 128x128 — a hulking torso on two short legs, arms hanging
// nearly to the ground, a ribcage over its chest that opens, a head with no eyes and two great tendrils standing out
// from it. Over the skin go vanilla's WardenEmissiveLayers, each drawn unlit by the world (full bright) and see-
// through, on some of its parts only: the bioluminescent spots (always), two sets of spots pulsing slowly by turns,
// the tendrils flaring as they twitch at a vibration, and its heart glowing in its chest with each beat. Its moves
// are keyframed as vanilla's WardenAnimation is (catmull-rom curves; the lengths and beats are vanilla's, the curves
// drawn afresh): emerging from the ground, digging back into it, roaring, sniffing, the sonic boom and the blow; with
// its walk, its idle sway and its head turning to look.

import type { EntityBatch } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import type { MobModelDef } from './mobModels';
import type { LivingKit } from './illagerRenderers';
import type { Mob } from '../entity/mob';
import { Warden } from '../entity/warden';
import '../textures/warden';

const PI = Math.PI;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot);
}

/** vanilla WardenModel.createBodyLayer (128x128); `only`: the parts whose own cubes are drawn (vanilla skipDraw on the rest) */
export function wardenModel(only?: ReadonlySet<string>): MobModelDef {
  const c = (name: string, cubes: Cube[]): Cube[] => (!only || only.has(name) ? cubes : []);
  const top = new ModelPart();
  const bone = top.add('bone', part([], [0, 24, 0]));
  const body = bone.add('body', part(c('body', [{ x: -9, y: -13, z: -4, w: 18, h: 21, d: 11, u: 0, v: 0 }]), [0, -21, 0]));
  body.add('right_ribcage', part(c('right_ribcage', [{ x: -2, y: -11, z: -0.1, w: 9, h: 21, d: 0, u: 90, v: 11 }]), [-7, -2, -4]));
  body.add('left_ribcage', part(c('left_ribcage', [{ x: -7, y: -11, z: -0.1, w: 9, h: 21, d: 0, u: 90, v: 11, mirror: true }]), [7, -2, -4]));
  const head = body.add('head', part(c('head', [{ x: -8, y: -16, z: -5, w: 16, h: 16, d: 10, u: 0, v: 32 }]), [0, -13, 0]));
  head.add('right_tendril', part(c('right_tendril', [{ x: -16, y: -13, z: 0, w: 16, h: 16, d: 0, u: 52, v: 32 }]), [-8, -12, 0]));
  head.add('left_tendril', part(c('left_tendril', [{ x: 0, y: -13, z: 0, w: 16, h: 16, d: 0, u: 58, v: 0 }]), [8, -12, 0]));
  body.add('right_arm', part(c('right_arm', [{ x: -4, y: 0, z: -4, w: 8, h: 28, d: 8, u: 44, v: 50 }]), [-13, -13, 1]));
  body.add('left_arm', part(c('left_arm', [{ x: -4, y: 0, z: -4, w: 8, h: 28, d: 8, u: 0, v: 58 }]), [13, -13, 1]));
  bone.add('right_leg', part(c('right_leg', [{ x: -3.1, y: 0, z: -3, w: 6, h: 13, d: 6, u: 76, v: 48 }]), [-5.9, -13, 0]));
  bone.add('left_leg', part(c('left_leg', [{ x: -2.9, y: 0, z: -3, w: 6, h: 13, d: 6, u: 76, v: 76 }]), [5.9, -13, 0]));
  return { root: top, texW: 128, texH: 128 };
}

// ---------------------------------------------------------------------------------------------------------------
// the keyframes (vanilla AnimationDefinition, KeyframeAnimations and AnimationChannel.Interpolations)

type Vec3 = [number, number, number];
/** a keyframe: its time (seconds), its value (degrees; pixels, +y up), and how it's reached (catmull-rom unless linear) */
type Key = [number, Vec3] | [number, Vec3, 'linear'];
interface Channel {
  bone: string;
  target: 'rotation' | 'position';
  keys: Key[];
}
export interface WardenAnimation {
  length: number;
  channels: Channel[];
}

const rot = (bone: string, keys: Key[]): Channel => ({ bone, target: 'rotation', keys });
const pos = (bone: string, keys: Key[]): Channel => ({ bone, target: 'position', keys });
const Z: Vec3 = [0, 0, 0];

/** vanilla Mth.catmullrom */
function catmullrom(t: number, a: number, b: number, c: number, d: number): number {
  return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
}

/**
 * vanilla KeyframeAnimations.animate for a non-looping animation `seconds` in: each channel's last key at or before
 * then, blended towards the next (as the next says: catmull-rom through the keys either side, or straight), added to
 * the part's pose; past the end, the last key holds
 */
export function applyWardenAnimation(root: ModelPart, def: WardenAnimation, seconds: number): void {
  for (const ch of def.channels) {
    const p = root.find(ch.bone);
    if (!p) continue;
    const k = ch.keys;
    let j = 0;
    while (j < k.length && !(seconds <= k[j][0])) j++;
    const i = Math.max(0, j - 1), n = Math.min(k.length - 1, i + 1);
    const f = n !== i ? Math.max(0, Math.min(1, (seconds - k[i][0]) / (k[n][0] - k[i][0]))) : 0;
    const v: Vec3 = [0, 0, 0];
    if (k[n][2] === 'linear') for (let a = 0; a < 3; a++) v[a] = k[i][1][a] + (k[n][1][a] - k[i][1][a]) * f;
    else {
      const k0 = k[Math.max(0, i - 1)][1], k1 = k[i][1], k2 = k[n][1], k3 = k[Math.min(k.length - 1, n + 1)][1];
      for (let a = 0; a < 3; a++) v[a] = catmullrom(f, k0[a], k1[a], k2[a], k3[a]);
    }
    if (ch.target === 'rotation') {
      p.xRot += (v[0] * PI) / 180;
      p.yRot += (v[1] * PI) / 180;
      p.zRot += (v[2] * PI) / 180;
    } else {
      p.x += v[0];
      p.y -= v[1];
      p.z += v[2];
    }
  }
}

/** a sway of `bone` about its x axis: `a` at each of the times `t` (for the digging arms) */
const beats = (t: number[], a: number[], z = 0): Key[] => t.map((s, i) => [s, [a[i], 0, a[i] === 0 ? 0 : z]] as Key);

/** vanilla WARDEN_ATTACK (a third of a second): both arms thrown up and brought down in one blow, the body behind it */
export const WARDEN_ATTACK: WardenAnimation = {
  length: 0.3333,
  channels: [
    rot('body', [[0, Z], [0.0833, [-12.5, 0, 0]], [0.1667, [20, 0, 0]], [0.3333, Z]]),
    rot('head', [[0, Z], [0.0833, [-17.5, 0, 0]], [0.1667, [15, 0, 0]], [0.3333, Z]]),
    rot('right_arm', [[0, Z], [0.0833, [-107.5, 0, 12.5]], [0.1667, [-27.5, 0, 5]], [0.25, [10, 0, 0]], [0.3333, Z]]),
    rot('left_arm', [[0, Z], [0.0833, [-107.5, 0, -12.5]], [0.1667, [-27.5, 0, -5]], [0.25, [10, 0, 0]], [0.3333, Z]]),
  ],
};

/**
 * vanilla WARDEN_SONIC_BOOM (three seconds): it rears back and its ribcage swings open, the chest charging; at 1.7
 * seconds (the boom's 34 ticks) it lurches forward with it, then closes up again
 */
export const WARDEN_SONIC_BOOM: WardenAnimation = {
  length: 3,
  channels: [
    rot('body', [[0, Z], [0.75, [-20, 0, 0]], [1.5, [-25, 0, 0]], [1.7, [27.5, 0, 0]], [2.2, [20, 0, 0]], [2.6, [5, 0, 0]], [3, Z]]),
    rot('head', [[0, Z], [0.75, [-32.5, 0, 0]], [1.2, [-37.5, 2.5, 0]], [1.5, [-40, -2.5, 0]], [1.7, [22.5, 0, 0]], [2.2, [15, 0, 0]], [2.6, [2.5, 0, 0]], [3, Z]]),
    rot('right_ribcage', [[0, Z], [0.5, [0, 30, 0]], [1.5, [0, 62.5, 0]], [1.7, [0, 85, 0]], [2.3, [0, 75, 0]], [2.8, [0, 10, 0]], [3, Z]]),
    rot('left_ribcage', [[0, Z], [0.5, [0, -30, 0]], [1.5, [0, -62.5, 0]], [1.7, [0, -85, 0]], [2.3, [0, -75, 0]], [2.8, [0, -10, 0]], [3, Z]]),
    rot('right_arm', [[0, Z], [0.75, [22.5, 0, 45]], [1.5, [30, 0, 57.5]], [1.7, [40, 0, 25]], [2.3, [25, 0, 15]], [3, Z]]),
    rot('left_arm', [[0, Z], [0.75, [22.5, 0, -45]], [1.5, [30, 0, -57.5]], [1.7, [40, 0, -25]], [2.3, [25, 0, -15]], [3, Z]]),
    rot('right_tendril', [[0, Z], [1.5, [-25, 0, 0]], [1.7, [20, 0, 0]], [2.5, [0, 0, 0]], [3, Z]]),
    rot('left_tendril', [[0, Z], [1.5, [25, 0, 0]], [1.7, [-20, 0, 0]], [2.5, [0, 0, 0]], [3, Z]]),
  ],
};

/**
 * vanilla WARDEN_ROAR (4.2 seconds): the head dropped and drawn back, then thrown up and out as the roar comes (a
 * second and a quarter in), arms flung wide, the head shaking with it; then it settles
 */
export const WARDEN_ROAR: WardenAnimation = {
  length: 4.2,
  channels: [
    rot('body', [[0, Z], [0.9, [12.5, 0, 0]], [1.25, [-22.5, 0, 0]], [1.6, [-17.5, 0, 0]], [2.6, [-15, 0, 0]], [3.2, [-10, 0, 0]], [4.2, Z]]),
    rot('head', [
      [0, Z], [0.9, [30, 0, 0]], [1.25, [-40, 0, 0]], [1.5, [-35, 12.5, 0]], [1.75, [-37.5, -12.5, 0]], [2, [-35, 12.5, 0]], [2.25, [-37.5, -12.5, 0]],
      [2.5, [-35, 10, 0]], [2.75, [-32.5, -7.5, 0]], [3.2, [-20, 0, 0]], [4.2, Z],
    ]),
    rot('right_arm', [[0, Z], [0.9, [22.5, 0, 22.5]], [1.25, [-20, 0, 70]], [2.6, [-17.5, 0, 65]], [3.2, [-10, 0, 40]], [4.2, Z]]),
    rot('left_arm', [[0, Z], [0.9, [22.5, 0, -22.5]], [1.25, [-20, 0, -70]], [2.6, [-17.5, 0, -65]], [3.2, [-10, 0, -40]], [4.2, Z]]),
    rot('right_ribcage', [[0, Z], [0.9, Z], [1.25, [0, 25, 0]], [2.6, [0, 22.5, 0]], [3.2, Z], [4.2, Z]]),
    rot('left_ribcage', [[0, Z], [0.9, Z], [1.25, [0, -25, 0]], [2.6, [0, -22.5, 0]], [3.2, Z], [4.2, Z]]),
    rot('right_tendril', [[0, Z], [1.25, [-30, 0, 0]], [2, [-15, 0, 0]], [2.6, [-27.5, 0, 0]], [3.2, Z], [4.2, Z]]),
    rot('left_tendril', [[0, Z], [1.25, [30, 0, 0]], [2, [15, 0, 0]], [2.6, [27.5, 0, 0]], [3.2, Z], [4.2, Z]]),
  ],
};

/** vanilla WARDEN_SNIFF (4.16 seconds): head raised, it casts about to one side and the other, sniffing in sharp breaths */
export const WARDEN_SNIFF: WardenAnimation = {
  length: 4.16,
  channels: [
    rot('body', [[0, Z], [1, [0, -17.5, 0]], [2.4, [0, 17.5, 0]], [3.5, Z], [4.16, Z]]),
    rot('head', [
      [0, Z], [0.4, [-22.5, 0, 0]], [0.6, [-27.5, -10, 0]], [0.8, [-22.5, -17.5, 0]], [1, [-27.5, -25, 0]], [1.7, [-22.5, 0, 0]], [1.9, [-27.5, 12.5, 0]],
      [2.1, [-22.5, 20, 0]], [2.4, [-27.5, 25, 0]], [2.9, [-22.5, 10, 0]], [3.1, [-27.5, 2.5, 0]], [3.5, [-10, 0, 0]], [4.16, Z],
    ]),
    rot('right_arm', [[0, Z], [1, [0, 0, 5]], [2.4, [0, 0, 2.5]], [3.5, Z], [4.16, Z]]),
    rot('left_arm', [[0, Z], [1, [0, 0, -2.5]], [2.4, [0, 0, -5]], [3.5, Z], [4.16, Z]]),
    rot('right_tendril', [[0, Z], [0.6, [-12.5, 0, 0]], [1, Z], [1.9, [-12.5, 0, 0]], [2.4, Z], [3.1, [-12.5, 0, 0]], [3.5, Z], [4.16, Z]]),
    rot('left_tendril', [[0, Z], [0.6, [12.5, 0, 0]], [1, Z], [1.9, [12.5, 0, 0]], [2.4, Z], [3.1, [12.5, 0, 0]], [3.5, Z], [4.16, Z]]),
  ],
};

/** the body's (and legs') rise out of the ground as it emerges, in pixels up */
const EMERGE_RISE: Key[] = [
  [0, [0, -64, 0]], [0.6, [0, -64, 0]], [1.2, [0, -46, 0]], [1.9, [0, -39, 0]], [2.6, [0, -31, 0]], [3.4, [0, -23, 0]], [4.2, [0, -14, 0]],
  [5, [0, -6, 0]], [5.8, [0, -1, 0]], [6.68, Z],
];

/**
 * vanilla WARDEN_EMERGE (6.68 seconds): up out of the ground an arm at a time, each clawing up and slamming down to
 * haul itself on; the head comes up looking about, and it straightens up onto its legs
 */
export const WARDEN_EMERGE: WardenAnimation = {
  length: 6.68,
  channels: [
    pos('body', EMERGE_RISE),
    pos('right_leg', EMERGE_RISE),
    pos('left_leg', EMERGE_RISE),
    rot('body', [[0, [40, 0, 0]], [2.6, [35, 0, 0]], [4.2, [20, 0, 0]], [5.4, [5, 0, 0]], [6.68, Z]]),
    rot('head', [[0, [-50, 0, 0]], [2, [-40, 0, 0]], [2.6, [-10, 20, 0]], [3.2, [0, -20, 0]], [3.8, [10, 10, 0]], [4.6, Z], [6.68, Z]]),
    rot('right_arm', [
      [0, [-170, 0, 0]], [0.6, [-170, 0, 10]], [1.2, [-150, 0, 15]], [1.6, [-80, 0, 10]], [2.4, [-60, 0, 5]], [3.4, [-40, 0, 0]], [4.4, [-20, 0, 0]],
      [5.6, [-5, 0, 0]], [6.68, Z],
    ]),
    rot('left_arm', [
      [0, [-170, 0, 0]], [1, [-170, 0, -10]], [1.6, [-150, 0, -15]], [2, [-80, 0, -10]], [2.8, [-60, 0, -5]], [3.8, [-40, 0, 0]], [4.8, [-20, 0, 0]],
      [5.8, [-5, 0, 0]], [6.68, Z],
    ]),
    rot('right_tendril', [[0, Z], [2.6, [-20, 0, 0]], [3.2, [10, 0, 0]], [3.8, [-10, 0, 0]], [4.6, Z], [6.68, Z]]),
    rot('left_tendril', [[0, Z], [2.6, [20, 0, 0]], [3.2, [-10, 0, 0]], [3.8, [10, 0, 0]], [4.6, Z], [6.68, Z]]),
  ],
};

/** the body's (and legs') sinking as it digs, in pixels up */
const DIG_SINK: Key[] = [[0, Z], [1, [0, -2, 0]], [1.8, [0, -8, 0]], [2.6, [0, -18, 0]], [3.4, [0, -32, 0]], [4.2, [0, -50, 0]], [4.8, [0, -64, 0]], [5, [0, -64, 0]]];

/**
 * vanilla WARDEN_DIG (five seconds): bent over, it tears at the ground with one arm then the other, sinking into it,
 * its arms the last of it to go
 */
export const WARDEN_DIG: WardenAnimation = {
  length: 5,
  channels: [
    pos('body', DIG_SINK),
    pos('right_leg', DIG_SINK),
    pos('left_leg', DIG_SINK),
    rot('body', [[0, Z], [0.6, [25, 0, 0]], [1.4, [40, 0, 0]], [3, [45, 0, 0]], [5, [45, 0, 0]]]),
    rot('head', [[0, Z], [0.8, [30, 0, 0]], [2.6, [20, 0, 0]], [3.6, [-30, 0, 0]], [5, [-40, 0, 0]]]),
    rot('right_arm', beats([0, 0.5, 0.9, 1.3, 1.7, 2.1, 2.6, 3.2, 4.2, 5], [0, -60, -20, -70, -25, -75, -30, -100, -160, -170], 7.5)),
    rot('left_arm', beats([0, 0.7, 1.1, 1.5, 1.9, 2.35, 2.9, 3.4, 4.4, 5], [0, -65, -20, -70, -25, -75, -30, -105, -165, -170], -7.5)),
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// the model's moves

/** the seconds since an animation state started (vanilla AnimationState.getAccumulatedTime), -1 if it never has */
function since(e: Warden, start: number, p: number): number {
  return start < 0 ? -1 : Math.max(0, Math.floor((e.tickCount + p) * 50 - start * 50) / 1000);
}

/**
 * vanilla WardenModel.setupAnim: reset, the head turned to look, the walk, the idle sway, the tendrils twitching,
 * then each animation as it last started (the blow, the sonic boom, digging, emerging, the roar, the sniff)
 */
export function animateWarden(top: ModelPart, e: Warden, limbSwing: number, limbAmount: number, age: number, headYaw: number, headPitch: number, p: number): void {
  top.resetPose();
  const bone = top.child('bone'), body = bone.child('body'), head = body.child('head');
  const ra = body.child('right_arm'), la = body.child('left_arm'), rl = bone.child('right_leg'), ll = bone.child('left_leg');
  // vanilla animateHeadLookTarget
  head.xRot = (headPitch * PI) / 180;
  head.yRot = (headYaw * PI) / 180;
  // vanilla animateWalk
  const f = Math.min(0.5, 3 * limbAmount);
  const f1 = limbSwing * 0.8662;
  const f2 = Math.cos(f1), f3 = Math.sin(f1);
  const f4 = Math.min(0.35, f);
  head.zRot += 0.3 * f3 * f;
  head.xRot += 1.2 * Math.cos(f1 + PI / 2) * f4;
  body.zRot = 0.1 * f3 * f;
  body.xRot = f2 * f4;
  ll.xRot = f2 * f;
  rl.xRot = Math.cos(f1 + PI) * f;
  la.xRot = -(0.8 * f2 * f);
  la.zRot = 0;
  ra.xRot = -(0.8 * f3 * f);
  ra.zRot = 0;
  // vanilla resetArmPoses
  la.yRot = 0;
  la.x = 13;
  la.y = -13;
  la.z = 1;
  ra.yRot = 0;
  ra.x = -13;
  ra.y = -13;
  ra.z = 1;
  // vanilla animateIdlePose
  const g = age * 0.1, gc = Math.cos(g), gs = Math.sin(g);
  head.zRot += 0.06 * gc;
  head.xRot += 0.06 * gs;
  body.zRot += 0.025 * gs;
  body.xRot += 0.025 * gc;
  // vanilla animateTendrils
  const t = e.tendrilAnimationAt(p) * Math.cos(age * 2.25) * PI * 0.1;
  head.child('left_tendril').xRot = t;
  head.child('right_tendril').xRot = -t;
  const play = (start: number, def: WardenAnimation) => {
    const s = since(e, start, p);
    if (s >= 0) applyWardenAnimation(top, def, s);
  };
  play(e.attackAnimStart, WARDEN_ATTACK);
  play(e.sonicBoomAnimStart, WARDEN_SONIC_BOOM);
  play(e.diggingAnimStart, WARDEN_DIG);
  play(e.emergeAnimStart, WARDEN_EMERGE);
  play(e.roarAnimStart, WARDEN_ROAR);
  play(e.sniffAnimStart, WARDEN_SNIFF);
}

/** a layer's model follows the main one's pose, part for part */
function copyPose(from: ModelPart, to: ModelPart): void {
  for (const [n, c] of from.children) {
    const t = to.children.get(n);
    if (!t) continue;
    t.x = c.x;
    t.y = c.y;
    t.z = c.z;
    t.xRot = c.xRot;
    t.yRot = c.yRot;
    t.zRot = c.zRot;
    t.xScale = c.xScale;
    t.yScale = c.yScale;
    t.zScale = c.zScale;
    t.visible = c.visible;
    copyPose(c, t);
  }
}

interface EmissiveLayer {
  tex: string;
  model: MobModelDef;
  /** vanilla WardenEmissiveLayer.AlphaFunction */
  alpha(e: Warden, p: number, age: number): number;
}

/** vanilla WardenModel's layer part lists */
const BIOLUMINESCENT_PARTS = new Set(['head', 'left_arm', 'right_arm', 'left_leg', 'right_leg']);
const PULSATING_SPOTS_PARTS = new Set(['body', 'head', 'left_arm', 'right_arm', 'left_leg', 'right_leg']);
const TENDRILS_PARTS = new Set(['left_tendril', 'right_tendril']);
const HEART_PARTS = new Set(['body']);

/** vanilla WardenRenderer's shadow */
export const WARDEN_SHADOW_RADIUS = 0.9;

export class WardenRenderer {
  private readonly model = wardenModel();
  /** vanilla WardenRenderer's layers, in its order */
  private readonly layers: EmissiveLayer[] = [
    { tex: 'warden_bioluminescent_layer', model: wardenModel(BIOLUMINESCENT_PARTS), alpha: () => 1 },
    { tex: 'warden_pulsating_spots_1', model: wardenModel(PULSATING_SPOTS_PARTS), alpha: (_e, _p, age) => Math.max(0, Math.cos(age * 0.045) * 0.25) },
    { tex: 'warden_pulsating_spots_2', model: wardenModel(PULSATING_SPOTS_PARTS), alpha: (_e, _p, age) => Math.max(0, Math.cos(age * 0.045 + PI) * 0.25) },
    { tex: 'warden', model: wardenModel(TENDRILS_PARTS), alpha: (e, p) => e.tendrilAnimationAt(p) },
    { tex: 'warden_heart', model: wardenModel(HEART_PARTS), alpha: (e, p) => e.heartAnimationAt(p) },
  ];

  constructor(private readonly kit: LivingKit) {}

  /** draws `e` if it's a warden (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (!(e instanceof Warden)) return false;
    const kit = this.kit;
    const tex = kit.tex('warden');
    if (!tex) return true;
    const a = kit.setupLiving(e, dx, dy, dz, p, 90);
    animateWarden(this.model.root, e, a.limbSwing, a.limbAmount, a.age, a.headYaw, a.headPitch, p);
    kit.overlay(b, e);
    kit.drawBody(b, e, this.model, tex, false);
    b.flush();
    // vanilla WardenEmissiveLayer.render: none on an invisible warden
    if (!e.isInvisible()) {
      for (const l of this.layers) {
        const alpha = l.alpha(e, p, a.age);
        const t = kit.tex(l.tex);
        if (!t || alpha <= 0) continue;
        copyPose(this.model.root, l.model.root);
        // vanilla RenderType.entityTranslucentEmissive: its own light only (neither the world's nor the sun's shading),
        // blended, no culling, no depth written
        b.begin(kit.state(t, { cutoff: 0.1, blend: true, lit: false, useLightmap: false, depthWrite: false }));
        kit.drawModel(b, l.model, false, 1, 1, 1, alpha);
        b.flush();
      }
    }
    b.setOverlay(0, 0, 0, 0);
    return true;
  }
}
