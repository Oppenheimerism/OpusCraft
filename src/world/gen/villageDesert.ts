// Desert villages (vanilla DesertVillagePools): town centres, streets, decorations, houses, job sites, farms and pens,
// hand-made after vanilla's village/desert/* structures: sandstone walls with cut sandstone corners, flat roofs,
// bands of terracotta, jungle doors, smooth sandstone streets. Each house stands with its entrance to the north (see
// villagePlainsHouses.ts for the layout of a template).

import { pool, EMPTY, type Template } from './jigsaw';
import {
  villageKit, villagersPool, feature, pileHay, patchCactus, rigid, terrain, straightStreet, streetMap, entityPiece, farmProcessor, entranceJ, standJ, bed,
} from './villageCommon';

const DK: Record<string, string> = {
  S: 'sandstone', C: 'cut_sandstone', s: 'smooth_sandstone', H: 'chiseled_sandstone',
  _: 'smooth_sandstone_slab[type=bottom]', '=': 'cut_sandstone_slab[type=bottom]', w: 'sandstone_wall',
  '^': 'sandstone_stairs[facing=north]', v: 'sandstone_stairs[facing=south]', '>': 'sandstone_stairs[facing=east]', '<': 'sandstone_stairs[facing=west]',
  D: 'jungle_door[facing=south,half=lower,hinge=left]', U: 'jungle_door[facing=south,half=upper,hinge=left]',
  F: 'jungle_fence', q: 'jungle_fence_gate[facing=north]', T: 'torch', t: 'wall_torch[facing=north]', '~': 'water', p: 'smooth_sandstone', g: 'sand',
  f: 'farmland[moisture=7]', '1': 'wheat[age=2]', '2': 'wheat[age=5]', '3': 'wheat[age=7]', X: 'hay_block[axis=y]', B: 'bookshelf',
  O: 'orange_terracotta', Y: 'yellow_terracotta', L: 'lime_terracotta', R: 'red_terracotta', W: 'white_terracotta', N: 'cyan_terracotta', A: 'terracotta',
  k: 'chest[facing=north]', a: 'ladder[facing=west]',
};

const K = villageKit('desert', DK);
const V = K.V;
const FLOOR = 'smooth_sandstone';
const P = 'smooth_sandstone';
const camel = (x: number, z: number) => standJ(x, 0, z, FLOOR, `${V}/camel`);

// ---------------------------------------------------------------------------------------------------------------
// Town centres: a well or a square with the bell, an iron golem, a camel and streets leaving every side

const meeting1 = K.piece('town_centers/desert_meeting_point_1', {
  key: { b: 'bell[attachment=ceiling,facing=north]' },
  layers: [
    'ppppppppp|ppppppppp|ppSSSSSpp|ppS~~~Spp|ppS~~~Spp|ppS~~~Spp|ppSSSSSpp|ppppppppp|ppppppppp',
    '.........|.........|..wCCCw..|..C...C..|..C...C..|..C...C..|..wCCCw..|.........|.........',
    '.........|.........|..w...w..|.........|.........|.........|..w...w..|.........|.........',
    '.........|.........|..w...w..|.........|....b....|.........|..w...w..|.........|.........',
    '.........|.........|..CCCCC..|..C===C..|..C=H=C..|..C===C..|..CCCCC..|.........|.........',
  ],
  jigsaws: [
    K.street(4, 1, 0, 'north'), K.street(4, 1, 8, 'south'), K.street(0, 1, 4, 'west'), K.street(8, 1, 4, 'east'),
    K.golem(1, 7, FLOOR), K.villager(7, 1, FLOOR), K.villager(1, 1, FLOOR), camel(7, 7),
  ],
});

const meeting2 = K.piece('town_centers/desert_meeting_point_2', {
  key: { b: 'bell[attachment=floor,facing=north]' },
  layers: [
    'ppppppppppp|ppppppppppp|ppppppppppp|ppppppppppp|ppppCCCpppp|ppppCCCpppp|ppppCCCpppp|ppppppppppp|ppppppppppp|ppppppppppp|ppppppppppp',
    '...........|.w.......w.|.......X...|....vvv....|...>CCC<...|...>CCC<...|...>CCC<...|....^^^....|..X........|.w.......w.|...........',
    '...........|.w.......w.|...........|...........|...........|.....H.....|...........|...........|...........|.w.......w.|...........',
    '...........|.T.......T.|...........|...........|...........|.....b.....|...........|...........|...........|.T.......T.|...........',
  ],
  jigsaws: [
    K.street(5, 1, 0, 'north'), K.street(5, 1, 10, 'south'), K.street(0, 1, 5, 'west'), K.street(10, 1, 5, 'east'),
    K.golem(8, 8, FLOOR), K.villager(2, 2, FLOOR), K.villager(8, 5, FLOOR), camel(2, 6),
  ],
});

