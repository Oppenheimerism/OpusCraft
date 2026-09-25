// The renderers of the sea's smaller creatures (Stage 5: ocean): vanilla CodRenderer, SalmonRenderer,
// PufferfishRenderer, TropicalFishRenderer (with TropicalFishPatternLayer), DolphinRenderer (with
// DolphinCarryingItemLayer) and GlowSquidRenderer, and their models. A fish sways as it swims (its tail beating, its
// body turning a few degrees side to side) and lies on its side out of the water; a pufferfish bobs, and is drawn in
// the model for how puffed up it is; a tropical fish is its body's model in its body colour with its pattern over it
// in the other; a dolphin pitches with its heading, its flukes beating as it moves, whatever it's carrying at its
// beak; a glow squid is a squid lit by its own light (none while it's gone dark). The steps every living renderer
// shares are the dispatcher's, lent through LivingKit; each renderer's own rotations are given in the pose after the
// dispatcher's (-1, -1, 1) flip, which turns a vanilla rotation about Y or X the other way and flips a translation's X
// and Y.

import type { EntityBatch, PoseStack } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import { squidModel, animateSquid, type MobModelDef } from './mobModels';
import type { LivingKit } from './illagerRenderers';
import type { Mob } from '../entity/mob';
import { AbstractFish, Cod, Salmon, Pufferfish, TropicalFish, unpackTropical } from '../entity/fish';
import { Dolphin } from '../entity/dolphin';
import { GlowSquid } from '../entity/glowSquid';
import { DYE_DIFFUSE } from '../entity/animals';
import { wrapDegrees } from '../core/math';
import '../textures/fish';

const PI = Math.PI;
const RAD = PI / 180;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}
const box = (x: number, y: number, z: number, w: number, h: number, d: number, u: number, v: number, inflate = 0, mirror = false): Cube => ({ x, y, z, w, h, d, u, v, inflate, mirror });

// ---------------------------------------------------------------------------
// the models (32x32 but the dolphin's)

/** vanilla CodModel.createBodyLayer */
export function codModel(): MobModelDef {
  const root = new ModelPart();
  root.add('body', part([box(-1, -2, 0, 2, 4, 7, 0, 0)], [0, 22, 0]));
  root.add('head', part([box(-1, -2, -3, 2, 4, 3, 11, 0)], [0, 22, 0]));
  root.add('nose', part([box(-1, -2, -1, 2, 3, 1, 0, 0)], [0, 22, -3]));
  root.add('right_fin', part([box(-2, 0, -1, 2, 0, 2, 22, 1)], [-1, 23, 0], [0, 0, -PI / 4]));
  root.add('left_fin', part([box(0, 0, -1, 2, 0, 2, 22, 4)], [1, 23, 0], [0, 0, PI / 4]));
  root.add('tail_fin', part([box(0, -2, 0, 0, 4, 4, 22, 3)], [0, 22, 7]));
  root.add('top_fin', part([box(0, -1, -1, 0, 1, 6, 20, -6)], [0, 20, 0]));
  return { root, texW: 32, texH: 32 };
}

/** vanilla SalmonModel.createBodyLayer: the back half (and its fins) swings behind the front */
export function salmonModel(): MobModelDef {
  const root = new ModelPart();
  const front = root.add('body_front', part([box(-1.5, -2.5, 0, 3, 5, 8, 0, 0)], [0, 20, 0]));
  const back = root.add('body_back', part([box(-1.5, -2.5, 0, 3, 5, 8, 0, 13)], [0, 20, 8]));
  root.add('head', part([box(-1, -2, -3, 2, 4, 3, 22, 0)], [0, 20, 0]));
  back.add('back_fin', part([box(0, -2.5, 0, 0, 5, 6, 20, 10)], [0, 0, 8]));
  front.add('top_front_fin', part([box(0, 0, 0, 0, 2, 3, 2, 1)], [0, -4.5, 5]));
  back.add('top_back_fin', part([box(0, 0, 0, 0, 2, 4, 0, 2)], [0, -4.5, -1]));
  root.add('right_fin', part([box(-2, 0, 0, 2, 0, 2, -4, 0)], [-1.5, 21.5, 0], [0, 0, -PI / 4]));
  root.add('left_fin', part([box(0, 0, 0, 2, 0, 2, 0, 0)], [1.5, 21.5, 0], [0, 0, PI / 4]));
  return { root, texW: 32, texH: 32 };
}

