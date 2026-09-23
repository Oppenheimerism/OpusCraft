// Item icons for the GUI: 3D block items are pre-rendered offscreen with the
// vanilla GUI transform (rot 30/225, scale 0.625); flat items are sprites.

import type { Renderer } from '../render/renderer';
import { PoseStack } from '../render/entityRenderer';
import { ITEM_LIST, ITEMS, Item, ItemStack } from '../item/item';
import { ortho, mat4 } from '../core/math';
import { getStateModels, bakeChoice } from '../render/mesher';
import { cube } from '../world/models';
import { ICON_CUBES } from './iconCubes';
import { LAYER, Layer } from '../world/block';
import type { IconSource } from './guiGraphics';
import type { TexImage } from '../textures/tex';
import { glintTexture, glintOffset, GLINT_SIZE } from '../textures/glint';

const FACE_SHADE = [0.5, 1.0, 0.6, 0.8, 0.8, 0.8]; // down, up, north(right), south, west, east(left)

export class ItemIcons implements IconSource {
  private canvas: HTMLCanvasElement | null = null;
  private cell = 16;
  private readonly pos = new Map<string, [number, number]>();
  private readonly flat = new Map<string, HTMLCanvasElement>();
  builtScale = 0;

  constructor(private readonly renderer: Renderer, private readonly blockImages: Map<string, TexImage>) {}

