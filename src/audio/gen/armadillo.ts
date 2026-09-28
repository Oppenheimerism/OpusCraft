// Armadillos (remaining mobs: the armadillo; vanilla entity.armadillo.*) and wolf armour (vanilla
// item.armor.equip_wolf, item.armor.unequip_wolf, item.wolf_armor.*). An armadillo snuffles as it goes about, now and
// then with a small squeaky grunt; eating, it crunches in quick wet little bites. Its shell is hard, horny plates:
// rolling up they clatter together, faster and faster, and the ball lands with a hollow knock; a blow on it while
// it's rolled up knocks on the shell (hurt_reduced); peeking, a sniff and a faint shuffle of plates; unrolling, the
// plates slide and rattle open, and it snorts as it comes out. Hurt, a sharp squeak; dying, a squeak that sinks away.
// Its steps are the pitter of little claws. A scute coming off ticks onto the ground and bounces once; brushed off,
// bristles scratch over the shell first. Wolf armour: strapped on, the buckle, a creak of the strap and the plates
// settling; sheared off, the snip and the plates sliding away; a blow on it, a hard knock; cracking, a sharp split;
// breaking, the split and its pieces clattering down; mended, a plate set to it, a scrape and a click. Every take
// starts at once (no lead-in of near silence): rolling up and unrolling open on a plate's first snap.
// Takes: ambient 6, brush 3, death 2, eat 4, hurt 4, hurt_reduced 4, land 3, peek 3, roll 4, scute_drop 3, step 5,
// unroll_finish 3, unroll_start 3; item.armor.equip_wolf 3, item.armor.unequip_wolf 2, item.wolf_armor.break 2,
// crack 3, damage 4, repair 3.

import type { SoundGen } from '../synth';
import { alloc, envAD, envBump, highpass, layer, lowpass } from './dsp';
import { type Ctx, sound } from './registry';
import { burst, creak, impact, phisem, sweep, thump } from './texture';
import { voice } from './voice';

/** a small horny plate struck at `t` (`size` above 1 a bigger, deeper one): a hard, dry click with a short ring */
function clackInto(out: Float32Array, c: Ctx, t: number, amp: number, size = 1): void {
  const { sr, rng } = c;
  const f = rng.range(1500, 2100) / size;
  impact(out, sr, rng, {
    t,
    modes: [f, 1, 0.028, f * 2.13, 0.55, 0.018, f * 3.41, 0.3, 0.012, f * 0.62, 0.35, 0.03],
    jitter: 0.04,
    noise: 1.1,
    noiseTau: 0.0016,
    noiseBp: [f * 2.4, 0.9],
    gain: amp,
  });
}

/** the whole shell knocked (rolled up): hollow, a low body under the click */
function knockInto(out: Float32Array, c: Ctx, t: number, amp: number): void {
  const { sr, rng } = c;
  const f = rng.range(250, 330);
  impact(out, sr, rng, {
    t,
    modes: [f, 1, 0.08, f * 1.87, 0.55, 0.055, f * 3.05, 0.3, 0.035, f * 4.6, 0.15, 0.02],
    jitter: 0.03,
    noise: 0.9,
    noiseTau: 0.003,
    noiseBp: [1100, 0.8],
    gain: amp,
  });
  thump(out, sr, { t, f0: rng.range(140, 170), f1: 95, glide: 0.02, tau: 0.035, amp: amp * 0.8 });
}

/** plates clattering over `dur` from `t0`: `n` clacks, bunched towards the end if `accel` */
function rattleInto(out: Float32Array, c: Ctx, t0: number, dur: number, n: number, amp: number, accel = false): void {
  const { rng } = c;
  for (let i = 0; i < n; i++) {
    const x = accel ? Math.sqrt(rng.next()) : rng.next();
    clackInto(out, c, t0 + x * dur, amp * rng.range(0.35, 1) * (accel ? 0.5 + 0.5 * x : 1), rng.range(0.9, 1.3));
  }
}

