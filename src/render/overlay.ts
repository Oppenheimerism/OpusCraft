// World overlays (block selection outline, crack overlay) and the temporary 2D HUD.

import { GL, Shader, createTexture } from './gl';
import type { Atlas } from './atlas';
import type { Renderer, Camera } from './renderer';
import { OUTLINE, BLOCKS, STATE_BLOCK } from '../world/block';
import { getStateModels, initMesher } from './mesher';
import { destroyStages } from '../textures/env';
import type { Game } from '../game/game';

const LINE_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_other;
layout(location=2) in float a_side;
uniform mat4 u_proj;
uniform mat4 u_view;
uniform vec2 u_viewport;
uniform float u_width;
void main() {
  vec4 a = u_proj * u_view * vec4(a_pos, 1.0);
  vec4 b = u_proj * u_view * vec4(a_other, 1.0);
  // keep both endpoints in front of the near plane
  if (a.w < 0.05) a = mix(a, b, (0.05 - a.w) / max(b.w - a.w, 1e-5));
  if (b.w < 0.05) b = mix(b, a, (0.05 - b.w) / max(a.w - b.w, 1e-5));
  vec2 sa = a.xy / a.w * u_viewport, sb = b.xy / b.w * u_viewport;
  vec2 dir = normalize(sb - sa + vec2(1e-6));
  vec2 n = vec2(-dir.y, dir.x) * u_width * a_side;
  a.xy += n / u_viewport * a.w;
  a.z -= 0.0005 * a.w;
  gl_Position = a;
}`;

const LINE_FS = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 o;
void main() { o = u_color; }`;

const CRACK_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;
uniform mat4 u_proj;
uniform mat4 u_view;
out vec2 v_uv;
void main() {
  gl_Position = u_proj * u_view * vec4(a_pos, 1.0);
  v_uv = a_uv;
}`;

const CRACK_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 o;
void main() {
  vec4 c = texture(u_tex, v_uv);
  o = vec4(mix(vec3(0.5), c.rgb, c.a), 1.0);
}`;

const VIG_VS = `#version 300 es
const vec2 P[4] = vec2[4](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
out vec2 v_uv;
void main() {
  vec2 p = P[gl_VertexID];
  v_uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// vanilla Gui.renderVignette: blend ZERO/ONE_MINUS_SRC_COLOR with the vignette tinted by brightness.
// Our sprite is stored multiply-style (white centre), so darkening = 1 - tex.
const VIG_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_amount;
in vec2 v_uv;
out vec4 o;
void main() {
  float d = (1.0 - texture(u_tex, v_uv).r) * u_amount;
  o = vec4(vec3(1.0 - d), 1.0);
}`;

