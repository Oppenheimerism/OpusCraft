// Time-of-day / sky / fog color math following vanilla's formulas.

import { clamp } from '../core/math';

/** Celestial angle 0..1 from day time (ticks). */
export function timeOfDay(dayTime: number): number {
  const d0 = frac(dayTime / 24000 - 0.25);
  const d1 = 0.5 - Math.cos(d0 * Math.PI) / 2;
  return (d0 * 2 + d1) / 3;
}

function frac(v: number): number {
  return v - Math.floor(v);
}

export function moonPhase(dayTime: number): number {
  return ((Math.floor(dayTime / 24000) % 8) + 8) % 8;
}

export interface Weather {
  rain: number; // 0..1
  thunder: number; // 0..1
  flash: number; // lightning flash ticks remaining
}

export type RGB = [number, number, number];

export function rgb24(c: number): RGB {
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
}

const GAUSSIAN_KERNEL = [0, 1, 4, 6, 4, 1, 0];

/**
 * vanilla CubicSampler.gaussianSampleVec3 over the biome colours round a camera at (x, y, z): the fog and
 * sky colours of the 6×6×6 quarts about it, weighted so they fade smoothly from one biome to the next
 */
export function blendBiomeColors(x: number, y: number, z: number, quartColors: (qx: number, qy: number, qz: number) => { fog: number; sky: number }): { fog: RGB; sky: RGB } {
  const vx = (x - 2) * 0.25, vy = (y - 2) * 0.25, vz = (z - 2) * 0.25;
  const i = Math.floor(vx), j = Math.floor(vy), k = Math.floor(vz);
  const dx = vx - i, dy = vy - j, dz = vz - k;
  let total = 0, fr = 0, fg = 0, fb = 0, sr = 0, sg = 0, sb = 0;
  for (let l = 0; l < 6; l++) {
    const wx = GAUSSIAN_KERNEL[l + 1] + (GAUSSIAN_KERNEL[l] - GAUSSIAN_KERNEL[l + 1]) * dx;
    for (let m = 0; m < 6; m++) {
      const wy = GAUSSIAN_KERNEL[m + 1] + (GAUSSIAN_KERNEL[m] - GAUSSIAN_KERNEL[m + 1]) * dy;
      for (let n = 0; n < 6; n++) {
        const wz = GAUSSIAN_KERNEL[n + 1] + (GAUSSIAN_KERNEL[n] - GAUSSIAN_KERNEL[n + 1]) * dz;
        const w = wx * wy * wz;
        if (w === 0) continue;
        const c = quartColors(i - 2 + l, j - 2 + m, k - 2 + n);
        total += w;
        fr += ((c.fog >> 16) & 255) * w;
        fg += ((c.fog >> 8) & 255) * w;
        fb += (c.fog & 255) * w;
        sr += ((c.sky >> 16) & 255) * w;
        sg += ((c.sky >> 8) & 255) * w;
        sb += (c.sky & 255) * w;
      }
    }
  }
  const k255 = 1 / (total * 255);
  return { fog: [fr * k255, fg * k255, fb * k255], sky: [sr * k255, sg * k255, sb * k255] };
}

/** Sky color (0..1 rgb) from the (blended) biome sky color. */
export function skyColor(biomeSky: RGB, tod: number, w: Weather, partial = 0): [number, number, number] {
  let f1 = Math.cos(tod * Math.PI * 2) * 2 + 0.5;
  f1 = clamp(f1, 0, 1);
  let r = biomeSky[0] * f1;
  let g = biomeSky[1] * f1;
  let b = biomeSky[2] * f1;
  if (w.rain > 0) {
    const f6 = (r * 0.3 + g * 0.59 + b * 0.11) * 0.6;
    const f7 = 1 - w.rain * 0.75;
    r = r * f7 + f6 * (1 - f7);
    g = g * f7 + f6 * (1 - f7);
    b = b * f7 + f6 * (1 - f7);
  }
  if (w.thunder > 0) {
    const f10 = (r * 0.3 + g * 0.59 + b * 0.11) * 0.2;
    const f8 = 1 - w.thunder * 0.75;
    r = r * f8 + f10 * (1 - f8);
    g = g * f8 + f10 * (1 - f8);
    b = b * f8 + f10 * (1 - f8);
  }
  if (w.flash > 0) {
    let f11 = w.flash - partial;
    if (f11 > 1) f11 = 1;
    f11 *= 0.45;
    r = r * (1 - f11) + 0.8 * f11;
    g = g * (1 - f11) + 0.8 * f11;
    b = b * (1 - f11) + 1.0 * f11;
  }
  return [r, g, b];
}

