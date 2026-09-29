// (remaining mobs: the panda) The panda's skins (vanilla textures/entity/panda/*.png, 64x64 on PandaModel's layout),
// one for each gene it can show: thick white fur with black ears, black legs and a black band round its shoulders
// and chest; black patches round its eyes, drooping outward; a white snout with a black nose. The lazy panda's eyes
// are sleepy slits; the worried one's brows are raised in the middle, its eyes turned away; the aggressive one
// scowls; the playful one's tongue is out; the weak one is bleary-eyed with a runny nose; and the brown panda is
// brown and tan where the others are black and white. Original pixel art.

import { Rand } from '../core/rng';
import { img, plot, type TexImage } from './tex';
import { MOB_TEXTURES, boxFaces, drawFace, noiseBox, noiseFace, paintFace, type Pal } from './mobs';

/** vanilla PandaModel's boxes: the head (13x10x9), the snout (7x5x2), an ear (5x4x1), the body (19x26x13), a leg (6x9x6) */
const HEAD = boxFaces(0, 6, 13, 10, 9);
const NOSE = boxFaces(45, 16, 7, 5, 2);
const EAR = boxFaces(52, 25, 5, 4, 1);
const BODY = boxFaces(0, 25, 19, 26, 13);
const LEG = boxFaces(40, 0, 6, 9, 6);

interface Coat {
  light: Pal;
  lightW: Pal;
  /** the light fur's shade underneath */
  under: Pal;
  dark: Pal;
  /** the soles of its feet */
  sole: Pal;
  /** its nose and its mouth line */
  nose: number;
  mouth: number;
  /** the whites of its eyes, and its pupils */
  eyeWhite: number;
  pupil: number;
}

const BLACK_WHITE: Coat = {
  light: [0xd9d9d4, 0xe3e3df, 0xebebe7, 0xf3f3f0, 0xfafaf8],
  lightW: [1, 3, 5, 5, 2],
  under: [0xcfcfca, 0xd8d8d3, 0xe0e0db],
  dark: [0x17171b, 0x1d1d22, 0x232329, 0x2a2a30],
  sole: [0x34343b, 0x3b3b43],
  nose: 0x121215,
  mouth: 0x5d5d62,
  eyeWhite: 0xe8e8e8,
  pupil: 0x0a0a0c,
};

/** vanilla brown_panda.png: tan where the others are white, dark brown where they're black */
const BROWN_TAN: Coat = {
  light: [0x8e6c4d, 0x987556, 0xa27e5e, 0xab8766, 0xb4916f],
  lightW: [1, 3, 5, 5, 2],
  under: [0x836346, 0x8c6b4c, 0x957353],
  dark: [0x36231a, 0x3d281d, 0x452d20, 0x4c3224],
  sole: [0x2c1d15, 0x332219],
  nose: 0x24170f,
  mouth: 0x5b412e,
  eyeWhite: 0xe2d6c6,
  pupil: 0x140d09,
};

/**
 * the face (the head's front, 13x10; the snout covers the middle of its lower half): '.' fur, B the eye patches, W
 * the whites of the eyes, P the pupils, L a lid (a sleepy or bleary eye), G a brow
 */
const EYES: Record<string, string[]> = {
  normal: [
    '.............',
    '.............',
    '..BBB...BBB..',
    '.BWPB...BPWB.',
    '.BBBB...BBBB.',
    'BBBB.....BBBB',
    'BBB.......BBB',
    '.B.........B.',
  ],
  lazy: [
    '.............',
    '.............',
    '..BBB...BBB..',
    '.BBBB...BBBB.',
    '.BLLB...BLLB.',
    'BBBB.....BBBB',
    'BBB.......BBB',
    'BB.........BB',
  ],
  worried: [
    '....G...G....',
    '..GG.....GG..',
    '..BBB...BBB..',
    '.BPWB...BWPB.',
    '.BBBB...BBBB.',
    'BBBB.....BBBB',
    'BBB.......BBB',
    'BB.........BB',
  ],
  aggressive: [
    '.GG.......GG.',
    '...G.....G...',
    '..BBB...BBB..',
    '.BWPB...BPWB.',
    '.BBBB...BBBB.',
    'BBBB.....BBBB',
    'BBB.......BBB',
    '.B.........B.',
  ],
  weak: [
    '.............',
    '.............',
    '..BBB...BBB..',
    '.BWPB...BPWB.',
    '.BLLB...BLLB.',
    'BBBB.....BBBB',
    'BBB.......BBB',
    'BB.........BB',
  ],
};

