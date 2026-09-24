// The End's music (vanilla music.end: what plays in the End when there's no dragon to fight). One original piece
// in the spirit of vanilla's — slow and wide, cold open chords on a soft pad over a low drone, a lonely piano that
// finds a gentle arpeggio in the middle and loses it again, stars glinting high up and echoing away, the void
// breathing underneath. Built with the Nether music's helpers (netherMusic.ts), at half the sample rate.

import { Rng, TAU, addMode, brown, clamp, echo, lowpass, smooth } from './dsp';
import { addBell } from './instruments';
import { type Fn, type Note, Mix, chordOf, gong, legato, lowpassSweep, master, melody, nm, noise, piano, swell, synth } from './netherMusic';

/** "The Far Isles": twelve slow changes in E minor, open voicings, the piano's arpeggio from the fifth to the ninth */
function farIsles(sr: number): Float32Array {
  const rng = new Rng(0xe0d15e);
  const seg = 12;
  const chords = [
    'E3 B3 D4 F#4', 'C3 G3 B3 E4', 'A2 E3 G3 B3 C4', 'B2 F#3 A3 D4',
    'E3 B3 D4 G4', 'C3 G3 D4 E4', 'D3 A3 E4 F#4', 'B2 F#3 B3 D4',
    'G2 D3 B3 F#4', 'A2 E3 C4 E4', 'B2 F#3 A3 E4', 'E3 B3 E4 G4',
  ];
  const body = chords.length * seg;
  const L = body + 14;
  const m = new Mix(sr / 2, L);
  // how open the middle is: it swells from the fourth change to the ninth, then settles back
  const bloom: Fn = (t) => smooth(clamp((t - 40) / 26, 0, 1)) * (1 - smooth(clamp((t - 100) / 28, 0, 1)));

  // the drone: E1 and B1, soft and nearly still (two voices a few cents apart), a filter slowly opening with the middle
  m.part(-4, (b, hs) => {
    synth(b, hs, rng, [
      { t: 0, dur: body, midi: nm('E1'), vel: 0.8 },
      { t: 0, dur: body, midi: nm('B1'), vel: 0.45 },
    ], { wave: 'soft', voices: 2, detune: 5, attack: 8, release: 4, maxF: 1400 });
    lowpassSweep(b, hs, (t) => 170 + 240 * bloom(t) + 40 * Math.sin(TAU * 0.04 * t), 0.9);
  });

  // the pad: the chords, voices held across the changes where they're shared
  m.part(0, (b, hs) => {
    const notes: Note[] = [];
    chords.forEach((c, k) => chordOf(c).forEach((n) => notes.push({ t: k * seg, dur: seg + 1.2, midi: n, vel: 1 })));
    synth(b, hs, rng, legato(notes), { wave: 'soft', voices: 4, detune: 14, attack: 3.5, release: 2.6, vib: [0.17, 0.0025], maxF: 3600 });
    lowpassSweep(b, hs, (t) => 620 + 950 * bloom(t) + 120 * Math.sin(TAU * 0.021 * t), 0.7);
  });

  // stars: high bell tones scattered through a long, darkening echo, thicker through the middle
  m.part(-9, (b, hs) => {
    const scale = ['E6', 'F#6', 'G6', 'A6', 'B6', 'D7', 'E7'].map(nm);
    for (let t = 1.5; t < body; t += rng.range(0.7, 2.6) * (1.25 - 0.5 * bloom(t))) {
      addBell(b, hs, t, scale[rng.int(scale.length)], rng.range(0.25, 0.75) * (0.55 + 0.45 * bloom(t)));
    }
    lowpass(b, 6000, hs);
    echo(b, hs, 0.61, 0.52, 0.6, 3200);
  });

  // the lonely piano: phrases in 0.75 s steps, eight to the bar
  m.part(-1, (b, hs) => {
    const step = 0.75;
    const notes: Note[] = [
      ...melody('r:2 B4:2 A4:2 G4:2 | F#4:6 E4:2', 1 * seg, step, 8, 0.42),
      ...melody('G4:2 A4:2 B4:4 | D5:3 B4:1 A4:4', 2.5 * seg, step, 8, 0.44),
      ...melody('E5:4 D5:2 B4:2 | A4:8', 3.5 * seg, step, 8, 0.4),
      // over the arpeggio
      ...melody('B5:4 A5:2 G5:2 | F#5:4 E5:4', 5 * seg, step, 8, 0.46),
      ...melody('G5:2 F#5:2 E5:2 D5:2 | E5:8', 6 * seg, step, 8, 0.48),
      ...melody('D5:4 E5:2 F#5:2 | B4:8', 7 * seg, step, 8, 0.44),
      // and alone again
      ...melody('E4:4 G4:4 | B4:8', 9 * seg, step, 8, 0.38),
      ...melody('A4:3 G4:1 F#4:4 | E4:8', 10.5 * seg, step, 8, 0.36),
    ];
    // the arpeggio: chord tones an octave up, one every 1.5 s, from the fifth change to the ninth
    for (let k = 4; k <= 8; k++) {
      const tones = chordOf(chords[k]).map((n) => n + 12);
      const seq = [0, 2, 1, 3, 2, 1, 3, 2];
      for (let j = 0; j < 8; j++) notes.push({ t: k * seg + j * 1.5, dur: 1.4, midi: tones[seq[j] % tones.length], vel: 0.22 + 0.1 * bloom(k * seg + j * 1.5) });
    }
    // low roots where the piece turns
    for (const k of [0, 4, 8, 11]) notes.push({ t: k * seg + 0.1, dur: seg * 0.9, midi: chordOf(chords[k])[0] - 12, vel: 0.36 });
    piano(b, hs, rng, notes, 0xe0d15e, 0.3);
  });

  // far metal: a low plate at the turns, barely there
  m.part(-13, (b, hs) => {
    for (const k of [0, 4, 8]) gong(b, hs, k * seg + 0.2, k === 4 ? 82.4 : 61.7, 0.8, 9);
    lowpass(b, 1500, hs);
  });

  // the void breathing: slow swells of low filtered noise, and a thin high air
  m.part(-12, (b, hs) => {
    for (const t0 of [3, 27, 55, 83, 109, 131]) {
      const f0 = rng.range(150, 230);
      noise(b, hs, rng, t0, 18, (t) => f0 * (0.8 + 0.4 * Math.sin((Math.PI * t) / 18)), 3, swell(0, 18, 8, 9));
    }
    const air = swell(0, body, 20, 30);
    noise(b, hs, rng, 0, body, () => 2400, 0.6, (t) => 0.12 * air(t) * (0.6 + 0.4 * Math.sin(TAU * 0.033 * t)));
  });

  // a sub rumble under the middle
  m.part(-15, (b, hs) => {
    const r = brown(b.length, rng, 0.9995);
    lowpass(r, 80, hs);
    const env = swell(46, 64, 22, 26);
    for (let i = 0; i < b.length; i++) b[i] = r[i] * env(i / hs);
  });

  // a few glassy overtones hanging off the last chord
  m.part(-16, (b, hs) => {
    for (const [midi, d] of [[nm('B5'), 0], [nm('E6'), 0.4], [nm('G6'), 0.9]] as const) addMode(b, Math.round((11 * seg + 1 + d) * hs), hs, 440 * Math.pow(2, (midi - 69) / 12), 0.6, 6);
  });

  return master(m, sr, { t60: 6.5, wet: 1.3, size: 2.1 }, 12, 0.095);
}

const TRACKS: { name: string; render: (sr: number) => Float32Array }[] = [{ name: 'The Far Isles', render: farIsles }];

/** vanilla music.end: its tracks */
export const END_MUSIC_POOLS: Record<string, number[]> = { 'music.end': [0] };

export const END_TRACK_NAMES = TRACKS.map((t) => t.name);

/** Render track `index` of the End's pool */
export function renderEndMusic(pool: string, index: number, sr: number): Float32Array {
  const p = END_MUSIC_POOLS[pool] ?? END_MUSIC_POOLS['music.end'];
  const i = ((Math.floor(index) % p.length) + p.length) % p.length;
  return TRACKS[p[i]].render(sr);
}
