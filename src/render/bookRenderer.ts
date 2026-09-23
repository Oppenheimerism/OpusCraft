// The enchanting table's book: vanilla BookModel (covers, spine, page blocks and
// two flipping pages) with its setupAnim, the EnchantTableRenderer pose over
// the table, and the offscreen copy drawn in the enchanting screen
// (EnchantmentScreen.renderBook).

import type { GL } from './gl';
import { createTexture } from './gl';
import { EntityBatch, PoseStack } from './entityRenderer';
import { ModelPart } from './model';
import { mat4, ortho } from '../core/math';
import { enchantingBookTexture } from '../textures/enchantingBook';

export const BOOK_TEX_W = 64;
export const BOOK_TEX_H = 32;

export interface BookModel {
  root: ModelPart;
  leftLid: ModelPart;
  rightLid: ModelPart;
  leftPages: ModelPart;
  rightPages: ModelPart;
  flipPage1: ModelPart;
  flipPage2: ModelPart;
}

/** vanilla BookModel.createBodyLayer */
export function bookModel(): BookModel {
  const root = new ModelPart();
  const leftLid = root.add('left_lid', new ModelPart([{ x: -6, y: -5, z: -0.005, w: 6, h: 10, d: 0.005, u: 0, v: 0 }], [0, 0, -1]));
  const rightLid = root.add('right_lid', new ModelPart([{ x: 0, y: -5, z: -0.005, w: 6, h: 10, d: 0.005, u: 16, v: 0 }], [0, 0, 1]));
  root.add('seam', new ModelPart([{ x: -1, y: -5, z: 0, w: 2, h: 10, d: 0.005, u: 12, v: 0 }], [0, 0, 0], [0, Math.PI / 2, 0]));
  const leftPages = root.add('left_pages', new ModelPart([{ x: 0, y: -4, z: -0.99, w: 5, h: 8, d: 1, u: 0, v: 10 }]));
  const rightPages = root.add('right_pages', new ModelPart([{ x: 0, y: -4, z: -0.01, w: 5, h: 8, d: 1, u: 12, v: 10 }]));
  const flipPage1 = root.add('flip_page1', new ModelPart([{ x: 0, y: -4, z: 0, w: 5, h: 8, d: 0.005, u: 24, v: 10 }]));
  const flipPage2 = root.add('flip_page2', new ModelPart([{ x: 0, y: -4, z: 0, w: 5, h: 8, d: 0.005, u: 24, v: 10 }]));
  return { root, leftLid, rightLid, leftPages, rightPages, flipPage1, flipPage2 };
}

/** vanilla BookModel.setupAnim */
export function setupBookAnim(m: BookModel, time: number, rightFlip: number, leftFlip: number, open: number): void {
  const f = (Math.sin(time * 0.02) * 0.1 + 1.25) * open;
  m.leftLid.yRot = Math.PI + f;
  m.rightLid.yRot = -f;
  m.leftPages.yRot = f;
  m.rightPages.yRot = -f;
  m.flipPage1.yRot = f - f * 2 * rightFlip;
  m.flipPage2.yRot = f - f * 2 * leftFlip;
  m.leftPages.x = m.rightPages.x = m.flipPage1.x = m.flipPage2.x = Math.sin(f);
}

/** vanilla Mth.frac */
const frac = (v: number) => v - Math.floor(v);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** page flip amounts from the flip counter (vanilla EnchantTableRenderer / EnchantmentScreen) */
export function flipAmounts(flip: number): [number, number] {
  return [clamp01(frac(flip + 0.25) * 1.6 - 0.3), clamp01(frac(flip + 0.75) * 1.6 - 0.3)];
}

let bookImage: ReturnType<typeof enchantingBookTexture> | null = null;
export function bookTexture(gl: GL): WebGLTexture {
  bookImage ??= enchantingBookTexture();
  return createTexture(gl, bookImage.w, bookImage.h, new Uint8Array(bookImage.data.buffer, bookImage.data.byteOffset, bookImage.data.byteLength));
}

export interface BookAnimState {
  time: number;
  flip: number;
  oFlip: number;
  open: number;
  oOpen: number;
  rot: number;
  oRot: number;
}

