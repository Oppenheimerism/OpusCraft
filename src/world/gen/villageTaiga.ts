// Taiga villages (vanilla TaigaVillagePools): town centres, streets, decorations, houses, job sites, farms and pens,
// hand-made after vanilla's village/taiga/* structures: cobblestone footings (a tenth of it mossy), spruce log frames
// and plank walls, steep spruce roofs, lanterns, pumpkins and sweet berries. Each house stands with its entrance to
// the north (see villagePlainsHouses.ts for the layout of a template).

import { pool, EMPTY, type Template } from './jigsaw';
import {
  villageKit, villagersPool, feature, treeFeature, pilePumpkin, patchTaigaGrass, patchBerryBush, rigid, terrain, straightStreet, streetMap, farmProcessor,
  entranceJ, bed, MOSSIFY_10,
} from './villageCommon';
import { PLAINS_TERMINATORS } from './villagePlains';
import { STREET_SNOWY_OR_TAIGA } from './villageSnowy';

const TK: Record<string, string> = {
  P: 'spruce_planks', L: 'spruce_log[axis=y]', X: 'spruce_log[axis=x]', Z: 'spruce_log[axis=z]', C: 'cobblestone', S: 'stone_bricks',
  _: 'spruce_slab[type=bottom]', '^': 'spruce_stairs[facing=north]', v: 'spruce_stairs[facing=south]', '>': 'spruce_stairs[facing=east]', '<': 'spruce_stairs[facing=west]',
  D: 'spruce_door[facing=south,half=lower,hinge=left]', U: 'spruce_door[facing=south,half=upper,hinge=left]',
  F: 'spruce_fence', q: 'spruce_fence_gate[facing=north]', G: 'glass_pane', T: 'torch', t: 'wall_torch[facing=north]',
  j: 'lantern[hanging=true]', J: 'lantern', p: 'dirt_path', g: 'grass_block', f: 'farmland[moisture=7]', '~': 'water', H: 'hay_block[axis=y]',
  o: 'pumpkin', '1': 'wheat[age=2]', '2': 'wheat[age=5]', '3': 'wheat[age=7]', B: 'bookshelf', k: 'chest[facing=north]', a: 'ladder[facing=west]',
};

const K = villageKit('taiga', TK);
const V = K.V;
const house = (t: Template) => rigid(t, MOSSIFY_10);

// ---------------------------------------------------------------------------------------------------------------
// Town centres

// (a cobblestone well under a steep roof, the bell hung from it)
const meeting1 = K.piece('town_centers/taiga_meeting_point_1', {
  key: { b: 'bell[attachment=ceiling,facing=north]' },
  layers: [
    'ppppppppp|ppppppppp|ppCCCCCpp|ppC~~~Cpp|ppC~~~Cpp|ppC~~~Cpp|ppCCCCCpp|ppppppppp|ppppppppp',
    '.........|.........|..LCCCL..|..C...C..|..C...C..|..C...C..|..LCCCL..|.........|.........',
    '.........|.........|..L...L..|.........|.........|.........|..L...L..|.........|.........',
    '.........|.........|..L...L..|.........|....b....|.........|..L...L..|.........|.........',
    '.........|..vvvvv..|..PPPPP..|..PPPPP..|..PPPPP..|..PPPPP..|..PPPPP..|..^^^^^..|.........',
    '.........|.........|..vvvvv..|..PPPPP..|..PPPPP..|..PPPPP..|..^^^^^..|.........|.........',
    '.........|.........|.........|..vvvvv..|.._____..|..^^^^^..|.........|.........|.........',
  ],
  jigsaws: [
    K.street(4, 1, 0, 'north'), K.street(4, 1, 8, 'south'), K.street(0, 1, 4, 'west'), K.street(8, 1, 4, 'east'),
    K.golem(1, 7), K.villager(7, 1), K.villager(1, 1),
  ],
});

// (a spruce shelter on four log posts, the bell and lanterns hanging under it)
const meeting2 = K.piece('town_centers/taiga_meeting_point_2', {
  key: { b: 'bell[attachment=ceiling,facing=north]' },
  layers: [
    'ppppppppp|ppppppppp|ppCCCCCpp|ppCPPPCpp|ppCPPPCpp|ppCPPPCpp|ppCCCCCpp|ppppppppp|ppppppppp',
    '.........|.........|..L...L..|.........|.........|.........|..L...L..|.........|.........',
    '.........|.........|..L...L..|.........|.........|.........|..L...L..|.........|.........',
    '.........|.........|..L...L..|...j.....|....b....|.....j...|..L...L..|.........|.........',
    '.........|.vvvvvvv.|.>PPPPP<.|.>PPPPP<.|.>PPPPP<.|.>PPPPP<.|.>PPPPP<.|.^^^^^^^.|.........',
    '.........|.........|..vvvvv..|..>___<..|..>___<..|..>___<..|..^^^^^..|.........|.........',
  ],
  jigsaws: [
    K.street(4, 1, 0, 'north'), K.street(4, 1, 8, 'south'), K.street(0, 1, 4, 'west'), K.street(8, 1, 4, 'east'),
    K.golem(7, 7), K.villager(1, 1), K.villager(7, 1),
  ],
});

