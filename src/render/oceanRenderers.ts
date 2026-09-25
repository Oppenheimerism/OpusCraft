// The ocean's renderers (Stage 5: ocean): vanilla GuardianRenderer and ElderGuardianRenderer (2.35 times as big)
// with GuardianModel — the eye rolling toward whoever the guardian is looking at, the tail swishing faster as it
// swims, the spikes drawn in while it swims and pushed out while it idles — the laser from its eye to its target,
// and the elder guardian's ghostly face (vanilla MobAppearanceParticle) looming up before a player it curses; the
// fish, the dolphin and the glow squid are ./fishRenderers', the conduit ./conduitRenderer's. The steps every living
// renderer shares are the dispatcher's, lent through LivingKit.

import type { EntityBatch } from './entityRenderer';
import type { GL } from './gl';
import { createTexture } from './gl';
import { ModelPart, type Cube } from './model';
import type { MobModelDef } from './mobModels';
import type { LivingKit, LivingAnim } from './illagerRenderers';
import type { Camera } from './renderer';
import type { Mob } from '../entity/mob';
import type { LivingEntity } from '../entity/living';
import type { Level } from '../game/level';
import { Guardian, ElderGuardian } from '../entity/guardian';
import { elderAppearance } from '../game/ocean';
import { MOB_TEXTURES } from '../textures/mobs';
import '../textures/guardian';
import { FishRenderers, FISH_SHADOW_RADII } from './fishRenderers';
import { ConduitRenderer } from './conduitRenderer';

const PI = Math.PI;
const RAD = PI / 180;

/** vanilla shadow radii (GuardianRenderer 0.5, ElderGuardianRenderer 1.2; the fish's, the dolphin's and the glow squid's) */
export const OCEAN_SHADOW_RADII: Record<string, number> = { guardian: 0.5, elder_guardian: 1.2, ...FISH_SHADOW_RADII };

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

// ---------------------------------------------------------------------------
// vanilla GuardianModel (64x64)

const SPIKE_X_ROT = [1.75, 0.25, 0, 0, 0.5, 0.5, 0.5, 0.5, 1.25, 0.75, 0, 0];
const SPIKE_Y_ROT = [0, 0, 0, 0, 0.25, 1.75, 1.25, 0.75, 0, 0, 0, 0];
const SPIKE_Z_ROT = [0, 0, 0.25, 1.75, 0, 0, 0, 0, 0, 0, 0.75, 1.25];
const SPIKE_X = [0, 0, 8, -8, -8, 8, 8, -8, 0, 0, 8, -8];
const SPIKE_Y = [-8, -8, -8, -8, 0, 0, 0, 0, 8, 8, 8, 8];
const SPIKE_Z = [8, -8, 0, 0, -8, -8, 8, 8, 8, -8, 0, 0];

/** vanilla getSpikeOffset: a faint quiver, and `offset` in toward the body */
function spikeOffset(i: number, age: number, offset: number): number {
  return 1 + Math.cos(age * 1.5 + i) * 0.01 - offset;
}

/** vanilla GuardianModel.createBodyLayer: the body with its four plates, twelve spikes, the eye, a three-part tail */
export function guardianModel(): MobModelDef {
  const root = new ModelPart();
  const head = root.add('head', part([
    { x: -6, y: 10, z: -8, w: 12, h: 12, d: 16, u: 0, v: 0 },
    { x: -8, y: 10, z: -6, w: 2, h: 12, d: 12, u: 0, v: 28 },
    { x: 6, y: 10, z: -6, w: 2, h: 12, d: 12, u: 0, v: 28, mirror: true },
    { x: -6, y: 8, z: -6, w: 12, h: 2, d: 12, u: 16, v: 40 },
    { x: -6, y: 22, z: -6, w: 12, h: 2, d: 12, u: 16, v: 40 },
  ]));
  for (let i = 0; i < 12; i++) {
    const o = spikeOffset(i, 0, 0);
    head.add(`spike${i}`, part([{ x: -1, y: -4.5, z: -1, w: 2, h: 9, d: 2, u: 0, v: 0 }], [SPIKE_X[i] * o, 16 + SPIKE_Y[i] * o, SPIKE_Z[i] * o], [PI * SPIKE_X_ROT[i], PI * SPIKE_Y_ROT[i], PI * SPIKE_Z_ROT[i]]));
  }
  head.add('eye', part([{ x: -1, y: 15, z: 0, w: 2, h: 2, d: 1, u: 8, v: 0 }], [0, 0, -8.25]));
  const tail0 = head.add('tail0', part([{ x: -2, y: 14, z: 7, w: 4, h: 4, d: 8, u: 40, v: 0 }]));
  const tail1 = tail0.add('tail1', part([{ x: 0, y: 14, z: 0, w: 3, h: 3, d: 7, u: 0, v: 54 }], [-1.5, 0.5, 14]));
  tail1.add('tail2', part([
    { x: 0, y: 14, z: 0, w: 2, h: 2, d: 6, u: 41, v: 32 },
    { x: 1, y: 10.5, z: 3, w: 1, h: 9, d: 9, u: 25, v: 19 },
  ], [0.5, 0.5, 6]));
  return { root, texW: 64, texH: 64 };
}

