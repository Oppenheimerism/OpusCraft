// Worker pool with pull-based scheduling (the chunk manager decides priority).

import type { SpriteRect } from '../world/models';
import type { MeshInput } from '../render/mesher';
import type { GenResult } from '../world/world';
import type { DimensionId } from '../world/dimension';
import { touchOnly } from '../game/touch';

/**
 * how many workers a pool has: two fewer than the cores, from 2 to 6; on a phone or a tablet 2, as each holds the
 * blocks and the generators (some 70 MB) and a phone's browser throws out a page that takes more than it allows
 */
export function workerCount(): number {
  if (touchOnly()) return 2;
  return Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 2));
}

export interface GenJob {
  type: 'gen';
  dim: DimensionId;
  cx: number;
  cz: number;
  done: (r: GenResult & { ms: number }) => void;
}
export interface MeshJob {
  type: 'mesh';
  input: MeshInput;
  done: (r: { layers: (ArrayBuffer | null)[]; quads: number[]; centers: Float32Array | null }) => void;
}
export interface LightJob {
  type: 'light';
  cx: number;
  cz: number;
  blocks: Uint16Array;
  /** the dimension has sky light */
  sky: boolean;
  done: (light: Uint8Array) => void;
}
export type Job = GenJob | MeshJob | LightJob;

interface W {
  worker: Worker;
  inflight: number;
}

export class WorkerPool {
  private readonly workers: W[] = [];
  private readonly pending = new Map<number, Job>();
  private nextId = 1;
  readonly ready: Promise<void>;
  maxInflight = 2;
  jobSource: (() => Job | null) | null = null;
  stats = { gen: 0, mesh: 0, genMs: 0 };

  constructor(count: number, seed: string, sprites: Record<string, SpriteRect>) {
    const readies: Promise<void>[] = [];
    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' });
      const w: W = { worker, inflight: 0 };
      readies.push(
        new Promise((resolve) => {
          const onReady = (e: MessageEvent) => {
            if (e.data.type === 'ready') {
              worker.removeEventListener('message', onReady);
              resolve();
            }
          };
          worker.addEventListener('message', onReady);
        }),
      );
      worker.addEventListener('message', (e) => this.onMessage(w, e));
      worker.addEventListener('error', (e) => console.error('worker error', e.message, e));
      worker.postMessage({ type: 'init', seed, sprites });
      this.workers.push(w);
    }
    this.ready = Promise.all(readies).then(() => undefined);
  }

  get size(): number {
    return this.workers.length;
  }

  busy(): number {
    let n = 0;
    for (const w of this.workers) n += w.inflight;
    return n;
  }

  private onMessage(w: W, e: MessageEvent): void {
    const d = e.data;
    if (d.type === 'ready') return;
    if (d.type === 'error') {
      console.error('worker job failed', d.error);
      const job = this.pending.get(d.id);
      this.pending.delete(d.id);
      w.inflight--;
      void job;
      this.pump();
      return;
    }
    const job = this.pending.get(d.id);
    this.pending.delete(d.id);
    w.inflight--;
    if (!job) return;
    if (job.type === 'gen' && d.type === 'gen') {
      this.stats.gen++;
      this.stats.genMs += d.ms;
      job.done(d);
    } else if (job.type === 'mesh' && d.type === 'mesh') {
      this.stats.mesh++;
      job.done(d);
    } else if (job.type === 'light' && d.type === 'light') {
      job.done(d.light);
    }
    this.pump();
  }

  pump(): void {
    if (!this.jobSource) return;
    for (let round = 0; round < this.maxInflight; round++) {
      for (const w of this.workers) {
        if (w.inflight > round) continue;
        const job = this.jobSource();
        if (!job) return;
        this.dispatch(w, job);
      }
    }
  }

  private dispatch(w: W, job: Job): void {
    const id = this.nextId++;
    this.pending.set(id, job);
    w.inflight++;
    if (job.type === 'gen') w.worker.postMessage({ type: 'gen', id, dim: job.dim, cx: job.cx, cz: job.cz });
    else if (job.type === 'light') {
      const copy = new Uint16Array(job.blocks);
      w.worker.postMessage({ type: 'light', id, blocks: copy, sky: job.sky }, [copy.buffer]);
    } else {
      const inp = job.input;
      w.worker.postMessage({ type: 'mesh', id, input: inp }, [inp.blocks.buffer, inp.light.buffer, inp.grass.buffer, inp.foliage.buffer, inp.water.buffer]);
    }
  }

  terminate(): void {
    for (const w of this.workers) w.worker.terminate();
  }
}
