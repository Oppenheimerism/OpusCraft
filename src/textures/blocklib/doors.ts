// Doors (16x32 split into _top/_bottom halves) and trapdoors (16x16),
// for the 8 wood types plus iron. Window pixels are fully transparent
// (cutout); frames are shaded so the openings read as recessed.

import { TexImage, img, setPx } from '../tex';
import { N, rng, idx, fbm, quantize } from './core';
import { WOOD, WoodDef } from './wood';

// Tone indices into a 6-entry ramp: 0 gap/outline .. 5 highlight
const HOLE = -1;

/** 6-step iron ramp (dark -> light) for iron doors/trapdoors. */
export const IRON_RAMP = [0x5a5a5a, 0x8a8a8a, 0xa8a8a8, 0xbdbdbd, 0xd2d2d2, 0xe8e8e8];
const HANDLE = { dark: 0x2f2f33, mid: 0x5c5c62, light: 0x9a9aa2 };

type Rect = [number, number, number, number]; // x, y, w, h

export interface DoorSpec {
  /** vertical board separators (x positions) */
  boards?: number[];
  windows?: Rect[];
  /** extra transparent pixels drawn from a mask ('o' = hole) */
  mask?: string[];
  /** recessed panels (shadow top/left, lit bottom/right) */
  panels?: Rect[];
  /** raised panels (lit top/left, shadow bottom/right) */
  raised?: Rect[];
  /** horizontal rails: [y, x0, x1] drawn as a dark line with a lit row below */
  rails?: [number, number, number][];
  /** extra decorative pixels: [x, y, tone] */
  dots?: [number, number, number][];
  handle?: [number, number][]; // top-left of 2x3 handle(s)
  /** which outer edges get the frame outline */
  edgeTop?: boolean;
  edgeBottom?: boolean;
  metal?: boolean;
  /** rivets for metal: [x, y] */
  rivets?: [number, number][];
}

function baseTones(seed: string, spec: DoorSpec, vertical = true): Int32Array {
  const r = rng(seed);
  const oct: [number, number, number][] = vertical ? [[1, 8, 0.5], [2, 4, 0.3], [2, 16, 0.2]] : [[8, 1, 0.5], [4, 2, 0.3], [16, 2, 0.2]];
  const f = fbm(r, oct, spec.metal ? 0.15 : 0.3);
  const q = quantize(f, spec.metal ? [0, 0, 1, 6, 1.2, 0] : [0, 0.3, 1.6, 6, 1.6, 0.3]);
  const t = new Int32Array(N * N);
  for (let i = 0; i < t.length; i++) t[i] = q[i];
  for (const bx of spec.boards ?? []) {
    for (let y = 0; y < N; y++) {
      if (vertical) {
        t[idx(bx, y)] = r.chance(0.8) ? 1 : 2;
        if (t[idx(bx + 1, y)] < 4 && r.chance(0.4)) t[idx(bx + 1, y)] = 4;
      } else {
        t[idx(y, bx)] = r.chance(0.8) ? 1 : 2;
        if (t[idx(y, bx + 1)] < 4 && r.chance(0.4)) t[idx(y, bx + 1)] = 4;
      }
    }
  }
  return t;
}

