// The snow golem's skin (vanilla textures/entity/snow_golem.png, 64x64 on SnowGolemModel's layout): packed snow,
// faintly blue in its hollows, for the head and the two balls of its body; a face of lumps of coal, seen once its
// pumpkin is off; and arms of bare twigs. Original pixel art.

import { img, plot } from './tex';
import { Rand } from '../core/rng';
import { MOB_TEXTURES, boxFaces, noiseBox, paintFace, drawFace } from './mobs';

const HEAD = boxFaces(0, 0, 8, 8, 8);
const ARM = boxFaces(32, 0, 12, 2, 2);
const UPPER = boxFaces(0, 16, 10, 10, 10);
const LOWER = boxFaces(0, 36, 12, 12, 12);

const SNOW = [0xd6e4e6, 0xe2eeef, 0xebf5f6, 0xf3fafa, 0xfbfefe];
const SNOW_W = [1, 3, 6, 6, 3];
const TWIG = [0x4f3520, 0x5d3f26, 0x6a4a2d, 0x7a5636];

MOB_TEXTURES['snow_golem'] = () => {
  const t = img(64, 64);
  const r = new Rand(0x5709);
  for (const b of [HEAD, UPPER, LOWER]) {
    noiseBox(t, b, r, SNOW, { w: SNOW_W, cell: 1, white: 0.5 });
    // (shaded underneath, a little brighter on top)
    paintFace(t, b.bottom, (x, y, c) => mixBlue(c, 0.86));
    paintFace(t, b.top, (x, y, c) => mixBlue(c, 1.03));
  }
  // the face: coal eyes and a crooked grin
  drawFace(t, HEAD.front, [
    '........',
    '........',
    '.EE..EE.',
    '.Ee..eE.',
    '........',
    '.m....m.',
    '..mmmm..',
    '........',
  ], { E: 0x232323, e: 0x3a3a3a, m: 0x2e2e2e }, r);
  // the twig arms, bark streaked along them, a knot here and there
  noiseBox(t, ARM, r, TWIG, { cell: 1 });
  for (const k of ['front', 'back', 'top', 'bottom'] as const) {
    const [x0, y0, w] = ARM[k];
    for (let x = 0; x < w; x += 4 + r.nextInt(3)) plot(t, x0 + x, y0 + r.nextInt(2), 0x3e2a19);
  }
  return t;
};

/** a snow colour darkened (`f` < 1, toward the blue of its shadows) or lightened */
function mixBlue(c: number, f: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const k = (v: number, tint: number) => Math.max(0, Math.min(255, Math.round(f < 1 ? v * f + tint * (1 - f) : v * f)));
  return (k(r, 60) << 16) | (k(g, 90) << 8) | k(b, 130);
}
