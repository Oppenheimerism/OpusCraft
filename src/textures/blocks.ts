// Procedural block textures (16x16, vanilla-style pixel art).

import {
  TexImage, TexDef, img, setPx, getPx, plot, clear, fill, rect, valueNoise, whiteNoise, combine, paletteMap, voronoi,
  mixC, mulC, gray, packRGB, rgbOf, anim, equalize, pattern, line, getA, cloneImg, flipH, Rand, mapPixels, tintC,
} from './tex';
import { hashString } from '../core/rng';
import { DYE } from './dyes';

type Gen = () => TexDef;
export const BLOCK_TEXTURES: Record<string, Gen> = {};
const T = BLOCK_TEXTURES;

function R(name: string, salt = 0): Rand {
  return new Rand(hashString(name) ^ salt, 77);
}

// ---------------------------------------------------------------------------
// Generic material generators

/** Mottled stone-like material. */
export function mottled(seed: string, palette: number[], weights?: number[], opts: { cell?: number; white?: number; streak?: boolean } = {}): TexImage {
  const r = R(seed);
  const t = img();
  const cell = opts.cell ?? 4;
  const layers = opts.streak
    ? [valueNoise(r, 16, 16, 8, 2), valueNoise(r, 16, 16, 4, 1), whiteNoise(r, 16, 16)]
    : [valueNoise(r, 16, 16, cell * 2), valueNoise(r, 16, 16, cell), valueNoise(r, 16, 16, cell / 2), whiteNoise(r, 16, 16)];
  const wts = opts.streak ? [0.5, 0.3, opts.white ?? 0.35] : [0.35, 0.3, 0.2, opts.white ?? 0.3];
  paletteMap(t, combine(layers, wts), palette, weights);
  return t;
}

function stoneBase(seed: string): TexImage {
  const t = mottled(seed, [0x686868, 0x737373, 0x7c7c7c, 0x858585, 0x8f8f8f, 0x9a9a9a], [1, 3, 5, 5, 3, 1.2]);
  // a few dark crack pixels
  const r = R(seed, 5);
  for (let i = 0; i < 4; i++) {
    let x = r.nextInt(16), y = r.nextInt(16);
    const len = 2 + r.nextInt(3);
    const dx = r.nextBool() ? 1 : 0;
    for (let k = 0; k < len; k++) {
      setPx(t, x, y, 0x626262);
      if (dx) x++;
      else y++;
      if (r.chance(0.4)) dx ? y++ : x++;
    }
  }
  return t;
}

function deepslateBase(seed: string): TexImage {
  const t = mottled(seed, [0x3d3d44, 0x47474e, 0x505057, 0x595960, 0x63636a, 0x6e6e74], [1, 3, 5, 4, 2, 1], { streak: true, white: 0.3 });
  return t;
}

/** Ore overlay: blobs of ore color with shading. */
function oreOn(base: TexImage, seed: string, colors: [number, number, number], count = 5, size = 4): TexImage {
  const t = cloneImg(base);
  const r = R(seed, 99);
  const [dark, mid, light] = colors;
  const taken = new Set<number>();
  const centers: [number, number][] = [];
  let guard = 0;
  while (centers.length < count && guard++ < 200) {
    const cx = 1 + r.nextInt(14), cy = 1 + r.nextInt(14);
    if (centers.some(([x, y]) => Math.abs(x - cx) + Math.abs(y - cy) < 5)) continue;
    centers.push([cx, cy]);
  }
  for (const [cx, cy] of centers) {
    const n = size - 1 + r.nextInt(3);
    const pts: [number, number][] = [[cx, cy]];
    while (pts.length < n) {
      const [px, py] = pts[r.nextInt(pts.length)];
      const d = r.nextInt(4);
      const nx = px + [1, -1, 0, 0][d], ny = py + [0, 0, 1, -1][d];
      if (nx < 0 || ny < 0 || nx > 15 || ny > 15) continue;
      if (!pts.some(([x, y]) => x === nx && y === ny)) pts.push([nx, ny]);
    }
    // shade: top-left pixels light, bottom-right dark
    let minS = Infinity, maxS = -Infinity;
    for (const [x, y] of pts) {
      minS = Math.min(minS, x + y);
      maxS = Math.max(maxS, x + y);
    }
    for (const [x, y] of pts) {
      const s = x + y;
      const c = s === minS ? light : s === maxS && pts.length > 2 ? dark : mid;
      setPx(t, x, y, c);
      taken.add(y * 16 + x);
    }
    // dark rim below/right
    for (const [x, y] of pts) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx > 15 || ny > 15 || taken.has(ny * 16 + nx)) continue;
        if (r.chance(0.6)) setPx(t, nx, ny, mixC(getPx(t, nx, ny), dark, 0.45));
      }
    }
  }
  return t;
}

/** Bevelled "polished" version of a material. */
function polished(seed: string, palette: number[]): TexImage {
  const t = mottled(seed, palette, [1, 3, 5, 3, 1], { cell: 8, white: 0.18 });
  const hi = palette[palette.length - 1], lo = palette[0];
  for (let i = 0; i < 16; i++) {
    setPx(t, i, 0, mixC(getPx(t, i, 0), hi, 0.5));
    setPx(t, 0, i, mixC(getPx(t, 0, i), hi, 0.5));
    setPx(t, i, 15, mixC(getPx(t, i, 15), lo, 0.5));
    setPx(t, 15, i, mixC(getPx(t, 15, i), lo, 0.5));
  }
  return t;
}

/** Cobble: rounded stones with dark mortar. */
function cobble(seed: string, palette: number[], mortar: number, sites = 10): TexImage {
  const r = R(seed);
  const t = img();
  const v = voronoi(r, 16, 16, sites, 3.2);
  const n = valueNoise(r, 16, 16, 4);
  const wn = whiteNoise(r, 16, 16);
  const cellShade = v.pts.map(() => r.nextInt(palette.length - 2) + 1);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const i = y * 16 + x;
      const edge = v.f2[i] - v.f1[i];
      if (edge < 0.9) {
        setPx(t, x, y, mortar);
        continue;
      }
      const [sx, sy] = v.pts[v.id[i]];
      // highlight toward top-left of each stone
      let dx = x + 0.5 - sx, dy = y + 0.5 - sy;
      if (dx > 8) dx -= 16;
      if (dx < -8) dx += 16;
      if (dy > 8) dy -= 16;
      if (dy < -8) dy += 16;
      let k = cellShade[v.id[i]];
      const lightDir = -(dx + dy);
      if (lightDir > 2.2) k++;
      if (lightDir < -2.0 || edge < 1.6) k--;
      if (n[i] + wn[i] * 0.5 > 1.15) k++;
      if (n[i] + wn[i] * 0.5 < 0.35) k--;
      k = Math.max(0, Math.min(palette.length - 1, k));
      setPx(t, x, y, palette[k]);
    }
  return t;
}

function dirtBase(seed: string): TexImage {
  const t = mottled(seed, [0x5b3f29, 0x6b4a31, 0x795638, 0x866043, 0x936c4c, 0x9f7856], [1, 3, 5, 5, 3, 1], { cell: 4, white: 0.45 });
  const r = R(seed, 3);
  for (let i = 0; i < 9; i++) {
    const x = r.nextInt(16), y = r.nextInt(16);
    setPx(t, x, y, r.chance(0.5) ? 0xab8c6c : 0x8f7a6b);
  }
  for (let i = 0; i < 6; i++) setPx(t, r.nextInt(16), r.nextInt(16), 0x523824);
  return t;
}

// ---------------------------------------------------------------------------
// Terrain

