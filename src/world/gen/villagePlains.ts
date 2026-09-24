// Plains villages (vanilla PlainVillagePools): the town centres, streets and street ends, decorations and the pools
// that tie them to the houses (villagePlainsHouses.ts). Templates are hand-made after vanilla's village/plains/*
// structures: oak and cobblestone, dirt paths, hay and wool.

import { template, pool, SingleElement, EMPTY, type JigsawSpec, type Template, type Processor } from './jigsaw';
import {
  MOSSIFY_20, MOSSIFY_70, streetProcessor, villagersPool, feature, treeFeature, flowerPlain, pileHay, streetJ as street, houseJ as house, decorJ as decor, standJ,
  straightStreet, streetMap,
} from './villageCommon';
import { PLAINS_HOUSES, PK } from './villagePlainsHouses';

const V = 'village/plains';

// connectors to the plains pools
const streetJ = (x: number, y: number, z: number, facing: JigsawSpec['facing']) => street(x, y, z, facing, `${V}/streets`);
const houseJ = (x: number, y: number, z: number, facing: JigsawSpec['facing']) => house(x, y, z, facing, `${V}/houses`);
const decorJ = (x: number, z: number) => decor(x, z, `${V}/decor`);
const villagerJ = (x: number, y: number, z: number, final: string) => standJ(x, y, z, final, `${V}/villagers`);
const golemJ = (x: number, y: number, z: number, final: string) => standJ(x, y, z, final, 'village/common/iron_golem');

const rigid = (t: Template, ...p: Processor[]) => new SingleElement(t, 'rigid', p);
const terrain = (t: Template, ...p: Processor[]) => new SingleElement(t, 'terrain_matching', p);

// ---------------------------------------------------------------------------------------------------------------
// Town centres: each has the village's bell, an iron golem and a street leaving from every side

const fountain = template(`${V}/town_centers/plains_fountain_01`, {
  key: { ...PK, b: 'bell[attachment=ceiling,facing=north]' },
  layers: [
    'ppppppppppp|ppppppppppp|ppppppppppp|pppCCCCCppp|pppC~~~Cppp|pppC~~~Cppp|pppC~~~Cppp|pppCCCCCppp|ppppppppppp|ppppppppppp|ppppppppppp',
    '...........|...........|...........|...CCCCC...|...C...C...|...C...C...|...C...C...|...CCCCC...|...........|...........|...........',
    '...........|...........|...........|...F...F...|...........|...........|...........|...F...F...|...........|...........|...........',
    '...........|...........|...........|...F...F...|...........|.....b.....|...........|...F...F...|...........|...........|...........',
    '...........|...........|...........|...=====...|...=====...|...==C==...|...=====...|...=====...|...........|...........|...........',
  ],
  jigsaws: [
    streetJ(5, 1, 0, 'north'), streetJ(5, 1, 10, 'south'), streetJ(0, 1, 5, 'west'), streetJ(10, 1, 5, 'east'),
    golemJ(1, 0, 9, 'dirt_path'), villagerJ(9, 0, 1, 'dirt_path'), villagerJ(1, 0, 1, 'dirt_path'),
    { at: [5, 0, 5], facing: 'down', target: 'bottom', pool: 'village/common/well_bottoms', final: 'water' },
  ],
});

/** vanilla village/common/well_bottoms: the well's shaft, hung under the fountain */
const wellBottom = template('village/common/well_bottoms/well_bottom', {
  key: { ...PK },
  layers: ['CCCCC|CCCCC|CCCCC|CCCCC|CCCCC', 'CCCCC|C~~~C|C~~~C|C~~~C|CCCCC', 'CCCCC|C~~~C|C~~~C|C~~~C|CCCCC'],
  jigsaws: [{ at: [2, 2, 2], facing: 'up', name: 'bottom', final: 'water' }],
});
pool('village/common/well_bottoms', 'empty', [[rigid(wellBottom), 1]]);

