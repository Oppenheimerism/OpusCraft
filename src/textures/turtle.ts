// The turtle's skin (Stage 5: ocean, M6; vanilla textures/entity/turtle/big_sea_turtle.png, 128x64), in its model's
// box layout (render/turtleRenderer.ts): a green head and flippers flecked with pale yellow-green, dark eyes and a
// darker mouth line; the shell's carapace a pattern of olive-green plates on dark seams inside a brown rim, its sides
// and ends the rim; the plastron beneath pale yellow with its seams; and the egg belly, paler still, that shows while
// it's carrying eggs. Original pixel art in the style of vanilla 1.21.

import { TexImage, img, plot, getPx, mixC, mulC } from './tex';
import { Rand } from '../core/rng';
import { MOB_TEXTURES, boxFaces, noiseFace, paintFace, pick, SIDES, type Face } from './mobs';

const SKIN = [0x3c7536, 0x44823c, 0x4c8f42, 0x559a48];
const SKIN_DARK = [0x2f5f2b, 0x356a30];
const FLECK = [0x96c262, 0xa9cf70, 0x84b457];
const PLATE = [0x4b6a2a, 0x557631, 0x5f8238, 0x6a8d3e];
const SEAM = [0x26391a, 0x2c421e];
const RIM = [0x5e4c27, 0x6b572d, 0x776234, 0x54441f];
const BELLY = [0xc4bb74, 0xcfc680, 0xd8d08c, 0xbab169];
const EGG_BELLY = [0xe2dbb0, 0xeae4bd, 0xf1ecca];

/** skin: mottled green with pale flecks */
function skin(t: TexImage, f: Face, r: Rand, flecks = 0.12): void {
  noiseFace(t, f, r, SKIN);
  paintFace(t, f, (_x, _y, c) => (r.chance(flecks) ? pick(r, FLECK) : c));
}

/**
 * the carapace, seen from above (19 across, 20 long; its top rows toward the head): a brown rim round five plates
 * down the middle and four down each side, the plates lighter toward their middles
 */
function carapace(t: TexImage, f: Face, r: Rand): void {
  const [x0, y0, w, h] = f;
  const mid = (w - 1) / 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x - mid);
      let c: number;
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) c = pick(r, RIM);
      else {
        // the seams: between the middle row of plates and the sides, and across each (the sides' offset)
        const central = dx < 4;
        const seamX = Math.round(dx) === 4;
        const yy = central ? y - 1 : y + 1;
        const seamY = yy > 0 && yy < h - 2 && yy % 4 === 0;
        if (seamX || seamY) c = pick(r, SEAM);
        else {
          // the plate's own: lighter toward its middle
          const inPlateY = ((yy % 4) + 4) % 4;
          const edge = Math.min(inPlateY, 4 - inPlateY);
          const k = Math.min(3, Math.max(0, edge + (central ? (dx < 2 ? 1 : 0) : dx > 5 && dx < 8 ? 1 : 0) + (r.chance(0.25) ? 1 : 0) - (r.chance(0.15) ? 1 : 0)));
          c = PLATE[k];
        }
      }
      plot(t, x0 + x, y0 + y, c);
    }
}

/** the rim of the shell (its sides and ends): brown, darker along the lower edge (`lowAt`: which of its sides that is) */
function rim(t: TexImage, f: Face, r: Rand, lowAt: 'left' | 'right' | 'bottom'): void {
  noiseFace(t, f, r, RIM);
  paintFace(t, f, (x, y, c, w, h) => {
    const low = lowAt === 'bottom' ? y === h - 1 : lowAt === 'right' ? x === w - 1 : x === 0;
    return low ? mulC(c, 0.72) : undefined;
  });
}

/** the plastron: pale yellow, a seam down its middle and across it now and then */
function plastron(t: TexImage, f: Face, r: Rand, along: 'rows' | 'cols'): void {
  noiseFace(t, f, r, BELLY);
  const [, , w, h] = f;
  paintFace(t, f, (x, y, c) => {
    const [a, b, na] = along === 'rows' ? [x, y, w] : [y, x, h];
    if (Math.abs(a - (na - 1) / 2) < 0.6) return mulC(c, 0.8);
    if (b > 0 && b % 5 === 0) return mulC(c, 0.86);
    return undefined;
  });
}