/** vanilla GuardianModel.setupAnim */
export function animateGuardian(root: ModelPart, g: Guardian, a: LivingAnim, p: number): void {
  const head = root.child('head');
  head.yRot = a.headYaw * RAD;
  head.xRot = a.headPitch * RAD;
  // the spikes: out while it idles, in as it swims (vanilla setupSpikes)
  const off = (1 - g.spikesAnimationAt(p)) * 0.55;
  for (let i = 0; i < 12; i++) {
    const s = head.child(`spike${i}`), o = spikeOffset(i, a.age, off);
    s.x = SPIKE_X[i] * o;
    s.y = 16 + SPIKE_Y[i] * o;
    s.z = SPIKE_Z[i] * o;
  }
  // the eye: on its laser's target, else on the camera's entity (the player) — up if that's above it, and across
  // as far as it's off to one side of where the guardian faces (vanilla takes both where they were last tick)
  const eye = head.child('eye');
  const t: LivingEntity | null = g.activeAttackTarget() ?? g.level.player ?? null;
  if (t) {
    const tx = t.lerpX(0), ty = t.lerpY(0) + t.eyeHeight, tz = t.lerpZ(0);
    const gx = g.lerpX(0), gy = g.lerpY(0) + g.eyeHeight, gz = g.lerpZ(0);
    eye.y = ty - gy > 0 ? 0 : 1;
    const yaw = g.headYawO * RAD, pitch = g.pitchO * RAD;
    const vx = -Math.sin(yaw) * Math.cos(pitch), vz = Math.cos(yaw) * Math.cos(pitch);
    let sx = gx - tx, sz = gz - tz;
    const len = Math.sqrt(sx * sx + sz * sz);
    if (len < 1e-4) sx = sz = 0;
    else {
      sx /= len;
      sz /= len;
    }
    // (Vec3.yRot(π/2): (x, z) → (z, -x))
    const d1 = vx * sz - vz * sx;
    eye.x = Math.sqrt(Math.abs(d1)) * 2 * Math.sign(d1);
  }
  eye.visible = true;
  const f = Math.sin(g.tailAnimationAt(p)) * PI;
  const t0 = head.child('tail0'), t1 = t0.child('tail1'), t2 = t1.child('tail2');
  t0.yRot = f * 0.05;
  t1.yRot = f * 0.1;
  t2.yRot = f * 0.15;
}

// ---------------------------------------------------------------------------

export class OceanRenderers {
  private readonly guardian = guardianModel();
  /** (a model of its own for the ghost, never animated: vanilla's particle bakes a fresh one) */
  private readonly ghost = guardianModel();
  private beamTex: WebGLTexture | null = null;
  private readonly fish: FishRenderers;
  private readonly conduits: ConduitRenderer;

  constructor(private readonly gl: GL, private readonly kit: LivingKit) {
    this.fish = new FishRenderers(kit);
    this.conduits = new ConduitRenderer(kit);
  }

  /** draws `e` if it's one of these renderers' mobs (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (!(e instanceof Guardian)) return this.fish.render(b, e, dx, dy, dz, p);
    this.renderGuardian(b, e, dx, dy, dz, p);
    return true;
  }

  /** vanilla GuardianRenderer.render: the body, then the laser if it has a target */
  private renderGuardian(b: EntityBatch, g: Guardian, dx: number, dy: number, dz: number, p: number): void {
    const kit = this.kit, def = this.guardian;
    const elder = g instanceof ElderGuardian;
    const tex = kit.tex(elder ? 'elder_guardian' : 'guardian');
    if (!tex) return;
    // (vanilla ElderGuardianRenderer.scale)
    const a = kit.setupLiving(g, dx, dy, dz, p, 90, elder ? (pose) => pose.scale(2.35, 2.35, 2.35) : undefined);
    animateGuardian(def.root, g, a, p);
    kit.overlay(b, g);
    kit.drawBody(b, g, def, tex, false);
    b.setOverlay(0, 0, 0, 0);
    const t = g.activeAttackTarget();
    if (t) this.renderBeam(b, g, t, dx, dy, dz, p);
  }

  private beamTexture(): WebGLTexture {
    if (!this.beamTex) {
      const im = MOB_TEXTURES.guardian_beam();
      // (the beam's texture runs on down it: it wraps)
      this.beamTex = createTexture(this.gl, im.w, im.h, new Uint8Array(im.data.buffer, im.data.byteOffset, im.data.byteLength), { clamp: false });
    }
    return this.beamTex;
  }

