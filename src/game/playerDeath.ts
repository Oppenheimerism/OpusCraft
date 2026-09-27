// A player's death and coming back (vanilla ServerPlayer.die and PlayerList.respawn, less where they go): the words
// everyone reads, what's dropped, and the fresh start. The game's own player's and a host's guests' alike.

import type { Level, SoundSink } from './level';
import type { LivingEntity } from '../entity/living';
import type { Player } from '../entity/player';
import type { ItemStack } from '../item/item';
import { ItemEntity } from '../entity/itemEntity';
import { hasVanishing } from '../item/enchantHelper';
import { entityDisplayName } from './spawner';

/** vanilla CombatTracker.getDeathMessage: how `victim`, called `n`, died of `source` (a player's, or a tame animal's for its owner) */
export function deathMessage(source: string, victim: LivingEntity, n: string): string {
  const k = victim.killer;
  const kn = k ? entityDisplayName(k) : '';
  switch (source) {
    case 'mob':
    // (M8: goats) vanilla mob_attack_no_aggro's message is mob's: a goat's ram
    case 'mobAttackNoAggro':
    // (vanilla mob_projectile's message is mob's: a shulker's bullet)
    case 'mobProjectile':
    // (trial chambers) and wind_charge's: whoever sent it, else the charge itself
    case 'windCharge':
      return `${n} was slain by ${kn}`;
    case 'player':
      return `${n} was slain by ${kn}`;
    // (trial chambers) vanilla death.attack.mace_smash
    case 'maceSmash':
      return `${n} was smashed by ${kn}`;
    case 'arrow':
      return k && k !== victim && k.type !== 'arrow' ? `${n} was shot by ${kn}` : `${n} was shot by Arrow`;
    case 'trident':
      return k && k !== victim && k.type !== 'trident' ? `${n} was impaled by ${kn}` : `${n} was impaled by Trident`;
    case 'explosion':
      return `${n} blew up`;
    case 'badRespawnPoint':
      return `${n} was killed by [Intentional Game Design]`;
    case 'playerExplosion':
      return k === victim || !k ? `${n} blew up` : `${n} was blown up by ${kn}`;
    case 'fall':
      return `${n} fell from a high place`;
    // (powder snow) vanilla death.attack.freeze (and .player, killed fleeing someone)
    case 'freeze':
      return k && k !== victim ? `${n} was frozen to death by ${kn}` : `${n} froze to death`;
    // (Stage 4: the outer End) an elytra into a wall
    case 'flyIntoWall':
      return `${n} experienced kinetic energy`;
    // (fireworks: vanilla death.attack.fireworks, the rocket being the direct cause)
    case 'fireworks':
      return `${n} went off with a bang`;
    case 'drown':
      return `${n} drowned`;
    case 'starve':
      return `${n} starved to death`;
    case 'void':
      return `${n} fell out of the world`;
    case 'lava':
      return `${n} tried to swim in lava`;
    case 'inFire':
    case 'campfire':
      return `${n} went up in flames`;
    case 'onFire':
      return `${n} burned to death`;
    // (Frost Walker) a magma block's hot floor
    case 'hotFloor':
      return `${n} discovered the floor was lava`;
    case 'lightningBolt':
      return `${n} was struck by lightning`;
    case 'inWall':
      return `${n} suffocated in a wall`;
    case 'cactus':
      return `${n} was pricked to death`;
    case 'sweetBerryBush':
      return `${n} was poked to death by a sweet berry bush`;
    case 'genericKill':
      return `${n} was killed`;
    case 'magic':
      return `${n} was killed by magic`;
    case 'indirectMagic':
      // (vanilla death.attack.indirectMagic: whoever's cloud or potion it was, else the cloud or potion itself)
      return k ? `${n} was killed by ${kn} using magic` : `${n} was killed by magic`;
    case 'wither':
      return `${n} withered away`;
    case 'stalagmite':
      return `${n} was impaled on a stalagmite`;
    case 'fallingStalactite':
      return `${n} was skewered by a falling stalactite`;
    case 'anvil':
      return `${n} was squashed by a falling anvil`;
    case 'fallingBlock':
      return `${n} was squashed by a falling block`;
    case 'thorns':
      return `${n} was killed while trying to hurt ${kn}`;
    // (M4: the warden) vanilla death.attack.sonic_boom
    case 'sonicBoom':
      return `${n} was obliterated by a sonically-charged shriek`;
    default:
      return `${n} died`;
  }
}

