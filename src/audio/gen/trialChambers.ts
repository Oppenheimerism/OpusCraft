// (trial chambers) The trial spawner's and the vault's sounds (vanilla SoundType.TRIAL_SPAWNER and VAULT, and their
// events), Trial Omen's (event.mob_effect.trial_omen) and the honey bottle's slurp (item.honey_bottle.drink). Both
// blocks are cages of heavy metal: stepping on or breaking them clanks like a thick grille over stone. The spawner
// crackles with fire while it can spawn (bluer and eerier when ominous), whooshes a mob out in a puff of flame, flares
// up rising when it sees a player, and slides its shutter open to pop its rewards out; turning ominous is a deep boom
// under a dissonant swell. An ominous item spawner shimmers in, charges up before letting go, and pops. The vault
// hums up to life and winds down, crackles softly while it waits, turns its lock with a key (clicks and a bolt), clunks
// dully at anything else or at a player it has rewarded, and pops each item out with a clack.

import type { SoundGen } from '../synth';
import { alloc, envBump, envAD, layer, addOsc } from './dsp';
import { type Ctx, pitched, sound } from './registry';
import { burst, impact, phisem, sweep, thump, ticks, bubble, fireCrackles } from './texture';
import { stoneStep, stoneBreak } from './blocks';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ the blocks themselves

/** a thick metal grille struck: a few low, damped partials and a rattle of bars */
function grille(b: Float32Array, c: Ctx, t: number, f: number, ring: number, rattle: number, a = 1): void {
  const { sr, rng } = c;
  impact(b, sr, rng, {
    t,
    modes: [f, a, 0.12 * ring, f * 1.47, 0.8 * a, 0.09 * ring, f * 2.26, 0.55 * a, 0.07 * ring, f * 3.1, 0.35 * a, 0.05 * ring, f * 4.7, 0.2 * a, 0.03 * ring],
    jitter: 0.03,
    noise: 1.2 * a,
    noiseTau: 0.003,
    noiseBp: [1800, 0.7],
  });
  if (rattle > 0)
    ticks(b, sr, rng, {
      t: t + 0.008,
      dur: 0.12 * rattle,
      rate: 70,
      energy: (x) => Math.exp(-x / (0.04 * rattle)),
      f: [900, 2600],
      t60: [0.015, 0.05],
      ratios: [1, 1.8, 2.7],
      weights: [1, 0.5, 0.25],
      amp: 0.5 * a,
      heavy: 1.4,
    });
}

/** stepping on the cage: a stone footfall under a short clank */
function cageStep(c: Ctx, f0: number): Float32Array {
  const { rng } = c;
  const out = stoneStep(c, 0.85);
  layer(out, 0.75, (b) => grille(b, c, 0, f0 * rng.range(0.9, 1.15), 0.6, 0.5));
  return out;
}

/** breaking or placing it: the stone giving and the grille clanging */
function cageBreak(c: Ctx, f0: number): Float32Array {
  const { sr, rng } = c;
  const out = stoneBreak(c, 0.8, 0.6);
  layer(out, 0.9, (b) => grille(b, c, 0, f0 * rng.range(0.9, 1.1), 1.6, 1.4));
  layer(out, 0.45, (b) => thump(b, sr, { f0: 120, f1: 70, tau: 0.05 }));
  return out;
}

// ------------------------------------------------------------------ fire

/** the soft roar of the flame inside a cage: breathy low noise swelling and ebbing, with crackles */
function fireBed(b: Float32Array, c: Ctx, dur: number, bright: number, crackle: number): void {
  const { sr, rng } = c;
  const lfo = rng.range(2.5, 4);
  burst(b, sr, rng, {
    dur,
    tau: dur,
    amp: 0.6,
    bp: [380 * bright, 0.7],
    color: 'brown',
    env: (t) => envBump(t, dur * 0.25, dur * 0.7) * (0.75 + 0.25 * Math.sin(TAU * lfo * t)),
  });
  if (crackle > 0) fireCrackles(b, sr, rng, 0.02, dur * 0.9, crackle, 0.1);
}

