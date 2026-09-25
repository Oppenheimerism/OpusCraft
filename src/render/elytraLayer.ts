// A worn elytra (vanilla ElytraLayer and ElytraModel, on players, the humanoid mobs and armour stands): two wings
// hanging from the shoulders, folded down the back and crossed at the top. Gliding, they spread out level, swept back
// the steeper the dive; crouching, they fold in tighter. A player's wings ease toward where they're going a tenth of
// the way each frame. An enchanted one shimmers like armour.
// Broken (down to its last point of durability) the item looks torn (vanilla's "broken" predicate on
// models/item/elytra.json): in the inventory, in the hand, on the ground and in a frame. The worn wings don't change.

import type { GL } from './gl';
import { createTexture } from './gl';
import { PoseStack } from './entityRenderer';
import type { EntityBatch, DrawState } from './entityRenderer';
import { ModelPart } from './model';
import { setSpecialItemRenderer, type ItemRenderer } from './itemRenderer';
import { setStackIconHook } from '../gui/guiGraphics';
import { glintTexture, glintOffset } from '../textures/glint';
import { elytraTexture } from '../textures/elytra';
import { isFlyEnabled } from '../entity/elytra';
import type { LivingEntity } from '../entity/living';
import type { ItemStack } from '../item/item';

/** vanilla RenderStateShard.VIEW_OFFSET_Z_LAYERING (armorCutoutNoCull's): drawn a hair nearer the eye */
const VIEW_OFFSET = 0.99975586;

/** a player's wing turn, eased a frame at a time (vanilla AbstractClientPlayer.elytraRotX, Y, Z) */
interface WingTurn {
  x: number;
  y: number;
  z: number;
}

export class ElytraLayer {
  private readonly root = new ModelPart();
  /** vanilla ElytraModel.createLayer: each wing a 10 x 20 x 2 box grown by a pixel, from the shoulder */
  private readonly left = this.root.add('left_wing', new ModelPart([{ x: -10, y: 0, z: 0, w: 10, h: 20, d: 2, u: 22, v: 0, inflate: 1 }], [5, 0, 0], [Math.PI / 12, 0, -Math.PI / 12]));
  private readonly right = this.root.add('right_wing', new ModelPart([{ x: 0, y: 0, z: 0, w: 10, h: 20, d: 2, u: 22, v: 0, inflate: 1, mirror: true }], [-5, 0, 0], [Math.PI / 12, 0, Math.PI / 12]));
  private readonly turns = new WeakMap<LivingEntity, WingTurn>();
  private readonly pose = new PoseStack();
  private tex: WebGLTexture | null = null;
  private glintTex: WebGLTexture | null = null;
  /** (set while the broken item draws through the item renderer, which asks this renderer first) */
  private drawingBroken = false;

  constructor(private readonly gl: GL, items: ItemRenderer) {
    // the torn look of a broken one, wherever the item's drawn
    setSpecialItemRenderer('broken_elytra', {
      render: (b, pose, s, ctx, left) => {
        if (this.drawingBroken || !isBroken(s)) return false;
        this.drawingBroken = true;
        try {
          items.render(b, pose, s, ctx, left, 'broken_elytra');
        } finally {
          this.drawingBroken = false;
        }
        return true;
      },
      displayScaleY: () => undefined,
    });
    setStackIconHook('broken_elytra', (g, s, x, y) => {
      if (!isBroken(s)) return false;
      const ok = g.item('broken_elytra', x, y);
      if (ok && s.hasGlint()) g.icons?.drawGlint?.(g.ctx, 'broken_elytra', Math.round(x * g.scale), Math.round(y * g.scale), 16 * g.scale);
      return ok;
    });
  }

