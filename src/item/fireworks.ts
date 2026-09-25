// Firework stars and rockets as items (vanilla 1.21 FireworkExplosion and Fireworks components): what a star bursts
// into (its shape, its colours, the colours it fades to, a trail, a twinkle) and a rocket's flight duration and stars;
// their tooltips, the star's icon tint, the creative tab's rockets, and the special crafting recipes (vanilla
// FireworkStarRecipe, FireworkStarFadeRecipe and FireworkRocketRecipe; the plain paper-and-gunpowder one,
// firework_rocket_simple, is an ordinary recipe in inventory/recipes.ts). The rocket in flight is
// entity/fireworkRocket.ts, its burst render/fireworkParticles.ts.

import { ITEMS, ItemStack } from './item';
import { registerHoverText } from './hoverText';
import { registerCustomRecipe, type Grid } from '../inventory/customRecipes';
import { isSkullItem } from '../world/blocksSkulls';

/** vanilla FireworkExplosion.Shape */
export type FireworkShape = 'small_ball' | 'large_ball' | 'star' | 'creeper' | 'burst';

/** vanilla FireworkExplosion: colours as 0xRRGGBB */
export interface FireworkExplosion {
  shape: FireworkShape;
  colors: number[];
  fadeColors: number[];
  hasTrail: boolean;
  hasTwinkle: boolean;
}

/** vanilla Fireworks: flight_duration (the gunpowder that went in) and the stars' explosions */
export interface Fireworks {
  flightDuration: number;
  explosions: FireworkExplosion[];
}

/** vanilla DyeColor.getFireworkColor, in DyeColor order */
export const DYE_FIREWORK_COLORS: Readonly<Record<string, number>> = {
  white: 0xf0f0f0, orange: 0xeb8844, magenta: 0xc354cd, light_blue: 0x6689d3, yellow: 0xdecf2a, lime: 0x41cd34, pink: 0xd88198, gray: 0x434343,
  light_gray: 0xababab, cyan: 0x287697, purple: 0x7b2fbe, blue: 0x253192, brown: 0x51301a, green: 0x3b511a, red: 0xb3312c, black: 0x1e1b1b,
};

/** a new explosion (the fields always in this order: stacks compare their data as JSON) */
export function explosion(shape: FireworkShape, colors: readonly number[], fadeColors: readonly number[] = [], hasTrail = false, hasTwinkle = false): FireworkExplosion {
  return { shape, colors: [...colors], fadeColors: [...fadeColors], hasTrail, hasTwinkle };
}

export function cloneExplosion(e: FireworkExplosion): FireworkExplosion {
  return explosion(e.shape, e.colors, e.fadeColors, e.hasTrail, e.hasTwinkle);
}

export function cloneFireworks(f: Fireworks): Fireworks {
  return { flightDuration: f.flightDuration, explosions: f.explosions.map(cloneExplosion) };
}

/** vanilla FireworkExplosion.DEFAULT: a small ball of no colour (what a plain star is dyed from) */
export const DEFAULT_EXPLOSION: Readonly<FireworkExplosion> = explosion('small_ball', []);

/** vanilla Items.FIREWORK_ROCKET's own minecraft:fireworks: a flight of 1 and no stars */
export const DEFAULT_FIREWORKS: Readonly<Fireworks> = { flightDuration: 1, explosions: [] };

export function sameExplosion(a: FireworkExplosion, b: FireworkExplosion): boolean {
  return a.shape === b.shape && a.hasTrail === b.hasTrail && a.hasTwinkle === b.hasTwinkle && a.colors.join() === b.colors.join() && a.fadeColors.join() === b.fadeColors.join();
}

function sameFireworks(a: Fireworks, b: Fireworks): boolean {
  return a.flightDuration === b.flightDuration && a.explosions.length === b.explosions.length && a.explosions.every((e, i) => sameExplosion(e, b.explosions[i]));
}

/** a stack's minecraft:fireworks: its own, a rocket's default, or none (not a rocket) */
export function fireworksOf(s: ItemStack): Fireworks | null {
  return s.tag?.fireworks ?? (s.item.id === 'firework_rocket' ? DEFAULT_FIREWORKS : null);
}

/**
 * set a stack's minecraft:fireworks; on a rocket the item's default is no component at all (vanilla
 * PatchedDataComponentMap drops a patch equal to the prototype), so a crafted flight-1 rocket stacks with the rest
 */