/** the zombie villages' town centres (see villages.ts ZOMBIE_STARTS): for now, the living ones */
export const TAIGA_ZOMBIE_TOWN_CENTERS = [rigid(meeting1, MOSSIFY_10), rigid(meeting2, MOSSIFY_10)];

pool(`${V}/town_centers`, 'empty', [
  [rigid(meeting1, MOSSIFY_10), 49], [rigid(meeting2, MOSSIFY_10), 49], [TAIGA_ZOMBIE_TOWN_CENTERS[0], 1], [TAIGA_ZOMBIE_TOWN_CENTERS[1], 1],
]);

// ---------------------------------------------------------------------------------------------------------------
// Streets

const st = (n: string) => `${V}/streets/${n}`;
const streets: [Template, number][] = [
  [streetMap(st('corner_01'), ['.ppp...', '.ppppp.', '.pppppp', '.pppppp', '.......'], [K.street(2, 1, 0, 'north'), K.street(6, 1, 2, 'east'), K.plot(0, 1, 2, 'west'), K.plot(2, 1, 4, 'south'), K.decor(0, 4)]), 2],
  [streetMap(st('corner_02'), ['.ppp.....', '.ppp.....', '.ppppppp.', '.pppppppp', '.pppppppp', '.........'], [K.street(2, 1, 0, 'north'), K.street(8, 1, 3, 'east'), K.plot(0, 1, 2, 'west'), K.plot(3, 1, 5, 'south'), K.decor(0, 5), K.decor(7, 5)]), 2],
  [streetMap(st('corner_03'), ['.ppp..', '.ppp..', '.ppppp', '.ppppp', '..ppp.', '......'], [K.street(2, 1, 0, 'north'), K.street(5, 1, 3, 'east'), K.plot(0, 1, 3, 'west'), K.plot(2, 1, 5, 'south'), K.decor(5, 5)]), 2],
  [straightStreet(V, st('straight_01'), 13, [[2, 'w'], [3, 'e'], [8, 'w'], [9, 'e']], [[6, 'w'], [12, 'e']]), 4],
  [straightStreet(V, st('straight_02'), 11, [[2, 'e'], [5, 'w'], [8, 'e']], [[1, 'w'], [9, 'w']]), 4],
  [straightStreet(V, st('straight_03'), 9, [[2, 'w'], [2, 'e'], [7, 'w']], [[6, 'e']]), 4],
  [straightStreet(V, st('straight_04'), 8, [[3, 'w'], [4, 'e']], [[7, 'w']]), 7],
  [straightStreet(V, st('straight_05'), 7, [[2, 'e'], [4, 'w']], [[6, 'e']]), 7],
  [straightStreet(V, st('straight_06'), 6, [[3, 'e']], [[2, 'w']]), 4],
  [streetMap(st('crossroad_01'), ['..ppp..', 'ppppppp', 'ppppppp', 'ppppppp', '..ppp..', '..ppp..', '..ppp..'], [K.street(3, 1, 0, 'north'), K.street(3, 1, 6, 'south'), K.street(0, 1, 2, 'west'), K.street(6, 1, 2, 'east'), K.plot(0, 1, 5, 'west'), K.plot(6, 1, 5, 'east'), K.decor(0, 0)]), 1],
  [streetMap(st('crossroad_02'), ['..ppp..', '..ppp..', 'ppppppp', 'ppppppp', 'ppppppp', '..ppp..', '..ppp..'], [K.street(3, 1, 0, 'north'), K.street(3, 1, 6, 'south'), K.street(0, 1, 3, 'west'), K.street(6, 1, 3, 'east'), K.decor(0, 0), K.decor(6, 6)]), 1],
  [streetMap(st('crossroad_03'), ['..ppp..', 'ppppppp', 'ppppppp', 'ppppppp', '.......'], [K.street(3, 1, 0, 'north'), K.street(0, 1, 2, 'west'), K.street(6, 1, 2, 'east'), K.plot(3, 1, 4, 'south'), K.decor(0, 4), K.decor(6, 4)]), 2],
  [streetMap(st('crossroad_04'), ['.ppp.', '.ppp.', '.pppp', '.pppp', '.pppp', '.ppp.', '.ppp.'], [K.street(2, 1, 0, 'north'), K.street(2, 1, 6, 'south'), K.street(4, 1, 3, 'east'), K.plot(0, 1, 2, 'west'), K.plot(0, 1, 5, 'west'), K.decor(4, 0)]), 2],
  [streetMap(st('crossroad_05'), ['.ppp.', '.ppp.', 'pppp.', 'pppp.', 'pppp.', '.ppp.', '.ppp.', '.ppp.'], [K.street(2, 1, 0, 'north'), K.street(2, 1, 7, 'south'), K.street(0, 1, 3, 'west'), K.plot(4, 1, 2, 'east'), K.plot(4, 1, 6, 'east'), K.decor(0, 7)]), 2],
  [streetMap(st('crossroad_06'), ['...ppp...', '...ppp...', 'ppppppppp', 'ppppppppp', 'ppppppppp', '.........'], [K.street(4, 1, 0, 'north'), K.street(0, 1, 3, 'west'), K.street(8, 1, 3, 'east'), K.plot(2, 1, 5, 'south'), K.plot(6, 1, 5, 'south'), K.plot(1, 1, 0, 'north'), K.plot(7, 1, 0, 'north'), K.decor(8, 5)]), 2],
  [streetMap(st('turn_01'), ['.ppp...', '.ppp...', '.pppp..', '..pppp.', '...ppp.', '...ppp.', '...ppp.'], [K.street(2, 1, 0, 'north'), K.street(4, 1, 6, 'south'), K.plot(0, 1, 5, 'west'), K.plot(6, 1, 1, 'east'), K.decor(0, 3)]), 3],
];
pool(`${V}/streets`, `${V}/terminators`, streets.map(([t, w]) => [terrain(t, STREET_SNOWY_OR_TAIGA), w]));

