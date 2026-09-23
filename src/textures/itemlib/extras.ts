// Additional vanilla items beyond the core set: more foods, mob drops,
// materials, tools and block items that use flat item sprites.

import { TexImage, plot, getA, getPx } from '../tex';
import { Gen, Pal, spr, over, autoShade, maskFn, inEllipse, rng, paint, outline4 } from './common';
import { apple, carrotSprite, potato, melonSprite, fish, bowlRows, BOWL_PAL, SEEDS, CHICKEN_MASK } from './food';
import { blank } from './misc';

export const EXTRA_ITEMS: Record<string, Gen> = {};
const E = EXTRA_ITEMS;

// ---------------------------------------------------------------------------
// Food

E['enchanted_golden_apple'] = () =>
  apple([0x8a5a09, 0xb57f10, 0xdba81e, 0xf5d235, 0xfdeb5c, 0xfff9b0], 0x5a3905, 0xffffff, {
    '#': 0x4a2f04, s: 0x9c6d10, q: 0x4a2f04, g: 0xc99a1a, l: 0xf5d235,
  });
E['golden_carrot'] = () =>
  carrotSprite([0x8a5a09, 0xb57f10, 0xdba81e, 0xf5d235, 0xfdeb5c, 0xfff9b0], 0x5a3905, 0xb57f10, { q: 0x4a3a06, g: 0xb09a1a, l: 0xe8d24a });
E['glistering_melon_slice'] = () => {
  const t = melonSprite([0xb57f10, 0xf5d235, 0xfff3a0, 0x5a3905], [0xd63d33, 0xf05545, 0xff7a66], 0x1a0f0f);
  for (const [x, y] of [[7, 5], [10, 9], [4, 9], [12, 6]] as [number, number][]) plot(t, x, y, 0xfff8c0);
  return t;
};
E['poisonous_potato'] = () => potato([0x5e6a22, 0x7a8a30, 0x98a83e, 0xb0bc52, 0xc8d06a, 0xdce28a], 0x3a4212, 0x4a5a1a, 'poisonous_potato');

// Beetroot: round root with leaves and a thin tail
E['beetroot'] = () => {
  const t = autoShade(maskFn(inEllipse(7.6, 9.6, 4.6, 4.3)), [0x4e0a1a, 0x6e1026, 0x8e1a34, 0xa82440, 0xc43a54, 0xdc6070], 0x2e0610, {
    seed: 'beetroot', edge: 1.1, relief: 4,
  });
  over(t, [
    '......q..q......',
    '.....qgqqlq.....',
    '......qgslgq....',
    '.......qsqq.....',
    '........s.......',
  ], { q: 0x163d0d, g: 0x2f7d1b, l: 0x5fb535, s: 0x8e1a34 });
  plot(t, 9, 14, 0x6e1026);
  plot(t, 10, 15, 0x4e0a1a);
  return t;
};
E['beetroot_seeds'] = () => spr(SEEDS, { '#': 0x4a3418, a: 0xdcc49e, b: 0xb8986a, c: 0x8a6a42 }, 'beetroot_seeds');
E['pumpkin_seeds'] = () => spr(SEEDS, { '#': 0x6a5e34, a: 0xfaf2cc, b: 0xe2d6a0, c: 0xbcad72 }, 'pumpkin_seeds');
E['melon_seeds'] = () => spr(SEEDS, { '#': 0x0e0a06, a: 0x6a4c30, b: 0x44301e, c: 0x2a1c10 }, 'melon_seeds');
E['torchflower_seeds'] = () => spr(SEEDS, { '#': 0x3a2a10, a: 0xd8b060, b: 0xa8803a, c: 0x6a5020 }, 'torchflower_seeds');

function stew(colors: Pal, rows: string[], name: string): TexImage {
  const t = spr(bowlRows(), BOWL_PAL, name);
  over(t, ['', '', '', '', '', '', '', '', ...rows], colors);
  return t;
}
E['beetroot_soup'] = () => stew({ s: 0x8e1424, S: 0xb42234, m: 0xd8485a }, ['...sSsmSssSs....', '....sSssSmss....'], 'beetroot_soup');
E['rabbit_stew'] = () =>
  stew({ s: 0x7a4a24, S: 0x94602e, c: 0xef8a1a, p: 0xe8d090, m: 0xd8c4a8 }, ['...sScsSpssc....', '....spSsScsS....'], 'rabbit_stew');
E['suspicious_stew'] = () =>
  stew({ s: 0x6e5a2a, S: 0x8a7236, r: 0xd83a3a, y: 0xf0d040, m: 0xd8c4a8 }, ['...sSsrSssyS....', '....sSmsSrsS....'], 'suspicious_stew');

// Pumpkin pie: round pie seen from above-front
// prettier-ignore
const PIE = [
  '................',
  '................',
  '................',
  '................',
  '....########....',
  '..##cCCCCCCc##..',
  '.#cCooooooooCc#.',
  '#cCooOOoooOooCc#',
  '#cCoooooOoooOCc#',
  '#ccCooooooooCcc#',
  '#bccCCCCCCCCccb#',
  '#bbbbbbbbbbbbbb#',
  '.#BBBBBBBBBBBB#.',
  '..############..',
  '................',
  '................',
];
E['pumpkin_pie'] = () =>
  spr(PIE, { '#': 0x4a2a0e, c: 0xc89048, C: 0xe0ac60, o: 0xe07a1e, O: 0xf09a3a, b: 0xb07838, B: 0x8a5a26 }, 'pumpkin_pie');

// Cake item
// prettier-ignore
const CAKE = [
  '................',
  '................',
  '................',
  '....########....',
  '..##wwwwwwww##..',
  '.#wwwrwwwwrwww#.',
  '.#wwwwwwwwwwww#.',
  '.#WWwWWwwWWwWW#.',
  '.#bbWbbWbbbWbb#.',
  '.#BBBBBBBBBBBB#.',
  '.#bbbbbbbbbbbb#.',
  '.#BBBBBBBBBBBB#.',
  '.##############.',
  '................',
  '................',
  '................',
];
E['cake'] = () => spr(CAKE, { '#': 0x3a2410, w: 0xf8f8f8, W: 0xdcdcdc, r: 0xd82020, b: 0xb87a3a, B: 0x9a6230 }, 'cake');

E['dried_kelp'] = () =>
  spr([
    '................',
    '................',
    '..........##....',
    '.........#gG#...',
    '........#gGg#...',
    '.......#gGg#....',
    '......#ggGg#....',
    '.....#gGgg#.....',
    '.....#gGg#......',
    '....#gGgg#......',
    '....#gGg#.......',
    '...#ggGg#.......',
    '...#gGg#........',
    '....###.........',
    '................',
    '................',
  ], { '#': 0x1a2410, g: 0x3a4a22, G: 0x56682e }, 'dried_kelp');

