// The axolotls' skins (Stage 5: ocean, M7; vanilla textures/entity/axolotl/axolotl_<variant>.png, 64x64), in their
// model's box layout (render/axolotlRenderer.ts), one for each colour: lucy (pink, with deep pink gills), wild (brown
// and darkly speckled, with muted purple gills), gold (with pale gold speckles and orange gills), cyan (the palest
// blue-white, with pink-purple gills) and blue (with violet gills). Each has a paler belly, small dark eyes at the
// corners of its face and a darker mouth line, a crest along its back, gill fringes with gaps between their
// filaments, little toed legs and a tail fin tapering to its tip. Original pixel art in the style of vanilla 1.21.

import { TexImage, img, plot, clear, getPx, mixC, mulC } from './tex';
import { Rand } from '../core/rng';
import { MOB_TEXTURES, boxFaces, noiseFace, paintFace, pick, SIDES, type Face, type Pal } from './mobs';

interface Colours {
  body: Pal;
  /** speckles over the back */
  spot: Pal;
  spots: number;
  belly: Pal;
  gill: Pal;
  eye: number;
  mouth: number;
}

const VARIANTS: Record<string, Colours> = {
  lucy: {
    body: [0xf6b4cf, 0xf1a6c5, 0xf9c2d9, 0xeb9abb],
    spot: [0xe486ad],
    spots: 0.06,
    belly: [0xfad0e2, 0xfcdbe9],
    gill: [0xd94373, 0xe3578a, 0xc73664],
    eye: 0x2b1520,
    mouth: 0xb05a7f,
  },
  wild: {
    body: [0x6e5946, 0x78634e, 0x655140, 0x5d4a3a],
    spot: [0x3e3127, 0x463629, 0x4f3e2f],
    spots: 0.18,
    belly: [0x8c775d, 0x967f64],
    gill: [0x8d607c, 0x7d5470, 0x6f4964],
    eye: 0x16110d,
    mouth: 0x3c2f25,
  },
  gold: {
    body: [0xf1bf45, 0xf6cd58, 0xe7b13a, 0xf9d466],
    spot: [0xfde6a0, 0xfbe08a],
    spots: 0.12,
    belly: [0xfde8ad, 0xfeefc2],
    gill: [0xe8962a, 0xd8831d, 0xf0a93b],
    eye: 0x2b1d09,
    mouth: 0xb57e22,
  },
  cyan: {
    body: [0xd6f1f4, 0xc8eaef, 0xe3f7f8, 0xbde3e9],
    spot: [0xa7d6de, 0xb2dde4],
    spots: 0.1,
    belly: [0xeefafb, 0xf6fdfd],
    gill: [0xd887cf, 0xc775c0, 0xe59ad9],
    eye: 0x1c2833,
    mouth: 0x8fb8c2,
  },
  blue: {
    body: [0x4057c9, 0x4b63d4, 0x3649b8, 0x566ede],
    spot: [0x2c3c98, 0x33449f],
    spots: 0.1,
    belly: [0x6d83e6, 0x7a8feb],
    gill: [0x6a45cf, 0x5b39bb, 0x7a55dc],
    eye: 0x10142e,
    mouth: 0x28358c,
  },
};

/** a flat part's face with some of its pixels cut away, once it's painted (`gap`: which, in face coordinates) */
function cutFace(t: TexImage, f: Face, gap: (x: number, y: number, w: number, h: number) => boolean): void {
  const [x0, y0, w, h] = f;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (gap(x, y, w, h)) clear(t, x0 + x, y0 + y);
}

