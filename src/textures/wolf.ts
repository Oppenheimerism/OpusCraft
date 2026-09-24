// Wolves (vanilla textures/entity/wolf/wolf[_variant][_tame|_angry].png, 64x32 on WolfModel's layout) in the nine
// coats of 1.20.5: pale, snowy, ashen, black, chestnut, rusty, woods, spotted and striped. Each coat is darker along
// the back (a saddle over the shoulders, the spine and the top of the tail) and lighter on the belly, the chest and
// the muzzle, with a dark nose; the wild wolf looks sidelong, the tame one softly, the angry one glares red with its
// brows down and its teeth bared. And the collar (wolf_collar.png), a plain band round the neck, pale so it takes the
// dye's colour. Original pixel art in the style of vanilla 1.21.

import { TexImage, img, mulC, mixC, Rand } from './tex';
import { MOB_TEXTURES, boxFaces, noiseFace, paintFace, drawFace, fleck, pick, type Box, type Face, type Pal } from './mobs';

interface WolfLook {
  seed: number;
  /** the flanks and legs */
  fur: Pal;
  /** along the back */
  saddle: Pal;
  /** belly, chest, throat, muzzle */
  light: Pal;
  nose: number;
  /** the pupil (a dark coat gets light eyes) */
  eye: number;
  /** a dark muzzle (spotted and striped) */
  muzzle?: Pal;
  /** spots or stripes, and their colours */
  marks?: 'spots' | 'stripes';
  markPal?: Pal;
}

const LOOKS: Record<string, WolfLook> = {
  wolf: {
    seed: 0x3017a1,
    fur: [0xd8d4cf, 0xcdc8c3, 0xc3beb8, 0xb7b1ab, 0xaba59f],
    saddle: [0x938d88, 0x87817c, 0x7b7570, 0x6f6964, 0x9f9994],
    light: [0xf0ede9, 0xe8e4df, 0xdfdbd6],
    nose: 0x2b2522,
    eye: 0x1c1816,
  },
  wolf_snowy: {
    seed: 0x5e0bb2,
    fur: [0xf6f6f5, 0xefeeec, 0xe6e5e3, 0xdcdbd9],
    saddle: [0xd6d6d8, 0xcbcbce, 0xc0c0c4, 0xe0e0e2],
    light: [0xffffff, 0xfbfbfa, 0xf5f5f4],
    nose: 0x2e2a28,
    eye: 0x1c1a1a,
  },
  wolf_ashen: {
    seed: 0xa54e11,
    fur: [0xa19fa2, 0x959397, 0x8a888c, 0x7f7d82],
    saddle: [0x626066, 0x58565c, 0x4e4c52, 0x6c6a70],
    light: [0xc8c6c8, 0xbcbabd, 0xb0aeb2],
    nose: 0x1c1b1e,
    eye: 0x19181a,
  },
  wolf_black: {
    seed: 0xb1ac3,
    fur: [0x332f2f, 0x2a2727, 0x3c3838, 0x242121],
    saddle: [0x1d1b1b, 0x181616, 0x252222],
    light: [0x4d4747, 0x575151, 0x433e3e],
    nose: 0x0e0c0c,
    eye: 0xc7a44a,
  },
  wolf_chestnut: {
    seed: 0xc4e57,
    fur: [0x8e5d3c, 0x835536, 0x986643, 0x784c30],
    saddle: [0x5c3b27, 0x533522, 0x64422c],
    light: [0xcda987, 0xc19d7b, 0xd8b795],
    nose: 0x2a1b12,
    eye: 0x1e140e,
  },
  wolf_rusty: {
    seed: 0x7057e,
    fur: [0xbb6b3b, 0xb06435, 0xc57644, 0xa45c30],
    saddle: [0x6b5b51, 0x5f5047, 0x77665b],
    light: [0xe2d4c6, 0xd8c8b8, 0xecdfd2],
    nose: 0x2a1c16,
    eye: 0x1e1510,
  },
  wolf_woods: {
    seed: 0x3005d5,
    fur: [0x8f7c63, 0x847159, 0x9a876d, 0x796650],
    saddle: [0x604f3d, 0x574737, 0x695845],
    light: [0xc1b098, 0xb5a48c, 0xcdbda5],
    nose: 0x221a13,
    eye: 0x1a140f,
  },
  wolf_spotted: {
    seed: 0x5b0773,
    fur: [0xd9b77f, 0xceac73, 0xe3c38d, 0xc5a169],
    saddle: [0xb99761, 0xaf8d57, 0xc29f69],
    light: [0xede1c7, 0xe5d6b7, 0xf2e8d2],
    nose: 0x1a120e,
    eye: 0x1c130e,
    muzzle: [0x4b3b31, 0x55453b, 0x42342b],
    marks: 'spots',
    markPal: [0x5b4131, 0x4f3828, 0x674b39],
  },
  wolf_striped: {
    seed: 0x57e1bd,
    fur: [0xd7ba8f, 0xcdaf83, 0xe1c59b, 0xc3a577],
    saddle: [0xb99b6f, 0xaf9165, 0xc3a579],
    light: [0xebe0cb, 0xe3d5bc, 0xf1e8d7],
    nose: 0x1e1510,
    eye: 0x1c140f,
    muzzle: [0x5b4737, 0x4f3d2f, 0x66513f],
    marks: 'stripes',
    markPal: [0x6c5138, 0x5f462f, 0x785b41],
  },
};