// vanilla Gui.renderPortalOverlay: the portal's (animated) texture stretched over the screen
const SPRITE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec4 u_rect;
uniform float u_alpha;
in vec2 v_uv;
out vec4 o;
void main() {
  vec4 c = texture(u_tex, mix(u_rect.xy, u_rect.zw, v_uv));
  o = vec4(c.rgb, c.a * u_alpha);
}`;

export class Overlay {
  private spriteShader: Shader | null = null;
  private vigShader: Shader | null = null;
  private vigTex: WebGLTexture | null = null;
  private vigSrc: HTMLCanvasElement | null = null;
  private vigVao: WebGLVertexArrayObject | null = null;

  /** a block texture over the whole screen (the nether portal's swirl while standing in one, and behind "Loading terrain...") */
  renderScreenSprite(name: string, alpha: number, width: number, height: number): void {
    const r = this.atlas.sprites[name];
    if (!r || alpha <= 0) return;
    const gl = this.gl;
    if (!this.spriteShader) {
      this.spriteShader = new Shader(gl, VIG_VS, SPRITE_FS, 'screen sprite');
      this.vigVao ??= gl.createVertexArray();
    }
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const s = this.spriteShader.use();
    s.i('u_tex', 0);
    s.vec4('u_rect', r.u0, r.v0, r.u1, r.v1);
    s.f('u_alpha', Math.min(1, alpha));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas.texture!);
    gl.bindVertexArray(this.vigVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }

  /** darken screen edges by `amount` (0..1), drawn over the world before the GUI */
  renderVignette(src: HTMLCanvasElement | null, amount: number, width: number, height: number): void {
    if (!src || amount <= 0.001) return;
    const gl = this.gl;
    if (!this.vigShader) {
      this.vigShader = new Shader(gl, VIG_VS, VIG_FS, 'vignette');
      this.vigVao = gl.createVertexArray();
    }
    if (this.vigSrc !== src) {
      if (this.vigTex) gl.deleteTexture(this.vigTex);
      this.vigTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.vigTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.vigSrc = src;
    }
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
    const s = this.vigShader.use();
    s.i('u_tex', 0);
    s.f('u_amount', Math.min(1, amount));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.vigTex);
    gl.bindVertexArray(this.vigVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }

  private readonly lineShader: Shader;
  private readonly lineVao: WebGLVertexArrayObject;
  private readonly lineVbo: WebGLBuffer;
  private readonly crackShader: Shader;
  private readonly crackVao: WebGLVertexArrayObject;
  private readonly crackVbo: WebGLBuffer;
  private readonly crackTex: WebGLTexture;
  private ctx2d: CanvasRenderingContext2D | null = null;

  constructor(private readonly gl: GL, private readonly atlas: Atlas) {
    initMesher(atlas.sprites);
    this.lineShader = new Shader(gl, LINE_VS, LINE_FS, 'lines');
    this.lineVao = gl.createVertexArray()!;
    this.lineVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    this.crackShader = new Shader(gl, CRACK_VS, CRACK_FS, 'crack');
    this.crackVao = gl.createVertexArray()!;
    this.crackVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.crackVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.crackVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);
    // destroy stages strip 160x16
    const stages = destroyStages();
    const strip = new Uint8Array(160 * 16 * 4);
    stages.forEach((t, i) => {
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const si = (y * 16 + x) * 4, di = (y * 160 + i * 16 + x) * 4;
          for (let c = 0; c < 4; c++) strip[di + c] = t.data[si + c];
        }
    });
    this.crackTex = createTexture(gl, 160, 16, strip);
  }

  renderSelection(r: Renderer, cam: Camera, x: number, y: number, z: number, state: number): void {
    const gl = this.gl;
    const boxes = OUTLINE[state];
    if (!boxes || !boxes.length) return;
    const verts: number[] = [];
    const e = 0.002;
    for (const b of boxes) {
      const x0 = x + b[0] - e - cam.x, y0 = y + b[1] - e - cam.y, z0 = z + b[2] - e - cam.z;
      const x1 = x + b[3] + e - cam.x, y1 = y + b[4] + e - cam.y, z1 = z + b[5] + e - cam.z;
      const c = [
        [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
        [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
      ];
      const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
      for (const [a, bb] of edges) {
        const A = c[a], B = c[bb];
        // quad: A-,A+,B+ / A-,B+,B-
        const push = (P: number[], Q: number[], s: number) => verts.push(P[0], P[1], P[2], Q[0], Q[1], Q[2], s);
        push(A, B, -1); push(A, B, 1); push(B, A, -1);
        push(A, B, -1); push(B, A, -1); push(B, A, 1);
      }
    }
    const s = this.lineShader.use();
    s.mat4('u_proj', r.proj);
    s.mat4('u_view', r.view);
    s.vec2('u_viewport', r.width / 2, r.height / 2);
    s.f('u_width', Math.max(2.5, (r.width / 1920) * 2.5) / 2);
    s.vec4('u_color', 0, 0, 0, 0.4);
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STREAM_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ZERO);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 7);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  renderCrack(r: Renderer, cam: Camera, x: number, y: number, z: number, state: number, stage: number): void {
    const gl = this.gl;
    const models = getStateModels(state);
    if (!models) return;
    const verts: number[] = [];
    const u0 = stage / 10;
    for (const m of models.multipart ? models.variants : [models.variants[0]]) {
      for (const q of m.quads) {
        // project world position onto the face plane for UVs (vanilla SheetedDecalTextureGenerator)
        for (const k of [0, 1, 2, 0, 2, 3]) {
          const px = q.pos[k * 3], py = q.pos[k * 3 + 1], pz = q.pos[k * 3 + 2];
          let u: number, v: number;
          switch (q.dir) {
            case 0: case 1: u = px; v = pz; break;
            case 2: case 3: u = px; v = 1 - py; break;
            default: u = pz; v = 1 - py; break;
          }
          u = u - Math.floor(u - 1e-4);
          v = v - Math.floor(v - 1e-4);
          verts.push(x + px - cam.x, y + py - cam.y, z + pz - cam.z, u0 + Math.min(0.999, Math.max(0, u)) * 0.1, Math.min(0.999, Math.max(0, v)));
        }
      }
    }
    const s = this.crackShader.use();
    s.mat4('u_proj', r.proj);
    s.mat4('u_view', r.view);
    s.i('u_tex', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.crackTex);
    gl.bindVertexArray(this.crackVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.crackVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STREAM_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.DST_COLOR, gl.SRC_COLOR);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-1, -10);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 5);
    gl.depthMask(true);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    void BLOCKS;
    void STATE_BLOCK;
  }

  private ctx(ui: HTMLCanvasElement): CanvasRenderingContext2D {
    if (!this.ctx2d) this.ctx2d = ui.getContext('2d')!;
    return this.ctx2d;
  }

  renderLoading(ui: HTMLCanvasElement, pending: number, loaded: number): void {
    const c = this.ctx(ui);
    c.clearRect(0, 0, ui.width, ui.height);
    c.fillStyle = '#000';
    c.fillRect(0, 0, ui.width, ui.height);
    c.fillStyle = '#fff';
    c.font = `${Math.round(ui.height / 40)}px monospace`;
    c.textAlign = 'center';
    const pct = Math.min(100, Math.floor((loaded / Math.max(1, loaded + pending)) * 100));
    c.fillText(`Generating world... ${pct}%`, ui.width / 2, ui.height / 2);
    c.textAlign = 'left';
  }

  /** Temporary HUD (replaced by the sprite GUI). */
  renderHud(game: Game, _partial: number): void {
    const ui = game.ui;
    const c = this.ctx(ui);
    c.clearRect(0, 0, ui.width, ui.height);
    if (game.hideGui) return;
    const scale = Math.max(1, Math.min(Math.floor(ui.width / 320), Math.floor(ui.height / 240)));
    // crosshair (inverted)
    c.save();
    c.globalCompositeOperation = 'difference';
    c.fillStyle = '#fff';
    const cx = Math.floor(ui.width / 2), cy = Math.floor(ui.height / 2);
    c.fillRect(cx - 7 * scale / 2, cy - scale / 2, 15 * scale / 2, scale);
    c.fillRect(cx - scale / 2, cy - 7 * scale / 2, scale, 15 * scale / 2);
    c.restore();
    // hotbar placeholder
    const p = game.player;
    const hw = 182 * scale, hh = 22 * scale;
    const hx = Math.floor(ui.width / 2 - hw / 2), hy = ui.height - hh;
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(hx, hy, hw, hh);
    c.strokeStyle = '#fff';
    c.lineWidth = scale;
    c.strokeRect(hx + p.inventory.selected * 20 * scale, hy, 22 * scale, 22 * scale);
    c.fillStyle = '#fff';
    c.font = `${6 * scale}px monospace`;
    for (let i = 0; i < 9; i++) {
      const s = p.inventory.main[i];
      if (!s) continue;
      c.fillText(s.item.id.slice(0, 5), hx + (i * 20 + 3) * scale, hy + 12 * scale);
    }
    if (game.showDebug) {
      c.font = `${Math.round(8 * scale)}px monospace`;
      const lines = debugLines(game);
      c.fillStyle = 'rgba(80,80,80,0.5)';
      lines.forEach((l, i) => {
        const w = c.measureText(l).width;
        c.fillRect(2 * scale, (2 + i * 9) * scale, w + 2 * scale, 9 * scale);
      });
      c.fillStyle = '#e0e0e0';
      lines.forEach((l, i) => c.fillText(l, 3 * scale, (9 + i * 9) * scale));
    }
  }
}

export function debugLines(game: Game): string[] {
  const p = game.player;
  const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
  const facing = ['south', 'west', 'north', 'east'][Math.floor(((p.yaw % 360) + 360 + 45) / 90) % 4];
  const toward = { south: 'Towards positive Z', west: 'Towards negative X', north: 'Towards negative Z', east: 'Towards positive X' }[facing];
  const l = game.world.getLight(bx, by, bz);
  const r = game.renderer.world.stats;
  const yawW = ((p.yaw % 360) + 540) % 360 - 180;
  return [
    `Minecraft 1.21.8 (vanilla)`,
    `${game.fps} fps T: inf vsync fancy-clouds B: 2`,
    `C: ${r.drawn}/${r.sections} (s) D: ${game.opts.renderDistance}, pC: 000, pU: 00, aB: ${game.pool?.busy() ?? 0}`,
    `E: ${game.renderer.entities.rendered}/${game.level.entities.length}, SD: ${game.level.simulationDistance}`,
    `minecraft:${game.world.dim.id} FC: 0`,
    ``,
    `XYZ: ${p.x.toFixed(3)} / ${p.y.toFixed(5)} / ${p.z.toFixed(3)}`,
    `Block: ${bx} ${by} ${bz} [${bx & 15} ${by & 15} ${bz & 15}]`,
    `Chunk: ${bx >> 4} ${by >> 4} ${bz >> 4} in ${bx >> 9} ${bz >> 9}`,
    `Facing: ${facing} (${toward}) (${yawW.toFixed(1)} / ${p.pitch.toFixed(1)})`,
    `Client Light: ${Math.max(l >> 4, l & 15)} (${l >> 4} sky, ${l & 15} block)`,
    `Biome: minecraft:${BIOME_NAME(game)}`,
    localDifficultyLine(game, bx, by, bz),
  ];
}

import { currentDifficultyAt } from '../game/difficulty';
/** vanilla DebugScreenOverlay: "Local Difficulty: %.2f // %.2f (Day %d)", from the chunk the player stands in */
function localDifficultyLine(game: Game, x: number, y: number, z: number): string {
  if (!game.world.getChunk(x >> 4, z >> 4)) return 'Local Difficulty: ??';
  const d = currentDifficultyAt(game.level, x, y, z);
  return `Local Difficulty: ${d.effective.toFixed(2)} // ${d.specialMultiplier().toFixed(2)} (Day ${Math.floor(game.level.dayTime / 24000)})`;
}

import { BIOMES } from '../world/gen/biomes';
function BIOME_NAME(game: Game): string {
  const p = game.player;
  return BIOMES[game.world.getBiome3(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))]?.name ?? '?';
}
