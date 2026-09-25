// Llamas (vanilla textures/entity/llama/: creamy, white, brown and gray.png, decor/<colour>.png and
// decor/trader_llama.png, and spit.png; 128x64 on LlamaModel's layout). Each coat is thick curly wool, palest along
// the back and darker to the belly, the lower legs sleeker and the toes dark; a long face, the muzzle darker at the
// end with its nostrils and the split of the mouth, a dark eye either side of the face, the ears lined inside, and a
// tuft of a tail. A chest either side, planked, with its iron latch. The decor is a woven blanket over the back and
// down the sides, bordered and fringed with a chain of diamonds down its middle, and a halter round the nose, up the
// cheeks and over the crown: in the carpet's colour with a contrasting thread, or the wandering trader's blue and
// gold. Original pixel art in the style of vanilla 1.21.

import { type TexImage, img, setPx, mulC, mixC, valueNoise, whiteNoise, combine, equalize } from './tex';
import { Rand } from '../core/rng';
import { MOB_TEXTURES, boxFaces, type Face, type Pal } from './mobs';
import { DYE } from './dyes';

// vanilla LlamaModel.createBodyLayer's boxes (128x64)
const SNOUT = boxFaces(0, 0, 4, 4, 9);
const NECK = boxFaces(0, 14, 8, 18, 6);
const EAR = boxFaces(17, 0, 3, 3, 2);
const BODY = boxFaces(29, 0, 12, 18, 10);
const LEG = boxFaces(29, 29, 4, 14, 4);
const CHESTS = [boxFaces(45, 28, 8, 8, 3), boxFaces(45, 41, 8, 8, 3)];

interface LlamaLook {
  seed: number;
  /** the wool, dark to light */
  wool: Pal;
  /** the end of the nose */
  muzzle: Pal;
  nostril: number;
  eye: number;
  earIn: number;
  toe: Pal;
}

const LOOKS: Record<string, LlamaLook> = {
  creamy: {
    seed: 0x11a3a,
    wool: [0xb49e76, 0xc6b18a, 0xd4c19b, 0xe0d0ad, 0xeadcbc],
    muzzle: [0xa48d68, 0x98815d], nostril: 0x4a3b2a, eye: 0x1e1812, earIn: 0x9c8565, toe: [0x5e4f3e, 0x524536],
  },
  white: {
    seed: 0x11a3b,
    wool: [0xc9c5bd, 0xd9d6cf, 0xe6e3dd, 0xefede8, 0xf7f6f3],
    muzzle: [0xc2b8b2, 0xb7ada7], nostril: 0x5d5450, eye: 0x221d1b, earIn: 0xc9aaa6, toe: [0x6a625d, 0x5d5651],
  },
  brown: {
    seed: 0x11a3c,
    wool: [0x5a3b24, 0x6b472c, 0x7a5335, 0x88603f, 0x956c49],
    muzzle: [0x4e3320, 0x452d1c], nostril: 0x1e140c, eye: 0x140d08, earIn: 0x4a2f1d, toe: [0x2e241c, 0x271e17],
  },
  gray: {
    seed: 0x11a3d,
    wool: [0x6f6862, 0x807973, 0x8f8983, 0x9d9791, 0xaaa59f],
    muzzle: [0x645d58, 0x5a534e], nostril: 0x2a2522, eye: 0x181412, earIn: 0x6d5f5a, toe: [0x3c3632, 0x34302c],
  },
};

/** curly wool over a face: clustered noise through the palette, nudged lighter or darker by `bias` */
function fluff(t: TexImage, f: Face, pal: Pal, r: Rand, bias: (x: number, y: number, w: number, h: number) => number = () => 0): void {
  const [x0, y0, w, h] = f;
  const v = equalize(combine([valueNoise(r, w, h, 2), whiteNoise(r, w, h)], [0.6, 0.4]));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = Math.max(0, Math.min(pal.length - 1, Math.floor((v[y * w + x] * 0.8 + 0.1 + bias(x, y, w, h)) * pal.length)));
      setPx(t, x0 + x, y0 + y, pal[k]);
    }
}

