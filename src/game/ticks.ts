// Scheduled ticks (vanilla LevelTicks): block and fluid ticks due at a game time. Each game tick the due ones are
// collected (at most 65536) and run in vanilla's drain order: by time, then priority, then the order they were
// scheduled. A position has at most one pending tick of each kind; one already collected for this tick doesn't
// count, so a block can schedule its next tick from inside its own.

/** vanilla TickPriority */
export const enum TickPriority {
  EXTREMELY_HIGH = -3,
  VERY_HIGH = -2,
  HIGH = -1,
  NORMAL = 0,
  LOW = 1,
  VERY_LOW = 2,
  EXTREMELY_LOW = 3,
}

interface Tick {
  x: number;
  y: number;
  z: number;
  /** the block (or fluid) it's for: it runs only if that is still there */
  type: number;
  time: number;
  priority: number;
  sub: number;
  key: string;
}

/** vanilla ScheduledTick.DRAIN_ORDER */
function before(a: Tick, b: Tick): boolean {
  if (a.time !== b.time) return a.time < b.time;
  if (a.priority !== b.priority) return a.priority < b.priority;
  return a.sub < b.sub;
}

/** what the level says about a due tick's position: run it now, keep it waiting (a chunk that isn't ticking), or drop it (unloaded) */
export type TickReadiness = 'run' | 'wait' | 'drop';

export class LevelTicks {
  private readonly heap: Tick[] = [];
  /** scheduled and not yet collected (vanilla LevelChunkTicks.ticksPerPosition) */
  private readonly scheduled = new Set<string>();
  /** collected for this tick and not yet run (vanilla toRunThisTickSet) */
  private readonly toRun = new Set<string>();
  /** vanilla subTickCount */
  private sub = 0;

  private static key(x: number, y: number, z: number, type: number): string {
    return x + ',' + y + ',' + z + ',' + type;
  }

  get size(): number {
    return this.heap.length;
  }

  /** vanilla LevelTicks.schedule: ignored if that position already has one pending for `type` */
  schedule(x: number, y: number, z: number, type: number, time: number, priority = 0): void {
    const key = LevelTicks.key(x, y, z, type);
    if (this.scheduled.has(key)) return;
    this.scheduled.add(key);
    this.push({ x, y, z, type, time, priority, sub: this.sub++, key });
  }

  hasScheduledTick(x: number, y: number, z: number, type: number): boolean {
    return this.scheduled.has(LevelTicks.key(x, y, z, type));
  }

  /** vanilla willTickThisTick: collected for the tick being run */
  willTickThisTick(x: number, y: number, z: number, type: number): boolean {
    return this.toRun.has(LevelTicks.key(x, y, z, type));
  }

  /** vanilla LevelTicks.tick: collect what's due at `time`, then run it in order */
  tick(time: number, max: number, ready: (x: number, z: number) => TickReadiness, run: (x: number, y: number, z: number, type: number) => void): void {
    const batch: Tick[] = [];
    const waiting: Tick[] = [];
    while (this.heap.length && this.heap[0].time <= time && batch.length < max) {
      const t = this.pop();
      const r = ready(t.x, t.z);
      if (r === 'wait') {
        waiting.push(t);
        continue;
      }
      this.scheduled.delete(t.key);
      if (r === 'drop') continue;
      batch.push(t);
      this.toRun.add(t.key);
    }
    for (const t of waiting) this.push(t);
    for (const t of batch) {
      this.toRun.delete(t.key);
      run(t.x, t.y, t.z, t.type);
    }
  }

  clear(): void {
    this.heap.length = 0;
    this.scheduled.clear();
    this.toRun.clear();
  }

  private push(t: Tick): void {
    const h = this.heap;
    let i = h.length;
    h.push(t);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!before(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }

  private pop(): Tick {
    const h = this.heap;
    const top = h[0];
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < h.length && before(h[l], h[m])) m = l;
        if (r < h.length && before(h[r], h[m])) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    }
    return top;
  }
}
