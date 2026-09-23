// Advancements (vanilla data/minecraft/advancements, PlayerAdvancements,
// AdvancementVisibilityEvaluator and TreeNodePosition): the story, adventure
// and husbandry trees with their criteria, per-player progress, which
// advancements are visible, and the layout of each tab.

export type FrameType = 'task' | 'goal' | 'challenge';

/** a criterion: a trigger type and the condition the trigger's payload must meet */
export type Criterion =
  | { t: 'inventory'; items: string[] }
  | { t: 'kill'; type: string | '*' | 'hostile' }
  | { t: 'killed_by' }
  | { t: 'slept' }
  | { t: 'place'; blocks: string[] }
  | { t: 'consume'; item: string | '*' }
  | { t: 'breed'; type: string | '*' }
  | { t: 'shoot_arrow' }
  | { t: 'biome'; biome: string }
  | { t: 'sniper' }
  | { t: 'fall_from_height' }
  | { t: 'enchanted_item' }
  | { t: 'changed_dimension'; from?: string; to?: string }
  | { t: 'nether_travel'; distance: number }
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
const one = (c: Criterion): Record<string, Criterion> => ({ c });
const toNether: Criterion = { t: 'changed_dimension', to: 'the_nether' };

const HOSTILE = [
  'blaze', 'bogged', 'breeze', 'cave_spider', 'creeper', 'drowned', 'elder_guardian', 'ender_dragon', 'enderman', 'endermite', 'evoker',
  'ghast', 'guardian', 'hoglin', 'husk', 'magma_cube', 'phantom', 'piglin', 'piglin_brute', 'pillager', 'ravager', 'shulker', 'silverfish',
  'skeleton', 'slime', 'spider', 'stray', 'vex', 'vindicator', 'witch', 'wither', 'wither_skeleton', 'zoglin', 'zombie', 'zombie_villager',
  'zombified_piglin',
];
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

function each(names: string[], mk: (n: string) => Criterion): Record<string, Criterion> {
  const o: Record<string, Criterion> = {};
  for (const n of names) o[n] = mk(n);
  return o;
}

export const TABS: { root: string; background: string }[] = [
  { root: 'story/root', background: 'advancements_bg_stone' },
  { root: 'nether/root', background: 'advancements_bg_nether' },
  { root: 'adventure/root', background: 'advancements_bg_adventure' },
  { root: 'husbandry/root', background: 'advancements_bg_husbandry' },
];

