// Music disc 5 (vanilla music_disc.5, 2:58): an original piece in the spirit of vanilla's, built with the Nether
// music's helpers (netherMusic.ts) at half the sample rate. The deep dark's own record: cave air and a low drone,
// sonar pings echoing off far walls, a slow heartbeat that quickens and slows again, a lonely detuned lead over cold
// C# minor chords, and a signal tapped out in beeps — five dots, the digit 5 in Morse — that keeps coming back.

import { Rng, TAU, addOsc, clamp, echo, lowpass, smooth } from './dsp';
import { thump } from './texture';
import { type Fn, type Note, Mix, chordOf, gong, legato, lowpassSweep, master, melody, nm, noise, synth } from './netherMusic';

/** the song's length (vanilla JukeboxSong length_in_seconds 178) */
export const DISC_5_SECONDS = 178;

/** a short sine beep with soft edges (the Morse signal, the sonar's ping) */
function beep(out: Float32Array, sr: number, t: number, dur: number, f: number, amp: number): void {
  const s = Math.round(t * sr);
  const n = Math.min(out.length - s, Math.round(dur * sr));
  const edge = Math.max(1, Math.round(0.006 * sr));
  for (let i = 0; i < n; i++) {
    const e = Math.min(1, i / edge, (n - i) / edge);
    out[s + i] += amp * e * Math.sin((TAU * f * i) / sr);
  }
}

/** the five dots of a 5, 0.09 s apart, starting at t */
function morseFive(out: Float32Array, sr: number, t: number, f: number, amp: number): void {
  for (let k = 0; k < 5; k++) beep(out, sr, t + k * 0.18, 0.09, f, amp);
}

