// Enchanting table, anvils and grindstone (vanilla block/enchanting_table_*,
// anvil / *_anvil_top and grindstone_* textures): red cloth and diamond
// corners over obsidian, forged dark iron with a polished working face that
// cracks as the anvil wears, and a stone wheel on dark wooden pivots.

import { TexImage, TexDef, img, setPx, getPx, mixC, mulC, Rand } from '../tex';
import { N, rng, fbm, quantize, paint, noise, white, mix, normalize } from './core';
import { obsidian } from './terrain';

type Reg = Record<string, () => TexDef>;

// ---------------------------------------------------------------------------
// Enchanting table

const CLOTH = [0x4f0808, 0x670d0d, 0x7e1414, 0x951c1c, 0xad2828, 0xc43b3b];
const GEM = { dark: 0x1a6f74, mid: 0x2cb0b8, light: 0x5decf5, hi: 0xc6fdff };

/** red cloth: soft folds, darker weave speckles */
function cloth(r: Rand, w = N, h = N): Int32Array {
  const f = fbm(r, [[8, 8, 0.45], [4, 4, 0.35], [2, 2, 0.2]], 0.3, w, h);
  return quantize(f, [0.4, 1.4, 3, 3, 1.3, 0.35]);
}

/** a diamond set in the table's corner: 2x2 gem with a highlight, ringed by darker facets */
function gem(t: TexImage, x: number, y: number, hiX: number, hiY: number): void {
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) setPx(t, x + dx, y + dy, GEM.light);
  setPx(t, x + hiX, y + hiY, GEM.hi);
  setPx(t, x + (1 - hiX), y + (1 - hiY), GEM.mid);
}

export function enchantingTableTop(): TexImage {
  const r = rng('enchanting_table_top');
  const tones = cloth(r);
  const t = paint(tones, CLOTH);
  const obs = obsidian('enchanting_table_rim');
  // obsidian rim
  for (let i = 0; i < N; i++)
    for (const [x, y] of [[i, 0], [i, 15], [0, i], [15, i]]) setPx(t, x, y, getPx(obs, x, y));
  // hemmed edge of the cloth and a lighter embroidered ring
  for (let i = 1; i < 15; i++)
    for (const [x, y] of [[i, 1], [i, 14], [1, i], [14, i]]) setPx(t, x, y, mulC(getPx(t, x, y), 0.62));
  for (let i = 3; i <= 12; i++)
    for (const [x, y] of [[i, 3], [i, 12], [3, i], [12, i]]) if ((i + (x === 3 || x === 12 ? 1 : 0)) % 2 === 0) setPx(t, x, y, CLOTH[5]);
  // centre rhombus
  for (let k = 0; k < 4; k++) {
    for (const [x, y] of [[7 - k, 4 + k], [8 + k, 4 + k], [7 - k, 11 - k], [8 + k, 11 - k]]) setPx(t, x, y, k % 2 ? CLOTH[4] : CLOTH[5]);
  }
  for (const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) setPx(t, x, y, CLOTH[1]);
  // diamond corners
  gem(t, 1, 1, 0, 0);
  gem(t, 13, 1, 1, 0);
  gem(t, 1, 13, 0, 1);
  gem(t, 13, 13, 1, 1);
  for (const [x, y] of [[0, 1], [1, 0], [15, 1], [14, 0], [0, 14], [1, 15], [15, 14], [14, 15]]) setPx(t, x, y, GEM.dark);
  return t;
}

