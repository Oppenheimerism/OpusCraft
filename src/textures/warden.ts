// The warden's skins (M4; vanilla textures/entity/warden/warden.png and its four emissive layers, 128x128 on
// WardenModel's layout). Its hide is a deep blue-black teal, creased and mottled, darker underneath and down to its
// hands and feet; its face has no eyes, only a heavy brow over a blunt face and a dark slit of a mouth. Its chest is
// open: a cavity where the souls it has taken stare out, behind a pale ribcage (two halves, each on its hinge, the
// one painted once and mirrored). The tendrils standing out from its head are pale teal horns, lighter at their core.
// Over that go the layers drawn glowing: the bioluminescent spots on its head, arms and legs; two sets of spots that
// pulse by turns (over its body too); and its heart, in the middle of its chest. Original pixel art.
//
// (The tendril layer is vanilla's own warden.png drawn again over the tendrils, so there's no texture for it here.)

import { Rand } from '../core/rng';
import { img, plot, mixC, type TexImage } from './tex';
import { MOB_TEXTURES, SIDES, boxFaces, drawFace, fleck, noiseFace, paintFace, type Box, type Face, type Pal } from './mobs';

const BODY = boxFaces(0, 0, 18, 21, 11);
const RIBCAGE = boxFaces(90, 11, 9, 21, 0);
const HEAD = boxFaces(0, 32, 16, 16, 10);
const RIGHT_TENDRIL = boxFaces(52, 32, 16, 16, 0);
const LEFT_TENDRIL = boxFaces(58, 0, 16, 16, 0);
const RIGHT_ARM = boxFaces(44, 50, 8, 28, 8);
const LEFT_ARM = boxFaces(0, 58, 8, 28, 8);
const RIGHT_LEG = boxFaces(76, 48, 6, 13, 6);
const LEFT_LEG = boxFaces(76, 76, 6, 13, 6);
const ARMS = [RIGHT_ARM, LEFT_ARM];
const LEGS = [RIGHT_LEG, LEFT_LEG];

/** its hide, darkest to lightest (and how much of each) */
const SKIN: Pal = [0x071a22, 0x0a222c, 0x0c2a35, 0x0f313d, 0x123846, 0x16404f];
const SKIN_W: Pal = [1, 3, 5, 5, 3, 1];
const CREASE = 0x04121a;
const RIDGE = 0x1d4d5c;
/** the chest's cavity and the souls in it */
const CAVITY: Pal = [0x03090d, 0x051016, 0x07151c];
const SOUL: Pal = [0x1b7d86, 0x2394a0, 0x2bbac4];
const SOUL_EYE = 0x020709;
/** the ribs: bone gone pale teal, its shadow */
const BONE: Pal = [0x8fb7b3, 0xa4c9c3, 0xb9dbd4];
const BONE_DULL: Pal = [0x7fa6a3, 0x8fb5b0];
const BONE_SHADE = 0x5f8886;
/** the tendrils: their rim, their flesh, their core */
const TENDRIL_RIM = 0x0f4a52;
const TENDRIL: Pal = [0x17646d, 0x19707a, 0x1c7984];
const TENDRIL_CORE: Pal = [0x3aa8ae, 0x48b9bd];
const TENDRIL_TIP = 0x7fd9d8;
/** what glows */
const GLOW: Pal = [0x2ee6f0, 0x3ff0f6, 0x6ff6fa];
const PULSE: Pal = [0x4fe9f0, 0x7ff4f8, 0xa9fbfc];
const HEART = 0x43f0f5;
const HEART_CORE = 0xc8ffff;
const HEART_DIM = 0x1a6a73;

const mirror = (rows: readonly string[]): string[] => rows.map((s) => [...s].reverse().join(''));

// prettier-ignore
/**
 * the right half of the ribcage as it's seen from the front (column 0 its outer edge, 8 the breastbone; `B` bone,
 * `b` the lower ribs' duller bone, `s` the breastbone's tip): five ribs sweeping out from the breastbone and down
 * round its side, the chest showing between them
 */
const RIBS = [
  '.........',
  '....BBBBB',
  '..BB....B',
  '.B......B',
  '....BBBBB',
  '..BB....B',
  '.B......B',
  '....BBBBB',
  '..BB....B',
  '.B......B',
  '....bbbbB',
  '..bb....B',
  '.b......B',
  '.....bbbB',
  '...bb...B',
  '........s',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
];

