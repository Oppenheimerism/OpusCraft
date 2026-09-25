// Parrots (vanilla entity.parrot.*). Its own voice is a macaw's: a harsh squawk, a whistle sliding up, a chatter of
// short squawks, a chirp; hurt, a shriek; dying, a squawk that breaks and falls away. It cracks seeds with a few sharp
// pecks, its wings whirr as it flies, its feet tap. And the mobs it mimics (vanilla entity.parrot.imitate.*): each
// one's own call played at 1.8 times the pitch, as sounds.json has them; a mob with no call here gets the parrot's
// own. Takes: ambient 6, hurt 2, death 2, eat 5, fly 4, step 5.

import type { SoundGen } from '../synth';
import { TAU, alloc, envBump, highpass, lowpass, smooth } from './dsp';
import { type Ctx, pitched, sound } from './registry';
import { burst, ticks } from './texture';
import { voice } from './voice';

/**
 * a squawk into `out` at `t0`: pressed, rough and bright, the pitch leaping up from `f` by `rise` and then dropping
 * `fall` below it; `open` swells the beak's resonance through the middle
 */
function squawkInto(out: Float32Array, c: Ctx, t0: number, d: number, f: number, o: { rise?: number; fall?: number; rough?: number; open?: number; gain?: number } = {}): void {
  const { sr, rng } = c;
  const rise = o.rise ?? 0.25, fall = o.fall ?? 0.2, open = o.open ?? 0.7;
  voice(out, sr, rng, {
    t: t0,
    dur: d,
    f0: (t) => {
      const x = t / d;
      return f * (1 + rise * smooth(x / 0.3) - (rise + fall) * smooth((x - 0.45) / 0.55));
    },
    amp: (t) => envBump(t, d * 0.12, d * 0.88),
    formants: [
      { f: (t) => 1300 + 700 * open * Math.sin(Math.PI * Math.min(1, t / d)), bw: 280, g: 1 },
      { f: 2600, bw: 400, g: 0.7 },
      { f: 3900, bw: 560, g: 0.35 },
    ],
    oq: 0.35,
    jitter: 0.03,
    shimmer: 0.12,
    rough: o.rough ?? 0.35,
    sub: 0.12,
    breath: 0.12,
    gain: o.gain ?? 1,
  });
}

/** a whistle into `out` at `t0`: a clear tone sliding from `f0` to `f1` with the slightest warble */
function whistleInto(out: Float32Array, sr: number, t0: number, d: number, f0: number, f1: number, gain = 0.5): void {
  const s = Math.round(t0 * sr), n = Math.min(out.length - s, Math.round(d * sr));
  const a = Math.min(0.03, d * 0.2);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = f0 + (f1 - f0) * smooth(t / d) + f0 * 0.012 * Math.sin(TAU * 7 * t);
    ph += (TAU * f) / sr;
    out[s + i] += (Math.sin(ph) + 0.12 * Math.sin(2 * ph)) * envBump(t, a, d - a) * gain;
  }
}

/** vanilla entity.parrot.ambient: a squawk; a whistle up; chatter; a squawk and a chirp; a two-note whistle; a squawk up */
function parrotAmbient(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(1.1, sr);
  switch (c.v) {
    case 0:
      squawkInto(out, c, 0.01, rng.range(0.28, 0.36), rng.range(720, 820));
      break;
    case 1:
      whistleInto(out, sr, 0.01, rng.range(0.3, 0.4), rng.range(1500, 1700), rng.range(2600, 2900));
      break;
    case 2: {
      let t = 0.01;
      for (let i = 0, n = 3 + rng.int(3); i < n; i++) {
        const d = rng.range(0.06, 0.1);
        squawkInto(out, c, t, d, rng.range(850, 1150), { rise: 0.15, fall: 0.1, rough: 0.25, gain: 0.8 });
        t += d + rng.range(0.02, 0.05);
      }
      break;
    }
    case 3:
      squawkInto(out, c, 0.01, 0.22, rng.range(760, 860), { fall: 0.3 });
      whistleInto(out, sr, 0.3, 0.09, 2400, 3100, 0.4);
      break;
    case 4:
      whistleInto(out, sr, 0.01, 0.16, 1800, 2600);
      whistleInto(out, sr, 0.24, 0.3, 2500, 1500);
      break;
    default:
      squawkInto(out, c, 0.01, rng.range(0.3, 0.38), rng.range(650, 740), { rise: 0.45, fall: 0 });
  }
  highpass(out, 400, sr);
  return out;
}

