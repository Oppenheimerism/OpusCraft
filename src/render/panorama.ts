// Title-screen panorama: generate a small world, render a 6-face cube map from
// a scenic spot, then display it spinning slowly (vanilla PanoramaRenderer).

import type { Game } from '../game/game';
import { WorkerPool } from '../worker/pool';
import { World } from '../world/world';
import { ChunkManager } from '../world/chunkManager';
import { Shader } from './gl';
import { mat4, perspective, rotateX, rotateY, DEG } from '../core/math';
import { Level } from '../game/level';
import { BLOCKS, STATE_BLOCK, FLAGS, F_REPLACEABLE, F_WATER } from '../world/block';

const VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;
uniform mat4 u_proj;
uniform mat4 u_view;
out vec2 v_uv;
void main() { gl_Position = u_proj * u_view * vec4(a_pos, 1.0); v_uv = a_uv; }`;
const FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_alpha;
in vec2 v_uv;
out vec4 o;
void main() { vec4 c = texture(u_tex, v_uv); o = vec4(c.rgb * u_alpha, 1.0); }`;

export const PANORAMA_SEED = 'panorama-7';
const SIZE = 1024;

export class Panorama {
  state: 'idle' | 'loading' | 'ready' = 'idle';
  private faces: WebGLTexture[] = [];
  private shader: Shader | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  spin = 0;
  alpha = 0;
  private pool: WorkerPool | null = null;
  private world: World | null = null;
  private cm: ChunkManager | null = null;
  private camPos: [number, number, number] = [0, 100, 0];
  private waitFrames = 0;

  constructor(private readonly game: Game) {}

  update(dt: number): void {
    if (this.state === 'idle') void this.start();
    if (this.state === 'loading') this.progress();
    this.spin = (this.spin + dt * 20 * 0.1 * this.game.opts.panoramaSpeed) % 360;
    if (this.state === 'ready') this.alpha = Math.min(1, this.alpha + dt * 1.5);
  }

