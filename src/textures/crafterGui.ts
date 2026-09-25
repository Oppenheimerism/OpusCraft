// The crafter's screen sprites (1.21; vanilla textures/gui/container/crafter.png and the sprites
// container/crafter/disabled_slot, powered_redstone and unpowered_redstone), my own drawings: the panel with its 3x3
// grid, a short arrow and the big slot of what it would make; a switched-off slot (a darker slot barred with a cross);
// and the redstone dust shown beside the grid, lit while it's powered.

import { GUI_TEXTURES, panel, slotAt, bigSlotAt, playerInventory, arrowMask, drawMask, inset } from './gui';
import { img, plot, type TexImage } from './tex';

const SLOT = 0x8b8b8b;

GUI_TEXTURES['container_crafter'] = () => {
  const t = panel(176, 166);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) slotAt(t, 26 + j * 18, 17 + i * 18);
  // (the redstone sprite goes at 97, 35; the arrow runs from it to the result)
  drawMask(t, 115, 36, arrowMask(12, 15, 5), SLOT);
  bigSlotAt(t, 134, 35);
  playerInventory(t, 84);
  return t;
};

/** a switched-off slot: sunk darker, crossed by two bars */
GUI_TEXTURES['crafter_disabled_slot'] = () => {
  const t = img(18, 18);
  inset(t, 0, 0, 18, 18, 0x6f6f6f);
  for (let i = 3; i <= 14; i++) {
    plot(t, i, i, 0x4a4a4a);
    plot(t, 17 - i, i, 0x4a4a4a);
    if (i < 14) {
      plot(t, i + 1, i, 0x3a3a3a);
      plot(t, 16 - i, i, 0x3a3a3a);
    }
  }
  return t;
};

/** a pinch of redstone dust, lit (bright red with a glint) or not (dark) */
function dust(lit: boolean): TexImage {
  const t = img(16, 16);
  const rows = ['......##........', '....#####...#...', '...########.....', '..##########....', '..###########...', '.#############..', '.#############..', '..############..', '..###########...', '...##########...', '....#######.....', '.#....####......', '...........#....'];
  const [hi, mid, lo] = lit ? [0xff8a70, 0xff2a14, 0xb3120a] : [0x6e2a22, 0x4d1410, 0x330c09];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== '#') return;
      const d = Math.hypot(x - 6.5, y - 5.5);
      plot(t, x, y + 2, d < 2.2 && x <= 7 && y <= 6 ? hi : d < 4.5 ? mid : lo);
    }),
  );
  return t;
}
GUI_TEXTURES['crafter_powered_redstone'] = () => dust(true);
GUI_TEXTURES['crafter_unpowered_redstone'] = () => dust(false);
