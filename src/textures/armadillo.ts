// (remaining mobs: the armadillo) The armadillo's skin (vanilla textures/entity/armadillo.png, 64x64 on
// ArmadilloModel's layout): a dusty rose shell over its back and flanks, a scaly shield over the shoulders and
// another over the hips with three bands between them, each band a row of little plates between dark grooves; the
// shell's lower edge a pale rim with pink skin showing under it, and open at the front and back round the neck and
// the tail. Pale pink skin beneath (the belly creased), a small pink head with a shield on its crown, a dark nose at
// the tip and black eyes on its sides, tall pink ears, stubby legs with dark claws, a ringed tail; and, rolled up, a
// ball of the same shell, the bands over its top and down its sides, the shields at its front and back, a dark seam
// across the front where it peeks out. And wolf armour's (vanilla textures/entity/wolf/wolf_armor.png, 64x32 on
// WolfModel's layout): the same scute plates in bands over a wolf's back, shoulders and flanks and the tops of its
// legs, a pale rim round the edges; its dye overlay (wolf_armor_overlay.png), the plates alone in greys to take the
// colour, the rims and grooves left as they are; and its cracks (wolf_armor_crackiness_low, _medium and _high.png),
// dark and see-through, more at each. Original pixel art.

import { Rand } from '../core/rng';
import { img, mixC, mulC, plot, type TexImage } from './tex';
import { MOB_TEXTURES, boxFaces, drawFace, noiseBox, noiseFace, paintFace, pick, type Face, type Ink, type Pal } from './mobs';

/** the shell, dark to light (the spawn egg's dusty rose), and how much of each */
const SHELL: Pal = [0x8a5450, 0x98605b, 0xa66b65, 0xb2766f, 0xbe837b];
const SHELL_W: Pal = [1, 3, 5, 4, 2];
/** the grooves between its bands (the egg's darker spots) */
const GROOVE: Pal = [0x6c3b3a, 0x764140, 0x824848];
/** the pale edges of its plates */
const RIM: Pal = [0xc38a82, 0xcb958c, 0xd29e95];
/** its skin: the belly, the face, the ears, the legs */
const SKIN: Pal = [0xcf958c, 0xd8a097, 0xe0aaa1, 0xe7b5ac];
const SKIN_DARK: Pal = [0xae756e, 0xb98078, 0xc28a82];
const INNER_EAR: Pal = [0xc27470, 0xca7d78];
const EYE = 0x1d1313;
const NOSE: Pal = [0x6f3e3c, 0x7b4745];
const CLAW: Pal = [0x46302d, 0x523934];

type Zone = 'rim' | 'shield' | 'groove' | 'band';

/** along the body's shell (0 at the head end, 11 at the tail end): a rim, the shoulder shield, three bands between four grooves, the hip shield, a rim */
function bodyZone(i: number): Zone {
  if (i <= 0 || i >= 11) return 'rim';
  if (i <= 2 || i >= 10) return 'shield';
  return i % 2 === 1 ? 'groove' : 'band';
}

/** over the ball (0 at the front, 9 at the back): the shoulder shield, three bands between grooves, the hip shield */
function ballZone(j: number): Zone {
  if (j <= 1 || j >= 9) return 'shield';
  return j % 2 === 0 ? 'groove' : 'band';
}

/**
 * a pixel of shell: `i` how far along it (to set the shield's scales off row by row), `a` how far across it. A band
 * is a row of little plates, lit and shaded in turn; a shield, scales set like bricks, each lit at its front
 */
function shellPx(z: Zone, i: number, a: number, r: Rand): number {
  switch (z) {
    case 'rim':
      return pick(r, RIM);
    case 'groove':
      return pick(r, GROOVE);
    case 'band':
      return a % 2 === 0 ? pick(r, SHELL.slice(2), [3, 3, 1]) : pick(r, SHELL.slice(0, 3), [1, 3, 2]);
    default: {
      const k = (a + (i % 2) * 2) % 4;
      return k === 0 ? pick(r, SHELL.slice(3)) : k === 3 ? pick(r, SHELL.slice(0, 2)) : pick(r, SHELL, SHELL_W);
    }
  }
}

// ArmadilloModel's boxes (vanilla texOffs and sizes)
const SHELL_BOX = boxFaces(0, 20, 8, 8, 12);
const SKIN_BOX = boxFaces(0, 40, 8, 8, 12);
const HEAD = boxFaces(43, 15, 3, 5, 2);
const TAIL = boxFaces(44, 53, 1, 6, 1);
const BALL = boxFaces(0, 0, 10, 10, 10);
const LEGS = [boxFaces(51, 31, 2, 3, 2), boxFaces(42, 31, 2, 3, 2), boxFaces(51, 43, 2, 3, 2), boxFaces(42, 43, 2, 3, 2)];

