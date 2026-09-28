// Particles: block break/hit (TerrainParticle), with vanilla physics.

import { EntityBatch } from './entityRenderer';
import { getStateModels } from './mesher';
import type { Atlas } from './atlas';
import type { World } from '../world/world';
import { COLLISION, BLOCKS, STATE_BLOCK, FLAGS, F_AIR } from '../world/block';
import type { Camera } from './renderer';
import type { SpriteRect } from '../world/models';
import { AABB, collideWithBoxes } from '../core/aabb';
import { fluidHeight, fluidType, FLUID_WATER, FLUID_LAVA } from '../world/fluids';
import { SGA_SPRITES } from '../textures/sga';
import { SculkParticles } from './sculkParticles';

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
  emitter?: 'explosion' | 'crit' | 'enchanted_hit' | 'totem_of_undying';
  target?: { x: number; y: number; z: number; width: number; height: number };
  /** portal particles move along a curve from their start point */
  portal?: { x: number; y: number; z: number };
  /** enchant particles fly from a bookshelf back to this point (vanilla EnchantmentTableParticle) */
  enchant?: { x: number; y: number; z: number };
  /** sub-rectangle of the sprite (fractions), e.g. item crumbs */
  sub?: [number, number, number, number];
  /** squid ink sinks slowly in air */
  sinkInAir?: boolean;
  /** vanilla bounding-box width: the position is the box's bottom centre (drips, bubbles, dust) */
  bbw?: number;
  /** vanilla getLightColor overrides: flames brighten as they age, lava glows */
  lightMode?: 'flame' | 'lava' | 'enchant' | 'glow';
  /** vanilla getQuadSize curves */
  sizeCurve?: 'flame' | 'lava';
  /** DripParticle stage: hangs, falls, then lands/splashes */
  drip?: { stage: 'hang' | 'fall' | 'land'; fluid: 'water' | 'lava' | null; next: string | null; cooling: boolean; dripstone?: boolean; honey?: boolean };
  /** FallingDustParticle spin */
  roll?: number;
  oRoll?: number;
  rotSpeed?: number;
  /** translucent particles (vanilla PARTICLE_SHEET_TRANSLUCENT with alpha < 1) are drawn blended */
  alpha?: number;
  /** vanilla Particle.stoppedByCollision: something stopped it rising or falling, and it moves no more */
  stopped?: boolean;
  /** its friction slows it across but not up and down (vanilla DragonBreathParticle, till it lands) */
  keepYSpeed?: boolean;
  /** vanilla SimpleAnimatedParticle: past half its life it fades out, and (with a fade colour) toward that colour */
  animated?: boolean;
  fade?: [number, number, number];
  /** what its gravity and its friction are multiplied by each tick before it moves (vanilla DustPlumeParticle) */
  decay?: [number, number];
  /** (fireworks) vanilla FireworkParticles.SparkParticle: whether it leaves a trail of sparks, and twinkles */
  spark?: { trail: boolean; twinkle: boolean };
  /** (fireworks) vanilla FireworkParticles.OverlayParticle: the explosion's flash, sized and faded by its age */
  flash?: boolean;
  /** (trial chambers) vanilla FlyStraightTowardsParticle: from this point plus its speed, straight back in to the point */
  straight?: { x: number; y: number; z: number };
  /** (trial chambers) its colour over its life, from the first three to the last three (vanilla ARGB32.lerp) */
  colorLerp?: [number, number, number, number, number, number];
  /** (trial chambers) vanilla Particle.LifetimeAlpha: its alpha from the first to the second between those fractions of its life */
  lifetimeAlpha?: [number, number, number, number];
  /** (trial chambers) vanilla SingleQuadParticle.FacingCameraMode.LOOKAT_Y: it stands upright, turned to the camera */
  upright?: boolean;
}

/** a 0xRRGGBB colour as vanilla Particle.setColor's three floats */
const rgb = (c: number): [number, number, number] => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

export interface SpriteRectUV {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

const GENERIC = ['generic_0', 'generic_1', 'generic_2', 'generic_3', 'generic_4', 'generic_5', 'generic_6', 'generic_7'];
const EXPLOSION = Array.from({ length: 16 }, (_, i) => `explosion_${i}`);
const SWEEP = Array.from({ length: 8 }, (_, i) => `sweep_${i}`);
/** vanilla particles/entity_effect.json: effect_7 down to effect_0 */
const EFFECT = Array.from({ length: 8 }, (_, i) => `effect_${7 - i}`);
/** vanilla particles/instant_effect.json: spell_7 down to spell_0 */
const SPELL = Array.from({ length: 8 }, (_, i) => `spell_${7 - i}`);
/** vanilla particles/small_gust.json: gust_0 to gust_11 */
const GUST = Array.from({ length: 12 }, (_, i) => `gust_${i}`);
/** vanilla particles/dragon_breath.json: generic_5 to generic_7 (the puffs here are numbered largest first) */
const DRAGON_BREATH = ['generic_2', 'generic_1', 'generic_0'];
/** vanilla particles/campfire_cosy_smoke.json and campfire_signal_smoke.json */
const BIG_SMOKE = Array.from({ length: 12 }, (_, i) => `big_smoke_${i}`);
/** (powder snow) vanilla particles/snowflake.json */
const SNOWFLAKE = Array.from({ length: 5 }, (_, i) => `snowflake_${i}`);
/**
 * vanilla particles/end_rod.json (and firework.json, totem_of_undying.json): glitter_7 down to glitter_0 (the
 * textures are textures/blocklib/outerEnd.ts's, glitter_7 the biggest sparkle)
 */
const GLITTER = Array.from({ length: 8 }, (_, i) => `glitter_${7 - i}`);

export class ParticleEngine {
  private readonly list: Particle[] = [];
  private readonly sprites: SpriteParticle[] = [];
  /** spore blossom air particles alive (vanilla keeps at most 1000) */
  private sporeAir = 0;
  readonly max = 16384;
  spriteTexture: WebGLTexture | null = null;
  spriteRects: Record<string, SpriteRectUV> = {};
  /** vanilla NoRenderParticle subclasses (a firework's Starter): ticked after the others, never drawn; false once done */
  private readonly tickers: { tick(): boolean }[] = [];
  /** vanilla DripstoneFallAndLandParticle: a drip from a stalactite plays a sound where it lands */
  onDripstoneDripLand: ((x: number, y: number, z: number, lava: boolean) => void) | null = null;
  /** (remaining mobs: the bee) vanilla DripParticle.HoneyFallAndLandParticle: a drop of honey plays a sound where it lands */
  onHoneyDripLand: ((x: number, y: number, z: number) => void) | null = null;

  /** the deep dark's particles (render/sculkParticles.ts: vibrations, shrieks, sculk charges and souls) */
  readonly sculk: SculkParticles;

  constructor(private readonly atlas: Atlas, private readonly world: World, private readonly tintOf: (x: number, y: number, z: number, state: number) => number) {
    this.sculk = new SculkParticles(world);
  }

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

  /** vanilla TerrainParticle(level, x, y, z, xd, yd, zd, state): sprint dust, landing bursts */
  blockParticle(x: number, y: number, z: number, xd: number, yd: number, zd: number, state: number, bx: number, by: number, bz: number): void {
    if (FLAGS[state] & F_AIR) return;
    const p = this.terrain(x, y, z, 0, 0, 0, state, bx, by, bz);
    if (!p) return;
    let mx = xd + (Math.random() * 2 - 1) * 0.4, my = yd + (Math.random() * 2 - 1) * 0.4, mz = zd + (Math.random() * 2 - 1) * 0.4;
    const sp = (Math.random() + Math.random() + 1) * 0.15;
    const len = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
    mx = (mx / len) * sp * 0.4;
    my = (my / len) * sp * 0.4 + 0.1;
    mz = (mz / len) * sp * 0.4;
    p.dx = mx;
    p.dy = my;
    p.dz = mz;
    this.add(p);
  }

