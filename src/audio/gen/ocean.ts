// The ocean's sounds (Stage 5: ocean), synthesized: a sponge soaking up the water round it, and a wet sponge set
// down in the Nether hissing dry; the guardians' eerie squeals (muffled and ringing in the water, thin and dry on
// land), their hurt squeaks and dying wails, a stranded one's wet flops, the laser's buzz rising as it charges, and
// the elder guardian's curse: a ghostly chorus rising into a howl.

import type { SoundGen } from '../synth';
import { addOsc, alloc, envBump, envPts, layer, onePoleLP } from './dsp';
import { type Ctx, sound } from './registry';
import { bubble, impact, sweep } from './texture';
import { reverbHalf } from './world';

/** vanilla block.sponge.absorb: a gulping slurp — water rushing in, bubbles popping as it goes */
function spongeAbsorb(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const dur = 0.9;
  const out = alloc(dur, sr);
  layer(out, 0.9, (b) => sweep(b, sr, rng, { t: 0, dur: 0.75, f: (t) => 500 + 1400 * Math.pow(t / 0.75, 0.6), q: 2.2, amp: (t) => envPts(t / 0.75, [0, 0, 0.1, 1, 0.55, 0.7, 1, 0]), color: 'pink' }));
  layer(out, 0.7, (b) => {
    for (let i = 0; i < 9; i++) bubble(b, sr, rng.range(0.03, 0.65), rng.range(380, 1100), rng.range(0.3, 0.8), rng.range(0.02, 0.05), rng.range(0.2, 0.6));
  });
  return reverbHalf(out, sr, { t60: 0.5, wet: 0.2, dry: 1 });
}

/** vanilla block.wet_sponge.dries: a steamy hiss, fading as it dries out */
function wetSpongeDries(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const dur = 1.6;
  const out = alloc(dur, sr);
  layer(out, 1, (b) => sweep(b, sr, rng, { t: 0, dur, f: (t) => 5200 - 1600 * (t / dur), q: 0.8, mode: 'hp', amp: (t) => envPts(t / dur, [0, 0, 0.05, 1, 0.4, 0.55, 1, 0]), color: 'white' }));
  layer(out, 0.35, (b) => {
    for (let i = 0; i < 6; i++) bubble(b, sr, rng.range(0.02, 0.5), rng.range(900, 2200), rng.range(0.2, 0.5), 0.02, 0.4);
  });
  return out;
}

// ---------------------------------------------------------------------------
// guardians

/** a guardian's throat: the elder's is lower, slower, and its water deeper */
interface GuardianThroat {
  pitch: number;
  slow: number;
  /** the water's muffling (low-pass Hz) */
  muffle: number;
  room: number;
}
const GUARDIAN: GuardianThroat = { pitch: 1, slow: 1, muffle: 2200, room: 1.1 };
const ELDER: GuardianThroat = { pitch: 0.5, slow: 1.5, muffle: 1300, room: 1.9 };

/** a squealing tone (a few harmonics) gliding along `f`, a warble on it */
function squeal(b: Float32Array, sr: number, t0: number, dur: number, f: (t: number) => number, amp: (t: number) => number, warble = 0.02, harm: readonly number[] = [1, 0.4, 0.18, 0.08]): void {
  harm.forEach((h, i) => addOsc(b, sr, t0, dur, (t) => f(t) * (i + 1) * (1 + warble * Math.sin(t * 2 * Math.PI * 7)), (t) => amp(t) * h));
}

