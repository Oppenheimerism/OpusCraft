// Advancements (vanilla data/minecraft/advancements, PlayerAdvancements,
// AdvancementVisibilityEvaluator and TreeNodePosition): the story, adventure
// and husbandry trees with their criteria, per-player progress, which
// advancements are visible, and the layout of each tab.

// (jukebox) the discs, for Sound of Music
import { JUKEBOX_SONGS } from '../item/jukeboxSongs';
import { GAME_NAME } from '../brand';

export type FrameType = 'task' | 'goal' | 'challenge';

/** a criterion: a trigger type and the condition the trigger's payload must meet */
export type Criterion =
  /** (M9: frogs) `all`: every one of them at once (vanilla inventory_changed with several items) */
  | { t: 'inventory'; items: string[]; all?: boolean }
  | { t: 'kill'; type: string | '*' | 'hostile' }
  | { t: 'killed_by' }
  | { t: 'slept' }
  | { t: 'place'; blocks: string[] }
  | { t: 'consume'; item: string | '*' }
  | { t: 'breed'; type: string | '*' }
  /** vanilla TameAnimalTrigger: tamed that kind (and that variant) */
  | { t: 'tame'; type: string | '*'; variant?: string }
  | { t: 'shoot_arrow' }
  /** vanilla player_hurt_entity, the damage's direct entity a trident */
  | { t: 'throw_trident' }
  /** vanilla channeled_lightning: lightning from the player's channeling trident struck one of each of these */
  | { t: 'channeled_lightning'; victims: string[] }
  /** vanilla shot_crossbow: fired a crossbow */
  | { t: 'shot_crossbow' }
  /**
   * vanilla killed_by_crossbow: what one crossbow arrow has killed — at least `uniqueTypes` different kinds,
   * and/or a distinct victim for each type in `victims`
   */
  | { t: 'killed_by_crossbow'; uniqueTypes?: number; victims?: string[] }
  | { t: 'biome'; biome: string }
  /** vanilla PlayerTrigger LOCATION with LocationPredicate.inStructure: standing in one of its pieces */
  | { t: 'structure'; structure: string }
  | { t: 'sniper' }
  /** vanilla player_killed_entity: a ghast, the killing blow a fireball */
  | { t: 'return_to_sender' }
  | { t: 'fall_from_height' }
  | { t: 'enchanted_item' }
  | { t: 'changed_dimension'; from?: string; to?: string }
  | { t: 'nether_travel'; distance: number }
  /** vanilla LevitationTrigger: floated (under Levitation) at least that far from where it took hold, up or down */
  | { t: 'levitation'; minY: number }
  /** vanilla item_durability_changed: that item wore, the player riding that mount */
  | { t: 'item_durability'; item: string; vehicle: string }
  /** vanilla ride_entity_in_lava: carried that far across lava (horizontally) on that mount, in that dimension */
  | { t: 'ride_in_lava'; vehicle: string; distance: number; dimension: string }
  /**
   * vanilla thrown_item_picked_up_by_entity (a #piglin_loved item a grown piglin picked up) and
   * player_interacted_with_entity (a gold ingot handed to one)
   */
  | { t: 'distract_piglin'; how: 'thrown' | 'directly' }
  /** vanilla TradeTrigger: traded with a villager (standing at least that high) */
  | { t: 'villager_trade'; minY?: number }
  /** vanilla CuredZombieVillagerTrigger */
  | { t: 'cured_zombie_villager' }
  /** vanilla SummonedEntityTrigger: built a golem (or the wither) near enough to see it come to life */
  | { t: 'summoned_entity'; entity: string }
  /** vanilla BrewedPotionTrigger: took something with a potion in it out of a brewing stand */
  | { t: 'brewed_potion' }
  /** vanilla EffectsChangedTrigger with a MobEffectsPredicate: all of these effects on the player at once */
  | { t: 'effects_changed'; effects: string[]; source?: string }
  /** vanilla enter_block: stepped into that block (an end gateway) */
  | { t: 'enter_block'; block: string }
  /** vanilla entity_hurt_player: a projectile's damage, blocked by a shield */
  | { t: 'deflected_projectile' }
  | { t: 'used_totem' }
  /** vanilla player_killed_entity with a #raiders wearing the ominous banner (Voluntary Exile) */
  | { t: 'killed_raid_captain' }
  /** vanilla hero_of_the_village (CriteriaTriggers.RAID_WIN): a raid won with the player among its heroes */
  | { t: 'raid_won' }
  /** vanilla player_generates_container_loot: that loot table rolled for the player (a suspicious block's, brushed) */
  | { t: 'container_loot'; table: string }
  /** vanilla recipe_crafted: that recipe's result taken, each ingredient (an item, or a #tag) a different one of the grid's */
  | { t: 'recipe_crafted'; recipe: string; ingredients: string[] }
  /** (Stage 5: ocean) vanilla filled_bucket: filled a bucket that comes out as one of these (a fish scooped up) */
  | { t: 'filled_bucket'; items: string[] }
  /** (the deep dark) vanilla avoid_vibration: a sculk sensor or warden didn't hear the player, sneaking */
  | { t: 'avoid_vibration' }
  /** (the deep dark) vanilla kill_mob_near_sculk_catalyst: something the player hurt died by a catalyst, which took its experience */
  | { t: 'kill_mob_near_sculk_catalyst' }
  /** (M8: goats) vanilla started_riding: the player's vehicle, of this type, carries one of these too */
  | { t: 'started_riding'; vehicle: string; passenger: string }
  /**
   * (M9: frogs) vanilla player_interacted_with_entity: used this item on this kind of mob (of this variant; (remaining
   * mobs: the armadillo) wearing this body armour with this much wear, after)
   */
  | { t: 'player_interacted_with_entity'; item: string; entity: string; variant?: string; bodyArmor?: { item: string; damage: number } }
  /**
   * (trial chambers) vanilla item_used_on_block: used one of these items on one of these blocks, with these block state
   * properties if given (the block as it was when the trigger fired: before an item's own use changed it, after a block's)
   */
  | { t: 'item_used_on_block'; items: string[]; blocks: string[]; state?: Record<string, string | boolean>; biome?: string; smokey?: boolean }
  /** (remaining mobs: the bee) vanilla slide_down_block: slid down the side of that block */
  | { t: 'slide_down_block'; block: string }
  /** (remaining mobs: the bee) vanilla bee_nest_destroyed: broke that block, with or without silk touch, that many bees inside */
  | { t: 'bee_nest_destroyed'; block: string; silkTouch: boolean; bees: number }
  /**
   * (trial chambers) vanilla lightning_strike: a bolt within that distance of the player, that set no more than that
   * many blocks on fire, went with one of that kind standing by unharmed
   */
  | { t: 'lightning_strike'; maxDistance: number; maxBlocksSetOnFire: number; bystander: string }
  /**
   * (trial chambers) vanilla player_killed_entity where the killing blow's direct entity is asked about: a mob of this
   * kind, killed by the player with this kind of projectile (Blowback)
   */
  | { t: 'player_killed_entity'; victim: string; direct: string }
  /**
   * (trial chambers) vanilla fall_after_explosion: the player began to fall at least this far above where a burst of
   * this kind of thing threw them from (DistancePredicate.vertical)
   */
  | { t: 'fall_after_explosion'; minRise: number; cause: string }
  /**
   * (trial chambers) vanilla player_hurt_entity: a blow from the player of at least this much damage (as dealt, before
   * the target's armour), of this kind, with this in their hand
   */
  | { t: 'player_hurt_entity'; minDealt: number; source: string; weapon: string }
  /** (trial chambers) vanilla crafter_recipe_crafted: a crafter near the player crafted this recipe */
  | { t: 'crafter_recipe_crafted'; recipe: string }
  /**
   * (spyglass) vanilla using_item, each tick an item is in use: this item, the player (PlayerPredicate.looking_at) looking
   * at a mob of this kind, if given
   */
  | { t: 'using_item'; item: string; lookingAt?: string }
  | { t: 'impossible' };

export interface AdvancementDef {
  id: string;
  parent: string | null;
  title: string;
  description: string;
  icon: string;
  frame: FrameType;
  background?: string;
  hidden?: boolean;
  toast?: boolean;
  announce?: boolean;
  criteria: Record<string, Criterion>;
  /** AND of ORs over criterion names (default: every criterion) */
  requirements?: string[][];
}

// ---------------------------------------------------------------------------
// data

const inv = (...items: string[]): Criterion => ({ t: 'inventory', items });
const never: Criterion = { t: 'impossible' };
/** (spyglass) vanilla using_item: a spyglass in use, looking at that kind of mob */
const spyglassAt = (lookingAt: string): Criterion => ({ t: 'using_item', item: 'spyglass', lookingAt });
const one = (c: Criterion): Record<string, Criterion> => ({ c });
const toNether: Criterion = { t: 'changed_dimension', to: 'the_nether' };
const toEnd: Criterion = { t: 'changed_dimension', to: 'the_end' };
// (trial chambers) vanilla HoneycombItem.WAXABLES's blocks (the copper blocks that aren't waxed), WAX_OFF_BY_BLOCK's
// (the waxed ones) and VanillaHusbandryAdvancements.WAX_SCRAPING_TOOLS
const COPPER_BLOCKS = ['', 'exposed_', 'weathered_', 'oxidized_'].flatMap((age) =>
  ['copper_block', 'chiseled_copper', 'copper_grate', 'cut_copper', 'cut_copper_stairs', 'cut_copper_slab', 'copper_door', 'copper_trapdoor', 'copper_bulb']
    .map((kind) => (kind === 'copper_block' && age ? `${age}copper` : age + kind)));
