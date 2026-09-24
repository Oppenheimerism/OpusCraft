// Snowy villages (vanilla SnowyVillagePools): town centres, streets, decorations, houses, job sites, farms and pens,
// hand-made after vanilla's village/snowy/* structures: snow block walls on spruce log frames, spruce floors and
// roofs, lanterns, packed ice. Each house stands with its entrance to the north (see villagePlainsHouses.ts for the
// layout of a template).

import { pool, EMPTY, type Template } from './jigsaw';
import {
  villageKit, villagersPool, feature, treeFeature, pileSnow, pileIce, rigid, terrain, straightStreet, streetMap, farmProcessor, streetProcessor, entranceJ, bed,
} from './villageCommon';
import { PLAINS_TERMINATORS } from './villagePlains';

const NK: Record<string, string> = {
  P: 'spruce_planks', L: 'spruce_log[axis=y]', X: 'spruce_log[axis=x]', Z: 'spruce_log[axis=z]', W: 'snow_block', I: 'packed_ice',
  C: 'cobblestone', S: 'stone_bricks', e: 'diorite', E: 'polished_diorite',
  _: 'spruce_slab[type=bottom]', '^': 'spruce_stairs[facing=north]', v: 'spruce_stairs[facing=south]', '>': 'spruce_stairs[facing=east]', '<': 'spruce_stairs[facing=west]',
  D: 'spruce_door[facing=south,half=lower,hinge=left]', U: 'spruce_door[facing=south,half=upper,hinge=left]',
  F: 'spruce_fence', q: 'spruce_fence_gate[facing=north]', G: 'glass_pane', T: 'torch', t: 'wall_torch[facing=north]',
  j: 'lantern[hanging=true]', J: 'lantern', p: 'dirt_path', g: 'grass_block', f: 'farmland[moisture=7]', '~': 'water', H: 'hay_block[axis=y]',
  '1': 'wheat[age=2]', '2': 'wheat[age=5]', '3': 'wheat[age=7]', B: 'bookshelf', k: 'chest[facing=north]', a: 'ladder[facing=west]',
};

const K = villageKit('snowy', NK);
const V = K.V;

// vanilla STREET_SNOWY_OR_TAIGA (shared with taiga villages)
export const STREET_SNOWY_OR_TAIGA = streetProcessor('spruce_planks', 0.2, [{ input: 'dirt_path', location: 'ice', output: 'spruce_planks' }]);

// ---------------------------------------------------------------------------------------------------------------
// Town centres

// (the bell under a slab roof on four fence posts, over a pad of packed ice and snow)
const meeting1 = K.piece('town_centers/snowy_meeting_point_1', {
  key: { b: 'bell[attachment=ceiling,facing=north]' },
  layers: [
    'ppppppppp|ppppppppp|ppIIIIIpp|ppIWWWIpp|ppIWWWIpp|ppIWWWIpp|ppIIIIIpp|ppppppppp|ppppppppp',
    '.........|.........|..F...F..|.........|.........|.........|..F...F..|.........|.........',
    '.........|.........|..F...F..|.........|.........|.........|..F...F..|.........|.........',
    '.........|.........|..F...F..|...j.....|....b....|.....j...|..F...F..|.........|.........',
    '.........|.........|.._____..|.._____..|.._____..|.._____..|.._____..|.........|.........',
  ],
  jigsaws: [
    K.street(4, 1, 0, 'north'), K.street(4, 1, 8, 'south'), K.street(0, 1, 4, 'west'), K.street(8, 1, 4, 'east'),
    K.golem(7, 1), K.villager(1, 7), K.villager(7, 7),
  ],
});

// (a well of snow blocks under a spruce roof)
const meeting2 = K.piece('town_centers/snowy_meeting_point_2', {
  key: { b: 'bell[attachment=ceiling,facing=north]' },
  layers: [
    'ppppppppppp|ppppppppppp|ppppppppppp|pppWWWWWppp|pppW~~~Wppp|pppW~~~Wppp|pppW~~~Wppp|pppWWWWWppp|ppppppppppp|ppppppppppp|ppppppppppp',
    '...........|...........|...........|...LWWWL...|...W...W...|...W...W...|...W...W...|...LWWWL...|...........|...........|...........',
    '...........|...........|...........|...L...L...|...........|...........|...........|...L...L...|...........|...........|...........',
    '...........|...........|...........|...L...L...|...........|.....b.....|...........|...L...L...|...........|...........|...........',
    '...........|...........|..vvvvvvv..|..>PPPPP<..|..>PPPPP<..|..>PPPPP<..|..>PPPPP<..|..>PPPPP<..|..^^^^^^^..|...........|...........',
    '...........|...........|...........|...vvvvv...|...>___<...|...>___<...|...>___<...|...^^^^^...|...........|...........|...........',
  ],
  jigsaws: [
    K.street(5, 1, 0, 'north'), K.street(5, 1, 10, 'south'), K.street(0, 1, 5, 'west'), K.street(10, 1, 5, 'east'),
    K.golem(1, 1), K.villager(9, 9), K.villager(1, 9),
  ],
});