// Rabbit meat (smaller drumstick-shaped body)
E['rabbit'] = () =>
  autoShade(CHICKEN_MASK.map((r) => r.replace(/[bB]/g, '.')), [0xa86a5a, 0xc07e6c, 0xd49482, 0xe4aa98, 0xf0c2b2, 0xfcdcd0], 0x5e3428, {
    seed: 'rabbit', edge: 1.1, relief: 3,
  });
E['cooked_rabbit'] = () =>
  autoShade(CHICKEN_MASK.map((r) => r.replace(/[bB]/g, '.')), [0x5a3014, 0x74401c, 0x8e5224, 0xa6662e, 0xbc7c3c, 0xd09450], 0x301806, {
    seed: 'cooked_rabbit', edge: 1.1, relief: 3,
  });

// Spider eyes
function spiderEye(ramp: number[], o: number, seed: string): TexImage {
  const t = autoShade(maskFn(inEllipse(8, 9, 5.2, 4.4)), ramp, o, { seed, edge: 1.1, relief: 4 });
  over(t, ['', '', '', '', '', '', '', '.......kk.......', '......kkkk......', '.......kk.......', '.....w..........'], { k: 0x1a0808, w: 0xffe0e0 });
  plot(t, 6, 6, 0xffc8c8);
  return t;
}
E['spider_eye'] = () => spiderEye([0x5e0e18, 0x80162a, 0xa0223a, 0xbe344c, 0xd65464, 0xea7c86], 0x30060c, 'spider_eye');
E['fermented_spider_eye'] = () => {
  const t = spiderEye([0x4e1a14, 0x6a241c, 0x8a3226, 0xa44434, 0xba5a48, 0xcc7462], 0x2a0c08, 'fermented_spider_eye');
  over(t, ['.....##.........', '....#mm#........', '...#mMMm#.......', '....#ss#........', '.....##.........'], { '#': 0x3a2410, m: 0x9a6a3a, M: 0xc08a50, s: 0xd8c8a8 });
  return t;
};

// Fish extras
E['tropical_fish'] = () => {
  const t = fish({ o: 0x4a1e06, back: 0xf07a14, spot: 0xf8f8f8, side: 0xf49a2a, belly: 0xfac070, fin: 0xf8f8f8, finD: 0xd8d8d8 }, 'tropical_fish', false);
  for (const [x, y] of [[6, 8], [7, 9], [8, 10], [9, 5], [10, 6], [11, 7]] as [number, number][]) if (getA(t, x, y) && getPx(t, x, y) !== 0x4a1e06) plot(t, x, y, 0xf8f8f8);
  return t;
};
// prettier-ignore
const PUFFER = [
  '................',
  '................',
  '....#..#..#.....',
  '.....#.#.#......',
  '...#.######.#...',
  '....#yyyyyy#....',
  '..##yYYYYYyy##..',
  '...#yYwkYYYy#.##',
  '.##yYYwwYYYyy#y#',
  '...#yYYYYYYy#.##',
  '...#yyYYYYyy#...',
  '..#.#yyyyyy#.#..',
  '.....######.....',
  '....#..#..#.....',
  '................',
  '................',
];
E['pufferfish'] = () => spr(PUFFER, { '#': 0x4a3a08, y: 0xc8a018, Y: 0xf0d040, w: 0xf8f8f0, k: 0x101010 }, 'pufferfish');

// Chorus fruit
// prettier-ignore
const CHORUS_MASK = [
  '................',
  '................',
  '.....XXX........',
  '....XXXXX.XXX...',
  '...XXXXXXcXXXX..',
  '...XXXXXcXXXXX..',
  '..XXXXXcXXXXXX..',
  '..XXXXcccXXXXXX.',
  '.XXXXcXXXcXXXXX.',
  '.XXXcXXXXXcXXXX.',
  '..XXXXXXXXXXXX..',
  '...XXXXXXXXXXX..',
  '....XXXXXXXXX...',
  '......XXXXX.....',
  '................',
  '................',
];
E['chorus_fruit'] = () =>
  autoShade(CHORUS_MASK, [0x3e1e4e, 0x5a2e6e, 0x7a4290, 0x9a5ab0, 0xb87ac8, 0xd4a0e0], 0x220c2c, {
    seed: 'chorus', edge: 1.3, relief: 2, low: 'c', extra: { c: 0x3e1e4e }, cluster: 0.2,
  });
E['popped_chorus_fruit'] = () => {
  const t = autoShade(CHORUS_MASK, [0x6a4a7a, 0x8a6a9a, 0xa888b8, 0xc4a8d2, 0xdcc6e6, 0xf0e2f6], 0x3a2448, {
    seed: 'popped_chorus', edge: 1.3, relief: 2, low: 'c', extra: { c: 0x6a4a7a }, cluster: 0.2,
  });
  const r = rng('popped');
  paint(t, (x, y, c) => (c !== 0x3a2448 && r.chance(0.15) ? 0x5a3a6a : undefined));
  return t;
};

// Glow berries: glowing orange berries on a vine
// prettier-ignore
const GLOW_BERRIES = [
  '................',
  '.......q........',
  '......qgq.......',
  '.......gq.......',
  '....###gq###....',
  '...#5543g#54#...',
  '..#544432#543#..',
  '..#443322#4322#.',
  '..#432211#3221#.',
  '...#2111##2211#.',
  '....####q.####..',
  '.......#g##.....',
  '......#5543#....',
  '......#44322#...',
  '.......#3211#...',
  '........####....',
];
E['glow_berries'] = () =>
  spr(GLOW_BERRIES, { '#': 0x5a2a04, 1: 0xb05a08, 2: 0xd87a10, 3: 0xf09a1e, 4: 0xfcc040, 5: 0xfff0a0, q: 0x1f4a12, g: 0x3e7a24 }, 'glow_berries');

// ---------------------------------------------------------------------------
// Materials and mob drops

