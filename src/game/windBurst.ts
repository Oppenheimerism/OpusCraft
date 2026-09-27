// (trial chambers) A wind charge's burst (vanilla Level.explode with AbstractWindCharge's damage calculator and
// Explosion.BlockInteraction.TRIGGER_BLOCK, 1.21), and what it leaves with a player caught in it (vanilla Player's
// current impulse).
//
// The burst hurts nothing and breaks nothing. It pushes everything within twice its radius away from where it went off,
// the harder the nearer and the more of it in the open, by the charge's knockback (a player's wind charge a fifth again
// as hard; blast protection resists it). Its rays run out through the blocks as an explosion's do, slowed by their
// blast resistance, and each block one reaches is set off: a door (not an iron one), trapdoor or fence gate that
// redstone isn't holding swings open or shut, a button is pressed, a lever pulled and a bell rung. A breeze's sets blocks
// off only while mobs may grief. It ends in a gust (a big one for a burst 2 or more across) and its sound.
//
// A player caught in one remembers where they were (vanilla currentImpulseImpactPos) and what went off. If it was a
// wind charge (a player's, a dispenser's or an ominous trial spawner's, never a breeze's), falling back hurts them only
// for the height they fall below that point; the mace's smash attack sets that too (game/mace.ts). They forget it on
// the ground, in a liquid, on a ladder or as a spectator, once two seconds have passed. As they start to fall, a
// burst that threw them up is told to whoever listens (vanilla CriteriaTriggers.FALL_AFTER_EXPLOSION).

import type { Level } from './level';
import { Entity, FALL_HOOKS } from '../entity/entity';
import { LivingEntity } from '../entity/living';
import type { Player } from '../entity/player';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_WATER, F_LAVA } from '../world/block';
import { MIN_Y, MAX_Y } from '../world/constants';
import { AABB } from '../core/aabb';
import { seenPercent } from './explosion';
import { explosionKnockbackResistance } from '../item/enchantHelper';
import { behaviorOf, type UseContext } from './blockBehavior';
import { openSound } from './redstone/components';
import { bellRinger } from './villageBlocks';

/** how a burst goes */
export interface WindBurstOptions {
  /** vanilla ExplosionDamageCalculator.getKnockbackMultiplier: 1.22 for a player's wind charge, 1 for a breeze's */
  knockback: number;
  /** vanilla explosionSound: the burst's */
  sound: string;
}

/** vanilla #blocks_wind_charge_explosions: what no burst gets through (SimpleExplosionDamageCalculator's immune blocks) */
const IMMUNE = new Set(['barrier', 'bedrock']);

/** vanilla Explosion.canTriggerBlocks: a breeze's wind charge sets blocks off only while mobs may grief */
function canTriggerBlocks(level: Level, source: Entity | null): boolean {
  return source?.type === 'breeze_wind_charge' ? !!level.gameRules.mobGriefing : true;
}

/**
 * vanilla Level.explode(source, null, the wind charge's calculator, x, y, z, radius, false, TRIGGER, GUST_EMITTER_SMALL,
 * GUST_EMITTER_LARGE, sound): the push, the blocks set off, the gust and the sound. `source` is left out of the push
 * (the charge itself; none for the mace's wind burst, which throws its wielder up)
 */
export function windBurstAt(level: Level, source: Entity | null, x: number, y: number, z: number, radius: number, o: WindBurstOptions): void {
  const w = level.world;
  const rand = level.random;
  // 1) the blocks its rays reach: 16x16x16 of them from the surface of a cube, as Explosion.explode's
  const toTrigger = new Map<string, [number, number, number]>();
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
            let res = IMMUNE.has(b.name) ? 3600000 : b.resistance;
            if (fl & (F_WATER | F_LAVA)) res = Math.max(res, 100);
            f -= (res + 0.3) * 0.3;
            if (f > 0) toTrigger.set(bx + ',' + by + ',' + bz, [bx, by, bz]);
          }
          px += d0 * 0.3;
          py += d1 * 0.3;
          pz += d2 * 0.3;
        }
      }
  // 2) the push: everything within twice the radius but the charge itself
  const f2 = radius * 2;
  const box = new AABB(Math.floor(x - f2 - 1), Math.floor(y - f2 - 1), Math.floor(z - f2 - 1), Math.floor(x + f2 + 1), Math.floor(y + f2 + 1), Math.floor(z + f2 + 1));
  for (const e of level.getEntities(box, undefined, source)) {
    const dist = Math.sqrt(e.distanceToSqr(x, y, z)) / f2;
    if (dist > 1) continue;
    let dx = e.x - x;
    let dy = (e.type === 'tnt' ? e.y : e.y + e.eyeHeight) - y;
    let dz = e.z - z;
    const d10 = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d10 === 0) continue;
    let k = (1 - dist) * seenPercent(level, x, y, z, e) * o.knockback;
    if (e instanceof LivingEntity) k *= 1 - explosionKnockbackResistance(e);
    // (vanilla: the server pushes a player flying in creative too, but only the knockback it sends reaches the player,
    // and none is sent to them or to a spectator)
    const p = e as { gameMode?: string; flying?: boolean };
    if (!(p.gameMode === 'spectator' || (p.gameMode === 'creative' && p.flying))) {
      e.dx += (dx /= d10) * k;
      e.dy += (dy /= d10) * k;
      e.dz += (dz /= d10) * k;
      e.hurtMarked = true;
    }
    // vanilla Entity.onExplosionHit (ServerPlayer's: the impulse)
    if (e.type === 'player') onExplosionHit(e as Player, source);
  }
  // 3) the gust and the sound (vanilla Explosion.finalizeExplosion: the large emitter for a burst of 2 or more that sets
  // blocks off, which every wind charge's may)
  gust(level, x, y, z, radius >= 2);
  level.sound.play(o.sound, x, y, z, 4, (1 + (rand.nextFloat() - rand.nextFloat()) * 0.2) * 0.7);
  // 4) the blocks set off, shuffled (vanilla Util.shuffle of toBlow)
  if (!canTriggerBlocks(level, source)) return;
  const list = [...toTrigger.values()];
  for (let i = list.length - 1; i > 0; i--) {
    const j = rand.nextInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  for (const [bx, by, bz] of list) triggerBlock(level, bx, by, bz);
}

