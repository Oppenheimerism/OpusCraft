// Cave blocks: glow lichen (vanilla block/glow_lichen: a crust of small rounded
// pale sea-green lobes, darker at the rims, with bright glowing specks, on a
// transparent background; the lobes wrap round the edges so sheets tile) and
// the amethyst geode blocks.

import { TexImage, img, setPx, whiteNoise, valueNoise, voronoi, Rand } from '../tex';
import { N } from './core';

const LICHEN = [0x3e5f55, 0x537a6b, 0x6b9483, 0x86ad9a, 0xa4c8b4, 0xd2ecdc];

export function glowLichen(): TexImage {
  const t = img();
  const r = new Rand(0x5eed01, 3);
  const lobes: [number, number, number][] = [];
  for (let i = 0; i < 24; i++) lobes.push([r.nextFloat() * N, r.nextFloat() * N, 1.5 + r.nextFloat() * 1.3]);
  const speck = whiteNoise(r, N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // distance to the nearest lobe centre, as a fraction of its radius
      let d = Infinity;
      for (const [cx, cy, rad] of lobes) {
        let dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy);
        dx = Math.min(dx, N - dx);
        dy = Math.min(dy, N - dy);
        d = Math.min(d, Math.hypot(dx, dy) / rad);
      }
      if (d > 1) continue;
      const n = speck[y * N + x];
      let k = d > 0.78 ? 1 : d > 0.5 ? 2 : d > 0.25 ? 3 : 4;
      if (n > 0.8) k++;
      else if (n < 0.15) k--;
      setPx(t, x, y, LICHEN[Math.max(0, Math.min(5, k))]);
    }
  return t;
}

// ---------------------------------------------------------------------------
// Amethyst (vanilla block/amethyst_block, budding_amethyst, the four bud stages)
// and the geode's outer shell (smooth_basalt), plus tinted glass

const AME = [0x3f2a69, 0x54398a, 0x684aa8, 0x7a5bb8, 0x8b69c9, 0x9d7ad8, 0xb28fe8, 0xcfa8f6, 0xe9d2ff];

/** crystal facets: flat voronoi cells, each tilted towards a random side, with a bright rim on the edges facing the light (up-left) and a dark one opposite */
function amethystFacets(seed: number): number[] {
  const r = new Rand(seed, 3);
  const v = voronoi(r, N, N, 7, 4.5);
  const base = v.pts.map(() => 3 + r.nextInt(3));
  const tilt = v.pts.map(() => {
    const a = r.nextFloat() * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)];
  });
  const id = (x: number, y: number) => v.id[((y + N) % N) * N + ((x + N) % N)];
  const tone = new Array<number>(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x, c = v.id[i];
      const [px, py] = v.pts[c];
      let dx = x + 0.5 - px, dy = y + 0.5 - py;
      if (dx > N / 2) dx -= N;
      if (dx < -N / 2) dx += N;
      if (dy > N / 2) dy -= N;
      if (dy < -N / 2) dy += N;
      let k = base[c] + Math.round((dx * tilt[c][0] + dy * tilt[c][1]) / 3);
      const lit = id(x, y - 1) !== c || id(x - 1, y) !== c;
      const shaded = id(x, y + 1) !== c || id(x + 1, y) !== c;
      if (v.f2[i] - v.f1[i] < 0.9) k = lit && !shaded ? 7 : shaded && !lit ? 1 : k;
      tone[i] = Math.max(0, Math.min(AME.length - 1, k));
    }
  return tone;
}

export function amethystBlock(): TexImage {
  const t = img();
  const tone = amethystFacets(0xa3e7);
  for (let i = 0; i < N * N; i++) setPx(t, i % N, (i / N) | 0, AME[tone[i]]);
  return t;
}