function ballOf(r: number, ramp: number[], o: number, seed: string): TexImage {
  return autoShade(maskFn(inEllipse(8, 8.5, r, r)), ramp, o, { seed, edge: 1.1, relief: 4 });
}
E['magma_cream'] = () => {
  const t = ballOf(4.8, [0x6a1a06, 0x9a2a08, 0xc84a10, 0xe8741e, 0xf8a030, 0xffd060], 0x3a0e02, 'magma_cream');
  for (const [x, y] of [[6, 7], [9, 10], [10, 7], [7, 11]] as [number, number][]) plot(t, x, y, 0xfff080);
  return t;
};
E['ender_eye'] = () => {
  const t = ballOf(5.2, [0x0a3a22, 0x125032, 0x1a6c44, 0x2a8a58, 0x44aa70, 0x7ad09a], 0x04200e, 'ender_eye');
  over(t, ['', '', '', '', '', '.......yy.......', '......yyyy......', '......ykky......', '......ykky......', '......yyyy......', '.......yy.......'], { y: 0x9ad83a, k: 0x0a1a06 });
  plot(t, 5, 6, 0xc8f0d4);
  return t;
};
E['fire_charge'] = () => {
  const t = ballOf(5.2, [0x1a0e08, 0x2a160c, 0x3a2012, 0x4e2c18, 0x6a3a1e, 0x8a4a22], 0x0a0402, 'fire_charge');
  for (const [x, y, c] of [[6, 6, 0xf8c030], [7, 7, 0xf07a1e], [10, 6, 0xf07a1e], [9, 9, 0xf8c030], [5, 10, 0xd84a10], [8, 11, 0xf07a1e], [11, 9, 0xd84a10]] as [number, number, number][])
    plot(t, x, y, c);
  return t;
};
E['firework_star'] = () => {
  const t = ballOf(4.6, [0x3a3a3a, 0x505050, 0x686868, 0x808080, 0x9a9a9a, 0xb8b8b8], 0x1e1e1e, 'firework_star');
  for (const [x, y] of [[6, 7], [9, 6], [10, 10], [7, 10]] as [number, number][]) plot(t, x, y, 0x2a2a2a);
  return t;
};
E['heart_of_the_sea'] = () => {
  const t = ballOf(5.4, [0x0a2a5a, 0x103c7a, 0x18549a, 0x2470bc, 0x3a92d8, 0x7ac4f0], 0x061634, 'heart_of_the_sea');
  over(t, ['', '', '', '', '', '', '......cCc.......', '.....cCWCc......', '......cCc.......'], { c: 0x3ab8e0, C: 0x8ae4f8, W: 0xffffff });
  return t;
};
E['ghast_tear'] = () => {
  const m = maskFn((x, y) => {
    const dy = y - 10;
    if (y < 3) return false;
    const w = dy < 0 ? (y - 3) * 0.55 : Math.sqrt(Math.max(0, 16 - dy * dy)) * 0.95;
    return Math.abs(x - 8) <= w;
  });
  return autoShade(m, [0x9ab4c4, 0xb4ccd8, 0xcce0ea, 0xe0eef4, 0xf2f8fb, 0xffffff], 0x5e7482, { seed: 'ghast_tear', edge: 1.1, relief: 3 });
};

// Nether star: eight-pointed glowing star
// prettier-ignore
const STAR = [
  '................',
  '.......##.......',
  '.......#w#......',
  '..##...#w#...##.',
  '..#wy..#w#..yw#.',
  '...#wy#www#yw#..',
  '....#wwwwwww#...',
  '.####wwwWwwww###',
  '#wwwwwWWWWwwwww#',
  '.###wwwwWwwww##.',
  '....#wwwwwww#...',
  '...#wy#www#yw#..',
  '..#wy..#w#..yw#.',
  '..##...#w#...##.',
  '.......#w#......',
  '.......##.......',
];
E['nether_star'] = () => spr(STAR, { '#': 0x8a8a70, w: 0xf2f2e6, W: 0xffffff, y: 0xe8e0a0 }, 'nether_star');

// Shards and crystals
// prettier-ignore
const SHARD = [
  '................',
  '................',
  '..........##....',
  '.........#65#...',
  '........#6543#..',
  '.......#65433#..',
  '......#654332#..',
  '.....#5543322#..',
  '....#55433221#..',
  '...#454332211#..',
  '..#4443322211#..',
  '..#3433222111#..',
  '...#32221111#...',
  '....##11111#....',
  '......#####.....',
  '................',
];
E['prismarine_shard'] = () =>
  spr(SHARD, { '#': 0x1a3a36, 1: 0x2e5e56, 2: 0x3e7a70, 3: 0x5a9a8e, 4: 0x7ab8aa, 5: 0x9ad2c4, 6: 0xc8f0e6 }, 'prismarine_shard');
E['echo_shard'] = () =>
  spr(SHARD, { '#': 0x041414, 1: 0x0a2a2a, 2: 0x0e3a3c, 3: 0x145250, 4: 0x1c6e6a, 5: 0x2a9a92, 6: 0x5ae0d4 }, 'echo_shard');
E['netherite_scrap'] = () =>
  autoShade(
    ['................', '................', '.....XXXX.......', '...XXXXXXXX.....', '..XXXXXcXXXXX...', '..XXXXcXXXXXXX..', '.XXXXcXXXXXXXX..', '.XXXXXcccXXXXX..', '.XXXXXXXXcXXXX..', '..XXXXXXXXcXXX..', '..XXXXXXXXXXX...', '...XXXXXXXXX....', '.....XXXXX......', '................', '................', '................'],
    [0x2a1e1a, 0x3a2a24, 0x4e3a30, 0x644a3c, 0x7a5c4a, 0x94725c], 0x140e0c, { seed: 'netherite_scrap', edge: 1.3, relief: 2, low: 'c', extra: { c: 0x2a1e1a }, cluster: 0.3 },
  );

// prettier-ignore
const CRYSTALS = [
  '................',
  '................',
  '..........#.....',
  '.........#w#....',
  '....#....#w#.#..',
  '...#w#..#wc#.#w#',
  '...#wc#.#wc##wc#',
  '..#wwc#.#wcc#wc#',
  '..#wcc##wwcc#cc#',
  '.#wwcc#wwcccc#c#',
  '.#wccc#wwcccc##.',
  '..#ccc#wccccc#..',
  '...###.#cccc#...',
  '........####....',
  '................',
  '................',
];
E['prismarine_crystals'] = () => spr(CRYSTALS, { '#': 0x3a6a62, w: 0xf2fcf8, c: 0xb4e6d8 }, 'prismarine_crystals');

// Small hides and feet
// prettier-ignore
const HIDE = [
  '................',
  '................',
  '................',
  '...XX......XX...',
  '...XXXXXXXXXX...',
  '....XXXXXXXX....',
  '....XXXXXXXX....',
  '...XXXXXXXXXX...',
  '...XXXXXXXXXX...',
  '....XXXXXXXX....',
  '....XXXXXXXX....',
  '...XXXXXXXXXX...',
  '...XX......XX...',
  '................',
  '................',
  '................',
];
E['rabbit_hide'] = () =>
  autoShade(HIDE, [0x6a4a2e, 0x86603c, 0xa07a4c, 0xb8925e, 0xccaa74, 0xdcc290], 0x3e2a18, {
    seed: 'rabbit_hide', edge: 1.1, relief: 2, cluster: 0.25, cell: 4,
  });
