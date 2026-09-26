// Procedural block textures (16x16, vanilla "Jappa"-style pixel art).
// Every texture is generated in code at startup; helpers live in ./blocklib.

import {
  TexImage, TexDef, img, setPx, getPx, valueNoise, whiteNoise, combine, paletteMap, mixC, packRGB, rgbOf, getA,
  cloneImg, flipH, Rand, tintC,
} from './tex';
import { hashString } from '../core/rng';
import { DYE } from './dyes';
import * as TR from './blocklib/terrain';
import * as WD from './blocklib/wood';
import * as FO from './blocklib/foliage';
import * as BL from './blocklib/building';
import * as FL from './blocklib/fluids';
import * as PL from './blocklib/plants';
import * as UT from './blocklib/utility';
import * as DR from './blocklib/doors';
import * as DC from './blocklib/decor';
import * as CR from './blocklib/crops';
import * as RL from './blocklib/rails';
import * as CV from './blocklib/caves';
import * as LU from './blocklib/lush';
import * as NE from './blocklib/nether';
import * as NF from './blocklib/netherFlora';
import * as IB from './blocklib/iconblocks';
import * as EN from './blocklib/end';
import { FIRE_TEXTURES } from './mobs';
import { registerEnchantingTextures } from './blocklib/enchanting';
import { registerVillageTextures } from './blocklib/village';
import { registerOuterEndTextures } from './blocklib/outerEnd';
// (Stage 5: ocean)
import { registerOceanTextures } from './blocklib/ocean';
// (temples)
import { registerRedstoneTextures } from './blocklib/redstone';
import { registerArchaeologyTextures } from './blocklib/archaeology';
// (fossils)
import { registerFossilTextures } from './blocklib/fossils';
// (M9: frogs)
import { registerFrogTextures } from './blocklib/frog';
// (the deep dark)
import { registerSculkTextures } from './blocklib/sculk';
// (trial chambers)
import { registerTuffTextures } from './blocklib/tuff';
import { registerCopperTextures } from './blocklib/copper';
import { registerTrialChamberTextures } from './blocklib/trialChambers';
// (bastions)
import { registerBastionTextures } from './blocklib/bastion';

type Gen = () => TexDef;
export const BLOCK_TEXTURES: Record<string, Gen> = {};
const T = BLOCK_TEXTURES;

function R(name: string, salt = 0): Rand {
  return new Rand(hashString(name) ^ salt, 77);
}

/** Generic mottled material (kept for compatibility with other modules). */
export function mottled(seed: string, palette: number[], weights?: number[], opts: { cell?: number; white?: number; streak?: boolean } = {}): TexImage {
  const r = R(seed);
  const t = img();
  const cell = opts.cell ?? 4;
  const layers = opts.streak
    ? [valueNoise(r, 16, 16, 8, 2), valueNoise(r, 16, 16, 4, 1), whiteNoise(r, 16, 16)]
    : [valueNoise(r, 16, 16, cell * 2), valueNoise(r, 16, 16, cell), valueNoise(r, 16, 16, cell / 2), whiteNoise(r, 16, 16)];
  const wts = opts.streak ? [0.5, 0.3, opts.white ?? 0.35] : [0.35, 0.3, 0.2, opts.white ?? 0.3];
  paletteMap(t, combine(layers, wts), palette, weights);
  return t;
}

/** Memoize a generator (textures reused as bases are generated once). */
function memo(g: () => TexImage): () => TexImage {
  let v: TexImage | null = null;
  return () => cloneImg((v ??= g()));
}

// ---------------------------------------------------------------------------
// Stone family

const stoneBase = memo(() => TR.stone());
const deepslateBase = memo(() => TR.deepslate());
const COBBLE_PAL = [0x4a4a4a, 0x606060, 0x747474, 0x878787, 0x9a9a9a, 0xadadad, 0xc1c1c1];
const cobbleBase = memo(() => TR.stones('cobblestone', COBBLE_PAL, { sites: 9, minDist: 3.9, mortar: [0x505050, 0x5e5e5e], mortarW: 0.75, shadeTones: [3, 3, 4, 4, 5], rim: 0.6 }));