function drawSpec(t: Int32Array, spec: DoorSpec): void {
  const set = (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < N && y < N && t[y * N + x] !== HOLE) t[y * N + x] = v;
  };
  for (const [x0, y0, w, h] of spec.panels ?? []) {
    // recessed: frame shadow on the top/left inner edge, lit bottom/right edge
    for (let x = x0; x < x0 + w; x++) {
      set(x, y0, 0);
      set(x, y0 + h - 1, 5);
    }
    for (let y = y0; y < y0 + h; y++) {
      set(x0, y, 0);
      set(x0 + w - 1, y, 5);
    }
    set(x0 + w - 1, y0, 2);
    set(x0, y0 + h - 1, 2);
    // panel field one step darker than the frame
    for (let y = y0 + 1; y < y0 + h - 1; y++) for (let x = x0 + 1; x < x0 + w - 1; x++) if (t[y * N + x] > 2) t[y * N + x]--;
  }
  for (const [x0, y0, w, h] of spec.raised ?? []) {
    for (let x = x0; x < x0 + w; x++) {
      set(x, y0, 5);
      set(x, y0 + h - 1, 0);
    }
    for (let y = y0; y < y0 + h; y++) {
      set(x0, y, 5);
      set(x0 + w - 1, y, 0);
    }
  }
  for (const [y, x0, x1] of spec.rails ?? []) {
    for (let x = x0; x <= x1; x++) {
      set(x, y, 0);
      set(x, y + 1, 4);
    }
  }
  for (const [x, y, v] of spec.dots ?? []) set(x, y, v);
  // windows / mask holes
  for (const [x0, y0, w, h] of spec.windows ?? []) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) t[y * N + x] = HOLE;
  spec.mask?.forEach((row, y) => [...row].forEach((ch, x) => ch === 'o' && (t[y * N + x] = HOLE)));
  // automatic edge shading around holes: frame edge above/left of a hole is in shadow
  const src = new Int32Array(t);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (src[y * N + x] === HOLE) continue;
      const hole = (dx: number, dy: number) => {
        const xx = x + dx, yy = y + dy;
        return xx >= 0 && yy >= 0 && xx < N && yy < N && src[yy * N + xx] === HOLE;
      };
      if (hole(1, 0) || hole(0, 1)) t[y * N + x] = 0;
      else if (hole(-1, 0) || hole(0, -1)) t[y * N + x] = Math.max(t[y * N + x], 4);
    }
}

function render(t: Int32Array, pal: number[], spec: DoorSpec): TexImage {
  const out = img();
  for (let i = 0; i < N * N; i++) {
    const v = t[i];
    if (v === HOLE) continue;
    setPx(out, i % N, (i / N) | 0, pal[Math.max(0, Math.min(5, v))]);
  }
  // outer frame edges
  for (let i = 0; i < N; i++) {
    const l = (i * N) * 4, rr = (i * N + 15) * 4;
    if (out.data[l + 3]) setPx(out, 0, i, pal[1]);
    if (out.data[rr + 3]) setPx(out, 15, i, pal[0]);
    if (spec.edgeTop) setPx(out, i, 0, pal[1]);
    if (spec.edgeBottom) setPx(out, i, 15, pal[0]);
  }
  for (const [hx, hy] of spec.handle ?? []) {
    setPx(out, hx, hy, HANDLE.light);
    setPx(out, hx + 1, hy, HANDLE.mid);
    setPx(out, hx, hy + 1, HANDLE.mid);
    setPx(out, hx + 1, hy + 1, HANDLE.dark);
    setPx(out, hx, hy + 2, HANDLE.dark);
    setPx(out, hx + 1, hy + 2, HANDLE.dark);
  }
  for (const [x, y] of spec.rivets ?? []) {
    setPx(out, x, y, pal[5]);
    setPx(out, x + 1, y + 1, pal[0]);
  }
  return out;
}

/** Holes allowed at the border? Doors keep the outer frame opaque. */
function build(seed: string, pal: number[], spec: DoorSpec, vertical = true): TexImage {
  const t = baseTones(seed, spec, vertical);
  drawSpec(t, spec);
  return render(t, pal, spec);
}

// ---------------------------------------------------------------------------
// Door designs (top = upper half, bottom = lower half). Handle: cols 12-13, rows 7-9 of the bottom.

const H: [number, number][] = [[12, 7]];

const CHERRY_FLOWER = [
  '................',
  '................',
  '......oooo......',
  '.....oooooo.....',
  '.....oooooo.....',
  '..oo..oooo..oo..',
  '.oooo..oo..oooo.',
  '.ooooo....ooooo.',
  '.ooooo....ooooo.',
  '.oooo..oo..oooo.',
  '..oo..oooo..oo..',
  '.....oooooo.....',
  '.....oooooo.....',
  '......oooo......',
  '................',
  '................',
];