// (the bell on a snow block, lanterns on four fence posts)
const meeting3 = K.piece('town_centers/snowy_meeting_point_3', {
  key: { b: 'bell[attachment=floor,facing=north]' },
  layers: [
    'ppppppp|ppppppp|ppIIIpp|ppIWIpp|ppIIIpp|ppppppp|ppppppp',
    '.......|.F...F.|.......|...W...|.......|.F...F.|.......',
    '.......|.F...F.|.......|...b...|.......|.F...F.|.......',
    '.......|.J...J.|.......|.......|.......|.J...J.|.......',
  ],
  jigsaws: [
    K.street(3, 1, 0, 'north'), K.street(3, 1, 6, 'south'), K.street(0, 1, 3, 'west'), K.street(6, 1, 3, 'east'),
    K.golem(5, 3), K.villager(1, 3), K.villager(3, 5),
  ],
});

/** the zombie villages' town centres (see villages.ts ZOMBIE_STARTS): for now, the living ones */
export const SNOWY_ZOMBIE_TOWN_CENTERS = [rigid(meeting1), rigid(meeting2), rigid(meeting3)];

pool(`${V}/town_centers`, 'empty', [
  [rigid(meeting1), 100], [rigid(meeting2), 50], [rigid(meeting3), 150],
  [SNOWY_ZOMBIE_TOWN_CENTERS[0], 2], [SNOWY_ZOMBIE_TOWN_CENTERS[1], 1], [SNOWY_ZOMBIE_TOWN_CENTERS[2], 3],
]);

// ---------------------------------------------------------------------------------------------------------------
// Streets

const st = (n: string) => `${V}/streets/${n}`;
const streets: [Template, number][] = [
  [streetMap(st('corner_01'), ['.ppp...', '.ppppp.', '.pppppp', '.pppppp', '.......'], [K.street(2, 1, 0, 'north'), K.street(6, 1, 2, 'east'), K.plot(0, 1, 2, 'west'), K.plot(2, 1, 4, 'south'), K.decor(0, 4)]), 2],
  [streetMap(st('corner_02'), ['.ppp.....', '.ppp.....', '.ppppppp.', '.pppppppp', '.pppppppp', '.........'], [K.street(2, 1, 0, 'north'), K.street(8, 1, 3, 'east'), K.plot(0, 1, 2, 'west'), K.plot(3, 1, 5, 'south'), K.decor(0, 5), K.decor(7, 5)]), 2],
  [streetMap(st('corner_03'), ['.ppp..', '.ppp..', '.ppppp', '.ppppp', '..ppp.', '......'], [K.street(2, 1, 0, 'north'), K.street(5, 1, 3, 'east'), K.plot(0, 1, 3, 'west'), K.plot(2, 1, 5, 'south'), K.decor(5, 5)]), 2],
  [streetMap(st('square_01'), ['...ppp...', '.ppppppp.', 'ppppppppp', 'ppppppppp', 'ppppppppp', 'ppppppppp', 'ppppppppp', '.ppppppp.', '...ppp...'], [K.street(4, 1, 0, 'north'), K.street(4, 1, 8, 'south'), K.street(0, 1, 4, 'west'), K.street(8, 1, 4, 'east'), K.plot(1, 1, 0, 'north'), K.plot(7, 1, 8, 'south'), K.decor(8, 0), K.decor(0, 8)]), 2],
  [straightStreet(V, st('straight_01'), 13, [[2, 'w'], [3, 'e'], [8, 'w'], [9, 'e']], [[6, 'w'], [12, 'e']]), 4],
  [straightStreet(V, st('straight_02'), 11, [[2, 'e'], [5, 'w'], [8, 'e']], [[1, 'w'], [9, 'w']]), 4],
  [straightStreet(V, st('straight_03'), 9, [[2, 'w'], [2, 'e'], [7, 'w']], [[6, 'e']]), 4],
  [straightStreet(V, st('straight_04'), 8, [[3, 'w'], [4, 'e']], [[7, 'w']]), 7],
  [straightStreet(V, st('straight_06'), 6, [[3, 'e']], [[2, 'w']]), 4],
  [straightStreet(V, st('straight_08'), 10, [[2, 'w'], [6, 'e'], [7, 'w']], [[4, 'e']]), 4],
  [streetMap(st('crossroad_02'), ['..ppp..', '..ppp..', 'ppppppp', 'ppppppp', 'ppppppp', '..ppp..', '..ppp..'], [K.street(3, 1, 0, 'north'), K.street(3, 1, 6, 'south'), K.street(0, 1, 3, 'west'), K.street(6, 1, 3, 'east'), K.decor(0, 0), K.decor(6, 6)]), 1],
  [streetMap(st('crossroad_03'), ['..ppp..', 'ppppppp', 'ppppppp', 'ppppppp', '.......'], [K.street(3, 1, 0, 'north'), K.street(0, 1, 2, 'west'), K.street(6, 1, 2, 'east'), K.plot(3, 1, 4, 'south'), K.decor(0, 4), K.decor(6, 4)]), 2],
  [streetMap(st('crossroad_04'), ['.ppp.', '.ppp.', '.pppp', '.pppp', '.pppp', '.ppp.', '.ppp.'], [K.street(2, 1, 0, 'north'), K.street(2, 1, 6, 'south'), K.street(4, 1, 3, 'east'), K.plot(0, 1, 2, 'west'), K.plot(0, 1, 5, 'west'), K.decor(4, 0)]), 2],
  [streetMap(st('crossroad_05'), ['.ppp.', '.ppp.', 'pppp.', 'pppp.', 'pppp.', '.ppp.', '.ppp.', '.ppp.'], [K.street(2, 1, 0, 'north'), K.street(2, 1, 7, 'south'), K.street(0, 1, 3, 'west'), K.plot(4, 1, 2, 'east'), K.plot(4, 1, 6, 'east'), K.decor(0, 7)]), 2],
  [streetMap(st('crossroad_06'), ['...ppp...', '...ppp...', 'ppppppppp', 'ppppppppp', 'ppppppppp', '.........'], [K.street(4, 1, 0, 'north'), K.street(0, 1, 3, 'west'), K.street(8, 1, 3, 'east'), K.plot(2, 1, 5, 'south'), K.plot(6, 1, 5, 'south'), K.plot(1, 1, 0, 'north'), K.plot(7, 1, 0, 'north'), K.decor(8, 5)]), 2],
  [streetMap(st('turn_01'), ['.ppp...', '.ppp...', '.pppp..', '..pppp.', '...ppp.', '...ppp.', '...ppp.'], [K.street(2, 1, 0, 'north'), K.street(4, 1, 6, 'south'), K.plot(0, 1, 5, 'west'), K.plot(6, 1, 1, 'east'), K.decor(0, 3)]), 3],
];
pool(`${V}/streets`, `${V}/terminators`, streets.map(([t, w]) => [terrain(t, STREET_SNOWY_OR_TAIGA), w]));

