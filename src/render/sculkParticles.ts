// The deep dark's particles: the vibration flying to a sculk sensor (vanilla VibrationSignalParticle), the rings a
// shrieker sends up (ShriekParticle), the glow of a charge creeping over sculk and its pop as it's spent
// (SculkChargeParticle, SculkChargePopParticle), the souls over a blooming catalyst (SoulParticle, sculk_soul) and
// the specks an active sensor gives off, sculk teal turning redstone red (DustColorTransitionParticle), and (M4) the
// rings of a warden's sonic boom (SonicBoomParticle). All but the specks glow in the dark; they and the booms are
// drawn opaque, the rest translucent; the vibration and the rings are quads turned in the world rather than toward
// the camera. The ParticleEngine hands these over and ticks and draws them with its own.

import type { EntityBatch } from './entityRenderer';
import type { Camera } from './renderer';
import type { SpriteRectUV } from './particles';
import type { World } from '../world/world';
import { COLLISION } from '../world/block';
import { AABB, collideWithBoxes } from '../core/aabb';

type Vec3 = [number, number, number];

interface SculkParticle {
  kind: 'vibration' | 'shriek' | 'sculk_charge' | 'sculk_charge_pop' | 'sculk_soul' | 'dust_color_transition' | 'sonic_boom';
  x: number; y: number; z: number;
  xo: number; yo: number; zo: number;
  dx: number; dy: number; dz: number;
  age: number;
  lifetime: number;
  /** vanilla quadSize */
  size: number;
  friction: number;
  /** vanilla hasPhysics: it collides with blocks (and stops for good when something stops it rising or falling) */
  physics: boolean;
  stopped: boolean;
  onGround: boolean;
  /** vanilla speedUpWhenYMotionIsBlocked */
  speedUpWhenBlocked: boolean;
  frames: string[];
  roll: number;
  oRoll: number;
  r: number; g: number; b: number;
  alpha: number;
  /** getLightColor 240 */
  fullBright: boolean;
  /** VibrationSignalParticle: where it's headed, and its heading (yaw and pitch, now and last tick) */
  target?: () => Vec3 | null;
  yRot?: number; oYRot?: number; pitch?: number; oPitch?: number;
  /** ShriekParticle: ticks before it starts */
  delay?: number;
  /** DustColorTransitionParticle's two colours */
  from?: Vec3; to?: Vec3;
}

/** vanilla particles/sculk_charge.json, sculk_charge_pop.json, sculk_soul.json */
const CHARGE = Array.from({ length: 7 }, (_, i) => `sculk_charge_${i}`);
const CHARGE_POP = Array.from({ length: 4 }, (_, i) => `sculk_charge_pop_${i}`);
const SOUL = Array.from({ length: 11 }, (_, i) => `sculk_soul_${i}`);
/** vanilla particles/dust_color_transition.json: the dust's frames (here the generic puffs, largest first) */
const DUST = Array.from({ length: 8 }, (_, i) => `generic_${i}`);
/** (M4: the warden) vanilla particles/sonic_boom.json */
const BOOM = Array.from({ length: 16 }, (_, i) => `sonic_boom_${i}`);

const lerp = (t: number, a: number, b: number): number => a + (b - a) * t;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** JOML's rotationY and rotateX on a vector (right-handed, as vanilla's Quaternionf) */
const rotY = (v: Vec3, a: number): Vec3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
};
const rotX = (v: Vec3, a: number): Vec3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
};

export class SculkParticles {
  private readonly list: SculkParticle[] = [];

  constructor(private readonly world: World) {}

  /** vanilla Particle(level, x, y, z): no speed, a random quad size, and a lifetime of 4 to 40 ticks */
  private base(kind: SculkParticle['kind'], x: number, y: number, z: number): SculkParticle {
    return {
      kind, x, y, z, xo: x, yo: y, zo: z, dx: 0, dy: 0, dz: 0, age: 0,
      lifetime: Math.floor(4 / (Math.random() * 0.9 + 0.1)),
      size: 0.1 * (Math.random() * 0.5 + 0.5) * 2,
      friction: 0.98, physics: true, stopped: false, onGround: false, speedUpWhenBlocked: false,
      frames: DUST, roll: 0, oRoll: 0, r: 1, g: 1, b: 1, alpha: 1, fullBright: true,
    };
  }