export function setFireworks(s: ItemStack, f: Fireworks): void {
  if (s.item.id === 'firework_rocket' && sameFireworks(f, DEFAULT_FIREWORKS)) {
    if (s.tag) delete s.tag.fireworks;
    return;
  }
  (s.tag ??= {}).fireworks = cloneFireworks(f);
}

/** a star's minecraft:firework_explosion (a plain star has none) */
export function explosionOf(s: ItemStack): FireworkExplosion | null {
  return s.tag?.fireworkExplosion ?? null;
}

/** a rocket (vanilla FireworkRocketItem: the default one flies for 1) with this flight duration and these stars */
export function fireworkRocket(flightDuration: number, explosions: readonly FireworkExplosion[] = [], count = 1): ItemStack {
  const s = new ItemStack(ITEMS.get('firework_rocket')!, count);
  setFireworks(s, { flightDuration, explosions: explosions.map(cloneExplosion) });
  return s;
}

/** a firework star with this explosion */
export function fireworkStar(e: FireworkExplosion, count = 1): ItemStack {
  return new ItemStack(ITEMS.get('firework_star')!, count, 0, { fireworkExplosion: cloneExplosion(e) });
}

// ---------------------------------------------------------------------------
// tooltips and the icon (vanilla Fireworks / FireworkExplosion.addToTooltip, ItemColors)

const SHAPE_NAMES: Record<FireworkShape, string> = { small_ball: 'Small Ball', large_ball: 'Large Ball', star: 'Star-shaped', creeper: 'Creeper-shaped', burst: 'Burst' };

/** vanilla item.minecraft.firework_star.shape.* */
export function shapeName(shape: FireworkShape): string {
  return SHAPE_NAMES[shape];
}

const DYE_BY_COLOR = new Map(Object.entries(DYE_FIREWORK_COLORS).map(([dye, c]) => [c, dye]));

/** vanilla FireworkExplosion.getColorName: the dye whose firework colour it is (DyeColor.byFireworkColor), else "Custom" */
export function fireworkColorName(c: number): string {
  const dye = DYE_BY_COLOR.get(c & 0xffffff);
  return dye ? dye.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : 'Custom';
}

/** vanilla FireworkExplosion.addAdditionalTooltip: its colours, what they fade to, trail and twinkle, all grey */
export function explosionDetails(e: FireworkExplosion): string[] {
  const out: string[] = [];
  if (e.colors.length) out.push('§7' + e.colors.map(fireworkColorName).join(', '));
  if (e.fadeColors.length) out.push('§7Fade to ' + e.fadeColors.map(fireworkColorName).join(', '));
  if (e.hasTrail) out.push('§7Trail');
  if (e.hasTwinkle) out.push('§7Twinkle');
  return out;
}

/** vanilla FireworkExplosion.addToTooltip (a star's): its shape, then the rest */
export function starTooltip(e: FireworkExplosion): string[] {
  return ['§7' + shapeName(e.shape), ...explosionDetails(e)];
}

/**
 * vanilla Fireworks.addToTooltip (a rocket's): "Flight Duration: n" when it has one, then the stars, a run of equal
 * ones once as "2 x Small Ball", each followed by its details indented two spaces
 */
export function rocketTooltip(f: Fireworks): string[] {
  const out: string[] = [];
  if (f.flightDuration > 0) out.push(`§7Flight Duration: ${f.flightDuration}`);
  let run: FireworkExplosion | null = null;
  let n = 0;
  const flush = (): void => {
    if (!run) return;
    out.push(n === 1 ? `§7${shapeName(run.shape)}` : `§7${n} x ${shapeName(run.shape)}`);
    for (const l of explosionDetails(run)) out.push('  ' + l);
  };
  for (const e of f.explosions) {
    if (run && sameExplosion(run, e)) n++;
    else {
      flush();
      run = e;
      n = 1;
    }
  }
  flush();
  return out;
}

registerHoverText('firework_rocket', (s) => {
  const f = fireworksOf(s);
  return f ? rocketTooltip(f) : [];
});
registerHoverText('firework_star', (s) => {
  const e = explosionOf(s);
  return e ? starTooltip(e) : [];
});

/**
 * vanilla ItemColors for the firework star's layer1 (firework_star_overlay): its one colour, the average of several
 * (each channel's sum divided down), or grey (0x8A8A8A) with none
 */
