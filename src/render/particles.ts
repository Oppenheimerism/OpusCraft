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

/** vanilla TextureSheetParticle subclasses drawn from the particle sprite sheet */
interface SpriteParticle {
  kind: string;
  x: number; y: number; z: number;
  xo: number; yo: number; zo: number;
  dx: number; dy: number; dz: number;
  age: number;
  lifetime: number;
  size: number;
  gravity: number;
  friction: number;
  onGround: boolean;
  physics: boolean;
  speedUpWhenBlocked: boolean;
  /** quad size ramps up over the first frames (crit/heart/smoke) */
  grow: boolean;
  fullBright: boolean;
  frames: string[];
  /** fixed frame (random pick) or -1 = by age */
  frame: number;
  r: number; g: number; b: number;
  /** per-tick color decay (crit) */
  gDecay: number; bDecay: number;
  /** emitter particles spawn children and are never drawn */
  emitter?: 'explosion' | 'crit' | 'enchanted_hit';
  target?: { x: number; y: number; z: number; width: number; height: number };
  /** portal particles move along a curve from their start point */
  portal?: { x: number; y: number; z: number };
  /** sub-rectangle of the sprite (fractions), e.g. item crumbs */
  sub?: [number, number, number, number];
  /** squid ink sinks slowly in air */
  sinkInAir?: boolean;
}

export interface SpriteRectUV {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

const GENERIC = ['generic_0', 'generic_1', 'generic_2', 'generic_3', 'generic_4', 'generic_5', 'generic_6', 'generic_7'];
const EXPLOSION = Array.from({ length: 16 }, (_, i) => `explosion_${i}`);
const SWEEP = Array.from({ length: 8 }, (_, i) => `sweep_${i}`);

export class ParticleEngine {
  private readonly list: Particle[] = [];
  private readonly sprites: SpriteParticle[] = [];
  readonly max = 16384;
  spriteTexture: WebGLTexture | null = null;
  spriteRects: Record<string, SpriteRectUV> = {};

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

  // -------------------------------------------------------------------------
  // sprite particles (vanilla Particle constructors)

  private base(kind: string, x: number, y: number, z: number): SpriteParticle {
    return {
      kind, x, y, z, xo: x, yo: y, zo: z, dx: 0, dy: 0, dz: 0, age: 0,
      lifetime: Math.floor(4 / (Math.random() * 0.9 + 0.1)),
      size: 0.1 * (Math.random() * 0.5 + 0.5) * 2,
      gravity: 0, friction: 0.98, onGround: false, physics: true, speedUpWhenBlocked: false, grow: false, fullBright: false,
      frames: GENERIC, frame: -1, r: 1, g: 1, b: 1, gDecay: 1, bDecay: 1,
    };
  }

  /** vanilla Particle(level, x, y, z, xd, yd, zd): randomized initial motion */
  private withSpeed(p: SpriteParticle, xd: number, yd: number, zd: number): void {
    p.dx = xd + (Math.random() * 2 - 1) * 0.4;
    p.dy = yd + (Math.random() * 2 - 1) * 0.4;
    p.dz = zd + (Math.random() * 2 - 1) * 0.4;
    const f = (Math.random() + Math.random() + 1) * 0.15;
    const f1 = Math.sqrt(p.dx * p.dx + p.dy * p.dy + p.dz * p.dz) || 1;
    p.dx = (p.dx / f1) * f * 0.4;
    p.dy = (p.dy / f1) * f * 0.4 + 0.1;
    p.dz = (p.dz / f1) * f * 0.4;
  }

  private addSprite(p: SpriteParticle): void {
    if (this.sprites.length >= 4096) this.sprites.shift();
    this.sprites.push(p);
  }

