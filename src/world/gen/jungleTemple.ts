// Jungle temples (vanilla JungleTempleStructure + JungleTemplePiece): a 12 x 15 temple of cobblestone and mossy
// cobblestone in the jungle, three storeys high, with a stairway from the ground floor down to a cellar. One way
// along the cellar, two tripwires set off dispensers of arrows hidden behind vines on the way to a chest; the other
// way, three levers on chiseled stone bricks work three sticky pistons behind them which, flipped in the right order
// (the lever furthest from the stairs, the nearest, the nearest back, the furthest back), pull a block out of the
// ground floor over a second, hidden chest.

import type { Rand, JavaRandom } from '../../core/rng';
import { S, blockOf } from '../block';
import type { GenContext } from './context';
import { BoundingBox } from './structure';
import { ScatteredPiece, HORIZONTAL } from './templePiece';

const LOOT = 'chests/jungle_temple';
const DISPENSER_LOOT = 'chests/jungle_temple_dispenser';

interface Blocks {
  COBBLE: number;
  MOSSY: number;
  CHISELED: number;
  stairs: (facing: string) => number;
  hook: (facing: string) => number;
  /** attached string, strung along the given sides */
  string: (a: string, b: string) => number;
  /** redstone dust with the given sides ('side', or 'up' where it climbs) */
  wire: (sides: Record<string, string>) => number;
  vine: (side: string) => number;
  lever: number;
  piston: (facing: string) => number;
  repeater: number;
}
let BLK: Blocks | null = null;
function k(): Blocks {
  return (BLK ??= {
    COBBLE: S('cobblestone'), MOSSY: S('mossy_cobblestone'), CHISELED: S('chiseled_stone_bricks'),
    stairs: (facing) => S('cobblestone_stairs', { facing, half: 'bottom', shape: 'straight' }),
    hook: (facing) => S('tripwire_hook', { facing, attached: true }),
    string: (a, b) => S('tripwire', { attached: true, [a]: true, [b]: true }),
    wire: (sides) => S('redstone_wire', sides),
    // (a vine is on its south side unless told otherwise)
    vine: (side) => S('vine', { south: false, [side]: true }),
    lever: S('lever', { face: 'wall', facing: 'north' }),
    piston: (facing) => S('sticky_piston', { facing }),
    repeater: S('repeater', { facing: 'north' }),
  });
}

/** vanilla JungleTemplePiece */
export class JungleTemplePiece extends ScatteredPiece {
  constructor(worldSeed: bigint, r: JavaRandom, x: number, z: number) {
    super(worldSeed, x, 64, z, 12, 10, 15, HORIZONTAL[r.nextInt(4)]);
  }

