// The biome variants of the zombie and the skeleton: the husk (vanilla textures/entity/zombie/husk.png, on the
// zombie's 64x64 layout), sun-dried to a dusty khaki with sunken dark eyes, a dirty grey-green shirt and brown
// trousers; the stray (textures/entity/skeleton/stray.png, the skeleton's 64x32 layout) in frost-pale bone with a
// blue tinge, and over it its tattered clothes (stray_overlay.png, on a humanoid mesh a quarter pixel bigger): a
// ragged hood, a torn tunic belted with leather, frayed sleeves and trouser legs. Original pixel art in the style
// of vanilla 1.21.

import { TexImage, img, mulC, Rand } from './tex';
import { MOB_TEXTURES, boxFaces, noiseBox, noiseFace, paintFace, drawFace, fleck, pick, SIDES, type FaceName, type Pal } from './mobs';

function husk(): TexImage {
  const t = img(64, 64);
  const r = new Rand(0x4b5c);
  const SK: Pal = [0x5a4c35, 0x66573d, 0x716146, 0x7d6c4f, 0x887657, 0x93805f, 0x9f8b69];
  const SKW: Pal = [1, 2, 4, 7, 6, 3, 1];
  const TOP: Pal = [0x4a3e2b, 0x544632, 0x5e4f39];
  const SH: Pal = [0x3c3f33, 0x44473a, 0x4d5041, 0x565948, 0x5f6250];
  const SHW: Pal = [1, 3, 5, 3, 1];
  const PA: Pal = [0x3a2c20, 0x433327, 0x4d3b2d, 0x564334];
  const PAW: Pal = [1, 3, 5, 2];
  const SHOE: Pal = [0x271f18, 0x30261d, 0x392d22];
  const head = boxFaces(0, 0, 8, 8, 8);
  const body = boxFaces(16, 16, 8, 12, 4);
  const arm = boxFaces(40, 16, 4, 12, 4);
  const leg = boxFaces(0, 16, 4, 12, 4);

  // head: dried skin, a darker crown, wrinkles, deep-set eyes
  noiseBox(t, head, r, SK, { w: SKW });
  noiseFace(t, head.top, r, TOP);
  for (const k of SIDES) {
    const rows = k === 'back' ? 2 : 1;
    noiseFace(t, head[k], r, TOP, { mask: (_x, y) => y < rows || (y === rows && r.chance(0.35)) });
  }
  drawFace(t, head.front, [
    '........',
    '.w....w.',
    '........',
    '.bb..bb.',
    '.KE..EK.',
    '.l.nn.l.',
    '..mMMm..',
    '...cc...',
  ], {
    w: mulC(SK[3], 0.86), b: mulC(SK[2], 0.82), K: 0x0b0906, E: 0x1c160f, n: mulC(SK[3], 0.8), l: mulC(SK[3], 0.88),
    m: 0x2b2116, M: 0x1a130c, c: mulC(SK[4], 0.9),
  }, r);
  for (const k of ['right', 'left', 'back'] as FaceName[]) fleck(t, head[k], r, 0.06, [mulC(SK[2], 0.85), mulC(SK[1], 0.9)]);

  // body: the shirt, torn at the hem and one shoulder; the belt of the trousers
  noiseBox(t, body, r, SH, { w: SHW });
  const pants = () => pick(r, PA, PAW);
  const sk = () => pick(r, SK, SKW);
  drawFace(t, body.front, [
    '..sss...',
    '...s....',
    '........',
    '......s.',
    '........',
    '........',
    '.s......',
    '........',
    '....s...',
    's.....ss',
    'PP.PPP.P',
    'PPPPPPPP',
  ], { s: sk, P: pants }, r);
  drawFace(t, body.back, [
    '........',
    '........',
    '..s.....',
    '..ss....',
    '........',
    '........',
    '.....s..',
    '........',
    '........',
    's......s',
    'P.PPPP.P',
    'PPPPPPPP',
  ], { s: sk, P: pants }, r);
  for (const k of ['right', 'left'] as FaceName[]) drawFace(t, body[k], ['....', '....', '....', '....', '....', '....', '....', '....', '....', 's..s', 'PPP.', 'PPPP'], { s: sk, P: pants }, r);
  noiseFace(t, body.bottom, r, PA, { w: PAW });

  // arms: bare and bony, sleeves torn off at the shoulder
  noiseBox(t, arm, r, SK, { w: SKW });
  for (const k of SIDES) noiseFace(t, arm[k], r, SH, { w: SHW, mask: (_x, y) => y < 2 || (y === 2 && r.chance(0.5)) });
  for (const k of SIDES) paintFace(t, arm[k], (_x, y, c, _w, h) => (y >= h - 2 ? mulC(c, 0.9) : undefined));
  paintFace(t, arm.back, (_x, _y, c) => mulC(c, 0.9));

  // legs: trousers and worn shoes
  noiseBox(t, leg, r, PA, { w: PAW });
  for (const k of SIDES) noiseFace(t, leg[k], r, SHOE, { mask: (_x, y) => y >= 10 || (y === 9 && r.chance(0.3)) });
  noiseFace(t, leg.bottom, r, SHOE);
  return t;
}

