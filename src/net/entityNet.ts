// The entity net registry (vanilla EntityType with Entity.getAddEntityPacket / ClientPacketListener.handleAddEntity):
// what a guest is sent to make its own copy of an entity, and the making of it. An entity that has a saved record
// (mobs, dropped items, boats, minecarts, arrows and tridents, rockets, item frames, end crystals, leash knots, armour
// stands) goes as that record and comes back through loadEntity, as a chunk's entities do; the ones that are never
// saved (orbs, primed TNT, falling blocks, thrown things, fireballs, lightning and the rest) are made afresh by their
// type. Either way the fields the host goes on to send (net/entityData.ts) then make the copy look as the entity does
// on the host.

import type { Value } from './codec';
import type { Entity } from '../entity/entity';
import type { Level } from '../game/level';
import type { SavedEntity } from '../entity/mob';
import { saveEntityRecord, loadEntity, MOB_TYPES } from '../game/spawner';
import { MINECART_TYPES } from '../entity/minecart';
import { BOAT_TYPES } from '../entity/boat';
import { ExperienceOrb } from '../entity/xpOrb';
import { PrimedTnt } from '../entity/tnt';
import { FallingBlockEntity } from '../entity/fallingBlock';
import { LightningBolt } from '../entity/lightning';
import { LargeFireball, SmallFireball } from '../entity/fireball';
import { DragonFireball } from '../entity/dragonFireball';
import { ThrownItem } from '../entity/throwable';
import { ThrownPotion } from '../entity/thrownPotion';
import { ThrownExperienceBottle } from '../entity/thrownExperienceBottle';
import { ShulkerBullet } from '../entity/shulkerBullet';
import { LlamaSpit } from '../entity/llama';
import { EyeOfEnder } from '../entity/eyeOfEnder';
import { AreaEffectCloud } from '../entity/areaEffectCloud';
import { WindCharge, BreezeWindCharge } from '../entity/windCharge';
import { OminousItemSpawner } from '../entity/ominousItemSpawner';
import { EvokerFangs } from '../entity/evoker';
// (the wither)
import { WitherSkull } from '../entity/wither';
import { ItemStack } from '../item/item';

/** the entities that are never saved, made afresh (their fields, sent next, do the rest) */
const MADE: Record<string, (level: Level) => Entity> = {
  experience_orb: (l) => new ExperienceOrb(l, 0, 0, 0, 1),
  tnt: (l) => new PrimedTnt(l, 0, 0, 0),
  // (air until its fields come)
  falling_block: (l) => new FallingBlockEntity(l, 0),
  lightning_bolt: (l) => new LightningBolt(l),
  fireball: (l) => new LargeFireball(l, null, 0, 0, 0, 1),
  small_fireball: (l) => new SmallFireball(l, null, 0, 0, 0),
  dragon_fireball: (l) => new DragonFireball(l, null, 0, 0, 0),
  egg: (l) => new ThrownItem(l, 'egg', null),
  snowball: (l) => new ThrownItem(l, 'snowball', null),
  ender_pearl: (l) => new ThrownItem(l, 'ender_pearl', null),
  potion: (l) => new ThrownPotion(l, null, ItemStack.of('splash_potion')),
  experience_bottle: (l) => new ThrownExperienceBottle(l, null),
  shulker_bullet: (l) => new ShulkerBullet(l),
  llama_spit: (l) => new LlamaSpit(l, null),
  eye_of_ender: (l) => new EyeOfEnder(l, 0, 0, 0, ItemStack.of('ender_eye')),
  area_effect_cloud: (l) => new AreaEffectCloud(l, 0, 0, 0),
  wind_charge: (l) => new WindCharge(l, null),
  breeze_wind_charge: (l) => new BreezeWindCharge(l, null),
  ominous_item_spawner: (l) => new OminousItemSpawner(l),
  evoker_fangs: (l) => new EvokerFangs(l, 0, 0, 0, 0, 0, null),
  // (the wither) its skulls, black or blue (`dangerous`, sent next)
  wither_skull: (l) => new WitherSkull(l, null, 0, 0, 0),
};

