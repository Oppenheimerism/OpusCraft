// Horses, donkeys and mules (vanilla textures/entity/horse/: horse_<coat>.png, horse_markings_<kind>.png, donkey.png,
// mule.png and armor/horse_armor_<material>.png, 64x64 on HorseModel's layout). The seven coats: white, creamy,
// chestnut, brown (a bay, its legs black below the knee), black, gray and dark brown, each lit along the back and
// darker to the belly, with a mane and tail in strands, dark hooves, a dark eye, and the nostrils on a darker nose.
// As in 1.21.0 the saddle and bridle are in the coat's own sheet (the saddle parts show only when saddled): a brown
// leather seat with its flaps, girth and a steel stirrup, the headstall, noseband and bit rings, and the reins. The
// markings go over the coat: white stockings and a blaze; the paint horse's great white patches; white dots
// thickening toward the rump; black dapples. The donkey is grey-brown with a pale nose and belly, a dark stripe down
// its back and across its shoulders, and long dark-tipped ears; the mule is a dark brown with a tan nose; both carry
// their chests' planks in their sheets. The armour: iron, gold and diamond plates over the head, neck, body and knees,
// and quilted leather (grey here, the dye tinting it). Original pixel art in the style of vanilla 1.21.

import { type TexImage, img, mulC, mixC } from './tex';
import { Rand } from '../core/rng';
import { MOB_TEXTURES, boxFaces, paintFace, drawFace, pick, type Face, type Pal } from './mobs';

// vanilla HorseModel.createBodyMesh's boxes (and ChestedHorseModel's chests and long ears)
const BODY = boxFaces(0, 32, 10, 10, 22);
const NECK = boxFaces(0, 35, 4, 12, 7);
const HEAD = boxFaces(0, 13, 6, 5, 7);
const MANE = boxFaces(56, 36, 2, 16, 2);
const MUZZLE = boxFaces(0, 25, 4, 5, 5);
const LEG = boxFaces(48, 21, 4, 11, 4);
const TAIL = boxFaces(42, 36, 3, 14, 4);
const EAR = boxFaces(19, 16, 2, 3, 1);
const SADDLE = boxFaces(26, 0, 10, 9, 9);
const BIT = boxFaces(29, 5, 1, 2, 2);
/** the reins (0 wide: only their two sides have pixels) */
const REINS: Face[] = [[32, 18, 16, 3], [48, 18, 16, 3]];
const BRIDLE = boxFaces(1, 1, 6, 5, 6);
const NOSEBAND = boxFaces(19, 0, 4, 5, 2);
const CHEST = boxFaces(26, 21, 8, 8, 3);
const LONG_EAR = boxFaces(0, 12, 2, 7, 1);

const LEG_SIDES = [LEG.right, LEG.front, LEG.left, LEG.back];

interface HorseLook {
  seed: number;
  coat: Pal;
  /** along the back, the lit side */
  light: Pal;
  /** toward the belly */
  shade: Pal;
  mane: Pal;
  /** the darker strands */
  maneDark: Pal;
  /** below the knee, from row `legsFrom` of the leg (a bay's black points) */
  legs?: Pal;
  legsFrom?: number;
  hoof: Pal;
  /** the end of the nose */
  muzzle: Pal;
  nostril: number;
  eye: Pal;
  earIn: number;
  /** a donkey's pale belly */
  paleBelly?: boolean;
}