E['rabbit_foot'] = () =>
  spr([
    '................',
    '..........###...',
    '.........#544#..',
    '........#5443#..',
    '.......#54432#..',
    '......#54432#...',
    '.....#54432#....',
    '....#54432#.....',
    '...#544321#.....',
    '..#w443321#.....',
    '.#ww44321#......',
    '.#www3211#......',
    '.#wWw#11#.......',
    '..#w#.##........',
    '...#............',
    '................',
  ], { '#': 0x3a2814, 1: 0x6a4a2a, 2: 0x86603a, 3: 0xa07a4c, 4: 0xbc9660, 5: 0xd4b27c, w: 0xf0e8d8, W: 0xd0c4b0 }, 'rabbit_foot');
E['phantom_membrane'] = () =>
  spr([
    '................',
    '................',
    '..#..........#..',
    '.#m#........#m#.',
    '.#mm#......#mm#.',
    '.#mMm#....#mMm#.',
    '.#mMMm####mMMm#.',
    '.#mMMMmmmmMMMm#.',
    '..#mMMMMMMMMm#..',
    '..#mmMMMMMMmm#..',
    '...#mmMMMMmm#...',
    '....#mmmmmm#....',
    '.....######.....',
    '................',
    '................',
    '................',
  ], { '#': 0x4a4a3a, m: 0x9a9a82, M: 0xc4c4aa }, 'phantom_membrane');

// Nautilus shell: spiral
// prettier-ignore
const NAUTILUS = [
  '................',
  '................',
  '.....######.....',
  '....#pPPPPp#....',
  '...#pPbbbbPp#...',
  '..#pPb####bPp#..',
  '..#pb#pPPp#bp#..',
  '..#Pb#Pb#Pb#bP#.',
  '..#Pb#Pbb#b#bP#.',
  '..#pPb#PPP#bp#..',
  '...#pPb###bPp#..',
  '....#pPbbbPp#...',
  '.....#ppppp#....',
  '......#####.....',
  '................',
  '................',
];
E['nautilus_shell'] = () => spr(NAUTILUS, { '#': 0x6a4a3a, p: 0xf0e0d0, P: 0xfaf0e6, b: 0xb07a5a }, 'nautilus_shell');

// Honeycomb
// prettier-ignore
const HONEYCOMB = [
  '................',
  '................',
  '....########....',
  '...#hHhhHhhh#...',
  '..#hHkhhkhHkh#..',
  '..#hkhHhhkhhh#..',
  '.#hhhkhhHkhhkh#.',
  '.#Hkhhhkhhhkhh#.',
  '.#hhkHhhkhHhhk#.',
  '.#hkhhhkhhhkhh#.',
  '..#hhkhhhkhhh#..',
  '..#hkhHkhhhkh#..',
  '...#hhhhkhhh#...',
  '....########....',
  '................',
  '................',
];
E['honeycomb'] = () => spr(HONEYCOMB, { '#': 0x6a3e06, h: 0xf0a81e, H: 0xfcd050, k: 0xb8700e }, 'honeycomb');

// Shulker shell: two halves of a purple dome
E['shulker_shell'] = () =>
  spr([
    '................',
    '................',
    '.....######.....',
    '...##pPPPPp##...',
    '..#pPPPPPPPPp#..',
    '..#pPPPPPPPPp#..',
    '.#pppPPPPPPppp#.',
    '.#dddddddddddd#.',
    '.#pPPPPPPPPPPp#.',
    '.#pppppppppppp#.',
    '..############..',
    '................',
    '................',
    '................',
    '................',
    '................',
  ], { '#': 0x2e1a34, p: 0x8a5a92, P: 0xa878b0, d: 0x4a2a52 }, 'shulker_shell');

E['turtle_scute'] = () =>
  spr([
    '................',
    '................',
    '................',
    '.....######.....',
    '....#gGGGGg#....',
    '...#gGggggGg#...',
    '..#gGgGGGGgGg#..',
    '..#gGgGllGgGg#..',
    '..#gGgGllGgGg#..',
    '..#gGgGGGGgGg#..',
    '...#gGggggGg#...',
    '....#gggggg#....',
    '.....######.....',
    '................',
    '................',
    '................',
  ], { '#': 0x1a3a12, g: 0x3a7a2a, G: 0x52a03a, l: 0x8ad06a }, 'turtle_scute');
E['scute'] = E['turtle_scute'];

// Blaze powder / other powders
// prettier-ignore
const POWDER = [
  '................',
  '................',
  '................',
  '................',
  '........XX......',
  '......XXXXX.....',
  '.....XXXXXXX....',
  '....XXXXXXXXXX..',
  '...XXXXXXXXXXX..',
  '..XXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '..XXXXXXXXXXXX..',
  '................',
  '................',
  '................',
];
E['blaze_powder'] = () => {
  const t = autoShade(POWDER, [0xb05a08, 0xd87a10, 0xf09a1e, 0xfcc040, 0xfff08a], 0x5a2a04, { seed: 'blaze_powder', edge: 1.2, relief: 3, cluster: 0.25, cell: 3 });
  for (const [x, y] of [[3, 6], [13, 5], [1, 14], [14, 14], [11, 3]] as [number, number][]) plot(t, x, y, 0xf09a1e);
  return t;
};

// Glow ink sac (recoloured ink sac shape)
// prettier-ignore
const SAC = [
  '................',
  '................',
  '.......###......',
  '......#545#.....',
  '.......#4#......',
  '.....##434##....',
  '....#5443332#...',
  '...#544433322#..',
  '...#544333222#..',
  '..#54433322211#.',
  '..#44333322111#.',
  '..#43332221111#.',
  '...#322211111#..',
  '....##111111#...',
  '......######....',
  '................',
];
E['glow_ink_sac'] = () =>
  spr(SAC, { '#': 0x06201e, 1: 0x0c3a36, 2: 0x145a52, 3: 0x1e7a70, 4: 0x3aa89a, 5: 0x8ae8d8 }, 'glow_ink_sac');

