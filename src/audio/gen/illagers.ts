// The sounds of the shield, the illagers and their raids.
// The shield (vanilla item.shield.block, item/shield/block1-5): a blow landing on the boards, a heavy wooden thud
// with the iron rim's clank in it. (item.shield.break is vanilla's random/break, the item-break sound: aliased in
// soundManager.)
// The illagers (vanilla entity.pillager/vindicator/evoker.*): the villager's nasal "hrmm" gone gruff and sly — lower,
// rougher, pressed, muttering "hrr-hm", "huh", a sneering "heh"; cheers when a village falls; the evoker's spells
// (a rising hum for the fangs, a choir-like swell for the vexes, and its famous "wololo"), its cast's airy whoosh.
// The fangs: jaws of bone snapping shut. The vex: a small shrill spirit — chittering, a hiss as it charges.
// The ravager: a great beast's grumbling snorts, a bellowing roar, stamping feet, a bite, dazed groans.
// The totem of undying: a bright magical chime-swell. Formant synthesis (voice.ts) and foley textures.

import type { SoundGen } from '../synth';
import { alloc, envAD, envBump, envPts, layer, lowpass, highpass, smooth } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, impact, sweep, thump } from './texture';
import { voice, vowelGlide } from './voice';
import { reverbHalf } from './world';

/** vanilla item/shield/block1-5: the blow on the boards, the wood's knock, the rim's short clank */
function shieldBlock(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.42, sr);
  layer(out, 1, (b) => thump(b, sr, { f0: rng.range(150, 185), f1: rng.range(85, 105), tau: 0.045, h2: 0.3 }));
  // the boards: a hollow knock
  layer(out, 0.8, (b) => impact(b, sr, rng, { modes: [rng.range(420, 520), 1, 0.05, rng.range(690, 820), 0.6, 0.035, rng.range(1150, 1350), 0.3, 0.02], jitter: 0.02, noise: 0.5, noiseTau: 0.004, noiseBp: [900, 1.1] }));
  layer(out, 0.6, (b) => burst(b, sr, rng, { dur: 0.08, attack: 0.0006, tau: 0.012, bp: [rng.range(1300, 1800), 0.9] }));
  // the rim: iron, briefly
  layer(out, 0.28, (b) => impact(b, sr, rng, { t: 0.002, modes: [rng.range(2300, 2700), 1, 0.09, rng.range(3500, 3900), 0.5, 0.06, rng.range(5200, 5800), 0.25, 0.04], jitter: 0.01 }));
  return out;
}

// ---------------------------------------------------------------------------
// the illagers' voices

interface Mutter {
  t: number;
  d: number;
  /** pitch over normalised time, a multiple of the voice's base */
  f: (x: number) => number;
  a?: number;
  /** 0: lips shut ("mm") .. 1: open ("ah") in the middle */
  open?: number;
  /** vowel the mouth opens to */
  v?: string;
  /** growl in the throat */
  rough?: number;
  breath?: number;
}

/** an illager's voice: the villager's nasal hum made lower, pressed and gravelly; `nasal` its hum's weight */
interface Throat {
  base: [number, number];
  /** formant scale */
  fs: number;
  nasal: number;
  rough: number;
}

const PILLAGER: Throat = { base: [104, 122], fs: 0.94, nasal: 0.7, rough: 0.42 };
const VINDICATOR: Throat = { base: [96, 112], fs: 0.9, nasal: 0.6, rough: 0.5 };
const EVOKER: Throat = { base: [112, 128], fs: 0.98, nasal: 0.85, rough: 0.34 };