  /** spawn by vanilla particle type name */
  spawn(kind: string, x: number, y: number, z: number, xd: number, yd: number, zd: number): void {
    switch (kind) {
      case 'poof': {
        const p = this.base(kind, x, y, z);
        p.gravity = -0.1;
        p.friction = 0.9;
        p.dx = xd + (Math.random() * 2 - 1) * 0.05;
        p.dy = yd + (Math.random() * 2 - 1) * 0.05;
        p.dz = zd + (Math.random() * 2 - 1) * 0.05;
        const f = Math.random() * 0.3 + 0.7;
        p.r = p.g = p.b = f;
        p.size = 0.1 * (Math.random() * Math.random() * 6 + 1);
        p.lifetime = Math.floor(16 / (Math.random() * 0.8 + 0.2)) + 2;
        this.addSprite(p);
        break;
      }
      case 'smoke':
      case 'large_smoke': {
        const mul = kind === 'large_smoke' ? 2.5 : 1;
        const p = this.base(kind, x, y, z);
        this.withSpeed(p, 0, 0, 0);
        p.friction = 0.96;
        p.gravity = -0.1;
        p.speedUpWhenBlocked = true;
        p.dx = p.dx * 0.1 + xd;
        p.dy = p.dy * 0.1 + yd;
        p.dz = p.dz * 0.1 + zd;
        const c = Math.random() * 0.3;
        p.r = p.g = p.b = c;
        p.size *= 0.75 * mul;
        p.lifetime = Math.max(1, Math.floor((8 / (Math.random() * 0.8 + 0.2)) * mul));
        p.grow = true;
        this.addSprite(p);
        break;
      }
      case 'explosion': {
        const p = this.base(kind, x, y, z);
        p.lifetime = 6 + Math.floor(Math.random() * 4);
        const f = Math.random() * 0.6 + 0.4;
        p.r = p.g = p.b = f;
        p.size = 2 * (1 - xd * 0.5);
        p.frames = EXPLOSION;
        p.fullBright = true;
        p.physics = false;
        p.friction = 1;
        this.addSprite(p);
        break;
      }
      case 'explosion_emitter': {
        const p = this.base(kind, x, y, z);
        p.lifetime = 8;
        p.emitter = 'explosion';
        this.addSprite(p);
        break;
      }
      case 'crit':
      case 'enchanted_hit':
      case 'damage_indicator': {
        const p = this.base(kind, x, y, z);
        p.friction = 0.7;
        p.gravity = 0.5;
        p.dx *= 0.1;
        p.dy *= 0.1;
        p.dz *= 0.1;
        p.dx += xd * 0.4;
        p.dy += (kind === 'damage_indicator' ? yd + 1 : yd) * 0.4;
        p.dz += zd * 0.4;
        const f = Math.random() * 0.3 + 0.6;
        p.r = p.g = p.b = f;
        if (kind === 'enchanted_hit') {
          p.r *= 0.3;
          p.g *= 0.8;
        }
        p.size *= 0.75;
        p.lifetime = kind === 'damage_indicator' ? 20 : Math.max(Math.floor(6 / (Math.random() * 0.8 + 0.6)), 1);
        p.physics = false;
        p.grow = true;
        p.gDecay = 0.96;
        p.bDecay = 0.9;
        p.frames = [kind === 'crit' ? 'critical_hit' : kind === 'enchanted_hit' ? 'enchanted_hit' : 'damage'];
        p.frame = 0;
        this.addSprite(p);
        break;
      }
      case 'heart': {
        const p = this.base(kind, x, y, z);
        this.withSpeed(p, xd, yd, zd);
        p.speedUpWhenBlocked = true;
        p.friction = 0.86;
        p.dx *= 0.01;
        p.dy *= 0.01;
        p.dz *= 0.01;
        p.dy += 0.1;
        p.size *= 1.5;
        p.lifetime = 16;
        p.physics = false;
        p.grow = true;
        p.frames = ['heart'];
        p.frame = 0;
        this.addSprite(p);
        break;
      }
      case 'sweep_attack': {
        const p = this.base(kind, x, y, z);
        p.lifetime = 4;
        const f = Math.random() * 0.6 + 0.4;
        p.r = p.g = p.b = f;
        p.size = 1 - xd * 0.5;
        p.frames = SWEEP;
        p.fullBright = true;
        p.physics = false;
        p.friction = 1;
        this.addSprite(p);
        break;
      }
      case 'portal': {
        // vanilla PortalParticle
        const p = this.base(kind, x, y, z);
        p.dx = xd;
        p.dy = yd;
        p.dz = zd;
        p.portal = { x, y, z };
        p.size = 0.1 * (Math.random() * 0.2 + 0.5);
        const f = Math.random() * 0.6 + 0.4;
        p.r = f * 0.9;
        p.g = f * 0.3;
        p.b = f;
        p.lifetime = Math.floor(Math.random() * 10) + 40;
        p.frame = Math.floor(Math.random() * 8);
        p.physics = false;
        this.addSprite(p);
        break;
      }
      case 'squid_ink': {
        // vanilla SquidInkParticle
        const p = this.base(kind, x, y, z);
        p.friction = 0.92;
        p.size = 0.5;
        p.r = p.g = p.b = 0;
        p.lifetime = Math.floor((0.5 * 12) / (Math.random() * 0.8 + 0.2));
        p.physics = false;
        p.dx = xd;
        p.dy = yd;
        p.dz = zd;
        p.sinkInAir = true;
        this.addSprite(p);
        break;
      }
      case 'item_slime': {
        // vanilla BreakingItemParticle with the slime ball sprite
        const p = this.base(kind, x, y, z);
        this.withSpeed(p, 0, 0, 0);
        p.gravity = 1;
        p.size /= 2;
        p.frames = ['item_slime_ball'];
        p.frame = 0;
        const uo = Math.random() * 3, vo = Math.random() * 3;
        p.sub = [uo / 4, vo / 4, (uo + 1) / 4, (vo + 1) / 4];
        this.addSprite(p);
        break;
      }
      default:
        break;
    }
  }