// vanilla's snowy terminators are the plains ones
const T = `${V}/terminators`;
pool(T, 'empty', PLAINS_TERMINATORS.map((t) => [terrain(t, STREET_SNOWY_OR_TAIGA), 1]));

// ---------------------------------------------------------------------------------------------------------------
// Decorations: lantern posts, spruces, heaps of snow and ice

const decorPiece = (id: string, layers: string[], final: string) =>
  K.piece(id, { layers, jigsaws: [{ at: [0, 0, 0], facing: 'down', top: 'south', name: 'bottom', target: 'bottom', final }] });
const lamp1 = decorPiece('snowy_lamp_post_01', ['F', 'F', 'J'], 'spruce_fence');
const lamp2 = decorPiece('snowy_lamp_post_02', ['W', 'F', 'J'], 'snow_block');
const lamp3 = decorPiece('snowy_lamp_post_03', ['I', 'I', 'J'], 'packed_ice');
pool(`${V}/decor`, 'empty', [
  [rigid(lamp1), 4], [rigid(lamp2), 4], [rigid(lamp3), 1], [feature(treeFeature('spruce'), 'spruce'), 4], [feature(pileSnow, 'pile_snow'), 4],
  [feature(pileIce, 'pile_ice'), 1], [EMPTY, 9],
]);

villagersPool('snowy', 'snow');

// ---------------------------------------------------------------------------------------------------------------
// Houses

const small1 = K.house('snowy_small_house_1', {
  key: { ...bed('white', 'south'), k: 'chest[facing=west]' },
  layers: [
    '..p..|PPPPP|PPPPP|PPPPP|PPPPP|PPPPP',
    '.....|LWDWL|W...W|Gb..G|Wh.kW|LWWWL',
    '.....|LWUWL|W...W|G...G|W...W|LWGWL',
    'vvvvv|LWWWL|W...W|W...W|W...W|LWWWL',
    '.....|vvvvv|P...P|P...P|P...P|^^^^^',
    '.....|.....|vvvvv|P.j.P|^^^^^|.....',
    '.....|.....|.....|_____|.....|.....',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(3, 1, 4, 'snowy_house')],
});

