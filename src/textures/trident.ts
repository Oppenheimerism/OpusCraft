// The trident (vanilla textures/entity/trident.png, TridentModel's 32x32 layout): a dark teal shaft with a
// prismarine collar, band and butt, under a three-pronged head of pale sea-green metal that brightens to the tips.
// And riptide's swirl (textures/entity/trident_riptide.png, 64x64): pale, broken streaks of spray on the sides of the
// box that spins round a player, drawn cut out. Original pixel art in the style of vanilla 1.21.

import { TexImage, img, plot, mixC, Rand } from './tex';
import { MOB_TEXTURES, boxFaces, noiseFace, paintFace, pick, SIDES, type Pal } from './mobs';

function trident(): TexImage {
  const t = img(32, 32);
  const r = new Rand(0x7d1e);
  const SHAFT: Pal = [0x284c49, 0x2f5754, 0x36625e, 0x3e6d69, 0x467874];
  const SHAFT_W: Pal = [1, 3, 5, 3, 1];
  const METAL: Pal = [0x5c9e93, 0x6aaea2, 0x79bdb0, 0x88cabd, 0x98d6c9];
  const METAL_W: Pal = [1, 3, 5, 3, 1];
  const TIP = [0xa9e2d6, 0xbdeee3, 0xd2f7ee];

  // the pole (1x25x1 at 0,6): its top rows sit in the head's collar
  const pole = boxFaces(0, 6, 1, 25, 1);
  for (const k of SIDES) {
    const lit = k === 'front' || k === 'back' ? 1.06 : 0.94;
    paintFace(t, pole[k], (_x, y) => {
      if (y < 2) return pick(r, METAL, METAL_W);
      // (a band of the head's metal a third of the way down, and a capped butt)
      if (y === 9 || y === 10) return mixC(pick(r, METAL, METAL_W), 0x2f5754, 0.25);
      if (y >= 22) return mixC(pick(r, METAL, METAL_W), 0x1e3a38, (y - 21) * 0.18);
      const c = pick(r, SHAFT, SHAFT_W);
      return mixC(c, lit > 1 ? 0xffffff : 0x000000, Math.abs(lit - 1) * 0.8);
    });
  }
  noiseFace(t, pole.top, r, METAL, { w: METAL_W });
  noiseFace(t, pole.bottom, r, [0x1e3a38, 0x264744]);

  // the crossbar the prongs grow from (3x2x1 at 4,0)
  const base = boxFaces(4, 0, 3, 2, 1);
  for (const f of [base.top, base.bottom, base.right, base.front, base.left, base.back]) noiseFace(t, f, r, METAL, { w: METAL_W, cell: 1 });
  paintFace(t, base.front, (x, y) => (y === 1 && x === 1 ? 0x5c9e93 : undefined));
  paintFace(t, base.back, (x, y) => (y === 1 && x === 1 ? 0x5c9e93 : undefined));

  // the prongs: the middle one (1x4x1 at 0,0) and the two at the sides (1x4x1 at 4,3, the right one mirrored)
  const prong = (u: number, v: number) => {
    const b = boxFaces(u, v, 1, 4, 1);
    for (const k of SIDES) paintFace(t, b[k], (_x, y) => (y === 0 ? TIP[2] : y === 1 ? pick(r, TIP) : pick(r, METAL.slice(1), METAL_W.slice(1))));
    plot(t, b.top[0], b.top[1], TIP[2]);
    plot(t, b.bottom[0], b.bottom[1], METAL[1]);
  };
  prong(0, 0);
  prong(4, 3);
  return t;
}

function riptide(): TexImage {
  const t = img(64, 64);
  const r = new Rand(0x2197);
  const SPRAY = [0xffffff, 0xf1fbff, 0xdff3fb, 0xc8e8f5, 0xaedbee, 0x92cbe4];
  // the four sides run round the box as one 64x32 strip (rows 16..47), so the streaks wrap across its ends
  for (let k = 0; k < 30; k++) {
    let x = r.nextInt(64), y = 18 + r.nextInt(28);
    const len = 7 + r.nextInt(16);
    for (let s = 0; s < len && y >= 16 && y < 48; s++) {
      // (blue where it starts, whitening as it climbs; broken here and there)
      const f = s / len;
      if (!(f > 0.4 && r.chance(0.18))) plot(t, x & 63, y, SPRAY[Math.min(SPRAY.length - 1, Math.floor((1 - f) * SPRAY.length * 0.999 + r.next() * 0.8))]);
      x++;
      if (r.chance(0.55)) y--;
    }
  }
  return t;
}

MOB_TEXTURES.trident = trident;
MOB_TEXTURES.trident_riptide = riptide;