/** the snout's front (7x5): N the nose, M the mouth, T the tongue (and its shade t), S the runny nose (and its drop s) */
const SNOUTS: Record<string, string[]> = {
  normal: ['..NNN..', '...N...', '...M...', '..M.M..', '.......'],
  playful: ['..NNN..', '...N...', '...M...', '..MTM..', '...Tt..'],
  weak: ['..NNN..', '...NS..', '...MS..', '..M.M..', '....s..'],
};

function paintPanda(gene: string, coat: Coat, eyes: string[], snout: string[]): TexImage {
  const t = img(64, 64);
  const r = new Rand(0x9a4da ^ gene.length * 7919);
  const L = { w: coat.lightW };
  // the head: fur all over, the face's patches and eyes
  noiseBox(t, HEAD, r, coat.light, L);
  noiseFace(t, HEAD.bottom, r, coat.under);
  const lid = coat === BROWN_TAN ? 0x6e5a48 : 0x8d8d92;
  drawFace(t, HEAD.front, eyes, { B: coat.dark, W: coat.eyeWhite, P: coat.pupil, L: lid, G: coat.dark[3] }, r);
  // the snout: fur, the nose over its front and on to its top
  noiseBox(t, NOSE, r, coat.light, L);
  drawFace(t, NOSE.front, snout, { N: coat.nose, M: coat.mouth, T: 0xd96a82, t: 0xb44f68, S: 0xa5d66e, s: 0x78ad48 }, r);
  const [tx, ty, , th] = NOSE.top;
  for (let i = 2; i <= 4; i++) plot(t, tx + i, ty + th - 1, coat.nose);
  // the ears: dark all over
  noiseBox(t, EAR, r, coat.dark);
  // the body: its box on its side (the chest end its top, the belly its front, the spine its back); the band round
  // the shoulders over the first nine rows from the head end, its edge ragged, and the chest end dark
  noiseBox(t, BODY, r, coat.light, L);
  noiseFace(t, BODY.front, r, coat.under);
  noiseFace(t, BODY.top, r, coat.dark);
  for (const k of ['right', 'front', 'left', 'back'] as const) {
    const edge = r.nextInt(2);
    noiseFace(t, BODY[k], r, coat.dark, { mask: (x, y) => y < 9 || (y === 9 && (x + edge) % 2 === 0) });
  }
  // the legs: dark, their soles a shade lighter
  noiseBox(t, LEG, r, coat.dark);
  noiseFace(t, LEG.bottom, r, coat.sole);
  paintFace(t, LEG.front, (x, y, _c, w, h) => (y === h - 1 && x > 0 && x < w - 1 && x % 2 === 1 ? coat.sole[0] : undefined));
  return t;
}

MOB_TEXTURES['panda'] = () => paintPanda('normal', BLACK_WHITE, EYES.normal, SNOUTS.normal);
MOB_TEXTURES['lazy_panda'] = () => paintPanda('lazy', BLACK_WHITE, EYES.lazy, SNOUTS.normal);
MOB_TEXTURES['worried_panda'] = () => paintPanda('worried', BLACK_WHITE, EYES.worried, SNOUTS.normal);
MOB_TEXTURES['playful_panda'] = () => paintPanda('playful', BLACK_WHITE, EYES.normal, SNOUTS.playful);
MOB_TEXTURES['brown_panda'] = () => paintPanda('brown', BROWN_TAN, EYES.normal, SNOUTS.normal);
MOB_TEXTURES['weak_panda'] = () => paintPanda('weak', BLACK_WHITE, EYES.weak, SNOUTS.weak);
MOB_TEXTURES['aggressive_panda'] = () => paintPanda('aggressive', BLACK_WHITE, EYES.aggressive, SNOUTS.normal);
