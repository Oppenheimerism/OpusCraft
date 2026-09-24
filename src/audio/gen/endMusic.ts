// The End's music: original pieces in the spirit of vanilla's, built with the Nether music's helpers
// (netherMusic.ts), at half the sample rate.
// - music.end (in the End when there's no dragon to fight): slow and wide, cold open chords on a soft pad over a
//   low drone, a lonely piano that finds a gentle arpeggio in the middle and loses it again, stars glinting high up
//   and echoing away, the void breathing underneath.
// - music.dragon (while the dragon's bar is up, straight away and again as soon as it ends): driving and dark.
// - music.credits (under the End Poem and the credits, the same): a piano that grows into something bright and
//   quiets again.

import { Rng, TAU, addMode, brown, clamp, echo, lowpass, smooth } from './dsp';
import { addBell } from './instruments';
import { burst, thump } from './texture';
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


/**
 * "Obsidian Towers" (music.dragon, while the dragon's bar is up): 96 bpm in D minor, leaning on the flat second —
 * a pedal drone and timpani rising out of the dark, then a driving saw ostinato in eighths under taiko-like drums
 * in a 3-3-2 pattern, a string pad and a hard, echoing square lead; a middle section with brass stabs, a choir-like
 * pad and wingbeat whooshes; a break down to a heartbeat and cold bells; the theme again, fuller; one last hit.
 */
