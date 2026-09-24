// Explosions (vanilla Explosion.explode / finalizeExplosion): ray-marched
// block destruction by blast resistance, exposure-scaled entity damage and
// knockback, drops, chained TNT.

import type { Level } from './level';
import type { Entity } from '../entity/entity';
import { LivingEntity } from '../entity/living';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_WATER, F_LAVA } from '../world/block';
import { MIN_Y, MAX_Y } from '../world/constants';
import { AABB } from '../core/aabb';
import { clipBlocks } from './raycast';
import { blockDrops } from './blockRules';
import { behaviorOf } from './blockBehavior';
import { ItemEntity } from '../entity/itemEntity';
import { ItemStack } from '../item/item';
import { PrimedTnt } from '../entity/tnt';
import { explosionKnockbackResistance } from '../item/enchantHelper';

/** vanilla Level.ExplosionInteraction: TNT, MOB (only while mobs may grief), BLOCK, NONE (hurts, but leaves the blocks) */
export type ExplosionKind = 'tnt' | 'mob' | 'block' | 'none';

/** vanilla Explosion.getSeenPercent: fraction of sample points on the entity with a clear line to the center */
export function seenPercent(level: Level, x: number, y: number, z: number, e: Entity): number {
  const bb = e.bb;
  const d0 = 1 / ((bb.maxX - bb.minX) * 2 + 1);
  const d1 = 1 / ((bb.maxY - bb.minY) * 2 + 1);
  const d2 = 1 / ((bb.maxZ - bb.minZ) * 2 + 1);
  const d3 = (1 - Math.floor(1 / d0) * d0) / 2;
  const d4 = (1 - Math.floor(1 / d2) * d2) / 2;
  let hit = 0, total = 0;
  for (let a = 0; a <= 1; a += d0)
    for (let b = 0; b <= 1; b += d1)
      for (let c = 0; c <= 1; c += d2) {
        const px = bb.minX + (bb.maxX - bb.minX) * a + d3;
        const py = bb.minY + (bb.maxY - bb.minY) * b;
        const pz = bb.minZ + (bb.maxZ - bb.minZ) * c + d4;
        if (!clipBlocks(level.world, px, py, pz, x, y, z)) hit++;
        total++;
      }
  return total ? hit / total : 0;
}

/**
 * Explode at (x,y,z) with `radius` (TNT 4, creeper 3). `source` is the exploding
 * entity (excluded from damage), attacker credit goes to its owner if any.
 */
