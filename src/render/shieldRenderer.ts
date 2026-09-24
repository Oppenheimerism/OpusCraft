// The shield's looks (vanilla ShieldModel, and BlockEntityWithoutLevelRenderer.renderByItem for the shield with
// models/item/shield.json's and shield_blocking.json's display transforms): the plate with the handle behind it,
// plain or painted with the banner that decorated it, the enchantment glint over it when it has one; in the hand
// (turned to face forwards while it's held up), on the ground, in a frame, and as the inventory's icon (drawn
// offscreen at the GUI's angle and kept). The textures are textures/shieldTextures.ts.

import type { GL } from './gl';
import { createTexture } from './gl';
import type { EntityBatch, PoseStack } from './entityRenderer';
import { ModelPart } from './model';
import type { DisplayContext } from './itemRenderer';
import { ItemIconBaker } from './itemIconBaker';
import { setStackIconHook } from '../gui/guiGraphics';
import type { BannerLayer, ItemStack } from '../item/item';
import { shieldKey, shieldTexture } from '../textures/shieldTextures';
import { glintTexture, glintOffset } from '../textures/glint';

export interface ShieldModel {
  plate: ModelPart;
  handle: ModelPart;
}

/** vanilla ShieldModel.createLayer (64x64) */
export function shieldModel(): ShieldModel {
  return {
    plate: new ModelPart([{ x: -6, y: -11, z: -2, w: 12, h: 22, d: 1, u: 0, v: 0 }]),
    handle: new ModelPart([{ x: -1, y: -3, z: -1, w: 2, h: 6, d: 6, u: 26, v: 0 }]),
  };
}

interface Transform {
  rot: [number, number, number];
  trans: [number, number, number];
  scale: number;
}

/** (vanilla ItemTransform.NO_TRANSFORM: a model with nothing for a context) */
const NONE: Transform = { rot: [0, 0, 0], trans: [0, 0, 0], scale: 1 };

/** models/item/shield.json display */
const DISPLAY: Record<DisplayContext, Transform> = {
  thirdperson_righthand: { rot: [0, 90, 0], trans: [10, 6, -4], scale: 1 },
  thirdperson_lefthand: { rot: [0, 90, 0], trans: [10, 6, 12], scale: 1 },
  firstperson_righthand: { rot: [0, 180, 5], trans: [-10, 2, -10], scale: 1.25 },
  firstperson_lefthand: { rot: [0, 180, 5], trans: [10, 0, -10], scale: 1.25 },
  gui: { rot: [15, -25, -5], trans: [2, 3, 0], scale: 0.65 },
  fixed: { rot: [0, 180, 0], trans: [-4.5, 4.5, -5], scale: 0.55 },
  ground: { rot: [0, 0, 0], trans: [2, 4, 2], scale: 0.25 },
  head: NONE,
};

/** models/item/shield_blocking.json display (the `blocking` override: its holder is using it), held up before them */
const BLOCKING_DISPLAY: Record<DisplayContext, Transform> = {
  thirdperson_righthand: { rot: [45, 135, 0], trans: [3.51, 11, -2], scale: 1 },
  thirdperson_lefthand: { rot: [45, 135, 0], trans: [13.51, 3, 5], scale: 1 },
  firstperson_righthand: { rot: [0, 180, -5], trans: [-15, 5, -11], scale: 1.25 },
  firstperson_lefthand: { rot: [0, 180, -5], trans: [5, 5, -11], scale: 1.25 },
  gui: DISPLAY.gui,
  fixed: NONE,
  ground: NONE,
  head: NONE,
};

/** the shield's display transform's y scale in `ctx` (a dropped one's bob) */
export function shieldDisplayScaleY(ctx: DisplayContext): number {
  return DISPLAY[ctx].scale;
}

/** vanilla BASE_COLOR: what the banner that decorated it gave it (none on a plain shield) */
function baseOf(s: ItemStack): string | null {
  return s.tag?.baseColor ?? null;
}

function layersOf(s: ItemStack): readonly BannerLayer[] {
  return s.tag?.patterns ?? [];
}

export class ShieldRenderer {
  private readonly model = shieldModel();
  private readonly textures = new Map<string, WebGLTexture>();
  private readonly icons: ItemIconBaker;
  private glintTex: WebGLTexture | null = null;