T['stone'] = stoneBase;
T['cobblestone'] = cobbleBase;
const MOSS_PAL = [0x35481f, 0x405626, 0x4b632c, 0x577134, 0x647f3c];
T['mossy_cobblestone'] = () => BL.mossOver(cobbleBase(), 'mossy_cobblestone', 0.36, { pal: MOSS_PAL });
T['granite'] = () => TR.granite();
T['polished_granite'] = () => TR.bevelled('polished_granite', TR.GRANITE_PAL, { hi: 0xc28f7c, lo: 0x74493b });
T['diorite'] = () => TR.diorite();
T['polished_diorite'] = () => TR.bevelled('polished_diorite', [0x9a9a9b, 0xaeaeaf, 0xbdbdbe, 0xc7c7c8, 0xd0d0d1, 0xdcdcdc, 0xe9e9e9], { hi: 0xeaeaea, lo: 0x959596 });
T['andesite'] = () => TR.andesite();
T['polished_andesite'] = () => TR.bevelled('polished_andesite', [0x6f7071, 0x7c7d7e, 0x858687, 0x8b8c8d, 0x929394, 0x9c9d9e, 0xa8a9aa], { hi: 0xa9aaab, lo: 0x626364 });
T['deepslate'] = deepslateBase;
T['deepslate_top'] = () => TR.deepslateTop();
T['cobbled_deepslate'] = () => TR.cobbledDeepslate();
T['polished_deepslate'] = () => TR.polishedDeepslate();
T['deepslate_bricks'] = () => TR.deepslateBricks();
T['deepslate_tiles'] = () => TR.deepslateTiles();
T['tuff'] = () => TR.speckled('tuff', [0x4c4e46, 0x575951, 0x62645b, 0x6b6d65, 0x76786f, 0x82847a, 0x919389], {
  oct: [[4, 4, 0.35], [2, 2, 0.4]], white: 0.5, weights: [0, 1, 2.5, 4, 2.5, 1, 0], mode: 1, dark: 9, darkSize: [1, 3], light: 9, lightSize: [1, 3],
});
T['calcite'] = () => TR.speckled('calcite', [0xc2c3bf, 0xcdcecb, 0xd6d7d3, 0xdedfdb, 0xe5e6e2, 0xecedea, 0xf4f5f2], {
  oct: [[8, 8, 0.4], [4, 4, 0.35], [2, 2, 0.25]], white: 0.3, weights: [0, 0.6, 2, 4, 3, 1, 0], mode: 1, dark: 5, darkSize: [2, 4], light: 3,
});
T['dripstone_block'] = () => TR.rockTex('dripstone_block', [0x5b463b, 0x695246, 0x775d50, 0x846858, 0x907363, 0x9d7f6f, 0xac8e7e], {
  octaves: [[16, 2, 0.4], [8, 2, 0.35], [4, 1, 0.25]], white: 0.15, emboss: 0.5, light: [0, -1],
});
T['bedrock'] = () => TR.bedrock();
T['obsidian'] = () => TR.obsidian();
T['crying_obsidian'] = () => TR.cryingObsidian();
T['clay'] = () => TR.clay();
T['moss_block'] = () => TR.speckled('moss_block', [0x3e5120, 0x485e25, 0x526a2a, 0x5b7530, 0x648035, 0x6f8c3d, 0x7c9a47], {
  oct: [[4, 4, 0.35], [2, 2, 0.4]], white: 0.55, weights: [0, 1, 2.5, 4, 2.5, 1, 0], dark: 8, darkSize: [1, 2], light: 8, lightSize: [1, 2],
});
T['magma'] = () => TR.stones('magma', [0x3a1206, 0x4d1708, 0x5f1f0a, 0x71280d, 0x823110, 0x943b14, 0xa84818], {
  sites: 9, minDist: 3.8, mortar: [0xe07a1c, 0xf7b33a], mortarW: 0.7, shadeTones: [2, 3, 4], rim: 0.5,
});

// Ores
for (const [ore, cols] of Object.entries(TR.ORE_COLS)) {
  const o = ore === 'coal' ? { count: 6 } : ore === 'diamond' || ore === 'emerald' ? { count: 4 } : {};
  T[`${ore}_ore`] = () => TR.ore(stoneBase(), ore, cols, o);
  // coal needs darker spots to read on deepslate
  const dcols = ore === 'coal' ? { dark: 0x080808, mid: 0x141414, light: 0x222224, hi: 0x33333a } : cols;
  T[`deepslate_${ore}_ore`] = () => TR.ore(deepslateBase(), ore + '_deep', dcols, o);
}
T['raw_iron_block'] = () => BL.rawOreBlock('raw_iron_block', [0x6f5641, 0x86694f, 0x9a7a5e, 0xa6876b, 0xb59478, 0xc6a68b, 0xd8ba9f]);
T['raw_copper_block'] = () => BL.rawOreBlock('raw_copper_block', [0x6a3b27, 0x804a31, 0x925639, 0x9c5f42, 0xae6c4c, 0xc27f5c, 0x5e9c83]);
T['raw_gold_block'] = () => BL.rawOreBlock('raw_gold_block', [0x9c6c10, 0xb88114, 0xcf9a1d, 0xdda92f, 0xe8bb3d, 0xf3cf55, 0xfde483]);
T['iron_block'] = () => BL.metalBlock('iron_block', [0x8d8d8d, 0xc9c9c9, 0xd7d7d7, 0xe2e2e2, 0xf6f6f6]);
T['gold_block'] = () => BL.metalBlock('gold_block', [0xb2800f, 0xeac12d, 0xf6d23c, 0xfbe062, 0xfff8b4]);
T['diamond_block'] = () => BL.gemBlock('diamond_block', [0x2a9c96, 0x58ddd5, 0x68e5dd, 0x86efe8, 0xd8fffb]);
T['emerald_block'] = () => BL.gemBlock('emerald_block', [0x0f7a33, 0x22b24f, 0x2dbf5b, 0x44d170, 0xa8f7c4]);
T['copper_block'] = () => BL.metalBlock('copper_block', [0x8f4631, 0xbb6749, 0xc57052, 0xd3825f, 0xeda98c], { lines: false });
T['coal_block'] = () => TR.speckled('coal_block', [0x060606, 0x0a0a0a, 0x0e0e0e, 0x121212, 0x181818, 0x202020, 0x2c2c2c], {
  oct: [[4, 4, 0.4], [2, 2, 0.4]], white: 0.4, weights: [0, 1, 2.5, 4, 2.5, 1, 0], mode: 1, dark: 6, light: 6, lightSize: [1, 2],
});
T['lapis_block'] = () => TR.speckled('lapis_block', [0x0f2865, 0x143274, 0x183a84, 0x1c4290, 0x234c9f, 0x2d59b0, 0x4270c4], {
  oct: [[4, 4, 0.4], [2, 2, 0.4]], white: 0.45, weights: [0, 1, 2.5, 4, 2.5, 1, 0], mode: 1, dark: 9, darkSize: [2, 4], light: 7, lightSize: [1, 3],
});
T['redstone_block'] = () => TR.speckled('redstone_block', [0x6f0a03, 0x890e04, 0x9f1306, 0xaf1809, 0xc0210e, 0xd23117, 0xe54a2c], {
  oct: [[2, 2, 0.5]], white: 0.6, weights: [0, 1, 2.5, 4, 2.5, 1, 0], dark: 12, darkSize: [1, 3], light: 8, lightSize: [1, 2],
});

