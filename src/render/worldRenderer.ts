// Chunk section meshes on the GPU and terrain drawing.

import { GL, Shader, QuadIndexBuffer } from './gl';
import { Frustum, Mat4 } from '../core/math';
import { MIN_Y } from '../world/constants';

export const TERRAIN_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_light;
layout(location=2) in vec2 a_uv;
layout(location=3) in vec4 a_color;
uniform mat4 u_proj;
uniform mat4 u_view;
uniform vec3 u_offset;
uniform float u_fogShape;
out vec2 v_uv;
out vec4 v_color;
out vec2 v_lm;
out float v_dist;
void main() {
  vec3 p = a_pos / 2048.0 - 8.0 + u_offset;
  gl_Position = u_proj * u_view * vec4(p, 1.0);
  v_uv = a_uv;
  v_color = a_color;
  v_lm = clamp(a_light / 256.0, vec2(0.5 / 16.0), vec2(15.5 / 16.0));
  v_dist = u_fogShape > 0.5 ? max(length(p.xz), abs(p.y)) : length(p);
}`;

export const TERRAIN_FS = `#version 300 es
precision highp float;
uniform sampler2D u_atlas;
uniform sampler2D u_lightmap;
uniform vec4 u_fogColor;
uniform vec2 u_fog;
uniform float u_alphaCutoff;
in vec2 v_uv;
in vec4 v_color;
in vec2 v_lm;
in float v_dist;
out vec4 o;
void main() {
  vec4 c = texture(u_atlas, v_uv);
  if (c.a < u_alphaCutoff) discard;
  c *= v_color * texture(u_lightmap, v_lm);
  if (v_dist > u_fog.x) {
    float f = v_dist < u_fog.y ? smoothstep(u_fog.x, u_fog.y, v_dist) : 1.0;
    c.rgb = mix(c.rgb, u_fogColor.rgb, f * u_fogColor.a);
  }
  o = c;
}`;

export class SectionMesh {
  readonly vao: (WebGLVertexArrayObject | null)[] = [null, null, null, null];
  readonly vbo: (WebGLBuffer | null)[] = [null, null, null, null];
  readonly quads = [0, 0, 0, 0];
  centers: Float32Array | null = null;
  sortEbo: WebGLBuffer | null = null;
  sortedFrom: [number, number, number] | null = null;
  bytes = 0;
  constructor(readonly cx: number, readonly si: number, readonly cz: number) {}
  get x0(): number {
    return this.cx * 16;
  }
  get y0(): number {
    return MIN_Y + this.si * 16;
  }
  get z0(): number {
    return this.cz * 16;
  }
  empty(): boolean {
    return this.quads[0] + this.quads[1] + this.quads[2] + this.quads[3] === 0;
  }
}

export function sectionKey(cx: number, si: number, cz: number): number {
  return ((cx + 32768) * 65536 + (cz + 32768)) * 32 + si;
}

export interface TerrainParams {
  proj: Mat4;
  view: Mat4;
  camX: number;
  camY: number;
  camZ: number;
  fogColor: [number, number, number];
  fogStart: number;
  fogEnd: number;
  /** vanilla FogShape: 0 sphere, 1 cylinder (default) */
  fogShape?: number;
  atlas: WebGLTexture;
  lightmap: WebGLTexture;
  frustum: Frustum;
}

export class WorldRenderer {
  readonly meshes = new Map<number, SectionMesh>();
  readonly shader: Shader;
  private readonly indices: QuadIndexBuffer;
  private visible: SectionMesh[] = [];
  stats = { sections: 0, drawn: 0, quads: 0, bytes: 0 };

  constructor(private readonly gl: GL) {
    this.shader = new Shader(gl, TERRAIN_VS, TERRAIN_FS, 'terrain');
    this.indices = new QuadIndexBuffer(gl, 65536);
  }

  upload(cx: number, si: number, cz: number, layers: (ArrayBuffer | null)[], quads: number[], centers: Float32Array | null): void {
    const gl = this.gl;
    const key = sectionKey(cx, si, cz);
    let m = this.meshes.get(key);
    const total = quads[0] + quads[1] + quads[2] + quads[3];
    if (total === 0) {
      if (m) this.dispose(key);
      return;
    }
    if (!m) {
      m = new SectionMesh(cx, si, cz);
      this.meshes.set(key, m);
    }
    m.bytes = 0;
    for (let l = 0; l < 4; l++) {
      const data = layers[l];
      m.quads[l] = quads[l];
      if (!data || quads[l] === 0) {
        if (m.vbo[l]) {
          gl.deleteBuffer(m.vbo[l]);
          gl.deleteVertexArray(m.vao[l]);
          m.vbo[l] = null;
          m.vao[l] = null;
        }
        continue;
      }
      this.indices.ensure(quads[l]);
      if (!m.vao[l]) {
        const vao = gl.createVertexArray()!;
        const vbo = gl.createBuffer()!;
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.UNSIGNED_SHORT, false, 16, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.UNSIGNED_BYTE, false, 16, 6);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.UNSIGNED_SHORT, true, 16, 8);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 16, 12);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices.buffer);
        m.vao[l] = vao;
        m.vbo[l] = vbo;
      }
      gl.bindVertexArray(m.vao[l]);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices.buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo[l]);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      m.bytes += data.byteLength;
    }
    gl.bindVertexArray(null);
    m.centers = centers;
    m.sortedFrom = null;
    if (m.sortEbo && !centers) {
      gl.deleteBuffer(m.sortEbo);
      m.sortEbo = null;
    }
  }

  dispose(key: number): void {
    const m = this.meshes.get(key);
    if (!m) return;
    const gl = this.gl;
    for (let l = 0; l < 4; l++) {
      if (m.vbo[l]) gl.deleteBuffer(m.vbo[l]);
      if (m.vao[l]) gl.deleteVertexArray(m.vao[l]);
    }
    if (m.sortEbo) gl.deleteBuffer(m.sortEbo);
    this.meshes.delete(key);
  }

  disposeChunk(cx: number, cz: number): void {
    for (let si = 0; si < 24; si++) this.dispose(sectionKey(cx, si, cz));
  }

  /** Fix VAOs after the shared index buffer was reallocated. */
  private rebindIndices(): void {
    const gl = this.gl;
    for (const m of this.meshes.values())
      for (let l = 0; l < 4; l++) {
        if (!m.vao[l]) continue;
        gl.bindVertexArray(m.vao[l]);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, l === 3 && m.sortEbo ? m.sortEbo : this.indices.buffer);
      }
    gl.bindVertexArray(null);
  }

  private lastIndexCap = 0;

  cull(p: TerrainParams, maxDist: number): void {
    if (this.indices.capacity !== this.lastIndexCap) {
      if (this.lastIndexCap !== 0) this.rebindIndices();
      this.lastIndexCap = this.indices.capacity;
    }
    const vis: SectionMesh[] = [];
    const md2 = (maxDist + 16) * (maxDist + 16);
    for (const m of this.meshes.values()) {
      const x = m.x0 - p.camX, y = m.y0 - p.camY, z = m.z0 - p.camZ;
      const dx = x + 8, dz = z + 8;
      if (dx * dx + dz * dz > md2) continue;
      if (!p.frustum.testBox(x, y, z, x + 16, y + 16, z + 16)) continue;
      vis.push(m);
    }
    // sort near to far (helps early-z for opaque)
    for (const m of vis) {
      const dx = m.x0 + 8 - p.camX, dy = m.y0 + 8 - p.camY, dz = m.z0 + 8 - p.camZ;
      (m as unknown as { _d: number })._d = dx * dx + dy * dy + dz * dz;
    }
    vis.sort((a, b) => (a as unknown as { _d: number })._d - (b as unknown as { _d: number })._d);
    this.visible = vis;
    this.stats.sections = this.meshes.size;
    this.stats.drawn = vis.length;
  }

  private setup(p: TerrainParams): Shader {
    const gl = this.gl;
    const s = this.shader.use();
    s.mat4('u_proj', p.proj);
    s.mat4('u_view', p.view);
    s.vec4('u_fogColor', p.fogColor[0], p.fogColor[1], p.fogColor[2], 1);
    s.vec2('u_fog', p.fogStart, p.fogEnd);
    s.f('u_fogShape', p.fogShape ?? 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, p.atlas);
    s.i('u_atlas', 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, p.lightmap);
    s.i('u_lightmap', 1);
    return s;
  }

  drawOpaque(p: TerrainParams): void {
    const gl = this.gl;
    const s = this.setup(p);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    let quads = 0;
    const cutoffs = [-1, 0.5, 0.1];
    for (let l = 0; l < 3; l++) {
      s.f('u_alphaCutoff', cutoffs[l]);
      for (const m of this.visible) {
        const n = m.quads[l];
        if (!n) continue;
        s.vec3('u_offset', m.x0 - p.camX, m.y0 - p.camY, m.z0 - p.camZ);
        gl.bindVertexArray(m.vao[l]);
        gl.drawElements(gl.TRIANGLES, n * 6, gl.UNSIGNED_INT, 0);
        quads += n;
      }
    }
    gl.bindVertexArray(null);
    this.stats.quads = quads;
  }

  drawTranslucent(p: TerrainParams): void {
    const gl = this.gl;
    const s = this.setup(p);
    s.f('u_alphaCutoff', -1);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    for (let i = this.visible.length - 1; i >= 0; i--) {
      const m = this.visible[i];
      const n = m.quads[3];
      if (!n) continue;
      this.maybeSort(m, p);
      s.vec3('u_offset', m.x0 - p.camX, m.y0 - p.camY, m.z0 - p.camZ);
      gl.bindVertexArray(m.vao[3]);
      gl.drawElements(gl.TRIANGLES, n * 6, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  private maybeSort(m: SectionMesh, p: TerrainParams): void {
    if (!m.centers) return;
    const cx = p.camX - m.x0, cy = p.camY - m.y0, cz = p.camZ - m.z0;
    // only sort sections near the camera
    if (Math.abs(cx - 8) > 40 || Math.abs(cy - 8) > 40 || Math.abs(cz - 8) > 40) return;
    const sf = m.sortedFrom;
    if (sf && (sf[0] - cx) ** 2 + (sf[1] - cy) ** 2 + (sf[2] - cz) ** 2 < 1) return;
    m.sortedFrom = [cx, cy, cz];
    const n = m.quads[3];
    const c = m.centers;
    const order = new Uint32Array(n);
    const dist = new Float32Array(n);
    for (let q = 0; q < n; q++) {
      order[q] = q;
      const dx = c[q * 3] - cx, dy = c[q * 3 + 1] - cy, dz = c[q * 3 + 2] - cz;
      dist[q] = dx * dx + dy * dy + dz * dz;
    }
    order.sort((a, b) => dist[b] - dist[a]);
    const idx = new Uint32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const v = order[i] * 4, o = i * 6;
      idx[o] = v;
      idx[o + 1] = v + 1;
      idx[o + 2] = v + 2;
      idx[o + 3] = v;
      idx[o + 4] = v + 2;
      idx[o + 5] = v + 3;
    }
    const gl = this.gl;
    if (!m.sortEbo) m.sortEbo = gl.createBuffer()!;
    gl.bindVertexArray(m.vao[3]);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.sortEbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
  }

  totalBytes(): number {
    let b = 0;
    for (const m of this.meshes.values()) b += m.bytes;
    return b;
  }
}
