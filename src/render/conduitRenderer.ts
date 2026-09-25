// vanilla ConduitRenderer (Stage 5: ocean; block entity view distance 64), drawn with the entity batch after the
// entities: asleep, the closed shell (turned a hair by how long it has been awake: vanilla takes that turn's radians
// as degrees there); awake, the open cage bobbing up and down and turning about a slanted axis, the current swirling
// round it (which way it swirls switching every 66 ticks, as its animation comes round), a second, smaller swirl the
// other way up inside it, and the eye in the cage turned to the camera, open while it hunts.

import type { EntityBatch, PoseStack } from './entityRenderer';
import { ModelPart } from './model';
import type { LivingKit } from './illagerRenderers';
import type { Camera } from './renderer';
import type { Level } from '../game/level';
import { ConduitBlockEntity } from '../game/conduit';
import { WIND_FRAMES, WIND_FRAME_TICKS } from '../textures/conduit';

/** vanilla BlockEntityRenderer.getViewDistance */
const VIEW_DISTANCE = 64;

/** vanilla ConduitRenderer's cage axis: (0.5, 1, 0.5), normalized */
const AXIS = [0.5 / Math.sqrt(1.5), 1 / Math.sqrt(1.5), 0.5 / Math.sqrt(1.5)];

/** vanilla Quaternionf.rotationAxis, multiplied onto the pose: `rad` about the unit axis (x, y, z) */
function rotAxis(pose: PoseStack, rad: number, x: number, y: number, z: number): void {
  const c = Math.cos(rad), s = Math.sin(rad), t = 1 - c;
  const r00 = t * x * x + c, r01 = t * x * y - s * z, r02 = t * x * z + s * y;
  const r10 = t * x * y + s * z, r11 = t * y * y + c, r12 = t * y * z - s * x;
  const r20 = t * x * z - s * y, r21 = t * y * z + s * x, r22 = t * z * z + c;
  const a = pose.m;
  for (let i = 0; i < 4; i++) {
    const ai = a[i], aj = a[4 + i], ak = a[8 + i];
    a[i] = ai * r00 + aj * r10 + ak * r20;
    a[4 + i] = ai * r01 + aj * r11 + ak * r21;
    a[8 + i] = ai * r02 + aj * r12 + ak * r22;
  }
}

export class ConduitRenderer {
  /** vanilla createShellLayer (32x16) */
  private readonly shell = new ModelPart([{ x: -3, y: -3, z: -3, w: 6, h: 6, d: 6, u: 0, v: 0 }]);
  /** vanilla createCageLayer (32x16) */
  private readonly cage = new ModelPart([{ x: -4, y: -4, z: -4, w: 8, h: 8, d: 8, u: 0, v: 0 }]);
  /** vanilla createWindLayer (64x32) */
  private readonly wind = new ModelPart([{ x: -8, y: -8, z: -8, w: 16, h: 16, d: 16, u: 0, v: 0 }]);
  /** vanilla createEyeLayer (16x16): a flat square, a hair thick */
  private readonly eye = new ModelPart([{ x: -4, y: -4, z: 0, w: 8, h: 8, d: 0, u: 0, v: 0, inflate: 0.01 }]);

  constructor(private readonly kit: LivingKit) {}

  /** every conduit in view, lit by the light where it is (its own) */
  render(b: EntityBatch, level: Level, cam: Camera, partial: number): void {
    let drawn = false;
    const oldB = b.lightB, oldS = b.lightS;
    for (const be of level.world.blockEntities.values()) {
      if (!(be instanceof ConduitBlockEntity) || be.removed) continue;
      const dx = be.x - cam.x, dy = be.y - cam.y, dz = be.z - cam.z;
      if ((dx + 0.5) ** 2 + (dy + 0.5) ** 2 + (dz + 0.5) ** 2 > VIEW_DISTANCE * VIEW_DISTANCE) continue;
      if (!drawn) b.setOverlay(0, 0, 0, 0);
      drawn = true;
      const l = level.world.getLight(be.x, be.y, be.z);
      b.lightS = (l >> 4) * 16;
      b.lightB = (l & 15) * 16;
      this.renderConduit(b, be, dx, dy, dz, cam, partial);
    }
    if (!drawn) return;
    b.flush();
    b.lightB = oldB;
    b.lightS = oldS;
  }

  /** vanilla ConduitRenderer.render */
  private renderConduit(b: EntityBatch, be: ConduitBlockEntity, dx: number, dy: number, dz: number, cam: Camera, partial: number): void {
    const kit = this.kit, pose = kit.pose;
    if (!be.active) {
      const tex = kit.tex('conduit_base');
      if (!tex) return;
      // (vanilla entitySolid)
      b.begin(kit.state(tex, { cull: true }));
      pose.reset();
      pose.translate(dx + 0.5, dy + 0.5, dz + 0.5);
      pose.rotY(be.activeRotationAt(0));
      this.shell.render(b, pose, 32, 16);
      return;
    }
    const f = be.tickCount + partial;
    const turn = be.activeRotationAt(partial);
    let bob = Math.sin(f * 0.1) / 2 + 0.5;
    bob = bob * bob + bob;
    // the cage (vanilla entityCutoutNoCull, as the rest)
    const cageTex = kit.tex('conduit_cage');
    if (cageTex) {
      b.begin(kit.state(cageTex));
      pose.reset();
      pose.translate(dx + 0.5, dy + 0.3 + bob * 0.2, dz + 0.5);
      rotAxis(pose, turn, AXIS[0], AXIS[1], AXIS[2]);
      this.cage.render(b, pose, 32, 16);
    }
    // the current: flat, on its side (the vertical texture), or on its end, and a smaller one inside it upside down
    const way = Math.floor(be.tickCount / 66) % 3;
    const frame = Math.floor(be.tickCount / WIND_FRAME_TICKS) % WIND_FRAMES;
    const windTex = kit.tex(way === 1 ? `conduit_wind_vertical_${frame}` : `conduit_wind_${frame}`);
    if (windTex) {
      b.begin(kit.state(windTex));
      pose.reset();
      pose.translate(dx + 0.5, dy + 0.5, dz + 0.5);
      if (way === 1) pose.rotX(90);
      else if (way === 2) pose.rotZ(90);
      this.wind.render(b, pose, 64, 32);
      pose.reset();
      pose.translate(dx + 0.5, dy + 0.5, dz + 0.5);
      pose.scale(0.875, 0.875, 0.875);
      pose.rotX(180);
      pose.rotZ(180);
      this.wind.render(b, pose, 64, 32);
    }
    // the eye, bobbing with the cage, turned to the camera (vanilla rotationYXZ(-yaw, pitch, π))
    const eyeTex = kit.tex(be.hunting ? 'conduit_open_eye' : 'conduit_closed_eye');
    if (eyeTex) {
      b.begin(kit.state(eyeTex));
      pose.reset();
      pose.translate(dx + 0.5, dy + 0.3 + bob * 0.2, dz + 0.5);
      pose.scale(0.5, 0.5, 0.5);
      pose.rotY(-cam.yaw);
      pose.rotX(cam.pitch);
      pose.rotZ(180);
      pose.scale(4 / 3, 4 / 3, 4 / 3);
      this.eye.render(b, pose, 16, 16);
    }
  }
}
