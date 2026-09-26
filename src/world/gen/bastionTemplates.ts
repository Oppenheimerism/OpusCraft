// (bastions) The start pool, bastion/starts (vanilla BastionPieces.START: the four kinds' start pieces, weight 1
// each), and which kind a start piece makes: the housing units (bastionUnits.ts), the hoglin stables
// (bastionStables.ts), the treasure room (bastionTreasure.ts) and the bridge (bastionBridge.ts).

import type { PoolElement } from './jigsaw';
import { bastionPool } from './bastionPieces';
import { UNITS_START } from './bastionUnits';
import { TREASURE_START } from './bastionTreasure';

export const START_POOL = 'bastion/starts';

export type BastionVariant = 'units' | 'hoglin_stable' | 'treasure' | 'bridge';

const VARIANTS = new Map<PoolElement, BastionVariant>([
  [UNITS_START, 'units'],
  [TREASURE_START, 'treasure'],
]);

/** which of the four kinds a start piece makes */
export function variantOf(e: PoolElement): BastionVariant {
  return VARIANTS.get(e) ?? 'units';
}

bastionPool(START_POOL, [[UNITS_START, 1], [TREASURE_START, 1]]);