function mutterInto(b: Float32Array, c: Ctx, base: number, th: Throat, m: Mutter): void {
  const { sr, rng } = c;
  const d = m.d, open = m.open ?? 0.3;
  const att = Math.min(0.04, d * 0.2);
  const o = (t: number) => open * Math.sin(Math.PI * Math.min(1, t / d));
  const V = vowelGlide('m', m.v ?? 'uh', 0, d * 0.5, th.fs);
  voice(b, sr, rng, {
    t: m.t,
    dur: d,
    f0: (t) => base * m.f(t / d),
    amp: (t) => envBump(t, att, d - att),
    formants: [
      { f: (t) => 250 + (V[0](t) - 250) * o(t), bw: (t) => 80 + 60 * o(t), g: th.nasal },
      { f: (t) => V[0](t) * (0.6 + 0.4 * o(t)), bw: 120, g: (t) => 0.4 + 0.5 * o(t) },
      { f: V[1], bw: 150, g: (t) => 0.25 + 0.35 * o(t) },
      { f: V[2], bw: 240, g: 0.12 },
      { f: 3100 * th.fs, bw: 320, g: 0.04 },
    ],
    jitter: 0.03,
    shimmer: 0.12,
    rough: m.rough ?? th.rough,
    sub: 0.06,
    breath: m.breath ?? 0.1,
    oq: 0.45,
    growl: [rng.range(22, 30), (m.rough ?? th.rough) * 0.6],
    vib: [5, 0.008],
    gain: m.a ?? 1,
  });
}

function mutters(c: Ctx, th: Throat, len: number, list: Mutter[], pitch = 1): Float32Array {
  const out = alloc(len, c.sr);
  const base = c.rng.range(th.base[0], th.base[1]) * pitch;
  layer(out, 1, (b) => {
    for (const m of list) mutterInto(b, c, base, th, m);
  });
  highpass(out, 70, c.sr);
  lowpass(out, 5000, c.sr);
  return out;
}

/** the illagers' idle mutters: "hrmm", "hrr-hm", "huh?", a sneering "heh" */
function illagerAmbient(th: Throat): (c: Ctx) => Float32Array {
  return (c) => {
    switch (c.v % 4) {
      case 0:
        return mutters(c, th, 0.7, [{ t: 0, d: 0.5, f: (x) => 1.06 - 0.18 * x }]);
      case 1:
        return mutters(c, th, 0.8, [
          { t: 0, d: 0.24, f: (x) => 1.02 - 0.06 * x, open: 0.2 },
          { t: 0.3, d: 0.34, f: (x) => 1.1 - 0.24 * x, open: 0.4 },
        ]);
      case 2:
        return mutters(c, th, 0.6, [{ t: 0, d: 0.34, f: (x) => 0.95 + 0.3 * x * x, open: 0.55, v: 'uh', breath: 0.25 }]);
      default:
        return mutters(c, th, 0.6, [
          { t: 0, d: 0.13, f: (x) => 1.2 - 0.1 * x, open: 0.8, v: 'e', breath: 0.45 },
          { t: 0.17, d: 0.15, f: (x) => 1.12 - 0.16 * x, open: 0.7, v: 'e', breath: 0.45, a: 0.8 },
        ]);
    }
  };
}

/** a hurt illager: a short, sharp grunt */
function illagerHurt(th: Throat): (c: Ctx) => Float32Array {
  return (c) => mutters(c, th, 0.35, [{ t: 0, d: c.rng.range(0.15, 0.22), f: (x) => 1.35 - 0.35 * x, open: 0.9, v: c.v % 2 ? 'uh' : 'a', rough: th.rough + 0.15, breath: 0.3 }]);
}

/** a dying illager: a long groan falling away */
function illagerDeath(th: Throat): (c: Ctx) => Float32Array {
  return (c) => {
    const d = c.rng.range(0.8, 1.05);
    return mutters(c, th, d + 0.15, [{ t: 0, d, f: (x) => (1.25 - 0.55 * x * x) * (1 + 0.025 * Math.sin(34 * x)), open: 0.85, v: 'o', rough: th.rough + 0.2, breath: 0.25 }]);
  };
}

/** an illager's cheer over a fallen village: a rising "hoo-hah!", a gloating laugh */
function illagerCelebrate(th: Throat): (c: Ctx) => Float32Array {
  return (c) => {
    if (c.v % 2 === 0)
      return mutters(c, th, 1.0, [
        { t: 0, d: 0.28, f: (x) => 1.1 + 0.2 * x, open: 0.8, v: 'u' },
        { t: 0.34, d: 0.46, f: (x) => 1.45 - 0.35 * x * x, open: 1, v: 'a', breath: 0.2 },
      ]);
    const list: Mutter[] = [];
    for (let i = 0; i < 5; i++) list.push({ t: i * 0.15, d: 0.1, f: (x) => (1.35 - i * 0.05) * (1.05 - 0.1 * x), open: 0.85, v: 'a', breath: 0.5, a: 1 - i * 0.1 });
    return mutters(c, th, 0.95, list);
  };
}