const COATS: Record<string, HorseLook> = {
  white: {
    seed: 0x3417e1,
    coat: [0xe6e4df, 0xdddbd6, 0xefede9, 0xd4d2cd], light: [0xf5f4f1, 0xfaf9f7], shade: [0xc6c3bd, 0xbcb9b3],
    mane: [0xdcdad4, 0xcfccc6, 0xe8e6e1], maneDark: [0xb9b5ae, 0xaca8a1],
    hoof: [0x6f6862, 0x655e58, 0x7a736c], muzzle: [0xb9b0aa, 0xafa6a0], nostril: 0x5f5650, eye: [0x231d1a, 0x2f2724], earIn: 0xb8aca8,
  },
  creamy: {
    seed: 0xc4ea3,
    coat: [0xc9a36a, 0xc09a62, 0xd2ad74, 0xb89259], light: [0xdcbc88, 0xe2c592], shade: [0xa6834f, 0x9d7b48],
    mane: [0xe7d6ae, 0xdecb9f, 0xefe0bc], maneDark: [0xcdb88a, 0xc2ad7f],
    hoof: [0x5e4d3c, 0x514334, 0x685644], muzzle: [0x8f765c, 0x846c53], nostril: 0x3b2f25, eye: [0x1e1712, 0x2a2019], earIn: 0x7e6750,
  },
  chestnut: {
    seed: 0xc4e57,
    coat: [0xa3582a, 0x9a5026, 0xad612f, 0x914a22], light: [0xb86c38, 0xc0743e], shade: [0x80401c, 0x773a19],
    mane: [0x7e3f1c, 0x733819, 0x8a4720], maneDark: [0x5e2c13, 0x542710],
    hoof: [0x4a3a30, 0x40322a, 0x544338], muzzle: [0x6a3720, 0x60311c], nostril: 0x2a170e, eye: [0x1a0f0a, 0x24150e], earIn: 0x5a2e18,
  },
  brown: {
    seed: 0xb40a,
    coat: [0x7b4f2c, 0x714828, 0x855631, 0x684223], light: [0x8f6139, 0x96673d], shade: [0x5d3b20, 0x55361d],
    mane: [0x2a211c, 0x231c18, 0x322822], maneDark: [0x171210, 0x1c1613],
    legs: [0x2e241e, 0x281f1a, 0x352a23], legsFrom: 5,
    hoof: [0x3c3531, 0x342e2a, 0x453d38], muzzle: [0x45311f, 0x3e2c1c], nostril: 0x170f0a, eye: [0x120c09, 0x1c130e], earIn: 0x3a281a,
  },
  black: {
    seed: 0xb1ac4,
    coat: [0x2b2826, 0x252220, 0x322e2b, 0x201d1b], light: [0x3b3633, 0x423c38], shade: [0x1b1917, 0x171514],
    mane: [0x1a1817, 0x151312, 0x201e1c], maneDark: [0x0f0e0d, 0x121110],
    hoof: [0x3a3633, 0x322f2c, 0x433e3a], muzzle: [0x3a3531, 0x332f2b], nostril: 0x0c0b0a, eye: [0x080706, 0x121010], earIn: 0x1c1a19,
  },
  gray: {
    seed: 0x62a7,
    coat: [0x8c8884, 0x827e7a, 0x96928e, 0x787470], light: [0xa29e9a, 0xaaa6a2], shade: [0x6b6764, 0x635f5c],
    mane: [0x4d4a47, 0x444140, 0x57534f], maneDark: [0x363432, 0x3c3937],
    hoof: [0x45403c, 0x3c3834, 0x4e4944], muzzle: [0x5c5855, 0x534f4c], nostril: 0x232120, eye: [0x141211, 0x1e1b1a], earIn: 0x55504d,
  },
  dark_brown: {
    seed: 0xd4b40,
    coat: [0x4f3423, 0x472f1f, 0x583a27, 0x3f2a1c], light: [0x60412c, 0x664530], shade: [0x39261a, 0x332217],
    mane: [0x1d1512, 0x18110e, 0x231a16], maneDark: [0x100b09, 0x140e0b],
    legs: [0x241a15, 0x1f1612, 0x2a1f19], legsFrom: 6,
    hoof: [0x2f2925, 0x28231f, 0x37302b], muzzle: [0x2f2118, 0x291d15], nostril: 0x0d0906, eye: [0x0b0806, 0x140e0b], earIn: 0x2a1c14,
  },
};

