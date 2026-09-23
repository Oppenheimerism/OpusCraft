// Beds, glass panes / stained glass, iron bars, lantern, chain, campfire.

import { TexImage, AnimTex, img, setPx, getPx, mixC, mulC, anim } from '../tex';
import { N, rng, fbm, quantize, sample, cluster } from './core';
import { woolBase, tintBase } from './building';
import { planks, WOOD } from './wood';

// ---------------------------------------------------------------------------
// Beds (static block model: mattress y=3..9, legs 3x3x3 at the corners)

/** Wool-shaded blanket in the given dye colour. */
function blanket(col: number): TexImage {
  return tintBase(woolBase, col, 222, 0.9);
}

const PILLOW = 0xf6f9f9, PILLOW_SHADE = 0xc9d1d3, PILLOW_EDGE = 0xdfe6e7;

export function bedTopHead(col: number): TexImage {
  const t = blanket(col);
  const p = tintBase(woolBase, PILLOW, 222, 0.6);
  // pillow along the head end (rows 0-3), outlined
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < N; x++) {
      let c = getPx(p, x, y);
      if (y === 3) c = PILLOW_SHADE;
      else if (x === 0 || x === 15) c = PILLOW_EDGE;
      else if (y === 0) c = mixC(c, 0xffffff, 0.4);
      setPx(t, x, y, c);
    }
  // blanket fold (turned-down edge) under the pillow
  for (let x = 0; x < N; x++) {
    setPx(t, x, 4, mixC(getPx(t, x, 4), 0xffffff, 0.18));
    setPx(t, x, 5, mixC(getPx(t, x, 5), 0x000000, 0.12));
  }
  return t;
}

export function bedTopFoot(col: number): TexImage {
  const t = blanket(col);
  for (let y = 0; y < N; y++) {
    setPx(t, 0, y, mulC(getPx(t, 0, y), 0.9));
    setPx(t, 15, y, mulC(getPx(t, 15, y), 0.9));
  }
  for (let x = 0; x < N; x++) setPx(t, x, 15, mulC(getPx(t, x, 15), 0.9));
  return t;
}

/** Mattress side / end band: rows 0-5 drawn, rest transparent. */
export function bedBand(col: number, kind: 'side_head' | 'side_foot' | 'end_head' | 'end_foot'): TexImage {
  const b = blanket(col);
  const t = img();
  const src = kind === 'side_foot' || kind === 'end_foot' ? 1 : 7; // different wool rows so the parts don't repeat
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < N; x++) {
      let c = getPx(b, x, y + src);
      if (kind === 'end_head' && y < 2) {
        // pillow edge on top
        c = y === 0 ? PILLOW : x === 0 || x === 15 ? PILLOW_SHADE : PILLOW_EDGE;
      } else if (y === 0) c = mixC(c, 0xffffff, 0.15); // top edge highlight
      else if (y === 3 || (kind === 'end_head' && y === 2)) c = mulC(c, 0.78); // subtle edge line
      else if (y > 3) c = mulC(c, 0.84); // darker lower part
      setPx(t, x, y, c);
    }
  return t;
}

export function bedBottom(): TexImage {
  const t = planks('bed_bottom', WOOD.oak);
  for (let i = 0; i < N * N; i++) setPx(t, i % N, (i / N) | 0, mulC(getPx(t, i % N, (i / N) | 0), 0.85));
  return t;
}

export function bedLeg(): TexImage {
  const t = img();
  const w = WOOD.oak.wood;
  const px: number[][] = [
    [w[5], w[4], w[3]],
    [w[4], w[3], w[2]],
    [w[3], w[2], w[0]],
  ];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) setPx(t, x, y, px[y][x]);
  return t;
}

// ---------------------------------------------------------------------------
// Glass panes & stained glass

/** Vanilla-like stained glass colours (dye map colours). */
export const STAINED: Record<string, number> = {
  white: 0xffffff, orange: 0xd87f33, magenta: 0xb24cd8, light_blue: 0x6699d8, yellow: 0xe5e533, lime: 0x7fcc19,
  pink: 0xf27fa5, gray: 0x4c4c4c, light_gray: 0x999999, cyan: 0x4c7f99, purple: 0x7f3fb2, blue: 0x334cb2,
  brown: 0x664c33, green: 0x667f33, red: 0x993333, black: 0x191919,
};

const GLASS_STREAKS: [number, number][] = [[2, 4], [3, 3], [4, 2], [2, 6], [3, 5], [4, 4], [5, 3], [6, 2], [11, 13], [12, 12], [13, 11]];

