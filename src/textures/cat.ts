// Cats (vanilla textures/entity/cat/<variant>.png, 64x32 on OcelotModel's layout) in the eleven coats of 1.21: the
// tabby, the tuxedo ("black"), the ginger ("red"), the siamese, the british shorthair, the calico, the persian, the
// ragdoll, the white, Jellie, and the all-black witch's cat. Each coat is darker along the spine and lighter on the
// belly and the chest; tabbies are striped across the back, down the legs and round the tail, with the M on the
// brow; the colourpoints have dark ears, masks, legs and tails; the calico is patched orange and black on white. The
// eyes (iris and slit) sit either side of the nose. And the collar (cat_collar.png), a band round the neck, pale to
// take the dye. And the ocelot (ocelot.png, the same layout): gold, spotted dark over the back and flanks, barred on the
// brow, ringed down the legs and the tail to its black tip. Original pixel art in the style of vanilla 1.21.

import { TexImage, img, mulC, mixC, Rand } from './tex';
import { MOB_TEXTURES, boxFaces, noiseFace, paintFace, drawFace, pick, type Face, type Pal } from './mobs';

type Pattern = 'plain' | 'tabby' | 'tuxedo' | 'points' | 'calico' | 'spots';

interface CatLook {
  seed: number;
  /** the coat */
  fur: Pal;
  /** along the spine */
  back: Pal;
  /** belly, chest, the muzzle */
  light: Pal;
  pattern: Pattern;
  /** stripes, points, or the calico's orange */
  mark?: Pal;
  /** the calico's black */
  mark2?: Pal;
  /** white socks, chest and muzzle (the tuxedo, Jellie, the ragdoll's paws) */
  white?: Pal;
  iris: number;
  pupil: number;
  nose: number;
  earIn: number;
}

