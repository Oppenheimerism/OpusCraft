// Particles: block break/hit (TerrainParticle), with vanilla physics.

import { EntityBatch } from './entityRenderer';
import { getStateModels } from './mesher';
import type { Atlas } from './atlas';
import type { World } from '../world/world';
import { COLLISION, BLOCKS, STATE_BLOCK, FLAGS, F_AIR } from '../world/block';
import type { Camera } from './renderer';
import type { SpriteRect } from '../world/models';
import { AABB, collideWithBoxes } from '../core/aabb';

interface Particle {
  x: number; y: number; z: number;
  xo: number; yo: number; zo: number;
  dx: number; dy: number; dz: number;
  age: number;
  lifetime: number;
  size: number;
  gravity: number;
  friction: number;
  onGround: boolean;
  // texture sub-rect
  u0: number; v0: number; u1: number; v1: number;
  r: number; g: number; b: number;
  kind: 'terrain';
}

export class ParticleEngine {
  private readonly list: Particle[] = [];
  readonly max = 16384;

  constructor(private readonly atlas: Atlas, private readonly world: World, private readonly tintOf: (x: number, y: number, z: number, state: number) => number) {}

  private sprite(state: number): SpriteRect | null {
    const m = getStateModels(state);
    if (!m) return null;
    const tex = m.variants[0].particle;
    return this.atlas.sprites[tex] ?? null;
  }

  private terrain(x: number, y: number, z: number, dx: number, dy: number, dz: number, state: number, bx: number, by: number, bz: number): Particle | null {
    const s = this.sprite(state);
    if (!s) return null;
    // vanilla TerrainParticle: random 4x4 sub-region of the texture
    const uo = Math.random() * 3, vo = Math.random() * 3;
    const us = (s.u1 - s.u0) / 16, vs = (s.v1 - s.v0) / 16;
    const u0 = s.u0 + (uo / 4) * 16 * us, v0 = s.v0 + (vo / 4) * 16 * vs;
    const u1 = u0 + 4 * us, v1 = v0 + 4 * vs;
    let r = 0.6, g = 0.6, b = 0.6;
    const block = BLOCKS[STATE_BLOCK[state]];
    if (block.name !== 'grass_block' && block.tint !== 'none') {
      const c = this.tintOf(bx, by, bz, state);
      r *= ((c >> 16) & 255) / 255;
      g *= ((c >> 8) & 255) / 255;
      b *= (c & 255) / 255;
    }
    const size = 0.1 * (Math.random() * 0.5 + 0.5) * 2 / 2;
    return {
      x, y, z, xo: x, yo: y, zo: z, dx, dy, dz, age: 0,
      lifetime: Math.floor(4 / (Math.random() * 0.9 + 0.1)),
      size, gravity: 1, friction: 0.98, onGround: false, u0, v0, u1, v1, r, g, b, kind: 'terrain',
    };
  }

  private add(p: Particle | null): void {
    if (!p) return;
    if (this.list.length >= this.max) this.list.shift();
    this.list.push(p);
  }

  /** vanilla ParticleEngine.destroy: 4x4x4 grid of particles over the block's shape */
  blockBreak(x: number, y: number, z: number, state: number): void {
    const boxes = COLLISION[state] ?? [[0, 0, 0, 1, 1, 1]];
    for (const bb of boxes.length ? boxes : [[0, 0, 0, 1, 1, 1] as number[]]) {
      const dxs = Math.max(bb[3] - bb[0], 0.0001), dys = Math.max(bb[4] - bb[1], 0.0001), dzs = Math.max(bb[5] - bb[2], 0.0001);
      const ix = Math.max(2, Math.ceil(dxs / 0.25)), iy = Math.max(2, Math.ceil(dys / 0.25)), iz = Math.max(2, Math.ceil(dzs / 0.25));
      for (let a = 0; a < ix; a++)
        for (let b = 0; b < iy; b++)
          for (let c = 0; c < iz; c++) {
            const d4 = (a + 0.5) / ix, d5 = (b + 0.5) / iy, d6 = (c + 0.5) / iz;
            const d7 = d4 * dxs + bb[0], d8 = d5 * dys + bb[1], d9 = d6 * dzs + bb[2];
            const p = this.terrain(x + d7, y + d8, z + d9, d4 - 0.5, d5 - 0.5, d6 - 0.5, state, x, y, z);
            if (p) {
              // vanilla Particle constructor random motion then scale
              const sp = (Math.random() + Math.random() + 1) * 0.15;
              let mx = p.dx + (Math.random() * 2 - 1) * 0.4, my = p.dy + (Math.random() * 2 - 1) * 0.4, mz = p.dz + (Math.random() * 2 - 1) * 0.4;
              const len = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
              mx = (mx / len) * sp * 0.4;
              my = (my / len) * sp * 0.4 + 0.1;
              mz = (mz / len) * sp * 0.4;
              p.dx = mx;
              p.dy = my;
              p.dz = mz;
            }
            this.add(p);
          }
    }
  }