function stray(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0x57a7);
  const BN: Pal = [0x7c8b8f, 0x8a999c, 0x97a7aa, 0xa3b3b5, 0xafbec0, 0xbccacb];
  const BNW: Pal = [1, 2, 4, 8, 5, 2];
  const head = boxFaces(0, 0, 8, 8, 8);
  const body = boxFaces(16, 16, 8, 12, 4);
  const arm = boxFaces(40, 16, 2, 12, 2);
  const leg = boxFaces(0, 16, 2, 12, 2);
  noiseBox(t, head, r, BN, { w: BNW });
  for (const k of ['top', 'right', 'left', 'back'] as FaceName[]) fleck(t, head[k], r, 0.05, [0x6c7b80, 0x75858a]);
  drawFace(t, head.front, [
    '........',
    '........',
    '........',
    '.KK..KK.',
    '.kK..Kk.',
    '...nn...',
    '.DtDDtD.',
    '........',
  ], { K: 0x0b1416, k: 0x1a2a2e, n: 0x33464b, D: 0x1f2f33, t: 0x8a999c }, r);
  noiseBox(t, body, r, BN, { w: BNW });
  const RIB = [1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 1];
  for (const k of SIDES) {
    const spine = k === 'front' || k === 'back';
    paintFace(t, body[k], (x, y) => (!RIB[y] && !(spine && (x === 3 || x === 4)) ? null : undefined));
  }
  for (const b of [arm, leg]) {
    noiseBox(t, b, r, BN, { w: BNW });
    for (const k of SIDES) paintFace(t, b[k], (_x, y, c) => (y === 5 || y === 6 ? mulC(c, 0.88) : undefined));
  }
  return t;
}

/** the stray's rags, on the humanoid layout: hood (the head and its hat layer), tunic, sleeves, trouser legs */
function strayOverlay(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0x57a70);
  const CL: Pal = [0x3a4a4f, 0x43555a, 0x4c5f64, 0x566a6f, 0x60747a];
  const CLW: Pal = [1, 3, 5, 3, 1];
  const LEATHER: Pal = [0x3b2a1d, 0x4a3524, 0x58402c];
  const hat = boxFaces(32, 0, 8, 8, 8);
  const body = boxFaces(16, 16, 8, 12, 4);
  const arm = boxFaces(40, 16, 4, 12, 4);
  const leg = boxFaces(0, 16, 4, 12, 4);
  const opaque = (f: [number, number, number, number], x: number, y: number) => t.data[((f[1] + y) * t.w + f[0] + x) * 4 + 3] > 0;
  // the hood: over the crown and down the back and sides, open round the face, ragged at its edge
  noiseFace(t, hat.top, r, CL, { w: CLW, cell: 1 });
  for (const k of SIDES) {
    const rows = k === 'front' ? 2 : k === 'back' ? 7 : 5;
    noiseFace(t, hat[k], r, CL, { w: CLW, cell: 1, mask: (x, y, w) => (k === 'front' ? y < rows && (y === 0 || x === 0 || x === w - 1) : y < rows || (y === rows && r.chance(0.5))) });
  }
  // the tunic: torn to a ragged hem, with a leather belt
  for (const k of SIDES) {
    noiseFace(t, body[k], r, CL, { w: CLW, cell: 1, mask: (_x, y) => y < 10 || (y === 10 && r.chance(0.55)) || (y === 11 && r.chance(0.2)) });
    paintFace(t, body[k], (_x, y) => (y === 7 ? pick(r, LEATHER) : undefined));
  }
  noiseFace(t, body.top, r, CL, { w: CLW, cell: 1 });
  // (a tear down the front)
  paintFace(t, body.front, (x, y) => (x === 4 && y >= 2 && y <= 5 ? null : undefined));
  // sleeves to the elbow, frayed; trouser legs to the shin
  for (const k of SIDES) noiseFace(t, arm[k], r, CL, { w: CLW, cell: 1, mask: (_x, y) => y < 5 || (y === 5 && r.chance(0.5)) });
  noiseFace(t, arm.top, r, CL, { w: CLW, cell: 1 });
  for (const k of SIDES) noiseFace(t, leg[k], r, CL, { w: CLW, cell: 1, mask: (_x, y) => y < 8 || (y === 8 && r.chance(0.5)) || (y === 9 && r.chance(0.15)) });
  // (grime in the weave)
  for (const f of [body.front, body.back]) paintFace(t, f, (x, y, c) => (y > 0 && y < 7 && opaque(f, x, y) && r.chance(0.08) ? mulC(c, 0.8) : undefined));
  return t;
}

MOB_TEXTURES.husk = husk;
MOB_TEXTURES.stray = stray;
MOB_TEXTURES.stray_overlay = strayOverlay;