/** vanilla PufferfishSmallModel.createBodyLayer */
export function pufferSmallModel(): MobModelDef {
  const root = new ModelPart();
  root.add('body', part([box(-1.5, -2, -1.5, 3, 2, 3, 0, 27)], [0, 23, 0]));
  root.add('right_eye', part([box(-1.5, 0, -1.5, 1, 1, 1, 24, 6)], [0, 20, 0]));
  root.add('left_eye', part([box(0.5, 0, -1.5, 1, 1, 1, 28, 6)], [0, 20, 0]));
  root.add('back_fin', part([box(-1.5, 0, 0, 3, 0, 3, -3, 0)], [0, 22, 1.5]));
  root.add('right_fin', part([box(-1, 0, 0, 1, 0, 2, 25, 0)], [-1.5, 22, -1.5]));
  root.add('left_fin', part([box(0, 0, 0, 1, 0, 2, 25, 0)], [1.5, 22, -1.5]));
  return { root, texW: 32, texH: 32 };
}

/** vanilla PufferfishMidModel.createBodyLayer */
export function pufferMidModel(): MobModelDef {
  const root = new ModelPart();
  root.add('body', part([box(-2.5, -5, -2.5, 5, 5, 5, 12, 22)], [0, 22, 0]));
  root.add('right_blue_fin', part([box(-2, 0, 0, 2, 0, 2, 24, 0)], [-2.5, 17, -1.5]));
  root.add('left_blue_fin', part([box(0, 0, 0, 2, 0, 2, 24, 3)], [2.5, 17, -1.5]));
  root.add('top_front_fin', part([box(-2.5, -1, 0, 5, 1, 1, 15, 16)], [0, 17, -2.5], [PI / 4, 0, 0]));
  root.add('top_back_fin', part([box(-2.5, -1, -1, 5, 1, 1, 10, 16)], [0, 17, 2.5], [-PI / 4, 0, 0]));
  root.add('right_front_fin', part([box(-1, -5, 0, 1, 5, 1, 8, 16)], [-2.5, 22, -2.5], [0, -PI / 4, 0]));
  root.add('right_back_fin', part([box(-1, -5, 0, 1, 5, 1, 8, 16)], [-2.5, 22, 2.5], [0, PI / 4, 0]));
  root.add('left_back_fin', part([box(0, -5, 0, 1, 5, 1, 4, 16)], [2.5, 22, 2.5], [0, -PI / 4, 0]));
  root.add('left_front_fin', part([box(0, -5, 0, 1, 5, 1, 0, 16)], [2.5, 22, -2.5], [0, PI / 4, 0]));
  root.add('bottom_back_fin', part([box(0, 0, 0, 1, 1, 1, 8, 22)], [0.5, 22, 2.5], [PI / 4, 0, 0]));
  root.add('bottom_front_fin', part([box(-2.5, 0, 0, 5, 1, 1, 17, 21)], [0, 22, -2.5], [-PI / 4, 0, 0]));
  return { root, texW: 32, texH: 32 };
}

/** vanilla PufferfishBigModel.createBodyLayer */
export function pufferBigModel(): MobModelDef {
  const root = new ModelPart();
  root.add('body', part([box(-4, -8, -4, 8, 8, 8, 0, 0)], [0, 22, 0]));
  root.add('right_blue_fin', part([box(-2, 0, -1, 2, 1, 2, 24, 0)], [-4, 15, -2]));
  root.add('left_blue_fin', part([box(0, 0, -1, 2, 1, 2, 24, 3)], [4, 15, -2]));
  root.add('top_front_fin', part([box(-4, -1, 0, 8, 1, 0, 15, 17)], [0, 14, -4], [PI / 4, 0, 0]));
  root.add('top_middle_fin', part([box(-4, -1, 0, 8, 1, 1, 14, 16)], [0, 14, 0]));
  root.add('top_back_fin', part([box(-4, -1, 0, 8, 1, 0, 23, 18)], [0, 14, 4], [-PI / 4, 0, 0]));
  root.add('right_front_fin', part([box(-1, -8, 0, 1, 8, 0, 5, 17)], [-4, 22, -4], [0, -PI / 4, 0]));
  root.add('left_front_fin', part([box(0, -8, 0, 1, 8, 0, 1, 17)], [4, 22, -4], [0, PI / 4, 0]));
  root.add('bottom_front_fin', part([box(-4, 0, 0, 8, 1, 0, 15, 20)], [0, 22, -4], [-PI / 4, 0, 0]));
  root.add('bottom_middle_fin', part([box(-4, 0, 0, 8, 1, 0, 15, 20)], [0, 22, 0]));
  root.add('bottom_back_fin', part([box(-4, 0, 0, 8, 1, 0, 15, 20)], [0, 22, 4], [PI / 4, 0, 0]));
  root.add('right_back_fin', part([box(-1, -8, 0, 1, 8, 0, 9, 17)], [-4, 22, 4], [0, PI / 4, 0]));
  root.add('left_back_fin', part([box(0, -8, 0, 1, 8, 0, 9, 17)], [4, 22, 4], [0, -PI / 4, 0]));
  return { root, texW: 32, texH: 32 };
}