const meeting3 = K.piece('town_centers/desert_meeting_point_3', {
  key: { b: 'bell[attachment=ceiling,facing=north]' },
  layers: [
    'ppppppp|ppppppp|ppCCCpp|ppC~Cpp|ppCCCpp|ppppppp|ppppppp',
    '.......|.......|..w.w..|.......|..w.w..|.......|.......',
    '.......|.......|..w.w..|...b...|..w.w..|.......|.......',
    '.......|.......|..===..|..=H=..|..===..|.......|.......',
  ],
  jigsaws: [
    K.street(3, 1, 0, 'north'), K.street(3, 1, 6, 'south'), K.street(0, 1, 3, 'west'), K.street(6, 1, 3, 'east'),
    K.golem(1, 5, FLOOR), K.villager(5, 1, FLOOR), K.villager(1, 1, FLOOR), camel(5, 5),
  ],
});

/** the zombie villages' town centres (see villages.ts ZOMBIE_STARTS): for now, the living ones */
export const DESERT_ZOMBIE_TOWN_CENTERS = [rigid(meeting1), rigid(meeting2), rigid(meeting3)];

pool(`${V}/town_centers`, 'empty', [
  [rigid(meeting1), 98], [rigid(meeting2), 98], [rigid(meeting3), 49],
  [DESERT_ZOMBIE_TOWN_CENTERS[0], 2], [DESERT_ZOMBIE_TOWN_CENTERS[1], 2], [DESERT_ZOMBIE_TOWN_CENTERS[2], 1],
]);

// (camels aren't in the game yet: their records load as nothing until they are)
pool(`${V}/camel`, 'empty', [[rigid(entityPiece(`${V}/camel_spawn`, { id: 'camel', health: 32 })), 1]]);

// ---------------------------------------------------------------------------------------------------------------
// Streets of smooth sandstone (no street processor: over water they stay sandstone)