/** vanilla block.trial_spawner.ambient (and _ominous: bluer, with a low, wavering drone under it) */
function spawnerAmbient(c: Ctx, ominous: boolean): Float32Array {
  const { sr, rng } = c;
  const dur = rng.range(1.1, 1.5);
  const out = alloc(dur + 0.1, sr);
  layer(out, 0.7, (b) => fireBed(b, c, dur, ominous ? 0.8 : 1.1, ominous ? 10 : 18));
  if (ominous) {
    const f = rng.range(98, 112);
    layer(out, 0.5, (b) => {
      for (const [h, a] of [[1, 1], [1.5, 0.45], [2.02, 0.35]] as [number, number][])
        addOsc(b, sr, 0, dur, (t) => f * h * (1 + 0.012 * Math.sin(TAU * 1.3 * t)), (t) => a * envBump(t, dur * 0.35, dur * 0.6));
    });
  }
  return out;
}

/** vanilla block.trial_spawner.spawn_mob: a whoosh of flame puffing the mob out, and a soft thud */
function spawnMob(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.8, sr);
  const len = rng.range(0.4, 0.55);
  layer(out, 1, (b) => sweep(b, sr, rng, { dur: len, f: (t) => 500 + 1800 * Math.sin((Math.PI * t) / len), q: 1.2, amp: (t) => envBump(t, len * 0.2, len * 0.75) }));
  layer(out, 0.45, (b) => fireCrackles(b, sr, rng, 0.05, len, 30, 0.2));
  layer(out, 0.4, (b) => thump(b, sr, { t: 0.02, f0: 140, f1: 80, tau: 0.06 }));
  return out;
}

/** vanilla block.trial_spawner.detect_player: the flames flaring up with a rising, bright ring */
function detectPlayer(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.1, sr);
  layer(out, 0.6, (b) => burst(b, sr, rng, { dur: 0.25, attack: 0.004, tau: 0.08, amp: 1, bp: [700, 0.8] }));
  layer(out, 0.8, (b) => sweep(b, sr, rng, { dur: 0.6, f: (t) => 300 + 2600 * (t / 0.6) ** 1.5, q: 1.4, amp: (t) => (0.35 + 0.65 * Math.min(1, t / 0.3)) * envBump(t, 0.01, 0.59) }));
  const f = rng.range(520, 600);
  layer(out, 0.55, (b) => {
    for (const [h, a] of [[1, 1], [2, 0.5], [3, 0.3], [4.02, 0.2]] as [number, number][])
      addOsc(b, sr, 0.18, 0.85, (t) => f * h * (1 + 0.5 * Math.min(1, t / 0.25)), (t) => a * envAD(t, 0.08, 0.3));
  });
  layer(out, 0.35, (b) => fireCrackles(b, sr, rng, 0.25, 0.6, 25, 0.1));
  return out;
}

/** a metal shutter sliding (open: a rising scrape then the latch; close: the latch after a falling scrape) */
function shutter(c: Ctx, open: boolean, f0: number): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.8, sr);
  const len = rng.range(0.28, 0.36);
  const s0 = open ? 0.06 : 0;
  layer(out, 0.6, (b) =>
    sweep(b, sr, rng, { t: s0, dur: len, f: (t) => (open ? 900 + 1400 * (t / len) : 2300 - 1400 * (t / len)), q: 4, amp: (t) => envBump(t, len * 0.2, len * 0.7) * (1 + 0.5 * Math.sin(TAU * 45 * t)) }),
  );
  const latch = open ? 0 : len * 0.95;
  layer(out, 1, (b) => grille(b, c, latch, f0 * rng.range(0.95, 1.08), 1, 0.4));
  layer(out, 0.5, (b) => thump(b, sr, { t: latch, f0: 160, f1: 100, tau: 0.03 }));
  if (open) layer(out, 0.6, (b) => grille(b, c, s0 + len, f0 * 1.3, 0.6, 0));
  return out;
}

/** an item popped out of the top: a hollow pop and a small metal clack (the vault's pitch is set as it's played) */
function ejectItem(c: Ctx, clack: number): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.45, sr);
  layer(out, 1, (b) => bubble(b, sr, 0.005, rng.range(320, 400), 1, 0.03, 1.8));
  layer(out, 0.5, (b) => burst(b, sr, rng, { dur: 0.08, tau: 0.02, amp: 1, bp: [1500, 0.8] }));
  layer(out, clack, (b) => grille(b, c, 0.01, rng.range(900, 1100), 0.5, 0));
  return out;
}