export function stainedGlass(name: string, col: number): TexImage {
  const r = rng('stained_' + name);
  const t = img();
  const light = mixC(col, 0xffffff, 0.4), lighter = mixC(col, 0xffffff, 0.6), edgeDark = mixC(col, 0xffffff, 0.15);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const e = x === 0 || y === 0 || x === 15 || y === 15;
      if (e) {
        const lit = x === 0 || y === 0;
        setPx(t, x, y, lit ? light : edgeDark, 180);
      } else setPx(t, x, y, mulC(col, 0.98 + r.next() * 0.04), 150);
    }
  for (const [x, y] of GLASS_STREAKS) setPx(t, x, y, lighter, 176);
  return t;
}

/** Pane top strip: only the centre 2 columns (7-8) are filled. */
export function paneTop(c1: number, c2: number, alpha = 255): TexImage {
  const t = img();
  for (let y = 0; y < N; y++) {
    setPx(t, 7, y, c1, alpha);
    setPx(t, 8, y, c2, alpha);
  }
  return t;
}

// ---------------------------------------------------------------------------
// Iron bars

const BAR = [0x363636, 0x585858, 0x767676, 0x949494, 0xb3b3b3];

export function ironBars(): TexImage {
  const t = img();
  // vertical bars 2px wide centred on 7-8 and every 4px (edge bar split across tiles)
  const barL = [3, 7, 11, 15];
  for (const bx of barL)
    for (let y = 0; y < N; y++) {
      const shade = y % 4 === 0 ? 1 : 0;
      setPx(t, bx, y, BAR[3 - shade]);
      setPx(t, (bx + 1) % N, y, BAR[1 + (y % 5 === 2 ? -1 : 0)]);
    }
  // top and bottom bands
  for (const [y0, lit] of [[1, true], [13, false]] as [number, boolean][]) {
    for (let x = 0; x < N; x++) {
      setPx(t, x, y0, lit ? BAR[4] : BAR[3]);
      setPx(t, x, y0 + 1, lit ? BAR[2] : BAR[1]);
    }
  }
  return t;
}

// ---------------------------------------------------------------------------
// Lantern (vanilla template_lantern UV layout):
//   cap sides   uv [1,0,5,2]   body sides uv [0,2,6,9]
//   top/bottom  uv [0,9,6,15]  cap top    uv [1,10,5,14]
//   handle      uv [11,1,14,3] and [11,10,14,12]

export function lantern(soul = false): TexImage {
  const t = img();
  const iron = [0x1f1f26, 0x2f2f38, 0x44444f, 0x5c5c69, 0x777786];
  const glow = soul ? [0x1c7c86, 0x3fb6c2, 0x8ae8ee, 0xd8ffff] : [0xb2530f, 0xe8871e, 0xffc34a, 0xfff2a8];
  // cap sides (x1..4, y0..1)
  for (let x = 1; x <= 4; x++) {
    setPx(t, x, 0, iron[3]);
    setPx(t, x, 1, iron[1]);
  }
  // body sides (x0..5, y2..8): iron rims top/bottom, dark posts, glowing glass
  for (let y = 2; y <= 8; y++)
    for (let x = 0; x <= 5; x++) {
      let c: number;
      if (y === 2) c = x === 0 || x === 5 ? iron[2] : iron[3];
      else if (y === 8) c = iron[1];
      else if (x === 0) c = iron[2];
      else if (x === 5) c = iron[0];
      else {
        const cy = Math.abs(y - 5), cx = Math.abs(x - 2.5);
        const k = cy + cx < 1.2 ? 3 : cy + cx < 2.2 ? 2 : cy + cx < 3 ? 1 : 0;
        c = glow[k];
      }
      setPx(t, x, y, c);
    }
  // top/bottom (x0..5, y9..14): iron plate with lighter cap square in the middle
  for (let y = 9; y <= 14; y++)
    for (let x = 0; x <= 5; x++) {
      const e = x === 0 || y === 9 || x === 5 || y === 14;
      const inner = x >= 1 && x <= 4 && y >= 10 && y <= 13;
      let c = e ? iron[1] : iron[2];
      if (inner) c = x === 1 || y === 10 ? iron[4] : x === 4 || y === 13 ? iron[2] : iron[3];
      setPx(t, x, y, c);
    }
  // handle strips
  for (const y0 of [1, 10]) {
    setPx(t, 11, y0, iron[3]);
    setPx(t, 12, y0, iron[4]);
    setPx(t, 13, y0, iron[3]);
    setPx(t, 11, y0 + 1, iron[1]);
    setPx(t, 13, y0 + 1, iron[1]);
  }
  return t;
}

// ---------------------------------------------------------------------------
// Chain (vanilla layout: two 3px strips, x 0-2 face-on links, x 3-5 edge-on)

