// Polar bears (vanilla entity.polar_bear.*). A grown bear huffs and grunts, low and breathy, through a big chest; a
// cub's call is a thin, nasal bleat. Hurt, it barks out a short roar; dying, a long groan sagging away. Its warning,
// reared up to strike, is a deep, open-mouthed roar that swells and rattles. Its paws fall heavily and softly.
// Takes: ambient 4, ambient_baby 4, hurt 4, death 3, step 4, warning 3.

import type { SoundGen } from '../synth';
import { alloc, envBump, highpass, lowpass, smooth } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, thump } from './texture';
import { voice } from './voice';

/**
 * a bear's voice into `out` at `t0`: pitch `f` swelling by `rise` and sagging by `fall`; `open` (0-1) opens the
 * mouth from a closed grunt to a roar, `growl` rattles it, `breath` blows through it
 */
function bearInto(out: Float32Array, c: Ctx, t0: number, d: number, f: number, o: { rise?: number; fall?: number; open?: number; growl?: number; breath?: number; rough?: number; gain?: number }): void {
  const { sr, rng } = c;
  const rise = o.rise ?? 0.1, fall = o.fall ?? 0.15, open = o.open ?? 0.3;
  voice(out, sr, rng, {
    t: t0,
    dur: d,
    f0: (t) => {
      const x = t / d;
      return f * (1 + rise * smooth(x / 0.35) - (rise + fall) * smooth((x - 0.5) / 0.5));
    },
    amp: (t) => envBump(t, d * 0.15, d * 0.85),
    formants: [
      { f: (t) => 320 + 260 * open * Math.sin(Math.PI * Math.min(1, t / d)), bw: 140, g: 1 },
      { f: (t) => 820 + 420 * open * Math.sin(Math.PI * Math.min(1, t / d)), bw: 220, g: 0.3 + 0.4 * open },
      { f: 2100, bw: 420, g: 0.08 + 0.2 * open },
    ],
    oq: 0.62 - 0.2 * open,
    jitter: 0.03,
    shimmer: 0.12,
    rough: o.rough ?? 0.3,
    sub: 0.1,
    growl: o.growl ? [rng.range(18, 26), o.growl] : undefined,
    breath: o.breath ?? 0.25,
    gain: o.gain ?? 1,
  });
}

/** vanilla entity.polar_bear.ambient: a huff or two, and a low grunt */
function bearAmbient(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(1.2, sr);
  let t = 0.01;
  for (let i = 0, n = 1 + rng.int(2); i < n; i++) {
    const d = rng.range(0.28, 0.45);
    bearInto(out, c, t, d, rng.range(85, 110), { open: 0.15, breath: 0.55, growl: rng.range(0.2, 0.4) });
    t += d + rng.range(0.08, 0.16);
  }
  bearInto(out, c, t, rng.range(0.35, 0.5), rng.range(95, 120), { open: 0.35, growl: 0.35, rough: 0.4 });
  highpass(out, 45, sr);
  lowpass(out, 3200, sr);
  return out;
}

/** vanilla entity.polar_bear.ambient_baby: a cub's thin, nasal bleat */
function bearBaby(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const d = rng.range(0.3, 0.5);
  const out = alloc(d + 0.1, sr);
  bearInto(out, c, 0.01, d, rng.range(260, 340), { rise: 0.15, fall: 0.25, open: 0.55, breath: 0.2, rough: 0.2, growl: 0.15 });
  highpass(out, 120, sr);
  return out;
}

/** vanilla entity.polar_bear.hurt: a short roar barked out */
function bearHurt(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const d = rng.range(0.28, 0.38);
  const out = alloc(d + 0.1, sr);
  bearInto(out, c, 0.005, d, rng.range(160, 200), { rise: 0.25, fall: 0.35, open: 0.9, growl: 0.5, rough: 0.55, breath: 0.3, gain: 1.2 });
  highpass(out, 60, sr);
  return out;
}

/** vanilla entity.polar_bear.death: a long groan sagging away */
function bearDeath(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const d = rng.range(1.0, 1.3);
  const out = alloc(d + 0.2, sr);
  bearInto(out, c, 0.01, d, rng.range(140, 170), { rise: 0.1, fall: 0.5, open: 0.7, growl: 0.55, rough: 0.5, breath: 0.35, gain: 1.1 });
  highpass(out, 45, sr);
  return out;
}

/** vanilla entity.polar_bear.warning: reared up, a deep roar that swells and rattles */
function bearWarning(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const d = rng.range(1.0, 1.3);
  const out = alloc(d + 0.2, sr);
  bearInto(out, c, 0.01, d, rng.range(95, 120), { rise: 0.3, fall: 0.25, open: 1, growl: 0.75, rough: 0.65, breath: 0.45, gain: 1.3 });
  highpass(out, 40, sr);
  return out;
}

/** vanilla entity.polar_bear.step: a heavy, soft pad of a paw */
function bearStep(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.25, sr);
  thump(out, sr, { f0: rng.range(80, 105), f1: rng.range(55, 70), glide: 0.04, tau: 0.03, amp: 0.9 });
  burst(out, sr, rng, { t: 0.005, dur: 0.12, tau: 0.035, lp: 1400, amp: 0.35, color: 'brown' });
  return out;
}

export function polarBearSounds(): Record<string, SoundGen> {
  return {
    'entity.polar_bear.ambient': sound('entity.polar_bear.ambient', 4, bearAmbient),
    'entity.polar_bear.ambient_baby': sound('entity.polar_bear.ambient_baby', 4, bearBaby),
    'entity.polar_bear.hurt': sound('entity.polar_bear.hurt', 4, bearHurt),
    'entity.polar_bear.death': sound('entity.polar_bear.death', 3, bearDeath),
    'entity.polar_bear.warning': sound('entity.polar_bear.warning', 3, bearWarning),
    'entity.polar_bear.step': sound('entity.polar_bear.step', 4, bearStep),
  };
}
