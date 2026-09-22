// Default player skin (64x64, standard skin layout), drawn procedurally:
// brown hair, tan skin, teal shirt, blue jeans, dark shoes.

import { TexImage, img, setPx, Rand, mulC, mixC } from './tex';

type Face = [number, number, number, number]; // x, y, w, h

function boxFaces(u: number, v: number, w: number, h: number, d: number): Record<string, Face> {
  return {
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h],
    front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h],
    back: [u + d + w + d, v + d, w, h],
  };
}

function fillFace(t: TexImage, f: Face, pal: number[], r: Rand, noise = 0.5): void {
  const [x0, y0, w, h] = f;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = r.next() < noise ? (r.next() < 0.5 ? 0 : 2) : 1;
      setPx(t, x0 + x, y0 + y, pal[Math.min(pal.length - 1, k)]);
    }
}

export function steveSkin(): TexImage {
  const t = img(64, 64);
  const r = new Rand(0x57e7e);
  const skin = [0xa87d63, 0xb68a6f, 0xc49a7e];
  const hair = [0x2f1f0e, 0x3b2715, 0x4a321b];
  const shirt = [0x008080, 0x00a0a0, 0x00b2b2];
  const pants = [0x2c2869, 0x3a3591, 0x463fa6];
  const shoe = [0x5a5a5a, 0x6b6b6b, 0x777777];
  // head
  const hf = boxFaces(0, 0, 8, 8, 8);
  for (const k of ['right', 'left', 'back', 'bottom', 'front']) fillFace(t, hf[k], skin, r, 0.3);
  fillFace(t, hf.top, hair, r, 0.5);
  // hair on sides/back upper part
  for (const k of ['right', 'left', 'back', 'front']) {
    const [x0, y0, w] = hf[k];
    const rows = k === 'back' ? 8 : k === 'front' ? 2 : 3;
    for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) setPx(t, x0 + x, y0 + y, hair[r.nextInt(3)]);
    if (k === 'right' || k === 'left') for (let y = 3; y < 5; y++) setPx(t, x0 + (k === 'right' ? w - 1 : 0), y0 + y, hair[1]);
  }
  // face details (front face at 8,8 .. 16,16)
  const fx = 8, fy = 8;
  setPx(t, fx + 0, fy + 2, hair[1]);
  setPx(t, fx + 7, fy + 2, hair[1]);
  // eyes (row 4): white + blue-purple pupil
  setPx(t, fx + 1, fy + 4, 0xffffff);
  setPx(t, fx + 2, fy + 4, 0x523d89);
  setPx(t, fx + 5, fy + 4, 0x523d89);
  setPx(t, fx + 6, fy + 4, 0xffffff);
  // nose + mouth / beard shading
  setPx(t, fx + 3, fy + 5, 0x94644a);
  setPx(t, fx + 4, fy + 5, 0x94644a);
  for (let x = 2; x < 6; x++) setPx(t, fx + x, fy + 6, 0x6a4030);
  for (let x = 1; x < 7; x++) setPx(t, fx + x, fy + 7, mulC(skin[1], 0.85));
  setPx(t, fx + 1, fy + 6, mulC(skin[1], 0.9));
  setPx(t, fx + 6, fy + 6, mulC(skin[1], 0.9));
  // body (shirt) 16,16
  const bf = boxFaces(16, 16, 8, 12, 4);
  for (const k of Object.keys(bf)) fillFace(t, bf[k], shirt, r, 0.25);
  // neck skin v on front
  const [bx, by] = bf.front;
  for (let x = 3; x < 5; x++) setPx(t, bx + x, by, skin[1]);
  // arms: sleeve top 4 rows shirt, rest skin
  const armFaces = (u: number, v: number) => boxFaces(u, v, 4, 12, 4);
  for (const [u, v] of [[40, 16], [32, 48]]) {
    const af = armFaces(u, v);
    for (const k of ['right', 'front', 'left', 'back']) {
      const [x0, y0, w, h] = af[k];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const pal = y < 4 ? shirt : skin;
          setPx(t, x0 + x, y0 + y, pal[r.next() < 0.3 ? r.nextInt(3) : 1]);
        }
    }
    fillFace(t, af.top, shirt, r, 0.25);
    fillFace(t, af.bottom, skin, r, 0.3);
  }
  // legs: jeans with shoes on bottom 2 rows
  for (const [u, v] of [[0, 16], [16, 48]]) {
    const lf = boxFaces(u, v, 4, 12, 4);
    for (const k of ['right', 'front', 'left', 'back']) {
      const [x0, y0, w, h] = lf[k];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const pal = y >= 10 ? shoe : pants;
          setPx(t, x0 + x, y0 + y, pal[r.next() < 0.3 ? r.nextInt(3) : 1]);
        }
    }
    fillFace(t, lf.top, pants, r, 0.25);
    fillFace(t, lf.bottom, shoe, r, 0.25);
  }
  void mixC;
  return t;
}
