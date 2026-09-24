// Batched dynamic geometry for entities, items and the first-person hand.
// Lighting follows vanilla's entity shader: two diffuse lights + ambient,
// multiplied by the lightmap; optional overlay (hurt flash) and fog.

import { GL, Shader } from './gl';
import { Mat4, mat4 } from '../core/math';

const VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;
layout(location=2) in vec4 a_color;
layout(location=3) in vec3 a_normal;
layout(location=4) in vec2 a_light;
layout(location=5) in vec4 a_overlay;
uniform mat4 u_proj;
uniform mat4 u_view;
uniform vec3 u_light0;
uniform vec3 u_light1;
uniform float u_lit;
uniform float u_fogShape;
uniform vec2 u_uvOffset;
out vec2 v_uv;
out vec4 v_color;
out vec2 v_lm;
out vec4 v_overlay;
out float v_dist;
void main() {
  vec4 vp = u_view * vec4(a_pos, 1.0);
  gl_Position = u_proj * vp;
  v_uv = a_uv + u_uvOffset;
  vec3 n = normalize(a_normal);
  float l0 = max(0.0, dot(normalize(u_light0), n));
  float l1 = max(0.0, dot(normalize(u_light1), n));
  float acc = min(1.0, (l0 + l1) * 0.6 + 0.4);
  if (u_lit < 0.5) acc = 1.0;
  v_color = vec4(a_color.rgb * acc, a_color.a);
  v_lm = clamp(a_light / 256.0, vec2(0.5 / 16.0), vec2(15.5 / 16.0));
  v_overlay = a_overlay;
  v_dist = u_fogShape > 0.5 ? max(length(a_pos.xz), abs(a_pos.y)) : length(a_pos);
}`;

const FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform sampler2D u_lightmap;
uniform vec4 u_fogColor;
uniform vec2 u_fog;
uniform float u_alphaCutoff;
uniform float u_useLightmap;
uniform float u_additive;
in vec2 v_uv;
in vec4 v_color;
in vec2 v_lm;
in vec4 v_overlay;
in float v_dist;
out vec4 o;
void main() {
  vec4 c = texture(u_tex, v_uv) * v_color;
  if (c.a < u_alphaCutoff) discard;
  c.rgb = mix(v_overlay.rgb, c.rgb, 1.0 - v_overlay.a);
  if (u_useLightmap > 0.5) c.rgb *= texture(u_lightmap, v_lm).rgb;
  if (v_dist > u_fog.x && u_fog.y > 0.0) {
    float f = v_dist < u_fog.y ? smoothstep(u_fog.x, u_fog.y, v_dist) : 1.0;
    // (vanilla linear_fog_fade: what's added to the scene fades out into the fog rather than taking its colour)
    if (u_additive > 0.5) c.rgb *= 1.0 - f * u_fogColor.a;
    else c.rgb = mix(c.rgb, u_fogColor.rgb, f * u_fogColor.a);
  }
  o = c;
}`;

const FLOATS = 16; // pos3 uv2 color4 normal3 light2 overlay... (overlay packed separately)

