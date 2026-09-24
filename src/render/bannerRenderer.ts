// Banners on screen (vanilla BannerRenderer): the pole, the bar and the flag with its layers, in the world from the
// block entity (the flag stirring gently, each banner out of step with the next) and wherever a banner is an item
// (vanilla BlockEntityWithoutLevelRenderer: in the hand, on the ground, in a frame, and as the inventory's icon, drawn
// offscreen at the GUI's angle and kept). One texture per design: the base colour and the layers composited
// (textures/bannerTextures.ts).

import type { GL } from './gl';
import { createTexture } from './gl';
import { EntityBatch, PoseStack, type DrawState } from './entityRenderer';
import { ModelPart } from './model';
import { setSpecialItemRenderer, type DisplayContext } from './itemRenderer';
import { setStackIconHook } from '../gui/guiGraphics';
import { ItemIconBaker } from './itemIconBaker';
import type { ItemStack, BannerLayer } from '../item/item';
import type { BannerBlockEntity } from '../world/blockEntity';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { bannerColorOf } from '../world/bannerPatterns';
import { bannerKey, bannerTexture } from '../textures/bannerTextures';

export interface BannerModel {
  flag: ModelPart;
  pole: ModelPart;
  bar: ModelPart;
}

/** vanilla BannerRenderer.createBodyLayer (64x64) */
export function bannerModel(): BannerModel {
  return {
    flag: new ModelPart([{ x: -10, y: 0, z: -2, w: 20, h: 40, d: 1, u: 0, v: 0 }]),
    pole: new ModelPart([{ x: -1, y: -30, z: -1, w: 2, h: 42, d: 2, u: 44, v: 0 }]),
    bar: new ModelPart([{ x: -10, y: -32, z: -1, w: 20, h: 2, d: 2, u: 0, v: 42 }]),
  };
}

/** vanilla: the flag's sway, a hundred ticks round, offset by where the banner stands */
export function flagSway(x: number, y: number, z: number, gameTime: number, partial: number): number {
  const f = ((((x * 7 + y * 9 + z * 13 + gameTime) % 100) + 100) % 100 + partial) / 100;
  return (-0.0125 + 0.01 * Math.cos(Math.PI * 2 * f)) * Math.PI;
}

/** vanilla Direction.toYRot */
const Y_ROT: Record<string, number> = { south: 0, west: 90, north: 180, east: 270 };

interface Transform {
  rot: [number, number, number];
  trans: [number, number, number];
  scale: number;
}

/**
 * models/item/template_banner.json's display transforms: the GUI's as vanilla's; the others after block.json's (the
 * in-hand ones unverified against vanilla's, see the report)
 */
const DISPLAY: Record<DisplayContext, Transform> = {
  gui: { rot: [30, 20, 0], trans: [0, -3.25, 0], scale: 0.5325 },
  ground: { rot: [0, 0, 0], trans: [0, 2, 0], scale: 0.25 },
  fixed: { rot: [0, 180, 0], trans: [0, 0, 0], scale: 0.5 },
  head: { rot: [0, 180, 0], trans: [0, 0, 0], scale: 1 },
  thirdperson_righthand: { rot: [75, 45, 0], trans: [0, 2.5, 0], scale: 0.375 },
  thirdperson_lefthand: { rot: [75, 45, 0], trans: [0, 2.5, 0], scale: 0.375 },
  firstperson_righthand: { rot: [0, 45, 0], trans: [0, 0, 0], scale: 0.4 },
  firstperson_lefthand: { rot: [0, 225, 0], trans: [0, 0, 0], scale: 0.4 },
};

export class BannerRenderer {
  private readonly model = bannerModel();
  private readonly textures = new Map<string, WebGLTexture>();
  private readonly pose = new PoseStack();
  private readonly icons: ItemIconBaker;

  constructor(private readonly gl: GL) {
    this.icons = new ItemIconBaker(gl);
    setSpecialItemRenderer('banner', {
      render: (b, pose, s, ctx, left) => this.renderItem(b, pose, s, ctx, left),
      displayScaleY: (s, ctx) => (itemColor(s) ? DISPLAY[ctx].scale : undefined),
    });
    setStackIconHook('banner', (g, s, x, y) => {
      const c = itemColor(s);
      if (!c) return false;
      const size = Math.max(1, Math.round(16 * g.scale));
      const icon = this.icon(c, s.tag?.patterns ?? [], size);
      if (!icon) return false;
      g.ctx.imageSmoothingEnabled = false;
      g.ctx.drawImage(icon, Math.round(x * g.scale), Math.round(y * g.scale), size, size);
      return true;
    });
  }

