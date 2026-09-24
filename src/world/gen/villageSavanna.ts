// Savanna villages (vanilla SavannaVillagePools): town centres, streets, decorations, houses, job sites, farms and
// pens, hand-made after vanilla's village/savanna/* structures: acacia planks on acacia log frames, terracotta floors
// and walls in orange, yellow, red and white, low acacia roofs, acacia doors and fences. Each house stands with its
// entrance to the north (see villagePlainsHouses.ts for the layout of a template).

import { pool, EMPTY, type Template } from './jigsaw';
import {
  villageKit, villagersPool, feature, treeFeature, pileHay, pileMelon, rigid, terrain, straightStreet, streetMap, farmProcessor, streetProcessor, entranceJ, bed,
} from './villageCommon';
import { PLAINS_TERMINATORS } from './villagePlains';

const AK: Record<string, string> = {
  P: 'acacia_planks', L: 'acacia_log[axis=y]', X: 'acacia_log[axis=x]', Z: 'acacia_log[axis=z]',
  O: 'orange_terracotta', Y: 'yellow_terracotta', R: 'red_terracotta', W: 'white_terracotta', A: 'terracotta',
  _: 'acacia_slab[type=bottom]', '^': 'acacia_stairs[facing=north]', v: 'acacia_stairs[facing=south]', '>': 'acacia_stairs[facing=east]', '<': 'acacia_stairs[facing=west]',
  D: 'acacia_door[facing=south,half=lower,hinge=left]', U: 'acacia_door[facing=south,half=upper,hinge=left]',
  F: 'acacia_fence', q: 'acacia_fence_gate[facing=north]', G: 'glass_pane', T: 'torch', t: 'wall_torch[facing=north]',
  p: 'dirt_path', g: 'grass_block', f: 'farmland[moisture=7]', '~': 'water', H: 'hay_block[axis=y]',
  '1': 'wheat[age=2]', '2': 'wheat[age=5]', '3': 'wheat[age=7]', B: 'bookshelf', k: 'chest[facing=north]', a: 'ladder[facing=west]',
};

const K = villageKit('savanna', AK);
const V = K.V;

// vanilla STREET_SAVANNA
const STREET_SAVANNA = streetProcessor('acacia_planks', 0.2);

// ---------------------------------------------------------------------------------------------------------------
// Town centres

const meeting1 = K.piece('town_centers/savanna_meeting_point_1', {
  key: { b: 'bell[attachment=ceiling,facing=north]' },
  layers: [
    'ppppppppp|ppppppppp|ppppppppp|pppOYOppp|pppYOYppp|pppOYOppp|ppppppppp|ppppppppp|ppppppppp',
    '.........|.........|.H.......|.........|..L...L..|.........|.......H.|.........|.........',
    '.........|.........|.........|.........|..L...L..|.........|.........|.........|.........',
    '.........|.........|.........|.........|..L.b.L..|.........|.........|.........|.........',
    '.........|.........|.........|.........|..XXXXX..|.........|.........|.........|.........',
  ],
  jigsaws: [
    K.street(4, 1, 0, 'north'), K.street(4, 1, 8, 'south'), K.street(0, 1, 4, 'west'), K.street(8, 1, 4, 'east'),
    K.golem(7, 1), K.villager(1, 7), K.villager(7, 7),
  ],
});

// (a well under a little roof, the bell hung from it)
const meeting2 = K.piece('town_centers/savanna_meeting_point_2', {
  key: { b: 'bell[attachment=ceiling,facing=north]' },
  layers: [
    'ppppppppppp|ppppppppppp|ppppppppppp|pppAAAAAppp|pppA~~~Appp|pppA~~~Appp|pppA~~~Appp|pppAAAAAppp|ppppppppppp|ppppppppppp|ppppppppppp',
    '...........|...........|...........|...FAAAF...|...A...A...|...A...A...|...A...A...|...FAAAF...|...........|...........|...........',
    '...........|...........|...........|...F...F...|...........|...........|...........|...F...F...|...........|...........|...........',
    '...........|...........|...........|...F...F...|...........|.....b.....|...........|...F...F...|...........|...........|...........',
    '...........|...........|...........|..vvvvvvv..|..>PPPPP<..|..>PPPPP<..|..>PPPPP<..|..^^^^^^^..|...........|...........|...........',
    '...........|...........|...........|...........|..._____...|..._____...|..._____...|...........|...........|...........|...........',
  ],
  jigsaws: [
    K.street(5, 1, 0, 'north'), K.street(5, 1, 10, 'south'), K.street(0, 1, 5, 'west'), K.street(10, 1, 5, 'east'),
    K.golem(1, 1), K.villager(9, 9), K.villager(1, 9),
  ],
});

