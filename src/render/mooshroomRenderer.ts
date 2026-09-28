// (remaining mobs: the mooshroom) Mooshrooms: vanilla MushroomCowRenderer, the cow's model (CowModel, 64x32) in a red or
// a brown mooshroom's skin, walking as the cow does, with its MushroomCowMushroomLayer: three of its mushrooms (the
// small mushroom's block, red or brown) standing on it, two on its back and one on its head (turning with it), none
// on a calf, flashing red with it when it's hurt, and not drawn while it's invisible.

import type { EntityBatch } from './entityRenderer';
import { cowModel, animateQuadruped } from './mobModels';
import type { LivingKit } from './illagerRenderers';
import type { Mob } from '../entity/mob';
import { Mooshroom } from '../entity/mooshroom';
import { S } from '../world/block';
import '../textures/mooshroom';

/** vanilla MushroomCowRenderer's shadow radius (a calf's half: MobRenderer.getShadowRadius) */
export const MOOSHROOM_SHADOW_RADII: Record<string, number> = { mooshroom: 0.7 };

/** vanilla MushroomCowRenderer.TEXTURES: the skin of each colour */
export function mooshroomTexture(e: Mooshroom): string {
  return `${e.variant}_mooshroom`;
}

export class MooshroomRenderers {
  private readonly model = cowModel();

  constructor(private readonly kit: LivingKit) {}

  /** draws `e` if it's a mooshroom (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (!(e instanceof Mooshroom)) return false;
    const kit = this.kit;
    const tex = kit.tex(mooshroomTexture(e)) ?? kit.tex('cow');
    if (!tex) return true;
    const a = kit.setupLiving(e, dx, dy, dz, p, 90);
    animateQuadruped(this.model.root, a.limbSwing, a.limbAmount, a.headYaw, a.headPitch);
    kit.overlay(b, e);
    kit.drawBody(b, e, this.model, tex, e.isBaby());
    // vanilla MushroomCowMushroomLayer (after the body, in the model's space; with the body's hurt overlay)
    if (!e.isBaby() && !e.isInvisible()) {
      const pose = kit.pose, state = S(e.variant === 'brown' ? 'brown_mushroom' : 'red_mushroom');
      // (on its back, towards the rump)
      pose.push();
      pose.translate(0.2, -0.35, 0.5);
      pose.rotY(-48);
      pose.scale(-1, -1, 1);
      pose.translate(-0.5, -0.5, -0.5);
      kit.items.renderBlockState(b, pose, state);
      pose.pop();
      // (on its back, nearer the shoulders)
      pose.push();
      pose.translate(0.2, -0.35, 0.5);
      pose.rotY(42);
      pose.translate(0.1, 0, -0.6);
      pose.rotY(-48);
      pose.scale(-1, -1, 1);
      pose.translate(-0.5, -0.5, -0.5);
      kit.items.renderBlockState(b, pose, state);
      pose.pop();
      // (on its head, between the horns)
      pose.push();
      this.model.root.child('head').translateAndRotate(pose);
      pose.translate(0, -0.7, -0.2);
      pose.rotY(-78);
      pose.scale(-1, -1, 1);
      pose.translate(-0.5, -0.5, -0.5);
      kit.items.renderBlockState(b, pose, state);
      pose.pop();
    }
    b.setOverlay(0, 0, 0, 0);
    return true;
  }
}