  /** vanilla Particle(level, x, y, z, xd, yd, zd): the given speed jittered, then scaled to a random 0.045-0.135 */
  private withSpeed(p: SculkParticle, xd: number, yd: number, zd: number): void {
    p.dx = xd + (Math.random() * 2 - 1) * 0.4;
    p.dy = yd + (Math.random() * 2 - 1) * 0.4;
    p.dz = zd + (Math.random() * 2 - 1) * 0.4;
    const f = (Math.random() + Math.random() + 1) * 0.15;
    const f1 = Math.sqrt(p.dx * p.dx + p.dy * p.dy + p.dz * p.dz) || 1;
    p.dx = (p.dx / f1) * f * 0.4;
    p.dy = (p.dy / f1) * f * 0.4 + 0.1;
    p.dz = (p.dz / f1) * f * 0.4;
  }

  private add(p: SculkParticle): void {
    if (this.list.length >= 4096) this.list.shift();
    this.list.push(p);
  }

  /**
   * vanilla VibrationSignalParticle: from (x, y, z) to wherever `target` is (it follows it), arriving in `ticks`;
   * gone if the target is
   */
  vibration(x: number, y: number, z: number, target: () => Vec3 | null, ticks: number): void {
    const p = this.base('vibration', x, y, z);
    p.size = 0.3;
    p.lifetime = ticks;
    p.frames = ['vibration'];
    p.target = target;
    const t = target();
    p.yRot = p.oYRot = t ? Math.atan2(x - t[0], z - t[2]) : 0;
    p.pitch = p.oPitch = t ? Math.atan2(y - t[1], Math.hypot(x - t[0], z - t[2])) : 0;
    this.add(p);
  }

  /** vanilla ShriekParticle: a ring rising from (x, y, z) for a second and a half, `delay` ticks from now */
  shriek(x: number, y: number, z: number, delay: number): void {
    const p = this.base('shriek', x, y, z);
    p.size = 0.85;
    p.delay = delay;
    p.lifetime = 30;
    p.dy = 0.1;
    p.frames = ['shriek'];
    this.add(p);
  }

  /** vanilla SculkChargeParticle: a charge's glow at (x, y, z), drifting at exactly the speed given, turned `roll` */
  sculkCharge(x: number, y: number, z: number, xd: number, yd: number, zd: number, roll: number): void {
    const p = this.base('sculk_charge', x, y, z);
    p.friction = 0.96;
    p.size *= 1.5;
    p.physics = false;
    p.dx = xd;
    p.dy = yd;
    p.dz = zd;
    p.roll = p.oRoll = roll;
    p.lifetime = 8 + Math.floor(Math.random() * 12);
    p.frames = CHARGE;
    this.add(p);
  }

  /** vanilla DustColorTransitionParticle (DustParticleBase): a speck fading from one colour to the other as it shrinks */
  dustTransition(x: number, y: number, z: number, xd: number, yd: number, zd: number, from: Vec3, to: Vec3, scale: number): void {
    const p = this.base('dust_color_transition', x, y, z);
    this.withSpeed(p, xd, yd, zd);
    p.friction = 0.96;
    p.speedUpWhenBlocked = true;
    p.dx *= 0.1;
    p.dy *= 0.1;
    p.dz *= 0.1;
    // (a brightness for both ends of it)
    const f = Math.random() * 0.4 + 0.6;
    const randomize = (c: Vec3): Vec3 => [(Math.random() * 0.2 + 0.8) * c[0] * f, (Math.random() * 0.2 + 0.8) * c[1] * f, (Math.random() * 0.2 + 0.8) * c[2] * f];
    p.from = randomize(from);
    p.to = randomize(to);
    p.size *= 0.75 * scale;
    p.lifetime = Math.max(1, Math.floor(Math.floor(8 / (Math.random() * 0.8 + 0.2)) * scale));
    p.fullBright = false;
    p.alpha = 1;
    this.add(p);
  }

