// Environment textures: sun, moon phases, clouds, rain/snow, destroy stages.

import { TexImage, img, setPx, plot, mulC, mixC, Rand } from './tex';

export function sunTexture(): TexImage {
  // 32x32, bright square in the middle (additively blended over the sky)
  const t = img(32, 32);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const dx = Math.abs(x - 15.5), dy = Math.abs(y - 15.5);
      const d = Math.max(dx, dy);
      if (d < 8) {
        // core
        const edge = d > 6.5;
        const c = edge ? 0xfff6a8 : 0xfffce8;
        setPx(t, x, y, c, 255);
      } else if (d < 10) {
        setPx(t, x, y, 0x5a4a14, 255);
      } else {
        setPx(t, x, y, 0x000000, 255);
      }
    }
  return t;
}

export function moonTexture(): TexImage {
  // 4x2 phases of 32x32 = 128x64 ; black background (additive)
  const t = img(128, 64);
  for (let i = 0; i < t.data.length; i += 4) t.data[i + 3] = 255;
  const r = new Rand(4242);
  const craters: [number, number, number][] = [];
  for (let i = 0; i < 7; i++) craters.push([10 + r.nextInt(12), 10 + r.nextInt(12), 1 + r.nextInt(2)]);
  for (let phase = 0; phase < 8; phase++) {
    const ox = (phase % 4) * 32, oy = Math.floor(phase / 4) * 32;
    // phase 0 full, 4 new; lit fraction
    const k = phase <= 4 ? phase / 4 : (8 - phase) / 4; // 0 full .. 1 new
    const waxing = phase > 4;
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const dx = x - 15.5, dy = y - 15.5;
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= 8) continue;
        // terminator: shadow sweeps across
        const nx = (dx + 8) / 16; // 0..1 across disk
        let lit: boolean;
        if (k === 0) lit = true;
        else if (k === 1) lit = false;
        else lit = waxing ? nx > k : nx < 1 - k;
        let c = 0xd8dcd8;
        for (const [cx, cy, cr] of craters) if (Math.abs(x - cx - 4) <= cr && Math.abs(y - cy - 4) <= cr) c = 0xaeb3ae;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 6.5) c = mulC(c, 0.88);
        if (!lit) c = mulC(c, 0.06);
        setPx(t, ox + x, oy + y, c, 255);
      }
  }
  return t;
}

/** Cloud map 256x256: white = cloud. Blobby clusters like vanilla's clouds.png. */
export function cloudTexture(): Uint8Array {
  const S = 256;
  const r = new Rand(0xc10d);
  const out = new Uint8Array(S * S);
  // value noise on a coarse periodic grid, thresholded
  const g = 32;
  const grid = new Float32Array(g * g);
  for (let i = 0; i < grid.length; i++) grid[i] = r.next();
  const g2 = 64;
  const grid2 = new Float32Array(g2 * g2);
  for (let i = 0; i < grid2.length; i++) grid2[i] = r.next();
  const sample = (gr: Float32Array, n: number, x: number, y: number) => {
    const fx = (x / S) * n, fy = (y / S) * n;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const a = gr[(iy % n) * n + (ix % n)], b = gr[(iy % n) * n + ((ix + 1) % n)];
    const c = gr[((iy + 1) % n) * n + (ix % n)], d = gr[((iy + 1) % n) * n + ((ix + 1) % n)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const v = sample(grid, g, x, y) * 0.7 + sample(grid2, g2, x, y) * 0.3;
      out[y * S + x] = v > 0.6 ? 1 : 0;
    }
  return out;
}

export function destroyStages(): TexImage[] {
  const stages: TexImage[] = [];
  const r = new Rand(0xde57);
  // crack paths grow with each stage
  const paths: [number, number][][] = [];
  for (let p = 0; p < 7; p++) {
    let x = 4 + r.nextInt(8), y = 4 + r.nextInt(8);
    const pts: [number, number][] = [];
    const dirx = r.nextInt(3) - 1 || 1, diry = r.nextInt(3) - 1;
    for (let s = 0; s < 14; s++) {
      pts.push([x, y]);
      x += r.chance(0.6) ? dirx : r.nextInt(3) - 1;
      y += r.chance(0.5) ? diry : r.nextInt(3) - 1;
      x = Math.max(0, Math.min(15, x));
      y = Math.max(0, Math.min(15, y));
    }
    paths.push(pts);
  }
  for (let s = 0; s < 10; s++) {
    const t = img(16, 16);
    const len = Math.floor(((s + 1) / 10) * 14);
    const np = Math.min(paths.length, 1 + Math.floor(s * 0.7));
    for (let p = 0; p < np; p++) {
      for (let i = 0; i < len; i++) {
        const [x, y] = paths[p][i];
        plot(t, x, y, 0x000000, 150 + Math.min(100, s * 10));
      }
    }
    stages.push(t);
  }
  return stages;
}

export function rainTexture(): TexImage {
  // 64x256 streaks (vanilla rain.png layout: 4 columns of drops)
  const t = img(64, 256);
  const r = new Rand(0x7a1a);
  for (let i = 0; i < 90; i++) {
    const x = r.nextInt(64), y = r.nextInt(256), len = 6 + r.nextInt(10);
    for (let k = 0; k < len; k++) plot(t, x, (y + k) % 256, mixC(0x5577cc, 0xaabbee, k / len), 150 + Math.floor((k / len) * 80));
  }
  return t;
}

export function snowTexture(): TexImage {
  const t = img(64, 256);
  const r = new Rand(0x5a0);
  for (let i = 0; i < 220; i++) {
    const x = r.nextInt(63), y = r.nextInt(255);
    plot(t, x, y, 0xffffff, 230);
    if (r.chance(0.5)) plot(t, x + 1, y, 0xeef4ff, 200);
    if (r.chance(0.3)) plot(t, x, y + 1, 0xe6eeff, 180);
  }
  return t;
}
