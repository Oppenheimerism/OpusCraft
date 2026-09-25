// Procedural soundtrack: calm, sparse ambient piano in the spirit of the classic overworld
// score — slow tempi, open maj7 / sus2 / add9 harmony, a pedalled broken-chord left hand,
// simple right-hand themes that return with variations, occasional soft pads and bells, all
// mixed through a warm room reverb. Every theme here is original (hand-written in scale-degree
// notation) and is developed with seeded procedural variation and humanisation.

import {
  Rng,
  TAU,
  clamp,
  fadeIn,
  highShelf,
  lowShelf,
  lowpass,
  mixInto,
  mtof,
  peakEq,
  reverb,
  sinCyc,
  softClip,
} from './dsp';
import { type PadNote, addBell, pianoDecay, pianoNote, pluckNote, renderBass, renderPads } from './instruments';

// ------------------------------------------------------------------ theory

// (trial chambers: MODES, parseChords, parseMelody, degMidi, TrackDef and renderTrack are exported for the music discs,
// gen/discMusic.ts)
export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
};
export type ModeName = keyof typeof MODES;

/** chord qualities: intervals above the root */
const QUAL: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  '7': [0, 4, 7, 10],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '7sus4': [0, 5, 7, 10],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '69': [0, 4, 7, 9, 14],
  m11: [0, 3, 7, 10, 14, 17],
  'maj7#11': [0, 4, 7, 11, 18],
};

export interface Chord {
  /** semitones above the tonic */
  root: number;
  tones: number[];
  bass: number;
  beats: number;
}

