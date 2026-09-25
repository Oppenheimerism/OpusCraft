// The deep dark's block textures (vanilla block/sculk*.png, calibrated_sculk_sensor_*.png, reinforced_deepslate_*.png,
// candle*.png and the cracked and chiseled deepslate): sculk's near-black teal flesh, flecked with specks of soul light
// that swell and fade (animated, like vanilla's); the vein's creeping threads of it over nothing; the catalyst, bone
// under a crown of sculk that lights up while it blooms; the sensor's slab and its tendrils (dim, and bright and
// twitching while it's active), the calibrated one's amethyst; the shrieker's bone ring round a black mouth (a ghostly
// glow in it when it can summon); reinforced deepslate, a dark core in a pale cage; the candles, a stick of wax and a
// wick (alight: a coal of flame on it) in the candle's and every dye's colour.

import { TexImage, TexDef, img, setPx, getPx, mixC, mulC, anim, cloneImg } from '../tex';
import { N, rng, fbm, quantize, paint, wrap, cluster } from './core';
import * as TR from './terrain';

type Reg = Record<string, () => TexDef>;

/** sculk's flesh, darkest to lightest: near-black blue, then deep teal */
export const SCULK_PAL = [0x040b0e, 0x07121a, 0x0a1a21, 0x0d2129, 0x0f2931, 0x12343d, 0x184550];
/** the soul light in it, dim to bright */
export const SOUL = [0x0f4f59, 0x146973, 0x1b8f99, 0x28b8c2, 0x4fd9e0, 0x8ff2f5];
/** bone (the catalyst's and the shrieker's), shadow to highlight */
export const BONE = [0x6f6a5b, 0x8e877a, 0xaaa391, 0xc5bda8, 0xd9d2bd, 0xe8e2cf, 0xf4f0e2];

/** the tone field of sculk: blotchy, wrapping */
function sculkTones(seed: string): Int32Array {
  const r = rng(seed);
  return quantize(fbm(r, [[8, 8, 0.35], [4, 4, 0.35], [2, 2, 0.3]], 0.35), [0.4, 1.6, 3.5, 4.5, 3, 1.4, 0.5]);
}

/** a speck of soul light: where it is, how big (1 or 2 px), and when in the cycle it glows brightest */
interface Speck {
  pts: [number, number][];
  phase: number;
  peak: number;
}

function specks(seed: string, count: number, maxPeak = 5): Speck[] {
  const r = rng(seed, 7);
  const out: Speck[] = [];
  for (let i = 0; i < count; i++) {
    const x = r.nextInt(N), y = r.nextInt(N);
    const size = r.chance(0.35) ? 2 + r.nextInt(2) : 1;
    out.push({ pts: cluster(r, x, y, size), phase: r.nextInt(8), peak: 2 + r.nextInt(maxPeak - 1) });
  }
  return out;
}

/** how bright a speck is at step `i` of an 8-step cycle: dark most of the time, swelling to its peak and back */
function speckLevel(s: Speck, i: number): number {
  const k = (i + s.phase) % 8;
  const curve = [0, 0, 0, 1, 2, 3, 2, 1];
  return Math.min(s.peak, curve[k] + (s.peak >= 4 && curve[k] >= 2 ? s.peak - 3 : 0)) - 1;
}

/** one frame of sculk (`i` of 8): the flesh, and the specks at their brightness then */
function sculkFrame(seed: string, i: number, sp: Speck[]): TexImage {
  const t = paint(sculkTones(seed), SCULK_PAL);
  for (const s of sp) {
    const lv = speckLevel(s, i);
    if (lv < 0) continue;
    s.pts.forEach(([x, y], k) => setPx(t, x, y, SOUL[Math.max(0, lv - (k > 0 ? 1 : 0))]));
  }
  return t;
}

/** vanilla sculk.png: animated, the specks of soul light pulsing */
function sculk(): TexDef {
  const sp = specks('sculk', 14);
  return anim(N, N, 8, 6, (i) => sculkFrame('sculk', i, sp));
}

