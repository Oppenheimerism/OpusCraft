// The conduit's textures (Stage 5: ocean; vanilla entity/conduit/base.png, cage.png, wind.png, wind_vertical.png,
// open_eye.png, closed_eye.png and particle/nautilus.png), drawn in the nautilus shell's and the heart of the sea's
// colours: the closed shell it sits in asleep (a 6-pixel cube, 32x16), the open cage of shell it turns in awake (an
// 8-pixel cube, 32x16), the swirl of current round it (a 16-pixel cube, 64x32, in 22 frames three ticks each, as
// vanilla's animation runs; the vertical one for when it swirls the other way), its eye (8x8 on 16x16, the back the
// same as the front), open while it hunts; and the little spiral spark it draws in from its frame.

import { TexImage, img, plot } from './tex';
import { MOB_TEXTURES, MOB_PARTICLE_TEXTURES } from './mobs';

/** the nautilus shell item's colours: outline, stripe, cream, light cream */
const SHELL = { dark: 0x6a4a3a, stripe: 0xb07a5a, cream: 0xf0e0d0, light: 0xfaf0e6 };
/** the heart of the sea's blues, dark to light */
const HEART = [0x061634, 0x103c7a, 0x2470bc, 0x3a92d8, 0x7ac4f0, 0xc8f0ff];

/** the faces of an s-pixel cube laid out on its texture from (u, v) (vanilla's cube UV layout): [name, u, v] */
function boxFaces(u: number, v: number, s: number): [string, number, number][] {
  return [['up', u + s, v], ['down', u + 2 * s, v], ['west', u, v + s], ['north', u + s, v + s], ['east', u + 2 * s, v + s], ['south', u + 3 * s, v + s]];
}

/** a face of closed shell: cream with brown bands curling across it, a dark rim */
function shellFace(t: TexImage, u: number, v: number, s: number, seed: number): void {
  for (let j = 0; j < s; j++)
    for (let i = 0; i < s; i++) {
      const edge = i === 0 || j === 0 || i === s - 1 || j === s - 1;
      const band = (i + j * 2 + seed) % 4 === 0 || (i * j + seed) % 7 === 3;
      plot(t, u + i, v + j, edge ? (band ? SHELL.dark : SHELL.stripe) : band ? SHELL.stripe : (i + j + seed) % 3 === 0 ? SHELL.light : SHELL.cream);
    }
}

/** vanilla entity/conduit/base.png: the shell, closed round the heart */
function base(): TexImage {
  const t = img(32, 16);
  boxFaces(0, 0, 6).forEach(([, u, v], k) => shellFace(t, u, v, 6, k));
  return t;
}

/** vanilla entity/conduit/cage.png: the cage, an open frame of shell on each side, thick at the corners */
function cage(): TexImage {
  const t = img(32, 16);
  const s = 8;
  boxFaces(0, 0, s).forEach(([, u, v], k) => {
    for (let j = 0; j < s; j++)
      for (let i = 0; i < s; i++) {
        const ei = i === 0 || i === s - 1, ej = j === 0 || j === s - 1;
        const corner = (i <= 1 || i >= s - 2) && (j <= 1 || j >= s - 2);
        if (!ei && !ej && !corner) continue;
        // a gap in the middle of every other side of the frame, as the shell pieces don't quite meet
        if ((ei && !ej && (j === 3 || j === 4) && (k + i) % 2 === 0) || (ej && !ei && (i === 3 || i === 4) && (k + j) % 2 === 1)) continue;
        const c = corner ? ((i + j) % 2 === 0 ? SHELL.stripe : SHELL.dark) : (i + j + k) % 3 === 0 ? SHELL.stripe : (i + j) % 2 ? SHELL.cream : SHELL.light;
        plot(t, u + i, v + j, c);
      }
  });
  return t;
}

/** the wind's colours: tail to head */
const WIND = [0x3f9fb0, 0x69c3cf, 0xa6e6ee, 0xe4fbff];