// vanilla's taiga terminators are the plains ones
const T = `${V}/terminators`;
pool(T, 'empty', PLAINS_TERMINATORS.map((t) => [terrain(t, STREET_SNOWY_OR_TAIGA), 1]));

// ---------------------------------------------------------------------------------------------------------------
// Decorations: lantern posts, small bits of village life, spruces and pines, pumpkins, ferns and berry bushes

const decorPiece = (id: string, layers: string[], final: string) =>
  K.piece(id, { key: { r: 'barrel[facing=up]', c: 'mossy_cobblestone' }, layers, jigsaws: [{ at: [0, 0, 0], facing: 'down', top: 'south', name: 'bottom', target: 'bottom', final }] });
const lamp = decorPiece('taiga_lamp_post_1', ['L', 'F', 'J'], 'spruce_log[axis=y]');
const deco1 = decorPiece('taiga_decoration_1', ['H'], 'hay_block[axis=y]');
const deco2 = decorPiece('taiga_decoration_2', ['H', 'H'], 'hay_block[axis=y]');
const deco3 = decorPiece('taiga_decoration_3', ['r'], 'barrel[facing=up]');
const deco4 = decorPiece('taiga_decoration_4', ['o'], 'pumpkin');
const deco5 = decorPiece('taiga_decoration_5', ['L', 'J'], 'spruce_log[axis=y]');
const deco6 = decorPiece('taiga_decoration_6', ['c'], 'mossy_cobblestone');
pool(`${V}/decor`, 'empty', [
  [rigid(lamp), 10], [rigid(deco1), 4], [rigid(deco2), 1], [rigid(deco3), 1], [rigid(deco4), 1], [rigid(deco5), 2], [rigid(deco6), 1],
  [feature(treeFeature('spruce'), 'spruce'), 4], [feature(treeFeature('pine'), 'pine'), 4], [feature(pilePumpkin, 'pile_pumpkin'), 2],
  [feature(patchTaigaGrass, 'patch_taiga_grass'), 4], [feature(patchBerryBush, 'patch_berry_bush'), 1], [EMPTY, 4],
]);

villagersPool('taiga', 'taiga');

// ---------------------------------------------------------------------------------------------------------------
// Houses

const small1 = K.house('taiga_small_house_1', {
  key: { ...bed('red', 'south'), k: 'chest[facing=west]' },
  layers: [
    '..p..|CCCCC|CPPPC|CPPPC|CPPPC|CCCCC',
    '.....|LPDPL|P...P|Gb..G|Ph.kP|LPPPL',
    '.....|LPUPL|P...P|G...G|P...P|LPGPL',
    '.....|>PPP<|>...<|>...<|>...<|>PPP<',
    '.....|.>P<.|.>.<.|.>j<.|.>.<.|.>P<.',
    '.....|..P..|.._..|.._..|.._..|..P..',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(3, 1, 4, 'taiga_house')],
});

