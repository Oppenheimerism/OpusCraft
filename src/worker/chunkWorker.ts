// Worker: chunk generation and section meshing.

import '../world/blocks';
import { ChunkGenerator } from '../world/gen/generator';
import { initMesher, meshSection, MeshInput } from '../render/mesher';
import type { SpriteRect } from '../world/models';
import { computeChunkLight } from '../world/lightlocal';

let gen: ChunkGenerator | null = null;

interface InitMsg { type: 'init'; seed: string; sprites: Record<string, SpriteRect> }
interface GenMsg { type: 'gen'; id: number; cx: number; cz: number }
interface MeshMsg { type: 'mesh'; id: number; input: MeshInput }
type Msg = InitMsg | GenMsg | MeshMsg;

const ctx = self as unknown as { postMessage(msg: unknown, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent) => void) | null };

ctx.onmessage = (e: MessageEvent) => {
  const m = e.data as Msg;
  try {
    if (m.type === 'init') {
      gen = new ChunkGenerator(m.seed);
      initMesher(m.sprites);
      ctx.postMessage({ type: 'ready' });
    } else if (m.type === 'gen') {
      const t0 = performance.now();
      const out = gen!.generate(m.cx, m.cz);
      const ms = performance.now() - t0;
      ctx.postMessage(
        { type: 'gen', id: m.id, cx: m.cx, cz: m.cz, blocks: out.blocks, light: out.light, biomes: out.biomes, pending: out.pending, fluidTicks: out.fluidTicks, blockEntities: out.blockEntities, ms },
        [out.blocks.buffer, out.light.buffer, out.biomes.buffer],
      );
    } else if ((m as unknown as { type: string }).type === 'light') {
      const lm = m as unknown as { id: number; blocks: Uint16Array };
      const light = computeChunkLight(lm.blocks);
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