const WAXED_COPPER_BLOCKS = COPPER_BLOCKS.map((n) => `waxed_${n}`);
const AXES = ['wooden_axe', 'golden_axe', 'stone_axe', 'iron_axe', 'diamond_axe', 'netherite_axe'];
// (signs) vanilla #all_signs: every wood's standing, wall, hanging and wall hanging sign
const ALL_SIGNS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'bamboo', 'crimson', 'warped'].flatMap((w) => [`${w}_sign`, `${w}_wall_sign`, `${w}_hanging_sign`, `${w}_wall_hanging_sign`]);

const HOSTILE = [
  'blaze', 'bogged', 'breeze', 'cave_spider', 'creeper', 'drowned', 'elder_guardian', 'ender_dragon', 'enderman', 'endermite', 'evoker',
  'ghast', 'guardian', 'hoglin', 'husk', 'magma_cube', 'phantom', 'piglin', 'piglin_brute', 'pillager', 'ravager', 'shulker', 'silverfish',
  'skeleton', 'slime', 'spider', 'stray', 'vex', 'vindicator', 'witch', 'wither', 'wither_skeleton', 'zoglin', 'zombie', 'zombie_villager',
  'zombified_piglin',
];
/** vanilla adventure/salvage_sherd: the archaeology loot tables, any one of them rolled */
const ARCHAEOLOGY_TABLES = ['desert_pyramid', 'desert_well', 'ocean_ruin_cold', 'ocean_ruin_warm', 'trail_ruins_rare', 'trail_ruins_common'];
/** vanilla husbandry/whole_pack: one of each wolf variant */
const WOLF_VARIANT_IDS = ['ashen', 'black', 'chestnut', 'pale', 'rusty', 'snowy', 'spotted', 'striped', 'woods'];
const CAT_VARIANT_IDS = ['all_black', 'black', 'british_shorthair', 'calico', 'jellie', 'persian', 'ragdoll', 'red', 'siamese', 'tabby', 'white'];

const BREEDABLE = [
  'horse', 'donkey', 'mule', 'sheep', 'cow', 'mooshroom', 'pig', 'chicken', 'wolf', 'ocelot', 'rabbit', 'llama', 'cat', 'turtle', 'fox',
  'panda', 'bee', 'hoglin', 'strider', 'goat', 'axolotl', 'frog', 'camel', 'sniffer', 'armadillo',
];
const FOODS = [
  'apple', 'mushroom_stew', 'bread', 'porkchop', 'cooked_porkchop', 'golden_apple', 'enchanted_golden_apple', 'cod', 'salmon',
  'tropical_fish', 'pufferfish', 'cooked_cod', 'cooked_salmon', 'cookie', 'melon_slice', 'beef', 'cooked_beef', 'chicken',
  'cooked_chicken', 'rotten_flesh', 'spider_eye', 'carrot', 'potato', 'baked_potato', 'poisonous_potato', 'golden_carrot',
  'pumpkin_pie', 'rabbit', 'cooked_rabbit', 'rabbit_stew', 'mutton', 'cooked_mutton', 'chorus_fruit', 'beetroot', 'beetroot_soup',
  'dried_kelp', 'suspicious_stew', 'sweet_berries', 'honey_bottle', 'glow_berries',
];
const NETHER_BIOMES = ['nether_wastes', 'soul_sand_valley', 'crimson_forest', 'warped_forest', 'basalt_deltas'];
const OVERWORLD_BIOMES = [
  'mushroom_fields', 'deep_frozen_ocean', 'frozen_ocean', 'deep_cold_ocean', 'cold_ocean', 'deep_ocean', 'ocean', 'deep_lukewarm_ocean',
  'lukewarm_ocean', 'warm_ocean', 'stony_shore', 'swamp', 'mangrove_swamp', 'snowy_slopes', 'snowy_plains', 'snowy_beach', 'windswept_gravelly_hills',
  'grove', 'windswept_hills', 'snowy_taiga', 'windswept_forest', 'taiga', 'plains', 'meadow', 'beach', 'forest', 'old_growth_spruce_taiga',
  'flower_forest', 'birch_forest', 'dark_forest', 'savanna_plateau', 'savanna', 'jungle', 'badlands', 'desert', 'wooded_badlands', 'jagged_peaks',
  'stony_peaks', 'frozen_river', 'river', 'ice_spikes', 'old_growth_pine_taiga', 'sunflower_plains', 'old_growth_birch_forest', 'sparse_jungle',
  'bamboo_jungle', 'eroded_badlands', 'windswept_savanna', 'cherry_grove', 'frozen_peaks', 'dripstone_caves', 'lush_caves', 'deep_dark',
];

/** (bastions) vanilla nether/loot_bastion's criteria: its four chests' loot tables */
const LOOT_BASTION = ['loot_bastion_other', 'loot_bastion_treasure', 'loot_bastion_hoglin_stable', 'loot_bastion_bridge'];

function each(names: string[], mk: (n: string) => Criterion): Record<string, Criterion> {
  const o: Record<string, Criterion> = {};
  for (const n of names) o[n] = mk(n);
  return o;
}

export const TABS: { root: string; background: string }[] = [
  { root: 'story/root', background: 'advancements_bg_stone' },
  { root: 'nether/root', background: 'advancements_bg_nether' },
  { root: 'end/root', background: 'advancements_bg_end' },
  { root: 'adventure/root', background: 'advancements_bg_adventure' },
  { root: 'husbandry/root', background: 'advancements_bg_husbandry' },
];

