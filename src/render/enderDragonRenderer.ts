// vanilla EnderDragonRenderer and its DragonModel, and DragonFireballRenderer.
//
// The dragon is drawn from its position history: its heading seven ticks back turns the whole model, its climb
// tilts it; the five neck segments and the head follow the headings of the last few ticks, the twelve tail
// segments those of ticks 12 to 23 back, so the neck swings ahead into a turn and the tail trails round after
// it. The wings beat with its flap time (and the jaw with them), the legs tuck up with the body's bob. Hurt, it
// flushes red; dying, it dissolves (only what's left of its exploding mask is drawn, the skin laid over that) while
// rays of light burst out of it. Its eyes are added on full bright. The crystal healing it beams to it.

import type { GL } from './gl';
import { createTexture } from './gl';
import type { EntityBatch, DrawState, PoseStack } from './entityRenderer';
import type { Camera } from './renderer';
import { ModelPart, type Cube } from './model';
import { crystalBob, type CrystalBeam } from './endCrystalRenderer';
import { wrapDegrees } from '../core/math';
import type { TexImage } from '../textures/tex';
import { dragonTextures, dragonFireballTexture } from '../textures/enderDragon';
import { LegacyRandom } from '../world/gen/legacyRandom';
import { mthCos, mthSin, type EnderDragon } from '../entity/enderDragon';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const HALF_SQRT_3 = Math.sqrt(3) / 2;

function cube(x: number, y: number, z: number, w: number, h: number, d: number, u: number, v: number, mirror = false): Cube {
  return { x, y, z, w, h, d, u, v, mirror };
}

interface Side {
  wing: ModelPart;
  frontLeg: ModelPart;
  frontLegTip: ModelPart;
  frontFoot: ModelPart;
  rearLeg: ModelPart;
  rearLegTip: ModelPart;
  rearFoot: ModelPart;
}

/** vanilla DragonModel.createBodyLayer (256x256): the right side's boxes mirror the left's */
class DragonModel {
  readonly head = new ModelPart([
    cube(-6, -1, -24, 12, 5, 16, 176, 44), // upper lip
    cube(-8, -8, -10, 16, 16, 16, 112, 30), // upper head
    cube(-5, -12, -4, 2, 4, 6, 0, 0, true), // horn
    cube(-5, -3, -22, 2, 2, 4, 112, 0, true), // nostril
    cube(3, -12, -4, 2, 4, 6, 0, 0),
    cube(3, -3, -22, 2, 2, 4, 112, 0),
  ]);
  readonly jaw = this.head.add('jaw', new ModelPart([cube(-6, 0, -16, 12, 4, 16, 176, 65)], [0, 4, -8]));
  /** one neck segment (a spine on it), drawn five times for the neck and twelve for the tail */
  readonly neck = new ModelPart([cube(-5, -5, -5, 10, 10, 10, 192, 104), cube(-1, -9, -3, 2, 4, 6, 48, 0)]);
  readonly body = new ModelPart(
    [cube(-12, 0, -16, 24, 24, 64, 0, 0), cube(-1, -6, -10, 2, 6, 12, 220, 53), cube(-1, -6, 10, 2, 6, 12, 220, 53), cube(-1, -6, 30, 2, 6, 12, 220, 53)],
    [0, 4, 8],
  );
  readonly left: Side = DragonModel.side(1);
  readonly right: Side = DragonModel.side(-1);

  private static side(s: 1 | -1): Side {
    const m = s > 0;
    const wing = new ModelPart([cube(m ? 0 : -56, -4, -4, 56, 8, 8, 112, 88, m), cube(m ? 0 : -56, 0, 2, 56, 0, 56, -56, 88, m)], [12 * s, 5, 2]);
    wing.add('tip', new ModelPart([cube(m ? 0 : -56, -2, -2, 56, 4, 4, 112, 136, m), cube(m ? 0 : -56, 0, 2, 56, 0, 56, -56, 144, m)], [56 * s, 0, 0]));
    const frontLeg = new ModelPart([cube(-4, -4, -4, 8, 24, 8, 112, 104)], [12 * s, 20, 2]);
    const frontLegTip = frontLeg.add('tip', new ModelPart([cube(-3, -1, -3, 6, 24, 6, 226, 138)], [0, 20, -1]));
    const frontFoot = frontLegTip.add('foot', new ModelPart([cube(-4, 0, -12, 8, 4, 16, 144, 104)], [0, 23, 0]));
    const rearLeg = new ModelPart([cube(-8, -4, -8, 16, 32, 16, 0, 0)], [16 * s, 16, 42]);
    const rearLegTip = rearLeg.add('tip', new ModelPart([cube(-6, -2, 0, 12, 32, 12, 196, 0)], [0, 32, -4]));
    const rearFoot = rearLegTip.add('foot', new ModelPart([cube(-9, 0, -20, 18, 6, 24, 112, 0)], [0, 31, 4]));
    return { wing, frontLeg, frontLegTip, frontFoot, rearLeg, rearLegTip, rearFoot };
  }
}

