// The guardians' skins (Stage 5: ocean; vanilla textures/entity/guardian.png, guardian_elder.png and
// guardian_beam.png), in GuardianModel's 64x64 layout. The guardian: a squat teal fish-block mottled darker, its
// four armour plates rimmed in dark teal and flecked with orange, one great pale eye in the middle of its face under
// an orange lid, a dark red pupil, orange-tan spikes and an orange tail fin. The elder: the same shape in weathered
// bone-grey, patched with slate purple, its spikes pale. The beam: a bright core fading to see-through at its edges
// in pulses down its length (tinted purple to yellow as it charges), and at its end two frames of a glinting cap.
// Original pixel art in the style of vanilla 1.21.

import { TexImage, img, plot, clear, getPx, mixC, mulC } from './tex';
import { Rand } from '../core/rng';
import { MOB_TEXTURES, boxFaces, noiseBox, paintFace, pick, type Box, type Pal } from './mobs';

// vanilla GuardianModel.createBodyLayer's boxes
const HEAD = boxFaces(0, 0, 12, 12, 16);
const SIDE_PLATE = boxFaces(0, 28, 2, 12, 12);
const FLAT_PLATE = boxFaces(16, 40, 12, 2, 12);
const SPIKE = boxFaces(0, 0, 2, 9, 2);
const EYE = boxFaces(8, 0, 2, 2, 1);
const TAIL0 = boxFaces(40, 0, 4, 4, 8);
const TAIL1 = boxFaces(0, 54, 3, 3, 7);
const TAIL2 = boxFaces(41, 32, 2, 2, 6);
const FIN = boxFaces(25, 19, 1, 9, 9);

interface GuardianLook {
  seed: number;
  body: Pal;
  bodyW: Pal;
  /** the patches and flecks on the plates and sides */
  patch: Pal;
  /** the plates' rims */
  rim: number;
  spike: Pal;
  fin: Pal;
  lid: Pal;
  sclera: Pal;
  pupil: [number, number];
}

const LOOKS: Record<'guardian' | 'elder_guardian', GuardianLook> = {
  guardian: {
    seed: 0x6ad1a7,
    body: [0x3d6b5f, 0x49796b, 0x558776, 0x619380, 0x6f9f8c],
    bodyW: [1, 3, 5, 4, 1],
    patch: [0xc9682c, 0xdc7a35, 0xe98f45],
    rim: 0x2c5048,
    spike: [0xd98a3d, 0xe69c4a, 0xf0ae5a, 0xf5c070],
    fin: [0xc9682c, 0xdc7a35, 0xe98f45, 0xf1a254],
    lid: [0xc9682c, 0xdc7a35],
    sclera: [0xe9ddd6, 0xf3ebe6, 0xfaf5f1],
    pupil: [0x5a1c12, 0x7c2a17],
  },
  elder_guardian: {
    seed: 0xe1de7,
    body: [0xaeab98, 0xbbb8a5, 0xc7c4b2, 0xd2d0bf, 0xdddbcc],
    bodyW: [1, 3, 5, 4, 1],
    patch: [0x60617c, 0x6d6e89, 0x7a7c97],
    rim: 0x8e8b7a,
    spike: [0xcfc9b4, 0xdcd7c4, 0xe8e4d4, 0xf1eee2],
    fin: [0x60617c, 0x6d6e89, 0x7a7c97, 0x8a8ca6],
    lid: [0x6d6e89, 0x7a7c97],
    sclera: [0xe6d8d8, 0xefe4e4, 0xf7f0f0],
    pupil: [0x3c2440, 0x523256],
  },
};

/** a few blotches of `pal` over a face */
function blotches(t: TexImage, f: [number, number, number, number], r: Rand, n: number, pal: Pal): void {
  const [x0, y0, w, h] = f;
  for (let k = 0; k < n; k++) {
    const cx = r.nextInt(w), cy = r.nextInt(h), big = r.chance(0.5);
    for (const [ox, oy] of big ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0], [1, 0]]) {
      if (cx + ox < w && cy + oy < h) plot(t, x0 + cx + ox, y0 + cy + oy, pick(r, pal));
    }
  }
}

/** a dark rim round a face, the pixels inside it lit a little */
function rimmed(t: TexImage, f: [number, number, number, number], rim: number): void {
  paintFace(t, f, (x, y, c, w, h) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? mixC(c, rim, 0.7) : x === 1 || y === 1 ? mulC(c, 1.07) : undefined));
}