// prettier-ignore
/**
 * the right tendril as it's seen from the front (column 0 its tip, 15 where it grows from the side of the head,
 * whose top is row 9): a horn sweeping out and up. `o` rim, `m` flesh, `c` core, `t` the pale tip
 */
const TENDRIL_SHAPE = [
  't...............',
  'co..............',
  'cmo.............',
  'ocmo............',
  'ocmmo...........',
  '.ocmmo..........',
  '.ocmmmo.........',
  '..ocmmmoo.......',
  '..oocmmmmoo.....',
  '...oocccmmmoo...',
  '....oocccmmmmooo',
  '.....ooccccmmmmm',
  '.......ooccccmmm',
  '.........ooocccm',
  '............oooo',
  '................',
];

// prettier-ignore
/** a soul's face in the chest: `s` its glow, `e` its eyes and gaping mouth */
const SOUL_FACE = [
  '.ss.',
  'sese',
  'ssss',
  '.se.',
];

// prettier-ignore
/** the heart, on the chest's front (6 wide, the middle two columns the chest's middle): `H` heart, `C` its core */
const HEART_SHAPE = [
  '.H..H.',
  'HHHHHH',
  'HHCCHH',
  'HHCCHH',
  '.HHHH.',
  '..HH..',
];

/** the chest's front: [column, row] of each soul's face, and of the heart's top left corner */
const SOULS: [number, number][] = [[2, 2], [12, 2], [2, 9], [12, 10], [7, 11]];
const HEART_AT: [number, number] = [6, 5];

/** a face darkened towards its bottom row by up to `k` */
function shadeDown(t: TexImage, f: Face, k: number, from = 0.5): void {
  paintFace(t, f, (_x, y, c, _w, h) => {
    const s = y / Math.max(1, h - 1);
    return s <= from ? undefined : mixC(c, CREASE, ((s - from) / (1 - from)) * k);
  });
}

function skinBox(t: TexImage, b: Box, r: Rand): void {
  for (const k of SIDES) noiseFace(t, b[k], r, SKIN, { w: SKIN_W, cell: 2, white: 0.35 });
  noiseFace(t, b.top, r, SKIN.slice(1), { cell: 2, white: 0.35 });
  noiseFace(t, b.bottom, r, SKIN.slice(0, 3), { cell: 2, white: 0.4 });
}