/** vanilla sculk_vein.png: threads of sculk wandering over nothing, a few specks glowing in them (animated) */
function sculkVein(): TexDef {
  const r = rng('sculk_vein');
  const tones = new Int32Array(N * N).fill(-1);
  // (threads: random walks from a few roots, thicker where they start)
  for (let k = 0; k < 7; k++) {
    let x = r.nextInt(N), y = r.nextInt(N);
    const len = 8 + r.nextInt(10);
    let dx = r.chance(0.5) ? 1 : -1, dy = r.chance(0.5) ? 1 : -1;
    for (let s = 0; s < len; s++) {
      tones[wrap(y) * N + wrap(x)] = 2 + r.nextInt(3);
      if (s < 4 && r.chance(0.6)) tones[wrap(y + 1) * N + wrap(x)] = 1 + r.nextInt(2);
      if (r.chance(0.5)) x += dx;
      else y += dy;
      if (r.chance(0.2)) dx = -dx;
      if (r.chance(0.2)) dy = -dy;
    }
  }
  const base = paint(tones, SCULK_PAL);
  // the specks sit on the threads
  const on: [number, number][] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (tones[y * N + x] >= 0) on.push([x, y]);
  const sr = rng('sculk_vein', 3);
  const sp: Speck[] = [];
  for (let i = 0; i < 6 && on.length; i++) sp.push({ pts: [on[sr.nextInt(on.length)]], phase: sr.nextInt(8), peak: 3 + sr.nextInt(3) });
  return anim(N, N, 8, 6, (i) => {
    const t = cloneImg(base);
    for (const s of sp) {
      const lv = speckLevel(s, i);
      if (lv >= 0) for (const [x, y] of s.pts) setPx(t, x, y, SOUL[lv]);
    }
    return t;
  });
}

// ---------------------------------------------------------------------------
// The catalyst: bone, with sculk grown over its top

/** bone: pale and blotchy, with dark crevices running down it */
function bone(seed: string, crevices = true): TexImage {
  const r = rng(seed);
  const t = paint(quantize(fbm(r, [[4, 4, 0.4], [2, 2, 0.35]], 0.35), [0.3, 1, 2.5, 4, 3, 1.5, 0.5]), BONE);
  if (crevices)
    for (let k = 0; k < 5; k++) {
      let x = 1 + r.nextInt(14);
      const y0 = r.nextInt(8), len = 4 + r.nextInt(7);
      for (let y = y0; y < Math.min(N, y0 + len); y++) {
        setPx(t, x, y, BONE[0]);
        setPx(t, x + 1, y, mixC(getPx(t, x + 1, y), BONE[6], 0.35));
        if (r.chance(0.25)) x += r.chance(0.5) ? 1 : -1;
      }
    }
  return t;
}

/** vanilla sculk_catalyst_bottom.png: the bone underneath */
function catalystBottom(): TexImage {
  return bone('sculk_catalyst_bottom');
}

/**
 * vanilla sculk_catalyst_side(_bloom).png: bone below, the sculk lipping over the top edge in a ragged band, and in
 * the bone's crevices soul light (dim; blazing and flickering while it blooms)
 */
function catalystSide(glow: number): TexImage {
  const t = bone('sculk_catalyst_side');
  const r = rng('sculk_catalyst_side', 1);
  const flesh = paint(sculkTones('sculk_catalyst_side_flesh'), SCULK_PAL);
  for (let x = 0; x < N; x++) {
    const depth = 3 + r.nextInt(3) + (r.chance(0.3) ? 2 : 0);
    for (let y = 0; y < depth; y++) setPx(t, x, y, getPx(flesh, x, y));
    // (a dark rim where it meets the bone)
    setPx(t, x, depth, mixC(getPx(t, x, depth), SCULK_PAL[1], 0.6));
  }
  // soul light down in the crevices (the darkest bone)
  const cr = rng('sculk_catalyst_side', 2);
  for (let y = 5; y < N; y++)
    for (let x = 0; x < N; x++)
      if (getPx(t, x, y) === BONE[0] && cr.chance(0.55)) {
        const lv = Math.max(0, Math.min(SOUL.length - 1, glow + (cr.chance(0.3) ? -1 : 0)));
        setPx(t, x, y, glow < 0 ? BONE[0] : SOUL[lv]);
      }
  return t;
}

