// Block entity renderers of the village blocks: vanilla BellRenderer (the bell under its frame, swinging after a
// ring). Drawn with the entity batch after the entities, like the spawner's mob and the enchanting table's book.

import type { GL } from './gl';
import { createTexture } from './gl';
import { EntityBatch, PoseStack, type DrawState } from './entityRenderer';
import { ModelPart } from './model';
import type { Camera } from './renderer';
import type { Frustum } from '../core/math';
import type { Level } from '../game/level';
import { BellBlockEntity } from '../world/blockEntity';
import { NORTH, SOUTH, WEST, EAST } from '../world/dir';
import { bellBodyTexture } from '../textures/bellBody';
import type { TexImage } from '../textures/tex';

/** vanilla BlockEntityRenderer.getViewDistance */
const VIEW_DISTANCE = 64;

interface BellModel {
  root: ModelPart;
  body: ModelPart;
}

/** vanilla BellRenderer.createBodyLayer (32x32) */
export function bellModel(): BellModel {
  const root = new ModelPart();
  const body = root.add('bell_body', new ModelPart([{ x: -3, y: -6, z: -3, w: 6, h: 7, d: 6, u: 0, v: 0 }], [8, 12, 8]));
  body.add('bell_base', new ModelPart([{ x: 4, y: 4, z: 4, w: 8, h: 2, d: 8, u: 0, v: 13 }], [-8, -12, -8]));
  return { root, body };
}

/** vanilla BellRenderer.render: tipped away from the struck side, a swing that dies down over its 50 ticks */
export function renderBell(b: EntityBatch, pose: PoseStack, m: BellModel, be: BellBlockEntity, dx: number, dy: number, dz: number, partial: number): void {
  let xRot = 0, zRot = 0;
  if (be.shaking) {
    const f = be.ticks + partial;
    const swing = Math.sin(f / Math.PI) / (4 + f / 3);
    if (be.clickDirection === NORTH) xRot = -swing;
    else if (be.clickDirection === SOUTH) xRot = swing;
    else if (be.clickDirection === EAST) zRot = -swing;
    else if (be.clickDirection === WEST) zRot = swing;
  }
  m.body.xRot = xRot;
  m.body.zRot = zRot;
  pose.reset();
  pose.translate(dx, dy, dz);
  m.root.render(b, pose, 32, 32);
}

function upload(gl: GL, t: TexImage): WebGLTexture {
  return createTexture(gl, t.w, t.h, new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength));
}

export class VillageBlockRenderers {
  private readonly pose = new PoseStack();
  private readonly bell = bellModel();
  private bellTex: WebGLTexture | null = null;

  constructor(private readonly gl: GL) {}

  private state(tex: WebGLTexture): DrawState {
    return { texture: tex, cutoff: 0.1, blend: false, cull: false, lit: true, useLightmap: true };
  }

  render(b: EntityBatch, level: Level, cam: Camera, partial: number, frustum: Frustum): void {
    for (const be of level.world.blockEntities.values()) {
      if (be.removed || !(be instanceof BellBlockEntity)) continue;
      const dx = be.x - cam.x, dy = be.y - cam.y, dz = be.z - cam.z;
      if ((dx + 0.5) ** 2 + (dy + 0.5) ** 2 + (dz + 0.5) ** 2 > VIEW_DISTANCE * VIEW_DISTANCE) continue;
      if (!frustum.testBox(dx, dy, dz, dx + 1, dy + 1, dz + 1)) continue;
      const l = level.world.getLight(be.x, be.y, be.z);
      b.lightS = (l >> 4) * 16;
      b.lightB = (l & 15) * 16;
      b.setOverlay(0, 0, 0, 0);
      this.bellTex ??= upload(this.gl, bellBodyTexture());
      b.begin(this.state(this.bellTex));
      renderBell(b, this.pose, this.bell, be, dx, dy, dz, partial);
    }
  }
}