/** Matrix stack helper (column-major). */
export class PoseStack {
  private stack: Float32Array[] = [mat4()];
  get m(): Float32Array {
    return this.stack[this.stack.length - 1];
  }
  push(): void {
    this.stack.push(new Float32Array(this.m));
  }
  pop(): void {
    this.stack.pop();
  }
  reset(m?: Mat4): void {
    this.stack = [m ? new Float32Array(m) : mat4()];
  }
  translate(x: number, y: number, z: number): void {
    const a = this.m;
    a[12] += a[0] * x + a[4] * y + a[8] * z;
    a[13] += a[1] * x + a[5] * y + a[9] * z;
    a[14] += a[2] * x + a[6] * y + a[10] * z;
    a[15] += a[3] * x + a[7] * y + a[11] * z;
  }
  scale(x: number, y: number, z: number): void {
    const a = this.m;
    for (let i = 0; i < 4; i++) {
      a[i] *= x;
      a[4 + i] *= y;
      a[8 + i] *= z;
    }
  }
  /** rotate around axis by degrees (right-handed, like vanilla Axis.XP/YP/ZP) */
  rotX(deg: number): void {
    this.rot(deg, 0);
  }
  rotY(deg: number): void {
    this.rot(deg, 1);
  }
  rotZ(deg: number): void {
    this.rot(deg, 2);
  }
  private rot(deg: number, axis: number): void {
    if (deg === 0) return;
    const r = (deg * Math.PI) / 180, s = Math.sin(r), c = Math.cos(r);
    const a = this.m;
    // columns: i (x), j (y), k (z)
    if (axis === 0) {
      for (let i = 0; i < 4; i++) {
        const y = a[4 + i], z = a[8 + i];
        a[4 + i] = y * c + z * s;
        a[8 + i] = z * c - y * s;
      }
    } else if (axis === 1) {
      for (let i = 0; i < 4; i++) {
        const x = a[i], z = a[8 + i];
        a[i] = x * c - z * s;
        a[8 + i] = x * s + z * c;
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const x = a[i], y = a[4 + i];
        a[i] = x * c + y * s;
        a[4 + i] = y * c - x * s;
      }
    }
  }
  /** rotate by radians around X, Y, Z in vanilla ModelPart order (ZYX applied as rotZ*rotY*rotX) */
  rotZYX(xr: number, yr: number, zr: number): void {
    if (zr) this.rot((zr * 180) / Math.PI, 2);
    if (yr) this.rot((yr * 180) / Math.PI, 1);
    if (xr) this.rot((xr * 180) / Math.PI, 0);
  }
  transform(x: number, y: number, z: number, out: number[]): void {
    const a = this.m;
    out[0] = a[0] * x + a[4] * y + a[8] * z + a[12];
    out[1] = a[1] * x + a[5] * y + a[9] * z + a[13];
    out[2] = a[2] * x + a[6] * y + a[10] * z + a[14];
  }
  transformNormal(x: number, y: number, z: number, out: number[]): void {
    const a = this.m;
    out[0] = a[0] * x + a[4] * y + a[8] * z;
    out[1] = a[1] * x + a[5] * y + a[9] * z;
    out[2] = a[2] * x + a[6] * y + a[10] * z;
  }
}

export interface DrawState {
  texture: WebGLTexture;
  cutoff: number;
  blend: boolean;
  cull: boolean;
  lit: boolean;
  useLightmap: boolean;
  /** additive blending (vanilla eyes render type) */
  additive?: boolean;
  /** default true */
  depthWrite?: boolean;
  /** only where the depth already equals this geometry's (vanilla glint EQUAL_DEPTH_TEST) */
  depthEqual?: boolean;
  /** default true; false writes depth only (vanilla RenderType.waterMask) */
  colorWrite?: boolean;
  /** added to every UV (vanilla OffsetTexturingStateShard: the energy swirl's scroll) */
  uvOffset?: [number, number];
}

/** Accumulates quads for one texture/state, then flushes. */
export class EntityBatch {
  private readonly shader: Shader;
  private readonly vao: WebGLVertexArrayObject;
  private readonly vbo: WebGLBuffer;
  private data = new Float32Array(FLOATS * 4 * 4096);
  private n = 0; // vertices
  private state: DrawState | null = null;
  private readonly tmp = [0, 0, 0];
  private readonly tmpN = [0, 0, 0];
  light0: [number, number, number] = [0.2, 1.0, -0.7];
  light1: [number, number, number] = [-0.2, 1.0, 0.7];
  proj: Mat4 = mat4();
  view: Mat4 = mat4();
  fogColor: [number, number, number] = [0, 0, 0];
  fog: [number, number] = [0, 0];
  /** vanilla FogShape: 0 sphere, 1 cylinder */
  fogShape = 1;
  lightmap: WebGLTexture | null = null;
  /** current per-vertex light (block*16, sky*16) and overlay */
  lightB = 240;
  lightS = 240;
  overlay: [number, number, number, number] = [0, 0, 0, 0];
  color: [number, number, number, number] = [1, 1, 1, 1];