/** vanilla block.trial_spawner.ominous_activate: a deep boom, and a dissonant swell rising out of it */
function ominousActivate(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(2.4, sr);
  layer(out, 1, (b) => thump(b, sr, { f0: 70, f1: 38, tau: 0.35, h2: 0.4, dur: 1.4 }));
  layer(out, 0.6, (b) => burst(b, sr, rng, { dur: 1.4, tau: 0.4, amp: 1, lp: 500, color: 'brown' }));
  const f = rng.range(150, 165);
  layer(out, 0.7, (b) => {
    for (const [r, a] of [[1, 1], [1.06, 0.8], [1.41, 0.6], [2.12, 0.4], [2.83, 0.25]] as [number, number][])
      addOsc(b, sr, 0.1, 2.2, (t) => f * r * (1 + 0.06 * Math.min(1, t / 1.5)), (t) => a * envBump(t, 0.9, 1.2) * (1 + 0.15 * Math.sin(TAU * 5 * t)));
  });
  layer(out, 0.3, (b) => sweep(b, sr, rng, { t: 0.2, dur: 1.6, f: (t) => 2000 + 3000 * (t / 1.6), q: 6, amp: (t) => envBump(t, 1, 0.6) }));
  return out;
}

/** vanilla block.trial_spawner.spawn_item_begin: an item spawner shimmering into being */
function spawnItemBegin(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.3, sr);
  const f = rng.range(700, 820);
  layer(out, 0.8, (b) => {
    for (let i = 0; i < 6; i++) {
      const t0 = i * 0.07 + rng.range(0, 0.03);
      addOsc(b, sr, t0, 0.9, (t) => f * (1 + i * 0.19) * (1 + 0.004 * Math.sin(TAU * 7 * t)), (t) => envAD(t, 0.03, 0.35) * (1 - i * 0.1));
    }
  });
  layer(out, 0.4, (b) => sweep(b, sr, rng, { dur: 1, f: (t) => 3000 + 3000 * t, q: 5, amp: (t) => envBump(t, 0.3, 0.6) }));
  return out;
}

/** vanilla block.trial_spawner.about_to_spawn_item: a pulsing charge rising for the last second and three quarters */
function aboutToSpawnItem(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.9, sr);
  const f = rng.range(180, 200);
  layer(out, 0.8, (b) => {
    for (const [h, a] of [[1, 1], [2, 0.5], [3, 0.3], [5, 0.15]] as [number, number][])
      addOsc(b, sr, 0, 1.75, (t) => f * h * (1 + 1.2 * (t / 1.75) ** 2), (t) => a * (0.35 + 0.65 * Math.min(1, t / 1.4)) * envBump(t, 0.02, 1.73) * (0.6 + 0.4 * Math.sin(TAU * (4 + 10 * t) * t)));
  });
  layer(out, 0.35, (b) => sweep(b, sr, rng, { dur: 1.75, f: (t) => 800 + 3000 * (t / 1.75) ** 2, q: 3, amp: (t) => envBump(t, 1.5, 0.2) }));
  return out;
}

/** vanilla block.trial_spawner.spawn_item: the spawner letting go, a soft pop and a puff */
function spawnItem(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.6, sr);
  layer(out, 1, (b) => bubble(b, sr, 0.005, rng.range(420, 520), 1, 0.04, 1.2));
  layer(out, 0.6, (b) => sweep(b, sr, rng, { dur: 0.35, f: (t) => 2500 - 1800 * (t / 0.35), q: 1.5, amp: (t) => envBump(t, 0.03, 0.3) }));
  return out;
}

// ------------------------------------------------------------------ the vault