const JUNGLE_WINDOW = [
  '................',
  '................',
  '......oooo......',
  '....oo.oo.oo....',
  '...ooo.oo.ooo...',
  '...ooo.oo.ooo...',
  '...oo......oo...',
  '...ooo.oo.ooo...',
  '...ooo.oo.ooo...',
  '...ooo.oo.ooo...',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

export const DOORS: Record<string, { top: DoorSpec; bottom: DoorSpec; trapdoor: DoorSpec; horizTrap?: boolean }> = {
  oak: {
    top: { boards: [5, 10], windows: [[3, 3, 4, 4], [9, 3, 4, 4], [3, 8, 4, 4], [9, 8, 4, 4]], rails: [[13, 1, 14]], edgeTop: true },
    bottom: { boards: [5, 10], panels: [[3, 1, 10, 5], [3, 8, 10, 6]], handle: H, edgeBottom: true },
    trapdoor: { boards: [4, 8, 12], windows: [[3, 3, 4, 4], [9, 3, 4, 4], [3, 9, 4, 4], [9, 9, 4, 4]], edgeTop: true, edgeBottom: true },
    horizTrap: false,
  },
  spruce: {
    top: { boards: [4, 8, 12], panels: [[3, 2, 4, 5], [9, 2, 4, 5], [3, 9, 4, 5], [9, 9, 4, 5]], edgeTop: true },
    bottom: { boards: [4, 8, 12], panels: [[3, 1, 4, 5], [9, 1, 4, 5], [3, 9, 4, 5], [9, 9, 4, 5]], handle: H, edgeBottom: true },
    trapdoor: { boards: [4, 8, 12], panels: [[2, 2, 12, 12]], rails: [[7, 3, 12]], edgeTop: true, edgeBottom: true },
  },
  birch: {
    top: {
      boards: [8],
      windows: [[3, 2, 2, 2], [7, 2, 2, 2], [11, 2, 2, 2], [3, 6, 2, 2], [7, 6, 2, 2], [11, 6, 2, 2], [3, 10, 2, 2], [7, 10, 2, 2], [11, 10, 2, 2]],
      rails: [[13, 1, 14]],
      edgeTop: true,
    },
    bottom: { boards: [8], panels: [[3, 1, 4, 12], [9, 1, 4, 12]], handle: H, edgeBottom: true },
    trapdoor: {
      boards: [8],
      windows: [[3, 3, 2, 2], [7, 3, 2, 2], [11, 3, 2, 2], [3, 7, 2, 2], [7, 7, 2, 2], [11, 7, 2, 2], [3, 11, 2, 2], [7, 11, 2, 2], [11, 11, 2, 2]],
      edgeTop: true,
      edgeBottom: true,
    },
  },
  jungle: {
    top: { boards: [5, 10], mask: JUNGLE_WINDOW, rails: [[12, 1, 14]], dots: [[4, 14, 5], [11, 14, 5], [7, 13, 1], [8, 13, 1]], edgeTop: true },
    bottom: {
      boards: [5, 10],
      raised: [[3, 2, 10, 4], [3, 8, 10, 6]],
      dots: [[7, 10, 1], [8, 10, 1], [6, 11, 1], [9, 11, 1], [7, 12, 1], [8, 12, 1], [7, 11, 5], [8, 11, 5]],
      handle: H,
      edgeBottom: true,
    },
    trapdoor: {
      boards: [5, 10],
      mask: [
        '................',
        '................',
        '..oo........oo..',
        '..oo...oo...oo..',
        '......oooo......',
        '.....oo..oo.....',
        '....oo....oo....',
        '...oo......oo...',
        '...oo......oo...',
        '....oo....oo....',
        '.....oo..oo.....',
        '......oooo......',
        '..oo...oo...oo..',
        '..oo........oo..',
        '................',
        '................',
      ],
      edgeTop: true,
      edgeBottom: true,
    },
  },
  acacia: {
    top: { boards: [4, 8, 12], windows: [[3, 2, 4, 3], [9, 2, 4, 3]], panels: [[3, 7, 10, 7]], edgeTop: true },
    bottom: { boards: [4, 8, 12], panels: [[3, 1, 10, 13]], rails: [[7, 3, 12]], handle: H, edgeBottom: true },
    trapdoor: {
      boards: [4, 8, 12],
      mask: [
        '................',
        '................',
        '...oooooooooo...',
        '....oooooooo....',
        '.....oooooo.....',
        '..o...oooo...o..',
        '..oo...oo...oo..',
        '..ooo......ooo..',
        '..ooo......ooo..',
        '..oo...oo...oo..',
        '..o...oooo...o..',
        '.....oooooo.....',
        '....oooooooo....',
        '...oooooooooo...',
        '................',
        '................',
      ],
      edgeTop: true,
      edgeBottom: true,
    },
  },
  dark_oak: {
    top: { boards: [5, 10], windows: [[5, 2, 6, 2]], panels: [[3, 6, 4, 8], [9, 6, 4, 8]], edgeTop: true },
    bottom: { boards: [5, 10], panels: [[3, 1, 4, 6], [9, 1, 4, 6], [3, 9, 4, 5], [9, 9, 4, 5]], handle: H, edgeBottom: true },
    trapdoor: { boards: [5, 10], panels: [[2, 2, 5, 5], [9, 2, 5, 5], [2, 9, 5, 5], [9, 9, 5, 5]], edgeTop: true, edgeBottom: true },
  },
  mangrove: {
    top: {
      boards: [5, 10],
      windows: [[3, 2, 3, 3], [7, 2, 2, 3], [10, 2, 3, 3], [3, 6, 3, 3], [7, 6, 2, 3], [10, 6, 3, 3]],
      rails: [[11, 1, 14]],
      edgeTop: true,
    },
    bottom: { boards: [5, 10], panels: [[3, 1, 10, 6], [3, 9, 10, 5]], handle: H, edgeBottom: true },
    trapdoor: {
      boards: [5, 10],
      windows: [[3, 3, 3, 3], [10, 3, 3, 3], [3, 10, 3, 3], [10, 10, 3, 3], [7, 7, 2, 2]],
      edgeTop: true,
      edgeBottom: true,
    },
  },
  cherry: {
    top: { boards: [8], mask: CHERRY_FLOWER, rails: [[14, 1, 14]], edgeTop: true },
    bottom: { boards: [8], panels: [[3, 1, 10, 6], [3, 9, 10, 5]], handle: H, edgeBottom: true },
    trapdoor: { boards: [8], mask: CHERRY_FLOWER, edgeTop: true, edgeBottom: true },
  },
  iron: {
    top: { metal: true, windows: [[4, 2, 3, 3], [9, 2, 3, 3]], rails: [[7, 1, 14]], rivets: [[2, 9], [12, 9], [2, 13], [12, 13]], edgeTop: true },
    bottom: { metal: true, rails: [[3, 1, 14], [11, 1, 14]], rivets: [[2, 1], [12, 1], [2, 13], [12, 13]], handle: H, edgeBottom: true },
    trapdoor: {
      metal: true,
      windows: [[3, 3, 3, 2], [10, 3, 3, 2], [3, 11, 3, 2], [10, 11, 3, 2]],
      rails: [[7, 1, 14]],
      rivets: [[1, 1], [13, 1], [1, 13], [13, 13]],
      edgeTop: true,
      edgeBottom: true,
    },
  },
};

function palFor(name: string): number[] {
  if (name === 'iron') return IRON_RAMP;
  const w: WoodDef = WOOD[name];
  return w.wood;
}

export function door(name: string, half: 'top' | 'bottom'): TexImage {
  const d = DOORS[name];
  return build(`${name}_door_${half}`, palFor(name), d[half]);
}

export function trapdoor(name: string): TexImage {
  const d = DOORS[name];
  return build(`${name}_trapdoor`, palFor(name), d.trapdoor, d.horizTrap ?? false);
}