export function buddingAmethyst(): TexImage {
  const t = img();
  const tone = amethystFacets(0xb0dd);
  for (let i = 0; i < N * N; i++) setPx(t, i % N, (i / N) | 0, AME[tone[i]]);
  // sockets the buds grow from: dark pits with a pale crystal glinting inside
  const pits: [number, number, number][] = [[3, 3, 1], [11, 2, 0], [7, 8, 1], [13, 10, 0], [2, 12, 0], [9, 13, 1]];
  for (const [x, y, big] of pits) {
    const cells = big ? [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]] : [[0, 0], [1, 0], [0, 1], [1, 1]];
    for (const [dx, dy] of cells) setPx(t, (x + dx + N) % N, (y + dy + N) % N, AME[0]);
    setPx(t, x, y, AME[7]);
    setPx(t, (x + 1) % N, (y + 1) % N, AME[1]);
  }
  return t;
}

/** one crystal: a prism leaning from its base, light face on the left, dark on the right, bright tip */
function crystal(t: TexImage, bx: number, height: number, halfW: number, lean: number): void {
  const top = 16 - height;
  for (let y = 15; y >= top; y--) {
    const h = (15 - y) / Math.max(1, height - 1); // 0 at the base, 1 at the tip
    const cx = bx + lean * (15 - y);
    const w = h > 0.62 ? halfW * Math.max(0.15, (1 - h) / 0.38) : halfW;
    for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w) - 1; x++) {
      if (x < 0 || x > 15) continue;
      const u = (x + 0.5 - cx) / Math.max(0.5, w); // -1 left edge .. 1 right edge
      if (Math.abs(u) > 1.05) continue;
      let k = u < -0.55 ? 7 : u < 0 ? 6 : u < 0.55 ? 4 : 2;
      if (h > 0.8) k = Math.min(8, k + 2);
      else if (y === 15) k = Math.max(1, k - 2);
      setPx(t, x, y, AME[k]);
    }
  }
}

/** [base x, height, half width, lean] per crystal, drawn back to front */
const BUDS: Record<string, [number, number, number, number][]> = {
  small_amethyst_bud: [[6, 3, 1.2, -0.3], [10, 4, 1.3, 0.25], [8, 6, 1.6, 0]],
  medium_amethyst_bud: [[4.5, 5, 1.3, -0.35], [11.5, 5, 1.3, 0.35], [8, 8, 2, 0]],
  large_amethyst_bud: [[3.5, 6, 1.4, -0.4], [12.5, 7, 1.4, 0.4], [6, 9, 1.7, -0.15], [10, 8, 1.7, 0.15], [8, 11, 2.1, 0]],
  amethyst_cluster: [[2.5, 7, 1.4, -0.45], [13.5, 8, 1.4, 0.45], [5, 11, 1.8, -0.25], [11, 10, 1.8, 0.25], [8, 14, 2.3, 0]],
};

export function amethystBud(name: string): TexImage {
  const t = img();
  for (const [x, h, w, lean] of BUDS[name]) crystal(t, x, h, w, lean);
  return t;
}

export function smoothBasalt(): TexImage {
  const t = img();
  const r = new Rand(0xba5a17, 3);
  const f = valueNoise(r, N, N, 8), g = valueNoise(r, N, N, 4), s = whiteNoise(r, N, N);
  const PAL = [0x3a3a3f, 0x414146, 0x47474d, 0x4d4e54, 0x54555b, 0x5c5d63];
  for (let i = 0; i < N * N; i++) {
    const v = f[i] * 0.45 + g[i] * 0.35 + s[i] * 0.2;
    setPx(t, i % N, (i / N) | 0, PAL[Math.max(0, Math.min(5, Math.floor((v - 0.2) * 9)))]);
  }
  return t;
}

export function tintedGlass(): TexImage {
  const t = img();
  const r = new Rand(0x7147ed, 3);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      if (edge) setPx(t, x, y, x === 0 || y === 0 ? 0x4c4553 : 0x2f2a35, 225);
      else setPx(t, x, y, r.nextFloat() < 0.15 ? 0x2c2731 : 0x28232d, 170);
    }
  for (const [x, y] of [[3, 2], [2, 3], [4, 2], [2, 4], [5, 3], [3, 5], [11, 13], [12, 12], [13, 11]]) setPx(t, x, y, 0x4a4351, 200);
  return t;
}
