// Inventory icons of items drawn by a model rather than a sprite (vanilla BlockEntityWithoutLevelRenderer's items:
// banners, shields): the model is drawn offscreen with its GUI transform and the flat item lighting, read back into a
// canvas the GUI can draw, and kept (the most recently used few hundred).

import type { GL } from './gl';
import { EntityBatch, PoseStack } from './entityRenderer';
import { mat4, ortho } from '../core/math';

/** vanilla Lighting.setupForFlatItems (gui_light "front"), in a GUI space whose y points up */
const FLAT_LIGHT0: [number, number, number] = [-0.2225, 0.1716, 0.9597];
const FLAT_LIGHT1: [number, number, number] = [-0.2151, 0.9718, 0.0966];

/** how many icons to keep before the oldest goes */
const ICON_CACHE = 256;

export class ItemIconBaker {
  private readonly icons = new Map<string, HTMLCanvasElement>();
  private readonly pose = new PoseStack();
  private batch: EntityBatch | null = null;
  private fb: WebGLFramebuffer | null = null;
  private fbTex: WebGLTexture | null = null;
  private depth: WebGLRenderbuffer | null = null;
  private size = 0;
  private readonly proj = mat4();

  constructor(private readonly gl: GL) {}

  /**
   * the icon `key` at `size` pixels: `draw` puts the item at the pose as the GUI would (the pose is 16 units to the
   * icon's width, y up, the item's origin in the middle); null where there's no document to draw into
   */
  icon(key: string, size: number, draw: (b: EntityBatch, pose: PoseStack) => void): HTMLCanvasElement | null {
    const k = `${key}@${size}`;
    const have = this.icons.get(k);
    if (have) {
      // (most recently used last)
      this.icons.delete(k);
      this.icons.set(k, have);
      return have;
    }
    if (typeof document === 'undefined') return null;
    const gl = this.gl;
    this.ensure(size);
    const b = (this.batch ??= new EntityBatch(gl));
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, size, size);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    ortho(this.proj, -8, 8, -8, 8, -100, 100);
    b.proj = this.proj;
    b.view = mat4();
    b.fog = [0, 0];
    b.lightB = 240;
    b.lightS = 240;
    b.light0 = FLAT_LIGHT0;
    b.light1 = FLAT_LIGHT1;
    b.setOverlay(0, 0, 0, 0);
    const pose = this.pose;
    pose.reset();
    pose.scale(16, 16, 16);
    draw(b, pose);
    b.flush();
    const pixels = new Uint8Array(size * size * 4);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    const id = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) id.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(id, 0, 0);
    this.icons.set(k, c);
    if (this.icons.size > ICON_CACHE) this.icons.delete(this.icons.keys().next().value!);
    return c;
  }

  private ensure(size: number): void {
    if (this.fb && size === this.size) return;
    const gl = this.gl;
    if (this.fb) {
      gl.deleteFramebuffer(this.fb);
      gl.deleteTexture(this.fbTex);
      gl.deleteRenderbuffer(this.depth);
    }
    this.size = size;
    this.fbTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.fbTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.depth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, size, size);
    this.fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fbTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
