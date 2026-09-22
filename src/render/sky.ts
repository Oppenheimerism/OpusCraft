// Sky rendering (vanilla LevelRenderer.renderSky structure): sky disc with
// fog gradient, sunrise fan, sun, moon, stars, and the dark void disc.

import { GL, Shader, createTexture } from './gl';
import { Mat4, mat4, rotateX, rotateY, rotateZ, multiply, translate, DEG } from '../core/math';
import { JavaRandom } from '../core/rng';
import { sunTexture, moonTexture } from '../textures/env';

const POS_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
uniform mat4 u_proj;
uniform mat4 u_view;
out float v_dist;
void main() {
  vec4 vp = u_view * vec4(a_pos, 1.0);
  gl_Position = u_proj * vp;
  v_dist = length(vp.xyz);
}`;

const POS_FS = `#version 300 es
precision highp float;
uniform vec4 u_color;
uniform vec4 u_fogColor;
uniform vec2 u_fog;
in float v_dist;
out vec4 o;
void main() {
  vec4 c = u_color;
  if (u_fog.y > 0.0 && v_dist > u_fog.x) {
    float f = v_dist < u_fog.y ? smoothstep(u_fog.x, u_fog.y, v_dist) : 1.0;
    c.rgb = mix(c.rgb, u_fogColor.rgb, f * u_fogColor.a);
  }
  o = c;
}`;

const COL_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec4 a_col;
uniform mat4 u_proj;
uniform mat4 u_view;
out vec4 v_col;
void main() {
  gl_Position = u_proj * u_view * vec4(a_pos, 1.0);
  v_col = a_col;
}`;

const COL_FS = `#version 300 es
precision highp float;
in vec4 v_col;
out vec4 o;
void main() { o = v_col; }`;

const TEX_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;
uniform mat4 u_proj;
uniform mat4 u_view;
out vec2 v_uv;
void main() {
  gl_Position = u_proj * u_view * vec4(a_pos, 1.0);
  v_uv = a_uv;
}`;

const TEX_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec4 u_color;
in vec2 v_uv;
out vec4 o;
void main() { o = texture(u_tex, v_uv) * u_color; }`;

export interface SkyParams {
  proj: Mat4;
  /** rotation-only view matrix */
  viewRot: Mat4;
  skyColor: [number, number, number];
  fogColor: [number, number, number];
  renderDistanceBlocks: number;
  sunrise: [number, number, number, number] | null;
  timeOfDay: number;
  rain: number;
  starBrightness: number;
  moonPhase: number;
  /** camera eye y minus horizon height (63) */
  horizonDelta: number;
}

export class SkyRenderer {
  private readonly posShader: Shader;
  private readonly colShader: Shader;
  private readonly texShader: Shader;
  private readonly skyVao: WebGLVertexArrayObject;
  private readonly darkVao: WebGLVertexArrayObject;
  private readonly starVao: WebGLVertexArrayObject;
  private starCount = 0;
  private readonly fanVao: WebGLVertexArrayObject;
  private readonly fanVbo: WebGLBuffer;
  private readonly quadVao: WebGLVertexArrayObject;
  private readonly quadVbo: WebGLBuffer;
  private readonly sunTex: WebGLTexture;
  private readonly moonTex: WebGLTexture;
  private readonly m = mat4();
  private readonly m2 = mat4();