/**
 * vanilla GustSeedParticle: GUST_EMITTER_LARGE (three gusts a tick for 8 ticks, within 3 blocks) or GUST_EMITTER_SMALL
 * (three gusts every third tick for 4 ticks, within 1), put out at once
 */
function gust(level: Level, x: number, y: number, z: number, large: boolean): void {
  const r = level.random;
  const scale = large ? 3 : 1, count = large ? 24 : 6;
  for (let i = 0; i < count; i++)
    level.particles.spawn?.('gust', x + (r.nextDouble() - r.nextDouble()) * scale, y + (r.nextDouble() - r.nextDouble()) * scale, z + (r.nextDouble() - r.nextDouble()) * scale, 0, 0, 0);
}

/** (the switch's own use: a lever's and a button's ask nothing of whoever used them) */
const NO_USER = null as unknown as UseContext;

/** vanilla Block.onExplosionHit with Explosion.canTriggerBlocks: what a burst's ray does to the block it reaches */
export function triggerBlock(level: Level, x: number, y: number, z: number): void {
  const st = level.getState(x, y, z);
  const b = BLOCKS[STATE_BLOCK[st]];
  const n = b.name;
  const toggle = (flags: boolean | number): void => {
    const ns = b.with(st, 'open', !b.get(st, 'open'));
    level.setBlock(x, y, z, ns, flags);
    level.sound.play(openSound(n, b.get(ns, 'open') as boolean), x + 0.5, y + 0.5, z + 0.5, 1, level.random.nextFloat() * 0.1 + 0.9);
  };
  // vanilla DoorBlock.onExplosionHit: its lower half, a door wind can open (BlockSetType.canOpenByWindCharge: not
  // iron) that redstone isn't holding (setOpen: flags 10, and the upper half follows its shape)
  if (n.endsWith('_door')) {
    if (!n.startsWith('iron_') && b.get(st, 'half') === 'lower' && !b.get(st, 'powered')) toggle(2);
  }
  // vanilla TrapDoorBlock.onExplosionHit / toggle (flags 2)
  else if (n.endsWith('_trapdoor')) {
    if (!n.startsWith('iron_') && !b.get(st, 'powered')) toggle(2);
  }
  // vanilla FenceGateBlock.onExplosionHit (setBlockAndUpdate)
  else if (n.endsWith('_fence_gate')) {
    if (!b.get(st, 'powered')) toggle(true);
  }
  // vanilla ButtonBlock.onExplosionHit (press, if it isn't pressed) and LeverBlock.onExplosionHit (pull)
  else if (n === 'lever' || n.endsWith('_button')) behaviorOf(st)?.use?.(level, x, y, z, st, NO_USER);
  // vanilla BellBlock.onExplosionHit: attemptToRing with no direction (it swings from its facing)
  else if (n === 'bell') bellRinger.ring(level, x, y, z, null);
}

// ---------------------------------------------------------------------------------------------------------------
// A player's current impulse (vanilla Player.currentImpulseImpactPos, currentExplosionCause,
// ignoreFallDamageFromCurrentImpulse and currentImpulseContextResetGraceTime; ServerPlayer.startingToFallPosition)

/** what a player remembers of the last burst (or smash attack) that sent them flying */
export interface Impulse {
  /** where they were when it went off (null: none) */
  impactPos: [number, number, number] | null;
  /** what went off */
  cause: Entity | null;
  /** a fall back counts only below impactPos */
  ignoreFall: boolean;
  /** ticks before landing may forget it */
  grace: number;
  /** where they last began to fall (vanilla ServerPlayer.startingToFallPosition) */
  fallStart: [number, number, number] | null;
  /** their next landing kicks up the ground (vanilla ServerPlayer.spawnExtraParticlesOnFall: a mace's smash sets it) */
  extraParticlesOnFall: boolean;
}