/**
 * vanilla sculk_catalyst_top(_bloom).png: a rim of bone round a disc of sculk, and in the middle four bony knuckles
 * round a hollow where the soul light gathers (brighter, and pulsing, while it blooms)
 */
function catalystTop(glow: number, frame: number): TexImage {
  const t = paint(sculkTones('sculk_catalyst_top'), SCULK_PAL);
  const b = bone('sculk_catalyst_top_bone', false);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const edge = Math.min(x, y, 15 - x, 15 - y);
      const d = Math.hypot(dx, dy);
      if (edge === 0) setPx(t, x, y, getPx(b, x, y));
      else if (edge === 1 && (x + y) % 3 !== 0) setPx(t, x, y, mulC(getPx(b, x, y), 0.85));
      // the knuckles: a ring of bone round the hollow
      if (d > 2.4 && d < 4.2 && Math.abs(Math.abs(dx) - Math.abs(dy)) < 2.6) setPx(t, x, y, getPx(b, x, y));
      if (d > 2.4 && d < 4.2 && (Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6)) setPx(t, x, y, SCULK_PAL[2]);
      // the hollow
      if (d <= 2.4) {
        const lv = glow < 0 ? -1 : Math.round(glow - d * 0.8 + ((frame + Math.round(dx + dy)) % 3 === 0 ? 1 : 0));
        setPx(t, x, y, lv < 0 ? SCULK_PAL[0] : SOUL[Math.min(SOUL.length - 1, lv)]);
      }
    }
  return t;
}

// ---------------------------------------------------------------------------
// The sensors

/** vanilla sculk_sensor_bottom.png */
function sensorBottom(): TexImage {
  return paint(sculkTones('sculk_sensor_bottom'), SCULK_PAL);
}

/** vanilla sculk_sensor_side.png (its lower half is the slab's side): sculk, a lighter teal lip along the top */
function sensorSide(): TexImage {
  const t = paint(sculkTones('sculk_sensor_side'), SCULK_PAL);
  const r = rng('sculk_sensor_side', 1);
  for (let x = 0; x < N; x++) {
    setPx(t, x, 8, mixC(SCULK_PAL[6], SOUL[0], 0.5));
    setPx(t, x, 9, r.chance(0.5) ? SCULK_PAL[6] : SCULK_PAL[5]);
    if (r.chance(0.3)) setPx(t, x, 10, SCULK_PAL[5]);
  }
  for (let i = 0; i < 3; i++) setPx(t, r.nextInt(N), 11 + r.nextInt(5), SOUL[1 + r.nextInt(2)]);
  return t;
}

/** vanilla sculk_sensor_top.png: sculk, teal-rimmed, with the four sockets the tendrils grow from */
function sensorTop(amethyst: boolean): TexImage {
  const t = paint(sculkTones(amethyst ? 'calibrated_sculk_sensor_top' : 'sculk_sensor_top'), SCULK_PAL);
  const rim = amethyst ? [0x3b2466, 0x5a3a8f, 0x7c55b8] : [SCULK_PAL[5], SCULK_PAL[6], SOUL[0]];
  for (let i = 0; i < N; i++) {
    setPx(t, i, 0, rim[1]);
    setPx(t, 0, i, rim[1]);
    setPx(t, i, 15, rim[0]);
    setPx(t, 15, i, rim[0]);
  }
  for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]]) {
    setPx(t, x, y, SCULK_PAL[0]);
    setPx(t, x + (x < 8 ? -1 : 1), y, SOUL[1]);
    setPx(t, x, y + (y < 8 ? -1 : 1), SOUL[0]);
  }
  if (amethyst) {
    // (the calibrated sensor's: amethyst crusted round where its crystal stands)
    const r = rng('calibrated_sculk_sensor_top');
    for (let k = 0; k < 16; k++) {
      const a = r.next() * Math.PI * 2, d = 2 + r.next() * 3;
      setPx(t, Math.round(7.5 + Math.cos(a) * d), Math.round(7.5 + Math.sin(a) * d), rim[r.nextInt(3)]);
    }
  }
  return t;
}

