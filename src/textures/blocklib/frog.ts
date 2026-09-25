// The frogs' blocks (M9): frogspawn (vanilla block/frogspawn), a clutch of dark eggs each in its ball of clear jelly,
// clumped together in a thin film, the water showing through; and the ochre and pearlescent froglights (vanilla
// block/ochre_froglight_*, pearlescent_froglight_*), drawn as the verdant one is (iconblocks.ts) in their own
// colours: a warm yellow glow veined with amber, and a pink-white one veined with mauve. Original pixel art.

import { TexImage, img, setPx } from '../tex';
import { N, rng } from './core';
import { froglightSide, froglightTop } from './iconblocks';

type Gen = () => TexImage;

/** the veins' darkest to the glow's lightest */
const OCHRE = [0xb3702d, 0xcb8c3a, 0xdca650, 0xe9c06c, 0xf3d78f, 0xf9e8b6, 0xfdf6de];
const PEARLESCENT = [0x94688f, 0xad80a6, 0xc59bbb, 0xd9b8cf, 0xe8d1de, 0xf3e6ec, 0xfcf6f6];

const EGG = 0x1d1a14;
const EGG_LIT = 0x3a352a;
const JELLY = 0xc9d3c2;
const FILM = 0xb5c2b0;

/** vanilla block/frogspawn: a dozen or so eggs, none too close, each with its jelly round it, and a film between them */
function frogspawn(): TexImage {
  const r = rng('frogspawn');
  const t = img(N, N);
  const eggs: [number, number][] = [];
  for (let tries = 0; tries < 400 && eggs.length < 14; tries++) {
    const x = 1 + r.nextInt(N - 2), y = 1 + r.nextInt(N - 2);
    if (eggs.every(([ex, ey]) => Math.abs(ex - x) + Math.abs(ey - y) >= 4)) eggs.push([x, y]);
  }
  const alpha = new Uint8Array(N * N);
  const col = new Int32Array(N * N);
  const put = (x: number, y: number, c: number, a: number) => {
    if (x < 0 || y < 0 || x >= N || y >= N || alpha[y * N + x] >= a) return;
    alpha[y * N + x] = a;
    col[y * N + x] = c;
  };
  // the film: faint, round each egg out to two pixels
  for (const [ex, ey] of eggs)
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3) put(ex + dx, ey + dy, FILM, 70);
  // the jelly, a ring round each egg, and the egg (a lighter pixel for its sheen on some)
  for (const [ex, ey] of eggs) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(ex + dx, ey + dy, JELLY, 150);
    put(ex, ey, EGG, 255);
    if (r.chance(0.5)) put(ex + (r.chance(0.5) ? 1 : 0), ey + (r.chance(0.5) ? 0 : 1), r.chance(0.5) ? EGG : EGG_LIT, 255);
  }
  for (let i = 0; i < N * N; i++) if (alpha[i]) setPx(t, i % N, Math.floor(i / N), col[i], alpha[i]);
  return t;
}

export function registerFrogTextures(T: Record<string, () => TexImage | { w: number; h: number; frames: Uint8ClampedArray[] }>): void {
  const G = T as Record<string, Gen>;
  G['frogspawn'] = frogspawn;
  G['ochre_froglight_side'] = () => froglightSide(OCHRE, 'ochre_froglight_side');
  G['ochre_froglight_top'] = () => froglightTop(OCHRE, 'ochre_froglight_top');
  G['pearlescent_froglight_side'] = () => froglightSide(PEARLESCENT, 'pearlescent_froglight_side');
  G['pearlescent_froglight_top'] = () => froglightTop(PEARLESCENT, 'pearlescent_froglight_top');
}
