// (the wither) The wither's skins (vanilla textures/entity/wither/wither.png and wither_invulnerable.png, 64x64 on
// WitherBossModel's layout, with the skull WitherSkullRenderer fires drawn below it): a sooty, near-black skeleton.
// Three skulls, the middle one big, each with two deep black eye sockets under a pale-edged brow, a dark nose hole and
// a grin of grey teeth, the crowns cracked and worn; a collar bone across the shoulders, knobbed at its ends and at the
// middle where the spine hangs from it; the spine and the tail a column of vertebrae, ringed by dark gaps and darker
// down the tail; and a curved rib, lighter along its upper edge, that all three ribs share. While it charges up after
// it is built (and on its blue skull) the same bones are washed out pale, a blue-grey going to white with a cold blue
// cast. And its armour (wither_armor.png), the energy swirl it wears below half health, added on and scrolled over it:
// wavy diagonal streaks of light blue going to violet, with glints, on nothing, tiling both ways so the swirl never
// shows a seam. Original pixel art.

import { Rand } from '../core/rng';
import { getA, getPx, img, mixC, plot, setPx, valueNoise, type TexImage } from './tex';
import { MOB_TEXTURES, boxFaces, drawFace, noiseFace, paintFace, pick, type Box, type Face, type Pal } from './mobs';

/** how a skin is coloured; both skins are the one drawing */
interface WitherLook {
  /** the bone, dark to light (seven shades, weighted by BONE_W) */
  bone: Pal;
  /** brows, worn edges and ridges catching the light */
  lit: Pal;
  /** cracks, and the seams between bones */
  crack: Pal;
  /** the face: eye sockets (K, k round their rims), nose hole (n), mouth (D), teeth (t) */
  face: Record<'K' | 'k' | 'n' | 'D' | 't', number>;
}

const BONE_W: Pal = [1, 2, 5, 7, 5, 2, 1];

/** vanilla wither.png: charcoal bone, near black, its ridges and worn edges a lighter grey */
const WITHER: WitherLook = {
  bone: [0x181818, 0x1e1e1e, 0x242424, 0x2a2a2a, 0x313131, 0x393939, 0x424242],
  lit: [0x4e4e4e, 0x5a5a5a, 0x666666],
  crack: [0x0a0a0a, 0x0f0f0f],
  face: { K: 0x000000, k: 0x0b0b0b, n: 0x040404, D: 0x080808, t: 0x737373 },
};

/** vanilla wither_invulnerable.png: the same bones washed out, blue-grey going to white with a cold blue cast */
const WITHER_INVULNERABLE: WitherLook = {
  bone: [0x8796b2, 0x95a3be, 0xa3b1c9, 0xb2bfd4, 0xc1cdde, 0xd0dae8, 0xdfe7f2],
  lit: [0xe9eff8, 0xf1f5fb, 0xf8fbff],
  crack: [0x66779a, 0x7182a3],
  face: { K: 0x1c2747, k: 0x34426a, n: 0x26335a, D: 0x2b3860, t: 0xf8fbff },
};

// WitherBossModel's boxes (vanilla texOffs and sizes), and the skull WitherSkullRenderer fires
const HEAD = boxFaces(0, 0, 8, 8, 8);
const SIDE_HEAD = boxFaces(32, 0, 6, 6, 6);
const SHOULDERS = boxFaces(0, 16, 20, 3, 3);
const SPINE = boxFaces(0, 22, 3, 10, 3);
const TAIL = boxFaces(12, 22, 3, 6, 3);
const RIB = boxFaces(24, 22, 11, 2, 2);
const SKULL = boxFaces(0, 35, 8, 8, 8);

/**
 * the faces of the skulls ('.' the bone left as it is): L a lit brow over each socket, K the sockets (k their lower
 * rims), l the bridge of the nose, c the cheekbones, n the nose hole, D the mouth and t the teeth
 */
const FACE_BIG = [
  '........',
  '.LL..LL.',
  '.KK..KK.',
  '.KK..KK.',
  '.kKllKk.',
  '..cnnc..',
  'DtDttDtD',
  '.t.tt.t.',
];
const FACE_SMALL = [
  'LL..LL',
  'KK..KK',
  'Kk..kK',
  '.cnnc.',
  'tDttDt',
  '......',
];