const IMPULSES = new WeakMap<Player, Impulse>();

/** a player's impulse (made on first asking) */
export function impulseOf(p: Player): Impulse {
  let c = IMPULSES.get(p);
  if (!c) IMPULSES.set(p, (c = { impactPos: null, cause: null, ignoreFall: false, grace: 0, fallStart: null, extraParticlesOnFall: false }));
  return c;
}

/**
 * (M5) vanilla CriteriaTriggers.FALL_AFTER_EXPLOSION: the player's advancements hear how far above where the burst
 * threw them they began to fall (DistancePredicate.vertical), and what went off (Who Needs Rockets?)
 */
export function fallAfterExplosionTrigger(p: Player, start: [number, number, number], now: [number, number, number], cause: Entity | null): void {
  p.level.onPlayerTrigger?.(p, 'fall_after_explosion', { fallAfterExplosion: { rise: Math.abs(now[1] - start[1]), cause: cause?.type ?? null } });
}

/**
 * whoever listens for a player starting to fall after a burst threw them up (vanilla FallAfterExplosionTrigger: where
 * it went off, where they are, and what it was)
 */
export const impulseHooks: { fallAfterExplosion: ((p: Player, start: [number, number, number], now: [number, number, number], cause: Entity | null) => void) | null } = {
  fallAfterExplosion: fallAfterExplosionTrigger,
};

/** vanilla Player.setIgnoreFallDamageFromCurrentImpulse: two seconds' grace while it's on */
export function setIgnoreFallFromImpulse(c: Impulse, on: boolean): void {
  c.ignoreFall = on;
  c.grace = on ? 40 : 0;
}

/** vanilla Player.resetCurrentImpulseContext */
export function resetImpulse(c: Impulse): void {
  c.grace = 0;
  c.cause = null;
  c.impactPos = null;
  c.ignoreFall = false;
}

/** vanilla Player.tryResetCurrentImpulseContext: once the grace is over */
function tryResetImpulse(c: Impulse): void {
  if (c.grace === 0) resetImpulse(c);
}

/** vanilla ServerPlayer.onExplosionHit: where they were, what went off, and whether a fall back is forgiven (a wind charge's) */
export function onExplosionHit(p: Player, cause: Entity | null): void {
  const c = impulseOf(p);
  c.impactPos = [p.x, p.y, p.z];
  c.cause = cause;
  setIgnoreFallFromImpulse(c, cause?.type === 'wind_charge');
}

/**
 * vanilla Player.causeFallDamage: after a wind charge's burst, only the height fallen below where it went off (and
 * vanilla ServerPlayer.checkFallDamage: the first landing after a mace's smash on something standing kicks up 50 specks
 * of the ground for each block fallen, up to 200, from the top of the block landed on)
 */
FALL_HOOKS.landing = (e, dist) => {
  if (e.type !== 'player') return dist;
  const c = IMPULSES.get(e as Player);
  if (c?.extraParticlesOnFall) {
    c.extraParticlesOnFall = false;
    const bx = Math.floor(e.x), by = Math.floor(e.y - 0.2), bz = Math.floor(e.z);
    const st = e.level.world.getState(bx, by, bz);
    const g = () => Math.sqrt(-2 * Math.log(1 - e.level.random.nextDouble())) * Math.cos(2 * Math.PI * e.level.random.nextDouble());
    for (let i = Math.min(200, Math.floor(50 * dist)); i > 0; i--)
      e.level.particles.blockParticle?.(bx + 0.5 + g() * 0.3, by + 1 + g() * 0.3, bz + 0.5 + g() * 0.3, g() * 0.15, g() * 0.15, g() * 0.15, st, bx, by, bz);
  }
  if (!c?.impactPos || !c.ignoreFall) return dist;
  const f = Math.min(dist, c.impactPos[1] - e.y);
  if (f <= 0) resetImpulse(c);
  else tryResetImpulse(c);
  return Math.max(0, f);
};

/**
 * each move of a player's: vanilla ServerPlayer.trackStartFallingPosition (and resetFallDistance forgetting it), the
 * move packet's tryResetCurrentImpulseContext (on the ground, landed in a liquid, climbing, a spectator) and
 * Player.tick's grace running down
 */
FALL_HOOKS.moved = (e, onGround) => {
  if (e.type !== 'player') return;
  const p = e as Player;
  const c = impulseOf(p);
  if (p.fallDistance > 0) {
    if (!c.fallStart) {
      c.fallStart = [p.x, p.y, p.z];
      if (c.impactPos && c.impactPos[1] <= p.y) impulseHooks.fallAfterExplosion?.(p, c.impactPos, c.fallStart, c.cause);
    }
  } else c.fallStart = null;
  const inLiquid = p.inWater || p.inLava;
  if (onGround || (inLiquid && p.dy < 1e-5) || p.onClimbable() || p.gameMode === 'spectator') tryResetImpulse(c);
  if (c.grace > 0) c.grace--;
};