const DONKEY: HorseLook = {
  seed: 0xd0e1,
  coat: [0x8b7e70, 0x827567, 0x94877a, 0x796c5f], light: [0x9c8f81, 0xa39688], shade: [0x6d6155, 0x65594e],
  mane: [0x4a3f36, 0x41372f, 0x54483e], maneDark: [0x2f2721, 0x362d26],
  hoof: [0x3a322c, 0x322b26, 0x433a33], muzzle: [0xcfc5b9, 0xc6bbae, 0xd8cfc4], nostril: 0x3d342d, eye: [0x15110e, 0x201a16], earIn: 0xbfb2a4,
  paleBelly: true,
};
const MULE: HorseLook = {
  seed: 0x3e1e,
  coat: [0x5a4030, 0x513a2b, 0x634636, 0x4a3426], light: [0x6b4d3a, 0x72523e], shade: [0x43302a, 0x3d2b24],
  mane: [0x2a201a, 0x241b16, 0x31261f], maneDark: [0x17110e, 0x1c1511],
  hoof: [0x2e2722, 0x27211d, 0x362e28], muzzle: [0xa08468, 0x967a60, 0xa98d71], nostril: 0x2c2019, eye: [0x100b09, 0x1a120e], earIn: 0x8c7058,
};

const down = (y: number, h: number) => y / Math.max(1, h - 1);
const across = (x: number, w: number) => x / Math.max(1, w - 1);

/** paint a face by how high on the horse each pixel sits (1 along the back, 0 the belly), a little ragged */
function fur(t: TexImage, f: Face, r: Rand, k: HorseLook, lit: (x: number, y: number, w: number, h: number) => number): void {
  paintFace(t, f, (x, y, _c, w, h) => {
    const d = lit(x, y, w, h) + (r.next() - 0.5) * 0.16;
    return d > 0.82 ? pick(r, k.light) : d > 0.22 ? pick(r, k.coat) : pick(r, k.shade);
  });
}