function px(t: TexImage, f: Face, x: number, y: number, c: number): void {
  setPx(t, f[0] + x, f[1] + y, c);
}

function llama(look: LlamaLook): TexImage {
  const t = img(128, 64);
  const r = new Rand(look.seed);
  const W = look.wool;
  // the body: the back lightest, the sides shading down to the belly (the side faces run top to belly across; the
  // right one from its left edge, the left one from its right)
  fluff(t, BODY.back, W, r, () => 0.12);
  fluff(t, BODY.front, W, r, () => -0.22);
  fluff(t, BODY.right, W, r, (x, _y, w) => 0.08 - (x / (w - 1)) * 0.28);
  fluff(t, BODY.left, W, r, (x, _y, w) => 0.08 - (1 - x / (w - 1)) * 0.28);
  fluff(t, BODY.top, W, r, (_x, y, _w, h) => 0.05 - (y / (h - 1)) * 0.2);
  fluff(t, BODY.bottom, W, r, (_x, y, _w, h) => 0.05 - (y / (h - 1)) * 0.2);
  // (the tail: a tuft at the top of the rump)
  for (let y = 0; y < 4; y++) for (let x = 5; x < 7; x++) px(t, BODY.bottom, x, y, W[Math.min(W.length - 1, 3 + ((x + y) & 1))]);
  px(t, BODY.bottom, 5, 4, W[2]);
  // the neck and head: the face a little lighter, the back of the neck darker
  fluff(t, NECK.front, W, r, (_x, y) => (y < 6 ? 0.1 : 0));
  fluff(t, NECK.back, W, r, () => -0.08);
  fluff(t, NECK.right, W, r);
  fluff(t, NECK.left, W, r);
  fluff(t, NECK.top, W, r, () => 0.1);
  fluff(t, NECK.bottom, W, r, () => -0.2);
  // the eyes, either side of the face (round the corner onto the cheeks)
  for (const y of [2, 3]) {
    px(t, NECK.front, 0, y, look.eye);
    px(t, NECK.front, 7, y, look.eye);
    px(t, NECK.right, 5, y, look.eye);
    px(t, NECK.left, 0, y, look.eye);
  }
  px(t, NECK.right, 4, 2, mulC(look.eye, 1.6));
  px(t, NECK.left, 1, 2, mulC(look.eye, 1.6));
  // the snout: sleek wool going darker to the muzzle at the end (the sides run back to front on the right, front to
  // back on the left; the top and bottom from the back down to the tip)
  const S = [W[1], W[2], W[3], W[3]];
  fluff(t, SNOUT.top, S, r, (_x, y) => (y >= 7 ? -0.35 : 0.05));
  fluff(t, SNOUT.bottom, S, r, () => -0.2);
  fluff(t, SNOUT.right, S, r, (x) => (x >= 7 ? -0.4 : 0));
  fluff(t, SNOUT.left, S, r, (x) => (x <= 1 ? -0.4 : 0));
  fluff(t, SNOUT.front, look.muzzle, r);
  fluff(t, SNOUT.back, S, r);
  px(t, SNOUT.front, 0, 1, look.nostril);
  px(t, SNOUT.front, 3, 1, look.nostril);
  px(t, SNOUT.front, 1, 3, mixC(look.nostril, look.muzzle[0], 0.4));
  px(t, SNOUT.front, 2, 3, mixC(look.nostril, look.muzzle[0], 0.4));
  // (the line of the mouth along each side, at the bottom by the tip)
  px(t, SNOUT.right, 8, 3, look.nostril);
  px(t, SNOUT.right, 7, 3, mixC(look.nostril, look.muzzle[0], 0.5));
  px(t, SNOUT.left, 0, 3, look.nostril);
  px(t, SNOUT.left, 1, 3, mixC(look.nostril, look.muzzle[0], 0.5));
  // the ears, lined inside
  for (const f of [EAR.top, EAR.bottom, EAR.right, EAR.left, EAR.back]) fluff(t, f, W.slice(1), r);
  fluff(t, EAR.front, W.slice(1), r);
  px(t, EAR.front, 1, 1, look.earIn);
  px(t, EAR.front, 1, 2, look.earIn);
  // the legs: wool at the top, sleeker below, the toes dark
  for (const f of [LEG.right, LEG.front, LEG.left, LEG.back]) {
    fluff(t, f, W, r, (_x, y) => (y < 5 ? 0 : -0.15));
    for (let x = 0; x < 4; x++) for (let y = 12; y < 14; y++) px(t, f, x, y, look.toe[(x + y) & 1]);
    // (the split between the toes, at the front)
    if (f === LEG.front) px(t, f, 1, 13, mulC(look.toe[1], 0.7));
  }
  fluff(t, LEG.top, W, r);
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) px(t, LEG.bottom, x, y, look.toe[(x * 3 + y) & 1]);
  // the chests
  for (const c of CHESTS) chest(t, c, r);
  return t;
}