const st = (n: string) => `${V}/streets/${n}`;
const streets: [Template, number][] = [
  [streetMap(st('corner_01'), ['.ppp...', '.ppppp.', '.pppppp', '.pppppp', '.......'], [K.street(2, 1, 0, 'north'), K.street(6, 1, 2, 'east'), K.plot(0, 1, 2, 'west'), K.plot(2, 1, 4, 'south'), K.decor(0, 4)], P, 'sand'), 3],
  [streetMap(st('corner_02'), ['.ppp..', '.ppp..', '.ppppp', '.ppppp', '..ppp.', '......'], [K.street(2, 1, 0, 'north'), K.street(5, 1, 3, 'east'), K.plot(0, 1, 3, 'west'), K.plot(2, 1, 5, 'south'), K.decor(5, 5)], P, 'sand'), 3],
  [straightStreet(V, st('straight_01'), 12, [[2, 'w'], [3, 'e'], [8, 'w'], [9, 'e']], [[6, 'w'], [11, 'e']], P), 4],
  [straightStreet(V, st('straight_02'), 9, [[2, 'e'], [5, 'w'], [7, 'e']], [[1, 'w']], P), 4],
  [straightStreet(V, st('straight_03'), 6, [[3, 'w']], [[2, 'e']], P), 3],
  [streetMap(st('crossroad_01'), ['..ppp..', '..ppp..', 'ppppppp', 'ppppppp', 'ppppppp', '..ppp..', '..ppp..'], [K.street(3, 1, 0, 'north'), K.street(3, 1, 6, 'south'), K.street(0, 1, 3, 'west'), K.street(6, 1, 3, 'east'), K.decor(0, 0), K.decor(6, 6)], P, 'sand'), 3],
  [streetMap(st('crossroad_02'), ['..ppp..', 'ppppppp', 'ppppppp', 'ppppppp', '.......'], [K.street(3, 1, 0, 'north'), K.street(0, 1, 2, 'west'), K.street(6, 1, 2, 'east'), K.plot(3, 1, 4, 'south'), K.decor(0, 4), K.decor(6, 4)], P, 'sand'), 3],
  [streetMap(st('crossroad_03'), ['.ppp.', '.ppp.', '.pppp', '.pppp', '.pppp', '.ppp.', '.ppp.'], [K.street(2, 1, 0, 'north'), K.street(2, 1, 6, 'south'), K.street(4, 1, 3, 'east'), K.plot(0, 1, 2, 'west'), K.plot(0, 1, 5, 'west'), K.decor(4, 0)], P, 'sand'), 3],
  // squares: a wider paved place where streets meet
  [streetMap(st('square_01'), ['...ppp...', '.ppppppp.', 'ppppppppp', 'ppppppppp', 'ppppppppp', 'ppppppppp', 'ppppppppp', '.ppppppp.', '...ppp...'], [K.street(4, 1, 0, 'north'), K.street(4, 1, 8, 'south'), K.street(0, 1, 4, 'west'), K.street(8, 1, 4, 'east'), K.plot(1, 1, 0, 'north'), K.plot(7, 1, 8, 'south'), K.decor(8, 0), K.decor(0, 8)], P, 'sand'), 3],
  [streetMap(st('square_02'), ['..ppp..', 'ppppppp', 'ppppppp', 'ppppppp', 'ppppppp', 'ppppppp', '.......'], [K.street(3, 1, 0, 'north'), K.street(0, 1, 3, 'west'), K.street(6, 1, 3, 'east'), K.plot(2, 1, 6, 'south'), K.plot(5, 1, 6, 'south'), K.decor(0, 6), K.decor(6, 0)], P, 'sand'), 3],
  [streetMap(st('turn_01'), ['.ppp...', '.ppp...', '.pppp..', '..pppp.', '...ppp.', '...ppp.', '...ppp.'], [K.street(2, 1, 0, 'north'), K.street(4, 1, 6, 'south'), K.plot(0, 1, 5, 'west'), K.plot(6, 1, 1, 'east'), K.decor(0, 3)], P, 'sand'), 3],
];
pool(`${V}/streets`, `${V}/terminators`, streets.map(([t, w]) => [terrain(t), w]));

const T = `${V}/terminators`;
pool(T, 'empty', [
  [terrain(streetMap(`${T}/terminator_01`, ['.ppp.', '.ppp.'], [K.street(2, 1, 0, 'north')], P, 'sand')), 1],
  [terrain(streetMap(`${T}/terminator_02`, ['.ppp.', '..p..'], [K.street(2, 1, 0, 'north')], P, 'sand')), 1],
]);

// ---------------------------------------------------------------------------------------------------------------
// Decorations: sandstone lamps, cacti and hay

const lamp = K.piece('desert_lamp_1', {
  layers: ['S', 'w', 'T'],
  jigsaws: [{ at: [0, 0, 0], facing: 'down', top: 'south', name: 'bottom', target: 'bottom', final: 'sandstone' }],
});
pool(`${V}/decor`, 'empty', [[rigid(lamp), 10], [feature(patchCactus, 'patch_cactus'), 4], [feature(pileHay, 'pile_hay'), 4], [EMPTY, 10]]);

villagersPool('desert', 'desert');

// ---------------------------------------------------------------------------------------------------------------
// Houses

const small1 = K.house('desert_small_house_1', {
  key: { ...bed('white', 'south'), k: 'chest[facing=west]' },
  layers: [
    '..p..|SSSSS|SsssS|SsssS|SsssS|SSSSS',
    '.....|CSDSC|S...S|Sb..S|Sh.kS|CSSSC',
    '.....|CSUSC|S...S|....S|S..tS|CS.SC',
    '.....|CYYYC|S...S|S...S|S...S|CSSSC',
    '.....|CCCCC|CsssC|CsssC|CsssC|CCCCC',
    '.....|=...=|.....|.....|.....|=...=',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2, FLOOR)],
  loot: [K.loot(3, 1, 4, 'desert_house')],
});