T['stone'] = () => stoneBase('stone');
T['cobblestone'] = () => cobble('cobblestone', [0x505050, 0x5f5f5f, 0x6e6e6e, 0x7c7c7c, 0x8b8b8b, 0x9b9b9b, 0xacacac], 0x484848, 10);
T['mossy_cobblestone'] = () => {
  const t = cobble('cobblestone', [0x505050, 0x5f5f5f, 0x6e6e6e, 0x7c7c7c, 0x8b8b8b, 0x9b9b9b, 0xacacac], 0x484848, 10);
  const r = R('moss');
  const n = valueNoise(r, 16, 16, 4);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (n[y * 16 + x] > 0.55 + r.next() * 0.1) setPx(t, x, y, [0x4c6b2a, 0x5a7c33, 0x668d3a][r.nextInt(3)]);
    }
  return t;
};
T['granite'] = () => mottled('granite', [0x7c5344, 0x8f6353, 0x9a6b5a, 0xa77564, 0xb3836f, 0xc49a86], [1, 2, 4, 4, 3, 1.5], { cell: 2, white: 0.6 });
T['polished_granite'] = () => polished('pgranite', [0x87594a, 0x9a6a58, 0xa57260, 0xb07d69, 0xbc8b76]);
T['diorite'] = () => {
  const t = mottled('diorite', [0x7e7e80, 0x9c9c9e, 0xb2b2b3, 0xc4c4c5, 0xd6d6d6, 0xe9e9e9], [1, 2, 3, 4, 4, 2], { cell: 2, white: 0.65 });
  return t;
};
T['polished_diorite'] = () => polished('pdiorite', [0xa3a3a5, 0xb8b8b9, 0xc5c5c6, 0xd3d3d4, 0xe2e2e2]);
T['andesite'] = () => mottled('andesite', [0x6c6c6d, 0x7a7a7b, 0x848485, 0x8e8e8f, 0x999a9a, 0xa7a7a8], [1, 3, 4, 4, 3, 1.2], { cell: 2, white: 0.55 });
T['polished_andesite'] = () => polished('pandesite', [0x747576, 0x818283, 0x8a8b8c, 0x949596, 0xa0a1a2]);
T['deepslate'] = () => deepslateBase('deepslate');
T['deepslate_top'] = () => mottled('deepslate_top', [0x3d3d44, 0x47474e, 0x505057, 0x595960, 0x63636a, 0x6e6e74], [1, 3, 5, 4, 2, 1], { cell: 4, white: 0.35 });
T['cobbled_deepslate'] = () => cobble('cdeep', [0x2f2f35, 0x3a3a40, 0x45454c, 0x505057, 0x5b5b62, 0x67676e], 0x28282d, 11);
T['polished_deepslate'] = () => polished('pdeep', [0x3a3a40, 0x45454b, 0x4d4d53, 0x55555c, 0x5f5f66]);
T['deepslate_bricks'] = () => bricksTex('dbricks', [0x3c3c42, 0x46464c, 0x505056, 0x5a5a60], 0x2c2c31, 4, 8);
T['deepslate_tiles'] = () => bricksTex('dtiles', [0x333338, 0x3c3c42, 0x45454b, 0x4e4e54], 0x242428, 4, 4);
T['tuff'] = () => {
  const t = mottled('tuff', [0x5a5b53, 0x65665d, 0x6d6e65, 0x76776d, 0x808176, 0x8d8e83], [1, 3, 5, 4, 2, 1], { cell: 4, white: 0.4 });
  const r = R('tuffspeck');
  for (let i = 0; i < 12; i++) setPx(t, r.nextInt(16), r.nextInt(16), r.chance(0.5) ? 0x9a9b8e : 0x4f4f48);
  return t;
};
T['calcite'] = () => mottled('calcite', [0xc9cac6, 0xd3d4d0, 0xdcddd9, 0xe3e4e0, 0xeaebe7, 0xf3f3f0], [1, 2, 4, 5, 3, 1], { cell: 4, white: 0.3 });
T['dripstone_block'] = () => mottled('dripstone', [0x6b5143, 0x7a5e4f, 0x86695a, 0x917465, 0x9e8171, 0xab8f80], [1, 2, 4, 4, 3, 1], { streak: true });
T['dirt'] = () => dirtBase('dirt');
T['coarse_dirt'] = () => {
  const t = dirtBase('coarse');
  const r = R('coarse2');
  for (let i = 0; i < 22; i++) setPx(t, r.nextInt(16), r.nextInt(16), [0x6f6a66, 0x847e79, 0x5e5550, 0x9a938d][r.nextInt(4)]);
  return t;
};
T['rooted_dirt'] = () => {
  const t = dirtBase('rooted');
  const r = R('roots');
  for (let k = 0; k < 4; k++) {
    let x = r.nextInt(16), y = r.nextInt(16);
    for (let s = 0; s < 6; s++) {
      setPx(t, x, y, s % 2 ? 0x9c7b5a : 0xb08c69);
      x += r.nextInt(3) - 1;
      y += 1;
    }
  }
  return t;
};
T['mud'] = () => mottled('mud', [0x2f2a2b, 0x37302f, 0x3d3635, 0x443d3c, 0x4c4544], [1, 3, 5, 3, 1], { cell: 4, white: 0.35 });
T['farmland'] = () => farmlandTex(false);
T['farmland_moist'] = () => farmlandTex(true);
T['dirt_path_top'] = () => mottled('path', [0x7f6a3f, 0x8a7446, 0x947d4e, 0x9e8755, 0xa8915d], [1, 3, 5, 3, 1], { cell: 4, white: 0.4 });
T['dirt_path_side'] = () => {
  const t = dirtBase('pathside');
  const top = mottled('path', [0x7f6a3f, 0x8a7446, 0x947d4e, 0x9e8755, 0xa8915d], [1, 3, 5, 3, 1], { cell: 4, white: 0.4 });
  for (let x = 0; x < 16; x++) {
    clear(t, x, 0);
    const d = 1 + ((x * 7) % 3 === 0 ? 1 : 0);
    for (let y = 1; y <= d; y++) setPx(t, x, y, getPx(top, x, y));
  }
  return t;
};

function farmlandTex(wet: boolean): TexImage {
  const pal = wet ? [0x30200f, 0x3b2814, 0x46301a, 0x503820, 0x5a3f25] : [0x5d3d22, 0x6a472a, 0x775133, 0x845b3a, 0x906543];
  const t = mottled(wet ? 'fwet' : 'fdry', pal, [1, 3, 5, 3, 1], { cell: 4, white: 0.4 });
  // furrows
  for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) setPx(t, x, y, mulC(getPx(t, x, y), 0.72));
  return t;
}

function grassGray(seed: string): Float32Array {
  const r = R(seed);
  return combine([valueNoise(r, 16, 16, 8), valueNoise(r, 16, 16, 4), valueNoise(r, 16, 16, 2), whiteNoise(r, 16, 16)], [0.2, 0.35, 0.2, 0.35]);
}

const GRASS_GRAYS = [0x8a8a8a, 0x979797, 0xa3a3a3, 0xaeaeae, 0xbababa, 0xc7c7c7];

T['grass_block_top'] = () => {
  const t = img();
  paletteMap(t, grassGray('grasstop'), GRASS_GRAYS, [1, 2.5, 4, 4, 2.5, 1]);
  return t;
};

function grassFringeDepth(seed: string): number[] {
  const r = R(seed);
  const d: number[] = [];
  for (let x = 0; x < 16; x++) d.push(3 + (r.chance(0.55) ? 1 : 0) + (r.chance(0.25) ? 1 : 0));
  // make it jagged but not too noisy
  for (let x = 0; x < 16; x++) if (d[x] >= 5 && d[(x + 15) % 16] >= 5 && d[(x + 1) % 16] >= 5) d[x] = 4;
  return d;
}

T['grass_block_side_overlay'] = () => {
  const t = img();
  const d = grassFringeDepth('fringe');
  const g = grassGray('grassside');
  const eq = equalize(g);
  for (let x = 0; x < 16; x++)
    for (let y = 0; y < d[x]; y++) {
      const k = Math.min(5, Math.floor(eq[y * 16 + x] * 6));
      let c = GRASS_GRAYS[k];
      if (y === d[x] - 1) c = mulC(c, 0.86);
      setPx(t, x, y, c);
    }
  return t;
};
T['grass_block_side'] = () => {
  const t = dirtBase('dirt');
  const ov = T['grass_block_side_overlay']() as TexImage;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) if (getA(ov, x, y) > 0) setPx(t, x, y, tintC(getPx(ov, x, y), 0x91bd59));
  return t;
};
T['grass_block_snow'] = () => {
  const t = dirtBase('dirt');
  const r = R('snowside');
  for (let x = 0; x < 16; x++) {
    const d = 3 + (r.chance(0.5) ? 1 : 0) + (r.chance(0.2) ? 1 : 0);
    for (let y = 0; y < d; y++) setPx(t, x, y, y === d - 1 ? 0xd6dfe3 : [0xeef5f5, 0xf8fdfd, 0xffffff][r.nextInt(3)]);
  }
  return t;
};
T['snow'] = () => {
  const t = mottled('snow', [0xdde6ea, 0xe8f0f2, 0xf0f7f8, 0xf8fdfd, 0xffffff], [1, 2, 4, 5, 4], { cell: 4, white: 0.5 });
  return t;
};
T['powder_snow'] = () => mottled('psnow', [0xdfe8ec, 0xe9f1f3, 0xf2f8f9, 0xf9fdfd, 0xffffff], [2, 3, 4, 4, 3], { cell: 2, white: 0.6 });
T['podzol_top'] = () => mottled('podzol', [0x4f3417, 0x5e3f1c, 0x6c4a22, 0x7b5528, 0x8a6230, 0x6a5a28], [1, 3, 4, 3, 2, 1], { cell: 2, white: 0.6 });
T['podzol_side'] = () => {
  const t = dirtBase('dirt');
  const top = T['podzol_top']() as TexImage;
  const r = R('podside');
  for (let x = 0; x < 16; x++) {
    const d = 3 + (r.chance(0.5) ? 1 : 0);
    for (let y = 0; y < d; y++) setPx(t, x, y, getPx(top, x, y));
  }
  return t;
};
T['mycelium_top'] = () => {
  const t = mottled('myc', [0x5b4c55, 0x675762, 0x72626d, 0x7d6c78, 0x8a7a85, 0x9c8e97], [1, 3, 4, 4, 2, 1], { cell: 2, white: 0.55 });
  const r = R('mycdots');
  for (let i = 0; i < 10; i++) setPx(t, r.nextInt(16), r.nextInt(16), 0xb3a9b0);
  return t;
};
T['mycelium_side'] = () => {
  const t = dirtBase('dirt');
  const top = T['mycelium_top']() as TexImage;
  const r = R('mycside');
  for (let x = 0; x < 16; x++) {
    const d = 2 + (r.chance(0.6) ? 1 : 0) + (r.chance(0.3) ? 1 : 0);
    for (let y = 0; y < d; y++) setPx(t, x, y, getPx(top, x, y));
  }
  return t;
};
T['sand'] = () => {
  const t = mottled('sand', [0xcfc08e, 0xd6c897, 0xdbcfa1, 0xe0d5a9, 0xe7ddb3, 0xefe6c1], [1, 3, 5, 5, 3, 1], { cell: 2, white: 0.6 });
  return t;
};
T['red_sand'] = () => mottled('redsand', [0xa24f19, 0xae5820, 0xb96126, 0xbe672b, 0xc57234, 0xd0823f], [1, 3, 5, 5, 3, 1], { cell: 2, white: 0.6 });
T['gravel'] = () => {
  const r = R('gravel');
  const t = img();
  const v = voronoi(r, 16, 16, 26, 2.2);
  const pal = [0x5d5959, 0x6d6969, 0x7c7878, 0x8b8888, 0x9b9898, 0xaba8a8, 0x7a6e67, 0x857a73];
  const cellC = v.pts.map(() => r.nextInt(pal.length));
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const i = y * 16 + x;
      let c = pal[cellC[v.id[i]]];
      const edge = v.f2[i] - v.f1[i];
      if (edge < 0.55) c = mulC(c, 0.72);
      else if (v.f1[i] < 0.8) c = mulC(c, 1.08);
      setPx(t, x, y, c);
    }
  return t;
};
T['clay'] = () => mottled('clay', [0x939aa7, 0x9ca3b0, 0xa2a8b5, 0xa9afbb, 0xb1b7c2], [1, 3, 5, 3, 1], { cell: 4, white: 0.3 });
T['sandstone_top'] = () => mottled('sstop', [0xd4c690, 0xd9cc98, 0xdfd3a2, 0xe3d8a9, 0xe8deb2], [1, 3, 5, 3, 1], { cell: 4, white: 0.35 });
T['sandstone_bottom'] = () => mottled('ssbot', [0xcdbd86, 0xd4c590, 0xdacc99, 0xdfd2a1, 0xe4d8aa], [1, 3, 5, 3, 1], { cell: 2, white: 0.4 });
T['sandstone'] = () => sandstoneSide('ss', [0xcbbb83, 0xd3c38d, 0xd9ca96, 0xdfd29f, 0xe5d9a9, 0xb9a872]);
T['cut_sandstone'] = () => {
  const t = mottled('cutss', [0xd2c38d, 0xd8c995, 0xddcf9d, 0xe2d5a5], [1, 4, 4, 1], { cell: 4, white: 0.3 });
  for (let i = 0; i < 16; i++) {
    setPx(t, i, 0, 0xe7ddb0);
    setPx(t, i, 15, 0xb9a872);
    setPx(t, 0, i, 0xe7ddb0);
    setPx(t, 15, i, 0xb9a872);
  }
  return t;
};
T['chiseled_sandstone'] = () => {
  const t = T['cut_sandstone']() as TexImage;
  rect(t, 3, 3, 10, 10, 0xc6b57e);
  rect(t, 4, 4, 8, 8, 0xdcd09c);
  rect(t, 6, 6, 4, 4, 0xbba972);
  return t;
};
T['red_sandstone_top'] = () => mottled('rstop', [0xa3521d, 0xab5921, 0xb46026, 0xba662a, 0xc16d2f], [1, 3, 5, 3, 1], { cell: 4, white: 0.35 });
T['red_sandstone_bottom'] = () => mottled('rsbot', [0x9e4f1b, 0xa6561f, 0xae5c23, 0xb66327, 0xbd6a2c], [1, 3, 5, 3, 1], { cell: 2, white: 0.4 });
T['red_sandstone'] = () => sandstoneSide('rss', [0x9a4c1a, 0xa4541e, 0xad5b22, 0xb66227, 0xbf6a2d, 0x86410f]);

