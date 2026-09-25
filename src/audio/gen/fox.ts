// Foxes (vanilla entity.fox.*). A fox yips and whines to itself, soft and high; at night, with no one about, one may
// scream, a long, hoarse, eerie shriek that carries. Defending someone it chatters angrily, a harsh stuttering gekker,
// and its bite is a snap of the jaws. Hurt, it yelps; dying, it cries out and whimpers away. Asleep it breathes slow and
// snuffling; after berries it sniffs about; it munches what it eats and spits out what it doesn't want. A chorus fruit
// whisks it off with a startled yip.
// Takes: ambient 4, aggro 4, bite 3, death 2, eat 3, hurt 4, screech 4, sleep 4, sniff 4, spit 3, teleport 3.

import type { SoundGen } from '../synth';
import { TAU, addOsc, alloc, envAD, envBump, highpass, layer, lowpass, smooth } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, sweep, thump } from './texture';
import { voice } from './voice';

/** a yip into `b` at `t0`: short and high through the nose, jumping up and dropping away by `drop` */
function yipInto(b: Float32Array, c: Ctx, t0: number, d: number, f: number, o: { rough?: number; breath?: number; drop?: number } = {}): void {
  const drop = o.drop ?? 0.45;
  voice(b, c.sr, c.rng, {
    t: t0,
    dur: d,
    f0: (t) => f * (t < d * 0.25 ? 0.85 + (0.3 * t) / (d * 0.25) : 1.15 - drop * smooth((t - d * 0.25) / (d * 0.75))),
    amp: (t) => envAD(t, 0.006, d * 0.45),
    formants: [
      { f: 1150, bw: 220, g: 1 },
      { f: 2500, bw: 350, g: 0.75 },
      { f: 3800, bw: 500, g: 0.3 },
    ],
    oq: 0.45,
    jitter: 0.02,
    shimmer: 0.08,
    rough: o.rough ?? 0.2,
    breath: o.breath ?? 0.2,
  });
}

/** a whine into `b` at `t0`: thin and nasal, rising and sinking again */
function whineInto(b: Float32Array, c: Ctx, t0: number, d: number, f: number): void {
  voice(b, c.sr, c.rng, {
    t: t0,
    dur: d,
    f0: (t) => {
      const x = t / d;
      return f * (x < 0.35 ? 1 + 0.25 * smooth(x / 0.35) : 1.25 - 0.4 * smooth((x - 0.35) / 0.65));
    },
    amp: (t) => envBump(t, d * 0.2, d * 0.8),
    formants: [
      { f: 900, bw: 150, g: 0.5 },
      { f: 2400, bw: 250, g: 1 },
      { f: 3600, bw: 400, g: 0.3 },
    ],
    oq: 0.65,
    jitter: 0.012,
    shimmer: 0.05,
    rough: 0.06,
    breath: 0.15,
    vib: [7.5, 0.02],
  });
}

/** a sniff into `b` at `t0`: a quick puff of air in through the nose */
function sniffInto(b: Float32Array, c: Ctx, t0: number, d: number): void {
  burst(b, c.sr, c.rng, { t: t0, dur: d, attack: d * 0.55, tau: d * 0.25, bp: [c.rng.range(2800, 4400), 1.3] });
}

/** vanilla entity.fox.ambient: yips to itself, two or three, or a soft whine, or a yip trailing off into one */
function ambient(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(1, sr);
  const f = rng.range(950, 1250);
  if (c.v === 1) {
    layer(out, 0.9, (b) => whineInto(b, c, 0.01, rng.range(0.45, 0.6), f * 0.8));
  } else if (c.v === 3) {
    const d = rng.range(0.09, 0.12);
    layer(out, 1, (b) => yipInto(b, c, 0.01, d, f));
    layer(out, 0.55, (b) => whineInto(b, c, d + 0.03, rng.range(0.3, 0.4), f * 0.85));
  } else {
    const n = c.v === 0 ? 2 : 3;
    layer(out, 1, (b) => {
      let t = 0.01;
      for (let i = 0; i < n; i++) {
        const d = rng.range(0.07, 0.11);
        yipInto(b, c, t, d, f * rng.range(0.92, 1.08));
        t += d + rng.range(0.07, 0.13);
      }
    });
  }
  highpass(out, 300, sr);
  return out;
}