const small2 = K.house('taiga_small_house_2', {
  key: { ...bed('white', 'south'), k: 'chest[facing=west]' },
  layers: [
    '..p..|CCCCC|CPPPC|CPPPC|CPPPC|CPPPC|CCCCC',
    '.....|CCDCC|C...C|C...C|Cb.kC|Ch..C|CCCCC',
    '.....|LPUPL|P...P|G...G|P...P|P...P|LPGPL',
    'vvvvv|LPPPL|P...P|P...P|P...P|P...P|LPPPL',
    '.....|vvvvv|P...P|P...P|P...P|P...P|^^^^^',
    '.....|.....|vvvvv|P.j.P|P...P|^^^^^|.....',
    '.....|.....|.....|_____|_____|.....|.....',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(3, 1, 4, 'taiga_house')],
});

const small3 = K.house('taiga_small_house_3', {
  key: { ...bed('green', 'east') },
  layers: [
    '...p...|CCCCCCC|CPPPPPC|CPPPPPC|CPPPPPC|CCCCCCC',
    '.......|LPPDPPL|P.....P|G.....G|Pbh..kP|LPPPPPL',
    '.......|LGPUPGL|P.....P|G.....G|P.....P|LPPPPPL',
    'vvvvvvv|LPPPPPL|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|vvvvvvv|P.....P|P.....P|P.....P|^^^^^^^',
    '.......|.......|vvvvvvv|P..j..P|^^^^^^^|.......',
    '.......|.......|.......|_______|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2), K.cat(4, 2)],
  loot: [K.loot(5, 1, 4, 'taiga_house')],
});

// (a log cabin)
const small4 = K.house('taiga_small_house_4', {
  key: { ...bed('brown', 'east') },
  layers: [
    '..p..|CCCCC|CPPPC|CPPPC|CPPPC|CCCCC',
    '.....|LXDXL|Z...Z|G...G|Zbh.Z|LXXXL',
    '.....|LXUXL|Z...Z|G...G|Z...Z|LXGXL',
    '.....|>XXX<|>...<|>...<|>...<|>XXX<',
    '.....|.>X<.|.>.<.|.>j<.|.>.<.|.>X<.',
    '.....|..P..|.._..|.._..|.._..|..P..',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
});

const small5 = K.house('taiga_small_house_5', {
  key: { ...bed('red', 'east') },
  layers: [
    '...p..|CCCCCC|CPPPPC|CPPPPC|CPPPPC|CPPPPC|CCCCCC',
    '......|LPPDPL|P....P|G....G|P....P|Pbh.kP|LPPPPL',
    '......|LPGUPL|P....P|G....G|P....P|P....P|LPPGPL',
    'vvvvvv|LPPPPL|P....P|P....P|P....P|P....P|LPPPPL',
    '......|vvvvvv|P....P|P....P|P....P|P....P|^^^^^^',
    '......|......|vvvvvv|P.j..P|P....P|^^^^^^|......',
    '......|......|......|______|______|......|......',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 3)],
  loot: [K.loot(4, 1, 5, 'taiga_house')],
});

const medium1 = K.house('taiga_medium_house_1', {
  key: { ...bed('red', 'east'), ...bed('red', 'west', 'e', 'i'), k: 'chest[facing=west]' },
  layers: [
    '...p...|CCCCCCC|CPPPPPC|CPPPPPC|CPPPPPC|CPPPPPC|CPPPPPC|CCCCCCC',
    '.......|LPPDPPL|P....kP|G.....G|P.....P|G.....G|Pbh.ieP|LPPPPPL',
    '.......|LGPUPGL|P.....P|G.....G|P.....P|G.....G|P.....P|LPPGPPL',
    '.......|>PPPPP<|>.....<|>.....<|>.....<|>.....<|>.....<|>PPPPP<',
    '.......|.>PPP<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>PPP<.',
    '.......|..>P<..|..>.<..|..>j<..|..>.<..|..>j<..|..>.<..|..>P<..',
    '.......|...P...|..._...|..._...|..._...|..._...|..._...|...P...',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 3), K.villager(2, 4), K.cat(4, 4)],
  loot: [K.loot(5, 1, 2, 'taiga_house')],
});

