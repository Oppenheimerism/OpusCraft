// The skins of the sea's smaller creatures (Stage 5: ocean; vanilla textures/entity/fish/*.png, dolphin.png and
// squid/glow_squid.png), each in its model's box layout (render/fishRenderers.ts): the cod, mottled brown over a
// pale belly; the salmon, olive-backed over red flanks; the pufferfish, yellow and spotted over a white belly, blue
// fins and pale spines (one skin for all three sizes); the tropical fish's two bodies in white (tinted by the body
// colour) and their twelve patterns (white on clear, tinted by the pattern colour); the dolphin, slate above and pale
// beneath; the glow squid, deep teal speckled with glowing spots. And the glow squid's spark (vanilla particle/glow).
// Original pixel art in the style of vanilla 1.21.

import { TexImage, img, plot, getPx, mixC, mulC } from './tex';
import { Rand } from '../core/rng';
import { MOB_TEXTURES, MOB_PARTICLE_TEXTURES, boxFaces, noiseFace, paintFace, pick, SIDES, type Face, type Pal } from './mobs';

/** a side face shaded from `back` along its top rows to `belly` along its bottom ones (`split`: where they meet) */
function flank(t: TexImage, f: Face, r: Rand, back: Pal, belly: Pal, split = 0.5, soft = 0.2): void {
  const [x0, y0, w, h] = f;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = h <= 1 ? 0 : y / (h - 1);
      const lower = k > split + (r.next() - 0.5) * soft * 2;
      plot(t, x0 + x, y0 + y, pick(r, lower ? belly : back));
    }
}

/** a few dots of `pal` over the upper `upTo` of a face */
function spots(t: TexImage, f: Face, r: Rand, n: number, pal: Pal, upTo = 1): void {
  const [x0, y0, w, h] = f;
  for (let i = 0; i < n; i++) plot(t, x0 + r.nextInt(w), y0 + r.nextInt(Math.max(1, Math.ceil(h * upTo))), pick(r, pal));
}

/** a fin: rays of `pal` with lighter tips at the far edge (`edge`: which side is the tip) */
function fin(t: TexImage, f: Face, r: Rand, pal: Pal, tip: number, edge: 'top' | 'bottom' | 'left' | 'right' | 'none' = 'none'): void {
  paintFace(t, f, (x, y, _c, w, h) => {
    const atTip = (edge === 'top' && y === 0) || (edge === 'bottom' && y === h - 1) || (edge === 'left' && x === 0) || (edge === 'right' && x === w - 1);
    if (atTip && r.chance(0.7)) return tip;
    return (x + y) % 2 === 0 ? pal[0] : pick(r, pal);
  });
}

// ---------------------------------------------------------------------------
// Cod (vanilla CodModel, 32x32)