function witherSkin(look: WitherLook): TexImage {
  const t = img(64, 64);
  const r = new Rand(0x3171e5);
  const B = look.bone;
  /** a bone shade between lo and hi (0 the darkest, 6 the lightest), weighted as the bone's noise is */
  const bone = (lo: number, hi: number) => {
    const a = Math.max(0, lo), b = Math.min(B.length - 1, hi);
    return pick(r, B.slice(a, b + 1), BONE_W.slice(a, b + 1));
  };
  /** colour `c` moved `d` shades lighter (or darker) along the bone; anything else is left as it is */
  const shift = (c: number, d: number) => {
    const i = B.indexOf(c);
    return i < 0 ? c : B[Math.max(0, Math.min(B.length - 1, i + d))];
  };
  const lit = () => pick(r, look.lit);
  const seam = () => pick(r, look.crack);
  const fillBox = (b: Box) => {
    for (const f of Object.values(b)) noiseFace(t, f, r, B, { w: BONE_W, cell: 2, white: 0.55 });
  };

  /**
   * a crack wandering `len` pixels over face `f` from (x, y), mostly along (dx, dy), now and then a step aside, its
   * lower (or right) edge chipped pale here and there
   */
  const crack = (f: Face, x: number, y: number, len: number, dx: number, dy: number) => {
    const [x0, y0, w, h] = f;
    for (let i = 0; i < len; i++) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      plot(t, x0 + x, y0 + y, seam());
      const ex = x + (dx === 0 ? 1 : 0), ey = y + (dx === 0 ? 0 : 1);
      if (r.chance(0.3) && ex < w && ey < h) plot(t, x0 + ex, y0 + ey, shift(getPx(t, x0 + ex, y0 + ey), 2));
      if (r.chance(0.35)) {
        if (dx === 0) x += r.chance(0.5) ? 1 : -1;
        else y += r.chance(0.5) ? 1 : -1;
      } else {
        x += dx;
        y += dy;
      }
    }
  };
  /** a few cracks scattered over face `f` */
  const cracks = (f: Face, n: number, len: number) => {
    const [, , w, h] = f;
    for (let i = 0; i < n; i++) {
      const down = r.chance(0.5);
      crack(f, r.nextInt(w), r.nextInt(h), len + r.nextInt(2), down ? 0 : r.chance(0.5) ? 1 : -1, down ? 1 : 0);
    }
  };
  /** worn, lighter chips along the edges of face `f` */
  const chips = (f: Face, p: number) =>
    paintFace(t, f, (x, y, c, w, h) => ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && r.chance(p) ? shift(c, 2) : undefined));

  /**
   * a skull, `s` texels a side: the bone mottled, lit along its top edges and darker underneath; the crown cracked (the
   * big one's along its middle); a hole for the ear low on each side, and one at the back of the base where the neck
   * goes in; and its face
   */
  const skull = (b: Box, s: number, face: readonly string[]) => {
    fillBox(b);
    // (the face's bone calmer, for its features to stand out of)
    noiseFace(t, b.front, r, B.slice(2, 5), { w: [3, 5, 3], cell: 2, white: 0.4 });
    // (light from above: each side's top row lit, its lowest a shade darker; the jaw's underside in shadow)
    for (const f of [b.right, b.front, b.left, b.back])
      paintFace(t, f, (_x, y, c, _w, h) => (y === 0 ? shift(c, 2) : y === h - 1 ? shift(c, -1) : undefined));
    paintFace(t, b.bottom, (_x, y, c, _w, h) => (y === h - 1 ? shift(c, -1) : shift(c, -2)));
    // the crown: its front edge (the brow) lit, the big skull's seam down the middle from the back, a crack besides
    paintFace(t, b.top, (_x, y, c, _w, h) => (y === h - 1 ? lit() : y === h - 2 ? shift(c, 1) : undefined));
    if (s > 6) crack(b.top, (s >> 1) - (r.chance(0.5) ? 1 : 0), 0, s - 3, 0, 1);
    cracks(b.top, 1, 2);
    // the sides (the right's front is its last column, the left's its first): the cheek lit, an ear hole behind it
    paintFace(t, b.right, (x, y, c, w) => (x === w - 1 && y > 0 ? shift(c, 1) : undefined));
    paintFace(t, b.left, (x, y, c) => (x === 0 && y > 0 ? shift(c, 1) : undefined));
    const ear = s > 6 ? 2 : 1, earY = s - (s > 6 ? 3 : 2);
    plot(t, b.right[0] + ear, b.right[1] + earY, look.face.k);
    plot(t, b.left[0] + s - 1 - ear, b.left[1] + earY, look.face.k);
    cracks(b.right, 1, s > 6 ? 3 : 2);
    cracks(b.left, 1, s > 6 ? 3 : 2);
    // the back: darker toward the base, the hole where the neck goes in, a crack
    paintFace(t, b.back, (x, y, c, w, h) => {
      if (y === h - 1 && (x === (w >> 1) - 1 || x === w >> 1)) return look.face.k;
      return y >= h - 3 ? shift(c, -1) : undefined;
    });
    cracks(b.back, 1, s > 6 ? 3 : 2);
    for (const f of [b.top, b.right, b.left, b.back]) chips(f, 0.12);
    // the face
    drawFace(t, b.front, face, {
      L: lit,
      l: () => bone(4, 6),
      c: () => bone(5, 6),
      K: look.face.K,
      k: look.face.k,
      n: look.face.n,
      D: look.face.D,
      t: () => mixC(look.face.t, B[3], r.next() * 0.3),
    }, r);
  };

  skull(HEAD, 8, FACE_BIG);
  skull(SIDE_HEAD, 6, FACE_SMALL);

  // the collar bone: a shaft between knobs at its ends (under the side heads) and at the middle (under the middle
  // head, the spine hanging from it), a dark groove where each knob narrows to the shaft
  const knob = (i: number) => i <= 2 || i >= 17 || (i >= 8 && i <= 11);
  const groove = (i: number) => i === 3 || i === 16 || i === 7 || i === 12;
  fillBox(SHOULDERS);
  const along = (i: number, y: number, c: number) => {
    if (groove(i)) return y === 0 ? shift(c, -1) : seam();
    if (knob(i)) return y === 0 ? lit() : shift(c, y === 1 ? 2 : 0);
    return y === 0 ? shift(c, 1) : y === 2 ? shift(c, -1) : undefined;
  };
  paintFace(t, SHOULDERS.front, (x, y, c) => along(x, y, c));
  paintFace(t, SHOULDERS.back, (x, y, c) => along(19 - x, y, c));
  // (its top: the middle row along the top of the bone lit, the knobs lighter still; underneath in shadow)
  paintFace(t, SHOULDERS.top, (x, y, c) => (groove(x) ? shift(c, -1) : knob(x) ? (y === 1 ? lit() : shift(c, 2)) : y === 1 ? shift(c, 1) : undefined));
  paintFace(t, SHOULDERS.bottom, (x, _y, c) => (groove(x) ? seam() : shift(c, knob(x) ? 0 : -2)));
  // (its ends: the round of a knob, lit in the middle)
  for (const f of [SHOULDERS.right, SHOULDERS.left])
    paintFace(t, f, (x, y, c) => (x === 1 && y === 1 ? lit() : x === 1 || y === 1 ? shift(c, 2) : shift(c, -1)));
  for (const f of [SHOULDERS.front, SHOULDERS.top, SHOULDERS.back]) {
    crack(f, 4 + r.nextInt(3), r.nextInt(3), 3, 1, 0);
    crack(f, 13 + r.nextInt(3), r.nextInt(3), 3, 1, 0);
  }

  // the spine and the tail: vertebrae, each lit along its top, a dark gap under it; the ridge down the front and the
  // back lighter; the tail narrowing and darker toward its tip
  fillBox(SPINE);
  fillBox(TAIL);
  /** vertebrae three rows apart down face `f` (the first `skip` rows down into one), dimming `fade` shades to the end */
  const vertebrae = (f: Face, skip: number, fade: number, ridge: boolean) =>
    paintFace(t, f, (x, y, c, w, h) => {
      const k = (y + skip) % 3;
      if (k === 2) return seam();
      const dim = -Math.floor((y / h) * fade);
      // (the tail narrowing: its last rows dark at the sides)
      const edge = (x === 0 || x === w - 1) && fade > 0 && y >= h - 2 ? -1 : 0;
      const c2 = shift(c, dim + edge);
      // (a vertebra's lit top, brightest on the ridge, if not down at the tail's tip)
      if (k === 0) return x === 1 && ridge ? (fade > 0 && y >= h - 2 ? shift(c2, 3) : lit()) : shift(c2, 2);
      return x === 1 && ridge ? shift(c2, 1) : c2;
    });
  for (const f of [SPINE.right, SPINE.left]) vertebrae(f, 0, 0, false);
  for (const f of [SPINE.front, SPINE.back]) vertebrae(f, 0, 0, true);
  for (const f of [TAIL.right, TAIL.left]) vertebrae(f, 1, 3, false);
  for (const f of [TAIL.front, TAIL.back]) vertebrae(f, 1, 3, true);
  // (the ends: a vertebra's round, the dark of the spinal canal in its middle; the tail's tip just bone)
  for (const f of [SPINE.top, SPINE.bottom, TAIL.top])
    paintFace(t, f, (x, y, c) => (x === 1 && y === 1 ? look.face.k : shift(c, x === 1 || y === 1 ? 1 : -1)));
  paintFace(t, TAIL.bottom, (x, y, c) => (x === 1 && y === 1 ? undefined : shift(c, -3)));

  // a rib (all three are this one): curving round from the spine, lighter along its upper edge, darker toward its tips
  // and where it meets the spine in the middle
  fillBox(RIB);
  const ribAlong = (i: number) => (i === 0 || i === 10 ? -2 : i === 1 || i === 9 ? -1 : i >= 4 && i <= 6 ? -2 : 0);
  paintFace(t, RIB.front, (x, y, c) => (y === 0 ? (ribAlong(x) === 0 && r.chance(0.5) ? lit() : shift(c, 2 + ribAlong(x))) : shift(c, ribAlong(x) - 1)));
  paintFace(t, RIB.back, (x, y, c) => shift(c, ribAlong(10 - x) + (y === 0 ? 1 : -1)));
  paintFace(t, RIB.top, (x, y, c) => shift(c, ribAlong(x) + (y === 1 ? 2 : 1)));
  paintFace(t, RIB.bottom, (x, _y, c) => shift(c, ribAlong(x) - 2));
  for (const f of [RIB.right, RIB.left]) paintFace(t, f, (_x, y, c) => shift(c, y === 0 ? 0 : -2));
  crack(RIB.front, 2, 1, 2, 1, 0);
  crack(RIB.front, 7, 1, 2, 1, 0);

  // the skull it fires: the middle head over again, texel for texel
  const du = SKULL.right[0] - HEAD.right[0], dv = SKULL.top[1] - HEAD.top[1];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 32; x++) if (getA(t, x, y)) plot(t, x + du, y + dv, getPx(t, x, y));
  return t;
}