/** vanilla entity.guardian.ambient / ambient_land: two or three creaking squeals, bent up or down */
function guardianIdle(th: GuardianThroat, land: boolean) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const dur = 1.3 * th.slow;
    const out = alloc(dur + (land ? 0.2 : 0.8), sr);
    const n = 2 + rng.int(2);
    layer(out, 0.9, (b) => {
      let t = rng.range(0, 0.05);
      for (let i = 0; i < n && t < dur - 0.2; i++) {
        const d = rng.range(0.18, 0.4) * th.slow;
        const f0 = rng.range(620, 1050) * th.pitch * (land ? 1.35 : 1), bend = rng.range(-0.35, 0.45);
        squeal(b, sr, t, d, (x) => f0 * (1 + bend * Math.sin((Math.PI * x) / d)), (x) => envBump(x, 0.03, d - 0.03), land ? 0.03 : 0.015);
        if (land) sweep(b, sr, rng, { t, dur: d, f: () => f0 * 2.2, q: 3, amp: (x) => 0.25 * envBump(x, 0.02, d - 0.02), color: 'white' });
        t += d + rng.range(0.04, 0.2) * th.slow;
      }
    });
    if (!land) onePoleLP(out, th.muffle, sr);
    return land ? out : reverbHalf(out, sr, { t60: th.room, wet: 0.35, dry: 1 });
  };
}

/** vanilla entity.guardian.hurt / hurt_land: a sharp squeak up and down, with a squelch */
function guardianHurt(th: GuardianThroat, land: boolean) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const d = 0.28 * th.slow;
    const out = alloc(d + (land ? 0.1 : 0.6), sr);
    const f0 = rng.range(900, 1250) * th.pitch * (land ? 1.25 : 1);
    layer(out, 1, (b) => {
      squeal(b, sr, 0, d, (x) => f0 * (1 + 0.5 * Math.sin((Math.PI * x) / d)), (x) => envBump(x, 0.01, d - 0.01), 0.04);
      sweep(b, sr, rng, { t: 0, dur: d * 0.7, f: (x) => 1400 * th.pitch + 1800 * th.pitch * x, q: 2, amp: (x) => 0.35 * envPts(x / (d * 0.7), [0, 1, 1, 0]), color: 'pink' });
    });
    if (!land) onePoleLP(out, th.muffle * 1.2, sr);
    return land ? out : reverbHalf(out, sr, { t60: th.room * 0.8, wet: 0.3, dry: 1 });
  };
}

/** vanilla entity.guardian.death / death_land: a long wail sinking away, trembling as it goes */
function guardianDeath(th: GuardianThroat, land: boolean) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const d = 1.5 * th.slow;
    const out = alloc(d + (land ? 0.2 : 1), sr);
    const f0 = rng.range(950, 1100) * th.pitch * (land ? 1.2 : 1);
    layer(out, 1, (b) => {
      const trem = (x: number) => 1 - 0.45 * (x / d) * (0.5 + 0.5 * Math.sin(x * 2 * Math.PI * 9));
      squeal(b, sr, 0, d, (x) => f0 * (1.1 - 0.7 * Math.pow(x / d, 0.8)), (x) => envPts(x / d, [0, 0, 0.06, 1, 0.5, 0.75, 1, 0]) * trem(x), 0.03);
      if (land) sweep(b, sr, rng, { t: 0, dur: d, f: (x) => f0 * (2.2 - 1.4 * (x / d)), q: 2.5, amp: (x) => 0.2 * envPts(x / d, [0, 0, 0.1, 1, 1, 0]), color: 'white' });
    });
    if (!land) onePoleLP(out, th.muffle, sr);
    return land ? out : reverbHalf(out, sr, { t60: th.room * 1.3, wet: 0.4, dry: 1 });
  };
}

/** vanilla entity.guardian.flop: a stranded guardian slapping down on the ground, wet */
function guardianFlop(th: GuardianThroat) {
  return (c: Ctx): Float32Array => {
    const { sr, rng } = c;
    const out = alloc(0.4, sr);
    layer(out, 1, (b) => {
      impact(b, sr, rng, { modes: [150 * th.pitch, 1, 0.12, 330 * th.pitch, 0.5, 0.07, 720 * th.pitch, 0.25, 0.04], jitter: 0.1, noise: 1.2, noiseTau: 0.01, noiseBp: [900 * th.pitch, 0.8] });
      sweep(b, sr, rng, { t: 0.005, dur: 0.22, f: (x) => 2400 - 3000 * x, q: 1.5, amp: (x) => 0.5 * envBump(x, 0.004, 0.2), color: 'white' });
      for (let i = 0; i < 4; i++) bubble(b, sr, rng.range(0.02, 0.2), rng.range(500, 1200) * th.pitch, rng.range(0.1, 0.3), 0.02, 0.3);
    });
    return out;
  };
}