// WolfModel's boxes (texOffs and sizes)
const HEAD = boxFaces(0, 0, 6, 6, 4);
const EAR = boxFaces(16, 14, 2, 2, 1);
const SNOUT = boxFaces(0, 10, 3, 3, 4);
const BODY = boxFaces(18, 14, 6, 9, 6);
const MANE = boxFaces(21, 0, 8, 6, 7);
const LEG = boxFaces(0, 18, 2, 8, 2);
const TAIL = boxFaces(9, 18, 2, 8, 2);

/**
 * Paint a face by how near the top of the wolf each pixel is (1 on the spine, 0 on the belly): the saddle above,
 * the coat between, the light fur below, with ragged, noisy edges
 */
function shadeFace(t: TexImage, f: Face, r: Rand, k: WolfLook, dorsal: (x: number, y: number, w: number, h: number) => number, lift = 0): void {
  paintFace(t, f, (x, y, _c, w, h) => {
    const d = dorsal(x, y, w, h) + lift + (r.next() - 0.5) * 0.35;
    return d > 0.72 ? pick(r, k.saddle) : d > 0.3 ? pick(r, k.fur) : pick(r, k.light);
  });
}

/** body and mane (turned on their sides): the right face's columns run spine to belly, the left's belly to spine */
function torso(t: TexImage, b: Box, r: Rand, k: WolfLook, lift: number): void {
  const across = (x: number, w: number) => x / Math.max(1, w - 1);
  shadeFace(t, b.back, r, k, () => 1, lift);
  shadeFace(t, b.front, r, k, () => 0, lift);
  shadeFace(t, b.right, r, k, (x, _y, w) => 1 - across(x, w), lift);
  shadeFace(t, b.left, r, k, (x, _y, w) => across(x, w), lift);
}

