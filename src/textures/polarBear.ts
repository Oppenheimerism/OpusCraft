// The polar bear's skin (vanilla textures/entity/bear/polarbear.png, 128x64 on PolarBearModel's layout): thick
// cream-white fur, a touch greyer on its underside and inside the ears; small black eyes, a black nose on the end of
// its snout, grey soles and dark claws. Original pixel art.

import { img, plot } from './tex';
import { Rand } from '../core/rng';
import { MOB_TEXTURES, boxFaces, noiseBox, noiseFace } from './mobs';

const HEAD = boxFaces(0, 0, 7, 7, 7);
const MOUTH = boxFaces(0, 44, 5, 3, 3);
const EAR = boxFaces(26, 0, 2, 2, 1);
const BODY = boxFaces(0, 19, 14, 14, 11);
const SHOULDERS = boxFaces(39, 0, 12, 12, 10);
const HIND_LEG = boxFaces(50, 22, 4, 10, 8);
const FRONT_LEG = boxFaces(50, 40, 4, 10, 6);

const FUR = [0xd9d9ce, 0xe3e3d9, 0xebebe2, 0xf2f2eb, 0xf9f9f4];
const FUR_W = [1, 3, 5, 5, 2];
const UNDER = [0xcacabe, 0xd3d3c8, 0xdcdcd1];
const SOLE = [0x8e8e86, 0x9a9a91];
const DARK = 0x1c1c1c;

MOB_TEXTURES['polar_bear'] = () => {
  const t = img(128, 64);
  const r = new Rand(0x9b1a);
  noiseBox(t, HEAD, r, FUR, { w: FUR_W });
  noiseFace(t, HEAD.bottom, r, UNDER);
  // the eyes, a row above where the snout comes out of the face
  const [hx, hy] = HEAD.front;
  plot(t, hx + 1, hy + 3, DARK);
  plot(t, hx + 5, hy + 3, DARK);
  noiseBox(t, MOUTH, r, FUR, { w: FUR_W });
  // the nose, over the end of the snout
  const [mx, my] = MOUTH.front, [tx, ty, , th] = MOUTH.top;
  for (let i = 1; i <= 3; i++) {
    plot(t, mx + i, my, DARK);
    plot(t, tx + i, ty + th - 1, DARK);
  }
  plot(t, mx + 2, my + 1, 0x3a3a3a);
  noiseBox(t, EAR, r, FUR, { w: FUR_W });
  noiseFace(t, EAR.front, r, UNDER);
  // the body: its box turned on its side, so its front face is the belly
  noiseBox(t, BODY, r, FUR, { w: FUR_W });
  noiseFace(t, BODY.front, r, UNDER);
  noiseBox(t, SHOULDERS, r, FUR, { w: FUR_W });
  noiseFace(t, SHOULDERS.front, r, UNDER);
  // the legs: grey soles, and three dark claws at the front of each paw
  for (const leg of [HIND_LEG, FRONT_LEG]) {
    noiseBox(t, leg, r, FUR, { w: FUR_W });
    noiseFace(t, leg.bottom, r, SOLE);
    const [lx, ly, , lh] = leg.front;
    for (const i of [0, 1.5, 3]) plot(t, lx + Math.floor(i), ly + lh - 1, 0x4a4a46);
  }
  return t;
};