const medium2 = K.house('taiga_medium_house_2', {
  key: { ...bed('white', 'east'), ...bed('white', 'west', 'e', 'i') },
  layers: [
    '....p....|CCCCCCCCC|CPPPPPPPC|CPPPPPPPC|CPPPPPPPC|CPPPPPPPC|CCCCCCCCC',
    '.........|LPPPDPPPL|P.......P|G.......G|P.......P|Pbh.k.ieP|LPPPPPPPL',
    '.........|LGPPUPPGL|P.......P|G.......G|P.......P|P.......P|LPPGPGPPL',
    'vvvvvvvvv|LPPPPPPPL|P.......P|P.......P|P.......P|P.......P|LPPPPPPPL',
    '.........|vvvvvvvvv|P.......P|P.......P|P.......P|P.......P|^^^^^^^^^',
    '.........|.........|vvvvvvvvv|P..j.j..P|P.......P|^^^^^^^^^|.........',
    '.........|.........|.........|_________|_________|.........|.........',
  ],
  jigsaws: [entranceJ(4, 1, 0), K.villager(4, 3), K.villager(2, 3)],
  loot: [K.loot(4, 1, 5, 'taiga_house')],
});

// (two storeys, a ladder in the corner)
const medium3 = K.house('taiga_medium_house_3', {
  key: { ...bed('blue', 'east') },
  layers: [
    '...p...|CCCCCCC|CPPPPPC|CPPPPPC|CPPPPPC|CPPPPPC|CPPPPPC|CCCCCCC',
    '.......|CCCDCCC|C.....C|G.....G|C.....C|G.....G|Ck...aC|CCCCCCC',
    '.......|LGPUPGL|P.....P|G.....G|P.....P|G.....G|P....aP|LPPPPPL',
    '.......|LPPPPPL|P.....P|P..j..P|P.....P|P.....P|P....aP|LPPPPPL',
    '.......|LXXXXXL|ZPPPPPZ|ZPPPPPZ|ZPPPPPZ|ZPPPPPZ|ZPPPPaZ|LXXXXXL',
    '.......|LPPPPPL|Pbh...P|G.....G|P.....P|G.....G|Pbh...P|LPPPPPL',
    '.......|LPGPGPL|P.....P|G.....G|P.....P|G.....G|P.....P|LPPPPPL',
    '.......|>PPPPP<|>.....<|>.....<|>.....<|>.....<|>.....<|>PPPPP<',
    '.......|.>PPP<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>PPP<.',
    '.......|..>P<..|..>.<..|..>j<..|..>.<..|..>.<..|..>.<..|..>P<..',
    '.......|...P...|..._...|..._...|..._...|..._...|..._...|...P...',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 3), K.villager(3, 3, 'air', 4)],
  loot: [K.loot(1, 1, 6, 'taiga_house')],
});

// (a covered porch in front)
const medium4 = K.house('taiga_medium_house_4', {
  key: { ...bed('red', 'east'), ...bed('red', 'west', 'e', 'i') },
  layers: [
    '....p....|..CCCCC..|CCCCCCCCC|CPPPPPPPC|CPPPPPPPC|CPPPPPPPC|CPPPPPPPC|CCCCCCCCC',
    '.........|..F...F..|LPPPDPPPL|P.......P|G.......G|P.......P|Pbh.k.ieP|LPPPPPPPL',
    '.........|..F...F..|LGPPUPPGL|P.......P|G.......G|P.......P|P.......P|LPPPPPPPL',
    '.........|..vvvvv..|LPPPPPPPL|P.......P|P.......P|P.......P|P.......P|LPPPPPPPL',
    '.........|.........|vvvvvvvvv|P.......P|P.......P|P.......P|P.......P|^^^^^^^^^',
    '.........|.........|.........|vvvvvvvvv|P..j.j..P|P.......P|^^^^^^^^^|.........',
    '.........|.........|.........|.........|_________|_________|.........|.........',
  ],
  jigsaws: [entranceJ(4, 1, 0), K.villager(4, 4), K.villager(2, 4)],
  loot: [K.loot(4, 1, 6, 'taiga_house')],
});

// ---------------------------------------------------------------------------------------------------------------
// Job sites

