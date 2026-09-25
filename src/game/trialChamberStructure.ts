// (trial chambers) Trial chambers in the running game (the structure itself is world/gen/trialChambers.ts): /locate
// structure trial_chambers, and whether a block is inside one of a trial chambers' pieces (vanilla
// StructureManager.getStructureWithPieceAt, as the location predicate of an advancement asks). Laying one out needs
// nothing but the biome noise (its height is fixed and every piece is rigid), so the main thread works them out from
// the world seed on its own, the same as the world generator does.

import { trialChambersLocator, type TrialChambers } from '../world/gen/trialChambers';

let cached: { seed: string; chambers: TrialChambers } | null = null;

/** the Overworld's trial chambers for a world seed */
export function trialChambersFor(seed: string): TrialChambers {
  if (cached?.seed !== seed) cached = { seed, chambers: trialChambersLocator(seed) };
  return cached.chambers;
}

/** vanilla /locate structure trial_chambers: the corner of the nearest one's start chunk (rings of regions out) */
export function locateTrialChambers(seed: string, x: number, z: number): [number, number] | null {
  return trialChambersFor(seed).nearest(x, z);
}

/** whether a block of the Overworld is inside one of the pieces of a trial chambers */
export function inTrialChambers(seed: string, x: number, y: number, z: number): boolean {
  return trialChambersFor(seed).pieceAt(Math.floor(x), Math.floor(y), Math.floor(z));
}
