// Player melee attack (vanilla Player.attack): cooldown-scaled damage,
// critical hits, sprint knockback, sword sweeps, sounds, particles, durability.

import type { Level } from './level';
import type { Player } from '../entity/player';
import type { Entity } from '../entity/entity';
import { LivingEntity } from '../entity/living';

const RAD = Math.PI / 180;

export function playerAttack(level: Level, p: Player, target: Entity, damageHeld: (n: number) => void): void {
  if (p.gameMode === 'spectator') return;
  const held = p.inventory.selectedItem;
  let f = held ? held.item.attackDamage : 1;
  const f2 = p.attackStrengthScale(0.5);
  f *= 0.2 + f2 * f2 * 0.8;
  p.resetAttackStrength();
  if (f <= 0) return;
  const full = f2 > 0.9;
  let sprintKnock = false;
  if (p.sprinting && full) {
    level.sound.play('entity.player.attack.knockback', p.x, p.y, p.z, 1, 1);
    sprintKnock = true;
  }
  const crit = full && p.fallDistance > 0 && !p.onGround && !p.onClimbable() && !p.inWater && target instanceof LivingEntity && !p.sprinting;
  if (crit) f *= 1.5;
  let sweep = false;
  if (full && !crit && !sprintKnock && p.onGround) {
    const d0 = (p.x - p.xo) ** 2 + (p.z - p.zo) ** 2;
    const d1 = p.movementSpeed() * 2.5;
    if (d0 < d1 * d1 && held?.item.tool?.type === 'sword') sweep = true;
  }
  const healthBefore = target instanceof LivingEntity ? target.health : 0;
  const ok = target.hurt(f, 'player', p);
  if (!ok) {
    level.sound.play('entity.player.attack.nodamage', p.x, p.y, p.z, 1, 1);
    return;
  }
  const kb = sprintKnock ? 1 : 0;
  if (kb > 0) {
    if (target instanceof LivingEntity) target.knockback(kb * 0.5, Math.sin(p.yaw * RAD), -Math.cos(p.yaw * RAD));
    else target.push(-Math.sin(p.yaw * RAD) * kb * 0.5, 0.1, Math.cos(p.yaw * RAD) * kb * 0.5);
    p.dx *= 0.6;
    p.dz *= 0.6;
    p.sprinting = false;
  }
  if (sweep) {
    const f7 = 1;
    for (const e of level.getEntities(target.bb.inflate(1, 0.25, 1), (e) => e instanceof LivingEntity && e.isPickable(), p)) {
      if (e === target || p.distanceToSqr(e.x, e.y, e.z) >= 9) continue;
      (e as LivingEntity).knockback(0.4, Math.sin(p.yaw * RAD), -Math.cos(p.yaw * RAD));
      e.hurt(f7 * f2, 'player', p);
    }
    level.sound.play('entity.player.attack.sweep', p.x, p.y, p.z, 1, 1);
    // vanilla Player.sweepAttack
    const d0 = -Math.sin(p.yaw * RAD), d1 = Math.cos(p.yaw * RAD);
    level.particles.spawn?.('sweep_attack', p.x + d0, p.y + p.height * 0.5, p.z + d1, d0, 0, 0);
  }
  if (crit) {
    level.sound.play('entity.player.attack.crit', p.x, p.y, p.z, 1, 1);
    level.particles.emitAround?.('crit', target);
  }
  if (!crit && !sweep) level.sound.play(full ? 'entity.player.attack.strong' : 'entity.player.attack.weak', p.x, p.y, p.z, 1, 1);
  if (target instanceof LivingEntity) {
    p.lastHurtMob = target;
    const dealt = healthBefore - target.health;
    if (dealt > 2) {
      const k = Math.floor(dealt * 0.5);
      for (let i = 0; i < k; i++) {
        const g = () => {
          let u = 0;
          while (u === 0) u = Math.random();
          return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
        };
        level.particles.spawn?.('damage_indicator', target.x + g() * 0.1, target.y + target.height * 0.5, target.z + g() * 0.1, g() * 0.2, g() * 0.2, g() * 0.2);
      }
    }
  }
  // tool durability (vanilla Item.hurtEnemy, living targets only: swords 1, other tools 2)
  if (held?.item.tool && p.gameMode !== 'creative' && target instanceof LivingEntity) damageHeld(held.item.tool.type === 'sword' ? 1 : 2);
  p.food.addExhaustion(0.1);
}