const butcher = K.house('taiga_butcher_shop_1', {
  key: { z: 'smoker[facing=north]', q: 'spruce_fence_gate[facing=east]' },
  layers: [
    '...p...|CCCCCCC|CPPPPPC|CPPPPPC|CCCCCCC|ggggggg|ggggggg|ggggggg|ggggggg',
    '.......|LPPDPPL|P.....P|Pz.k..P|LPPPPPL|F.....F|q.....F|F.....F|FFFFFFF',
    '.......|LGPUPGL|P.....P|P..t..P|LPGPPPL|.......|.......|.......|.......',
    'vvvvvvv|LPPPPPL|P.....P|P.....P|LPPPPPL|.......|.......|.......|.......',
    '.......|vvvvvvv|P.....P|P.....P|^^^^^^^|.......|.......|.......|.......',
    '.......|.......|vvvvvvv|^^^^^^^|.......|.......|.......|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2), K.animal(2, 6, 'air', 'village/common/butcher_animals'), K.animal(4, 7, 'air', 'village/common/butcher_animals')],
  loot: [K.loot(3, 1, 3, 'butcher')],
});

const toolsmith = K.house('taiga_tool_smith_1', {
  key: { m: 'smithing_table' },
  layers: [
    '...p...|CCCCCCC|CPPPPPC|CPPPPPC|CPPPPPC|CCCCCCC',
    '.......|CCCDCCC|C.....C|C.....C|Cm..k.C|CCCCCCC',
    '.......|LGPUPGL|P.....P|G.....G|P.....P|LPPPPPL',
    'vvvvvvv|LPPPPPL|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|vvvvvvv|P.....P|P.....P|P.....P|^^^^^^^',
    '.......|.......|vvvvvvv|P..j..P|^^^^^^^|.......',
    '.......|.......|.......|_______|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2)],
  loot: [K.loot(4, 1, 4, 'toolsmith')],
});

const fletcher = K.house('taiga_fletcher_house_1', {
  key: { ...bed('lime', 'south'), m: 'fletching_table' },
  layers: [
    '..p..|CCCCC|CPPPC|CPPPC|CPPPC|CPPPC|CCCCC',
    '.....|LPDPL|P...P|Pm..P|P..bP|Pk.hP|LPPPL',
    '.....|LPUPL|P...P|G...G|P...P|P...P|LPGPL',
    '.....|>PPP<|>...<|>...<|>...<|>...<|>PPP<',
    '.....|.>P<.|.>.<.|.>j<.|.>.<.|.>.<.|.>P<.',
    '.....|..P..|.._..|.._..|.._..|.._..|..P..',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(1, 1, 5, 'fletcher')],
});

const shepherd = K.house('taiga_shepherds_house_1', {
  key: { ...bed('white', 'south'), l: 'loom[facing=north]', q: 'spruce_fence_gate[facing=east]' },
  layers: [
    '...p.......|CCCCCCC....|CPPPPPC....|CPPPPPC....|CPPPPPC....|CCCCCCC....',
    '...........|LPPDPPLFFFF|P.....P...F|G....bG...q|Pl.k.hP...F|LPPPPPLFFFF',
    '...........|LGPUPGL....|P.....P....|G.....G....|P.....P....|LPPPPPL....',
    'vvvvvvv....|LPPPPPL....|P.....P....|P.....P....|P.....P....|LPPPPPL....',
    '...........|vvvvvvv....|P.....P....|P.....P....|P.....P....|^^^^^^^....',
    '...........|...........|vvvvvvv....|P..j..P....|^^^^^^^....|...........',
    '...........|...........|...........|_______....|...........|...........',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2), K.animal(8, 3, 'air', 'village/common/sheep')],
  loot: [K.loot(3, 1, 4, 'shepherd')],
});

const armorer1 = K.house('taiga_armorer_house_1', {
  key: { z: 'blast_furnace[facing=north]' },
  layers: [
    '..p..|CCCCC|CPPPC|CPPPC|CCCCC',
    '.....|CCDCC|C...C|Cz.kC|CCCCC',
    '.....|LPUPL|G...G|P...P|LPPPL',
    '.....|>PPP<|>...<|>...<|>PPP<',
    '.....|.>P<.|.>j<.|.>.<.|.>P<.',
    '.....|..P..|.._..|.._..|..P..',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(3, 1, 3, 'armorer')],
});

// (an open forge with a cobblestone back wall)
const armorer2 = K.house('taiga_armorer_2', {
  key: { z: 'blast_furnace[facing=north]', x: 'furnace[facing=north]' },
  layers: [
    '...p...|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC',
    '.......|L.....L|.......|.z.k.x.|LCCCCCL',
    '.......|L.....L|.......|...t...|LCCCCCL',
    '.......|L.....L|.......|.......|LCCCCCL',
    '.......|_______|_______|_______|_______',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2)],
  loot: [K.loot(3, 1, 3, 'armorer')],
});

const fisher = K.house('taiga_fisher_cottage_1', {
  key: { r: 'barrel[facing=up]', k: 'chest[facing=west]' },
  layers: [
    '..p......|CCCCC....|CPPPC.~~.|CPPPC.~~.|CPPPC....|CCCCC....',
    '.........|LPDPL....|P...P....|G...G....|Pr.kP....|LPPPL....',
    '.........|LPUPL....|P...P....|G...G....|P...P....|LPGPL....',
    '.........|>PPP<....|>...<....|>...<....|>...<....|>PPP<....',
    '.........|.>P<.....|.>.<.....|.>j<.....|.>.<.....|.>P<.....',
    '.........|..P......|.._......|.._......|.._......|..P......',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(3, 1, 4, 'fisher')],
});