/** a sniff (in) or a snort (out) through a small nose */
function sniffInto(out: Float32Array, c: Ctx, t0: number, d: number, amp: number, inward = true): void {
  const { sr, rng } = c;
  const f0 = rng.range(2600, 3400);
  sweep(out, sr, rng, {
    t: t0,
    dur: d,
    f: (t) => f0 * (inward ? 0.85 + 0.35 * (t / d) : 1.1 - 0.45 * (t / d)),
    q: 2.6,
    amp: (t) => amp * envBump(t, d * (inward ? 0.35 : 0.12), d * (inward ? 0.65 : 0.88)),
    color: 'pink',
  });
}

/** a small, high voice: a squeak from `f` rising by `rise` and falling by `fall` (fractions) */
function squeakInto(out: Float32Array, c: Ctx, t0: number, d: number, f: number, rise: number, fall: number, gain = 1): void {
  const { sr, rng } = c;
  voice(out, sr, rng, {
    t: t0,
    dur: d,
    f0: (t) => {
      const x = t / d;
      return f * (1 + rise * Math.min(1, x / 0.3) - (rise + fall) * Math.max(0, (x - 0.35) / 0.65));
    },
    amp: (t) => envBump(t, d * 0.1, d * 0.9),
    formants: [
      { f: 1300, bw: 260, g: 1 },
      { f: 2500, bw: 380, g: 0.6 },
      { f: 3900, bw: 600, g: 0.25 },
    ],
    oq: 0.45,
    jitter: 0.025,
    shimmer: 0.1,
    rough: 0.15,
    breath: 0.25,
    gain,
  });
}

/** vanilla entity.armadillo.ambient: a snuffle or two, and sometimes a small squeaky grunt */
function ambient(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.9, sr);
  let t = 0.01;
  for (let i = 0, n = 1 + rng.int(3); i < n; i++) {
    const d = rng.range(0.05, 0.09);
    sniffInto(out, c, t, d, rng.range(0.6, 1), rng.chance(0.7));
    t += d + rng.range(0.03, 0.08);
  }
  if (rng.chance(0.55)) {
    const d = rng.range(0.08, 0.13), f = rng.range(460, 580);
    voice(out, sr, rng, {
      t: t + 0.02,
      dur: d,
      f0: (x) => f * (1 + 0.15 * Math.sin((Math.PI * x) / d)),
      amp: (x) => envBump(x, d * 0.15, d * 0.85),
      formants: [
        { f: 700, bw: 200, g: 1 },
        { f: 1600, bw: 300, g: 0.5 },
        { f: 3000, bw: 500, g: 0.2 },
      ],
      oq: 0.5,
      jitter: 0.04,
      rough: 0.35,
      breath: 0.3,
    });
  }
  highpass(out, 120, sr);
  return out;
}

/** vanilla entity.armadillo.brush: bristles scratching over the shell, a stroke or two, and the scute's click */
function brush(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.8, sr);
  let t = 0.01;
  for (let i = 0, n = 1 + rng.int(2); i < n; i++) {
    const d = rng.range(0.16, 0.24);
    phisem(out, sr, rng, {
      t,
      dur: d,
      rate: 2600,
      energy: (x) => envBump(x, i ? d * 0.25 : 0.012, i ? d * 0.75 : d - 0.012),
      grain: 0.0007,
      heavy: 1.6,
      bands: [
        { f: rng.range(4200, 5200), q: 1.4, g: 1, spread: 0.25 },
        { f: rng.range(2200, 2800), q: 1.6, g: 0.5, spread: 0.2 },
        { f: 7000, q: 1.2, g: 0.35 },
      ],
      dry: 0.05,
      gain: i ? 0.8 : 1,
    });
    t += d + rng.range(0.03, 0.07);
  }
  clackInto(out, c, t + 0.02, 0.8);
  highpass(out, 300, sr);
  return out;
}