/** vanilla TropicalFishModelA.createBodyLayer (the small body; `g`: the pattern layer's CubeDeformation 0.008) */
export function tropicalAModel(g = 0): MobModelDef {
  const root = new ModelPart();
  root.add('body', part([box(-1, -1.5, -3, 2, 3, 6, 0, 0, g)], [0, 22, 0]));
  root.add('tail', part([box(0, -1.5, 0, 0, 3, 6, 22, -6, g)], [0, 22, 3]));
  root.add('right_fin', part([box(-2, -1, 0, 2, 2, 0, 2, 16, g)], [-1, 22.5, 0], [0, PI / 4, 0]));
  root.add('left_fin', part([box(0, -1, 0, 2, 2, 0, 2, 12, g)], [1, 22.5, 0], [0, -PI / 4, 0]));
  root.add('top_fin', part([box(0, -3, 0, 0, 3, 6, 10, -5, g)], [0, 20.5, -3]));
  return { root, texW: 32, texH: 32 };
}

/** vanilla TropicalFishModelB.createBodyLayer (the large body) */
export function tropicalBModel(g = 0): MobModelDef {
  const root = new ModelPart();
  root.add('body', part([box(-1, -3, -3, 2, 6, 6, 0, 20, g)], [0, 19, 0]));
  root.add('tail', part([box(0, -3, 0, 0, 6, 5, 21, 16, g)], [0, 19, 3]));
  root.add('right_fin', part([box(-2, 0, 0, 2, 2, 0, 2, 16, g)], [-1, 20, 0], [0, PI / 4, 0]));
  root.add('left_fin', part([box(0, 0, 0, 2, 2, 0, 2, 12, g)], [1, 20, 0], [0, -PI / 4, 0]));
  root.add('top_fin', part([box(0, -4, 0, 0, 4, 6, 20, 11, g)], [0, 16, -3]));
  root.add('bottom_fin', part([box(0, 0, 0, 0, 4, 6, 20, 21, g)], [0, 22, -3]));
  return { root, texW: 32, texH: 32 };
}

/** vanilla DolphinModel.createBodyLayer (64x64): the body carries the fins, the tail (and its flukes) and the head */
export function dolphinModel(): MobModelDef {
  const root = new ModelPart();
  const body = root.add('body', part([box(-4, -7, 0, 8, 7, 13, 22, 0)], [0, 22, -5]));
  body.add('back_fin', part([box(-0.5, 0, 8, 1, 4, 5, 51, 0)], [0, 0, 0], [PI / 3, 0, 0]));
  body.add('left_fin', part([box(-0.5, -4, 0, 1, 4, 7, 48, 20, 0, true)], [2, -2, 4], [PI / 3, 0, (PI * 2) / 3]));
  body.add('right_fin', part([box(-0.5, -4, 0, 1, 4, 7, 48, 20)], [-2, -2, 4], [PI / 3, 0, (-PI * 2) / 3]));
  const tail = body.add('tail', part([box(-2, -2.5, 0, 4, 5, 11, 0, 19)], [0, -2.5, 11], [-0.10471976, 0, 0]));
  tail.add('tail_fin', part([box(-5, -0.5, 0, 10, 1, 6, 19, 20)], [0, 0, 9]));
  const head = body.add('head', part([box(-4, -3, -3, 8, 7, 6, 0, 0)], [0, -4, -3]));
  head.add('nose', part([box(-1, 2, -7, 2, 2, 4, 0, 13)]));
  return { root, texW: 64, texH: 64 };
}

// ---------------------------------------------------------------------------

/**
 * vanilla shadow radii: CodRenderer 0.3, SalmonRenderer 0.4, TropicalFishRenderer 0.15, DolphinRenderer 0.7,
 * SquidRenderer 0.7; PufferfishRenderer's grows a tenth for each stage it's puffed up, from its 0.1 deflated
 */