/** the warden's own skin (vanilla warden.png) */
function warden(): TexImage {
  const t = img(128, 128);
  const r = new Rand(0x3a4d7e);
  const glowing = (ink: Pal) => () => ink[r.nextInt(ink.length)];

  // the body: the hide all over, a ridge of spine down its back, its shoulders' creases; the chest opened
  skinBox(t, BODY, r);
  for (const k of ['right', 'left', 'back'] as const) shadeDown(t, BODY[k], 0.35);
  paintFace(t, BODY.back, (x, y, c) => (x === 8 || x === 9 ? (y % 3 === 1 ? RIDGE : y % 3 === 2 ? CREASE : mixC(c, RIDGE, 0.4)) : undefined));
  fleck(t, BODY.back, r, 0.05, [CREASE]);
  const [cx, cy] = BODY.front;
  // the cavity: dark, its rim the hide folding in, the souls staring out of it
  paintFace(t, BODY.front, (x, y, c) => {
    const inside = x >= 1 && x <= 16 && y >= 1 && y <= 15 && !((x === 1 || x === 16) && (y === 1 || y === 15));
    if (!inside) return y > 15 ? mixC(c, CREASE, 0.15) : c;
    const rim = x === 1 || x === 16 || y === 1 || y === 15;
    return rim ? mixC(CREASE, c, 0.3) : CAVITY[r.nextInt(CAVITY.length)];
  });
  for (const [sx, sy] of SOULS) drawFace(t, [cx + sx, cy + sy, 4, 4], SOUL_FACE, { s: SOUL, e: SOUL_EYE }, r);
  drawFace(t, [cx + HEART_AT[0], cy + HEART_AT[1], 6, 6], HEART_SHAPE, { H: HEART_DIM, C: mixC(HEART_DIM, HEART, 0.4) }, r);
  // the belly below it, creased
  paintFace(t, BODY.front, (x, y, c) => (y === 17 || y === 19 ? (x > 1 && x < 16 ? mixC(c, CREASE, 0.6) : undefined) : undefined));

  // the ribcage, the same from either side (its back is its front mirrored, so the two agree where they lie)
  const bone = { B: glowing(BONE), b: glowing(BONE_DULL), s: BONE_SHADE };
  drawFace(t, RIBCAGE.front, RIBS, bone, r);
  drawFace(t, RIBCAGE.back, mirror(RIBS), bone, r);

  // the head: the hide, darker underneath; a heavy brow, the blunt face, the mouth a dark slit
  skinBox(t, HEAD, r);
  for (const k of SIDES) shadeDown(t, HEAD[k], 0.25, 0.6);
  paintFace(t, HEAD.front, (x, y, c) => {
    if (y === 3 && x >= 1 && x <= 14) return mixC(c, RIDGE, 0.55);
    if (y === 4 && x >= 2 && x <= 13) return mixC(c, CREASE, 0.55);
    if (y === 11 && x >= 3 && x <= 12) return CREASE;
    if (y === 12 && x >= 4 && x <= 11) return mixC(c, CREASE, 0.5);
    if (y === 10 && x >= 4 && x <= 11) return mixC(c, RIDGE, 0.35);
    return undefined;
  });
  // where the tendrils grow from its sides: a socket, the flesh raised round it
  for (const k of ['right', 'left'] as const)
    paintFace(t, HEAD[k], (x, y, c) => (x >= 4 && x <= 5 && y >= 3 && y <= 7 ? CREASE : (x === 3 || x === 6) && y >= 3 && y <= 7 ? mixC(c, RIDGE, 0.5) : undefined));

  // the tendrils: the right one's front as drawn and its back mirrored; the left one the other way round
  const horn = { o: TENDRIL_RIM, m: glowing(TENDRIL), c: glowing(TENDRIL_CORE), t: TENDRIL_TIP };
  drawFace(t, RIGHT_TENDRIL.front, TENDRIL_SHAPE, horn, r);
  drawFace(t, RIGHT_TENDRIL.back, mirror(TENDRIL_SHAPE), horn, r);
  drawFace(t, LEFT_TENDRIL.front, mirror(TENDRIL_SHAPE), horn, r);
  drawFace(t, LEFT_TENDRIL.back, TENDRIL_SHAPE, horn, r);

  // the arms: the hide down to the elbow's crease, the forearm, the heavy dark hands with their fingers
  for (const a of ARMS) {
    skinBox(t, a, r);
    for (const k of SIDES)
      paintFace(t, a[k], (x, y, c) => {
        if (y === 12) return mixC(c, CREASE, 0.6);
        if (y >= 22) return y >= 24 && (x === 2 || x === 5) ? CREASE : mixC(c, CREASE, 0.25 + (y - 22) * 0.05);
        return undefined;
      });
    paintFace(t, a.bottom, (x, _y, c) => (x === 2 || x === 5 ? CREASE : mixC(c, CREASE, 0.3)));
  }

  // the legs: the hide, the knee, the feet darker
  for (const l of LEGS) {
    skinBox(t, l, r);
    for (const k of SIDES) paintFace(t, l[k], (_x, y, c) => (y === 4 ? mixC(c, CREASE, 0.5) : y >= 10 ? mixC(c, CREASE, 0.3) : undefined));
    paintFace(t, l.bottom, (_x, _y, c) => mixC(c, CREASE, 0.35));
  }
  return t;
}

/** spots of `ink` at the given [column, row]s of a face (each a pixel, or a 2x2 when `big`) */
function spots(t: TexImage, f: Face, at: readonly [number, number][], ink: Pal, r: Rand, big = false): void {
  for (const [x, y] of at)
    for (let j = 0; j < (big ? 2 : 1); j++) for (let i = 0; i < (big ? 2 : 1); i++) if (x + i < f[2] && y + j < f[3]) plot(t, f[0] + x + i, f[1] + y + j, ink[r.nextInt(ink.length)]);
}