/** a chest: oak planks framed dark, the lid's seam, and the iron latch on the outer faces */
function chest(t: TexImage, c: Record<'top' | 'bottom' | 'right' | 'front' | 'left' | 'back', Face>, r: Rand): void {
  const WOOD = [0x8a5a2b, 0x9c6a33, 0xa8743a];
  for (const f of Object.values(c)) {
    const [x0, y0, w, h] = f;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        setPx(t, x0 + x, y0 + y, edge ? 0x4e3217 : mulC(WOOD[(y + (r.nextInt(5) === 0 ? 1 : 0)) % WOOD.length], 0.95 + r.nextFloat() * 0.08));
      }
  }
  for (const f of [c.front, c.back]) {
    const [x0, y0, w] = f;
    // (the lid's seam, and the latch)
    for (let x = 1; x < w - 1; x++) setPx(t, x0 + x, y0 + 3, 0x5c3b1c);
    setPx(t, x0 + 3, y0 + 2, 0xc4c4c4);
    setPx(t, x0 + 4, y0 + 2, 0xc4c4c4);
    setPx(t, x0 + 3, y0 + 3, 0x9a9a9a);
    setPx(t, x0 + 4, y0 + 3, 0x7a7a7a);
    setPx(t, x0 + 3, y0 + 4, 0x6e6e6e);
    setPx(t, x0 + 4, y0 + 4, 0x6e6e6e);
  }
}

for (const [name, look] of Object.entries(LOOKS)) MOB_TEXTURES['llama_' + name] = () => llama(look);

// ---------------------------------------------------------------------------
// the decor

interface Decor {
  main: number;
  /** the border and the diamonds' outline */
  trim: number;
  /** the contrasting thread */
  accent: number;
}

/** the thread each carpet's blanket is woven with */
const ACCENTS: Record<string, number> = {
  white: 0x3aafd9, orange: 0xf8e3a4, magenta: 0xf8c627, light_blue: 0xeaeded, yellow: 0xa12722, lime: 0x2f5c12,
  pink: 0xeaeded, gray: 0xf8c627, light_gray: 0x3e4447, cyan: 0xf8c627, purple: 0xf8c627, blue: 0xf8c627,
  brown: 0xf07613, green: 0xf8c627, red: 0xf8c627, black: 0xa12722,
};

