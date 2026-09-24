// Boss bar sprites (vanilla gui/sprites/boss_bar/pink_background.png and pink_progress.png, 182x5): the ender
// dragon's bar. A lit top row, a shaded bottom one, darker ends and rounded corners; the background is the same
// bar dulled and darkened, the progress drawn over it from the left.

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

GUI_TEXTURES['boss_bar_pink_progress'] = () => bar([0xf78fdc, 0xec45c7, 0xe222b8, 0xd314a9, 0xa00d80], 0xb00f8d);
GUI_TEXTURES['boss_bar_pink_background'] = () => bar([0x6b2c5c, 0x57204a, 0x4f1c43, 0x47183c, 0x31102a], 0x3a1332);