function sandstoneSide(seed: string, pal: number[]): TexImage {
  const r = R(seed);
  const t = img();
  const base = combine([valueNoise(r, 16, 16, 8, 2), valueNoise(r, 16, 16, 4, 1), whiteNoise(r, 16, 16)], [0.5, 0.3, 0.3]);
  paletteMap(t, base, pal.slice(0, 5), [1, 3, 5, 3, 1]);
  // horizontal bands: top band light, dark line, middle, bottom
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 3; y++) setPx(t, x, y, mixC(getPx(t, x, y), pal[4], 0.4));
    setPx(t, x, 3, pal[5]);
    setPx(t, x, 11, mixC(getPx(t, x, 11), pal[5], 0.6));
    for (let y = 12; y < 16; y++) setPx(t, x, y, mixC(getPx(t, x, y), pal[0], 0.3));
  }
  return t;
}

T['bedrock'] = () => {
  const r = R('bedrock');
  const t = img();
  paletteMap(t, combine([valueNoise(r, 16, 16, 4), valueNoise(r, 16, 16, 2), whiteNoise(r, 16, 16)], [0.4, 0.3, 0.5]), [0x1f1f1f, 0x333333, 0x4a4a4a, 0x5f5f5f, 0x777777, 0x8f8f8f], [2, 3, 3, 3, 2, 1]);
  return t;
};
T['obsidian'] = () => {
  const r = R('obsidian');
  const t = img();
  paletteMap(t, combine([valueNoise(r, 16, 16, 4), valueNoise(r, 16, 16, 2), whiteNoise(r, 16, 16)], [0.4, 0.3, 0.4]), [0x0f0b19, 0x15101f, 0x1c1628, 0x251d33, 0x3a2c52, 0x5c4687], [3, 4, 3, 2, 1, 0.5]);
  return t;
};
T['clay'] = T['clay'];
T['moss_block'] = () => mottled('moss', [0x485d23, 0x516828, 0x5a732d, 0x637d33, 0x6c883a], [1, 3, 5, 3, 1], { cell: 2, white: 0.55 });
T['magma'] = () => {
  const t = cobble('magma', [0x4d1506, 0x6b2208, 0x8f370c, 0xb45212, 0xcf6e17, 0xe89524], 0xf5b53b, 9);
  return t;
};

// Ores
const ORE_COLORS: Record<string, [number, number, number]> = {
  coal: [0x1c1c1c, 0x2d2d2d, 0x474747],
  iron: [0xa37b63, 0xd8af93, 0xe8c9b5],
  copper: [0x8c4a2b, 0xc16a42, 0x57a88a],
  gold: [0xb57e14, 0xf9d849, 0xfdf5a0],
  redstone: [0x7d0000, 0xd10d0d, 0xff4f4f],
  lapis: [0x13307a, 0x2356c2, 0x5e8ae0],
  diamond: [0x178f94, 0x4aedd9, 0xc4fdf4],
  emerald: [0x0b6b2d, 0x17c253, 0x8ef5b3],
};
for (const [ore, cols] of Object.entries(ORE_COLORS)) {
  T[`${ore}_ore`] = () => oreOn(stoneBase('stone'), ore, cols, ore === 'coal' ? 6 : 5, ore === 'coal' ? 4 : 3);
  T[`deepslate_${ore}_ore`] = () => oreOn(deepslateBase('deepslate'), ore + 'd', cols, ore === 'coal' ? 6 : 5, ore === 'coal' ? 4 : 3);
}
T['raw_iron_block'] = () => mottled('rawiron', [0x8f6c55, 0xa88064, 0xbf957a, 0xd3ab8f, 0xe3c0a6], [1, 3, 4, 3, 1], { cell: 4, white: 0.5 });
T['raw_copper_block'] = () => mottled('rawcopper', [0x8c4029, 0xa35034, 0xbf6441, 0xd77a51, 0x7aa38e], [1, 3, 4, 3, 1], { cell: 4, white: 0.5 });
T['raw_gold_block'] = () => mottled('rawgold', [0xb07d11, 0xd3a019, 0xeabf2c, 0xf8d948, 0xfdec82], [1, 3, 4, 3, 1], { cell: 4, white: 0.5 });
function metalBlock(seed: string, pal: number[]): TexImage {
  const t = mottled(seed, pal.slice(1, 4), [2, 5, 2], { cell: 8, white: 0.12 });
  for (let i = 0; i < 16; i++) {
    setPx(t, i, 0, pal[4]);
    setPx(t, 0, i, pal[4]);
    setPx(t, i, 15, pal[0]);
    setPx(t, 15, i, pal[0]);
  }
  for (let i = 1; i < 15; i++) {
    setPx(t, i, 1, mixC(getPx(t, i, 1), pal[4], 0.4));
    setPx(t, 1, i, mixC(getPx(t, 1, i), pal[4], 0.4));
  }
  return t;
}
T['iron_block'] = () => metalBlock('ironb', [0x9f9f9f, 0xcfcfcf, 0xdadada, 0xe4e4e4, 0xf7f7f7]);
T['gold_block'] = () => metalBlock('goldb', [0xb88a0d, 0xf2cf31, 0xf8dc4a, 0xfbe66a, 0xfffbb7]);
T['diamond_block'] = () => metalBlock('diab', [0x3aa6a0, 0x62e3da, 0x75ebe2, 0x8ff2ea, 0xdefff9]);
T['emerald_block'] = () => metalBlock('emb', [0x1b8c43, 0x33c565, 0x3ed474, 0x52e085, 0xb5ffcd]);
T['copper_block'] = () => metalBlock('cub', [0x9c4c32, 0xc06a4c, 0xcc7657, 0xd98563, 0xf0b19a]);
T['coal_block'] = () => mottled('coalb', [0x0f0f0f, 0x171717, 0x1f1f1f, 0x292929, 0x363636], [1, 3, 5, 3, 1], { cell: 4, white: 0.4 });
T['lapis_block'] = () => mottled('lapb', [0x163a8c, 0x1c47a6, 0x2152b8, 0x2a5fc9, 0x3d74dc], [1, 3, 5, 3, 1], { cell: 4, white: 0.4 });
T['redstone_block'] = () => mottled('redb', [0x8c0e04, 0xa81306, 0xbc1a0a, 0xd12411, 0xe8412a], [1, 3, 5, 3, 1], { cell: 2, white: 0.5 });

