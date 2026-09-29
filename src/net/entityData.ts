// An entity's state as the host sends it to guests (vanilla SynchedEntityData and ClientboundSetEntityDataPacket). Vanilla
// entities declare the few values their client needs; this game's entities keep all theirs as plain fields, and draw
// themselves from whichever they like (a sheep's wool, a creeper's swell, a horse's saddle, a goat's horns), so the host
// sends them all, but for its wiring, its place and motion (MoveEntity says those), what the guest works out for itself
// (its clock, its walk), and the busiest of what only the host's own tick reads. A field that is a number, a flag or a
// text goes as it is; an item as the wire's item; another entity as its id; a short list of those as a list; a
// container as its first slots where a mob shows them (a horse's saddle and armour); and the few parts that hold what
// a mob shows (a pig's saddle) as their own plain fields. What changed goes each tick.
// A guest takes a field only for a field its copy has, and only of the kind it holds there.

import type { Value } from './codec';
import { itemToWire, itemFromHost } from './items';
import { stackKey } from './playerState';
import { ITEM } from './protocol';
import type { Entity } from '../entity/entity';
import { ItemStack } from '../item/item';
import { SimpleContainer } from '../inventory/container';
import { MobEffectInstance, mobEffect, INFINITE_DURATION } from '../entity/effects';

/** an entity's fields as sent: name → value on the wire */
export type EntityData = Record<string, Value>;

/**
 * never sent: an entity's wiring (a dragon's parts are its own); where it is, where it's looking and how fast it
 * moves (MoveEntity); what the guest works out itself (its clock, its walk and the distances walked); and what only
 * the host's tick reads that changes nearly every tick (the countdowns to the next ambient sound or jump, the AI's
 * steering, what a mob's senses last found)
 */
const NOT_SENT = new Set([
  'id', 'type', 'level', 'uuidValue', 'removed', 'bb', 'vehicle', 'passengers', 'subEntities',
  'x', 'y', 'z', 'xo', 'yo', 'zo', 'yaw', 'pitch', 'yawO', 'pitchO', 'headYaw', 'headYawO', 'bodyYaw', 'bodyYawO', 'dx', 'dy', 'dz', 'onGround',
  'tickCount', 'walkDist', 'walkDistO', 'moveDist', 'flyDist', 'nextStep', 'walkAnimPos', 'walkAnimSpeed', 'walkAnimSpeedO',
  'ambientSoundTime', 'noActionTime', 'invulnerableTime', 'air', 'fallDistance', 'xxa', 'yya', 'zza', 'jumping', 'noJumpDelay',
  'horizontalCollision', 'verticalCollision', 'verticalCollisionBelow', 'crystalSoundIntensity', 'lastCrystalSoundTick', 'stuckSpeed',
  'boardingCooldown', 'fluidHeightWater', 'fluidHeightLava', 'wasInWater', 'wasInPowderSnow', 'pistonMoving',
  'lastHurtByMob', 'lastHurtByMobTimestamp', 'lastHurtByPlayer', 'lastHurtByPlayerTime', 'lastHurtMob', 'lastHurtMobTimestamp',
  'lastDamageStamp', 'hurtMarked', 'effectsDirty', 'goalsReady', 'targetChangeTime', 'sensorTime', 'sensorTimers', 'nearestLiving', 'visibleLiving',
]);

/** never sent for these kinds, besides NOT_SENT: what's the guest's own to count (an item's bobbing age) */
const NOT_SENT_BY_TYPE: Record<string, readonly string[]> = {
  item: ['age', 'pickupDelay', 'health', 'bobOffset', 'thrower'],
  experience_orb: ['age'],
  // ((minecarts) vanilla MinecartFurnace sends only whether it's lit, not its fuel's count nor its push)
  furnace_minecart: ['fuel', 'xPush', 'zPush'],
};
// ((minecarts) a container minecart's or chest boat's loot table, and its seed, not yet rolled: vanilla sends neither)
NOT_SENT.add('lootTable').add('lootSeed');

/**
 * sent coarsely: counters whose only use off the host is whether they're running (a baby, a mob on fire, angry, a
 * piglin shaking as it turns, an evoker casting), sent as -1, 0 or 1 rather than every tick of the count
 */
const SIGN_ONLY = new Set(['age', 'remainingFireTicks', 'timeInOverworld', 'angerTime', 'spellCastingTickCount', 'conversionTime']);

/** sent no higher than this: a count whose only use off the host is its start (a body's 20-tick fall as it dies) */
const CLAMPED: Record<string, number> = { deathTime: 20 };

/**
 * what a guest is sent of another player, which has its place, pose and hands from the players' own packets (vanilla
 * Player's and LivingEntity's synched data): how it's hurt or dying, burning or frozen, asleep, and what it's using,
 * and its effects' looks (glowing, invisible)
 */
