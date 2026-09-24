// End gateways (vanilla TheEndGatewayBlock, TheEndGatewayBlockEntity and
// EndGatewayFeature): the little bedrock-capped portals that open on a ring
// round the main island, one each time the dragon dies, and lead out to the
// End's outer islands (where a gateway back is made on arrival).

import type { Level } from './level';
import { EndGatewayBlockEntity } from '../world/blockEntity';
import { S } from '../world/block';

/**
 * vanilla EndGatewayFeature.place: the gateway in the middle of a 3x5x3, air round it at its own level, bedrock
 * a block above and below in a plus and capping it two above and below, air in the rest; `exit` where it leads
 */
export function placeEndGateway(level: Level, x: number, y: number, z: number, exit: [number, number, number] | null, exact: boolean): void {
  const BEDROCK = S('bedrock'), GATEWAY = S('end_gateway');
  // (vanilla BlockPos.betweenClosed: x fastest, then y, then z)
  for (let bz = z - 1; bz <= z + 1; bz++)
    for (let by = y - 2; by <= y + 2; by++)
      for (let bx = x - 1; bx <= x + 1; bx++) {
        const onX = bx === x, onY = by === y, onZ = bz === z, cap = Math.abs(by - y) === 2;
        if (onX && onY && onZ) {
          level.setBlock(bx, by, bz, GATEWAY);
          const be = level.world.getBlockEntity(bx, by, bz);
          if (exit && be instanceof EndGatewayBlockEntity) {
            be.exitPortal = [...exit];
            be.exactTeleport = exact;
          }
        } else if (onY) level.setBlock(bx, by, bz, 0);
        else if (cap && onX && onZ) level.setBlock(bx, by, bz, BEDROCK);
        else if ((onX || onZ) && !cap) level.setBlock(bx, by, bz, BEDROCK);
        else level.setBlock(bx, by, bz, 0);
      }
}
