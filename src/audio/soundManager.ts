// Sound playback (Web Audio) with vanilla-like attenuation, categories and music.

import type { GameOptions } from '../game/options';
import type { Player } from '../entity/player';
import type { Game } from '../game/game';

const SR = 44100;

type Category = 'master' | 'music' | 'blocks' | 'weather' | 'hostile' | 'friendly' | 'players' | 'ambient';

function categoryOf(name: string): Category {
  if (name.startsWith('block.') || name.startsWith('item.')) return 'blocks';
  if (name.startsWith('weather.') || name.startsWith('entity.lightning')) return 'weather';
  if (name.startsWith('ambient.')) return 'ambient';
  if (/entity\.(zombie|skeleton|creeper|spider|enderman|slime|witch|drowned|husk|stray|phantom)/.test(name)) return 'hostile';
  if (name.startsWith('entity.player') || name.startsWith('entity.generic') || name.startsWith('entity.item') || name.startsWith('entity.experience') || name.startsWith('entity.arrow')) return 'players';
  if (name.startsWith('entity.')) return 'friendly';
  if (name.startsWith('ui.')) return 'master';
  return 'master';
}

// alias events not synthesized to ones that are
const ALIASES: [RegExp, string][] = [
  [/^block\.(cherry_wood|bamboo_wood|nether_wood)\./, 'block.wood.'],
  [/^block\.(cherry_leaves|azalea_leaves|azalea|cherry_sapling|sweet_berry_bush|vine|lily_pad|moss|moss_carpet|grass)\./, 'block.grass.'],
  [/^block\.(polished_deepslate|deepslate_bricks|deepslate_tiles)\./, 'block.deepslate.'],
  [/^block\.(calcite|tuff|dripstone_block|stone|copper|spawner|sponge)\./, 'block.stone.'],
  [/^block\.(rooted_dirt)\./, 'block.gravel.'],
  [/^block\.(powder_snow)\./, 'block.snow.'],
  [/^block\.(cobweb)\./, 'block.stone.'],
  [/^block\.(stem|hard_crop)\./, 'block.wood.'],
];

export class SoundManager {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer | null>();
  private readonly pending = new Map<number, (d: Float32Array | null) => void>();
  private worker: Worker | null = null;
  private nextId = 1;
  private variants: Record<string, number> = {};
  private musicCount = 0;
  private listener = { x: 0, y: 0, z: 0, yaw: 0 };
  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private musicPlaying = false;
  private nextSongDelay = 100;
  private menuMusicStarted = false;
  private opts: GameOptions | null = null;
  private moodiness = 0;
  private active: { src: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; x: number; y: number; z: number; vol: number; range: number; cat: Category; ui: boolean }[] = [];
  private musicLoading = false;

  constructor() {
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
  }