function upload(gl: GL, t: TexImage, repeat = false): WebGLTexture {
  return createTexture(gl, t.w, t.h, new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength), { clamp: !repeat });
}

export class EnderDragonRenderer {
  private readonly model = new DragonModel();
  private tex: { skin: WebGLTexture; eyes: WebGLTexture; exploding: WebGLTexture } | null = null;
  private white: WebGLTexture | null = null;
  private fireballTex: WebGLTexture | null = null;
  private readonly p = [0, 0, 0];

  constructor(private readonly gl: GL, private readonly beam: CrystalBeam) {}

  private textures(): { skin: WebGLTexture; eyes: WebGLTexture; exploding: WebGLTexture } {
    if (!this.tex) {
      const t = dragonTextures();
      this.tex = { skin: upload(this.gl, t.skin), eyes: upload(this.gl, t.eyes), exploding: upload(this.gl, t.exploding) };
    }
    return this.tex;
  }

  /** vanilla EnderDragonRenderer.render, at camera-relative (dx, dy, dz); the batch's light is already the dragon's */
  render(b: EntityBatch, pose: PoseStack, e: EnderDragon, dx: number, dy: number, dz: number, partial: number): void {
    const tex = this.textures();
    const yaw = e.getLatencyPos(7, partial)[0];
    const climb = e.getLatencyPos(5, partial)[1] - e.getLatencyPos(10, partial)[1];
    pose.reset();
    pose.translate(dx, dy, dz);
    pose.push();
    pose.rotY(-yaw);
    pose.rotX(climb * 10);
    pose.translate(0, 0, 1);
    pose.scale(-1, -1, 1);
    pose.translate(0, -1.501, 0);
    const hurt = e.hurtTime > 0;
    const cutout = (t: WebGLTexture, extra: Partial<DrawState> = {}): DrawState => ({ texture: t, cutoff: 0.1, blend: false, cull: false, lit: true, useLightmap: true, ...extra });
    if (e.dragonDeathTime > 0) {
      // vanilla DISSOLVE then DECAL: what's left of the exploding mask (its alpha above the death's progress) takes
      // the depth, and only there does the skin go down (depth EQUAL)
      b.setOverlay(0, 0, 0, 0);
      b.begin(cutout(tex.exploding, { cutoff: Math.floor((e.dragonDeathTime / 200) * 255) / 255, lit: false, useLightmap: false, colorWrite: false }));
      this.drawModel(b, pose, e, partial, false);
      if (hurt) b.setOverlay(1, 0, 0, 0.3);
      b.begin(cutout(tex.skin, { depthEqual: true }));
      this.drawModel(b, pose, e, partial, false);
    } else {
      if (hurt) b.setOverlay(1, 0, 0, 0.3);
      else b.setOverlay(0, 0, 0, 0);
      b.begin(cutout(tex.skin));
      this.drawModel(b, pose, e, partial, false);
    }
    // the eyes, added on full bright (vanilla RenderType.eyes: the rest of that texture is black, so only the
    // head need be drawn)
    b.setOverlay(0, 0, 0, 0);
    const lb = b.lightB, ls = b.lightS;
    b.lightB = b.lightS = 240;
    b.begin({ texture: tex.eyes, cutoff: -1, blend: true, additive: true, depthWrite: false, cull: true, lit: false, useLightmap: false });
    this.drawModel(b, pose, e, partial, true);
    b.lightB = lb;
    b.lightS = ls;
    if (e.dragonDeathTime > 0) {
      const f3 = (e.dragonDeathTime + partial) / 200;
      pose.push();
      pose.translate(0, -1, -2);
      this.rays(b, pose, f3, false);
      this.rays(b, pose, f3, true);
      pose.pop();
    }
    pose.pop();
    const c = e.nearestCrystal;
    if (c) {
      const x = c.x - (e.xo + (e.x - e.xo) * partial);
      const y = c.y - (e.yo + (e.y - e.yo) * partial);
      const z = c.z - (e.zo + (e.z - e.zo) * partial);
      this.beam.render(b, pose, x, y + crystalBob(c.time, partial), z, partial, e.tickCount);
    }
  }