/** the coat, the face, the mane and tail (no tack) */
function coat(k: HorseLook, longEars: boolean): TexImage {
  const t = img(64, 64);
  const r = new Rand(k.seed);

  // the body (not turned: its top is the back, rows from the rump forward; the right side's front is its last column)
  fur(t, BODY.top, r, k, () => 0.92);
  fur(t, BODY.right, r, k, (_x, y, _w, h) => 0.88 - down(y, h) * 0.8);
  fur(t, BODY.left, r, k, (_x, y, _w, h) => 0.88 - down(y, h) * 0.8);
  fur(t, BODY.front, r, k, (_x, y, _w, h) => 0.7 - down(y, h) * 0.6);
  fur(t, BODY.back, r, k, (_x, y, _w, h) => 0.78 - down(y, h) * 0.65);
  fur(t, BODY.bottom, r, k, () => 0.05);
  if (k.paleBelly) {
    // (the belly pale, shading into the flanks over their last two rows)
    paintFace(t, BODY.bottom, () => pick(r, k.muzzle));
    for (const f of [BODY.right, BODY.left, BODY.front])
      paintFace(t, f, (_x, y, c, _w, h) => (y === h - 1 ? mixC(c, pick(r, k.muzzle), 0.75) : y === h - 2 && r.chance(0.6) ? mixC(c, pick(r, k.muzzle), 0.4) : undefined));
  }

  // the neck: the crest (behind, under the mane) lit, the throat (in front) darker
  fur(t, NECK.right, r, k, (x, _y, w) => 0.85 - across(x, w) * 0.55);
  fur(t, NECK.left, r, k, (x, _y, w) => 0.3 + across(x, w) * 0.55);
  fur(t, NECK.front, r, k, () => 0.28);
  fur(t, NECK.back, r, k, () => 0.8);
  fur(t, NECK.top, r, k, () => 0.6);
  fur(t, NECK.bottom, r, k, () => 0.4);

  // the head; the nose's end (the muzzle's front rows and columns) darker, the nostrils and the mouth on its front
  fur(t, HEAD.top, r, k, () => 0.88);
  fur(t, HEAD.right, r, k, (_x, y, _w, h) => 0.72 - down(y, h) * 0.4);
  fur(t, HEAD.left, r, k, (_x, y, _w, h) => 0.72 - down(y, h) * 0.4);
  fur(t, HEAD.front, r, k, () => 0.6);
  fur(t, HEAD.back, r, k, () => 0.6);
  fur(t, HEAD.bottom, r, k, () => 0.25);
  fur(t, MUZZLE.top, r, k, () => 0.7);
  fur(t, MUZZLE.right, r, k, (_x, y, _w, h) => 0.62 - down(y, h) * 0.35);
  fur(t, MUZZLE.left, r, k, (_x, y, _w, h) => 0.62 - down(y, h) * 0.35);
  fur(t, MUZZLE.back, r, k, () => 0.5);
  paintFace(t, MUZZLE.top, (_x, y, _c, _w, h) => (y >= h - 2 ? pick(r, k.muzzle) : undefined));
  paintFace(t, MUZZLE.right, (x, _y, _c, w) => (x >= w - 2 ? pick(r, k.muzzle) : undefined));
  paintFace(t, MUZZLE.left, (x) => (x <= 1 ? pick(r, k.muzzle) : undefined));
  paintFace(t, MUZZLE.front, () => pick(r, k.muzzle));
  paintFace(t, MUZZLE.bottom, () => pick(r, k.muzzle));
  drawFace(t, MUZZLE.front, ['....', 'n..n', '....', '.mm.'], { n: k.nostril, m: mulC(k.muzzle[0], 0.72) }, r);
  // an eye each side, toward the front of the head (the right side's front is its last column)
  drawFace(t, HEAD.right, ['.......', '....ee.'], { e: k.eye }, r);
  drawFace(t, HEAD.left, ['.......', '.ee....'], { e: k.eye }, r);

  // the ears: a horse's short ones, or a donkey's or mule's long ones, dark at the tips; pale within
  if (!longEars) {
    for (const f of [EAR.top, EAR.right, EAR.left, EAR.back, EAR.bottom]) fur(t, f, r, k, () => 0.7);
    paintFace(t, EAR.front, (_x, y) => (y === 0 ? pick(r, k.coat) : k.earIn));
  } else {
    for (const f of [LONG_EAR.right, LONG_EAR.left, LONG_EAR.back, LONG_EAR.bottom]) paintFace(t, f, (_x, y) => (y <= 1 ? pick(r, k.maneDark) : pick(r, k.coat)));
    paintFace(t, LONG_EAR.top, () => pick(r, k.maneDark));
    paintFace(t, LONG_EAR.front, (_x, y, _c, _w, h) => (y <= 1 ? pick(r, k.maneDark) : y === h - 1 ? pick(r, k.coat) : k.earIn));
  }

  // the legs: the coat, a shade darker down to the knee, then any darker points, then the hooves
  const from = k.legsFrom ?? 99;
  for (const f of LEG_SIDES)
    paintFace(t, f, (_x, y, _c, _w, h) => {
      if (y >= h - 2) return pick(r, k.hoof);
      if (y >= from || (y === from - 1 && r.chance(0.4))) return pick(r, k.legs!);
      const d = 0.62 - down(y, h) * 0.45 + (r.next() - 0.5) * 0.16;
      return d > 0.82 ? pick(r, k.light) : d > 0.22 ? pick(r, k.coat) : pick(r, k.shade);
    });
  fur(t, LEG.top, r, k, () => 0.6);
  paintFace(t, LEG.bottom, () => mulC(pick(r, k.hoof), 0.8));

  // the mane and the tail, in strands: each column its own shade, a darker hair here and there
  const strands = (f: Face) => {
    const cols = Array.from({ length: f[2] }, () => (r.chance(0.3) ? k.maneDark : k.mane));
    paintFace(t, f, (x) => pick(r, r.chance(0.12) ? k.maneDark : cols[x]));
  };
  for (const f of [MANE.right, MANE.front, MANE.left, MANE.back, MANE.top, MANE.bottom]) strands(f);
  for (const f of [TAIL.right, TAIL.front, TAIL.left, TAIL.back, TAIL.top, TAIL.bottom]) strands(f);
  // (the crest the mane grows from, behind it, and a forelock between the ears)
  paintFace(t, NECK.back, (x, _y, _c, w) => (x >= 1 && x <= w - 2 ? pick(r, k.mane) : undefined));
  paintFace(t, HEAD.top, (x, y) => (y <= 1 && (x === 2 || x === 3) ? pick(r, k.mane) : undefined));
  return t;
}

