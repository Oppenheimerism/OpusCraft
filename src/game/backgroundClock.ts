// (multiplayer) a clock for while the page is hidden (its window minimised, another tab in front, or covered): a hidden
// page gets no animation frames, and its own timers slow to once a second (after five minutes, in Chrome, once a
// minute), but a world open to LAN has to go on at its pace for its guests, and a guest has to keep answering its host
// or be dropped as gone. A worker's timer keeps time regardless, and its messages wake the page.

export class BackgroundClock {
  private worker: Worker | null = null;

  /** `beat` every `ms` from now on (till stop()); false if this browser can't (no workers) */
  start(beat: () => void, ms = 50): boolean {
    if (this.worker) return true;
    try {
      const w = new Worker(new URL('./clockWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = () => beat();
      w.postMessage(ms);
      this.worker = w;
      return true;
    } catch {
      return false;
    }
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