const small2 = K.house('desert_small_house_2', {
  key: { ...bed('lime', 'east') },
  layers: [
    '..p...|SSSSSS|SssssS|SssssS|SssssS|SSSSSS',
    '......|CSDSSC|S....S|S....S|Sbh.kS|CSSSSC',
    '......|CSUS.C|S....S|.....S|S..t.S|CSSSSC',
    '......|CLSSLC|S....S|S....S|S....S|CSSSSC',
    '......|CCCCCC|CssssC|CssssC|CssssC|CCCCCC',
    '......|======|=....=|=....=|=....=|======',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(3, 2, FLOOR)],
  loot: [K.loot(4, 1, 4, 'desert_house')],
});

const small3 = K.house('desert_small_house_3', {
  key: { ...bed('red', 'east'), o: 'potted_cactus' },
  layers: [
    '..p..|SSSSS|SsssS|SsssS|SsssS|SSSSS',
    '.....|SSDSS|S..oS|S...S|Sbh.S|SSSSS',
    '.....|SSUSS|S...S|....S|S..tS|SSSSS',
    '.....|RCCCR|C...C|C...C|C...C|RCCCR',
    '.....|SSSSS|SsssS|SsssS|SsssS|SSSSS',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2, FLOOR)],
});

const small4 = K.house('desert_small_house_4', {
  key: { ...bed('orange', 'east') },
  layers: [
    '...p...|SSSSSSS|SsssssS|SsssssS|SsssssS|SSSSSSS',
    '.......|CSSDSSC|S.....S|S.....S|Sbh..kS|CSSSSSC',
    '.......|C.SUS.C|S.....S|S.....S|S..t..S|CSSSSSC',
    '.......|COOOOOC|S.....S|S.....S|S.....S|CSSSSSC',
    '.......|CCCCCCC|CsssssC|CsssssC|CsssssC|CCCCCCC',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2, FLOOR)],
  loot: [K.loot(5, 1, 4, 'desert_house')],
});

// (a ladder up through the roof to a walled roof terrace)
const small5 = K.house('desert_small_house_5', {
  key: { ...bed('yellow', 'south') },
  layers: [
    '..p..|SSSSS|SsssS|SsssS|SsssS|SSSSS',
    '.....|SSDSS|S..aS|Sb..S|Sh..S|SSSSS',
    '.....|SSUSS|S..aS|....S|S...S|SSSSS',
    '.....|SSSSS|S..aS|S...S|S...S|SSSSS',
    '.....|CCCCC|CssaC|CsssC|CsssC|CCCCC',
    '.....|wwwww|w...w|w...w|w...w|wwwww',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2, FLOOR)],
});

const small6 = K.house('desert_small_house_6', {
  key: { ...bed('cyan', 'east'), k: 'chest[facing=east]', t: 'wall_torch[facing=east]' },
  layers: [
    '..p..|SSSSS|SsssS|SsssS|SsssS|SSSSS',
    '.....|CSDSC|Sk..S|S...S|S.bhS|CSSSC',
    '.....|CSUSC|S...S|St..S|S...S|C.S.C',
    '.....|CNNNC|S...S|S...S|S...S|CSSSC',
    '.....|CCCCC|CsssC|CsssC|CsssC|CCCCC',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2, FLOOR)],
  loot: [K.loot(1, 1, 2, 'desert_house')],
});

const small7 = K.house('desert_small_house_7', {
  key: { ...bed('green', 'east') },
  layers: [
    '...p..|SSSSSS|SssssS|SssssS|SssssS|SssssS|SSSSSS',
    '......|CSSDSC|S....S|S....S|S....S|Sbh.kS|CSSSSC',
    '......|CS.U.C|S....S|.....S|S....S|S...tS|CSSSSC',
    '......|CWWWWC|S....S|S....S|S....S|S....S|CSSSSC',
    '......|CCCCCC|CssssC|CssssC|CssssC|CssssC|CCCCCC',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 3, FLOOR), K.cat(2, 3, FLOOR)],
  loot: [K.loot(4, 1, 5, 'desert_house')],
});

const small8 = K.house('desert_small_house_8', {
  key: { ...bed('red', 'south'), k: 'chest[facing=west]' },
  layers: [
    '..p..|SSSSS|SsssS|SsssS|SsssS|SsssS|SsssS|SSSSS',
    '.....|CSDSC|S...S|S...S|S...S|Sb.kS|Sh..S|CSSSC',
    '.....|CSUSC|S...S|....S|S...S|S...S|S..tS|CSSSC',
    '.....|CYYYC|S...S|S...S|S...S|S...S|S...S|CSSSC',
    '.....|CCCCC|CsssC|CsssC|CsssC|CsssC|CsssC|CCCCC',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 3, FLOOR)],
  loot: [K.loot(3, 1, 5, 'desert_house')],
});

