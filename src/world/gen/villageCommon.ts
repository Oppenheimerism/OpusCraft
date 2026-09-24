// What every kind of village shares: the pieces that bring its people and animals (vanilla VillagePools'
// village/common/* and each kind's villagers pool), the rule processors its pieces go through, and the features its
// decoration pools grow.

import { Rand } from '../../core/rng';
import { S, blockOf, FLAGS, F_AIR, F_REPLACEABLE, F_WATER } from '../block';
import type { GenContext } from './context';
import { placeTree, type TreeKind } from './trees';
import { sturdyUp } from './structure';
import { template, pool, processor, SingleElement, FeatureElement, EMPTY, type EntitySpec, type JigsawSpec, type Processor, type Template, type FeatureFn } from './jigsaw';

// ---------------------------------------------------------------------------------------------------------------
// Connectors, as village templates use them

type Facing = JigsawSpec['facing'];
/** a street end: streets join street ends */
export const streetJ = (x: number, y: number, z: number, facing: Facing, streets: string): JigsawSpec => ({ at: [x, y, z], facing, name: 'street', target: 'street', pool: streets });
/** a plot beside a street, for a house to stand at with its entrance */
export const houseJ = (x: number, y: number, z: number, facing: Facing, houses: string): JigsawSpec => ({ at: [x, y, z], facing, target: 'building_entrance', pool: houses });
/** a house's own connector, in front of its door */
export const entranceJ = (x: number, y: number, z: number, facing: Facing = 'north'): JigsawSpec => ({ at: [x, y, z], facing, name: 'building_entrance' });
/** a spot on a street's verge for a lamp, a tree, flowers or hay */
export const decorJ = (x: number, z: number, decor: string, final = 'air'): JigsawSpec => ({ at: [x, 0, z], facing: 'up', target: 'bottom', pool: decor, final });
/** where someone (or something) is to stand: a villager, a cat, an animal, the iron golem */
export const standJ = (x: number, y: number, z: number, final: string, from: string): JigsawSpec => ({ at: [x, y, z], facing: 'up', target: 'bottom', pool: from, final });

/** a bed's two halves as template keys (foot and head), lying the way it faces: the head is on that side */
export const bed = (color: string, facing: string, foot = 'b', head = 'h'): Record<string, string> => ({
  [foot]: `${color}_bed[facing=${facing},part=foot]`,
  [head]: `${color}_bed[facing=${facing},part=head]`,
});

export const rigid = (t: Template, ...p: Processor[]) => new SingleElement(t, 'rigid', p);
export const terrain = (t: Template, ...p: Processor[]) => new SingleElement(t, 'terrain_matching', p);

/** a kind of village's connectors and piece makers, tied to its pools and its blocks */
export interface VillageKit {
  V: string;
  /** a street end, joining the kind's streets */
  street(x: number, y: number, z: number, facing: Facing): JigsawSpec;
  /** a house plot beside a street */
  plot(x: number, y: number, z: number, facing: Facing): JigsawSpec;
  /** a verge spot for the kind's decorations */
  decor(x: number, z: number): JigsawSpec;
  /**
   * where one of the kind's villagers stands: the connector turns into the floor block given, or by default into the
   * template's own block there
   */
  villager(x: number, z: number, floor?: string, y?: number): JigsawSpec;
  golem(x: number, z: number, floor?: string, y?: number): JigsawSpec;
  cat(x: number, z: number, floor?: string, y?: number): JigsawSpec;
  animal(x: number, z: number, floor?: string, from?: string): JigsawSpec;
  loot(x: number, y: number, z: number, table: string): { at: [number, number, number]; table: string };
  /** a piece of the kind's houses pool */
  house(name: string, spec: PieceSpec): Template;
  /** any other piece of the kind (id under village/<kind>/) */
  piece(id: string, spec: PieceSpec): Template;
}

export interface PieceSpec {
  key?: Record<string, string>;
  layers: string[];
  jigsaws: JigsawSpec[];
  loot?: { at: [number, number, number]; table: string }[];
}

