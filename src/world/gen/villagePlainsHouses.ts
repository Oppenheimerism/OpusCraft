// Plains village houses, job sites, farms and pens (vanilla village/plains/houses/*), hand-made after vanilla's:
// cobblestone footings, oak log frames and plank walls, oak stair roofs, glass panes and oak doors, a workstation in
// every job site. Each stands with its entrance to the north: the connector in front of the door on layer 1 (the
// ground floor), the floor on layer 0, which sits at the ground's height.

import { template, SingleElement, type JigsawSpec, type Template, type Processor } from './jigsaw';
import { MOSSIFY_10, MOSSIFY_70, farmProcessor, entranceJ, standJ } from './villageCommon';

const V = 'village/plains';
const H = `${V}/houses`;

/** the blocks every plains piece draws from ('.' leaves the world as it is) */
export const PK: Record<string, string> = {
  C: 'cobblestone', P: 'oak_planks', L: 'oak_log[axis=y]', X: 'oak_log[axis=x]', Z: 'oak_log[axis=z]', G: 'glass_pane', Q: 'glass',
  F: 'oak_fence', T: 'torch', H: 'hay_block[axis=y]', '~': 'water', p: 'dirt_path', g: 'grass_block', d: 'dirt', f: 'farmland[moisture=7]',
  W: 'white_wool', c: 'crafting_table', B: 'bookshelf', _: 'oak_slab[type=bottom]', '-': 'oak_slab[type=top]', '=': 'cobblestone_slab[type=bottom]',
  '>': 'oak_stairs[facing=east]', '<': 'oak_stairs[facing=west]', '^': 'oak_stairs[facing=north]', v: 'oak_stairs[facing=south]',
  D: 'oak_door[facing=south,half=lower,hinge=left]', U: 'oak_door[facing=south,half=upper,hinge=left]',
  '1': 'wheat[age=2]', '2': 'wheat[age=5]', '3': 'wheat[age=7]',
};

const bed = (color: string, facing: string) => ({ b: `${color}_bed[facing=${facing},part=foot]`, h: `${color}_bed[facing=${facing},part=head]` });
const villager = (x: number, z: number, floor: string, y = 0): JigsawSpec => standJ(x, y, z, floor, `${V}/villagers`);
const animal = (x: number, z: number, from = 'village/common/animals', floor = 'grass_block'): JigsawSpec => standJ(x, 0, z, floor, from);
const cat = (x: number, z: number, floor: string, y = 0): JigsawSpec => standJ(x, y, z, floor, 'village/common/cats');
const loot = (x: number, y: number, z: number, table: string) => ({ at: [x, y, z] as [number, number, number], table: `chests/village/village_${table}` });
const house = (name: string, spec: { key?: Record<string, string>; layers: string[]; jigsaws: JigsawSpec[]; loot?: { at: [number, number, number]; table: string }[] }): Template =>
  template(`${H}/${name}`, { key: { ...PK, ...spec.key }, layers: spec.layers, jigsaws: spec.jigsaws, loot: spec.loot });
const rigid = (t: Template, ...p: Processor[]) => new SingleElement(t, 'rigid', p);

// ---------------------------------------------------------------------------------------------------------------
// Small houses: one room, a bed

const small1 = house('plains_small_house_1', {
  key: { ...bed('red', 'south'), t: 'wall_torch[facing=north]' },
  layers: [
    '..p..|CCCCC|CPPPC|CPPPC|CPPPC|CCCCC',
    '.....|LPDPL|P...P|Gb..G|Ph.cP|LPPPL',
    '.....|LPUPL|P...P|G...G|Pt..P|LPGPL',
    '.....|LPPPL|P...P|P...P|P...P|LPPPL',
    '.....|>PPP<|>...<|>...<|>...<|>PPP<',
    '.....|.>P<.|.>.<.|.>.<.|.>.<.|.>P<.',
    '.....|..P..|..P..|..P..|..P..|..P..',
  ],
  jigsaws: [entranceJ(2, 1, 0), villager(2, 3, 'oak_planks')],
});

const small2 = house('plains_small_house_2', {
  key: { ...bed('white', 'east'), t: 'wall_torch[facing=north]' },
  layers: [
    '..p..|CCCCC|CPPPC|CPPPC|CPPPC|CCCCC',
    '.....|CCDCC|C..cC|C...C|Cbh.C|CCCCC',
    '.....|PGUGP|P...P|G...G|P..tP|PPGPP',
    'vvvvv|PPPPP|P...P|P...P|P...P|PPPPP',
    '.....|vvvvv|P...P|P...P|P...P|^^^^^',
    '.....|.....|vvvvv|P...P|^^^^^|.....',
    '.....|.....|.....|_____|.....|.....',
  ],
  jigsaws: [entranceJ(2, 1, 0), villager(2, 3, 'oak_planks')],
});

