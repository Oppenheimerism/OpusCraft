// (the beacon) The beacon's own textures: its heart (vanilla textures/block/beacon.png), a pale aqua crystal glowing
// white from the middle out, with a darker rim and a glint along its diagonals, seen through the glass case; and its
// beam (vanilla textures/entity/beacon_beam.png), near-white streaks running up it that the beam's colour tints and
// that scroll up as it turns (the glow round it showing them faint, by their alpha).

import { TexImage, img, valueNoise, Rand } from './tex';

function put(t: TexImage, i: number, r: number, g: number, b: number, a = 255): void {
  t.data[i * 4] = Math.max(0, Math.min(255, Math.round(r)));
  t.data[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(g)));
  t.data[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(b)));
  t.data[i * 4 + 3] = a;
}

/** 16x16: the beacon's heart */
export function beaconBlockTexture(): TexImage {
  const S = 16;
  const r = new Rand(0xbeac0, 3);
  const grain = valueNoise(r, S, S, 1, 4);
  const t = img(S, S);
  // (rim to middle: deep aqua, pale aqua, near white)
  const rim = [0x3f, 0xb8, 0xb0], mid = [0x9c, 0xf2, 0xe8], core = [0xf4, 0xff, 0xfd];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) / 7.5;
      const k = d < 0.55 ? 0 : (d - 0.55) / 0.45;
      const m = d < 0.55 ? d / 0.55 : 1;
      let c = [0, 1, 2].map((j) => core[j] + (mid[j] - core[j]) * m);
      c = c.map((v, j) => v + (rim[j] - v) * k * k);
      // the outermost ring darker still, a glint along the diagonals
      if (d > 0.9) c = c.map((v) => v * 0.78);
      if (x === y || x === S - 1 - y) c = c.map((v) => v + (255 - v) * 0.45 * (1 - d));
      const n = (grain[i] - 0.5) * 18;
      put(t, i, c[0] + n, c[1] + n, c[2] + n);
    }
  return t;
}

/** 16x16: the beam's streaks, near white, half to fully opaque */
export function beaconBeamTexture(): TexImage {
  const S = 16;
  const r = new Rand(0xbea3, 5);
  const cols = valueNoise(r, S, 1, 4, 1), streaks = valueNoise(r, S, S, 1, 5), grain = valueNoise(r, S, S, 1, 2);
  const t = img(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const v = 0.55 * cols[x] + 0.3 * streaks[i] + 0.15 * grain[i];
      const g = (0.8 + 0.2 * v) * 255;
      put(t, i, g, g, g, Math.round((0.5 + 0.5 * v) * 255));
    }
  return t;
}
