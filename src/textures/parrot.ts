// The parrots' skins (vanilla textures/entity/parrot/parrot_*.png, 32x32 on ParrotModel's layout): five colourings of
// the one bird — the red macaw with its blue and yellow wings, the blue one with its yellow face, the green one with
// its red crest, the blue-and-yellow macaw and the grey one with its red tail. A pale ring round each eye, a dark
// hooked beak, grey legs. Original pixel art.

import { Rand } from '../core/rng';
import { img, plot, type TexImage } from './tex';
import { MOB_TEXTURES, SIDES, boxFaces, noiseBox, noiseFace, paintFace, type Pal } from './mobs';

const HEAD = boxFaces(2, 2, 2, 3, 2);
const CREST = boxFaces(10, 0, 2, 1, 4);
const BEAK_LOWER = boxFaces(11, 7, 1, 2, 1);
const BEAK_UPPER = boxFaces(16, 7, 1, 2, 1);
const FEATHER = boxFaces(2, 18, 0, 5, 4);
const BODY = boxFaces(2, 8, 3, 6, 3);
const WING = boxFaces(19, 8, 1, 5, 3);
const TAIL = boxFaces(22, 1, 3, 4, 1);
const LEG = boxFaces(14, 18, 1, 2, 1);

interface Plumage {
  /** back, sides and head */
  body: Pal;
  /** the chest and belly (the body's front) */
  belly: Pal;
  /** round the eyes */
  face: number;
  crest: Pal;
  wing: Pal;
  /** the flight feathers at the wing's end */
  tip: Pal;
  tail: Pal;
  beak: [number, number];
}

const PLUMAGES: Record<string, Plumage> = {
  red_blue: {
    body: [0xa3140f, 0xbf1d16, 0xd4271c], belly: [0xb81a14, 0xcc2419], face: 0xefe6dc, crest: [0xc21f18, 0xde3322],
    wing: [0xe0b21e, 0xf0c733, 0x2f67cf], tip: [0x1f47a8, 0x2a58c9], tail: [0xbf1d16, 0x2a58c9], beak: [0xe7ddd0, 0x2b2b2b],
  },
  blue: {
    body: [0x1a4fb4, 0x215fcc, 0x2c6fe0], belly: [0x2c6fe0, 0x3a82ea], face: 0xf2c63a, crest: [0x215fcc, 0x2c6fe0],
    wing: [0x1a4fb4, 0x215fcc], tip: [0x143c8c, 0x183f99], tail: [0x1a4fb4, 0x143c8c], beak: [0x2f2f2f, 0x1c1c1c],
  },
  green: {
    body: [0x2f9b22, 0x3cb52a, 0x4bc934], belly: [0x7ec92c, 0x98d83a], face: 0xe9efe0, crest: [0xcc2a1f, 0xe0402c],
    wing: [0x2f9b22, 0x3cb52a], tip: [0x2358b8, 0x2c6ad0], tail: [0x3cb52a, 0xcc2a1f], beak: [0x3a3a3a, 0x242424],
  },
  yellow_blue: {
    body: [0x1777c0, 0x1f8fd8, 0x2aa0e6], belly: [0xe8b01c, 0xf2c230, 0xf8d14a], face: 0xf1efe8, crest: [0x2d9c5a, 0x36ad62],
    wing: [0x1777c0, 0x1f8fd8], tip: [0x125d99, 0x156aac], tail: [0x1777c0, 0x125d99], beak: [0x2a2a2a, 0x161616],
  },
  gray: {
    body: [0x6f6f72, 0x818185, 0x939397], belly: [0x8d8d91, 0x9f9fa3], face: 0xdcdcdc, crest: [0x818185, 0x939397],
    wing: [0x5f5f63, 0x707074], tip: [0x4a4a4e, 0x55555a], tail: [0xb81f1a, 0xcc2a22], beak: [0x222222, 0x141414],
  },
};

const LEGS = [0x6b6b6b, 0x7c7c7c];

function paintParrot(p: Plumage, seed: number): () => TexImage {
  return () => {
    const t = img(32, 32);
    const r = new Rand(seed);
    noiseBox(t, HEAD, r, p.body, { cell: 1, white: 0.4 });
    noiseFace(t, HEAD.front, r, [p.face, p.face, p.body[0]], { cell: 1, white: 0.3 });
    // an eye on each side of the head, at its front edge, with bare skin behind and below it
    for (const k of ['right', 'left'] as const) {
      const [x, y, w] = HEAD[k];
      const ex = k === 'right' ? x + w - 1 : x;
      plot(t, ex, y + 1, 0x101010);
      plot(t, k === 'right' ? ex - 1 : ex + 1, y + 1, p.face);
      plot(t, ex, y + 2, p.face);
    }
    noiseBox(t, CREST, r, p.crest, { cell: 1 });
    // the tuft at the back of the head, a plane: narrower towards its top, leaning back
    for (const k of ['right', 'left'] as const)
      noiseFace(t, FEATHER[k], r, p.crest, { cell: 1, white: 0.6, mask: (x, y, w) => (k === 'right' ? w - 1 - x : x) + y >= 3 });
    // the beak: the hooked upper mandible, its tip darker, and the lower one
    noiseBox(t, BEAK_UPPER, r, [p.beak[0]]);
    noiseBox(t, BEAK_LOWER, r, [p.beak[1]]);
    paintFace(t, BEAK_UPPER.front, (_x, y) => (y === 1 ? p.beak[1] : undefined));
    // the body: its back and sides, and the chest down the front
    noiseBox(t, BODY, r, p.body, { cell: 1, white: 0.5 });
    noiseFace(t, BODY.front, r, p.belly, { cell: 1, white: 0.5 });
    // the wings: coverts, then the long flight feathers along their lower edge
    noiseBox(t, WING, r, p.wing, { cell: 1, white: 0.5 });
    for (const k of SIDES) {
      const [x, y, w, h] = WING[k];
      noiseFace(t, [x, y + h - 2, w, 2], r, p.tip, { cell: 1 });
    }
    noiseFace(t, WING.bottom, r, p.tip, { cell: 1 });
    noiseBox(t, TAIL, r, p.tail, { cell: 1, white: 0.5 });
    noiseBox(t, LEG, r, LEGS, { cell: 1 });
    return t;
  };
}

let seed = 0x9a7;
for (const [name, p] of Object.entries(PLUMAGES)) MOB_TEXTURES['parrot_' + name] = paintParrot(p, seed++);
