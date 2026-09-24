// The End's own render paths.
//
// The sky (vanilla LevelRenderer.renderEndSky): no sun, moon, stars or clouds,
// just a box of grey static round the camera, 100 blocks out each way, its
// texture repeated 16 times across each face and tinted 0x282828.
//
// The end portal (vanilla TheEndPortalRenderer, RenderType.endPortal and the
// rendertype_end_portal shader): only the portal's top (at 0.75) and bottom (at
// 0.375) are drawn. Its texture coordinates come from the screen, not the
// block, so the portal is a window onto a starfield rather than a textured
// surface: a base of the sky static times the first colour, then fifteen
// layers of end_portal specks, each scaled down less than the one before,
// turned by its own angle, tinted by its own colour and drifting at its own
// speed with the game time. The loading screen after going through an end
// portal fills the screen with the same (vanilla ReceivingLevelScreen,
// Reason.END_PORTAL).

import { GL, Shader, createTexture } from './gl';
import type { Frustum, Mat4 } from '../core/math';
import type { World } from '../world/world';
import { endSkyTexture, endPortalTexture } from '../textures/endEnv';

const SKY_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;
uniform mat4 u_proj;
uniform mat4 u_view;
out vec2 v_uv;
void main() {
  gl_Position = u_proj * u_view * vec4(a_pos, 1.0);
  v_uv = a_uv;
}`;

const SKY_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 o;
void main() {
  // (vanilla colour -14145496: 0xFF282828)
  o = vec4(texture(u_tex, v_uv).rgb * (40.0 / 255.0), 1.0);
}`;

/** vanilla rendertype_end_portal.fsh COLORS */
const COLORS: [number, number, number][] = [
  [0.022087, 0.098399, 0.110818], [0.011892, 0.095924, 0.089485], [0.027636, 0.101689, 0.100326], [0.046564, 0.109883, 0.114838],
  [0.064901, 0.117696, 0.097189], [0.063761, 0.086895, 0.123646], [0.084817, 0.111994, 0.16638], [0.097489, 0.15412, 0.091064],
  [0.106152, 0.131144, 0.195191], [0.097721, 0.110188, 0.187229], [0.133516, 0.138278, 0.148582], [0.070006, 0.243332, 0.235792],
  [0.196766, 0.142899, 0.214696], [0.047281, 0.315338, 0.32197], [0.204675, 0.39001, 0.302066], [0.080955, 0.314821, 0.661491],
];
/** vanilla RenderType END_PORTAL: EndPortalLayers = 15 */
const LAYERS = 15;

const PORTAL_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
uniform mat4 u_proj;
uniform mat4 u_view;
out vec4 v_proj;
void main() {
  vec4 p = u_proj * u_view * vec4(a_pos, 1.0);
  gl_Position = p;
  // (vanilla projection_from_position)
  vec4 q = p * 0.5;
  v_proj = vec4(q.x + q.w, q.y + q.w, p.z, p.w);
}`;

/** a GLSL float literal */
const f = (v: number): string => {
  const s = String(Number(v.toPrecision(9)));
  return /[.e]/.test(s) ? s : s + '.0';
};
const vec3 = (c: [number, number, number]): string => `vec3(${c.map(f).join(', ')})`;

/**
 * vanilla end_portal_layer(layer), for layer = i + 1: texProj0 * (scale·rotate) * translate * SCALE_TRANSLATE, i.e.
 * uv' = 0.5 · (s · R(θ) · uv + (17 / layer, (2 + layer / 1.5) · GameTime · 1.5)) + 0.25, where
 * s = (4.5 − layer / 4) · 2 and θ = radians((layer² · 4321 + layer · 9) · 2). The angles are worked out here in
 * double precision (a GPU's sin and cos of the 34000-odd radians of the last layers aren't to be trusted).
 */
export function portalFragmentShader(): string {
  const lines: string[] = [];
  for (let i = 0; i < LAYERS; i++) {
    const L = i + 1;
    const s = (4.5 - L / 4) * 2;
    const a = ((L * L * 4321 + L * 9) * 2 * Math.PI) / 180;
    const c = Math.cos(a) * s, sn = Math.sin(a) * s;
    lines.push(
      `  c += texture(u_portal, vec2(0.5 * (uv.x * ${f(c)} - uv.y * ${f(sn)} + ${f(17 / L)}) + 0.25, ` +
        `0.5 * (uv.x * ${f(sn)} + uv.y * ${f(c)} + ${f((2 + L / 1.5) * 1.5)} * u_time) + 0.25)).rgb * ${vec3(COLORS[i])};`,
    );
  }
  return `#version 300 es