/** vanilla warden_bioluminescent_layer.png: the spots on its head, arms and legs that always glow */
function bioluminescent(): TexImage {
  const t = img(128, 128);
  const r = new Rand(0xb101);
  // the head: over the brow, on its cheeks, down its sides and on its crown
  spots(t, HEAD.front, [[2, 1], [13, 1], [3, 6], [12, 6], [2, 8], [13, 8]], GLOW, r);
  spots(t, HEAD.front, [[7, 0]], GLOW, r, true);
  for (const k of ['right', 'left'] as const) spots(t, HEAD[k], [[1, 2], [8, 3], [2, 9], [7, 11], [4, 13]], GLOW, r);
  spots(t, HEAD.top, [[3, 2], [12, 2], [7, 5], [2, 7], [13, 7]], GLOW, r);
  spots(t, HEAD.back, [[3, 3], [12, 3], [7, 8]], GLOW, r);
  // the arms: over the shoulder, down the outside and the front, round the wrist
  for (const [a, out] of [[RIGHT_ARM, 'right'], [LEFT_ARM, 'left']] as const) {
    spots(t, a.top, [[2, 2], [5, 5]], GLOW, r);
    spots(t, a[out], [[3, 2], [4, 6], [2, 10], [5, 15], [3, 19], [4, 23]], GLOW, r);
    spots(t, a[out], [[3, 4]], GLOW, r, true);
    spots(t, a.front, [[2, 3], [5, 8], [3, 16], [5, 20]], GLOW, r);
    spots(t, a.back, [[5, 5], [2, 14], [4, 21]], GLOW, r);
  }
  // the legs: the front of the thigh and shin, the outside
  for (const [l, out] of [[RIGHT_LEG, 'right'], [LEFT_LEG, 'left']] as const) {
    spots(t, l.front, [[1, 1], [4, 2], [2, 7]], GLOW, r);
    spots(t, l[out], [[2, 3], [3, 8]], GLOW, r);
  }
  return t;
}

/** vanilla warden_pulsating_spots_1.png and _2.png: two sets of spots, the one glowing as the other fades */
function pulsating(seed: number): () => TexImage {
  return () => {
    const t = img(128, 128);
    const r = new Rand(seed);
    const faces: Face[] = [BODY.top, BODY.right, BODY.left, BODY.back, HEAD.top, HEAD.right, HEAD.left, HEAD.back, HEAD.front];
    for (const a of [...ARMS, ...LEGS]) faces.push(a.top, ...SIDES.map((k) => a[k]));
    for (const f of faces) fleck(t, f, r, 0.045, PULSE);
    // a few clustered into larger spots, over the back and shoulders
    for (let i = 0; i < 6; i++) {
      const f = [BODY.back, BODY.top, RIGHT_ARM.right, LEFT_ARM.left][i % 4];
      spots(t, f, [[1 + r.nextInt(f[2] - 2), 1 + r.nextInt(f[3] - 2)]], PULSE, r, true);
    }
    return t;
  };
}

/** vanilla warden_heart.png: its heart, glowing in its chest, with a faint halo round it */
function heart(): TexImage {
  const t = img(128, 128);
  const r = new Rand(0x4ea7);
  const [cx, cy] = BODY.front;
  const [hx, hy] = HEART_AT;
  const inHeart = (x: number, y: number): boolean => y >= 0 && y < HEART_SHAPE.length && x >= 0 && x < 6 && HEART_SHAPE[y][x] !== '.';
  for (let y = -1; y <= 6; y++)
    for (let x = -1; x <= 6; x++)
      if (!inHeart(x, y) && (inHeart(x - 1, y) || inHeart(x + 1, y) || inHeart(x, y - 1) || inHeart(x, y + 1))) plot(t, cx + hx + x, cy + hy + y, HEART, 110);
  drawFace(t, [cx + hx, cy + hy, 6, 6], HEART_SHAPE, { H: HEART, C: HEART_CORE }, r);
  return t;
}

MOB_TEXTURES['warden'] = warden;
MOB_TEXTURES['warden_bioluminescent_layer'] = bioluminescent;
MOB_TEXTURES['warden_pulsating_spots_1'] = pulsating(0x5a11);
MOB_TEXTURES['warden_pulsating_spots_2'] = pulsating(0x5a22);
MOB_TEXTURES['warden_heart'] = heart;
