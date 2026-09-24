// Worn armour textures (vanilla textures/models/armor/<material>_layer_1 and _layer_2, 64x32) in the humanoid armour
// model's box-UV layout (mobs.ts has the layout reminder): layer 1 holds the helmet (the head box at 0,0), the
// chestplate (the body box at 16,16 and the arm box at 40,16) and the boots (the lower part of the leg box at 0,16);
// layer 2 the leggings (the lower part of the body box and the leg box). The hat box (32,0) stays empty, as the
// bottoms of the helmet and the tops of the boots do: the wearer shows through. Leather is drawn in greys for its
// dye to tint (vanilla DyedItemColor), with an untinted _overlay for the bits that keep their colour. Original
// procedural pixel art; the palettes are the item icons' (itemlib/armor.ts).

import { TexImage, img, plot, valueNoise, Rand } from './tex';
import { ARMOR_MATS, LEATHER_ICON } from './itemlib/armor';

type FaceName = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back';
type Face = [number, number, number, number]; // x, y, w, h
type Box = Record<FaceName, Face>;

function boxFaces(u: number, v: number, w: number, h: number, d: number): Box {
  return {
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h],
    front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h],
    back: [u + d + w + d, v + d, w, h],
  };
}

const HEAD = boxFaces(0, 0, 8, 8, 8);
const BODY = boxFaces(16, 16, 8, 12, 4);
const ARM = boxFaces(40, 16, 4, 12, 4);
const LEG = boxFaces(0, 16, 4, 12, 4);

/** the pixels of a face a piece covers (x, y within the face, w × h) */
type Cover = (x: number, y: number, w: number, h: number) => boolean;
type Coverage = Partial<Record<FaceName, Cover>>;
const ALL: Cover = () => true;
const sides = (c: Cover): Coverage => ({ right: c, front: c, left: c, back: c });

/** a material's look: shades are indices into its ramp */
interface Look {
  /** dark → light */
  ramp: readonly number[];
  /** the plates' shade, and the darker one they're mottled with (`mottle`: how much of them) */
  base: number;
  dip: number;
  mottle: number;
  /** the lit top rim of a face, and its other rims */
  lit: number;
  rim: number;
  /** the line where a piece stops part way down a face (a helmet's brow, the tops of the boots) */
  edge: number;
  /** chain links: see-through pixels between the rims */
  mesh?: boolean;
  /** chance of a glinting pixel on a plate, in the lightest shade */
  sparkle?: number;
  seed: number;
}

const LOOKS: Record<string, Look> = {
  leather: { ramp: LEATHER_ICON.s, base: 4, dip: 3, mottle: 0.35, lit: 5, rim: 2, edge: 0, seed: 0x1ea7 },
  chainmail: { ramp: ARMOR_MATS.chainmail.s, base: 3, dip: 2, mottle: 0.3, lit: 4, rim: 2, edge: 1, mesh: true, seed: 0xc4a1 },
  iron: { ramp: ARMOR_MATS.iron.s, base: 4, dip: 3, mottle: 0.35, lit: 5, rim: 2, edge: 1, seed: 0x1204 },
  gold: { ramp: ARMOR_MATS.golden.s, base: 3, dip: 2, mottle: 0.3, lit: 4, rim: 2, edge: 0, sparkle: 0.03, seed: 0x901d },
  diamond: { ramp: ARMOR_MATS.diamond.s, base: 3, dip: 2, mottle: 0.3, lit: 4, rim: 2, edge: 0, sparkle: 0.05, seed: 0xd1a3 },
  netherite: { ramp: ARMOR_MATS.netherite.s, base: 2, dip: 1, mottle: 0.35, lit: 4, rim: 1, edge: 0, sparkle: 0.03, seed: 0x7e71 },
  // (the turtle shell icon's greens: itemlib/extras.ts)
  turtle: { ramp: [0x1e4a16, 0x2a6a1e, 0x3a8a28, 0x4ea434, 0x68c046, 0x8ed866], base: 3, dip: 2, mottle: 0.3, lit: 4, rim: 1, edge: 0, seed: 0x7a17 },
};

