// Banner items' flat sprites and the banner pattern's. A banner in vanilla is drawn by its block entity renderer
// wherever it's an item (render/bannerRenderer.ts does that here, patterns and all); these flat ones stand in only
// where no renderer is at hand (the advancement icons use the white one). They are the white banner's sprite with its
// cloth dyed. The pattern items all share one sprite in 1.21 (item/banner_pattern: a sheet with a charge drawn on it).

import { getA, getPx, plot, mulC, rgbOf, cloneImg } from '../tex';
import { Gen, spr } from './common';
import { ICON_ITEMS } from './icons';
import { DYE } from '../dyes';

export const BANNER_ITEMS: Record<string, Gen> = {};

/** the white banner's cloth colours (itemlib/icons.ts): shade, lit face, face and its grey outline */
const CLOTH = new Set([0xdedede, 0xf4f4f4, 0xc2c2c2, 0x6a6a6a]);

for (const c of Object.keys(DYE)) {
  if (c === 'white') continue;
  BANNER_ITEMS[`${c}_banner`] = () => {
    const t = cloneImg(ICON_ITEMS['white_banner']());
    const [dr, dg, db] = rgbOf(DYE[c].dye);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        if (!getA(t, x, y)) continue;
        const px = getPx(t, x, y);
        if (!CLOTH.has(px)) continue;
        const [r, g, b] = rgbOf(px);
        // (a dye multiplies the cloth, as the renderer's tint does)
        plot(t, x, y, ((Math.round((r * dr) / 255) << 16) | (Math.round((g * dg) / 255) << 8) | Math.round((b * db) / 255)));
      }
    return t;
  };
}

// prettier-ignore
BANNER_ITEMS['banner_pattern'] = () => spr([
  '................',
  '..############..',
  '..#pppppppppP#..',
  '..#pppppppppP#..',
  '..#pp#######P#..',
  '..#pp#iiiii#P#..',
  '..#pp#iiiii#P#..',
  '..#pp#iIIIi#P#..',
  '..#pp#iIIIi#P#..',
  '..#pp#iiiii#P#..',
  '..#pp#iiiii#P#..',
  '..#pp##iii##P#..',
  '..#pppp###ppP#..',
  '..#PPPPPPPPPP#..',
  '..############..',
  '................',
], { '#': 0x5b4a33, p: 0xe9dfc4, P: 0xc9bb98, i: 0xa08c6a, I: mulC(0xa08c6a, 0.7) }, 'banner_pattern');