// ---------------------------------------------------------------------------
// the evoker's spells

/** vanilla entity.evoker.prepare_attack: a low hum rising in pitch and strength, the air humming with it */
function prepareAttack(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = mutters(c, EVOKER, 1.3, [{ t: 0, d: 1.1, f: (x) => 0.85 + 0.55 * smooth(x), open: 0.35, v: 'u', rough: 0.25 }]);
  layer(out, 0.35, (b) => sweep(b, sr, rng, { dur: 1.15, f: (t) => 300 + 900 * (t / 1.15), q: 6, amp: (t) => envBump(t, 0.9, 0.25) }));
  return out;
}

/** vanilla entity.evoker.prepare_summon: a swelling, choir-like "ooo-aah" with a shimmer over it */
function prepareSummon(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const base = rng.range(118, 128);
  const out = alloc(1.9, sr);
  layer(out, 1, (b) => {
    for (const [k, detune] of [[1, 1], [1.5, 1.004], [2, 0.997]] as [number, number][])
      mutterInto(b, c, base * k * detune, EVOKER, { t: 0.02 * k, d: 1.6, f: (x) => 0.95 + 0.15 * smooth(x), open: 0.9, v: 'o', rough: 0.12, breath: 0.2, a: 1 / k });
  });
  layer(out, 0.3, (b) => sweep(b, sr, rng, { dur: 1.8, f: (t) => 2500 + 2000 * Math.sin(t * 3), q: 8, amp: (t) => envBump(t, 1.2, 0.6) }));
  return reverbHalf(out, sr, { t60: 1.2, wet: 0.35, dry: 1 }).subarray(0, Math.round(2.4 * sr));
}

/** vanilla entity.evoker.prepare_wololo: "wo-lo-lo", sung low and nasal */
function prepareWololo(c: Ctx): Float32Array {
  const syl = (t: number, f: number, v: string): Mutter => ({ t, d: 0.3, f: () => f, open: 0.95, v, rough: 0.18, breath: 0.12 });
  return mutters(c, EVOKER, 1.2, [syl(0, 1.12, 'u'), syl(0.33, 1.0, 'o'), syl(0.66, 1.08, 'o')], 1.15);
}

/** vanilla entity.evoker.cast_spell: the spell let go — a rushing, whistling whoosh */
function castSpell(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.9, sr);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: 0.85, f: (t) => 600 + 2800 * Math.exp(-t * 5), q: 3, amp: (t) => envAD(t, 0.03, 0.25), color: 'pink' }));
  layer(out, 0.5, (b) => sweep(b, sr, rng, { dur: 0.7, f: (t) => 3000 - 1800 * (t / 0.7), q: 12, amp: (t) => envAD(t, 0.05, 0.2) }));
  return out;
}

/** vanilla entity.evoker_fangs.attack: bony jaws clacking shut, a crunch */
function fangsAttack(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  layer(out, 1, (b) => impact(b, sr, rng, { modes: [rng.range(900, 1100), 1, 0.03, rng.range(1700, 2000), 0.7, 0.02, rng.range(3100, 3500), 0.4, 0.012], jitter: 0.03, noise: 0.8, noiseTau: 0.006, noiseBp: [2400, 1.2] }));
  layer(out, 0.7, (b) => impact(b, sr, rng, { t: 0.035, modes: [rng.range(700, 850), 1, 0.025, rng.range(1500, 1700), 0.6, 0.018], jitter: 0.03, noise: 0.9, noiseTau: 0.008, noiseBp: [1800, 1] }));
  layer(out, 0.5, (b) => thump(b, sr, { f0: 140, f1: 70, tau: 0.04 }));
  return out;
}

// ---------------------------------------------------------------------------
// the vex

