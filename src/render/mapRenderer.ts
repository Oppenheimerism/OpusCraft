// Maps as the game draws them (vanilla MapRenderer, and ItemInHandRenderer.renderMap): the paper, the map's picture as
// a 128×128 texture kept up to date with its colours, and its markers — each a little quad turned to face its way, a
// named one (a renamed banner) with its name under it on a half-clear dark strip.
// Drawn like text (vanilla RenderType.text): lit only by the light where it is, see-through where nothing's drawn.

import type { GL } from './gl';
import { createTexture } from './gl';
import type { EntityBatch, PoseStack } from './entityRenderer';
import type { ItemStack } from '../item/item';
import { MAP_SIZE, DECORATION_TYPES, type MapItemSavedData, type DecorationType, type MapDecoration } from '../game/mapData';
import { viewedMapData } from '../game/maps';
import { mapRGBA } from '../world/mapColors';
import { mapBackground, decorationAtlas, MAP_BACKGROUND_SIZE } from '../textures/mapTextures';
import { FONT, textWidth } from '../textures/font';
import type { TexImage } from '../textures/tex';

/**
 * vanilla MapRenderer: a marker's name goes 4 pixels under it, centred, at most 25 map pixels across and 2/3 of the
 * font's size (`x`, `y`: where the text starts)
 */
export function nameLayout(dec: MapDecoration, width: number): { x: number; y: number; scale: number } {
  const scale = Math.min(Math.max(25 / width, 0), 6 / 9);
  return { x: dec.x / 2 + 64 - (width * scale) / 2, y: dec.y / 2 + 64 + 4, scale };
}

interface GlyphUV {
  u0: number;
  u1: number;
  w: number;
}

/** the font's glyphs in a row, white, with a white texel after them (vanilla's white glyph, for the strip under a name) */
function fontSheet(): { w: number; data: Uint8Array; glyphs: Map<string, GlyphUV>; white: [number, number] } {
  const chars = Object.keys(FONT.glyphs);
  let w = 0;
  const at: [string, number][] = [];
  for (const ch of chars) {
    at.push([ch, w]);
    w += FONT.glyphs[ch][0].length + 1;
  }
  const whiteX = w++;
  const data = new Uint8Array(w * 8 * 4);
  const glyphs = new Map<string, GlyphUV>();
  for (const [ch, x0] of at) {
    const rows = FONT.glyphs[ch];
    const gw = rows[0].length;
    for (let y = 0; y < 8; y++) for (let x = 0; x < gw; x++) if (rows[y][x] === '#') data.fill(255, ((y * w + x0 + x) * 4), (y * w + x0 + x) * 4 + 4);
    glyphs.set(ch, { u0: x0 / w, u1: (x0 + gw) / w, w: gw });
  }
  for (let y = 0; y < 8; y++) data.fill(255, (y * w + whiteX) * 4, (y * w + whiteX) * 4 + 4);
  return { w, data, glyphs, white: [(whiteX + 0.5) / w, 0.5] };
}

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
  private readonly font: WebGLTexture;
  private readonly glyphs: Map<string, GlyphUV>;
  private readonly white: [number, number];
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
    const f = fontSheet();
    this.font = createTexture(gl, f.w, 8, f.data);
    this.glyphs = f.glyphs;
    this.white = f.white;
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
      if (dec.name !== null) this.drawName(batch, pose, dec, dec.name);
      k++;
    }
  }

  /**
   * vanilla MapRenderer (Font.drawInBatch, white, no shadow, background Integer.MIN_VALUE): the name in front of the
   * markers, on a half-clear black strip a pixel wider than it all round
   */
  private drawName(batch: EntityBatch, pose: PoseStack, dec: MapDecoration, name: string): void {
    const width = textWidth(name);
    const at = nameLayout(dec, width);
    pose.push();
    pose.translate(at.x, at.y, -0.025);
    pose.scale(at.scale, at.scale, 1);
    pose.translate(0, 0, -0.1);
    batch.begin(textState(this.font));
    const [wu, wv] = this.white;
    const r = width + 1;
    batch.quad(pose, [-1, 9, 0.01, r, 9, 0.01, r, -1, 0.01, -1, -1, 0.01], [wu, wv, wu, wv, wu, wv, wu, wv], 0, 0, -1, 0, 0, 0, 0.5);
    let x = 0;
    for (const ch of name) {
      const g = this.glyphs.get(ch) ?? this.glyphs.get('?')!;
      if (ch !== ' ') batch.quad(pose, [x, 8, 0, x + g.w, 8, 0, x + g.w, 0, 0, x, 0, 0], [g.u0, 1, g.u1, 1, g.u1, 0, g.u0, 0], 0, 0, -1);
      x += g.w + 1;
    }
    pose.pop();
  }
}

/** vanilla RenderType.text: blended, cut out where nearly clear, unlit but for the lightmap, both sides */
function textState(texture: WebGLTexture) {
  return { texture, cutoff: 0.1, blend: true, cull: false, lit: false, useLightmap: true };
}
