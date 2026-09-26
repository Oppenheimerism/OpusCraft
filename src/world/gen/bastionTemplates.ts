// (bastions) The start pool, bastion/starts (vanilla BastionPieces.START: the four kinds' start pieces, weight 1
// each), and which kind a start piece makes: the housing units (bastionUnits.ts), the hoglin stables
// (bastionStables.ts), the treasure room (bastionTreasure.ts) and the bridge (bastionBridge.ts).

import type { PoolElement } from './jigsaw';
import { bastionPool } from './bastionPieces';
import { UNITS_START } from './bastionUnits';
import { STABLES_START } from './bastionStables';
import { TREASURE_START } from './bastionTreasure';
import { BRIDGE_START } from './bastionBridge';

export const START_POOL = 'bastion/starts';

export type BastionVariant = 'units' | 'hoglin_stable' | 'treasure' | 'bridge';

const VARIANTS = new Map<PoolElement, BastionVariant>([
  [UNITS_START, 'units'],
  [STABLES_START, 'hoglin_stable'],
  [TREASURE_START, 'treasure'],
  [BRIDGE_START, 'bridge'],
]);

/** which of the four kinds a start piece makes */
export function variantOf(e: PoolElement): BastionVariant {
  return VARIANTS.get(e) ?? 'units';
}

bastionPool(START_POOL, [[UNITS_START, 1], [STABLES_START, 1], [TREASURE_START, 1], [BRIDGE_START, 1]]);