const tannery = K.house('taiga_tannery_1', {
  key: { u: 'cauldron' },
  layers: [
    '...p...|CCCCCCC|CPPPPPC|CPPPPPC|CPPPPPC|CCCCCCC',
    '.......|LPPDPPL|P.....P|G.....G|Pu.k..P|LPPPPPL',
    '.......|LGPUPGL|P.....P|G.....G|P.....P|LPPPPPL',
    'vvvvvvv|LPPPPPL|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|vvvvvvv|P.....P|P.....P|P.....P|^^^^^^^',
    '.......|.......|vvvvvvv|P..j..P|^^^^^^^|.......',
    '.......|.......|.......|_______|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2)],
  loot: [K.loot(3, 1, 4, 'tannery')],
});

const cartographer = K.house('taiga_cartographer_house_1', {
  key: { m: 'cartography_table' },
  layers: [
    '...p...|CCCCCCC|CPPPPPC|CPPPPPC|CPPPPPC|CPPPPPC|CCCCCCC',
    '.......|LPPDPPL|P.....P|G.....G|P.....P|Pm.k..P|LPPPPPL',
    '.......|LGPUPGL|P.....P|G.....G|P.....P|P.....P|LPPGPPL',
    '.......|>PPPPP<|>.....<|>.....<|>.....<|>.....<|>PPPPP<',
    '.......|.>PPP<.|.>...<.|.>...<.|.>...<.|.>...<.|.>PPP<.',
    '.......|..>P<..|..>.<..|..>j<..|..>.<..|..>.<..|..>P<..',
    '.......|...P...|..._...|..._...|..._...|..._...|...P...',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 3)],
  loot: [K.loot(3, 1, 5, 'cartographer')],
});

const library = K.house('taiga_library_1', {
  key: { n: 'lectern[facing=north]' },
  layers: [
    '....p....|CCCCCCCCC|CPPPPPPPC|CPPPPPPPC|CPPPPPPPC|CPPPPPPPC|CCCCCCCCC',
    '.........|LPPPDPPPL|PB.....BP|PB.....BP|G.......G|PBB.n.BBP|LPPPPPPPL',
    '.........|LPPPUPPPL|PB.....BP|PB.....BP|G.......G|PBB...BBP|LPPGPGPPL',
    'vvvvvvvvv|LPPPPPPPL|P.......P|P.......P|P.......P|P.......P|LPPPPPPPL',
    '.........|vvvvvvvvv|P.......P|P.......P|P.......P|P.......P|^^^^^^^^^',
    '.........|.........|vvvvvvvvv|P..j.j..P|P.......P|^^^^^^^^^|.........',
    '.........|.........|.........|_________|_________|.........|.........',
  ],
  jigsaws: [entranceJ(4, 1, 0), K.villager(4, 3)],
});

const mason = K.house('taiga_masons_house_1', {
  key: { m: 'stonecutter[facing=north]', k: 'chest[facing=west]' },
  layers: [
    '..p..|SSSSS|SCCCS|SCCCS|SCCCS|SSSSS',
    '.....|LSDSL|S...S|G...G|Sm.kS|LSSSL',
    '.....|LSUSL|S...S|G...G|S...S|LSGSL',
    '.....|>PPP<|>...<|>...<|>...<|>PPP<',
    '.....|.>P<.|.>.<.|.>j<.|.>.<.|.>P<.',
    '.....|..P..|.._..|.._..|.._..|..P..',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2)],
  loot: [K.loot(3, 1, 4, 'mason')],
});