// Bricks
T['stone_bricks'] = () => BL.stoneBricks();
T['mossy_stone_bricks'] = () => BL.mossOver(BL.stoneBricks(), 'mossy_stone_bricks', 0.3, { bottomBias: 0.5, pal: MOSS_PAL });
T['cracked_stone_bricks'] = () => BL.crackedStoneBricks();
T['chiseled_stone_bricks'] = () => BL.chiseledStoneBricks();
T['smooth_stone'] = () => BL.smoothStone();
T['bricks'] = () => BL.bricks();
T['nether_bricks'] = () => BL.bricks('nether_bricks', BL.NETHER_BRICKS, BL.NETHER_MORTAR);
T['red_nether_bricks'] = () => BL.bricks('red_nether_bricks', BL.RED_NETHER_BRICKS, BL.RED_NETHER_MORTAR);
T['cracked_nether_bricks'] = () => BL.crackedNetherBricks();
T['chiseled_nether_bricks'] = () => BL.chiseledNetherBricks();

// Sandstone
T['sandstone_top'] = () => BL.sandstoneTop('sandstone_top', BL.SANDSTONE);
T['sandstone_bottom'] = () => BL.sandstoneBottom('sandstone_bottom', BL.SANDSTONE);
T['sandstone'] = () => BL.sandstoneSide('sandstone', BL.SANDSTONE);
T['cut_sandstone'] = () => BL.cutSandstone('cut_sandstone', BL.SANDSTONE);
T['chiseled_sandstone'] = () => BL.chiseledSandstone('chiseled_sandstone', BL.SANDSTONE);
T['red_sandstone_top'] = () => BL.sandstoneTop('red_sandstone_top', BL.RED_SANDSTONE);
T['red_sandstone_bottom'] = () => BL.sandstoneBottom('red_sandstone_bottom', BL.RED_SANDSTONE);
T['red_sandstone'] = () => BL.sandstoneSide('red_sandstone', BL.RED_SANDSTONE);

// ---------------------------------------------------------------------------
// Soil family

const dirtBase = memo(() => TR.dirt());
const grassTopBase = memo(() => TR.grassTop());
const GRASS_SIDE_TINT = 0x91bd59; // pre-tinted fringe baked into grass_block_side

/** Soil side: dirt with a top fringe copied from `top` (rows per column from FRINGE). */
function soilSide(top: TexImage, depths = TR.FRINGE, shade = 0.86): TexImage {
  const t = dirtBase();
  const f = TR.fringe(top, depths, shade);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (getA(f, x, y)) setPx(t, x, y, getPx(f, x, y));
  return t;
}

