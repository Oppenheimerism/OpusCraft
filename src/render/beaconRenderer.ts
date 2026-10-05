// (the beacon) The beacon's beam (vanilla BeaconRenderer): from a lit beacon up through its column, one length for
// each colour the stained glass in it gives (the top one going on up 1024 blocks), each an opaque core a fifth of a
// block across, turning 2.25 degrees a tick, and a faint square glow a quarter across round it, both full bright, the
// streaks of its texture scrolling up them; seen from up to 256 blocks away across, however high it goes. The same
// beam the end gateways' are drawn as (render/endRenderer.ts), with the beacon's own texture.

import { createTexture, type GL } from './gl';
import type { Frustum } from '../core/math';
import type { World } from '../world/world';
import { BeaconBlockEntity } from '../game/beacon';
import { beaconBeamTexture } from '../textures/beacon';
import { PoseStack, type EntityBatch, type DrawState } from './entityRenderer';

/** vanilla BeaconRenderer.getViewDistance */
const VIEW_DISTANCE = 256;
/** vanilla BeaconRenderer.MAX_RENDER_Y: how high the top length of the beam goes */
const MAX_RENDER_Y = 1024;

export class BeaconRenderer {
  private tex: WebGLTexture | null = null;
  private readonly pose = new PoseStack();
  private readonly v = [0, 0, 0];

  constructor(private readonly gl: GL) {}

  /**
   * vanilla BeaconRenderer.render for each lit beacon whose middle is within 256 of the camera across (vanilla
   * shouldRender; shouldRenderOffScreen: drawn wherever its beam may be in view, not just its block)
   */
  render(b: EntityBatch, world: World, gameTime: number, camX: number, camY: number, camZ: number, frustum: Frustum, partial: number): void {
    for (const be of world.blockEntities.values()) {
      if (!(be instanceof BeaconBlockEntity) || be.removed) continue;
      const sections = be.shownBeam();
      if (!sections.length) continue;
      const x = be.x - camX, y = be.y - camY, z = be.z - camZ;
      if ((x + 0.5) ** 2 + (z + 0.5) ** 2 >= VIEW_DISTANCE ** 2) continue;
      if (!frustum.testBox(x, y, z, x + 1, y + MAX_RENDER_Y, z + 1)) continue;
      let yOffset = 0;
      for (let k = 0; k < sections.length; k++) {
        const s = sections[k];
        this.pose.reset();
        this.pose.translate(x, y, z);
        this.beam(b, partial, gameTime, yOffset, k === sections.length - 1 ? MAX_RENDER_Y : s.height, s.color, 0.2, 0.25);
        yOffset += s.height;
      }
    }
  }

  /**
   * vanilla BeaconRenderer.renderBeaconBeam (texture scale 1): from `yOffset` up `height`, the core `beamRadius`
   * across turning with the time, then the glow `glowRadius` across (alpha 32) round it, the texture scrolling along
   */
  private beam(b: EntityBatch, partial: number, gameTime: number, yOffset: number, height: number, color: number, beamRadius: number, glowRadius: number): void {
    if (!this.tex) {
      const t = beaconBeamTexture();
      // (vanilla: sampled nearest, repeating)
      this.tex = createTexture(this.gl, t.w, t.h, new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength), { nearest: true, clamp: false });
    }
    const top = yOffset + height;
    const f = (((gameTime % 40) + 40) % 40) + partial;
    const f1 = height < 0 ? f : -f;
    const frac = (v: number) => v - Math.floor(v);
    const f2 = frac(f1 * 0.2 - Math.floor(f1 * 0.1));
    const r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, bl = (color & 255) / 255;
    const pose = this.pose;
    pose.translate(0.5, 0, 0.5);
    // the core: turning, opaque (vanilla RenderType.beaconBeam(texture, false))
    pose.push();
    pose.rotY(f * 2.25 - 45);
    const v0 = -1 + f2;
    b.setOverlay(0, 0, 0, 0);
    b.begin(this.state(false));
    this.part(b, r, g, bl, 1, yOffset, top, 0, beamRadius, beamRadius, 0, -beamRadius, 0, 0, -beamRadius, 0, 1, height * (0.5 / beamRadius) + v0, v0);
    pose.pop();
    // the glow: faint, not writing depth (vanilla RenderType.beaconBeam(texture, true))
    b.begin(this.state(true));
    const G = glowRadius;
    this.part(b, r, g, bl, 32 / 255, yOffset, top, -G, -G, G, -G, -G, G, G, G, 0, 1, height + v0, v0);
  }

  private state(glow: boolean): DrawState {
    return glow
      ? { texture: this.tex!, cutoff: 0, blend: true, cull: true, lit: false, useLightmap: false, depthWrite: false }
      : { texture: this.tex!, cutoff: 0, blend: false, cull: true, lit: false, useLightmap: false };
  }

  /** vanilla BeaconRenderer.renderPart: the four sides */
  private part(b: EntityBatch, r: number, g: number, bl: number, a: number, minY: number, maxY: number, x1: number, z1: number, x2: number, z2: number, x3: number, z3: number, x4: number, z4: number, minU: number, maxU: number, minV: number, maxV: number): void {
    this.quad(b, r, g, bl, a, minY, maxY, x1, z1, x2, z2, minU, maxU, minV, maxV);
    this.quad(b, r, g, bl, a, minY, maxY, x4, z4, x3, z3, minU, maxU, minV, maxV);
    this.quad(b, r, g, bl, a, minY, maxY, x2, z2, x4, z4, minU, maxU, minV, maxV);
    this.quad(b, r, g, bl, a, minY, maxY, x3, z3, x1, z1, minU, maxU, minV, maxV);
  }

  /** vanilla BeaconRenderer.renderQuad, full bright (as two triangles) */
  private quad(b: EntityBatch, r: number, g: number, bl: number, a: number, minY: number, maxY: number, minX: number, minZ: number, maxX: number, maxZ: number, minU: number, maxU: number, minV: number, maxV: number): void {
    const P = this.v, pose = this.pose;
    const corners = [
      [minX, maxY, minZ, maxU, minV],
      [minX, minY, minZ, maxU, maxV],
      [maxX, minY, maxZ, minU, maxV],
      [maxX, maxY, maxZ, minU, minV],
    ];
    b.lightB = b.lightS = 240;
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const c = corners[k];
      pose.transform(c[0], c[1], c[2], P);
      b.vertexRaw(P[0], P[1], P[2], c[3], c[4], r, g, bl, a, 0, 1, 0);
    }
  }
}