export const PLAYER_FIELDS: ReadonlySet<string> = new Set([
  'health', 'dead', 'hurtTime', 'deathTime', 'remainingFireTicks', 'ticksFrozen', 'sleepingPos', 'useItem', 'useHand', 'useItemRemaining', 'useDuration', '$effects',
]);

/** containers a guest sees the first slots of (vanilla: a horse's saddle and armour, a llama's carpet) */
const SHOWN_SLOTS: Record<string, number> = { horse: 2, donkey: 2, mule: 2, llama: 2, trader_llama: 2 };

/** the parts of an entity whose own plain fields go too (vanilla Pig and Strider's DATA_SADDLE_ID and boost time) */
const SHOWN_PARTS = new Set(['steering']);

/** the most items of a list that go (an entity's lists are its armour, a paddle pair, the dragon's trail) */
const MAX_LIST = 256;
/** the longest text that goes (names, kinds, variants) */
const MAX_TEXT = 1024;
const NAME = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;

/** (a value that doesn't go, or doesn't fit its field) */
const NO = Symbol('no');

type Kind = 'prim' | 'item' | 'entity' | 'list' | 'container' | null;

/** a part's plain fields (SHOWN_PARTS), each as keyOne takes it */
function partFields(v: object, each: (k: string, x: unknown) => void): void {
  const rec = v as Record<string, unknown>;
  for (const k of Object.keys(v)) {
    const x = rec[k];
    if (x === null || typeof x === 'number' || typeof x === 'boolean' || typeof x === 'string') each(k, x);
  }
}

