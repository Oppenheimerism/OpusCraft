// vanilla EndCrystalRenderer: a bedrock plinth (when it shows its bottom), and
// above it two glass cubes and the crystal cube, each turned 60° about the
// diagonal and spinning about the vertical, the whole stack bobbing up and down.
// Drawn cut out and double sided (vanilla RenderType.entityCutoutNoCull).

import type { GL } from './gl';
import { createTexture } from './gl';
import type { EntityBatch, PoseStack, DrawState } from './entityRenderer';
import { ModelPart } from './model';
import type { EndCrystal } from '../entity/endCrystal';
import { endCrystalTexture } from '../textures/endEntities';

const SIN_45 = Math.sin(Math.PI / 4);

/** post-multiply the pose by a rotation of `deg` about the unit axis (x, y, z) (vanilla Quaternionf.setAngleAxis) */
function rotAxis(pose: PoseStack, deg: number, x: number, y: number, z: number): void {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), t = 1 - c;
  const R = [
    [c + x * x * t, x * y * t - z * s, x * z * t + y * s],
    [y * x * t + z * s, c + y * y * t, y * z * t - x * s],
    [z * x * t - y * s, z * y * t + x * s, c + z * z * t],
  ];
  const m = pose.m;
  const cols = [0, 1, 2].map((i) => [m[i * 4], m[i * 4 + 1], m[i * 4 + 2], m[i * 4 + 3]]);
  for (let j = 0; j < 3; j++)
    for (let k = 0; k < 4; k++) m[j * 4 + k] = cols[0][k] * R[0][j] + cols[1][k] * R[1][j] + cols[2][k] * R[2][j];
}

/** vanilla EndCrystalRenderer.getY: the bob, -1.4 .. -0.6 */
export function crystalBob(time: number, partial: number): number {
  const f = time + partial;
  let g = Math.sin(f * 0.2) / 2 + 0.5;
  g = (g * g + g) * 0.4;
  return g - 1.4;
}

export class EndCrystalRenderer {
  private tex: WebGLTexture | null = null;
  // vanilla EndCrystalRenderer.createBodyLayer (64x32)
  private readonly glass = new ModelPart([{ x: -4, y: -4, z: -4, w: 8, h: 8, d: 8, u: 0, v: 0 }]);
  private readonly cube = new ModelPart([{ x: -4, y: -4, z: -4, w: 8, h: 8, d: 8, u: 32, v: 0 }]);
  private readonly base = new ModelPart([{ x: -6, y: 0, z: -6, w: 12, h: 4, d: 12, u: 0, v: 16 }]);

  constructor(private readonly gl: GL) {}

  private state(): DrawState {
    if (!this.tex) {
      const t = endCrystalTexture();
      this.tex = createTexture(this.gl, t.w, t.h, new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength));
    }
    return { texture: this.tex, cutoff: 0.1, blend: false, cull: false, lit: true, useLightmap: true };
  }

  /** at camera-relative (dx, dy, dz); the batch's light is already the crystal's */
  render(b: EntityBatch, pose: PoseStack, e: EndCrystal, dx: number, dy: number, dz: number, partial: number): void {
    b.setOverlay(0, 0, 0, 0);
    b.begin(this.state());
    const f = crystalBob(e.time, partial);
    const g = (e.time + partial) * 3;
    pose.reset();
    pose.translate(dx, dy, dz);
    pose.scale(2, 2, 2);
    pose.translate(0, -0.5, 0);
    if (e.showBottom) this.base.render(b, pose, 64, 32);
    pose.rotY(g);
    pose.translate(0, 1.5 + f / 2, 0);
    rotAxis(pose, 60, SIN_45, 0, SIN_45);
    this.glass.render(b, pose, 64, 32);
    pose.scale(0.875, 0.875, 0.875);
    rotAxis(pose, 60, SIN_45, 0, SIN_45);
    pose.rotY(g);
    this.glass.render(b, pose, 64, 32);
    pose.scale(0.875, 0.875, 0.875);
    rotAxis(pose, 60, SIN_45, 0, SIN_45);
    pose.rotY(g);
    this.cube.render(b, pose, 64, 32);
  }
}
