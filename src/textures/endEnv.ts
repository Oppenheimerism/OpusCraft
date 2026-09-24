// The End's environment textures (vanilla textures/environment/end_sky.png and
// textures/entity/end_portal.png): the grey static the End's sky box is tiled
// with (and the end portal's base layer), and the field of specks the end
// portal's drifting layers are cut from.

import { TexImage, img, valueNoise, Rand } from './tex';

function px(t: TexImage, x: number, y: number, r: number, g: number, b: number): void {
  const i = (((y + t.h) % t.h) * t.w + ((x + t.w) % t.w)) * 4;
  t.data[i] = Math.max(t.data[i], r);
  t.data[i + 1] = Math.max(t.data[i + 1], g);
  t.data[i + 2] = Math.max(t.data[i + 2], b);
  t.data[i + 3] = 255;
}

/** 128x128 grainy grey static, seamless (the sky box repeats it 16 times across each face) */
export function endSkyTexture(): TexImage {
  const S = 128;
  const r = new Rand(0x5e4d51, 11);
  const a = valueNoise(r, S, S, 16), b = valueNoise(r, S, S, 8), c = valueNoise(r, S, S, 4);
  const t = img(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = 0.3 * a[i] + 0.25 * b[i] + 0.15 * c[i] + 0.3 * r.next();
    const g = Math.max(0, Math.min(255, Math.round((0.18 + v * 0.95) * 255)));
    t.data[i * 4] = t.data[i * 4 + 1] = t.data[i * 4 + 2] = g;
    t.data[i * 4 + 3] = 255;
  }
  return t;
}

/** 256x256 black scattered with specks of light, mostly single pixels, a few larger; seamless */
export function endPortalTexture(): TexImage {
  const S = 256;
  const r = new Rand(0xe4d9a1, 7);
  const t = img(S, S);
  for (let i = 3; i < t.data.length; i += 4) t.data[i] = 255;
  for (let n = 0; n < 1900; n++) {
    const x = r.nextInt(S), y = r.nextInt(S);
    const v = 0.3 + 0.7 * r.next() * r.next();
    // most specks are white; some lean cyan or green
    const k = r.next();
    const tr = k < 0.7 ? 1 : k < 0.85 ? 0.55 : 0.7, tg = 1, tb = k < 0.7 ? 1 : k < 0.85 ? 1 : 0.6;
    const cr = Math.round(255 * v * tr), cg = Math.round(255 * v * tg), cb = Math.round(255 * v * tb);
    px(t, x, y, cr, cg, cb);
    const s = r.next();
    if (s < 0.12) px(t, x + 1, y, cr, cg, cb);
    else if (s < 0.24) px(t, x, y + 1, cr, cg, cb);
    else if (s < 0.3) {
      px(t, x + 1, y, cr, cg, cb);
      px(t, x, y + 1, cr, cg, cb);
      px(t, x + 1, y + 1, cr, cg, cb);
    }
  }
  return t;
}

/**
 * 16x16 (vanilla textures/entity/end_gateway_beam.png): the streaks an end gateway's beam is drawn with, light
 * greys running along it (the beam tints them magenta or purple and scrolls them up), half see-through for its glow
 */
export function endGatewayBeamTexture(): TexImage {
  const S = 16;
  const r = new Rand(0x9a7e3b, 5);
  const cols = valueNoise(r, S, 1, 3, 1), streaks = valueNoise(r, S, S, 1, 6), grain = valueNoise(r, S, S, 1, 2);
  const t = img(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const v = 0.6 * cols[x] + 0.3 * streaks[i] + 0.1 * grain[i];
      const g = Math.round((0.68 + 0.32 * v) * 255);
      t.data[i * 4] = t.data[i * 4 + 1] = t.data[i * 4 + 2] = g;
      t.data[i * 4 + 3] = Math.round((0.45 + 0.55 * v) * 255);
    }
  return t;
}