const LOOKS: Record<string, CatLook> = {
  tabby: {
    seed: 0x7abb1, pattern: 'tabby',
    fur: [0x9a8468, 0x8f7a5f, 0xa38d70, 0x86715a],
    back: [0x7d6a52, 0x74614b, 0x86735a],
    light: [0xcdbd9f, 0xc3b394, 0xd6c7aa],
    mark: [0x4a3a2c, 0x54432f, 0x3f3226],
    iris: 0x9fc43a, pupil: 0x1e2410, nose: 0xc98476, earIn: 0xb88c7c,
  },
  black: {
    seed: 0xb1ac, pattern: 'tuxedo',
    fur: [0x252224, 0x1e1b1d, 0x2c282a, 0x19171a],
    back: [0x19171a, 0x151315, 0x1e1b1d],
    light: [0x2c282a, 0x332f31],
    white: [0xf2f0ee, 0xe8e6e3, 0xfbfaf8],
    iris: 0xd9c33a, pupil: 0x14120e, nose: 0xd48f8f, earIn: 0x5a4448,
  },
  red: {
    seed: 0x4ed, pattern: 'tabby',
    fur: [0xd98a3c, 0xcf8034, 0xe39646, 0xc4772f],
    back: [0xbf7332, 0xb56b2d, 0xc97c38],
    light: [0xf0cf9c, 0xe8c38c, 0xf6dbad],
    mark: [0xa85a26, 0x9e5323, 0xb2632b],
    iris: 0xd8b020, pupil: 0x2a1a08, nose: 0xd98b7a, earIn: 0xe0a080,
  },
  siamese: {
    seed: 0x51a3e5e, pattern: 'points',
    fur: [0xeee2cc, 0xe6d8bf, 0xf3e9d6, 0xdccdb2],
    back: [0xd9c8aa, 0xd1bf9f, 0xe0d0b4],
    light: [0xf6eedf, 0xf1e7d4],
    mark: [0x4a3528, 0x3f2d22, 0x55402f],
    iris: 0x5aa0e6, pupil: 0x1a2a44, nose: 0x3a2a22, earIn: 0x5a4034,
  },
  british_shorthair: {
    seed: 0xb5a1, pattern: 'plain',
    fur: [0x8e939b, 0x858a92, 0x979ca4, 0x7d8189],
    back: [0x767a82, 0x6e7279, 0x7e828a],
    light: [0xa7abb2, 0xb0b4bb, 0x9ea2a9],
    iris: 0xe39a2a, pupil: 0x2a1a08, nose: 0x5e5a62, earIn: 0x9a8a90,
  },
  calico: {
    seed: 0xca11c0, pattern: 'calico',
    fur: [0xf4f2ee, 0xebe8e3, 0xfbfaf7],
    back: [0xebe8e3, 0xe2dfda],
    light: [0xfbfaf7, 0xf4f2ee],
    mark: [0xd98636, 0xcf7c2f, 0xe3913f],
    mark2: [0x2a2626, 0x221f1f, 0x332e2e],
    iris: 0x86b83a, pupil: 0x1a2410, nose: 0xe0a0a0, earIn: 0xe8b0b0,
  },
  persian: {
    seed: 0xfe451a, pattern: 'plain',
    fur: [0xf0d4a8, 0xe8ca9c, 0xf6dfb8, 0xe0c090],
    back: [0xdcb584, 0xd4ab7a, 0xe3bf8e],
    light: [0xfbeed6, 0xf6e6c8, 0xfff4e2],
    iris: 0xe0a830, pupil: 0x2a1a08, nose: 0xd99a8a, earIn: 0xe8b09a,
  },
  ragdoll: {
    seed: 0x4a6d011, pattern: 'points',
    fur: [0xf1ece4, 0xe9e3d9, 0xf6f2ec],
    back: [0xe2dacd, 0xdbd2c4, 0xe8e1d6],
    light: [0xfaf7f2, 0xf6f2ec],
    mark: [0x8a7a6e, 0x7e6e62, 0x968679],
    white: [0xfaf8f4, 0xf3f0ea],
    iris: 0x6aa8ec, pupil: 0x1a2a44, nose: 0xd9a0a0, earIn: 0xb8a098,
  },
  white: {
    seed: 0x3417e, pattern: 'plain',
    fur: [0xf6f6f4, 0xefefec, 0xe7e7e4, 0xfbfbfa],
    back: [0xe4e4e1, 0xdcdcd9, 0xeaeae7],
    light: [0xffffff, 0xfbfbfa],
    iris: 0x7ec4ec, pupil: 0x1a2a44, nose: 0xeaa8a8, earIn: 0xf0b8b8,
  },
  jellie: {
    seed: 0x3e111e, pattern: 'tabby',
    fur: [0x8c8c8c, 0x828282, 0x969696, 0x7a7a7a],
    back: [0x6e6e6e, 0x666666, 0x767676],
    light: [0xb4b4b4, 0xbcbcbc],
    mark: [0x3c3c3c, 0x464646, 0x333333],
    white: [0xf2f2f0, 0xe8e8e6, 0xfafaf8],
    iris: 0x9ccc3c, pupil: 0x16200a, nose: 0xd49090, earIn: 0xc09898,
  },
  all_black: {
    seed: 0xa11b1ac, pattern: 'plain',
    fur: [0x1f1c22, 0x1a171d, 0x24212a, 0x161419],
    back: [0x161419, 0x121014, 0x1a171d],
    light: [0x24212a, 0x2a2730],
    iris: 0xc8e03a, pupil: 0x0a0a0a, nose: 0x2a2528, earIn: 0x3a2c30,
  },
};

// OcelotModel's boxes (texOffs and sizes)
const HEAD = boxFaces(0, 0, 5, 4, 5);
const NOSE = boxFaces(0, 24, 3, 2, 2);
const EARS = [boxFaces(0, 10, 1, 1, 2), boxFaces(6, 10, 1, 1, 2)];
const BODY = boxFaces(20, 0, 4, 16, 6);
const TAILS = [boxFaces(0, 15, 1, 8, 1), boxFaces(4, 15, 1, 8, 1)];
const LEGS = [boxFaces(8, 13, 2, 6, 2), boxFaces(40, 0, 2, 10, 2)];

/**
 * Paint a face by how near the spine each pixel is (1 on it, 0 on the belly): the darker back above, the coat
 * between, the light fur below, the edges a little ragged
 */