const A: AdvancementDef[] = [
  // --- Minecraft (story)
  { id: 'story/root', parent: null, title: GAME_NAME, description: 'The heart and story of the game', icon: 'grass_block', frame: 'task', toast: false, announce: false, criteria: { crafting_table: inv('crafting_table') } },
  { id: 'story/mine_stone', parent: 'story/root', title: 'Stone Age', description: 'Mine Stone with your new Pickaxe', icon: 'wooden_pickaxe', frame: 'task', criteria: { get_stone: inv('cobblestone', 'blackstone', 'cobbled_deepslate') } },
  { id: 'story/upgrade_tools', parent: 'story/mine_stone', title: 'Getting an Upgrade', description: 'Construct a better Pickaxe', icon: 'stone_pickaxe', frame: 'task', criteria: { stone_pickaxe: inv('stone_pickaxe') } },
  { id: 'story/smelt_iron', parent: 'story/upgrade_tools', title: 'Acquire Hardware', description: 'Smelt an Iron Ingot', icon: 'iron_ingot', frame: 'task', criteria: { iron: inv('iron_ingot') } },
  {
    id: 'story/obtain_armor', parent: 'story/smelt_iron', title: 'Suit Up', description: 'Protect yourself with a piece of iron armor', icon: 'iron_chestplate', frame: 'task',
    criteria: { iron_helmet: inv('iron_helmet'), iron_chestplate: inv('iron_chestplate'), iron_leggings: inv('iron_leggings'), iron_boots: inv('iron_boots') },
    requirements: [['iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots']],
  },
  { id: 'story/lava_bucket', parent: 'story/smelt_iron', title: 'Hot Stuff', description: 'Fill a Bucket with lava', icon: 'lava_bucket', frame: 'task', criteria: { lava_bucket: inv('lava_bucket') } },
  { id: 'story/iron_tools', parent: 'story/smelt_iron', title: "Isn't It Iron Pick", description: 'Upgrade your Pickaxe', icon: 'iron_pickaxe', frame: 'task', criteria: { iron_pickaxe: inv('iron_pickaxe') } },
  { id: 'story/deflect_arrow', parent: 'story/obtain_armor', title: 'Not Today, Thank You', description: 'Deflect a projectile with a Shield', icon: 'shield', frame: 'task', criteria: one({ t: 'deflected_projectile' }) },
  { id: 'story/form_obsidian', parent: 'story/lava_bucket', title: 'Ice Bucket Challenge', description: 'Obtain a block of Obsidian', icon: 'obsidian', frame: 'task', criteria: { obsidian: inv('obsidian') } },
  { id: 'story/mine_diamond', parent: 'story/iron_tools', title: 'Diamonds!', description: 'Acquire diamonds', icon: 'diamond', frame: 'task', criteria: { diamond: inv('diamond') } },
  { id: 'story/enter_the_nether', parent: 'story/form_obsidian', title: 'We Need to Go Deeper', description: 'Build, light and enter a Nether Portal', icon: 'flint_and_steel', frame: 'task', criteria: { entered_nether: toNether } },
  {
    id: 'story/shiny_gear', parent: 'story/mine_diamond', title: 'Cover Me with Diamonds', description: 'Diamond armor saves lives', icon: 'diamond_chestplate', frame: 'task',
    criteria: { diamond_helmet: inv('diamond_helmet'), diamond_chestplate: inv('diamond_chestplate'), diamond_leggings: inv('diamond_leggings'), diamond_boots: inv('diamond_boots') },
    requirements: [['diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots']],
  },
  { id: 'story/enchant_item', parent: 'story/mine_diamond', title: 'Enchanter', description: 'Enchant an item at an Enchanting Table', icon: 'enchanted_book', frame: 'task', criteria: { enchanted_item: { t: 'enchanted_item' } } },
  { id: 'story/cure_zombie_villager', parent: 'story/enter_the_nether', title: 'Zombie Doctor', description: 'Weaken and then cure a Zombie Villager', icon: 'golden_apple', frame: 'goal', criteria: one({ t: 'cured_zombie_villager' }) },
  { id: 'story/follow_ender_eye', parent: 'story/enter_the_nether', title: 'Eye Spy', description: 'Follow an Eye of Ender', icon: 'ender_eye', frame: 'task', criteria: { in_stronghold: { t: 'structure', structure: 'stronghold' } } },
  { id: 'story/enter_the_end', parent: 'story/follow_ender_eye', title: 'The End?', description: 'Enter the End Portal', icon: 'end_stone', frame: 'task', criteria: { entered_end: toEnd } },

  // --- Nether
  { id: 'nether/root', parent: null, title: 'Nether', description: 'Bring summer clothes', icon: 'red_nether_bricks', frame: 'task', toast: false, announce: false, criteria: { entered_nether: toNether } },
  { id: 'nether/return_to_sender', parent: 'nether/root', title: 'Return to Sender', description: 'Destroy a Ghast with a fireball', icon: 'fire_charge', frame: 'challenge', criteria: one({ t: 'return_to_sender' }) },
  { id: 'nether/find_bastion', parent: 'nether/root', title: 'Those Were the Days', description: 'Enter a Bastion Remnant', icon: 'polished_blackstone_bricks', frame: 'task', criteria: { bastion: { t: 'structure', structure: 'bastion_remnant' } } },
  { id: 'nether/obtain_ancient_debris', parent: 'nether/root', title: 'Hidden in the Depths', description: 'Obtain Ancient Debris', icon: 'ancient_debris', frame: 'task', criteria: { ancient_debris: inv('ancient_debris') } },
  { id: 'nether/fast_travel', parent: 'nether/root', title: 'Subspace Bubble', description: 'Use the Nether to travel 7 km in the Overworld', icon: 'map', frame: 'challenge', criteria: { travelled: { t: 'nether_travel', distance: 7000 } } },
  { id: 'nether/find_fortress', parent: 'nether/root', title: 'A Terrible Fortress', description: 'Break your way into a Nether Fortress', icon: 'nether_bricks', frame: 'task', criteria: { fortress: { t: 'structure', structure: 'fortress' } } },
  { id: 'nether/obtain_crying_obsidian', parent: 'nether/root', title: 'Who is Cutting Onions?', description: 'Obtain Crying Obsidian', icon: 'crying_obsidian', frame: 'task', criteria: { crying_obsidian: inv('crying_obsidian') } },
  { id: 'nether/distract_piglin', parent: 'nether/root', title: 'Oh Shiny', description: 'Distract Piglins with gold', icon: 'gold_ingot', frame: 'task', criteria: { distract_piglin: { t: 'distract_piglin', how: 'thrown' }, distract_piglin_directly: { t: 'distract_piglin', how: 'directly' } }, requirements: [['distract_piglin', 'distract_piglin_directly']] },
  { id: 'nether/ride_strider', parent: 'nether/root', title: 'This Boat Has Legs', description: 'Ride a Strider with a Warped Fungus on a Stick', icon: 'warped_fungus_on_a_stick', frame: 'task', criteria: { used_warped_fungus_on_a_stick: { t: 'item_durability', item: 'warped_fungus_on_a_stick', vehicle: 'strider' } } },
  { id: 'nether/uneasy_alliance', parent: 'nether/return_to_sender', title: 'Uneasy Alliance', description: 'Rescue a Ghast from the Nether, bring it safely home to the Overworld... and then kill it', icon: 'ghast_tear', frame: 'challenge', criteria: one(never) },
  // (bastions) vanilla: any of the four bastion chests' loot tables rolled for the player
  { id: 'nether/loot_bastion', parent: 'nether/find_bastion', title: 'War Pigs', description: 'Loot a Chest in a Bastion Remnant', icon: 'chest', frame: 'task', criteria: each(LOOT_BASTION, (n) => ({ t: 'container_loot', table: `chests/${n.slice(5)}` })), requirements: [LOOT_BASTION] },
  { id: 'nether/use_lodestone', parent: 'nether/obtain_ancient_debris', title: 'Country Lode, Take Me Home', description: 'Use a Compass on a Lodestone', icon: 'lodestone', frame: 'task', criteria: { use_lodestone: { t: 'item_used_on_block', items: ['compass'], blocks: ['lodestone'] } } },
  {
    id: 'nether/netherite_armor', parent: 'nether/obtain_ancient_debris', title: 'Cover Me in Debris', description: 'Get a full suit of Netherite armor', icon: 'netherite_chestplate', frame: 'challenge',
    criteria: { helmet: inv('netherite_helmet'), chestplate: inv('netherite_chestplate'), leggings: inv('netherite_leggings'), boots: inv('netherite_boots') },
  },
  { id: 'nether/get_wither_skull', parent: 'nether/find_fortress', title: 'Spooky Scary Skeleton', description: "Obtain a Wither Skeleton's skull", icon: 'wither_skeleton_skull', frame: 'task', criteria: { skull: inv('wither_skeleton_skull') } },
  { id: 'nether/obtain_blaze_rod', parent: 'nether/find_fortress', title: 'Into Fire', description: 'Relieve a Blaze of its rod', icon: 'blaze_rod', frame: 'task', criteria: { blaze_rod: inv('blaze_rod') } },
  { id: 'nether/charge_respawn_anchor', parent: 'nether/obtain_crying_obsidian', title: 'Not Quite "Nine" Lives', description: 'Charge a Respawn Anchor to the maximum', icon: 'respawn_anchor', frame: 'task', criteria: one(never) },
  { id: 'nether/ride_strider_in_overworld_lava', parent: 'nether/ride_strider', title: 'Feels Like Home', description: 'Take a Strider for a loooong ride on a lava lake in the Overworld', icon: 'warped_fungus_on_a_stick', frame: 'task', criteria: { ride_entity_distance: { t: 'ride_in_lava', vehicle: 'strider', distance: 50, dimension: 'overworld' } } },
  { id: 'nether/explore_nether', parent: 'nether/ride_strider', title: 'Hot Tourist Destinations', description: 'Explore all Nether biomes', icon: 'netherite_boots', frame: 'challenge', criteria: each(NETHER_BIOMES, (b) => ({ t: 'biome', biome: b })) },
  { id: 'nether/summon_wither', parent: 'nether/get_wither_skull', title: 'Withering Heights', description: 'Summon the Wither', icon: 'nether_star', frame: 'task', criteria: one(never) },
  { id: 'nether/brew_potion', parent: 'nether/obtain_blaze_rod', title: 'Local Brewery', description: 'Brew a Potion', icon: 'potion', frame: 'task', criteria: { potion: { t: 'brewed_potion' } } },
  { id: 'nether/create_beacon', parent: 'nether/summon_wither', title: 'Bring Home the Beacon', description: 'Construct and place a Beacon', icon: 'beacon', frame: 'task', criteria: one(never) },
  {
    id: 'nether/all_potions', parent: 'nether/brew_potion', title: 'A Furious Cocktail', description: 'Have every potion effect applied at the same time', icon: 'milk_bucket', frame: 'challenge',
    criteria: {
      all_effects: {
        t: 'effects_changed',
        effects: ['speed', 'slowness', 'strength', 'jump_boost', 'regeneration', 'fire_resistance', 'water_breathing', 'invisibility', 'night_vision', 'weakness', 'poison', 'slow_falling', 'resistance', 'oozing', 'infested', 'wind_charged', 'weaving'],
      },
    },
  },
  { id: 'nether/create_full_beacon', parent: 'nether/create_beacon', title: 'Beaconator', description: 'Bring a Beacon to full power', icon: 'beacon', frame: 'goal', criteria: one(never) },
  { id: 'nether/all_effects', parent: 'nether/all_potions', title: 'How Did We Get Here?', description: 'Have every effect applied at the same time', icon: 'bucket', frame: 'challenge', hidden: true, criteria: one(never) },

  // --- The End (end cities, their elytra and shulkers aren't in the game yet)
  { id: 'end/root', parent: null, title: 'The End', description: 'Or the beginning?', icon: 'end_stone', frame: 'task', toast: false, announce: false, criteria: { entered_end: toEnd } },
  { id: 'end/kill_dragon', parent: 'end/root', title: 'Free the End', description: 'Good luck', icon: 'dragon_head', frame: 'task', criteria: { killed_dragon: { t: 'kill', type: 'ender_dragon' } } },
  { id: 'end/dragon_egg', parent: 'end/kill_dragon', title: 'The Next Generation', description: 'Hold the Dragon Egg', icon: 'dragon_egg', frame: 'goal', criteria: { dragon_egg: inv('dragon_egg') } },
  { id: 'end/enter_end_gateway', parent: 'end/kill_dragon', title: 'Remote Getaway', description: 'Escape the island', icon: 'ender_pearl', frame: 'task', criteria: { entered_end_gateway: { t: 'enter_block', block: 'end_gateway' } } },
  { id: 'end/find_end_city', parent: 'end/enter_end_gateway', title: 'The City at the End of the Game', description: 'Go on in, what could happen?', icon: 'purpur_block', frame: 'task', criteria: { in_city: { t: 'structure', structure: 'end_city' } } },
  { id: 'end/elytra', parent: 'end/find_end_city', title: "Sky's the Limit", description: 'Find Elytra', icon: 'elytra', frame: 'goal', criteria: { elytra: inv('elytra') } },
  { id: 'end/levitate', parent: 'end/find_end_city', title: 'Great View From Up Here', description: 'Levitate up 50 blocks from the attacks of a Shulker', icon: 'shulker_shell', frame: 'challenge', criteria: { levitated: { t: 'levitation', minY: 50 } } },
  { id: 'end/respawn_dragon', parent: 'end/kill_dragon', title: 'The End... Again...', description: 'Respawn the Ender Dragon', icon: 'end_crystal', frame: 'goal', criteria: { summoned_dragon: { t: 'summoned_entity', entity: 'ender_dragon' } } },
  { id: 'end/dragon_breath', parent: 'end/kill_dragon', title: 'You Need a Mint', description: "Collect Dragon's Breath in a Glass Bottle", icon: 'dragon_breath', frame: 'goal', criteria: { dragon_breath: inv('dragon_breath') } },

  // --- Adventure
  {
    id: 'adventure/root', parent: null, title: 'Adventure', description: 'Adventure, exploration and combat', icon: 'map', frame: 'task', toast: false, announce: false,
    criteria: { killed_something: { t: 'kill', type: '*' }, killed_by_something: { t: 'killed_by' } }, requirements: [['killed_something', 'killed_by_something']],
  },
  { id: 'adventure/voluntary_exile', parent: 'adventure/root', title: 'Voluntary Exile', description: 'Kill a raid captain.\nMaybe consider staying away from villages for the time being...', icon: 'white_banner', frame: 'task', hidden: true, criteria: one({ t: 'killed_raid_captain' }) },
  { id: 'adventure/spyglass_at_parrot', parent: 'adventure/root', title: 'Is It a Bird?', description: 'Look at a Parrot through a Spyglass', icon: 'spyglass', frame: 'task', criteria: one(spyglassAt('parrot')) },
  { id: 'adventure/kill_a_mob', parent: 'adventure/root', title: 'Monster Hunter', description: 'Kill any hostile monster', icon: 'iron_sword', frame: 'task', criteria: each(HOSTILE, (n) => ({ t: 'kill', type: n })), requirements: [HOSTILE] },
  { id: 'adventure/read_power_of_chiseled_bookshelf', parent: 'adventure/root', title: 'The Power of Books', description: 'Read the power signal of a Chiseled Bookshelf using a Comparator', icon: 'chiseled_bookshelf', frame: 'task', criteria: one(never) },
  { id: 'adventure/trade', parent: 'adventure/root', title: 'What a Deal!', description: 'Successfully trade with a Villager', icon: 'emerald', frame: 'task', criteria: one({ t: 'villager_trade' }) },
  { id: 'adventure/trim_with_any_armor_pattern', parent: 'adventure/root', title: 'Crafting a New Look', description: 'Craft a trimmed armor at a Smithing Table', icon: 'dune_armor_trim_smithing_template', frame: 'task', criteria: one(never) },
  { id: 'adventure/honey_block_slide', parent: 'adventure/root', title: 'Sticky Situation', description: 'Jump into a Honey Block to break your fall', icon: 'honey_block', frame: 'task', criteria: { honey_block_slide: { t: 'slide_down_block', block: 'honey_block' } } },
  { id: 'adventure/ol_betsy', parent: 'adventure/root', title: "Ol' Betsy", description: 'Shoot a Crossbow', icon: 'crossbow', frame: 'task', criteria: one({ t: 'shot_crossbow' }) },
  { id: 'adventure/lightning_rod_with_villager_no_fire', parent: 'adventure/root', title: 'Surge Protector', description: 'Protect a Villager from an undesired shock without starting a fire', icon: 'lightning_rod', frame: 'task', criteria: { lightning_rod_with_villager_no_fire: { t: 'lightning_strike', maxDistance: 30, maxBlocksSetOnFire: 0, bystander: 'villager' } } },
  { id: 'adventure/fall_from_world_height', parent: 'adventure/root', title: 'Caves & Cliffs', description: 'Free fall from the top of the world (build limit) to the bottom of the world and survive', icon: 'water_bucket', frame: 'task', criteria: one({ t: 'fall_from_height' }) },
  { id: 'adventure/salvage_sherd', parent: 'adventure/root', title: 'Respecting the Remnants', description: 'Brush a Suspicious block to obtain a Pottery Sherd', icon: 'brush', frame: 'task', criteria: each(ARCHAEOLOGY_TABLES, (n) => ({ t: 'container_loot', table: `archaeology/${n}` })), requirements: [ARCHAEOLOGY_TABLES] },
  { id: 'adventure/avoid_vibration', parent: 'adventure/root', title: 'Sneak 100', description: 'Sneak near a Sculk Sensor or Warden to prevent it from detecting you', icon: 'sculk_sensor', frame: 'task', criteria: { avoid_vibration: { t: 'avoid_vibration' } } },
  { id: 'adventure/sleep_in_bed', parent: 'adventure/root', title: 'Sweet Dreams', description: 'Sleep in a Bed to change your respawn point', icon: 'red_bed', frame: 'task', criteria: one({ t: 'slept' }) },
  { id: 'adventure/minecraft_trials_edition', parent: 'adventure/root', title: `${GAME_NAME}: Trial(s) Edition`, description: 'Step foot in a Trial Chamber', icon: 'chiseled_tuff', frame: 'task', criteria: { minecraft_trials_edition: { t: 'structure', structure: 'trial_chambers' } } },
  { id: 'adventure/hero_of_the_village', parent: 'adventure/voluntary_exile', title: 'Hero of the Village', description: 'Successfully defend a village from a raid', icon: 'white_banner', frame: 'challenge', criteria: one({ t: 'raid_won' }) },
  { id: 'adventure/throw_trident', parent: 'adventure/kill_a_mob', title: 'A Throwaway Joke', description: 'Throw a Trident at something.\nNote: Throwing away your only weapon is not a good idea.', icon: 'trident', frame: 'task', criteria: one({ t: 'throw_trident' }) },
  { id: 'adventure/shoot_arrow', parent: 'adventure/kill_a_mob', title: 'Take Aim', description: 'Shoot something with an Arrow', icon: 'bow', frame: 'task', criteria: one({ t: 'shoot_arrow' }) },
  { id: 'adventure/kill_all_mobs', parent: 'adventure/kill_a_mob', title: 'Monsters Hunted', description: 'Kill one of every hostile monster', icon: 'diamond_sword', frame: 'challenge', criteria: each(HOSTILE, (n) => ({ t: 'kill', type: n })) },
  { id: 'adventure/kill_mob_near_sculk_catalyst', parent: 'adventure/kill_a_mob', title: 'It Spreads', description: 'Kill a mob near a Sculk Catalyst', icon: 'sculk_catalyst', frame: 'challenge', hidden: true, criteria: { kill_mob_near_sculk_catalyst: { t: 'kill_mob_near_sculk_catalyst' } } },
  { id: 'adventure/totem_of_undying', parent: 'adventure/kill_a_mob', title: 'Postmortal', description: 'Use a Totem of Undying to cheat death', icon: 'totem_of_undying', frame: 'goal', criteria: one({ t: 'used_totem' }) },
  { id: 'adventure/summon_iron_golem', parent: 'adventure/trade', title: 'Hired Help', description: 'Summon an Iron Golem to help defend a village', icon: 'carved_pumpkin', frame: 'goal', criteria: one({ t: 'summoned_entity', entity: 'iron_golem' }) },
  { id: 'adventure/trade_at_world_height', parent: 'adventure/trade', title: 'Star Trader', description: 'Trade with a Villager at the build height limit', icon: 'emerald', frame: 'task', criteria: one({ t: 'villager_trade', minY: 319 }) },
  { id: 'adventure/trim_with_all_exclusive_armor_patterns', parent: 'adventure/trim_with_any_armor_pattern', title: 'Smithing with Style', description: 'Apply these smithing templates at least once: Spire, Snout, Rib, Ward, Silence, Vex, Tide, Wayfinder', icon: 'silence_armor_trim_smithing_template', frame: 'challenge', criteria: one(never) },
  { id: 'adventure/two_birds_one_arrow', parent: 'adventure/ol_betsy', title: 'Two Birds, One Arrow', description: 'Kill two Phantoms with a piercing Arrow', icon: 'crossbow', frame: 'challenge', criteria: one({ t: 'killed_by_crossbow', victims: ['phantom', 'phantom'] }) },
  { id: 'adventure/whos_the_pillager_now', parent: 'adventure/ol_betsy', title: "Who's the Pillager Now?", description: 'Give a Pillager a taste of their own medicine', icon: 'crossbow', frame: 'task', criteria: one({ t: 'killed_by_crossbow', victims: ['pillager'] }) },
  { id: 'adventure/arbalistic', parent: 'adventure/ol_betsy', title: 'Arbalistic', description: 'Kill five unique mobs with one crossbow shot', icon: 'crossbow', frame: 'challenge', hidden: true, criteria: one({ t: 'killed_by_crossbow', uniqueTypes: 5 }) },
  { id: 'adventure/craft_decorated_pot_using_only_sherds', parent: 'adventure/salvage_sherd', title: 'Careful Restoration', description: 'Make a Decorated Pot out of 4 Pottery Sherds', icon: 'decorated_pot', frame: 'task', criteria: { pot_crafted_using_only_sherds: { t: 'recipe_crafted', recipe: 'decorated_pot', ingredients: Array(4).fill('#decorated_pot_sherds') } } },
  { id: 'adventure/adventuring_time', parent: 'adventure/sleep_in_bed', title: 'Adventuring Time', description: 'Discover every biome', icon: 'diamond_boots', frame: 'challenge', criteria: each(OVERWORLD_BIOMES, (b) => ({ t: 'biome', biome: b })) },
  { id: 'adventure/play_jukebox_in_meadows', parent: 'adventure/sleep_in_bed', title: 'Sound of Music', description: 'Make the Meadows come alive with the sound of music from a Jukebox', icon: 'jukebox', frame: 'task', criteria: { play_jukebox_in_meadows: { t: 'item_used_on_block', items: Object.keys(JUKEBOX_SONGS), blocks: ['jukebox'], biome: 'meadow' } } },
  { id: 'adventure/walk_on_powder_snow_with_leather_boots', parent: 'adventure/sleep_in_bed', title: 'Light as a Rabbit', description: 'Walk on Powder Snow... without sinking in it', icon: 'leather_boots', frame: 'task', criteria: one(never) },
  { id: 'adventure/under_lock_and_key', parent: 'adventure/minecraft_trials_edition', title: 'Under Lock and Key', description: 'Unlock a Vault with a Trial Key', icon: 'trial_key', frame: 'task', criteria: { under_lock_and_key: { t: 'item_used_on_block', items: ['trial_key'], blocks: ['vault'], state: { ominous: false } } } },
  { id: 'adventure/blowback', parent: 'adventure/minecraft_trials_edition', title: 'Blowback', description: 'Kill a Breeze with a deflected Breeze-shot Wind Charge', icon: 'wind_charge', frame: 'challenge', criteria: { blowback: { t: 'player_killed_entity', victim: 'breeze', direct: 'breeze_wind_charge' } } },
  { id: 'adventure/who_needs_rockets', parent: 'adventure/minecraft_trials_edition', title: 'Who Needs Rockets?', description: 'Use a Wind Charge to launch yourself upward 8 blocks', icon: 'wind_charge', frame: 'task', criteria: { who_needs_rockets: { t: 'fall_after_explosion', minRise: 7, cause: 'wind_charge' } } },
  { id: 'adventure/crafters_crafting_crafters', parent: 'adventure/minecraft_trials_edition', title: 'Crafters Crafting Crafters', description: 'Be near a Crafter when it crafts a Crafter', icon: 'crafter', frame: 'task', criteria: { crafter_crafted_crafter: { t: 'crafter_recipe_crafted', recipe: 'crafter' } } },
  { id: 'adventure/lighten_up', parent: 'adventure/minecraft_trials_edition', title: 'Lighten Up', description: 'Scrape a Copper Bulb with an Axe to make it brighter', icon: 'oxidized_copper_bulb', frame: 'task', criteria: { lighten_up: { t: 'item_used_on_block', items: AXES, blocks: ['oxidized_copper_bulb', 'weathered_copper_bulb', 'exposed_copper_bulb', 'waxed_oxidized_copper_bulb', 'waxed_weathered_copper_bulb', 'waxed_exposed_copper_bulb'] } } },
  { id: 'adventure/overoverkill', parent: 'adventure/minecraft_trials_edition', title: 'Over-Overkill', description: 'Deal 50 hearts of damage in a single hit using the Mace', icon: 'mace', frame: 'challenge', criteria: { overoverkill: { t: 'player_hurt_entity', minDealt: 100, source: 'maceSmash', weapon: 'mace' } } },
  { id: 'adventure/revaulting', parent: 'adventure/under_lock_and_key', title: 'Revaulting', description: 'Unlock an Ominous Vault with an Ominous Trial Key', icon: 'ominous_trial_key', frame: 'goal', criteria: { revaulting: { t: 'item_used_on_block', items: ['ominous_trial_key'], blocks: ['vault'], state: { ominous: true } } } },
  { id: 'adventure/spyglass_at_ghast', parent: 'adventure/spyglass_at_parrot', title: 'Is It a Balloon?', description: 'Look at a Ghast through a Spyglass', icon: 'spyglass', frame: 'task', criteria: one(spyglassAt('ghast')) },
  { id: 'adventure/very_very_frightening', parent: 'adventure/throw_trident', title: 'Very Very Frightening', description: 'Strike a Villager with lightning', icon: 'trident', frame: 'task', criteria: one({ t: 'channeled_lightning', victims: ['villager'] }) },
  { id: 'adventure/sniper_duel', parent: 'adventure/shoot_arrow', title: 'Sniper Duel', description: 'Kill a Skeleton from at least 50 meters away', icon: 'arrow', frame: 'challenge', criteria: one({ t: 'sniper' }) },
  { id: 'adventure/bullseye', parent: 'adventure/shoot_arrow', title: 'Bullseye', description: 'Hit the bullseye of a Target block from at least 30 meters away', icon: 'target', frame: 'challenge', criteria: one(never) },
  { id: 'adventure/spyglass_at_dragon', parent: 'adventure/spyglass_at_ghast', title: 'Is It a Plane?', description: 'Look at the Ender Dragon through a Spyglass', icon: 'spyglass', frame: 'task', criteria: one(spyglassAt('ender_dragon')) },

  // --- Husbandry
  { id: 'husbandry/root', parent: null, title: 'Husbandry', description: 'The world is full of friends and food', icon: 'hay_block', frame: 'task', toast: false, announce: false, criteria: { consumed_item: { t: 'consume', item: '*' } } },
  { id: 'husbandry/safely_harvest_honey', parent: 'husbandry/root', title: 'Bee Our Guest', description: 'Use a Campfire to collect Honey from a Beehive using a Glass Bottle without aggravating the Bees', icon: 'honey_bottle', frame: 'task', criteria: { safely_harvest_honey: { t: 'item_used_on_block', items: ['glass_bottle'], blocks: ['bee_nest', 'beehive'], smokey: true } } },
  { id: 'husbandry/breed_an_animal', parent: 'husbandry/root', title: 'The Parrots and the Bats', description: 'Breed two animals together', icon: 'wheat', frame: 'task', criteria: one({ t: 'breed', type: '*' }) },
  { id: 'husbandry/allay_deliver_item_to_player', parent: 'husbandry/root', title: "You've Got a Friend in Me", description: 'Have an Allay deliver items to you', icon: 'cookie', frame: 'task', criteria: one(never) },
  // (M8: goats) vanilla: started_riding, the player's vehicle a boat with a goat aboard
  { id: 'husbandry/ride_a_boat_with_a_goat', parent: 'husbandry/root', title: 'Whatever Floats Your Goat!', description: 'Get in a Boat and float with a Goat', icon: 'oak_boat', frame: 'task', criteria: one({ t: 'started_riding', vehicle: 'boat', passenger: 'goat' }) },
  { id: 'husbandry/tame_an_animal', parent: 'husbandry/root', title: 'Best Friends Forever', description: 'Tame an animal', icon: 'lead', frame: 'task', criteria: one({ t: 'tame', type: '*' }) },
  { id: 'husbandry/make_a_sign_glow', parent: 'husbandry/root', title: 'Glow and Behold!', description: 'Make the text of any kind of sign glow', icon: 'glow_ink_sac', frame: 'task', criteria: { make_a_sign_glow: { t: 'item_used_on_block', items: ['glow_ink_sac'], blocks: ALL_SIGNS } } },
  { id: 'husbandry/fishy_business', parent: 'husbandry/root', title: 'Fishy Business', description: 'Catch a fish', icon: 'fishing_rod', frame: 'task', criteria: one(never) },
  { id: 'husbandry/silk_touch_nest', parent: 'husbandry/root', title: 'Total Beelocation', description: 'Move a Bee Nest, with 3 Bees inside, using Silk Touch', icon: 'bee_nest', frame: 'task', criteria: { silk_touch_nest: { t: 'bee_nest_destroyed', block: 'bee_nest', silkTouch: true, bees: 3 } } },
  { id: 'husbandry/tadpole_in_a_bucket', parent: 'husbandry/root', title: 'Bukkit Bukkit', description: 'Catch a Tadpole in a Bucket', icon: 'tadpole_bucket', frame: 'task', criteria: one({ t: 'filled_bucket', items: ['tadpole_bucket'] }) },
  // (remaining mobs: the armadillo) vanilla 1.20.5's Isn't It Scute?: a brush used on an armadillo (it takes the click only when a scute comes off)
  { id: 'husbandry/brush_armadillo', parent: 'husbandry/root', title: "Isn't It Scute?", description: 'Get Armadillo Scutes from an Armadillo using a Brush', icon: 'armadillo_scute', frame: 'task',
    criteria: { brush_armadillo: { t: 'player_interacted_with_entity', item: 'brush', entity: 'armadillo' } } },
  { id: 'husbandry/obtain_sniffer_egg', parent: 'husbandry/root', title: 'Smells Interesting', description: 'Obtain a Sniffer Egg', icon: 'sniffer_egg', frame: 'task', criteria: one(never) },
  { id: 'husbandry/plant_seed', parent: 'husbandry/root', title: 'A Seedy Place', description: 'Plant a seed and watch it grow', icon: 'wheat_seeds', frame: 'task', criteria: { seeds: { t: 'place', blocks: ['wheat', 'pumpkin_stem', 'melon_stem', 'beetroots', 'nether_wart', 'torchflower_crop', 'pitcher_crop'] } } },
  { id: 'husbandry/wax_on', parent: 'husbandry/safely_harvest_honey', title: 'Wax On', description: 'Apply Honeycomb to a Copper block!', icon: 'honeycomb', frame: 'task', criteria: { wax_on: { t: 'item_used_on_block', items: ['honeycomb'], blocks: COPPER_BLOCKS } } },
  { id: 'husbandry/bred_all_animals', parent: 'husbandry/breed_an_animal', title: 'Two by Two', description: 'Breed all the animals!', icon: 'golden_carrot', frame: 'challenge', criteria: each(BREEDABLE, (n) => ({ t: 'breed', type: n })) },
  { id: 'husbandry/allay_deliver_cake_to_note_block', parent: 'husbandry/allay_deliver_item_to_player', title: 'Birthday Song', description: 'Have an Allay drop a Cake at a Note Block', icon: 'note_block', frame: 'task', criteria: one(never) },
  { id: 'husbandry/whole_pack', parent: 'husbandry/tame_an_animal', title: 'The Whole Pack', description: 'Tame one of each Wolf variant', icon: 'bone', frame: 'challenge', criteria: each(WOLF_VARIANT_IDS, (v) => ({ t: 'tame', type: 'wolf', variant: v })) },
  { id: 'husbandry/complete_catalogue', parent: 'husbandry/tame_an_animal', title: 'A Complete Catalogue', description: 'Tame all Cat variants!', icon: 'cod', frame: 'challenge', criteria: each(CAT_VARIANT_IDS, (v) => ({ t: 'tame', type: 'cat', variant: v })) },
  // (remaining mobs: the armadillo) vanilla VanillaHusbandryAdvancements: shears used on a wolf (only taking its armour off uses them)
  { id: 'husbandry/remove_wolf_armor', parent: 'husbandry/tame_an_animal', title: 'Shear Brilliance', description: 'Remove Wolf Armor from a Wolf using Shears', icon: 'shears', frame: 'task',
    criteria: { remove_wolf_armor: { t: 'player_interacted_with_entity', item: 'shears', entity: 'wolf' } } },
  { id: 'husbandry/tactical_fishing', parent: 'husbandry/fishy_business', title: 'Tactical Fishing', description: 'Catch a Fish... without a Fishing Rod!', icon: 'pufferfish_bucket', frame: 'task', criteria: one({ t: 'filled_bucket', items: ['cod_bucket', 'tropical_fish_bucket', 'pufferfish_bucket', 'salmon_bucket'] }) },
  { id: 'husbandry/leash_all_frog_variants', parent: 'husbandry/tadpole_in_a_bucket', title: 'When the Squad Hops into Town', description: 'Get each Frog variant on a Lead', icon: 'lead', frame: 'task',
    criteria: each(['temperate', 'warm', 'cold'], (v) => ({ t: 'player_interacted_with_entity', item: 'lead', entity: 'frog', variant: v })) },
  { id: 'husbandry/feed_snifflet', parent: 'husbandry/obtain_sniffer_egg', title: 'Little Sniffs', description: 'Feed a Snifflet', icon: 'torchflower_seeds', frame: 'task', criteria: one(never) },
  { id: 'husbandry/balanced_diet', parent: 'husbandry/plant_seed', title: 'A Balanced Diet', description: "Eat everything that is edible, even if it's not good for you", icon: 'apple', frame: 'challenge', criteria: each(FOODS, (f) => ({ t: 'consume', item: f })) },
  { id: 'husbandry/obtain_netherite_hoe', parent: 'husbandry/plant_seed', title: 'Serious Dedication', description: 'Use a Netherite Ingot to upgrade a Hoe, and then reevaluate your life choices', icon: 'netherite_hoe', frame: 'challenge', criteria: { netherite_hoe: inv('netherite_hoe') } },
  { id: 'husbandry/wax_off', parent: 'husbandry/wax_on', title: 'Wax Off', description: 'Scrape Wax off of a Copper block!', icon: 'stone_axe', frame: 'task', criteria: { wax_off: { t: 'item_used_on_block', items: AXES, blocks: WAXED_COPPER_BLOCKS } } },
  // (remaining mobs: the armadillo) a scute used on a wolf whose armour's then as good as new (damage 0)
  { id: 'husbandry/repair_wolf_armor', parent: 'husbandry/remove_wolf_armor', title: 'Good as New', description: 'Repair a damaged Wolf Armor using Armadillo Scutes', icon: 'wolf_armor', frame: 'task',
    criteria: { repair_wolf_armor: { t: 'player_interacted_with_entity', item: 'armadillo_scute', entity: 'wolf', bodyArmor: { item: 'wolf_armor', damage: 0 } } } },
  { id: 'husbandry/axolotl_in_a_bucket', parent: 'husbandry/tactical_fishing', title: 'The Cutest Predator', description: 'Catch an Axolotl in a Bucket', icon: 'axolotl_bucket', frame: 'task', criteria: one({ t: 'filled_bucket', items: ['axolotl_bucket'] }) },
  { id: 'husbandry/froglights', parent: 'husbandry/leash_all_frog_variants', title: 'With Our Powers Combined!', description: 'Have all Froglights in your inventory', icon: 'verdant_froglight', frame: 'challenge',
    criteria: { froglights: { t: 'inventory', items: ['ochre_froglight', 'pearlescent_froglight', 'verdant_froglight'], all: true } } },
  { id: 'husbandry/plant_any_sniffer_seed', parent: 'husbandry/feed_snifflet', title: 'Planting the Past', description: 'Plant any Sniffer seed', icon: 'pitcher_pod', frame: 'task', criteria: one(never) },
  { id: 'husbandry/kill_axolotl_target', parent: 'husbandry/axolotl_in_a_bucket', title: 'The Healing Power of Friendship!', description: 'Team up with an axolotl and win a fight', icon: 'tropical_fish_bucket', frame: 'goal', criteria: one({ t: 'effects_changed', effects: [], source: 'axolotl' }) },
];

