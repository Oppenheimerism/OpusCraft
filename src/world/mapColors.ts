// Map colours (vanilla MapColor): the 62 colours a map can show, each in four brightnesses, and which colour every
// block state is on a map (vanilla BlockBehaviour.Properties.mapColor, per block in Blocks.java). A block's own
// `mapColor` setting (an rgb) wins when it is one of these; otherwise the table below, by name.

import { BLOCKS, STATE_VIEWS, stateCount, type StateView } from './block';

/** vanilla MapColor ids, in order, with their colours */
// prettier-ignore
export const MAP_COLORS: readonly number[] = [
  0x000000, 0x7fb238, 0xf7e9a3, 0xc7c7c7, 0xff0000, 0xa0a0ff, 0xa7a7a7, 0x007c00, 0xffffff, 0xa4a8b8,
  0x976d4d, 0x707070, 0x4040ff, 0x8f7748, 0xfffcf5, 0xd87f33, 0xb24cd8, 0x6699d8, 0xe5e533, 0x7fcc19,
  0xf27fa5, 0x4c4c4c, 0x999999, 0x4c7f99, 0x7f3fb2, 0x334cb2, 0x664c33, 0x667f33, 0x993333, 0x191919,
  0xfaee4d, 0x5cdbd5, 0x4a80ff, 0x00d93a, 0x815631, 0x700200, 0xd1b1a1, 0x9f5224, 0x95576c, 0x706c8a,
  0xba8524, 0x677535, 0xa04d4e, 0x392923, 0x876b62, 0x575c5c, 0x7a4958, 0x4c3e5c, 0x4c3223, 0x4c522a,
  0x8e3c2e, 0x251610, 0xbd3031, 0x943f61, 0x5c191d, 0x167e86, 0x3a8e8c, 0x562c3e, 0x14b485, 0x646464,
  0xd8af93, 0x7fa796,
];

// prettier-ignore
export const enum MapColor {
  NONE, GRASS, SAND, WOOL, FIRE, ICE, METAL, PLANT, SNOW, CLAY, DIRT, STONE, WATER, WOOD, QUARTZ, COLOR_ORANGE,
  COLOR_MAGENTA, COLOR_LIGHT_BLUE, COLOR_YELLOW, COLOR_LIGHT_GREEN, COLOR_PINK, COLOR_GRAY, COLOR_LIGHT_GRAY,
  COLOR_CYAN, COLOR_PURPLE, COLOR_BLUE, COLOR_BROWN, COLOR_GREEN, COLOR_RED, COLOR_BLACK, GOLD, DIAMOND, LAPIS,
  EMERALD, PODZOL, NETHER, TERRACOTTA_WHITE, TERRACOTTA_ORANGE, TERRACOTTA_MAGENTA, TERRACOTTA_LIGHT_BLUE,
  TERRACOTTA_YELLOW, TERRACOTTA_LIGHT_GREEN, TERRACOTTA_PINK, TERRACOTTA_GRAY, TERRACOTTA_LIGHT_GRAY,
  TERRACOTTA_CYAN, TERRACOTTA_PURPLE, TERRACOTTA_BLUE, TERRACOTTA_BROWN, TERRACOTTA_GREEN, TERRACOTTA_RED,
  TERRACOTTA_BLACK, CRIMSON_NYLIUM, CRIMSON_STEM, CRIMSON_HYPHAE, WARPED_NYLIUM, WARPED_STEM, WARPED_HYPHAE,
  WARPED_WART_BLOCK, DEEPSLATE, RAW_IRON, GLOW_LICHEN,
}

/** vanilla MapColor.Brightness: LOW, NORMAL, HIGH, LOWEST (the packed colour's low two bits) and their modifiers */
export const enum Brightness {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  LOWEST = 3,
}
const MODIFIERS = [180, 220, 255, 135];

/** vanilla MapColor.getPackedId: the byte a map stores for a colour at a brightness */
export function packedId(color: number, b: Brightness): number {
  return ((color << 2) | b) & 255;
}

