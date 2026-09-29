// Procedural item textures (16x16 hand-pixeled sprites in the style of the
// vanilla Java Edition item atlas). Every sprite is drawn in code; nothing is
// loaded from image files. Alpha is strictly 0 or 255.

import { TexImage } from './tex';
import { TOOL_ITEMS } from './itemlib/tools';
import { MATERIAL_ITEMS } from './itemlib/materials';
import { FOOD_ITEMS } from './itemlib/food';
import { MISC_ITEMS } from './itemlib/misc';
import { ARMOR_ITEMS } from './itemlib/armor';
import { DYE_ITEMS } from './itemlib/dyes';
import { VARIANT_ITEMS } from './itemlib/variants';
import { EXTRA_ITEMS } from './itemlib/extras';
import { ICON_ITEMS } from './itemlib/icons';
import { END_ITEMS } from './itemlib/end';
import { SMITHING_ITEMS } from './itemlib/smithing';
import { BANNER_ITEMS } from './itemlib/banners';
import { ARCHAEOLOGY_ITEMS } from './itemlib/archaeology';
import { SPAWN_EGG_TEXTURES } from './mobs';
// (Stage 4: illagers)
import { ILLAGER_ITEMS } from './itemlib/illagers';
// (Stage 5: ocean)
import { OCEAN_ITEMS } from './itemlib/ocean';
// (fireworks: the star's grey ball and the overlay its colours tint)
import { FIREWORK_ITEMS } from './fireworks';
// (the deep dark)
import { DEEP_DARK_ITEMS } from './itemlib/deepDark';
// (trial chambers: the copper doors, the breeze rod)
import { TRIAL_CHAMBER_ITEMS } from './itemlib/trialChambers';
// (bastions)
import { BASTION_ITEMS } from './itemlib/bastion';
// (signs) the hanging signs
import { SIGN_ITEMS } from './signs';
// (remaining mobs: the panda's bamboo)
import { REMAINING_MOB_ITEMS } from './itemlib/remainingMobs';

export const ITEM_TEXTURES: Record<string, () => TexImage> = {
  ...SPAWN_EGG_TEXTURES,
  ...TOOL_ITEMS,
  ...MATERIAL_ITEMS,
  ...FOOD_ITEMS,
  ...MISC_ITEMS,
  ...ARMOR_ITEMS,
  ...DYE_ITEMS,
  ...VARIANT_ITEMS,
  ...EXTRA_ITEMS,
  ...ICON_ITEMS,
  ...END_ITEMS,
  ...SMITHING_ITEMS,
  ...BANNER_ITEMS,
  ...ILLAGER_ITEMS,
  ...OCEAN_ITEMS,
  ...ARCHAEOLOGY_ITEMS,
  ...FIREWORK_ITEMS,
  ...DEEP_DARK_ITEMS,
  ...TRIAL_CHAMBER_ITEMS,
  ...BASTION_ITEMS,
  ...SIGN_ITEMS,
  ...REMAINING_MOB_ITEMS,
};
