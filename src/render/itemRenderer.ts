// Item rendering: block items (baked block models) and flat items (extruded
// sprites like vanilla's ItemModelGenerator), with vanilla display transforms.

import type { GL } from './gl';
import { createTexture } from './gl';
import type { Atlas } from './atlas';
import { EntityBatch, PoseStack, DrawState } from './entityRenderer';
import { getStateModels, getItemModels } from './mesher';
import type { Item, ItemStack } from '../item/item';
import { BLOCKS, LAYER, Layer } from '../world/block';
import type { TexImage } from '../textures/tex';
import { glintTexture, glintOffset, glintUV } from '../textures/glint';
import { crossbowTexture } from '../item/crossbow';
import { itemLayers, layerTint } from '../item/itemColors';
import { TridentRenderer } from './tridentRenderer';

export type DisplayContext = 'gui' | 'ground' | 'fixed' | 'firstperson_righthand' | 'firstperson_lefthand' | 'thirdperson_righthand' | 'thirdperson_lefthand' | 'head';

interface Transform {
  rot: [number, number, number];
  trans: [number, number, number];
  scale: [number, number, number];
}

const BLOCK_DISPLAY: Record<DisplayContext, Transform> = {
  gui: { rot: [30, 225, 0], trans: [0, 0, 0], scale: [0.625, 0.625, 0.625] },
  ground: { rot: [0, 0, 0], trans: [0, 3, 0], scale: [0.25, 0.25, 0.25] },
  fixed: { rot: [0, 0, 0], trans: [0, 0, 0], scale: [0.5, 0.5, 0.5] },
  thirdperson_righthand: { rot: [75, 45, 0], trans: [0, 2.5, 0], scale: [0.375, 0.375, 0.375] },
  thirdperson_lefthand: { rot: [75, 45, 0], trans: [0, 2.5, 0], scale: [0.375, 0.375, 0.375] },
  firstperson_righthand: { rot: [0, 45, 0], trans: [0, 0, 0], scale: [0.4, 0.4, 0.4] },
  // (block/block.json turns the block round in the left hand; drawn left, every transform also mirrors)
  firstperson_lefthand: { rot: [0, 225, 0], trans: [0, 0, 0], scale: [0.4, 0.4, 0.4] },
  head: { rot: [0, 0, 0], trans: [0, 0, 0], scale: [1, 1, 1] },
};
const GENERATED_DISPLAY: Record<DisplayContext, Transform> = {
  gui: { rot: [0, 0, 0], trans: [0, 0, 0], scale: [1, 1, 1] },
  ground: { rot: [0, 0, 0], trans: [0, 2, 0], scale: [0.5, 0.5, 0.5] },
  fixed: { rot: [0, 180, 0], trans: [0, 0, 0], scale: [1, 1, 1] },
  thirdperson_righthand: { rot: [0, 0, 0], trans: [0, 3, 1], scale: [0.55, 0.55, 0.55] },
  thirdperson_lefthand: { rot: [0, 0, 0], trans: [0, 3, 1], scale: [0.55, 0.55, 0.55] },
  firstperson_righthand: { rot: [0, -90, 25], trans: [1.13, 3.2, 1.13], scale: [0.68, 0.68, 0.68] },
  // (item/generated has no left-hand transforms: the right hand's, mirrored)
  firstperson_lefthand: { rot: [0, -90, 25], trans: [1.13, 3.2, 1.13], scale: [0.68, 0.68, 0.68] },
  head: { rot: [0, 180, 0], trans: [0, 13, 7], scale: [1, 1, 1] },
};
const HANDHELD_DISPLAY: Record<DisplayContext, Transform> = {
  ...GENERATED_DISPLAY,
  thirdperson_righthand: { rot: [0, -90, 55], trans: [0, 4, 0.5], scale: [0.85, 0.85, 0.85] },
  thirdperson_lefthand: { rot: [0, 90, -55], trans: [0, 4, 0.5], scale: [0.85, 0.85, 0.85] },
  firstperson_righthand: { rot: [0, -90, 25], trans: [1.13, 3.2, 1.13], scale: [0.68, 0.68, 0.68] },
  firstperson_lefthand: { rot: [0, 90, -25], trans: [1.13, 3.2, 1.13], scale: [0.68, 0.68, 0.68] },
};
/** models/item/bow.json display */
const BOW_DISPLAY: Record<DisplayContext, Transform> = {
  ...GENERATED_DISPLAY,
  thirdperson_righthand: { rot: [-80, 260, -40], trans: [-1, -2, 2.5], scale: [0.9, 0.9, 0.9] },
  thirdperson_lefthand: { rot: [-80, -280, 40], trans: [-1, -2, 2.5], scale: [0.9, 0.9, 0.9] },
  firstperson_righthand: { rot: [0, -90, 25], trans: [1.13, 3.2, 1.13], scale: [0.68, 0.68, 0.68] },
  firstperson_lefthand: { rot: [0, 90, -25], trans: [1.13, 3.2, 1.13], scale: [0.68, 0.68, 0.68] },
};
/** models/item/crossbow.json display (the pulling / loaded models inherit it) */
const CROSSBOW_DISPLAY: Record<DisplayContext, Transform> = {
  ...GENERATED_DISPLAY,
  thirdperson_righthand: { rot: [-90, 0, -60], trans: [2, 0.1, -3], scale: [0.9, 0.9, 0.9] },
  thirdperson_lefthand: { rot: [-90, 0, 30], trans: [2, 0.1, -3], scale: [0.9, 0.9, 0.9] },
  firstperson_righthand: { rot: [-90, 0, -55], trans: [1.13, 3.2, 1.13], scale: [0.68, 0.68, 0.68] },
  firstperson_lefthand: { rot: [-90, 0, 35], trans: [1.13, 3.2, 1.13], scale: [0.68, 0.68, 0.68] },
};
const TRIDENT_GUI: Pick<Record<DisplayContext, Transform>, 'gui' | 'ground' | 'fixed' | 'head'> = {
  gui: { rot: [15, -25, -5], trans: [2, 3, 0], scale: [0.65, 0.65, 0.65] },
  ground: { rot: [0, 0, 0], trans: [4, 4, 2], scale: [0.25, 0.25, 0.25] },
  fixed: { rot: [0, 180, 0], trans: [-2, 4, -5], scale: [0.5, 0.5, 0.5] },
  head: { rot: [0, 0, 0], trans: [0, 0, 0], scale: [1, 1, 1] },
};
/** models/item/trident_in_hand.json display (a builtin/entity model: the trident's own model) */
const TRIDENT_IN_HAND_DISPLAY: Record<DisplayContext, Transform> = {
  ...TRIDENT_GUI,
  thirdperson_righthand: { rot: [0, 60, 0], trans: [11, 17, -2], scale: [1, 1, 1] },
  thirdperson_lefthand: { rot: [0, 60, 0], trans: [3, 17, 12], scale: [1, 1, 1] },
  firstperson_righthand: { rot: [0, -90, 25], trans: [-3, 17, 1], scale: [1, 1, 1] },
  firstperson_lefthand: { rot: [0, 90, -25], trans: [13, 17, 1], scale: [1, 1, 1] },
};
/** models/item/trident_throwing.json display: raised over the shoulder, prongs first, while it's drawn back to throw */
const TRIDENT_THROWING_DISPLAY: Record<DisplayContext, Transform> = {
  ...TRIDENT_IN_HAND_DISPLAY,
  thirdperson_righthand: { rot: [0, 90, 180], trans: [8, -17, 9], scale: [1, 1, 1] },
  thirdperson_lefthand: { rot: [0, 90, 180], trans: [8, -17, -7], scale: [1, 1, 1] },
};
// flat-in-world block items (plants, torch...) use item/generated with the block texture
function isHandheld(it: Item): boolean {
  return !!it.tool || it.id === 'stick' || it.id === 'bone' || it.id === 'blaze_rod' || it.id === 'fishing_rod';
}