/** vanilla entity.armadillo.death: a squeak sinking away, breathy at the end */
function death(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.55, 0.7);
  const out = alloc(d + 0.15, sr);
  squeakInto(out, c, 0.01, d, rng.range(1000, 1150), 0.08, 0.5);
  sniffInto(out, c, d * 0.75, d * 0.3, 0.3, false);
  highpass(out, 150, sr);
  return out;
}

/** vanilla entity.armadillo.eat: quick, wet little bites */
function eat(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  let t = 0.005;
  for (let i = 0, n = 3 + rng.int(2); i < n; i++) {
    const d = rng.range(0.05, 0.08);
    phisem(out, sr, rng, {
      t,
      dur: d,
      rate: 1200,
      energy: (x) => envAD(x, 0.004, d * 0.5),
      grain: 0.0012,
      heavy: 2.2,
      bands: [
        { f: rng.range(1600, 2200), q: 1.8, g: 1, spread: 0.3 },
        { f: rng.range(700, 900), q: 1.4, g: 0.5, spread: 0.2 },
      ],
      gain: i ? rng.range(0.6, 0.9) : 1,
    });
    // (a squelch in each)
    const tt = t;
    layer(out, 0.25, (b) => sweep(b, sr, rng, { t: tt, dur: d, f: (x) => 900 + 1200 * (x / d), q: 3, amp: (x) => envBump(x, d * 0.3, d * 0.7) }));
    t += d + rng.range(0.04, 0.08);
  }
  highpass(out, 150, sr);
  return out;
}

/** vanilla entity.armadillo.hurt: a sharp squeak */
function hurt(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.14, 0.22);
  const out = alloc(d + 0.1, sr);
  squeakInto(out, c, 0.005, d, rng.range(1150, 1400), 0.18, 0.3, 1.1);
  highpass(out, 200, sr);
  return out;
}

/** vanilla entity.armadillo.hurt_reduced: the blow knocking on its shell */
function hurtReduced(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  knockInto(out, c, 0.005, 1);
  clackInto(out, c, 0.005, 0.6, 0.8);
  if (rng.chance(0.6)) clackInto(out, c, rng.range(0.05, 0.09), 0.3);
  highpass(out, 60, sr);
  return out;
}

/** vanilla entity.armadillo.land: the ball dropping onto the ground, and the plates settling */
function land(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  knockInto(out, c, 0.005, 0.9);
  burst(out, sr, rng, { t: 0.005, dur: 0.06, tau: 0.012, bp: [600, 0.7], color: 'brown', amp: 0.6 });
  rattleInto(out, c, 0.04, 0.12, 2 + rng.int(2), 0.35);
  highpass(out, 50, sr);
  return out;
}

/** vanilla entity.armadillo.peek: a sniff, and a faint shuffle of plates */
function peek(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  clackInto(out, c, 0.005, 0.4, rng.range(0.9, 1.2));
  rattleInto(out, c, 0.02, 0.09, 1 + rng.int(2), 0.35);
  sniffInto(out, c, rng.range(0.1, 0.16), rng.range(0.07, 0.1), 0.8);
  highpass(out, 150, sr);
  return out;
}

/** vanilla entity.armadillo.roll: its plates clattering together as it curls up, faster, and closing with a clack */
function roll(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.3, 0.42);
  const out = alloc(d + 0.2, sr);
  clackInto(out, c, 0.005, 0.6, rng.range(0.9, 1.2));
  rattleInto(out, c, 0.02, d - 0.015, 6 + rng.int(4), 0.7, true);
  sweep(out, sr, rng, { t: 0.005, dur: d, f: (t) => 1800 + 1400 * (t / d), q: 1.5, amp: (t) => 0.25 * envBump(t, d * 0.6, d * 0.4), color: 'pink' });
  clackInto(out, c, d + 0.01, 1, 0.85);
  highpass(out, 120, sr);
  return out;
}