/** vanilla calibrated_sculk_sensor_input_side.png: the sensor's side, an amethyst socket where the signal goes in */
function calibratedInputSide(): TexImage {
  const t = sensorSide();
  const am = [0x3b2466, 0x5a3a8f, 0x7c55b8, 0xa77ee0, 0xcfb0f5];
  for (let y = 10; y < 15; y++)
    for (let x = 5; x < 11; x++) {
      const edge = x === 5 || x === 10 || y === 10 || y === 14;
      setPx(t, x, y, edge ? am[0] : am[1 + ((x + y) % 3)]);
    }
  setPx(t, 7, 12, am[4]);
  setPx(t, 8, 11, am[3]);
  return t;
}

/** vanilla calibrated_sculk_sensor_amethyst.png: a crystal of amethyst, lit down its left facets */
function calibratedAmethyst(): TexImage {
  const t = img();
  const am = [0x40286e, 0x5a3a8f, 0x7a52b3, 0x9a70d6, 0xbd96ef, 0xe2cdfb];
  // (a point in the middle, two shorter ones beside it, standing a little over the tendrils)
  const spikes: [number, number, number][] = [[7.5, 5, 2], [5, 9, 1.4], [10.2, 8, 1.5]];
  for (const [cx, top, w] of spikes)
    for (let y = top; y < 16; y++) {
      const half = Math.min(w, ((y - top) / 3.2) * w + 0.5);
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx - 1 + half); x++) {
        if (x < 0 || x > 15) continue;
        const u = (x - (cx - half)) / (2 * half);
        const tone = y === top ? 5 : u < 0.35 ? 4 : u < 0.7 ? 3 : 1;
        setPx(t, x, y, am[Math.max(0, tone - (y > 12 ? 1 : 0))]);
      }
    }
  return t;
}

/**
 * vanilla sculk_sensor_tendril_inactive / _active.png (animated): in the bottom left quarter, a tendril rising from
 * its socket and curling over (the sensor mirrors it for the other side), swaying a pixel each way; dim teal, or
 * bright and quicker while the sensor is active
 */
function tendril(active: boolean): TexDef {
  const pal = active ? [SOUL[2], SOUL[3], SOUL[4], SOUL[5]] : [0x0b3a42, 0x0f4f59, 0x146973, 0x1b8f99];
  const frames = 10;
  return anim(N, N, frames, active ? 1 : 2, (i) => {
    const t = img();
    const sway = Math.round(Math.sin((i / frames) * Math.PI * 2) * (active ? 1.2 : 0.8));
    // (from the bottom row up: x of the stalk at each height, the top rows bent by the sway)
    const xs = [4, 4, 4, 3, 3, 3 + sway, 3 + sway, 4 + sway];
    for (let k = 0; k < 8; k++) {
      const y = 15 - k, x = xs[k];
      setPx(t, x, y, pal[k < 3 ? 1 : 2]);
      if (k < 3) setPx(t, x + 1, y, pal[0]);
      if (k === 7) {
        setPx(t, x + 1, y, pal[3]);
        setPx(t, x + 1, y + 1, pal[2]);
      }
    }
    return t;
  });
}

// ---------------------------------------------------------------------------
// The shrieker

/** vanilla sculk_shrieker_side.png: its top half the bone crown (bones side by side), its lower half the slab of sculk */
function shriekerSide(): TexImage {
  const t = paint(sculkTones('sculk_shrieker_side'), SCULK_PAL);
  const b = bone('sculk_shrieker_side_bone', false);
  const r = rng('sculk_shrieker_side');
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < N; x++) {
      let c = getPx(b, x, y);
      // (the gaps between the bones, and each bone lit on its left)
      if (x % 4 === 0) c = BONE[0];
      else if (x % 4 === 1) c = mixC(c, BONE[6], 0.3);
      else if (x % 4 === 3) c = mixC(c, BONE[1], 0.35);
      if (y === 0) c = mixC(c, BONE[6], 0.4);
      if (y === 7) c = mixC(c, SCULK_PAL[2], 0.5);
      setPx(t, x, y, c);
    }
  // (sculk creeping up the crown's foot, and a soul speck or two in the slab)
  for (let x = 0; x < N; x++) if (r.chance(0.45)) setPx(t, x, 6, SCULK_PAL[3 + r.nextInt(3)]);
  for (let x = 0; x < N; x++) setPx(t, x, 8, SCULK_PAL[6]);
  for (let i = 0; i < 3; i++) setPx(t, r.nextInt(N), 10 + r.nextInt(6), SOUL[r.nextInt(3)]);
  return t;
}