/**
 * one frame of vanilla entity/conduit/wind.png (or wind_vertical.png): wisps of current running across each face of
 * the 16-pixel cube, rising and falling as they go, round once in the 22 frames
 */
function windFrame(frame: number, vertical: boolean): TexImage {
  const t = img(64, 32);
  const s = 16;
  const phase = frame / 22;
  boxFaces(0, 0, s).forEach(([, u, v], k) => {
    for (let n = 0; n < 3; n++) {
      const row = (n * 5 + k * 3 + 2) % s;
      const head = Math.floor(phase * 32 + n * 11 + k * 7) % 32 - 8;
      for (let q = 0; q < 7; q++) {
        const a = head - q;
        if (a < 0 || a >= s) continue;
        const b = row + Math.round(Math.sin((a + n * 2 + k) * 0.55) * 1.4);
        if (b < 0 || b >= s) continue;
        const c = WIND[Math.max(0, 3 - Math.floor(q / 2))];
        if (vertical) plot(t, u + b, v + a, c);
        else plot(t, u + a, v + b, c);
      }
    }
  });
  return t;
}

/** vanilla entity/conduit/open_eye.png: the heart's eye, round and staring, a slit pupil */
const OPEN_EYE = ['..bbbb..', '.bdDDdb.', 'bdLpPLdb', 'bDLpPlDb', 'bDlpPlDb', 'bdlpPldb', '.bdDDdb.', '..bbbb..'];
/** vanilla entity/conduit/closed_eye.png: the eye shut, the lid drawn down over it */
const CLOSED_EYE = ['........', '..bbbb..', '.bDDDDb.', 'bDddddDb', 'bpppppbb', '.bdDDdb.', '..bbbb..', '........'];
const EYE_INK: Record<string, number> = { b: HEART[0], p: HEART[0], P: 0x2a0a3a, d: HEART[1], D: HEART[2], l: HEART[3], L: HEART[5] };

function eye(rows: string[]): TexImage {
  const t = img(16, 16);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const c = EYE_INK[rows[y][x]];
      if (c === undefined) continue;
      // (the front at (0, 0), the back beside it at (8, 0), mirrored so it reads the same from behind)
      plot(t, x, y, c);
      plot(t, 15 - x, y, c);
    }
  return t;
}

/** vanilla particle/nautilus.png: a little spiral, pale (tinted as the enchanting table's runes are) */
function nautilusParticle(): TexImage {
  const t = img(8, 8);
  const px: [number, number, number][] = [
    [3, 1, 0xd8f4ff], [4, 1, 0xd8f4ff], [5, 2, 0xffffff], [5, 3, 0xffffff], [5, 4, 0xd8f4ff], [4, 5, 0xd8f4ff], [3, 5, 0xa8d8f0],
    [2, 4, 0xa8d8f0], [2, 3, 0xffffff], [3, 2, 0xa8d8f0], [4, 3, 0xffffff], [3, 3, 0xd8f4ff], [2, 2, 0xd8f4ff], [1, 3, 0xa8d8f0], [1, 4, 0x7ab4d8], [2, 5, 0x7ab4d8], [2, 6, 0x7ab4d8],
  ];
  for (const [x, y, c] of px) plot(t, x, y, c);
  return t;
}

/** the frames of the wind's animation (vanilla wind.png.mcmeta: 22 frames, 3 ticks each: round once in 66 ticks) */
export const WIND_FRAMES = 22;
export const WIND_FRAME_TICKS = 3;

MOB_TEXTURES.conduit_base = base;
MOB_TEXTURES.conduit_cage = cage;
for (let i = 0; i < WIND_FRAMES; i++) {
  MOB_TEXTURES[`conduit_wind_${i}`] = () => windFrame(i, false);
  MOB_TEXTURES[`conduit_wind_vertical_${i}`] = () => windFrame(i, true);
}
MOB_TEXTURES.conduit_open_eye = () => eye(OPEN_EYE);
MOB_TEXTURES.conduit_closed_eye = () => eye(CLOSED_EYE);
MOB_PARTICLE_TEXTURES.nautilus = nautilusParticle;
