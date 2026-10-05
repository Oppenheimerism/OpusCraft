// Vanilla game rules (defaults as in 1.21).

export type GameRules = Record<string, boolean | number>;

export const DEFAULT_GAME_RULES: GameRules = {
  announceAdvancements: true,
  commandBlockOutput: true,
  // (Stage 4: raids)
  disableRaids: false,
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
  forgiveDeadPlayers: true,
  freezeDamage: true,
  keepInventory: false,
  maxEntityCramming: 24,
  mobGriefing: true,
  naturalRegeneration: true,
  playersNetherPortalCreativeDelay: 1,
  playersNetherPortalDefaultDelay: 80,
  playersSleepingPercentage: 100,
  projectilesCanBreakBlocks: true,
  randomTickSpeed: 3,
  sendCommandFeedback: true,
  showDeathMessages: true,
  snowAccumulationHeight: 1,
  spawnRadius: 10,
  universalAnger: false,
};

/** vanilla GameRules.Category, in its order (the Game Rules screen's): the id and its name */
export const GAME_RULE_CATEGORIES: [string, string][] = [
  ['player', 'Player'],
  ['mobs', 'Mobs'],
  ['spawning', 'Spawning'],
  ['drops', 'Drops'],
  ['updates', 'World Updates'],
  ['chat', 'Chat'],
  ['misc', 'Miscellaneous'],
];

export interface GameRuleInfo {
  category: string;
  /** vanilla's name for it (gamerule.<id>) */
  name: string;
  /** (gamerule.<id>.description) */
  description?: string;
  /** a number's bounds (vanilla IntegerValue.create's min and max), where it has them */
  min?: number;
  max?: number;
}

/** what the Game Rules screen says of each rule, and where it lists it (vanilla GameRules.register's categories) */
export const GAME_RULE_INFO: Record<string, GameRuleInfo> = {
  announceAdvancements: { category: 'chat', name: 'Announce advancements' },
  commandBlockOutput: { category: 'chat', name: 'Broadcast command block output' },
  disableRaids: { category: 'mobs', name: 'Disable raids' },
  doDaylightCycle: { category: 'updates', name: 'Advance time of day' },
  doEntityDrops: { category: 'drops', name: 'Drop entity equipment', description: 'Controls drops from minecarts (including inventories), item frames, boats, etc.' },
  doFireTick: { category: 'updates', name: 'Update fire' },
  doImmediateRespawn: { category: 'player', name: 'Respawn immediately' },
  doInsomnia: { category: 'spawning', name: 'Spawn phantoms' },
  doMobLoot: { category: 'drops', name: 'Drop mob loot', description: 'Controls resource drops from mobs, including experience orbs.' },
  doMobSpawning: { category: 'spawning', name: 'Spawn mobs', description: 'Some entities might have separate rules.' },
  doPatrolSpawning: { category: 'spawning', name: 'Spawn pillager patrols' },
  doTileDrops: { category: 'drops', name: 'Drop blocks', description: 'Controls resource drops from blocks, including experience orbs.' },
  doTraderSpawning: { category: 'spawning', name: 'Spawn Wandering Traders' },
  doWardenSpawning: { category: 'spawning', name: 'Spawn Wardens' },
  doWeatherCycle: { category: 'updates', name: 'Update weather' },
  drowningDamage: { category: 'player', name: 'Deal drowning damage' },
  fallDamage: { category: 'player', name: 'Deal fall damage' },
  fireDamage: { category: 'player', name: 'Deal fire damage' },
  forgiveDeadPlayers: { category: 'mobs', name: 'Forgive dead players', description: 'Angered neutral mobs stop being angry when the targeted player dies nearby.' },
  freezeDamage: { category: 'player', name: 'Deal freeze damage' },
  keepInventory: { category: 'player', name: 'Keep inventory after death' },
  maxEntityCramming: { category: 'mobs', name: 'Entity cramming threshold' },
  mobGriefing: { category: 'mobs', name: 'Allow destructive mob actions' },
  naturalRegeneration: { category: 'player', name: 'Regenerate health' },
  playersNetherPortalCreativeDelay: { category: 'player', name: "Player's Nether portal delay in creative mode", description: 'Time (in ticks) that a creative mode player needs to stand in a Nether portal before changing dimensions.', min: 0 },
  playersNetherPortalDefaultDelay: { category: 'player', name: "Player's Nether portal delay in non-creative mode", description: 'Time (in ticks) that a non-creative mode player needs to stand in a Nether portal before changing dimensions.', min: 0 },
  playersSleepingPercentage: { category: 'player', name: 'Sleep percentage', description: 'The percentage of players who must be sleeping to skip the night.' },
  projectilesCanBreakBlocks: { category: 'drops', name: 'Projectiles can break blocks', description: 'Controls whether impact projectiles will destroy blocks that are destructible by them.' },
  randomTickSpeed: { category: 'updates', name: 'Random tick speed rate' },
  sendCommandFeedback: { category: 'chat', name: 'Send command feedback' },
  showDeathMessages: { category: 'chat', name: 'Show death messages' },
  snowAccumulationHeight: { category: 'updates', name: 'Snow accumulation height', description: 'When it snows, layers of snow form on the ground up to at most this number of layers.', min: 0, max: 8 },
  spawnRadius: { category: 'player', name: 'Respawn location radius', min: 0, max: 32 },
  universalAnger: { category: 'mobs', name: 'Universal anger', description: 'Angered neutral mobs attack any nearby player, not just the player that angered them. Works best if forgiveDeadPlayers is disabled.' },
};

/** vanilla GameRules.IntegerValue.tryDeserialize: `s` as this rule's number, or null where it isn't one it takes */
export function parseGameRuleInt(rule: string, s: string): number | null {
  if (!/^[+-]?\d{1,10}$/.test(s)) return null;
  const n = Number(s);
  if (n < -2147483648 || n > 2147483647) return null;
  const info = GAME_RULE_INFO[rule];
  if (n < (info?.min ?? -2147483648) || n > (info?.max ?? 2147483647)) return null;
  return n;
}