function base(k: WolfLook): TexImage {
  const t = img(64, 32);
  const r = new Rand(k.seed);
  const down = (_x: number, y: number, _w: number, h: number) => 1 - y / Math.max(1, h - 1);

  // head: the saddle over the crown fading down the sides; the face (painted later) and a light throat
  shadeFace(t, HEAD.top, r, k, () => 0.95);
  shadeFace(t, HEAD.back, r, k, down, -0.05);
  shadeFace(t, HEAD.right, r, k, down, -0.1);
  shadeFace(t, HEAD.left, r, k, down, -0.1);
  shadeFace(t, HEAD.front, r, k, (_x, y, _w, h) => 0.9 - (y / (h - 1)) * 0.8);
  shadeFace(t, HEAD.bottom, r, k, () => 0);

  // ears: coat outside, darker hollow inside
  shadeFace(t, EAR.top, r, k, () => 0.9);
  shadeFace(t, EAR.back, r, k, () => 0.8);
  shadeFace(t, EAR.right, r, k, () => 0.75);
  shadeFace(t, EAR.left, r, k, () => 0.75);
  shadeFace(t, EAR.bottom, r, k, () => 0.5);
  const inner = mulC(k.saddle[0], 0.72);
  paintFace(t, EAR.front, (x, y) => (y === 1 || x === 0 ? mixC(inner, 0x6a4a44, 0.25) : pick(r, k.saddle)));

  // snout: a light (or dark) muzzle, the nose at its tip, the lips' dark line along the bottom at the front
  const muzzle = k.muzzle ?? k.light;
  noiseFace(t, SNOUT.top, r, k.muzzle ?? [...k.fur.slice(0, 2), ...k.light.slice(0, 2)]);
  noiseFace(t, SNOUT.bottom, r, k.muzzle ?? k.light);
  noiseFace(t, SNOUT.right, r, muzzle);
  noiseFace(t, SNOUT.left, r, muzzle);
  noiseFace(t, SNOUT.front, r, muzzle);
  noiseFace(t, SNOUT.back, r, k.fur);
  const lip = mulC(muzzle[0], k.muzzle ? 0.6 : 0.5);
  // (the top's last row and the front's top row are the nose; the right face's front is its last column, the left's its first)
  paintFace(t, SNOUT.top, (_x, y, _w, h) => (y === h - 1 ? k.nose : undefined));
  paintFace(t, SNOUT.front, (x, y) => (y === 0 ? (x === 1 ? k.nose : mulC(k.nose, 1.6)) : y === 2 ? lip : undefined));
  paintFace(t, SNOUT.right, (x, y, w) => (y === 2 && x >= w - 2 ? lip : y === 0 && x === w - 1 ? k.nose : undefined));
  paintFace(t, SNOUT.left, (x, y) => (y === 2 && x <= 1 ? lip : y === 0 && x === 0 ? k.nose : undefined));

  // the body and the shaggier mane over the shoulders; the chest and throat light
  torso(t, BODY, r, k, 0);
  torso(t, MANE, r, k, 0.05);
  shadeFace(t, BODY.top, r, k, () => 0.15);
  shadeFace(t, BODY.bottom, r, k, (_x, y, _w, h) => 1 - y / (h - 1), -0.1);
  shadeFace(t, MANE.top, r, k, (_x, y, _w, h) => 0.6 - (y / (h - 1)) * 0.6);
  shadeFace(t, MANE.bottom, r, k, () => 0.5);
  // (a ragged edge of longer fur where the mane meets the body)
  paintFace(t, MANE.back, (_x, y, _w, h) => (y === h - 1 && r.chance(0.5) ? mulC(pick(r, k.saddle), 0.9) : undefined));

  // legs: the coat, lighter behind and inside, paws a shade darker
  for (const f of [LEG.right, LEG.left, LEG.front, LEG.back]) shadeFace(t, f, r, k, (_x, y, _w, h) => 0.55 - (y / (h - 1)) * 0.25, f === LEG.back ? -0.2 : 0);
  paintFace(t, LEG.front, (_x, y, _w, h) => (y >= h - 1 ? mulC(pick(r, k.fur), 0.88) : undefined));
  shadeFace(t, LEG.top, r, k, () => 0.5);
  paintFace(t, LEG.bottom, () => mulC(pick(r, k.fur), 0.7));

  // tail: the saddle along its top, light beneath, the tip darker
  shadeFace(t, TAIL.back, r, k, () => 0.95);
  shadeFace(t, TAIL.front, r, k, () => 0.1);
  shadeFace(t, TAIL.right, r, k, () => 0.55);
  shadeFace(t, TAIL.left, r, k, () => 0.55);
  shadeFace(t, TAIL.top, r, k, () => 0.6);
  shadeFace(t, TAIL.bottom, r, k, () => 0.8);
  for (const f of [TAIL.back, TAIL.front, TAIL.right, TAIL.left]) paintFace(t, f, (_x, y, _w, h) => (y >= h - 2 ? mulC(pick(r, k.saddle), y === h - 1 ? 0.8 : 0.9) : undefined));

  if (k.marks === 'spots') spots(t, r, k.markPal!);
  if (k.marks === 'stripes') stripes(t, r, k.markPal!);
  return t;
}