function kindOf(v: unknown): Kind {
  if (v === null || v === undefined || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return 'prim';
  if (v instanceof ItemStack) return 'item';
  if (Array.isArray(v)) return 'list';
  if (v instanceof SimpleContainer) return 'container';
  if (isEntity(v)) return 'entity';
  return null;
}

function isEntity(v: unknown): v is Entity {
  return typeof v === 'object' && v !== null && typeof (v as Entity).id === 'number' && typeof (v as Entity).type === 'string' && typeof (v as Entity).tick === 'function';
}

/** a value's change key (what it is, cheaply: a number is itself, an item its id, count, damage and data), or NO if it doesn't go */
function keyOne(v: unknown): unknown {
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NO;
  if (typeof v === 'string') return v.length <= MAX_TEXT ? v : NO;
  // (a stack the wire can't carry, a count past 127 say, isn't sent: a guest would take it for bad data)
  if (v instanceof ItemStack) return ITEM(itemToWire(v)) ? 'i' + stackKey(v) : NO;
  if (isEntity(v)) return 'e' + v.id;
  return NO;
}

/** a value for the wire (one keyOne took) */
function wireOne(v: unknown): Value {
  if (v instanceof ItemStack) return { i: itemToWire(v) };
  if (isEntity(v)) return { e: v.id };
  return v as Value;
}

/** a field's change key, or NO when it doesn't go */
function keyField(e: Entity, name: string, v: unknown): unknown {
  if (SIGN_ONLY.has(name) && typeof v === 'number') return Number.isFinite(v) ? Math.sign(v) : NO;
  if (name in CLAMPED && typeof v === 'number') return Number.isFinite(v) ? Math.min(v, CLAMPED[name]) : NO;
  if (SHOWN_PARTS.has(name) && typeof v === 'object' && v !== null && kindOf(v) === null) {
    let key = 'o';
    partFields(v, (k, x) => {
      const kx = keyOne(x);
      if (kx !== NO) key += `|${k}=${String(kx)}`;
    });
    return key;
  }
  if (Array.isArray(v)) {
    if (v.length > MAX_LIST) return NO;
    let key = 'l';
    for (const x of v) {
      const k = keyOne(x);
      if (k === NO) return NO;
      key += '|' + String(k);
    }
    return key;
  }
  if (v instanceof SimpleContainer) {
    const n = Math.min(SHOWN_SLOTS[e.type] ?? 0, v.items.length);
    if (!n) return NO;
    let key = 'c';
    for (let i = 0; i < n; i++) {
      if (!ITEM(itemToWire(v.items[i]))) return NO;
      key += '|' + stackKey(v.items[i]);
    }
    return key;
  }
  return keyOne(v);
}

/** a field for the wire (one keyField took) */
function wireField(e: Entity, name: string, v: unknown): Value {
  if (SIGN_ONLY.has(name) && typeof v === 'number') return Math.sign(v);
  if (name in CLAMPED && typeof v === 'number') return Math.min(v, CLAMPED[name]);
  if (SHOWN_PARTS.has(name) && typeof v === 'object' && v !== null && kindOf(v) === null) {
    const o: Record<string, Value> = {};
    partFields(v, (k, x) => {
      if (keyOne(x) !== NO) o[k] = x as Value;
    });
    return { o };
  }
  if (Array.isArray(v)) return v.map(wireOne);
  if (v instanceof SimpleContainer) return { c: v.items.slice(0, Math.min(SHOWN_SLOTS[e.type] ?? 0, v.items.length)).map(itemToWire) };
  return wireOne(v);
}

/** the fields of `e` that go (of `only`, if given), each with its change key and a way to put it on the wire (the host's side) */
function fieldsOf(e: Entity, each: (name: string, key: unknown, wire: () => Value) => void, only: ReadonlySet<string> | null): void {
  const skip = NOT_SENT_BY_TYPE[e.type];
  const rec = e as unknown as Record<string, unknown>;
  for (const name of Object.keys(e)) {
    if (NOT_SENT.has(name) || (skip && skip.includes(name)) || (only && !only.has(name))) continue;
    const v = rec[name];
    if (typeof v === 'function' || v === undefined) continue;
    const key = keyField(e, name, v);
    if (key !== NO) each(name, key, () => wireField(e, name, v));
  }
  // (vanilla DATA_EFFECT_PARTICLES and the invisible flag: which effects it has, not how long they've left)
  const fx = (e as { activeEffects?: unknown }).activeEffects;
  if (fx instanceof Map && (!only || only.has('$effects'))) {
    let key = 'fx';
    const list: [string, number][] = [];
    for (const inst of fx.values()) if (inst instanceof MobEffectInstance) list.push([inst.id, inst.amplifier]);
    list.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    for (const [id, amp] of list) key += `,${id}:${amp}`;
    each('$effects', key, () => list);
  }
}

/**
 * (the host) what's been sent of one entity: its fields as they were, so each tick sends only what changed
 * (vanilla SynchedEntityData's dirty values)
 */
export class DataWatcher {
  private readonly last = new Map<string, unknown>();

  /** (`only`: just these fields, a player's PLAYER_FIELDS) */
  constructor(private readonly only: ReadonlySet<string> | null = null) {}

  /** every field (for a guest seeing it for the first time), remembered as sent */
  full(e: Entity): EntityData {
    const out: EntityData = {};
    fieldsOf(e, (name, key, wire) => {
      out[name] = wire();
      this.last.set(name, key);
    }, this.only);
    return out;
  }

  /** the fields changed since the last call (null if none), remembered as sent */
  changes(e: Entity): EntityData | null {
    let out: EntityData | null = null;
    fieldsOf(e, (name, key, wire) => {
      if (this.last.get(name) === key && this.last.has(name)) return;
      this.last.set(name, key);
      (out ??= {})[name] = wire();
    }, this.only);
    return out;
  }
}

/**
 * a reference to another entity from the host: its copy here, or null if it hasn't one (for a field, not a list's
 * item, the guest may fill the field in once it comes)
 */
export type Resolve = (netId: number, e: Entity, field: string | null) => Entity | null;

/** (decodeOne) a reference to an entity the guest has no copy of */
const UNKNOWN = Symbol('unknown');

/**
 * (a guest) the host's fields on its copy `e`: each one only into a field the copy has, not one of those the host
 * doesn't send, and only a value of the kind the field holds (a number where a number is, an item where an item or
 * nothing is). Returns why not, if the data isn't the host's to send (a name that can't be a field's, an effect that
 * doesn't exist); a field the copy doesn't have is left alone
 */
export function applyData(e: Entity, data: Value, resolve: Resolve, only: ReadonlySet<string> | null = null): string | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data) || ArrayBuffer.isView(data)) return 'bad entity data';
  const rec = e as unknown as Record<string, unknown>;
  const skip = NOT_SENT_BY_TYPE[e.type];
  for (const [name, wire] of Object.entries(data)) {
    if (wire === undefined) continue;
    if (!NAME.test(name)) return 'bad entity field';
    // (another player: only what a host tells of one)
    if (only && !only.has(name)) continue;
    if (name === '$effects') {
      if (!applyEffects(e, wire)) return 'bad effects';
      continue;
    }
    if (NOT_SENT.has(name) || (skip && skip.includes(name)) || !Object.prototype.hasOwnProperty.call(rec, name)) continue;
    const cur = rec[name];
    const kind = kindOf(cur);
    if (kind === null) {
      // (a part's plain fields: each into a field the part has, of the kind it holds)
      if (!SHOWN_PARTS.has(name) || typeof cur !== 'object' || cur === null) continue;
      const o = typeof wire === 'object' && wire !== null && !Array.isArray(wire) && !ArrayBuffer.isView(wire) ? (wire as { o?: Value }).o : undefined;
      if (typeof o !== 'object' || o === null || Array.isArray(o) || ArrayBuffer.isView(o)) return 'bad entity data';
      const part = cur as Record<string, unknown>;
      for (const [k, x] of Object.entries(o)) {
        if (!NAME.test(k)) return 'bad entity field';
        if (!Object.prototype.hasOwnProperty.call(part, k) || x === undefined) continue;
        const v = decodeOne(x, part[k], e, null, resolve);
        if (v === BAD || (typeof x === 'object' && x !== null)) return 'bad entity data';
        if (v !== NO && v !== UNKNOWN) part[k] = v;
      }
      continue;
    }
    // (a list, or nothing where a list goes: a bat's roost, a piglin's way to the water)
    if (kind === 'list' || (Array.isArray(wire) && (cur === null || cur === undefined))) {
      if (wire === null) {
        rec[name] = null;
        continue;
      }
      if (!Array.isArray(wire) || wire.length > MAX_LIST) return 'bad entity list';
      const list = kind === 'list' ? (cur as unknown[]) : [];
      if (!Object.isExtensible(list)) continue;
      // (item by item, each of the kind the list holds there; an entity the guest has no copy of is left out)
      const next: unknown[] = [];
      for (let i = 0; i < wire.length; i++) {
        const v = decodeOne(wire[i], list[i], e, null, resolve);
        if (v === BAD) return 'bad entity data';
        if (v !== NO && v !== UNKNOWN) next.push(v);
      }
      list.length = 0;
      for (const v of next) list.push(v);
      if (kind !== 'list') rec[name] = list;
      continue;
    }
    if (kind === 'container') {
      const c = (wire as { c?: Value }).c;
      if (!Array.isArray(c) || !c.every(ITEM)) return 'bad container';
      const box = cur as SimpleContainer;
      for (let i = 0; i < c.length && i < box.items.length; i++) box.items[i] = itemFromHost(c[i]);
      continue;
    }
    const v = decodeOne(wire, cur, e, name, resolve);
    if (v === BAD) return 'bad entity data';
    if (v === UNKNOWN) rec[name] = null;
    else if (v !== NO) rec[name] = v;
  }
  return null;
}

