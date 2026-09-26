// The redstone components' textures (vanilla block/redstone_dust_*, redstone_torch[_off], repeater[_on], piston_*,
// dispenser/dropper fronts and the tripwire's). The dust is drawn in grays: the game tints it by its power.

import { TexImage, img, plot, Rand, getPx, mulC, mixC } from '../tex';
import { hashString } from '../../core/rng';
import { sprite } from './plants';
import { furnaceSide, furnaceTop } from './utility';

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

/**
 * vanilla tripwire_hook.png: the iron ring over its wooden stick (the item shows it whole; the block model takes the
 * ring from it, the plank and arm are oak planks)
 */
function tripwireHook(): TexImage {
  return sprite(
    [
      '.....aAAAAb.....',
      '.....A....c.....',
      '.....A....c.....',
      '.....A....c.....',
      '.....A....c.....',
      '.....bccccd.....',
      '.......Lb.......',
      '.......Lb.......',
      '.......lb.......',
      '.......Lb.......',
      '.......lB.......',
      '.......Lb.......',
      '.......lB.......',
    ],
    { a: 0xf0f0f0, A: 0xd6d6d6, b: 0xb0b0b0, c: 0x8e8e8e, d: 0x6a6a6a, L: 0x9c7a4b, l: 0x866741, B: 0x5a4329 },
    img(), 0, 2,
  );
}

/** vanilla tripwire.png: the string along the top rows, drawn taut (rows 0-1) and slack (rows 2-3) */
function tripwire(): TexImage {
  const t = img();
  const r = R('tripwire');
  for (let x = 0; x < 16; x++) {
    plot(t, x, 0, r.next() < 0.3 ? 0xe2e2e2 : 0xf4f4f4);
    plot(t, x, 1, r.next() < 0.4 ? 0xbdbdbd : 0xd4d4d4);
    plot(t, x, 2, r.next() < 0.35 ? 0xcfcfcf : 0xe6e6e6);
    plot(t, x, 3, r.next() < 0.5 ? 0xa9a9a9 : 0xc2c2c2);
  }
  return t;
}

/**
 * vanilla dispenser_front / dropper_front and their _vertical ones: the furnace's side (or top) with the opening the
 * items come out of, a round mouth for the dispenser and a small square one for the dropper, sunk in with a lit rim
 * along the bottom and right
 */
function dispenserFront(dropper: boolean, vertical: boolean): TexImage {
  const t = vertical ? furnaceTop() : furnaceSide();
  const r = dropper ? 2.6 : 3.6;
  const c = 7.5;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      // (a square with its corners rounded off, for the dispenser; a plain square for the dropper)
      const dx = Math.abs(x - c), dy = Math.abs(y - c);
      const d = dropper ? Math.max(dx, dy) : Math.max(dx, dy) + Math.max(0, Math.min(dx, dy) - 1.5) * 0.6;
      if (d > r + 1) continue;
      if (d > r) {
        // the rim: shadowed at the top and left, catching the light at the bottom and right
        plot(t, x, y, x - c + (y - c) > 0 ? 0x9e9e9e : 0x3c3c3c);
        continue;
      }
      const deep = 1 - d / (r + 0.5);
      const v = Math.round(0x2c - deep * 0x18);
      plot(t, x, y, (v << 16) | (v << 8) | v);
    }
  return t;
}

/** darken the outermost ring of a texture (a framed edge) */
function frame(t: TexImage, f: number): TexImage {
  for (let i = 0; i < 16; i++)
    for (const [x, y] of [[i, 0], [i, 15], [0, i], [15, i]]) plot(t, x, y, mulC(getPx(t, x, y), f));
  return t;
}

/** vanilla piston_top.png: the head's platform, oak planks with a darker edge */
function pistonTop(planks: TexImage): TexImage {
  return frame(planks, 0.78);
}