/** vanilla default item tint colors for block items */
function itemTint(it: Item): number {
  const b = it.block;
  if (!b) return 0xffffff;
  switch (b.tint) {
    case 'grass': return b.name === 'grass_block' ? 0x7cbd6b : 0x7cbd6b;
    case 'foliage': return 0x48b518;
    case 'birch': return 0x80a755;
    case 'spruce': return 0x619961;
    case 'lily': return 0x71c35c;
    case 'water': return 0x3f76e4;
    default: return 0xffffff;
  }
}

interface FlatModel {
  /** quads: pos(12) uv(8) normal(3) */
  quads: Float32Array[];
}

export class ItemRenderer {
  readonly itemTexture: WebGLTexture | null;
  readonly itemSprites = new Map<string, { u0: number; v0: number; u1: number; v1: number; img: TexImage }>();
  private readonly flatCache = new Map<string, FlatModel>();
  itemAtlasSize = 0;
  /** the trident's model: in flight, in the hand, and riptide's swirl */
  readonly trident: TridentRenderer;

  constructor(private readonly gl: GL, readonly atlas: Atlas, itemTextures: Record<string, () => TexImage> | null, private readonly blockTexImages: Map<string, TexImage>) {
    this.trident = new TridentRenderer(gl);
    // item atlas: grid of 16x16
    if (itemTextures) {
      const names = Object.keys(itemTextures);
      const grid = Math.ceil(Math.sqrt(names.length));
      let size = 16;
      while (size < grid * 16) size *= 2;
      this.itemAtlasSize = size;
      const data = new Uint8Array(size * size * 4);
      names.forEach((n, i) => {
        let t: TexImage;
        try {
          t = itemTextures[n]();
        } catch (e) {
          console.warn('item texture failed', n, e);
          return;
        }
        const gx = (i % grid) * 16, gy = Math.floor(i / grid) * 16;
        for (let y = 0; y < 16; y++)
          for (let x = 0; x < 16; x++) {
            const si = (y * t.w + x) * 4, di = ((gy + y) * size + gx + x) * 4;
            for (let c = 0; c < 4; c++) data[di + c] = t.data[si + c];
          }
        const e = 0.001;
        this.itemSprites.set(n, { u0: (gx + e) / size, v0: (gy + e) / size, u1: (gx + 16 - e) / size, v1: (gy + 16 - e) / size, img: t });
      });
      this.itemTexture = createTexture(gl, size, size, data);
    } else this.itemTexture = null;
  }