/** the entities that go as their saved record */
const RECORDED = new Set(['item', 'arrow', 'trident', 'firework_rocket', 'end_crystal', 'item_frame', 'glow_item_frame', 'leash_knot', 'armor_stand', ...MINECART_TYPES, ...BOAT_TYPES]);

/**
 * what a record keeps that a guest isn't shown (vanilla sends none of it): what's in a chest minecart or boat, a
 * donkey's packs or a piglin's pockets (a horse's saddle and armour come with its fields), loot tables, a mob's
 * memories and a villager's dealings
 */
const HIDDEN_DATA = ['items', 'Items', 'inventory', 'LootTable', 'LootTableSeed', 'Brain', 'listener', 'Offers', 'Gossips'];
// ((minecarts) nor a container minecart's or chest boat's loot table, and its seed, not yet rolled)
HIDDEN_DATA.push('lootTable', 'lootSeed');

/** whether a guest can be shown this kind of entity (players aside: they go by AddPlayer) */
export function isNetType(type: string): boolean {
  return RECORDED.has(type) || Object.prototype.hasOwnProperty.call(MADE, type) || Object.prototype.hasOwnProperty.call(MOB_TYPES, type);
}

/**
 * vanilla getAddEntityPacket: the record a guest makes its copy from (null for the kinds that are made afresh), or
 * undefined if this entity can't be shown to a guest (a player, a kind the registry doesn't know, a mob already dead)
 */
export function spawnPayload(e: Entity): SavedEntity | null | undefined {
  if (e.type === 'player' || !isNetType(e.type)) return undefined;
  if (Object.prototype.hasOwnProperty.call(MADE, e.type)) return null;
  const d = saveEntityRecord(e);
  if (!d) return undefined;
  if (d.data) {
    const data = { ...d.data };
    for (const k of HIDDEN_DATA) delete data[k];
    d.data = data;
  }
  // (riders are sent on their own, and set on board by SetPassengers)
  delete d.data?.passengers;
  return d;
}

/** vanilla handleAddEntity: a guest's copy of an entity of `type` from what `spawnPayload` gave, or null if it won't do */
export function createFromPayload(level: Level, type: string, record: Value): Entity | null {
  if (!isNetType(type)) return null;
  if (Object.prototype.hasOwnProperty.call(MADE, type)) return record === null ? MADE[type](level) : null;
  const d = checkRecord(record, type);
  if (!d) return null;
  const e = loadEntity(d, level);
  return e && e.type === type ? e : null;
}

const NUMBERS = ['x', 'y', 'z', 'yaw', 'pitch', 'dx', 'dy', 'dz', 'health', 'fire'] as const;
/** keys a record's JSON may never have (they'd reach an object's prototype through a careless copy) */
const FORBIDDEN = /"(__proto__|constructor|prototype)"\s*:/;

/**
 * a record from the host, if it has the shape loadEntity expects: its kind, finite numbers where numbers go, and no
 * JSON inside it that could reach a prototype (records keep lists as JSON text: a horse's items, a rider's record)
 */
function checkRecord(v: Value, type: string): SavedEntity | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v) || ArrayBuffer.isView(v)) return null;
  const d = v as Record<string, Value>;
  if (d.id !== type) return null;
  for (const k of NUMBERS) if (typeof d[k] !== 'number' || !Number.isFinite(d[k])) return null;
  let bad = false;
  const scan = (x: Value, depth: number): void => {
    if (bad) return;
    if (depth > 16) {
      bad = true;
      return;
    }
    if (typeof x === 'string') {
      if ((x.startsWith('{') || x.startsWith('[')) && FORBIDDEN.test(x)) bad = true;
    } else if (Array.isArray(x)) for (const y of x) scan(y, depth + 1);
    else if (x && typeof x === 'object' && !ArrayBuffer.isView(x)) for (const y of Object.values(x)) scan(y as Value, depth + 1);
  };
  scan(d, 0);
  return bad ? null : (d as unknown as SavedEntity);
}
