// (remaining mobs: the phantom) Phantoms: vanilla PhantomRenderer with PhantomModel (64x64) — a flat body with its
// head tipped down at the front and a two-part tail behind, and a long two-jointed wing out to each side. The wings
// beat at the phantom's own pace (7.45° of the beat a tick, both joints together, 16° up and down) and the tail sways
// with them twice as fast. It's drawn pitched nose up or down with its flight and grown 15% a size, and its eyes glow
// in the dark (PhantomEyesLayer).

import type { EntityBatch } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import type { MobModelDef } from './mobModels';
import type { LivingKit } from './illagerRenderers';
import type { Mob } from '../entity/mob';
import { Phantom, FLAP_DEGREES_PER_TICK } from '../entity/phantom';
import '../textures/phantom';

const RAD = Math.PI / 180;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

/** vanilla PhantomModel.createBodyLayer (64x64): everything hangs off the body, tipped 0.1 nose up */
export function phantomModel(): MobModelDef {
  const root = new ModelPart();
  const body = root.add('body', part([{ x: -3, y: -2, z: -8, w: 5, h: 3, d: 9, u: 0, v: 8 }], [0, 0, 0], [-0.1, 0, 0]));
  const tail = body.add('tail_base', part([{ x: -2, y: 0, z: 0, w: 3, h: 2, d: 6, u: 3, v: 20 }], [0, -2, 1]));
  tail.add('tail_tip', part([{ x: -1, y: 0, z: 0, w: 1, h: 1, d: 6, u: 4, v: 29 }], [0, 0.5, 6]));
  const lw = body.add('left_wing_base', part([{ x: 0, y: 0, z: 0, w: 6, h: 2, d: 9, u: 23, v: 12 }], [2, -2, -8], [0, 0, 0.1]));
  lw.add('left_wing_tip', part([{ x: 0, y: 0, z: 0, w: 13, h: 1, d: 9, u: 16, v: 24 }], [6, 0, 0], [0, 0, 0.1]));
  const rw = body.add('right_wing_base', part([{ x: -6, y: 0, z: 0, w: 6, h: 2, d: 9, u: 23, v: 12, mirror: true }], [-3, -2, -8], [0, 0, -0.1]));
  rw.add('right_wing_tip', part([{ x: -13, y: 0, z: 0, w: 13, h: 1, d: 9, u: 16, v: 24, mirror: true }], [-6, 0, 0], [0, 0, -0.1]));
  body.add('head', part([{ x: -4, y: -2, z: -5, w: 7, h: 3, d: 5, u: 0, v: 0 }], [0, 1, -7], [0.2, 0, 0]));
  return { root, texW: 64, texH: 64 };
}

/**
 * vanilla PhantomModel.setupAnim, `flap` ticks into its beat (getUniqueFlapTickOffset() + ageInTicks): both joints of
 * each wing tilt cos(beat) · 16°, the right against the left, and the tail's two parts dip 0° to 10° at twice the pace
 */
export function animatePhantom(root: ModelPart, flap: number): void {
  const body = root.child('body');
  const tail = body.child('tail_base'), tip = tail.child('tail_tip');
  const lw = body.child('left_wing_base'), lwt = lw.child('left_wing_tip');
  const rw = body.child('right_wing_base'), rwt = rw.child('right_wing_tip');
  const f = flap * FLAP_DEGREES_PER_TICK * RAD;
  lw.zRot = Math.cos(f) * 16 * RAD;
  lwt.zRot = Math.cos(f) * 16 * RAD;
  rw.zRot = -lw.zRot;
  rwt.zRot = -lwt.zRot;
  tail.xRot = -(5 + Math.cos(f * 2) * 5) * RAD;
  tip.xRot = -(5 + Math.cos(f * 2) * 5) * RAD;
}

/** vanilla PhantomRenderer's shadow (the same at any size) */
export const PHANTOM_SHADOW_RADII: Record<string, number> = { phantom: 0.75 };

export class PhantomRenderers {
  private readonly model = phantomModel();

  constructor(private readonly kit: LivingKit) {}

  /** draws `e` if it's a phantom (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (!(e instanceof Phantom)) return false;
    const kit = this.kit;
    const tex = kit.tex('phantom');
    if (!tex) return true;
    const s = e.scaleBySize();
    // vanilla PhantomRenderer.setupRotations (after the body's turn, its pitch: getXRot, as it stands this tick) and
    // scale (grown by its size, then 1.3125 up and 0.1875 back); the pitch comes before the model's flip, so it's
    // turned the other way after it
    kit.setupLiving(e, dx, dy, dz, p, 90, (pose) => {
      pose.rotX(-e.pitch);
      pose.scale(s, s, s);
      pose.translate(0, 1.3125, 0.1875);
    });
    animatePhantom(this.model.root, e.flapTicks(p));
    kit.overlay(b, e);
    kit.drawBody(b, e, this.model, tex, false);
    // vanilla PhantomEyesLayer (an EyesLayer, drawn even when it's invisible): the eyes at full brightness, added over
    // whatever is behind them
    const eyes = kit.tex('phantom_eyes');
    if (eyes) {
      b.setOverlay(0, 0, 0, 0);
      const lb = b.lightB, ls = b.lightS;
      b.lightB = b.lightS = 240;
      b.begin(kit.state(eyes, { cutoff: -1, blend: true, additive: true, depthWrite: false, lit: false, useLightmap: false }));
      kit.drawModel(b, this.model, false);
      b.flush();
      b.lightB = lb;
      b.lightS = ls;
    }
    b.setOverlay(0, 0, 0, 0);
    return true;
  }
}