export function enchantingTableSide(): TexImage {
  const t = obsidian('enchanting_table_side');
  const r = rng('enchanting_table_side_cloth');
  const tones = cloth(r);
  // cloth draped over the edge: rows 4..6 solid, row 7 tasselled
  for (let y = 4; y <= 7; y++)
    for (let x = 0; x < N; x++) {
      if (y === 7 && x % 3 === 1) continue;
      let c = CLOTH[Math.min(5, tones[y * N + x] + (y === 4 ? 2 : 0))];
      if (y === 7) c = mulC(CLOTH[1], 1);
      if (y === 6 && x % 3 === 1) c = CLOTH[1];
      setPx(t, x, y, c);
    }
  // embroidered stitches along the drape
  for (let x = 1; x < N; x += 3) setPx(t, x, 5, CLOTH[5]);
  // the corner diamonds show on the edge
  for (const x0 of [0, 14]) {
    setPx(t, x0, 4, GEM.light);
    setPx(t, x0 + 1, 4, GEM.light);
    setPx(t, x0 + (x0 ? 1 : 0), 5, GEM.mid);
    setPx(t, x0 + (x0 ? 0 : 1), 5, GEM.dark);
    setPx(t, x0 === 0 ? 0 : 15, 4, GEM.hi);
  }
  // rows 0..3 are never shown (the model uses v 4..16)
  return t;
}

export function enchantingTableBottom(): TexImage {
  return obsidian('enchanting_table_bottom');
}

// ---------------------------------------------------------------------------
// Anvil

const IRON = [0x262626, 0x2e2e2e, 0x363636, 0x3e3e3e, 0x474747, 0x515151, 0x5d5d5d];

/** forged dark iron: horizontal hammer streaks and a few bright pits */
export function anvilBody(): TexImage {
  const r = rng('anvil');
  const f = normalize(mix([[noise(r, 16, 2), 0.45], [noise(r, 8, 1), 0.3], [noise(r, 4, 4), 0.15], [white(r), 0.25]]));
  const t = paint(quantize(f, [0.3, 1.2, 2.6, 3.2, 2.4, 1, 0.3]), IRON);
  for (let k = 0; k < 6; k++) {
    const x = r.nextInt(N), y = r.nextInt(N);
    setPx(t, x, y, IRON[6]);
    setPx(t, x + 1, y, IRON[1]);
  }
  return t;
}

const FACE = [0x4d4d4d, 0x585858, 0x636363, 0x6e6e6e, 0x797979, 0x858585];

/** polished working face (columns 3..12 are used), with cracks for `wear` 1 (chipped) and 2 (damaged) */
export function anvilTop(wear: 0 | 1 | 2): TexImage {
  const t = anvilBody();
  const r = rng('anvil_top');
  const f = normalize(mix([[noise(r, 2, 8), 0.5], [noise(r, 4, 16), 0.3], [white(r), 0.3]]));
  const tones = quantize(f, [0.5, 1.5, 3, 3, 1.5, 0.5]);
  for (let y = 0; y < N; y++)
    for (let x = 3; x <= 12; x++) {
      const edge = x === 3 || x === 12 || y === 0 || y === 15;
      const bevel = x === 4 || x === 11 || y === 1 || y === 14;
      let c = FACE[tones[y * N + x]];
      if (bevel) c = mixC(c, FACE[5], 0.35);
      if (edge) c = IRON[2];
      setPx(t, x, y, c);
    }
  if (wear) {
    const cr = new Rand(wear === 1 ? 0x5eed1 : 0x5eed2, 99);
    const cracks: [number, number, number, number][] =
      wear === 1
        ? [[5, 3, 1, 5], [9, 10, -1, 4]]
        : [[4, 2, 1, 7], [10, 6, -1, 6], [6, 11, 1, 4], [8, 1, 0, 3]];
    for (const [x0, y0, dx, len] of cracks) {
      let x = x0;
      for (let i = 0; i < len; i++) {
        const y = y0 + i;
        if (y < 1 || y > 14 || x < 4 || x > 11) break;
        setPx(t, x, y, IRON[0]);
        if (cr.chance(0.4)) setPx(t, x + (dx || 1), y, IRON[2]);
        if (cr.chance(0.5)) x += dx;
      }
    }
    if (wear === 2) {
      // chipped-away corners of the face
      for (const [x, y] of [[3, 0], [4, 0], [3, 1], [12, 15], [11, 15], [12, 14], [12, 0], [3, 15]]) setPx(t, x, y, IRON[1]);
    }
  }
  return t;
}