  /** a design's texture (made the first time it's seen) */
  texture(base: string, layers: readonly BannerLayer[]): WebGLTexture {
    const key = bannerKey(base, layers);
    let t = this.textures.get(key);
    if (!t) {
      const img = bannerTexture(base, layers);
      t = createTexture(this.gl, img.w, img.h, new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength));
      this.textures.set(key, t);
    }
    return t;
  }

  private state(tex: WebGLTexture, ctx: DisplayContext | null): DrawState {
    // (vanilla entitySolid for the wood, the layers over the same faces; one texture here, so solid throughout)
    return { texture: tex, cutoff: -1, blend: false, cull: false, lit: true, useLightmap: ctx !== 'gui' };
  }

  /** the pole (if shown), the bar and the flag at `sway`, from a pose at the banner's pivot */
  private draw(b: EntityBatch, pose: PoseStack, pole: boolean, sway: number): void {
    const m = this.model;
    pose.push();
    pose.scale(2 / 3, -2 / 3, -2 / 3);
    m.pole.visible = pole;
    m.pole.render(b, pose, 64, 64);
    m.bar.render(b, pose, 64, 64);
    m.flag.y = -32;
    m.flag.xRot = sway;
    m.flag.render(b, pose, 64, 64);
    pose.pop();
  }

  /** vanilla BannerRenderer.render for a banner in the world, (dx, dy, dz) from the camera */
  renderBlockEntity(b: EntityBatch, be: BannerBlockEntity, state: number, dx: number, dy: number, dz: number, gameTime: number, partial: number): void {
    const block = BLOCKS[STATE_BLOCK[state]];
    const base = bannerColorOf(block.name);
    if (!base) return;
    b.begin(this.state(this.texture(base, be.patterns), null));
    const pose = this.pose;
    pose.reset();
    pose.translate(dx, dy, dz);
    const standing = block.propIndex('rotation') >= 0;
    if (standing) {
      pose.translate(0.5, 0.5, 0.5);
      pose.rotY(-block.get<number>(state, 'rotation') * 22.5);
    } else {
      pose.translate(0.5, -1 / 6, 0.5);
      pose.rotY(-Y_ROT[block.get<string>(state, 'facing')]);
      pose.translate(0, -0.3125, -0.4375);
    }
    this.draw(b, pose, standing, flagSway(be.x, be.y, be.z, gameTime, partial));
  }

  /** vanilla BlockEntityWithoutLevelRenderer: a banner item, drawn as the block entity at the origin with no level */
  renderItem(b: EntityBatch, pose: PoseStack, s: ItemStack, ctx: DisplayContext, left: boolean): boolean {
    const base = itemColor(s);
    if (!base) return false;
    this.drawItem(b, pose, base, s.tag?.patterns ?? [], ctx, left);
    return true;
  }

  /** a banner of `base` with `layers` in the display transform for `ctx` */
  private drawItem(b: EntityBatch, pose: PoseStack, base: string, layers: readonly BannerLayer[], ctx: DisplayContext, left: boolean): void {
    const t = DISPLAY[ctx];
    pose.push();
    // (vanilla ItemTransform.apply: the left hand's is mirrored)
    pose.translate(((left ? -1 : 1) * t.trans[0]) / 16, t.trans[1] / 16, t.trans[2] / 16);
    pose.rotX(t.rot[0]);
    pose.rotY(left ? -t.rot[1] : t.rot[1]);
    pose.rotZ(left ? -t.rot[2] : t.rot[2]);
    pose.scale(t.scale, t.scale, t.scale);
    // (ItemRenderer's -0.5 and BannerRenderer's +0.5 for a banner with no level cancel out)
    b.begin(this.state(this.texture(base, layers), ctx));
    this.draw(b, pose, true, flagSway(0, 0, 0, 0, 0));
    pose.pop();
  }

  /** the inventory icon of a banner (vanilla renders the item model with its GUI transform and flat lighting) */
  private icon(base: string, layers: readonly BannerLayer[], size: number): HTMLCanvasElement | null {
    return this.icons.icon(bannerKey(base, layers), size, (b, pose) => this.drawItem(b, pose, base, layers, 'gui', false));
  }
}

/** a banner item's colour (null for anything else) */
function itemColor(s: ItemStack): string | null {
  const id = s.item.id;
  return id.includes('_wall_') ? null : bannerColorOf(id);
}