const LEATHER: Pal = [0x8b5a2b, 0x82532a, 0x95622f];
const LEATHER_DARK: Pal = [0x5e391a, 0x553318];
const LEATHER_LIGHT: Pal = [0xa56f3a, 0xae7842];
const STEEL: Pal = [0xbdbdbd, 0xaaaaaa, 0xcfcfcf];

/** the saddle, bridle and reins, in the coat's sheet (vanilla 1.21.0: HorseModel's saddle parts use the coat's texture) */
function tack(t: TexImage, r: Rand): void {
  const L = LEATHER, D = LEATHER_DARK, H = LEATHER_LIGHT;
  // the seat from above (its rear the first row): the cantle's edge and top, the seat, the pommel's top and edge
  paintFace(t, SADDLE.top, (x, y, _c, w, h) => (y === 0 || y === h - 1 ? pick(r, D) : y === 1 || y === h - 2 ? pick(r, H) : x === 0 || x === w - 1 ? pick(r, D) : pick(r, L)));
  // a flap down each side with the girth under it and a stirrup hanging (the right side's front is its last column)
  const side = ['DDDDDDDDD', 'DLLLLLLLD', 'DLLHLLLLD', 'DDDDDDDDD', '...GG.S..', '...GG.S..', '...GGM.M.', '...GGMMM.', '...GG....'];
  drawFace(t, SADDLE.right, side, { D, L, H, G: D, S: L, M: STEEL }, r);
  drawFace(t, SADDLE.left, side.map((row) => [...row].reverse().join('')), { D, L, H, G: D, S: L, M: STEEL }, r);
  // the pommel's and the cantle's faces: they only show above the back and round its edges
  const end = ['DDDDDDDDDD', 'LLLLLLLLLL', 'L........L', 'D........D'];
  drawFace(t, SADDLE.front, end, { D, L }, r);
  drawFace(t, SADDLE.back, end, { D, L }, r);
  // the bit's rings
  for (const f of [BIT.top, BIT.bottom, BIT.right, BIT.front, BIT.left, BIT.back]) paintFace(t, f, () => pick(r, STEEL));
  // the reins: a strap along the middle of each strip
  for (const f of REINS) paintFace(t, f, (_x, y) => (y === 1 ? pick(r, D) : undefined));
  // the headstall: the crownpiece behind the ears and the browband over the forehead, the cheek straps, the throatlatch
  paintFace(t, BRIDLE.top, (_x, y, _c, _w, h) => (y === 0 || y === h - 1 ? pick(r, L) : undefined));
  drawFace(t, BRIDLE.right, ['.LLLLL', '.L....', '.L....', '.L....', '.L....'], { L }, r);
  drawFace(t, BRIDLE.left, ['LLLLL.', '....L.', '....L.', '....L.', '....L.'], { L }, r);
  for (const f of [BRIDLE.front, BRIDLE.back, BRIDLE.bottom]) drawFace(t, f, ['LLLLLL'], { L }, r);
  // the noseband: a band two wide round the nose
  for (const f of [NOSEBAND.top, NOSEBAND.right, NOSEBAND.left, NOSEBAND.bottom]) paintFace(t, f, (x, _y, _c, w) => pick(r, x === 0 || x === w - 1 ? D : L));
}

