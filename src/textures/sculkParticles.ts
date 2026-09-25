// The deep dark's particle sprites, drawn in code: the vibration (vanilla particle/vibration), the shriek's ring
// (shriek), a sculk charge's glow shrinking away (sculk_charge_0..6), its pop as it's spent (sculk_charge_pop_0..3)
// and the sculk soul that rises from a blooming catalyst (sculk_soul_0..10), all in sculk's cold teal; and (M4) the
// ring of a warden's sonic boom (sonic_boom_0..15).

import { TexImage, img, plot, pattern, Rand } from './tex';

/** sculk's teals, darkest to brightest */
const DEEP = 0x075f66, TEAL = 0x0e8f99, CYAN = 0x2bc9d3, PALE = 0x8ff1f5, GLOW = 0xd9ffff;

/** vanilla vibration: a small rhombus, bright at its heart (the particle turns edge-on as it rolls) */
function vibration(): TexImage {
  const t = img(8, 8);
  pattern(t, 0, 0, [
    '...dd...',
    '..dccd..',
    '.dcppcd.',
    'dcpWWpcd',
    'dcpWWpcd',
    '.dcppcd.',
    '..dccd..',
    '...dd...',
  ], { d: TEAL, c: CYAN, p: PALE, W: GLOW });
  return t;
}

/** vanilla shriek: a thin ring, pale at its rim and deeper on the inside */
function shriek(): TexImage {
  const t = img(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 7.6 || d < 5.4) continue;
      plot(t, x, y, d > 6.9 ? PALE : d > 6.2 ? GLOW : CYAN);
    }
  return t;
}

/** vanilla sculk_charge_i: a glow on the sculk's face, smaller and dimmer frame by frame */
function sculkCharge(i: number): TexImage {
  const t = img(8, 8);
  const r = new Rand(0x5c0c + i);
  const rx = 3.4 - i * 0.42, ry = 2.4 - i * 0.3;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const d = Math.hypot((x - 3.5) / Math.max(0.6, rx), (y - 3.5) / Math.max(0.6, ry));
      if (d > 1 || (d > 0.7 && r.nextFloat() < 0.25 + i * 0.05)) continue;
      const c = d < 0.35 ? (i < 3 ? GLOW : PALE) : d < 0.7 ? (i < 5 ? PALE : CYAN) : CYAN;
      plot(t, x, y, c);
    }
  if (rx < 0.9) plot(t, 3, 3, i < 6 ? PALE : CYAN);
  return t;
}

/** vanilla sculk_charge_pop_i: a spent charge popping, a bright dot bursting into a thinning ring */
function sculkChargePop(i: number): TexImage {
  const t = img(8, 8);
  const r = new Rand(0x9e9 + i);
  if (i === 0) {
    pattern(t, 0, 0, ['........', '........', '...cc...', '..cWWc..', '..cWWc..', '...cc...', '........', '........'], { c: CYAN, W: GLOW });
    return t;
  }
  const radius = 0.9 + i * 0.95;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const d = Math.hypot(x - 3.5, y - 3.5);
      if (Math.abs(d - radius) > 0.55 || (i === 3 && r.nextFloat() < 0.45)) continue;
      plot(t, x, y, i === 1 ? PALE : i === 2 ? CYAN : TEAL);
    }
  return t;
}

/** the soul's face at its fullest: a rounded head over a wisp of a tail, hollow eyes and an open mouth */
const SOUL_FACE = [
  '................',
  '.....dddddd.....',
  '....dccccccd....',
  '...dcppppppcd...',
  '..dcpWWppWWpcd..',
  '..dcp..pp..pcd..',
  '..dcp..pp..pcd..',
  '..dcpppWWpppcd..',
  '..dcpp....ppcd..',
  '...dcp....pcd...',
  '...dcppppppcd...',
  '....dcppppcd....',
  '....dccppccd....',
  '.....dcccd......',
  '......dcd.......',
  '.......d........',
];

/**
 * vanilla sculk_soul_i: the soul gathering out of a wisp (0-2), whole (3-6), then thinning away from the top as it
 * goes (7-10)
 */
function sculkSoul(i: number): TexImage {
  const t = img(16, 16);
  const r = new Rand(0x50a1 + i);
  const inks: Record<string, number> = { d: DEEP, c: TEAL, p: CYAN, W: PALE };
  // gathering: only the lower part of it yet, rising
  const top = i < 3 ? 12 - i * 4 : 0;
  // fading: more of it gone, the lighter shades first
  const gone = i > 6 ? (i - 6) * 0.2 : 0;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const ch = SOUL_FACE[y][x];
      if (ch === '.' || y < top) continue;
      if (gone && r.nextFloat() < gone + (y < 8 ? 0.1 : 0)) continue;
      let c = inks[ch];
      if (i === 5 && ch === 'W') c = GLOW;
      plot(t, x, y, c);
    }
  return t;
}

/**
 * (M4: the warden) vanilla sonic_boom_i: a ring bursting outward, thick and white-hot at first, spreading thinner
 * and deeper in colour, an echo of it following inside, and breaking up as it goes
 */
function sonicBoom(i: number): TexImage {
  const t = img(16, 16);
  const r = new Rand(0x50b0 + i);
  const k = i / 15;
  const radius = 1.2 + k * 6.3, width = 1.5 - k * 0.8;
  const echo = radius * 0.55, echoWidth = 0.45;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const off = d - radius;
      if (k > 0.55 && r.nextFloat() < (k - 0.55) * 1.3) continue;
      if (Math.abs(off) <= width) plot(t, x, y, off > width * 0.35 ? (k < 0.5 ? PALE : CYAN) : off < -width * 0.35 ? (k < 0.4 ? CYAN : TEAL) : k < 0.3 ? GLOW : k < 0.7 ? PALE : CYAN);
      else if (i >= 3 && i <= 12 && Math.abs(d - echo) <= echoWidth) plot(t, x, y, i < 8 ? CYAN : TEAL);
    }
  return t;
}

export function sculkParticleTextures(): Record<string, () => TexImage> {
  const out: Record<string, () => TexImage> = { vibration, shriek };
  for (let i = 0; i < 7; i++) out[`sculk_charge_${i}`] = () => sculkCharge(i);
  for (let i = 0; i < 4; i++) out[`sculk_charge_pop_${i}`] = () => sculkChargePop(i);
  for (let i = 0; i < 11; i++) out[`sculk_soul_${i}`] = () => sculkSoul(i);
  for (let i = 0; i < 16; i++) out[`sonic_boom_${i}`] = () => sonicBoom(i);
  return out;
}
