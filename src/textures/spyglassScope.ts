// (spyglass) The view through the spyglass (vanilla textures/misc/spyglass_scope; our own drawing): a round window,
// clear in the middle, darkening towards its edge as a lens does, ringed with the inside of the copper tube and black
// all round it. It's drawn over the screen, a square the screen's height (or width) across, while scoping
// (gui/spyglassOverlay.ts).

import { GUI_TEXTURES } from './gui';
import { img, plot, mixC } from './tex';

const S = 256;

GUI_TEXTURES['spyglass_scope'] = () => {
  const t = img(S, S);
  const smooth = (e0: number, e1: number, x: number) => {
    const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return u * u * (3 - 2 * u);
  };
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const r = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / (S / 2);
      if (r < 0.8) continue;
      if (r >= 0.97) {
        plot(t, x, y, 0x000000);
        continue;
      }
      // the lens's own darkening towards its rim, then the tube's inside: dark copper, lit a little from above
      const a = 0.35 * smooth(0.8, 0.9, r) + 0.65 * smooth(0.88, 0.94, r);
      const lit = Math.max(0, -(y + 0.5 - S / 2) / (S / 2)) * smooth(0.9, 0.95, r) * (1 - smooth(0.95, 0.97, r));
      plot(t, x, y, mixC(0x000000, 0x5a3218, lit * 0.8), Math.round(255 * Math.min(1, a)));
    }
  return t;
};