/**
 * a flipper: skin above with its flecks, paler beneath, the tip's edge darker (`tip`: which edge of the top and
 * bottom faces is the tip: their first or last column, or their first row, which is the box's far end)
 */
function flipper(t: TexImage, u: number, v: number, w: number, h: number, d: number, r: Rand, tip: 'x0' | 'x1' | 'z1'): void {
  const b = boxFaces(u, v, w, h, d);
  skin(t, b.top, r, 0.18);
  noiseFace(t, b.bottom, r, [0x6f9a52, 0x7aa65b, 0x86b064]);
  for (const k of SIDES) noiseFace(t, b[k], r, SKIN_DARK);
  for (const f of [b.top, b.bottom])
    paintFace(t, f, (x, y, c, fw) => {
      const atTip = tip === 'x0' ? x === 0 : tip === 'x1' ? x === fw - 1 : y === 0;
      return atTip ? mulC(c, 0.75) : undefined;
    });
}

function turtle(): TexImage {
  const t = img(128, 64);
  const r = new Rand(0x7e7);

  // the head (6x5x6 at 3,0): skin all round, darker under the chin; the eyes on its sides near the front, and the
  // mouth a darker line across its face with a pale beak's edge above it
  const head = boxFaces(3, 0, 6, 5, 6);
  for (const k of ['top', ...SIDES] as const) skin(t, head[k], r);
  noiseFace(t, head.bottom, r, [0x7aa65b, 0x86b064, 0x6f9a52]);
  for (const [f, x] of [[head.right, 4], [head.left, 1]] as [Face, number][]) {
    plot(t, f[0] + x, f[1] + 1, 0x0e120c);
    plot(t, f[0] + x, f[1] + 2, 0x1c2418);
  }
  const fr = head.front;
  for (let x = 0; x < fr[2]; x++) {
    plot(t, fr[0] + x, fr[1] + 3, 0x243f20);
    plot(t, fr[0] + x, fr[1] + 2, mixC(getPx(t, fr[0] + x, fr[1] + 2), 0xc9c07a, 0.45));
  }
  for (const f of [head.right, head.left]) for (let x = 0; x < f[2]; x++) plot(t, f[0] + x, f[1] + 3, mulC(getPx(t, f[0] + x, f[1] + 3), 0.8));

  // the shell (19x20x6 at 7,37: turned on its back in the model, its "back" face the carapace on top)
  const shell = boxFaces(7, 37, 19, 20, 6);
  carapace(t, shell.back, r);
  // its sides (the right face's first column is the top edge, the left face's its last), its ends and its underside
  rim(t, shell.right, r, 'right');
  rim(t, shell.left, r, 'left');
  rim(t, shell.top, r, 'bottom');
  rim(t, shell.bottom, r, 'bottom');
  noiseFace(t, shell.front, r, [0x4a3b1c, 0x54441f, 0x5e4c27]);

  // the plastron (11x18x3 at 31,1), under the shell: its underside face along the body, the rest its edges
  const belly = boxFaces(31, 1, 11, 18, 3);
  plastron(t, belly.front, r, 'rows');
  plastron(t, belly.back, r, 'rows');
  for (const k of ['right', 'left'] as const) noiseFace(t, belly[k], r, BELLY);
  for (const k of ['top', 'bottom'] as const) noiseFace(t, belly[k], r, BELLY);

  // the egg belly (9x18x1 at 70,33): swollen and pale
  const egg = boxFaces(70, 33, 9, 18, 1);
  for (const k of ['top', 'bottom', ...SIDES] as const) noiseFace(t, egg[k], r, EGG_BELLY);
  paintFace(t, egg.front, (x, _y, c, w) => (x === 0 || x === w - 1 ? mulC(c, 0.9) : undefined));

  // the flippers: hind (4x1x10, the tip at the back end) and front (13x1x5, the tip outward)
  flipper(t, 1, 23, 4, 1, 10, r, 'z1');
  flipper(t, 1, 12, 4, 1, 10, r, 'z1');
  flipper(t, 27, 30, 13, 1, 5, r, 'x0');
  flipper(t, 27, 24, 13, 1, 5, r, 'x1');
  return t;
}

MOB_TEXTURES.turtle = turtle;