/** a vex's thin, shrill voice */
function vexVoice(c: Ctx, len: number, list: { t: number; d: number; f: (x: number) => number; a?: number; rough?: number }[]): Float32Array {
  const { sr, rng } = c;
  const out = alloc(len, sr);
  layer(out, 1, (b) => {
    for (const s of list) {
      const F = vowelGlide('i', 'e', 0, s.d, 1.8);
      voice(b, sr, rng, {
        t: s.t,
        dur: s.d,
        f0: (t) => s.f(t / s.d),
        amp: (t) => envBump(t, Math.min(0.02, s.d * 0.2), s.d * 0.8),
        formants: [
          { f: F[0], bw: 160, g: 0.8 },
          { f: F[1], bw: 220, g: 0.7 },
          { f: F[2], bw: 300, g: 0.4 },
          { f: 6500, bw: 800, g: 0.15 },
        ],
        jitter: 0.05,
        shimmer: 0.2,
        rough: s.rough ?? 0.35,
        breath: 0.45,
        oq: 0.35,
        growl: [rng.range(40, 60), 0.3],
        gain: s.a ?? 1,
      });
    }
  });
  highpass(out, 400, sr);
  return out;
}

/** vanilla mob/vex/idle1-4: little chitters and giggles */
function vexAmbient(c: Ctx): Float32Array {
  const { rng } = c;
  const base = rng.range(700, 900);
  const n = 2 + (c.v % 3);
  const list = [];
  for (let i = 0; i < n; i++) list.push({ t: i * 0.09, d: 0.06, f: (x: number) => base * (1.1 - 0.2 * x) * (1 + 0.08 * (i % 2)), a: 1 - i * 0.12 });
  return vexVoice(c, 0.5, list);
}

/** vanilla mob/vex/charge1-3: a hissing shriek as it flies at you */
function vexCharge(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const base = rng.range(800, 950);
  const out = vexVoice(c, 0.6, [{ t: 0, d: 0.45, f: (x) => base * (1 + 0.35 * Math.sin(Math.PI * x)), rough: 0.55 }]);
  layer(out, 0.4, (b) => sweep(b, sr, rng, { dur: 0.5, f: (t) => 3500 + 2500 * (t / 0.5), q: 2, amp: (t) => envBump(t, 0.2, 0.3) }));
  return out;
}

/** vanilla mob/vex/hurt1-2: a startled squeal */
function vexHurt(c: Ctx): Float32Array {
  const base = c.rng.range(950, 1150);
  return vexVoice(c, 0.3, [{ t: 0, d: 0.18, f: (x) => base * (1.2 - 0.35 * x), rough: 0.5 }]);
}

/** vanilla mob/vex/death1-2: a wailing screech trailing off into air */
function vexDeath(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const base = rng.range(850, 1000);
  const out = vexVoice(c, 0.9, [{ t: 0, d: 0.7, f: (x) => base * (1.3 - 0.7 * x * x), rough: 0.5 }]);
  layer(out, 0.3, (b) => sweep(b, sr, rng, { dur: 0.85, f: (t) => 4000 - 3000 * (t / 0.85), q: 3, amp: (t) => envBump(t, 0.3, 0.55) }));
  return out;
}

// ---------------------------------------------------------------------------
// the ravager

/** a great beast's throat: big, low, rough, snorting */
function beastInto(b: Float32Array, c: Ctx, t0: number, d: number, f0: (x: number) => number, open: number, a = 1, rough = 0.6): void {
  const { sr, rng } = c;
  const F = vowelGlide('uh', open > 0.6 ? 'a' : 'o', 0, d * 0.4, 0.62);
  voice(b, sr, rng, {
    t: t0,
    dur: d,
    f0: (t) => f0(t / d),
    amp: (t) => envBump(t, d * 0.15, d * 0.85),
    formants: [
      { f: (t) => F[0](t) * (0.7 + 0.3 * open), bw: 130, g: 1 },
      { f: 620, bw: 100, g: 0.45 },
      { f: F[1], bw: 180, g: 0.5 },
      { f: F[2], bw: 280, g: 0.18 },
    ],
    jitter: 0.07,
    shimmer: 0.3,
    rough,
    sub: 0.2,
    breath: 0.35,
    oq: 0.5,
    growl: [rng.range(14, 22), 0.6],
    gain: a,
  });
}