export const ADVANCEMENTS = new Map<string, AdvancementDef>(A.map((a) => [a.id, a]));
export const CHILDREN = new Map<string, AdvancementDef[]>();
for (const a of A) if (a.parent) (CHILDREN.get(a.parent) ?? CHILDREN.set(a.parent, []).get(a.parent)!).push(a);

export function requirementsOf(a: AdvancementDef): string[][] {
  return a.requirements ?? Object.keys(a.criteria).map((k) => [k]);
}

export function rootOf(a: AdvancementDef): AdvancementDef {
  let r = a;
  while (r.parent) r = ADVANCEMENTS.get(r.parent)!;
  return r;
}

// ---------------------------------------------------------------------------
// layout (vanilla TreeNodePosition: a Walker/Buchheim tidy tree, depth = column)

class TreeNode {
  readonly children: TreeNode[] = [];
  ancestor: TreeNode = this;
  thread: TreeNode | null = null;
  x: number;
  y = -1;
  mod = 0;
  change = 0;
  shift = 0;

  constructor(readonly adv: AdvancementDef, readonly parent: TreeNode | null, readonly previousSibling: TreeNode | null, readonly childIndex: number, x: number) {
    this.x = x;
    let prev: TreeNode | null = null;
    for (const c of CHILDREN.get(adv.id) ?? []) {
      prev = new TreeNode(c, this, prev, this.children.length + 1, this.x + 1);
      this.children.push(prev);
    }
  }

