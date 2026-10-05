// (the wither) The wither and its skulls: vanilla WitherBossRenderer with WitherBossModel (64x64) — a bar of collar
// bone across the shoulders with three skulls on it, the big one in the middle and a smaller one at either end, a
// spine hung from the middle of the collar with three ribs across it, and a tail below that, the ribcage and tail
// swaying back and forth as it breathes. The whole of it at twice the model's size, lit by its own light; the side
// heads turn to what they're aiming at, the middle one to where it looks. While it's charging up after it's built it
// grows from one and a half to twice its size, pale, flashing back to its dark self over its last four seconds.
// Below half health it wears its armour (vanilla WitherArmorLayer, an EnergySwirlLayer): the same model blown up by
// half a pixel, its texture swirling over it, added on. Its skulls (vanilla WitherSkullRenderer with SkullModel's
// wither skull layer): a head cut from the bottom of its texture, turned the way the skull flies, the blue ones pale.

import type { EntityBatch } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import type { MobModelDef } from './mobModels';
import type { LivingKit } from './illagerRenderers';
import type { Mob } from '../entity/mob';
import { WitherBoss, WitherSkull, WITHER_SPAWN_TICKS } from '../entity/wither';
import { wrapDegrees } from '../core/math';
import '../textures/wither';

const RAD = Math.PI / 180;
/** vanilla WitherBossModel.RIBCAGE_X_ROT_OFFSET and TAIL_X_ROT_OFFSET (times pi) */
const RIBCAGE_X_ROT = 0.065;
const TAIL_X_ROT = 0.265;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

/**
 * vanilla WitherBossModel.createBodyLayer (64x64), every box grown by `inflate` (vanilla ModelLayers.WITHER_ARMOR is
 * CubeDeformation 0.5). The two side heads share a box and its texture
 */
export function witherModel(inflate = 0): MobModelDef {
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, u: number, v: number): Cube =>
    inflate ? { x, y, z, w, h, d, u, v, inflate } : { x, y, z, w, h, d, u, v };
  const root = new ModelPart();
  root.add('shoulders', part([box(-10, 3.9, -0.5, 20, 3, 3, 0, 16)]));
  const rib = RIBCAGE_X_ROT * Math.PI;
  root.add(
    'ribcage',
    part(
      [box(0, 0, 0, 3, 10, 3, 0, 22), box(-4, 1.5, 0.5, 11, 2, 2, 24, 22), box(-4, 4, 0.5, 11, 2, 2, 24, 22), box(-4, 6.5, 0.5, 11, 2, 2, 24, 22)],
      [-2, 6.9, -0.5],
      [rib, 0, 0],
    ),
  );
  root.add('tail', part([box(0, 0, 0, 3, 6, 3, 12, 22)], [-2, 6.9 + Math.cos(rib) * 10, -0.5 + Math.sin(rib) * 10], [TAIL_X_ROT * Math.PI, 0, 0]));
  root.add('center_head', part([box(-4, -4, -4, 8, 8, 8, 0, 0)]));
  root.add('right_head', part([box(-4, -4, -4, 6, 6, 6, 32, 0)], [-8, 4, 0]));
  root.add('left_head', part([box(-4, -4, -4, 6, 6, 6, 32, 0)], [10, 4, 0]));
  return { root, texW: 64, texH: 64 };
}

/**
 * vanilla WitherBossModel.prepareMobModel and setupAnim: the side heads turned to their own aim (vanilla
 * setupHeadRotation: the right head the first of them, the left the second, from the body's turn); the ribcage
 * swaying with its breath (a cosine of a tenth of a radian a tick), the tail hung from the ribcage's end and swinging
 * twice as far; the middle head where it looks
 */
export function animateWither(root: ModelPart, e: WitherBoss, age: number, headYaw: number, headPitch: number): void {
  root.resetPose();
  const right = root.child('right_head'), left = root.child('left_head');
  right.yRot = (e.yRotHeads[0] - e.bodyYaw) * RAD;
  right.xRot = e.xRotHeads[0] * RAD;
  left.yRot = (e.yRotHeads[1] - e.bodyYaw) * RAD;
  left.xRot = e.xRotHeads[1] * RAD;
  const f = Math.cos(age * 0.1);
  const ribcage = root.child('ribcage'), tail = root.child('tail');
  ribcage.xRot = (RIBCAGE_X_ROT + 0.05 * f) * Math.PI;
  tail.x = -2;
  tail.y = 6.9 + Math.cos(ribcage.xRot) * 10;
  tail.z = -0.5 + Math.sin(ribcage.xRot) * 10;
  tail.xRot = (TAIL_X_ROT + 0.1 * f) * Math.PI;
  const head = root.child('center_head');
  head.yRot = headYaw * RAD;
  head.xRot = headPitch * RAD;
}