/** vanilla MapColor.getColorFromPackedId, as 0xAARRGGBB (NONE is transparent) */
export function colorFromPackedId(packed: number): number {
  const id = (packed & 255) >> 2;
  if (id === MapColor.NONE || id >= MAP_COLORS.length) return 0;
  const c = MAP_COLORS[id], m = MODIFIERS[packed & 3];
  const r = Math.floor((((c >> 16) & 255) * m) / 255), g = Math.floor((((c >> 8) & 255) * m) / 255), b = Math.floor(((c & 255) * m) / 255);
  return (0xff000000 | (r << 16) | (g << 8) | b) >>> 0;
}

/** each packed colour as the four bytes r, g, b, a (read as a little-endian word) */
const RGBA_WORDS = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  const c = colorFromPackedId(i);
  RGBA_WORDS[i] = (((c >>> 24) << 24) | ((c & 255) << 16) | (((c >> 8) & 255) << 8) | ((c >> 16) & 255)) >>> 0;
}

/** a map's packed colours as RGBA pixels (vanilla MapRenderer.MapInstance.updateTexture) */
export function mapRGBA(colors: Uint8Array): Uint8Array<ArrayBuffer> {
  const px = new Uint32Array(colors.length);
  for (let i = 0; i < px.length; i++) px[i] = RGBA_WORDS[colors[i]];
  return new Uint8Array(px.buffer);
}

// ---------------------------------------------------------------------------
// Which colour each block is

/** vanilla DyeColor.getMapColor, in DyeColor order */
export const DYE_MAP_COLORS: Record<string, MapColor> = {
  white: MapColor.SNOW, orange: MapColor.COLOR_ORANGE, magenta: MapColor.COLOR_MAGENTA, light_blue: MapColor.COLOR_LIGHT_BLUE,
  yellow: MapColor.COLOR_YELLOW, lime: MapColor.COLOR_LIGHT_GREEN, pink: MapColor.COLOR_PINK, gray: MapColor.COLOR_GRAY,
  light_gray: MapColor.COLOR_LIGHT_GRAY, cyan: MapColor.COLOR_CYAN, purple: MapColor.COLOR_PURPLE, blue: MapColor.COLOR_BLUE,
  brown: MapColor.COLOR_BROWN, green: MapColor.COLOR_GREEN, red: MapColor.COLOR_RED, black: MapColor.COLOR_BLACK,
};
const DYES = Object.keys(DYE_MAP_COLORS);

/** each wood's planks (and so its slabs, stairs, fences, doors, signs and pressure plates) */
const WOOD_COLORS: Record<string, MapColor> = {
  oak: MapColor.WOOD, spruce: MapColor.PODZOL, birch: MapColor.SAND, jungle: MapColor.DIRT, acacia: MapColor.COLOR_ORANGE,
  dark_oak: MapColor.COLOR_BROWN, mangrove: MapColor.COLOR_RED, cherry: MapColor.TERRACOTTA_WHITE, bamboo: MapColor.COLOR_YELLOW,
  crimson: MapColor.CRIMSON_STEM, warped: MapColor.WARPED_STEM,
};

/** vanilla Blocks.log(top, side): the end grain when upright, the bark otherwise */
const LOGS: Record<string, [MapColor, MapColor]> = {
  oak_log: [MapColor.WOOD, MapColor.PODZOL],
  spruce_log: [MapColor.PODZOL, MapColor.COLOR_BROWN],
  birch_log: [MapColor.SAND, MapColor.QUARTZ],
  jungle_log: [MapColor.DIRT, MapColor.PODZOL],
  acacia_log: [MapColor.COLOR_ORANGE, MapColor.STONE],
  dark_oak_log: [MapColor.COLOR_BROWN, MapColor.COLOR_BROWN],
  mangrove_log: [MapColor.COLOR_RED, MapColor.PODZOL],
  cherry_log: [MapColor.TERRACOTTA_WHITE, MapColor.TERRACOTTA_GRAY],
  stripped_cherry_log: [MapColor.TERRACOTTA_WHITE, MapColor.TERRACOTTA_PINK],
  bamboo_block: [MapColor.COLOR_YELLOW, MapColor.PLANT],
};

