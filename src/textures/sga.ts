// The Standard Galactic Alphabet: vanilla's "alt" font (font/ascii_sga.png) used
// for the enchanting table's runes, and the 26 enchant particle sprites
// (particle/sga_a..sga_z) that drift from bookshelves into the table. Glyphs are
// in the same 8-row '#' format as font.ts (rows 0-6 ink, row 7 empty).

import type { FontData } from './font';
import { TexImage, img, plot } from './tex';

// prettier-ignore
const SRC: Record<string, string> = {
  a: '.#... .#... .#### ....# ....# .###. ..... .....',
  b: '.###. #...# ....# ..##. ..#.. ..#.. ..... .....',
  c: '##### #.... #.#.. #.... #.... ##### ..... .....',
  d: '####. ##... #.#.. #..#. ..... ##### ..... .....',
  e: '#...# #...# #.#.# #.#.# #...# ##### ..... .....',
  f: '..... ##### ..... ..... #.#.# ..... ..... .....',
  g: '....# ....# ##### ....# ....# ....# ..... .....',
  h: '##### ..... .#.#. .#.#. .#.#. .#.#. ..... .....',
  i: '# # . # # . # .',
  j: '# . . # . . # .',
  k: '..##. .#... ..#.. ...#. ..#.. .#... ..... .....',
  l: '.#... .#... .#... .#... .#### #.... ..... .....',
  m: '#...# #...# #...# ##### #.... #.... ..... .....',
  n: '#..# #..# #..# ...# ..#. .#.. .... ....',
  o: '##### ..#.. ..#.. ..#.. #.#.. .#... ..... .....',
  p: '# . # # . # . .',
  q: '####. ....# ..#.# ....# ####. ..... ..... .....',
  r: '#.# ... ... #.# ... ... ... ...',
  s: '..#.. .#.#. #...# ..#.. ..#.. ..#.. ..... .....',
  t: '####. ...#. ...#. ...#. ..... ..#.. ..... .....',
  u: '#.# #.# ... ### ... ... ... ...',
  v: '..#.. ..#.. ..#.. ##### ..... ##### ..... .....',
  w: '..#.. ..... ..... #...# ..... ..... ..... .....',
  x: '....# ...#. ..#.. .#... #.... ...#. ..... .....',
  y: '#.# #.# #.# #.# #.# #.# ... ...',
  z: '##### #...# #...# #...# #...# #...# ..... .....',
  ' ': '... ... ... ... ... ... ... ...',
};

function build(src: Record<string, string>): FontData {
  const glyphs: Record<string, string[]> = {};
  for (const [ch, def] of Object.entries(src)) {
    const rows = def.trim().split(/\s+/);
    if (rows.length !== 8 || rows.some((r) => r.length !== rows[0].length)) throw new Error(`sga: bad glyph '${ch}'`);
    glyphs[ch] = rows;
    // vanilla's alt font maps capitals to the same runes
    if (ch >= 'a' && ch <= 'z') glyphs[ch.toUpperCase()] = rows;
  }
  return { height: 8, ascent: 7, glyphs };
}

export const SGA_FONT: FontData = build(SRC);

/** particle/sga_a..sga_z: a white rune on an 8x8 sprite */
export function sgaParticleTextures(): Record<string, () => TexImage> {
  const out: Record<string, () => TexImage> = {};
  for (let i = 0; i < 26; i++) {
    const ch = String.fromCharCode(97 + i);
    out[`sga_${ch}`] = () => {
      const t = img(8, 8);
      const rows = SGA_FONT.glyphs[ch];
      const w = rows[0].length;
      const ox = Math.floor((8 - w) / 2);
      for (let y = 0; y < 7; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '#') plot(t, ox + x, y + 1, 0xffffff);
      return t;
    };
  }
  return out;
}

export const SGA_SPRITES = Array.from({ length: 26 }, (_, i) => `sga_${String.fromCharCode(97 + i)}`);
