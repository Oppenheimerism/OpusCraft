// (bastions) The start pool, bastion/starts (vanilla BastionPieces.START: the four kinds' start pieces, weight 1
// each), and which kind a start piece makes. WORK IN PROGRESS: only the treasure room's pieces are drawn so far
// (bastionTreasure.ts); the housing units, the hoglin stables and the bridge are still to come, and until they are the
// pool holds the treasure room alone. Nothing imports this yet: bastions are not generated in the world until
// nether.ts is hooked up (see tests/bastions/REPORT.md).

import type { PoolElement } from './jigsaw';
import { bastionPool } from './bastionPieces';
import { TREASURE_START } from './bastionTreasure';

export const START_POOL = 'bastion/starts';

export type BastionVariant = 'units' | 'hoglin_stable' | 'treasure' | 'bridge';

const VARIANTS = new Map<PoolElement, BastionVariant>([[TREASURE_START, 'treasure']]);

/** which of the four kinds a start piece makes */
export function variantOf(e: PoolElement): BastionVariant {
  return VARIANTS.get(e) ?? 'units';
}

// TODO(bastions): add the units (bastion/units/air_base), hoglin stable (bastion/hoglin_stable/air_base) and bridge
// (bastion/bridge/starting_pieces/entrance_base) starts here, weight 1 each, and to VARIANTS.
bastionPool(START_POOL, [[TREASURE_START, 1]]);