function cod(): TexImage {
  const t = img(32, 32);
  const r = new Rand(0xc0d);
  const BACK = [0x7a684c, 0x877354, 0x937e5c, 0x9d8865];
  const SPOT = [0x5c4b36, 0x68563e];
  const BELLY = [0xcbb996, 0xd6c6a4, 0xe0d2b4];
  const FIN = [0xab9571, 0xbba681, 0xc8b491];
  const LINE = 0xe6dcc2;
  const body = boxFaces(0, 0, 2, 4, 7), head = boxFaces(11, 0, 2, 4, 3), nose = boxFaces(0, 0, 2, 3, 1);
  for (const b of [body, head, nose]) {
    for (const k of SIDES) flank(t, b[k], r, BACK, BELLY, 0.55);
    noiseFace(t, b.top, r, BACK);
    noiseFace(t, b.bottom, r, BELLY);
  }
  // the spots on its back and flanks, and the pale line along each side
  for (const f of [body.top, body.right, body.left, head.top]) spots(t, f, r, 4, SPOT, 0.6);
  for (const f of [body.right, body.left]) for (let x = 0; x < f[2]; x++) if (r.chance(0.8)) plot(t, f[0] + x, f[1] + 1, LINE);
  // the eyes: at the front of each side of the head (the right face's front is its right end, the left face's its left)
  for (const [f, x] of [[head.right, 1], [head.left, 1]] as [Face, number][]) {
    plot(t, f[0] + x, f[1] + 1, 0x18120c);
    plot(t, f[0] + x, f[1] + 2, 0x2e241a);
  }
  // the mouth: a dark line across the nose's front
  for (let x = 0; x < 2; x++) plot(t, nose.front[0] + x, nose.front[1] + 2, 0x4a3a2a);
  // the fins: side fins, the tail and the fin along its back
  for (const f of [[24, 1, 2, 2], [26, 1, 2, 2], [24, 4, 2, 2], [26, 4, 2, 2]] as Face[]) fin(t, f, r, FIN, 0xe0d0b0);
  fin(t, [22, 7, 4, 4], r, FIN, 0xe0d0b0, 'left');
  fin(t, [26, 7, 4, 4], r, FIN, 0xe0d0b0, 'right');
  fin(t, [20, 0, 6, 1], r, FIN, 0xe0d0b0);
  fin(t, [26, 0, 6, 1], r, FIN, 0xe0d0b0);
  return t;
}

// ---------------------------------------------------------------------------
// Salmon (vanilla SalmonModel, 32x32)

function salmon(): TexImage {
  const t = img(32, 32);
  const r = new Rand(0x5a1);
  const BACK = [0x55543f, 0x625f49, 0x6e6a52];
  const SIDE = [0xa3403a, 0xb24b42, 0xbf564b, 0xca6354];
  const BELLY = [0xd98c79, 0xe39d8a, 0xebae9c];
  const FIN = [0x8a3931, 0x9a4339, 0xa84d42];
  const SPOT = [0x33312a, 0x3f3c33];
  const front = boxFaces(0, 0, 3, 5, 8), back = boxFaces(0, 13, 3, 5, 8), head = boxFaces(22, 0, 2, 4, 3);
  for (const b of [front, back, head]) {
    for (const k of SIDES)
      paintFace(t, b[k], (_x, y, _c, _w, h) => {
        const k2 = y / Math.max(1, h - 1);
        return pick(r, k2 < 0.3 ? BACK : k2 < 0.75 ? SIDE : BELLY);
      });
    noiseFace(t, b.top, r, BACK);
    noiseFace(t, b.bottom, r, BELLY);
  }
  for (const f of [front.top, back.top, front.right, front.left, back.right, back.left]) spots(t, f, r, 5, SPOT, 0.45);
  // the head: darker, the eyes near its front, a hooked jaw
  for (const k of SIDES) paintFace(t, head[k], (_x, _y, c) => mulC(c, 0.92));
  plot(t, head.right[0] + 2, head.right[1] + 1, 0x14100c);
  plot(t, head.left[0], head.left[1] + 1, 0x14100c);
  for (let x = 0; x < 2; x++) plot(t, head.front[0] + x, head.front[1] + 3, 0x6e2a24);
  // the fins: the tail fan, the two on its back and the pair beneath (the right one's upper face reads column 0)
  fin(t, [20, 16, 6, 5], r, FIN, 0xd06a5a, 'left');
  fin(t, [26, 16, 6, 5], r, FIN, 0xd06a5a, 'right');
  for (const f of [[2, 4, 3, 2], [5, 4, 3, 2], [0, 6, 4, 2], [4, 6, 4, 2]] as Face[]) fin(t, f, r, FIN, 0xc25e50, 'top');
  for (const f of [[0, 0, 2, 2], [2, 0, 2, 2], [4, 0, 2, 2]] as Face[]) fin(t, f, r, FIN, 0xc25e50);
  return t;
}

// ---------------------------------------------------------------------------
// Pufferfish (vanilla PufferfishSmallModel, PufferfishMidModel and PufferfishBigModel share one 32x32 skin)