  /**
   * (trial chambers) vanilla TerrainParticle.DustPillarProvider: a speck of the block, its speed set outright (straight
   * up at about `yd`, barely drifting) and living a second or two
   */
  dustPillar(x: number, y: number, z: number, yd: number, state: number, bx: number, by: number, bz: number): void {
    if (FLAGS[state] & F_AIR) return;
    const p = this.terrain(x, y, z, 0, 0, 0, state, bx, by, bz);
    if (!p) return;
    const g = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
    p.dx = g() / 30;
    p.dy = yd + g() / 2;
    p.dz = g() / 30;
    p.lifetime = 20 + Math.floor(Math.random() * 20);
    this.add(p);
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
    // (vanilla ParticleEngine: at most 16384 of a kind, the oldest dropped first; trimmed once a tick, tickSprites)
    this.sprites.push(p);
  }

  /** a NoRenderParticle: `t.tick()` every particle tick (after the particles) until it says it's done */
  addTicker(t: { tick(): boolean }): void {
    this.tickers.push(t);
  }

  /**
   * (fireworks) vanilla FireworkParticles.SparkParticle as the FIREWORK particle type makes it (alpha 0.99): a
   * SimpleAnimatedParticle of gravity 0.1 and friction 0.91, three quarters the size, 48-59 ticks, full bright, the
   * glitter frames by age; past half its life it fades out, and toward its fade colour if it has one. `color` / `fade`:
   * 0xRRGGBB, or -1 (white; no fade)
   */
  spark(x: number, y: number, z: number, xd: number, yd: number, zd: number, color = -1, fade = -1, trail = false, twinkle = false): SpriteParticle {
    const p = this.base('firework', x, y, z);
    p.dx = xd;
    p.dy = yd;
    p.dz = zd;
    p.gravity = 0.1;
    p.friction = 0.91;
    p.size *= 0.75;
    p.lifetime = 48 + Math.floor(Math.random() * 12);
    p.frames = GLITTER;
    p.fullBright = true;
    p.alpha = 0.99;
    p.animated = true;
    if (color >= 0) [p.r, p.g, p.b] = rgb(color);
    if (fade >= 0) p.fade = rgb(fade);
    p.spark = { trail, twinkle };
    this.addSprite(p);
    return p;
  }

  /**
   * (fireworks) vanilla FireworkParticles.OverlayParticle (the FLASH type) in a colour: four ticks of a glow, lit by
   * where it is, swelling to 7.1 across and fading (renderSprite)
   */
  flash(x: number, y: number, z: number, color: number): void {
    const p = this.base('flash', x, y, z);
    p.lifetime = 4;
    p.frames = ['flash'];
    p.frame = 0;
    p.alpha = 0.6;
    p.flash = true;
    [p.r, p.g, p.b] = rgb(color);
    this.addSprite(p);
  }