export function cloudColor(tod: number, w: Weather): [number, number, number] {
  let f1 = Math.cos(tod * Math.PI * 2) * 2 + 0.5;
  f1 = clamp(f1, 0, 1);
  let r = 1, g = 1, b = 1;
  if (w.rain > 0) {
    const f6 = (r * 0.3 + g * 0.59 + b * 0.11) * 0.6;
    const f7 = 1 - w.rain * 0.95;
    r = r * f7 + f6 * (1 - f7);
    g = g * f7 + f6 * (1 - f7);
    b = b * f7 + f6 * (1 - f7);
  }
  r *= f1 * 0.9 + 0.1;
  g *= f1 * 0.9 + 0.1;
  b *= f1 * 0.85 + 0.15;
  if (w.thunder > 0) {
    const f10 = (r * 0.3 + g * 0.59 + b * 0.11) * 0.2;
    const f8 = 1 - w.thunder * 0.95;
    r = r * f8 + f10 * (1 - f8);
    g = g * f8 + f10 * (1 - f8);
    b = b * f8 + f10 * (1 - f8);
  }
  return [r, g, b];
}

/** Sunrise/sunset fan color (rgba) or null. */
export function sunriseColor(tod: number): [number, number, number, number] | null {
  const f1 = Math.cos(tod * Math.PI * 2);
  if (f1 >= -0.4 && f1 <= 0.4) {
    const f3 = (f1 / 0.4) * 0.5 + 0.5;
    let f4 = 1 - (1 - Math.sin(f3 * Math.PI)) * 0.99;
    f4 *= f4;
    return [f3 * 0.3 + 0.7, f3 * f3 * 0.7 + 0.2, 0.2, f4];
  }
  return null;
}

export function starBrightness(tod: number): number {
  let f1 = 1 - (Math.cos(tod * Math.PI * 2) * 2 + 0.25);
  f1 = clamp(f1, 0, 1);
  return f1 * f1 * 0.5;
}

/** Sky darkening factor (0.2..1) used by the lightmap. */
export function skyDarken(tod: number, w: Weather): number {
  let f1 = 1 - (Math.cos(tod * Math.PI * 2) * 2 + 0.2);
  f1 = clamp(f1, 0, 1);
  f1 = 1 - f1;
  f1 *= 1 - (w.rain * 5) / 16;
  f1 *= 1 - (w.thunder * 5) / 16;
  return f1 * 0.8 + 0.2;
}

/** Vanilla "skyDarken" as integer (for mob spawning / F3 "sky light" subtraction). */
export function skyDarkenInt(tod: number, w: Weather): number {
  const d0 = 1 - (w.rain * 5) / 16;
  const d1 = 1 - (w.thunder * 5) / 16;
  const d2 = 0.5 + 2 * clamp(Math.cos(tod * Math.PI * 2), -0.25, 0.25);
  return Math.floor((1 - d2 * d0 * d1) * 11);
}

/**
 * Fog color (vanilla FogRenderer.setupColor, out of any fluid).
 * lookDir: camera look vector; sunAngle: tod*2π. `darkens`: the fog dims with the daylight (vanilla
 * getBrightnessDependentFogColor: the Overworld's does, the Nether's doesn't, the End's is 0.15 of the
 * biome's); below `minY` + 32 it fades to black towards the void.
 */
export function fogColor(
  biomeFog: RGB, biomeSky: RGB, tod: number, w: Weather, renderDistanceChunks: number,
  lookX: number, lookY: number, lookZ: number, camY: number, darkens: boolean | 'daylight' | 'constant' | number = true, minY = -64,
): [number, number, number] {
  const brightness = clamp(Math.cos(tod * Math.PI * 2) * 2 + 0.5, 0, 1);
  let fr = biomeFog[0], fg = biomeFog[1], fb = biomeFog[2];
  if (darkens === true || darkens === 'daylight') {
    fr *= brightness * 0.94 + 0.06;
    fg *= brightness * 0.94 + 0.06;
    fb *= brightness * 0.91 + 0.09;
  } else if (typeof darkens === 'number') {
    fr *= darkens;
    fg *= darkens;
    fb *= darkens;
  }
  const sky = skyColor(biomeSky, tod, w);
  let f = 0.25 + (0.75 * renderDistanceChunks) / 32;
  f = 1 - Math.pow(f, 0.25);
  if (renderDistanceChunks >= 4) {
    const sunAngle = tod * Math.PI * 2;
    const sx = Math.sin(sunAngle) > 0 ? -1 : 1;
    let dot = lookX * sx + lookY * 0 + lookZ * 0;
    if (dot < 0) dot = 0;
    if (dot > 0) {
      const sr = sunriseColor(tod);
      if (sr) {
        dot *= sr[3];
        fr = fr * (1 - dot) + sr[0] * dot;
        fg = fg * (1 - dot) + sr[1] * dot;
        fb = fb * (1 - dot) + sr[2] * dot;
      }
    }
  }
  fr += (sky[0] - fr) * f;
  fg += (sky[1] - fg) * f;
  fb += (sky[2] - fb) * f;
  if (w.rain > 0) {
    const m = 1 - w.rain * 0.5;
    const m2 = 1 - w.rain * 0.4;
    fr *= m;
    fg *= m;
    fb *= m2;
  }
  if (w.thunder > 0) {
    const m = 1 - w.thunder * 0.5;
    fr *= m;
    fg *= m;
    fb *= m;
  }
  // void darkening deep underground
  let d0 = (camY - minY) * 0.03125;
  if (d0 < 1) {
    if (d0 < 0) d0 = 0;
    d0 *= d0;
    fr *= d0;
    fg *= d0;
    fb *= d0;
  }
  return [fr, fg, fb];
}