const meeting1 = template(`${V}/town_centers/plains_meeting_point_1`, {
  key: { ...PK, b: 'bell[attachment=double_wall,facing=east]', s: 'oak_stairs[facing=south]', n: 'oak_stairs[facing=north]', e: 'oak_stairs[facing=east]', w: 'oak_stairs[facing=west]' },
  layers: [
    'ggpppppgg|gpppppppg|ppppppppp|ppppppppp|pppCpCppp|ppppppppp|ppppppppp|gpppppppg|ggpppppgg',
    '.........|.H.....H.|...nnn...|.........|.w.L.L.e.|.........|...sss...|.H.....H.|.........',
    '.........|.........|.........|.........|...L.L...|.........|.........|.........|.........',
    '.........|.........|.........|.........|...LbL...|.........|.........|.........|.........',
    '.........|.........|.........|.........|..<XXX>..|.........|.........|.........|.........',
  ],
  jigsaws: [
    streetJ(4, 1, 0, 'north'), streetJ(4, 1, 8, 'south'), streetJ(0, 1, 4, 'west'), streetJ(8, 1, 4, 'east'),
    golemJ(7, 0, 4, 'dirt_path'), villagerJ(1, 0, 4, 'dirt_path'), villagerJ(4, 0, 7, 'dirt_path'),
  ],
});

const meeting2 = template(`${V}/town_centers/plains_meeting_point_2`, {
  key: { ...PK, b: 'bell[attachment=ceiling,facing=north]', s: 'oak_stairs[facing=south]', n: 'oak_stairs[facing=north]', e: 'oak_stairs[facing=east]', w: 'oak_stairs[facing=west]' },
  layers: [
    'ppppppppp|ppppppppp|ppppppppp|pppCCCppp|pppCCCppp|pppCCCppp|ppppppppp|ppppppppp|ppppppppp',
    '.........|.........|.........|...L.L...|.........|...L.L...|.........|.........|.........',
    '.........|.........|.........|...L.L...|.........|...L.L...|.........|.........|.........',
    '.........|.........|.........|...L.L...|....b....|...L.L...|.........|.........|.........',
    '.........|.........|..sssss..|..ePPPw..|..ePPPw..|..ePPPw..|..nnnnn..|.........|.........',
    '.........|.........|.........|...sss...|...e_w...|...nnn...|.........|.........|.........',
  ],
  jigsaws: [
    streetJ(4, 1, 0, 'north'), streetJ(4, 1, 8, 'south'), streetJ(0, 1, 4, 'west'), streetJ(8, 1, 4, 'east'),
    golemJ(1, 0, 1, 'dirt_path'), villagerJ(7, 0, 7, 'dirt_path'), villagerJ(1, 0, 7, 'dirt_path'),
  ],
});

const meeting3 = template(`${V}/town_centers/plains_meeting_point_3`, {
  key: { ...PK, b: 'bell[attachment=floor,facing=north]', w: 'cobblestone_wall', s: 'cobblestone_stairs[facing=south]', n: 'cobblestone_stairs[facing=north]', e: 'cobblestone_stairs[facing=east]', o: 'cobblestone_stairs[facing=west]' },
  layers: [
    'ppppppppp|ppppppppp|ppCCCCCpp|ppCCCCCpp|ppCCCCCpp|ppCCCCCpp|ppCCCCCpp|ppppppppp|ppppppppp',
    '.........|.........|..wsssw..|..eCCCo..|..eCCCo..|..eCCCo..|..wnnnw..|.........|.........',
    '.........|.........|..T...T..|.........|....b....|.........|..T...T..|.........|.........',
  ],
  jigsaws: [
    streetJ(4, 1, 0, 'north'), streetJ(4, 1, 8, 'south'), streetJ(0, 1, 4, 'west'), streetJ(8, 1, 4, 'east'),
    golemJ(7, 0, 1, 'dirt_path'), villagerJ(1, 0, 1, 'dirt_path'), villagerJ(7, 0, 7, 'dirt_path'),
  ],
});

/** the zombie villages' town centres (see villages.ts ZOMBIE_STARTS): for now, the living ones */
export const ZOMBIE_TOWN_CENTERS = [rigid(fountain, MOSSIFY_20), rigid(meeting1, MOSSIFY_20), rigid(meeting2), rigid(meeting3, MOSSIFY_70)];