// Nether brick item (same pose as the ingots)
// prettier-ignore
export const BAR = [
  '................',
  '................',
  '................',
  '...........###..',
  '.........##554#.',
  '.......##55444#.',
  '.....##5544443#.',
  '...##554444322#.',
  '.##55444433211#.',
  '#3444443322111#.',
  '#33443322111##..',
  '#3332221111#....',
  '.#222111###.....',
  '..#1111#........',
  '...####.........',
  '................',
];
E['nether_brick'] = () =>
  spr(BAR, { '#': 0x14080a, 1: 0x2a1014, 2: 0x3a161c, 3: 0x4a1e24, 4: 0x5e282e, 5: 0x74363a }, 'nether_brick');

// Firework rocket: red paper tube pointing up-right with a stick
E['firework_rocket'] = () => {
  const t = blank();
  const put = (u: number, s: number, c: number) => {
    if ((u + s) % 2 === 0) plot(t, (u + s) / 2, (u - s) / 2, c);
  };
  for (let s = -2; s <= 6; s++)
    for (const [u, c] of [[13, 0xe84a3a], [14, 0xd83a2a], [15, 0xc02a1e], [16, 0xa01e16], [17, 0x7e1610]] as [number, number][]) put(u, s, c);
  for (const u of [13, 14, 15, 16, 17]) put(u, 2, 0xf2f2f2), put(u, 3, 0xf2f2f2);
  for (let s = 7; s <= 9; s++) for (const u of [14, 15, 16]) if (s < 9 || u === 15) put(u, s, s === 9 ? 0x8a8a8a : 0xb0b0b0);
  for (let s = -10; s <= -3; s++) put(15, s, 0x8a6a3a);
  outline4(t, 0x2a0a06);
  return t;
};

// Totem of undying: small golden figure with emerald eyes
// prettier-ignore
const TOTEM = [
  '................',
  '.....######.....',
  '....#yYYYYy#....',
  '....#YeYYeY#....',
  '....#yYYYYy#....',
  '..###yyyyyy###..',
  '.#yYY#yggy#YYy#.',
  '.#yyy#YYYY#yyy#.',
  '..###yYYYYy###..',
  '....#yYyyYy#....',
  '....#yYyyYy#....',
  '....#yyyyyy#....',
  '.....#yy#yy#....',
  '.....#yy#yy#....',
  '......##.##.....',
  '................',
];
E['totem_of_undying'] = () => spr(TOTEM, { '#': 0x5a3a06, y: 0xd8a820, Y: 0xf6d84a, e: 0x1e9a4a, g: 0x2ec85a }, 'totem_of_undying');


// ---------------------------------------------------------------------------
// Tools and utility items

function diag(t: TexImage, u: number, s: number, c: number): void {
  if ((u + s) % 2 === 0) plot(t, (u + s) / 2, (u - s) / 2, c);
}

/** Crossbow: stock along the diagonal, long curved limbs across it near the front. */
function crossbow(pull: number, load: 'none' | 'arrow' | 'firework'): TexImage {
  const t = blank();
  const limbS = (u: number) => Math.round(4 - 3 * Math.pow((u - 15) / 8, 2));
  // stock
  for (let s = -12; s <= 6; s++) {
    diag(t, 15, s, s < -7 ? 0x6b4f24 : 0x9a7440);
    diag(t, 16, s, s < -7 ? 0x4f3a18 : 0x7a5a2e);
  }
  diag(t, 17, -3, 0x4a4a4a); // trigger
  // limbs
  for (let u = 7; u <= 23; u++) {
    const sc = limbS(u);
    const band = u >= 14 && u <= 17;
    for (const ds of [0, 1, 2]) diag(t, u, sc + ds, band ? (ds === 2 ? 0xb0b0b0 : 0x7a7a7a) : ds === 2 ? 0x8a6a42 : ds === 1 ? 0x6a5030 : 0x4a3820);
  }
  outline4(t, 0x1e140a);
  // string between the limb tips; pulled back to the nock when loaded
  const nockS = 1 - pull * 1.5;
  for (let u = 8; u <= 22; u++) {
    const k = Math.abs(u - 15) / 7;
    const s = Math.round(nockS + (limbS(u < 15 ? 8 : 22) - nockS) * k);
    diag(t, u, s, 0xd8d8d8);
  }
  if (load === 'arrow') {
    for (let s = Math.ceil(nockS) + 1; s <= 10; s++) diag(t, 15, s, s >= 9 ? 0xe0e0e0 : 0xb89868);
    diag(t, 14, 9, 0x8a8a8a);
    diag(t, 16, 9, 0x8a8a8a);
  } else if (load === 'firework') {
    for (let s = Math.ceil(nockS) + 1; s <= 9; s++) for (const u of [14, 15, 16]) diag(t, u, s, s >= 8 ? 0xf2f2f2 : u === 14 ? 0xe84a3a : 0xb02a1e);
  }
  return t;
}
E['crossbow'] = () => crossbow(0, 'none');
E['crossbow_standby'] = E['crossbow'];
E['crossbow_pulling_0'] = () => crossbow(1, 'none');
E['crossbow_pulling_1'] = () => crossbow(2, 'none');
E['crossbow_pulling_2'] = () => crossbow(3, 'none');
E['crossbow_arrow'] = () => crossbow(3, 'arrow');
E['crossbow_firework'] = () => crossbow(3, 'firework');

// Spyglass: copper tube with a leather grip and a glass lens
E['spyglass'] = () => {
  const t = blank();
  for (let s = -9; s <= 9; s++) {
    const front = s >= 3;
    const grip = s >= -4 && s <= 0;
    const cols = grip ? [0x5a3a1e, 0x4a3018, 0x3a2410] : front ? [0xf0aa7a, 0xd88256, 0xb06238] : [0xe89a68, 0xc87248, 0x9a5230];
    const us = front ? [13, 14, 15, 16, 17] : [14, 15, 16];
    us.forEach((u, i) => diag(t, u, s, cols[Math.min(2, Math.floor((i * 3) / us.length))]));
  }
  for (const u of [14, 15, 16]) diag(t, u, 10, 0xa8dcf0);
  diag(t, 15, 10, 0xe0f6ff);
  outline4(t, 0x3a1c0c);
  return t;
};

// Fishing-rod style items with a lure
function rodWith(lure: string[], pal: Pal): TexImage {
  const t = blank();
  for (let s = -12; s <= 10; s++) {
    diag(t, 15, s, s < -4 ? 0x896727 : 0x7a5a24);
    if (s <= -3) diag(t, 16, s, 0x684e1e);
  }
  outline4(t, 0x28190a);
  plot(t, 3, 12, 0x4a4a4a);
  plot(t, 2, 13, 0x4a4a4a);
  for (let y = 3; y <= 9; y++) plot(t, 13, y, y % 2 ? 0xe0e0e0 : 0xbdbdbd);
  over(t, lure, pal);
  return t;
}
E['carrot_on_a_stick'] = () =>
  rodWith(['', '', '', '', '', '', '', '', '', '..........qglq..', '..........#oo#..', '...........#oo#.', '...........#o#..', '............#...'], {
    q: 0x163d0d, g: 0x2f7d1b, l: 0x5fb535, o: 0xef8a1a, '#': 0x4a2203,
  });
