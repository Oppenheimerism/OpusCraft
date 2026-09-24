// Player model preview in inventory screens (vanilla
// InventoryScreen.renderEntityInInventoryFollowsMouse), rendered offscreen and
// copied onto the 2D GUI canvas. The player is drawn by the entity dispatcher,
// as it is in the world: held items, the hurt flash, flames and all.

import type { GL } from './gl';
import { EntityBatch, PoseStack } from './entityRenderer';
import type { EntityRenderDispatcher, EntityRenderOptions } from './entityRenderers';
import { mat4, ortho } from '../core/math';
import type { Player } from '../entity/player';

export class GuiEntityRenderer {
  private fb: WebGLFramebuffer | null = null;
  private tex: WebGLTexture | null = null;
  private depth: WebGLRenderbuffer | null = null;
  private w = 0;
  private h = 0;
  private readonly pose = new PoseStack();
  private readonly proj = mat4();
  private readonly out = document.createElement('canvas');
  private pixels = new Uint8Array(0);

  constructor(private readonly gl: GL, private readonly batch: EntityBatch, private readonly entities: EntityRenderDispatcher) {}

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
   * Draw the player into the GUI rect (x1,y1)-(x2,y2) (GUI pixels), `scale` GUI pixels per block,
   * looking toward the mouse. Returns a canvas to blit at (x1, y1).
   */
  render(p: Player, opts: EntityRenderOptions, guiScale: number, x1: number, y1: number, x2: number, y2: number, scale: number, yOffset: number, mx: number, my: number): HTMLCanvasElement {
    const W = Math.max(1, Math.round((x2 - x1) * guiScale)), H = Math.max(1, Math.round((y2 - y1) * guiScale));
    this.ensure(W, H);
    const gl = this.gl;
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const f2 = Math.atan((cx - mx) / 40);
    const f3 = Math.atan((cy - my) / 40);
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
    b.light0 = [0.2, -1, 1];
    b.light1 = [-0.2, -1, 0];
    // vanilla: the player turned to face the mouse for the draw (partial tick 1 sees just these), then put back
    const bodyYaw = p.bodyYaw, headYaw = p.headYaw, yaw = p.yaw, pitch = p.pitch;
    p.bodyYaw = 180 + f2 * 20;
    p.yaw = p.headYaw = 180 + f2 * 40;
    p.pitch = -f3 * 20;
    // vanilla transform chain: T(center) S(s,s,-s) T(0, h/2 + off) Rz(180) Rx(f3*20), then the dispatcher's own
    const pose = this.pose;
    pose.reset();
    pose.translate(cx, cy, 50);
    pose.scale(scale, scale, -scale);
    pose.translate(0, p.height / 2 + yOffset, 0);
    pose.rotZ(180);
    pose.rotX(f3 * 20);
    this.entities.renderPlayerInGui(b, p, pose.m, opts);
    b.flush();
    p.bodyYaw = bodyYaw;
    p.headYaw = headYaw;
    p.yaw = yaw;
    p.pitch = pitch;
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