pool(`${V}/town_centers`, 'empty', [
  [rigid(fountain, MOSSIFY_20), 50], [rigid(meeting1, MOSSIFY_20), 50], [rigid(meeting2), 50], [rigid(meeting3, MOSSIFY_70), 50],
  ...ZOMBIE_TOWN_CENTERS.map((e) => [e, 1] as [SingleElement, number]),
]);

// ---------------------------------------------------------------------------------------------------------------
// Streets (see villageCommon's straightStreet and streetMap)

const S = `${V}/streets`;
const s = (n: string) => `${S}/${n}`;
const streets: [Template, number][] = [
  // corners: in from the north, out to the east (drawn the other way round, a corner turns west)
  [streetMap(s('corner_01'), ['.ppp...', '.ppppp.', '.pppppp', '.pppppp', '.......'], [streetJ(2, 1, 0, 'north'), streetJ(6, 1, 2, 'east'), houseJ(0, 1, 2, 'west'), houseJ(2, 1, 4, 'south'), decorJ(0, 4)]), 2],
  [streetMap(s('corner_02'), ['.ppp.....', '.ppp.....', '.ppppppp.', '.pppppppp', '.pppppppp', '.........'], [streetJ(2, 1, 0, 'north'), streetJ(8, 1, 3, 'east'), houseJ(0, 1, 2, 'west'), houseJ(3, 1, 5, 'south'), decorJ(0, 5), decorJ(7, 5)]), 2],
  [streetMap(s('corner_03'), ['.ppp..', '.ppp..', '.ppppp', '.ppppp', '..ppp.', '......'], [streetJ(2, 1, 0, 'north'), streetJ(5, 1, 3, 'east'), houseJ(0, 1, 3, 'west'), houseJ(2, 1, 5, 'south'), decorJ(5, 5)]), 2],
  [straightStreet(V, s('straight_01'), 13, [[2, 'w'], [3, 'e'], [8, 'w'], [9, 'e']], [[6, 'w'], [12, 'e']]), 4],
  [straightStreet(V, s('straight_02'), 11, [[2, 'e'], [5, 'w'], [8, 'e']], [[1, 'w'], [9, 'w']]), 4],
  [straightStreet(V, s('straight_03'), 9, [[2, 'w'], [2, 'e'], [7, 'w']], [[6, 'e']]), 7],
  [straightStreet(V, s('straight_04'), 8, [[3, 'w'], [4, 'e']], [[7, 'w']]), 7],
  [straightStreet(V, s('straight_05'), 15, [[2, 'e'], [4, 'w'], [8, 'e'], [10, 'w'], [13, 'e']], [[7, 'w'], [14, 'w']]), 3],
  [straightStreet(V, s('straight_06'), 6, [[3, 'e']], [[2, 'w']]), 4],
  // crossroads: T junctions and crossings
  [streetMap(s('crossroad_01'), ['..ppp..', 'ppppppp', 'ppppppp', 'ppppppp', '..ppp..', '..ppp..', '..ppp..'], [streetJ(3, 1, 0, 'north'), streetJ(3, 1, 6, 'south'), streetJ(0, 1, 2, 'west'), streetJ(6, 1, 2, 'east'), houseJ(0, 1, 5, 'west'), houseJ(6, 1, 5, 'east'), decorJ(0, 0)]), 2],
  [streetMap(s('crossroad_02'), ['..ppp..', '..ppp..', 'ppppppp', 'ppppppp', 'ppppppp', '..ppp..', '..ppp..'], [streetJ(3, 1, 0, 'north'), streetJ(3, 1, 6, 'south'), streetJ(0, 1, 3, 'west'), streetJ(6, 1, 3, 'east'), decorJ(0, 0), decorJ(6, 6)]), 1],
  [streetMap(s('crossroad_03'), ['..ppp..', 'ppppppp', 'ppppppp', 'ppppppp', '.......'], [streetJ(3, 1, 0, 'north'), streetJ(0, 1, 2, 'west'), streetJ(6, 1, 2, 'east'), houseJ(3, 1, 4, 'south'), decorJ(0, 4), decorJ(6, 4)]), 2],
  [streetMap(s('crossroad_04'), ['.ppp.', '.ppp.', '.pppp', '.pppp', '.pppp', '.ppp.', '.ppp.'], [streetJ(2, 1, 0, 'north'), streetJ(2, 1, 6, 'south'), streetJ(4, 1, 3, 'east'), houseJ(0, 1, 2, 'west'), houseJ(0, 1, 5, 'west'), decorJ(4, 0)]), 2],
  [streetMap(s('crossroad_05'), ['.ppp.', '.ppp.', 'pppp.', 'pppp.', 'pppp.', '.ppp.', '.ppp.', '.ppp.'], [streetJ(2, 1, 0, 'north'), streetJ(2, 1, 7, 'south'), streetJ(0, 1, 3, 'west'), houseJ(4, 1, 2, 'east'), houseJ(4, 1, 6, 'east'), decorJ(0, 7)]), 2],
  [streetMap(s('crossroad_06'), ['...ppp...', '...ppp...', 'ppppppppp', 'ppppppppp', 'ppppppppp', '.........'], [streetJ(4, 1, 0, 'north'), streetJ(0, 1, 3, 'west'), streetJ(8, 1, 3, 'east'), houseJ(2, 1, 5, 'south'), houseJ(6, 1, 5, 'south'), houseJ(1, 1, 0, 'north'), houseJ(7, 1, 0, 'north'), decorJ(8, 5)]), 2],
  // a jog to one side
  [streetMap(s('turn_01'), ['.ppp...', '.ppp...', '.pppp..', '..pppp.', '...ppp.', '...ppp.', '...ppp.'], [streetJ(2, 1, 0, 'north'), streetJ(4, 1, 6, 'south'), houseJ(0, 1, 5, 'west'), houseJ(6, 1, 1, 'east'), decorJ(0, 3)]), 3],
];
const PLAINS_STREET = streetProcessor('oak_planks', 0.1);
pool(S, `${V}/terminators`, streets.map(([t, w]) => [terrain(t, PLAINS_STREET), w]));

