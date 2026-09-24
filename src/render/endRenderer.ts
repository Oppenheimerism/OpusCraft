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
//
// The end gateway (vanilla TheEndGatewayRenderer, RenderType.endGateway): the
// same starfield with a sixteenth layer, on every face of the whole block that
// isn't against something solid, seen from up to 256 blocks away. While it
// opens (its first 10 seconds) a magenta beam shoots up and down from it as
// high as the world and falls back; each time it's used, and every 2 minutes,
// a purple one 50 blocks each way (vanilla BeaconRenderer.renderBeaconBeam:
// an opaque turning core and a faint glow round it).

import { GL, Shader, createTexture } from './gl';
import type { Frustum, Mat4 } from '../core/math';
import type { World } from '../world/world';
import { EndGatewayBlockEntity } from '../world/blockEntity';
import { endSkyTexture, endPortalTexture, endGatewayBeamTexture } from '../textures/endEnv';
import { PoseStack, type EntityBatch, type DrawState } from './entityRenderer';

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
/** vanilla rendertype_end_portal's PORTAL_LAYERS: 15 for the portal, 16 for the gateway */
const PORTAL_LAYERS = 15, GATEWAY_LAYERS = 16;

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
export function portalFragmentShader(layers = PORTAL_LAYERS): string {
  const lines: string[] = [];
  for (let i = 0; i < layers; i++) {
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
/** vanilla BlockEntityRenderer.getViewDistance, and TheEndGatewayRenderer's */
const VIEW_DISTANCE = 64, GATEWAY_VIEW_DISTANCE = 256;
/** vanilla DyeColor.MAGENTA and PURPLE getTextureDiffuseColor: the gateway's beams */
const MAGENTA = 0xc74ebd, PURPLE = 0x8932b8;

/**
 * vanilla TheEndPortalRenderer.renderCube's faces, in its order (south, north, east, west, down, up), each four
 * corners of the unit block, `d` and `u` the heights of the bottom and top
 */
function cubeFaces(d: number, u: number): number[][] {
  return [
    [0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1],
    [0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0],
    [1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 0],
    [0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0],
    [0, d, 0, 1, d, 0, 1, d, 1, 0, d, 1],
    [0, u, 1, 1, u, 1, 1, u, 0, 0, u, 0],
  ];
}
/** which way each of those faces looks (0 down, 1 up, 2 north, 3 south, 4 west, 5 east) */
const FACE_DIRS = [3, 2, 5, 4, 0, 1];
const PORTAL_FACES = cubeFaces(OFFSET_DOWN, OFFSET_UP), GATEWAY_FACES = cubeFaces(0, 1);
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export class EndRenderer {
  private readonly skyShader: Shader;
  private readonly portalShader: Shader;
  private readonly gatewayShader: Shader;
  private beamTex: WebGLTexture | null = null;
  private readonly pose = new PoseStack();
  private readonly v = [0, 0, 0];
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
    this.gatewayShader = new Shader(gl, PORTAL_VS, portalFragmentShader(GATEWAY_LAYERS), 'endgateway');
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

  /**
   * every end portal within 64 blocks and in view (its top and bottom) and every end gateway within 256 (the faces
   * of it that show): opaque, depth-tested, in camera-relative space
   */
  renderPortals(world: World, camX: number, camY: number, camZ: number, proj: Mat4, view: Mat4, frustum: Frustum, time: number): void {
    const portals = this.collect(world, camX, camY, camZ, frustum, false, 0);
    const gateways = this.collect(world, camX, camY, camZ, frustum, true, portals);
    const n = portals + gateways;
    if (!n) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.portalVbo);
    if (n * 18 > this.portalCap) {
      this.portalCap = this.verts.length;
      gl.bufferData(gl.ARRAY_BUFFER, this.portalCap * 4, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.verts, 0, n * 18);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    if (portals) this.draw(this.portalShader, this.portalVao, proj, view, time, 0, portals * 6);
    if (gateways) this.draw(this.gatewayShader, this.portalVao, proj, view, time, portals * 6, gateways * 6);
  }

  /** the faces to draw of the end portals (or gateways), as triangles into verts after the first `from` faces; how many */
  private collect(world: World, camX: number, camY: number, camZ: number, frustum: Frustum, gateway: boolean, from: number): number {
    let n = from;
    const dist = gateway ? GATEWAY_VIEW_DISTANCE : VIEW_DISTANCE;
    const faces = gateway ? GATEWAY_FACES : PORTAL_FACES;
    for (const be of world.blockEntities.values()) {
      if (be.id !== (gateway ? 'end_gateway' : 'end_portal')) continue;
      const x = be.x - camX, y = be.y - camY, z = be.z - camZ;
      const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
      if (cx * cx + cy * cy + cz * cz >= dist * dist) continue;
      if (!frustum.testBox(x, y, z, x + 1, y + 1, z + 1)) continue;
      for (let f = 0; f < 6; f++) {
        // (vanilla TheEndPortalBlockEntity.shouldRenderFace: just the top and bottom; the gateway's, what shows)
        if (!gateway && f < 4) continue;
        if (gateway && !(be as EndGatewayBlockEntity).shouldRenderFace(world, FACE_DIRS[f])) continue;
        if ((n + 1) * 18 > this.verts.length) {
          const nv = new Float32Array(Math.max(this.verts.length * 2, 18 * 256));
          nv.set(this.verts);
          this.verts = nv;
        }
        const q = faces[f], v = this.verts;
        let o = n * 18;
        for (const k of [0, 1, 2, 0, 2, 3]) {
          v[o++] = x + q[k * 3];
          v[o++] = y + q[k * 3 + 1];
          v[o++] = z + q[k * 3 + 2];
        }
        n++;
      }
    }
    return n - from;
  }

  /**
   * vanilla TheEndGatewayRenderer.render's beams, for the gateways opening or cooling down within 256 blocks whose
   * section is in view: from the block up and down by sin(progress · π) of the world's height (opening, magenta)
   * or of 50 (cooling down, purple)
   */
  renderGatewayBeams(b: EntityBatch, world: World, gameTime: number, camX: number, camY: number, camZ: number, frustum: Frustum, partial: number): void {
    for (const be of world.blockEntities.values()) {
      if (!(be instanceof EndGatewayBlockEntity)) continue;
      const spawning = be.isSpawning();
      if (!spawning && !be.isCoolingDown()) continue;
      const x = be.x - camX, y = be.y - camY, z = be.z - camZ;
      if ((x + 0.5) ** 2 + (y + 0.5) ** 2 + (z + 0.5) ** 2 >= GATEWAY_VIEW_DISTANCE ** 2) continue;
      // (vanilla draws the block entities of the sections it draws)
      const sx = Math.floor(be.x / 16) * 16 - camX, sy = Math.floor(be.y / 16) * 16 - camY, sz = Math.floor(be.z / 16) * 16 - camZ;
      if (!frustum.testBox(sx, sy, sz, sx + 16, sy + 16, sz + 16)) continue;
      const f = Math.sin((spawning ? be.spawnPercent(partial) : be.cooldownPercent(partial)) * Math.PI);
      const i = Math.floor(f * (spawning ? world.dim.maxY : 50));
      this.pose.reset();
      this.pose.translate(x, y, z);
      this.beaconBeam(b, partial, f, gameTime, -i, i * 2, spawning ? MAGENTA : PURPLE, 0.15, 0.175);
    }
  }

  /**
   * vanilla BeaconRenderer.renderBeaconBeam: from `yOffset` up `height`, a core `beamRadius` across turning with the
   * time, then a glow `glowRadius` across (alpha 32) round it, the texture scrolling along both
   */
  private beaconBeam(b: EntityBatch, partial: number, textureScale: number, gameTime: number, yOffset: number, height: number, color: number, beamRadius: number, glowRadius: number): void {
    if (!this.beamTex) {
      const t = endGatewayBeamTexture();
      // (vanilla: sampled nearest, repeating)
      this.beamTex = createTexture(this.gl, t.w, t.h, new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength), { nearest: true, clamp: false });
    }
    const top = yOffset + height;
    const f = (((gameTime % 40) + 40) % 40) + partial;
    const f1 = height < 0 ? f : -f;
    const frac = (v: number) => v - Math.floor(v);
    const f2 = frac(f1 * 0.2 - Math.floor(f1 * 0.1));
    const r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, bl = (color & 255) / 255;
    const pose = this.pose;
    pose.translate(0.5, 0, 0.5);
    // the core: a diamond turning 2.25° a tick, opaque (vanilla RenderType.beaconBeam(texture, false))
    pose.push();
    pose.rotY(f * 2.25 - 45);
    const v0 = -1 + f2;
    b.setOverlay(0, 0, 0, 0);
    b.begin(this.beamState(false));
    this.beamPart(b, r, g, bl, 1, yOffset, top, 0, beamRadius, beamRadius, 0, -beamRadius, 0, 0, -beamRadius, 0, 1, height * textureScale * (0.5 / beamRadius) + v0, v0);
    pose.pop();
    // the glow: a square round it, faint, not writing depth (vanilla RenderType.beaconBeam(texture, true))
    b.begin(this.beamState(true));
    const G = glowRadius;
    this.beamPart(b, r, g, bl, 32 / 255, yOffset, top, -G, -G, G, -G, -G, G, G, G, 0, 1, height * textureScale + v0, v0);
  }

  private beamState(glow: boolean): DrawState {
    return glow
      ? { texture: this.beamTex!, cutoff: 0, blend: true, cull: true, lit: false, useLightmap: false, depthWrite: false }
      : { texture: this.beamTex!, cutoff: 0, blend: false, cull: true, lit: false, useLightmap: false };
  }

  /** vanilla BeaconRenderer.renderPart: the sides (x1, z1) → (x2, z2), (x4, z4) → (x3, z3), (x2, z2) → (x4, z4) and (x3, z3) → (x1, z1) */
  private beamPart(b: EntityBatch, r: number, g: number, bl: number, a: number, minY: number, maxY: number, x1: number, z1: number, x2: number, z2: number, x3: number, z3: number, x4: number, z4: number, minU: number, maxU: number, minV: number, maxV: number): void {
    this.beamQuad(b, r, g, bl, a, minY, maxY, x1, z1, x2, z2, minU, maxU, minV, maxV);
    this.beamQuad(b, r, g, bl, a, minY, maxY, x4, z4, x3, z3, minU, maxU, minV, maxV);
    this.beamQuad(b, r, g, bl, a, minY, maxY, x2, z2, x4, z4, minU, maxU, minV, maxV);
    this.beamQuad(b, r, g, bl, a, minY, maxY, x3, z3, x1, z1, minU, maxU, minV, maxV);
  }

  /** vanilla BeaconRenderer.renderQuad, full bright (as two triangles) */
  private beamQuad(b: EntityBatch, r: number, g: number, bl: number, a: number, minY: number, maxY: number, minX: number, minZ: number, maxX: number, maxZ: number, minU: number, maxU: number, minV: number, maxV: number): void {
    const P = this.v, pose = this.pose;
    const corners = [
      [minX, maxY, minZ, maxU, minV],
      [minX, minY, minZ, maxU, maxV],
      [maxX, minY, maxZ, minU, maxV],
      [maxX, maxY, maxZ, minU, minV],
    ];
    b.lightB = b.lightS = 240;
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const c = corners[k];
      pose.transform(c[0], c[1], c[2], P);
      b.vertexRaw(P[0], P[1], P[2], c[3], c[4], r, g, bl, a, 0, 1, 0);
    }
  }

  /** the loading screen after an end portal: the starfield over the whole screen */
  renderScreen(time: number): void {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    this.draw(this.portalShader, this.screenVao, IDENTITY, IDENTITY, time, 0, 6);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }

  private draw(shader: Shader, vao: WebGLVertexArrayObject, proj: Mat4 | Float32Array, view: Mat4 | Float32Array, time: number, first: number, count: number): void {
    const gl = this.gl;
    const s = shader.use();
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
    gl.drawArrays(gl.TRIANGLES, first, count);
    gl.bindVertexArray(null);
  }
}