function pufferfish(): TexImage {
  const t = img(32, 32);
  const r = new Rand(0x9f1);
  const BODY = [0xd4a326, 0xe0b332, 0xe9c03e, 0xf0cc4c];
  const SPOT = [0x98761a, 0xa98420];
  const BELLY = [0xefe2bc, 0xf6ecd4];
  const BLUE = [0x3a88c4, 0x4898d2, 0x58a6dc];
  const SPINE = [0xeae4cc, 0xf4f0e0, 0xfbf9ef];
  const EYE = 0x101010;
  const bodies = [boxFaces(0, 0, 8, 8, 8), boxFaces(12, 22, 5, 5, 5), boxFaces(0, 27, 3, 2, 3)];
  // the spines and fins first (the bodies' faces go over what they share with them)
  for (const f of [[0, 16, 12, 6], [12, 16, 20, 7], [0, 22, 12, 5]] as Face[]) paintFace(t, f, () => pick(r, SPINE));
  for (let x = 0; x < 32; x++) for (const y of [17, 18, 20]) if (r.chance(0.35)) plot(t, x, y, 0xcfc6a8);
  for (const f of [[24, 0, 8, 6]] as Face[]) paintFace(t, f, () => pick(r, BLUE));
  for (const f of [[0, 0, 8, 3]] as Face[]) paintFace(t, f, () => pick(r, BODY));
  for (const b of bodies) {
    for (const k of SIDES) flank(t, b[k], r, BODY, BELLY, 0.62);
    noiseFace(t, b.top, r, BODY);
    noiseFace(t, b.bottom, r, BELLY);
    for (const f of [b.top, b.right, b.left, b.back]) spots(t, f, r, Math.max(1, Math.floor((f[2] * f[3]) / 6)), SPOT, 0.7);
  }
  // the big one's face: two black eyes and a small mouth; the mid one's likewise; the small one's eyes are boxes
  const big = bodies[0].front, mid = bodies[1].front;
  for (const [f, ex, ey] of [[big, 1, 2], [big, 5, 2], [mid, 0, 1], [mid, 3, 1]] as [Face, number, number][]) {
    plot(t, f[0] + ex, f[1] + ey, EYE);
    plot(t, f[0] + ex + 1, f[1] + ey, EYE);
    if (f === big) plot(t, f[0] + ex, f[1] + ey + 1, EYE), plot(t, f[0] + ex + 1, f[1] + ey + 1, 0x2a2a2a);
  }
  for (let x = 3; x <= 4; x++) plot(t, big[0] + x, big[1] + 5, 0x6a4a18);
  plot(t, mid[0] + 2, mid[1] + 3, 0x6a4a18);
  for (let x = 24; x < 32; x++) for (let y = 6; y < 8; y++) plot(t, x, y, y === 6 ? 0x2a2a2a : EYE);
  // the small one's back fin (its upper face is the corner at 0,0)
  paintFace(t, [0, 0, 6, 3], () => pick(r, [0xc79a24, 0xd6aa30]));
  return t;
}

// ---------------------------------------------------------------------------
// Tropical fish (vanilla TropicalFishModelA / B: the bodies white, to be tinted; the patterns white on clear)

const TROPICAL_A = { body: boxFaces(0, 0, 2, 3, 6), tail: [[22, 0, 6, 3], [28, 0, 6, 3]] as Face[], fins: [[2, 16, 4, 2], [2, 12, 4, 2]] as Face[], top: [[10, 1, 6, 3], [16, 1, 6, 3]] as Face[], bottom: [] as Face[] };
const TROPICAL_B = {
  body: boxFaces(0, 20, 2, 6, 6),
  tail: [[21, 21, 5, 6], [26, 21, 5, 6]] as Face[],
  fins: [[2, 16, 4, 2], [2, 12, 4, 2]] as Face[],
  top: [[20, 17, 6, 4], [26, 17, 6, 4]] as Face[],
  bottom: [[20, 27, 6, 4], [26, 27, 6, 4]] as Face[],
};

