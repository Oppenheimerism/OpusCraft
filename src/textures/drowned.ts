// The drowned (vanilla textures/entity/zombie/drowned.png, on the player's 64x64 layout: its left arm and leg have
// their own skin): a zombie gone to sea, its skin a bloated blue-green with darker rot, pale glowing eyes, the teal
// shirt bleached, holed and torn to a ragged hem, the trousers rotted off at the shin over bare feet. And over it
// (drowned_outer_layer.png, the same boxes a quarter pixel bigger, the hat three quarters): the seaweed it wears, a
// mop of kelp over the crown and down the back, strands caught on a shoulder, round an arm and tangled at an ankle.
// Original pixel art in the style of vanilla 1.21.

import { TexImage, img, mulC, Rand } from './tex';
import { MOB_TEXTURES, boxFaces, noiseBox, noiseFace, paintFace, drawFace, fleck, pick, SIDES, type Box, type FaceName, type Pal } from './mobs';

const SK: Pal = [0x3a8474, 0x459484, 0x51a393, 0x5eb2a1, 0x6cbfae, 0x7bcaba, 0x8dd6c7];
const SKW: Pal = [1, 2, 4, 7, 6, 3, 1];
/** the rot: darker blotches on the skin */
const ROT: Pal = [0x2d6a5e, 0x347667, 0x3c8171];
const SH: Pal = [0x1d4f57, 0x225b63, 0x28676f, 0x2e737a, 0x357e85, 0x3e8a90];
const SHW: Pal = [1, 2, 3, 5, 4, 2];
const PA: Pal = [0x2c3350, 0x333b5b, 0x3a4366, 0x424c70, 0x4b567a];
const PAW: Pal = [1, 3, 5, 3, 1];
const KELP: Pal = [0x33501f, 0x3f5f27, 0x4c6e2f, 0x5a7e37, 0x6b8f44, 0x7b9f55];
const KELPW: Pal = [1, 3, 5, 4, 2, 1];

/** the player layout's boxes: head, hat, body, both arms and both legs */
function parts(): Record<'head' | 'hat' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg', Box> {
  return {
    head: boxFaces(0, 0, 8, 8, 8),
    hat: boxFaces(32, 0, 8, 8, 8),
    body: boxFaces(16, 16, 8, 12, 4),
    rightArm: boxFaces(40, 16, 4, 12, 4),
    leftArm: boxFaces(32, 48, 4, 12, 4),
    rightLeg: boxFaces(0, 16, 4, 12, 4),
    leftLeg: boxFaces(16, 48, 4, 12, 4),
  };
}

function drowned(): TexImage {
  const t = img(64, 64);
  const r = new Rand(0xd40e3);
  const P = parts();
  const sk = () => pick(r, SK, SKW);
  const pants = () => pick(r, PA, PAW);

  // head: blue-green skin blotched with rot, bald under its seaweed; sunken brows over pale glowing eyes
  noiseBox(t, P.head, r, SK, { w: SKW });
  for (const k of ['top', 'right', 'left', 'back'] as FaceName[]) fleck(t, P.head[k], r, 0.09, ROT);
  drawFace(t, P.head.front, [
    '..d.....',
    '......d.',
    '........',
    '.bb..bb.',
    '.eE..Ee.',
    '...nn..d',
    '..mMMm..',
    '.d.mm...',
  ], {
    d: ROT, b: mulC(SK[2], 0.8), e: 0x5ee8d8, E: 0xd6fff8, n: mulC(SK[3], 0.78), m: 0x1c4a40, M: 0x123630,
  }, r);

  // body: the bleached shirt, holed, torn open at the collar and ragged at the hem; the trousers' waist below
  noiseBox(t, P.body, r, SH, { w: SHW });
  drawFace(t, P.body.front, [
    '..sss...',
    '...s....',
    '........',
    '.s......',
    '.ss.....',
    '......s.',
    '........',
    '....s...',
    's...ss.s',
    'ss.ssss.',
    'PP.PPPPP',
    'PPPPPPPP',
  ], { s: sk, P: pants }, r);
  drawFace(t, P.body.back, [
    '........',
    '........',
    '.....s..',
    '....ss..',
    '........',
    '.s......',
    '........',
    '........',
    '.s....s.',
    'ssss.sss',
    'PPPP.PPP',
    'PPPPPPPP',
  ], { s: sk, P: pants }, r);
  for (const k of ['right', 'left'] as FaceName[]) {
    drawFace(t, P.body[k], ['....', '....', '....', '....', '....', '....', '....', '....', '.s..', 'ss.s', 'P.PP', 'PPPP'], { s: sk, P: pants }, r);
  }
  noiseFace(t, P.body.bottom, r, PA, { w: PAW });
  for (const k of SIDES) paintFace(t, P.body[k], (_x, y, c) => (y < 8 && r.chance(0.07) ? mulC(c, 0.82) : undefined));

  // arms: bare, a stub of sleeve torn off at the shoulder, darker hands
  for (const [arm, seed] of [[P.rightArm, 0], [P.leftArm, 1]] as const) {
    noiseBox(t, arm, r, SK, { w: SKW });
    for (const k of SIDES) {
      noiseFace(t, arm[k], r, SH, { w: SHW, mask: (x, y) => y < 1 + ((x + seed) & 1) || (y === 2 && r.chance(0.3)) });
      fleck(t, arm[k], r, 0.07, ROT);
      paintFace(t, arm[k], (_x, y, c, _w, h) => (y >= h - 2 ? mulC(c, 0.88) : undefined));
    }
    noiseFace(t, arm.top, r, SH, { w: SHW });
    paintFace(t, arm.bottom, (_x, _y, c) => mulC(c, 0.85));
    paintFace(t, arm.back, (_x, _y, c) => mulC(c, 0.92));
  }

  // legs: the trousers rotted to ragged ends below the knee, bare feet
  for (const [leg, seed] of [[P.rightLeg, 0], [P.leftLeg, 2]] as const) {
    noiseBox(t, leg, r, SK, { w: SKW });
    for (const k of SIDES) {
      noiseFace(t, leg[k], r, PA, { w: PAW, mask: (x, y) => y < 7 + ((x * 3 + seed) % 3 === 0 ? 1 : 0) || (y === 8 && r.chance(0.25)) });
      paintFace(t, leg[k], (_x, y, c) => (y >= 8 && r.chance(0.08) ? pick(r, ROT) : y >= 11 ? mulC(c, 0.86) : undefined));
    }
    // (a hole at the knee)
    paintFace(t, leg.front, (x, y) => (y === 5 && x === 1 + (seed & 1) ? sk() : undefined));
    noiseFace(t, leg.top, r, PA, { w: PAW });
    paintFace(t, leg.bottom, (_x, _y, c) => mulC(c, 0.8));
  }
  return t;
}