export const FISH_SHADOW_RADII: Record<string, number> = { cod: 0.3, salmon: 0.4, pufferfish: 0.1, tropical_fish: 0.15, dolphin: 0.7, glow_squid: 0.7 };

export class FishRenderers {
  private readonly cod = codModel();
  private readonly salmon = salmonModel();
  private readonly puffer = [pufferSmallModel(), pufferMidModel(), pufferBigModel()];
  private readonly tropical = [tropicalAModel(), tropicalBModel()];
  private readonly tropicalPattern = [tropicalAModel(0.008), tropicalBModel(0.008)];
  private readonly dolphin = dolphinModel();
  private readonly squid = squidModel();

  constructor(private readonly kit: LivingKit) {}

  /** draws `e` if it's one of these renderers' mobs (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (e instanceof GlowSquid) this.renderGlowSquid(b, e, dx, dy, dz, p);
    else if (e instanceof Dolphin) this.renderDolphin(b, e, dx, dy, dz, p);
    else if (e instanceof AbstractFish) this.renderFish(b, e, dx, dy, dz, p);
    else return false;
    return true;
  }

  private renderFish(b: EntityBatch, e: AbstractFish, dx: number, dy: number, dz: number, p: number): void {
    const kit = this.kit;
    const bob = e.tickCount + p;
    const wet = e.inWater;
    /** vanilla setupRotations' own turn: a sway of `sway` degrees, and lying on its side out of the water */
    const sway = (deg: number, dryX: number, dryY: number, dryZ: number, zBack = 0) => (pose: PoseStack) => {
      pose.rotY(-deg);
      if (zBack) pose.translate(0, 0, zBack);
      if (!wet) {
        pose.translate(-dryX, -dryY, dryZ);
        pose.rotZ(90);
      }
    };
    if (e instanceof Cod) {
      const tex = kit.tex('cod');
      if (!tex) return;
      // vanilla CodRenderer.setupRotations and CodModel.setupAnim
      kit.setupLiving(e, dx, dy, dz, p, 90, sway(4.3 * Math.sin(0.6 * bob), 0.1, 0.1, -0.1));
      this.cod.root.child('tail_fin').yRot = -(wet ? 1 : 1.5) * 0.45 * Math.sin(0.6 * bob);
      this.draw(b, e, this.cod, tex);
    } else if (e instanceof Salmon) {
      const tex = kit.tex('salmon');
      if (!tex) return;
      // vanilla SalmonRenderer.setupRotations (faster, wider out of the water) and SalmonModel.setupAnim
      const f = wet ? 1 : 1.3, f1 = wet ? 1 : 1.7;
      kit.setupLiving(e, dx, dy, dz, p, 90, sway(f * 4.3 * Math.sin(f1 * 0.6 * bob), 0.2, 0.1, 0, -0.4));
      this.salmon.root.child('body_back').yRot = -f * 0.25 * Math.sin(f1 * 0.6 * bob);
      this.draw(b, e, this.salmon, tex);
    } else if (e instanceof Pufferfish) {
      const tex = kit.tex('pufferfish');
      if (!tex) return;
      // vanilla PufferfishRenderer: the model for how puffed up it is, bobbing (up before the turn); its fins flap
      const def = this.puffer[Math.max(0, Math.min(2, e.puffState))];
      kit.setupLiving(e, dx, dy + Math.cos(bob * 0.05) * 0.08, dz, p, 90);
      const k = def.root.children.has('right_fin') ? ['right_fin', 'left_fin'] : ['right_blue_fin', 'left_blue_fin'];
      def.root.child(k[0]).zRot = -0.2 + 0.4 * Math.sin(bob * 0.2);
      def.root.child(k[1]).zRot = 0.2 - 0.4 * Math.sin(bob * 0.2);
      this.draw(b, e, def, tex);
    } else if (e instanceof TropicalFish) {
      const v = unpackTropical(e.variant);
      const i = v.large ? 1 : 0;
      const tex = kit.tex(v.large ? 'tropical_b' : 'tropical_a');
      if (!tex) return;
      // vanilla TropicalFishRenderer.setupRotations and TropicalFishModelA/B.setupAnim
      kit.setupLiving(e, dx, dy, dz, p, 90, sway(4.3 * Math.sin(0.6 * bob), 0.2, 0.1, 0));
      const tail = -(wet ? 1 : 1.5) * 0.45 * Math.sin(0.6 * bob);
      this.tropical[i].root.child('tail').yRot = tail;
      this.tropicalPattern[i].root.child('tail').yRot = tail;
      // the body in its colour (vanilla ColorableHierarchicalModel.setColor), then the pattern layer in the other
      const old = b.color;
      b.color = rgb1(DYE_DIFFUSE[v.base]);
      kit.overlay(b, e);
      kit.drawBody(b, e, this.tropical[i], tex, false);
      const pt = kit.tex(`tropical_${v.large ? 'b' : 'a'}_pattern_${(v.pattern % 6) + 1}`);
      if (pt && !e.isInvisible()) {
        b.color = rgb1(DYE_DIFFUSE[v.patternColor]);
        b.begin(kit.state(pt));
        this.tropicalPattern[i].root.render(b, kit.pose, 32, 32);
      }
      b.color = old;
      b.setOverlay(0, 0, 0, 0);
    }
  }

  private draw(b: EntityBatch, e: Mob, def: MobModelDef, tex: WebGLTexture): void {
    this.kit.overlay(b, e);
    this.kit.drawBody(b, e, def, tex, false);
    b.setOverlay(0, 0, 0, 0);
  }

  /** vanilla DolphinRenderer (DolphinModel.setupAnim) and DolphinCarryingItemLayer */
  private renderDolphin(b: EntityBatch, e: Dolphin, dx: number, dy: number, dz: number, p: number): void {
    const kit = this.kit, def = this.dolphin;
    const tex = kit.tex('dolphin');
    if (!tex) return;
    const a = kit.setupLiving(e, dx, dy, dz, p, 90);
    // (its pitch is kept within a turn but may wrap past it, so it's eased the short way round)
    const pitch = wrapDegrees(e.pitchO + wrapDegrees(e.pitch - e.pitchO) * p);
    const root = def.root, body = root.child('body'), tail = body.child('tail'), flukes = tail.child('tail_fin');
    root.resetPose();
    body.xRot = pitch * RAD;
    body.yRot = a.headYaw * RAD;
    if (e.dx * e.dx + e.dz * e.dz > 1e-7) {
      const c = Math.cos(a.age * 0.3);
      body.xRot += -0.05 - 0.05 * c;
      tail.xRot = -0.1 * c;
      flukes.xRot = -0.2 * c;
    }
    this.draw(b, e, def, tex);
    const held = e.mainHand;
    if (held && !e.isInvisible()) {
      // vanilla DolphinCarryingItemLayer: at its beak, lower and further out the more it looks down (or up)
      const pose = kit.pose;
      pose.push();
      const x = wrapDegrees(e.pitch), f = Math.abs(x) / 60;
      if (x < 0) pose.translate(0, 1 - f * 0.5, -1 + f * 0.5);
      else pose.translate(0, 1 + f * 0.8, -1 + f * 0.2);
      kit.items.render(b, pose, held, 'ground', false);
      pose.pop();
    }
  }

  /**
   * vanilla GlowSquidRenderer: SquidRenderer.setupRotations (its body's own tilt and roll, about its middle), the
   * squid's model and tentacles, and its own light (getBlockLightLevel: full, but none while it's dark after being
   * hurt, brightening over the last half second)
   */
  private renderGlowSquid(b: EntityBatch, e: GlowSquid, dx: number, dy: number, dz: number, p: number): void {
    const kit = this.kit, def = this.squid;
    const tex = kit.tex('glow_squid');
    if (!tex) return;
    const xr = e.xBodyRotO + (e.xBodyRot - e.xBodyRotO) * p;
    const zr = e.zBodyRotO + (e.zBodyRot - e.zBodyRotO) * p;
    // (dying, it tips over as the game's squid does)
    const die = e.deathTime > 0 ? Math.min(1, Math.sqrt(Math.max(0, ((e.deathTime + p - 1) / 20) * 1.6))) * 90 : 0;
    kit.setupLiving(e, dx, dy, dz, p, 0, (pose) => {
      pose.translate(0, -0.5, 0);
      pose.rotX(-xr);
      pose.rotY(-zr);
      pose.translate(0, 1.2, 0);
      if (die) pose.rotZ(die);
    });
    animateSquid(def.root, e.oldTentacleAngle + (e.tentacleAngle - e.oldTentacleAngle) * p);
    const oldB = b.lightB;
    b.lightB = e.blockLight(Math.round(b.lightB / 16)) * 16;
    this.draw(b, e, def, tex);
    b.lightB = oldB;
  }
}

const rgb1 = (c: number): [number, number, number, number] => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, 1];
