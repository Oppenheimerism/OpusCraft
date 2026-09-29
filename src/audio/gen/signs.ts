// (signs) The signs' own sounds: the hanging signs' (vanilla SoundType.HANGING_SIGN and its nether, bamboo and cherry
// kin: a board of wood that knocks and a little rattle of the chains it hangs on), a waxed sign's dull knock when it
// won't open (block.sign.waxed_interact_fail), and an ink sac and a glow ink sac squeezed onto a sign's text
// (item.ink_sac.use, item.glow_ink_sac.use). A standing or wall sign sounds as its wood does.

import type { SoundGen } from '../synth';
import { alloc, finish, lowpass, mixInto, resample, envAD, envBump, addOsc } from './dsp';
import { type Ctx, sound, FX_PEAK } from './registry';
import { bubble, impact, sweep, thump } from './texture';

/** `parts` (a sound, its gain, its playback rate) played together, a take of each for each take */
function together(variants: number, parts: [SoundGen | undefined, number, number][]): SoundGen {
  return {
    variants,
    generate(variant: number, sr: number): Float32Array {
      const takes = parts.filter((p): p is [SoundGen, number, number] => !!p[0]).map(([g, gain, rate]) => [resample(g.generate(variant % g.variants, sr), rate), gain] as const);
      const out = new Float32Array(Math.max(1, ...takes.map(([t]) => t.length)));
      for (const [t, gain] of takes) mixInto(out, t, 0, gain);
      return finish(out, sr, FX_PEAK);
    },
  };
}

/** a waxed sign knocked: a short, dull, damped wooden tok */
function waxedKnock(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.18, sr);
  const f = rng.range(210, 260);
  impact(out, sr, rng, {
    modes: [f, 1, 0.035, f * 2.2, 0.55, 0.022, f * 3.6, 0.25, 0.014],
    jitter: 0.02,
    noise: 0.5,
    noiseTau: 0.002,
    noiseBp: [900, 0.8],
  });
  thump(out, sr, { f0: 150, f1: 100, glide: 0.02, tau: 0.018 });
  lowpass(out, 2200, sr);
  return out;
}

/** an ink sac squeezed: a wet squelch sliding down, with a bubble or two */
function inkSquelch(c: Ctx, glow: boolean): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.16, 0.22);
  const out = alloc(d + 0.12, sr);
  const f0 = rng.range(900, 1200);
  sweep(out, sr, rng, { dur: d, f: (t) => f0 * Math.pow(0.35, t / d), q: 3, amp: (t) => envBump(t, d * 0.15, d * 0.85) });
  for (let i = 0; i < 2; i++) bubble(out, sr, rng.range(0.01, d * 0.7), rng.range(300, 650), 0.6, undefined, 0.4);
  if (glow) {
    // (the glow ink's shimmer: a soft rising chime over the squelch)
    const f = rng.range(1500, 1900);
    addOsc(out, sr, 0.03, d + 0.06, (t) => f * (1 + 0.5 * Math.min(1, t / 0.12)), (t) => 0.18 * envAD(t, 0.02, 0.07));
  }
  lowpass(out, glow ? 5000 : 3200, sr);
  return out;
}

export function signSounds(S: Record<string, SoundGen>): Record<string, SoundGen> {
  const out: Record<string, SoundGen> = {};
  // (each wood's board, a chain's rattle under it)
  const kinds: [string, string, number][] = [['hanging_sign', 'wood', 1], ['nether_wood_hanging_sign', 'nether_wood', 1], ['bamboo_wood_hanging_sign', 'wood', 1.18], ['cherry_wood_hanging_sign', 'wood', 1.08]];
  for (const [kind, wood, rate] of kinds) {
    for (const [ev, chainGain] of [['break', 0.45], ['place', 0.45], ['step', 0.3], ['hit', 0.3]] as const) {
      const board = S[`block.${wood}.${ev}`] ?? S[`block.wood.${ev}`];
      out[`block.${kind}.${ev}`] = together(4, [[board, 1, rate], [S[`block.chain.${ev}`], chainGain, 1.05]]);
    }
    out[`block.${kind}.fall`] = out[`block.${kind}.step`];
  }
  out['block.sign.waxed_interact_fail'] = sound('block.sign.waxed_interact_fail', 3, waxedKnock);
  out['item.ink_sac.use'] = sound('item.ink_sac.use', 3, (c) => inkSquelch(c, false));
  out['item.glow_ink_sac.use'] = sound('item.glow_ink_sac.use', 3, (c) => inkSquelch(c, true));
  return out;
}
