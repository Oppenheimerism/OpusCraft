// The deep dark's item sprites: the candles (vanilla item/<colour>_candle), disc fragment 5 and music disc 5 with the
// seams of its nine fragments, and the recovery compass's needle frames (recovery_compass_00..31, like compass_NN:
// frame i is the needle i/32 of a turn clockwise from straight up).

import { TexImage, plot, mixC } from '../tex';
import { Gen, spr } from './common';
import { DIAL } from './misc';
import { CANDLE_WAX } from '../blocklib/sculk';

export const DEEP_DARK_ITEMS: Record<string, Gen> = {};
const I = DEEP_DARK_ITEMS;

// ---------------------------------------------------------------------------
// Candles: one stick with its wick, lit from the upper left

// prettier-ignore
const CANDLE = [
  '................',
  '................',
  '................',
  '.......k........',
  '.......k........',
  '......tTTt......',
  '......hmmd......',
  '......hmmd......',
  '......hmmD......',
  '......hmmd......',
  '......hmmd......',
  '......hmdd......',
  '......hmmd......',
  '......hmmd......',
  '......bbbb......',
  '................',
];
for (const [c, wax] of Object.entries(CANDLE_WAX)) {
  const name = c ? `${c}_candle` : 'candle';
  I[name] = () =>
    spr(CANDLE, {
      k: 0x2c2620, T: mixC(wax, 0xffffff, 0.32), t: mixC(wax, 0xffffff, 0.16), h: mixC(wax, 0xffffff, 0.12), m: wax,
      d: mixC(wax, 0x000000, 0.2), D: mixC(wax, 0x000000, 0.3), b: mixC(wax, 0x000000, 0.34),
    }, name);
}

// ---------------------------------------------------------------------------
// Disc fragment 5: a jagged wedge broken from the disc, its teal label at the tip

const DISC5 = 0x2a8a8a;
// prettier-ignore
const FRAGMENT = [
  '................',
  '................',
  '..#####.........',
  '..#dDdd##.......',
  '..#dDDddd#......',
  '...#dDdddd#.....',
  '...#ddDddd##....',
  '....#dDdddLd#...',
  '....#ddDdLlL#...',
  '.....#ddLlkL#...',
  '.....#dddLLd#...',
  '......#dddd#....',
  '......#ddd#.....',
  '.......###......',
  '................',
  '................',
];
const DISC_PAL = { '#': 0x0c0c0c, d: 0x1e1e22, D: 0x3a3a44, L: DISC5, l: mixC(DISC5, 0xffffff, 0.35), k: 0x0c0c0c };
I['disc_fragment_5'] = () => spr(FRAGMENT, DISC_PAL, 'disc_fragment_5');

// Music disc 5: the disc, the nine fragments' seams showing across it
// prettier-ignore
const DISC_5 = [
  '................',
  '................',
  '.....######.....',
  '....#dDsdDd#....',
  '...#dDdsdddd#...',
  '..#dDddLsddDd#..',
  '..#sssLllLdDd#..',
  '..#ddLlkkLsss#..',
  '..#ddLlkkLddd#..',
  '..#ddsLLLLddd#..',
  '..#dsdsLLdddd#..',
  '...#sddsddDd#...',
  '....#dddsDd#....',
  '.....######.....',
  '................',
  '................',
];
I['music_disc_5'] = () => spr(DISC_5, { ...DISC_PAL, s: 0x0a0a0c }, 'music_disc_5');

// ---------------------------------------------------------------------------
// The recovery compass's needle frames (vanilla item/recovery_compass_00..31)

const DIAL_PAL = { '#': 0x0a1414, r: 0x3a5a5a, R: 0x2a4444, q: 0x1a2e2e, f: 0x0e1e22 };

function needleLine(t: TexImage, cx: number, cy: number, ang: number, len: number, cols: number[]): void {
  const dx = Math.sin(ang), dy = -Math.cos(ang);
  for (let k = 1; k <= len * 2; k++) {
    const d = k / 2;
    plot(t, Math.floor(cx + dx * d), Math.floor(cy + dy * d), cols[Math.min(cols.length - 1, Math.floor((d / len) * cols.length))]);
  }
}

function recoveryFrame(i: number): TexImage {
  const t = spr(DIAL, DIAL_PAL, 'recovery_compass');
  const ang = (i / 32) * Math.PI * 2;
  needleLine(t, 8, 8.5, ang + Math.PI, 3.2, [0x4a6a6a, 0x6a8a8a]);
  needleLine(t, 8, 8.5, ang, 4.2, [0x1a9a8a, 0x5ae0d0]);
  plot(t, 7, 8, 0x2a4444);
  return t;
}
for (let i = 0; i < 32; i++) I[`recovery_compass_${String(i).padStart(2, '0')}`] = () => recoveryFrame(i);
