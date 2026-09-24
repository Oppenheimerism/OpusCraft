// Worn armour (vanilla HumanoidArmorLayer and HumanoidArmorModel) and what's worn on the head that isn't armour
// (vanilla CustomHeadLayer: a carved pumpkin, a jack o'lantern). Shared by the world's entity renderer and the
// inventory's player preview.

import type { GL } from './gl';
import { createTexture } from './gl';
import { PoseStack } from './entityRenderer';
import type { EntityBatch, DrawState } from './entityRenderer';
import { ModelPart } from './model';
import type { MobModelDef } from './mobModels';
import type { ItemRenderer } from './itemRenderer';
import type { ItemStack } from '../item/item';
import { armorIndex, armorMaterial } from '../item/equipment';
import type { ArmorSlot } from '../item/equipment';
import { dyedColor, isDyeable } from '../item/dyedColor';
import { armorLayerTexture } from '../textures/armorLayers';
import { glintTexture, glintOffset } from '../textures/glint';

/**
 * vanilla HumanoidArmorModel.createBodyLayer (on HumanoidModel.createMesh): the humanoid's boxes grown by `g` (the
 * hat half a pixel more, the legs a tenth less, so leggings stay inside boots), on a 64x32 texture; babies as
 * HumanoidModel's AgeableListModel (the hat here goes with the head: its texture is empty either way)
 */
export function humanoidArmorModel(g: number): MobModelDef {
  const root = new ModelPart();
  const head = root.add('head', new ModelPart([{ x: -4, y: -8, z: -4, w: 8, h: 8, d: 8, u: 0, v: 0, inflate: g }]));
  head.add('hat', new ModelPart([{ x: -4, y: -8, z: -4, w: 8, h: 8, d: 8, u: 32, v: 0, inflate: g + 0.5 }]));
  root.add('body', new ModelPart([{ x: -4, y: 0, z: -2, w: 8, h: 12, d: 4, u: 16, v: 16, inflate: g }]));
  root.add('right_arm', new ModelPart([{ x: -3, y: -2, z: -2, w: 4, h: 12, d: 4, u: 40, v: 16, inflate: g }], [-5, 2, 0]));
  root.add('left_arm', new ModelPart([{ x: -1, y: -2, z: -2, w: 4, h: 12, d: 4, u: 40, v: 16, inflate: g, mirror: true }], [5, 2, 0]));
  root.add('right_leg', new ModelPart([{ x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 16, inflate: g - 0.1 }], [-1.9, 12, 0]));
  root.add('left_leg', new ModelPart([{ x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 16, inflate: g - 0.1, mirror: true }], [1.9, 12, 0]));
  return { root, texW: 64, texH: 32, baby: { headParts: ['head'], scaleHead: true, yHead: 16, zHead: 0, headScale: 2, bodyScale: 2, bodyY: 24 } };
}

/**
 * vanilla ZombieVillagerModel.createArmorLayer: the humanoid's armour with the helmet two pixels up on the taller
 * head, the body and legs a tenth bigger and the legs set two pixels apart
 */
export function zombieVillagerArmorModel(g: number): MobModelDef {
  const root = new ModelPart();
  const head = root.add('head', new ModelPart([{ x: -4, y: -10, z: -4, w: 8, h: 8, d: 8, u: 0, v: 0, inflate: g }]));
  head.add('hat', new ModelPart([{ x: -4, y: -8, z: -4, w: 8, h: 8, d: 8, u: 32, v: 0, inflate: g + 0.5 }]));
  root.add('body', new ModelPart([{ x: -4, y: 0, z: -2, w: 8, h: 12, d: 4, u: 16, v: 16, inflate: g + 0.1 }]));
  root.add('right_arm', new ModelPart([{ x: -3, y: -2, z: -2, w: 4, h: 12, d: 4, u: 40, v: 16, inflate: g }], [-5, 2, 0]));
  root.add('left_arm', new ModelPart([{ x: -1, y: -2, z: -2, w: 4, h: 12, d: 4, u: 40, v: 16, inflate: g, mirror: true }], [5, 2, 0]));
  root.add('right_leg', new ModelPart([{ x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 16, inflate: g + 0.1 }], [-2, 12, 0]));
  root.add('left_leg', new ModelPart([{ x: -2, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 16, inflate: g + 0.1, mirror: true }], [2, 12, 0]));
  return { root, texW: 64, texH: 32, baby: { headParts: ['head'], scaleHead: true, yHead: 16, zHead: 0, headScale: 2, bodyScale: 2, bodyY: 24 } };
}

