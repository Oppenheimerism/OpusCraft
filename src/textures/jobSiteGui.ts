// GUI sprites of the job sites' screens (vanilla container/stonecutter.png and the sprites in
// gui/sprites/container/stonecutter): backgrounds at vanilla slot positions, the recipe buttons and scrollers.

import { TexImage, img, plot } from './tex';
import { GUI_TEXTURES, panel, inset, slotAt, bigSlotAt, playerInventory } from './gui';

const G = GUI_TEXTURES;
const WHITE = 0xffffff;

interface Bevel {
  face: number;
  /** top and left edges */
  hi: number;
  /** bottom and right edges */
  lo: number;
}

/** a w×h button face with a one-pixel bevel */
function bevelled(w: number, h: number, s: Bevel): TexImage {
  const t = img(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let c = s.face;
      if (x === 0 || y === 0) c = s.hi;
      if (x === w - 1 || y === h - 1) c = s.lo;
      if ((x === 0 && y === h - 1) || (x === w - 1 && y === 0)) c = s.face;
      plot(t, x, y, c);
    }
  return t;
}

// ---------------------------------------------------------------------------
// Stonecutter

G['container_stonecutter'] = () => {
  const t = panel(176, 166);
  slotAt(t, 20, 33); // input
  bigSlotAt(t, 143, 33); // result
  inset(t, 51, 14, 66, 56); // the recipe grid, 4 × 3 buttons of 16 × 18 from (52, 15)
  inset(t, 118, 14, 14, 58); // the scroller's track (12 × 15 at 119, 15..56)
  playerInventory(t, 84);
  return t;
};
G['stonecutter_recipe'] = () => bevelled(16, 18, { face: 0xc6c6c6, hi: WHITE, lo: 0x555555 });
G['stonecutter_recipe_highlighted'] = () => bevelled(16, 18, { face: 0xdcdcf0, hi: WHITE, lo: 0x7a7a9a });
G['stonecutter_recipe_selected'] = () => bevelled(16, 18, { face: 0x7f7f7f, hi: 0x373737, lo: WHITE });
G['stonecutter_scroller'] = () => G['scroller']();
G['stonecutter_scroller_disabled'] = () => G['scroller_disabled']();
