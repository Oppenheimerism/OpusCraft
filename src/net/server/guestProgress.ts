// A guest's advancements on the host (vanilla PlayerAdvancements, one for each ServerPlayer). The criteria its player
// meets in the host's world are the host's to see, as its own player's are (game/game.ts hookProgress and tickProgress,
// which this follows for each guest's player): kept with its player (game/playerData.ts), told to the guest as they
// change, for its toasts and its advancements screen (net/advancementSync.ts), and announced in everyone's chat.

import { CB } from '../protocol';
import { progressChanges } from '../advancementSync';
import { PlayerAdvancements, announcement, type AdvancementDef, type AdvancementSave, type Criterion, type TriggerPayload } from '../../game/advancements';
import type { ServerPlayerSession } from './session';
import type { HostServer } from './hostServer';
import type { MenuEvents } from '../../game/openMenu';
import type { Interaction } from '../../game/interaction';
import type { Player } from '../../entity/player';
import type { Entity } from '../../entity/entity';
import { interactedPayload } from '../../game/progressTriggers';
import { LivingEntity } from '../../entity/living';
import { Monster } from '../../entity/monsters';
import { Piglin, isLovedItem } from '../../entity/piglin';
import { BIOMES } from '../../world/gen/biomes';
import { MIN_Y, MAX_Y } from '../../world/constants';
import { tickOuterEndProgress } from '../../game/outerEndProgress';
import { tickTrialChamberProgress } from '../../game/trialChamberProgress';
import { tickBastionProgress } from '../../game/bastions';

export class GuestProgress {
  readonly advancements = new PlayerAdvancements();
  /** what the guest was last told of each advancement: its criteria, sorted and joined (net/advancementSync.ts) */
  private readonly told = new Map<string, string>();
  /** the advancements' version when the guest was last told; and whether the next is the first (vanilla isFirstPacket) */
  private toldVersion = -1;
  private first = true;
  /** (tick) the player's own ticks, for the checks made every 20 (vanilla ServerPlayer.tickCount) */
  private ticks = 0;
  /** (tick) Game.tickProgress's for its own player: the inventory as last looked at, a fall from the top, a ride across lava */
  private invVersion = -1;
  private fallStartY: number | null = null;
  private lavaRideFrom: [number, number] | null = null;
  /** vanilla ServerPlayer.enteredNetherPosition, and where it left the Overworld from (Game.leftOverworldAt) */
  private enteredNetherAt: [number, number] | null = null;
  private leftOverworldAt: [number, number] | null = null;

  constructor(private readonly session: ServerPlayerSession) {
    this.advancements.onAward = (a) => this.awarded(a);
  }

  /** (logging in) its advancements as the world kept them with its player; the guest is told all of them first */
  load(d: AdvancementSave | undefined): void {
    this.advancements.load(d);
    this.told.clear();
    this.toldVersion = -1;
    this.first = true;
  }

  trigger(type: Criterion['t'], p: TriggerPayload = {}): void {
    this.advancements.trigger(type, p);
  }

  /**
   * vanilla PlayerAdvancements.award: done, and (with announceAdvancements, for those that announce) everyone reads it;
   * the toast is its guest's own game's, as the host's progress reaches it
   */
  private awarded(a: AdvancementDef): void {
    const s = this.session;
    if (a.announce !== false && s.level.gameRules.announceAdvancements) s.server.broadcastChat(announcement(s.name, a));
  }

  /** its player's own hooks (Game.hookProgress's, for the host's player): its effects changing */
  hookPlayer(p: Player): void {
    p.onEffectsChanged = () => this.trigger('effects_changed', { effects: new Set(p.activeEffects.keys()) });
  }

  /** what its clicks earn, as the host's own Interaction's do (Game.hookProgress) */
  hookInteraction(it: Interaction): void {
    it.onShotCrossbow = () => this.trigger('shot_crossbow');
    it.onPlaced = (name) => this.trigger('place', { place: name });
    it.onConsumed = (id) => this.trigger('consume', { consume: id });
    it.onItemDurability = (item, vehicle) => this.trigger('item_durability', { durability: { item, vehicle } });
    it.onInteractedWithEntity = (stack, e) => {
      if (e instanceof Piglin && e.isAdult() && stack?.item.id === 'gold_ingot') this.trigger('distract_piglin', { distract: 'directly' });
      this.trigger('player_interacted_with_entity', interactedPayload(stack, e));
    };
  }