/**
 * Paint a piece over the faces it covers: plates mottled a shade darker here and there, bevelled at the face edges
 * (the top rim lit, the others shaded), with a line where the piece stops part way down a face; chainmail leaves
 * every other pixel of every other row open
 */
function paintPiece(t: TexImage, look: Look, box: Box, cov: Coverage, r: Rand): void {
  const R = look.ramp, top = R.length - 1;
  for (const name of Object.keys(cov) as FaceName[]) {
    const cover = cov[name]!;
    const [x0, y0, w, h] = box[name];
    const n = valueNoise(r, w, h, 2);
    const at = (x: number, y: number) => cover(x, y, w, h);
    // 0: past the face's edge, 1: covered, 2: the piece stops there
    const nb = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : at(x, y) ? 1 : 2);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!at(x, y)) continue;
        const up = nb(x, y - 1), dn = nb(x, y + 1), lf = nb(x - 1, y), rt = nb(x + 1, y);
        let k: number;
        if (up === 2 || dn === 2) k = look.edge;
        else if (up === 0) k = look.lit;
        else if (dn === 0 || lf !== 1 || rt !== 1) k = look.rim;
        else {
          if (look.mesh && y % 2 === 1 && (x + (y >> 1)) % 2 === 0) continue;
          k = n[y * w + x] < look.mottle ? look.dip : look.base;
          if (look.sparkle && r.chance(look.sparkle)) k = top;
        }
        plot(t, x0 + x, y0 + y, R[Math.max(0, Math.min(top, k))]);
      }
  }
}

/** re-shade one covered pixel of a face (details: seams, ridges, cuffs) */
function shadeAt(t: TexImage, look: Look, f: Face, x: number, y: number, k: number): void {
  const i = ((f[1] + y) * t.w + f[0] + x) * 4;
  if (t.data[i + 3] === 0) return;
  plot(t, f[0] + x, f[1] + y, look.ramp[Math.max(0, Math.min(look.ramp.length - 1, k))]);
}

// ---------------------------------------------------------------------------
// what each piece covers (per material family: plate, leather, chain)

type Family = 'plate' | 'leather' | 'chain';
const FAMILY: Record<string, Family> = { leather: 'leather', chainmail: 'chain', iron: 'plate', gold: 'plate', diamond: 'plate', netherite: 'plate' };

/** helmet: the crown and the brow, cheek guards (plate), a close cap (leather) or a coif down the sides (chain) */
function helmetCover(f: Family): Coverage {
  if (f === 'leather')
    return { top: ALL, front: (_x, y) => y <= 1, right: (_x, y) => y <= 4, left: (_x, y) => y <= 4, back: (_x, y) => y <= 5 };
  if (f === 'chain')
    return { top: ALL, front: (x, y, w) => y <= 1 || x === 0 || x === w - 1, right: ALL, left: ALL, back: ALL };
  return { top: ALL, front: (x, y, w) => y <= 1 || (y <= 6 && (x === 0 || x === w - 1)), right: (_x, y) => y <= 6, left: (_x, y) => y <= 6, back: (_x, y) => y <= 6 };
}

/** chestplate: the whole torso, the shoulders down the upper arm */
function chestCover(f: Family): { body: Coverage; arm: Coverage } {
  const sleeve = f === 'plate' ? 4 : 5;
  return { body: { top: ALL, ...sides(ALL) }, arm: { top: ALL, ...sides((_x, y) => y <= sleeve) } };
}

/** boots: the bottom rows of the leg and the sole */
function bootsCover(f: Family): Coverage {
  const from = f === 'leather' ? 8 : 7;
  return { bottom: ALL, ...sides((_x, y) => y >= from) };
}