  constructor(private readonly gl: GL) {
    this.posShader = new Shader(gl, POS_VS, POS_FS, 'sky');
    this.colShader = new Shader(gl, COL_VS, COL_FS, 'skyfan');
    this.texShader = new Shader(gl, TEX_VS, TEX_FS, 'skytex');
    this.skyVao = this.disc(16);
    this.darkVao = this.disc(-16);
    this.starVao = this.buildStars();
    // sunrise fan: 18 verts * (3 pos + 4 col)
    this.fanVao = gl.createVertexArray()!;
    this.fanVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.fanVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fanVbo);
    gl.bufferData(gl.ARRAY_BUFFER, 18 * 7 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    // textured quad
    this.quadVao = gl.createVertexArray()!;
    this.quadVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.quadVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, 6 * 5 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);
    const sun = sunTexture();
    this.sunTex = createTexture(gl, sun.w, sun.h, new Uint8Array(sun.data.buffer));
    const moon = moonTexture();
    this.moonTex = createTexture(gl, moon.w, moon.h, new Uint8Array(moon.data.buffer));
  }

  private disc(y: number): WebGLVertexArrayObject {
    const gl = this.gl;
    const f = Math.sign(y) * 512;
    const verts: number[] = [0, y, 0];
    for (let i = -180; i <= 180; i += 45) {
      verts.push(f * Math.cos(i * DEG), y, 512 * Math.sin(i * DEG));
    }
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
    return vao;
  }

  private buildStars(): WebGLVertexArrayObject {
    const gl = this.gl;
    const random = new JavaRandom(10842);
    const tris: number[] = [];
    for (let i = 0; i < 1500; i++) {
      let d0 = random.nextFloat() * 2 - 1;
      let d1 = random.nextFloat() * 2 - 1;
      let d2 = random.nextFloat() * 2 - 1;
      const d3 = 0.15 + random.nextFloat() * 0.1;
      let d4 = d0 * d0 + d1 * d1 + d2 * d2;
      if (d4 < 1 && d4 > 0.01) {
        d4 = 1 / Math.sqrt(d4);
        d0 *= d4;
        d1 *= d4;
        d2 *= d4;
        const d5 = d0 * 100, d6 = d1 * 100, d7 = d2 * 100;
        const d8 = Math.atan2(d0, d2);
        const d9 = Math.sin(d8), d10 = Math.cos(d8);
        const d11 = Math.atan2(Math.sqrt(d0 * d0 + d2 * d2), d1);
        const d12 = Math.sin(d11), d13 = Math.cos(d11);
        const d14 = random.nextDouble() * Math.PI * 2;
        const d15 = Math.sin(d14), d16 = Math.cos(d14);
        const quad: number[][] = [];
        for (let j = 0; j < 4; j++) {
          const d18 = ((j & 2) - 1) * d3;
          const d19 = (((j + 1) & 2) - 1) * d3;
          const d21 = d18 * d16 - d19 * d15;
          const d22 = d19 * d16 + d18 * d15;
          const d23 = d21 * d12 + 0 * d13;
          const d24 = 0 * d12 - d21 * d13;
          const d25 = d24 * d9 - d22 * d10;
          const d26 = d22 * d9 + d24 * d10;
          quad.push([d5 + d25, d6 + d23, d7 + d26]);
        }
        for (const k of [0, 1, 2, 0, 2, 3]) tris.push(...quad[k]);
      }
    }
    this.starCount = tris.length / 3;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tris), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
    return vao;
  }

  render(p: SkyParams): void {
    const gl = this.gl;
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    // sky disc
    const s = this.posShader.use();
    s.mat4('u_proj', p.proj);
    s.mat4('u_view', p.viewRot);
    s.vec4('u_color', p.skyColor[0], p.skyColor[1], p.skyColor[2], 1);
    s.vec4('u_fogColor', p.fogColor[0], p.fogColor[1], p.fogColor[2], 1);
    s.vec2('u_fog', 0, p.renderDistanceBlocks);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 10);

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ZERO);
    // sunrise fan
    if (p.sunrise) {
      const sr = p.sunrise;
      const m = this.m;
      m.set(p.viewRot);
      rotateX(m, m, 90 * DEG);
      const f3 = Math.sin(p.timeOfDay * Math.PI * 2) < 0 ? 180 : 0;
      rotateZ(m, m, f3 * DEG);
      rotateZ(m, m, 90 * DEG);
      const data = new Float32Array(18 * 7);
      data.set([0, 100, 0, sr[0], sr[1], sr[2], sr[3]], 0);
      for (let j = 0; j <= 16; j++) {
        const f7 = (j * Math.PI * 2) / 16;
        const f8 = Math.sin(f7), f9 = Math.cos(f7);
        data.set([f8 * 120, f9 * 120, -f9 * 40 * sr[3], sr[0], sr[1], sr[2], 0], (j + 1) * 7);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fanVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      const c = this.colShader.use();
      c.mat4('u_proj', p.proj);
      c.mat4('u_view', m);
      gl.bindVertexArray(this.fanVao);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, 18);
    }
    // sun & moon: additive
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ZERO);
    const f11 = 1 - p.rain;
    const m = this.m;
    m.set(p.viewRot);
    rotateY(m, m, -90 * DEG);
    rotateX(m, m, p.timeOfDay * 360 * DEG);
    const t = this.texShader.use();
    t.mat4('u_proj', p.proj);
    t.mat4('u_view', m);
    t.vec4('u_color', 1, 1, 1, f11);
    t.i('u_tex', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sunTex);
    this.quad([-30, 100, -30, 0, 0], [30, 100, -30, 1, 0], [30, 100, 30, 1, 1], [-30, 100, 30, 0, 1]);
    const k = p.moonPhase;
    const l = k % 4, i1 = Math.floor(k / 4) % 2;
    const u0 = l / 4, v0 = i1 / 2, u1 = (l + 1) / 4, v1 = (i1 + 1) / 2;
    gl.bindTexture(gl.TEXTURE_2D, this.moonTex);
    this.quad([-20, -100, 20, u1, v1], [20, -100, 20, u0, v1], [20, -100, -20, u0, v0], [-20, -100, -20, u1, v0]);
    // stars
    const sb = p.starBrightness * f11;
    if (sb > 0) {
      const ps = this.posShader.use();
      ps.mat4('u_view', m);
      ps.vec4('u_color', sb, sb, sb, sb);
      ps.vec2('u_fog', 0, 0);
      gl.bindVertexArray(this.starVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.starCount);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
    // dark void disc when below horizon
    if (p.horizonDelta < 0) {
      const ps = this.posShader.use();
      const m2 = this.m2;
      translate(m2, p.viewRot, 0, 12, 0);
      ps.mat4('u_view', m2);
      ps.vec4('u_color', 0, 0, 0, 1);
      ps.vec2('u_fog', 0, p.renderDistanceBlocks);
      gl.bindVertexArray(this.darkVao);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, 10);
    }
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    void multiply;
  }

  private quad(a: number[], b: number[], c: number[], d: number[]): void {
    const gl = this.gl;
    const data = new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