T['dirt'] = dirtBase;
T['coarse_dirt'] = () => TR.coarseDirt();
T['rooted_dirt'] = () => TR.rootedDirt();
T['mud'] = () => TR.mud();
T['grass_block_top'] = grassTopBase;
T['grass_block_side_overlay'] = () => TR.grassSideOverlay();
T['grass_block_side'] = () => {
  const ov = TR.grassSideOverlay();
  const t = dirtBase();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (getA(ov, x, y)) setPx(t, x, y, tintC(getPx(ov, x, y), GRASS_SIDE_TINT));
  return t;
};
const snowBase = memo(() => TR.snow());
T['snow'] = snowBase;
T['powder_snow'] = () => TR.speckled('powder_snow', [0xcfdbe0, 0xdbe6ea, 0xe5eef1, 0xedf5f7, 0xf4fafb, 0xfafdfd, 0xffffff], {
  oct: [[2, 2, 0.5]], white: 0.6, weights: [0, 1, 2, 3.5, 3.5, 1.5, 0.3], dark: 10, darkSize: [1, 2], light: 6, lightSize: [1, 2],
});
T['grass_block_snow'] = () => soilSide(snowBase(), [4, 3, 3, 4, 4, 3, 3, 4, 5, 4, 3, 3, 4, 3, 4, 4], 0.9);
const PODZOL_PAL = [0x33210c, 0x412b10, 0x4f3515, 0x5c3f19, 0x6a4a20, 0x7a5629, 0x8d6534];
const podzolTop = memo(() => TR.speckled('podzol_top', PODZOL_PAL, {
  oct: [[4, 4, 0.3], [2, 2, 0.4]], white: 0.6, weights: [0, 1.2, 2.5, 3.5, 2.5, 1.2, 0], dark: 10, darkSize: [1, 3], light: 9, lightSize: [1, 2],
}));
T['podzol_top'] = podzolTop;
T['podzol_side'] = () => soilSide(podzolTop());
const MYC_PAL = [0x51444a, 0x5b4e54, 0x655860, 0x6e6166, 0x786b70, 0x857a7e, 0x9d9398];
const myceliumTop = memo(() => TR.speckled('mycelium_top', MYC_PAL, {
  oct: [[4, 4, 0.3], [2, 2, 0.4]], white: 0.6, weights: [0, 1.2, 2.5, 3.5, 2.5, 1.2, 0], dark: 8, darkSize: [1, 2], light: 12, lightSize: [1, 2],
}));
T['mycelium_top'] = myceliumTop;
T['mycelium_side'] = () => soilSide(myceliumTop(), [3, 3, 4, 3, 2, 3, 4, 3, 3, 3, 4, 5, 3, 3, 2, 3]);
T['sand'] = () => TR.sand();
T['red_sand'] = () => TR.sand('red_sand', TR.RED_SAND_PAL);
T['gravel'] = () => TR.gravel();
const PATH_PAL = [0x6e5a33, 0x7c663b, 0x887042, 0x947a49, 0x9f8551, 0xab915b, 0xb99e66];
const pathTop = memo(() => TR.speckled('dirt_path_top', PATH_PAL, {
  oct: [[4, 4, 0.35], [2, 2, 0.4]], white: 0.5, weights: [0, 1, 2.5, 4, 2.5, 1, 0], mode: 1, dark: 8, darkSize: [1, 3], light: 6, lightSize: [1, 2],
}));
T['dirt_path_top'] = pathTop;
T['dirt_path_side'] = () => {
  const t = dirtBase();
  const top = pathTop();
  // row 0 is above the 15px-tall block (never sampled), keep it opaque for clean mipmaps
  for (let x = 0; x < 16; x++) {
    const d = 2 + (x % 5 === 1 || x % 7 === 3 ? 1 : 0);
    for (let y = 0; y <= d; y++) setPx(t, x, y, getPx(top, x, y + 4));
  }
  return t;
};
function farmland(wet: boolean): TexImage {
  const pal = wet
    ? [0x2e190a, 0x3a200c, 0x46280f, 0x503013, 0x5b3817, 0x67411c, 0x754b22]
    : [0x5f3c20, 0x714a28, 0x81562f, 0x916137, 0xa06c3f, 0xb07948, 0xc28752];
  const t = TR.speckled(wet ? 'farmland_moist' : 'farmland', pal, {
    oct: [[4, 4, 0.35], [2, 2, 0.4]], white: 0.55, weights: [0, 1, 2.5, 4, 2.5, 1, 0], dark: 10, darkSize: [1, 2], light: 7, lightSize: [1, 2],
  });
  // tilled rows: wavy, broken troughs with a lit ridge above
  const r = R(wet ? 'fw' : 'fd');
  const wob = valueNoise(r, 16, 1, 4, 1);
  for (let y0 = 1; y0 < 16; y0 += 4)
    for (let x = 0; x < 16; x++) {
      const y = y0 + (wob[x] > 0.66 ? 1 : 0);
      if (r.chance(0.82)) setPx(t, x, y, pal[r.chance(0.3) ? 0 : 1]);
      if (r.chance(0.6)) setPx(t, x, y - 1, mixC(getPx(t, x, y - 1), pal[5], 0.5));
    }
  return t;
}
T['farmland'] = () => farmland(false);
T['farmland_moist'] = () => farmland(true);

// ---------------------------------------------------------------------------
// Wood & leaves

for (const [name, w] of Object.entries(WD.WOOD)) {
  T[`${name}_log`] = () => WD.barkFor(name, w);
  T[`${name}_log_top`] = () => WD.logTop(name + '_log_top', w);
  T[`${name}_planks`] = () => WD.planks(name + '_planks', w);
  T[`stripped_${name}_log`] = () => WD.strippedSide('stripped_' + name, w);
  T[`stripped_${name}_log_top`] = () => WD.logTop(name + '_log_top', w, true);
}
for (const [name, g] of Object.entries(FO.LEAVES)) T[`${name}_leaves`] = g;

// ---------------------------------------------------------------------------
// Fluids (animated)

T['water_still'] = () => FL.waterStill();
T['water_flow'] = () => FL.waterFlow();
T['lava_still'] = () => FL.lava(false);
T['lava_flow'] = () => FL.lava(true);

// ---------------------------------------------------------------------------
// Ice / glass