  firstWalk(): void {
    if (!this.children.length) {
      this.y = this.previousSibling ? this.previousSibling.y + 1 : 0;
      return;
    }
    let defaultAncestor: TreeNode | null = null;
    for (const c of this.children) {
      c.firstWalk();
      defaultAncestor = c.apportion(defaultAncestor ?? c);
    }
    this.executeShifts();
    const mid = (this.children[0].y + this.children[this.children.length - 1].y) / 2;
    if (this.previousSibling) {
      this.y = this.previousSibling.y + 1;
      this.mod = this.y - mid;
    } else this.y = mid;
  }

  secondWalk(offsetY: number, column: number, top: number): number {
    this.y += offsetY;
    this.x = column;
    if (this.y < top) top = this.y;
    for (const c of this.children) top = c.secondWalk(offsetY + this.mod, column + 1, top);
    return top;
  }

  thirdWalk(y: number): void {
    this.y += y;
    for (const c of this.children) c.thirdWalk(y);
  }

  private executeShifts(): void {
    let shift = 0, change = 0;
    for (let i = this.children.length - 1; i >= 0; i--) {
      const c = this.children[i];
      c.y += shift;
      c.mod += shift;
      change += c.change;
      shift += c.shift + change;
    }
  }

  private previousOrThread(): TreeNode | null {
    return this.thread ?? (this.children.length ? this.children[0] : null);
  }