const small2 = K.house('snowy_small_house_2', {
  key: { ...bed('light_blue', 'east') },
  layers: [
    '..p...|PPPPPP|PPPPPP|PPPPPP|PPPPPP|PPPPPP',
    '......|LWDWWL|W....W|G....G|Wbh.kW|LWWWWL',
    '......|LWUGWL|W....W|G....G|W....W|LWGWWL',
    '......|LWWWWL|W....W|W..j.W|W....W|LWWWWL',
    '......|______|______|______|______|______',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(3, 2)],
  loot: [K.loot(4, 1, 4, 'snowy_house')],
});

const small3 = K.house('snowy_small_house_3', {
  key: { ...bed('red', 'south'), k: 'chest[facing=west]' },
  layers: [
    '..p..|PPPPP|PPPPP|PPPPP|PPPPP|PPPPP|PPPPP',
    '.....|LWDWL|W...W|W...W|Wb.kW|Wh..W|LWWWL',
    '.....|LWUWL|G...G|W...W|G...G|W...W|LWGWL',
    '.....|>WWW<|>...<|>...<|>...<|>...<|>WWW<',
    '.....|.>W<.|.>.<.|.>j<.|.>.<.|.>.<.|.>W<.',
    '.....|..P..|.._..|.._..|.._..|.._..|..P..',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(3, 1, 4, 'snowy_house')],
});

const small4 = K.house('snowy_small_house_4', {
  key: { ...bed('cyan', 'east') },
  layers: [
    '...p...|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP',
    '.......|LWWDWWL|W.....W|G.....G|Wbh..kW|LWWWWWL',
    '.......|LGWUWGL|W.....W|G.....G|W.....W|LWWGWWL',
    'vvvvvvv|LWWWWWL|W.....W|W.....W|W.....W|LWWWWWL',
    '.......|vvvvvvv|P.....P|P.....P|P.....P|^^^^^^^',
    '.......|.......|vvvvvvv|P..j..P|^^^^^^^|.......',
    '.......|.......|.......|_______|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2), K.cat(4, 2)],
  loot: [K.loot(5, 1, 4, 'snowy_house')],
});

// (a round hut all of snow, ice for windows)
const small5 = K.house('snowy_small_house_5', {
  key: { ...bed('white', 'east'), i: 'ice' },
  layers: [
    '..p..|.WWW.|WPPPW|WPPPW|WPPPW|.WWW.',
    '.....|.WDW.|W...W|W...W|Wbh.W|.WWW.',
    '.....|.WUW.|W...W|i...i|W...W|.WWW.',
    '.....|.WWW.|W...W|W.j.W|W...W|.WWW.',
    '.....|.....|.WWW.|.WWW.|.WWW.|.....',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
});

const small6 = K.house('snowy_small_house_6', {
  key: { ...bed('light_gray', 'east') },
  layers: [
    '..p...|PPPPPP|PPPPPP|PPPPPP|PPPPPP|PPPPPP|PPPPPP',
    '......|LPDPPL|P....P|G....G|P....P|Pbh.kP|LPPPPL',
    '......|LPUPPL|P....P|G..j.G|P....P|P....P|LPGGPL',
    '......|LXXXXL|ZWWWWZ|ZWWWWZ|ZWWWWZ|ZWWWWZ|LXXXXL',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2), K.cat(3, 3)],
  loot: [K.loot(4, 1, 5, 'snowy_house')],
});

// (a porch, lanterns on its posts)
const small7 = K.house('snowy_small_house_7', {
  key: { ...bed('red', 'south') },
  layers: [
    '..p..|.PPP.|PPPPP|PPPPP|PPPPP|PPPPP|PPPPP',
    '.....|.F.F.|LWDWL|W...W|G..bG|Wk.hW|LWWWL',
    '.....|.F.F.|LWUWL|W...W|G...G|W...W|LWGWL',
    '.....|.J.J.|>WWW<|>...<|>...<|>...<|>WWW<',
    '.....|.....|.>W<.|.>.<.|.>j<.|.>.<.|.>W<.',
    '.....|.....|..P..|.._..|.._..|.._..|..P..',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 3)],
  loot: [K.loot(1, 1, 5, 'snowy_house')],
});

const small8 = K.house('snowy_small_house_8', {
  key: { ...bed('yellow', 'south'), k: 'chest[facing=west]' },
  layers: [
    '..p..|PPPPP|PPPPP|PPPPP|PPPPP|PPPPP|PPPPP|PPPPP',
    '.....|LWDWL|W...W|G...G|W...W|Wb.kW|Wh..W|LWWWL',
    '.....|LWUWL|W...W|G...G|W...W|W...W|W...W|LWGWL',
    '.....|>WWW<|>...<|>...<|>...<|>...<|>...<|>WWW<',
    '.....|.>W<.|.>.<.|.>.<.|.>j<.|.>.<.|.>.<.|.>W<.',
    '.....|..P..|.._..|.._..|.._..|.._..|.._..|..P..',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 3)],
  loot: [K.loot(3, 1, 5, 'snowy_house')],
});