  /** vanilla DragonModel.renderToBuffer (just the head, for the eyes) */
  private drawModel(b: EntityBatch, pose: PoseStack, e: EnderDragon, a: number, headOnly: boolean): void {
    const m = this.model;
    pose.push();
    const f = e.oFlapTime + (e.flapTime - e.oFlapTime) * a;
    m.jaw.xRot = (Math.sin(f * TAU) + 1) * 0.2;
    let bob = Math.sin(f * TAU - 1) + 1;
    bob = (bob * bob + bob * 2) * 0.05;
    pose.translate(0, bob - 2, -3);
    pose.rotX(bob * 2);
    let x = 0, y = 20, z = -12;
    const spine = e.getLatencyPos(6, a);
    const lat5 = e.getLatencyPos(5, a);
    const turn = wrapDegrees(lat5[0] - e.getLatencyPos(10, a)[0]);
    const facing = wrapDegrees(lat5[0] + turn / 2);
    const phase = f * TAU;
    const seg = m.neck;
    // the neck, from the body out
    for (let i = 0; i < 5; i++) {
      const lat = e.getLatencyPos(5 - i, a);
      const wave = Math.cos(i * 0.45 + phase) * 0.15;
      seg.yRot = wrapDegrees(lat[0] - spine[0]) * DEG * 1.5;
      seg.xRot = wave + e.getHeadPartYOffset(i, spine, lat) * DEG * 1.5 * 5;
      seg.zRot = -wrapDegrees(lat[0] - facing) * DEG * 1.5;
      seg.x = x;
      seg.y = y;
      seg.z = z;
      y += mthSin(seg.xRot) * 10;
      z -= mthCos(seg.yRot) * mthCos(seg.xRot) * 10;
      x -= mthSin(seg.yRot) * mthCos(seg.xRot) * 10;
      if (!headOnly) seg.render(b, pose, 256, 256);
    }
    const head = m.head;
    head.x = x;
    head.y = y;
    head.z = z;
    const now = e.getLatencyPos(0, a);
    head.yRot = wrapDegrees(now[0] - spine[0]) * DEG;
    head.xRot = wrapDegrees(e.getHeadPartYOffset(6, spine, now)) * DEG * 1.5 * 5;
    head.zRot = -wrapDegrees(now[0] - facing) * DEG;
    head.render(b, pose, 256, 256);
    if (headOnly) {
      pose.pop();
      return;
    }
    // the body, leaning into the turn, the wings and legs with it
    pose.push();
    pose.translate(0, 1, 0);
    pose.rotZ(-turn * 1.5);
    pose.translate(0, -1, 0);
    m.body.zRot = 0;
    m.body.render(b, pose, 256, 256);
    const L = m.left.wing, LT = L.child('tip'), R = m.right.wing, RT = R.child('tip');
    L.xRot = 0.125 - Math.cos(phase) * 0.2;
    L.yRot = -0.25;
    L.zRot = -(Math.sin(phase) + 0.125) * 0.8;
    LT.zRot = (Math.sin(phase + 2) + 0.5) * 0.75;
    R.xRot = L.xRot;
    R.yRot = -L.yRot;
    R.zRot = -L.zRot;
    RT.zRot = -LT.zRot;
    this.side(b, pose, bob, m.left);
    this.side(b, pose, bob, m.right);
    pose.pop();
    // the tail, from the body back
    let sway = 0;
    x = 0;
    y = 10;
    z = 60;
    const root = e.getLatencyPos(11, a);
    for (let k = 0; k < 12; k++) {
      const lat = e.getLatencyPos(12 + k, a);
      sway += mthSin(k * 0.45 + phase) * 0.05;
      seg.yRot = (wrapDegrees(lat[0] - root[0]) * 1.5 + 180) * DEG;
      seg.xRot = sway + (lat[1] - root[1]) * DEG * 1.5 * 5;
      seg.zRot = wrapDegrees(lat[0] - facing) * DEG * 1.5;
      seg.x = x;
      seg.y = y;
      seg.z = z;
      y += mthSin(seg.xRot) * 10;
      z -= mthCos(seg.yRot) * mthCos(seg.xRot) * 10;
      x -= mthSin(seg.yRot) * mthCos(seg.xRot) * 10;
      seg.render(b, pose, 256, 256);
    }
    pose.pop();
  }