/** vanilla entity.parrot.hurt: a sharp shriek */
function parrotHurt(c: Ctx): Float32Array {
  const { rng } = c;
  const out = alloc(0.35, c.sr);
  squawkInto(out, c, 0.005, rng.range(0.18, 0.24), rng.range(1000, 1150), { rise: 0.3, fall: 0.25, rough: 0.55, open: 1, gain: 1.2 });
  highpass(out, 500, c.sr);
  return out;
}

/** vanilla entity.parrot.death: a squawk breaking, then a weak one falling away */
function parrotDeath(c: Ctx): Float32Array {
  const { rng } = c;
  const out = alloc(0.95, c.sr);
  squawkInto(out, c, 0.01, 0.3, rng.range(900, 1000), { rise: 0.2, fall: 0.35, rough: 0.6, open: 1, gain: 1.1 });
  squawkInto(out, c, 0.38, 0.42, rng.range(620, 700), { rise: 0.05, fall: 0.5, rough: 0.5, gain: 0.6 });
  highpass(out, 350, c.sr);
  return out;
}

/** vanilla entity.parrot.eat: a few sharp pecks, the husk cracking */
function parrotEat(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.4, sr);
  let t = 0.005;
  for (let i = 0, n = 2 + rng.int(3); i < n; i++) {
    burst(out, sr, rng, { t, dur: 0.03, tau: 0.006, hp: 2500, amp: 0.8 });
    ticks(out, sr, rng, { t, dur: 0.025, rate: 300, energy: () => 1, f: [2500, 5000], t60: [0.01, 0.03], amp: 0.5 });
    t += rng.range(0.06, 0.1);
  }
  return out;
}

/** vanilla entity.parrot.fly: a whirr of quick wingbeats */
function parrotFly(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const d = rng.range(0.3, 0.45);
  const out = alloc(d + 0.05, sr);
  const rate = rng.range(13, 17);
  burst(out, sr, rng, {
    dur: d,
    attack: 0.02,
    tau: d,
    bp: [rng.range(900, 1300), 0.9],
    env: (t) => (0.35 + 0.65 * Math.max(0, Math.sin(TAU * rate * t)) ** 2) * envBump(t, 0.03, d - 0.03),
  });
  lowpass(out, 3000, sr);
  return out;
}

/** vanilla entity.parrot.step: a tiny tap of claws */
function parrotStep(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.08, sr);
  burst(out, sr, rng, { dur: 0.03, tau: 0.004, bp: [rng.range(3000, 4200), 1.5] });
  ticks(out, sr, rng, { dur: 0.02, rate: 150, energy: () => 1, f: [1800, 3200], t60: [0.01, 0.02], amp: 0.4 });
  return out;
}

/**
 * the mob behind each vanilla entity.parrot.imitate.* (its ambient call unless named here: the creeper's hiss, the
 * dragon's growl, the slimes' squish, the guardian's call on land, the breeze's idling)
 */
const IMITATED: Record<string, string> = {
  creeper: 'entity.creeper.primed', ender_dragon: 'entity.ender_dragon.growl', magma_cube: 'entity.magma_cube.squish',
  slime: 'entity.slime.squish', guardian: 'entity.guardian.ambient_land', breeze: 'entity.breeze.idle_ground',
};
const MIMICS = [
  'blaze', 'bogged', 'breeze', 'creeper', 'drowned', 'elder_guardian', 'ender_dragon', 'endermite', 'evoker', 'ghast',
  'guardian', 'hoglin', 'husk', 'illusioner', 'magma_cube', 'phantom', 'piglin', 'piglin_brute', 'pillager', 'ravager',
  'shulker', 'silverfish', 'skeleton', 'slime', 'spider', 'stray', 'vex', 'vindicator', 'warden', 'witch', 'wither',
  'wither_skeleton', 'zoglin', 'zombie', 'zombie_villager',
];

export function parrotSounds(base: Record<string, SoundGen>): Record<string, SoundGen> {
  const own: Record<string, SoundGen> = {
    'entity.parrot.ambient': sound('entity.parrot.ambient', 6, parrotAmbient),
    'entity.parrot.hurt': sound('entity.parrot.hurt', 2, parrotHurt),
    'entity.parrot.death': sound('entity.parrot.death', 2, parrotDeath),
    'entity.parrot.eat': sound('entity.parrot.eat', 5, parrotEat),
    'entity.parrot.fly': sound('entity.parrot.fly', 4, parrotFly),
    'entity.parrot.step': sound('entity.parrot.step', 5, parrotStep),
  };
  for (const k of MIMICS) {
    const src = base[IMITATED[k] ?? `entity.${k}.ambient`] ?? (k === 'guardian' ? base['entity.guardian.ambient'] : undefined);
    own[`entity.parrot.imitate.${k}`] = src ? pitched(src, 1.8) : own['entity.parrot.ambient'];
  }
  return own;
}
