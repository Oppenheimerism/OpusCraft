// (the eleven discs) Music disc 11 (vanilla music_disc.11, 1:11), the broken disc: a piece of our own in its
// unsettling mood, for the discs' band (discBand.ts) at half the sample rate. A worn, warped record, crackling and
// hissing over a mains hum, of a little lullaby in F minor on an old upright piano whose strings have drifted out of
// tune, a celesta faint above it, the whole of it wavering as the record turns. The needle sticks before the tune can
// come home and jumps; the lullaby comes back lower and slower with something thudding far off, is swallowed by static,
// returns in pieces that keep dropping out as the thuds come nearer, and the turntable runs down to nothing. Then only
// the crackle, metal groaning, thuds close by and a rumble swelling until the recording stops dead.

import { Rng, TAU, addOsc, highpass, lowpass, sinCyc, smooth } from './dsp';
import { addBell } from './instruments';
import { type Note, Mix, master, piano } from './netherMusic';
import { burst, sweep, thump } from './texture';
import { Clock, type Chord, across, chords, close, line, partial } from './discBand';

/** the song's length (vanilla JukeboxSong length_in_seconds 71); the recording stops just short of it */
export const ELEVEN_SECONDS = 71;
const CUT = 70.6;

/** a turn of the record (s): 33 1/3 turns a minute */
const TURN = 1.8;

/** the lullaby, its lower and slower return, and the pieces it comes back in, each on its own clock (3/4) */
const F1 = new Clock(90, 3, 0.5, 3), F2 = new Clock(72, 3, 0.5, 23.2), F3 = new Clock(84, 3, 0.5, 40);
const LULLABY = 'F4:2 Ab4:2 C5:2 | Db5:4 C5:2 | Bb4:2 Ab4:2 G4:2 | C5:6 | F4:2 Ab4:2 C5:2 | Eb5:4 Db5:2 | C5:2 Bb4:2 G4:2';
const LULLABY_CHORDS = chords('Fm Db Bbm C Fm Eb7 C7', 3);
const AGAIN = 'F4:2 Ab4:2 C5:2 | Db5:4 C5:2 | Bb4:2 Ab4:2 G4:2 | C5:6 | F4:2 Ab4:2 C5:2 | Db5:6';
const AGAIN_CHORDS = chords('Fm Db Bbm C Fm Db', 3);
const PIECES = 'C5:2 Db5:2 C5:2 | Ab4:4 F4:2 | G4:2 Ab4:2 Bb4:2 | E4:6 | F4:2 G4:2 Ab4:2 | Db5:4 C5:2';
const PIECES_CHORDS = chords('Fm Db Eb C Fm Bbm', 3);

/** where the needle sticks (s), and the stretches the recording drops out in (s) */
const STICK = 17, STUCK = 3, AGAIN_FADE = 36.5, DROPOUTS: [number, number][] = [[41.6, 41.9], [43.7, 44.3], [46.2, 46.35], [47.9, 48.6], [49.8, 50.1]];
/** the turntable running down: from when, over how long (s) */
const STOP = 51.5, STOP_LEN = 3;

/** a waltz's left hand on the piano: the root on one, the chord on two and three */
function leftHand(c: Clock, prog: Chord[], transpose: number): Note[] {
  const out: Note[] = [];
  for (const { ch, beat } of across(prog, 0, 3)) {
    out.push(c.note(0, beat, 1, 41 + ((ch.root - 5 + 12) % 12) + transpose, 0.32));
    for (const bt of [1, 2]) for (const midi of close(ch, 53, 3)) out.push(c.note(0, beat + bt, 0.9, midi + transpose, 0.2));
  }
  return out;
}

/** the needle sticking: the turn of the record before `t` played over again `times` times, and then it jumps clear */
function stick(buf: Float32Array, sr: number, t: number, times: number): void {
  const s = Math.round(t * sr), n = Math.round(TURN * sr);
  const turn = buf.slice(s - n, s);
  for (let k = 0; k < times; k++) buf.set(turn.subarray(0, Math.max(0, Math.min(n, buf.length - s - k * n))), s + k * n);
}

/** the recording dropping out between `a` and `b` (s) */
function dropout(buf: Float32Array, sr: number, a: number, b: number): void {
  const s = Math.round(a * sr), e = Math.min(buf.length, Math.round(b * sr)), r = Math.round(0.003 * sr);
  for (let i = s; i < e; i++) buf[i] *= 1 - smooth(Math.min(i - s, e - i) / r);
}

