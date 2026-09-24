// Item frames on screen (vanilla ItemFrameRenderer): the frame's block model (block/template_item_frame, or
// template_item_frame_map with a map in it: a birch moulding round a leather back) turned to the face it hangs on, then
// what it holds just in front of the back, turned by its eighths — an item at half size (its "fixed" display), a map
// across the whole frame with the markers a frame shows. A glow frame lights what it holds as if in full light (a map
// a little less) and is itself never darker than block light 5. An invisible frame draws only what it holds, flat on
// the wall.

import type { GL } from './gl';
import { createTexture } from './gl';
import { EntityBatch, PoseStack, type DrawState } from './entityRenderer';
import type { ItemRenderer } from './itemRenderer';
import { MapRenderer } from './mapRenderer';
import { bakeVariant, type BakedModel, type ModelDef, type ElementDef, type SpriteRect } from '../world/models';
import { DX, DY, DZ } from '../world/dir';
import type { ItemFrame, ItemFrameType } from '../entity/itemFrame';
import { itemFrameSheet } from '../textures/itemFrame';
import { viewedMapData } from '../game/maps';

type UV = [number, number, number, number];

/** one wooden bar of the moulding: `faces` the uv of each face on the birch planks */
function bar(from: [number, number, number], to: [number, number, number], faces: Partial<Record<'down' | 'up' | 'north' | 'south' | 'west' | 'east', UV>>): ElementDef {
  const f: ElementDef['faces'] = {};
  for (const [d, uv] of Object.entries(faces)) f[d as keyof typeof faces] = { tex: 'wood', uv };
  return { from, to, faces: f };
}

/** vanilla block/template_item_frame.json: the back a half pixel thick, the moulding a pixel all round it */
function frameModel(): ModelDef {
  return {
    ao: false,
    particle: 'wood',
    elements: [
      { from: [3, 3, 15.5], to: [13, 13, 16], faces: { north: { tex: 'back', uv: [3, 3, 13, 13] }, south: { tex: 'back', uv: [3, 3, 13, 13] } } },
      bar([2, 2, 15], [14, 3, 16], { down: [2, 0, 14, 1], up: [2, 15, 14, 16], north: [2, 13, 14, 14], south: [2, 13, 14, 14], west: [15, 13, 16, 14], east: [0, 13, 1, 14] }),
      bar([2, 13, 15], [14, 14, 16], { down: [2, 0, 14, 1], up: [2, 15, 14, 16], north: [2, 2, 14, 3], south: [2, 2, 14, 3], west: [15, 2, 16, 3], east: [0, 2, 1, 3] }),
      bar([2, 3, 15], [3, 13, 16], { north: [13, 3, 14, 13], south: [2, 3, 3, 13], west: [15, 3, 16, 13], east: [0, 3, 1, 13] }),
      bar([13, 3, 15], [14, 13, 16], { north: [2, 3, 3, 13], south: [13, 3, 14, 13], west: [15, 3, 16, 13], east: [0, 3, 1, 13] }),
    ],
  };
}

/** vanilla block/template_item_frame_map.json: the whole block across, a hair less than a pixel deep */
function mapFrameModel(): ModelDef {
  const z = 15.001;
  return {
    ao: false,
    particle: 'wood',
    elements: [
      { from: [1, 1, z], to: [15, 15, 16], faces: { north: { tex: 'back', uv: [1, 1, 15, 15] }, south: { tex: 'back', uv: [1, 1, 15, 15] } } },
      bar([0, 0, z], [16, 1, 16], { down: [0, 0, 16, 1], up: [0, 15, 16, 16], north: [0, 15, 16, 16], south: [0, 15, 16, 16], west: [15, 15, 16, 16], east: [0, 15, 1, 16] }),
      bar([0, 15, z], [16, 16, 16], { down: [0, 0, 16, 1], up: [0, 15, 16, 16], north: [0, 0, 16, 1], south: [0, 0, 16, 1], west: [15, 0, 16, 1], east: [0, 0, 1, 1] }),
      bar([0, 1, z], [1, 15, 16], { north: [15, 1, 16, 15], south: [0, 1, 1, 15], west: [15, 1, 16, 15], east: [0, 1, 1, 15] }),
      bar([15, 1, z], [16, 15, 16], { north: [0, 1, 1, 15], south: [15, 1, 16, 15], west: [15, 1, 16, 15], east: [0, 1, 1, 15] }),
    ],
  };
}