/** vanilla entity.fox.aggro: the angry chatter of the gekker, a harsh stutter of rasping barks */
function aggro(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const d = rng.range(0.45, 0.7), rate = rng.range(15, 20);
  const n = Math.floor(d * rate);
  const out = alloc(d + 0.1, sr);
  const f = rng.range(560, 700);
  layer(out, 1, (b) => {
    for (let i = 0; i < n; i++) {
      const t0 = i / rate + rng.range(-0.004, 0.004);
      const pd = rng.range(0.035, 0.05);
      // (louder in the middle of the burst)
      const g = 0.6 + 0.4 * Math.sin((Math.PI * (i + 0.5)) / n);
      voice(b, sr, rng, {
        t: t0,
        dur: pd,
        f0: (t) => f * (1.1 - 0.25 * (t / pd)) * (1 + 0.15 * Math.sin(TAU * 0.37 * i)),
        amp: (t) => g * envAD(t, 0.003, pd * 0.5),
        formants: [
          { f: 950, bw: 200, g: 1 },
          { f: 2200, bw: 300, g: 0.7 },
          { f: 3400, bw: 450, g: 0.3 },
        ],
        oq: 0.35,
        jitter: 0.06,
        shimmer: 0.2,
        rough: 0.6,
        breath: 0.35,
      });
    }
  });
  layer(out, 0.35, (b) => {
    for (let i = 0; i < n; i++) burst(b, sr, rng, { t: i / rate, dur: 0.03, attack: 0.002, tau: 0.008, bp: [rng.range(1500, 2300), 1.2] });
  });
  highpass(out, 150, sr);
  return out;
}

/** vanilla entity.fox.bite: a snarl cut short by the snap of its jaws */
function bite(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const g = rng.range(0.06, 0.09);
  const out = alloc(g + 0.15, sr);
  layer(out, 0.45, (b) =>
    voice(b, sr, rng, {
      dur: g,
      f0: rng.range(300, 380),
      amp: (t) => envBump(t, g * 0.5, g * 0.5),
      formants: [
        { f: 800, bw: 200, g: 1 },
        { f: 2000, bw: 300, g: 0.5 },
      ],
      oq: 0.35,
      rough: 0.7,
      growl: [rng.range(30, 40), 0.6],
      breath: 0.4,
    }),
  );
  layer(out, 1, (b) => {
    burst(b, sr, rng, { t: g, dur: 0.025, attack: 0.0008, tau: 0.004, hp: 2500 });
    thump(b, sr, { t: g, f0: rng.range(420, 520), f1: 260, glide: 0.004, tau: 0.009, amp: 0.7 });
  });
  return out;
}

/** vanilla entity.fox.death: a sharp cry breaking into a whimper, falling and fading */
function death(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const d = rng.range(0.75, 0.95);
  const out = alloc(d + 0.12, sr);
  const f = rng.range(1050, 1200);
  voice(out, sr, rng, {
    dur: d,
    f0: (t) => {
      const x = t / d;
      return f * (1 - 0.55 * smooth(x)) * (1 + (x > 0.4 ? 0.06 * Math.sin(TAU * 10 * t) : 0));
    },
    amp: (t) => envAD(t, 0.008, d * 0.4) * (1 - 0.3 * smooth((t / d - 0.3) / 0.7)),
    formants: [
      { f: (t) => 1100 - 350 * (t / d), bw: 200, g: 1 },
      { f: 2400, bw: 300, g: 0.65 },
      { f: 3600, bw: 450, g: 0.25 },
    ],
    oq: 0.5,
    jitter: 0.05,
    shimmer: 0.15,
    rough: 0.35,
    breath: (t) => 0.15 + 0.35 * (t / d),
  });
  return out;
}