/** the turntable running down: from `t` it slows over `len` s to a stop, falling in pitch as it goes, and nothing after */
function runDown(buf: Float32Array, sr: number, t: number, len: number): void {
  const s = Math.round(t * sr), n = Math.round(len * sr);
  const src = buf.slice(s, Math.min(buf.length, s + n));
  let p = 0;
  for (let i = 0; i < n && s + i < buf.length; i++) {
    const x = i / n;
    p += (1 - x) ** 1.5;
    const k = Math.floor(p), f = p - k;
    buf[s + i] = k + 1 < src.length ? (src[k] + (src[k + 1] - src[k]) * f) * (1 - 0.3 * x * x) : 0;
  }
  buf.fill(0, Math.min(buf.length, s + n));
}

/** the warped record's warble: a slow wow (about once a turn) and a quick flutter, as a delay swaying to and fro, deeper by `depth(t)` */
function warble(buf: Float32Array, sr: number, depth: (t: number) => number): Float32Array {
  const out = new Float32Array(buf.length);
  const D = 0.012 * sr;
  for (let i = 0; i < buf.length; i++) {
    const t = i / sr;
    const x = i - D - depth(t) * sr * (0.0035 * sinCyc(0.55 * t) + 0.0015 * sinCyc(0.93 * t + 0.3) + 0.0003 * sinCyc(6.3 * t));
    const k = Math.floor(x);
    if (k >= 0 && k + 1 < buf.length) out[i] = buf[k] + (buf[k + 1] - buf[k]) * (x - k);
  }
  return out;
}

/** a click off the record's surface */
function click(b: Float32Array, sr: number, t: number, a: number): void {
  const i = Math.round(t * sr);
  if (i < 0 || i + 2 >= b.length) return;
  b[i] += a;
  b[i + 1] -= 0.6 * a;
  b[i + 2] += 0.2 * a;
}