  private async start(): Promise<void> {
    this.state = 'loading';
    const g = this.game;
    this.pool = new WorkerPool(Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 2)), PANORAMA_SEED, g.atlas.sprites);
    await this.pool.ready;
    this.world = new World();
    this.cm = new ChunkManager(this.world, this.pool, g.renderer.world);
    this.cm.renderDistance = 7;
    this.camPos = [8.5, 0, 8.5];
    this.cm.setCenter(this.camPos[0], this.camPos[2]);
  }

  private progress(): void {
    if (!this.cm || !this.world) return;
    this.cm.update();
    const cx = Math.floor(this.camPos[0]) >> 4, cz = Math.floor(this.camPos[2]) >> 4;
    // ready when all chunks within radius 6 are meshed
    let done = true;
    let total = 0, ready = 0;
    for (let dz = -6; dz <= 6; dz++)
      for (let dx = -6; dx <= 6; dx++) {
        if (dx * dx + dz * dz > 36) continue;
        total++;
        const c = this.world.getChunk(cx + dx, cz + dz);
        if (!c || c.dirty || c.meshing) done = false;
        else ready++;
      }
    this.progressFraction = ready / total;
    if (!done) return;
    if (this.waitFrames++ < 3) return;
    this.pickViewpoint();
    this.renderFaces();
    // free generation resources
    this.pool?.terminate();
    this.pool = null;
    for (const k of [...this.game.renderer.world.meshes.keys()]) this.game.renderer.world.dispose(k);
    this.world = null;
    this.cm = null;
    this.state = 'ready';
  }

  /** ground height ignoring trees and plants */
  private groundAt(x: number, z: number): number {
    const w = this.world!;
    let y = w.heightAt(x, z);
    for (; y > 0; y--) {
      const st = w.getState(x, y - 1, z);
      if (st === 0) continue;
      const n = BLOCKS[STATE_BLOCK[st]].name;
      if (n.endsWith('_leaves') || n.endsWith('_log') || FLAGS[st] & F_REPLACEABLE) continue;
      break;
    }
    return y;
  }

  /** choose a scenic spot: a low hilltop with open views, not inside trees */
  private pickViewpoint(): void {
    const w = this.world!;
    let best = -Infinity;
    let bx = 8, bz = 8, by = 70;
    for (let z = -24; z <= 24; z += 2)
      for (let x = -24; x <= 24; x += 2) {
        const h = this.groundAt(x, z);
        if (FLAGS[w.getState(x, h - 1, z)] & F_WATER) continue;
        let ring = 0, n = 0, over = 0, water = 0;
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * Math.PI * 2;
          for (const r of [8, 16, 28]) {
            const sx = Math.round(x + Math.cos(ang) * r), sz = Math.round(z + Math.sin(ang) * r);
            const sh = this.groundAt(sx, sz);
            ring += sh;
            n++;
            if (sh > h + 1) over++;
            if (FLAGS[w.getState(sx, sh - 1, sz)] & F_WATER) water++;
          }
        }
        // obstruction right around the camera
        let blocked = 0;
        for (let dz = -2; dz <= 2; dz++)
          for (let dx = -2; dx <= 2; dx++)
            for (let dy = 1; dy <= 4; dy++) if (w.getState(x + dx, h + dy, z + dz) !== 0) blocked++;
        const rel = h - ring / n;
        const score = Math.min(rel, 12) - over * 0.6 - blocked * 2 + Math.min(water, 12) * 0.25 - Math.hypot(x, z) * 0.02;
        if (score > best) {
          best = score;
          bx = x;
          bz = z;
          by = h;
        }
      }
    this.camPos = [bx + 0.5, by + 1.62 + 0.5, bz + 0.5];
  }

  private renderFaces(): void {
    const g = this.game;
    const gl = g.gl;
    const r = g.renderer;
    const fb = gl.createFramebuffer()!;
    const depth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, SIZE, SIZE);
    const ow = r.width, oh = r.height;
    const rd = r.renderDistance;
    r.renderDistance = 7;
    r.resize(SIZE, SIZE);
    const level = new Level(this.world!, PANORAMA_SEED);
    level.dayTime = 3000;
    const views: [number, number][] = [[180, 0], [270, 0], [0, 0], [90, 0], [180, -90], [180, 90]];
    for (let i = 0; i < 6; i++) {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, SIZE, SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      const [yaw, pitch] = views[i];
      r.render(
        { x: this.camPos[0], y: this.camPos[1], z: this.camPos[2], yaw, pitch, fov: 90 },
        { dayTime: level.dayTime, ticks: 0, partial: 0, weather: { rain: 0, thunder: 0, flash: 0 }, biome: this.world!.getBiome(Math.floor(this.camPos[0]), Math.floor(this.camPos[2])), gamma: 0.5, nightVision: 0, level },
      );
      this.faces.push(tex);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteRenderbuffer(depth);
    r.renderDistance = rd;
    r.resize(ow, oh);
  }

  /** loading progress 0..1 while generating */
  progressFraction = 0;

  render(alpha = 1): void {
    const g = this.game;
    const gl = g.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, g.canvas.width, g.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (this.state !== 'ready') return;
    if (!this.shader) {
      this.shader = new Shader(gl, VS, FS, 'panorama');
      this.vao = gl.createVertexArray()!;
      gl.bindVertexArray(this.vao);
      const vbo = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      // cube faces matching the capture views: 0 -Z(front) 1 -X?; built by view rotation instead
      const quad = [-1, -1, -1, 0, 0, 1, -1, -1, 1, 0, 1, 1, -1, 1, 1, -1, -1, -1, 0, 0, 1, 1, -1, 1, 1, -1, 1, -1, 0, 1];
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quad), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
      gl.bindVertexArray(null);
    }
    const proj = mat4();
    perspective(proj, 85 * DEG, g.canvas.width / g.canvas.height, 0.05, 10);
    const s = this.shader.use();
    s.mat4('u_proj', proj);
    s.i('u_tex', 0);
    s.f('u_alpha', alpha);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.vao);
    // each face texture was captured looking down -Z of a rotated camera; draw it on the
    // quad at z=-1 rotated back by the capture rotation
    const views: [number, number][] = [[180, 0], [270, 0], [0, 0], [90, 0], [180, -90], [180, 90]];
    for (let i = 0; i < 6; i++) {
      const [yaw, pitch] = views[i];
      const v = mat4();
      rotateX(v, v, 10 * DEG);
      rotateY(v, v, (-this.spin + 180) * DEG);
      // inverse of capture view (RotX(pitch)*RotY(yaw+180)) = RotY(-(yaw+180)) * RotX(-pitch)
      rotateY(v, v, -(yaw + 180) * DEG);
      rotateX(v, v, -pitch * DEG);
      s.mat4('u_view', v);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.faces[i]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }
}
