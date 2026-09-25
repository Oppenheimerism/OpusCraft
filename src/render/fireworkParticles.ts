// A firework's burst (vanilla 1.21 FireworkParticles.Starter, which ClientLevel.createFireworks starts when a rocket with
// stars explodes): a NoRenderParticle that sets off one star every other tick — its sparks in the star's shape and a
// flash in its first colour — with the blast's sound (a large one for three stars or more, or any large ball; the
// far-off take from 16 blocks) and, when any star twinkles, the crackle 15 ticks after the last. Its sounds come as
// far off sounds do (vanilla playLocalSound with distanceDelay): half a tick later for each block past ten.
// The sparks and the flash are render/particles.ts's; the rocket is entity/fireworkRocket.ts.

import type { FireworkExplosion } from '../item/fireworks';
import type { Level } from '../game/level';

/** what the Starter needs of the particle engine (render/particles.ts ParticleEngine) */
export interface FireworkParticleEngine {
  spark(x: number, y: number, z: number, xd: number, yd: number, zd: number, color: number, fade: number, trail: boolean, twinkle: boolean): unknown;
  flash(x: number, y: number, z: number, color: number): void;
  addTicker(t: { tick(): boolean }): void;
}

/** vanilla FireworkParticles.Starter.CREEPER_PARTICLE_COORDS: half a creeper's face, down the middle */
const CREEPER: readonly (readonly [number, number])[] = [
  [0, 0.2], [0.2, 0.2], [0.2, 0.6], [0.6, 0.6], [0.6, 0.2], [0.2, 0.2], [0.2, 0], [0.4, 0], [0.4, -0.6], [0.2, -0.6], [0.2, -0.4], [0, -0.4],
];
/** vanilla FireworkParticles.Starter.STAR_PARTICLE_COORDS: half a five-pointed star */
const STAR: readonly (readonly [number, number])[] = [
  [0, 1], [0.3455, 0.309], [0.9511, 0.309], [0.3795918367346939, -0.12653061224489795], [0.6122448979591837, -0.8040816326530612], [0, -0.35918367346938773],
];
/** vanilla DyeColor.BLACK's firework colour: a star with no colours bursts in it */
const BLACK = 0x1e1b1b;

/** vanilla Random.nextGaussian (Box-Muller) */
function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

/** where the sounds are heard from (vanilla: the camera; here the listener, the player's eyes) */
function listener(level: Level): [number, number, number] | null {
  const p = level.player;
  return p ? [p.x, p.y + p.eyeHeight, p.z] : null;
}

export class FireworkStarter {
  private life = 0;
  readonly lifetime: number;
  private readonly twinkleDelay: boolean;

  constructor(
    private readonly engine: FireworkParticleEngine,
    private readonly level: Level,
    readonly x: number,
    readonly y: number,
    readonly z: number,
    private readonly xd: number,
    private readonly yd: number,
    private readonly zd: number,
    readonly explosions: readonly FireworkExplosion[],
    private readonly rnd: () => number = Math.random,
  ) {
    if (!explosions.length) throw new Error('Cannot create firework starter with no explosions');
    // (two ticks a star, the last one's straight away; fifteen more to crackle in)
    this.twinkleDelay = explosions.some((e) => e.hasTwinkle);
    this.lifetime = explosions.length * 2 - 1 + (this.twinkleDelay ? 15 : 0);
  }

  /** vanilla Starter.isFarAway: the camera 16 blocks away or more */
  private isFarAway(): boolean {
    const l = listener(this.level);
    if (!l) return false;
    const dx = l[0] - this.x, dy = l[1] - this.y, dz = l[2] - this.z;
    return dx * dx + dy * dy + dz * dz >= 256;
  }

  /** vanilla ClientLevel.playLocalSound(..., SoundSource.AMBIENT, 20, pitch, distanceDelay: true) */
  private play(name: string, pitch: number): void {
    const l = listener(this.level);
    const d2 = l ? (l[0] - this.x) ** 2 + (l[1] - this.y) ** 2 + (l[2] - this.z) ** 2 : 0;
    const go = (): void => this.level.sound.play(name, this.x, this.y, this.z, 20, pitch);
    // (vanilla SoundManager.playDelayed by (int)(distance / 40 s · 20) ticks, past ten blocks)
    const delay = d2 > 100 ? Math.floor((Math.sqrt(d2) / 40) * 20) : 0;
    if (delay <= 0) go();
    else {
      let left = delay;
      this.engine.addTicker({
        tick: () => {
          if (--left > 0) return true;
          go();
          return false;
        },
      });
    }
  }