// Bricks
function bricksTex(seed: string, pal: number[], mortar: number, rowH: number, brickW: number): TexImage {
  const r = R(seed);
  const t = mottled(seed, pal, [1, 3, 3, 1], { cell: 2, white: 0.5 });
  for (let y = 0; y < 16; y++) {
    const row = Math.floor(y / rowH);
    const off = row % 2 ? brickW / 2 : 0;
    for (let x = 0; x < 16; x++) {
      if (y % rowH === rowH - 1) setPx(t, x, y, mortar);
      else if ((x + off) % brickW === brickW - 1) setPx(t, x, y, mortar);
    }
  }
  void r;
  return t;
}
T['stone_bricks'] = () => {
  const t = mottled('sbrick', [0x6b6b6b, 0x767676, 0x7f7f7f, 0x888888, 0x929292], [1, 3, 5, 3, 1], { cell: 4, white: 0.35 });
  // rows: 0-3, 4-7, 8-11, 12-15 ; offsets alternate
  for (let y = 0; y < 16; y++) {
    const row = y >> 2;
    const off = row % 2 ? 4 : 0;
    for (let x = 0; x < 16; x++) {
      const bxp = (x + off) % 8;
      if (y % 4 === 3) setPx(t, x, y, 0x575757);
      else if (bxp === 7) setPx(t, x, y, 0x575757);
      else if (y % 4 === 0 || bxp === 0) setPx(t, x, y, mixC(getPx(t, x, y), 0x9d9d9d, 0.45));
    }
  }
  return t;
};
T['mossy_stone_bricks'] = () => {
  const t = T['stone_bricks']() as TexImage;
  const r = R('mossb');
  const n = valueNoise(r, 16, 16, 4);
  for (let i = 0; i < 256; i++) if (n[i] > 0.6) setPx(t, i % 16, i >> 4, [0x4d6a2b, 0x5b7a33, 0x668a3a][r.nextInt(3)]);
  return t;
};
T['cracked_stone_bricks'] = () => {
  const t = T['stone_bricks']() as TexImage;
  line(t, 2, 1, 6, 6, 0x4f4f4f);
  line(t, 6, 6, 5, 10, 0x4f4f4f);
  line(t, 11, 9, 14, 14, 0x4f4f4f);
  return t;
};
T['chiseled_stone_bricks'] = () => {
  const t = mottled('chis', [0x6b6b6b, 0x767676, 0x7f7f7f, 0x888888, 0x929292], [1, 3, 5, 3, 1], { cell: 4, white: 0.35 });
  for (let i = 0; i < 16; i++) {
    setPx(t, i, 0, 0x9d9d9d); setPx(t, 0, i, 0x9d9d9d);
    setPx(t, i, 15, 0x575757); setPx(t, 15, i, 0x575757);
  }
  for (let i = 3; i < 13; i++) {
    setPx(t, i, 3, 0x575757); setPx(t, 3, i, 0x575757);
    setPx(t, i, 12, 0x9d9d9d); setPx(t, 12, i, 0x9d9d9d);
  }
  rect(t, 6, 6, 4, 4, 0x6a6a6a);
  return t;
};
T['smooth_stone'] = () => {
  const t = mottled('smooth', [0x9a9a9a, 0xa2a2a2, 0xa8a8a8, 0xafafaf], [1, 4, 4, 1], { cell: 8, white: 0.1 });
  for (let i = 0; i < 16; i++) {
    setPx(t, i, 0, 0xb9b9b9); setPx(t, i, 15, 0x8a8a8a);
    setPx(t, 0, i, 0xb9b9b9); setPx(t, 15, i, 0x8a8a8a);
  }
  return t;
};
T['bricks'] = () => {
  const r = R('bricks');
  const t = img();
  fill(t, 0x9c9a92);
  for (let row = 0; row < 4; row++) {
    const y0 = row * 4;
    const off = row % 2 ? 4 : 0;
    for (let b = -1; b < 3; b++) {
      const x0 = b * 8 + off;
      const base = [0x96493a, 0xa0503f, 0x8d4234, 0xa65645][r.nextInt(4)];
      for (let y = y0; y < y0 + 3; y++)
        for (let x = x0; x < x0 + 7; x++) {
          if (x < 0 || x > 15) continue;
          let c = base;
          if (y === y0) c = mixC(c, 0xc07564, 0.35);
          if (y === y0 + 2) c = mulC(c, 0.88);
          if (r.chance(0.18)) c = mulC(c, 0.9 + r.next() * 0.2);
          setPx(t, x, y, c);
        }
    }
    for (let x = 0; x < 16; x++) setPx(t, x, y0 + 3, r.chance(0.3) ? 0x8b897f : 0x9f9d94);
  }
  return t;
};

// ---------------------------------------------------------------------------
// Wood

interface WoodPal {
  bark: number[]; // 5 dark->light
  wood: number[]; // 5 planks dark->light
  gap: number;
  ring: number[]; // log top: 3 colors
  barkStyle?: 'birch' | 'normal' | 'rough';
}
const WOODS: Record<string, WoodPal> = {
  oak: { bark: [0x4a3920, 0x5a4629, 0x6a5232, 0x765d39, 0x836944], wood: [0x8a6b3f, 0x9a7c4a, 0xa68550, 0xb18f57, 0xbc9960], gap: 0x6b5332, ring: [0xa5834d, 0xb5925a, 0x96753f] },
  spruce: { bark: [0x2e1f0f, 0x392713, 0x432e17, 0x4e371c, 0x5a4022], wood: [0x5e4326, 0x69492a, 0x72512f, 0x7c5934, 0x87623a], gap: 0x4a331c, ring: [0x70502c, 0x7e5c35, 0x5d4123] },
  birch: { bark: [0x3a3a36, 0xbfbfb9, 0xd1d1cb, 0xdedeD8 & 0xffffff, 0xf0f0ea], wood: [0xa8966a, 0xb5a371, 0xbfad79, 0xc9b782, 0xd3c28c], gap: 0x96855a, ring: [0xc6b57e, 0xd3c38c, 0xb09f6b], barkStyle: 'birch' },
  jungle: { bark: [0x3d2d12, 0x4a3917, 0x57441c, 0x635022, 0x705b29], wood: [0x8f633f, 0x9a6c46, 0xa3744b, 0xad7d51, 0xb78658], gap: 0x6f4b2d, ring: [0xa27447, 0xb28253, 0x8d6139], barkStyle: 'rough' },
  acacia: { bark: [0x4d4840, 0x5a554b, 0x676156, 0x736d61, 0x807a6d], wood: [0x94502b, 0xa0592f, 0xab6034, 0xb76839, 0xc2723f], gap: 0x7a4221, ring: [0xa85f35, 0xb96c3e, 0x94532c], barkStyle: 'rough' },
  dark_oak: { bark: [0x281a0b, 0x31210f, 0x3b2813, 0x453018, 0x50381d], wood: [0x3a2511, 0x422a14, 0x4a3017, 0x52361a, 0x5b3c1e], gap: 0x2b1b0b, ring: [0x4f3419, 0x5c3e1f, 0x422b13] },
  mangrove: { bark: [0x3f3027, 0x4a392e, 0x564336, 0x614c3d, 0x6d5646], wood: [0x6a2d2a, 0x76322e, 0x7f3833, 0x893e38, 0x93453e], gap: 0x55221f, ring: [0x7b3632, 0x8a403b, 0x6a2c28] },
  cherry: { bark: [0x2a1419, 0x33181e, 0x3c1d24, 0x46232a, 0x502931], wood: [0xd29b93, 0xdba59d, 0xe2aea6, 0xe8b7af, 0xefc2ba], gap: 0xb87f78, ring: [0xdfa8a0, 0xecbab2, 0xc98e87] },
};

function logSide(seed: string, w: WoodPal): TexImage {
  const r = R(seed);
  const t = img();
  if (w.barkStyle === 'birch') {
    const n = combine([valueNoise(r, 16, 16, 8, 4), whiteNoise(r, 16, 16)], [0.6, 0.4]);
    paletteMap(t, n, w.bark.slice(1), [2, 4, 4, 2]);
    // black horizontal marks
    for (let k = 0; k < 7; k++) {
      const y = r.nextInt(16), x = r.nextInt(16), len = 2 + r.nextInt(4);
      for (let i = 0; i < len; i++) setPx(t, x + i, y, i === 0 || i === len - 1 ? 0x5c5c55 : w.bark[0]);
      if (r.chance(0.5)) setPx(t, x + 1, y + 1, 0x55554e);
    }
    return t;
  }
  const stripes = valueNoise(r, 16, 16, 2, 16, false);
  const n = combine([stripes, valueNoise(r, 16, 16, 2, 6), whiteNoise(r, 16, 16)], [0.55, 0.3, 0.25]);
  paletteMap(t, n, w.bark, [1.2, 2.5, 4, 3, 1.2]);
  // grooves
  for (let k = 0; k < 4; k++) {
    const x = r.nextInt(16);
    let y = r.nextInt(16);
    const len = 4 + r.nextInt(8);
    for (let i = 0; i < len; i++) setPx(t, x, y++, w.bark[0]);
  }
  return t;
}

function logTop(seed: string, w: WoodPal): TexImage {
  const r = R(seed);
  const t = img();
  const n = valueNoise(r, 16, 16, 4);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const edge = Math.min(x, y, 15 - x, 15 - y);
      if (edge === 0) {
        setPx(t, x, y, w.bark[1 + (r.nextInt(3))]);
        continue;
      }
      const dx = x - 7.5, dy = y - 7.5;
      const d = Math.max(Math.abs(dx), Math.abs(dy)) * 0.75 + Math.hypot(dx, dy) * 0.25 + (n[y * 16 + x] - 0.5) * 0.9;
      const ring = Math.floor(d);
      let c = ring % 2 === 0 ? w.ring[0] : w.ring[1];
      if (ring === 5 || ring === 2) c = w.ring[2];
      if (r.chance(0.08)) c = mixC(c, w.ring[2], 0.5);
      setPx(t, x, y, c);
    }
  return t;
}

function planksTex(seed: string, w: WoodPal): TexImage {
  const r = R(seed);
  const t = img();
  const grain = combine([valueNoise(r, 16, 16, 8, 1), valueNoise(r, 16, 16, 4, 1), whiteNoise(r, 16, 16)], [0.45, 0.35, 0.25]);
  paletteMap(t, grain, w.wood, [1, 3, 5, 3, 1.2]);
  for (let p = 0; p < 4; p++) {
    const y0 = p * 4;
    // gap line at bottom of each plank
    for (let x = 0; x < 16; x++) setPx(t, x, y0 + 3, w.gap);
    // vertical seam
    const sx = (p * 5 + 3 + r.nextInt(6)) % 16;
    for (let y = y0; y < y0 + 3; y++) setPx(t, sx, y, w.gap);
    // a lighter top row highlight
    for (let x = 0; x < 16; x++) if (r.chance(0.35)) setPx(t, x, y0, mixC(getPx(t, x, y0), w.wood[4], 0.5));
  }
  return t;
}