/** vanilla ModelLayers *_INNER_ARMOR / *_OUTER_ARMOR: 0.5 and 1.0 for most wearers, 0.5 and 1.02 for piglins */
export type ArmorModelSet = 'humanoid' | 'piglin' | 'zombie_villager';

/** vanilla HumanoidArmorLayer.render's order */
const ORDER: readonly ArmorSlot[] = ['chest', 'legs', 'feet', 'head'];
/** the parts HumanoidModel.copyPropertiesTo hands over */
const PARTS = ['head', 'body', 'right_arm', 'left_arm', 'right_leg', 'left_leg'];
/** vanilla RenderStateShard.VIEW_OFFSET_Z_LAYERING: armour and its glint are drawn a hair nearer the eye */
const VIEW_OFFSET = 0.99975586;
/** vanilla CustomHeadLayer's scale on piglins (PiglinRenderer): a hair wider than their broad head */
export const PIGLIN_HEAD_ITEM_SCALE = 1.0019531;

export class ArmorLayer {
  private readonly models: Record<ArmorModelSet, { inner: MobModelDef; outer: MobModelDef }> = {
    humanoid: { inner: humanoidArmorModel(0.5), outer: humanoidArmorModel(1) },
    piglin: { inner: humanoidArmorModel(0.5), outer: humanoidArmorModel(1.02) },
    zombie_villager: { inner: zombieVillagerArmorModel(0.5), outer: zombieVillagerArmorModel(1) },
  };
  private readonly textures = new Map<string, WebGLTexture | null>();
  private glintTex: WebGLTexture | null = null;
  private readonly pose = new PoseStack();

  constructor(private readonly gl: GL) {}

  private tex(name: string): WebGLTexture | null {
    let t = this.textures.get(name);
    if (t !== undefined) return t;
    const img = armorLayerTexture(name);
    t = img ? createTexture(this.gl, img.w, img.h, img.data) : null;
    this.textures.set(name, t);
    return t;
  }