// ---------------------------------------------------------------------------
// Grindstone

const STONE = [0x5e5e5e, 0x6c6c6c, 0x7b7b7b, 0x898989, 0x979797, 0xa6a6a6];

/** the wheel's flat side (12x12 used): grinding rings around the axle */
export function grindstoneSide(): TexImage {
  const r = rng('grindstone_side');
  const f = fbm(r, [[4, 4, 0.5], [2, 2, 0.3]], 0.35);
  const tones = quantize(f, [0.4, 1.4, 3, 3, 1.4, 0.4]);
  const t = img();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = x - 5.5, dy = y - 5.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      let tone = tones[y * N + x];
      if (Math.abs(d - 4.2) < 0.45) tone = Math.max(0, tone - 2);
      if (Math.abs(d - 2.6) < 0.4) tone = Math.min(5, tone + 1);
      let c = STONE[tone];
      if (x === 0 || y === 0) c = mixC(c, STONE[5], 0.4);
      if (x === 11 || y === 11) c = mixC(c, STONE[0], 0.5);
      if (Math.abs(dx) <= 1.5 && Math.abs(dy) <= 1.5) c = Math.abs(dx) < 1 && Math.abs(dy) < 1 ? 0x2c2c2c : 0x4a4a4a;
      setPx(t, x, y, c);
    }
  return t;
}

/** the wheel's rim (8x12 used): the grinding face, scored across */
export function grindstoneRound(): TexImage {
  const r = rng('grindstone_round');
  const f = normalize(mix([[noise(r, 8, 2), 0.4], [noise(r, 2, 1), 0.3], [white(r), 0.3]]));
  const tones = quantize(f, [0.5, 1.5, 3, 3, 1.5, 0.5]);
  const t = img();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let tone = tones[y * N + x];
      if (y % 3 === 2) tone = Math.max(0, tone - 2);
      else if (y % 3 === 0) tone = Math.min(5, tone + 1);
      setPx(t, x, y, STONE[tone]);
    }
  return t;
}

const DARK_WOOD = [0x21160b, 0x2c1e10, 0x382715, 0x45311b, 0x523b22, 0x60462a];

/** the axle holders (6x6 outer face at 0..6, 2x6 edges at 6..8), dark oak */
export function grindstonePivot(): TexImage {
  const r = rng('grindstone_pivot');
  const f = normalize(mix([[noise(r, 16, 2), 0.5], [noise(r, 4, 1), 0.3], [white(r), 0.25]]));
  const t = paint(quantize(f, [0.4, 1.5, 3, 3, 1.5, 0.4]), DARK_WOOD);
  for (let i = 0; i < 6; i++) {
    setPx(t, i, 0, DARK_WOOD[5]);
    setPx(t, 0, i, DARK_WOOD[4]);
    setPx(t, i, 5, DARK_WOOD[0]);
    setPx(t, 5, i, DARK_WOOD[1]);
  }
  // iron axle cap in the middle of the outer face
  setPx(t, 2, 2, 0x8a8a8a);
  setPx(t, 3, 2, 0x6b6b6b);
  setPx(t, 2, 3, 0x6b6b6b);
  setPx(t, 3, 3, 0x4a4a4a);
  for (let y = 0; y < 6; y++) {
    setPx(t, 6, y, DARK_WOOD[4]);
    setPx(t, 7, y, DARK_WOOD[2]);
  }
  return t;
}

export function registerEnchantingTextures(T: Reg): void {
  T['enchanting_table_top'] = enchantingTableTop;
  T['enchanting_table_side'] = enchantingTableSide;
  T['enchanting_table_bottom'] = enchantingTableBottom;
  T['anvil'] = anvilBody;
  T['anvil_top'] = () => anvilTop(0);
  T['chipped_anvil_top'] = () => anvilTop(1);
  T['damaged_anvil_top'] = () => anvilTop(2);
  T['grindstone_side'] = grindstoneSide;
  T['grindstone_round'] = grindstoneRound;
  T['grindstone_pivot'] = grindstonePivot;
}