  /**
   * vanilla ElytraLayer.render: when `chest` is an elytra, the wings from the wearer's posed model (at `parentPose`),
   * an eighth of a block behind it, posed by ElytraModel.setupAnim; a baby's half size (AgeableListModel)
   */
  render(b: EntityBatch, parentPose: PoseStack, e: LivingEntity, chest: ItemStack | null | undefined, baby: boolean, crouching: boolean, useLightmap = true): void {
    if (chest?.item.id !== 'elytra') return;
    this.setupAnim(e, crouching);
    const pose = this.pose;
    pose.reset(parentPose.m);
    const m = pose.m;
    for (let i = 0; i < 16; i++) if (i % 4 !== 3) m[i] *= VIEW_OFFSET;
    pose.translate(0, 0, 0.125);
    if (baby) {
      pose.scale(0.5, 0.5, 0.5);
      pose.translate(0, 1.5, 0);
    }
    if (!this.tex) {
      const t = elytraTexture();
      this.tex = createTexture(this.gl, t.w, t.h, t.data);
    }
    b.setOverlay(0, 0, 0, 0);
    b.begin(state(this.tex, useLightmap));
    this.root.render(b, pose, 64, 32);
    if (chest.hasGlint()) this.renderGlint(b, pose);
  }

  /**
   * vanilla ElytraModel.setupAnim: folded, the wings hang a little back and out; gliding they spread level, swept
   * back toward their folded turn as the glide steepens into a dive; crouching they tuck in, three pixels lower. A
   * player's ease there a tenth of the way a frame; the right wing mirrors the left
   */
  private setupAnim(e: LivingEntity, crouching: boolean): void {
    let f = Math.PI / 12, g = -Math.PI / 12, h = 0, i = 0;
    if (e.fallFlying) {
      let j = 1;
      if (e.dy < 0) {
        const len = Math.hypot(e.dx, e.dy, e.dz);
        j = 1 - Math.pow(len < 1e-4 ? 0 : -e.dy / len, 1.5);
      }
      f = j * (Math.PI / 9) + (1 - j) * f;
      g = j * (-Math.PI / 2) + (1 - j) * g;
    } else if (crouching) {
      f = (Math.PI * 2) / 9;
      g = -Math.PI / 4;
      h = 3;
      i = 0.08726646;
    }
    const L = this.left, R = this.right;
    L.y = h;
    if (e.type === 'player') {
      let t = this.turns.get(e);
      if (!t) this.turns.set(e, (t = { x: 0, y: 0, z: 0 }));
      t.x += (f - t.x) * 0.1;
      t.y += (i - t.y) * 0.1;
      t.z += (g - t.z) * 0.1;
      L.xRot = t.x;
      L.yRot = t.y;
      L.zRot = t.z;
    } else {
      L.xRot = f;
      L.zRot = g;
      L.yRot = i;
    }
    R.yRot = -L.yRot;
    R.y = L.y;
    R.xRot = L.xRot;
    R.zRot = -L.zRot;
  }

  /** vanilla ItemRenderer.getArmorFoilBuffer's glint (armorEntityGlint), as the armour layer draws it */
  private renderGlint(b: EntityBatch, pose: PoseStack): void {
    if (!this.glintTex) {
      const t = glintTexture();
      this.glintTex = createTexture(this.gl, t.w, t.h, t.data, { nearest: false, clamp: false });
    }
    const [f, f1] = glintOffset(performance.now());
    const c = Math.cos(Math.PI / 18) * 0.16, sn = Math.sin(Math.PI / 18) * 0.16;
    const fog = b.fogColor;
    b.fogColor = [0, 0, 0];
    b.begin({ texture: this.glintTex, cutoff: -1, blend: true, additive: true, depthWrite: false, depthEqual: true, cull: false, lit: false, useLightmap: false });
    b.uvTransform = [c, -sn, -f, sn, c, f1];
    this.root.render(b, pose, 64, 32);
    b.flush();
    b.uvTransform = null;
    b.fogColor = fog;
  }
}

/** an elytra down to its last point (vanilla's "broken" item predicate: !ElytraItem.isFlyEnabled) */
function isBroken(s: ItemStack): boolean {
  return s.item.id === 'elytra' && !isFlyEnabled(s);
}

/** vanilla RenderType.armorCutoutNoCull */
function state(texture: WebGLTexture, useLightmap: boolean): DrawState {
  return { texture, cutoff: 0.1, blend: false, cull: false, lit: true, useLightmap };
}