/** vanilla entity.fox.eat: a few crunching bites and a smack of the lips */
function eat(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const n = 3 + rng.int(2);
  const out = alloc(n * 0.13 + 0.15, sr);
  let t = 0.01;
  for (let i = 0; i < n; i++) {
    const t0 = t;
    layer(out, rng.range(0.7, 1), (b) => {
      burst(b, sr, rng, { t: t0, dur: 0.05, attack: 0.002, tau: 0.012, bp: [rng.range(2000, 3400), 0.9] });
      burst(b, sr, rng, { t: t0 + 0.012, dur: 0.035, attack: 0.001, tau: 0.007, hp: 3500 });
      thump(b, sr, { t: t0, f0: rng.range(180, 240), f1: 120, tau: 0.015, amp: 0.5 });
    });
    t += rng.range(0.09, 0.13);
  }
  layer(out, 0.3, (b) => burst(b, sr, rng, { t, dur: 0.05, attack: 0.004, tau: 0.012, lp: 1600, color: 'brown' }));
  return out;
}

/** vanilla entity.fox.hurt: a high, sudden yelp */
function hurt(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const d = rng.range(0.15, 0.22);
  const out = alloc(d + 0.08, sr);
  const f = rng.range(1150, 1350);
  voice(out, sr, rng, {
    dur: d,
    f0: (t) => f * (1.1 - 0.4 * smooth(t / d)),
    amp: (t) => envAD(t, 0.005, d * 0.45),
    formants: [
      { f: 1200, bw: 220, g: 1 },
      { f: 2600, bw: 320, g: 0.7 },
      { f: 3900, bw: 450, g: 0.3 },
    ],
    oq: 0.42,
    jitter: 0.03,
    shimmer: 0.1,
    rough: 0.3,
    breath: 0.2,
  });
  return out;
}

/** vanilla entity.fox.screech: the fox's scream, long, hoarse and eerie, rising sharply then wavering down */
function screech(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const d = rng.range(0.75, 1.1);
  const out = alloc(d + 0.15, sr);
  const f = rng.range(620, 800), peak = rng.range(1.35, 1.55);
  const f0 = (t: number): number => {
    const x = t / d;
    return f * (x < 0.15 ? 1 + (peak - 1) * smooth(x / 0.15) : peak - (peak - 0.9) * smooth((x - 0.15) / 0.85));
  };
  layer(out, 1, (b) =>
    voice(b, sr, rng, {
      dur: d,
      f0,
      amp: (t) => envBump(t, d * 0.08, d * 0.92) * (0.85 + 0.15 * Math.sin(TAU * 5 * t)),
      formants: [
        { f: 1300, bw: 400, g: 1 },
        { f: 2700, bw: 500, g: 0.85 },
        { f: 4100, bw: 700, g: 0.4 },
      ],
      oq: 0.32,
      jitter: 0.04,
      shimmer: 0.2,
      rough: 0.5,
      growl: [rng.range(30, 45), 0.3],
      breath: 0.45,
      vib: [6, 0.02],
    }),
  );
  // (the rasp of the breath through it)
  layer(out, 0.3, (b) => sweep(b, sr, rng, { dur: d, f: (t) => f0(t) * 3, q: 3, amp: (t) => envBump(t, d * 0.1, d * 0.9) }));
  highpass(out, 250, sr);
  return out;
}