/** vanilla WitherSkullRenderer.createSkullLayer: a skull eight pixels across, sitting on its pivot, from (0, 35) */
export function witherSkullModel(): MobModelDef {
  const root = new ModelPart();
  root.add('head', part([{ x: -4, y: -8, z: -4, w: 8, h: 8, d: 8, u: 0, v: 35 }]));
  return { root, texW: 64, texH: 64 };
}

/**
 * vanilla WitherBossRenderer.getTextureLocation: pale while it charges up, flashing back to its dark self over the
 * last 80 ticks (dark one five-tick beat in two)
 */
export function witherTexture(invulnerableTicks: number): 'wither' | 'wither_invulnerable' {
  const i = invulnerableTicks;
  return i > 0 && (i > 80 || Math.floor(i / 5) % 2 !== 1) ? 'wither_invulnerable' : 'wither';
}

/** vanilla WitherBossRenderer.scale: twice the model's size, one and a half growing to two while it charges up */
export function witherScale(invulnerableTicks: number, p: number): number {
  return invulnerableTicks > 0 ? 2 - ((invulnerableTicks - p) / WITHER_SPAWN_TICKS) * 0.5 : 2;
}

/** vanilla WitherBossRenderer's shadow (MobRenderer's radius 1); its skulls have none */
export const WITHER_SHADOW_RADII: Record<string, number> = { wither: 1 };

export class WitherRenderers {
  private readonly model = witherModel();
  /** vanilla ModelLayers.WITHER_ARMOR */
  private readonly armor = witherModel(0.5);
  private readonly skull = witherSkullModel();

  constructor(private readonly kit: LivingKit) {}

  /** draws `e` if it's the wither (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (!(e instanceof WitherBoss)) return false;
    const kit = this.kit;
    const tex = kit.tex(witherTexture(e.invulnerableTicks));
    if (!tex) return true;
    const s = witherScale(e.invulnerableTicks, p);
    const a = kit.setupLiving(e, dx, dy, dz, p, 90, (pose) => pose.scale(s, s, s));
    animateWither(this.model.root, e, a.age, a.headYaw, a.headPitch);
    kit.overlay(b, e);
    kit.drawBody(b, e, this.model, tex, false);
    b.setOverlay(0, 0, 0, 0);
    if (e.isPowered()) this.renderArmor(b, e, a.age, a.headYaw, a.headPitch, p);
    return true;
  }

  /**
   * vanilla WitherArmorLayer (EnergySwirlLayer.render): below half health, the armour model posed as the body is,
   * its texture scrolled (across by three times the cosine of a fiftieth of its age, down by a hundredth of it) and
   * added on at half strength, unlit, both sides — drawn even while it's invisible, as layers are
   */
  private renderArmor(b: EntityBatch, e: WitherBoss, age: number, headYaw: number, headPitch: number, p: number): void {
    const kit = this.kit, t = kit.tex('wither_armor');
    if (!t) return;
    animateWither(this.armor.root, e, age, headYaw, headPitch);
    const f = e.tickCount + p;
    b.begin(kit.state(t, { cutoff: 0.1, blend: true, additive: true, lit: false, useLightmap: false, uvOffset: [(Math.cos(f * 0.02) * 3) % 1, (f * 0.01) % 1] }));
    // (vanilla's colour -8355712: 0xff808080, half strength)
    kit.drawModel(b, this.armor, false, 0.5, 0.5, 0.5, 1);
    b.flush();
  }

  /**
   * vanilla WitherSkullRenderer.render: the skull turned the way it flies (SkullModel.setupAnim with its yaw and
   * pitch), drawn translucent (SkullModel's entityTranslucent) by its own light (entityRenderers setLight); a blue
   * skull in the pale skin
   */
  renderSkull(b: EntityBatch, e: WitherSkull, dx: number, dy: number, dz: number, p: number): void {
    const kit = this.kit;
    const tex = kit.tex(e.dangerous ? 'wither_invulnerable' : 'wither');
    if (!tex) return;
    const head = this.skull.root.child('head');
    head.yRot = (e.yawO + wrapDegrees(e.yaw - e.yawO) * p) * RAD;
    head.xRot = (e.pitchO + (e.pitch - e.pitchO) * p) * RAD;
    const pose = kit.pose;
    pose.reset();
    pose.translate(dx, dy, dz);
    pose.scale(-1, -1, 1);
    b.setOverlay(0, 0, 0, 0);
    b.begin(kit.state(tex, { blend: true, cutoff: 0.1 }));
    kit.drawModel(b, this.skull, false);
    b.flush();
  }
}