// (two storeys: a ladder in the corner up to the bedroom)
const medium1 = K.house('desert_medium_house_1', {
  key: { ...bed('white', 'east') },
  layers: [
    '...p...|SSSSSSS|SsssssS|SsssssS|SsssssS|SsssssS|SsssssS|SSSSSSS',
    '.......|CSSDSSC|S.....S|S.....S|S.....S|S.....S|Sk...aS|CSSSSSC',
    '.......|CS.U.SC|S.....S|......S|S.....S|......S|S..t.aS|CSSSSSC',
    '.......|CSSSSSC|S.....S|S.....S|S.....S|S.....S|S....aS|CSSSSSC',
    '.......|CCCCCCC|CsssssC|CsssssC|CsssssC|CsssssC|CssssaC|CCCCCCC',
    '.......|CSSSSSC|Sbh...S|S.....S|......S|S.....S|Sbh...S|CSSSSSC',
    '.......|CS.S.SC|S.....S|S.....S|S.....S|S.....S|S..t..S|CSSSSSC',
    '.......|COOOOOC|S.....S|S.....S|S.....S|S.....S|S.....S|CSSSSSC',
    '.......|CCCCCCC|CsssssC|CsssssC|CsssssC|CsssssC|CsssssC|CCCCCCC',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 3, FLOOR), K.villager(3, 3, FLOOR, 4)],
  loot: [K.loot(1, 1, 6, 'desert_house')],
});

const medium2 = K.house('desert_medium_house_2', {
  key: { ...bed('white', 'east'), ...bed('white', 'west', 'e', 'i') },
  layers: [
    '....p....|SSSSSSSSS|SsssssssS|SsssssssS|SsssssssS|SsssssssS|SSSSSSSSS',
    '.........|CSSSDSSSC|S.......S|S.......S|Sbh...ieS|S...k...S|CSSSSSSSC',
    '.........|CS.SUS.SC|S.......S|.........|S.......S|S...t...S|CSSSSSSSC',
    '.........|CLLLLLLLC|S.......S|S.......S|S.......S|S.......S|CSSSSSSSC',
    '.........|CCCCCCCCC|CsssssssC|CsssssssC|CsssssssC|CsssssssC|CCCCCCCCC',
    '.........|=========|=.......=|=.......=|=.......=|=.......=|=========',
  ],
  jigsaws: [entranceJ(4, 1, 0), K.villager(4, 3, FLOOR), K.villager(6, 2, FLOOR), K.cat(2, 2, FLOOR)],
  loot: [K.loot(4, 1, 5, 'desert_house')],
});

// ---------------------------------------------------------------------------------------------------------------
// Job sites

const butcher = K.house('desert_butcher_shop_1', {
  key: { z: 'smoker[facing=north]', q: 'jungle_fence_gate[facing=east]' },
  layers: [
    '...p...|SSSSSSS|SsssssS|SsssssS|SSSSSSS|ggggggg|ggggggg|ggggggg|ggggggg',
    '.......|CSSDSSC|S.....S|Sz.k..S|CSSSSSC|F.....F|q.....F|F.....F|FFFFFFF',
    '.......|CS.U.SC|S.....S|S..t..S|CS.SSSC|.......|.......|.......|.......',
    '.......|CRRRRRC|S.....S|S.....S|CSSSSSC|.......|.......|.......|.......',
    '.......|CCCCCCC|CsssssC|CsssssC|CCCCCCC|.......|.......|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2, FLOOR), K.animal(2, 6, 'sand', 'village/common/butcher_animals'), K.animal(4, 7, 'sand', 'village/common/butcher_animals')],
  loot: [K.loot(3, 1, 3, 'butcher')],
});

const toolsmith = K.house('desert_tool_smith_1', {
  key: { m: 'smithing_table' },
  layers: [
    '...p...|SSSSSSS|SsssssS|SsssssS|SsssssS|SSSSSSS',
    '.......|CSSDSSC|S.....S|S.....S|Sm..k.S|CSSSSSC',
    '.......|CS.U.SC|S.....S|......S|S..t..S|CSSSSSC',
    '.......|CYYYYYC|S.....S|S.....S|S.....S|CSSSSSC',
    '.......|CCCCCCC|CsssssC|CsssssC|CsssssC|CCCCCCC',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2, FLOOR)],
  loot: [K.loot(4, 1, 4, 'toolsmith')],
});