/** vanilla entity.armadillo.scute_drop: a light plate ticking onto the ground, and bouncing once */
function scuteDrop(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  clackInto(out, c, 0.005, 1, 0.9);
  clackInto(out, c, rng.range(0.09, 0.13), 0.4, 0.95);
  if (rng.chance(0.5)) clackInto(out, c, rng.range(0.17, 0.2), 0.15);
  highpass(out, 250, sr);
  return out;
}

/** vanilla entity.armadillo.step: the pitter of little claws on a soft pad */
function step(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.18, sr);
  thump(out, sr, { t: 0.004, f0: rng.range(180, 230), f1: 120, glide: 0.01, tau: 0.012, amp: 0.5 });
  for (let i = 0, n = 2 + rng.int(2); i < n; i++) {
    const t = 0.004 + i * rng.range(0.012, 0.02);
    burst(out, sr, rng, { t, dur: 0.012, attack: 0.0004, tau: 0.0018, bp: [rng.range(4200, 5600), 1.4], amp: rng.range(0.6, 1) });
  }
  highpass(out, 120, sr);
  return out;
}

/** vanilla entity.armadillo.unroll_start: the plates slipping and rattling as the ball starts to open */
function unrollStart(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const d = rng.range(0.3, 0.4);
  const out = alloc(d + 0.15, sr);
  clackInto(out, c, 0.005, 0.55, rng.range(0.9, 1.2));
  sweep(out, sr, rng, { t: 0.005, dur: d, f: (t) => 2600 - 1000 * (t / d), q: 1.4, amp: (t) => 0.35 * envBump(t, d * 0.3, d * 0.7), color: 'pink' });
  rattleInto(out, c, 0.03, d - 0.01, 3 + rng.int(3), 0.55);
  highpass(out, 150, sr);
  return out;
}

/** vanilla entity.armadillo.unroll_finish: the last plates clicking open, and a snort as it's out */
function unrollFinish(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  clackInto(out, c, 0.005, 0.7, rng.range(0.9, 1.2));
  rattleInto(out, c, 0.02, 0.07, 1 + rng.int(2), 0.7);
  sniffInto(out, c, rng.range(0.12, 0.16), rng.range(0.08, 0.12), 0.9, false);
  highpass(out, 150, sr);
  return out;
}

// ---------------------------------------------------------------------------
// wolf armour

/** vanilla item.armor.equip_wolf: the buckle, the strap drawn tight, and the plates settling on the wolf's back */
function equipWolf(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  const d = rng.range(0.18, 0.26);
  clackInto(out, c, 0.005, 0.5, 1.3);
  creak(out, sr, rng, {
    t: 0.01,
    dur: d,
    rate: (t) => 70 + 90 * (t / d),
    amp: (t) => 0.8 * envBump(t, d * 0.12, d * 0.88),
    jitter: 0.25,
    bands: [
      { f: rng.range(900, 1200), q: 5, g: 1 },
      { f: rng.range(2300, 2800), q: 6, g: 0.5 },
    ],
  });
  rattleInto(out, c, d * 0.6, 0.22, 4 + rng.int(3), 0.7);
  knockInto(out, c, d + 0.16, 0.3);
  highpass(out, 90, sr);
  return out;
}

/** vanilla item.armor.unequip_wolf: the shears' snip, and the plates sliding off */
function unequipWolf(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  // (the snip: two blades' quick metal ticks and a hiss of the cut)
  for (const [t, a] of [[0.005, 1], [0.028, 0.7]] as [number, number][])
    impact(out, sr, rng, { t, modes: [rng.range(3800, 4400), a, 0.03, rng.range(6200, 7000), a * 0.5, 0.02], noise: 0.8, noiseTau: 0.002, noiseBp: [5200, 1] });
  burst(out, sr, rng, { t: 0.01, dur: 0.05, tau: 0.012, bp: [3600, 1], amp: 0.4 });
  sweep(out, sr, rng, { t: 0.08, dur: 0.3, f: (t) => 2200 - 1200 * (t / 0.3), q: 1.5, amp: (t) => 0.35 * envBump(t, 0.06, 0.24), color: 'pink' });
  rattleInto(out, c, 0.1, 0.3, 5 + rng.int(3), 0.6);
  highpass(out, 120, sr);
  return out;
}