/** vanilla sculk_shrieker_top.png: the slab's top, round the foot of the crown */
function shriekerTop(): TexImage {
  const t = paint(sculkTones('sculk_shrieker_top'), SCULK_PAL);
  for (let i = 0; i < N; i++) {
    setPx(t, i, 0, SCULK_PAL[6]);
    setPx(t, 0, i, SCULK_PAL[6]);
    setPx(t, i, 15, SCULK_PAL[1]);
    setPx(t, 15, i, SCULK_PAL[1]);
  }
  return t;
}

/**
 * vanilla sculk_shrieker_inner_top.png / sculk_shrieker_can_summon_inner_top.png (animated): the crown seen from above,
 * a ring of bone round a black mouth; one that can summon has a ghostly light swirling in it
 */
function shriekerInner(summon: boolean): TexDef {
  const b = bone('sculk_shrieker_inner_top', false);
  const frames = 8;
  return anim(N, N, frames, 4, (i) => {
    const t = img();
    for (let y = 1; y < 15; y++)
      for (let x = 1; x < 15; x++) {
        const dx = x - 7.5, dy = y - 7.5, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (d > 3.6) {
          // (the bone ring, darker on its inner edge)
          setPx(t, x, y, d < 4.6 ? mulC(getPx(b, x, y), 0.75) : getPx(b, x, y));
          continue;
        }
        let c = d > 2.6 ? SCULK_PAL[1] : 0x020506;
        if (summon) {
          // (a swirl of soul light turning round the middle)
          const a = Math.atan2(dy, dx) + (i / frames) * Math.PI * 2;
          const w = Math.sin(a * 2 + Math.hypot(dx, dy) * 1.3);
          if (w > 0.2) c = SOUL[Math.min(SOUL.length - 1, Math.round(w * 4 - Math.hypot(dx, dy) * 0.4) + 1)];
        } else if ((x * 7 + y * 3 + i) % 11 === 0 && d < 2.6) c = SCULK_PAL[3];
        setPx(t, x, y, c);
      }
    return t;
  });
}

// ---------------------------------------------------------------------------
// Reinforced deepslate: a core of dark deepslate in a cage of pale stone

const CAGE = [0x57534b, 0x6f6a60, 0x8c8679, 0xa7a192, 0xc2bcab, 0xd8d2c1];

function reinforcedCore(seed: string): TexImage {
  return TR.deepslateTiles(seed);
}

/** vanilla reinforced_deepslate_side.png: the core, in a frame with bars down its sides and a bolt at each corner */
function reinforcedSide(): TexImage {
  const t = reinforcedCore('reinforced_deepslate_side');
  for (let i = 0; i < N; i++) {
    for (const [x, y, c] of [[i, 0, 4], [i, 1, 2], [i, 14, 2], [i, 15, 1], [0, i, 3], [1, i, 2], [14, i, 1], [15, i, 0]] as [number, number, number][]) setPx(t, x, y, CAGE[c]);
  }
  // (two bars across the middle)
  for (let x = 2; x < 14; x++) {
    setPx(t, x, 7, CAGE[3]);
    setPx(t, x, 8, CAGE[1]);
  }
  for (const [x, y] of [[1, 1], [13, 1], [1, 13], [13, 13]]) {
    setPx(t, x, y, CAGE[5]);
    setPx(t, x + 1, y, CAGE[3]);
    setPx(t, x, y + 1, CAGE[3]);
    setPx(t, x + 1, y + 1, CAGE[0]);
  }
  return t;
}