function shade(t: TexImage, f: Face, r: Rand, k: CatLook, dorsal: (x: number, y: number, w: number, h: number) => number, lift = 0): void {
  paintFace(t, f, (x, y, _c, w, h) => {
    const d = dorsal(x, y, w, h) + lift + (r.next() - 0.5) * 0.3;
    return d > 0.8 ? pick(r, k.back) : d > 0.25 ? pick(r, k.fur) : pick(r, k.light);
  });
}

const across = (x: number, w: number) => x / Math.max(1, w - 1);
const down = (y: number, h: number) => y / Math.max(1, h - 1);

function base(k: CatLook): TexImage {
  const t = img(64, 32);
  const r = new Rand(k.seed);

  // the body on its side: the back face is the spine, the front the belly, the top the chest (spine to belly down
  // it), the bottom the rump; the right face runs spine to belly across, the left belly to spine; rows run neck to tail
  shade(t, BODY.back, r, k, () => 1);
  shade(t, BODY.front, r, k, () => 0);
  shade(t, BODY.right, r, k, (x, _y, w) => 1 - across(x, w));
  shade(t, BODY.left, r, k, (x, _y, w) => across(x, w));
  shade(t, BODY.top, r, k, (_x, y, _w, h) => 0.7 - down(y, h) * 0.7);
  shade(t, BODY.bottom, r, k, () => 0.6);

  // the head: the crown and the back of it darker, the cheeks and throat lighter; the face (painted later)
  shade(t, HEAD.top, r, k, () => 0.85);
  shade(t, HEAD.back, r, k, (_x, y, _w, h) => 0.85 - down(y, h) * 0.4);
  shade(t, HEAD.right, r, k, (_x, y, _w, h) => 0.7 - down(y, h) * 0.6);
  shade(t, HEAD.left, r, k, (_x, y, _w, h) => 0.7 - down(y, h) * 0.6);
  shade(t, HEAD.front, r, k, (_x, y) => (y < 2 ? 0.6 : 0.35));
  shade(t, HEAD.bottom, r, k, () => 0);

  // the muzzle: light, the bridge of the nose the coat's colour behind; the nose at the front, the mouth under it
  noiseFace(t, NOSE.front, r, k.light);
  noiseFace(t, NOSE.right, r, k.light);
  noiseFace(t, NOSE.left, r, k.light);
  noiseFace(t, NOSE.bottom, r, k.light);
  noiseFace(t, NOSE.back, r, k.fur);
  shade(t, NOSE.top, r, k, (_x, y) => (y === 0 ? 0.5 : 0.1));
  drawFace(t, NOSE.front, ['.n.', '.m.'], { n: k.nose, m: mulC(k.light[0], 0.72) }, r);

  // ears: the coat outside, pink (or dark) within
  for (const e of EARS) {
    for (const f of [e.top, e.back, e.right, e.left, e.bottom]) shade(t, f, r, k, () => 0.9);
    paintFace(t, e.front, () => k.earIn);
  }

  // legs: the coat, a shade lighter behind, the pads dark
  for (const l of LEGS) {
    for (const f of [l.right, l.left, l.front]) shade(t, f, r, k, (_x, y, _w, h) => 0.55 - down(y, h) * 0.2);
    shade(t, l.back, r, k, () => 0.3);
    shade(t, l.top, r, k, () => 0.6);
    paintFace(t, l.bottom, () => mulC(pick(r, k.fur), 0.55));
  }

  // the tail: darker along its top (its back face), the coat round the rest
  for (const tl of TAILS) {
    shade(t, tl.back, r, k, () => 0.95);
    shade(t, tl.front, r, k, () => 0.5);
    shade(t, tl.right, r, k, () => 0.7);
    shade(t, tl.left, r, k, () => 0.7);
    shade(t, tl.top, r, k, () => 0.7);
    shade(t, tl.bottom, r, k, () => 0.7);
  }
  return t;
}

const TAIL_SIDES = (tl: ReturnType<typeof boxFaces>) => [tl.back, tl.front, tl.right, tl.left];
const LEG_SIDES = (l: ReturnType<typeof boxFaces>) => [l.right, l.left, l.front, l.back];

