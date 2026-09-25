// The frogs' and tadpoles' skins (M9; vanilla textures/entity/frog/temperate_frog.png, warm_frog.png and cold_frog.png,
// 48x48 on FrogModel's layout, and textures/entity/tadpole/tadpole.png, 16x16 on TadpoleModel's). A frog is mottled
// over its back and legs with darker spots, paler down its flanks to its belly and throat, a darker line along its
// mouth, two nostrils; its bulging eyes are its skin above and black below with a glint; its mouth, seen when it
// opens, is pink, and so is its tongue; its hands and feet are splayed, webbed toes. The temperate frog is orange,
// the warm one cream-white with tan spots, the cold one green. A tadpole is a dark brown speck with a paler tail.
// Original pixel art.
//
// (The body's top face and the top row of its sides, the head's underside and the eyes' undersides are left clear:
// they lie where the head and eyes meet the body, and the mouth's own planes show through when it opens.)

import { Rand } from '../core/rng';
import { img, plot, mixC, type TexImage } from './tex';
import { MOB_TEXTURES, boxFaces, fleck, noiseFace, paintFace, type Face, type Pal } from './mobs';

const RIGHT_EYE = boxFaces(0, 0, 3, 2, 3);
const LEFT_EYE = boxFaces(0, 5, 3, 2, 3);
const BODY = boxFaces(3, 1, 7, 3, 9);
const HEAD = boxFaces(0, 13, 7, 3, 9);
/** the mouth's planes: the roof (the head's) and the floor (the body's), each seen from above and below */
const HEAD_PLANE = boxFaces(23, 13, 7, 0, 9);
const BODY_PLANE = boxFaces(23, 22, 7, 0, 9);
const TONGUE = boxFaces(17, 13, 4, 0, 7);
const CROAK = boxFaces(26, 5, 7, 2, 3);
const LEFT_ARM = boxFaces(0, 32, 2, 3, 3);
const RIGHT_ARM = boxFaces(0, 38, 2, 3, 3);
const LEFT_LEG = boxFaces(14, 25, 3, 3, 4);
const RIGHT_LEG = boxFaces(0, 25, 3, 3, 4);
const LEFT_HAND = boxFaces(18, 40, 8, 0, 8);
const RIGHT_HAND = boxFaces(2, 40, 8, 0, 8);
const LEFT_FOOT = boxFaces(2, 32, 8, 0, 8);
const RIGHT_FOOT = boxFaces(18, 32, 8, 0, 8);

// prettier-ignore
/**
 * the hands and feet, as they lie on the ground (column 0 the frog's right, row 0 its back): `#` toe, `+` palm, where
 * the limb meets it; the left hand's palm is a row further back than the right's (vanilla's layout)
 */
const LEFT_HAND_SHAPE = [
  '...++...',
  '..++++..',
  '..++++..',
  '.#.##.#.',
  '.#.##.#.',
  '#..#.#.#',
  '#..#..#.',
  '........',
];
// prettier-ignore
const RIGHT_HAND_SHAPE = [
  '........',
  '........',
  '...++...',
  '..++++..',
  '..++++..',
  '.#.##.#.',
  '#.#..#.#',
  '#.#..#..',
];
// prettier-ignore
const LEFT_FOOT_SHAPE = [
  '........',
  '........',
  '.+++....',
  '.++++##.',
  '.+++#..#',
  '..#.##..',
  '..#..#.#',
  '.#...#..',
];
// prettier-ignore
const RIGHT_FOOT_SHAPE = [
  '........',
  '........',
  '....+++.',
  '.##++++.',
  '#..#+++.',
  '..##.#..',
  '#.#..#..',
  '..#...#.',
];

interface Skin {
  /** the back and legs, darkest to lightest */
  back: Pal;
  /** the spots on it */
  spot: Pal;
  /** the belly and throat */
  belly: Pal;
  /** the line of the mouth */
  lip: number;
  /** the glint in the eye */
  glint: number;
}

const PUPIL = 0x15110d;
const ROOF = [0xa83e52, 0xb5455a, 0xae4256];
const FLOOR = [0xc2566a, 0xcc6074, 0xc65b6f];
const TONGUE_PAL = [0xd6687a, 0xdc7282, 0xcf6274];
const TONGUE_TIP = 0xb04a5e;

