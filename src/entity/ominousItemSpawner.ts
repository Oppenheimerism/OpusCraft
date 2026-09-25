// The ominous item spawner (1.21; vanilla OminousItemSpawner): what an ominous trial spawner sets over a player or
// one of its mobs every eight seconds (game/trialSpawner.ts). It hangs there, drawing blue sparks in toward itself, a
// warning sound comes 36 ticks before it's done, and 3 to 6 seconds after it came it lets go of its item: straight
// down if it's something vanilla shoots (ProjectileItem: an arrow, a potion, a fire charge, a wind charge...), else
// dropped. Drawn as its item growing in over 2.5 seconds and spinning, lit full (render/trialChamberRenderers.ts).
// (Like the game's other short-lived things in flight, thrown potions and fireballs, it isn't saved with its chunk.)

import { Entity } from './entity';
import { ItemEntity } from './itemEntity';
import { Arrow } from './arrow';
import { ThrownPotion } from './thrownPotion';
import { ThrownItem } from './throwable';
import { SmallFireball } from './fireball';
import { ThrownExperienceBottle } from './thrownExperienceBottle';
import type { ItemStack } from '../item/item';
import type { Level } from '../game/level';

/** vanilla ProjectileItem.DispenseConfig: how hard and how true it's shot, and the level event it makes instead */
interface ShotConfig {
  power: number;
  uncertainty: number;
}
const DEFAULT_SHOT: ShotConfig = { power: 1.1, uncertainty: 6 };
/** vanilla ThrowablePotionItem / ExperienceBottleItem: half the spread and a quarter more speed */
const THROWN_POTION: ShotConfig = { power: 1.375, uncertainty: 3 };

/**
 * vanilla ProjectileItem.asProjectile and shoot for what the ominous item spawner may hold, shot down from where it is;
 * null for anything that isn't a projectile. (trial chambers: M4 adds the wind charge's.)
 */
export const OMINOUS_PROJECTILES: Record<string, (level: Level, x: number, y: number, z: number, stack: ItemStack) => Entity> = {};

const shot = (e: Entity & { shoot(x: number, y: number, z: number, v: number, u: number): void }, c: ShotConfig): Entity => {
  e.shoot(0, -1, 0, c.power, c.uncertainty);
  return e;
};

// vanilla ArrowItem (and TippedArrowItem, SpectralArrowItem): picked up after, keeping what it is
for (const id of ['arrow', 'tipped_arrow', 'spectral_arrow'])
  OMINOUS_PROJECTILES[id] = (level, x, y, z, stack) => {
    const a = new Arrow(level, null);
    a.moveTo(x, y, z, 0, 0);
    a.pickup = 'allowed';
    if (stack.item.id !== 'arrow') a.setPickupStack(stack.copyWithCount(1));
    return shot(a, DEFAULT_SHOT);
  };
for (const id of ['splash_potion', 'lingering_potion'])
  OMINOUS_PROJECTILES[id] = (level, x, y, z, stack) => {
    const t = new ThrownPotion(level, null, stack.copyWithCount(1));
    t.moveTo(x, y, z, 0, 0);
    return shot(t, THROWN_POTION);
  };
OMINOUS_PROJECTILES.experience_bottle = (level, x, y, z) => {
  const t = new ThrownExperienceBottle(level, null);
  t.moveTo(x, y, z, 0, 0);
  return shot(t, THROWN_POTION);
};
for (const kind of ['egg', 'snowball'] as const)
  OMINOUS_PROJECTILES[kind] = (level, x, y, z) => {
    const t = new ThrownItem(level, kind, null);
    t.moveTo(x, y, z, 0, 0);
    return shot(t, DEFAULT_SHOT);
  };
// vanilla FireChargeItem.asProjectile: a small fireball headed down a little astray, with the blaze's shot (level
// event 1018)
OMINOUS_PROJECTILES.fire_charge = (level, x, y, z) => {
  const r = level.random;
  const tri = (mode: number) => mode + 0.11485000000000001 * (r.nextDouble() - r.nextDouble());
  const ball = new SmallFireball(level, null, tri(0), tri(-1), tri(0));
  ball.moveTo(x, y, z, 0, 0);
  level.sound.play('entity.blaze.shoot', Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.floor(z) + 0.5, 2, (r.nextFloat() - r.nextFloat()) * 0.2 + 1);
  return ball;
};

/** vanilla TrialSpawner.FlameParticle, as level events 3011, 3012 and 3021 carry it */
export const OMINOUS_FLAME = 1;

