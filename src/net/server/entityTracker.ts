// What one guest is shown of the entities round it, players aside (vanilla ChunkMap.TrackedEntity with its
// ServerEntity, for one ServerPlayer): an entity comes into view (AddEntity: made from its record, then given all its
// fields), moves (MoveEntity: each tick it moved, or each third for what's alive, as vanilla's update intervals have
// it), changes (SetEntityData: the fields that changed), takes riders on or lets them off (SetPassengers), and goes out
// of view or out of the world (RemoveEntities).

import { sendable, type Value } from '../codec';
import { CB, PoseFlag, WORLD_EDGE, WORLD_HEIGHT_EDGE } from '../protocol';
import { spawnPayload } from '../entityNet';
import type { ServerPlayerSession } from './session';
import type { Entity } from '../../entity/entity';
import { LivingEntity } from '../../entity/living';
import { Mob, type MobCategory } from '../../entity/mob';
import { BOAT_TYPES } from '../../entity/boat';
import { MINECART_TYPES } from '../../entity/minecart';
import { Chunk } from '../../world/chunk';
import { wrapDegrees } from '../../core/math';

/**
 * vanilla EntityType.clientTrackingRange, in chunks: how far from a guest an entity is shown to it (never past its
 * view distance). The kinds that aren't mobs, and the mobs that differ from the rest of their category
 */
const RANGE: Record<string, number> = {
  item: 6, experience_orb: 6, evoker_fangs: 6,
  arrow: 4, trident: 4, egg: 4, snowball: 4, ender_pearl: 4, potion: 4, experience_bottle: 4, firework_rocket: 4, llama_spit: 4,
  fireball: 4, small_fireball: 4, dragon_fireball: 4, wind_charge: 4, breeze_wind_charge: 4, eye_of_ender: 4,
  // (the wither)
  wither_skull: 4,
  shulker_bullet: 8, ominous_item_spawner: 8,
  tnt: 10, falling_block: 10, item_frame: 10, glow_item_frame: 10, leash_knot: 10, area_effect_cloud: 10, armor_stand: 10,
  end_crystal: 16, lightning_bolt: 16,
  warden: 16, ender_dragon: 10, wither: 10, ghast: 10, ravager: 10, shulker: 10, breeze: 10, elder_guardian: 10,
  villager: 10, wandering_trader: 10, iron_golem: 10, snow_golem: 8, bee: 8, fox: 8, cat: 8, parrot: 8, rabbit: 8, mule: 8,
  hoglin: 8, strider: 10, allay: 8, squid: 10, dolphin: 10,
};
for (const t of BOAT_TYPES) RANGE[t] = 10;
for (const t of MINECART_TYPES) RANGE[t] = 8;
/** the rest of the mobs, by category: monsters 8, animals and golems 10, bats 5, fish 4 */
const RANGE_BY_CATEGORY: Record<MobCategory, number> = { monster: 8, creature: 10, ambient: 5, water_creature: 8, water_ambient: 4, axolotls: 10, underground_water_creature: 10, misc: 10 };

function rangeOf(e: Entity): number {
  const r = RANGE[e.type];
  if (r !== undefined) return r;
  return e instanceof Mob ? (RANGE_BY_CATEGORY[e.category] ?? 5) : 5;
}

/** the kinds of entity whose record couldn't go, told once each */
const unsendable = new Set<string>();

/** vanilla ServerEntity.updateInterval for what's alive (the rest go each tick): a mob's moves every third tick, eased into over three on the guest */
export const LIVING_INTERVAL = 3;

/** one entity as the guest was last told of it */
interface Tracked {
  /** its move (MoveEntity's fields, the id aside), as a key */
  move: string;
  /** what it rode (a rider that gets off is sent where it went at once) */
  vehicle: Entity | null;
  /** its riders the guest knows of, by id in seat order */
  riders: string;
}

export class EntityTracker {
  private readonly seen = new Map<Entity, Tracked>();
  private readonly byIds = new Map<number, Entity>();

  constructor(private readonly session: ServerPlayerSession) {}

  /** whether the guest has been shown `e` */
  has(e: Entity): boolean {
    return this.seen.has(e);
  }

  /** the entity the guest was shown as `id`, if it still sees it */
  byId(id: number): Entity | null {
    return this.byIds.get(id) ?? null;
  }

  /**
   * vanilla ServerLevel.getEntityOrPart: a part of an entity the guest sees (an ender dragon's head, say), by the id
   * vanilla gives it, its entity's and then one each in order (EnderDragon.setId)
   */
  partById(id: number): Entity | null {
    for (const e of this.seen.keys()) {
      const parts = (e as { subEntities?: readonly Entity[] }).subEntities;
      if (parts && !e.removed && id > e.id && id <= e.id + parts.length) return parts[id - e.id - 1];
    }
    return null;
  }

  get size(): number {
    return this.seen.size;
  }

  /**
   * (guests under load: the guest caught up after falling behind) all the fields of everything it was shown, afresh:
   * what changed meanwhile wasn't sent it (its moves and riders go as ever, being what changed since they were sent)
   */
  refresh(): void {
    const s = this.session;
    for (const e of this.seen.keys()) if (!e.removed) s.send([CB.SetEntityData, e.id, s.server.dataFull(e)]);
  }