const meeting3 = K.piece('town_centers/savanna_meeting_point_3', {
  key: { b: 'bell[attachment=floor,facing=north]' },
  layers: [
    'ppppppp|ppppppp|ppYYYpp|ppYOYpp|ppYYYpp|ppppppp|ppppppp',
    '.......|.F...F.|.......|...O...|.......|.F...F.|.......',
    '.......|.F...F.|.......|...b...|.......|.F...F.|.......',
    '.......|.T...T.|.......|.......|.......|.T...T.|.......',
  ],
  jigsaws: [
    K.street(3, 1, 0, 'north'), K.street(3, 1, 6, 'south'), K.street(0, 1, 3, 'west'), K.street(6, 1, 3, 'east'),
    K.golem(5, 3), K.villager(1, 3), K.villager(3, 5),
  ],
});

// (a market awning on four posts, the bell under it)
const meeting4 = K.piece('town_centers/savanna_meeting_point_4', {
  key: { b: 'bell[attachment=ceiling,facing=north]' },
  layers: [
    'ppppppppp|ppppppppp|ppppppppp|ppppppppp|ppppppppp|ppppppppp|ppppppppp|ppppppppp|ppppppppp',
    '.........|.L.....L.|.........|...H.H...|.........|...H.....|.........|.L.....L.|.........',
    '.........|.L.....L.|.........|.........|.........|.........|.........|.L.....L.|.........',
    '.........|.L.....L.|.........|.........|....b....|.........|.........|.L.....L.|.........',
    '.........|._______.|._______.|._______.|._______.|._______.|._______.|._______.|.........',
  ],
  jigsaws: [
    K.street(4, 1, 0, 'north'), K.street(4, 1, 8, 'south'), K.street(0, 1, 4, 'west'), K.street(8, 1, 4, 'east'),
    K.golem(6, 5), K.villager(2, 5), K.villager(6, 3),
  ],
});

/** the zombie villages' town centres (see villages.ts ZOMBIE_STARTS): for now, the living ones */
export const SAVANNA_ZOMBIE_TOWN_CENTERS = [rigid(meeting1), rigid(meeting2), rigid(meeting3), rigid(meeting4)];

pool(`${V}/town_centers`, 'empty', [
  [rigid(meeting1), 100], [rigid(meeting2), 50], [rigid(meeting3), 150], [rigid(meeting4), 150],
  [SAVANNA_ZOMBIE_TOWN_CENTERS[0], 2], [SAVANNA_ZOMBIE_TOWN_CENTERS[1], 1], [SAVANNA_ZOMBIE_TOWN_CENTERS[2], 3], [SAVANNA_ZOMBIE_TOWN_CENTERS[3], 3],
]);

// ---------------------------------------------------------------------------------------------------------------
// Streets