export function renderEleven(sr: number): Float32Array {
  const rng = new Rng(0x0b11);
  const L = ELEVEN_SECONDS;
  const m = new Mix(sr / 2, L);

  // the recording: the piano, each note's strings a little apart, and the celesta, in the recording's narrow band; the
  // needle sticking, the lullaby coming back and fading into the static, then in pieces, the turntable running down,
  // all of it warbling
  m.part(-4, (b, hs) => {
    const tune = [...line(F1, LULLABY, 0, 0.5, 6, 0.62), ...line(F2, AGAIN, 0, 0.5, 6, 0.52, -2), ...line(F3, PIECES, 0, 0.5, 6, 0.58)];
    const all = [...tune, ...leftHand(F1, LULLABY_CHORDS, 0), ...leftHand(F2, AGAIN_CHORDS, -2), ...leftHand(F3, PIECES_CHORDS, 0)];
    piano(b, hs, rng, all, 0x0b11, 0.3);
    piano(b, hs, rng, all.map((n) => ({ ...n, midi: n.midi + 0.18, vel: n.vel * 0.55 })), 0x0b12, 0.3);
    for (const n of tune) addBell(b, hs, n.t + 0.01, n.midi + 12, n.vel * 0.22);
    highpass(b, 220, hs);
    lowpass(b, 3200, hs);
    stick(b, hs, STICK, STUCK);
    b.fill(0, Math.round((STICK + STUCK * TURN) * hs), Math.round(F2.start * hs));
    for (let i = Math.round(AGAIN_FADE * hs), e = Math.round(F3.start * hs); i < e; i++) b[i] *= 1 - smooth((i / hs - AGAIN_FADE) / 2);
    for (const [a, z] of DROPOUTS) dropout(b, hs, a, z);
    runDown(b, hs, STOP, STOP_LEN);
    b.set(warble(b, hs, (t) => 0.5 + (0.5 * t) / L));
  });

  // the surface: crackle growing worse as it plays, a scratch once a turn, the odd pop, and the needle's jumps
  m.part(-12, (b, hs) => {
    for (let t = rng.range(0, 0.1); t < L; t += -Math.log(1 - rng.next()) / (8 + (10 * t) / L)) click(b, hs, t, smooth(t / 3) * (0.08 + 0.92 * rng.next() ** 4) * rng.sign());
    for (let t = 0.7; t < L; t += TURN) click(b, hs, t + rng.gauss() * 0.002, 0.8 * smooth(t / 3) * rng.sign());
    for (let t = 2; t < L; t += rng.range(1.5, 4)) burst(b, hs, rng, { t, dur: 0.006, tau: 0.0015, amp: 0.5, hp: 500 });
    for (let k = 0; k <= STUCK; k++) burst(b, hs, rng, { t: STICK + k * TURN, dur: 0.01, tau: 0.002, amp: 0.9, hp: 300 });
  });

  // hiss, rising and falling a little with each turn
  m.part(-22, (b, hs) => {
    burst(b, hs, rng, { t: 0, dur: L, tau: 1e9, amp: 1, hp: 2500, env: (t) => smooth(t / 3) * (0.8 + 0.2 * Math.sin((TAU * t) / TURN)) });
  });

  // the mains hum under it, wavering
  m.part(-24, (b, hs) => {
    for (const [h, a] of [[1, 1], [2, 0.5], [3, 0.35], [4, 0.12]]) addOsc(b, hs, 0, L, () => 50 * h, (t) => a * smooth(t / 3) * (0.6 + 0.4 * sinCyc(0.13 * t + h * 0.2)));
  });

  // the thuds: far off and muffled while the lullaby comes back, nearer while it breaks up, close by after it, a
  // rattle and a ping of metal with the nearer ones; never keeping time
  m.part(-6, (b, hs) => {
    const thud = (t: number, near: number) => {
      thump(b, hs, { t, f0: 80 + 25 * near, f1: 44 + 8 * near, glide: 0.07, tau: 0.22 - 0.06 * near, amp: 0.35 + 0.65 * near, h2: 0.1 + 0.2 * near, attack: 0.012 - 0.009 * near });
      if (near > 0.3) burst(b, hs, rng, { t: t + 0.004, dur: 0.4, tau: 0.07, amp: 0.25 * near, lp: 600 + 1000 * near });
      if (near > 0.8 && rng.chance(0.4)) partial(b, hs, t + rng.range(0.05, 0.2), rng.range(1800, 3200), 0.12, 0.7);
    };
    for (let t = 24.3; t < 35; t += rng.range(2.2, 4.8)) thud(t, 0);
    for (let t = 40.8; t < STOP; t += rng.range(1.8, 3.6)) thud(t, 0.5);
    for (let t = 56.6; t < 66.5; t += rng.range(1.4, 3.1)) thud(t, 0.9);
  });

  // metal groaning somewhere, its pitch sagging
  m.part(-12, (b, hs) => {
    for (const [t0, len, f0] of [[57.2, 3.2, 170], [61.5, 2.6, 128], [64.2, 2.4, 205]]) {
      for (const [r, a] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.93, 0.12]]) {
        addOsc(b, hs, t0, len, (t) => f0 * r * (1 - 0.06 * smooth(t / len)) * (1 + 0.004 * sinCyc(7 * t)), (t) => a * Math.sin((Math.PI * t) / len) ** 2);
      }
    }
  });

  // static: a swell that swallows the lullaby's return, and a roar of it at the end
  m.part(-10, (b, hs) => {
    sweep(b, hs, rng, { t: 34.5, dur: 6, f: (t) => 1800 + 1200 * Math.sin(t * 1.3), q: 0.5, amp: (t) => Math.sin((Math.PI * t) / 6) ** 2 });
    sweep(b, hs, rng, { t: 66, dur: L - 66, f: (t) => 2200 + 800 * Math.sin(t * 3.1), q: 0.4, amp: (t) => smooth(t / (CUT - 66)) });
  });

  // a rumble rising from when the tape stops to the end
  m.part(-6, (b, hs) => {
    sweep(b, hs, rng, { t: 56, dur: L - 56, f: (t) => 90 + 60 * smooth(t / (CUT - 56)), q: 0.7, mode: 'lp', amp: (t) => 0.15 + 0.85 * smooth(t / (CUT - 56)) ** 2 });
  });

  // (the recording stops dead: cut off in the few milliseconds it takes not to click, nothing ringing after it)
  const out = master(m, sr, { t60: 1.2, wet: 0.2, size: 1 }, 0.5, 0.085);
  const n = Math.min(out.length, Math.round(CUT * sr));
  const cut = out.slice(0, n);
  const f = Math.round(0.005 * sr);
  for (let i = 0; i < f; i++) cut[n - 1 - i] *= i / f;
  return cut;
}