precision highp float;
uniform sampler2D u_sky;
uniform sampler2D u_portal;
uniform float u_time;
in vec4 v_proj;
out vec4 o;
void main() {
  vec2 uv = v_proj.xy / v_proj.w;
  vec3 c = texture(u_sky, uv).rgb * ${vec3(COLORS[0])};
${lines.join('\n')}
  o = vec4(c, 1.0);
}`;
}

/** vanilla TheEndPortalRenderer.getOffsetDown / getOffsetUp */
const OFFSET_DOWN = 0.375, OFFSET_UP = 0.75;
/** vanilla BlockEntityRenderer.getViewDistance */
const VIEW_DISTANCE = 64;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export class EndRenderer {
  private readonly skyShader: Shader;
  private readonly portalShader: Shader;
  private readonly skyTex: WebGLTexture;
  private readonly portalTex: WebGLTexture;
  private readonly skyVao: WebGLVertexArrayObject;
  private readonly portalVao: WebGLVertexArrayObject;
  private readonly portalVbo: WebGLBuffer;
  private portalCap = 0;
  private verts = new Float32Array(0);
  private readonly screenVao: WebGLVertexArrayObject;

  constructor(private readonly gl: GL) {
    this.skyShader = new Shader(gl, SKY_VS, SKY_FS, 'endsky');
    this.portalShader = new Shader(gl, PORTAL_VS, portalFragmentShader(), 'endportal');
    const sky = endSkyTexture(), portal = endPortalTexture();
    // (vanilla: both sampled nearest and repeating)
    this.skyTex = createTexture(gl, sky.w, sky.h, new Uint8Array(sky.data.buffer), { nearest: true, clamp: false });
    this.portalTex = createTexture(gl, portal.w, portal.h, new Uint8Array(portal.data.buffer), { nearest: true, clamp: false });
    this.skyVao = this.buildSky();
    this.portalVao = gl.createVertexArray()!;
    this.portalVbo = gl.createBuffer()!;
    gl.bindVertexArray(this.portalVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.portalVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    // a quad over the whole screen, in clip space
    this.screenVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.screenVao);
    const sb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
  }

  /** the six faces: vanilla's bottom quad, then turned 90° and -90° about X, 180° about X, and 90° and -90° about Z */
  private buildSky(): WebGLVertexArrayObject {
    const gl = this.gl;
    const base: [number, number, number, number, number][] = [
      [-100, -100, -100, 0, 0], [-100, -100, 100, 0, 16], [100, -100, 100, 16, 16], [100, -100, -100, 16, 0],
    ];
    const turns: ((p: number[]) => number[])[] = [
      (p) => p,
      (p) => [p[0], -p[2], p[1]], // X +90°: (x, y cos − z sin, y sin + z cos)
      (p) => [p[0], p[2], -p[1]], // X −90°
      (p) => [p[0], -p[1], -p[2]], // X 180°
      (p) => [-p[1], p[0], p[2]], // Z +90°: (x cos − y sin, x sin + y cos, z)
      (p) => [p[1], -p[0], p[2]], // Z −90°
    ];
    const out: number[] = [];
    for (const t of turns) {
      const q = base.map((v) => [...t([v[0], v[1], v[2]]), v[3], v[4]]);
      for (const k of [0, 1, 2, 0, 2, 3]) out.push(...q[k]);
    }
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);
    return vao;
  }

  /** vanilla renderEndSky: drawn first, behind everything, without writing depth */
  renderSky(proj: Mat4, viewRot: Mat4): void {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    const s = this.skyShader.use();
    s.mat4('u_proj', proj);
    s.mat4('u_view', viewRot);
    s.i('u_tex', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.skyTex);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }

  /** vanilla RenderSystem.setShaderGameTime: the game time's place in the day, 0..1 */
  static shaderTime(gameTime: number, partial: number): number {
    return ((gameTime % 24000) + partial) / 24000;
  }

  /** every end portal within 64 blocks and in view: its top and bottom, opaque, depth-tested (camera-relative space) */
  renderPortals(world: World, camX: number, camY: number, camZ: number, proj: Mat4, view: Mat4, frustum: Frustum, time: number): void {
    let n = 0;
    for (const be of world.blockEntities.values()) {
      if (be.id !== 'end_portal') continue;
      const x = be.x - camX, y = be.y - camY, z = be.z - camZ;
      const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
      if (cx * cx + cy * cy + cz * cz >= VIEW_DISTANCE * VIEW_DISTANCE) continue;
      if (!frustum.testBox(x, y, z, x + 1, y + 1, z + 1)) continue;
      if ((n + 1) * 36 > this.verts.length) {
        const nv = new Float32Array(Math.max(this.verts.length * 2, 36 * 64));
        nv.set(this.verts);
        this.verts = nv;
      }
      const v = this.verts;
      let o = n * 36;
      // (vanilla renderFace: DOWN (0,f,0) (1,f,0) (1,f,1) (0,f,1), facing down; UP (0,g,1) (1,g,1) (1,g,0) (0,g,0), facing up)
      const d = y + OFFSET_DOWN, u = y + OFFSET_UP;
      const quads = [
        [x, d, z, x + 1, d, z, x + 1, d, z + 1, x, d, z + 1],
        [x, u, z + 1, x + 1, u, z + 1, x + 1, u, z, x, u, z],
      ];
      for (const q of quads)
        for (const k of [0, 1, 2, 0, 2, 3]) {
          v[o++] = q[k * 3];
          v[o++] = q[k * 3 + 1];
          v[o++] = q[k * 3 + 2];
        }
      n++;
    }
    if (!n) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.portalVbo);
    if (n * 36 > this.portalCap) {
      this.portalCap = this.verts.length;
      gl.bufferData(gl.ARRAY_BUFFER, this.portalCap * 4, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.verts, 0, n * 36);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    this.draw(this.portalVao, proj, view, time, n * 12);
  }

  /** the loading screen after an end portal: the starfield over the whole screen */
  renderScreen(time: number): void {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    this.draw(this.screenVao, IDENTITY, IDENTITY, time, 6);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }

  private draw(vao: WebGLVertexArrayObject, proj: Mat4 | Float32Array, view: Mat4 | Float32Array, time: number, count: number): void {
    const gl = this.gl;
    const s = this.portalShader.use();
    s.mat4('u_proj', proj as Float32Array);
    s.mat4('u_view', view as Float32Array);
    s.f('u_time', time);
    s.i('u_sky', 0);
    s.i('u_portal', 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.portalTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.skyTex);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, count);
    gl.bindVertexArray(null);
  }
}
