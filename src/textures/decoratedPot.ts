// The decorated pot (vanilla textures/entity/decorated_pot/*, laid out for DecoratedPotRenderer's boxes): the 32x32
// base with the neck, the lip and the top and bottom, and the 16x16 sides, plain (decorated_pot_side, a brick's
// side) or with a sherd's pattern (<name>_pottery_pattern). The patterns' motifs are shared with the sherds' item
// sprites (itemlib/archaeology.ts).

import { TexImage, img, plot, getPx, mixC, Rand } from './tex';
import { hashString } from '../core/rng';

/** fired clay, darkest to lightest */
export const POT_CLAY = [0x4e2616, 0x62301d, 0x783c25, 0x8c482d, 0x9c5535, 0xab623f, 0xba714b, 0xc9835c];
/** the patterns' ink: the dark line and the fills either side of the clay */
export const POT_INK = { D: 0x2f170d, d: 0x5a2c19, l: 0xd99d74 };

function R(name: string): Rand {
  return new Rand(hashString(name), 91);
}

const tone = (k: number) => POT_CLAY[Math.max(0, Math.min(POT_CLAY.length - 1, k))];

/**
 * the desert pyramid's four sherds' motifs (10x10, 'D' the line, 'd' a dark fill, 'l' a light one), each the pottery
 * pattern of the sherd of that name: a bow drawn on its arrow, a pickaxe, a cut gem, a skull
 */
export const MOTIFS: Record<string, string[]> = {
  archer: [
    '..D.......',
    '..DD......',
    '..D.D.....',
    'D.D..D..D.',
    'DDDDDDDDDD',
    'D.D..D..D.',
    '..D.D.....',
    '..DD......',
    '..D.......',
    '..........',
  ],
  miner: [
    '..DDDDDD..',
    '.DllllllD.',
    'DlDDDDDDlD',
    'D...Dd...D',
    '....Dd....',
    '....Dd....',
    '....Dd....',
    '....Dd....',
    '....DD....',
    '..........',
  ],
  prize: [
    '.......D..',
    '......DlD.',
    '..DDDDDD..',
    '.DlDllDlD.',
    'DDDDDDDDDD',
    '.DllDDllD.',
    '..DlDDlD..',
    '...DllD...',
    '....DD....',
    '..........',
  ],
  skull: [
    '..DDDDDD..',
    '.DllllllD.',
    'DllllllllD',
    'DlDDllDDlD',
    'DlDDllDDlD',
    'DlllDDlllD',
    '.DllllllD.',
    '..DlDDlD..',
    '...DDDD...',
    '..........',
  ],
};

/** a sherd's pattern, by its item (vanilla DecoratedPotPatterns.getPatternFromItem; a brick: none) */
export function patternOf(item: string): string | null {
  const m = /^(.+)_pottery_sherd$/.exec(item);
  return m && MOTIFS[m[1]] ? m[1] : null;
}

/** draws a motif with its top left at (ox, oy) */
export function drawMotif(t: TexImage, name: string, ox: number, oy: number): void {
  MOTIFS[name].forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = POT_INK[ch as keyof typeof POT_INK];
      if (c !== undefined) plot(t, ox + x, oy + y, c);
    }),
  );
}

/**
 * vanilla decorated_pot_side.png / <pattern>_pottery_pattern.png: one side of the body, 14 wide (u 1..15) and 16 tall,
 * lit toward its left third like the round of the pot, the shoulder along the top and the foot along the bottom
 */
export function decoratedPotSideTexture(pattern: string | null): TexImage {
  const t = img(16, 16);
  const r = R(`decorated_pot_side_${pattern ?? 'brick'}`);
  const FLANK = [2, 3, 4, 4, 5, 5, 5, 4, 4, 4, 3, 3, 2, 1];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 14; x++) {
      let k = FLANK[x];
      if (y === 0) k += 2;
      else if (y === 1) k += 1;
      else if (y === 15) k -= 2;
      else if (y === 14) k -= 1;
      if (r.chance(0.18)) k += r.chance(0.5) ? 1 : -1;
      plot(t, x + 1, y, tone(k));
    }
  // (the band round the shoulder, and the one above the foot)
  for (let x = 0; x < 14; x++) {
    plot(t, x + 1, 2, mixC(getPx(t, x + 1, 2), POT_CLAY[1], 0.55));
    plot(t, x + 1, 13, mixC(getPx(t, x + 1, 13), POT_CLAY[1], 0.45));
  }
  if (pattern) drawMotif(t, pattern, 3, 3);
  return t;
}

/**
 * vanilla decorated_pot_base.png (32x32): the lip's top with the mouth (8, 0) and its underside (16, 0), the lip's
 * sides along v 8..11 and the neck's along v 11..12, the body's bottom (0, 13) and its top round the neck (14, 13)
 */
export function decoratedPotBaseTexture(): TexImage {
  const t = img(32, 32);
  const r = R('decorated_pot_base');
  const speck = () => (r.chance(0.16) ? (r.chance(0.5) ? 1 : -1) : 0);
  const rect = (x0: number, y0: number, w: number, h: number, pick: (x: number, y: number) => number) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) plot(t, x0 + x, y0 + y, pick(x, y));
  };
  // the lip's top: a rim round the dark mouth
  rect(8, 0, 8, 8, (x, y) => {
    const d = Math.max(Math.abs(x - 3.5), Math.abs(y - 3.5));
    if (d < 1.5) return 0x1c0d07;
    if (d < 2.5) return x + y < 7 ? 0x2b150b : POT_CLAY[1];
    return tone(6 + (d > 3 && x + y < 5 ? 1 : 0) + speck());
  });
  // its underside, in the shade of the lip
  rect(16, 0, 8, 8, () => tone(2 + speck()));
  // the lip's sides: a lit top edge, darker toward the neck below
  const LIP = [6, 5, 4];
  rect(0, 8, 32, 3, (x, y) => tone(LIP[y] + ((x % 8) < 3 ? 1 : (x % 8) > 5 ? -1 : 0) + speck()));
  // the neck's, in the lip's shadow
  rect(0, 11, 24, 1, (x) => tone(2 + ((x % 6) < 2 ? 1 : 0)));
  // the bottom, unlit
  rect(0, 13, 14, 14, (x, y) => tone(2 + (x === 0 || y === 0 || x === 13 || y === 13 ? -1 : 0) + speck()));
  // the top: the shoulder rounding off at the edges and falling into the neck's shadow in the middle
  rect(14, 13, 14, 14, (x, y) => {
    const d = Math.max(Math.abs(x - 6.5), Math.abs(y - 6.5));
    let k = d > 6 ? 5 : d > 4 ? 6 : d > 3 ? 5 : 3;
    if (d > 6 && (x === 0 || y === 13)) k -= 1;
    return tone(k + speck());
  });
  return t;
}
