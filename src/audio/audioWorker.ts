// Audio synthesis worker: generates sound variants and music tracks on demand.

const ctx = self as unknown as { postMessage(msg: unknown, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent) => void) | null };

type SynthModule = {
  SOUNDS: Record<string, { variants: number; generate(v: number, sr: number): Float32Array }>;
  MUSIC_TRACK_COUNT: number;
  generateMusicTrack(i: number, sr: number): Float32Array;
  generateMenuMusic(sr: number): Float32Array;
  MUSIC_POOLS: Record<string, number>;
  generatePoolMusic(pool: string, i: number, sr: number): Float32Array;
};

let synth: SynthModule | null = null;
const loading = import('./synth').then((m) => {
  synth = m as unknown as SynthModule;
  ctx.postMessage({ type: 'ready', sounds: Object.fromEntries(Object.entries(synth.SOUNDS).map(([k, v]) => [k, v.variants])), music: synth.MUSIC_TRACK_COUNT, pools: synth.MUSIC_POOLS });
});

ctx.onmessage = async (e: MessageEvent) => {
  await loading;
  const m = e.data as { type: string; id: number; name?: string; variant?: number; index?: number; pool?: string; sr: number };
  try {
    let data: Float32Array | null = null;
    if (m.type === 'sound' && synth) {
      const g = synth.SOUNDS[m.name!];
      if (g) data = g.generate(m.variant ?? 0, m.sr);
    } else if (m.type === 'music' && synth) {
      data = synth.generateMusicTrack(m.index ?? 0, m.sr);
    } else if (m.type === 'menu' && synth) {
      data = synth.generateMenuMusic(m.sr);
    } else if (m.type === 'pool' && synth) {
      data = synth.generatePoolMusic(m.pool ?? '', m.index ?? 0, m.sr);
    }
    if (data) ctx.postMessage({ type: 'data', id: m.id, data }, [data.buffer]);
    else ctx.postMessage({ type: 'data', id: m.id, data: null });
  } catch (err) {
    ctx.postMessage({ type: 'data', id: m.id, data: null, error: String(err) });
  }
};
