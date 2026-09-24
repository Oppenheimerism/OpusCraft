// The paper a map is drawn on (vanilla textures/map/map_background.png, and map_background_checkerboard.png behind a
// map with data, whose blank parts show a faint check) and the markers drawn on maps (vanilla map/decorations/*).
// Original art: parchment with a darker, uneven rim; markers white with a dark edge.

import { TexImage, img, plot, rect, mixC } from './tex';
import { Rand } from '../core/rng';
import type { DecorationType } from '../game/mapData';

export const MAP_BACKGROUND_SIZE = 64;
const PAPER = 0xe6d8b4;
const PAPER_DARK = 0xd8c89e;
const RIM = 0xa98e5c;
const EDGE = 0x6e5732;

/** a sheet of parchment w×h: a dark edge, an uneven rim a few texels deep, and faintly fibrous paper (checked faintly) */
export function parchment(w: number, h: number, checker: boolean, seed = 4817): TexImage {
  const t = img(w, h);
  const r = new Rand(seed);
  // how far in the rim reaches along each edge (torn a little unevenly)
  const depth = (n: number): number[] => Array.from({ length: n }, () => 2 + (r.nextInt(5) === 0 ? 1 : 0));
  const top = depth(w), bottom = depth(w), left = depth(h), right = depth(h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.min(x, y, w - 1 - x, h - 1 - y);
      const rim = y < top[x] || h - 1 - y < bottom[x] || x < left[y] || w - 1 - x < right[y];
      let c: number;
      if (d === 0) c = EDGE;
      else if (rim) c = mixC(RIM, EDGE, r.nextInt(4) === 0 ? 0.25 : 0);
      else {
        c = checker && ((x + y) & 1) === 1 ? PAPER_DARK : PAPER;
        // (fibres in the paper)
        const k = r.nextInt(9);
        if (k === 0) c = mixC(c, RIM, 0.18);
        else if (k === 1) c = mixC(c, 0xfff6dc, 0.35);
      }
      plot(t, x, y, c);
    }
  return t;
}

/** the paper behind a map, 64×64 (vanilla draws it from -7 to 135 around the picture: a rim of about 3 texels) */
export function mapBackground(checker: boolean): TexImage {
  return parchment(MAP_BACKGROUND_SIZE, MAP_BACKGROUND_SIZE, checker);
}

// prettier-ignore
const ICONS: Record<DecorationType, string[]> = {
  // (drawn upside down on the map, as vanilla's quads are: this arrow points the way its holder faces)
  player: [
    '...##...',
    '..#WW#..',
    '..#WW#..',
    '.#WWWW#.',
    '.#WWWW#.',
    '#WWWWWW#',
    '#WW##WW#',
    '.##..##.',
  ],
  player_off_map: [
    '........',
    '..####..',
    '.#WWWW#.',
    '.#WWWW#.',
    '.#WWWW#.',
    '.#WWWW#.',
    '..####..',
    '........',
  ],
  player_off_limits: [
    '........',
    '........',
    '...##...',
    '..#WW#..',
    '..#WW#..',
    '...##...',
    '........',
    '........',
  ],
};

/** the markers, 8×8 each, in a row: the texture and where each one is (u0, v0, u1, v1) */
export function decorationAtlas(): { tex: TexImage; uv: Record<DecorationType, [number, number, number, number]> } {
  const types = Object.keys(ICONS) as DecorationType[];
  const w = 8 * types.length;
  const tex = img(w, 8);
  const uv = {} as Record<DecorationType, [number, number, number, number]>;
  types.forEach((type, i) => {
    const rows = ICONS[type];
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const ch = rows[y][x];
        if (ch === 'W') plot(tex, i * 8 + x, y, 0xffffff);
        else if (ch === '#') plot(tex, i * 8 + x, y, 0x2a2a2a);
      }
    uv[type] = [(i * 8) / w, 0, (i * 8 + 8) / w, 1];
  });
  return { tex, uv };
}

/** (for the contact sheet) */
export function decorationIcon(type: DecorationType): TexImage {
  const t = img(8, 8);
  rect(t, 0, 0, 8, 8, 0x7a6a4a);
  const rows = ICONS[type];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (rows[y][x] !== '.') plot(t, x, y, rows[y][x] === 'W' ? 0xffffff : 0x2a2a2a);
  return t;
}