  /** vanilla DragonModel.renderSide: the legs tucked up (more as the body bobs up), then the wing and the legs */
  private side(b: EntityBatch, pose: PoseStack, bob: number, s: Side): void {
    s.rearLeg.xRot = 1 + bob * 0.1;
    s.rearLegTip.xRot = 0.5 + bob * 0.1;
    s.rearFoot.xRot = 0.75 + bob * 0.1;
    s.frontLeg.xRot = 1.3 + bob * 0.1;
    s.frontLegTip.xRot = -0.5 - bob * 0.1;
    s.frontFoot.xRot = 0.75 + bob * 0.1;
    s.wing.render(b, pose, 256, 256);
    s.frontLeg.render(b, pose, 256, 256);
    s.rearLeg.render(b, pose, 256, 256);
  }

  /**
   * vanilla EnderDragonRenderer.renderRays: up to 60 rays bursting out as the death runs (`f3` 0..1) — each a
   * thin pyramid, white at its root fading to nothing at its magenta tip, turned on from the last — then gone
   * over the last fifth; drawn added on, then once more for the depth only
   */
  private rays(b: EntityBatch, pose: PoseStack, f3: number, depth: boolean): void {
    this.white ??= createTexture(this.gl, 1, 1, new Uint8Array([255, 255, 255, 255]));
    b.setOverlay(0, 0, 0, 0);
    b.begin(
      depth
        ? { texture: this.white, cutoff: -1, blend: false, cull: true, lit: false, useLightmap: false, colorWrite: false }
        : { texture: this.white, cutoff: -1, blend: true, lightning: true, depthWrite: false, cull: true, lit: false, useLightmap: false },
    );
    pose.push();
    const f = Math.min(f3 > 0.8 ? (f3 - 0.8) / 0.2 : 0, 1);
    const alpha = 1 - f;
    const rnd = new LegacyRandom(432);
    const n = Math.floor(((f3 + f3 * f3) / 2) * 60);
    const P = this.p;
    const vert = (x: number, y: number, z: number, root: boolean) => {
      pose.transform(x, y, z, P);
      if (root) b.vertexRaw(P[0], P[1], P[2], 0, 0, 1, 1, 1, alpha, 0, 1, 0);
      else b.vertexRaw(P[0], P[1], P[2], 0, 0, 1, 0, 1, 0, 0, 1, 0);
    };
    for (let l = 0; l < n; l++) {
      // (a quaternion rotationXYZ(...).rotateXYZ(...): six turns about x, y, z, x, y, z)
      const a1 = rnd.nextFloat() * TAU, a2 = rnd.nextFloat() * TAU, a3 = rnd.nextFloat() * TAU;
      const a4 = rnd.nextFloat() * TAU, a5 = rnd.nextFloat() * TAU, a6 = rnd.nextFloat() * TAU + f3 * (Math.PI / 2);
      pose.rotX(a1 / DEG);
      pose.rotY(a2 / DEG);
      pose.rotZ(a3 / DEG);
      pose.rotX(a4 / DEG);
      pose.rotY(a5 / DEG);
      pose.rotZ(a6 / DEG);
      const len = rnd.nextFloat() * 20 + 5 + f * 10;
      const w = rnd.nextFloat() * 2 + 1 + f * 2;
      const x1 = -HALF_SQRT_3 * w, z1 = -0.5 * w, x2 = HALF_SQRT_3 * w, z2 = -0.5 * w, z3 = w;
      vert(0, 0, 0, true);
      vert(x1, len, z1, false);
      vert(x2, len, z2, false);
      vert(0, 0, 0, true);
      vert(x2, len, z2, false);
      vert(0, len, z3, false);
      vert(0, 0, 0, true);
      vert(0, len, z3, false);
      vert(x1, len, z1, false);
    }
    pose.pop();
  }

  /**
   * vanilla DragonFireballRenderer: its sprite, 2 blocks across, facing the camera, glowing (block light 15),
   * cut out and double sided
   */
  renderFireball(b: EntityBatch, pose: PoseStack, dx: number, dy: number, dz: number, cam: Camera): void {
    if (!this.fireballTex) this.fireballTex = upload(this.gl, dragonFireballTexture());
    b.setOverlay(0, 0, 0, 0);
    b.lightB = 240;
    b.begin({ texture: this.fireballTex, cutoff: 0.1, blend: false, cull: false, lit: true, useLightmap: true });
    pose.reset();
    pose.translate(dx, dy, dz);
    pose.scale(2, 2, 2);
    pose.rotY(180 - cam.yaw);
    pose.rotX(-cam.pitch);
    b.quad(pose, [-0.5, -0.25, 0, 0.5, -0.25, 0, 0.5, 0.75, 0, -0.5, 0.75, 0], [0, 1, 1, 1, 1, 0, 0, 0], 0, 1, 0);
  }
}