  private ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext({ sampleRate: SR });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.worker = new Worker(new URL('./audioWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'ready') {
          this.variants = d.sounds;
          this.musicCount = d.music;
          for (const n of ['ui.button.click', 'block.grass.step', 'block.stone.step', 'block.wood.step', 'block.gravel.step', 'block.sand.step', 'block.grass.break', 'block.stone.break', 'block.wood.break', 'block.gravel.break', 'block.grass.hit', 'block.stone.hit', 'block.wood.hit', 'block.gravel.hit', 'entity.item.pickup', 'block.grass.place', 'block.stone.place', 'block.wood.place']) {
            const v = this.variants[n] ?? 0;
            for (let i = 0; i < v; i++) this.load(n, i);
          }
          return;
        }
        if (d.type === 'data') {
          const cb = this.pending.get(d.id);
          this.pending.delete(d.id);
          cb?.(d.data);
        }
      };
    } catch (e) {
      console.warn('audio unavailable', e);
    }
  }

  private request(msg: Record<string, unknown>): Promise<Float32Array | null> {
    return new Promise((resolve) => {
      if (!this.worker) return resolve(null);
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.worker.postMessage({ ...msg, id, sr: SR });
    });
  }

  private load(name: string, variant: number): void {
    const key = name + '#' + variant;
    if (this.buffers.has(key) || !this.ctx) return;
    this.buffers.set(key, null);
    void this.request({ type: 'sound', name, variant }).then((d) => {
      if (!d || !this.ctx) return;
      const b = this.ctx.createBuffer(1, d.length, SR);
      b.copyToChannel(d as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(key, b);
    });
  }

  private resolveName(name: string): string {
    if (this.variants[name]) return name;
    for (const [re, rep] of ALIASES) {
      if (re.test(name)) {
        const n = name.replace(re, rep);
        if (this.variants[n]) return n;
      }
    }
    return name;
  }

  private catVolume(cat: Category): number {
    const o = this.opts;
    if (!o) return 1;
    const v = { master: 1, music: o.musicVolume, blocks: o.blocksVolume, weather: o.weatherVolume, hostile: o.hostileVolume, friendly: o.friendlyVolume, players: o.playersVolume, ambient: o.ambientVolume }[cat];
    return v * o.masterVolume;
  }

  play(name: string, x: number, y: number, z: number, volume = 1, pitch = 1): void {
    this.start(name, volume, pitch, x, y, z, false);
  }

  playUI(name: string, volume = 1, pitch = 1): void {
    this.start(name, volume, pitch, 0, 0, 0, true);
  }

  private start(name: string, volume: number, pitch: number, x: number, y: number, z: number, ui: boolean): void {
    this.ensure();
    if (!this.ctx || !this.master) return;
    name = this.resolveName(name);
    const n = this.variants[name];
    if (!n) return;
    const v = Math.floor(Math.random() * n);
    const key = name + '#' + v;
    const buf = this.buffers.get(key);
    if (!buf) {
      this.load(name, v);
      // try another loaded variant
      for (let i = 0; i < n; i++) {
        const b2 = this.buffers.get(name + '#' + i);
        if (b2) return this.startBuffer(b2, name, volume, pitch, x, y, z, ui);
      }
      return;
    }
    this.startBuffer(buf, name, volume, pitch, x, y, z, ui);
  }

  private startBuffer(buf: AudioBuffer, name: string, volume: number, pitch: number, x: number, y: number, z: number, ui: boolean): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.5, Math.min(2, pitch));
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    src.connect(gain).connect(pan).connect(this.master!);
    const cat = categoryOf(name);
    const e = { src, gain, pan, x, y, z, vol: Math.min(1, volume), range: 16 * Math.max(1, volume), cat, ui };
    this.applySpatial(e);
    src.start();
    this.active.push(e);
    src.onended = () => {
      const i = this.active.indexOf(e);
      if (i >= 0) this.active.splice(i, 1);
    };
  }

  private applySpatial(e: SoundManager['active'][number]): void {
    let g = e.vol * this.catVolume(e.cat);
    let p = 0;
    if (!e.ui) {
      const l = this.listener;
      const dx = e.x - l.x, dy = e.y - l.y, dz = e.z - l.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      g *= Math.max(0, 1 - d / e.range);
      // pan by angle relative to facing (yaw 0 = +Z)
      const yr = (l.yaw * Math.PI) / 180;
      const rx = -Math.cos(yr), rz = -Math.sin(yr);
      if (d > 0.01) p = Math.max(-1, Math.min(1, ((dx * rx + dz * rz) / d) * 0.8));
    }
    e.gain.gain.value = g;
    e.pan.pan.value = p;
  }

  update(p: Player | null, opts: GameOptions): void {
    this.opts = opts;
    if (p) {
      this.listener.x = p.x;
      this.listener.y = p.y + p.eyeHeight;
      this.listener.z = p.z;
      this.listener.yaw = p.yaw;
    }
    for (const e of this.active) this.applySpatial(e);
    if (this.musicGain) this.musicGain.gain.value = this.catVolume('music') * 0.9;
  }

  /** per game tick: music scheduling and ambience */
  tick(game: Game): void {
    if (!this.ctx) return;
    const p = game.player;
    // game music (vanilla MusicManager: 12000..24000 tick gaps)
    if (!this.musicPlaying && !this.musicLoading && this.musicCount > 0) {
      if (--this.nextSongDelay <= 0) {
        this.nextSongDelay = 12000 + Math.floor(Math.random() * 12000);
        void this.playMusic(Math.floor(Math.random() * this.musicCount));
      }
    }
    // cave ambience (vanilla AmbientSoundHandler mood)
    const w = game.world;
    const bx = Math.floor(p.x), by = Math.floor(p.y + p.eyeHeight), bz = Math.floor(p.z);
    const ox = bx + Math.floor(Math.random() * 17) - 8, oy = by + Math.floor(Math.random() * 17) - 8, oz = bz + Math.floor(Math.random() * 17) - 8;
    const st = w.getState(ox, oy, oz);
    const l = w.getLight(ox, oy, oz);
    if (st === 0) {
      const sky = l >> 4, blk = l & 15;
      if (sky === 0 && blk < 1) this.moodiness += 1 / 6000;
      else this.moodiness -= (Math.max(sky, blk) - 1) / 6000;
      this.moodiness = Math.max(0, Math.min(1, this.moodiness));
      if (this.moodiness >= 1) {
        this.play('ambient.cave', ox + 0.5, oy + 0.5, oz + 0.5, 0.7, 0.8 + Math.random() * 0.2);
        this.moodiness = 0;
      }
    }
    // rain
    const rain = game.level.rainLevel(1);
    if (rain > 0 && Math.random() < rain * 0.15) {
      const rx = bx + Math.floor(Math.random() * 21) - 10, rz = bz + Math.floor(Math.random() * 21) - 10;
      const ry = w.heightAt(rx, rz);
      if (ry <= by + 10) this.play(ry > by + 1 ? 'weather.rain.above' : 'weather.rain', rx + 0.5, ry, rz + 0.5, 0.1 + rain * 0.1, ry > by + 1 ? 0.5 : 1);
    }
  }

  private async playMusic(index: number, menu = false): Promise<void> {
    if (!this.ctx || !this.master) return;
    this.musicLoading = true;
    const d = await this.request(menu ? { type: 'menu' } : { type: 'music', index });
    this.musicLoading = false;
    if (!d || !this.ctx) return;
    const b = this.ctx.createBuffer(1, d.length, SR);
    b.copyToChannel(d as Float32Array<ArrayBuffer>, 0);
    this.stopMusic();
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    const g = this.ctx.createGain();
    g.gain.value = this.catVolume('music') * 0.9;
    src.connect(g).connect(this.master);
    src.start();
    this.musicSource = src;
    this.musicGain = g;
    this.musicPlaying = true;
    src.onended = () => {
      if (this.musicSource === src) {
        this.musicPlaying = false;
        this.musicSource = null;
        if (menu) this.menuMusicStarted = false;
      }
    };
  }

  menuMusic(opts: GameOptions): void {
    this.opts = opts;
    if (!this.ctx || this.menuMusicStarted || this.musicLoading) return;
    if (!this.variants || !Object.keys(this.variants).length) return;
    this.menuMusicStarted = true;
    void this.playMusic(0, true);
  }

  stopMusic(): void {
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {
        /* already stopped */
      }
    }
    this.musicSource = null;
    this.musicPlaying = false;
    this.menuMusicStarted = false;
    this.nextSongDelay = 100;
  }

  stopAll(): void {
    for (const e of this.active) {
      try {
        e.src.stop();
      } catch {
        /* ignore */
      }
    }
    this.active.length = 0;
    this.stopMusic();
  }
}
