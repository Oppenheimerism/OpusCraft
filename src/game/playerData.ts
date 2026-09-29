// A player as it's kept with the world (vanilla Player.addAdditionalSaveData / readAdditionalSaveData, with
// ServerPlayer's): where it is, its health, food and experience, its inventory, effects and spawn point. The game's own
// player is kept in the world's meta; a host's guests each in a record of their own under the world (PlayerDataStore).

import type { Player, GameMode } from '../entity/player';
import { saveStack, loadStack, type ItemStack } from '../item/item';
import { saveEntity, carriesOnePlayer } from './spawner';
import { loadWorldData, saveWorldData, worldDataKey, type WorldMeta } from '../storage/worldStore';
// (ender chests) the player's own ender chest slots
import { enderChestOf } from './enderChest';

export type SavedPlayer = NonNullable<WorldMeta['player']>;

/** what a player's advancements and recipe book have to keep, kept alongside it */
export interface SavedBooks {
  advancements?: SavedPlayer['advancements'];
  recipeBook?: SavedPlayer['recipeBook'];
}

/** `p` as it's kept, in dimension `dimension` (what it rides alone with it: vanilla RootVehicle) */
export function savePlayer(p: Player, dimension: string, books: SavedBooks = {}): SavedPlayer {
  const st = (s: ItemStack | null) => (s ? saveStack(s) : null);
  return {
    x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
    health: p.health, food: p.food.level, saturation: p.food.saturation, exhaustion: p.food.exhaustion,
    xpLevel: p.xpLevel, xpProgress: p.xpProgress, xpTotal: p.xpTotal, xpSeed: p.enchantmentSeed, uuid: p.uuid,
    gameMode: p.gameMode, flying: p.flying, selected: p.inventory.selected,
    inventory: p.inventory.main.map(st), armor: p.inventory.armor.map(st), offhand: st(p.inventory.offhand),
    spawn: [p.spawnX, p.spawnY, p.spawnZ],
    respawn: p.respawnPos ? [...p.respawnPos, p.respawnForced ? 1 : 0] : null,
    advancements: books.advancements,
    recipeBook: books.recipeBook,
    dead: p.health <= 0,
    effects: p.saveEffects(),
    vehicle: p.vehicle && carriesOnePlayer(p.vehicle) ? saveEntity(p.vehicle) : null,
    dimension,
    seenCredits: p.seenCredits || undefined,
    lastDeath: p.lastDeathLocation ?? undefined,
    shoulderLeft: p.shoulderLeft ?? undefined,
    shoulderRight: p.shoulderRight ?? undefined,
    wardenSpawnTracker: p.wardenSpawnTracker.save(),
    enderItems: enderChestOf(p).save(),
    // (remaining mobs: the phantom) how long since it last slept
    timeSinceRest: p.timeSinceRest,
  };
}

/**
 * `p` as `pd` kept it: where it was, its health (its effects first, so health boost holds; a player who died comes
 * back without them), food, experience, game mode, inventory and the rest. Not what it rode, nor its books, nor what
 * dying before it left means: those are the caller's
 */
export function loadPlayer(p: Player, pd: SavedPlayer): void {
  p.moveTo(pd.x, pd.y, pd.z, pd.yaw, pd.pitch);
  if (!pd.dead && pd.health > 0) p.loadEffects(pd.effects);
  p.health = pd.health;
  p.food.level = pd.food;
  p.food.saturation = pd.saturation;
  p.food.exhaustion = pd.exhaustion;
  p.xpLevel = pd.xpLevel;
  p.xpProgress = pd.xpProgress;
  p.xpTotal = pd.xpTotal;
  p.enchantmentSeed = pd.xpSeed ?? 0;
  if (pd.uuid) p.uuid = pd.uuid;
  p.setGameMode(pd.gameMode as GameMode);
  p.flying = pd.flying && p.mayFly;
  p.inventory.selected = pd.selected;
  pd.inventory.forEach((s, i) => {
    p.inventory.main[i] = loadStack(s);
  });
  pd.armor.forEach((s, i) => {
    p.inventory.armor[i] = loadStack(s);
  });
  // (saves from before the offhand was kept have none)
  p.inventory.offhand = loadStack(pd.offhand);
  [p.spawnX, p.spawnY, p.spawnZ] = pd.spawn;
  if (pd.respawn) {
    p.respawnPos = [pd.respawn[0], pd.respawn[1], pd.respawn[2]];
    p.respawnForced = pd.respawn[3] === 1;
  }
  p.seenCredits = !!pd.seenCredits;
  p.lastDeathLocation = pd.lastDeath ? { dim: pd.lastDeath.dim, pos: [...pd.lastDeath.pos] } : null;
  p.shoulderLeft = pd.shoulderLeft ?? null;
  p.shoulderRight = pd.shoulderRight ?? null;
  p.wardenSpawnTracker.load(pd.wardenSpawnTracker);
  // (saves from before ender chests have none: an empty one)
  enderChestOf(p).load(pd.enderItems);
  // (remaining mobs: the phantom; a save from before it was kept: freshly rested)
  p.timeSinceRest = Math.max(0, Math.floor(Number(pd.timeSinceRest ?? 0)) || 0);
}

/** a guest's record's name among its world's data (vanilla playerdata/<uuid>.dat) */
export function playerDataName(uuid: string): string {
  return `playerdata/${uuid}`;
}

/**
 * the guests' players of a world open to LAN (vanilla PlayerDataStorage): each read from the world's save as its guest
 * comes (vanilla PlayerList.load), kept as it leaves and whenever the world is saved with it still there (vanilla
 * PlayerList.saveAll), and written with the world, under <world>/data/playerdata/<uuid>. A world that isn't saved (a
 * quick test's) keeps them for as long as it's open.
 */
export class PlayerDataStore {
  private readonly kept = new Map<string, SavedPlayer>();
  private readonly unwritten = new Set<string>();

  /** `worldId`: the save they're kept in (null: kept only while the world is open) */
  constructor(readonly worldId: string | null) {}

  /** the player of the guest with this uuid as it was last kept, if it's been here before (a copy of it) */
  async load(uuid: string): Promise<SavedPlayer | null> {
    const d = this.kept.get(uuid) ?? (this.worldId ? await loadWorldData<SavedPlayer>(this.worldId, playerDataName(uuid)) : undefined);
    return d ? structuredClone(d) : null;
  }

  /** a guest's player as it is now, to be written with the world */
  put(uuid: string, d: SavedPlayer): void {
    this.kept.set(uuid, d);
    this.unwritten.add(uuid);
  }

  /** (the world being saved) the players kept since it last was */
  async save(): Promise<void> {
    const id = this.worldId;
    if (!id || !this.unwritten.size) return;
    const list = [...this.unwritten].map((u) => ({ key: worldDataKey(id, playerDataName(u)), data: this.kept.get(u) }));
    this.unwritten.clear();
    await saveWorldData(list);
  }
}
