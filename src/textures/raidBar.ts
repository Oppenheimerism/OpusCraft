// A raid's boss bar sprites (vanilla gui/sprites/boss_bar/red_background.png, red_progress.png and the
// notched_10_background / notched_10_progress overlays, 182x5): the red bar, lit on top and shaded below with
// darker, rounded ends as the dragon's pink one; the overlay cuts it into ten with a notch at each tenth.

import { TexImage, img, plot } from './tex';
import { GUI_TEXTURES } from './gui';

function bar(rows: number[], end: number): TexImage {
  const t = img(182, 5);
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 182; x++) {
      const edge = x === 0 || x === 181;
      if (edge && (y === 0 || y === 4)) continue; // rounded corners
      plot(t, x, y, edge ? end : rows[y]);
    }
  return t;
}

/** the notches: a dark mark across the bar at each tenth, shaded like the bar under it */
function notches(color: number, alpha: number): TexImage {
  const t = img(182, 5);
  for (let k = 1; k < 10; k++) {
    const x = Math.round((k * 182) / 10);
    for (let y = 1; y < 4; y++) plot(t, x, y, color, alpha);
  }
  return t;
}

GUI_TEXTURES['boss_bar_red_progress'] = () => bar([0xf88f8f, 0xec4545, 0xe22222, 0xd31414, 0xa00d0d], 0xb00f0f);
GUI_TEXTURES['boss_bar_red_background'] = () => bar([0x6b2c2c, 0x572020, 0x4f1c1c, 0x471818, 0x311010], 0x3a1313);
GUI_TEXTURES['boss_bar_notched_10_progress'] = () => notches(0x300000, 200);
GUI_TEXTURES['boss_bar_notched_10_background'] = () => notches(0x000000, 150);