const fletcher = K.house('desert_fletcher_house_1', {
  key: { ...bed('lime', 'south'), m: 'fletching_table' },
  layers: [
    '..p..|SSSSS|SsssS|SsssS|SsssS|SsssS|SSSSS',
    '.....|CSDSC|S...S|Sm..S|S..bS|Sk.hS|CSSSC',
    '.....|CSUSC|S...S|....S|S...S|S.t.S|CSSSC',
    '.....|CLLLC|S...S|S...S|S...S|S...S|CSSSC',
    '.....|CCCCC|CsssC|CsssC|CsssC|CsssC|CCCCC',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2, FLOOR)],
  loot: [K.loot(1, 1, 5, 'fletcher')],
});

const shepherd = K.house('desert_shepherd_house_1', {
  key: { ...bed('white', 'south'), l: 'loom[facing=east]', o: 'white_wool' },
  layers: [
    '...p...|SSSSSSS|SsssssS|SsssssS|SsssssS|SSSSSSS',
    '.......|CSSDSSC|S.....S|Sl...bS|So.k.hS|CSSSSSC',
    '.......|CS.U.SC|S.....S|S.....S|So...tS|CSSSSSC',
    '.......|CWWWWWC|S.....S|S.....S|S.....S|CSSSSSC',
    '.......|CCCCCCC|CsssssC|CsssssC|CsssssC|CCCCCCC',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2, FLOOR)],
  loot: [K.loot(3, 1, 4, 'shepherd')],
});

const armorer = K.house('desert_armorer_1', {
  key: { z: 'blast_furnace[facing=north]' },
  layers: [
    '..p..|SSSSS|SsssS|SsssS|SSSSS',
    '.....|CSDSC|S...S|Sz.kS|CSSSC',
    '.....|CSUSC|S...S|S.t.S|CSSSC',
    '.....|CRRRC|S...S|S...S|CSSSC',
    '.....|CCCCC|CsssC|CsssC|CCCCC',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2, FLOOR)],
  loot: [K.loot(3, 1, 3, 'armorer')],
});

const fisher = K.house('desert_fisher_1', {
  key: { r: 'barrel[facing=up]', k: 'chest[facing=west]' },
  layers: [
    '..p......|SSSSSSSSS|SsssSS~~S|SsssSS~~S|SsssSSSSS|SSSSS....',
    '.........|CSDSC....|S...S....|S...S....|Sr.kS....|CSSSC....',
    '.........|CSUSC....|S...S....|....S....|S...S....|CSSSC....',
    '.........|CNNNC....|S...S....|S...S....|S...S....|CSSSC....',
    '.........|CCCCC....|CsssC....|CsssC....|CsssC....|CCCCC....',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2, FLOOR)],
  loot: [K.loot(3, 1, 4, 'fisher')],
});

const tannery = K.house('desert_tannery_1', {
  key: { u: 'cauldron' },
  layers: [
    '...p...|SSSSSSS|SsssssS|SsssssS|SsssssS|SSSSSSS',
    '.......|CSSDSSC|S.....S|S.....S|Su.k..S|CSSSSSC',
    '.......|CS.U.SC|S.....S|......S|S..t..S|CSSSSSC',
    '.......|COOOOOC|S.....S|S.....S|S.....S|CSSSSSC',
    '.......|CCCCCCC|CsssssC|CsssssC|CsssssC|CCCCCCC',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2, FLOOR)],
  loot: [K.loot(3, 1, 4, 'tannery')],
});

const cartographer = K.house('desert_cartographer_house_1', {
  key: { m: 'cartography_table' },
  layers: [
    '....p....|SSSSSSSSS|SsssssssS|SsssssssS|SsssssssS|SSSSSSSSS',
    '.........|CSSSDSSSC|S.......S|S.......S|Sm.k....S|CSSSSSSSC',
    '.........|CS.SUS.SC|S.......S|........S|S...t...S|CSSSSSSSC',
    '.........|CYYYYYYYC|S.......S|S.......S|S.......S|CSSSSSSSC',
    '.........|CCCCCCCCC|CsssssssC|CsssssssC|CsssssssC|CCCCCCCCC',
    '.........|=.......=|.........|.........|.........|=.......=',
  ],
  jigsaws: [entranceJ(4, 1, 0), K.villager(4, 2, FLOOR)],
  loot: [K.loot(3, 1, 4, 'cartographer')],
});