MOB_TEXTURES['wither'] = () => witherSkin(WITHER);
MOB_TEXTURES['wither_invulnerable'] = () => witherSkin(WITHER_INVULNERABLE);

// ---------------------------------------------------------------------------
// its armour

/** the swirl's colours, dark to light: deep violet, blue-violet, light blue, and the white-blue of its cores */
const SWIRL: Pal = [0x2b1d78, 0x4a3cc4, 0x6f6cf0, 0x8fa8ff, 0xb9d6ff, 0xe4f2ff];

/**
 * vanilla wither_armor.png (added on at half strength over the wither, its UVs scrolling and wrapping): wavy diagonal
 * streaks of light blue edged in violet, swelling and thinning, fainter violet ones weaving between them, and glints,
 * on nothing. Every wave (and the noise that bends them) fits the tile a whole number of times across and down, so it
 * wraps without a seam
 */
function witherArmor(): TexImage {
  const t = img(64, 64);
  const r = new Rand(0xa2e0c0);
  const TAU = Math.PI * 2;
  const frac = (v: number) => v - Math.floor(v);
  // (slow noise, itself wrapping: how far the streaks stray, and where they swell and burn bright or thin and fade)
  const drift = valueNoise(r, 64, 64, 32);
  const drift2 = valueNoise(r, 64, 64, 32);
  const swell = valueNoise(r, 64, 64, 16);
  const glow = new Float32Array(64 * 64);
  /** how bright a streak is at `b` (where across its period of 1 the pixel lies), its core at `half` */
  const streak = (b: number, half: number) => (b < 2 * half ? 1 - Math.abs(b - half) / half : 0);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const u = x / 64, v = y / 64, k = y * 64 + x;
      // the streaks: four across the tile and four down, running from top right to bottom left, wavering
      const w = 0.15 * Math.sin(TAU * (2 * u - 3 * v)) + 0.07 * Math.sin(TAU * (3 * u + 2 * v) + 1.3) + 0.4 * (drift[k] - 0.5);
      let i = streak(frac(4 * u + 4 * v + w), 0.09 + 0.08 * swell[k]) * (0.6 + 0.55 * swell[k]);
      // fainter ones between them, wavering their own way, so that the two weave in and out of each other
      const w2 = 0.12 * Math.sin(TAU * (3 * u - 2 * v) + 2.1) + 0.45 * (drift2[k] - 0.5);
      i = Math.max(i, 0.5 * streak(frac(4 * u + 4 * v + 0.5 + w2), 0.075) * (1.1 - 0.6 * swell[k]));
      glow[k] = i * (0.85 + r.next() * 0.3);
    }
  // (glints: a bright point on a streak, a cross of fainter light round it)
  for (let n = 0; n < 18; n++) {
    const x = r.nextInt(64), y = r.nextInt(64);
    if (glow[y * 64 + x] < 0.3) continue;
    glow[y * 64 + x] = 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (((y + dy) & 63) << 6) | ((x + dx) & 63);
      glow[k] = Math.max(glow[k], 0.85);
    }
  }
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const i = glow[y * 64 + x];
      if (i < 0.18) continue;
      const k = Math.min(1, i) * (SWIRL.length - 1);
      const lo = Math.floor(k);
      setPx(t, x, y, lo >= SWIRL.length - 1 ? SWIRL[SWIRL.length - 1] : mixC(SWIRL[lo], SWIRL[lo + 1], k - lo));
    }
  return t;
}

MOB_TEXTURES['wither_armor'] = witherArmor;