function tropicalBase(large: boolean): TexImage {
  const t = img(32, 32);
  const r = new Rand(large ? 0x7b : 0x7a);
  const BODY = [0xeeeeee, 0xf6f6f6, 0xfdfdfd];
  const FIN = [0xd6d6d6, 0xe2e2e2, 0xececec];
  const L = large ? TROPICAL_B : TROPICAL_A;
  const b = L.body;
  for (const k of SIDES) flank(t, b[k], r, BODY, [0xfafafa, 0xffffff], 0.7, 0.1);
  noiseFace(t, b.top, r, [0xe4e4e4, 0xececec]);
  noiseFace(t, b.bottom, r, [0xf8f8f8, 0xffffff]);
  // the eyes near the front of each side, the mouth on its face
  const eyeY = large ? 1 : 0;
  plot(t, b.right[0] + b.right[2] - 2, b.right[1] + eyeY, 0x1c1c1c);
  plot(t, b.left[0] + 1, b.left[1] + eyeY, 0x1c1c1c);
  plot(t, b.front[0], b.front[1] + (large ? 3 : 2), 0x9a9a9a);
  plot(t, b.front[0] + 1, b.front[1] + (large ? 3 : 2), 0x9a9a9a);
  const fins = [...L.tail, ...L.fins, ...L.top, ...L.bottom];
  for (const f of fins) fin(t, f, r, FIN, 0xf4f4f4);
  return t;
}

/**
 * the twelve patterns (vanilla TropicalFish.Pattern, textures tropical_a_pattern_1-6 and tropical_b_pattern_1-6), as
 * which pixels of each face take the pattern colour: on the sides x runs tail to head on the right face and head to
 * tail on the left (flipped here so both read head-first), y top to belly
 */
type Part = 'side' | 'top' | 'bottom' | 'fin' | 'tail' | 'front' | 'back';
type Mark = (x: number, y: number, w: number, h: number, part: Part) => boolean;
const PATTERNS: Record<string, Mark> = {
  // small body: kob (a band behind the head and a dark tail), sunstreak (its back and fins), snooper (a stripe from
  // the eye along its side), dasher (a line along its middle, its fins), brinely (its underside), spotty (dots)
  kob: (x, _y, _w, _h, p) => (p === 'side' ? x >= 1 && x <= 2 : p === 'tail' || p === 'top' ? true : false),
  sunstreak: (_x, y, _w, h, p) => (p === 'side' ? y < h / 2 : p === 'top' || p === 'tail' || p === 'fin'),
  snooper: (x, y, _w, _h, p) => (p === 'side' ? y === 1 || (x <= 1 && y === 0) : p === 'front' ? y === 1 : false),
  dasher: (x, y, _w, h, p) => (p === 'side' ? y === Math.floor(h / 2) || x === 0 : p === 'fin' || p === 'tail'),
  brinely: (_x, y, _w, h, p) => (p === 'side' ? y >= h - 1 : p === 'bottom' || p === 'fin'),
  spotty: (x, y, _w, _h, p) => (p === 'side' ? (x + 2 * y) % 3 === 0 : p === 'top' ? (x + y) % 2 === 0 : p === 'tail'),
  // large body: flopper (its back half), stripey (upright stripes), glitter (speckles), blockfish (a block of its
  // head and its fins), betty (a stripe along it), clayfish (its belly and a mask over the eye)
  flopper: (x, _y, w, _h, p) => (p === 'side' ? x >= w / 2 : p === 'tail' || p === 'back'),
  stripey: (x, _y, _w, _h, p) => (p === 'side' ? x % 2 === 1 : p === 'top' || p === 'bottom' ? x % 2 === 1 : p === 'tail'),
  glitter: (x, y, _w, _h, p) => (p === 'side' || p === 'top' ? (x * 7 + y * 5) % 5 === 0 : p === 'fin'),
  blockfish: (x, y, _w, h, p) => (p === 'side' ? x <= 2 && y < h - 1 : p === 'front' || p === 'fin'),
  betty: (_x, y, _w, h, p) => (p === 'side' ? y >= 2 && y <= h - 3 : p === 'tail'),
  clayfish: (x, y, _w, h, p) => (p === 'side' ? y >= h - 2 || (x === 1 && y <= 2) : p === 'bottom' || p === 'fin'),
};

