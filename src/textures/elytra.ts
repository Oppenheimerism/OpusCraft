// The elytra's wings as worn (vanilla textures/entity/elytra.png, 64 x 32, laid over ElytraModel's two 10 x 20 x 2
// boxes from 22, 0; the right wing's box is mirrored, so both wings share it). Each wing is a long leaf of pale
// grey-violet membrane: straight along its leading edge (the top edge when spread), curving in toward the tip along its
// trailing edge, darker ribs slanting out from the shoulder and a dark rim round it. Where the leaf doesn't reach, the
// box is clear (vanilla draws it cutout), which is what gives the wing its shape. The face toward the wearer's back is
// a shade darker than the outer one.

import { img, plot, type TexImage } from './tex';

/** how far across the wing (from its leading edge) the membrane reaches, from the shoulder (0) to the tip (19) */
const WIDTH = [10, 10, 10, 10, 10, 10, 10, 10, 9, 9, 8, 8, 7, 6, 6, 5, 4, 3, 3, 2];

const RIM = 0x5e5c6c, RIB = 0x8c8a9c, LEADING = 0xc4c2d2, MEMBRANE = 0xaeacbe;

/** the colour at `a` across the wing (0: the leading edge) and `b` down it, or null where it's clear */
function wingColour(a: number, b: number, inner: boolean): number | null {
  if (a >= WIDTH[b]) return null;
  // (the rim: the leading and trailing edges, the shoulder and the tip, and each step of the trailing edge's curve)
  const rim = a === 0 || b === 0 || b === 19 || a === WIDTH[b] - 1 || a >= WIDTH[b + 1];
  let c = rim ? RIM : (a * 2 + b) % 7 === 0 || (a + 3 * b) % 11 === 0 ? RIB : a <= 2 ? LEADING : MEMBRANE;
  if (inner) c = (Math.round(((c >> 16) & 255) * 0.82) << 16) | (Math.round(((c >> 8) & 255) * 0.82) << 8) | Math.round((c & 255) * 0.84);
  return c;
}

/**
 * the wing texture. Where each of the box's faces goes (vanilla ModelPart.Cube's layout for a 10 x 20 x 2 box at 22, 0;
 * the left wing's leading edge is its box's +x side): the face toward the back at 24..33 (the leading edge at the right),
 * the outer face at 36..45 (the leading edge at the left), the leading edge's side at 34..35, the trailing edge's at
 * 22..23, the shoulder end at 24..33 and the tip end at 34..43, the last two along the top two rows
 */
export function elytraTexture(): TexImage {
  const t = img(64, 32);
  for (let b = 0; b < 20; b++)
    for (let a = 0; a < 10; a++) {
      const n = wingColour(a, b, true), s = wingColour(a, b, false);
      if (n !== null) plot(t, 24 + 9 - a, 2 + b, n);
      if (s !== null) plot(t, 36 + a, 2 + b, s);
    }
  for (let b = 0; b < 20; b++) {
    // the leading edge runs the whole length; the trailing edge only where the wing is at its full width
    for (const u of [34, 35]) plot(t, u, 2 + b, RIM);
    if (WIDTH[b] === 10) for (const u of [22, 23]) plot(t, u, 2 + b, RIM);
  }
  for (let c = 0; c < 10; c++)
    for (const v of [0, 1]) {
      plot(t, 24 + c, v, RIM);
      // (the tip end: its +x side is the leading edge, at the right)
      if (9 - c < WIDTH[19]) plot(t, 34 + c, v, RIM);
    }
  return t;
}
