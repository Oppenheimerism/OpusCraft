// A player as it's kept with the world (vanilla Player.addAdditionalSaveData / readAdditionalSaveData, with
// ServerPlayer's): where it is, its health, food and experience, its inventory, effects and spawn point. The game's own
// player is kept in the world's meta.

import type { Player, GameMode } from '../entity/player';
import { saveStack, loadStack, type ItemStack } from '../item/item';
import { saveEntity } from './spawner';
import type { WorldMeta } from '../storage/worldStore';

export type SavedPlayer = NonNullable<WorldMeta['player']>;

/** what a player's advancements and recipe book have to keep, kept alongside it */
export interface SavedBooks {
  advancements?: SavedPlayer['advancements'];
  recipeBook?: SavedPlayer['recipeBook'];
}

/** `p` as it's kept, in dimension `dimension` (what it rides with it: vanilla RootVehicle) */
export function savePlayer(p: Player, dimension: string, books: SavedBooks = {}): SavedPlayer {
  const st = (s: ItemStack | null) => (s ? saveStack(s) : null);
  return {
    x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
    health: p.health, food: p.food.level, saturation: p.food.saturation, exhaustion: p.food.exhaustion,
    xpLevel: p.xpLevel, xpProgress: p.xpProgress, xpTotal: p.xpTotal, xpSeed: p.enchantmentSeed, uuid: p.uuid,
    gameMode: p.gameMode, flying: p.flying, selected: p.inventory.selected,
    inventory: p.inventory.main.map(st), armor: p.inventory.armor.map(st),
    spawn: [p.spawnX, p.spawnY, p.spawnZ],
    respawn: p.respawnPos ? [...p.respawnPos, p.respawnForced ? 1 : 0] : null,
    advancements: books.advancements,
    recipeBook: books.recipeBook,
    dead: p.health <= 0,
    effects: p.saveEffects(),
    vehicle: p.vehicle ? saveEntity(p.vehicle) : null,
    dimension,
    seenCredits: p.seenCredits || undefined,
    lastDeath: p.lastDeathLocation ?? undefined,
    shoulderLeft: p.shoulderLeft ?? undefined,
    shoulderRight: p.shoulderRight ?? undefined,
    wardenSpawnTracker: p.wardenSpawnTracker.save(),
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
}
