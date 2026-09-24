// The redstone components' textures (vanilla block/redstone_dust_*, redstone_torch[_off], repeater[_on], and the
// pistons', dispensers' and tripwire's as they come). The dust is drawn in grays: the game tints it by its power.

import { TexImage, img, plot, Rand } from '../tex';
import { hashString } from '../../core/rng';
import { sprite } from './plants';

type Gen = () => TexImage;

function R(name: string): Rand {
  return new Rand(hashString(name), 77);
}

/** vanilla redstone_dust_dot.png: a round clump of dust, bright in the middle, with a few grains about it */
function dustDot(): TexImage {
  const t = img();
  const r = R('redstone_dust_dot');
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const edge = 3.2 + (r.next() - 0.5) * 1.1;
      if (d < edge) plot(t, x, y, d < 1.6 ? 0xffffff : d < 2.6 ? 0xe4e4e4 : 0xbdbdbd);
      else if (d < 4.8 && r.next() < 0.28) plot(t, x, y, 0x9a9a9a);
    }
  return t;
}

/** vanilla redstone_dust_line0/1.png: a grainy line of dust down the middle (each piece draws one turned its way) */
function dustLine(name: string): TexImage {
  const t = img();
  const r = R(name);
  for (let y = 0; y < 16; y++) {
    plot(t, 7, y, r.next() < 0.25 ? 0xe4e4e4 : 0xffffff);
    plot(t, 8, y, r.next() < 0.35 ? 0xd0d0d0 : 0xf2f2f2);
    if (r.next() < 0.55) plot(t, 6, y, r.next() < 0.5 ? 0xbdbdbd : 0xa8a8a8);
    if (r.next() < 0.55) plot(t, 9, y, r.next() < 0.5 ? 0xbdbdbd : 0xa8a8a8);
    if (r.next() < 0.12) plot(t, r.next() < 0.5 ? 5 : 10, y, 0x8e8e8e);
  }
  return t;
}

/** vanilla redstone_torch.png / redstone_torch_off.png: a stick with a red head, lit a glowing one */
function redstoneTorch(lit: boolean): TexImage {
  const stick = { L: 0x9c7a4b, l: 0x866741, b: 0x6b5132, B: 0x5a4329 };
  if (!lit)
    return sprite(
      ['.......hH.......', '.......Hd.......', '.......Lb.......', '.......Lb.......', '.......lb.......', '.......Lb.......', '.......lB.......', '.......Lb.......', '.......lb.......', '.......lB.......'],
      { ...stick, h: 0x6e2a26, H: 0x4d1c19, d: 0x351210 },
      img(), 0, 6,
    );
  return sprite(
    [
      '.......gg.......',
      '......gWRg......',
      '......gRDg......',
      '.......Lb.......',
      '.......Lb.......',
      '.......lb.......',
      '.......Lb.......',
      '.......lB.......',
      '.......Lb.......',
      '.......lb.......',
      '.......lB.......',
    ],
    { ...stick, W: 0xffb5a8, R: 0xff2a1a, D: 0xc40c0c, g: 0x8c1a12 },
    img(), 0, 5,
  );
}

/** vanilla repeater.png / repeater_on.png: the smooth stone top with the dust's groove down the middle */
function repeaterTop(base: TexImage, on: boolean): TexImage {
  const t = base;
  const r = R(on ? 'repeater_on' : 'repeater');
  const hi = on ? 0xff3a2a : 0x7a1410, mid = on ? 0xd41010 : 0x5a0c0a, lo = on ? 0x9c0606 : 0x3f0806;
  for (let y = 1; y < 15; y++) {
    plot(t, 7, y, r.next() < 0.3 ? mid : hi);
    plot(t, 8, y, r.next() < 0.4 ? lo : mid);
  }
  // (the groove's worn stone edges)
  for (let y = 1; y < 15; y++) {
    plot(t, 6, y, 0x8e8e8e);
    plot(t, 9, y, 0x9e9e9e);
  }
  return t;
}

/** add the redstone components' block textures to a registry (textures/blocks.ts) */
export function registerRedstoneTextures(T: Record<string, () => TexImage | { w: number; h: number; frames: Uint8ClampedArray[] }>): void {
  const G = T as Record<string, Gen>;
  G['redstone_dust_dot'] = dustDot;
  G['redstone_dust_line0'] = () => dustLine('redstone_dust_line0');
  G['redstone_dust_line1'] = () => dustLine('redstone_dust_line1');
  G['redstone_torch'] = () => redstoneTorch(true);
  G['redstone_torch_off'] = () => redstoneTorch(false);
  G['repeater'] = () => repeaterTop(G['smooth_stone'](), false);
  G['repeater_on'] = () => repeaterTop(G['smooth_stone'](), true);
}