T['ice'] = () => FL.ice();
T['packed_ice'] = () => FL.packedIce('packed_ice', [0x7898d2, 0x83a3da, 0x8daee2, 0x97b7e8, 0xa1c0ed, 0xadcaf1, 0xc2dafa], 1);
T['blue_ice'] = () => FL.packedIce('blue_ice', [0x4f86d8, 0x5b91e0, 0x679ce7, 0x72a6ec, 0x7eb0f1, 0x8dbcf5, 0xa8d0fb], 1);
T['glass'] = () => FL.glass();

// ---------------------------------------------------------------------------
// Plants (sprites with transparency)

T['short_grass'] = () => PL.blades('short_grass', { count: 12, hmin: 4, hmax: 13, x0: 1.5, x1: 13.5, curl: 1.2 });
T['tall_grass_bottom'] = () => PL.blades('tall_grass_bottom', { count: 12, hmin: 15, hmax: 16, x0: 0.5, x1: 14.5, curl: 0.5 });
T['tall_grass_top'] = () => PL.blades('tall_grass_top', { count: 11, hmin: 3, hmax: 14, x0: 1, x1: 14, curl: 1 });
T['fern'] = () => PL.fern('fern', { fronds: 5, h: 12 });
T['large_fern_bottom'] = () => PL.fern('large_fern_bottom', { fronds: 5, h: 18, spread: 0.7 });
T['large_fern_top'] = () => PL.fern('large_fern_top', { fronds: 5, h: 14, spread: 1.1 });
T['dead_bush'] = () => PL.deadBush();
T['sugar_cane'] = () => PL.sugarCane();
for (const f of ['dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley']) T[f] = () => PL.flower(f);
T['red_tulip'] = () => PL.tulip(0xd8261f, 0xf2524a, 0x9a1612);
T['orange_tulip'] = () => PL.tulip(0xef7d12, 0xffa640, 0xb35708);
T['white_tulip'] = () => PL.tulip(0xe8ecec, 0xffffff, 0xb2babb);
T['pink_tulip'] = () => PL.tulip(0xeea0c4, 0xfcc6de, 0xb86e91);
T['brown_mushroom'] = () => PL.brownMushroom();
T['red_mushroom'] = () => PL.redMushroom();
const BUSH_LEAF = [0x2f5a1c, 0x3d6f24, 0x4b822c, 0x5b9535];
T['lilac_bottom'] = () => PL.bushBottom('lilac_bottom', BUSH_LEAF, [0xb07cc0, 0xd4a7e0], 6);
T['lilac_top'] = () => PL.bushTop('lilac_top', BUSH_LEAF, [0x8e5aa3, 0xc28fd4, 0xe7c4f0], { blobs: 6 });
T['rose_bush_bottom'] = () => PL.bushBottom('rose_bush_bottom', BUSH_LEAF, [0xc8201a, 0x951510], 5);
T['rose_bush_top'] = () => PL.bushTop('rose_bush_top', BUSH_LEAF, [0x8f1410, 0xc8201a, 0xf0473d], { blobs: 5 });
T['peony_bottom'] = () => PL.bushBottom('peony_bottom', BUSH_LEAF, [0xe4a8dc, 0xc987c0], 4);
T['peony_top'] = () => PL.bushTop('peony_top', BUSH_LEAF, [0xb77cb1, 0xdea4d8, 0xf6d0f1], { blobs: 5 });
T['sunflower_bottom'] = () => PL.sunflowerStalk(false);
T['sunflower_top'] = () => PL.sunflowerStalk(true);
T['sunflower_front'] = () => PL.sunflowerFront();
T['sunflower_back'] = () => PL.sunflowerBack();
const SAPLINGS: Record<string, PL.SaplingDef> = {
  oak: { leaf: [0x2c5f14, 0x3d7a1d, 0x4f9528, 0x68ad37], trunk: [0x4f3b20, 0x6b5132], shape: 'round' },
  spruce: { leaf: [0x1f3d20, 0x2a4f2b, 0x376237, 0x467545], trunk: [0x3a2814, 0x4f371d], shape: 'cone' },
  birch: { leaf: [0x49742c, 0x5b8a37, 0x6f9f44, 0x86b456], trunk: [0x9c9c94, 0xdcdcd4], shape: 'round' },
  jungle: { leaf: [0x255f10, 0x327a17, 0x3f921f, 0x55aa2c], trunk: [0x4a3a16, 0x60491e], shape: 'bushy' },
  acacia: { leaf: [0x4b6512, 0x5c7a18, 0x6e8f20, 0x84a52c], trunk: [0x4e4a41, 0x686257], shape: 'wide' },
  dark_oak: { leaf: [0x183d0a, 0x224f0f, 0x2d6115, 0x3b741d], trunk: [0x2c1f0e, 0x3d2b15], shape: 'bushy' },
  cherry: { leaf: [0xc26d8d, 0xd989a8, 0xe9a6c0, 0xf6c7d9], trunk: [0x2e161b, 0x46232a], shape: 'round' },
};
for (const [w, d] of Object.entries(SAPLINGS)) T[`${w}_sapling`] = () => PL.sapling(w + '_sapling', d);
T['cactus_side'] = () => PL.cactusSide();
T['cactus_top'] = () => PL.cactusTop();
T['cactus_bottom'] = () => PL.cactusBottom();
const pumpkinSide = memo(() => PL.pumpkinSide());
T['pumpkin_side'] = pumpkinSide;
T['pumpkin_top'] = () => PL.pumpkinTop();
T['carved_pumpkin'] = () => PL.carvedFace(pumpkinSide(), false);
T['jack_o_lantern'] = () => PL.carvedFace(pumpkinSide(), true);
T['melon_side'] = () => PL.melonSide();
T['melon_top'] = () => PL.melonTop();
T['lily_pad'] = () => PL.lilyPad();
T['vine'] = () => PL.vine();
T['seagrass'] = () => PL.seagrassTex('seagrass', [5, 13], 11);
T['tall_seagrass_bottom'] = () => PL.seagrassTex('tall_seagrass_bottom', [14, 16], 13);
T['tall_seagrass_top'] = () => PL.seagrassTex('tall_seagrass_top', [5, 14], 10);
T['kelp'] = () => PL.kelp(true);
T['kelp_plant'] = () => PL.kelp(false);
for (let s = 0; s < 4; s++) T[`sweet_berry_bush_stage${s}`] = () => PL.berryBush(s);
for (let s = 0; s < 8; s++) T[`wheat_stage${s}`] = () => PL.wheat(s);
T['torch'] = () => PL.torch();
T['lever'] = () => PL.lever();
T['soul_torch'] = () => PL.torch(true);
T['cobweb'] = () => PL.cobweb();
T['ladder'] = () => PL.ladder();