  /** (the guest going to another dimension with the host) nothing it was shown is there any more */
  clear(): void {
    this.seen.clear();
    this.byIds.clear();
  }

  /** (the session's flush, after the players) this tick's comings, moves, changes, riders and goings */
  tick(ticks: number): void {
    const s = this.session, me = s.player!;
    // (vanilla TrackedEntity.updatePlayer: within the entity's range, and a chunk inside the view distance, which the guest has)
    const cap = Math.max(1, s.viewDistance - 1) * 16;
    const here = new Set<Entity>();
    const ride = me.vehicle ? me.rootVehicle() : null;
    for (const e of s.level.entities) {
      if (e.removed || e.type === 'player' || !this.inView(e, me.x, me.z, cap, ride)) continue;
      const t = this.seen.get(e);
      if (t) this.update(e, t, ticks);
      else if (!this.add(e)) continue;
      here.add(e);
    }
    let gone: number[] | null = null;
    for (const e of this.seen.keys())
      if (!here.has(e)) {
        this.seen.delete(e);
        this.byIds.delete(e.id);
        (gone ??= []).push(e.id);
      }
    if (gone) s.send([CB.RemoveEntities, gone]);
    // (vanilla ServerEntity.sendChanges / sendPairingData: the riders the guest knows of; one that comes later is told of then)
    for (const [e, t] of this.seen) {
      if (!e.passengers.length && !t.riders) continue;
      let ids: number[] | null = null;
      for (const r of e.passengers) if (s.knows(r)) (ids ??= []).push(r.id);
      const key = ids ? ids.join(',') : '';
      if (key === t.riders) continue;
      t.riders = key;
      s.send([CB.SetPassengers, e.id, ids ?? []]);
    }
  }

  private inView(e: Entity, px: number, pz: number, cap: number, ride: Entity | null): boolean {
    // (what can't go on the wire isn't shown: a guest would take it for bad data)
    if (!(Math.abs(e.x) <= WORLD_EDGE && Math.abs(e.z) <= WORLD_EDGE && Math.abs(e.y) <= WORLD_HEIGHT_EDGE)) return false;
    // (what the guest rides, it sees, wherever its chunks have got to)
    if (ride && e.rootVehicle() === ride) return true;
    let r = rangeOf(e);
    // (vanilla getEffectiveRange: as far as the farthest seen of it and its riders)
    for (const p of e.passengers) if (p.type !== 'player') r = Math.max(r, rangeOf(p));
    const d = Math.min(r * 16, cap), dx = e.x - px, dz = e.z - pz;
    return dx * dx + dz * dz <= d * d && this.session.sent.has(Chunk.key(Math.floor(e.x) >> 4, Math.floor(e.z) >> 4));
  }

  /** vanilla ServerEntity.sendPairingData: made from its record, where it is, with all its fields */
  private add(e: Entity): boolean {
    const rec = spawnPayload(e);
    if (rec === undefined) return false;
    const m = moveOf(e);
    const packet: Value[] = [CB.AddEntity, e.id, e.type, rec as unknown as Value, ...m, this.session.server.dataFull(e)];
    // (a record the wire can't carry, a number that isn't one say, would be refused with all the guest's tick: not shown)
    if (!sendable(packet, 1)) {
      if (!unsendable.has(e.type)) {
        unsendable.add(e.type);
        console.error(`multiplayer: a ${e.type} can't be shown to guests`, rec);
      }
      return false;
    }
    this.seen.set(e, { move: e.vehicle ? m.slice(3).join(',') : m.join(','), vehicle: e.vehicle, riders: '' });
    this.byIds.set(e.id, e);
    this.session.send(packet);
    return true;
  }

  /** vanilla ServerEntity.sendChanges */
  private update(e: Entity, t: Tracked, ticks: number): void {
    const s = this.session;
    const got = t.vehicle !== e.vehicle;
    if (got || !(e instanceof LivingEntity) || (ticks + e.id) % LIVING_INTERVAL === 0) {
      const m = moveOf(e);
      // (a rider's place is its seat, which the guest works out: only its look counts)
      const key = e.vehicle ? m.slice(3).join(',') : m.join(',');
      if (key !== t.move || got) {
        t.move = key;
        s.send([CB.MoveEntity, e.id, ...m]);
      }
      t.vehicle = e.vehicle;
    }
    const data = s.server.dataChanges(e);
    if (data) s.send([CB.SetEntityData, e.id, data]);
  }
}

/** MoveEntity's fields for `e`: where it is, its look (wrapped, as vanilla's byte angles are), and whether it's on the ground */
function moveOf(e: Entity): number[] {
  const l = e instanceof LivingEntity ? e : null;
  const yaw = angle(e.yaw);
  return [e.x, e.y, e.z, yaw, angle(e.pitch), l ? angle(l.headYaw) : yaw, l ? angle(l.bodyYaw) : yaw, e.onGround ? PoseFlag.ON_GROUND : 0];
}

/** (a number that isn't one can't go on the wire) */
function angle(a: number): number {
  return Number.isFinite(a) ? wrapDegrees(a) : 0;
}