const library = K.house('desert_library_1', {
  key: { n: 'lectern[facing=north]' },
  layers: [
    '....p....|SSSSSSSSS|SsssssssS|SsssssssS|SsssssssS|SsssssssS|SSSSSSSSS',
    '.........|CSSSDSSSC|SB.....BS|SB.....BS|S.......S|SBB.n.BBS|CSSSSSSSC',
    '.........|CSSSUSSSC|SB.....BS|SB.....BS|.........|SBB...BBS|CSSSSSSSC',
    '.........|CNNNNNNNC|S.......S|S.......S|S.......S|S...t...S|CSSSSSSSC',
    '.........|CCCCCCCCC|CsssssssC|CsssssssC|CsssssssC|CsssssssC|CCCCCCCCC',
    '.........|=========|=.......=|=.......=|=.......=|=.......=|=========',
  ],
  jigsaws: [entranceJ(4, 1, 0), K.villager(4, 3, FLOOR)],
});

const mason = K.house('desert_mason_1', {
  key: { m: 'stonecutter[facing=north]', k: 'chest[facing=west]' },
  layers: [
    '..p..|SSSSS|SsssS|SsssS|SsssS|SSSSS',
    '.....|CSDSC|S...S|S...S|Sm.kS|CSSSC',
    '.....|CSUSC|S...S|....S|S...S|CS.SC',
    '.....|CAAAC|S...S|S...S|S...S|CSSSC',
    '.....|CCCCC|CsssC|CsssC|CsssC|CCCCC',
  ],
  jigsaws: [entranceJ(2, 1, 0), K.villager(2, 2, FLOOR)],
  loot: [K.loot(3, 1, 4, 'mason')],
});

const weaponsmith = K.house('desert_weaponsmith_1', {
  key: { r: 'grindstone[face=floor,facing=north]', x: 'furnace[facing=north]' },
  layers: [
    '...p...|SSSSSSS|SsssssS|SsssssS|SsssssS|SSSSSSS',
    '.......|CSSDSSC|S.....S|Sr....S|Sk...xS|CSSSSSC',
    '.......|CS.U.SC|S.....S|S.....S|S..t..S|CSSSSSC',
    '.......|CRRRRRC|S.....S|S.....S|S.....S|CSSSSSC',
    '.......|CCCCCCC|CsssssC|CsssssC|CsssssC|CCCCCCC',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 2, FLOOR)],
  loot: [K.loot(1, 1, 4, 'weaponsmith')],
});

const temple1 = K.house('desert_temple_1', {
  key: { q: 'brewing_stand' },
  layers: [
    '...p...|SSSSSSS|SsssssS|SsssssS|SsssssS|SsssssS|SsssssS|SSSSSSS',
    '.......|CSSDSSC|S.....S|S.....S|S.....S|S.....S|S.q.k.S|CSSSSSC',
    '.......|CSSUSSC|S.....S|.......|S.....S|.......|S..t..S|CSSSSSC',
    '.......|CSHHHSC|S.....S|S.....S|S.....S|S.....S|S.....S|CSSSSSC',
    '.......|CNNNNNC|N.....N|N.....N|N.....N|N.....N|N.....N|CNNNNNC',
    '.......|CCCCCCC|CsssssC|CsssssC|CsssssC|CsssssC|CsssssC|CCCCCCC',
    '.......|=======|=.....=|=.....=|=.....=|=.....=|=.....=|=======',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 3, FLOOR)],
  loot: [K.loot(4, 1, 6, 'temple')],
});

