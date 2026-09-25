// The knot a lead makes round a fence post (vanilla textures/entity/lead_knot.png, 32x32, for LeashKnotModel's
// 6x8x6 box at 0, 0): the lead's rope wound twice round the post, its twisted strands slanting across each
// turn, a dark line where one turn presses on the next; the top and bottom show the coil round the post.

import { img, setPx, mulC } from './tex';
import { Rand } from '../core/rng';
import { MOB_TEXTURES } from './mobs';

/** the lead's rope (the item's colours), dark to light */
const ROPE = [0x5e4426, 0x8a6a3e, 0x9a7848, 0xb89664, 0xc8a472];

MOB_TEXTURES['lead_knot'] = () => {
  const t = img(32, 32);
  const r = new Rand(0x1ead);
  const shade = (i: number, x: number, y: number) => setPx(t, x, y, mulC(ROPE[Math.max(0, Math.min(ROPE.length - 1, i))], 0.94 + r.nextFloat() * 0.1));
  // the sides, unwrapped (right, front, left, back: 24 across, from 6 down, 8 high): two turns of rope, each three
  // pixels thick with its strands slanting across it, a dark line under each where it presses on the next
  for (let x = 0; x < 24; x++)
    for (let y = 0; y < 8; y++) {
      const strand = (x + y) % 3;
      const i = y % 4 === 3 ? 1 : strand === 0 ? 4 : strand === 1 ? 3 : 2;
      shade(i, x, 6 + y);
    }
  // the top (6, 0) and the bottom (12, 0): the coil round the post, the post's hole dark in the middle
  for (const [ox, lit] of [[6, 1], [12, -1]] as const)
    for (let x = 0; x < 6; x++)
      for (let y = 0; y < 6; y++) {
        const ring = Math.max(Math.abs(x - 2.5), Math.abs(y - 2.5));
        const i = ring < 1 ? 0 : ring < 2 ? 2 + (lit > 0 ? 0 : -1) : 3 + (lit > 0 ? 1 : -1);
        shade(i, ox + x, y);
      }
  return t;
};