const PLANK: Pal = [0xa77a3e, 0x9b7039, 0xb28545];
const PLANK_DARK = 0x5b4121;

/** a donkey's or mule's chest (ChestedHorseModel's, one each side), its lid and latch outward */
function chest(t: TexImage, r: Rand): void {
  for (const f of [CHEST.top, CHEST.bottom, CHEST.right, CHEST.front, CHEST.left, CHEST.back])
    paintFace(t, f, (x, y, _c, w, h) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? PLANK_DARK : y % 3 === 1 && r.chance(0.3) ? mulC(pick(r, PLANK), 0.88) : pick(r, PLANK)));
  drawFace(t, CHEST.front, ['........', '........', 'DDDMMDDD', '...MM...'], { D: PLANK_DARK, M: STEEL }, r);
}

function horse(coatName: string): TexImage {
  const k = COATS[coatName];
  const t = coat(k, false);
  tack(t, new Rand(k.seed ^ 0x5add1e));
  return t;
}

/** the donkey's stripe down its back and its cross over the shoulders; the tail's tuft */
function donkey(): TexImage {
  const k = DONKEY;
  const t = coat(k, true);
  const r = new Rand(k.seed ^ 0x57e1);
  paintFace(t, BODY.top, (x) => (x === 4 || x === 5 ? pick(r, k.mane) : undefined));
  paintFace(t, BODY.right, (x, y, _c, w) => (y <= 3 && x === w - 4 ? pick(r, k.mane) : undefined));
  paintFace(t, BODY.left, (x, y) => (y <= 3 && x === 3 ? pick(r, k.mane) : undefined));
  for (const f of [TAIL.right, TAIL.front, TAIL.left, TAIL.back]) paintFace(t, f, (_x, y, _c, _w, h) => (y < h - 5 ? pick(r, k.coat) : undefined));
  tack(t, new Rand(k.seed ^ 0x5add1e));
  chest(t, r);
  return t;
}

function mule(): TexImage {
  const k = MULE;
  const t = coat(k, true);
  const r = new Rand(k.seed ^ 0x57e1);
  for (const f of [TAIL.right, TAIL.front, TAIL.left, TAIL.back]) paintFace(t, f, (_x, y, _c, _w, h) => (y < h - 6 ? pick(r, k.coat) : undefined));
  tack(t, new Rand(k.seed ^ 0x5add1e));
  chest(t, r);
  return t;
}

// ---------------------------------------------------------------------------
// the markings, over the coat

const WHITE: Pal = [0xf4f3ef, 0xeae9e4, 0xfbfaf7];
const DARK: Pal = [0x2b2420, 0x241e1a, 0x342c27];

/** a white blaze down the forehead (the head's top: its last row the front) and the nose, to above the nostrils */
function blaze(t: TexImage, r: Rand, wide: boolean): void {
  const mid = (x: number, w: number) => Math.abs(x - (w - 1) / 2) <= (wide ? 1.5 : 0.5);
  paintFace(t, HEAD.top, (x, y, _c, w, h) => (mid(x, w) && y >= h - 4 ? pick(r, WHITE) : undefined));
  paintFace(t, HEAD.front, (x, _y, _c, w) => (mid(x, w) ? pick(r, WHITE) : undefined));
  paintFace(t, MUZZLE.top, (x, _y, _c, w) => (mid(x, w) ? pick(r, WHITE) : undefined));
  paintFace(t, MUZZLE.front, (x, y, _c, w) => (mid(x, w) && y === 0 ? pick(r, WHITE) : undefined));
}