function strippedSide(seed: string, w: WoodPal): TexImage {
  const r = R(seed);
  const t = img();
  const n = combine([valueNoise(r, 16, 16, 2, 16, false), valueNoise(r, 16, 16, 4, 8), whiteNoise(r, 16, 16)], [0.5, 0.3, 0.2]);
  paletteMap(t, n, w.wood, [1, 3, 5, 3, 1]);
  return t;
}

function leavesTex(seed: string, dense: number, pal: number[], needle = false): TexImage {
  const r = R(seed);
  const t = img();
  const n = combine([valueNoise(r, 16, 16, 4), valueNoise(r, 16, 16, 2), whiteNoise(r, 16, 16)], [0.35, 0.35, 0.4]);
  const eq = equalize(n);
  const holes = combine([valueNoise(r, 16, 16, 2), whiteNoise(r, 16, 16)], [0.5, 0.5]);
  const heq = equalize(holes);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const i = y * 16 + x;
      if (heq[i] < 1 - dense) continue;
      const k = Math.min(pal.length - 1, Math.floor(eq[i] * pal.length));
      let c = pal[k];
      if (needle && (x + y * 3) % 5 === 0) c = mulC(c, 0.85);
      setPx(t, x, y, c);
    }
  // darken pixels below holes a little for depth
  const src = cloneImg(t);
  for (let y = 1; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (getA(src, x, y) && !getA(src, x, y - 1)) setPx(t, x, y, mulC(getPx(src, x, y), 1.08));
      if (getA(src, x, y) && y < 15 && !getA(src, x, y + 1)) setPx(t, x, y, mulC(getPx(src, x, y), 0.82));
    }
  return t;
}

const LEAF_GRAYS = [0x5e5e5e, 0x747474, 0x878787, 0x9a9a9a, 0xadadad, 0xc0c0c0];

for (const [name, w] of Object.entries(WOODS)) {
  T[`${name}_log`] = () => logSide(name + 'log', w);
  T[`${name}_log_top`] = () => logTop(name + 'top', w);
  T[`${name}_planks`] = () => planksTex(name + 'planks', w);
  T[`stripped_${name}_log`] = () => strippedSide(name + 'strip', w);
  T[`stripped_${name}_log_top`] = () => {
    const t = logTop(name + 'top', w);
    for (let i = 0; i < 16; i++) {
      setPx(t, i, 0, w.wood[1]); setPx(t, i, 15, w.wood[1]); setPx(t, 0, i, w.wood[1]); setPx(t, 15, i, w.wood[1]);
    }
    return t;
  };
}
T['oak_leaves'] = () => leavesTex('oakleaves', 0.72, LEAF_GRAYS);
T['spruce_leaves'] = () => leavesTex('spruceleaves', 0.78, LEAF_GRAYS, true);
T['birch_leaves'] = () => leavesTex('birchleaves', 0.7, LEAF_GRAYS);
T['jungle_leaves'] = () => leavesTex('jungleleaves', 0.8, LEAF_GRAYS);
T['acacia_leaves'] = () => leavesTex('acacialeaves', 0.7, LEAF_GRAYS);
T['dark_oak_leaves'] = () => leavesTex('darkoakleaves', 0.78, LEAF_GRAYS);
T['mangrove_leaves'] = () => leavesTex('mangroveleaves', 0.76, LEAF_GRAYS);
T['cherry_leaves'] = () => leavesTex('cherryleaves', 0.74, [0xc5728f, 0xd688a4, 0xe29fb8, 0xebb3c8, 0xf3c7d8, 0xf9dbe6]);
T['azalea_leaves'] = () => leavesTex('azalealeaves', 0.8, [0x4a6620, 0x587827, 0x65882e, 0x729836, 0x80a83f]);

// ---------------------------------------------------------------------------
// Fluids (animated)

T['water_still'] = () => {
  const frames = 32;
  const r = R('water');
  const g1 = valueNoise(r, 16, 64, 4, 8);
  const g2 = valueNoise(r, 16, 64, 8, 4);
  const wn = whiteNoise(r, 16, 16);
  return anim(16, 16, frames, 2, (f) => {
    const t = img();
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const a = g1[((y + f * 2) % 64) * 16 + x];
        const b = g2[((y + 64 - f * 2) % 64) * 16 + ((x + (f >> 2)) % 16)];
        const v = a * 0.55 + b * 0.35 + wn[y * 16 + x] * 0.1;
        const lv = v < 0.38 ? 0 : v < 0.5 ? 1 : v < 0.6 ? 2 : v < 0.7 ? 3 : 4;
        const c = [0x9c9c9c, 0xacacac, 0xbbbbbb, 0xcbcbcb, 0xdedede][lv];
        setPx(t, x, y, c, 178 + lv * 4);
      }
    return t;
  });
};
T['water_flow'] = () => {
  const frames = 32;
  const r = R('waterflow');
  const g = valueNoise(r, 16, 64, 3, 12);
  const wn = whiteNoise(r, 16, 64);
  return anim(16, 16, frames, 2, (f) => {
    const t = img();
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const yy = (y - f * 2 + 64 * 4) % 64;
        const v = g[yy * 16 + x] * 0.8 + wn[yy * 16 + x] * 0.2;
        const lv = v < 0.35 ? 0 : v < 0.5 ? 1 : v < 0.62 ? 2 : v < 0.74 ? 3 : 4;
        const c = [0x9c9c9c, 0xacacac, 0xbbbbbb, 0xcbcbcb, 0xdedede][lv];
        setPx(t, x, y, c, 178 + lv * 4);
      }
    return t;
  });
};
function lavaFrames(seed: string, flow: boolean) {
  const frames = 20;
  const r = R(seed);
  const g1 = valueNoise(r, 16, 16, 4);
  const g2 = valueNoise(r, 16, 16, 8);
  const pal = [0x9b2800, 0xc13b00, 0xd65300, 0xe57011, 0xf08f23, 0xf8b43a, 0xfcd865];
  return anim(16, 16, frames, flow ? 2 : 3, (f) => {
    const t = img();
    const ph = (f / frames) * Math.PI * 2;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const yy = flow ? (y - f + 32) % 16 : y;
        const a = g1[yy * 16 + x], b = g2[((yy + 8) % 16) * 16 + ((x + 5) % 16)];
        const v = 0.5 + 0.35 * Math.sin(a * 6.28 + ph) * 0.8 + (b - 0.5) * 0.6;
        const k = Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)));
        setPx(t, x, y, pal[k]);
      }
    return t;
  });
}
T['lava_still'] = () => lavaFrames('lava', false);
T['lava_flow'] = () => lavaFrames('lavaflow', true);

// ---------------------------------------------------------------------------
// Ice / glass

T['ice'] = () => {
  const r = R('ice');
  const t = img();
  const n = combine([valueNoise(r, 16, 16, 8), whiteNoise(r, 16, 16)], [0.8, 0.2]);
  const eq = equalize(n);
  for (let i = 0; i < 256; i++) {
    const k = Math.floor(eq[i] * 4);
    setPx(t, i % 16, i >> 4, [0x7aa4e6, 0x87aeea, 0x93b8ee, 0xa3c4f2][k], 158);
  }
  // streaks
  for (let k = 0; k < 3; k++) {
    const x0 = r.nextInt(16), y0 = r.nextInt(16);
    for (let i = 0; i < 4; i++) setPx(t, x0 + i, y0 - i, 0xd7e6fb, 190);
  }
  return t;
};
T['packed_ice'] = () => mottled('packedice', [0x7fa2dc, 0x8aabe1, 0x94b4e6, 0xa0bdeb, 0xadc8f0], [1, 3, 5, 3, 1], { cell: 4, white: 0.3 });
T['blue_ice'] = () => mottled('blueice', [0x5a8fe0, 0x6699e6, 0x72a3ea, 0x7faeee, 0x8fbaf2], [1, 3, 5, 3, 1], { cell: 4, white: 0.3 });
T['glass'] = () => {
  const t = img();
  const edge = 0xdbeaf0, edge2 = 0xa8c6d0;
  for (let i = 0; i < 16; i++) {
    setPx(t, i, 0, edge);
    setPx(t, 0, i, edge);
    setPx(t, i, 15, edge2);
    setPx(t, 15, i, edge2);
  }
  // highlight streaks
  const hl = 0xf5fbfd;
  for (const [x, y] of [[2, 3], [3, 2], [2, 4], [4, 2], [11, 12], [12, 11], [12, 12]]) setPx(t, x, y, hl, 220);
  return t;
};

// ---------------------------------------------------------------------------
// Plants (sprites with transparency)

function stemColumn(t: TexImage, x: number, y0: number, y1: number, col: number, dark: number, sway = 0): void {
  for (let y = y0; y <= y1; y++) {
    const xx = x + (sway && y < (y0 + y1) / 2 ? sway : 0);
    plot(t, xx, y, (y & 1) ? col : dark);
  }
}

function grassBlades(seed: string, count: number, minH: number, maxH: number, pal: number[]): TexImage {
  const r = R(seed);
  const t = img();
  for (let b = 0; b < count; b++) {
    let x = r.nextInt(16);
    const h = minH + r.nextInt(maxH - minH + 1);
    const lean = r.nextInt(3) - 1;
    for (let k = 0; k < h; k++) {
      const y = 15 - k;
      if (k > h * 0.55 && r.chance(0.35)) x += lean;
      const c = pal[Math.min(pal.length - 1, Math.floor((k / h) * pal.length * 0.9 + r.next() * 1.2))];
      plot(t, x, y, c);
    }
  }
  return t;
}

