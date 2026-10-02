// The touch controls' sprites (src/game/touch.ts), drawn from code like every other: buttons in the manner of Bedrock
// Edition's touch buttons (Java Edition has none to follow) — a key cap, a square with its corners off, black-edged,
// grey-faced, a lighter panel set in it and a dark lip along the bottom, its picture in black; lit (pressed, or a sneak
// that is on), the cap is pale and its picture white. The stick is a pale plate with a cap of its own for the thumb.
// They are drawn small (a button is 22 pixels) and scaled up without smoothing, and part see-through.

import { TexImage, img, plot, rect } from './tex';

type Gen = () => TexImage;

interface CapStyle {
  outline: number;
  face: number;
  panel: number;
  lip: number;
  ink: number;
}
const CAP: CapStyle = { outline: 0x000000, face: 0x6f6f6f, panel: 0x7f7f7f, lip: 0x444444, ink: 0x000000 };
const LIT: CapStyle = { outline: 0x4a4a4a, face: 0x9a9a9a, panel: 0xb0b0b0, lip: 0x767676, ink: 0xffffff };

/** inside a square of side `n` with its corners off (`cut` pixels of each) */
const within = (n: number, cut: number, x: number, y: number) => {
  if (x < 0 || y < 0 || x >= n || y >= n) return false;
  const cx = Math.min(x, n - 1 - x), cy = Math.min(y, n - 1 - y);
  return cx + cy >= cut;
};

/** a key cap `n` pixels a side: the edge, the face with its panel, the lip (`lip` rows) along the bottom */
function cap(n: number, s: CapStyle, lip = 3, cut = 2): TexImage {
  const t = img(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!within(n, cut, x, y)) continue;
      const edge = !within(n, cut, x - 1, y) || !within(n, cut, x + 1, y) || !within(n, cut, x, y - 1) || !within(n, cut, x, y + 1);
      plot(t, x, y, edge ? s.outline : y >= n - 1 - lip ? s.lip : s.face);
    }
  // (the panel: set in from the edge, clear of the lip)
  const a = 3, b = n - 2 - lip - 1;
  for (let y = a; y < b; y++) for (let x = a; x < n - a; x++) if (!((x === a || x === n - a - 1) && (y === a || y === b - 1))) plot(t, x, y, s.panel);
  return t;
}

/** a picture (rows of #) in the middle of a cap's face */
function ink(t: TexImage, rows: string[], c: number, lip = 3): TexImage {
  const w = Math.max(...rows.map((r) => r.length));
  const x0 = Math.floor((t.w - w) / 2), y0 = Math.floor((t.h - lip - rows.length) / 2);
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) if (rows[y][x] === '#') plot(t, x0 + x, y0 + y, c);
  return t;
}

const PICTURES: Record<string, string[]> = {
  // an arrow off the ground
  jump: ['.....#.....', '....###....', '...#####...', '..#######..', '.#########.', '....###....', '....###....', '....###....', '...........', '.#########.'],
  // an arrow down to it
  sneak: ['....###....', '....###....', '....###....', '.#########.', '..#######..', '...#####...', '....###....', '.....#.....', '...........', '.#########.'],
  sprint: ['###...###...', '.###...###..', '..###...###.', '...###...###', '..###...###.', '.###...###..', '###...###...'],
  // a sword, point up and to the right
  attack: ['.........##', '........###', '.......###.', '......###..', '.#...###...', '.##.###....', '..####.....', '...###.....', '..##.##....', '.##...#....', '##.........'],
  // the four marks round what's aimed at
  interact: ['.....##.....', '.....##.....', '.....##.....', '............', '............', '###......###', '###......###', '............', '............', '.....##.....', '.....##.....', '.....##.....'],
  // flying: up, and down
  ascend: ['.....#.....', '....###....', '...#####...', '..#######..', '....###....', '....###....', '...........', '.#########.', '...........', '...#####...'],
  descend: ['...#####...', '...........', '.#########.', '...........', '....###....', '....###....', '..#######..', '...#####...', '....###....', '.....#.....'],
  pause: ['###..###', '###..###', '###..###', '###..###', '###..###', '###..###', '###..###', '###..###', '###..###'],
  close: ['##.....##', '###...###', '.###.###.', '..#####..', '...###...', '..#####..', '.###.###.', '###...###', '##.....##'],
};

export const TOUCH_TEXTURES: Record<string, Gen> = {};
for (const [name, rows] of Object.entries(PICTURES)) {
  TOUCH_TEXTURES[`touch_${name}`] = () => ink(cap(22, CAP), rows, CAP.ink);
  TOUCH_TEXTURES[`touch_${name}_lit`] = () => ink(cap(22, LIT), rows, LIT.ink);
}

/** the stick's plate: pale, ringed lighter toward the middle */
TOUCH_TEXTURES['touch_stick'] = () => {
  const n = 32, t = img(n, n);
  const rings = [0x1c1c1c, 0xc4c4c4, 0xc4c4c4, 0xd6d6d6, 0xd6d6d6, 0xe6e6e6];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!within(n, 2, x, y)) continue;
      let d = 0;
      while (d < rings.length - 1 && within(n - 2 * (d + 1), d === 0 ? 2 : 1, x - d - 1, y - d - 1)) d++;
      plot(t, x, y, rings[d]);
    }
  return t;
};
/** the stick's cap, under the thumb */
TOUCH_TEXTURES['touch_knob'] = () => cap(16, CAP, 2);
TOUCH_TEXTURES['touch_knob_lit'] = () => cap(16, LIT, 2);

/** the ring round a finger that is breaking a block: 24 marks, lit as the block gives way (`touch_ring_0` to `_24`) */
for (let lit = 0; lit <= 24; lit++)
  TOUCH_TEXTURES[`touch_ring_${lit}`] = () => {
    const n = 33, t = img(n, n), c = (n - 1) / 2;
    for (let i = 0; i < 24; i++) {
      // (from the top, clockwise)
      const a = (i / 24) * Math.PI * 2;
      const x = Math.round(c + Math.sin(a) * 14.5), y = Math.round(c - Math.cos(a) * 14.5);
      rect(t, x - 1, y - 1, 2, 2, i < lit ? 0xffffff : 0x202020, i < lit ? 255 : 150);
    }
    return t;
  };
