// The copper blocks of 1.21 (vanilla Blocks.COPPER_BLOCK ... WAXED_OXIDIZED_COPPER_BULB, and LIGHTNING_ROD): the block
// of copper, cut copper with its stairs and slab, chiseled copper, the copper grate, the copper bulb, the copper door
// and trapdoor, each at the four ages of vanilla WeatheringCopper.WeatherState (unaffected, exposed, weathered,
// oxidized) and waxed at each. The unwaxed ones weather on random ticks (vanilla WeatheringCopper*.randomTick) up to
// oxidized; honeycomb waxes them and an axe scrapes them back an age or takes the wax off (all of that game/copper.ts).
// Every one is strength 3/6 and needs a stone pickaxe for its drop (vanilla needs_stone_tool; the doors and trapdoors
// any pickaxe), SoundType.COPPER but the grate's and the bulb's own.

import { registerBlock, getBlock, P, Layer, type Box, type BlockSettings, type StateView } from './block';
import { cubeAll, type ModelDef, type ModelChoice } from './models';
import { registerDoor, registerTrapdoor } from './blocksExtra';
import { registerSlab, registerStairs, type Cut } from './blocksTuff';
import { MAP_COLORS, MapColor } from './mapColors';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

/** vanilla WeatheringCopper.WeatherState, in order: the prefix a copper block's name takes at each age */
export const WEATHER_STAGES = ['', 'exposed_', 'weathered_', 'oxidized_'] as const;

/** the copper blocks that weather, by their names when unaffected (the full block's is copper_block) */
export const COPPER_KINDS = ['copper_block', 'chiseled_copper', 'copper_grate', 'cut_copper', 'cut_copper_stairs', 'cut_copper_slab', 'copper_door', 'copper_trapdoor', 'copper_bulb'] as const;

/** a copper block's name at an age (0-3), waxed or not (the full block is copper_block, then exposed_copper, ...) */
export function copperName(kind: string, age: number, waxed = false): string {
  const base = kind === 'copper_block' && age > 0 ? 'copper' : kind;
  return `${waxed ? 'waxed_' : ''}${WEATHER_STAGES[age]}${base}`;
}

/** the age (0-3) of every weathering copper block (vanilla ChangeOverTimeBlock.getAge), by name; the waxed have none */
export const WEATHER_AGE = new Map<string, number>();
/** vanilla WeatheringCopper.NEXT_BY_BLOCK and PREVIOUS_BY_BLOCK, by name */
export const WEATHER_NEXT = new Map<string, string>();
export const WEATHER_PREVIOUS = new Map<string, string>();
/** vanilla HoneycombItem.WAXABLES and WAX_OFF_BY_BLOCK, by name */
export const WAX_ON = new Map<string, string>();
export const WAX_OFF = new Map<string, string>();
for (const kind of COPPER_KINDS)
  for (let age = 0; age < 4; age++) {
    const n = copperName(kind, age);
    WEATHER_AGE.set(n, age);
    WAX_ON.set(n, copperName(kind, age, true));
    WAX_OFF.set(copperName(kind, age, true), n);
    if (age < 3) {
      WEATHER_NEXT.set(n, copperName(kind, age + 1));
      WEATHER_PREVIOUS.set(copperName(kind, age + 1), n);
    }
  }

/** vanilla Blocks: each age's map colour (the block of copper's orange, then exposed, weathered, oxidized) */
const AGE_MAP_COLOR = [MapColor.COLOR_ORANGE, MapColor.TERRACOTTA_LIGHT_GRAY, MapColor.WARPED_STEM, MapColor.WARPED_NYLIUM];

/** vanilla Blocks.*COPPER_BULB: the light a lit bulb gives at each age (litBlockEmission 15, 12, 8, 4) */
export const BULB_LIGHT = [15, 12, 8, 4];

/** vanilla models/block/lightning_rod.json: a 4-across knob on a 2-thick rod, standing up */
function rodModel(t: string): ModelDef {
  const side = { tex: t, uv: [0, 0, 4, 4] as [number, number, number, number] };
  const shaft = { tex: t, uv: [0, 4, 2, 16] as [number, number, number, number] };
  return {
    ao: false, particle: t,
    elements: [
      { from: [6, 12, 6], to: [10, 16, 10], faces: { north: side, east: side, south: side, west: side, up: { tex: t, uv: [4, 4, 0, 0], cull: 'up' }, down: side } },
      { from: [7, 0, 7], to: [9, 12, 9], faces: { north: shaft, east: shaft, south: shaft, west: shaft, down: { tex: t, uv: [0, 0, 2, 2], cull: 'down' } } },
    ],
  };
}

/** vanilla blockstates/lightning_rod.json: the model stands up; turned over for down, laid over for the sides */
const ROD_ROT: Record<string, [number, number]> = { up: [0, 0], down: [180, 0], north: [90, 0], south: [90, 180], west: [90, 270], east: [90, 90] };

/** vanilla RodBlock's shapes, by the rod's axis */
export function lightningRodBox(facing: string): Box {
  if (facing === 'up' || facing === 'down') return bx(6, 0, 6, 10, 16, 10);
  if (facing === 'north' || facing === 'south') return bx(6, 6, 0, 10, 10, 16);
  return bx(0, 6, 6, 16, 10, 10);
}