/** dark blotches, a pixel or two across, all over the coat */
function spots(t: TexImage, r: Rand, pal: Pal): void {
  const faces: Face[] = [BODY.back, BODY.right, BODY.left, MANE.back, MANE.right, MANE.left, HEAD.top, HEAD.right, HEAD.left, TAIL.back, TAIL.right, TAIL.left, LEG.right, LEG.left, LEG.front];
  for (const f of faces) {
    const [x0, y0, w, h] = f;
    const n = Math.max(1, Math.round((w * h) / 9));
    for (let i = 0; i < n; i++) {
      const x = x0 + r.nextInt(w), y = y0 + r.nextInt(h);
      drawFace(t, [x, y, 1, 1], ['s'], { s: pal }, r);
      if (r.chance(0.5) && x + 1 < x0 + w) drawFace(t, [x + 1, y, 1, 1], ['s'], { s: pal }, r);
      if (r.chance(0.35) && y + 1 < y0 + h) drawFace(t, [x, y + 1, 1, 1], ['s'], { s: pal }, r);
    }
  }
}

/** bands across the back, down the flanks (rows run along the body), round the tail and over the crown */
function stripes(t: TexImage, r: Rand, pal: Pal): void {
  const band = (f: Face, rows: number[], cover: (x: number, w: number) => boolean) =>
    paintFace(t, f, (x, y, w) => (rows.includes(y) && cover(x, w) && r.chance(0.9) ? pick(r, pal) : undefined));
  band(BODY.back, [1, 4, 7], () => true);
  band(BODY.right, [1, 4, 7], (x, w) => x < w * 0.6);
  band(BODY.left, [1, 4, 7], (x, w) => x >= w * 0.4);
  band(MANE.back, [2, 4], () => true);
  band(MANE.right, [2, 4], (x, w) => x < w * 0.5);
  band(MANE.left, [2, 4], (x, w) => x >= w * 0.5);
  for (const f of [TAIL.back, TAIL.right, TAIL.left, TAIL.front]) band(f, [2, 4], () => true);
  band(HEAD.top, [1], () => true);
  fleck(t, HEAD.top, r, 0.12, pal);
}

type Mood = 'wild' | 'tame' | 'angry';

/** the face: eyes over the snout, and brows */
function face(t: TexImage, k: WolfLook, mood: Mood, r: Rand): void {
  const brow = mulC(k.saddle[0], 0.7);
  const white = mixC(k.light[0], 0xffffff, 0.4);
  if (mood === 'wild') {
    // (a sidelong look: a pale eye-white outside each dark pupil)
    drawFace(t, HEAD.front, ['......', '.b..b.', 'wE..Ew'], { b: brow, E: k.eye, w: white }, r);
  } else if (mood === 'tame') {
    drawFace(t, HEAD.front, ['......', '......', '.E..E.'], { E: k.eye }, r);
  } else {
    // (brows down in a scowl, red eyes, and the lips drawn back off white teeth)
    drawFace(t, HEAD.front, ['......', 'bB..Bb', 'bR..Rb'], { b: brow, B: mulC(brow, 0.75), R: 0xc62a1f }, r);
    drawFace(t, SNOUT.front, ['...', '...', 'tgt'], { t: 0xf1ede4, g: 0x7a1f1a }, r);
  }
}

function wolfTexture(name: string, mood: Mood): () => TexImage {
  return () => {
    const k = LOOKS[name];
    const t = base(k);
    face(t, k, mood, new Rand(k.seed ^ 0xface));
    return t;
  };
}

for (const name of Object.keys(LOOKS)) {
  MOB_TEXTURES[name] = wolfTexture(name, 'wild');
  MOB_TEXTURES[name + '_tame'] = wolfTexture(name, 'tame');
  MOB_TEXTURES[name + '_angry'] = wolfTexture(name, 'angry');
}

/** vanilla wolf_collar.png: a band round the front of the mane, pale to take the dye */
MOB_TEXTURES.wolf_collar = () => {
  const t = img(64, 32);
  const r = new Rand(0xc011a);
  for (const f of [MANE.right, MANE.front, MANE.left, MANE.back]) {
    paintFace(t, f, (_x, y) => (y === 0 ? (r.chance(0.3) ? 0xeeeeee : 0xffffff) : y === 1 ? 0xcfcfcf : null));
  }
  return t;
};