function armadillo(): TexImage {
  const t = img(64, 64);
  const r = new Rand(0xa2ad1110);
  const inks: Record<string, Ink> = {
    S: () => shellPx('shield', 0, r.nextInt(4), r),
    R: RIM,
    G: GROOVE,
    x: null,
  };

  // the shell (a hair bigger than the body): its top along the spine (row 0 the tail end, the last the head end),
  // its sides down to a pale rim (the right's columns tail to head, the left's head to tail), the skin showing below
  // the rim, underneath and round the neck and the tail
  paintFace(t, SHELL_BOX.top, (x, y) => shellPx(bodyZone(11 - y), 11 - y, x, r));
  paintFace(t, SHELL_BOX.right, (x, y) => (y === 7 ? null : y === 6 ? pick(r, RIM) : shellPx(bodyZone(11 - x), 11 - x, y + 1, r)));
  paintFace(t, SHELL_BOX.left, (x, y) => (y === 7 ? null : y === 6 ? pick(r, RIM) : shellPx(bodyZone(x), x, y + 1, r)));
  drawFace(t, SHELL_BOX.front, [
    'SSSSSSSS',
    'SRRRRRRS',
    'RxxxxxxR',
    'SxxxxxxS',
    'SxxxxxxS',
    'SxxxxxxS',
    'RxxxxxxR',
    'xxxxxxxx',
  ], inks, r);
  drawFace(t, SHELL_BOX.back, [
    'SSSSSSSS',
    'SSSSSSSS',
    'SSSSSSSS',
    'SRRRRRRS',
    'SxxxxxxS',
    'SxxxxxxS',
    'RxxxxxxR',
    'xxxxxxxx',
  ], inks, r);
  paintFace(t, SHELL_BOX.bottom, () => null);

  // the body under it: pink skin, the belly paler and creased, darker in the shade under the shell's edge
  noiseBox(t, SKIN_BOX, r, SKIN);
  noiseFace(t, SKIN_BOX.bottom, r, SKIN.slice(1), { w: [2, 3, 2] });
  paintFace(t, SKIN_BOX.bottom, (x, y, c, w) => (y % 3 === 1 && x > 0 && x < w - 1 ? mulC(c, 0.93) : undefined));
  for (const f of [SKIN_BOX.front, SKIN_BOX.back])
    paintFace(t, f, (x, y, c, w) => (y <= 1 || x === 0 || x === w - 1 ? mulC(c, 0.86) : undefined));
  for (const f of [SKIN_BOX.right, SKIN_BOX.left]) paintFace(t, f, (_x, y, c) => (y < 6 ? mulC(c, 0.9) : undefined));

  // the head: pink, a shield on its crown and over its brow, the nose dark at the tip, an eye on each side
  noiseBox(t, HEAD, r, SKIN);
  noiseFace(t, HEAD.top, r, SHELL.slice(1, 4));
  noiseFace(t, HEAD.back, r, SKIN_DARK);
  drawFace(t, HEAD.front, ['SSS', 'RSR', '...', '...', 'nnn'], { ...inks, S: SHELL.slice(1, 4), n: SKIN_DARK }, r);
  noiseFace(t, HEAD.bottom, r, NOSE);
  // (the right side's front is its last column, the left's its first)
  drawFace(t, HEAD.right, ['SS', '.E', '..', '..', '.n'], { S: SHELL.slice(1, 3), E: EYE, n: SKIN_DARK }, r);
  drawFace(t, HEAD.left, ['SS', 'E.', '..', '..', 'n.'], { S: SHELL.slice(1, 3), E: EYE, n: SKIN_DARK }, r);

  // the ears (flat): pink, the inside of each darker down its middle, the tips rounded off
  const earFront = (x0: number, inner: number) =>
    paintFace(t, [x0, 10, 2, 5], (x, y) => (y === 0 && x !== inner ? null : x === inner && y > 0 ? pick(r, INNER_EAR) : pick(r, SKIN_DARK)));
  const earBack = (x0: number, inner: number) => paintFace(t, [x0, 10, 2, 5], (x, y) => (y === 0 && x !== inner ? null : pick(r, SKIN_DARK)));
  earFront(43, 1);
  earBack(45, 0);
  earFront(47, 0);
  earBack(49, 1);

  // the legs: stubby, a shade darker than the belly, dark claws at the front and dark soles
  for (const L of LEGS) {
    noiseBox(t, L, r, SKIN_DARK);
    paintFace(t, L.front, (_x, y) => (y === 2 ? pick(r, CLAW) : undefined));
    noiseFace(t, L.bottom, r, CLAW);
  }

  // the tail: armoured in rings, its tip bare
  for (const f of [TAIL.right, TAIL.front, TAIL.left, TAIL.back])
    paintFace(t, f, (_x, y) => (y === 5 ? pick(r, SKIN_DARK) : y % 2 === 0 ? pick(r, SHELL.slice(1, 4)) : pick(r, GROOVE)));
  noiseFace(t, TAIL.top, r, SHELL.slice(1, 4));
  noiseFace(t, TAIL.bottom, r, SKIN_DARK);

  // rolled up: the ball. Its top the bands (row 0 the back, the last the front), running on down its sides (the
  // right's columns back to front, the left's front to back), the shoulder shield down its front, a dark gap across
  // it, the hip shield down its back round the curled tail, closed underneath
  paintFace(t, BALL.top, (x, y) => shellPx(ballZone(9 - y), 9 - y, x, r));
  paintFace(t, BALL.right, (x, y) => {
    const c = shellPx(ballZone(9 - x), 9 - x, y, r);
    return y >= 8 ? mulC(c, y === 9 ? 0.82 : 0.9) : c;
  });
  paintFace(t, BALL.left, (x, y) => {
    const c = shellPx(ballZone(x), x, y, r);
    return y >= 8 ? mulC(c, y === 9 ? 0.82 : 0.9) : c;
  });
  const gap = mulC(GROOVE[0], 0.62);
  paintFace(t, BALL.front, (x, y) => {
    if (y === 6 && x >= 1 && x <= 8) return mixC(gap, pick(r, GROOVE), x === 1 || x === 8 ? 0.6 : 0.15);
    if (y === 0) return pick(r, RIM);
    return shellPx('shield', y, x, r);
  });
  paintFace(t, BALL.back, (x, y) => {
    if (x >= 4 && x <= 5 && y >= 6) return y % 2 === 0 ? pick(r, SHELL.slice(2, 4)) : pick(r, GROOVE);
    if (y === 0) return pick(r, RIM);
    return shellPx('shield', y, x, r);
  });
  paintFace(t, BALL.bottom, (x, y) => (y === 4 || y === 5 ? pick(r, GROOVE) : mulC(shellPx('shield', y, x, r), 0.84)));
  return t;
}