const PLANT_GRAYS = [0x6d6d6d, 0x828282, 0x959595, 0xa8a8a8, 0xbbbbbb];

T['short_grass'] = () => grassBlades('shortgrass', 16, 4, 13, PLANT_GRAYS);
T['tall_grass_bottom'] = () => grassBlades('tallgrassb', 20, 12, 16, PLANT_GRAYS);
T['tall_grass_top'] = () => grassBlades('tallgrasst', 14, 5, 15, PLANT_GRAYS);
T['fern'] = () => fernTex('fern', 12);
T['large_fern_bottom'] = () => fernTex('lfernb', 16);
T['large_fern_top'] = () => fernTex('lfernt', 14);
function fernTex(seed: string, h: number): TexImage {
  const r = R(seed);
  const t = img();
  for (let f = 0; f < 3; f++) {
    const x0 = 3 + f * 5 + r.nextInt(2);
    const lean = f - 1;
    for (let k = 0; k < h; k++) {
      const y = 15 - k;
      const x = x0 + Math.round((lean * k) / h * 3);
      plot(t, x, y, PLANT_GRAYS[2]);
      if (k > 1 && k % 2 === 0) {
        const len = Math.max(1, Math.round((1 - k / h) * 3));
        for (let i = 1; i <= len; i++) {
          plot(t, x - i, y - (i > 1 ? 1 : 0), PLANT_GRAYS[3 - (i > 1 ? 1 : 0)]);
          plot(t, x + i, y - (i > 1 ? 1 : 0), PLANT_GRAYS[1 + (i > 1 ? 1 : 0)]);
        }
      }
    }
  }
  return t;
}
T['dead_bush'] = () => {
  const r = R('deadbush');
  const t = img();
  const c = [0x6b4a1f, 0x7c5627, 0x8f6632];
  const branch = (x: number, y: number, dx: number, len: number, depth: number) => {
    for (let i = 0; i < len; i++) {
      plot(t, x, y, c[r.nextInt(3)]);
      y--;
      if (r.chance(0.5)) x += dx;
      if (depth < 2 && r.chance(0.25)) branch(x, y, -dx, len - i - 1, depth + 1);
    }
  };
  branch(8, 15, 1, 10, 0);
  branch(7, 15, -1, 9, 0);
  branch(8, 13, 1, 6, 1);
  return t;
};
T['sugar_cane'] = () => {
  const t = img();
  for (const x0 of [3, 8, 12]) {
    for (let y = 0; y < 16; y++) {
      const node = (y + x0) % 6 === 0;
      plot(t, x0, y, node ? 0xc7c7c7 : 0xa4a4a4);
      plot(t, x0 + 1, y, node ? 0xb3b3b3 : 0x8a8a8a);
    }
    plot(t, x0 - 1, (x0 * 3) % 16, 0x9a9a9a);
    plot(t, x0 + 2, (x0 * 5 + 7) % 16, 0x8f8f8f);
  }
  return t;
};

function flowerTex(seed: string, head: (t: TexImage) => void, stemTop = 8, leafSide = 1): TexImage {
  const t = img();
  const stem = 0x3c7a22, stemD = 0x2f5f1a, leaf = 0x4d9131;
  for (let y = stemTop; y < 16; y++) plot(t, 7 + (y > 12 ? 0 : 0), y, y % 3 === 0 ? stemD : stem);
  plot(t, 7 + leafSide, 12, leaf);
  plot(t, 7 + leafSide * 2, 11, leaf);
  plot(t, 7 - leafSide, 14, leaf);
  head(t);
  void seed;
  return t;
}
T['dandelion'] = () => flowerTex('dandelion', (t) => {
  pattern(t, 5, 5, [' YY ', 'YyYY', 'YYyY', ' YY '], { Y: 0xf5e02a, y: 0xd8b61c });
  plot(t, 6, 4, 0xfff27a);
});
T['poppy'] = () => flowerTex('poppy', (t) => {
  pattern(t, 4, 3, [' RR RR', 'RrRRrR', 'RRkkRR', 'rRkkRr', ' RRRR ', '  rr  '], { R: 0xed302c, r: 0xb51f1b, k: 0x2c1a0e });
}, 9);
T['blue_orchid'] = () => flowerTex('orchid', (t) => {
  pattern(t, 4, 3, ['  B B  ', ' BbBbB ', 'BBbwbBB', ' BbBbB ', '  B B  '], { B: 0x2aa6f5, b: 0x1f7fc2, w: 0xd9f2ff });
}, 8);
T['allium'] = () => flowerTex('allium', (t) => {
  pattern(t, 4, 2, [' PpP ', 'PpPpP', 'pPlPp', 'PpPpP', ' PpP '], { P: 0xb867e0, p: 0x8e44b8, l: 0xe1a7f7 });
}, 7);
T['azure_bluet'] = () => flowerTex('bluet', (t) => {
  pattern(t, 3, 5, ['W W W', ' Y Y ', 'W W W'], { W: 0xe8f0f5, Y: 0xe6d24a });
  pattern(t, 8, 3, ['W W', ' Y ', 'W W'], { W: 0xdfe9f0, Y: 0xe6d24a });
}, 7);
for (const [name, c1, c2] of [
  ['red_tulip', 0xe0342c, 0xa81f18],
  ['orange_tulip', 0xf0801e, 0xb85a10],
  ['white_tulip', 0xeaeaea, 0xb9b9b9],
  ['pink_tulip', 0xf0a8c8, 0xc47a9c],
] as [string, number, number][]) {
  T[name] = () => flowerTex(name, (t) => {
    pattern(t, 5, 3, ['A B A', 'AABAA', 'ABAAB', 'AAAAA', ' BAB '], { A: c1, B: c2 });
  }, 7);
}
T['oxeye_daisy'] = () => flowerTex('daisy', (t) => {
  pattern(t, 4, 3, [' W W ', 'WWYWW', ' YYY ', 'WWYWW', ' W W '], { W: 0xf2f2f2, Y: 0xf2c61f });
}, 7);
T['cornflower'] = () => flowerTex('cornflower', (t) => {
  pattern(t, 4, 3, ['B B B', ' BbB ', 'BbBbB', ' BbB ', '  b  '], { B: 0x4a6ceb, b: 0x2e45a8 });
}, 7);
T['lily_of_the_valley'] = () => flowerTex('lily', (t) => {
  pattern(t, 8, 3, ['W ', 'WW', ' W', 'WW'], { W: 0xf5f5f0 });
  pattern(t, 4, 5, ['W', 'W', 'WW'], { W: 0xf0f0e8 });
}, 5, -1);
T['brown_mushroom'] = () => {
  const t = img();
  pattern(t, 4, 7, ['  BBBB  ', ' BbBBbB ', 'BBBBBBBB', '   ss   ', '   ss   ', '   ss   '], { B: 0x9a7254, b: 0xb58c6a, s: 0xd8c9b6 });
  return t;
};
T['red_mushroom'] = () => {
  const t = img();
  pattern(t, 4, 6, ['  RRRR  ', ' RwRRwR ', 'RRRRRwRR', 'RwRRRRRR', '   ss   ', '   ss   ', '   ss   '], { R: 0xd8201f, w: 0xf2e9e1, s: 0xe0d6c4 });
  return t;
};
for (const [name, head, stem] of [
  ['lilac', 0xc79ad6, 0x4f7f3c],
  ['rose_bush', 0xd1261f, 0x3f7a2a],
  ['peony', 0xe6b2e0, 0x4a7f38],
] as [string, number, number][]) {
  T[`${name}_bottom`] = () => {
    const t = grassBlades(name + 'b', 10, 10, 16, [mulC(stem, 0.8), stem, mixC(stem, 0xffffff, 0.15)]);
    const r = R(name);
    for (let i = 0; i < 8; i++) plot(t, 3 + r.nextInt(10), r.nextInt(6), head);
    return t;
  };
  T[`${name}_top`] = () => {
    const t = img();
    const r = R(name + 't');
    for (let y = 8; y < 16; y++) plot(t, 7 + (y % 3 === 0 ? 1 : 0), y, stem);
    for (let i = 0; i < 40; i++) {
      const x = 3 + r.nextInt(10), y = 1 + r.nextInt(9);
      plot(t, x, y, r.chance(0.3) ? mulC(head, 0.8) : head);
    }
    return t;
  };
}
T['sunflower_bottom'] = () => grassBlades('sunb', 6, 14, 16, [0x3a6f22, 0x4a8a2c, 0x5a9e35]);
T['sunflower_top'] = () => {
  const t = img();
  for (let y = 0; y < 16; y++) plot(t, 7, y, y % 2 ? 0x4a8a2c : 0x3a6f22);
  plot(t, 8, 10, 0x5a9e35);
  plot(t, 6, 13, 0x5a9e35);
  return t;
};
T['sunflower_front'] = () => {
  const t = img();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d < 3.2) plot(t, x, y, (x + y) % 2 ? 0x5e3a12 : 0x4a2c0c);
      else if (d < 6.5) plot(t, x, y, d > 5.6 && (x + y) % 3 === 0 ? 0xd9a41a : 0xf5cb24);
    }
  return t;
};
T['sunflower_back'] = () => {
  const t = img();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d < 4.5) plot(t, x, y, 0x4d8a2e);
      else if (d < 6.5) plot(t, x, y, 0xdcb21e);
    }
  return t;
};
function saplingTex(seed: string, leaf: number[], trunk: number): TexImage {
  const r = R(seed);
  const t = img();
  for (let y = 9; y < 16; y++) plot(t, 7 + (y > 12 ? 0 : (y & 1)), y, trunk);
  for (let i = 0; i < 38; i++) {
    const x = 7 + Math.round(r.gaussian() * 2.6), y = 6 + Math.round(r.gaussian() * 2.4);
    if (y > 11) continue;
    plot(t, x, y, leaf[r.nextInt(leaf.length)]);
  }
  return t;
}
T['oak_sapling'] = () => saplingTex('oaksap', [0x2f6d16, 0x3f8a22, 0x4f9e2e, 0x5aad37], 0x6b5332);
T['spruce_sapling'] = () => saplingTex('sprucesap', [0x2a4a2a, 0x355a34, 0x3f6a3e], 0x4b331b);
T['birch_sapling'] = () => saplingTex('birchsap', [0x5a8a36, 0x6b9e41, 0x7bb04c], 0xcfcfc8);
T['jungle_sapling'] = () => saplingTex('junglesap', [0x2f7a12, 0x3d9219, 0x4aa321], 0x5a4520);
T['acacia_sapling'] = () => saplingTex('acaciasap', [0x5e7a1a, 0x708f22, 0x82a02b], 0x6b6558);
T['dark_oak_sapling'] = () => saplingTex('darkoaksap', [0x1f4f0e, 0x2b6214, 0x36731b], 0x3b2812);
T['cherry_sapling'] = () => saplingTex('cherrysap', [0xd680a0, 0xe596b4, 0xf0acc6], 0x3c1d24);