E['warped_fungus_on_a_stick'] = () =>
  rodWith(['', '', '', '', '', '', '', '', '', '...........##...', '..........#cCc#.', '.........#cCCCc#', '..........##s##.', '............s...'], {
    c: 0x167a6e, C: 0x24a894, s: 0xd07a3a, '#': 0x0a3a34,
  });

// Books
// prettier-ignore
const BOOK2 = [
  '................',
  '................',
  '.....#########..',
  '....#5544444432#',
  '...#5444444433##',
  '..#5444444433#p#',
  '.#5444444433#pP#',
  '#5444444433#pP#.',
  '#444444433#pP#..',
  '#33333333#pP#...',
  '#2222222#pP#....',
  '#1111111#P#.....',
  '.#######.#......',
  '................',
  '................',
  '................',
];
function bookOf(c: number[], o: number, name: string): TexImage {
  return spr(BOOK2, { '#': o, 1: c[0], 2: c[1], 3: c[2], 4: c[3], 5: c[4], p: 0xe8e2cc, P: 0xc8c0a4 }, name);
}
E['enchanted_book'] = () => {
  const t = bookOf([0x3a1a4e, 0x52246a, 0x6a3088, 0x8440a4, 0xa45ac0], 0x1e0a2a, 'enchanted_book');
  for (const [x, y] of [[5, 6], [7, 4], [4, 8], [8, 6]] as [number, number][]) plot(t, x, y, 0xe8c83a);
  return t;
};
E['written_book'] = () => {
  const t = bookOf([0x3e2412, 0x563218, 0x6e421f, 0x865426, 0x9e6a34], 0x1e1008, 'written_book');
  for (const [x, y] of [[5, 5], [6, 5], [4, 7], [5, 7], [7, 7]] as [number, number][]) plot(t, x, y, 0xe8d8a0);
  return t;
};
E['knowledge_book'] = () => {
  const t = bookOf([0x5a0e0e, 0x7a1616, 0x9a2020, 0xb82c2c, 0xd04040], 0x2a0606, 'knowledge_book');
  for (const [x, y] of [[4, 6], [6, 6], [5, 7]] as [number, number][]) plot(t, x, y, 0xf0d040);
  return t;
};
E['writable_book'] = () => {
  const t = spr(BOOK2, { '#': 0x2e1408, 1: 0x4e2410, 2: 0x6a3218, 3: 0x843f1f, 4: 0x9e4e26, 5: 0xb8683a, p: 0xe8e2cc, P: 0xc8c0a4 }, 'writable_book');
  over(t, [
    '.............##.',
    '............#wW#',
    '...........#wW#.',
    '..........#wW#..',
    '.........#wW#...',
    '........#wW#....',
    '.......#wW#.....',
    '......#kW#......',
    '.......#........',
  ], { '#': 0x3a3a3a, w: 0xffffff, W: 0xd0d0d0, k: 0x101010 });
  return t;
};

// Brush: handle with a feathery head
E['brush'] = () => {
  const t = blank();
  for (let s = -11; s <= 1; s++) {
    diag(t, 15, s, 0x896727);
    diag(t, 16, s, 0x684e1e);
  }
  for (let s = 2; s <= 3; s++) for (const u of [14, 15, 16, 17]) diag(t, u, s, 0xc87248);
  for (let s = 4; s <= 9; s++)
    for (let u = 12; u <= 19; u++) {
      const half = 1.8 + (s - 4) * 0.45;
      if (Math.abs(u - 15.5) <= half && s < 9 + (Math.abs(u - 15.5) < 1.5 ? 1 : 0)) diag(t, u, s, (u + s) % 4 === 0 ? 0xc8b08a : 0xe8d8b8);
    }
  outline4(t, 0x3a2a14);
  return t;
};

// Recovery compass: dark casing, teal needle
// prettier-ignore
const DIAL2 = [
  '................',
  '................',
  '.....######.....',
  '....#rrrrrR#....',
  '...#rRffffRR#...',
  '..#rRffffffRq#..',
  '..#rffffffffq#..',
  '..#rffffffffq#..',
  '..#rffffffffq#..',
  '..#rffffffffq#..',
  '..#rRffffffRq#..',
  '...#RRffffRq#...',
  '....#Rqqqqq#....',
  '.....######.....',
  '................',
  '................',
];
E['recovery_compass'] = () => {
  const t = spr(DIAL2, { '#': 0x0a1414, r: 0x3a5a5a, R: 0x2a4444, q: 0x1a2e2e, f: 0x0e1e22 }, 'recovery_compass');
  over(t, ['', '', '', '', '', '..........e.....', '.........eE.....', '........eE......', '.......wd.......', '......ww........', '.....w..........'], { e: 0x1a9a8a, E: 0x5ae0d0, w: 0x6a8a8a, d: 0x4a6a6a });
  return t;
};

// Trident (flat inventory sprite)
E['trident'] = () => {
  const t = blank();
  for (let s = -12; s <= 4; s++) {
    diag(t, 15, s, s < -9 ? 0x3a5a5a : 0x5a8a86);
    diag(t, 16, s, s < -9 ? 0x2a4444 : 0x3e6a66);
  }
  // prongs
  for (let s = 5; s <= 10; s++) diag(t, 15, s, 0xa8d8d0), diag(t, 16, s, 0x7ab8b0);
  for (let s = 3; s <= 7; s++) diag(t, 11, s, 0xa8d8d0), diag(t, 20, s, 0x7ab8b0);
  for (let u = 11; u <= 20; u++) diag(t, u, 3, 0x7ab8b0), diag(t, u, 4, 0x5a9a92);
  outline4(t, 0x0e2a28);
  return t;
};

// Goat horn
E['goat_horn'] = () =>
  spr([
    '................',
    '................',
    '..........###...',
    '.........#554#..',
    '........#5443#..',
    '.......#5443#...',
    '......#5443#....',
    '.....#5443#.....',
    '....#5443#......',
    '...#5443#.......',
    '..#5443#........',
    '..#443#.........',
    '..#332#.........',
    '...#221#........',
    '....###.........',
    '................',
  ], { '#': 0x4a4238, 1: 0x6a6052, 2: 0x8a7e6c, 3: 0xa89c88, 4: 0xc8bea8, 5: 0xe4dcc8 }, 'goat_horn');