  /** vanilla ParticleEngine.crack: one particle on the hit face */
  blockHit(x: number, y: number, z: number, state: number, face: number): void {
    if (FLAGS[state] & F_AIR) return;
    const boxes = COLLISION[state] ?? [[0, 0, 0, 1, 1, 1]];
    const bb = boxes[0] ?? [0, 0, 0, 1, 1, 1];
    const f = 0.1;
    let px = x + Math.random() * (bb[3] - bb[0] - f * 2) + f + bb[0];
    let py = y + Math.random() * (bb[4] - bb[1] - f * 2) + f + bb[1];
    let pz = z + Math.random() * (bb[5] - bb[2] - f * 2) + f + bb[2];
    if (face === 0) py = y + bb[1] - f;
    if (face === 1) py = y + bb[4] + f;
    if (face === 2) pz = z + bb[2] - f;
    if (face === 3) pz = z + bb[5] + f;
    if (face === 4) px = x + bb[0] - f;
    if (face === 5) px = x + bb[3] + f;
    const p = this.terrain(px, py, pz, 0, 0, 0, state, x, y, z);
    if (p) {
      const sp = (Math.random() + Math.random() + 1) * 0.15;
      let mx = (Math.random() * 2 - 1) * 0.4, my = (Math.random() * 2 - 1) * 0.4, mz = (Math.random() * 2 - 1) * 0.4;
      const len = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
      mx = (mx / len) * sp * 0.4 * 0.2;
      my = ((my / len) * sp * 0.4 + 0.1) * 0.2;
      mz = (mz / len) * sp * 0.4 * 0.2;
      p.dx = mx;
      p.dy = my;
      p.dz = mz;
      p.size *= 0.6;
    }
    this.add(p);
  }

  tick(): void {
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      p.xo = p.x;
      p.yo = p.y;
      p.zo = p.z;
      if (p.age++ >= p.lifetime) continue;
      p.dy -= 0.04 * p.gravity;
      this.move(p);
      p.dx *= p.friction;
      p.dy *= p.friction;
      p.dz *= p.friction;
      if (p.onGround) {
        p.dx *= 0.7;
        p.dz *= 0.7;
      }
      this.list[w++] = p;
    }
    this.list.length = w;
  }

  private move(p: Particle): void {
    const s = p.size;
    const box = new AABB(p.x - s, p.y - s, p.z - s, p.x + s, p.y + s, p.z + s);
    const boxes: AABB[] = [];
    const x0 = Math.floor(Math.min(box.minX, box.minX + p.dx)) , x1 = Math.floor(Math.max(box.maxX, box.maxX + p.dx));
    const y0 = Math.floor(Math.min(box.minY, box.minY + p.dy)), y1 = Math.floor(Math.max(box.maxY, box.maxY + p.dy));
    const z0 = Math.floor(Math.min(box.minZ, box.minZ + p.dz)), z1 = Math.floor(Math.max(box.maxZ, box.maxZ + p.dz));
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const st = this.world.getState(x, y, z);
          const c = COLLISION[st];
          if (!c) continue;
          for (const b of c) boxes.push(new AABB(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]));
        }
    const [rx, ry, rz] = collideWithBoxes(p.dx, p.dy, p.dz, box, boxes);
    p.x += rx;
    p.y += ry;
    p.z += rz;
    p.onGround = p.dy !== ry && p.dy < 0;
    if (p.dx !== rx) p.dx = 0;
    if (p.dz !== rz) p.dz = 0;
  }

  render(batch: EntityBatch, cam: Camera, partial: number, atlasTex: WebGLTexture): void {
    if (!this.list.length) return;
    batch.begin({ texture: atlasTex, cutoff: 0.1, blend: false, cull: false, lit: false, useLightmap: true });
    // billboard axes from camera
    const yr = (cam.yaw * Math.PI) / 180, pr = (cam.pitch * Math.PI) / 180;
    // camera right & up vectors in world space
    const rx = -Math.cos(yr), rz = -Math.sin(yr);
    const ux = -Math.sin(yr) * Math.sin(pr), uy = Math.cos(pr), uz = Math.cos(yr) * Math.sin(pr);
    for (const p of this.list) {
      const x = p.xo + (p.x - p.xo) * partial - cam.x;
      const y = p.yo + (p.y - p.yo) * partial - cam.y;
      const z = p.zo + (p.z - p.zo) * partial - cam.z;
      const l = this.world.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
      batch.lightB = (l & 15) * 16;
      batch.lightS = (l >> 4) * 16;
      const s = p.size;
      const ax = rx * s, az = rz * s;
      const bx = ux * s, by = uy * s, bz = uz * s;
      const v = [
        [x - ax - bx, y - by, z - az - bz, p.u1, p.v1],
        [x - ax + bx, y + by, z - az + bz, p.u1, p.v0],
        [x + ax + bx, y + by, z + az + bz, p.u0, p.v0],
        [x + ax - bx, y - by, z + az - bz, p.u0, p.v1],
      ];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const q = v[k];
        batch.vertexRaw(q[0], q[1], q[2], q[3], q[4], p.r, p.g, p.b, 1, 0, 1, 0);
      }
    }
    batch.flush();
  }

  clear(): void {
    this.list.length = 0;
  }

  get count(): number {
    return this.list.length;
  }
}