function beast(c: Ctx, len: number, fill: (b: Float32Array) => void): Float32Array {
  const out = alloc(len, c.sr);
  layer(out, 1, fill);
  highpass(out, 35, c.sr);
  lowpass(out, 4000, c.sr);
  return out;
}

/** vanilla mob/ravager/idle1-7: grumbling snorts and low growls */
function ravagerAmbient(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const base = rng.range(52, 64);
  return beast(c, 1.0, (b) => {
    if (c.v % 2) sweep(b, sr, rng, { dur: 0.3, f: (t) => 500 - 200 * (t / 0.3), q: 2, amp: (t) => envBump(t, 0.05, 0.25), color: 'pink' });
    beastInto(b, c, c.v % 2 ? 0.25 : 0, rng.range(0.5, 0.7), (x) => base * (1.05 - 0.15 * x), 0.3, 1);
  });
}

/** vanilla mob/ravager/roar: the great bellow, with the air shaking round it */
function ravagerRoar(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const base = rng.range(70, 80);
  const dry = beast(c, 1.6, (b) => {
    beastInto(b, c, 0, 1.4, (x) => base * (0.8 + 0.6 * Math.sin(Math.PI * Math.min(1, x * 1.3)) - 0.2 * x), 1, 1, 0.75);
    beastInto(b, c, 0.01, 1.35, (x) => base * 1.5 * (0.8 + 0.5 * Math.sin(Math.PI * Math.min(1, x * 1.3))), 0.8, 0.5, 0.8);
    sweep(b, sr, rng, { dur: 1.4, f: (t) => 700 + 500 * Math.sin((Math.PI * t) / 1.4), q: 1.2, amp: (t) => 0.5 * envBump(t, 0.2, 1.2), color: 'pink' });
  });
  return reverbHalf(dry, sr, { t60: 1.4, wet: 0.3, dry: 1 }).subarray(0, Math.round(2.4 * sr));
}

/** vanilla mob/ravager/stun1-3: a dazed, wobbling groan */
function ravagerStunned(c: Ctx): Float32Array {
  const base = c.rng.range(58, 66);
  return beast(c, 1.1, (b) => beastInto(b, c, 0, 0.95, (x) => base * (1.1 - 0.3 * x) * (1 + 0.1 * Math.sin(x * 25)), 0.5, 1, 0.5));
}

/** vanilla mob/ravager/bite1-3: the head's butt — a grunt and the horns' heavy knock */
function ravagerAttack(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const base = rng.range(66, 76);
  const out = beast(c, 0.6, (b) => beastInto(b, c, 0, 0.3, (x) => base * (1.15 - 0.25 * x), 0.8, 1, 0.7));
  layer(out, 0.8, (b) => thump(b, sr, { t: 0.06, f0: 110, f1: 55, tau: 0.07, h2: 0.4 }));
  layer(out, 0.4, (b) => impact(b, sr, rng, { t: 0.06, modes: [rng.range(300, 380), 1, 0.05, rng.range(620, 700), 0.5, 0.03], jitter: 0.03, noise: 0.6, noiseTau: 0.01, noiseBp: [800, 1] }));
  return out;
}

/** vanilla mob/ravager/hurt1-4: a pained snarl */
function ravagerHurt(c: Ctx): Float32Array {
  const base = c.rng.range(75, 88);
  return beast(c, 0.5, (b) => beastInto(b, c, 0, 0.32, (x) => base * (1.3 - 0.4 * x), 0.9, 1, 0.8));
}

/** vanilla mob/ravager/death1-3: a long, sinking bellow */
function ravagerDeath(c: Ctx): Float32Array {
  const base = c.rng.range(62, 72);
  return beast(c, 1.5, (b) => beastInto(b, c, 0, 1.3, (x) => base * (1.2 - 0.6 * x * x), 0.9, 1, 0.8));
}

/** vanilla mob/ravager/step1-5: a heavy hoof on the ground */
function ravagerStep(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.35, sr);
  layer(out, 1, (b) => thump(b, sr, { f0: rng.range(70, 85), f1: 40, tau: 0.06, h2: 0.3 }));
  layer(out, 0.5, (b) => burst(b, sr, rng, { dur: 0.12, tau: 0.03, lp: 900, color: 'brown' }));
  return out;
}

// ---------------------------------------------------------------------------
// the totem