// prettier-ignore
const BY_COLOR: [MapColor, string][] = [
  [MapColor.NONE, 'air cave_air void_air glass glass_pane torch wall_torch soul_torch soul_wall_torch redstone_torch redstone_wall_torch ' +
    'ladder rail powered_rail detector_rail activator_rail lever redstone_wire repeater comparator tripwire tripwire_hook iron_bars chain ' +
    'flower_pot nether_portal end_rod barrier light structure_void redstone_lamp skeleton_skull skeleton_wall_skull wither_skeleton_skull ' +
    'wither_skeleton_wall_skull zombie_head zombie_wall_head player_head player_wall_head creeper_head creeper_wall_head dragon_head ' +
    'dragon_wall_head piglin_head piglin_wall_head cake candle_cake'],
  [MapColor.GRASS, 'grass_block slime_block'],
  [MapColor.SAND, 'sand sandstone chiseled_sandstone cut_sandstone smooth_sandstone birch_wood stripped_birch_log stripped_birch_wood ' +
    'glowstone end_stone end_stone_bricks bone_block scaffolding turtle_egg candle ochre_froglight suspicious_sand'],
  [MapColor.WOOL, 'cobweb mushroom_stem white_candle'],
  [MapColor.FIRE, 'lava fire tnt redstone_block'],
  [MapColor.ICE, 'ice packed_ice blue_ice frosted_ice'],
  [MapColor.METAL, 'iron_block iron_door iron_trapdoor heavy_weighted_pressure_plate anvil chipped_anvil damaged_anvil grindstone ' +
    'brewing_stand lantern soul_lantern lodestone heavy_core'],
  [MapColor.PLANT, 'short_grass fern tall_grass large_fern dandelion poppy blue_orchid allium azure_bluet red_tulip orange_tulip ' +
    'white_tulip pink_tulip oxeye_daisy cornflower lily_of_the_valley wither_rose torchflower lilac rose_bush peony sunflower ' +
    'sugar_cane cactus lily_pad vine sweet_berry_bush wheat carrots potatoes beetroots pumpkin_stem attached_pumpkin_stem melon_stem ' +
    'attached_melon_stem cocoa azalea flowering_azalea spore_blossom cave_vines cave_vines_plant big_dripleaf big_dripleaf_stem ' +
    'small_dripleaf bamboo mangrove_propagule pink_petals pitcher_plant pitcher_crop torchflower_crop'],
  [MapColor.SNOW, 'snow snow_block powder_snow'],
  [MapColor.CLAY, 'clay infested_stone infested_cobblestone infested_stone_bricks infested_mossy_stone_bricks infested_cracked_stone_bricks ' +
    'infested_chiseled_stone_bricks'],
  [MapColor.DIRT, 'dirt coarse_dirt rooted_dirt farmland dirt_path granite polished_granite jungle_wood stripped_jungle_log ' +
    'stripped_jungle_wood jukebox hanging_roots packed_mud brown_mushroom_block'],
  [MapColor.STONE, 'stone cobblestone mossy_cobblestone stone_bricks mossy_stone_bricks cracked_stone_bricks chiseled_stone_bricks ' +
    'smooth_stone andesite polished_andesite gravel bedrock furnace dispenser dropper observer piston sticky_piston piston_head ' +
    'moving_piston hopper spawner cauldron water_cauldron lava_cauldron powder_snow_cauldron stonecutter smoker blast_furnace ' +
    'stone_pressure_plate ender_chest crafter trial_spawner vault suspicious_gravel coal_ore iron_ore copper_ore gold_ore redstone_ore ' +
    'lapis_ore diamond_ore emerald_ore'],
  [MapColor.WATER, 'water seagrass tall_seagrass kelp kelp_plant bubble_column frogspawn'],
  [MapColor.WOOD, 'oak_wood stripped_oak_log stripped_oak_wood crafting_table bookshelf chiseled_bookshelf chest trapped_chest ' +
    'note_block daylight_detector barrel composter lectern cartography_table fletching_table smithing_table loom beehive dead_bush ' +
    'bamboo_sapling petrified_oak_slab'],
  [MapColor.QUARTZ, 'diorite polished_diorite quartz_block chiseled_quartz_block quartz_pillar smooth_quartz quartz_bricks sea_lantern target'],
  [MapColor.COLOR_ORANGE, 'red_sand red_sandstone chiseled_red_sandstone cut_red_sandstone smooth_red_sandstone acacia_planks ' +
    'stripped_acacia_log stripped_acacia_wood pumpkin carved_pumpkin jack_o_lantern terracotta honey_block honeycomb_block ' +
    'raw_copper_block copper_block cut_copper chiseled_copper copper_grate copper_bulb copper_door copper_trapdoor lightning_rod ' +
    'waxed_copper_block waxed_cut_copper waxed_chiseled_copper waxed_copper_grate waxed_copper_bulb waxed_copper_door waxed_copper_trapdoor'],
  [MapColor.COLOR_MAGENTA, 'purpur_block purpur_pillar'],
  [MapColor.COLOR_LIGHT_BLUE, 'soul_fire'],
  [MapColor.COLOR_YELLOW, 'sponge wet_sponge hay_block bee_nest horn_coral_block horn_coral horn_coral_fan horn_coral_wall_fan ' +
    'bamboo_planks bamboo_mosaic stripped_bamboo_block'],
  [MapColor.COLOR_LIGHT_GREEN, 'melon'],
  [MapColor.COLOR_PINK, 'cherry_leaves cherry_sapling brain_coral_block brain_coral brain_coral_fan brain_coral_wall_fan pearlescent_froglight'],
  [MapColor.COLOR_GRAY, 'acacia_wood tinted_glass dead_tube_coral_block dead_brain_coral_block dead_bubble_coral_block ' +
    'dead_fire_coral_block dead_horn_coral_block dead_tube_coral dead_brain_coral dead_bubble_coral dead_fire_coral dead_horn_coral ' +
    'dead_tube_coral_fan dead_brain_coral_fan dead_bubble_coral_fan dead_fire_coral_fan dead_horn_coral_fan dead_tube_coral_wall_fan ' +
    'dead_brain_coral_wall_fan dead_bubble_coral_wall_fan dead_fire_coral_wall_fan dead_horn_coral_wall_fan'],
  [MapColor.COLOR_LIGHT_GRAY, 'structure_block jigsaw'],
  [MapColor.COLOR_CYAN, 'prismarine warped_fungus warped_roots nether_sprouts twisting_vines twisting_vines_plant sculk_sensor ' +
    'calibrated_sculk_sensor'],
  [MapColor.COLOR_PURPLE, 'mycelium amethyst_block budding_amethyst small_amethyst_bud medium_amethyst_bud large_amethyst_bud ' +
    'amethyst_cluster chorus_plant chorus_flower shulker_box bubble_coral_block bubble_coral bubble_coral_fan bubble_coral_wall_fan ' +
    'repeating_command_block'],
  [MapColor.COLOR_BLUE, 'tube_coral_block tube_coral tube_coral_fan tube_coral_wall_fan'],
  [MapColor.COLOR_BROWN, 'dark_oak_wood stripped_dark_oak_log stripped_dark_oak_wood brown_mushroom soul_sand soul_soil command_block'],
  [MapColor.COLOR_GREEN, 'moss_block moss_carpet dried_kelp_block sea_pickle end_portal_frame chain_command_block'],
  [MapColor.COLOR_RED, 'bricks red_mushroom red_mushroom_block nether_wart nether_wart_block shroomlight enchanting_table ' +
    'mangrove_wood stripped_mangrove_log stripped_mangrove_wood fire_coral_block fire_coral fire_coral_fan fire_coral_wall_fan sniffer_egg'],
  [MapColor.COLOR_BLACK, 'obsidian crying_obsidian coal_block basalt polished_basalt smooth_basalt blackstone polished_blackstone ' +
    'polished_blackstone_bricks cracked_polished_blackstone_bricks chiseled_polished_blackstone gilded_blackstone ancient_debris ' +
    'netherite_block respawn_anchor dragon_egg end_portal end_gateway sculk sculk_vein sculk_catalyst sculk_shrieker ' +
    'polished_blackstone_pressure_plate'],
  [MapColor.GOLD, 'gold_block raw_gold_block light_weighted_pressure_plate bell'],
  [MapColor.DIAMOND, 'diamond_block beacon prismarine_bricks dark_prismarine conduit'],
  [MapColor.LAPIS, 'lapis_block'],
  [MapColor.EMERALD, 'emerald_block'],
  [MapColor.PODZOL, 'podzol spruce_wood stripped_spruce_log stripped_spruce_wood campfire soul_campfire mangrove_roots muddy_mangrove_roots'],
  [MapColor.NETHER, 'netherrack nether_bricks red_nether_bricks cracked_nether_bricks chiseled_nether_bricks nether_quartz_ore ' +
    'nether_gold_ore magma_block crimson_fungus crimson_roots weeping_vines weeping_vines_plant'],
  [MapColor.TERRACOTTA_WHITE, 'calcite cherry_planks'],
  [MapColor.TERRACOTTA_GRAY, 'tuff polished_tuff chiseled_tuff tuff_bricks chiseled_tuff_bricks cherry_wood'],
  [MapColor.TERRACOTTA_LIGHT_GRAY, 'mud_bricks exposed_copper exposed_cut_copper exposed_chiseled_copper exposed_copper_grate ' +
    'exposed_copper_bulb exposed_copper_door exposed_copper_trapdoor waxed_exposed_copper waxed_exposed_cut_copper'],
  [MapColor.TERRACOTTA_CYAN, 'mud'],
  [MapColor.TERRACOTTA_PINK, 'stripped_cherry_wood'],
  [MapColor.TERRACOTTA_BROWN, 'dripstone_block pointed_dripstone'],
  [MapColor.TERRACOTTA_RED, 'decorated_pot'],
  [MapColor.CRIMSON_NYLIUM, 'crimson_nylium'],
  [MapColor.CRIMSON_STEM, 'crimson_stem stripped_crimson_stem'],
  [MapColor.CRIMSON_HYPHAE, 'crimson_hyphae stripped_crimson_hyphae'],
  [MapColor.WARPED_NYLIUM, 'warped_nylium oxidized_copper oxidized_cut_copper oxidized_chiseled_copper oxidized_copper_grate ' +
    'oxidized_copper_bulb oxidized_copper_door oxidized_copper_trapdoor waxed_oxidized_copper waxed_oxidized_cut_copper'],
  [MapColor.WARPED_STEM, 'warped_stem stripped_warped_stem weathered_copper weathered_cut_copper weathered_chiseled_copper ' +
    'weathered_copper_grate weathered_copper_bulb weathered_copper_door weathered_copper_trapdoor waxed_weathered_copper ' +
    'waxed_weathered_cut_copper'],
  [MapColor.WARPED_HYPHAE, 'warped_hyphae stripped_warped_hyphae'],
  [MapColor.WARPED_WART_BLOCK, 'warped_wart_block'],
  [MapColor.DEEPSLATE, 'deepslate cobbled_deepslate polished_deepslate deepslate_bricks deepslate_tiles cracked_deepslate_bricks ' +
    'cracked_deepslate_tiles chiseled_deepslate reinforced_deepslate infested_deepslate deepslate_coal_ore deepslate_iron_ore ' +
    'deepslate_copper_ore deepslate_gold_ore deepslate_redstone_ore deepslate_lapis_ore deepslate_diamond_ore deepslate_emerald_ore'],
  [MapColor.RAW_IRON, 'raw_iron_block'],
  [MapColor.GLOW_LICHEN, 'glow_lichen verdant_froglight'],
];