/** leggings: the waist (the body's lower rows) and the legs down to the ankle */
function leggingsCover(): { body: Coverage; leg: Coverage } {
  return { body: sides((_x, y) => y >= 7), leg: { top: ALL, ...sides((_x, y) => y <= 9) } };
}

// ---------------------------------------------------------------------------
// the layers

function layer1(mat: string): TexImage {
  const look = LOOKS[mat], fam = FAMILY[mat];
  const t = img(64, 32);
  const r = new Rand(look.seed, 1);
  paintPiece(t, look, HEAD, helmetCover(fam), r);
  const c = chestCover(fam);
  paintPiece(t, look, BODY, c.body, r);
  paintPiece(t, look, ARM, c.arm, r);
  paintPiece(t, look, LEG, bootsCover(fam), r);
  if (fam === 'plate') {
    // a ridge along the crown, a groove down the breastplate, the boots' cuffs
    for (let y = 1; y < 7; y++) shadeAt(t, look, HEAD.top, 3, y, look.lit), shadeAt(t, look, HEAD.top, 4, y, look.dip);
    for (let y = 1; y < 11; y++) shadeAt(t, look, BODY.front, 3, y, look.rim), shadeAt(t, look, BODY.front, 4, y, look.lit);
    for (const f of [LEG.right, LEG.front, LEG.left, LEG.back]) for (let x = 0; x < 4; x++) shadeAt(t, look, f, x, 8, look.lit);
  } else if (fam === 'leather') {
    // stitched seams down the tunic's sides and round the cap's brim, the boots' turned-down tops
    for (let y = 1; y < 11; y += 2) shadeAt(t, look, BODY.right, 1, y, look.rim), shadeAt(t, look, BODY.left, 2, y, look.rim);
    for (let x = 1; x < 7; x += 2) shadeAt(t, look, HEAD.front, x, 1, look.lit);
    for (const f of [LEG.right, LEG.front, LEG.left, LEG.back]) for (let x = 0; x < 4; x++) shadeAt(t, look, f, x, 9, look.lit);
  } else {
    // the coif's rim round the face, the hauberk's hem
    for (let x = 1; x < 7; x++) shadeAt(t, look, HEAD.front, x, 0, look.lit);
    for (const f of [BODY.right, BODY.front, BODY.left, BODY.back]) for (let x = 0; x < f[2]; x++) shadeAt(t, look, f, x, 11, look.rim);
  }
  return t;
}

function layer2(mat: string): TexImage {
  const look = LOOKS[mat], fam = FAMILY[mat];
  const t = img(64, 32);
  const r = new Rand(look.seed, 2);
  const c = leggingsCover();
  paintPiece(t, look, BODY, c.body, r);
  paintPiece(t, look, LEG, c.leg, r);
  if (fam === 'plate') {
    // the belt round the waist, kneecaps
    for (const f of [BODY.right, BODY.front, BODY.left, BODY.back]) for (let x = 0; x < f[2]; x++) shadeAt(t, look, f, x, 9, look.rim);
    for (let x = 1; x < 3; x++) shadeAt(t, look, LEG.front, x, 4, look.lit), shadeAt(t, look, LEG.front, x, 5, look.rim);
  } else if (fam === 'leather') {
    // the outer seams
    for (let y = 1; y < 9; y += 2) shadeAt(t, look, LEG.right, 1, y, look.rim), shadeAt(t, look, LEG.left, 2, y, look.rim);
  } else {
    for (const f of [LEG.right, LEG.front, LEG.left, LEG.back]) for (let x = 0; x < 4; x++) shadeAt(t, look, f, x, 9, look.rim);
  }
  return t;
}