  /** the plain deep-dark particle types by name (vanilla sculk_soul, sculk_charge_pop, sonic_boom); false if it isn't one */
  spawn(kind: string, x: number, y: number, z: number, xd: number, yd: number, zd: number): boolean {
    if (kind === 'sonic_boom') {
      // (M4: the warden) vanilla SonicBoomParticle, a HugeExplosionParticle: still, its own light, a random grey
      // over it, three blocks across, its sixteen frames over sixteen ticks
      const p = this.base(kind, x, y, z);
      const f = Math.random() * 0.6 + 0.4;
      p.r = p.g = p.b = f;
      p.size = 1.5;
      p.lifetime = 16;
      p.physics = false;
      p.frames = BOOM;
      this.add(p);
      return true;
    }
    if (kind === 'sculk_charge_pop') {
      // vanilla SculkChargePopParticle
      const p = this.base(kind, x, y, z);
      p.friction = 0.96;
      p.physics = false;
      p.dx = xd;
      p.dy = yd;
      p.dz = zd;
      p.lifetime = 6 + Math.floor(Math.random() * 4);
      p.frames = CHARGE_POP;
      this.add(p);
      return true;
    }
    if (kind === 'sculk_soul') {
      // vanilla SoulParticle.EmissiveProvider (a RisingParticle): barely drifting, glowing, half as big again
      const p = this.base(kind, x, y, z);
      this.withSpeed(p, xd, yd, zd);
      p.friction = 0.96;
      p.dx = p.dx * 0.01 + xd;
      p.dy = p.dy * 0.01 + yd;
      p.dz = p.dz * 0.01 + zd;
      p.x = p.xo = x + (Math.random() - Math.random()) * 0.05;
      p.y = p.yo = y + (Math.random() - Math.random()) * 0.05;
      p.z = p.zo = z + (Math.random() - Math.random()) * 0.05;
      p.lifetime = Math.floor(8 / (Math.random() * 0.8 + 0.2)) + 4;
      p.size *= 1.5;
      p.frames = SOUL;
      this.add(p);
      return true;
    }
    return false;
  }