const st = (n: string) => `${V}/streets/${n}`;
const streets: [Template, number][] = [
  [streetMap(st('corner_01'), ['.ppp...', '.ppppp.', '.pppppp', '.pppppp', '.......'], [K.street(2, 1, 0, 'north'), K.street(6, 1, 2, 'east'), K.plot(0, 1, 2, 'west'), K.plot(2, 1, 4, 'south'), K.decor(0, 4)]), 2],
  [streetMap(st('corner_03'), ['.ppp..', '.ppp..', '.ppppp', '.ppppp', '..ppp.', '......'], [K.street(2, 1, 0, 'north'), K.street(5, 1, 3, 'east'), K.plot(0, 1, 3, 'west'), K.plot(2, 1, 5, 'south'), K.decor(5, 5)]), 2],
  [straightStreet(V, st('straight_02'), 11, [[2, 'e'], [5, 'w'], [8, 'e']], [[1, 'w'], [9, 'w']]), 4],
  [straightStreet(V, st('straight_04'), 8, [[3, 'w'], [4, 'e']], [[7, 'w']]), 7],
  [straightStreet(V, st('straight_05'), 15, [[2, 'e'], [4, 'w'], [8, 'e'], [10, 'w'], [13, 'e']], [[7, 'w'], [14, 'w']]), 3],
  [straightStreet(V, st('straight_06'), 6, [[3, 'e']], [[2, 'w']]), 4],
  [straightStreet(V, st('straight_08'), 10, [[2, 'w'], [6, 'e'], [7, 'w']], [[4, 'e']]), 4],
  [straightStreet(V, st('straight_09'), 12, [[3, 'e'], [4, 'w'], [9, 'e'], [10, 'w']], [[1, 'e'], [7, 'w']]), 4],
  [straightStreet(V, st('straight_10'), 7, [[3, 'w']], [[1, 'e'], [5, 'e']]), 4],
  [straightStreet(V, st('straight_11'), 9, [[2, 'e'], [6, 'w']], [[4, 'w'], [8, 'e']]), 4],
  [streetMap(st('crossroad_02'), ['..ppp..', '..ppp..', 'ppppppp', 'ppppppp', 'ppppppp', '..ppp..', '..ppp..'], [K.street(3, 1, 0, 'north'), K.street(3, 1, 6, 'south'), K.street(0, 1, 3, 'west'), K.street(6, 1, 3, 'east'), K.decor(0, 0), K.decor(6, 6)]), 1],
  [streetMap(st('crossroad_03'), ['..ppp..', 'ppppppp', 'ppppppp', 'ppppppp', '.......'], [K.street(3, 1, 0, 'north'), K.street(0, 1, 2, 'west'), K.street(6, 1, 2, 'east'), K.plot(3, 1, 4, 'south'), K.decor(0, 4), K.decor(6, 4)]), 2],
  [streetMap(st('crossroad_04'), ['.ppp.', '.ppp.', '.pppp', '.pppp', '.pppp', '.ppp.', '.ppp.'], [K.street(2, 1, 0, 'north'), K.street(2, 1, 6, 'south'), K.street(4, 1, 3, 'east'), K.plot(0, 1, 2, 'west'), K.plot(0, 1, 5, 'west'), K.decor(4, 0)]), 2],
  [streetMap(st('crossroad_05'), ['.ppp.', '.ppp.', 'pppp.', 'pppp.', 'pppp.', '.ppp.', '.ppp.', '.ppp.'], [K.street(2, 1, 0, 'north'), K.street(2, 1, 7, 'south'), K.street(0, 1, 3, 'west'), K.plot(4, 1, 2, 'east'), K.plot(4, 1, 6, 'east'), K.decor(0, 7)]), 2],
  [streetMap(st('crossroad_06'), ['...ppp...', '...ppp...', 'ppppppppp', 'ppppppppp', 'ppppppppp', '.........'], [K.street(4, 1, 0, 'north'), K.street(0, 1, 3, 'west'), K.street(8, 1, 3, 'east'), K.plot(2, 1, 5, 'south'), K.plot(6, 1, 5, 'south'), K.plot(1, 1, 0, 'north'), K.plot(7, 1, 0, 'north'), K.decor(8, 5)]), 2],
  [streetMap(st('crossroad_07'), ['...ppp...', '..ppppp..', 'ppppppppp', 'ppppppppp', 'ppppppppp', 'ppppppppp', 'ppppppppp', '..ppppp..', '...ppp...'], [K.street(4, 1, 0, 'north'), K.street(4, 1, 8, 'south'), K.street(0, 1, 4, 'west'), K.street(8, 1, 4, 'east'), K.decor(0, 0), K.decor(8, 8), K.decor(8, 0), K.decor(0, 8)]), 2],
  // splits: the street goes on and a branch leaves it at the far end
  [streetMap(st('split_01'), ['.ppp...', '.ppp...', '.ppp...', '.pppppp', '.pppppp', '.pppppp', '.ppp...', '.ppp...'], [K.street(2, 1, 0, 'north'), K.street(2, 1, 7, 'south'), K.street(6, 1, 4, 'east'), K.plot(0, 1, 2, 'west'), K.plot(0, 1, 6, 'west'), K.decor(6, 1)]), 2],
  [streetMap(st('split_02'), ['...ppp.', '...ppp.', '...ppp.', 'pppppp.', 'pppppp.', 'pppppp.', '...ppp.', '...ppp.'], [K.street(4, 1, 0, 'north'), K.street(4, 1, 7, 'south'), K.street(0, 1, 4, 'west'), K.plot(6, 1, 2, 'east'), K.plot(6, 1, 6, 'east'), K.decor(0, 1)]), 2],
  [streetMap(st('turn_01'), ['.ppp...', '.ppp...', '.pppp..', '..pppp.', '...ppp.', '...ppp.', '...ppp.'], [K.street(2, 1, 0, 'north'), K.street(4, 1, 6, 'south'), K.plot(0, 1, 5, 'west'), K.plot(6, 1, 1, 'east'), K.decor(0, 3)]), 3],
];
pool(`${V}/streets`, `${V}/terminators`, streets.map(([t, w]) => [terrain(t, STREET_SAVANNA), w]));

// vanilla's savanna terminators: the plains ones and a fifth of its own
const T = `${V}/terminators`;
const terminator5 = streetMap(`${T}/terminator_05`, ['.ppp.', 'ppppp', '.ppp.', '..p..'], [K.street(2, 1, 0, 'north')]);
pool(T, 'empty', [...PLAINS_TERMINATORS, terminator5].map((t) => [terrain(t, STREET_SAVANNA), 1]));

// ---------------------------------------------------------------------------------------------------------------
// Decorations: lamp posts, acacias, hay and melons

const lamp = K.piece('savanna_lamp_post_01', {
  layers: ['F', 'F', 'T'],
  jigsaws: [{ at: [0, 0, 0], facing: 'down', top: 'south', name: 'bottom', target: 'bottom', final: 'acacia_fence' }],
});
pool(`${V}/decor`, 'empty', [[rigid(lamp), 4], [feature(treeFeature('acacia'), 'acacia'), 4], [feature(pileHay, 'pile_hay'), 4], [feature(pileMelon, 'pile_melon'), 1], [EMPTY, 4]]);