// Mace: heavy spiked head on a short handle
E['mace'] = () => {
  const t = blank();
  for (let s = -12; s <= 1; s++) {
    diag(t, 15, s, 0x896727);
    diag(t, 16, s, 0x684e1e);
  }
  const head = inEllipse(11, 4.6, 3.4, 3.4);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) if (head(x + 0.5, y + 0.5)) plot(t, x, y, x + y < 15 ? 0x8a8a8a : 0x5e5e5e);
  for (const [x, y] of [[11, 0], [15, 4], [7, 5], [11, 9], [14, 1], [8, 2]] as [number, number][]) plot(t, x, y, 0x4a4a4a);
  outline4(t, 0x1e1e1e);
  plot(t, 10, 3, 0xd8d8d8);
  return t;
};

// Horse armor: armoured horse head in profile
// prettier-ignore
const HORSE_ARMOR = [
  '................',
  '................',
  '..........##....',
  '.........#54#...',
  '........#5443##.',
  '.......#544443 3#',
  '......#5444433 32#',
  '.....#54443333322#',
  '....#5443333332 21#',
  '...#544333##3222 1#',
  '..#54433#..#32211#',
  '.#5443#.....#2211#',
  '.#443#.......#11#.',
  '..#3#.........##..',
  '...#............. ',
  '................',
];
const HORSE_ROWS = HORSE_ARMOR.map((r) => r.replace(/ /g, '').slice(0, 16).padEnd(16, '.'));
for (const [m, ramp] of Object.entries({
  leather: [0x3a2414, 0x5a3620, 0x74462a, 0x8c5836, 0xa06540, 0xb67c56],
  iron: [0x363636, 0x686868, 0x8a8a8a, 0xacacac, 0xc8c8c8, 0xe8e8e8],
  golden: [0x5c3a06, 0x9c640a, 0xc28a12, 0xe0b022, 0xf6d238, 0xfdea5c],
  diamond: [0x0c3a32, 0x14705f, 0x1c937f, 0x2cbba2, 0x44dcc6, 0x78f2e0],
} as Record<string, number[]>))
  E[`${m}_horse_armor`] = () =>
    spr(HORSE_ROWS, { '#': ramp[0], 1: ramp[1], 2: ramp[2], 3: ramp[3], 4: ramp[4], 5: ramp[5] }, `${m}_horse_armor`);

// Turtle helmet
E['turtle_helmet'] = () =>
  autoShade(
    ['', '', '', '....XXXXXXXX....', '...XXXXXXXXXX...', '...XXXXXXXXXX...', '...XXXXXXXXXX...', '...XXX....XXX...', '...XX......XX...', '...XX......XX...', '...XX......XX...', '', '', '', '', ''].map((r) => r.padEnd(16, '.')),
    [0x1e4a16, 0x2a6a1e, 0x3a8a28, 0x4ea434, 0x68c046, 0x8ed866], 0x0e2a0a, { seed: 'turtle_helmet', edge: 1.25, relief: 2, bias: 0.04 },
  );

// ---------------------------------------------------------------------------
// Block items with flat item sprites

// prettier-ignore
const CAULDRON = [
  '................',
  '................',
  '................',
  '..############..',
  '.#rrrrrrrrrrrr#.',
  '.#riiiiiiiiiir#.',
  '.#rRRRRRRRRRRr#.',
  '.#443333333322#.',
  '.#433333333322#.',
  '.#433333333321#.',
  '.#433333333321#.',
  '.#332222222211#.',
  '..#2########1#..',
  '..#1#......#1#..',
  '..###......###..',
  '................',
];
E['cauldron'] = () =>
  spr(CAULDRON, { '#': 0x121212, r: 0x5e5e5e, R: 0x4a4a4a, i: 0x1a1a1a, 4: 0x505050, 3: 0x404040, 2: 0x323232, 1: 0x282828 }, 'cauldron');

// prettier-ignore
const BREWING = [
  '................',
  '.......##.......',
  '......#yY#......',
  '......#yY#......',
  '..##..#yY#..##..',
  '.#gg#.#yY#.#gg#.',
  '..#g###yY###g#..',
  '.#gGg#.#yY#gGg#.',
  '.#gGg#.#yY#gGg#.',
  '.#ggg#.#yY#ggg#.',
  '..###..#yY#.###.',
  '...##########...',
  '..#ssssSSssss#..',
  '..#SSSSSSSSSS#..',
  '...##########...',
  '................',
];
E['brewing_stand'] = () =>
  spr(BREWING, { '#': 0x2a2a2a, y: 0xf8c030, Y: 0xd88a18, g: 0xd6e2ec, G: 0xf4f8fb, s: 0x8a8a8a, S: 0x6a6a6a }, 'brewing_stand');

// prettier-ignore
const POT = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '....########....',
  '...#rrrrrrrr#...',
  '...#rddddddr#...',
  '....#pppppP#....',
  '....#pppppP#....',
  '....#pppPPP#....',
  '....#ppPPPP#....',
  '.....######.....',
  '................',
  '................',
];
E['flower_pot'] = () => spr(POT, { '#': 0x3e1c10, r: 0xb86a48, d: 0x4a2e1c, p: 0x9a5234, P: 0x7a3e26 }, 'flower_pot');

// prettier-ignore
const HOPPER = [
  '................',
  '................',
  '.##############.',
  '.#rrrrrrrrrrrr#.',
  '.#riiiiiiiiiir#.',
  '.#r4iiiiiiii2r#.',
  '.#rrrrrrrrrrrr#.',
  '..#4433333322#..',
  '...#43333322#...',
  '....#433322#....',
  '.....#4332#.....',
  '.....#4322#.....',
  '......#32#......',
  '......####......',
  '................',
  '................',
];
E['hopper'] = () =>
  spr(HOPPER, { '#': 0x161616, r: 0x5a5a5a, i: 0x222222, 4: 0x4e4e4e, 3: 0x404040, 2: 0x333333 }, 'hopper');