const SIDES = ['right', 'front', 'left', 'back'] as const;

/** paints a hand or foot's shape on its plane's two faces */
function limbPlane(t: TexImage, b: ReturnType<typeof boxFaces>, shape: string[], skin: Pal, palm: Pal, r: Rand): void {
  for (const f of [b.top, b.bottom]) {
    const [x0, y0] = f;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const ch = shape[y][x];
        if (ch === '#') plot(t, x0 + x, y0 + y, skin[r.nextInt(skin.length)]);
        else if (ch === '+') plot(t, x0 + x, y0 + y, palm[r.nextInt(palm.length)]);
      }
  }
}

function paintFrog(s: Skin, seed: number): () => TexImage {
  return () => {
    const t = img(48, 48);
    const r = new Rand(seed);
    const back = { cell: 2, white: 0.45 };
    const flank = s.back.map((c) => mixC(c, s.belly[0], 0.3));
    const clearRow0 = (f: Face) => paintFace(t, f, (_x, y) => (y === 0 ? null : undefined));

    // the eyes: skin over the top and the upper row of each side, black below it, a glint looking outwards
    for (const [eye, out] of [[RIGHT_EYE, 'right'], [LEFT_EYE, 'left']] as const) {
      noiseFace(t, eye.top, r, s.back, { cell: 1 });
      for (const k of SIDES) paintFace(t, eye[k], (_x, y) => (y === 0 ? s.back[2 + r.nextInt(s.back.length - 2)] : PUPIL));
      const [ox, oy] = eye[out];
      plot(t, ox + 1, oy + 1, s.glint);
      const [fx, fy] = eye.front;
      plot(t, fx + (out === 'right' ? 0 : 2), fy + 1, mixC(PUPIL, s.glint, 0.35));
    }

    // the head: mottled and spotted on top, the flanks paler, the mouth's line along the bottom, two nostrils
    noiseFace(t, HEAD.top, r, s.back, back);
    fleck(t, HEAD.top, r, 0.14, s.spot);
    for (const k of SIDES) {
      noiseFace(t, HEAD[k], r, k === 'back' ? s.back : flank, { cell: 1 });
      paintFace(t, HEAD[k], (_x, y, px) => (y === 2 ? mixC(px, s.lip, 0.55) : undefined));
    }
    fleck(t, HEAD.right, r, 0.12, s.spot);
    fleck(t, HEAD.left, r, 0.12, s.spot);
    const [nx, ny] = HEAD.front;
    plot(t, nx + 2, ny, mixC(s.lip, PUPIL, 0.4));
    plot(t, nx + 4, ny, mixC(s.lip, PUPIL, 0.4));

    // the body: its sides skin fading to the belly, the belly and throat pale (its top, hidden in the head, clear)
    for (const k of SIDES) {
      noiseFace(t, BODY[k], r, k === 'front' ? s.belly : k === 'back' ? s.back : flank, { cell: 1 });
      if (k === 'right' || k === 'left') paintFace(t, BODY[k], (_x, y, px) => (y === 2 ? mixC(px, s.belly[0], 0.55) : undefined));
      if (k === 'back') fleck(t, BODY.back, r, 0.15, s.spot);
      clearRow0(BODY[k]);
    }
    noiseFace(t, BODY.bottom, r, s.belly, { cell: 2 });

    // the mouth: the roof darker, the floor lighter, the tongue with its tip
    for (const f of [HEAD_PLANE.top, HEAD_PLANE.bottom]) noiseFace(t, f, r, ROOF, { cell: 1 });
    for (const f of [BODY_PLANE.top, BODY_PLANE.bottom]) noiseFace(t, f, r, FLOOR, { cell: 1 });
    for (const f of [TONGUE.top, TONGUE.bottom]) {
      noiseFace(t, f, r, TONGUE_PAL, { cell: 1 });
      paintFace(t, f, (x, y, _px, w, h) => (y === h - 1 ? (x === 0 || x === w - 1 ? null : TONGUE_TIP) : undefined));
    }

    // the swelling throat, stretched pale
    const sac = s.belly.map((c) => mixC(c, 0xffffff, 0.25));
    for (const k of ['top', 'bottom', ...SIDES] as const) noiseFace(t, CROAK[k], r, sac, { cell: 1 });

    // the arms and legs: spotted skin, paler underneath and on the inside
    for (const limb of [LEFT_ARM, RIGHT_ARM, LEFT_LEG, RIGHT_LEG]) {
      noiseFace(t, limb.top, r, s.back, { cell: 1 });
      for (const k of SIDES) noiseFace(t, limb[k], r, flank, { cell: 1 });
      noiseFace(t, limb.bottom, r, s.belly, { cell: 1 });
    }
    for (const leg of [LEFT_LEG, RIGHT_LEG]) {
      fleck(t, leg.top, r, 0.25, s.spot);
      fleck(t, leg.back, r, 0.2, s.spot);
    }
    fleck(t, LEFT_LEG.left, r, 0.2, s.spot);
    fleck(t, RIGHT_LEG.right, r, 0.2, s.spot);

    // the hands and feet
    const palm = s.back.slice(1, 4);
    const toe = flank.slice(0, 3);
    limbPlane(t, LEFT_HAND, LEFT_HAND_SHAPE, toe, palm, r);
    limbPlane(t, RIGHT_HAND, RIGHT_HAND_SHAPE, toe, palm, r);
    limbPlane(t, LEFT_FOOT, LEFT_FOOT_SHAPE, toe, palm, r);
    limbPlane(t, RIGHT_FOOT, RIGHT_FOOT_SHAPE, toe, palm, r);
    return t;
  };
}

