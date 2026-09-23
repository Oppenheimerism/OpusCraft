// Worker: chunk generation and section meshing.

import '../world/blocks';
import { ChunkGenerator, type GenOutput } from '../world/gen/generator';
import { NetherGenerator } from '../world/gen/nether';
import type { DimensionId } from '../world/dimension';
import { initMesher, meshSection, MeshInput } from '../render/mesher';
import type { SpriteRect } from '../world/models';
import { computeChunkLight } from '../world/lightlocal';

let seed = '';
const gens: Partial<Record<DimensionId, { generate(cx: number, cz: number): GenOutput }>> = {};

/** each dimension's generator, made the first time it's asked for */
function genFor(dim: DimensionId): { generate(cx: number, cz: number): GenOutput } {
  let g = gens[dim];
  if (!g) gens[dim] = g = dim === 'the_nether' ? new NetherGenerator(seed) : new ChunkGenerator(seed);
  return g;
}

interface InitMsg { type: 'init'; seed: string; sprites: Record<string, SpriteRect> }
interface GenMsg { type: 'gen'; id: number; dim: DimensionId; cx: number; cz: number }
interface MeshMsg { type: 'mesh'; id: number; input: MeshInput }
type Msg = InitMsg | GenMsg | MeshMsg;

const ctx = self as unknown as { postMessage(msg: unknown, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent) => void) | null };

ctx.onmessage = (e: MessageEvent) => {
  const m = e.data as Msg;
  try {
    if (m.type === 'init') {
      seed = m.seed;
      genFor('overworld');
      initMesher(m.sprites);
      ctx.postMessage({ type: 'ready' });
    } else if (m.type === 'gen') {
      const t0 = performance.now();
      const out = genFor(m.dim ?? 'overworld').generate(m.cx, m.cz);
      const ms = performance.now() - t0;
      ctx.postMessage(
        { type: 'gen', id: m.id, cx: m.cx, cz: m.cz, blocks: out.blocks, light: out.light, biomes: out.biomes, pending: out.pending, fluidTicks: out.fluidTicks, blockEntities: out.blockEntities, entities: out.entities, postProcess: out.postProcess, caveBiomes: out.caveBiomes, ms },
        out.caveBiomes ? [out.blocks.buffer, out.light.buffer, out.biomes.buffer, out.caveBiomes.buffer] : [out.blocks.buffer, out.light.buffer, out.biomes.buffer],
      );
    } else if ((m as unknown as { type: string }).type === 'light') {
      const lm = m as unknown as { id: number; blocks: Uint16Array; sky: boolean };
      const light = computeChunkLight(lm.blocks, lm.sky !== false);
      ctx.postMessage({ type: 'light', id: lm.id, light }, [light.buffer]);
    } else if (m.type === 'mesh') {
      const out = meshSection(m.input);
      const transfer: Transferable[] = [];
      for (const l of out.layers) if (l) transfer.push(l);
      if (out.centers) transfer.push(out.centers.buffer);
      ctx.postMessage({ type: 'mesh', id: m.id, layers: out.layers, quads: out.quads, centers: out.centers }, transfer);
    }
  } catch (err) {
    ctx.postMessage({ type: 'error', id: (m as GenMsg).id, error: String((err as Error)?.stack ?? err) });
  }
};