  /** vanilla TrackingEmitter: 3 ticks × 16 particles around an entity (crits) */
  emitAround(kind: 'crit' | 'enchanted_hit', e: { x: number; y: number; z: number; width: number; height: number }): void {
    const p = this.base('emitter', e.x, e.y, e.z);
    p.lifetime = 3;
    p.emitter = kind;
    p.target = e;
    this.addSprite(p);
  }

  /** vanilla LivingEntity.makePoofParticles */
  poof(e: { x: number; y: number; z: number; width: number; height: number }): void {
    for (let i = 0; i < 20; i++) {
      const g = () => {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      };
      const d0 = g() * 0.02, d1 = g() * 0.02, d2 = g() * 0.02;
      const x = e.x + e.width * (2 * Math.random() - 1) - d0 * 10;
      const y = e.y + e.height * Math.random() - d1 * 10;
      const z = e.z + e.width * (2 * Math.random() - 1) - d2 * 10;
      this.spawn('poof', x, y, z, d0, d1, d2);
    }
  }

  private tickSprites(): void {
    let w = 0;
    const list = this.sprites;
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      p.xo = p.x;
      p.yo = p.y;
      p.zo = p.z;
      if (p.age++ >= p.lifetime) continue;
      if (p.emitter === 'explosion') {
        for (let k = 0; k < 6; k++) {
          const x = p.x + (Math.random() - Math.random()) * 4, y = p.y + (Math.random() - Math.random()) * 4, z = p.z + (Math.random() - Math.random()) * 4;
          this.spawn('explosion', x, y, z, p.age / p.lifetime, 0, 0);
        }
        list[w++] = p;
        continue;
      }
      if (p.emitter && p.target) {
        const t = p.target;
        for (let k = 0; k < 16; k++) {
          const d0 = Math.random() * 2 - 1, d1 = Math.random() * 2 - 1, d2 = Math.random() * 2 - 1;
          if (d0 * d0 + d1 * d1 + d2 * d2 > 1) continue;
          this.spawn(p.emitter, t.x + t.width * (d0 / 4), t.y + t.height * (0.5 + d1 / 4), t.z + t.width * (d2 / 4), d0, d1 + 0.2, d2);
        }
        list[w++] = p;
        continue;
      }
      if (p.portal) {
        const f = p.age / p.lifetime;
        const f1 = -f + f * f * 2;
        const f2 = 1 - f1;
        p.x = p.portal.x + p.dx * f2;
        p.y = p.portal.y + p.dy * f2 + (1 - f);
        p.z = p.portal.z + p.dz * f2;
        list[w++] = p;
        continue;
      }
      if (p.sinkInAir) p.dy -= 0.0074;
      p.dy -= 0.04 * p.gravity;
      if (p.physics) this.move(p as unknown as Particle);
      else {
        p.x += p.dx;
        p.y += p.dy;
        p.z += p.dz;
      }
      if (p.speedUpWhenBlocked && p.y === p.yo) {
        p.dx *= 1.1;
        p.dz *= 1.1;
      }
      p.dx *= p.friction;
      p.dy *= p.friction;
      p.dz *= p.friction;
      if (p.onGround) {
        p.dx *= 0.7;
        p.dz *= 0.7;
      }
      p.g *= p.gDecay;
      p.b *= p.bDecay;
      list[w++] = p;
    }
    // particles spawned by emitters this tick were appended after n
    for (let i = n; i < list.length; i++) list[w++] = list[i];
    list.length = w;
  }