/**
 * vanilla piston_top_sticky.png: the platform under a round-cornered sheet of slime, the wood showing at the edges;
 * lit at the top left, deeper green toward the bottom right, a few bubbles
 */
function pistonTopSticky(planks: TexImage): TexImage {
  const t = pistonTop(planks);
  const r = R('piston_top_sticky');
  const wob = Array.from({ length: 16 }, () => (r.next() - 0.5) * 0.9);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const dx = Math.abs(x - 7.5), dy = Math.abs(y - 7.5);
      // (a squircle, its edge wobbling a little along each side)
      const d = Math.pow(Math.pow(dx, 4) + Math.pow(dy, 4), 0.25) + wob[dx > dy ? y : x];
      if (d > 6.4) continue;
      const light = (15 - x - y) / 30 + (6.4 - d) / 20;
      let c = mixC(0x4d8a3c, 0x93d67a, Math.max(0, Math.min(1, 0.35 + light)));
      if (d > 5.5) c = mulC(c, 0.78); // the sheet's rim
      if (r.next() < 0.06) c = mixC(c, 0xc8f2b0, 0.6);
      plot(t, x, y, c);
    }
  return t;
}

/**
 * vanilla piston_side.png: the head's wooden edge along the top four rows (the platform end), a shadow under it, and
 * the cobblestone body
 */
function pistonSide(planks: TexImage, cobble: TexImage): TexImage {
  const t = cobble;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) plot(t, x, y, mulC(getPx(planks, x, y + 4), y === 3 ? 0.7 : 1));
  for (let x = 0; x < 16; x++) plot(t, x, 4, mulC(getPx(t, x, 4), 0.62));
  return t;
}

/** vanilla piston_bottom.png: the cobblestone back, edged darker */
function pistonBottom(cobble: TexImage): TexImage {
  return frame(cobble, 0.72);
}

/** vanilla piston_inner.png: inside an extended base, the cobblestone round the iron socket the arm runs through */
function pistonInner(cobble: TexImage): TexImage {
  const t = frame(cobble, 0.8);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d < 2) plot(t, x, y, x + y < 15 ? 0xb4b4b4 : 0x8c8c8c);
      else if (d < 3) plot(t, x, y, x + y < 15 ? 0x3e3e3e : 0x6e6e6e);
      else if (d < 4) plot(t, x, y, mulC(getPx(t, x, y), 0.8));
    }
  return t;
}

/** vanilla comparator.png / comparator_on.png: the smooth stone top, grooves of dust from the two back torches joining and running to the front one */
function comparatorTop(base: TexImage, on: boolean): TexImage {
  const t = base;
  const r = R(on ? 'comparator_on' : 'comparator');
  const hi = on ? 0xff3a2a : 0x7a1410, mid = on ? 0xd41010 : 0x5a0c0a, lo = on ? 0x9c0606 : 0x3f0806;
  const dust = (x: number, y: number, left: boolean) => plot(t, x, y, left ? (r.next() < 0.3 ? mid : hi) : r.next() < 0.4 ? lo : mid);
  // (the worn stone round the grooves first, then the dust in them)
  for (let y = 3; y < 15; y++) for (const x of [3, 6, 9, 12]) if (y >= 7 || x === 6 || x === 9) plot(t, x, y, x === 3 || x === 9 ? 0x8e8e8e : 0x9e9e9e);
  for (let x = 3; x < 13; x++) {
    plot(t, x, 6, 0x8e8e8e);
    plot(t, x, 9, 0x9e9e9e);
  }
  for (let y = 7; y < 15; y++) {
    dust(4, y, true);
    dust(5, y, false);
    dust(10, y, true);
    dust(11, y, false);
  }
  for (let x = 4; x < 12; x++) {
    dust(x, 7, true);
    dust(x, 8, false);
  }
  for (let y = 3; y < 7; y++) {
    dust(7, y, true);
    dust(8, y, false);
  }
  return t;
}

