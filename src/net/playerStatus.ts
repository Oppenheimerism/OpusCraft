// A guest's own player as the host has it (vanilla ClientboundSetHealthPacket, the player's own SynchedEntityData and
// ClientboundUpdateMobEffectPacket / RemoveMobEffectPacket): built on the host from the guest's player, and put into
// the guest's own, checked (it came from another game). The guest counts the same things down between packets as
// the host does (air, a hurt's flash, an effect's time), so what goes is what changed.

import type { Value } from './codec';
import type { Player } from '../entity/player';
import { MobEffectInstance, mobEffect, INFINITE_DURATION } from '../entity/effects';
import { wrapDegrees } from '../core/math';

const num = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo);
const int = (v: number, lo: number, hi: number): number => Math.round(num(v, lo, hi));

/**
 * a guest's own player's fire, as its game keeps it while the host says it burns (its own count of the ticks left
 * would run out between packets): put out when the host says it's out
 */
const BURNING = 0x7fff;

/** CB.PlayerStatus's fields for `p` (its death's count stops at the 20 ticks the fall to the ground takes) */
export function playerStatus(p: Player): Value[] {
  return [
    num(p.health, 0, 4096),
    num(p.baseMaxHealth, 1, 4096),
    num(p.absorption, 0, 4096),
    int(p.food.level, 0, 20),
    num(p.food.saturation, 0, 20),
    int(p.air, -20, 4096),
    p.remainingFireTicks > 0,
    int(p.ticksFrozen, 0, 0x7fffffff),
    int(p.hurtTime, 0, 1000),
    wrapDegrees(num(p.hurtDir, -1e7, 1e7)),
    int(Math.min(p.deathTime, 20), 0, 20),
    int(p.invulnerableTime, 0, 1000),
  ];
}

/** (the guest) CB.PlayerStatus into its own player */
export function applyPlayerStatus(p: Player, f: Value[]): void {
  const [health, maxHealth, absorption, food, saturation, air, onFire, frozen, hurtTime, hurtDir, deathTime, invulnerable] = f as [number, number, number, number, number, number, boolean, number, number, number, number, number];
  p.maxHealth = maxHealth;
  p.health = health;
  p.absorption = absorption;
  p.food.level = food;
  p.food.saturation = saturation;
  p.air = air;
  if (onFire) p.remainingFireTicks = Math.max(p.remainingFireTicks, BURNING);
  else if (p.remainingFireTicks > 0) p.remainingFireTicks = 0;
  p.ticksFrozen = frozen;
  p.hurtTime = hurtTime;
  p.hurtDir = hurtDir;
  p.deathTime = deathTime;
  p.invulnerableTime = invulnerable;
}

/** CB.UpdateEffects's list: `p`'s effects, [id, amplifier, ticks left (-1 for ever), ambient, swirls, icon] each */
export function effectList(p: Player): Value[] {
  const out: Value[] = [];
  for (const inst of p.activeEffects.values()) {
    if (out.length >= 64) break;
    out.push([inst.id, inst.amplifier, inst.isInfinite() ? INFINITE_DURATION : int(inst.duration, 0, 0x7fffffff), inst.ambient, inst.visible, inst.showIcon]);
  }
  return out;
}

/**
 * (the host) whether `p`'s effects are other than a guest was last sent (`sent`, as it was at tick `at`) and has
 * counted down since: one come or gone, a level or a look changed, or a time that doesn't match the count (drunk
 * again, or a weaker one taking over as a stronger ran out)
 */
export function effectsChanged(p: Player, sent: Map<string, [number, number, number, string]>, now: number): boolean {
  if (sent.size !== p.activeEffects.size) return true;
  for (const inst of p.activeEffects.values()) {
    const s = sent.get(inst.id);
    if (!s || s[0] !== inst.amplifier || s[3] !== effectLook(inst)) return true;
    const [, dur, at] = s;
    if (inst.isInfinite() !== (dur === INFINITE_DURATION)) return true;
    if (!inst.isInfinite() && Math.abs(inst.duration - Math.max(0, dur - (now - at))) > 1) return true;
  }
  return false;
}

/** (the host) what a guest was sent of `p`'s effects, at tick `now` */
export function effectsSent(p: Player, now: number): Map<string, [number, number, number, string]> {
  const m = new Map<string, [number, number, number, string]>();
  for (const inst of p.activeEffects.values()) m.set(inst.id, [inst.amplifier, inst.isInfinite() ? INFINITE_DURATION : inst.duration, now, effectLook(inst)]);
  return m;
}

function effectLook(inst: MobEffectInstance): string {
  return `${inst.ambient ? 1 : 0}${inst.visible ? 1 : 0}${inst.showIcon ? 1 : 0}`;
}

/**
 * (the guest) CB.UpdateEffects into its own player: each effect as the host says (one it had already keeps its fade,
 * darkness's say), the rest gone; false if the list isn't one a host would send (an effect that doesn't exist, or
 * one twice). None of what an effect does when given or taken (absorption's hearts) happens here: the host has done
 * it, and says so
 */
export function applyEffectList(p: Player, list: Value[]): boolean {
  const next = new Map<string, [number, number, boolean, boolean, boolean]>();
  for (const w of list) {
    const [id, amp, dur, ambient, visible, icon] = w as [string, number, number, boolean, boolean, boolean];
    const eff = mobEffect(id);
    if (!eff || next.has(eff.id)) return false;
    next.set(eff.id, [amp, dur, ambient, visible, icon]);
  }
  const fx = p.activeEffects;
  for (const id of [...fx.keys()]) if (!next.has(id)) fx.delete(id);
  for (const [id, [amp, dur, ambient, visible, icon]] of next) {
    const cur = fx.get(id);
    if (cur) {
      cur.amplifier = amp;
      cur.duration = dur;
      cur.ambient = ambient;
      cur.visible = visible;
      cur.showIcon = icon;
      cur.hiddenEffect = null;
    } else fx.set(id, new MobEffectInstance(mobEffect(id)!, dur, amp, ambient, visible, icon));
  }
  p.markEffectsChanged();
  return true;
}