/** vanilla item.totem.use: a bright magical swell — a rising chord of chimes over a rush of air */
function totemUse(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(2.2, sr);
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  layer(out, 1, (b) => {
    notes.forEach((f, i) => impact(b, sr, rng, { t: 0.05 + i * 0.07, modes: [f, 1, 0.9, f * 2.01, 0.4, 0.5, f * 3.02, 0.15, 0.3], jitter: 0.002 }));
  });
  layer(out, 0.5, (b) => sweep(b, sr, rng, { dur: 1.6, f: (t) => 1200 + 3000 * smooth(t / 1.2), q: 1.5, amp: (t) => envPts(t / 1.6, [0, 0, 0.3, 1, 1, 0]), color: 'pink' }));
  return reverbHalf(out, sr, { t60: 1.6, wet: 0.35, dry: 1 }).subarray(0, Math.round(3 * sr));
}

export function illagerSounds(): Record<string, SoundGen> {
  return {
    'item.shield.block': sound('item.shield.block', 5, shieldBlock),
    'entity.pillager.ambient': sound('entity.pillager.ambient', 4, illagerAmbient(PILLAGER)),
    'entity.pillager.hurt': sound('entity.pillager.hurt', 3, illagerHurt(PILLAGER)),
    'entity.pillager.death': sound('entity.pillager.death', 2, illagerDeath(PILLAGER)),
    'entity.pillager.celebrate': sound('entity.pillager.celebrate', 4, illagerCelebrate(PILLAGER)),
    'entity.vindicator.ambient': sound('entity.vindicator.ambient', 5, illagerAmbient(VINDICATOR)),
    'entity.vindicator.hurt': sound('entity.vindicator.hurt', 2, illagerHurt(VINDICATOR)),
    'entity.vindicator.death': sound('entity.vindicator.death', 2, illagerDeath(VINDICATOR)),
    'entity.vindicator.celebrate': sound('entity.vindicator.celebrate', 3, illagerCelebrate(VINDICATOR)),
    'entity.evoker.ambient': sound('entity.evoker.ambient', 4, illagerAmbient(EVOKER)),
    'entity.evoker.hurt': sound('entity.evoker.hurt', 2, illagerHurt(EVOKER)),
    'entity.evoker.death': sound('entity.evoker.death', 2, illagerDeath(EVOKER)),
    'entity.evoker.celebrate': sound('entity.evoker.celebrate', 2, illagerCelebrate(EVOKER)),
    'entity.evoker.prepare_attack': sound('entity.evoker.prepare_attack', 2, prepareAttack),
    'entity.evoker.prepare_summon': sound('entity.evoker.prepare_summon', 1, prepareSummon),
    'entity.evoker.prepare_wololo': sound('entity.evoker.prepare_wololo', 1, prepareWololo),
    'entity.evoker.cast_spell': sound('entity.evoker.cast_spell', 2, castSpell),
    'entity.evoker_fangs.attack': sound('entity.evoker_fangs.attack', 2, fangsAttack),
    'entity.vex.ambient': sound('entity.vex.ambient', 4, vexAmbient),
    'entity.vex.charge': sound('entity.vex.charge', 3, vexCharge),
    'entity.vex.hurt': sound('entity.vex.hurt', 2, vexHurt),
    'entity.vex.death': sound('entity.vex.death', 2, vexDeath),
    'entity.ravager.ambient': sound('entity.ravager.ambient', 7, ravagerAmbient),
    'entity.ravager.roar': sound('entity.ravager.roar', 1, ravagerRoar),
    'entity.ravager.stunned': sound('entity.ravager.stunned', 3, ravagerStunned),
    'entity.ravager.attack': sound('entity.ravager.attack', 3, ravagerAttack),
    'entity.ravager.hurt': sound('entity.ravager.hurt', 4, ravagerHurt),
    'entity.ravager.death': sound('entity.ravager.death', 3, ravagerDeath),
    'entity.ravager.step': sound('entity.ravager.step', 5, ravagerStep),
    'entity.ravager.celebrate': sound('entity.ravager.celebrate', 2, ravagerAmbient),
    'item.totem.use': sound('item.totem.use', 1, totemUse),
  };
}