const medium1 = K.house('snowy_medium_house_1', {
  key: { ...bed('blue', 'east'), ...bed('blue', 'west', 'e', 'i'), k: 'chest[facing=west]' },
  layers: [
    '...p...|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP',
    '.......|LWWDWWL|W....kW|G.....G|W.....W|G.....G|Wbh.ieW|LWWWWWL',
    '.......|LGWUWGL|W.....W|G.....G|W.....W|G.....G|W.....W|LWWGWWL',
    '.......|>WWWWW<|>.....<|>.....<|>.....<|>.....<|>.....<|>WWWWW<',
    '.......|.>WWW<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>WWW<.',
    '.......|..>W<..|..>.<..|..>j<..|..>.<..|..>j<..|..>.<..|..>W<..',
    '.......|...P...|..._...|..._...|..._...|..._...|..._...|...P...',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 3), K.villager(2, 4), K.cat(4, 4)],
  loot: [K.loot(5, 1, 2, 'snowy_house')],
});

const medium2 = K.house('snowy_medium_house_2', {
  key: { ...bed('white', 'east'), ...bed('white', 'west', 'e', 'i') },
  layers: [
    '....p....|PPPPPPPPP|PPPPPPPPP|PPPPPPPPP|PPPPPPPPP|PPPPPPPPP|PPPPPPPPP',
    '.........|LWWWDWWWL|W.......W|G.......G|W.......W|Wbh.k.ieW|LWWWWWWWL',
    '.........|LGWWUWWGL|W.......W|G.......G|W.......W|W.......W|LWWGWGWWL',
    'vvvvvvvvv|LWWWWWWWL|W.......W|W.......W|W.......W|W.......W|LWWWWWWWL',
    '.........|vvvvvvvvv|P.......P|P.......P|P.......P|P.......P|^^^^^^^^^',
    '.........|.........|vvvvvvvvv|P..j.j..P|P.......P|^^^^^^^^^|.........',
    '.........|.........|.........|_________|_________|.........|.........',
  ],
  jigsaws: [entranceJ(4, 1, 0), K.villager(4, 3), K.villager(2, 3)],
  loot: [K.loot(4, 1, 5, 'snowy_house')],
});

// (two storeys, a ladder in the corner)
const medium3 = K.house('snowy_medium_house_3', {
  key: { ...bed('blue', 'east') },
  layers: [
    '...p...|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP',
    '.......|LWWDWWL|W.....W|G.....G|W.....W|G.....G|Wk...aW|LWWWWWL',
    '.......|LGWUWGL|W.....W|G.....G|W.....W|G.....G|W....aW|LWWWWWL',
    '.......|LWWWWWL|W.....W|W..j..W|W.....W|W.....W|W....aW|LWWWWWL',
    '.......|LXXXXXL|ZPPPPPZ|ZPPPPPZ|ZPPPPPZ|ZPPPPPZ|ZPPPPaZ|LXXXXXL',
    '.......|LWWWWWL|Wbh...W|G.....G|W.....W|G.....G|Wbh...W|LWWWWWL',
    '.......|LWGWGWL|W.....W|G.....G|W.....W|G.....G|W.....W|LWWWWWL',
    '.......|>WWWWW<|>.....<|>.....<|>.....<|>.....<|>.....<|>WWWWW<',
    '.......|.>WWW<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>WWW<.',
    '.......|..>W<..|..>.<..|..>j<..|..>.<..|..>.<..|..>.<..|..>W<..',
    '.......|...P...|..._...|..._...|..._...|..._...|..._...|...P...',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 3), K.villager(3, 3, 'air', 4)],
  loot: [K.loot(1, 1, 6, 'snowy_house')],
});

// ---------------------------------------------------------------------------------------------------------------
// Job sites