function decor(d: Decor, seed: number): TexImage {
  const t = img(128, 64);
  const r = new Rand(seed);
  const weave = (c: number) => mulC(c, 0.93 + r.nextFloat() * 0.12);
  const dark = mixC(d.trim, 0x000000, 0.15);
  // the blanket over the back: from row 2 to 15 of the body's 18, bordered, a chain of diamonds down the middle,
  // fringed at the ends
  const back = BODY.back;
  for (let y = 2; y < 16; y++)
    for (let x = 0; x < 12; x++) {
      const border = y === 2 || y === 15 || x === 0 || x === 11;
      const inner = y === 3 || y === 14 || x === 1 || x === 10;
      // (the diamonds: every six rows, four wide)
      const dy = ((y - 3) % 6 + 6) % 6, half = Math.abs(dy - 3), dx = Math.abs(x - 5.5);
      const diamond = y > 3 && y < 14 && Math.abs(dx - (3 - half)) < 0.6;
      const core = y > 3 && y < 14 && dx < 3 - half - 0.6;
      const c = border ? d.trim : inner ? d.accent : diamond ? d.accent : core && dy === 3 && dx < 1 ? d.trim : d.main;
      px(t, back, x, y, weave(c));
    }
  for (const y of [1, 16]) for (let x = 0; x < 12; x += 2) px(t, back, x, y, weave(d.accent));
  // down the sides six pixels (the right face runs top to belly from its left edge, the left face from its right),
  // the edge trimmed, with tassels hanging below
  for (let y = 2; y < 16; y++)
    for (let i = 0; i < 6; i++) {
      const c = i === 5 ? d.trim : i === 4 ? d.accent : i === 0 ? d.trim : (y + i) % 4 === 0 ? mixC(d.main, d.accent, 0.35) : d.main;
      px(t, BODY.right, i, y, weave(c));
      px(t, BODY.left, 9 - i, y, weave(c));
    }
  for (let y = 3; y < 16; y += 3) {
    px(t, BODY.right, 6, y, weave(d.accent));
    px(t, BODY.left, 3, y, weave(d.accent));
  }
  // the halter: a band round the nose (a pixel back along the snout from where it leaves the face)...
  const band = (c: number) => weave(c);
  for (let x = 0; x < 4; x++) {
    px(t, SNOUT.top, x, 6, band(x === 1 || x === 2 ? d.accent : d.main));
    px(t, SNOUT.bottom, x, 6, band(d.main));
  }
  for (let y = 0; y < 4; y++) {
    px(t, SNOUT.right, 6, y, band(d.main));
    px(t, SNOUT.left, 3, y, band(d.main));
  }
  // ...straps up the cheeks, just behind the eyes...
  for (let y = 0; y < 6; y++) {
    px(t, NECK.right, 4, y, band(y === 3 ? d.accent : d.main));
    px(t, NECK.left, 1, y, band(y === 3 ? d.accent : d.main));
  }
  // ...and over the crown in front of the ears
  for (let x = 0; x < 8; x++) px(t, NECK.top, x, 4, band(x === 3 || x === 4 ? d.accent : d.main));
  // (a knot of the contrasting thread where the cheek straps meet the noseband)
  px(t, NECK.right, 4, 5, dark);
  px(t, NECK.left, 1, 5, dark);
  return t;
}

for (const [c, col] of Object.entries(DYE)) {
  const main = col.wool;
  const light = ((main >> 16) & 255) + ((main >> 8) & 255) + (main & 255) > 380;
  MOB_TEXTURES['llama_decor_' + c] = () => decor({ main, trim: light ? mixC(main, 0x000000, 0.35) : mixC(main, 0xffffff, 0.3), accent: ACCENTS[c] ?? 0xeaeded }, 0xdec0 + c.length * 131 + c.charCodeAt(0));
}
// vanilla decor/trader_llama.png: the wandering trader's blue, trimmed in gold
MOB_TEXTURES['llama_decor_trader'] = () => decor({ main: 0x456296, trim: 0xeaa430, accent: 0x86a6db }, 0x7ade7);

// ---------------------------------------------------------------------------
// vanilla llama/spit.png (64x32): LlamaSpitModel's seven 2x2x2 gobs all share the one box's faces at (0, 0)

MOB_TEXTURES['llama_spit'] = () => {
  const t = img(64, 32);
  const r = new Rand(0x5917);
  const SPIT = [0xd9dbd2, 0xe6e8e0, 0xf1f2ec, 0xfafbf7];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) if (y >= 2 || (x >= 2 && x < 6)) setPx(t, x, y, SPIT[r.nextInt(SPIT.length)]);
  return t;
};