// the ends of streets that couldn't go on (savanna, snowy and taiga villages use them too, through their own street processors)
const T = `${V}/terminators`;
export const PLAINS_TERMINATORS: Template[] = [
  streetMap(`${T}/terminator_01`, ['.ppp.', '.ppp.', '..p..'], [streetJ(2, 1, 0, 'north')]),
  streetMap(`${T}/terminator_02`, ['.ppp.', '.gpg.'], [streetJ(2, 1, 0, 'north')]),
  streetMap(`${T}/terminator_03`, ['.ppp.'], [streetJ(2, 1, 0, 'north')]),
  streetMap(`${T}/terminator_04`, ['.ppp.', 'ppppp', '.ppp.'], [streetJ(2, 1, 0, 'north')]),
];
pool(T, 'empty', PLAINS_TERMINATORS.map((t) => [terrain(t, PLAINS_STREET), 1]));

// ---------------------------------------------------------------------------------------------------------------
// Decorations: lamp posts, oaks, flowers and hay

const lamp = template(`${V}/plains_lamp_1`, {
  key: { F: 'oak_fence', T: 'torch' },
  layers: ['F', 'F', 'T'],
  jigsaws: [{ at: [0, 0, 0], facing: 'down', top: 'south', name: 'bottom', target: 'bottom', final: 'oak_fence' }],
});
pool(`${V}/decor`, 'empty', [[rigid(lamp), 2], [feature(treeFeature('oak'), 'oak'), 1], [feature(flowerPlain, 'flower_plain'), 1], [feature(pileHay, 'pile_hay'), 1], [EMPTY, 2]]);
pool(`${V}/trees`, 'empty', [[feature(treeFeature('oak'), 'oak'), 1]]);

villagersPool('plains', 'plains');

// ---------------------------------------------------------------------------------------------------------------
// Houses, job sites, farms and pens

pool(`${V}/houses`, T, [...PLAINS_HOUSES, [EMPTY, 10]]);