  private flatCanvas(it: Item): HTMLCanvasElement | null {
    const tex = it.texture;
    if (!tex) return null;
    let c = this.flat.get(tex);
    if (c) return c;
    let img: TexImage | undefined;
    if (tex.startsWith('block:')) img = this.blockImages.get(tex.slice(6));
    else img = this.renderer.items.itemSprites.get(tex)?.img;
    if (!img) return null;
    c = document.createElement('canvas');
    c.width = img.w;
    c.height = img.h;
    const ctx = c.getContext('2d')!;
    const data = new Uint8ClampedArray(img.data);
    // tint grayscale block sprites (grass, fern, vines...) with default colors
    if (it.block && it.block.tint !== 'none' && tex.startsWith('block:')) {
      const tint = it.block.tint === 'foliage' ? 0x48b518 : it.block.tint === 'lily' ? 0x71c35c : 0x7cbd6b;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = (data[i] * ((tint >> 16) & 255)) / 255;
        data[i + 1] = (data[i + 1] * ((tint >> 8) & 255)) / 255;
        data[i + 2] = (data[i + 2] * (tint & 255)) / 255;
      }
    }
    ctx.putImageData(new ImageData(data, img.w, img.h), 0, 0);
    this.flat.set(tex, c);
    return c;
  }

  private spriteCanvas(name: string): HTMLCanvasElement | null {
    let c = this.flat.get(name);
    if (c) return c;
    const img = this.renderer.items.itemSprites.get(name)?.img;
    if (!img) return null;
    c = document.createElement('canvas');
    c.width = img.w;
    c.height = img.h;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
    this.flat.set(name, c);
    return c;
  }

  /** Render all block-model item icons at `scale` px per GUI pixel. */
  build(scale: number): void {
    const r = this.renderer;
    const gl = r.gl;
    const items = ITEM_LIST.filter((it) => r.items.isBlockModel(it));
    const cubes = Object.entries(ICON_CUBES).filter(([id]) => !ITEMS.has(id));
    const S = 16 * scale;
    this.cell = S;
    const total = items.length + cubes.length;
    const cols = Math.ceil(Math.sqrt(total));
    const rows = Math.ceil(total / cols);
    const W = cols * S, H = rows * S;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const depth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const batch = r.batch;
    const proj = mat4();
    const pose = new PoseStack();
    batch.view = mat4();
    batch.fog = [0, 0];
    batch.lightB = 240;
    batch.lightS = 240;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    this.pos.clear();
    items.forEach((it, i) => {
      const cx = i % cols, cy = Math.floor(i / cols);
      this.pos.set(it.id, [cx * S, cy * S]);
      gl.viewport(cx * S, H - (cy + 1) * S, S, S);
      ortho(proj, -8, 8, -8, 8, -100, 100);
      batch.proj = proj;
      pose.reset();
      pose.scale(16, 16, 16);
      pose.rotX(30);
      pose.rotY(225);
      pose.scale(0.625, 0.625, 0.625);
      pose.translate(-0.5, -0.5, -0.5);
      const b = it.block!;
      const models = getStateModels(b.defaultState);
      if (!models) return;
      const layer = LAYER[b.defaultState];
      batch.begin({ texture: r.atlas.texture!, cutoff: layer === Layer.SOLID ? -1 : 0.1, blend: layer === Layer.TRANSLUCENT, cull: true, lit: false, useLightmap: false });
      const tint = b.tint === 'grass' ? 0x7cbd6b : b.tint === 'foliage' ? 0x48b518 : b.tint === 'birch' ? 0x80a755 : b.tint === 'spruce' ? 0x619961 : 0xffffff;
      const parts = models.multipart ? models.variants : [models.variants[0]];
      for (const m of parts)
        for (const q of m.quads) {
          const sh = q.shade ? FACE_SHADE[q.dir] : 1;
          const t = q.tint >= 0 ? tint : 0xffffff;
          batch.quad(pose, Array.from(q.pos), Array.from(q.uv), 0, 1, 0, (((t >> 16) & 255) / 255) * sh, (((t >> 8) & 255) / 255) * sh, ((t & 255) / 255) * sh, 1);
        }
      batch.flush();
    });
    // cube icons for blocks without items yet (vanilla block/cube_all style)
    cubes.forEach(([id, c], k) => {
      const i = items.length + k;
      const cx = i % cols, cy = Math.floor(i / cols);
      this.pos.set(id, [cx * S, cy * S]);
      gl.viewport(cx * S, H - (cy + 1) * S, S, S);
      ortho(proj, -8, 8, -8, 8, -100, 100);
      batch.proj = proj;
      pose.reset();
      pose.scale(16, 16, 16);
      pose.rotX(30);
      pose.rotY(225);
      pose.scale(0.625, 0.625, 0.625);
      pose.translate(-0.5, -0.5, -0.5);
      const model = bakeChoice({ model: cube({ down: c.down ?? c.up, up: c.up, north: c.north ?? c.side, south: c.side, west: c.side, east: c.side }) });
      batch.begin({ texture: r.atlas.texture!, cutoff: c.translucent ? 0.1 : -1, blend: !!c.translucent, cull: true, lit: false, useLightmap: false });
      for (const q of model.variants[0].quads) {
        const sh = q.shade ? FACE_SHADE[q.dir] : 1;
        batch.quad(pose, Array.from(q.pos), Array.from(q.uv), 0, 1, 0, sh, sh, sh, 1);
      }
      batch.flush();
    });
    const pixels = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteRenderbuffer(depth);
    gl.deleteTexture(tex);
    // flip rows into a 2D canvas
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    // blending into the cleared framebuffer leaves colour multiplied by alpha; ImageData wants it straight
    for (let i = 0; i < pixels.length; i += 4) {
      const a = pixels[i + 3];
      if (a === 0 || a === 255) continue;
      for (let c = 0; c < 3; c++) pixels[i + c] = Math.min(255, Math.round((pixels[i + c] * 255) / a));
    }
    const id = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) id.data.set(pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    ctx.putImageData(id, 0, 0);
    this.canvas = c;
    this.builtScale = scale;
  }

  drawIcon(ctx: CanvasRenderingContext2D, id: string, px: number, py: number, size: number): boolean {
    const p = this.pos.get(id);
    if (p && this.canvas) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.canvas, p[0], p[1], this.cell, this.cell, px, py, size, size);
      return true;
    }
    const it = ITEM_LIST.find((i) => i.id === id);
    // icons of items the game doesn't have yet (advancements): their sprite by name
    const fc = it ? this.flatCanvas(it) : this.spriteCanvas(id);
    if (!fc) return false;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fc, 0, 0, fc.width, fc.height, px, py, size, size);
    return true;
  }

  private glintPattern: CanvasPattern | null = null;
  private glintScratch: HTMLCanvasElement | null = null;

  /**
   * vanilla glint render type over a GUI item: the scrolling glint texture,
   * masked to the icon and added on top (the texture is pre-squared for GL_SRC_COLOR, GL_ONE).
   */
  drawGlint(ctx: CanvasRenderingContext2D, id: string, px: number, py: number, size: number): void {
    let sc = this.glintScratch;
    if (!sc) {
      sc = this.glintScratch = document.createElement('canvas');
      const t = glintTexture();
      const gc = document.createElement('canvas');
      gc.width = t.w;
      gc.height = t.h;
      gc.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(t.data), t.w, t.h), 0, 0);
      this.glintPattern = sc.getContext('2d')!.createPattern(gc, 'repeat');
    }
    if (sc.width < size || sc.height < size) {
      sc.width = Math.max(sc.width, size);
      sc.height = Math.max(sc.height, size);
    }
    const sctx = sc.getContext('2d')!;
    sctx.globalCompositeOperation = 'source-over';
    sctx.clearRect(0, 0, size, size);
    if (!this.drawIcon(sctx, id, 0, 0, size) || !this.glintPattern) return;
    // icon pixel l → glint texel g = R(10°)·(8/size · l) + (-f, f1)·64, so the pattern maps g → size/8 · R(-10°)·(g - t)
    const [f, f1] = glintOffset(performance.now());
    this.glintPattern.setTransform(new DOMMatrix().scale(size / 8).rotate(-10).translate(f * GLINT_SIZE, -f1 * GLINT_SIZE));
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = this.glintPattern;
    sctx.fillRect(0, 0, size, size);
    sctx.globalCompositeOperation = 'source-over';
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(sc, 0, 0, size, size, px, py, size, size);
    ctx.globalCompositeOperation = prev;
  }

  drawStack(ctx: CanvasRenderingContext2D, s: ItemStack, px: number, py: number, size: number): boolean {
    return this.drawIcon(ctx, s.item.id, px, py, size);
  }
}
