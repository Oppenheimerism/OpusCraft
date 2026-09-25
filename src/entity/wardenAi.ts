// The warden's brain (vanilla WardenAi, the behaviours of ai/behavior/warden — Emerging, Digging, ForceUnmount,
// Roar, SetRoarTarget, SetWardenLookTarget, Sniffing, SonicBoom, TryToSniff — and WardenEntitySensor, 1.21). Its
// activities, the first of which may run: emerging from the ground; digging back down once it's been a minute
// undisturbed; roaring at whoever it's grown angry enough at; fighting them; making for a disturbance it heard;
// sniffing the air for whatever's near; and, with nothing else to do, wandering. The memories it keeps (vanilla
// MemoryModuleType) are fields on the warden, the ones that run out in its Memories.

import type { Warden } from './warden';
import { LivingEntity } from './living';
import { Behavior, Brain, doNothing, oneShot, runOne, type BehaviorControl } from './ai/brain';
import { at, isEntityTargetable, lookAtTargetSink, moveToTargetSink, randomStroll, swim, type Pos, type Tracker } from './ai/brainBehaviors';

export type WardenActivity = 'core' | 'emerge' | 'dig' | 'roar' | 'fight' | 'investigate' | 'sniff' | 'idle';

/** vanilla MemoryModuleType, those of the warden's that are a flag, a place or a cooldown */
export type WardenMemory =
  | 'dig_cooldown' | 'is_emerging' | 'is_sniffing' | 'sniff_cooldown' | 'disturbance_location' | 'vibration_cooldown' | 'recent_projectile'
  | 'touch_cooldown' | 'roar_sound_delay' | 'roar_sound_cooldown' | 'sonic_boom_cooldown' | 'sonic_boom_sound_delay' | 'sonic_boom_sound_cooldown'
  | 'attack_cooling_down';

/** vanilla WardenAi.DIGGING_DURATION, EMERGE_DURATION, ROAR_DURATION and SNIFFING_DURATION (the animations' lengths) */
export const DIGGING_DURATION = 100;
export const EMERGE_DURATION = 134;
export const ROAR_DURATION = 84;
export const SNIFFING_DURATION = 84;
/** vanilla WardenAi.DIGGING_COOLDOWN: a minute undisturbed, and it digs away */
export const DIGGING_COOLDOWN = 1200;
/** vanilla WardenAi.DISTURBANCE_LOCATION_EXPIRY_TIME */
const DISTURBANCE_LOCATION_EXPIRY = 100;
/** vanilla WardenAi.SPEED_MULTIPLIER_WHEN_IDLING, _INVESTIGATING and _FIGHTING */
const SPEED_IDLING = 0.5;
const SPEED_INVESTIGATING = 0.7;
const SPEED_FIGHTING = 1.2;
/** vanilla WardenAi.MELEE_ATTACK_COOLDOWN */
const MELEE_ATTACK_COOLDOWN = 18;
/** vanilla Roar.TICKS_BEFORE_PLAYING_ROAR_SOUND and ROAR_ANGER_INCREASE */
const TICKS_BEFORE_ROAR_SOUND = 25;
const ROAR_ANGER_INCREASE = 20;
/** vanilla SonicBoom: its reach (15 across, 20 up or down), push, cooldown, the charge before it and its length */
const SONIC_BOOM_DISTANCE_XZ = 15;
const SONIC_BOOM_DISTANCE_Y = 20;
const SONIC_BOOM_KNOCKBACK_VERTICAL = 0.5;
const SONIC_BOOM_KNOCKBACK_HORIZONTAL = 2.5;
export const SONIC_BOOM_COOLDOWN = 40;
const SONIC_BOOM_TICKS_BEFORE_SOUND = 34;
const SONIC_BOOM_DURATION = 60;
/** vanilla SonicBoom's damage (DamageSources.sonicBoom: #bypasses_armor, #bypasses_enchantments, scaled by difficulty) */
export const SONIC_BOOM_DAMAGE = 10;
/** vanilla Sniffing.ANGER_FROM_SNIFFING_MAX_DISTANCE_XZ and _Y */
const SNIFF_ANGER_XZ = 6;
const SNIFF_ANGER_Y = 20;
/** vanilla TryToSniff.SNIFF_COOLDOWN: 5 to 10 seconds */
const SNIFF_COOLDOWN: [number, number] = [100, 200];
/** vanilla WardenEntitySensor's reach: 24 blocks round (a box) */
const ENTITY_SENSOR_RADIUS = 24;
/** vanilla EntityAttachment.WARDEN_CHEST: where the sonic boom comes from */
export const WARDEN_CHEST_Y = 1.6;