const butcher1 = K.house('snowy_butchers_shop_1', {
  key: { z: 'smoker[facing=north]', q: 'spruce_fence_gate[facing=east]' },
  layers: [
    '...p...|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP|ggggggg|ggggggg|ggggggg|ggggggg',
    '.......|LWWDWWL|W.....W|Wz.k..W|LWWWWWL|F.....F|q.....F|F.....F|FFFFFFF',
    '.......|LGWUWGL|W.....W|W..t..W|LWGWWWL|.......|.......|.......|.......',
    'vvvvvvv|LWWWWWL|W.....W|W.....W|LWWWWWL|.......|.......|.......|.......',
    '.......|vvvvvvv|P.....P|P.....P|^^^^^^^|.......|.......|.......|.......',
    '.......|.......|vvvvvvv|^^^^^^^|.......|.......|.......|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2), K.animal(2, 6, 'air', 'village/common/butcher_animals'), K.animal(4, 7, 'air', 'village/common/butcher_animals')],
  loot: [K.loot(3, 1, 3, 'butcher')],
});

const butcher2 = K.house('snowy_butchers_shop_2', {
  key: { z: 'smoker[facing=north]', k: 'chest[facing=west]' },
  layers: [
    '..p..|PPPPP|PPPPP|PPPPP|PPPPP|PPPPP',
    '.....|LWDWL|W...W|G...G|Wz.kW|LWWWL',
    '.....|LWUWL|W...W|G...G|W...W|LWGWL',
    '.....|>WWW<|>...<|>...<|>...<|>WWW<',
    '.....|.>W<.|.>.<.|.>j<.|.>.<.|.>W<.',
    '.....|..P..|.._..|.._..|.._..|..P..',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(3, 1, 4, 'butcher')],
});

const toolsmith = K.house('snowy_tool_smith_1', {
  key: { m: 'smithing_table' },
  layers: [
    '...p...|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP',
    '.......|LWWDWWL|W.....W|G.....G|Wm..k.W|LWWWWWL',
    '.......|LGWUWGL|W.....W|G.....G|W.....W|LWWWWWL',
    'vvvvvvv|LWWWWWL|W.....W|W.....W|W.....W|LWWWWWL',
    '.......|vvvvvvv|P.....P|P.....P|P.....P|^^^^^^^',
    '.......|.......|vvvvvvv|P..j..P|^^^^^^^|.......',
    '.......|.......|.......|_______|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2)],
  loot: [K.loot(4, 1, 4, 'toolsmith')],
});

const fletcher = K.house('snowy_fletcher_house_1', {
  key: { ...bed('lime', 'south'), m: 'fletching_table' },
  layers: [
    '..p..|PPPPP|PPPPP|PPPPP|PPPPP|PPPPP|PPPPP',
    '.....|LWDWL|W...W|Wm..W|W..bW|Wk.hW|LWWWL',
    '.....|LWUWL|W...W|G...G|W...W|W...W|LWGWL',
    '.....|>WWW<|>...<|>...<|>...<|>...<|>WWW<',
    '.....|.>W<.|.>.<.|.>j<.|.>.<.|.>.<.|.>W<.',
    '.....|..P..|.._..|.._..|.._..|.._..|..P..',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(1, 1, 5, 'fletcher')],
});

const shepherd = K.house('snowy_shepherds_house_1', {
  key: { ...bed('white', 'south'), l: 'loom[facing=north]', q: 'spruce_fence_gate[facing=east]' },
  layers: [
    '...p.......|PPPPPPP....|PPPPPPP....|PPPPPPP....|PPPPPPP....|PPPPPPP....',
    '...........|LWWDWWLFFFF|W.....W...F|G....bG...q|Wl.k.hW...F|LWWWWWLFFFF',
    '...........|LGWUWGL....|W.....W....|G.....G....|W.....W....|LWWWWWL....',
    'vvvvvvv....|LWWWWWL....|W.....W....|W.....W....|W.....W....|LWWWWWL....',
    '...........|vvvvvvv....|P.....P....|P.....P....|P.....P....|^^^^^^^....',
    '...........|...........|vvvvvvv....|P..j..P....|^^^^^^^....|...........',
    '...........|...........|...........|_______....|...........|...........',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2), K.animal(8, 3, 'air', 'village/common/sheep')],
  loot: [K.loot(3, 1, 4, 'shepherd')],
});

const armorer1 = K.house('snowy_armorer_house_1', {
  key: { z: 'blast_furnace[facing=north]' },
  layers: [
    '..p..|PPPPP|PPPPP|PPPPP|PPPPP',
    '.....|LWDWL|W...W|Wz.kW|LWWWL',
    '.....|LWUWL|G...G|W...W|LWWWL',
    '.....|>WWW<|>...<|>...<|>WWW<',
    '.....|.>W<.|.>j<.|.>.<.|.>W<.',
    '.....|..P..|.._..|.._..|..P..',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(3, 1, 3, 'armorer')],
});

// (stone below, snow above)
const armorer2 = K.house('snowy_armorer_house_2', {
  key: { z: 'blast_furnace[facing=north]' },
  layers: [
    '...p...|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC',
    '.......|LCCDCCL|C.....C|C.....C|Cz.k..C|LCCCCCL',
    '.......|LCGUGCL|C.....C|G.....G|C.....C|LCCCCCL',
    '.......|LWWWWWL|W.....W|W..j..W|W.....W|LWWWWWL',
    '.......|_______|_______|_______|_______|_______',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2)],
  loot: [K.loot(3, 1, 4, 'armorer')],
});