  /**
   * vanilla HumanoidArmorLayer.render: the chest, legs, feet and head pieces each worn in their own slot copy the
   * wearer's pose (`parent`: its posed model, a humanoid's parts under the root; HumanoidModel.copyPropertiesTo),
   * show their slot's parts (setPartVisibility) and draw every layer of their material (armorCutoutNoCull: no hurt
   * tint), leather dyed under its untinted overlay, then the glint when enchanted. Leggings use the inner model
   */
  render(b: EntityBatch, parentPose: PoseStack, parent: ModelPart, armor: readonly (ItemStack | null)[], baby: boolean, set: ArmorModelSet = 'humanoid', useLightmap = true): void {
    let pose: PoseStack | null = null;
    for (const slot of ORDER) {
      const s = armor[armorIndex(slot)];
      const mat = s?.item.armor?.slot === slot ? armorMaterial(s.item) : null;
      if (!s || !mat) continue;
      if (!pose) {
        pose = this.pose;
        pose.reset(parentPose.m);
        const m = pose.m;
        for (let i = 0; i < 16; i++) if (i % 4 !== 3) m[i] *= VIEW_OFFSET;
        b.setOverlay(0, 0, 0, 0);
      }
      const inner = slot === 'legs';
      const def = inner ? this.models[set].inner : this.models[set].outer;
      copyPose(parent, def.root);
      showSlot(def.root, slot);
      const layer = `${mat}_layer_${inner ? 2 : 1}`;
      const base = this.tex(layer);
      if (base) {
        b.begin(armorState(base, useLightmap));
        if (isDyeable(s.item)) {
          const c = dyedColor(s);
          drawAgeable(b, pose, def, baby, ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
          const overlay = this.tex(`${layer}_overlay`);
          if (overlay) {
            b.begin(armorState(overlay, useLightmap));
            drawAgeable(b, pose, def, baby);
          }
        } else drawAgeable(b, pose, def, baby);
      }
      if (s.hasGlint()) this.renderGlint(b, pose, def, baby);
    }
  }

  /**
   * vanilla RenderType.armorEntityGlint: the model again, unlit, with the glint texture scrolled by the texture
   * matrix translate(-f, f1) · rotZ(10°) · scale(0.16) (ENTITY_GLINT_TEXTURING), added only where the armour is
   */
  private renderGlint(b: EntityBatch, pose: PoseStack, def: MobModelDef, baby: boolean): void {
    if (!this.glintTex) {
      const t = glintTexture();
      this.glintTex = createTexture(this.gl, t.w, t.h, t.data, { nearest: false, clamp: false });
    }
    const [f, f1] = glintOffset(performance.now());
    const c = Math.cos(Math.PI / 18) * 0.16, sn = Math.sin(Math.PI / 18) * 0.16;
    const fog = b.fogColor;
    // fog fades an additive layer towards adding nothing, not towards the fog colour
    b.fogColor = [0, 0, 0];
    b.begin({ texture: this.glintTex, cutoff: -1, blend: true, additive: true, depthWrite: false, depthEqual: true, cull: false, lit: false, useLightmap: false });
    b.uvTransform = [c, -sn, -f, sn, c, f1];
    drawAgeable(b, pose, def, baby);
    b.flush();
    b.uvTransform = null;
    b.fogColor = fog;
  }
}

/** vanilla RenderType.armorCutoutNoCull */
function armorState(texture: WebGLTexture, useLightmap: boolean): DrawState {
  return { texture, cutoff: 0.1, blend: false, cull: false, lit: true, useLightmap };
}

/** vanilla HumanoidModel.copyPropertiesTo (ModelPart.copyFrom): each part's placement, turn and scale */
function copyPose(from: ModelPart, to: ModelPart): void {
  for (const n of PARTS) {
    const a = from.children.get(n), p = to.children.get(n);
    if (!a || !p) continue;
    p.x = a.x;
    p.y = a.y;
    p.z = a.z;
    p.xRot = a.xRot;
    p.yRot = a.yRot;
    p.zRot = a.zRot;
    p.xScale = a.xScale;
    p.yScale = a.yScale;
    p.zScale = a.zScale;
  }
}

/** vanilla HumanoidArmorLayer.setPartVisibility (the hat is the head's child here) */
function showSlot(root: ModelPart, slot: ArmorSlot): void {
  root.child('head').visible = slot === 'head';
  root.child('body').visible = slot === 'chest' || slot === 'legs';
  root.child('right_arm').visible = root.child('left_arm').visible = slot === 'chest';
  root.child('right_leg').visible = root.child('left_leg').visible = slot === 'legs' || slot === 'feet';
}

/** vanilla AgeableListModel.renderToBuffer: a baby's head a bit smaller and lowered, its body half size */
function drawAgeable(b: EntityBatch, pose: PoseStack, def: MobModelDef, baby: boolean, r = 1, g = 1, bl = 1): void {
  const bd = def.baby;
  if (!baby || !bd) {
    def.root.render(b, pose, def.texW, def.texH, r, g, bl, 1);
    return;
  }
  pose.push();
  if (bd.scaleHead) {
    const s = 1.5 / bd.headScale;
    pose.scale(s, s, s);
  }
  pose.translate(0, bd.yHead / 16, bd.zHead / 16);
  for (const n of bd.headParts) def.root.child(n).render(b, pose, def.texW, def.texH, r, g, bl, 1);
  pose.pop();
  pose.push();
  const s = 1 / bd.bodyScale;
  pose.scale(s, s, s);
  pose.translate(0, bd.bodyY / 16, 0);
  for (const [n, c] of def.root.children) if (!bd.headParts.includes(n)) c.render(b, pose, def.texW, def.texH, r, g, bl, 1);
  pose.pop();
}

/**
 * vanilla CustomHeadLayer for a head item that isn't armour: its head display on the head (translateToHead: centred
 * on it, turned round, 0.625 of a block), a baby's shrunk to 0.7 and lowered; `sx`, `sz`: the layer's own scale
 */
export function renderHeadItem(b: EntityBatch, pose: PoseStack, items: ItemRenderer, parent: ModelPart, stack: ItemStack, baby: boolean, sx = 1, sy = 1, sz = 1): void {
  pose.push();
  pose.scale(sx, sy, sz);
  if (baby) {
    pose.translate(0, 0.03125, 0);
    pose.scale(0.7, 0.7, 0.7);
    pose.translate(0, 1, 0);
  }
  parent.translateAndRotate(pose);
  parent.child('head').translateAndRotate(pose);
  pose.translate(0, -0.25, 0);
  pose.rotY(180);
  pose.scale(0.625, -0.625, -0.625);
  b.setOverlay(0, 0, 0, 0);
  items.render(b, pose, stack, 'head');
  pose.pop();
}