// ---------------------------------------------------------------------------
// Utility blocks

T['crafting_table_top'] = () => UT.craftingTableTop();
T['crafting_table_side'] = () => UT.craftingTableSide(false);
T['crafting_table_front'] = () => UT.craftingTableSide(true);
T['furnace_side'] = () => UT.furnaceSide();
T['furnace_top'] = () => UT.furnaceTop();
T['furnace_front'] = () => UT.furnaceFront(false);
T['furnace_front_on'] = () => UT.furnaceFront(true);
T['bookshelf'] = () => UT.bookshelf();
registerEnchantingTextures(T);
registerVillageTextures(T);
// (Stage 5: ocean)
registerOceanTextures(T);
// (temples)
registerRedstoneTextures(T);
registerArchaeologyTextures(T);
// (fossils)
registerFossilTextures(T);
// (M9: frogs) frogspawn, the ochre and pearlescent froglights
registerFrogTextures(T);
// (the deep dark)
registerSculkTextures(T);
T['glowstone'] = () => UT.glowstone();
T['sea_lantern'] = () => UT.seaLantern();
T['redstone_lamp'] = () => UT.redstoneLamp(false);
T['redstone_lamp_on'] = () => UT.redstoneLamp(true);
T['sponge'] = () => UT.sponge();
T['hay_block_side'] = () => UT.haySide();
T['hay_block_top'] = () => UT.hayTop();
T['tnt_side'] = () => UT.tntSide();
T['tnt_top'] = () => UT.tntTop(false);
T['tnt_bottom'] = () => UT.tntTop(true);
T['chest_top'] = () => UT.chestFace('top');
T['chest_side'] = () => UT.chestFace('side');
T['chest_front'] = () => UT.chestFace('front');
T['chest_bottom'] = () => UT.chestFace('bottom');
T['chest_lid_side'] = () => UT.chestFace('lid_side');
T['chest_lid_front'] = () => UT.chestFace('lid_front');
T['chest_latch'] = () => UT.chestLatch();
T['spawner'] = () => UT.spawner();
T['rail'] = () => RL.rail();
T['rail_corner'] = () => RL.railCorner();
T['glow_lichen'] = () => CV.glowLichen();
T['amethyst_block'] = () => CV.amethystBlock();
T['budding_amethyst'] = () => CV.buddingAmethyst();
for (const b of ['small_amethyst_bud', 'medium_amethyst_bud', 'large_amethyst_bud', 'amethyst_cluster']) T[b] = () => CV.amethystBud(b);
T['smooth_basalt'] = () => CV.smoothBasalt();
T['tinted_glass'] = () => CV.tintedGlass();
for (const th of ['tip_merge', 'tip', 'frustum', 'middle', 'base'])
  for (const d of ['up', 'down']) T[`pointed_dripstone_${d}_${th}`] = () => CV.pointedDripstone(th, d === 'up');
// lush caves
T['flowering_azalea_leaves'] = () => LU.floweringAzaleaLeaves();
T['azalea_top'] = () => LU.azaleaTop(false);
T['azalea_side'] = () => LU.azaleaSide(false);
T['flowering_azalea_top'] = () => LU.azaleaTop(true);
T['flowering_azalea_side'] = () => LU.azaleaSide(true);
T['azalea_plant'] = () => LU.azaleaPlant();
T['hanging_roots'] = () => LU.hangingRoots();
T['spore_blossom'] = () => LU.sporeBlossom();
T['spore_blossom_base'] = () => LU.sporeBlossomBase();
T['cave_vines'] = () => LU.caveVines(true, false);
T['cave_vines_lit'] = () => LU.caveVines(true, true);
T['cave_vines_plant'] = () => LU.caveVines(false, false);
T['cave_vines_plant_lit'] = () => LU.caveVines(false, true);
T['big_dripleaf_top'] = () => LU.bigDripleafTop();
T['big_dripleaf_side'] = () => LU.bigDripleafSide();
T['big_dripleaf_tip'] = () => LU.bigDripleafTip();
T['big_dripleaf_stem'] = () => LU.dripleafStem(false, false);
T['small_dripleaf_top'] = () => LU.smallDripleafTop();
T['small_dripleaf_side'] = () => LU.smallDripleafSide();
T['small_dripleaf_stem_top'] = () => LU.dripleafStem(true, true);
T['small_dripleaf_stem_bottom'] = () => LU.dripleafStem(true, false);