  /**
   * (vanilla also keeps placedMainChest, placedHiddenChest and placedTrap1/2 so that no chest or dispenser is placed
   * twice by the chunks the temple spans; it never spans more than its start chunk, and a chest or dispenser is only
   * placed where it's in the chunk and isn't there already)
   */
  postProcess(ctx: GenContext, chunk: BoundingBox, r: Rand): void {
    const { COBBLE, MOSSY, CHISELED, stairs, hook, string, wire, vine, lever, piston, repeater } = k();
    // vanilla generateBox with the MossStoneSelector: each block drawn cobblestone (40%) or mossy cobblestone
    const stone = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) this.placeBlock(ctx, r.nextFloat() < 0.4 ? COBBLE : MOSSY, x, y, z, chunk);
    };
    const air = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => this.generateBox(ctx, chunk, x0, y0, z0, x1, y1, z1, 0, 0, false);
    const put = (st: number, x: number, y: number, z: number) => this.placeBlock(ctx, st, x, y, z, chunk);
    const w = this.width, d = this.depth;

    // the foundation, the ground floor's walls and the upper storeys
    stone(0, -4, 0, w - 1, 0, d - 1);
    stone(2, 1, 2, 9, 2, 2);
    stone(2, 1, 12, 9, 2, 12);
    stone(2, 1, 3, 2, 2, 11);
    stone(9, 1, 3, 9, 2, 11);
    stone(1, 3, 1, 10, 6, 1);
    stone(1, 3, 13, 10, 6, 13);
    stone(1, 3, 2, 1, 6, 12);
    stone(10, 3, 2, 10, 6, 12);
    stone(2, 3, 2, 9, 3, 12);
    stone(2, 6, 2, 9, 6, 12);
    stone(3, 7, 3, 8, 7, 11);
    stone(4, 8, 4, 7, 8, 10);
    air(3, 1, 3, 8, 2, 11);
    air(4, 3, 6, 7, 3, 9);
    air(2, 4, 2, 9, 5, 12);
    air(4, 6, 5, 7, 6, 9);
    air(5, 7, 6, 6, 7, 8);
    air(5, 1, 2, 6, 2, 2);
    air(5, 2, 12, 6, 2, 12);
    air(5, 5, 1, 6, 5, 1);
    air(5, 5, 13, 6, 5, 13);
    put(0, 1, 5, 5);
    put(0, 10, 5, 5);
    put(0, 1, 5, 9);
    put(0, 10, 5, 9);
    // the pillars round the outside
    for (let z = 0; z <= 14; z += 14) {
      stone(2, 4, z, 2, 5, z);
      stone(4, 4, z, 4, 5, z);
      stone(7, 4, z, 7, 5, z);
      stone(9, 4, z, 9, 5, z);
    }
    stone(5, 6, 0, 6, 6, 0);
    for (let x = 0; x <= 11; x += 11) {
      for (let z = 2; z <= 12; z += 2) stone(x, 4, z, x, 5, z);
      stone(x, 6, 5, x, 6, 5);
      stone(x, 6, 9, x, 6, 9);
    }
    // the roof
    stone(2, 7, 2, 2, 9, 2);
    stone(9, 7, 2, 9, 9, 2);
    stone(2, 7, 12, 2, 9, 12);
    stone(9, 7, 12, 9, 9, 12);
    stone(4, 9, 4, 4, 9, 4);
    stone(7, 9, 4, 7, 9, 4);
    stone(4, 9, 10, 4, 9, 10);
    stone(7, 9, 10, 7, 9, 10);
    stone(5, 9, 7, 6, 9, 7);
    const E = stairs('east'), W = stairs('west'), So = stairs('south'), N = stairs('north');
    put(N, 5, 9, 6);
    put(N, 6, 9, 6);
    put(So, 5, 9, 8);
    put(So, 6, 9, 8);
    // the steps up to the entrance, and the stairs up either side of the stairwell
    put(N, 4, 0, 0);
    put(N, 5, 0, 0);
    put(N, 6, 0, 0);
    put(N, 7, 0, 0);
    put(N, 4, 1, 8);
    put(N, 4, 2, 9);
    put(N, 4, 3, 10);
    put(N, 7, 1, 8);
    put(N, 7, 2, 9);
    put(N, 7, 3, 10);
    stone(4, 1, 9, 4, 1, 9);
    stone(7, 1, 9, 7, 1, 9);
    stone(4, 1, 10, 7, 2, 10);
    stone(5, 4, 5, 6, 4, 5);
    put(E, 4, 4, 5);
    put(W, 7, 4, 5);
    // the stairway down to the cellar
    for (let i = 0; i < 4; i++) {
      put(So, 5, -i, 6 + i);
      put(So, 6, -i, 6 + i);
      air(5, -i, 7 + i, 6, -i, 9 + i);
    }
    // the cellar's passages
    air(1, -3, 12, 10, -1, 13);
    air(1, -3, 1, 3, -1, 13);
    air(1, -3, 1, 9, -1, 5);
    for (let z = 1; z <= 13; z += 2) stone(1, -3, z, 1, -2, z);
    for (let z = 2; z <= 12; z += 2) stone(1, -1, z, 3, -1, z);
    stone(2, -2, 1, 5, -2, 1);
    stone(7, -2, 1, 9, -2, 1);
    stone(6, -3, 1, 6, -3, 1);
    stone(6, -1, 1, 6, -1, 1);
    // the first trap: string across the passage, dust along the floor to a dispenser at the end of it, behind a vine
    put(hook('east'), 1, -3, 8);
    put(hook('west'), 4, -3, 8);
    put(string('east', 'west'), 2, -3, 8);
    put(string('east', 'west'), 3, -3, 8);
    const NS = wire({ north: 'side', south: 'side' });
    put(NS, 5, -3, 7);
    put(NS, 5, -3, 6);
    put(NS, 5, -3, 5);
    put(NS, 5, -3, 4);
    put(NS, 5, -3, 3);
    put(NS, 5, -3, 2);
    put(wire({ north: 'side', west: 'side' }), 5, -3, 1);
    put(wire({ east: 'side', west: 'side' }), 4, -3, 1);
    put(MOSSY, 3, -3, 1);
    this.createDispenser(ctx, chunk, r, 3, -2, 1, 'north', DISPENSER_LOOT);
    put(vine('south'), 3, -2, 2);
    // the second trap, in front of the chest
    put(hook('north'), 7, -3, 1);
    put(hook('south'), 7, -3, 5);
    put(string('north', 'south'), 7, -3, 2);
    put(string('north', 'south'), 7, -3, 3);
    put(string('north', 'south'), 7, -3, 4);
    put(wire({ east: 'side', west: 'side' }), 8, -3, 6);
    put(wire({ west: 'side', south: 'side' }), 9, -3, 6);
    put(wire({ north: 'side', south: 'up' }), 9, -3, 5);
    put(MOSSY, 9, -3, 4);
    put(NS, 9, -2, 4);
    this.createDispenser(ctx, chunk, r, 9, -2, 3, 'west', DISPENSER_LOOT);
    put(vine('east'), 8, -1, 3);
    put(vine('east'), 8, -2, 3);
    this.createChest(ctx, chunk, r, 8, -3, 3, LOOT);
    put(MOSSY, 9, -3, 2);
    put(MOSSY, 8, -3, 1);
    put(MOSSY, 4, -3, 5);
    put(MOSSY, 5, -2, 5);
    put(MOSSY, 5, -1, 5);
    put(MOSSY, 6, -3, 5);
    put(MOSSY, 7, -2, 5);
    put(MOSSY, 7, -1, 5);
    put(MOSSY, 8, -3, 5);
    stone(9, -1, 1, 9, -1, 5);
    // the lever puzzle and the hidden chest behind it
    air(8, -3, 8, 10, -1, 10);
    put(CHISELED, 8, -2, 11);
    put(CHISELED, 9, -2, 11);
    put(CHISELED, 10, -2, 11);
    put(lever, 8, -2, 12);
    put(lever, 9, -2, 12);
    put(lever, 10, -2, 12);
    stone(8, -3, 8, 8, -3, 10);
    stone(10, -3, 8, 10, -3, 10);
    put(MOSSY, 10, -2, 9);
    put(NS, 8, -2, 9);
    put(NS, 8, -2, 10);
    put(wire({ north: 'side', south: 'side', east: 'side', west: 'side' }), 10, -1, 9);
    put(piston('up'), 9, -2, 8);
    put(piston('west'), 10, -2, 8);
    put(piston('west'), 10, -1, 8);
    put(repeater, 10, -2, 10);
    this.createChest(ctx, chunk, r, 9, -3, 10, LOOT);
  }

  /**
   * vanilla StructurePiece.createDispenser: a dispenser facing a way (turned with the piece) with a loot table (and
   * its seed) at a local position in this chunk; false where it isn't placed here
   */
  private createDispenser(ctx: GenContext, chunk: BoundingBox, r: Rand, x: number, y: number, z: number, facing: string, lootTable: string): boolean {
    const [wx, wy, wz] = this.worldPos(x, y, z);
    if (!chunk.isInside(wx, wy, wz) || blockOf(ctx.getOrAir(wx, wy, wz)).name === 'dispenser') return false;
    this.placeBlock(ctx, S('dispenser', { facing }), x, y, z, chunk);
    ctx.blockEntities.push({ id: 'dispenser', x: wx, y: wy, z: wz, items: [], data: { lootTable, lootSeed: r.nextU32() } });
    return true;
  }
}
