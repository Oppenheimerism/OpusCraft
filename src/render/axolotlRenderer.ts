// The axolotl's renderer (Stage 5: ocean, M7; vanilla AxolotlRenderer with AxolotlModel, 64x64, a LerpingModel):
// the body with its crest, the head with its three fringes of gills, four little legs and the tail fin, in the
// axolotl's colour. Its poses ease in rather than snap: each part's turn is kept on the axolotl from one frame to
// the next and moved a twentieth of the way on each frame (as vanilla does), towards swimming (the body undulating,
// legs folded back, gills streaming), hovering in the water, crawling on land, lying still, or playing dead (rolled
// on its side, legs splayed). A baby is the whole model drawn at half size. The steps every living renderer shares
// are the dispatcher's, lent through LivingKit.

import type { EntityBatch } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import type { MobModelDef } from './mobModels';
import type { LivingKit } from './illagerRenderers';
import type { Axolotl } from '../entity/axolotl';
import '../textures/axolotl';

const PI = Math.PI;
const RAD = PI / 180;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot);
}
const box = (x: number, y: number, z: number, w: number, h: number, d: number, u: number, v: number, inflate = 0): Cube => ({ x, y, z, w, h, d, u, v, inflate, mirror: false });

/** vanilla AxolotlModel.createBodyLayer, with its AgeableListModel baby (no head parts; the body at half size, 24 down) */
export function axolotlModel(): MobModelDef {
  const root = new ModelPart();
  const body = root.add('body', part([box(-4, -2, -9, 8, 4, 10, 0, 11), box(0, -3, -8, 0, 5, 9, 2, 17)], [0, 20, 5]));
  // (vanilla CubeDeformation 0.001 on the head, gills and legs)
  const head = body.add('head', part([box(-4, -3, -5, 8, 5, 5, 0, 1, 0.001)], [0, 0, -9]));
  head.add('top_gills', part([box(-4, -3, 0, 8, 3, 0, 3, 37, 0.001)], [0, -3, -1]));
  head.add('left_gills', part([box(-3, -5, 0, 3, 7, 0, 0, 40, 0.001)], [-4, 0, -1]));
  head.add('right_gills', part([box(0, -5, 0, 3, 7, 0, 11, 40, 0.001)], [4, 0, -1]));
  body.add('right_hind_leg', part([box(-2, 0, 0, 3, 5, 0, 2, 13, 0.001)], [-3.5, 1, -1]));
  body.add('left_hind_leg', part([box(-1, 0, 0, 3, 5, 0, 2, 13, 0.001)], [3.5, 1, -1]));
  body.add('right_front_leg', part([box(-2, 0, 0, 3, 5, 0, 2, 13, 0.001)], [-3.5, 1, -8]));
  body.add('left_front_leg', part([box(-1, 0, 0, 3, 5, 0, 2, 13, 0.001)], [3.5, 1, -8]));
  body.add('tail', part([box(0, -3, 0, 0, 5, 12, 2, 19)], [0, 0, 1]));
  return { root, texW: 64, texH: 64, baby: { headParts: [], scaleHead: true, yHead: 8, zHead: 3.35, headScale: 2, bodyScale: 2, bodyY: 24 } };
}

interface Parts {
  body: ModelPart;
  head: ModelPart;
  lh: ModelPart;
  rh: ModelPart;
  lf: ModelPart;
  rf: ModelPart;
  tail: ModelPart;
  top: ModelPart;
  lg: ModelPart;
  rg: ModelPart;
}

/** each part's name in vanilla's LerpingModel map */
const NAMES: [keyof Parts, string][] = [
  ['body', 'body'], ['head', 'head'], ['lh', 'left_hind_leg'], ['rh', 'right_hind_leg'], ['lf', 'left_front_leg'], ['rf', 'right_front_leg'],
  ['tail', 'tail'], ['top', 'top_gills'], ['lg', 'left_gills'], ['rg', 'right_gills'],
];

/** vanilla Axolotl.modelRotationValues: each axolotl's parts' turns as its model last left them */
const SAVED = new WeakMap<Axolotl, Map<string, [number, number, number]>>();