  private nextOrThread(): TreeNode | null {
    return this.thread ?? (this.children.length ? this.children[this.children.length - 1] : null);
  }

  apportion(node: TreeNode): TreeNode {
    if (!this.previousSibling) return node;
    let vir: TreeNode = this, vor: TreeNode = this;
    let vil: TreeNode = this.previousSibling;
    let vol: TreeNode = this.parent!.children[0];
    let sir = this.mod, sor = this.mod, sil = vil.mod, sol = vol.mod;
    while (vil.nextOrThread() && vir.previousOrThread()) {
      vil = vil.nextOrThread()!;
      vir = vir.previousOrThread()!;
      vol = vol.previousOrThread()!;
      vor = vor.nextOrThread()!;
      vor.ancestor = this;
      const shift = vil.y + sil - (vir.y + sir) + 1;
      if (shift > 0) {
        vil.getAncestor(this, node).moveSubtree(this, shift);
        sir += shift;
        sor += shift;
      }
      sil += vil.mod;
      sir += vir.mod;
      sol += vol.mod;
      sor += vor.mod;
    }
    if (vil.nextOrThread() && !vor.nextOrThread()) {
      vor.thread = vil.nextOrThread();
      vor.mod += sil - sor;
    } else {
      if (vir.previousOrThread() && !vol.previousOrThread()) {
        vol.thread = vir.previousOrThread();
        vol.mod += sir - sol;
      }
      node = this;
    }
    return node;
  }