/** vanilla EnchantTableRenderer.render: the book bobbing over the table, turned toward the reader */
export function renderTableBook(b: EntityBatch, pose: PoseStack, m: BookModel, be: BookAnimState, dx: number, dy: number, dz: number, partial: number): void {
  pose.reset();
  pose.translate(dx + 0.5, dy + 0.75, dz + 0.5);
  const f = be.time + partial;
  pose.translate(0, 0.1 + Math.sin(f * 0.1) * 0.01, 0);
  let f1 = be.rot - be.oRot;
  while (f1 >= Math.PI) f1 -= Math.PI * 2;
  while (f1 < -Math.PI) f1 += Math.PI * 2;
  const f2 = be.oRot + f1 * partial;
  pose.rotY((-f2 * 180) / Math.PI);
  pose.rotZ(80);
  const [r, l] = flipAmounts(be.oFlip + (be.flip - be.oFlip) * partial);
  setupBookAnim(m, f, r, l, be.oOpen + (be.open - be.oOpen) * partial);
  m.root.render(b, pose, BOOK_TEX_W, BOOK_TEX_H);
}

/** EnchantmentScreen's book, drawn offscreen and copied onto the GUI canvas */
export class GuiBookRenderer {
  private fb: WebGLFramebuffer | null = null;
  private tex: WebGLTexture | null = null;
  private depth: WebGLRenderbuffer | null = null;
  private w = 0;
  private h = 0;
  private readonly model = bookModel();
  private readonly pose = new PoseStack();
  private readonly proj = mat4();
  private readonly out = document.createElement('canvas');
  private pixels = new Uint8Array(0);
  private bookTex: WebGLTexture | null = null;

  constructor(private readonly gl: GL, private readonly batch: EntityBatch) {}

  private ensure(w: number, h: number): void {
    if (this.fb && w === this.w && h === this.h) return;
    const gl = this.gl;
    if (this.fb) {
      gl.deleteFramebuffer(this.fb);
      gl.deleteTexture(this.tex);
      gl.deleteRenderbuffer(this.depth);
    }
    this.w = w;
    this.h = h;
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.depth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    this.fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.out.width = w;
    this.out.height = h;
    this.pixels = new Uint8Array(w * h * 4);
  }

  /**
   * vanilla EnchantmentScreen.renderBook: centred at (cx, cy) GUI px, 40 px per block, tilted 25°, swinging
   * open as `open` goes 0 → 1. Draws into the GUI rect (x1,y1)-(x2,y2) and returns the canvas to blit there.
   */
  render(guiScale: number, x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, flip: number, open: number): HTMLCanvasElement {
    const W = Math.max(1, Math.round((x2 - x1) * guiScale)), H = Math.max(1, Math.round((y2 - y1) * guiScale));
    this.ensure(W, H);
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    ortho(this.proj, x1, x2, y2, y1, -1000, 1000);
    const b = this.batch;
    b.proj = this.proj;
    b.view = mat4();
    b.fog = [0, 0];
    b.lightB = 240;
    b.lightS = 240;
    // vanilla Lighting.setupForEntityInInventory
    b.light0 = [0.2, -1, 1];
    b.light1 = [-0.2, -1, 0];
    b.setOverlay(0, 0, 0, 0);
    const pose = this.pose;
    pose.reset();
    pose.translate(cx, cy, 100);
    pose.scale(-40, 40, 40);
    pose.rotX(25);
    pose.translate((1 - open) * 0.2, (1 - open) * 0.1, (1 - open) * 0.25);
    pose.rotY(-(1 - open) * 90 - 90);
    pose.rotX(180);
    const [r, l] = flipAmounts(flip);
    setupBookAnim(this.model, 0, r, l, open);
    this.bookTex ??= bookTexture(gl);
    b.begin({ texture: this.bookTex, cutoff: 0.1, blend: false, cull: false, lit: true, useLightmap: false });
    this.model.root.render(b, pose, BOOK_TEX_W, BOOK_TEX_H);
    b.flush();
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const ctx = this.out.getContext('2d')!;
    const id = ctx.createImageData(W, H);
    const px = this.pixels;
    for (let y = 0; y < H; y++) id.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    ctx.putImageData(id, 0, 0);
    return this.out;
  }
}