const NAMED = new Map<string, MapColor>();
for (const [c, names] of BY_COLOR) for (const n of names.split(' ')) NAMED.set(n, c);
// every wood's planks, and what's made from them
for (const [w, c] of Object.entries(WOOD_COLORS)) NAMED.set(`${w}_planks`, c);

const TERRACOTTA_BASE = MapColor.TERRACOTTA_WHITE;

type Rule = MapColor | ((v: StateView) => MapColor);

/** the colour rule for a block by its name (null: nothing known) */
function ruleFor(name: string): Rule | null {
  const log = LOGS[name];
  if (log) {
    const [top, side] = log;
    return (v) => (!v.has('axis') || v.get('axis') === 'y' ? top : side);
  }
  const named = NAMED.get(name);
  if (named !== undefined) return named;
  if (name.startsWith('potted_')) return MapColor.NONE;
  if (/_button$/.test(name) || /stained_glass_pane$/.test(name)) return MapColor.NONE;
  // (vanilla leaves(): the plant colour; cherry's are pink, above)
  if (/_leaves$/.test(name) || /_sapling$/.test(name)) return MapColor.PLANT;
  // the dyed blocks
  const dyed = /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_(.+)$/.exec(name);
  if (dyed) {
    const [, color, kind] = dyed;
    const c = DYE_MAP_COLORS[color];
    if (kind === 'terracotta') return (TERRACOTTA_BASE + DYES.indexOf(color)) as MapColor;
    // (vanilla BedBlock: the foot in the dye's colour, the pillow end white)
    if (kind === 'bed') return (v) => (v.has('part') && v.get('part') === 'head' ? MapColor.WOOL : c);
    if (kind === 'candle') return color === 'white' ? MapColor.WOOL : c;
    if (kind === 'candle_cake') return MapColor.NONE;
    if (kind === 'banner' || kind === 'wall_banner') return MapColor.WOOD;
    return c;
  }
  // a wood's things take its planks' colour (its signs, hanging signs, doors, trapdoors, fences, gates, plates, slabs, stairs)
  const wood = /^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|crimson|warped)_(sign|wall_sign|hanging_sign|wall_hanging_sign|door|trapdoor|fence|fence_gate|pressure_plate|slab|stairs|mosaic_slab|mosaic_stairs)$/.exec(name);
  if (wood) return WOOD_COLORS[wood[1]];
  // slabs, stairs and walls take their block's
  const part = /^(.+?)_(slab|stairs|wall|fence)$/.exec(name);
  if (part) {
    const b = part[1];
    for (const n of [b, `${b}s`, b.replace(/_brick$/, '_bricks'), b.replace(/_tile$/, '_tiles'), `${b}_block`, `${b}_planks`]) {
      const c = NAMED.get(n);
      if (c !== undefined) return c;
    }
  }
  return null;
}

