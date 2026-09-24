// Banner patterns (vanilla BannerPatterns, the banner_pattern registry and its tags): what each is called on a
// banner's tooltip, which ones the loom offers without a pattern item (#no_item_required, in its order), and the
// pattern items that unlock the rest (#pattern_item/*).

/** vanilla DyeColor, in its order (DyeColor.byId) */
export const BANNER_COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black',
] as const;

/** vanilla color.minecraft.* */
export const COLOR_NAMES: Record<string, string> = {
  white: 'White', orange: 'Orange', magenta: 'Magenta', light_blue: 'Light Blue', yellow: 'Yellow', lime: 'Lime', pink: 'Pink', gray: 'Gray',
  light_gray: 'Light Gray', cyan: 'Cyan', purple: 'Purple', blue: 'Blue', brown: 'Brown', green: 'Green', red: 'Red', black: 'Black',
};

/** vanilla block.minecraft.banner.<pattern>.<color> ("%s": the colour), in registry order */
export const BANNER_PATTERN_NAMES: Record<string, string> = {
  base: 'Fully %s Field',
  square_bottom_left: '%s Base Dexter Canton',
  square_bottom_right: '%s Base Sinister Canton',
  square_top_left: '%s Chief Dexter Canton',
  square_top_right: '%s Chief Sinister Canton',
  stripe_bottom: '%s Base',
  stripe_top: '%s Chief',
  stripe_left: '%s Pale Dexter',
  stripe_right: '%s Pale Sinister',
  stripe_center: '%s Pale',
  stripe_middle: '%s Fess',
  stripe_downright: '%s Bend',
  stripe_downleft: '%s Bend Sinister',
  small_stripes: '%s Paly',
  cross: '%s Saltire',
  straight_cross: '%s Cross',
  triangle_bottom: '%s Chevron',
  triangle_top: '%s Inverted Chevron',
  triangles_bottom: '%s Base Indented',
  triangles_top: '%s Chief Indented',
  diagonal_left: '%s Per Bend Sinister',
  diagonal_up_right: '%s Per Bend Sinister Inverted',
  diagonal_up_left: '%s Per Bend Inverted',
  diagonal_right: '%s Per Bend',
  circle: '%s Roundel',
  rhombus: '%s Lozenge',
  half_vertical: '%s Per Pale',
  half_horizontal: '%s Per Fess',
  half_vertical_right: '%s Per Pale Inverted',
  half_horizontal_bottom: '%s Per Fess Inverted',
  border: '%s Bordure',
  curly_border: '%s Bordure Indented',
  gradient: '%s Gradient',
  gradient_up: '%s Base Gradient',
  bricks: '%s Field Masoned',
  globe: '%s Globe',
  creeper: '%s Creeper Charge',
  skull: '%s Skull Charge',
  flower: '%s Flower Charge',
  mojang: '%s Thing',
  piglin: '%s Snout',
  flow: '%s Flow',
  guster: '%s Guster',
};

/** vanilla #no_item_required: the loom's patterns with no pattern item in, in the tag's order */
export const NO_ITEM_REQUIRED = [
  'square_bottom_left', 'square_bottom_right', 'square_top_left', 'square_top_right', 'stripe_bottom', 'stripe_top', 'stripe_left',
  'stripe_right', 'stripe_center', 'stripe_middle', 'stripe_downright', 'stripe_downleft', 'small_stripes', 'cross', 'straight_cross',
  'triangle_bottom', 'triangle_top', 'triangles_bottom', 'triangles_top', 'diagonal_left', 'diagonal_right', 'diagonal_up_left',
  'diagonal_up_right', 'circle', 'rhombus', 'half_vertical', 'half_horizontal', 'half_vertical_right', 'half_horizontal_bottom', 'border',
  'curly_border', 'gradient', 'gradient_up', 'bricks',
];

/** vanilla BannerPatternItem: each pattern item's #pattern_item tag (one pattern apiece), its description and rarity */
export const PATTERN_ITEMS: Record<string, { pattern: string; desc: string; rarity: 'common' | 'uncommon' | 'rare' | 'epic' }> = {
  flower_banner_pattern: { pattern: 'flower', desc: 'Flower Charge', rarity: 'common' },
  creeper_banner_pattern: { pattern: 'creeper', desc: 'Creeper Charge', rarity: 'uncommon' },
  skull_banner_pattern: { pattern: 'skull', desc: 'Skull Charge', rarity: 'uncommon' },
  mojang_banner_pattern: { pattern: 'mojang', desc: 'Thing', rarity: 'epic' },
  globe_banner_pattern: { pattern: 'globe', desc: 'Globe', rarity: 'common' },
  piglin_banner_pattern: { pattern: 'piglin', desc: 'Snout', rarity: 'uncommon' },
  flow_banner_pattern: { pattern: 'flow', desc: 'Flow', rarity: 'rare' },
  guster_banner_pattern: { pattern: 'guster', desc: 'Guster', rarity: 'rare' },
};

/** vanilla BannerPatternLayers.Layer.description: "Red Chevron" */
export function layerDescription(pattern: string, color: string): string {
  return (BANNER_PATTERN_NAMES[pattern] ?? '%s').replace('%s', COLOR_NAMES[color] ?? color);
}

/** a banner block's (or item's) colour from its name: white_banner, white_wall_banner → white */
export function bannerColorOf(name: string): string | null {
  const m = /^(.*?)_(?:wall_)?banner$/.exec(name);
  return m && (BANNER_COLORS as readonly string[]).includes(m[1]) ? m[1] : null;
}

/** vanilla LoomMenu: a banner takes six layers from the loom, no more */
export const MAX_LOOM_LAYERS = 6;
/** vanilla BannerRenderer: at most sixteen layers are drawn */
export const MAX_DRAWN_LAYERS = 16;