const fisher = K.house('snowy_fisher_cottage', {
  key: { r: 'barrel[facing=up]', k: 'chest[facing=west]' },
  layers: [
    '..p......|PPPPP....|PPPPP.~~.|PPPPP.~~.|PPPPP....|PPPPP....',
    '.........|LWDWL....|W...W....|G...G....|Wr.kW....|LWWWL....',
    '.........|LWUWL....|W...W....|G...G....|W...W....|LWGWL....',
    '.........|>WWW<....|>...<....|>...<....|>...<....|>WWW<....',
    '.........|.>W<.....|.>.<.....|.>j<.....|.>.<.....|.>W<.....',
    '.........|..P......|.._......|.._......|.._......|..P......',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(3, 1, 4, 'fisher')],
});

const tannery = K.house('snowy_tannery_1', {
  key: { u: 'cauldron' },
  layers: [
    '...p...|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP',
    '.......|LWWDWWL|W.....W|G.....G|Wu.k..W|LWWWWWL',
    '.......|LGWUWGL|W.....W|G.....G|W.....W|LWWWWWL',
    '.......|LWWWWWL|W.....W|W..j..W|W.....W|LWWWWWL',
    '.......|_______|_______|_______|_______|_______',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2)],
  loot: [K.loot(3, 1, 4, 'tannery')],
});

const cartographer = K.house('snowy_cartographer_house_1', {
  key: { m: 'cartography_table' },
  layers: [
    '...p...|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP',
    '.......|LWWDWWL|W.....W|G.....G|W.....W|Wm.k..W|LWWWWWL',
    '.......|LGWUWGL|W.....W|G.....G|W.....W|W.....W|LWWGWWL',
    '.......|>WWWWW<|>.....<|>.....<|>.....<|>.....<|>WWWWW<',
    '.......|.>WWW<.|.>...<.|.>...<.|.>...<.|.>...<.|.>WWW<.',
    '.......|..>W<..|..>.<..|..>j<..|..>.<..|..>.<..|..>W<..',
    '.......|...P...|..._...|..._...|..._...|..._...|...P...',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 3)],
  loot: [K.loot(3, 1, 5, 'cartographer')],
});

const library = K.house('snowy_library_1', {
  key: { n: 'lectern[facing=north]' },
  layers: [
    '....p....|PPPPPPPPP|PPPPPPPPP|PPPPPPPPP|PPPPPPPPP|PPPPPPPPP|PPPPPPPPP',
    '.........|LWWWDWWWL|WB.....BW|WB.....BW|G.......G|WBB.n.BBW|LWWWWWWWL',
    '.........|LWWWUWWWL|WB.....BW|WB.....BW|G.......G|WBB...BBW|LWWGWGWWL',
    'vvvvvvvvv|LWWWWWWWL|W.......W|W.......W|W.......W|W.......W|LWWWWWWWL',
    '.........|vvvvvvvvv|P.......P|P.......P|P.......P|P.......P|^^^^^^^^^',
    '.........|.........|vvvvvvvvv|P..j.j..P|P.......P|^^^^^^^^^|.........',
    '.........|.........|.........|_________|_________|.........|.........',
  ],
  jigsaws: [entranceJ(4, 1, 0), K.villager(4, 3)],
});

const mason1 = K.house('snowy_masons_house_1', {
  key: { m: 'stonecutter[facing=north]', k: 'chest[facing=west]' },
  layers: [
    '..p..|SSSSS|SPPPS|SPPPS|SPPPS|SSSSS',
    '.....|LSDSL|S...S|G...G|Sm.kS|LSSSL',
    '.....|LSUSL|S...S|G...G|S...S|LSGSL',
    '.....|>WWW<|>...<|>...<|>...<|>WWW<',
    '.....|.>W<.|.>.<.|.>j<.|.>.<.|.>W<.',
    '.....|..P..|.._..|.._..|.._..|..P..',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(3, 1, 4, 'mason')],
});

// (diorite walls)
const mason2 = K.house('snowy_masons_house_2', {
  key: { m: 'stonecutter[facing=north]' },
  layers: [
    '...p...|EEEEEEE|EPPPPPE|EPPPPPE|EPPPPPE|EEEEEEE',
    '.......|LeeDeeL|e.....e|G.....G|em.k..e|LeeeeeL',
    '.......|LeGUGeL|e.....e|G.....G|e.....e|LeeeeeL',
    '.......|LeeeeeL|e.....e|e..j..e|e.....e|LeeeeeL',
    '.......|_______|_______|_______|_______|_______',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2)],
  loot: [K.loot(3, 1, 4, 'mason')],
});