/** vanilla entity.fox.sleep: breathing slow and deep, snuffling in and sighing out */
function sleep(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const ind = rng.range(0.45, 0.6), outd = rng.range(0.6, 0.8), gap = rng.range(0.05, 0.12);
  const out = alloc(ind + gap + outd + 0.1, sr);
  layer(out, 0.8, (b) => burst(b, sr, rng, { dur: ind, attack: ind * 0.6, tau: ind * 0.2, bp: [rng.range(800, 1100), 1.2] }));
  // (a faint snore in the throat on the breath in)
  layer(out, 0.35, (b) =>
    voice(b, sr, rng, {
      dur: ind,
      f0: rng.range(95, 120),
      amp: (t) => envBump(t, ind * 0.6, ind * 0.4),
      formants: [
        { f: 500, bw: 150, g: 1 },
        { f: 1200, bw: 250, g: 0.4 },
      ],
      oq: 0.5,
      rough: 0.6,
      breath: 0.6,
    }),
  );
  layer(out, 0.6, (b) => burst(b, sr, rng, { t: ind + gap, dur: outd, attack: outd * 0.2, tau: outd * 0.35, bp: [rng.range(1200, 1600), 1] }));
  lowpass(out, 3500, sr);
  return out;
}

/** vanilla entity.fox.sniff: two to four quick sniffs */
function sniff(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const n = 2 + rng.int(3);
  const out = alloc(n * 0.13 + 0.05, sr);
  layer(out, 1, (b) => {
    let t = 0.01;
    for (let i = 0; i < n; i++) {
      const d = rng.range(0.04, 0.06);
      sniffInto(b, c, t, d);
      t += d + rng.range(0.05, 0.08);
    }
  });
  return out;
}

/** vanilla entity.fox.spit: a quick "ptoo" of the lips, and a puff of air */
function spit(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const out = alloc(0.2, sr);
  layer(out, 1, (b) => {
    burst(b, sr, rng, { t: 0.005, dur: 0.03, attack: 0.0008, tau: 0.006, lp: 3000 });
    thump(b, sr, { t: 0.005, f0: rng.range(260, 320), f1: 150, tau: 0.01, amp: 0.4 });
  });
  layer(out, 0.6, (b) => burst(b, sr, rng, { t: 0.015, dur: 0.1, attack: 0.004, tau: 0.03, bp: [rng.range(1300, 1800), 1] }));
  layer(out, 0.25, (b) => burst(b, sr, rng, { t: 0.02, dur: 0.02, attack: 0.001, tau: 0.004, hp: 4000 }));
  return out;
}

/** vanilla entity.fox.teleport: a rushing warble as it's whisked away, and a startled yip */
function teleport(c: Ctx): Float32Array {
  const { rng, sr } = c;
  const d = rng.range(0.3, 0.4);
  const out = alloc(d + 0.2, sr);
  layer(out, 0.7, (b) => sweep(b, sr, rng, { dur: d, f: (t) => 600 * Math.pow(7, t / d), q: 3, amp: (t) => envBump(t, d * 0.5, d * 0.5) }));
  layer(out, 0.6, (b) =>
    addOsc(b, sr, 0, d, (t) => 1900 * Math.pow(0.4, t / d) * (1 + 0.07 * Math.sin(TAU * 30 * t)), (t) => envBump(t, d * 0.3, d * 0.7)),
  );
  const f = rng.range(1150, 1350);
  layer(out, 0.9, (b) => yipInto(b, c, d * 0.8, 0.09, f, { drop: 0.3 }));
  return out;
}

export function foxSounds(): Record<string, SoundGen> {
  return {
    'entity.fox.ambient': sound('entity.fox.ambient', 4, ambient),
    'entity.fox.aggro': sound('entity.fox.aggro', 4, aggro),
    'entity.fox.bite': sound('entity.fox.bite', 3, bite),
    'entity.fox.death': sound('entity.fox.death', 2, death),
    'entity.fox.eat': sound('entity.fox.eat', 3, eat),
    'entity.fox.hurt': sound('entity.fox.hurt', 4, hurt),
    'entity.fox.screech': sound('entity.fox.screech', 4, screech),
    'entity.fox.sleep': sound('entity.fox.sleep', 4, sleep),
    'entity.fox.sniff': sound('entity.fox.sniff', 4, sniff),
    'entity.fox.spit': sound('entity.fox.spit', 3, spit),
    'entity.fox.teleport': sound('entity.fox.teleport', 3, teleport),
  };
}