villagersPool('savanna', 'savanna');

// ---------------------------------------------------------------------------------------------------------------
// Houses

const small1 = K.house('savanna_small_house_1', {
  key: { ...bed('orange', 'south'), k: 'chest[facing=west]' },
  layers: [
    '..p..|PPPPP|POYOP|PYOYP|POYOP|PPPPP',
    '.....|LPDPL|P...P|Gb..G|Ph.kP|LPPPL',
    '.....|LPUPL|P...P|G...G|P..tP|LPGPL',
    '.....|LPPPL|P...P|P...P|P...P|LPPPL',
    '.....|vvvvv|>PPP<|>PPP<|>PPP<|^^^^^',
    '.....|.....|.___.|.___.|.___.|.....',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(3, 1, 4, 'savanna_house')],
});

const small2 = K.house('savanna_small_house_2', {
  key: { ...bed('yellow', 'east') },
  layers: [
    '..p...|PPPPPP|POOOOP|POOOOP|POOOOP|PPPPPP',
    '......|LPDPPL|P....P|G....G|Pbh.kP|LPPPPL',
    '......|LPUGPL|P....P|G....G|P..t.P|LPGPGL',
    '......|LPPPPL|P....P|P....P|P....P|LPPPPL',
    '......|______|______|______|______|______',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(3, 2)],
  loot: [K.loot(4, 1, 4, 'savanna_house')],
});

const small3 = K.house('savanna_small_house_3', {
  key: { ...bed('red', 'south'), k: 'chest[facing=west]' },
  layers: [
    '..p..|AAAAA|AOOOA|AOOOA|AOOOA|AOOOA|AAAAA',
    '.....|LADAL|A...A|A...A|Ab..A|Ah.kA|LAAAL',
    '.....|LAUAL|A...A|G...G|A...A|A..tA|LAGAL',
    '.....|LYYYL|Y...Y|Y...Y|Y...Y|Y...Y|LYYYL',
    '.....|vvvvv|>PPP<|>PPP<|>PPP<|>PPP<|^^^^^',
    '.....|.....|.___.|.___.|.___.|.___.|.....',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(3, 1, 5, 'savanna_house')],
});

const small4 = K.house('savanna_small_house_4', {
  key: { ...bed('orange', 'east') },
  layers: [
    '...p...|PPPPPPP|POOYOOP|POYYYOP|POOYOOP|PPPPPPP',
    '.......|LPPDPPL|P.....P|G.....G|Pbh..kP|LPPPPPL',
    '.......|LGPUPGL|P.....P|G.....G|P..t..P|LPPPPPL',
    '.......|LPPPPPL|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|vvvvvvv|>PPPPP<|>PPPPP<|>PPPPP<|^^^^^^^',
    '.......|.......|.vvvvv.|.>___<.|.^^^^^.|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2), K.cat(4, 2)],
  loot: [K.loot(5, 1, 4, 'savanna_house')],
});

// (a porch on two fence posts)
const small5 = K.house('savanna_small_house_5', {
  key: { ...bed('white', 'south') },
  layers: [
    '..p..|.PPP.|PPPPP|POOOP|POOOP|POOOP|PPPPP',
    '.....|.F.F.|LPDPL|P...P|G..bG|Pk.hP|LPPPL',
    '.....|.F.F.|LPUPL|P...P|G...G|P...P|LPGPL',
    '.....|.___.|LPPPL|P...P|P...P|P...P|LPPPL',
    '.....|.....|_____|_____|_____|_____|_____',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 3)],
  loot: [K.loot(1, 1, 5, 'savanna_house')],
});

const small6 = K.house('savanna_small_house_6', {
  key: { ...bed('lime', 'east') },
  layers: [
    '..p...|PPPPPP|PYYYYP|PYOOYP|PYOOYP|PYYYYP|PPPPPP',
    '......|LPDPPL|P....P|P....P|P....P|Pbh.kP|LPPPPL',
    '......|LPUPPL|G....G|P....P|G....G|P...tP|LPPPPL',
    '......|LOOOOL|O....O|O....O|O....O|O....O|LOOOOL',
    '......|______|______|______|______|______|______',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2), K.cat(3, 3)],
  loot: [K.loot(4, 1, 5, 'savanna_house')],
});