/** vanilla reinforced_deepslate_top / _bottom.png: the frame, and on the top a cross of the cage over the core */
function reinforcedEnd(top: boolean): TexImage {
  const t = reinforcedCore(top ? 'reinforced_deepslate_top' : 'reinforced_deepslate_bottom');
  for (let i = 0; i < N; i++)
    for (const [x, y, c] of [[i, 0, 4], [i, 1, 2], [i, 14, 2], [i, 15, 1], [0, i, 3], [1, i, 2], [14, i, 1], [15, i, 0]] as [number, number, number][]) setPx(t, x, y, CAGE[c]);
  if (top) {
    for (let k = 2; k < 14; k++) {
      setPx(t, k, 7, CAGE[3]);
      setPx(t, k, 8, CAGE[1]);
      setPx(t, 7, k, CAGE[3]);
      setPx(t, 8, k, CAGE[1]);
    }
    for (const [x, y] of [[6, 6], [9, 6], [6, 9], [9, 9]]) setPx(t, x, y, CAGE[0]);
    setPx(t, 7, 7, CAGE[5]);
  } else for (let k = 2; k < 14; k += 4) setPx(t, k, k, CAGE[1]);
  return t;
}

// ---------------------------------------------------------------------------
// Candles: the candle at the texture's left edge, x 0..1 (vanilla's layout: the wick at v 5, the top at v 6..7, the
// side from v 8 down to 13, the bottom at v 14..15)

/** the wax's tones, shadow to highlight, for a candle of wax colour `c` */
function waxTones(c: number): number[] {
  return [mulC(c, 0.55), mulC(c, 0.72), mulC(c, 0.86), c, mixC(c, 0xffffff, 0.2), mixC(c, 0xffffff, 0.38)];
}

function candle(wax: number, lit: boolean): TexImage {
  const t = img();
  const w = waxTones(wax);
  // (the wick: burnt black, or glowing at its tip)
  setPx(t, 0, 5, lit ? 0xffd66b : 0x2b2118);
  // (the top: the wax round the wick's foot)
  setPx(t, 0, 6, w[4]);
  setPx(t, 1, 6, w[3]);
  setPx(t, 0, 7, w[3]);
  setPx(t, 1, 7, lit ? 0x3a2a1a : 0x2b2118);
  // (the side: lit down its left, a drip of wax down the right)
  for (let y = 8; y < 14; y++) {
    setPx(t, 0, y, w[y === 8 ? 5 : 4 - ((y - 8) >> 2)]);
    setPx(t, 1, y, w[y === 8 ? 4 : y === 10 ? 3 : 2 - ((y - 8) >> 2)]);
  }
  // (the bottom)
  setPx(t, 0, 14, w[1]);
  setPx(t, 1, 14, w[0]);
  setPx(t, 0, 15, w[0]);
  setPx(t, 1, 15, w[1]);
  return t;
}

/** vanilla: the plain candle's wax, and the dyed ones' (a little paler than their wool) */
export const CANDLE_WAX: Record<string, number> = {
  '': 0xe8d6a8, white: 0xe4e8e9, orange: 0xe9811a, magenta: 0xb54caf, light_blue: 0x4db5e0, yellow: 0xf3c73b, lime: 0x7dbd26,
  pink: 0xe98fae, gray: 0x545b5f, light_gray: 0x9b9b94, cyan: 0x199aa0, purple: 0x8039ae, blue: 0x3e46aa, brown: 0x7d4f2d,
  green: 0x5a7626, red: 0xae3129, black: 0x28282f,
};

// ---------------------------------------------------------------------------
// Cracked and chiseled deepslate

function cracked(t: TexImage, seed: string, dark: number, chip: number): TexImage {
  const r = rng(seed);
  for (let k = 0; k < 4; k++) {
    let x = r.nextInt(N), y = r.nextInt(N);
    const len = 4 + r.nextInt(5);
    for (let s = 0; s < len; s++) {
      setPx(t, x, y, dark);
      setPx(t, wrap(x + 1), y, mixC(getPx(t, wrap(x + 1), y), chip, 0.45));
      y = wrap(y + 1);
      if (r.chance(0.45)) x = wrap(x + (r.chance(0.5) ? 1 : -1));
    }
  }
  return t;
}