// ---------------------------------------------------------------------------
// Doors & trapdoors (window pixels are fully transparent; cutout layer)

for (const name of Object.keys(DR.DOORS)) {
  T[`${name}_door_top`] = () => DR.door(name, 'top');
  T[`${name}_door_bottom`] = () => DR.door(name, 'bottom');
  T[`${name}_trapdoor`] = () => DR.trapdoor(name);
}

// ---------------------------------------------------------------------------
// Beds (static model: mattress y=3..9, 3x3x3 legs). Side/end textures use rows 0-5 only.

for (const [c, col] of Object.entries(DYE)) {
  T[`bed_${c}_top_head`] = () => DC.bedTopHead(col.dye);
  T[`bed_${c}_top_foot`] = () => DC.bedTopFoot(col.dye);
  T[`bed_${c}_side_head`] = () => DC.bedBand(col.dye, 'side_head');
  T[`bed_${c}_side_foot`] = () => DC.bedBand(col.dye, 'side_foot');
  T[`bed_${c}_end_head`] = () => DC.bedBand(col.dye, 'end_head');
  T[`bed_${c}_end_foot`] = () => DC.bedBand(col.dye, 'end_foot');
}
T['bed_bottom'] = () => DC.bedBottom();
T['bed_leg'] = () => DC.bedLeg();

// ---------------------------------------------------------------------------
// Glass panes, stained glass, iron bars

T['glass_pane_top'] = () => DC.paneTop(0xf4fbfd, 0xd2e4ea);
for (const [c, col] of Object.entries(DC.STAINED)) {
  T[`${c}_stained_glass`] = () => DC.stainedGlass(c, col);
  T[`${c}_stained_glass_pane_top`] = () => DC.paneTop(mixC(col, 0xffffff, 0.4), mixC(col, 0xffffff, 0.15), 180);
}
T['iron_bars'] = () => DC.ironBars();

// ---------------------------------------------------------------------------
// Crops & stems

for (let s = 0; s < 4; s++) {
  T[`carrots_stage${s}`] = () => CR.carrots(s);
  T[`potatoes_stage${s}`] = () => CR.potatoes(s);
  T[`beetroots_stage${s}`] = () => CR.beetroots(s);
}
T['pumpkin_stem'] = () => CR.stem('pumpkin_stem');
T['melon_stem'] = () => CR.stem('melon_stem');
T['attached_pumpkin_stem'] = () => CR.attachedStem('attached_pumpkin_stem');
T['attached_melon_stem'] = () => CR.attachedStem('attached_melon_stem');

// ---------------------------------------------------------------------------
// Lantern, chain, campfire

T['lantern'] = () => DC.lantern();
T['soul_lantern'] = () => DC.lantern(true);
T['chain'] = () => DC.chain();
T['fire_0'] = FIRE_TEXTURES.fire_0;
T['fire_1'] = FIRE_TEXTURES.fire_1;
T['soul_fire_0'] = FIRE_TEXTURES.soul_fire_0;
T['soul_fire_1'] = FIRE_TEXTURES.soul_fire_1;
T['campfire_log'] = () => DC.campfireLog(false);
T['campfire_log_lit'] = () => DC.campfireLog(true);
T['campfire_fire'] = () => DC.campfireFire();

// ---------------------------------------------------------------------------
// Wool / terracotta / concrete

for (const [c, col] of Object.entries(DYE)) {
  T[`${c}_wool`] = () => BL.tintBase(BL.woolBase, col.wool, 222, 1);
  T[`${c}_terracotta`] = () => BL.tintBase(BL.terracottaBase, col.terracotta, 222, 0.8);
  T[`${c}_concrete`] = () => BL.tintBase(BL.concreteBase, col.concrete, 222, 0.6);
}
T['terracotta'] = () => BL.tintBase(BL.terracottaBase, 0x985e43, 222, 0.8);

// ---------------------------------------------------------------------------
// Blocks shown as advancement cube icons (gui/iconCubes.ts)

