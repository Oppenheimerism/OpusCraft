// The witch (vanilla entity.witch.*): an old, pinched, nasal voice, higher than a villager's — cackles of
// "heh-heh-heh", a sly "hmm-hm", a yelp when hurt and a long falling wail as it dies, a grunt as it lobs a bottle
// (with the swish of its arm), and gulps as it drinks. Formant synthesis (voice.ts) with the nose's hum under it.
// Takes as in vanilla's sounds.json: ambient 5, celebrate 3, death 3, drink 4, hurt 3, throw 3.

import type { SoundGen } from '../synth';
import { alloc, envAD, envBump, layer, lowpass, highpass } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, sweep, thump, bubble } from './texture';
import { voice, VOWELS } from './voice';

interface Syl {
  t: number;
  d: number;
  /** pitch over the syllable's normalised time, in Hz */
  f: (x: number) => number;
  /** vowel (VOWELS), scaled up for a smaller throat */
  v: string;
  a?: number;
  /** breathiness: a cackle's "h" */
  h?: number;
  rough?: number;
}

/** one syllable in the witch's voice: pinched (a pressed glottis), nasal (a strong low hum, a notch of the nose) */
function syl(b: Float32Array, c: Ctx, s: Syl): void {
  const { sr, rng } = c;
  const [f1, f2, f3, f4] = VOWELS[s.v].map((x) => x * 1.16);
  const att = Math.min(0.02, s.d * 0.25);
  const h = s.h ?? 0.2;
  voice(b, sr, rng, {
    t: s.t,
    dur: s.d,
    f0: (t) => s.f(t / s.d),
    amp: (t) => envBump(t, att, s.d - att),
    formants: [
      // (the nasal murmur)
      { f: 280, bw: 90, g: 0.55 },
      { f: f1, bw: 110, g: 0.9 },
      { f: f2, bw: 140, g: 0.55 },
      { f: f3, bw: 220, g: 0.3 },
      { f: f4, bw: 300, g: 0.12 },
    ],
    oq: 0.42,
    jitter: 0.03,
    shimmer: 0.1,
    rough: s.rough ?? 0.22,
    sub: 0.03,
    breath: (t) => h * (1 - Math.min(1, t / (s.d * 0.5))) + 0.06,
    vib: [6.5, 0.012],
    gain: s.a ?? 1,
  });
}

function finishVoice(out: Float32Array, sr: number): Float32Array {
  highpass(out, 120, sr);
  lowpass(out, 6500, sr);
  return out;
}

/** a cackle: `n` bursts of "heh", each a little lower (or higher) than the last */
function cackle(c: Ctx, n: number, base: number, step: number, gap: number, vowel = 'e', t0 = 0): Syl[] {
  const out: Syl[] = [];
  for (let i = 0; i < n; i++) {
    const f = base * Math.pow(step, i) * c.rng.range(0.97, 1.03);
    out.push({ t: t0 + i * gap * c.rng.range(0.9, 1.1), d: gap * c.rng.range(0.55, 0.7), f: (x) => f * (1.08 - 0.12 * x), v: vowel, h: 0.55, a: 1 - i * 0.08 });
  }
  return out;
}

function say(c: Ctx, len: number, syls: Syl[]): Float32Array {
  const out = alloc(len, c.sr);
  layer(out, 1, (b) => {
    for (const s of syls) syl(b, c, s);
  });
  return finishVoice(out, c.sr);
}