  private moveSubtree(node: TreeNode, shift: number): void {
    const f = node.childIndex - this.childIndex;
    if (f !== 0) {
      node.change -= shift / f;
      this.change += shift / f;
    }
    node.shift += shift;
    node.y += shift;
    node.mod += shift;
  }

  private getAncestor(self: TreeNode, other: TreeNode): TreeNode {
    return this.ancestor && self.parent!.children.includes(this.ancestor) ? this.ancestor : other;
  }

  collect(out: Map<string, { x: number; y: number }>): void {
    out.set(this.adv.id, { x: this.x, y: this.y });
    for (const c of this.children) c.collect(out);
  }
}

/** advancement id → (column, row) as vanilla DisplayInfo.getX/getY */
export const POSITIONS = new Map<string, { x: number; y: number }>();
for (const tab of TABS) {
  const root = new TreeNode(ADVANCEMENTS.get(tab.root)!, null, null, 1, 0);
  root.firstWalk();
  const top = root.secondWalk(0, 0, root.y);
  if (top < 0) root.thirdWalk(-top);
  root.collect(POSITIONS);
}

// ---------------------------------------------------------------------------
// per-player progress (vanilla PlayerAdvancements)

export type AdvancementSave = Record<string, string[]>;

export interface TriggerPayload {
  inventory?: Set<string>;
  killed?: { type: string; hostile: boolean; distance: number; byArrow: boolean; byFireball?: boolean };
  place?: string;
  consume?: string;
  breed?: string;
  tame?: { type: string; variant?: string };
  biome?: string;
  /** the structures whose pieces the player stands in */
  structures?: string[];
  dimension?: { from: string; to: string };
  /** horizontal distance travelled through the Nether (vanilla NetherTravelTrigger) */
  netherTravel?: number;
  /** how far the player is, up or down, from where their Levitation took hold (levitation) */
  levitation?: { dy: number };
  /** the worn item and what the player rides (item_durability) */
  durability?: { item: string; vehicle: string | null };
  /** a ride across lava so far (ride_in_lava) */
  lavaRide?: { vehicle: string; distance: number; dimension: string };
  /** how a piglin was given gold (distract_piglin) */
  distract?: 'thrown' | 'directly';
  /** the types of everything one crossbow arrow has killed (killed_by_crossbow) */
  crossbowKills?: string[];
  /** what the player's channeled lightning struck (channeled_lightning) */
  channeled?: string[];
  /** where the player stood for a trade (villager_trade) */
  tradeY?: number;
  /** what the player built came to life (summoned_entity) */
  summoned?: string;
  /** a zombie villager the player cured (cured_zombie_villager) */
  cured?: boolean;
  /** the potion taken out of a brewing stand (brewed_potion) */
  potion?: string;
  /** the effects the player has now (effects_changed) */
  effects?: Set<string>;
  /** (Stage 5: ocean) the kind of what gave the player an effect just now (effects_changed's source) */
  effectSource?: string;
  /** the block the player stepped into (enter_block) */
  enteredBlock?: string;
  /** the loot table rolled for the player (container_loot) */
  lootTable?: string;
  /** a recipe whose result the player took, and the items in its grid (recipe_crafted) */
  crafted?: { recipe: string; ingredients: string[] };
  /** (Stage 5: ocean) the bucket the player just filled (filled_bucket) */
  filledBucket?: string;
  /** (M8: goats) what the player rides and all it carries, as someone got on (started_riding) */
  riding?: { vehicle: string | null; passengers: string[] };
  /**
   * (M9: frogs) the item the player used on a mob (as it was before), the mob's type and variant; (remaining mobs: the
   * armadillo) the body armour it wears after, and its wear (player_interacted_with_entity)
   */
  interacted?: { item: string | null; entity: string; variant?: string; bodyArmor?: { item: string; damage: number } | null };
  /** (trial chambers) the item the player used on a block (as it was before), the block and its properties (item_used_on_block) */
  usedOnBlock?: { item: string; block: string; props?: Record<string, string | number | boolean>; biome?: string; smokey?: boolean };
  /** (remaining mobs: the bee) the block the player slid down (slide_down_block) */
  slideDownBlock?: string;
  /** (remaining mobs: the bee) the hive the player broke, with silk touch or not, and the bees left inside (bee_nest_destroyed) */
  beeNestDestroyed?: { block: string; silkTouch: boolean; bees: number };
  /**
   * (trial chambers) a bolt as it went: how far from the player, how many blocks it set on fire, and the kinds of
   * whatever stood by it unharmed (lightning_strike)
   */
  lightning?: { distance: number; blocksSetOnFire: number; bystanders: string[] };
  /** (trial chambers) a mob the player killed and the projectile that did it (player_killed_entity) */
  killedWith?: { victim: string; direct: string };
  /**
   * (trial chambers) how far above where a burst threw them the player began to fall, and the kind of thing that went
   * off (fall_after_explosion)
   */
  fallAfterExplosion?: { rise: number; cause: string | null };
  /** (trial chambers) a blow from the player: its damage as dealt, its kind and what was in their hand (player_hurt_entity) */
  hurtEntity?: { dealt: number; source: string; weapon: string | null };
  /** (trial chambers) the recipe a crafter near the player crafted (crafter_recipe_crafted) */
  crafterCrafted?: { recipe: string };
  /** (spyglass) the item the player is using this tick, and the kind of what they look at, if anything (using_item) */
  usingItem?: { item: string; lookingAt: string | null };
}

export class PlayerAdvancements {
  /** advancement id → criteria obtained */
  readonly progress = new Map<string, Set<string>>();
  /** bumped whenever anything changes (screens refresh) */
  version = 0;
  onAward: ((a: AdvancementDef) => void) | null = null;

  isDone(a: AdvancementDef): boolean {
    const got = this.progress.get(a.id);
    if (!got) return false;
    return requirementsOf(a).every((req) => req.some((c) => got.has(c)));
  }

  /** vanilla AdvancementProgress.getPercent */
  percent(a: AdvancementDef): number {
    const reqs = requirementsOf(a);
    const got = this.progress.get(a.id);
    if (!got) return 0;
    return reqs.filter((req) => req.some((c) => got.has(c))).length / reqs.length;
  }

  /** vanilla getProgressText: "3/36" for multi-requirement advancements */
  progressText(a: AdvancementDef): string | null {
    const reqs = requirementsOf(a);
    if (reqs.length <= 1) return null;
    const got = this.progress.get(a.id);
    const n = got ? reqs.filter((req) => req.some((c) => got.has(c))).length : 0;
    return `${n}/${reqs.length}`;
  }

  grant(a: AdvancementDef, criterion: string): void {
    const wasDone = this.isDone(a);
    let got = this.progress.get(a.id);
    if (!got) this.progress.set(a.id, (got = new Set()));
    if (got.has(criterion)) return;
    got.add(criterion);
    this.version++;
    if (!wasDone && this.isDone(a)) this.onAward?.(a);
  }