/** vanilla chiseled_deepslate.png: carved in squares within squares, each lit on its top left edge */
function chiseledDeepslate(): TexImage {
  const pal = [0x1f1f23, 0x2b2b30, 0x36363b, 0x414146, 0x4c4c52, 0x59595f, 0x68686e];
  const r = rng('chiseled_deepslate');
  const t = paint(quantize(fbm(r, [[4, 4, 0.5], [2, 2, 0.5]], 0.3), [1, 3, 4, 3, 1]).map((k) => k + 1), pal);
  const frame = (a: number, b: number) => {
    for (let i = a; i <= b; i++) {
      setPx(t, i, a, pal[6]);
      setPx(t, a, i, pal[6]);
      setPx(t, i, b, pal[0]);
      setPx(t, b, i, pal[0]);
    }
  };
  frame(0, 15);
  frame(3, 12);
  frame(6, 9);
  // (the grooves between the frames)
  for (const [a, b] of [[2, 13], [5, 10]])
    for (let i = a; i <= b; i++) {
      setPx(t, i, a, pal[1]);
      setPx(t, a, i, pal[1]);
      setPx(t, i, b, pal[2]);
      setPx(t, b, i, pal[2]);
    }
  return t;
}

export function registerSculkTextures(T: Reg): void {
  T['sculk'] = sculk;
  T['sculk_vein'] = sculkVein;
  T['sculk_catalyst_bottom'] = catalystBottom;
  T['sculk_catalyst_side'] = () => catalystSide(-1);
  T['sculk_catalyst_top'] = () => catalystTop(1, 0);
  // (vanilla sculk_catalyst_side_bloom / top_bloom.png.mcmeta: animated)
  T['sculk_catalyst_side_bloom'] = () => anim(N, N, 4, 2, (i) => catalystSide(2 + [0, 1, 2, 1][i]));
  T['sculk_catalyst_top_bloom'] = () => anim(N, N, 4, 2, (i) => catalystTop(4 + [0, 1, 1, 0][i], i));
  T['sculk_sensor_bottom'] = sensorBottom;
  T['sculk_sensor_side'] = sensorSide;
  T['sculk_sensor_top'] = () => sensorTop(false);
  T['sculk_sensor_tendril_inactive'] = () => tendril(false);
  T['sculk_sensor_tendril_active'] = () => tendril(true);
  T['calibrated_sculk_sensor_top'] = () => sensorTop(true);
  T['calibrated_sculk_sensor_input_side'] = calibratedInputSide;
  T['calibrated_sculk_sensor_amethyst'] = calibratedAmethyst;
  T['sculk_shrieker_bottom'] = () => paint(sculkTones('sculk_shrieker_bottom'), SCULK_PAL);
  T['sculk_shrieker_side'] = shriekerSide;
  T['sculk_shrieker_top'] = shriekerTop;
  T['sculk_shrieker_inner_top'] = () => shriekerInner(false);
  T['sculk_shrieker_can_summon_inner_top'] = () => shriekerInner(true);
  T['reinforced_deepslate_side'] = reinforcedSide;
  T['reinforced_deepslate_top'] = () => reinforcedEnd(true);
  T['reinforced_deepslate_bottom'] = () => reinforcedEnd(false);
  T['cracked_deepslate_bricks'] = () => cracked(TR.deepslateBricks('cracked_deepslate_bricks'), 'cracked_deepslate_bricks_cracks', 0x151518, 0x5e5e64);
  T['cracked_deepslate_tiles'] = () => cracked(TR.deepslateTiles('cracked_deepslate_tiles'), 'cracked_deepslate_tiles_cracks', 0x101012, 0x55555b);
  T['chiseled_deepslate'] = chiseledDeepslate;
  for (const [c, wax] of Object.entries(CANDLE_WAX)) {
    const name = c ? `${c}_candle` : 'candle';
    T[name] = () => candle(wax, false);
    T[`${name}_lit`] = () => candle(wax, true);
  }
}
