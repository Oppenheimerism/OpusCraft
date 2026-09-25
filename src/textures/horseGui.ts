// GUI sprites of a horse's inventory (vanilla textures/gui/container/horse.png and the container/horse sprites): the
// panel with the black box the horse stands in and the player's inventory; the chest's three rows of five, the
// saddle slot and the armour slot (drawn only where they apply), each empty one showing a faint shape of what goes in.

import { img } from './tex';
import { GUI_TEXTURES, panel, inset, slotAt, playerInventory, pat } from './gui';

const BLACK = 0x000000;
/** the faint shape in an empty slot */
const GHOST = 0x7a7a7a;

GUI_TEXTURES['container_horse'] = () => {
  const t = panel(176, 166);
  // (vanilla: the horse drawn in the 52 x 52 box from (26, 18))
  inset(t, 25, 17, 54, 54, BLACK);
  playerInventory(t, 84);
  return t;
};

/** a donkey's or mule's chest: three rows of five, drawn as wide as its columns (at 79, 17) */
GUI_TEXTURES['horse_chest_slots'] = () => {
  const t = img(90, 54);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) slotAt(t, 1 + c * 18, 1 + r * 18);
  return t;
};

GUI_TEXTURES['horse_saddle_slot'] = () => {
  const t = img(18, 18);
  slotAt(t, 1, 1);
  pat(t, 1, 1, [
    '................',
    '................',
    '................',
    '..#..........#..',
    '..##........##..',
    '..############..',
    '...##########...',
    '....########....',
    '.....######.....',
    '.....#....#.....',
    '.....#....#.....',
    '....###..###....',
    '................',
  ], { '#': GHOST });
  return t;
};

GUI_TEXTURES['horse_armor_slot'] = () => {
  const t = img(18, 18);
  slotAt(t, 1, 1);
  pat(t, 1, 1, [
    '................',
    '..........##....',
    '.........####...',
    '........######..',
    '.......#######..',
    '......######.##.',
    '.....######.....',
    '....######......',
    '...#######......',
    '..##########....',
    '..############..',
    '..############..',
    '..###......###..',
    '..##........##..',
    '................',
  ], { '#': GHOST });
  return t;
};