  constructor(private readonly gl: GL) {
    this.icons = new ItemIconBaker(gl);
    setStackIconHook('shield', (g, s, x, y) => {
      if (s.item.id !== 'shield') return false;
      const size = Math.max(1, Math.round(16 * g.scale));
      const icon = this.icons.icon(shieldKey(baseOf(s), layersOf(s)), size, (b, pose) => this.drawItem(b, pose, s, DISPLAY.gui, false, false, false));
      if (!icon) return false;
      const px = Math.round(x * g.scale), py = Math.round(y * g.scale);
      g.ctx.imageSmoothingEnabled = false;
      g.ctx.drawImage(icon, px, py, size, size);
      // (the glint scrolls: over the kept icon, masked to it)
      if (s.hasGlint()) g.icons?.drawGlint?.(g.ctx, icon, px, py, size);
      return true;
    });
  }

  /** a design's texture (made the first time it's seen) */
  private texture(s: ItemStack): WebGLTexture {
    const base = baseOf(s), layers = layersOf(s);
    const key = shieldKey(base, layers);
    let t = this.textures.get(key);
    if (!t) {
      const img = shieldTexture(base, layers);
      t = createTexture(this.gl, img.w, img.h, new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength));
      this.textures.set(key, t);
    }
    return t;
  }

  /**
   * vanilla ItemRenderer.render for the shield: its display transform in `ctx` (shield_blocking's while `blocking`;
   * the left hand's mirrored, vanilla ItemTransform.apply), then BlockEntityWithoutLevelRenderer's
   */
  renderItem(b: EntityBatch, pose: PoseStack, s: ItemStack, ctx: DisplayContext, left: boolean, blocking: boolean, useLightmap = true): void {
    this.drawItem(b, pose, s, (blocking ? BLOCKING_DISPLAY : DISPLAY)[ctx], left, useLightmap, s.hasGlint());
  }

  private drawItem(b: EntityBatch, pose: PoseStack, s: ItemStack, t: Transform, left: boolean, useLightmap: boolean, foil: boolean): void {
    pose.push();
    pose.translate(((left ? -1 : 1) * t.trans[0]) / 16, t.trans[1] / 16, t.trans[2] / 16);
    pose.rotX(t.rot[0]);
    pose.rotY(left ? -t.rot[1] : t.rot[1]);
    pose.rotZ(left ? -t.rot[2] : t.rot[2]);
    pose.scale(t.scale, t.scale, t.scale);
    pose.translate(-0.5, -0.5, -0.5);
    // vanilla BlockEntityWithoutLevelRenderer.renderByItem: scale(1, -1, -1), the handle, then the plate (solid;
    // the plain texture, or the painted one), the glint over both (ItemRenderer.getFoilBufferDirect: glintDirect)
    pose.scale(1, -1, -1);
    b.begin({ texture: this.texture(s), cutoff: -1, blend: false, cull: true, lit: true, useLightmap });
    this.model.handle.render(b, pose, 64, 64);
    this.model.plate.render(b, pose, 64, 64);
    if (foil) this.renderGlint(b, pose);
    pose.pop();
  }

  /**
   * vanilla RenderType.glintDirect: the model again, unlit, added on where it already is, with the glint texture
   * scrolled by translate(-f, f1) · rotZ(10°) · scale(8) (GLINT_TEXTURING)
   */
  private renderGlint(b: EntityBatch, pose: PoseStack): void {
    if (!this.glintTex) {
      const t = glintTexture();
      this.glintTex = createTexture(this.gl, t.w, t.h, t.data, { nearest: false, clamp: false });
    }
    const [f, f1] = glintOffset(performance.now());
    const c = Math.cos(Math.PI / 18) * 8, sn = Math.sin(Math.PI / 18) * 8;
    const fog = b.fogColor;
    // fog fades an additive layer towards adding nothing, not towards the fog colour
    b.fogColor = [0, 0, 0];
    b.begin({ texture: this.glintTex, cutoff: -1, blend: true, additive: true, depthWrite: false, depthEqual: true, cull: true, lit: false, useLightmap: false });
    b.uvTransform = [c, -sn, -f, sn, c, f1];
    this.model.handle.render(b, pose, 64, 64);
    this.model.plate.render(b, pose, 64, 64);
    b.flush();
    b.uvTransform = null;
    b.fogColor = fog;
  }
}