export function chain(): TexImage {
  const t = img();
  const c = [0x262a33, 0x3b414e, 0x535b6b, 0x707a8c];
  const face = ['.X.', 'X.X', 'X.X', 'X.X', '.X.', '.X.', '.X.', '.X.'];
  for (let y = 0; y < N; y++)
    for (const [ox, phase] of [[0, 0], [3, 4]] as [number, number][]) {
      const row = face[(y + phase) % 8];
      for (let x = 0; x < 3; x++) {
        if (row[x] !== 'X') continue;
        const edgeOn = (y + phase) % 8 >= 5;
        const k = edgeOn ? (y % 2 ? 2 : 3) : x === 0 ? 3 : x === 2 ? 1 : 2;
        setPx(t, ox + x, y, c[k]);
      }
    }
  return t;
}

// ---------------------------------------------------------------------------
// Campfire (vanilla campfire_log layout: rows 0-4 bark along the log, 4x4 end
// grain at x0-3/y4-7, rows 8-13 ash bed under the fire)

export function campfireLog(lit: boolean): TexImage {
  const r = rng(lit ? 'campfire_log_lit' : 'campfire_log');
  const bark = [0x1c140c, 0x2a1d11, 0x3a2917, 0x4a351e, 0x5a4226];
  const t = img();
  const f = fbm(r, [[8, 1, 0.5], [4, 1, 0.3], [16, 2, 0.2]], 0.35);
  const tones = quantize(f, [1, 2.2, 3, 2, 0.8]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) setPx(t, x, y, bark[tones[y * N + x]]);
  // charring: blackened patches on the bark
  for (let k = 0; k < 10; k++) {
    const pts = cluster(r, r.nextInt(N), r.nextInt(8), 2 + r.nextInt(4), [1.5, 0]);
    for (const [x, y] of pts) setPx(t, x, y, r.chance(0.5) ? 0x120d09 : 0x19120c);
  }
  // end grain (x0..3, y4..7)
  const ring = [0x6e5433, 0x8a6b42, 0xa3834f];
  for (let y = 4; y < 8; y++)
    for (let x = 0; x < 4; x++) {
      const e = x === 0 || y === 4 || x === 3 || y === 7;
      setPx(t, x, y, e ? bark[1] : (x + y) % 2 ? ring[1] : ring[2]);
    }
  // ash / charcoal bed (rows 8-13)
  const ash = [0x1a1818, 0x2a2727, 0x3d3938, 0x57514e, 0x77706b];
  const af = fbm(r, [[4, 4, 0.5], [2, 2, 0.5]], 0.6);
  const at = quantize(af, [1.2, 2, 2.5, 1.8, 0.6]);
  for (let y = 8; y < 14; y++) for (let x = 0; x < N; x++) setPx(t, x, y, ash[at[y * N + x]]);
  if (lit) {
    const ember = [0xa3290c, 0xe0561a, 0xff9a2e, 0xffd463];
    // glowing cracks along the bark
    for (let k = 0; k < 7; k++) {
      let x = r.nextInt(N), y = r.nextInt(5);
      const len = 2 + r.nextInt(4);
      for (let i = 0; i < len; i++) {
        setPx(t, x, y, ember[i === 0 || i === len - 1 ? 1 : 2]);
        x++;
        if (r.chance(0.3)) y = Math.max(0, Math.min(4, y + (r.nextBool() ? 1 : -1)));
      }
    }
    // hot embers in the ash bed
    for (let k = 0; k < 16; k++) {
      const x = r.nextInt(N), y = 8 + r.nextInt(6);
      setPx(t, x, y, ember[r.nextInt(4)]);
    }
    for (let y = 5; y < 7; y++) for (let x = 1; x < 3; x++) setPx(t, x, y, ember[2]);
  }
  return t;
}

/** Animated campfire flames on a transparent background (8 frames). */
export function campfireFire(): AnimTex {
  const r = rng('campfire_fire');
  const nz = fbm(r, [[4, 4, 0.5], [2, 4, 0.5]], 0.25);
  const pal = [0x9e2e0a, 0xd24f16, 0xf08422, 0xffb83f, 0xffe27a, 0xfff8d6];
  const frames = 8;
  return anim(N, N, frames, 3, (f) => {
    const t = img();
    const ph = f / frames;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const hgt = (15 - y) / 15; // 0 bottom .. 1 top
        // several flame tongues across the width, swaying over time
        const tongue = 0.5 + 0.5 * Math.cos((x - 7.5) * 1.25 + Math.sin(ph * Math.PI * 2) * 0.9);
        const reach = 0.28 + 0.62 * tongue * (1 - Math.abs(x - 7.5) / 11);
        const n = sample(nz, x, y + ph * 16);
        const body = reach - hgt + (n - 0.5) * 0.45;
        if (body < 0.02) continue;
        const k = Math.min(pal.length - 1, Math.floor(body * 4.2 + (1 - hgt) * 1.6));
        setPx(t, x, y, pal[k]);
      }
    return t;
  });
}