  tick(): void {
    this.tickSprites();
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

  /** draw sprite particles (after terrain particles) */
  renderSprites(batch: EntityBatch, cam: Camera, partial: number): void {
    if (!this.sprites.length || !this.spriteTexture) return;
    batch.begin({ texture: this.spriteTexture, cutoff: 0.1, blend: false, cull: false, lit: false, useLightmap: true });
    const yr = (cam.yaw * Math.PI) / 180, pr = (cam.pitch * Math.PI) / 180;
    const rx = -Math.cos(yr), rz = -Math.sin(yr);
    const ux = -Math.sin(yr) * Math.sin(pr), uy = Math.cos(pr), uz = Math.cos(yr) * Math.sin(pr);
    for (const p of this.sprites) {
      if (p.emitter) continue;
      const name = p.frame >= 0 ? p.frames[p.frame] : p.frames[Math.min(p.frames.length - 1, Math.floor((p.age * (p.frames.length - 1)) / Math.max(1, p.lifetime)))];
      const r = this.spriteRects[name];
      if (!r) continue;
      const x = p.xo + (p.x - p.xo) * partial - cam.x;
      const y = p.yo + (p.y - p.yo) * partial - cam.y;
      const z = p.zo + (p.z - p.zo) * partial - cam.z;
      if (p.fullBright) {
        batch.lightB = 240;
        batch.lightS = 240;
      } else {
        const l = this.world.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
        batch.lightB = (l & 15) * 16;
        batch.lightS = (l >> 4) * 16;
      }
      let s = p.size;
      if (p.grow) s *= Math.max(0, Math.min(1, ((p.age + partial) / p.lifetime) * 32));
      if (p.portal) {
        let f = (p.age + partial) / p.lifetime;
        f = 1 - f;
        f *= f;
        s *= 1 - f;
      }
      let ru0 = r.u0, rv0 = r.v0, ru1 = r.u1, rv1 = r.v1;
      if (p.sub) {
        const du = r.u1 - r.u0, dv = r.v1 - r.v0;
        ru0 = r.u0 + du * p.sub[0];
        rv0 = r.v0 + dv * p.sub[1];
        ru1 = r.u0 + du * p.sub[2];
        rv1 = r.v0 + dv * p.sub[3];
      }
      const ax = rx * s, az = rz * s;
      const bx = ux * s, by = uy * s, bz = uz * s;
      const v = [
        [x - ax - bx, y - by, z - az - bz, ru1, rv1],
        [x - ax + bx, y + by, z - az + bz, ru1, rv0],
        [x + ax + bx, y + by, z + az + bz, ru0, rv0],
        [x + ax - bx, y - by, z + az - bz, ru0, rv1],
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
    this.sprites.length = 0;
  }

  get count(): number {
    return this.list.length + this.sprites.length;
  }
}