  /**
   * vanilla GuardianRenderer's beam: two crossed strips from the eye to the middle of the target (a block past it),
   * twisting as they go, their texture running down them; purple while it charges, yellowing as it nears the end
   * (the square of how far it's charged); a cap on the end flickering between two frames; lit by its own light
   */
  private renderBeam(b: EntityBatch, g: Guardian, t: LivingEntity, dx: number, dy: number, dz: number, p: number): void {
    const f = g.attackAnimationScale(p);
    const f1 = g.attackTime + p;
    const f2 = (f1 * 0.5) % 1;
    const eyeH = g.eyeHeight;
    const pose = this.kit.pose;
    pose.reset();
    pose.translate(dx, dy + eyeH, dz);
    let vx = t.lerpX(p) - g.lerpX(p), vy = t.lerpY(p) + t.height * 0.5 - (g.lerpY(p) + eyeH), vz = t.lerpZ(p) - g.lerpZ(p);
    const d = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const len = d + 1;
    if (d >= 1e-4) {
      vx /= d;
      vy /= d;
      vz /= d;
    } else vx = vy = vz = 0;
    pose.rotY((PI / 2 - Math.atan2(vz, vx)) / RAD);
    pose.rotX(Math.acos(vy) / RAD);
    const f7 = f1 * 0.05 * -1.5;
    const f8 = f * f;
    const r = (64 + Math.floor(f8 * 191)) / 255, gr = (32 + Math.floor(f8 * 191)) / 255, bl = (128 - Math.floor(f8 * 64)) / 255;
    const cx = (a: number, rad: number) => Math.cos(f7 + a) * rad, cz = (a: number, rad: number) => Math.sin(f7 + a) * rad;
    const f29 = -1 + f2, f30 = len * 2.5 + f29;
    const oldB = b.lightB, oldS = b.lightS;
    b.lightB = b.lightS = 240;
    b.setOverlay(0, 0, 0, 0);
    // (vanilla entityCutoutNoCull)
    b.begin(this.kit.state(this.beamTexture(), { cull: false }));
    const strip = (a0: number, a1: number) =>
      b.quad(pose, [cx(a0, 0.2), len, cz(a0, 0.2), cx(a0, 0.2), 0, cz(a0, 0.2), cx(a1, 0.2), 0, cz(a1, 0.2), cx(a1, 0.2), len, cz(a1, 0.2)], [0.4999, f30, 0.4999, f29, 0, f29, 0, f30], 0, 1, 0, r, gr, bl, 1);
    strip(PI, 0);
    strip(PI / 2, (PI * 3) / 2);
    const f31 = g.tickCount % 2 === 0 ? 0.5 : 0;
    const c = 0.282;
    b.quad(
      pose,
      [cx((PI * 3) / 4, c), len, cz((PI * 3) / 4, c), cx(PI / 4, c), len, cz(PI / 4, c), cx((PI * 7) / 4, c), len, cz((PI * 7) / 4, c), cx((PI * 5) / 4, c), len, cz((PI * 5) / 4, c)],
      [0.5, f31 + 0.5, 1, f31 + 0.5, 1, f31, 0.5, f31],
      0, 1, 0, r, gr, bl, 1,
    );
    b.lightB = oldB;
    b.lightS = oldS;
  }

  /**
   * vanilla MobAppearanceParticle (the elder guardian's): for a second and a half, the elder's face swoops down past
   * the camera from above, fixed to the view, fading in and out, lit by its own light; the model as it was made
   */
  renderAppearance(b: EntityBatch, level: Level, cam: Camera, partial: number): void {
    // (first the conduits, which are drawn here, after the entities, like the other block entities: ./conduitRenderer)
    this.conduits.render(b, level, cam, partial);
    const ap = elderAppearance;
    if (ap.level !== level || ap.start < 0) return;
    const age = level.gameTime - ap.start;
    if (age < 0 || age > 30) return;
    const tex = this.kit.tex('elder_guardian');
    if (!tex) return;
    const f = (age + partial) / 30;
    const alpha = 0.05 + 0.5 * Math.sin(f * PI);
    const pose = this.kit.pose;
    pose.reset();
    // vanilla Camera.rotation(): rotationYXZ(π - yaw, -pitch, 0)
    pose.rotY(180 - cam.yaw);
    pose.rotX(-cam.pitch);
    pose.rotX(60 - 150 * f);
    pose.scale(1, -1, -1);
    pose.translate(0, -1.101, 1.5);
    const oldB = b.lightB, oldS = b.lightS;
    b.lightB = b.lightS = 240;
    b.setOverlay(0, 0, 0, 0);
    const oldC = b.color;
    b.color = [1, 1, 1, alpha];
    // (vanilla entityTranslucent)
    b.begin(this.kit.state(tex, { blend: true, cutoff: 0.01 }));
    this.ghost.root.render(b, pose, 64, 64);
    b.flush();
    b.color = oldC;
    b.lightB = oldB;
    b.lightS = oldS;
  }
}