/** where each texture sits on the frames' sheet (textures/itemFrame.ts): birch, the back, the glow back */
function sheetSprites(glow: boolean): (name: string) => SpriteRect {
  const cell = (i: number): SpriteRect => ({ u0: i / 3, v0: 0, u1: (i + 1) / 3, v1: 1 });
  return (name) => cell(name === 'wood' ? 0 : glow ? 2 : 1);
}

const FACE_NORMALS = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];

/** vanilla LightTexture.FULL_BRIGHT (15728880) and the glow frame's map light (15728850: sky 15, block 13) */
const FULL_BRIGHT = 240;
const GLOW_MAP_BLOCK = 0xd2;

export class ItemFrameRenderer {
  private tex: WebGLTexture | null = null;
  private readonly pose = new PoseStack();
  private readonly models: Record<ItemFrameType, { plain: BakedModel; map: BakedModel }>;
  /** its own map drawer (the hand's keeps its own textures) */
  private maps: MapRenderer | null = null;

  constructor(private readonly gl: GL, private readonly items: ItemRenderer) {
    const bake = (m: ModelDef, glow: boolean) => bakeVariant({ model: m }, sheetSprites(glow));
    this.models = {
      item_frame: { plain: bake(frameModel(), false), map: bake(mapFrameModel(), false) },
      glow_item_frame: { plain: bake(frameModel(), true), map: bake(mapFrameModel(), true) },
    };
  }

  private texture(): WebGLTexture {
    if (!this.tex) {
      const t = itemFrameSheet();
      this.tex = createTexture(this.gl, t.w, t.h, new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength));
    }
    return this.tex;
  }

  /** vanilla RenderType.entitySolid on the block atlas (Sheets.solidBlockSheet): lit by the faces' normals */
  private state(): DrawState {
    return { texture: this.texture(), cutoff: -1, blend: false, cull: true, lit: true, useLightmap: true };
  }

  /**
   * vanilla ItemFrameRenderer.render, (dx, dy, dz) its position from the camera, the batch's light already the frame's
   * (a glow frame's raised to block light 5)
   */
  render(b: EntityBatch, e: ItemFrame, dx: number, dy: number, dz: number): void {
    if (e.glow) b.lightB = Math.max(b.lightB, 5 * 16);
    const pose = this.pose;
    pose.reset();
    pose.translate(dx, dy, dz);
    // back to the middle of the block it hangs in, then turned to face its way
    const d = e.direction;
    pose.translate(DX[d] * 0.46875, DY[d] * 0.46875, DZ[d] * 0.46875);
    pose.rotX(e.pitch);
    pose.rotY(180 - e.yaw);
    const stack = e.item;
    const isMap = stack?.item.id === 'filled_map';
    b.setOverlay(0, 0, 0, 0);
    if (!e.invisible) {
      pose.push();
      pose.translate(-0.5, -0.5, -0.5);
      b.begin(this.state());
      const m = this.models[e.type][isMap ? 'map' : 'plain'];
      for (const q of m.quads) {
        const n = FACE_NORMALS[q.dir];
        b.quad(pose, Array.from(q.pos), Array.from(q.uv), n[0], n[1], n[2]);
      }
      pose.pop();
    }
    if (!stack) return;
    const mapId = isMap ? stack.tag?.mapId : undefined;
    pose.translate(0, 0, e.invisible ? 0.5 : 0.4375);
    // (a map turns a quarter for every two of the frame's eighths)
    const j = mapId !== undefined ? (e.rotation % 4) * 2 : e.rotation;
    pose.rotZ((j * 360) / 8);
    const lightS = b.lightS, lightB = b.lightB;
    if (mapId !== undefined) {
      pose.rotZ(180);
      pose.scale(0.0078125, 0.0078125, 0.0078125);
      pose.translate(-64, -64, 0);
      pose.translate(0, 0, -1);
      const data = viewedMapData(stack);
      if (data) {
        if (e.glow) {
          b.lightS = FULL_BRIGHT;
          b.lightB = GLOW_MAP_BLOCK;
        }
        (this.maps ??= new MapRenderer(this.gl)).draw(b, pose, data, true);
      }
    } else {
      if (e.glow) b.lightS = b.lightB = FULL_BRIGHT;
      pose.scale(0.5, 0.5, 0.5);
      this.items.render(b, pose, stack, 'fixed');
    }
    b.lightS = lightS;
    b.lightB = lightB;
  }
}