/** vanilla Player.dropEquipment: curse of vanishing items are destroyed, then Inventory.dropAll flings every stack */
export function dropAllItems(level: Level, p: Player): void {
  const inv = p.inventory;
  const drop = (s: ItemStack | null) => {
    if (!s || hasVanishing(s)) return;
    const e = new ItemEntity(level, s);
    e.moveTo(p.x, p.y + p.eyeHeight - 0.3, p.z);
    e.pickupDelay = 40;
    const f = Math.random() * 0.5, a = Math.random() * Math.PI * 2;
    e.dx = -Math.sin(a) * f;
    e.dy = 0.2;
    e.dz = Math.cos(a) * f;
    level.addEntity(e);
  };
  for (let i = 0; i < inv.main.length; i++) {
    drop(inv.main[i]);
    inv.main[i] = null;
  }
  for (let i = 0; i < inv.armor.length; i++) {
    drop(inv.armor[i]);
    inv.armor[i] = null;
  }
  drop(inv.offhand);
  inv.offhand = null;
  inv.version++;
}

/** vanilla ServerPlayer.die's drops: unless keepInventory, everything carried and some of the experience */
export function dropDeathLoot(level: Level, p: Player): void {
  if (level.gameRules.keepInventory) return;
  dropAllItems(level, p);
  // vanilla LivingEntity.dropExperience: a player always drops some (Player.getBaseExperienceReward: 7 a level, at
  // most 100), unless a sculk catalyst took it
  if (!p.skipDropExperience && p.gameMode !== 'spectator') level.awardExperience?.(p.x, p.y, p.z, Math.min(100, p.xpLevel * 7));
  p.xpLevel = 0;
  p.xpProgress = 0;
}

/**
 * vanilla PlayerList.respawn's fresh player (ServerPlayer.restoreFrom): full health and food, nothing burning, no
 * effects, no sleep, no portal; the experience gone unless `keepInventory` (or spectating) keeps it
 */
export function resetForRespawn(p: Player, keepInventory: boolean): void {
  // vanilla respawns a fresh player: no effects carry over
  p.removeAllEffects();
  p.health = p.maxHealth;
  p.deathTime = 0;
  p.hurtTime = 0;
  p.dead = false;
  p.killer = null;
  p.lastHurtByMob = null;
  p.remainingFireTicks = 0;
  p.stopUsingItem();
  p.food.level = 20;
  p.food.saturation = 5;
  p.food.exhaustion = 0;
  p.air = 300;
  p.fallDistance = 0;
  p.removed = false;
  // vanilla ServerPlayer.restoreFrom: keepInventory (or spectating) keeps the levels and the score as well
  if (!keepInventory && p.gameMode !== 'spectator') {
    p.xpLevel = 0;
    p.xpProgress = 0;
    p.xpTotal = 0;
  }
  p.sleepingPos = null;
  p.sleepCounter = 0;
  p.setSize(0.6, 1.8);
  p.portal = null;
  p.portalCooldown = 0;
  p.spinningEffectIntensity = p.oSpinningEffectIntensity = 0;
}

/**
 * vanilla Player.getHurtSound: a player hurt by `source` (fire's, drowning's, freezing's and a berry bush's own), none
 * for a landing's, whose fall sound says it (playerFallSound)
 */
export function playerHurtSound(sound: SoundSink, p: Player, source: string): void {
  if (source === 'fall' || source === 'stalagmite') return;
  const name = source === 'onFire' || source === 'inFire' || source === 'campfire' || source === 'lava' || source === 'hotFloor' ? 'entity.player.hurt_on_fire' : source === 'drown' ? 'entity.player.hurt_drown' : source === 'freeze' ? 'entity.player.hurt_freeze' : source === 'sweetBerryBush' ? 'entity.player.hurt_sweet_berry_bush' : 'entity.player.hurt';
  sound.play(name, p.x, p.y, p.z, 1, (Math.random() - Math.random()) * 0.2 + 1);
}

/** vanilla LivingEntity.playBlockFallSound and getFallDamageSound: a landing from `dist` blocks that hurt */
export function playerFallSound(sound: SoundSink, p: Player, dist: number): void {
  sound.play(dist > 4 + 3 ? 'entity.player.big_fall' : 'entity.player.small_fall', p.x, p.y, p.z, 1, 1);
  sound.play('entity.player.hurt', p.x, p.y, p.z, 1, (Math.random() - Math.random()) * 0.2 + 1);
}