export function renderDisc5(sr: number): Float32Array {
  const rng = new Rng(0x5d15c5);
  const L = DISC_5_SECONDS;
  const m = new Mix(sr / 2, L);
  // how tense it is: rising from 50 s to a peak around 120 s, falling away by 160 s
  const tension: Fn = (t) => smooth(clamp((t - 50) / 60, 0, 1)) * (1 - smooth(clamp((t - 128) / 32, 0, 1)));
  // the heartbeat's period: 1.1 s, quickening to 0.62 s at the peak
  const beatAt: number[] = [];
  for (let t = 22; t < L - 12; ) {
    beatAt.push(t);
    t += 1.1 - 0.48 * tension(t);
  }

  // cave air: pink noise through a slowly wandering band, swelling in and out
  m.part(-10, (b, hs) => {
    noise(b, hs, rng, 0, L, (t) => 260 + 140 * Math.sin(TAU * 0.013 * t) + 300 * tension(t), 1.4, (t) => 0.4 + 0.3 * Math.sin(TAU * 0.021 * t + 1) + 0.4 * tension(t));
  });

  // the drone: C#1 and G#1 on a soft wave, a filter opening with the tension
  m.part(-3, (b, hs) => {
    synth(b, hs, rng, [
      { t: 0, dur: L - 8, midi: nm('C#1'), vel: 0.9 },
      { t: 6, dur: L - 16, midi: nm('G#1'), vel: 0.5 },
      { t: 64, dur: 90, midi: nm('D2'), vel: 0.35 * 1 },
    ], { wave: 'saw', voices: 3, detune: 12, attack: 9, release: 5, maxF: 2200 });
    lowpassSweep(b, hs, (t) => 150 + 520 * tension(t) + 30 * Math.sin(TAU * 0.05 * t), 1.0);
  });

  // cold chords: C# minor with a flat second leaning on it, 12 s each
  m.part(-2, (b, hs) => {
    const chords = ['C#3 G#3 B3 E4', 'A2 E3 G#3 C#4', 'F#2 C#3 A3 E4', 'G#2 D#3 G#3 B3', 'C#3 D3 G#3 E4', 'A2 E3 A3 C#4', 'F#2 A2 E3 C#4', 'G#2 C3 D#3 G#3', 'C#3 G#3 B3 E4', 'D2 A2 F3 C#4', 'C#3 G#3 E4'];
    const notes: Note[] = [];
    chords.forEach((c, k) => chordOf(c).forEach((n) => notes.push({ t: 20 + k * 12, dur: 13, midi: n, vel: 0.9 })));
    synth(b, hs, rng, legato(notes), { wave: 'soft', voices: 4, detune: 18, attack: 4, release: 3, vib: [0.2, 0.003], maxF: 3000 });
    lowpassSweep(b, hs, (t) => 500 + 1100 * tension(t), 0.8);
  });

  // the heartbeat: a low double thump, quickening with the tension
  m.part(-4, (b, hs) => {
    for (const t of beatAt) {
      const v = 0.6 + 0.4 * tension(t);
      thump(b, hs, { t, f0: 72, f1: 44, glide: 0.04, tau: 0.09, amp: v, h2: 0.25 });
      thump(b, hs, { t: t + 0.22, f0: 64, f1: 40, glide: 0.04, tau: 0.07, amp: v * 0.7, h2: 0.2 });
    }
    lowpass(b, 400, hs);
  });

  // sonar pings off far walls: a high sine, each echoing away
  m.part(-8, (b, hs) => {
    for (let t = 3; t < L - 10; t += 4.3 + rng.range(-0.4, 0.8) + 3 * tension(t)) beep(b, hs, t, 0.22, t < 90 ? 1318.5 : 1244.5, 0.8);
    echo(b, hs, 0.53, 0.58, 0.7, 3500);
  });

  // the signal: five dots, again and again through the middle, the last few far off
  m.part(-9, (b, hs) => {
    for (const t of [48, 52, 64, 68, 72, 88, 92, 104, 108, 112, 116, 140, 166]) morseFive(b, hs, t, 1760, t > 130 ? 0.45 : 0.8);
    echo(b, hs, 0.37, 0.35, 0.5, 5000);
  });

  // the lead: a lonely detuned voice, twice, the second time an octave up and pressing harder
  m.part(-3, (b, hs) => {
    const step = 0.75;
    const phrase = (t0: number, o: number, vel: number): Note[] => melody(
      `C#${4 + o}:4 E${4 + o}:2 D#${4 + o}:2 | C#${4 + o}:6 G#${3 + o}:2 | B${3 + o}:4 C#${4 + o}:2 D${4 + o}:2 | C#${4 + o}:8 | ` +
      `E${4 + o}:4 F#${4 + o}:2 E${4 + o}:2 | D#${4 + o}:4 C#${4 + o}:2 B${3 + o}:2 | G#${3 + o}:6 A${3 + o}:2 | G#${3 + o}:8`,
      t0, step, 8, vel);
    const notes = [...phrase(34, 0, 0.8), ...phrase(96, 1, 0.9), ...melody('C#4:6 D4:2 | C#4:16', 150, step, 8, 0.6)];
    synth(b, hs, rng, notes, { wave: 'soft', voices: 2, detune: 22, attack: 0.18, release: 0.9, vib: [4.6, 0.006], maxF: 4200 });
    echo(b, hs, 0.75, 0.3, 0.35, 2600);
  });

  // metal ringing in the dark at the turns of the piece
  m.part(-11, (b, hs) => {
    for (const [t, n, v] of [[20, 'C#2', 0.8], [56, 'G#1', 0.6], [80, 'C#2', 0.9], [104, 'D2', 1], [128, 'C#2', 1], [152, 'G#1', 0.6]] as [number, string, number][]) {
      gong(b, hs, t, 440 * Math.pow(2, (nm(n) - 69) / 12), v, 7);
    }
    lowpass(b, 2500, hs);
  });

  // a sub rumble under the peak
  m.part(-12, (b, hs) => {
    const f = 34.65;
    addOsc(b, hs, 0, L - 20, (t) => f * (1 + 0.004 * Math.sin(TAU * 0.3 * t)), (t) => tension(t) * tension(t));
  });

  return master(m, sr, { t60: 4.5, wet: 0.32, size: 2.2 }, 10);
}

/** the records' songs rendered here, as music pools of one track (vanilla sound event music_disc.<song>) */
export const DISC_MUSIC_POOLS: Record<string, number[]> = { 'music_disc.5': [0] };

export function renderDiscMusic(_pool: string, sr: number): Float32Array {
  return renderDisc5(sr);
}