  constructor(private readonly gl: GL) {
    this.shader = new Shader(gl, VS, FS, 'entity');
    this.vao = gl.createVertexArray()!;
    this.vbo = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const S = FLOATS * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, S, 20);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, S, 36);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, S, 48);
    // overlay: we reuse a vec4 at the end? (FLOATS = 16 → 14 used + 2 spare) — pack overlay rgb*a in spare via separate buffer
    gl.disableVertexAttribArray(5);
    gl.vertexAttrib4f(5, 0, 0, 0, 0);
    gl.bindVertexArray(null);
  }

  begin(state: DrawState): void {
    if (this.state && !sameState(this.state, state)) this.flush();
    this.state = state;
  }

  private ensure(v: number): void {
    if ((this.n + v) * FLOATS <= this.data.length) return;
    const nd = new Float32Array(Math.max(this.data.length * 2, (this.n + v) * FLOATS));
    nd.set(this.data);
    this.data = nd;
  }

  /** Emit one vertex already in world (camera-relative) space. */
  vertexRaw(x: number, y: number, z: number, u: number, v: number, r: number, g: number, b: number, a: number, nx: number, ny: number, nz: number): void {
    this.ensure(1);
    const d = this.data, o = this.n * FLOATS;
    d[o] = x; d[o + 1] = y; d[o + 2] = z;
    d[o + 3] = u; d[o + 4] = v;
    d[o + 5] = r * this.color[0]; d[o + 6] = g * this.color[1]; d[o + 7] = b * this.color[2]; d[o + 8] = a * this.color[3];
    d[o + 9] = nx; d[o + 10] = ny; d[o + 11] = nz;
    d[o + 12] = this.lightB; d[o + 13] = this.lightS;
    d[o + 14] = 0; d[o + 15] = 0;
    this.n++;
  }

  /** Emit a quad transformed by the pose (positions in model space). */
  quad(pose: PoseStack, p: number[], uv: number[], nx: number, ny: number, nz: number, r = 1, g = 1, b = 1, a = 1): void {
    const t = this.tmp, tn = this.tmpN;
    pose.transformNormal(nx, ny, nz, tn);
    const verts = [0, 1, 2, 0, 2, 3];
    for (const k of verts) {
      pose.transform(p[k * 3], p[k * 3 + 1], p[k * 3 + 2], t);
      this.vertexRaw(t[0], t[1], t[2], uv[k * 2], uv[k * 2 + 1], r, g, b, a, tn[0], tn[1], tn[2]);
    }
  }

  flush(): void {
    if (!this.state || this.n === 0) {
      this.n = 0;
      return;
    }
    const gl = this.gl;
    const st = this.state;
    const s = this.shader.use();
    s.mat4('u_proj', this.proj);
    s.mat4('u_view', this.view);
    s.vec3('u_light0', this.light0[0], this.light0[1], this.light0[2]);
    s.vec3('u_light1', this.light1[0], this.light1[1], this.light1[2]);
    s.f('u_lit', st.lit ? 1 : 0);
    s.f('u_alphaCutoff', st.cutoff);
    s.f('u_useLightmap', st.useLightmap ? 1 : 0);
    s.vec4('u_fogColor', this.fogColor[0], this.fogColor[1], this.fogColor[2], 1);
    s.vec2('u_fog', this.fog[0], this.fog[1]);
    s.f('u_fogShape', this.fogShape);
    s.f('u_additive', st.blend && st.additive ? 1 : 0);
    s.vec2('u_uvOffset', st.uvOffset?.[0] ?? 0, st.uvOffset?.[1] ?? 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, st.texture);
    s.i('u_tex', 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lightmap);
    s.i('u_lightmap', 1);
    gl.bindVertexArray(this.vao);
    gl.vertexAttrib4f(5, this.overlay[0], this.overlay[1], this.overlay[2], this.overlay[3]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.n * FLOATS), gl.STREAM_DRAW);
    if (st.blend) {
      gl.enable(gl.BLEND);
      if (st.additive) gl.blendFunc(gl.ONE, gl.ONE);
      else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } else gl.disable(gl.BLEND);
    if (st.cull) gl.enable(gl.CULL_FACE);
    else gl.disable(gl.CULL_FACE);
    if (st.depthWrite === false) gl.depthMask(false);
    if (st.depthEqual) gl.depthFunc(gl.EQUAL);
    if (st.colorWrite === false) gl.colorMask(false, false, false, false);
    gl.drawArrays(gl.TRIANGLES, 0, this.n);
    if (st.colorWrite === false) gl.colorMask(true, true, true, true);
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    if (st.depthWrite === false) gl.depthMask(true);
    if (st.depthEqual) gl.depthFunc(gl.LEQUAL);
    this.n = 0;
  }

  setOverlay(r: number, g: number, b: number, a: number): void {
    if (this.overlay[0] !== r || this.overlay[1] !== g || this.overlay[2] !== b || this.overlay[3] !== a) {
      this.flush();
      this.overlay = [r, g, b, a];
    }
  }
}

function sameState(a: DrawState, b: DrawState): boolean {
  return a.texture === b.texture && a.cutoff === b.cutoff && a.blend === b.blend && a.cull === b.cull && a.lit === b.lit && a.useLightmap === b.useLightmap && !!a.additive === !!b.additive && (a.depthWrite !== false) === (b.depthWrite !== false) && !!a.depthEqual === !!b.depthEqual && (a.colorWrite !== false) === (b.colorWrite !== false) && (a.uvOffset?.[0] ?? 0) === (b.uvOffset?.[0] ?? 0) && (a.uvOffset?.[1] ?? 0) === (b.uvOffset?.[1] ?? 0);
}