T['cactus_side'] = () => {
  const t = img();
  const r = R('cactus');
  for (let y = 0; y < 16; y++)
    for (let x = 1; x < 15; x++) {
      const band = x % 4;
      let c = band === 0 ? 0x0d5a1a : band === 2 ? 0x1c7a2b : 0x137025;
      if (r.chance(0.12)) c = mulC(c, 0.85);
      setPx(t, x, y, c);
    }
  for (let i = 0; i < 10; i++) {
    const x = 1 + r.nextInt(14), y = r.nextInt(16);
    setPx(t, x, y, 0xd9d9b0);
  }
  for (let y = 0; y < 16; y++) {
    clear(t, 0, y);
    clear(t, 15, y);
  }
  return t;
};
T['cactus_top'] = () => {
  const t = img();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const e = Math.min(x, y, 15 - x, 15 - y);
      setPx(t, x, y, e === 0 ? 0x0d5a1a : e === 1 ? 0x157026 : (x + y) % 5 === 0 ? 0x2a8c3a : 0x1f7d30);
    }
  return t;
};
T['cactus_bottom'] = () => mottled('cactusbot', [0x9c9565, 0xa9a270, 0xb5ae7b], [1, 3, 1], { cell: 4 });
T['pumpkin_side'] = () => {
  const t = img();
  const r = R('pumpkin');
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const rib = x % 4 === 0 || x === 15;
      let c = rib ? 0xb86a0c : [0xe08a1a, 0xd8801a, 0xe69421][r.nextInt(3)];
      if (y === 0) c = mulC(c, 1.08);
      if (y === 15) c = mulC(c, 0.85);
      setPx(t, x, y, c);
    }
  return t;
};
T['pumpkin_top'] = () => {
  const t = img();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      setPx(t, x, y, d < 2 ? 0x6a8a26 : Math.floor(d) % 3 === 0 ? 0xc47814 : 0xdc8a1c);
    }
  return t;
};
T['carved_pumpkin'] = () => {
  const t = T['pumpkin_side']() as TexImage;
  pattern(t, 3, 4, ['kk    kk', 'kk    kk', '        ', '        ', 'kkkkkkkkk', ' kk kk k ', '  k   k  '], { k: 0x3a1f00 });
  return t;
};
T['jack_o_lantern'] = () => {
  const t = T['pumpkin_side']() as TexImage;
  pattern(t, 3, 4, ['yy    yy', 'yy    yy', '        ', '        ', 'yyyyyyyyy', ' yy yy y ', '  y   y  '], { y: 0xffd54a });
  return t;
};
T['melon_side'] = () => {
  const t = img();
  const r = R('melon');
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const stripe = (x + Math.floor(y / 5)) % 4 < 2;
      let c = stripe ? 0x6e9b1d : 0x8db52a;
      if (r.chance(0.15)) c = mulC(c, 0.88);
      setPx(t, x, y, c);
    }
  return t;
};
T['melon_top'] = () => {
  const t = mottled('melontop', [0x648d1a, 0x71a01f, 0x7fae26, 0x8ebb2f], [1, 3, 3, 1], { cell: 4 });
  rect(t, 6, 6, 4, 4, 0x4f7015);
  return t;
};
T['lily_pad'] = () => {
  const t = img();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 7.6) continue;
      if (x > 7 && Math.abs(y - 7.5) < (x - 7.5) * 0.5) continue; // notch
      const vein = Math.abs(x - y) < 0.6 || Math.abs(x + y - 15) < 0.6;
      setPx(t, x, y, vein ? 0x9a9a9a : d > 6.6 ? 0x6e6e6e : (x * 7 + y * 3) % 5 === 0 ? 0x7e7e7e : 0x8c8c8c);
    }
  return t;
};
T['vine'] = () => {
  const r = R('vine');
  const t = img();
  for (let s = 0; s < 5; s++) {
    let x = r.nextInt(16);
    for (let y = 0; y < 16; y++) {
      if (r.chance(0.8)) plot(t, x, y, PLANT_GRAYS[1 + r.nextInt(3)]);
      if (r.chance(0.35)) plot(t, x + 1, y, PLANT_GRAYS[2]);
      if (r.chance(0.3)) x += r.nextInt(3) - 1;
    }
  }
  return t;
};
T['seagrass'] = () => {
  const t = grassBlades('seagrass', 10, 6, 14, [0x21632a, 0x2e7a35, 0x3b8f40, 0x49a14c]);
  return t;
};
T['tall_seagrass_bottom'] = () => grassBlades('tallseab', 12, 14, 16, [0x21632a, 0x2e7a35, 0x3b8f40, 0x49a14c]);
T['tall_seagrass_top'] = () => grassBlades('tallseat', 9, 6, 15, [0x21632a, 0x2e7a35, 0x3b8f40, 0x49a14c]);
T['kelp'] = () => kelpTex('kelptop', true);
T['kelp_plant'] = () => kelpTex('kelpplant', false);
function kelpTex(seed: string, top: boolean): TexImage {
  const r = R(seed);
  const t = img();
  for (let y = 0; y < 16; y++) {
    if (top && y < 5) continue;
    const x = 7 + Math.round(Math.sin(y * 0.8) * 1.2);
    plot(t, x, y, 0x4a7a1f);
    plot(t, x + 1, y, 0x5b8f28);
    if (y % 4 === 1) {
      plot(t, x - 1, y, 0x6ba332);
      plot(t, x - 2, y - 1, 0x6ba332);
    }
    if (y % 4 === 3) {
      plot(t, x + 2, y, 0x6ba332);
      plot(t, x + 3, y - 1, 0x6ba332);
    }
  }
  void r;
  return t;
}
for (let s = 0; s < 4; s++) {
  T[`sweet_berry_bush_stage${s}`] = () => {
    const r = R('berry' + s);
    const t = img();
    const h = [6, 10, 13, 13][s];
    for (let i = 0; i < 30 + s * 12; i++) {
      const x = 8 + Math.round(r.gaussian() * (2 + s)), y = 15 - r.nextInt(h);
      plot(t, x, y, [0x2e5a2a, 0x386b33, 0x44793b][r.nextInt(3)]);
    }
    if (s >= 2) for (let i = 0; i < (s === 3 ? 7 : 3); i++) plot(t, 3 + r.nextInt(10), 15 - r.nextInt(h), s === 3 ? 0xc0243a : 0x7a8f2a);
    return t;
  };
}
for (let s = 0; s < 8; s++) {
  T[`wheat_stage${s}`] = () => {
    const r = R('wheat' + s);
    const t = img();
    const h = 2 + s * 2;
    const ripe = s === 7;
    for (let b = 0; b < 8; b++) {
      const x = 1 + b * 2;
      for (let k = 0; k < h; k++) {
        const y = 15 - k;
        const isHead = ripe && k >= h - 5;
        const c = isHead ? [0xb89a3c, 0xcfb04c, 0xa3862f][r.nextInt(3)] : s > 4 ? [0x8f9a2c, 0x7a8a24][r.nextInt(2)] : [0x3f8f1c, 0x4fa326][r.nextInt(2)];
        plot(t, x + (k > h / 2 && b % 2 ? 1 : 0), y, c);
      }
    }
    return t;
  };
}

T['torch'] = () => {
  const t = img();
  // stick: cols 7-8, rows 8..15 ; flame rows 5..7
  for (let y = 8; y < 16; y++) {
    plot(t, 7, y, 0x6b5132);
    plot(t, 8, y, 0x4e3a22);
  }
  pattern(t, 7, 6, ['yY', 'Yw'], { y: 0xffd76a, Y: 0xffb728, w: 0xffffe0 });
  plot(t, 7, 7, 0xff8c1a);
  plot(t, 8, 7, 0xffc53d);
  return t;
};
T['cobweb'] = () => {
  const t = img();
  const c = 0xd8d8d8;
  line(t, 0, 0, 15, 15, c);
  line(t, 15, 0, 0, 15, c);
  line(t, 7, 0, 7, 15, c);
  line(t, 0, 7, 15, 7, c);
  for (const r of [3, 6]) {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      plot(t, Math.round(7.5 + Math.cos(ang) * r), Math.round(7.5 + Math.sin(ang) * r), 0xc4c4c4);
    }
  }
  return t;
};
T['ladder'] = () => {
  const t = img();
  for (let y = 0; y < 16; y++) {
    plot(t, 2, y, 0x7a5c33);
    plot(t, 3, y, 0x604627);
    plot(t, 12, y, 0x7a5c33);
    plot(t, 13, y, 0x604627);
  }
  for (const y of [1, 5, 9, 13]) {
    for (let x = 2; x < 14; x++) plot(t, x, y, 0x8f6d3d);
    for (let x = 4; x < 12; x++) plot(t, x, y + 1, 0x5a4124);
  }
  return t;
};