function markings(kind: string): TexImage {
  const t = img(64, 64);
  const r = new Rand(0x4a11 ^ (kind.length * 7919) ^ kind.charCodeAt(kind.length - 1));
  if (kind === 'white') {
    // white stockings on all four legs, a ragged top to them, and the blaze
    for (const f of LEG_SIDES) paintFace(t, f, (_x, y, _c, _w, h) => (y < h - 2 && (y >= h - 6 || (y === h - 7 && r.chance(0.5))) ? pick(r, WHITE) : undefined));
    blaze(t, r, false);
  } else if (kind === 'white_field') {
    // the paint horse: great white patches over the flanks (thicker low down), the belly, the throat and the legs
    const patchy = (f: Face, bias: (x: number, y: number, w: number, h: number) => number) => {
      const [, , w, h] = f;
      const cw = Math.ceil(w / 4) + 1;
      const cells = Array.from({ length: cw * (Math.ceil(h / 4) + 1) }, () => r.next());
      paintFace(t, f, (x, y) => (cells[Math.floor(y / 4) * cw + Math.floor(x / 4)] + bias(x, y, w, h) + (r.next() - 0.5) * 0.15 > 0.72 ? pick(r, WHITE) : undefined));
    };
    patchy(BODY.right, (_x, y, _w, h) => down(y, h) * 0.45);
    patchy(BODY.left, (_x, y, _w, h) => down(y, h) * 0.45);
    patchy(BODY.top, () => -0.15);
    patchy(BODY.front, (_x, y, _w, h) => down(y, h) * 0.4);
    patchy(BODY.back, (_x, y, _w, h) => down(y, h) * 0.4);
    paintFace(t, BODY.bottom, () => pick(r, WHITE));
    patchy(NECK.right, (x, _y, w) => across(x, w) * 0.3);
    patchy(NECK.left, (x, _y, w) => (1 - across(x, w)) * 0.3);
    patchy(NECK.front, () => 0.2);
    for (const f of LEG_SIDES) paintFace(t, f, (_x, y, _c, _w, h) => (y < h - 2 && (y >= 3 || r.chance(0.5)) ? pick(r, WHITE) : undefined));
    blaze(t, r, true);
  } else {
    // spots over the body: white ones thickening toward the rump (a blanket), or dark dapples all over
    const white = kind === 'white_dots';
    const pal = white ? WHITE : DARK;
    const [even, rear] = white ? [0.05, 0.36] : [0.1, 0.06];
    const dots = (f: Face, p: (x: number, y: number, w: number, h: number) => number) => paintFace(t, f, (x, y, _c, w, h) => (r.next() < p(x, y, w, h) ? pick(r, pal) : undefined));
    dots(BODY.top, (_x, y, _w, h) => even + rear * (1 - down(y, h)));
    dots(BODY.right, (x, y, w, h) => (even + rear * (1 - across(x, w))) * (1 - down(y, h) * 0.5));
    dots(BODY.left, (x, y, w, h) => (even + rear * across(x, w)) * (1 - down(y, h) * 0.5));
    dots(BODY.back, () => even + rear);
    dots(BODY.front, () => even);
    for (const f of [NECK.right, NECK.left, NECK.back]) dots(f, () => even * 0.7);
    for (const f of LEG_SIDES) dots(f, (_x, y) => (y < 5 ? even : 0));
  }
  return t;
}

// ---------------------------------------------------------------------------
// the armour (vanilla HorseArmorLayer: HorseModel inflated 0.1, in the armour's own sheet)

interface ArmorLook {
  seed: number;
  base: Pal;
  dark: Pal;
  light: Pal;
  trim: number;
  /** quilted leather rather than plates */
  quilt?: boolean;
}