/**
 * vanilla entity.guardian.attack (attack_loop, the client's GuardianAttackSoundInstance): the laser's buzz over its
 * four-second charge, swelling (the charge squared) and rising (0.7 to 1.2 times its pitch) as it goes. Played at
 * 80 / the charge's length in ticks: the elder's three-second charge plays it faster.
 */
function guardianAttack(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const dur = 4;
  const out = alloc(dur + 0.1, sr);
  const f0 = 150;
  const pitch = (t: number) => 0.7 + 0.5 * Math.min(1, t / dur);
  const vol = (t: number) => Math.min(1, t / dur) ** 2 * envPts(t / dur, [0, 1, 0.97, 1, 1, 0]);
  layer(out, 0.9, (b) => {
    // (a buzzing saw of harmonics)
    [1, 0.55, 0.38, 0.28, 0.2, 0.14, 0.1].forEach((h, i) => addOsc(b, sr, 0, dur, (t) => f0 * pitch(t) * (i + 1) * (1 + 0.004 * Math.sin(t * 2 * Math.PI * 31)), (t) => vol(t) * h));
    // a thin whine above it, trembling
    addOsc(b, sr, 0, dur, (t) => f0 * 9 * pitch(t), (t) => 0.25 * vol(t) * (0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 23)));
    sweep(b, sr, rng, { t: 0, dur, f: (t) => 1800 * pitch(t), q: 4, amp: (t) => 0.2 * vol(t), color: 'white' });
  });
  return out;
}

/**
 * vanilla entity.elder_guardian.curse: a ghostly chorus rising from a moan into a howl, a rush of breath behind
 * it, ringing on and on
 */
function elderCurse(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const dur = 2.6;
  const out = alloc(dur + 1.6, sr);
  const env = (t: number) => envPts(t / dur, [0, 0, 0.12, 0.7, 0.55, 1, 0.8, 0.9, 1, 0]);
  layer(out, 1, (b) => {
    for (const [det, g] of [[1, 1], [1.012, 0.7], [0.991, 0.7], [1.5, 0.35], [2.003, 0.25]] as const) {
      addOsc(b, sr, 0, dur, (t) => 250 * det * (1 + 2.1 * Math.pow(t / dur, 1.6)) * (1 + (0.01 + 0.03 * (t / dur)) * Math.sin(t * 2 * Math.PI * 6)), (t) => g * env(t));
    }
    sweep(b, sr, rng, { t: 0, dur, f: (t) => 500 + 2600 * (t / dur), q: 1.2, amp: (t) => 0.55 * env(t), color: 'pink' });
  });
  return reverbHalf(out, sr, { t60: 2.6, wet: 0.5, dry: 1 });
}

export function oceanSounds(): Record<string, SoundGen> {
  const s: Record<string, SoundGen> = {
    'block.sponge.absorb': sound('block.sponge.absorb', 3, spongeAbsorb),
    'block.wet_sponge.dries': sound('block.wet_sponge.dries', 2, wetSpongeDries),
    'entity.guardian.attack': sound('entity.guardian.attack', 1, guardianAttack),
    'entity.elder_guardian.curse': sound('entity.elder_guardian.curse', 1, elderCurse),
  };
  for (const [who, th] of [['guardian', GUARDIAN], ['elder_guardian', ELDER]] as const) {
    const n = `entity.${who}.`;
    s[n + 'ambient'] = sound(n + 'ambient', 4, guardianIdle(th, false));
    s[n + 'ambient_land'] = sound(n + 'ambient_land', who === 'guardian' ? 4 : 2, guardianIdle(th, true));
    s[n + 'hurt'] = sound(n + 'hurt', 4, guardianHurt(th, false));
    s[n + 'hurt_land'] = sound(n + 'hurt_land', 4, guardianHurt(th, true));
    s[n + 'death'] = sound(n + 'death', 1, guardianDeath(th, false));
    s[n + 'death_land'] = sound(n + 'death_land', 1, guardianDeath(th, true));
    s[n + 'flop'] = sound(n + 'flop', 4, guardianFlop(th));
  }
  return s;
}