/** vanilla hopper_outside.png: a dark iron plate, bevelled lighter along its top and left, faintly mottled */
function hopperOutside(): TexImage {
  const t = img();
  const r = R('hopper_outside');
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      let c = mixC(0x3f3f3f, 0x4b4b4b, r.next());
      if (x === 0 || y === 0 || x === 15 || y === 15) c = 0x2b2b2b;
      else if (x === 1 || y === 1) c = 0x5c5c5c;
      else if (x === 14 || y === 14) c = 0x353535;
      plot(t, x, y, c);
    }
  return t;
}

/** vanilla hopper_inside.png: the bowl's floor, darker, sloping in to the funnel's mouth */
function hopperInside(): TexImage {
  const t = img();
  const r = R('hopper_inside');
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      let c = mixC(0x2c2c2c, 0x343434, r.next());
      if (d > 6.5) c = 0x3c3c3c;
      else if (d < 2) c = 0x151515;
      else if (d < 3) c = 0x202020;
      plot(t, x, y, c);
    }
  return t;
}

/** vanilla hopper_top.png: the rim round the bowl, two pixels wide, lit on its outer edge (the middle is open) */
function hopperTop(): TexImage {
  const t = img();
  const r = R('hopper_top');
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d < 5.5) continue;
      const outer = d > 6.5;
      plot(t, x, y, outer ? (x === 0 || y === 0 ? 0x6e6e6e : 0x5a5a5a) : mixC(0x444444, 0x4c4c4c, r.next()));
    }
  return t;
}

/** the observer's stone: dark gray, mottled, a lighter bevel at the top and left and a shadowed one at the bottom and right */
function observerBase(name: string): TexImage {
  const t = img();
  const r = R(name);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      let c = mixC(0x5f5f5f, 0x707070, r.next());
      if (x === 0 || y === 0) c = 0x8a8a8a;
      else if (x === 15 || y === 15) c = 0x3f3f3f;
      plot(t, x, y, c);
    }
  return t;
}

/** vanilla observer_front.png: its face, a dark recess across the middle with two pale eyes in it */
function observerFront(): TexImage {
  const t = observerBase('observer_front');
  for (let y = 4; y < 12; y++) for (let x = 2; x < 14; x++) plot(t, x, y, y === 4 || x === 2 ? 0x262626 : 0x323232);
  for (let x = 2; x < 14; x++) plot(t, x, 12, 0x8a8a8a);
  for (let y = 4; y < 13; y++) plot(t, 14, y, 0x8a8a8a);
  for (const x0 of [4, 9])
    for (let y = 6; y < 9; y++)
      for (let x = x0; x < x0 + 3; x++) plot(t, x, y, y === 6 ? 0xd8d8d8 : x === x0 + 2 || y === 8 ? 0x8e8e8e : 0xb4b4b4);
  return t;
}

/** vanilla observer_back.png / observer_back_on.png: the plate its power comes out of, a dark dot, red while it pulses */
function observerBack(on: boolean): TexImage {
  const t = observerBase(on ? 'observer_back_on' : 'observer_back');
  for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) plot(t, x, y, y === 5 || x === 5 ? 0x2a2a2a : 0x3a3a3a);
  for (let y = 6; y < 10; y++)
    for (let x = 6; x < 10; x++) {
      const edge = x === 6 || y === 6 || x === 9 || y === 9;
      plot(t, x, y, on ? (edge ? 0xc40c0c : x + y < 15 ? 0xffb4a8 : 0xff2a1a) : edge ? 0x3f0806 : 0x5a0c0a);
    }
  return t;
}

