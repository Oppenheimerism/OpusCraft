// The bee's skins (vanilla textures/entity/bee/bee.png, bee_angry.png, bee_nectar.png and bee_angry_nectar.png, 64x64
// on BeeModel's layout): a round yellow body banded twice in dark brown, its rear dark, big black eyes on the face
// over a small dark mouth, two thin antennae, pale see-through wings with dark veins, three pairs of short dark legs
// and the stinger. An angry bee's eyes glow red; one carrying nectar is dusted with pollen. Original pixel art.

import { Rand } from '../core/rng';
import { img, plot, clear, type TexImage } from './tex';
import { MOB_TEXTURES, boxFaces, noiseFace, paintFace, type Face, type Pal } from './mobs';

/** vanilla BeeModel's boxes: the body (7x7x10), each antenna (1x2x3), a wing (a 9x6 plane), the three legs' strips, the stinger */
const BODY = boxFaces(0, 0, 7, 7, 10);
const LEFT_ANTENNA = boxFaces(2, 0, 1, 2, 3);
const RIGHT_ANTENNA = boxFaces(2, 3, 1, 2, 3);
const WING = boxFaces(0, 18, 9, 0, 6);
const LEGS = [boxFaces(26, 1, 7, 2, 0), boxFaces(26, 3, 7, 2, 0), boxFaces(26, 5, 7, 2, 0)];
const STINGER = boxFaces(26, 7, 0, 1, 2);

const YELLOW: Pal = [0xd9a92c, 0xe8b93a, 0xf2c94a, 0xf7d45c];
const BROWN: Pal = [0x2f1c10, 0x3b2415, 0x472c1a];
const REAR: Pal = [0x2a180d, 0x352012];
const EYE = 0x140c08;
const EYE_LIT = 0x3b2a22;
const ANGRY_EYE = 0xb3170f;
const ANGRY_LIT = 0xe8392a;
const WING_PAL: Pal = [0xd7e4ea, 0xe3edf1, 0xeef5f7];
const VEIN = 0xa9b9c2;
const POLLEN: Pal = [0xfff1a8, 0xfbe07a, 0xffffff];

/** the body's position along its length, 0 at the head to 9 at the rear, of a column or row of one of its faces */
type Along = (x: number, y: number, w: number, h: number) => number;
/** top and bottom: the row nearest the sides (the last) is the head end */
const alongTopBottom: Along = (_x, y, _w, h) => h - 1 - y;
/** the right side: its last column meets the face */
const alongRight: Along = (x, _y, w) => w - 1 - x;
/** the left side: its first column meets the face */
const alongLeft: Along = (x) => x;

/** the bands: the head and thorax yellow, then brown, yellow, and the brown rear */
const isBand = (z: number): boolean => z === 4 || z === 5 || z >= 8;

function paintBodyFace(t: TexImage, f: Face, r: Rand, along: Along): void {
  noiseFace(t, f, r, YELLOW, { cell: 1, white: 0.6 });
  paintFace(t, f, (x, y, _c, w, h) => (isBand(along(x, y, w, h)) ? BROWN[r.nextInt(BROWN.length)] : undefined));
}

function paintBee(angry: boolean, nectar: boolean, seed: number): () => TexImage {
  return () => {
    const t = img(64, 64);
    const r = new Rand(seed);
    // the body: yellow banded brown, on the top, bottom and sides
    paintBodyFace(t, BODY.top, r, alongTopBottom);
    paintBodyFace(t, BODY.bottom, r, alongTopBottom);
    paintBodyFace(t, BODY.right, r, alongRight);
    paintBodyFace(t, BODY.left, r, alongLeft);
    // the rear: dark, the stinger's socket in the middle
    noiseFace(t, BODY.back, r, REAR, { cell: 1 });
    // the face: yellow, a big eye in each upper corner (two wide, three high, a glint at its top), a small mouth
    noiseFace(t, BODY.front, r, YELLOW, { cell: 1, white: 0.5 });
    const [fx, fy] = BODY.front;
    const eye = angry ? ANGRY_EYE : EYE, lit = angry ? ANGRY_LIT : EYE_LIT;
    for (const ex of [0, 5])
      for (let y = 1; y <= 3; y++)
        for (let x = 0; x < 2; x++) plot(t, fx + ex + x, fy + y, y === 1 && x === (ex ? 1 : 0) ? lit : eye);
    for (let x = 2; x <= 4; x++) plot(t, fx + x, fy + 5, BROWN[1]);
    plot(t, fx + 3, fy + 6, BROWN[0]);
    // the face's edge where the body's first band would be (the chin): a line of darker yellow
    for (let x = 0; x < 7; x++) plot(t, fx + x, fy + 6, x === 3 ? BROWN[0] : YELLOW[0]);
    // pollen over its back and sides when it carries nectar
    if (nectar)
      for (const f of [BODY.top, BODY.right, BODY.left])
        paintFace(t, f, (x, y, _c, w, h) => ((x * 7 + y * 13 + (w + h)) % 5 === 0 && r.chance(0.55) ? POLLEN[r.nextInt(POLLEN.length)] : undefined));
    // the antennae: dark stalks, a lighter tip at the front
    for (const a of [LEFT_ANTENNA, RIGHT_ANTENNA])
      for (const k of ['top', 'bottom', 'right', 'front', 'left', 'back'] as const) noiseFace(t, a[k], r, BROWN, { cell: 1 });
    // the wings: pale film, the outline's corners cut, two veins along each
    for (const k of ['top', 'bottom'] as const) {
      const [x0, y0, w, h] = WING[k];
      noiseFace(t, WING[k], r, WING_PAL, { cell: 1, white: 0.7 });
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const corner = (x === w - 1 && (y === 0 || y === h - 1)) || (x === w - 2 && y === h - 1);
          if (corner) clear(t, x0 + x, y0 + y);
          else if (y === 1 || (y === 3 && x < w - 2) || (x === 0 && y < h - 1)) plot(t, x0 + x, y0 + y, VEIN);
        }
    }
    // the legs: on each strip a leg at either end, three pixels wide, dark; nothing between them
    for (const l of LEGS)
      for (const k of ['front', 'back'] as const) {
        const [x0, y0, w, h] = l[k];
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            if (x > 1 && x < w - 2) clear(t, x0 + x, y0 + y);
            else plot(t, x0 + x, y0 + y, y === h - 1 ? BROWN[0] : BROWN[2]);
          }
      }
    // the stinger: two pixels long on each side, darkening to its point
    for (const k of ['right', 'left'] as const) {
      const [x0, y0] = STINGER[k];
      plot(t, x0, y0, k === 'right' ? 0x5a4632 : 0x1c120a);
      plot(t, x0 + 1, y0, k === 'right' ? 0x1c120a : 0x5a4632);
    }
    return t;
  };
}

MOB_TEXTURES['bee'] = paintBee(false, false, 0xbee1);
MOB_TEXTURES['bee_angry'] = paintBee(true, false, 0xbee1);
MOB_TEXTURES['bee_nectar'] = paintBee(false, true, 0xbee1);
MOB_TEXTURES['bee_angry_nectar'] = paintBee(true, true, 0xbee1);