/** a tabby's stripes: across the back and down the flanks, rings on the legs and tail, a dark tip, the M on the brow */
function tabby(t: TexImage, r: Rand, k: CatLook): void {
  const m = k.mark!;
  const band = (f: Face, rows: number[], cover: (x: number, w: number) => boolean) =>
    paintFace(t, f, (x, y, w) => (rows.includes(y) && cover(x, w) && r.chance(0.92) ? pick(r, m) : undefined));
  const bodyRows = [1, 4, 7, 10, 13];
  band(BODY.back, bodyRows, () => true);
  band(BODY.right, bodyRows, (x, w) => x < w * 0.7);
  band(BODY.left, bodyRows, (x, w) => x >= w * 0.3);
  // the rump and the chest, a stripe each
  band(BODY.bottom, [1], () => true);
  band(BODY.top, [0], () => true);
  // the head: lines back over the crown from the brow (its top face's last row is the front), and down the cheeks
  paintFace(t, HEAD.top, (x, y) => ((x === 1 || x === 3) && r.chance(0.9) ? pick(r, m) : x === 2 && y % 2 === 0 ? pick(r, m) : undefined));
  drawFace(t, HEAD.front, ['m.m.m'], { m }, r);
  band(HEAD.right, [1], (x, w) => x < w - 1);
  band(HEAD.left, [1], (x) => x > 0);
  band(HEAD.back, [0, 2], () => true);
  for (const l of LEGS) for (const f of LEG_SIDES(l)) band(f, l === LEGS[0] ? [1, 3] : [1, 4, 7], () => true);
  for (const tl of TAILS) for (const f of TAIL_SIDES(tl)) band(f, [1, 4, 7], () => true);
  for (const f of TAIL_SIDES(TAILS[1])) paintFace(t, f, (_x, y, _w, h) => (y >= h - 2 ? pick(r, m) : undefined));
}

/** white socks, chest and belly, and a white muzzle (the tuxedo; Jellie too) */
function whiteParts(t: TexImage, r: Rand, k: CatLook, socks: number): void {
  const w = k.white!;
  paintFace(t, BODY.front, () => pick(r, w));
  paintFace(t, BODY.top, (_x, y, _w, h) => (y >= h * 0.3 ? pick(r, w) : undefined));
  paintFace(t, BODY.right, (x, y, wd) => (x === wd - 1 || (x === wd - 2 && y < 5) ? pick(r, w) : undefined));
  paintFace(t, BODY.left, (x, y) => (x === 0 || (x === 1 && y < 5) ? pick(r, w) : undefined));
  paintFace(t, HEAD.bottom, () => pick(r, w));
  drawFace(t, HEAD.front, ['.....', '.....', 'w...w', 'w...w'], { w }, r);
  for (const f of [NOSE.front, NOSE.right, NOSE.left, NOSE.bottom]) paintFace(t, f, (x, y, _c, _w, _h) => (f === NOSE.front && x === 1 ? undefined : pick(r, w)));
  drawFace(t, NOSE.front, ['.n.', '.w.'], { n: k.nose, w }, r);
  paintFace(t, NOSE.top, (_x, y) => (y === 1 ? pick(r, w) : undefined));
  for (const l of LEGS) {
    for (const f of LEG_SIDES(l)) paintFace(t, f, (_x, y, _w, h) => (y >= h - socks ? pick(r, w) : undefined));
    paintFace(t, l.bottom, () => mulC(pick(r, w), 0.8));
  }
}