  /** feed a trigger to every unfinished criterion of its type */
  trigger(type: Criterion['t'], p: TriggerPayload = {}): void {
    for (const a of ADVANCEMENTS.values()) {
      if (this.isDone(a)) continue;
      const got = this.progress.get(a.id);
      for (const [name, c] of Object.entries(a.criteria)) {
        if (c.t !== type || got?.has(name)) continue;
        if (matches(c, p)) this.grant(a, name);
      }
    }
  }

  /** vanilla AdvancementVisibilityEvaluator: done, or within two levels below something done */
  visible(): Set<string> {
    const out = new Set<string>();
    const walk = (a: AdvancementDef, stack: ('show' | 'hide' | 'none')[]): boolean => {
      const done = this.isDone(a);
      const rule = done ? 'show' : a.hidden ? 'hide' : 'none';
      stack.push(rule);
      let anyDone = done;
      for (const c of CHILDREN.get(a.id) ?? []) anyDone = walk(c, stack) || anyDone;
      let vis = anyDone;
      if (!vis)
        for (let i = 0; i <= 2 && i < stack.length; i++) {
          const r = stack[stack.length - 1 - i];
          if (r === 'show') {
            vis = true;
            break;
          }
          if (r === 'hide') break;
        }
      stack.pop();
      if (vis) out.add(a.id);
      return anyDone;
    };
    for (const t of TABS) walk(ADVANCEMENTS.get(t.root)!, []);
    return out;
  }

  save(): AdvancementSave {
    const o: AdvancementSave = {};
    for (const [id, s] of this.progress) if (s.size) o[id] = [...s];
    return o;
  }

  load(d: AdvancementSave | undefined): void {
    this.progress.clear();
    if (!d) return;
    for (const [id, list] of Object.entries(d)) if (ADVANCEMENTS.has(id)) this.progress.set(id, new Set(list));
    this.version++;
  }
}

function matches(c: Criterion, p: TriggerPayload): boolean {
  switch (c.t) {
    case 'inventory':
      // (M9: frogs: or every one of them)
      return !!p.inventory && (c.all ? c.items.every((i) => p.inventory!.has(i)) : c.items.some((i) => p.inventory!.has(i)));
    case 'kill':
      if (!p.killed) return false;
      return c.type === '*' || (c.type === 'hostile' ? p.killed.hostile : p.killed.type === c.type);
    case 'sniper':
      return !!p.killed && p.killed.type === 'skeleton' && p.killed.byArrow && p.killed.distance >= 50;
    case 'return_to_sender':
      return !!p.killed && p.killed.type === 'ghast' && !!p.killed.byFireball;
    case 'place':
      return !!p.place && c.blocks.includes(p.place);
    case 'consume':
      return !!p.consume && (c.item === '*' || c.item === p.consume);
    case 'breed':
      return !!p.breed && (c.type === '*' || c.type === p.breed);
    case 'tame':
      return !!p.tame && (c.type === '*' || c.type === p.tame.type) && (c.variant === undefined || c.variant === p.tame.variant);
    case 'biome':
      return p.biome === c.biome;
    case 'structure':
      return !!p.structures?.includes(c.structure);
    case 'item_durability':
      return p.durability?.item === c.item && p.durability.vehicle === c.vehicle;
    case 'distract_piglin':
      return p.distract === c.how;
    case 'ride_in_lava':
      return !!p.lavaRide && p.lavaRide.vehicle === c.vehicle && p.lavaRide.dimension === c.dimension && p.lavaRide.distance >= c.distance;
    case 'changed_dimension':
      return !!p.dimension && (!c.from || c.from === p.dimension.from) && (!c.to || c.to === p.dimension.to);
    case 'villager_trade':
      return p.tradeY !== undefined && (c.minY === undefined || p.tradeY >= c.minY);
    case 'summoned_entity':
      return p.summoned === c.entity;
    case 'cured_zombie_villager':
      return !!p.cured;
    case 'brewed_potion':
      return p.potion !== undefined;
    case 'effects_changed':
      return !!p.effects && c.effects.every((e) => p.effects!.has(e)) && (!c.source || p.effectSource === c.source);
    case 'enter_block':
      return p.enteredBlock === c.block;
    case 'container_loot':
      return p.lootTable === c.table;
    case 'recipe_crafted': {
      if (!p.crafted || p.crafted.recipe !== c.recipe) return false;
      // (vanilla RecipeCraftedTrigger: each ingredient takes the first of the grid's items it matches, each item once)
      const left = [...p.crafted.ingredients];
      return c.ingredients.every((ing) => {
        const i = left.findIndex((id) => (ing === '#decorated_pot_sherds' ? id.endsWith('_pottery_sherd') : id === ing));
        if (i >= 0) left.splice(i, 1);
        return i >= 0;
      });
    }
    case 'nether_travel':
      return p.netherTravel !== undefined && p.netherTravel >= c.distance;
    case 'levitation':
      return !!p.levitation && p.levitation.dy >= c.minY;
    case 'killed_by_crossbow': {
      // vanilla KilledByCrossbowTrigger.TriggerInstance.matches: each victim predicate takes its own kill
      const k = p.crossbowKills;
      if (!k) return false;
      if (c.uniqueTypes !== undefined && new Set(k).size < c.uniqueTypes) return false;
      const left = [...k];
      for (const v of c.victims ?? []) {
        const i = left.indexOf(v);
        if (i < 0) return false;
        left.splice(i, 1);
      }
      return true;
    }
    case 'channeled_lightning':
      return !!p.channeled && c.victims.every((v) => p.channeled!.includes(v));
    case 'killed_by':
    case 'slept':
    case 'throw_trident':
    case 'shoot_arrow':
    case 'shot_crossbow':
    case 'fall_from_height':
    case 'enchanted_item':
    case 'deflected_projectile':
    case 'used_totem':
    case 'killed_raid_captain':
    case 'raid_won':
    case 'avoid_vibration':
    case 'kill_mob_near_sculk_catalyst':
      return true;
    // (Stage 5: ocean)
    case 'filled_bucket':
      return !!p.filledBucket && c.items.includes(p.filledBucket);
    // (M8: goats)
    case 'started_riding':
      return !!p.riding && p.riding.vehicle === c.vehicle && p.riding.passengers.includes(c.passenger);
    // (M9: frogs)
    case 'player_interacted_with_entity':
      return (
        !!p.interacted && p.interacted.item === c.item && p.interacted.entity === c.entity && (c.variant === undefined || p.interacted.variant === c.variant) &&
        (c.bodyArmor === undefined || (p.interacted.bodyArmor?.item === c.bodyArmor.item && p.interacted.bodyArmor.damage === c.bodyArmor.damage))
      );
    // (trial chambers)
    case 'item_used_on_block':
      return !!p.usedOnBlock && c.items.includes(p.usedOnBlock.item) && c.blocks.includes(p.usedOnBlock.block) && (!c.state || Object.entries(c.state).every(([k, v]) => p.usedOnBlock!.props?.[k] === v)) && (!c.biome || p.usedOnBlock.biome === c.biome) && (c.smokey === undefined || !!p.usedOnBlock.smokey === c.smokey);
    // (remaining mobs: the bee)
    case 'slide_down_block':
      return p.slideDownBlock === c.block;
    case 'bee_nest_destroyed':
      return !!p.beeNestDestroyed && p.beeNestDestroyed.block === c.block && p.beeNestDestroyed.silkTouch === c.silkTouch && p.beeNestDestroyed.bees === c.bees;
    case 'lightning_strike':
      return !!p.lightning && p.lightning.distance <= c.maxDistance && p.lightning.blocksSetOnFire <= c.maxBlocksSetOnFire && p.lightning.bystanders.includes(c.bystander);
    case 'player_killed_entity':
      return !!p.killedWith && p.killedWith.victim === c.victim && p.killedWith.direct === c.direct;
    case 'fall_after_explosion':
      return !!p.fallAfterExplosion && p.fallAfterExplosion.rise >= c.minRise && p.fallAfterExplosion.cause === c.cause;
    case 'player_hurt_entity':
      return !!p.hurtEntity && p.hurtEntity.dealt >= c.minDealt && p.hurtEntity.source === c.source && p.hurtEntity.weapon === c.weapon;
    case 'crafter_recipe_crafted':
      return !!p.crafterCrafted && p.crafterCrafted.recipe === c.recipe;
    // (spyglass)
    case 'using_item':
      return !!p.usingItem && p.usingItem.item === c.item && (c.lookingAt === undefined || p.usingItem.lookingAt === c.lookingAt);
    default:
      return false;
  }
}

/** vanilla chat.type.advancement.* */
export function announcement(player: string, a: AdvancementDef): string {
  const name = `${a.frame === 'challenge' ? '§5' : '§a'}[${a.title}]§r`;
  if (a.frame === 'goal') return `${player} has reached the goal ${name}`;
  if (a.frame === 'challenge') return `${player} has completed the challenge ${name}`;
  return `${player} has made the advancement ${name}`;
}
