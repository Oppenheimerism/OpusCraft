// (spyglass) The spyglass's model texture (vanilla textures/item/spyglass_model; our own drawing, in the colours of its
// sprite): the narrow eyepiece tube, copper with a dark leather grip round its middle; the wider copper barrel, lit
// down one side and ringed at each end; the lens, pale blue glass in a copper rim; the eyepiece's dark end. 16 x 16,
// laid out for render/spyglassRenderer.ts's two boxes.

import { type TexImage, img, plot } from './tex';

/** copper, light → dark */
const COPPER = [0xf6c08e, 0xf0aa7a, 0xd88256, 0xc87248, 0xb06238, 0x9a5230, 0x7a3e22];
/** the leather grip */
const LEATHER = [0x6a4526, 0x5a3a1e, 0x4a3018, 0x3a2410];
/** the lens */
const GLASS = [0xe0f6ff, 0xa8dcf0, 0x78b8d8];

/** where each face is drawn (u, v, w, h: pixels) */
export const SPYGLASS_UV = {
  /** the eyepiece tube's four sides, 2 wide and 7 high (row 0 at the barrel's end) */
  eyepieceSide: [0, 0, 2, 7],
  /** the eyepiece's end */
  eyepieceEnd: [2, 0, 2, 2],
  /** the barrel's four sides, 3 wide and 6 high (row 0 at the lens's end) */
  barrelSide: [4, 0, 3, 6],
  /** the lens */
  lens: [7, 0, 3, 3],
  /** the barrel's other end, round the eyepiece */
  barrelEnd: [7, 3, 3, 3],
} as const;

export function spyglassModelTexture(): TexImage {
  const t = img(16, 16);
  // the eyepiece: copper at its ends, the grip between; lit on its left column
  for (let r = 0; r < 7; r++)
    for (let c = 0; c < 2; c++) {
      const grip = r >= 1 && r <= 4;
      plot(t, c, r, grip ? LEATHER[c + (r === 1 || r === 4 ? 1 : 0)] : COPPER[3 + c + (r === 6 ? 1 : 0)]);
    }
  // its end: dark, with a glint of the glass inside
  plot(t, 2, 0, COPPER[5]);
  plot(t, 3, 0, COPPER[6]);
  plot(t, 2, 1, COPPER[6]);
  plot(t, 3, 1, GLASS[2]);
  // the barrel: light down one side, a rim at each end
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 3; c++) {
      const rim = r === 0 || r === 5;
      plot(t, 4 + c, r, rim ? COPPER[r === 0 ? c : 4 + c] : COPPER[1 + c * 2 - (r === 1 && c === 0 ? 1 : 0)]);
    }
  // the lens, in its rim
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) plot(t, 7 + c, r, r === 1 && c === 1 ? GLASS[0] : (r + c) % 2 ? GLASS[1] : COPPER[4]);
  // the barrel's other end, the eyepiece coming out of its middle
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) plot(t, 7 + c, 3 + r, r === 1 && c === 1 ? LEATHER[3] : COPPER[5]);
  return t;
}
