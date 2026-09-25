// The lightning bolt (vanilla LightningBolt): a thunderstorm's strike. Two ticks of a blinding bolt, and one to three
// more flashes after short gaps, each a new shape (the renderer builds it from `seed`); thunder heard across the
// world and a crack close by; fire where it lands (a ring of it on normal and hard); and to everything within three
// blocks, 5 damage and eight seconds' burning — a creeper comes out charged, a pig a zombified piglin.

import { Entity } from './entity';
import { LivingEntity } from './living';
import type { Level } from '../game/level';
import { AABB } from '../core/aabb';
import { Rand } from '../core/rng';
import { canPlaceFire, fireStateAt, placeFire } from '../game/fire';
import { lightningStruck, lightningStrikeTrigger } from '../game/copper';

export class LightningBolt extends Entity {
  readonly type = 'lightning_bolt';
  readonly random = new Rand((Math.random() * 0x7fffffff) | 0);
  /** vanilla life: 2 on the first tick of a flash */
  private life = 2;
  /** this flash's shape */
  seed: number;
  private flashes: number;
  /** vanilla visualOnly: a flash and a bang, no harm done */
  visualOnly = false;
  private readonly hitEntities = new Set<Entity>();
  blocksSetOnFire = 0;
  /** vanilla cause: the player whose channeling trident called it down */
  cause: Entity | null = null;

  constructor(level: Level) {
    super(level);
    this.setSize(0, 0);
    this.noPhysics = true;
    this.seed = this.random.nextU32();
    this.flashes = this.random.nextInt(3) + 1;
  }

  override tick(): void {
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    this.tickCount++;
    const lvl = this.level, r = this.random;
    if (this.life === 2) {
      // (client) the thunder carries (a volume of 10000 is heard everywhere), the crack only nearby
      lvl.sound.play('entity.lightning_bolt.thunder', this.x, this.y, this.z, 10000, 0.8 + r.nextFloat() * 0.2);
      lvl.sound.play('entity.lightning_bolt.impact', this.x, this.y, this.z, 2, 0.5 + r.nextFloat() * 0.2);
      // (server)
      if (lvl.difficulty === 'normal' || lvl.difficulty === 'hard') this.spawnFire(4);
      // (trial chambers) vanilla powerLightningRod and clearCopperOnLightningStrike
      lightningStruck(lvl, this);
      // (deep dark hook) vanilla gameEvent(GameEvent.LIGHTNING_STRIKE) goes here
    }
    this.life--;
    if (this.life < 0) {
      if (this.flashes === 0) {
        // (trial chambers) vanilla CriteriaTriggers.LIGHTNING_STRIKE
        lightningStrikeTrigger(lvl, this, this.hitEntities);
        this.remove();
        return;
      }
      if (this.life < -r.nextInt(10)) {
        this.flashes--;
        this.life = 1;
        this.seed = r.nextU32();
        this.spawnFire(0);
      }
    }
    if (this.life >= 0) {
      // (client) the sky lights up
      lvl.skyFlash = 2;
      if (!this.visualOnly) {
        const x = this.x, y = this.y, z = this.z;
        const hit = lvl.getEntities(new AABB(x - 3, y - 3, z - 3, x + 3, y + 6 + 3, z + 3), (e) => !(e instanceof LivingEntity) || e.isAlive, this);
        for (const e of hit) {
          e.thunderHit(this);
          this.hitEntities.add(e);
        }
        // vanilla CriteriaTriggers.CHANNELED_LIGHTNING: everything it has struck so far
        if (this.cause && this.cause === lvl.player) lvl.onChanneledLightning?.([...this.hitEntities]);
      }
    }
  }

  /** vanilla spawnFire: fire in the block it stands in, and `extra` tries in the blocks round it */
  private spawnFire(extra: number): void {
    const lvl = this.level;
    if (this.visualOnly || !lvl.gameRules.doFireTick) return;
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    const at = (x: number, y: number, z: number) => {
      if (!canPlaceFire(lvl.world, x, y, z)) return;
      placeFire(lvl, x, y, z, fireStateAt(lvl.world, x, y, z));
      this.blocksSetOnFire++;
    };
    at(bx, by, bz);
    const r = this.random;
    for (let i = 0; i < extra; i++) at(bx + r.nextInt(3) - 1, by + r.nextInt(3) - 1, bz + r.nextInt(3) - 1);
  }

  override hurt(): boolean {
    return false;
  }

  override isPushable(): boolean {
    return false;
  }

  override isPickable(): boolean {
    return false;
  }

  protected override makesStepSounds(): boolean {
    return false;
  }
}