function tropicalPattern(large: boolean, name: string): TexImage {
  const t = img(32, 32);
  const r = new Rand(name.length * 31 + (large ? 7 : 3));
  const L = large ? TROPICAL_B : TROPICAL_A;
  const mark = PATTERNS[name];
  const put = (f: Face, part: Part, flip = false) =>
    paintFace(t, f, (x, y, _c, w, h) => (mark(flip ? w - 1 - x : x, y, w, h, part) ? (r.chance(0.2) ? 0xe8e8e8 : 0xffffff) : undefined));
  const b = L.body;
  // (on the right face the head end is its right end: flipped to read head-first like the left)
  put(b.right, 'side', true);
  put(b.left, 'side');
  put(b.top, 'top');
  put(b.bottom, 'bottom');
  put(b.front, 'front');
  put(b.back, 'back');
  for (const f of L.tail) put(f, 'tail');
  for (const f of [...L.fins, ...L.top, ...L.bottom]) put(f, 'fin');
  return t;
}

// ---------------------------------------------------------------------------
// Dolphin (vanilla DolphinModel, 64x64)

function dolphin(): TexImage {
  const t = img(64, 64);
  const r = new Rand(0xd01f);
  const TOP = [0x5b6d7e, 0x647688, 0x6d8092];
  const SIDE = [0x8797a6, 0x93a3b2, 0x9fafbe];
  const BELLY = [0xd4dbe2, 0xdfe5eb, 0xeaeff3];
  const FIN = [0x53657a, 0x5c6e83, 0x66788c];
  const body = boxFaces(22, 0, 8, 7, 13), tail = boxFaces(0, 19, 4, 5, 11), head = boxFaces(0, 0, 8, 7, 6), nose = boxFaces(0, 13, 2, 2, 4);
  for (const b of [body, tail, head, nose]) {
    for (const k of SIDES)
      paintFace(t, b[k], (_x, y, _c, _w, h) => {
        const k2 = y / Math.max(1, h - 1) + (r.next() - 0.5) * 0.15;
        return pick(r, k2 < 0.3 ? TOP : k2 < 0.68 ? SIDE : BELLY);
      });
    noiseFace(t, b.top, r, TOP);
    noiseFace(t, b.bottom, r, BELLY);
  }
  // a darker stripe down the middle of its back
  for (const f of [body.top, tail.top, head.top]) paintFace(t, f, (x, _y, c, w) => (Math.abs(x - (w - 1) / 2) < 1 ? mulC(c, 0.88) : undefined));
  // the eyes, a little behind the beak on each side of the head (the right face's front is its right end)
  for (const [f, x] of [[head.right, 3], [head.left, 2]] as [Face, number][]) {
    plot(t, f[0] + x, f[1] + 2, 0x12181e);
    plot(t, f[0] + x, f[1] + 3, 0x1e262e);
  }
  // the smile along the beak
  for (const f of [nose.right, nose.left]) for (let x = 0; x < f[2]; x++) plot(t, f[0] + x, f[1] + 1, mixC(getPx(t, f[0] + x, f[1] + 1), 0x3a4652, 0.5));
  // the fins: back fin, flippers and the flukes
  for (const f of Object.values(boxFaces(51, 0, 1, 4, 5))) fin(t, f, r, FIN, 0x7a8ca0);
  for (const f of Object.values(boxFaces(48, 20, 1, 4, 7))) fin(t, f, r, FIN, 0x7a8ca0);
  const flukes = boxFaces(19, 20, 10, 1, 6);
  for (const f of Object.values(flukes)) fin(t, f, r, FIN, 0x7a8ca0);
  paintFace(t, flukes.bottom, (_x, _y, c) => mixC(c, 0xc8d2dc, 0.5));
  return t;
}