/** a colourpoint: the ears, a mask over the face, the legs and the tail dark */
function points(t: TexImage, r: Rand, k: CatLook): void {
  const m = k.mark!;
  for (const e of EARS) for (const f of [e.top, e.back, e.right, e.left, e.bottom]) paintFace(t, f, () => pick(r, m));
  drawFace(t, HEAD.front, ['.mmm.', '.m.m.', 'mmmmm', 'mmmmm'], { m }, r);
  for (const f of [NOSE.front, NOSE.right, NOSE.left, NOSE.top, NOSE.bottom]) paintFace(t, f, () => pick(r, m));
  drawFace(t, NOSE.front, ['.n.', '...'], { n: k.nose }, r);
  // the mask fades back over the cheeks (the right face's front is its last column, the left's its first)
  paintFace(t, HEAD.right, (x, y, w) => (x >= w - 2 && y >= 1 && r.chance(x === w - 1 ? 0.9 : 0.5) ? pick(r, m) : undefined));
  paintFace(t, HEAD.left, (x, y) => (x <= 1 && y >= 1 && r.chance(x === 0 ? 0.9 : 0.5) ? pick(r, m) : undefined));
  paintFace(t, HEAD.top, (_x, y, _w, h) => (y === h - 1 && r.chance(0.6) ? pick(r, m) : undefined));
  for (const l of LEGS) {
    for (const f of LEG_SIDES(l)) paintFace(t, f, (_x, y, _w, h) => (y >= h * 0.35 || r.chance(0.3) ? pick(r, m) : undefined));
    paintFace(t, l.bottom, () => mulC(pick(r, m), 0.7));
  }
  for (const tl of TAILS) for (const f of [...TAIL_SIDES(tl), tl.top, tl.bottom]) paintFace(t, f, () => pick(r, m));
  // a faint shadow of the colour along the spine
  paintFace(t, BODY.back, () => (r.chance(0.25) ? mixC(pick(r, k.back), m[0], 0.35) : undefined));
}

/** the calico: patches of orange and black over the white, the belly, chest and paws left white */
function calico(t: TexImage, r: Rand, k: CatLook): void {
  const orange = k.mark!, black = k.mark2!;
  const patchy = (f: Face, keep: (x: number, y: number, w: number, h: number) => boolean) => {
    const [, , w, h] = f;
    // a coarse random field, one value per 3x3 cell, so the patches come in blobs
    const cw = Math.ceil(w / 3) + 1, ch = Math.ceil(h / 3) + 1;
    const cells = Array.from({ length: cw * ch }, () => r.next());
    paintFace(t, f, (x, y) => {
      if (!keep(x, y, w, h)) return undefined;
      const v = cells[Math.floor(y / 3) * cw + Math.floor(x / 3)] + (r.next() - 0.5) * 0.15;
      return v < 0.32 ? pick(r, orange) : v < 0.52 ? pick(r, black) : undefined;
    });
  };
  patchy(BODY.back, () => true);
  patchy(BODY.right, (x, _y, w) => x < w - 2);
  patchy(BODY.left, (x) => x > 1);
  patchy(BODY.bottom, () => true);
  patchy(HEAD.top, () => true);
  patchy(HEAD.back, () => true);
  patchy(HEAD.right, (_x, y) => y < 2);
  patchy(HEAD.left, (_x, y) => y < 2);
  // one eye patch of each colour across the brow
  drawFace(t, HEAD.front, ['oo.bb'], { o: orange, b: black }, r);
  for (const [i, e] of EARS.entries()) for (const f of [e.top, e.back, e.right, e.left]) paintFace(t, f, () => pick(r, i === 0 ? orange : black));
  for (const tl of TAILS) for (const f of TAIL_SIDES(tl)) paintFace(t, f, (_x, y) => pick(r, y % 4 < 2 ? orange : black));
  patchy(LEGS[0].right, (_x, y) => y < 3);
  patchy(LEGS[1].left, (_x, y) => y < 5);
}