function wrapDegrees(d: number): number {
  let x = d % 360;
  if (x >= 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}
/** vanilla AxolotlModel.lerpTo (Mth.rotLerp, a twentieth of the way by default) */
const lerpTo = (from: number, to: number, delta = 0.05): number => from + delta * wrapDegrees(to - from);
function lerpPart(p: ModelPart, x: number, y: number, z: number): void {
  p.xRot = lerpTo(p.xRot, x);
  p.yRot = lerpTo(p.yRot, y);
  p.zRot = lerpTo(p.zRot, z);
}
function setRot(p: ModelPart, x: number, y: number, z: number): void {
  p.xRot = x;
  p.yRot = y;
  p.zRot = z;
}

/** vanilla applyMirrorLegRotations: the right legs as the left, mirrored */
function mirrorLegs(m: Parts): void {
  lerpPart(m.rh, m.lh.xRot, -m.lh.yRot, -m.lh.zRot);
  lerpPart(m.rf, m.lf.xRot, -m.lf.yRot, -m.lf.zRot);
}

/** vanilla setupLayStillOnGroundAnimation */
function layStill(m: Parts, age: number, headYaw: number): void {
  const f = age * 0.09, g = Math.sin(f), h = Math.cos(f);
  const i = g * g - 2 * g, j = h * h - 3 * g;
  m.head.xRot = lerpTo(m.head.xRot, -0.09 * i);
  m.head.yRot = lerpTo(m.head.yRot, 0);
  m.head.zRot = lerpTo(m.head.zRot, -0.2);
  m.tail.yRot = lerpTo(m.tail.yRot, -0.1 + 0.1 * i);
  m.top.xRot = lerpTo(m.top.xRot, 0.6 + 0.05 * j);
  m.lg.yRot = lerpTo(m.lg.yRot, -m.top.xRot);
  m.rg.yRot = lerpTo(m.rg.yRot, -m.lg.yRot);
  lerpPart(m.lh, 1.1, 1.0, 0);
  lerpPart(m.lf, 0.8, 2.3, -0.5);
  mirrorLegs(m);
  m.body.xRot = lerpTo(m.body.xRot, 0, 0.2);
  m.body.yRot = lerpTo(m.body.yRot, headYaw * RAD);
  m.body.zRot = lerpTo(m.body.zRot, 0);
}

/** vanilla setupGroundCrawlingAnimation */
function crawl(m: Parts, age: number, headYaw: number): void {
  const f = age * 0.11, g = Math.cos(f);
  const h = (g * g - 2 * g) / 5, i = 0.7 * g;
  m.head.xRot = lerpTo(m.head.xRot, 0);
  m.head.yRot = lerpTo(m.head.yRot, 0.09 * g);
  m.head.zRot = lerpTo(m.head.zRot, 0);
  m.tail.yRot = lerpTo(m.tail.yRot, m.head.yRot);
  m.top.xRot = lerpTo(m.top.xRot, 0.6 - 0.08 * (g * g + 2 * Math.sin(f)));
  m.lg.yRot = lerpTo(m.lg.yRot, -m.top.xRot);
  m.rg.yRot = lerpTo(m.rg.yRot, -m.lg.yRot);
  lerpPart(m.lh, 0.9424779, 1.5 - h, -0.1);
  lerpPart(m.lf, 1.0995574, PI / 2 - i, 0);
  lerpPart(m.rh, m.lh.xRot, -1.0 - h, 0);
  lerpPart(m.rf, m.lf.xRot, -PI / 2 - i, 0);
  m.body.xRot = lerpTo(m.body.xRot, 0, 0.2);
  m.body.yRot = lerpTo(m.body.yRot, headYaw * RAD);
  m.body.zRot = lerpTo(m.body.zRot, 0);
}

/** vanilla setupWaterHoveringAnimation */
function hover(m: Parts, age: number): void {
  const f = age * 0.075, g = Math.cos(f), h = Math.sin(f) * 0.15;
  m.body.xRot = lerpTo(m.body.xRot, -0.15 + 0.075 * g);
  m.body.y -= h;
  m.head.xRot = lerpTo(m.head.xRot, -m.body.xRot);
  m.top.xRot = lerpTo(m.top.xRot, 0.2 * g);
  m.lg.yRot = lerpTo(m.lg.yRot, -0.3 * g - 0.19);
  m.rg.yRot = lerpTo(m.rg.yRot, -m.lg.yRot);
  lerpPart(m.lh, (PI * 3) / 4 - g * 0.11, 0.47123894, 1.7278761);
  lerpPart(m.lf, PI / 4 - g * 0.2, 2.042035, 0);
  mirrorLegs(m);
  m.tail.yRot = lerpTo(m.tail.yRot, 0.5 * g);
  m.head.yRot = lerpTo(m.head.yRot, 0);
  m.head.zRot = lerpTo(m.head.zRot, 0);
}

/** vanilla setupSwimmingAnimation */
function swim(m: Parts, age: number, headPitch: number): void {
  const f = age * 0.33, g = Math.sin(f), h = Math.cos(f), i = 0.13 * g;
  m.body.xRot = lerpTo(m.body.xRot, headPitch * RAD + i, 0.1);
  m.head.xRot = -i * 1.8;
  m.body.y -= 0.45 * h;
  m.top.xRot = lerpTo(m.top.xRot, -0.5 * g - 0.8);
  m.lg.yRot = lerpTo(m.lg.yRot, 0.3 * g + 0.9);
  m.rg.yRot = lerpTo(m.rg.yRot, -m.lg.yRot);
  m.tail.yRot = lerpTo(m.tail.yRot, 0.3 * Math.cos(f * 0.9));
  lerpPart(m.lh, 1.8849558, -0.4 * g, PI / 2);
  lerpPart(m.lf, 1.8849558, -0.2 * h - 0.1, PI / 2);
  mirrorLegs(m);
  m.head.yRot = lerpTo(m.head.yRot, 0);
  m.head.zRot = lerpTo(m.head.zRot, 0);
}

/** vanilla setupPlayDeadAnimation */
function playDead(m: Parts, headYaw: number): void {
  lerpPart(m.lh, 1.4137167, 1.0995574, PI / 4);
  lerpPart(m.lf, PI / 4, 2.042035, 0);
  m.body.xRot = lerpTo(m.body.xRot, -0.15);
  m.body.zRot = lerpTo(m.body.zRot, 0.35);
  mirrorLegs(m);
  m.body.yRot = lerpTo(m.body.yRot, headYaw * RAD);
  m.head.xRot = lerpTo(m.head.xRot, 0);
  m.head.yRot = lerpTo(m.head.yRot, 0);
  m.head.zRot = lerpTo(m.head.zRot, 0);
  m.tail.yRot = lerpTo(m.tail.yRot, 0);
  lerpPart(m.top, 0, 0, 0);
  lerpPart(m.lg, 0, 0, 0);
  lerpPart(m.rg, 0, 0, 0);
}

/**
 * vanilla AxolotlModel.setupAnim: its parts' turns as it left them (or, the first time, the body along its look), then
 * eased towards the pose for what it's doing, and kept for the next frame
 */
export function animateAxolotl(root: ModelPart, e: Axolotl, limbAmount: number, age: number, headYaw: number, headPitch: number): void {
  const body = root.child('body'), head = body.child('head');
  const m: Parts = {
    body,
    head,
    lh: body.child('left_hind_leg'),
    rh: body.child('right_hind_leg'),
    lf: body.child('left_front_leg'),
    rf: body.child('right_front_leg'),
    tail: body.child('tail'),
    top: head.child('top_gills'),
    lg: head.child('left_gills'),
    rg: head.child('right_gills'),
  };
  // vanilla setupInitialAnimationValues
  body.x = 0;
  head.y = 0;
  body.y = 20;
  let saved = SAVED.get(e);
  if (!saved) {
    saved = new Map();
    SAVED.set(e, saved);
    for (const [k] of NAMES) setRot(m[k], 0, 0, 0);
    setRot(body, headPitch * RAD, headYaw * RAD, 0);
  } else for (const [k, n] of NAMES) setRot(m[k], ...(saved.get(n) ?? [0, 0, 0]));
  if (e.isPlayingDead()) playDead(m, headYaw);
  else {
    const moving = limbAmount > 1e-5 || e.pitch !== e.pitchO || e.yaw !== e.yawO;
    if (e.inWater) {
      if (moving) swim(m, age, headPitch);
      else hover(m, age);
    } else if (e.onGround) {
      if (moving) crawl(m, age, headYaw);
      else layStill(m, age, headYaw);
    }
  }
  // vanilla saveAnimationValues
  for (const [k, n] of NAMES) saved.set(n, [m[k].xRot, m[k].yRot, m[k].zRot]);
}

export class AxolotlRenderer {
  private readonly model = axolotlModel();

  constructor(private readonly kit: LivingKit) {}

  render(b: EntityBatch, e: Axolotl, dx: number, dy: number, dz: number, p: number): void {
    const kit = this.kit, def = this.model;
    // vanilla AxolotlRenderer.getTextureLocation: textures/entity/axolotl/axolotl_<variant>.png
    const tex = kit.tex(`axolotl_${e.variantName}`);
    if (!tex) return;
    const a = kit.setupLiving(e, dx, dy, dz, p, 90);
    animateAxolotl(def.root, e, a.limbAmount, a.age, a.headYaw, a.headPitch);
    kit.overlay(b, e);
    kit.drawBody(b, e, def, tex, e.isBaby());
    b.setOverlay(0, 0, 0, 0);
  }
}