const A: AdvancementDef[] = [
  // --- Minecraft (story)
  { id: 'story/root', parent: null, title: 'Minecraft', description: 'The heart and story of the game', icon: 'grass_block', frame: 'task', toast: false, announce: false, criteria: { crafting_table: inv('crafting_table') } },
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
  { id: 'story/deflect_arrow', parent: 'story/obtain_armor', title: 'Not Today, Thank You', description: 'Deflect a projectile with a Shield', icon: 'shield', frame: 'task', criteria: one(never) },
  { id: 'story/form_obsidian', parent: 'story/lava_bucket', title: 'Ice Bucket Challenge', description: 'Obtain a block of Obsidian', icon: 'obsidian', frame: 'task', criteria: { obsidian: inv('obsidian') } },
  { id: 'story/mine_diamond', parent: 'story/iron_tools', title: 'Diamonds!', description: 'Acquire diamonds', icon: 'diamond', frame: 'task', criteria: { diamond: inv('diamond') } },
  { id: 'story/enter_the_nether', parent: 'story/form_obsidian', title: 'We Need to Go Deeper', description: 'Build, light and enter a Nether Portal', icon: 'flint_and_steel', frame: 'task', criteria: { entered_nether: toNether } },
  {
    id: 'story/shiny_gear', parent: 'story/mine_diamond', title: 'Cover Me with Diamonds', description: 'Diamond armor saves lives', icon: 'diamond_chestplate', frame: 'task',
    criteria: { diamond_helmet: inv('diamond_helmet'), diamond_chestplate: inv('diamond_chestplate'), diamond_leggings: inv('diamond_leggings'), diamond_boots: inv('diamond_boots') },
    requirements: [['diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots']],
  },
  { id: 'story/enchant_item', parent: 'story/mine_diamond', title: 'Enchanter', description: 'Enchant an item at an Enchanting Table', icon: 'enchanted_book', frame: 'task', criteria: { enchanted_item: { t: 'enchanted_item' } } },
  { id: 'story/cure_zombie_villager', parent: 'story/enter_the_nether', title: 'Zombie Doctor', description: 'Weaken and then cure a Zombie Villager', icon: 'golden_apple', frame: 'goal', criteria: one(never) },
  { id: 'story/follow_ender_eye', parent: 'story/enter_the_nether', title: 'Eye Spy', description: 'Follow an Eye of Ender', icon: 'ender_eye', frame: 'task', criteria: one(never) },
  { id: 'story/enter_the_end', parent: 'story/follow_ender_eye', title: 'The End?', description: 'Enter the End Portal', icon: 'end_stone', frame: 'task', criteria: one(never) },

  // --- Nether
  { id: 'nether/root', parent: null, title: 'Nether', description: 'Bring summer clothes', icon: 'red_nether_bricks', frame: 'task', toast: false, announce: false, criteria: { entered_nether: toNether } },
  { id: 'nether/return_to_sender', parent: 'nether/root', title: 'Return to Sender', description: 'Destroy a Ghast with a fireball', icon: 'fire_charge', frame: 'challenge', criteria: one(never) },
  { id: 'nether/find_bastion', parent: 'nether/root', title: 'Those Were the Days', description: 'Enter a Bastion Remnant', icon: 'polished_blackstone_bricks', frame: 'task', criteria: one(never) },
  { id: 'nether/obtain_ancient_debris', parent: 'nether/root', title: 'Hidden in the Depths', description: 'Obtain Ancient Debris', icon: 'ancient_debris', frame: 'task', criteria: { ancient_debris: inv('ancient_debris') } },
  { id: 'nether/fast_travel', parent: 'nether/root', title: 'Subspace Bubble', description: 'Use the Nether to travel 7 km in the Overworld', icon: 'map', frame: 'challenge', criteria: { travelled: { t: 'nether_travel', distance: 7000 } } },
  { id: 'nether/find_fortress', parent: 'nether/root', title: 'A Terrible Fortress', description: 'Break your way into a Nether Fortress', icon: 'nether_bricks', frame: 'task', criteria: one(never) },
  { id: 'nether/obtain_crying_obsidian', parent: 'nether/root', title: 'Who is Cutting Onions?', description: 'Obtain Crying Obsidian', icon: 'crying_obsidian', frame: 'task', criteria: { crying_obsidian: inv('crying_obsidian') } },
  { id: 'nether/distract_piglin', parent: 'nether/root', title: 'Oh Shiny', description: 'Distract Piglins with gold', icon: 'gold_ingot', frame: 'task', criteria: one(never) },
  { id: 'nether/ride_strider', parent: 'nether/root', title: 'This Boat Has Legs', description: 'Ride a Strider with a Warped Fungus on a Stick', icon: 'warped_fungus_on_a_stick', frame: 'task', criteria: one(never) },
  { id: 'nether/uneasy_alliance', parent: 'nether/return_to_sender', title: 'Uneasy Alliance', description: 'Rescue a Ghast from the Nether, bring it safely home to the Overworld... and then kill it', icon: 'ghast_tear', frame: 'challenge', criteria: one(never) },
  { id: 'nether/loot_bastion', parent: 'nether/find_bastion', title: 'War Pigs', description: 'Loot a Chest in a Bastion Remnant', icon: 'chest', frame: 'task', criteria: one(never) },
  { id: 'nether/use_lodestone', parent: 'nether/obtain_ancient_debris', title: 'Country Lode, Take Me Home', description: 'Use a Compass on a Lodestone', icon: 'lodestone', frame: 'task', criteria: one(never) },
  {
    id: 'nether/netherite_armor', parent: 'nether/obtain_ancient_debris', title: 'Cover Me in Debris', description: 'Get a full suit of Netherite armor', icon: 'netherite_chestplate', frame: 'challenge',
    criteria: { helmet: inv('netherite_helmet'), chestplate: inv('netherite_chestplate'), leggings: inv('netherite_leggings'), boots: inv('netherite_boots') },
  },
  { id: 'nether/get_wither_skull', parent: 'nether/find_fortress', title: 'Spooky Scary Skeleton', description: "Obtain a Wither Skeleton's skull", icon: 'wither_skeleton_skull', frame: 'task', criteria: { skull: inv('wither_skeleton_skull') } },
  { id: 'nether/obtain_blaze_rod', parent: 'nether/find_fortress', title: 'Into Fire', description: 'Relieve a Blaze of its rod', icon: 'blaze_rod', frame: 'task', criteria: { blaze_rod: inv('blaze_rod') } },
  { id: 'nether/charge_respawn_anchor', parent: 'nether/obtain_crying_obsidian', title: 'Not Quite "Nine" Lives', description: 'Charge a Respawn Anchor to the maximum', icon: 'respawn_anchor', frame: 'task', criteria: one(never) },
  { id: 'nether/ride_strider_in_overworld_lava', parent: 'nether/ride_strider', title: 'Feels Like Home', description: 'Take a Strider for a loooong ride on a lava lake in the Overworld', icon: 'warped_fungus_on_a_stick', frame: 'task', criteria: one(never) },
  { id: 'nether/explore_nether', parent: 'nether/ride_strider', title: 'Hot Tourist Destinations', description: 'Explore all Nether biomes', icon: 'netherite_boots', frame: 'challenge', criteria: each(NETHER_BIOMES, (b) => ({ t: 'biome', biome: b })) },
  { id: 'nether/summon_wither', parent: 'nether/get_wither_skull', title: 'Withering Heights', description: 'Summon the Wither', icon: 'nether_star', frame: 'task', criteria: one(never) },
  { id: 'nether/brew_potion', parent: 'nether/obtain_blaze_rod', title: 'Local Brewery', description: 'Brew a Potion', icon: 'potion', frame: 'task', criteria: one(never) },
  { id: 'nether/create_beacon', parent: 'nether/summon_wither', title: 'Bring Home the Beacon', description: 'Construct and place a Beacon', icon: 'beacon', frame: 'task', criteria: one(never) },
  { id: 'nether/all_potions', parent: 'nether/brew_potion', title: 'A Furious Cocktail', description: 'Have every potion effect applied at the same time', icon: 'milk_bucket', frame: 'challenge', criteria: one(never) },
  { id: 'nether/create_full_beacon', parent: 'nether/create_beacon', title: 'Beaconator', description: 'Bring a Beacon to full power', icon: 'beacon', frame: 'goal', criteria: one(never) },
  { id: 'nether/all_effects', parent: 'nether/all_potions', title: 'How Did We Get Here?', description: 'Have every effect applied at the same time', icon: 'bucket', frame: 'challenge', hidden: true, criteria: one(never) },

  // --- Adventure
  {
    id: 'adventure/root', parent: null, title: 'Adventure', description: 'Adventure, exploration and combat', icon: 'map', frame: 'task', toast: false, announce: false,
    criteria: { killed_something: { t: 'kill', type: '*' }, killed_by_something: { t: 'killed_by' } }, requirements: [['killed_something', 'killed_by_something']],
  },
  { id: 'adventure/voluntary_exile', parent: 'adventure/root', title: 'Voluntary Exile', description: 'Kill a raid captain.\nMaybe consider staying away from villages for the time being...', icon: 'white_banner', frame: 'task', hidden: true, criteria: one(never) },
  { id: 'adventure/spyglass_at_parrot', parent: 'adventure/root', title: 'Is It a Bird?', description: 'Look at a Parrot through a Spyglass', icon: 'spyglass', frame: 'task', criteria: one(never) },
  { id: 'adventure/kill_a_mob', parent: 'adventure/root', title: 'Monster Hunter', description: 'Kill any hostile monster', icon: 'iron_sword', frame: 'task', criteria: each(HOSTILE, (n) => ({ t: 'kill', type: n })), requirements: [HOSTILE] },
  { id: 'adventure/read_power_of_chiseled_bookshelf', parent: 'adventure/root', title: 'The Power of Books', description: 'Read the power signal of a Chiseled Bookshelf using a Comparator', icon: 'chiseled_bookshelf', frame: 'task', criteria: one(never) },
  { id: 'adventure/trade', parent: 'adventure/root', title: 'What a Deal!', description: 'Successfully trade with a Villager', icon: 'emerald', frame: 'task', criteria: one(never) },
  { id: 'adventure/trim_with_any_armor_pattern', parent: 'adventure/root', title: 'Crafting a New Look', description: 'Craft a trimmed armor at a Smithing Table', icon: 'dune_armor_trim_smithing_template', frame: 'task', criteria: one(never) },
  { id: 'adventure/honey_block_slide', parent: 'adventure/root', title: 'Sticky Situation', description: 'Jump into a Honey Block to break your fall', icon: 'honey_block', frame: 'task', criteria: one(never) },
  { id: 'adventure/ol_betsy', parent: 'adventure/root', title: "Ol' Betsy", description: 'Shoot a Crossbow', icon: 'crossbow', frame: 'task', criteria: one(never) },
  { id: 'adventure/lightning_rod_with_villager_no_fire', parent: 'adventure/root', title: 'Surge Protector', description: 'Protect a Villager from an undesired shock without starting a fire', icon: 'lightning_rod', frame: 'task', criteria: one(never) },
  { id: 'adventure/fall_from_world_height', parent: 'adventure/root', title: 'Caves & Cliffs', description: 'Free fall from the top of the world (build limit) to the bottom of the world and survive', icon: 'water_bucket', frame: 'task', criteria: one({ t: 'fall_from_height' }) },
  { id: 'adventure/salvage_sherd', parent: 'adventure/root', title: 'Respecting the Remnants', description: 'Brush a Suspicious block to obtain a Pottery Sherd', icon: 'brush', frame: 'task', criteria: one(never) },
  { id: 'adventure/avoid_vibration', parent: 'adventure/root', title: 'Sneak 100', description: 'Sneak near a Sculk Sensor or Warden to prevent it from detecting you', icon: 'sculk_sensor', frame: 'task', criteria: one(never) },
  { id: 'adventure/sleep_in_bed', parent: 'adventure/root', title: 'Sweet Dreams', description: 'Sleep in a Bed to change your respawn point', icon: 'red_bed', frame: 'task', criteria: one({ t: 'slept' }) },
  { id: 'adventure/minecraft_trials_edition', parent: 'adventure/root', title: 'Minecraft: Trial(s) Edition', description: 'Step foot in a Trial Chamber', icon: 'chiseled_tuff', frame: 'task', criteria: one(never) },
  { id: 'adventure/hero_of_the_village', parent: 'adventure/voluntary_exile', title: 'Hero of the Village', description: 'Successfully defend a village from a raid', icon: 'white_banner', frame: 'challenge', criteria: one(never) },
  { id: 'adventure/throw_trident', parent: 'adventure/kill_a_mob', title: 'A Throwaway Joke', description: 'Throw a Trident at something.\nNote: Throwing away your only weapon is not a good idea.', icon: 'trident', frame: 'task', criteria: one(never) },
  { id: 'adventure/shoot_arrow', parent: 'adventure/kill_a_mob', title: 'Take Aim', description: 'Shoot something with an Arrow', icon: 'bow', frame: 'task', criteria: one({ t: 'shoot_arrow' }) },
  { id: 'adventure/kill_all_mobs', parent: 'adventure/kill_a_mob', title: 'Monsters Hunted', description: 'Kill one of every hostile monster', icon: 'diamond_sword', frame: 'challenge', criteria: each(HOSTILE, (n) => ({ t: 'kill', type: n })) },
  { id: 'adventure/totem_of_undying', parent: 'adventure/kill_a_mob', title: 'Postmortal', description: 'Use a Totem of Undying to cheat death', icon: 'totem_of_undying', frame: 'goal', criteria: one(never) },
  { id: 'adventure/summon_iron_golem', parent: 'adventure/trade', title: 'Hired Help', description: 'Summon an Iron Golem to help defend a village', icon: 'carved_pumpkin', frame: 'goal', criteria: one(never) },
  { id: 'adventure/trade_at_world_height', parent: 'adventure/trade', title: 'Star Trader', description: 'Trade with a Villager at the build height limit', icon: 'emerald', frame: 'task', criteria: one(never) },
  { id: 'adventure/trim_with_all_exclusive_armor_patterns', parent: 'adventure/trim_with_any_armor_pattern', title: 'Smithing with Style', description: 'Apply these smithing templates at least once: Spire, Snout, Rib, Ward, Silence, Vex, Tide, Wayfinder', icon: 'silence_armor_trim_smithing_template', frame: 'challenge', criteria: one(never) },
  { id: 'adventure/two_birds_one_arrow', parent: 'adventure/ol_betsy', title: 'Two Birds, One Arrow', description: 'Kill two Phantoms with a piercing Arrow', icon: 'crossbow', frame: 'challenge', criteria: one(never) },
  { id: 'adventure/whos_the_pillager_now', parent: 'adventure/ol_betsy', title: "Who's the Pillager Now?", description: 'Give a Pillager a taste of their own medicine', icon: 'crossbow', frame: 'task', criteria: one(never) },
  { id: 'adventure/arbalistic', parent: 'adventure/ol_betsy', title: 'Arbalistic', description: 'Kill five unique mobs with one crossbow shot', icon: 'crossbow', frame: 'challenge', hidden: true, criteria: one(never) },
  { id: 'adventure/craft_decorated_pot_using_only_sherds', parent: 'adventure/salvage_sherd', title: 'Careful Restoration', description: 'Make a Decorated Pot out of 4 Pottery Sherds', icon: 'decorated_pot', frame: 'task', criteria: one(never) },
  { id: 'adventure/adventuring_time', parent: 'adventure/sleep_in_bed', title: 'Adventuring Time', description: 'Discover every biome', icon: 'diamond_boots', frame: 'challenge', criteria: each(OVERWORLD_BIOMES, (b) => ({ t: 'biome', biome: b })) },
  { id: 'adventure/play_jukebox_in_meadows', parent: 'adventure/sleep_in_bed', title: 'Sound of Music', description: 'Make the Meadows come alive with the sound of music from a Jukebox', icon: 'jukebox', frame: 'task', criteria: one(never) },
  { id: 'adventure/walk_on_powder_snow_with_leather_boots', parent: 'adventure/sleep_in_bed', title: 'Light as a Rabbit', description: 'Walk on Powder Snow... without sinking in it', icon: 'leather_boots', frame: 'task', criteria: one(never) },
  { id: 'adventure/under_lock_and_key', parent: 'adventure/minecraft_trials_edition', title: 'Under Lock and Key', description: 'Unlock a Vault with a Trial Key', icon: 'trial_key', frame: 'task', criteria: one(never) },
  { id: 'adventure/blowback', parent: 'adventure/minecraft_trials_edition', title: 'Blowback', description: 'Kill a Breeze with a deflected Breeze-shot Wind Charge', icon: 'wind_charge', frame: 'challenge', criteria: one(never) },
  { id: 'adventure/who_needs_rockets', parent: 'adventure/minecraft_trials_edition', title: 'Who Needs Rockets?', description: 'Use a Wind Charge to launch yourself upward 8 blocks', icon: 'wind_charge', frame: 'task', criteria: one(never) },
  { id: 'adventure/crafters_crafting_crafters', parent: 'adventure/minecraft_trials_edition', title: 'Crafters Crafting Crafters', description: 'Be near a Crafter when it crafts a Crafter', icon: 'crafter', frame: 'task', criteria: one(never) },
  { id: 'adventure/lighten_up', parent: 'adventure/minecraft_trials_edition', title: 'Lighten Up', description: 'Scrape a Copper Bulb with an Axe to make it brighter', icon: 'oxidized_copper_bulb', frame: 'task', criteria: one(never) },
  { id: 'adventure/overoverkill', parent: 'adventure/minecraft_trials_edition', title: 'Over-Overkill', description: 'Deal 50 hearts of damage in a single hit using the Mace', icon: 'mace', frame: 'challenge', criteria: one(never) },
  { id: 'adventure/revaulting', parent: 'adventure/under_lock_and_key', title: 'Revaulting', description: 'Unlock an Ominous Vault with an Ominous Trial Key', icon: 'ominous_trial_key', frame: 'goal', criteria: one(never) },
  { id: 'adventure/spyglass_at_ghast', parent: 'adventure/spyglass_at_parrot', title: 'Is It a Balloon?', description: 'Look at a Ghast through a Spyglass', icon: 'spyglass', frame: 'task', criteria: one(never) },
  { id: 'adventure/very_very_frightening', parent: 'adventure/throw_trident', title: 'Very Very Frightening', description: 'Strike a Villager with lightning', icon: 'trident', frame: 'task', criteria: one(never) },
  { id: 'adventure/sniper_duel', parent: 'adventure/shoot_arrow', title: 'Sniper Duel', description: 'Kill a Skeleton from at least 50 meters away', icon: 'arrow', frame: 'challenge', criteria: one({ t: 'sniper' }) },
  { id: 'adventure/bullseye', parent: 'adventure/shoot_arrow', title: 'Bullseye', description: 'Hit the bullseye of a Target block from at least 30 meters away', icon: 'target', frame: 'challenge', criteria: one(never) },
  { id: 'adventure/spyglass_at_dragon', parent: 'adventure/spyglass_at_ghast', title: 'Is It a Plane?', description: 'Look at the Ender Dragon through a Spyglass', icon: 'spyglass', frame: 'task', criteria: one(never) },

  // --- Husbandry
  { id: 'husbandry/root', parent: null, title: 'Husbandry', description: 'The world is full of friends and food', icon: 'hay_block', frame: 'task', toast: false, announce: false, criteria: { consumed_item: { t: 'consume', item: '*' } } },
  { id: 'husbandry/safely_harvest_honey', parent: 'husbandry/root', title: 'Bee Our Guest', description: 'Use a Campfire to collect Honey from a Beehive using a Glass Bottle without aggravating the Bees', icon: 'honey_bottle', frame: 'task', criteria: one(never) },
  { id: 'husbandry/breed_an_animal', parent: 'husbandry/root', title: 'The Parrots and the Bats', description: 'Breed two animals together', icon: 'wheat', frame: 'task', criteria: one({ t: 'breed', type: '*' }) },
  { id: 'husbandry/allay_deliver_item_to_player', parent: 'husbandry/root', title: "You've Got a Friend in Me", description: 'Have an Allay deliver items to you', icon: 'cookie', frame: 'task', criteria: one(never) },
  { id: 'husbandry/ride_a_boat_with_a_goat', parent: 'husbandry/root', title: 'Whatever Floats Your Goat!', description: 'Get in a Boat and float with a Goat', icon: 'oak_boat', frame: 'task', criteria: one(never) },
  { id: 'husbandry/tame_an_animal', parent: 'husbandry/root', title: 'Best Friends Forever', description: 'Tame an animal', icon: 'lead', frame: 'task', criteria: one(never) },
  { id: 'husbandry/make_a_sign_glow', parent: 'husbandry/root', title: 'Glow and Behold!', description: 'Make the text of any kind of sign glow', icon: 'glow_ink_sac', frame: 'task', criteria: one(never) },
  { id: 'husbandry/fishy_business', parent: 'husbandry/root', title: 'Fishy Business', description: 'Catch a fish', icon: 'fishing_rod', frame: 'task', criteria: one(never) },
  { id: 'husbandry/silk_touch_nest', parent: 'husbandry/root', title: 'Total Beelocation', description: 'Move a Bee Nest, with 3 Bees inside, using Silk Touch', icon: 'bee_nest', frame: 'task', criteria: one(never) },
  { id: 'husbandry/tadpole_in_a_bucket', parent: 'husbandry/root', title: 'Bukkit Bukkit', description: 'Catch a Tadpole in a Bucket', icon: 'tadpole_bucket', frame: 'task', criteria: one(never) },
  { id: 'husbandry/obtain_sniffer_egg', parent: 'husbandry/root', title: 'Smells Interesting', description: 'Obtain a Sniffer Egg', icon: 'sniffer_egg', frame: 'task', criteria: one(never) },
  { id: 'husbandry/plant_seed', parent: 'husbandry/root', title: 'A Seedy Place', description: 'Plant a seed and watch it grow', icon: 'wheat_seeds', frame: 'task', criteria: { seeds: { t: 'place', blocks: ['wheat', 'pumpkin_stem', 'melon_stem', 'beetroots', 'nether_wart', 'torchflower_crop', 'pitcher_crop'] } } },
  { id: 'husbandry/wax_on', parent: 'husbandry/safely_harvest_honey', title: 'Wax On', description: 'Apply Honeycomb to a Copper block!', icon: 'honeycomb', frame: 'task', criteria: one(never) },
  { id: 'husbandry/bred_all_animals', parent: 'husbandry/breed_an_animal', title: 'Two by Two', description: 'Breed all the animals!', icon: 'golden_carrot', frame: 'challenge', criteria: each(BREEDABLE, (n) => ({ t: 'breed', type: n })) },
  { id: 'husbandry/allay_deliver_cake_to_note_block', parent: 'husbandry/allay_deliver_item_to_player', title: 'Birthday Song', description: 'Have an Allay drop a Cake at a Note Block', icon: 'note_block', frame: 'task', criteria: one(never) },
  { id: 'husbandry/whole_pack', parent: 'husbandry/tame_an_animal', title: 'The Whole Pack', description: 'Tame one of each Wolf variant', icon: 'bone', frame: 'challenge', criteria: one(never) },
  { id: 'husbandry/complete_catalogue', parent: 'husbandry/tame_an_animal', title: 'A Complete Catalogue', description: 'Tame all Cat variants!', icon: 'cod', frame: 'challenge', criteria: one(never) },
  { id: 'husbandry/remove_wolf_armor', parent: 'husbandry/tame_an_animal', title: 'Shear Brilliance', description: 'Remove Wolf Armor from a Wolf using Shears', icon: 'shears', frame: 'task', criteria: one(never) },
  { id: 'husbandry/tactical_fishing', parent: 'husbandry/fishy_business', title: 'Tactical Fishing', description: 'Catch a Fish... without a Fishing Rod!', icon: 'pufferfish_bucket', frame: 'task', criteria: one(never) },
  { id: 'husbandry/leash_all_frog_variants', parent: 'husbandry/tadpole_in_a_bucket', title: 'When the Squad Hops into Town', description: 'Get each Frog variant on a Lead', icon: 'lead', frame: 'task', criteria: one(never) },
  { id: 'husbandry/feed_snifflet', parent: 'husbandry/obtain_sniffer_egg', title: 'Little Sniffs', description: 'Feed a Snifflet', icon: 'torchflower_seeds', frame: 'task', criteria: one(never) },
  { id: 'husbandry/balanced_diet', parent: 'husbandry/plant_seed', title: 'A Balanced Diet', description: "Eat everything that is edible, even if it's not good for you", icon: 'apple', frame: 'challenge', criteria: each(FOODS, (f) => ({ t: 'consume', item: f })) },
  { id: 'husbandry/obtain_netherite_hoe', parent: 'husbandry/plant_seed', title: 'Serious Dedication', description: 'Use a Netherite Ingot to upgrade a Hoe, and then reevaluate your life choices', icon: 'netherite_hoe', frame: 'challenge', criteria: { netherite_hoe: inv('netherite_hoe') } },
  { id: 'husbandry/wax_off', parent: 'husbandry/wax_on', title: 'Wax Off', description: 'Scrape Wax off of a Copper block!', icon: 'stone_axe', frame: 'task', criteria: one(never) },
  { id: 'husbandry/repair_wolf_armor', parent: 'husbandry/remove_wolf_armor', title: 'Good as New', description: 'Repair a damaged Wolf Armor using Armadillo Scutes', icon: 'wolf_armor', frame: 'task', criteria: one(never) },
  { id: 'husbandry/axolotl_in_a_bucket', parent: 'husbandry/tactical_fishing', title: 'The Cutest Predator', description: 'Catch an Axolotl in a Bucket', icon: 'axolotl_bucket', frame: 'task', criteria: one(never) },
  { id: 'husbandry/froglights', parent: 'husbandry/leash_all_frog_variants', title: 'With Our Powers Combined!', description: 'Have all Froglights in your inventory', icon: 'verdant_froglight', frame: 'challenge', criteria: one(never) },
  { id: 'husbandry/plant_any_sniffer_seed', parent: 'husbandry/feed_snifflet', title: 'Planting the Past', description: 'Plant any Sniffer seed', icon: 'pitcher_pod', frame: 'task', criteria: one(never) },
  { id: 'husbandry/kill_axolotl_target', parent: 'husbandry/axolotl_in_a_bucket', title: 'The Healing Power of Friendship!', description: 'Team up with an axolotl and win a fight', icon: 'tropical_fish_bucket', frame: 'goal', criteria: one(never) },
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
  killed?: { type: string; hostile: boolean; distance: number; byArrow: boolean };
  place?: string;
  consume?: string;
  breed?: string;
  biome?: string;
  dimension?: { from: string; to: string };
  /** horizontal distance travelled through the Nether (vanilla NetherTravelTrigger) */
  netherTravel?: number;
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
      return !!p.inventory && c.items.some((i) => p.inventory!.has(i));
    case 'kill':
      if (!p.killed) return false;
      return c.type === '*' || (c.type === 'hostile' ? p.killed.hostile : p.killed.type === c.type);
    case 'sniper':
      return !!p.killed && p.killed.type === 'skeleton' && p.killed.byArrow && p.killed.distance >= 50;
    case 'place':
      return !!p.place && c.blocks.includes(p.place);
    case 'consume':
      return !!p.consume && (c.item === '*' || c.item === p.consume);
    case 'breed':
      return !!p.breed && (c.type === '*' || c.type === p.breed);
    case 'biome':
      return p.biome === c.biome;
    case 'changed_dimension':
      return !!p.dimension && (!c.from || c.from === p.dimension.from) && (!c.to || c.to === p.dimension.to);
    case 'nether_travel':
      return p.netherTravel !== undefined && p.netherTravel >= c.distance;
    case 'killed_by':
    case 'slept':
    case 'shoot_arrow':
    case 'fall_from_height':
    case 'enchanted_item':
      return true;
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