const weaponsmith = K.house('snowy_weapon_smith_1', {
  key: { r: 'grindstone[face=floor,facing=north]', x: 'furnace[facing=north]' },
  layers: [
    '...p...|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP',
    '.......|LWWDWWL|W.....W|Wr....W|Wk...xW|LWWWWWL',
    '.......|LGWUWGL|W.....W|G.....G|W.....W|LWWWWWL',
    'vvvvvvv|LWWWWWL|W.....W|W.....W|W.....W|LWWWWWL',
    '.......|vvvvvvv|P.....P|P.....P|P.....P|^^^^^^^',
    '.......|.......|vvvvvvv|P..j..P|^^^^^^^|.......',
    '.......|.......|.......|_______|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2)],
  loot: [K.loot(1, 1, 4, 'weaponsmith')],
});

const temple = K.house('snowy_temple_1', {
  key: { q: 'brewing_stand' },
  layers: [
    '...p...|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP',
    '.......|LWWDWWL|W.....W|W.....W|W.....W|W.....W|W.q.k.W|LWWWWWL',
    '.......|LWWUWWL|W.....W|G.....G|W.....W|G.....G|W.....W|LWWWWWL',
    '.......|LWWWWWL|W.....W|G.....G|W.....W|G.....G|W.....W|LWWWWWL',
    '.......|LWWWWWL|W.....W|W.....W|W.....W|W.....W|W.....W|LWWWWWL',
    '.......|>WWWWW<|>.....<|>.....<|>.....<|>.....<|>.....<|>WWWWW<',
    '.......|.>WWW<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>WWW<.',
    '.......|..>W<..|..>.<..|..>j<..|..>.<..|..>j<..|..>.<..|..>W<..',
    '.......|...P...|..._...|..._...|..._...|..._...|..._...|...P...',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 3)],
  loot: [K.loot(4, 1, 6, 'temple')],
});

// ---------------------------------------------------------------------------------------------------------------
// Farms and pens

// vanilla FARM_SNOWY
const FARM_SNOWY = farmProcessor([['carrots', 0.1], ['potatoes', 0.8]]);

const farm1 = K.house('snowy_farm_1', {
  key: { k: 'composter' },
  layers: ['.........|LXXXXXXXL|Zfff~fffZ|Zfff~fffZ|Zfff~fffZ|Zfff~fffZ|LXXXXXXXL', '.k.......|.........|.123.321.|.231.132.|.312.213.|.123.321.|.........'],
  jigsaws: [entranceJ(4, 1, 0)],
});

const farm2 = K.house('snowy_farm_2', {
  key: { k: 'composter' },
  layers: [
    '.............|LXXXXXXXXXXXL|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|LXXXXXXXXXXXL',
    '.k.........k.|.............|.321.123.231.|.213.312.123.|.132.231.312.|.321.123.231.|.............',
  ],
  jigsaws: [entranceJ(6, 1, 0)],
});

const pen1 = K.house('snowy_animal_pen_1', {
  layers: ['...p...|.......|.......|.......|.......|.......|.......', '.......|FFFqFFF|F.....F|F.....F|F.H...F|F.....F|FFFFFFF'],
  jigsaws: [entranceJ(3, 1, 0), K.animal(2, 3), K.animal(4, 4)],
});

const pen2 = K.house('snowy_animal_pen_2', {
  layers: [
    '....p....|.........|.........|.........|.........|.........|PPPPPPPPP',
    '.........|FFFFqFFFF|F.......F|F.......F|F.......F|F.H.....F|LWWWWWWWL',
    '.........|.........|.........|.........|.........|.........|L.......L',
    '.........|.........|.........|.........|.........|_________|_________',
  ],
  jigsaws: [entranceJ(4, 1, 0), K.animal(2, 3), K.animal(5, 3), K.animal(3, 4)],
});

pool(`${V}/houses`, T, [
  [rigid(small1), 2], [rigid(small2), 2], [rigid(small3), 2], [rigid(small4), 3], [rigid(small5), 2], [rigid(small6), 2], [rigid(small7), 2], [rigid(small8), 2],
  [rigid(medium1), 2], [rigid(medium2), 2], [rigid(medium3), 2], [rigid(butcher1), 2], [rigid(butcher2), 2], [rigid(toolsmith), 2], [rigid(fletcher), 2],
  [rigid(shepherd), 3], [rigid(armorer1), 1], [rigid(armorer2), 1], [rigid(fisher), 2], [rigid(tannery), 2], [rigid(cartographer), 2], [rigid(library), 2],
  [rigid(mason1), 2], [rigid(mason2), 2], [rigid(weaponsmith), 2], [rigid(temple), 2], [rigid(farm1, FARM_SNOWY), 3], [rigid(farm2, FARM_SNOWY), 3],
  [rigid(pen1), 2], [rigid(pen2), 2], [EMPTY, 6],
]);