/** "1maj7 6m7:2 5/7 4add9:0.5" — degree (with b/#), quality, optional /bass degree, :bars */
export function parseChords(spec: string, mode: number[], bpb: number): Chord[] {
  const out: Chord[] = [];
  for (const tok of spec.trim().split(/\s+/)) {
    const m = /^([b#]?)([1-7])([^/:]*)(?:\/([b#]?)([1-7]))?(?::([\d.]+))?$/.exec(tok);
    if (!m) throw new Error(`music: bad chord "${tok}"`);
    const acc = m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0;
    const root = mode[+m[2] - 1] + acc;
    const q = QUAL[m[3]];
    if (!q) throw new Error(`music: bad chord quality "${m[3]}"`);
    const bass = m[5] ? mode[+m[5] - 1] + (m[4] === 'b' ? -1 : m[4] === '#' ? 1 : 0) : root;
    out.push({ root, tones: q, bass, beats: (m[6] ? +m[6] : 1) * bpb });
  }
  return out;
}

export interface MNote {
  beat: number;
  dur: number;
  deg: number;
  oct: number;
  acc: number;
  vel: number;
}

const DUR: Record<string, number> = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 };

/**
 * Melody notation: space-separated tokens, "|" = bar line (re-aligns to the bar grid).
 * Note: [b|#]degree['...|,...][:dur[.]]  e.g. 5  3':h  #4:q.  1,:e   rest: r:h
 * Durations: w h q e s (dotted with "."); a missing duration repeats the previous one.
 */
export function parseMelody(spec: string, bpb: number): { notes: MNote[]; misaligned: number } {
  const notes: MNote[] = [];
  let beat = 0;
  let last = 1;
  let misaligned = 0;
  for (const tok of spec.trim().split(/\s+/)) {
    if (tok === '|') {
      const r = beat / bpb;
      if (Math.abs(r - Math.round(r)) > 1e-6) {
        misaligned++;
        beat = Math.ceil(r) * bpb;
      }
      continue;
    }
    const m = /^(r|([b#]?)([1-7])(['’,]*))(?::([whqes])(\.?))?$/.exec(tok);
    if (!m) throw new Error(`music: bad note "${tok}"`);
    if (m[5]) last = DUR[m[5]] * (m[6] ? 1.5 : 1);
    const dur = last;
    if (m[1] !== 'r') {
      let oct = 0;
      for (const ch of m[4] ?? '') oct += ch === ',' ? -1 : 1;
      notes.push({ beat, dur, deg: +m[3], oct, acc: m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0, vel: 1 });
    }
    beat += dur;
  }
  return { notes, misaligned };
}

export function degMidi(tonic: number, mode: number[], deg: number, oct: number, acc: number): number {
  const d = deg - 1;
  return tonic + mode[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct) + acc;
}

const pc = (x: number): number => ((x % 12) + 12) % 12;

/** Open left-hand voicing: bass, fifth, then colour tones in the octave above. */
function lhVoicing(ch: Chord, tonicPc: number, low: number): number[] {
  const bass = low + pc(tonicPc + ch.bass - low);
  let root = bass + pc(tonicPc + ch.root - bass);
  if (root - bass > 7) root -= 12;
  const v = [bass];
  const fifth = root + (ch.tones.includes(7) ? 7 : ch.tones[1]);
  v.push(fifth > bass + 2 ? fifth : fifth + 12);
  const upper: number[] = [];
  for (const t of ch.tones) {
    const p = t % 12;
    if (p === 0 || p === 7) continue;
    let m = root + p;
    while (m < bass + 12) m += 12;
    while (m >= bass + 24) m -= 12;
    upper.push(m);
  }
  if (upper.length < 2) upper.push(root + 12 < bass + 12 ? root + 24 : root + 12);
  upper.sort((a, b) => a - b);
  for (const m of upper) if (m > v[v.length - 1] + 1 && !v.includes(m)) v.push(m);
  return v.slice(0, 5);
}

/** Close voicing of the chord's colour for pads / final chord in [lo, lo+12). */
function closeVoicing(ch: Chord, tonicPc: number, lo: number, max = 4): number[] {
  const tones = ch.tones.length > 3 ? ch.tones.filter((t) => t !== 7) : ch.tones;
  const out = tones.map((t) => lo + pc(tonicPc + ch.root + t - lo));
  out.sort((a, b) => a - b);
  return [...new Set(out)].slice(0, max);
}

// ------------------------------------------------------------------ score description

export type LhPattern = 'arp8' | 'arp8b' | 'arp6' | 'waltz' | 'block' | 'sparse' | 'pulse' | 'none';
export type Variation = 'orn' | 'thirds' | 'octave' | 'double' | 'sparse' | 'half' | 'shift';

export interface Section {
  bars: number;
  chords: string;
  lh: LhPattern;
  mel?: string;
  vary?: Variation[];
  /** base velocity (dynamics) 0..1 */
  vel: number;
  melOct?: number;
  pad?: number;
  bells?: number;
  bass?: number;
  arp?: number;
}

export interface TrackDef {
  name: string;
  seed: number;
  /** MIDI note of the melody's scale degree 1 */
  tonic: number;
  mode: ModeName;
  bpm: number;
  beats: number;
  /** lowest MIDI note for the left-hand bass */
  lhLow: number;
  sections: Section[];
  endChord: string;
  endHold: number;
  /** piano brightness 0..1 */
  tone: number;
  verb: { t60: number; wet: number };
  mix?: { pad?: number; bell?: number; bass?: number; pluck?: number };
  pad?: { attack: number; release: number; cutoff: number };
}

interface NoteEv {
  b: number;
  hold: number;
  midi: number;
  vel: number;
  /** extra offset in seconds (rolled chords) */
  dt?: number;
  /** hold in seconds (overrides beats) */
  holdSec?: number;
}

interface Score {
  piano: NoteEv[];
  bells: NoteEv[];
  pluck: NoteEv[];
  pads: NoteEv[];
  bass: NoteEv[];
  endBeat: number;
  secEnds: number[];
  misaligned: number;
}

interface PatStep {
  b: number;
  i: number[];
  a: number;
  roll?: boolean;
}

function pattern(p: LhPattern, bpb: number): PatStep[] {
  const eighths = (idx: number[]) => idx.map((i, k) => ({ b: k * 0.5, i: [i], a: k === 0 ? 1.18 : k % 2 ? 0.82 : 0.94 }));
  switch (p) {
    case 'arp8':
      return eighths(bpb === 3 ? [0, 1, 2, 3, 2, 1] : [0, 1, 2, 3, 4, 3, 2, 1]);
    case 'arp8b':
      return eighths(bpb === 3 ? [0, 2, 1, 3, 2, 4] : [0, 1, 2, 3, 4, 2, 3, 1]);
    case 'arp6':
      return eighths(bpb === 4 ? [0, 1, 2, 3, 2, 1, 2, 3] : [0, 1, 2, 3, 2, 1]);
    case 'waltz': {
      const s: PatStep[] = [{ b: 0, i: [0], a: 1.12 }];
      for (let k = 1; k < bpb; k++) s.push({ b: k, i: [2, 3], a: k === 1 ? 0.72 : 0.66 });
      return s;
    }
    case 'block':
      return [{ b: 0, i: [0, 1, 2, 3, 4], a: 0.95, roll: true }];
    case 'sparse':
      return bpb === 3
        ? [
            { b: 0, i: [0], a: 1.1 },
            { b: 1, i: [2], a: 0.8 },
            { b: 2, i: [3], a: 0.75 },
          ]
        : [
            { b: 0, i: [0], a: 1.1 },
            { b: 1.5, i: [2], a: 0.8 },
            { b: 2.5, i: [3], a: 0.76 },
          ];
    case 'pulse':
      return bpb === 3
        ? [
            { b: 0, i: [0], a: 1.1 },
            { b: 1, i: [2], a: 0.8 },
            { b: 2, i: [1, 3], a: 0.74 },
          ]
        : [
            { b: 0, i: [0], a: 1.1 },
            { b: 1, i: [2], a: 0.8 },
            { b: 2, i: [1], a: 0.86 },
            { b: 3, i: [3], a: 0.76 },
          ];
    default:
      return [];
  }
}

// ------------------------------------------------------------------ melodic variation

function vary(notes: MNote[], kind: Variation, rng: Rng, span: number): MNote[] {
  const out: MNote[] = [];
  const pos = (n: MNote) => n.deg + 7 * n.oct;
  switch (kind) {
    case 'orn':
      for (let i = 0; i < notes.length; i++) {
        const a = notes[i];
        const nx = notes[i + 1];
        const step = nx ? pos(nx) - pos(a) : 0;
        if (nx && a.dur >= 1 && Math.abs(step) === 2 && Math.abs(nx.beat - (a.beat + a.dur)) < 1e-6 && rng.chance(0.65)) {
          out.push({ ...a, dur: a.dur - 0.5 });
          out.push({ beat: a.beat + a.dur - 0.5, dur: 0.5, deg: a.deg + Math.sign(step), oct: a.oct, acc: 0, vel: 0.78 });
        } else if (a.dur >= 2 && a.beat >= 0.25 && rng.chance(0.3)) {
          out.push({ beat: a.beat - 0.18, dur: 0.18, deg: a.deg + 1, oct: a.oct, acc: 0, vel: 0.5 });
          out.push(a);
        } else out.push(a);
      }
      return out;
    case 'thirds':
      for (const a of notes) {
        out.push(a);
        if (a.dur >= 1) out.push({ ...a, deg: a.deg - 2, vel: a.vel * 0.62 });
      }
      return out;
    case 'double':
      for (const a of notes) {
        out.push(a);
        if (a.dur >= 1) out.push({ ...a, oct: a.oct - 1, vel: a.vel * 0.55 });
      }
      return out;
    case 'octave':
      return notes.map((a) => (a.beat >= span / 2 ? { ...a, oct: a.oct + 1, vel: a.vel * 0.92 } : a));
    case 'half':
      return notes.filter((a) => a.beat < span / 2);
    case 'sparse': {
      for (const a of notes) {
        const prev = out[out.length - 1];
        if (a.dur < 1 && a.beat % 1 !== 0 && prev) {
          prev.dur += a.dur;
          continue;
        }
        out.push({ ...a });
      }
      return out;
    }
    case 'shift':
      return notes.map((a) => (a.beat % 4 === 0 && a.beat > 0 && a.dur >= 2 && rng.chance(0.45) ? { ...a, beat: a.beat + 0.5, dur: a.dur - 0.5 } : a));
  }
  return notes;
}

// ------------------------------------------------------------------ score building

function buildScore(def: TrackDef, rng: Rng): Score {
  const mode = MODES[def.mode];
  const tonicPc = pc(def.tonic);
  const bpb = def.beats;
  const sc: Score = { piano: [], bells: [], pluck: [], pads: [], bass: [], endBeat: 0, secEnds: [], misaligned: 0 };
  const rollBeats = (0.032 * def.bpm) / 60;
  let b0 = 0;
  let prevPad: number[] = [];
  for (const sec of def.sections) {
    const chords = parseChords(sec.chords, mode, bpb);
    const total = sec.bars * bpb;
    const segs: { b: number; beats: number; ch: Chord }[] = [];
    for (let b = 0, ci = 0; b < total - 1e-6; ci++) {
      const ch = chords[ci % chords.length];
      const beats = Math.min(ch.beats, total - b);
      segs.push({ b: b0 + b, beats, ch });
      b += beats;
    }
    // left hand, pedalled through each chord
    const pat = pattern(sec.lh, bpb);
    for (const sg of segs) {
      const v = lhVoicing(sg.ch, tonicPc, def.lhLow);
      const V = (i: number) => (i < v.length ? v[i] : v[Math.min(v.length - 1, i - v.length + 1)] + 12);
      const segEnd = sg.b + sg.beats;
      for (let bar = 0; bar < sg.beats - 1e-6; bar += bpb) {
        for (const st of pat) {
          const b = sg.b + bar + st.b;
          if (b >= segEnd - 1e-6) continue;
          st.i.forEach((i, k) => {
            if (i >= v.length && st.roll) return;
            const midi = V(i);
            sc.piano.push({
              b,
              dt: st.roll ? k * 0.032 : 0,
              hold: segEnd - b + 0.12,
              midi,
              vel: sec.vel * st.a * (i === 0 ? 1.05 : 0.92) * (bar === 0 ? 1 : 0.95),
            });
          });
        }
      }
      if (sec.pad) {
        let pv = closeVoicing(sg.ch, tonicPc, 55);
        // keep the pad voice-leading smooth: pick the octave placement nearest the previous chord
        if (prevPad.length) {
          const avgPrev = prevPad.reduce((a, b) => a + b, 0) / prevPad.length;
          const avg = pv.reduce((a, b) => a + b, 0) / pv.length;
          if (avg - avgPrev > 6) pv = pv.map((m) => m - 12);
          else if (avgPrev - avg > 6) pv = pv.map((m) => m + 12);
        }
        prevPad = pv;
        for (const m of pv) sc.pads.push({ b: sg.b, hold: sg.beats + 0.3, midi: m, vel: sec.pad });
      }
      if (sec.bass) {
        const m = 31 + pc(tonicPc + sg.ch.bass - 31);
        sc.bass.push({ b: sg.b, hold: sg.beats, midi: m, vel: sec.bass });
      }
      if (sec.arp) {
        const tones: number[] = [];
        for (let o = 0; o < 3; o++) for (const t of sg.ch.tones) tones.push(def.tonic - 12 + pc(sg.ch.root + t) + 12 * o);
        const ts = [...new Set(tones.filter((m) => m >= def.tonic - 8 && m <= def.tonic + 12))].sort((a, b) => a - b);
        const seq = [...ts, ...ts.slice(1, -1).reverse()];
        const steps = Math.round(sg.beats * 4);
        const off = rng.int(seq.length);
        for (let k = 0; k < steps; k++) {
          sc.pluck.push({ b: sg.b + k / 4, hold: 0.25, midi: seq[(k + off) % seq.length], vel: sec.arp * (k % 4 === 0 ? 1 : k % 2 === 0 ? 0.8 : 0.66) });
        }
      }
    }
    // melody
    if (sec.mel) {
      const pm = parseMelody(sec.mel, bpb);
      sc.misaligned += pm.misaligned;
      let notes = pm.notes;
      for (const kind of sec.vary ?? []) notes = vary(notes, kind, rng, total);
      for (const n of notes) {
        const midi = degMidi(def.tonic, mode, n.deg, n.oct + (sec.melOct ?? 0), n.acc);
        const b = b0 + n.beat;
        const endB = b + n.dur * 0.99;
        const seg = segs.find((s) => endB >= s.b && endB < s.b + s.beats);
        const segEnd = seg ? seg.b + seg.beats : b + n.dur;
        const hold = clamp(segEnd - b + 0.12, n.dur * 0.95, n.dur + 1.5);
        const inBar = n.beat / bpb;
        const phrase = 0.93 + 0.1 * Math.sin((Math.PI * ((inBar % 4) + 0.5)) / 4);
        const vel = sec.vel * 1.2 * phrase * n.vel * (Math.abs(n.beat % bpb) < 1e-6 ? 1.04 : 0.98);
        sc.piano.push({ b, hold, midi, vel });
        if (sec.bells && n.dur >= 1 && n.vel > 0.9) {
          sc.bells.push({ b, hold: 0, midi: midi + (midi < 79 ? 24 : 12), vel: sec.bells * vel });
        }
      }
    }
    b0 += total;
    sc.secEnds.push(b0);
  }
  // final chord: rolled, pedalled, left to ring out
  const fc = parseChords(def.endChord, mode, bpb)[0];
  const lv = lhVoicing(fc, tonicPc, def.lhLow);
  const rv = closeVoicing(fc, tonicPc, def.tonic - 5, 3);
  const all = [...lv, ...rv.filter((m) => m > lv[lv.length - 1] + 1)];
  all.forEach((m, k) =>
    sc.piano.push({ b: b0, dt: k * 0.045, hold: 0, holdSec: def.endHold, midi: m, vel: 0.42 * (k === 0 ? 1.1 : 0.95) }),
  );
  if (def.sections[def.sections.length - 1].pad) {
    for (const m of closeVoicing(fc, tonicPc, 55)) sc.pads.push({ b: b0, hold: 0, holdSec: def.endHold * 0.7, midi: m, vel: 0.8 * (def.sections[def.sections.length - 1].pad ?? 0) });
  }
  sc.endBeat = b0;
  return sc;
}

// ------------------------------------------------------------------ tempo & timing

class TempoMap {
  private readonly step = 1 / 24;
  private readonly secs: Float64Array;
  constructor(totalBeats: number, bpm: number, factor: (b: number) => number) {
    const n = Math.ceil(totalBeats / this.step) + 4;
    this.secs = new Float64Array(n + 1);
    let t = 0;
    for (let i = 0; i <= n; i++) {
      this.secs[i] = t;
      t += (60 / (bpm * factor((i + 0.5) * this.step))) * this.step;
    }
  }
  sec(b: number): number {
    const x = Math.max(0, b) / this.step;
    const i = Math.min(this.secs.length - 2, Math.floor(x));
    const f = x - i;
    return this.secs[i] + (this.secs[i + 1] - this.secs[i]) * f;
  }
}

// ------------------------------------------------------------------ rendering

function activeRms(b: Float32Array): number {
  let pk = 0;
  for (let i = 0; i < b.length; i += 7) pk = Math.max(pk, Math.abs(b[i]));
  const blk = 2048;
  let s = 0;
  let c = 0;
  for (let i = 0; i + blk <= b.length; i += blk) {
    let e = 0;
    for (let j = i; j < i + blk; j += 2) e += b[j] * b[j];
    const r = Math.sqrt(e / (blk / 2));
    if (r > pk * 0.03) {
      s += e;
      c += blk / 2;
    }
  }
  return Math.sqrt(s / Math.max(1, c));
}

/** Subtle tape wow: slowly modulated fractional delay (a touch of lo-fi warmth). */
function wow(buf: Float32Array, sr: number, rng: Rng): Float32Array {
  const out = new Float32Array(buf.length);
  const base = 0.004 * sr;
  const d1 = 0.00035 * sr;
  const d2 = 0.00012 * sr;
  const f1 = rng.range(0.25, 0.35) / sr;
  const f2 = rng.range(0.9, 1.3) / sr;
  for (let i = 0; i < buf.length; i++) {
    const d = base + d1 * sinCyc(f1 * i) + d2 * sinCyc(f2 * i + 0.3);
    const p = i - d;
    const k = Math.floor(p);
    if (k < 0) continue;
    const f = p - k;
    out[i] = buf[k] + (buf[k + 1] - buf[k]) * f;
  }
  return out;
}

export function renderTrack(def: TrackDef, sr: number): Float32Array {
  const rng = new Rng(def.seed);
  const sc = buildScore(def, rng);
  const bpb = def.beats;
  const endB = sc.endBeat;
  const lastSec = sc.secEnds.length > 1 ? sc.secEnds[sc.secEnds.length - 2] : 0;
  const factor = (b: number): number => {
    let f = 1;
    // breathe at the end of each section
    for (const e of sc.secEnds) if (b > e - 1 && b < e) f = Math.min(f, 0.93);
    // final ritardando across the closing bars
    const ritStart = Math.max(lastSec, endB - 2 * bpb);
    if (b > ritStart) f = Math.min(f, 1 - 0.2 * clamp((b - ritStart) / (endB - ritStart), 0, 1));
    return f;
  };
  const tm = new TempoMap(endB + 8, def.bpm, factor);
  const endSec = tm.sec(endB);
  const total = endSec + def.endHold + 3.5;
  const N = Math.round(total * sr);
  const hum = (e: NoteEv) => {
    const t = Math.max(0, tm.sec(e.b) + (e.dt ?? 0) + rng.gauss() * 0.007);
    const hold = e.holdSec ?? tm.sec(e.b + e.hold) - tm.sec(e.b);
    const vel = clamp(e.vel * (1 + rng.gauss() * 0.05), 0.05, 1);
    return { t, hold, vel, midi: e.midi };
  };

  // ---- piano: cache one rendered note per pitch, then mix with velocity, brightness and damper
  const piano = new Float32Array(N);
  const pev = sc.piano.map(hum);
  const relTau = (m: number) => 0.09 + 0.3 * clamp((60 - m) / 36, 0, 1);
  const need = new Map<number, number>();
  for (const e of pev) need.set(e.midi, Math.max(need.get(e.midi) ?? 0, e.hold + relTau(e.midi) * 7));
  const cache = new Map<number, Float32Array>();
  for (const [m, sec] of need) {
    const len = Math.round(Math.min(sec, pianoDecay(m) * 1.25, 13) * sr);
    cache.set(m, pianoNote(m, len, sr, def.seed ^ Math.imul(m, 0x9e3779b1), def.tone));
  }
  for (const e of pev) {
    const src = cache.get(e.midi);
    if (!src) continue;
    const s = Math.round(e.t * sr);
    const hold = Math.round(e.hold * sr);
    const rt = relTau(e.midi);
    const kr = Math.exp(-1 / (rt * sr));
    const end = Math.min(src.length, hold + Math.round(rt * 7 * sr), N - s);
    const fc = clamp(mtof(e.midi) * (2.5 + 16 * e.vel * e.vel), 500, 14000);
    const a = 1 - Math.exp((-TAU * fc) / sr);
    const g = Math.pow(e.vel, 1.6);
    let lp = 0;
    let env = g;
    for (let k = 0; k < end; k++) {
      lp += a * (src[k] - lp);
      if (k >= hold) env *= kr;
      piano[s + k] += lp * env;
    }
  }
  // warm, slightly soft piano tone
  lowShelf(piano, 220, 2, sr);
  peakEq(piano, 2600, 0.8, -2, sr);
  highShelf(piano, 6000, -2, sr);
  const pianoRms = activeRms(piano);
  const master = piano;

  // ---- pads
  if (sc.pads.length) {
    const pads = new Float32Array(N);
    const notes: PadNote[] = sc.pads.map((e) => {
      const h = hum(e);
      return { t: Math.max(0, h.t - 0.1), dur: h.hold, midi: e.midi, vel: e.vel };
    });
    const po = def.pad ?? { attack: 1.6, release: 2.5, cutoff: 1300 };
    renderPads(pads, sr, rng, notes, { ...po, voices: 3, detune: 7, move: 0.25 });
    const r = activeRms(pads);
    if (r > 1e-9) mixInto(master, pads, 0, ((def.mix?.pad ?? 0.3) * pianoRms) / r);
  }
  // ---- sub bass
  if (sc.bass.length) {
    const bass = new Float32Array(N);
    renderBass(
      bass,
      sr,
      sc.bass.map((e) => {
        const h = hum(e);
        return { t: h.t, dur: h.hold, midi: e.midi, vel: e.vel };
      }),
    );
    const r = activeRms(bass);
    if (r > 1e-9) mixInto(master, bass, 0, ((def.mix?.bass ?? 0.3) * pianoRms) / r);
  }
  // ---- bells
  if (sc.bells.length) {
    const bells = new Float32Array(N);
    for (const e of sc.bells) {
      const h = hum(e);
      addBell(bells, sr, h.t, e.midi, h.vel);
    }
    const r = activeRms(bells);
    if (r > 1e-9) mixInto(master, bells, 0, ((def.mix?.bell ?? 0.3) * pianoRms) / r);
  }
  // ---- plucked arpeggios (with a soft echo)
  if (sc.pluck.length) {
    const pl = new Float32Array(N);
    const pc2 = new Map<number, Float32Array>();
    for (const e of sc.pluck) {
      const h = hum(e);
      let src = pc2.get(e.midi);
      if (!src) {
        src = pluckNote(e.midi, Math.round(1.2 * sr), sr);
        pc2.set(e.midi, src);
      }
      const s = Math.round(h.t * sr);
      const g = h.vel;
      const end = Math.min(src.length, N - s);
      for (let k = 0; k < end; k++) pl[s + k] += src[k] * g;
    }
    lowpass(pl, 2600, sr);
    // dotted-eighth echo, darker on each repeat
    const dly = Math.round(((0.75 * 60) / def.bpm) * sr);
    const line = new Float32Array(dly);
    let p = 0;
    let lpv = 0;
    for (let i = 0; i < N; i++) {
      const d = line[p];
      lpv += 0.35 * (d - lpv);
      line[p] = pl[i] + lpv * 0.42;
      pl[i] += lpv * 0.5;
      if (++p >= dly) p = 0;
    }
    const r = activeRms(pl);
    if (r > 1e-9) mixInto(master, pl, 0, ((def.mix?.pluck ?? 0.45) * pianoRms) / r);
  }

  // ---- room, tape, level
  const verb = reverb(master, sr, {
    t60: def.verb.t60,
    hf: 0.35,
    size: 1.35,
    pre: 0.022,
    wet: def.verb.wet,
    dry: 1,
    tail: 0,
    lowcut: 140,
    highcut: 7500,
  });
  let out = wow(verb, sr, rng);
  lowpass(out, 11000, sr);
  // normalise before the gentle saturation so it behaves the same on every track
  let pk = 0;
  for (let i = 0; i < out.length; i++) pk = Math.max(pk, Math.abs(out[i]));
  if (pk > 0) for (let i = 0; i < out.length; i++) out[i] /= pk;
  softClip(out, 1.25);
  // end: fade the ringing final chord away; trim trailing near-silence
  const endAt = Math.min(out.length, Math.round((endSec + def.endHold + 2.5) * sr));
  const fadeLen = Math.round(3.5 * sr);
  out = out.slice(0, endAt);
  for (let i = 0; i < fadeLen && i < out.length; i++) {
    const x = i / fadeLen;
    out[out.length - 1 - i] *= x * x;
  }
  fadeIn(out, Math.round(0.03 * sr));
  // DC safety + normalise to the music level
  let mean = 0;
  for (let i = 0; i < out.length; i++) mean += out[i];
  mean /= out.length;
  pk = 0;
  for (let i = 0; i < out.length; i++) {
    out[i] -= mean;
    pk = Math.max(pk, Math.abs(out[i]));
  }
  const g = pk > 0 ? MUSIC_PEAK / pk : 0;
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}

export const MUSIC_PEAK = 0.6;

// ------------------------------------------------------------------ the pieces

const TRACKS: TrackDef[] = [
  {
    // 0 — gentle, hopeful; flowing eighths under a simple singing line
    name: 'Meadow Light',
    seed: 0x51a7e1,
    tonic: 74, // D5
    mode: 'ionian',
    bpm: 68,
    beats: 4,
    lhLow: 38,
    tone: 0.45,
    verb: { t60: 3.2, wet: 0.95 },
    sections: [
      { bars: 4, chords: '1maj9 6m7 4maj7 5sus2', lh: 'sparse', vel: 0.36 },
      {
        bars: 8,
        chords: '1maj9 6m7 4maj7 5sus2 1maj9 3m7 4maj7 4m6',
        lh: 'arp8',
        vel: 0.4,
        mel: 'r:h 5,:q 1:q | 3:h. 2:q | 1:q 7,:q 1:h | 5,:w | r:h 5,:q 1:q | 3:h. 5:q | 4:q 3:q 2:q 1:q | 2:w',
      },
      {
        bars: 8,
        chords: '1maj9 6m7 4maj7 5sus2 1maj9 3m7 4maj7 4m6',
        lh: 'arp8',
        vel: 0.44,
        mel: 'r:h 5,:q 1:q | 3:h. 2:q | 1:q 7,:q 1:h | 5,:w | r:h 5,:q 1:q | 3:h. 5:q | 4:q 3:q 2:q 1:q | 2:w',
        vary: ['orn', 'thirds'],
      },
      {
        bars: 8,
        chords: '6m9 3m7 4maj7 1maj7/3 2m7 5sus4 4maj9 5sus2',
        lh: 'arp8',
        vel: 0.38,
        pad: 1,
        mel: '6:h 5:q 3:q | 5:w | 4:q. 3:e 2:h | 3:w | 2:h 3:q 5:q | 4:h. 5:q | 6:h 5:q 3:q | 2:w',
        vary: ['shift'],
      },
      {
        bars: 4,
        chords: '1maj9 6m7 4maj7 5sus2',
        lh: 'arp8',
        vel: 0.36,
        mel: 'r:h 5,:q 1:q | 3:h. 2:q | 1:q 7,:q 1:h | 5,:w',
        vary: ['sparse'],
        melOct: 1,
      },
      { bars: 4, chords: '1maj9 4maj7 1maj9 4maj7', lh: 'sparse', vel: 0.32, pad: 0.8, mel: 'r:w | 3:h 2:h | 1:w | r:w' },
    ],
    endChord: '1maj9',
    endHold: 8,
    mix: { pad: 0.26 },
  },
  {
    // 1 — melancholic waltz in A minor
    name: 'Hollow Oak',
    seed: 0x0a4b17,
    tonic: 69, // A4
    mode: 'aeolian',
    bpm: 62,
    beats: 3,
    lhLow: 40,
    tone: 0.4,
    verb: { t60: 3.4, wet: 1.0 },
    sections: [
      { bars: 4, chords: '1m9 6maj7 4m9 5m7', lh: 'arp6', vel: 0.34 },
      {
        bars: 8,
        chords: '1m9 6maj7 4m9 5m7 1m9 6maj7 3maj7 5sus4',
        lh: 'arp6',
        vel: 0.4,
        mel: '1:q 2:q 3:q | 5:h 3:q | 4:h. | 2:h 7,:q | 1:q 2:q 3:q | 5:h 6:q | 5:q 3:q 2:q | 1:h.',
      },
      {
        bars: 8,
        chords: '1m9 6maj7 4m9 5m7 1m9 6maj7 3maj7 5sus4',
        lh: 'arp6',
        vel: 0.43,
        mel: '1:q 2:q 3:q | 5:h 3:q | 4:h. | 2:h 7,:q | 1:q 2:q 3:q | 5:h 6:q | 5:q 3:q 2:q | 1:h.',
        vary: ['octave', 'orn'],
      },
      {
        bars: 8,
        chords: '6maj7 7add9 3maj7 1m9 4m7 5m7 6maj7 5sus4',
        lh: 'waltz',
        vel: 0.36,
        pad: 1,
        mel: 'r:q 6:q 5:q | 4:h 2:q | 3:h. | r:h. | r:q 4:q 3:q | 2:h 5:q | 3:h 2:q | 2:h.',
      },
      {
        bars: 8,
        chords: '1m9 6maj7 4m9 5m7 1m9 6maj7 3maj7 5sus4',
        lh: 'arp6',
        vel: 0.37,
        mel: '1:q 2:q 3:q | 5:h 3:q | 4:h. | 2:h 7,:q | 1:q 2:q 3:q | 5:h 6:q | 5:q 3:q 2:q | 1:h.',
        vary: ['sparse', 'double'],
      },
      { bars: 4, chords: '1m9 6maj7 1m9 1m9', lh: 'sparse', vel: 0.3, pad: 0.7 },
    ],
    endChord: '1m9',
    endHold: 8,
  },
  {
    // 2 — floating Lydian colours, quarter-note pulse
    name: 'Lanterns',
    seed: 0x1a47e2,
    tonic: 77, // F5
    mode: 'lydian',
    bpm: 72,
    beats: 4,
    lhLow: 41,
    tone: 0.5,
    verb: { t60: 3.0, wet: 0.9 },
    sections: [
      { bars: 4, chords: '1maj7 2/1 1maj7 2/1', lh: 'block', vel: 0.34 },
      {
        bars: 8,
        chords: '1maj7 2/1 1maj7 2/1 6m7 5add9 3m7 2',
        lh: 'pulse',
        vel: 0.4,
        mel: '3,:q 5,:q 7,:h | 6,:h. 4,:q | 3,:q 5,:q 1:h | 7,:h 6,:h | 6,:h 5,:q 3,:q | 2,:h. 3,:q | 5,:h 3,:h | 2,:w',
      },
      {
        bars: 8,
        chords: '6m9 3m7 2 2 6m9 3m7 5sus4 5',
        lh: 'arp8',
        vel: 0.38,
        pad: 1,
        mel: '1:h 7,:q 6,:q | 5,:w | 4,:q. 5,:e 6,:h | 2,:w | 1:h 2:q 1:q | 7,:w | 6,:q 5,:q 4,:q 5,:q | 5,:w',
      },
      {
        bars: 8,
        chords: '1maj7 2/1 1maj7 2/1 6m7 5add9 3m7 2',
        lh: 'pulse',
        vel: 0.42,
        bells: 0.5,
        mel: '3,:q 5,:q 7,:h | 6,:h. 4,:q | 3,:q 5,:q 1:h | 7,:h 6,:h | 6,:h 5,:q 3,:q | 2,:h. 3,:q | 5,:h 3,:h | 2,:w',
        vary: ['orn'],
      },
      { bars: 4, chords: '1maj7 2/1 1maj7 1maj7', lh: 'block', vel: 0.32, pad: 0.7, mel: 'r:w | 7,:h 6,:h | 5,:w | r:w' },
    ],
    endChord: '1maj7',
    endHold: 8,
    mix: { bell: 0.28 },
  },
  {
    // 3 — very sparse, pad-led stillness
    name: 'Stillwater',
    seed: 0x5711a7,
    tonic: 75, // Eb5
    mode: 'ionian',
    bpm: 56,
    beats: 4,
    lhLow: 39,
    tone: 0.38,
    verb: { t60: 3.8, wet: 1.1 },
    pad: { attack: 2.4, release: 3.2, cutoff: 1100 },
    sections: [
      { bars: 4, chords: '1maj9:2 4maj7:2', lh: 'sparse', vel: 0.32, pad: 1, bass: 0.6 },
      {
        bars: 8,
        chords: '1maj9:2 4maj7:2 6m9:2 5sus4:2',
        lh: 'sparse',
        vel: 0.36,
        pad: 1,
        bass: 0.6,
        mel: 'r:w | 5:h. 3:q | 2:w | r:w | r:h 1\':q 7:q | 5:w | 6:h. 5:q | 3:w',
      },
      {
        bars: 8,
        chords: '2m9:2 5sus4:2 4maj9:2 1maj9:2',
        lh: 'sparse',
        vel: 0.34,
        pad: 1,
        bass: 0.6,
        mel: 'r:h 3:q 2:q | 1:w | r:w | 5,:h 6,:h | 7,:w | r:w | 3:h. 2:q | 1:w',
      },
      {
        bars: 8,
        chords: '1maj9:2 4maj7:2 6m9:2 5sus4:2',
        lh: 'sparse',
        vel: 0.35,
        pad: 1,
        bass: 0.6,
        bells: 0.6,
        mel: 'r:w | 5:h. 3:q | 2:w | r:w | r:h 1\':q 7:q | 5:w | 6:h. 5:q | 3:w',
        vary: ['shift'],
      },
      { bars: 2, chords: '1maj9:2', lh: 'sparse', vel: 0.3, pad: 0.9, bass: 0.5 },
    ],
    endChord: '1maj9',
    endHold: 8,
    mix: { pad: 0.42, bass: 0.22, bell: 0.3 },
  },
  {
    // 4 — flowing, bright arpeggios in G
    name: 'Birch Path',
    seed: 0xb12c4,
    tonic: 67, // G4
    mode: 'ionian',
    bpm: 78,
    beats: 4,
    lhLow: 38,
    tone: 0.52,
    verb: { t60: 2.9, wet: 0.85 },
    sections: [
      { bars: 2, chords: '1add9 5/7', lh: 'arp8b', vel: 0.36 },
      {
        bars: 8,
        chords: '1add9 5/7 6m7 3m7 4maj7 1/3 2m7 5sus4',
        lh: 'arp8b',
        vel: 0.4,
        mel: "r:q 3:q 5:q 1':q | 7:h. 6:q | 5:q 3:q 5:h | 6:h 5:h | r:q 3:q 5:q 1':q | 2':h. 1':q | 7:q 6:q 5:q 3:q | 5:w",
      },
      {
        bars: 8,
        chords: '1add9 5/7 6m7 3m7 4maj7 1/3 2m7 5sus4',
        lh: 'arp8b',
        vel: 0.43,
        mel: "r:q 3:q 5:q 1':q | 7:h. 6:q | 5:q 3:q 5:h | 6:h 5:h | r:q 3:q 5:q 1':q | 2':h. 1':q | 7:q 6:q 5:q 3:q | 5:w",
        vary: ['thirds'],
      },
      {
        bars: 8,
        chords: '6m9 3m7 4maj7 1/3 2m7 3m7 4maj7 5sus2',
        lh: 'arp8',
        vel: 0.38,
        pad: 0.9,
        mel: "2:h 3:q 5:q | 6:w | 5:q. 3:e 2:h | 3:w | 1':h 7:q 6:q | 5:w | 6:h 5:q 3:q | 2:w",
      },
      {
        bars: 8,
        chords: '1add9 5/7 6m7 3m7 4maj7 1/3 2m7 5sus4',
        lh: 'arp8b',
        vel: 0.4,
        mel: "r:q 3:q 5:q 1':q | 7:h. 6:q | 5:q 3:q 5:h | 6:h 5:h | r:q 3:q 5:q 1':q | 2':h. 1':q | 7:q 6:q 5:q 3:q | 5:w",
        vary: ['orn', 'sparse'],
      },
      { bars: 4, chords: '4maj7 1/3 4maj7 1add9', lh: 'sparse', vel: 0.32, pad: 0.7 },
    ],
    endChord: '1add9',
    endHold: 7.5,
  },
  {
    // 5 — tender waltz with celesta colours
    name: 'Ember',
    seed: 0xe3be2,
    tonic: 72, // C5
    mode: 'ionian',
    bpm: 64,
    beats: 3,
    lhLow: 36,
    tone: 0.42,
    verb: { t60: 3.3, wet: 1.0 },
    sections: [
      { bars: 4, chords: '4maj7 5add9 3m7 6m7', lh: 'waltz', vel: 0.33 },
      {
        bars: 8,
        chords: '4maj7 5add9 3m7 6m7 2m9 5sus4 1maj7 1maj7',
        lh: 'waltz',
        vel: 0.38,
        mel: '3:h 5:q | 6:h. | 5:q 3:q 2:q | 3:h. | 2:h 3:q | 1:h 7,:q | 1:h. | r:h.',
      },
      {
        bars: 8,
        chords: '6m7 3m7 4maj7 1/3 2m7 5sus4 5 5',
        lh: 'arp6',
        vel: 0.36,
        pad: 0.9,
        mel: 'r:q 3:q 5:q | 7:h 6:q | 5:h. | 3:h. | 4:q 3:q 2:q | 1:h. | 2:h 7,:q | 5,:h.',
      },
      {
        bars: 8,
        chords: '4maj7 5add9 3m7 6m7 2m9 5sus4 1maj7 1maj7',
        lh: 'arp6',
        vel: 0.4,
        bells: 0.7,
        mel: '3:h 5:q | 6:h. | 5:q 3:q 2:q | 3:h. | 2:h 3:q | 1:h 7,:q | 1:h. | r:h.',
        vary: ['orn'],
      },
      { bars: 4, chords: '4maj7 5add9 1maj7 1maj7', lh: 'waltz', vel: 0.3, pad: 0.7, mel: 'r:h. | 5:h 3:q | 1:h. | r:h.' },
    ],
    endChord: '1maj7',
    endHold: 7.5,
    mix: { bell: 0.34 },
  },
];

const MENU: TrackDef = {
  // dreamy, a little more motion: synth arpeggios, pads and a piano line
  name: 'Drift',
  seed: 0xd21f7,
  tonic: 76, // E5
  mode: 'ionian',
  bpm: 84,
  beats: 4,
  lhLow: 40,
  tone: 0.48,
  verb: { t60: 3.4, wet: 1.0 },
  pad: { attack: 1.8, release: 2.8, cutoff: 1500 },
  sections: [
    { bars: 4, chords: '1add9 3m7 6m7 4maj7', lh: 'none', vel: 0.35, pad: 1, arp: 0.8 },
    {
      bars: 8,
      chords: '1add9 3m7 6m7 4maj7 1add9 5sus4 4maj9 4m6',
      lh: 'sparse',
      vel: 0.38,
      pad: 1,
      arp: 0.8,
      bass: 0.7,
      mel: 'r:h 5,:q 1:q | 2:h 1:q 7,:q | 1:w | r:h 3:q 5:q | 6:h. 5:q | 2:q 1:q 7,:q 1:q | 3:w | 2:w',
    },
    {
      bars: 8,
      chords: '6m9 3m7 4maj7 1/3 2m7 5sus4 4maj7 5sus2',
      lh: 'sparse',
      vel: 0.36,
      pad: 1,
      arp: 1,
      bass: 0.7,
      bells: 0.6,
      mel: '6:h 5:q 3:q | 5:w | 4:q. 3:e 2:h | 3:w | 2:h 3:q 5:q | 4:h. 5:q | 6:h 5:q 3:q | 2:w',
    },
    {
      bars: 8,
      chords: '1add9 3m7 6m7 4maj7 1add9 5sus4 4maj9 4m6',
      lh: 'sparse',
      vel: 0.4,
      pad: 1,
      arp: 0.9,
      bass: 0.7,
      mel: 'r:h 5,:q 1:q | 2:h 1:q 7,:q | 1:w | r:h 3:q 5:q | 6:h. 5:q | 2:q 1:q 7,:q 1:q | 3:w | 2:w',
      vary: ['orn', 'double'],
    },
    { bars: 4, chords: '1add9 4maj7 1add9 1add9', lh: 'sparse', vel: 0.32, pad: 1, arp: 0.6 },
  ],
  endChord: '1add9',
  endHold: 7,
  mix: { pad: 0.36, pluck: 0.5, bass: 0.26, bell: 0.26 },
};

export const MUSIC_TRACKS = TRACKS.length;
export const MUSIC_TRACK_NAMES = TRACKS.map((t) => t.name);

export function renderMusicTrack(index: number, sr: number): Float32Array {
  const i = ((Math.floor(index) % TRACKS.length) + TRACKS.length) % TRACKS.length;
  return renderTrack(TRACKS[i], sr);
}

export function renderMenuMusic(sr: number): Float32Array {
  return renderTrack(MENU, sr);
}

/** Dev helper: count melody bars whose written durations don't fill the bar. */
export function checkScores(): { name: string; misaligned: number; seconds: number }[] {
  return [...TRACKS, MENU].map((d) => {
    const sc = buildScore(d, new Rng(d.seed));
    return { name: d.name, misaligned: sc.misaligned, seconds: (sc.endBeat * 60) / d.bpm };
  });
}
