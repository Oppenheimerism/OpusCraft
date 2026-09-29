// (remaining mobs: the bee) What a dispenser does to a full beehive or bee nest in front of it: shears take its
// honeycomb (vanilla ShearsDispenseItemBehavior.tryShearBeehive), a glass bottle its honey (the bottle's behaviour).
// game/beehive.ts sets these, game/redstone/dispenseItems.ts asks them. A module of its own that loads nothing, so it
// is there whichever of those two the game loads first (they reach each other through the spawner and the bee).

import type { Level } from '../level';

/** a full hive at (x, y, z), sheared or bottled: true if it was */
export const hiveDispense: { shear: ((level: Level, x: number, y: number, z: number) => boolean) | null; bottle: ((level: Level, x: number, y: number, z: number) => boolean) | null } = { shear: null, bottle: null };