// ---------------------------------------------------------------------------
// Glow squid (vanilla SquidModel, 64x32)

function glowSquid(): TexImage {
  const t = img(64, 32);
  const r = new Rand(0x610);
  const BODY = [0x0b3438, 0x0f4145, 0x134e53, 0x185c61];
  const GLOW = [0x39d4b6, 0x58e6ca, 0x8af3dc];
  const DEEP = [0x082628, 0x0a2e31];
  const body = boxFaces(0, 0, 12, 16, 12), ten = boxFaces(48, 0, 2, 18, 2);
  for (const k of ['top', 'bottom', 'right', 'front', 'left', 'back'] as const) noiseFace(t, body[k], r, BODY, { w: [2, 4, 4, 2] });
  noiseFace(t, body.bottom, r, DEEP);
  // glowing specks over its mantle, thickest toward its top, and a ring of them round its middle
  for (const k of SIDES) {
    paintFace(t, body[k], (x, y, c, w, h) => (r.chance(0.13 * (1 - y / h) + 0.02) ? pick(r, GLOW) : y === 10 && (x + 1) % 3 === 0 ? GLOW[1] : c));
  }
  paintFace(t, body.top, (_x, _y, c) => (r.chance(0.12) ? pick(r, GLOW) : c));
  // the eyes: glowing rims round a dark pupil on either side
  for (const k of ['right', 'left'] as const) {
    const [x0, y0] = body[k];
    for (const [dx, dy, c] of [[4, 4, GLOW[0]], [5, 4, GLOW[1]], [6, 4, GLOW[0]], [4, 5, GLOW[1]], [5, 5, 0x031012], [6, 5, GLOW[1]], [4, 6, GLOW[0]], [5, 6, GLOW[1]], [6, 6, GLOW[0]]] as [number, number, number][])
      plot(t, x0 + dx, y0 + dy, c);
  }
  // the tentacles: dark, lit toward their tips
  for (const k of ['top', 'bottom', 'right', 'front', 'left', 'back'] as const) noiseFace(t, ten[k], r, BODY);
  for (const k of SIDES) paintFace(t, ten[k], (_x, y, c, _w, h) => (y > h * 0.55 && r.chance((y / h) * 0.8) ? pick(r, GLOW) : c));
  return t;
}

// ---------------------------------------------------------------------------

MOB_TEXTURES.cod = cod;
MOB_TEXTURES.salmon = salmon;
MOB_TEXTURES.pufferfish = pufferfish;
MOB_TEXTURES.tropical_a = () => tropicalBase(false);
MOB_TEXTURES.tropical_b = () => tropicalBase(true);
['kob', 'sunstreak', 'snooper', 'dasher', 'brinely', 'spotty'].forEach((n, i) => (MOB_TEXTURES[`tropical_a_pattern_${i + 1}`] = () => tropicalPattern(false, n)));
['flopper', 'stripey', 'glitter', 'blockfish', 'betty', 'clayfish'].forEach((n, i) => (MOB_TEXTURES[`tropical_b_pattern_${i + 1}`] = () => tropicalPattern(true, n)));
MOB_TEXTURES.dolphin = dolphin;
MOB_TEXTURES.glow_squid = glowSquid;

// vanilla particle/glow: a small bright cross, tinted by the spark's colour (particles.ts)
MOB_PARTICLE_TEXTURES.glow = () => {
  const t = img(8, 8);
  for (const [x, y, c] of [[3, 2, 0xc8c8c8], [2, 3, 0xc8c8c8], [3, 3, 0xffffff], [4, 3, 0xc8c8c8], [3, 4, 0xc8c8c8]] as [number, number, number][]) plot(t, x, y, c);
  return t;
};