function axolotl(name: string, seed: number): () => TexImage {
  return () => {
    const c = VARIANTS[name];
    const t = img(64, 64);
    const r = new Rand(seed);
    const skin = (f: Face) => {
      noiseFace(t, f, r, c.body);
      paintFace(t, f, (_x, _y, px) => (r.chance(c.spots) ? pick(r, c.spot) : px));
    };

    // the head (8x5x5 at 0,1): skin, a paler chin; on its face the eyes at the top corners and the mouth below
    const head = boxFaces(0, 1, 8, 5, 5);
    for (const k of ['top', ...SIDES] as const) skin(head[k]);
    noiseFace(t, head.bottom, r, c.belly);
    const fr = head.front;
    for (const x of [0, fr[2] - 1]) {
      plot(t, fr[0] + x, fr[1] + 1, c.eye);
      plot(t, fr[0] + x, fr[1] + 2, mixC(c.eye, getPx(t, fr[0] + x, fr[1] + 2), 0.35));
    }
    for (let x = 1; x < fr[2] - 1; x++) plot(t, fr[0] + x, fr[1] + 3, mixC(getPx(t, fr[0] + x, fr[1] + 3), c.mouth, 0.7));
    for (let x = 0; x < fr[2]; x++) plot(t, fr[0] + x, fr[1] + 4, mixC(getPx(t, fr[0] + x, fr[1] + 4), c.belly[0], 0.5));

    // the body (8x4x10 at 0,11): skin over the back and sides, the belly underneath, its sides paler low down
    const body = boxFaces(0, 11, 8, 4, 10);
    for (const k of ['top', ...SIDES] as const) skin(body[k]);
    noiseFace(t, body.bottom, r, c.belly);
    for (const k of SIDES) paintFace(t, body[k], (_x, y, px, _w, h) => (y === h - 1 ? mixC(px, c.belly[0], 0.5) : undefined));

    // the crest (a flat plane, 9 long and 5 high at 2,17; only its top row shows over the back), a little darker
    const crest = boxFaces(2, 17, 0, 5, 9);
    for (const f of [crest.right, crest.left]) {
      skin(f);
      paintFace(t, f, (_x, y, px) => (y === 0 ? mulC(mixC(px, c.gill[0], 0.25), 0.92) : undefined));
    }

    // the tail fin (12 long and 5 high at 2,19; the right face's tip at its left, the left face's at its right):
    // skin, its edges a touch darker, the top and bottom rows cut away towards the tip
    const tail = boxFaces(2, 19, 0, 5, 12);
    for (const [f, tipLeft] of [[tail.right, true], [tail.left, false]] as [Face, boolean][]) {
      noiseFace(t, f, r, c.body);
      paintFace(t, f, (x, y, px, w, h) => {
        const fromTip = tipLeft ? x : w - 1 - x;
        if (y === 0 || y === h - 1) return mulC(px, 0.9);
        return fromTip < 2 ? mixC(px, c.gill[0], 0.2) : r.chance(c.spots) ? pick(r, c.spot) : undefined;
      });
      cutFace(t, f, (x, y, w, h) => {
        const fromTip = tipLeft ? x : w - 1 - x;
        return (y === 0 || y === h - 1) && fromTip < 4 - (y === 0 ? 0 : 1);
      });
    }

    // the gills: the top fringe (8x3 at 3,37, front and back) and the side ones (3x7 at 0,40 and 11,40), each a row
    // of filaments with gaps at their tips
    const top = boxFaces(3, 37, 8, 3, 0);
    for (const f of [top.front, top.back]) {
      noiseFace(t, f, r, c.gill);
      cutFace(t, f, (x, y) => y === 0 && x % 2 === 1);
    }
    for (const [u, v] of [[0, 40], [11, 40]]) {
      const side = boxFaces(u, v, 3, 7, 0);
      for (const f of [side.front, side.back]) {
        noiseFace(t, f, r, c.gill);
        paintFace(t, f, (_x, y, px, _w, h) => (y === h - 1 ? mulC(px, 0.85) : undefined));
        cutFace(t, f, (x, y) => (y === 0 && x !== 1) || (y === 1 && x === 0) || (y % 2 === 0 && y > 0 && x === 2 && r.chance(0.5)));
      }
    }

    // the legs (3x5 at 2,13, front and back): skin, the toes at the bottom with a gap between them
    const leg = boxFaces(2, 13, 3, 5, 0);
    for (const f of [leg.front, leg.back]) {
      noiseFace(t, f, r, c.body);
      paintFace(t, f, (_x, y, px, _w, h) => (y >= h - 2 ? mixC(px, c.belly[0], 0.3) : undefined));
      cutFace(t, f, (x, y, _w, h) => y === h - 1 && x === 1);
    }
    return t;
  };
}

const SEEDS: Record<string, number> = { lucy: 0xa701, wild: 0xa702, gold: 0xa703, cyan: 0xa704, blue: 0xa705 };
for (const [name, seed] of Object.entries(SEEDS)) MOB_TEXTURES[`axolotl_${name}`] = axolotl(name, seed);
