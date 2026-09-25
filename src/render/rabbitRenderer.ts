// Rabbits: vanilla RabbitRenderer with RabbitModel, a small hunched body on long hind feet, its ears up. It doesn't
// walk: as it hops its haunches and hind feet kick back and its forelegs reach forward, and fold again as it lands
// (the model's jump rotation, over the hop's ten ticks). The grown one is drawn at 0.6 of the model; a baby's head is
// drawn big on a small body. The skin is its coat's, the killer bunny's own, or, for one named Toast, Toast's.

import type { EntityBatch } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import type { MobModelDef } from './mobModels';
import type { LivingKit, LivingAnim } from './illagerRenderers';
import type { Mob } from '../entity/mob';
import { Rabbit } from '../entity/rabbit';
import '../textures/rabbit';

const PI = Math.PI;
const RAD = PI / 180;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

const HEAD_PARTS = ['head', 'left_ear', 'right_ear', 'nose'];
const BODY_PARTS = ['left_hind_foot', 'right_hind_foot', 'left_haunch', 'right_haunch', 'body', 'left_front_leg', 'right_front_leg', 'tail'];

/**
 * vanilla RabbitModel.createBodyLayer, 64x32, and its renderToBuffer: grown, every part at 0.6 (moved down a block
 * of the model to stand on the ground); young, the head, ears and nose at 0.5667 and the rest at 0.4
 */
export function rabbitModel(): MobModelDef {
  const root = new ModelPart();
  const hindFoot = (u: number, v: number): Cube => ({ x: -1, y: 5.5, z: -3.7, w: 2, h: 1, d: 7, u, v });
  const haunch = (u: number, v: number): Cube => ({ x: -1, y: 0, z: 0, w: 2, h: 4, d: 5, u, v });
  const frontLeg = (u: number, v: number): Cube => ({ x: -1, y: 0, z: -1, w: 2, h: 7, d: 2, u, v });
  root.add('left_hind_foot', part([hindFoot(26, 24)], [3, 17.5, 3.7]));
  root.add('right_hind_foot', part([hindFoot(8, 24)], [-3, 17.5, 3.7]));
  root.add('left_haunch', part([haunch(30, 15)], [3, 17.5, 3.7], [-0.34906584, 0, 0]));
  root.add('right_haunch', part([haunch(16, 15)], [-3, 17.5, 3.7], [-0.34906584, 0, 0]));
  root.add('body', part([{ x: -3, y: -2, z: -10, w: 6, h: 5, d: 10, u: 0, v: 0 }], [0, 19, 8], [-0.34906584, 0, 0]));
  root.add('left_front_leg', part([frontLeg(8, 15)], [3, 17, -1], [-0.17453292, 0, 0]));
  root.add('right_front_leg', part([frontLeg(0, 15)], [-3, 17, -1], [-0.17453292, 0, 0]));
  root.add('head', part([{ x: -2.5, y: -4, z: -5, w: 5, h: 4, d: 5, u: 32, v: 0 }], [0, 16, -1]));
  root.add('right_ear', part([{ x: -2.5, y: -9, z: -1, w: 2, h: 5, d: 1, u: 52, v: 0 }], [0, 16, -1], [0, -0.2617994, 0]));
  root.add('left_ear', part([{ x: 0.5, y: -9, z: -1, w: 2, h: 5, d: 1, u: 58, v: 0 }], [0, 16, -1], [0, 0.2617994, 0]));
  root.add('tail', part([{ x: -1.5, y: -1.5, z: 0, w: 3, h: 3, d: 2, u: 52, v: 6 }], [0, 20, 7], [-0.3490659, 0, 0]));
  root.add('nose', part([{ x: -0.5, y: -2.5, z: -5.5, w: 1, h: 1, d: 1, u: 32, v: 9 }], [0, 16, -1]));
  const s = 0.56666666;
  return {
    root, texW: 64, texH: 32,
    groups: [{ parts: [...BODY_PARTS, ...HEAD_PARTS], scale: [0.6, 0.6, 0.6], translate: [0, 1, 0] }],
    babyGroups: [
      { parts: HEAD_PARTS, scale: [s, s, s], translate: [0, 1.375, 0.125] },
      { parts: BODY_PARTS, scale: [0.4, 0.4, 0.4], translate: [0, 2.25, 0] },
    ],
  };
}

/**
 * vanilla RabbitModel.setupAnim: the head (with its ears and nose) turns and nods; the hop's rotation, the sine of
 * how far through it is, swings the haunches and hind feet back by up to 50° and the forelegs forward by 40°
 */
export function animateRabbit(root: ModelPart, e: Rabbit, a: LivingAnim, p: number): void {
  for (const [, c] of root.children) c.resetPose();
  const pitch = a.headPitch * RAD, yaw = a.headYaw * RAD;
  const head = root.child('head'), nose = root.child('nose'), re = root.child('right_ear'), le = root.child('left_ear');
  nose.xRot = head.xRot = re.xRot = le.xRot = pitch;
  nose.yRot = head.yRot = yaw;
  re.yRot = yaw - PI / 12;
  le.yRot = yaw + PI / 12;
  const j = Math.sin(e.jumpCompletion(p) * PI);
  root.child('left_haunch').xRot = root.child('right_haunch').xRot = (j * 50 - 21) * RAD;
  root.child('left_hind_foot').xRot = root.child('right_hind_foot').xRot = j * 50 * RAD;
  root.child('left_front_leg').xRot = root.child('right_front_leg').xRot = (j * -40 - 11) * RAD;
}

/** vanilla RabbitRenderer's textures (textures/entity/rabbit/*.png), by coat; the killer bunny's is caerbannog */
const TEXTURES: Record<number, string> = { 0: 'rabbit_brown', 1: 'rabbit_white', 2: 'rabbit_black', 3: 'rabbit_white_splotched', 4: 'rabbit_gold', 5: 'rabbit_salt', 99: 'rabbit_caerbannog' };

/** vanilla RabbitRenderer.getTextureLocation: one named Toast (its name's formatting aside) is Toast, whatever its coat */
export function rabbitTexture(e: Rabbit): string {
  if ((e.customName ?? '').replace(/§[0-9a-fk-or]/gi, '') === 'Toast') return 'rabbit_toast';
  return TEXTURES[e.variant] ?? 'rabbit_brown';
}

/** vanilla RabbitRenderer's shadow (MobRenderer: a baby's half) */
export const RABBIT_SHADOW_RADII: Record<string, number> = { rabbit: 0.3 };

export class RabbitRenderers {
  private readonly model = rabbitModel();

  constructor(private readonly kit: LivingKit) {}

  /** draws `e` if it's a rabbit (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (!(e instanceof Rabbit)) return false;
    const kit = this.kit;
    const tex = kit.tex(rabbitTexture(e));
    if (!tex) return true;
    const a = kit.setupLiving(e, dx, dy, dz, p, 90);
    animateRabbit(this.model.root, e, a, p);
    kit.overlay(b, e);
    kit.drawBody(b, e, this.model, tex, e.isBaby());
    b.setOverlay(0, 0, 0, 0);
    return true;
  }
}