/** vanilla mob/witch/ambient1-5: cackles, a sly "hmm-hm", a sniggering "hee-hee" */
function ambient(c: Ctx): Float32Array {
  const { rng } = c;
  const base = rng.range(250, 300);
  switch (c.v % 5) {
    case 0:
      return say(c, 0.9, cackle(c, 4, base, 0.95, 0.15));
    case 1:
      return say(c, 0.8, [
        { t: 0, d: 0.22, f: (x) => base * (0.9 + 0.12 * x), v: 'm', h: 0.1 },
        { t: 0.28, d: 0.3, f: (x) => base * (1.05 - 0.2 * x), v: 'm', h: 0.1, rough: 0.3 },
      ]);
    case 2:
      return say(c, 0.8, cackle(c, 3, base * 1.2, 1.03, 0.14, 'i'));
    case 3:
      return say(c, 1.0, [...cackle(c, 3, base, 0.93, 0.13), { t: 0.45, d: 0.34, f: (x) => base * (0.95 - 0.25 * x), v: 'uh', h: 0.3 }]);
    default:
      return say(c, 0.7, [{ t: 0, d: 0.42, f: (x) => base * (1 + 0.25 * Math.sin(Math.PI * x)), v: 'ae', h: 0.25, rough: 0.35 }]);
  }
}

/** vanilla entity.witch.celebrate: a long, delighted cackle */
function celebrate(c: Ctx): Float32Array {
  const base = c.rng.range(270, 320);
  return say(c, 1.3, cackle(c, 7, base * 1.1, 0.95, 0.14, c.v % 2 ? 'a' : 'e'));
}

/** vanilla mob/witch/hurt1-3: a startled yelp */
function hurt(c: Ctx): Float32Array {
  const base = c.rng.range(300, 360);
  return say(c, 0.4, [{ t: 0, d: c.rng.range(0.16, 0.24), f: (x) => base * (1.15 - 0.3 * x), v: c.v % 2 ? 'e' : 'ae', h: 0.35, rough: 0.35 }]);
}

/** vanilla mob/witch/death1-3: a wail that falls away */
function death(c: Ctx): Float32Array {
  const base = c.rng.range(290, 340);
  const d = c.rng.range(0.9, 1.2);
  return say(c, d + 0.2, [{ t: 0, d, f: (x) => base * (1.2 - 0.55 * x * x) * (1 + 0.03 * Math.sin(40 * x)), v: 'a', h: 0.3, rough: 0.4 }]);
}

/** vanilla mob/witch/throw1-3: a grunt of effort and the swish of the arm */
function throwIt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const base = rng.range(260, 300);
  const out = say(c, 0.5, [{ t: 0.02, d: 0.14, f: (x) => base * (1.1 - 0.2 * x), v: 'uh', h: 0.5 }]);
  layer(out, 0.45, (b) => sweep(b, sr, rng, { t: 0.04, dur: 0.22, f: (t) => 900 + 2200 * (t / 0.22), q: 1.5, amp: (t) => envBump(t, 0.12, 0.1) }));
  return out;
}

/** vanilla mob/witch/drink1-4: two or three gulps down a thin throat */
function drink(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  const n = 2 + (c.v % 2);
  layer(out, 1, (b) => {
    for (let i = 0; i < n; i++) {
      const t = 0.02 + i * rng.range(0.13, 0.17);
      bubble(b, sr, t, rng.range(420, 560), 1, 0.03, 0.8);
      bubble(b, sr, t + 0.012, rng.range(700, 900), 0.4, 0.015, 0.5);
      thump(b, sr, { t: t + 0.008, f0: 210, f1: 140, tau: 0.02, amp: 0.45 });
      burst(b, sr, rng, { t, dur: 0.08, attack: 0.008, tau: 0.02, lp: 900, amp: 0.3, env: (x) => envAD(x, 0.005, 0.03) });
    }
  });
  return out;
}

export function witchSounds(): Record<string, SoundGen> {
  return {
    'entity.witch.ambient': sound('entity.witch.ambient', 5, ambient),
    'entity.witch.celebrate': sound('entity.witch.celebrate', 3, celebrate),
    'entity.witch.death': sound('entity.witch.death', 3, death),
    'entity.witch.drink': sound('entity.witch.drink', 4, drink),
    'entity.witch.hurt': sound('entity.witch.hurt', 3, hurt),
    'entity.witch.throw': sound('entity.witch.throw', 3, throwIt),
  };
}
