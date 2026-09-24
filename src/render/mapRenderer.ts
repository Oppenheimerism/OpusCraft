// Maps as the game draws them (vanilla MapRenderer, and ItemInHandRenderer.renderMap): the paper, the map's picture as
// a 128×128 texture kept up to date with its colours, and its markers — each a little quad turned to face its way.
// Drawn like text (vanilla RenderType.text): lit only by the light where it is, see-through where nothing's drawn.

import type { GL } from './gl';
import { createTexture } from './gl';
import type { EntityBatch, PoseStack } from './entityRenderer';
import type { ItemStack } from '../item/item';
import { MAP_SIZE, DECORATION_TYPES, type MapItemSavedData, type DecorationType } from '../game/mapData';
import { viewedMapData } from '../game/maps';
import { mapRGBA } from '../world/mapColors';
import { mapBackground, decorationAtlas, MAP_BACKGROUND_SIZE } from '../textures/mapTextures';
import type { TexImage } from '../textures/tex';

interface MapTexture {
  tex: WebGLTexture;
  version: number;
  used: number;
}

/** textures kept for this many maps at most (the least recently drawn go first) */
const MAX_TEXTURES = 64;

export class MapRenderer {
  private readonly background: WebGLTexture;
  private readonly checkerboard: WebGLTexture;
  private readonly icons: WebGLTexture;
  private readonly iconUV: Record<DecorationType, [number, number, number, number]>;
  private readonly textures = new Map<MapItemSavedData, MapTexture>();
  private frame = 0;

  constructor(private readonly gl: GL) {
    const n = MAP_BACKGROUND_SIZE;
    const bytes = (t: TexImage) => new Uint8Array(t.data.buffer);
    this.background = createTexture(gl, n, n, bytes(mapBackground(false)));
    this.checkerboard = createTexture(gl, n, n, bytes(mapBackground(true)));
    const a = decorationAtlas();
    this.icons = createTexture(gl, a.tex.w, a.tex.h, bytes(a.tex));
    this.iconUV = a.uv;
  }

  /** the map's picture, uploaded again when its colours have changed */
  private texture(d: MapItemSavedData): WebGLTexture {
    const gl = this.gl;
    let t = this.textures.get(d);
    if (!t) {
      if (this.textures.size >= MAX_TEXTURES) {
        let oldest: MapItemSavedData | null = null;
        for (const [k, v] of this.textures) if (!oldest || v.used < this.textures.get(oldest)!.used) oldest = k;
        if (oldest) {
          gl.deleteTexture(this.textures.get(oldest)!.tex);
          this.textures.delete(oldest);
        }
      }
      t = { tex: createTexture(gl, MAP_SIZE, MAP_SIZE, mapRGBA(d.colors)), version: d.colorVersion, used: 0 };
      this.textures.set(d, t);
    } else if (t.version !== d.colorVersion) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAP_SIZE, MAP_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, mapRGBA(d.colors));
      t.version = d.colorVersion;
    }
    t.used = ++this.frame;
    return t.tex;
  }

  /**
   * vanilla ItemInHandRenderer.renderMap: turned to face the viewer, 0.38 across, the paper reaching 7 map pixels past
   * the picture on each side; the plain paper for a map with no data, the checked one under a picture
   */
  renderMap(batch: EntityBatch, pose: PoseStack, stack: ItemStack): void {
    pose.rotY(180);
    pose.rotZ(180);
    pose.scale(0.38, 0.38, 0.38);
    pose.translate(-0.5, -0.5, 0);
    pose.scale(0.0078125, 0.0078125, 0.0078125);
    const d = viewedMapData(stack);
    batch.begin(textState(d ? this.checkerboard : this.background));
    batch.quad(pose, [-7, 135, 0, 135, 135, 0, 135, -7, 0, -7, -7, 0], [0, 1, 1, 1, 1, 0, 0, 0], 0, 0, -1);
    if (d) this.draw(batch, pose, d, false);
  }

  /**
   * vanilla MapRenderer.MapInstance.draw: the picture over (0, 0)..(128, 128), then each marker (`active`: only those an
   * item frame shows) at its half-pixel place, turned by its sixteenths, 8 pixels across
   */
  draw(batch: EntityBatch, pose: PoseStack, d: MapItemSavedData, active: boolean): void {
    batch.begin(textState(this.texture(d)));
    batch.quad(pose, [0, 128, -0.01, 128, 128, -0.01, 128, 0, -0.01, 0, 0, -0.01], [0, 1, 1, 1, 1, 0, 0, 0], 0, 0, -1);
    let k = 0;
    for (const dec of d.decorations.values()) {
      if (active && !DECORATION_TYPES[dec.type].showOnItemFrame) continue;
      pose.push();
      pose.translate(dec.x / 2 + 64, dec.y / 2 + 64, -0.02);
      pose.rotZ((dec.rot * 360) / 16);
      pose.scale(4, 4, 3);
      pose.translate(-0.125, 0.125, 0);
      const [u0, v0, u1, v1] = this.iconUV[dec.type];
      const z = k * -0.001;
      batch.begin(textState(this.icons));
      batch.quad(pose, [-1, 1, z, 1, 1, z, 1, -1, z, -1, -1, z], [u0, v0, u1, v0, u1, v1, u0, v1], 0, 0, -1);
      pose.pop();
      k++;
    }
  }
}

/** vanilla RenderType.text: blended, cut out where nearly clear, unlit but for the lightmap, both sides */
function textState(texture: WebGLTexture) {
  return { texture, cutoff: 0.1, blend: true, cull: false, lit: false, useLightmap: true };
}