// (a hut with its corners cut)
const small7 = K.house('savanna_small_house_7', {
  key: { ...bed('red', 'east') },
  layers: [
    '..p..|.PPP.|POOOP|POOOP|POOOP|.PPP.',
    '.....|.PDP.|P...P|P...P|Pbh.P|.PPP.',
    '.....|.PUP.|G...G|P...P|G...G|.PGP.',
    '.....|.PPP.|P...P|P...P|P...P|.PPP.',
    '.....|.___.|_PPP_|_PPP_|_PPP_|.___.',
    '.....|.....|.___.|.___.|.___.|.....',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
});

const small8 = K.house('savanna_small_house_8', {
  key: { ...bed('yellow', 'south'), k: 'chest[facing=west]' },
  layers: [
    '..p..|PPPPP|POOOP|POOOP|POOOP|POOOP|POOOP|PPPPP',
    '.....|LPDPL|P...P|G...G|P...P|Pb.kP|Ph..P|LPPPL',
    '.....|LPUPL|P...P|G...G|P...P|P...P|P..tP|LPGPL',
    '.....|LPPPL|P...P|P...P|P...P|P...P|P...P|LPPPL',
    '.....|vvvvv|>PPP<|>PPP<|>PPP<|>PPP<|>PPP<|^^^^^',
    '.....|.....|.___.|.___.|.___.|.___.|.___.|.....',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 3)],
  loot: [K.loot(3, 1, 5, 'savanna_house')],
});

const medium1 = K.house('savanna_medium_house_1', {
  key: { ...bed('orange', 'east'), ...bed('orange', 'west', 'e', 'i') },
  layers: [
    '....p....|PPPPPPPPP|POOOOOOOP|POYYYYYOP|POYOOOYOP|POYYYYYOP|POOOOOOOP|PPPPPPPPP',
    '.........|LPPPDPPPL|P.......P|G.......G|P.......P|G.......G|Pbh.k.ieP|LPPPPPPPL',
    '.........|LGPPUPPGL|P.......P|G.......G|P.......P|G.......G|P...t...P|LPPGPGPPL',
    '.........|LPPPPPPPL|P.......P|P.......P|P.......P|P.......P|P.......P|LPPPPPPPL',
    '.........|vvvvvvvvv|>PPPPPPP<|>PPPPPPP<|>PPPPPPP<|>PPPPPPP<|>PPPPPPP<|^^^^^^^^^',
    '.........|.........|.vvvvvvv.|.>.....<.|.>.....<.|.>.....<.|.^^^^^^^.|.........',
    '.........|.........|.........|..vvvvv..|..>___<..|..^^^^^..|.........|.........',
  ],
  jigsaws: [entranceJ(4, 1, 0), K.villager(4, 3), K.villager(2, 4), K.cat(6, 3)],
  loot: [K.loot(4, 1, 6, 'savanna_house')],
});

// (two storeys, a ladder in the corner)
const medium2 = K.house('savanna_medium_house_2', {
  key: { ...bed('orange', 'east') },
  layers: [
    '...p...|PPPPPPP|POOOOOP|POOOOOP|POOOOOP|POOOOOP|POOOOOP|PPPPPPP',
    '.......|LPPDPPL|P.....P|G.....G|P.....P|G.....G|Pk...aP|LPPPPPL',
    '.......|LGPUPGL|P.....P|G.....G|P.....P|G.....G|P..t.aP|LPPPPPL',
    '.......|LPPPPPL|P.....P|P.....P|P.....P|P.....P|P....aP|LPPPPPL',
    '.......|LXXXXXL|ZPPPPPZ|ZPPPPPZ|ZPPPPPZ|ZPPPPPZ|ZPPPPaZ|LXXXXXL',
    '.......|LPPPPPL|Pbh...P|G.....G|P.....P|G.....G|Pbh...P|LPPPPPL',
    '.......|LPGPGPL|P.....P|G.....G|P.....P|G.....G|P..t..P|LPPPPPL',
    '.......|LPPPPPL|P.....P|P.....P|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|_______|_______|_______|_______|_______|_______|_______',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 3), K.villager(3, 3, 'air', 4)],
  loot: [K.loot(1, 1, 6, 'savanna_house')],
});

// ---------------------------------------------------------------------------------------------------------------
// Job sites