function guardian(kind: 'guardian' | 'elder_guardian'): TexImage {
  const k = LOOKS[kind];
  const t = img(64, 64);
  const r = new Rand(k.seed);
  // the body: mottled, darker underneath, a patch or two on the sides and top
  noiseBox(t, HEAD, r, k.body, { w: k.bodyW, cell: 2, white: 0.45 });
  paintFace(t, HEAD.bottom, (_x, _y, c) => mulC(c, 0.82));
  paintFace(t, HEAD.top, (_x, _y, c) => mulC(c, 1.05));
  for (const f of [HEAD.right, HEAD.left, HEAD.top, HEAD.back]) blotches(t, f, r, 4, k.patch);
  // the face: an orange lid round a great pale eye, the eye shaded at its rim (the pupil is its own little box)
  const [fx, fy] = HEAD.front;
  for (let y = 3; y <= 9; y++)
    for (let x = 1; x <= 10; x++) {
      const corner = (x === 1 || x === 10) && (y === 3 || y === 9);
      if (corner) continue;
      const inEye = x >= 2 && x <= 9 && y >= 4 && y <= 8 && !((x === 2 || x === 9) && (y === 4 || y === 8));
      if (inEye) {
        const edge = x === 2 || x === 9 || y === 4 || y === 8;
        plot(t, fx + x, fy + y, edge ? k.sclera[0] : pick(r, k.sclera.slice(1)));
      } else plot(t, fx + x, fy + y, pick(r, k.lid));
    }
  // (a shadow under the brow)
  for (let x = 3; x <= 8; x++) plot(t, fx + x, fy + 4, mixC(getPx(t, fx + x, fy + 4), k.lid[0], 0.35));
  // the plates: rimmed dark, flecked
  for (const b of [SIDE_PLATE, FLAT_PLATE] as Box[]) {
    noiseBox(t, b, r, k.body, { w: k.bodyW, cell: 1, white: 0.5 });
    for (const f of [b.right, b.left, b.top, b.bottom]) {
      rimmed(t, f, k.rim);
      blotches(t, f, r, 3, k.patch);
    }
  }
  // the spikes: tan, the tips darker
  noiseBox(t, SPIKE, r, k.spike, { cell: 1, white: 0.6 });
  for (const f of [SPIKE.right, SPIKE.front, SPIKE.left, SPIKE.back]) paintFace(t, f, (_x, y, c, _w, h) => (y === 0 || y === h - 1 ? mulC(c, 0.72) : undefined));
  // the pupil
  noiseBox(t, EYE, r, k.pupil, { cell: 1 });
  plot(t, EYE.front[0], EYE.front[1], k.pupil[0]);
  plot(t, EYE.front[0] + 1, EYE.front[1] + 1, k.pupil[0]);
  plot(t, EYE.front[0] + 1, EYE.front[1], mixC(k.pupil[1], 0xffffff, 0.25));
  // the tail: the body's colour, tapering to the fin
  for (const b of [TAIL0, TAIL1, TAIL2]) {
    noiseBox(t, b, r, k.body, { w: k.bodyW, cell: 1 });
    paintFace(t, b.bottom, (_x, _y, c) => mulC(c, 0.85));
  }
  blotches(t, TAIL0.top, r, 2, k.patch);
  // the fin: a fan of rays, lighter toward its edge
  noiseBox(t, FIN, r, k.fin, { cell: 1 });
  for (const f of [FIN.right, FIN.left])
    paintFace(t, f, (x, y, c, w, h) => {
      const edge = x === w - 1 || y === 0 || y === h - 1;
      if ((x === w - 1 && (y === 0 || y === h - 1)) || (x === w - 2 && (y === 0 || y === h - 1))) return null;
      return edge ? mixC(c, 0xffffff, 0.18) : y % 2 === 0 ? mulC(c, 0.88) : undefined;
    });
  return t;
}

/**
 * vanilla guardian_beam.png: the left half the beam's side (a white core, grey glow, see-through between the pulses
 * running down it), the right half its end cap in two frames (the renderer flips between them every other tick)
 */
function guardianBeam(): TexImage {
  const t = img(16, 16);
  for (let y = 0; y < 16; y++) {
    // two pulses down each repeat of the texture
    const pulse = 0.5 + 0.5 * Math.cos((y / 16) * Math.PI * 4);
    for (let x = 0; x < 8; x++) {
      const d = Math.abs(x - 3.5);
      const core = d < 1 ? 1 : d < 2 ? 0.55 + 0.35 * pulse : d < 3 ? 0.25 * pulse : 0;
      if (core < 0.12) clear(t, x, y);
      else {
        const v = Math.round(150 + 105 * core);
        plot(t, x, y, (v << 16) | (v << 8) | v);
      }
    }
  }
  // the cap: a glinting square ring, then a cross
  for (let f = 0; f < 2; f++)
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const dx = Math.abs(x - 3.5), dy = Math.abs(y - 3.5);
        const on = f === 0 ? Math.max(dx, dy) > 1.5 && Math.max(dx, dy) < 3 : dx < 1 || dy < 1 || (dx < 2 && dy < 2);
        if (!on) {
          clear(t, 8 + x, f * 8 + y);
          continue;
        }
        const v = Math.round(255 - 60 * (Math.max(dx, dy) / 3.5));
        plot(t, 8 + x, f * 8 + y, (v << 16) | (v << 8) | v);
      }
  return t;
}

MOB_TEXTURES.guardian = () => guardian('guardian');
MOB_TEXTURES.elder_guardian = () => guardian('elder_guardian');
MOB_TEXTURES.guardian_beam = guardianBeam;