export function starTint(s: ItemStack): number {
  const c = explosionOf(s)?.colors ?? [];
  if (!c.length) return 0x8a8a8a;
  if (c.length === 1) return c[0] & 0xffffff;
  let r = 0, g = 0, b = 0;
  for (const x of c) {
    r += (x >> 16) & 255;
    g += (x >> 8) & 255;
    b += x & 255;
  }
  const k = c.length;
  return (Math.floor(r / k) << 16) | (Math.floor(g / k) << 8) | Math.floor(b / k);
}

// ---------------------------------------------------------------------------
// the creative tab (vanilla CreativeModeTabs.generateFireworksAllDurations: FireworkRocketItem.CRAFTABLE_DURATIONS)

ITEMS.get('firework_rocket')!.creativeStacks = () => [1, 2, 3].map((n) => fireworkRocket(n));

// ---------------------------------------------------------------------------
// crafting (the grid is read row by row: colours and stars go in in that order)

const DYES = new Map(Object.entries(DYE_FIREWORK_COLORS).map(([dye, c]) => [`${dye}_dye`, c]));
/** vanilla FireworkStarRecipe.SHAPE_BY_ITEM: a fire charge, a feather, a gold nugget, or any mob head */
const SHAPE_BY_ITEM: Record<string, FireworkShape> = { fire_charge: 'large_ball', feather: 'burst', gold_nugget: 'star' };
const shapeFrom = (id: string): FireworkShape | undefined => SHAPE_BY_ITEM[id] ?? (isSkullItem(id) ? 'creeper' : undefined);

/**
 * vanilla FireworkStarRecipe: one gunpowder and at least one dye, with at most one shape item, one diamond (the
 * trail) and one glowstone dust (the twinkle), nothing else; a small ball without a shape item
 */
export function assembleStar(grid: Grid): ItemStack | null {
  let gunpowder = false, trail = false, twinkle = false;
  let shape: FireworkShape | null = null;
  const colors: number[] = [];
  for (const s of grid) {
    if (!s) continue;
    const id = s.item.id;
    const sh = shapeFrom(id);
    if (sh) {
      if (shape) return null;
      shape = sh;
    } else if (id === 'glowstone_dust') {
      if (twinkle) return null;
      twinkle = true;
    } else if (id === 'diamond') {
      if (trail) return null;
      trail = true;
    } else if (id === 'gunpowder') {
      if (gunpowder) return null;
      gunpowder = true;
    } else if (DYES.has(id)) colors.push(DYES.get(id)!);
    else return null;
  }
  if (!gunpowder || !colors.length) return null;
  return fireworkStar(explosion(shape ?? 'small_ball', colors, [], trail, twinkle));
}

/**
 * vanilla FireworkStarFadeRecipe: one star and dyes, the star's fade colours become the dyes' (a plain star is dyed
 * as a small ball of no colour)
 */
export function assembleStarFade(grid: Grid): ItemStack | null {
  let star: ItemStack | null = null;
  const fades: number[] = [];
  for (const s of grid) {
    if (!s) continue;
    if (DYES.has(s.item.id)) fades.push(DYES.get(s.item.id)!);
    else if (s.item.id === 'firework_star') {
      if (star) return null;
      star = s;
    } else return null;
  }
  if (!star || !fades.length) return null;
  const out = star.copyWithCount(1);
  const e = cloneExplosion(explosionOf(out) ?? DEFAULT_EXPLOSION);
  e.fadeColors = fades;
  (out.tag ??= {}).fireworkExplosion = e;
  return out;
}

/**
 * vanilla FireworkRocketRecipe: one paper, one to three gunpowder (the flight duration) and any stars (a plain one
 * adds nothing), nothing else: three rockets
 */
export function assembleRocket(grid: Grid): ItemStack | null {
  let paper = false;
  let gunpowder = 0;
  const explosions: FireworkExplosion[] = [];
  for (const s of grid) {
    if (!s) continue;
    const id = s.item.id;
    if (id === 'paper') {
      if (paper) return null;
      paper = true;
    } else if (id === 'gunpowder') {
      if (++gunpowder > 3) return null;
    } else if (id === 'firework_star') {
      const e = explosionOf(s);
      if (e) explosions.push(e);
    } else return null;
  }
  if (!paper || gunpowder < 1) return null;
  return fireworkRocket(gunpowder, explosions, 3);
}

registerCustomRecipe({ assemble: assembleStar });
registerCustomRecipe({ assemble: assembleStarFade });
registerCustomRecipe({ assemble: assembleRocket });
