// (the beacon) GUI sprites of the beacon's screen (vanilla container/beacon.png and the sprites in
// gui/sprites/container/beacon): the panel at vanilla's slot positions, each row of primary powers with a little
// stepped pyramid of its tiers beside it (one, two, three) and the secondary's four over its row, a dark strip the five
// payment items sit on, the payment slot, the player's inventory; the 22x22 power buttons (raised, lit up under the
// pointer, pressed in when chosen, dark when the beacon's tiers don't reach), and Done's green tick and Cancel's red
// cross.

import { TexImage, img, plot, rect } from './tex';
import { GUI_TEXTURES, panel, inset, slotAt, playerInventory } from './gui';

const G = GUI_TEXTURES;
const BLACK = 0x000000;
const WHITE = 0xffffff;

/** a pyramid of `tiers` (3 px a step) with the beacon on top, its bottom middle at (cx, by) */
function pyramid(t: TexImage, cx: number, by: number, tiers: number): void {
  const BLOCK = 0xdedede, EDGE = 0x5a5a5a, SHADE = 0xa9a9a9;
  for (let i = tiers; i >= 1; i--) {
    const w = (2 * i + 1) * 3, x0 = cx - Math.floor(w / 2), y0 = by - 3 * (tiers - i + 1);
    rect(t, x0, y0, w, 3, BLOCK);
    for (let x = x0; x < x0 + w; x++) plot(t, x, y0 + 2, SHADE);
    for (let y = y0; y < y0 + 3; y++) {
      plot(t, x0, y, EDGE);
      plot(t, x0 + w - 1, y, EDGE);
    }
  }
  // the beacon on top, aqua with a white heart
  const y0 = by - 3 * (tiers + 1);
  rect(t, cx - 1, y0, 3, 3, 0x6fe8e0);
  plot(t, cx, y0 + 1, WHITE);
  plot(t, cx - 1, y0 + 2, 0x2f9c96);
  plot(t, cx + 1, y0 + 2, 0x2f9c96);
}

G['container_beacon'] = () => {
  const t = panel(230, 219);
  // the primary powers' rows (buttons at y 22, 47, 72), each with its pyramid beside it
  for (let i = 0; i < 3; i++) pyramid(t, 26, 22 + i * 25 + 18, i + 1);
  // the secondary's four tiers over its buttons (at y 47)
  pyramid(t, 167, 42, 4);
  // the strip the payment items are drawn on (at x 20, 41, 63, 86, 108; y 109), and the payment slot
  inset(t, 15, 104, 114, 26, 0x6b6b6b);
  slotAt(t, 136, 110);
  playerInventory(t, 137, 36);
  return t;
};

/** a 22x22 power button: an outline round a bevelled face (`pressed` turns the bevel in) */
function button(face: number, hi: number, lo: number, outline: number, pressed = false): TexImage {
  const t = img(22, 22);
  for (let y = 0; y < 22; y++)
    for (let x = 0; x < 22; x++) {
      let c = face;
      if (x === 0 || y === 0 || x === 21 || y === 21) c = outline;
      else if (x <= 1 || y <= 1) c = pressed ? lo : hi;
      else if (x >= 20 || y >= 20) c = pressed ? hi : lo;
      plot(t, x, y, c);
    }
  return t;
}
G['beacon_button'] = () => button(0x8b8b8b, 0xc6c6c6, 0x4f4f4f, BLACK);
G['beacon_button_highlighted'] = () => button(0x9aa8c8, 0xdfe6ff, 0x55607e, WHITE);
G['beacon_button_selected'] = () => button(0x5c7a5c, 0x34482f, 0x9ec493, BLACK, true);
G['beacon_button_disabled'] = () => button(0x3d3d3d, 0x5a5a5a, 0x262626, 0x1a1a1a);

/** Done: a green tick */
G['beacon_confirm'] = () => {
  const t = img(18, 18);
  const pts: [number, number][] = [];
  for (let i = 0; i < 5; i++) pts.push([3 + i, 9 + i]);
  for (let i = 0; i < 9; i++) pts.push([7 + i, 13 - i]);
  for (const [x, y] of pts) {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) plot(t, x + dx, y + dy, 0x3f9e2b);
    plot(t, x, y, 0x6fdc4f);
  }
  return t;
};

/** Cancel: a red cross */
G['beacon_cancel'] = () => {
  const t = img(18, 18);
  for (let i = 0; i < 11; i++) {
    for (const [x, y] of [[3 + i, 3 + i], [13 - i, 3 + i]]) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) plot(t, x + dx, y + dy, 0x9e2b2b);
      plot(t, x, y, 0xe05050);
    }
  }
  return t;
};