/** vanilla block.vault.activate / deactivate: its works humming up (or winding down) and the flame catching */
function vaultPower(c: Ctx, on: boolean): Float32Array {
  const { sr, rng } = c;
  const out = alloc(1.1, sr);
  const f = rng.range(85, 95);
  const len = 0.8;
  layer(out, 0.8, (b) => {
    for (const [h, a] of [[1, 1], [2, 0.6], [3, 0.4], [4, 0.25], [6, 0.12]] as [number, number][])
      addOsc(b, sr, 0.02, len, (t) => f * h * (on ? 0.7 + 0.5 * (t / len) : 1.2 - 0.5 * (t / len)), (t) => a * (on ? envBump(t, 0.3, 0.5) : envBump(t, 0.05, 0.75)));
  });
  layer(out, on ? 0.6 : 0.4, (b) => grille(b, c, on ? 0 : 0.7, rng.range(520, 600), 0.7, 0.3));
  if (on) layer(out, 0.5, (b) => sweep(b, sr, rng, { t: 0.2, dur: 0.5, f: (t) => 400 + 1500 * Math.sin((Math.PI * t) / 0.5), q: 1.2, amp: (t) => envBump(t, 0.15, 0.35) }));
  return out;
}

/** vanilla block.vault.insert_item: the key going in, turning with clicks, and the bolt drawing back */
function insertItem(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.9, sr);
  layer(out, 0.5, (b) => sweep(b, sr, rng, { dur: 0.12, f: () => 3200, q: 3, amp: (t) => envBump(t, 0.02, 0.1) }));
  layer(out, 0.8, (b) =>
    ticks(b, sr, rng, { t: 0.13, dur: 0.3, rate: 22, energy: () => 1, f: [2400, 4200], t60: [0.01, 0.025], ratios: [1, 1.6], weights: [1, 0.4], amp: 1, click: 0.6 }),
  );
  layer(out, 1, (b) => grille(b, c, 0.5, rng.range(380, 440), 1.2, 0.3));
  layer(out, 0.6, (b) => thump(b, sr, { t: 0.5, f0: 130, f1: 80, tau: 0.05 }));
  return out;
}

/** vanilla block.vault.insert_item_fail: a dull clunk, the lock not taking it */
function insertFail(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.4, sr);
  layer(out, 1, (b) => grille(b, c, 0, rng.range(240, 280), 0.5, 0));
  layer(out, 0.7, (b) => thump(b, sr, { f0: 110, f1: 75, tau: 0.04 }));
  return out;
}

/** vanilla block.vault.reject_rewarded_player: the clunk, and a low buzz of refusal */
function rejectRewarded(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  layer(out, 0.8, (b) => grille(b, c, 0, rng.range(240, 280), 0.5, 0));
  const f = rng.range(110, 120);
  layer(out, 0.7, (b) => {
    for (const [h, a] of [[1, 1], [1.5, 0.6], [2, 0.5], [3, 0.35], [4, 0.2]] as [number, number][])
      addOsc(b, sr, 0.04, 0.45, (t) => f * h * (1 - 0.1 * t), (t) => a * envBump(t, 0.03, 0.4));
  });
  return out;
}

/** vanilla block.vault.ambient: its flame purring quietly in the cage */
function vaultAmbient(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const dur = rng.range(0.9, 1.3);
  const out = alloc(dur + 0.1, sr);
  layer(out, 0.7, (b) => fireBed(b, c, dur, 0.9, 8));
  return out;
}

// ------------------------------------------------------------------ the omen, the honey

/** vanilla event.mob_effect.trial_omen: a chime falling away through an eerie, hollow chord */
function trialOmen(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(2.2, sr);
  const f = rng.range(620, 660);
  layer(out, 0.9, (b) => {
    const notes: [number, number][] = [[1, 0], [0.84, 0.18], [0.63, 0.36], [0.5, 0.54]];
    for (const [r, t0] of notes)
      for (const [h, a] of [[1, 1], [2.76, 0.35], [5.4, 0.12]] as [number, number][])
        addOsc(b, sr, t0, 1.5, (t) => f * r * h * (1 + 0.003 * Math.sin(TAU * 5 * t)), (t) => a * envAD(t, 0.01, 0.5));
  });
  layer(out, 0.4, (b) => {
    for (const [r, a] of [[0.25, 1], [0.3, 0.7], [0.37, 0.5]] as [number, number][])
      addOsc(b, sr, 0.2, 1.9, (t) => f * r, (t) => a * envBump(t, 0.6, 1.2));
  });
  return out;
}