/** the kelp it wears, on the same layout (the boxes drawn a quarter pixel out, the hat three quarters) */
function drownedOuter(): TexImage {
  const t = img(64, 64);
  const r = new Rand(0xd40e4);
  const P = parts();
  const kelp = () => pick(r, KELP, KELPW);
  /** a strand hanging from the top of a face: `len` rows, its tip darker */
  const strand = (f: [number, number, number, number], x: number, len: number, from = 0) => {
    paintFace(t, f, (fx, y) => (fx === x && y >= from && y < from + len ? (y === from + len - 1 ? mulC(kelp(), 0.85) : kelp()) : undefined));
  };

  // the mop over the crown, hanging to the neck at the back, over the ears, just a fringe at the front
  noiseFace(t, P.hat.top, r, KELP, { w: KELPW, cell: 1 });
  for (let x = 0; x < 8; x++) {
    strand(P.hat.back, x, 4 + r.nextInt(5));
    strand(P.hat.right, x, x < 6 ? 2 + r.nextInt(5) : 1 + r.nextInt(2));
    strand(P.hat.left, x, x > 1 ? 2 + r.nextInt(5) : 1 + r.nextInt(2));
    strand(P.hat.front, x, 1 + (r.chance(0.4) ? 1 : 0));
  }
  // (a long strand down each temple, clear of the eyes)
  strand(P.hat.front, 0, 6);
  strand(P.hat.front, 7, 4);

  // over the left shoulder and down the chest and back
  strand(P.body.front, 6, 5);
  strand(P.body.front, 7, 3);
  strand(P.body.back, 0, 6);
  strand(P.body.back, 1, 4);
  paintFace(t, P.body.top, (x) => (x >= 5 ? kelp() : undefined));

  // wound round the right arm above the elbow, and trailing off the left shoulder
  for (const k of SIDES) paintFace(t, P.rightArm[k], (x, y) => ((y === 3 && r.chance(0.85)) || (y === 4 && (x + (k === 'front' ? 1 : 0)) % 2 === 0) ? kelp() : undefined));
  strand(P.rightArm.right, 1, 3, 4);
  noiseFace(t, P.leftArm.top, r, KELP, { w: KELPW, cell: 1, mask: (x) => x >= 2 });
  strand(P.leftArm.left, 1, 5);
  strand(P.leftArm.left, 2, 3);
  strand(P.leftArm.front, 3, 2);

  // tangled at the left ankle, a strand caught on the right knee
  for (const k of SIDES) paintFace(t, P.leftLeg[k], (_x, y) => ((y === 9 || y === 10) && r.chance(0.7) ? kelp() : undefined));
  strand(P.rightLeg.right, 2, 4, 3);
  strand(P.rightLeg.front, 0, 2, 5);
  return t;
}

MOB_TEXTURES.drowned = drowned;
MOB_TEXTURES.drowned_outer_layer = drownedOuter;