/** vanilla item.wolf_armor.break: a split, and the pieces clattering down */
function breakArmor(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.9, sr);
  burst(out, sr, rng, { t: 0.005, dur: 0.08, attack: 0.0005, tau: 0.012, bp: [rng.range(2200, 2800), 0.9], amp: 1 });
  knockInto(out, c, 0.005, 0.7);
  rattleInto(out, c, 0.05, 0.5, 10 + rng.int(4), 0.7);
  highpass(out, 80, sr);
  return out;
}

/** vanilla item.wolf_armor.crack: a sharp split through a plate */
function crack(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.35, sr);
  burst(out, sr, rng, { t: 0.005, dur: 0.05, attack: 0.0003, tau: 0.008, bp: [rng.range(2400, 3200), 1.1], amp: 1 });
  phisem(out, sr, rng, {
    t: 0.01,
    dur: 0.08,
    rate: 1500,
    energy: (x) => envAD(x, 0.002, 0.03),
    grain: 0.0006,
    heavy: 2.5,
    bands: [{ f: rng.range(3000, 4000), q: 2, g: 1, spread: 0.3 }],
    gain: 0.6,
  });
  clackInto(out, c, 0.006, 0.6, 0.9);
  highpass(out, 200, sr);
  return out;
}

/** vanilla item.wolf_armor.damage: a hard knock on the plates */
function damage(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  clackInto(out, c, 0.005, 1, 1.25);
  knockInto(out, c, 0.005, 0.55);
  if (rng.chance(0.5)) clackInto(out, c, rng.range(0.04, 0.07), 0.25);
  highpass(out, 80, sr);
  return out;
}

/** vanilla item.wolf_armor.repair: a plate set to the armour, a scrape as it slides home, and a click */
function repair(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.5, sr);
  const d = rng.range(0.12, 0.18);
  clackInto(out, c, 0.005, 0.4, 1.2);
  sweep(out, sr, rng, { t: 0.01, dur: d, f: (t) => 1600 + 1600 * (t / d), q: 2, amp: (t) => 0.5 * envBump(t, d * 0.4, d * 0.6) });
  clackInto(out, c, d + 0.015, 1, 1.1);
  clackInto(out, c, d + 0.05, 0.35);
  highpass(out, 150, sr);
  lowpass(out, 9000, sr);
  return out;
}

export function armadilloSounds(): Record<string, SoundGen> {
  const s = (name: string, takes: number, fn: (c: Ctx) => Float32Array) => [name, sound(name, takes, fn)] as const;
  return Object.fromEntries([
    s('entity.armadillo.ambient', 6, ambient),
    s('entity.armadillo.brush', 3, brush),
    s('entity.armadillo.death', 2, death),
    s('entity.armadillo.eat', 4, eat),
    s('entity.armadillo.hurt', 4, hurt),
    s('entity.armadillo.hurt_reduced', 4, hurtReduced),
    s('entity.armadillo.land', 3, land),
    s('entity.armadillo.peek', 3, peek),
    s('entity.armadillo.roll', 4, roll),
    s('entity.armadillo.scute_drop', 3, scuteDrop),
    s('entity.armadillo.step', 5, step),
    s('entity.armadillo.unroll_finish', 3, unrollFinish),
    s('entity.armadillo.unroll_start', 3, unrollStart),
    s('item.armor.equip_wolf', 3, equipWolf),
    s('item.armor.unequip_wolf', 2, unequipWolf),
    s('item.wolf_armor.break', 2, breakArmor),
    s('item.wolf_armor.crack', 3, crack),
    s('item.wolf_armor.damage', 4, damage),
    s('item.wolf_armor.repair', 3, repair),
  ]);
}