MOB_TEXTURES['armadillo'] = armadillo;

// ---------------------------------------------------------------------------
// wolf armour (on WolfModel's layout, as in textures/wolf.ts; its body and mane are turned on their sides: a side's
// rows run head to tail, the right side's columns spine to belly, the left's belly to spine)

const W_BODY = boxFaces(18, 14, 6, 9, 6);
const W_MANE = boxFaces(21, 0, 8, 6, 7);
const W_LEG = boxFaces(0, 18, 2, 8, 2);

type ArmorZone = 'plate' | 'groove' | 'rim';
interface ArmorPx {
  z: ArmorZone;
  /** a plate's shade, 0 to 4 */
  s: number;
}

/** the armour's pieces, pixel by pixel (by y * 64 + x): what's there and how it's shaded */
function armorPlan(): Map<number, ArmorPx> {
  const plan = new Map<number, ArmorPx>();
  const r = new Rand(0x3017ae);
  const plateShade = (a: number, lead: boolean) => (lead ? 4 : a % 2 === 0 ? 2 + r.nextInt(2) : 1 + r.nextInt(2));
  const cover = (f: Face, fn: (x: number, y: number, w: number, h: number) => ArmorPx | null) => {
    const [x0, y0, w, h] = f;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = fn(x, y, w, h);
        if (p) plan.set((y0 + y) * 64 + x0 + x, p);
      }
  };
  const rim = (): ArmorPx => ({ z: 'rim', s: 0 });
  // (along the body: plates three rows deep between grooves, the last row the rim over the rump)
  const bodyAlong = (y: number, a: number): ArmorPx =>
    y === 8 ? rim() : y % 3 === 2 ? { z: 'groove', s: 0 } : { z: 'plate', s: plateShade(a, y % 3 === 0) };
  cover(W_BODY.back, (x, y) => bodyAlong(y, x));
  cover(W_BODY.right, (x, y) => (x > 3 ? null : x === 3 ? rim() : bodyAlong(y, x + y)));
  cover(W_BODY.left, (x, y) => (x < 2 ? null : x === 2 ? rim() : bodyAlong(y, x + y)));
  cover(W_BODY.bottom, (x, y) => (y > 2 ? null : y === 2 ? rim() : { z: 'plate', s: plateShade(x, y === 0) }));
  // (over the shoulders, the mane: a shield of scales, rimmed at the neck and along its lower edges)
  const scales = (a: number, y: number): ArmorPx => {
    const k = (a + (y % 2) * 2) % 4;
    return { z: 'plate', s: k === 0 ? 4 : k === 3 ? 1 : 2 + r.nextInt(2) - (r.chance(0.3) ? 1 : 0) };
  };
  cover(W_MANE.back, (x, y) => (y === 0 ? rim() : scales(x, y)));
  cover(W_MANE.right, (x, y) => (x > 4 ? null : x === 4 || y === 0 ? rim() : scales(x, y)));
  cover(W_MANE.left, (x, y) => (x < 2 ? null : x === 2 || y === 0 ? rim() : scales(x, y)));
  cover(W_MANE.top, (x, y) => (y > 2 ? null : y === 2 ? rim() : scales(x, y)));
  cover(W_MANE.bottom, (x, y) => (y > 2 ? null : scales(x, y)));
  // (the tops of the legs, rimmed at the knee)
  for (const f of [W_LEG.right, W_LEG.front, W_LEG.left, W_LEG.back]) cover(f, (x, y) => (y > 3 ? null : y === 3 ? rim() : { z: 'plate', s: plateShade(x + y, y === 0) }));
  cover(W_LEG.top, (x) => ({ z: 'plate', s: plateShade(x, false) }));
  return plan;
}

