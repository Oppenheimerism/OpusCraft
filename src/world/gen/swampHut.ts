// Swamp huts (vanilla SwampHutStructure + SwampHutPiece): a spruce hut on four oak log stilts with a porch, a
// crafting table, a cauldron and a potted red mushroom, and a witch who lives there (placed with the hut and never
// despawning). Inside the hut's box only witches spawn (the structure's spawn_overrides, game/structureSpawns).

import type { Rand, JavaRandom } from '../../core/rng';
import { S } from '../block';
import type { GenContext } from './context';
import { BoundingBox } from './structure';
import { ScatteredPiece, HORIZONTAL } from './templePiece';

interface Blocks {
  PLANKS: number;
  LOG: number;
  FENCE: number;
  POT: number;
  TABLE: number;
  CAULDRON: number;
  stairs: (facing: string, shape?: string) => number;
}
let BLK: Blocks | null = null;
function k(): Blocks {
  return (BLK ??= {
    PLANKS: S('spruce_planks'), LOG: S('oak_log'), FENCE: S('oak_fence'), POT: S('potted_red_mushroom'), TABLE: S('crafting_table'), CAULDRON: S('cauldron'),
    stairs: (facing: string, shape = 'straight') => S('spruce_stairs', { facing, half: 'bottom', shape }),
  });
}

/** vanilla SwampHutPiece */
export class SwampHutPiece extends ScatteredPiece {
  constructor(worldSeed: bigint, r: JavaRandom, x: number, z: number) {
    super(worldSeed, x, 64, z, 7, 7, 9, HORIZONTAL[r.nextInt(4)]);
  }

  postProcess(ctx: GenContext, chunk: BoundingBox, _r: Rand): void {
    const { PLANKS, LOG, FENCE, POT, TABLE, CAULDRON, stairs } = k();
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, st: number) => this.generateBox(ctx, chunk, x0, y0, z0, x1, y1, z1, st, st, false);
    const put = (st: number, x: number, y: number, z: number) => this.placeBlock(ctx, st, x, y, z, chunk);
    box(1, 1, 1, 5, 1, 7, PLANKS);
    box(1, 4, 2, 5, 4, 7, PLANKS);
    box(2, 1, 0, 4, 1, 0, PLANKS);
    box(2, 2, 2, 3, 3, 2, PLANKS);
    box(1, 2, 3, 1, 3, 6, PLANKS);
    box(5, 2, 3, 5, 3, 6, PLANKS);
    box(2, 2, 7, 4, 3, 7, PLANKS);
    box(1, 0, 2, 1, 3, 2, LOG);
    box(5, 0, 2, 5, 3, 2, LOG);
    box(1, 0, 7, 1, 3, 7, LOG);
    box(5, 0, 7, 5, 3, 7, LOG);
    put(FENCE, 2, 3, 2);
    put(FENCE, 3, 3, 7);
    put(0, 1, 3, 4);
    put(0, 5, 3, 4);
    put(0, 5, 3, 5);
    put(POT, 1, 3, 5);
    put(TABLE, 3, 2, 6);
    put(CAULDRON, 4, 2, 6);
    put(FENCE, 1, 2, 1);
    put(FENCE, 5, 2, 1);
    // the roof's eaves
    const N = stairs('north'), E = stairs('east'), W = stairs('west'), So = stairs('south');
    box(0, 4, 1, 6, 4, 1, N);
    box(0, 4, 2, 0, 4, 7, E);
    box(6, 4, 2, 6, 4, 7, W);
    box(0, 4, 8, 6, 4, 8, So);
    put(stairs('north', 'outer_right'), 0, 4, 1);
    put(stairs('north', 'outer_left'), 6, 4, 1);
    put(stairs('south', 'outer_left'), 0, 4, 8);
    put(stairs('south', 'outer_right'), 6, 4, 8);
    // the stilts, down to the ground or the swamp's bed
    for (let z = 2; z <= 7; z += 5) for (let x = 1; x <= 5; x += 4) this.fillColumnDown(ctx, LOG, x, -1, z, chunk);
    // vanilla spawnWitch: persistent, where the chunk holds (2, 2, 5)
    this.addMob(ctx, chunk, 2, 2, 5, { id: 'witch', health: 26, persistent: true });
    this.spawnCat(ctx, chunk);
  }

  /**
   * HOOK(cats): vanilla spawnCat puts a black cat (persistent) at (2, 2, 5) too, finalized as a structure spawn,
   * which makes it a black one in a swamp hut. No cats yet.
   */
  private spawnCat(_ctx: GenContext, _chunk: BoundingBox): void {}
}