  /** what opening a menu earns it (game/openMenu.ts: Game.menuEvents, for the host's player) */
  readonly menuEvents: MenuEvents = {
    loot: (table) => this.trigger('container_loot', { lootTable: table }),
    brewed: (potion) => this.trigger('brewed_potion', { potion }),
    enchanted: () => this.trigger('enchanted_item'),
  };

  /** (each of the host's ticks, after its player's) Game.tickProgress's checks, for its player */
  tick(): void {
    const s = this.session, p = s.player, level = s.level;
    if (!p || p.removed) return;
    this.ticks++;
    const inv = p.inventory;
    if (inv.version !== this.invVersion) {
      this.invVersion = inv.version;
      const ids = new Set<string>();
      for (const st of [...inv.main, ...inv.armor, inv.offhand]) if (st && st.count > 0) ids.add(st.item.id);
      this.trigger('inventory', { inventory: ids });
    }
    const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z), dim = level.world.dim.id;
    if (this.ticks % 20 === 0) {
      const b = BIOMES[level.world.getBiome3(x, y, z)];
      if (b) this.trigger('biome', { biome: b.name });
      // vanilla LocationPredicate.inStructure: inside one of the structure's pieces
      if (dim === 'the_nether' && level.fortresses().pieceAt(x, y, z)) this.trigger('structure', { structures: ['fortress'] });
      if (dim === 'overworld' && level.strongholds().pieceAt(x, y, z)) this.trigger('structure', { structures: ['stronghold'] });
    }
    tickOuterEndProgress(level, p, this.advancements);
    tickTrialChamberProgress(level, p, this.advancements);
    tickBastionProgress(level, p, this.advancements);
    // vanilla trackEnteredOrExitedLavaOnVehicle (ride_entity_in_lava)
    const v = p.vehicle;
    if (v?.inLava) {
      if (!this.lavaRideFrom) this.lavaRideFrom = [p.x, p.z];
      else this.trigger('ride_in_lava', { lavaRide: { vehicle: v.type, distance: Math.hypot(p.x - this.lavaRideFrom[0], p.z - this.lavaRideFrom[1]), dimension: dim } });
    }
    if (this.lavaRideFrom && !v?.inLava) this.lavaRideFrom = null;
    // vanilla fall_from_world_height: from the build limit to the bottom, alive
    if (!p.onGround && !p.flying && p.y >= MAX_Y - 1) this.fallStartY = p.y;
    if (p.onGround || p.flying || p.inWater) {
      if (this.fallStartY !== null && p.y <= MIN_Y + 5 && p.health > 0) this.trigger('fall_from_height');
      this.fallStartY = null;
    }
  }

  /** (the host taking it along to another dimension) where it left the Overworld from, for Subspace Bubble; nothing it was doing carries over */
  leavingDimension(from: string, p: Player): void {
    this.leftOverworldAt = from === 'overworld' ? [p.x, p.z] : null;
    this.lavaRideFrom = null;
    this.fallStartY = null;
  }

  /** (arriving beside the host) vanilla ServerPlayer.triggerDimensionChangeTriggers (Game.onChangedDimension) */
  changedDimension(from: string, to: string, p: Player): void {
    this.trigger('changed_dimension', { dimension: { from, to } });
    if (from === 'the_nether' && to === 'overworld' && this.enteredNetherAt)
      this.trigger('nether_travel', { netherTravel: Math.hypot(p.x - this.enteredNetherAt[0], p.z - this.enteredNetherAt[1]) });
    if (to === 'the_nether' && from === 'overworld') this.enteredNetherAt = this.leftOverworldAt;
    else if (to !== 'the_nether') this.enteredNetherAt = null;
  }

  /** (end of the host's tick) vanilla PlayerAdvancements.flushDirty: what changed, to the guest (all of it, the first time) */
  flush(): void {
    const adv = this.advancements;
    if (!this.first && adv.version === this.toldVersion) return;
    this.toldVersion = adv.version;
    const changes = progressChanges(adv, this.told);
    if (!changes.length && !this.first) return;
    this.session.send([CB.UpdateAdvancements, this.first, changes]);
    this.first = false;
  }
}

/**
 * the level's hooks a guest's player meets criteria by (Game.hookProgress sets them for the host's own player), the
 * host's own game's still called first, then each guest's progress told of what its player did; what undoes it all
 */