  tick(): void {
    let w = 0;
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (this.tickOne(p)) list[w++] = p;
    }
    list.length = w;
  }

  /** one particle's tick; false when it's gone */
  private tickOne(p: SculkParticle): boolean {
    // vanilla ShriekParticle.tick: nothing at all till its delay's up
    if (p.delay !== undefined && p.delay > 0) {
      p.delay--;
      return true;
    }
    p.xo = p.x;
    p.yo = p.y;
    p.zo = p.z;
    if (p.age++ >= p.lifetime) return false;
    if (p.target) {
      // vanilla VibrationSignalParticle.tick: a share of the way still to go (the rest of the way on its last tick)
      const t = p.target();
      if (!t) return false;
      const d = 1 / (p.lifetime - p.age);
      p.x = lerp(d, p.x, t[0]);
      p.y = lerp(d, p.y, t[1]);
      p.z = lerp(d, p.z, t[2]);
      const e = p.x - t[0], f = p.y - t[1], g = p.z - t[2];
      p.oYRot = p.yRot;
      p.yRot = Math.atan2(e, g);
      p.oPitch = p.pitch;
      p.pitch = Math.atan2(f, Math.sqrt(e * e + g * g));
      return true;
    }
    // vanilla HugeExplosionParticle.tick: it only ages
    if (p.kind === 'sonic_boom') return true;
    // vanilla Particle.tick (gravity 0 for all of these)
    this.move(p);
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
    return true;
  }

  /** vanilla Particle.move: its 0.2 box against the blocks, if it has physics; stopped rising or falling, it stays */
  private move(p: SculkParticle): void {
    if (p.stopped) return;
    let { dx, dy, dz } = p;
    if (p.physics && (dx || dy || dz)) {
      const box = new AABB(p.x - 0.1, p.y, p.z - 0.1, p.x + 0.1, p.y + 0.2, p.z + 0.1);
      const boxes: AABB[] = [];
      const x0 = Math.floor(Math.min(box.minX, box.minX + dx)), x1 = Math.floor(Math.max(box.maxX, box.maxX + dx));
      const y0 = Math.floor(Math.min(box.minY, box.minY + dy)) - 1, y1 = Math.floor(Math.max(box.maxY, box.maxY + dy));
      const z0 = Math.floor(Math.min(box.minZ, box.minZ + dz)), z1 = Math.floor(Math.max(box.maxZ, box.maxZ + dz));
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++)
          for (let z = z0; z <= z1; z++) {
            const c = COLLISION[this.world.getState(x, y, z)];
            if (!c) continue;
            for (const b of c) boxes.push(new AABB(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]));
          }
      [dx, dy, dz] = collideWithBoxes(dx, dy, dz, box, boxes);
    }
    if (Math.abs(p.dy) >= 1e-5 && Math.abs(dy) < 1e-5) p.stopped = true;
    p.onGround = p.dy !== dy && p.dy < 0;
    if (p.dx !== dx) p.dx = 0;
    if (p.dz !== dz) p.dz = 0;
    p.x += dx;
    p.y += dy;
    p.z += dz;
  }

  /**
   * draw them: the dust specks and the sonic booms opaque, then the rest blended (vanilla PARTICLE_SHEET_OPAQUE and
   * PARTICLE_SHEET_LIT, then _TRANSLUCENT)
   */
  render(batch: EntityBatch, cam: Camera, partial: number, texture: WebGLTexture, rects: Record<string, SpriteRectUV>): void {
    if (!this.list.length) return;
    let translucent = false;
    const opaque = (p: SculkParticle): boolean => p.kind === 'dust_color_transition' || p.kind === 'sonic_boom';
    batch.begin({ texture, cutoff: 0.1, blend: false, cull: false, lit: false, useLightmap: true });
    for (const p of this.list) {
      if (opaque(p)) this.renderOne(batch, p, cam, partial, rects);
      else translucent = true;
    }
    batch.flush();
    if (!translucent) return;
    batch.begin({ texture, cutoff: 0.01, blend: true, cull: false, lit: false, useLightmap: true, depthWrite: false });
    for (const p of this.list) if (!opaque(p)) this.renderOne(batch, p, cam, partial, rects);
    batch.flush();
  }

  private renderOne(batch: EntityBatch, p: SculkParticle, cam: Camera, partial: number, rects: Record<string, SpriteRectUV>): void {
    if (p.delay !== undefined && p.delay > 0) return;
    // vanilla setSpriteFromAge (a one-frame particle: its frame)
    const name = p.frames[Math.min(p.frames.length - 1, Math.floor((p.age * (p.frames.length - 1)) / Math.max(1, p.lifetime)))];
    const rect = rects[name];
    if (!rect) return;
    const x = p.xo + (p.x - p.xo) * partial - cam.x;
    const y = p.yo + (p.y - p.yo) * partial - cam.y;
    const z = p.zo + (p.z - p.zo) * partial - cam.z;
    // (a vibration's last tick puts it nowhere, as vanilla's lerp by 1/0 does: it's gone as it arrives)
    if (!Number.isFinite(x + y + z)) return;
    if (p.fullBright) {
      batch.lightB = 240;
      batch.lightS = 240;
    } else {
      const l = this.world.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
      batch.lightB = (l & 15) * 16;
      batch.lightS = (l >> 4) * 16;
    }
    let { r, g, b } = p;
    let alpha = p.alpha;
    let size = p.size;
    if (p.from && p.to) {
      // vanilla DustColorTransitionParticle.lerpColors, and DustParticleBase.getQuadSize's first-frames swell
      const f = (p.age + partial) / (p.lifetime + 1);
      [r, g, b] = [lerp(f, p.from[0], p.to[0]), lerp(f, p.from[1], p.to[1]), lerp(f, p.from[2], p.to[2])];
      size *= clamp01(((p.age + partial) / p.lifetime) * 32);
    }
    if (p.kind === 'shriek') {
      // vanilla ShriekParticle: growing and fading over its life, one quad tipped 60 degrees back (both sides)
      size *= clamp01(((p.age + partial) / p.lifetime) * 0.75);
      alpha = 1 - clamp01((p.age + partial) / p.lifetime);
      this.quad(batch, rect, x, y, z, size, r, g, b, alpha, (v) => rotX(v, -1.0472));
      return;
    }
    if (p.target) {
      // vanilla VibrationSignalParticle.render: along its heading, rolling slowly to and fro
      const spin = Math.sin((p.age + partial - Math.PI * 2) * 0.05) * 2;
      const yaw = lerp(partial, p.oYRot!, p.yRot!);
      const pitch = lerp(partial, p.oPitch!, p.pitch!) + Math.PI / 2;
      this.quad(batch, rect, x, y, z, size, r, g, b, alpha, (v) => rotY(rotX(rotY(v, spin), -pitch), yaw));
      return;
    }
    // facing the camera (vanilla SingleQuadParticle with its roll)
    const roll = lerp(partial, p.oRoll, p.roll);
    const yr = (cam.yaw * Math.PI) / 180, pr = (cam.pitch * Math.PI) / 180;
    const rx = -Math.cos(yr), rz = -Math.sin(yr);
    const ux = -Math.sin(yr) * Math.sin(pr), uy = Math.cos(pr), uz = Math.cos(yr) * Math.sin(pr);
    const c = Math.cos(roll), s = Math.sin(roll);
    const ax = (rx * c + ux * s) * size, ay = uy * s * size, az = (rz * c + uz * s) * size;
    const bx = (-rx * s + ux * c) * size, by = uy * c * size, bz = (-rz * s + uz * c) * size;
    const v = [
      [x - ax - bx, y - ay - by, z - az - bz, rect.u1, rect.v1],
      [x - ax + bx, y - ay + by, z - az + bz, rect.u1, rect.v0],
      [x + ax + bx, y + ay + by, z + az + bz, rect.u0, rect.v0],
      [x + ax - bx, y + ay - by, z + az - bz, rect.u0, rect.v1],
    ];
    for (const k of [0, 1, 2, 0, 2, 3]) batch.vertexRaw(v[k][0], v[k][1], v[k][2], v[k][3], v[k][4], r, g, b, alpha, 0, 1, 0);
  }

  /** vanilla SingleQuadParticle.renderRotatedQuad: the corners (±1, ±1, 0) turned by `turn`, times its size */
  private quad(batch: EntityBatch, rect: SpriteRectUV, x: number, y: number, z: number, size: number, r: number, g: number, b: number, a: number, turn: (v: Vec3) => Vec3): void {
    const corner = (cx: number, cy: number, u: number, v: number): number[] => {
      const t = turn([cx, cy, 0]);
      return [x + t[0] * size, y + t[1] * size, z + t[2] * size, u, v];
    };
    const v = [corner(1, -1, rect.u1, rect.v1), corner(1, 1, rect.u1, rect.v0), corner(-1, 1, rect.u0, rect.v0), corner(-1, -1, rect.u0, rect.v1)];
    for (const k of [0, 1, 2, 0, 2, 3]) batch.vertexRaw(v[k][0], v[k][1], v[k][2], v[k][3], v[k][4], r, g, b, a, 0, 1, 0);
  }

  clear(): void {
    this.list.length = 0;
  }

  get count(): number {
    return this.list.length;
  }
}