/** vanilla observer_side.png: an arrow pressed into the stone, pointing to its face */
function observerSide(): TexImage {
  const t = observerBase('observer_side');
  for (let y = 3; y < 14; y++) {
    plot(t, 7, y, 0x383838);
    plot(t, 8, y, 0x484848);
  }
  for (let i = 0; i < 4; i++) {
    plot(t, 6 - i, 4 + i, 0x383838);
    plot(t, 9 + i, 4 + i, 0x484848);
    plot(t, 6 - i, 5 + i, 0x8a8a8a);
    plot(t, 9 + i, 5 + i, 0x8a8a8a);
  }
  return t;
}

/** vanilla observer_top.png: the stone ribbed across, three grooves */
function observerTop(): TexImage {
  const t = observerBase('observer_top');
  for (const y of [4, 8, 12])
    for (let x = 2; x < 14; x++) {
      plot(t, x, y - 1, 0x3c3c3c);
      plot(t, x, y, 0x848484);
    }
  return t;
}

/**
 * vanilla daylight_detector_top.png / daylight_detector_inverted_top.png: a quartz frame round nine panes, pale and
 * sky-lit on the normal one, deep blue on the inverted one, in a wooden rim
 */
function daylightTop(inverted: boolean): TexImage {
  const t = img();
  const r = R(inverted ? 'daylight_detector_inverted_top' : 'daylight_detector_top');
  const lines = [1, 5, 10, 14];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      let c: number;
      if (x === 0 || y === 0 || x === 15 || y === 15) c = x === 15 || y === 15 ? 0x5a4127 : 0x7d5d3a;
      else if (lines.includes(x) || lines.includes(y)) c = mixC(0xd8d0c4, 0xebe5dd, r.next());
      else {
        // (each pane lit from its top left)
        const cx = x < 5 ? 2 : x < 10 ? 6 : 11, cy = y < 5 ? 2 : y < 10 ? 6 : 11;
        const f = (x - cx + y - cy) / 7;
        c = inverted ? mixC(0x46607f, 0x2b3c52, f) : mixC(0xc4d6e2, 0x8ea5b8, f);
      }
      plot(t, x, y, c);
    }
  return t;
}

/** vanilla daylight_detector_side.png: its wooden case, the quartz of the top along the upper edge of the slab */
function daylightSide(planks: TexImage): TexImage {
  const t = planks;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) plot(t, x, y, mulC(getPx(t, x, y), 0.82));
  for (let x = 0; x < 16; x++) {
    plot(t, x, 10, 0xe2dbd0);
    plot(t, x, 11, 0x9a8f80);
    plot(t, x, 15, mulC(getPx(t, x, 15), 0.8));
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
  for (const dropper of [false, true])
    for (const vertical of [false, true]) G[`${dropper ? 'dropper' : 'dispenser'}_front${vertical ? '_vertical' : ''}`] = () => dispenserFront(dropper, vertical);
  G['tripwire_hook'] = tripwireHook;
  G['tripwire'] = tripwire;
  G['piston_top'] = () => pistonTop(G['oak_planks']());
  G['piston_top_sticky'] = () => pistonTopSticky(G['oak_planks']());
  G['piston_side'] = () => pistonSide(G['oak_planks'](), G['cobblestone']());
  G['piston_bottom'] = () => pistonBottom(G['cobblestone']());
  G['piston_inner'] = () => pistonInner(G['cobblestone']());
  G['comparator'] = () => comparatorTop(G['smooth_stone'](), false);
  G['comparator_on'] = () => comparatorTop(G['smooth_stone'](), true);
  G['hopper_outside'] = hopperOutside;
  G['hopper_inside'] = hopperInside;
  G['hopper_top'] = hopperTop;
  G['observer_front'] = observerFront;
  G['observer_back'] = () => observerBack(false);
  G['observer_back_on'] = () => observerBack(true);
  G['observer_side'] = observerSide;
  G['observer_top'] = observerTop;
  G['daylight_detector_top'] = () => daylightTop(false);
  G['daylight_detector_inverted_top'] = () => daylightTop(true);
  G['daylight_detector_side'] = () => daylightSide(G['oak_planks']());
}