const butcher1 = K.house('savanna_butchers_shop_1', {
  key: { z: 'smoker[facing=north]', q: 'acacia_fence_gate[facing=east]' },
  layers: [
    '...p...|PPPPPPP|POOOOOP|POOOOOP|PPPPPPP|ggggggg|ggggggg|ggggggg|ggggggg',
    '.......|LPPDPPL|P.....P|Pz.k..P|LPPPPPL|F.....F|q.....F|F.....F|FFFFFFF',
    '.......|LGPUPGL|P.....P|P..t..P|LPGPPPL|.......|.......|.......|.......',
    '.......|LPPPPPL|P.....P|P.....P|LPPPPPL|.......|.......|.......|.......',
    '.......|_______|_______|_______|_______|.......|.......|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2), K.animal(2, 6, 'air', 'village/common/butcher_animals'), K.animal(4, 7, 'air', 'village/common/butcher_animals')],
  loot: [K.loot(3, 1, 3, 'butcher')],
});

// (an open stall under a roof, the pen behind it)
const butcher2 = K.house('savanna_butchers_shop_2', {
  key: { z: 'smoker[facing=north]' },
  layers: [
    '...p...|PPPPPPP|PPPPPPP|PPPPPPP|ggggggg|ggggggg|ggggggg',
    '.......|L.....L|..z.k..|L.....L|FFFqFFF|F.....F|FFFFFFF',
    '.......|L.....L|.......|L.....L|.......|.......|.......',
    '.......|L.....L|.......|L.....L|.......|.......|.......',
    '.......|_______|_______|_______|.......|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 1), K.animal(2, 5, 'air', 'village/common/butcher_animals'), K.animal(4, 5, 'air', 'village/common/butcher_animals')],
  loot: [K.loot(4, 1, 2, 'butcher')],
});

const toolsmith = K.house('savanna_tool_smith_1', {
  key: { m: 'smithing_table' },
  layers: [
    '...p...|PPPPPPP|POOOOOP|POOOOOP|POOOOOP|PPPPPPP',
    '.......|LPPDPPL|P.....P|G.....G|Pm..k.P|LPPPPPL',
    '.......|LGPUPGL|P.....P|G.....G|P..t..P|LPPPPPL',
    '.......|LPPPPPL|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|vvvvvvv|>PPPPP<|>PPPPP<|>PPPPP<|^^^^^^^',
    '.......|.......|.vvvvv.|.>___<.|.^^^^^.|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2)],
  loot: [K.loot(4, 1, 4, 'toolsmith')],
});

const fletcher = K.house('savanna_fletcher_house_1', {
  key: { ...bed('lime', 'south'), m: 'fletching_table' },
  layers: [
    '..p..|PPPPP|POOOP|POOOP|POOOP|POOOP|PPPPP',
    '.....|LPDPL|P...P|Pm..P|P..bP|Pk.hP|LPPPL',
    '.....|LPUPL|P...P|G...G|P...P|P.t.P|LGPGL',
    '.....|LPPPL|P...P|P...P|P...P|P...P|LPPPL',
    '.....|_____|_____|_____|_____|_____|_____',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(1, 1, 5, 'fletcher')],
});

// (a sheep pen beside the house)
const shepherd = K.house('savanna_shepherd_1', {
  key: { ...bed('white', 'south'), l: 'loom[facing=north]', q: 'acacia_fence_gate[facing=east]' },
  layers: [
    '...p.......|PPPPPPP....|POOOOOP....|POOOOOP....|POOOOOP....|PPPPPPP....',
    '...........|LPPDPPLFFFF|P.....P...F|G....bG...q|Pl.k.hP...F|LPPPPPLFFFF',
    '...........|LGPUPGL....|P.....P....|G.....G....|P..t..P....|LPPPPPL....',
    '...........|LPPPPPL....|P.....P....|P.....P....|P.....P....|LPPPPPL....',
    '...........|_______....|_______....|_______....|_______....|_______....',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2), K.animal(8, 3, 'air', 'village/common/sheep')],
  loot: [K.loot(3, 1, 4, 'shepherd')],
});

const armorer = K.house('savanna_armorer_1', {
  key: { z: 'blast_furnace[facing=north]' },
  layers: [
    '..p..|PPPPP|POOOP|POOOP|PPPPP',
    '.....|LPDPL|P...P|Pz.kP|LPPPL',
    '.....|LPUPL|G...G|P.t.P|LPPPL',
    '.....|LPPPL|P...P|P...P|LPPPL',
    '.....|_____|_____|_____|_____',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(3, 1, 3, 'armorer')],
});

const fisher = K.house('savanna_fisher_cottage_1', {
  key: { r: 'barrel[facing=up]', k: 'chest[facing=west]' },
  layers: [
    '..p......|PPPPP....|POOOP.~~.|POOOP.~~.|POOOP....|PPPPP....',
    '.........|LPDPL....|P...P....|G...G....|Pr.kP....|LPPPL....',
    '.........|LPUPL....|P...P....|G...G....|P...P....|LPGPL....',
    '.........|LPPPL....|P...P....|P...P....|P...P....|LPPPL....',
    '.........|_____....|_____....|_____....|_____....|_____....',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(3, 1, 4, 'fisher')],
});

const tannery = K.house('savanna_tannery_1', {
  key: { u: 'cauldron' },
  layers: [
    '...p...|PPPPPPP|POOOOOP|POOOOOP|POOOOOP|PPPPPPP',
    '.......|LPPDPPL|P.....P|G.....G|Pu.k..P|LPPPPPL',
    '.......|LGPUPGL|P.....P|G.....G|P..t..P|LPPPPPL',
    '.......|LYYYYYL|Y.....Y|Y.....Y|Y.....Y|LYYYYYL',
    '.......|_______|_______|_______|_______|_______',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2)],
  loot: [K.loot(3, 1, 4, 'tannery')],
});

const cartographer = K.house('savanna_cartographer_1', {
  key: { m: 'cartography_table' },
  layers: [
    '...p...|PPPPPPP|POOOOOP|POOOOOP|POOOOOP|POOOOOP|PPPPPPP',
    '.......|LPPDPPL|P.....P|G.....G|P.....P|Pm.k..P|LPPPPPL',
    '.......|LGPUPGL|P.....P|G.....G|P.....P|P...t.P|LPPGPPL',
    '.......|LPPPPPL|P.....P|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|vvvvvvv|>PPPPP<|>PPPPP<|>PPPPP<|>PPPPP<|^^^^^^^',
    '.......|.......|.vvvvv.|.>___<.|.>___<.|.^^^^^.|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 3)],
  loot: [K.loot(3, 1, 5, 'cartographer')],
});

const library = K.house('savanna_library_1', {
  key: { n: 'lectern[facing=north]' },
  layers: [
    '....p....|PPPPPPPPP|POOOOOOOP|POOOOOOOP|POOOOOOOP|POOOOOOOP|PPPPPPPPP',
    '.........|LPPPDPPPL|PB.....BP|PB.....BP|G.......G|PBB.n.BBP|LPPPPPPPL',
    '.........|LPPPUPPPL|PB.....BP|PB.....BP|G.......G|PBB...BBP|LPPGPGPPL',
    '.........|LPPPPPPPL|P.......P|P.......P|P.......P|P...t...P|LPPPPPPPL',
    '.........|vvvvvvvvv|>PPPPPPP<|>PPPPPPP<|>PPPPPPP<|>PPPPPPP<|^^^^^^^^^',
    '.........|.........|.vvvvvvv.|.>_____<.|.>_____<.|.^^^^^^^.|.........',
  ],
  jigsaws: [entranceJ(4, 1, 0), K.villager(4, 3)],
});

const mason = K.house('savanna_mason_1', {
  key: { m: 'stonecutter[facing=north]', k: 'chest[facing=west]' },
  layers: [
    '..p..|PPPPP|POOOP|POOOP|POOOP|PPPPP',
    '.....|LPDPL|P...P|G...G|Pm.kP|LPPPL',
    '.....|LPUPL|P...P|G...G|P...P|LPGPL',
    '.....|LAAAL|A...A|A...A|A...A|LAAAL',
    '.....|_____|_____|_____|_____|_____',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(3, 1, 4, 'mason')],
});

const weaponsmith1 = K.house('savanna_weaponsmith_1', {
  key: { r: 'grindstone[face=floor,facing=north]', x: 'furnace[facing=north]' },
  layers: [
    '...p...|PPPPPPP|POOOOOP|POOOOOP|POOOOOP|PPPPPPP',
    '.......|LPPDPPL|P.....P|Pr....P|Pk...xP|LPPPPPL',
    '.......|LGPUPGL|P.....P|G.....G|P..t..P|LPPPPPL',
    '.......|LPPPPPL|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|_______|_______|_______|_______|_______',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2)],
  loot: [K.loot(1, 1, 4, 'weaponsmith')],
});

// (an open workshop under a roof on posts, a terracotta back wall)
const weaponsmith2 = K.house('savanna_weaponsmith_2', {
  key: { r: 'grindstone[face=floor,facing=north]', x: 'furnace[facing=north]' },
  layers: [
    '...p...|PPPPPPP|PPPPPPP|PPPPPPP|PPPPPPP',
    '.......|L.....L|.......|.r.k.x.|LAAAAAL',
    '.......|L.....L|.......|...t...|LAAAAAL',
    '.......|L.....L|.......|.......|LAAAAAL',
    '.......|_______|_______|_______|_______',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2)],
  loot: [K.loot(3, 1, 3, 'weaponsmith')],
});