/** (decodeOne) data no host sends */
const BAD = Symbol('bad');

/**
 * one value from the host for a field (or a list's item, `field` null) holding `cur`: NO if it isn't of that field's
 * kind, UNKNOWN for an entity the guest has no copy of, BAD for what no host would send
 */
function decodeOne(wire: Value, cur: unknown, e: Entity, field: string | null, resolve: Resolve): unknown {
  const kind = kindOf(cur);
  if (wire === null) return kind === 'container' ? NO : null;
  if (typeof wire === 'number') return Number.isFinite(wire) && (typeof cur === 'number' || cur === null || cur === undefined) ? wire : NO;
  if (typeof wire === 'boolean') return typeof cur === 'boolean' || cur === null || cur === undefined ? wire : NO;
  if (typeof wire === 'string') return wire.length <= MAX_TEXT && (typeof cur === 'string' || cur === null || cur === undefined) ? wire : NO;
  if (typeof wire !== 'object' || Array.isArray(wire) || ArrayBuffer.isView(wire)) return BAD;
  const o = wire as Record<string, Value>;
  if ('i' in o) {
    if (!ITEM(o.i)) return BAD;
    return kind === 'item' || cur === null || cur === undefined ? itemFromHost(o.i) : NO;
  }
  if ('e' in o) {
    if (typeof o.e !== 'number' || !Number.isInteger(o.e)) return BAD;
    if (!(kind === 'entity' || cur === null || cur === undefined)) return NO;
    return resolve(o.e, e, field) ?? UNKNOWN;
  }
  return BAD;
}

/** which effects the copy has (what it shows of them: invisible, the swirl's colour), each lasting till the host says */
function applyEffects(e: Entity, wire: Value): boolean {
  const fx = (e as { activeEffects?: unknown }).activeEffects;
  if (!(fx instanceof Map) || !Array.isArray(wire) || wire.length > 64) return false;
  const next = new Map<string, MobEffectInstance>();
  for (const w of wire) {
    if (!Array.isArray(w) || w.length !== 2 || typeof w[0] !== 'string' || typeof w[1] !== 'number' || !Number.isInteger(w[1]) || w[1] < 0 || w[1] > 255) return false;
    const eff = mobEffect(w[0]);
    if (!eff) return false;
    next.set(eff.id, new MobEffectInstance(eff, INFINITE_DURATION, w[1]));
  }
  fx.clear();
  for (const [k, v] of next) fx.set(k, v);
  return true;
}
