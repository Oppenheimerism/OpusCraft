// Vanilla game rules (defaults as in 1.21).

export type GameRules = Record<string, boolean | number>;

export const DEFAULT_GAME_RULES: GameRules = {
  announceAdvancements: true,
  commandBlockOutput: true,
  doDaylightCycle: true,
  doEntityDrops: true,
  doFireTick: true,
  doImmediateRespawn: false,
  doInsomnia: true,
  doMobLoot: true,
  doMobSpawning: true,
  doPatrolSpawning: true,
  doTileDrops: true,
  doTraderSpawning: true,
  doWardenSpawning: true,
  doWeatherCycle: true,
  drowningDamage: true,
  fallDamage: true,
  fireDamage: true,
  freezeDamage: true,
  keepInventory: false,
  maxEntityCramming: 24,
  mobGriefing: true,
  naturalRegeneration: true,
  playersSleepingPercentage: 100,
  randomTickSpeed: 3,
  sendCommandFeedback: true,
  showDeathMessages: true,
  spawnRadius: 10,
};