/** untinted leather: the tunic's lacing and the boots' soles (layer 1), the leggings' drawstring (layer 2) */
function leatherOverlay(layer: 1 | 2): TexImage {
  const t = img(64, 32);
  const [lace, knot, sole, soleDark] = [ARMOR_MATS.leather.s[1], ARMOR_MATS.leather.s[3], ARMOR_MATS.leather.s[0], ARMOR_MATS.leather.o];
  const at = (f: Face, x: number, y: number, c: number) => plot(t, f[0] + x, f[1] + y, c);
  if (layer === 1) {
    at(BODY.front, 3, 0, lace), at(BODY.front, 4, 0, lace), at(BODY.front, 3, 1, knot), at(BODY.front, 4, 2, lace), at(BODY.front, 3, 3, lace);
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) at(LEG.bottom, x, y, (x + y) % 3 ? sole : soleDark);
    for (const f of [LEG.right, LEG.front, LEG.left, LEG.back]) for (let x = 0; x < 4; x++) at(f, x, 11, sole);
  } else {
    at(BODY.front, 3, 7, knot), at(BODY.front, 4, 7, knot), at(BODY.front, 3, 8, lace), at(BODY.front, 5, 8, lace);
  }
  return t;
}

/**
 * the turtle shell (vanilla turtle_layer_1; a helmet is all there is of it): the shell over the crown in its scutes,
 * a row down the middle between rows either side, each lighter in the middle, its rim over the brow and the ears
 * cut into the little plates round a shell's edge
 */
function turtleLayer1(): TexImage {
  const look = LOOKS.turtle;
  const t = img(64, 32);
  const r = new Rand(look.seed, 1);
  const cover: Coverage = {
    top: ALL,
    front: (x, y, w) => y <= 1 || (y <= 3 && (x === 0 || x === w - 1)),
    right: (_x, y) => y <= 4,
    left: (_x, y) => y <= 4,
    back: (_x, y) => y <= 5,
  };
  paintPiece(t, look, HEAD, cover, r);
  const top = HEAD.top;
  for (let y = 0; y < 8; y++) shadeAt(t, look, top, 2, y, look.rim), shadeAt(t, look, top, 5, y, look.rim);
  for (const x of [3, 4]) shadeAt(t, look, top, x, 2, look.rim), shadeAt(t, look, top, x, 5, look.rim);
  for (const x of [0, 1, 6, 7]) shadeAt(t, look, top, x, 3, look.rim);
  for (const [x, y] of [[3, 0], [4, 0], [3, 3], [4, 4], [3, 7], [4, 6], [0, 1], [1, 1], [6, 1], [7, 1], [0, 5], [1, 6], [6, 6], [7, 5]])
    shadeAt(t, look, top, x, y, look.lit + 1);
  // the marginal plates
  for (const f of [HEAD.right, HEAD.left, HEAD.back]) for (let x = 1; x < 8; x += 2) for (let y = 2; y < 5; y++) shadeAt(t, look, f, x, y, look.rim);
  for (const x of [2, 5]) shadeAt(t, look, HEAD.front, x, 1, look.rim);
  return t;
}

const MATERIALS = ['leather', 'chainmail', 'iron', 'gold', 'diamond', 'netherite'];

/** vanilla ArmorMaterial layer textures by name: <material>_layer_1 / _layer_2 (leather also _overlay) */
export const ARMOR_LAYER_TEXTURES: Record<string, () => TexImage> = {};
for (const m of MATERIALS) {
  ARMOR_LAYER_TEXTURES[`${m}_layer_1`] = () => layer1(m);
  ARMOR_LAYER_TEXTURES[`${m}_layer_2`] = () => layer2(m);
}
ARMOR_LAYER_TEXTURES.turtle_layer_1 = turtleLayer1;
ARMOR_LAYER_TEXTURES.leather_layer_1_overlay = () => leatherOverlay(1);
ARMOR_LAYER_TEXTURES.leather_layer_2_overlay = () => leatherOverlay(2);

const cache = new Map<string, TexImage>();
/** a layer texture, generated once however many renderers ask (the world's and the inventory's) */
export function armorLayerTexture(name: string): TexImage | null {
  let t = cache.get(name);
  if (t) return t;
  const gen = ARMOR_LAYER_TEXTURES[name];
  if (!gen) return null;
  t = gen();
  cache.set(name, t);
  return t;
}