  /** spawn by vanilla particle type name */
  spawn(kind: string, x: number, y: number, z: number, xd: number, yd: number, zd: number): void {
    switch (kind) {
      // (fireworks) vanilla FireworkParticles.SparkProvider: a white spark (what a rocket trails)
      case 'firework':
        this.spark(x, y, z, xd, yd, zd);
        break;
      case 'totem_of_undying': {
        // (Stage 4: totems) vanilla TotemParticle (a SimpleAnimatedParticle, gravity 1.25): flung out, falling, a
        // quarter of them gold and the rest green, glowing, fading over the second half of their 3 s
        const p = this.base(kind, x, y, z);
        p.dx = xd;
        p.dy = yd;
        p.dz = zd;
        p.gravity = 1.25;
        p.friction = 0.6;
        p.size *= 0.75;
        p.lifetime = 60 + Math.floor(Math.random() * 12);
        p.frames = GLITTER;
        p.fullBright = true;
        p.alpha = 1;
        if (Math.random() * 4 < 1) [p.r, p.g, p.b] = [0.6 + Math.random() * 0.2, 0.6 + Math.random() * 0.3, Math.random() * 0.2];
        else [p.r, p.g, p.b] = [0.1 + Math.random() * 0.2, 0.4 + Math.random() * 0.3, Math.random() * 0.2];
        this.addSprite(p);
        break;
      }
      // (vanilla SpitParticle: a poof that falls)
      case 'poof':
      case 'spit': {
        const p = this.base(kind, x, y, z);
        p.gravity = kind === 'spit' ? 0.5 : -0.1;
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
      case 'large_smoke':
      // (trial chambers) vanilla WhiteSmokeParticle (the crafter's puff, level event 2010): the smoke, but always its
      // own pale grey (0xbab1c2)
      case 'white_smoke': {
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
        if (kind === 'white_smoke') [p.r, p.g, p.b] = [0.7294118, 0.69411767, 0.7607843];
        p.size *= 0.75 * mul;
        p.lifetime = Math.max(1, Math.floor((8 / (Math.random() * 0.8 + 0.2)) * mul));
        p.grow = true;
        this.addSprite(p);
        break;
      }
      case 'dragon_breath': {
        // vanilla DragonBreathParticle: violet, drifting as sent, slowing across but not up or down (it has no
        // collisions, so it never lands), speeding up across if it stops rising or falling
        const p = this.base(kind, x, y, z);
        p.friction = 0.96;
        p.dx = xd;
        p.dy = yd;
        p.dz = zd;
        p.r = 0.7176471 + Math.random() * (0.8745098 - 0.7176471);
        p.g = 0;
        p.b = 0.8235294 + Math.random() * (0.9764706 - 0.8235294);
        p.size *= 0.75;
        p.lifetime = Math.floor(20 / (Math.random() * 0.8 + 0.2));
        p.physics = false;
        p.speedUpWhenBlocked = true;
        p.keepYSpeed = true;
        p.grow = true;
        p.frames = DRAGON_BREATH;
        this.addSprite(p);
        break;
      }
      case 'campfire_cosy_smoke':
      case 'campfire_signal_smoke': {
        // vanilla CampfireSmokeParticle: a big slow billow (a signal fire's lasts over three times as long)
        const signal = kind === 'campfire_signal_smoke';
        const p = this.base(kind, x, y, z);
        p.size *= 3;
        p.bbw = 0.25;
        p.lifetime = Math.floor(Math.random() * 50) + (signal ? 280 : 80);
        p.gravity = 3e-6;
        p.dx = xd;
        p.dy = yd + Math.random() / 500;
        p.dz = zd;
        p.alpha = signal ? 0.95 : 0.9;
        p.frames = BIG_SMOKE;
        p.frame = Math.floor(Math.random() * BIG_SMOKE.length);
        this.addSprite(p);
        break;
      }
      case 'ash':
      case 'white_ash': {
        // vanilla BaseAshSmokeParticle (AshParticle, WhiteAshParticle): sifting motes that sink (ash) or hang (white ash)
        const white = kind === 'white_ash';
        const p = this.base(kind, x, y, z);
        this.withSpeed(p, 0, 0, 0);
        p.friction = 0.96;
        p.gravity = white ? 0.0125 : 0.1;
        p.speedUpWhenBlocked = true;
        p.dx = p.dx * 0.1 + xd;
        p.dy = p.dy * -0.1 + yd;
        p.dz = p.dz * 0.1 + zd;
        [p.r, p.g, p.b] = white ? [0.7921569, 0.74509805, 0.7058824] : [0.7294118, 0.69411767, 0.7607843];
        p.size *= 0.75;
        p.lifetime = Math.max(1, Math.floor(20 / (Math.random() * 0.8 + 0.2)));
        p.physics = false;
        this.addSprite(p);
        break;
      }
      case 'snowflake': {
        // (powder snow) vanilla SnowflakeParticle: kicked up out of powder snow, falling (gravity 0.225, no drag but
        // its own), a flake that shrinks through its five sprites as it ages
        const p = this.base(kind, x, y, z);
        p.gravity = 0.225;
        p.friction = 1;
        p.dx = xd + (Math.random() * 2 - 1) * 0.05;
        p.dy = yd + (Math.random() * 2 - 1) * 0.05;
        p.dz = zd + (Math.random() * 2 - 1) * 0.05;
        p.size = 0.1 * (Math.random() * Math.random() + 1);
        p.lifetime = Math.floor(16 / (Math.random() * 0.8 + 0.2)) + 2;
        p.frames = SNOWFLAKE;
        p.frame = -1;
        this.addSprite(p);
        break;
      }
      case 'dust_plume': {
        // vanilla DustPlumeParticle (a BaseAshSmokeParticle): the puff out of a decorated pot something is put in,
        // thrown up and falling back, grey-violet, its fall and its drag dying away as it goes
        const p = this.base(kind, x, y, z);
        this.withSpeed(p, 0, 0, 0);
        p.friction = 0.96;
        p.gravity = 0.5;
        p.speedUpWhenBlocked = true;
        p.dx = p.dx * 0.7 + xd;
        p.dy = p.dy * 0.6 + yd + 0.15;
        p.dz = p.dz * 0.7 + zd;
        const k = Math.random() * 0.2;
        [p.r, p.g, p.b] = [0xba / 255 - k, 0xb1 / 255 - k, 0xc2 / 255 - k];
        p.size *= 0.75;
        p.lifetime = Math.max(1, Math.floor(7 / (Math.random() * 0.8 + 0.2)));
        p.physics = false;
        p.decay = [0.88, 0.92];
        this.addSprite(p);
        break;
      }
      case 'crimson_spore':
      case 'warped_spore': {
        // vanilla SuspendedParticle (CrimsonSporeProvider, WarpedSporeProvider): specks drifting up through the air
        const p = this.base(kind, x, y - 0.125, z);
        this.withSpeed(p, xd, yd, zd);
        p.size *= Math.random() * 0.6 + 0.6;
        p.lifetime = Math.floor(16 / (Math.random() * 0.8 + 0.2));
        p.physics = false;
        p.friction = 1;
        p.gravity = 0;
        [p.r, p.g, p.b] = kind === 'crimson_spore' ? [0.9, 0.4, 0.5] : [0.1, 0.1, 0.3];
        p.frames = ['generic_0'];
        p.frame = 0;
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
      case 'heart':
      case 'angry_villager': {
        // (vanilla HeartParticle; AngryVillagerProvider makes it half a block higher, white)
        const p = this.base(kind, x, kind === 'angry_villager' ? y + 0.5 : y, z);
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
        p.frames = [kind];
        p.frame = 0;
        this.addSprite(p);
        break;
      }
      case 'note': {
        // (jukebox) vanilla NoteParticle: pops up and stops short (friction 0.66), gone in 6 ticks; `xd` (0..1) is
        // its colour's place round the wheel, as a note block's pitch or a jukebox's 0..3/24 gives it
        const p = this.base(kind, x, y, z);
        this.withSpeed(p, 0, 0, 0);
        p.speedUpWhenBlocked = true;
        p.friction = 0.66;
        p.dx *= 0.01;
        p.dy *= 0.01;
        p.dz *= 0.01;
        p.dy += 0.2;
        const hue = (o: number) => Math.max(0, Math.sin((xd + o) * Math.PI * 2) * 0.65 + 0.35);
        p.r = hue(0);
        p.g = hue(1 / 3);
        p.b = hue(2 / 3);
        p.size *= 1.5;
        p.lifetime = 6;
        p.grow = true;
        p.frames = [kind];
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
      case 'enchant': {
        // vanilla EnchantmentTableParticle: a rune that starts out at (x, y, z) + speed and homes in on (x, y, z),
        // dropping 1.2 blocks at the very end
        const p = this.base(kind, x + xd, y + yd, z + zd);
        p.enchant = { x, y, z };
        p.dx = xd;
        p.dy = yd;
        p.dz = zd;
        p.size = 0.1 * (Math.random() * 0.5 + 0.2);
        const f = Math.random() * 0.6 + 0.4;
        p.r = 0.9 * f;
        p.g = 0.9 * f;
        p.b = f;
        p.physics = false;
        p.lifetime = Math.floor(Math.random() * 10) + 30;
        p.frames = SGA_SPRITES;
        p.frame = Math.floor(Math.random() * SGA_SPRITES.length);
        p.lightMode = 'enchant';
        this.addSprite(p);
        break;
      }
      case 'end_rod': {
        // vanilla EndRodParticle (a SimpleAnimatedParticle): a glittering mote, full bright, drifting as sent through
        // everything and barely sinking, dwindling through the glitter frames; past half its life it fades out, and
        // from white toward a warm cream
        const p = this.base(kind, x, y, z);
        p.dx = xd;
        p.dy = yd;
        p.dz = zd;
        p.gravity = 0.0125;
        p.friction = 0.91;
        p.size *= 0.75;
        p.lifetime = 60 + Math.floor(Math.random() * 12);
        p.physics = false;
        p.fullBright = true;
        p.frames = GLITTER;
        p.alpha = 1;
        p.animated = true;
        p.fade = [0xf2 / 255, 0xde / 255, 0xc9 / 255];
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
      // (Stage 5: ocean) vanilla SquidInkParticle.GlowInkProvider: the same, in its (byte-wrapped) mint green
      case 'glow_squid_ink': {
        const p = this.base(kind, x, y, z);
        p.friction = 0.92;
        p.size = 0.5;
        p.r = 52 / 255;
        p.g = 225 / 255;
        p.b = 154 / 255;
        p.lifetime = Math.floor((0.5 * 12) / (Math.random() * 0.8 + 0.2));
        p.physics = false;
        p.dx = xd;
        p.dy = yd;
        p.dz = zd;
        p.sinkInAir = true;
        this.addSprite(p);
        break;
      }
      // (Stage 5: ocean) vanilla GlowParticle.GlowSquidProvider: a spark drifting off a glow squid, pale green or
      // deep teal, brightening as it goes
      case 'glow': {
        const p = this.base(kind, x, y, z);
        this.withSpeed(p, 0.5 - Math.random(), yd, 0.5 - Math.random());
        p.dy *= 0.2;
        if (xd === 0 && zd === 0) {
          p.dx *= 0.1;
          p.dz *= 0.1;
        }
        [p.r, p.g, p.b] = Math.random() < 0.5 ? [0.6, 1, 0.8] : [0.08, 0.4, 0.4];
        p.lifetime = Math.floor(8 / (Math.random() * 0.8 + 0.2));
        p.friction = 0.96;
        p.speedUpWhenBlocked = true;
        p.size *= 0.75;
        p.physics = false;
        p.lightMode = 'flame';
        p.frames = ['glow'];
        p.frame = 0;
        this.addSprite(p);
        break;
      }
      // (trial chambers) vanilla GlowParticle.WaxOnProvider, WaxOffProvider, ScrapeProvider and ElectricSparkProvider:
      // the glow sprite in wax's amber, a pale white, the patina's greens or a spark's white, barely drifting from where
      // it was set off the block's faces (a spark flies faster and is gone in a few ticks)
      case 'wax_on':
      case 'wax_off':
      case 'scrape':
      case 'electric_spark': {
        const p = this.base(kind, x, y, z);
        const spark = kind === 'electric_spark', flat = kind === 'wax_on' || kind === 'wax_off' ? 0.5 : 1;
        const k = spark ? 0.25 : 0.01;
        p.dx = xd * k * flat;
        p.dy = yd * k;
        p.dz = zd * k * flat;
        if (kind === 'wax_on') [p.r, p.g, p.b] = [0.91, 0.55, 0.08];
        else if (kind === 'scrape') [p.r, p.g, p.b] = Math.random() < 0.5 ? [0.29, 0.58, 0.51] : [0.43, 0.77, 0.62];
        else [p.r, p.g, p.b] = [1, 0.9, 1];
        p.lifetime = spark ? 2 + Math.floor(Math.random() * 2) : 10 + Math.floor(Math.random() * 30);
        p.friction = 0.96;
        p.speedUpWhenBlocked = true;
        p.size *= 0.75;
        p.physics = false;
        p.lightMode = 'flame';
        p.frames = ['glow'];
        p.frame = 0;
        this.addSprite(p);
        break;
      }
      // (Stage 5: ocean) vanilla SuspendedTownParticle.DolphinSpeedProvider: a blue speck left in a dolphin's wake
      case 'dolphin': {
        const p = this.base(kind, x, y, z);
        this.withSpeed(p, xd, yd, zd);
        p.size *= Math.random() * 0.6 + 0.5;
        p.dx *= 0.02;
        p.dy *= 0.02;
        p.dz *= 0.02;
        p.lifetime = Math.floor(Math.floor(20 / (Math.random() * 0.8 + 0.2)) / 2);
        p.physics = false;
        p.friction = 0.99;
        p.r = 0.3;
        p.g = 0.5;
        p.b = 1;
        p.frames = ['generic_5'];
        p.frame = 0;
        this.addSprite(p);
        break;
      }
      // (Stage 5: ocean) vanilla EnchantmentTableParticle.NautilusProvider: a conduit's spark, starting out at
      // (x, y, z) + speed and homing in on (x, y, z) as an enchanting table's rune does, in the nautilus sprite
      case 'nautilus': {
        const p = this.base(kind, x + xd, y + yd, z + zd);
        p.enchant = { x, y, z };
        p.dx = xd;
        p.dy = yd;
        p.dz = zd;
        p.size = 0.1 * (Math.random() * 0.5 + 0.2);
        const f = Math.random() * 0.6 + 0.4;
        p.r = 0.9 * f;
        p.g = 0.9 * f;
        p.b = f;
        p.physics = false;
        p.lifetime = Math.floor(Math.random() * 10) + 30;
        p.frames = ['nautilus'];
        p.frame = 0;
        p.lightMode = 'enchant';
        this.addSprite(p);
        break;
      }
      case 'item_slime':
      case 'item_cobweb':
      case 'item_splash_potion':
      case 'item_snowball':
      case 'item_ender_eye':
      case 'item_egg':
        this.breakingItem(kind, x, y, z, xd, yd, zd);
        break;
      case 'infested':
      // (trial chambers) vanilla SpellParticle.Provider with Trial Omen's sprite
      case 'trial_omen': {
        // vanilla SpellParticle.Provider: the infested effect's mites, rising like an effect's swirl
        const p = this.base(kind, x, y, z);
        this.withSpeed(p, 0.5 - Math.random(), yd, 0.5 - Math.random());
        p.friction = 0.96;
        p.gravity = -0.1;
        p.speedUpWhenBlocked = true;
        p.dy *= 0.2;
        if (xd === 0 && zd === 0) {
          p.dx *= 0.1;
          p.dz *= 0.1;
        }
        p.size *= 0.75;
        p.lifetime = Math.floor(8 / (Math.random() * 0.8 + 0.2));
        p.physics = false;
        p.frames = [kind];
        p.frame = 0;
        this.addSprite(p);
        break;
      }
      // (trial chambers) vanilla TrialSpawnerDetectionParticle (its Provider: 1.5 times over): a wisp rising up a trial
      // spawner's side as it sees someone, upright, lit full, dwindling through its frames over 12 to 24 ticks
      case 'trial_spawner_detection':
      case 'trial_spawner_detection_ominous': {
        const p = this.base(kind, x, y, z);
        this.withSpeed(p, 0, 0, 0);
        p.friction = 0.96;
        p.gravity = -0.1;
        p.speedUpWhenBlocked = true;
        p.dx = xd;
        p.dy = p.dy * 0.9 + yd;
        p.dz = zd;
        p.size *= 0.75 * 1.5;
        p.lifetime = Math.max(1, Math.floor((8 / (0.5 + Math.random() * 0.5)) * 1.5));
        p.grow = true;
        p.fullBright = true;
        p.upright = true;
        p.frames = [0, 1, 2, 3, 4].map((i) => `${kind}_${i}`);
        this.addSprite(p);
        break;
      }
      // (trial chambers) vanilla FlyStraightTowardsParticle.OminousSpawnProvider: a spark 3 to 5 times the size that starts
      // out at (x, y, z) + speed and flies straight in to (x, y, z) over 25 to 29 ticks, lit full, from the ominous blue
      // (0x45aefe) to white
      case 'ominous_spawning': {
        const p = this.base(kind, x + xd, y + yd, z + zd);
        p.straight = { x, y, z };
        p.dx = xd;
        p.dy = yd;
        p.dz = zd;
        p.size = 0.1 * (Math.random() * 0.5 + 0.2) * (3 + Math.random() * 2);
        p.physics = false;
        p.lifetime = Math.floor(Math.random() * 5) + 25;
        p.fullBright = true;
        p.colorLerp = [0x45 / 255, 0xae / 255, 0xfe / 255, 1, 1, 1];
        [p.r, p.g, p.b] = [0x45 / 255, 0xae / 255, 0xfe / 255];
        p.frames = ['ominous_spawning'];
        p.frame = 0;
        this.addSprite(p);
        break;
      }
      // (trial chambers) vanilla FlyTowardsPositionParticle.VaultConnectionProvider: flies in from (x, y, z) + speed to
      // (x, y, z) as an enchanting rune does (dropping 1.2 at the very end), one and a half times the size, lit full,
      // fading in from nothing after a quarter of its life to 0.6 at its end
      case 'vault_connection': {
        const p = this.base(kind, x + xd, y + yd, z + zd);
        p.enchant = { x, y, z };
        p.dx = xd;
        p.dy = yd;
        p.dz = zd;
        p.size = 0.1 * (Math.random() * 0.5 + 0.2) * 1.5;
        const f = Math.random() * 0.6 + 0.4;
        p.r = 0.9 * f;
        p.g = 0.9 * f;
        p.b = f;
        p.physics = false;
        p.lifetime = Math.floor(Math.random() * 10) + 30;
        p.fullBright = true;
        p.alpha = 0;
        p.lifetimeAlpha = [0, 0.6, 0.25, 1];
        p.frames = ['vault_connection'];
        p.frame = 0;
        this.addSprite(p);
        break;
      }
      case 'gust':
      case 'small_gust': {
        // vanilla GustParticle (SmallProvider: at 0.15 the size): a curl of air where it is, bright, over 12-15 ticks
        const p = this.base(kind, x, y, z);
        p.lifetime = 12 + Math.floor(Math.random() * 4);
        p.size = kind === 'gust' ? 1 : 0.15;
        p.physics = false;
        p.fullBright = true;
        p.frames = GUST;
        this.addSprite(p);
        break;
      }
      case 'flame':
      case 'soul_fire_flame':
      // (the deep dark: a candle's; trial chambers: the trial spawner's, the vault's) vanilla FlameParticle.SmallFlameProvider:
      // the flame at half its size
      case 'small_flame': {
        // vanilla FlameParticle (RisingParticle): flickers in place, shrinking, brightening
        const p = this.base(kind, x, y, z);
        if (kind === 'small_flame') p.size *= 0.5;
        this.withSpeed(p, xd, yd, zd);
        p.friction = 0.96;
        p.dx = p.dx * 0.01 + xd;
        p.dy = p.dy * 0.01 + yd;
        p.dz = p.dz * 0.01 + zd;
        p.x += (Math.random() - Math.random()) * 0.05;
        p.y += (Math.random() - Math.random()) * 0.05;
        p.z += (Math.random() - Math.random()) * 0.05;
        p.xo = p.x;
        p.yo = p.y;
        p.zo = p.z;
        p.lifetime = Math.floor(8 / (Math.random() * 0.8 + 0.2)) + 4;
        p.physics = false;
        p.frames = [kind === 'small_flame' ? 'flame' : kind];
        p.frame = 0;
        p.lightMode = 'flame';
        p.sizeCurve = 'flame';
        this.addSprite(p);
        break;
      }
      case 'lava': {
        // vanilla LavaParticle: a glowing ember popping out of lava, trailing smoke
        const p = this.base(kind, x, y, z);
        this.withSpeed(p, 0, 0, 0);
        p.gravity = 0.75;
        p.friction = 0.999;
        p.dx *= 0.8;
        p.dz *= 0.8;
        p.dy = Math.random() * 0.4 + 0.05;
        p.size *= Math.random() * 2 + 0.2;
        p.lifetime = Math.floor(16 / (Math.random() * 0.8 + 0.2));
        p.bbw = 0.2;
        p.frames = ['lava'];
        p.frame = 0;
        p.lightMode = 'lava';
        p.sizeCurve = 'lava';
        this.addSprite(p);
        break;
      }
      case 'dripping_water':
      case 'dripping_lava':
      case 'falling_water':
      case 'falling_lava':
      case 'landing_lava':
      case 'dripping_dripstone_water':
      case 'dripping_dripstone_lava':
      case 'falling_dripstone_water':
      case 'falling_dripstone_lava': {
        // vanilla DripParticle and its hang / fall / land stages
        const p = this.base(kind, x, y, z);
        p.bbw = 0.01;
        p.gravity = 0.06;
        p.friction = 0.98;
        const water = kind.endsWith('water');
        if (water) {
          p.r = 0.2;
          p.g = 0.3;
          p.b = 1;
        } else {
          p.r = 1;
          p.g = 0.2857143;
          p.b = 0.083333336;
        }
        const dripstone = kind.includes('dripstone');
        if (kind.startsWith('dripping')) {
          p.gravity *= 0.02;
          p.lifetime = 40;
          p.frames = ['drip_hang'];
          const fall = dripstone ? (water ? 'falling_dripstone_water' : 'falling_dripstone_lava') : water ? 'falling_water' : 'falling_lava';
          p.drip = { stage: 'hang', fluid: water ? 'water' : 'lava', next: fall, cooling: !water };
        } else if (kind.startsWith('falling')) {
          p.lifetime = Math.floor(64 / (Math.random() * 0.8 + 0.2));
          p.frames = ['drip_fall'];
          p.drip = { stage: 'fall', fluid: water ? 'water' : 'lava', next: water ? 'splash' : 'landing_lava', cooling: false, dripstone };
        } else {
          p.lifetime = Math.floor(16 / (Math.random() * 0.8 + 0.2));
          p.frames = ['drip_land'];
          p.drip = { stage: 'land', fluid: null, next: null, cooling: false };
        }
        p.frame = 0;
        this.addSprite(p);
        break;
      }
      case 'dripping_obsidian_tear':
      case 'falling_obsidian_tear':
      case 'landing_obsidian_tear': {
        // vanilla DripParticle.createObsidianTear{Hang,Fall,Land}Particle: glowing purple, a long hang, a slow fall
        const p = this.base(kind, x, y, z);
        p.bbw = 0.01;
        p.gravity = 0.06;
        p.friction = 0.98;
        p.r = 0.51171875;
        p.g = 0.03125;
        p.b = 0.890625;
        p.lightMode = 'glow';
        if (kind.startsWith('dripping')) {
          p.gravity *= 0.01;
          p.lifetime = 100;
          p.frames = ['drip_hang'];
          p.drip = { stage: 'hang', fluid: null, next: 'falling_obsidian_tear', cooling: false };
        } else if (kind.startsWith('falling')) {
          p.gravity = 0.01;
          p.lifetime = Math.floor(64 / (Math.random() * 0.8 + 0.2));
          p.frames = ['drip_fall'];
          p.drip = { stage: 'fall', fluid: null, next: 'landing_obsidian_tear', cooling: false };
        } else {
          p.lifetime = Math.floor(28 / (Math.random() * 0.8 + 0.2));
          p.frames = ['drip_land'];
          p.drip = { stage: 'land', fluid: null, next: null, cooling: false };
        }
        p.frame = 0;
        this.addSprite(p);
        break;
      }
      case 'dripping_honey':
      case 'falling_honey':
      case 'landing_honey': {
        // (remaining mobs: the bee) vanilla DripParticle.createHoney{Hang,Fall,Land}Particle: amber, a long hang (its
        // gravity DripHangParticle's 0.02 of the drip's and a hundredth of that again), a slow fall, a long puddle
        const p = this.base(kind, x, y, z);
        p.bbw = 0.01;
        p.gravity = 0.06;
        p.friction = 0.98;
        if (kind.startsWith('dripping')) {
          p.gravity *= 0.02 * 0.01;
          p.lifetime = 100;
          [p.r, p.g, p.b] = [0.622, 0.508, 0.082];
          p.frames = ['drip_hang'];
          p.drip = { stage: 'hang', fluid: null, next: 'falling_honey', cooling: false };
        } else if (kind.startsWith('falling')) {
          p.gravity = 0.01;
          p.lifetime = Math.floor(64 / (Math.random() * 0.8 + 0.2));
          [p.r, p.g, p.b] = [0.582, 0.448, 0.082];
          p.frames = ['drip_fall'];
          p.drip = { stage: 'fall', fluid: null, next: 'landing_honey', cooling: false, honey: true };
        } else {
          p.lifetime = Math.floor(128 / (Math.random() * 0.8 + 0.2));
          [p.r, p.g, p.b] = [0.522, 0.408, 0.082];
          p.frames = ['drip_land'];
          p.drip = { stage: 'land', fluid: null, next: null, cooling: false };
        }
        p.frame = 0;
        this.addSprite(p);
        break;
      }
      case 'falling_nectar': {
        // (remaining mobs: the bee) vanilla DripParticle.createNectarFallParticle: a pale speck off a bee carrying
        // nectar, gone when it lands
        const p = this.base(kind, x, y, z);
        p.bbw = 0.01;
        p.gravity = 0.007;
        p.friction = 0.98;
        p.lifetime = Math.floor(16 / (Math.random() * 0.8 + 0.2));
        [p.r, p.g, p.b] = [0.92, 0.782, 0.72];
        p.frames = ['drip_fall'];
        p.frame = 0;
        p.drip = { stage: 'fall', fluid: null, next: null, cooling: false };
        this.addSprite(p);
        break;
      }
      case 'falling_spore_blossom': {
        // vanilla DripParticle.createSporeBlossomFallParticle: a green speck drifting down, gone when it lands
        const p = this.base(kind, x, y, z);
        p.bbw = 0.01;
        p.gravity = 0.005;
        p.lifetime = Math.floor(64 / (0.1 + Math.random() * 0.8));
        p.r = 0.32;
        p.g = 0.5;
        p.b = 0.22;
        p.frames = ['drip_fall'];
        p.frame = 0;
        p.drip = { stage: 'fall', fluid: null, next: null, cooling: false };
        this.addSprite(p);
        break;
      }
      case 'spore_blossom_air': {
        // vanilla SuspendedParticle (SporeBlossomAirProvider): drifts through blocks for 25 to 50 seconds, slowly sinking
        // (at most 1000 of them: vanilla ParticleGroup.SPORE_BLOSSOM)
        if (this.sporeAir >= 1000) break;
        const p = this.base(kind, x, y - 0.125, z);
        this.withSpeed(p, 0, -0.8, 0);
        p.size *= Math.random() * 0.6 + 0.6;
        p.lifetime = 500 + Math.floor(Math.random() * 501);
        p.physics = false;
        p.friction = 1;
        p.gravity = 0.01;
        p.r = 0.32;
        p.g = 0.5;
        p.b = 0.22;
        p.frames = ['generic_0'];
        p.frame = 0;
        this.sporeAir++;
        this.addSprite(p);
        break;
      }
      case 'splash':
      case 'rain': {
        // vanilla WaterDropParticle / SplashParticle
        const p = this.base(kind, x, y, z);
        this.withSpeed(p, 0, 0, 0);
        p.dx *= 0.3;
        p.dy = Math.random() * 0.2 + 0.1;
        p.dz *= 0.3;
        p.bbw = 0.01;
        p.gravity = kind === 'splash' ? 0.04 : 0.06;
        p.lifetime = Math.floor(8 / (Math.random() * 0.8 + 0.2));
        if (kind === 'splash' && yd === 0 && (xd !== 0 || zd !== 0)) {
          p.dx = xd;
          p.dy = 0.1;
          p.dz = zd;
        }
        p.frames = ['splash_0', 'splash_1', 'splash_2', 'splash_3'];
        p.frame = Math.floor(Math.random() * 4);
        this.addSprite(p);
        break;
      }
      case 'bubble': {
        // vanilla BubbleParticle: wobbles upward, pops out of water
        const p = this.base(kind, x, y, z);
        p.bbw = 0.02;
        p.size *= Math.random() * 0.6 + 0.2;
        p.dx = xd * 0.2 + (Math.random() * 2 - 1) * 0.02;
        p.dy = yd * 0.2 + (Math.random() * 2 - 1) * 0.02;
        p.dz = zd * 0.2 + (Math.random() * 2 - 1) * 0.02;
        p.lifetime = Math.floor(8 / (Math.random() * 0.8 + 0.2));
        p.frames = ['bubble'];
        p.frame = 0;
        this.addSprite(p);
        break;
      }
      case 'happy_villager':
      case 'composter': {
        // vanilla SuspendedTownParticle (HappyVillagerProvider, ComposterFillProvider): hovers in place
        const p = this.base(kind, x, y, z);
        this.withSpeed(p, xd, yd, zd);
        p.bbw = 0.02;
        p.size *= Math.random() * 0.6 + 0.5;
        p.dx *= 0.02;
        p.dy *= 0.02;
        p.dz *= 0.02;
        p.lifetime = kind === 'composter' ? 3 + Math.floor(Math.random() * 5) : Math.floor(20 / (Math.random() * 0.8 + 0.2));
        p.physics = false;
        p.friction = 0.99;
        p.frames = ['glint'];
        p.frame = 0;
        this.addSprite(p);
        break;
      }
      default:
        // (foxes) the crumbs of any other item (whatever food a fox eats)
        if (kind.startsWith('item_')) this.breakingItem(kind, x, y, z, xd, yd, zd);
        // (the deep dark's own kinds: sculk_charge_pop, sculk_soul; and Soul Speed's soul)
        else this.sculk.spawn(kind, x, y, z, xd, yd, zd);
        break;
    }
  }

  /** vanilla BreakingItemParticle: a random quarter of the item sprite, falling */
  private breakingItem(kind: string, x: number, y: number, z: number, xd: number, yd: number, zd: number): void {
    const p = this.base(kind, x, y, z);
    this.withSpeed(p, 0, 0, 0);
    p.dx = p.dx * 0.1 + xd;
    p.dy = p.dy * 0.1 + yd;
    p.dz = p.dz * 0.1 + zd;
    // (vanilla SlimeProvider / CobwebProvider make theirs without a speed)
    if (kind === 'item_slime' || kind === 'item_cobweb') this.withSpeed(p, 0, 0, 0);
    p.gravity = 1;
    p.size /= 2;
    p.frames = [kind === 'item_slime' ? 'item_slime_ball' : kind];
    p.frame = 0;
    const uo = Math.random() * 3, vo = Math.random() * 3;
    p.sub = [uo / 4, vo / 4, (uo + 1) / 4, (vo + 1) / 4];
    this.addSprite(p);
  }

  /**
   * vanilla SpellParticle for EFFECT, INSTANT_EFFECT (a splash potion's burst) and WITCH: a swirl, or an instant effect's
   * sparkle, rising, in the colour given; `power` flings it out (Particle.setPower). Only the vertical speed is
   * the caller's: the constructor makes up its own horizontal one, slowed tenfold when none was given
   */
  spell(kind: 'effect' | 'instant_effect' | 'witch', x: number, y: number, z: number, xd: number, yd: number, zd: number, r: number, g: number, b: number, power = 1): void {
    const p = this.base(kind, x, y, z);
    this.withSpeed(p, 0.5 - Math.random(), yd, 0.5 - Math.random());
    p.friction = 0.96;
    p.gravity = -0.1;
    p.speedUpWhenBlocked = true;
    p.dy *= 0.2;
    if (xd === 0 && zd === 0) {
      p.dx *= 0.1;
      p.dz *= 0.1;
    }
    p.size *= 0.75;
    p.lifetime = Math.floor(8 / (Math.random() * 0.8 + 0.2));
    p.physics = false;
    // (vanilla particles/witch.json: the instant effect's sparkles; WitchProvider gives them their purple)
    p.frames = kind === 'effect' ? EFFECT : SPELL;
    p.r = r;
    p.g = g;
    p.b = b;
    p.dx *= power;
    p.dy = (p.dy - 0.1) * power + 0.1;
    p.dz *= power;
    this.addSprite(p);
  }

  /** vanilla SpellParticle.MobEffectProvider (ENTITY_EFFECT): a rising swirl in the effect's colour */
  entityEffect(x: number, y: number, z: number, color: number, alpha: number): void {
    const p = this.base('entity_effect', x, y, z);
    // SpellParticle passes random horizontal speeds to the Particle constructor, keeps the vertical one (1.0)
    this.withSpeed(p, 0.5 - Math.random(), 1, 0.5 - Math.random());
    p.friction = 0.96;
    p.gravity = -0.1;
    p.speedUpWhenBlocked = true;
    p.dy *= 0.2;
    p.size *= 0.75;
    p.lifetime = Math.floor(8 / (Math.random() * 0.8 + 0.2));
    p.physics = false;
    p.frames = EFFECT;
    p.r = ((color >> 16) & 255) / 255;
    p.g = ((color >> 8) & 255) / 255;
    p.b = (color & 255) / 255;
    if (alpha < 1) p.alpha = alpha;
    this.addSprite(p);
  }

  /** vanilla DustParticle (DustParticleBase): a speck of colour that drifts a little and shrinks away through the generic frames */
  dust(x: number, y: number, z: number, r: number, g: number, b: number, scale: number): void {
    const p = this.base('dust', x, y, z);
    this.withSpeed(p, 0, 0, 0);
    p.friction = 0.96;
    p.speedUpWhenBlocked = true;
    p.dx *= 0.1;
    p.dy *= 0.1;
    p.dz *= 0.1;
    const f = Math.random() * 0.4 + 0.6;
    p.r = (Math.random() * 0.2 + 0.8) * r * f;
    p.g = (Math.random() * 0.2 + 0.8) * g * f;
    p.b = (Math.random() * 0.2 + 0.8) * b * f;
    p.size *= 0.75 * scale;
    p.lifetime = Math.max(1, Math.floor(Math.floor(8 / (Math.random() * 0.8 + 0.2)) * scale));
    p.grow = true;
    this.addSprite(p);
  }

  /** vanilla FallingDustParticle (dust sifting from under sand and gravel), tinted by the block */
  fallingDust(x: number, y: number, z: number, color: number): void {
    const p = this.base('falling_dust', x, y, z);
    p.r = ((color >> 16) & 255) / 255;
    p.g = ((color >> 8) & 255) / 255;
    p.b = (color & 255) / 255;
    p.size *= 0.67499995;
    p.lifetime = Math.max(1, Math.floor(Math.floor(32 / (Math.random() * 0.8 + 0.2)) * 0.9));
    p.rotSpeed = (Math.random() - 0.5) * 0.1;
    p.roll = p.oRoll = Math.random() * Math.PI * 2;
    p.bbw = 0.2;
    p.grow = true;
    p.friction = 1;
    this.addSprite(p);
  }

  /** vanilla TrackingEmitter: `lifetime` ticks (3 for crits, 30 for a totem) × 16 particles around an entity */
  emitAround(kind: 'crit' | 'enchanted_hit' | 'totem_of_undying', e: { x: number; y: number; z: number; width: number; height: number }, lifetime = 3): void {
    const p = this.base('emitter', e.x, e.y, e.z);
    p.lifetime = lifetime;
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
    let spores = 0;
    for (let i = 0; i < n; i++) if (list[i].kind === 'spore_blossom_air') spores++;
    this.sporeAir = spores;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      p.xo = p.x;
      p.yo = p.y;
      p.zo = p.z;
      if (p.bbw !== undefined && p.kind !== 'lava') {
        if (this.tickSpecial(p)) list[w++] = p;
        continue;
      }
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
      if (p.enchant) {
        const f = 1 - p.age / p.lifetime;
        let f1 = 1 - f;
        f1 *= f1;
        f1 *= f1;
        p.x = p.enchant.x + p.dx * f;
        p.y = p.enchant.y + p.dy * f - f1 * 1.2;
        p.z = p.enchant.z + p.dz * f;
        list[w++] = p;
        continue;
      }
      // (trial chambers) vanilla FlyStraightTowardsParticle.tick: straight in, its colour going over as it comes
      if (p.straight) {
        const f = p.age / p.lifetime, g = 1 - f;
        p.x = p.straight.x + p.dx * g;
        p.y = p.straight.y + p.dy * g;
        p.z = p.straight.z + p.dz * g;
        const c = p.colorLerp;
        if (c) [p.r, p.g, p.b] = [c[0] + (c[3] - c[0]) * f, c[1] + (c[4] - c[1]) * f, c[2] + (c[5] - c[2]) * f];
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
      if (p.decay) {
        p.gravity *= p.decay[0];
        p.friction *= p.decay[1];
      }
      p.dy -= 0.04 * p.gravity;
      if (p.bbw !== undefined) this.moveBB(p);
      else if (p.physics) this.move(p as unknown as Particle);
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
      if (!p.keepYSpeed) p.dy *= p.friction;
      p.dz *= p.friction;
      if (p.onGround) {
        p.dx *= 0.7;
        p.dz *= 0.7;
      }
      p.g *= p.gDecay;
      p.b *= p.bDecay;
      if (p.animated && p.age > Math.floor(p.lifetime / 2)) {
        p.alpha = 1 - (p.age - Math.floor(p.lifetime / 2)) / p.lifetime;
        if (p.fade) {
          p.r += (p.fade[0] - p.r) * 0.2;
          p.g += (p.fade[1] - p.g) * 0.2;
          p.b += (p.fade[2] - p.b) * 0.2;
        }
      }
      // (Stage 4: totems) vanilla SimpleAnimatedParticle.tick: fading out over the second half of its life
      if (p.kind === 'totem_of_undying' && p.age > p.lifetime / 2) p.alpha = 1 - (p.age - p.lifetime / 2) / p.lifetime;
      // vanilla LavaParticle.tick: embers trail smoke while young
      if (p.kind === 'lava' && Math.random() > p.age / p.lifetime) this.spawn('smoke', p.x, p.y, p.z, p.dx, p.dy, p.dz);
      // ((powder snow) vanilla SnowflakeParticle.tick: slowing as it drifts down)
      if (p.kind === 'snowflake') {
        p.dx *= 0.95;
        p.dy *= 0.9;
        p.dz *= 0.95;
      }
      // (fireworks) vanilla SparkParticle.tick: through the first half of its life, every other tick, a spark where it
      // is, still, in its colour and already half through its own life (and, vanilla's slip, never fading)
      if (p.spark?.trail && p.age < Math.floor(p.lifetime / 2) && (p.age + p.lifetime) % 2 === 0) {
        const t = this.spark(p.x, p.y, p.z, 0, 0, 0, -1, -1, false, p.spark.twinkle);
        t.r = p.r;
        t.g = p.g;
        t.b = p.b;
        t.age = Math.floor(t.lifetime / 2);
      }
      list[w++] = p;
    }
    // particles spawned by emitters this tick were appended after n
    for (let i = n; i < list.length; i++) list[w++] = list[i];
    list.length = w;
    // (vanilla EvictingQueue: past the limit the oldest go)
    if (list.length > this.max) list.splice(0, list.length - this.max);
  }

  /** tick for particles with their own vanilla tick(); false = remove */
  private tickSpecial(p: SpriteParticle): boolean {
    const w = this.world;
    const d = p.drip;
    if (d) {
      // vanilla DripParticle.tick: preMoveUpdate, fall, postMoveUpdate
      if (d.stage === 'hang') {
        if (d.cooling) {
          p.r = 1;
          p.g = 16 / (40 - p.lifetime + 16);
          p.b = 4 / (40 - p.lifetime + 8);
        }
        if (p.lifetime-- <= 0) {
          if (d.next) this.spawn(d.next, p.x, p.y, p.z, p.dx, p.dy, p.dz);
          return false;
        }
      } else if (p.lifetime-- <= 0) return false;
      p.dy -= p.gravity;
      this.moveBB(p);
      if (d.stage === 'hang') {
        p.dx *= 0.02;
        p.dy *= 0.02;
        p.dz *= 0.02;
      } else if (d.stage === 'fall' && p.onGround) {
        if (d.next) this.spawn(d.next, p.x, p.y, p.z, 0, 0, 0);
        if (d.dripstone) this.onDripstoneDripLand?.(p.x, p.y, p.z, d.fluid === 'lava');
        if (d.honey) this.onHoneyDripLand?.(p.x, p.y, p.z);
        return false;
      }
      p.dx *= 0.98;
      p.dy *= 0.98;
      p.dz *= 0.98;
      if (d.fluid) {
        const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
        const type = d.fluid === 'water' ? FLUID_WATER : FLUID_LAVA;
        const h = fluidHeight(w, bx, by, bz, type);
        if (h > 0 && p.y < by + h) return false;
      }
      return true;
    }
    switch (p.kind) {
      case 'splash':
      case 'rain': {
        // vanilla WaterDropParticle.tick
        if (p.lifetime-- <= 0) return false;
        p.dy -= p.gravity;
        this.moveBB(p);
        p.dx *= 0.98;
        p.dy *= 0.98;
        p.dz *= 0.98;
        if (p.onGround) {
          if (Math.random() < 0.5) return false;
          p.dx *= 0.7;
          p.dz *= 0.7;
        }
        const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
        const st = w.getState(bx, by, bz);
        let top = fluidHeight(w, bx, by, bz, FLUID_WATER);
        const boxes = COLLISION[st];
        if (boxes) {
          const fx = p.x - bx, fz = p.z - bz;
          for (const b of boxes) if (fx >= b[0] && fx <= b[3] && fz >= b[2] && fz <= b[5]) top = Math.max(top, b[4]);
        }
        return !(top > 0 && p.y < by + top);
      }
      case 'bubble': {
        // vanilla BubbleParticle.tick
        if (p.lifetime-- <= 0) return false;
        p.dy += 0.002;
        this.moveBB(p);
        p.dx *= 0.85;
        p.dy *= 0.85;
        p.dz *= 0.85;
        return fluidType(w.getState(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) === FLUID_WATER;
      }
      case 'happy_villager':
      case 'composter': {
        // vanilla SuspendedTownParticle.tick (moves without collision)
        if (p.lifetime-- <= 0) return false;
        p.x += p.dx;
        p.y += p.dy;
        p.z += p.dz;
        p.dx *= 0.99;
        p.dy *= 0.99;
        p.dz *= 0.99;
        return true;
      }
      case 'campfire_cosy_smoke':
      case 'campfire_signal_smoke': {
        // vanilla CampfireSmokeParticle.tick: drifts up, wandering a little, and fades over its last 60 ticks
        if (p.age++ >= p.lifetime || (p.alpha ?? 0) <= 0) return false;
        p.dx += (Math.random() / 5000) * (Math.random() < 0.5 ? 1 : -1);
        p.dz += (Math.random() / 5000) * (Math.random() < 0.5 ? 1 : -1);
        p.dy -= p.gravity;
        if (!p.stopped) {
          const dy = p.dy;
          this.moveBB(p);
          if (Math.abs(dy) >= 1e-5 && Math.abs(p.y - p.yo) < 1e-5) p.stopped = true;
        }
        if (p.age >= p.lifetime - 60 && (p.alpha ?? 0) > 0.01) p.alpha = (p.alpha ?? 0) - 0.015;
        return true;
      }
      case 'falling_dust': {
        // vanilla FallingDustParticle.tick
        if (p.age++ >= p.lifetime) return false;
        p.oRoll = p.roll;
        p.roll = (p.roll ?? 0) + Math.PI * (p.rotSpeed ?? 0) * 2;
        if (p.onGround) p.oRoll = p.roll = 0;
        this.moveBB(p);
        p.dy -= 0.003;
        p.dy = Math.max(p.dy, -0.14);
        return true;
      }
      default:
        return p.age++ < p.lifetime;
    }
  }

  /** vanilla Particle.move with its bounding box (position = bottom centre) */
  private moveBB(p: SpriteParticle): void {
    const hw = (p.bbw ?? 0.2) / 2, h = p.bbw ?? 0.2;
    const box = new AABB(p.x - hw, p.y, p.z - hw, p.x + hw, p.y + h, p.z + hw);
    const boxes: AABB[] = [];
    const x0 = Math.floor(Math.min(box.minX, box.minX + p.dx)), x1 = Math.floor(Math.max(box.maxX, box.maxX + p.dx));
    const y0 = Math.floor(Math.min(box.minY, box.minY + p.dy)) - 1, y1 = Math.floor(Math.max(box.maxY, box.maxY + p.dy));
    const z0 = Math.floor(Math.min(box.minZ, box.minZ + p.dz)), z1 = Math.floor(Math.max(box.maxZ, box.maxZ + p.dz));
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const c = COLLISION[this.world.getState(x, y, z)];
          if (!c) continue;
          for (const b of c) boxes.push(new AABB(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]));
        }
    const [rx, ry, rz] = boxes.length ? collideWithBoxes(p.dx, p.dy, p.dz, box, boxes) : [p.dx, p.dy, p.dz];
    p.x += rx;
    p.y += ry;
    p.z += rz;
    p.onGround = p.dy !== ry && p.dy < 0;
    if (p.dx !== rx) p.dx = 0;
    if (p.dz !== rz) p.dz = 0;
  }

  tick(): void {
    this.sculk.tick();
    this.tickSprites();
    if (this.tickers.length) {
      const t = this.tickers.splice(0);
      for (const k of t) if (k.tick()) this.tickers.push(k);
    }
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

  /** draw sprite particles (after terrain particles); translucent ones in a second, blended pass */
  renderSprites(batch: EntityBatch, cam: Camera, partial: number): void {
    if (this.spriteTexture) this.sculk.render(batch, cam, partial, this.spriteTexture, this.spriteRects);
    if (!this.sprites.length || !this.spriteTexture) return;
    batch.begin({ texture: this.spriteTexture, cutoff: 0.1, blend: false, cull: false, lit: false, useLightmap: true });
    let translucent = false;
    for (const p of this.sprites) {
      if (p.alpha !== undefined) translucent = true;
      else this.renderSprite(batch, p, cam, partial);
    }
    batch.flush();
    if (!translucent) return;
    batch.begin({ texture: this.spriteTexture, cutoff: 0.01, blend: true, cull: false, lit: false, useLightmap: true, depthWrite: false });
    for (const p of this.sprites) if (p.alpha !== undefined) this.renderSprite(batch, p, cam, partial);
    batch.flush();
  }

  private renderSprite(batch: EntityBatch, p: SpriteParticle, cam: Camera, partial: number): void {
    if (p.emitter) return;
    // (fireworks) vanilla SparkParticle.render: a twinkling spark shows through its first third, then three ticks in six
    if (p.spark?.twinkle && !(p.age < Math.floor(p.lifetime / 3) || Math.floor((p.age + p.lifetime) / 3) % 2 === 0)) return;
    const yr = (cam.yaw * Math.PI) / 180, pr = (cam.pitch * Math.PI) / 180;
    const rx = -Math.cos(yr), rz = -Math.sin(yr);
    // (trial chambers) an upright one (LOOKAT_Y) keeps its up straight up
    const ux = p.upright ? 0 : -Math.sin(yr) * Math.sin(pr), uy = p.upright ? 1 : Math.cos(pr), uz = p.upright ? 0 : Math.cos(yr) * Math.sin(pr);
    const name = p.frame >= 0 ? p.frames[p.frame] : p.frames[Math.min(p.frames.length - 1, Math.floor((p.age * (p.frames.length - 1)) / Math.max(1, p.lifetime)))];
    const r = this.spriteRects[name];
    if (!r) return;
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
      // vanilla FlameParticle / LavaParticle.getLightColor
      if (p.lightMode === 'lava') batch.lightB = 240;
      // vanilla DripParticle.isGlowing: getLightColor 240
      else if (p.lightMode === 'glow') {
        batch.lightB = 240;
        batch.lightS = 0;
      }
      else if (p.lightMode === 'flame') batch.lightB = Math.min(240, batch.lightB + Math.floor(Math.max(0, Math.min(1, (p.age + partial) / p.lifetime)) * 15 * 16));
      else if (p.lightMode === 'enchant') {
        // vanilla EnchantmentTableParticle.getLightColor: brightens (sky part) as it nears the table
        let f = p.age / p.lifetime;
        f *= f;
        f *= f;
        batch.lightS = Math.min(240, batch.lightS + Math.floor(f * 15 * 16));
      }
    }
    let s = p.size;
    if (p.grow) s *= Math.max(0, Math.min(1, ((p.age + partial) / p.lifetime) * 32));
    if (p.sizeCurve) {
      const f = (p.age + partial) / p.lifetime;
      s *= p.sizeCurve === 'flame' ? 1 - f * f * 0.5 : 1 - f * f;
    }
    if (p.portal) {
      let f = (p.age + partial) / p.lifetime;
      f = 1 - f;
      f *= f;
      s *= 1 - f;
    }
    let alpha = p.alpha ?? 1;
    // (trial chambers) vanilla Particle.LifetimeAlpha.currentAlphaForAge
    if (p.lifetimeAlpha) {
      const [a0, a1, t0, t1] = p.lifetimeAlpha;
      alpha = a0 + (a1 - a0) * Math.max(0, Math.min(1, ((p.age + partial) / p.lifetime - t0) / (t1 - t0)));
    }
    // (fireworks) vanilla OverlayParticle.getQuadSize and render: 7.1 sin(t / 4 pi) across, alpha 0.6 - t / 8
    if (p.flash) {
      const t = p.age + partial - 1;
      s = 7.1 * Math.sin(t * 0.25 * Math.PI);
      alpha = 0.6 - t * 0.25 * 0.5;
    }
    let ru0 = r.u0, rv0 = r.v0, ru1 = r.u1, rv1 = r.v1;
    if (p.sub) {
      const du = r.u1 - r.u0, dv = r.v1 - r.v0;
      ru0 = r.u0 + du * p.sub[0];
      rv0 = r.v0 + dv * p.sub[1];
      ru1 = r.u0 + du * p.sub[2];
      rv1 = r.v0 + dv * p.sub[3];
    }
    let ax = rx * s, az = rz * s, ay = 0;
    let bx = ux * s, by = uy * s, bz = uz * s;
    if (p.roll) {
      // vanilla SingleQuadParticle roll: spin the quad in the view plane
      const roll = (p.oRoll ?? p.roll) + (p.roll - (p.oRoll ?? p.roll)) * partial;
      const c = Math.cos(roll), sn = Math.sin(roll);
      const nax = ax * c + bx * sn, nay = by * sn, naz = az * c + bz * sn;
      const nbx = -ax * sn + bx * c, nby = by * c, nbz = -az * sn + bz * c;
      ax = nax;
      ay = nay;
      az = naz;
      bx = nbx;
      by = nby;
      bz = nbz;
    }
    const v = [
      [x - ax - bx, y - ay - by, z - az - bz, ru1, rv1],
      [x - ax + bx, y - ay + by, z - az + bz, ru1, rv0],
      [x + ax + bx, y + ay + by, z + az + bz, ru0, rv0],
      [x + ax - bx, y + ay - by, z + az - bz, ru0, rv1],
    ];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const q = v[k];
      batch.vertexRaw(q[0], q[1], q[2], q[3], q[4], p.r, p.g, p.b, alpha, 0, 1, 0);
    }
  }

  clear(): void {
    this.list.length = 0;
    this.sprites.length = 0;
    this.tickers.length = 0;
    this.sculk.clear();
  }

  get count(): number {
    return this.list.length + this.sprites.length + this.sculk.count;
  }
}