function obsidianTowers(sr: number): Float32Array {
  const rng = new Rng(0xd4a60f);
  const beat = 60 / 96;
  const bar = 4 * beat;
  const e8 = beat / 2;
  const V: Record<string, string> = {
    Dm: 'D3 F3 A3', EbD: 'D3 Eb3 G3 Bb3', Bb: 'Bb2 F3 Bb3 D4', Gm: 'G2 D3 G3 Bb3', A: 'A2 E3 A3 C#4', Eb: 'Eb3 G3 Bb3 Eb4',
  };
  const ROOT: Record<string, string> = { Dm: 'D2', EbD: 'D2', Bb: 'Bb1', Gm: 'G1', A: 'A1', Eb: 'Eb2' };
  const pairs = (l: string[]): string[] => l.flatMap((c) => [c, c]);
  const prog: string[] = [
    ...['Dm', 'Dm', 'EbD', 'Dm', 'Dm', 'EbD', 'Bb', 'A'], // 0-7 intro
    ...pairs(['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'Gm', 'A']), // 8-23 A
    ...pairs(['Gm', 'Eb', 'Bb', 'A', 'Gm', 'Eb', 'Bb', 'A']), // 24-39 B
    ...['Dm', 'Dm', 'EbD', 'Dm', 'Bb', 'Bb', 'A', 'A'], // 40-47 break
    ...pairs(['Dm', 'Bb', 'Gm', 'A']), ...['Dm', 'Bb', 'A', 'A'], // 48-59 A'
    ...['Dm', 'Dm', 'Dm', 'Dm'], // 60-63 the end
  ];
  const BARS = prog.length;
  const L = BARS * bar + 8;
  const m = new Mix(sr / 2, L);
  const section = (k: number): 'intro' | 'A' | 'B' | 'break' | 'A2' | 'end' =>
    k < 8 ? 'intro' : k < 24 ? 'A' : k < 40 ? 'B' : k < 48 ? 'break' : k < 60 ? 'A2' : 'end';
  const driving = (k: number) => ['A', 'B', 'A2'].includes(section(k));

  // the pedal: D1 and A1, a saw growl under everything but the end, opening up with the sections
  m.part(-8, (b, hs) => {
    synth(b, hs, rng, [
      { t: 0, dur: 60 * bar, midi: nm('D1'), vel: 1 },
      { t: 0, dur: 60 * bar, midi: nm('A1'), vel: 0.5 },
    ], { wave: 'saw', voices: 3, detune: 14, attack: 6, release: 3, maxF: 1600 });
    lowpassSweep(b, hs, (t) => {
      const k = t / bar;
      return (section(k) === 'intro' ? 160 + 25 * k : section(k) === 'break' ? 190 : 330) + 60 * Math.sin(TAU * 0.05 * t);
    }, 1.1);
  });

  // strings: the chords, legato, brighter in the middle section
  m.part(-4, (b, hs) => {
    const notes: Note[] = [];
    prog.forEach((c, k) => {
      if (k >= 60) return;
      chordOf(V[c]).forEach((n) => notes.push({ t: k * bar, dur: bar + 0.3, midi: n, vel: k < 4 ? 0.5 + 0.12 * k : 1 }));
    });
    notes.push(...chordOf('D3 A3 D4 F4').map((n) => ({ t: 60 * bar, dur: 2 * bar, midi: n, vel: 1 })));
    synth(b, hs, rng, legato(notes), { wave: 'saw', voices: 3, detune: 12, attack: 0.6, release: 1.2, vib: [4.6, 0.003], maxF: 4200 });
    lowpassSweep(b, hs, (t) => (section(t / bar) === 'B' ? 1900 : section(t / bar) === 'intro' ? 700 + 110 * (t / bar) : 1300) + 200 * Math.sin(TAU * 0.07 * t), 0.7);
  });

  // the ostinato: eighths on the root, the octave on the third, the flat second leaning back in on the seventh
  m.part(-3, (b, hs) => {
    const notes: Note[] = [];
    const shape = [0, 0, 12, 0, 0, 0, 1, 0];
    prog.forEach((c, k) => {
      const root = nm(ROOT[c]);
      if (driving(k)) {
        for (let j = 0; j < 8; j++) notes.push({ t: k * bar + j * e8, dur: e8 * 0.72, midi: root + shape[j], vel: j === 0 || j === 3 || j === 6 ? 1 : 0.7 });
      } else if (section(k) === 'intro' && k >= 4) {
        for (let j = 0; j < 4; j++) notes.push({ t: k * bar + j * beat, dur: beat * 0.6, midi: root, vel: 0.5 + 0.1 * (k - 4) });
      }
    });
    synth(b, hs, rng, notes, { wave: 'saw', voices: 2, detune: 9, attack: 0.006, release: 0.07, maxF: 2600 });
    lowpassSweep(b, hs, (t) => (section(t / bar) === 'B' ? 900 : 650) + 250 * Math.sin(TAU * 0.11 * t), 1.6);
  });

  // the lead: square, hard-edged, a dotted echo behind it
  const P1 = 'D5:4 E5:2 F5:2 | A5:6 G5:2 | F5:4 D5:4 | Bb4:6 C5:2 | D5:4 Bb4:2 G4:2 | D5:4 C5:2 Bb4:2 | A4:6 C#5:2 | E5:8';
  const P2 = 'F5:3 E5:1 D5:4 | A5:4 F5:4 | Bb5:4 A5:2 G5:2 | F5:6 D5:2 | G5:2 F5:2 E5:2 D5:2 | Bb4:4 D5:4 | C#5:4 E5:4 | A4:8';
  const B1 = 'G5:4 Bb5:4 | A5:6 G5:2 | Eb5:4 G5:4 | F5:6 Eb5:2 | D5:4 F5:4 | Bb5:6 A5:2 | A5:8 | C#5:4 E5:4';
  const B2 = 'Bb5:3 A5:1 G5:4 | D6:6 C6:2 | Bb5:4 G5:2 Eb5:2 | G5:8 | F5:2 G5:2 A5:2 Bb5:2 | D6:4 C6:4 | C#6:6 E6:2 | A5:8';
  const END = 'D5:4 F5:4 | Bb5:4 A5:4 | A5:4 G5:2 E5:2 | C#5:4 A4:4';
  const lead: Note[] = [
    ...melody(P1, 8 * bar, e8, 8, 0.85),
    ...melody(P2, 16 * bar, e8, 8, 0.9),
    ...melody(B1, 24 * bar, e8, 8, 0.95),
    ...melody(B2, 32 * bar, e8, 8, 1),
    ...melody(P2, 48 * bar, e8, 8, 1),
    ...melody(END, 56 * bar, e8, 8, 0.95),
  ];
  m.part(-4, (b, hs) => {
    synth(b, hs, rng, lead, { wave: 'square', voices: 2, detune: 7, attack: 0.02, release: 0.22, vib: [5.4, 0.005], maxF: 5000 });
    lowpass(b, 2600, hs);
    echo(b, hs, beat * 0.75, 0.35, 0.4, 2000);
  });

  // bells an octave over the lead's long notes when the theme comes back, and cold ones in the break
  m.part(-13, (b, hs) => {
    for (const n of lead) if (n.t >= 48 * bar && n.dur >= beat) addBell(b, hs, n.t, n.midi + 12, 0.8);
    const cold = ['D6', 'Eb6', 'A5', 'C#6', 'D6', 'Bb5', 'A5', 'Eb6'].map(nm);
    for (let k = 40; k < 48; k++) addBell(b, hs, k * bar + beat * (k % 2 ? 1.5 : 0.25), cold[k - 40], 0.7);
    echo(b, hs, beat * 1.5, 0.45, 0.5, 5000);
  });

  // a choir-like pad over the middle and the theme's return: the chord an octave up, slow and wide
  m.part(-10, (b, hs) => {
    const notes: Note[] = [];
    prog.forEach((c, k) => {
      if (section(k) === 'B' || section(k) === 'A2') chordOf(V[c]).forEach((n) => notes.push({ t: k * bar, dur: bar + 0.5, midi: n + 12, vel: 1 }));
    });
    synth(b, hs, rng, legato(notes), { wave: 'soft', voices: 4, detune: 22, attack: 1.2, release: 1.5, vib: [0.3, 0.004], maxF: 3000 });
    lowpass(b, 2400, hs);
  });

  // brass stabs through the middle section, on the 1 and the and-of-2; on the 1 when the theme returns
  m.part(-6, (b, hs) => {
    const notes: Note[] = [];
    prog.forEach((c, k) => {
      const at = section(k) === 'B' ? [0, 3] : section(k) === 'A2' ? [0] : [];
      for (const j of at) chordOf(V[c]).forEach((n) => notes.push({ t: k * bar + j * e8, dur: e8 * 0.9, midi: n + 12, vel: j === 0 ? 1 : 0.75 }));
    });
    synth(b, hs, rng, notes, { wave: 'saw', voices: 3, detune: 10, attack: 0.012, release: 0.12, maxF: 5000 });
    lowpassSweep(b, hs, (t) => 1500 + 900 * Math.exp(-((t % e8) / 0.12)), 0.9);
  });

  // drums: kicks in 3-3-2, a low tom on the 4, a crack on 2 and 4 through the middle, a roll into the theme;
  // timpani on the ones in the intro; a heartbeat in the break
  m.part(-3, (b, hs) => {
    for (let k = 0; k < BARS; k++) {
      const t0 = k * bar;
      const sec = section(k);
      if (sec === 'intro') {
        if (k >= 2) thump(b, hs, { t: t0, f0: 80, f1: 70, glide: 0.1, tau: 0.5, attack: 0.004, amp: 0.4 + 0.08 * k });
        if (k === 7) for (let j = 0; j < 16; j++) thump(b, hs, { t: t0 + (j * beat) / 4, f0: 84, f1: 72, glide: 0.08, tau: 0.12, amp: 0.25 + 0.05 * j });
        continue;
      }
      if (sec === 'break') {
        thump(b, hs, { t: t0, f0: 62, f1: 44, glide: 0.05, tau: 0.16, amp: 0.8 });
        thump(b, hs, { t: t0 + 0.3, f0: 56, f1: 42, glide: 0.05, tau: 0.14, amp: 0.55 });
        if (k === 47) for (let j = 0; j < 16; j++) thump(b, hs, { t: t0 + (j * beat) / 4, f0: 90, f1: 70, glide: 0.06, tau: 0.1, amp: 0.3 + 0.045 * j });
        continue;
      }
      if (sec === 'end') {
        if (k === 60) {
          thump(b, hs, { t: t0, f0: 70, f1: 38, glide: 0.08, tau: 0.9, attack: 0.003, amp: 1.3, h2: 0.3 });
          burst(b, hs, rng, { t: t0, dur: 2.5, tau: 0.5, lp: 900, amp: 0.8, color: 'brown' });
        }
        continue;
      }
      for (const j of [0, 3, 6]) thump(b, hs, { t: t0 + j * e8, f0: 88, f1: 44, glide: 0.035, tau: 0.2, amp: j === 0 ? 1 : 0.8, h2: 0.15 });
      thump(b, hs, { t: t0 + 4 * e8, f0: 150, f1: 100, glide: 0.05, tau: 0.16, amp: 0.55 });
      burst(b, hs, rng, { t: t0 + 4 * e8, dur: 0.25, tau: 0.07, bp: [320, 1.2], amp: 0.25 });
      if (sec === 'B' || sec === 'A2') for (const j of [2, 6]) burst(b, hs, rng, { t: t0 + j * e8, dur: 0.3, tau: 0.085, bp: [1700, 0.9], hp: 400, amp: 0.45 });
      // the last bar of each eight: a tom run down into the next
      if (k % 8 === 7) for (let j = 0; j < 4; j++) thump(b, hs, { t: t0 + (4 + j) * e8, f0: 190 - 25 * j, f1: 120 - 15 * j, glide: 0.05, tau: 0.14, amp: 0.5 + 0.1 * j });
    }
  });

  // metal at the turns: a plate at each section, a great gong at the end
  m.part(-11, (b, hs) => {
    for (const k of [8, 24, 48]) gong(b, hs, k * bar, 98, 0.9, 5);
    gong(b, hs, 40 * bar, 73.4, 0.7, 7);
    gong(b, hs, 60 * bar, 65.4, 1, 9);
    lowpass(b, 3500, hs);
  });

  // wingbeats: a whoosh of air before every other downbeat while it drives
  m.part(-12, (b, hs) => {
    for (let k = 9; k < 60; k += 2) {
      if (!driving(k)) continue;
      const t0 = k * bar + 6 * e8 - 0.2;
      noise(b, hs, rng, t0, 0.9, (t) => 260 + 900 * Math.sin((Math.PI * t) / 0.9), 1.4, (t) => Math.sin((Math.PI * t) / 0.9) ** 2);
    }
  });

  return master(m, sr, { t60: 3.2, wet: 0.75, size: 1.7 }, 6);
}

/**
 * "The Long Dream" (music.credits, under the End Poem and the credits, over and over): 70 bpm in C major — a piano
 * alone, arpeggios in open voicings; a pad and the melody come in; a low pulse like a heartbeat and a bass lift it
 * to a bright, bell-doubled peak; then the piano alone again, slowing, and a last chord left to ring.
 */
function longDream(sr: number): Float32Array {
  const rng = new Rng(0x1d4ea3);
  const beat = 60 / 70;
  const bar = 4 * beat;
  const e8 = beat / 2;
  const V: Record<string, string> = {
    C: 'C3 G3 D4 E4', Am: 'A2 E3 C4 G4', F: 'F2 C3 A3 E4', G: 'G2 D3 A3 B3', Em: 'E2 B2 G3 D4', Dm: 'D3 A3 C4 F4',
  };
  const prog: string[] = [
    ...['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G', 'Am', 'Em', 'F', 'C', 'Dm', 'Am', 'F', 'G'], // 0-15 piano
    ...['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G', 'Am', 'Em', 'F', 'C', 'Dm', 'Am', 'F', 'G'], // 16-31 pad, melody
    ...['F', 'G', 'Am', 'Em', 'F', 'G', 'C', 'C', 'F', 'G', 'Am', 'Em', 'Dm', 'Em', 'F', 'G'], // 32-47 rising
    ...['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G', 'Am', 'Em', 'F', 'G'], // 48-59 the peak
    ...['C', 'Am', 'F', 'G', 'Dm', 'G', 'C', 'C', 'C', 'C'], // 60-69 alone again
  ];
  const BARS = prog.length;
  const L = BARS * bar + 12;
  const m = new Mix(sr / 2, L);
  // how full it is: the pad's and the bass's level
  const fullness: Fn = (t) => {
    const k = t / bar;
    return k < 16 ? 0 : k < 20 ? (k - 16) / 4 * 0.6 : k < 32 ? 0.6 : k < 48 ? 0.6 + 0.4 * ((k - 32) / 16) : k < 60 ? 1 : Math.max(0, 1 - (k - 60) / 4);
  };

  // the piano: arpeggios, eighths up and down five notes (quarters once it's alone again at the end), and the melody
  const M2 = [
    'E5:4 D5:2 C5:2 | E5:6 G5:2 | A5:4 G5:2 E5:2 | D5:8',
    'E5:4 D5:2 C5:2 | C5:4 E5:4 | F5:4 E5:2 C5:2 | D5:8',
    'C5:4 B4:2 A4:2 | B4:4 G4:4 | A4:4 C5:4 | G4:8',
    'F4:4 A4:2 C5:2 | E5:6 D5:2 | C5:4 A4:4 | B4:4 D5:4',
  ].join(' | ');
  const M3 = [
    'A5:4 G5:2 F5:2 | G5:6 D5:2 | E5:4 C5:2 E5:2 | B4:8',
    'A4:2 C5:2 F5:4 | D5:2 G5:2 B5:4 | C6:8 | G5:4 E5:4',
    'A5:4 C6:4 | B5:4 G5:2 D5:2 | E5:4 A5:4 | G5:8',
    'F5:4 E5:2 D5:2 | E5:4 G5:4 | A5:6 G5:2 | D5:8',
  ].join(' | ');
  const M4 = [
    'G5:4 E5:2 C5:2 | E5:6 A5:2 | C6:4 A5:2 F5:2 | D6:8',
    'E6:4 D6:2 C6:2 | C6:4 A5:4 | A5:4 C6:2 A5:2 | B5:8',
    'C6:4 B5:2 A5:2 | B5:4 G5:4 | A5:4 F5:4 | G5:8',
  ].join(' | ');
  const M5 = 'E5:8 | C5:8 | A4:8 | B4:8 | A4:4 F4:4 | G4:4 D5:4 | C5:8 | r:8 | r:8 | r:8';
  const tune: Note[] = [...melody(M2, 16 * bar, e8, 8, 0.55), ...melody(M3, 32 * bar, e8, 8, 0.6), ...melody(M4, 48 * bar, e8, 8, 0.66), ...melody(M5, 60 * bar, e8, 8, 0.5)];
  m.part(0, (b, hs) => {
    const notes: Note[] = [];
    prog.forEach((c, k) => {
      const v = chordOf(V[c]);
      const five = [...v, v[1] + 12].sort((x, y) => x - y);
      const order = [0, 1, 2, 3, 4, 3, 2, 1];
      const last = k >= 66;
      if (last) {
        // the last chord: rolled once and held
        if (k === 66) five.forEach((n, i) => notes.push({ t: k * bar + i * 0.11, dur: 4 * bar, midi: n, vel: 0.42 - 0.03 * i }));
        return;
      }
      const slow = k >= 60;
      for (let j = 0; j < 8; j += slow ? 2 : 1) {
        const peak = k >= 48 && k < 60;
        const vel = (j === 0 ? 0.46 : 0.34) * (k < 2 ? 0.7 + 0.15 * k : 1) * (peak ? 1.12 : 1);
        notes.push({ t: k * bar + j * e8, dur: slow ? beat * 1.8 : e8 * 1.6, midi: five[order[j]], vel });
      }
      // a low octave under each change from the pad's entry on
      if (k >= 16 && k < 60) notes.push({ t: k * bar, dur: bar, midi: v[0] - 12, vel: 0.3 });
    });
    for (const n of tune) notes.push({ ...n, dur: n.dur * 0.95 });
    piano(b, hs, rng, notes, 0x1d4ea3, 0.34);
  });

  // the pad: the chords, legato, fading in, opening up to the peak and away
  m.part(-5, (b, hs) => {
    const notes: Note[] = [];
    prog.forEach((c, k) => {
      if (k < 16 || k >= 64) return;
      chordOf(V[c]).forEach((n) => notes.push({ t: k * bar, dur: bar + 1, midi: n + 12, vel: 1 }));
    });
    notes.push(...chordOf(V.C).map((n) => ({ t: 66 * bar, dur: 3 * bar, midi: n + 12, vel: 0.8 })));
    synth(b, hs, rng, legato(notes), { wave: 'soft', voices: 4, detune: 16, attack: 2.2, release: 2.6, vib: [0.2, 0.003], maxF: 3200 });
    lowpassSweep(b, hs, (t) => 700 + 1700 * fullness(t) + 100 * Math.sin(TAU * 0.03 * t), 0.7);
    for (let i = 0; i < b.length; i++) b[i] *= 0.25 + 0.75 * Math.max(fullness(i / hs), i / hs > 66 * bar ? 0.5 : 0);
  });

  // a soft lead doubling the melody at its peak
  m.part(-9, (b, hs) => {
    synth(b, hs, rng, melody(M4, 48 * bar, e8, 8, 1), { wave: 'soft', voices: 2, detune: 6, attack: 0.08, release: 0.6, vib: [4.8, 0.004], maxF: 4000 });
    lowpass(b, 3000, hs);
    echo(b, hs, beat, 0.3, 0.35, 3500);
  });

  // bells over the long notes of the melody, the higher half of the piece
  m.part(-12, (b, hs) => {
    for (const n of tune) if (n.t >= 32 * bar && n.t < 60 * bar && n.dur >= beat) addBell(b, hs, n.t, n.midi + 12, 0.7);
    echo(b, hs, beat * 0.75, 0.4, 0.45, 5000);
  });

  // the bass: long roots from the rise to the peak
  m.part(-8, (b, hs) => {
    const notes: Note[] = [];
    prog.forEach((c, k) => {
      if (k >= 32 && k < 60) notes.push({ t: k * bar, dur: bar, midi: chordOf(V[c])[0] - 12, vel: 1 });
    });
    synth(b, hs, rng, legato(notes), { wave: 'soft', voices: 1, detune: 0, attack: 0.3, release: 0.9, maxF: 600 });
    lowpass(b, 260, hs);
    for (let i = 0; i < b.length; i++) b[i] *= fullness(i / hs);
  });

  // a heartbeat under the rise and the peak ("You are alive"), soft
  m.part(-14, (b, hs) => {
    for (let k = 36; k < 58; k++) {
      const a = k < 48 ? 0.5 + 0.5 * ((k - 36) / 12) : 1;
      for (const j of [0, 4]) {
        thump(b, hs, { t: k * bar + j * e8, f0: 64, f1: 46, glide: 0.05, tau: 0.15, amp: a });
        thump(b, hs, { t: k * bar + j * e8 + 0.28, f0: 58, f1: 44, glide: 0.05, tau: 0.13, amp: a * 0.6 });
      }
    }
  });

  // air: a slow wash of high noise, and overtones left hanging off the last chord
  m.part(-17, (b, hs) => {
    const air = swell(0, L - 4, 30, 30);
    noise(b, hs, rng, 0, L - 4, () => 2600, 0.5, (t) => 0.1 * air(t) * (0.5 + 0.5 * fullness(t)));
    for (const [midi, d] of [[nm('G5'), 0], [nm('D6'), 0.5], [nm('E6'), 1.1]] as const) addMode(b, Math.round((66 * bar + 1 + d) * hs), hs, 440 * Math.pow(2, (midi - 69) / 12), 0.5, 7);
  });

  return master(m, sr, { t60: 4.8, wet: 1.05, size: 1.9 }, 10, 0.09);
}

const TRACKS: { name: string; render: (sr: number) => Float32Array }[] = [
  { name: 'The Far Isles', render: farIsles },
  { name: 'Obsidian Towers', render: obsidianTowers },
  { name: 'The Long Dream', render: longDream },
];

/** vanilla music.end, music.dragon and music.credits: their tracks */
export const END_MUSIC_POOLS: Record<string, number[]> = { 'music.end': [0], 'music.dragon': [1], 'music.credits': [2] };

export const END_TRACK_NAMES = TRACKS.map((t) => t.name);

/** Render track `index` of the End's pool */
export function renderEndMusic(pool: string, index: number, sr: number): Float32Array {
  const p = END_MUSIC_POOLS[pool] ?? END_MUSIC_POOLS['music.end'];
  const i = ((Math.floor(index) % p.length) + p.length) % p.length;
  return TRACKS[p[i]].render(sr);
}
