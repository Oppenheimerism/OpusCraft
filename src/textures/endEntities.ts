// Entity textures of the End (vanilla textures/entity/end_crystal/end_crystal.png).
// 64x32 in vanilla's box-UV layout: the glass cage cube at (0,0), the crystal
// cube at (32,0), the plinth (12x4x12) at (0,16).

import { TexImage, img, setPx, Rand } from './tex';

/** the six face rectangles [x, y, w, h] of a box's UV unwrap at (u, v) */
function boxFaces(u: number, v: number, w: number, h: number, d: number): [number, number, number, number][] {
  return [
    [u + d, v, w, d], // down
    [u + d + w, v, w, d], // up
    [u, v + d, d, h], // west
    [u + d, v + d, w, h], // north
    [u + d + w, v + d, d, h], // east
    [u + d + w + d, v + d, w, h], // south
  ];
}

export function endCrystalTexture(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0xe7c75a1, 3);
  // glass: a pale lilac-white rim round each face, clear inside but for a glint
  for (const [x0, y0, w, h] of boxFaces(0, 0, 8, 8, 8)) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        if (edge) setPx(t, x0 + x, y0 + y, x === 0 || y === 0 ? 0xf6f0fa : r.chance(0.3) ? 0xc8bcd6 : 0xddd2e8);
      }
    setPx(t, x0 + 2, y0 + 2, 0xffffff);
    setPx(t, x0 + 3, y0 + 2, 0xe8e0f0);
    setPx(t, x0 + 2, y0 + 3, 0xe8e0f0);
  }
  // the crystal: deep magenta at the edges to pale pink in the middle, speckled
  const ramp = [0x4c1250, 0x6e1e74, 0x93309a, 0xb84cbc, 0xd46fd4, 0xeba3e8, 0xf8d0f4];
  for (const [x0, y0, w, h] of boxFaces(32, 0, 8, 8, 8))
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const e = Math.min(x, y, w - 1 - x, h - 1 - y);
        let k = 1 + e * 1.4 + (r.next() - 0.5) * 1.6;
        if (x + y < 5) k += 0.8;
        setPx(t, x0 + x, y0 + y, ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(k)))]);
      }
  // the plinth: bedrock-dark stone, lighter on its top edge
  const stone = [0x1e1e1e, 0x2e2e2e, 0x3f3f3f, 0x505050, 0x626262, 0x747474];
  for (const [x0, y0, w, h] of boxFaces(0, 16, 12, 4, 12))
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let k = Math.floor(r.next() * 4) + (r.chance(0.15) ? 2 : 0);
        if (h === 4 && y === 0) k = Math.max(k, 4);
        setPx(t, x0 + x, y0 + y, stone[Math.min(stone.length - 1, k)]);
      }
  return t;
}