// Utility blocks
function woodFramed(base: TexImage, frame: number): TexImage {
  for (let i = 0; i < 16; i++) {
    setPx(base, i, 0, frame);
    setPx(base, i, 15, frame);
    setPx(base, 0, i, frame);
    setPx(base, 15, i, frame);
  }
  return base;
}
T['crafting_table_top'] = () => {
  const t = planksTex('oakplanks', WOODS.oak);
  woodFramed(t, 0x5b4428);
  for (let i = 1; i < 15; i++) {
    setPx(t, i, 5, 0x5b4428);
    setPx(t, i, 10, 0x5b4428);
    setPx(t, 5, i, 0x5b4428);
    setPx(t, 10, i, 0x5b4428);
  }
  return t;
};
T['crafting_table_side'] = () => {
  const t = planksTex('oakplanks', WOODS.oak);
  rect(t, 0, 0, 16, 3, 0x6b4e2c);
  // saw and hammer silhouettes
  pattern(t, 2, 5, ['  s ', ' sss', 'sss ', 'ss  '], { s: 0xa9a9a9 });
  line(t, 9, 5, 13, 11, 0x5a3e22);
  rect(t, 11, 4, 3, 2, 0x8d8d8d);
  woodFramed(t, 0x4e3920);
  return t;
};
T['crafting_table_front'] = () => {
  const t = planksTex('oakplanks', WOODS.oak);
  rect(t, 0, 0, 16, 3, 0x6b4e2c);
  line(t, 3, 5, 3, 13, 0x5a3e22);
  rect(t, 2, 5, 3, 2, 0x9a9a9a);
  line(t, 8, 12, 13, 6, 0x5a3e22);
  rect(t, 12, 5, 2, 2, 0xa0a0a0);
  woodFramed(t, 0x4e3920);
  return t;
};
T['furnace_side'] = () => {
  const t = stoneBase('furnaceside');
  for (let i = 0; i < 16; i++) {
    setPx(t, i, 0, 0x9a9a9a);
    setPx(t, i, 15, 0x5a5a5a);
  }
  return t;
};
T['furnace_top'] = () => {
  const t = stoneBase('furnacetop');
  for (let i = 0; i < 16; i++) {
    setPx(t, i, 0, 0x9a9a9a); setPx(t, 0, i, 0x9a9a9a);
    setPx(t, i, 15, 0x5a5a5a); setPx(t, 15, i, 0x5a5a5a);
  }
  return t;
};
function furnaceFront(on: boolean): TexImage {
  const t = T['furnace_side']() as TexImage;
  rect(t, 3, 3, 10, 4, 0x4a4a4a);
  rect(t, 4, 4, 8, 2, 0x333333);
  rect(t, 3, 9, 10, 5, 0x3a3a3a);
  rect(t, 4, 10, 8, 3, on ? 0xe0801a : 0x1c1c1c);
  if (on) {
    plot(t, 5, 10, 0xffd04a);
    plot(t, 8, 11, 0xffc03a);
    plot(t, 10, 10, 0xfff080);
  }
  return t;
}
T['furnace_front'] = () => furnaceFront(false);
T['furnace_front_on'] = () => furnaceFront(true);
T['bookshelf'] = () => {
  const t = planksTex('oakplanks', WOODS.oak);
  const r = R('books');
  const cols = [0x8a2a1f, 0x2d4f8a, 0x3f7a2a, 0x7a5a1f, 0x5a2a6a, 0xb08a3a, 0x2a6a6a];
  for (const y0 of [1, 9]) {
    let x = 1;
    while (x < 15) {
      const w = r.chance(0.3) ? 2 : 1;
      const h = 5 + r.nextInt(2);
      const c = cols[r.nextInt(cols.length)];
      for (let i = 0; i < w && x < 15; i++, x++) for (let y = y0 + 6 - h; y < y0 + 6; y++) setPx(t, x, y, i === 0 ? c : mulC(c, 0.8));
      if (r.chance(0.15)) x++;
    }
    for (let x2 = 0; x2 < 16; x2++) setPx(t, x2, y0 + 6, 0x5b4428);
  }
  for (let x = 0; x < 16; x++) {
    setPx(t, x, 0, 0x6b5132);
    setPx(t, x, 15, 0x4e3a22);
  }
  return t;
};
T['glowstone'] = () => {
  const r = R('glowstone');
  const t = img();
  const v = voronoi(r, 16, 16, 12, 2.5);
  for (let i = 0; i < 256; i++) {
    const e = v.f2[i] - v.f1[i];
    const c = e < 0.6 ? 0x8a5a2a : v.f1[i] < 0.9 ? 0xffeeb0 : [0xfcd06a, 0xe8b35a, 0xd9a04a][v.id[i] % 3];
    setPx(t, i % 16, i >> 4, c);
  }
  return t;
};
T['sea_lantern'] = () => {
  const t = mottled('sealantern', [0xa6c4bd, 0xbcd6d0, 0xd2e6e1, 0xe6f3ef], [1, 3, 3, 2], { cell: 4 });
  for (let i = 0; i < 16; i++) {
    setPx(t, i, 0, 0x8fb0a8); setPx(t, i, 15, 0x8fb0a8); setPx(t, 0, i, 0x8fb0a8); setPx(t, 15, i, 0x8fb0a8);
  }
  return t;
};
T['sponge'] = () => {
  const t = mottled('sponge', [0xb8a93a, 0xc9b945, 0xd6c650, 0xe2d35c], [1, 3, 3, 1], { cell: 2 });
  const r = R('spongeholes');
  for (let i = 0; i < 16; i++) setPx(t, r.nextInt(16), r.nextInt(16), 0x8f7f22);
  return t;
};
T['hay_block_side'] = () => {
  const t = img();
  const r = R('hay');
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      let c = [0xb89a2a, 0xc9a936, 0xd6b843, 0xa68a22][r.nextInt(4)];
      if (y === 3 || y === 12) c = 0x8a3a1a;
      setPx(t, x, y, c);
    }
  return t;
};
T['hay_block_top'] = () => mottled('haytop', [0x9e8520, 0xb2962a, 0xc5a735, 0xd6b843], [1, 3, 3, 2], { cell: 2, white: 0.6 });
T['tnt_side'] = () => {
  const t = img();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const band = y >= 5 && y <= 10;
      setPx(t, x, y, band ? 0xe8e8e8 : x % 4 === 3 ? 0xa3251b : 0xd13a2c);
    }
  pattern(t, 2, 6, ['kkk k  k kkk', ' k  kk k  k ', ' k  k kk  k ', ' k  k  k  k '], { k: 0x202020 });
  return t;
};
T['tnt_top'] = () => {
  const t = fill(img(), 0xd13a2c);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + y) % 5 === 0) setPx(t, x, y, 0xb02e22);
  rect(t, 6, 6, 4, 4, 0x3a3a3a);
  return t;
};
T['tnt_bottom'] = () => fill(img(), 0xb52f24);
T['chest_top'] = () => woodFramed(planksTex('chestwood', WOODS.oak), 0x3a2812);
T['chest_side'] = () => woodFramed(planksTex('chestwood2', WOODS.oak), 0x3a2812);
T['chest_front'] = () => woodFramed(planksTex('chestwood3', WOODS.oak), 0x3a2812);
T['chest_bottom'] = () => woodFramed(planksTex('chestwood4', WOODS.oak), 0x3a2812);
T['chest_lid_side'] = () => woodFramed(planksTex('chestwood5', WOODS.oak), 0x3a2812);
T['chest_lid_front'] = () => woodFramed(planksTex('chestwood6', WOODS.oak), 0x3a2812);
T['chest_latch'] = () => fill(img(), 0xb8b8b8);
T['spawner'] = () => {
  const t = img();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) if (x % 5 === 0 || y % 5 === 0 || x === 15 || y === 15) setPx(t, x, y, (x + y) % 3 ? 0x2a3a4a : 0x1a2530);
  return t;
};

// Wool / terracotta / concrete
const woolBase = (() => {
  const r = R('wool');
  const t = img();
  // curly weave: two diagonal wave fields
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const a = Math.sin((x + y) * 0.9) + Math.sin((x - y) * 0.9 + 1.3) * 0.7;
      const n = r.next() * 0.6;
      setPx(t, x, y, gray(200 + (a + n) * 14));
    }
  return t;
})();
for (const [c, col] of Object.entries(DYE)) {
  T[`${c}_wool`] = () => {
    const t = cloneImg(woolBase);
    mapPixels(t, (_x, _y, px) => tintC(px, col.wool));
    return t;
  };
  T[`${c}_terracotta`] = () => mottled(c + 'tc', [mulC(col.terracotta, 0.92), mulC(col.terracotta, 0.97), col.terracotta, mulC(col.terracotta, 1.03)], [1, 3, 3, 1], { cell: 4, white: 0.35 });
  T[`${c}_concrete`] = () => mottled(c + 'cc', [mulC(col.concrete, 0.97), col.concrete, mulC(col.concrete, 1.02)], [1, 5, 1], { cell: 4, white: 0.2 });
}
T['terracotta'] = () => mottled('terracotta', [0x8c563d, 0x935a40, 0x985e43, 0x9d6246, 0xa3674b], [1, 3, 5, 3, 1], { cell: 4, white: 0.35 });

// Missing texture (vanilla's magenta/black checkerboard)
T['missing'] = () => {
  const t = img();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(t, x, y, (x < 8) !== (y < 8) ? 0xf800f8 : 0x000000);
  return t;
};

export { flipH, packRGB, rgbOf };