/** vanilla Brain's memories with ExpirableValue: each a value and, when it runs out, the ticks it has left */
export class Memories<K extends string> {
  private readonly m = new Map<K, { v: unknown; ttl: number }>();

  has(k: K): boolean {
    return this.m.has(k);
  }
  get<T>(k: K): T | undefined {
    return this.m.get(k)?.v as T | undefined;
  }
  /** the ticks `k` has left (Infinity: for good), undefined without it */
  ttl(k: K): number | undefined {
    return this.m.get(k)?.ttl;
  }
  /** vanilla setMemory (for good) and setMemoryWithExpiry */
  set(k: K, v: unknown = true, ttl = Infinity): void {
    this.m.set(k, { v, ttl });
  }
  erase(k: K): void {
    this.m.delete(k);
  }
  /** vanilla Brain.forgetOutdatedMemories: one whose time is up is gone, the rest have a tick less */
  tick(): void {
    for (const [k, e] of this.m) {
      if (e.ttl <= 0) this.m.delete(k);
      else if (e.ttl !== Infinity) e.ttl--;
    }
  }
  /** vanilla Brain.serializeStart's memories: each with its value (a place's) and ticks left */
  save(): string {
    const out: Record<string, { value?: unknown; ttl?: number }> = {};
    for (const [k, e] of this.m) out[k] = { ...(e.v !== true ? { value: e.v } : {}), ...(e.ttl !== Infinity ? { ttl: e.ttl } : {}) };
    return JSON.stringify(out);
  }
  load(text: unknown, known: readonly K[]): void {
    if (typeof text !== 'string') return;
    try {
      const d = JSON.parse(text) as Record<string, { value?: unknown; ttl?: number }>;
      for (const k of known) {
        const e = d[k];
        if (e) this.set(k, e.value ?? true, typeof e.ttl === 'number' ? e.ttl : Infinity);
      }
    } catch {
      // (memories that can't be read are forgotten)
    }
  }
}

/** the memories vanilla keeps with a saved warden (those with a codec) */
export const SAVED_MEMORIES: readonly WardenMemory[] = [
  'dig_cooldown', 'is_emerging', 'is_sniffing', 'sniff_cooldown', 'disturbance_location', 'vibration_cooldown', 'recent_projectile', 'touch_cooldown',
  'roar_sound_delay', 'roar_sound_cooldown', 'sonic_boom_cooldown', 'sonic_boom_sound_delay', 'sonic_boom_sound_cooldown',
];

const blockOf = (e: { x: number; y: number; z: number }): Pos => [Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)];

/** vanilla Entity.closerThan(entity, horizontal, vertical) */
export function closerThanXZY(a: LivingEntity, b: LivingEntity, h: number, v: number): boolean {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return dx * dx + dz * dz < h * h && dy * dy < v * v;
}

/** vanilla WardenAi.setDigCooldown: another minute before it digs away (only while it's counting one down) */
export function setDigCooldown(w: Warden): void {
  if (w.mem.has('dig_cooldown')) w.mem.set('dig_cooldown', true, DIGGING_COOLDOWN);
}

/**
 * vanilla WardenAi.setDisturbanceLocation: unless it's angry at someone or fighting, it turns to where it was
 * disturbed and goes to have a look (for five seconds, unless disturbed again), sniffing no more for as long
 */
export function setDisturbanceLocation(w: Warden, p: Pos): void {
  if (w.getEntityAngryAt() || w.attackTarget) return;
  setDigCooldown(w);
  w.mem.set('sniff_cooldown', true, DISTURBANCE_LOCATION_EXPIRY);
  w.setLookTargetWithExpiry({ pos: p }, DISTURBANCE_LOCATION_EXPIRY);
  w.mem.set('disturbance_location', p, DISTURBANCE_LOCATION_EXPIRY);
  w.walkTarget = null;
}

/** vanilla SonicBoom.setCooldown */
export function setSonicBoomCooldown(w: Warden, ticks: number): void {
  w.mem.set('sonic_boom_cooldown', true, ticks);
}