/** the ocelot: dark spots over the back and flanks (not the belly), bars over the brow, rings down the legs and the tail */
function spots(t: TexImage, r: Rand, k: CatLook): void {
  const m = k.mark!;
  // a spot is a pixel and one more beside or below it, dropped at random where `keep` allows
  const scatter = (f: Face, n: number, keep: (x: number, y: number, w: number, h: number) => boolean = () => true) => {
    const [, , w, h] = f;
    for (let i = 0; i < n; i++) {
      const x = r.nextInt(w), y = r.nextInt(h);
      if (!keep(x, y, w, h)) continue;
      const [dx, dy] = r.chance(0.5) ? [1, 0] : [0, 1];
      paintFace(t, f, (px, py, _c, fw, fh) => ((px === x && py === y) || (px === x + dx && py === y + dy && px < fw && py < fh) ? pick(r, m) : undefined));
    }
  };
  scatter(BODY.back, 30);
  scatter(BODY.right, 22, (x, _y, w) => x < w - 2);
  scatter(BODY.left, 22, (x) => x > 1);
  scatter(BODY.bottom, 5);
  scatter(BODY.top, 3, (_x, y) => y < 2);
  // the head: bars back over the crown, a line down each cheek, spots behind
  paintFace(t, HEAD.top, (x, y) => ((x === 1 || x === 3) && y > 0 && r.chance(0.85) ? pick(r, m) : undefined));
  drawFace(t, HEAD.front, ['.m.m.'], { m }, r);
  paintFace(t, HEAD.right, (x, y, w) => (y === 2 && x < w - 1 && r.chance(0.8) ? pick(r, m) : undefined));
  paintFace(t, HEAD.left, (x, y) => (y === 2 && x > 0 && r.chance(0.8) ? pick(r, m) : undefined));
  scatter(HEAD.back, 4);
  for (const l of LEGS) for (const f of LEG_SIDES(l)) scatter(f, l === LEGS[0] ? 2 : 3);
  // the tail: rings, then the last two pixels black
  for (const tl of TAILS) for (const f of TAIL_SIDES(tl)) paintFace(t, f, (_x, y) => (y % 3 === 1 ? pick(r, m) : undefined));
  for (const f of [...TAIL_SIDES(TAILS[1]), TAILS[1].bottom]) paintFace(t, f, (_x, y, _w, h) => (f === TAILS[1].bottom || y >= h - 2 ? pick(r, m) : undefined));
}

/** the face: an eye either side of the nose (the iris out, the slit in) */
function face(t: TexImage, k: CatLook, r: Rand): void {
  drawFace(t, HEAD.front, ['.....', 'ip.pi'], { i: k.iris, p: k.pupil }, r);
}

function catTexture(k: CatLook): () => TexImage {
  return () => {
    const t = base(k);
    const r = new Rand(k.seed ^ 0x9a77e);
    if (k.pattern === 'tabby') tabby(t, r, k);
    if (k.pattern === 'tuxedo') whiteParts(t, r, k, 3);
    if (k.pattern === 'points') {
      points(t, r, k);
      // (the ragdoll's white mittens)
      if (k.white) for (const l of LEGS) for (const f of LEG_SIDES(l)) paintFace(t, f, (_x, y, _w, h) => (y >= h - 1 ? pick(r, k.white!) : undefined));
    }
    if (k.pattern === 'calico') calico(t, r, k);
    if (k.pattern === 'spots') spots(t, r, k);
    // (Jellie: a grey tabby with a white chest and socks)
    if (k.pattern === 'tabby' && k.white) whiteParts(t, r, k, 2);
    face(t, k, r);
    return t;
  };
}

for (const [name, k] of Object.entries(LOOKS)) MOB_TEXTURES['cat_' + name] = catTexture(k);

/** vanilla ocelot.png */
MOB_TEXTURES.ocelot = catTexture({
  seed: 0x0ce107, pattern: 'spots',
  fur: [0xe2b660, 0xdaac56, 0xeac06a, 0xd2a24e],
  back: [0xc8983f, 0xbf8f3a, 0xd0a147],
  light: [0xf4e3b6, 0xefd9a4, 0xf8ebcc],
  mark: [0x3b2b1a, 0x2f2215, 0x46341f],
  iris: 0x8fc43c, pupil: 0x16200a, nose: 0xb8765a, earIn: 0xd49a78,
});

/** vanilla cat_collar.png: a band round the body just behind the head, pale to take the dye */
MOB_TEXTURES.cat_collar = () => {
  const t = img(64, 32);
  const r = new Rand(0xca7c0);
  for (const f of [BODY.right, BODY.front, BODY.left, BODY.back]) {
    paintFace(t, f, (_x, y) => (y === 0 ? (r.chance(0.3) ? 0xeeeeee : 0xffffff) : y === 1 ? 0xcfcfcf : null));
  }
  return t;
};