  /** texture source for a flat item: item atlas sprite or a block-atlas sprite ("block:name") */
  private flatSource(it: Item, override?: string): { tex: WebGLTexture; u0: number; v0: number; u1: number; v1: number; img: TexImage } | null {
    const t = override ?? it.texture;
    if (!t) return null;
    if (t.startsWith('block:')) {
      const name = t.slice(6);
      const s = this.atlas.sprites[name];
      const img = this.blockTexImages.get(name);
      if (!s || !img || !this.atlas.texture) return null;
      return { tex: this.atlas.texture, ...s, img };
    }
    const s = this.itemSprites.get(t);
    if (!s || !this.itemTexture) return null;
    return { tex: this.itemTexture, ...s };
  }

  isBlockModel(it: Item): boolean {
    return !!it.block && !it.texture;
  }

  hasRenderable(it: Item): boolean {
    return this.isBlockModel(it) || !!this.flatSource(it);
  }

  private flatModel(key: string, img: TexImage, u0: number, v0: number, u1: number, v1: number): FlatModel {
    let m = this.flatCache.get(key);
    if (m) return m;
    // vanilla ItemModelGenerator: front/back faces at z 7.5..8.5 + side faces per pixel edge
    const quads: Float32Array[] = [];
    const U = (x: number) => u0 + ((u1 - u0) * x) / 16;
    const V = (y: number) => v0 + ((v1 - v0) * y) / 16;
    const zf = 8.5 / 16, zb = 7.5 / 16;
    const q = (p: number[], uv: number[], n: number[]) => quads.push(new Float32Array([...p, ...uv, ...n]));
    // front (south, +z) and back (north, -z)
    q([0, 1, zf, 0, 0, zf, 1, 0, zf, 1, 1, zf], [U(0), V(0), U(0), V(16), U(16), V(16), U(16), V(0)], [0, 0, 1]);
    q([1, 1, zb, 1, 0, zb, 0, 0, zb, 0, 1, zb], [U(16), V(0), U(16), V(16), U(0), V(16), U(0), V(0)], [0, 0, -1]);
    const alpha = (x: number, y: number) => (x < 0 || y < 0 || x > 15 || y > 15 ? 0 : img.data[(y * img.w + x) * 4 + 3]);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        if (alpha(x, y) === 0) continue;
        const px0 = x / 16, px1 = (x + 1) / 16, py0 = 1 - (y + 1) / 16, py1 = 1 - y / 16;
        const uc0 = U(x + 0.001), uc1 = U(x + 0.999), vc0 = V(y + 0.001), vc1 = V(y + 0.999);
        if (!alpha(x, y - 1)) q([px0, py1, zb, px0, py1, zf, px1, py1, zf, px1, py1, zb], [uc0, vc0, uc0, vc1, uc1, vc1, uc1, vc0], [0, 1, 0]);
        if (!alpha(x, y + 1)) q([px0, py0, zf, px0, py0, zb, px1, py0, zb, px1, py0, zf], [uc0, vc0, uc0, vc1, uc1, vc1, uc1, vc0], [0, -1, 0]);
        if (!alpha(x - 1, y)) q([px0, py1, zb, px0, py0, zb, px0, py0, zf, px0, py1, zf], [uc0, vc0, uc0, vc1, uc1, vc1, uc1, vc0], [-1, 0, 0]);
        if (!alpha(x + 1, y)) q([px1, py1, zf, px1, py0, zf, px1, py0, zb, px1, py1, zb], [uc0, vc0, uc0, vc1, uc1, vc1, uc1, vc0], [1, 0, 0]);
      }
    m = { quads };
    this.flatCache.set(key, m);
    return m;
  }

  private applyTransform(pose: PoseStack, t: Transform, left = false): void {
    const i = left ? -1 : 1;
    pose.translate((i * t.trans[0]) / 16, t.trans[1] / 16, t.trans[2] / 16);
    pose.rotX(t.rot[0]);
    pose.rotY(left ? -t.rot[1] : t.rot[1]);
    pose.rotZ(left ? -t.rot[2] : t.rot[2]);
    pose.scale(t.scale[0], t.scale[1], t.scale[2]);
  }

  displayScaleY(stack: ItemStack, ctx: DisplayContext): number {
    const it = stack.item;
    if (this.isBlockModel(it)) return BLOCK_DISPLAY[ctx].scale[1];
    return (isHandheld(it) ? HANDHELD_DISPLAY : GENERATED_DISPLAY)[ctx].scale[1];
  }

  /** Render every quad of a block state's model in the unit cube at the pose origin (TNT, falling blocks). */
  renderBlockState(batch: EntityBatch, pose: PoseStack, state: number): void {
    const models = getStateModels(state);
    if (!models || !this.atlas.texture) return;
    const layer = LAYER[state];
    batch.begin({ texture: this.atlas.texture, cutoff: layer === Layer.SOLID ? -1 : 0.1, blend: layer === Layer.TRANSLUCENT, cull: true, lit: true, useLightmap: true });
    const parts = models.multipart ? models.variants : [models.variants[0]];
    for (const m of parts)
      for (const q of m.quads) {
        const nrm = FACE_NORMALS[q.dir];
        batch.quad(pose, Array.from(q.pos), Array.from(q.uv), nrm[0], nrm[1], nrm[2]);
      }
  }

  /** Render an item at the pose origin (model-space centered at 0). `texture` overrides the sprite (bow pulling). */
  render(batch: EntityBatch, pose: PoseStack, stack: ItemStack, ctx: DisplayContext, left = false, texture?: string): void {
    const it = stack.item;
    pose.push();
    if (this.isBlockModel(it)) {
      this.applyTransform(pose, BLOCK_DISPLAY[ctx], left);
      pose.translate(-0.5, -0.5, -0.5);
      const b = it.block!;
      const models = getItemModels(b);
      if (models) {
        const layer = LAYER[b.defaultState];
        const state: DrawState = { texture: this.atlas.texture!, cutoff: layer === Layer.SOLID ? -1 : 0.1, blend: layer === Layer.TRANSLUCENT, cull: true, lit: true, useLightmap: ctx !== 'gui' };
        batch.begin(state);
        const tint = itemTint(it);
        const tr = ((tint >> 16) & 255) / 255, tg = ((tint >> 8) & 255) / 255, tb = (tint & 255) / 255;
        const parts = models.multipart ? models.variants : [models.variants[0]];
        for (const m of parts)
          for (const q of m.quads) {
            const nrm = FACE_NORMALS[q.dir];
            const tinted = q.tint >= 0;
            batch.quad(pose, Array.from(q.pos), Array.from(q.uv), nrm[0], nrm[1], nrm[2], tinted ? tr : 1, tinted ? tg : 1, tinted ? tb : 1, 1);
          }
      }
    } else if (it.id === 'trident' && ctx !== 'gui' && ctx !== 'ground' && ctx !== 'fixed') {
      // vanilla ItemRenderer.render: the trident is its flat sprite in the GUI, on the ground and in a frame, and its
      // model anywhere else (trident_in_hand, or trident_throwing while it's drawn back: `texture` 'trident_throwing')
      this.applyTransform(pose, (texture === 'trident_throwing' ? TRIDENT_THROWING_DISPLAY : TRIDENT_IN_HAND_DISPLAY)[ctx], left);
      pose.translate(-0.5, -0.5, -0.5);
      pose.scale(1, -1, -1);
      this.trident.renderModel(batch, pose, stack.hasGlint());
    } else {
      // a loaded crossbow's model follows its stack wherever it's drawn (on the ground, in a frame)
      if (texture === undefined && it.id === 'crossbow') texture = crossbowTexture(stack, -1);
      const src = this.flatSource(it, texture);
      if (src) {
        const disp = it.id === 'bow' ? BOW_DISPLAY : it.id === 'crossbow' ? CROSSBOW_DISPLAY : isHandheld(it) ? HANDHELD_DISPLAY : GENERATED_DISPLAY;
        this.applyTransform(pose, disp[ctx], left);
        pose.translate(-0.5, -0.5, -0.5);
        const model = this.flatModel((texture ?? it.texture ?? it.id), src.img, src.u0, src.v0, src.u1, src.v1);
        batch.begin({ texture: src.tex, cutoff: 0.1, blend: false, cull: true, lit: true, useLightmap: ctx !== 'gui' });
        // vanilla item model layers with ItemColors: leather's dye, a potion's colour on its tinted layer (layer0),
        // the untinted ones drawn over it; anything else is its one sprite (grayscale blocks with their default tint)
        const layered = texture === undefined ? itemLayers(it) : null;
        const layers = layered ? layered.layers : [texture ?? it.texture ?? it.id];
        const colour = layered ? layerTint(stack) : it.block && it.block.tint !== 'none' ? itemTint(it) : 0xffffff;
        layers.forEach((name, li) => {
          const ls = layered ? this.flatSource(it, name) : src;
          if (!ls) return;
          const m = layered ? this.flatModel(name, ls.img, ls.u0, ls.v0, ls.u1, ls.v1) : model;
          const tint = !layered || li === layered.tinted ? colour : 0xffffff;
          const tr = ((tint >> 16) & 255) / 255, tg = ((tint >> 8) & 255) / 255, tb = (tint & 255) / 255;
          for (const qd of m.quads) batch.quad(pose, Array.from(qd.subarray(0, 12)), Array.from(qd.subarray(12, 20)), qd[20], qd[21], qd[22], tr, tg, tb, 1);
        });
        if (stack.hasGlint()) this.renderGlint(batch, pose, model, src);
      }
    }
    pose.pop();
  }

  private glintTex: WebGLTexture | null = null;

  /** vanilla glint render type: the model again with the scrolling glint texture, added on top, unlit */
  private renderGlint(batch: EntityBatch, pose: PoseStack, model: FlatModel, src: { u0: number; v0: number; u1: number; v1: number }): void {
    if (!this.glintTex) {
      const t = glintTexture();
      this.glintTex = createTexture(this.gl, t.w, t.h, t.data, { nearest: false, clamp: false });
    }
    const off = glintOffset(performance.now());
    const du = src.u1 - src.u0, dv = src.v1 - src.v0;
    const fog = batch.fogColor;
    // fog fades an additive layer towards black (adds nothing), not towards the fog colour
    batch.fogColor = [0, 0, 0];
    batch.begin({ texture: this.glintTex, cutoff: -1, blend: true, additive: true, depthWrite: false, depthEqual: true, cull: true, lit: false, useLightmap: false });
    const uv: number[] = new Array(8);
    for (const qd of model.quads) {
      for (let k = 0; k < 4; k++) {
        const g = glintUV((qd[12 + k * 2] - src.u0) / du, (qd[13 + k * 2] - src.v0) / dv, off);
        uv[k * 2] = g[0];
        uv[k * 2 + 1] = g[1];
      }
      batch.quad(pose, Array.from(qd.subarray(0, 12)), uv, qd[20], qd[21], qd[22]);
    }
    batch.flush();
    batch.fogColor = fog;
  }
}

const FACE_NORMALS = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];

export { BLOCKS };