/** vanilla wolf_armor.png: the scutes in their own colours */
function wolfArmor(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0x3017af);
  for (const [k, p] of armorPlan()) {
    const c = p.z === 'rim' ? pick(r, RIM) : p.z === 'groove' ? pick(r, GROOVE) : SHELL[p.s];
    plot(t, k % 64, Math.floor(k / 64), c);
  }
  return t;
}

/** vanilla wolf_armor_overlay.png: the plates in greys, to be dyed (their rims and grooves not) */
function wolfArmorOverlay(): TexImage {
  const t = img(64, 32);
  const GREYS = [0xa8a8a8, 0xbcbcbc, 0xcfcfcf, 0xe2e2e2, 0xf6f6f6];
  for (const [k, p] of armorPlan()) if (p.z === 'plate') plot(t, k % 64, Math.floor(k / 64), GREYS[p.s]);
  return t;
}

/**
 * vanilla wolf_armor_crackiness_<level>.png (drawn see-through over the armour): cracks wandering across its plates,
 * a chipped pale edge here and there; each level has the last's and more
 */
function wolfArmorCracks(level: 1 | 2 | 3): TexImage {
  const t = img(64, 32);
  const plan = armorPlan();
  const r = new Rand(0xc4ac5);
  const keys = [...plan.keys()];
  const counts = [0, 5, 7, 10];
  const faces: Face[] = [W_BODY.back, W_BODY.right, W_BODY.left, W_MANE.back, W_MANE.right, W_MANE.left, W_BODY.bottom, W_MANE.top, W_LEG.front];
  const within = (x: number, y: number) => faces.some(([fx, fy, fw, fh]) => x >= fx && x < fx + fw && y >= fy && y < fy + fh);
  for (let l = 1; l <= level; l++) {
    for (let n = 0; n < counts[l]; n++) {
      let k = keys[r.nextInt(keys.length)];
      let x = k % 64, y = Math.floor(k / 64);
      if (!within(x, y)) continue;
      let dx = r.chance(0.5) ? 1 : -1, dy = r.chance(0.5) ? 1 : 0;
      const len = 2 + l + r.nextInt(2);
      for (let s = 0; s < len; s++) {
        plot(t, x, y, 0x2a1a17, 205);
        const [cx, cy] = [x + (dy ? 1 : 0), y + (dy ? 0 : 1)];
        if (r.chance(0.3) && plan.has(cy * 64 + cx) && within(cx, cy)) plot(t, cx, cy, 0xf0d8d0, 90);
        if (r.chance(0.35)) [dx, dy] = r.chance(0.5) ? [dx, dy ? 0 : 1] : [dx, dy];
        x += dx;
        y += dy;
        k = y * 64 + x;
        if (!plan.has(k) || !within(x, y)) break;
      }
    }
  }
  return t;
}

MOB_TEXTURES['wolf_armor'] = wolfArmor;
MOB_TEXTURES['wolf_armor_overlay'] = wolfArmorOverlay;
MOB_TEXTURES['wolf_armor_crackiness_low'] = () => wolfArmorCracks(1);
MOB_TEXTURES['wolf_armor_crackiness_medium'] = () => wolfArmorCracks(2);
MOB_TEXTURES['wolf_armor_crackiness_high'] = () => wolfArmorCracks(3);