// ---------------------------------------------------------------------------------------------------------------
// the sensor

/**
 * vanilla WardenEntitySensor (a NearestLivingEntitySensor 24 blocks round): the living things about, nearest first,
 * those of them it sees (within 16), and the nearest it may target, a player before anything else
 */
export function senseWardenEntities(w: Warden): void {
  const r = ENTITY_SENSOR_RADIUS;
  const near = w.level.getEntities(w.bb.inflate(r, r, r), (e) => e instanceof LivingEntity && e.isAlive, w) as LivingEntity[];
  near.sort((a, b) => a.distanceToSqr(w.x, w.y, w.z) - b.distanceToSqr(w.x, w.y, w.z));
  w.nearestLiving = near;
  w.visibleLiving = near.filter((e) => isEntityTargetable(w, e));
  w.nearestAttackable = near.find((e) => w.canTargetEntity(e) && e.type === 'player') ?? near.find((e) => w.canTargetEntity(e) && e.type !== 'player') ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// the behaviours, each made for one warden's brain

/** vanilla SetWardenLookTarget: not fighting, it looks where it means to roar, or where it was disturbed */
function setWardenLookTarget(): BehaviorControl<Warden> {
  return oneShot<Warden>((w) => {
    if (w.attackTarget) return false;
    const p = w.roarTarget ? blockOf(w.roarTarget) : (w.mem.get<Pos>('disturbance_location') ?? null);
    if (!p) return false;
    w.lookTarget = { pos: p };
    return true;
  });
}

/** vanilla Emerging(duration): coming up out of the ground (not while it's walking somewhere) */
function emerging(duration: number): BehaviorControl<Warden> {
  return new Behavior<Warden>({
    min: duration,
    max: duration,
    canStart: (w) => w.mem.has('is_emerging') && !w.walkTarget,
    start: (w) => {
      w.setPose('emerging');
      w.playSound('entity.warden.emerge', 5, 1);
    },
    canStillUse: () => true,
    stop: (w) => {
      if (w.pose === 'emerging') w.setPose('standing');
    },
  });
}

/** vanilla ForceUnmount: off whatever it rides */
function forceUnmount(): BehaviorControl<Warden> {
  return new Behavior<Warden>({
    canStart: (w) => w.vehicle !== null,
    start: (w) => w.stopRiding(),
  });
}

/**
 * vanilla Digging(duration): on the ground (or in water or lava), not fighting or walking, it digs down into it and
 * is gone; off the ground, it's gone at once, agitated
 */
function digging(duration: number): BehaviorControl<Warden> {
  return new Behavior<Warden>({
    min: duration,
    max: duration,
    canStart: (w) => !w.attackTarget && !w.walkTarget && (w.onGround || w.inWater || w.inLava),
    start: (w) => {
      if (w.onGround) {
        w.setPose('digging');
        w.playSound('entity.warden.dig', 5, 1);
      } else {
        w.playSound('entity.warden.agitated', 5, 1);
        if (!w.removed) w.remove();
      }
    },
    canStillUse: (w) => !w.removed,
    // (vanilla remove(DISCARDED): gone, nothing dropped)
    stop: (w) => {
      if (!w.removed) w.remove();
    },
  });
}

/** vanilla SetRoarTarget.create(Warden::getEntityAngryAt): angry enough at someone it may target, it means to roar at them */
function setRoarTarget(): BehaviorControl<Warden> {
  return oneShot<Warden>((w) => {
    if (w.roarTarget || w.attackTarget) return false;
    const t = w.getEntityAngryAt();
    if (!t || !w.canTargetEntity(t)) return false;
    w.roarTarget = t;
    w.cantReachWalkTargetSince = -1;
    return true;
  });
}

/** vanilla TryToSniff: something it may target within 24 blocks, and nothing disturbing it: it stops and sniffs */
function tryToSniff(): BehaviorControl<Warden> {
  return oneShot<Warden>((w) => {
    if (w.mem.has('sniff_cooldown') || !w.nearestAttackable || w.mem.has('disturbance_location')) return false;
    w.mem.set('is_sniffing');
    const r = w.level.random;
    w.mem.set('sniff_cooldown', true, SNIFF_COOLDOWN[0] + r.nextInt(SNIFF_COOLDOWN[1] - SNIFF_COOLDOWN[0] + 1));
    w.walkTarget = null;
    w.setPose('sniffing');
    return true;
  });
}

/**
 * vanilla Sniffing(duration): a long sniff of the air; after it, whoever's nearest that it may target angers it if
 * they're within 6 blocks across (and 20 up or down), and it goes to where they are
 */
function sniffing(duration: number): BehaviorControl<Warden> {
  return new Behavior<Warden>({
    min: duration,
    max: duration,
    canStart: (w) => w.mem.has('is_sniffing') && !w.attackTarget && !w.walkTarget,
    start: (w) => w.playSound('entity.warden.sniff', 5, 1),
    canStillUse: () => true,
    stop: (w) => {
      if (w.pose === 'sniffing') w.setPose('standing');
      w.mem.erase('is_sniffing');
      const t = w.nearestAttackable;
      if (!t || !w.canTargetEntity(t)) return;
      if (closerThanXZY(w, t, SNIFF_ANGER_XZ, SNIFF_ANGER_Y)) w.increaseAngerAt(t);
      if (!w.mem.has('disturbance_location')) setDisturbanceLocation(w, blockOf(t));
    },
  });
}

/** vanilla GoToTargetLocation.create(DISTURBANCE_LOCATION, 2, speed): to within a block or so of where it was disturbed */
function goToTargetLocation(closeEnough: number, speed: number): BehaviorControl<Warden> {
  return oneShot<Warden>((w) => {
    const p = w.mem.get<Pos>('disturbance_location');
    if (!p || w.attackTarget || w.walkTarget) return false;
    const [bx, by, bz] = blockOf(w);
    // (vanilla Vec3i.closerThan: from block to block)
    if ((p[0] - bx) ** 2 + (p[1] - by) ** 2 + (p[2] - bz) ** 2 >= closeEnough * closeEnough) {
      const r = w.level.random;
      const t: Pos = [p[0] + r.nextInt(3) - 1, p[1], p[2] + r.nextInt(3) - 1];
      // vanilla BehaviorUtils.setWalkAndLookTargetMemories
      w.lookTarget = { pos: t };
      w.walkTarget = { t: { pos: t }, speed, closeEnough };
    }
    return true;
  });
}

/**
 * vanilla Roar: it stands and roars at whoever made it angry (the roar a second and a quarter in), angrier still,
 * and once it's done goes after them
 */
function roar(): BehaviorControl<Warden> {
  return new Behavior<Warden>({
    min: ROAR_DURATION,
    max: ROAR_DURATION,
    canStart: (w) => w.roarTarget !== null && !w.attackTarget,
    start: (w) => {
      w.mem.set('roar_sound_delay', true, TICKS_BEFORE_ROAR_SOUND);
      w.walkTarget = null;
      const t = w.roarTarget!;
      // vanilla BehaviorUtils.lookAtEntity
      w.lookTarget = at(t, true);
      w.setPose('roaring');
      w.increaseAngerAt(t, ROAR_ANGER_INCREASE, false);
    },
    canStillUse: () => true,
    tick: (w) => {
      if (w.mem.has('roar_sound_delay') || w.mem.has('roar_sound_cooldown')) return;
      w.mem.set('roar_sound_cooldown', true, ROAR_DURATION - TICKS_BEFORE_ROAR_SOUND);
      w.playSound('entity.warden.roar', 3, 1);
    },
    stop: (w) => {
      if (w.pose === 'roaring') w.setPose('standing');
      if (w.roarTarget) w.setAttackTarget(w.roarTarget);
      w.roarTarget = null;
    },
  });
}

/** vanilla WardenAi.DIG_COOLDOWN_SETTER: fighting counts as being disturbed */
function digCooldownSetter(): BehaviorControl<Warden> {
  return oneShot<Warden>((w) => {
    setDigCooldown(w);
    return true;
  });
}

/**
 * vanilla StopAttackingIfTargetInvalid.create(not angry at them, or can't target them; WardenAi::onTargetInvalid):
 * a target it can no longer attack, or isn't angry at, is let go (and its anger at them forgotten if it can't
 * target them any more)
 */
function stopAttackingIfTargetInvalid(): BehaviorControl<Warden> {
  return oneShot<Warden>((w) => {
    const t = w.attackTarget;
    if (!t) return false;
    if (w.canAttack(t) && t.isAlive && t.level === w.level && w.angerLevel() === 'angry' && w.canTargetEntity(t)) return true;
    // vanilla WardenAi.onTargetInvalid
    if (!w.canTargetEntity(t)) w.clearAnger(t);
    setDigCooldown(w);
    w.attackTarget = null;
    return true;
  });
}

/** vanilla SetEntityLookTarget.create(its target, follow range): it keeps its eyes on its target while it sees them */
function setEntityLookTarget(): BehaviorControl<Warden> {
  return oneShot<Warden>((w) => {
    if (w.lookTarget) return false;
    const f = w.followRange * w.followRange;
    const t = w.visibleLiving.find((e) => e === w.attackTarget && e.distanceToSqr(w.x, w.y, w.z) <= f && !w.passengers.includes(e));
    if (!t) return false;
    w.lookTarget = at(t, true);
    return true;
  });
}

/** vanilla SetWalkTargetFromAttackTargetIfTargetOutOfReach.create(speed): after its target, unless it can hit them */
function setWalkTargetFromAttackTarget(speed: number): BehaviorControl<Warden> {
  return oneShot<Warden>((w) => {
    const t = w.attackTarget;
    if (!t) return false;
    if (w.visibleLiving.includes(t) && w.isWithinMeleeAttackRange(t)) w.walkTarget = null;
    else {
      w.lookTarget = at(t, true);
      w.walkTarget = { t: at(t, false), speed, closeEnough: 0 };
    }
    return true;
  });
}

/**
 * vanilla SonicBoom: when it hasn't hit its target in a while and they're within 15 blocks across (20 up or down),
 * it charges (its chest opening) and, 34 ticks on, looses a sonic boom at them: through anything between, rings
 * along the way, 10 damage that no armour, enchantment or shield stops, and a push away; two seconds before the next
 */
function sonicBoom(): BehaviorControl<Warden> {
  return new Behavior<Warden>({
    min: SONIC_BOOM_DURATION,
    max: SONIC_BOOM_DURATION,
    canStart: (w) => w.attackTarget !== null && !w.mem.has('sonic_boom_cooldown') && closerThanXZY(w, w.attackTarget, SONIC_BOOM_DISTANCE_XZ, SONIC_BOOM_DISTANCE_Y),
    start: (w) => {
      w.mem.set('attack_cooling_down', true, SONIC_BOOM_DURATION);
      w.mem.set('sonic_boom_sound_delay', true, SONIC_BOOM_TICKS_BEFORE_SOUND);
      // (vanilla entity event 62: its sonic boom animation)
      w.sonicBoomAnimStart = w.tickCount;
      w.playSound('entity.warden.sonic_charge', 3, 1);
    },
    canStillUse: () => true,
    tick: (w) => {
      const t = w.attackTarget;
      // (vanilla LookControl.setLookAt(position): its target's feet)
      if (t) w.lookControl.setLookAt(t.x, t.y, t.z);
      if (w.mem.has('sonic_boom_sound_delay') || w.mem.has('sonic_boom_sound_cooldown')) return;
      w.mem.set('sonic_boom_sound_cooldown', true, SONIC_BOOM_DURATION - SONIC_BOOM_TICKS_BEFORE_SOUND);
      if (!t || !w.canTargetEntity(t) || !closerThanXZY(w, t, SONIC_BOOM_DISTANCE_XZ, SONIC_BOOM_DISTANCE_Y)) return;
      const sx = w.x, sy = w.y + WARDEN_CHEST_Y, sz = w.z;
      const vx = t.x - sx, vy = t.y + t.eyeHeight - sy, vz = t.z - sz;
      const len = Math.sqrt(vx * vx + vy * vy + vz * vz);
      // (vanilla Vec3.normalize: too short a way is none at all)
      const nx = len < 1e-4 ? 0 : vx / len, ny = len < 1e-4 ? 0 : vy / len, nz = len < 1e-4 ? 0 : vz / len;
      const n = Math.floor(len) + 7;
      for (let j = 1; j < n; j++) w.level.particles.spawn?.('sonic_boom', sx + nx * j, sy + ny * j, sz + nz * j, 0, 0, 0);
      w.playSound('entity.warden.sonic_boom', 3, 1);
      if (t.hurt(SONIC_BOOM_DAMAGE, 'sonicBoom', w)) {
        const k = 1 - t.knockbackResistance();
        t.push(nx * SONIC_BOOM_KNOCKBACK_HORIZONTAL * k, ny * SONIC_BOOM_KNOCKBACK_VERTICAL * k, nz * SONIC_BOOM_KNOCKBACK_HORIZONTAL * k);
      }
    },
    stop: (w) => setSonicBoomCooldown(w, SONIC_BOOM_COOLDOWN),
  });
}

/** vanilla MeleeAttack.create(cooldown): its target in reach and in sight, it strikes, then waits `cooldown` ticks */
function meleeAttack(cooldown: number): BehaviorControl<Warden> {
  return oneShot<Warden>((w) => {
    const t = w.attackTarget;
    if (!t || w.mem.has('attack_cooling_down')) return false;
    if (!w.isWithinMeleeAttackRange(t) || !w.visibleLiving.includes(t)) return false;
    w.lookTarget = at(t, true);
    w.swing();
    w.doHurtTarget(t);
    w.mem.set('attack_cooling_down', true, cooldown);
    return true;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// the brain

/** vanilla WardenAi.updateActivity's order: the first of these whose memories are there is what it does */
export const ACTIVITY_ORDER: readonly WardenActivity[] = ['emerge', 'dig', 'roar', 'fight', 'investigate', 'sniff', 'idle'];

/** vanilla Brain.activityRequirementsAreMet for the warden's activities */
export function activityValid(w: Warden, a: WardenActivity): boolean {
  switch (a) {
    case 'emerge':
      return w.mem.has('is_emerging');
    case 'dig':
      return !w.roarTarget && !w.mem.has('dig_cooldown');
    case 'roar':
      return w.roarTarget !== null;
    case 'fight':
      return w.attackTarget !== null;
    case 'investigate':
      return w.mem.has('disturbance_location');
    case 'sniff':
      return w.mem.has('is_sniffing');
    default:
      return true;
  }
}

/** vanilla addActivityAndRemoveMemoryWhenStopped: what an activity forgets once it's left off */
export function eraseActivityMemories(w: Warden, a: WardenActivity): void {
  if (a === 'emerge') w.mem.erase('is_emerging');
  else if (a === 'roar') w.roarTarget = null;
  else if (a === 'fight') w.attackTarget = null;
  else if (a === 'investigate') w.mem.erase('disturbance_location');
  else if (a === 'sniff') w.mem.erase('is_sniffing');
}

/** vanilla WardenAi.makeBrain (each list's behaviours one priority apart, as vanilla's addActivity numbers them) */
export function makeWardenBrain(): Brain<Warden, WardenActivity> {
  const b = new Brain<Warden, WardenActivity>('idle', ['core']);
  const req = (a: WardenActivity) => (w: Warden) => activityValid(w, a);
  b.add('core', [
    [0, swim<Warden>(0.8)],
    [1, setWardenLookTarget()],
    [2, lookAtTargetSink<Warden>(45, 90)],
    [3, moveToTargetSink<Warden>()],
  ]);
  b.add('emerge', [[5, emerging(EMERGE_DURATION)]], req('emerge'));
  b.add('dig', [[0, forceUnmount()], [1, digging(DIGGING_DURATION)]], req('dig'));
  b.add('idle', [
    [10, setRoarTarget()],
    [11, tryToSniff()],
    [12, runOne<Warden>([[randomStroll<Warden>(SPEED_IDLING), 2], [doNothing<Warden>(30, 60), 1]], (w) => !w.mem.has('is_sniffing'))],
  ]);
  b.add('roar', [[10, roar()]], req('roar'));
  b.add('fight', [
    [10, digCooldownSetter()],
    [11, stopAttackingIfTargetInvalid()],
    [12, setEntityLookTarget()],
    [13, setWalkTargetFromAttackTarget(SPEED_FIGHTING)],
    [14, sonicBoom()],
    [15, meleeAttack(MELEE_ATTACK_COOLDOWN)],
  ], req('fight'));
  b.add('investigate', [[5, setRoarTarget()], [6, goToTargetLocation(2, SPEED_INVESTIGATING)]], req('investigate'));
  b.add('sniff', [[5, setRoarTarget()], [6, sniffing(SNIFFING_DURATION)]], req('sniff'));
  return b;
}

export type { Tracker };