const small3 = house('plains_small_house_3', {
  key: { ...bed('red', 'east'), t: 'wall_torch[facing=north]', k: 'chest[facing=north]' },
  layers: [
    '...p...|CCCCCCC|CPPPPPC|CPPPPPC|CPPPPPC|CCCCCCC',
    '.......|LPPDPPL|P.....P|P.....P|Pbh.ckP|LPPPPPL',
    '.......|LGPUPGL|G.....G|P.....P|Pt....P|LPGPGPL',
    'vvvvvvv|LPPPPPL|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|vvvvvvv|P.....P|P.....P|P.....P|^^^^^^^',
    '.......|.......|vvvvvvv|P.....P|^^^^^^^|.......',
    '.......|.......|.......|_______|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), villager(3, 2, 'oak_planks')],
  loot: [loot(5, 1, 4, 'plains_house')],
});

const small4 = house('plains_small_house_4', {
  key: { ...bed('yellow', 'south'), t: 'wall_torch[facing=west]' },
  layers: [
    '..p..|CCCCC|CPPPC|CPPPC|CPPPC|CCCCC',
    '.....|LPDPL|P..bP|G..hG|Pc..P|LPPPL',
    '.....|LPUPL|P...P|G...G|P..tP|LPGPL',
    '.....|LPPPL|P...P|P...P|P...P|LPPPL',
    '.....|LXXXL|ZPPPZ|ZPPPZ|ZPPPZ|LXXXL',
    '.....|T...T|.....|.....|.....|T...T',
  ],
  jigsaws: [entranceJ(2, 1, 0), villager(1, 2, 'oak_planks')],
});

const small5 = house('plains_small_house_5', {
  key: { ...bed('red', 'east') },
  layers: [
    '.....|CPPPC|CCCCC|CPPPC|CPPPC|CPPPC|CCCCC',
    '.....|F...F|LPDPL|P...P|G..cG|Pbh.P|LPPPL',
    '.....|F...F|LPUPL|P...P|G...G|P...P|LPGPL',
    '.....|vvvvv|LPPPL|P...P|P...P|P...P|LPPPL',
    '.....|.....|>PPP<|>...<|>...<|>...<|>PPP<',
    '.....|.....|.>P<.|.>.<.|.>.<.|.>.<.|.>P<.',
    '.....|.....|..P..|..P..|..P..|..P..|..P..',
  ],
  jigsaws: [entranceJ(2, 1, 0), villager(2, 3, 'oak_planks')],
});

const small6 = house('plains_small_house_6', {
  key: { ...bed('white', 'east'), t: 'wall_torch[facing=west]' },
  layers: [
    '..p..|CCCCC|CCCCC|CCCCC|CCCCC|CCCCC',
    '.....|CCDCC|C...C|C...C|Cbh.C|CCCCC',
    '.....|CCUCC|G...G|C...C|C..tC|CCGCC',
    '.....|CCCCC|C...C|C...C|C...C|CCCCC',
    '.....|>PPP<|>...<|>...<|>...<|>PPP<',
    '.....|.>P<.|.>.<.|.>.<.|.>.<.|.>P<.',
    '.....|.._..|.._..|.._..|.._..|.._..',
  ],
  jigsaws: [entranceJ(2, 1, 0), villager(2, 2, 'cobblestone')],
});

const small7 = house('plains_small_house_7', {
  key: { ...bed('red', 'north'), t: 'wall_torch[facing=north]' },
  layers: [
    '..p..|CCCCC|CPPPC|CPPPC|CPPPC|CPPPC|CCCCC',
    '.....|LPDPL|P...P|G...G|Ph..P|Pb.cP|LPPPL',
    '.....|LPUPL|P...P|G...G|P...P|P..tP|LPGPL',
    '.....|LPPPL|P...P|P...P|P...P|P...P|LPPPL',
    '.....|>PPP<|>...<|>...<|>...<|>...<|>PPP<',
    '.....|.>P<.|.>.<.|.>.<.|.>.<.|.>.<.|.>P<.',
    '.....|..P..|..P..|..P..|..P..|..P..|..P..',
  ],
  jigsaws: [entranceJ(2, 1, 0), villager(2, 3, 'oak_planks'), cat(3, 2, 'oak_planks')],
});

const small8 = house('plains_small_house_8', {
  key: { ...bed('red', 'south'), k: 'chest[facing=west]', t: 'wall_torch[facing=south]' },
  layers: [
    '..p..|CCCCC|CPPPC|CPPPC|CPPPC|CCCCC',
    '.....|LPDPL|Pb.kP|Ph..P|Pc..P|LPPPL',
    '.....|LPUPL|G...G|P...P|G...G|LPPPL',
    '.....|LPPPL|P...P|P...P|P...P|LPPPL',
    '.....|vvvvv|P...P|P...P|P...P|^^^^^',
    '.....|.....|vvvvv|P...P|^^^^^|.....',
    '.....|.....|.....|PPPPP|.....|.....',
  ],
  jigsaws: [entranceJ(2, 1, 0), villager(2, 3, 'oak_planks')],
  loot: [loot(3, 1, 2, 'plains_house')],
});

// ---------------------------------------------------------------------------------------------------------------
// Bigger houses: two or more beds

const medium1 = house('plains_medium_house_1', {
  key: { ...bed('red', 'north'), k: 'chest[facing=north]', u: 'furnace[facing=north]', t: 'wall_torch[facing=north]' },
  layers: [
    '...p...|CCCCCCC|CPPPPPC|CPPPPPC|CPPPPPC|CPPPPPC|CPPPPPC|CCCCCCC',
    '.......|LPPDPPL|P.....P|G.....G|P.....P|Ph...hP|PbkucbP|LPPPPPL',
    '.......|LPPUPPL|G.....G|P.....P|G.....G|P.....P|P.t.t.P|LPPGPPL',
    '.......|LPPPPPL|P.....P|P.....P|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|>PPPPP<|>.....<|>.....<|>.....<|>.....<|>.....<|>PPPPP<',
    '.......|.>PPP<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>PPP<.',
    '.......|..>P<..|..>.<..|..>.<..|..>.<..|..>.<..|..>.<..|..>P<..',
    '.......|..._...|..._...|..._...|..._...|..._...|..._...|..._...',
  ],
  jigsaws: [entranceJ(3, 1, 0), villager(3, 3, 'oak_planks'), villager(2, 4, 'oak_planks'), cat(4, 3, 'oak_planks')],
  loot: [loot(2, 1, 6, 'plains_house')],
});

const medium2 = house('plains_medium_house_2', {
  key: { ...bed('white', 'east'), k: 'chest[facing=north]', t: 'wall_torch[facing=north]' },
  layers: [
    '....p....|CCCCCCCCC|CPPPPPPPC|CPPPPPPPC|CPPPPPPPC|CCCCCCCCC',
    '.........|LPPPDPPPL|Pbh.....P|P.......P|Pbh..c.kP|LPPPPPPPL',
    '.........|LGPPUPPGL|P.......P|G.......G|P...t...P|LPGPPPGPL',
    'vvvvvvvvv|LPPPPPPPL|P.......P|P.......P|P.......P|LPPPPPPPL',
    '.........|vvvvvvvvv|P.......P|P.......P|P.......P|^^^^^^^^^',
    '.........|.........|vvvvvvvvv|P.......P|^^^^^^^^^|.........',
    '.........|.........|.........|_________|.........|.........',
  ],
  jigsaws: [entranceJ(4, 1, 0), villager(4, 2, 'oak_planks'), villager(6, 3, 'oak_planks')],
  loot: [loot(7, 1, 4, 'plains_house')],
});

const big1 = house('plains_big_house_1', {
  key: { ...bed('red', 'north'), k: 'chest[facing=north]', u: 'furnace[facing=north]', a: 'ladder[facing=west]', t: 'wall_torch[facing=north]' },
  layers: [
    '....p....|CCCCCCCCC|CPPPPPPPC|CPPPPPPPC|CPPPPPPPC|CPPPPPPPC|CPPPPPPPC|CCCCCCCCC',
    '.........|LPPPDPPPL|P.......P|G.......G|P.......P|G.......G|Pc.u..kaP|LPPPPPPPL',
    '.........|LPPPUPPPL|P.......P|G.......G|P.......P|G.......G|P...t..aP|LPPGPGPPL',
    '.........|LPPPPPPPL|P.......P|P.......P|P.......P|P.......P|P......aP|LPPPPPPPL',
    '.........|LXXXXXXXL|ZPPPPPPPZ|ZPPPPPPPZ|ZPPPPPPPZ|ZPPPPPPPZ|ZPPPPPPaZ|LXXXXXXXL',
    '.........|LPPPPPPPL|Ph.h.h..P|Pb.b.b..P|P.......P|G.......G|P......aP|LPPPPPPPL',
    '.........|LPGPPPGPL|P.......P|G.......G|P.......P|G.......G|P...t...P|LPPPPPPPL',
    '.........|LPPPPPPPL|P.......P|P.......P|P.......P|P.......P|P.......P|LPPPPPPPL',
    '.........|vvvvvvvvv|P.......P|P.......P|P.......P|P.......P|P.......P|^^^^^^^^^',
    '.........|.........|vvvvvvvvv|P.......P|P.......P|P.......P|^^^^^^^^^|.........',
    '.........|.........|.........|vvvvvvvvv|P.......P|^^^^^^^^^|.........|.........',
    '.........|.........|.........|.........|_________|.........|.........|.........',
  ],
  jigsaws: [entranceJ(4, 1, 0), villager(4, 3, 'oak_planks'), villager(2, 4, 'oak_planks'), villager(5, 4, 'oak_planks', 4), cat(3, 5, 'oak_planks')],
  loot: [loot(6, 1, 6, 'plains_house')],
});

// ---------------------------------------------------------------------------------------------------------------
// Job sites

const butcher1 = house('plains_butcher_shop_1', {
  key: { s: 'smoker[facing=north]', k: 'chest[facing=north]', g: 'oak_fence_gate[facing=east]' },
  layers: [
    '...p...|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|.......|.......|.......|.......|.......',
    '.......|LPPDPPL|P.....P|G.....G|P.k.s.P|LPPPPPL|F.....F|F.....F|F.....g|F.....F|FFFFFFF',
    '.......|LPPUPPL|G.....G|P.....P|G.....G|LPPGPPL|.......|.......|.......|.......|.......',
    '.......|LPPPPPL|P.....P|P.....P|P.....P|LPPPPPL|.......|.......|.......|.......|.......',
    '.......|vvvvvvv|P.....P|P.....P|P.....P|^^^^^^^|.......|.......|.......|.......|.......',
    '.......|.......|vvvvvvv|P.....P|^^^^^^^|.......|.......|.......|.......|.......|.......',
    '.......|.......|.......|_______|.......|.......|.......|.......|.......|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), villager(3, 2, 'cobblestone'), animal(2, 8, 'village/common/butcher_animals'), animal(4, 8, 'village/common/butcher_animals')],
  loot: [loot(2, 1, 4, 'butcher')],
});

const butcher2 = house('plains_butcher_shop_2', {
  key: { s: 'smoker[facing=north]', k: 'chest[facing=north]', t: 'wall_torch[facing=north]', H: 'hay_block[axis=x]' },
  layers: [
    '...p...|..ppp..|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC',
    '.......|.......|L--.--L|P.....P|P.s.k.P|LPPPPPL',
    '.......|.......|L.....L|P.....P|P..t..P|LPPGPPL',
    '.......|vvvvvvv|LPPPPPL|P.....P|P.....P|LPPPPPL',
    '.......|.......|vvvvvvv|P.....P|^^^^^^^|.......',
    '.......|.......|.......|vvvvvvv|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), villager(3, 3, 'cobblestone')],
  loot: [loot(4, 1, 4, 'butcher')],
});

const toolsmith = house('plains_tool_smith_1', {
  key: { m: 'smithing_table', k: 'chest[facing=north]', t: 'wall_torch[facing=north]' },
  layers: [
    '...p...|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC',
    '.......|CCCDCCC|C.....C|C.....C|C.....C|Cm...kC|CCCCCCC',
    '.......|CGCUCGC|C.....C|G.....G|C.....C|C..t..C|CCCGCCC',
    '.......|CCCCCCC|C.....C|C.....C|C.....C|C.....C|CCCCCCC',
    '.......|LXXXXXL|Z.....Z|Z.....Z|Z.....Z|Z.....Z|LXXXXXL',
    '.......|>PPPPP<|>.....<|>.....<|>.....<|>.....<|>PPPPP<',
    '.......|.>PPP<.|.>...<.|.>...<.|.>...<.|.>...<.|.>PPP<.',
    '.......|..>P<..|..>.<..|..>.<..|..>.<..|..>.<..|..>P<..',
    '.......|..._...|..._...|..._...|..._...|..._...|..._...',
  ],
  jigsaws: [entranceJ(3, 1, 0), villager(3, 3, 'cobblestone')],
  loot: [loot(5, 1, 5, 'toolsmith')],
});

const fletcher = house('plains_fletcher_house_1', {
  key: { ...bed('red', 'north'), a: 'fletching_table', k: 'chest[facing=north]' },
  layers: [
    '...p...|.PPPPP.|CCCCCCC|CPPPPPC|CPPPPPC|CPPPPPC|CPPPPPC|CCCCCCC',
    '.......|.F...F.|LPPDPPL|P.....P|G.....G|P....hP|Pa.k.bP|LPPPPPL',
    '.......|.F...F.|LPPUPPL|P.....P|G.....G|P.....P|P.....P|LPPGPPL',
    '.......|.vvvvv.|LPPPPPL|P.....P|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|.......|>PPPPP<|>.....<|>.....<|>.....<|>.....<|>PPPPP<',
    '.......|.......|.>PPP<.|.>...<.|.>...<.|.>...<.|.>...<.|.>PPP<.',
    '.......|.......|..>P<..|..>.<..|..>.<..|..>.<..|..>.<..|..>P<..',
    '.......|.......|..._...|..._...|..._...|..._...|..._...|..._...',
  ],
  jigsaws: [entranceJ(3, 1, 0), villager(3, 4, 'oak_planks')],
  loot: [loot(3, 1, 6, 'fletcher')],
});

const shepherd = house('plains_shepherds_house_1', {
  key: { ...bed('white', 'north'), o: 'loom[facing=north]', k: 'chest[facing=north]', g: 'oak_fence_gate[facing=east]' },
  layers: [
    '...p.......|CCCCCCC....|CPPPPPC....|CPPPPPC....|CPPPPPC....|CCCCCCC....',
    '...........|LPPDPPLFFFF|PW....P...F|G....hG...g|Po.k.bP...F|LPPPPPLFFFF',
    '...........|LPPUPPL....|P.....P....|G.....G....|P.....P....|LPPGPPL....',
    '...........|LPPPPPL....|P.....P....|P.....P....|P.....P....|LPPPPPL....',
    '...........|vvvvvvv....|P.....P....|P.....P....|P.....P....|^^^^^^^....',
    '...........|...........|vvvvvvv....|P.....P....|^^^^^^^....|...........',
    '...........|...........|...........|_______....|...........|...........',
  ],
  jigsaws: [entranceJ(3, 1, 0), villager(3, 2, 'oak_planks'), animal(8, 3, 'village/common/sheep')],
  loot: [loot(3, 1, 4, 'shepherd')],
});

const armorer = house('plains_armorer_house_1', {
  key: { z: 'blast_furnace[facing=north]', k: 'chest[facing=north]', t: 'wall_torch[facing=north]' },
  layers: [
    '...p...|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC',
    '.......|LCCDCCL|C.....C|C.....C|C.....C|Cz.k..C|LCCCCCL',
    '.......|LCGUGCL|C.....C|G.....G|C.....C|C...t.C|LCCGCCL',
    '.......|LPPPPPL|P.....P|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|vvvvvvv|P.....P|P.....P|P.....P|P.....P|^^^^^^^',
    '.......|.......|vvvvvvv|P.....P|P.....P|^^^^^^^|.......',
    '.......|.......|.......|vvvvvvv|^^^^^^^|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), villager(3, 3, 'cobblestone')],
  loot: [loot(3, 1, 5, 'armorer')],
});

const fisher = house('plains_fisher_cottage_1', {
  key: { r: 'barrel[facing=up]', k: 'chest[facing=west]' },
  layers: [
    '..p......|CCCCC....|CPPPC.~~.|CPPPC.~~.|CPPPC.~~.|CCCCC....',
    '.........|LPDPL...F|P...P....|G...G....|Pr.kP....|LPPPL...F',
    '.........|LPUPL...T|P...P....|G...G....|P...P....|LPGPL...T',
    '.........|LPPPL....|P...P....|P...P....|P...P....|LPPPL....',
    '.........|>PPP<....|>...<....|>...<....|>...<....|>PPP<....',
    '.........|.>P<.....|.>.<.....|.>.<.....|.>.<.....|.>P<.....',
    '.........|..P......|..P......|..P......|..P......|..P......',
  ],
  jigsaws: [entranceJ(2, 1, 0), villager(2, 2, 'oak_planks')],
  loot: [loot(3, 1, 4, 'fisher')],
});

const tannery = house('plains_tannery_1', {
  key: { ...bed('red', 'north'), w: 'water_cauldron[level=3]', k: 'chest[facing=north]' },
  layers: [
    '...p...|CCCCCCC|CPPPPPC|CPPPPPC|CPPPPPC|CPPPPPC|CCCCCCC',
    '.......|LPPDPPL|P.....P|G.....G|P....hP|Pw.k.bP|LPPPPPL',
    '.......|LPPUPPL|P.....P|G.....G|P.....P|P.....P|LPPGPPL',
    '.......|LPPPPPL|P.....P|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|>PPPPP<|>.....<|>.....<|>.....<|>.....<|>PPPPP<',
    '.......|.>PPP<.|.>...<.|.>...<.|.>...<.|.>...<.|.>PPP<.',
    '.......|..>P<..|..>.<..|..>.<..|..>.<..|..>.<..|..>P<..',
    '.......|..._...|..._...|..._...|..._...|..._...|..._...',
  ],
  jigsaws: [entranceJ(3, 1, 0), villager(3, 3, 'oak_planks')],
  loot: [loot(3, 1, 5, 'tannery')],
});

const cartographer = house('plains_cartographer_1', {
  key: { m: 'cartography_table', k: 'chest[facing=north]', t: 'wall_torch[facing=north]' },
  layers: [
    '...p...|CCCCCCC|CPPPPPC|CPPPPPC|CPPPPPC|CPPPPPC|CCCCCCC',
    '.......|LPPDPPL|P.....P|Q.....Q|P.....P|Pm.k..P|LPPPPPL',
    '.......|LQPUPQL|P.....P|Q.....Q|P.....P|P...t.P|LPQQQPL',
    '.......|LPPPPPL|P.....P|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|vvvvvvv|P.....P|P.....P|P.....P|P.....P|^^^^^^^',
    '.......|.......|vvvvvvv|P.....P|P.....P|^^^^^^^|.......',
    '.......|.......|.......|vvvvvvv|^^^^^^^|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), villager(3, 3, 'oak_planks')],
  loot: [loot(3, 1, 5, 'cartographer')],
});

const library1 = house('plains_library_1', {
  key: { n: 'lectern[facing=north]', t: 'wall_torch[facing=north]' },
  layers: [
    '....p....|CCCCCCCCC|CPPPPPPPC|CPPPPPPPC|CPPPPPPPC|CPPPPPPPC|CPPPPPPPC|CPPPPPPPC|CPPPPPPPC|CCCCCCCCC',
    '.........|LPPPDPPPL|PB.....BP|PB.....BP|G.......G|PB.....BP|PB.....BP|G.......G|PBB.n.BBP|LPPPPPPPL',
    '.........|LPPPUPPPL|PB.....BP|PB.....BP|G.......G|PB.....BP|PB.....BP|G.......G|PBB...BBP|LPPGPGPPL',
    '.........|LPPPPPPPL|P.......P|P.......P|P.......P|P.......P|P.......P|P.......P|P...t...P|LPPPPPPPL',
    '.........|>PPPPPPP<|>.......<|>.......<|>.......<|>.......<|>.......<|>.......<|>.......<|>PPPPPPP<',
    '.........|.>PPPPP<.|.>.....<.|.>.....<.|.>.....<.|.>.....<.|.>.....<.|.>.....<.|.>.....<.|.>PPPPP<.',
    '.........|..>PPP<..|..>...<..|..>...<..|..>...<..|..>...<..|..>...<..|..>...<..|..>...<..|..>PPP<..',
    '.........|...>P<...|...>.<...|...>.<...|...>.<...|...>.<...|...>.<...|...>.<...|...>.<...|...>P<...',
    '.........|...._....|...._....|...._....|...._....|...._....|...._....|...._....|...._....|...._....',
  ],
  jigsaws: [entranceJ(4, 1, 0), villager(4, 4, 'oak_planks'), cat(3, 6, 'oak_planks')],
});

const library2 = house('plains_library_2', {
  key: { n: 'lectern[facing=north]' },
  layers: [
    '...p...|CCCCCCC|CPPPPPC|CPPPPPC|CPPPPPC|CPPPPPC|CPPPPPC|CCCCCCC',
    '.......|LPPDPPL|PB...BP|G.....G|PB...BP|PB...BP|PBBnBBP|LPPPPPL',
    '.......|LGPUPGL|PB...BP|G.....G|PB...BP|PB...BP|PBB.BBP|LPPPPPL',
    '.......|LPPPPPL|P.....P|P.....P|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|>PPPPP<|>.....<|>.....<|>.....<|>.....<|>.....<|>PPPPP<',
    '.......|.>PPP<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>PPP<.',
    '.......|..>P<..|..>.<..|..>.<..|..>.<..|..>.<..|..>.<..|..>P<..',
    '.......|..._...|..._...|..._...|..._...|..._...|..._...|..._...',
  ],
  jigsaws: [entranceJ(3, 1, 0), villager(3, 3, 'oak_planks')],
});

const mason = house('plains_masons_house_1', {
  key: { S: 'stone_bricks', m: 'stonecutter[facing=north]', k: 'chest[facing=north]', t: 'wall_torch[facing=north]' },
  layers: [
    '...p...|SSSSSSS|SCCCCCS|SCCCCCS|SCCCCCS|SCCCCCS|SSSSSSS',
    '.......|LSSDSSL|S.....S|G.....G|S.....S|Sm.k..S|LSSSSSL',
    '.......|LSGUGSL|S.....S|G.....G|S.....S|S...t.S|LSSGSSL',
    '.......|LPPPPPL|P.....P|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|vvvvvvv|P.....P|P.....P|P.....P|P.....P|^^^^^^^',
    '.......|.......|vvvvvvv|P.....P|P.....P|^^^^^^^|.......',
    '.......|.......|.......|vvvvvvv|^^^^^^^|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), villager(3, 3, 'cobblestone')],
  loot: [loot(3, 1, 5, 'mason')],
});

const weaponsmith = house('plains_weaponsmith_1', {
  key: { r: 'grindstone[face=floor,facing=north]', k: 'chest[facing=north]', l: 'lava', I: 'iron_bars', t: 'wall_torch[facing=north]' },
  layers: [
    '....p....|CCCCCCCCC|CCCCCCCCC|CCCCCCCCC|CCCCCCCCC|CCCCCCCCC|CCCCCCCCC|CCCCCCCCC',
    '.........|LPPPDPPPL|P.......P|G.......G|P.......P|P...r.I.P|Pk...ClCP|LCCCCCCCL',
    '.........|LPGPUPGPL|P.......P|G.......G|P.......P|P.....I.P|P.t..CCCP|LCCCCCCCL',
    '.........|LPPPPPPPL|P.......P|P.......P|P.......P|P.......P|P.....C.P|LCCCCCCCL',
    '.........|vvvvvvvvv|P.......P|P.......P|P.......P|P.......P|P.....C.P|^^^^^^^^^',
    '.........|.........|vvvvvvvvv|P.......P|P.......P|P.......P|^^^^^^C^^|.........',
    '.........|.........|.........|vvvvvvvvv|P.......P|^^^^^^^^^|......C..|.........',
    '.........|.........|.........|.........|_________|.........|......C..|.........',
  ],
  jigsaws: [entranceJ(4, 1, 0), villager(4, 3, 'cobblestone')],
  loot: [loot(1, 1, 6, 'weaponsmith')],
});

const temple3 = house('plains_temple_3', {
  key: { s: 'brewing_stand', k: 'chest[facing=north]', t: 'wall_torch[facing=north]' },
  layers: [
    '...p...|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC',
    '.......|LCCDCCL|C.....C|C.....C|G.....G|C.....C|C.....C|G.....G|C.....C|C.s.k.C|LCCCCCL',
    '.......|LCCUCCL|C.....C|C.....C|G.....G|C.....C|C.....C|G.....G|C.....C|C..t..C|LCCCCCL',
    '.......|LCCGCCL|C.....C|C.....C|G.....G|C.....C|C.....C|G.....G|C.....C|C.....C|LCCGCCL',
    '.......|LCCCCCL|C.....C|C.....C|C.....C|C.....C|C.....C|C.....C|C.....C|C.....C|LCCCCCL',
    '.......|>CCCCC<|>.....<|>.....<|>.....<|>.....<|>.....<|>.....<|>.....<|>.....<|>CCCCC<',
    '.......|.>CCC<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>CCC<.',
    '.......|..>C<..|..>.<..|..>.<..|..>.<..|..>.<..|..>.<..|..>.<..|..>.<..|..>.<..|..>C<..',
    '.......|..._...|..._...|..._...|..._...|..._...|..._...|..._...|..._...|..._...|..._...',
  ],
  jigsaws: [entranceJ(3, 1, 0), villager(3, 5, 'cobblestone')],
  loot: [loot(4, 1, 9, 'temple')],
});

const temple4 = house('plains_temple_4', {
  key: { s: 'brewing_stand', k: 'chest[facing=north]', w: 'water_cauldron[level=2]', t: 'wall_torch[facing=north]' },
  layers: [
    '...p...|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC|CCCCCCC',
    '.......|LCCDCCL|C.....C|G.....G|C.....C|G.....G|C.....C|Cw.s.kC|LCCCCCL',
    '.......|LPPUPPL|P.....P|G.....G|P.....P|G.....G|P.....P|P..t..P|LPPPPPL',
    '.......|LPGPGPL|P.....P|G.....G|P.....P|G.....G|P.....P|P.....P|LPPGPPL',
    '.......|LPPPPPL|P.....P|P.....P|P.....P|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|LPPPPPL|P.....P|P.....P|P.....P|P.....P|P.....P|P.....P|LPPPPPL',
    '.......|>PPPPP<|>.....<|>.....<|>.....<|>.....<|>.....<|>.....<|>PPPPP<',
    '.......|.>PPP<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>...<.|.>PPP<.',
    '.......|..>P<..|..>.<..|..>.<..|..>.<..|..>.<..|..>.<..|..>.<..|..>P<..',
    '.......|..._...|..._...|..._...|..._...|..._...|..._...|..._...|..._...',
  ],
  jigsaws: [entranceJ(3, 1, 0), villager(3, 4, 'cobblestone')],
  loot: [loot(5, 1, 7, 'temple')],
});

// ---------------------------------------------------------------------------------------------------------------
// Stables, farms, pens and the rest

const stable1 = house('plains_stable_1', {
  key: { g: 'oak_fence_gate[facing=north]' },
  layers: [
    '.....p.....|...........|...........|...........|...........|CCCCCCCCCCC',
    '...........|LFFFFgFFFFL|F..F...F..F|F..F...F..F|FH.F.H.F.HF|LPPPPPPPPPL',
    '...........|L.........L|...........|...........|...........|LPPPPPPPPPL',
    '...........|L.........L|...........|...........|...........|LPPPPPPPPPL',
    '...........|vvvvvvvvvvv|P.........P|P.........P|P.........P|^^^^^^^^^^^',
    '...........|...........|vvvvvvvvvvv|P.........P|^^^^^^^^^^^|...........',
    '...........|...........|...........|___________|...........|...........',
  ],
  jigsaws: [entranceJ(5, 1, 0), animal(1, 3), animal(5, 3), animal(9, 3)],
});

const stable2 = house('plains_stable_2', {
  key: { g: 'oak_fence_gate[facing=north]', x: 'hay_block[axis=x]' },
  layers: [
    '...p...|.......|.......|.......|.......|.......|CCCCCCC',
    '.......|LFFgFFL|F..F..F|F..F..F|F..F..F|FH.F.HF|LPPPPPL',
    '.......|L.....L|.......|.......|.......|.......|LPPPPPL',
    '.......|L.....L|.......|.......|.......|.......|LPPPPPL',
    '.......|LXXXXXL|Z.....Z|Z.....Z|Z.....Z|Z.....Z|LXXXXXL',
    '.......|>PPPPP<|>xxxxx<|>xxxxx<|>xxxxx<|>xxxxx<|>PPPPP<',
    '.......|.>PPP<.|.>...<.|.>...<.|.>...<.|.>...<.|.>PPP<.',
    '.......|..>_<..|..>_<..|..>_<..|..>_<..|..>_<..|..>_<..',
  ],
  jigsaws: [entranceJ(3, 1, 0), animal(1, 3), animal(5, 3)],
});

const FARM_PLAINS = farmProcessor([['carrots', 0.3], ['potatoes', 0.2], ['beetroots', 0.1]]);

const smallFarm = house('plains_small_farm_1', {
  key: { k: 'composter' },
  layers: [
    '.........|LXXXXXXXL|Zfff~fffZ|Zfff~fffZ|Zfff~fffZ|Zfff~fffZ|Zfff~fffZ|Zfff~fffZ|Zfff~fffZ|LXXXXXXXL',
    '.k.......|.........|.123.321.|.231.132.|.312.213.|.123.321.|.231.132.|.312.213.|.123.321.|.........',
  ],
  jigsaws: [entranceJ(4, 1, 0)],
});

const largeFarm = house('plains_large_farm_1', {
  key: { k: 'composter' },
  layers: [
    '.............|LXXXXXXXXXXXL|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|Zfff~fff~fffZ|LXXXXXXXXXXXL',
    '.k.........k.|.............|.321.123.231.|.213.312.123.|.132.231.312.|.321.123.231.|.213.312.123.|.132.231.312.|.321.123.231.|.213.312.123.|.132.231.312.|.............',
  ],
  jigsaws: [entranceJ(6, 1, 0)],
});

const pen1 = house('plains_animal_pen_1', {
  key: { g: 'oak_fence_gate[facing=north]' },
  layers: [
    '...p...|.......|.......|.......|.......|.......|.......',
    '.......|FFFgFFF|F.....F|F.....F|F.....F|FH....F|FFFFFFF',
  ],
  jigsaws: [entranceJ(3, 1, 0), animal(2, 3), animal(4, 4)],
});

const pen2 = house('plains_animal_pen_2', {
  key: { g: 'oak_fence_gate[facing=north]', x: 'hay_block[axis=x]' },
  layers: [
    '....p....|.........|.........|.........|.........|.......~.|.........|PPPPPPPPP',
    '.........|FFFFgFFFF|F.......F|F.......F|F.......F|F.......F|F.H.....F|LPPPPPPPL',
    '.........|.........|.........|.........|.........|.........|.........|L.......L',
    '.........|.........|.........|.........|.........|.........|vvvvvvvvv|LPPPPPPPL',
    '.........|.........|.........|.........|.........|.........|.........|^^^^^^^^^',
  ],
  jigsaws: [entranceJ(4, 1, 0), animal(2, 3), animal(5, 3), animal(3, 5)],
});

const pen3 = house('plains_animal_pen_3', {
  key: { g: 'oak_fence_gate[facing=north]' },
  layers: [
    '....p....|.........|.........|.........|.........|.........|.........|.~.......|.........',
    '.........|FFFFgFFFF|F.......F|F.......F|F.......F|F.......F|F.......F|F......HF|FFFFFFFFF',
  ],
  jigsaws: [entranceJ(4, 1, 0), animal(3, 4), animal(5, 5), animal(6, 3)],
});

const accessory = house('plains_accessory_1', {
  key: { x: 'hay_block[axis=x]', z: 'hay_block[axis=z]' },
  layers: [
    '..p..|.....|.....|.....|.....',
    '.....|F...F|.xHz.|.HzH.|F...F',
    '.....|T...T|..z..|.xH..|T...T',
  ],
  jigsaws: [entranceJ(2, 1, 0)],
});

const meeting4 = house('plains_meeting_point_4', {
  key: { b: 'bell[attachment=floor,facing=north]', s: 'cobblestone_stairs[facing=north]', n: 'cobblestone_stairs[facing=south]', e: 'cobblestone_stairs[facing=east]', w: 'cobblestone_stairs[facing=west]' },
  layers: [
    '...p...|.ppppp.|.pCCCp.|.pCCCp.|.pCCCp.|.ppppp.|.......',
    '.......|.......|..sss..|..wCe..|..nnn..|.......|.......',
    '.......|.......|.......|...b...|.......|.......|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), villager(1, 3, 'dirt_path')],
});

const meeting5 = house('plains_meeting_point_5', {
  key: { b: 'bell[attachment=floor,facing=north]' },
  layers: [
    '...p...|.ppppp.|.ppppp.|.ppHpp.|.ppppp.|.ppppp.|.......',
    '.......|.F...F.|.......|...H...|.......|.F...F.|.......',
    '.......|.T...T.|.......|...b...|.......|.T...T.|.......',
  ],
  jigsaws: [entranceJ(3, 1, 0), villager(2, 2, 'dirt_path')],
});

/** the plains houses pool, with vanilla's weights (the pool adds "empty" 10) */
export const PLAINS_HOUSES: [SingleElement, number][] = [
  [rigid(small1, MOSSIFY_10), 2], [rigid(small2, MOSSIFY_10), 2], [rigid(small3, MOSSIFY_10), 2], [rigid(small4, MOSSIFY_10), 2],
  [rigid(small5, MOSSIFY_10), 2], [rigid(small6), 1], [rigid(small7, MOSSIFY_10), 2], [rigid(small8, MOSSIFY_10), 3],
  [rigid(medium1, MOSSIFY_10), 2], [rigid(medium2, MOSSIFY_10), 2], [rigid(big1, MOSSIFY_10), 2],
  [rigid(butcher1, MOSSIFY_10), 2], [rigid(butcher2, MOSSIFY_10), 2], [rigid(toolsmith, MOSSIFY_10), 2], [rigid(fletcher, MOSSIFY_10), 2],
  [rigid(shepherd), 2], [rigid(armorer, MOSSIFY_10), 2], [rigid(fisher, MOSSIFY_10), 2], [rigid(tannery, MOSSIFY_10), 2],
  [rigid(cartographer, MOSSIFY_10), 1], [rigid(library1, MOSSIFY_10), 5], [rigid(library2, MOSSIFY_10), 1], [rigid(mason, MOSSIFY_10), 2],
  [rigid(weaponsmith, MOSSIFY_10), 2], [rigid(temple3, MOSSIFY_10), 2], [rigid(temple4, MOSSIFY_10), 2],
  [rigid(stable1, MOSSIFY_10), 2], [rigid(stable2), 2], [rigid(largeFarm, FARM_PLAINS), 4], [rigid(smallFarm, FARM_PLAINS), 4],
  [rigid(pen1), 1], [rigid(pen2), 1], [rigid(pen3), 5], [rigid(accessory), 1], [rigid(meeting4, MOSSIFY_70), 3], [rigid(meeting5), 1],
];
