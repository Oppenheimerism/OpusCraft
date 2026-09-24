// The trident's model (vanilla TridentModel, textures/entity/trident.png): drawn in flight (ThrownTridentRenderer)
// and in the hand (its builtin/entity item model, BlockEntityWithoutLevelRenderer.renderByItem), with the entity
// glint when enchanted; and riptide's swirl round a spinning player (SpinAttackEffectLayer).

import type { GL } from './gl';
import { createTexture } from './gl';
import type { DrawState, EntityBatch, PoseStack } from './entityRenderer';
import { ModelPart } from './model';
import { MOB_TEXTURES } from '../textures/mobs';
import '../textures/trident';
import { glintTexture, glintOffset } from '../textures/glint';
import type { ThrownTrident } from '../entity/thrownTrident';

/** vanilla TridentModel.createLayer (32x32): the pole, the crossbar at its head and three prongs above it */
export function tridentModel(): ModelPart {
  const root = new ModelPart();
  const pole = root.add('pole', new ModelPart([{ x: -0.5, y: 2, z: -0.5, w: 1, h: 25, d: 1, u: 0, v: 6 }]));
  pole.add('base', new ModelPart([{ x: -1.5, y: 0, z: -0.5, w: 3, h: 2, d: 1, u: 4, v: 0 }]));
  pole.add('left_spike', new ModelPart([{ x: -2.5, y: -3, z: -0.5, w: 1, h: 4, d: 1, u: 4, v: 3 }]));
  pole.add('middle_spike', new ModelPart([{ x: -0.5, y: -4, z: -0.5, w: 1, h: 4, d: 1, u: 0, v: 0 }]));
  pole.add('right_spike', new ModelPart([{ x: 1.5, y: -3, z: -0.5, w: 1, h: 4, d: 1, u: 4, v: 3, mirror: true }]));
  return root;
}

/** vanilla SpinAttackEffectLayer.createLayer (64x64): one tall box */
function spinBox(): ModelPart {
  const root = new ModelPart();
  root.add('box', new ModelPart([{ x: -8, y: -16, z: -8, w: 16, h: 32, d: 16, u: 0, v: 0 }]));
  return root;
}

export class TridentRenderer {
  private readonly model = tridentModel();
  private readonly box = spinBox();
  private tex: WebGLTexture | null = null;
  private riptideTex: WebGLTexture | null = null;
  private glintTex: WebGLTexture | null = null;

  constructor(private readonly gl: GL) {}

  private texture(name: 'trident' | 'trident_riptide'): WebGLTexture {
    const img = MOB_TEXTURES[name]();
    return createTexture(this.gl, img.w, img.h, new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), { clamp: true });
  }

  /**
   * the model at the pose (model space: prongs up, towards -y), solid (vanilla RenderType.entitySolid), and the glint
   * over it when `foil` (ItemRenderer.getFoilBufferDirect: entityGlintDirect)
   */
  renderModel(b: EntityBatch, pose: PoseStack, foil: boolean, useLightmap = true): void {
    this.tex ??= this.texture('trident');
    b.begin({ texture: this.tex, cutoff: -1, blend: false, cull: true, lit: true, useLightmap });
    this.model.render(b, pose, 32, 32);
    if (foil) this.renderGlint(b, pose);
  }

  /**
   * vanilla RenderType.entityGlintDirect: the model again, unlit, added on where it already is, with the glint texture
   * scrolled by translate(-f, f1) · rotZ(10°) · scale(0.16) (ENTITY_GLINT_TEXTURING)
   */
  private renderGlint(b: EntityBatch, pose: PoseStack): void {
    if (!this.glintTex) {
      const t = glintTexture();
      this.glintTex = createTexture(this.gl, t.w, t.h, t.data, { nearest: false, clamp: false });
    }
    const [f, f1] = glintOffset(performance.now());
    const c = Math.cos(Math.PI / 18) * 0.16, sn = Math.sin(Math.PI / 18) * 0.16;
    const fog = b.fogColor;
    // fog fades an additive layer towards adding nothing, not towards the fog colour
    b.fogColor = [0, 0, 0];
    b.begin({ texture: this.glintTex, cutoff: -1, blend: true, additive: true, depthWrite: false, depthEqual: true, cull: true, lit: false, useLightmap: false });
    b.uvTransform = [c, -sn, -f, sn, c, f1];
    this.model.render(b, pose, 32, 32);
    b.flush();
    b.uvTransform = null;
    b.fogColor = fog;
  }

  /** vanilla ThrownTridentRenderer: turned to its flight (yaw - 90, then pitch + 90: the prongs lead) */
  renderThrown(b: EntityBatch, pose: PoseStack, e: ThrownTrident, dx: number, dy: number, dz: number, p: number, yaw: number): void {
    b.setOverlay(0, 0, 0, 0);
    pose.reset();
    pose.translate(dx, dy, dz);
    pose.rotY(yaw - 90);
    pose.rotZ(e.pitchO + (e.pitch - e.pitchO) * p + 90);
    this.renderModel(b, pose, e.foil);
  }

  /**
   * vanilla SpinAttackEffectLayer.render, at the spinning player's model root: the box three times, spun about the
   * body at 45, 50 and 55° a tick, scaled 0, 0.75 and 1.5 (so two show) and stepped down it; cut out, both sides
   */
  renderSpin(b: EntityBatch, pose: PoseStack, age: number): void {
    this.riptideTex ??= this.texture('trident_riptide');
    const st: DrawState = { texture: this.riptideTex, cutoff: 0.1, blend: false, cull: false, lit: true, useLightmap: true };
    b.setOverlay(0, 0, 0, 0);
    b.begin(st);
    for (let i = 0; i < 3; i++) {
      pose.push();
      pose.rotY(age * -(45 + i * 5));
      const f = 0.75 * i;
      pose.scale(f, f, f);
      pose.translate(0, -0.2 + 0.6 * i, 0);
      if (f > 0) this.box.render(b, pose, 64, 64);
      pose.pop();
    }
  }
}