const temple2 = K.house('desert_temple_2', {
  key: { q: 'brewing_stand', u: 'water_cauldron[level=3]' },
  layers: [
    '...p...|SSSSSSS|SsssssS|SsssssS|SsssssS|SsssssS|SsssssS|SsssssS|SSSSSSS',
    '.......|SSSDSSS|S.....S|S.....S|S.....S|S.....S|S.....S|Sk.q.uS|SSSSSSS',
    '.......|SSSUSSS|S.....S|.......|S.....S|.......|S.....S|S.....S|SSSSSSS',
    '.......|SSSSSSS|S.....S|S.....S|S.....S|S.....S|S.....S|S..t..S|SSSSSSS',
    '.......|CLLLLLC|L.....L|L.....L|L.....L|L.....L|L.....L|L.....L|CLLLLLC',
    '.......|CCCCCCC|CsssssC|CsssssC|CsssssC|CsssssC|CsssssC|CsssssC|CCCCCCC',
  ],
  jigsaws: [entranceJ(3, 1, 0), K.villager(3, 4, FLOOR)],
  loot: [K.loot(1, 1, 7, 'temple')],
});

// ---------------------------------------------------------------------------------------------------------------
// Farms and pens

const FARM_DESERT = farmProcessor([['beetroots', 0.2], ['melon_stem', 0.1]]);

const largeFarm = K.house('desert_large_farm_1', {
  key: { k: 'composter' },
  layers: [
    '.............|CCCCCCCCCCCCC|Cfff~fff~fffC|Cfff~fff~fffC|Cfff~fff~fffC|Cfff~fff~fffC|Cfff~fff~fffC|Cfff~fff~fffC|Cfff~fff~fffC|Cfff~fff~fffC|Cfff~fff~fffC|CCCCCCCCCCCCC',
    '.k.........k.|.............|.321.123.231.|.213.312.123.|.132.231.312.|.321.123.231.|.213.312.123.|.132.231.312.|.321.123.231.|.213.312.123.|.132.231.312.|.............',
  ],
  jigsaws: [entranceJ(6, 1, 0)],
});

const farm1 = K.house('desert_farm_1', {
  key: { k: 'composter' },
  layers: ['.......|CCCCCCC|Cff~ffC|Cff~ffC|Cff~ffC|Cff~ffC|CCCCCCC', '..k....|.......|.12.21.|.23.32.|.31.13.|.12.21.|.......'],
  jigsaws: [entranceJ(3, 1, 0)],
});

const farm2 = K.house('desert_farm_2', {
  key: { k: 'composter' },
  layers: ['.........|CCCCCCCCC|Cfff~fffC|Cfff~fffC|Cfff~fffC|CCCCCCCCC', '.k.......|.........|.123.321.|.231.132.|.312.213.|.........'],
  jigsaws: [entranceJ(4, 1, 0)],
});

const pen1 = K.house('desert_animal_pen_1', {
  layers: ['...p...|ggggggg|ggggggg|ggggggg|ggggggg|ggggggg|ggggggg', '.......|FFFqFFF|F.....F|F.....F|F.X...F|F.....F|FFFFFFF'],
  jigsaws: [entranceJ(3, 1, 0), K.animal(2, 3, 'sand'), K.animal(4, 4, 'sand')],
});

// (with a water trough)
const pen2 = K.house('desert_animal_pen_2', {
  layers: [
    '....p....|ggggggggg|ggggggggg|ggggggggg|ggggggggg|ggggggggg|ggggggggg|ggggggggg',
    '.........|FFFFqFFFF|F.......F|F.......F|F.......F|F.CCC...F|F.C~C..XF|FFFFFFFFF',
  ],
  jigsaws: [entranceJ(4, 1, 0), K.animal(2, 3, 'sand'), K.animal(5, 3, 'sand'), K.animal(6, 5, 'sand')],
});

pool(`${V}/houses`, T, [
  [rigid(small1), 2], [rigid(small2), 2], [rigid(small3), 2], [rigid(small4), 2], [rigid(small5), 2], [rigid(small6), 1], [rigid(small7), 2], [rigid(small8), 2],
  [rigid(medium1), 2], [rigid(medium2), 2], [rigid(butcher), 2], [rigid(toolsmith), 2], [rigid(fletcher), 2], [rigid(shepherd), 2], [rigid(armorer), 1],
  [rigid(fisher), 2], [rigid(tannery), 2], [rigid(cartographer), 2], [rigid(library), 2], [rigid(mason), 2], [rigid(weaponsmith), 2],
  [rigid(temple1), 2], [rigid(temple2), 2], [rigid(largeFarm, FARM_DESERT), 11], [rigid(farm1, FARM_DESERT), 4], [rigid(farm2, FARM_DESERT), 4],
  [rigid(pen1), 2], [rigid(pen2), 2], [EMPTY, 5],
]);