const ARMORS: Record<string, ArmorLook> = {
  iron: { seed: 0x1e04, base: [0xc4c4c4, 0xb8b8b8, 0xcfcfcf], dark: [0x8a8a8a, 0x7e7e7e], light: [0xe6e6e6, 0xf0f0f0], trim: 0x5e5e5e },
  gold: { seed: 0x601d, base: [0xf2c93a, 0xe8bd2e, 0xf7d650], dark: [0xc0901c, 0xb08118], light: [0xfff0a0, 0xfde88a], trim: 0x8a5e10 },
  diamond: { seed: 0xd1a, base: [0x4fe0d0, 0x3fd4c4, 0x62e8da], dark: [0x2aa99b, 0x229488], light: [0xb4fff6, 0xd0fffa], trim: 0x13695f },
  leather: { seed: 0x1ea7, base: [0xd8d8d8, 0xcfcfcf, 0xe0e0e0], dark: [0xa8a8a8, 0x9c9c9c], light: [0xf4f4f4, 0xffffff], trim: 0x7a7a7a, quilt: true },
};

function horseArmor(a: ArmorLook): TexImage {
  const t = img(64, 64);
  const r = new Rand(a.seed);
  /** leather quilted in diamonds, or metal: `banded`, plates four rows deep (a bright bevel, a dark seam); else plain */
  const px = (x: number, y: number, banded: boolean) =>
    a.quilt
      ? (x + y) % 4 === 0 || (x - y + 64) % 4 === 0 ? pick(r, a.dark) : pick(r, a.base)
      : banded && y % 4 === 3 ? pick(r, a.dark) : (banded && y % 4 === 0 && r.chance(0.7)) || r.chance(0.06) ? pick(r, a.light) : pick(r, a.base);
  /** a face covered down to row `rows` (its last row the trim if `trim`), nothing below */
  const cover = (f: Face, rows = f[3], trim = true, banded = false) => paintFace(t, f, (x, y) => (y >= rows ? undefined : trim && y === rows - 1 ? a.trim : px(x, y, banded)));
  // the body: plates over the back (a ridge down the middle), down the flanks, over the breast and half the rump
  paintFace(t, BODY.top, (x, y) => (x === 4 || x === 5 ? pick(r, a.light) : px(x, y, true)));
  cover(BODY.right, 8, true, true);
  cover(BODY.left, 8, true, true);
  cover(BODY.front, 8, true, true);
  cover(BODY.back, 6, true, true);
  // the neck all round (under the mane too), trimmed where it meets the body
  for (const f of [NECK.right, NECK.left, NECK.front, NECK.back]) cover(f, f[3], true);
  // the chanfron over the head, holes for the eyes, down the nose to the nostrils
  for (const f of [HEAD.top, HEAD.front, HEAD.back]) cover(f, f[3], false);
  cover(HEAD.right, 5, false);
  cover(HEAD.left, 5, false);
  drawFace(t, HEAD.right, ['ttttttt', '...xxx.', '....t..'], { x: null, t: a.trim }, r);
  drawFace(t, HEAD.left, ['ttttttt', '.xxx...', '..t....'], { x: null, t: a.trim }, r);
  cover(MUZZLE.top, 5, false);
  cover(MUZZLE.right, 4);
  cover(MUZZLE.left, 4);
  drawFace(t, MUZZLE.front, ['tttt'], { t: a.trim }, r);
  // guards over the knees
  for (const f of LEG_SIDES) paintFace(t, f, (x, y) => (y >= 1 && y <= 3 ? px(x, y, false) : y === 4 ? a.trim : undefined));
  return t;
}

for (const c of Object.keys(COATS)) MOB_TEXTURES['horse_' + c] = () => horse(c);
for (const m of ['white', 'white_field', 'white_dots', 'black_dots']) MOB_TEXTURES['horse_markings_' + m] = () => markings(m);
MOB_TEXTURES.donkey = donkey;
MOB_TEXTURES.mule = mule;
for (const [m, look] of Object.entries(ARMORS)) MOB_TEXTURES['horse_armor_' + m] = () => horseArmor(look);