/**
 * vanilla LevelRenderer.levelEvent 3021 (TrialSpawner.addSpawnParticles): the item spawner's item is out, a puff of
 * smoke and flames round the block (the soul fire's blue for an ominous one)
 */
export function itemSpawnedEvent(level: Level, bx: number, by: number, bz: number, flame: number): void {
  const r = Math.random;
  level.sound.play('block.trial_spawner.spawn_item', bx + 0.5, by + 0.5, bz + 0.5, 1, (r() - r()) * 0.2 + 1);
  spawnParticles(level, bx, by, bz, flame);
}

/** vanilla TrialSpawner.addSpawnParticles: 20 puffs of smoke and flame within a block of the middle of the block */
export function spawnParticles(level: Level, bx: number, by: number, bz: number, flame: number): void {
  const r = Math.random;
  for (let i = 0; i < 20; i++) {
    const x = bx + 0.5 + (r() - 0.5) * 2, y = by + 0.5 + (r() - 0.5) * 2, z = bz + 0.5 + (r() - 0.5) * 2;
    level.particles.spawn?.('smoke', x, y, z, 0, 0, 0);
    level.particles.spawn?.(flame === OMINOUS_FLAME ? 'soul_fire_flame' : 'flame', x, y, z, 0, 0, 0);
  }
}

export class OminousItemSpawner extends Entity {
  readonly type = 'ominous_item_spawner';
  /** vanilla DATA_ITEM */
  item: ItemStack | null = null;
  /** vanilla spawnItemAfterTicks */
  spawnItemAfterTicks = 0;

  constructor(level: Level) {
    super(level);
    // vanilla EntityType.OMINOUS_ITEM_SPAWNER: 0.25 across, no gravity, never moves (noPhysics)
    this.setSize(0.25, 0.25);
    this.noPhysics = true;
  }

  /** vanilla OminousItemSpawner.create: its item comes out 60-120 ticks on */
  static create(level: Level, item: ItemStack): OminousItemSpawner {
    const e = new OminousItemSpawner(level);
    e.spawnItemAfterTicks = 60 + level.random.nextInt(61);
    e.item = item;
    return e;
  }

  override tick(): void {
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    this.tickCount++;
    // vanilla tickClient: the sparks every five ticks of the level's
    if (this.level.gameTime % 5 === 0) this.addParticles();
    // vanilla tickServer
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    if (this.tickCount === this.spawnItemAfterTicks - 36) this.level.sound.play('block.trial_spawner.about_to_spawn_item', bx + 0.5, by + 0.5, bz + 0.5, 1, 1);
    if (this.tickCount >= this.spawnItemAfterTicks) {
      this.spawnItem();
      this.kill();
    }
  }

  /** vanilla spawnItem: shot down if vanilla shoots it (a ProjectileItem), else dropped where it is */
  private spawnItem(): void {
    const s = this.item;
    if (!s || s.count <= 0) return;
    const level = this.level;
    const make = OMINOUS_PROJECTILES[s.item.id];
    let e: Entity;
    if (make) e = make(level, this.x, this.y, this.z, s);
    else {
      // vanilla new ItemEntity(level, x, y, z, stack): a little sideways, 0.2 up
      const it = new ItemEntity(level, s);
      it.moveTo(this.x, this.y, this.z, Math.random() * 360, 0);
      it.dx = level.random.nextDouble() * 0.2 - 0.1;
      it.dy = 0.2;
      it.dz = level.random.nextDouble() * 0.2 - 0.1;
      e = it;
    }
    level.addEntity(e);
    itemSpawnedEvent(level, Math.floor(this.x), Math.floor(this.y), Math.floor(this.z), OMINOUS_FLAME);
    // (deep dark hook) vanilla gameEvent(GameEvent.ENTITY_PLACE) goes here
    this.item = null;
  }

  /** vanilla addParticles: one to three blue sparks, each from a spot round it flying in to it */
  addParticles(): void {
    const r = this.level.random;
    const n = 1 + r.nextInt(3);
    for (let j = 0; j < n; j++) {
      const vx = 0.4 * (r.gaussian() - r.gaussian()), vy = 0.4 * (r.gaussian() - r.gaussian()), vz = 0.4 * (r.gaussian() - r.gaussian());
      this.level.particles.spawn?.('ominous_spawning', this.x, this.y, this.z, vx, vy, vz);
    }
  }
}