export function hookGuestProgress(server: HostServer): () => void {
  const level = server.level;
  const of = (p: Entity | null | undefined): GuestProgress | null => (p && p.type === 'player' ? (server.sessionOf(p as Player)?.progress ?? null) : null);
  const guests = (): [Player, GuestProgress][] => {
    const out: [Player, GuestProgress][] = [];
    for (const s of server.sessions.values()) if (s.state === 'play' && s.player && !s.travelling) out.push([s.player, s.progress]);
    return out;
  };
  const died = level.onEntityDied, bred = level.onBred, tamed = level.onTamed, arrowHit = level.onPlayerArrowHit, tridentHit = level.onPlayerTridentHit;
  const channeled = level.onChanneledLightning, picked = level.onThrownItemPickedUp, crossbow = level.onPlayerCrossbowKill, cured = level.onCuredZombieVillager;
  const summoned = level.onSummonedEntity, trigger = level.onPlayerTrigger;
  level.onEntityDied = (victim, source, attacker) => {
    died?.(victim, source, attacker);
    for (const [p, g] of guests()) {
      if (victim === p) {
        if (p.killer instanceof LivingEntity && p.killer !== p) g.trigger('killed_by');
        continue;
      }
      // vanilla getKillCredit: whoever hurt it last (the player, within 100 ticks)
      if ((victim.lastHurtByPlayer !== p && attacker !== p) || !(victim instanceof LivingEntity)) continue;
      const killed = { type: victim.type, hostile: victim instanceof Monster, distance: Math.sqrt(p.distanceToSqr(victim.x, victim.y, victim.z)), byArrow: source === 'arrow', byFireball: source === 'fireball' };
      g.trigger('kill', { killed });
      g.trigger('sniper', { killed });
      g.trigger('return_to_sender', { killed });
    }
  };
  level.onBred = (child, cause) => {
    bred?.(child, cause);
    of(cause)?.trigger('breed', { breed: child.type });
  };
  level.onTamed = (animal, by) => {
    tamed?.(animal, by);
    of(by)?.trigger('tame', { tame: { type: animal.type, variant: animal.variantId() } });
  };
  level.onPlayerArrowHit = (e, p) => {
    arrowHit?.(e, p);
    of(p)?.trigger('shoot_arrow');
  };
  level.onPlayerTridentHit = (e, p) => {
    tridentHit?.(e, p);
    of(p)?.trigger('throw_trident');
  };
  level.onChanneledLightning = (victims, p) => {
    channeled?.(victims, p);
    of(p)?.trigger('channeled_lightning', { channeled: victims.map((e) => e.type) });
  };
  level.onThrownItemPickedUp = (stack, by, thrower) => {
    picked?.(stack, by, thrower);
    if (by instanceof Piglin && by.isAdult() && isLovedItem(stack)) of(thrower)?.trigger('distract_piglin', { distract: 'thrown' });
  };
  level.onPlayerCrossbowKill = (killed, p) => {
    crossbow?.(killed, p);
    of(p)?.trigger('killed_by_crossbow', { crossbowKills: killed.map((e) => e.type) });
  };
  level.onCuredZombieVillager = (p, v) => {
    cured?.(p, v);
    of(p)?.trigger('cured_zombie_villager', { cured: true });
  };
  // (Game: the golem came to life near enough to the player to be seen, vanilla's 5 blocks round its box)
  level.onSummonedEntity = (e) => {
    summoned?.(e);
    for (const [p, g] of guests()) if (e.bb.inflate(5).intersects(p.bb)) g.trigger('summoned_entity', { summoned: e.type });
  };
  // (Stage 4) every other criterion met out in the world: shields, totems, raids, buckets, the trial chambers' and the rest
  level.onPlayerTrigger = (p, type, payload) => {
    trigger?.(p, type, payload);
    of(p)?.trigger(type, payload);
  };
  return () => {
    level.onEntityDied = died;
    level.onBred = bred;
    level.onTamed = tamed;
    level.onPlayerArrowHit = arrowHit;
    level.onPlayerTridentHit = tridentHit;
    level.onChanneledLightning = channeled;
    level.onThrownItemPickedUp = picked;
    level.onPlayerCrossbowKill = crossbow;
    level.onCuredZombieVillager = cured;
    level.onSummonedEntity = summoned;
    level.onPlayerTrigger = trigger;
  };
}
