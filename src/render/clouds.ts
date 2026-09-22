// Fancy 3D clouds (vanilla style): 12x12x4 block cells from a 256x256 map,
// drifting west, shaded per face, two-pass (depth prepass) translucency.

import { GL, Shader } from './gl';
import { Mat4 } from '../core/math';
import { cloudTexture } from '../textures/env';

const VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in float a_shade;
uniform mat4 u_proj;
uniform mat4 u_view;
uniform vec3 u_offset;
out float v_shade;
out float v_dist;
void main() {
  vec3 p = a_pos + u_offset;
  gl_Position = u_proj * u_view * vec4(p, 1.0);
  v_shade = a_shade;
  v_dist = max(length(p.xz), abs(p.y));
}`;

const FS = `#version 300 es
precision highp float;
uniform vec4 u_color;
uniform vec4 u_fogColor;
uniform vec2 u_fog;
in float v_shade;
in float v_dist;
out vec4 o;
void main() {
  vec4 c = vec4(u_color.rgb * v_shade, u_color.a);
  if (v_dist > u_fog.x) {
    float f = v_dist < u_fog.y ? smoothstep(u_fog.x, u_fog.y, v_dist) : 1.0;
    c.rgb = mix(c.rgb, u_fogColor.rgb, f);
    c.a *= 1.0 - f;
  }
  o = c;
}`;

const CELL = 12;
const HEIGHT = 4;
const CLOUD_Y = 192;
const RADIUS = 24; // cells

export class CloudRenderer {
  private readonly shader: Shader;
  private readonly map: Uint8Array;
  private readonly vao: WebGLVertexArrayObject;
  private readonly vbo: WebGLBuffer;
  private count = 0;
  private builtAt: [number, number, number] = [NaN, NaN, NaN];

  constructor(private readonly gl: GL) {
    this.shader = new Shader(gl, VS, FS, 'clouds');
    this.map = cloudTexture();
    this.vao = gl.createVertexArray()!;
    this.vbo = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
    gl.bindVertexArray(null);
  }

  private cell(ix: number, iz: number): boolean {
    return this.map[((iz & 255) << 8) | (ix & 255)] === 1;
  }

  /** Build geometry for cells around (baseX, baseZ) cell coords. relY = cloud bottom - camY */
  private build(baseX: number, baseZ: number, viewBand: number): void {
    const v: number[] = [];
    const push = (x: number, y: number, z: number, s: number) => v.push(x, y, z, s);
    const quad = (a: number[], b: number[], c: number[], d: number[], s: number) => {
      push(a[0], a[1], a[2], s); push(b[0], b[1], b[2], s); push(c[0], c[1], c[2], s);
      push(a[0], a[1], a[2], s); push(c[0], c[1], c[2], s); push(d[0], d[1], d[2], s);
    };
    for (let dz = -RADIUS; dz <= RADIUS; dz++)
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        if (dx * dx + dz * dz > RADIUS * RADIUS) continue;
        const ix = baseX + dx, iz = baseZ + dz;
        if (!this.cell(ix, iz)) continue;
        const x0 = dx * CELL, z0 = dz * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
        const y0 = 0, y1 = HEIGHT;
        // top (visible from above), bottom (from below)
        if (viewBand >= 0) quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], 1.0);
        if (viewBand <= 0) quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], 0.7);
        if (!this.cell(ix - 1, iz)) quad([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], 0.9);
        if (!this.cell(ix + 1, iz)) quad([x1, y1, z1], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], 0.9);
        if (!this.cell(ix, iz - 1)) quad([x1, y1, z0], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], 0.8);
        if (!this.cell(ix, iz + 1)) quad([x0, y1, z1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], 0.8);
      }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
    this.count = v.length / 4;
  }

  render(proj: Mat4, view: Mat4, camX: number, camY: number, camZ: number, time: number, color: [number, number, number], fog: [number, number, number], rdBlocks: number): void {
    const gl = this.gl;
    // clouds drift toward -X
    const offX = camX + time * 0.03;
    const fx = offX / CELL, fz = (camZ + 0.33) / CELL;
    const baseX = Math.floor(fx), baseZ = Math.floor(fz);
    const band = camY < CLOUD_Y + 0.33 ? -1 : camY > CLOUD_Y + HEIGHT ? 1 : 0;
    if (baseX !== this.builtAt[0] || baseZ !== this.builtAt[1] || band !== this.builtAt[2]) {
      this.build(baseX, baseZ, band === 0 ? 0 : band);
      this.builtAt = [baseX, baseZ, band];
    }
    // world position of cell (baseX, baseZ) relative to camera
    const ox = (baseX - fx) * CELL, oz = (baseZ - fz) * CELL;
    const oy = CLOUD_Y + 0.33 - camY;
    const s = this.shader.use();
    s.mat4('u_proj', proj);
    s.mat4('u_view', view);
    s.vec3('u_offset', ox, oy, oz);
    s.vec4('u_color', color[0], color[1], color[2], 0.8);
    s.vec4('u_fogColor', fog[0], fog[1], fog[2], 1);
    const fogEnd = Math.max(rdBlocks * 2, 256);
    s.vec2('u_fog', fogEnd * 0.5, fogEnd);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    // depth prepass
    gl.colorMask(false, false, false, false);
    gl.depthMask(true);
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
    gl.colorMask(true, true, true, true);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthFunc(gl.EQUAL);
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);
  }
}