const weaponsmith1 = K.house('taiga_weaponsmith_1', {
  key: { r: 'grindstone[face=floor,facing=north]', x: 'furnace[facing=north]' },
  layers: [
    '...p...|CCCCCCC|CPPPPPC|CPPPPPC|CPPPPPC|CCCCCCC',
    '.......|LPPDPPL|P.....P|Pr....P|Pk...xP|LPPPPPL',
    '.......|LGPUPGL|P.....P|G.....G|P.....P|LPPPPPL',
    'vvvvvvv|LPPPPPL|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|vvvvvvv|P.....P|P.....P|P.....P|^^^^^^^',
    '.......|.......|vvvvvvv|P..j..P|^^^^^^^|.......',
    '.......|.......|.......|_______|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2)],
  loot: [K.loot(1, 1, 4, 'weaponsmith')],
});

// (an open forge, lava behind iron bars)
const weaponsmith2 = K.house('taiga_weaponsmith_2', {
  key: { r: 'grindstone[face=floor,facing=north]', l: 'lava', I: 'iron_bars' },
  layers: [
    '...p...|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC',
    '.......|L.....L|.......|.r..I..|Lk.ClCL|LCCCCCL',
    '.......|L.....L|.......|....I..|L..CCCL|LCCCCCL',
    '.......|L.....L|.......|.......|L.....L|LCCCCCL',
    '.......|_______|_______|_______|_______|_______',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(2, 2)],
  loot: [K.loot(1, 1, 4, 'weaponsmith')],
});

const temple = K.house('taiga_temple_1', {
  key: { q: 'brewing_stand' },
  layers: [
    '...p...|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC',
    '.......|LCCDCCL|C.....C|G.....G|C.....C|G.....G|C.....C|C.q.k.C|LCCCCCL',
    '.......|LPPUPPL|P.....P|G.....G|P.....P|G.....G|P.....P|P..t..P|LPPPPPL',
    '.......|LPPPPPL|P.....P|P.....P|P.....P|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|>PPPPP<|>.....<|>.....<|>.....<|>.....<|>.....<|>.....<|>PPPPP<',
    '.......|.>PPP<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>PPP<.',
    '.......|..>P<..|..>.<..|..>j<..|..>.<..|..>j<..|..>.<..|..>.<..|..>P<..',
    '.......|...P...|..._...|..._...|..._...|..._...|..._...|..._...|...P...',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 4)],
  loot: [K.loot(4, 1, 7, 'temple')],
});

// ---------------------------------------------------------------------------------------------------------------
// Farms and pens

// vanilla FARM_TAIGA
const FARM_TAIGA = farmProcessor([['pumpkin_stem', 0.3], ['potatoes', 0.2]]);

const largeFarm1 = K.house('taiga_large_farm_1', {
  key: { k: 'composter' },
  layers: [
    '.............|LXXXXXXXXXXXL|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|LXXXXXXXXXXXL',
    '.k.........k.|.............|.321.123.231.|.213.312.123.|.132.231.312.|.321.123.231.|.213.312.123.|.132.231.312.|.321.123.231.|.213.312.123.|.132.231.312.|.............',
  ],
  jigsaws: [entranceJ(6, 1, 0)],
});

// (a path down the middle between two fields)
const largeFarm2 = K.house('taiga_large_farm_2', {
  key: { k: 'composter' },
  layers: [
    '.....p.....|LXXXXpXXXXL|Zfff~p~fffZ|Zfff~p~fffZ|Zfff~p~fffZ|Zfff~p~fffZ|Zfff~p~fffZ|Zfff~p~fffZ|LXXXXXXXXXL',
    '....k......|...........|.123...321.|.231...132.|.312...213.|.123...321.|.231...132.|.312...213.|...........',
  ],
  jigsaws: [entranceJ(5, 1, 0)],
});

// (wheat and pumpkins in a cobblestone bed)
const smallFarm = K.house('taiga_small_farm_1', {
  key: { k: 'composter' },
  layers: ['.......|CCCCCCC|Cff~ffC|Cff~ffC|Cff~ffC|Cff~ffC|CCCCCCC', '..k....|.......|.1o.21.|.23.o2.|.31.13.|.o2.21.|.......'],
  jigsaws: [entranceJ(3, 1, 0)],
});

const pen = K.house('taiga_animal_pen_1', {
  layers: [
    '....p....|CCCCCCCCC|C.......C|C.......C|C.......C|C.......C|CCCCCCCCC',
    '.........|FFFFqFFFF|F.......F|F.......F|F.......F|F.H.....F|FFFFFFFFF',
  ],
  jigsaws: [entranceJ(4, 1, 0), K.animal(2, 3), K.animal(5, 3), K.animal(3, 4)],
});

pool(`${V}/houses`, T, [
  [house(small1), 4], [house(small2), 4], [house(small3), 4], [house(small4), 4], [house(small5), 4],
  [house(medium1), 2], [house(medium2), 2], [house(medium3), 2], [house(medium4), 2],
  [house(butcher), 2], [house(toolsmith), 2], [house(fletcher), 2], [house(shepherd), 2], [house(armorer1), 1], [house(armorer2), 1], [house(fisher), 3],
  [house(tannery), 2], [house(cartographer), 2], [house(library), 2], [house(mason), 2], [house(weaponsmith1), 2], [house(weaponsmith2), 2], [house(temple), 2],
  [rigid(largeFarm1, FARM_TAIGA), 6], [rigid(largeFarm2, FARM_TAIGA), 6], [house(smallFarm), 1], [house(pen), 2], [EMPTY, 6],
]);