// Repeater / comparator: stone slab with redstone torches
function diode(torches: [number, number][], name: string, lit = true): TexImage {
  const t = spr([
    '', '', '', '', '', '', '', '', '',
    '.##############.',
    '#ssSsssSssSsssS#',
    '#SSSSSSSSSSSSSS#',
    '#dddddddddddddd#',
    '################',
  ].map((r) => r.padEnd(16, '.')), { '#': 0x2a2a2a, s: 0xa8a8a8, S: 0x8e8e8e, d: 0x6a6a6a }, name);
  for (const [x, y] of torches) {
    plot(t, x, y, lit ? 0xff4a3a : 0x8a1a14);
    plot(t, x, y - 1, lit ? 0xffb4a8 : 0x5a0e0a);
    for (let k = 1; k <= 3; k++) plot(t, x, y + k, 0x896727);
    plot(t, x - 1, y, 0x3a0a06);
    plot(t, x + 1, y, 0x3a0a06);
  }
  return t;
}
E['repeater'] = () => diode([[4, 5], [11, 5]], 'repeater');
E['comparator'] = () => diode([[3, 5], [12, 5], [8, 6]], 'comparator');

// Campfires
function campfire(flame: [number, number, number], name: string): TexImage {
  const t = spr([
    '................',
    '.......f........',
    '......fF..f.....',
    '.....fFYf.Ff....',
    '....fFYYFfFf....',
    '....fFYWYFYf....',
    '...fFYWWYYFf....',
    '...fFYYWYYFff...',
    '....fFYYYFFf....',
    '..##lll##lll##..',
    '.#LLLLLLLLLLLL#.',
    '.#lllllllllllll#',
    '..#LL##LL##LL#..',
    '.#llllllllllll#.',
    '..############..',
    '................',
  ].map((r) => r.slice(0, 16)), { '#': 0x1e140a, l: 0x6a4e2c, L: 0x4a3620, f: flame[0], F: flame[1], Y: flame[2], W: 0xfff8e0 }, name);
  return t;
}
E['campfire'] = () => campfire([0xc84a10, 0xf08a1e, 0xfcd040], 'campfire');
E['soul_campfire'] = () => campfire([0x1a6a8a, 0x3ab0d0, 0x8ae8f8], 'soul_campfire');

// Lanterns
function lantern(glow: [number, number], name: string): TexImage {
  return spr([
    '................',
    '.......##.......',
    '......#..#......',
    '......#..#......',
    '.....######.....',
    '....#dddddd#....',
    '....#dggGgd#....',
    '....#dgGWgd#....',
    '....#dgGGgd#....',
    '....#dggggd#....',
    '....#dddddd#....',
    '.....######.....',
    '................',
    '................',
    '................',
    '................',
  ], { '#': 0x1a1a22, d: 0x3a3a48, g: glow[0], G: glow[1], W: 0xfffff0 }, name);
}
E['lantern'] = () => lantern([0xe8902a, 0xfcd060], 'lantern');
E['soul_lantern'] = () => lantern([0x2a9ab8, 0x8ae8f8], 'soul_lantern');

E['chain'] = () =>
  spr([
    '................',
    '.......##.......',
    '......#cc#......',
    '......#c.#......',
    '......#cc#......',
    '.......##.......',
    '.......##.......',
    '......#CC#......',
    '......#C.#......',
    '......#CC#......',
    '.......##.......',
    '.......##.......',
    '......#cc#......',
    '......#c.#......',
    '......#cc#......',
    '.......##.......',
  ], { '#': 0x1a1c22, c: 0x4a5060, C: 0x3a3e4a }, 'chain');

E['bell'] = () =>
  spr([
    '................',
    '.......##.......',
    '......#bb#......',
    '.....######.....',
    '....#yYYYYy#....',
    '....#yYyyyy#....',
    '....#YYyyyd#....',
    '...#yYyyyydd#...',
    '...#yYyyyydd#...',
    '..#yYyyyyyddd#..',
    '..#ddddddddddd#.',
    '..##############',
    '.......##.......',
    '................',
    '................',
    '................',
  ].map((r) => r.slice(0, 16)), { '#': 0x4a3004, b: 0x5a5a5a, y: 0xe0b020, Y: 0xfce060, d: 0xa87414 }, 'bell');

E['kelp'] = () =>
  spr([
    '.........##.....',
    '........#gG#....',
    '........#gG#....',
    '.......#gG#.....',
    '.......#gG#.##..',
    '......#gGg##gG#.',
    '......#gGggG##..',
    '.......#gGg#....',
    '..##...#gG#.....',
    '.#Gg##.#gG#.....',
    '..##gG#gGg#.....',
    '....#gGgG#......',
    '.....#gG#.......',
    '.....#gG#.......',
    '......#gG#......',
    '.......##.......',
  ], { '#': 0x10300c, g: 0x3e8a24, G: 0x5eae36 }, 'kelp');

E['nether_wart'] = () =>
  spr([
    '................',
    '................',
    '................',
    '.....##...##....',
    '....#rR#.#rR#...',
    '....#Rr#.#Rr#...',
    '.##..#s#.#s#.##.',
    '#rR#.#s###s#.#rR#',
    '#Rr#..#sss#..#Rr#',
    '.#s#...#s#...#s#.',
    '..#s#..#s#..#s#.',
    '...#ss##s##ss#..',
    '....###sss###...',
    '.......#s#......',
    '........#.......',
    '................',
  ].map((r) => r.slice(0, 16)), { '#': 0x3a0808, r: 0xa01e1e, R: 0xd03a2e, s: 0x6e1414 }, 'nether_wart');

E['armor_stand'] = () =>
  spr([
    '.......##.......',
    '......#ab#......',
    '......#ab#......',
    '..############..',
    '..#aaaaaaaaaa#..',
    '..#bbbbbbbbbb#..',
    '..#####ab#####..',
    '......#ab#......',
    '....###ab###....',
    '....#aaaaaa#....',
    '....#bbbbbb#....',
    '....###ab###....',
    '......#ab#......',
    '..############..',
    '..#ssssssssss#..',
    '..############..',
  ], { '#': 0x2e1f0c, a: 0xb08c56, b: 0x8a6c3e, s: 0x8e8e8e }, 'armor_stand');

// Glow item frame: item frame with glowing trim
// prettier-ignore
const GFRAME = [
  '................',
  '.##############.',
  '.#555555555554#.',
  '.#544444444432#.',
  '.#54########32#.',
  '.#54#llllll#32#.',
  '.#54#lLLLLl#32#.',
  '.#54#lLLLLl#32#.',
  '.#54#lLLLLl#32#.',
  '.#54#lLLLLl#32#.',
  '.#54#llllll#32#.',
  '.#54########32#.',
  '.#433333333322#.',
  '.#222222222221#.',
  '.##############.',
  '................',
];
E['glow_item_frame'] = () =>
  spr(GFRAME, { '#': 0x0e3a36, 5: 0xb8f0e0, 4: 0x7ad8c4, 3: 0x4ab8a4, 2: 0x2a8a7a, 1: 0x1a6a5e, l: 0x8a4e26, L: 0xa4622e }, 'glow_item_frame');