/** vanilla item.honey_bottle.drink: thick honey slurped down, a few gloopy swallows */
function honeyDrink(c: Ctx): Float32Array {
  const { sr, rng } = c;
  const out = alloc(0.7, sr);
  layer(out, 0.6, (b) => sweep(b, sr, rng, { dur: 0.25, f: (t) => 700 + 600 * Math.sin((Math.PI * t) / 0.25), q: 2, amp: (t) => envBump(t, 0.05, 0.2), color: 'pink' }));
  layer(out, 1, (b) => {
    for (let i = 0; i < 3; i++) bubble(b, sr, 0.12 + i * rng.range(0.12, 0.16), rng.range(180, 260), 1 - i * 0.2, 0.045, 1.6);
  });
  layer(out, 0.3, (b) => phisem(b, sr, rng, { t: 0.05, dur: 0.5, rate: 60, energy: (t) => envBump(t, 0.1, 0.4), grain: 0.006, heavy: 2, bands: [{ f: 500, q: 3, g: 1, spread: 0.3 }] }));
  return out;
}

export function trialChamberSounds(): Record<string, SoundGen> {
  const S: Record<string, SoundGen> = {};
  const set = (mat: string, f0: number) => {
    const brk = sound(`block.${mat}.break`, 4, (c) => cageBreak(c, f0));
    const step = sound(`block.${mat}.step`, 6, (c) => cageStep(c, f0 * 1.4));
    S[`block.${mat}.break`] = brk;
    S[`block.${mat}.place`] = brk;
    S[`block.${mat}.step`] = step;
    S[`block.${mat}.hit`] = pitched(step, 0.5);
    S[`block.${mat}.fall`] = pitched(step, 0.75);
  };
  set('trial_spawner', 360);
  set('vault', 300);
  S['block.trial_spawner.ambient'] = sound('block.trial_spawner.ambient', 4, (c) => spawnerAmbient(c, false));
  S['block.trial_spawner.ambient_ominous'] = sound('block.trial_spawner.ambient_ominous', 4, (c) => spawnerAmbient(c, true));
  S['block.trial_spawner.spawn_mob'] = sound('block.trial_spawner.spawn_mob', 4, spawnMob);
  S['block.trial_spawner.detect_player'] = sound('block.trial_spawner.detect_player', 3, detectPlayer);
  S['block.trial_spawner.open_shutter'] = sound('block.trial_spawner.open_shutter', 2, (c) => shutter(c, true, 520));
  S['block.trial_spawner.close_shutter'] = sound('block.trial_spawner.close_shutter', 2, (c) => shutter(c, false, 520));
  S['block.trial_spawner.eject_item'] = sound('block.trial_spawner.eject_item', 3, (c) => ejectItem(c, 0.6));
  S['block.trial_spawner.ominous_activate'] = sound('block.trial_spawner.ominous_activate', 2, ominousActivate);
  S['block.trial_spawner.spawn_item_begin'] = sound('block.trial_spawner.spawn_item_begin', 3, spawnItemBegin);
  S['block.trial_spawner.about_to_spawn_item'] = sound('block.trial_spawner.about_to_spawn_item', 2, aboutToSpawnItem);
  S['block.trial_spawner.spawn_item'] = sound('block.trial_spawner.spawn_item', 3, spawnItem);
  S['block.vault.activate'] = sound('block.vault.activate', 3, (c) => vaultPower(c, true));
  S['block.vault.deactivate'] = sound('block.vault.deactivate', 3, (c) => vaultPower(c, false));
  S['block.vault.ambient'] = sound('block.vault.ambient', 4, vaultAmbient);
  S['block.vault.insert_item'] = sound('block.vault.insert_item', 3, insertItem);
  S['block.vault.insert_item_fail'] = sound('block.vault.insert_item_fail', 3, insertFail);
  S['block.vault.reject_rewarded_player'] = sound('block.vault.reject_rewarded_player', 2, rejectRewarded);
  S['block.vault.eject_item'] = sound('block.vault.eject_item', 3, (c) => ejectItem(c, 0.9));
  S['block.vault.open_shutter'] = sound('block.vault.open_shutter', 2, (c) => shutter(c, true, 440));
  S['block.vault.close_shutter'] = sound('block.vault.close_shutter', 2, (c) => shutter(c, false, 440));
  S['event.mob_effect.trial_omen'] = sound('event.mob_effect.trial_omen', 1, trialOmen);
  S['item.honey_bottle.drink'] = sound('item.honey_bottle.drink', 3, honeyDrink);
  return S;
}
