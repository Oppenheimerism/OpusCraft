// Names over mobs (vanilla EntityRenderer.renderNameTag): half a block over its head, turned to face the camera, in
// the font at a fortieth of a block a pixel. First the see-through name, seen through walls and all, faint white on a
// quarter-dark strip (vanilla Font.DisplayMode.SEE_THROUGH); then the name itself in white wherever it isn't hidden.
// Lit by the light where the mob is. Collected while the entities are drawn and drawn after all of them, as vanilla's
// text buffers are.

import type { GL } from './gl';
import { createTexture } from './gl';
import type { EntityBatch, PoseStack, DrawState } from './entityRenderer';
import { fontSheet } from './mapRenderer';
import { textWidth } from '../textures/font';

interface Tag {
  name: string;
  x: number;
  y: number;
  z: number;
  lightB: number;
  lightS: number;
}

interface GlyphUV {
  u0: number;
  u1: number;
  w: number;
}

/** vanilla Options.getBackgroundOpacity(0.25): the strip behind a name */
const BACKGROUND_ALPHA = 63 / 255;
/** vanilla's see-through text colour 0x20FFFFFF */
const SEE_THROUGH_ALPHA = 32 / 255;

export class NameTagRenderer {
  private font: WebGLTexture | null = null;
  private glyphs = new Map<string, GlyphUV>();
  private white: [number, number] = [0, 0];
  private readonly tags: Tag[] = [];

  constructor(private readonly gl: GL) {}

  /** a name to draw, with the top of its strip's middle at camera-relative (x, y, z), in the given light */
  add(name: string, x: number, y: number, z: number, lightB: number, lightS: number): void {
    this.tags.push({ name, x, y, z, lightB, lightS });
  }

  /** draw the names collected, facing a camera turned `yaw`, `pitch` (vanilla cameraOrientation), and forget them */
  flush(b: EntityBatch, pose: PoseStack, yaw: number, pitch: number): void {
    if (!this.tags.length) return;
    if (!this.font) {
      const f = fontSheet();
      this.font = createTexture(this.gl, f.w, 8, f.data);
      this.glyphs = f.glyphs;
      this.white = f.white;
    }
    const base: DrawState = { texture: this.font, cutoff: 0.1, blend: true, cull: false, lit: false, useLightmap: true };
    b.setOverlay(0, 0, 0, 0);
    for (const seeThrough of [true, false]) {
      b.begin(seeThrough ? { ...base, depthTest: false, depthWrite: false } : base);
      for (const t of this.tags) {
        pose.reset();
        pose.translate(t.x, t.y, t.z);
        pose.rotY(180 - yaw);
        pose.rotX(-pitch);
        pose.scale(0.025, -0.025, 0.025);
        b.lightB = t.lightB;
        b.lightS = t.lightS;
        // (vanilla: centred on whole pixels; deadmau5's is drawn higher, over his ears)
        const w = textWidth(t.name), x0 = -Math.trunc(w / 2), y0 = t.name === 'deadmau5' ? -10 : 0;
        if (seeThrough) {
          const [wu, wv] = this.white;
          b.quad(pose, [x0 - 1, y0 + 9, -0.01, x0 + w, y0 + 9, -0.01, x0 + w, y0 - 1, -0.01, x0 - 1, y0 - 1, -0.01], [wu, wv, wu, wv, wu, wv, wu, wv], 0, 0, 1, 0, 0, 0, BACKGROUND_ALPHA);
        }
        const a = seeThrough ? SEE_THROUGH_ALPHA : 1;
        let x = x0;
        for (const ch of t.name) {
          const g = this.glyphs.get(ch) ?? this.glyphs.get('?')!;
          if (ch !== ' ') b.quad(pose, [x, y0 + 8, 0, x + g.w, y0 + 8, 0, x + g.w, y0, 0, x, y0, 0], [g.u0, 1, g.u1, 1, g.u1, 0, g.u0, 0], 0, 0, 1, 1, 1, 1, a);
          x += g.w + 1;
        }
      }
      b.flush();
    }
    this.tags.length = 0;
  }
}