let MAP_COLOR_OF: Uint8Array | null = null;

/** vanilla BlockState.getMapColor, for every state (built once the blocks are registered) */
function table(): Uint8Array {
  const n = stateCount();
  if (MAP_COLOR_OF && MAP_COLOR_OF.length === n) return MAP_COLOR_OF;
  const t = new Uint8Array(n);
  for (const b of BLOCKS) {
    const own = b.s.mapColor !== undefined ? MAP_COLORS.indexOf(b.s.mapColor) : -1;
    const rule: Rule = own > 0 ? (own as MapColor) : ruleFor(b.name) ?? fallback(b.name);
    for (let st = b.baseState; st < b.baseState + b.stateCount; st++) t[st] = typeof rule === 'function' ? rule(STATE_VIEWS[st]) : rule;
  }
  return (MAP_COLOR_OF = t);
}

/** a block the table doesn't know: stone, as vanilla's Properties.of() leaves it NONE only for see-through bits */
function fallback(name: string): MapColor {
  if (typeof console !== 'undefined') console.warn(`no map colour for ${name}`);
  return MapColor.STONE;
}

/** the map colour of a block state */
export function mapColorOf(state: number): MapColor {
  return table()[state] as MapColor;
}

/** (for checks) the block names the table has no colour for */
export function unmappedBlocks(): string[] {
  return BLOCKS.filter((b) => !(b.s.mapColor !== undefined && MAP_COLORS.indexOf(b.s.mapColor) > 0) && ruleFor(b.name) === null).map((b) => b.name);
}