export function registerCopperBlocks(): void {
  // the block of copper is registered with the other metals (blocks.ts); it weathers like the rest
  Object.assign(getBlock('copper_block').s, { randomTicks: true, mapColor: MAP_COLORS[MapColor.COLOR_ORANGE] });
  for (const waxed of [false, true])
    for (let age = 0; age < 4; age++) {
      const st = WEATHER_STAGES[age];
      const name = (kind: string): string => copperName(kind, age, waxed);
      // (vanilla WeatheringCopper*.isRandomlyTicking: while there's an age to go to; the waxed never)
      const common: BlockSettings = { randomTicks: !waxed && age < 3, mapColor: MAP_COLORS[AGE_MAP_COLOR[age]] };
      const copper: Cut = { hardness: 3, resistance: 6, sound: 'copper', tier: 1 };
      const solid: BlockSettings = { ...copper, ...common, tool: 'pickaxe', requiresTool: true };
      // vanilla WeatheringCopperFullBlock (the full block and chiseled copper) and the cut copper; their stairs and slab
      // (WeatheringCopperStairBlock, WeatheringCopperSlabBlock)
      const full = age === 0 ? 'copper_block' : `${st}copper`;
      if (age > 0 || waxed) registerBlock(name('copper_block'), { ...solid, model: one(cubeAll(full)) });
      registerBlock(name('chiseled_copper'), { ...solid, model: one(cubeAll(`${st}chiseled_copper`)) });
      // vanilla WeatheringCopperGrateBlock (a WaterloggedTransparentBlock): SoundType.COPPER_GRATE, drawn cut out, seen
      // and lit through (no occlusion, skylight passes down while dry), its faces against its own kind hidden
      // (HalfTransparentBlock.skipRendering); no conductor of redstone, nothing spawns on it, nobody suffocates in it
      registerBlock(name('copper_grate'), {
        ...solid, props: [P.waterlogged], sound: 'copper_grate', layer: Layer.CUTOUT, opaque: false, cullSame: true, aoCaster: false,
        viewBlocking: false, faceOcclusion: 0, model: one(cubeAll(`${st}copper_grate`)),
      });
      const cut = `${st}cut_copper`;
      registerBlock(name('cut_copper'), { ...solid, model: one(cubeAll(cut)) });
      registerStairs(name('cut_copper_stairs'), cut, copper, common);
      registerSlab(name('cut_copper_slab'), cut, copper, common);
      // vanilla WeatheringCopperDoorBlock and WeatheringCopperTrapDoorBlock (BlockSetType.COPPER: opened by hand, by
      // redstone and by wind charges); strength 3/6, any pickaxe for the drop
      registerDoor(name('copper_door'), `${st}copper_door`, 3, 'copper', 'pickaxe', { ...common, resistance: 6 });
      registerTrapdoor(name('copper_trapdoor'), `${st}copper_trapdoor`, 3, 'copper', 'pickaxe', { ...common, resistance: 6 });
      // vanilla WeatheringCopperBulbBlock: lit and powered (toggled by a rising redstone edge, game/copper.ts),
      // SoundType.COPPER_BULB, no conductor of redstone; light as the age allows
      const bulb = (lit: boolean, powered: boolean) => cubeAll(`${st}copper_bulb${lit ? '_lit' : ''}${powered ? '_powered' : ''}`);
      const bulbs = [bulb(false, false), bulb(false, true), bulb(true, false), bulb(true, true)];
      const light = BULB_LIGHT[age];
      registerBlock(name('copper_bulb'), {
        ...solid, props: [P.lit, P.powered], sound: 'copper_bulb', light: (s) => (s.get('lit') ? light : 0),
        model: (s) => ({ model: bulbs[(s.get('lit') ? 2 : 0) + (s.get('powered') ? 1 : 0)] }),
      });
    }

  // vanilla LightningRodBlock: strength 3/6, a stone pickaxe for its drop, SoundType.COPPER, orange on maps; put
  // facing away from the face it's put on, powered for a moment when struck (game/copper.ts)
  const rod = rodModel('lightning_rod'), rodOn = rodModel('lightning_rod_on');
  registerBlock('lightning_rod', {
    props: [P.facing, P.powered, P.waterlogged], defaults: { facing: 'up' },
    hardness: 3, resistance: 6, sound: 'copper', tool: 'pickaxe', tier: 1, requiresTool: true, layer: Layer.CUTOUT, opaque: false,
    aoCaster: false, opacity: 0, faceOcclusion: 0, mapColor: MAP_COLORS[MapColor.COLOR_ORANGE],
    collision: (s: StateView) => [lightningRodBox(s.get<string>('facing'))],
    model: (s: StateView): ModelChoice => {
      const [x, y] = ROD_ROT[s.get<string>('facing')];
      return { model: s.get('powered') ? rodOn : rod, x, y };
    },
  });
}

function one(m: ModelDef): () => ModelChoice {
  return () => ({ model: m });
}