export function villageKit(kind: string, blocks: Record<string, string>): VillageKit {
  const V = `village/${kind}`;
  const make = (id: string, spec: PieceSpec) => template(id, { key: { ...blocks, ...spec.key }, layers: spec.layers, jigsaws: spec.jigsaws, loot: spec.loot });
  return {
    V,
    street: (x, y, z, facing) => streetJ(x, y, z, facing, `${V}/streets`),
    plot: (x, y, z, facing) => houseJ(x, y, z, facing, `${V}/houses`),
    decor: (x, z) => decorJ(x, z, `${V}/decor`),
    villager: (x, z, floor = 'air', y = 0) => standJ(x, y, z, floor, `${V}/villagers`),
    golem: (x, z, floor = 'air', y = 0) => standJ(x, y, z, floor, 'village/common/iron_golem'),
    cat: (x, z, floor = 'air', y = 0) => standJ(x, y, z, floor, 'village/common/cats'),
    animal: (x, z, floor = 'air', from = 'village/common/animals') => standJ(x, 0, z, floor, from),
    loot: (x, y, z, table) => ({ at: [x, y, z], table: `chests/village/village_${table}` }),
    house: (name, spec) => make(`${V}/houses/${name}`, spec),
    piece: (id, spec) => make(`${V}/${id}`, spec),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Streets: a path three wide down the middle of five, streets joining at the ends, house plots along the sides and
// decorations on the verges. They lie on the ground whatever its height (terrain matching)

type Side = 'w' | 'e';

/** a straight street running north-south, with house plots and verge decorations on the given sides */
export function straightStreet(v: string, id: string, len: number, plots: [number, Side][], decors: [number, Side][], path = 'dirt_path'): Template {
  const rows: string[] = [];
  for (let z = 0; z < len; z++) rows.push('.ppp.');
  return template(id, {
    key: { p: path },
    layers: [rows.join('|'), rows.map(() => '.....').join('|')],
    jigsaws: [
      streetJ(2, 1, 0, 'north', `${v}/streets`), streetJ(2, 1, len - 1, 'south', `${v}/streets`),
      ...plots.map(([z, s]) => houseJ(s === 'w' ? 0 : 4, 1, z, s === 'w' ? 'west' : 'east', `${v}/houses`)),
      ...decors.map(([z, s]) => decorJ(s === 'w' ? 0 : 4, z, `${v}/decor`)),
    ],
  });
}

/** a street piece drawn as a map: 'p' path, 'g' ground, '.' verge; connectors given */
export function streetMap(id: string, rows: string[], jigsaws: JigsawSpec[], path = 'dirt_path', ground = 'grass_block'): Template {
  return template(id, { key: { p: path, g: ground }, layers: [rows.join('|'), rows.map((r) => '.'.repeat(r.length)).join('|')], jigsaws });
}

// ---------------------------------------------------------------------------------------------------------------
// Pieces that are just an entity: one block, its connector (bottom, facing down) and whoever stands on it

export function entityPiece(id: string, entity: Omit<EntitySpec, 'at'>): Template {
  return template(id, {
    key: {},
    layers: ['.'],
    jigsaws: [{ at: [0, 0, 0], facing: 'down', top: 'south', name: 'bottom', target: 'bottom' }],
    entities: [{ at: [0.5, 0, 0.5], ...entity }],
  });
}

// vanilla VillagePools: the animals, sheep, cats, butcher's animals and iron golem pools
const cow = entityPiece('village/common/animals/cows_1', { id: 'cow', health: 10 });
const pig = entityPiece('village/common/animals/pigs_1', { id: 'pig', health: 10 });
// (vanilla Sheep.finalizeSpawn picks the fleece: 5% black, 5% gray, 5% light gray, 3% brown, rarely pink, else white)
const sheepColor = (r: Rand) => {
  const i = r.nextInt(100);
  return { color: i < 5 ? 15 : i < 10 ? 7 : i < 15 ? 8 : i < 18 ? 12 : r.nextInt(500) === 0 ? 6 : 0 };
};
const sheep1 = entityPiece('village/common/animals/sheep_1', { id: 'sheep', health: 8, init: sheepColor });
const sheep2 = entityPiece('village/common/animals/sheep_2', { id: 'sheep', health: 8, init: sheepColor });
// (horses aren't in the game yet: their records load as nothing until they are)
const horses = [1, 2, 3, 4, 5].map((i) => entityPiece(`village/common/animals/horses_${i}`, { id: 'horse', health: 20 }));
pool('village/common/animals', 'empty', [
  [rigid(cow), 7], [rigid(pig), 7], ...horses.map((h) => [rigid(h), 1] as [SingleElement, number]), [rigid(sheep1), 1], [rigid(sheep2), 1], [EMPTY, 5],
]);
pool('village/common/sheep', 'empty', [[rigid(sheep1), 1], [rigid(sheep2), 1]]);
pool('village/common/butcher_animals', 'empty', [[rigid(cow), 3], [rigid(pig), 3], [rigid(sheep1), 1], [rigid(sheep2), 1]]);
const CATS = ['black', 'british_shorthair', 'calico', 'persian', 'ragdoll', 'red', 'siamese', 'tabby', 'white', 'jellie'];
pool('village/common/cats', 'empty', [
  ...CATS.map((c) => [rigid(entityPiece(`village/common/animals/cat_${c}`, { id: 'cat', health: 10, data: { variant: c } })), 1] as [SingleElement, number]),
  [EMPTY, 3],
]);
pool('village/common/iron_golem', 'empty', [[rigid(entityPiece('village/common/iron_golem', { id: 'iron_golem', health: 100 })), 1]]);

/** vanilla <kind>VillagePools "village/<kind>/villagers": nitwit 1, baby 1, unemployed 10 */
export function villagersPool(kind: string, vtype: string): void {
  const v = (name: string, data: Record<string, number | string | boolean>) =>
    rigid(entityPiece(`village/${kind}/villagers/${name}`, { id: 'villager', health: 20, data: { vtype, assignProfession: true, ...data } }));
  pool(`village/${kind}/villagers`, 'empty', [[v('nitwit', { profession: 'nitwit' }), 1], [v('baby', { age: -24000 }), 1], [v('unemployed', {}), 10]]);
}

// ---------------------------------------------------------------------------------------------------------------
// Processors (vanilla ProcessorLists)

const mossify = (chance: number) => processor([{ input: 'cobblestone', chance, output: 'mossy_cobblestone' }]);
export const MOSSIFY_10 = mossify(0.1);
export const MOSSIFY_20 = mossify(0.2);
export const MOSSIFY_70 = mossify(0.7);

/** vanilla STREET_PLAINS (and the savanna and snowy/taiga ones with their own planks and grass share) */
export function streetProcessor(planks: string, grassChance: number, extra: { input: string; chance?: number; location?: string; output: string }[] = []): Processor {
  return processor([
    { input: 'dirt_path', location: 'water', output: planks },
    ...extra,
    { input: 'dirt_path', chance: grassChance, output: 'grass_block' },
    { input: 'grass_block', location: 'water', output: 'water' },
    { input: 'dirt', location: 'water', output: 'water' },
  ]);
}

/** vanilla FARM_PLAINS and friends: some wheat in a farm template grows as something else */
export function farmProcessor(rules: [string, number][]): Processor {
  return processor(rules.map(([output, chance]) => ({ input: 'wheat', chance, output })));
}

// ---------------------------------------------------------------------------------------------------------------
// Features of the decoration pools

const isAir = (st: number) => st === 0 || (st > 0 && (FLAGS[st] & F_AIR) !== 0);
const SOIL = new Set(['grass_block', 'dirt', 'coarse_dirt', 'podzol', 'rooted_dirt', 'mycelium', 'moss_block', 'mud', 'muddy_mangrove_roots', 'farmland']);
const onSoil = (ctx: GenContext, x: number, y: number, z: number) => {
  const b = ctx.get(x, y - 1, z);
  return b > 0 && SOIL.has(blockOf(b).name);
};

/** vanilla PlacedFeature <tree> with filteredByBlockSurvival(sapling): only on dirt */
export const treeFeature = (kind: TreeKind): FeatureFn => (ctx, x, y, z, r) => onSoil(ctx, x, y, z) && placeTree(ctx, kind, x, y, z, r);

/** vanilla RandomPatchFeature: tries around the spot, each placing where it can */
function patch(tries: number, xz: number, yr: number, place: (ctx: GenContext, x: number, y: number, z: number, r: Rand) => boolean): FeatureFn {
  return (ctx, x, y, z, r) => {
    let n = 0;
    for (let i = 0; i < tries; i++) {
      const px = x + r.nextInt(xz + 1) - r.nextInt(xz + 1), py = y + r.nextInt(yr + 1) - r.nextInt(yr + 1), pz = z + r.nextInt(xz + 1) - r.nextInt(xz + 1);
      if (!ctx.inChunk(px, pz)) continue;
      if (place(ctx, px, py, pz, r)) n++;
    }
    return n > 0;
  };
}

const PLAINS_TULIPS = ['orange_tulip', 'red_tulip', 'pink_tulip', 'white_tulip'];
const PLAINS_OTHERS = ['poppy', 'azure_bluet', 'oxeye_daisy', 'cornflower'];
/**
 * vanilla FLOWER_PLAIN: 64 tries of a flower picked by a noise (mostly dandelions, then tulips or the rest); the noise
 * is approximated by one pick per patch
 */
export const flowerPlain: FeatureFn = (ctx, x, y, z, r) => {
  const set = r.nextInt(3);
  return patch(64, 6, 2, (c, px, py, pz, rr) => {
    if (!isAir(c.getOrAir(px, py, pz)) || !onSoil(c, px, py, pz)) return false;
    const name = set === 0 || rr.nextInt(3) === 0 ? 'dandelion' : set === 1 ? PLAINS_TULIPS[rr.nextInt(4)] : PLAINS_OTHERS[rr.nextInt(4)];
    c.set(px, py, pz, S(name));
    return true;
  })(ctx, x, y, z, r);
};

/** vanilla BlockPileFeature: a low heap about the spot (on a path only half the time) */
export function pile(pick: (r: Rand) => number): FeatureFn {
  return (ctx, x, y, z, r) => {
    const i = 2 + r.nextInt(2), j = 2 + r.nextInt(2);
    for (let px = x - i; px <= x + i; px++)
      for (let py = y; py <= y + 1; py++)
        for (let pz = z - j; pz <= z + j; pz++) {
          const k = x - px, l = z - pz;
          const inside = k * k + l * l <= r.nextFloat() * 10 - r.nextFloat() * 6;
          if (!inside && !(r.nextFloat() < 0.031)) continue;
          if (!ctx.inChunk(px, pz) || !isAir(ctx.getOrAir(px, py, pz))) continue;
          const below = ctx.getOrAir(px, py - 1, pz);
          if (blockOf(below).name === 'dirt_path' ? !r.nextBool() : !sturdyUp(below)) continue;
          ctx.set(px, py, pz, pick(r));
        }
    return true;
  };
}

const HAY = ['x', 'y', 'z'];
export const pileHay = pile((r) => blockOf(S('hay_block')).state({ axis: HAY[r.nextInt(3)] }));
export const pileMelon = pile(() => S('melon'));
export const pileSnow = pile(() => S('snow'));
export const pileIce = pile((r) => S(r.nextInt(6) === 0 ? 'blue_ice' : 'packed_ice'));
export const pilePumpkin = pile((r) => (r.nextInt(20) === 0 ? blockOf(S('jack_o_lantern')).state({ facing: ['north', 'east', 'south', 'west'][r.nextInt(4)] }) : S('pumpkin')));

/** vanilla PATCH_CACTUS: columns of one to three cacti where they'd survive */
export const patchCactus: FeatureFn = patch(10, 7, 3, (ctx, x, y, z, r) => {
  if (!isAir(ctx.getOrAir(x, y, z))) return false;
  const below = blockOf(ctx.getOrAir(x, y - 1, z)).name;
  if (below !== 'sand' && below !== 'red_sand' && below !== 'cactus') return false;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = ctx.get(x + dx, y, z + dz);
    if (n !== 0 && n !== -1 && !isAir(n)) return false;
  }
  // (vanilla BiasedToBottomInt(1, 3))
  const h = 1 + r.nextInt(r.nextInt(3) + 1);
  for (let i = 0; i < h && isAir(ctx.getOrAir(x, y + i, z)); i++) ctx.set(x, y + i, z, S('cactus'));
  return true;
});

const plantOnGrass = (name: (r: Rand) => string) => (ctx: GenContext, x: number, y: number, z: number, r: Rand) => {
  const here = ctx.getOrAir(x, y, z);
  if (!(isAir(here) || (FLAGS[here] & F_REPLACEABLE && !(FLAGS[here] & F_WATER)))) return false;
  if (!onSoil(ctx, x, y, z)) return false;
  ctx.set(x, y, z, S(name(r)));
  return true;
};
/** vanilla PATCH_TAIGA_GRASS: grass with ferns */
export const patchTaigaGrass: FeatureFn = patch(32, 7, 3, plantOnGrass((r) => (r.nextInt(5) === 0 ? 'short_grass' : 'fern')));
/** vanilla PATCH_BERRY_BUSH: ripe sweet berry bushes on grass */
export const patchBerryBush: FeatureFn = patch(96, 7, 3, (ctx, x, y, z) => {
  if (!isAir(ctx.getOrAir(x, y, z)) || blockOf(ctx.getOrAir(x, y - 1, z)).name !== 'grass_block') return false;
  ctx.set(x, y, z, blockOf(S('sweet_berry_bush')).state({ age: 3 }));
  return true;
});

export function feature(fn: FeatureFn, name: string): FeatureElement {
  return new FeatureElement(fn, name);
}
