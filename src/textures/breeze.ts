// (trial chambers) The breeze's and the wind charges' looks (vanilla textures/entity/breeze/breeze.png 32x32,
// breeze_eyes.png 32x32 and breeze_wind.png 128x128 on BreezeModel's layout, and projectiles/wind_charge.png 64x32 on
// WindChargeModel's). The breeze's head is a pale lilac-blue block, lighter on top and shaded underneath, with a
// dark indigo visor across its face and two pale cyan eyes in it that glow (the eyes layer: nothing else of it
// shows); its three rods are lilac with a bright edge and dark ends. Its wind, and a wind charge's, is streaks of pale
// air running round: every row of the texture a band of gusts that tiles along its width, so the scroll the renderer
// gives it (vanilla RenderType.breezeWind's offset) spins it without a seam; a wind charge's middle is a bright knot.
// Original pixel art.

import { Rand } from '../core/rng';
import { img, plot, mixC, type TexImage } from './tex';
import { MOB_TEXTURES, boxFaces, paintFace } from './mobs';

const HEAD = boxFaces(0, 0, 8, 8, 8);
const VISOR = boxFaces(4, 24, 10, 3, 4);
const ROD = boxFaces(0, 17, 2, 8, 2);

/** the head's lilac-blues, dark to light */
const LILAC = [0x5c5a9c, 0x7473b8, 0x8f90cf, 0xa9ade0, 0xc4c9ee, 0xdfe3f8];
const INDIGO = [0x1d1a45, 0x2b2863, 0x3a377e];

/** a gentle two-level mottle over a face (a value per pixel from `r`, rows toward the top lighter by `lift`) */
function mottled(t: TexImage, f: [number, number, number, number], r: Rand, base: number, lift: number): void {
  paintFace(t, f, (x, y, _c, w, h) => {
    const v = base + lift * (1 - y / Math.max(1, h - 1)) + (r.nextFloat() - 0.5) * 1.1 + (x === 0 || x === w - 1 ? -0.4 : 0);
    return LILAC[Math.max(0, Math.min(LILAC.length - 1, Math.round(v)))];
  });
}

function breeze(): TexImage {
  const t = img(32, 32);
  const r = new Rand(0xb5e2e);
  // the head: light on top, the sides shading down to its underside
  mottled(t, HEAD.top, r, 4.3, 0);
  mottled(t, HEAD.bottom, r, 1.2, 0);
  for (const s of ['right', 'left', 'back'] as const) mottled(t, HEAD[s], r, 2.2, 1.6);
  mottled(t, HEAD.front, r, 2.4, 1.4);
  // the brow over the visor, and the dark under it where the visor casts its shadow
  paintFace(t, HEAD.front, (x, y) => (y === 2 ? LILAC[4 + (x % 3 === 1 ? 1 : 0)] : y >= 3 && y <= 5 ? INDIGO[1] : undefined));
  // the visor: dark indigo, a lighter rim along its top edge, the eyes' sockets darkest
  for (const s of ['top', 'bottom', 'right', 'left', 'back', 'front'] as const)
    paintFace(t, VISOR[s], (x, y, _c, _w, h) => {
      // (the top face's last row is the edge along the front)
      if (s === 'top') return y === h - 1 ? LILAC[2] : INDIGO[2];
      if (y === 0 && s !== 'bottom') return INDIGO[2];
      return INDIGO[(x + y) % 5 === 0 ? 0 : 1];
    });
  paintFace(t, VISOR.front, (x, y) => ((x === 2 || x === 3 || x === 6 || x === 7) && y === 1 ? INDIGO[0] : undefined));
  // the rods: lilac, a bright stripe down the front edge, dark at the ends
  for (const s of ['right', 'front', 'left', 'back'] as const)
    paintFace(t, ROD[s], (x, y, _c, _w, h) => {
      if (y === 0 || y === h - 1) return LILAC[1];
      const edge = (s === 'front' && x === 0) || (s === 'right' && x === 1);
      return edge ? LILAC[5] : LILAC[s === 'back' ? 2 : 3 - (y % 3 === 0 ? 1 : 0)];
    });
  for (const s of ['top', 'bottom'] as const) paintFace(t, ROD[s], () => LILAC[1]);
  return t;
}

/** the eyes alone, lit (vanilla BreezeEyesLayer: an emissive pass over the head) */
function breezeEyes(): TexImage {
  const t = img(32, 32);
  const [fx, fy] = VISOR.front;
  for (const ex of [2, 6]) {
    plot(t, fx + ex, fy + 1, 0xe8ffff, 255);
    plot(t, fx + ex + 1, fy + 1, 0xb6f3ff, 255);
    // a soft glow round each eye
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 1], [2, 1], [0, 2], [1, 2]]) if (dy !== 1 || dx < 0 || dx > 1) plot(t, fx + ex + dx, fy + dy, 0x8fe6ff, 90);
  }
  return t;
}

/**
 * a band of gusts: for each row, bright streaks that tile along the width (sine waves whose periods divide it), with
 * their alpha from how bright they are
 */
function gusts(t: TexImage, y0: number, y1: number, r: Rand, dim: number, pal: readonly number[]): void {
  const w = t.w;
  for (let y = y0; y < y1; y++) {
    const waves: [number, number, number][] = [];
    for (let k = 0; k < 3; k++) waves.push([[1, 2, 3, 4][r.nextInt(4)] * (k + 1), r.nextFloat() * Math.PI * 2, 0.5 + r.nextFloat()]);
    const bias = r.nextFloat() * 0.6 - 0.35;
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (const [n, ph, a] of waves) v += a * Math.sin((x / w) * Math.PI * 2 * n + ph);
      v = v / 3 + bias;
      if (v <= 0.05) continue;
      const s = Math.min(1, v * 1.6);
      const c = pal[Math.min(pal.length - 1, Math.floor(s * pal.length))];
      plot(t, x, y, c, Math.round(Math.min(230, 60 + s * 170) * dim));
    }
  }
}

/** pale air: blue-white to white, a lilac tinge */
const AIR = [0x9fb4e8, 0xb9c8f1, 0xd3ddf8, 0xeaf0ff, 0xffffff];

/** the breeze's wind: every row a band of gusts (the three shells of its three stages sample it all round) */
function breezeWind(): TexImage {
  const t = img(128, 128);
  gusts(t, 0, 128, new Rand(0x3b2e7a), 0.75, AIR);
  return t;
}

/** a wind charge: a bright knot in the middle (the 4-pixel cube, rows 0-8), its swirl of rings round it */
function windCharge(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0x71dc4a);
  // the knot: bright all over, tiling along its rows
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 64; x++) {
      const v = 0.6 + 0.4 * Math.sin((x / 64) * Math.PI * 8 + y * 1.3);
      plot(t, x, y, mixC(0xc9d8ff, 0xffffff, v), Math.round(200 + 55 * v));
    }
  // the rings: streaks of air
  gusts(t, 9, 19, r, 0.85, AIR);
  gusts(t, 20, 30, r, 0.7, AIR);
  return t;
}

MOB_TEXTURES.breeze = breeze;
MOB_TEXTURES.breeze_eyes = breezeEyes;
MOB_TEXTURES.breeze_wind = breezeWind;
MOB_TEXTURES.wind_charge = windCharge;