export function explode(level: Level, source: Entity | null, x: number, y: number, z: number, radius: number, fire: boolean, kind: ExplosionKind, damageSource?: string): void {
  const w = level.world;
  const rand = level.random;
  const destroys = kind === 'none' ? false : kind === 'mob' ? level.gameRules.mobGriefing : true;
  // 1) blocks: 16x16x16 rays from the surface of a cube
  const toBlow = new Map<string, [number, number, number]>();
  if (destroys) {
    for (let j = 0; j < 16; j++)
      for (let k = 0; k < 16; k++)
        for (let l = 0; l < 16; l++) {
          if (!(j === 0 || j === 15 || k === 0 || k === 15 || l === 0 || l === 15)) continue;
          let d0 = (j / 15) * 2 - 1, d1 = (k / 15) * 2 - 1, d2 = (l / 15) * 2 - 1;
          const d3 = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
          d0 /= d3;
          d1 /= d3;
          d2 /= d3;
          let f = radius * (0.7 + rand.nextFloat() * 0.6);
          let px = x, py = y, pz = z;
          for (; f > 0; f -= 0.22500001) {
            const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);
            if (by < MIN_Y || by >= MAX_Y) break;
            const st = w.getState(bx, by, bz);
            const fl = FLAGS[st];
            if (!(fl & F_AIR)) {
              const b = BLOCKS[STATE_BLOCK[st]];
              let res = b.resistance;
              if (fl & (F_WATER | F_LAVA)) res = Math.max(res, 100);
              f -= (res + 0.3) * 0.3;
              if (f > 0 && b.hardness >= 0 && !(fl & (F_WATER | F_LAVA))) toBlow.set(bx + ',' + by + ',' + bz, [bx, by, bz]);
            }
            px += d0 * 0.3;
            py += d1 * 0.3;
            pz += d2 * 0.3;
          }
        }
  }
  // 2) entities
  const f2 = radius * 2;
  const box = new AABB(Math.floor(x - f2 - 1), Math.floor(y - f2 - 1), Math.floor(z - f2 - 1), Math.floor(x + f2 + 1), Math.floor(y + f2 + 1), Math.floor(z + f2 + 1));
  const attacker = (source as { owner?: Entity | null } | null)?.owner ?? source;
  for (const e of level.getEntities(box, undefined, source)) {
    const dist = Math.sqrt(e.distanceToSqr(x, y, z)) / f2;
    if (dist > 1) continue;
    let dx = e.x - x;
    let dy = (e.type === 'tnt' ? e.y : e.y + e.eyeHeight) - y;
    let dz = e.z - z;
    const d12 = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d12 === 0) continue;
    dx /= d12;
    dy /= d12;
    dz /= d12;
    const seen = seenPercent(level, x, y, z, e);
    const d1 = (1 - dist) * seen;
    const dmg = ((d1 * d1 + d1) / 2) * 7 * f2 + 1;
    e.hurt(dmg, damageSource ?? (attacker && attacker !== source ? 'playerExplosion' : 'explosion'), attacker ?? null, source);
    let k = (1 - dist) * seen;
    // vanilla EXPLOSION_KNOCKBACK_RESISTANCE: blast protection (plain knockback resistance doesn't count)
    if (e instanceof LivingEntity) k *= 1 - explosionKnockbackResistance(e);
    const p = e as { gameMode?: string; flying?: boolean };
    if (p.gameMode === 'spectator' || (p.gameMode === 'creative' && p.flying)) continue;
    e.dx += dx * k;
    e.dy += dy * k;
    e.dz += dz * k;
  }
  // 3) effects
  level.sound.play('entity.generic.explode', x, y, z, 4, (1 + (rand.nextFloat() - rand.nextFloat()) * 0.2) * 0.7);
  level.particles.spawn?.(radius >= 2 && destroys ? 'explosion_emitter' : 'explosion', x, y, z, 1, 0, 0);
  // 4) destroy blocks (shuffled), drops: TNT drops everything, others 1/radius
  if (destroys) {
    const list = [...toBlow.values()];
    for (let i = list.length - 1; i > 0; i--) {
      const j = rand.nextInt(i + 1);
      [list[i], list[j]] = [list[j], list[i]];
    }
    const decay = kind !== 'tnt';
    const drops: [ItemStack, number, number, number][] = [];
    const removed: [number, number, number, number][] = [];
    for (const [bx, by, bz] of list) {
      const st = w.getState(bx, by, bz);
      if (FLAGS[st] & F_AIR) continue;
      const b = BLOCKS[STATE_BLOCK[st]];
      if (b.name === 'tnt') {
        level.setBlock(bx, by, bz, 0);
        const t = new PrimedTnt(level, bx + 0.5, by, bz + 0.5, attacker ?? null);
        level.addEntity(t);
        t.fuse = rand.nextInt(Math.floor(80 / 4)) + Math.floor(80 / 8);
        continue;
      }
      if (!decay || rand.nextFloat() < 1 / radius) {
        for (const s of blockDrops(st, null, rand)) {
          const same = drops.find((d) => d[0].sameItem(s) && d[0].count + s.count <= d[0].maxStack);
          if (same) same[0].count += s.count;
          else drops.push([s, bx, by, bz]);
        }
      }
      const be = w.getBlockEntity(bx, by, bz);
      if (be) {
        be.unpackLoot();
        for (const s of be.container.removeAll()) level.dropStackAt(bx, by, bz, s);
      }
      level.world.setState(bx, by, bz, 0);
      // (vanilla: removed with setBlock, so a switch caught in the blast lets go of what it powered)
      behaviorOf(st)?.onRemove?.(level, bx, by, bz, st, 0, false);
      removed.push([bx, by, bz, b.id]);
    }
    for (const [bx, by, bz, id] of removed) {
      level.updateNeighborsAt(bx, by, bz, id);
      level.updateNeighbors(bx, by, bz);
    }
    for (const [s, bx, by, bz] of drops) ItemEntity.drop(level, bx, by, bz, s);
  }
  void fire;
}

/**
 * vanilla Level.explode with a wind charge's damage calculator (AbstractWindCharge.EXPLOSION_DAMAGE_CALCULATOR,
 * ExplosionInteraction.TRIGGER): the blast's push on everything within twice the radius, no harm to them or the
 * blocks, a gust where it went off and the wind's burst (the wind charged effect, when its bearer dies)
 */
export function windBurst(level: Level, source: Entity | null, x: number, y: number, z: number, radius: number): void {
  const f2 = radius * 2;
  const box = new AABB(Math.floor(x - f2 - 1), Math.floor(y - f2 - 1), Math.floor(z - f2 - 1), Math.floor(x + f2 + 1), Math.floor(y + f2 + 1), Math.floor(z + f2 + 1));
  for (const e of level.getEntities(box, undefined, source)) {
    const dist = Math.sqrt(e.distanceToSqr(x, y, z)) / f2;
    if (dist > 1) continue;
    let dx = e.x - x;
    let dy = (e.type === 'tnt' ? e.y : e.y + e.eyeHeight) - y;
    let dz = e.z - z;
    const d12 = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d12 === 0) continue;
    let k = (1 - dist) * seenPercent(level, x, y, z, e);
    if (e instanceof LivingEntity) k *= 1 - explosionKnockbackResistance(e);
    const p = e as { gameMode?: string; flying?: boolean };
    if (p.gameMode === 'spectator' || (p.gameMode === 'creative' && p.flying)) continue;
    dx /= d12;
    dy /= d12;
    dz /= d12;
    e.dx += dx * k;
    e.dy += dy * k;
    e.dz += dz * k;
  }
  // (vanilla GUST_EMITTER_LARGE for a blast of 2 or more that touches blocks)
  for (let i = 0; i < 7; i++) level.particles.spawn?.('gust', x + (level.random.nextFloat() - level.random.nextFloat()) * radius, y + (level.random.nextFloat() - level.random.nextFloat()) * radius, z + (level.random.nextFloat() - level.random.nextFloat()) * radius, 0, 0, 0);
  level.sound.play('entity.breeze.wind_burst', x, y, z, 4, (1 + (level.random.nextFloat() - level.random.nextFloat()) * 0.2) * 0.7);
}