T['note_block'] = () => IB.noteBlock();
T['jukebox_top'] = () => IB.jukeboxTop();
T['jukebox_side'] = () => IB.jukeboxSide();
T['target_top'] = () => IB.targetTop();
T['target_side'] = () => IB.targetSide();
T['honey_block_top'] = () => IB.honeyBlockTop();
T['honey_block_side'] = () => IB.honeyBlockSide();
T['bee_nest_top'] = () => IB.beeNestTop();
T['bee_nest_side'] = () => IB.beeNestSide();
T['bee_nest_front'] = () => IB.beeNestFront();
T['chiseled_bookshelf_top'] = () => IB.chiseledBookshelfTop();
T['chiseled_bookshelf_side'] = () => IB.chiseledBookshelfSide();
T['chiseled_bookshelf_occupied'] = () => IB.chiseledBookshelfOccupied();
T['crafter_top'] = () => IB.crafterTop();
T['crafter_side'] = () => IB.crafterSide();
T['crafter_north'] = () => IB.crafterNorth();
T['chiseled_tuff'] = () => IB.chiseledTuff();
T['chiseled_tuff_top'] = () => IB.chiseledTuffTop();
T['oxidized_copper_bulb'] = () => IB.oxidizedCopperBulb();
T['verdant_froglight_top'] = () => IB.verdantFroglightTop();
T['verdant_froglight_side'] = () => IB.verdantFroglightSide();

// Nether terrain
const netherrackBase = memo(() => NE.netherrack());
T['netherrack'] = () => netherrackBase();
T['nether_quartz_ore'] = () => NE.netherQuartzOre(netherrackBase());
T['nether_gold_ore'] = () => NE.netherGoldOre(netherrackBase());
T['soul_sand'] = () => NE.soulSand();
T['soul_soil'] = () => NE.soulSoil();
T['basalt_side'] = () => NE.basaltSide();
T['basalt_top'] = () => NE.basaltTop();
T['blackstone'] = () => NE.blackstone();
T['blackstone_top'] = () => NE.blackstoneTop();
T['polished_blackstone'] = () => NE.polishedBlackstone();
T['chiseled_polished_blackstone'] = () => NE.chiseledPolishedBlackstone();
T['gilded_blackstone'] = () => NE.gildedBlackstone();
T['polished_blackstone_bricks'] = () => BL.bricks('polished_blackstone_bricks', BL.BLACKSTONE_BRICKS, BL.BLACKSTONE_MORTAR);
T['cracked_polished_blackstone_bricks'] = () => BL.crackedBricks('cracked_polished_blackstone_bricks', BL.BLACKSTONE_BRICKS, BL.BLACKSTONE_MORTAR, 0x050405, 0x4a414c);
{
  const crimsonTop = memo(() => NE.crimsonNyliumTop());
  const warpedTop = memo(() => NE.warpedNyliumTop());
  T['crimson_nylium'] = () => crimsonTop();
  T['warped_nylium'] = () => warpedTop();
  T['crimson_nylium_side'] = () => NE.nyliumSide(netherrackBase(), crimsonTop(), 'crimson_nylium', NE.CRIMSON_NYLIUM_PAL);
  T['warped_nylium_side'] = () => NE.nyliumSide(netherrackBase(), warpedTop(), 'warped_nylium', NE.WARPED_NYLIUM_PAL);
}
T['nether_wart_block'] = () => NE.netherWartBlock();
T['warped_wart_block'] = () => NE.warpedWartBlock();
T['ancient_debris_side'] = () => NE.ancientDebrisSide();
T['ancient_debris_top'] = () => NE.ancientDebrisTop();
T['nether_portal'] = () => NE.netherPortal();
for (const k of ['crimson', 'warped'] as const) {
  T[`${k}_stem`] = () => NF.stemSide(k);
  T[`${k}_stem_top`] = () => NF.stemTop(k);
  T[`stripped_${k}_stem`] = () => NF.strippedStemSide(k);
  T[`stripped_${k}_stem_top`] = () => NF.strippedStemTop(k);
  T[`${k}_planks`] = () => NF.netherPlanks(k);
  T[`${k}_fungus`] = () => NF.fungus(k);
  T[`${k}_roots`] = () => NF.roots(k);
}
T['nether_sprouts'] = () => NF.netherSprouts();
T['weeping_vines'] = () => NF.weepingVines();
T['weeping_vines_plant'] = () => NF.weepingVinesPlant();
T['twisting_vines'] = () => NF.twistingVines();
T['twisting_vines_plant'] = () => NF.twistingVinesPlant();
T['shroomlight'] = () => NF.shroomlight();
for (const i of [0, 1, 2] as const) T[`nether_wart_stage${i}`] = () => NF.netherWartStage(i);

// The End
const endStoneBase = memo(() => EN.endStone());
T['end_stone'] = () => endStoneBase();
T['end_stone_bricks'] = () => EN.endStoneBricks();
T['end_portal_frame_top'] = () => EN.endPortalFrameTop();
T['end_portal_frame_side'] = () => EN.endPortalFrameSide(endStoneBase());
T['end_portal_frame_eye'] = () => EN.endPortalFrameEye();
T['dragon_egg'] = () => EN.dragonEgg();
registerOuterEndTextures(T);
// (trial chambers) the tuff and copper families (the copper bulbs over the advancement icons' oxidized one, drawn the
// same way), the lightning rod, the heavy core
registerTuffTextures(T);
registerCopperTextures(T);
registerTrialChamberTextures(T);
// (bastions) polished basalt, the block of netherite, the lodestone
registerBastionTextures(T);

// Missing texture (vanilla's magenta/black checkerboard)
T['missing'] = () => {
  const t = img();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(t, x, y, (x < 8) !== (y < 8) ? 0xf800f8 : 0x000000);
  return t;
};

export { flipH, packRGB, rgbOf };