const SKINS: Record<string, Skin> = {
  // vanilla temperate_frog: orange, spotted brown, a cream belly
  frog_temperate: {
    back: [0xa85a2c, 0xb8663a, 0xc8703a, 0xd27a42, 0xdc8a50],
    spot: [0x8a4620, 0x9a4d24, 0x7e3f1c],
    belly: [0xf0d3a2, 0xe8c894, 0xf6dcae],
    lip: 0x6e3a1c,
    glint: 0xf2e6c8,
  },
  // vanilla warm_frog: cream-white, spotted tan
  frog_warm: {
    back: [0xd4c2a6, 0xdecfb6, 0xe7dac3, 0xeee4d0, 0xf5eee0],
    spot: [0xc7a283, 0xb8906e, 0xcfae90],
    belly: [0xfbf4e8, 0xf6eee0, 0xfffaf0],
    lip: 0x9b7b60,
    glint: 0xfffbf0,
  },
  // vanilla cold_frog: green, spotted darker, a pale green-cream belly
  frog_cold: {
    back: [0x5c7a30, 0x668636, 0x6f8f3e, 0x7a9a46, 0x86a650],
    spot: [0x4a6327, 0x3f5621, 0x53702b],
    belly: [0xd3dca9, 0xc8d49c, 0xdde5b6],
    lip: 0x34471a,
    glint: 0xe8f0d0,
  },
};

let seed = 0xf409;
for (const [name, s] of Object.entries(SKINS)) MOB_TEXTURES[name] = paintFrog(s, seed++);

/** the tadpole's: its body dark brown, darkest underneath, two dark eyes at its front; its tail paler towards the tip */
MOB_TEXTURES['tadpole'] = () => {
  const t = img(16, 16);
  const r = new Rand(0x7ad9);
  const body = [0x3d2c20, 0x45321f, 0x4c3826, 0x372819];
  const b = boxFaces(0, 0, 3, 2, 3);
  for (const k of ['top', ...SIDES] as const) noiseFace(t, b[k], r, body, { cell: 1 });
  noiseFace(t, b.bottom, r, body.map((c) => mixC(c, 0x000000, 0.25)), { cell: 1 });
  const [fx, fy] = b.front;
  plot(t, fx, fy, 0x120c08);
  plot(t, fx + 2, fy, 0x120c08);
  // the tail's two faces, [x, y, w, h]: the right face's tip at its left, the left face's at its right
  const tail = (f: Face, tipLeft: boolean) =>
    paintFace(t, f, (x, _y, _c, w) => {
      const k = (tipLeft ? w - 1 - x : x) / (w - 1);
      const c = mixC(0x6f5641, 0x8a6c50, k);
      return r.chance(0.2) ? mixC(c, 0x5a4432, 0.4) : c;
    });
  tail([0, 7, 7, 2], true);
  tail([7, 7, 7, 2], false);
  return t;
};