  /** vanilla Starter.tick; false once it's done */
  tick(): boolean {
    const ex = this.explosions;
    if (this.life === 0) {
      const far = this.isFarAway();
      const large = ex.length >= 3 || ex.some((e) => e.shape === 'large_ball');
      const name = large ? (far ? 'entity.firework_rocket.large_blast_far' : 'entity.firework_rocket.large_blast') : far ? 'entity.firework_rocket.blast_far' : 'entity.firework_rocket.blast';
      this.play(name, 0.95 + this.rnd() * 0.1);
    }
    if (this.life % 2 === 0 && Math.floor(this.life / 2) < ex.length) {
      const e = ex[Math.floor(this.life / 2)];
      const colors = e.colors.length ? e.colors : [BLACK];
      switch (e.shape) {
        case 'small_ball':
          this.ball(0.25, 2, colors, e);
          break;
        case 'large_ball':
          this.ball(0.5, 4, colors, e);
          break;
        case 'star':
          this.shape(0.5, STAR, colors, e, false);
          break;
        case 'creeper':
          this.shape(0.5, CREEPER, colors, e, true);
          break;
        case 'burst':
          this.burst(colors, e);
          break;
      }
      this.engine.flash(this.x, this.y, this.z, colors[0]);
    }
    this.life++;
    if (this.life > this.lifetime) {
      if (this.twinkleDelay) this.play(this.isFarAway() ? 'entity.firework_rocket.twinkle_far' : 'entity.firework_rocket.twinkle', 0.9 + this.rnd() * 0.15);
      return false;
    }
    return true;
  }

  /** vanilla Starter.createParticle: a spark in one of the star's colours, fading to one of its fade colours */
  private particle(xd: number, yd: number, zd: number, colors: readonly number[], e: FireworkExplosion): void {
    const c = colors[Math.floor(this.rnd() * colors.length)];
    const f = e.fadeColors.length ? e.fadeColors[Math.floor(this.rnd() * e.fadeColors.length)] : -1;
    this.engine.spark(this.x, this.y, this.z, xd, yd, zd, c, f, e.hasTrail, e.hasTwinkle);
  }

  /**
   * vanilla Starter.createParticleBall: a spark for each point of the (2·size+1)³ cube's shell, jittered by half a
   * point and flung out at `speed` over its distance from the middle (a little uneven), the cube's inside skipped
   */
  private ball(speed: number, size: number, colors: readonly number[], e: FireworkExplosion): void {
    const r = this.rnd;
    for (let i = -size; i <= size; i++)
      for (let j = -size; j <= size; j++)
        for (let k = -size; k <= size; k++) {
          const g = j + (r() - r()) * 0.5;
          const h = i + (r() - r()) * 0.5;
          const l = k + (r() - r()) * 0.5;
          const m = Math.sqrt(g * g + h * h + l * l) / speed + gauss(r) * 0.05;
          this.particle(g / m, h / m, l / m, colors, e);
          if (i !== -size && i !== size && j !== -size && j !== size) k += size * 2 - 1;
        }
  }

  /**
   * vanilla Starter.createParticleShape: the outline in `coords` (the right half, x ≥ 0) drawn in sparks, a quarter
   * of each edge apart and mirrored, three times turned about the vertical from a random start (the creeper's face
   * barely turned between them, the star's by 0.34 π)
   */
  private shape(speed: number, coords: readonly (readonly [number, number])[], colors: readonly number[], e: FireworkExplosion, creeper: boolean): void {
    const d = coords[0][0], e0 = coords[0][1];
    this.particle(d * speed, e0 * speed, 0, colors, e);
    const f = Math.fround(this.rnd() * Math.PI);
    const g = creeper ? 0.034 : 0.34;
    for (let i = 0; i < 3; i++) {
      const h = f + Math.fround(i * Math.PI) * g;
      let j = d, k = e0;
      for (let l = 1; l < coords.length; l++) {
        const m = coords[l][0], n = coords[l][1];
        for (let o = 0.25; o <= 1; o += 0.25) {
          let p = (j + (m - j) * o) * speed;
          const q = (k + (n - k) * o) * speed;
          const rr = p * Math.sin(h);
          p *= Math.cos(h);
          for (let s = -1; s <= 1; s += 2) this.particle(p * s, q, rr * s, colors, e);
        }
        j = m;
        k = n;
      }
    }
  }

  /** vanilla Starter.createParticleBurst: seventy sparks thrown up and out along half the rocket's motion */
  private burst(colors: readonly number[], e: FireworkExplosion): void {
    const r = this.rnd;
    const d = gauss(r) * 0.05, e0 = gauss(r) * 0.05;
    for (let i = 0; i < 70; i++) {
      const f = this.xd * 0.5 + gauss(r) * 0.15 + d;
      const g = this.zd * 0.5 + gauss(r) * 0.15 + e0;
      const h = this.yd * 0.5 + r() * 0.5;
      this.particle(f, h, g, colors, e);
    }
  }
}

/**
 * vanilla ClientLevel.createFireworks with stars: a Starter where the rocket went off, carrying its motion (the burst
 * follows half of it). (Without stars the rocket only puffs, entity/fireworkRocket.ts.)
 */
export function createFireworks(engine: FireworkParticleEngine, level: Level, x: number, y: number, z: number, xd: number, yd: number, zd: number, explosions: readonly FireworkExplosion[]): FireworkStarter | null {
  if (!explosions.length) return null;
  const s = new FireworkStarter(engine, level, x, y, z, xd, yd, zd, explosions);
  engine.addTicker(s);
  return s;
}