// (tall, in terracotta, with a stepped roof)
const temple1 = K.house('savanna_temple_1', {
  key: { q: 'brewing_stand' },
  layers: [
    '...p...|PPPPPPP|PWWWWWP|PWYYYWP|PWYYYWP|PWWWWWP|PPPPPPP',
    '.......|LAADAAL|A.....A|A.....A|A.....A|A.q.k.A|LAAAAAL',
    '.......|LAAUAAL|A.....A|G.....G|A.....A|A..t..A|LAAAAAL',
    '.......|LAAAAAL|A.....A|G.....G|A.....A|A.....A|LAAAAAL',
    '.......|LWWWWWL|W.....W|W.....W|W.....W|W.....W|LWWWWWL',
    '.......|vvvvvvv|>PPPPP<|>PPPPP<|>PPPPP<|>PPPPP<|^^^^^^^',
    '.......|.......|.vvvvv.|.>...<.|.>...<.|.^^^^^.|.......',
    '.......|.......|.......|..___..|..___..|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 3)],
  loot: [K.loot(4, 1, 5, 'temple')],
});

const temple2 = K.house('savanna_temple_2', {
  key: { q: 'brewing_stand', u: 'water_cauldron[level=3]' },
  layers: [
    '...p...|PPPPPPP|POOOOOP|POOOOOP|POOOOOP|POOOOOP|POOOOOP|PPPPPPP',
    '.......|LPPDPPL|P.....P|G.....G|P.....P|G.....G|Pq.u.kP|LPPPPPL',
    '.......|LPPUPPL|P.....P|G.....G|P.....P|G.....G|P..t..P|LPPPPPL',
    '.......|LPPPPPL|P.....P|P.....P|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|LRRRRRL|R.....R|R.....R|R.....R|R.....R|R.....R|LRRRRRL',
    '.......|_______|_______|_______|_______|_______|_______|_______',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 3)],
  loot: [K.loot(5, 1, 6, 'temple')],
});

// ---------------------------------------------------------------------------------------------------------------
// Farms and pens

// vanilla FARM_SAVANNA
const FARM_SAVANNA = farmProcessor([['melon_stem', 0.1]]);

const largeFarm1 = K.house('savanna_large_farm_1', {
  key: { k: 'composter' },
  layers: [
    '.............|LXXXXXXXXXXXL|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|LXXXXXXXXXXXL',
    '.k.........k.|.............|.321.123.231.|.213.312.123.|.132.231.312.|.321.123.231.|.213.312.123.|.132.231.312.|.321.123.231.|.213.312.123.|.132.231.312.|.............',
  ],
  jigsaws: [entranceJ(6, 1, 0)],
});

// (a path down the middle between two fields)
const largeFarm2 = K.house('savanna_large_farm_2', {
  key: { k: 'composter' },
  layers: [
    '.....p.....|LXXXXpXXXXL|Zfff~p~fffZ|Zfff~p~fffZ|Zfff~p~fffZ|Zfff~p~fffZ|Zfff~p~fffZ|Zfff~p~fffZ|LXXXXXXXXXL',
    '....k......|...........|.123...321.|.231...132.|.312...213.|.123...321.|.231...132.|.312...213.|...........',
  ],
  jigsaws: [entranceJ(5, 1, 0)],
});

const smallFarm = K.house('savanna_small_farm', {
  key: { k: 'composter' },
  layers: ['.......|LXXXXXL|Zff~ffZ|Zff~ffZ|Zff~ffZ|Zff~ffZ|LXXXXXL', '..k....|.......|.12.21.|.23.32.|.31.13.|.12.21.|.......'],
  jigsaws: [entranceJ(3, 1, 0)],
});

const pen1 = K.house('savanna_animal_pen_1', {
  layers: ['...p...|.......|.......|.......|.......|.......|.......', '.......|FFFqFFF|F.....F|F.....F|F.H...F|F.....F|FFFFFFF'],
  jigsaws: [entranceJ(3, 1, 0), K.animal(2, 3), K.animal(4, 4)],
});

// (with a low shelter at the back)
const pen2 = K.house('savanna_animal_pen_2', {
  layers: [
    '....p....|.........|.........|.........|.........|.........|PPPPPPPPP',
    '.........|FFFFqFFFF|F.......F|F.......F|F.......F|F.H.....F|LPPPPPPPL',
    '.........|.........|.........|.........|.........|.........|L.......L',
    '.........|.........|.........|.........|.........|_________|_________',
  ],
  jigsaws: [entranceJ(4, 1, 0), K.animal(2, 3), K.animal(5, 3), K.animal(3, 4)],
});

// (a big pen with a water hole)
const pen3 = K.house('savanna_animal_pen_3', {
  layers: [
    '.....p.....|...........|...........|...........|...........|...........|.......~...|...........|...........',
    '...........|FFFFFqFFFFF|F.........F|F.........F|F..H......F|F.........F|F.........F|F.........F|FFFFFFFFFFF',
  ],
  jigsaws: [entranceJ(5, 1, 0), K.animal(3, 3), K.animal(6, 4), K.animal(4, 6), K.animal(8, 3)],
});

pool(`${V}/houses`, T, [
  [rigid(small1), 2], [rigid(small2), 2], [rigid(small3), 2], [rigid(small4), 2], [rigid(small5), 2], [rigid(small6), 2], [rigid(small7), 2], [rigid(small8), 2],
  [rigid(medium1), 2], [rigid(medium2), 2], [rigid(butcher1), 2], [rigid(butcher2), 2], [rigid(toolsmith), 2], [rigid(fletcher), 2], [rigid(shepherd), 7],
  [rigid(armorer), 1], [rigid(fisher), 3], [rigid(tannery), 2], [rigid(cartographer), 2], [rigid(library), 2], [rigid(mason), 2],
  [rigid(weaponsmith1), 2], [rigid(weaponsmith2), 2], [rigid(temple1), 2], [rigid(temple2), 3],
  [rigid(largeFarm1, FARM_SAVANNA), 4], [rigid(largeFarm2, FARM_SAVANNA), 6], [rigid(smallFarm, FARM_SAVANNA), 4],
  [rigid(pen1), 2], [rigid(pen2), 2], [rigid(pen3), 2], [EMPTY, 5],
]);
